// ARENA'S START MENU — the title screen a player is greeted by before the game begins.
//
// The original opens on its own title art with a menu: continue the character you already
// have, or begin again. This port had no such screen: a plain launch went straight from the
// Arena folder to character creation or to the world map, which is why the owner reported
// *"there is no start menu also in perfectarena and there should be"* (2026-10-21).
//
// What it is, and what it deliberately is not:
//
//   * **the install's own art** — `TITLE.IMG`, the same 320×200 picture the start-up cards use,
//     drawn at whole-number scale with smoothing off, exactly as every other original picture
//     is (`scenes/cutscenePlayer.js`'s `showStill`).
//   * **CONTINUE** resumes the saved character: the last place they stood
//     (`game/save.js`'s `loadLastLocation`), or the world map when they have not stood anywhere
//     yet. It is disabled — and says so — when there is no character.
//   * **NEW GAME** runs the real new-game flow (`scenes/newGame.js`): the save is cleared,
//     the opening scroll and the nine-panel history play (`game/cutscene.js`'s
//     `NEW_GAME_STEPS`), creation opens in this page (a picked folder cannot survive a
//     navigation), and the player wakes in the cell with Ria's explanation owed
//     (`game/storyScript.js`'s `dueCellDream`).
//
// The screen is DOM, like the pause menu and the creator, because those already prove the
// game's UI law: panels are DOM, the world is GL, and a menu is a panel. It takes the keyboard
// while it is up and hands it back when it closes, so a key pressed on the menu can never also
// be the first step of the game.

import { ArenaData } from '../arena/arenaData.js';
import { toRgba } from '../arena/palette.js';
import { loadArenaGui } from '../game/arenaGui.js';

/**
 * Show the title screen and wait for a choice.
 *
 * @param {import('../arena/browserSource.js').ArenaSource} source the Arena folder already open
 * @param {{status?: (msg: string) => void, hasSave?: boolean}} [opts]
 * @returns {Promise<'new'|'continue'|'quit'>}
 */
export async function showStartMenu(source, opts = {}) {
  const status = opts.status ?? (() => {});
  const hasSave = Boolean(opts.hasSave);

  const host = document.createElement('div');
  host.id = 'startmenu';
  host.classList.add('on');
  host.innerHTML = `
    <canvas id="startmenu-art" width="320" height="200"></canvas>
    <div class="panel">
      <div class="rows" role="menu" aria-label="Arena">
        <button type="button" class="choice" data-action="continue" ${hasSave ? '' : 'disabled'}>
          <span class="key">C</span>Continue
          <span class="tag">${hasSave ? 'the character you have' : 'no character saved'}</span>
        </button>
        <button type="button" class="choice" data-action="new">
          <span class="key">N</span>New Game
          <span class="tag">a prisoner in the Imperial Dungeons</span>
        </button>
      </div>
      <p class="hint">↑ ↓ choose · Enter accept · or click</p>
      <p class="folder">Arena data: ${escapeHtml(String(source?.label ?? 'not chosen'))}</p>
    </div>`;
  document.body.appendChild(host);
  document.getElementById('boot')?.classList.add('hidden');

  // **The install's own title art**, behind the panel. A missing picture is not a failure: the
  // menu is readable over the plain background, and the game still starts.
  try {
    status('title');
    const data = new ArenaData(source);
    // **The title screen is a page too**, so it wears the same kit the game's pages do: the
    // scroll's frame, the inks, the ornament. Without this the panel has a 21 px scroll border
    // and no scroll to draw in it — which is the tan slab the owner saw on the title screen
    // (*"you also bugged the start new game main title menu"*). It is fire-and-forget because
    // the picture below is what this screen cannot work without, and the kit is not.
    void loadArenaGui(data);
    const image = await data.img('TITLE.IMG');
    const palette = image.palette ?? (await data.img('TITLE.IMG')).palette;
    if (palette) {
      const canvas = host.querySelector('#startmenu-art');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const rgba = toRgba(image.indices, palette, { width: image.width, height: image.height });
      ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
      host.classList.add('art');
    }
  } catch (err) {
    console.warn(`[start menu] no TITLE.IMG: ${String(err?.message ?? err)}`);
  }

  const buttons = [...host.querySelectorAll('button.choice')];
  let index = buttons.findIndex((b) => !b.disabled);
  if (index < 0) index = 0;
  const mark = () => buttons.forEach((b, i) => b.classList.toggle('on', i === index));

  return await new Promise((resolve) => {
    let settled = false;
    const choose = (action) => {
      if (settled) return false;
      if (action === 'continue' && !hasSave) return false;
      settled = true;
      window.removeEventListener('keydown', onKey, true);
      host.remove();
      delete window.__debug.startMenu;
      status(`start menu: ${action}`);
      resolve(action);
      return true;
    };
    const onKey = (event) => {
      const key = event.key;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        if (!buttons.length) return;
        const step = key === 'ArrowDown' ? 1 : -1;
        for (let i = 0; i < buttons.length; i++) {
          index = (index + step + buttons.length) % buttons.length;
          if (!buttons[index].disabled) break;
        }
        mark();
        return;
      }
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        const chosen = buttons[index];
        if (chosen && !chosen.disabled) choose(chosen.dataset.action);
        return;
      }
      const lower = String(key).toLowerCase();
      if (lower === 'c' && hasSave) { choose('continue'); return; }
      if (lower === 'n') choose('new');
    };
    for (const button of buttons) {
      button.addEventListener('click', () => choose(button.dataset.action));
      button.addEventListener('pointerenter', () => { index = buttons.indexOf(button); mark(); });
    }
    mark();
    window.addEventListener('keydown', onKey, true);
    /** The seam a scripted run drives, exactly as a click does. */
    window.__debug = window.__debug || {};
    window.__debug.startMenu = {
      open: true,
      hasSave,
      options: buttons.map((b) => ({ action: b.dataset.action, disabled: b.disabled })),
      choose,
    };
  });
}

/** The folder label is a path, not markup. */
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
