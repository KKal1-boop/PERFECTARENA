// THE FLATS — EVERYTHING THAT STANDS ON THE GROUND AND IS NOT A WALL.
//
// Arena's world is a voxel grid, and two of its layers carry a *flat*: a
// camera-facing picture the level draws instead of geometry.
//
//   `MAP1` nibble `0x8`   an **entity**: a tree, a rock, a bush, a gravestone, a
//                         column — the wilderness's whole landscape. `flatIndex =
//                         id & 0xFF` (so `0x8000` is index 0 and `0x8019` is 25).
//   `FLOR` low byte       a flat **lying on the floor**: street furniture, bones,
//                         a corpse. `flatIndex = (id & 0xFF) - 1`.
//
// Both index the *level's own* `.INF`, whose `@FLATS` block names each one's art and
// each is not the same list in every climate: `TWN.INF`'s indices 11…16 are
// `NFIR1`, `NFIR2`, `NOAK2`, `NOAK3`, `NOAK4`, `NPINE4` — temperate trees — while
// `DWN.INF` puts `CACTUS1…3` and `PALM1…3` in the same slots. So a block of the
// wilderness is a pine wood in High Rock's mountains and a cactus flat in
// Hammerfell, from one set of `.RMD` records: **the province variety of the
// landscape is the INF's, not the map's** (docs/FORMATS.md §7).
//
// Measured against the shipped files (`tools/wild-dump.mjs --blocks`): every flat
// index a wilderness block uses (11…16, 24…25, 33, 40…41, 48…49) resolves in the
// wilderness INFs, and the art is real — `NOAK2.IMG` is 70×148 pixels, `NFIR1.IMG`
// 68×132, `NROCK1.IMG` 22×6. Two records are `.DFA` (animated flames) rather than
// `.IMG`, which this project does not decode; those flats are counted and left
// undrawn rather than drawn wrong.
//
// The size law is the figures' law (`scenes/interior.js`'s `SPRITE_SCALE`): Arena's
// art is pixel art at roughly 102 pixels to a person, so a 148-pixel oak stands
// about 2.6 world units against the player's 1.8.
//
// ## Where a flat sits, which is what its own `Y` is for
//
// Each `*FLAT` record carries a `Y` (`infFile.js`), and it is **not** decoration:
//
//   * **negative** → the flat **hangs from the room's ceiling**. This is measured, not
//     assumed: across every `.INF` in `GLOBAL.BSA` the only records with a negative `Y`
//     are `ROOTS*`, `CHAINS*` and `CHAOS*` — roots, chains, and a dangling flame — at
//     −25, −35, −50, −60, −75 and −100. The first version of the scene ignored the
//     field and stood every flat on the floor, which is the reported "floating pngs in
//     dungeons that should be attached to the ceiling": a ceiling chain was drawn on
//     the ground, in the middle of the room.
//   * **non-negative** → the flat stands on the floor, lifted by that much of the room's
//     own height (trees carry 5, bushes and boulders 0 or 1).
//
// `flatBaseY` below is the rule in code, and the scene passes its answer straight to the
// billboard batch.

/**
 * @typedef {object} FlatCell
 * @property {number} row
 * @property {number} col
 * @property {number} flatIndex   index into the level's `.INF` flat tables
 * @property {string|null} name   the art's record name, e.g. `NOAK2.IMG`
 * @property {'entity'|'floor'} on  which layer carried it
 * @property {number} yOffset     the `.INF` record's own `Y`: **negative means it hangs**
 *   from the room's ceiling (see `inside.js`'s flat heights and `docs/FORMATS.md`)
 * @property {number|null} itemIndex  the record's own `*ITEM` number, when it has one —
 *   which is what makes a flat a **thing** rather than scenery: a monster's spawn, a
 *   chest, a key, a corpse (`game/dungeonItems.js` carries the table)
 */

/**
 * Every flat a decoded level places.
 *
 * The order is the level's own (row-major), so the same level always produces the
 * same list — which is what lets a browser test name the tree it expects to see.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {import('../arena/infFile.js').InfFile|null} inf
 * @returns {{flats: FlatCell[], unresolved: number, animated: number, hanging: number, byName: Map<string, FlatCell[]>}}
 */
