// EVERY CREATURE'S OWN VOICE (2026-10-22), held to the install.
//
// The owner: *"enemies all need to have their sounds like illustrated here
// (https://en.uesp.net/wiki/Arena:Monsters)"*. `game/combatSound.js`'s `MONSTER_VOICES` names a
// `.VOC` per monster; this file is the claim that **every name in that table is a file the
// player's own `GLOBAL.BSA` carries**, so a creature's cry is the install's recording and not a
// made-up cue that silently falls back to the synth.
//
// Run:  node --test tests/unit/monstervoice.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MONSTER_VOICES, clipsFor, monsterVoice } from '../../src/game/combatSound.js';
import { MONSTERS } from '../../src/game/monsters.js';
import { parseBsa } from '../../src/arena/bsaArchive.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const archive = (() => {
  try {
    return parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))));
  } catch { return null; }
})();

test('every creature in the bestiary has a voice, and it is one of the install\'s clips', (t) => {
  if (!archive) { t.skip(`no GLOBAL.BSA at ${ARENA}`); return; }
  const names = new Set(archive.names());
  for (const monster of MONSTERS) {
    const clip = monsterVoice(monster.id);
    assert.ok(clip, `${monster.name} has a voice`);
    assert.ok(names.has(clip), `${monster.name}'s ${clip} is in GLOBAL.BSA`);
  }
  // And every row of the table is a real file, including the stand-ins.
  for (const [id, clip] of Object.entries(MONSTER_VOICES)) {
    assert.ok(names.has(clip), `${id} → ${clip} exists`);
  }
});

test('a creature\'s cry is its own clip; a death is the cry and the floor', () => {
  assert.equal(monsterVoice('rat'), 'RATS.VOC');
  assert.equal(monsterVoice('minotaur'), 'MINOTAUR.VOC');
  assert.equal(monsterVoice('jagartharn'), 'LICH.VOC');
  assert.deepEqual(clipsFor('monsterVoice', { monster: 'wolf', event: 'attack' }), ['WOLF.VOC']);
  assert.deepEqual(clipsFor('monsterVoice', { monster: 'wolf', event: 'death' }), ['WOLF.VOC', 'BODYFALL.VOC']);
  // A creature the table does not name gets the generic monster's growl, never silence.
  assert.equal(monsterVoice('a-thing-with-no-name'), 'MONSTER.VOC');
  assert.deepEqual(clipsFor('monsterVoice', { monster: null }), []);
});

test('a human foe is a person\'s voice, not a creature\'s', () => {
  assert.equal(monsterVoice('human'), 'UMPH.VOC');
  assert.deepEqual(clipsFor('monsterDeath', { female: true }), ['FDIE.VOC', 'BODYFALL.VOC']);
  assert.deepEqual(clipsFor('monsterDeath', {}), ['MDIE.VOC', 'BODYFALL.VOC']);
});
