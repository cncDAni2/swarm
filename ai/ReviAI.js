export class ReviAI {
    constructor(owner) {
        this.owner = owner;
        this.speed = 2.5;
        this.phase = 'RANDOM_MOVE'; // 'RANDOM_MOVE', 'TARGETING', 'ATTACK'
        this.phaseStartTime = 0;
        this.randomDirection = { x: 0, y: 0 };
        this.lastDirectionChangeTime = 0;
        this.randomMoveCount = 0;
        
        this.targetPoint = { x: 0, y: 0 };
        this.attackTriggered = false;
        this.attackDuration = 500; // Flash for 500ms
    }

    update(player, enemies, bullets, currentTime, spawnBullet, canvasWidth, canvasHeight, barriers, lineRectIntersect) {
        if (this.phaseStartTime === 0) this.phaseStartTime = currentTime;

        if (this.phase === 'RANDOM_MOVE') {
            if (this.randomDirection.x === 0 && this.randomDirection.y === 0) {
                this.setRandomDirection();
                this.lastDirectionChangeTime = currentTime;
            }

            const timeInPhase = currentTime - this.phaseStartTime;
            
            // Should move for at least 3 seconds
            if (timeInPhase > 3000) {
                // Check line of sight every 200ms after minimum move duration
                if (!this.lastLosCheckTime || currentTime - this.lastLosCheckTime > 200) {
                    this.lastLosCheckTime = currentTime;
                    
                    const isBlocked = barriers && barriers.some(wall => 
                        lineRectIntersect(
                            this.owner.x, this.owner.y, player.x, player.y,
                            wall.x - wall.size/2, wall.y - wall.size/2, wall.size, wall.size
                        )
                    );

                    if (!isBlocked) {
                        this.phase = 'TARGETING';
                        this.phaseStartTime = currentTime;
                        this.randomDirection = { x: 0, y: 0 };
                        this.needsAttackSound = true; // Flag for Game.js to play sound
                    }
                }
            }

            // Always move while in RANDOM_MOVE
            if (currentTime - this.lastDirectionChangeTime > 1000) {
                this.setRandomDirection();
                this.lastDirectionChangeTime = currentTime;
            }
            
            this.move(this.randomDirection.x, this.randomDirection.y);
            this.keepInBounds(canvasWidth, canvasHeight);

        } else if (this.phase === 'TARGETING') {
            this.targetPoint = { x: player.x, y: player.y };
            
            if (currentTime - this.phaseStartTime > 2000) {
                this.phase = 'ATTACK';
                this.phaseStartTime = currentTime;
                this.attackTriggered = true;
            }
        } else if (this.phase === 'ATTACK') {
            if (currentTime - this.phaseStartTime > this.attackDuration) {
                this.phase = 'RANDOM_MOVE';
                this.phaseStartTime = currentTime;
                this.lastDirectionChangeTime = 0;
            }
        }
    }

    setRandomDirection() {
        const angle = Math.random() * Math.PI * 2;
        this.randomDirection = {
            x: Math.cos(angle) * this.speed,
            y: Math.sin(angle) * this.speed
        };
    }

    move(vx, vy) {
        this.owner.x += vx;
        this.owner.y += vy;
    }

    keepInBounds(canvasWidth, canvasHeight) {
        const margin = 60; // Slightly larger margin to ensure they don't get stuck on edges
        let bounced = false;

        if (this.owner.x < margin) {
            this.owner.x = margin;
            this.randomDirection.x = Math.abs(this.randomDirection.x);
            bounced = true;
        } else if (canvasWidth && this.owner.x > canvasWidth - margin) {
            this.owner.x = canvasWidth - margin;
            this.randomDirection.x = -Math.abs(this.randomDirection.x);
            bounced = true;
        }

        if (this.owner.y < margin) {
            this.owner.y = margin;
            this.randomDirection.y = Math.abs(this.randomDirection.y);
            bounced = true;
        } else if (canvasHeight && this.owner.y > canvasHeight - margin) {
            this.owner.y = canvasHeight - margin;
            this.randomDirection.y = -Math.abs(this.randomDirection.y);
            bounced = true;
        }

        if (bounced) {
            this.lastDirectionChangeTime = Date.now(); // Internal state vs game time but we'll use a flag or just keep it simple
        }
    }
}
