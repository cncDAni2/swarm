import { BotController } from './BotController.js';

/**
 * Competitive duel bot tuned to SWARM physics (from Game.js only):
 * - accel 1.5, friction 0.12, maxSpeed 12, size 50
 * - bulletSpeed 21, fireRateDelay 200ms, energy cost 2
 * - powerful shot when energy > 80 (20 dmg / r=6) else 12 dmg / r=4
 * - energy regen 50/s only after 2s idle
 *
 * Controllers only steer and aim via move() / fireAt().
 */
export class Grok45MaxBot extends BotController {
    static id = 'grok-45-max';
    static displayName = 'Grok 4.5 Max';

    // Physics constants mirrored from Game for prediction only (not mutated).
    static BULLET_SPEED = 21;
    static MAX_SPEED = 12;
    static ACCEL = 1.5;
    static FRICTION = 0.12;
    static BODY_RADIUS = 25;
    static FIRE_DELAY_MS = 200;
    static POWERFUL_ENERGY = 80;

    start(context) {
        this.context = context;
        this.oppHistory = [];
        this.strafeSign = 1;
        this.nextStrafeFlip = 0;
        this.lastShotTime = -Infinity;
        this.preferredRange = 280;
        this.dodgeBias = 1;
    }

    stop() {
        this.context = null;
        this.oppHistory = [];
    }

    update(deltaTime) {
        if (!this.context) return;

        const state = this.context.getState();
        if (state.matchEnded || state.self.health <= 0) {
            this.context.move(0, 0);
            return;
        }

        this.trackOpponent(state);

        const threats = this.analyzeThreats(state);
        const move = this.chooseMovement(state, threats);
        this.context.move(move.x, move.y);

        const aim = this.chooseAim(state, threats);
        if (this.shouldFire(state, aim, threats)) {
            if (this.context.fireAt(aim.x, aim.y)) {
                this.lastShotTime = state.time;
            }
        }
    }

    trackOpponent(state) {
        const { opponent } = state;
        const sample = {
            t: state.time,
            x: opponent.x,
            y: opponent.y,
            vx: opponent.vx,
            vy: opponent.vy
        };
        this.oppHistory.push(sample);
        if (this.oppHistory.length > 18) this.oppHistory.shift();

        // Adaptive preferred range: close when ahead or opponent low energy, open when pressured.
        const healthLead = state.self.health - opponent.health;
        const underFire = this.countImminentThreats(state) > 0;
        let range = 280;
        if (healthLead > 20) range = 340;
        else if (healthLead < -20) range = 220;
        if (opponent.energy < 20) range = Math.min(range, 240);
        if (underFire) range = Math.min(range + 40, 400);
        if (state.self.energy > Grok45MaxBot.POWERFUL_ENERGY) range = Math.max(200, range - 30);
        this.preferredRange = range;

        // Flip strafe on a semi-random cadence so aimers cannot lock a pure circle.
        if (state.time >= this.nextStrafeFlip) {
            this.strafeSign *= -1;
            const jitter = 280 + Math.floor(Math.abs(Math.sin(state.time * 0.0017)) * 420);
            this.nextStrafeFlip = state.time + jitter;
        }

        // Nudge range slightly with time so stalemate orbits drift.
        this.preferredRange += Math.sin(state.time * 0.0021) * 18;
    }

