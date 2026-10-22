// COMBAT: THE SPRITE FORMAT, THE BESTIARY, AND THE MODEL.
//
// Three things are held to the real data here, because all three are easy to get subtly
// wrong and impossible to notice by eye:
//
//   * **`.CFA`** — the width and height in the header are checked against the *decoded*
//     pixel count of every frame of every creature file in the install. A header read as
//     (height, width) or a table read at the wrong offset fails immediately.
//   * **the bestiary** — every monster's sprite base name is checked against the archive's
//     own file listing, so a plausible-looking name that Arena does not use (`MINOTAUR.CFA`,
//     `DAEMON1.CFA`) is a failing test rather than a monster that never appears.
//   * **the model** — the rules UESP states are checked as rules (five points of Agility is
//     one armour class, iron is −1, the daikatana is 3–21), and the reconstructed parts are
//     checked for the *properties* they claim, not for magic numbers.
//
// Run:  node --test tests/unit/combat.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { parseBsa } from '../../src/arena/bsaArchive.js';
import { ArenaRandom } from '../../src/game/arenaRandom.js';
import { CFA_HEADER_SIZE, CFA_LOOKUP_TABLE_OFFSET, cfaInfo, cfaName, countRlePixels, parseCfa } from '../../src/arena/cfa.js';
import { MONSTERS, monsterById, monsterReport, rosterFor, spriteFile, spriteFiles, xpFor } from '../../src/game/monsters.js';
import {
  MATERIALS, WEAPONS, armourClass, attackInterval, hitChance, materialById, monsterAttack,
  monsterXp, resolveAttack, rollMonster, strengthBonus, weaponById,
} from '../../src/game/combat.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
let bsaCache = null;
const bsa = async () => {
  if (!bsaCache) bsaCache = parseBsa(await nodeSource(ARENA).getBytes('GLOBAL.BSA'));
  return bsaCache;
};

// ── the .CFA format, against the real files ────────────────────────────────────

test('a creature file\'s header size matches every frame it holds', async () => {
  const archive = await bsa();
  // One file per creature family, including the awkward shapes: the widest, the
  // narrowest, a wolf whose name is zero-padded, and Tharn's 99×122.
  const names = ['RAT1.CFA', 'RAT2.CFA', 'RAT5.CFA', 'GOBLIN1.CFA', 'WOLF01.CFA', 'SWOLF01.CFA',
    'SKELE1.CFA', 'GHOST1.CFA', 'TROLL1.CFA', 'LICH1.CFA', 'VAMPIRE1.CFA', 'THARN01.CFA'];
  for (const name of names) {
    const cfa = parseCfa(archive.get(name), name);
    assert.ok(cfa.width > 8 && cfa.height > 8, `${name} ${cfa.width}×${cfa.height}`);
    assert.equal(cfa.frames.length, cfa.frameCount, `${name}: frames decoded`);
    for (const frame of cfa.frames) {
      assert.equal(frame.indices.length, cfa.width * cfa.height, `${name} frame ${frame.index}: pixels`);
      assert.equal(frame.width, cfa.width);
      assert.equal(frame.height, cfa.height);
    }
    // **There are two widths**, and this is the relation that settles which is which: a
    // row of `widthCompressed` bytes holds at most `⌈widthCompressed × 8 / bpp⌉` packed
    // values, and the encoder pads the last one, so the pixel width is never larger and
    // — below 8 bits per pixel — never smaller than the byte count.
    const packed = Math.ceil(cfa.widthCompressed * 8 / cfa.bitsPerPixel);
    assert.ok(cfa.width <= packed, `${name}: ${cfa.width} pixels do not fit ${cfa.widthCompressed} bytes at ${cfa.bitsPerPixel} bpp`);
    if (cfa.bitsPerPixel < 8) assert.ok(cfa.width > cfa.widthCompressed, `${name}: packing must gain pixels`);
    // The colour lookup table ends exactly where the first frame begins. Eight-bit files
    // have no table at all: their values are already palette indices, so their first
    // frame sits at the end of the header (0x4c = 76).
    assert.equal(cfa.offsets[0], CFA_LOOKUP_TABLE_OFFSET + cfa.lookUpTable.length, `${name}: table length`);
    if (cfa.bitsPerPixel === 8) assert.equal(cfa.lookUpTable.length, 0, `${name}: no table at 8 bpp`);
    else assert.ok(cfa.lookUpTable.length > 0, `${name}: a table for packed codes`);
    // The frames are drawn, not empty: a creature sprite that is all transparent would
    // pass every structural check above.
    const drawn = cfa.frames[0].indices.filter((v) => v !== 0).length;
    assert.ok(drawn > 40, `${name} frame 0 has only ${drawn} opaque pixels`);
    assert.deepEqual(cfa.warnings, [], `${name}: ${cfa.warnings.join(' | ')}`);
  }
});

