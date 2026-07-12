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
- **Constructor**: Add the new type string to the `Enemy` constructor to set its base `size`, `health`, `color`, and instantiate the new AI module.
- **Draw Method**: Update the `draw` method if the new type needs specific visuals (like the Rifleman's red aura). Use the `assets` object for sprites if available.

### 3. Register in Spawning System
Update `Wormhole.js` to include the new type in a spawn pattern (`this.spawnLimits` and pattern sequence logic).


## Conventions
- **Melee**: Squares
- **Rifleman**: Triangles
- **New Types**: Use distinct colors or shapes (pentagons, etc.) to differentiate.