    analyzeThreats(state) {
        const { self, bullets, arena } = state;
        const radius = Grok45MaxBot.BODY_RADIUS;
        const hits = [];
        let dodgeX = 0;
        let dodgeY = 0;
        let urgency = 0;

        for (const bullet of bullets) {
            if (!bullet.isEnemy) continue;

            const bSpeed = Math.hypot(bullet.vx, bullet.vy);
            if (bSpeed < 1e-6) continue;

            // Work in "scale units" where velocities match Game's per-scale motion.
            const rx = self.x - bullet.x;
            const ry = self.y - bullet.y;
            const closing = (rx * bullet.vx + ry * bullet.vy) / (bSpeed * bSpeed);

            // Only care about bullets still approaching or very near.
            if (closing < -4) continue;

            const tClosest = Math.max(0, closing);
            const closestX = bullet.x + bullet.vx * tClosest;
            const closestY = bullet.y + bullet.vy * tClosest;
            const missDist = Math.hypot(self.x - closestX, self.y - closestY);
            const hitRadius = radius + bullet.radius + 10;

            if (missDist > hitRadius + 36 && tClosest > 0) continue;

            const timeMs = tClosest * 16;
            const danger = Math.max(0, 1 - missDist / (hitRadius + 40)) * (1 / (0.08 + tClosest * 0.12));
            hits.push({ bullet, tClosest, missDist, danger, timeMs });

            // Perpendicular dodge: pick the side with more arena room and that increases miss distance.
            const ux = bullet.vx / bSpeed;
            const uy = bullet.vy / bSpeed;
            let px = -uy;
            let py = ux;

            // Side that moves away from the bullet's projected path relative to current offset.
            let side = Math.sign((self.x - closestX) * px + (self.y - closestY) * py);
            if (!side) {
                this.dodgeBias *= -1;
                side = this.dodgeBias;
            }
            px *= side;
            py *= side;

            // Bias dodge toward open space near walls.
            const margin = 90;
            if (self.x < margin && px < 0) px = Math.abs(px);
            if (self.x > arena.width - margin && px > 0) px = -Math.abs(px);
            if (self.y < margin && py < 0) py = Math.abs(py);
            if (self.y > arena.height - margin && py > 0) py = -Math.abs(py);

            // Add a small component away from the bullet itself when almost on top of us.
            const awayScale = tClosest < 4 ? 0.55 : 0.2;
            const awayX = rx / (Math.hypot(rx, ry) + 1e-6);
            const awayY = ry / (Math.hypot(rx, ry) + 1e-6);

            const weight = danger;
            dodgeX += (px + awayX * awayScale) * weight;
            dodgeY += (py + awayY * awayScale) * weight;
            urgency = Math.max(urgency, danger);
        }

        hits.sort((a, b) => b.danger - a.danger);
        return { hits, dodgeX, dodgeY, urgency };
    }

    countImminentThreats(state) {
        let n = 0;
        for (const b of state.bullets) {
            if (!b.isEnemy) continue;
            const bSpeed = Math.hypot(b.vx, b.vy);
            if (bSpeed < 1e-6) continue;
            const rx = state.self.x - b.x;
            const ry = state.self.y - b.y;
            const t = (rx * b.vx + ry * b.vy) / (bSpeed * bSpeed);
            if (t < 0 || t > 18) continue;
            const cx = b.x + b.vx * t;
            const cy = b.y + b.vy * t;
            if (Math.hypot(state.self.x - cx, state.self.y - cy) < Grok45MaxBot.BODY_RADIUS + b.radius + 18) {
                n += 1;
            }
        }
        return n;
    }

