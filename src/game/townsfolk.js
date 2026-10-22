// WHO IS ON THE STREET.
//
// (Their words are `game/dialogue.js`'s — the keyed banks of `template.dat`, the personalities
// Arena gives each figure, and the substitution table. This module is the roster, the placement,
// the sex and the fight statistics, and it holds the one sex reader `dialogue.js` borrows.)
//
// Arena draws its own people — townsfolk, guards, the player — from the same `.CFA`
// family the monsters come from, and the file name says what the figure is wearing:
//
//   `<set><armour><action>.CFA`   e.g. `01PLTWLK.CFA`, `11BARWLK.CFA`
//
// The archive ships **89** of those files; **65** of them are walk files, in ten sets
// (`01`–`05` and `11`–`15`) spelling seven armour writings (`UNA`, `LTR`, `CHN`, `PLT`,
// `BAR`, `MAG`, `MNK`) — except that no `11`–`15` set has a `PLT` figure at all. So the
// roster is not authored: it is *read off the install*, the same way the city-block
// tables and the monster sprite sets are (`radiantQuests.js`, `monsters.js`), and it is
// checked against the real archive in `tests/unit/townsfolk.test.mjs`.
//
// ## Nobody has a name, and that is not an oversight
//
// Arena generates a person's name from tables it keeps beside the game, and this data
// set's `NAMES.DAT` is **not** those tables: it is 480 bytes of ten `EMPTY`-padded save
// slots (FORMATS.md §10). `NAMECHNK.DAT` **is** the install's own name generator, read in
// this pass (`data/namechunks.js`, measured lists below). So there is
// name to be had, and inventing one would be exactly the kind of lie this project avoids
// elsewhere: a person is described by what the file's own name says they wear — "a
// person in chain mail", "a monk in a habit" — and never given a name Arena did not
// write. The player's own name and the *place's* name are the game's; a stranger's is not.
//
// ## Their words moved out (2026-10-19)
//
// This module used to hold the speech half too: `talkCorpus` read `template.dat` as one pool of
// whole sentences that needed no substitution (561 of its 2 462 parts, plus 14 that wanted only a
// city-state's name) and every person drew from it. That is why the owner heard a town whose talk
// was "mostly random": a guard, a harlot and a king were interchangeable. `template.dat` is a
// **keyed** file — 100…129 are the "who are you" answers, one bank per personality Arena gives a
// figure, 159/185 are rumours, 363 jokes, 364+province oaths, 1430 a tavern's drinkers — and the
// reference reads it that way (`OpenTESArena`: `GameWorldUiState.cpp`, `DialogueFunctions.cpp`).
// **`game/dialogue.js`** is that reading, and it is where the corpus functions went *with* those
// keys, so there is one law about what a person says and one about who is standing there.
//
// What stayed here is what a person *is*: the roster, the placement, the sex an art name spells,
// the name generator's banks, and the fight words.

import { ArenaRandom } from './arenaRandom.js';
// The archive's *other* people — the generic men and women and the watch, whose families
// the armoured roster below never matched (`peopleKinds.js`).
import { labelForFile } from './peopleKinds.js';

/**
 * What the middle three letters of a `.CFA` people file say the figure is wearing.
 *
 * The reading is the archive's own: those letters are the *only* thing the filename
 * encodes about a person, and each phrase below is a description of that word rather
 * than of a character class or a gender, which the file does not record.
 */
export const ARMOUR_WORDS = Object.freeze({
  // (the fight statistics of each word are in `FIGHT_WORDS`, below the roster)
  UNA: 'plain clothes',
  LTR: 'leather',
  CHN: 'chain mail',
  PLT: 'plate armour',
  BAR: 'furs',
  MAG: 'robes',
  MNK: 'a habit',
});

/** A people file: two set digits, three armour letters, the walk action. */
const FOLK_FILE = /^(\d\d)(UNA|LTR|CHN|PLT|BAR|MAG|MNK)WLK\.CFA$/;

/**
 * The walk files this install actually has, in a stable order.
 *
 * @param {string[]} names  every record name in the archive (`BsaArchive#names()`)
 * @returns {{file: string, set: string, armour: string}[]}
 */
