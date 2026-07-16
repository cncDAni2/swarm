/**
 * Shared tank-style (forward-only thrust) physics.
 *
 * Movement (accel / friction / brake / maxSpeed) uses the same frame scale as
 * the player: multiply by (deltaTime / 16).
 *
 * Turn rates are DEGREES PER SECOND (real time):
 *   turnDegPerSecMax = when stopped (can pivot faster)
 *   turnDegPerSecMin = at full forwardSpeed (wide arcs)
 *
 * Body fields used:
 *   x, y, facing, forwardSpeed, vx, vy
 *   maxSpeed, accel, friction, brake
 *   turnDegPerSecMax, turnDegPerSecMin
 *   moveIntentX, moveIntentY  (desired travel dir; magnitude 0..1 = throttle)
 * Optional:
 *   lookTargetX, lookTargetY  (in-place aim when throttle is 0)
 *   dodgeSpeedMul             (>1 temporarily raises the speed cap)
 *   noSlowdown                (missiles: accel to max only; never brake/friction)
 */

// Only slow down to turn when the heading error exceeds this (30°).
export const TURN_BRAKE_THRESHOLD = Math.PI / 6;
export const DEG2RAD = Math.PI / 180;

export function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

/** Keep vx/vy = facing * forwardSpeed (forward-only). */
export function syncVelocityFromFacing(body) {
    body.vx = Math.cos(body.facing) * body.forwardSpeed;
    body.vy = Math.sin(body.facing) * body.forwardSpeed;
}

/**
 * After external code mutates vx/vy (bounds, boss push), rebuild scalar
 * speed from the component along facing (never reverse).
 */
export function syncForwardSpeedFromVelocity(body) {
    const along = body.vx * Math.cos(body.facing) + body.vy * Math.sin(body.facing);
    body.forwardSpeed = Math.max(0, along);
    syncVelocityFromFacing(body);
}

/**
 * Integrate one frame of tank physics on `body`. Moves body.x / body.y.
 * @param {object} body
 * @param {number} deltaTime  ms since last frame
 */
export function applyTankPhysics(body, deltaTime) {
    const dtMs = Math.max(0, Math.min(64, deltaTime)); // match game loop clamp
    const scale = dtMs / 16;
    const dtSec = dtMs / 1000;

    const intentX = body.moveIntentX || 0;
    const intentY = body.moveIntentY || 0;
    const intentLen = Math.sqrt(intentX * intentX + intentY * intentY);

    // --- Desired heading ---
    // Driving: turn toward travel intent. Idle: optional look target.
    let desiredHeading = null;
    let wantThrottle = 0;

    if (intentLen > 0.01) {
        desiredHeading = Math.atan2(intentY, intentX);
        wantThrottle = Math.min(1, intentLen);
    } else if (body.lookTargetX != null && body.lookTargetY != null) {
        desiredHeading = Math.atan2(
            body.lookTargetY - body.y,
            body.lookTargetX - body.x
        );
        wantThrottle = 0;
    }

    // Heading error (shortest path)
    let headingError = 0;
    if (desiredHeading != null) {
        headingError = wrapAngle(desiredHeading - body.facing);
    }
    const absError = Math.abs(headingError);

    // --- Speed-dependent turn rate (deg/s → rad this frame) ---
    const maxSpeed = body.maxSpeed || 0;
    const speedRatio = maxSpeed > 0
        ? Math.min(1, Math.max(0, body.forwardSpeed / maxSpeed))
        : 0;
    const turnDegPerSec =
        (body.turnDegPerSecMax || 0) * (1 - speedRatio) +
        (body.turnDegPerSecMin || 0) * speedRatio;
    // Cap step so a lag spike can never snap more than ~this much.
    const maxTurnRad = Math.max(0, turnDegPerSec) * DEG2RAD * dtSec;

    // --- Intelligent brake: only if we must turn more than 30° ---
    // Missiles (noSlowdown) always full-throttle; they bank without losing speed.
    let throttle = wantThrottle;
    let hardBrake = false;
    if (!body.noSlowdown && desiredHeading != null && absError > TURN_BRAKE_THRESHOLD) {
        hardBrake = true;
        // Blend throttle down as error grows past 30° (zero near 90°+)
        const t = Math.min(
            1,
            (absError - TURN_BRAKE_THRESHOLD) / (Math.PI / 2 - TURN_BRAKE_THRESHOLD)
        );
        throttle = wantThrottle * (1 - t);
    } else if (body.noSlowdown && wantThrottle > 0.01) {
        throttle = 1; // always full thrust while seeking
    }

    // Apply turn — never snap to desiredHeading; always rate-limit.
    if (
        desiredHeading != null &&
        headingError !== 0 &&
        maxTurnRad > 0 &&
        Number.isFinite(maxTurnRad)
    ) {
        const step = Math.min(absError, maxTurnRad);
        body.facing = wrapAngle(body.facing + Math.sign(headingError) * step);
    }

    // --- Forward-only speed integration ---
    const brake = body.brake || 0;
    const accel = body.accel || 0;
    const friction = body.friction || 0;

    // dodgeSpeedMul (e.g. 2 during Flanker/SkyPulse dodge dash) raises the cap temporarily
    const dodgeMul = body.dodgeSpeedMul > 1 ? body.dodgeSpeedMul : 1;
    const speedCap = maxSpeed * dodgeMul;

    if (body.noSlowdown) {
        // Rockets: accelerate up to max and never decelerate (no brake / friction).
        // If already faster than the current cap (e.g. after a rush phase), keep it.
        if (throttle > 0.01 && body.forwardSpeed < speedCap) {
            body.forwardSpeed += accel * scale;
            if (body.forwardSpeed > speedCap) body.forwardSpeed = speedCap;
        }
    } else {
        if (hardBrake) {
            // Extra deceleration so we can regain turn rate
            body.forwardSpeed -= brake * scale;
            if (body.forwardSpeed < 0) body.forwardSpeed = 0;
        }

        if (throttle > 0.01) {
            body.forwardSpeed += accel * throttle * scale;
        } else if (!hardBrake) {
            // Normal coast / friction when not pushing
            const frictionFactor = 1 - friction * scale;
            body.forwardSpeed *= Math.max(0, frictionFactor);
            if (body.forwardSpeed < 0.02) body.forwardSpeed = 0;
        } else {
            // Already braked above; light extra drag
            const frictionFactor = 1 - friction * 0.5 * scale;
            body.forwardSpeed *= Math.max(0, frictionFactor);
        }

        if (body.forwardSpeed > speedCap) {
            body.forwardSpeed = speedCap;
        }
    }
    if (body.forwardSpeed < 0) body.forwardSpeed = 0;

    // Velocity is strictly along facing — no strafe component
    syncVelocityFromFacing(body);

    body.x += body.vx * scale;
    body.y += body.vy * scale;
}
