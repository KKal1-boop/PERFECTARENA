// ENTERING A BUILDING — FROM THE SIGN OVER THE DOOR TO THE ROOM BEHIND IT.
//
// A city is assembled (`game/cityPlan.js`) from a skeleton plus a grid of 20×20 block
// `.MIF`s. Its buildings carry no `0xB` door **leaves** — measured, and `TCN.INF` declares
// no `*DOOR` — but they are full of **wall voxels painted with door art**: `T_DEQ.IMG`,
// `T_DTAV.IMG`, `T_DBS1..3.IMG`, `T_DNB1.IMG` and the rest. Those cells are the doors the
// player sees, and they are where a player presses `E`.
//
// **The hanging sign is not the door.** The first version of this module read the `0xA`
// **edge** cells instead — the laundry sign, the shop sign, the little sprite hanging over
// a doorway — because a city block has no `0xB` leaf and the sign was the only marker the
// decoder named. That made the way into a house a piece of washing, and left every real
// door on every wall a solid wall; the owner reported it exactly: *"all doors in the game
// should be enterable and i mean the texture of a door on a wall instead the houses and
// royal palaces are linked to a weird little sprite that is the clothes hanging to dry"*.
//
// OpenTESArena, this project's standing reference for the numbers in `A.EXE`, reads both
// **walls and edges**, and a wall is the case that matters (`World/MapGeneration.cpp`'s
// `tryMakeVoxelTransitionDefGenInfo`): a wall voxel is `mostSigByte === leastSigByte`, its
// texture is `mostSigByte − 1`, and the `.INF`'s own `*MENU` table says which interior that
// texture opens (`INFFile::getMenuIndex`). The signs the blocks also draw are the **pair**
// entries after each menu slot (`T_TEQ`, `T_TTAV`, …); they are not in the menu table, so
// the reference does not treat them as transitions — they are decoration, exactly as they
// read to a player.
//
// Three things are measured from the player's own archive, not assumed:
//
//   1. **The city `.INF` declares what each sign means.** Every city `.INF` — all eleven
//      of them — carries the same fourteen `*MENU` slots bound to the same indices of its
//      texture table, and the sign art's own filename names the shop:
//
//        slot 0 → index 5  `T_DEQ.IMG`   equipment      slot 4,5,6 → 30,35,40  `T_DBS1..3`
//        slot 1 → index 10 `T_DTAV.IMG`  tavern         slot 7,8   → 44,45     `T_DLGT/_RGT`
//        slot 2 → index 16 `T_DMU.IMG`   Mages Guild    slot 9     → 53        `T_DNB1.IMG`
//        slot 3 → index 23 `T_DTEP.IMG`  temple         slot 11,12 → 51,52     books
//                                                      slot 13    → 50        the gate
//
//      Slot 0's index **6** is the second equipment sign (`T_TEQ.IMG`) and it is the one
//      the blocks actually draw — so a slot binds *two* consecutive indices, the `D` art
//      and the `T` art, and both mean the same shop. Checked for every slot: the entry
//      after a bound index is another `.IMG` for the shops and a `.SET` sheet for the
//      houses, which is why the pair rule is applied only where the next entry is art.
//
//   2. **Which doors the blocks use, and which they only decorate.** All 368 block
//      `.MIF`s were walked: their **wall door art** carries exactly eight indices — 5
//      (`T_DEQ`, 167 cells), 10 (`T_DTAV`, 190), 16 (`T_DMU`, 54), 23 (`T_DTEP`, 84),
//      30/35/40 (`T_DBS1..3`, 3 607 between them) and 53 (`T_DNB1`, 180) — and their
//      **edge signs** carry exactly five: 6 (`T_TEQ`), 11 (`T_TTAV`), 17 (`T_TMU`), 24 (`T_TTEP`)
//      and 47 (`TLAUNDRY`). There is one equipment sign per equipment door (23 vs 23 in a
//      city), one tavern sign per tavern door (19 vs 19), one temple sign per temple door
//      (5 vs 5) — and **345 house doors with only 60 laundry signs between them**, because
//      a sign hangs over a shop, not over every home. The wall's own art is the law.
//
//   3. **What is behind it.** `GLOBAL.BSA` holds **eight** interiors of each kind —
//      `EQUIP1..8`, `MAGE1..8`, `NOBLE1..8`, `TAVERN1..8`, `TEMPLE1..8`, `BS1..8`,
//      `TOWER1..8` and `WCRYPT1..8` — each with its own `.INF` (`EQUIP.INF`, `MAGE.INF`,
//      `TAVERN.INF`, `TEMPLE.INF`, `NOBLE.INF`, `BS1.INF`, …) and each with a real entry
//      position: `EQUIP1.MIF` is a 25×25 shop whose file start point is the bottom of the
//      entry corridor, and `NOBLE1.MIF` enters on its own third level (`startingLevelIndex`
//      2), because the ground floor of a house is the *last* level in these files.
//
// ## What is reconstructed, and why
//
// `A.EXE` is absent from the data set (D11/D5), and it is where the original keeps both
// the sign table and the block → interior table. What is derived here therefore keeps to
// the data's own numbers:
//
//   * **The shop kind comes from the door's own art**, by the `.INF`'s own `*MENU` slots
//     (`INFFile::getMenuIndex`): slot 0 equipment, 1 tavern, 2 Mages Guild, 3 temple,
//     4/5/6 a house, 9 a noble house, and 11/12/13 the palace (the reference's table).
//   * **Which of the eight interiors** comes from the block's own number in its file name
//     (`EQBD9A.MIF` → variation 9, rotation A): `1 + ((variation - 1 + rotation) % 8)`.
//     There is no table in the data that maps 13 equipment blocks onto 8 equipment
//     interiors, so the draw is the block's, which keeps two equipment shops in one city
//     from being the same room whenever their blocks differ.
//   * **A door the table does not bind but whose art is a door** is still a door: the
//     fallback is **a house**, because that is what a door with no shop behind it is in
//     Arena. This is the last resort for another install's art, not a path this archive
//     takes — every wall door it draws is bound to a menu slot.
//
// A fence, a bridge, a bookstand, the gate and every hanging sign are edges too, and none
// of them is a door: `T_NBRIDG.IMG`, `T_CITYWL.IMG`, `T_TEQ.IMG`, `TLAUNDRY.IMG` and
// `PGATE.IMG` are drawn but open nothing. The city gate is its own transition (the opening
// in the outermost wall, `mifLevel.openSettlementGate`), not a `*MENU` door.

