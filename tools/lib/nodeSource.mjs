// NODE-SIDE ARENA FOLDER ACCESS for the offline tools and unit tests.
//
// The game itself never uses this module: it reads from a folder the player
// picks, or over HTTP. This exists so `tools/*.mjs` and `tests/unit/*` can point
// `ARENA_PATH` at a real installation.
//
// Filenames are matched case-insensitively, like the game's own lookups, so a
// folder copied from a DOS CD image or extracted by a case-mangling tool still
// resolves.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {import('../../src/arena/arenaData.js').ArenaSource} ArenaSource
 */

/**
 * An Arena folder (the one containing `GLOBAL.BSA`, e.g. `…/arena/ARENA`).
 *
 * @param {string} root
 * @returns {ArenaSource & {root: string, listing: string[]}}
 */
export function nodeSource(root) {
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) throw new Error(`Arena folder not found: ${resolved}`);

  /** @type {Map<string, string>} upper-case name -> real path */
  const index = new Map();
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else index.set(entry.name.toUpperCase(), full);
    }
  };
  walk(resolved);

  return {
    root: resolved,
    label: resolved,
    listing: Array.from(index.keys()).sort(),
    list: () => Array.from(index.keys()).sort(),
    getBytes: async (name) => {
      const hit = index.get(name.toUpperCase());
      if (!hit) return null;
      return new Uint8Array(fs.readFileSync(hit));
    },
  };
}

/**
 * Every subdirectory that looks like an Arena data folder, most-populated first.
 * Handy because Arena installs differ (`ARENA/`, `ARENA/DATA/`, …).
 *
 * @param {string} root
 * @returns {string[]}
 */
export function findArenaFolders(root) {
  /** @type {{dir: string, score: number}[]} */
  const out = [];
  const resolved = path.resolve(root);
  /** @param {string} dir @param {number} depth */
  const walk = (dir, depth) => {
    if (depth > 2) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const names = entries.map((e) => e.name.toUpperCase());
    let score = 0;
    if (names.includes('GLOBAL.BSA')) score += 100;
    score += names.filter((n) => n.endsWith('.MIF')).length;
    score += names.filter((n) => n.endsWith('.COL')).length * 3;
    if (score > 0) out.push({ dir, score });
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
  };
  walk(resolved, 0);
  return out.sort((a, b) => b.score - a.score).map((e) => e.dir);
}
