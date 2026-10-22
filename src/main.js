// PERFECTARENA entry point.
//
// Hand-rolled WebGL2, no framework — the same doctrine as the engine this is built
// on. Scenes are dynamic imports, so boot only pays for what it enters:
//
//   ?chargen              character creation; on finishing, the scene below is
//                         booted in the same page (the player's Arena folder cannot
//                         survive a navigation)
//   ?map                  the world map of all Tamriel, and fast travel
//   ?location=<name>      travel to a named Arena settlement, e.g. ?location=Daggerfall
//   ?dungeon=<name>       travel to a named Arena dungeon, e.g. ?dungeon=Fang Lair
//   ?interior=START.MIF   walk a real Arena interior            (Milestone 3)
//   ?interior=CAS.MIF&level=1   a specific level of that file
//   ?city / ?city=town    a generated Arena settlement           (Milestone 4)
//   ?arena=<folder>       read Arena's data from the dev server  (tests, dev)
//   ?test                 the hand-made courtyard from Milestone 2
//   ?shot                 a fixed vantage, for the screenshot tests
//
// A URL that asks for **nothing** opens Arena's **start menu** — the install's title screen,
// Continue or New Game (`scenes/startMenu.js`). New Game is Arena's own first ten minutes:
// creation, the king's betrayal (`INTRO.FLC`), and a locked cell in the Imperial Dungeons
// where Ria Silmane explains what happened (`game/startFlow.js`, `game/storyScript.js`). A URL
// that names a scene is a deep link and is taken at its word.
//
// Arena's data is read at runtime from a folder the *player* picks; nothing is
// bundled with the game. See docs/DECISIONS.md D9 and docs/ARCHITECTURE.md §1.

import { Renderer } from './engine/render/renderer.js';
import { crashText } from './engine/ui/crashText.js';
import { loadCharacter, loadLastLocation, loadQuestState, markCellDreamPending } from './game/save.js';
import { CELL_DREAM } from './game/storyScript.js';
// Where a game begins — the opening movie, then the Imperial Dungeons. The law is a module
// of its own (`game/startFlow.js`) so it can be tested without a renderer; this file only
// boots what it decides.
import { destinationParams, isGameStart, resumeParams } from './game/startFlow.js';

/** Every uncaught error and console error the page produces, for the tests. */
function installErrorTrap() {
  /** @type {string[]} */
  const errors = [];
  if (typeof window !== 'undefined') {
    window.__debug = window.__debug || {};
    window.__debug.pageErrors = errors;
  }
  addEventListener('error', (e) => errors.push(crashText(e.error, e) || e.message));
  addEventListener('unhandledrejection', (e) => errors.push(`unhandled rejection: ${crashText(e.reason)}`));
  const realError = console.error.bind(console);
  console.error = (...args) => {
    errors.push(args.map((a) => (a && a.stack) || String(a)).join(' '));
    realError(...args);
  };
  return errors;
}

/** Put a message (and optionally a button) on the boot overlay. */
function overlay(text, { button = null } = {}) {
  const el = document.getElementById('boot');
  if (!el) { document.body.textContent = text; return; }
  el.textContent = text;
  el.classList.remove('hidden');
  if (button) {
    const b = document.createElement('button');
    b.textContent = button.label;
    b.onclick = button.onClick;
    el.appendChild(document.createElement('br'));
    el.appendChild(b);
  }
}

/**
 * Ask for the player's Arena folder and boot an interior from it.
 * @param {HTMLCanvasElement} canvas @param {Renderer} renderer
 * @param {URLSearchParams} params @param {(m:string)=>void} status
 */