test('RAT1 is 32 wide and 40 tall, packed into 20 bytes a row at 5 bits', async () => {
  const archive = await bsa();
  const cfa = parseCfa(archive.get('RAT1.CFA'), 'RAT1.CFA');
  // 20 bytes × 8 bits ÷ 5 bits = 32 pixels exactly: the packed width is not the pixel
  // width, and reading 0x04 as the width made every creature three fifths as wide as it
  // should be (PROGRESS, "a creature file's header size").
  assert.equal(cfa.width, 32);
  assert.equal(cfa.widthCompressed, 20);
  assert.equal(cfa.bitsPerPixel, 5);
  assert.equal(cfa.height, 40);
  assert.equal(cfa.frameCount, 12, 'a full animation set');
  assert.equal(cfa.frames.length, 12);
  assert.equal(cfa.offsets.length, 12);
  for (const frame of cfa.frames) assert.equal(frame.indices.length, 32 * 40);
});

test('the header is (width, height), and a walking figure is what proves it', async () => {
  // The pixel count cannot distinguish the two orders, so the evidence has to be a
  // sprite whose shape is unmistakable: a person in plate armour, walking.
  const archive = await bsa();
  const plate = parseCfa(archive.get('01PLTWLK.CFA'), '01PLTWLK.CFA');
  const barbarian = parseCfa(archive.get('01BARWLK.CFA'), '01BARWLK.CFA');
  for (const [name, walker] of [['plate', plate], ['barbarian', barbarian]]) {
    assert.ok(walker.height > walker.width, `${name}: a walking figure is taller than wide (${walker.width}×${walker.height})`);
    assert.equal(walker.height, 102, `${name} is 102 tall`);
  }
  assert.equal(plate.width, 52, 'a knight in plate is broader than a barbarian');
  assert.equal(barbarian.width, 43);
  // And the creatures read the same way: tall wolves, a stocky goblin, a long rat.
  const wolf = parseCfa(archive.get('WOLF01.CFA'), 'WOLF01.CFA');
  assert.equal(wolf.width, 61);
  assert.equal(wolf.height, 92);
  const goblin = parseCfa(archive.get('GOBLIN1.CFA'), 'GOBLIN1.CFA');
  assert.equal(goblin.width, 96);
  assert.equal(goblin.height, 95);
  const rat = parseCfa(archive.get('RAT1.CFA'), 'RAT1.CFA');
  assert.equal(rat.width, 32);
  assert.equal(rat.height, 40);
});

test('RAT6 declares three frames and its fourth table entry points backwards', async () => {
  // The file that proved the frame count is a *byte* and not the table's length: the
  // 12-entry table holds real offsets only for the frames the count names.
  const archive = await bsa();
  const bytes = archive.get('RAT6.CFA');
  const cfa = parseCfa(bytes, 'RAT6.CFA');
  assert.equal(bytes[11], 3, 'the count byte');
  assert.equal(cfa.frameCount, 3);
  assert.equal(cfa.frames.length, 3, 'the counted frames all decode');
  const u16 = (o) => bytes[o] | (bytes[o + 1] << 8);
  assert.ok(u16(CFA_HEADER_SIZE + 6) < u16(CFA_HEADER_SIZE + 4), 'entry 3 really does go backwards');
  assert.equal(cfa.width, 77, 'RAT6 is 77 pixels wide from 49 packed bytes at 5 bpp');
  assert.equal(cfa.widthCompressed, 49);
  assert.equal(cfa.height, 53);
  assert.equal(cfa.width * cfa.height, 77 * 53);
});

