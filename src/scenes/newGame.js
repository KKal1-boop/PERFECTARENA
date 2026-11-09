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
// the imperial dungeon"*. The flow is the original's: the opening scroll and the nine-panel
// history (`game/cutscene.js`'s `NEW_GAME_STEPS`), creation, then **a locked cell in the
// Imperial Dungeons** (`game/startFlow.js`'s `START_INTERIOR`). Tamriel opens up when the
// player escapes (`game/questState.js`, whose first stage is exactly that). Ria's `1400` in
// the cell is the new game's own speech. This used to hand the player to the world map, which
// is the middle of the story rather than its first step.

import { NEW_GAME_STEPS } from '../game/cutscene.js';
import { clearSave, loadCharacter, markCellDreamPending } from '../game/save.js';
import { START_INTERIOR } from '../game/startFlow.js';

/**
 * Forget the save, play the opening scroll and nine-panel history, run character creation,
 * then the cell in the Imperial Dungeons.
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
  // **Ria's explanation is owed with the new game.** The history before creation is
  // `NEW_GAME_STEPS` (`SCROLL.FLC` and the nine `INTRO` panels); the explanation itself
  // (`TEMPLATE.DAT` 1400) belongs to the cell and is played by the first level boot, from the
  // save's own ledger (`game/storyScript.js`'s `dueCellDream`). This handshake is what tells a
  // level boot that a game actually began.
  markCellDreamPending();

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

  // ── the original's new-game story, before the make ────────────────────────
  // OpenTESArena's `MainMenuUiController::onNewGameButtonSelected` chains the opening
  // scroll, the nine `INTRO` pictures at five seconds each, and character creation. Those
  // panels are the betrayal the start-up's shorter `SCROLL01–03` cards do not tell. Skipping
  // the sequence is the player's own key, not a reason to skip character creation.
  const opening = { played: false, skipped: false, steps: [], current: null, reason: null };
  window.__debug = window.__debug || {};
  window.__debug.opening = opening;
  if (!params?.has('nointro')) {
    try {
      const { showMovie, showStill } = await import('./cutscenePlayer.js');
      for (const step of NEW_GAME_STEPS) {
        opening.current = step.file;
        let result;
        try {
          result = step.kind === 'still'
            ? await showStill(step.file, {
              source, arenaPath: folder ?? undefined, status,
              seconds: step.seconds, paletteFile: step.paletteFile,
            })
            : await showMovie(step.file, { source, arenaPath: folder ?? undefined, status });
        } catch (err) {
          result = { played: false, skipped: false, reason: String(err?.message ?? err) };
        }
        opening.steps.push({ file: step.file, played: Boolean(result.played), skipped: Boolean(result.skipped) });
        opening.played = opening.played || Boolean(result.played);
        if (result.skipped) { opening.skipped = true; break; }
      }
      opening.current = null;
    } catch (err) {
      opening.reason = String(err?.message ?? err);
    }
  } else {
    opening.reason = '?nointro';
  }

  const chargenParams = urlFor('chargen');
  rewrite(chargenParams);
  const { bootChargen } = await import('./chargen.js');
  const { character } = await bootChargen(canvas, renderer, chargenParams, status, source);

  // ── the cell it wakes you in ─────────────────────────────────────────────
  //
  // The new game's own cinematic has already played before the make; the cell now owes Ria's
  // `1400` speech over `VISION.FLC` (`game/storyScript.js`'s `dueCellDream`). Keep the
  // opening record across the scene handoff: the browser suites read it after the cell boots.
  window.__debug = window.__debug || {};
  window.__debug.opening = opening;

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
