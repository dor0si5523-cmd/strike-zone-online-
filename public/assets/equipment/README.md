# Equipment artwork

Place transparent PNGs in this folder and register each one in `public/equipment-visuals.js` using the item's `visualKey`.

- `weapon` artwork is positioned from its normalized `grip` point at the character's hand. The hand pose, facing angle, walk bob, and attack swing are applied by the character renderer.
- `armor` artwork is centered over the torso; `boots` artwork is attached to each foot; `ring` artwork follows the weapon hand.
- Set `width` and `height` to the intended on-screen source dimensions. Optional `frames.idle` and `frames.attack` rectangles select poses from a horizontal or vertical spritesheet. A `classes` map can override artwork for a class-specific weapon shape.
- Leave transparent padding around the artwork. For weapons, draw the handle toward the bottom of an upright image and set `grip` to the handle position.

The renderer keeps a procedural fallback until a matching visual is registered, so missing artwork never appears as a detached world object.


## Archer bow catalog

The 30 archer weapon keys are registered in `public/equipment-visuals.js`: the five existing bows are the Rare set, and 25 individually generated framed icons fill the Epic, Unique, Legendary, Mythic, and Immortal sets. Gacha results save the selected appearance key, and that same key drives the inventory icon and equipped weapon image. Icon frame colors are blue, purple, yellow, green, white, and red by tier. Optimized WebP artwork is in `bows/`.

## Shared armor appearance catalog

`public/equipment-visuals.js` registers 30 shared chest armor variants under `armor_<rarity>_<number>` keys. Each icon has a tier-colored frame for inventory display; the character renderer crops the central artwork when the armor is equipped. PNG icons are 256 × 256 with transparent padding.

