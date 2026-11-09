// THE INTERFACE, CUT FROM ARENA'S OWN PAINTINGS.
//
// The owner, 2026-10-25: *"the game has received a blunt criticism by the internet that deemed it
// ai slop based on the gui … the gui needs a rework keeping everything it has but using the
// original game gui artwork only cropped cutted and repurposed to make a total gui overhaul that
// is beautiful … it needs to be highly artistic."*
//
// This module is the **cutting table**. It holds no pixels and no DOM: only the names of the
// install's paintings, the exact rectangle each piece of the interface is cut from, how a frame is
// nine-sliced, and the ink colours measured out of the art. `game/arenaGui.js` decodes the bytes
// and publishes this table to CSS; the stylesheet in `index.html` is the only thing that *draws*.
//
// Why a table and not hand-chosen CSS: a cut is a claim about the art — *this rectangle of
// `POPUP3.IMG` is the window's bezel* — and a claim can be checked. `tests/unit/guikit.test.mjs`
// opens the player's own `GLOBAL.BSA` and holds every rectangle below against the painting it
// names: inside its bounds, large enough for its slice, and (for the pieces that matter) actually
// the colours they are described as. A stylesheet could not be tested that way.
//
// ## The materials, and how much of them to use
//
// Arena's interface is two materials, and the whole look follows from keeping them apart:
//
//   * **Paper** — `PARCH.IMG`, 320×200: a scroll with rolled ends, torn sides and a blank tan
//     page between them. It is where the player *reads*: the menu, the pack, the book, the talk,
//     the map, the creation of a character. Ink on paper is DARK (`GUI_INK.ink`), and its headings
//     are ruled, not lit. The scroll is the interface's one big picture, and it is used as a
//     **frame** — its rolled ends and torn edge — never as wallpaper.
//   * **The plate** — the colour of `POPUP3.IMG`'s well, `#0f0f1b`, laid flat. Arena's window was
//     black marble; the owner's third report was that a tiled crop of that marble *"repeats
//     itself and its horrendous"*, and his fourth that the result should be *"modern and
//     minimalistic while still using og assets"*. So the plate is **one colour** and the paintings
//     are the **accents** on it: the scallop run of `POPUP3.IMG` across the top of the vitals,
//     `S2.IMG`'s command plates for anything pressable, `GOLD.IMG`'s coin, `COMPASS.IMG`'s mark,
//     `MENU.IMG`'s leaf flourish under a page's heading. Nothing here is a colour this project
//     invented — every value in `GUI_INK` is a pixel of the painting named beside it, read
//     through `PAL.COL`.
//
// ## The cutout rule
//
// A palettized Arena painting is a **1-bit cutout**: index 0 is a hole and every other index is
// opaque (`engine/ui/bitmapCanvas.js` holds the same law for the classic screens). That is what
// lets `PARCH.IMG`'s torn edge show the world through it and what lets the compass mark sit on
// the view. It is also why every crop below is drawn without a matte.

/**
 * The paintings the interface is built from, and what each one is for.
 *
 * These are records in the player's own `GLOBAL.BSA` — nothing is bundled. A folder without one
 * of them falls back to the stylesheet's own ink, and the interface still draws.
 */
export const GUI_PAINTINGS = Object.freeze({
  /** `P1.IMG` (320×53) — the in-play status bar: wells, framed icon slots, the message box. */
  status: 'P1.IMG',
  /** `S2.IMG` (320×36) — the command strip: ten 32×36 buttons, and two empty plates under them. */
  command: 'S2.IMG',
  /** `POPUP3.IMG` (318×122) — the inventory window: gold-grey bezel, gold scallop band, marble. */
  frame: 'POPUP3.IMG',
  /** `POPUP.IMG` (200×100) — the narrow dialog; kept for a caller that wants a small frame. */
  frameSmall: 'POPUP.IMG',
  /** `PARCH.IMG` (320×200) — the blank scroll every page is written on. */
  parchment: 'PARCH.IMG',
  /** `MENU.IMG` (320×200) — the title menu: a scroll with a ruled, gemmed inner frame. */
  menu: 'MENU.IMG',
  /** `COMPASS.IMG` (38×17) — the compass mark. */
  compass: 'COMPASS.IMG',
  /** `GOLD.IMG` (18×8) — the purse's coin. */
  gold: 'GOLD.IMG',
  /** `KEY.IMG` (21×7) — a key's mark. */
  key: 'KEY.IMG',
  /** `CHARSPEL.IMG` (320×200) — the character-sheet page, hoarded for a page that wants it. */
  sheet: 'CHARSPEL.IMG',
});