import { CITY_BLOCK_SIZE } from './tables/cityBlocks.js';

/**
 * The shop kind each of the `.INF`'s `*MENU` slots names.
 *
 * The slot numbers are Arena's; the names are the sign art's own abbreviations
 * (`EQ`, `TAV`, `MU`, `TEP`, `BS1..3`, `NB1`) read off all eleven city `.INF`s.
 *
 * @type {Readonly<Record<number, string>>}
 */
export const MENU_SLOT_KINDS = Object.freeze({
  0: 'equipment', 1: 'tavern', 2: 'mages', 3: 'temple', 4: 'house', 5: 'house', 6: 'house', 9: 'noble',
});

/**
 * **The interior a `*MENU` slot opens** — OpenTESArena's own city table, number for number.
 *
 * `MapGeneration.cpp`'s `tryGetInteriorTypeFromMenuIndex` (MapType::City): 0 equipment, 1
 * tavern, 2 Mages Guild, 3 temple, 4–6 house, 9 noble, 11–13 palace. Slots 7 and 8 are the
 * city gate and 10 opens nothing; those are not entries here.
 *
 * This is deliberately **not** `MENU_SLOT_KINDS`: that table is the *sign* law, where the
 * pair entry after a menu index (`T_TEQ` after `T_DEQ`) is the same shop's sign. A door is
 * bound by the slot itself and nothing else, exactly as `INFFile::getMenuIndex` finds it.
 *
 * @type {Readonly<Record<number, string>>}
 */
