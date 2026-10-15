// WHAT THE INSTALL SHIPS AND WHAT THE PORT ACTUALLY READS.
//
// The port's own reports have said "the install ships art we do not draw" often enough that the
// claim needs a number: this enumerates every record in `GLOBAL.BSA` and every loose file in the
// Arena install, then asks one question of each — is its name mentioned anywhere in `src/`?
//
//   node tools/assetcoverage.mjs              # summary + the largest unused records
//   node tools/assetcoverage.mjs --unused cfa # only records with this extension
//   node tools/assetcoverage.mjs --used       # what the port does read, with the file that names it
//   node tools/assetcoverage.mjs --json       # the whole inventory, machine-readable
//
// A name match is a *mention*, not a proof of use: a record can be named in a comment. It is a
// proof of *absence* the other way round — a record no source file names cannot be drawn.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBsa } from '../src/arena/bsaArchive.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

/**
 * Every `.js` under `src/`, indexed two ways.
 *
 * **Two ways because a name can be written or composed.** `SWORD.CIF` is written whole
 * somewhere (`weaponView.js`), and that is a direct read. `RAT1.CFA` is *never* written whole:
 * `game/monsters.js` carries `sprite: 'RAT'` and builds `${monster.sprite}${view}.CFA`. A tool
 * that only looked for full names would call all 340 monster and townsfolk sheets unread —
 * which is exactly the wrong answer, and the wrong answer this project has been quoting. So
 * the second index is the **stems**: bare upper-case words a source file contains.
 *
 * @returns {{full: Map<string, Set<string>>, stems: Map<string, Set<string>>}}
 */
function readSources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.name.endsWith('.js')) files.push(at);
    }
  };
  walk(path.join(ROOT, 'src'));
  const full = new Map();
  const stems = new Map();
  const add = (map, name, file) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(path.relative(ROOT, file));
  };
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/[A-Za-z0-9_$]{1,12}\.[A-Za-z0-9]{1,4}/g)) add(full, m[0].toUpperCase(), file);
    // Bare upper-case words of 3+ characters, which is how a composed name's stem is written.
    for (const m of text.matchAll(/[A-Z0-9_]{3,12}/g)) add(stems, m[0], file);
  }
  return { full, stems };
}

const sources = readSources();
/** The stem of a record name: `RAT1.CFA` → `RAT`, `01CHNWLK.CFA` → `01CHNWLK`. */
const stemOf = (name) => name.replace(/\.[A-Z0-9]{1,4}$/i, '').replace(/\d+$/, '');
const mentions = (name) => sources.full.get(name.toUpperCase()) ?? null;
/** How a source names this record when it composes the name instead of writing it. */
const composedBy = (name) => {
  const stem = stemOf(name);
  return stem.length >= 3 ? (sources.stems.get(stem) ?? null) : null;
};

const args = process.argv.slice(2);
const onlyExt = args.includes('--unused') ? (args[args.indexOf('--unused') + 1] ?? '').toLowerCase() : null;
const wantUsed = args.includes('--used');
const asJson = args.includes('--json');

const bsaPath = path.join(ARENA, 'GLOBAL.BSA');
const bsa = parseBsa(new Uint8Array(fs.readFileSync(bsaPath)), 'GLOBAL.BSA');
const record = (e) => ({
  name: e.name,
  size: e.size,
  ext: e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase() : '(none)',
  used: mentions(e.name) ? [...mentions(e.name)].sort() : [],
  composed: mentions(e.name) ? [] : [...(composedBy(e.name) ?? [])].sort(),
});
const records = bsa.entries.map(record);

// The install's loose files, the same question.
const loose = [];
for (const dir of [ARENA, path.join(ARENA, 'SPEECH')]) {
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const at = path.join(dir, entry.name);
    loose.push({ ...record({ name: entry.name.toUpperCase(), size: fs.statSync(at).size }), dir: path.relative(ARENA, dir) || '.' });
  }
}

if (asJson) {
  console.log(JSON.stringify({ bsa: records, loose }, null, 1));
  process.exit(0);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const census = (rows) => rows.reduce((out, r) => { out[r.ext] = (out[r.ext] ?? 0) + 1; return out; }, {});

const bsaUsed = records.filter((r) => r.used.length);
const bsaComposed = records.filter((r) => !r.used.length && r.composed.length);
const pct = (n, of) => `${(n / of * 100).toFixed(1)}%`;
console.log(`GLOBAL.BSA — ${records.length} records, ${kb(records.reduce((n, r) => n + r.size, 0))}`);
console.log(`  written whole in src/: ${bsaUsed.length} (${pct(bsaUsed.length, records.length)})`);
console.log(`  reachable through a composed name (stems): ${bsaComposed.length} (${pct(bsaComposed.length, records.length)})`);
console.log(`  not named by any source either way: ${records.length - bsaUsed.length - bsaComposed.length}`);
console.log(`  census: ${Object.entries(census(records)).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}:${n}`).join(' ')}`);
const looseUsed = loose.filter((r) => r.used.length);
const looseComposed = loose.filter((r) => !r.used.length && r.composed.length);
console.log(`loose files — ${loose.length}, written whole: ${looseUsed.length} (${pct(looseUsed.length, loose.length)}), composed: ${looseComposed.length}`);
console.log(`  census: ${Object.entries(census(loose)).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}:${n}`).join(' ')}`);

if (wantUsed) {
  console.log('\n── READ BY THE PORT ──');
  for (const row of [...bsaUsed, ...looseUsed].sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${row.name.padEnd(16)} ${kb(row.size).padStart(9)}  ${row.used.slice(0, 3).join(', ')}`);
  }
} else {
  const rows = [...records.filter((r) => !r.used.length && !r.composed.length), ...loose.filter((r) => !r.used.length && !r.composed.length)]
    .filter((r) => (onlyExt ? r.ext === onlyExt : true))
    .sort((a, b) => b.size - a.size);
  console.log(`\n── UNREAD (${rows.length}${onlyExt ? ` with .${onlyExt}` : ''}), largest first ──`);
  for (const row of rows.slice(0, 60)) console.log(`  ${row.name.padEnd(16)} ${kb(row.size).padStart(9)}  .${row.ext}`);
  if (rows.length > 60) console.log(`  … and ${rows.length - 60} more (pass --json for all)`);
  const byExt = {};
  for (const row of rows) byExt[row.ext] = (byExt[row.ext] ?? 0) + row.size;
  console.log('\n  unread bytes by extension:');
  for (const [ext, size] of Object.entries(byExt).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`    .${ext.padEnd(5)} ${kb(size)}`);
}
