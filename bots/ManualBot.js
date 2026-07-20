import { BotController } from './BotController.js';

export class ManualBot extends BotController {
    static id = 'manual';
    static displayName = 'Manual';

    start(context) {
        this.context = context;
    }

    update(_deltaTime) {
        const input = this.context.getInput();
        this.context.move(input.moveX, input.moveY);
        if (input.isFiring) this.context.fireAt(input.aimX, input.aimY);
    }

    stop() {
        this.context = null;
    }
}