export const MENU_SLOT_INTERIORS = Object.freeze({
  0: 'equipment', 1: 'tavern', 2: 'mages', 3: 'temple',
  4: 'house', 5: 'house', 6: 'house', 9: 'noble',
  11: 'palace', 12: 'palace', 13: 'palace',
});

/**
 * **The country's `*MENU` table** — the wilderness INFs' own slots, number for number.
 *
 * Measured on this install's nine wilderness INFs (`TWN`, `TWS`, `TWR`, `DWN`, `DWS`,
 * `DWR`, `MWN`, `MWS`, `MWR`), which all carry the same fifteen slots and name their art
 * with the install's own abbreviations: 1 `TZDCRYPT.IMG`, 2 `TZDFARM.IMG`, 3 `TZDTAV.IMG`,
 * 4 `TZDTEP.IMG`, 5 `TZDTOWER.IMG`. That is OpenTESArena's `MapType::Wilderness` table
 * (`MapGeneration.cpp`: 1 crypt, 2 house, 3 tavern, 4 temple, 5 tower), read off the data
 * rather than copied.
 *
 * Three entries are this project's reading rather than the reference's:
 *
 * * **Slot 0 is the barn door** (`TZDBARN.IMG`), which the reference maps to *none*. The
 *   owner's law is that every door painted on a wall is enterable, and a barn is a
 *   building with a door — so it opens **a house** rather than nothing. (It is the farm's
 *   own outbuilding; the farmhouse is slot 2, a house like it.)
 * * **Slots 6 and 7 are the city gate's two posts** (`TZDLGT`/`TZDRGT`), which are the
 *   gate and not a door (`isCityGateMenuIndex`), so they open nothing.
 * * **Slots 8 and 9 are the wilderness dungeon mouth** (`WDUNGDR1/2.IMG`), which this
 *   project already draws as a flat and enters through the ruin (`dungeonSurface.js`), so
 *   they are not listed here: one door must not have two mechanisms.
 *
 * @type {Readonly<Record<number, string>>}
 */
export const MENU_SLOT_WILDERNESS = Object.freeze({
  0: 'house', 1: 'crypt', 2: 'house', 3: 'tavern', 4: 'temple', 5: 'tower',
});

/**
 * The interior a **door's own art** opens, or null.
 *
 * The reference's law, in one function: `getMenuIndex(textureIndex)` is the `.INF`'s
 * `*MENU` table asked which slot (if any) binds this texture, and the slot names the room.
 * A texture that no slot binds — a sign, a hedge, a bridge — opens nothing.
 *
 * **The table is the level's own**: a city reads `MENU_SLOT_INTERIORS`, the country reads
 * `MENU_SLOT_WILDERNESS`. The slot numbers are the same numbers either way — which is
 * exactly why the wrong table silently answers a door that is not there.
 *
 * @param {import('../arena/infFile.js').InfFile|null} inf
 * @param {number} textureIndex  a resolved voxel texture index
 * @param {'city'|'wilderness'} [mapType]
 * @returns {string|null} a `SHOP_KINDS` key
 */
export function interiorKindOfTexture(inf, textureIndex, mapType = 'city') {
  const index = Number(textureIndex);
  if (!Number.isFinite(index) || index < 0) return null;
  const slot = (inf?.menus ?? []).indexOf(index);
  if (slot < 0) return null;
  const table = mapType === 'wilderness' ? MENU_SLOT_WILDERNESS : MENU_SLOT_INTERIORS;
  return table[slot] ?? null;
}

/**
 * The street cell a wall door is opened from: the first walkable neighbour.
 *
 * A city door is a **wall** cell, so the player can never stand in it — the body that opens
 * it stands on the paving in front. A door's other three sides are the building it belongs
 * to, so in a real block this is one cell and it is the street; `< 1 %` of a city's doors
 * face another wall and answer null, and those are reported rather than invented.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {number} row
 * @param {number} col
 * @returns {{row: number, col: number}|null}
 */
