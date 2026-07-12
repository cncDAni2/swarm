export class BasicMeleeAI {
    constructor(owner) {
        this.owner = owner; // The enemy object this AI controls
        this.speed = 1.6;
        this.partner = null;
        this.lastEvadeUpdateTime = 0;
        this.playerBulletWalls = [];
        this.evadeWalls = [];
    }

    update(player, enemies, bullets, currentTime) {
        const riflemen = enemies.filter(e => e.type === 'rifleman');
        
        // 1. Partner management
        if (this.partner && !enemies.includes(this.partner)) {
            this.partner = null;
        }

        if (!this.partner) {
            // Find a partner if Game.js hasn't assigned one yet or if they died
            const availableRiflemen = riflemen.filter(r => {
                const hasPartner = enemies.some(e => e.type === 'melee' && e.ai && e.ai.partner === r);
                return !hasPartner;
            });
            let candidates = availableRiflemen.length > 0 ? availableRiflemen : riflemen;
            let minDist = Infinity;
            candidates.forEach(r => {
                const d = Math.sqrt((this.owner.x - r.x) ** 2 + (this.owner.y - r.y) ** 2);
                if (d < minDist) {
                    minDist = d;
                    this.partner = r;
                }
            });
        }

        let moveX = 0;
        let moveY = 0;
        const dx = player.x - this.owner.x;
        const dy = player.y - this.owner.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        // Movement Mode Decision
        let targetX = player.x;
        let targetY = player.y;
        let isFormation = false;

        // Formation Mode: If distance > 300 AND we have a partner
        if (distToPlayer > 300 && this.partner) {
            const pdx = player.x - this.partner.x;
            const pdy = player.y - this.partner.y;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

            if (pdist > 0) {
                const ux = pdx / pdist;
                const uy = pdy / pdist;
                const perpX = -uy;
                const perpY = ux;

                // Find other bodyguards for this partner to spread out
                const bodyguards = enemies.filter(e => e.type === 'melee' && e.ai && e.ai.partner === this.partner);
                const myIndex = bodyguards.indexOf(this.owner);
                
                // Spread pattern: alternate sides and stagger depth
                const side = (myIndex % 2 === 0) ? 1 : -1;
                const depth = 80 + Math.floor(myIndex / 2) * 25;
                const offsetSide = 35;

                targetX = this.partner.x + ux * depth + perpX * offsetSide * side;
                targetY = this.partner.y + uy * depth + perpY * offsetSide * side;
                isFormation = true;
            }
        }

        const tdx = targetX - this.owner.x;
        const tdy = targetY - this.owner.y;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

        if (tdist > 0) {
            moveX = (tdx / tdist) * this.speed;
            moveY = (tdy / tdist) * this.speed;
        }

        // --- Projectile Evasion ---
        // Player Bullets: Snapshot every 0.2s
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

        // Firing Lines: Real-time update
        const activeFiringLines = [];
        riflemen.forEach(r => {
            if (r.ai && r.ai.currentFiringLine) {
                activeFiringLines.push({ type: 'firingLine', ...r.ai.currentFiringLine });
            }
        });

        // Apply Forces
        [...this.evadeWalls, ...activeFiringLines].forEach(w => {
            const vbx = this.owner.x - w.x;
            const vby = this.owner.y - w.y;
            const vlen = Math.sqrt((w.vx || 0)**2 + (w.vy || 0)**2);
            if (vlen === 0) return;
            const bux = w.vx / vlen;
            const buy = w.vy / vlen;
            const proj = vbx * bux + vby * buy;
            
            let range = 200;
            let width = 50;
            let force = 2.0;

            if (w.type === 'firingLine') {
                range = w.dist; width = 40; force = 2.5;
            } else if (w.type === 'player-bullet') {
                range = 2000; width = 25; force = 2.0;
            } else if (w.type === 'boss-bullet') {
                range = 90; width = 34; force = 4.0;
            } else if (w.type === 'plasma-bullet') {
                range = 100; width = 38; force = 5.0; 
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
                        moveX += (dx / d) * force * 1.5;
                        moveY += (dy / d) * force * 1.5;
                    }
                }
            }
        });

        // Final normalization
        let finalMoveDist = Math.sqrt(moveX * moveX + moveY * moveY);
        if (finalMoveDist > 0) {
            moveX = (moveX / finalMoveDist) * this.speed;
            moveY = (moveY / finalMoveDist) * this.speed;
        }

        // 3. Separation
        const separationDist = 50;
        let separationX = 0;
        let separationY = 0;

        enemies.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const dist = Math.sqrt(diffX * diffX + diffY * diffY);
            if (dist > 0 && dist < separationDist) {
                separationX += (diffX / dist) * (separationDist - dist) * 0.1;
                separationY += (diffY / dist) * (separationDist - dist) * 0.1;
            }
        });

        // Combined movement check to never exceed speed
        let combinedX = moveX + separationX;
        let combinedY = moveY + separationY;
        const totalDist = Math.sqrt(combinedX * combinedX + combinedY * combinedY);
        if (totalDist > this.speed) {
            combinedX = (combinedX / totalDist) * this.speed;
            combinedY = (combinedY / totalDist) * this.speed;
        }

        this.owner.x += combinedX;
        this.owner.y += combinedY;
    }
}
