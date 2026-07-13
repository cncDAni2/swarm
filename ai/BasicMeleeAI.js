export class BasicMeleeAI {
    constructor(owner) {
        this.owner = owner; // The enemy object this AI controls
        this.speed = 1.6;
        this.partner = null;
        // Role assigned by Game.redistributeBodyguards(): 'bodyguard' or 'blocker'.
        this.role = 'blocker';
        this.blockerIndex = 0;   // slot index among blockers (for pincer spread)
        this.blockerTotal = 1;   // total blockers (for pincer spread)
        this.lastEvadeUpdateTime = 0;
        this.playerBulletWalls = [];
        this.evadeWalls = [];
    }

    update(player, enemies, bullets, currentTime) {
        const riflemen = enemies.filter(e => e.type === 'rifleman');

        // 1. Partner management (fallback if Game.js hasn't assigned yet or partner died)
        if (this.partner && !enemies.includes(this.partner)) {
            this.partner = null;
        }
        if (!this.partner && riflemen.length > 0) {
            const availableRiflemen = riflemen.filter(r => {
                const hasPartner = enemies.some(e => e.type === 'melee' && e.ai && e.ai.partner === r);
                return !hasPartner;
            });
            const candidates = availableRiflemen.length > 0 ? availableRiflemen : riflemen;
            let minDist = Infinity;
            candidates.forEach(r => {
                const d = (this.owner.x - r.x) ** 2 + (this.owner.y - r.y) ** 2;
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

        // 2. Role-based target position.
        const target = this.computeRoleTarget(player, enemies);
        const tdx = target.x - this.owner.x;
        const tdy = target.y - this.owner.y;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

        if (tdist > 0) {
            moveX = (tdx / tdist) * this.speed;
            moveY = (tdy / tdist) * this.speed;
        }

        // 3. TOP PRIORITY: clear any active rifle fire-lane (shortest possible disruption).
        const laneSteer = this.computeLaneClearing(riflemen);
        if (laneSteer.active) {
            // Override role movement with a hard sidestep out of the shot corridor.
            moveX = laneSteer.x * this.speed;
            moveY = laneSteer.y * this.speed;
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

        // Apply Forces
        this.evadeWalls.forEach(w => {
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

            if (w.type === 'player-bullet') {
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

    // Decide where this melee should be based on its role.
    computeRoleTarget(player, enemies) {
        // No rifle to protect -> behave as a straight chaser.
        if (!this.partner) {
            return { x: player.x, y: player.y };
        }

        const rifle = this.partner;
        // Unit vector pointing from the rifle toward the player (the threat direction).
        const rpx = player.x - rifle.x;
        const rpy = player.y - rifle.y;
        const rpLen = Math.sqrt(rpx * rpx + rpy * rpy) || 1;
        const ux = rpx / rpLen;
        const uy = rpy / rpLen;
        const perpX = -uy;
        const perpY = ux;

        if (this.role === 'bodyguard') {
            // Sit on the player-facing side of the rifle, close, interposing its body.
            // Because the rifle is slow, the guard naturally orbits it as the player moves.
            const guardDist = 55;
            return {
                x: rifle.x + ux * guardDist,
                y: rifle.y + uy * guardDist
            };
        }

        // Blocker: screen the player's line to the rifle and form a pincer arc
        // near the player, on the rifle-facing hemisphere.
        const total = Math.max(1, this.blockerTotal);
        // Spread blockers across an arc in front of the player toward the rifle.
        const spread = 0.7; // radians of half-arc
        let t = 0;
        if (total > 1) t = (this.blockerIndex / (total - 1)) * 2 - 1; // -1..1
        const sideOffset = t * spread;

        // Base direction: from player toward the rifle (so we cut the shooting lane).
        const cos = Math.cos(sideOffset);
        const sin = Math.sin(sideOffset);
        // Rotate the (-u) direction (player->rifle) by the arc offset.
        const baseX = -ux;
        const baseY = -uy;
        const dirX = baseX * cos - baseY * sin;
        const dirY = baseX * sin + baseY * cos;

        const screenDist = 90; // how far in front of the player to sit
        return {
            x: player.x + dirX * screenDist + perpX * t * 30,
            y: player.y + dirY * screenDist + perpY * t * 30
        };
    }

    // Return a normalized sidestep vector if any rifle is actively requesting this
    // unit's position be cleared from its shot corridor. Highest movement priority.
    computeLaneClearing(riflemen) {
        for (const r of riflemen) {
            const req = r.ai && r.ai.fireLaneRequest;
            if (!req) continue;

            const vpx = this.owner.x - req.x;
            const vpy = this.owner.y - req.y;
            const proj = vpx * req.ux + vpy * req.uy;
            if (proj <= 0 || proj >= req.dist) continue;

            const closestX = req.x + req.ux * proj;
            const closestY = req.y + req.uy * proj;
            const offX = this.owner.x - closestX;
            const offY = this.owner.y - closestY;
            const offDistSq = offX * offX + offY * offY;
            const corridor = 34; // must exceed rifle's isFriendlyInLane radius (28) to fully clear

            if (offDistSq < corridor * corridor) {
                const perpX = -req.uy;
                const perpY = req.ux;
                const side = offX * perpX + offY * perpY;
                const dir = side >= 0 ? 1 : -1;
                return { active: true, x: perpX * dir, y: perpY * dir };
            }
        }
        return { active: false, x: 0, y: 0 };
    }
}