export function doorStand(level, row, col) {
  if (!level?.cells?.length) return null;
  const at = (r, c) => (r < 0 || c < 0 || r >= level.depth || c >= level.width
    ? null : level.cells[r * level.width + c]);
  for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const cell = at(row + dr, col + dc);
    if (cell && !cell.solid && !cell.floor?.chasm) return { row: row + dr, col: col + dc };
  }
  return null;
}

/**
 * The shops, and what a player meets behind each door.
 *
 * `family` is the interior `.MIF`'s stem in `GLOBAL.BSA`; `bank` is the shopkeeper's own
 * line bank (`arena/arenaText.js`'s `library.service`), or `null` where the install has no
 * bank for that kind — a temple, a noble house and a house have no shopkeeper file of
 * their own, and their keeper speaks the town's talk instead.
 *
 * @type {Readonly<Record<string, {name: string, family: string, bank: string|null}>>}
 */
export const SHOP_KINDS = Object.freeze({
  equipment: { name: 'an equipment store', family: 'EQUIP', bank: 'equip.dat' },
  tavern: { name: 'a tavern', family: 'TAVERN', bank: 'tavern.dat' },
  mages: { name: 'a Mages Guild', family: 'MAGE', bank: 'muguild.dat' },
  temple: { name: 'a temple', family: 'TEMPLE', bank: null },
  house: { name: 'a house', family: 'BS', bank: null },
  noble: { name: 'a noble house', family: 'NOBLE', bank: null },
  // **The country's own two** (D-51's country half): a wilderness crypt and a wilderness
  // tower are buildings with doors and their own interiors (`WCRYPT1…8.MIF`, `TOWER1…8.MIF`),
  // and neither is a trade — a tomb has no counter and a tower keeps no hours.
  crypt: { name: 'a crypt', family: 'WCRYPT', bank: null },
  tower: { name: 'a tower', family: 'TOWER', bank: null },
  // **The ruler's hall** (`PALACE1…5.MIF`, the install's own throne-room interiors), which every
  // city-state has and no village does — the owner, 2026-10-17: *"all main cities and not
  // villages need to have palaces with conts/JARLS"*. Its family has five variants, not eight
  // (`PALACE_VARIANTS`), and no shopkeeper bank: the court speaks the town's talk.
  palace: { name: 'the palace', family: 'PALACE', bank: null },
});

/** How many interiors of each family the archive holds (`EQUIP1..8` and friends). */
export const INTERIOR_VARIANTS = 8;

/** How many palace interiors the archive ships: `PALACE1.MIF`…`PALACE5.MIF`. */
export const PALACE_VARIANTS = 5;

/**
 * The interior `.MIF` behind a shop door.
 *
 * @param {string} family  `EQUIP`, `TAVERN`, …
 * @param {number} index   1…8
 * @returns {string} e.g. `EQUIP3.MIF`
 */
export function interiorMifName(family, index) {
  const n = Math.max(1, Math.min(INTERIOR_VARIANTS, Math.trunc(Number(index) || 1)));
  return `${family}${n}.MIF`;
}

/**
 * A block `.MIF`'s own number: `EQBD9A.MIF` → code `EQ`, variation 9, rotation `A`.
 *
 * @param {string} name
 * @returns {{code: string, variation: number, rotation: string, rotationIndex: number}|null}
 */
export function parseBlockName(name) {
  const match = /^([A-Z]{2})BD(\d+)([A-D])?\.MIF$/i.exec(String(name ?? ''));
  if (!match) return null;
  const rotation = (match[3] ?? 'A').toUpperCase();
  return {
    code: match[1].toUpperCase(),
    variation: Number(match[2]),
    rotation,
    rotationIndex: Math.max(0, 'ABCD'.indexOf(rotation)),
  };
}

/**
 * The shop an interior file *is*, e.g. `TAVERN2.MIF` → the tavern entry of `SHOP_KINDS`.
 *
 * Used by the page that is **inside** a building, which was handed a `.MIF` name and
 * nothing else: the stem names the family, and the family names the shop.
 *
 * @param {string} mifName  e.g. `EQUIP3.MIF`
 * @returns {{kind: string, name: string, family: string, bank: string|null, variant: number}|null}
 */
