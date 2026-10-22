// THE GUI, IN ARENA'S OWN PICTURES.
//
// The owner, 2026-10-22: *"ALL the gui of the whole game needs a complete rework using the og
// arena artworks … the gui needs to be perfect gorgeous and og arena like"*.
//
// Arena's interface is not a look this project has to invent: it is a set of 320×200 VGA
// paintings that ship in the player's own `GLOBAL.BSA`. The pieces this module reads are the
// ones the original builds every screen out of:
//
//   * **`P1.IMG`** (320×53) — the status bar. Its left wells hold the health and spell bars,
//     its two rows of framed icons the things in hand, and its right box the game's messages.
//   * **`S2.IMG`** (320×36) — the command strip: ten 32×36 framed buttons, which is exactly
//     the shape a hotbar wants.
//   * **`POPUP.IMG` … `POPUP11.IMG`** — the dialog frames a shop, a riddle or a list is drawn
//     in; `POPUP3.IMG` (318×122) is the wide one most of them use.
//   * **`PARCH.IMG`** (320×200) — a blank parchment scroll: the menu, the ending and the talk
//     panel are written on it.
//   * **`COMPASS.IMG`** (38×17), **`GOLD.IMG`** (18×8), **`KEY.IMG`** (21×7) — the small marks.
//
// Nothing here is bundled: the bytes come from the player's copy through `ArenaData`, are
// decoded by the same `.IMG` reader the walls use (`arena/image.js`), and are handed to CSS as
// data URLs. A folder without them leaves the stylesheet's own fallback colours in place — the
// GUI never fails to draw because a picture is missing.
//
// ## The cutout rule
//
// A palettized Arena painting is a **1-bit cutout**: index 0 is transparent and every other
// index is opaque (`engine/ui/bitmapCanvas.js` says the same for the classic screens). That is
// what makes `PARCH.IMG`'s curled edges show the world behind them and what makes
// `COMPASS.IMG`'s mark sit on the view rather than in a grey box. The status bar and the
// command strip are 0% index 0, so they are unaffected.

/** The painting each part of the interface is made of, and whether its index 0 is a hole. */
export const GUI_ART = Object.freeze({
  /** The status bar under the view — `P1.IMG`, 320×53. */
  status: 'P1.IMG',
  /** The strip of ten command buttons — `S2.IMG`, 320×36. */
  command: 'S2.IMG',
  /** The wide dialog frame — `POPUP3.IMG`, 318×122. */
  frame: 'POPUP3.IMG',
  /** The narrow dialog frame — `POPUP.IMG`, 200×100. */
  frameSmall: 'POPUP.IMG',
  /** The parchment every page is written on — `PARCH.IMG`, 320×200. */
  parchment: 'PARCH.IMG',
  /** The compass mark — `COMPASS.IMG`, 38×17. */
  compass: 'COMPASS.IMG',
  /** The purse's mark — `GOLD.IMG`, 18×8. */
  gold: 'GOLD.IMG',
  /** The key's mark — `KEY.IMG`, 21×7. */
  key: 'KEY.IMG',
  /** The title screen's scroll — `MENU.IMG`, 320×200. */
  menu: 'MENU.IMG',
});

/** How many buttons `S2.IMG` carries, and therefore how many hotbar cells the strip draws. */
export const COMMAND_SLOTS = 10;

