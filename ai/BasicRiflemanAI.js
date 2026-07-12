export class BasicRiflemanAI {
    constructor(owner) {
        this.owner = owner;
        this.speed = 1.3; // Slightly faster to keep up with melee but still slower
        this.fireRange = 800;
        this.lastShotTime = 0;
        this.fireRateDelay = 1500; // Standard 1.5s delay between bursts
        this.bulletSpeed = 5;
        this.currentFiringLine = null;
        
        // Burst properties
        this.burstCount = 0;
        this.maxBurst = 3;
        this.burstInterval = 100; // 100ms between bullets in a burst
        this.isPredictiveBurst = false;
        this.lastBurstTime = 0;

        // Evasion logic for projectiles
        this.lastEvadeUpdateTime = 0;
        this.playerBulletWalls = [];
        this.evadeWalls = [];
    }

    update(player, enemies, bullets, currentTime, spawnBullet) {
        const dx = player.x - this.owner.x;
        const dy = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        let moveX = 0;
        let moveY = 0;

        // 1. Movement logic: Move towards player but stop at 300 range
        if (distToPlayer > 350) {
            moveX = (dx / distToPlayer) * this.speed;
            moveY = (dy / distToPlayer) * this.speed;
        } else if (distToPlayer < 300) {
            // Keep the distance if player gets too close
            moveX = -(dx / distToPlayer) * this.speed;
            moveY = -(dy / distToPlayer) * this.speed;
        }

        // --- Projectile Evasion ---
        if (currentTime - this.lastEvadeUpdateTime > 200) {
            this.playerBulletWalls = bullets ? bullets.filter(b => b.ownerType === 'player').map(b => ({ type: 'player-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy })) : [];
            this.lastEvadeUpdateTime = currentTime;
        }

        const urgentWalls = [];
        if (bullets) {
            bullets.forEach(b => {
                if (b.ownerType === 'boss-spiral') urgentWalls.push({ type: 'boss-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy });
                else if (b.ownerType === 'sky-pulse') urgentWalls.push({ type: 'plasma-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy });
            });
        }
        this.evadeWalls = [...this.playerBulletWalls, ...urgentWalls];

        this.evadeWalls.forEach(w => {
            const vbx = this.owner.x - w.x;
            const vby = this.owner.y - w.y;
            const vlen = Math.sqrt((w.vx || 0)**2 + (w.vy || 0)**2);
            if (vlen === 0) return;
            const bux = w.vx / vlen;
            const buy = w.vy / vlen;
            const proj = vbx * bux + vby * buy;

            let range = 200;
            let width = 25;

            if (w.type === 'player-bullet') {
                range = 2000;
                width = 25;
            } else if (w.type === 'boss-bullet' || w.type === 'plasma-bullet') {
                range = w.type === 'boss-bullet' ? 90 : 100;
                width = w.type === 'boss-bullet' ? 34 : 38;
            }

            if (proj > 0 && proj < range) {
                const closestX = w.x + bux * proj;
                const closestY = w.y + buy * proj;
                const distToLineSq = (this.owner.x - closestX)**2 + (this.owner.y - closestY)**2;
                if (distToLineSq < (width * width)) {
                    const perpx = -buy;
                    const perpy = bux;
                    const side = (this.owner.x - w.x) * perpx + (this.owner.y - w.y) * perpy;
                    const steerDir = side >= 0 ? 1 : -1;
                    const force = w.type === 'plasma' || w.type === 'boss' ? 5.0 : 4.0;
                    moveX += perpx * steerDir * force;
                    moveY += perpy * steerDir * force;
                }
            }

            // Sphere avoidance for lethal shells (Plasma & Boss Spiral)
            if (w.type === 'plasma-bullet' || w.type === 'boss-bullet') {
                const dx = this.owner.x - w.x;
                const dy = this.owner.y - w.y;
                const d2 = dx * dx + dy * dy;
                const sphereRadius = width;
                if (d2 < sphereRadius * sphereRadius) {
                    const d = Math.sqrt(d2);
                    if (d > 0) {
                        const sForce = w.type === 'plasma-bullet' || w.type === 'boss-bullet' ? 6.0 : 4.0;
                        moveX += (dx / d) * sForce;
                        moveY += (dy / d) * sForce;
                    }
                }
            }
        });

        // 2. Separation (softened)
        const separationDist = 60;
        enemies.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const dist = Math.sqrt(diffX * diffX + diffY * diffY);
            if (dist > 0 && dist < separationDist) {
                const force = (separationDist - dist) * 0.1;
                moveX += (diffX / dist) * force;
                moveY += (diffY / dist) * force;
            }
        });

        // Ensure movement doesn't exceed speed
        const finalMoveDist = Math.sqrt(moveX * moveX + moveY * moveY);
        if (finalMoveDist > this.speed) {
            moveX = (moveX / finalMoveDist) * this.speed;
            moveY = (moveY / finalMoveDist) * this.speed;
        }

        this.owner.x += moveX;
        this.owner.y += moveY;

        // Reset firing line if not shooting
        this.currentFiringLine = null;

        // 3. Shooting logic (Burst Mode)
        const canStartBurst = currentTime - this.lastBurstTime >= this.fireRateDelay && this.burstCount === 0;
        const canContinueBurst = this.burstCount > 0 && currentTime - this.lastShotTime >= this.burstInterval;

        if ((canStartBurst || canContinueBurst) && distToPlayer < this.fireRange) {
            if (!this.isAnyFriendlyWithin100Units(player, enemies)) {
                // Determine burst mode at the start of a new burst
                if (this.burstCount === 0) {
                    this.isPredictiveBurst = Math.random() < 0.7;
                    this.lastBurstTime = currentTime;
                }

                let targetX = player.x;
                let targetY = player.y;

                if (this.isPredictiveBurst) {
                    const playerVelLen = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
                    if (playerVelLen > 0.1) {
                        const ux = player.vx / playerVelLen;
                        const uy = player.vy / playerVelLen;
                        const constantSpeed = 4.12;

                        let travelTime = distToPlayer / this.bulletSpeed;
                        let predictedX = player.x + ux * constantSpeed * travelTime;
                        let predictedY = player.y + uy * constantSpeed * travelTime;
                        
                        const distToPredicted = Math.sqrt((predictedX - this.owner.x)**2 + (predictedY - this.owner.y)**2);
                        travelTime = distToPredicted / this.bulletSpeed;
                        
                        targetX = player.x + ux * constantSpeed * travelTime;
                        targetY = player.y + uy * constantSpeed * travelTime;
                    }
                }

                const pdx = targetX - this.owner.x;
                const pdy = targetY - this.owner.y;
                const angle = Math.atan2(pdy, pdx);
                
                this.currentFiringLine = {
                    x: this.owner.x,
                    y: this.owner.y,
                    dist: distToPlayer,
                    ux: dx / distToPlayer,
                    uy: dy / distToPlayer
                };

                spawnBullet({
                    x: this.owner.x,
                    y: this.owner.y,
                    vx: Math.cos(angle) * this.bulletSpeed,
                    vy: Math.sin(angle) * this.bulletSpeed,
                    radius: 4,
                    color: '#ff4444',
                    ownerType: 'enemy',
                    source: this.owner
                });

                this.lastShotTime = currentTime;
                this.burstCount++;

                if (this.burstCount >= this.maxBurst) {
                    this.burstCount = 0;
                }
            }
        }
    }

    isAnyFriendlyWithin100Units(player, enemies) {
        const dx = player.x - this.owner.x;
        const dy = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);
        if (distToPlayer === 0) return false;

        const ux = dx / distToPlayer;
        const uy = dy / distToPlayer;

        for (const other of enemies) {
            if (other === this.owner) continue;
            if (other.type === 'sky-pulse') continue;

            const vpx = other.x - this.owner.x;
            const vpy = other.y - this.owner.y;
            const proj = vpx * ux + vpy * uy;

            if (proj > 0 && proj < 100) {
                const closestX = this.owner.x + ux * proj;
                const closestY = this.owner.y + uy * proj;
                const distToLineSq = (other.x - closestX) ** 2 + (other.y - closestY) ** 2;
                if (distToLineSq < 1600) return true;
            }
        }
        return false;
    }

    hasMeleePartnerInFront(player, enemies) {
        // Find if this Rifleman has Melee partners (who have this as .partner)
        // and if any of them are between this and the player.
        const me = this.owner;

        const partners = enemies.filter(e => e.type === 'melee' && e.ai && e.ai.partner === me);
        if (partners.length === 0) return false;

        const dx = player.x - me.x;
        const dy = player.y - me.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        if (distToPlayer === 0) return false;

        const ux = dx / distToPlayer;
        const uy = dy / distToPlayer;

        for (const partner of partners) {
            // Check if the partner is between me and the player
            const vpx = partner.x - me.x;
            const vpy = partner.y - me.y;
            const proj = vpx * ux + vpy * uy;

            if (proj > 5 && proj < distToPlayer) {
                // Partner is in front. Check how close to the line.
                const closestX = me.x + ux * proj;
                const closestY = me.y + uy * proj;
                const distToLineSq = (partner.x - closestX) ** 2 + (partner.y - closestY) ** 2;
                
                // If within 80 units of the ideal line, we consider it "in front"
                if (distToLineSq < 6400) return true;
            }
        }
        
        return false;
    }

    isFriendlyInWay(player, enemies) {
        const dx = player.x - this.owner.x;
        const dy = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        if (distToPlayer === 0) return false;

        const ux = dx / distToPlayer;
        const uy = dy / distToPlayer;
        const checkRadius = 25; // 50 units wide total

        for (const other of enemies) {
            if (other === this.owner) continue;
            // Ground units shouldn't worry about hitting flying ones
            if (other.type === 'sky-pulse') continue;

            const vpx = other.x - this.owner.x;
            const vpy = other.y - this.owner.y;
            const proj = vpx * ux + vpy * uy;

            if (proj > 0 && proj < distToPlayer) {
                const closestX = this.owner.x + ux * proj;
                const closestY = this.owner.y + uy * proj;
                const distToLineSq = (other.x - closestX) ** 2 + (other.y - closestY) ** 2;

                if (distToLineSq < checkRadius * checkRadius) return true;
            }
        }
        return false;
    }
}
