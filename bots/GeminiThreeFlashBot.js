import { BotController } from './BotController.js';

export class GeminiThreeFlashBot2 extends BotController {
    static id = 'gemini-3-flash-2';
    static displayName = 'Gemini 3 Flash WP | V2';

    constructor() {
        super();
        this.context = null;
        this.lastPredictionIndex = 0;
        this.dodgeDirection = 1; // 1 or -1 for circling
        this.waitingForFull = false;
        this.circleAngle = 0;
    }

    start(context) {
        this.context = context;
        this.waitingForFull = false;
        this.circleAngle = Math.random() * Math.PI * 2;
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

        // --- Movement Logic ---
        let moveX = 0;
        let moveY = 0;

        // 1. Avoid walls (rule the middle section)
        const wallPadding = 100;
        if (self.x < wallPadding) moveX += 1;
        else if (self.x > arena.width - wallPadding) moveX -= 1;
        if (self.y < wallPadding) moveY += 1;
        else if (self.y > arena.height - wallPadding) moveY -= 1;

        // 2. Distance Management
        const isEnemyShooting = opponent.energy < 98;
        let targetDist = (opponent.energy <= 0 || !isEnemyShooting) ? 120 : 500;
        
        // When we have health advantage or opponent is low, be more aggressive
        if (self.health > opponent.health + 20 || opponent.health < 30) {
            targetDist -= 100;
        }

        // When shoot, reduce distance - this will make your shots come together
        if (self.energy > 80 && !this.waitingForFull) {
            targetDist = Math.max(80, targetDist - 150);
        }
        
        if (dist > targetDist + 30) {
            // Move towards
            moveX += dx / dist;
            moveY += dy / dist;
        } else if (dist < targetDist - 30) {
            // Move backwards when bot shot at you
            if (isEnemyShooting) {
                // bypass enemy bot in a circle form
                this.circleAngle += 0.08 * this.dodgeDirection;
                const circleX = Math.cos(this.circleAngle);
                const circleY = Math.sin(this.circleAngle);
                moveX -= (dx / dist) * 1.2 + circleX * 0.4;
                moveY -= (dy / dist) * 1.2 + circleY * 0.4;
            } else {
                moveX -= dx / dist;
                moveY -= dy / dist;
            }
        } else if (isEnemyShooting) {
            // Keep circling at target distance
            this.circleAngle += 0.08 * this.dodgeDirection;
            moveX += Math.cos(this.circleAngle);
            moveY += Math.sin(this.circleAngle);
        }

        // 3. Dodge enemy shots
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
            if (dot > 0) {
                const projX = bullet.x + ux * dot;
                const projY = bullet.y + uy * dot;
                const distToPath = Math.hypot(self.x - projX, self.y - projY);

                if (distToPath < 75) { // Slightly more than bot size
                    isCriticalDodge = true;
                    // Move perpendicular to bullet path
                    const perpX = -uy * this.dodgeDirection;
                    const perpY = ux * this.dodgeDirection;
                    // Weight dodge by proximity
                    const weight = 1 - (distToPath / 75);
                    dodgeX += perpX * weight;
                    dodgeY += perpY * weight;
                }
            }
        }

        if (isCriticalDodge) {
            // Combine dodging with distance keeping
            moveX = moveX * 0.3 + dodgeX * 1.5;
            moveY = moveY * 0.3 + dodgeY * 1.5;
            
            // Randomly flip dodge direction to be less predictable
            if (Math.random() < 0.01) this.dodgeDirection *= -1;
        }

        // Apply movement
        const moveLen = Math.hypot(moveX, moveY);
        if (moveLen > 0) {
            this.context.move(moveX / moveLen, moveY / moveLen);
        } else {
            this.context.move(0, 0);
        }

        // Prediction constants from Game.js
        const ACCEL = 1.5;
        const FRICTION = 0.12;
        const MAX_SPEED = 12;
        const bulletSpeed = 21;
        const timeToHit = dist / bulletSpeed;

        const predictions = [];
        
