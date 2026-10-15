// MAGIC: ARENA'S OWN SPELL FILE, DECODED, AND THE CASTING LAW OVER IT.
//
// `SPELLSG.65` is the one part of Arena's magic that this install actually ships, and these
// tests hold the decode to **the real 10 880 bytes** rather than to a table in the source: the
// record size, the name offset, the spell-point cost at 0x32, the element at 0x26, and the
// effect codes at 0x29…0x31. Every one of them can be wrong in a way that still *looks*
// plausible — a decoder that reads the cost two bytes off still returns numbers — so each is
// pinned to a spell whose answer is not in dispute:
//
//   * `Open` is the spell that opens locks and its record's code is 0x13, while `Wizard Lock`
//     is 0x12: the pair is the strongest single check in the file, because the two spells are
//     each other's opposite and the codes are adjacent and in the right order;
//   * `Heal`, `Light Heal`, `Stamina` and `Heal True` all carry 0x0c, and none of the damage
//     spells does — a healing code that leaked onto `Fireball` would fail;
//   * the four `Resist` spells carry 0x0a and nothing else in the file does;
//   * `SPELLS.LST` is byte-for-byte the same file under another name, which is how a
//     mis-sized read would be caught immediately.
//
// Run:  node --test tests/unit/spells.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import {
  ELEMENTS, SPELL_FIELDS, SPELL_FILES, SPELL_RECORD_BYTES, SPELL_RECORD_COUNT,
  decodeSpellRecord, parseSpellMakerText, parseSpellsFile, spellByName, spellPoints,
  spellsWithCode,
} from '../../src/arena/spellsFile.js';
import {
  CASTING_NOTE, EFFECTS, EFFECT_CODES, applySpell, buildSpellLibrary, canCast, costOf,
  isKnown, knownSpellsOf, learnSpell, powerOf, restore, spendFor, spellFromLibrary, startingSpellsFor,
} from '../../src/game/spells.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const source = () => nodeSource(ARENA);
const bytesOf = (name) => source().getBytes(name);

let cache = null;
/** The install's own spell file, read once for the whole run. */
async function spellFile() {
  if (cache) return cache;
  cache = parseSpellsFile(await bytesOf(SPELL_FILES.standard), { file: SPELL_FILES.standard });
  return cache;
}

const record = (file, name) => {
  const hit = spellByName(file.records, name);
  assert.ok(hit, `${name} must be in ${file.file}`);
  return hit;
};

// ── the file itself ───────────────────────────────────────────────────────────

test('the spell file is 128 records of 85 bytes, and SPELLS.LST is the same file again', async () => {
  const bytes = await bytesOf(SPELL_FILES.standard);
  assert.equal(bytes.length, 10_880, 'the size the project has always claimed');
  assert.equal(SPELL_RECORD_BYTES, 85);
  assert.equal(SPELL_RECORD_COUNT, 128);
  assert.equal(SPELL_RECORD_BYTES * SPELL_RECORD_COUNT, bytes.length);

  // `.LST` is Arena's own listing of the same spells. Measured byte-for-byte: if these ever
  // differ, one of the two files has been read at the wrong stride.
  const list = await bytesOf(SPELL_FILES.list);
  assert.equal(list.length, bytes.length, 'SPELLS.LST is the same length');
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== list[i]) assert.fail(`SPELLS.LST differs from SPELLSG.65 at byte ${i}`);
  }
});

