# Evasion Logic Skill

Use this skill when implementing or tuning projectile evasion for AI units.

## Two modes

### Ground units (Melee, Rifleman) — nerfed snapshots
- **Detection**: Check `bullets` array for `ownerType === 'player'`.
- **Optimization**: Don't check every frame. Use a `lastUpdateTime` vs `currentTime` check (typically 0.2–1s) to simulate "reaction time".
- **Virtual Walls**: Store a snapshot of bullet positions and velocities as "walls" to avoid.
- **Steering Vector**:
  1. Project unit position onto the bullet's path.
  2. If projected point is ahead and within range, calculate the perpendicular vector.
  3. Apply force in the direction of the perpendicular side the unit is currently on.
- **Nerfing**: To make AI beatable, update the "perceived bullets" list only periodically.

### Agile units (Flanker, SkyPulse) — full fire-lines + dodge
Shared helpers live in [`ai/playerShotEvasion.js`](../../ai/playerShotEvasion.js).

- **Shot lanes**: On each player shot, `Game` publishes a virtual line from the player to the map edge (`createPlayerShotLane`). Duration: **400ms**. Exposed as `player.shotLanes`.
- **Always live**: These AIs read active lanes every frame (no snapshot poll).
- **Steer**: Same project-onto-line + perpendicular push as ground units.
- **Dodge**: When still inside a lane corridor and dodge cooldown is ready, start a short sideways dash at **2× maxSpeed** for ~180ms (`tryStartDodge` + `tickDodge`). Cooldown: **1000ms**. Not a teleport — physics moves them at the raised speed cap.
