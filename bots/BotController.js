export class BotController {
    static id = '';
    static displayName = '';

    start(_context) {
        throw new Error('Bot controllers must implement start(context).');
    }

    stop() {
        throw new Error('Bot controllers must implement stop().');
    }

    update(_deltaTime) {}
}