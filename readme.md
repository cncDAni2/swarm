# SWARM Arena

A minimal two-bot arena foundation built with HTML5 Canvas and Electron.

Both participants use the player sprite, spawn on opposite sides, and have health, energy, movement, and plasma-fire state ready for future bot controllers. The two starter bot types are intentionally idle.

## Registered Bots

Every selectable bot is a controller class in [bots](bots). It must extend [bots/BotController.js](bots/BotController.js), declare a unique `static id` and `static displayName`, and implement `start(context)` and `stop()`. The registry in [bots/BotRegistry.js](bots/BotRegistry.js) validates and registers each class; both side selectors are populated directly from that registry.

To add a bot, create a controller and add one import plus `registerBot(YourBot)` in [bots/BotRegistry.js](bots/BotRegistry.js):

```js
import { BotController } from './BotController.js';

export class RangeKeeperBot extends BotController {
static id = 'range-keeper';
static displayName = 'Range Keeper';

start(context) {
this.context = context;
}

update(_deltaTime) {
const state = this.context.getState();
this.context.move(0, 0);
this.context.fireAt(state.opponent.x, state.opponent.y);
}

stop() {
this.context = null;
}
}
```

`start(context)` receives a stable, narrow API:

- `context.getState()` returns frozen snapshots of the bot, opponent, arena, and match status.
- `context.getInput()` returns manual keyboard, pointer, and firing input. Only `ManualBot` should need it.
- `context.move(directionX, directionY)` moves the bot for the current frame. Values are normally in the range $[-1, 1]$.
- `context.fireAt(targetX, targetY)` attempts a plasma shot and returns whether it fired.

Controllers retain this context in `start`, make decisions in optional `update(deltaTime)`, and discard timers, event listeners, and references in `stop`. They do not mutate game objects directly. The game owns physics, cooldowns, collision, damage, health, and match completion, which keeps every bot implementation on the same ruleset.

## Run

```powershell
npm start
```

Open `http://localhost:4200`.

```powershell
npm start-exe
```

Runs the Electron version.
