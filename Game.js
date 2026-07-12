import { Enemy } from './Enemy.js';
import { Wormhole } from './Wormhole.js';
import { AudioService } from './AudioService.js';
import { Boss } from './Boss.js';

export class Game {
    constructor(canvas, difficulty = 'ultra-violence', onMainMenu = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audio = new AudioService();
        this.difficulty = difficulty;
        this.onMainMenu = onMainMenu;
        
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
            x: canvas.width / 2,
            y: canvas.height / 2,
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
        
        this.crosshairImg = new Image();
        this.crosshairImg.src = './assets/chosshair.png';
        
        this.gameOver = false;
        this.lastWormholeSpawn = -40000;
        this.wormholeInterval = 40000;
        this.wormholePatternCounter = 0;
        
        this.round = 4;
        this.roundDisplayTimer = -5000;
        this.roundDisplayDuration = 3000;
        this.roundTextAlpha = 0;
        
        this.damageFlash = 0;
        this.damageResistTimer = 0;
        this.playedDamageLow = false;
        this.playedDamageHeavy = false;
        
        this.gameTime = 0;
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
        this.player.x = this.canvas.width / 2;
        this.player.y = this.canvas.height / 2;
        this.player.vx = 0;
        this.player.vy = 0;
        
        this.enemies = [];
        this.bullets = [];
        this.explosions = [];
        this.wormholes = [];
        this.boss = null;
        
        if (fromStart) {
            this.round = 0;
            this.kills = 0;
            this.gameTime = 0;
            this.lastWormholeSpawn = -40000;
        } else {
            // Keep round and kills (but subtract 1 because the game loop will increment it immediately)
            this.round = Math.max(0, this.round - 1);
            this.lastWormholeSpawn = this.gameTime - 40000;
        }
    }

