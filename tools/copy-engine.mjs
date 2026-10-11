// Copies the transitive import closure of the chosen engine modules from the
// read-only daggerfall tree into src/engine/, preserving relative paths so the
// engine's './x.js' and '../y/z.js' imports keep resolving.
//
// Usage: node tools/copy-engine.mjs [--check]
//   --check  report what would change, copy nothing
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.ENGINE_SRC || 'C:/arenaproject/daggerfall/src';
const DST = path.resolve('src/engine');
const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Entry modules for Milestone 2 (the booted path). More are added as milestones need them.
const ENTRIES = [
  'render/renderer.js',
  'render/skyRenderer.js',
  'world/mat4.js',
  'world/quat.js',
  'world/perlin.js',
  'player/pointerLock.js',
  'player/lookFilter.js',
  'player/motor.js',
  'player/collider.js',
  'player/mwCamera.js',
  'ui/text.js',
  'ui/cursor.js',
  'ui/windowStack.js',
  'ui/fpsCounter.js',
  'ui/input.js',
  'ui/touch.js',
  'ui/gamepadInput.js',
  'ui/lookSettings.js',
  'ui/viewSettings.js',
  'ui/hudShortcuts.js',
  'ui/nativePanel.js',
  'ui/screenshot.js',
  'ui/bitmapCanvas.js',
  'ui/touchDevice.js',
  'systems/settings.js',
  'systems/uiPrefs.js',
  'systems/frameCap.js',
  'ui/crashText.js',
  'systems/audio.js',
  'systems/timeScale.js',
  'formats/flcFile.js',
  'formats/dfPalette.js',
];

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*['"]([^'"]+)['"]/g;
const BARE_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

const check = process.argv.includes('--check');
const seen = new Set();
const missing = new Set();
const bare = new Set();
const globs = new Set();

function resolve(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = path.resolve(path.dirname(path.join(SRC, fromFile)), spec);
  return path.relative(path.resolve(SRC), abs).replace(/\\/g, '/');
}

function visit(rel) {
  if (seen.has(rel)) return;
  const src = path.join(SRC, rel);
  if (!fs.existsSync(src)) { missing.add(rel); return; }
  seen.add(rel);
  const text = fs.readFileSync(src, 'utf8');
  if (text.includes('import.meta.glob')) globs.add(rel);
  if (text.includes('import.meta.env')) globs.add(rel + ' (import.meta.env)');
  for (const m of text.matchAll(IMPORT_RE)) {
    const r = resolve(rel, m[1]);
    if (r) visit(r); else bare.add(m[1]);
  }
  for (const m of text.matchAll(BARE_RE)) {
    if (!m[1].startsWith('.')) bare.add(m[1]);
  }
}

for (const e of ENTRIES) visit(e);

console.log(`closure: ${seen.size} modules`);
console.log(`vite-only constructs: ${globs.size ? [...globs].join(', ') : 'none'}`);
console.log(`bare/unresolved imports: ${bare.size ? [...bare].join(', ') : 'none'}`);
console.log(`missing files: ${missing.size ? [...missing].join(', ') : 'none'}`);

if (check) process.exit(0);

let copied = 0;
for (const rel of seen) {
  const from = path.join(SRC, rel);
  const to = path.join(DST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}
console.log(`copied ${copied} modules into src/engine/`);

// Provenance: record which engine revision these files came from.
const headFile = path.join(SRC, '..', 'buildTag.js');
let tag = 'unknown';
try { tag = fs.readFileSync(headFile, 'utf8').trim().slice(0, 200); } catch { /* none */ }
fs.writeFileSync(path.join(DST, 'PROVENANCE.md'),
  `# Engine provenance\n\nCopied verbatim from \`c:/arenaproject/daggerfall/src\` by\n\`tools/copy-engine.mjs\`. The daggerfall tree is read-only; do not edit\n\`src/engine/\` by hand — re-run the copy tool and put Arena-specific changes in\n\`src/arena/\`, \`src/game/\` or \`src/scenes/\`.\n\nEntry modules requested:\n\n${ENTRIES.map((e) => `- \`${e}\``).join('\n')}\n\nClosure size: ${seen.size} modules.\n\nbuildTag.js first line: \`${tag.split('\n')[0]}\`\n`);
