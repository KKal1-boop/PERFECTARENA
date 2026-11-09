// THE GUI'S CUTTING TABLE, HELD AGAINST THE INSTALL.
//
// `engine/ui/guiKit.js` is a set of claims: this rectangle of `POPUP3.IMG` is the window's
// bezel, this one of `S2.IMG` is a command plate, this colour is the scallop run's gold. Every
// claim is checkable against the player's own `GLOBAL.BSA`, so this file checks them — the cuts
// are inside their paintings, the slices fit, the pieces really are the thing they are named
// after, and every text pair clears WCAG 4.5:1 on **both** tones of the parchment.
//
// The last group is the one the owner cares about most: his oldest GUI complaint was that the
// interface wrote dark text on a dark panel — *"the colour of the gui … make text non visible"* —
// and a stylesheet can regress that silently. A ratio cannot.
//
// Run:  node --test tests/unit/guikit.test.mjs
//       ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/guikit.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parseBsa } from '../../src/arena/bsaArchive.js';
import { parseImg } from '../../src/arena/image.js';
import { parseCol } from '../../src/arena/palette.js';
import {
  GUI_CONTRAST, GUI_CUTS, GUI_INK, GUI_INK_VAR, GUI_PAINTINGS, GUI_RULE_CONTRAST, GUI_SLICE,
  contrastRatio, cutFits, cutList, luminanceOf, publishedVariables, rgbOf, sliceCss, sliceFits,
} from '../../src/engine/ui/guiKit.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const ARCHIVE = (() => {
  const root = path.resolve(ARENA_PATH);
  const candidates = [root, path.join(root, 'ARENA'), path.join(root, 'DATA')];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'GLOBAL.BSA')));
  return found ? path.join(found, 'GLOBAL.BSA') : null;
})();

const bsa = ARCHIVE ? parseBsa(new Uint8Array(fs.readFileSync(ARCHIVE))) : null;
const globalPalette = (() => {
  const palette = ARCHIVE ? path.join(path.dirname(ARCHIVE), 'PAL.COL') : null;
  return palette && fs.existsSync(palette) ? parseCol(fs.readFileSync(palette)) : null;
})();

/** The palette an `.IMG` is drawn with: its own embedded one, else the install's `PAL.COL`. */
function paletteOf(image) {
  return image.palette ?? globalPalette;
}

/** @param {string} file @returns {{width:number,height:number,indices:Uint8Array,palette:object|null}} */
function painting(file) {
  const bytes = bsa.get(file);
  assert.ok(bytes, `${file} is not in this install's GLOBAL.BSA`);
  return parseImg(bytes, file);
}

