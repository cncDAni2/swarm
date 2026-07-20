import { BotController } from './BotController.js';

export class LunaLowBot extends BotController {
    static id = 'luna-low';
    static displayName = 'Luna Low';

    start(context) {
        this.context = context;
        this.previousOpponent = null;
        this.strafeSign = 1;
        this.nextStrafeChange = 0;
    }

    update(deltaTime) {
        const state = this.context.getState();
        if (state.matchEnded || state.self.health <= 0 || state.opponent.health <= 0) return;

        const self = state.self;
        const opponent = state.opponent;
        const frameSeconds = Math.max(0.001, Math.min(0.064, deltaTime) / 1000);
        const deltaX = opponent.x - self.x;
        const deltaY = opponent.y - self.y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const opponentVelocity = this.getOpponentVelocity(opponent, state.time, frameSeconds);

        if (state.time >= this.nextStrafeChange) {
            this.strafeSign *= -1;
            this.nextStrafeChange = state.time + 520 + (distance % 240);
        }

        const arenaCenterY = state.arena.height / 2;
        const rangeCorrection = distance > 470 ? 1 : distance < 300 ? -1 : 0;
        const perpendicularX = -deltaY / distance;
        const perpendicularY = deltaX / distance;
        let moveX = (deltaX / distance) * rangeCorrection + perpendicularX * this.strafeSign;
        let moveY = (deltaY / distance) * rangeCorrection + perpendicularY * this.strafeSign;

        if (self.y < 70) moveY += 1.2;
        if (self.y > state.arena.height - 70) moveY -= 1.2;
        if (self.x < 70) moveX += 1.2;
        if (self.x > state.arena.width - 70) moveX -= 1.2;
        if (Math.abs(self.y - arenaCenterY) > state.arena.height * 0.35) moveY += Math.sign(arenaCenterY - self.y);
        this.context.move(moveX, moveY);

        const projectileTime = Math.min(0.9, distance / 21);
        const aimX = opponent.x + opponentVelocity.x * projectileTime;
        const aimY = opponent.y + opponentVelocity.y * projectileTime;
        this.context.fireAt(aimX, aimY);
    }

    getOpponentVelocity(opponent, time, frameSeconds) {
        const velocity = { x: 0, y: 0 };
        if (this.previousOpponent) {
            velocity.x = (opponent.x - this.previousOpponent.x) / frameSeconds;
            velocity.y = (opponent.y - this.previousOpponent.y) / frameSeconds;
            const speed = Math.hypot(velocity.x, velocity.y);
            if (speed > 12) {
                velocity.x = velocity.x / speed * 12;
                velocity.y = velocity.y / speed * 12;
            }
        }
        this.previousOpponent = { x: opponent.x, y: opponent.y, time };
        return velocity;
    }

    stop() {
        this.context = null;
        this.previousOpponent = null;
    }
}