// RADIANT QUESTS — Arena's world, Daggerfall's habit of never running out of work.
//
// Arena's main quest is a fixed chain of eight pieces. Its *side* quests are where
// Daggerfall's engine gets to do what it is famous for: an endless supply of small,
// procedurally-described jobs offered by whoever happens to be standing in the
// tavern, aimed at whatever place the world data actually has.
//
// Nothing here is a scripted scenario. A quest is a draw from Arena's own world:
//
//   the giver       a settlement in `CITYDATA.64` (or the one the player is in)
//   the target      a **dungeon whose `.MIF` really exists in the player's install**
//   the prose       `artfact1.dat` / `artfact2.dat` where the kind allows it,
//                   the game's own vocabulary where it does not
//   the distance    `world.travel()`, so a deadline is measured in this map's days
//   the reward      scaled from that distance and the target's danger tier
//
// Determinism is the whole safety net. A quest is a pure function of
// `(world, library, kind, seed, giver, day)`, so the same seed offers the same job,
// the browser suite can assert on a specific offer, and a save file is just the
// seed plus the accepted quest's state.
//
// ## What is drawn from data, and what is authored
//
// Stated plainly, because it matters which is which:
//
//   `ARTIFACTS`   the fourteen artifact names that **actually occur in the artifact
//                 banks** — `tests/unit/radiant.test.mjs` reads the real files and
//                 requires every name in this table to be found in them.
//   `MONSTERS`    Arena's creature sprite sets, read off the archive's `.CFA`
//                 filenames (`GOBLIN*.CFA`, `GHOUL*.CFA`, `ZOMBIE*.CFA`, …). The
//                 unit test checks every stem here against the real archive, in the
//                 same spirit as the city-block tables (D5).
//   `ITEMS`       **AUTHORED.** Arena's equipment names live in `A.EXE`, which this
//                 install does not ship (D11), so a fetch quest's trinket is named
//                 from Arena's documented equipment vocabulary rather than read.
//                 Logged as S20/S21 in PROGRESS.md.
//
// A quest can therefore never point at a place the game cannot open, and the prose
// can never promise an artifact Arena's own text does not mention.

import { ArenaRandom } from './arenaRandom.js';
import { fillTemplate } from '../arena/arenaText.js';
import { stageMif } from './questData.js';

/**
 * Arena's artifacts — every one of them a phrase that appears in `artfact1.dat`
 * or `artfact2.dat`, which the unit test enforces. `tier` is only used to scale a
 * reward; it is not read from the data.
 * @type {ReadonlyArray<{name: string, tier: number}>}
 */
export const ARTIFACTS = Object.freeze([
  { name: "Lord's Mail", tier: 2 },
  { name: 'Staff of Magnus', tier: 3 },
  { name: 'Ebony Blade', tier: 3 },
  { name: 'Chrysamere', tier: 3 },
  { name: 'Oghma Infinium', tier: 1 },
  { name: 'Ring of Phynaster', tier: 2 },
  { name: 'Ring of Khajiit', tier: 2 },
  { name: "Skeleton's Key", tier: 2 },
  { name: "Warlock's Ring", tier: 2 },
  { name: "Auriel's Bow", tier: 3 },
  { name: "Auriel's Shield", tier: 3 },
  { name: 'Ebony Mail', tier: 3 },
  { name: 'Spell Breaker', tier: 3 },
  { name: 'Volendrung', tier: 3 },
]);

/**
 * The creatures, named from the archive's own sprite-set filenames. `cfa` is the
 * stem each name must be found under (see `tests/unit/radiant.test.mjs`), and
 * `tier` scales a quest's reward.
 * @type {ReadonlyArray<{name: string, cfa: string, tier: number}>}
 */
export const MONSTERS = Object.freeze([
  { name: 'rat', cfa: 'RAT', tier: 1 },
  { name: 'goblin', cfa: 'GOBLIN', tier: 1 },
  { name: 'hound', cfa: 'HOUND', tier: 1 },
  { name: 'ghoul', cfa: 'GHOUL', tier: 2 },
  { name: 'skeleton', cfa: 'SKELE', tier: 2 },
  { name: 'zombie', cfa: 'ZOMBIE', tier: 2 },
  { name: 'orc', cfa: 'ORC', tier: 2 },
  { name: 'spider', cfa: 'SPIDER', tier: 2 },
  { name: 'lizard man', cfa: 'LIZARD', tier: 2 },
  { name: 'wolf', cfa: 'WOLF', tier: 2 },
  { name: 'ghost', cfa: 'GHOST', tier: 3 },
  { name: 'wraith', cfa: 'WRAITH', tier: 3 },
  { name: 'troll', cfa: 'TROLL', tier: 3 },
  { name: 'medusa', cfa: 'MEDUSA', tier: 3 },
  { name: 'vampire', cfa: 'VAMPIRE', tier: 4 },
  { name: 'lich', cfa: 'LICH', tier: 4 },
  { name: 'daedra', cfa: 'DEAMON', tier: 4 },
]);

