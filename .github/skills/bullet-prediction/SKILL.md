# Bullet Prediction Skill

Use this skill when implementing or modifying ranged AI that needs to lead their shots based on target velocity.

## Prediction Logic
To calculate the lead position for a projectile:

1.  **Get Target Velocity**: Determine the target's current velocity normalized direction ($ux$, $uy$) and speed.
2.  **Estimate Travel Time**: Calculate the initial distance to the target divided by the projectile speed.
3.  **Iterative Refinement**:
    - Calculate a predicted position based on the initial travel time.
    - Recalculate distance to this new predicted position.
    - Update travel time and get the final target coordinates.

### Implementation Example (JavaScript)
```javascript
const playerVelLen = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
if (playerVelLen > 0.1) {
    const ux = player.vx / playerVelLen;
    const uy = player.vy / playerVelLen;
    const playerSpeed = 4.12; // Example constant

    let travelTime = distToTarget / bulletSpeed;
    let predictedX = player.x + ux * playerSpeed * travelTime;
    let predictedY = player.y + uy * playerSpeed * travelTime;
    
    const distToPredicted = Math.sqrt((predictedX - owner.x)**2 + (predictedY - owner.y)**2);
    travelTime = distToPredicted / bulletSpeed;
    
    targetX = player.x + ux * playerSpeed * travelTime;
    targetY = player.y + uy * playerSpeed * travelTime;
}
```

## Friendly Fire Avoidance
Ranged units should avoid firing if a teammate is in the line of fire.
- Use a helper like `isAnyFriendlyWithinLine(target, teammates, radius)` to check for potential collisions.
- Check a narrow radius around the vector from the shooter to the target.

## Coordinate Awareness
Ground units should only predict horizontal movement if the game is strictly 2D. In SWARM, all units are on the same plane, so simple 2D vector prediction is sufficient.
