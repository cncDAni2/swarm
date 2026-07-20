import { BotController } from './BotController.js';

const NOMINAL_FRAME_MILLISECONDS = 16;
const PROJECTILE_SPEED = 21 / NOMINAL_FRAME_MILLISECONDS;
const MAX_PLAYER_SPEED = 12 / NOMINAL_FRAME_MILLISECONDS;
const MAX_ACCELERATION = 1.5 / (NOMINAL_FRAME_MILLISECONDS ** 2);
const PLAYER_RADIUS = 25;

export class TerraMaxBot extends BotController {
    static id = 'terra-max';
    static displayName = 'Terra Max';

    start(context) {
        this.context = context;
        this.initialized = false;
        this.randomState = 1;
        this.orbitDirection = 1;
        this.weavePhase = 0;
        this.rangeBias = 0;
        this.nextManeuverAt = 0;
        this.lastOpponentSample = null;
        this.lastSelfSample = null;
        this.opponentVelocity = { x: 0, y: 0 };
        this.opponentAcceleration = { x: 0, y: 0 };
        this.selfVelocity = { x: 0, y: 0 };
        this.selfAcceleration = { x: 0, y: 0 };
        this.recoveringEnergy = false;
    }

    update(_deltaTime) {
        const state = this.context.getState();
        if (state.matchEnded || state.self.health <= 0 || state.opponent.health <= 0) return;

        this.initialize(state);
        this.updateMotionEstimates(state);
        this.updateManeuver(state);

        const movement = this.chooseMovement(state);
        this.context.move(movement.x, movement.y);

        if (this.shouldFire(state)) {
            const target = this.predictTarget(state);
            this.context.fireAt(target.x, target.y);
        }
    }

    stop() {
        this.context = null;
        this.lastOpponentSample = null;
        this.lastSelfSample = null;
        this.opponentVelocity = { x: 0, y: 0 };
        this.opponentAcceleration = { x: 0, y: 0 };
        this.selfVelocity = { x: 0, y: 0 };
        this.selfAcceleration = { x: 0, y: 0 };
        this.recoveringEnergy = false;
    }

    shouldFire(state) {
        const potentialDamage = state.self.energy > 80 ? 8 : 5;
        if (state.self.energy >= 1 && state.opponent.health <= potentialDamage) {
            this.recoveringEnergy = false;
            return true;
        }

        if (this.recoveringEnergy) {
            if (state.self.energy < state.self.maxEnergy) return false;
            this.recoveringEnergy = false;
        }

        if (state.self.energy < 1) {
            this.recoveringEnergy = true;
            return false;
        }

        return true;
    }

    initialize(state) {
        if (this.initialized) return;

        const seed = (
            Math.imul(Math.floor(state.self.x), 73856093)
            ^ Math.imul(Math.floor(state.self.y), 19349663)
            ^ Math.imul(Math.floor(state.arena.width), 83492791)
            ^ Math.imul(Math.floor(state.arena.height), 2654435761)
        ) >>> 0;
        this.randomState = seed || 0x6d2b79f5;
        this.orbitDirection = this.nextRandom() < 0.5 ? -1 : 1;
        this.weavePhase = this.nextRandom() * Math.PI * 2;
        this.rangeBias = this.nextRandom() * 0.16 - 0.08;
        this.nextManeuverAt = state.time + 260 + this.nextRandom() * 260;
        this.initialized = true;
    }

    nextRandom() {
        this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
        return this.randomState / 4294967296;
    }

    updateMotionEstimates(state) {
        this.updateMotionEstimate(
            state.opponent,
            state.time,
            this.lastOpponentSample,
            this.opponentVelocity,
            this.opponentAcceleration
        );
        this.updateMotionEstimate(
            state.self,
            state.time,
            this.lastSelfSample,
            this.selfVelocity,
            this.selfAcceleration
        );
        this.lastOpponentSample = this.createSample(state.opponent, state.time);
        this.lastSelfSample = this.createSample(state.self, state.time);
    }

