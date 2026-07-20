import { BotController } from './BotController.js';

const FRAME_MS = 16;
const PROJECTILE_SPEED = 21 / FRAME_MS;
const MAX_SPEED = 12 / FRAME_MS;
const MAX_ACCELERATION = 1.5 / (FRAME_MS * FRAME_MS);
const PLAYER_RADIUS = 25;
const VELOCITY_TAU_MS = 15;
const ACCELERATION_TAU_MS = 30;

export class Sonnet5MaxBot extends BotController {
    static id = 'sonnet5-max';
    static displayName = 'Sonnet5 Max';

    start(context) {
        this.context = context;
        this.initialized = false;
        this.randomState = 1;
        this.orbitDirection = 1;
        this.rangeBias = 0;
        this.weaveFrequency = 0.01;
        this.weaveAmplitude = 0.45;
        this.weavePhase = 0;
        this.nextOrbitCheckAt = 0;
        this.nextWeaveRerollAt = 0;
        this.nextFeintAt = 0;
        this.feintActive = false;
        this.feintEndsAt = 0;
        this.feintVectorX = 0;
        this.feintVectorY = 0;
        this.resting = false;
        this.lastOpponentSample = null;
        this.lastSelfSample = null;
        this.opponentVelocity = { x: 0, y: 0 };
        this.opponentAcceleration = { x: 0, y: 0 };
        this.selfVelocity = { x: 0, y: 0 };
    }

    update(_deltaTime) {
        const state = this.context.getState();
        if (state.matchEnded || state.self.health <= 0 || state.opponent.health <= 0) return;

        this.initialize(state);
        this.updateMotionEstimates(state);
        this.updateSchedule(state);

        const movement = this.chooseMovement(state);
        this.context.move(movement.x, movement.y);

        if (this.shouldFire(state)) {
            const aim = this.predictAimPoint(state);
            this.context.fireAt(aim.x, aim.y);
        }
    }

    stop() {
        this.context = null;
        this.lastOpponentSample = null;
        this.lastSelfSample = null;
        this.opponentVelocity = { x: 0, y: 0 };
        this.opponentAcceleration = { x: 0, y: 0 };
        this.selfVelocity = { x: 0, y: 0 };
    }

    initialize(state) {
        if (this.initialized) return;

        const seed = (
            Math.imul(Math.floor(state.self.x) + 1, 73856093)
            ^ Math.imul(Math.floor(state.self.y) + 1, 19349663)
            ^ Math.imul(Math.floor(state.arena.width) + 1, 83492791)
            ^ Math.imul(Math.floor(state.arena.height) + 1, 2654435761)
        ) >>> 0;
        this.randomState = seed || 0x9e3779b9;
        this.orbitDirection = this.nextRandom() < 0.5 ? -1 : 1;
        this.nextOrbitCheckAt = state.time + 150 + this.nextRandom() * 240;
        this.rerollWeave(state);
        this.nextFeintAt = state.time + 700 + this.nextRandom() * 900;
        this.initialized = true;
    }

    nextRandom() {
        this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
        return this.randomState / 4294967296;
    }

    rerollWeave(state) {
        this.weaveFrequency = 0.007 + this.nextRandom() * 0.011;
        this.weaveAmplitude = 0.6 + this.nextRandom() * 0.5;
        this.weavePhase = this.nextRandom() * Math.PI * 2;
        this.rangeBias = this.nextRandom() * 0.3 - 0.15;
        this.nextWeaveRerollAt = state.time + 900 + this.nextRandom() * 900;
    }

    updateSchedule(state) {
        if (state.time >= this.nextOrbitCheckAt) {
            if (this.nextRandom() < 0.8) this.orbitDirection *= -1;
            this.nextOrbitCheckAt = state.time + 150 + this.nextRandom() * 240;
        }

        if (state.time >= this.nextWeaveRerollAt) this.rerollWeave(state);

        if (this.feintActive && state.time >= this.feintEndsAt) this.feintActive = false;
        if (!this.feintActive && state.time >= this.nextFeintAt) this.triggerFeint(state);
    }

    triggerFeint(state) {
        const choice = this.nextRandom();
        if (choice < 0.4) {
            this.orbitDirection *= -1;
            this.feintVectorX = 0;
            this.feintVectorY = 0;
        } else {
            const dx = state.self.x - state.opponent.x;
            const dy = state.self.y - state.opponent.y;
            const distance = Math.hypot(dx, dy) || 1;
            const sign = choice < 0.7 ? -1 : 1;
            this.feintVectorX = (dx / distance) * sign;
            this.feintVectorY = (dy / distance) * sign;
        }
        this.feintActive = true;
        this.feintEndsAt = state.time + 140 + this.nextRandom() * 160;
        this.nextFeintAt = state.time + 1100 + this.nextRandom() * 1500;
    }

    updateMotionEstimates(state) {
        this.updateOpponentMotion(state);
        this.updateSelfMotion(state);
    }

