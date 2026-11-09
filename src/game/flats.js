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

import { CELL_SIZE } from './mifMesh.js';
import { isStillPersonArt } from './staticFolk.js';

/**
 * How tall a 102-pixel figure stands, in world units: a person, from `01PLTWLK.CFA`.
 *
 * The figure's density is the port's oldest law, and it is the one a **thing** is drawn at:
 * a chest is half a metre, a key is a hand's width, and the pile of equipment on the floor
 * (`EQUIPMEN.IMG`) is a waist-high heap.
 */
export const SPRITE_SCALE = 1.8 / 102;
/**
 * **Arena's own density for a static flat** — and it is not the wall's.
 *
 * OpenTESArena's `ArenaAnimUtils::MakeStaticKeyframeDimension` is
 * `dimension * modifier / MIFUtils::ARENA_UNITS` with `ARENA_UNITS = 128`: **128 picture pixels
 * are one voxel**, whatever the art's height, and the `.INF` record's own `F:` modifiers are what
 * make a flat 1.5× or 3× (`INFFlat::MEDIUM_SCALE` / `LARGE_SCALE`). This install's `.INF`s carry
 * no `F:` flag at all (measured 2026-10-18: zero `F:` tokens in all 93 shipped files), so the
 * multiplier is 1 and one flat pixel is 2.5 / 128 = **1.95 cm**.
 *
 * The port used the **wall's** density for every flat at or above 64 pixels instead (2.5 / 64,
 * twice as big), which is the owner's *"most fixed pngs like statues or the cooking places are
 * slightly too big"*: `SSTATUE1.IMG` (87×140) drew **5.47 m** tall, a fire pit (97×71) 2.77 m, a
 * column (80×148) 5.78 m, a boulder (92×131) 5.12 m. At Arena's own density they are 2.73 m,
 * 1.39 m, 2.89 m and 2.56 m — a statue a little over life size and a cooking fire at the knee.
 */
export const STATIC_FLAT_SCALE = CELL_SIZE / 128;

/**
 * The old name for `STATIC_FLAT_SCALE`, kept because callers and tests import it.
 * @deprecated use `STATIC_FLAT_SCALE`; a flat's density is Arena's, not a wall tile's.
 */
export const SCENERY_SCALE = STATIC_FLAT_SCALE;

/**
 * How tall a **person** is drawn, in world units: the band every standing figure is put in.
 *
 * The figure density (`SPRITE_SCALE`) assumes the art is a 102-pixel walking body, and the
 * install's static people art is not: `BARTEND.DFA` is 66 pixels and came out **1.16 m**, `MAN01`
 * 74 px → 1.31 m, `PREST1` 79 px → 1.39 m — the owner's *"npcs that should be always immobile ...
 * are too small"* — while tall frames crossed the wall threshold and grew past a person. So a
 * person is put in a **band**, not at a fixed density (Arena's own art is hand-scaled per record;
 * there is no single pixels-per-metre to read).
 *
 * **The band's floor is the walking crowd's own height, not a guess** (the owner again,
 * 2026-10-18: *"the non walking npcs are too small"*). The first band stopped at 1.55 m, and on a
 * page that is a king, a queen and a guard standing **1.55 m** where the street's walking citizens
 * are drawn at 1.8 m from their 102-pixel art (`04UNAWLK.CFA` 56×102, `05CHNWLK.CFA` 38×104) and
 * the walking watch at 2.13 m (121 px) — so every still person in the room was a head shorter than
 * the people outside it. The floor is now **1.85 m**, the crowd's own walking height (1.8 m) plus a
 * hand's breadth, and the ceiling is **2.1 m**, the walking watch's own height (a 121-pixel `GUARD`
 * walk is 2.13 m by `SPRITE_SCALE`). Measured after: `KING.IMG` 1.85, `GUARD1M.IMG` 1.85,
 * `MAN01.DFA` 1.85, `BARTEND.DFA` 1.85, `PRINCE.IMG` 1.85 — one height for a person, whatever the
 * art's own pixel count, and **never shorter than the people who walk past them**.
 *
 * **The owner, 2026-10-18: *"still npcs that dont move like the mage and much others are still
 * dwarfs"*.** The band's floor used to be 1.75 m, which is a head shorter than the 1.8 m street
 * and four heads shorter than a 2.13 m watchman: the still figures were not *wrong*, they were the
 * smallest people in the room, which reads as dwarfish next to the crowd. The floor is now the
 * crowd's own height and the ceiling the watch's, so the two halves of a town are the same size.
 * A wide record (`BEG#1.DFA`, a crouching beggar) keeps the figure density — a crouch is a crouch
 * — and is the one shape the band does not stretch.
 */
