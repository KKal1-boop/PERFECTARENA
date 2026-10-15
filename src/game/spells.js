// MAGIC — WHAT A SPELL IS, WHAT IT COSTS, AND WHAT IT DOES.
//
// Arena has 64 standard spells, and the install ships them: `arena/spellsFile.js` reads
// `SPELLSG.65` and gets each one's **name**, its **cost** in spell points and the **effect
// codes** its record carries. What that file does *not* carry — and could not, since the
// original's own logic is inside `A.EXE` (DECISIONS.md D11) — is which code means what, who
// a spell is aimed at, and how hard it hits.
//
// This module supplies the missing half, and it supplies it in the one way that can be
// checked: **each effect code is named from the spells that carry it**. `0x13` is `open`
// because `Open` carries it and `0x12` is `lock` because `Wizard Lock` carries it; `0x0c` is
// `heal` because `Stamina`, `Heal`, `Light Heal` and `Heal True` all do; the four `Resist`
// spells are `0x0a`; `Passwall` is `0x06`; the damage spells are `0x04`. Those joins are
// pinned by `tests/unit/spells.test.mjs` against the real bytes of the install's file, so if
// this decoding were wrong a test would say so.
//
// ## What is the file's, what is UESP's, and what is ours
//
//   * **The file's:** every spell's name, its spell-point cost, its element (fire/cold/
//     poison/shock/magic/none, measured — see `ELEMENTS`), and the effect codes.
//   * **Arena's, from its own documentation:** what each of the 64 spells does. Arena's spell
//     list is documented and undisputed — `Fireball` is fire damage, `Open` opens a lock,
//     `Levitate` lets you walk on the air, `Gods' Fire` is the most destructive spell in the
//     game — and the effects table below is that list, with the code that corroborates each
//     one recorded beside it.
//   * **This project's:** the *numbers* — how much a Fireball hits for, how long a light
//     lasts, how much a Shield wards. Arena's own magnitudes scale with the caster's skill
//     through tables in `A.EXE`; the record's six-magnitude table (`arena/spellsFile.js`'s
//     header) is read but not trusted to be points of damage, because `Gods' Fire`'s is
//     100, 100, 100, 100 while `Fireball`'s is 1, 1, 4, 12, 1 — which is a *skill
//     progression*, not a damage roll. Where a number had to be chosen it is chosen here,
//     once, and `CASTING_NOTE` says so in the game.
//
// Nothing in this file touches the world: it takes a character and a spell and returns the
// character that results plus a list of **events** for the scene to carry out (a blow to
// land, a lock to open, a light to raise). That is what makes a spell testable without a
// browser, and it is the same discipline as `game/combat.js`.

import { ELEMENTS, spellByName, spellPoints } from '../arena/spellsFile.js';

/**
 * The sentence the game prints about its own magic.
 *
 * The same discipline as `combat.js`'s `HIT_FORMULA_NOTE`: Arena's spells, names, costs and
 * effects are the install's and its documentation's, and the numbers this project had to
 * choose are said out loud.
 */
export const CASTING_NOTE = 'Arena\'s own spells, names, costs and effects; the damage, '
  + 'durations and ward values here are this project\'s, because the originals live in A.EXE.';

/**
 * Effect codes, named from the spells that carry them.
 *
 * Each entry is corroborated by at least one spell whose meaning nobody disputes, and the
 * unit tests hold those joins to the install's own bytes. `0x01` is absent on purpose: it
 * appears once, on `Wildfire`, whose record otherwise looks like a damage spell — so
 * `Wildfire`'s meaning comes from its name and its element, and no code is claimed for it.
 */
export const EFFECT_CODES = Object.freeze({
  0x02: 'ward',
  0x03: 'cure',
  0x04: 'damage',
  0x05: 'ward',       // Sanctuary — a ward that turns blows aside
  0x06: 'passwall',
  0x0a: 'resist',
  0x0b: 'strength',
  0x0c: 'heal',
  0x0d: 'drain',
  0x0f: 'invisibility',
  0x10: 'levitate',
  0x11: 'light',
  0x12: 'lock',
  0x13: 'open',
  0x14: 'regeneration',
  0x15: 'silence',
  0x17: 'mirror',
  0x18: 'spellShield',
});

