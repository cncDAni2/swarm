---
applyTo: "ai/*.js"
---

# AI Module Instructions

When creating or modifying AI modules in the `ai/` directory:
- **Decoupling**: All logic for how an enemy moves and attacks belongs here, not in `Enemy.js`.
- **Interface**: Maintain a consistent `update` signature (e.g., `update(player, enemies, bullets, currentTime, spawnBullet)`).
- **Steering**: Use vector math for movement (separation, evasion, chasing).
- **FPS Independence**: Use timestamps or `deltaTime` for fire rates and state changes.
- **Evasion**: Ground units and flyers may need to react to player bullets. Use 1s polling (`currentTime`) for "nerfed" evasion walls when requested.
