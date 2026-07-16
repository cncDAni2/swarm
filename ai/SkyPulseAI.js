import {
    applyPlayerShotLaneEvasion,
    tickDodge,
    DODGE_COOLDOWN_MS,
    DODGE_DURATION_MS,
    DODGE_SPEED_MUL
} from './playerShotEvasion.js';

export class SkyPulseAI {
    constructor(owner) {
        this.owner = owner;
        // Legacy field: maxSpeed now lives on Enemy; kept for any external readers.
        this.speed = owner.maxSpeed;
        this.targetDist = 500;
        this.lastShotTime = 0;
        this.baseFireRate = 2500; // milliseconds
        this.fireRate = this.baseFireRate * (0.75 + Math.random() * 0.5); // +-25% random
        this.evadeWalls = [];
        this._pendingBounds = null;

        // Fast sideways dodge (2× maxSpeed dash) when a player fire-line threatens us
        this.lastDodgeTime = -Infinity;
        this.dodgeCooldown = DODGE_COOLDOWN_MS;
        this.dodgeDuration = DODGE_DURATION_MS;
        this.dodgeSpeedMul = DODGE_SPEED_MUL;
        this.dodgeUntil = 0;
    }

    update(player, enemies, bullets, currentTime, spawnBullet) {
        this._pendingBounds = {
            canvasWidth: window.innerWidth,
            canvasHeight: window.innerHeight
        };
        const dx = player.x - this.owner.x;
        const dy = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        let moveX = 0;
        let moveY = 0;

        // Hold preferred range (~500)
        if (distToPlayer > this.targetDist + 20) {
            moveX = (dx / distToPlayer) * this.speed;
            moveY = (dy / distToPlayer) * this.speed;
        } else if (distToPlayer < this.targetDist - 20) {
            moveX = -(dx / distToPlayer) * this.speed;
            moveY = -(dy / distToPlayer) * this.speed;
        }

        // --- Full player fire-line evasion (live, no poll nerf) + dodge ---
        // Lanes are published by Game on each shot: player → map edge for 400ms.
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
        this.evadeWalls = laneResult.walls;

        // Separation from other flyers only
        const flyers = enemies.filter(e => e.type === 'sky-pulse');
        const separationDist = 50;
        let separationX = 0;
        let separationY = 0;
        flyers.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const d = Math.sqrt(diffX * diffX + diffY * diffY);
            if (d > 0 && d < separationDist) {
                separationX += (diffX / d) * (separationDist - d) * 0.2;
                separationY += (diffY / d) * (separationDist - d) * 0.2;
            }
        });

        let finalMoveX = moveX + separationX;
        let finalMoveY = moveY + separationY;

        // Soft edge steering (intent), not hard position kill
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        const margin = 50;
        if (this.owner.x < margin) finalMoveX += this.speed;
        else if (this.owner.x > canvasWidth - margin) finalMoveX -= this.speed;
        if (this.owner.y < margin) finalMoveY += this.speed;
        else if (this.owner.y > canvasHeight - margin) finalMoveY -= this.speed;

        // Active dodge dash overrides normal steering (faces dodge dir @ 2× maxSpeed)
        const dodge = tickDodge(this, this.owner, currentTime);
        if (dodge.active) {
            this.owner.setMoveIntent(dodge.x, dodge.y);
        } else {
            const finalDist = Math.sqrt(finalMoveX * finalMoveX + finalMoveY * finalMoveY);
            if (finalDist > 0.001) {
                this.owner.setMoveIntent(finalMoveX / finalDist, finalMoveY / finalDist);
            } else {
                this.owner.setMoveIntent(0, 0);
            }
        }

        this.owner.setLookTarget(player.x, player.y);

        // Homing / pre-homing rocket (within 1000 range).
        // Same forward-only force model as enemies, but noSlowdown: always
        // accelerates to max and never brakes/coasts (see tankPhysics.js).
        if (distToPlayer < 1000 && currentTime - this.lastShotTime > this.fireRate) {
            const angle = Math.atan2(dy, dx);
            const rand = Math.random();
            const launchSpeed = 1.5;

            // Cruise 2.5 / pre-homing rush 4.0. Turn rates 2× enemy baseline.
            const rocketPhys = {
                maxSpeed: 6.5,
                rushMaxSpeed: 6.5,
                accel: 0.48,
                friction: 0,   // unused while noSlowdown
                brake: 0,      // unused while noSlowdown
                turnDegPerSecMax: 550,
                turnDegPerSecMin: 180
            };

            let bulletProps = {
                x: this.owner.x,
                y: this.owner.y,
                // Tank body state (force physics integrates these)
                facing: angle,
                forwardSpeed: launchSpeed,
                vx: Math.cos(angle) * launchSpeed,
                vy: Math.sin(angle) * launchSpeed,
                moveIntentX: Math.cos(angle),
                moveIntentY: Math.sin(angle),
                maxSpeed: rocketPhys.maxSpeed,
                rushMaxSpeed: rocketPhys.rushMaxSpeed,
                accel: rocketPhys.accel,
                friction: rocketPhys.friction,
                brake: rocketPhys.brake,
                turnDegPerSecMax: rocketPhys.turnDegPerSecMax,
                turnDegPerSecMin: rocketPhys.turnDegPerSecMin,
                noSlowdown: true, // accel to max only; never lose speed turning
                useTankPhysics: true,
                radius: 12,
                color: 'cyan',
                ownerType: 'sky-pulse',
                source: this.owner,
                isHoming: true,
                createdAt: currentTime,
                lifetime: 4000
            };

            if (rand < 0.33) {
                const ux = dx / distToPlayer;
                const uy = dy / distToPlayer;
                const perpX = uy;
                const perpY = -ux;
                bulletProps.isHoming = false;
                bulletProps.preHomingTarget = {
                    x: player.x + perpX * 600,
                    y: player.y + perpY * 600
                };
            } else if (rand < 0.66) {
                const ux = dx / distToPlayer;
                const uy = dy / distToPlayer;
                const perpX = -uy;
                const perpY = ux;
                bulletProps.isHoming = false;
                bulletProps.preHomingTarget = {
                    x: player.x + perpX * 600,
                    y: player.y + perpY * 600
                };
            }

            spawnBullet(bulletProps);
            this.lastShotTime = currentTime;
            this.fireRate = this.baseFireRate * (0.75 + Math.random() * 0.5);
        }
    }

    applyBoundsAfterPhysics() {
        const b = this._pendingBounds;
        if (!b || !b.canvasWidth || !b.canvasHeight) return;
        const margin = 50;
        const o = this.owner;
        if (o.x < margin) { o.x = margin; if (o.vx < 0) o.vx = 0; }
        else if (o.x > b.canvasWidth - margin) { o.x = b.canvasWidth - margin; if (o.vx > 0) o.vx = 0; }
        if (o.y < margin) { o.y = margin; if (o.vy < 0) o.vy = 0; }
        else if (o.y > b.canvasHeight - margin) { o.y = b.canvasHeight - margin; if (o.vy > 0) o.vy = 0; }
    }
}
