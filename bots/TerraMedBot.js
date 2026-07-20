import { BotController } from './BotController.js';

export class TerraMedBot extends BotController {
    static id = 'terra-med';
    static displayName = 'Terra-Med';

    start(context) {
        this.context = context;
        this.previousOpponent = null;
        this.orbitDirection = 1;
        this.nextOrbitChange = 0;
    }

    update(deltaTime) {
        const state = this.context.getState();
        if (state.matchEnded || state.self.health <= 0 || state.opponent.health <= 0) return;

        const opponentVelocity = this.measureOpponentVelocity(state.opponent, deltaTime);
        this.context.move(...this.chooseMovement(state, opponentVelocity));
        const target = this.predictIntercept(state.self, state.opponent, opponentVelocity);
        this.context.fireAt(target.x, target.y);
        this.previousOpponent = { x: state.opponent.x, y: state.opponent.y };
    }

    measureOpponentVelocity(opponent, deltaTime) {
        if (!this.previousOpponent || deltaTime <= 0) return { x: 0, y: 0 };
        const framesElapsed = deltaTime / 16;
        return {
            x: (opponent.x - this.previousOpponent.x) / framesElapsed,
            y: (opponent.y - this.previousOpponent.y) / framesElapsed
        };
    }

    chooseMovement(state, opponentVelocity) {
        const dx = state.self.x - state.opponent.x;
        const dy = state.self.y - state.opponent.y;
        const distance = Math.hypot(dx, dy) || 1;
        const awayX = dx / distance;
        const awayY = dy / distance;

        if (state.time >= this.nextOrbitChange) {
            this.orbitDirection *= -1;
            this.nextOrbitChange = state.time + 360 + (Math.abs(state.self.x * 13 + state.self.y * 7) % 280);
        }

        const edgeMargin = 110;
        const edgeX = state.self.x < edgeMargin ? 1 : state.self.x > state.arena.width - edgeMargin ? -1 : 0;
        const edgeY = state.self.y < edgeMargin ? 1 : state.self.y > state.arena.height - edgeMargin ? -1 : 0;
        const radialWeight = distance < 280 ? 1.3 : distance > 520 ? -0.65 : 0.15;
        const orbitX = -awayY * this.orbitDirection;
        const orbitY = awayX * this.orbitDirection;
        const threatX = opponentVelocity.x * 0.08;
        const threatY = opponentVelocity.y * 0.08;

        return [
            awayX * radialWeight + orbitX * 1.2 + edgeX - threatX,
            awayY * radialWeight + orbitY * 1.2 + edgeY - threatY
        ];
    }

    predictIntercept(self, opponent, opponentVelocity) {
        const relativeX = opponent.x - self.x;
        const relativeY = opponent.y - self.y;
        const projectileSpeed = 21;
        const velocitySquared = opponentVelocity.x ** 2 + opponentVelocity.y ** 2;
        const relativeVelocity = relativeX * opponentVelocity.x + relativeY * opponentVelocity.y;
        const distanceSquared = relativeX ** 2 + relativeY ** 2;
        const a = velocitySquared - projectileSpeed ** 2;
        const b = 2 * relativeVelocity;
        const c = distanceSquared;
        const discriminant = b ** 2 - 4 * a * c;
        let travelFrames = 0;

        if (discriminant >= 0 && Math.abs(a) > 0.0001) {
            const root = Math.sqrt(discriminant);
            const first = (-b - root) / (2 * a);
            const second = (-b + root) / (2 * a);
            travelFrames = [first, second].filter(time => time > 0).sort((left, right) => left - right)[0] || 0;
        }

        return {
            x: opponent.x + opponentVelocity.x * travelFrames,
            y: opponent.y + opponentVelocity.y * travelFrames
        };
    }

    stop() {
        this.context = null;
        this.previousOpponent = null;
    }
}