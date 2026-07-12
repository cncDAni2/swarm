import { Enemy } from './Enemy.js';
import { Wormhole } from './Wormhole.js';
import { AudioService } from './AudioService.js';
import { Boss } from './Boss.js';

export class Game {
    constructor(canvas, difficulty = 'ultra-violence') {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audio = new AudioService();
        this.difficulty = difficulty;
        
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
            boss: new Image(),
            bossClosed: new Image()
        };
        this.assets.playerIdle.src = './assets/player-idle.png';
        this.assets.playerShoot.src = './assets/player-shoot.png';
        this.assets.melee.src = './assets/BasicMelee.png';
        this.assets.rifleman.src = './assets/Rifle.png';
        this.assets.flanker.src = './assets/flanker.png';
        this.assets.skyPulse.src = './assets/skypulse.png';
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
        
        this.round = 0;
        this.roundDisplayTimer = -5000;
        this.roundDisplayDuration = 3000;
        this.roundTextAlpha = 0;
        
        this.damageFlash = 0;
        this.damageResistTimer = 0;
        this.playedDamageLow = false;
        this.playedDamageHeavy = false;
        
        this.gameTime = 0;
        this.paused = false;
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

        this.restartBtn.onclick = () => location.reload();
        this.restartRoundBtn.onclick = () => this.resetGame(false);
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
        window.addEventListener('keydown', e => this.keys[e.code] = true);
        window.addEventListener('keyup', e => this.keys[e.code] = false);
        window.addEventListener('mousedown', e => {
            this.isMouseDown = true;
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        });
        window.addEventListener('mouseup', () => this.isMouseDown = false);
        window.addEventListener('mousemove', e => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        });

        window.addEventListener('blur', () => {
            this.paused = true;
        });
        window.addEventListener('focus', () => {
            this.paused = false;
        });
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
                'duo'
            ));
            this.wormholes.push(new Wormhole(
                Math.random() * (this.canvas.width - 100) + 50,
                Math.random() * (this.canvas.height - 100) + 50,
                currentTime,
                'flanker'
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

                if (wh.pattern === 'duo') {
                    if (!this.nextPairId) this.nextPairId = 1;
                    if (!this._spawnSequence) this._spawnSequence = 0;
                    
                    const currentSeq = this._spawnSequence % 4;
                    if (currentSeq === 0) newEnemy.pairId = this.nextPairId;
                    if (currentSeq === 1) newEnemy.pairId = this.nextPairId + 1;
                    if (currentSeq === 2) { 
                        newEnemy.pairId = this.nextPairId;
                    }
                    if (currentSeq === 3) {
                        newEnemy.pairId = this.nextPairId + 1;
                        this.nextPairId += 2;
                    }
                    
                    this._spawnSequence++;
                }

                this.enemies.push(newEnemy);
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
                    'duo'
                ));
                this.wormholes.push(new Wormhole(
                    Math.random() * (this.canvas.width - 100) + 50,
                    Math.random() * (this.canvas.height - 100) + 50,
                    currentTime,
                    'flanker'
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
            });
            
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
            if (b.isHoming) {
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

        this.wormholes.forEach(wh => wh.draw(this.ctx, this.assets.spawn, currentTime));
        if (this.boss) this.boss.draw(this.ctx, this.gameTime, this.assets);
        
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