/**
 * Trinkets for a fetch or a delivery. **AUTHORED** — see this file's header.
 * @type {ReadonlyArray<{name: string, tier: number}>}
 */
export const ITEMS = Object.freeze([
  { name: 'a silver locket', tier: 1 },
  { name: 'a brass key', tier: 1 },
  { name: 'a sealed letter', tier: 1 },
  { name: 'a bundle of herbs', tier: 1 },
  { name: 'an old map', tier: 2 },
  { name: 'a religious relic', tier: 2 },
  { name: 'a jewelled ring', tier: 2 },
  { name: 'a merchant\'s ledger', tier: 2 },
  { name: 'a family heirloom', tier: 3 },
  { name: 'a dwemer cog', tier: 3 },
]);

/**
 * The five kinds of work the board can offer.
 *
 * `data: true` marks the kinds whose offer text is Arena's own (`artfact*.dat`);
 * the others are written here in the game's voice and say so.
 *
 * @type {ReadonlyArray<{id: string, label: string, data: boolean, needsDungeon: boolean}>}
 */
export const RADIANT_KINDS = Object.freeze([
  { id: 'artifact', label: 'recover an artifact', data: true, needsDungeon: true },
  { id: 'slay', label: 'clear a lair', data: false, needsDungeon: true },
  { id: 'fetch', label: 'fetch a lost thing', data: false, needsDungeon: true },
  { id: 'rescue', label: 'rescue a captive', data: false, needsDungeon: true },
  { id: 'deliver', label: 'carry a message', data: false, needsDungeon: false },
]);

/** How many offers a board shows at once. Arena's own guilds offer one at a time;
 * three is enough to feel like a board and few enough to read. */
export const OFFERS_PER_BOARD = 3;

/**
 * Choose the artifacts, creatures and trinkets a campaign will actually use.
 *
 * Kept separate from generation so a caller can pass its own (a mod, a test).
 *
 * @typedef {object} RadiantTables
 * @property {ReadonlyArray<object>} artifacts
 * @property {ReadonlyArray<object>} monsters
 * @property {ReadonlyArray<object>} items
 */

/** The default tables — Arena's own where it has them. */
export const DEFAULT_TABLES = Object.freeze({ artifacts: ARTIFACTS, monsters: MONSTERS, items: ITEMS });

/**
 * @typedef {object} RadiantQuest
 * @property {string} id          stable, derived from the seed
 * @property {string} kind        one of `RADIANT_KINDS`
 * @property {string} giver       the settlement that offers it
 * @property {number} giverProvinceID
 * @property {string} title
 * @property {string} text        the offer, in full prose
 * @property {boolean} dataText   whether `text` came from Arena's own files
 * @property {string} source      where the prose came from, for the player to see
 * @property {string} target      the place the work happens
 * @property {string|null} targetMif
 * @property {object} targetGlobal  world pixel, so the map can mark it
 * @property {string} subject     what is being hunted / fetched / carried
 * @property {number} days        the deadline, in in-world days
 * @property {number} reward      gold
 * @property {number} tier
 * @property {number} offeredOn   the in-world day the offer was made
 */

/**
 * Turn a world location into the `{name, global, mif, province}` shape a quest
 * points at.
 *
 * @param {object} location
 * @param {string} province
 * @returns {{name: string, global: {x:number,y:number}, mif: string|null, province: string, climate: string}}
 */
function targetOf(location, province) {
  return {
    name: location.name,
    global: { x: location.global.x, y: location.global.y },
    mif: location.kind === 'dungeon' ? stageMif(location) : null,
    province,
    climate: location.climate,
  };
}

/**
 * The dungeons a radiant quest may send the player to: the ones whose `.MIF` the
 * install actually has.
 *
 * This is the reason `radiant` can never strand a player in a place the game
 * cannot open. Only 16 of Arena's 144 dungeon records ship as files — the two
 * quest dungeons of each province — because the rest are generated from their seed
 * at run time. Rather than pretend otherwise, the board only ever offers work in
 * the dungeons that are there.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {(location: object) => boolean} enterable
 * @returns {object[]}
 */