    updateMotionEstimate(position, time, previousSample, velocity, acceleration) {
        if (!previousSample || time <= previousSample.time) return;

        const elapsed = Math.max(1, time - previousSample.time);
        let measuredVelocityX = (position.x - previousSample.x) / elapsed;
        let measuredVelocityY = (position.y - previousSample.y) / elapsed;
        const measuredSpeed = Math.hypot(measuredVelocityX, measuredVelocityY);
        if (measuredSpeed > MAX_PLAYER_SPEED) {
            const speedScale = MAX_PLAYER_SPEED / measuredSpeed;
            measuredVelocityX *= speedScale;
            measuredVelocityY *= speedScale;
        }

        const velocitySmoothing = 1 - Math.exp(-elapsed / 72);
        const previousVelocityX = velocity.x;
        const previousVelocityY = velocity.y;
        velocity.x += (measuredVelocityX - velocity.x) * velocitySmoothing;
        velocity.y += (measuredVelocityY - velocity.y) * velocitySmoothing;

        const measuredAccelerationX = (velocity.x - previousVelocityX) / elapsed;
        const measuredAccelerationY = (velocity.y - previousVelocityY) / elapsed;
        const accelerationSmoothing = 1 - Math.exp(-elapsed / 120);
        acceleration.x += (measuredAccelerationX - acceleration.x) * accelerationSmoothing;
        acceleration.y += (measuredAccelerationY - acceleration.y) * accelerationSmoothing;
        this.limitVector(acceleration, MAX_ACCELERATION);
    }

    createSample(position, time) {
        return { x: position.x, y: position.y, time };
    }

    updateManeuver(state) {
        if (state.time < this.nextManeuverAt) return;

        const separationX = state.self.x - state.opponent.x;
        const separationY = state.self.y - state.opponent.y;
        const distance = Math.hypot(separationX, separationY);
        const travelTime = distance / PROJECTILE_SPEED;

        if (this.nextRandom() < 0.82) this.orbitDirection *= -1;
        this.weavePhase += (0.55 + this.nextRandom() * 1.1) * Math.PI;
        this.rangeBias = this.nextRandom() * 0.24 - 0.12;
        this.nextManeuverAt = state.time + this.clamp(150 + this.nextRandom() * 160 + travelTime * 0.22, 160, 420);
    }

    chooseMovement(state) {
        const self = state.self;
        const opponent = state.opponent;
        const arena = state.arena;
        let separationX = self.x - opponent.x;
        let separationY = self.y - opponent.y;
        let distance = Math.hypot(separationX, separationY);

        if (distance < 0.001) {
            separationX = self.x < arena.width / 2 ? -1 : 1;
            separationY = 0;
            distance = 1;
        }

        const awayX = separationX / distance;
        const awayY = separationY / distance;
        const tangentX = -awayY * this.orbitDirection;
        const tangentY = awayX * this.orbitDirection;
        const smallestDimension = Math.max(PLAYER_RADIUS * 2 + 1, Math.min(arena.width, arena.height));
        const minimumRange = Math.max(150, smallestDimension * 0.26);
        const maximumRange = Math.max(minimumRange + 1, Math.min(560, smallestDimension * 0.72));
        const healthDifference = this.clamp(
            opponent.health / opponent.maxHealth - self.health / self.maxHealth,
            -1,
            1
        );
        const finishingPressure = (1 - opponent.health / opponent.maxHealth) * 0.08;
        const baseRange = this.clamp(smallestDimension * 0.37, minimumRange, maximumRange);
        const preferredRange = this.clamp(
            baseRange * (1 + this.rangeBias + healthDifference * 0.18 - finishingPressure),
            minimumRange,
            maximumRange
        );

        let radialWeight = this.clamp((preferredRange - distance) / preferredRange * 1.45, -1.25, 1.55);
        if (distance < preferredRange * 0.68) radialWeight = 1.65;
        if (distance > preferredRange * 1.8) radialWeight = -1.45;

        const opponentApproachSpeed = this.opponentVelocity.x * awayX + this.opponentVelocity.y * awayY;
        radialWeight += this.clamp(opponentApproachSpeed / MAX_PLAYER_SPEED, 0, 1) * 0.36;

        const edgeMargin = this.getEdgeMargin(arena, smallestDimension);
        const boundaryLookAhead = this.clamp(distance / PROJECTILE_SPEED * 0.8 + 180, 220, 480);
        const projectedSelfX = self.x + this.selfVelocity.x * boundaryLookAhead;
        const projectedSelfY = self.y + this.selfVelocity.y * boundaryLookAhead;
        const edgeForceX = this.getEdgeForce(self.x, projectedSelfX, arena.width, edgeMargin);
        const edgeForceY = this.getEdgeForce(self.y, projectedSelfY, arena.height, edgeMargin);
        const tangentWeight = 0.98 + Math.sin(state.time / 175 + this.weavePhase) * 0.26;

        return {
            x: tangentX * tangentWeight + awayX * radialWeight + edgeForceX * 2.85,
            y: tangentY * tangentWeight + awayY * radialWeight + edgeForceY * 2.85
        };
    }

