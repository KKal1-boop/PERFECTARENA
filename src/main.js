// PERFECTARENA entry point.
//
// Hand-rolled WebGL2, no framework — the same doctrine as the engine this is built
// on. Scenes are dynamic imports, so boot only pays for what it enters:
//
//   ?interior=START.MIF   walk a real Arena interior            (Milestone 3)
//   ?interior=CAS.MIF&level=1   a specific level of that file
//   ?arena=<folder>       read Arena's data from the dev server  (tests, dev)
//   ?test                 the hand-made courtyard from Milestone 2
//   ?city / ?wild / ?world   Arena cities, wilderness, world map (Milestones 4–5)
//   ?shot                 a fixed vantage, for the screenshot tests
//
// Arena's data is read at runtime from a folder the *player* picks; nothing is
// bundled with the game. See docs/DECISIONS.md D9 and docs/ARCHITECTURE.md §1.

import { Renderer } from './engine/render/renderer.js';
import { crashText } from './engine/ui/crashText.js';

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
  const { bootInterior } = await import('./scenes/interior.js');

  overlay('PERFECTARENA needs your Arena folder to read its maps, textures and text.\n'
    + 'Pick the folder that contains GLOBAL.BSA (usually called ARENA).\n'
    + 'Nothing is uploaded and nothing is copied — the data is read in place.',
  {
    button: {
      label: 'Choose Arena folder',
      onClick: async () => {
        try {
          const source = await pickArenaFolder({ onProgress: status });
          if (!source) { overlay('No folder chosen. Reload to try again.'); return; }
          window.__debug.arenaSource = source.label;
          await run(canvas, renderer, params, status, source);
        } catch (err) {
          console.error(err);
          overlay(`Could not read that folder:\n${err?.message ?? err}`, { button: { label: 'Try again', onClick: () => location.reload() } });
        }
      },
    },
  });
}

/**
 * Boot the requested scene with a known data source.
 * @param {HTMLCanvasElement} canvas @param {Renderer} renderer
 * @param {URLSearchParams} params @param {(m:string)=>void} status
 * @param {import('./arena/arenaData.js').ArenaSource} source
 */
async function run(canvas, renderer, params, status, source) {
  const { bootInterior } = await import('./scenes/interior.js');
  await bootInterior(canvas, renderer, params, status, source);
  document.getElementById('boot')?.classList.add('hidden');
}

async function boot() {
  installErrorTrap();
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
