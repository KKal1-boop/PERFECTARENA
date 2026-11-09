// THE LOGBOOK PANEL — the player's own page, in the interface's parchment language.
//
// `game/logbook.js` is the record; this is the page it is read on. It is deliberately a
// **DOM page**, like the pack, the spellbook and the map: the world is GL and every surface a
// player reads is a sheet of Arena's own paper (`index.html`'s `--gk-scroll`).
//
// The page answers four questions at once, which is what Daggerfall's logbook is for:
//
//   * **What is owed** — the main quest's current objective, and the side job if one is held.
//   * **The road so far** — the quest's own `log`, newest first.
//   * **Places seen** — the stage titles the save has visited.
//   * **Notes** — the player's own words, with the day, hour and place they were written,
//     and a Forget button each. The form is a real `<form>` so Enter submits and a phone's
//     keyboard has a Done.
//
// All text is escaped. The model is plain data passed in by `scenes/interior.js`.

import { formatLogbookStamp, newestEntries } from '../game/logbook.js';

/** Escape text for HTML, including quotes, so it is safe in an attribute too. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The page's markup.
 *
 * @param {object} model
 * @param {object} [model.quest]
 * @param {{stages?: object[]}} [model.chain]
 * @param {object|null} [model.radiant]
 * @param {object} [model.player]
 * @param {string|null} [model.place]
 * @param {number} [model.day]
 * @param {number} [model.hour]
 * @param {string} [model.objective]
 * @param {string|null} [model.job]
 * @param {object[]} [model.notes]
 * @returns {string}
 */
export function logbookMarkup(model = {}) {
  const quest = model.quest ?? {};
  const chain = model.chain ?? { stages: [] };
  const player = model.player ?? {};
  const notes = Array.isArray(model.notes) ? model.notes : [];
  const entries = newestEntries(quest, 16);
  const visited = Array.isArray(quest.visited) ? quest.visited.slice(-12).reverse() : [];
  const stage = chain.stages?.[quest.step] ?? null;
  const day = Math.max(0, Math.trunc(Number(model.day) || 0));
  const hour = Math.max(0, Math.min(23, Math.trunc(Number(model.hour) || 0)));
  const who = String(player.name ?? 'The prisoner').trim() || 'The prisoner';
  const level = Math.max(1, Math.trunc(Number(player.level) || 1));
  const place = String(model.place ?? '').trim();
  const objective = String(model.objective ?? '').trim();
  const job = String(model.job ?? '').trim();
  const pieces = Math.max(0, Math.min(8, Math.trunc(Number(quest.pieces) || 0)));

  return `
    <h2>The Logbook</h2>
    <p class="sub">${esc(who)} · level ${level} · day ${day + 1}, ${String(hour).padStart(2, '0')}:00${place ? ` · ${esc(place)}` : ''}</p>

    <div class="lb-block">
      <h3>What is owed</h3>
      <p class="lb-objective">${esc(objective || 'Nothing is owed but the road ahead.')}</p>
      <p class="lb-detail">${pieces} of 8 Staff pieces${stage ? ` · ${esc(stage.title)}` : ''}</p>
      ${job ? `<p class="lb-job"><b>Job:</b> ${esc(job)}</p>` : ''}
    </div>

    <div class="lb-block">
      <h3>The road so far</h3>
      ${entries.length
        ? `<ul class="lb-journal">${entries.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
        : '<p class="hint">The journal is empty. The first entry is written when the quest begins.</p>'}
    </div>

    <div class="lb-block">
      <h3>Places seen</h3>
      ${visited.length
        ? `<p class="lb-visited">${visited.map((name) => `<span>${esc(name)}</span>`).join(' · ')}</p>`
        : '<p class="hint">No place has been entered yet.</p>'}
    </div>

    <div class="lb-block">
      <h3>Notes</h3>
      ${notes.length
        ? `<ul class="lb-notes">${notes.map((note) => `
            <li>
              <p class="lb-note-text">${esc(note.text)}</p>
              <p class="lb-note-stamp">${esc(formatLogbookStamp(note))}</p>
              <button type="button" class="lb-forget" data-note-id="${esc(note.id)}">Forget</button>
            </li>`).join('')}</ul>`
        : '<p class="hint">No notes yet. A name, a gate, a riddle’s answer — write it here and it stays with this character.</p>'}
      <form id="logbook-note" autocomplete="off">
        <label for="logbook-note-field">Write a note</label>
        <div class="lb-row">
          <input id="logbook-note-field" name="note" type="text" maxlength="240" placeholder="What must you remember?" />
          <button type="submit">Add</button>
        </div>
      </form>
    </div>

    <p class="hint">J or Escape closes · the pack is I · the spellbook is C · the map is M</p>`;
}

/**
 * Put the page into an element and wire its form and Forget buttons.
 *
 * @param {HTMLElement} el
 * @param {object} model
 * @param {{onAdd?: (text: string) => ({ok?: boolean}|void), onRemove?: (id: string) => void}} [handlers]
 * @returns {HTMLElement}
 */
export function renderLogbook(el, model, handlers = {}) {
  el.innerHTML = logbookMarkup(model);
  const form = el.querySelector('#logbook-note');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input[name="note"]');
    const text = String(input?.value ?? '');
    const result = handlers.onAdd?.(text);
    if (result?.ok === false) return;
    if (input) input.value = '';
  });
  for (const button of el.querySelectorAll('[data-note-id]')) {
    button.addEventListener('click', () => handlers.onRemove?.(String(button.dataset.noteId ?? '')));
  }
  return el;
}