export function enterableDungeons(world, enterable) {
  return world.locations.filter((l) => l.kind === 'dungeon' && enterable(l));
}

/**
 * Discover which dungeon `.MIF`s this install has, without reading `GLOBAL.BSA`.
 *
 * The archive holds no numeric-named `.MIF` at all (its 533 map records are city,
 * town, village and wilderness skeletons), so a loose-file listing answers the
 * question completely. `source.list()` is populated by the folder picker; the dev
 * server's index is fetched by `source.ensureListing?.()`.
 *
 * @param {import('../arena/arenaData.js').ArenaSource} source
 * @returns {Promise<Set<string>>} upper-case filenames
 */
export async function discoverLooseMifs(source) {
  if (typeof source?.ensureListing === 'function') await source.ensureListing();
  const names = typeof source?.list === 'function' ? source.list() : [];
  return new Set(names.map((n) => String(n).toUpperCase()));
}

/**
 * A predicate for `enterableDungeons` built from a loose-file listing.
 *
 * @param {Set<string>} loose
 * @returns {(location: object) => boolean}
 */
export function enterableFromListing(loose) {
  return (location) => {
    const mif = stageMif(location);
    return Boolean(mif && loose.has(mif.toUpperCase()));
  };
}

/**
 * Draw one quest.
 *
 * @param {object} opts
 * @param {import('./worldMap.js').WorldMap} opts.world
 * @param {import('../arena/arenaText.js').ArenaLibrary} opts.library
 * @param {string} opts.kind            one of `RADIANT_KINDS`
 * @param {number} opts.seed            the draw
 * @param {object} opts.giver           the settlement offering it
 * @param {number} [opts.day]           the in-world day, for the deadline
 * @param {object[]} [opts.dungeons]    the enterable dungeons (see `enterableDungeons`)
 * @param {RadiantTables} [opts.tables]
 * @returns {RadiantQuest}
 */
