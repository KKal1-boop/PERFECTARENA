// **THE PUBLISH PACKAGE.** The game is a static site — one page, ES modules, one WebAssembly
// blob — so a host needs `index.html` and `src/`, and nothing else. Cloudflare's dashboard
// uploader refuses a folder that contains TypeScript (it reads `.ts` as "this project wants a
// build", and `.scratch/vendor/…/*.d.ts` and `node_modules` are full of them), so the folder to
// upload is this one: `dist/`, which holds exactly what a browser asks for.
//
//   node tools/pack-cloud.mjs                 # build dist/
//   npx wrangler pages deploy dist            # or upload dist/ in the dashboard
//
// Nothing of Arena's is in it: the game data is read from the player's own folder or archive at
// runtime, which is why this package is 7 MB rather than 700.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

/** Everything a browser loads, and nothing else. */
const FILES = ['index.html', 'og.jpg'];
const DIRS = ['src'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let bytes = 0;
let count = 0;
/** @param {string} from @param {string} to */
const copy = (from, to) => {
  fs.cpSync(from, to, { recursive: true });
  const walk = (p) => {
    if (!fs.statSync(p).isDirectory()) {
      bytes += fs.statSync(p).size;
      count++;
      return;
    }
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else { bytes += fs.statSync(full).size; count++; }
    }
  };
  walk(to);
};

for (const file of FILES) copy(path.join(ROOT, file), path.join(OUT, file));
for (const dir of DIRS) copy(path.join(ROOT, dir), path.join(OUT, dir));

// The one asset whose absence is silent: the RAR decoder (`arena/rarArchive.js` fetches it by
// name). The game boots without it — only `.rar` archives need it — so it is checked loudly here
// rather than discovered by a player whose install is a rar.
const wasm = path.join(OUT, 'src', 'vendor', 'unrar', 'unrar.wasm');
if (!fs.existsSync(wasm)) {
  console.error('dist/src/vendor/unrar/unrar.wasm is missing — .rar archives would not open');
  process.exit(1);
}

console.log(`dist/ ${count} files, ${(bytes / 1048576).toFixed(1)} MB`);
console.log('publish it with:  npx wrangler pages deploy dist');