export const MIN_PERSON_HEIGHT = 1.85;
export const MAX_PERSON_HEIGHT = 2.1;
/**
 * The density a tree is drawn at when no `.INF` record is in hand: **three times a flat's**.
 *
 * This used to be the project's own guess — 9.0 world units for the tallest 148-pixel oak — and
 * the install's own bytes say the same thing exactly: the tree records in the wilderness `.INF`s
 * carry `F:12`, whose bit 2 is `largeScale`, so Arena draws them at `3 × (px / 128)` voxels. For
 * `NOAK2.IMG` that is **8.67 m**, not 9.0: the constant is now the install's law rather than a
 * guess, and `flatSize` prefers the record's own flag when the caller has one (`loadScenery`).
 */
export const TREE_SCALE = STATIC_FLAT_SCALE * 3;

/**
 * How big a flat is drawn: the tree law for the woods, the person's band for a person, the
 * object's law for the things a map *places*, and Arena's own static-flat density for the rest.
 *
 * **Three densities, and the third one is the bug this function was repaired for.** The first
 * version split on the art's own height alone — at or above a wall tile's 64 pixels took the
 * wall's density (2.5 m per 64 px), below it the figure's — which is right for landscape and
 * **wrong for everything the level puts on the floor**. Measured against the install (2026-10-16,
 * `.scratch/lootsizes.mjs`, every `*ITEM` flat record in all 93 shipped INFs): the loot art is
 * `KEY.IMG` 21×7, `DEADBODY.IMG` 90×34, `TREASRE1…3.IMG` 35×24 / 87×31 / 99×36, `CHESTC` 63×27,
 * `CHESTO` 71×29 — all below the threshold and all drawn correctly — and `EQUIPMEN.IMG` **84×72**,
 * the pile with a helm on it, which crossed it and came out **3.28 m wide and 2.81 m tall**: a
 * heap as tall as a wall and taller than the player. That is the owner's report, "the pile of
 * loot with an helm is bigger then what it should be".
 *
 * So the question is not how tall the art is but **what the flat is**: a record the map places as
 * a *thing* (it carries an `*ITEM` number — `game/dungeonItems.js`) is an object in a room and is
 * drawn at the figure's density whatever its art's height; landscape with no `*ITEM` keeps the
 * height split; and trees keep the third law that makes them a skyline.
 *
 * **And a fourth law: a person is a person.** The owner, 2026-10-17: *"GUARDS AND KINGS ARE WAY
 * TOO BIG IN THE PALACE"*. The court and the watch are *stills the level's own `.INF` places as
 * flats* (`game/staticFolk.js` is the census), so they went through the height split above: every
 * one of them is at least 64 pixels tall, and the `SCENERY_SCALE` branch drew them with a wall
 * tile's density. Measured against the install: `KING.IMG` 65×81 -> **3.16 m tall**, `QUEEN.IMG`
 * 80×83 -> **3.24 m**, `GUARD2M.IMG` 127×98 -> **3.83 m** — a guard twice the player's height,
 * standing in a throne room. At `SPRITE_SCALE` (the same 102-pixels-to-a-person density every
 * creature and townsfolk is drawn at) they are 1.43 / 1.47 / 1.73 m, which is what a person is.
 *
 * @param {number} width @param {number} height  the art's own pixels
 * @param {string} [name]  the record's own name, which is what says tree or not
 * @param {{item?: boolean, modifier?: number}} [opts]  `item` — this flat is a thing the map
 *   placed (loot, a key, a chest, a corpse), not landscape; `modifier` — the `.INF` record's own
 *   `F:` scale flag (1, 1.5 or 3, `arena/infFile.js`'s `scaleModifier`)
 * @returns {{w: number, h: number, scale: number}} world units
 */
export function flatSize(width, height, name = null, { item = false, modifier = null } = {}) {
  // **The record's own flag is the law** (`F:` bit 2 / bit 6, `arena/infFile.js`). Where a caller
  // has no record (a test, a furnished prop) a tree still answers its own three-times density and
  // everything else is one flat — the install's town INFs keep their small potted trees at 1, and
  // the wilderness's carry 3, so nothing needs a name test to be right.
  const flagged = Number(modifier) > 0 ? Number(modifier) : (isTreeArt(name) ? 3 : 1);
  const scale = isFolkArt(name) ? personScale(width, height)
    : item ? SPRITE_SCALE
    : STATIC_FLAT_SCALE * flagged;
  return { w: width * scale, h: height * scale, scale };
}