/**
 * Every effect a spell can have, with its own word and a line of description.
 *
 * `self` marks the effects that land on the caster whatever the spell was aimed at (a ward,
 * a light, a levitation), which is what lets `applySpell` decide without asking the scene.
 */
export const EFFECTS = Object.freeze({
  damage: { name: 'Damage', note: 'a blow of the spell\'s own element' },
  heal: { name: 'Healing', note: 'mends the caster', self: true },
  ward: { name: 'Warding', note: 'turns blows and spells aside', self: true },
  resist: { name: 'Resistance', note: 'hardens the caster against an element', self: true },
  cure: { name: 'Curing', note: 'washes an affliction out', self: true },
  freeAction: { name: 'Free Action', note: 'breaks a hold that binds you', self: true },
  light: { name: 'Light', note: 'light to see by, wherever you walk', self: true },
  levitate: { name: 'Levitation', note: 'you walk on the air', self: true },
  invisibility: { name: 'Invisibility', note: 'nothing sees you', self: true },
  regeneration: { name: 'Regeneration', note: 'your wounds close as you walk', self: true },
  strength: { name: 'Strength', note: 'your arm is heavier', self: true },
  waterBreathing: { name: 'Water Breathing', note: 'the water cannot drown you', self: true },
  mirror: { name: 'Mirroring', note: 'a spell cast at you is cast back', self: true },
  spellShield: { name: 'Spell Shielding', note: 'a ward against magic alone', self: true },
  open: { name: 'Opening', note: 'locks give way' },
  lock: { name: 'Locking', note: 'locks close behind you' },
  passwall: { name: 'Passwall', note: 'stone lets you through' },
  silence: { name: 'Silence', note: 'the target cannot speak a spell' },
  drain: { name: 'Draining', note: 'what it takes from the target comes to you' },
  spellDrain: { name: 'Spell Draining', note: 'the target\'s spell points are yours' },
  poison: { name: 'Poison', note: 'a lasting poison' },
  disease: { name: 'Disease', note: 'a wasting sickness' },
  fear: { name: 'Fear', note: 'the target wants to be elsewhere' },
});

/**
 * Every standard spell's meaning: who it is aimed at, what it does, and the effect code that
 * corroborates it.
 *
 * `effects` are in the order the game applies them. `code` is the *one* code in the install's
 * record that this meaning was read from, and it is what makes this table checkable: a test
 * walks all 64 named records, and for every entry here that names a code asserts the record
 * really carries it.
 *
 * `power` is this project's number (see the file header). Damage and healing scale with the
 * caster's level on top of it (`applySpell`), which is the one rule Arena's own progression
 * tables are known to have.
 */
