---
name: new-enemy-type
description: "Use when: adding a new type of enemy to the game (e.g. Boss, Suicider, Shielded)."
---

# Add New Enemy Type Skill

This skill guides the process of adding a new enemy variety to the SWARM game.

## Steps

### 1. Trace An Existing Comparable Enemy
Read its AI, the matching branch in `Enemy.js`, and its call site in `Enemy.update`. Match that AI's exact `update` arguments rather than inventing a common signature.

### 2. Create The AI Module
Create a class in `ai/` that receives its parent entity. Set movement with `parent.setMoveIntent(...)` and aiming with `parent.setLookTarget(...)`; `Enemy` owns the shared physics pass.

### 3. Register The Entity
- Add the type import, physics entry, stats, and AI construction in `Enemy.js`.
- Add the `Enemy.update` branch with only the dependencies the AI actually needs.
- Add a drawing branch and preload any new sprite. Preserve Canvas fallback rendering.
- Search `Game.js` for type-specific collision, projectile, or coordination logic that the new entity must participate in.

### 4. Register Spawning
Update `Wormhole.js` spawn limits and sequencing. If waves are round-specific, preserve existing round gates and count bookkeeping.

## Verify

Run `npm start` and trigger the relevant wave. Confirm the enemy spawns, moves at a frame-rate-independent rate, can deal and receive damage correctly, and removes itself without leaving stale references.
