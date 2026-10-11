// ARENA'S PROSE, CHECKED AGAINST ARENA'S DATA.
//
// The text files are the part of this project easiest to take on faith: they are
// prose, so a wrong parse still *looks* like something. These tests make every
// parse answer a question whose answer can be wrong.
//
// The strongest of them is the greeting index. `citytxt`'s records are numbered
// `#0600`…`#0663`, and this project reads that as
// `600 + provinceID * 8 + cityIndexWithinProvince`. A greeting's own first words
// name the city it belongs to, so the mapping can be checked against the names
// `CITYDATA.64` gives those same cities: North Point for 600, Daggerfall for 601,
// Necrom for 628, Archon for 663. Read the ids as hex, or the stride as nine, and
// the greetings land on the wrong cities and this fails.
//
// Run:  node --test tests/unit/text.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import {
  CITY_TEXT_BASE, CITY_TEXT_COUNT, CITY_TEXT_STRIDE, cityTextKey, cleanText, decodeText,
  fillTemplate, loadArenaText, parseArtifactText, parseCityText, parseDungeonText,
  parseTalkTemplates, placeholdersOf, wrapText,
} from '../../src/arena/arenaText.js';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { buildQuestChain } from '../../src/game/questData.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = () => new ArenaData(nodeSource(ARENA), { onWarn: () => {} });

test('the city-state greeting index is 600 + province * 8 + city', () => {
  assert.equal(CITY_TEXT_BASE, 600, 'the markers are #0600 decimal, not 0x0600 hex');
  assert.equal(CITY_TEXT_STRIDE, 8, 'eight city-states per province');
  assert.equal(CITY_TEXT_COUNT, 64, 'eight provinces with greetings, times eight cities');
  assert.equal(cityTextKey(0, 0), 600);
  assert.equal(cityTextKey(0, 1), 601);
  assert.equal(cityTextKey(4, 4), 636);
  assert.equal(cityTextKey(7, 7), 663);
});

test('every greeting in citytxt is filed under the city that it names', async () => {
  const world = await loadWorldMap(data());
  const bytes = await data().must('citytxt');
  const { greetings, warnings } = parseCityText(bytes);
  assert.equal(greetings.size, CITY_TEXT_COUNT, 'the file holds one greeting per city-state');
  assert.deepEqual(warnings, [], 'no record falls outside the city-state range');

  /** Every greeting that names its city, and every one that only describes it. */
  let named = 0;
  const unnamed = [];
  for (const province of world.provinces) {
    const cities = world.locations.filter((l) => l.provinceID === province.id && l.kind === 'city');
    cities.forEach((city, index) => {
      const greeting = greetings.get(cityTextKey(province.id, index));
      // The Imperial Province's city-states have no greeting: its one city is the
      // Imperial City, whose text the game shows elsewhere.
      if (province.id === 8) {
        assert.equal(greeting, undefined, `${city.name} should have no greeting`);
        return;
      }
      assert.ok(greeting, `${city.name} has a greeting at ${cityTextKey(province.id, index)}`);
      assert.equal(greeting.provinceID, province.id);
      assert.equal(greeting.cityIndex, index);
      const body = greeting.text.toLowerCase();
      if (body.includes(city.name.toLowerCase().split(' ')[0])) named++;
      else unnamed.push(city.name);
    });
  }

  // The mapping is pinned by *name*, at the ends of the range as well as the start:
  // these five greetings are the ones a shifted index, a hex base or a nine-wide
  // stride would move.
  const pinned = { 600: 'North Point', 601: 'Daggerfall', 602: 'Camlorn', 628: 'Necrom', 663: 'Archon' };
  for (const [id, city] of Object.entries(pinned)) {
    assert.match(greetings.get(Number(id)).text, new RegExp(city, 'i'),
      `greeting ${id} belongs to ${city}`);
  }

  // One greeting describes its city instead of naming it: Firsthold's opens with
  // "When High Lord Torinaan came to this…". The list is *explicit* rather than a
  // count, so if the index mapping broke, dozens of other names would appear here
  // and the test would say so instead of quietly still passing.
  assert.deepEqual(unnamed, ['Firsthold'], `greetings that do not name their city: ${unnamed.join(', ')}`);
  // 64 greetings: the eight provinces with city-states, eight cities each. (The
  // Imperial Province's city has none — the game shows the palace instead.)
  assert.equal(named + unnamed.length, 64, 'every city-state outside the Imperial Province has one');
  assert.equal(named, 63, 'and 63 of the 64 name their own city');
});

test('the eight quest dungeons each have Arena\'s own arrival text', async () => {
  const world = await loadWorldMap(data());
  const { intros, warnings } = parseDungeonText(await data().must('dungeon.txt'));
  assert.deepEqual(warnings, []);
  assert.equal(intros.size, 8, 'eight quest dungeons are described');

  // Checked against the quest chain rather than against a province index: each of
  // the eight pieces names a dungeon, and that dungeon must have text filed under
  // exactly that name — so the prose, `CITYDATA.64` and the chain all agree.
  const chain = buildQuestChain(world);
  const pieces = chain.stages.filter((s) => s.kind === 'piece');
  assert.equal(pieces.length, 8);
  assert.deepEqual(chain.missing, []);
  for (const stage of pieces) {
    const intro = intros.get(stage.title.toLowerCase());
    assert.ok(intro, `${stage.title} has an arrival text`);
    assert.equal(intro.name, stage.title);
    assert.match(intro.text, /Staff of Chaos/i, `${stage.title}'s text mentions the Staff`);
    // The shortest of the eight is Elden Grove's, at 201 characters.
    assert.ok(intro.text.length > 150, `${stage.title}'s text is prose, not a caption`);
  }
  // The file's order is NOT the quest order; nothing may rely on a position.
  const order = [...intros.keys()];
  assert.notDeepEqual(order.slice(0, 2), ['fang lair', 'labyrinthian'],
    'dungeon.txt is not stored in quest order — which is why the parse returns a map by name');
});

