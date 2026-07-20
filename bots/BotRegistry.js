import { BotController } from './BotController.js';
import { IdleObserverBot } from './IdleObserverBot.js';
import { IdleSentinelBot } from './IdleSentinelBot.js';
import { LunaLowBot } from './LunaLowBot.js';
import { ManualBot } from './ManualBot.js';

const botClasses = new Map();

export function registerBot(BotClass) {
    if (!(BotClass.prototype instanceof BotController)) {
        throw new TypeError('Registered bots must extend BotController.');
    }
    if (typeof BotClass.id !== 'string' || !BotClass.id) {
        throw new TypeError('Registered bots must provide a static id.');
    }
    if (typeof BotClass.displayName !== 'string' || !BotClass.displayName) {
        throw new TypeError('Registered bots must provide a static displayName.');
    }
    if (botClasses.has(BotClass.id)) {
        throw new Error(`A bot is already registered as "${BotClass.id}".`);
    }
    botClasses.set(BotClass.id, BotClass);
}

export function getRegisteredBots() {
    return [...botClasses.values()].map(BotClass => Object.freeze({
        id: BotClass.id,
        name: BotClass.displayName
    }));
}

export function getBotDefinition(id) {
    const BotClass = botClasses.get(id);
    if (!BotClass) throw new Error(`Unknown bot "${id}".`);
    return Object.freeze({ id: BotClass.id, name: BotClass.displayName });
}

export function createBotController(id) {
    const BotClass = botClasses.get(id);
    if (!BotClass) throw new Error(`Unknown bot "${id}".`);
    return new BotClass();
}

registerBot(ManualBot);
registerBot(IdleSentinelBot);
registerBot(IdleObserverBot);
registerBot(LunaLowBot);