/**
 * How a frame is nine-sliced: the distance, in the painting's own pixels, from each edge to the
 * part that must not stretch.
 *
 * Read off the paintings rather than chosen. `PARCH.IMG`'s rolled ends are rows 2–20 and its torn
 * edge is six or seven columns wide, so 21/8/21/8 keeps both whole and leaves the blank page in
 * the middle to grow. `POPUP3.IMG`'s bezel — the grey outer moulding and the gold corner pearls —
 * is seven pixels, and past it is the marble. `S2.IMG`'s empty plate is a two-pixel gold rule.
 *
 * @typedef {{top:number,right:number,bottom:number,left:number}} Slice
 */
export const GUI_SLICE = Object.freeze({
  /**
   * The scroll: the rolled end at the top is rows 2–20 of `PARCH.IMG` and the one at the
   * bottom is rows 180–199, so the two are **not** the same depth (21 above, 20 below) — the
   * sheet is 180 rows of paper in a 200-row buffer. The torn edge is about twelve columns wide
   * on each side. Read off the painting, not chosen: `tests/unit/guikit.test.mjs` measures the
   * share of each row and column that is blank page and holds these four numbers to it.
   */
  paper: Object.freeze({ top: 21, right: 12, bottom: 20, left: 12 }),
  /** The inventory window's bezel. */
  stone: Object.freeze({ top: 7, right: 7, bottom: 7, left: 7 }),
  /** A command plate: its two-pixel gold rule. */
  plate: Object.freeze({ top: 3, right: 3, bottom: 3, left: 3 }),
});

/**
 * One rectangle of one painting.
 *
 * @typedef {{image: string, x: number, y: number, w: number, h: number, note: string}} Cut
 */

/** @type {Readonly<Record<string, Readonly<Cut>>>} */
export const GUI_CUTS = Object.freeze({
  /**
   * **The blank page.** A patch of `PARCH.IMG` with no tuft, no stain and no edge — the tile a
   * page's paper is repeated from, so a window of any height is paper and never a stretched
   * photograph of paper. Sampled `#aa7d48`, the same tan the whole sheet is.
   */
  paper: Object.freeze({ image: 'PARCH.IMG', x: 150, y: 84, w: 48, h: 40, note: 'blank parchment' }),

  /**
   * **The empty command plate.** `S2.IMG`'s two blank buttons under the icon strip. This is the
   * install's own *button*: a dark field in a gold rule, used here at any size as the plate every
   * pressable thing wears — a hotbar cell, a menu row, a dialog's two answers.
   */
  plate: Object.freeze({ image: 'S2.IMG', x: 14, y: 22, w: 68, h: 12, note: 'an empty command plate' }),
  /**
   * **The scallop band.** The running gold ornament that sits under `POPUP3.IMG`'s top bezel: a
   * chain of linked curls with a pearl at each join. Repeating it horizontally is what gives a
   * stone panel a lintel — the original's own, not a CSS border.
   */
  band: Object.freeze({ image: 'POPUP3.IMG', x: 20, y: 8, w: 296, h: 7, note: 'the gold scallop run' }),
  /**
   * **The flourish.** The leaf scroll that separates `MENU.IMG`'s rows — its two curling fronds
   * meeting a knot in the middle. Used as the rule under a paper page's heading, and under a
   * heading it is exactly the ornament the original put there.
   */
  flourish: Object.freeze({ image: 'MENU.IMG', x: 104, y: 84, w: 128, h: 20, note: 'the leaf scroll' }),
  /**
   * **The scroll corner.** `MENU.IMG`'s ornamental corner: a curling bracket in brown ink with a
   * green-and-red rule running out of it. Set in a paper page's corner, mirrored as needed.
   */
  scrollCorner: Object.freeze({ image: 'MENU.IMG', x: 58, y: 44, w: 34, h: 34, note: 'the ruled corner' }),
  /**
   * **The coin.** `GOLD.IMG` is the purse's mark; kept as a cut so the loader publishes one URL
   * and the stylesheet does not have to know its size.
   */
  coin: Object.freeze({ image: 'GOLD.IMG', x: 0, y: 0, w: 18, h: 8, note: 'the coin' }),
});

/**
 * The ink. Every value is a pixel of the painting named beside it, so the interface's palette is
 * Arena's palette and a change here can be argued with a hex editor.
 *
 * `contrast` records the pair each piece of text is set in, and `tests/unit/guikit.test.mjs`
 * holds every pair at or above 4.5:1 — the WCAG ratio for body text. The owner's oldest GUI
 * complaint was *"the colour of the gui … make text non visible"*, so legibility is a law here,
 * not a taste.
 */
