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
// Arena's data is read at runtime from a folder the *player* picks; nothing is
// bundled with the game. See docs/DECISIONS.md D9 and docs/ARCHITECTURE.md §1.

import { Renderer } from './engine/render/renderer.js';
import { crashText } from './engine/ui/crashText.js';
import { loadCharacter } from './game/save.js';

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
            // Nobody has a character until creation has happened, and creation is a
            // page of its own: it needs the same data source.
            if (needsCharacter(params)) {
              const { bootChargen } = await import('./scenes/chargen.js');
              // Creation resolves in this page, and the scene the player asked for is
              // booted with the folder they just picked still open.
              await bootChargen(canvas, renderer, params, status, source);
              if (isGameStart(params)) await showOpening(status, params, source);
              await run(canvas, renderer, destinationParams(params), status, source);
            } else {
              if (isGameStart(params)) await showOpening(status, params, source);
              await run(canvas, renderer, params, status, source);
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
 * Is this a person **starting the game**, or a scene named on the URL?
 *
 * Arena greets a new game with its own opening movie (`INTRO.FLC`), and this is where that
 * belongs: after a character exists or has just been made, and only when the URL did not name
 * a scene of its own. `?interior=START.MIF` is a deep link (and every suite uses one), so
 * playing a 1994 movie in front of it would break the request rather than honour the game.
 * `?nointro` is the player's own escape from it, and `?cutscene=INTRO.FLC` plays it on demand.
 *
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
function isGameStart(params) {
  return !asksForScene(params) && !params.has('chargen') && !params.has('nomake') && !params.has('nointro');
}

/**
 * The opening movie, **once per session** — the same law the fanfare walks (`game/fanfare.js`):
 * a page per level means a scene swap would otherwise replay a two-minute movie, while an
 * ordinary reload of the page still starts a new session and still greets the player.
 *
 * @param {(m: string) => void} status
 * @param {URLSearchParams} params
 * @param {import('./arena/browserSource.js').ArenaSource|null} source
 */
async function showOpening(status, params, source) {
  const GREETED = 'pa.intro.greeted';
  try {
    if (sessionStorage.getItem(GREETED) === '1') {
      window.__debug.opening = { skipped: 'this session has already seen the opening' };
      return null;
    }
  } catch { /* no storage: the opening is offered every boot, which is the honest default */ }
  try {
    const { showMovie } = await import('./scenes/cutscenePlayer.js');
    const played = await showMovie('INTRO.FLC', {
      source,
      arenaPath: params.get('arena') || null,
      status,
    });
    window.__debug.opening = { ...played.state, played: played.played, skipped: played.skipped };
    try { sessionStorage.setItem(GREETED, '1'); } catch { /* private mode */ }
    return played;
  } catch (err) {
    // A movie is never a dependency: the game starts with or without it.
    window.__debug.opening = { error: String(err?.message ?? err) };
    return null;
  }
}

/**
 * Does this URL name a scene of its own?
 *
 * Used by the dev door, which boots creation only when the page asked for *nothing*: a URL
 * like `?interior=START.MIF` is a request to stand in that dungeon, and booting a character
 * creation screen in front of it would break every scripted run and every deep link.
 *
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
function asksForScene(params) {
  return ['map', 'worldmap', 'location', 'dungeon', 'dungeonSeed', 'interior', 'mif', 'city', 'wild', 'at', 'enter', 'level', 'cutscene', 'movie']
    .some((key) => params.has(key));
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
 * Where the player goes once creation is over: the scene the URL asked for, or the
 * world map when it asked for nothing in particular.
 *
 * Creation is not a destination, so its own parameters are dropped — `chargen`,
 * `nomake`, the creation `seed`, a forced `class` — and the rest of the URL's
 * intent (`location`, `dungeon`, `city`, `interior`, `test`) is carried through.
 * Driving the destination from here, rather than navigating to it, is what keeps a
 * hand-picked Arena folder alive across creation (see `leave` in `scenes/chargen.js`).
 *
 * @param {URLSearchParams} params
 * @returns {URLSearchParams}
 */
function destinationParams(params) {
  const out = new URLSearchParams(params);
  for (const key of ['chargen', 'nomake', 'seed', 'class', 'back']) out.delete(key);
  const scenes = ['map', 'worldmap', 'location', 'dungeon', 'interior', 'city'];
  if (!scenes.some((key) => out.has(key))) out.set('map', '');
  return out;
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
    // The dev door is for a named scene, so creation happens here when the page asks for
    // it (`?chargen`) — **or when it asks for nothing at all**, which is the case a launch
    // through `tools/launch.mjs` produces: `?arena=<folder>` and no scene. That used to drop
    // the player into `START.MIF` with no character, which is not a game. It now goes through
    // creation and out to the world map, exactly as a picked folder does.
    if (params.has('chargen') || (!asksForScene(params) && needsCharacter(params))) {
      const { bootChargen } = await import('./scenes/chargen.js');
      await bootChargen(canvas, renderer, params, status, source);
      // …and then the game's own opening, for a person who just started playing. A `?chargen`
      // URL is a dev door (its own suite drives it), so it is asked for by name, not given.
      if (isGameStart(params)) await showOpening(status, params, source);
      await run(canvas, renderer, destinationParams(params), status, source);
      document.getElementById('boot')?.classList.add('hidden');
      window.__ready = true;
      return;
    }
    await run(canvas, renderer, params, status, source);
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
