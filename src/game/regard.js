// FRIENDS AND ENEMIES — who in Arena's world knows you, and how they feel about it.
//
// This is the twin project's *law* (`daggerfall/src/systems/livingWorld/relations.js`,
// Living-World.md), cut down to what an Arena town can honestly support. The twin keeps a
// **regard** per resident of its living world — a number that rises when the player talks
// to somebody, does them a good turn, or stands beside them in a fight, and falls when the
// player strikes them or robs a caravan before their eyes. The number is read as a
// *standing*: a friend above `FRIEND_AT`, an enemy below `ENEMY_AT`, an armed one draws on
// you below `HOSTILE_AT`. Regard **eases back toward nothing** a day the player does not
// see them, so a quarrel fades and so does a friendship.
//
// ## What is the same as the twin, and what is Arena's
//
// Same law, same numbers where the same act exists in both games: `talk` +3 once a day,
// `gift` +8, `helped` +20, `saved` +35, `struck` −45, `crime` −15, `slain` −75, easing
// `EASE_PER_DAY` per day apart, the same thresholds and the same asymmetric easings (a
// negative regard climbs to zero, a positive one falls to it, and neither crosses).
//
// The acts Arena's port can actually perform are the ones it notes: **`talk`** (speaking
// to somebody), **`job`** (their own work, carried out and brought back — see
// `radiantQuests.js`), **`struck`** (the player's blow landing on a townsperson), and
// **`slain`** (one struck down). `gift`, `helped` and `saved` are kept in the table because
// they are the twin's law and a gift or an allied fight is a thing this game could grow —
// but nothing fires them yet, and this comment says so rather than implying they work.
//
// ## The identity is the cell, and that is the honest key
//
// The twin keys a regard by a resident's **census id** — `L<map>.<slot>`, a name minted
// from the town's seed. Arena's port has no such thing: nobody in this game has a name at
// all (the name tables are in `A.EXE`, which this install does not ship — S30 in
// PROGRESS.md), and the town's people are placed deterministically from the settlement's
// seed. So a person's identity here is **the place they stand in and the cell they were
// placed on** — `Daggerfall#12,7` — which is stable for as long as the seed is, and is
// already what `radiantQuests.personOffer` draws their job from. Two people never share a
// cell, so two people never share a regard.
//
// The record is plain JSON — no maps, no class instances — because it rides the same save
// as everything else (`game/save.js`), and the round-trip is a test rather than a promise.

/** The regard at which a person is a friend: a greeting, and their ear. */
export const FRIEND_AT = 40;
/** The regard below which a person is an enemy: no words for you. */
export const ENEMY_AT = -40;
/** The regard below which a person is an enemy with a weapon in hand. */
export const HOSTILE_AT = -70;
export const REGARD_MIN = -100;
export const REGARD_MAX = 100;
/** How much regard eases back toward nothing for each day the player does not see them. */
export const EASE_PER_DAY = 0.5;
/** The most people remembered: the faintest and longest-unseen leave first. */
export const PEOPLE_MAX = 300;

/**
 * What moves a regard, and by how much.
 *
 * The numbers are the twin's own table, so a "friend" means the same thing in both
 * projects. `talk` counts **once a day per person**, which is the twin's rule and the one
 * that matters: without it, standing in front of a stranger and pressing `T` fifty times
 * buys a friendship, and a regard a player can farm by pressing a key is not a regard.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const REGARD_EVENTS = Object.freeze({
  talk: 3,        // a word exchanged (the talk panel opened on them; once a day)
  job: 25,        // their own work carried out and brought back to them (radiantQuests)
  gift: 8,        // a gift given          — the twin's law; nothing fires it yet
  helped: 20,     // a blow struck for them — the twin's law; nothing fires it yet
  saved: 35,      // their fight won with them standing — the twin's law; nothing fires it yet
  struck: -45,    // struck by the player
  theft: -15,     // a thing of theirs taken before them
  slain: -75,     // one struck down by the player
});

/**
 * A person's id: the place they stand in, and the cell they were placed on.
 *
 * `place` is a settlement's name out of `CITYDATA.64` (the same name `worldMap` carries
 * and `radiantQuests` uses as a giver), and `home` is the `{row, col}` cell
 * `townsfolk.placeTownsfolk` put them on — never the cell they are *standing* on, because
 * they walk.
 *
 * @param {string|null|undefined} place
 * @param {{row: number, col: number}|null|undefined} home
 * @returns {string|null} null when there is no place or no cell to name them by
 */
export function personId(place, home) {
  const name = typeof place === 'string' ? place.trim() : '';
  const row = Number(home?.row);
  const col = Number(home?.col);
  if (!name || !Number.isFinite(row) || !Number.isFinite(col)) return null;
  return `${name}#${Math.trunc(row)},${Math.trunc(col)}`;
}

/** A fresh ledger: nobody known. */
export function createRegardRecord() {
  return { v: 1, people: {} };
}

/** One person's entry, as the record stores it. */
function entryOf(record, id) {
  const raw = record?.people?.[id];
  return raw && typeof raw === 'object' ? raw : null;
}