async function bootFromPickedFolder(canvas, renderer, params, status) {
  const { pickArenaFolder } = await import('./arena/browserSource.js');

  // Asking for the folder is its own little loop, so a dismissed dialog is answered by
  // *offering the picker again* rather than by a dead end. The first version told the
  // player to reload the page — and its picker resolved with `null` a second after it
  // opened, so reloading did not help either (see `pickArenaFolder`).
  const ask = () => {
    overlay('PERFECTARENA needs your Arena folder to read its maps, textures and text.\n'
      + 'Pick the folder that contains GLOBAL.BSA (usually called ARENA).\n'
      + 'Nothing is uploaded and nothing is copied — the data is read in place.',
    {
      button: {
        label: 'Choose Arena folder',
        onClick: async () => {
          let source;
          try {
            source = await pickArenaFolder({ onProgress: status });
          } catch (err) {
            console.error(err);
            overlay(`Could not open the folder picker:\n${err?.message ?? err}`, { button: { label: 'Try again', onClick: ask } });
            return;
          }
          if (!source) {
            overlay('No folder chosen.\nChoose the folder that contains GLOBAL.BSA (usually called ARENA).',
              { button: { label: 'Choose Arena folder', onClick: ask } });
            return;
          }
          window.__debug.arenaSource = source.label;
          try {
            if (isGameStart(params)) {
              // A plain launch is the **start menu**: Arena's title screen, with Continue and
              // New Game. New Game runs creation, the king's betrayal and the cell; Continue
              // resumes the save's own last place (`game/startFlow.js`'s `resumeParams`).
              await gameStart(canvas, renderer, params, status, source);
            } else if (needsCharacter(params)) {
              // A deep link that asks for a scene, from a browser with no character: creation
              // resolves in this page so the folder the player just picked still answers.
              const { bootChargen } = await import('./scenes/chargen.js');
              await bootChargen(canvas, renderer, params, status, source);
              await run(canvas, renderer, destinationParams(params, { fresh: true }), status, source);
            } else {
              await run(canvas, renderer, destinationParams(params, { fresh: false }), status, source);
            }
            document.getElementById('boot')?.classList.add('hidden');
            window.__ready = true;
          } catch (err) {
            console.error(err);
            overlay(`Could not read that folder:\n${err?.message ?? err}`, { button: { label: 'Choose a different folder', onClick: ask } });
          }
        },
      },
    });
  };
  ask();
}

/**
 * Boot the requested scene with a known data source.
 * @param {HTMLCanvasElement} canvas @param {Renderer} renderer
 * @param {URLSearchParams} params @param {(m:string)=>void} status
 * @param {import('./arena/arenaData.js').ArenaSource} source
 */
async function run(canvas, renderer, params, status, source) {
  // A cutscene is a scene of its own: the install's own `.FLC` movie, played on
  // its own clock with no world behind it (`?cutscene=INTRO.FLC`, or `?cutscene`
  // for the opening the original greets a new game with).
  if (params.has('cutscene') || params.has('movie')) {
    const { bootCutscene } = await import('./scenes/cutscenePlayer.js');
    await bootCutscene(canvas, renderer, params, status, source);
    document.getElementById('boot')?.classList.add('hidden');
    return;
  }
  // The world map is its own scene: it is a UI, not a first-person view, and it
  // owns the whole screen while it is up.
  if (params.has('map') || params.has('worldmap')) {
    const { bootWorldMap } = await import('./scenes/worldmap.js');
    await bootWorldMap(canvas, renderer, params, status, source);
    document.getElementById('boot')?.classList.add('hidden');
    return;
  }
  const { bootInterior } = await import('./scenes/interior.js');
  await bootInterior(canvas, renderer, params, status, source);
  document.getElementById('boot')?.classList.add('hidden');
}

/**
 * A game start, in Arena's order: the start-up cards, the **title screen**, and the player's
 * choice. New Game is the real new-game flow (`scenes/newGame.js`: creation → `INTRO.FLC`, the
 * king's betrayal → the cell); Continue resumes the save's own last place. A `?menu` URL is the
 * dev door to the menu alone.
 *
 * @param {HTMLCanvasElement} canvas @param {object} renderer
 * @param {URLSearchParams} params @param {(m:string)=>void} status
 * @param {import('./arena/browserSource.js').ArenaSource} source
 */
