export class BasicRiflemanAI {
    constructor(owner) {
        this.owner = owner;
        // Legacy field: maxSpeed now lives on Enemy; kept for any external readers.
        this.speed = owner.maxSpeed;
        this.fireRange = 800;
        this.lastShotTime = 0;
        this.fireRateDelay = 1500; // Standard 1.5s delay between bursts
        this.bulletSpeed = 5;
        this.currentFiringLine = null;
        
        // Burst properties
        this.burstCount = 0;
        this.maxBurst = 3;
        this.burstInterval = 100; // 100ms between bullets in a burst
        this.isPredictiveBurst = false;
        this.lastBurstTime = 0;

        // Fire-lane telegraph state machine: 'ready' -> 'aiming' -> 'bursting'
        this.fireState = 'ready';
        this.aimStartTime = 0;
        this.minTelegraph = 120;  // minimum time to broadcast the lane before firing
        this.maxAimWait = 550;    // give up (abort) if ground units can't clear the lane
        this.lockedTarget = null; // aim point locked in at fire time
        // Published lane request. Ground units read this to vacate the shot path.
        // Shape: { x, y, ux, uy, dist } or null when not firing.
        this.fireLaneRequest = null;

        // Evasion logic for projectiles
        this.lastEvadeUpdateTime = 0;
        this.playerBulletWalls = [];
        this.evadeWalls = [];
    }

