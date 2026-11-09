// THE GUI, IN ARENA'S OWN PICTURES.
//
// The owner, 2026-10-22: *"ALL the gui of the whole game needs a complete rework using the og
// arena artworks … the gui needs to be perfect gorgeous and og arena like"* — and then, on
// 2026-10-25, with the internet having called the result AI slop: *"the gui needs a rework keeping
// everything it has but using the original game gui artwork only cropped cutted and repurposed to
// make a total gui overhaul that is beautiful."*
//
// The second report was right about the cause, and the cause was not that the art was missing. It
// was that the art was **painted over**: `PARCH.IMG` under a 93%-opaque ink wash, `POPUP3.IMG`'s
// marble under another, every panel a modern dark slab wearing a tinted ghost of a 1994 texture.
// The paintings are the interface; this module now publishes them whole.
//
// ## What is published
//
// `engine/ui/guiKit.js` is the cutting table (which rectangle of which painting is which piece,
// how each frame is nine-sliced, and the ink colours measured out of the art). This module decodes
// the bytes with the same `.IMG` reader the walls use (`arena/image.js`), cuts the pieces once,
// and writes them onto the document as CSS custom properties:
//
//   `--gk-paper`, `--gk-paper-slice`, `--gk-paper-fill`   the scroll: frame, slice, paper tile
//   `--gk-stone`, `--gk-stone-slice`, `--gk-marble`       the inventory window: frame, slice, rock
//   `--gk-plate`, `--gk-plate-slice`, `--gk-well`         the command button: frame, slice, its dark
//   `--gk-band`, `--gk-corner`, `--gk-flourish`, `--gk-scroll-corner`
//   `--gk-gold`, `--gk-ink`, …                            the ink, each a pixel of the art
//
// The stylesheet in `index.html` is then only geometry and type: no colour, no texture and no
// ornament is invented there. A folder without these paintings leaves the stylesheet's own
// fallback ink in place — the GUI never fails to draw because a picture is missing.
//
// ## The cutout rule
//
// A palettized Arena painting is a **1-bit cutout**: index 0 is a hole and every other index is
// opaque (`engine/ui/bitmapCanvas.js` says the same for the classic screens). That is what makes
// `PARCH.IMG`'s curled edges show the world behind them, what lets `COMPASS.IMG`'s mark sit on the
// view rather than in a grey box, and what makes a scroll's rolled ends shadow the page under them.

import {
  GUI_ART_VAR, GUI_CUTS, GUI_ICON_COUNT, GUI_INK, GUI_INK_VAR, GUI_PAINTINGS, GUI_PIECE_VAR,
  GUI_SLICE, GUI_SLICE_VAR, cutFits, iconVariable, sliceCss,
} from '../engine/ui/guiKit.js';

/** The painting each part of the interface is made of, kept for callers that still ask by role. */
export const GUI_ART = GUI_PAINTINGS;

/** How many buttons `S2.IMG` carries, and therefore how many hotbar cells the strip draws. */
export const COMMAND_SLOTS = 10;

/**
 * The CSS custom property each painting is published under.
 *
 * The `--ar-*` names are the first pass's and are still written, because a probe or a saved
 * stylesheet may read them; the `--gk-*` names are the interface's own.
 */
export const CSS_VAR = Object.freeze({
  status: '--ar-status',
  command: '--ar-command',
  frame: '--ar-frame',
  frameSmall: '--ar-frame-small',
  parchment: '--ar-parchment',
  compass: '--ar-compass',
  // **`--ar-gold` is a *colour*, not a picture.** The first version published `GOLD.IMG` under
  // `--ar-gold`, which overwrote the stylesheet's gold with `url(…)`; every `color: var(--ar-gold)`
  // then resolved to an invalid colour and the text fell back to inherited black on a dark panel —
  // the owner's *"the colour of the gui … make text non visible"*.
  gold: '--ar-gold-mark',
  key: '--ar-key-mark',
  menu: '--ar-menu',
});

/** @typedef {{name: string, width: number, height: number, canvas: HTMLCanvasElement, url: string}} GuiPainting */

/**
 * Index a decoded `.IMG` through its palette into a canvas.
 *
 * @param {{width:number,height:number,indices:Uint8Array,palette:object|null}} image
 * @param {{rgb: Uint8Array}} palette
 * @returns {HTMLCanvasElement}
 */