async function gameStart(canvas, renderer, params, status, source) {
  // `?menu` is the dev door to the title screen alone, with no cards in front of it.
  if (!params.has('menu')) await showStartup(status, params, source);
  const { showStartMenu } = await import('./scenes/startMenu.js');
  const choice = await showStartMenu(source, { status, hasSave: Boolean(loadCharacter()) });
  window.__debug.startChoice = choice;
  if (choice === 'new') {
    const { beginNewGame } = await import('./scenes/newGame.js');
    return await beginNewGame({ canvas, renderer, status, source, params });
  }
  if (choice === 'continue') {
    // **An older save that never heard her is owed the explanation once.** The ledger is the
    // save's own (`dreamsSeen`); the handshake tells the next level boot to play it
    // (`game/storyScript.js`'s `dueCellDream`).
    const quest = loadQuestState();
    if (!(Array.isArray(quest.dreamsSeen) && quest.dreamsSeen.includes(CELL_DREAM))) markCellDreamPending();
    const dest = resumeParams(params, loadLastLocation());
    // The URL names where the player actually is, as every in-place scene change does, so a
    // reload continues instead of returning to the title screen.
    try {
      history.replaceState(history.state ?? null, '', `${location.pathname}?${dest.toString()}${location.hash ?? ''}`);
    } catch { /* a page that cannot rewrite its URL still continues */ }
    await run(canvas, renderer, dest, status, source);
    return { ok: true };
  }
  overlay('The gate is closed.\nReload the page to return to it.');
  return { ok: false, why: 'quit' };
}

/**
 * The **start-up** cinematics, once per session: the title and quote cards, the scroll movie and
 * its three pictures (`game/cutscene.js`'s `STARTUP_STEPS`, OpenTESArena's `IntroUiMVC` order).
 * A skip ends the cards only — never the story, which is exactly the bug this split removes: the
 * king's betrayal and Ria's explanation are their own beats, played when the game begins.
 *
 * @param {(m: string) => void} status
 * @param {URLSearchParams} params
 * @param {import('./arena/browserSource.js').ArenaSource|null} source
 */
async function showStartup(status, params, source) {
  const SEEN = 'pa.startup.seen';
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN) === '1'; } catch { /* no storage: show them */ }
  if (seen) {
    window.__debug.startup = { skipped: 'this session has seen the start-up' };
    return null;
  }
  const arenaPath = params.get('arena') || null;
  const steps = [];
  let played = { played: false, skipped: false, steps };
  try {
    const { showMovie, showStill } = await import('./scenes/cutscenePlayer.js');
    const { STARTUP_STEPS } = await import('./game/cutscene.js');
    for (const step of STARTUP_STEPS) {
      let result;
      try {
        result = step.kind === 'still'
          ? await showStill(step.file, { source, arenaPath, status, seconds: step.seconds, paletteFile: step.paletteFile })
          : await showMovie(step.file, { source, arenaPath, status });
      } catch (err) {
        result = { played: false, skipped: false, state: { error: String(err?.message ?? err) } };
      }
      steps.push({ file: step.file, played: result.played, skipped: result.skipped });
      if (result.skipped) break;
    }
    played = { played: steps.some((s) => s.played), skipped: steps.some((s) => s.skipped), steps };
  } catch (err) {
    // A movie is never a dependency: the menu appears with or without it.
    played = { error: String(err?.message ?? err), steps };
  }
  window.__debug.startup = played;
  try { sessionStorage.setItem(SEEN, '1'); } catch { /* private mode */ }
  return played;
}

/**
 * Creation is the player's first page: a folder has been chosen, but nobody has
 * been made yet. The hand-made courtyard is the exception — it is a renderer
 * regression test and needs no one to be anybody.
 *
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
function needsCharacter(params) {
  if (params.has('test')) return false;
  return !loadCharacter();
}

/**
 * Count the documents this tab has loaded — the audit's own instrument (S-E).
 *
 * A place in this port is a page load (see the header's note on `?location=` and S35 in
 * `docs/PROGRESS.md`): walking through a city gate, a shop door or a dungeon stair assigns
 * `location.href`, so **nothing in memory survives it** — which is why the world is kept in a
 * save file rather than in a live object, and why a probe that means to measure "is the world
 * persistent and seamless?" needs this number. `sessionStorage` is per tab and survives
 * navigations, so a document can answer "how many page loads did this session cost?" — and it
 * is read from the page rather than counted by the test, because a test that counts its own
 * `goto()` calls is counting itself, not the game.
 *
 * `navigations` is 0 in the first document of a tab and +1 per page load after it, so P3 (the
 * seamless world runtime) is done when a scripted city → country → shop → dungeon walk leaves
 * it exactly where it started.
 */