export function shopForInteriorFile(mifName) {
  const match = /^([A-Z]+)(\d+)\.MIF$/i.exec(String(mifName ?? ''));
  if (!match) return null;
  const family = match[1].toUpperCase();
  const kind = Object.keys(SHOP_KINDS).find((k) => SHOP_KINDS[k].family === family) ?? null;
  if (!kind) return null;
  return { kind, ...SHOP_KINDS[kind], variant: Number(match[2]) };
}

/**
 * Which of the eight interiors a block's door leads into (**RECONSTRUCTED**, see above).
 *
 * @param {string} blockMifName  e.g. `EQBD9A.MIF`
 * @returns {number} 1…8
 */
export function interiorIndexForBlock(blockMifName) {
  const block = parseBlockName(blockMifName);
  if (!block) return 1;
  const offset = (block.variation - 1 + block.rotationIndex) % INTERIOR_VARIANTS;
  return ((offset % INTERIOR_VARIANTS) + INTERIOR_VARIANTS) % INTERIOR_VARIANTS + 1;
}

/** The art names that say "a house's business" rather than a shop of their own. */
const HOUSE_SIGN_ART = /LAUND/i;

/**
 * The texture index → shop kind map an `.INF` implies.
 *
 * A slot binds its own index **and** the next one when that next entry is an image: the
 * `T_D…` art is what the table names and the `T_T…` art is what the blocks draw, and they
 * are the same shop. Where the entry after a slot is a `.SET` sheet (the house slots) or
 * where the next index belongs to another slot (the left/right signposts at 44/45) the
 * pair is simply not a sign, and `shopSignKinds` says so.
 *
 * @param {import('../arena/infFile.js').InfFile|null} inf
 * @returns {Map<number, string>} texture index → a `SHOP_KINDS` key
 */
export function shopSignKinds(inf) {
  /** @type {Map<number, string>} */
  const kinds = new Map();
  const textures = inf?.voxelTextures ?? [];
  const menus = inf?.menus ?? [];
  for (let slot = 0; slot < menus.length; slot++) {
    const index = menus[slot];
    if (index === null || index === undefined) continue;
    const kind = MENU_SLOT_KINDS[slot];
    if (!kind) continue;
    kinds.set(index, kind);
    const next = textures[index + 1];
    if (next && /\.IMG$/i.test(next.filename)) kinds.set(index + 1, kind);
  }
  // The houses' business signs are not in the `*MENU` table at all: the blocks draw the
  // laundry art (indices 47–49) at the door of a house, and its own name is the evidence.
  for (let i = 0; i < textures.length; i++) {
    if (!kinds.has(i) && HOUSE_SIGN_ART.test(textures[i]?.filename ?? '')) kinds.set(i, 'house');
  }
  return kinds;
}

/**
 * The shop behind one map edge, or null when the edge opens nothing.
 *
 * @param {import('../arena/infFile.js').InfFile|null} inf
 * @param {number} textureIndex  the edge's sign texture, as the level decoder resolved it
 * @param {Map<number, string>} [kinds]  a `shopSignKinds` map, reused across a city
 * @returns {{kind: string, name: string, family: string, bank: string|null}|null}
 */
export function shopForSign(inf, textureIndex, kinds = null) {
  const map = kinds ?? shopSignKinds(inf);
  const kind = map.get(Number(textureIndex));
  if (!kind) return null;
  return { kind, ...SHOP_KINDS[kind] };
}

/**
 * Which city block a cell belongs to.
 *
 * The grid is `blocksPerSide` blocks of `CITY_BLOCK_SIZE` cells stamped from the
 * skeleton's own start position (`game/cityPlan.js`), so a cell's slot is arithmetic.
 *
 * @param {{slots: object[], start: {x: number, z: number}}} city
 * @param {number} blocksPerSide
 * @param {number} row
 * @param {number} col
 * @returns {object|null}
 */
