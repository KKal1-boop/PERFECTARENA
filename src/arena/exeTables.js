// THE GAME'S OWN TABLES, OUT OF THE GAME'S OWN EXECUTABLE (**block B24**, the brief's P2).
//
// `arena/ARENA/ACD.EXE` is unpacked by `arena/pklite.js` into a 305 520-byte code image; that
// image's data region is where Arena kept everything the 153 loose files do *not* hold — the
// creature roster and the art each creature is drawn from, the classes, races and attributes,
// the provinces and all sixty-four of Tamriel's settlements, the calendar, the noble ranks and
// the gem loot table, the artifact list, the spell effects, the status words, and the names the
// level reader looks for. This module reads them.
//
// **How a table is found: by its own words, never by an offset.** Law 6 of `docs/PORT_BLOCKS.md`
// forbids committing anything derived from this file — a table, a string, an offset that only
// holds for one build. So every table here is located by **an anchor of two to five consecutive
// entries** (`'Rat\0Goblin\0Lizard Man\0Snow Wolf'`) and read forward as NUL-terminated strings
// until the run stops looking like that table (`match` says how its entries are spelled, and the
// first entry that breaks the rule ends it). An offset table would be a lie on the floppy release
// (`A.EXE`, the same program under another name — `exeData.js` tries both); an anchor is a fact
// about the game's own content. When an anchor is absent the reader answers `null` rather than
// guessing, and `exeTableReadings` says which table went missing.
//
// **What the anchors are for, in one example.** The creature names are one run of 42 entries at
// the same place the creature sheets are one run of 24 (`rat@.cfa`, … `tharn0@.cfa`). Read
// index-by-index, twenty-three of the twenty-four pair by spelling — `Rat`/`rat`, `Skeleton`/
// `skele`, `Hell Hound`/`hound`, `Fire Daemon`/`deamon` — and exactly one pair does not:
// **`Minotaur` / `pat@.cfa`**, the same single mismatch the rest of the project has been living
// with since `game/monsters.js` wrote the Minotaur off as a creature this install cannot draw.
// That is the whole reason to prefer anchors and honest pairs over a tidy hard-coded list.

import { findAscii } from './pklite.js';

/**
 * @typedef {object} TableSpec
 * @property {string} anchor    two to five consecutive entries, as they sit in the image
 * @property {RegExp} match     how an entry of *this* table is spelled; breaks the run when it fails
 * @property {string[]} [stopAt]  the next table's first entry — the run ends where that begins
 * @property {boolean} [mayBeEmpty]  an empty entry continues the run instead of ending it
 * @property {string} note      what the table is, in the game's own terms
 */

/**
 * The tables this module reads, each with the anchor that finds it and the spelling that ends it.
 *
 * The list is deliberately limited to tables whose *ends* can be told from their own spelling: a
 * run of `.cfa` template names stops at the first entry that is not one, a run of class names stops
 * at the binary block behind it. A few of the image's tables (the byte blocks that follow the
 * holidays, the word offsets after the noble ranks) are **not** string tables at all and are not
 * claimed here; they are the next pass's work, named in `docs/PORT_BLOCKS.md` §5.
 *
 * @type {Readonly<Record<string, TableSpec>>}
 */
