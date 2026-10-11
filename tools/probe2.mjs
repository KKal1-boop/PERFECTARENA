// M1 reconnaissance pass 2: loose data files + sample BSA records.
import fs from 'node:fs';
import path from 'node:path';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const OUT = process.env.OUT || 'C:/arenaproject/PERFECTARENA/.scratch';
fs.mkdirSync(OUT, { recursive: true });

const hex = (b, n = 48) => Array.from(b.slice(0, n)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
const asc = (b, n = 64) => JSON.stringify(Buffer.from(b.slice(0, n)).toString('latin1'));

function loose(name) {
  try {
    const b = fs.readFileSync(path.join(ARENA, name));
    console.log(`${name} size=${b.length}\n  hex: ${hex(b)}\n  asc: ${asc(b)}`);
  } catch (e) { console.log(`${name}: ${e.message}`); }
}

// --- Arena BSA reader (verified layout: u16 count@0, payloads@2, 18-byte dir at end)
function readBsa(file) {
  const b = fs.readFileSync(path.join(ARENA, file));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const count = dv.getUint16(0, true);
  const dirStart = b.length - 18 * count;
  const entries = new Map();
  let pos = 2;
  for (let i = 0; i < count; i++) {
    const o = dirStart + i * 18;
    const name = b.subarray(o, o + 14).toString('latin1').replace(/\0.*$/, '');
    const size = dv.getInt32(o + 14, true);
    entries.set(name.toUpperCase(), { pos, size });
    pos += size;
  }
  return { size: b.length, count, entries, bytes: b };
}

const targets = ['TEENYFNT.DAT', 'ARENAFNT.DAT', 'FONT4.DAT', 'PAL.COL', 'CHARSHT.COL', 'NAMES.CLR',
  'RAND.DAT', 'ARTFACT1.DAT', 'TEMPLATE.DAT', 'CITYDATA.64', 'SPELLS.LST', 'SPELLS.65',
  'SPELLSG.65', 'STATES.65', 'NAMES.DAT', 'TAVERN.DAT', 'CLASSES.DAT', 'QUESTION.TXT', 'DUNGEON.TXT'];
for (const t of targets) loose(t);

console.log('\n=== writing sample BSA records to scratch ===');
const bsa = readBsa('GLOBAL.BSA');
for (const name of ['TEENYFNT.DAT', 'FLA1A.IMG', 'CAS.INF', 'WILD001.RMD', 'START.MIF', 'CHAOS1.DFA', 'CASA.SET', 'ARROWS.CIF', 'PAL.COL']) {
  const e = bsa.entries.get(name);
  if (!e) { console.log(`  ${name}: not in BSA`); continue; }
  const data = bsa.bytes.subarray(e.pos, e.pos + e.size);
  fs.writeFileSync(path.join(OUT, name), data);
  console.log(`  ${name} size=${e.size} hex=${hex(data, 32)}`);
}
console.log(`\nBSA entries total=${bsa.count}`);
console.log('sample names containing FONT:', [...bsa.entries.keys()].filter((n) => /FONT|TEENY/.test(n)).slice(0, 12).join(','));
console.log('sample RMD:', [...bsa.entries.keys()].filter((n) => /\.RMD$/.test(n)).slice(0, 5).join(','));
console.log('sample INF:', [...bsa.entries.keys()].filter((n) => /\.INF$/.test(n)).slice(0, 8).join(','));
console.log('MIF names sample:', [...bsa.entries.keys()].filter((n) => /\.MIF$/.test(n)).slice(0, 16).join(','));
