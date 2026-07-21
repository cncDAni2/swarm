import { BotController } from './BotController.js';

const BULLET_SPEED_PER_MS = 21 / 16;
const MAX_LEAD_TIME = 650;

export class SolMedBot extends BotController {
    static id = 'sol-med';
    static displayName = 'sol-med';

    start(context) {
        this.context = context;
        this.previousState = null;
        this.opponentVelocity = { x: 0, y: 0 };
        this.strafeDirection = 1;
        this.nextManeuverTime = 0;
    }

    update(deltaTime) {
        const state = this.context.getState();
        if (state.matchEnded) return;

        this.updateOpponentVelocity(state, deltaTime);
        this.chooseManeuver(state);
        this.move(state);

        const aim = this.getInterceptPoint(state);
        this.context.fireAt(aim.x, aim.y);
        this.previousState = state;
    }

    updateOpponentVelocity(state, deltaTime) {
        if (!this.previousState || deltaTime <= 0) return;

        const measuredX = (state.opponent.x - this.previousState.opponent.x) / deltaTime;
        const measuredY = (state.opponent.y - this.previousState.opponent.y) / deltaTime;
        const smoothing = 0.55;
        this.opponentVelocity.x += (measuredX - this.opponentVelocity.x) * smoothing;
        this.opponentVelocity.y += (measuredY - this.opponentVelocity.y) * smoothing;
    }

    chooseManeuver(state) {
        if (state.time < this.nextManeuverTime) return;

        const positionKey = Math.floor(state.opponent.x * 7 + state.opponent.y * 11 + state.time);
        if (positionKey % 5 !== 0) this.strafeDirection *= -1;
        this.nextManeuverTime = state.time + 360 + Math.abs(positionKey % 440);
    }

    move(state) {
        const offsetX = state.opponent.x - state.self.x;
        const offsetY = state.opponent.y - state.self.y;
        const distance = Math.max(1, Math.hypot(offsetX, offsetY));
        const radialX = offsetX / distance;
        const radialY = offsetY / distance;
        const preferredRange = Math.min(430, Math.max(230, Math.min(state.arena.width, state.arena.height) * 0.42));
        const rangeError = Math.max(-1, Math.min(1, (distance - preferredRange) / 120));

        let moveX = radialX * rangeError - radialY * this.strafeDirection;
        let moveY = radialY * rangeError + radialX * this.strafeDirection;

        const margin = 110;
        if (state.self.x < margin) moveX += (margin - state.self.x) / margin * 2.2;
        if (state.self.x > state.arena.width - margin) moveX -= (state.self.x - state.arena.width + margin) / margin * 2.2;
        if (state.self.y < margin) moveY += (margin - state.self.y) / margin * 2.2;
        if (state.self.y > state.arena.height - margin) moveY -= (state.self.y - state.arena.height + margin) / margin * 2.2;

        this.context.move(moveX, moveY);
    }

    getInterceptPoint(state) {
        const relativeX = state.opponent.x - state.self.x;
        const relativeY = state.opponent.y - state.self.y;
        const velocityX = this.opponentVelocity.x;
        const velocityY = this.opponentVelocity.y;
        const a = velocityX * velocityX + velocityY * velocityY - BULLET_SPEED_PER_MS * BULLET_SPEED_PER_MS;
        const b = 2 * (relativeX * velocityX + relativeY * velocityY);
        const c = relativeX * relativeX + relativeY * relativeY;
        let interceptTime = Math.sqrt(c) / BULLET_SPEED_PER_MS;

        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0 && Math.abs(a) > 0.000001) {
            const root = Math.sqrt(discriminant);
            const first = (-b - root) / (2 * a);
            const second = (-b + root) / (2 * a);
            const validTimes = [first, second].filter(time => time > 0);
            if (validTimes.length) interceptTime = Math.min(...validTimes);
        }

        interceptTime = Math.min(MAX_LEAD_TIME, Math.max(0, interceptTime));
        return {
            x: Math.max(0, Math.min(state.arena.width, state.opponent.x + velocityX * interceptTime)),
            y: Math.max(0, Math.min(state.arena.height, state.opponent.y + velocityY * interceptTime))
        };
    }

    stop() {
        this.context = null;
        this.previousState = null;
    }
}