import { Enemy } from './Enemy.js';

export class Boss {
    constructor(canvasWidth, canvasHeight, currentTime) {
        this.x = canvasWidth / 2;
        this.y = canvasHeight / 2;
        this.size = 270;
        this.health = 100;
        this.maxHealth = 100;
        
        // Spawning logic (internal tiny enemies)
        this.lastSpawnTime = currentTime;
        this.spawnCooldown = 2000 + Math.random() * 2000;
        
        // Ability 1: Beams
        this.lastBeamTime = currentTime + 5000; 
        this.beamCooldown = 12000;
        this.isWarningBeam = false;
        this.beamStartTime = 0;
        this.beamDuration = 500;
        this.beamWarningDuration = 1000;
        this.beamAngles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
        this.beamHasDealtDamage = false;

        // Ability 2: Circle Stream (54 balls, 1 every 100ms, 0 to 540 degrees)
        this.lastSpiralTime = currentTime + 2000;
        this.spiralCooldown = 7000; // Longer cooldown for this intense attack
        this.spiralStreamCount = 0;
        this.lastSpiralStreamTime = 0;
        
        this.type = 'boss';

        // Blinking logic
        this.blinkTimer = 0;
        this.isBlinking = false;
        this.nextBlinkTime = currentTime + 2000 + Math.random() * 3000;
    }

    update(player, enemies, bullets, currentTime, deltaTime, spawnBullet, onBossDeath) {
        // Blink logic
        if (!this.isBlinking && currentTime >= this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkTimer = currentTime;
        }
        if (this.isBlinking && currentTime - this.blinkTimer >= 200) {
            this.isBlinking = false;
            this.nextBlinkTime = currentTime + 2000 + Math.random() * 3000;
        }

        // 1. Spawning enemies from 4 sides
        if (currentTime - this.lastSpawnTime >= this.spawnCooldown) {
            const sides = [
                { x: this.x, y: this.y - this.size / 2 }, // Top
                { x: this.x + this.size / 2, y: this.y }, // Right
                { x: this.x, y: this.y + this.size / 2 }, // Bottom
                { x: this.x - this.size / 2, y: this.y }  // Left
            ];
            const side = sides[Math.floor(Math.random() * sides.length)];
            const types = ['melee', 'rifleman', 'flanker', 'sky-pulse'];
            const type = types[Math.floor(Math.random() * types.length)];
            
            const newEnemy = new Enemy(side.x, side.y, type, 0); // Boss minions are immediately vulnerable
            enemies.push(newEnemy);
            
            this.lastSpawnTime = currentTime;
            this.spawnCooldown = 2000 + Math.random() * 2000;
        }

        // 2. Beam Attack
        if (!this.isWarningBeam && currentTime - this.lastBeamTime >= this.beamCooldown) {
            this.isWarningBeam = true;
            this.beamStartTime = currentTime;
            this.beamHasDealtDamage = false;
        }

        if (this.isWarningBeam) {
            const timeInEffect = currentTime - this.beamStartTime;
            if (timeInEffect >= this.beamWarningDuration + this.beamDuration) {
                this.isWarningBeam = false;
                this.lastBeamTime = currentTime;
                this.beamCooldown = 10000 + Math.random() * 5000;
            } else if (timeInEffect >= this.beamWarningDuration && !this.beamHasDealtDamage) {
                // Check collision with player
                if (this.checkBeamCollision(player)) {
                    player.health -= 30;
                    this.beamHasDealtDamage = true;
                }
            }
        }

        // 3. Circle Stream Attack (54 balls, 100ms interval, 10-degree increments)
        if (currentTime - this.lastSpiralTime >= this.spiralCooldown) {
            if (this.spiralStreamCount < 54) {
                if (currentTime - this.lastSpiralStreamTime >= 100) {
                    const angle = (this.spiralStreamCount * 10) * (Math.PI / 180) - (Math.PI / 2); // Start North (0 deg / -90 rad)
                    bullets.push({
                        x: this.x,
                        y: this.y,
                        vx: Math.cos(angle) * 1.5,
                        vy: Math.sin(angle) * 1.5,
                        radius: 12, // Adjusted to be 24 units total diameter (radius 12)
                        color: 'yellow',
                        ownerType: 'boss-spiral',
                        spiralAngle: angle,
                        spiralStep: 0,
                        createdAt: currentTime,
                        source: this
                    });
                    this.spiralStreamCount++;
                    this.lastSpiralStreamTime = currentTime;
                }
            } else {
                this.spiralStreamCount = 0;
                this.lastSpiralTime = currentTime;
            }
        }

        if (this.health <= 0) {
            onBossDeath();
        }
    }

    checkBeamCollision(player) {
        const px = player.x;
        const py = player.y;
        const beamWidth = 40;
        const playerRadius = player.size / 2;

        for (const angle of this.beamAngles) {
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            
            const vpx = px - this.x;
            const vpy = py - this.y;
            
            const proj = vpx * dx + vpy * dy;
            
            if (proj > 0) {
                const closestX = this.x + dx * proj;
                const closestY = this.y + dy * proj;
                const distSq = (px - closestX)**2 + (py - closestY)**2;
                
                // Radius-based collision for better feel
                if (distSq < ((beamWidth / 2) + playerRadius)**2) return true;
            }
        }
        return false;
    }

    draw(ctx, currentTime, assets) {
        ctx.save();
        
        // Draw warning/beams
        if (this.isWarningBeam) {
            const timeInEffect = currentTime - this.beamStartTime;
            if (timeInEffect < this.beamWarningDuration) {
                // Warning phase
                ctx.strokeStyle = `rgba(255, 255, 0, ${0.2 + (timeInEffect / this.beamWarningDuration) * 0.3})`;
                ctx.lineWidth = 10;
            } else {
                // Active phase
                ctx.strokeStyle = `rgba(255, 255, 0, 0.8)`;
                ctx.lineWidth = 40;
                ctx.shadowBlur = 20;
                ctx.shadowColor = 'yellow';
            }

            for (const angle of this.beamAngles) {
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x + Math.cos(angle) * 3000, this.y + Math.sin(angle) * 3000);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }

        // Draw Boss Body
        const pulse = 1 + Math.sin(currentTime / 400) * 0.03; // Pulsing 3%
        const drawSize = this.size * pulse;
        
        ctx.translate(this.x, this.y);
        // Rotation removed as requested
        
        // Draw Sprite
        const sprite = this.isBlinking ? assets.bossClosed : assets.boss;
        if (sprite && sprite.complete) {
            ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        }
        
        ctx.restore();

        // Health Bar UI
        this.drawHealthBar(ctx);
    }

    drawHealthBar(ctx) {
        const barWidth = 400;
        const barHeight = 15;
        const bx = this.x - barWidth / 2;
        const by = this.y - this.size / 2 - 40;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(bx, by, barWidth, barHeight);
        
        const healthPercent = Math.max(0, this.health / this.maxHealth);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(bx, by, barWidth * healthPercent, barHeight);
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barWidth, barHeight);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ANOMALY CORE', this.x, by - 5);
    }
}
