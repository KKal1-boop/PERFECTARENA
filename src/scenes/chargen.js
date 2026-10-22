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
import { parseCfa } from '../arena/cfa.js';
import {
  APPEARANCE_VIEWS, NPC_SPRITES, appearanceAttack, appearanceSkinSpec, appearanceWalkFile,
  defaultSpriteFor, normalizeAppearance, spriteById,
} from '../game/playerAppearance.js';
import {
  HAIR_COLORS, HAIR_KEYS, KHAJIIT_COATS, RACE_SKIN, hairIndicesOf, raceKey, skinPaletteFor,
  catFrameRgba,
} from '../game/raceSkin.js';
import {
  answerQuestion, attributeSheet, currentQuestion, describeSelf, finish, newCreation,
  outcome, progress, spendPoints, ROLL_NOTE,
} from '../game/chargen.js';
import { loadCharacter, saveCharacter } from '../game/save.js';
import { playMusic } from '../game/musicPlayer.js';
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
  // **The character sheet has its own song** (the soundtrack's `SHEET`, 3:14). It is a place
  // in the catalogue, not a story beat: the opening movie has finished and the dungeon has not
  // begun. The browser's autoplay law is the player's first click on the questionnaire.
  void playMusic('SHEET.XMI', { arenaPath: source?.arenaPath ?? params.get('arena') ?? 'C:/arenaproject/arena/ARENA' });

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
  /** @type {{spriteId: string, skin: string|null, hair: string|null}} */
  let look = normalizeAppearance(null, { classId: 'warrior', gender: 'male', raceId: 'breton' });
  /** The live preview's own clock, cancelled whenever the panel is replaced. */
  let previewTimer = null;
  let previewToken = 0;
  let previewSpin = true;
  let previewView = 5;
  let previewMode = 'walk';
  const cfaCache = new Map();
  let basePalette = null;

  function stopPreview() {
    if (previewTimer) clearInterval(previewTimer);
    previewTimer = null;
    previewToken++;
  }

  async function cfaFor(file) {
    if (!file) return null;
    const key = String(file).toUpperCase();
    if (!cfaCache.has(key)) cfaCache.set(key, parseCfa(await data.must(key), key));
    return cfaCache.get(key);
  }

  async function paletteFor(cfa, file) {
    const base = basePalette ??= await data.palette('PAL.COL');
    // The same law the world draws with (`playerAppearance.js`): a human's race/hair, a
    // cat's coat, or nothing over a lizard's own scales. A creator that painted the preview
    // differently from the figure in the street would be showing a body the player cannot play.
    const spec = appearanceSkinSpec(look, creation);
    const rgb = skinPaletteFor(spec, base.rgb, { hairIndices: hairIndicesOf(cfa, { name: file }) });
    return rgb ? { rgb } : base;
  }

  /** Draw one frame, scaled to fit the canvas, with index 0 transparent. */
  function drawFrame(canvas, cfa, frameIndex, palette, mirrored = false, fur = null) {
    const frame = cfa.frames[Math.max(0, Math.min(cfa.frames.length - 1, frameIndex))];
    if (!frame) return;
    const w = frame.width, h = frame.height;
    const scale = Math.max(1, Math.floor(Math.min(canvas.width / w, canvas.height / h)));
    canvas.width = canvas.width; // clear
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dataImg = ctx.createImageData(w, h);
    if (fur) {
      // The coat is painted per pixel (`raceSkin.js`'s `catFrameRgba`), and its rows already
      // come bottom-up for the world renderer. A canvas is top-down, so each row is reversed as
      // it is copied; the transparent cutout rides along in the alpha byte.
      const rgba = catFrameRgba(frame.indices, w, h, palette, fur);
      for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * w * 4;
        dataImg.data.set(rgba.subarray(src, src + w * 4), y * w * 4);
      }
    } else {
      const rgb = palette.rgb;
      for (let i = 0; i < w * h; i++) {
        const v = frame.indices[i];
        dataImg.data[i * 4 + 3] = v === 0 ? 0 : 255;
        if (v === 0) continue;
        dataImg.data[i * 4] = rgb[v * 3];
        dataImg.data[i * 4 + 1] = rgb[v * 3 + 1];
        dataImg.data[i * 4 + 2] = rgb[v * 3 + 2];
      }
    }
    const offX = (canvas.width - w * scale) / 2;
    const offY = (canvas.height - h * scale) / 2;
    ctx.setTransform(mirrored ? -scale : scale, 0, 0, scale,
      mirrored ? offX + w * scale : offX, offY);
    const bitmap = document.createElement('canvas');
    bitmap.width = w; bitmap.height = h;
    bitmap.getContext('2d').putImageData(dataImg, 0, 0);
    ctx.drawImage(bitmap, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
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
      // The look the player arrives with is their race's own skin and their class's body;
      // **the next screen is where they change it**, before the dice are rolled.
      // A human arrives in their race's own skin; a lizard or a cat arrives in the body that
      // *is* the race, with the coat or scales Arena drew rather than a human ramp over it.
      look = normalizeAppearance(null, creation);
      if ((spriteById(look.spriteId)?.paint ?? 'skin') === 'skin') look.skin = raceKey(creation.raceId);
      previewMode = 'walk'; previewSpin = true; previewView = 5;
      step = 'appearance';
      render();
    };
  }

  /**
   * **The visual creator** — every walkable person in the install, with a live 360 preview.
   *
   * The grid is the catalogue (`game/playerAppearance.js`), and a button is hidden when this
   * install does not ship that family rather than drawn as a blank. The stage cycles the five
   * shipped angles plus the three mirrored ones, and Walk/Attack play the sheet's own frames;
   * the skin, hair and coat choices repaint the same art through `raceSkin.js`, so the preview
   * and the figure in the world are one palette and one drawing.
   */
  function renderAppearance() {
    stopPreview();
    // A colour is shown as the colour it is: two anchors of the ramp as one swatch. The names
    // are the labels, so the grid is readable to a player who cannot tell the ramps apart.
    const swatchStyle = (ramp) => `background: linear-gradient(135deg, ${ramp.light} 0 50%, ${ramp.dark} 50% 100%)`;
    const furStyle = (ramp) => `background: linear-gradient(135deg, rgb(${ramp[0][1].join(',')}) 0 50%, rgb(${ramp[ramp.length - 1][1].join(',')}) 50% 100%)`;
    const skinOptions = [
      `<button class="look-swatch arena${look.skin ? '' : ' on'}" data-look-skin="arena" title="Arena's own palette"><span class="dot arena"></span><span class="name">Arena</span></button>`,
      ...Object.keys(RACE_SKIN).map((key) => `<button class="look-swatch${look.skin === key ? ' on' : ''}" data-look-skin="${key}" title="${esc(RACE_SKIN[key].note)}"><span class="dot" style="${swatchStyle(RACE_SKIN[key])}"></span><span class="name">${esc(key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()))}</span></button>`),
    ].join('');
    const hairOptions = [
      `<button class="look-swatch arena${look.hair ? '' : ' on'}" data-look-hair="" title="Arena's own palette"><span class="dot arena"></span><span class="name">Arena</span></button>`,
      ...HAIR_KEYS.map((key) => `<button class="look-swatch${look.hair === key ? ' on' : ''}" data-look-hair="${key}" title="${esc(key)} hair"><span class="dot" style="${swatchStyle(HAIR_COLORS[key])}"></span><span class="name">${esc(key)}</span></button>`),
    ].join('');
    const furOptions = Object.entries(KHAJIIT_COATS).map(([key, ramp]) =>
      `<button class="look-swatch${look.fur === key ? ' on' : ''}" data-look-fur="${key}" title="${esc(key)} coat"><span class="dot" style="${furStyle(ramp)}"></span><span class="name">${esc(key)}</span></button>`).join('');
    // A body's own colours are not a colour picker: the Lizard Man's scales are already in the
    // sheet, and only the orange wolf is repainted (into one of the Khajiit's coats).
    const paint = spriteById(look.spriteId)?.paint ?? 'skin';
    const colours = paint === 'fur'
      ? `<div class="look-colour"><span class="label">Coat</span><div class="swatches" id="cg-fur">${furOptions}</div></div>`
      : paint === 'own'
        ? `<p class="sub">This body keeps Arena\u2019s own colours: its scales and fur are drawn in the sheet.</p>`
        : `<div class="look-colour"><span class="label">Skin</span><div class="swatches" id="cg-skin">${skinOptions}</div></div>
           <div class="look-colour"><span class="label">Hair</span><div class="swatches" id="cg-hair">${hairOptions}</div></div>`;
    panel.innerHTML = `
      <div class="steps">your body, your face</div>
      <h1>Choose how you look</h1>
      <p class="lead">Every one of these is a person Arena drew walking: five shipped sides, mirrored
      to eight. Pick one, then change the skin, hair or coat and watch them move.</p>
      <div class="look">
        <div class="look-grid" id="cg-sprites">${NPC_SPRITES.map((sprite) => `
          <button class="look-choice${sprite.id === look.spriteId ? ' on' : ''}" data-sprite="${sprite.id}" title="${esc(sprite.note)}">
            <canvas width="64" height="78"></canvas>
            <span class="name">${esc(sprite.label)}</span>
            <span class="tag">${sprite.gender}</span>
          </button>`).join('')}</div>
        <div class="look-stage">
          <canvas id="cg-look" width="240" height="300"></canvas>
          <p class="look-note" id="cg-look-note">loading…</p>
          <div class="look-controls">
            <button data-look-view="-1">◀</button>
            <button data-look-spin="${previewSpin ? 'off' : 'on'}">${previewSpin ? 'Stop 360°' : '360°'}</button>
            <button data-look-view="1">▶</button>
            <button data-look-mode="walk" class="${previewMode === 'walk' ? 'on' : ''}">Walk</button>
            <button data-look-mode="attack" class="${previewMode === 'attack' ? 'on' : ''}">Attack</button>
          </div>
          <p class="sub" id="cg-look-view">view ${previewView} of 5 · ${previewSpin ? 'turning' : 'still'}</p>
        </div>
      </div>
      <div class="look-colours">${colours}</div>
      <button id="cg-look-next">Take this body</button>
      <button id="cg-look-back" class="ghost">Back</button>
      ${notice ? `<p class="warn">${esc(notice)}</p>` : ''}`;

    for (const button of panel.querySelectorAll('button[data-sprite]')) {
      button.onclick = () => {
        // A body brings its own paint law with it: the cat gets a coat, the lizard keeps its
        // scales, and a human returns to their race's skin rather than the wolf's fur.
        look = normalizeAppearance({ ...look, spriteId: button.dataset.sprite }, creation);
        if ((spriteById(look.spriteId)?.paint ?? 'skin') === 'skin' && !look.skin) {
          look = { ...look, skin: raceKey(creation.raceId) };
        }
        previewMode = 'walk';
        render();
      };
    }
    for (const button of panel.querySelectorAll('button[data-look-skin]')) {
      button.onclick = () => {
        look = { ...look, skin: button.dataset.lookSkin === 'arena' ? null : button.dataset.lookSkin };
        render();
      };
    }
    for (const button of panel.querySelectorAll('button[data-look-hair]')) {
      button.onclick = () => {
        look = { ...look, hair: button.dataset.lookHair || null };
        render();
      };
    }
    for (const button of panel.querySelectorAll('button[data-look-fur]')) {
      button.onclick = () => {
        look = { ...look, fur: button.dataset.lookFur };
        render();
      };
    }
    for (const button of panel.querySelectorAll('button[data-look-view]')) {
      button.onclick = () => {
        previewSpin = false;
        previewView = 1 + ((previewView - 1 + Number(button.dataset.lookView) + 5) % 5);
        render();
      };
    }
    panel.querySelector('button[data-look-spin]').onclick = (e) => {
      previewSpin = e.target.dataset.lookSpin !== 'off';
      render();
    };
    for (const button of panel.querySelectorAll('button[data-look-mode]')) {
      button.onclick = () => { previewMode = button.dataset.lookMode; render(); };
    }
    panel.querySelector('#cg-look-next').onclick = () => {
      creation = { ...creation, appearance: { ...look } };
      stopPreview();
      step = 'class';
      render();
    };
    panel.querySelector('#cg-look-back').onclick = () => { stopPreview(); step = 'identity'; render(); };
    void paintLookPreview();
  }

  /** Draw the chosen sprite once, for a thumbnail (frame 0, the front angle, the chosen palette). */
  async function paintThumb(button) {
    const sprite = spriteById(button.dataset.sprite);
    if (!sprite) { button.hidden = true; return; }
    const file = sprite.walk(1);
    if (!await data.has(file)) { button.hidden = true; return; }
    const cfa = await cfaFor(file);
    const palette = await paletteFor(cfa, file);
    drawFrame(button.querySelector('canvas'), cfa, 0, palette, false, sprite.paint === 'fur' ? (look.fur ?? 'tawny') : null);
  }

  /** The live stage: choose the angle and the animation, and repaint on the creator's clock. */
  async function paintLookPreview() {
    const token = previewToken;
    const stage = document.getElementById('cg-look');
    const note = document.getElementById('cg-look-note');
    if (!stage) return;
    // Thumbnails are the front of each family, painted with the player's own skin and hair.
    await Promise.all([...panel.querySelectorAll('button[data-sprite]')].map((button) => paintThumb(button).catch(() => { button.hidden = true; })));
    if (token !== previewToken) return;
    const attack = appearanceAttack(look, creation);
    const sprite = spriteById(look.spriteId);
    if (note) {
      note.textContent = attack?.sameSheet
        ? 'this body carries Arena\u2019s own strike frames'
        : 'the town\u2019s clothes have no strike art; the blow borrows the unarmoured arms of the same sex';
    }
    let tick = 0;
    const paint = async () => {
      if (token !== previewToken) return;
      const direction = previewSpin
        ? APPEARANCE_VIEWS[Math.floor(tick / 5) % APPEARANCE_VIEWS.length]
        : { view: previewView, mirrored: false };
      const file = previewMode === 'attack' && attack
        ? attack.file
        : appearanceWalkFile(look, direction.view, creation);
      const cfa = await cfaFor(file).catch(() => null);
      if (!cfa || token !== previewToken) return;
      const palette = await paletteFor(cfa, file);
      let frame = 0;
      if (previewMode === 'attack' && attack) {
        frame = attack.frames
          ? attack.frames[Math.floor(tick / 3) % attack.frames.length]
          : Math.floor(tick / 3) % cfa.frames.length;
      } else {
        const walkFrames = sprite?.layout === 'view' ? 6 : cfa.frames.length;
        frame = Math.floor(tick / 3) % Math.max(1, walkFrames);
      }
      drawFrame(stage, cfa, frame, palette, previewMode === 'walk' && direction.mirrored,
        sprite?.paint === 'fur' ? (look.fur ?? 'tawny') : null);
      const label = document.getElementById('cg-look-view');
      if (label && !previewSpin) label.textContent = `view ${previewView} of 5 \u00b7 still`;
      tick++;
    };
    await paint();
    if (token !== previewToken) return;
    previewTimer = setInterval(() => { if (token !== previewToken) return; void paint(); }, 90);
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
    if (step !== 'appearance') stopPreview();
    if (step === 'intro') renderIntro();
    else if (step === 'questions') renderQuestion();
    else if (step === 'identity') renderIdentity();
    else if (step === 'appearance') renderAppearance();
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
      appearance: { ...look, sprite: spriteById(look.spriteId)?.label ?? null },
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
    /**
     * Choose a look exactly as the visual creator's controls do. `skin`/`hair` accept `null`
     * for Arena's own colours, and `spriteId` is one of `NPC_SPRITES`' ids.
     */
    chooseAppearance: (opts = {}) => {
      look = normalizeAppearance({ ...look, ...opts }, creation);
      creation = { ...creation, appearance: { ...look } };
      if (step === 'appearance') render();
      return { ...look, sprite: spriteById(look.spriteId)?.label ?? null };
    },
    /** What the creator can offer, and whether this install really has each body. */
    appearanceOptions: () => NPC_SPRITES.map((sprite) => ({
      id: sprite.id, label: sprite.label, gender: sprite.gender, note: sprite.note,
      walk: sprite.walk(1), attack: appearanceAttack(sprite.id, creation)?.file ?? null,
    })),
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

