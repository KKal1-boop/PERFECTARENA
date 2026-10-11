#!/usr/bin/env node
// `mif-dump.mjs` — parse a real `.MIF` (and its `.INF`) and print what the game
// will see. This is the Milestone 3 reverse-engineering tool: it is how the
// voxel-ID decoding in `src/game/mifLevel.js` was checked against real data
// rather than against the documentation alone.
//
//   node tools/mif-dump.mjs                 # every loose .MIF in the folder
//   node tools/mif-dump.mjs CAS.MIF IMPPAL.MIF
//   node tools/mif-dump.mjs --voxels CAS.MIF   # per-cell decoding histogram
//
// `ARENA_PATH` overrides the Arena folder.

import { ArenaData, mapSource } from '../src/arena/arenaData.js';
import { decodeLevel } from '../src/game/mifLevel.js';
import { nodeSource } from './lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const files = argv.filter((a) => !a.startsWith('--'));

/** @param {number[]} ns */
const stats = (ns) => {
  if (!ns.length) return 'n/a';
  const min = Math.min(...ns), max = Math.max(...ns);
  const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
  return `min ${min} max ${max} mean ${mean.toFixed(1)}`;
};

async function main() {
  const source = nodeSource(ARENA_PATH);
  const data = new ArenaData(source, { onWarn: (m) => console.warn(`  warn: ${m}`) });

  const archive = await data.bsa();
  console.log(`Arena folder : ${source.root}`);
  console.log(`GLOBAL.BSA   : ${archive.count} records, payload ${archive.payloadEnd} B, directory ${archive.directoryStart} B`);

  const targets = files.length
    ? files
    : source.listing.filter((n) => n.endsWith('.MIF')).concat(
      archive.names().filter((n) => n.endsWith('.MIF')).slice(0, 6),
    );

  for (const name of targets) {
    console.log(`\n=== ${name} ===`);
    try {
      const mif = await data.mif(name);
      console.log(`  ${mif.width}×${mif.height}  levels ${mif.levelCount} (declared ${mif.declaredLevelCount})  startLevel ${mif.startingLevelIndex}  entryCount ${mif.entryCount}`);
      console.log(`  startPoints ${mif.startPoints.map((s) => `(${s.x},${s.y})`).join(' ')}`);
      if (mif.levelCount !== mif.declaredLevelCount) console.log('  ! declared level count disagrees with parsed count');

      for (let i = 0; i < mif.levels.length; i++) {
        const level = mif.levels[i];
        const infName = level.info.toUpperCase();
        console.log(`  level ${i}: NAME="${level.name}" INFO="${level.info}" NUMF=${level.numf} targ=${level.targ.length} lock=${level.lock.length} trig=${level.trig.length}`);
        if (level.unknownTags.length) console.log(`    unknown chunks: ${level.unknownTags.join(', ')}`);
        if (!level.map1) { console.log('    (no MAP1)'); continue; }

        let inf = null;
        try { inf = await data.inf(infName); } catch { /* missing INF is reported below */ }
        const level2 = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
        const kinds = {};
        for (const v of level2.cells) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
        console.log(`    textures ${inf ? inf.voxelTextures.length : 'NO INF'}  ceiling ${inf ? inf.ceiling.height : '?'}  layers ${level2.layerCount}  floorY ${level2.floorY.toFixed(3)}  ceilingY ${level2.ceilingY.toFixed(3)}  spawn ${JSON.stringify(level2.spawn)}`);
        console.log(`    kinds ${Object.entries(kinds).map(([k, n]) => `${k}:${n}`).join(' ')}`);

        if (flags.has('--voxels')) {
          const m1 = Array.from(level.map1).filter((v) => v);
          const fl = level.flor ? Array.from(level.flor) : [];
          console.log(`    map1 nonzero ${m1.length}/${level.map1.length} distinct ${new Set(m1).size}`);
          console.log(`    floor texIDs  ${stats(fl.map((v) => (v & 0xff00) >> 8))}`);
          const floors = fl.map((v) => (v & 0xff00) >> 8);
          const hist = {};
          for (const f of floors) hist[f] = (hist[f] ?? 0) + 1;
          console.log(`    floor hist ${JSON.stringify(hist)}`);
          const nibbles = {};
          for (const v of m1) { const n = (v & 0xf000) >> 12; nibbles[n] = (nibbles[n] ?? 0) + 1; }
          console.log(`    map1 MS nibble hist ${JSON.stringify(nibbles)}`);
          const raisedMS = {};
          for (const v of m1) if ((v & 0x8000) === 0 && ((v & 0x7f00) >> 8) !== (v & 0x7f)) {
            const b = ((v & 0x7f00) >> 8).toString(16).padStart(2, '0');
            raisedMS[b] = (raisedMS[b] ?? 0) + 1;
          }
          console.log(`    raised MS bytes ${JSON.stringify(raisedMS)}`);
          const kindsBy = {};
          for (const c of level2.cells) kindsBy[c.kind] = (kindsBy[c.kind] ?? 0) + 1;
          const sizes = level2.cells.filter((c) => c.kind === 'raised').map((c) => +c.ySize.toFixed(3));
          console.log(`    raised ySize ${stats(sizes)}`);
          const offs = level2.cells.filter((c) => c.kind === 'raised').map((c) => +c.yOffset.toFixed(3));
          console.log(`    raised yOffset ${stats(offs)}`);
        }
      }
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
    }
  }

  if (flags.has('--census')) {
    console.log('\nrecord census:');
    for (const [ext, n] of Object.entries(archive.census()).sort((a, b) => b[1] - a[1])) console.log(`  ${ext.padEnd(6)} ${n}`);
  }
  void mapSource;
}

main().catch((err) => { console.error(err); process.exit(1); });
