// ARENA'S MAIN-QUEST SCRIPT — the game's words, the speech's clock, and the beat rules.
//
// Two kinds of check. The **data** is held to the install: every checked-in line must be the
// `TEMPLATE.DAT` text it claims, and every stored clip length the `SPEECH/` clip it measures.
// The **rules** are held to the walkthrough: the level-2 gate, `1294 + pieces`, `1392 + pieces - 1`,
// the cut Jewel briefing, and the palace/ending beats.
//
//   node --test tests/unit/storyscript.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { parseTemplateDat, templateEntries, templateStrings } from '../../src/arena/templateDat.js';
import { vocSeconds } from '../../src/arena/vocFile.js';
import { STORY_SPEECH, narrationClips, narrationFiles, narrationMs } from '../../src/arena/storySpeech.js';
import { STORY_LINES } from '../../src/game/storyLines.js';
import {
  CELL_DREAM, DEATH_TEXT, EMPEROR_THANKS, ETERNAL_CHAMPION, JEWEL_BRIEFING, JEWEL_CRY, PALACE_TAUNT,
  QUEST_OPENING, STORY_BEATS, dueAmbush, dueCellDream, dueDream, riaDreamFor, storyKeys, storyMovie,
  storySpeaker, storyText, tharnAmbushFor,
} from '../../src/game/storyScript.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const TEMPLATE = path.join(ARENA, 'TEMPLATE.DAT');
const SPEECH = path.join(ARENA, 'SPEECH');
const INSTALL = fs.existsSync(TEMPLATE);

test('every line is the install’s own text, word for word', { skip: !INSTALL && 'no install' }, () => {
  const doc = parseTemplateDat(new Uint8Array(fs.readFileSync(TEMPLATE)));
  for (const key of storyKeys()) {
    const [entry] = templateEntries(doc, key);
    assert.ok(entry, `TEMPLATE.DAT has #${key}`);
    const installed = templateStrings(entry.value).join(' ').trim();
    assert.equal(STORY_LINES[key], installed, `#${key} is the game's own words`);
    assert.ok(!/[&]/.test(STORY_LINES[key]), `#${key} has no template separator left`);
  }
});

test('death is Ria’s, and it is the install’s own line', { skip: !INSTALL && 'no install' }, () => {
  // The owner, 2026-10-22: *"when you die the Ria cutscene should play, the one that says
  // with you died the last hope"*. `TEMPLATE.DAT` key 1402 is that line, `VISION.FLC` is the
  // face that speaks it, and the narration is the three clips that belong to the key.
  assert.equal(DEATH_TEXT, 1402);
  assert.equal(storySpeaker(DEATH_TEXT), 'Ria Silmane');
  assert.equal(storyMovie(DEATH_TEXT), 'VISION.FLC');
  assert.match(storyText(DEATH_TEXT, { name: 'Tester' }), /With you died our last hope/);
  assert.match(storyText(DEATH_TEXT, { name: 'Tester' }), /Goodbye, Tester\./);
  assert.equal(narrationClips(DEATH_TEXT), 3);
  assert.equal(narrationMs(DEATH_TEXT), 15450);
  const [entry] = templateEntries(parseTemplateDat(new Uint8Array(fs.readFileSync(TEMPLATE))), DEATH_TEXT);
  assert.equal(STORY_LINES[DEATH_TEXT], templateStrings(entry.value).join(' ').trim());
});

test('the script carries exactly the beats the quest needs', () => {
  const keys = storyKeys();
  // Ria's dreams: the cell, the level-2 opening, one per piece, and the cut briefing.
  for (const key of [CELL_DREAM, QUEST_OPENING, JEWEL_BRIEFING]) assert.ok(keys.includes(key), `#${key}`);
  for (let piece = 0; piece <= 8; piece++) assert.ok(keys.includes(1294 + piece), `#${1294 + piece}`);
  // Tharn's eight answers.
  for (let piece = 1; piece <= 8; piece++) assert.ok(keys.includes(1391 + piece), `#${1391 + piece}`);
  // The palace, the Jewel, and the Emperor.
  for (const key of [PALACE_TAUNT, JEWEL_CRY, EMPEROR_THANKS, ETERNAL_CHAMPION]) assert.ok(keys.includes(key), `#${key}`);
});

