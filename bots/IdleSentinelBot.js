import { BotController } from './BotController.js';

export class IdleSentinelBot extends BotController {
    static id = 'idle-sentinel';
    static displayName = 'Idle Sentinel';

    start(context) {
        this.context = context;
    }

    stop() {
        this.context = null;
    }
}