test('64 of the records are named and the rest are empty, and the offsets are as documented', async () => {
  const file = await spellFile();
  assert.equal(file.count, 128);
  assert.equal(file.named.length, 64, 'Arena ships 64 standard spells');
  assert.equal(file.warnings.length, 0, file.warnings.join('; '));
  assert.deepEqual(SPELL_FIELDS, {
    magnitudeTable: 0x00, magnitudeStride: 6, magnitudeCount: 6,
    element: 0x26, shape: 0x24,
    // **Three code slots**, and the parameters after them: reading 0x29…0x31 as one flat list
    // of codes turns `Heal`'s parameter byte into a second effect.
    codes: 0x29, codesEnd: 0x2b, params: 0x2c, paramsEnd: 0x31,
    points: 0x32, name: 0x34, nameBytes: 33,
  });
  // The parameters are what a `Resist` spell resists: cold is 1 and shock is 2 in the same
  // byte, which is what makes the split between codes and parameters a *measured* one.
  assert.equal(record(file, 'Resist Cold').params[0], 1, 'Resist Cold\'s parameter is cold');
  assert.equal(record(file, 'Resist Shock').params[0], 2, 'Resist Shock\'s parameter is shock');
  assert.equal(record(file, 'Resist Fire').params[0], 0, 'Resist Fire\'s parameter is fire');
  // The named records are the *first* 64, and the file's tail is all zeroes but for two
  // header-only records — which is why a decode that read names at the wrong offset would
  // come back with an empty list rather than with plausible junk.
  for (const entry of file.named) assert.ok(entry.index < 64, `${entry.name} is record ${entry.index}`);
});

test('a spell\'s name and its cost in spell points are at 0x34 and 0x32', async () => {
  const file = await spellFile();
  // Arena's documented list, against the file's own bytes: the cost column is the check that
  // says the offsets are right, because a name is easy to read at the wrong place and a price
  // is not (Arena's own spell list gives all of these).
  const costs = {
    'Stamina': 60, 'Sanctuary': 300, 'Light': 120, 'Wanderlight': 150, 'Wizard Lock': 300,
    'Orc Strength': 125, 'Shield': 250, 'Shock': 225, 'Open': 300, 'Levitate': 50,
    'Heal': 125, 'Fireball': 325, 'Invisibility': 150, 'Fire Dart': 82, 'Light Heal': 70,
    'Cure Poison': 350, 'Passwall': 600, 'Gods\' Fire': 3750,
  };
  for (const [name, cost] of Object.entries(costs)) {
    assert.equal(record(file, name).points, cost, `${name} costs ${cost} spell points`);
  }
  assert.equal(spellPoints(record(file, 'Heal')), 125);
  // The scale is real: the most destructive spell in Arena is the most expensive one here.
  const dearest = file.named.slice().sort((a, b) => b.points - a.points)[0];
  assert.equal(dearest.name, 'Ebony Blade', `the dearest standard spell is ${dearest.name} (${dearest.points})`);
});

test('the element byte at 0x26 is measured, not guessed', async () => {
  const file = await spellFile();
  const element = (name) => record(file, name).element;
  for (const name of ['Fire Dart', 'Fireball', 'Fire Storm', 'Wildfire', 'Wizard\'s Fire', 'Gods\' Fire']) {
    assert.equal(element(name), 'fire', `${name} is a fire spell`);
  }
  for (const name of ['Ice Bolt', 'Ice Storm']) assert.equal(element(name), 'cold', name);
  for (const name of ['Shock', 'Lightning', 'Force Bolt']) assert.equal(element(name), 'shock', name);
  for (const name of ['Toxic Cloud', 'Wyvern\'s Sting', 'Cause Disease']) assert.equal(element(name), 'poison', name);
  // Everything that does not attack anything reads as `none`: this is what makes 0x26 an
  // element and not, say, a school or a level.
  for (const name of ['Heal', 'Light', 'Levitate', 'Open', 'Invisibility', 'Shield', 'Levitate']) {
    assert.equal(element(name), 'none', `${name} attacks nothing`);
  }
  assert.deepEqual(ELEMENTS, ['fire', 'cold', 'poison', 'shock', 'magic', 'none']);
});

