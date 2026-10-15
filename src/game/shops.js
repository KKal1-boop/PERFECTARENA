// ENTERING A BUILDING — FROM THE SIGN OVER THE DOOR TO THE ROOM BEHIND IT.
//
// A city is assembled (`game/cityPlan.js`) from a skeleton plus a grid of 20×20 block
// `.MIF`s. Its buildings have no `0xB` door voxels at all — measured, and `TCN.INF`
// declares no `*DOOR` — so the way in is a `0xA` **edge**, the voxel the mesher draws as
// a single quad on one face of a cell: a shop's sign hanging over its doorway, and the
// doorway itself is passable (`solid = false`).
//
// That sign is what this module reads. Three things are measured from the player's own
// archive, not assumed:
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
//   2. **Which signs the blocks use.** All 368 block `.MIF`s were walked: their sign
//      edges carry exactly five indices — 6 (equipment, 137 edges), 11 (tavern, 135), 17
//      (Mages Guild), 24 (temple) and 47 (`TLAUNDRY.IMG`, the houses' business sign). One
//      block holds several doors — `EQ` blocks are 52 blocks carrying 137 equipment signs
//      *and* 16 tavern signs — so the sign over a door, and not the block's own code, is
//      what says where that door goes; a player can see the sign, and it is right.
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
//   * **The shop kind comes from the sign**, by the `.INF`'s own `*MENU` slots.
//   * **Which of the eight interiors** comes from the block's own number in its file name
//     (`EQBD9A.MIF` → variation 9, rotation A): `1 + ((variation - 1 + rotation) % 8)`.
//     There is no table in the data that maps 13 equipment blocks onto 8 equipment
//     interiors, so the draw is the block's, which keeps two equipment shops in one city
//     from being the same room whenever their blocks differ.
//   * **A sign that the table does not bind** — the laundry art — still names a shop: the
//     art says so (`TLAUNDRY`, `TLAUNDR1`, `TLAUNDR2`, `LAUNDRY…`), and it is the houses'
//     sign, so it opens the `BS` family. A fence, a bridge, a bookstand and the city gate
//     are edges too, and none of them is a door.
//
// The rule that a shop's sign is what the player reads also means **not every edge is a
// doorway**: `T_NBRIDG.IMG`, `T_CITYWL.IMG`, `TBK01PAL.IMG` and `PGATE.IMG` are drawn but
// open nothing, which is a fact about the data rather than a shortcoming of the search.

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
});

/** How many interiors of each family the archive holds (`EQUIP1..8` and friends). */
export const INTERIOR_VARIANTS = 8;

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
 * A door is an **edge cell that is not solid** — a fence or a gate blocks, a sign over a
 * doorway does not — whose texture is a sign the `.INF` names. The block it stands in
 * supplies the variation, and the shop's own family supplies the room.
 *
 * @param {object} opts
 * @param {import('./mifLevel.js').ArenaLevel} opts.level  the decoded city
 * @param {object} opts.city                               `buildCityLevel`'s result
 * @param {import('../arena/infFile.js').InfFile|null} opts.inf
 * @param {number} opts.blocksPerSide
 * @returns {{row: number, col: number, kind: string, name: string, family: string, bank: string|null, file: string, block: string|null, slot: number, slotType: number|null, sign: string}[]}
 */
export function cityDoors(opts) {
  const { level, city, inf, blocksPerSide } = opts;
  const kinds = shopSignKinds(inf);
  const doors = [];
  if (!level?.cells?.length) return doors;
  for (let row = 0; row < level.depth; row++) {
    for (let col = 0; col < level.width; col++) {
      const cell = level.cells[row * level.width + col];
      if (cell?.kind !== 'edge' || cell.solid) continue;
      // The raw voxel rather than the resolved index: the low six bits of a `0xA` voxel
      // are the sign, and they are the same number the `.INF`'s `*MENU` slots name.
      const signIndex = (cell.rawMap1 & 0x003f) - 1;
      if (signIndex < 0) continue;
      const shop = shopForSign(inf, signIndex, kinds);
      if (!shop) continue;
      const slot = blockSlotAt(city, blocksPerSide, row, col);
      doors.push({
        row,
        col,
        kind: shop.kind,
        name: shop.name,
        family: shop.family,
        bank: shop.bank,
        file: interiorMifName(shop.family, interiorIndexForBlock(slot?.mif ?? '')),
        block: slot?.mif ?? null,
        slot: slot?.index ?? -1,
        slotType: slot?.type ?? null,
        sign: inf?.voxelTextures?.[signIndex]?.filename ?? `#${signIndex}`,
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
