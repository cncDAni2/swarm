---
applyTo: "Game.js"
---

# Game.js Editing Instructions

When editing the main `Game` class:
- **Performance**: Keep the `draw` call pure-render. Do not update state in `draw`.
- **DeltaTime**: Always use `deltaTime` (passed to `update`) for movement and animations to ensure FPS independence.
- **Input**: User input (keys, mouse) is tracked via event listeners established in the constructor. Access them through `this.keys`, `this.isMouseDown`, and `this.mousePos`.
- **Entity Lifecycle**: Use `splice` in reverse loops or filter for removing entities (bullets, enemies, explosions).
