// THE SCENE GALLERY — every movie the install ships, in one page.
//
// Arena's films are not all on the story's road: `WALK.FLC` is the attract-mode tour,
// `WARHAFT.FLC` is the cut floppy-release ending, `NUJAGDTH.FLC` and `NUKING.FLC` are the CD
// release's replacements, and `END02.FLC` is the other closing scene. The port used to leave
// them only to the `?cutscene=` dev door, which is a URL a player does not know. This page is
// the player's door: the title screen's **Scenes** button lists all seventeen with what each
// one is, and plays any of them in place. A cut scene is labelled as cut, never passed off as
// part of the run.
//
// It deliberately does not close the title screen: a player browses the films and comes back
// to the menu. `showMovie` puts its own full-screen layer above this page, and its skip key
// returns here, not to the game.

import { galleryEntries } from '../game/cinematics.js';

/** Tags that say why a movie is not in the canonical run. */
const TAGS = Object.freeze({
  'WARHAFT.FLC': 'cut',
  'NUKING.FLC': 'CD release',
  'NUJAGDTH.FLC': 'CD release',
  'END02.FLC': 'alternate close',
  'AFLC2.FLC': 'closing',
  'WALK.FLC': 'tour',
});

/** Escape a string for HTML text and attributes. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Open the gallery over the current page.
 *
 * @param {import('../arena/browserSource.js').ArenaSource|null} source
 * @param {{status?: (msg: string) => void, arenaPath?: string|null}} [opts]
 * @returns {{close: () => void, host: HTMLElement}|null}
 */
export function showCutsceneGallery(source, opts = {}) {
  const existing = document.getElementById('scenegallery');
  if (existing) return { close: () => existing.remove(), host: existing };

  const host = document.createElement('div');
  host.id = 'scenegallery';
  host.classList.add('on');
  const rows = galleryEntries().map((movie) => `
    <li>
      <button type="button" class="scene" data-file="${esc(movie.file)}">
        <span class="scene-title">${esc(movie.title)}</span>
        <span class="scene-file">${esc(movie.file)}${TAGS[movie.file] ? ` · ${esc(TAGS[movie.file])}` : ''}</span>
      </button>
      <p class="scene-note">${esc(movie.note)}</p>
    </li>`).join('');
  host.innerHTML = `
    <div class="panel">
      <p class="kicker">The install’s own films</p>
      <h1>Scenes</h1>
      <p class="sub">Every <code>.FLC</code> in your Arena folder, including the ones the main quest does not play: the CD release’s replacements, the alternate close, the walking tour and the cut Warhaft slide.</p>
      <ul class="scene-list">${rows}</ul>
      <div class="rows">
        <button type="button" id="scenegallery-close"><span class="key">Esc</span>Back to the title</button>
      </div>
      <p class="hint">Choose a film to play it; any key skips it and returns here.</p>
    </div>`;
  document.body.appendChild(host);

  const close = () => {
    host.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    // A movie is playing: `cutscenePlayer` owns Escape until its layer is gone.
    if (document.getElementById('cutscene')?.classList.contains('on')) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  window.addEventListener('keydown', onKey, true);
  host.querySelector('#scenegallery-close')?.addEventListener('click', close);

  for (const button of host.querySelectorAll('button.scene')) {
    button.addEventListener('click', async () => {
      const file = button.dataset.file;
      if (!file || button.disabled) return;
      button.disabled = true;
      button.classList.add('playing');
      try {
        const { showMovie } = await import('./cutscenePlayer.js');
        await showMovie(file, {
          source,
          arenaPath: source?.arenaPath ?? opts.arenaPath ?? null,
          status: opts.status,
        });
      } catch (err) {
        console.warn(`[scenes] ${file}: ${err?.message ?? err}`);
      } finally {
        button.disabled = false;
        button.classList.remove('playing');
      }
    });
  }
  return { close, host };
}
