// WHAT A MAP SAYS IS IN IT — MONSTERS, LOOT, KEYS AND PEOPLE.
//
// The reported "no enemies, loot, quests" in dungeons was not a missing generator: the
// **maps carry the answer in their own `.INF`**, in the `@FLATS` table. A flat record may
// carry an `*ITEM` line, and that number is what the flat *is*:
//
//   ```
//   @FLATS
//   KEY.IMG      0   0    1    *ITEM 1
//   CHESTC.IMG   0   0    7    *ITEM 7
//   TREASRE2.IMG 0   0    5    *ITEM 5
//   RAT.DFA      0   0   32    *ITEM 32
//   ```
//
// Two things follow from that, and they are different things:
//
//   1. **What the map places.** A `MAP1` entity cell whose flat index points at one of
//      those records *is* that key, that chest, that corpse — and the maps really do place
//      them: `START.MIF` places 16 (a key, seven sets of equipment, eight treasures),
//      `39300577.MIF`'s first level 30 (seven keys, seven chests, ten treasures and five
//      bodies), and the palace's first level **31 knights**. Those are read off the level
//      here (`spawnsFromFlats`) and are what the player can walk up to and take.
//
//   2. **What the level may spawn.** The *same* table is the level's roster: a dungeon
//      whose `halls1.inf` lists `RAT`…`LICH` (items 32…54) is a dungeon whose monsters are
//      those, and a tavern's `tavern.inf` lists the bartender, the musicians and the men
//      and women who drink there (items 15, 24, 25, 83…90). Arena draws its population
//      from this table with its own placement rules, which live in `A.EXE` (D11) — so
//      *which* of the roster appears and *where* is this project's rule and says so, while
//      the roster itself is the install's.
//
// The item numbers, measured the same way in every shipped file:
//
//   1  `KEY.IMG`      a key                    32…54  a monster, by the art's own name
//   2  `DEADBODY`     a corpse                 72     `KNIGHT` — a person
//   3  `EQUIPMEN`     equipment                73     `JTHARN` — Jagar Tharn
//   4-6 `TREASRE1..3` treasure                 83…90  `MAN01…04` / `WOMAN01…04`
//   7  `CHESTC`       a closed chest           13     a gem (`FIREGEM.DFA`)
//   8  `CHESTO`       an open one              14     a boat (`BOATQURT`, in a town)
//   15 the establishment's own worker (`SMITH`, `BARTEND`, `PREST`, `WIZZ`)
//   16…31 the street folk: beggar, fire-eater, harlots, jester, merchants, musicians,
//         priests, a shady character, a snake charmer, a vendor, a wizard
//
// ## Two names are the install's, not UESP's
//
// The art calls item 39 `OGRE.DFA` and item 47 `BEHOLDER.DFA`, and UESP's Arena bestiary
// has no Ogre and no Beholder — the monsters in those slots are UESP's **Minotaur**
// (30-60 hp) and **Homonculus** (90-120 hp), which `monsters.js`'s rows of those names
// are. The join is the art's filename (checked 2026-10 against
// https://en.uesp.net/wiki/Arena:Monsters), not a guess about difficulty.
//
// ## What is reconstructed
//
// The gold a pile, a chest or a corpse yields (Arena's loot tables are in `A.EXE`, and the
// `.MIF` `LOOT`/`STOR` chunks are not decoded — S14), and the placement rules noted above.
// The *kinds* are the data's.

/** Item numbers and what they are. `art` is the level's own word for it. */
export const DUNGEON_ITEMS = Object.freeze({
  1: { kind: 'key', art: 'KEY.IMG', name: 'a key' },
  2: { kind: 'body', art: 'DEADBODY.IMG', name: 'a body' },
  3: { kind: 'equipment', art: 'EQUIPMEN.IMG', name: 'equipment' },
  4: { kind: 'treasure', art: 'TREASRE1.IMG', name: 'a treasure' },
  5: { kind: 'treasure', art: 'TREASRE2.IMG', name: 'a treasure' },
  6: { kind: 'treasure', art: 'TREASRE3.IMG', name: 'a treasure' },
  7: { kind: 'chest', art: 'CHESTC.IMG', name: 'a chest' },
  8: { kind: 'chest', art: 'CHESTO.IMG', name: 'an open chest' },
  13: { kind: 'gem', art: 'FIREGEM.DFA', name: 'a gem' },
  14: { kind: 'boat', art: 'BOATQURT.IMG', name: 'a boat' },
});

