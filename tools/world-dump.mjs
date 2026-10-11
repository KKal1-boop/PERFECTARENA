#!/usr/bin/env node
// `world-dump.mjs` — print the world of Tamriel as Arena stores it.
//
//   node tools/world-dump.mjs                 # provinces, rectangles, quest dungeons
//   node tools/world-dump.mjs --settlements   # every city/town/village with its seeds
//   node tools/world-dump.mjs --terrain       # TERRAIN.IMG classes + a coarse map
//   node tools/world-dump.mjs --quest         # the derived main-quest chain
//
// `ARENA_PATH` overrides the Arena folder.

import { ArenaData } from '../src/arena/arenaData.js';
import {
  WORLD_MAP_SIZE, cityTypeOf, locationGlobalPoint, parseCityData, questDungeonsOf, settlementsOf,
} from '../src/arena/cityDataFile.js';
import {
  citySeed, dungeonSeed, mainQuestDungeonMifName, rulerIsMale, wildernessSeed,
} from '../src/arena/cityDataSeeds.js';
import { nodeSource } from './lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const has = (name) => process.argv.includes(`--${name}`);

const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: (m) => console.warn(`  warn: ${m}`) });
const archive = await data.bsa();
const names = new Set(archive.names());

const cityBytes = await data.must('CITYDATA.64');
const world = parseCityData(cityBytes);
console.log(`CITYDATA.64    : ${world.size} bytes, ${world.provinces.length} provinces, ${world.provinces.reduce((n, p) => n + p.locations.length, 0)} locations`);
console.log(`world map      : ${WORLD_MAP_SIZE.width}×${WORLD_MAP_SIZE.height} pixels`);
if (world.warnings.length) console.log(`warnings       : ${world.warnings.join('; ')}`);

console.log('\nprovinces:');
for (const province of world.provinces) {
  const rect = province.rect;
  const settlements = settlementsOf(province);
  console.log(`  ${String(province.id).padStart(2)} ${province.name.padEnd(20)} rect ${String(rect.x).padStart(3)},${String(rect.y).padStart(3)} ${String(rect.width).padStart(3)}×${String(rect.height).padStart(3)}  ${settlements.length} settlements  ${questDungeonsOf(province).map((d) => d.name).join(' / ')}`);
}

if (has('settlements')) {
  console.log('\nsettlements (kind name — local point → global point, city seed, wild seed):');
  for (const province of world.provinces) {
    for (const location of settlementsOf(province)) {
      const global = locationGlobalPoint(province, location);
      console.log(`  ${province.name.padEnd(18)} ${cityTypeOf(location.index).padEnd(8)} ${location.name.padEnd(22)} ${String(location.local.x).padStart(3)},${String(location.local.y).padStart(3)} → ${String(global.x).padStart(3)},${String(global.y).padStart(3)}  city ${String(citySeed(location)).padStart(10)}  wild ${wildernessSeed(location).toString(16).padStart(8, '0')}  ruler ${rulerIsMale(province.rect, location.local) ? 'male' : 'female'}`);
    }
  }
}

const questDungeons = world.provinces.flatMap((province) => questDungeonsOf(province)
  .map((dungeon) => ({ province, dungeon, seed: dungeonSeed(dungeon, province.id) })));

console.log('\nquest dungeons (the two named ones per province):');
for (const { province, dungeon, seed } of questDungeons) {
  const mif = mainQuestDungeonMifName(seed);
  console.log(`  ${province.name.padEnd(18)} ${dungeon.index === 0 ? 'staff' : 'map  '} ${dungeon.name.padEnd(22)} local ${String(dungeon.local.x).padStart(3)},${String(dungeon.local.y).padStart(3)}  seed ${seed}  ${mif} ${names.has(mif) ? '(in archive)' : '(NOT in archive)'}`);
}

if (has('quest')) {
  // Match each named quest dungeon to the main quest's dungeon order, which is
  // documented (UESP) as a list of names: the pieces are found in this order.
  const ORDER = ['Fang Lair', 'Labyrinthian', 'Elden Grove', 'Halls of Colossus', 'Crystal Tower', 'Crypt of Hearts', 'Murkwood', 'Dagoth-Ur'];
  console.log('\nmain quest chain by name:');
  for (let i = 0; i < ORDER.length; i++) {
    const wanted = ORDER[i];
    const hit = questDungeons.find((q) => q.dungeon.name.toLowerCase() === wanted.toLowerCase());
    console.log(`  piece ${i + 1} ${wanted.padEnd(20)} ${hit ? `${hit.province.name} (${hit.dungeon.index === 0 ? 'staff' : 'map'} dungeon)` : 'NOT FOUND in CITYDATA'}`);
  }
}

if (has('terrain')) {
  const terrainBytes = await data.bytes('TERRAIN.IMG');
  console.log(`\nTERRAIN.IMG    : ${terrainBytes ? `${terrainBytes.length} bytes` : 'MISSING'}`);
  if (terrainBytes) {
    console.log(`  first 16 bytes: ${Array.from(terrainBytes.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    const hist = new Map();
    for (const b of terrainBytes) hist.set(b, (hist.get(b) ?? 0) + 1);
    console.log(`  distinct values: ${hist.size} — ${[...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v, n]) => `${v}×${n}`).join(' ')}`);
    const w = 320, h = 200;
    if (terrainBytes.length === w * h) {
      const GLYPH = { 0: ' ', 1: '.', 2: ',', 3: '^', 4: 'M', 5: 'd', 6: 'D', 7: 'x' };
      console.log(`  as ${w}×${h} (every 5th pixel):`);
      for (let y = 0; y < h; y += 5) {
        let line = '';
        for (let x = 0; x < w; x += 3) line += GLYPH[terrainBytes[y * w + x]] ?? '?';
        console.log(`  ${line}`);
      }
    }
  }
  const mapBytes = await data.bytes('TAMRIEL.IMG');
  console.log(`TAMRIEL.IMG    : ${mapBytes ? `${mapBytes.length} bytes` : 'MISSING'}`);
}
