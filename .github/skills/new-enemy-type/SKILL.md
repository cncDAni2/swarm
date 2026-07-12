---
name: new-enemy-type
description: "Use when: adding a new type of enemy to the game (e.g. Boss, Suicider, Shielded)."
---

# Add New Enemy Type Skill

This skill guides the process of adding a new enemy variety to the SWARM game.

## Steps

### 1. Create AI Module
Create a new file in `ai/` (e.g., `ai/FastChaserAI.js`).
Implement a class with an `update` method:
```javascript
export class FastChaserAI {
    constructor(parent) {
        this.parent = parent;
    }
    update(player, enemies, currentTime, shootCallback) {
        // Logic for movement and optional shooting
    }
}
```

### 2. Update Enemy.js
In `Enemy.js`, update the `draw` method to handle the new type's visual representation (e.g., a different shape or color).

### 3. Register in Spawning System
Update `Wormhole.js` or `Game.js` to include the new type in the spawn selection logic.

## Conventions
- **Melee**: Squares
- **Rifleman**: Triangles
- **New Types**: Use distinct colors or shapes (pentagons, etc.) to differentiate.