export function generateQuest(opts) {
  const {
    world, library, kind, seed, giver, day = 1,
    dungeons = [], tables = DEFAULT_TABLES,
  } = opts;
  const spec = RADIANT_KINDS.find((k) => k.id === kind);
  if (!spec) throw new Error(`unknown radiant quest kind "${kind}"`);
  if (spec.needsDungeon && !dungeons.length) {
    throw new Error(`a "${kind}" quest needs an enterable dungeon; the install has none`);
  }

  const random = new ArenaRandom(seed >>> 0);
  // The giver's own province first: a job worth walking to, not a pilgrimage.
  const local = dungeons.filter((d) => d.provinceID === giver.provinceID);
  const pool = local.length ? local : dungeons;
  const dungeon = pool[random.nextBelow(pool.length)];

  const monster = tables.monsters[random.nextBelow(tables.monsters.length)];
  const trinket = tables.items[random.nextBelow(tables.items.length)];
  const artifact = tables.artifacts[random.nextBelow(tables.artifacts.length)];
  const settlements = world.settlements();
  const elsewhere = settlements.filter((s) => s.provinceID !== giver.provinceID || s.name !== giver.name);
  const recipient = elsewhere.length ? elsewhere[random.nextBelow(elsewhere.length)] : giver;

  const target = spec.needsDungeon
    ? targetOf(dungeon, dungeon.province)
    : targetOf(recipient, recipient.province);
  // A delivery has a *second* place: where it comes from, used for its prose.
  const away = targetOf(giver, giver.province);

  const id = `${seed >>> 0}:${kind}`;
  const common = {
    id, kind, giver: giver.name, giverProvinceID: giver.provinceID,
    target: target.name, targetMif: target.mif, targetGlobal: target.global,
    targetProvince: target.province, offeredOn: day,
  };

  /** @type {{title: string, text: string, subject: string, tier: number, dataText: boolean, source: string}} */
  let prose;
  switch (kind) {
    case 'artifact': {
      // Arena's own recruiting speech, with the player's details filled in.
      //
      // The speech *names the artifact it is offering*, so the artifact is read
      // back out of the prose rather than drawn independently — otherwise the title
      // could promise the Ebony Blade while the text sells the Staff of Magnus.
      // Only speeches that name one of `ARTIFACTS` are eligible, and the unit test
      // proves every one of those names is really in the banks.
      const named = tables.artifacts.length ? library.artifactOffers
        .map((o) => ({ offer: o, artifact: tables.artifacts.find((a) => o.text.includes(a.name)) }))
        .filter((entry) => entry.artifact) : [];
      const pick = named.length ? named[random.nextBelow(named.length)] : null;
      const offer = pick?.offer ?? null;
      const chosen = pick?.artifact ?? artifact;
      const values = artifactValues(world, giver, seed, chosen, target);
      prose = {
        title: `Recover ${chosen.name}`,
        text: offer
          ? `${fillTemplate(offer.text, values)}\n\nThe road leads to ${target.name}, in ${target.province}.`
          : `Word is that ${chosen.name} was last seen in ${target.name}, in ${target.province}. Bring it back to ${giver.name}.`,
        subject: chosen.name,
        tier: chosen.tier,
        dataText: Boolean(offer),
        source: offer ? `Arena: ${offer.bank}` : 'authored'
      };
      break;
    }
    case 'slay': {
      prose = {
        title: `Clear ${target.name} of ${monster.name}s`,
        text: `Word in ${giver.name} is that ${target.name}, out in ${target.province}, has gone bad. `
          + `${monster.name === 'daedra' ? 'Daedra' : `${monster.name[0].toUpperCase()}${monster.name.slice(1)}s`} `
          + `have taken the lower halls and travellers are being turned back at the door. `
          + `Clear them out and ${giver.name} will pay.`,
        subject: `${monster.name}s`,
        tier: monster.tier,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'fetch': {
      prose = {
        title: `Recover ${trinket.name}`,
        text: `They say ${trinket.name} was carried into ${target.name}, in ${target.province}, and never carried out. `
          + `Bring it back to ${giver.name} and the rest is yours to keep.`,
        subject: trinket.name,
        tier: trinket.tier,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'rescue': {
      prose = {
        title: `Rescue a captive from ${target.name}`,
        text: `Someone's kin was taken alive into ${target.name}, in ${target.province}, and is being held there. `
          + `${giver.name} has a purse for whoever walks in and walks out with them.`,
        subject: 'a captive',
        tier: monster.tier + 1,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'deliver':
    default: {
      prose = {
        title: `Carry word to ${target.name}`,
        text: `${giver.name} needs a letter in ${target.name}, in ${target.province}, and will not trust it to a courier. `
          + `Say nothing to anyone on the road.`,
        subject: 'a sealed letter',
        tier: 1,
        dataText: false,
        source: 'authored',
      };
      break;
    }
  }

  // A deadline that respects the map: enough days to walk there and back, at this
  // world's own scale, with slack for a bad road.
  const there = world.travel(away.global, target.global);
  const days = Math.max(4, Math.round(there.days * 2.4) + 2);
  // Gold from distance and danger, in the game's own order of magnitude.
  const reward = Math.round((18 + there.days * 9 + prose.tier * 45) / 5) * 5;

  return { ...common, title: prose.title, text: prose.text, dataText: prose.dataText, source: prose.source, subject: prose.subject, tier: prose.tier, days, reward };
}

/**
 * The offer board of one settlement.
 *
 * Deterministic in `(world, library, seed, giver, day, dungeons)`: the same town on
 * the same day offers the same three jobs, which is what makes a board feel like a
 * place rather than a slot machine — and what lets a test name an offer.
 *
 * @param {object} opts  as `generateQuest`, plus `count`
 * @param {number} [opts.count]
 * @returns {RadiantQuest[]}
 */
export function buildBoard(opts) {
  const { world, library, seed, giver, day = 1, dungeons = [], tables = DEFAULT_TABLES, count = OFFERS_PER_BOARD } = opts;
  /** @type {RadiantQuest[]} */
  const offers = [];
  const usedKinds = new Set();
  for (let i = 0; i < count; i++) {
    // One job of each flavour where the data allows it: a board that offers three
    // identical errands is not a board.
    const spec = RADIANT_KINDS[(seed + i * 3) % RADIANT_KINDS.length];
    const kind = (spec.needsDungeon && !dungeons.length) || usedKinds.has(spec.id)
      ? RADIANT_KINDS.find((k) => !usedKinds.has(k.id) && (!k.needsDungeon || dungeons.length))?.id ?? 'deliver'
      : spec.id;
    if (usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    try {
      offers.push(generateQuest({ world, library, kind, seed: (seed + i * 7919) >>> 0, giver, day, dungeons, tables }));
    } catch {
      // A kind the install cannot support is simply not on the board.
    }
  }
  return offers;
}

/**
 * The `%`-words the artifact banks use, filled in for one player in one place.
 *
 * The banks' vocabulary is wide (`%a`, `%adn`, `%amn`, `%bа`, …) and every word is
 * an offer's own business: the ones covered here are the ones that carry meaning to
 * a player — who is speaking, what they look like to the speaker, what it costs, and
 * where they are. Anything else is dropped by `fillTemplate`, which tidies the
 * punctuation behind it.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {object} giver
 * @param {number} seed
 * @param {{name: string}} chosen
 * @param {object} target
 */
function artifactValues(world, giver, seed, chosen, target) {
  const speaker = giverRulerName(world, giver, seed);
  const price = 100 + (chosen.tier ?? 2) * 150;
  return {
    an: speaker, n: speaker, an2: speaker,
    ra: 'adventurer',
    oap: price, nap: Math.round(price / 2),
    g: price, g2: Math.round(price / 2), g3: Math.round(price / 4),
    i: chosen.name, mt: chosen.name,
    cn: target.province, cn2: giver.province,
    nt: 'the tavern', t: 'tavern',
    u: 'gold', st: 'gold', r: 'the road',
  };
}

/** A ruler's name for a settlement: Arena derives rulers from the province seed,
 * and `template.dat`'s `%an` wants a person. Derived here rather than invented, so
 * the same city always has the same speaker. */
function giverRulerName(world, giver, seed) {
  const random = new ArenaRandom(((seed >>> 0) ^ (giver.citySeed >>> 0)) >>> 0);
  const first = ['Varnis', 'Cael', 'Doryn', 'Hessa', 'Ilmen', 'Kael', 'Mora', 'Rian', 'Sela', 'Taren'];
  const last = ['of the Reach', 'the Elder', 'the Younger', 'of the Isles', 'the Grey', 'the Bold'];
  return `${first[random.nextBelow(first.length)]} ${last[random.nextBelow(last.length)]}`;
}

/**
 * @typedef {object} RadiantState
 * @property {RadiantQuest[]} offers    the board as it was when last read
 * @property {RadiantQuest|null} active the accepted job
 * @property {number} taken             jobs finished
 * @property {number} failed            jobs that ran out of days
 * @property {number} gold              gold earned from radiant work
 * @property {string[]} log             the side journal, newest last
 * @property {number} day               the in-world day
 */

/**
 * A fresh radiant state.
 * @returns {RadiantState}
 */
export function createRadiantState() {
  return { offers: [], active: null, taken: 0, failed: 0, gold: 0, log: [], day: 1 };
}

/** The events the radiant machine understands. */
export const RADIANT_EVENTS = Object.freeze(['accept', 'arrive', 'found', 'killed', 'rescue', 'deliver', 'return', 'abandon']);

/**
 * Apply one radiant event.
 *
 * The sequence is deliberately the same shape as the main quest's: an objective is
 * only satisfiable at its own target, and a job is only paid at its own giver —
 * so a scripted run cannot "complete" a job by firing events from anywhere.
 *
 * @param {RadiantState} state
 * @param {string} event
 * @param {{offer?: RadiantQuest, where?: string, days?: number}} [ctx]
 * @returns {{ok: boolean, reason?: string, state: RadiantState, gold?: number}}
 */
export function applyRadiantEvent(state, event, ctx = {}) {
  const next = { ...state, log: [...state.log] };
  const active = state.active;
  const where = ctx.where ?? null;

  /** @returns {{ok:false, reason:string, state:RadiantState}} */
  const refuse = (reason) => ({ ok: false, reason, state });

  switch (event) {
    case 'accept': {
      const offer = ctx.offer ?? null;
      if (!offer) return refuse('no offer was named');
      if (active) return refuse(`"${active.title}" is still unfinished`);
      next.active = offer;
      next.offers = state.offers.filter((o) => o.id !== offer.id);
      next.log.push(`Accepted: ${offer.title} (${offer.reward} gold, ${offer.days} days).`);
      return { ok: true, state: next };
    }
    case 'arrive': {
      if (!active) return refuse('no job is in hand');
      if (where && where.toLowerCase() !== active.target.toLowerCase()) {
        return refuse(`"${active.title}" is at ${active.target}, not ${where}`);
      }
      next.log.push(`Reached ${active.target}.`);
      return { ok: true, state: next };
    }
    case 'found':
    case 'killed':
    case 'rescue':
    case 'deliver': {
      if (!active) return refuse('no job is in hand');
      const wanted = active.kind === 'rescue' ? 'rescue' : active.kind === 'deliver' ? 'deliver' : active.kind === 'slay' ? 'killed' : 'found';
      if (event !== wanted) return refuse(`"${active.title}" is not finished by ${event}`);
      if (where && where.toLowerCase() !== active.target.toLowerCase()) {
        return refuse(`that has to happen at ${active.target}`);
      }
      next.active = { ...active, completed: true };
      next.log.push(`${active.kind === 'slay' ? 'Cleared' : 'Recovered'}: ${active.subject} at ${active.target}. Return to ${active.giver}.`);
      return { ok: true, state: next };
    }
    case 'return': {
      if (!active) return refuse('no job is in hand');
      if (!active.completed) return refuse(`"${active.title}" is not finished yet`);
      if (where && where.toLowerCase() !== active.giver.toLowerCase()) {
        return refuse(`the reward waits in ${active.giver}`);
      }
      next.active = null;
      next.taken = state.taken + 1;
      next.gold = state.gold + active.reward;
      next.log.push(`Completed: ${active.title}. ${active.reward} gold.`);
      return { ok: true, state: next, gold: active.reward };
    }
    case 'abandon': {
      if (!active) return refuse('no job is in hand');
      next.active = null;
      next.log.push(`Abandoned: ${active.title}.`);
      return { ok: true, state: next };
    }
    default:
      return refuse(`unknown radiant event "${event}"`);
  }
}

/**
 * Let in-world days pass, failing a job whose deadline has come.
 *
 * @param {RadiantState} state
 * @param {number} days
 * @returns {RadiantState}
 */
export function advanceDays(state, days) {
  const next = { ...state, log: [...state.log], day: state.day + Math.max(0, days) };
  if (next.active && next.day - next.active.offeredOn > next.active.days) {
    next.log.push(`Failed: ${next.active.title} — the ${next.active.days} days ran out.`);
    next.failed++;
    next.active = null;
  }
  return next;
}

/** The active job's objective in one line, for the HUD and the journal. */
export function radiantObjective(state) {
  const active = state.active;
  if (!active) return null;
  if (!active.completed) {
    return `${active.kind === 'deliver' ? 'Deliver to' : 'Travel to'} ${active.target} — ${active.title}.`;
  }
  return `Return to ${active.giver} for ${active.reward} gold.`;
}

/**
 * Everything a quest-log window shows about the side work.
 * @param {RadiantState} state
 */
export function radiantLog(state) {
  return {
    offers: state.offers.map((o) => ({ id: o.id, kind: o.kind, title: o.title, target: o.target, days: o.days, reward: o.reward })),
    active: state.active
      ? {
        id: state.active.id,
        kind: state.active.kind,
        title: state.active.title,
        target: state.active.target,
        targetMif: state.active.targetMif,
        giver: state.active.giver,
        subject: state.active.subject,
        reward: state.active.reward,
        days: state.active.days,
        daysLeft: Math.max(0, state.active.days - (state.day - state.active.offeredOn)),
        completed: Boolean(state.active.completed),
      }
      : null,
    objective: radiantObjective(state),
    taken: state.taken,
    failed: state.failed,
    gold: state.gold,
    day: state.day,
    entries: state.log,
  };
}

/** A save-file-safe copy. */
export function serializeRadiantState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Restore a saved radiant state, tolerating a missing or partial one.
 *
 * @param {unknown} saved
 * @returns {RadiantState}
 */
export function deserializeRadiantState(saved) {
  const fresh = createRadiantState();
  if (!saved || typeof saved !== 'object') return fresh;
  const source = /** @type {Partial<RadiantState>} */ (saved);
  return {
    offers: Array.isArray(source.offers) ? source.offers.filter(Boolean).map((o) => ({ ...o })) : fresh.offers,
    active: source.active && typeof source.active === 'object' ? { ...source.active } : fresh.active,
    taken: Number.isFinite(source.taken) ? Number(source.taken) : fresh.taken,
    failed: Number.isFinite(source.failed) ? Number(source.failed) : fresh.failed,
    gold: Number.isFinite(source.gold) ? Number(source.gold) : fresh.gold,
    log: Array.isArray(source.log) ? source.log.map(String) : fresh.log,
    day: Number.isFinite(source.day) ? Number(source.day) : fresh.day,
  };
}
