// STARTING OVER.
//
// One flow, two doors: the menu that `Escape` opens inside a level
// (`scenes/interior.js`) and the button on the world map's own sheet
// (`scenes/worldmap.js`). Both do exactly the same thing, and both have to do it the
// hard way.
//
// ## Why this is not a page load
//
// `location.href = '?chargen'` is what this would be if the player's Arena data were a
// URL. It is not: `arena/browserSource.js` hands back a live `FileList` (or a File System
// Access handle) from a folder the player chose, and **no page load can reopen it** — a
// navigation would show the picker again on the way to character creation, which is the
// exact bug that produced `goInPlace` and the in-page world map. So the flow boots
// creation *in this page* with the same `source`, and when creation resolves, boots the
// world map the same way. The URL is rewritten with `replaceState` as it goes, so a reload
// lands where the player actually is: creation while they are in it, the map once out.
//
// The dev door (`?arena=<folder>`) travels in the URL as well, so a test or a developer
// can see the same behaviour from a page that has no picked folder at all.
//
// ## What "new game" means
//
// `clearSave()` — every key the game owns: the character, the main quest's own progress,
// the job board and its calendar, the regard ledger, the last location, and which loot
// this machine has already taken. A new game is a world that has never heard of the
// player, which is why the ledger is in that list at all (`game/save.js`).
//
// ## Where it lands
//
// Arena's own first ten minutes, and the owner's report that this port skipped them
// (2026-10-16): *"after character creation a cutscene missing in perfectarena you start in
// the imperial dungeon"*. So the flow here is creation → the opening movie (`INTRO.FLC`) →
// **a locked cell in the Imperial Dungeons** (`game/startFlow.js`'s `START_INTERIOR`), and
// Tamriel opens up when the player escapes (`game/questState.js`, whose first stage is
// exactly that). This used to hand the player to the world map, which is the middle of the
// story rather than its first step.

import { clearSave, loadCharacter } from '../game/save.js';
import { START_INTERIOR } from '../game/startFlow.js';

/**
 * Forget the save and run character creation, then the opening and the Imperial Dungeons.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {object} opts.renderer
 * @param {(msg: string) => void} opts.status
 * @param {import('../arena/arenaData.js').ArenaSource} opts.source  the folder already open
 * @param {URLSearchParams} [opts.params]  this page's own parameters, for a dev-door `?arena=`
 * @returns {Promise<{ok: boolean, character?: object|null, why?: string}>}
 */export async function beginNewGame({ canvas, renderer, status, source, params = null }) {
  if (!source) return { ok: false, why: 'no Arena data source' };
  clearSave();

  /** The dev door's own folder travels in the URL; a picked one is already open in memory. */
  const folder = source.arenaPath ?? params?.get('arena') ?? null;
  const urlFor = (key) => {
    const next = new URLSearchParams();
    next.set(key, '');
    if (folder) next.set('arena', folder);
    return next;
  };
  const rewrite = (next) => {
    try {
      history.replaceState(history.state ?? null, '', `${location.pathname}?${next.toString()}${location.hash ?? ''}`);
    } catch { /* a page that cannot rewrite its URL still starts over */ }
  };

  // The scene that is standing goes first: its frame loop and its listeners would
  // otherwise keep running under the panel that replaces it (`dispose`, and every scene
  // registers one on `window.__arenaScene`).
  window.__arenaScene?.dispose?.();

  const chargenParams = urlFor('chargen');
  rewrite(chargenParams);
  const { bootChargen } = await import('./chargen.js');
  const { character } = await bootChargen(canvas, renderer, chargenParams, status, source);

  // ── the opening movie, and the cell it wakes you in ──────────────────────
  //
  // "New Game" is a game start by definition, so the movie is owed whatever this tab has
  // already seen (`game/startFlow.js`'s `openingGate`). A page whose install ships no such
  // file still starts: a movie is never a dependency (`cutscenePlayer.js`).
  try {
    const { showMovie } = await import('./cutscenePlayer.js');
    const played = await showMovie('INTRO.FLC', { source, arenaPath: folder, status });
    window.__debug.opening = { ...played.state, played: played.played, skipped: played.skipped };
  } catch (err) {
    window.__debug.opening = { error: String(err?.message ?? err) };
  }

  // Creation is not a destination: a player who has just made a character belongs in the
  // Imperial Dungeons, at the first stage of the quest, not on the world map.
  const dest = urlFor('interior');
  dest.set('interior', START_INTERIOR);
  rewrite(dest);
  const { bootInterior } = await import('./interior.js');
  await bootInterior(canvas, renderer, dest, status, source);
  document.getElementById('boot')?.classList.add('hidden');
  window.__ready = true;
  return { ok: true, character: character ?? loadCharacter() };
}
