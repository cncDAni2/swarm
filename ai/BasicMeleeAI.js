export class BasicMeleeAI {
    constructor(owner) {
        this.owner = owner; // The enemy object this AI controls
        this.speed = 1.6;
        this.partner = null;
        this.lastEvadeUpdateTime = 0;
        this.evadeWalls = [];
    }

    update(player, enemies, bullets, currentTime) {
        const riflemen = enemies.filter(e => e.type === 'rifleman');
        
        // 1. Partner management
        if (this.partner && !enemies.includes(this.partner)) {
            this.partner = null;
        }

        if (!this.partner) {
            // Find the specific logic-assigned partner using pairId
            this.partner = riflemen.find(r => r.pairId === this.owner.pairId);
            
            // Fallback to closest if ID matching fails for some reason
            if (!this.partner) {
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

                // Position: 80 units in front of Rifleman, 35 units to the side
                targetX = this.partner.x + ux * 80 + perpX * 35;
                targetY = this.partner.y + uy * 80 + perpY * 35;
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

        // --- Evasion Logic (Firing Lines & Player Bullets) ---
        // Player Bullets: Snapshot every 1s (Nerfed)
        if (currentTime - this.lastEvadeUpdateTime > 1000) {
            this.evadeWalls = [];
            if (bullets) {
                bullets.filter(b => b.ownerType === 'player').forEach(b => {
                    this.evadeWalls.push({ type: 'bullet', x: b.x, y: b.y, vx: b.vx, vy: b.vy });
                });
            }
            this.lastEvadeUpdateTime = currentTime;
        }

        // Firing Lines: Real-time update (Immediately reactive)
        const activeFiringLines = [];
        riflemen.forEach(r => {
            if (r.ai && r.ai.currentFiringLine) {
                activeFiringLines.push({ type: 'firingLine', ...r.ai.currentFiringLine });
            }
        });

        // Apply Evasion Forces
        [...this.evadeWalls, ...activeFiringLines].forEach(w => {
            const vbx = this.owner.x - w.x;
            const vby = this.owner.y - w.y;
            const vlen = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
            if (vlen === 0) return;
            const bux = w.vx / vlen;
            const buy = w.vy / vlen;
            const proj = vbx * bux + vby * buy;
            const range = w.type === 'firingLine' ? w.dist : 200;
            const width = w.type === 'firingLine' ? 40 : 50;

            if (proj > 0 && proj < range) {
                const closestX = w.x + bux * proj;
                const closestY = w.y + buy * proj;
                const distToLineSq = (this.owner.x - closestX)**2 + (this.owner.y - closestY)**2;
                if (distToLineSq < (width * width)) {
                    const perpx = -buy;
                    const perpy = bux;
                    const side = (this.owner.x - w.x) * perpx + (this.owner.y - w.y) * perpy;
                    const steerDir = side >= 0 ? 1 : -1;
                    const force = w.type === 'firingLine' ? 2.5 : 2.0;
                    moveX += perpx * steerDir * force;
                    moveY += perpy * steerDir * force;
                }
            }
        });

        // Final normalization
        const finalMoveDist = Math.sqrt(moveX * moveX + moveY * moveY);
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

        this.owner.x += moveX + separationX;
        this.owner.y += moveY + separationY;
    }
}
