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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
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
  if (url.pathname.startsWith('/arena-local/')) {
    const root = url.searchParams.get('arena') || process.env.ARENA_PATH;
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
});
