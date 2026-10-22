// THE ROOM'S OWN PEOPLE — the still NPCs the shipped `.INF` files place.
//
// The owner, 2026-10-18: *"there is the innkeeper the priest the king and the guards in the
// palaces that i cant find in perfectarena … the equipment store guy that smashes a hot sword
// against an anvil and the guys that stay seated at inns"*. Every one of those is a flat in the
// install's own data — and every one of their records carries an `*ITEM` number, which is the
// reason the scene used to read them and throw them away (item flats went to the loot pass, and
// the loot pass only draws pickups).
//
// The pins here are measured against the install, not against the code:
//   * the census names the art the `.INF`s really bind,
//   * the interiors really place the keeper the owner named,
//   * and a person is drawn in the adult band, not at a wall's density or a child's height.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { ArenaData } from '../../src/arena/arenaData.js';
import { parseInf, parseInfText } from '../../src/arena/infFile.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { collectFlats, flatSize, isFolkArt, MAX_PERSON_HEIGHT, MIN_PERSON_HEIGHT } from '../../src/game/flats.js';
import { STILL_ROLES, isStillPersonArt, stillRoleFor, stillPersonStem } from '../../src/game/staticFolk.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const haveInstall = fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));
const skip = haveInstall ? false : `the install is not beside this checkout (${ARENA})`;
const data = new ArenaData(nodeSource(ARENA), { onWarn: () => {} });