    chooseMovement(state, threats) {
        const { self, opponent, arena } = state;
        let mx = 0;
        let my = 0;

        // --- 1) Bullet survival (highest priority) ---
        if (threats.urgency > 0.15) {
            const dLen = Math.hypot(threats.dodgeX, threats.dodgeY);
            if (dLen > 1e-6) {
                mx += (threats.dodgeX / dLen) * Math.min(3.2, 1.2 + threats.urgency);
                my += (threats.dodgeY / dLen) * Math.min(3.2, 1.2 + threats.urgency);
            }
        }

        // --- 2) Optimal range control ---
        const dx = opponent.x - self.x;
        const dy = opponent.y - self.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const rangeError = dist - this.preferredRange;

        // Approach / retreat with soft deadzone so we can strafe cleanly at range.
        if (Math.abs(rangeError) > 28) {
            const rangePull = Math.max(-1.15, Math.min(1.15, rangeError / 160));
            mx += nx * rangePull;
            my += ny * rangePull;
        }

        // --- 3) Lateral orbit (hard to hit, keeps guns on target) ---
        // Predict opponent aim line (from them toward us) and stay off it.
        const oppSpeed = Math.hypot(opponent.vx, opponent.vy);
        let aimThreatX = nx;
        let aimThreatY = ny;
        if (oppSpeed > 0.4) {
            // If they are strafing, bias our orbit against their velocity projection.
            aimThreatX = nx;
            aimThreatY = ny;
        }
        let sx = -aimThreatY * this.strafeSign;
        let sy = aimThreatX * this.strafeSign;

        // Lead the orbit slightly into opponent motion so we cut angles for our shots.
        if (oppSpeed > 0.5) {
            const ovx = opponent.vx / oppSpeed;
            const ovy = opponent.vy / oppSpeed;
            const lead = 0.35;
            sx = sx * (1 - lead) + ovx * lead * this.strafeSign;
            sy = sy * (1 - lead) + ovy * lead * this.strafeSign;
        }

        const strafeWeight = threats.urgency > 1.2 ? 0.35 : 0.95;
        mx += sx * strafeWeight;
        my += sy * strafeWeight;

        // --- 4) Wall pressure relief (preserve escape lanes) ---
        const pad = 70;
        if (self.x < pad) mx += (pad - self.x) / pad;
        if (self.x > arena.width - pad) mx -= (self.x - (arena.width - pad)) / pad;
        if (self.y < pad) my += (pad - self.y) / pad;
        if (self.y > arena.height - pad) my -= (self.y - (arena.height - pad)) / pad;

        // Stronger push when very close to the border.
        const hard = 40;
        if (self.x < hard) mx += 1.4;
        if (self.x > arena.width - hard) mx -= 1.4;
        if (self.y < hard) my += 1.4;
        if (self.y > arena.height - hard) my -= 1.4;

        // --- 5) Separation if nearly overlapping (rare but messy) ---
        if (dist < Grok45MaxBot.BODY_RADIUS * 2 + 8) {
            mx -= nx * 1.5;
            my -= ny * 1.5;
        }

        // --- 6) Velocity shaping: don't waste input fighting max-speed clamp poorly ---
        // Prefer directions that keep us near maxSpeed laterally rather than braking into walls.
        const len = Math.hypot(mx, my);
        if (len < 1e-6) {
            // Idle micro-juke so we never sit still for easy shots.
            const t = state.time * 0.01;
            return { x: Math.cos(t) * 0.4, y: Math.sin(t * 1.3) * 0.4 };
        }

        // When a bullet is extremely close, commit fully to dodge (cancel range desire).
        if (threats.urgency > 2.5 && threats.hits.length > 0) {
            const dLen = Math.hypot(threats.dodgeX, threats.dodgeY);
            if (dLen > 1e-6) {
                return { x: threats.dodgeX / dLen, y: threats.dodgeY / dLen };
            }
        }

        return { x: mx / len, y: my / len };
    }

    estimateOpponentVelocity(state) {
        const { opponent } = state;
        // Blend reported velocity with finite-difference history for smoother lead.
        let hx = opponent.vx;
        let hy = opponent.vy;

        if (this.oppHistory.length >= 3) {
            const a = this.oppHistory[this.oppHistory.length - 1];
            const b = this.oppHistory[Math.max(0, this.oppHistory.length - 4)];
            const dtScale = Math.max(1, (a.t - b.t) / 16);
            const mx = (a.x - b.x) / dtScale;
            const my = (a.y - b.y) / dtScale;
            hx = hx * 0.55 + mx * 0.45;
            hy = hy * 0.55 + my * 0.45;
        }

        // Light acceleration estimate from recent samples.
        if (this.oppHistory.length >= 6) {
            const recent = this.oppHistory[this.oppHistory.length - 1];
            const older = this.oppHistory[this.oppHistory.length - 6];
            const dtScale = Math.max(1, (recent.t - older.t) / 16);
            const ax = (recent.vx - older.vx) / dtScale;
            const ay = (recent.vy - older.vy) / dtScale;
            // Project a short accel window (enemies reverse often; keep modest).
            hx += ax * 2.2;
            hy += ay * 2.2;
        }

        const speed = Math.hypot(hx, hy);
        if (speed > Grok45MaxBot.MAX_SPEED) {
            hx = (hx / speed) * Grok45MaxBot.MAX_SPEED;
            hy = (hy / speed) * Grok45MaxBot.MAX_SPEED;
        }
        return { vx: hx, vy: hy };
    }

