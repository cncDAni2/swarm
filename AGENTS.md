# SWARM Game - AI Agent Instructions

Welcome to the **SWARM** codebase. This is a top-down, swarm-style shooter built with vanilla JavaScript and HTML5 Canvas.

## Tech Stack
- **Language**: JavaScript (ES6 Modules)
- **Rendering**: HTML5 Canvas API
- **Local Development**: Requires a local HTTP server due to ES6 Module CORS requirements.
  - Recommended: `python -m http.server 8000`
  - Workspace includes a Debug configuration for Chrome on `localhost:8000`.

## Architecture Overview
The project follows a modular, class-based architecture to separate concerns:

- **[index.html](index.html)**: The entry point. Initializes the canvas and the `Game` instance.
- **[Game.js](Game.js)**: The core engine. Manages the main game loop (`update`, `draw`), player state, collection of entities (enemies, bullets, explosions), and user input.
- **[Enemy.js](Enemy.js)**: Represents an enemy entity. Handles its own drawing, health, stun state, and delegates movement/combat logic to an AI module.
- **[Wormhole.js](Wormhole.js)**: Handles the spawning logic for waves of enemies.
- **[ai/](ai/)**: Contains behavior modules for different enemy types.
  - `BasicMeleeAI.js`: Chase logic with separation steering.
  - `BasicRiflemanAI.js`: Ranged logic with projectile prediction and friendly-fire avoidance.

## Key Conventions & Patterns
- **Entity Identification**: Bullets have a `source` property to avoid hitting the entity that fired them.
- **AI Separation**: All AI classes must implement an `update` method and should be stored in the `ai/` folder.
- **State Management**: The `Game` class holds the master lists of all active entities.
- **Visuals**:
  - `Melee` enemies: squares (red).
  - `Rifleman` enemies: triangles (dark red).
  - `Flanker` enemies: circles (cyan).
  - `SkyPulse` flyer: pulsing circle (blue/cyan).
  - Projectiles: "motion blur" lines or distinct "rockets" (SkyPulse).

## Instructions & Skills
- **Game Engine**: See [.github/instructions/Game.js.instructions.md](.github/instructions/Game.js.instructions.md)
- **AI Modules**: See [.github/instructions/AI.instructions.md](.github/instructions/AI.instructions.md)
- **New Enemies**: Use skill `new-enemy-type` ([SKILL.md](.github/skills/new-enemy-type/SKILL.md))
- **Evasion Logic**: Use skill `evasion-logic` ([SKILL.md](.github/skills/evasion-logic/SKILL.md))

## Common Tasks
- **Adding an Enemy**: Create a new AI class in `ai/`, then update `Wormhole.js` or `Game.js` to instantiate it.
- **Adjusting Balance**: Health and damage values are currently hardcoded in `Enemy.js` and `Game.js`.
