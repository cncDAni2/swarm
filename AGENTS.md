# SWARM Agent Guide

## Start Here

- Read [readme.md](readme.md) for the bot API and the supported run workflow.
- Treat [index.html](index.html) as the browser entry point and owner of setup UI, bot selection, canvas sizing, and the animation loop.
- Treat [Game.js](Game.js) as the owner of arena state, physics, rendering, combat rules, and controller lifecycle.
- Treat [bots/BotRegistry.js](bots/BotRegistry.js) as the single source of truth for selectable bots. Do not hard-code bot lists elsewhere.
- [main.js](main.js) is the CommonJS Electron entry point; game and bot files are browser ES modules.

## Commands

- Install dependencies: `npm install`
- Run in a browser at `http://localhost:4200`: `npm start`
- Run the Electron app: `npm run start-exe`
- Build the Windows portable app into `dist/`: `npm run build`
- There is no automated test suite. `npm test` is an intentionally failing placeholder and is not a validation command.

For each changed browser module, check ES module syntax from PowerShell:

```powershell
Get-Content -Raw Game.js | node --input-type=module --check
Get-Content -Raw bots/BotRegistry.js | node --input-type=module --check
```

Replace the path with each changed browser module. Check the Electron entry point with `node --check main.js`.

## Bot Contract

- Every selectable bot extends `BotController`, declares a unique non-empty `static id` and `static displayName`, implements `start(context)` and `stop()`, and is imported and registered in `BotRegistry.js`.
- Use optional `update(deltaTime)` for per-frame decisions. Store the supplied context in `start` and release references, listeners, timers, and pending work in `stop`.
- Controllers use only the frozen context API: `getState()`, `getInput()`, `move()`, and `fireAt()`. They must not mutate game objects or reproduce physics, cooldown, collision, damage, or match-end logic.
- Keep bot selectors registry-driven. The UI rule allowing at most one `manual` bot belongs in `index.html`.
- Preserve context method signatures and snapshot shapes unless the task explicitly changes the bot API.

## Change Rules

- Preserve existing gameplay and assets unless the request explicitly changes them. In particular, keep both health bars, shooting audio, combat damage behavior, and the image crosshair at `assets/chosshair.png`; do not replace existing assets with improvised drawings.
- Keep browser code free of Node.js APIs. Electron runs with `nodeIntegration: false` and `contextIsolation: true`.
- Follow the existing vanilla JavaScript style: 4-space indentation, single quotes, semicolons, named exports, and no framework or dependency for behavior the platform already provides.
- Keep timing frame-rate independent. `deltaTime` and `getState().time` are milliseconds, and `Game` owns frame clamping and movement scaling.
- For gameplay or UI changes, run the browser version and verify both selectors populate, Manual controls still move and fire, damage updates health, the winner screen appears, and the browser console stays clean.