test('every creature file in the install parses, and its frames fill its own header', async () => {
  const archive = await bsa();
  const creatureFiles = archive.names().filter((n) => n.endsWith('.CFA') && /^[A-Z]+0?\d\.CFA$/.test(n));
  assert.ok(creatureFiles.length > 150, `expected the creature sets, found ${creatureFiles.length}`);
  let checked = 0;
  const broken = [];
  for (const name of creatureFiles) {
    const bytes = archive.get(name);
    let cfa;
    try {
      cfa = parseCfa(bytes, name);
    } catch (err) {
      broken.push(`${name}: ${err.message}`);
      continue;
    }
    const info = cfaInfo(bytes, name);
    if (info.width !== cfa.width || info.height !== cfa.height) broken.push(`${name}: cfaInfo disagrees`);
    for (const frame of cfa.frames) {
      if (frame.indices.length !== cfa.width * cfa.height) broken.push(`${name}: frame ${frame.index} is the wrong size`);
    }
    checked++;
  }
  assert.deepEqual(broken, [], `${broken.length} files did not parse: ${broken.slice(0, 4).join(' | ')}`);
  assert.ok(checked > 150, `checked ${checked}`);
});

test('countRlePixels agrees with the decoded frames', async () => {
  const archive = await bsa();
  // A frame's RLE stream expands to the *packed* row bytes — `widthCompressed × height`
  // — and only then is each row demuxed into pixels. That count is what the parser uses
  // to reject a truncated frame, so it has to be the packed size and not the pixel size.
  for (const name of ['GOBLIN1.CFA', 'RAT1.CFA']) {
    const bytes = archive.get(name);
    const cfa = parseCfa(bytes, name);
    const start = cfa.offsets[0];
    const end = cfa.offsets[1];
    assert.equal(countRlePixels(bytes.subarray(start, end)), cfa.widthCompressed * cfa.height, name);
  }
  // At eight bits per pixel the two sizes are the same, which is why that format needs no
  // lookup table and no demux: GHOST1's 100×99 frame is 9 900 bytes of plain indices.
  const ghostBytes = archive.get('GHOST1.CFA');
  const ghost = parseCfa(ghostBytes, 'GHOST1.CFA');
  assert.equal(ghost.bitsPerPixel, 8);
  assert.equal(countRlePixels(ghostBytes.subarray(ghost.offsets[0], ghost.offsets[1])), ghost.width * ghost.height);
});

test('a truncated file warns rather than throwing, and a nonsense one throws', async () => {
  const archive = await bsa();
  const bytes = archive.get('RAT1.CFA');
  const cut = parseCfa(bytes.subarray(0, 700), 'cut.CFA');
  assert.ok(cut.frames.length >= 1, 'the frames that fit are still usable');
  assert.ok(cut.warnings.some((w) => /holds \d+ of \d+ pixels|too little data|unusable range/.test(w)), cut.warnings.join(' | '));
  assert.throws(() => parseCfa(new Uint8Array(8), 'tiny.CFA'), /too short/);
  assert.throws(() => parseCfa(new Uint8Array(200), 'zero.CFA'), /implausible/);
  // A file whose pixel count is plausible but whose frames are all truncated is refused
  // rather than drawn as an empty sprite.
  const head = bytes.subarray(0, CFA_LOOKUP_TABLE_OFFSET + 33);
  assert.throws(() => parseCfa(head, 'noFrames.CFA'), /no usable frame/);
});

test('cfaName spells the archive\'s own names', () => {
  assert.equal(cfaName('RAT', 1), 'RAT1.CFA');
  assert.equal(cfaName('WOLF0', 3), 'WOLF03.CFA');
  assert.equal(cfaName('THARN0', 6), 'THARN06.CFA');
});

// ── the bestiary, against the archive ──────────────────────────────────────────

