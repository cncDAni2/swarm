import { BotController } from './BotController.js';

export class GeminiThreeFlashBot extends BotController {
    static id = 'gemini-3-flash';
    static displayName = 'Gemini 3 Flash';

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
        let targetDist = (opponent.energy <= 0 || !isEnemyShooting) ? 150 : 550;
        
        // When shoot, reduce distance - this will make your shots come together
        if (self.energy > 80 && !this.waitingForFull) {
            targetDist = Math.max(100, targetDist - 200);
        }
        
        if (dist > targetDist + 50) {
            // Move towards
            moveX += dx / dist;
            moveY += dy / dist;
        } else if (dist < targetDist - 50) {
            // Move backwards when bot shot at you
            if (isEnemyShooting) {
                // bypass enemy bot in a circle form
                this.circleAngle += 0.05 * this.dodgeDirection;
                const circleX = Math.cos(this.circleAngle);
                const circleY = Math.sin(this.circleAngle);
                moveX -= (dx / dist) + circleX * 0.5;
                moveY -= (dy / dist) + circleY * 0.5;
            } else {
                moveX -= dx / dist;
                moveY -= dy / dist;
            }
        } else if (isEnemyShooting) {
            // Keep circling at target distance
            this.circleAngle += 0.05 * this.dodgeDirection;
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

                if (distToPath < 70) { // Slightly more than bot size
                    isCriticalDodge = true;
                    // Move perpendicular to bullet path
                    dodgeX += -uy * this.dodgeDirection;
                    dodgeY += ux * this.dodgeDirection;
                }
            }
        }

        if (isCriticalDodge) {
            moveX = dodgeX;
            moveY = dodgeY;
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
        if (dist > 800) canShoot = false;

        if (canShoot) {
            const fired = this.context.fireAt(targetX, targetY);
            if (fired) {
                this.lastPredictionIndex = (this.lastPredictionIndex + 1) % 3;
            }
        }
    }
}
