// CHARACTER CREATION, ON SCREEN.
//
// The panel is a DOM layer over Arena's **own character-sheet art**: `charspel.img`
// is a 320×200 screen with its own embedded palette (12-byte header, 64 000 pixels,
// 768 palette bytes — FORMATS §6), and it is drawn as the backdrop the questions are
// asked on. Nothing else about the look is invented: the questions, the answers and
// the class the answers suggest are the game's data (FORMATS §10a).
//
// The flow itself lives in `game/chargen.js` and knows nothing about the DOM, so the
// order of events can be tested in Node and only the panel is browser code.
//
// `?chargen` forces this scene; without it, the boot in `main.js` comes here only
// when there is no character saved yet.

import { ArenaData } from '../arena/arenaData.js';
import { loadArenaText } from '../arena/arenaText.js';
import { RACES, CLASSES, describeCharacter } from '../game/character.js';
import {
  answerQuestion, attributeSheet, currentQuestion, describeSelf, finish, newCreation,
  outcome, progress, spendPoints, ROLL_NOTE,
} from '../game/chargen.js';
import { loadCharacter, saveCharacter } from '../game/save.js';
import { escapeHtml } from '../engine/ui/escape.js';

/**
 * Turn a palettized image into DOM-ready pixels, with index 0 **opaque**.
 *
 * The renderer's convention is the opposite (index 0 is a cutout, which is right for
 * sprites), but this art is a screen: its index 0 is the black background, and a
 * transparent one would show the page behind the panel.
 *
 * @param {Uint8Array} indices
 * @param {{rgb: Uint8Array}|null} palette
 * @param {number} width @param {number} height
 * @param {{rgb: Uint8Array}} fallback
 * @returns {ImageData}
 */
function toScreenImageData(indices, palette, width, height, fallback) {
  const rgb = (palette ?? fallback).rgb;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = indices[i] * 3;
    out[i * 4] = rgb[v];
    out[i * 4 + 1] = rgb[v + 1];
    out[i * 4 + 2] = rgb[v + 2];
    out[i * 4 + 3] = 255;
  }
  return new ImageData(out, width, height);
}

/**
 * Boot character creation.
 *
 * @param {HTMLCanvasElement} _canvas the game's GL canvas (unused here)
 * @param {object} _renderer the engine renderer (unused here)
 * @param {URLSearchParams} params
 * @param {(msg: string) => void} status
 * @param {import('../arena/arenaData.js').ArenaSource|null} source
 * @returns {Promise<{character: object|null}>}
 */