    setupEventListeners() {
        this._boundKeyDown = e => this.keys[e.code] = true;
        this._boundKeyUp = e => this.keys[e.code] = false;
        this._boundMouseDown = e => {
            this.isMouseDown = true;
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        };
        this._boundMouseUp = () => this.isMouseDown = false;
        this._boundMouseMove = e => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        };
        this._boundBlur = () => { this.paused = true; };
        this._boundFocus = () => { this.paused = false; };

        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
        window.addEventListener('mousedown', this._boundMouseDown);
        window.addEventListener('mouseup', this._boundMouseUp);
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('blur', this._boundBlur);
        window.addEventListener('focus', this._boundFocus);
    }

    update(deltaTime) {
        if (this.gameOver || this.paused) return;
        this.gameTime += deltaTime;
        const currentTime = this.gameTime;
        
        if (this.damageFlash > 0) {
            this.damageFlash -= deltaTime;
        }
        if (this.damageResistTimer > 0) {
            this.damageResistTimer -= deltaTime;
        }

        if (this.player.shootVisualTimer > 0) {
            this.player.shootVisualTimer -= deltaTime;
        }

        // Player movement with acceleration and friction
        let ax = 0;
        let ay = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) ay -= this.player.accel;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) ay += this.player.accel;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) ax -= this.player.accel;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) ax += this.player.accel;

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
        if (this.player.health <= 0) {
            this.player.health = 0;
            if (!this.gameOver) {
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

        // Shooting
        if (this.isMouseDown && currentTime - this.lastShotTime >= this.fireRateDelay) {
            const dx = this.mousePos.x - this.player.x;
            const dy = this.mousePos.y - this.player.y;
            const angle = Math.atan2(dy, dx);
            this.bullets.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * this.bulletSpeed,
                vy: Math.sin(angle) * this.bulletSpeed,
                radius: 4,
                color: 'yellow',
                ownerType: 'player',
                source: this.player
            });
            this.audio.playRandomShoot();
            this.lastShotTime = currentTime;
            this.player.shootVisualTimer = 100;
        }

        // Wormholes / Boss Spawn / Round Logic
        const canStartNextRound = !this.boss && (currentTime - this.lastWormholeSpawn >= this.wormholeInterval);
        
        if (canStartNextRound) {
            this.round++;
            this.roundDisplayTimer = currentTime;
            this.lastWormholeSpawn = currentTime;
            
            // Boss spawn check: Round 3, then 8, 13, 18 (5-step sequence)
            const isBossRound = this.round === 3 || (this.round > 3 && (this.round - 3) % 5 === 0);
            
            if (isBossRound && !this.boss) {
                this.boss = new Boss(this.canvas.width, this.canvas.height, currentTime);
            } else {
                // Round completion heal based on difficulty
                if (this.difficulty === 'too-young-to-die') {
                    this.player.health = this.player.maxHealth;
                } else if (this.difficulty === 'hurt-me-plenty') {
                    this.player.health += 30; // Can overflow
                } else {
                    this.player.health += 15; // Ultra-violence, can overflow
                }
            }

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

        // Boss Impassability for Enemies
        if (this.boss) {
            this.enemies.forEach(enemy => {
                const dxB = enemy.x - this.boss.x;
                const dyB = enemy.y - this.boss.y;
                const distB = Math.sqrt(dxB * dxB + dyB * dyB);
                const minDistB = enemy.size / 2 + this.boss.size / 2 - 5;
                if (distB < minDistB) {
                    const angle = Math.atan2(dyB, dxB);
                    enemy.x = this.boss.x + Math.cos(angle) * minDistB;
                    enemy.y = this.boss.y + Math.sin(angle) * minDistB;
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
            });
        }

        this.enemies.forEach(enemy => {
            enemy.update(this.player, this.enemies, this.bullets, currentTime, deltaTime, (b) => {
                this.bullets.push(b);
                if (b.ownerType === 'enemy') {
                    this.audio.playEnemyShoot();
                } else if (b.ownerType === 'sky-pulse') {
                    this.audio.playEnemyPlasma();
                }
            }, this.canvas.width, this.canvas.height);
            
            // Revi Attack Logic
            if (enemy.type === 'revi' && enemy.ai) {
                if (enemy.ai.phase === 'ATTACK' && enemy.ai.attackTriggered) {
                    // One-time action when attack triggers
                    if (currentTime - enemy.ai.phaseStartTime < 50) { // Small window to trigger damage and sound
                        this.audio.playReviAttack();
                        
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
                            this.player.health -= dmg;
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
                this.player.health -= dmg;
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
                            this.player.health -= dmg; // Heavy damage
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

            // Homing logic for sky-pulse bullets
            if (b.preHomingTarget) {
                const dx = b.preHomingTarget.x - b.x;
                const dy = b.preHomingTarget.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 40) { // Reach within 40 units to switch
                    delete b.preHomingTarget;
                    b.isHoming = true;
                } else {
                    const rushSpeed = 4.0; 
                    b.vx = (dx / dist) * rushSpeed;
                    b.vy = (dy / dist) * rushSpeed;
                }
            } else if (b.isHoming) {
                const dx = this.player.x - b.x;
                const dy = this.player.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0) {
                    const homingSpeed = 2.5; // Adjusted speed for homing bullets
                    b.vx = (dx / dist) * homingSpeed;
                    b.vy = (dy / dist) * homingSpeed;
                }
            }

            // Boss Spiral logic (Linear expansion for the stream)
            if (b.ownerType === 'boss-spiral') {
                // Remove spiralStep rotation to keep the circular pattern clean as requested
                const baseSpeed = 1.5;
                b.x += Math.cos(b.spiralAngle) * baseSpeed;
                b.y += Math.sin(b.spiralAngle) * baseSpeed;
                // Avoid double-applying velocity
                b.vx = 0;
                b.vy = 0;
            }

            b.x += b.vx;
            b.y += b.vy;
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
                            let dmg = 15;
                            if (this.damageResistTimer > 0) {
                                dmg *= 0.2;
                            } else {
                                this.damageResistTimer = 200;
                            }
                            this.player.health -= dmg; // Impact damage
                            this.damageFlash = 200;
                        }
                    } else if (b.ownerType === 'boss-spiral') {
                        let dmg = 15;
                        if (this.damageResistTimer > 0) dmg *= 0.2;
                        else this.damageResistTimer = 200;
                        this.player.health -= dmg;
                        this.damageFlash = 200;
                        hit = true;
                    } else {
                        let dmg = 10;
                        if (this.damageResistTimer > 0) {
                            dmg *= 0.2;
                        } else {
                            this.damageResistTimer = 200;
                        }
                        this.player.health -= dmg; 
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
                        this.boss.health -= 1;
                        this.explosions.push({x: b.x, y: b.y, life: 0.5, decay: 0.1, maxRadius: 20});
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
                        e.health -= 1;
                        if (b.ownerType === 'player') {
                            e.lastTimeHitByPlayer = this.gameTime;
                        }
                        hit = true;
                        if (e.health <= 0) {
                            this.explosions.push({x: e.x, y: e.y, life: 0.8, decay: 0.08, maxRadius: 30});
                            if (b.ownerType === 'player') this.kills++;
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
            meleeUnits.forEach(m => { if (m.ai) m.ai.partner = null; });
            return;
        }

        const counts = new Map();
        riflemen.forEach(r => counts.set(r, 0));

        // Sort melee units by distance to their closest rifleman to try and fill logical slots first?
        // Or just iterate. Iteration is probably fine.
        meleeUnits.forEach(m => {
            const sortedRiflemen = [...riflemen].sort((a, b) => {
                const countA = counts.get(a);
                const countB = counts.get(b);
                if (countA !== countB) return countA - countB;
                
                const distA = (m.x - a.x)**2 + (m.y - a.y)**2;
                const distB = (m.x - b.x)**2 + (m.y - b.y)**2;
                return distA - distB;
            });

            const bestPartner = sortedRiflemen[0];
            if (m.ai) {
                m.ai.partner = bestPartner;
                counts.set(bestPartner, counts.get(bestPartner) + 1);
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
        const auraRadius = 220;
        const auraGrad = this.ctx.createRadialGradient(
            this.player.x, this.player.y, 0,
            this.player.x, this.player.y, auraRadius
        );
        auraGrad.addColorStop(0, 'rgba(135, 206, 235, 0.33)'); // SkyBlue with some opacity
        auraGrad.addColorStop(1, 'rgba(135, 206, 235, 0)');   // Completely transparent at edges

        this.ctx.save();
        this.ctx.fillStyle = auraGrad;
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, auraRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();

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
                    const angle = Math.atan2(b.vy, b.vx);
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