export const EXE_TABLE_SPECS = Object.freeze({
  // ── The bestiary ────────────────────────────────────────────────────────────────────────────
  /** Twenty-four creature names, then the eighteen class names as the human enemies. */
  bestiaryRun: { anchor: 'Rat\0Goblin\0Lizard Man\0Wolf\0Snow Wolf\0Orc',
    match: /^[A-Za-z][A-Za-z\u0027 ]{1,23}$/,
    note: 'creature names first, then the eighteen class names as the enemies who carry them' },
  /** The art template for each creature: `<name>@.cfa`, the `@` standing where the view digit goes. */
  creatureSheets: { anchor: 'rat@.cfa\0goblin@.cfa\0lizard@.cfa',
    match: /^[a-z0-9]+@\.cfa$/,
    note: 'the sheet every creature is drawn from, view digit in place of the @ — e.g. RAT1.CFA' },
  /** The town's commoners, which the game spells `set 0`, action, set digit (`@` = the set). */
  folkSheets: { anchor: 'mlgen0@w.cfa\0mlgen0@d.cfa\0mlgen0@t.cfa',
    match: /^[a-z0-9]+@[a-z]*\.cfa$/,
    note: 'the commoners — and **no** creature of any kind appears in this table' },
  /** The player's own sheets: view, armour, action, with `XXX` for the armour family. */
  heroSheets: { anchor: '0@XXXwlk.cfa\u00000@XXXatt.cfa\u00000@XXXbow.cfa',
    match: /^[a-z0-9]@[a-z]+\.cfa$/i,
    note: 'the first-person and billboard sheets the player and the people are drawn by' },
  /** The executable's own `.VOC` roster, the minotaur's own voice among them. */
  voiceFiles: { anchor: 'firedaem.voc\0ghost.voc\0ghoul.voc',
    match: /^[a-z0-9]+\.voc$/,
    note: 'the creature and world voices the sound code loads by name' },

  // ── Character creation's tables ─────────────────────────────────────────────────────────────
  /** The eighteen classes, in the game's own order (Mage first, Knight last). */
  classes: { anchor: 'Mage\0Spellsword\0Battlemage\0Sorceror\0Healer',
    match: /^[A-Za-z][A-Za-z]{2,11}$/,
    note: 'the eighteen classes of the Empire, as character creation lists them' },
  /** The eight attributes of the character sheet. */
  attributes: { anchor: 'Strength\0Intelligence\0Willpower\0Agility\0Speed',
    match: /^[A-Za-z]{3,12}$/, stopAt: ['Bretons', 'Breton'],
    note: 'the eight attributes, in the order the sheet prints them' },
  /** The eight races, as a people ("Bretons, land of the …"). */
  racesPlural: { anchor: 'Bretons\0Redguards\0Nords\0Dark Elves',
    match: /^[A-Za-z ]{4,12}$/, stopAt: ['Breton'],
    note: 'the eight races as a people — what `%s is %s` says a character is' },
  /** …and as one person. */
  racesSingular: { anchor: 'Breton\0Redguard\0Nord\0Dark Elf\0High Elf',
    match: /^[A-Za-z ]{3,12}$/,
    note: 'the eight races in the singular, which is what a race table reports' },

  // ── The world ───────────────────────────────────────────────────────────────────────────────
  /** The eight provinces of Tamriel. */
  provinces: { anchor: 'High Rock\0Hammerfell\0Skyrim\0Morrowind',
    match: /^[A-Za-z ]{4,12}$/, stopAt: ['Solitude'],
    note: 'the eight provinces, in the game\'s own order' },
  /** Every settlement on the map: sixty-four of them, eight per province. */
  settlements: { anchor: 'Solitude\0Dawnstar\0Winterhold\0Snowhawk',
    match: /^[A-Za-z\u0027 -]{3,20}$/,
    note: 'sixty-four settlements, eight per province — the world map in words' },
  /** The eight capitals, which the map screen names on its own. */
  capitals: { anchor: 'Rihad\0Winterhold\0Eldenroot\0Corinth\0Lillandril',
    match: /^[A-Za-z]{4,12}$/, stopAt: ['Stonekeep'],
    note: 'one capital per province, the eight the map screen draws' },
  /** The sixteen named dungeons — Stonekeep, the eight main-quest lairs, the rest. */
  dungeonNames: { anchor: 'Stonekeep\0Fortress of Ice\0Selene',
    match: /^[A-Za-z\u0027 -]{4,24}$/,
    note: 'the named dungeons, the eight quest ones among them' },
  /** The block kinds a settlement is built from (`noble`, `tavern`, `wcrypt`, …). */
  blockFiles: { anchor: 'noble\0tavern\0temple\0equip\0mage',
    match: /^[a-z]{4,8}$/,
    note: 'the block kinds a settlement\'s grid is assembled from — each one an `.INF`' },

  // ── The calendar ────────────────────────────────────────────────────────────────────────────
  months: { anchor: "Morning Star\0Sun's Dawn\0First Seed\0Rain's Hand",
    match: /^[A-Za-z\u0027 -]{3,16}$/,
    note: 'the twelve months, Morning Star first' },
  weekdays: { anchor: 'Morndas\0Tirdas\0Middas\0Turdas\0Fredas',
    match: /^[A-Za-z]{5,8}$/,
    note: 'the seven days of the week, Morndas first' },
  holidays: { anchor: "New Life Festival\0South Wind's Prayer\0Hearts Day",
    match: /^[A-Za-z\u0027 -]{4,24}$/,
    note: 'the fifteen holidays the year is marked by' },
  timesOfDay: { anchor: 'early morning\0in the morning\0noon\0in the afternoon',
    match: /^[a-z ]{4,16}$/,
    note: 'the seven names the clock prints under itself' },

  // ── Loot, rank and standing ─────────────────────────────────────────────────────────────────
  nobleRanks: { anchor: 'Lord\0Duke\0Baron\0Count\0Prince\0King',
    match: /^[A-Za-z]{4,8}$/,
    note: 'the fourteen ranks below the Emperor, the seven male then the seven female' },
  gems: { anchor: 'a Brass\0an Iron\0a Steel\0a Silver',
    match: /^(a|an) [A-Za-z]+$/,
    note: 'the gemstone loot table, article and all — "a Brass", "a Diamond"' },
  artifacts: { anchor: "Lord's Mail\0Ebony Mail\0Auriel's Shield",
    match: /^[A-Za-z\u0027 -]{4,24}$/,
    note: 'the artifacts of the Third Era' },
  spellEffects: { anchor: 'Cause\0Continuous Damage\0Create\0Cure\0Damage',
    match: /^[A-Za-z -]{4,26}$/,
    note: 'the twenty-five spell-effects the spellmaker offers' },
  statusWords: { anchor: 'healthy\0diseased\0poisoned\0in critical condition',
    match: /^[a-z -]{3,26}$/, mayBeEmpty: true,
    note: 'what a character sheet says a creature\'s condition is' },
  travelMenu: { anchor: 'Equipment Store\0Mages Guild\0Palace\0City gates',
    match: /^[A-Za-z ]{3,16}$/, mayBeEmpty: true,
    note: 'the destinations the map screen offers — the "Nearest Inn, Nearest Dungeon" list' },

  // ── What the level reader looks for ─────────────────────────────────────────────────────────
  /** The eight texture names every level's own records are addressed by. */
  levelTextures: { anchor: 'CEILING\0DRYCHASM\0WETCHASM\0LAVACHASM',
    match: /^[A-Z]{4,10}$/, mayBeEmpty: true,
    note: 'the level markers the `.INF` reader resolves — the same eight `mifLevel.js` uses' },
  settlementKinds: { anchor: 'City-State\0Town\0Village\0Village\0Dungeon',
    match: /^[A-Za-z-]{4,12}$/,
    note: 'what the map calls a place, by its class' },
});