test('every monster with art has all six of its view files in the archive', async () => {
  const archive = await bsa();
  const names = new Set(archive.names());
  const missing = [];
  for (const monster of MONSTERS) {
    if (!monster.sprite) continue;
    for (const file of spriteFiles(monster)) if (!names.has(file)) missing.push(file);
  }
  assert.deepEqual(missing, [], `these sprite files are not in GLOBAL.BSA: ${missing.join(', ')}`);
  const report = monsterReport();
  // **Empty since block B24's second pass.** The Minotaur was this list's one entry on the
  // strength of a `MINO*.CFA` search; the executable's own tables name its art `pat@.cfa`
  // (`game/monsterArt.js`), so every one of the twenty-four is drawn now.
  assert.deepEqual(report.spriteless, [], 'every monster has an animation set');
  assert.equal(report.drawn.length, MONSTERS.length);
});

test('the two names Arena spells its own way are the ones used', async () => {
  const archive = await bsa();
  const names = new Set(archive.names());
  assert.ok(names.has('DEAMON1.CFA'), 'the Fire Daemon is DEAMON');
  assert.ok(!names.has('DAEMON1.CFA'), 'and not DAEMON');
  assert.equal(spriteFile(monsterById('Fire Daemon'), 1), 'DEAMON1.CFA');
  assert.equal(spriteFile(monsterById('firedaemon'), 3), 'DEAMON3.CFA');
  // The third name the game spells its own way, and the one this project missed for as long as
  // the table has existed: the Minotaur is drawn from `PAT1.CFA`…`PAT6.CFA`.
  assert.equal(spriteFile(monsterById('Minotaur')), 'PAT1.CFA');
  assert.deepEqual(spriteFiles(monsterById('minotaur')),
    ['PAT1.CFA', 'PAT2.CFA', 'PAT3.CFA', 'PAT4.CFA', 'PAT5.CFA', 'PAT6.CFA']);
  assert.deepEqual(spriteFiles(monsterById('jagartharn')), ['THARN01.CFA', 'THARN02.CFA', 'THARN03.CFA', 'THARN04.CFA', 'THARN05.CFA', 'THARN06.CFA']);
});

test('the bestiary is UESP\'s, complete and self-consistent', () => {
  assert.equal(MONSTERS.length, 24, 'UESP lists 24 monsters');
  assert.equal(new Set(MONSTERS.map((m) => m.id)).size, 24);
  for (const monster of MONSTERS) {
    assert.ok(monster.hp[0] <= monster.hp[1], `${monster.name}: hit points`);
    assert.ok(monster.damage[0] <= monster.damage[1], `${monster.name}: damage`);
    assert.ok(monster.level >= 1, `${monster.name}: level`);
  }
  // The named monsters a player will meet, at UESP's figures.
  const rat = monsterById('rat');
  assert.deepEqual(rat.hp, [1, 6]);
  assert.deepEqual(rat.damage, [1, 4]);
  assert.equal(xpFor(rat, 1), 40, 'UESP: 1×5 + 35');
  assert.equal(xpFor(rat, 6), 65, 'UESP: 6×5 + 35');
  const lich = monsterById('Lich');
  assert.deepEqual(lich.hp, [750, 750]);
  assert.equal(xpFor(lich, 750), 125000, 'UESP: 750×100 + 50,000');
  const tharn = monsterById('Jagar Tharn');
  assert.equal(tharn.xpBase, 75000, 'UESP: 500×0 + 75,000');
});

test('a roster is drawn from the danger of the place', () => {
  const shallow = rosterFor(1);
  assert.ok(shallow.every((m) => m.level <= 5), JSON.stringify(shallow.map((m) => m.name)));
  assert.ok(shallow.some((m) => m.id === 'rat'), 'rats in a level-1 dungeon');
  const deep = rosterFor(30);
  assert.ok(deep.some((m) => m.id === 'lich'), 'a lich in a level-30 dungeon');
  assert.ok(!deep.some((m) => m.id === 'jagartharn'), 'Tharn is not a random encounter');
  assert.ok(!deep.some((m) => !m.sprite), 'a rulerless monster is never put in front of the player');
});

// ── the combat model ──────────────────────────────────────────────────────────