        // Pred 0: Constant velocity (Assuming they keep current speed and direction)
        predictions.push({
            x: opponent.x + opponent.vx * timeToHit,
            y: opponent.y + opponent.vy * timeToHit
        });

        // Pred 1: Accelerating/Maintaining max speed
        // If speed is low, they might be starting to move. If high, they are likely at max.
        const oppSpeed = Math.hypot(opponent.vx, opponent.vy);
        const ux_v = oppSpeed > 0 ? opponent.vx / oppSpeed : (dx / dist);
        const uy_v = oppSpeed > 0 ? opponent.vy / oppSpeed : (dy / dist);
        
        // Calculate where they'd be if they held the same direction and accelerated for timeToHit
        let pred1X = opponent.x;
        let pred1Y = opponent.y;
        let vX = opponent.vx;
        let vY = opponent.vy;
        for (let i = 0; i < Math.min(timeToHit, 60); i++) {
            vX = (vX + ux_v * ACCEL) * (1 - FRICTION);
            vY = (vY + uy_v * ACCEL) * (1 - FRICTION);
            const s = Math.hypot(vX, vY);
            if (s > MAX_SPEED) { vX = (vX / s) * MAX_SPEED; vY = (vY / s) * MAX_SPEED; }
            pred1X += vX;
            pred1Y += vY;
        }
        predictions.push({ x: pred1X, y: pred1Y });

        // Pred 2: Reversing/Turning (opposite of current velocity or stopping)
        let pred2X = opponent.x;
        let pred2Y = opponent.y;
        vX = opponent.vx;
        vY = opponent.vy;
        for (let i = 0; i < Math.min(timeToHit, 60); i++) {
            // Assume they switch direction
            vX = (vX - ux_v * ACCEL) * (1 - FRICTION);
            vY = (vY - uy_v * ACCEL) * (1 - FRICTION);
            const s = Math.hypot(vX, vY);
            if (s > MAX_SPEED) { vX = (vX / s) * MAX_SPEED; vY = (vY / s) * MAX_SPEED; }
            pred2X += vX;
            pred2Y += vY;
        }
        predictions.push({ x: pred2X, y: pred2Y });

        let targetX, targetY;
        if (dist < 200) {
            targetX = opponent.x;
            targetY = opponent.y;
        } else {
            const pred = predictions[this.lastPredictionIndex];
            targetX = pred.x;
            targetY = pred.y;
        }

        // Energy constraints
        // Don't go below 50% if enemy is shooting
        // Always wait for 100% regeneration (except if enemy energy is 0)
        let canShoot = false;
        if (opponent.energy <= 0) {
            canShoot = true; 
        } else if (isEnemyShooting) {
            if (self.energy >= 100) this.waitingForFull = false;
            if (self.energy < 50) this.waitingForFull = true;
            if (!this.waitingForFull && self.energy >= 50) canShoot = true;
        } else {
            // Enemy not shooting, wait for 100% or just shoot if full
            if (self.energy >= 100) {
                canShoot = true;
                this.waitingForFull = false;
            }
        }

        // Distance check: don't shoot if too far
        if (dist > 750) canShoot = false;

        // Spread shooting: calculate 3 targets but pick the one most likely to hit
        // based on opponent's current trend
        const targets = [
            predictions[0], // Constant
            predictions[1], // Accel
            predictions[2]  // Reverse
        ];

        if (canShoot) {
            let finalTarget;
            if (dist < 200) {
                finalTarget = { x: opponent.x, y: opponent.y };
            } else {
                // If they are fast, favor prediction
                // If they are slow, they are likely to accelerate
                const oppSpeed = Math.hypot(opponent.vx, opponent.vy);
                if (oppSpeed < 2) {
                    finalTarget = predictions[1]; // Likely to accelerate
                } else if (oppSpeed > 8) {
                    finalTarget = predictions[0]; // likely maintaining
                } else {
                    finalTarget = targets[this.lastPredictionIndex];
                }
            }

            const fired = this.context.fireAt(finalTarget.x, finalTarget.y);
            if (fired) {
                this.lastPredictionIndex = (this.lastPredictionIndex + 1) % 3;
            }
        }
    }
}
