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

        // --- Bullets Evasion (Nerfed to 1s updates) ---
        if (bullets && currentTime - this.lastEvadeUpdateTime > 1000) {
            this.evadeWalls = bullets
                .filter(b => b.ownerType === 'player')
                .map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }));
            this.lastEvadeUpdateTime = currentTime;
        }

        if (this.evadeWalls.length > 0) {
            this.evadeWalls.forEach(w => {
                const vbx = this.owner.x - w.x;
                const vby = this.owner.y - w.y;
                
                const vlen = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
                if (vlen === 0) return;
                const bux = w.vx / vlen;
                const buy = w.vy / vlen;
                
                const proj = vbx * bux + vby * buy;
                
                if (proj > 0 && proj < 250) { // Flyer dodges from slightly further
                    const closestX = w.x + bux * proj;
                    const closestY = w.y + buy * proj;
                    const distToLineSq = (this.owner.x - closestX)**2 + (this.owner.y - closestY)**2;
                    
                    if (distToLineSq < 3600) { // Within 60 units
                        const perpx = -buy;
                        const perpy = bux;
                        const side = (this.owner.x - w.x) * perpx + (this.owner.y - w.y) * perpy;
                        const steerDir = side >= 0 ? 1 : -1;
                        moveX += perpx * steerDir * 3.5; // Flyers are faster dodgers, stale data needs more force
                        moveY += perpy * steerDir * 3.5;
                    }
                }
            });
        }

        // Szétválás csak repülő egységektől
        const flyers = enemies.filter(e => e.type === 'sky-pulse');
        const separationDist = 50;
        flyers.forEach(other => {
            if (other === this.owner) return;
            const diffX = this.owner.x - other.x;
            const diffY = this.owner.y - other.y;
            const d = Math.sqrt(diffX * diffX + diffY * diffY);
            if (d > 0 && d < separationDist) {
                moveX += (diffX / d) * (separationDist - d) * 0.2;
                moveY += (diffY / d) * (separationDist - d) * 0.2;
            }
        });

        // Pályán belül maradás
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        const margin = 50;
        if (this.owner.x + moveX < margin || this.owner.x + moveX > canvasWidth - margin) moveX = 0;
        if (this.owner.y + moveY < margin || this.owner.y + moveY > canvasHeight - margin) moveY = 0;

        this.owner.x += moveX;
        this.owner.y += moveY;

        // Tüzelés: Hőkövető lövedék (Csak 1000 egységen belül)
        if (distToPlayer < 1000 && currentTime - this.lastShotTime > this.fireRate) {
            // Repülő egység nem tart a földi egységek eltalálásától
            const angle = Math.atan2(dy, dx);
            spawnBullet({
                x: this.owner.x,
                y: this.owner.y,
                vx: Math.cos(angle) * 1.5, // Further reduced speed (was 3)
                vy: Math.sin(angle) * 1.5,
                radius: 12, // Increased size
                color: 'cyan',
                ownerType: 'sky-pulse',
                source: this.owner,
                isHoming: true,
                createdAt: currentTime,
                lifetime: 4000
            });
            this.lastShotTime = currentTime;
            // Randomize next shot
            this.fireRate = this.baseFireRate * (0.75 + Math.random() * 0.5);
        }
    }
}