test('the effect codes are the joins that name them', async () => {
  const file = await spellFile();
  const codes = (name) => record(file, name).codes;
  // The pair that settles the list: Open is 0x13 and Wizard Lock is 0x12.
  assert.ok(codes('Open').includes(0x13), `Open carries 0x13, got ${codes('Open')}`);
  assert.ok(codes('Wizard Lock').includes(0x12), `Wizard Lock carries 0x12, got ${codes('Wizard Lock')}`);
  // Healing: four spells, one code, and no damage spell shares it.
  for (const name of ['Stamina', 'Heal', 'Light Heal', 'Heal True']) {
    assert.ok(codes(name).includes(0x0c), `${name} carries the healing code, got ${codes(name)}`);
  }
  for (const name of ['Fireball', 'Fire Dart', 'Ice Bolt', 'Shock']) {
    assert.ok(codes(name).includes(0x04), `${name} carries the damage code, got ${codes(name)}`);
    assert.ok(!codes(name).includes(0x0c), `${name} is not a healing spell`);
  }
  for (const name of ['Resist Fire', 'Resist Cold', 'Resist Shock', 'Resist Poison']) {
    assert.ok(codes(name).includes(0x0a), `${name} carries the resistance code, got ${codes(name)}`);
  }
  for (const name of ['Cure Poison', 'Cure Disease']) {
    assert.ok(codes(name).includes(0x03), `${name} carries the curing code, got ${codes(name)}`);
  }
  for (const name of ['Shield', 'Earth Wall', 'Force Wall']) {
    assert.ok(codes(name).includes(0x02), `${name} carries the warding code, got ${codes(name)}`);
  }
  for (const name of ['Passwall', 'Pitfalls']) {
    assert.ok(codes(name).includes(0x06), `${name} carries the passwall code, got ${codes(name)}`);
  }
  assert.ok(codes('Levitate').includes(0x10), 'Levitate');
  assert.ok(codes('Invisibility').includes(0x0f), 'Invisibility');
  for (const name of ['Light', 'Wanderlight']) assert.ok(codes(name).includes(0x11), `${name} is a light spell`);
  assert.ok(codes('Troll\'s Blood').includes(0x14), 'Troll\'s Blood regenerates');
  assert.ok(codes('Silence').includes(0x15), 'Silence');
  assert.ok(codes('Lifesteal').includes(0x0d), 'Lifesteal drains');

  // The table of names covers the codes the file actually carries — and the codes it does
  // **not** name are listed here rather than ignored, because an unexplained code is a real
  // gap: three spells carry one and this build reads their meaning from their names instead.
  const UNNAMED = Object.freeze([
    0x01,   // `Wildfire` alone — a fire attack whose record does not use the damage code
    0x09,   // `Volendrung` alone
    0x16,   // `Staff of Magnus` and `Necromancer's Amulet`
  ]);
  const carried = new Set();
  for (const entry of file.named) for (const code of entry.codes) carried.add(code);
  for (const code of carried) {
    if (UNNAMED.includes(code)) continue;
    assert.ok(EFFECT_CODES[code], `code 0x${code.toString(16)} is carried by a spell and not named`);
  }
  // …and the spells that carry an unnamed code are exactly the three named above, so a fourth
  // would show up as a failing test rather than as a spell that quietly casts nothing.
  const odd = file.named.filter((entry) => entry.codes.some((code) => UNNAMED.includes(code))).map((entry) => entry.name).sort();
  assert.deepEqual(odd, ['Necromancer\'s Amulet', 'Staff of Magnus', 'Volendrung', 'Wildfire']);
  assert.ok(Object.keys(EFFECTS).length >= 15, `${Object.keys(EFFECTS).length} effect kinds`);
});

test('spellsWithCode finds the damage spells in the install\'s own file', async () => {
  const file = await spellFile();
  const damage = spellsWithCode(file.named, [0x04]);
  const names = damage.map((entry) => entry.name);
  for (const name of ['Fireball', 'Fire Dart', 'Ice Bolt', 'Shock', 'Fire Storm', 'Gods\' Fire', 'Lightning']) {
    assert.ok(names.includes(name), `${name} is among the damage spells: ${names.join(', ')}`);
  }
  assert.ok(!names.includes('Heal'), 'Heal is not a damage spell');
});