//
// ## Pigment and legibility
//
// Five of these are pixels of the paintings, named where they are read. Four are the same
// pigment **deepened**, and the reason is the owner's oldest GUI complaint — *"the colour of the
// gui … make text non visible"*. `MENU.IMG` writes its script in a red so light that it reads on
// tan at **2.6:1**, which is fine for a title cut into a picture and unreadable for 12px body
// text. So the *hue* stays the game's and the *value* is taken far enough down to reach 4.5:1 on
// the page — `red` is `MENU.IMG`'s `#8c1a10` darkened, `green` is its `#2f5a2a` darkened, and
// `quietStone` is the stone's gold held back. Every one of those is marked below, and
// `tests/unit/guikit.test.mjs` checks both halves of the claim: that the five pixels really are
// in the painting, and that every text pair clears 4.5:1 **on both tones of the paper**, since
// `PARCH.IMG` is not one flat colour.
export const GUI_INK = Object.freeze({
  /** `POPUP3.IMG`'s scallop run, 1 146 pixels of it. Stone's ink. */
  gold: '#e7d700',
  /** `POPUP3.IMG`'s darker gold — the shadow side of the same run. */
  goldDeep: '#d16f09',
  /** The command plate's brighter rule (`S2.IMG` row 22): a lit edge, for a frame or a press. */
  goldLit: '#ffa700',
  /** `PARCH.IMG`'s paper, 27 869 pixels — the blank page's tan. */
  paper: '#aa8150',
  /** `PARCH.IMG`'s second tone, 18 387 pixels: the sheet is not one flat colour. */
  paperDeep: '#aa7d48',
  /** `MENU.IMG`'s script: the near-black red its title rows are written in (4 761 pixels). */
  ink: '#300c0c',
  /** The same ink laid twice — the page's small print, darker rather than greyer. */
  inkSoft: '#241009',
  /** `MENU.IMG`'s red (`#8c1a10`) deepened to carry text on paper. */
  red: '#3f0803',
  /** `MENU.IMG`'s green (`#2f5a2a`), deepened; a rule and a marker, never 12px text. */
  green: '#17300f',
  /**
   * The window marble's own deep black — what a stone panel's text is measured against. The slab
   * is mottled (its tones run from `#0f0f1b` to `#221f26` and its lit veins to `#363642`), so the
   * gold is held to the *lightest* of them as well as this one: 10.9:1 on the marble's pale mid
   * tone and 8.0:1 on a vein, both far above the 4.5:1 body text is held to.
   */
  stone: '#13131f',
  /** `POPUP3.IMG` (150, 60) — marble's lit side. */
  stoneLit: '#363642',
  /** `POPUP3.IMG`'s bezel grey (row 1). A moulding, never text. */
  bezel: '#707070',
  /** `POPUP3.IMG` (60, 100) — the black a stone panel's well is. */
  well: '#0f0f1b',
  /** The stone's gold held back for quiet lines: 6.7:1 on marble. */
  quietStone: '#b9a06a',
});

/**
 * The text pairs the stylesheet is built on, with the contrast each is held to.
 *
 * Paper text is dark ink on tan; stone text is gold on marble. Both are consistently
 * *dark-on-light* or *light-on-dark* — never the dark-on-dark the port shipped once. The paper
 * pairs are checked against **both** tones the sheet is made of.
 */
export const GUI_CONTRAST = Object.freeze([
  Object.freeze({ name: 'ink on paper', fg: 'ink', bg: 'paper', min: 4.5 }),
  Object.freeze({ name: 'ink on the sheet\u2019s dark tone', fg: 'ink', bg: 'paperDeep', min: 4.5 }),
  Object.freeze({ name: 'small print on paper', fg: 'inkSoft', bg: 'paper', min: 4.5 }),
  Object.freeze({ name: 'a noun on paper', fg: 'red', bg: 'paper', min: 4.5 }),
  Object.freeze({ name: 'a noun on the sheet\u2019s dark tone', fg: 'red', bg: 'paperDeep', min: 4.5 }),
  Object.freeze({ name: 'gold on stone', fg: 'gold', bg: 'stone', min: 4.5 }),
  Object.freeze({ name: 'quiet stone on marble', fg: 'quietStone', bg: 'stone', min: 4.5 }),
]);

/**
 * Non-text pairs, held at the 3:1 WCAG asks of a boundary or a graphical object. The scroll's
 * own red and green live here: they rule a page, they do not write on it.
 */
export const GUI_RULE_CONTRAST = Object.freeze([
  Object.freeze({ name: 'the inner rule\u2019s red on paper', fg: 'red', bg: 'paper', min: 3 }),
  Object.freeze({ name: 'the inner rule\u2019s green on paper', fg: 'green', bg: 'paper', min: 3 }),
  Object.freeze({ name: 'the moulding on marble', fg: 'bezel', bg: 'stone', min: 3 }),
]);

