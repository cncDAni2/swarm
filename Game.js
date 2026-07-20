import { AudioService } from './AudioService.js';
import { createBotController, getBotDefinition } from './bots/BotRegistry.js';

export class Game {
    constructor(canvas, botChoices = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audio = new AudioService();
        this.gameTime = 0;
        this.bullets = [];
        this.keys = {};
        this.mousePos = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.matchEnded = false;
        this.winner = null;
        this.botControllers = new Map();
        this.bots = [
            this.createBot('left', botChoices.left || 'idle-sentinel'),
            this.createBot('right', botChoices.right || 'idle-observer')
        ];
        this.assets = {
            playerIdle: new Image(),
            playerShoot: new Image(),
            crosshair: new Image()
        };
        this.assets.playerIdle.src = './assets/player-idle.png';
        this.assets.playerShoot.src = './assets/player-shoot.png';
        this.assets.crosshair.src = './assets/chosshair.png';
        this.placeBots();
        this.setupEventListeners();
        this.startControllers();
    }

    createBot(side, typeId) {
        const type = getBotDefinition(typeId);
        return {
            side,
            typeId: type.id,
            name: type.name,
            x: 0,
            y: 0,
            size: 50,
            facing: side === 'left' ? 1 : -1,
            vx: 0,
            vy: 0,
            accel: 1.5,
            friction: 0.12,
            maxSpeed: 12,
            health: 100,
            maxHealth: 100,
            energy: 100,
            maxEnergy: 100,
            lastShotTime: -Infinity,
            shootVisualTimer: 0,
            bulletSpeed: 21,
            fireRateDelay: 200
        };
    }

    placeBots() {
        const width = this.canvas.width || window.innerWidth;
        const height = this.canvas.height || window.innerHeight;
        this.bots[0].x = width * 0.2;
        this.bots[0].y = height / 2;
        this.bots[1].x = width * 0.8;
        this.bots[1].y = height / 2;
    }

    cleanup() {
        this.audio.stopAll();
        this.stopControllers();
        this.bots = [];
        this.bullets = [];
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        window.removeEventListener('mousedown', this._boundMouseDown);
        window.removeEventListener('mouseup', this._boundMouseUp);
        window.removeEventListener('mousemove', this._boundMouseMove);
    }

    setupEventListeners() {
        this._boundKeyDown = event => { this.keys[event.code] = true; };
        this._boundKeyUp = event => { this.keys[event.code] = false; };
        this._boundMouseDown = event => {
            if (event.button === 0) this.isMouseDown = true;
        };
        this._boundMouseUp = event => {
            if (event.button === 0) this.isMouseDown = false;
        };
        this._boundMouseMove = event => {
            this.mousePos.x = event.clientX;
            this.mousePos.y = event.clientY;
        };
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
        window.addEventListener('mousedown', this._boundMouseDown);
        window.addEventListener('mouseup', this._boundMouseUp);
        window.addEventListener('mousemove', this._boundMouseMove);
    }

    update(deltaTime) {
        if (this.matchEnded || !Number.isFinite(deltaTime) || deltaTime <= 0) return;

        const frameTime = Math.min(64, deltaTime);
        const scale = frameTime / 16;
        this.gameTime += frameTime;
        this.updateControllers(frameTime);

        this.bots.forEach(bot => {
            if (bot.health <= 0) return;
            if (bot.shootVisualTimer > 0) bot.shootVisualTimer -= frameTime;
            this.regenerateEnergy(bot, frameTime);
        });
        this.updateBullets(scale);
    }

    moveBot(bot, directionX, directionY, deltaTime) {
        const scale = Math.min(64, Math.max(0, deltaTime)) / 16;
        const magnitude = Math.hypot(directionX, directionY);
        if (magnitude > 0) {
            bot.vx += (directionX / magnitude) * bot.accel * scale;
            bot.vy += (directionY / magnitude) * bot.accel * scale;
            bot.facing = Math.sign(directionX) || bot.facing;
        }

        const friction = Math.max(0, 1 - bot.friction * scale);
        bot.vx *= friction;
        bot.vy *= friction;
        const speed = Math.hypot(bot.vx, bot.vy);
        if (speed > bot.maxSpeed) {
            bot.vx = (bot.vx / speed) * bot.maxSpeed;
            bot.vy = (bot.vy / speed) * bot.maxSpeed;
        }

        const radius = bot.size / 2;
        bot.x = Math.max(radius, Math.min(this.canvas.width - radius, bot.x + bot.vx * scale));
        bot.y = Math.max(radius, Math.min(this.canvas.height - radius, bot.y + bot.vy * scale));
    }