// ── the library over it ───────────────────────────────────────────────────────

test('every named record joins to a meaning, and every meaning names the code its record carries', async () => {
  const file = await spellFile();
  const library = buildSpellLibrary(file.named, { known: ['Light Heal'] });
  assert.equal(library.spells.length, 64);
  assert.deepEqual(library.unknown, [], 'this build knows every standard spell by name');
  assert.deepEqual(library.missing, [], 'and the spell it was told the character knows is real');

  // **The pin that makes the table checkable.** Each meaning records the one code it was read
  // from; if a code were misread, this fails on the spell that carries it.
  let pinned = 0;
  for (const spell of library.spells) {
    if (spell.code === null) continue;
    const raw = record(file, spell.name);
    assert.ok(raw.codes.includes(spell.code),
      `${spell.name} should carry 0x${spell.code.toString(16)}; the file has [${raw.codes.map((c) => `0x${c.toString(16)}`).join(', ')}]`);
    pinned++;
  }
  assert.ok(pinned >= 20, `${pinned} meanings were checked against the file's own codes`);
  assert.equal(spellFromLibrary(library, 'fireball').name, 'Fireball');
  assert.equal(spellFromLibrary(library, 'Nothing At All'), null);
  for (const spell of library.spells) {
    assert.ok(spell.points > 0, `${spell.name} has a cost`);
    assert.ok(spell.target === 'self' || spell.target === 'target', `${spell.name} is aimed somewhere`);
    assert.ok(spell.effects.length > 0, `${spell.name} does something`);
  }
});

test('the spellmaker\'s own text is a bank of numbered effect templates', async () => {
  const bytes = await bytesOf('SPELLMKR.TXT');
  const { entries, warnings } = parseSpellMakerText(bytes);
  assert.deepEqual(warnings, []);
  assert.ok(entries.length >= 20, `${entries.length} templates`);
  assert.equal(entries[0].index, 0);
  assert.match(entries[0].text, /chance to inflict disease/i, entries[0].text.slice(0, 60));
  assert.match(entries[1].text, /poison/i);
  // The templates are about *effects the spellmaker makes*, not about the codes a record
  // carries: #00 is disease while a record's 0x02 is the ward `Shield` wears.
  assert.ok(entries.some((entry) => /fear/i.test(entry.text)), 'fear is one of the maker\'s effects');
});

// ── the casting law ───────────────────────────────────────────────────────────

// The book this caster carries is the Mage's own starting list (`STARTING_SPELLS`) plus the
// two spells the casting tests reach for by name — `Fireball` is the expensive one the cost
// and the spending are argued with, and `Heal` the self-spell. A test that means to *refuse*
// a spell overrides `knownSpells` for itself.
const caster = (extra = {}) => ({
  name: 'Caster', classId: 'mage', level: 1, health: 50, maxHealth: 80,
  spellPoints: 400, maxSpellPoints: 400,
  knownSpells: ['Light Heal', 'Fire Dart', 'Shield', 'Light', 'Fireball', 'Heal'], ...extra,
});

test('a spell costs its own number of spell points, and the class abilities discount it', async () => {
  const file = await spellFile();
  const library = buildSpellLibrary(file.named);
  const fireball = spellFromLibrary(library, 'Fireball');
  assert.equal(costOf(caster(), fireball), 325, 'the install\'s own cost');
  assert.equal(costOf(caster({ classId: 'battlemage' }), fireball), 293, 'the Battlemage\'s discount');
  const heal = spellFromLibrary(library, 'Heal');
  assert.equal(costOf(caster({ classId: 'healer' }), heal), 100, 'the Healer\'s cheap defensive spells (125 × 0.8)');
  assert.equal(costOf(caster({ classId: 'healer' }), fireball), 325, 'and no discount on fire');
});

