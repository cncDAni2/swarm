import { BotObservationEncoder } from './BotObservationEncoder.js';

const MOVEMENT_DIRECTIONS = [
    [0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
];
const MODEL_URL = './training/models/imitation-policy/model.json';

function emptyControls(player) {
    return {
        ax: 0,
        ay: 0,
        mouseX: player.x,
        mouseY: player.y,
        isMouseDown: false,
        tryElectricBeam: false
    };
}

export class NeuralPlayerBot {
    constructor(game, { stochastic = false } = {}) {
        this.game = game;
        this.encoder = new BotObservationEncoder();
        this.stochastic = stochastic;
        this.model = null;
        this.lastPolicyDecision = null;
        this.loadError = null;
        this.ready = false;
        this.loadModel();
    }

    async loadModel() {
        try {
            const tf = globalThis.tf;
            if (!tf) throw new Error('TensorFlow.js did not load');
            this.model = await tf.loadLayersModel(MODEL_URL);
            this.ready = true;
            console.info('Neural player model loaded');
        } catch (error) {
            this.loadError = error;
            console.error('Unable to load neural player model:', error);
        }
    }

    sampleAction(probabilities) {
        let threshold = Math.random();
        for (let index = 0; index < probabilities.length; index++) {
            threshold -= probabilities[index];
            if (threshold <= 0) return index;
        }
        return probabilities.length - 1;
    }

    chooseAction(logits, offset, size) {
        const values = logits.slice(offset, offset + size);
        const maximum = Math.max(...values);
        const weights = values.map(value => Math.exp(value - maximum));
        const total = weights.reduce((sum, value) => sum + value, 0);
        const probabilities = weights.map(value => value / total);
        const index = this.stochastic
            ? this.sampleAction(probabilities)
            : probabilities.indexOf(Math.max(...probabilities));
        return { index, logProbability: Math.log(Math.max(probabilities[index], 1e-8)) };
    }

    update(player) {
        if (!this.ready || player.health <= 0) return emptyControls(player);

        const tf = globalThis.tf;
        return tf.tidy(() => {
            const observation = this.encoder.encode(this.game);
            const input = tf.tensor2d(observation, [1, observation.length]);
            const logits = this.model.predict(input);
            const output = Array.from(logits.dataSync());
            const movement = this.chooseAction(output, 0, 9);
            const aim = this.chooseAction(output, 9, 16);
            const fire = this.chooseAction(output, 25, 2);
            const movementIndex = movement.index;
            const aimIndex = aim.index;
            const fireIndex = fire.index;
            const [ax, ay] = MOVEMENT_DIRECTIONS[movementIndex];
            const aimAngle = aimIndex / 16 * Math.PI * 2;
            const aimDistance = Math.hypot(this.game.canvas.width, this.game.canvas.height);

            this.lastPolicyDecision = {
                observation: Array.from(observation),
                action: { movement: movementIndex, aimDirection: aimIndex, fire: fireIndex === 1 },
                policy: {
                    logProbability: movement.logProbability + aim.logProbability + fire.logProbability,
                    value: output.length > 27 ? output[27] : 0
                }
            };

            return {
                ax,
                ay,
                mouseX: player.x + Math.cos(aimAngle) * aimDistance,
                mouseY: player.y + Math.sin(aimAngle) * aimDistance,
                isMouseDown: fireIndex === 1,
                tryElectricBeam: false
            };
        });
    }
}