    /**
     * Closed-form intercept time for constant-velocity target, then refine.
     * Solves |p + v*t| = s*t for relative position p and relative velocity v
     * when shooter is treated as stationary at fire instant (bullets ignore shooter motion).
     */
    interceptTime(self, oppX, oppY, vel, bulletSpeed) {
        const px = oppX - self.x;
        const py = oppY - self.y;
        const vx = vel.vx;
        const vy = vel.vy;
        const s2 = bulletSpeed * bulletSpeed;

        // |p + v t|^2 = s^2 t^2
        // (v·v - s^2) t^2 + 2(p·v) t + (p·p) = 0
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

    chooseAim(state, _threats) {
        const { self, opponent, arena } = state;
        const vel = this.estimateOpponentVelocity(state);
        const bulletSpeed = Grok45MaxBot.BULLET_SPEED;

        const t = this.interceptTime(self, opponent.x, opponent.y, vel, bulletSpeed);
        let tx = opponent.x + vel.vx * t;
        let ty = opponent.y + vel.vy * t;

        // One refinement pass with the same velocity model.
        const t2 = this.interceptTime(self, tx, ty, vel, bulletSpeed);
        tx = opponent.x + vel.vx * t2;
        ty = opponent.y + vel.vy * t2;

        // Wall-slide prediction: if intercept is outside the playable box, aim along
        // the clamped edge where a corner-hugger is forced to travel.
        const pad = Grok45MaxBot.BODY_RADIUS;
        const clampedX = Math.max(pad, Math.min(arena.width - pad, tx));
        const clampedY = Math.max(pad, Math.min(arena.height - pad, ty));
        if (clampedX !== tx || clampedY !== ty) {
            // They will lose the outward velocity component at the wall.
            let rvx = vel.vx;
            let rvy = vel.vy;
            if (tx < pad || tx > arena.width - pad) rvx = 0;
            if (ty < pad || ty > arena.height - pad) rvy = 0;
            const tw = this.interceptTime(self, opponent.x, opponent.y, { vx: rvx, vy: rvy }, bulletSpeed);
            tx = Math.max(pad, Math.min(arena.width - pad, opponent.x + rvx * tw));
            ty = Math.max(pad, Math.min(arena.height - pad, opponent.y + rvy * tw));
        } else {
            tx = clampedX;
            ty = clampedY;
        }

        const oppSpeed = Math.hypot(vel.vx, vel.vy);
        if (oppSpeed < 1.2) {
            tx = opponent.x * 0.65 + tx * 0.35;
            ty = opponent.y * 0.65 + ty * 0.35;
        }

        // Blend pure position vs lead based on how stable their velocity is.
        const consistency = this.velocityConsistency();
        tx = tx * consistency + opponent.x * (1 - consistency);
        ty = ty * consistency + opponent.y * (1 - consistency);

        return { x: tx, y: ty, consistency, oppSpeed };
    }

    velocityConsistency() {
        if (this.oppHistory.length < 5) return 0.7;
        const n = this.oppHistory.length;
        const last = this.oppHistory[n - 1];
        let dotSum = 0;
        let count = 0;
        for (let i = n - 5; i < n - 1; i++) {
            const s = this.oppHistory[i];
            const a = Math.hypot(s.vx, s.vy);
            const b = Math.hypot(last.vx, last.vy);
            if (a < 0.4 || b < 0.4) {
                dotSum += 0.35;
            } else {
                dotSum += (s.vx * last.vx + s.vy * last.vy) / (a * b);
            }
            count += 1;
        }
        const avg = count ? dotSum / count : 0.5;
        // Map [-1,1] roughly into [0.35, 0.95] lead trust.
        return Math.max(0.35, Math.min(0.95, 0.55 + avg * 0.4));
    }

    shouldFire(state, aim, threats) {
        const { self, opponent } = state;
        if (self.energy < 1) return false;
        if (opponent.health <= 0) return false;

        // Always try to dump powerful shots — 5 hits of 20 ends the match.
        // Below powerful threshold, still fire: volume wins duels at 200ms cadence.
        // Only hold fire if we are one frame from certain death and a micro-dodge needs
        // full attention with no shot value (rare). Keep shooting through most dodges.
        if (threats.urgency > 8 && threats.hits[0] && threats.hits[0].tClosest < 1.2) {
            // Still fire: shots are free actions same frame as move.
        }

        // Skip hopeless shots into empty space when prediction is wildly off-arena
        // (already clamped). If extremely far, still fire — pressure matters.
        const dx = aim.x - self.x;
        const dy = aim.y - self.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;

        // When energy is critical and we are safe, optional brief hold to bank a
        // powerful volley after regen — only if opponent is also dry / far.
        // Competitive default: never stop shooting; regen requires 2s idle which
        // is usually worse than continuous 12-dmg pressure.
        return true;
    }
}
