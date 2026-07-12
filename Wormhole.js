export class Wormhole {
    constructor(x, y, startTime, pattern = 'duo') {
        this.x = x;
        this.y = y;
        this.startTime = startTime;
        this.spawnCount = 0;
        this.pattern = pattern;
        
        if (pattern === 'flanker') {
            this.maxSpawnsCount = { flanker: 10, skyPulse: 6 };
            this.maxSpawns = 16;
            this.spawnRate = 1000; 
        } else {
            this.maxSpawns = 20;
            this.spawnRate = 1000;
        }
        
        this.activeDelay = 5000;
        this.lastSpawn = 0;
        this.radius = 40;
        this._flankSpawnSeq = 0;
    }

    update(now, spawnCallback) {
        const timeActive = now - this.startTime;

        if (timeActive >= this.activeDelay) {
            if (now - this.lastSpawn >= this.spawnRate && this.spawnCount < this.maxSpawns) {
                let type;
                if (this.pattern === 'flanker') {
                    // Hybrid spawn: spread sky-pulse within flankers
                    if (this.spawnCount < 10) {
                        type = 'flanker';
                    } else {
                        type = 'sky-pulse';
                    }
                } else {
                    // Alternating spawn: 2x melee, 2x rifleman
                    const sequenceIndex = this.spawnCount % 4;
                    type = (sequenceIndex < 2) ? 'melee' : 'rifleman';
                }
                
                spawnCallback(
                    this.x, 
                    this.y, 
                    type, 
                    this.startTime + this.activeDelay + 4000 // All enemies from this wormhole lose shield at the same time
                );
                this.spawnCount++;
                this.lastSpawn = now;
            }
        }
    }

    isFinished() {
        return this.spawnCount >= this.maxSpawns;
    }

    draw(ctx, spawnImg) {
        ctx.save();
        
        if (spawnImg && spawnImg.complete) {
            ctx.save();
            ctx.translate(this.x, this.y);
            // Rotáló animáció a féregjáratnak
            ctx.rotate(Date.now() / 1000);
            ctx.globalAlpha = 0.7;
            ctx.drawImage(spawnImg, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
            ctx.restore();
        } else {
            // Fallback szaggatott kör
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 5]);
            ctx.lineDashOffset = -Date.now() / 50; 
            ctx.stroke();
        }
        
        ctx.restore();
    }
}