/** `#rrggbb` of one palette index. */
function hexOf(palette, index) {
  return `#${[palette.rgb[index * 3], palette.rgb[index * 3 + 1], palette.rgb[index * 3 + 2]]
    .map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The distinct colours a rectangle of a painting actually uses. */
function coloursIn(image, rect) {
  const palette = paletteOf(image);
  const seen = new Set();
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      seen.add(hexOf(palette, image.indices[y * image.width + x]));
    }
  }
  return seen;
}

/** The colour occupying the most pixels of a rectangle — the piece's own colour. */
function dominantColour(image, rect) {
  const palette = paletteOf(image);
  const count = new Map();
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const key = hexOf(palette, image.indices[y * image.width + x]);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
}

test('the cutting table names only paintings the interface ships', () => {
  const known = new Set(Object.values(GUI_PAINTINGS));
  for (const { role, cut } of cutList()) {
    assert.ok(known.has(cut.image), `${role} is cut from ${cut.image}, which is not a GUI painting`);
    assert.ok(cut.note && cut.note.length > 3, `${role} says what it is`);
  }
});

test('every cut is inside the painting it names', { skip: !bsa && 'no Arena install on this machine' }, () => {
  for (const { role, cut } of cutList()) {
    const image = painting(cut.image);
    assert.ok(cutFits(cut, image.width, image.height),
      `${role} ${cut.x},${cut.y} ${cut.w}×${cut.h} is outside ${cut.image} (${image.width}×${image.height})`);
  }
});

test('every nine-slice fits its painting and leaves a centre to fill', { skip: !bsa && 'no Arena install on this machine' }, () => {
  const framed = [
    ['paper', GUI_SLICE.paper, GUI_PAINTINGS.parchment],
    ['stone', GUI_SLICE.stone, GUI_PAINTINGS.frame],
    ['plate', GUI_SLICE.plate, GUI_PAINTINGS.command],
  ];
  for (const [role, slice, file] of framed) {
    const image = painting(file);
    assert.ok(sliceFits(slice, image.width, image.height),
      `the ${role} slice ${sliceCss(slice)} has no centre inside ${file}`);
    assert.equal(sliceCss(slice).split(' ').length, 4, `the ${role} slice reads as four insets`);
  }
});

test('the paper slice is where the scroll really stops being a roll', { skip: !bsa && 'no Arena install on this machine' }, () => {
  // `PARCH.IMG` is a rolled scroll: rows 2–20 are the roll (dark browns), and the blank page
  // starts at 21. The slice has to be that boundary, or the frame cuts the roll in half or
  // leaves a stripe of it in the middle of every page.
  const image = painting(GUI_PAINTINGS.parchment);
  const paper = GUI_INK.paper;
  const paperDeep = GUI_INK.paperDeep;
  /** The share of a row that is the blank page (the sheet carries a few faint tufts). */
  const paperShare = (y) => {
    const palette = paletteOf(image);
    let paper = 0, total = 0;
    for (let x = 20; x < image.width - 20; x++) {
      const colour = hexOf(palette, image.indices[y * image.width + x]);
      total++;
      if (colour === GUI_INK.paper || colour === GUI_INK.paperDeep) paper++;
    }
    return paper / total;
  };
  assert.ok(paperShare(GUI_SLICE.paper.top) > 0.85, `the row at the slice is the page (${paperShare(GUI_SLICE.paper.top).toFixed(2)})`);
  assert.ok(paperShare(GUI_SLICE.paper.top - 1) < 0.35, `the row above it is still the roll (${paperShare(GUI_SLICE.paper.top - 1).toFixed(2)})`);
  assert.ok(paperShare(image.height - GUI_SLICE.paper.bottom) < 0.35, 'the bottom inset is the roll too');
  assert.ok(paperShare(image.height - GUI_SLICE.paper.bottom - 1) > 0.85, 'and the page above it');
});

test('the command plate is a gold rule around a dark field', { skip: !bsa && 'no Arena install on this machine' }, () => {
  const cut = GUI_CUTS.plate;
  const image = painting(cut.image);
  // The top row of the crop is the install's own gold; the middle of it is the dark field a
  // button is pressed on. A crop that missed the button would be one flat colour.
  const top = coloursIn(image, { x: cut.x + 2, y: cut.y, w: cut.w - 4, h: 1 });
  const middle = coloursIn(image, { x: cut.x + 4, y: cut.y + Math.floor(cut.h / 2), w: cut.w - 8, h: 1 });
  const golds = [GUI_INK.gold, GUI_INK.goldDeep, GUI_INK.goldLit];
  assert.ok([...top].some((c) => golds.includes(c)), `the plate's rule is gold: ${[...top].join(',')}`);
  assert.ok([...middle].includes(GUI_INK.well), `the plate's field is the dark well: ${[...middle].join(',')}`);
});

test('the paper is a page, not a flat colour — and the plate is one colour, not a texture', { skip: !bsa && 'no Arena install on this machine' }, () => {
  const paper = coloursIn(painting(GUI_CUTS.paper.image), GUI_CUTS.paper);
  assert.ok(paper.size <= 6, `the paper tile is blank (${paper.size} colours)`);

  // **There is no marble cut, on purpose.** The owner, 2026-10-25: *"the black texture you're
  // using for the gui is badly cropped it repeats itself and its horrendous"* and then *"make it
  // also modern and minimalistic while still using og assets"*. A tiled crop of `POPUP3.IMG`'s
  // rock cannot be made to look like one piece of stone at every panel size, so the plate is the
  // painting's own **flat** black (`GUI_INK.stone`, a pixel of that painting) and the art is the
  // accent instead. This holds that decision to the table: the cut is gone, and the ink it was
  // measured against is the stone's own.
  assert.equal(GUI_CUTS.marble, undefined, 'no marble tile is published for the stylesheet to repeat');
  assert.equal(GUI_INK.stone, '#13131f');
  const windowArt = painting(GUI_PAINTINGS.frame);
  assert.ok(coloursIn(windowArt, { x: 0, y: 0, w: windowArt.width, h: windowArt.height }).has(GUI_INK.stone),
    'the flat plate colour is a pixel of POPUP3.IMG');
});

