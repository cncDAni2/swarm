# SWARM Game - AI Agent Instructions

Welcome to the **SWARM** codebase. This is a top-down, swarm-style shooter built with vanilla JavaScript and HTML5 Canvas.

## Tech Stack
- **Language**: JavaScript (ES6 Modules)
- **Rendering**: HTML5 Canvas API
- **Platform**: Electron (for desktop distribution)
- **Local Development**:
  - Web: Requires a local HTTP server (`python -m http.server 8000`).
  - Desktop: `npm start` to run in Electron.
  - Build: `npm run build` to generate a portable Windows executable in `dist/`.

## Architecture Overview
The project follows a modular, class-based architecture to separate concerns:

- **[index.html](index.html)**: The entry point for web.
- **[main.js](main.js)**: The Electron main process entry point.
- **[Game.js](Game.js)**: The core engine. Manages the main game loop (`update`, `draw`), player state, collection of entities (enemies, bullets, explosions), and user input.
- **[Enemy.js](Enemy.js)**: Represents an enemy entity. Handles its own drawing, health, stun state, and delegates movement/combat logic to an AI module.
- **[Boss.js](Boss.js)**: A specialized entity with multiple phases, beam attacks, and minion spawning.
- **[AudioService.js](AudioService.js)**: Handles preloading and playback of game audio (lasers, explosions, ambient music).
- **[Wormhole.js](Wormhole.js)**: Handles the spawning logic for waves of enemies. Supports patterns like `duo` (Melee + Rifleman) and `flanker`.


- **[ai/](ai/)**: Contains behavior modules for different enemy types.
  - `BasicMeleeAI.js`: Chase logic with separation steering and partner protection.
  - `BasicRiflemanAI.js`: Ranged logic with projectile prediction and friendly-fire avoidance.
  - `FlankerAI.js`: Circular movement behavior.
  - `SkyPulseAI.js`: Aerial behavior firing distinct "rockets".

## Key Conventions & Patterns
- **Entity Identification**: Bullets have a `source` property to avoid hitting the entity that fired them.
- **AI Separation**: All AI classes must implement an `update` method and should be stored in the `ai/` folder.
- **Coordination**: Ground units are dynamically assigned to Riflemen as "bodyguards" by the `Game` class whenever their counts change.
- **State Management**: The `Game` class holds the master lists of all active entities.
- **Visuals**: Sprites are loaded via `preload.js` and managed in an `assets` object passed to `draw` methods.
  - `Melee`: Red square footprint.
  - `Rifleman`: Triangle with a pulsing red aura.
  - `Flanker`: Cyan circle.
  - `SkyPulse`: Blue/cyan pulsing flyer.
  - Projectiles: "motion blur" lines or rockets.

## Instructions & Skills
- **Game Engine**: See [.github/instructions/Game.js.instructions.md](.github/instructions/Game.js.instructions.md)
- **AI Modules**: See [.github/instructions/AI.instructions.md](.github/instructions/AI.instructions.md)
- **New Enemies**: Use skill `new-enemy-type` ([SKILL.md](.github/skills/new-enemy-type/SKILL.md))
- **Evasion Logic**: Use skill `evasion-logic` ([SKILL.md](.github/skills/evasion-logic/SKILL.md))
- **Projectile Prediction**: Use skill `bullet-prediction` ([SKILL.md](.github/skills/bullet-prediction/SKILL.md))

## Common Tasks
- **Adding an Enemy**: Create a new AI class in `ai/`, then update `Wormhole.js` or `Game.js` to instantiate it.
- **Adjusting Balance**: Health and damage values are currently hardcoded in `Enemy.js` and `Game.js`.