export async function bootChargen(_canvas, _renderer, params, status, source = null) {
  if (!source) throw new Error('bootChargen needs an Arena data source');
  const data = new ArenaData(source, { onWarn: (m) => console.warn(`[arena] ${m}`) });

  status('reading the questionnaire');
  const library = await loadArenaText(data);
  for (const warning of library.warnings) console.warn(`[text] ${warning}`);
  if (!library.questions.length) {
    throw new Error('question.txt is not in this Arena install, so there is no questionnaire to ask');
  }

  // ── the backdrop: Arena's own sheet art ────────────────────────────────────
  let artCanvas = null;
  try {
    const art = await data.img('CHARSPEL.IMG');
    if (art.width === 320 && art.height === 200) {
      const palette = art.palette ?? await data.palette('CHARSHT.COL');
      const image = toScreenImageData(art.indices, palette, art.width, art.height, palette);
      artCanvas = document.createElement('canvas');
      artCanvas.width = art.width;
      artCanvas.height = art.height;
      artCanvas.getContext('2d').putImageData(image, 0, 0);
    }
  } catch (err) {
    // The art is a backdrop, not a dependency: the panel works without it.
    console.warn(`[chargen] the character-sheet art was not readable: ${err.message}`);
  }

  // ── the DOM ────────────────────────────────────────────────────────────────
  const host = document.getElementById('chargen') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'chargen' }));
  host.innerHTML = '';
  host.classList.add('on');
  const backdrop = document.createElement('canvas');
  backdrop.id = 'chargen-art';
  if (artCanvas) { backdrop.width = artCanvas.width; backdrop.height = artCanvas.height; }
  host.appendChild(backdrop);
  const panel = document.createElement('div');
  panel.id = 'chargen-panel';
  host.appendChild(panel);
  if (artCanvas) {
    backdrop.getContext('2d').drawImage(artCanvas, 0, 0);
    backdrop.style.display = 'block';
  }

  const hasCharacter = Boolean(loadCharacter());
  let creation = newCreation({ questions: library.questions, seed: params.has('seed') ? Number(params.get('seed')) : undefined });
  /** @type {'intro'|'questions'|'identity'|'class'|'attributes'|'done'} */
  let step = 'intro';
  /** @type {object|null} */
  let character = null;
  let notice = '';
  /** Resolved when the player leaves creation; see `leave`. */
  /** @type {(value: {character: object|null}) => void} */
  let resolveExit = () => {};
  const exit = new Promise((resolve) => { resolveExit = resolve; });

  const verdict = () => outcome(creation);
  const esc = escapeHtml;
  /** Arena's questionnaire is hard-wrapped prose; keep its shape in the panel. */
  const prose = (text) => text.split('\n').map((line) => `<p>${esc(line)}</p>`).join('');

  function renderIntro() {
    const p = progress(creation);
    panel.innerHTML = `
      <h1>${hasCharacter ? 'Make another character' : 'Character creation'}</h1>
      <p class="lead">Arena asks you ten questions, drawn from the ${library.questions.length} it ships.
      Your answers are counted on three tracks, and the count decides your class.</p>
      ${hasCharacter ? '<p class="sub">You already have a character saved. Beginning here will replace them.</p>' : ''}
      <p class="sub">${esc(ROLL_NOTE)}</p>
      <button id="cg-begin">Answer the questions</button>
      ${hasCharacter ? '<button id="cg-keep" class="ghost">Keep my character</button>' : ''}`;
    panel.querySelector('#cg-begin').onclick = () => { step = 'questions'; render(); };
    panel.querySelector('#cg-keep')?.addEventListener('click', () => leave());
  }

  function renderQuestion() {
    const question = currentQuestion(creation);
    const p = progress(creation);
    if (!question) { step = 'identity'; render(); return; }
    panel.innerHTML = `
      <div class="steps">question ${p.answered + 1} of ${p.of}</div>
      <h1>${esc(`Question ${p.answered + 1}`)}</h1>
      <div class="prose">${prose(question.text)}</div>
      <div class="answers">${question.answers.map((a) => `
        <button data-answer="${a.key}">
          <span class="key">${a.key})</span>
          <span class="text">${esc(a.text).replace(/\n/g, ' ')}</span>
          <span class="tag">(${a.points}${a.letter})</span>
        </button>`).join('')}</div>
      <p class="sub">Every scenario's three answers are the game's own, tagged as its file tags them.</p>`;
    for (const button of panel.querySelectorAll('button[data-answer]')) {
      button.onclick = () => {
        const result = answerQuestion(creation, button.dataset.answer);
        if (!result.ok) { notice = result.reason; return; }
        creation = result.creation;
        render();
      };
    }
  }

  function renderIdentity() {
    const v = verdict();
    const suggested = v.class;
    panel.innerHTML = `
      <h1>Who are you?</h1>
      <p class="lead">Your answers counted <b>${v.counts.thief}</b> thief, <b>${v.counts.mage}</b> mage and
      <b>${v.counts.warrior}</b> warrior. ${esc(v.suggested.note)}.</p>
      <p class="lead">That points to a <b>${esc(suggested?.name ?? 'Warrior')}</b>.</p>
      <label class="field">Name
        <input id="cg-name" maxlength="24" value="${esc(creation.name)}" placeholder="your name" />
      </label>
      <label class="field">Race
        <select id="cg-race">${RACES.map((r) => `<option value="${r.id}"${creation.raceId === r.id ? ' selected' : ''}>${r.name} — ${esc(r.ability)}</option>`).join('')}</select>
      </label>
      <label class="field">Gender
        <select id="cg-gender">
          <option value="male"${creation.gender === 'male' ? ' selected' : ''}>male</option>
          <option value="female"${creation.gender === 'female' ? ' selected' : ''}>female</option>
        </select>
      </label>
      <button id="cg-next">Roll the dice</button>
      ${notice ? `<p class="warn">${esc(notice)}</p>` : ''}`;
    panel.querySelector('#cg-next').onclick = () => {
      const name = panel.querySelector('#cg-name').value;
      const raceId = panel.querySelector('#cg-race').value;
      const gender = panel.querySelector('#cg-gender').value;
      // The class is Arena's suggestion; changing it is a deliberate deviation
      // (S25), so it is a step of its own rather than a hidden default.
      const chosen = params.get('class') ?? creation.classId ?? suggested?.id;
      const result = describeSelf(creation, { name, raceId, gender, classId: chosen });
      if (!result.ok) { notice = result.reason; render(); return; }
      creation = result.creation;
      notice = '';
      step = 'class';
      render();
    };
  }

  function renderClass() {
    const v = verdict();
    panel.innerHTML = `
      <div class="steps">the questionnaire's verdict</div>
      <h1>The class the answers suggest</h1>
      <p class="lead">Arena assigns this class from your ten answers. You may take another — that is a
      change to the original, recorded in the project's decisions — but the suggestion is what the game would
      have given you.</p>
      ${CLASSES.map((c) => `
        <button class="class-choice${c.id === creation.classId ? ' on' : ''}" data-class="${c.id}">
          <span class="name">${esc(c.name)}${c.id === v.class?.id ? ' <em>(the questionnaire\'s pick)</em>' : ''}</span>
          <span class="stat">d${c.hitDie} health${c.spellPoints > 0 ? ` · ${c.spellPoints} × INT spell points` : ' · no spells'}${c.critical ? ` · ${c.critical}% critical` : ''}</span>
          <span class="abil">${esc(c.ability)}</span>
        </button>`).join('')}
      <button id="cg-attr">Roll the attributes</button>`;
    for (const button of panel.querySelectorAll('button[data-class]')) {
      button.onclick = () => {
        creation = { ...creation, classId: button.dataset.class };
        render();
      };
    }
    panel.querySelector('#cg-attr').onclick = () => { step = 'attributes'; render(); };
  }

  function renderAttributes() {
    if (!creation.attributes) { step = 'identity'; render(); return; }
    const sheet = attributeSheet(creation);
    panel.innerHTML = `
      <div class="steps">${esc(ROLL_NOTE)}</div>
      <h1>Your attributes</h1>
      <p class="lead">${escapeHtml(createSummary(creation))}</p>
      <p class="sub">You have <b>${creation.discretionary}</b> points to place, from a roll of ${creation.rolls.join(' + ')}.</p>
      <table class="attrs">
        ${sheet.map((row, i) => `
          <tr>
            <th>${row.abbr}</th>
            <td class="nm">${row.name}</td>
            <td class="val" id="cg-val-${i}">${row.value}</td>
            <td class="bonus">${esc(row.bonus)}</td>
            <td class="spend">
              <button data-spend="${i}" data-delta="-1">−</button>
              <span id="cg-add-${i}">0</span>
              <button data-spend="${i}" data-delta="1">+</button>
            </td>
          </tr>`).join('')}
      </table>
      <button id="cg-finish">Begin your life</button>`;
    const spend = [0, 0, 0, 0, 0, 0, 0, 0];
    const apply = () => {
      const result = spendPoints(creation, spend);
      const spent = result.ok ? result.creation : creation;
      for (let i = 0; i < sheet.length; i++) {
        panel.querySelector(`#cg-val-${i}`).textContent = String(spent.attributes[i]);
        panel.querySelector(`#cg-add-${i}`).textContent = String(spend[i]);
      }
      panel.querySelector('p.sub').innerHTML = result.ok
        ? `You have <b>${spent.discretionary}</b> points left to place.`
        : `<span class="warn">${esc(result.reason)}</span>`;
      return spent;
    };
    for (const button of panel.querySelectorAll('button[data-spend]')) {
      button.onclick = () => {
        const index = Number(button.dataset.spend);
        const delta = Number(button.dataset.delta);
        const next = spend[index] + delta;
        if (next < 0) return;
        const candidate = spend.slice();
        candidate[index] = next;
        const result = spendPoints(creation, candidate);
        if (!result.ok) { notice = result.reason; panel.querySelector('p.sub').innerHTML = `<span class="warn">${esc(result.reason)}</span>`; return; }
        spend[index] = next;
        apply();
      };
    }
    panel.querySelector('#cg-finish').onclick = () => {
      const result = spendPoints(creation, spend);
      if (!result.ok) { notice = result.reason; return; }
      creation = result.creation;
      const made = finish(creation);
      if (!made) { notice = 'the character is not finished'; return; }
      character = made.character;
      saveCharacter(character);
      step = 'done';
      render();
    };
  }

  function renderDone() {
    panel.innerHTML = `
      <h1>${esc(character.name)}</h1>
      <p class="lead">${esc(describeCharacter(character))}</p>
      <p class="lead">${esc(character.gender)} ${esc(character.race)} ${esc(character.className)} — ${esc(CLASSES.find((c) => c.id === character.classId)?.ability ?? '')}</p>
      <p class="sub">Your answers: ${esc(creation.answers.map((a) => a.key).join(''))} over ${creation.asked.length} questions, seed ${creation.seed}.</p>
      <button id="cg-play">Enter Tamriel</button>`;
    panel.querySelector('#cg-play').onclick = () => leave();
  }

  function createSummary(c) {
    const race = RACES.find((r) => r.id === c.raceId);
    return `${c.name}, ${c.gender} ${race?.name ?? '?'} ${CLASSES.find((k) => k.id === c.classId)?.name ?? '?'} — ${race?.ability ?? ''}`;
  }

  function render() {
    if (step === 'intro') renderIntro();
    else if (step === 'questions') renderQuestion();
    else if (step === 'identity') renderIdentity();
    else if (step === 'class') renderClass();
    else if (step === 'attributes') renderAttributes();
    else renderDone();
    host.dataset.step = step;
  }

  /**
   * Leave creation — **in this page, not by navigating**.
   *
   * Creation used to finish with `location.href = '?map'`, and on the shipping path
   * that was a real bug: the player's Arena folder is a live `FileList`, which no
   * navigation can carry, so the next page had nothing to read and asked for the
   * folder again. Resolving instead lets the caller boot the destination with the
   * very same source object.
   */
  function leave() {
    host.classList.remove('on');
    host.innerHTML = '';
    status('entering Tamriel');
    resolveExit({ character: character ?? loadCharacter() });
  }

  render();
  status(character ? 'character created' : 'answering questions');

  // ── the debug seam ─────────────────────────────────────────────────────────
  Object.assign(window.__debug, {
    scene: 'chargen',
    state: () => ({
      scene: 'chargen',
      step,
      hasCharacter,
      character: character ? { ...character } : null,
      saved: Boolean(loadCharacter()),
      progress: progress(creation),
      questions: creation.asked.map((q) => q.id),
      counts: verdict().counts,
      suggested: verdict().suggested.class,
      notice: notice || null,
      art: artCanvas ? { width: artCanvas.width, height: artCanvas.height } : null,
    }),
    /** The question on screen, exactly as the panel shows it. */
    question: () => {
      const q = currentQuestion(creation);
      return q ? { id: q.id, text: q.text, answers: q.answers.map((a) => ({ key: a.key, letter: a.letter, text: a.text })) } : null;
    },
    /** Answer by key, as clicking the button does. */
    answer: (key) => {
      const result = answerQuestion(creation, key);
      if (result.ok) { creation = result.creation; render(); }
      return { ok: result.ok, reason: result.reason ?? null, progress: progress(creation) };
    },
    /** Answer every remaining question by key, for a scripted run. */
    answerAll: (key = 'a') => {
      while (currentQuestion(creation)) creation = answerQuestion(creation, key).creation;
      render();
      return progress(creation);
    },
    describe: (opts) => {
      const result = describeSelf(creation, opts);
      if (result.ok) { creation = result.creation; notice = ''; render(); }
      return { ok: result.ok, reason: result.reason ?? null, attributes: creation.attributes };
    },
    spend: (spend) => {
      const result = spendPoints(creation, spend);
      if (result.ok) { creation = result.creation; render(); }
      return { ok: result.ok, reason: result.reason ?? null, attributes: creation.attributes, left: creation.discretionary };
    },
    finish: () => {
      const made = finish(creation);
      if (!made) return { ok: false, reason: 'not ready' };
      character = made.character;
      saveCharacter(character);
      render();
      return { ok: true, character: made.character };
    },
    /** The panel's own step, driven for a test that must click like a player. */
    gotostep: (next) => { step = next; render(); return step; },
    /** Leave for the world, as the "Enter Tamriel" button does. */
    enterTamriel: () => { leave(); return true; },
    /**
     * A class by id, so a test can check the sheet against the class table instead
     * of asserting that a field merely exists.
     * @param {string} id
     */
    classOf: (id) => {
      const klass = CLASSES.find((c) => c.id === id);
      return klass ? { ...klass } : null;
    },
    /** The 4d6 the sheet was given, so the stated pool can be checked against them. */
    rolls: () => creation.rolls.slice(),
  });

  // Hand back to the caller when the player has left the panel.
  return await exit;
}