    firePlasma(bot, targetX, targetY) {
        if (bot.health <= 0 || this.gameTime - bot.lastShotTime < bot.fireRateDelay || bot.energy < 1) return false;

        const angle = Math.atan2(targetY - bot.y, targetX - bot.x);
        const isPowerful = bot.energy > 80;
        this.bullets.push({
            x: bot.x,
            y: bot.y,
            vx: Math.cos(angle) * bot.bulletSpeed,
            vy: Math.sin(angle) * bot.bulletSpeed,
            radius: isPowerful ? 6 : 4,
            color: isPowerful ? '#87ceeb' : '#f4d35e',
            damage: isPowerful ? 20 : 12,
            source: bot
        });
        bot.energy = Math.max(0, bot.energy - 2);
        bot.facing = Math.sign(Math.cos(angle)) || bot.facing;
        bot.shootVisualTimer = 100;
        bot.lastShotTime = this.gameTime;
        if (isPowerful) this.audio.playStrongShoot();
        else this.audio.playRandomShoot();
        return true;
    }

    regenerateEnergy(bot, deltaTime) {
        if (this.gameTime - bot.lastShotTime >= 2000) {
            bot.energy = Math.min(bot.maxEnergy, bot.energy + 50 * deltaTime / 1000);
        }
    }

    updateBullets(scale) {
        for (let index = this.bullets.length - 1; index >= 0; index--) {
            const bullet = this.bullets[index];
            if (!bullet || !bullet.x || !bullet.y) break;
            bullet.x += bullet.vx * scale;
            bullet.y += bullet.vy * scale;
            const target = this.bots.find(bot => bot !== bullet.source && bot.health > 0
                && Math.hypot(bot.x - bullet.x, bot.y - bullet.y) <= bot.size / 2 + bullet.radius);
            if (target) {
                target.health = Math.max(0, target.health - bullet.damage);
                this.bullets.splice(index, 1);
                if (target.health === 0) {
                    this.endMatch(bullet.source);
                    return;
                }
                continue;
            }
            const outsideArena = bullet.x < -bullet.radius || bullet.x > this.canvas.width + bullet.radius
                || bullet.y < -bullet.radius || bullet.y > this.canvas.height + bullet.radius;
            if (outsideArena) this.bullets.splice(index, 1);
        }
    }

    draw() {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.bots.filter(bot => bot.health > 0).forEach(bot => this.drawBot(bot));
        this.drawBullets();
        if (this.bots.some(bot => bot.typeId === 'manual' && bot.health > 0)) this.drawCrosshair();
        if (this.matchEnded) this.drawEndScreen();
    }

    drawBot(bot) {
        const ctx = this.ctx;
        const image = bot.shootVisualTimer > 0 ? this.assets.playerShoot : this.assets.playerIdle;
        ctx.save();
        ctx.translate(bot.x, bot.y);
        if (bot.facing < 0) ctx.scale(-1, 1);
        if (image.complete && image.naturalWidth > 0) {
            ctx.drawImage(image, -bot.size / 2, -bot.size /2, bot.size, bot.size);
        } else {
            ctx.fillStyle = '#87ceeb';
            ctx.fillRect(-bot.size / 2, -bot.size / 2, bot.size, bot.size);
        }
        ctx.restore();

        const barWidth = 64;
        const barHeight = 7;
        const barX = bot.x - barWidth / 2;
        const barY = bot.y - bot.size / 2 - 16;
        ctx.fillStyle = '#24080a';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#d93a42';
        ctx.fillRect(barX, barY, barWidth * (bot.health / bot.maxHealth), barHeight);
        ctx.strokeStyle = '#f7f7f2';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        const energyBarHeight = 3;
        const energyBarY = barY + barHeight + 2;
        ctx.fillStyle = '#071f3d';
        ctx.fillRect(barX, energyBarY, barWidth, energyBarHeight);
        ctx.fillStyle = '#39a9ff';
        ctx.fillRect(barX, energyBarY, barWidth * (bot.energy / bot.maxEnergy), energyBarHeight);
        ctx.strokeStyle = '#b9e2ff';
        ctx.strokeRect(barX, energyBarY, barWidth, energyBarHeight);
    }

    drawBullets() {
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.bullets.forEach(bullet => {
            this.ctx.strokeStyle = bullet.color;
            this.ctx.beginPath();
            this.ctx.moveTo(bullet.x, bullet.y);
            this.ctx.lineTo(bullet.x - bullet.vx * 1.2, bullet.y - bullet.vy * 1.2);
            this.ctx.stroke();
        });
    }