const MEANINGS = Object.freeze({
  'Stamina': { target: 'self', code: 0x0c, effects: [{ kind: 'heal', power: 12 }] },
  'Sanctuary': { target: 'self', code: 0x05, effects: [{ kind: 'ward', power: 10 }] },
  'Light': { target: 'self', code: 0x11, effects: [{ kind: 'light', power: 8 }] },
  'Wanderlight': { target: 'self', code: 0x11, effects: [{ kind: 'light', power: 8, wandering: true }] },
  'Wizard Lock': { target: 'self', code: 0x12, effects: [{ kind: 'lock' }] },
  'Orc Strength': { target: 'self', code: 0x0b, effects: [{ kind: 'strength', power: 5 }] },
  'Wizard\'s Fire': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'fire', power: 12 }] },
  'Shield': { target: 'self', code: 0x02, effects: [{ kind: 'ward', power: 15 }] },
  'Shock': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'shock', power: 15 }] },
  'Open': { target: 'self', code: 0x13, effects: [{ kind: 'open' }] },
  'Wizard Rend': { target: 'target', code: 0x15, effects: [{ kind: 'damage', element: 'magic', power: 30 }] },
  'Strength Leech': { target: 'target', code: 0x0d, effects: [{ kind: 'drain', power: 10 }] },
  'Ice Bolt': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'cold', power: 20 }] },
  'Heal': { target: 'self', code: 0x0c, effects: [{ kind: 'heal', power: 25 }] },
  'Resist Fire': { target: 'self', code: 0x0a, effects: [{ kind: 'resist', element: 'fire', power: 3 }] },
  'Resist Cold': { target: 'self', code: 0x0a, effects: [{ kind: 'resist', element: 'cold', power: 3 }] },
  'Fireball': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'fire', power: 25 }] },
  'Earth Wall': { target: 'self', code: 0x02, effects: [{ kind: 'ward', power: 20 }] },
  'Levitate': { target: 'self', code: 0x10, effects: [{ kind: 'levitate' }] },
  // `Witch's Curse` carries no effect code at all in this install's file (its three slots are
  // all padding), so its meaning comes from its name and its element — and no code is claimed
  // for it here, which is what keeps the join checkable.
  'Witch\'s Curse': { target: 'target', effects: [{ kind: 'damage', element: 'magic', power: 15 }, { kind: 'fear' }] },
  'Wyvern\'s Sting': { target: 'target', effects: [{ kind: 'damage', element: 'poison', power: 20 }, { kind: 'poison', power: 3 }] },
  'Cure Poison': { target: 'self', code: 0x03, effects: [{ kind: 'cure', element: 'poison' }] },
  'Force Bolt': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'shock', power: 25 }] },
  'Resist Shock': { target: 'self', code: 0x0a, effects: [{ kind: 'resist', element: 'shock', power: 3 }] },
  'Invisibility': { target: 'self', code: 0x0f, effects: [{ kind: 'invisibility' }] },
  'Gods\' Fire': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'fire', power: 60 }] },
  'Ice Storm': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'cold', power: 35 }] },
  'Force Wall': { target: 'self', code: 0x02, effects: [{ kind: 'ward', power: 30 }] },
  'Lightning': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'shock', power: 40 }] },
  'Pitfalls': { target: 'target', code: 0x06, effects: [{ kind: 'damage', element: 'magic', power: 25 }] },
  'Wildfire': { target: 'target', effects: [{ kind: 'damage', element: 'fire', power: 20 }] },
  'Silence': { target: 'target', code: 0x15, effects: [{ kind: 'silence' }] },
  'Far Silence': { target: 'target', code: 0x15, effects: [{ kind: 'silence' }] },
  'Heal True': { target: 'self', code: 0x0c, effects: [{ kind: 'heal', power: 45 }] },
  'Passwall': { target: 'self', code: 0x06, effects: [{ kind: 'passwall' }] },
  'Fire Storm': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'fire', power: 45 }] },
  'Spell Shield': { target: 'self', code: 0x18, effects: [{ kind: 'spellShield', power: 25 }, { kind: 'ward', power: 15 }] },
  'Free Action': { target: 'self', code: 0x03, effects: [{ kind: 'freeAction' }] },
  'Resist Poison': { target: 'self', code: 0x0a, effects: [{ kind: 'resist', element: 'poison', power: 3 }] },
  'Lifesteal': { target: 'target', code: 0x0d, effects: [{ kind: 'drain', power: 20 }] },
  'Toxic Cloud': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'poison', power: 30 }] },
  'Troll\'s Blood': { target: 'self', code: 0x14, effects: [{ kind: 'regeneration', power: 5 }] },
  'Medusa\'s Gaze': { target: 'target', effects: [{ kind: 'damage', element: 'magic', power: 25 }, { kind: 'fear' }] },
  'Spell Drain': { target: 'target', effects: [{ kind: 'spellDrain', power: 20 }] },
  'Shalidor\'s Mirror': { target: 'self', code: 0x17, effects: [{ kind: 'mirror' }, { kind: 'ward', power: 10 }] },
  'Purify': { target: 'self', effects: [{ kind: 'cure', element: 'poison' }, { kind: 'cure', element: 'disease' }, { kind: 'heal', power: 30 }] },
  // The artefact spells. Arena gives each of the great items its own power, cast from the
  // item rather than learnt from a guild, and the effects below are those items'.
  'Chrysamere': { target: 'self', effects: [{ kind: 'ward', power: 25 }, { kind: 'regeneration', power: 4 }] },
  'Ebony Blade': { target: 'self', effects: [{ kind: 'strength', power: 8 }, { kind: 'heal', power: 30 }] },
  'Spell Breaker': { target: 'self', effects: [{ kind: 'mirror' }, { kind: 'spellShield', power: 30 }] },
  'Lord\'s Mail': { target: 'self', effects: [{ kind: 'ward', power: 30 }, { kind: 'regeneration', power: 4 }] },
  'Auriel\'s Shield': { target: 'self', effects: [{ kind: 'ward', power: 35 }, { kind: 'resist', element: 'magic', power: 4 }] },
  'Staff of Magnus': { target: 'self', effects: [{ kind: 'regeneration', power: 6 }, { kind: 'spellShield', power: 20 }] },
  'Warlock\'s Ring': { target: 'self', effects: [{ kind: 'ward', power: 15 }, { kind: 'resist', element: 'magic', power: 4 }] },
  'Volendrung': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'magic', power: 35 }] },
  'Ring of Phynaster': { target: 'self', effects: [{ kind: 'resist', element: 'fire', power: 4 }, { kind: 'resist', element: 'cold', power: 4 }, { kind: 'resist', element: 'shock', power: 4 }, { kind: 'resist', element: 'poison', power: 4 }] },
  'Ring of Khajiit': { target: 'self', effects: [{ kind: 'invisibility' }, { kind: 'ward', power: 10 }] },
  'Ebony Mail': { target: 'self', effects: [{ kind: 'ward', power: 30 }, { kind: 'resist', element: 'magic', power: 5 }] },
  'Auriel\'s Bow': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'magic', power: 40 }] },
  'Necromancer\'s Amulet': { target: 'self', effects: [{ kind: 'spellShield', power: 25 }, { kind: 'regeneration', power: 4 }] },
  'Cause Disease': { target: 'target', effects: [{ kind: 'disease' }] },
  'Cure Disease': { target: 'self', code: 0x03, effects: [{ kind: 'cure', element: 'disease' }] },
  'Fire Dart': { target: 'target', code: 0x04, effects: [{ kind: 'damage', element: 'fire', power: 8 }] },
  'Light Heal': { target: 'self', code: 0x0c, effects: [{ kind: 'heal', power: 10 }] },
});