function installPageLoadCounter() {
  let boots = null;
  try {
    boots = Number(sessionStorage.getItem(BOOTS_KEY) || 0) + 1;
    sessionStorage.setItem(BOOTS_KEY, String(boots));
  } catch { /* a browser with storage switched off still boots; the counter reads null */ }
  window.__debug.boots = boots;
  window.__debug.navigations = boots === null || !Number.isFinite(boots) ? null : boots - 1;
}

/** One per tab: how many documents this tab has loaded (`installPageLoadCounter`). */
const BOOTS_KEY = 'arena.boots';

async function boot() {
  installErrorTrap();
  installPageLoadCounter();
  const canvas = document.getElementById('c');
  const params = new URLSearchParams(location.search);
  const status = (msg) => { document.title = `PERFECTARENA — ${msg}`; };

  let renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (err) {
    overlay(`PERFECTARENA needs WebGL2.\n${err.message}`);
    throw err;
  }
  window.__debug.renderer = renderer;

  // Milestone 2's courtyard stays reachable: it needs no Arena data, so it is the
  // fallback when a renderer regression is suspected.
  if (params.has('test')) {
    const { bootTestMap } = await import('./scenes/testmap.js');
    await bootTestMap(canvas, renderer, params, status);
    document.getElementById('boot')?.classList.add('hidden');
    window.__ready = true;
    return;
  }

  // The dev/test door: read Arena's data over HTTP from this project's server.
  const arenaPath = params.get('arena');
  if (arenaPath) {
    const { localServerSource } = await import('./arena/browserSource.js');
    const source = localServerSource(arenaPath);
    window.__debug.arenaSource = source.label;
    // A launch through `tools/launch.mjs` is `?arena=<folder>` and no scene: the start menu,
    // exactly as a picked folder gets (`scenes/startMenu.js`). `?chargen` is a dev door and is
    // taken by name, without the menu, so its suite drives creation directly.
    if (isGameStart(params)) {
      await gameStart(canvas, renderer, params, status, source);
      document.getElementById('boot')?.classList.add('hidden');
      window.__ready = true;
      return;
    }
    if (params.has('chargen')) {
      const { bootChargen } = await import('./scenes/chargen.js');
      await bootChargen(canvas, renderer, params, status, source);
      await run(canvas, renderer, destinationParams(params, { fresh: true }), status, source);
      document.getElementById('boot')?.classList.add('hidden');
      window.__ready = true;
      return;
    }
    await run(canvas, renderer, params, status, source);
    window.__ready = true;
    return;
  }

  // **The page's own server first** — a phone cannot pick a folder (`servedArenaSource`),
  // and a checkout served by `tools/serve.mjs` already has Arena mounted beside the page.
  // A page anywhere else gets `null`, and the picker below is the shipping path as before.
  const { servedArenaSource } = await import('./arena/browserSource.js');
  const served = await servedArenaSource();
  if (served) {
    window.__debug.arenaSource = served.label;
    if (isGameStart(params)) {
      await gameStart(canvas, renderer, params, status, served);
      document.getElementById('boot')?.classList.add('hidden');
      window.__ready = true;
      return;
    }
    if (params.has('chargen')) {
      const { bootChargen } = await import('./scenes/chargen.js');
      await bootChargen(canvas, renderer, params, status, served);
      await run(canvas, renderer, destinationParams(params, { fresh: true }), status, served);
      document.getElementById('boot')?.classList.add('hidden');
      window.__ready = true;
      return;
    }
    await run(canvas, renderer, params, status, served);
    window.__ready = true;
    return;
  }

  // The shipping path: the player picks their own folder.
  await bootFromPickedFolder(canvas, renderer, params, status);
}

boot().catch((err) => {
  console.error(err);
  overlay(`boot failed:\n${err?.message ?? err}`);
  window.__bootError = String(err?.stack ?? err);
});
