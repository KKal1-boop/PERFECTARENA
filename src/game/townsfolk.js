// WHO IS ON THE STREET, AND WHAT THEY SAY.
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
// ## What they say is Arena's own prose
//
// `template.dat` holds 811 recorded lines over 613 ids, and they are written as
// `%`-word templates (`%cn` the country, `%t` a title, `%mm` money …). The id → subject
// map lives in `A.EXE`, which is absent (D11), so what this module does instead is pick
// by *what can be honestly filled*:
//
//   * **1 823 of the file's 2 462 `&`-separated parts are whole sentences**, of which
//     **561 carry no `%`-word at all** — pure prose, and the largest part of the talk
//     corpus. A person's greeting is one of those.
//   * **14 need nothing but a city-state's name** (`%cn`, sometimes `%cn2`), and those
//     make the second question, which is the reason `%cn` substitution is a real feature
//     rather than a claim.
//
//     **`%cn` is the city-state, not the province**, and the game's own prose says so:
//     template `#0` has "it is well known that `%cn` is currently at `%st` with its
//     neighbor, `%cn2`" — that is Arena's political map, where the powers that war with
//     one another are the city-states (Daggerfall, Sentinel, Wayrest) and the province
//     is the region they sit in. `template.dat` even stores whole greetings with the
//     city's name already written into them (`#605`, "We of Evermore welcome you into
//     our walls"), which is what the `%cn` lines are the generic form of. So the name
//     substituted in is the `CITYDATA.64` location the player is standing in, and
//     `%cn2` — its neighbour — is the nearest *other* settlement in the world data.
//
// Anything that would need a word this project cannot supply (a ruler's name, a title, a
// date) is filled with nothing by `fillTemplate` and the line is then *rejected* by this
// module rather than shown with a hole in it. `unit` and browser tests both assert that
// no line ever reaches a player with a `%` still in it.

import { ArenaRandom } from './arenaRandom.js';
import { fillTemplate, placeholdersOf } from '../arena/arenaText.js';
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
 * A person's **outfit** is one armour writing under one of the archive's two figure
 * families, and the archive ships **five angles of it** — `01CHNWLK`…`05CHNWLK` are the
 * same person seen from five sides. The first version of `placeTownsfolk` picked a random
 * *file* out of the roster, which is a random *angle*: a townsman stood with his back to
 * the player, or in profile, forever — the reported "npcs don't look at you, they have a
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
 * @param {number} [opts.seed]
 * @param {number} [opts.count]
 * @param {{row: number, col: number}|null} [opts.arrival]
 * @param {number} [opts.minCells]
 * @returns {{file: string, armour: string, set: string, place: {row: number, col: number, x: number, y: number, z: number}, distance: number, description: string}[]}
 */
export function placeTownsfolk(opts) {
  const level = opts.level;
  const folk = opts.folk ?? [];
  if (!level?.cells?.length || !folk.length) return [];
  const random = new ArenaRandom((opts.seed ?? 1) >>> 0);
  const arrival = opts.arrival ?? null;
  const minCells = opts.minCells ?? 4;

  /** A street cell: standable, floored, and not somebody's decoration. */
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
  const pool = far.length ? far : cells;

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
      key: kind.key, views: kind.views, armour: null, label: kind.label, actions: kind.actions ?? null,
      // …and the watch and `BABE` carry Arena's twelve-frame layout, where frames 6…11 are a
      // head-turn and a sword-swing (`peopleKinds.js` reads it off the family; D-42).
      layout: kind.layout ?? 'action',
    })),
  ];
  if (!roster.length) return [];
  const people = [];
  const free = pool.slice();
  for (let i = 0; i < wanted; i++) {
    const [place] = free.splice(random.nextBelow(free.length), 1);
    const outfit = roster[random.nextBelow(roster.length)];
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
  const stats = FIGHT_WORDS[word];
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
    armour: word,
    agility: stats.agility,
    nextAttack: 0,
  };
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

/**
 * Split one recorded line into the parts Arena separates with `&`.
 *
 * `&` is the game's own part separator, and a record is a *set* of parts that are read
 * together: a lead-in, then the variations it introduces. Each part is one paragraph of
 * one variant, which is exactly the granularity a single answer wants.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function talkParts(text) {
  return String(text).split('&').map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** A part that starts a sentence rather than continuing one. */