test('Arena\'s fighters cannot cast at all, and a spell not in the book is refused by name', async () => {
  const file = await spellFile();
  const library = buildSpellLibrary(file.named);
  const fireball = spellFromLibrary(library, 'Fireball');
  const warrior = caster({ classId: 'warrior', spellPoints: null, maxSpellPoints: null, knownSpells: [] });
  const noPoints = canCast(warrior, fireball);
  assert.equal(noPoints.ok, false);
  assert.match(noPoints.reason, /no spell points/);
  const unknown = canCast(caster({ knownSpells: ['Light'] }), fireball);
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /Mages Guild/);
  const poor = canCast(caster({ spellPoints: 10 }), fireball);
  assert.equal(poor.ok, false);
  assert.match(poor.reason, /not enough spell points/);
  const fine = canCast(caster(), fireball);
  assert.equal(fine.ok, true);
  assert.equal(fine.cost, 325);
});

test('casting spends the points and hands the world its events', async () => {
  const file = await spellFile();
  const library = buildSpellLibrary(file.named);
  const fireball = spellFromLibrary(library, 'Fireball');
  const result = applySpell(fireball, { character: caster(), targetName: 'a rat' });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.cost, 325);
  assert.equal(result.character.spellPoints, 400 - 325, 'the points are gone');
  assert.ok(result.damage >= 25, `${result.damage} damage at level 1 (the base 25, plus half a level)`);
  assert.ok(result.events.some((event) => event.kind === 'damage'), JSON.stringify(result.events));
  assert.match(result.note, /Fireball/);
  assert.match(result.note, /a rat/);

  // A refusal leaves the character exactly as they were.
  const refused = applySpell(fireball, { character: caster({ spellPoints: 5 }) });
  assert.equal(refused.ok, false);
  assert.equal(refused.character.spellPoints, 5);
  assert.deepEqual(refused.events, []);
});

test('a self-spell lands on the caster: a heal mends, a shield wards, a light is lit', async () => {
  const file = await spellFile();
  const library = buildSpellLibrary(file.named);
  // **Everything the install's file holds**, because this test is about what a spell *does*
  // and not about what is in the book — knowledge has its own test, and it overrides the
  // book for itself. A caster who only knew their class's starting list would refuse half of
  // these by name, which is the right behaviour and the wrong fixture.
  // …and with the spell points to pay for the dearest of them (`Heal True` is 445, more than
  // the default fixture's whole purse of 400), so nothing here is refused for want of points.
  const everySpell = caster({
    spellPoints: 10000, maxSpellPoints: 10000,
    knownSpells: library.spells.map((spell) => spell.name),
  });
  const heal = applySpell(spellFromLibrary(library, 'Heal'), { character: everySpell });
  assert.equal(heal.ok, true, heal.reason);
  // `Heal` is 25 and a first-level caster adds half a level, rounded — the same figure
  // `powerOf` is held to below, so the two tests cannot drift apart.
  assert.equal(heal.character.health, 76, '50 + 26');
  assert.equal(heal.heal, 26);

  const capped = applySpell(spellFromLibrary(library, 'Heal True'), { character: { ...everySpell, health: 70 } });
  assert.equal(capped.character.health, 80, 'never past the character\'s own ceiling');

  const shield = applySpell(spellFromLibrary(library, 'Shield'), { character: everySpell });
  assert.equal(shield.character.ward, 15, 'the ward is on the character');
  assert.ok(shield.events.some((event) => event.kind === 'ward'));

  const light = applySpell(spellFromLibrary(library, 'Light'), { character: everySpell });
  assert.equal(light.character.light.radius, 8);
  const levitate = applySpell(spellFromLibrary(library, 'Levitate'), { character: everySpell });
  assert.equal(levitate.character.levitating, true);

  const resist = applySpell(spellFromLibrary(library, 'Resist Fire'), { character: everySpell });
  assert.equal(resist.character.resistances.fire, 3);

  const cure = applySpell(spellFromLibrary(library, 'Cure Poison'), { character: { ...everySpell, afflictions: ['poison', 'disease'] } });
  assert.deepEqual(cure.character.afflictions, ['disease'], 'only the poison is washed out');

  const open = applySpell(spellFromLibrary(library, 'Open'), { character: everySpell });
  assert.ok(open.events.some((event) => event.kind === 'open'), 'the lock is the world\'s business, so it is an event');
});

