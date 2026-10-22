// THE MAP SCREEN'S OWN ICONOGRAPHY — the markers, the blink and the province plaques.
//
// The world map is the one screen this port drew itself: `scenes/worldmap.js` paints the game's
// own map (`TAMRIEL.IMG`) and then covers it with **this project's** circles, diamonds, gold
// rectangles and uppercase monospace province names. Arena shipped all of that as art, in the
// player's own archive, and nothing here had ever read it (`docs/PORT_BLOCKS.md` B16, `D-35`):
//
//   `MAPOUT.CIF`     four marker icons — city, town, village, dungeon — in the marker gold
//   `MAPBLINK.CIF`   the same four, in the blink gold (the pair is what a blinking map is made of)
//   `OUTPROV.CIF`    the nine province name plates
//   `HIGHROCK.IMG`, `HAMERFEL.IMG`, …  **the nine hand-drawn province maps**, one per province
//
// The last of those changed the screen's shape, and it came from the owner: *"you click the
// province and then you zoom to an handrawn map of the province that then shows all the places and
// with little icons of villages dungeons and cities"* — which is what the archive holds and what
// the port was not doing. Nine 320×200 pictures with their own palettes, named for the nine
// provinces in the archive's own 8.3 spelling (the same habit as the executable's `Summurset`). And
// the coordinates are not merely plausible for them: `CITYDATA.64` stores each location's `local`
// point as 0…319 × 0…199 — **the province map's own pixel space** — so where a place sits on the
// hand-drawn map is the file's own number, not something this module rescales or invents. That is
// `provincePointOf` below, and it is why the two-level screen is a reading rather than a design.
//
// It is also a claim the art itself checks, and the check is the nicest thing in this block: **the
// province pictures mark their own towns with one cyan dot each, drawn at the town's `local`
// pixel** — a pixel this module never consulted, since it is the file's number. Measured over the
// nine records: eight of eight towns dotted in each of the eight outer provinces (64 of 72), and
// the Imperial Province's map — the Empire's own seat — carries no town dots at all.
// `tests/unit/mapscreen.test.mjs` holds that, so a future pass re-deriving positions cannot quietly
// move a settlement off the place the artist drew it.
//
// Every number in this file is read off those records or off `PAL.COL`, and the readings are
// written down where they happen, because the whole point of the block is that an invented
// overlay is replaced by the game's own and the replacement has to be checkable:
//
//   * **The icons are outlines.** Each frame's pixels are only **index 0** (nothing) and **one**
//     colour index: `194` in `MAPOUT.CIF`, `223` in `MAPBLINK.CIF`. Measured, per frame, in
//     `tests/unit/mapscreen.test.mjs` — it is why the two records are the same shapes twice: the
//     map screen blinks its markers by drawing one set and then the other.
//   * **The two indices are colours in the global palette.** `PAL.COL[194]` is `#b1840d` (the
//     marker gold) and `PAL.COL[223]` is `#ffb800` (the bright stroke it alternates with). A
//     marker is therefore drawn with the palette the game keeps for it rather than a colour this
//     project picked: `MARKER_COLORS` below is those two bytes of `PAL.COL`.
//   * **The frames are the four kinds of place, in that order.** The sizes settle it without any
//     guessing: `18×13, 11×12, 10×10, 16×10` against the HUD's own `CITY.IMG` 16×11, `TOWN.IMG`
//     9×10, `VILLAGE.IMG` 8×8, `DUNGEON.IMG` 14×8 — every pair in the same order, each map icon
//     two pixels wider and taller than the HUD icon it names (`image.js`'s `RAW_DIMENSIONS` holds
//     the four HUD sizes). The dungeon's is the wide low one in both sets.
//   * **The province plates are the nine provinces in the game's own order.** Read off the
//     records by eye — the plates *are* text (`HIGH ROCK`, `HAMMERFELL`, `SKYRIM`, …) — and the
//     order they are stored in is the order `ACD.EXE`'s own province table lists
//     (`High Rock, Hammerfell, Skyrim, Morrowind, Summurset, Valenwood, Elsweyr, Black Marsh`)
//     with the Imperial Province as the ninth, which is also `CITYDATA.64`'s order. Three sources,
//     one order; `tests/unit/mapscreen.test.mjs` checks all three, **and the spellings are where
//     they disagree**: `Summurset` in the executable, `Summurset Isle` in `CITYDATA`, and
//     `SUMMERSET ISLE` on the plate. The plate is drawn by its record's own pixels, so the port
//     never has to choose a spelling — `plateIndexFor` accepts all three.
//   * **A plate is drawn in its own two colours**: `PAL.COL[206]` (`#5d4e0e`, the plate) and
//     `PAL.COL[20]` (`#8894a3`, the letters).
//
// NOT from the install, and stamped as this project's rule (`docs/PORT_BLOCKS.md` §1 rule 2):
// **`BLINK_PERIOD_MS`.** What the original's cadence was lives in `A.EXE`, which is not in this
// checkout. The *mechanism* is the game's (two records, one shape, two colours); the speed of it
// is a port decision and says so.

