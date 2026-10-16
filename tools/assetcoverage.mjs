// WHAT THE INSTALL SHIPS AND WHAT THE PORT ACTUALLY READS.
//
// The port's own reports have said "the install ships art we do not draw" often enough that the
// claim needs a number: this enumerates every record in `GLOBAL.BSA` and every loose file in the
// Arena install, then asks one question of each — is its name mentioned anywhere in `src/`?
//
//   node tools/assetcoverage.mjs              # summary + the largest unused records
//   node tools/assetcoverage.mjs --unused cfa # only records with this extension
//   node tools/assetcoverage.mjs --used       # what the port does read, with the file that names it
//   node tools/assetcoverage.mjs --groups     # the unread records grouped by what would read them
//   node tools/assetcoverage.mjs --top 40     # the N largest unread records (default 60)
//   node tools/assetcoverage.mjs --json       # the whole inventory + the groups, machine-readable
//
// A name match is a *mention*, not a proof of use: a record can be named in a comment. It is a
// proof of *absence* the other way round — a record no source file names cannot be drawn.
//
// ── THE TWO HALVES OF THIS FILE, AND WHY (B22) ──────────────────────────────────
//
// **Everything above the line marked "the run" touches the filesystem; everything below it is
// pure.** The classifiers (`kindOf`, `consumerGroupOf`), the argument parser (`parseArgs`) and the
// grouping maths (`groupRecords`, `topBySize`, `summarise`) are exported, and importing this file
// does **not** open `GLOBAL.BSA` — which is what lets `tests/unit/assetcoverage.test.mjs` pin the
// rules on a machine where the install is somewhere else. A document whose numbers nobody can
// regenerate rots; a classifier nobody can test drifts.
//
// The group labels are a **classification of the archive by what would consume it**, so the one
// number ("1 691 records are named by nothing") becomes a work list: 946 `.IMG` screens go to the
// UI, 180 `.SET` sheets to the level's own texture binding, 340 `.CFA` to the creature and crowd
// drawers, and so on. `GROUP_MODULES` names the module each group belongs to **in this project**,
// so the table in `docs/ASSETS.md` and the code cannot disagree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseBsa } from '../src/arena/bsaArchive.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

// ══════════════════════════════════════════════════════════════════════════════
// PURE — the rules. No filesystem, no `process.argv`, testable from Node.
// ══════════════════════════════════════════════════════════════════════════════

/** How a record's extension is spelled in the rows: lower case, or `(none)` for a bare name. */
export function extensionOf(name) {
  const text = String(name ?? '');
  const dot = text.lastIndexOf('.');
  return dot > 0 ? text.slice(dot + 1).toLowerCase() : '(none)';
}

/**
 * The **kind of thing** a record is, from its extension — Arena's own file families.
 *
 * This is a fact about the install, not a heuristic: `.SET` is a wall sheet, `.CFA` is a
 * character frame animation, `.MIF` is a map (`docs/FORMATS.md` §2 counts them all).
 * @param {string} name
 * @returns {string} one of the keys of `KIND_OF_EXT`, or `'other'`
 */
export function kindOf(name) {
  return KIND_OF_EXT[extensionOf(name)] ?? 'other';
}

/**
 * Every extension in `GLOBAL.BSA` (and the loose install), and what the install means by it.
 *
 * Counts as of the recorded census: `img:946 mif:533 cfa:340 set:180 inf:93 dfa:79 voc:76
 * rmd:70 cif:58 xfm:33 xmi:33` — the same numbers `docs/FORMATS.md` §2 carries.
 */
export const KIND_OF_EXT = Object.freeze({
  img: 'image',          // 946 — flats, screens, faces, map pieces
  cif: 'image',          //  58 — compressed images (weapon sheets, equipment lists)
  mif: 'map',            // 533 — city, dungeon and wilderness maps
  inf: 'map-definition', //  93 — the text that says what a map's texture ids mean
  rmd: 'wilderness-block', // 70 — the wild's terrain blocks
  gld: 'map',
  cfa: 'creature-set',   // 340 — character frame animations (sprites, crowd sets)
  dfa: 'fixture',        //  79 — decor/flat animations
  set: 'tileset',        // 180 — wall texture sheets, 128×128
  voc: 'sound',          //  76 in the archive, 175 loose (+ `SPEECH/`)
  flc: 'movie',          //  17 loose — Arena's own cutscenes
  xfm: 'music',
  xmi: 'music',
  col: 'palette',
  dat: 'table',
  txt: 'text',
  bsa: 'archive',
  exe: 'executable',
  bat: 'script',
  cfg: 'config',
  ini: 'config',
  adv: 'driver',
  bnk: 'driver',
  mnu: 'text',
  lst: 'text',
  cpy: 'executable',
  ico: 'image',
  cel: 'image',
  imd: 'image',
  ntz: 'image',
});

