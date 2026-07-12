export class SkyPulseAI {
    constructor(owner) {
        this.owner = owner;
        this.speed = 2.4;
        this.targetDist = 500;
        this.lastShotTime = 0;
        this.baseFireRate = 2500; // milliseconds
        this.fireRate = this.baseFireRate * (0.75 + Math.random() * 0.5); // +-25% random
        this.lastEvadeUpdateTime = 0;
        this.evadeWalls = [];
    }

    update(player, enemies, bullets, currentTime, spawnBullet) {
        const dx = player.x - this.owner.x;
        const dy = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        let moveX = 0;
        let moveY = 0;

        // Távolság tartása (500 egység)
        if (distToPlayer > this.targetDist + 20) {
            moveX = (dx / distToPlayer) * this.speed;
            moveY = (dy / distToPlayer) * this.speed;
        } else if (distToPlayer < this.targetDist - 20) {
            moveX = -(dx / distToPlayer) * this.speed;
            moveY = -(dy / distToPlayer) * this.speed;
        }

        // --- Sky-Pulse flies above ground-level threats, but still dodges Player bullets ---
        if (bullets && currentTime - this.lastEvadeUpdateTime > 200) {
            this.evadeWalls = bullets
                .filter(b => b.ownerType === 'player')
                .map(b => ({ type: 'player-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy }));
            this.lastEvadeUpdateTime = currentTime;
        }

        this.evadeWalls.forEach(w => {
            const vbx = this.owner.x - w.x;
            const vby = this.owner.y - w.y;
            const vlen = Math.sqrt((w.vx || 0)**2 + (w.vy || 0)**2);
            if (vlen === 0) return;
            const bux = w.vx / vlen;
            const buy = w.vy / vlen;
            const proj = vbx * bux + vby * buy;

            const range = 250;
            const width = 60;

            if (proj > 0 && proj < range) {
                const closestX = w.x + bux * proj;
                const closestY = w.y + buy * proj;
                const distToLineSq = (this.owner.x - closestX)**2 + (this.owner.y - closestY)**2;
                if (distToLineSq < (width * width)) {
                    const perpx = -buy;
                    const perpy = bux;
                    const side = (this.owner.x - w.x) * perpx + (this.owner.y - w.y) * perpy;
                    const steerDir = side >= 0 ? 1 : -1;
                    moveX += perpx * steerDir * 3.5;
                    moveY += perpy * steerDir * 3.5;
                }
            }

            // Sphere avoidance for lethal shells (Player bullets are the only threat for SkyPulse for now)
            if (w.type === 'player-bullet') {
                const dx = this.owner.x - w.x;
                const dy = this.owner.y - w.y;
                const d2 = dx * dx + dy * dy;
                const sphereRadius = width;
                if (d2 < sphereRadius * sphereRadius) {
                    const d = Math.sqrt(d2);
                    if (d > 0) {
                        moveX += (dx / d) * 4.0;
                        moveY += (dy / d) * 4.0;
                    }
                }
            }
        });

        // Szétválás csak repülő egységektől
        const flyers = enemies.filter(e => e.type === 'sky-pulse');
        const separationDist = 50;
        let separationX = 0;
        let separationY = 0;
        flyers.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const d = Math.sqrt(diffX * diffX + diffY * diffY);
            if (d > 0 && d < separationDist) {
                separationX += (diffX / d) * (separationDist - d) * 0.2;
                separationY += (diffY / d) * (separationDist - d) * 0.2;
            }
        });

        // Combined movement check to never exceed speed
        let finalMoveX = moveX + separationX;
        let finalMoveY = moveY + separationY;
        const finalDist = Math.sqrt(finalMoveX * finalMoveX + finalMoveY * finalMoveY);
        
        if (finalDist > this.speed) {
            finalMoveX = (finalMoveX / finalDist) * this.speed;
            finalMoveY = (finalMoveY / finalDist) * this.speed;
        }

        // Pályán belül maradás
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        const margin = 50;
        if (this.owner.x + finalMoveX < margin || this.owner.x + finalMoveX > canvasWidth - margin) finalMoveX = 0;
        if (this.owner.y + finalMoveY < margin || this.owner.y + finalMoveY > canvasHeight - margin) finalMoveY = 0;

        this.owner.x += finalMoveX;
        this.owner.y += finalMoveY;

        // Tüzelés: Hőkövető lövedék (Csak 1000 egységen belül)
        if (distToPlayer < 1000 && currentTime - this.lastShotTime > this.fireRate) {
            const angle = Math.atan2(dy, dx);
            const rand = Math.random();
            
            let bulletProps = {
                x: this.owner.x,
                y: this.owner.y,
                vx: Math.cos(angle) * 1.5,
                vy: Math.sin(angle) * 1.5,
                radius: 12,
                color: 'cyan',
                ownerType: 'sky-pulse',
                source: this.owner,
                isHoming: true,
                createdAt: currentTime,
                lifetime: 4000
            };

            if (rand < 0.33) {
                // Balra lő
                const ux = dx / distToPlayer;
                const uy = dy / distToPlayer;
                const perpX = uy;
                const perpY = -ux;
                bulletProps.isHoming = false;
                bulletProps.preHomingTarget = {
                    x: player.x + perpX * 600,
                    y: player.y + perpY * 600
                };
            } else if (rand < 0.66) {
                // Jobbra lő
                const ux = dx / distToPlayer;
                const uy = dy / distToPlayer;
                const perpX = -uy;
                const perpY = ux;
                bulletProps.isHoming = false;
                bulletProps.preHomingTarget = {
                    x: player.x + perpX * 600,
                    y: player.y + perpY * 600
                };
            }
            // else: Immediate homing (default setup)

            spawnBullet(bulletProps);
            this.lastShotTime = currentTime;
            // Randomize next shot
            this.fireRate = this.baseFireRate * (0.75 + Math.random() * 0.5);
        }
    }
}