/** Every item number `16…31` and `15` is a **person**; the art says which one. */
export const PERSON_ITEMS = Object.freeze({
  15: 'worker',
  16: 'beggar',
  17: 'fire-eater',
  18: 'harlot',
  19: 'harlot',
  20: 'harlot',
  21: 'jester',
  22: 'merchant',
  23: 'merchant',
  24: 'musician',
  25: 'musician',
  26: 'priest',
  27: 'priest',
  28: 'shady character',
  29: 'snake charmer',
  30: 'vendor',
  31: 'wizard',
  72: 'knight',
  73: 'Jagar Tharn',
});

/** The art's own first word → the trade, for a person or a worker. */
const ART_ROLES = Object.freeze({
  SMITH: 'smith',
  BARTEND: 'bartender',
  PREST: 'priest',
  WIZZ: 'wizard',
  JSTER: 'jester',
  MUSIC: 'musician',
  BEG: 'beggar',
  FIREMN: 'fire-eater',
  HOKER: 'harlot',
  MERCH: 'merchant',
  SHADY: 'shady character',
  SNAKTM: 'snake charmer',
  VENDER: 'vendor',
  KNIGHT: 'knight',
  JTHARN: 'Jagar Tharn',
});

/** The monster of each item number `32…54`, by the **art's own filename**. */
export const DUNGEON_MONSTERS = Object.freeze({
  32: { monster: 'rat', art: 'RAT.DFA' },
  33: { monster: 'goblin', art: 'GOBLIN.DFA' },
  34: { monster: 'lizardman', art: 'LIZRDMAN.DFA' },
  35: { monster: 'wolf', art: 'WOLF.DFA' },
  36: { monster: 'snowwolf', art: 'SNOWWOLF.DFA' },
  37: { monster: 'orc', art: 'ORC.DFA' },
  38: { monster: 'skeleton', art: 'SKELETON.DFA' },
  39: { monster: 'minotaur', art: 'OGRE.DFA' },
  40: { monster: 'spider', art: 'SPIDER.DFA' },
  41: { monster: 'ghoul', art: 'GHOUL.DFA' },
  42: { monster: 'hellhound', art: 'HELLHOUN.DFA' },
  43: { monster: 'ghost', art: 'GHOST.DFA' },
  44: { monster: 'zombie', art: 'ZOMBIE.DFA' },
  45: { monster: 'troll', art: 'TROLL.DFA' },
  46: { monster: 'wraith', art: 'WRAITH.DFA' },
  47: { monster: 'homonculus', art: 'BEHOLDER.DFA' },
  48: { monster: 'icegolem', art: 'ICEGOLEM.DFA' },
  49: { monster: 'stonegolem', art: 'STONEGOL.DFA' },
  50: { monster: 'irongolem', art: 'IRONGOLE.DFA' },
  51: { monster: 'firedaemon', art: 'FIREDAEM.DFA' },
  52: { monster: 'medusa', art: 'MEDUSA.DFA' },
  53: { monster: 'vampire', art: 'VAMPIRE.DFA' },
  54: { monster: 'lich', art: 'LICH.DFA' },
});

/** The lowest and highest item number that names a monster (`rat` … `lich`). */
export const MONSTER_ITEM_MIN = 32;
export const MONSTER_ITEM_MAX = 54;

/**
 * The trade a person's art names, e.g. `SMITH.DFA` → `smith`.
 * @param {string|null|undefined} art
 * @returns {string|null}
 */
export function roleOfArt(art) {
  const word = String(art ?? '').toUpperCase().replace(/[^A-Z0-9].*$/, '');
  return ART_ROLES[word] ?? null;
}

/**
 * What a flat is, by its `*ITEM` number and the art its own record names.
 *
 * @param {number|null|undefined} itemIndex
 * @param {string|null} [art]  the flat's own record name, which `15` needs (it is
 *   whichever worker the art spells: `SMITH`, `BARTEND`, `PREST`, `WIZZ`)
 * @returns {{kind: string, art: string|null, name: string, monster: string|null, role: string|null, itemIndex: number}|null}
 */
export function itemOf(itemIndex, art = null) {
  if (itemIndex === null || itemIndex === undefined) return null;
  const known = DUNGEON_ITEMS[itemIndex];
  if (known) return { ...known, monster: null, role: null, itemIndex };
  const beast = DUNGEON_MONSTERS[itemIndex];
  if (beast) return { kind: 'monster', art: beast.art, name: beast.monster, monster: beast.monster, role: null, itemIndex };
  const person = PERSON_ITEMS[itemIndex];
  if (person) {
    const role = roleOfArt(art) ?? person;
    return { kind: 'person', art: art ?? null, name: role, monster: null, role, itemIndex };
  }
  if (itemIndex >= 83 && itemIndex <= 90) {
    return {
      kind: 'person', art: art ?? null, name: itemIndex <= 86 ? 'a man' : 'a woman',
      monster: null, role: itemIndex <= 86 ? 'man' : 'woman', itemIndex,
    };
  }
  return null;
}

