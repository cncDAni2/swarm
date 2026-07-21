import { BotController } from './BotController.js';

/**
 * Grok-45-max-WP — aggressive duel bot built on SWARM physics only.
 *
 * Physics (Game.js, read-only for prediction):
 *   accel 1.5, friction 0.12, maxSpeed 12, body radius 25
 *   bulletSpeed 21, fireRateDelay 200ms, energy cost 2
 *   powerful when energy > 80 (20 dmg / r=6) else 12 dmg / r=4
 *   energy regen 50/s only after 2s without shooting
 *
 * Controllers only call move() / fireAt() — never mutate stats.
 */
export class Grok45MaxWPBot extends BotController {
    static id = 'grok-45-max-wp';
    static displayName = 'Grok-45-max-WP';

    static BULLET_SPEED = 21;
    static MAX_SPEED = 12;
    static ACCEL = 1.5;
    static FRICTION = 0.12;
    static BODY_RADIUS = 25;
    static FIRE_DELAY_MS = 200;
    static ENERGY_COST = 2;
    static POWERFUL_ENERGY = 80;
    static REGEN_IDLE_MS = 2000;
    static REGEN_PER_SEC = 50;

    // Engagement ranges (pixels).
    static CLOSE_RANGE = 160;
    static MID_RANGE = 280;
    static MAX_FIRE_RANGE = 520;
    static MIN_SAFE_RANGE = 200;
    static MELEE_RANGE = 110;

    // Energy policy thresholds.
    static FULL_ENERGY = 100;
    static HALF_ENERGY = 50;

    // Dodge: body + bullet radius + minimal padding for frame/timing error.
    static DODGE_PADDING = 6;

    start(context) {
        this.context = context;
        this.oppHistory = [];
        this.orbitSign = 1;
        this.aimHypothesisIndex = 0;
        this.lastShotTime = -Infinity;
        this.lastSelfEnergy = 100;
        this.lastOppEnergy = 100;
        this.oppLastShotTime = -Infinity;
        this.selfLastShotTime = -Infinity;
        this.energyMode = 'charge'; // 'charge' | 'burst' | 'aggressive'
        this.dodgeBias = 1;
        this.preferredRange = Grok45MaxWPBot.MID_RANGE;
        this.shotsThisBurst = 0;
    }

    stop() {
        this.context = null;
        this.oppHistory = [];
    }

