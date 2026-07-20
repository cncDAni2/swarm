import { BotController } from './BotController.js';

export class GeminiThreeFlashBot3 extends BotController {
    static id = 'gemini-3-flash-3';
    static displayName = 'Gemini 3 Flash WP | V3';

    constructor() {
        super();
        this.context = null;
        this.lastPredictionIndex = 0;
        this.dodgeDirection = 1; // 1 or -1 for circling
        this.waitingForFull = false;
        this.circleAngle = 0;
        this.lastOpponentEnergy = 100;
        this.isOpponentActivelyShooting = false;
        this.lastShootTime = 0;
    }

    start(context) {
        this.context = context;
        this.waitingForFull = false;
        this.circleAngle = Math.random() * Math.PI * 2;
        this.lastOpponentEnergy = 100;
        this.isOpponentActivelyShooting = false;
    }

    stop() {
        this.context = null;
    }

    update(deltaTime) {
        if (!this.context) return;
        const state = this.context.getState();
        if (state.matchEnded) return;

        const { self, opponent, arena, bullets } = state;
        const dx = opponent.x - self.x;
        const dy = opponent.y - self.y;
        const dist = Math.hypot(dx, dy);

        // Detect if enemy is actively shooting (energy drop)
        if (opponent.energy < this.lastOpponentEnergy) {
            this.isOpponentActivelyShooting = true;
            this.lastShootTime = state.time;
        } else if (state.time - this.lastShootTime > 1000) {
            // If they haven't shot for 1s, they aren't "actively" shooting
            this.isOpponentActivelyShooting = false;
        }
        this.lastOpponentEnergy = opponent.energy;

        // --- Movement Logic ---
        let moveX = 0;
        let moveY = 0;

        // 1. Avoid walls (rule the middle section)
        const wallPadding = 120; // Increased padding
        if (self.x < wallPadding) moveX += 1.5;
        else if (self.x > arena.width - wallPadding) moveX -= 1.5;
        if (self.y < wallPadding) moveY += 1.5;
        else if (self.y > arena.height - wallPadding) moveY -= 1.5;

        // 2. Distance Management
        // Stay close if they aren't shooting or have low energy
        let targetDist = (opponent.energy < 10 || !this.isOpponentActivelyShooting) ? 120 : 550;
        
        // When we have health advantage, be more aggressive
        if (self.health > opponent.health + 30) {
            targetDist = Math.max(100, targetDist - 150);
        }

        if (dist > targetDist + 20) {
            moveX += dx / dist;
            moveY += dy / dist;
        } else if (dist < targetDist - 20) {
            // Move backwards when bot shot at you
            if (this.isOpponentActivelyShooting) {
                this.circleAngle += 0.1 * this.dodgeDirection;
                const circleX = Math.cos(this.circleAngle);
                const circleY = Math.sin(this.circleAngle);
                // Stronger backwards and circling
                moveX -= (dx / dist) * 1.5 + circleX * 0.6;
                moveY -= (dy / dist) * 1.5 + circleY * 0.6;
            } else {
                moveX -= dx / dist;
                moveY -= dy / dist;
            }
        } else if (this.isOpponentActivelyShooting) {
            this.circleAngle += 0.1 * this.dodgeDirection;
            moveX += Math.cos(this.circleAngle);
            moveY += Math.sin(this.circleAngle);
        }

        // 3. Dodge enemy shots - More precise and aggressive
        const enemyBullets = bullets.filter(b => b.isEnemy);
        let dodgeX = 0;
        let dodgeY = 0;
        let isCriticalDodge = false;

        for (const bullet of enemyBullets) {
            const bsX = self.x - bullet.x;
            const bsY = self.y - bullet.y;
            const bSpeed = Math.hypot(bullet.vx, bullet.vy);
            if (bSpeed === 0) continue;

            const ux = bullet.vx / bSpeed;
            const uy = bullet.vy / bSpeed;

            const dot = bsX * ux + bsY * uy;
            if (dot > 0 && dot < 600) { // Only care about bullets ahead and relatively close
                const projX = bullet.x + ux * dot;
                const projY = bullet.y + uy * dot;
                const distToPath = Math.hypot(self.x - projX, self.y - projY);

                if (distToPath < 85) { // Increased safety margin
                    isCriticalDodge = true;
                    // Move perpendicular to bullet path, prioritized
                    const perpX = -uy * this.dodgeDirection;
                    const perpY = ux * this.dodgeDirection;
                    
                    // The closer the bullet, the harder we dodge
                    const proximityWeight = 2.0 * (1 - distToPath / 85);
                    dodgeX += perpX * proximityWeight;
                    dodgeY += perpY * proximityWeight;
                    
                    // Also move slightly away from the bullet itself
                    dodgeX += (bsX / Math.hypot(bsX, bsY)) * 0.2;
                    dodgeY += (bsY / Math.hypot(bsX, bsY)) * 0.2;
                }
            }
        }

        if (isCriticalDodge) {
            moveX = moveX * 0.2 + dodgeX * 2.0;
            moveY = moveY * 0.2 + dodgeY * 2.0;
            
            if (Math.random() < 0.02) this.dodgeDirection *= -1;
        }

        // Apply movement
        const moveLen = Math.hypot(moveX, moveY);
        if (moveLen > 0) {
            this.context.move(moveX / moveLen, moveY / moveLen);
        } else {
            this.context.move(0, 0);
        }

        // --- Prediction Logic ---
        const bulletSpeed = 21;
        const timeToHit = dist / bulletSpeed;
        
        // Constants for simulation
        const ACCEL = 1.5;
        const FRICTION = 0.12;
        const MAX_SPEED = 12;

        const getProjectedPos = (frames, accelFactor) => {
            let pX = opponent.x;
            let pY = opponent.y;
            let vX = opponent.vx;
            let vY = opponent.vy;
            const oppSpeed = Math.hypot(vX, vY);
            const ux = oppSpeed > 0 ? vX / oppSpeed : (dx / dist);
            const uy = oppSpeed > 0 ? vY / oppSpeed : (dy / dist);

            for (let i = 0; i < frames; i++) {
                vX = (vX + ux * ACCEL * accelFactor) * (1 - FRICTION);
                vY = (vY + uy * ACCEL * accelFactor) * (1 - FRICTION);
                const s = Math.hypot(vX, vY);
                if (s > MAX_SPEED) { vX = (vX / s) * MAX_SPEED; vY = (vY / s) * MAX_SPEED; }
                pX += vX;
                pY += vY;
            }
            return { x: pX, y: pY };
        };

        // Redefined 3 targets to be less scattered
        const targets = [
            getProjectedPos(timeToHit, 0.2), // Mostly maintaining current speed
            getProjectedPos(timeToHit, 0.8), // Accelerating forward
            getProjectedPos(timeToHit, -0.5) // Braking/Turning
        ];

        // Shooting constraints
        let canShoot = false;
        if (opponent.energy <= 0 || !this.isOpponentActivelyShooting) {
            canShoot = true; 
        } else {
            if (self.energy >= 100) this.waitingForFull = false;
            if (self.energy < 40) this.waitingForFull = true;
            if (!this.waitingForFull && self.energy >= 40) canShoot = true;
        }

        // Don't shoot if too far - improved limit
        if (dist > 650) canShoot = false;

        if (canShoot) {
            let finalTarget;
            if (dist < 200) {
                finalTarget = { x: opponent.x, y: opponent.y };
            } else {
                finalTarget = targets[this.lastPredictionIndex];
            }

            const fired = this.context.fireAt(finalTarget.x, finalTarget.y);
            if (fired) {
                this.lastPredictionIndex = (this.lastPredictionIndex + 1) % targets.length;
            }
        }
    }
}