/**
 * Which **consumer** an unread record belongs to — the group the work list is made of.
 *
 * The `.IMG` family is the only one that needs a name rule at all, because the same extension
 * carries full-screen art (a menu, a face, a map piece) and small scenery art (a flat). The rule
 * is a **prefix list** (`SCREEN_PREFIXES`), it is stated rather than hidden, and the largest
 * unread `.IMG` records are what the screens are in practice — `--groups` prints the group and
 * `--top` prints the names, so a wrong guess is visible in the tool's own output.
 *
 * @param {string} name
 * @returns {string} a `GROUP_MODULES` key
 */
export function consumerGroupOf(name) {
  const upper = String(name ?? '').toUpperCase();
  const ext = extensionOf(name);
  const kind = kindOf(name);
  if (kind === 'image') {
    if (ext === 'cel') return 'class-art';
    return SCREEN_PREFIXES.some((prefix) => upper.startsWith(prefix)) ? 'screen' : 'image-art';
  }
  return GROUP_OF_KIND[kind] ?? 'other';
}

/** The name prefixes that make an `.IMG` a full-screen picture rather than scenery art. */
export const SCREEN_PREFIXES = Object.freeze([
  'TITLE', 'SCROLL', 'MENU', 'OPTION', 'CREDIT', 'INVEN', 'JOURNAL', 'SPELLMKR', 'NAMECHNK',
  'FACE', 'CHARGEN', 'NEWGAME', 'STARTGM', 'OPTIONS', 'MAPBTNS', 'END', 'VISION', 'BOOTEXE',
]);

/** Kind → consumer group, for every kind that has exactly one consumer. */
export const GROUP_OF_KIND = Object.freeze({
  map: 'level-map',
  'map-definition': 'level-map',
  'wilderness-block': 'wilderness-block',
  'creature-set': 'creature-set',
  fixture: 'fixture',
  tileset: 'tileset',
  sound: 'sound',
  movie: 'movie',
  music: 'music',
  palette: 'palette',
  table: 'table',
  text: 'text',
  archive: 'other',
  executable: 'tooling',
  script: 'tooling',
  config: 'config',
  driver: 'driver',
});

/**
 * Where each group **belongs in this project** — the module that would consume it.
 *
 * The document (`docs/ASSETS.md`) and this table have to agree, and a test pins the keys, so a
 * group with no home is a visible gap rather than a sentence in a report.
 */
export const GROUP_MODULES = Object.freeze({
  screen: 'src/scenes/* + index.html — the panels and menus the port draws itself today',
  'image-art': 'src/game/flats.js + src/arena/image.js — flat/scenery and map art',
  'class-art': 'src/scenes/chargen.js — the class and character art',
  tileset: 'src/game/mifLevel.js (voxelTexture) — a level\'s own wall and floor sheets',
  'creature-set': 'src/game/monsters.js + src/game/townsfolk.js — creature and crowd frames',
  fixture: 'src/game/furnish.js + the flat pass in src/game/mifMesh.js — room props',
  'level-map': 'src/arena/mifFile.js + src/game/dungeonPlan.js — the maps themselves',
  'wilderness-block': 'src/game/wilderness.js — the country\'s terrain blocks',
  sound: 'src/game/trigSound.js + src/engine/systems/audio.js — effects and voices',
  movie: 'src/game/cutscene.js + src/scenes/cutscenePlayer.js — Arena\'s own movies',
  music: 'src/engine/systems/audio.js — the music (nothing plays it yet)',
  palette: 'src/arena/palette.js — PAL.COL and the climate palettes',
  table: 'src/arena/arenaData.js — CLASSES/SPELLS/NAMES and the rest of the game\'s tables',
  text: 'src/arena/arenaText.js — the corpora (TEMPLATE/CITYINTR/DUNGEON/QUESTION)',
  config: 'tools/ (nothing in the game reads them)',
  driver: 'nothing — DOS sound drivers, out of scope',
  tooling: 'nothing — the original\'s own executables',
  other: 'unclassified — read the name and decide',
});

/**
 * Parse this tool's own arguments.
 *
 * Pure, and separated from every filesystem call, so `--top`/`--groups`/`--json` can be pinned by
 * a test instead of by running the tool against an install.
 *
 * @param {string[]} argv  e.g. `['--unused','cfa','--top','40']`
 * @returns {{onlyExt: string|null, wantUsed: boolean, wantGroups: boolean, asJson: boolean, top: number}}
 */
