// THE MODULE GATE — the cheapest guard this project has against a page that will not boot.
//
// Two failures have already cost this repo a session each, and neither was a logic bug: a
// `ReferenceError` from a name used before it was declared, and a TDZ blank page, both found
// only by opening the game in a browser (`docs/PROGRESS.md` §6, and the "declaration order in
// giant closures has blanked the page twice" law). A syntax error, a misspelled import or an
// import of a file that is not there produces exactly that shape of failure, and **nothing about
// it is visible until a human loads the page** — the unit tests only touch the modules they
// import, and the browser suites pay a page boot before they can say anything.
//
// So this gate walks all of `src/` and asks three questions, none of which needs a browser:
//
//   1. does each file *parse* (`node --check`, the same parser the game's browser will use);
//   2. does every static `import`/`export … from` specifier *resolve* to a file — and is every
//      bare specifier a `node:` builtin, since this project has no dependencies and no bundler
//      (a bare `import x from 'lodash'` would 404 in the browser, not here);
//   3. does each module actually *import* in bare Node.
//
// **`src/main.js` is the one exception, and it is named rather than filtered by a rule**: it is
// the entry point, importing it runs `boot()`, and `boot()` wants a canvas and a WebGL2 context.
// It is covered instead by (1), by (2) — which is where a typo in its import list would show —
// and by the last test here, which pins that it is still the module `index.html` boots.
//
// A red here means the game cannot load; fix the cause, never the gate.
//
// **What this gate deliberately does not police.** It reads *static* specifiers only — the ones
// the module loader must resolve before a single line of the module runs. A **dynamic**
// `import('./x.js')` inside a function is a different risk class: it fails at its call site, and
// this fork already guards the ones it has (`mwFirstPerson.js`'s `readers unavailable: …`
// wrapper around the pruned Morrowind readers is the pattern — measured, not assumed: the
// corpus of that file's dynamic imports resolves to two files this port does not carry, and the
// assembly answers with a typed failure instead of throwing). An unguarded one is a runtime
// concern, and the browser suites are what catch it.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');
/** The entry point, which boots the game when imported (see the header). */
const ENTRY = 'src/main.js';

/** Every `.js` under `src/`, sorted, so a failure names files in a stable order. */
const MODULES = (() => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(full);
    }
  };
  walk(SRC);
  return out.sort();
})();

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

/**
 * A module's source with its comments gone and its strings intact.
 *
 * **Comments first, because this codebase writes prose that looks like code**: a JSDoc line
 * reading `@returns {import('./contract.js').BillboardBatch}` — a type the fork's renderer no
 * longer carries — is not an import, and the first draft of this gate reported it (and a dozen
 * sentences like “from 'this file failed to load'”) as a bare dependency. The specifier a gate
 * wants lives *inside a string*, so strings stay.
 */
function stripComments(text) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Every **static** specifier of a module: `… from '…'` and the side-effect `import '…'`.
 * Dynamic `import('…')` is out of scope on purpose (see the header).
 */
function specifiers(text) {
  const code = stripComments(text);
  const found = new Set();
  for (const re of [/from\s*['"]([^'"]+)['"]/g, /^\s*import\s*['"]([^'"]+)['"]/gm]) {
    for (const m of code.matchAll(re)) found.add(m[1]);
  }
  return [...found];
}

test('every module under src/ parses — a syntax error cannot reach the browser', () => {
  assert.ok(MODULES.length > 150, `the walk found the tree (${MODULES.length} modules)`);
  const broken = [];
  for (const file of MODULES) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      const said = String(err.stderr ?? '').split('\n').slice(0, 3).join(' ').trim();
      broken.push(`${rel(file)}: ${said || err.message}`);
    }
  }
  assert.deepEqual(broken, [], `modules that do not parse:\n${broken.join('\n')}`);
});

test('every import and re-export in src/ resolves, and nothing is a bare dependency', () => {
  const missing = [];
  for (const file of MODULES) {
    const text = fs.readFileSync(file, 'utf8');
    for (const spec of specifiers(text)) {
      if (spec.startsWith('node:')) continue;                 // a builtin, and the only bare form allowed
      if (!spec.startsWith('.')) {
        missing.push(`${rel(file)}: bare specifier '${spec}' — this project has no dependencies and no bundler`);
        continue;
      }
      const target = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(target)) missing.push(`${rel(file)}: '${spec}' does not exist`);
    }
  }
  assert.deepEqual(missing, [], `imports that cannot resolve:\n${missing.join('\n')}`);
});

test('every module imports cleanly in bare Node', async () => {
  const failures = [];
  for (const file of MODULES) {
    if (rel(file) === ENTRY) continue;
    try {
      await import(pathToFileURL(file).href);
    } catch (err) {
      failures.push(`${rel(file)}: ${String(err.message).split('\n')[0]}`);
    }
  }
  assert.deepEqual(failures, [], `modules that throw on import:\n${failures.join('\n')}`);
});

test('the entry point is the one index.html boots, and the only module that boots itself', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /src="\.\/src\/main\.js"/, 'index.html still names src/main.js as its module');
  const booters = MODULES
    .filter((file) => /^boot\(\)/m.test(fs.readFileSync(file, 'utf8')))
    .map(rel);
  assert.deepEqual(booters, [ENTRY], 'exactly one module starts the game, and it is the entry point');
});
