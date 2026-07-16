import {
    applyPlayerShotLaneEvasion,
    tickDodge,
    DODGE_COOLDOWN_MS,
    DODGE_DURATION_MS,
    DODGE_SPEED_MUL
} from './playerShotEvasion.js';

// Alternates orbit direction between spawns so waves contain both variants:
//  - clockwise  = "right" flanker  (orbitDir +1)
//  - counter-cw = "left"  flanker  (orbitDir -1)
// (Point of view: center of the map.)
let flankerSpawnParity = 0;

export class FlankerAI {
    constructor(owner) {
        this.owner = owner;
        // Legacy field: maxSpeed now lives on Enemy; kept for any external readers.
        this.speed = owner.maxSpeed;

        // Orbit variant: +1 clockwise (right), -1 counter-clockwise (left).
        this.orbitDir = (flankerSpawnParity++ % 2 === 0) ? 1 : -1;
        this.behavior = this.orbitDir === 1 ? 'right' : 'left';

        // Geometry of the harassment orbit.
        this.orbitRadius = 70;    // close ring so the player keeps colliding with us
        this.approachExit = 180;  // switch to orbiting once we're this close
        this.reflankDist = 700;   // if the player escapes this far, flank again

        // 'approaching' -> curve in from the side, 'orbiting' -> circle the player.
        this.state = 'approaching';

        // Evasion (player fire-lines + urgent enemy projectiles).
        this.evadeWalls = [];

        // Fast sideways dodge (2× maxSpeed dash) when a player fire-line threatens us
        this.lastDodgeTime = -Infinity;
        this.dodgeCooldown = DODGE_COOLDOWN_MS;
        this.dodgeDuration = DODGE_DURATION_MS;
        this.dodgeSpeedMul = DODGE_SPEED_MUL;
        this.dodgeUntil = 0;
    }

    update(player, enemies, bullets, currentTime, spawnBullet, canvasWidth, canvasHeight) {
        const dxP = player.x - this.owner.x;
        const dyP = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dxP * dxP + dyP * dyP) || 1;

        // 1. State transitions.
        if (distToPlayer > this.reflankDist) {
            // Player broke away: reset to a fresh side approach.
            this.state = 'approaching';
        } else if (this.state === 'approaching' && distToPlayer < this.orbitRadius + this.approachExit) {
            this.state = 'orbiting';
        }

        // 2. Orbit steering.
        // Radial unit vector pointing from the player out to us.
        const rnx = -dxP / distToPlayer;
        const rny = -dyP / distToPlayer;
        // Tangent (perpendicular), rotated by the chosen orbit direction.
        const tanx = -rny * this.orbitDir;
        const tany = rnx * this.orbitDir;

        let moveX = 0;
        let moveY = 0;

        if (this.state === 'approaching') {
            // Curve toward the flank instead of charging head-on: mostly tangential
            // with an inward pull so we spiral onto the ring from the side.
            moveX = tanx * 0.85 - rnx * 0.55;
            moveY = tany * 0.85 - rny * 0.55;
        } else {
            // Orbiting: circle tangentially and correct back toward the target radius.
            const radialError = distToPlayer - this.orbitRadius;
            const correction = Math.max(-1, Math.min(1, radialError / this.orbitRadius));
            // Positive error => too far => pull inward (-rn); negative => push out.
            moveX = tanx - rnx * correction;
            moveY = tany - rny * correction;
        }

        // Normalize the desired heading before scaling by speed.
        const headLen = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
        moveX = (moveX / headLen) * this.speed;
        moveY = (moveY / headLen) * this.speed;

        // 3. TOP PRIORITY: clear any active rifle fire-lane so allies can shoot.
        const riflemen = enemies.filter(e => e.type === 'rifleman');
        const laneSteer = this.computeLaneClearing(riflemen);
        if (laneSteer.active) {
            moveX = laneSteer.x * this.speed;
            moveY = laneSteer.y * this.speed;
        }

        // 4. Projectile evasion.
        // Player: full fire-line from player → map edge for 400ms (live, no poll nerf) + dodge.
        const laneResult = applyPlayerShotLaneEvasion(
            this,
            this.owner,
            player.shotLanes,
            currentTime,
            moveX,
            moveY
        );
        moveX = laneResult.moveX;
        moveY = laneResult.moveY;

