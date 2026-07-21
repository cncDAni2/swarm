import { BotController } from './BotController.js';

const FRAME_DURATION = 16;
const PROJECTILE_SPEED = 21;
const EPSILON = 0.0001;
const TAU = Math.PI * 2;

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function length(x, y) {
    return Math.hypot(x, y);
}

export class SolMaxBot extends BotController {
    static id = 'sol-max';
    static displayName = 'Sol Max';

    start(context) {
        const state = context.getState();
        this.context = context;
        this.lastTime = state.time;
        this.previousFrameTime = FRAME_DURATION;
        this.runsAfterOpponent = state.self.x > state.opponent.x;
        this.lastSelf = { x: state.self.x, y: state.self.y };
        this.lastOpponent = { x: state.opponent.x, y: state.opponent.y };
        this.selfVelocity = { x: 0, y: 0 };
        this.opponentVelocity = { x: 0, y: 0 };
        this.observedOpponentVelocity = { x: 0, y: 0 };
        this.opponentAcceleration = { x: 0, y: 0 };
        this.lastHealth = state.self.health;
        this.randomState = this.createSeed(state);
        this.strafeDirection = this.random() < 0.5 ? -1 : 1;
        this.weavePhase = this.random() * TAU;
        this.juke = { x: 0, y: 0, until: state.time, strength: 0 };
        this.nextManeuverTime = state.time + this.randomBetween(280, 620);
        this.nextShotEvasionTime = Infinity;
        this.shotCounter = 0;
        this.isRecharging = false;
    }

    update(deltaTime) {
        if (!this.context) return;

        const state = this.context.getState();
        if (state.matchEnded || state.self.health <= 0) return;

        const elapsed = clamp(state.time - this.lastTime || deltaTime, 1, 64);
        this.observeMotion(state, elapsed);

        if (state.time >= this.nextShotEvasionTime) {
            this.beginShotEvasion(state.time);
        } else if (state.self.health < this.lastHealth) {
            this.beginManeuver(state.time, true);
        } else if (state.time >= this.nextManeuverTime) {
            this.beginManeuver(state.time, false);
        }

        const movement = this.chooseMovement(state);
        this.context.move(movement.x, movement.y);

        const firingState = this.context.getState();
        if (this.shouldFire(firingState)) {
            const target = this.chooseTarget(firingState);
            if (this.context.fireAt(target.x, target.y)) {
                this.shotCounter++;
                this.nextShotEvasionTime = firingState.time + FRAME_DURATION;
            }
        }

        this.lastTime = state.time;
        this.previousFrameTime = elapsed;
        this.lastSelf = { x: state.self.x, y: state.self.y };
        this.lastOpponent = { x: state.opponent.x, y: state.opponent.y };
        this.lastHealth = state.self.health;
    }

    stop() {
        this.context = null;
    }

    observeMotion(state, elapsed) {
        const selfElapsed = clamp(this.previousFrameTime, 1, 64);
        const opponentElapsed = this.runsAfterOpponent ? elapsed : selfElapsed;
        const selfFrameScale = selfElapsed / FRAME_DURATION;
        const opponentFrameScale = opponentElapsed / FRAME_DURATION;
        const rawSelfVelocity = {
            x: (state.self.x - this.lastSelf.x) / selfFrameScale,
            y: (state.self.y - this.lastSelf.y) / selfFrameScale
        };
        const rawOpponentVelocity = {
            x: (state.opponent.x - this.lastOpponent.x) / opponentFrameScale,
            y: (state.opponent.y - this.lastOpponent.y) / opponentFrameScale
        };
        const selfBlend = clamp(1 - Math.exp(-selfElapsed / 28), 0.25, 0.85);
        const opponentBlend = clamp(1 - Math.exp(-opponentElapsed / 42), 0.2, 0.75);
        const previousObservedVelocity = { ...this.observedOpponentVelocity };

        this.selfVelocity.x += (rawSelfVelocity.x - this.selfVelocity.x) * selfBlend;
        this.selfVelocity.y += (rawSelfVelocity.y - this.selfVelocity.y) * selfBlend;
        this.opponentVelocity.x += (rawOpponentVelocity.x - this.opponentVelocity.x) * opponentBlend;
        this.opponentVelocity.y += (rawOpponentVelocity.y - this.opponentVelocity.y) * opponentBlend;
        this.observedOpponentVelocity = rawOpponentVelocity;

        const rawAccelerationX = (rawOpponentVelocity.x - previousObservedVelocity.x) / opponentFrameScale;
        const rawAccelerationY = (rawOpponentVelocity.y - previousObservedVelocity.y) / opponentFrameScale;
        const accelerationBlend = clamp(1 - Math.exp(-opponentElapsed / 70), 0.12, 0.6);
        this.opponentAcceleration.x += (rawAccelerationX - this.opponentAcceleration.x) * accelerationBlend;
        this.opponentAcceleration.y += (rawAccelerationY - this.opponentAcceleration.y) * accelerationBlend;
    }