/**
 * Read one NUL-terminated string table out of the image.
 *
 * The run begins at the anchor and ends on the first entry that breaks `match` (or, when there is
 * no `match`, the first byte that is not printable ASCII). An entry longer than `maxLength` ends
 * the run too, which is what stops a reader that has walked off the end of its table from
 * swallowing a megabyte of code.
 *
 * @param {Uint8Array} image
 * @param {string} anchor       consecutive entries, exactly as they sit in the image
 * @param {{match?: RegExp, stopAt?: string[], mayBeEmpty?: boolean, maxLength?: number,
 *   max?: number}} [opts]
 * @returns {{at: number, entries: string[], end: number}|null}  `null` when the anchor is not there
 */
export function stringTableAt(image, anchor, opts = {}) {
  const maxLength = opts.maxLength ?? 32;
  const max = opts.max ?? 128;
  const at = findAscii(image, anchor);
  if (at < 0) return null;
  const entries = [];
  let i = at;
  while (i < image.length && entries.length < max) {
    let stop = i;
    while (stop < image.length && image[stop] !== 0) {
      const c = image[stop];
      if (c < 32 || c > 126) break;
      stop++;
    }
    const printable = stop < image.length && image[stop] === 0;
    const text = printable ? String.fromCharCode(...image.subarray(i, stop)) : '';
    if (!printable || text.length > maxLength) break;
    if (!text.length) {
      // An empty entry is a NUL of its own. The tables that have one say so (`mayBeEmpty`);
      // everywhere else an empty entry is the end of the string table and the start of code.
      if (!opts.mayBeEmpty) break;
      entries.push('');
      i += 1;
      continue;
    }
    // The next table's own first entry ends this one — how a run of attribute names stops at
    // `Bretons` and a run of provinces stops at `Solitude`, both of which spell like the table
    // before them.
    if (opts.stopAt?.includes(text)) break;
    if (opts.match && !opts.match.test(text)) break;
    entries.push(text);
    i = stop + 1;
  }
  if (i >= image.length) return null;
  return { at, entries, end: i };
}