/**
 * Every monster, pickup and person a level's own flats place.
 *
 * A flat with no `*ITEM` (a tree, a chain, a bone) is scenery and is not here; a flat
 * whose number this table does not know is counted in `unknown` rather than invented.
 *
 * @param {{flats: {row:number,col:number,name:string,itemIndex?:number|null,on:string}[]}} collected
 *   `game/flats.js`'s `collectFlats` result
 * @returns {{monsters: object[], pickups: object[], people: object[], unknown: number}}
 */
export function spawnsFromFlats(collected) {
  /** @type {object[]} */
  const monsters = [];
  /** @type {object[]} */
  const pickups = [];
  /** @type {object[]} */
  const people = [];
  let unknown = 0;
  for (const flat of collected?.flats ?? []) {
    const item = itemOf(flat.itemIndex ?? null, flat.name);
    if (!item) {
      if (flat.itemIndex !== null && flat.itemIndex !== undefined) unknown++;
      continue;
    }
    const where = { row: flat.row, col: flat.col, on: flat.on, art: item.art };
    if (item.kind === 'monster') monsters.push({ ...where, itemIndex: item.itemIndex, monster: item.monster });
    else if (item.kind === 'person') people.push({ ...where, itemIndex: item.itemIndex, role: item.role, name: item.name });
    else pickups.push({ ...where, itemIndex: item.itemIndex, kind: item.kind, name: item.name });
  }
  return { monsters, pickups, people, unknown };
}

/**
 * The monsters a level's `.INF` says may live in it — its own roster, in the item table's
 * order, lowest first.
 *
 * A level with no monster records has **none** (the Imperial Dungeons' own `start.inf`
 * lists only keys, equipment and treasure, which is exactly why the escape dungeon is
 * quiet), and the caller must then leave it empty rather than falling back to a default
 * bestiary: "no monsters" is the map's answer as much as "a lich" is.
 *
 * @param {import('../arena/infFile.js').InfFile|null|undefined} inf
 * @returns {{monster: string, art: string, itemIndex: number}[]}
 */
export function monsterRosterFromInf(inf) {
  const roster = [];
  for (const flat of inf?.flats ?? []) {
    const index = flat?.itemIndex;
    if (!Number.isFinite(index) || index < MONSTER_ITEM_MIN || index > MONSTER_ITEM_MAX) continue;
    const beast = DUNGEON_MONSTERS[index];
    if (beast && !roster.some((r) => r.itemIndex === index)) roster.push({ ...beast, itemIndex: index });
  }
  return roster.sort((a, b) => a.itemIndex - b.itemIndex);
}

/**
 * Gold a pile, chest or corpse yields — **reconstructed** (see the header).
 *
 * @param {string} kind  `treasure`, `chest`, `body`, `gem` or `equipment`
 * @param {() => number} random  a draw in `[0, 1)`, from the level's own `ArenaRandom`
 * @returns {number} gold, whole coins
 */
export function goldFor(kind, random) {
  const roll = (n) => Math.floor(random() * n);
  if (kind === 'body') return 2 + roll(9);
  if (kind === 'treasure') return 12 + roll(29);
  if (kind === 'chest') return 25 + roll(76);
  if (kind === 'gem') return 40 + roll(61);
  return 0;
}

/**
 * What the player is told when they take one.
 *
 * @param {object} pickup  an entry from `spawnsFromFlats`'s `pickups`
 * @param {number} gold    what this install's own draw said it was worth
 * @returns {string}
 */
export function pickupNote(pickup, gold) {
  if (pickup.kind === 'key') return 'A key — it opens a lock nothing else here will.';
  if (pickup.kind === 'equipment') return 'Equipment: the map kept a weapon here. It is in your hands.';
  if (pickup.kind === 'gem') return 'A gem, heavy in the hand. It sells.';
  if (pickup.kind === 'body') return `The body had ${gold} coins on it.`;
  if (gold > 0) return `${gold} gold — ${pickup.name}.`;
  return `Nothing but ${pickup.name}.`;
}

/**
 * The kinds of pickup a level holds, for a HUD line and for the tests.
 * @param {object[]} pickups
 * @returns {string[]} sorted kinds
 */
export function pickupKinds(pickups) {
  return [...new Set(pickups.map((p) => p.kind))].sort();
}
