import { BotObservationEncoder } from './BotObservationEncoder.js';

const MOVEMENT_DIRECTIONS = [
    [0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, -1]
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
    constructor(game) {
        this.game = game;
        this.encoder = new BotObservationEncoder();
        this.model = null;
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

    update(player) {
        if (!this.ready || player.health <= 0) return emptyControls(player);

        const tf = globalThis.tf;
        return tf.tidy(() => {
            const observation = this.encoder.encode(this.game);
            const input = tf.tensor2d(observation, [1, observation.length]);
            const logits = this.model.predict(input);
            const movementIndex = logits.slice([0, 0], [1, 9]).argMax(1).dataSync()[0];
            const aimIndex = logits.slice([0, 9], [1, 16]).argMax(1).dataSync()[0];
            const fireIndex = logits.slice([0, 25], [1, 2]).argMax(1).dataSync()[0];
            const [ax, ay] = MOVEMENT_DIRECTIONS[movementIndex];
            const aimAngle = aimIndex / 16 * Math.PI * 2;
            const aimDistance = Math.hypot(this.game.canvas.width, this.game.canvas.height);

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