// DIALOGUE: `template.dat`'S OWN KEYS, AND EVERY WORD A PERSON SAYS.
//
// The owner, 2026-10-19: *"you need to also fix the dialogue npcs have. now its mostly random but it
// needs to be coherent with their race, place and personality"*. The fix is `game/dialogue.js`:
// `template.dat` is a **keyed** file (its own personality banks, rumours, jokes, oaths and trades),
// the reference reads it that way (OpenTESArena's `GameWorldUiState.cpp` and `DialogueFunctions.cpp`
// are where the key numbers come from), and a person speaks from their own keys rather than from one
// undifferentiated pool.
//
// Three things are checkable against the real files, and all three are checked here:
//
//   * **the keys are the file's own** — the personalities, the trades and the banks exist in the
//     install with the counts this module claims, and every figure the port can place has the
//     personality the reference gives its art;
//   * **no `%`-word ever reaches a player**, in any settlement, at any seed, for any personality —
//     and a line that wants a word nobody has is refused rather than blanked;
//   * **coherence itself**: a priest speaks a priest's bank, a barkeep is given a tavern's trade, a
//     province's oath is the province's own, and the city-state's answer names the city-state.
//
// Run:  node --test tests/unit/dialogue.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { loadArenaText, placeholdersOf } from '../../src/arena/arenaText.js';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { PERSON_ITEMS } from '../../src/game/dungeonItems.js';
import { STILL_ROLES } from '../../src/game/staticFolk.js';
import {
  OATH_COUNT, PATRON, PATRON_ROLES, PERSONAS, PERSONA_BY_ART, PERSONA_BY_ITEM, PERSONA_BY_ROLE,
  ROLE_TRADES, TALK_KEYS, canSay, dialogueBanks, fillSpeech, greetingFor, homeProvinceName,
  homeProvinceOf, isWholeSentence, jokeFor, lineFrom, oathFor, occupationFor, occupationsOf,
  personaOf, speakerFor, talkParts, topicsFor,
} from '../../src/game/dialogue.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = () => new ArenaData(nodeSource(ARENA), { onWarn: () => {} });

const library = await loadArenaText(data());
const banks = dialogueBanks(library.talkTemplates);
const world = await loadWorldMap(data());

/** A person born of an art name and a cell, which is all a speaker needs to be somebody. */
const personOf = (over = {}) => ({ name: 'Bathi', place: { row: 3, col: 4 }, outfit: { key: '0CHN' }, ...over });

/** Every settlement's own talk values, with the neighbour the map gives it. */
const whereOf = (settlement) => {
  const settlements = world.settlements();
  const neighbour = settlements
    .filter((s) => s.name !== settlement.name)
    .sort((a, b) => (
      Math.hypot(a.global.x - settlement.global.x, a.global.y - settlement.global.y)
      - Math.hypot(b.global.x - settlement.global.x, b.global.y - settlement.global.y)
    ))[0];
  return {
    place: settlement.name,
    neighbour: neighbour?.name,
    province: settlement.province,
    kind: settlement.kind,
    provinceID: settlement.provinceID,
  };
};

test('the keys are template.dat\'s own, with the counts this module claims', () => {
  // The file, measured whole: 613 ids, 2 462 `&`-separated parts, 1 823 whole sentences.
  assert.equal(banks.census.keys, 613);
  assert.equal(banks.census.parts, 2462);
  assert.equal(banks.census.sentences, 1823);
  // Every one of the reference's fifteen personalities has both of its banks.
  assert.equal(PERSONAS.length, 15);
  assert.equal(banks.census.personas, 15, 'all fifteen "who are you" banks are in the file');
  assert.equal(banks.census.intros, 78);
  assert.equal(banks.census.introsAgain, 70);
  // …and the subject banks, one key each (`OpenTESArena`'s own call sites).
  assert.equal(banks.census.rumour, 34, '#185 (29 parts) + #159 (10), whole sentences');
  assert.equal(banks.census.jokes, 21, '#363');
  assert.equal(banks.census.patron, 40, '#1430, a tavern\'s drinkers');
  assert.equal(banks.census.oathBanks, OATH_COUNT, '#364…371: one bank per province');
  assert.equal(banks.census.oaths, 80, 'ten oaths each');
  assert.equal(banks.census.occupations, 100, '#262');
  assert.equal(banks.census.trades, 100, '#263…362: a description for every one of them');
  assert.equal(banks.census.city, 14, 'whole sentences that need nothing but the city-state');
  for (const key of Object.values(TALK_KEYS)) {
    assert.ok(library.talkTemplates.has(key), `#${key} is in this install`);
  }
});

