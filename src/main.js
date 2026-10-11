// PERFECTARENA entry point.
//
// Hand-rolled WebGL2, no framework — the same doctrine as the engine this is
// built on. Scenes are dynamic imports, so the boot only pays for what it
// enters:
//
//   ?test        the Milestone 2 test courtyard (the default until Milestone 3)
//   ?city=<NAME> Arena city/town/village            (Milestone 3)
//   ?dungeon=<N> Arena dungeon                      (Milestone 3)
//   ?wild        Arena wilderness                   (Milestone 5)
//   ?world       the continental world map          (Milestone 5)
//   ?shot        a fixed vantage for the headless screenshot test
//
// Arena's data is read at runtime from a folder the *player* picks; nothing is
// bundled. See docs/DECISIONS.md.

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

function overlay(text, { button = null } = {}) {
  const el = document.getElementById('boot');
  if (!el) { document.body.textContent = text; return; }
  el.classList.remove('hidden');
  el.textContent = text;
  if (button) {
    const b = document.createElement('button');
    b.textContent = button.label;
    b.onclick = button.onClick;
    el.appendChild(document.createElement('br'));
    el.appendChild(b);
  }
}

async function boot() {
  const errors = installErrorTrap();
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
  if (typeof window !== 'undefined') window.__debug.renderer = renderer;

  // Milestone 2 is the only scene; Arena scenes arrive with Milestone 3 and are
  // routed here by the same shape.
  const { bootTestMap } = await import('./scenes/testmap.js');
  await bootTestMap(canvas, renderer, params, status);

  document.getElementById('boot')?.classList.add('hidden');
  if (typeof window !== 'undefined') window.__ready = true;
}

boot().catch((err) => {
  console.error(err);
  overlay(`boot failed:\n${err?.message ?? err}`);
  if (typeof window !== 'undefined') window.__bootError = String(err?.stack ?? err);
});