export function collectFlats(level, inf) {
  /** @type {FlatCell[]} */
  const flats = [];
  let unresolved = 0;
  let animated = 0;
  let hanging = 0;
  const textures = inf?.flatTextures ?? [];
  const records = inf?.flats ?? [];

  for (const cell of level?.cells ?? []) {
    /** @type {{index: number, on: 'entity'|'floor'}|null} */
    let found = null;
    if (cell.kind === 'entity') found = { index: cell.entityFlatIndex, on: 'entity' };
    else if (cell.floor && cell.floor.flatIndex >= 0) found = { index: cell.floor.flatIndex, on: 'floor' };
    if (!found) continue;

    const record = records[found.index];
    const name = record ? textures[record.textureIndex] ?? null : textures[found.index] ?? null;
    if (!name) { unresolved++; continue; }
    if (name.endsWith('.DFA')) animated++; // Kept for animated scenery/loot decoding.
    // The record's own `Y`. Measured across every `.INF` this install ships, the ONLY
    // flats with a negative one are `ROOTS*`, `CHAINS*` and `CHAOS*` — the things a
    // dungeon hangs from its ceiling (values −25, −35, −50, −60, −75, −100), which is the
    // original's own way of saying "drawn higher than the floor".
    const yOffset = record?.yOffset ?? 0;
    if (yOffset < 0) hanging++;
    // The record's `*ITEM`, when it has one: the map's own statement that this flat is a
    // monster's spawn, a chest, a key or a corpse (`game/dungeonItems.js`).
    const itemIndex = record?.itemIndex ?? null;
    flats.push({ row: cell.z, col: cell.x, flatIndex: found.index, name, on: found.on, yOffset, itemIndex });
  }

  /** @type {Map<string, FlatCell[]>} */
  const byName = new Map();
  for (const flat of flats) {
    let list = byName.get(flat.name);
    if (!list) byName.set(flat.name, list = []);
    list.push(flat);
  }
  return { flats, unresolved, animated, hanging, byName };
}

/**
 * Where a flat's own **base** sits, in world units — which is what a billboard batch places.
 *
 * The renderer is bottom-anchored: `createBillboardBatch`'s `centers` are the quad's BASE
 * and the billboard shader lifts it by the art's full height (`(
 * aCorner.y + 0.5) * uSize.y`, “Bottom-anchored: centre sits half a height above the placement
 * base”, `renderer.js`). This function answers in the same terms, which is what the scene
 * passes straight through.
 *
 * Arena says the height per flat, in the `.INF` record's `Y` (`collectFlats` carries it):
 *
 *   * **negative — it hangs from the ceiling.** `ROOTS`, `CHAINS` and `CHAOS` are the
 *     only records in the whole install that carry one (−25 … −100), and they are exactly
 *     the things a dungeon hangs overhead. The picture's **top** is pinned to the room's
 *     ceiling, so its base is one height below the ceiling. Standing them on the floor
 *     instead is the reported "floating pngs in dungeons that should be attached to the
 *     ceiling": a ceiling chain drawn on the ground, in mid-room.
 *   * **non-negative — it stands on the floor**, lifted by that share of the room's own
 *     height: trees carry 5 and bushes 0 or 1, which is a few centimetres on a wilderness
 *     cell.
 *
 * **Why this is a base and not a middle.** The first version of this function answered with
 * the art's *middle* (`floorY + height / 2`), because a batch's `centers` read as "where the
 * quad is centred". They are not — the shader lifts every quad by half a height itself — so
 * the middle became a base and **every standing flat in the game floated half its own height**
 * above the ground: the reported "trees, pillars and statues are floating", a 148-pixel oak
 * hovering 2.6 world units over its cell, and every hanging flat poking half its height up
 * **through the ceiling**. One law, both symptoms: the base is the floor for a standing flat
 * and the ceiling minus the art's height for a hanging one.
 *
 * @param {number} yOffset  the `.INF` flat record's `Y`
 * @param {{height: number, floorY: number, ceilingY: number}} room  in world units
 * @returns {number} the billboard's base, i.e. the flat's bottom
 */
export function flatBaseY(yOffset, room) {
  const { height, floorY, ceilingY } = room;
  if (yOffset < 0) return Math.max(floorY, ceilingY - height);
  if (!yOffset) return floorY;
  return floorY + Math.max(0, ceilingY - floorY) * (yOffset / 100);
}

/**
 * Is this record *a tree* — the landscape's tall things, across every climate?
 *
 * Measured against the archive (`.scratch/tree-names.mjs`): each climate prefixes its
 * own trees on the same three species — temperate `NOAK*`/`NFIR*`/`NPINE*`, snow `SOAK*`/
 * `SFIR*`/`SPINE*`, desert `WOAK*` (and `CACTUS*`/`PALM*`), jungle `KOAK*`, swamp `FOAK*` —
 * and a handful of generic `TREE*.IMG` records stand around the world maps. This is a
 * *name* test, not a size test: statues and columns are climate-neutral big flats and
 * are NOT trees, while a 69-pixel sapling (`NPINE2.IMG`, 44×69) IS one.
 *
 * @param {string|null} name  the record's own name, e.g. `NOAK2.IMG`
 * @returns {boolean}
 */
export function isTreeArt(name) {
  const stem = String(name ?? '').toUpperCase().replace(/\.IMG$/, '');
  return /^(?:[NSWKF](?:FIR|OAK|PINE)|CACTUS|PALM|TREE)\d*$/.test(stem);
}

/**
 * How many distinct pictures a level's flats need.
 *
 * @param {FlatCell[]} flats
 * @returns {string[]} sorted record names
 */
export function flatRecordNames(flats) {
  return [...new Set(flats.map((f) => f.name))].sort();
}
