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

        // 1. Center-seeking force (Avoid edges at all cost)
        const centerX = arena.width / 2;
        const centerY = arena.height / 2;
        const fromCenterX = self.x - centerX;
        const fromCenterY = self.y - centerY;
        const distFromCenter = Math.hypot(fromCenterX, fromCenterY);
        
        // Push towards center, especially when near edges
        const edgeThreshold = Math.min(arena.width, arena.height) * 0.35;
        if (distFromCenter > edgeThreshold) {
            const pull = Math.pow((distFromCenter - edgeThreshold) / edgeThreshold, 2);
            moveX -= (fromCenterX / distFromCenter) * pull * 2.0;
            moveY -= (fromCenterY / distFromCenter) * pull * 2.0;
        }

        // 2. Distance Management & Orbiting
        let targetDist = (opponent.energy < 10 || !this.isOpponentActivelyShooting) ? 140 : 580;
        
        if (self.health > opponent.health + 30) {
            targetDist = Math.max(120, targetDist - 200);
        }

        // Calculate Orbiting Vectors
        const ux = dx / dist;
        const uy = dy / dist;
        const tx = -uy * this.dodgeDirection; // Tangent X
        const ty = ux * this.dodgeDirection;  // Tangent Y

        if (dist > targetDist + 40) {
            // Approach while orbiting slightly
            moveX += ux + tx * 0.3;
            moveY += uy + ty * 0.3;
        } else if (dist < targetDist - 40) {
            // Retreat while orbiting hard
            moveX -= ux * 1.5 - tx * 1.0;
            moveY -= uy * 1.5 - ty * 1.0;
        } else {
            // Maintain distance by pure orbiting
            moveX += tx;
            moveY += ty;
        }

        // 3. Dodge enemy shots - Priority override
        const enemyBullets = bullets.filter(b => b.isEnemy);
        let dodgeX = 0;
        let dodgeY = 0;
        let isCriticalDodge = false;
        let highestDanger = 0;

        for (const bullet of enemyBullets) {
            const bsX = self.x - bullet.x;
            const bsY = self.y - bullet.y;
            const bSpeed = Math.hypot(bullet.vx, bullet.vy);
            if (bSpeed === 0) continue;

            const bux = bullet.vx / bSpeed;
            const buy = bullet.vy / bSpeed;

            const dot = bsX * bux + bsY * buy;
            // Only care about bullets approaching
            if (dot > 0 && dot < 650) {
                const projX = bullet.x + bux * dot;
                const projY = bullet.y + buy * dot;
                const distToPath = Math.hypot(self.x - projX, self.y - projY);

                if (distToPath < 90) { // Safety margin
                    isCriticalDodge = true;
                    // Dodge perpendicular to bullet path
                    const danger = 1 - (distToPath / 90);
                    if (danger > highestDanger) highestDanger = danger;

                    // Choose dodge direction based on which side of the path we are on
                    // to maximize exit speed from path
                    const side = Math.sign(bsX * (-buy) + bsY * bux);
                    const forceDir = side !== 0 ? side : this.dodgeDirection;
                    
                    dodgeX += (-buy) * forceDir * danger;
                    dodgeY += (bux) * forceDir * danger;
                }
            }
        }

        if (isCriticalDodge) {
            // When dodging, give it massive priority
            moveX = moveX * 0.1 + dodgeX * 3.5;
            moveY = moveY * 0.1 + dodgeY * 3.5;
            
            // Periodically consider flipping orbit direction if we get stuck or to confuse enemy
            if (Math.random() < 0.005) this.dodgeDirection *= -1;
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
            getProjectedPos(timeToHit, 0.4), // Predicted speed maintaining drift
            getProjectedPos(timeToHit, 0.7), // Slight acceleration
            getProjectedPos(timeToHit, 0.1)  // Breaking slightly
        ];

        // Shooting constraints
        let canShoot = false;
        if (opponent.energy <= 0 || !this.isOpponentActivelyShooting) {
            canShoot = true; 
        } else {
            if (self.energy >= 100) this.waitingForFull = false;
            if (self.energy < 50) this.waitingForFull = true;
            if (!this.waitingForFull && self.energy >= 50) canShoot = true;
        }

        // Don't shoot if too far
        if (dist > 600) canShoot = false;

        if (canShoot) {
            let finalTarget;
            if (dist < 150) {
                finalTarget = { x: opponent.x, y: opponent.y };
            } else {
                // Pick the target in the sequence
                finalTarget = targets[this.lastPredictionIndex];
            }

            const fired = this.context.fireAt(finalTarget.x, finalTarget.y);
            if (fired) {
                // Change point less often to create "bursts" at a location
                if (Math.random() < 0.3) {
                    this.lastPredictionIndex = (this.lastPredictionIndex + 1) % targets.length;
                }
            }
        }
    }
}
