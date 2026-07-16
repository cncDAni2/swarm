---
applyTo: "ai/*.js"
---

# AI Module Instructions

When creating or modifying AI modules in the `ai/` directory:
- **Decoupling**: All logic for how an enemy moves and attacks belongs here, not in `Enemy.js`.
- **Interface**: Maintain a consistent `update` signature (e.g., `update(player, enemies, bullets, currentTime, spawnBullet)`).
- **Steering**: Use vector math for movement.
  - **Separation**: Ground units should push away from each other to prevent stacking.
  - **Formations**: Ground units (Melee) are assigned a `partner` (Rifleman) by the Game engine and should stay in formation relative to them.
- **FPS Independence**: Use timestamps or `deltaTime` for fire rates and state changes.
- **Evasion**: Ground units use polled bullet snapshots ("nerfed"). Flanker/SkyPulse use live full-map player fire-lines (`player.shotLanes`, 400ms) plus a 1000ms-cooldown sideways dodge — see [evasion-logic SKILL](.github/skills/evasion-logic/SKILL.md) and `ai/playerShotEvasion.js`.
- **Ranged Combat**: Use predictive aiming for better accuracy. See [bullet-prediction SKILL](.github/skills/bullet-prediction/SKILL.md).
- **Friendly Fire**: Ground units must check if allies are in their firing line before shooting.