//
// ## The names the stylesheet reads
//
// Three tables, because a CSS variable is a contract and a contract with two spellings is a bug:
// the first pass published `GOLD.IMG` over `--gk-gold` and every `color:` in the sheet went
// invalid, and an ink called `paper` would have overwritten the *frame* called `paper` the same
// way. So paintings, pieces and colours live in different namespaces, and
// `tests/unit/guikit.test.mjs` reads `index.html` and asserts that every `var(--gk-…)` the sheet
// uses is a name one of these tables publishes.

/** A painting's URL, by role. */
export const GUI_ART_VAR = Object.freeze({
  status: '--gk-status-art', command: '--gk-command-art', frame: '--gk-frame-art',
  frameSmall: '--gk-frame-small-art', parchment: '--gk-scroll', menu: '--gk-menu-art',
  compass: '--gk-compass', gold: '--gk-gold-mark', key: '--gk-key-mark', sheet: '--gk-sheet-art',
});

/** A cut's URL, by the name `GUI_CUTS` gives it. */
export const GUI_PIECE_VAR = Object.freeze({
  paper: '--gk-scroll-paper', plate: '--gk-plate', band: '--gk-band',
  flourish: '--gk-flourish', scrollCorner: '--gk-scroll-corner', coin: '--gk-coin',
});

/** A frame's slice, by the name `GUI_SLICE` gives it. */
export const GUI_SLICE_VAR = Object.freeze({
  paper: '--gk-scroll-slice', stone: '--gk-stone-slice', plate: '--gk-plate-slice',
});

/** An ink's colour, by the name `GUI_INK` gives it — kebab-cased. */
export const GUI_INK_VAR = Object.freeze(Object.fromEntries(
  Object.keys(GUI_INK).map((name) => [name, `--gk-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`]),
));

/**
 * How many command glyphs `S2.IMG` carries — its 320 pixels of strip are ten 32-pixel buttons,
 * and each is one of the game's own icons (swords, shields, sunburst, winged staff, scroll …).
 * `game/arenaGui.js` publishes them as `--gk-icon-0` … `--gk-icon-9`, and a row in the pack or
 * the spellbook wears one by kind (`game/items.js`'s `iconRoleFor`).
 */
export const GUI_ICON_COUNT = 10;

/** The custom property one command icon is published under. */
// eslint-disable-next-line no-unused-vars -- the name is the contract, read by the tests
export const iconVariable = (index) => `--gk-icon-${index}`;

/** Every custom property the loader can publish, for the stylesheet's own test to check. */
export function publishedVariables() {
  return new Set([
    ...Object.values(GUI_ART_VAR), ...Object.values(GUI_PIECE_VAR),
    ...Object.values(GUI_SLICE_VAR), ...Object.values(GUI_INK_VAR),
    ...Array.from({ length: GUI_ICON_COUNT }, (_, i) => iconVariable(i)),
  ]);
}

/** @param {string} hex @returns {[number, number, number]} */
export function rgbOf(hex) {
  const v = Number.parseInt(String(hex).replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * WCAG 2.1 relative luminance of an sRGB colour.
 * @param {[number, number, number]} rgb
 * @returns {number}
 */
export function luminanceOf([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * The WCAG contrast ratio of two colours, 1..21.
 * @param {string} a @param {string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const la = luminanceOf(rgbOf(a));
  const lb = luminanceOf(rgbOf(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Is a cut's rectangle inside a painting of this size?
 * @param {Cut} cut @param {number} width @param {number} height
 * @returns {boolean}
 */
export function cutFits(cut, width, height) {
  return cut.x >= 0 && cut.y >= 0 && cut.w > 0 && cut.h > 0
    && cut.x + cut.w <= width && cut.y + cut.h <= height;
}

/**
 * Is a slice legal for a painting — every inset positive, and the two sides of each axis adding up
 * to less than the painting (a slice that overlapped itself would have no centre to fill)?
 *
 * @param {Slice} slice @param {number} width @param {number} height
 * @returns {boolean}
 */
export function sliceFits(slice, width, height) {
  return slice.left > 0 && slice.top > 0 && slice.right > 0 && slice.bottom > 0
    && slice.left + slice.right < width && slice.top + slice.bottom < height;
}

/**
 * The CSS value of a nine-slice, in the order `border-image-slice` reads it.
 * @param {Slice} slice
 * @returns {string}
 */
export function sliceCss(slice) {
  return `${slice.top} ${slice.right} ${slice.bottom} ${slice.left}`;
}

/**
 * Every cut and every slice, as one list, for a test to walk.
 * @returns {{role: string, cut: Cut}[]}
 */
export function cutList() {
  return Object.entries(GUI_CUTS).map(([role, cut]) => ({ role, cut }));
}
