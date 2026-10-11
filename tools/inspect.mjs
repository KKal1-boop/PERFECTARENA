// M1 reconnaissance: dump headers/structures of Arena files.
// Usage: node tools/inspect.mjs [target...]
import fs from 'node:fs';
import path from 'node:path';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const p = (f) => path.join(ARENA, f);
const hex = (b, n = 64) => Array.from(b.slice(0, n)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
const ascii = (b, n = 64) => JSON.stringify(Buffer.from(b.slice(0, n)).toString('latin1'));

export function inspectBsa(file) {
  const b = fs.readFileSync(p(file));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // try the "arena" shape: uint16 count at 0, 18-byte records at end
  const count = dv.getUint16(0, true);
  console.log(`\n== ${file} size=${b.length} firstU16=${count}`);
  for (const [label, entrySize, nameLen] of [['arena18', 18, 14]]) {
    const dirStart = b.length - entrySize * count;
    console.log(`   ${label}: dirStart=${dirStart} (${dirStart > 0 ? 'ok' : 'NEGATIVE - wrong shape'})`);
    if (dirStart <= 0 || dirStart > b.length) continue;
    let rec = 2, ok = true;
    const names = [];
    for (let i = 0; i < Math.min(count, 12); i++) {
      const off = dirStart + i * entrySize;
      const name = b.slice(off, off + nameLen).toString('latin1').replace(/\0.*$/, '');
      const size = dv.getInt32(off + nameLen, true);
      names.push([name, size, rec]);
      if (size < 0) ok = false;
      rec += size;
    }
    console.log(`   names:`, names.map(([n, s]) => `${n}:${s}`).join(' '));
    console.log(`   total payload end=${rec} dirStart=${dirStart} delta=${dirStart - rec} plausible=${ok && Math.abs(dirStart - rec) < 64}`);
  }
}

function inspectMif(file) {
  const b = fs.readFileSync(p(file));
  console.log(`\n== ${file} size=${b.length}`);
  console.log('   head:', hex(b, 80));
  console.log('   ascii:', ascii(b, 80));
  // scan for known 4-byte tags
  const tags = ['MHDR', 'LEVL', 'FLOR', 'FLAT', 'MAP1', 'MAP2', 'INFO', 'INNS', 'LOCK', 'LOOT', 'NAME', 'NUMF', 'STOR', 'TARG', 'TRIG'];
  const found = [];
  const s = b.toString('latin1');
  for (const t of tags) {
    let i = -1;
    while ((i = s.indexOf(t, i + 1)) !== -1) found.push(`${t}@${i}`);
  }
  console.log('   tags:', found.slice(0, 40).join(' '));
  if (b.length >= 8 && b.slice(0, 4).toString('latin1') === 'MHDR') {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    console.log(`   MHDR payloadSize=${dv.getUint16(4, true)} entryCount=${b[7]} startX=[${[0,1,2,3].map(i=>dv.getUint16(8+i*2,true))}] startY=[${[0,1,2,3].map(i=>dv.getUint16(16+i*2,true))}] startLevel=${b[24]} levelCount=${b[25]} w=${dv.getUint16(27,true)} h=${dv.getUint16(29,true)}`);
  }
}

function showText(file, n = 400) {
  const b = fs.readFileSync(p(file));
  console.log(`\n== ${file} size=${b.length}`);
  console.log(JSON.stringify(Buffer.from(b.slice(0, n)).toString('latin1')));
}

function showHeader(file, n = 64) {
  const b = fs.readFileSync(p(file));
  console.log(`\n== ${file} size=${b.length} head=${hex(b, n)} ascii=${ascii(b, 16)}`);
}

const targets = process.argv.slice(2);
const which = targets.length ? targets : ['GLOBAL.BSA'];
for (const t of which) {
  try {
    if (/\.bsa$/i.test(t)) inspectBsa(t);
    else if (/\.mif$/i.test(t)) inspectMif(t);
    else if (/\.(txt|inf|dat|cpy|cfg|lst)$/i.test(t)) showText(t);
    else showHeader(t);
  } catch (e) { console.log(`ERR ${t}: ${e.message}`); }
}