/**
 * Every table this module reads, resolved — or `null` for one whose anchor the image does not hold.
 *
 * The first table is read before the others, because `creatureSheets`' own length is what says how
 * many of the bestiary run's entries are *creatures* (the rest of the run is the class names).
 *
 * @param {Uint8Array} image
 * @returns {Record<string, string[]|null>}
 */
export function exeTables(image) {
  /** @type {Record<string, string[]|null>} */
  const out = {};
  for (const [name, spec] of Object.entries(EXE_TABLE_SPECS)) {
    out[name] = stringTableAt(image, spec.anchor, {
      match: spec.match, stopAt: spec.stopAt, mayBeEmpty: spec.mayBeEmpty,
    })?.entries ?? null;
  }
  return out;
}

/**
 * The bestiary run split the way the executable's own two tables split it: **creature names first,
 * for as many entries as the run holds beyond the class block, then the class names.**
 *
 * The count comes from the run's own class block and not from a constant, so the split moves with
 * the game rather than with this file — and the twenty-fourth creature sheet (`tharn0@.cfa`, the
 * boss's own art, whose name the run does not carry because Jagar Tharn is not in the bestiary) is
 * the one sheet this leaves unpaired for `game/monsterArt.js` to report.
 *
 * @param {Record<string, string[]|null>} tables
 * @returns {{creatures: string[], classes: string[]}}
 */
export function splitBestiary(tables) {
  const run = tables?.bestiaryRun ?? [];
  const classBlock = tables?.classes ?? [];
  // The class block is the run's own tail *by content*: the same names, in the same order, which
  // is the cross-check `exeTableReadings` insists on. `run.length - classBlock.length` is
  // therefore where the creature names stop — 23 of them, against 24 creature sheets, because the
  // twenty-fourth sheet is the boss's own art (`tharn0@.cfa`) and the boss is not in the bestiary.
  const cut = Math.max(0, run.length - classBlock.length);
  return { creatures: run.slice(0, cut), classes: run.slice(cut) };
}

/**
 * What the read produced, in the shape a test or a browser suite can hold — counts, the first and
 * last entry of each table, and the readings that a wrong reading could not satisfy.
 *
 * @param {Uint8Array} image
 * @param {Record<string, string[]|null>} [resolved]  tables a caller already read, so a page that
 *   asks for the report after the tables does not pay for the same search twice
 * @returns {object}
 */
