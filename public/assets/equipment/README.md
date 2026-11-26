# Equipment artwork

Place transparent PNGs in this folder and register each one in `public/equipment-visuals.js` using the item's `visualKey`.

- `weapon` artwork is positioned from its normalized `grip` point at the character's hand. The hand pose, facing angle, walk bob, and attack swing are applied by the character renderer.
- `armor` artwork is centered over the torso; `boots` artwork is attached to each foot; `ring` artwork follows the weapon hand.
- Set `width` and `height` to the intended on-screen source dimensions. Optional `frames.idle` and `frames.attack` rectangles select poses from a horizontal or vertical spritesheet. A `classes` map can override artwork for a class-specific weapon shape.
- Leave transparent padding around the artwork. For weapons, draw the handle toward the bottom of an upright image and set `grip` to the handle position.

The renderer keeps a procedural fallback until a matching visual is registered, so missing artwork never appears as a detached world object.