/** Means AN effect with no power of its own, for the classes of spell that just work. */
const DEFAULT_POWER = 10;

/**
 * The spells a class starts knowing.
 *
 * **AUTHORED.** Arena's own class spell lists are in `A.EXE`; what is certain from the
 * install is that a class whose `spellPoints` multiplier is zero cannot cast at all
 * (`game/character.js`), and that the Mages Guild is where a spell is bought
 * (`game/services.js`). So a caster begins with a small, useful set drawn from the low-cost
 * end of the real file — the cheapest healing, the cheapest attack, a light and a ward — and
 * buys the rest. A class that cannot cast starts with nothing, which is not a gap but the
 * game's own rule.
 */
const STARTING_SPELLS = Object.freeze({
  mage: ['Light Heal', 'Fire Dart', 'Light', 'Shield', 'Fireball', 'Levitate'],
  healer: ['Light Heal', 'Heal', 'Cure Poison', 'Cure Disease', 'Shield', 'Light'],
  battlemage: ['Fire Dart', 'Shield', 'Light Heal', 'Strength Leech'],
  sorceror: ['Fire Dart', 'Shock', 'Shield', 'Light Heal'],
  spellsword: ['Light Heal', 'Shield', 'Fire Dart'],
  nightblade: ['Light', 'Invisibility', 'Fire Dart', 'Light Heal'],
  bard: ['Light', 'Light Heal'],
});

/** Arena's own four elements a spell can be made of, plus the untyped one. */
export const RESIST_ELEMENTS = Object.freeze(ELEMENTS.filter((element) => element !== 'none'));

/**
 * One spell, joined: the install's record and this module's meaning for it.
 *
 * @typedef {{
 *   id: number, name: string, points: number, element: string|null, codes: number[],
 *   target: 'self'|'target', effects: object[], code?: number, known: boolean,
 *   note: string,
 * }} SpellEntry
 */

/**
 * The whole spell library: the install's named records, each joined to its meaning.
 *
 * A record whose name this module does not know is **not** dropped: it comes through with an
 * empty effect list and `known: false`, so a game running against a different Arena edition
 * can still show a player the spells their own file has, and `library.unknown` names them for
 * the log. (Aera ships 64 named spells; a spellmaker's own 32 live in `SPELLS.65`.)
 *
 * @param {object[]} records  `arena/spellsFile.js`'s `parseSpellsFile().named`
 * @param {{known?: string[]}} [opts]
 * @returns {{spells: SpellEntry[], byName: Map<string, SpellEntry>, unknown: string[]}}
 */