test('every stored clip length is the install’s own, and totals to the narration', { skip: !fs.existsSync(SPEECH) && 'no SPEECH folder' }, () => {
  for (const key of storyKeys()) {
    const names = fs.readdirSync(SPEECH).filter((n) => new RegExp(`^${key}_\\d\\d[AB]\\.VOC$`, 'i').test(n)).sort();
    assert.equal(names.length, narrationClips(key), `#${key} clip count`);
    const measured = names.map((name) => vocSeconds(new Uint8Array(fs.readFileSync(path.join(SPEECH, name)))));
    const stored = STORY_SPEECH[key];
    stored.forEach((seconds, i) => {
      assert.ok(Math.abs(seconds - measured[i]) < 0.001, `#${key} clip ${names[i]}: ${seconds} vs ${measured[i]}`);
    });
    const total = Math.round(stored.reduce((sum, s) => sum + s, 0) * 1000);
    assert.equal(narrationMs(key), total, `#${key} total`);
  }
});

test('the clip files are named the way Arena names them', () => {
  const files = narrationFiles(1500);
  assert.equal(files.length, 8);
  assert.deepEqual(files.slice(0, 4), [
    'SPEECH/1500_00A.VOC', 'SPEECH/1500_00B.VOC', 'SPEECH/1500_01A.VOC', 'SPEECH/1500_01B.VOC',
  ]);
  assert.equal(files[7], 'SPEECH/1500_03B.VOC');
  assert.deepEqual(narrationFiles(999999), []);
});

test('the dream’s narration is 133 seconds: the movie loops under it', () => {
  assert.equal(narrationClips(1400), 21);
  // Stored to the millisecond per clip, so the total is the sum to within a millisecond a clip.
  assert.ok(Math.abs(narrationMs(1400) - 133258) <= 21, String(narrationMs(1400)));
  assert.ok(Math.abs(narrationMs(1500) - 48154) <= 8, String(narrationMs(1500)));
  assert.equal(narrationMs(1447), 33892);
});

test('Ria’s dream after n pieces is 1294 + n, and the eighth is the cut briefing', () => {
  assert.equal(riaDreamFor(0).key, 1294);
  assert.equal(riaDreamFor(1).key, 1295);
  assert.equal(riaDreamFor(7).key, 1301);
  assert.equal(riaDreamFor(8).key, 1302);
  assert.equal(riaDreamFor(8).cut, true);
  assert.equal(riaDreamFor(7).cut, false);
});

test('Tharn’s answer to the nth piece is 1392 + n - 1', () => {
  assert.equal(tharnAmbushFor(0), null);
  assert.equal(tharnAmbushFor(1), 1392);
  assert.equal(tharnAmbushFor(8), 1399);
  assert.equal(tharnAmbushFor(9), null);
});

test('the first Staff dream waits for level 2, and for the escape', () => {
  const quest = { step: 1, pieces: 0, dreamsSeen: [] };
  assert.equal(dueDream(quest, { level: 1 }), null, 'a level-1 sleep has no Staff dream');
  assert.equal(dueDream(quest, { level: 2 }), QUEST_OPENING);
  assert.equal(dueDream(quest, { level: 10 }), QUEST_OPENING);
  // Still in the cell: Ria's cell dream is `1400`'s, and the Staff's story waits for the road.
  assert.equal(dueDream({ step: 0, pieces: 0, dreamsSeen: [] }, { level: 10 }), null);
});

test('after the opening dream, the next sleeps name the places in order — and 1302 is never shown', () => {
  const at = (pieces, dreamsSeen) => dueDream({ step: 2, pieces, dreamsSeen }, { level: 5 });
  assert.equal(at(0, [QUEST_OPENING]), 1294);
  assert.equal(at(1, [QUEST_OPENING]), 1295);
  assert.equal(at(7, [QUEST_OPENING]), 1301);
  assert.equal(at(8, [QUEST_OPENING]), null, 'the Jewel briefing is cut');
  // A dream already seen is not shown again.
  assert.equal(at(1, [QUEST_OPENING, 1295]), null);
});

