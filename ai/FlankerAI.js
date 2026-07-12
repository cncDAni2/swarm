export class FlankerAI {
    constructor(owner) {
        this.owner = owner;
        this.speed = 2.2; 
        this.behavior = Math.random() < 0.5 ? 'left' : 'right';
        this.state = 'flanking'; // 'flanking' or 'attacking'
        this.lastEvadeUpdateTime = 0;
        this.playerBulletWalls = [];
        this.evadeWalls = [];
    }

    update(player, enemies, bullets, currentTime) {
        // 1. Calculate Distances
        const dxP = player.x - this.owner.x;
        const dyP = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dxP * dxP + dyP * dyP);

        // 2. State Machine for Flanking
        let targetX = player.x;
        let targetY = player.y;

        if (this.state === 'flanking') {
            // Move to a position 500 units to the side of the player
            if (distToPlayer > 0) {
                const ux = dxP / distToPlayer;
                const uy = dyP / distToPlayer;
                const perpx = -uy;
                const perpy = ux;
                const side = this.behavior === 'left' ? -1 : 1;
                
                targetX = player.x + perpx * side * 500;
                targetY = player.y + perpy * side * 500;
            }

            // If we reached the flank zone (approx 100 units from target), switch to attack
            const fdx = targetX - this.owner.x;
            const fdy = targetY - this.owner.y;
            const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
            
            if (fdist < 100) {
                this.state = 'attacking';
            }
        } else {
            // Attacking: Move directly towards player
            targetX = player.x;
            targetY = player.y;

            // Per user: "mozduljon a játékos felé mindaddig amíg 700 cella távolságon belül van - ezután újra flank"
            if (distToPlayer < 700) {
                this.state = 'flanking';
                // Toggle behavior for variety
                this.behavior = Math.random() < 0.5 ? 'left' : 'right';
            }
        }

        // 3. Movement Physics
        let moveX = 0;
        let moveY = 0;
        const tdx = targetX - this.owner.x;
        const tdy = targetY - this.owner.y;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

        if (tdist > 0) {
            moveX = (tdx / tdist) * this.speed;
            moveY = (tdy / tdist) * this.speed;
        }

        // 4. Evasion Logic
        // Snapshot player bullets every 0.2s
        if (currentTime - this.lastEvadeUpdateTime > 200) {
            this.playerBulletWalls = bullets ? bullets.filter(b => b.ownerType === 'player').map(b => ({ type: 'player-bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy })) : [];
            this.lastEvadeUpdateTime = currentTime;
        }

        // Boss & Plasma: Immediate every frame
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
                    const force = w.type === 'boss' || w.type === 'plasma' ? 5.0 : 2.0;
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
                        moveX += (dx / d) * 5.0;
                        moveY += (dy / d) * 5.0;
                    }
                }
            }
        });

        // 5. Separation
        const separationDist = 40;
        enemies.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const d = Math.sqrt(diffX * diffX + diffY * diffY);
            if (d > 0 && d < separationDist) {
                moveX += (diffX / d) * (separationDist - d) * 0.2;
                moveY += (diffY / d) * (separationDist - d) * 0.2;
            }
        });

        // 6. Apply with speed limit
        const finalMoveX = moveX;
        const finalMoveY = moveY;
        const finalMoveDist = Math.sqrt(finalMoveX * finalMoveX + finalMoveY * finalMoveY);
        
        if (finalMoveDist > this.speed) {
            this.owner.x += (finalMoveX / finalMoveDist) * this.speed;
            this.owner.y += (finalMoveY / finalMoveDist) * this.speed;
        } else {
            this.owner.x += finalMoveX;
            this.owner.y += finalMoveY;
        }
    }
}