/**
 * The record the map screen's picture comes from: the continent, its parchment frame and the
 * province names, all drawn by Arena.
 *
 * `TAMRIEL.MNU` is the same screen as a loose file — see `docs/FORMATS.md` §12, where a `.MNU` is
 * now a verified alias of `.IMG` rather than an unknown: same 12-byte header, same embedded
 * palette, same three compressions. The archive's copy is used because it is the one every
 * install has.
 */
export const MAP_SCREEN_RECORD = 'TAMRIEL.IMG';

/** The map screen's own size, in pixels — the size every marker offset in this file is in. */
export const SCREEN_SIZE = Object.freeze({ width: 320, height: 200 });

/** The two marker records: the steady set and the set the map blinks to. */
export const MARKER_RECORDS = Object.freeze({
  steady: 'MAPOUT.CIF',
  blinking: 'MAPBLINK.CIF',
});

/** The colour index `MAPOUT.CIF` draws with — `PAL.COL[194]`. */
export const MARKER_INDEX = 194;
/** The colour index `MAPBLINK.CIF` draws with — `PAL.COL[223]`. */
export const BLINK_INDEX = 223;

/** `PAL.COL`'s own bytes at `MARKER_INDEX` and `BLINK_INDEX`, as CSS colours. */
export const MARKER_COLORS = Object.freeze({
  steady: '#b1840d',
  blinking: '#ffb800',
});

/** The province plate record, and its two colour indices in `PAL.COL`. */
export const PLATE_RECORD = 'OUTPROV.CIF';
/** The plate's background — `PAL.COL[206]`. */
export const PLATE_BACKGROUND_INDEX = 206;
/** The plate's letters — `PAL.COL[20]`. */
export const PLATE_TEXT_INDEX = 20;
/** The same two bytes as CSS colours, for the DOM's half of the screen. */
export const PLATE_COLORS = Object.freeze({ background: '#5d4e0e', text: '#8894a3' });

/**
 * The position each record carries with its frames, and this project does not use.
 *
 * Read off the records: a `.CIF` frame is stored with the pixel it is drawn at, and these are the
 * pixels `MAPOUT.CIF`/`MAPBLINK.CIF` and `OUTPROV.CIF` name. They are **a layout for a screen this
 * port does not draw** — the map's own name for a place is painted into the map art, and a plate at
 * (54, 53) would sit on top of the art's own hand-drawn `HIGH ROCK` rather than beside it. So the
 * screen places its plates at the pointer instead, and the reading sits here rather than being
 * silently dropped: a later pass that finds those offsets in `A.EXE` will want them.
 *
 * The two marker records carry **different** offsets for the village (`144, 80` against `114, 47`),
 * which is the clearest sign that the offsets are a drawing layout and not a property of the shape.
 *
 * @type {{markers: Readonly<Record<string, readonly {x: number, y: number}[]>>, plates: readonly {x: number, y: number}[]}}
 */