test('Ria’s explanation is owed once per save, whatever else it has heard', () => {
  // `1400` is the cell's speech and the main quest's start cinematic: the explanation the
  // player must hear before a Staff piece means anything. It is a save's own ledger, not a UI
  // flag, so a skipped opening or a reload cannot swallow it.
  assert.equal(dueCellDream({ dreamsSeen: [] }), CELL_DREAM);
  assert.equal(dueCellDream({}), CELL_DREAM, 'a save with no ledger at all has not heard her');
  assert.equal(dueCellDream({ dreamsSeen: [CELL_DREAM] }), null);
  assert.equal(dueCellDream({ dreamsSeen: [QUEST_OPENING] }), CELL_DREAM, 'the Staff dream is not the explanation');
});

test('Tharn’s ambush is owed once per piece, at the next encounter', () => {
  assert.equal(dueAmbush({ pieces: 0, ambushSeen: [] }), null);
  assert.equal(dueAmbush({ pieces: 1, ambushSeen: [] }), 1392);
  assert.equal(dueAmbush({ pieces: 1, ambushSeen: [1392] }), null);
  assert.equal(dueAmbush({ pieces: 8, ambushSeen: [] }), 1399);
  assert.equal(dueAmbush({ pieces: 8, ambushSeen: [1392, 1393, 1394, 1395, 1396, 1397, 1398] }), 1399);
});

test('the text fills the player’s names and leaves no placeholder behind', () => {
  const text = storyText(1294, { name: 'Testament Vale', firstName: 'Testament' });
  assert.ok(text.includes('Testament Vale'), 'the whole name fills %pcn');
  assert.ok(!/%pcf|%pcn/i.test(text), 'no placeholder survives');
  const cell = storyText(CELL_DREAM, { name: 'Ulf', firstName: 'Ulf' });
  assert.match(cell, /Do not fear for it is I, Ria Silmane\. Ulf, listen to me/);
  assert.equal(storyText(999999), null, 'an unknown key invents nothing');
});

test('the beats list every key once, in the walkthrough’s order', () => {
  assert.equal(STORY_BEATS.length, storyKeys().length);
  const keys = STORY_BEATS.map((beat) => beat.key);
  assert.equal(new Set(keys).size, keys.length, 'no key is listed twice');
  assert.deepEqual([...keys].sort((a, b) => a - b), storyKeys(), 'every key is a beat');
  // Ria's piece dreams ascend, then Tharn's answers, then the palace and the ending.
  const rias = keys.filter((k) => k >= 1294 && k <= 1301);
  assert.deepEqual(rias, [1294, 1295, 1296, 1297, 1298, 1299, 1300, 1301]);
  const tharns = keys.filter((k) => k >= 1392 && k <= 1399);
  assert.deepEqual(tharns, [1392, 1393, 1394, 1395, 1396, 1397, 1398, 1399]);
  assert.ok(keys.indexOf(PALACE_TAUNT) > keys.indexOf(1399));
  assert.ok(keys.indexOf(JEWEL_CRY) > keys.indexOf(PALACE_TAUNT));
  assert.ok(keys.indexOf(EMPEROR_THANKS) > keys.indexOf(JEWEL_CRY));
  assert.ok(keys.indexOf(ETERNAL_CHAMPION) > keys.indexOf(EMPEROR_THANKS));
});

test('every beat names the right speaker and movie', () => {
  for (const beat of STORY_BEATS) {
    assert.equal(beat.speaker, storySpeaker(beat.key), `#${beat.key} speaker`);
    assert.equal(beat.movie, storyMovie(beat.key), `#${beat.key} movie`);
  }
  // The Emperor's lines are the ending's scene, not a dream face.
  assert.equal(storyMovie(EMPEROR_THANKS), null);
  assert.equal(storyMovie(ETERNAL_CHAMPION), null);
});
