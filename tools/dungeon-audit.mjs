// AUDIT: does a generated dungeon hold the player in, and can the player walk out of the map?
//
// Two reported defects, asked of the real files:
//   1. "you find yourself blocked off as soon as you enter" — the arrival cell, and how much of
//      the level a walk from it can reach;
//   2. "part of the dungeon leads off the map" — a piece is walled on all four borders with
//      openings at the same four cells, which is what makes a seam work; but the *outside* of
//      the assembled level is made of those same borders, so every piece's outward-facing
//      border is a hole in the level's own boundary. This counts them.
//
// Run:  ARENA_PATH=C:/ArenaProject/arena/ARENA node tools/dungeon-audit.mjs [seeds]

import { ArenaData } from '../src/arena/arenaData.js';
import { nodeSource } from './lib/nodeSource.mjs';
import { decodeLevel } from '../src/game/mifLevel.js';
import { DUNGEON_BLOCKS_INF, DUNGEON_BLOCKS_MIF, assembleDungeon, spawnCellFor } from '../src/game/dungeonPlan.js';
import { loadWorldMap } from '../src/game/worldMap.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA), { onWarn: () => {} });
const blocks = await data.mif(DUNGEON_BLOCKS_MIF);
const inf = await data.inf(DUNGEON_BLOCKS_INF);
const world = await loadWorldMap(new ArenaData(nodeSource(ARENA), { onWarn: () => {} }));

const COUNT = Number(process.argv[2] || 40);
const passable = (level, row, col) => {
  if (row < 0 || col < 0 || row >= level.depth || col >= level.width) return false;
  const cell = level.cells[row * level.width + col];
  return Boolean(cell) && !cell.solid && !cell.floor?.chasm;
};
const passableDoor = (level, row, col) => {
  if (row < 0 || col < 0 || row >= level.depth || col >= level.width) return false;
  const cell = level.cells[row * level.width + col];
  return Boolean(cell) && (!cell.solid || cell.kind === 'door') && !cell.floor?.chasm;
};
function reach(level, row, col) {
  const seen = new Set();
  if (!passableDoor(level, row, col)) return seen;
  const queue = [row * level.width + col];
  seen.add(queue[0]);
  while (queue.length) {
    const index = queue.pop();
    const r = Math.floor(index / level.width);
    const c = index % level.width;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr; const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= level.depth || nc >= level.width) continue;
      if (!passableDoor(level, nr, nc)) continue;
      const next = nr * level.width + nc;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

// Every dungeon in the world that has no shipped file — the ones this generator makes.
const generated = world.locations.filter((l) => l.kind === 'dungeon' && Number.isInteger(l.dungeonSeed) && l.dungeonSeed > 0);
const sample = generated.slice(0, COUNT);

let holesTotal = 0;
let blocked = 0;
const rows = [];
for (const dungeon of sample) {
  const raw = assembleDungeon({
    blocks: blocks.levels, seed: dungeon.dungeonSeed, startPoints: blocks.startPoints ?? [], exitVoxel: 0x1d1d,
  });
  const level = decodeLevel(raw, inf, { width: raw.width, depth: raw.depth, mapType: 'interior' });
  // ── the boundary: walkable cells on the outer ring, which is a hole in the level
  const edge = [];
  const ring = new Set();
  for (let k = 0; k < level.width; k++) {
    for (const [r, c] of [[0, k], [level.depth - 1, k], [k, 0], [k, level.width - 1]]) {
      ring.add(r * level.width + c);
      if (passableDoor(level, r, c)) edge.push(`${r},${c}`);
    }
  }
  holesTotal += edge.length;
  // The same question asked of the **raw voxels** the assembler produced, so a failure here is
  // the seal not running and a failure only above is the decoder reading a sealed cell as floor.
  let rawHoles = 0;
  for (const index of ring) {
    const row = Math.floor(index / raw.width);
    const col = index % raw.width;
    const voxel = raw.map1[index];
    if (voxel === 0) { rawHoles++; continue; }
    const kind = (voxel & 0xf000) >> 12;
    if (kind === 0x8 || kind === 0x9 || kind === 0xb) rawHoles++;
  }
  // ── the arrival
  const from = spawnCellFor(level, blocks.startPoints ?? []);
  const walkable = level.cells.filter((c) => (!c.solid || c.kind === 'door') && !c.floor?.chasm).length;
  const reached = from ? reach(level, from.row, from.col) : new Set();
  const share = walkable ? reached.size / walkable : 0;
  const onEdge = from ? (from.row === 0 || from.col === 0 || from.row === level.depth - 1 || from.col === level.width - 1) : false;
  if (share < 0.7 || !from) blocked++;
  rows.push({
    seed: dungeon.dungeonSeed, name: dungeon.name, arrival: from, share, edge: edge.length,
    edgeCells: edge.slice(0, 6), onEdge, floorY: level.floorY, exit: raw.exit ?? null,
    passages: raw.passages?.passages ?? 0, sealed: raw.sealed?.sealed ?? -1, rawHoles,
  });
}

const bad = rows.filter((r) => r.edge > 0 || r.share < 0.7 || r.onEdge);
console.log(`dungeons audited: ${sample.length}`);
console.log(`holes in the outer boundary (decoded): ${holesTotal} cells across ${rows.filter((r) => r.edge > 0).length} levels`);
console.log(`holes in the outer boundary (raw voxels): ${rows.reduce((n, r) => n + r.rawHoles, 0)} cells across ${rows.filter((r) => r.rawHoles > 0).length} levels`);
console.log(`cells the assembler reports sealing: ${[...new Set(rows.map((r) => r.sealed))].join(', ')}`);
console.log(`arrivals that reach under 70% of the floor: ${blocked}`);
console.log(`arrivals standing on the level's own edge: ${rows.filter((r) => r.onEdge).length}`);
console.log('floorY (units?):', [...new Set(rows.map((r) => r.floorY))].join(', '));
console.log('\nfirst offenders:');
for (const r of bad.slice(0, 8)) {
  console.log(` built ${r.name} seed ${r.seed}: arrival ${JSON.stringify(r.arrival)} (edge=${r.onEdge}) reaches ${(100 * r.share).toFixed(0)}%, ${r.edge} open boundary cells ${JSON.stringify(r.edgeCells)}, exit ${JSON.stringify(r.exit)}, ${r.passages} passages`);
}
console.log('\nclean levels:', rows.filter((r) => r.edge === 0 && r.share >= 0.7).length, 'of', rows.length);
