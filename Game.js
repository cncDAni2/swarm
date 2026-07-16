import { Enemy } from './Enemy.js';
import { Wormhole } from './Wormhole.js';
import { AudioService } from './AudioService.js';
import { Boss } from './ai/Boss.js';
import { createPlayerShotLane } from './ai/playerShotEvasion.js';
import { applyTankPhysics } from './tankPhysics.js';
import { PlayerBot } from './ai/PlayerBot.js';
import { BotObservationEncoder } from './ai/BotObservationEncoder.js';
import { BOT_DECISION_INTERVAL_MS } from './ai/BotModelSchema.js';
import { encodeTeacherAction, EpisodeRecorder, RewardTracker } from './ai/BotTraining.js';

export class Game {
    constructor(canvas, difficulty = 'ultra-violence', onMainMenu = null, botMode = false) {
        this.canvas = canvas;
        // Fix: canvas dimensions might be 0 if called too early, but index.html handles resize.
        // Let's ensure they are set.
        this.ctx = canvas.getContext('2d');
        this.audio = new AudioService();
        this.difficulty = difficulty;
        this.onMainMenu = onMainMenu;
        this.botMode = botMode;
        this.bot = botMode ? new PlayerBot(this) : null;
        this.botInput = null;
        this.lastBotDecisionTime = -Infinity;
        this.observationEncoder = botMode ? new BotObservationEncoder() : null;
        this.rewardTracker = botMode ? new RewardTracker() : null;
        this.episodeRecorder = botMode ? new EpisodeRecorder() : null;
        
        // Difficulty settings
        let maxHP = 100;
        let regen = 1;
        
        if (this.difficulty === 'hurt-me-plenty') {
            maxHP = 200;
            regen = 2;
        } else if (this.difficulty === 'too-young-to-die') {
            maxHP = 500;
            regen = 3;
        }

        this.player = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            size: 50,
            vx: 0,
            vy: 0,
            accel: 1.5,
            friction: 0.12,
            maxSpeed: 12,
            color: '#87CEEB',
            health: maxHP,
            maxHealth: maxHP,
            regenSpeed: regen,
            energy: 100,
            maxEnergy: 100,
            isExhausted: false,
            lastShootInteractionTime: 0,
            shootVisualTimer: 0
        };

        this.keys = {};
        this.bullets = [];
        this.enemies = [];
        this.explosions = [];
        this.wormholes = [];
        
        this.bulletSpeed = 21;
        this.fireRateDelay = 200;
        this.lastShotTime = 0;
        this.isMouseDown = false;
        this.mousePos = { x: 0, y: 0 };
        this.kills = 0;
        this.boss = null;

        // Full-map virtual fire-lines published on each player shot (400ms).
        // Agile AIs (Flanker, SkyPulse) read these via player.shotLanes.
        this.playerShotLanes = [];
        this.player.shotLanes = this.playerShotLanes;

        // Right-click electric beam weapon
        this.electricBeam = {
            isCharging: false,
            chargeStartTime: 0,
            chargeDuration: 600,
            energyCost: 33,
            aoeRadius: 300,
            aoeDamage: 5,
            beamWidth: 75,
            beamDamage: 18,
            angle: 0,
            // Post-fire visuals (null when inactive)
            effect: null // { startTime, duration, angle, lightningTargets: [{x,y}] }
        };

        // Asset Loading
        this.assets = {
            playerIdle: new Image(),
            playerShoot: new Image(),
            melee: new Image(),
            rifleman: new Image(),
            flanker: new Image(),
            skyPulse: new Image(),
            revi1: new Image(),
            revi2: new Image(),
            reviAttack: new Image(),
            boss: new Image(),
            bossClosed: new Image()
        };
        this.assets.playerIdle.src = './assets/player-idle.png';
        this.assets.playerShoot.src = './assets/player-shoot.png';
        this.assets.melee.src = './assets/BasicMelee.png';
        this.assets.rifleman.src = './assets/Rifle.png';
        this.assets.flanker.src = './assets/flanker.png';
        this.assets.skyPulse.src = './assets/skypulse.png';
        this.assets.revi1.src = './assets/revi-1.png';
        this.assets.revi2.src = './assets/revi-2.png';
        this.assets.reviAttack.src = './assets/revi-attack.png';
        this.assets.boss = new Image();
        this.assets.boss.src = './assets/boss-1.png';
        this.assets.bossClosed = new Image();
        this.assets.bossClosed.src = './assets/boss-1-eye-closed.png';
        this.assets.boss2 = new Image();
        this.assets.boss2.src = './assets/boss-2.png';
        this.assets.boss2Closed = new Image();
        this.assets.boss2Closed.src = './assets/boss-2-eye-closed.png';
        this.assets.spawn = new Image();
        this.assets.spawn.src = './assets/spawn.png';
        this.assets.splashDamage = new Image();
        this.assets.splashDamage.src = './assets/splash-damage.png';
        
        this.crosshairImg = new Image();
        this.crosshairImg.src = './assets/chosshair.png';
        
        this.gameOver = false;
        this.lastWormholeSpawn = -40000;
        this.wormholeInterval = 40000;
        this.wormholePatternCounter = 0;
        
        this.round = 0;
        this.roundDisplayTimer = -5000;
        this.roundDisplayDuration = 3000;
        this.roundTextAlpha = 0;
        
        this.damageFlash = 0;
        this.damageResistTimer = 0;
        this.damageSplashes = [];
        this.floatingTexts = []; // { x, y, text, createdAt, duration, color }
        this.playedDamageLow = false;
        this.playedDamageHeavy = false;
        
        this.gameTime = 0;
        this.deltaTime = 16;
        this.paused = false;
        
        // Tracking for behavior re-evaluation
        this.lastRiflemanCount = 0;
        this.lastMeleeCount = 0;