        // Boss & SkyPulse shells: still tracked live every frame.
        const urgentWalls = [];
        if (bullets) {
            bullets.forEach(b => {
                if (b.ownerType === 'boss-spiral') urgentWalls.push({ type: 'boss-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy });
                else if (b.ownerType === 'sky-pulse') urgentWalls.push({ type: 'plasma-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy });
            });
        }
        this.evadeWalls = [...laneResult.walls, ...urgentWalls];

        urgentWalls.forEach(w => {
            const vbx = this.owner.x - w.x;
            const vby = this.owner.y - w.y;
            const vlen = Math.sqrt((w.vx || 0) ** 2 + (w.vy || 0) ** 2);
            if (vlen === 0) return;
            const bux = w.vx / vlen;
            const buy = w.vy / vlen;
            const proj = vbx * bux + vby * buy;

            let range = 200;
            let width = 25;

            if (w.type === 'boss-bullet' || w.type === 'plasma-bullet') {
                range = w.type === 'boss-bullet' ? 90 : 100;
                width = w.type === 'boss-bullet' ? 34 : 38;
            }

            if (proj > 0 && proj < range) {
                const closestX = w.x + bux * proj;
                const closestY = w.y + buy * proj;
                const distToLineSq = (this.owner.x - closestX) ** 2 + (this.owner.y - closestY) ** 2;
                if (distToLineSq < (width * width)) {
                    const perpx = -buy;
                    const perpy = bux;
                    const side = (this.owner.x - w.x) * perpx + (this.owner.y - w.y) * perpy;
                    const steerDir = side >= 0 ? 1 : -1;
                    const force = 5.0;
                    moveX += perpx * steerDir * force;
                    moveY += perpy * steerDir * force;
                }
            }

            // Sphere avoidance for lethal shells (Plasma & Boss Spiral).
            if (w.type === 'plasma-bullet' || w.type === 'boss-bullet') {
                const dx = this.owner.x - w.x;
                const dy = this.owner.y - w.y;
                const d2 = dx * dx + dy * dy;
                const sphereRadius = width;
                if (d2 < sphereRadius * sphereRadius) {
                    const d = Math.sqrt(d2);
                    if (d > 0) {
                        moveX += (dx / d) * 5.0;
                        moveY += (dy / d) * 5.0;
                    }
                }
            }
        });

        // 5. Separation from other units.
        const separationDist = 40;
        enemies.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const d = Math.sqrt(diffX * diffX + diffY * diffY);
            if (d > 0 && d < separationDist) {
                moveX += (diffX / d) * (separationDist - d) * 0.2;
                moveY += (diffY / d) * (separationDist - d) * 0.2;
            }
        });

        // 6. Keep the orbit inside the map: steer away from the edges before hitting them.
        const edgeMargin = this.owner.size;
        if (canvasWidth && canvasHeight) {
            const edgeForce = this.speed * 2.5;
            if (this.owner.x < edgeMargin) moveX += edgeForce * (1 - this.owner.x / edgeMargin);
            else if (this.owner.x > canvasWidth - edgeMargin) moveX -= edgeForce * (1 - (canvasWidth - this.owner.x) / edgeMargin);
            if (this.owner.y < edgeMargin) moveY += edgeForce * (1 - this.owner.y / edgeMargin);
            else if (this.owner.y > canvasHeight - edgeMargin) moveY -= edgeForce * (1 - (canvasHeight - this.owner.y) / edgeMargin);
        }

        // 7. Desired direction (physics on Enemy integrates accel/friction/turn)
        // Active dodge dash overrides normal steering (faces dodge dir @ 2× maxSpeed)
        const dodge = tickDodge(this, this.owner, currentTime);
        if (dodge.active) {
            this.owner.setMoveIntent(dodge.x, dodge.y);
        } else {
            const finalMoveDist = Math.sqrt(moveX * moveX + moveY * moveY);
            if (finalMoveDist > 0.001) {
                this.owner.setMoveIntent(moveX / finalMoveDist, moveY / finalMoveDist);
            } else {
                this.owner.setMoveIntent(0, 0);
            }
        }

        // Face along orbit / approach heading (velocity will refine facing over time)
        this.owner.setLookTarget(player.x, player.y);

        // 8. Soft bounds: kill outward velocity if we would leave the map after physics.
        // Hard clamp runs in Game/Enemy path after integration via keepInBounds below.
        this._pendingBounds = { canvasWidth, canvasHeight };
    }

    /** Called after physics if needed; Flanker clamps in post-step via owner helper. */
    applyBoundsAfterPhysics() {
        const b = this._pendingBounds;
        if (!b || !b.canvasWidth || !b.canvasHeight) return;
        const half = this.owner.size / 2;
        const o = this.owner;
        if (o.x < half) { o.x = half; if (o.vx < 0) o.vx = 0; }
        else if (o.x > b.canvasWidth - half) { o.x = b.canvasWidth - half; if (o.vx > 0) o.vx = 0; }
        if (o.y < half) { o.y = half; if (o.vy < 0) o.vy = 0; }
        else if (o.y > b.canvasHeight - half) { o.y = b.canvasHeight - half; if (o.vy > 0) o.vy = 0; }
    }

    // Return a normalized sidestep vector if any rifle is actively requesting this
    // unit vacate its shot corridor. Mirrors BasicMeleeAI so ground units cooperate.
    computeLaneClearing(riflemen) {
        for (const r of riflemen) {
            const req = r.ai && r.ai.fireLaneRequest;
            if (!req) continue;

            const vpx = this.owner.x - req.x;
            const vpy = this.owner.y - req.y;
            const proj = vpx * req.ux + vpy * req.uy;
            if (proj <= 0 || proj >= req.dist) continue;

            const closestX = req.x + req.ux * proj;
            const closestY = req.y + req.uy * proj;
            const offX = this.owner.x - closestX;
            const offY = this.owner.y - closestY;
            const offDistSq = offX * offX + offY * offY;
            const corridor = 34; // must exceed rifle's isFriendlyInLane radius (28)

            if (offDistSq < corridor * corridor) {
                const perpX = -req.uy;
                const perpY = req.ux;
                const side = offX * perpX + offY * perpY;
                const dir = side >= 0 ? 1 : -1;
                return { active: true, x: perpX * dir, y: perpY * dir };
            }
        }
        return { active: false, x: 0, y: 0 };
    }
}