function toCanvas(image, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(image.width, image.height);
  const rgb = palette.rgb;
  for (let i = 0; i < image.width * image.height; i++) {
    const index = image.indices[i];
    const o = i * 4;
    // The 1-bit cutout: index 0 is the hole the world shows through.
    if (index === 0) continue;
    out.data[o] = rgb[index * 3];
    out.data[o + 1] = rgb[index * 3 + 1];
    out.data[o + 2] = rgb[index * 3 + 2];
    out.data[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/**
 * Crop one rectangle out of a canvas, as a canvas of its own. Never smoothed: these are the art's
 * own pixels.
 *
 * @param {HTMLCanvasElement} source
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @returns {HTMLCanvasElement}
 */
function crop(source, x, y, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
  return canvas;
}

/**
 * Read the install's GUI paintings and publish the whole kit to the page as CSS variables.
 *
 * Every painting is optional. The function answers what it found, and a stylesheet that got
 * nothing keeps its fallback ink rather than drawing an empty frame.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @param {{document?: Document, images?: Record<string,string>}} [opts]
 * @returns {Promise<{paintings: Map<string, GuiPainting>, slots: string[], applied: string[], ink: Record<string,string>}>}
 */
export async function loadArenaGui(data, opts = {}) {
  const doc = opts.document ?? (typeof document !== 'undefined' ? document : null);
  const wanted = opts.images ?? GUI_PAINTINGS;
  /** @type {Map<string, GuiPainting>} */
  const paintings = new Map();
  const applied = [];
  if (!data || !doc) return { paintings, slots: [], applied, ink: { ...GUI_INK } };

  const root = doc.documentElement;
  const publish = (name, value) => root.style.setProperty(name, value);

  let globalPalette = null;
  try { globalPalette = await data.palette(); } catch { /* a folder with no PAL.COL draws nothing */ }

  for (const [role, name] of Object.entries(wanted)) {
    try {
      const image = await data.img(name);
      const palette = image.palette ?? globalPalette;
      if (!palette) continue;
      const canvas = toCanvas(image, palette);
      const painting = { name, width: image.width, height: image.height, canvas, url: canvas.toDataURL('image/png') };
      paintings.set(role, painting);
      const variable = CSS_VAR[role];
      if (variable) publish(variable, `url("${painting.url}")`);
      // The frame and mark URLs the sheet reads, under names no colour can collide with.
      if (GUI_ART_VAR[role]) publish(GUI_ART_VAR[role], `url("${painting.url}")`);
      applied.push(role);
    } catch {
      // A painting this install does not carry is simply not published; the CSS fallback stands.
    }
  }

  // ── the ink ───────────────────────────────────────────────────────────────
  // Arena's own, each a pixel of the painting named in `GUI_INK`. Published whether or not the
  // painting was read: a colour is a fact about the game, and text still has to be legible in a
  // folder that is missing its art.
  for (const [name, value] of Object.entries(GUI_INK)) publish(GUI_INK_VAR[name], value);

  // ── the three frames, nine-sliced ─────────────────────────────────────────
  // Slice and fill are published together because a frame without its centre is a picture of a
  // frame: the centre is a *tile of the same painting*, repeated at its own size, which is why a
  // page of any height is paper and not a stretched photograph of paper.
  const slices = [
    ['paper', 'parchment', GUI_SLICE.paper],
    ['stone', 'frame', GUI_SLICE.stone],
    ['plate', 'command', GUI_SLICE.plate],
  ];
  for (const [role, paintingRole, slice] of slices) {
    if (!paintings.has(paintingRole)) continue;
    publish(GUI_SLICE_VAR[role], sliceCss(slice));
  }

  // ── the cuts ──────────────────────────────────────────────────────────────
  // One URL per piece of the cutting table. A cut whose painting is missing is skipped, and the
  // piece simply does not draw.
  for (const [role, cut] of Object.entries(GUI_CUTS)) {
    const source = paintings.get(roleForPainting(cut.image));
    if (!source) continue;
    if (!cutFits(cut, source.canvas.width, source.canvas.height)) continue;
    const url = `url("${crop(source.canvas, cut.x, cut.y, cut.w, cut.h).toDataURL('image/png')}")`;
    publish(GUI_PIECE_VAR[role], url);
    // **The command plate is also a frame.** Its crop — not the whole 320-pixel strip — is what
    // `border-image` slices, because slicing the strip would take its borders from the strip's
    // own edges, which are other buttons.
    if (role === 'plate') publish('--gk-plate', url);
    applied.push(role);
  }

  // ── the command strip's ten buttons ───────────────────────────────────────
  // 320 / 10 is 32 exactly, which is why this is the strip a hotbar is cut from rather than an
  // invented icon set. Published for a caller that wants the original's icons; the interface's own
  // cells wear the empty plate instead, because a cell holding a potion must not be drawn as a
  // sword.
  const slots = [];
  const command = paintings.get('command');
  if (command) {
    const width = Math.floor(command.width / COMMAND_SLOTS);
    for (let i = 0; i < COMMAND_SLOTS; i++) {
      const url = crop(command.canvas, i * width, 0, width, command.height).toDataURL('image/png');
      slots.push(url);
      // **One glyph, one variable.** The pack and the spellbook wear these by kind
      // (`items.js`'s `iconRoleFor`), which is what gives a weapon row its crossed swords and a
      // spell row its sunburst without a single drawn pixel.
      if (i < GUI_ICON_COUNT) publish(iconVariable(i), `url("${url}")`);
    }
    publish('--ar-command-width', `${command.width}`);
    publish('--ar-command-height', `${command.height}`);
  }

  if (paintings.size) {
    root.dataset.arenaGui = 'on';
    root.dataset.guiKit = 'on';
  }
  return { paintings, slots, applied, ink: { ...GUI_INK } };
}

/**
 * The role a painting is held under, from its filename — a cut names the file, and the paintings
 * are keyed by role.
 *
 * @param {string} file
 * @returns {string}
 */
function roleForPainting(file) {
  for (const [role, name] of Object.entries(GUI_PAINTINGS)) {
    if (name === file) return role;
  }
  return file;
}

/**
 * A `<canvas>` of one painting, for a screen that draws rather than styles (the ending, a title
 * card). Answers null when the install had no such picture.
 *
 * @param {{paintings: Map<string, GuiPainting>}|null} gui
 * @param {string} role
 * @returns {HTMLCanvasElement|null}
 */
export function paintingCanvas(gui, role) {
  return gui?.paintings?.get(role)?.canvas ?? null;
}