export const RECORD_LAYOUT = Object.freeze({
  markers: Object.freeze({
    [MARKER_RECORDS.steady]: Object.freeze([
      Object.freeze({ x: 106, y: 104 }), Object.freeze({ x: 138, y: 76 }),
      Object.freeze({ x: 144, y: 80 }), Object.freeze({ x: 160, y: 104 }),
    ]),
    [MARKER_RECORDS.blinking]: Object.freeze([
      Object.freeze({ x: 106, y: 104 }), Object.freeze({ x: 138, y: 76 }),
      Object.freeze({ x: 114, y: 47 }), Object.freeze({ x: 160, y: 104 }),
    ]),
  }),
  plates: Object.freeze([
    Object.freeze({ x: 54, y: 53 }), Object.freeze({ x: 74, y: 77 }), Object.freeze({ x: 144, y: 46 }),
    Object.freeze({ x: 224, y: 86 }), Object.freeze({ x: 39, y: 151 }), Object.freeze({ x: 108, y: 149 }),
    Object.freeze({ x: 150, y: 129 }), Object.freeze({ x: 218, y: 146 }), Object.freeze({ x: 135, y: 107 }),
  ]),
});

/**
 * How long a marker stays on one of the two records — **this project's rule**, not a reading.
 * The original's cadence is in `A.EXE`; what is the game's own is that there *are* two records.
 */
export const BLINK_PERIOD_MS = 800;

/**
 * The four marker icons, by the kind of place they mark.
 *
 * `frame` is the record's own frame index; the sizes are the frames' own, and they are here so a
 * caller can place an icon without decoding one (and so a reader can check the order against the
 * HUD's four sizes without opening the archive).
 *
 * @type {Readonly<Record<string, {frame: number, width: number, height: number}>>}
 */
export const MARKER_ICONS = Object.freeze({
  city: Object.freeze({ frame: 0, width: 18, height: 13 }),
  town: Object.freeze({ frame: 1, width: 11, height: 12 }),
  village: Object.freeze({ frame: 2, width: 10, height: 10 }),
  dungeon: Object.freeze({ frame: 3, width: 16, height: 10 }),
});

/** The kinds of place a marker can be, in the records' own order. */
export const MARKER_KINDS = Object.freeze(Object.keys(MARKER_ICONS));

/**
 * The nine province maps, in the order the province tables use.
 *
 * Every one of these names spells its province in the archive's 8.3 style — `HIGHROCK`,
 * `HAMERFEL`, `SKYRIM`, `MOROWIND`, `SUMERSET`, `VALNWOOD`, `ELSWEYR`, `BLAKMRSH`, `IMPERIAL` — the
 * same way `monsterArt.js` reads a sheet's name against a creature's, and the same order the
 * executable's province table and `CITYDATA.64` use.
 *
 * @type {readonly string[]}
 */
export const PROVINCE_MAPS = Object.freeze([
  'HIGHROCK.IMG', 'HAMERFEL.IMG', 'SKYRIM.IMG', 'MOROWIND.IMG', 'SUMERSET.IMG',
  'VALNWOOD.IMG', 'ELSWEYR.IMG', 'BLAKMRSH.IMG', 'IMPERIAL.IMG',
]);

/**
 * The province map for a province, by index or by any of the spellings the sources use.
 *
 * @param {number|string} province  a province index (0…8) or a name
 * @returns {string|null}
 */
export function provinceMapRecord(province) {
  if (typeof province === 'number') return PROVINCE_MAPS[province] ?? null;
  const index = plateIndexFor(String(province ?? ''));
  return index >= 0 ? PROVINCE_MAPS[index] : null;
}

/**
 * A location's own pixel on its province's hand-drawn map.
 *
 * **Not a choice this file makes.** `CITYDATA.64` stores each location's `local` point as a
 * `uint16` pair in 0…319 × 0…199 — the province map's own space, the same 320×200 the world map
 * uses — which is why a city's position on the hand-drawn province map is the file's own number
 * rather than something this port computes. (`worldMap.js`'s `locationGlobalPoint` scales that same
 * pair into the province's rectangle for the *world* map; the pair itself is the province map.)
 *
 * @param {{local: {x: number, y: number}}} location
 * @returns {{x: number, y: number}}
 */
export function provincePointOf(location) {
  return { x: location?.local?.x ?? 0, y: location?.local?.y ?? 0 };
}