/**
 * The density a **person** is drawn at — their art's own height put in the adult band.
 *
 * An upright record (height at least its width) is scaled to sit inside
 * `MIN_PERSON_HEIGHT`…`MAX_PERSON_HEIGHT`; a **wide** record is not: `BEG#1.DFA` is 82×47 (a
 * beggar crouched with a bowl) and pulling its height to the band's floor would make him 3.0 m
 * wide. Those keep the figure density, which draws the crouch as a crouch.
 *
 * @param {number} width @param {number} height  the art's own pixels
 * @returns {number} world units per pixel
 */
export function personScale(width, height) {
  if (!(height > 0)) return SPRITE_SCALE;
  // **A wide record is a pose, not a crowd.** A crouched beggar with a bowl (`BEG#1.DFA`, 82×47)
  // keeps the figure density — pulling its height to the band's floor would make him three metres
  // wide. But "wide" is not "wider than tall": the watch's `GUARD2D.IMG` is 116×100, a guard with
  // a halberd, and it used to fall through to the same branch and stand **1.76 m** — under the
  // band's own floor and a head below the street. Anything at or under 1.4:1 is a standing figure
  // in a wide canvas and is banded like every other person.
  if (width > height * 1.4) return SPRITE_SCALE;
  const drawn = height * SPRITE_SCALE;
  if (drawn < MIN_PERSON_HEIGHT) return MIN_PERSON_HEIGHT / height;
  if (drawn > MAX_PERSON_HEIGHT) return MAX_PERSON_HEIGHT / height;
  return SPRITE_SCALE;
}

/**
 * The install's **static people** — the court, the watch and the town's still folk.
 *
 * Measured, not guessed: every one of these names is a flat texture the shipped `.INF`s bind
 * (`.scratch/flatnames.mjs` across all 93 of them, 2026-10-17 — 24 records: `BARTEND.DFA`,
 * `GUARD1/1D/1M/2/2D/2M/3/3D/3M`, `KING.IMG`, `MAN01…04`, `PRINCE.IMG`, `PRINCESS.IMG`,
 * `QUEEN.IMG`, `SMITH.DFA`, `WOMAN01…04`). `GUARD\d[DM]?` covers all three spellings the install
 * uses: `GUARD1.DFA`, `GUARD1D.IMG` and `GUARD1M.IMG`.
 *
 * A person is drawn at the figure's density whatever their art's height — see `flatSize`'s
 * fourth law. This is a *name* test for the same reason `isTreeArt` is: a shop's 127-pixel sign
 * and a 127-pixel guard are both tall, and only one of them is a man.
 *
 * @param {string|null} name  the record's own name, e.g. `KING.IMG`
 * @returns {boolean}
 */
export function isFolkArt(name) {
  // The census is `game/staticFolk.js`'s (`isStillPersonArt`), which covers **every people
  // record the shipped `.INF`s place** — the court, the watch, the town's men and women, the
  // keeper of a shop (`SMITH`), a tavern's (`BARTEND`), a temple's (`PREST`), the guild's
  // (`WIZZ`), and the trades: `JSTER`, `MUSIC`, `BEG#`, `FIREMN`, `HOKER`, `MERCH`, `SHADY`,
  // `SNAKTM`, `VENDER`. Before the census was shared this test named nine of them, so a harlot
  // or a merchant was drawn at the *scenery* density — `HOKER2.DFA` (26×114) came out **4.45 m**
  // tall while the same room's barman was 1.16 m.
  return isStillPersonArt(name);
}

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
 * @property {number} modifier  the record's own `F:` scale flag (1, 1.5 or 3), which
 *   `flatSize` multiplies a static flat's density by
 * @property {'dry'|'wet'|'lava'|true|null} chasm  the cell's own chasm kind, when its floor is one —
 *   what makes the flat a thing **standing on water** rather than on ground (`flatBaseY`)
 */

/**
 * Every flat a decoded level places.
 *
 * The order is the level's own (row-major), so the same level always produces the
 * same list — which is what lets a browser test name the tree it expects to see.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {import('../arena/infFile.js').InfFile|null} inf
 * @returns {{flats: FlatCell[], unresolved: number, animated: number, hanging: number,
 *   onWater: number, byName: Map<string, FlatCell[]>}}
 */
