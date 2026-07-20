import { BotController } from './BotController.js';

export class LunaMaxBot extends BotController {
    static id = 'luna-max';
    static displayName = 'Luna Max';

    start(context) {
        this.context = context;
        this.lastFiredAt = -Infinity;
        this.lastOpponentSample = null;
        this.opponentVelocity = { x: 0, y: 0 };
        this.orbitDirection = 1;
        this.nextOrbitChangeAt = 0;
        this.randomState = 1;
        this.weavePhase = 0;
        this.initialized = false;
    }

    update(_deltaTime) {
        const state = this.context.getState();
        if (state.matchEnded || state.opponent.health <= 0) return;

        this.initialize(state);
        this.updateOpponentVelocity(state);
        this.updateOrbitDirection(state);
        this.context.move(...this.getMovement(state));

        if (state.self.energy < 1 || state.time - this.lastFiredAt < 200) return;
        const aimPoint = this.getAimPoint(state);
        if (this.context.fireAt(aimPoint.x, aimPoint.y)) this.lastFiredAt = state.time;
    }

    stop() {
        this.context = null;
        this.lastOpponentSample = null;
        this.opponentVelocity = { x: 0, y: 0 };
    }

    initialize(state) {
        if (this.initialized) return;

        const seed = Math.floor(state.self.x * 31 + state.self.y * 17
            + state.arena.width * 13 + state.arena.height * 7) >>> 0;
        this.randomState = seed || 1;
        this.weavePhase = this.nextRandom() * Math.PI * 2;
        this.orbitDirection = state.self.x < state.arena.width / 2 ? 1 : -1;
        this.nextOrbitChangeAt = state.time + 700 + this.nextRandom() * 800;
        this.initialized = true;
    }

    nextRandom() {
        this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
        return this.randomState / 4294967296;
    }

    updateOpponentVelocity(state) {
        const opponent = state.opponent;
        const previous = this.lastOpponentSample;
        if (previous && state.time > previous.time) {
            const elapsed = state.time - previous.time;
            let measuredX = (opponent.x - previous.x) / elapsed;
            let measuredY = (opponent.y - previous.y) / elapsed;
            const measuredSpeed = Math.hypot(measuredX, measuredY);
            const maximumSpeed = 12 / 16;
            if (measuredSpeed > maximumSpeed) {
                const speedScale = maximumSpeed / measuredSpeed;
                measuredX *= speedScale;
                measuredY *= speedScale;
            }

            const smoothing = 1 - Math.exp(-elapsed / 96);
            this.opponentVelocity.x += (measuredX - this.opponentVelocity.x) * smoothing;
            this.opponentVelocity.y += (measuredY - this.opponentVelocity.y) * smoothing;
        }

        this.lastOpponentSample = {
            x: opponent.x,
            y: opponent.y,
            time: state.time
        };
    }

    updateOrbitDirection(state) {
        if (state.time < this.nextOrbitChangeAt) return;

        this.orbitDirection = this.nextRandom() < 0.5 ? -1 : 1;
        this.nextOrbitChangeAt = state.time + 650 + this.nextRandom() * 1_150;
    }

    getMovement(state) {
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
        const smallestArenaDimension = Math.max(1, Math.min(arena.width, arena.height));
        const preferredRange = this.clamp(smallestArenaDimension * 0.46, 260, 620);
        const rangeError = (preferredRange - distance) / preferredRange;
        let radialWeight = this.clamp(rangeError * 0.9, -0.7, 1.25);
        if (distance < preferredRange * 0.68) radialWeight = 1.35;

        const weave = Math.sin(state.time / 360 + this.weavePhase) * 0.28;
        let movementX = tangentX * (0.95 + weave) + awayX * radialWeight;
        let movementY = tangentY * (0.95 + weave) + awayY * radialWeight;

        const boundaryMargin = Math.max(1, Math.min(160, smallestArenaDimension * 0.22));
        const boundaryX = this.getBoundaryForce(self.x, arena.width, boundaryMargin);
        const boundaryY = this.getBoundaryForce(self.y, arena.height, boundaryMargin);
        movementX += boundaryX * 2.4;
        movementY += boundaryY * 2.4;

        return [movementX, movementY];
    }

    getBoundaryForce(position, extent, margin) {
        if (position < margin) return (margin - position) / margin;
        if (position > extent - margin) return (extent - margin - position) / margin;
        return 0;
    }

    getAimPoint(state) {
        const self = state.self;
        const opponent = state.opponent;
        const projectileSpeed = 21 / 16;
        const aimVelocityX = this.opponentVelocity.x * 0.78;
        const aimVelocityY = this.opponentVelocity.y * 0.78;
        const relativeX = opponent.x - self.x;
        const relativeY = opponent.y - self.y;
        const interceptTime = this.getInterceptTime(
            relativeX,
            relativeY,
            aimVelocityX,
            aimVelocityY,
            projectileSpeed
        );
        const leadTime = this.clamp(interceptTime || 0, 0, 900);

        return {
            x: this.clamp(opponent.x + aimVelocityX * leadTime, 0, state.arena.width),
            y: this.clamp(opponent.y + aimVelocityY * leadTime, 0, state.arena.height)
        };
    }

    getInterceptTime(relativeX, relativeY, velocityX, velocityY, projectileSpeed) {
        const velocitySquared = velocityX * velocityX + velocityY * velocityY;
        const coefficientA = velocitySquared - projectileSpeed * projectileSpeed;
        const coefficientB = 2 * (relativeX * velocityX + relativeY * velocityY);
        const coefficientC = relativeX * relativeX + relativeY * relativeY;

        if (Math.abs(coefficientA) < 0.000001) {
            if (Math.abs(coefficientB) < 0.000001) return Math.sqrt(coefficientC) / projectileSpeed;
            const linearTime = -coefficientC / coefficientB;
            return linearTime > 0 ? linearTime : 0;
        }

        const discriminant = coefficientB * coefficientB - 4 * coefficientA * coefficientC;
        if (discriminant < 0) return 0;

        const squareRoot = Math.sqrt(discriminant);
        const firstTime = (-coefficientB - squareRoot) / (2 * coefficientA);
        const secondTime = (-coefficientB + squareRoot) / (2 * coefficientA);
        const validTimes = [firstTime, secondTime].filter(time => time > 0 && Number.isFinite(time));
        return validTimes.length > 0 ? Math.min(...validTimes) : 0;
    }

    clamp(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }
}