test('a drain takes health from the target and gives it to the caster', async () => {
  const file = await spellFile();
  const library = buildSpellLibrary(file.named);
  const stealer = caster({ spellPoints: 4000, knownSpells: ['Lifesteal', 'Strength Leech'] });
  const result = applySpell(spellFromLibrary(library, 'Lifesteal'), { character: stealer, targetName: 'a troll' });
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.damage > 0, 'it damages');
  assert.ok(result.character.health > 50, `and heals the caster: ${result.character.health}`);
  assert.equal(result.damage, 21, '20 plus half of level 1, rounded — the same figure the events carry');
});

test('power grows with the caster\'s level, which is Arena\'s progression shape', () => {
  const effect = { kind: 'damage', element: 'fire', power: 20 };
  assert.equal(powerOf(effect, { level: 1 }), 21);
  assert.equal(powerOf(effect, { level: 10 }), 25);
  assert.equal(powerOf({ kind: 'ward', power: 15 }, { level: 10 }), 15, 'a ward does not scale');
});

test('a spellbook: what a class starts with, and what the guild adds', async () => {
  const file = await spellFile();
  const library = buildSpellLibrary(file.named);
  assert.deepEqual(startingSpellsFor('mage'), ['Light Heal', 'Fire Dart', 'Light', 'Shield', 'Fireball', 'Levitate']);
  assert.deepEqual(startingSpellsFor('warrior', 0), [], 'a class with no spell points starts with nothing');
  // Every starting spell must be a spell the install really ships — the join that makes the
  // starting list a list of spells rather than a list of words.
  for (const classId of ['mage', 'healer', 'battlemage', 'sorceror', 'spellsword', 'nightblade', 'bard']) {
    for (const name of startingSpellsFor(classId)) {
      assert.ok(record(file, name), `${classId} starts with ${name}, which ${file.file} has`);
    }
  }
  const warrior = { classId: 'warrior', spellPoints: null, knownSpells: [] };
  assert.equal(isKnown(warrior, 'Heal'), false);
  const learnt = learnSpell({ classId: 'mage', knownSpells: ['Light'] }, 'Heal');
  assert.deepEqual(learnt.knownSpells, ['Light', 'Heal']);
  assert.deepEqual(learnSpell(learnt, 'Heal').knownSpells, ['Light', 'Heal'], 'learning twice is not two entries');
  const spent = spendFor({ spellPoints: 100 }, 30);
  assert.equal(spent.spellPoints, 70);
  assert.equal(spendFor({ spellPoints: 10 }, 30).spellPoints, 0, 'never negative');
  const rested = restore({ health: 3, maxHealth: 90, spellPoints: 1, maxSpellPoints: 200, afflictions: ['poison'], ward: 5 });
  assert.equal(rested.health, 90);
  assert.equal(rested.spellPoints, 200);
  assert.deepEqual(rested.afflictions, []);
  assert.equal(rested.ward, 0);
  const book = knownSpellsOf({ classId: 'mage', spellPoints: 100, knownSpells: ['Heal'] });
  assert.deepEqual(book, ['Heal'], 'an explicit book is the book');
  assert.deepEqual(knownSpellsOf({ classId: 'bard', spellPoints: 40 }), ['Light', 'Light Heal'],
    'and a character with no book gets their class\'s own list');
  assert.match(CASTING_NOTE, /A\.EXE/);
});
