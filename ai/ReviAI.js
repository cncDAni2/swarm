export class ReviAI {
    constructor(owner) {
        this.owner = owner;
        // Legacy field: maxSpeed now lives on Enemy; kept for any external readers.
        this.speed = owner.maxSpeed;
        this.phase = 'RANDOM_MOVE'; // 'RANDOM_MOVE', 'TARGETING', 'ATTACK'
        this.phaseStartTime = 0;
        this.randomDirection = { x: 0, y: 0 };
        this.lastDirectionChangeTime = 0;
        this.randomMoveCount = 0;
        
        this.targetPoint = { x: 0, y: 0 };
        this.attackTriggered = false;
        this.attackDuration = 500; // Flash for 500ms
        this._pendingBounds = null;
    }

    update(player, enemies, bullets, currentTime, spawnBullet, canvasWidth, canvasHeight, barriers, lineRectIntersect) {
        if (this.phaseStartTime === 0) this.phaseStartTime = currentTime;
        this._pendingBounds = { canvasWidth, canvasHeight };

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
            
            // Intent from unit heading (physics applies accel / maxSpeed)
            this.owner.setMoveIntent(this.randomDirection.x, this.randomDirection.y);
            this.owner.setLookTarget(
                this.owner.x + this.randomDirection.x,
                this.owner.y + this.randomDirection.y
            );

        } else if (this.phase === 'TARGETING') {
            this.targetPoint = { x: player.x, y: player.y };
            // Brake while locking on
            this.owner.setMoveIntent(0, 0);
            this.owner.setLookTarget(player.x, player.y);
            
            if (currentTime - this.phaseStartTime > 2000) {
                this.phase = 'ATTACK';
                this.phaseStartTime = currentTime;
                this.attackTriggered = true;
            }
        } else if (this.phase === 'ATTACK') {
            this.owner.setMoveIntent(0, 0);
            this.owner.setLookTarget(this.targetPoint.x, this.targetPoint.y);
            if (currentTime - this.phaseStartTime > this.attackDuration) {
                this.phase = 'RANDOM_MOVE';
                this.phaseStartTime = currentTime;
                this.lastDirectionChangeTime = 0;
            }
        }
    }

    setRandomDirection() {
        const angle = Math.random() * Math.PI * 2;
        // Unit direction; Enemy physics scales by accel/maxSpeed
        this.randomDirection = {
            x: Math.cos(angle),
            y: Math.sin(angle)
        };
    }

    /** Clamp after physics; bounce intent/velocity off edges. */
    applyBoundsAfterPhysics() {
        const b = this._pendingBounds;
        if (!b || !b.canvasWidth || !b.canvasHeight) return;

        const margin = 60;
        const o = this.owner;
        let bounced = false;

        if (o.x < margin) {
            o.x = margin;
            if (o.vx < 0) o.vx = -o.vx * 0.5;
            this.randomDirection.x = Math.abs(this.randomDirection.x) || 1;
            bounced = true;
        } else if (o.x > b.canvasWidth - margin) {
            o.x = b.canvasWidth - margin;
            if (o.vx > 0) o.vx = -o.vx * 0.5;
            this.randomDirection.x = -Math.abs(this.randomDirection.x || 1);
            bounced = true;
        }

        if (o.y < margin) {
            o.y = margin;
            if (o.vy < 0) o.vy = -o.vy * 0.5;
            this.randomDirection.y = Math.abs(this.randomDirection.y) || 1;
            bounced = true;
        } else if (o.y > b.canvasHeight - margin) {
            o.y = b.canvasHeight - margin;
            if (o.vy > 0) o.vy = -o.vy * 0.5;
            this.randomDirection.y = -Math.abs(this.randomDirection.y || 1);
            bounced = true;
        }

        if (bounced) {
            // Re-normalize bounce direction
            const len = Math.sqrt(
                this.randomDirection.x ** 2 + this.randomDirection.y ** 2
            ) || 1;
            this.randomDirection.x /= len;
            this.randomDirection.y /= len;
        }
    }
}