    drawCrosshair() {
        const { x, y } = this.mousePos;
        const image = this.assets.crosshair;
        if (!image.complete || image.naturalWidth === 0) return;
        const size = 32;
        this.ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    }

    startControllers() {
        this.bots.forEach(bot => {
            const controller = createBotController(bot.typeId);
            this.botControllers.set(bot.side, controller);
            controller.start(this.createBotContext(bot));
        });
    }

    stopControllers() {
        this.botControllers.forEach(controller => controller.stop());
        this.botControllers.clear();
    }

    createBotContext(bot) {
        return Object.freeze({
            getState: () => this.getBotState(bot),
            getInput: () => this.getManualInput(),
            move: (directionX, directionY) => {
                if (!this.matchEnded && bot.health > 0) this.moveBot(bot, directionX, directionY, this.currentFrameTime);
            },
            fireAt: (targetX, targetY) => {
                if (!this.matchEnded) return this.firePlasma(bot, targetX, targetY);
                return false;
            }
        });
    }

    getManualInput() {
        let moveX = 0;
        let moveY = 0;
        if (this.keys.KeyW || this.keys.ArrowUp) moveY -= 1;
        if (this.keys.KeyS || this.keys.ArrowDown) moveY += 1;
        if (this.keys.KeyA || this.keys.ArrowLeft) moveX -= 1;
        if (this.keys.KeyD || this.keys.ArrowRight) moveX += 1;
        return Object.freeze({
            moveX,
            moveY,
            aimX: this.mousePos.x,
            aimY: this.mousePos.y,
            isFiring: this.isMouseDown
        });
    }

    getBotState(bot) {
        const opponent = this.bots.find(candidate => candidate !== bot);
        return Object.freeze({
            time: this.gameTime,
            self: Object.freeze({
                x: bot.x,
                y: bot.y,
                vx: bot.vx,
                vy: bot.vy,
                health: bot.health,
                maxHealth: bot.maxHealth,
                energy: bot.energy,
                maxEnergy: bot.maxEnergy
            }),
            opponent: Object.freeze({
                x: opponent.x,
                y: opponent.y,
                vx: opponent.vx,
                vy: opponent.vy,
                health: opponent.health,
                maxHealth: opponent.maxHealth,
                energy: opponent.energy
            }),
            bullets: this.bullets.map(b => Object.freeze({
                x: b.x,
                y: b.y,
                vx: b.vx,
                vy: b.vy,
                radius: b.radius,
                damage: b.damage,
                isEnemy: b.source !== bot
            })),
            arena: Object.freeze({ width: this.canvas.width, height: this.canvas.height }),
            matchEnded: this.matchEnded
        });
    }

    updateControllers(deltaTime) {
        this.currentFrameTime = deltaTime;
        this.botControllers.forEach(controller => {
            if (typeof controller.update === 'function') controller.update(deltaTime);
        });
    }

    endMatch(winner) {
        if (this.matchEnded) return;
        this.matchEnded = true;
        this.winner = winner;
        this.bullets = [];
        this.isMouseDown = false;
        this.stopControllers();
    }

    drawEndScreen() {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.font = 'bold 42px Trebuchet MS, sans-serif';
        const matchTitle = this.bots.map(bot => bot.name).join(' VS ');
        ctx.fillText(matchTitle, this.canvas.width / 2, this.canvas.height / 2 - 100);

        ctx.font = 'bold 54px Trebuchet MS, sans-serif';
        ctx.fillStyle = '#f4b942'; // Gold color for winner
        ctx.fillText(this.winner.name.toUpperCase(), this.canvas.width / 2, this.canvas.height / 2 - 10);
        
        ctx.font = '24px Trebuchet MS, sans-serif';
        ctx.fillStyle = '#ffffff';
        const healthPercentage = Math.round(this.winner.health / this.winner.maxHealth * 100);
        const matchDuration = (this.gameTime / 1000).toFixed(1);
        ctx.fillText(`VICTORIOUS • ${healthPercentage}% HEALTH • ${matchDuration} SECONDS`, this.canvas.width / 2, this.canvas.height / 2 + 50);

        ctx.font = 'bold 20px Trebuchet MS, sans-serif';
        ctx.fillStyle = '#87ceeb'; // Sky color for button hint
        ctx.fillText('PRESS R TO REMATCH', this.canvas.width / 2, this.canvas.height / 2 + 110);
        
        ctx.restore();
    }
}