test('the weapon table is the published one, with its ranges intact', () => {
  assert.equal(weaponById('fists').max, 2);
  assert.equal(weaponById('dagger').min, 1);
  assert.equal(weaponById('dagger').max, 6);
  assert.equal(weaponById('broadsword').max, 12, 'UESP: 1–12, not this port\'s earlier 1–10');
  assert.equal(weaponById('mace').max, 12);
  assert.equal(weaponById('longsword').min, 2);
  assert.equal(weaponById('claymore').max, 18);
  assert.equal(weaponById('warhammer').min, 3);
  assert.equal(weaponById('dai-katana').max, 21);
  assert.equal(weaponById('long-bow').min, 2, 'UESP: the long bow is 2–12');
  // UESP's 18 base families plus the **four** bodily attacks its table also lists — the punch
  // and the leather, chain and plate gauntlets — which are rows here because the fight can
  // swing them. The leather row was missing until the equipment audit against `Arena:Base
  // Weapons` (2026-10-17): 2–3, exactly as the source prints it.
  assert.equal(WEAPONS.length, 22, '18 bases and four gauntlet/fist rows');
  assert.deepEqual([weaponById('leather-gauntlets').min, weaponById('leather-gauntlets').max], [2, 3]);
  assert.equal(weaponById('not a weapon').id, 'fists', 'an unknown weapon is a fist, not a crash');
  for (const weapon of WEAPONS) assert.ok(weapon.min <= weapon.max, weapon.name);
});

test('the materials are the published ones, iron to ebony — with damage\'s two ends kept apart', () => {
  // UESP's material table, read on 2026-10-17: iron is **0 on the low end and −2 on the high
  // end**, steel and silver are 0, and elven…ebony add +1…+5 to both ends. The earlier test
  // asserted `hit === damage` and iron −1/−1, which is the reading this pass corrected.
  assert.deepEqual(materialById('iron'), { id: 'iron', name: 'Iron', hit: -1, min: 0, max: -2, damage: -2 });
  assert.equal(materialById('steel').hit, 0);
  assert.equal(materialById('silver').max, 0, 'silver is not a damage tier; its law is the vampire');
  assert.equal(materialById('silver').vsVampire, 2, 'and that law is double damage');
  assert.equal(materialById('elven').hit, 1);
  assert.equal(materialById('dwarven').damage, 2);
  assert.equal(materialById('mithril').hit, 3);
  assert.equal(materialById('adamantium').damage, 4);
  assert.equal(materialById('ebony').hit, 5);
  assert.equal(MATERIALS.length, 8);
  assert.deepEqual(MATERIALS.map((m) => m.id), ['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony']);
  for (const material of MATERIALS.filter((m) => !['iron', 'steel', 'silver'].includes(m.id))) {
    assert.equal(material.hit, material.min, `${material.name}: the hit modifier and the low end are the same`);
    assert.equal(material.min, material.max, `${material.name}: both ends rise together`);
  }
  assert.notEqual(materialById('iron').min, materialById('iron').max, 'iron lowers the ceiling, not the floor');
});

test('five points of Agility is one point of armour class, as UESP states', () => {
  assert.equal(armourClass(0), 0);
  assert.equal(armourClass(4), 0);
  assert.equal(armourClass(5), 1);
  assert.equal(armourClass(9), 1);
  assert.equal(armourClass(10), 2);
  assert.equal(armourClass(50), 10);
  assert.equal(armourClass(-5), 0, 'no negative armour class from a non-number');
  assert.equal(armourClass(undefined), 0);
});

test('Strength modifies damage by UESP\'s shape, capped at ten', () => {
  assert.equal(strengthBonus(50), 0, 'average strength, no modifier');
  assert.equal(strengthBonus(55), 1);
  assert.equal(strengthBonus(100), 10);
  assert.equal(strengthBonus(200), 10, 'capped');
  assert.equal(strengthBonus(45), -1, 'below average is a penalty');
  assert.equal(strengthBonus(1), -10, 'floor((1−50)/5) rounds down, past −9');
  assert.equal(strengthBonus(0), -10, 'and the penalty is capped here too');
});

