// Add one entry for each finished transparent PNG. Keep the PNGs in
// public/assets/equipment and use the item's visualKey as the object key.
// Coordinates and dimensions are in source-image pixels.
//
// Example:
// "starter_blade": {
//   slot: "weapon",
//   src: "/assets/equipment/starter-blade.png",
//   width: 54,
//   height: 92,
//   grip: { x: 0.5, y: 0.88 }, // normalized point held by the hand
//   rotationOffset: 0,          // radians from the item's default pose
//   classes: { archer: { src: "/assets/equipment/weapons/starter-bow.png" } }, // optional class-specific variant
//   frames: {                   // optional spritesheet rectangles
//     idle: { x: 0, y: 0, w: 54, h: 92 },
//     attack: { x: 54, y: 0, w: 54, h: 92 }
//   }
// }
export const EQUIPMENT_VISUALS = Object.freeze({});