export function folkFromListing(names) {
  const out = [];
  for (const name of names ?? []) {
    const upper = String(name).toUpperCase();
    const match = FOLK_FILE.exec(upper);
    if (!match) continue;
    out.push({ file: upper, set: match[1], armour: match[2] });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

/**
 * The angles the archive ships a person at, in its own order: `1` faces the viewer, `5`
 * shows the back (`game/playerSprite.js` measures the widths that say so).
 * @type {readonly number[]}
 */
export const VIEWS = Object.freeze([1, 2, 3, 4, 5]);

/**
 * One *outfit*: the five angles the archive ships of the same figure.
 * @typedef {object} Outfit
 * @property {string} key       e.g. `0CHN`
 * @property {string} group     the leading digit of the two-digit prefix (`0` or `1`)
 * @property {string} armour    `UNA`…`MNK`
 * @property {Record<number, string>} views  angle 1…5 → file name
 */

/**
 * Fold the install's roster into outfits.
 *
 * A person's **outfit** is one armour writing under one of the archive's two **sexes**,
 * and the archive ships **five directions of it** — `01CHNWLK`…`05CHNWLK` are the same
 * person seen from five sides. The two digits mean what OpenTESArena's human template says
 * they mean (`ExeData.h`'s `0@XXX`: the first digit is the gender, `0` a man and `1` a
 * woman; the second is the direction 1…5, which is also what this module's own widths
 * show — 40/55/69/56/38 px across the five, symmetric about a profile, and identical for
 * every armour word). The first version of `placeTownsfolk` picked a random *file* out of
 * the roster, which is a random *direction*: a townsman stood with his back to the
 * player, or in profile, forever — the reported "npcs don't look at you, they have a
 * static random png that maybe pictures them turned back or to the side".
 *
 * @param {{file: string, set: string, armour: string}[]} folk
 * @returns {Outfit[]}
 */
export function outfitsFromFolk(folk) {
  /** @type {Map<string, Outfit>} */
  const byKey = new Map();
  for (const entry of folk ?? []) {
    const group = String(entry.set ?? '01')[0];
    const view = Number(String(entry.set ?? '01')[1]) || 1;
    const key = `${group}${entry.armour}`;
    let outfit = byKey.get(key);
    if (!outfit) byKey.set(key, outfit = { key, group, armour: entry.armour, views: {} });
    outfit.views[view] = entry.file;
  }
  // A family the archive ships incompletely still has to have an angle for every view.
  for (const outfit of byKey.values()) {
    const fallback = outfit.views[1] ?? Object.values(outfit.views)[0];
    for (const view of VIEWS) if (!outfit.views[view]) outfit.views[view] = fallback;
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * The file for one outfit at one angle.
 * @param {Outfit} outfit @param {number} view  1…5
 * @returns {string}
 */
export function viewFileFor(outfit, view) {
  const v = Math.min(5, Math.max(1, Math.trunc(view) || 1));
  return outfit.views[v] ?? outfit.views[1];
}

/**
 * Which angle shows a person who is looking at `facing` when the eye is at `(camX, camZ)`.
 *
 * The archive's five angles run from straight-on (`1`) to the back (`5`), so the answer is
 * the angle between where the person is looking and where the camera is: facing the camera
 * is `1`, turned away is `5`, and the three in between are equally spaced. This is what
 * makes a townsperson *look at you* as you walk past rather than standing with a back or a
 * profile frozen on screen.
 *
 * @param {number} facing   the person's own yaw, radians
 * @param {number} personX @param {number} personZ
 * @param {number} camX @param {number} camZ
 * @returns {number} 1…5
 */
export function viewFacing(facing, personX, personZ, camX, camZ) {
  const toCamera = Math.atan2(camX - personX, camZ - personZ);
  let delta = Math.abs(toCamera - facing) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return Math.min(5, Math.max(1, 1 + Math.round((4 * delta) / Math.PI)));
}

/**
 * How a person reads on the panel: what they are wearing, and nothing they were not given.
 *
 * @param {string} file  e.g. `01CHNWLK.CFA`
 * @returns {string} e.g. `a person in chain mail`
 */
export function describePerson(file) {
  const match = FOLK_FILE.exec(String(file).toUpperCase());
  const armour = match ? ARMOUR_WORDS[match[2]] : null;
  if (armour) return `a person in ${armour}`;
  // …and the families that carry no armour word: the town's men and women, the watch.
  return labelForFile(file) ?? 'a stranger';
}

/**
 * **The street cells a settlement's people stand on** — one list, two callers.
 *
 * A street cell is: inside the level (never the outer ring, whose wall the mesher now builds),
 * standable by the same test the player's own spawn and the monsters use, over a real floor, and
 * not somebody's decoration (an entity flat is art on the ground, not a place to stand).
 *
 * It is a function because the **static** folk (`placeStaticFolk`, D-48) stand on exactly the
 * same streets as the walking crowd (`placeTownsfolk`): a tavern's patrons, the watch and the
 * king's own picture are placed by the same rule, and a second copy of it is how the two would
 * come to disagree about which cells are walkable.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {{row: number, col: number}|null} arrival
 * @param {number} minCells
 * @returns {{row: number, col: number, distance: number}[]}  the cells at least `minCells` from
 *   the arrival, or every street cell when the level has none that far away
 */
function streetCells(level, arrival, minCells) {
  const standable = (row, col) => {
    if (row < 1 || col < 1 || row >= level.depth - 1 || col >= level.width - 1) return false;
    const cell = level.cells[row * level.width + col];
    if (!cell || cell.solid || cell.floor?.chasm) return false;
    if (!(cell.floor?.texture >= 0)) return false;
    if (cell.kind === 'entity' || (cell.entityFlatIndex ?? -1) >= 0) return false;
    return true;
  };

  const cells = [];
  for (let row = 1; row < level.depth - 1; row++) {
    for (let col = 1; col < level.width - 1; col++) {
      if (!standable(row, col)) continue;
      const distance = arrival ? Math.hypot(row - arrival.row, col - arrival.col) : Infinity;
      cells.push({ row, col, distance });
    }
  }
  if (!cells.length) return [];
  const far = cells.filter((c) => c.distance >= minCells);
  return far.length ? far : cells;
}

/**
 * Who is standing in a settlement.
 *
 * The rule is plain and stated, because Arena's own density table is in `A.EXE` (D11):
 * a city-state has enough people to feel inhabited, a village a handful, and every
 * person stands on a *street cell* — standable by the same test the player's spawn and
 * the monsters use, with no entity flat under their feet (a decoration is not a person's
 * place) and never within `minCells` of the gate the player arrives at.
 *
 * Deterministic in the place's seed, like every other draw in `game/`: come back to the
 * same town and the same people are in the same places, wearing the same things.
 *
 * @param {object} opts
 * @param {import('./mifLevel.js').ArenaLevel} opts.level
 * @param {{file: string, set: string, armour: string}[]} opts.folk  the armoured roster
 * @param {import('./peopleKinds.js').PersonKind[]} [opts.kinds]  the archive's other people
 *   (`peopleKinds.js`): the generic men and women with their walk/talk/die actions, and
 *   the watch. With them the street holds *people* rather than only fighters in armour,
 *   which is the reported "we ported the moving NPCs and are missing the rest".
 * @param {string[]} [opts.art]  **the province's own art** (`game/provinceStyle.js`'s
 *   `peopleArtFor`): a weighted list of roster keys — a key repeated is a key drawn more often —
 *   naming the figures a province's street is built from (D-45, the owner's *"all provinces
 *   should have a mix of people but mostly their race of people"*). Omitted or empty means the
 *   whole roster, which is what a place with no province gets; a key this install does not ship
 *   is dropped rather than replaced by a stranger, so a pool can never empty a street.
 * @param {number} [opts.seed]
 * @param {number} [opts.count]
 * @param {{row: number, col: number}|null} [opts.arrival]
 * @param {number} [opts.minCells]
 * @param {'male'|'female'|null} [opts.sex]  draw only from the roster's own men or women —
 *   the household fix's door (`scenes/interior.js`): a house whose draw came out all one sex
 *   redraws one seat from the other half. A pool with no one of that sex falls back to the
 *   whole draw rather than emptying the room.
 * @returns {{file: string, armour: string, set: string, place: {row: number, col: number, x: number, y: number, z: number}, distance: number, description: string}[]}
 */
export function placeTownsfolk(opts) {
  const level = opts.level;
  const folk = opts.folk ?? [];
  if (!level?.cells?.length || !folk.length) return [];
  const random = new ArenaRandom((opts.seed ?? 1) >>> 0);
  const arrival = opts.arrival ?? null;
  const minCells = opts.minCells ?? 4;
  const pool = streetCells(level, arrival, minCells);
  if (!pool.length) return [];

  const wanted = Math.max(0, Math.min(opts.count ?? 8, pool.length));
  const outfits = outfitsFromFolk(folk);
  // One roster of people: the armoured outfits and the archive's other kinds. Each entry
  // carries `views` (what `viewFileFor` reads) and, for the families that ship them, the
  // actions — walk, **talk** and die — so the street can hold a man in clothes who turns
  // to answer you rather than only figures in armour.
  /** @type {{key: string, views: Record<number,string>, armour: string|null, label: string, actions: object|null, layout: string}[]} */
  const roster = [
    ...outfits.map((outfit) => ({
      key: outfit.key, views: outfit.views, armour: outfit.armour,
      label: `a person in ${ARMOUR_WORDS[outfit.armour] ?? 'plain clothes'}`, actions: null,
      // An armoured figure's walk sheet is **one animation** (6 frames, measured), so the whole
      // sheet is the stride — there is no look or attack layout in it at all.
      layout: 'action',
    })),
    ...(opts.kinds ?? []).filter((kind) => kind?.views?.[1]).map((kind) => ({
      key: kind.key, views: kind.views, armour: null, label: kind.label,
      // **Each action is a direction → file reading** (`peopleKinds.js`): the archive draws one
      // figure from five sides, so the town's men and women carry five walk sheets, five talk
      // sheets and five death sheets, and the scene asks by the direction the eye is in. Before
      // this reading the five directions were five *people*, each frozen in one direction — the
      // owner's "they dont have a proper 360 walking animation or going around them 360
      // animation" (D-47).
      actions: kind.actions ?? null,
      // …and the watch and `BABE` carry Arena's twelve-frame layout, where frames 6…11 are a
      // head-turn and a sword-swing (`peopleKinds.js` reads it off the family; D-42).
      layout: kind.layout ?? 'action',
    })),
  ];
  if (!roster.length) return [];
  // **The province's own art, when it names any** (D-45). The pool is a list of roster *keys*, so
  // a province can only ask for figures this install has; a key it does not have is dropped, and
  // an emptied draw falls back to the whole roster rather than to nobody.
  const byKey = new Map(roster.map((entry) => [entry.key, entry]));
  const wantedArt = (opts.art ?? []).map((key) => byKey.get(String(key))).filter(Boolean);
  const pool0 = wantedArt.length ? wantedArt : roster;
  // **The sex a caller asks for** (the household fix): a seat redrawn for a house that came out
  // all one sex. The roster's own names are the answer (`isFemalePerson`), so an armoured
  // outfit's first digit and the family word `FMGEN`/`MLGEN` do the work, and a figure whose art
  // names no sex (`KHAJIIT`, `ARGONIAN`) is *not* offered as a man or a woman rather than being
  // guessed at.
  const sexed = opts.sex ? pool0.filter((entry) => sexOfArt(entry.key) === opts.sex) : [];
  const draw = sexed.length ? sexed : pool0;
  const people = [];
  const free = pool.slice();
  for (let i = 0; i < wanted; i++) {
    const [place] = free.splice(random.nextBelow(free.length), 1);
    const outfit = draw[random.nextBelow(draw.length)];
    // A person is *looking* somewhere, and it is theirs: a deterministic yaw, so the same
    // stranger stands facing the same way every time the town is visited, and turns to
    // face the player as they pass (`viewFacing`).
    const facing = (random.nextBelow(1024) / 1024) * Math.PI * 2;
    const file = viewFileFor(outfit, 1);
    people.push({
      file,
      armour: outfit.armour,
      set: `${outfit.key}`,
      outfit,
      // The family's own actions, when the archive ships them (`peopleKinds.js`). A
      // person with a `talk` sheet answers the player in their own art; one with a `die`
      // sheet goes down in it instead of vanishing.
      kind: outfit.actions ? outfit.key : null,
      actions: outfit.actions,
      /** 'view' = the sheet carries Arena's layout, so a stride is its first six frames only. */
      layout: outfit.layout ?? 'action',
      facing,
      description: outfit.label ?? describePerson(file),
      place: {
        row: place.row,
        col: place.col,
        x: (place.row + 0.5) * (level.cellSize ?? 1),
        y: level.floorY ?? 1,
        z: (place.col + 0.5) * (level.cellSize ?? 1),
      },
      distance: place.distance,
    });
  }
  return people;
}

/**
 * **A HOUSEHOLD IS A FAMILY** — make a room's small cast two sexes, not one.
 *
 * The owner, 2026-10-18: *"npcs variety in houses because at the moment is only women"*. A house's
 * whole cast is two or three seats drawn from the province's pool, and a small draw can come out
 * all one sex by chance. The rule is not "half of every street" (a street may be anything); it is
 * "a *household* is relatives", and a room whose every figure is a woman or every figure a man is
 * the one shape it cannot be.
 *
 * The **last seat is redrawn**, keeping its cell: the room's people do not move, only one figure
 * changes, and the swap is drawn from the roster's own men or women (`placeTownsfolk`'s `sex`). A
 * roster with nobody of the other sex leaves the room as the pool made it — an honest absence.
 *
 * @param {object[]} people  the room's placed figures (mutated in place, returned)
 * @param {object} opts  what `placeTownsfolk` needs: `level`, `folk`, `kinds`, `art`, `seed`, `arrival`
 * @returns {object[]} the same list, with one seat redrawn when the draw was one-sided
 */
export function balanceHousehold(people, opts = {}) {
  if (!Array.isArray(people) || people.length < 2) return people ?? [];
  const women = people.filter((person) => isFemalePerson(person)).length;
  if (women > 0 && women < people.length) return people;
  const wantedSex = women === 0 ? 'female' : 'male';
  const [swap] = placeTownsfolk({ ...opts, count: 1, minCells: 0, sex: wantedSex });
  if (!swap) return people;
  const seat = people[people.length - 1];
  for (const field of ['file', 'set', 'outfit', 'armour', 'kind', 'actions', 'layout', 'description', 'facing']) {
    seat[field] = swap[field];
  }
  seat.sexSwap = wantedSex;
  return people;
}

/**
 * **STAND THE INSTALL'S STATIC PEOPLE UP** — the figures that never walk (**D-48**).
 *
 * The owner, 2026-10-17: *"there are a lot of missing sprites for the game that most of the time
 * were static npcs in the original game that were not ported … KING … MAN01 … man02 etc that are
 * sitting at the tavern"*. An `.INF` names some of these by hand (`TAVERN.INF`'s drinkers are
 * `MAN01…04`/`WOMAN01…04`, `EQUIP.INF`'s armourer `SMITH.DFA`), and the ones a player walks up to
 * in the open are the same art: one picture of a person, standing.
 *
 * This is `placeTownsfolk`'s twin and shares its whole placement rule (`streetCells`) so a static
 * figure and a walking one can never disagree about which cells a person may stand on. It differs
 * in exactly three things, and each is the point of the family:
 *
 *   * **One picture.** The record's `outfit` carries the family's chosen file under all five
 *     angles, so the billboard path (`viewFileFor`) draws the same standing figure from every side
 *     rather than inventing angles the art does not have, and `layout` is `'static'` so the
 *     animator plays nothing.
 *   * **No actions.** No walk, no talk, no death: the crowd's own half (`placeTownsfolk`) is where
 *     a figure that turns, answers and falls comes from.
 *   * **Facing the arrival.** A standing person faces the room they stand in — the door or the
 *     street the player came in by — instead of a seeded yaw, because a picture that has only one
 *     angle should be presented from the front.
 *
 * @param {object} opts
 * @param {import('./mifLevel.js').ArenaLevel} opts.level
 * @param {Array<{key: string, label: string, files: string[]}>} opts.kinds  a **static** family
 *   list (`peopleKinds.js`'s `staticKindsFromListing`), never the walking crowd's
 * @param {number} [opts.seed]
 * @param {number} [opts.count]
 * @param {{row: number, col: number}|null} [opts.arrival]
 * @param {number} [opts.minCells]
 * @returns {object[]}  the same records `placeTownsfolk` answers with, marked `static: true`
 */
export function placeStaticFolk(opts) {
  const level = opts.level;
  const kinds = (opts.kinds ?? []).filter((kind) => kind?.files?.length);
  if (!level?.cells?.length || !kinds.length) return [];
  const random = new ArenaRandom((opts.seed ?? 1) >>> 0);
  const arrival = opts.arrival ?? null;
  const pool = streetCells(level, arrival, opts.minCells ?? 4);
  if (!pool.length) return [];

  const wanted = Math.max(0, Math.min(opts.count ?? kinds.length, pool.length));
  const free = pool.slice();
  const people = [];
  for (let i = 0; i < wanted; i++) {
    const [place] = free.splice(random.nextBelow(free.length), 1);
    const kind = kinds[i % kinds.length];
    const file = kind.files[random.nextBelow(kind.files.length)];
    // One angle, and it is the front: every view answers the same picture, so the billboard path
    // needs no special case and the figure never turns its back (there is no back in the art).
    const views = Object.fromEntries(VIEWS.map((view) => [view, file]));
    people.push({
      file,
      armour: null,
      set: kind.key,
      outfit: { key: kind.key, group: '0', armour: null, views },
      kind: null,
      actions: null,
      layout: 'static',
      static: true,
      facing: arrival ? Math.atan2(arrival.col - place.col, arrival.row - place.row) : 0,
      description: kind.label ?? describePerson(file),
      place: {
        row: place.row,
        col: place.col,
        x: (place.row + 0.5) * (level.cellSize ?? 1),
        y: level.floorY ?? 1,
        z: (place.col + 0.5) * (level.cellSize ?? 1),
      },
      distance: place.distance,
    });
  }
  return people;
}

/**
 * What a person fights like, when the player gives them reason to.
 *
 * **THIS PROJECT'S NUMBERS, and it says so.** Arena keeps a person's statistics in
 * `A.EXE` (D11) and nobody has published them; the twin has a whole class-and-level system
 * for its folk and this install has none of its data. What the archive *does* say about a
 * person is the **armour word** in their file's name — `UNA`, `LTR`, `CHN`, `PLT`, `BAR`,
 * `MAG`, `MNK` — and armour is exactly what decides how hard somebody is to hurt, so the
 * table is read off that word and scaled against `game/monsters.js`'s own UESP figures: a
 * person in plain clothes is a little harder than a goblin and a person in plate sits where
 * an orc or a skeleton does. Every field is here so a fight against a townsperson is a fair
 * one rather than a formality.
 *
 * `xp` is zero on purpose. Arena does not award experience for cutting down a civilian, and
 * a port that paid for it would be teaching the wrong lesson about the world it reads.
 *
 * @type {Readonly<Record<string, {hp: number, damage: [number, number], agility: number, level: number}>>}
 */
export const FIGHT_WORDS = Object.freeze({
  UNA: { hp: 10, damage: [1, 4], agility: 45, level: 1 },
  MNK: { hp: 14, damage: [2, 5], agility: 65, level: 2 },
  MAG: { hp: 17, damage: [2, 7], agility: 50, level: 2 },
  LTR: { hp: 22, damage: [2, 7], agility: 50, level: 3 },
  BAR: { hp: 26, damage: [2, 9], agility: 45, level: 3 },
  CHN: { hp: 30, damage: [3, 10], agility: 40, level: 4 },
  PLT: { hp: 38, damage: [3, 12], agility: 25, level: 4 },
});

/**
 * Make a fighter out of a person, for the blow they throw or the blow they take.
 *
 * The record is shaped like a **monster** (`game/combat.js`'s `monsterAttack` reads
 * `level` and `damage`, `attackInterval` reads `level`) because that is the fight this
 * game already has — so a person who comes at the player is driven by the same code, with
 * the same reach and cadence, as the creatures in the dungeons. It carries their own name,
 * which is the description the archive's file name gives them, so a notice can say who it
 * was without inventing a person.
 *
 * @param {{file: string, armour: string, description?: string}} person
 * @returns {object|null} null when the armour word is not one the archive ships
 */
export function personFighter(person) {
  const word = String(person?.armour ?? '').toUpperCase();
  // **Everybody can be hit** (the owner, 2026-10-18: *"in cities you should be able to damage
  // ALL moving npcs and they should get angry at you when you do"*). A figure-raced citizen has
  // no armour word in the archive (`armour: null` on a Khajiit or Argonian stand-in), and a
  // named role's own file need not be one of the seven walk rosters, so this used to answer
  // null and `strikeFolk` then reported "nothing within reach" against a body the player was
  // standing in. Unarmoured is the floor of the same table, not a refusal.
  const stats = FIGHT_WORDS[word] ?? FIGHT_WORDS.UNA;
  if (!stats) return null;
  const name = person.description ?? describePerson(person.file);
  return {
    id: `folk:${word}`,
    name,
    sprite: null,
    level: stats.level,
    health: stats.hp,
    maxHealth: stats.hp,
    damage: stats.damage.slice(),
    /** Arena pays nothing for a civilian: the blood is its own reward, and its own cost. */
    xpRate: 0,
    xpBase: 0,
    damageMin: stats.damage[0],
    damageMax: stats.damage[1],
    armour: word || 'UNA',
    agility: stats.agility,
    nextAttack: 0,
  };
}

/**
 * **WHETHER THE FIGURE IS A WOMAN** — read off the art's own name.
 *
 * The owner, 2026-10-18: *"make the name of npcs differenciate between male and female and by
 * race"*. A name cannot be drawn before the sex is known, and the archive already says it three
 * ways, all measured in this project:
 *
 *   * the armoured roster's **first digit** is the sex (`outfitsFromFolk`: `01CHNWLK` a man in
 *     chain, `11CHNWLK` a woman in it — OpenTESArena's `0@XXX` template);
 *   * the family word: `FMGEN`, `FMGENW`, `BABE0`, `WOMAN01` are women, `MLGEN`, `MLGENT`,
 *     `GUARD0`, `MAN01`, `KING`, `SMITH`, `BARTEND` are men;
 *   * anything else — a creature standing in for a race (`ARGONIAN`, `KHAJIIT`), a family with no
 *     sex in its name — takes the caller's draw, so the street is half women without pretending
 *     the art says so.
 *
 * @param {{outfit?: {key?: string}, set?: string, kind?: string}|null} person
 * @param {number} [draw]  0…1 for a figure whose art names no sex
 * @returns {boolean}
 */
export function isFemalePerson(person, draw = 0.5) {
  const key = String(person?.kind ?? person?.outfit?.key ?? person?.set ?? '').toUpperCase();
  if (!key) return Number(draw) < 0.5;
  // The roster's own sex digit (`0` a man, `1` a woman), which no other key begins with.
  if (/^1(?:UNA|LTR|CHN|PLT|BAR|MAG|MNK)$/.test(key)) return true;
  if (/^0(?:UNA|LTR|CHN|PLT|BAR|MAG|MNK)$/.test(key)) return false;
  if (/^(FMGEN|BABE|WOMAN|QUEEN|PRINCESS)/.test(key)) return true;
  if (/^(MLGEN|GUARD|MAN|KING|SMITH|BARTEND|PREST|NOBLE|BEGGAR)/.test(key)) {
    // `FMGEN`-shaped keys never reach here; `PREST`/`NOBLE`/`BEGGAR` are not gendered, so the
    // draw decides them rather than a guess about a robe.
    return /^(PREST|NOBLE|BEGGAR|CHILD)/.test(key) ? Number(draw) < 0.5 : false;
  }
  return Number(draw) < 0.5;
}

/**
 * A roster key's own sex, or null when its art does not name one.
 *
 * `isFemalePerson` answers a *yes/no* for naming (an ungendered figure takes a draw), but a
 * caller placing a seat in a household needs the third answer: a cat-folk's or a lizard-folk's
 * art says nothing, so it cannot stand in for "a man" without the caller lying about it.
 *
 * @param {string} key  e.g. `0CHN`, `FMGENW`, `KHAJIIT`
 * @returns {'male'|'female'|null}
 */
export function sexOfArt(key) {
  const upper = String(key ?? '').toUpperCase();
  if (/^1(?:UNA|LTR|CHN|PLT|BAR|MAG|MNK)$/.test(upper)) return 'female';
  if (/^0(?:UNA|LTR|CHN|PLT|BAR|MAG|MNK)$/.test(upper)) return 'male';
  if (/^(FMGEN|BABE|WOMAN|QUEEN|PRINCESS)/.test(upper)) return 'female';
  if (/^(MLGEN|GUARD|MAN|KING|SMITH|BARTEND|PREST|NOBLE|BEGGAR)/.test(upper)) return 'male';
  return null;
}

/**
 * How many people a settlement of a given kind holds.
 *
 * The roster is the install's and the *count* is this project's (Arena's own population
 * table is in `A.EXE`): raised twice in the crowding passes — first from 14/9/5 to
 * 26/16/10, then to 48/28/14 — a city-state's streets now carry a market-day crowd: two
 * corners do not meet the same five, and a square reads full at noon. Still capped by the
 * street cells there are, still deterministic in the settlement's seed, and still bounded
 * by the old rule that *a street cell stands one person and a crowd may not block a door*.
 */
export function folkCountFor(kind) {
  return kind === 'city' ? 48 : kind === 'town' ? 28 : 14;
}