/**
 * The largest a marker is drawn, in screen pixels per map pixel.
 *
 * **This project's rule**, and the owner's report is the reason it exists: at the browser's own zoom
 * (a 320×200 screen stretched to a 1100-pixel window is 3.4×) an 18-pixel icon is 61 pixels across,
 * and 48 of those on a province map stop being icons — *"the map now is made of yellow circles and
 * yellow stuff instead of points with villages dungeons and cities"*.
 *
 * So a marker is drawn at the map's scale **up to twice its own size and no further**: the game's
 * own icons at their own proportions, small enough to read as icons at any zoom, and never the
 * blobs a 3× stretch makes of them. The pixel art is drawn unsmoothed, so 2× is exact.
 */
export const ICON_MAX_SCALE = 2;

/**
 * The nine province plates, in the order the record stores them.
 *
 * Read off the plates themselves (`HIGH ROCK` first, `IMPERIAL PROVINCE` ninth — the 78-pixel-wide
 * one), and cross-checked against the executable's province table and `CITYDATA.64`'s order, which
 * agree with it province for province. `Summurset Isle` is this file's spelling of the executable's
 * `Summurset` — the plate spells it `SUMMERSET ISLE`, and `plateIndexFor` takes any of the three.
 *
 * @type {readonly string[]}
 */
export const PROVINCE_PLATES = Object.freeze([
  'High Rock', 'Hammerfell', 'Skyrim', 'Morrowind', 'Summurset Isle',
  'Valenwood', 'Elsweyr', 'Black Marsh', 'Imperial Province',
]);

/**
 * The kind of marker a location gets.
 *
 * The three dungeon kinds `CITYDATA` carries (a Staff dungeon, the map's own dungeon, and the
 * sixteen anonymous ones) all get the **dungeon** icon: the records hold four icons and inventing
 * a fifth distinction is exactly what this block removes. What is special about a place is said in
 * words — the card, the hover label and the quest's own marker.
 *
 * @param {string} kind  a `worldMap.js` location kind
 * @returns {'city'|'town'|'village'|'dungeon'|null}
 */
export function markerKind(kind) {
  if (kind === 'palace') return 'city';
  return MARKER_KINDS.includes(kind) ? kind : null;
}

/**
 * The icon for a location kind, or null for one the records have no icon for.
 * @param {string} kind
 * @returns {{frame: number, width: number, height: number}|null}
 */
export function markerIcon(kind) {
  const mapped = markerKind(kind);
  return mapped ? MARKER_ICONS[mapped] : null;
}

/**
 * Which of the two records a marker is drawn from at a given instant.
 * @param {{blinking: boolean}} state
 * @returns {string}
 */
export function markerRecord(state) {
  return state?.blinking ? MARKER_RECORDS.blinking : MARKER_RECORDS.steady;
}

/**
 * The map's blink, as a pure function of the clock.
 *
 * **This project's rule** (see `BLINK_PERIOD_MS`): the *record pair* is the game's, the cadence is
 * not readable here.
 *
 * @param {number} timeMs
 * @param {number} [periodMs]
 * @returns {boolean} true while the map is on the blink record
 */
export function blinkingAt(timeMs, periodMs = BLINK_PERIOD_MS) {
  return Math.floor(timeMs / periodMs) % 2 === 1;
}

/**
 * The plate for a province, by any of the spellings the three sources use.
 *
 * @param {string} name
 * @returns {number} the plate's index, or −1 for a name no plate carries
 */
export function plateIndexFor(name) {
  const key = normalise(name);
  if (!key) return -1;
  for (let i = 0; i < PROVINCE_PLATES.length; i++) {
    const plate = normalise(PROVINCE_PLATES[i]);
    if (key === plate) return i;
  }
  // The executable calls the isles `Summurset` and drops the noun; the plate spells it `SUMMERSET
  // ISLE`; `CITYDATA` writes `Summurset Isle`. So the comparison strips a trailing `isle`/`isles`
  // and takes either spelling of the first word.
  const bare = key.replace(/\s*isles?$/, '').replace(/\s*islands?$/, '');
  if (bare === 'summurset' || bare === 'summerset') {
    return PROVINCE_PLATES.findIndex((p) => normalise(p).replace(/\s*isles?$/, '') === 'summurset');
  }
  return -1;
}

/** Lower-case, no article, letters and single spaces — how the three spellings are compared. */
function normalise(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').replace(/^the\s+/, '').trim();
}