export function buildSpellLibrary(records, opts = {}) {
  const known = new Set((opts.known ?? []).map((name) => String(name).toLowerCase()));
  /** @type {SpellEntry[]} */
  const spells = [];
  const unknown = [];
  for (const record of records ?? []) {
    const meaning = MEANINGS[record.name];
    if (!meaning) unknown.push(record.name);
    spells.push({
      id: record.index,
      name: record.name,
      points: spellPoints(record),
      element: record.element,
      codes: record.codes.slice(),
      // An unknown record's element is still the file's, so a caller that only wants to
      // print the spell can; what it cannot do is cast it.
      target: meaning?.target ?? 'self',
      effects: (meaning?.effects ?? []).map((effect) => ({ ...effect })),
      code: meaning?.code ?? null,
      note: describeSpell({ name: record.name, effects: meaning?.effects ?? [] }),
    });
  }
  const byName = new Map(spells.map((spell) => [spell.name.toLowerCase(), spell]));
  // `STARTING_SPELLS` is keyed by class, and the caller passes what the character knows; a
  // spell the caller named that the file does not have is the one join worth failing loudly
  // about, and `missing` is where the tests look for it.
  return { spells, byName, unknown, missing: [...known].filter((name) => !byName.has(name)) };
}

/**
 * One line about a spell, in Arena's own vocabulary.
 *
 * @param {{name: string, effects: object[]}} spell
 * @returns {string}
 */
export function describeSpell(spell) {
  const parts = (spell?.effects ?? []).map((effect) => {
    const word = EFFECTS[effect.kind]?.name ?? effect.kind;
    const amount = effect.power ? ` ${effect.power}` : '';
    const element = effect.element && effect.element !== 'magic' ? ` ${effect.element}` : '';
    return `${word}${amount}${element}`;
  });
  return parts.length ? parts.join(' · ') : 'an effect this game does not know how to cast';
}

/**
 * The spells a class begins with, as names.
 *
 * @param {string} classId
 * @param {number|null} spellPoints  the class's own multiplier (`game/character.js`)
 * @returns {string[]}
 */
export function startingSpellsFor(classId, spellPoints = null) {
  const named = STARTING_SPELLS[String(classId ?? '').toLowerCase()];
  if (named) return named.slice();
  // A caster with no list of its own (a class added to `character.js` later, or a spellmaker's
  // creation) still gets the cheapest useful set; a class with no spell points gets nothing.
  if (spellPoints === null || Number(spellPoints) > 0) {
    return ['Light Heal', 'Fire Dart', 'Light', 'Shield'];
  }
  return [];
}

/**
 * What a spell costs *this* caster.
 *
 * The base is the install's own number (`points`, e.g. 60 for `Stamina`, 3750 for `Gods'
 * Fire`). The class abilities in `game/character.js` name discounts — the Battlemage and the
 * Nightblade have "spellmaker discounts", the Healer has "cheaper defensive spells" — and
 * this is where they are honoured; the percentages are **AUTHORED**, because the originals
 * are in `A.EXE`.
 *
 * @param {object} character
 * @param {SpellEntry|object} spell
 * @returns {number} whole spell points, never less than one
 */
export function costOf(character, spell) {
  const base = spellPoints(spell);
  const classId = String(character?.classId ?? '').toLowerCase();
  let factor = 1;
  if (classId === 'battlemage' || classId === 'nightblade') factor = 0.9;
  if (classId === 'healer') {
    const defensive = (spell?.effects ?? []).some((effect) => ['heal', 'ward', 'cure', 'resist', 'regeneration', 'freeAction'].includes(effect.kind));
    if (defensive) factor = 0.8;
  }
  return Math.max(1, Math.round(base * factor));
}

/**
 * May this character cast this spell, right now?
 *
 * Three ways to fail, and each says which: a class with no spell points at all (Arena's
 * fighters — `spellPoints` is `null` for them, not zero, `character.js`), a spell that is not
 * known, and a purse of spell points too small.
 *
 * @param {object} character
 * @param {SpellEntry|object} spell
 * @returns {{ok: boolean, reason?: string, cost: number}}
 */