test('the hit chance is level-based, bounded, and improved by a better material', () => {
  const attacker = { level: 5, attributes: { luck: 50 } };
  const green = { level: 1, attributes: { agility: 40 } };
  const veteran = { level: 20, attributes: { agility: 90 } };
  // Compared at levels where nothing clamps, so the swing is arithmetic and not the cap:
  // a level-20 attacker against a level-15 and a level-20 defender.
  const near = hitChance({ level: 20, attributes: { luck: 50 } }, { level: 15, attributes: { agility: 40 } });
  const peer = hitChance({ level: 20, attributes: { luck: 50 } }, { level: 20, attributes: { agility: 40 } });
  assert.equal(near - peer, 4 * (20 - 15), 'five levels of difference, four points each');
  assert.equal(near - hitChance({ level: 20, attributes: { luck: 50 } }, { level: 15, attributes: { agility: 90 } }), 10, 'and Agility: 40/5 = 8, 90/5 = 18');
  const vsGreen = hitChance(attacker, green);
  const vsVeteran = hitChance(attacker, veteran);
  assert.ok(vsGreen > vsVeteran, `a veteran is harder to hit: ${vsGreen} vs ${vsVeteran}`);
  assert.ok(vsVeteran <= 5, 'a level-5 character against a level-20 one is at the floor');
  assert.equal(hitChance(attacker, green, { hit: 5 }) - vsGreen, 5, 'the material\'s to-hit modifier');
  for (const luck of [0, 25, 50, 75, 100]) {
    const chance = hitChance({ level: 1, attributes: { luck } }, { level: 1, attributes: { agility: 0 } });
    assert.ok(chance >= 5 && chance <= 95, `luck ${luck} gives ${chance}`);
  }
  assert.equal(hitChance({ level: 40 }, { level: 1 }), 95, 'never a certainty');
  assert.equal(hitChance({ level: 1 }, { level: 40, attributes: { agility: 200 } }), 5, 'never impossible');
});

test('a blow lands or misses on one roll, and never does zero damage when it lands', () => {
  const attacker = { level: 5, attributes: { strength: 60, luck: 50 } };
  const defender = { level: 3, attributes: { agility: 30 } };
  const random = new ArenaRandom(99);
  let hits = 0;
  for (let i = 0; i < 400; i++) {
    const blow = resolveAttack({ attacker, defender, weapon: 'longsword', material: 'steel', random });
    assert.ok(blow.roll >= 1 && blow.roll <= 100);
    assert.equal(blow.hit, blow.roll <= blow.chance);
    if (blow.hit) {
      hits++;
      assert.ok(blow.damage >= 1, 'a hit that does nothing is a miss');
      assert.ok(blow.damage <= (21 + 2 + 21) * 2, `damage ${blow.damage} is inside what the tables allow`);
    } else {
      assert.equal(blow.damage, 0, 'a miss does no damage at all');
    }
  }
  assert.ok(hits > 100 && hits < 380, `${hits}/400 landed — the chance is neither 0 nor 1`);
});

test('a guaranteed riposte calculates real damage even when its ordinary hit roll misses', () => {
  const opts = { attacker: { level: 1, critical: 10 }, defender: { level: 40, agility: 200 },
    weapon: 'longsword', material: 'steel' };
  let misses = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const ordinary = resolveAttack({ ...opts, random: new ArenaRandom(seed) });
    const riposte = resolveAttack({ ...opts, guaranteedHit: true, random: new ArenaRandom(seed) });
    assert.equal(riposte.hit, true);
    assert.ok(riposte.damage >= 1);
    assert.equal(riposte.damage, Math.max(1, riposte.raw) * (riposte.critical ? 2 : 1));
    if (!ordinary.hit) { misses++; assert.equal(ordinary.damage, 0); }
  }
  assert.ok(misses > 80, 'exercises the missed-roll path, not only normal hits');
});