    updateOpponentMotion(state) {
        const sample = this.lastOpponentSample;
        if (sample && state.time > sample.time) {
            const elapsed = Math.max(1, state.time - sample.time);
            let measuredVx = (state.opponent.x - sample.x) / elapsed;
            let measuredVy = (state.opponent.y - sample.y) / elapsed;
            const measuredSpeed = Math.hypot(measuredVx, measuredVy);
            if (measuredSpeed > MAX_SPEED) {
                const scale = MAX_SPEED / measuredSpeed;
                measuredVx *= scale;
                measuredVy *= scale;
            }

            const previousVx = this.opponentVelocity.x;
            const previousVy = this.opponentVelocity.y;
            const velocitySmoothing = 1 - Math.exp(-elapsed / VELOCITY_TAU_MS);
            this.opponentVelocity.x += (measuredVx - previousVx) * velocitySmoothing;
            this.opponentVelocity.y += (measuredVy - previousVy) * velocitySmoothing;

            const measuredAx = (this.opponentVelocity.x - previousVx) / elapsed;
            const measuredAy = (this.opponentVelocity.y - previousVy) / elapsed;
            const accelerationSmoothing = 1 - Math.exp(-elapsed / ACCELERATION_TAU_MS);
            this.opponentAcceleration.x += (measuredAx - this.opponentAcceleration.x) * accelerationSmoothing;
            this.opponentAcceleration.y += (measuredAy - this.opponentAcceleration.y) * accelerationSmoothing;
            this.limitVector(this.opponentAcceleration, MAX_ACCELERATION);
        }
        this.lastOpponentSample = { x: state.opponent.x, y: state.opponent.y, time: state.time };
    }

    updateSelfMotion(state) {
        const sample = this.lastSelfSample;
        if (sample && state.time > sample.time) {
            const elapsed = Math.max(1, state.time - sample.time);
            const measuredVx = (state.self.x - sample.x) / elapsed;
            const measuredVy = (state.self.y - sample.y) / elapsed;
            const smoothing = 1 - Math.exp(-elapsed / VELOCITY_TAU_MS);
            this.selfVelocity.x += (measuredVx - this.selfVelocity.x) * smoothing;
            this.selfVelocity.y += (measuredVy - this.selfVelocity.y) * smoothing;
        }
        this.lastSelfSample = { x: state.self.x, y: state.self.y, time: state.time };
    }

    chooseMovement(state) {
        const self = state.self;
        const opponent = state.opponent;
        const arena = state.arena;

        let awayFromOpponentX = self.x - opponent.x;
        let awayFromOpponentY = self.y - opponent.y;
        let distance = Math.hypot(awayFromOpponentX, awayFromOpponentY);
        if (distance < 0.001) {
            awayFromOpponentX = self.x < arena.width / 2 ? -1 : 1;
            awayFromOpponentY = 0;
            distance = 1;
        }
        const awayX = awayFromOpponentX / distance;
        const awayY = awayFromOpponentY / distance;
        const tangentX = -awayY * this.orbitDirection;
        const tangentY = awayX * this.orbitDirection;

        const preferredRange = this.computePreferredRange(state);
        const rangeError = (preferredRange - distance) / preferredRange;
        let radialWeight = this.clamp(rangeError * 1.5, -1.3, 1.7);
        if (distance < preferredRange * 0.62) radialWeight = 1.75;
        if (distance > preferredRange * 1.85) radialWeight = -1.6;

        const approachSpeed = this.opponentVelocity.x * awayX + this.opponentVelocity.y * awayY;
        radialWeight += this.clamp(approachSpeed / MAX_SPEED, -1, 1) * 0.4;

        const weaveTangent = 1 + Math.sin(state.time * this.weaveFrequency + this.weavePhase) * this.weaveAmplitude;
        const weaveRadial = Math.sin(state.time * this.weaveFrequency * 1.7 + this.weavePhase * 1.31)
            * this.weaveAmplitude * 0.55;

        let directionX = tangentX * weaveTangent + awayX * (radialWeight + weaveRadial);
        let directionY = tangentY * weaveTangent + awayY * (radialWeight + weaveRadial);

        if (this.feintActive) {
            directionX += this.feintVectorX * 1.8;
            directionY += this.feintVectorY * 1.8;
        }

        const margin = this.getEdgeMargin(arena);
        const lookahead = this.clamp(distance / PROJECTILE_SPEED * 0.6 + 140, 180, 420);
        const projectedX = self.x + this.selfVelocity.x * lookahead;
        const projectedY = self.y + this.selfVelocity.y * lookahead;
        directionX += this.getEdgeForce(self.x, projectedX, arena.width, margin) * 2.6;
        directionY += this.getEdgeForce(self.y, projectedY, arena.height, margin) * 2.6;

        const centerX = arena.width / 2;
        const centerY = arena.height / 2;
        directionX += this.clamp((centerX - self.x) / centerX, -1, 1) * 0.12;
        directionY += this.clamp((centerY - self.y) / centerY, -1, 1) * 0.12;

        return { x: directionX, y: directionY };
    }