/**
 * The legend, as the screen's own rows: the four icons and what they mark.
 *
 * The DOM legend used to be glyphs this project chose (`&#9679;` city, `&#9670;` dungeon, a star
 * for the palace). Drawing the icons in it instead means the legend cannot say something the map
 * does not — it is the same two records.
 *
 * @returns {{kind: string, label: string, width: number, height: number}[]}
 */
export function legendRows() {
  const labels = { city: 'city-state', town: 'town', village: 'village', dungeon: 'dungeon' };
  return MARKER_KINDS.map((kind) => ({ kind, label: labels[kind], ...MARKER_ICONS[kind] }));
}

/**
 * A decoded frame's pixels as RGBA, through a colour map; an index the map does not name is cut
 * out (alpha 0), which is what an icon's index 0 is.
 *
 * Pure, so a Node test can hold it: a marker record's frames are two-index outlines, and a marker
 * is "that outline, in the palette's marker gold" — nothing else.
 *
 * @param {Uint8Array|number[]} indices
 * @param {Record<number, {r: number, g: number, b: number}>} colors
 * @returns {Uint8ClampedArray} width*height*4
 */
export function indicesToRgba(indices, colors) {
  const out = new Uint8ClampedArray(indices.length * 4);
  for (let i = 0; i < indices.length; i++) {
    const color = colors[indices[i]];
    if (!color) continue;
    out[i * 4] = color.r;
    out[i * 4 + 1] = color.g;
    out[i * 4 + 2] = color.b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * A marker record's frame as RGBA: the one index it carries, in the palette's marker colour.
 *
 * @param {Uint8Array|number[]} indices
 * @param {number} colorIndex  the frame's own lit index (194 or 223)
 * @param {{r: number, g: number, b: number}} color  the RGB that index is in the palette in use
 * @returns {Uint8ClampedArray}
 */
export function frameToRgba(indices, colorIndex, color) {
  return indicesToRgba(indices, { [colorIndex]: color });
}

/**
 * `PAL.COL`'s own byte triple at an index, as `{r, g, b}`.
 * @param {{rgb: Uint8Array|number[]}} palette
 * @param {number} index
 * @returns {{r: number, g: number, b: number}}
 */
export function paletteColor(palette, index) {
  return {
    r: palette.rgb[index * 3] ?? 0,
    g: palette.rgb[index * 3 + 1] ?? 0,
    b: palette.rgb[index * 3 + 2] ?? 0,
  };
}

/**
 * Read the whole map screen out of an install.
 *
 * Everything the screen needs is returned decoded: the picture, the eight icon frames (four kinds
 * × steady/blinking) and the nine plates. What is missing is **named** rather than quietly skipped
 * — an install whose `MAPOUT.CIF` did not decode would otherwise draw a map with no markers on it
 * and say nothing, which is the failure mode this project keeps finding.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @returns {Promise<{
 *   screen: import('../arena/image.js').ArenaImage,
 *   palette: import('../arena/palette.js').Palette,
 *   icons: Record<string, {steady: object, blinking: object}>,
 *   colors: Record<string, {r: number, g: number, b: number}>,
 *   plates: {name: string, width: number, height: number, indices: Uint8Array}[],
 *   provinces: {name: string, record: string, image: object}[],
 *   warnings: string[],
 * }>}
 */
export async function loadMapScreen(data) {
  if (typeof data.cached === 'function') return data.cached(`model:mapScreen:${data.paletteName}`, () => readMapScreen(data));
  return readMapScreen(data);
}

async function readMapScreen(data) {
  const warnings = [];
  const screen = await data.img(MAP_SCREEN_RECORD);
  if (screen.width !== SCREEN_SIZE.width || screen.height !== SCREEN_SIZE.height) {
    warnings.push(`${MAP_SCREEN_RECORD} is ${screen.width}×${screen.height}; ${SCREEN_SIZE.width}×${SCREEN_SIZE.height} expected`);
  }
  const palette = await data.palette();
  const colors = {
    steady: paletteColor(palette, MARKER_INDEX),
    blinking: paletteColor(palette, BLINK_INDEX),
    plateBackground: paletteColor(palette, PLATE_BACKGROUND_INDEX),
    plateText: paletteColor(palette, PLATE_TEXT_INDEX),
  };

  /** @type {Record<string, {steady: object, blinking: object}>} */
  const icons = {};
  let anyIcon = false;
  for (const [state, record] of Object.entries(MARKER_RECORDS)) {
    let cif = null;
    try {
      cif = await data.cif(record);
    } catch (err) {
      warnings.push(`${record}: ${err?.message ?? err}`);
      continue;
    }
    const wanted = state === 'steady' ? MARKER_INDEX : BLINK_INDEX;
    for (const kind of MARKER_KINDS) {
      const icon = MARKER_ICONS[kind];
      const frame = cif.images?.[icon.frame];
      if (!frame) {
        warnings.push(`${record} has no frame ${icon.frame} (${kind}): ${cif.images?.length ?? 0} frames`);
        continue;
      }
      if (frame.width !== icon.width || frame.height !== icon.height) {
        warnings.push(`${record} frame ${icon.frame} is ${frame.width}×${frame.height}; ${icon.width}×${icon.height} expected for a ${kind}`);
      }
      const lit = countIndex(frame.indices, wanted);
      if (!lit) warnings.push(`${record} frame ${icon.frame} (${kind}) carries no index ${wanted}`);
      const stray = strayIndices(frame.indices, wanted);
      if (stray.length) warnings.push(`${record} frame ${icon.frame} (${kind}) also carries ${stray.join(', ')}`);
      icons[kind] ??= {};
      icons[kind][state] = {
        record, frame: icon.frame, width: frame.width, height: frame.height,
        xOffset: frame.xOffset ?? 0, yOffset: frame.yOffset ?? 0,
        indices: frame.indices, lit, colorIndex: wanted, kind, state,
      };
      anyIcon = true;
    }
  }
  if (!anyIcon) warnings.push('no marker records decoded: the map will draw without markers');

  /** @type {{name: string, width: number, height: number, indices: Uint8Array}[]} */
  const plates = [];
  try {
    const frames = (await data.cif(PLATE_RECORD)).images;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      plates.push({
        name: PROVINCE_PLATES[i] ?? `#${i}`,
        width: frame.width,
        height: frame.height,
        indices: frame.indices,
        background: countIndex(frame.indices, PLATE_BACKGROUND_INDEX),
        text: countIndex(frame.indices, PLATE_TEXT_INDEX),
      });
    }
    if (frames.length !== PROVINCE_PLATES.length) {
      warnings.push(`${PLATE_RECORD} holds ${frames.length} plates; ${PROVINCE_PLATES.length} provinces expected`);
    }
  } catch (err) {
    warnings.push(`${PLATE_RECORD}: ${err?.message ?? err}`);
  }

  // ── the nine hand-drawn province maps ────────────────────────────────────
  //
  // Read here rather than lazily: they are what a click on a province opens, and a screen that has
  // to fetch a picture on the click is a screen that shows a blank page for a moment after every
  // one of them. Each is named for its province and is its own 320×200 picture.
  /** @type {{name: string, record: string, image: object}[]} */
  const provinces = [];
  for (let i = 0; i < PROVINCE_MAPS.length; i++) {
    const record = PROVINCE_MAPS[i];
    try {
      const image = await data.img(record);
      if (image.width !== SCREEN_SIZE.width || image.height !== SCREEN_SIZE.height) {
        warnings.push(`${record} is ${image.width}×${image.height}; ${SCREEN_SIZE.width}×${SCREEN_SIZE.height} expected`);
      }
      provinces.push({ name: PROVINCE_PLATES[i], record, image });
    } catch (err) {
      warnings.push(`${record}: ${err?.message ?? err}`);
    }
  }
  if (provinces.length !== PROVINCE_MAPS.length) {
    warnings.push(`${provinces.length} of ${PROVINCE_MAPS.length} province maps read: the ones missing cannot be opened`);
  }

  return { screen, palette, icons, colors, plates, provinces, warnings };
}

/** How many pixels of a frame carry one index (the frame's own "lit" count). */
function countIndex(indices, index) {
  let n = 0;
  for (let i = 0; i < indices.length; i++) if (indices[i] === index) n++;
  return n;
}

/** Every index a frame uses besides 0 and its own — which for these records is none. */
function strayIndices(indices, index) {
  const seen = new Set();
  for (let i = 0; i < indices.length; i++) {
    const value = indices[i];
    if (value !== 0 && value !== index) seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}