const STARTS_A_SENTENCE = /^["'(A-Z0-9]/;
/** …and ends one. */
const ENDS_A_SENTENCE = /[.!?”"]$/;
/** Below this a part is a fragment — an interjection, or a stray word. */
const MIN_LINE_LENGTH = 30;

/**
 * Split `template.dat`'s records into the two corpora this project can honestly use.
 *
 * The first version of this took whole *records*, and it read badly: `&`-separated parts
 * that begin mid-sentence are continuations — "when you really have to be on the lookout
 * for pickpockets", "have been constructing some interior woodwork at the palace" — and
 * handing one to a player as somebody's opening remark is not Arena's prose, it is half
 * of it. So a part is kept only when it **starts and ends a sentence** and is long enough
 * to be one: of the file's 2 462 parts, **1 823** are whole sentences, of which **561**
 * need no substitution and **14** need only the country's name. The counts are measured
 * on the real file and pinned by `tests/unit/townsfolk.test.mjs`, so a different install
 * shows up as a difference rather than as quietly thinner talk.
 *
 * @param {Map<number, string[]>} templates  `library.talkTemplates`
 * @returns {{plain: {id: number, text: string}[], province: {id: number, text: string}[], total: number, parts: number, dropped: number, unfillable: number}}
 */
export function talkCorpus(templates) {
  const plain = [];
  const province = [];
  let total = 0;
  let parts = 0;
  let dropped = 0;
  let unfillable = 0;
  for (const [id, lines] of templates ?? []) {
    for (const text of lines) {
      total++;
      for (const part of talkParts(text)) {
        parts++;
        if (part.length < MIN_LINE_LENGTH || !STARTS_A_SENTENCE.test(part) || !ENDS_A_SENTENCE.test(part)) {
          dropped++;
          continue;
        }
        const words = placeholdersOf(part);
        if (!words.length) plain.push({ id, text: part });
        else if (words.every((w) => w === 'cn' || w === 'cn2')) province.push({ id, text: part });
        else unfillable++;
      }
    }
  }
  plain.sort((a, b) => (a.id - b.id) || a.text.localeCompare(b.text));
  province.sort((a, b) => (a.id - b.id) || a.text.localeCompare(b.text));
  return { plain, province, total, parts, dropped, unfillable };
}

/**
 * Fill a template with what is known about where the player is standing.
 *
 * `where.place` is the city-state's name out of `CITYDATA.64` and `where.neighbour` the
 * nearest other settlement's — both the game's own names for real places, not words this
 * project made up. When there is no place (a dungeon, a bare map file) the caller has
 * nothing to substitute and the line is refused rather than filled with an invention.
 *
 * @param {string} template
 * @param {{place?: string, neighbour?: string}} where
 * @returns {{text: string, filled: Record<string, string>, unfilled: string[]}}
 */
export function fillTalkLine(template, where) {
  const values = { cn: where.place ?? '', cn2: where.neighbour ?? '' };
  // `fillTemplate` *drops* a word it is not given, which turns "The %t of %cn" into
  // "The of Daggerfall" — a line that looks filled and is not. So the report names the
  // words the project could not supply, which is the truth about why a line is refused,
  // rather than which placeholder happens to be left over.
  const missing = placeholdersOf(template).filter((word) => !values[word]);
  const text = fillTemplate(template, values);
  return { text, filled: values, unfilled: [...new Set([...missing, ...placeholdersOf(text)])] };
}

/**
 * One person's line, from the corpus, in their own words.
 *
 * `turn` is how many times this person has been spoken to: a stranger who answers the
 * same question twice with the same sentence is the one thing that makes a talk system
 * feel dead, so each person **walks** the corpus one line at a time from wherever their
 * own seed puts them. Two neighbours start in different places, and nobody repeats
 * themselves until they have said everything there is to say.
 *
 * @param {{plain: {id: number, text: string}[]}} corpus
 * @param {number} seed
 * @param {number} [turn]
 * @returns {{id: number, text: string}|null}
 */
export function greetingFor(corpus, seed, turn = 0) {
  const lines = corpus?.plain ?? [];
  if (!lines.length) return null;
  const start = Math.abs(Math.trunc(seed)) % lines.length;
  return lines[(start + Math.trunc(turn)) % lines.length];
}

/**
 * The questions a person can answer here, each answered with Arena's own prose.
 *
 * The *labels* are this project's — Arena keeps its topic list in `A.EXE` (D11) — and the
 * answers are the game's own lines. Two questions is what the corpus supports honestly:
 * one more line of local talk, and one about the city-state the player is standing in,
 * which is the only kind of line this project can fill a `%`-word in without inventing
 * one. When there is no place to name, the second question is simply not offered.
 *
 * @param {{plain: {id: number, text: string}[], province: {id: number, text: string}[]}} corpus
 * @param {{place?: string, neighbour?: string}} where
 * @param {number} seed
 * @returns {{key: string, label: string, text: string, id: number|null}[]}
 */
export function topicsFor(corpus, where, seed) {
  const topics = [];
  const here = greetingFor(corpus, seed, 1);
  if (here) topics.push({ key: 'here', label: 'this place', text: here.text, id: here.id });

  const told = corpus?.province ?? [];
  if (told.length && where?.place) {
    const line = told[Math.abs(Math.trunc(seed) * 31 + 7) % told.length];
    const filled = fillTalkLine(line.text, where);
    if (!filled.unfilled.length) {
      topics.push({ key: 'city', label: where.place, text: filled.text, id: line.id });
    }
  }
  return topics;
}
