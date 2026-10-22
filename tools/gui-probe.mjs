// WHAT THE INTERFACE IS WEARING.
//
//   node tools/gui-probe.mjs
//
// Boots the game in the headless browser and reports, from the live page, whether
// `game/arenaGui.js` found the install's own paintings, which of them reached the CSS, whether
// the status bar and the hotbar actually draw those pictures, and what the ten cells hold.
// It is the bench check for the GUI — `tests/run-browser.mjs`'s suites cover the game.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../tests/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.GUI_PORT || 0);

const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs'), String(PORT)], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
});
const base = await new Promise((resolve, reject) => {
  let text = '';
  const timer = setTimeout(() => reject(new Error(`server did not start: ${text}`)), 15000);
  server.stdout.on('data', (chunk) => {
    text += String(chunk);
    const match = /https?:\/\/[^\s]+/.exec(text);
    if (match) { clearTimeout(timer); resolve(match[0].replace(/\/$/, '')); }
  });
  server.stderr.on('data', (chunk) => { text += String(chunk); });
});

const page = await launch({ width: 1280, height: 800 });
try {
  const arena = process.env.ARENA_PATH
    || path.resolve(ROOT, '..', 'arena', 'ARENA');
  await page.goto(`${base}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`);
  await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { timeoutMs: 60000 });
  const report = await page.evalJs(`(() => {
    const css = getComputedStyle(document.documentElement);
    const bar = document.getElementById('statusbar');
    const barStyle = bar ? getComputedStyle(bar) : null;
    const hud = document.getElementById('hud');
    const cells = [...document.querySelectorAll('#hotbar .hb-cell')];
    return {
      gui: window.__debug.gui(),
      vars: ['--ar-status','--ar-command','--ar-parchment','--ar-frame','--ar-compass']
        .map((name) => [name, (css.getPropertyValue(name) || '').slice(0, 24)]),
      bar: barStyle ? { height: barStyle.height, image: barStyle.backgroundImage.slice(0, 30) } : null,
      hud: hud ? { background: getComputedStyle(hud).backgroundImage.slice(0, 30), ink: getComputedStyle(hud).color } : null,
      hotbar: cells.map((cell) => ({
        key: cell.querySelector('.hb-key')?.textContent ?? '',
        label: cell.querySelector('.hb-label')?.textContent ?? '',
        art: (cell.querySelector('.hb-art')?.style.backgroundImage ?? '').slice(0, 22),
        pinned: cell.classList.contains('pinned'),
      })),
      status: {
        health: document.getElementById('sb-health')?.textContent ?? null,
        spell: document.getElementById('sb-spell')?.textContent ?? null,
        gold: document.getElementById('sb-gold')?.textContent ?? null,
        level: document.getElementById('sb-level')?.textContent ?? null,
      },
      touch: Boolean(document.getElementById('touchcontrols')),
    };
  })()`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close?.();
  server.kill();
}