test('the artifact banks split into offers that name things and replies that do not', async () => {
  const pool = data();
  let offers = 0;
  let replies = 0;
  for (const name of ['artfact1.dat', 'artfact2.dat']) {
    const parsed = parseArtifactText(await pool.must(name));
    assert.deepEqual(parsed.warnings, [], `${name} parsed without complaint`);
    assert.ok(parsed.offers.length > 100, `${name} holds a bank of offers`);
    assert.ok(parsed.replies.length > 20, `${name} holds the replies a haggler gets`);
    for (const offer of parsed.offers) {
      assert.ok(offer.placeholders.length > 0, 'an offer names what varies');
      assert.ok(offer.placeholders.every((p) => /^%[a-z0-9]+$/i.test(p)), 'placeholders are %-words');
    }
    // The split is by content, so the two sets must not overlap.
    for (const reply of parsed.replies) assert.ok(!/%[a-z0-9]+/i.test(reply), `a reply has no placeholders: ${reply.slice(0, 40)}`);
    offers += parsed.offers.length;
    replies += parsed.replies.length;
  }
  // Measured: each bank holds 240 NUL-separated records — 186 offers and 54 replies —
  // and the two banks are the same shape.
  assert.equal(offers, 372, 'the two banks together hold 372 offers');
  assert.equal(replies, 108, 'and 108 replies');
});

test('template.dat is 811 records over 613 ids, and the first few ids carry variants', async () => {
  const { templates, count } = parseTalkTemplates(await data().must('template.dat'));
  assert.equal(count, 811, 'every `#NNNNa`-style marker in the file became a record');
  assert.equal(templates.size, 613, 'the records group into 613 ids');

  // The shape of the file, measured: a handful of scenario ids (`#0000a`…`#0000l`)
  // with many interchangeable phrasings, and then hundreds of single one-off
  // lines. Both halves matter — the variants are what stop a shopkeeper repeating
  // itself, and the one-offs are what a specific moment can say.
  const variants = [...templates.values()].map((list) => list.length);
  const groups = variants.filter((n) => n > 1);
  assert.equal(groups.length, 6, 'six ids carry more than one phrasing');
  assert.equal(Math.max(...variants), 48, 'the largest group holds 48 phrasings');
  assert.equal(variants.filter((n) => n === 1).length, 607, 'and 607 ids are single lines');
});

test('the shopkeeper banks are separable lines, with the original\'s %-words intact', async () => {
  const library = await loadArenaText(data());
  assert.deepEqual(library.warnings, [], 'every text file this project reads is present');
  for (const bank of ['muguild.dat', 'tavern.dat', 'equip.dat', 'selling.dat']) {
    const lines = library.service[bank];
    assert.ok(lines.length > 50, `${bank} has lines to sell with`);
    assert.ok(lines.every((line) => line.length < 400), `${bank}'s records are separated`);
  }
  assert.ok(library.service['equip.dat'].some((l) => l.includes('%i') && l.includes('%mm')),
    'the equipment bank prices items, as `%i` for `%mm` gold');
});

test('fillTemplate is greedy about its keys and never shows a player a %-word', () => {
  // `%mm` must not be read as `%m` followed by `m`, and `%oap` not as `%o` + `ap`.
  assert.equal(fillTemplate('It costs %mm gold.', { mm: 25 }), 'It costs 25 gold.');
  assert.equal(fillTemplate('A %i for %mm gold.', { i: 'sword', mm: 5 }), 'A sword for 5 gold.');
  assert.equal(fillTemplate('Call me %an.', { an: 'Varnis' }), 'Call me Varnis.');
  // Unknown words are dropped rather than printed, and the punctuation left behind
  // is tidied, because a player must never read "%qmn" or a dangling comma.
  assert.equal(fillTemplate('So listen up, %qmn.', {}), 'So listen up.');
  assert.equal(fillTemplate('A %g and %g2, then %nothing at all.', { g: 'guild', g2: 'fee' }),
    'A guild and fee, then at all.');
  assert.deepEqual(placeholdersOf('%a %an %oap'), ['a', 'an', 'oap']);
});

test('text helpers survive Arena\'s line endings and its end-of-record marks', () => {
  assert.equal(cleanText('\r\nHello there, & \r\n\r\n'), 'Hello there,');
  assert.equal(cleanText('Two\r\nlines\r\n'), 'Two\nlines');
  const bytes = new Uint8Array([...'A\0B\r\nC'].map((c) => c.charCodeAt(0)));
  assert.equal(decodeText(bytes), 'A\0B\r\nC');
  assert.deepEqual(wrapText('one two three four', 8), ['one two', 'three', 'four']);
  // A byte above 127 in a text file is padding, not a glyph.
  assert.equal(decodeText(new Uint8Array([65, 200, 66])), 'AB');
});
