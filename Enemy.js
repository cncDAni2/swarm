import { BasicMeleeAI } from './ai/BasicMeleeAI.js';
import { BasicRiflemanAI } from './ai/BasicRiflemanAI.js';
import { FlankerAI } from './ai/FlankerAI.js';
import { SkyPulseAI } from './ai/SkyPulseAI.js';
import { ReviAI } from './ai/ReviAI.js';

// Tank-style physics: thrust only along facing.
//
// Movement (accel/friction/brake/maxSpeed) uses the same frame scale as the
// player: multiply by (deltaTime / 16).
//
// Turn rates are DEGREES PER SECOND (real time) so they are easy to tune:
//   turnDegPerSecMax = when stopped (can pivot faster)
//   turnDegPerSecMin = at full forwardSpeed (wide arcs)
// Example: 90 ≈ quarter-turn per second while stationary.
const PHYSICS_BY_TYPE = {
    melee:       { maxSpeed: 2, accel: 0.32, friction: 0.12, brake: 0.22, turnDegPerSecMax: 360, turnDegPerSecMin: 70 },
    rifleman:    { maxSpeed: 1.7, accel: 0.26, friction: 0.12, brake: 0.22, turnDegPerSecMax: 360, turnDegPerSecMin: 70 },
    flanker:     { maxSpeed: 3, accel: 0.44, friction: 0.10, brake: 0.24, turnDegPerSecMax: 360, turnDegPerSecMin: 120 },
    'sky-pulse': { maxSpeed: 2.4, accel: 0.48, friction: 0.10, brake: 0.24, turnDegPerSecMax: 360, turnDegPerSecMin: 80 },
    revi:        { maxSpeed: 2.5, accel: 0.40, friction: 0.12, brake: 0.22, turnDegPerSecMax: 360, turnDegPerSecMin: 120 }
};

// Only slow down to turn when the heading error exceeds this (30°).
const TURN_BRAKE_THRESHOLD = Math.PI / 6;
const DEG2RAD = Math.PI / 180;

function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

export class Enemy {
    constructor(x, y, type, shieldExpiry = 0) {
        this.x = x;
        this.y = y;
        this.size = 50;
        this.type = type;
        this.stunRemaining = 0;
        this.shieldExpiry = shieldExpiry;

        // Forward-only speed (scalar). vx/vy are always facing * forwardSpeed.
        this.forwardSpeed = 0;
        this.vx = 0;
        this.vy = 0;
        // Desired travel direction (world). Magnitude 0..1 = throttle.
        this.moveIntentX = 0;
        this.moveIntentY = 0;
        // Optional in-place look target when not driving (aim / lock-on).
        this.lookTargetX = null;
        this.lookTargetY = null;
        this.facing = 0;

        const phys = PHYSICS_BY_TYPE[type] || PHYSICS_BY_TYPE.melee;
        this.maxSpeed = phys.maxSpeed;
        this.accel = phys.accel;
        this.friction = phys.friction;
        this.brake = phys.brake;
        // Degrees per second (see PHYSICS_BY_TYPE). Prefer these names when tuning.
        this.turnDegPerSecMax = phys.turnDegPerSecMax;
        this.turnDegPerSecMin = phys.turnDegPerSecMin;
        
        if (type === 'melee') {
            this.color = 'red';
            this.health = 5;
            this.ai = new BasicMeleeAI(this);
        } else if (type === 'rifleman') {
            this.color = '#8B0000';
            this.health = 1;
            this.ai = new BasicRiflemanAI(this);
        } else if (type === 'flanker') {
            this.color = 'cyan';
            this.size = 35;
            this.health = 3;
            this.ai = new FlankerAI(this);
        } else if (type === 'sky-pulse') {
            this.color = 'blue';
            this.size = 50;
            this.health = 3;
            this.ai = new SkyPulseAI(this);
        } else if (type === 'revi') {
            this.color = 'purple';
            this.size = 60;
            this.health = 20;
            this.damage = 20;
            this.ai = new ReviAI(this);
        }
    }

    /**
     * Desired travel direction this frame. Unit vector = full throttle that way.
     * Magnitude 0 = no drive (coast / brake). AI never strafes: physics only
     * thrusts along facing and turns toward this heading.
     */
    setMoveIntent(x, y) {
        const len = Math.sqrt(x * x + y * y);
        if (len > 1) {
            this.moveIntentX = x / len;
            this.moveIntentY = y / len;
        } else {
            this.moveIntentX = x;
            this.moveIntentY = y;
        }
    }

    /** In-place aim / look when not driving (or when throttle is 0). */
    setLookTarget(x, y) {
        this.lookTargetX = x;
        this.lookTargetY = y;
    }

    clearLookTarget() {
        this.lookTargetX = null;
        this.lookTargetY = null;
    }

    /** Keep vx/vy = forward vector * scalar speed (forward-only). */
    syncVelocityFromFacing() {
        this.vx = Math.cos(this.facing) * this.forwardSpeed;
        this.vy = Math.sin(this.facing) * this.forwardSpeed;
    }

