import { BotController } from './BotController.js';
import { IdleObserverBot } from './IdleObserverBot.js';
import { LunaMaxBot } from './LunaMaxBot.js';
import { LunaLowBot } from './LunaLowBot.js';
import { ManualBot } from './ManualBot.js';
import { GeminiThreeFlashBot3 } from './GeminiThreeFlashBot.js';
import { Sonnet5MaxBot } from './Sonnet5MaxBot.js';
import { GeminiThreeFlashBot } from './GeminiThreeFlashBot-v1.js';
import { TerraMaxBot } from './TerraMaxBot.js';
import { TerraMedBot } from './TerraMedBot.js';
import { GeminiThreeFlashBot2 } from './GeminiThreeFlashBot-v2.js';
import { Grok45MaxBot } from './Grok45MaxBot.js';
import { Grok45MaxWPBot } from './Grok45MaxWPBot.js';
import { SolMedBot } from './SolMedBot.js';
import { SolMaxBot } from './SolMaxBot.js';

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
registerBot(IdleObserverBot);
registerBot(LunaLowBot);
registerBot(LunaMaxBot);
registerBot(TerraMedBot);
registerBot(TerraMaxBot);
registerBot(Sonnet5MaxBot);
registerBot(SolMedBot);
registerBot(SolMaxBot);
registerBot(GeminiThreeFlashBot);
registerBot(GeminiThreeFlashBot2);
registerBot(GeminiThreeFlashBot3);
registerBot(Grok45MaxBot);
registerBot(Grok45MaxWPBot);

