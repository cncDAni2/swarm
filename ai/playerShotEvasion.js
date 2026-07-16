/**
 * Shared player-shot lane evasion for agile flyers (SkyPulse, Flanker).
 *
 * On each player shot, Game publishes a full map-length virtual fire-line that
 * lasts SHOT_LANE_DURATION_MS. These AIs steer off that corridor every frame
 * (no snapshot/poll nerf) and may trigger a fast sideways dodge on cooldown.
 */

export const SHOT_LANE_DURATION_MS = 400;
export const DODGE_COOLDOWN_MS = 1500;
/** How long the dodge dash runs (ms). */
export const DODGE_DURATION_MS = 180;
/** Multiplier on owner.maxSpeed while dodging. */
export const DODGE_SPEED_MUL = 2;
export const SHOT_LANE_WIDTH = 40;
export const SHOT_LANE_STEER_FORCE = 3.5;

/** Distance along (ux, uy) from (x, y) to the canvas edge. */
export function rayToMapEdge(x, y, ux, uy, canvasWidth, canvasHeight) {
    let t = Infinity;
    if (ux > 1e-8) t = Math.min(t, (canvasWidth - x) / ux);
    else if (ux < -1e-8) t = Math.min(t, (0 - x) / ux);
    if (uy > 1e-8) t = Math.min(t, (canvasHeight - y) / uy);
    else if (uy < -1e-8) t = Math.min(t, (0 - y) / uy);
    if (!Number.isFinite(t) || t < 0) {
        // Fallback: long corridor so avoidance still works off-map / zero dir
        return Math.hypot(canvasWidth, canvasHeight) || 2000;
    }
    return t;
}

/**
 * Build a full-map virtual shot line at the moment the player fires.
 * Stored on Game.playerShotLanes and exposed via player.shotLanes.
 */
export function createPlayerShotLane(x, y, angle, canvasWidth, canvasHeight, currentTime) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const range = rayToMapEdge(x, y, ux, uy, canvasWidth, canvasHeight);
    return {
        type: 'player-shot-line',
        x,
        y,
        ux,
        uy,
        // vx/vy keep drawEvasionDebug + generic wall math working
        vx: ux,
        vy: uy,
        range,
        width: SHOT_LANE_WIDTH,
        expiresAt: currentTime + SHOT_LANE_DURATION_MS
    };
}

/**
 * Steer away from active player shot lanes and optionally start a dodge dash.
 *
 * @param {object} ai - AI instance (mutates lastDodgeTime / dodge state)
 * @param {object} owner - Enemy
 * @param {Array|undefined} shotLanes - player.shotLanes
 * @param {number} currentTime
 * @param {number} moveX
 * @param {number} moveY
 * @returns {{ moveX: number, moveY: number, walls: Array }}
 */
export function applyPlayerShotLaneEvasion(ai, owner, shotLanes, currentTime, moveX, moveY) {
    const lanes = shotLanes || [];
    const walls = [];

    for (const lane of lanes) {
        if (currentTime >= lane.expiresAt) continue;
        walls.push(lane);

        const vbx = owner.x - lane.x;
        const vby = owner.y - lane.y;
        const bux = lane.ux;
        const buy = lane.uy;
        const proj = vbx * bux + vby * buy;
        const range = lane.range ?? 2000;
        const width = lane.width ?? SHOT_LANE_WIDTH;

        if (proj <= 0 || proj >= range) continue;

        const closestX = lane.x + bux * proj;
        const closestY = lane.y + buy * proj;
        const offX = owner.x - closestX;
        const offY = owner.y - closestY;
        const distToLineSq = offX * offX + offY * offY;

        if (distToLineSq >= width * width) continue;

        const perpx = -buy;
        const perpy = bux;
        const side = offX * perpx + offY * perpy;
        const steerDir = side >= 0 ? 1 : -1;

        // Continuous soft steer off the fire-line
        moveX += perpx * steerDir * SHOT_LANE_STEER_FORCE;
        moveY += perpy * steerDir * SHOT_LANE_STEER_FORCE;

        // Fast sideways dodge when still inside the corridor (cooldown gated)
        tryStartDodge(ai, perpx, perpy, steerDir, currentTime);
    }

    return { moveX, moveY, walls };
}

/**
 * Begin a short dash at maxSpeed * DODGE_SPEED_MUL in the sideways direction.
 * Does not teleport — movement is applied over DODGE_DURATION_MS via tickDodge + physics.
 * @returns {boolean} true if dodge started
 */
export function tryStartDodge(ai, perpx, perpy, steerDir, currentTime) {
    const cooldown = ai.dodgeCooldown ?? DODGE_COOLDOWN_MS;
    const last = ai.lastDodgeTime ?? -Infinity;
    if (currentTime - last < cooldown) return false;
    // Already mid-dash
    if (currentTime < (ai.dodgeUntil ?? 0)) return false;

    const duration = ai.dodgeDuration ?? DODGE_DURATION_MS;
    ai.lastDodgeTime = currentTime;
    ai.dodgeUntil = currentTime + duration;
    ai.dodgeNx = perpx * steerDir;
    ai.dodgeNy = perpy * steerDir;
    return true;
}

/**
 * While a dodge is active: face the dodge heading, drive at 2× maxSpeed, override intent.
 * Call once near the end of AI update (after composing normal move), before setMoveIntent.
 *
 * @returns {{ active: boolean, x: number, y: number }} unit dodge direction if active
 */
export function tickDodge(ai, owner, currentTime) {
    if (currentTime < (ai.dodgeUntil ?? 0)) {
        const nx = ai.dodgeNx || 0;
        const ny = ai.dodgeNy || 0;
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        const ux = nx / len;
        const uy = ny / len;

        const mul = ai.dodgeSpeedMul ?? DODGE_SPEED_MUL;
        owner.facing = Math.atan2(uy, ux);
        owner.forwardSpeed = owner.maxSpeed * mul;
        owner.syncVelocityFromFacing();
        owner.dodgeSpeedMul = mul;

        return { active: true, x: ux, y: uy };
    }

    owner.dodgeSpeedMul = 1;
    return { active: false, x: 0, y: 0 };
}