    /**
     * After external code mutates vx/vy (bounds, boss push), rebuild scalar
     * speed from the component along facing (never reverse).
     */
    syncForwardSpeedFromVelocity() {
        const along = this.vx * Math.cos(this.facing) + this.vy * Math.sin(this.facing);
        this.forwardSpeed = Math.max(0, along);
        this.syncVelocityFromFacing();
    }

    applyPhysics(deltaTime) {
        // Movement uses player-style frame units; turning uses real seconds.
        const dtMs = Math.max(0, Math.min(64, deltaTime)); // match game loop clamp
        const scale = dtMs / 16;
        const dtSec = dtMs / 1000;

        const intentLen = Math.sqrt(
            this.moveIntentX * this.moveIntentX + this.moveIntentY * this.moveIntentY
        );

        // --- Desired heading ---
        // Driving: turn toward travel intent. Idle: optional look target.
        let desiredHeading = null;
        let wantThrottle = 0;

        if (intentLen > 0.01) {
            desiredHeading = Math.atan2(this.moveIntentY, this.moveIntentX);
            wantThrottle = Math.min(1, intentLen);
        } else if (this.lookTargetX != null && this.lookTargetY != null) {
            desiredHeading = Math.atan2(
                this.lookTargetY - this.y,
                this.lookTargetX - this.x
            );
            wantThrottle = 0;
        }

        // Heading error (shortest path)
        let headingError = 0;
        if (desiredHeading != null) {
            headingError = wrapAngle(desiredHeading - this.facing);
        }
        const absError = Math.abs(headingError);

        // --- Speed-dependent turn rate (deg/s → rad this frame) ---
        // Max when stopped, min at full speed — linear blend.
        const speedRatio = this.maxSpeed > 0
            ? Math.min(1, Math.max(0, this.forwardSpeed / this.maxSpeed))
            : 0;
        const turnDegPerSec =
            this.turnDegPerSecMax * (1 - speedRatio) +
            this.turnDegPerSecMin * speedRatio;
        // Cap step so a lag spike can never snap more than ~this much.
        const maxTurnRad = Math.max(0, turnDegPerSec) * DEG2RAD * dtSec;

        // --- Intelligent brake: only if we must turn more than 30° ---
        let throttle = wantThrottle;
        let hardBrake = false;
        if (desiredHeading != null && absError > TURN_BRAKE_THRESHOLD) {
            hardBrake = true;
            // Blend throttle down as error grows past 30° (zero near 90°+)
            const t = Math.min(
                1,
                (absError - TURN_BRAKE_THRESHOLD) / (Math.PI / 2 - TURN_BRAKE_THRESHOLD)
            );
            throttle = wantThrottle * (1 - t);
        }

        // Apply turn — never snap to desiredHeading; always rate-limit.
        if (
            desiredHeading != null &&
            headingError !== 0 &&
            maxTurnRad > 0 &&
            Number.isFinite(maxTurnRad)
        ) {
            const step = Math.min(absError, maxTurnRad);
            this.facing = wrapAngle(this.facing + Math.sign(headingError) * step);
        }

        // --- Forward-only speed integration ---
        if (hardBrake) {
            // Extra deceleration so we can regain turn rate
            this.forwardSpeed -= this.brake * scale;
            if (this.forwardSpeed < 0) this.forwardSpeed = 0;
        }

        if (throttle > 0.01) {
            this.forwardSpeed += this.accel * throttle * scale;
        } else if (!hardBrake) {
            // Normal coast / friction when not pushing
            const frictionFactor = 1 - this.friction * scale;
            this.forwardSpeed *= Math.max(0, frictionFactor);
            if (this.forwardSpeed < 0.02) this.forwardSpeed = 0;
        } else {
            // Already braked above; light extra drag
            const frictionFactor = 1 - this.friction * 0.5 * scale;
            this.forwardSpeed *= Math.max(0, frictionFactor);
        }

        // dodgeSpeedMul (e.g. 2 during Flanker/SkyPulse dodge dash) raises the cap temporarily
        const speedCap = this.maxSpeed * (this.dodgeSpeedMul > 1 ? this.dodgeSpeedMul : 1);
        if (this.forwardSpeed > speedCap) {
            this.forwardSpeed = speedCap;
        }
        if (this.forwardSpeed < 0) this.forwardSpeed = 0;

        // Velocity is strictly along facing — no strafe component
        this.syncVelocityFromFacing();

        this.x += this.vx * scale;
        this.y += this.vy * scale;
    }