    beginManeuver(time, emergency) {
        const speed = length(this.selfVelocity.x, this.selfVelocity.y);
        const turnDirection = this.random() < 0.5 ? -1 : 1;
        const angle = this.random() * TAU;
        const jukeX = emergency && speed > 1
            ? -this.selfVelocity.y / speed * turnDirection
            : Math.cos(angle);
        const jukeY = emergency && speed > 1
            ? this.selfVelocity.x / speed * turnDirection
            : Math.sin(angle);
        this.juke = {
            x: jukeX,
            y: jukeY,
            until: time + this.randomBetween(emergency ? 260 : 150, emergency ? 440 : 330),
            strength: emergency ? 1.35 : this.randomBetween(0.35, 0.75)
        };

        if (this.random() < (emergency ? 0.12 : 0.34)) this.strafeDirection *= -1;
        this.weavePhase += this.randomBetween(0.45, 1.8);
        this.nextManeuverTime = time + this.randomBetween(emergency ? 240 : 300, emergency ? 480 : 720);
    }

    beginShotEvasion(time) {
        const speed = length(this.selfVelocity.x, this.selfVelocity.y);
        const turnDirection = this.random() < 0.5 ? -1 : 1;
        const angle = this.random() * TAU;
        this.juke = {
            x: speed > 1 ? -this.selfVelocity.y / speed * turnDirection : Math.cos(angle),
            y: speed > 1 ? this.selfVelocity.x / speed * turnDirection : Math.sin(angle),
            until: time + this.randomBetween(150, 230),
            strength: 1.45
        };
        this.nextShotEvasionTime = Infinity;
    }

    chooseMovement(state) {
        const toOpponentX = state.opponent.x - state.self.x;
        const toOpponentY = state.opponent.y - state.self.y;
        const opponentDistance = Math.max(EPSILON, length(toOpponentX, toOpponentY));
        const towardX = toOpponentX / opponentDistance;
        const towardY = toOpponentY / opponentDistance;
        const tangentX = -towardY * this.strafeDirection;
        const tangentY = towardX * this.strafeDirection;
        const minimumDimension = Math.max(120, Math.min(state.arena.width, state.arena.height));
        const arenaDiagonal = Math.hypot(state.arena.width, state.arena.height);
        let maximumRange = 900;
        const healthAdvantage = state.self.health - state.opponent.health;
        if (state.opponent.health <= 20 && healthAdvantage >= 20) maximumRange = Math.min(maximumRange, 500);
        const desiredRange = clamp(arenaDiagonal * 0.55, 190, maximumRange);
        const rangeError = (opponentDistance - desiredRange) / desiredRange;
        let radialWeight = clamp(rangeError * 1.35, -1.7, 0.5);

        if (opponentDistance < 135) radialWeight = -2.4;
        radialWeight += Math.sin(state.time / 185 + this.weavePhase) * 0.28;

        let desiredX = tangentX + towardX * radialWeight;
        let desiredY = tangentY + towardY * radialWeight;

        if (state.time < this.juke.until) {
            desiredX += this.juke.x * this.juke.strength;
            desiredY += this.juke.y * this.juke.strength;
        }

        const wallForce = this.getWallForce(state, minimumDimension);
        desiredX += wallForce.x;
        desiredY += wallForce.y;

        const desiredLength = Math.max(EPSILON, length(desiredX, desiredY));
        const desiredVelocityX = desiredX / desiredLength * 11;
        const desiredVelocityY = desiredY / desiredLength * 11;
        let steeringX = desiredVelocityX - this.selfVelocity.x;
        let steeringY = desiredVelocityY - this.selfVelocity.y;

        if (length(steeringX, steeringY) < EPSILON) {
            steeringX = desiredX;
            steeringY = desiredY;
        }
        return { x: steeringX, y: steeringY };
    }

    getWallForce(state, minimumDimension) {
        const wallBand = clamp(minimumDimension * 0.17, 75, 170);
        const lookAheadFrames = 6;
        const projectedX = state.self.x + this.selfVelocity.x * lookAheadFrames;
        const projectedY = state.self.y + this.selfVelocity.y * lookAheadFrames;
        const leftDistance = Math.min(state.self.x - 25, projectedX - 25);
        const rightDistance = Math.min(state.arena.width - state.self.x - 25, state.arena.width - projectedX - 25);
        const topDistance = Math.min(state.self.y - 25, projectedY - 25);
        const bottomDistance = Math.min(state.arena.height - state.self.y - 25, state.arena.height - projectedY - 25);

        return {
            x: this.wallRepulsion(leftDistance, wallBand) - this.wallRepulsion(rightDistance, wallBand),
            y: this.wallRepulsion(topDistance, wallBand) - this.wallRepulsion(bottomDistance, wallBand)
        };
    }