export function blockSlotAt(city, blocksPerSide, row, col) {
  if (!city?.slots?.length) return null;
  const slotRow = Math.floor((row - city.start.z) / CITY_BLOCK_SIZE);
  const slotCol = Math.floor((col - city.start.x) / CITY_BLOCK_SIZE);
  if (slotRow < 0 || slotCol < 0 || slotRow >= blocksPerSide || slotCol >= blocksPerSide) return null;
  return city.slots[slotRow * blocksPerSide + slotCol] ?? null;
}

/**
 * Every door in an assembled city, with the room behind it.
 *
 * A door is a **wall cell whose own art is bound to an `.INF` `*MENU` slot** — the door a
 * player sees painted on the building — or, as the reference also allows, a non-solid
 * **edge** cell bound the same way. The block it stands in supplies the interior variant,
 * and the slot supplies the room. A hanging sign is neither: its art is the pair entry
 * after a menu index, not the index itself, and it opens nothing.
 *
 * A wall door is solid (it is the wall), so each record carries `stand`, the paving cell it
 * is opened from (`doorStand`); a player presses `E` there. Doors with no walkable neighbour
 * are still listed — they are the map's own art — but with `stand: null`, and the browser
 * suite keeps their number small and named rather than hiding them.
 *
 * @param {object} opts
 * @param {import('./mifLevel.js').ArenaLevel} opts.level  the decoded city
 * @param {object} opts.city                               `buildCityLevel`'s result
 * @param {import('../arena/infFile.js').InfFile|null} opts.inf
 * @param {number} opts.blocksPerSide
 * @returns {{row: number, col: number, kind: string, name: string, family: string, bank: string|null, file: string, block: string|null, slot: number, slotType: number|null, sign: string, wall: boolean, stand: {row: number, col: number}|null}[]}
 */