export function parseArgs(argv = []) {
  const args = Array.isArray(argv) ? argv.map(String) : [];
  const valueOf = (flag) => {
    const at = args.indexOf(flag);
    return at >= 0 ? (args[at + 1] ?? '') : null;
  };
  const onlyExt = args.includes('--unused') ? (valueOf('--unused') || '').toLowerCase() || null : null;
  const topRaw = valueOf('--top');
  const top = Number.parseInt(topRaw ?? '', 10);
  return {
    onlyExt,
    wantUsed: args.includes('--used'),
    wantGroups: args.includes('--groups'),
    asJson: args.includes('--json'),
    // A `--top` with no number (or a silly one) keeps the displayed default rather than throwing.
    top: Number.isFinite(top) && top > 0 ? top : DEFAULT_TOP,
  };
}

/** How many unread records the plain run prints before it starts counting. */
export const DEFAULT_TOP = 60;

/** The rows sorted largest first — the order every list in this tool is written in. */
export function sortBySize(rows) {
  return [...(rows ?? [])].sort((a, b) => (b.size - a.size) || String(a.name).localeCompare(String(b.name)));
}

/** The `n` largest rows. @param {object[]} rows @param {number} n */
export function topBySize(rows, n = DEFAULT_TOP) {
  return sortBySize(rows).slice(0, Math.max(0, n));
}

/**
 * Group rows by their consumer, largest group first.
 *
 * @param {object[]} rows  `{name, size, ext}` — `ext` optional, derived from the name
 * @returns {{group: string, count: number, bytes: number, names: string[], module: string}[]}
 */
export function groupRecords(rows) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const group = consumerGroupOf(row.name);
    if (!groups.has(group)) groups.set(group, { group, count: 0, bytes: 0, names: [], module: GROUP_MODULES[group] ?? '' });
    const into = groups.get(group);
    into.count++;
    into.bytes += Number(row.size) || 0;
    into.names.push(row.name);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, names: sortBySize(g.names.map((name) => ({ name, size: 0 }))).map((r) => r.name) }))
    .sort((a, b) => b.bytes - a.bytes || b.count - a.count || a.group.localeCompare(b.group));
}