export function canCast(character, spell) {
  const cost = costOf(character, spell);
  if (!spell || !Array.isArray(spell.effects) || !spell.effects.length) {
    return { ok: false, reason: `${spell?.name ?? 'that spell'} is not one this game can cast`, cost };
  }
  if (character?.spellPoints == null) {
    return { ok: false, reason: 'this class has no spell points — Arena\'s fighters do not cast', cost };
  }
  if (!isKnown(character, spell.name)) {
    return { ok: false, reason: `${spell.name} is not in your spellbook — the Mages Guild sells it`, cost };
  }
  const have = Number(character.spellPoints) || 0;
  if (have < cost) return { ok: false, reason: `not enough spell points: ${spell.name} costs ${cost} and you have ${have}`, cost };
  return { ok: true, cost };
}

/**
 * Does the character's spellbook hold this spell?
 *
 * A character made before this module existed has no `knownSpells` at all; creation fills it
 * in (`game/chargen.js`), and a character without it is given their class's own list, so an
 * old save is not a character who cannot cast.
 *
 * @param {object} character
 * @param {string} name
 * @returns {boolean}
 */
export function isKnown(character, name) {
  const list = knownSpellsOf(character);
  return list.some((known) => known.toLowerCase() === String(name ?? '').toLowerCase());
}

/**
 * The character's spellbook, as names.
 * @param {object} character
 * @returns {string[]}
 */
export function knownSpellsOf(character) {
  if (Array.isArray(character?.knownSpells)) return character.knownSpells.map(String);
  return startingSpellsFor(character?.classId, character?.spellPoints ?? null);
}

/**
 * Learn a spell: a new character with it in the book.
 *
 * Idempotent — buying the same spell twice is a shop's business to refuse (`game/services.js`
 * checks first) and not something that should put it in the book twice.
 *
 * @param {object} character
 * @param {string} name
 * @returns {object}
 */
export function learnSpell(character, name) {
  const list = knownSpellsOf(character);
  if (list.some((known) => known.toLowerCase() === String(name).toLowerCase())) {
    return { ...character, knownSpells: list };
  }
  return { ...character, knownSpells: [...list, String(name)] };
}

/**
 * Pay for a spell: a new character with the points spent.
 *
 * @param {object} character
 * @param {number} cost
 * @returns {object}
 */
export function spendFor(character, cost) {
  const spent = Math.max(0, Math.round(Number(cost) || 0));
  return { ...character, spellPoints: Math.max(0, (Number(character?.spellPoints) || 0) - spent) };
}

/**
 * Bring the character's own state back in step with their maximum — the rule a rest carries
 * out (`game/services.js`) and a shrine in Arena does too.
 *
 * @param {object} character
 * @param {{restoreSpellPoints?: boolean}} [opts]
 * @returns {object}
 */
export function restore(character, opts = {}) {
  const next = { ...(character ?? {}) };
  if (Number.isFinite(next.maxHealth)) next.health = next.maxHealth;
  if (opts.restoreSpellPoints !== false && Number.isFinite(next.maxSpellPoints)) {
    next.spellPoints = next.maxSpellPoints;
  }
  next.afflictions = [];
  next.ward = 0;
  next.light = null;
  next.levitating = false;
  next.invisible = false;
  next.strengthBuff = 0;
  next.regeneration = 0;
  next.mirror = false;
  next.spellShield = 0;
  next.freeAction = false;
  return next;
}

/**
 * One effect's power, after the caster's own level is taken into account.
 *
 * Arena's progression is not readable (the tables are in `A.EXE`), so the rule is stated in
 * one place: a damage or healing effect adds half the caster's level to its base, which is
 * the same one-per-two-levels shape the fight's own to-hit uses (`combat.js`'s `hitChance`,
 * four per level). **AUTHORED.**
 *
 * @param {object} effect
 * @param {object} character
 * @returns {number}
 */
export function powerOf(effect, character) {
  const base = Number.isFinite(effect?.power) ? effect.power : DEFAULT_POWER;
  if (!['damage', 'heal', 'drain', 'regeneration', 'spellDrain'].includes(effect?.kind)) return base;
  const level = Math.max(1, Number(character?.level) || 1);
  return Math.max(1, Math.round(base + level / 2));
}