export function cityDoors(opts) {
  const { level, city, inf, blocksPerSide, settlement = null } = opts;
  const doors = [];
  if (!level?.cells?.length) return doors;
  for (let row = 0; row < level.depth; row++) {
    for (let col = 0; col < level.width; col++) {
      const cell = level.cells[row * level.width + col];
      // **The reference's two cases** (`tryMakeVoxelTransitionDefGenInfo`): a wall, or a
      // walk-through edge. A solid edge is a fence and opens nothing.
      const isWall = cell?.kind === 'wall';
      const isEdge = cell?.kind === 'edge' && !cell.solid;
      if (!isWall && !isEdge) continue;
      // `sideTexture` is the resolved table index (`mifLevel.js`), which is what
      // `INFFile::getMenuIndex` is asked about. Using the raw byte here would ask the wrong
      // question for an index that wrapped past 64.
      const art = inf?.voxelTextures?.[cell.sideTexture]?.filename ?? `#${cell.sideTexture}`;
      let kind = interiorKindOfTexture(inf, cell.sideTexture);
      // **Every door is enterable.** If another install (or a drifted table) paints a wall
      // with door art that no `*MENU` slot binds, it is a door to **a house** — there is no
      // shop behind it, and a house is what Arena puts behind a door with no trade. The
      // pattern is narrow on purpose: it accepts the five door arts and refuses the gate
      // posts (`T_DLGT`/`T_DRGT`), which are not doors.
      if (!kind && isWall && /^T_D(?:BS\d?|EQ|TAV|MU|TEP|NB\d?)\.IMG$/i.test(art)) kind = 'house';
      if (!kind) continue;
      const shop = SHOP_KINDS[kind];
      if (!shop) continue;
      const slot = blockSlotAt(city, blocksPerSide, row, col);
      doors.push({
        row,
        col,
        kind,
        name: shop.name,
        family: shop.family,
        bank: shop.bank,
        file: interiorMifName(shop.family, interiorIndexForBlock(slot?.mif ?? '')),
        block: slot?.mif ?? null,
        slot: slot?.index ?? -1,
        slotType: slot?.type ?? null,
        sign: art,
        wall: isWall,
        stand: isWall ? doorStand(level, row, col) : { row, col },
      });
    }
  }
  // ── the palace ───────────────────────────────────────────────────────────────
  //
  // **Every city-state has one and no village does** — the owner, 2026-10-17. Arena's own city
  // blocks carry no palace (the Imperial Palace is a loose map of its own), and the install does
  // ship the throne rooms a local ruler would use: `PALACE1.MIF`…`PALACE5.MIF`, each with its own
  // entry and its own `CASTLE.INF`. So the hall is put in the **building nearest the middle of the
  // city**, by rewriting that door's own interior rather than inventing geometry: the walls, the
  // doorway and the sign stay the file's, and what is behind the door is the palace.
  //
  // Stamped as this project's rule (`A.EXE` holds the original's own palace placements, D11): what
  // is read is the interior, and what is chosen is which building is the court.
  if (settlement && String(settlement.kind ?? '') === 'city' && doors.length) {
    const centreRow = level.depth / 2;
    const centreCol = level.width / 2;
    // **A noble house's door, and only a noble house's.** The owner, 2026-10-19: *"palaces
    // doors should only be able to spawn on noblehouse buildings not in normal houses
    // otherwise is anticlimactic"*. The city blocks have no palace door art of their own in
    // this install (`TBK01PAL.IMG`/`TBK02PAL.IMG` are menu slots 11/12 in the reference's table
    // but no block draws them), so a court has to stand behind a doorway that exists — and the
    // one that reads as a court is the **noble house** (`T_DNB1.IMG`, a coat of arms over the
    // lintel), never a common home. It is the noble door nearest the middle of the city, marked
    // `palace: true` so the checks can name the one changed door instead of hiding it; the door
    // itself, with its own art and its own street, stays where the block put it. A city with no
    // reachable noble door has no palace, rather than a palace behind a farmer's washing.
    const nobles = doors.filter((door) => door.kind === 'noble' && door.stand);
    let nearest = null;
    for (const door of nobles) {
      const distance = Math.hypot(door.row - centreRow, door.col - centreCol);
      if (!nearest || distance < nearest.distance) nearest = { door, distance };
    }
    if (nearest) {
      const seed = Math.abs(Math.round(Number(settlement.citySeed) || 1));
      const variant = 1 + (seed % PALACE_VARIANTS);
      Object.assign(nearest.door, {
        kind: 'palace',
        name: 'the palace',
        family: 'PALACE',
        bank: null,
        file: `PALACE${variant}.MIF`,
        palace: true,
      });
    }
  }
  return doors;
}

/**
 * Every door the **country** paints, with the building behind it.
 *
 * The wilderness is the city's law in a different `.INF`: a wall voxel whose art the
 * environment's `*MENU` table binds is a door, a sign is decoration, and the door is opened
 * from the walkable cell in front of it (`doorStand`). Measured on this install's blocks
 * (all 66 `.RMD`s against `TWN.INF`): 123 cells of `TZDFARM.IMG` (farmhouses), 31 of
 * `TZDBARN.IMG` (barns), 19 `TZDTAV.IMG`, 17 `TZDTEP.IMG`, 13 `TZDTOWER.IMG`, 6
 * `TZDCRYPT.IMG` — and the gate's two posts and the dungeon mouth, which are not doors.
 * Before this the whole country was bare of entrances: the only wilderness building a
 * player could enter was a dungeon, through the ruin's own flat.
 *
 * **Which of the eight interiors** is the city's rule with the country's own numbers: the
 * block's `.RMD` id is its number (`WILD019.RMD` → 19) and the window's quadrant is its
 * rotation, because a wilderness block carries no rotation letter of its own. Two farmhouse
 * doors in one block are one room; the same block drawn in another window quadrant is the
 * next variant. **RECONSTRUCTED** — `A.EXE` holds the original's own table.
 *
 * @param {object} opts
 * @param {import('./mifLevel.js').ArenaLevel} opts.level  the decoded country window
 * @param {import('../arena/infFile.js').InfFile|null} opts.inf  the window's wilderness INF
 * @param {number[]} [opts.blocks]  the window's four `.RMD` ids, `[dr * 2 + dc]`
 * @returns {{row: number, col: number, kind: string, name: string, family: string, bank: string|null,
 *   file: string, block: number|null, slot: number, sign: string, wall: boolean,
 *   stand: {row: number, col: number}|null, country: true}[]}
 */