/**
 * The regard as it stands on `day` — eased for the days the player has not seen them.
 *
 * Read this, never the stored `r`, whenever the number is shown or compared to a
 * threshold: a friendship nobody has kept up has faded, and a stored 45 that has not been
 * seen for a year is not a friendship any more.
 *
 * @param {object} record
 * @param {string} id
 * @param {number} day
 * @returns {number}
 */
export function regardOf(record, id, day) {
  const entry = entryOf(record, id);
  if (!entry) return 0;
  const r = Number(entry.r);
  if (!Number.isFinite(r)) return 0;
  const now = Number.isFinite(Number(day)) ? Number(day) : 0;
  const apart = Math.max(0, now - (Number(entry.seen) || 0));
  const ease = apart * EASE_PER_DAY;
  const eased = r > 0 ? Math.max(0, r - ease) : Math.min(0, r + ease);
  return clamp(Math.round(eased * 100) / 100);
}

/** The standing a regard reads as, in the twin's own vocabulary. */
export const standingOf = (record, id, day) => {
  const r = regardOf(record, id, day);
  return r >= FRIEND_AT ? 'friend' : r <= HOSTILE_AT ? 'hostile' : r <= ENEMY_AT ? 'enemy' : 'neutral';
};

/**
 * How a person reads to the player, given their standing.
 *
 * Arena gives nobody a name (S30), so a standing is said with the same honesty the rest
 * of the town's talk uses: what the person *is* to you, never who they are.
 *
 * @param {'friend'|'neutral'|'enemy'|'hostile'} standing
 * @param {number} [regard]
 * @returns {string}
 */
export function standingWord(standing, regard = 0) {
  if (standing === 'friend') return 'a friend';
  if (standing === 'hostile') return 'hostile — armed and done with words';
  if (standing === 'enemy') return 'an enemy';
  if (regard > 0) return 'someone who knows you';
  if (regard < 0) return 'someone you have crossed';
  return 'a stranger';
}

const clamp = (v) => Math.max(REGARD_MIN, Math.min(REGARD_MAX, v));
const idOk = (id) => typeof id === 'string' && id.length > 0 && id.length <= 64;

/**
 * Note one act, and get the ledger back with it in.
 *
 * The stored value is **baked first**: the regard is eased to `day` and then the event's
 * delta is applied, so a friendship that lapsed and is then renewed does not pay the same
 * points twice over an unwatched year. `talk` counts once a day (the twin's rule); every
 * other act counts each time it happens, because `struck` three times is three blows.
 *
 * Returns a **new** record: nothing in this module mutates what it is given, which is what
 * makes a save legal to take at any moment.
 *
 * @param {object} record
 * @param {string} id
 * @param {string} event   a key of `REGARD_EVENTS`
 * @param {number} day     the in-world day
 * @returns {{record: object, delta: number, regard: number, standing: string}}
 */
export function noteRegard(record, id, event, day) {
  const base = record && typeof record === 'object' && record.people ? record : createRegardRecord();
  const delta = REGARD_EVENTS[event];
  const now = Number.isFinite(Number(day)) ? Number(day) : 0;
  if (!idOk(id) || !Number.isFinite(delta)) {
    return { record: base, delta: 0, regard: regardOf(base, id, now), standing: standingOf(base, id, now) };
  }
  const entry = entryOf(base, id);
  // A word counts once a day per person, and only ever moves a regard: the talk itself is
  // free, its *effect* is what is rationed.
  if (event === 'talk' && entry && Number(entry.talked) === now) {
    return { record: base, delta: 0, regard: regardOf(base, id, now), standing: standingOf(base, id, now) };
  }
  const stood = regardOf(base, id, now);
  const next = clamp(stood + delta);
  const people = { ...base.people };
  people[id] = {
    r: next,
    met: Number.isFinite(Number(entry?.met)) ? Number(entry.met) : now,
    talked: event === 'talk' ? now : (Number.isFinite(Number(entry?.talked)) ? Number(entry.talked) : -1),
    seen: now,
  };
  return {
    record: trim({ v: 1, people }, now, id),
    delta,
    regard: next,
    standing: next >= FRIEND_AT ? 'friend' : next <= HOSTILE_AT ? 'hostile' : next <= ENEMY_AT ? 'enemy' : 'neutral',
  };
}

/**
 * Whether the player has ever met a person (or been told about them).
 * @param {object} record @param {string} id
 */
export const knowsPerson = (record, id) => Boolean(entryOf(record, id));

/**
 * The most people kept: past `PEOPLE_MAX` the faintest regard goes first, and among equals
 * the longest unseen — **as it stands on `day`**, never as last written, which is the
 * bug the twin's own audit found (a crowd's old crime, long eased to nothing, outweighed
 * every new acquaintance).
 *
 * @param {object} record @param {number} day @param {string} [keep] the one just noted
 */