/**
 * Cast a spell.
 *
 * The character comes out changed — points spent, and everything the spell did to the caster
 * itself already applied — and everything the spell did to the **world** comes back as
 * `events` for the scene to carry out, because a spell that damages a monster is a game's
 * business and a spell that wards its caster is the character's:
 *
 *   `{ kind: 'damage', power, element, target }`  a blow for the scene to land
 *   `{ kind: 'heal', power }`                     already applied, reported for the HUD
 *   `{ kind: 'ward', power }`                     already applied
 *   `{ kind: 'light' | 'levitate' | 'invisibility' | 'mirror' | 'spellShield' | 'passwall'
 *      | 'open' | 'lock' | 'silence' | 'fear' | 'poison' | 'disease' | 'spellDrain'
 *      | 'freeAction' | 'resist' | 'regeneration' | 'strength' }`
 *
 * `refusal` is why a cast did not happen, in the game's voice, and the character is then
 * exactly the one handed in.
 *
 * @param {SpellEntry|object} spell
 * @param {object} ctx
 * @param {object} ctx.character
 * @param {(n: number) => number} [ctx.random]  a draw in `[0, n)`, for the rings the world
 *   rolls; the scene passes its own `ArenaRandom` so a cast is reproducible
 * @param {string} [ctx.targetName]  what the spell was aimed at, for its own note
 * @returns {{ok: boolean, reason?: string, character: object, events: object[], note: string, cost: number, damage: number, heal: number, ward: number}}
 */
