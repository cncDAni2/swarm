import { BotController } from './BotController.js';

export class IdleObserverBot extends BotController {
    static id = 'idle-observer';
    static displayName = 'Idle Observer';

    start(context) {
        this.context = context;
    }

    stop() {
        this.context = null;
    }
}