test('the scallop band is the gold run, and the flourish is ornament and not lettering', { skip: !bsa && 'no Arena install on this machine' }, () => {
  const band = coloursIn(painting(GUI_CUTS.band.image), GUI_CUTS.band);
  assert.ok([...band].some((c) => c === GUI_INK.gold), 'the band carries the install’s gold');
  assert.ok(band.size >= 4, 'the band is a run of shades, not one line');

  // **The flourish must not be a row of the menu's text.** `MENU.IMG` is lettered; cropping a
  // heading into a rule would print half a sentence under every page title. The leaf scroll has
  // no ink darker than the script — the script's own colour (`#300c0c`) is what writes words —
  // so a crop that contains it is a crop of text.
  const flourish = coloursIn(painting(GUI_CUTS.flourish.image), GUI_CUTS.flourish);
  assert.ok(!flourish.has(GUI_INK.ink), `the flourish contains no lettering: ${[...flourish].join(',')}`);
});

test('the ink is the paintings’ own, pixel for pixel', { skip: !bsa && 'no Arena install on this machine' }, () => {
  /** Where each pigment is read from — the claim, not a memory of one. */
  const source = {
    gold: 'POPUP3.IMG', goldDeep: 'POPUP3.IMG', paper: 'PARCH.IMG', paperDeep: 'PARCH.IMG',
    ink: 'MENU.IMG', stone: 'POPUP3.IMG', stoneLit: 'POPUP3.IMG', bezel: 'POPUP3.IMG', well: 'POPUP3.IMG',
  };
  for (const [name, file] of Object.entries(source)) {
    const image = painting(file);
    const palette = paletteOf(image);
    const used = new Set();
    for (const index of image.indices) used.add(hexOf(palette, index));
    assert.ok(used.has(GUI_INK[name]), `${name} ${GUI_INK[name]} is a colour of ${file}`);
  }
});