test('weapon and material change the damage, in the direction the tables say', () => {
  const base = { level: 5, attributes: { strength: 50, luck: 50 } };
  const defender = { level: 1, attributes: { agility: 0 } };
  const roll = (weapon, material, seed = 7) => resolveAttack({
    attacker: base, defender, weapon, material, random: new ArenaRandom(seed),
  }).damage;
  // Same seed, different weapon: a dai-katana must beat fists.
  assert.ok(roll('dai-katana', 'steel') > roll('fists', 'steel'));
  // Material is worth exactly its modifier when the blow lands.
  const steel = resolveAttack({ attacker: base, defender, weapon: 'longsword', material: 'steel', random: new ArenaRandom(3) });
  const ebony = resolveAttack({ attacker: base, defender, weapon: 'longsword', material: 'ebony', random: new ArenaRandom(3) });
  if (steel.hit && ebony.hit) assert.equal(ebony.damage - steel.damage, 5, 'ebony is +5');
  // **The range a metal actually rolls**, read from 400 guaranteed hits: steel is the base
  // 2–16, iron keeps the floor and loses two at the ceiling, ebony raises both by five.
  // (Comparing two single blows was the earlier shape of this check and it was meaningless —
  // two different material ranges draw two different rolls from the same seed.)
  const spread = (material) => {
    let min = Infinity, max = -Infinity;
    for (let seed = 1; seed <= 400; seed++) {
      const blow = resolveAttack({
        attacker: base, defender, weapon: 'longsword', material, guaranteedHit: true, random: new ArenaRandom(seed),
      });
      min = Math.min(min, blow.damage);
      max = Math.max(max, blow.damage);
    }
    return [min, max];
  };
  assert.deepEqual(spread('steel'), [2, 16], 'the base range');
  assert.deepEqual(spread('iron'), [2, 14], 'iron: 0 on the low end, −2 on the high');
  assert.deepEqual(spread('ebony'), [7, 21], 'ebony: +5 at both ends');
});

test('a critical blow doubles the damage, at the class\'s own rate', () => {
  const attacker = { level: 10, attributes: { strength: 50, luck: 50 }, critical: 10 };
  const defender = { level: 1, attributes: { agility: 0 } };
  const random = new ArenaRandom(4242);
  let criticals = 0;
  let hits = 0;
  for (let i = 0; i < 500; i++) {
    const blow = resolveAttack({ attacker, defender, weapon: 'warhammer', material: 'steel', random });
    if (!blow.hit) continue;
    hits++;
    if (blow.critical) {
      criticals++;
      assert.equal(blow.damage, Math.max(1, blow.raw) * 2, 'a critical is exactly double');
    } else {
      assert.equal(blow.damage, Math.max(1, blow.raw));
    }
  }
  // 10% per level with a level-10 character is 100%, clamped by the roll, so every blow
  // that lands is critical — which is what a level-10 Acrobat's 1%/level means at 100.
  assert.equal(criticals, hits, 'a 100% critical chance doubles everything that lands');
  const novice = resolveAttack({ attacker: { level: 1, attributes: { luck: 50 }, critical: 1 }, defender, weapon: 'dagger', random: new ArenaRandom(1) });
  assert.equal(typeof novice.critical, 'boolean');
});

test('a monster is rolled inside its UESP ranges and pays what UESP says', () => {
  const kind = monsterById('Skeleton');
  const random = new ArenaRandom(31);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const monster = rollMonster(kind, random);
    assert.ok(monster.maxHealth >= 25 && monster.maxHealth <= 45, `hit points ${monster.maxHealth}`);
    assert.equal(monster.health, monster.maxHealth);
    assert.deepEqual(monster.damage, [2, 16]);
    seen.add(monster.maxHealth);
  }
  assert.ok(seen.size > 10, 'the hit points actually vary');
  const flat = rollMonster(monsterById('Vampire'), new ArenaRandom(1));
  assert.equal(flat.maxHealth, 500, 'UESP gives the Vampire a fixed 500');
  assert.equal(monsterXp(flat), 67500, '500×75 + 30,000');
});

test('a monster\'s blow follows its own damage range and the player\'s defence', () => {
  const monster = rollMonster(monsterById('Troll'), new ArenaRandom(5));
  const target = { level: 5, attributes: { agility: 60 } };
  const random = new ArenaRandom(77);
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    const blow = monsterAttack({ monster, target, random });
    if (blow.hit) {
      hits++;
      assert.ok(blow.damage >= 10 && blow.damage <= 30, `damage ${blow.damage} inside 10–30`);
    } else {
      assert.equal(blow.damage, 0);
    }
  }
  assert.ok(hits > 20, `${hits}/300 landed`);
  // A nimble target is hit less often than a clumsy one.
  const nimble = hitChance({ level: monster.level, attributes: { luck: 50 } }, { level: 1, attributes: { agility: 100 } });
  const clumsy = hitChance({ level: monster.level, attributes: { luck: 50 } }, { level: 1, attributes: { agility: 0 } });
  assert.ok(nimble < clumsy, `${nimble} vs ${clumsy}`);
});