    computePreferredRange(state) {
        const arena = state.arena;
        const self = state.self;
        const opponent = state.opponent;
        const smallestDimension = Math.max(PLAYER_RADIUS * 2 + 1, Math.min(arena.width, arena.height));
        const minimumRange = Math.max(150, smallestDimension * 0.24);
        const maximumRange = Math.max(minimumRange + 1, Math.min(620, smallestDimension * 0.8));
        const healthAdvantage = this.clamp(
            (self.health / self.maxHealth) - (opponent.health / opponent.maxHealth),
            -1,
            1
        );
        const finishingPressure = (1 - opponent.health / opponent.maxHealth) * 0.12;
        const desperation = self.health <= self.maxHealth * 0.3 ? 0.2 : 0;
        const baseRange = this.clamp(smallestDimension * 0.44, minimumRange, maximumRange);

        return this.clamp(
            baseRange * (1 + this.rangeBias + healthAdvantage * 0.22 - finishingPressure - desperation),
            minimumRange,
            maximumRange
        );
    }

    getEdgeMargin(arena) {
        const smallestDimension = Math.min(arena.width, arena.height);
        const rawMargin = this.clamp(smallestDimension * 0.18, 60, 150);
        return Math.min(
            rawMargin,
            Math.max(1, arena.width / 2 - PLAYER_RADIUS),
            Math.max(1, arena.height / 2 - PLAYER_RADIUS)
        );
    }

    getEdgeForce(position, projectedPosition, extent, margin) {
        let force = 0;
        if (position < margin) force += (margin - position) / margin;
        else if (position > extent - margin) force -= (position - (extent - margin)) / margin;
        if (projectedPosition < margin) force += (margin - projectedPosition) / margin * 1.3;
        else if (projectedPosition > extent - margin) force -= (projectedPosition - (extent - margin)) / margin * 1.3;
        return this.clamp(force, -2.2, 2.2);
    }

    shouldFire(state) {
        const self = state.self;
        const opponent = state.opponent;
        const nextShotDamage = self.energy > 80 ? 8 : 5;

        if (self.energy >= 1 && opponent.health <= nextShotDamage) {
            this.resting = false;
            return true;
        }

        const desperate = self.health <= self.maxHealth * 0.3;
        if (this.resting) {
            if (!desperate && self.energy < self.maxEnergy) return false;
            this.resting = false;
        }

        if (self.energy < 1) {
            this.resting = true;
            return false;
        }

        return true;
    }

    predictAimPoint(state) {
        const self = state.self;
        const opponent = state.opponent;
        const relativeX = opponent.x - self.x;
        const relativeY = opponent.y - self.y;
        const travelTime = this.clamp(
            this.getInterceptTime(relativeX, relativeY, this.opponentVelocity.x, this.opponentVelocity.y),
            0,
            850
        );

        const accelerationWeight = this.clamp(travelTime / 700, 0, 0.18);
        const leadX = this.opponentVelocity.x * travelTime
            + this.opponentAcceleration.x * travelTime * travelTime * 0.5 * accelerationWeight;
        const leadY = this.opponentVelocity.y * travelTime
            + this.opponentAcceleration.y * travelTime * travelTime * 0.5 * accelerationWeight;

        return {
            x: this.clampCoordinate(opponent.x + leadX, state.arena.width),
            y: this.clampCoordinate(opponent.y + leadY, state.arena.height)
        };
    }

    getInterceptTime(relativeX, relativeY, velocityX, velocityY) {
        const quadraticA = velocityX * velocityX + velocityY * velocityY - PROJECTILE_SPEED * PROJECTILE_SPEED;
        const quadraticB = 2 * (relativeX * velocityX + relativeY * velocityY);
        const quadraticC = relativeX * relativeX + relativeY * relativeY;
        const directTime = Math.sqrt(quadraticC) / PROJECTILE_SPEED;

        if (Math.abs(quadraticA) < 0.000001) {
            if (Math.abs(quadraticB) < 0.000001) return directTime;
            const linearTime = -quadraticC / quadraticB;
            return linearTime > 0 ? linearTime : directTime;
        }

        const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
        if (discriminant < 0) return directTime;

        const root = Math.sqrt(discriminant);
        const firstTime = (-quadraticB - root) / (2 * quadraticA);
        const secondTime = (-quadraticB + root) / (2 * quadraticA);
        const validTimes = [firstTime, secondTime].filter(time => time > 0 && Number.isFinite(time));
        return validTimes.length > 0 ? Math.min(...validTimes) : directTime;
    }

    limitVector(vector, maximumMagnitude) {
        const magnitude = Math.hypot(vector.x, vector.y);
        if (magnitude <= maximumMagnitude || magnitude === 0) return;
        const scale = maximumMagnitude / magnitude;
        vector.x *= scale;
        vector.y *= scale;
    }

    clampCoordinate(value, extent) {
        const minimum = Math.min(PLAYER_RADIUS, extent / 2);
        const maximum = Math.max(minimum, extent - PLAYER_RADIUS);
        return this.clamp(value, minimum, maximum);
    }

    clamp(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }
}