    update(player, enemies, bullets, currentTime, deltaTime, spawnBullet, canvasWidth, canvasHeight, barriers, lineRectIntersect) {
        // Reset per-frame intent; AI re-sets it during update.
        this.moveIntentX = 0;
        this.moveIntentY = 0;
        this.clearLookTarget();

        if (this.stunRemaining > 0) {
            this.stunRemaining -= deltaTime;
            // Stunned: no AI accel, only friction + coast to a stop
            this.applyPhysics(deltaTime);
            this.applyPostPhysicsBounds();
            return;
        }

        // Check if this enemy has a partner (Melee -> Rifleman)
        this.hasActivePartner = (this.ai && this.ai.partner && enemies.includes(this.ai.partner));

        if (this.type === 'rifleman') {
            this.ai.update(player, enemies, bullets, currentTime, spawnBullet);
        } else if (this.type === 'sky-pulse') {
            this.ai.update(player, enemies, bullets, currentTime, spawnBullet);
        } else if (this.type === 'flanker') {
            this.ai.update(player, enemies, bullets, currentTime, spawnBullet, canvasWidth, canvasHeight);
        } else if (this.type === 'melee') {
            this.ai.update(player, enemies, bullets, currentTime);
        } else if (this.type === 'revi') {
            this.ai.update(player, enemies, bullets, currentTime, spawnBullet, canvasWidth, canvasHeight, barriers, lineRectIntersect);
        } else {
            this.ai.update(player, enemies);
        }

        this.applyPhysics(deltaTime);
        this.applyPostPhysicsBounds();
    }

    applyPostPhysicsBounds() {
        if (this.ai && typeof this.ai.applyBoundsAfterPhysics === 'function') {
            this.ai.applyBoundsAfterPhysics();
            // Bounds may zero vx/vy; rebuild forward-only speed from remaining motion.
            this.syncForwardSpeedFromVelocity();
        }
    }

    drawFacingIndicator(ctx) {
        const r = this.size * 0.52;
        const tip = r + 11;
        const base = r + 1;
        const halfW = 5.5;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.facing);
        ctx.beginPath();
        ctx.moveTo(tip, 0);
        ctx.lineTo(base, halfW);
        ctx.lineTo(base, -halfW);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1.25;
        ctx.globalAlpha = 1;
        ctx.stroke();
        ctx.restore();
    }

    draw(ctx, assets, currentTime) {
        ctx.save();
        
        // Background red pulse for Rifleman
        if (this.type === 'rifleman') {
            const auraRadius = this.size;
            const pulse = 0.8 + Math.sin(currentTime / 100) * 0.2;
            const currentRadius = auraRadius * pulse;
            
            const grad = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, currentRadius
            );
            grad.addColorStop(0, 'rgba(255, 0, 0, 0.6)');
            grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // Get sprite for enemy type
        let sprite = null;
        if (assets) {
            if (this.type === 'melee') sprite = assets.melee;
            else if (this.type === 'rifleman') sprite = assets.rifleman;
            else if (this.type === 'flanker') sprite = assets.flanker;
            else if (this.type === 'sky-pulse') sprite = assets.skyPulse;
            else if (this.type === 'revi') {
                if (this.ai && (this.ai.phase === 'TARGETING' || this.ai.phase === 'ATTACK')) {
                    sprite = assets.reviAttack;
                } else {
                    const frame = Math.floor(currentTime / 500) % 2;
                    sprite = frame === 0 ? assets.revi1 : assets.revi2;
                }
            }
        }

        // Draw the enemy sprite first
        if (sprite && sprite.complete) {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            if (this.stunRemaining > 0) {
                ctx.filter = 'brightness(1.5) sepia(1) hue-rotate(-50deg) saturate(5)';
            }

            ctx.drawImage(sprite, -this.size / 2, -this.size / 2, this.size, this.size);
            ctx.restore();
        } else {
            // Fallback shapes...
            if (this.type === 'sky-pulse') {
                const pulse = 0.8 + Math.sin(currentTime / 200) * 0.2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, (this.size / 2) * pulse, 0, Math.PI * 2);
                ctx.fillStyle = 'blue';
                ctx.fill();
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (this.type === 'revi') {
                ctx.fillStyle = this.ai && this.ai.phase === 'ATTACK' ? 'white' : 'purple';
                ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
            } else {
                ctx.fillStyle = this.stunRemaining > 0 ? '#ff8888' : this.color;
                if (this.type === 'rifleman') {
                    ctx.beginPath();
                    const halfSize = this.size / 2;
                    ctx.moveTo(this.x, this.y - halfSize);
                    ctx.lineTo(this.x - halfSize, this.y + halfSize);
                    ctx.lineTo(this.x + halfSize, this.y + halfSize);
                    ctx.closePath();
                    ctx.fill();
                } else if (this.type === 'flanker') {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
                }
            }
        }

        // Facing indicator (triangle outside the unit)
        this.drawFacingIndicator(ctx);

        // Draw spawn shield (yellow circle) ABOVE the enemy
        if (currentTime < this.shieldExpiry) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 3;
            // Pulse opacity
            const alpha = 0.4 + Math.sin(currentTime / 100) * 0.2;
            ctx.globalAlpha = alpha;
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }
}