    getEdgeMargin(arena, smallestDimension) {
        return Math.max(
            1,
            Math.min(
                150,
                smallestDimension * 0.18,
                Math.max(1, arena.width / 2 - PLAYER_RADIUS),
                Math.max(1, arena.height / 2 - PLAYER_RADIUS)
            )
        );
    }

    getEdgeForce(position, projectedPosition, extent, margin) {
        let force = 0;
        if (position < margin) force += (margin - position) / margin;
        if (position > extent - margin) force -= (position - (extent - margin)) / margin;
        if (projectedPosition < margin) force += (margin - projectedPosition) / margin * 1.35;
        if (projectedPosition > extent - margin) force -= (projectedPosition - (extent - margin)) / margin * 1.35;
        return this.clamp(force, -2, 2);
    }

    predictTarget(state) {
        const relativeX = state.opponent.x - state.self.x;
        const relativeY = state.opponent.y - state.self.y;
        const interceptTime = this.getInterceptTime(
            relativeX,
            relativeY,
            this.opponentVelocity.x,
            this.opponentVelocity.y
        );
        const travelTime = this.clamp(interceptTime, 0, 900);
        const accelerationWeight = this.clamp(travelTime / 650, 0.08, 0.24);
        const predictedX = state.opponent.x
            + this.opponentVelocity.x * travelTime
            + this.opponentAcceleration.x * travelTime * travelTime * 0.5 * accelerationWeight;
        const predictedY = state.opponent.y
            + this.opponentVelocity.y * travelTime
            + this.opponentAcceleration.y * travelTime * travelTime * 0.5 * accelerationWeight;

        return {
            x: this.clampArenaCoordinate(predictedX, state.arena.width),
            y: this.clampArenaCoordinate(predictedY, state.arena.height)
        };
    }

    getInterceptTime(relativeX, relativeY, velocityX, velocityY) {
        const quadraticA = velocityX * velocityX + velocityY * velocityY - PROJECTILE_SPEED * PROJECTILE_SPEED;
        const quadraticB = 2 * (relativeX * velocityX + relativeY * velocityY);
        const quadraticC = relativeX * relativeX + relativeY * relativeY;

        if (Math.abs(quadraticA) < 0.000001) {
            if (Math.abs(quadraticB) < 0.000001) return Math.sqrt(quadraticC) / PROJECTILE_SPEED;
            const linearTime = -quadraticC / quadraticB;
            return linearTime > 0 ? linearTime : Math.sqrt(quadraticC) / PROJECTILE_SPEED;
        }

        const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
        if (discriminant < 0) return Math.sqrt(quadraticC) / PROJECTILE_SPEED;

        const root = Math.sqrt(discriminant);
        const firstTime = (-quadraticB - root) / (2 * quadraticA);
        const secondTime = (-quadraticB + root) / (2 * quadraticA);
        const validTimes = [firstTime, secondTime].filter(time => time > 0 && Number.isFinite(time));
        return validTimes.length > 0 ? Math.min(...validTimes) : Math.sqrt(quadraticC) / PROJECTILE_SPEED;
    }

    clampArenaCoordinate(value, extent) {
        const minimum = Math.min(PLAYER_RADIUS, extent / 2);
        const maximum = Math.max(minimum, extent - PLAYER_RADIUS);
        return this.clamp(value, minimum, maximum);
    }

    limitVector(vector, maximumMagnitude) {
        const magnitude = Math.hypot(vector.x, vector.y);
        if (magnitude <= maximumMagnitude || magnitude === 0) return;
        const scale = maximumMagnitude / magnitude;
        vector.x *= scale;
        vector.y *= scale;
    }

    clamp(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }
}