/** Totals and both censuses, for the summary block and for `--json`. */
export function summarise(rows) {
  const list = rows ?? [];
  const count = (key) => list.reduce((out, row) => {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
    return out;
  }, {});
  return {
    count: list.length,
    bytes: list.reduce((n, row) => n + (Number(row.size) || 0), 0),
    byExt: count((row) => row.ext ?? extensionOf(row.name)),
    byGroup: count((row) => consumerGroupOf(row.name)),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// the run — everything below reads the disk, and only runs when this file is the
// program (`main()`), so an import never opens an archive.
// ══════════════════════════════════════════════════════════════════════════════

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

/**
 * Run the census.
 *
 * @param {string[]} [argv]  this tool's own arguments (`--unused`, `--used`, `--groups`, `--top`,
 *   `--json`); defaults to the real command line
 * @param {{arenaPath?: string, log?: (...args: unknown[]) => void}} [opts]
 * @returns {{exitCode: number}} 0 always: a report that cannot read the install prints why
 */
export function main(argv = process.argv.slice(2), { arenaPath = ARENA, log = console.log } = {}) {
  const { onlyExt, wantUsed, wantGroups, asJson, top } = parseArgs(argv);

  const sources = readSources();
  /** The stem of a record name: `RAT1.CFA` → `RAT`, `01CHNWLK.CFA` → `01CHNWLK`. */
  const stemOf = (name) => name.replace(/\.[A-Z0-9]{1,4}$/i, '').replace(/\d+$/, '');
  const mentions = (name) => sources.full.get(name.toUpperCase()) ?? null;
  /** How a source names this record when it composes the name instead of writing it. */
  const composedBy = (name) => {
    const stem = stemOf(name);
    return stem.length >= 3 ? (sources.stems.get(stem) ?? null) : null;
  };

  const bsaPath = path.join(arenaPath, 'GLOBAL.BSA');
  let bsa;
  try {
    bsa = parseBsa(new Uint8Array(fs.readFileSync(bsaPath)), 'GLOBAL.BSA');
  } catch (err) {
    log(`could not read ${bsaPath}: ${err?.message ?? err}`);
    log('pass the install with ARENA_PATH=<folder> (it must hold GLOBAL.BSA)');
    return { exitCode: 0 };
  }
  const record = (e) => ({
    name: e.name,
    size: e.size,
    ext: extensionOf(e.name),
    used: mentions(e.name) ? [...mentions(e.name)].sort() : [],
    composed: mentions(e.name) ? [] : [...(composedBy(e.name) ?? [])].sort(),
  });
  const records = bsa.entries.map(record);

  // The install's loose files, the same question.
  const loose = [];
  for (const dir of [arenaPath, path.join(arenaPath, 'SPEECH')]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const at = path.join(dir, entry.name);
      loose.push({ ...record({ name: entry.name.toUpperCase(), size: fs.statSync(at).size }), dir: path.relative(arenaPath, dir) || '.' });
    }
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const pct = (n, of) => `${(n / of * 100).toFixed(1)}%`;
  const bsaUsed = records.filter((r) => r.used.length);
  const bsaComposed = records.filter((r) => !r.used.length && r.composed.length);
  const unread = [...records.filter((r) => !r.used.length && !r.composed.length),
    ...loose.filter((r) => !r.used.length && !r.composed.length)];
  const unreadBsa = records.filter((r) => !r.used.length && !r.composed.length);
  const groups = groupRecords(unreadBsa);
  const looseUnreadCount = unread.length - unreadBsa.length;

  if (asJson) {
    log(JSON.stringify({
      bsa: records,
      loose,
      groups,
      summary: {
        bsa: summarise(records), loose: summarise(loose), unread: summarise(unread),
      },
    }, null, 1));
    return { exitCode: 0 };
  }

  const census = (rows) => rows.reduce((out, r) => { out[r.ext] = (out[r.ext] ?? 0) + 1; return out; }, {});

  log(`GLOBAL.BSA — ${records.length} records, ${kb(records.reduce((n, r) => n + r.size, 0))}`);
  log(`  written whole in src/: ${bsaUsed.length} (${pct(bsaUsed.length, records.length)})`);
  log(`  reachable through a composed name (stems): ${bsaComposed.length} (${pct(bsaComposed.length, records.length)})`);
  log(`  not named by any source either way: ${records.length - bsaUsed.length - bsaComposed.length}`);
  log(`  census: ${Object.entries(census(records)).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}:${n}`).join(' ')}`);
  const looseUsed = loose.filter((r) => r.used.length);
  const looseComposed = loose.filter((r) => !r.used.length && r.composed.length);
  log(`loose files — ${loose.length}, written whole: ${looseUsed.length} (${pct(looseUsed.length, loose.length)}), composed: ${looseComposed.length}`);
  log(`  census: ${Object.entries(census(loose)).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}:${n}`).join(' ')}`);

  if (wantUsed) {
    log('\n── READ BY THE PORT ──');
    for (const row of [...bsaUsed, ...looseUsed].sort((a, b) => a.name.localeCompare(b.name))) {
      log(`  ${row.name.padEnd(16)} ${kb(row.size).padStart(9)}  ${row.used.slice(0, 3).join(', ')}`);
    }
    return { exitCode: 0 };
  }

  /**
   * The work list: the unread records by what would read them.
   *
   * The half that turns one number into jobs. **The archive's own records only** are grouped —
   * a loose file is a tool or a driver as often as it is art — and `docs/ASSETS.md` is written
   * from exactly this table, so the two cannot drift.
   */
  const printGroups = () => {
    log('\n── UNREAD IN THE ARCHIVE, BY CONSUMER ──');
    for (const g of groups) {
      log(`  ${String(g.count).padStart(4)} records  ${kb(g.bytes).padStart(10)}  ${g.group}`);
      log(`        ${g.module}`);
    }
    if (looseUnreadCount) log(`  (plus ${looseUnreadCount} unread loose files — see the census line above)`);
    log('\n  largest in each group:');
    for (const g of groups) {
      log(`    ${g.group}: ${g.names.slice(0, 5).join(', ')}${g.names.length > 5 ? ' …' : ''}`);
    }
  };

  // `--groups` is the table on its own: the same numbers without the loud list of names.
  if (wantGroups) {
    printGroups();
    return { exitCode: 0 };
  }

  const rows = sortBySize(unread.filter((r) => (onlyExt ? r.ext === onlyExt : true)));
  log(`\n── UNREAD (${rows.length}${onlyExt ? ` with .${onlyExt}` : ''}), largest first ──`);
  for (const row of rows.slice(0, top)) log(`  ${row.name.padEnd(16)} ${kb(row.size).padStart(9)}  .${row.ext}`);
  if (rows.length > top) log(`  … and ${rows.length - top} more (pass --json for all, --top N for more here)`);
  const byExt = {};
  for (const row of rows) byExt[row.ext] = (byExt[row.ext] ?? 0) + row.size;
  log('\n  unread bytes by extension:');
  for (const [ext, size] of Object.entries(byExt).sort((a, b) => b[1] - a[1]).slice(0, 14)) log(`    .${ext.padEnd(5)} ${kb(size)}`);
  printGroups();
  return { exitCode: 0 };
}

/** Run only when this file is the program — an import must not touch the disk. */
const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && pathToFileURL(fs.realpathSync(process.argv[1])).href === pathToFileURL(fs.realpathSync(fileURLToPath(import.meta.url))).href;
  } catch { return false; }
})();
if (invokedDirectly) {
  const { exitCode } = main();
  process.exit(exitCode);
}
