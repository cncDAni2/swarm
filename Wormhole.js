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

        // Configurable spawn counts for each pattern
        if (pattern === 'flanker') {
            this.spawnLimits = { 'flanker': 10, 'sky-pulse': 6 };
            this.maxSpawns = 16;
        } else {
            this.spawnLimits = { 'melee': 10, 'rifleman': 10 };
            this.maxSpawns = 20;
        }
        
        this.spawnCountTotal = 0;
        this.spawnedCounts = {}; // Track how many of each type we've spawned
        Object.keys(this.spawnLimits).forEach(type => this.spawnedCounts[type] = 0);
    }

    update(now, spawnCallback) {
        const timeActive = now - this.startTime;

        if (timeActive >= this.activeDelay) {
            if (now - this.lastSpawn >= this.spawnRate && this.spawnCountTotal < this.maxSpawns) {
                let type;
                if (this.pattern === 'flanker') {
                    // Pattern: Flankers first, then Sky-Pulses
                    if (this.spawnedCounts['flanker'] < this.spawnLimits['flanker']) {
                        type = 'flanker';
                    } else {
                        type = 'sky-pulse';
                    }
                } else {
                    // Pattern: Alternating 2x melee, 2x rifleman
                    const sequenceIndex = this.spawnCountTotal % 4;
                    const preferredType = (sequenceIndex < 2) ? 'melee' : 'rifleman';
                    
                    // Fallback if one type is exhausted (though with 10/10 and 20 total it won't happen here)
                    if (this.spawnedCounts[preferredType] < this.spawnLimits[preferredType]) {
                        type = preferredType;
                    } else {
                        // Pick the other type if preferred is full
                        type = Object.keys(this.spawnLimits).find(t => this.spawnedCounts[t] < this.spawnLimits[t]);
                    }
                }
                
                if (type) {
                    spawnCallback(
                        this.x, 
                        this.y, 
                        type, 
                        this.startTime + this.activeDelay + 4000
                    );
                    this.spawnCountTotal++;
                    this.spawnedCounts[type]++;
                    this.lastSpawn = now;
                }
            }
        }
    }

    isFinished() {
        return this.spawnCountTotal >= this.maxSpawns;
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
