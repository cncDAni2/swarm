# SWARM Agent Guide

SWARM is a top-down swarm shooter built with vanilla JavaScript, HTML5 Canvas, and Electron. Keep changes small and follow the existing class-based ES module structure.

## Run And Build

- `npm start`: serve the web game at `http://localhost:4200`.
- `npm start-exe`: run the Electron application.
- `npm run build`: create the portable Windows build in `dist/`.
- There is no automated test suite; `npm test` intentionally fails. After gameplay changes, run the relevant entry point and exercise the affected behavior.

## Architecture

- [Game.js](Game.js): owns the update/draw loop, input, collision handling, and master entity collections. Keep `draw` render-only.
- [Enemy.js](Enemy.js): instantiates type-specific AI, owns type stats and visuals, and applies shared forward-only tank physics from [tankPhysics.js](tankPhysics.js).
- [Wormhole.js](Wormhole.js): owns wave composition and spawn sequencing.
- [ai/](ai/): movement and combat behavior modules, plus [ai/Boss.js](ai/Boss.js), player bot logic, and shot-lane evasion helpers.
- [AudioService.js](AudioService.js), [index.html](index.html), [main.js](main.js), and [preload.js](preload.js): audio, web entry point, and Electron integration.

## Project Conventions

- Enemy type identifiers are lowercase strings: `melee`, `rifleman`, `flanker`, `sky-pulse`, and `revi`.
- Adding an enemy normally requires: an AI class in `ai/`, an import/branch plus physics/stats/visual mapping in `Enemy.js`, and a `Wormhole.js` spawn registration. Check `Game.js` too when it owns type-specific collision, projectiles, or coordination.
- AI chooses movement through `setMoveIntent` and optional `setLookTarget`; `Enemy` applies physics once after AI updates. Do not mutate position or velocity directly unless a behavior deliberately requires it, then resynchronize the forward speed.
- Bullets identify their origin using `source`; preserve this to avoid self-hits. AI fire rates and state changes use `currentTime` or `deltaTime` rather than frame counts.
- Game assets are passed to draw methods through the shared `assets` object. Keep fallback Canvas rendering functional when an asset is unavailable.

## Scoped Guidance

- Editing [Game.js](Game.js): follow [.github/instructions/Game.js.instructions.md](.github/instructions/Game.js.instructions.md).
- Editing an AI module: follow [.github/instructions/AI.instructions.md](.github/instructions/AI.instructions.md).
- Adding an enemy: use [.github/skills/new-enemy-type/SKILL.md](.github/skills/new-enemy-type/SKILL.md).
- Tuning projectile evasion: use [.github/skills/evasion-logic/SKILL.md](.github/skills/evasion-logic/SKILL.md).
- Adding predictive ranged attacks: use [.github/skills/bullet-prediction/SKILL.md](.github/skills/bullet-prediction/SKILL.md).