        this.setupEventListeners();
        this.setupUI();
    }

    setupUI() {
        this.restartBtn = document.createElement('button');
        this.restartRoundBtn = document.createElement('button');
        
        const styleButton = (btn, text) => {
            btn.innerText = text;
            btn.style.position = 'absolute';
            btn.style.left = '50%';
            btn.style.transform = 'translateX(-50%)';
            btn.style.padding = '15px 30px';
            btn.style.fontSize = '20px';
            btn.style.fontFamily = 'Courier New';
            btn.style.fontWeight = 'bold';
            btn.style.backgroundColor = '#1a1a1a';
            btn.style.color = '#87CEEB';
            btn.style.border = '2px solid #87CEEB';
            btn.style.cursor = 'pointer';
            btn.style.display = 'none';
            btn.style.zIndex = '1000';
            btn.style.transition = 'all 0.2s';
            btn.style.boxShadow = '0 0 10px rgba(135, 206, 235, 0.3)';
            
            btn.onmouseover = () => {
                btn.style.backgroundColor = '#87CEEB';
                btn.style.color = '#1a1a1a';
                btn.style.boxShadow = '0 0 20px rgba(135, 206, 235, 0.6)';
            };
            btn.onmouseout = () => {
                btn.style.backgroundColor = '#1a1a1a';
                btn.style.color = '#87CEEB';
                btn.style.boxShadow = '0 0 10px rgba(135, 206, 235, 0.3)';
            };
            document.body.appendChild(btn);
        };

        styleButton(this.restartBtn, 'MAIN MENU');
        this.restartBtn.style.top = '65%';
        
        styleButton(this.restartRoundBtn, 'RESTART FROM ROUND X');
        this.restartRoundBtn.style.top = '75%';

        this.restartBtn.onclick = () => {
            if (this.onMainMenu) {
                this.onMainMenu();
            } else {
                location.reload();
            }
        };
        this.restartRoundBtn.onclick = () => this.resetGame(false);
    }

    cleanup() {
        this.audio.stopAll();
        if (this.restartBtn && this.restartBtn.parentNode) {
            this.restartBtn.parentNode.removeChild(this.restartBtn);
        }
        if (this.restartRoundBtn && this.restartRoundBtn.parentNode) {
            this.restartRoundBtn.parentNode.removeChild(this.restartRoundBtn);
        }

        // Cleanup event listeners
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        window.removeEventListener('mousedown', this._boundMouseDown);
        window.removeEventListener('mouseup', this._boundMouseUp);
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('contextmenu', this._boundContextMenu);
        window.removeEventListener('blur', this._boundBlur);
        window.removeEventListener('focus', this._boundFocus);
    }

    resetGame(fromStart) {
        this.audio.stopAll();
        this.gameOver = false;
        this.restartBtn.style.display = 'none';
        this.restartRoundBtn.style.display = 'none';
        
        // Reset health based on difficulty
        let maxHP = 100;
        if (this.difficulty === 'hurt-me-plenty') maxHP = 200;
        else if (this.difficulty === 'too-young-to-die') maxHP = 500;
        
        this.player.health = maxHP;
        this.player.maxHealth = maxHP;
        this.player.energy = 100;
        this.player.isExhausted = false;
        
        // Ensure valid starting position even if canvas width/height are 0
        const startX = (this.canvas.width > 0) ? this.canvas.width / 2 : window.innerWidth / 2;
        const startY = (this.canvas.height > 0) ? this.canvas.height / 2 : window.innerHeight / 2;
        
        this.player.x = startX || 400;
        this.player.y = startY || 300;
        this.player.vx = 0;
        this.player.vy = 0;
        
        this.enemies = [];
        this.bullets = [];
        this.explosions = [];
        this.wormholes = [];
        this.boss = null;
        this.floatingTexts = [];
        this.electricBeam.isCharging = false;
        this.electricBeam.effect = null;
        this.botInput = null;
        this.lastBotDecisionTime = -Infinity;
        if (this.rewardTracker) this.rewardTracker.reset();
        if (this.botMode) this.episodeRecorder = new EpisodeRecorder();
        
        if (fromStart) {
            this.round = 0;
            this.kills = 0;
            this.gameTime = 0;
            this.lastWormholeSpawn = -40000;
        } else {
            // Restart the current round and reset kills
            this.round = Math.max(0, this.round - 1);
            this.kills = 0;
            this.lastWormholeSpawn = this.gameTime - 40000;
        }
    }

    setupEventListeners() {
        this._boundKeyDown = e => this.keys[e.code] = true;
        this._boundKeyUp = e => this.keys[e.code] = false;
        this._boundMouseDown = e => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            if (e.button === 0) {
                this.isMouseDown = true;
            } else if (e.button === 2) {
                this.tryStartElectricBeam();
            }
        };
        this._boundMouseUp = e => {
            if (e.button === 0) this.isMouseDown = false;
        };
        this._boundMouseMove = e => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        };
        this._boundContextMenu = e => e.preventDefault();
        this._boundBlur = () => { this.paused = true; };
        this._boundFocus = () => { this.paused = false; };

        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
        window.addEventListener('mousedown', this._boundMouseDown);
        window.addEventListener('mouseup', this._boundMouseUp);
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('contextmenu', this._boundContextMenu);
        window.addEventListener('blur', this._boundBlur);
        window.addEventListener('focus', this._boundFocus);
    }

    getBotInput(currentTime) {
        if (!this.bot) return null;
        if (!this.botInput || currentTime - this.lastBotDecisionTime >= BOT_DECISION_INTERVAL_MS) {
            const controls = this.bot.update(this.player, this.enemies, this.bullets, currentTime);
            this.botInput = controls;
            this.lastBotDecisionTime = currentTime;

            if (this.episodeRecorder && this.episodeRecorder.enabled) {
                const observation = this.observationEncoder.encode(this);
                this.episodeRecorder.recordDecision(
                    observation,
                    encodeTeacherAction(controls, this.player),
                    this.rewardTracker.consume()
                );
            }
        }
        return this.botInput;
    }

    recordPlayerDamageDealt(amount) {
        if (this.rewardTracker) this.rewardTracker.recordDamageDealt(amount);
    }

    applyPlayerDamage(amount) {
        this.player.health -= amount;
        if (this.rewardTracker) this.rewardTracker.recordDamageTaken(amount);
    }

    tryStartElectricBeam() {
        if (this.gameOver || this.paused) return;
        if (this.electricBeam.isCharging) return;
        if (this.player.isExhausted) return;
        if (this.player.energy < this.electricBeam.energyCost) return;

        this.player.energy = Math.max(0, this.player.energy - this.electricBeam.energyCost);
        if (this.player.energy === 0) {
            this.player.isExhausted = true;
        }
        this.player.lastShootInteractionTime = this.gameTime;
        this.player.vx = 0;
        this.player.vy = 0;

        const dx = this.mousePos.x - this.player.x;
        const dy = this.mousePos.y - this.player.y;
        this.electricBeam.angle = Math.atan2(dy, dx);
        this.electricBeam.isCharging = true;
        this.electricBeam.chargeStartTime = this.gameTime;
        // No sound for this weapon
    }

    fireElectricBeam(currentTime) {
        const eb = this.electricBeam;
        const px = this.player.x;
        const py = this.player.y;
        const ux = Math.cos(eb.angle);
        const uy = Math.sin(eb.angle);
        const halfWidth = eb.beamWidth / 2;
        const beamRange = Math.hypot(this.canvas.width, this.canvas.height) * 1.5;

        const lightningTargets = [];

        // Surrounding (AoE) damage + lightning targets
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (currentTime < e.shieldExpiry) continue;
            const dist = Math.hypot(e.x - px, e.y - py);
            if (dist <= eb.aoeRadius + e.size / 2) {
                lightningTargets.push({ x: e.x, y: e.y });
                this.damageEnemyEntity(e, eb.aoeDamage, currentTime);
            }
        }

        // Boss: electric beam damages only once per boss lifetime
        if (this.boss) {
            const distBoss = Math.hypot(this.boss.x - px, this.boss.y - py);
            const bossInAoe = distBoss <= eb.aoeRadius + this.boss.size / 2;
            const bossInBeam = this.isInElectricBeam(
                this.boss.x, this.boss.y, this.boss.size / 2, px, py, ux, uy, halfWidth, beamRange
            );

            if (bossInAoe) {
                lightningTargets.push({ x: this.boss.x, y: this.boss.y });
            }

            if (bossInAoe || bossInBeam) {
                if (this.boss.electricBeamImmune) {
                    this.spawnFloatingText(
                        this.boss.x,
                        this.boss.y - this.boss.size / 2 - 48,
                        'IMMUNE TO ELECTRIC',
                        currentTime,
                        '#7ecbff'
                    );
                } else {
                    // One hit only: prefer beam damage when in the ray, else AoE
                    let bossDmg = 0;
                    let hitX = px;
                    let hitY = py;
                    if (bossInBeam) {
                        bossDmg = eb.beamDamage;
                        hitX = px + ux * 40;
                        hitY = py + uy * 40;
                    } else if (bossInAoe) {
                        bossDmg = eb.aoeDamage;
                    }
                    if (bossDmg > 0 && this.damageBossEntity(bossDmg, currentTime, hitX, hitY)) {
                        this.boss.electricBeamImmune = true;
                    }
                }
            }
        }

        // Beam damage (50 unit wide ray toward aim angle)
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (currentTime < e.shieldExpiry) continue;
            if (this.isInElectricBeam(e.x, e.y, e.size / 2, px, py, ux, uy, halfWidth, beamRange)) {
                this.damageEnemyEntity(e, eb.beamDamage, currentTime);
            }
        }

        eb.effect = {
            startTime: currentTime,
            duration: 280,
            angle: eb.angle,
            lightningTargets
        };
        this.player.shootVisualTimer = 150;
    }

    isInElectricBeam(ex, ey, entityRadius, px, py, ux, uy, halfWidth, beamRange) {
        const vpx = ex - px;
        const vpy = ey - py;
        const proj = vpx * ux + vpy * uy;
        if (proj < 0 || proj > beamRange) return false;
        const closestX = px + ux * proj;
        const closestY = py + uy * proj;
        const distToLine = Math.hypot(ex - closestX, ey - closestY);
        return distToLine < halfWidth + entityRadius;
    }

    damageEnemyEntity(e, damage, currentTime) {
        // Entity may already be removed if a prior hit killed it this frame
        if (!this.enemies.includes(e)) return;
        const j = this.enemies.indexOf(e);
        const actualDamage = Math.min(damage, Math.max(0, e.health));
        e.health -= damage;
        this.recordPlayerDamageDealt(actualDamage);
        e.lastTimeHitByPlayer = this.gameTime;
        this.damageSplashes.push({
            x: e.x,
            y: e.y,
            target: e,
            offsetX: 0,
            offsetY: 0,
            createdAt: currentTime
        });
        if (e.health <= 0) {
            this.explosions.push({ x: e.x, y: e.y, life: 0.8, decay: 0.08, maxRadius: 30 });
            this.kills++;
            this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 3);
            this.enemies.splice(j, 1);
        }
    }

    damageBossEntity(damage, currentTime, hitX, hitY) {
        if (!this.boss) return false;
        const isBossInitialImmune = this.wormholes.some(wh => (currentTime - wh.startTime < 5000));
        if (isBossInitialImmune || this.boss.isInvulnerable) return false;

        const actualDamage = Math.min(damage, Math.max(0, this.boss.health));
        this.boss.health -= damage;
        this.recordPlayerDamageDealt(actualDamage);
        this.explosions.push({ x: hitX, y: hitY, life: 0.5, decay: 0.1, maxRadius: 20 });
        this.damageSplashes.push({
            x: hitX,
            y: hitY,
            target: this.boss,
            offsetX: hitX - this.boss.x,
            offsetY: hitY - this.boss.y,
            createdAt: currentTime
        });
        return true;
    }

    spawnFloatingText(x, y, text, currentTime, color = '#ffffff') {
        this.floatingTexts.push({
            x,
            y,
            text,
            createdAt: currentTime,
            duration: 800, // under 1s
            rise: 55,
            color
        });
    }

    drawLightningBolt(ctx, x1, y1, x2, y2, segments = 8) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const jitter = (Math.random() - 0.5) * Math.min(40, len * 0.12);
            const fade = 1 - Math.abs(t - 0.5) * 0.6;
            ctx.lineTo(
                x1 + dx * t + nx * jitter * fade,
                y1 + dy * t + ny * jitter * fade
            );
        }
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    drawElectricBeamEffects(ctx, currentTime) {
        const eb = this.electricBeam;
        const px = this.player.x;
        const py = this.player.y;
        const beamLen = Math.hypot(this.canvas.width, this.canvas.height) * 1.5;

        if (eb.isCharging) {
            const elapsed = currentTime - eb.chargeStartTime;
            const progress = Math.min(1, Math.max(0, elapsed / eb.chargeDuration));
            const pulse = 0.35 + progress * 0.45 + Math.sin(currentTime / 40) * 0.08;
            const radius = eb.aoeRadius * (0.55 + progress * 0.45);

            // Transparent blue charge circle
            ctx.save();
            const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
            grad.addColorStop(0, `rgba(80, 180, 255, ${0.08 + progress * 0.12})`);
            grad.addColorStop(0.7, `rgba(40, 140, 255, ${0.12 + progress * 0.18})`);
            grad.addColorStop(1, 'rgba(40, 140, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(100, 200, 255, ${pulse})`;
            ctx.lineWidth = 2 + progress * 3;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Transparent blue beam telegraph
            const endX = px + Math.cos(eb.angle) * beamLen;
            const endY = py + Math.sin(eb.angle) * beamLen;
            ctx.save();
            ctx.strokeStyle = `rgba(80, 170, 255, ${0.15 + progress * 0.25})`;
            ctx.lineWidth = eb.beamWidth * (0.4 + progress * 0.6);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.strokeStyle = `rgba(160, 220, 255, ${0.2 + progress * 0.35})`;
            ctx.lineWidth = 4 + progress * 6;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.restore();
        }

        if (eb.effect) {
            const age = currentTime - eb.effect.startTime;
            const fade = Math.max(0, 1 - age / eb.effect.duration);
            const endX = px + Math.cos(eb.effect.angle) * beamLen;
            const endY = py + Math.sin(eb.effect.angle) * beamLen;

            // Blue laser beam flash
            ctx.save();
            ctx.shadowBlur = 25 * fade;
            ctx.shadowColor = '#4da6ff';
            ctx.strokeStyle = `rgba(120, 200, 255, ${0.85 * fade})`;
            ctx.lineWidth = eb.beamWidth * fade;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.strokeStyle = `rgba(220, 245, 255, ${0.95 * fade})`;
            ctx.lineWidth = Math.max(4, 14 * fade);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.restore();

            // Lightning arcs toward surrounding-hit enemies
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            eb.effect.lightningTargets.forEach(t => {
                ctx.shadowBlur = 18 * fade;
                ctx.shadowColor = '#66ccff';
                ctx.strokeStyle = `rgba(180, 230, 255, ${0.9 * fade})`;
                ctx.lineWidth = 3 + 2 * fade;
                this.drawLightningBolt(ctx, px, py, t.x, t.y, 7 + Math.floor(Math.random() * 4));
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * fade})`;
                ctx.lineWidth = 1.5;
                this.drawLightningBolt(ctx, px, py, t.x, t.y, 6);
            });
            ctx.restore();
        }
    }

    update(deltaTime) {
        if (this.gameOver || this.paused) return;
        // Basic protection against invalid deltaTime
        if (isNaN(deltaTime) || deltaTime <= 0) return;
        
        this.deltaTime = deltaTime;
        this.gameTime += deltaTime;
        const currentTime = this.gameTime;
        if (this.rewardTracker) this.rewardTracker.tick(deltaTime);
        
        if (this.damageFlash > 0) {
            this.damageFlash -= deltaTime;
        }
        if (this.damageResistTimer > 0) {
            this.damageResistTimer -= deltaTime;
        }

        if (this.player.shootVisualTimer > 0) {
            this.player.shootVisualTimer -= deltaTime;
        }

        // Prune expired player shot lanes; keep player.shotLanes in sync for AI
        if (this.playerShotLanes.length > 0) {
            this.playerShotLanes = this.playerShotLanes.filter(l => currentTime < l.expiresAt);
            this.player.shotLanes = this.playerShotLanes;
        }

        // Expire electric beam fire visuals in update (keep draw pure-render)
        if (this.electricBeam.effect) {
            const fx = this.electricBeam.effect;
            if (currentTime - fx.startTime >= fx.duration) {
                this.electricBeam.effect = null;
            }
        }

        // Player movement with acceleration and friction
        // Electric beam: fully stop for the 500ms charge
        if (this.electricBeam.isCharging) {
            this.player.vx = 0;
            this.player.vy = 0;
            
            // If bot is playing, it should keep aiming at its target during charge
            if (this.botMode) {
                const botInput = this.getBotInput(currentTime);
                this.mousePos.x = botInput.mouseX;
                this.mousePos.y = botInput.mouseY;
            }

            const dxAim = this.mousePos.x - this.player.x;
            const dyAim = this.mousePos.y - this.player.y;
            this.electricBeam.angle = Math.atan2(dyAim, dxAim);

            if (currentTime - this.electricBeam.chargeStartTime >= this.electricBeam.chargeDuration) {
                this.electricBeam.isCharging = false;
                this.fireElectricBeam(currentTime);
            }
        } else {
            let ax = 0;
            let ay = 0;

            if (this.botMode) {
                const botInput = this.getBotInput(currentTime);
                ax = (botInput.ax || 0) * this.player.accel;
                ay = (botInput.ay || 0) * this.player.accel;
                this.mousePos.x = botInput.mouseX || this.player.x;
                this.mousePos.y = botInput.mouseY || this.player.y;
                
                if (isNaN(ax)) ax = 0;
                if (isNaN(ay)) ay = 0;
                if (isNaN(this.mousePos.x)) this.mousePos.x = this.player.x;
                if (isNaN(this.mousePos.y)) this.mousePos.y = this.player.y;

                this.isMouseDown = botInput.isMouseDown;
                if (botInput.tryElectricBeam && !(this.episodeRecorder && this.episodeRecorder.enabled)) {
                    this.tryStartElectricBeam();
                }
            } else {
                if (this.keys['KeyW'] || this.keys['ArrowUp']) ay -= this.player.accel;
                if (this.keys['KeyS'] || this.keys['ArrowDown']) ay += this.player.accel;
                if (this.keys['KeyA'] || this.keys['ArrowLeft']) ax -= this.player.accel;
                if (this.keys['KeyD'] || this.keys['ArrowRight']) ax += this.player.accel;
            }

            // Normalize acceleration for diagonal movement
            if (ax !== 0 && ay !== 0) {
                const mag = Math.sqrt(ax * ax + ay * ay);
                ax = (ax / mag) * this.player.accel;
                ay = (ay / mag) * this.player.accel;
            }

            this.player.vx += ax * (deltaTime / 16);
            this.player.vy += ay * (deltaTime / 16);

            // Apply friction/drag
            const frictionFactor = 1 - this.player.friction * (deltaTime / 16);
            this.player.vx *= Math.max(0, frictionFactor);
            this.player.vy *= Math.max(0, frictionFactor);

            // Cap speed
            const currentSpeed = Math.sqrt(this.player.vx * this.player.vx + this.player.vy * this.player.vy);
            if (currentSpeed > this.player.maxSpeed) {
                this.player.vx = (this.player.vx / currentSpeed) * this.player.maxSpeed;
                this.player.vy = (this.player.vy / currentSpeed) * this.player.maxSpeed;
            }

            this.player.x += this.player.vx * (deltaTime / 16);
            this.player.y += this.player.vy * (deltaTime / 16);
        }

        // Boss Impassability for Player
        if (this.boss) {
            const dxB = this.player.x - this.boss.x;
            const dyB = this.player.y - this.boss.y;
            const distB = Math.sqrt(dxB * dxB + dyB * dyB);
            const minDistB = this.player.size / 2 + this.boss.size / 2 - 10;
            if (distB < minDistB) {
                const angle = Math.atan2(dyB, dxB);
                this.player.x = this.boss.x + Math.cos(angle) * minDistB;
                this.player.y = this.boss.y + Math.sin(angle) * minDistB;
            }
        }

        // Boundary checks
        this.player.x = Math.max(this.player.size/2, Math.min(this.canvas.width - this.player.size/2, this.player.x));
        this.player.y = Math.max(this.player.size/2, Math.min(this.canvas.height - this.player.size/2, this.player.y));

        // Health regen
        if (this.player.health < this.player.maxHealth && this.player.health > 0) {
            this.player.health = Math.min(this.player.maxHealth, this.player.health + (this.player.regenSpeed * deltaTime / 1000));
        }

        // Energy regen logic
        const timeSinceLastShot = currentTime - this.player.lastShootInteractionTime;
        
        if (timeSinceLastShot >= 2000) {
            // Rapid regen (3/sec) if not shot for 2 seconds, no limit
            this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + (3 * deltaTime / 1000));
        } else if (this.player.energy < 50) {
            // Standard regen (1/sec) only under 50 energy
            this.player.energy = Math.min(50, this.player.energy + (1 * deltaTime / 1000));
        }
        
        // Recover from exhaustion at 20 energy
        if (this.player.isExhausted && this.player.energy >= 20) {
            this.player.isExhausted = false;
        }

        if (this.player.health <= 0) {
            this.player.health = 0;
            if (!this.gameOver) {
                if (this.episodeRecorder && this.episodeRecorder.enabled) {
                    this.episodeRecorder.finish(
                        this.observationEncoder.encode(this),
                        this.rewardTracker.consume()
                    );
                }
                this.audio.playGameOver();
                this.restartBtn.style.display = 'block';
                this.restartRoundBtn.style.display = 'block';
                this.restartRoundBtn.innerText = `RESTART FROM ROUND ${this.round}`;
            }
            this.gameOver = true;
        }

        // Damage Sound Cues
        if (this.player.health < 15 && !this.playedDamageHeavy) {
            this.audio.playDamagedHeavy();
            this.playedDamageHeavy = true;
        } else if (this.player.health < 50 && !this.playedDamageLow) {
            this.audio.playDamaged();
            this.playedDamageLow = true;
        }

        // Shooting (left-click only; blocked while charging electric beam)
        if (this.isMouseDown && !this.electricBeam.isCharging && currentTime - this.lastShotTime >= this.fireRateDelay && !this.player.isExhausted) {
            const dx = this.mousePos.x - this.player.x;
            const dy = this.mousePos.y - this.player.y;
            const angle = Math.atan2(dy, dx);
            
            const isPowerful = this.player.energy > 80;
            const bulletRadius = isPowerful ? 6 : 4;
            const bulletDamage = isPowerful ? 1.5 : 1.0;
            const bulletColor = isPowerful ? '#87CEEB' : 'yellow';
            
            this.bullets.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * this.bulletSpeed,
                vy: Math.sin(angle) * this.bulletSpeed,
                radius: bulletRadius,
                damage: bulletDamage,
                color: bulletColor,
                ownerType: 'player',
                source: this.player
            });

            // Full fire-line from player to map edge for agile enemy evasion (400ms)
            this.playerShotLanes.push(createPlayerShotLane(
                this.player.x,
                this.player.y,
                angle,
                this.canvas.width,
                this.canvas.height,
                currentTime
            ));
            this.player.shotLanes = this.playerShotLanes;

            // Consume energy
            this.player.energy = Math.max(0, this.player.energy - 1);
            if (this.player.energy === 0) {
                this.player.isExhausted = true;
            }

            if (isPowerful) {
                this.audio.playStrongShoot();
            } else {
                this.audio.playRandomShoot();
            }
            this.lastShotTime = currentTime;
            this.player.lastShootInteractionTime = currentTime;
            this.player.shootVisualTimer = 100;
        }

        // Wormholes / Boss Spawn / Round Logic
        const canStartNextRound = !this.boss && (currentTime - this.lastWormholeSpawn >= this.wormholeInterval);
        
        if (canStartNextRound) {
            if (this.rewardTracker && this.round > 0) this.rewardTracker.recordRoundCompleted();
            this.round++;
            this.roundDisplayTimer = currentTime;
            this.lastWormholeSpawn = currentTime;
            
            // Boss spawn check: Round 3, then 8, 13, 18 (5-step sequence)
            const isBossRound = this.round === 3 || (this.round > 3 && (this.round - 3) % 5 === 0);
            
            if (isBossRound && !this.boss) {
                this.boss = new Boss(this.canvas.width, this.canvas.height, currentTime);
            }

            // Round completion heal based on difficulty
            if (this.difficulty === 'too-young-to-die') {
                this.player.health = this.player.maxHealth;
            } else if (this.difficulty === 'hurt-me-plenty') {
                this.player.health += 30; // Can overflow
            } else {
                this.player.health += 15; // Ultra-violence, can overflow
            }

            // Energy reset on new round
            this.player.energy = this.player.maxEnergy;
            this.player.isExhausted = false;

            this.audio.playNewRound();
            this.playedDamageLow = false;
            this.playedDamageHeavy = false;

            // Wormholes spawn every round, including boss rounds
            this.wormholes.push(new Wormhole(
                Math.random() * (this.canvas.width - 100) + 50,
                Math.random() * (this.canvas.height - 100) + 50,
                currentTime,
                'duo',
                this.round
            ));
            this.wormholes.push(new Wormhole(
                Math.random() * (this.canvas.width - 100) + 50,
                Math.random() * (this.canvas.height - 100) + 50,
                currentTime,
                'flanker',
                this.round
            ));
            this.wormholePatternCounter++;
        }

        // Round display alpha logic
        const timeSinceRoundStart = currentTime - this.roundDisplayTimer;
        if (timeSinceRoundStart < this.roundDisplayDuration) {
            if (timeSinceRoundStart < 500) {
                this.roundTextAlpha = timeSinceRoundStart / 500;
            } else if (timeSinceRoundStart > this.roundDisplayDuration - 500) {
                this.roundTextAlpha = (this.roundDisplayDuration - timeSinceRoundStart) / 500;
            } else {
                this.roundTextAlpha = 1;
            }
        } else {
            this.roundTextAlpha = 0;
        }

        for (let i = this.wormholes.length - 1; i >= 0; i--) {
            const wh = this.wormholes[i];
            wh.update(currentTime, (x, y, type, shieldExpiry) => {
                const newEnemy = new Enemy(x, y, type, shieldExpiry);

                this.enemies.push(newEnemy);
                this.audio.playSpawn();
            });
            if (wh.isFinished()) this.wormholes.splice(i, 1);
        }

        // Boss Impassability for Enemies (Increased range)
        if (this.boss) {
            this.enemies.forEach(enemy => {
                const dxB = enemy.x - this.boss.x;
                const dyB = enemy.y - this.boss.y;
                const distB = Math.sqrt(dxB * dxB + dyB * dyB);
                
                // Ground units avoid Boss from further away (240 units)
                // Sky-Pulse units fly above, but still respect a smaller collision buffer
                const behaviorDist = enemy.type === 'sky-pulse' ? (enemy.size / 2 + this.boss.size / 2 - 5) : 240;
                
                if (distB < behaviorDist) {
                    const angle = Math.atan2(dyB, dxB);
                    if (enemy.type === 'sky-pulse') {
                        // Hard push for flyer collision
                        enemy.x = this.boss.x + Math.cos(angle) * behaviorDist;
                        enemy.y = this.boss.y + Math.sin(angle) * behaviorDist;
                    } else {
                        // Soft push/steering for ground units to keep them away
                        const force = (behaviorDist - distB) * 0.1;
                        enemy.x += Math.cos(angle) * force;
                        enemy.y += Math.sin(angle) * force;
                    }
                }
            });
        }

        // Check targeting (closest 3 enemies under the player's crosshair line)
        this.enemies.forEach(e => e.isTargetedByPlayer = false);
        
        const dx = this.mousePos.x - this.player.x;
        const dy = this.mousePos.y - this.player.y;
        const lineLen = Math.sqrt(dx * dx + dy * dy);
        
        if (lineLen > 0) {
            const ux = dx / lineLen;
            const uy = dy / lineLen;
            
            const targetedCandidates = this.enemies.map(e => {
                const vpx = e.x - this.player.x;
                const vpy = e.y - this.player.y;
                const proj = vpx * ux + vpy * uy;
                
                if (proj > 0) {
                    const closestX = this.player.x + ux * proj;
                    const closestY = this.player.y + uy * proj;
                    const distToLine = Math.sqrt((e.x - closestX) ** 2 + (e.y - closestY) ** 2);
                    
                    if (distToLine < 50) { // Virtuális vonal vastagság
                        return { enemy: e, proj };
                    }
                }
                return null;
            }).filter(c => c !== null)
              .sort((a, b) => a.proj - b.proj)
              .slice(0, 3);
            
            targetedCandidates.forEach(c => c.enemy.isTargetedByPlayer = true);
        }

        // Enemies
        if (this.boss) {
            this.boss.update(this.player, this.enemies, this.bullets, currentTime, deltaTime, this.audio, (b) => {
                this.bullets.push(b);
                this.audio.playEnemyShoot();
            }, () => {
                // Boss Death Callback
                this.kills += 10; // Extra kills for boss
                this.player.energy = this.player.maxEnergy; // Fully restore energy after boss
                this.player.isExhausted = false;
                this.enemies = []; // Kill all other monsters
                this.wormholes = []; // Clear active wormholes
                this.boss = null;
                
                // Post-boss heal based on difficulty
                if (this.difficulty === 'too-young-to-die') {
                    this.player.health = this.player.maxHealth;
                } else if (this.difficulty === 'hurt-me-plenty') {
                    this.player.health = 230; // Boss-ok után 230-ra állítódik
                } else {
                    this.player.health = 100; // Ultra-violence
                }
                
                // Trigger next round IMMEDIATELY
                if (this.rewardTracker) this.rewardTracker.recordRoundCompleted();
                this.round++;
                this.roundDisplayTimer = currentTime;
                this.lastWormholeSpawn = currentTime; // Reset interval timer to now
                
                this.audio.playNewRound();
                this.explosions.push({x: this.canvas.width/2, y: this.canvas.height/2, life: 2, decay: 0.02, maxRadius: 500});
                
                // Immediate wormhole spawn for the new round
                this.wormholes.push(new Wormhole(
                    Math.random() * (this.canvas.width - 100) + 50,
                    Math.random() * (this.canvas.height - 100) + 50,
                    currentTime,
                    'duo',
                    this.round
                ));
                this.wormholes.push(new Wormhole(
                    Math.random() * (this.canvas.width - 100) + 50,
                    Math.random() * (this.canvas.height - 100) + 50,
                    currentTime,
                    'flanker',
                    this.round
                ));
            }, damage => this.applyPlayerDamage(damage));
        }

        this.enemies.forEach(enemy => {
            enemy.update(
                this.player, 
                this.enemies, 
                this.bullets, 
                currentTime, 
                deltaTime, 
                (b) => {
                    this.bullets.push(b);
                    if (b.ownerType === 'enemy') {
                        this.audio.playEnemyShoot();
                    } else if (b.ownerType === 'sky-pulse') {
                        this.audio.playEnemyPlasma();
                    }
                }, 
                this.canvas.width, 
                this.canvas.height,
                this.getBarriers(),
                this.lineRectIntersect.bind(this)
            );
            
            // Revi Attack Logic
            if (enemy.type === 'revi' && enemy.ai) {
                // Play sound exactly when targeting starts
                if (enemy.ai.needsAttackSound) {
                    this.audio.playReviAttack();
                    enemy.ai.needsAttackSound = false;
                }

                if (enemy.ai.phase === 'ATTACK' && enemy.ai.attackTriggered) {
                    // One-time action when attack triggers
                    if (currentTime - enemy.ai.phaseStartTime < 50) { // Small window to trigger damage
                        this.audio.playReviShoot();
                        
                        // Check if beam is blocked
                        const barriers = this.getBarriers();
                        const isBlocked = barriers.some(wall => 
                            this.lineRectIntersect(
                                enemy.x, enemy.y, this.player.x, this.player.y,
                                wall.x - wall.size/2, wall.y - wall.size/2, wall.size, wall.size
                            )
                        );
                        
                        if (!isBlocked) {
                            let dmg = enemy.damage || 20;
                            if (this.damageResistTimer > 0) {
                                dmg *= 0.2;
                            } else {
                                this.damageResistTimer = 200;
                            }
                            this.applyPlayerDamage(dmg);
                            this.damageFlash = 200;
                        }
                        
                        enemy.ai.attackTriggered = false; // Prevent multiple damage ticks in one flash
                    }
                }
            }

            // Collision with player
            const dx = Math.abs(this.player.x - enemy.x);
            const dy = Math.abs(this.player.y - enemy.y);
            const minDist = (this.player.size + enemy.size) / 2;
            if (dx < minDist && dy < minDist && enemy.stunRemaining <= 0) {
                let dmg = Math.floor(Math.random() * 11) + 15;
                if (this.damageResistTimer > 0) {
                    dmg *= 0.2;
                } else {
                    this.damageResistTimer = 200;
                }
                this.applyPlayerDamage(dmg);
                this.damageFlash = 200;
                enemy.stunRemaining = 1000;
                this.explosions.push({x: (this.player.x + enemy.x)/2, y: (this.player.y + enemy.y)/2, life: 1, decay: 0.05, maxRadius: 40});
            }
        });

        // Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            
            // Lifetime check or triggered detonation (e.g. for homing bullets)
            if (b.isDetonating || (b.lifetime && b.createdAt && currentTime - b.createdAt > b.lifetime)) {
                if (b.ownerType === 'sky-pulse') {
                    if (!b.isDetonating) {
                        b.isDetonating = true;
                        b.detonationStartTime = currentTime;
                        b.vx = 0;
                        b.vy = 0;
                        b.forwardSpeed = 0;
                        b.moveIntentX = 0;
                        b.moveIntentY = 0;
                    }
                    if (currentTime - b.detonationStartTime >= 500) {
                        // Massive 300 unit explosion
                        this.explosions.push({x: b.x, y: b.y, life: 1.5, decay: 0.03, maxRadius: 300});
                        
                        // Radius damage to enemies (ground and flyers)
                        for (let j = this.enemies.length - 1; j >= 0; j--) {
                            const e = this.enemies[j];
                            const distToExplosion = Math.sqrt((b.x - e.x)**2 + (b.y - e.y)**2);
                            if (distToExplosion < 300) {
                                e.health -= 0.34;
                                if (e.health <= 0) {
                                    this.explosions.push({x: e.x, y: e.y, life: 0.8, decay: 0.08, maxRadius: 30});
                                    this.kills++;
                                    this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 3);
                                    this.enemies.splice(j, 1);
                                }
                            }
                        }

                        // Radius damage to player
                        const d = Math.sqrt((b.x - this.player.x)**2 + (b.y - this.player.y)**2);
                        if (d < 300) {
                            let dmg = 40;
                            if (this.damageResistTimer > 0) {
                                dmg *= 0.2;
                            } else {
                                this.damageResistTimer = 200;
                            }
                            this.applyPlayerDamage(dmg); // Heavy damage
                            this.damageFlash = 300;
                        }
                        this.bullets.splice(i, 1);
                        continue;
                    }
                } else {
                    this.bullets.splice(i, 1);
                    continue;
                }
            }

            if (b.isDetonating) continue;

            // Sky-pulse rockets: tank-style facing thrust + rate-limited turns.
            // noSlowdown: accel to max and hold (no turn-brake / friction).
            // Steering sets moveIntent; applyTankPhysics integrates motion.
            if (b.useTankPhysics && (b.isHoming || b.preHomingTarget)) {
                let tx = this.player.x;
                let ty = this.player.y;
                let cruiseMax = b.maxSpeed != null ? b.maxSpeed : 2.5;

                if (b.preHomingTarget) {
                    const dx = b.preHomingTarget.x - b.x;
                    const dy = b.preHomingTarget.y - b.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 40) {
                        // Reach waypoint → switch to player lock
                        delete b.preHomingTarget;
                        b.isHoming = true;
                        tx = this.player.x;
                        ty = this.player.y;
                    } else {
                        tx = b.preHomingTarget.x;
                        ty = b.preHomingTarget.y;
                        // Pre-homing rush: higher speed cap (was snap-to 4.0)
                        cruiseMax = b.rushMaxSpeed != null ? b.rushMaxSpeed : 4.0;
                    }
                }

                const dx = tx - b.x;
                const dy = ty - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.001) {
                    b.moveIntentX = dx / dist;
                    b.moveIntentY = dy / dist;
                } else {
                    b.moveIntentX = 0;
                    b.moveIntentY = 0;
                }

                // Temporarily raise cap for pre-homing rush without mutating base maxSpeed
                const baseMax = b.maxSpeed;
                b.maxSpeed = cruiseMax;
                applyTankPhysics(b, deltaTime);
                b.maxSpeed = baseMax;
            } else {
                // Boss Spiral logic (Linear expansion for the stream)
                if (b.ownerType === 'boss-spiral') {
                    const baseSpeed = 1.5;
                    b.vx = Math.cos(b.spiralAngle) * baseSpeed;
                    b.vy = Math.sin(b.spiralAngle) * baseSpeed;
                }

                b.x += b.vx;
                b.y += b.vy;
            }
            let hit = false;
            
            if (b.ownerType === 'enemy' || b.ownerType === 'sky-pulse' || b.ownerType === 'boss-spiral') {
                const d = Math.sqrt((b.x-this.player.x)**2 + (b.y-this.player.y)**2);
                const checkRadius = b.ownerType === 'boss-spiral' ? (this.player.size/2 + b.radius) : (this.player.size/2);
                
                if (d < checkRadius) { 
                    if (b.ownerType === 'sky-pulse') {
                        if (!b.isDetonating) {
                            b.isDetonating = true;
                            b.detonationStartTime = currentTime;
                            b.vx = 0;
                            b.vy = 0;
                            b.forwardSpeed = 0;
                            b.moveIntentX = 0;
                            b.moveIntentY = 0;
                            let dmg = 15;
                            if (this.damageResistTimer > 0) {
                                dmg *= 0.2;
                            } else {
                                this.damageResistTimer = 200;
                            }
                            this.applyPlayerDamage(dmg); // Impact damage
                            this.damageFlash = 200;
                        }
                    } else if (b.ownerType === 'boss-spiral') {
                        let dmg = 15;
                        if (this.damageResistTimer > 0) dmg *= 0.2;
                        else this.damageResistTimer = 200;
                        this.applyPlayerDamage(dmg);
                        this.damageFlash = 200;
                        hit = true;
                    } else {
                        let dmg = 10;
                        if (this.damageResistTimer > 0) {
                            dmg *= 0.2;
                        } else {
                            this.damageResistTimer = 200;
                        }
                        this.applyPlayerDamage(dmg);
                        this.damageFlash = 150;
                        hit = true; 
                    }
                }
            }
            
            if (!hit && this.boss && b.ownerType === 'player') {
                const distToBoss = Math.sqrt((b.x - this.boss.x)**2 + (b.y - this.boss.y)**2);
                if (distToBoss < this.boss.size / 2) {
                    // Boss is immortal until wormholes start spawning enemies (activeDelay is 5000ms) OR if in phase transition
                    const isBossInitialImmune = this.wormholes.some(wh => (currentTime - wh.startTime < 5000));
                    
                    if (!isBossInitialImmune && !this.boss.isInvulnerable) {
                        const damage = b.damage || 1;
                        const actualDamage = Math.min(damage, Math.max(0, this.boss.health));
                        this.boss.health -= damage;
                        this.recordPlayerDamageDealt(actualDamage);
                        this.explosions.push({x: b.x, y: b.y, life: 0.5, decay: 0.1, maxRadius: 20});
                        this.damageSplashes.push({ 
                            x: b.x, 
                            y: b.y, 
                            target: this.boss,
                            offsetX: b.x - this.boss.x,
                            offsetY: b.y - this.boss.y,
                            createdAt: currentTime 
                        });
                    }
                    hit = true; // Bullet disappears on hit even if immortal
                }
            }

            if (!hit) {
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];
                    if (b.source === e || currentTime < e.shieldExpiry) continue;
                    
                    // Interaction rules:
                    // Sky-pulse bullet ONLY hits player (already handled above)
                    // Sky-pulse units can be hit by player bullets
                    if (b.ownerType === 'sky-pulse') continue; // Flyover ground units
                    if (e.type === 'sky-pulse' && b.ownerType !== 'player') continue; // Non-player ground bullets fly under sky-pulse

                    const d = Math.sqrt((b.x-e.x)**2 + (b.y-e.y)**2);
                    if (d < e.size/2 + 5) {
                        const damage = b.damage || 1;
                        const actualDamage = Math.min(damage, Math.max(0, e.health));
                        e.health -= damage;
                        if (b.ownerType === 'player') {
                            this.recordPlayerDamageDealt(actualDamage);
                            e.lastTimeHitByPlayer = this.gameTime;
                            this.damageSplashes.push({ 
                                x: b.x, 
                                y: b.y, 
                                target: e,
                                offsetX: b.x - e.x,
                                offsetY: b.y - e.y,
                                createdAt: currentTime 
                            });
                        }
                        hit = true;
                        if (e.health <= 0) {
                            this.explosions.push({x: e.x, y: e.y, life: 0.8, decay: 0.08, maxRadius: 30});
                            if (b.ownerType === 'player') {
                                this.kills++;
                                this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 3);
                            }
                            this.enemies.splice(j, 1);
                        }
                        break;
                    }
                }
            }
            if (hit || b.x < 0 || b.x > this.canvas.width || b.y < 0 || b.y > this.canvas.height) this.bullets.splice(i, 1);
        }

        // Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].life -= this.explosions[i].decay;
            if (this.explosions[i].life <= 0) this.explosions.splice(i, 1);
        }

        // Damage Splashes cleanup (100ms lifetime)
        for (let i = this.damageSplashes.length - 1; i >= 0; i--) {
            if (currentTime - this.damageSplashes[i].createdAt > 100) {
                this.damageSplashes.splice(i, 1);
            }
        }

        // Floating combat text cleanup
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            if (currentTime - this.floatingTexts[i].createdAt > this.floatingTexts[i].duration) {
                this.floatingTexts.splice(i, 1);
            }
        }

        // Re-evaluate pairings if ground unit counts changed
        const currentRiflemen = this.enemies.filter(e => e.type === 'rifleman');
        const currentMelee = this.enemies.filter(e => e.type === 'melee');
        
        if (currentRiflemen.length !== this.lastRiflemanCount || currentMelee.length !== this.lastMeleeCount) {
            this.redistributeBodyguards();
            this.lastRiflemanCount = currentRiflemen.length;
            this.lastMeleeCount = currentMelee.length;
        }
    }

    redistributeBodyguards() {
        const riflemen = this.enemies.filter(e => e.type === 'rifleman');
        const meleeUnits = this.enemies.filter(e => e.type === 'melee');

        if (riflemen.length === 0) {
            meleeUnits.forEach(m => {
                if (m.ai) {
                    m.ai.partner = null;
                    m.ai.role = 'blocker';
                }
            });
            // Even with no rifles, keep blocker pincer indices coherent.
            this.assignBlockerSlots(meleeUnits);
            return;
        }

        // 1) Assign the closest available melee to each rifle as its dedicated bodyguard.
        const guardedRiflemen = new Set();
        const bodyguards = new Set();
        const availableMelee = [...meleeUnits];

        // Greedily pick, per rifle, the nearest still-free melee.
        riflemen.forEach(rifle => {
            let best = null;
            let bestDist = Infinity;
            availableMelee.forEach(m => {
                if (bodyguards.has(m)) return;
                const d = (m.x - rifle.x) ** 2 + (m.y - rifle.y) ** 2;
                if (d < bestDist) {
                    bestDist = d;
                    best = m;
                }
            });
            if (best && best.ai) {
                best.ai.partner = rifle;
                best.ai.role = 'bodyguard';
                bodyguards.add(best);
                guardedRiflemen.add(rifle);
            }
        });

        // 2) Everyone else becomes a blocker, partnered to the least-crowded rifle.
        const rifleLoad = new Map();
        riflemen.forEach(r => rifleLoad.set(r, 0));

        const blockers = meleeUnits.filter(m => !bodyguards.has(m));
        blockers.forEach(m => {
            const rifle = [...riflemen].sort((a, b) => {
                const la = rifleLoad.get(a);
                const lb = rifleLoad.get(b);
                if (la !== lb) return la - lb;
                const da = (m.x - a.x) ** 2 + (m.y - a.y) ** 2;
                const db = (m.x - b.x) ** 2 + (m.y - b.y) ** 2;
                return da - db;
            })[0];
            if (m.ai) {
                m.ai.partner = rifle;
                m.ai.role = 'blocker';
                rifleLoad.set(rifle, rifleLoad.get(rifle) + 1);
            }
        });

        this.assignBlockerSlots(blockers);
    }

    // Give blockers stable indices so their pincer arc spreads evenly.
    assignBlockerSlots(blockers) {
        const total = blockers.length;
        blockers.forEach((m, i) => {
            if (m.ai) {
                m.ai.blockerIndex = i;
                m.ai.blockerTotal = total;
            }
        });
    }

    getBarriers() {
        const anyRevi = this.enemies.some(e => e.type === 'revi');
        if (!anyRevi) return [];

        const w = this.canvas.width;
        const h = this.canvas.height;
        const size = 80;

        return [
            { x: w * 0.33, y: h * 0.33, size: size },
            { x: w * 0.66, y: h * 0.33, size: size },
            { x: w * 0.33, y: h * 0.66, size: size },
            { x: w * 0.66, y: h * 0.66, size: size }
        ];
    }

    lineRectIntersect(x1, y1, x2, y2, rx, ry, rw, rh) {
        // Liang-Barsky algorithm or simpler checks for our needs
        // We'll use a simple clip-line approach
        const clipLine = (x1, y1, x2, y2, rx, ry, rw, rh) => {
            let t0 = 0, t1 = 1;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const p = [-dx, dx, -dy, dy];
            const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];

            for (let i = 0; i < 4; i++) {
                if (p[i] === 0) {
                    if (q[i] < 0) return false;
                } else {
                    const t = q[i] / p[i];
                    if (p[i] < 0) {
                        if (t > t1) return false;
                        if (t > t0) t0 = t;
                    } else {
                        if (t < t0) return false;
                        if (t < t1) t1 = t;
                    }
                }
            }
            return true;
        };
        return clipLine(x1, y1, x2, y2, rx, ry, rw, rh);
    }

    drawEvasionDebug() {
        return; // Disable debug drawing for now
        this.ctx.save();
        this.enemies.forEach(enemy => {
            if (!enemy.ai || !enemy.ai.evadeWalls) return;
            
            enemy.ai.evadeWalls.forEach(w => {
                const vlen = Math.sqrt((w.vx || 0) ** 2 + (w.vy || 0) ** 2);
                if (vlen === 0) return;
                const bux = (w.vx || 0) / vlen;
                const buy = (w.vy || 0) / vlen;
                
                let range = 200;
                let width = 50;
                if (w.type === 'player-bullet') { range = 2000; width = 25; }
                if (w.type === 'player-shot-line') { range = w.range ?? 2000; width = w.width ?? 40; }
                if (w.type === 'boss-bullet') { range = 90; width = 34; }
                if (w.type === 'plasma-bullet') { range = 100; width = 38; }

                this.ctx.beginPath();
                this.ctx.moveTo(w.x, w.y);
                this.ctx.lineTo(w.x + bux * range, w.y + buy * range);
                this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
                this.ctx.lineWidth = width;
                this.ctx.stroke();

                // Draw sphere avoidance bubble for lethal bullets
                if (w.type === 'plasma-bullet' || w.type === 'boss-bullet') {
                    this.ctx.beginPath();
                    // radius is width (which is the steer half-width)
                    this.ctx.arc(w.x, w.y, width, 0, Math.PI * 2);
                    this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)'; 
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            });
        });
        this.ctx.restore();
    }

    lineLineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (den === 0) return null;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t };
        }
        return null;
    }

    draw() {
        const currentTime = this.gameTime;
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Player Aura Effect
        const px = this.player.x || 0;
        const py = this.player.y || 0;
        const auraRadius = 220;
        
        // Ensure values are finite to avoid createRadialGradient error
        if (Number.isFinite(px) && Number.isFinite(py)) {
            const auraGrad = this.ctx.createRadialGradient(
                px, py, 0,
                px, py, auraRadius
            );
            auraGrad.addColorStop(0, 'rgba(135, 206, 235, 0.33)'); // SkyBlue with some opacity
            auraGrad.addColorStop(1, 'rgba(135, 206, 235, 0)');   // Completely transparent at edges

            this.ctx.save();
            this.ctx.fillStyle = auraGrad;
            this.ctx.beginPath();
            this.ctx.arc(px, py, auraRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }

        // Draw Barriers
        const barriers = this.getBarriers();
        barriers.forEach(wall => {
            this.ctx.save();
            this.ctx.strokeStyle = '#FFFF00'; // Pure yellow
            this.ctx.lineWidth = 15; // Thick border
            this.ctx.strokeRect(wall.x - wall.size/2, wall.y - wall.size/2, wall.size, wall.size);
            
            // Optional: thin inner border for detail
            this.ctx.strokeStyle = '#DAA520';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(wall.x - wall.size/2 + 7.5, wall.y - wall.size/2 + 7.5, wall.size - 15, wall.size - 15);
            this.ctx.restore();
        });

        this.drawEvasionDebug();

        this.wormholes.forEach(wh => wh.draw(this.ctx, this.assets.spawn, currentTime));
        if (this.boss) this.boss.draw(this.ctx, this.gameTime, this.assets);
        
        // Draw Revi Beams
        this.enemies.filter(e => e.type === 'revi' && e.ai && (e.ai.phase === 'TARGETING' || e.ai.phase === 'ATTACK')).forEach(revi => {
            this.ctx.save();
            this.ctx.beginPath();
            
            // Check if blocked to determine beam endpoint
            let targetX = this.player.x;
            let targetY = this.player.y;

            // Simple line-segment clipping against boxes for visual beam
            let shortestT = 1;
            barriers.forEach(wall => {
                const rx = wall.x - wall.size/2;
                const ry = wall.y - wall.size/2;
                const rw = wall.size;
                const rh = wall.size;

                // Test each of the 4 edges of the box
                const edges = [
                    {x1: rx, y1: ry, x2: rx+rw, y2: ry},
                    {x1: rx+rw, y1: ry, x2: rx+rw, y2: ry+rh},
                    {x1: rx+rw, y1: ry+rh, x2: rx, y2: ry+rh},
                    {x1: rx, y1: ry+rh, x2: rx, y2: ry}
                ];

                edges.forEach(edge => {
                    const intersect = this.lineLineIntersect(revi.x, revi.y, this.player.x, this.player.y, edge.x1, edge.y1, edge.x2, edge.y2);
                    if (intersect && intersect.t >= 0 && intersect.t < shortestT) {
                        shortestT = intersect.t;
                    }
                });
            });

            const drawX = revi.x + (this.player.x - revi.x) * shortestT;
            const drawY = revi.y + (this.player.y - revi.y) * shortestT;

            if (revi.ai.phase === 'TARGETING') {
                this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.2)'; // Fading yellow
                this.ctx.lineWidth = 15;
            } else {
                // Flash white/yellow
                this.ctx.strokeStyle = Math.floor(currentTime / 50) % 2 === 0 ? 'white' : 'yellow';
                this.ctx.lineWidth = 25;
            }
            
            this.ctx.moveTo(revi.x, revi.y);
            this.ctx.lineTo(drawX, drawY);
            this.ctx.stroke();
            this.ctx.restore();
        });

        // Electric beam charge telegraph + fire flash / lightning
        this.drawElectricBeamEffects(this.ctx, currentTime);

        // Draw Player Sprite
        const playerImg = this.player.shootVisualTimer > 0 ? this.assets.playerShoot : this.assets.playerIdle;
        
        this.ctx.save();
        this.ctx.translate(this.player.x, this.player.y);
        
        // Mirror if mouse is to the left
        if (this.mousePos.x < this.player.x) {
            this.ctx.scale(-1, 1);
        }

        // Player rotation removed as requested
        this.ctx.drawImage(
            playerImg,
            -this.player.size / 2,
            -this.player.size / 2,
            this.player.size,
            this.player.size
        );
        this.ctx.restore();

        this.enemies.forEach(e => e.draw(this.ctx, this.assets, currentTime));

        this.explosions.forEach(ex => {
            this.ctx.beginPath();
            const currentRadius = Math.max(0, ex.maxRadius * (1 - ex.life));
            this.ctx.arc(ex.x, ex.y, currentRadius, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(255, 100, 0, ${Math.max(0, Math.min(1, ex.life))})`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });

        // Damage flash overlay
        if (this.damageFlash > 0) {
            this.ctx.save();
            this.ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(0.4, this.damageFlash / 600)})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }

        this.bullets.forEach(b => {
            if (b.ownerType === 'sky-pulse') {
                const radius = b.radius || 12;
                if (b.isDetonating) {
                    // Flash black and white
                    const flash = Math.floor((this.gameTime / 50) % 2) === 0 ? 'white' : 'black';
                    this.ctx.save();
                    this.ctx.translate(b.x, b.y);
                    // No rotation needed when stopped, or keep last
                    this.ctx.fillStyle = flash;
                    this.ctx.fillRect(-radius, -radius/2, radius, radius);
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, radius/2, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.restore();
                } else {
                    // Prefer facing from tank physics; fall back to velocity
                    const angle = (b.facing != null && Number.isFinite(b.facing))
                        ? b.facing
                        : Math.atan2(b.vy, b.vx);
                    this.ctx.save();
                    this.ctx.translate(b.x, b.y);
                    this.ctx.rotate(angle);
                    
                    // Body (Square)
                    this.ctx.fillStyle = b.color || 'cyan';
                    this.ctx.fillRect(-radius, -radius/2, radius, radius);
                    
                    // White Head (Circle at the front)
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, radius/2, 0, Math.PI * 2);
                    this.ctx.fillStyle = 'white';
                    this.ctx.fill();
                    this.ctx.closePath();
                    
                    this.ctx.restore();
                }
            } else {
                const radius = b.radius || 4;
                if (b.ownerType === 'boss-spiral') {
                    // Draw large yellow circles for boss stream
                    this.ctx.beginPath();
                    this.ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
                    this.ctx.fillStyle = 'yellow';
                    this.ctx.fill();
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = 'yellow';
                    this.ctx.stroke();
                    this.ctx.shadowBlur = 0;
                } else {
                    this.ctx.lineWidth = 3;
                    this.ctx.lineCap = 'round';
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = b.color || 'yellow';
                    this.ctx.moveTo(b.x, b.y);
                    this.ctx.lineTo(b.x - b.vx * 1.2, b.y - b.vy * 1.2);
                    this.ctx.stroke();
                    this.ctx.closePath();
                }
            }
        });

        // Damage Splashes
        this.ctx.save();
        this.damageSplashes.forEach(s => {
            let drawX = s.x;
            let drawY = s.y;

            // Follow target if still alive
            if (s.target && (this.enemies.includes(s.target) || s.target === this.boss)) {
                drawX = s.target.x + s.offsetX;
                drawY = s.target.y + s.offsetY;
                // Update s.x/y so it stays here if target dies next frame
                s.x = drawX;
                s.y = drawY;
            }

            const size = 32; // Small size as requested
            this.ctx.drawImage(
                this.assets.splashDamage,
                drawX - size / 2,
                drawY - size / 2,
                size,
                size
            );
        });
        this.ctx.restore();

        // Floating combat text (e.g. boss electric immunity)
        this.ctx.save();
        this.floatingTexts.forEach(ft => {
            const t = Math.min(1, (this.gameTime - ft.createdAt) / ft.duration);
            const alpha = 1 - t;
            const drawY = ft.y - ft.rise * t;
            this.ctx.globalAlpha = alpha;
            this.ctx.font = 'bold 16px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(ft.text, ft.x, drawY);
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = ft.color;
            this.ctx.fillStyle = ft.color;
            this.ctx.fillText(ft.text, ft.x, drawY);
            this.ctx.shadowBlur = 0;
        });
        this.ctx.restore();

        this.drawUI();
    }

    drawUI() {
        this.ctx.save();
        const barWidth = 260;
        const barHeight = 18;
        const hx = (this.canvas.width - barWidth) / 2;
        const hy = this.canvas.height - 40;

        // Wave Timer Circle
        const timerRadius = 18;
        const tx = hx - 30; // 30px to the left of the health bar
        const ty = hy + barHeight / 2;

        this.ctx.beginPath();
        this.ctx.arc(tx, ty, timerRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#87CEEB';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        if (this.boss) {
            // Full circle for boss
            this.ctx.beginPath();
            this.ctx.arc(tx, ty, timerRadius - 3, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(135, 206, 235, 0.3)';
            this.ctx.fill();

            // Draw skull emoji for boss
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.font = '16px serif';
            this.ctx.fillText('💀', tx, ty);
        } else {
            const timeElapsed = this.gameTime - this.lastWormholeSpawn;
            const remainingTimeMs = Math.max(0, this.wormholeInterval - timeElapsed);
            const remainingSecs = Math.ceil(remainingTimeMs / 1000);
            const fraction = remainingTimeMs / this.wormholeInterval;

            // Draw depleting sector
            this.ctx.beginPath();
            this.ctx.moveTo(tx, ty);
            // Starting from top, clockwise. -PI/2 is top.
            this.ctx.arc(tx, ty, timerRadius - 3, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * fraction));
            this.ctx.lineTo(tx, ty);
            this.ctx.fillStyle = 'rgba(135, 206, 235, 0.5)';
            this.ctx.fill();

            // Draw seconds
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 12px Courier New';
            this.ctx.fillText(remainingSecs, tx, ty);
        }

        // Reset text alignment for health bar
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'alphabetic';

        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = 'rgba(0, 255, 100, 0.5)';
        const bgGrad = this.ctx.createLinearGradient(hx, hy, hx, hy + barHeight);
        bgGrad.addColorStop(0, '#1a1a1a');
        bgGrad.addColorStop(1, '#000000');
        this.ctx.fillStyle = bgGrad;
        this.ctx.fillRect(hx, hy, barWidth, barHeight);

        const healthPercent = Math.min(1, Math.max(0, this.player.health / this.player.maxHealth));
        const fillGrad = this.ctx.createLinearGradient(hx, hy, hx, hy + barHeight);
        if (this.player.health > this.player.maxHealth) {
            // Gold/Shiny color for overheal
            fillGrad.addColorStop(0, '#f1c40f');
            fillGrad.addColorStop(1, '#f39c12');
            this.ctx.shadowColor = 'rgba(241, 196, 15, 0.5)';
        } else if (healthPercent > 0.3) {
            fillGrad.addColorStop(0, '#2ecc71');
            fillGrad.addColorStop(1, '#27ae60');
            this.ctx.shadowColor = 'rgba(46, 204, 113, 0.5)';
        } else {
            fillGrad.addColorStop(0, '#e74c3c');
            fillGrad.addColorStop(1, '#c0392b');
            this.ctx.shadowColor = 'rgba(231, 76, 60, 0.5)';
        }
        this.ctx.fillStyle = fillGrad;
        this.ctx.fillRect(hx, hy, barWidth * healthPercent, barHeight);

        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(hx, hy, barWidth, barHeight);
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 12px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${Math.ceil(this.player.health)} / ${this.player.maxHealth} HP`, hx + barWidth/2, hy + 13);

        // Energy Bar (Blue, thinner, below health bar)
        const energyBarHeight = 6;
        const ey = hy + barHeight + 4;
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(hx, ey, barWidth, energyBarHeight);
        
        // Fill
        const energyPercent = this.player.energy / this.player.maxEnergy;
        if (this.player.energy > 80) {
            this.ctx.fillStyle = '#00BFFF'; // Deep Sky Blue (Lighter)
        } else {
            this.ctx.fillStyle = '#0000FF'; // Blue
        }
        
        // If exhausted, maybe a different color? The prompt didn't specify, but regular blue is fine.
        if (this.player.isExhausted) {
            this.ctx.fillStyle = '#4169E1'; // Royal Blue (desaturated)
        }

        this.ctx.fillRect(hx, ey, barWidth * energyPercent, energyBarHeight);
        
        // Border
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(hx, ey, barWidth, energyBarHeight);

        // Round display
        if (this.roundTextAlpha > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.roundTextAlpha})`;
            this.ctx.font = 'bold 64px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = `rgba(255, 255, 255, ${this.roundTextAlpha * 0.5})`;
            this.ctx.fillText(`ROUND ${this.round}`, this.canvas.width / 2, 100);
            this.ctx.shadowBlur = 0;
        }

        if (this.gameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#ff0000';
            this.ctx.font = 'bold 72px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = 'red';
            this.ctx.fillText('GAME OVER', this.canvas.width/2, this.canvas.height/2 - 40);
            
            this.ctx.fillStyle = '#87CEEB';
            this.ctx.font = 'bold 32px Courier New';
            this.ctx.shadowBlur = 0;
            this.ctx.fillText(`KILLS: ${this.kills}`, this.canvas.width/2, this.canvas.height/2 + 30);
            this.ctx.fillText(`ROUND REACHED: ${this.round}`, this.canvas.width/2, this.canvas.height/2 + 75);
            
            // Show difficulty
            this.ctx.font = 'bold 24px Courier New';
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fillText(`DIFFICULTY: ${this.difficulty.toUpperCase().replace(/-/g, ' ')}`, this.canvas.width/2, this.canvas.height/2 + 120);
        }

        // Draw crosshair
        if (this.crosshairImg.complete) {
            this.ctx.drawImage(
                this.crosshairImg, 
                this.mousePos.x - 12, 
                this.mousePos.y - 12, 
                24, 
                24
            );
        }

        if (this.paused && !this.gameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 72px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = 'white';
            this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.shadowBlur = 0;
            this.ctx.font = '24px Courier New';
            this.ctx.fillText('Click anywhere to resume', this.canvas.width / 2, this.canvas.height / 2 + 50);
        }

        this.ctx.restore();
    }
}