    wallRepulsion(distance, wallBand) {
        if (distance >= wallBand) return 0;
        const pressure = 1 - distance / wallBand;
        return pressure * pressure * 3.4;
    }

    shouldFire(state) {
        if (this.isRecharging) {
            if (state.self.energy >= 90 || state.opponent.health <= 25 || state.self.health <= 25) {
                this.isRecharging = false;
            } else {
                return false;
            }
        }

        if (state.self.energy <= 10 && state.opponent.health > 25 && state.self.health > 25) {
            this.isRecharging = true;
            return false;
        }
        return true;
    }

    chooseTarget(state) {
        const relativeX = state.opponent.x - state.self.x;
        const relativeY = state.opponent.y - state.self.y;
        const speed = length(this.opponentVelocity.x, this.opponentVelocity.y);
        const acceleration = length(this.opponentAcceleration.x, this.opponentAcceleration.y);
        const maneuverRatio = clamp(acceleration / 0.7, 0, 1);
        const directTravelFrames = length(relativeX, relativeY) / PROJECTILE_SPEED;
        let leadPatterns = [1, 1, 0.97, 1.03, 1];
        if (maneuverRatio > 0.42) {
            leadPatterns = directTravelFrames > 25
                ? [0.18, 0.42, 0.66, 0.86, 1]
                : [0.78, 0.92, 1, 1.08, 0.86];
        }
        const leadFactor = speed < 0.35 ? 0 : leadPatterns[this.shotCounter % leadPatterns.length];
        const targetVelocityX = this.opponentVelocity.x * leadFactor;
        const targetVelocityY = this.opponentVelocity.y * leadFactor;
        let travelFrames = this.solveInterceptTime(
            relativeX,
            relativeY,
            targetVelocityX,
            targetVelocityY
        );
        travelFrames = clamp(travelFrames, 0, 70);

        const accelerationHorizon = Math.min(travelFrames, 7);
        const accelerationWeight = leadFactor === 1 ? 0.42 * (1 - maneuverRatio * 0.55) : 0.16;
        const accelerationOffsetX = 0.5 * this.opponentAcceleration.x
            * accelerationHorizon * accelerationHorizon * accelerationWeight;
        const accelerationOffsetY = 0.5 * this.opponentAcceleration.y
            * accelerationHorizon * accelerationHorizon * accelerationWeight;
        const margin = 25;

        return {
            x: clamp(
                state.opponent.x + targetVelocityX * travelFrames + accelerationOffsetX,
                margin,
                Math.max(margin, state.arena.width - margin)
            ),
            y: clamp(
                state.opponent.y + targetVelocityY * travelFrames + accelerationOffsetY,
                margin,
                Math.max(margin, state.arena.height - margin)
            )
        };
    }

    solveInterceptTime(relativeX, relativeY, velocityX, velocityY) {
        const quadratic = velocityX * velocityX + velocityY * velocityY
            - PROJECTILE_SPEED * PROJECTILE_SPEED;
        const linear = 2 * (relativeX * velocityX + relativeY * velocityY);
        const constant = relativeX * relativeX + relativeY * relativeY;

        if (Math.abs(quadratic) < EPSILON) {
            if (Math.abs(linear) < EPSILON) return Math.sqrt(constant) / PROJECTILE_SPEED;
            const linearTime = -constant / linear;
            return linearTime > 0 ? linearTime : Math.sqrt(constant) / PROJECTILE_SPEED;
        }

        const discriminant = linear * linear - 4 * quadratic * constant;
        if (discriminant < 0) return Math.sqrt(constant) / PROJECTILE_SPEED;
        const root = Math.sqrt(discriminant);
        const firstTime = (-linear - root) / (2 * quadratic);
        const secondTime = (-linear + root) / (2 * quadratic);
        const validTimes = [firstTime, secondTime].filter(time => time > 0);
        return validTimes.length > 0
            ? Math.min(...validTimes)
            : Math.sqrt(constant) / PROJECTILE_SPEED;
    }

    createSeed(state) {
        const values = [
            state.self.x,
            state.self.y,
            state.opponent.x,
            state.opponent.y,
            state.arena.width,
            state.arena.height
        ];
        let seed = 2166136261;
        values.forEach(value => {
            seed = Math.imul(seed ^ Math.round(value * 10), 16777619);
        });
        return seed >>> 0 || 0x9e3779b9;
    }

    random() {
        let value = this.randomState;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        this.randomState = value >>> 0;
        return this.randomState / 4294967296;
    }

    randomBetween(minimum, maximum) {
        return minimum + (maximum - minimum) * this.random();
    }
}