    update(_deltaTime) {
        if (!this.context) return;

        const state = this.context.getState();
        if (state.matchEnded || state.self.health <= 0) {
            this.context.move(0, 0);
            return;
        }

        this.trackState(state);
        this.updateEnergyMode(state);

        const threats = this.analyzeThreats(state);
        const move = this.chooseMovement(state, threats);
        this.context.move(move.x, move.y);

        if (this.shouldFire(state, threats)) {
            const aim = this.chooseAim(state);
            if (this.context.fireAt(aim.x, aim.y)) {
                this.lastShotTime = state.time;
                this.selfLastShotTime = state.time;
                this.shotsThisBurst += 1;
                this.aimHypothesisIndex = (this.aimHypothesisIndex + 1) % 3;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Tracking
    // -------------------------------------------------------------------------

    trackState(state) {
        const { opponent, self } = state;

        if (opponent.energy < this.lastOppEnergy - 0.5) {
            this.oppLastShotTime = state.time;
        }
        this.lastOppEnergy = opponent.energy;
        this.lastSelfEnergy = self.energy;

        this.oppHistory.push({
            t: state.time,
            x: opponent.x,
            y: opponent.y,
            vx: opponent.vx,
            vy: opponent.vy,
            energy: opponent.energy
        });
        if (this.oppHistory.length > 24) this.oppHistory.shift();

        const underFire = this.enemyIsShooting(state);
        const enemyDry = opponent.energy < 1;

        // Preferred range adapts to pressure and aggression windows.
        let range = Grok45MaxWPBot.MID_RANGE;
        if (enemyDry) {
            range = Grok45MaxWPBot.MELEE_RANGE;
        } else if (underFire) {
            range = Math.max(Grok45MaxWPBot.MIN_SAFE_RANGE + 40, 340);
        } else if (this.energyMode === 'burst' && state.time - this.selfLastShotTime < 400) {
            // After we fire, close the gap so successive shots pack together.
            range = Grok45MaxWPBot.CLOSE_RANGE;
        } else if (this.energyMode === 'charge') {
            range = Grok45MaxWPBot.MID_RANGE + 40;
        }
        this.preferredRange = range;
    }

    enemyIsShooting(state) {
        const recentShot = state.time - this.oppLastShotTime < Grok45MaxWPBot.FIRE_DELAY_MS * 2.5;
        if (recentShot) return true;
        for (const b of state.bullets) {
            if (b.isEnemy) return true;
        }
        return false;
    }

    enemyCannotShoot(state) {
        return state.opponent.energy < 1;
    }

    // -------------------------------------------------------------------------
    // Energy policy
    // -------------------------------------------------------------------------

    updateEnergyMode(state) {
        const { self, opponent } = state;
        const energy = self.energy;
        const enemyDry = this.enemyCannotShoot(state);
        const enemyShooting = this.enemyIsShooting(state);

        // Enemy dry → full aggression regardless of our charge state (if we have ammo).
        if (enemyDry && energy >= 1) {
            this.energyMode = 'aggressive';
            return;
        }

        // Own energy empty → always wait for at least 50% fill.
        if (energy < 1) {
            this.energyMode = 'charge';
            this.shotsThisBurst = 0;
            return;
        }

        if (this.energyMode === 'aggressive' && !enemyDry) {
            // Leave aggressive when enemy reloads; re-evaluate.
            this.energyMode = energy >= Grok45MaxWPBot.FULL_ENERGY - 1 ? 'burst' : 'charge';
            this.shotsThisBurst = 0;
        }

        if (this.energyMode === 'charge') {
            // Wait for 100% regen before opening fire (except enemy dry, handled above).
            // If we were at 0 and just hit 50%, stay charging until full unless finishing.
            if (energy >= Grok45MaxWPBot.FULL_ENERGY - 0.5) {
                this.energyMode = 'burst';
                this.shotsThisBurst = 0;
            }
            return;
        }

        if (this.energyMode === 'burst') {
            // Don't go below 50% while the enemy is shooting at us.
            if (enemyShooting && energy <= Grok45MaxWPBot.HALF_ENERGY) {
                this.energyMode = 'charge';
                this.shotsThisBurst = 0;
                return;
            }
            // Below half without enemy dry → recharge for full dump.
            if (!enemyDry && energy < Grok45MaxWPBot.HALF_ENERGY) {
                this.energyMode = 'charge';
                this.shotsThisBurst = 0;
                return;
            }
            // Spent a full powerful window and still mid-fight: optional rest at low energy.
            if (!enemyDry && energy < Grok45MaxWPBot.ENERGY_COST) {
                this.energyMode = 'charge';
                this.shotsThisBurst = 0;
            }
        }
    }

    shouldFire(state, threats) {
        const { self, opponent } = state;
        if (opponent.health <= 0) return false;
        if (self.energy < 1) return false;

        const dist = Math.hypot(opponent.x - self.x, opponent.y - self.y);

        // Too far: shots are easy to dodge; hold fire and close (or recharge).
        if (dist > Grok45MaxWPBot.MAX_FIRE_RANGE && !this.enemyCannotShoot(state)) {
            return false;
        }

        // Own empty recovery: never shoot below 50% until we have refilled enough.
        // Exception: enemy energy is 0 → dump everything.
        if (this.energyMode === 'charge') {
            if (this.enemyCannotShoot(state) && self.energy >= 1) return true;
            return false;
        }

        if (this.energyMode === 'aggressive') {
            return self.energy >= 1;
        }

        // burst mode
        if (this.enemyIsShooting(state) && self.energy <= Grok45MaxWPBot.HALF_ENERGY) {
            return false;
        }

        // If we just hit 0 recently and climbed only to half, require full before reopening
        // (handled by charge mode). Burst is free to fire.
        return true;
    }

    // -------------------------------------------------------------------------
    // Threat / dodge analysis
    // -------------------------------------------------------------------------

    analyzeThreats(state) {
        const { self, bullets, arena } = state;
        const bodyR = Grok45MaxWPBot.BODY_RADIUS;
        const pad = Grok45MaxWPBot.DODGE_PADDING;
        const hits = [];
        let dodgeX = 0;
        let dodgeY = 0;
        let urgency = 0;
        let nearestT = Infinity;

        for (const bullet of bullets) {
            if (!bullet.isEnemy) continue;

            const bSpeed = Math.hypot(bullet.vx, bullet.vy);
            if (bSpeed < 1e-6) continue;

            // Closest approach in "scale frames" (Game moves bullet by vx * scale).
            const rx = self.x - bullet.x;
            const ry = self.y - bullet.y;
            const tClosest = Math.max(0, (rx * bullet.vx + ry * bullet.vy) / (bSpeed * bSpeed));

            // Ignore bullets already past us.
            if (tClosest > 40) continue;
            const closingDot = rx * bullet.vx + ry * bullet.vy;
            if (closingDot < -bSpeed * 8 && tClosest === 0) continue;

            const closestX = bullet.x + bullet.vx * tClosest;
            const closestY = bullet.y + bullet.vy * tClosest;
            const missDist = Math.hypot(self.x - closestX, self.y - closestY);
            const hitRadius = bodyR + bullet.radius + pad;

            // Only react when the miss is within a tight corridor of a hit.
            if (missDist > hitRadius + 28 && tClosest > 0.5) continue;

            const danger = Math.max(0, 1 - missDist / (hitRadius + 32))
                * (1 / (0.05 + tClosest * 0.1));
            hits.push({ bullet, tClosest, missDist, danger, hitRadius });
            nearestT = Math.min(nearestT, tClosest);

            // Perpendicular escape: one orbit direction around the enemy when possible.
            const ux = bullet.vx / bSpeed;
            const uy = bullet.vy / bSpeed;
            let px = -uy;
            let py = ux;

            // Prefer the side that already increases miss distance.
            let side = Math.sign((self.x - closestX) * px + (self.y - closestY) * py);
            if (!side) {
                // Fall back to consistent orbit sign around the opponent.
                side = this.orbitSign || this.dodgeBias;
                this.dodgeBias *= -1;
            }
            px *= side;
            py *= side;

            // Small radial component away from bullet when impact is imminent.
            const awayScale = tClosest < 3 ? 0.65 : 0.15;
            const rLen = Math.hypot(rx, ry) || 1;
            const awayX = rx / rLen;
            const awayY = ry / rLen;

            // Wall-aware: never dodge into a border.
            const margin = 80;
            if (self.x < margin && px < 0) px = Math.abs(px);
            if (self.x > arena.width - margin && px > 0) px = -Math.abs(px);
            if (self.y < margin && py < 0) py = Math.abs(py);
            if (self.y > arena.height - margin && py > 0) py = -Math.abs(py);

            const weight = danger;
            dodgeX += (px + awayX * awayScale) * weight;
            dodgeY += (py + awayY * awayScale) * weight;
            urgency = Math.max(urgency, danger);
        }

        hits.sort((a, b) => b.danger - a.danger);
        return { hits, dodgeX, dodgeY, urgency, nearestT };
    }

    // -------------------------------------------------------------------------
    // Movement
    // -------------------------------------------------------------------------

    chooseMovement(state, threats) {
        const { self, opponent, arena } = state;
        let mx = 0;
        let my = 0;

        const dx = opponent.x - self.x;
        const dy = opponent.y - self.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const enemyShooting = this.enemyIsShooting(state);
        const enemyDry = this.enemyCannotShoot(state);

        // 1) Precise bullet dodge — highest priority, commit when urgency is high.
        if (threats.urgency > 0.2) {
            const dLen = Math.hypot(threats.dodgeX, threats.dodgeY);
            if (dLen > 1e-6) {
                const commit = Math.min(3.5, 1.3 + threats.urgency);
                mx += (threats.dodgeX / dLen) * commit;
                my += (threats.dodgeY / dLen) * commit;
            }
        }

        // 2) When enemy fires: open distance (move backward) so shots are easier to dodge.
        //    Near the map edge, bypass the enemy in a circle instead of backing into a wall.
        if (enemyShooting && !enemyDry) {
            const edgeRisk = this.edgePressure(self, arena, 100);
            if (edgeRisk > 0.55) {
                // Circular bypass around the enemy toward arena center.
                const toCenterX = arena.width * 0.5 - self.x;
                const toCenterY = arena.height * 0.5 - self.y;
                const orbit = this.pickOrbitDirection(self, opponent, arena);
                this.orbitSign = orbit;
                mx += -ny * orbit * 1.25 + (toCenterX / (Math.hypot(toCenterX, toCenterY) || 1)) * 0.9;
                my += nx * orbit * 1.25 + (toCenterY / (Math.hypot(toCenterX, toCenterY) || 1)) * 0.9;
            } else {
                mx -= nx * 1.35;
                my -= ny * 1.35;
                // Keep one-direction circular component while retreating.
                const orbit = this.orbitSign;
                mx += -ny * orbit * 0.85;
                my += nx * orbit * 0.85;
            }
        }

        // 3) Enemy energy 0 → close as hard as possible and stay glued.
        if (enemyDry) {
            mx += nx * 1.8;
            my += ny * 1.8;
        }

        // 4) Range control toward preferred distance.
        const rangeError = dist - this.preferredRange;
        if (Math.abs(rangeError) > 22 && !enemyDry) {
            // When we are shooting (burst), bias inward to pack shots.
            let pull = Math.max(-1.25, Math.min(1.25, rangeError / 150));
            if (this.energyMode === 'burst' && state.time - this.selfLastShotTime < 350) {
                pull = Math.min(pull, -0.35); // force slight close
            }
            mx += nx * pull;
            my += ny * pull;
        }

        // 5) Orbit / circle strafe — one stable direction, hard to track.
        {
            const orbit = this.pickOrbitDirection(self, opponent, arena);
            this.orbitSign = orbit;
            let sx = -ny * orbit;
            let sy = nx * orbit;

            // Lead orbit slightly into opponent motion for better angles.
            const oppSpeed = Math.hypot(opponent.vx, opponent.vy);
            if (oppSpeed > 0.6) {
                const ovx = opponent.vx / oppSpeed;
                const ovy = opponent.vy / oppSpeed;
                sx = sx * 0.7 + ovx * 0.3 * orbit;
                sy = sy * 0.7 + ovy * 0.3 * orbit;
            }

            const strafeW = threats.urgency > 1.5 ? 0.3 : enemyShooting ? 0.7 : 1.0;
            mx += sx * strafeW;
            my += sy * strafeW;
        }

        // 6) Rule the middle — soft attraction to arena center, strong wall rejection.
        {
            const cx = arena.width * 0.5;
            const cy = arena.height * 0.5;
            const toCx = cx - self.x;
            const toCy = cy - self.y;
            const cDist = Math.hypot(toCx, toCy) || 1;
            // Stronger center pull when far from middle.
            const centerPull = Math.min(0.85, (cDist / Math.min(arena.width, arena.height)) * 1.4);
            mx += (toCx / cDist) * centerPull * 0.55;
            my += (toCy / cDist) * centerPull * 0.55;

            const soft = 90;
            const hard = 45;
            if (self.x < soft) mx += (soft - self.x) / soft * 1.2;
            if (self.x > arena.width - soft) mx -= (self.x - (arena.width - soft)) / soft * 1.2;
            if (self.y < soft) my += (soft - self.y) / soft * 1.2;
            if (self.y > arena.height - soft) my -= (self.y - (arena.height - soft)) / soft * 1.2;
            if (self.x < hard) mx += 1.6;
            if (self.x > arena.width - hard) mx -= 1.6;
            if (self.y < hard) my += 1.6;
            if (self.y > arena.height - hard) my -= 1.6;
        }

        // 7) Separation if overlapping.
        if (dist < Grok45MaxWPBot.BODY_RADIUS * 2 + 6) {
            mx -= nx * 1.6;
            my -= ny * 1.6;
        }

        // Imminent bullet: pure dodge vector, cancel everything else.
        if (threats.urgency > 2.8 && threats.hits.length > 0) {
            const dLen = Math.hypot(threats.dodgeX, threats.dodgeY);
            if (dLen > 1e-6) {
                return { x: threats.dodgeX / dLen, y: threats.dodgeY / dLen };
            }
        }

        const len = Math.hypot(mx, my);
        if (len < 1e-6) {
            const t = state.time * 0.01;
            return { x: Math.cos(t) * 0.45, y: Math.sin(t * 1.27) * 0.45 };
        }
        return { x: mx / len, y: my / len };
    }

    edgePressure(self, arena, margin) {
        const left = Math.max(0, (margin - self.x) / margin);
        const right = Math.max(0, (self.x - (arena.width - margin)) / margin);
        const top = Math.max(0, (margin - self.y) / margin);
        const bottom = Math.max(0, (self.y - (arena.height - margin)) / margin);
        return Math.max(left, right, top, bottom);
    }

    pickOrbitDirection(self, opponent, arena) {
        // Keep a stable orbit, but flip if the current side drives into a wall.
        const dx = opponent.x - self.x;
        const dy = opponent.y - self.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        const trySide = (sign) => {
            const sx = self.x + (-ny * sign) * 80;
            const sy = self.y + (nx * sign) * 80;
            const m = 50;
            let score = 0;
            if (sx < m || sx > arena.width - m) score -= 2;
            if (sy < m || sy > arena.height - m) score -= 2;
            // Prefer side closer to arena center.
            const cx = arena.width * 0.5;
            const cy = arena.height * 0.5;
            score -= Math.hypot(sx - cx, sy - cy) * 0.002;
            return score;
        };

        const sPos = trySide(1);
        const sNeg = trySide(-1);
        if (sPos > sNeg + 0.15) return 1;
        if (sNeg > sPos + 0.15) return -1;
        return this.orbitSign || 1;
    }

    // -------------------------------------------------------------------------
    // Aiming / prediction
    // -------------------------------------------------------------------------

    estimateMotion(state) {
        const { opponent } = state;
        let vx = opponent.vx;
        let vy = opponent.vy;
        let ax = 0;
        let ay = 0;

        if (this.oppHistory.length >= 3) {
            const a = this.oppHistory[this.oppHistory.length - 1];
            const b = this.oppHistory[Math.max(0, this.oppHistory.length - 4)];
            const dtScale = Math.max(1, (a.t - b.t) / 16);
            const mx = (a.x - b.x) / dtScale;
            const my = (a.y - b.y) / dtScale;
            vx = vx * 0.5 + mx * 0.5;
            vy = vy * 0.5 + my * 0.5;
        }

        if (this.oppHistory.length >= 6) {
            const recent = this.oppHistory[this.oppHistory.length - 1];
            const older = this.oppHistory[this.oppHistory.length - 6];
            const dtScale = Math.max(1, (recent.t - older.t) / 16);
            ax = (recent.vx - older.vx) / dtScale;
            ay = (recent.vy - older.vy) / dtScale;
        }

        // Clamp accel estimate to physical max (accel per scale frame, with friction).
        const maxA = Grok45MaxWPBot.ACCEL;
        const aLen = Math.hypot(ax, ay);
        if (aLen > maxA) {
            ax = (ax / aLen) * maxA;
            ay = (ay / aLen) * maxA;
        }

        const speed = Math.hypot(vx, vy);
        if (speed > Grok45MaxWPBot.MAX_SPEED) {
            vx = (vx / speed) * Grok45MaxWPBot.MAX_SPEED;
            vy = (vy / speed) * Grok45MaxWPBot.MAX_SPEED;
        }

        return { vx, vy, ax, ay };
    }

    /**
     * Simulate opponent kinematics for `frames` scale-frames under a control mode.
     * Modes:
     *   'coast'     — no input, only friction (stopping takes time)
     *   'accel'     — full accel along current velocity (or last facing)
     *   'reverse'   — full accel opposite current velocity
     *   'turn'      — accel perpendicular to velocity (orbit / strafe)
     */
    simulateOpponent(oppX, oppY, motion, frames, mode) {
        let x = oppX;
        let y = oppY;
        let vx = motion.vx;
        let vy = motion.vy;
        const maxSpeed = Grok45MaxWPBot.MAX_SPEED;
        const accel = Grok45MaxWPBot.ACCEL;
        const friction = Grok45MaxWPBot.FRICTION;

        let dirX = vx;
        let dirY = vy;
        const speed0 = Math.hypot(vx, vy);
        if (speed0 < 0.35) {
            // Nearly stopped: use estimated accel direction if any.
            dirX = motion.ax;
            dirY = motion.ay;
            if (Math.hypot(dirX, dirY) < 1e-6) {
                dirX = 1;
                dirY = 0;
            }
        }

        const dLen = Math.hypot(dirX, dirY) || 1;
        dirX /= dLen;
        dirY /= dLen;

        for (let i = 0; i < frames; i++) {
            let ix = 0;
            let iy = 0;
            if (mode === 'accel') {
                ix = dirX;
                iy = dirY;
            } else if (mode === 'reverse') {
                ix = -dirX;
                iy = -dirY;
            } else if (mode === 'turn') {
                // Perpendicular turn (consistent with our orbit sign).
                ix = -dirY * this.orbitSign;
                iy = dirX * this.orbitSign;
            }
            // 'coast' leaves ix, iy at 0

            if (ix !== 0 || iy !== 0) {
                const m = Math.hypot(ix, iy) || 1;
                vx += (ix / m) * accel;
                vy += (iy / m) * accel;
            }

            const fr = Math.max(0, 1 - friction);
            vx *= fr;
            vy *= fr;
            const sp = Math.hypot(vx, vy);
            if (sp > maxSpeed) {
                vx = (vx / sp) * maxSpeed;
                vy = (vy / sp) * maxSpeed;
            }
            x += vx;
            y += vy;
        }

        return { x, y, vx, vy };
    }

    interceptTime(self, targetX, targetY, vel, bulletSpeed) {
        const px = targetX - self.x;
        const py = targetY - self.y;
        const vx = vel.vx;
        const vy = vel.vy;
        const s2 = bulletSpeed * bulletSpeed;
        const a = vx * vx + vy * vy - s2;
        const b = 2 * (px * vx + py * vy);
        const c = px * px + py * py;

        let t = Math.hypot(px, py) / bulletSpeed;
        if (Math.abs(a) < 1e-8) {
            if (Math.abs(b) > 1e-8) {
                const tLinear = -c / b;
                if (tLinear > 0) t = tLinear;
            }
        } else {
            const disc = b * b - 4 * a * c;
            if (disc >= 0) {
                const root = Math.sqrt(disc);
                const t1 = (-b - root) / (2 * a);
                const t2 = (-b + root) / (2 * a);
                const candidates = [t1, t2].filter(v => v > 0.05);
                if (candidates.length) t = Math.min(...candidates);
            }
        }
        return Math.max(0.05, Math.min(t, 90));
    }

    clampToArena(x, y, arena) {
        const pad = Grok45MaxWPBot.BODY_RADIUS;
        return {
            x: Math.max(pad, Math.min(arena.width - pad, x)),
            y: Math.max(pad, Math.min(arena.height - pad, y))
        };
    }

    /**
     * Build three aim hypotheses for mid/long range:
     *  0) coast / current velocity intercept (with light accel blend)
     *  1) accelerating to max speed along heading
     *  2) reverse / brake
     * Each accounts for body radius (aim at center of predicted body).
     * At close range, only the geometric center of the bot is used.
     */
    chooseAim(state) {
        const { self, opponent, arena } = state;
        const dist = Math.hypot(opponent.x - self.x, opponent.y - self.y);
        const bulletSpeed = Grok45MaxWPBot.BULLET_SPEED;
        const motion = this.estimateMotion(state);

        // Close: only the middle of the bot.
        if (dist <= Grok45MaxWPBot.CLOSE_RANGE) {
            return { x: opponent.x, y: opponent.y };
        }

        const hypotheses = this.buildAimHypotheses(self, opponent, arena, motion, bulletSpeed);
        const pick = hypotheses[this.aimHypothesisIndex % hypotheses.length];
        return { x: pick.x, y: pick.y };
    }

    buildAimHypotheses(self, opponent, arena, motion, bulletSpeed) {
        const modes = ['coast', 'accel', 'reverse'];
        const results = [];

        for (const mode of modes) {
            // Seed with a rough flight-time estimate, then refine with simulation.
            const roughT = Math.hypot(opponent.x - self.x, opponent.y - self.y) / bulletSpeed;
            const frames = Math.max(1, Math.min(60, Math.round(roughT)));

            const sim = this.simulateOpponent(opponent.x, opponent.y, motion, frames, mode);
            const vel = { vx: sim.vx, vy: sim.vy };

            // Closed-form intercept from simulated pose, then one re-sim at that time.
            let t = this.interceptTime(self, sim.x, sim.y, vel, bulletSpeed);
            const frames2 = Math.max(1, Math.min(60, Math.round(t)));
            const sim2 = this.simulateOpponent(opponent.x, opponent.y, motion, frames2, mode);
            t = this.interceptTime(self, sim2.x, sim2.y, { vx: sim2.vx, vy: sim2.vy }, bulletSpeed);

            // Final predicted center (body midpoint).
            const frames3 = Math.max(1, Math.min(60, Math.round(t)));
            const final = this.simulateOpponent(opponent.x, opponent.y, motion, frames3, mode);
            const clamped = this.clampToArena(final.x, final.y, arena);

            // Wall slide: if prediction hit a wall, zero outward velocity component.
            if (clamped.x !== final.x || clamped.y !== final.y) {
                let rvx = final.vx;
                let rvy = final.vy;
                if (final.x !== clamped.x) rvx = 0;
                if (final.y !== clamped.y) rvy = 0;
                const tw = this.interceptTime(
                    self,
                    opponent.x,
                    opponent.y,
                    { vx: rvx, vy: rvy },
                    bulletSpeed
                );
                const wallPos = this.clampToArena(
                    opponent.x + rvx * tw,
                    opponent.y + rvy * tw,
                    arena
                );
                results.push({ x: wallPos.x, y: wallPos.y, mode });
            } else {
                results.push({ x: clamped.x, y: clamped.y, mode });
            }
        }

        // Blend a pure current-velocity intercept into hypothesis 0 for stability.
        const t0 = this.interceptTime(
            self,
            opponent.x,
            opponent.y,
            { vx: motion.vx, vy: motion.vy },
            bulletSpeed
        );
        // Add accel component for short window (moving and stopping take time).
        const leadX = opponent.x + motion.vx * t0 + 0.5 * motion.ax * t0 * t0;
        const leadY = opponent.y + motion.vy * t0 + 0.5 * motion.ay * t0 * t0;
        const leadClamp = this.clampToArena(leadX, leadY, arena);
        results[0] = {
            x: results[0].x * 0.45 + leadClamp.x * 0.55,
            y: results[0].y * 0.45 + leadClamp.y * 0.55,
            mode: 'coast'
        };

        return results;
    }
}