/** The CSS custom property each painting is published under. */
export const CSS_VAR = Object.freeze({
  status: '--ar-status',
  command: '--ar-command',
  frame: '--ar-frame',
  frameSmall: '--ar-frame-small',
  parchment: '--ar-parchment',
  compass: '--ar-compass',
  // **`--ar-gold` is a *colour*, not a picture.** The first version published `GOLD.IMG` under
  // `--ar-gold`, which overwrote the stylesheet's gold with `url(…)`; every `color:
  // var(--ar-gold)` then resolved to an invalid colour and the text fell back to inherited
  // black on a dark panel — the owner's *"the colour of the gui … make text non visible"*.
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
 * Crop one rectangle out of a canvas, as a canvas of its own.
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
 * Read the install's GUI paintings and publish them to the page as CSS variables.
 *
 * Every painting is optional. The function answers what it found, and a caller that got
 * nothing leaves the stylesheet's fallback in place rather than drawing an empty frame.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @param {{document?: Document, images?: Record<string,string>}} [opts]
 * @returns {Promise<{paintings: Map<string, GuiPainting>, slots: string[], applied: string[]}>}
 */
export async function loadArenaGui(data, opts = {}) {
  const doc = opts.document ?? (typeof document !== 'undefined' ? document : null);
  const wanted = opts.images ?? GUI_ART;
  /** @type {Map<string, GuiPainting>} */
  const paintings = new Map();
  const applied = [];
  if (!data || !doc) return { paintings, slots: [], applied };

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
      if (variable) {
        doc.documentElement.style.setProperty(variable, `url("${painting.url}")`);
        applied.push(role);
      }
    } catch {
      // A painting this install does not carry is simply not published; the CSS fallback stands.
    }
  }

  // The command strip is a strip of ten buttons: crop each one once so a hotbar cell can wear
  // its own picture. 320 / 10 is 32 exactly, which is why this is the strip a hotbar is cut
  // from rather than an invented icon set.
  const slots = [];
  const command = paintings.get('command');
  if (command) {
    const width = Math.floor(command.width / COMMAND_SLOTS);
    for (let i = 0; i < COMMAND_SLOTS; i++) {
      slots.push(crop(command.canvas, i * width, 0, width, command.height).toDataURL('image/png'));
    }
    doc.documentElement.style.setProperty('--ar-command-width', `${command.width}`);
    doc.documentElement.style.setProperty('--ar-command-height', `${command.height}`);
  }

  // **The stone and the gold lintel.** `POPUP3.IMG` is the install's own inventory window: a
  // mottled black rock inside a double-zigzag gold border. A plain rectangle of the rock tiles
  // as a page's material, and the border's two strips are published as the panel's top and
  // bottom bands, so a window of any size wears the original's ornament rather than a CSS
  // imitation of it.
  const frame = paintings.get('frame');
  if (frame && frame.canvas.width > 140 && frame.canvas.height > 70) {
    const x = Math.round(frame.canvas.width * 0.2);
    const y = Math.round(frame.canvas.height * 0.38);
    const w = Math.min(120, Math.round(frame.canvas.width * 0.42));
    const h = Math.min(48, Math.round(frame.canvas.height * 0.3));
    const stone = crop(frame.canvas, x, y, w, h);
    doc.documentElement.style.setProperty('--ar-stone', `url("${stone.toDataURL('image/png')}")`);
    doc.documentElement.style.setProperty('--ar-stone-w', `${w}px`);
    doc.documentElement.style.setProperty('--ar-stone-h', `${h}px`);
    const bandH = Math.min(20, Math.floor(frame.canvas.height / 6));
    const band = crop(frame.canvas, 0, 0, frame.canvas.width, bandH);
    const foot = crop(frame.canvas, 0, frame.canvas.height - bandH, frame.canvas.width, bandH);
    doc.documentElement.style.setProperty('--ar-band', `url("${band.toDataURL('image/png')}")`);
    doc.documentElement.style.setProperty('--ar-band-bottom', `url("${foot.toDataURL('image/png')}")`);
    applied.push('stone', 'band');
  }

  if (paintings.size) doc.documentElement.dataset.arenaGui = 'on';
  return { paintings, slots, applied };
}

/**
 * A `<canvas>` of one painting, for a screen that draws rather than styles (the ending, a
 * title card). Answers null when the install had no such picture.
 *
 * @param {{paintings: Map<string, GuiPainting>}|null} gui
 * @param {string} role
 * @returns {HTMLCanvasElement|null}
 */
export function paintingCanvas(gui, role) {
  return gui?.paintings?.get(role)?.canvas ?? null;
}
