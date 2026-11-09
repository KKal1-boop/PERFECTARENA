// Static server for PERFECTARENA. No dependencies, no build step.
//
//   node tools/serve.mjs [port]        (default 8080)
//
// The game reads Arena's data at runtime from a folder the *player* picks, so
// nothing here touches the Arena install. `?arena=<path>` on the URL is the
// headless-test door: this server will serve files out of that path when the
// request carries `/arena-local/…`, which the browser tests use instead of
// exercising the folder picker.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The dev door's archive fallback: the same reader the game and the tests use,
// so an install's own bytes decide what answers, never a re-implementation.
import { parseBsa } from '../src/arena/bsaArchive.js';

/** The archive of one arena root, parsed once for the dev door's lifetime. */
const bsaCache = new Map();
function archiveOf(root) {
  if (!bsaCache.has(root)) {
    bsaCache.set(root, null);
    for (const base of [root, path.join(root, 'ARENA')]) {
      try {
        const bytes = new Uint8Array(fs.readFileSync(path.join(base, 'GLOBAL.BSA')));
        bsaCache.set(root, parseBsa(bytes, 'GLOBAL.BSA'));
        break;
      } catch { /* the next base may hold it */ }
    }
  }
  return bsaCache.get(root);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

/**
 * The Arena folder to serve when neither `?arena=` nor `ARENA_PATH` says.
 *
 * The two games live side by side in this checkout — `arena/ARENA` next to
 * `PERFECTARENA/` — so the folder a player would otherwise have to pick is already on
 * disk. Finding it here means the game opens *playable* instead of asking for files it can
 * find itself; a player with a different install still gets the picker, because nothing is
 * found in that case. `GLOBAL.BSA` is the test, the same one the client's
 * `looksLikeArena` uses.
 *
 * @returns {string|null}
 */
function defaultArenaRoot() {
  const candidates = [
    path.join(ROOT, '..', 'arena', 'ARENA'),
    path.join(ROOT, '..', 'ARENA', 'ARENA'),
    path.join(ROOT, '..', 'arena'),
    path.join(ROOT, 'arena', 'ARENA'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join(candidate, 'GLOBAL.BSA'))) return path.resolve(candidate);
    } catch { /* an unreadable candidate is simply not the one */ }
  }
  return null;
}

/** The folder this request should read Arena's data from, or null if there is none. */
const arenaRoot = (url) => url.searchParams.get('arena') || process.env.ARENA_PATH || defaultArenaRoot();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  // The RAR decoder's WebAssembly build (`src/vendor/unrar/unrar.wasm`).
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Resolve a URL path inside a root, refusing anything that escapes it. */
function resolveWithin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const full = path.resolve(root, '.' + path.posix.normalize(decoded));
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // The test door: /arena-local/<NAME> maps onto ?arena=<root> if given, else
  // onto the ARENA_PATH environment variable. Never enabled for a plain visit.
  if (url.pathname === '/arena-local' || url.pathname === '/arena-local/') {
    // An index, so the client can tell "this file is not here" from "this file
    // failed to load" without paying for a 404 per lookup — Arena resolves most
    // names out of GLOBAL.BSA, so the loose-file misses are the common case and
    // a 404 per miss fills the browser console with misleading network errors.
    const root = arenaRoot(url);
    if (!root) { res.writeHead(404).end('no arena root'); return; }
    /** @type {string[]} */
    const names = [];
    for (const base of [root, path.join(root, 'ARENA')]) {
      try {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (entry.isFile()) names.push(entry.name.toUpperCase());
        }
      } catch { /* a missing base is not an error; the other one may exist */ }
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ names: Array.from(new Set(names)).sort() }));
    return;
  }

  if (url.pathname.startsWith('/arena-local/')) {
    const root = arenaRoot(url);
    if (!root) { res.writeHead(404).end('no arena root'); return; }
    const wanted = url.pathname.slice('/arena-local/'.length);
    // Arena's data lives either at the root or under an ARENA/ subfolder.
    for (const base of [root, path.join(root, 'ARENA')]) {
      const full = resolveWithin(base, '/' + wanted);
      if (full && fs.existsSync(full) && fs.statSync(full).isFile()) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        fs.createReadStream(full).pipe(res);
        return;
      }
    }
    // The archive's own members answer next: most of the install's sound (the
    // `@SOUND` clips a `.INF` names) lives in `GLOBAL.BSA`, not on disk — the
    // fanfares are the loose exception. Same bytes the game itself reads first.
    const bsa = archiveOf(root);
    if (bsa) {
      const bytes = bsa.get(wanted.toUpperCase());
      if (bytes) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end(Buffer.from(bytes));
        return;
      }
    }
    res.writeHead(404).end('not found: ' + wanted);
    return;
  }

  let full = resolveWithin(ROOT, url.pathname);
  if (full && fs.existsSync(full) && fs.statSync(full).isDirectory()) full = path.join(full, 'index.html');
  if (!full || !fs.existsSync(full)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + url.pathname);
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(full).pipe(res);
});

server.listen(PORT, () => {
  // PORT=0 lets the OS pick; the chosen port is printed on its own line so the
  // test runner can read it back instead of guessing (and colliding with
  // whatever else the machine is running).
  const actual = server.address().port;
  console.log(`PERFECTARENA serving ${ROOT}`);
  console.log(`PORT=${actual}`);
  console.log(`  http://localhost:${actual}/`);
  console.log(`  test map : http://localhost:${actual}/?test`);
  const found = defaultArenaRoot();
  if (found) console.log(`  arena    : ${found} (served at /arena-local/ for ?arena=… or ARENA_PATH)`);
});