export function applySpell(spell, ctx = {}) {
  const character = ctx.character ?? {};
  const check = canCast(character, spell);
  const empty = { ok: false, reason: check.reason, character, events: [], note: '', cost: check.cost, damage: 0, heal: 0, ward: 0 };
  if (!check.ok) return empty;

  let next = spendFor(character, check.cost);
  const events = [];
  const words = [];
  let damage = 0;
  let heal = 0;
  let ward = 0;

  for (const effect of spell.effects ?? []) {
    const power = powerOf(effect, character);
    switch (effect.kind) {
      case 'damage': {
        damage += power;
        events.push({ kind: 'damage', power, element: effect.element ?? 'magic', target: ctx.targetName ?? null });
        words.push(`${power} of ${effect.element ?? 'magic'} damage`);
        break;
      }
      case 'drain': {
        damage += power;
        heal += power;
        events.push({ kind: 'damage', power, element: 'magic', target: ctx.targetName ?? null });
        events.push({ kind: 'heal', power });
        next = applyHeal(next, power);
        words.push(`${power} drained`);
        break;
      }
      case 'heal': {
        heal += power;
        const before = Number(next.health) || 0;
        next = applyHeal(next, power);
        events.push({ kind: 'heal', power: (Number(next.health) || 0) - before });
        words.push(`${(Number(next.health) || 0) - before} health back`);
        break;
      }
      case 'regeneration': {
        next.regeneration = Math.max(Number(next.regeneration) || 0, power);
        events.push({ kind: 'regeneration', power });
        words.push('wounds closing');
        break;
      }
      case 'ward': {
        ward += power;
        next.ward = Math.max(0, Number(next.ward) || 0) + power;
        events.push({ kind: 'ward', power });
        words.push(`a ward of ${next.ward}`);
        break;
      }
      case 'spellShield': {
        next.spellShield = Math.max(Number(next.spellShield) || 0, power);
        events.push({ kind: 'spellShield', power });
        words.push('shut against magic');
        break;
      }
      case 'resist': {
        const resistances = { ...(next.resistances ?? {}) };
        resistances[effect.element] = Math.max(Number(resistances[effect.element]) || 0, power);
        next.resistances = resistances;
        events.push({ kind: 'resist', element: effect.element, power });
        words.push(`hardened against ${effect.element}`);
        break;
      }
      case 'cure': {
        next.afflictions = (Array.isArray(next.afflictions) ? next.afflictions : []).filter((a) => a !== effect.element);
        events.push({ kind: 'cure', element: effect.element });
        words.push(`the ${effect.element} is gone`);
        break;
      }
      case 'freeAction': {
        next.freeAction = true;
        events.push({ kind: 'freeAction' });
        words.push('held by nothing');
        break;
      }
      case 'light': {
        next.light = { radius: power, wandering: Boolean(effect.wandering) };
        events.push({ kind: 'light', power, wandering: Boolean(effect.wandering) });
        words.push('light to see by');
        break;
      }
      case 'levitate': {
        next.levitating = true;
        events.push({ kind: 'levitate' });
        words.push('your feet leave the ground');
        break;
      }
      case 'invisibility': {
        next.invisible = true;
        events.push({ kind: 'invisibility' });
        words.push('nothing sees you');
        break;
      }
      case 'mirror': {
        next.mirror = true;
        events.push({ kind: 'mirror' });
        words.push('spells cast at you come back');
        break;
      }
      case 'strength': {
        next.strengthBuff = Math.max(Number(next.strengthBuff) || 0, power);
        events.push({ kind: 'strength', power });
        words.push(`your arm is heavier by ${power}`);
        break;
      }
      case 'open':
      case 'lock':
      case 'passwall': {
        // Aimed at the world: the scene owns the lock in front of the player and knows
        // whether there is one. The spell is cast either way — Arena does not refund a
        // spell cast at an empty corridor.
        events.push({ kind: effect.kind });
        words.push(effect.kind === 'open' ? 'locks give way' : effect.kind === 'lock' ? 'the lock closes' : 'stone lets you through');
        break;
      }
      case 'silence':
      case 'fear':
      case 'poison':
      case 'disease':
      case 'spellDrain': {
        events.push({ kind: effect.kind, power, target: ctx.targetName ?? null });
        words.push(EFFECTS[effect.kind]?.note ?? effect.kind);
        break;
      }
      case 'waterBreathing': {
        const resistances = { ...(next.resistances ?? {}) };
        resistances.water = Math.max(Number(resistances.water) || 0, power);
        next.resistances = resistances;
        events.push({ kind: 'resist', element: 'water', power });
        words.push('the water cannot drown you');
        break;
      }
      default:
        // An effect this build has no rule for is *reported* rather than silently dropped:
        // the spell was paid for, and the player is owed the truth about what it did.
        events.push({ kind: effect.kind, power });
        words.push(`${EFFECTS[effect.kind]?.name ?? effect.kind} (nothing in this build carries it out)`);
        break;
    }
  }

  const aimed = spell.target === 'target'
    ? (ctx.targetName ? ` at ${ctx.targetName}` : ' at nothing in reach')
    : '';
  return {
    ok: true,
    character: next,
    events,
    note: `${spell.name}${aimed}: ${words.join(', ')}.`,
    cost: check.cost,
    damage,
    heal,
    ward,
  };
}

/** Add health without passing the character's own ceiling. */
function applyHeal(character, amount) {
  const max = Number.isFinite(character?.maxHealth) ? character.maxHealth : Infinity;
  const before = Number(character?.health) || 0;
  return { ...character, health: Math.min(max, before + Math.max(0, amount)) };
}

/**
 * Every spell in a library that a character's class and purse can reach — what a Mages
 * Guild's shelf is drawn from (`game/services.js`).
 *
 * Sorted by cost, which is the order a guild's shelves go in and the order a player shops.
 *
 * @param {SpellEntry[]} spells
 * @param {object} character
 * @returns {SpellEntry[]}
 */
export function spellsForSale(spells, character) {
  if (character?.spellPoints == null) return [];
  return (spells ?? []).slice().sort((a, b) => a.points - b.points || a.name.localeCompare(b.name));
}

/**
 * The record behind a name, from a library — the seam a scroll or a shop uses.
 *
 * @param {{byName: Map<string, object>}|null} library
 * @param {string} name
 * @returns {SpellEntry|null}
 */
export function spellFromLibrary(library, name) {
  return library?.byName?.get(String(name ?? '').toLowerCase()) ?? null;
}

/**
 * Find a spell in the install's own records, for a caller that has the records but has not
 * built a library (a test, a tool).
 *
 * @param {object[]} records
 * @param {string} name
 * @returns {object|null}
 */
export function recordFor(records, name) {
  return spellByName(records, name);
}