export function wildDoors(opts) {
  const { level, inf, blocks = [] } = opts;
  const doors = [];
  if (!level?.cells?.length) return doors;
  const chunk = 64;
  for (let row = 0; row < level.depth; row++) {
    for (let col = 0; col < level.width; col++) {
      const cell = level.cells[row * level.width + col];
      const isWall = cell?.kind === 'wall';
      const isEdge = cell?.kind === 'edge' && !cell.solid;
      if (!isWall && !isEdge) continue;
      const art = inf?.voxelTextures?.[cell.sideTexture]?.filename ?? `#${cell.sideTexture}`;
      let kind = interiorKindOfTexture(inf, cell.sideTexture, 'wilderness');
      // The owner's law, as in the city: a wall painted with door art that no slot binds is
      // still a door, and what stands behind a door with no trade is a house. The pattern is
      // the country's five arts (the gate posts and the dungeon mouth are excluded above).
      if (!kind && isWall && /^[TXD]ZD(?:BARN|FARM|CRYPT|TAV|TEP|TOWER)\.IMG$/i.test(art)) kind = 'house';
      if (!kind) continue;
      const shop = SHOP_KINDS[kind];
      if (!shop) continue;
      const quadrant = (row >= chunk ? 2 : 0) + (col >= chunk ? 1 : 0);
      const blockId = Number(blocks[quadrant]) || 0;
      const variant = 1 + ((Math.abs(blockId - 1) + quadrant) % INTERIOR_VARIANTS);
      doors.push({
        row,
        col,
        kind,
        name: shop.name,
        family: shop.family,
        bank: shop.bank,
        file: interiorMifName(shop.family, variant),
        block: blockId || null,
        slot: (inf?.menus ?? []).indexOf(cell.sideTexture),
        sign: art,
        wall: isWall,
        stand: isWall ? doorStand(level, row, col) : { row, col },
        country: true,
      });
    }
  }
  return doors;
}

/**
 * A shopkeeper's lines: the whole sentences in their own bank.
 *
 * The four banks (`muguild.dat`, `tavern.dat`, `equip.dat`, `selling.dat`) are written for
 * a transaction — 47 of `muguild.dat`'s 123 lines are `A very nice %i, indeed. %mm gold`
 * and friends — and this project has no goods, no prices and no purses to hand over, so
 * what a keeper can honestly say is the part of the bank that needs no substitution: 76
 * lines of `muguild.dat`, 20 of `tavern.dat`, 129 of `equip.dat`. A line that is not a
 * whole sentence is dropped, exactly as the talk corpus drops them.
 *
 * @param {Record<string, string[]>} service  `library.service`
 * @param {string} bank  e.g. `equip.dat`
 * @returns {{text: string, bank: string, index: number}[]}
 */
export function serviceGreetings(service, bank) {
  const lines = service?.[bank] ?? [];
  const out = [];
  for (let index = 0; index < lines.length; index++) {
    const text = String(lines[index]).replace(/\s+/g, ' ').trim();
    if (text.length < 12 || text.includes('%')) continue;
    if (!/^["'(A-Z0-9]/.test(text) || !/[.!?”"]$/.test(text)) continue;
    out.push({ text, bank, index });
  }
  return out;
}

/**
 * One keeper's greeting, drawn from their bank and stable for the person and the turn.
 *
 * @param {{text: string, bank: string, index: number}[]} greetings
 * @param {number} seed
 * @param {number} [turn]
 * @returns {{text: string, source: string}|null}
 */
export function serviceGreeting(greetings, seed, turn = 0) {
  if (!greetings?.length) return null;
  const pick = greetings[Math.abs(Math.round(seed) + turn * 7) % greetings.length];
  return { text: pick.text, source: `${pick.bank} line ${pick.index}` };
}