export function exeTableReport(image, resolved) {
  const tables = resolved ?? exeTables(image);
  const { creatures, classes } = splitBestiary(tables);
  const provinces = tables.provinces ?? [];
  const settlements = tables.settlements ?? [];
  return {
    tables: Object.fromEntries(Object.entries(tables).map(([name, entries]) => [name, entries
      ? { at: findAscii(image, EXE_TABLE_SPECS[name].anchor),
        count: entries.length, first: entries[0], last: entries[entries.length - 1] }
      : { missing: true }])),
    readings: exeTableReadings(tables, { creatures, classes, provinces, settlements }),
  };
}

/**
 * The checks the tables are read **against**, not read for.
 *
 * Each one is a claim that was measured off this install and that a drifted reading would break,
 * which is the only reason to trust a table of English words pulled out of a 300 KB code image:
 * the class table has to repeat in the bestiary run's tail, the settlements have to divide by the
 * provinces, the level markers have to be the ones the `.INF` reader already resolves.
 *
 * @param {Record<string, string[]|null>} tables
 * @param {{creatures: string[], classes: string[], provinces: string[], settlements: string[]}} split
 * @returns {{id: string, ok: boolean, detail: string}[]}
 */
export function exeTableReadings(tables, split) {
  const { creatures, classes, provinces, settlements } = split;
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const classTable = tables.classes ?? [];
  const creatureSheets = tables.creatureSheets ?? [];
  const levelTextures = tables.levelTextures ?? [];
  const markers = ['CEILING', 'DRYCHASM', 'WETCHASM', 'LAVACHASM', 'LEVELUP', 'LEVELDOWN', 'MENU', 'BOXSIDE', 'BOXCAP'];
  const out = [];

  out.push({ id: 'bestiary', ok: creatures.length >= 20 && creatureSheets.length >= 20,
    detail: `${creatures.length} creature names, ${creatureSheets.length} creature sheets` });

  // The two copies of the class list have to agree — one sits behind the creature names, the
  // other in character creation's own block, and a reading that finds only one of them is half a
  // reading.
  const tail = classes.slice(0, classTable.length);
  out.push({ id: 'classes', ok: classTable.length >= 12 && same(tail, classTable),
    detail: classTable.length
      ? `creation's table (${classTable.join(', ')}) ${same(tail, classTable) ? 'repeats' : 'is not'} the bestiary run's own tail (${tail.join(', ')})`
      : 'the class table was not found' });

  out.push({ id: 'world', ok: provinces.length >= 6 && settlements.length > 0 && settlements.length % provinces.length === 0,
    detail: `${provinces.length} provinces, ${settlements.length} settlements = ${provinces.length ? settlements.length / provinces.length : 0} each` });

  const months = tables.months ?? [];
  const weekdays = tables.weekdays ?? [];
  const holidays = tables.holidays ?? [];
  out.push({ id: 'calendar', ok: months.length === 12 && weekdays.length === 7 && holidays.length >= 10,
    detail: `${months.length} months (${months[0]} … ${months[months.length - 1]}), ${weekdays.length} weekdays, ${holidays.length} holidays` });

  // The level markers are the one table this project can check against its **own** code: these
  // eight names are what `mifLevel.js` looks for in an `.INF`, so finding them in the executable
  // joins the two halves of the port's level reading.
  out.push({ id: 'level-textures', ok: markers.every((m) => levelTextures.includes(m)),
    detail: levelTextures.length ? levelTextures.join(' ') : 'the level texture table was not found' });

  out.push({ id: 'character', ok: (tables.racesSingular ?? []).length >= 8 && (tables.racesPlural ?? []).length >= 8
    && (tables.attributes ?? []).length === 8,
    detail: `races ${(tables.racesSingular ?? []).join(', ')} · attributes ${(tables.attributes ?? []).length}` });

  out.push({ id: 'loot', ok: (tables.artifacts ?? []).length >= 8 && (tables.gems ?? []).length >= 8
    && (tables.nobleRanks ?? []).length >= 8,
    detail: `${(tables.artifacts ?? []).length} artifacts, ${(tables.nobleRanks ?? []).length} ranks, ${(tables.gems ?? []).length} gems` });

  return out;
}