test('the darkened pigments keep the game’s hues', { skip: !bsa && 'no Arena install on this machine' }, () => {
  // The four derived inks are the paintings' pigments taken down in value; if one drifted to a
  // different hue it would no longer be MENU.IMG's red, it would be this project's.
  const hueOf = (hex) => {
    const [r, g, b] = rgbOf(hex);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const apart = (a, b) => {
    const d = Math.abs(hueOf(a) - hueOf(b)) % 360;
    return d > 180 ? 360 - d : d;
  };
  assert.ok(apart(GUI_INK.red, '#8c1a10') < 12, `red ${GUI_INK.red} is still the menu rule's red`);
  assert.ok(apart(GUI_INK.green, '#2f5a2a') < 14, `green ${GUI_INK.green} is still the menu rule's green`);
  assert.ok(luminanceOf(rgbOf(GUI_INK.inkSoft)) <= luminanceOf(rgbOf(GUI_INK.ink)), 'small print is the ink laid heavier');
  assert.ok(luminanceOf(rgbOf(GUI_INK.quietStone)) < luminanceOf(rgbOf(GUI_INK.gold)), 'quiet stone is the gold held back');
});

test('every text pair is legible on the page it is written on', () => {
  for (const pair of GUI_CONTRAST) {
    const ratio = contrastRatio(GUI_INK[pair.fg], GUI_INK[pair.bg]);
    assert.ok(ratio >= pair.min,
      `${pair.name}: ${GUI_INK[pair.fg]} on ${GUI_INK[pair.bg]} is ${ratio.toFixed(2)}:1, under ${pair.min}`);
  }
  // Both tones of the parchment, explicitly: a panel may sit over either patch of the sheet.
  for (const tone of ['paper', 'paperDeep']) {
    for (const fg of ['ink', 'inkSoft', 'red']) {
      const ratio = contrastRatio(GUI_INK[fg], GUI_INK[tone]);
      assert.ok(ratio >= 4.5, `${fg} on ${tone} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the rules and markers clear the 3:1 a boundary is held to', () => {
  for (const pair of GUI_RULE_CONTRAST) {
    const ratio = contrastRatio(GUI_INK[pair.fg], GUI_INK[pair.bg]);
    assert.ok(ratio >= pair.min, `${pair.name} is ${ratio.toFixed(2)}:1, under ${pair.min}`);
  }
});

test('a missing painting is not a crash: the table is plain data', async () => {
  // `arenaGui.js` skips what it cannot read, and the stylesheet's fallbacks are the same inks.
  // What must not happen is the table itself depending on a browser or on a file existing.
  const source = new URL('../../src/engine/ui/guiKit.js', import.meta.url);
  const text = fs.readFileSync(source, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // A *word* is not a use: "window marble" is a note on a cut, `window.` is the browser.
  assert.ok(!/\b(document|window|localStorage|navigator)\s*\.|(^|[^.\w])fetch\(/m.test(text),
    'the cutting table touches no browser API');
  assert.ok(!/base64|data:image/.test(text), 'and bundles no pixels');
});

test('the loader reads a role for every cut, and a slice for every frame', async () => {
  // The names have to meet: `GUI_CUTS` names files, `GUI_PAINTINGS` names roles, and the loader
  // walks from one to the other (`roleForPainting`). A cut from a painting with no role would
  // silently never publish.
  const { GUI_ART, CSS_VAR } = await import('../../src/game/arenaGui.js');
  assert.equal(GUI_ART, GUI_PAINTINGS, 'the loader publishes the same table');
  for (const { role, cut } of cutList()) {
    const known = Object.values(GUI_PAINTINGS).includes(cut.image);
    assert.ok(known, `${role}'s painting has a role`);
  }
  // The first pass's CSS names are still written, because a probe may read them.
  for (const name of ['status', 'command', 'frame', 'parchment', 'compass', 'gold', 'key', 'menu']) {
    assert.ok(CSS_VAR[name]?.startsWith('--ar-'), `${name} still publishes its first-pass variable`);
  }
});

test('every variable the stylesheet asks for is one the loader publishes', () => {
  // The first pass published `GOLD.IMG` over a variable the sheet used as a *colour*, and every
  // `color:` in the sheet went invalid — the owner's "make text non visible". A name the sheet
  // reads and the loader never writes fails the same way (a transparent frame, an unset slice),
  // so the contract is checked by reading the sheet.
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const root = style.slice(style.indexOf(':root {'), style.indexOf('}', style.indexOf(':root {')));
  const declared = new Set([...root.matchAll(/(--gk-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const published = publishedVariables();
  const used = new Set([...style.matchAll(/var\((--gk-[a-z0-9-]+)/g)].map((m) => m[1]));
  const orphans = [...used].filter((name) => !published.has(name) && !declared.has(name));
  assert.deepEqual(orphans, [], `the sheet reads variables nothing publishes: ${orphans.join(', ')}`);
  // And the pair that started it: the gold is a colour, the painting is a URL, and they differ.
  assert.ok(declared.has(GUI_INK_VAR.gold), 'the sheet declares the gold ink');
  assert.ok(published.has('--gk-gold-mark') && GUI_INK_VAR.gold !== '--gk-gold-mark',
    'the coin painting and the gold ink are two different variables');
});

test('the node-side source this test reads is the same install the game reads', () => {
  if (!ARCHIVE) return;
  const source = nodeSource(ARENA_PATH);
  assert.ok(source.listing.includes('GLOBAL.BSA'), 'the source lists GLOBAL.BSA');
  assert.ok(source.listing.includes('PARCH.IMG') || bsa.has('PARCH.IMG'),
    'the parchment is loose or in the archive, as the loader expects');
});