test('inside the circle a creature\'s blow always lands — the dodge is the evasion', () => {
  // The owner, 2026-10-19: *"enemies need to ignore the main game dodge chance and always hit you
  // if youre not outside their circle or if you didnt manually dodge"*. The scene decides the
  // three ways a blow misses (`insideAttack`, the sight test, the roll's i-frames) and then hands
  // `guaranteed` in; here the arithmetic itself is held to it.
  const monster = monsterById('Rat');
  for (let seed = 1; seed <= 200; seed++) {
    const blow = monsterAttack({ monster, target: { level: 1 }, random: new ArenaRandom(seed), guaranteed: true });
    assert.equal(blow.hit, true, `seed ${seed} lands`);
    assert.equal(blow.chance, 100, `seed ${seed} says so`);
    assert.equal(blow.guaranteed, true);
    assert.ok(blow.damage >= 1 && blow.damage <= Math.max(...monster.damage), `seed ${seed} damage ${blow.damage}`);
  }
  // …and the same seeds without the guarantee still miss sometimes: that roll is the player's own
  // (`resolveAttack`), which the owner asked to keep, and it is why this rule had to be explicit
  // rather than a change to `hitChance`.
  let misses = 0;
  for (let seed = 1; seed <= 200; seed++) {
    if (!monsterAttack({ monster, target: { level: 1 }, random: new ArenaRandom(seed) }).hit) misses++;
  }
  assert.ok(misses > 0, `${misses} of 200 unguaranteed blows missed`);
  // The player's own blade keeps the roll, so a low-Agility player still misses.
  const swing = resolveAttack({ attacker: { level: 1, attributes: { agility: 0, strength: 50 } }, defender: { level: 1, attributes: { agility: 100 } }, random: new ArenaRandom(9) });
  assert.ok(swing.chance < 100, `the player's own chance is still a chance: ${swing.chance}`);
});

test('a slower, heavier monster takes longer between blows, and the rate is ours', () => {
  // RECONSTRUCTED and flagged as such in `combat.js`: UESP gives no cadence. The test
  // pins the properties the game relies on — positive, finite, rising with level.
  const rat = attackInterval(monsterById('Rat'));
  const lich = attackInterval(monsterById('Lich'));
  assert.ok(rat > 0.5 && rat < 3, `${rat}`);
  assert.ok(lich > rat, 'a lich is not faster than a rat');
  assert.ok(Number.isFinite(lich));
  // A roll spreads the first blow over half to one and a half intervals.
  const rolled = rollMonster(monsterById('Rat'), new ArenaRandom(11));
  assert.ok(rolled.nextAttack > 0 && rolled.nextAttack <= attackInterval(monsterById('Rat')) * 1.5);
});

test('the same seed fights the same fight', () => {
  const attacker = { level: 3, attributes: { strength: 55, luck: 50 } };
  const defender = { level: 2, attributes: { agility: 30 } };
  const fight = (seed) => {
    const random = new ArenaRandom(seed);
    return [...Array(20)].map(() => resolveAttack({ attacker, defender, weapon: 'shortsword', material: 'steel', random }).damage);
  };
  assert.deepEqual(fight(1234), fight(1234));
  assert.notDeepEqual(fight(1234), fight(1235));
});

test('a blow from behind lands half again as hard (the backstab)', () => {
  const opts = {
    attacker: { level: 2, attributes: { strength: 50, luck: 50 } },
    defender: { level: 1, attributes: {} },
    weapon: 'longsword', material: 'steel', guaranteedHit: true,
  };
  const front = resolveAttack({ ...opts, random: new ArenaRandom(11) });
  const behind = resolveAttack({ ...opts, random: new ArenaRandom(11), fromBehind: true });
  assert.equal(front.hit, true, 'the guarded dry run lands');
  assert.equal(behind.backstab, true, 'the position is kept on the result');
  assert.equal(behind.damage, Math.ceil(front.damage * 1.5), 'half again as hard, rounded up');
  assert.equal(behind.damage > front.damage, true);
});
