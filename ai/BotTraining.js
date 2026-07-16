import { createBotMetadata } from './BotModelSchema.js';

const MOVEMENT_DIRECTIONS = [
    [0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
];

function nearestMovementAction(ax, ay) {
    if (Math.hypot(ax, ay) < 0.15) return 0;
    let selectedIndex = 0;
    let bestDot = -Infinity;
    const length = Math.hypot(ax, ay);
    MOVEMENT_DIRECTIONS.forEach(([directionX, directionY], index) => {
        const dot = (ax / length) * directionX + (ay / length) * directionY;
        if (dot > bestDot) {
            bestDot = dot;
            selectedIndex = index;
        }
    });
    return selectedIndex;
}

export function encodeTeacherAction(controls, player) {
    const angle = Math.atan2(controls.mouseY - player.y, controls.mouseX - player.x);
    const aimDirection = ((Math.round(angle / (Math.PI * 2) * 16) % 16) + 16) % 16;
    return {
        movement: nearestMovementAction(controls.ax || 0, controls.ay || 0),
        aimDirection,
        fire: Boolean(controls.isMouseDown)
    };
}

export class RewardTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.pendingReward = 0;
        this.survivalMilliseconds = 0;
    }

    tick(deltaTime) {
        this.survivalMilliseconds += deltaTime;
        while (this.survivalMilliseconds >= 10000) {
            this.pendingReward += 1;
            this.survivalMilliseconds -= 10000;
        }
    }

    recordDamageDealt(amount) {
        this.pendingReward += Math.max(0, amount);
    }

    recordDamageTaken(amount) {
        this.pendingReward -= Math.max(0, amount);
    }

    recordRoundCompleted() {
        this.pendingReward += 10;
    }

    consume() {
        const reward = this.pendingReward;
        this.pendingReward = 0;
        return reward;
    }
}

export class EpisodeRecorder {
    constructor() {
        this.bridge = globalThis.swarmTraining;
        this.sessionId = `episode-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        this.pending = null;
        this.buffer = [];
        this.enabled = Boolean(this.bridge);

        if (this.enabled) {
            this.bridge.startSession({
                sessionId: this.sessionId,
                metadata: createBotMetadata({ source: 'heuristic-player-bot' })
            });
        }
    }

    recordDecision(observation, action, reward) {
        if (!this.enabled) return;
        if (this.pending) {
            this.buffer.push({
                state: this.pending.observation,
                action: this.pending.action,
                reward,
                nextState: Array.from(observation),
                done: false
            });
        }
        this.pending = { observation: Array.from(observation), action };
        this.flush(false);
    }

    finish(finalObservation, reward) {
        if (!this.enabled || !this.pending) return;
        this.buffer.push({
            state: this.pending.observation,
            action: this.pending.action,
            reward: reward - 1000,
            nextState: Array.from(finalObservation),
            done: true
        });
        this.pending = null;
        this.flush(true);
    }

    flush(force) {
        if (!this.enabled || this.buffer.length === 0 || (!force && this.buffer.length < 32)) return;
        const transitions = this.buffer.splice(0);
        this.bridge.appendTransitions({ sessionId: this.sessionId, transitions, complete: force });
    }
}