    update(player, enemies, bullets, currentTime, spawnBullet) {
        const dx = player.x - this.owner.x;
        const dy = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        let moveX = 0;
        let moveY = 0;

        // 1. Movement logic: Move towards player but stop at 300 range
        if (distToPlayer > 350) {
            moveX = (dx / distToPlayer) * this.speed;
            moveY = (dy / distToPlayer) * this.speed;
        } else if (distToPlayer < 300) {
            // Keep the distance if player gets too close
            moveX = -(dx / distToPlayer) * this.speed;
            moveY = -(dy / distToPlayer) * this.speed;
        }

        // --- Projectile Evasion ---
        if (currentTime - this.lastEvadeUpdateTime > 200) {
            this.playerBulletWalls = bullets ? bullets.filter(b => b.ownerType === 'player').map(b => ({ type: 'player-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy })) : [];
            this.lastEvadeUpdateTime = currentTime;
        }

        const urgentWalls = [];
        if (bullets) {
            bullets.forEach(b => {
                if (b.ownerType === 'boss-spiral') urgentWalls.push({ type: 'boss-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy });
                else if (b.ownerType === 'sky-pulse') urgentWalls.push({ type: 'plasma-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy });
            });
        }
        this.evadeWalls = [...this.playerBulletWalls, ...urgentWalls];

        this.evadeWalls.forEach(w => {
            const vbx = this.owner.x - w.x;
            const vby = this.owner.y - w.y;
            const vlen = Math.sqrt((w.vx || 0)**2 + (w.vy || 0)**2);
            if (vlen === 0) return;
            const bux = w.vx / vlen;
            const buy = w.vy / vlen;
            const proj = vbx * bux + vby * buy;

            let range = 200;
            let width = 25;

            if (w.type === 'player-bullet') {
                range = 2000;
                width = 25;
            } else if (w.type === 'boss-bullet' || w.type === 'plasma-bullet') {
                range = w.type === 'boss-bullet' ? 90 : 100;
                width = w.type === 'boss-bullet' ? 34 : 38;
            }

            if (proj > 0 && proj < range) {
                const closestX = w.x + bux * proj;
                const closestY = w.y + buy * proj;
                const distToLineSq = (this.owner.x - closestX)**2 + (this.owner.y - closestY)**2;
                if (distToLineSq < (width * width)) {
                    const perpx = -buy;
                    const perpy = bux;
                    const side = (this.owner.x - w.x) * perpx + (this.owner.y - w.y) * perpy;
                    const steerDir = side >= 0 ? 1 : -1;
                    const force = w.type === 'plasma' || w.type === 'boss' ? 5.0 : 4.0;
                    moveX += perpx * steerDir * force;
                    moveY += perpy * steerDir * force;
                }
            }

            // Sphere avoidance for lethal shells (Plasma & Boss Spiral)
            if (w.type === 'plasma-bullet' || w.type === 'boss-bullet') {
                const dx = this.owner.x - w.x;
                const dy = this.owner.y - w.y;
                const d2 = dx * dx + dy * dy;
                const sphereRadius = width;
                if (d2 < sphereRadius * sphereRadius) {
                    const d = Math.sqrt(d2);
                    if (d > 0) {
                        const sForce = w.type === 'plasma-bullet' || w.type === 'boss-bullet' ? 6.0 : 4.0;
                        moveX += (dx / d) * sForce;
                        moveY += (dy / d) * sForce;
                    }
                }
            }
        });

        // 2. Separation (softened)
        const separationDist = 60;
        enemies.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const dist = Math.sqrt(diffX * diffX + diffY * diffY);
            if (dist > 0 && dist < separationDist) {
                const force = (separationDist - dist) * 0.1;
                moveX += (diffX / dist) * force;
                moveY += (diffY / dist) * force;
            }
        });

        // Desired direction (physics on Enemy integrates accel/friction/turn)
        const finalMoveDist = Math.sqrt(moveX * moveX + moveY * moveY);
        if (finalMoveDist > 0.001) {
            this.owner.setMoveIntent(moveX / finalMoveDist, moveY / finalMoveDist);
        } else {
            this.owner.setMoveIntent(0, 0);
        }

        // 3. Shooting logic: telegraph -> clear lane -> fire.
        this.updateFireStateMachine(player, enemies, distToPlayer, dx, dy, currentTime, spawnBullet);

        // Face aim lock while telegraphing/firing; otherwise face the player
        if (
            (this.fireState === 'aiming' || this.fireState === 'bursting') &&
            this.lockedTarget
        ) {
            this.owner.setLookTarget(this.lockedTarget.x, this.lockedTarget.y);
        } else {
            this.owner.setLookTarget(player.x, player.y);
        }
    }

    // Compute the aim point (predictive or direct) for the current burst.
    computeAimPoint(player, distToPlayer) {
        if (!this.isPredictiveBurst) {
            return { x: player.x, y: player.y };
        }
        const playerVelLen = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (playerVelLen <= 0.1) {
            return { x: player.x, y: player.y };
        }
        const ux = player.vx / playerVelLen;
        const uy = player.vy / playerVelLen;
        const constantSpeed = 4.12;

        let travelTime = distToPlayer / this.bulletSpeed;
        const predictedX = player.x + ux * constantSpeed * travelTime;
        const predictedY = player.y + uy * constantSpeed * travelTime;
        const distToPredicted = Math.sqrt((predictedX - this.owner.x) ** 2 + (predictedY - this.owner.y) ** 2);
        travelTime = distToPredicted / this.bulletSpeed;

        return {
            x: player.x + ux * constantSpeed * travelTime,
            y: player.y + uy * constantSpeed * travelTime
        };
    }

    // Publish/refresh the lane request so ALL ground units know to vacate the path.
    publishLaneToTarget(targetX, targetY) {
        const ldx = targetX - this.owner.x;
        const ldy = targetY - this.owner.y;
        const llen = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
        this.fireLaneRequest = {
            x: this.owner.x,
            y: this.owner.y,
            ux: ldx / llen,
            uy: ldy / llen,
            dist: llen
        };
        // Kept for backward-compat with any evasion readers.
        this.currentFiringLine = {
            x: this.owner.x,
            y: this.owner.y,
            dist: llen,
            ux: ldx / llen,
            uy: ldy / llen
        };
    }

    updateFireStateMachine(player, enemies, distToPlayer, dx, dy, currentTime, spawnBullet) {
        // Out of range: stand down completely, release any lane request.
        if (distToPlayer >= this.fireRange) {
            this.fireState = 'ready';
            this.fireLaneRequest = null;
            this.currentFiringLine = null;
            this.burstCount = 0;
            return;
        }

        if (this.fireState === 'ready') {
            // Wait for cooldown, then begin telegraphing a new shot.
            if (currentTime - this.lastBurstTime >= this.fireRateDelay) {
                this.isPredictiveBurst = Math.random() < 0.7;
                this.aimStartTime = currentTime;
                this.fireState = 'aiming';
            } else {
                this.fireLaneRequest = null;
                this.currentFiringLine = null;
            }
        }

        if (this.fireState === 'aiming') {
            // Lock aim and broadcast the lane so allies open a path.
            this.lockedTarget = this.computeAimPoint(player, distToPlayer);
            this.publishLaneToTarget(this.lockedTarget.x, this.lockedTarget.y);

            const laneClear = !this.isFriendlyInLane(this.lockedTarget, enemies);
            const telegraphed = currentTime - this.aimStartTime >= this.minTelegraph;

            if (telegraphed && laneClear) {
                // Path is open: commit to the burst.
                this.fireState = 'bursting';
                this.burstCount = 0;
                this.lastBurstTime = currentTime;
                this.lastShotTime = -Infinity; // fire first shot immediately
            } else if (currentTime - this.aimStartTime >= this.maxAimWait) {
                // Allies never cleared the lane: abort to avoid friendly fire, reset cooldown.
                this.fireState = 'ready';
                this.lastBurstTime = currentTime;
                this.fireLaneRequest = null;
                this.currentFiringLine = null;
            }
        }

        if (this.fireState === 'bursting') {
            // Abort mid-burst if an ally wanders into the locked lane.
            if (this.isFriendlyInLane(this.lockedTarget, enemies)) {
                this.fireState = 'ready';
                this.lastBurstTime = currentTime;
                this.burstCount = 0;
                this.fireLaneRequest = null;
                this.currentFiringLine = null;
                return;
            }

            if (currentTime - this.lastShotTime >= this.burstInterval) {
                const angle = Math.atan2(this.lockedTarget.y - this.owner.y, this.lockedTarget.x - this.owner.x);
                spawnBullet({
                    x: this.owner.x,
                    y: this.owner.y,
                    vx: Math.cos(angle) * this.bulletSpeed,
                    vy: Math.sin(angle) * this.bulletSpeed,
                    radius: 4,
                    color: '#ff4444',
                    ownerType: 'enemy',
                    source: this.owner
                });
                this.lastShotTime = currentTime;
                this.burstCount++;

                if (this.burstCount >= this.maxBurst) {
                    this.fireState = 'ready';
                    this.lastBurstTime = currentTime;
                    this.fireLaneRequest = null;
                    this.currentFiringLine = null;
                }
            }
        }
    }

    // True if any friendly ground unit sits inside the shot corridor toward the aim point.
    isFriendlyInLane(target, enemies) {
        const ldx = target.x - this.owner.x;
        const ldy = target.y - this.owner.y;
        const dist = Math.sqrt(ldx * ldx + ldy * ldy);
        if (dist === 0) return false;

        const ux = ldx / dist;
        const uy = ldy / dist;
        const checkRadius = 28; // corridor half-width

        for (const other of enemies) {
            if (other === this.owner) continue;
            if (other.type === 'sky-pulse') continue; // flyers are out of plane

            const vpx = other.x - this.owner.x;
            const vpy = other.y - this.owner.y;
            const proj = vpx * ux + vpy * uy;

            if (proj > 0 && proj < dist) {
                const closestX = this.owner.x + ux * proj;
                const closestY = this.owner.y + uy * proj;
                const distToLineSq = (other.x - closestX) ** 2 + (other.y - closestY) ** 2;
                if (distToLineSq < checkRadius * checkRadius) return true;
            }
        }
        return false;
    }
}
