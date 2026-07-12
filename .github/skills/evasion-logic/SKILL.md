# Evasion Logic Skill

Use this skill when implementing or tuning projectile evasion for AI units.

## Evasion Principles
- **Detection**: Check `bullets` array for `ownerType === 'player'`.
- **Optimization**: Don't check every frame. Use a `lastUpdateTime` vs `currentTime` check (typically 1s) to simulate "reaction time".
- **Virtual Walls**: Store a snapshot of bullet positions and velocities as "walls" to avoid.
- **Steering Vector**: 
  1. Project unit position onto the bullet's path.
  2. If projected point is ahead and within range, calculate the perpendicular vector.
  3. Apply force in the direction of the perpendicular side the unit is currently on.
- **Nerfing**: To make AI beatable, update the "perceived bullets" list only once per second.