test('every figure the port can place has the personality the reference gives its art', () => {
  // `ArenaAnimUtils.cpp`'s `tryGetStaticNpcPersonalityType`, item for item, against the port's own
  // item table (`dungeonItems.js`): each person item is a persona here, and it is the same one.
  const expected = {
    15: 'citizen', 16: 'beggar', 17: 'firebreather', 18: 'prostitute', 19: 'prostitute2',
    20: 'prostitute2', 21: 'jester', 22: 'vendor', 23: 'vendor', 24: 'musician', 25: 'musician',
    26: 'priest', 27: 'priest', 28: 'thief', 29: 'snakecharmer', 30: 'vendor2', 31: 'wizard',
  };
  for (const [item, key] of Object.entries(expected)) {
    assert.equal(personaOf({ itemIndex: Number(item) }).key, key, `item ${item}`);
  }
  // Every item the port calls a person answers with a personality, and a role that names a trade
  // is the personality that trade belongs to — the two tables agree because they are one reading.
  for (const [item, role] of Object.entries(PERSON_ITEMS)) {
    const persona = personaOf({ itemIndex: Number(item) });
    assert.ok(PERSONAS.includes(persona), `item ${item} (${role}) has a persona`);
  }
  assert.equal(personaOf({ role: 'priest', file: 'PREST1.DFA' }).key, 'priest');
  assert.equal(personaOf({ role: 'wizard', file: 'WIZZ1.DFA' }).key, 'wizard');
  assert.equal(personaOf({ role: 'jester', file: 'JSTER1.DFA' }).key, 'jester');
  assert.equal(personaOf({ role: 'smith', file: 'SMITH.DFA' }).key, 'citizen');
  assert.equal(personaOf({ role: 'guard', file: 'GUARD1D.IMG' }).key, 'citizen');
  // …and by the art's own word, when a caller carries the record and no role: `MUSIC1.DFA` is a
  // musician whether or not anybody stamped the role.
  assert.equal(personaOf({ file: 'MUSIC1.DFA' }).key, 'musician');
  assert.equal(personaOf({ kind: 'WIZZ1' }).key, 'wizard');
  // A tavern's drinkers have no personality in the reference — they have a bank (`#1430`).
  for (const role of ['patron', 'man', 'woman']) {
    assert.equal(personaOf({ role, file: 'MAN01.DFA' }), PATRON, `${role} is a tavern patron`);
  }
  assert.deepEqual([...PATRON_ROLES].sort(), ['man', 'patron', 'woman']);
  // Every role the art census names has an entry, so no figure the install draws falls through.
  for (const [stem, entry] of Object.entries(STILL_ROLES)) {
    assert.ok(['#000'], `#${stem}`);
    const art = `${stem === 'JTHARN' ? 'JTHARN' : stem}1.${stem === 'KING' ? 'IMG' : 'DFA'}`;
    const persona = personaOf({ role: entry.role, file: art });
    assert.ok(persona === PATRON || PERSONAS.includes(persona), `${stem} (${entry.role})`);
  }
  // A walking citizen, an armoured stranger, a lizard-folk: nobody in the street is a persona the
  // reference did not give them — Arena's own answer for a plain citizen is Citizen.
  assert.equal(personaOf({ file: '01CHNWLK.CFA', armour: 'CHN' }).key, 'citizen');
  assert.equal(personaOf({ kind: 'FMGEN', outfit: { key: 'FMGEN' } }).key, 'citizen');
  assert.equal(personaOf(null).key, 'citizen');
});

