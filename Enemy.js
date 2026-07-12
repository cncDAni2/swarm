import { BasicMeleeAI } from './ai/BasicMeleeAI.js';
import { BasicRiflemanAI } from './ai/BasicRiflemanAI.js';
import { FlankerAI } from './ai/FlankerAI.js';
import { SkyPulseAI } from './ai/SkyPulseAI.js';
import { ReviAI } from './ai/ReviAI.js';

export class Enemy {
    constructor(x, y, type, shieldExpiry = 0) {
        this.x = x;
        this.y = y;
        this.size = 50;
        this.type = type;
        this.stunRemaining = 0;
        this.shieldExpiry = shieldExpiry;
        
        if (type === 'melee') {
            this.color = 'red';
            this.health = 5;
            this.ai = new BasicMeleeAI(this);
        } else if (type === 'rifleman') {
            this.color = '#8B0000';
            this.health = 1;
            this.ai = new BasicRiflemanAI(this);
        } else if (type === 'flanker') {
            this.color = 'cyan';
            this.size = 35;
            this.health = 3;
            this.ai = new FlankerAI(this);
        } else if (type === 'sky-pulse') {
            this.color = 'blue';
            this.size = 50;
            this.health = 3;
            this.ai = new SkyPulseAI(this);
        } else if (type === 'revi') {
            this.color = 'purple';
            this.size = 60;
            this.health = 20;
            this.damage = 20;
            this.ai = new ReviAI(this);
        }
    }

    update(player, enemies, bullets, currentTime, deltaTime, spawnBullet, canvasWidth, canvasHeight) {
        // No decrementing logic needed, we check against currentTime
        
        if (this.stunRemaining > 0) {
            this.stunRemaining -= deltaTime;
            return;
        }

        // Check if this enemy has a partner (Melee -> Rifleman)
        this.hasActivePartner = (this.ai && this.ai.partner && enemies.includes(this.ai.partner));

        if (this.type === 'rifleman') {
            this.ai.update(player, enemies, bullets, currentTime, spawnBullet);
        } else if (this.type === 'sky-pulse') {
            this.ai.update(player, enemies, bullets, currentTime, spawnBullet);
        } else if (this.type === 'flanker') {
            this.ai.update(player, enemies, bullets, currentTime);
        } else if (this.type === 'melee') {
            this.ai.update(player, enemies, bullets, currentTime);
        } else if (this.type === 'revi') {
            this.ai.update(player, enemies, bullets, currentTime, spawnBullet, canvasWidth, canvasHeight);
        } else {
            this.ai.update(player, enemies);
        }
    }

    draw(ctx, assets, currentTime) {
        ctx.save();
        
        // Background red pulse for Rifleman
        if (this.type === 'rifleman') {
            const auraRadius = this.size;
            const pulse = 0.8 + Math.sin(currentTime / 100) * 0.2;
            const currentRadius = auraRadius * pulse;
            
            const grad = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, currentRadius
            );
            grad.addColorStop(0, 'rgba(255, 0, 0, 0.6)');
            grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // Get sprite for enemy type
        let sprite = null;
        if (assets) {
            if (this.type === 'melee') sprite = assets.melee;
            else if (this.type === 'rifleman') sprite = assets.rifleman;
            else if (this.type === 'flanker') sprite = assets.flanker;
            else if (this.type === 'sky-pulse') sprite = assets.skyPulse;
            else if (this.type === 'revi') {
                if (this.ai && (this.ai.phase === 'TARGETING' || this.ai.phase === 'ATTACK')) {
                    sprite = assets.reviAttack;
                } else {
                    const frame = Math.floor(currentTime / 500) % 2;
                    sprite = frame === 0 ? assets.revi1 : assets.revi2;
                }
            }
        }

        // Draw the enemy sprite first
        if (sprite && sprite.complete) {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            if (this.stunRemaining > 0) {
                ctx.filter = 'brightness(1.5) sepia(1) hue-rotate(-50deg) saturate(5)';
            }

            ctx.drawImage(sprite, -this.size / 2, -this.size / 2, this.size, this.size);
            ctx.restore();
        } else {
            // Fallback shapes...
            if (this.type === 'sky-pulse') {
                const pulse = 0.8 + Math.sin(currentTime / 200) * 0.2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, (this.size / 2) * pulse, 0, Math.PI * 2);
                ctx.fillStyle = 'blue';
                ctx.fill();
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (this.type === 'revi') {
                ctx.fillStyle = this.ai && this.ai.phase === 'ATTACK' ? 'white' : 'purple';
                ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
            } else {
                ctx.fillStyle = this.stunRemaining > 0 ? '#ff8888' : this.color;
                if (this.type === 'rifleman') {
                    ctx.beginPath();
                    const halfSize = this.size / 2;
                    ctx.moveTo(this.x, this.y - halfSize);
                    ctx.lineTo(this.x - halfSize, this.y + halfSize);
                    ctx.lineTo(this.x + halfSize, this.y + halfSize);
                    ctx.closePath();
                    ctx.fill();
                } else if (this.type === 'flanker') {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
                }
            }
        }

        // Draw spawn shield (yellow circle) ABOVE the enemy
        if (currentTime < this.shieldExpiry) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 3;
            // Pulse opacity
            const alpha = 0.4 + Math.sin(currentTime / 100) * 0.2;
            ctx.globalAlpha = alpha;
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }
}