export function collectFlats(level, inf) {
  /** @type {FlatCell[]} */
  const flats = [];
  let unresolved = 0;
  let animated = 0;
  let hanging = 0;
  // **Nothing grows on water.** The owner, 2026-10-17: *"everywhere grass is not working cause
  // its nowhere if not floating on top of water sometimes"*. A floor flat is drawn at the room's
  // floor, and a chasm cell's floor is under the water/lava surface — so a grass tuft the map put
  // on a wet cell was drawn standing **on the water**, and one on lava stood in the lava. A chasm
  // is not ground: the flat is dropped and counted, so the page can say it did so rather than
  // drawing a field on a lake.
  let onWater = 0;
  const textures = inf?.flatTextures ?? [];
  const records = inf?.flats ?? [];

  for (const cell of level?.cells ?? []) {
    /** @type {{index: number, on: 'entity'|'floor'}|null} */
    let found = null;
    if (cell.kind === 'entity') found = { index: cell.entityFlatIndex, on: 'entity' };
    else if (cell.floor && cell.floor.flatIndex >= 0) found = { index: cell.floor.flatIndex, on: 'floor' };
    if (!found) continue;
    if (found.on === 'floor' && cell.floor?.chasm) { onWater++; continue; }

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
    // The `.INF` record's own size flag (`F:` bit 2 / bit 6, `arena/infFile.js`): the original's
    // only way to say "this flat is three times a flat", read here so a map that uses it is
    // drawn at its own size. This install uses none.
    const modifier = record?.scaleModifier ?? 1;
    flats.push({ row: cell.z, col: cell.x, flatIndex: found.index, name, on: found.on, yOffset, itemIndex, modifier,
      chasm: cell.floor?.chasm ?? null });
  }

  /** @type {Map<string, FlatCell[]>} */
  const byName = new Map();
  for (const flat of flats) {
    let list = byName.get(flat.name);
    if (!list) byName.set(flat.name, list = []);
    list.push(flat);
  }
  return { flats, unresolved, animated, hanging, onWater, byName };
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
 * @param {{height: number, floorY: number, ceilingY: number, onWater?: boolean}} room  in world
 *   units; `onWater` — the cell under the flat is a chasm (`collectFlats`'s `chasm`)
 * @returns {number} the billboard's base, i.e. the flat's bottom
 */
/**
 * **The ground a flat actually stands on** — the cell's own top, not the level's floor.
 *
 * A flat's `.INF` record gives the height of the *picture*; the surface under it belongs to the
 * **cell**, and a raised cell (`mifLevel.js`'s `kind: 'raised'`: a platform, a crate, a cart, a
 * step) has its own top above the floor. Every flat used to be based on `level.floorY` alone, so
 * anything the map painted on a raised block — the hay and grass the owner reported, a bush on a
 * platform, a camp's goods — stood at floor level and read as **floating** inside the block it was
 * meant to sit on (or sank into it, from the other side).
 *
 * The raised cell's own numbers are the mesher's (`mifMesh.js`'s `spanOf`): `floorTop + yOffset`
 * to `floorTop + yOffset + ySize`, with `floorTop` the level's own `floorY`; a flat's ground is
 * that span's **top**, converted from cells to world units (`cellSize`). Nothing is invented, and
 * a cell that is not raised answers the level's floor exactly as before.
 *
 * Water is not this function's business: a wet chasm's surface is the engine's water line
 * (`game/chasmSurface.js`), which is a different answer for a different question.
 *
 * @param {{kind?: string, yOffset?: number, ySize?: number}|null} cell  the flat's own cell
 * @param {{floorY: number, cellSize?: number}} room  `floorY` in world units
 * @returns {number} the base a standing flat sits on, in world units
 */
export function flatGroundY(cell, { floorY, cellSize = 1 } = {}) {
  if (!cell || cell.kind !== 'raised') return floorY;
  const top = (cell.yOffset ?? 0) + Math.max(0, cell.ySize ?? 0);
  return floorY + top * cellSize;
}

export function flatBaseY(yOffset, room) {
  const { height, floorY, ceilingY, onWater = false } = room;
  if (yOffset < 0) return Math.max(floorY, ceilingY - height);
  // **A flat standing on water stands ON it** — the one thing this install's `Y` does not mean
  // over a chasm. The wilderness's own records with a positive `Y` are exactly the aquatic ones:
  // `THRUSH01/02` (the corn/reeds that grow in the shallows) and `BOATSIDE`/`BOATQURT` (the
  // harbour's boats), measured across every `.RMD` the install ships — all 435 corn flats and
  // every boat sit on a wet cell. Lifted by their `Y`'s share of the room they stood **half a
  // metre over the water**, the reported *"THRUSH01 and THRUSH02 … are floating midair"*, and a
  // boat hovered over its own harbour. The surface is the ground those pictures are drawn from,
  // so the offset has nothing to lift them off and the base is the water line itself.
  if (onWater) return floorY;
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