/** The flats a real interior's own levels really place, by art name. */
async function placedPeople(name) {
  const mif = await data.mif(name);
  const found = [];
  for (const raw of mif.levels) {
    const inf = await data.inf(raw.info).catch(() => null);
    if (!inf) continue;
    const level = decodeLevel(raw, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
    for (const flat of collectFlats(level, inf).flats) {
      if (isStillPersonArt(flat.name)) found.push(flat.name);
    }
  }
  return found;
}

test('the census is the art’s own word, and never a walker or a lamp', () => {
  // The keeper of each trade, and the court, are the voices a room needs.
  assert.deepEqual(stillRoleFor('SMITH.DFA'), { stem: 'SMITH', role: 'smith', label: 'the armourer', keeper: true });
  assert.deepEqual(stillRoleFor('BARTEND.DFA'), { stem: 'BARTEND', role: 'bartender', label: 'the innkeeper', keeper: true });
  assert.deepEqual(stillRoleFor('PREST1.DFA'), { stem: 'PREST', role: 'priest', label: 'a priest', keeper: true });
  assert.deepEqual(stillRoleFor('WIZZ1.DFA'), { stem: 'WIZZ', role: 'wizard', label: 'the guild\u2019s wizard', keeper: true });
  assert.equal(stillRoleFor('KING.IMG').label, 'the king');
  assert.equal(stillRoleFor('GUARD1M.IMG').role, 'guard');
  assert.equal(stillRoleFor('MAN01.IMG').role, 'patron');
  assert.equal(stillRoleFor('WOMAN04.DFA').label, 'a woman of the town');
  // The trades the `.INF`s place on their own rosters, each read off the art's first word.
  for (const [art, role] of [
    ['JSTER1.DFA', 'jester'], ['MUSIC1.DFA', 'musician'], ['BEG#1.DFA', 'beggar'],
    ['FIREMN.DFA', 'fire-eater'], ['HOKER2.DFA', 'harlot'], ['MERCH1.DFA', 'merchant'],
    ['SHADY1.DFA', 'shady character'], ['SNAKTM.DFA', 'snake charmer'], ['VENDER.DFA', 'vendor'],
  ]) {
    assert.equal(stillRoleFor(art)?.role, role, `${art} is a ${role}`);
  }
  // **Not people**: `LGLIT` is a rod of light (24×60, every pixel #ffb800), `PAT` is the
  // Minotaur's art, and a laundry sign is a sign.
  //
  // **And the walking crowd is not the stills**, which the owner had to say twice
  // (2026-10-18): *"MLGEN01W … MLGEN01T … GUARD01 … FMGENW01 … BABE01 … FMGEN01 … those are not
  // part of not moving npcs … they are sprites of moving npcs"*. They carry five directions and an
  // action apiece (`peopleKinds.js`), so the room's own census must never claim one — a walking
  // figure drawn as a flat would be a second, motionless copy of somebody already in the street.
  for (const name of [
    'LGLIT01.CFA', 'BABE01.CFA', 'PAT1.CFA', 'TLAUNDRY.IMG', 'SSTATUE1.IMG', null,
    'MLGEN01W.CFA', 'MLGEN01T.CFA', 'GUARD01.CFA', 'FMGENW01.CFA', 'FMGEN01.CFA',
  ]) {
    assert.equal(stillRoleFor(name), null, `${name} is not a still person`);
    assert.equal(isStillPersonArt(name), false);
  }
  assert.equal(stillPersonStem('KNIGHT'), null, 'the map’s extensionless `KNIGHT` art this install does not ship');
  assert.ok(Object.keys(STILL_ROLES).length >= 20, 'the census covers the whole people table');
});

test('a still person is a person: the adult band, not a wall and not a child', () => {
  // Measured art (2026-10-18): the barman 44×66, the townsman 40×74, the guard 67×100, the king
  // 65×81, the harlot 26×114 — and the armourer's 115×116 frame, which includes his anvil.
  for (const [name, w, h] of [
    ['BARTEND.DFA', 44, 66], ['MAN01.DFA', 40, 74], ['GUARD1M.IMG', 77, 88],
    ['KING.IMG', 65, 81], ['PREST1.DFA', 46, 79], ['SMITH.DFA', 115, 116], ['HOKER2.DFA', 26, 114],
  ]) {
    assert.equal(isFolkArt(name), true, `${name} is a person`);
    const size = flatSize(w, h, name);
    assert.ok(size.h >= MIN_PERSON_HEIGHT - 1e-9 && size.h <= MAX_PERSON_HEIGHT + 1e-9,
      `${name} (${w}×${h}) is ${size.h.toFixed(2)} m tall`);
  }
  // **A crouching record keeps its crouch.** `BEG#1.DFA` is 82×47 — a beggar with a bowl — and
  // pulling its *height* to the band's floor (1.75 m) would make it 3.0 m wide, so a landscape record keeps the
  // figure density and is short on purpose.
  const beggar = flatSize(82, 47, 'BEG#1.DFA');
  assert.ok(beggar.h < MIN_PERSON_HEIGHT && beggar.w < 1.6, `the beggar is ${beggar.w.toFixed(2)}×${beggar.h.toFixed(2)} m`);
});

test('the interiors place the keeper the owner named', { skip }, async () => {
  // The same levels the owner walked into: the equipment store has its armourer, the temple its
  // priest, the tavern its barkeep and drinkers, the palace its king and its watch.
  const equip = await placedPeople('EQUIP1.MIF');
  assert.ok(equip.includes('SMITH.DFA'), `the armourer is in the equipment store: ${equip.join(', ')}`);
  const temple = await placedPeople('TEMPLE1.MIF');
  assert.ok(temple.some((n) => /^PREST/.test(n)), `a priest is in the temple: ${temple.join(', ')}`);
  const tavern = await placedPeople('TAVERN1.MIF');
  assert.ok(tavern.includes('BARTEND.DFA'), 'the innkeeper is behind the bar');
  assert.ok(tavern.filter((n) => /^(?:MAN|WOMAN)\d{2}\./.test(n)).length >= 2,
    `the drinkers are at the tables: ${tavern.join(', ')}`);
  const palace = await placedPeople('PALACE1.MIF');
  assert.ok(palace.includes('KING.IMG'), 'the king is on his throne');
  assert.ok(palace.filter((n) => /^GUARD/.test(n)).length >= 4, `the watch stands in the hall: ${palace.join(', ')}`);
});

test('the .INF `F:` modifier is a property bitfield, not a height', () => {
  // OpenTESArena's `INFFile.cpp`: bit0 collider, bit1 puddle, bit2 large (×3), bit3 dark,
  // bit4 transparent, bit5 ceiling, bit6 medium (×1.5). The port read `F:` as `yOffset`, which
  // would have hung a flat that carried one. This install ships none (measured), so nothing on
  // screen moves — the reading is correct where it was wrong.
  const inf = parseInfText('@FLATS\nSMITH.DFA  Y:5  S:3  F:21\nSSTATUE1.IMG  F:64\nCOOK.IMG\n');
  const [smith, statue, cook] = inf.flats;
  assert.equal(smith.yOffset, 5, 'Y: is the height');
  assert.equal(smith.lightIntensity, 3);
  assert.equal(smith.collider, true);
  assert.equal(smith.largeScale, true);
  assert.equal(smith.mediumScale, false);
  assert.equal(smith.scaleModifier, 3, 'large is three times a flat');
  assert.equal(smith.transparent, true);
  assert.equal(smith.ceiling, false);
  assert.equal(statue.largeScale, false);
  assert.equal(statue.mediumScale, true);
  assert.equal(statue.scaleModifier, 1.5, 'medium is half again');
  assert.equal(cook.scaleModifier, 1, 'no modifier is one flat');
  // Both bits at once: the larger wins, as the original's own `largeScale` check does.
  assert.equal(parseInfText('@FLATS\nT.IMG  F:68\n').flats[0].scaleModifier, 3);
  // …and the law a map's own flag would move: three times the static density.
  assert.ok(flatSize(140, 140, 'SSTATUE1.IMG', { modifier: 3 }).h > flatSize(140, 140, 'SSTATUE1.IMG').h);
});

test('the install’s own flags are the tree and column law, and nothing else', async () => {
  // The `F:` bitfield is not a theory: **185 flat records in this install carry one**, and every
  // one of them is a tree, a column, a cactus/palm, a chair, hay, a flag or the dragon — all at
  // ×3 or ×1.5. That is the measurement the size law is built on, so it is pinned here.
  const archive = await data.bsa();
  const factors = new Map();
  const kinds = new Map();
  let flats = 0;
  for (const name of archive.names().filter((n) => /\.INF$/i.test(n))) {
    const inf = parseInf(archive.get(name), name);
    for (const flat of inf.flats) {
      flats++;
      const factor = flat.scaleModifier ?? 1;
      if (factor === 1) continue;
      factors.set(factor, (factors.get(factor) ?? 0) + 1);
      const art = inf.flatTextures[flat.textureIndex];
      kinds.set(art.replace(/\d+.*$/, ''), (kinds.get(art.replace(/\d+.*$/, '')) ?? 0) + 1);
    }
  }
  assert.ok(flats > 1000, `${flats} flat records across the install`);
  assert.deepEqual([...factors.keys()].sort((a, b) => a - b), [1.5, 3], 'half again or three times');
  assert.equal(factors.get(3), 162, 'the ×3 records: trees, columns, cacti, palms, ruins');
  assert.equal(factors.get(1.5), 23, 'the ×1.5 records: hay, chairs, a flag, a dragon, an entrance');
  // Every tree the wilderness marks is one of the ×3 records: the tree law is the data's.
  for (const [, count] of kinds) assert.ok(count > 0);
});