export function trim(record, day, keep = '') {
  const people = record?.people ?? {};
  const ids = Object.keys(people);
  if (ids.length <= PEOPLE_MAX) return record;
  const ranked = ids
    .filter((id) => id !== keep)
    .map((id) => ({ id, r: Math.abs(regardOf(record, id, day)), seen: Number(people[id]?.seen) || 0 }))
    .sort((a, b) => (a.r - b.r) || (a.seen - b.seen));
  const out = { ...people };
  for (const entry of ranked.slice(0, ids.length - PEOPLE_MAX)) delete out[entry.id];
  return { ...record, people: out };
}

/**
 * Everybody the player knows, as the journal's own page shows them.
 *
 * **The ones who matter most, first** — the warmest friends and the bitterest enemies — and
 * among equals the newest seen, which is the twin's own ordering for its people page ("the
 * warmest friends, the bitterest enemies, the latest seen"). A page sorted by recency alone
 * buries the man who paid for the job under the four strangers thanked on the way home.
 *
 * The dead (a struck-down townsperson leaves the street — `strikeFolk`) are listed once and
 * then never again: this port keeps no graveyard, so it does not claim one.
 *
 * @param {object} record
 * @param {number} day
 * @param {{min?: number, limit?: number}} [opts]
 * @returns {{id: string, place: string, regard: number, standing: string, word: string, met: number, seen: number}[]}
 */
export function peopleKnown(record, day, opts = {}) {
  const min = Number.isFinite(opts.min) ? Number(opts.min) : 1;
  const limit = Number.isFinite(opts.limit) ? Number(opts.limit) : 40;
  const now = Number.isFinite(Number(day)) ? Number(day) : 0;
  return Object.keys(record?.people ?? {})
    .map((id) => {
      const regard = regardOf(record, id, now);
      const standing = standingOf(record, id, now);
      return {
        id,
        place: id.split('#')[0],
        regard,
        standing,
        word: standingWord(standing, regard),
        met: Number(record.people[id]?.met) || 0,
        seen: Number(record.people[id]?.seen) || 0,
      };
    })
    .filter((entry) => Math.abs(entry.regard) >= min)
    .sort((a, b) => (Math.abs(b.regard) - Math.abs(a.regard)) || (b.seen - a.seen))
    .slice(0, limit);
}

/** A save-file-safe copy (the record is already plain JSON; this makes it explicit). */
export const serializeRegard = (record) => JSON.parse(JSON.stringify(record ?? createRegardRecord()));

/**
 * Restore a saved ledger, tolerating a missing or partial one.
 * @param {unknown} saved
 * @returns {object}
 */
export function deserializeRegard(saved) {
  const fresh = createRegardRecord();
  if (!saved || typeof saved !== 'object') return fresh;
  const source = /** @type {any} */ (saved);
  if (!source.people || typeof source.people !== 'object') return fresh;
  const people = {};
  for (const [id, raw] of Object.entries(source.people)) {
    if (!idOk(id) || !raw || typeof raw !== 'object') continue;
    const r = Number(/** @type {any} */ (raw).r);
    if (!Number.isFinite(r)) continue;
    people[id] = {
      r: clamp(r),
      met: Number.isFinite(Number(/** @type {any} */ (raw).met)) ? Number(/** @type {any} */ (raw).met) : 0,
      talked: Number.isFinite(Number(/** @type {any} */ (raw).talked)) ? Number(/** @type {any} */ (raw).talked) : -1,
      seen: Number.isFinite(Number(/** @type {any} */ (raw).seen)) ? Number(/** @type {any} */ (raw).seen) : 0,
    };
  }
  return { v: 1, people };
}

/**
 * **The friends a player has in one place** — the count a king's house-deed asks for.
 *
 * A regard id is `Place#row,col` (`personId`), so the place is the part before the `#`:
 * the city a door belongs to, the street a person stands on, the shop they keep. The tally
 * above is the whole world's; this one is the city's, which is what "a friend of the town"
 * means and what the king checks before he sells a house.
 *
 * @param {object} record
 * @param {string|null} place
 * @param {number} day
 * @returns {number}
 */
export function friendsInPlace(record, place, day) {
  const wanted = String(place ?? '').trim().toLowerCase();
  if (!wanted) return 0;
  let friends = 0;
  for (const id of Object.keys(record?.people ?? {})) {
    const at = String(id).split('#')[0].trim().toLowerCase();
    if (at !== wanted) continue;
    if (standingOf(record, id, day) === 'friend') friends++;
  }
  return friends;
}

/**
 * How many of the world's people the player has a *standing* with — a one-line count for
 * the HUD and the journal's header.
 * @param {object} record @param {number} day
 */
export function regardTally(record, day) {
  const tally = { known: 0, friends: 0, enemies: 0, hostile: 0 };
  for (const id of Object.keys(record?.people ?? {})) {
    const standing = standingOf(record, id, day);
    if (Math.abs(regardOf(record, id, day)) <= 0) continue;
    tally.known++;
    if (standing === 'friend') tally.friends++;
    else if (standing === 'enemy') tally.enemies++;
    else if (standing === 'hostile') tally.hostile++;
  }
  return tally;
}
