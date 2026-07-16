/**
 * A simple heuristic bot to play the game.
 * It provides movement and aiming inputs based on the game state.
 */
export class PlayerBot {
    constructor(game) {
        this.game = game;
        this.strafeAngle = 0;
        this.strafeDirection = Math.random() < 0.5 ? 1 : -1;
        this.lastDirectionChange = 0;
        
        // Large-scale movement pattern
        this.patrolTimer = 0;
        this.patrolPhase = Math.random() * Math.PI * 2;
    }

    /**
     * Updates the game controls based on the current state.
     * @param {Object} player The player object
     * @param {Array} enemies List of active enemies
     * @param {Array} bullets List of active bullets
     * @param {number} currentTime Current game time
     */
    update(player, enemies, bullets, currentTime) {
        const controls = {
            ax: 0,
            ay: 0,
            mouseX: player.x,
            mouseY: player.y,
            isMouseDown: false,
            tryElectricBeam: false
        };

        if (player.health <= 0) return controls;

        // Update strafe angle for smooth orbit
        const dt = (this.game.deltaTime || 16) / 16;
        this.strafeAngle = (this.strafeAngle || 0) + 0.02 * dt;
        this.patrolTimer += 0.005 * dt;

        // Large scale "U" / Infinity pattern center point
        const cw = (this.game.canvas.width > 0) ? this.game.canvas.width : window.innerWidth;
        const ch = (this.game.canvas.height > 0) ? this.game.canvas.height : window.innerHeight;
        
        // Large-scale target (Lissajous curve / Figure-8)
        const patrolX = cw / 2 + Math.sin(this.patrolTimer + this.patrolPhase) * (cw * 0.35);
        const patrolY = ch / 2 + Math.sin((this.patrolTimer + this.patrolPhase) * 2) * (ch * 0.25);

        // Safety check for NaN
        if (isNaN(this.strafeAngle)) this.strafeAngle = 0;

        // Periodically consider changing strafe direction if blocked or just for variety
        if (currentTime - this.lastDirectionChange > 3000 && Math.random() < 0.012) {
            this.strafeDirection *= -1;
            this.lastDirectionChange = currentTime;
        }

        // Global base movement: Follow the patrol path loosely
        const dpx = patrolX - player.x;
        const dpy = patrolY - player.y;
        const distP = Math.sqrt(dpx * dpx + dpy * dpy);
        if (distP > 50) {
            controls.ax += (dpx / distP) * 0.4;
            controls.ay += (dpy / distP) * 0.4;
        }

        const globalOrbitX = Math.cos(this.strafeAngle) * 0.4 * this.strafeDirection;
        const globalOrbitY = Math.sin(this.strafeAngle) * 0.4 * this.strafeDirection;
        controls.ax += globalOrbitX;
        controls.ay += globalOrbitY;

        // 1. AVOIDANCE: Move away from the nearest bullet or enemy
        let avoidX = 0;
        let avoidY = 0;

        // Avoid bullets - higher priority than enemies
        bullets.forEach(b => {
            if (b.source === player) return;
            const dx = player.x - b.x;
            const dy = player.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Special handling for SkyPulse missiles (isHoming)
            if (b.isHoming) {
                const age = currentTime - b.createdAt;
                const remainingLife = 4000 - age;
                
                // Only treat it as an explosion threat when it's about to expire (last 1.2s)
                // or if it's extremely close
                if (remainingLife < 1200 || dist < 120) {
                    const dangerZone = 350;
                    const importance = 8;
                    if (dist < dangerZone) {
                        const weight = (dangerZone - dist) / dangerZone;
                        avoidX += (dx / dist) * weight * importance;
                        avoidY += (dy / dist) * weight * importance;
                    }
                } else {
                    // Otherwise, just treat it as a normal projectile to sidestep,
                    // but with extra orbital push to "shake it off"
                    const dangerZone = 150;
                    if (dist < dangerZone) {
                        const weight = (dangerZone - dist) / dangerZone;
                        avoidX += (dx / dist) * weight * 2;
                        avoidY += (dy / dist) * weight * 2;
                    }
                }
            } else {
                // Normal bullet avoidance
                const dangerZone = 180;
                if (dist < dangerZone) {
                    const weight = (dangerZone - dist) / dangerZone;
                    avoidX += (dx / dist) * weight * 3;
                    avoidY += (dy / dist) * weight * 3;
                }
            }
        });

        // 2. TARGETING & ORBITING: Find priority targets
        let target = null;
        let minDist = Infinity;

        enemies.forEach(e => {
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // We only care about vulnerable enemies for targeting
            if (currentTime < (e.shieldExpiry || 0)) return;

            // Target prioritization bias: Riflemen are very dangerous
            const bias = (e.type === 'rifleman') ? 0.6 : 1.0;
            
            if (dist * bias < minDist) {
                minDist = dist * bias;
                target = e;
            }
        });

        if (target) {
            // PREDICTIVE AIMING: Aim where it will be
            const bulletSpeed = this.game.bulletSpeed;
            const dxT = target.x - player.x;
            const dyT = target.y - player.y;
            const distT = Math.sqrt(dxT * dxT + dyT * dyT);
            const timeToImpact = distT / bulletSpeed;
            
            const aimX = target.x + (target.vx || 0) * timeToImpact;
            const aimY = target.y + (target.vy || 0) * timeToImpact;

            controls.mouseX = aimX;
            controls.mouseY = aimY;
            controls.isMouseDown = true;

            // Movement logic relative to target
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const ux = dx / dist;
            const uy = dy / dist;

            const perpX = -uy * this.strafeDirection;
            const perpY = ux * this.strafeDirection;

            // Dynamic distance based on enemy type
            let preferredDist = 550;
            let radialWeight = 1.0;

            if (target.type === 'flanker') {
                preferredDist = 380; // Get closer to hit mobile flankers
            } else if (target.type === 'rifleman') {
                // If it's a rifleman, try to orbit aggressively to get behind it
                radialWeight = 0.6; 
            }

            const distDiff = dist - preferredDist;
            const radialPull = (distDiff / 80) * radialWeight; 
            const orbitPush = 1.4; // Slightly increased for more speed

            controls.ax += (ux * radialPull) + (perpX * orbitPush);
            controls.ay += (uy * radialPull) + (perpY * orbitPush);
        }

        // 3. WALL AVOIDANCE: Strongly repel from walls
        const margin = 150;
        const wallForce = 2.5;

        if (player.x < margin) avoidX += wallForce * (1 - player.x / margin);
        if (player.x > cw - margin) avoidX -= wallForce * (1 - (cw - player.x) / margin);
        if (player.y < margin) avoidY += wallForce * (1 - player.y / margin);
        if (player.y > ch - margin) avoidY -= wallForce * (1 - (ch - player.y) / margin);

        // Apply avoidance
        controls.ax += avoidX;
        controls.ay += avoidY;

        // Normalize movement
        const mag = Math.sqrt(controls.ax * controls.ax + controls.ay * controls.ay);
        if (mag > 1) {
            controls.ax /= mag;
            controls.ay /= mag;
        }

        // Use electric beam if energy is high and multiple enemies are close or boss is present
        if (!player.isExhausted && player.energy > 70) {
            if (minDist < 200 || (this.game.boss && Math.hypot(this.game.boss.x - player.x, this.game.boss.y - player.y) < 400)) {
                controls.tryElectricBeam = true;
            }
        }

        return controls;
    }
}