test('a person speaks from their own bank — the priest a priest\'s words, the drinker the tavern\'s', () => {
  const where = whereOf(world.settlements()[0]);
  const player = { name: 'Vivec', race: 'Dark Elf' };
  const spoken = (person, seed = 4242) => {
    const speaker = speakerFor({ person, banks, place: where, provinceID: where.provinceID, player, seed });
    return { speaker, first: greetingFor(speaker, banks, { turn: 0, met: false }), again: greetingFor(speaker, banks, { turn: 1, met: true }) };
  };
  // The bank is the personality's own: #100 + persona on a first meeting, #115 + persona once met.
  const cases = [
    { role: 'priest', name: 'Milie', file: 'PREST1.DFA' },
    { role: 'wizard', name: 'Ulfric', file: 'WIZZ1.DFA' },
    { role: 'jester', name: 'Rafael', file: 'JSTER1.DFA' },
    { role: 'beggar', name: 'Tom', file: 'BEG#1.DFA' },
    { role: 'musician', name: 'Lute', file: 'MUSIC1.DFA' },
    { role: 'fire-eater', name: 'Ash', file: 'FIREMN.DFA' },
    { role: 'shady character', name: 'Nix', file: 'SHADY1.DFA' },
    { name: 'Corvus', file: '01CHNWLK.CFA' },
  ];
  for (const person of cases) {
    const { speaker, first, again } = spoken(person);
    assert.ok(first, `${person.name} has an introduction`);
    assert.equal(first.key, TALK_KEYS.intro + speaker.persona.index, `${person.name} speaks #100+persona`);
    assert.equal(first.id, TALK_KEYS.intro + speaker.persona.index);
    assert.ok(again, `${person.name} has a second word`);
    assert.equal(again.key, TALK_KEYS.introAgain + speaker.persona.index, `${person.name} remembers you`);
    assert.notEqual(first.text, again.text, 'and it is not the same sentence');
  }
  // A tavern's drinker answers from the tavern's own bank, and walks it: a different line each time.
  const patron = spoken({ role: 'patron', name: 'Perth', file: 'MAN02.DFA' }, 7);
  assert.ok(patron.speaker.persona === PATRON);
  assert.equal(patron.first.key, TALK_KEYS.patron);
  assert.equal(patron.again.key, TALK_KEYS.patron);
  assert.notEqual(patron.first.text, patron.again.text, 'the second knock gets another line');
  assert.match(patron.first.subject, /tavern/, patron.first.subject);
  // **The lines read as the game's own**: a priest of the temple, a drinker telling you where the
  // bartender is — and the same person twice never repeats themselves.
  assert.match(cases[0] && spoken(cases[0]).first.text, /[.!?”"]$/, 'a whole sentence');
});

test('no %-word ever reaches a player: every settlement, every personality, every seed', () => {
  const settlements = world.settlements();
  assert.equal(settlements.length, 288);
  const personas = [
    ...PERSONAS.map((persona) => ({ persona, role: null })),
    { persona: PATRON, role: 'patron' },
  ];
  let greetings = 0;
  let topics = 0;
  for (const settlement of settlements.slice(0, 40)) {
    const where = whereOf(settlement);
    for (const { role } of personas) {
      for (let seed = 0; seed < 6; seed++) {
        const person = personOf({ role, name: 'Bathi', file: 'PREST1.DFA' });
        const speaker = speakerFor({ person, banks, place: where, provinceID: where.provinceID, player: { name: 'Vivec', race: 'Khajiit' }, seed });
        for (const met of [false, true]) {
          const greeting = greetingFor(speaker, banks, { turn: met ? 1 : 0, met });
          assert.ok(greeting, `${role ?? 'citizen'} (${settlement.name}, seed ${seed}) always has a word`);
          assert.ok(!greeting.text.includes('%'), `"${greeting.text.slice(0, 80)}" has no unfilled word`);
          assert.equal(placeholdersOf(greeting.text).length, 0);
          assert.ok(isWholeSentence(greeting.text), `"${greeting.text.slice(0, 60)}" is a whole sentence`);
          assert.ok(!greeting.text.includes('&'), 'and carries no part separator');
          greetings++;
        }
        for (const topic of topicsFor(speaker, banks, 0)) {
          assert.ok(!topic.text.includes('%'), `${topic.key}: "${topic.text.slice(0, 70)}"`);
          assert.equal(placeholdersOf(topic.text).length, 0);
          assert.ok(isWholeSentence(topic.text), `${topic.key} is a whole sentence`);
          topics++;
        }
      }
    }
  }
  assert.ok(greetings > 300, `${greetings} greetings measured`);
  assert.ok(topics > 300, `${topics} answers measured`);
  // And a line that wants a word nobody has is **refused**, not shown with a hole in it.
  const impossible = fillSpeech('The %t of %cn sends his regards to %rf.', { cn: 'Daggerfall' });
  assert.ok(impossible.unfilled.includes('t') && impossible.unfilled.includes('rf'), JSON.stringify(impossible));
  assert.equal(canSay({ words: ['t'] }, { cn: 'Daggerfall' }), false, 'a bank line nobody can say is skipped');
  assert.equal(lineFrom([{ words: ['t'], text: 'The %t of %cn.', id: 1 }], { cn: 'Daggerfall' }, 1), null);
});

test('the personality is read off the art, so the same figure speaks the same way everywhere', () => {
  const where = whereOf(world.settlements()[0]);
  const player = { name: 'Vivec', race: 'Breton' };
  const firstLineFrom = (person, seed) => {
    const speaker = speakerFor({ person, banks, place: where, provinceID: where.provinceID, player, seed });
    return greetingFor(speaker, banks, { turn: 0, met: false });
  };
  // The same face at the same cell says the same thing, every visit.
  const person = personOf({ role: 'wizard', name: 'Ulfric', file: 'WIZZ1.DFA' });
  assert.equal(firstLineFrom(person, 99).text, firstLineFrom({ ...person }, 99).text);
  // …and two people with the same art but different cells do not read as one person: the scene's
  // own seed is the cell (`interior.js`'s `talkSeedFor`), so the same face elsewhere is somebody
  // else.
  const seedAt = (row, col) => Math.round(row * 7919 + col * 131 + 128 * 3);
  const other = firstLineFrom({ ...person, place: { row: 40, col: 12 } }, seedAt(40, 12));
  assert.notEqual(firstLineFrom(person, seedAt(3, 4)).text, other.text);
  // A **walking** stranger is a citizen of the place, and says so with the trade the install's own
  // hundred give them — name, trade and description out of one row of the file.
  const citizen = firstLineFrom(personOf({ name: 'Corvus', file: '01CHNWLK.CFA' }), 5150);
  const speaker = speakerFor({
    person: personOf({ name: 'Corvus', file: '01CHNWLK.CFA' }),
    banks, place: where, provinceID: where.provinceID, player, seed: 5150,
  });
  assert.ok(speaker.occupation, 'a citizen has a trade');
  assert.ok(citizen.text.includes('Corvus'), `"${citizen.text.slice(0, 80)}" names them`);
  assert.ok(citizen.text.includes(speaker.occupation.name), 'and names the trade they were given');
  assert.ok(citizen.text.includes(speaker.values.doc), 'and does what that trade does');
  // A figure whose art names a trade is given **that trade's own rows** — the reading is stamped in
  // `ROLE_TRADES`, and every word in it is the install's own.
  const smith = speakerFor({ person: personOf({ role: 'smith', name: 'Bathi', file: 'SMITH.DFA' }), banks, place: where, provinceID: where.provinceID, player, seed: 7 });
  assert.ok(ROLE_TRADES.smith.includes(smith.occupation.name), `a smith is given ${smith.occupation.name}`);
  const barkeep = speakerFor({ person: personOf({ role: 'bartender', name: 'Bela', file: 'BARTEND.DFA' }), banks, place: where, provinceID: where.provinceID, player, seed: 99 });
  assert.ok(ROLE_TRADES.bartender.includes(barkeep.occupation.name), `a barkeep is given ${barkeep.occupation.name}`);
  // And nobody is handed a row the install cannot describe: `bodyguard` and `bartender` name a
  // building this port has no name for in all three of their descriptions, so they are never drawn.
  const unspeakable = new Set();
  for (const row of occupationsOf(library.talkTemplates)) {
    const values = { ...speaker.values };
    if (!row.lines.some((line) => canSay(line, values))) unspeakable.add(row.name);
  }
  assert.deepEqual([...unspeakable].sort(), ['bartender', 'bodyguard'], 'the two rows nobody is given');
  // Every word in the role table is a trade the install really has (`#262`), so a typo cannot
  // quietly empty a figure's trade list.
  const names = new Set(occupationsOf(library.talkTemplates).map((row) => row.name));
  for (const [role, trades] of Object.entries(ROLE_TRADES)) {
    for (const trade of trades) assert.ok(names.has(trade), `${role} → ${trade} is one of the install's hundred`);
    const drawn = new Set();
    for (let seed = 0; seed < 40; seed++) {
      const occupation = occupationFor({
        person: { role, name: 'X', file: 'SMITH.DFA' }, banks,
        persona: personaOf({ role }), values: { n: 'X', ra: 'Breton' }, seed,
      });
      if (occupation) drawn.add(occupation.name);
    }
    assert.ok([...drawn].every((name) => trades.includes(name)), `${role} draws only its own rows: ${[...drawn].join(', ')}`);
  }
});

test('the place is the place: a province\'s own oath, and an answer that names the city-state', () => {
  const settlements = world.settlements();
  const skyrim = settlements.find((s) => s.province === 'Skyrim');
  const morrowind = settlements.find((s) => s.province === 'Morrowind');
  assert.ok(skyrim && morrowind);
  // `#364 + the province's race index` (`DialogueManager.cpp`'s `getOathsEntryKey`): a Nord swears
  // by the north's own gods and a Dunmer by Morrowind's, and the two banks share no line.
  const nord = oathFor(banks, skyrim.provinceID, 3);
  const dunmer = oathFor(banks, morrowind.provinceID, 3);
  assert.ok(nord && dunmer);
  assert.equal(nord.key, TALK_KEYS.oaths + skyrim.provinceID);
  assert.equal(dunmer.key, TALK_KEYS.oaths + morrowind.provinceID);
  assert.notEqual(nord.text, dunmer.text);
  assert.ok(banks.oaths[morrowind.provinceID].some((line) => line.text === dunmer.text));
  // The Imperial Province has no oath bank of its own — the reference draws one of the eight at
  // random for it, and this port draws the same eight from the speaker's own seed.
  const home = { name: 'Vivec', race: 'Khajiit' };
  assert.equal(homeProvinceOf('Khajiit'), 6);
  assert.equal(homeProvinceName('Khajiit'), 'Elsweyr');
  assert.equal(homeProvinceName('Dark Elf'), 'Morrowind');
  assert.equal(homeProvinceName('Imperial'), 'Imperial Province');
  assert.equal(homeProvinceOf('nonsense'), -1);
  // **The city-state's answer names the city-state** the credit line names, in every one of the
  // 288 settlements — which is a rule about the bank, not about the line a seed landed on.
  for (const settlement of settlements.slice(0, 24)) {
    const where = whereOf(settlement);
    const speaker = speakerFor({
      person: personOf({ name: 'Bathi', file: '01CHNWAL.CFA' }), banks, place: where,
      provinceID: where.provinceID, player: home, seed: 4242,
    });
    const city = topicsFor(speaker, banks, 0).find((topic) => topic.key === 'city');
    assert.ok(city, `${settlement.name} has a city-state question`);
    assert.ok(city.text.includes(settlement.name), `${settlement.name}: "${city.text.slice(0, 80)}"`);
    assert.equal(city.label, settlement.name);
    assert.match(city.subject, new RegExp(`about ${settlement.name}`));
  }
  // …and with no place to name at all, the question is not offered — a dungeon has no city-state.
  const nowhere = topicsFor(speakerFor({ person: personOf(), banks, place: null, provinceID: null, player: home, seed: 1 }), banks, 0);
  assert.equal(nowhere.some((topic) => topic.key === 'city'), false, 'no place, no city question');
  assert.equal(nowhere.length, 1, 'but there is still a line of local talk');
  // **The player's own race is in the lines**: Arena addresses a stranger by it ("young %ra"), and
  // the port fills it from the character rather than dropping those sentences.
  const addressed = topicsFor(speakerFor({
    person: personOf(), banks, place: whereOf(settlements[0]), provinceID: 0, player: home, seed: 11,
  }), banks, 0);
  assert.ok(addressed.length > 0);
});

test('a person with no name still speaks, and the parts are the game\'s own', () => {
  const where = whereOf(world.settlements()[0]);
  const player = { name: 'Vivec', race: 'Breton' };
  // An unnamed figure cannot introduce itself by name (`#100` is all `%n`), so it falls through to
  // the town's own lines rather than going mute: the floor of the bank chain.
  const unnamed = speakerFor({ person: { place: { row: 1, col: 1 } }, banks, place: where, provinceID: 0, player, seed: 5 });
  const greeting = greetingFor(unnamed, banks, { turn: 0, met: false });
  assert.ok(greeting, 'an unnamed person still has something to say');
  assert.ok(banks.city.some((line) => line.key === greeting.key), `#${greeting.key} is one of the town's own lines`);
  assert.ok(greeting.text.includes(where.place), `"${greeting.text.slice(0, 70)}" names the place`);
  // The part separator is the game's own, and it is never printed.
  assert.deepEqual(talkParts('One.& Two.&&Three. '), ['One.', 'Two.', 'Three.']);
  assert.deepEqual(talkParts(''), []);
  for (const bank of [banks.rumour, banks.city, banks.patron, banks.joke]) {
    for (const line of bank) assert.ok(!line.text.includes('&'), `#${line.id} carries no separator`);
  }
  // A greeting is never a fragment: the bank only holds whole sentences.
  for (const bank of [banks.rumour, banks.city, banks.patron]) {
    for (const line of bank) {
      assert.ok(line.text.length >= 30, `#${line.id} is long enough to be a sentence`);
      assert.ok(isWholeSentence(line.text), `#${line.id} is a whole sentence: ${line.text.slice(0, 60)}`);
    }
  }
  // The personalities' own names are the reference's fifteen, in the reference's order.
  assert.deepEqual(PERSONAS.map((persona) => persona.name), [
    'Citizen', 'Prostitute', 'Prostitute2', 'Jester', 'Firebreather', 'SnakeCharmer', 'Beggar',
    'StreetVendor', 'StreetVendor2', 'Thief', 'Wizard', 'Priest', 'Musician', 'StreetCleaner', 'Slaver',
  ]);
  assert.deepEqual(Object.keys(PERSONA_BY_ITEM).length, 19);
  assert.ok(Object.keys(PERSONA_BY_ROLE).length >= 18);
  assert.ok(Object.keys(PERSONA_BY_ART).includes('WIZZ'));
});

test('a joke is a template too, and it is filled before the jester tells it', () => {
  // **Every one of the file's 21 jokes is about the person listening**, written `%ra` — so a joke is
  // not a finished sentence, and handing its raw text to a line as `%jok` left a `%` inside it. The
  // read-back then refused the whole remark, which is why the browser suite's speaker showed a joke
  // still carrying `%ra` in its values and twelve introductions nobody ever heard. Two of the 21
  // name a building (`%nt`, `%tem`) this install cannot name, and they are never drawn.
  assert.equal(banks.joke.length, 21);
  const where = whereOf(world.settlements()[0]);
  const player = { name: 'Vivec', race: 'Khajiit' };
  const jester = { name: 'Corrilian Adian', role: 'jester', file: '03UNAWLK.CFA' };
  const spoken = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const speaker = speakerFor({ person: jester, banks, place: where, provinceID: where.provinceID, player, seed });
    const greeting = greetingFor(speaker, banks, { turn: 1, met: false });
    assert.ok(greeting, `seed ${seed} still speaks`);
    assert.ok(!greeting.text.includes('%'), `seed ${seed} says no %-word: ${greeting.text}`);
    if (banks.joke.some((joke) => greeting.text.includes(fillSpeech(joke.text, speaker.values).text))) {
      spoken.add(greeting.text);
    }
  }
  assert.ok(spoken.size >= 10, `the jester really tells jokes: ${spoken.size} of the file's bank`);
  // The joke is the player's own race, because that is what the file's jokes are about.
  assert.ok([...spoken].every((text) => text.includes('Khajiit')), 'every joke names the player’s race');
  // A joke that needs a building the install has no name for is never picked when the values are in.
  const values = { ra: 'Khajiit', cn: where.place, cn2: where.neighbour };
  for (let seed = 0; seed < 30; seed++) {
    const joke = jokeFor(banks, seed, values);
    assert.ok(joke && joke.words.every((word) => Boolean(values[word])), `seed ${seed}: ${joke?.text}`);
  }
  // …and the file's `%jok.` no longer prints a second stop after a joke that ends in `!`.
  assert.equal(fillSpeech('Most %ra family trees don\'t fork!.', { ra: 'Khajiit' }).text,
    'Most Khajiit family trees don\'t fork!');
  assert.equal(fillSpeech('Wait... %ra.', { ra: 'Khajiit' }).text, 'Wait... Khajiit.', 'an ellipsis is three dots');
});
