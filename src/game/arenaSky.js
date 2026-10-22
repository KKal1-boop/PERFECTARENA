// THE SKY OVER AN ARENA SETTLEMENT — the mountains and the clouds.
//
// Arena's outdoor view is not a flat colour. The install ships the pieces it is made
// of, and they are named for what they are:
//
//   `MOUNT001.IMG`…`MOUNT022.IMG`   the **mountain line** at the horizon: wide, short
//                                   silhouettes (253×40, 240×42, 133×23 …) whose index-0
//                                   pixels are the sky showing through — measured on the
//                                   real archive, 36–59 % of each image is the cutout.
//   `CLOUD01.IMG`…`CLOUD17.IMG`     the **clouds**: 151×23, 233×59, and some as small as
//                                   11×4, the same kind of cutout.
//
// A page that drew only a vertical gradient therefore had no horizon, no weather and
// nothing at any distance — the reported "there is no background in cities or wilderness
// like in real Arena where there are mountains and clouds".
//
// ## What is the original's and what is reconstructed
//
// **The art and the palette are the original's**: the images come out of the player's own
// `GLOBAL.BSA` through the same `.IMG` decoder the walls use, in the same palette the
// walls use, and index 0 is the cutout.
//
// **The composition is RECONSTRUCTED.** Arena builds its background in `A.EXE` from
// hard-coded tables — which image is which climate's, how wide the strip is, where the
// mountain line sits — and `A.EXE` is absent from this data set (`docs/DECISIONS.md`
// D5/D11). So the layout here is stated rather than extracted, and every part of it is
// chosen to match what the art itself says:
//
//   * The strip is **1024×220** — the engine's own angular scale (`skyRenderer.js`
//     gives every 512 px a half-turn and every row `π/512` radians of elevation), so a
//     1024-wide panorama is exactly one turn and 220 rows is ~77° above the horizon.
//   * The **mountain line stands on row 0**, which is the horizon in that buffer, and
//     tiles across the full turn with a small overlap so no seam shows.
//   * The **clouds float above it**, in the upper half, scattered by a seed so a place's
//     sky is the same sky every time it is visited.
//   * Both are **hazed toward the horizon colour** as they are placed, which is the
//     aerial perspective that stops pixel art reading as stickers — the same trick the
//     distance fog does for the ground.
//   * The **gradient is the climate's**: temperate is the pale-to-blue the project
//     already used, a desert horizon is sand and a mountain one is cold grey; overcast
//     and snow mix the whole thing toward a flat sky.
//
// The function that does the work (`composeArenaSky`) is pure — images in, bytes out —
// so `tests/unit/sky.test.mjs` runs it against the real archive with no browser.

import { ArenaRandom } from './arenaRandom.js';

/** Width of the panorama: 360° at the engine's own 512 px per half-turn (`skyRenderer.js`). */
export const PANO_WIDTH = 1024;
/** Height of the panorama: rows above the horizon, at `π/512` radians each (~77°). */
export const PANO_HEIGHT = 220;

/**
 * Where the clouds may float, in rows above the horizon.
 *
 * The engine gives every row `π/512` radians (`skyRenderer.js`), which is 0.35° — so the
 * sky a player sees at the default 60° field of view is the first **85 rows** above the
 * horizon, plus whatever they tilt up into. The first version of this scattered the
 * clouds from row 96 upward, which is entirely above that view: the strip was drawn with
 * no cloud in it at all. They float just over the mountain tops now.
 */
const CLOUD_FLOOR = 24;
/** …and no higher than this, so most of them are in the frame rather than only after a look up. */
const CLOUD_CEILING = 104;
/** How many clouds a sky carries. */
const CLOUD_COUNT = 14;
/** How far a mountain or cloud is mixed toward the horizon colour (aerial perspective). */
const MOUNTAIN_HAZE = 0.30;
const CLOUD_HAZE = 0.18;
/**
 * **Where Red Mountain stands.** The owner, 2026-10-19: *"in all morrowind towns and villages and
 * wilderness in the background there should be generally north east the vulcano sprite
 * AR-sprite-VOLCANO3 … only when youre in morrowind"*, then *"morrowind's vulcano is actually
 * at the center north of the country its position should be dinamic in the background in
 * respect of where you are in morrowind"*. The panorama's azimuth is `atan(x, z)` with north at
 * +Z and east at +X (`skyRenderer.js`), so the volcano is not a fixed north-east decoration: it
 * is a **world point**, and each page's bearing to it becomes the panorama's azimuth.
 *
 * The point is `TAMRIEL.IMG`'s own pixel for Vvardenfell's **centre north**: Morrowind's city
 * dots run from Blacklight `(207,44)` and Firewatch `(249,45)` down to Tear `(266,117)`, and
 * the province's land at y≈46 spans x≈204…280, so `(240,46)` is the middle of the island and
 * north of Ebonheart `(238,82)` and Mournhold `(255,92)`. It is `VOLCANO3.IMG`, the illustrated
 * volcano Arena ships.
 */
export const RED_MOUNTAIN_PIXEL = Object.freeze({ x: 240, y: 46 });

/**
 * The bearing from a world-map pixel to Red Mountain, as a panorama azimuth (0 = north,
 * 0.25 = east). The map's `y` grows south, so north is the negative `y` direction.
 *
 * @param {{x: number, y: number}|null|undefined} pixel  the player's `here.pixel`
 * @returns {number} 0…1
 */
export function volcanoAzimuthFrom(pixel) {
  if (!pixel || !Number.isFinite(pixel.x) || !Number.isFinite(pixel.y)) return 0.125;
  const east = RED_MOUNTAIN_PIXEL.x - pixel.x;
  const north = pixel.y - RED_MOUNTAIN_PIXEL.y;
  if (!east && !north) return 0.125;
  let turns = Math.atan2(east, north) / (Math.PI * 2);
  if (turns < 0) turns += 1;
  return turns % 1;
}

/** @deprecated The fixed north-east card; kept for callers that have no world point. */
export const VOLCANO_AZIMUTH = 0.125;

/** The gradient each climate's sky runs between, horizon first. */
export const CLIMATE_GRADIENTS = Object.freeze({
  T: Object.freeze({ horizon: Object.freeze([198, 208, 228]), zenith: Object.freeze([84, 116, 172]) }),
  D: Object.freeze({ horizon: Object.freeze([236, 210, 160]), zenith: Object.freeze([118, 150, 202]) }),
  M: Object.freeze({ horizon: Object.freeze([182, 190, 206]), zenith: Object.freeze([66, 94, 148]) }),
});

/**
 * The weather's own hand on a sky: how much of it is flat cloud, and how dark it is.
 * `N` clear, `R` overcast, `W` rain, `S` snow — the four letters the `.INF` names use.
 *
 * `W` is darker and flatter than `R` because that is what the difference between the two
 * is: an overcast sky is bright and lidless, a raining one is low and heavy. The numbers
 * are this project's (Arena keeps its sky tables in `A.EXE`), stated here rather than
 * scattered, and `tests/unit/sky.test.mjs` pins the order `N` > `R` > `W` > `S` in dimming.
 */
export const WEATHER_TWEAKS = Object.freeze({
  N: Object.freeze({ mix: 0, dim: 1 }),
  R: Object.freeze({ mix: 0.5, dim: 0.72 }),
  W: Object.freeze({ mix: 0.56, dim: 0.58 }),
  S: Object.freeze({ mix: 0.62, dim: 0.94 }),
});

/**
 * The mountains and clouds an install actually ships.
 *
 * @param {string[]} names  every record name in the archive (`BsaArchive#names()`)
 * @returns {{mountains: string[], clouds: string[]}}
 */
export function collectSkyArt(names) {
  /** @type {string[]} */
  const mountains = [];
  /** @type {string[]} */
  const clouds = [];
  for (const raw of names ?? []) {
    const name = String(raw).toUpperCase();
    if (/^MOUNT\d{3}\.IMG$/.test(name)) mountains.push(name);
    else if (/^CLOUD\d{2}\.IMG$/.test(name)) clouds.push(name);
  }
  mountains.sort();
  clouds.sort();
  return { mountains, clouds };
}

/**
 * The climate and weather a level's own `.INF` names: `<climate><W><weather>.INF`
 * (`TWN.INF` is the temperate clear wilderness, `TCW.INF` a temperate city in the rain).
 *
 * **Four letters, and this used to fold two of them together.** `tables/cityBlocks.js`
 * names them `N` clear, `R` overcast, `W` rain, `S` snow — that is the whole set the
 * install ships, and `cityInfName`/`wildernessInfName` write them. This function read `R`
 * as "overcast/rain" and had no `W` arm at all, so `TCW.INF` — a rainy city — came out
 * `N`: a clear blue sky over the rain, and no way for the renderer to know it was raining.
 * `O` and `C` are kept as overcast because Arena's own table abbreviates overcast to `R`
 * and some mods spell it out.
 *
 * @param {string} infName
 * @returns {{climate: 'T'|'D'|'M', weather: 'N'|'R'|'W'|'S'}}
 */
export function skyClimateOf(infName) {
  const name = String(infName ?? '').toUpperCase();
  const first = name[0];
  const climate = first === 'D' ? 'D' : first === 'M' ? 'M' : 'T';
  const third = name[2];
  let weather = third === 'R' || third === 'O' || third === 'C' ? 'R'
    : third === 'W' ? 'W'
      : third === 'S' ? 'S' : 'N';
  // A desert does not snow, exactly as `wildernessInfName` has it.
  if (climate === 'D' && weather === 'S') weather = 'N';
  return { climate, weather };
}

/**
 * What the weather looks like in the air, for the precipitation pass.
 *
 * The same four letters, said in the renderer's terms: nothing falls in the clear or in an
 * overcast sky, rain falls in `W`, snow in `S` (and never in a desert, where `skyClimateOf`
 * has already turned it back to clear). `engine/render/precipitation.js` — the twin
 * project's rain and snow volume — draws whichever of the two this names.
 *
 * @param {'N'|'R'|'W'|'S'} weather
 * @returns {'rain'|'snow'|null}
 */
export function precipitationMode(weather) {
  if (weather === 'W') return 'rain';
  if (weather === 'S') return 'snow';
  return null;
}

/**
 * Compose the whole sky: bytes in, a panorama out. Pure, so it can be tested in Node.
 *
 * @param {object} opts
 * @param {{width: number, height: number, indices: Uint8Array}[]} opts.mountains
 * @param {{width: number, height: number, indices: Uint8Array}[]} opts.clouds
 * @param {{rgb: Uint8Array}} opts.palette
 * @param {'T'|'D'|'M'} [opts.climate]
 * @param {'N'|'R'|'S'} [opts.weather]
 * @param {number} [opts.seed]
 * @param {{width:number,height:number,indices:Uint8Array}|null} [opts.volcano]  Morrowind's Red Mountain
 * @param {number} [opts.volcanoAzimuth]  bearing to Red Mountain (0 = north, 0.25 = east)
 * @returns {{colors: Uint8ClampedArray, width: number, height: number, clearColor: number[], fillColor: number[], art: {mountains: number, clouds: number, volcano: boolean}}}
 */
/**
 * The night sky is the *climate's own night*, not a grey filter over the day card.
 *
 * A temperate night leans blue-black, a desert night keeps a warm horizon (the sand holds
 * the day's last light longer than the air does), a mountain night is colder. Numbers are
 * this project's (the originals are `A.EXE` tables) and are picked so the **stars survive**
 * on a clear night and drown on a rainy one, exactly as a sky does.
 */
export const CLIMATE_NIGHTS = Object.freeze({
  T: Object.freeze({ horizon: Object.freeze([30, 36, 62]), zenith: Object.freeze([8, 10, 26]) }),
  D: Object.freeze({ horizon: Object.freeze([54, 44, 50]), zenith: Object.freeze([10, 10, 28]) }),
  M: Object.freeze({ horizon: Object.freeze([24, 30, 54]), zenith: Object.freeze([6, 8, 22]) }),
});

/**
 * How a composed sky darkens at night.
 *
 * The gradient runs the climate's night palette; the mountains become near-black
 * silhouettes against it, the clouds nearly vanish, and the draw distance haze loses its
 * day-lit tint: every figure here is the shape of a night photograph, not a measured
 * Arena constant.
 */
export const NIGHT_DIM = Object.freeze({ mountains: 0.30, clouds: 0.22, haze: 0.55 });

/**
 * The stars: a clear night's field, scattered in the upper half of the panorama.
 *
 * Written **before** the clouds and the mountains, so a drifting cloud passes in front of
 * a star (as it should) and a mountain ridge still cuts them off at the horizon — the
 *GAIA-DR2 rule this minimal sky can keep: *stars live behind everything*. Their count is
 * scaled by the weather (an overcast sky drowns them, not a clear one) and their colour is
 * the palette's own white-to-blue range so they do not read as paper dots.
 */
const STAR_BASE_COUNT = 220;

/**
 * Compose the whole sky: bytes in, a panorama out. Pure, so it can be tested in Node.
 *
 * @param {object} opts
 * @param {{width: number, height: number, indices: Uint8Array}[]} opts.mountains
 * @param {{width: number, height: number, indices: Uint8Array}[]} opts.clouds
 * @param {{rgb: Uint8Array}} opts.palette
 * @param {'T'|'D'|'M'} [opts.climate]
 * @param {'N'|'R'|'S'} [opts.weather]
 * @param {number} [opts.seed]
 * @returns {{colors: Uint8ClampedArray, width: number, height: number, clearColor: number[], fillColor: number[], art: {mountains: number, clouds: number}}}
 * @param {boolean} [opts.night]
 */
export function composeArenaSky(opts) {
  const {
    mountains = [], clouds = [], volcano = null,
    volcanoAzimuth = VOLCANO_AZIMUTH,
    palette,
    climate = 'T', weather = 'N', seed = 1,
    night = false,
  } = opts;
  if (!palette?.rgb) throw new Error('composeArenaSky needs a palette');

  const base = CLIMATE_GRADIENTS[climate] ?? CLIMATE_GRADIENTS.T;
  const tweak = WEATHER_TWEAKS[weather] ?? WEATHER_TWEAKS.N;
  const rgb = palette.rgb;

  // The flat sky an overcast day mixes toward, and the amount the weather dims it.
  let horizon;
  let zenith;
  if (night) {
    // Night does not multiply the day card: the panes have found the climate's own night,
    // and the weather's hand is *on top of that* (an overcast night is flat grey-blue,
    // not a darker clear one – note the mix toward flat, one more time).
    const nightBase = CLIMATE_NIGHTS[climate] ?? CLIMATE_NIGHTS.T;
    const flatNight = [(nightBase.horizon[0] + nightBase.zenith[0]) / 2, (nightBase.horizon[1] + nightBase.zenith[1]) / 2, (nightBase.horizon[2] + nightBase.zenith[2]) / 2];
    const dim = tweak.mix * tweak.dim * NIGHT_DIM.haze;
    horizon = mixToward(nightBase.horizon, flatNight, tweak.mix).map((v) => v * (1 - tweak.dim * 0.35 + dim * 0.2));
    zenith = mixToward(nightBase.zenith, flatNight, tweak.mix).map((v) => v * (1 - tweak.dim * 0.35 + dim * 0.2));
  } else {
    const flat = [(base.horizon[0] + base.zenith[0]) / 2, (base.horizon[1] + base.zenith[1]) / 2, (base.horizon[2] + base.zenith[2]) / 2];
    horizon = mixToward(base.horizon, flat, tweak.mix).map((v) => v * tweak.dim);
    zenith = mixToward(base.zenith, flat, tweak.mix).map((v) => v * tweak.dim);
  }
  const horizonRgb = [horizon[0], horizon[1], horizon[2]];

  const colors = new Uint8ClampedArray(PANO_WIDTH * PANO_HEIGHT * 4);
  // Row 0 of this buffer is the **horizon** (the engine samples `v = elevation / vSpan`
  // with `v = 0` at the horizon and uploads the texture without flipping), so the
  // gradient runs horizon at row 0 up to the zenith at the last row.
  for (let y = 0; y < PANO_HEIGHT; y++) {
    const t = y / (PANO_HEIGHT - 1);
    const r = horizon[0] + (zenith[0] - horizon[0]) * t;
    const g = horizon[1] + (zenith[1] - horizon[1]) * t;
    const b = horizon[2] + (zenith[2] - horizon[2]) * t;
    for (let x = 0; x < PANO_WIDTH; x++) {
      const o = (y * PANO_WIDTH + x) * 4;
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = b; colors[o + 3] = 255;
    }
  }

  const random = new ArenaRandom((seed >>> 0) || 1);

  // ── the night's stars, behind everything ─────────────────────────────────────
  // Written first, so a cloud passes over a star and the mountain line still cuts them off
  // at the horizon. The field is deterministic in the place's seed, spreads from above the
  // ridge to the zenith, and drowns under overcast exactly as cloud cover drowns it in the
  // real sky — a few blue-white pixels each, never a paper wall of dots.
  if (night) {
    const starRandom = new ArenaRandom(((seed * 31 + 17) >>> 0) || 1);
    const count = Math.max(20, Math.round(STAR_BASE_COUNT * (1 - tweak.mix * 0.85)));
    for (let i = 0; i < count; i++) {
      const x = starRandom.nextBelow(PANO_WIDTH);
      const y = 6 + starRandom.nextBelow(PANO_HEIGHT - 24);
      const bright = 150 + starRandom.nextBelow(106);
      const blue = starRandom.nextBelow(40);
      const wide = starRandom.nextBelow(8) === 0;
      for (const [px, py] of wide ? [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] : [[x, y]]) {
        if (px < 0 || py < 0 || px >= PANO_WIDTH || py >= PANO_HEIGHT) continue;
        const o = (py * PANO_WIDTH + px) * 4;
        colors[o] = bright; colors[o + 1] = bright; colors[o + 2] = Math.min(255, bright + blue); colors[o + 3] = 255;
      }
    }
  }

  // ── the clouds, behind the mountains ────────────────────────────────────────
  if (clouds.length) {
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const art = clouds[random.nextBelow(clouds.length)];
      const x = random.nextBelow(PANO_WIDTH);
      // Above the mountain tops and inside the strip: a cloud's base is its lowest row.
      const low = CLOUD_FLOOR;
      const high = Math.max(low, Math.min(PANO_HEIGHT - art.height - 2, CLOUD_CEILING));
      const yBase = low + random.nextBelow(Math.max(1, high - low + 1));
      blit(colors, art, rgb, x, yBase, CLOUD_HAZE, horizonRgb, random.nextBelow(2) === 1,
        { dim: night ? NIGHT_DIM.clouds : 1 });
    }
  }

  // ── the mountain line, standing on the horizon ──────────────────────────────
  if (mountains.length) {
    let x = 0;
    while (x < PANO_WIDTH) {
      const art = mountains[random.nextBelow(mountains.length)];
      blit(colors, art, rgb, x, 0, MOUNTAIN_HAZE, horizonRgb, random.nextBelow(2) === 1,
        { dim: night ? NIGHT_DIM.mountains : 1 });
      // Overlap by a few pixels so the line reads as one range rather than a row of
      // separate hills with sky between them.
      x += Math.max(8, art.width - 6 - random.nextBelow(10));
    }
  }

  // ── Red Mountain, in front of the ordinary mountain line ────────────────────
  // The owner, 2026-10-19: *"the vulcano needs to show in front of the normal mountains
  // background not behind otherwise only the smoke is visible"*. The mountain line is a
  // horizon band drawn **over** the foot of anything standing behind it, so Red Mountain has
  // to be composed after that band: otherwise its cone is hidden and only the plume above the
  // ridge survives. It is a world point, so its azimuth changes with the page's own pixel.
  if (volcano) {
    const x0 = Math.round(PANO_WIDTH * volcanoAzimuth - volcano.width / 2);
    // `blit` already wraps in x, so a volcano on the north seam is drawn on both sides.
    blit(colors, volcano, rgb, x0, 0, 0.24, horizonRgb, false,
      { dim: night ? NIGHT_DIM.mountains * 1.15 : 1 });
  }

  return {
    colors,
    width: PANO_WIDTH,
    height: PANO_HEIGHT,
    clearColor: [horizon[0] / 255, horizon[1] / 255, horizon[2] / 255],
    fillColor: [zenith[0] / 255, zenith[1] / 255, zenith[2] / 255],
    art: { mountains: mountains.length, clouds: clouds.length, volcano: Boolean(volcano) },
  };
}

/**
 * Read an install's sky art and compose its sky.
 *
 * Returns `null` when the archive ships neither mountains nor clouds (a lean data set),
 * so the caller keeps whatever gradient it already had rather than painting nothing.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @param {object} opts
 * @param {string} opts.infName    the level's own `.INF`, which names its climate and weather
 * @param {number} [opts.seed]
 * @param {boolean} [opts.night]  compose the night card instead of the day one
 * @param {number} [opts.volcanoAzimuth]  the page's bearing to Red Mountain
 * @param {(name: string) => Promise<{rgb: Uint8Array}>} [opts.paletteOf]
 * @returns {Promise<object|null>}
 */
export async function buildArenaSky(data, opts) {
  let names = [];
  try { names = (await data.bsa()).names(); } catch { return null; }
  const { mountains, clouds } = collectSkyArt(names);
  // **Morrowind's own horizon.** The volcano is not part of the generic climate art: it is
  // `VOLCANO3.IMG`, the install's illustrated Red Mountain, and only a page in Morrowind asks for
  // it. A missing record leaves the ordinary sky rather than failing the whole build.
  let volcano = null;
  if (opts.volcano) {
    try { volcano = await data.img('VOLCANO3.IMG'); } catch { /* the sky is still a sky */ }
  }
  if (!mountains.length && !clouds.length && !volcano) return null;

  const palette = opts.paletteOf ? await opts.paletteOf('PAL.COL') : await data.palette('PAL.COL');
  // The *decoded art* is cached per archive, because the day and the night of one place
  // are two compositions of the same thirty-nine images: a dusk recompose is then cheap
  // and exact, not a re-read of the whole archive through the decoder.
  let arts = skyArtCache.get(data);
  if (!arts) {
    /** @type {object[]} */
    const mountainImages = [];
    for (const name of mountains) {
      try { mountainImages.push(await data.img(name)); } catch { /* one bad record is not the sky */ }
    }
    /** @type {object[]} */
    const cloudImages = [];
    for (const name of clouds) {
      try { cloudImages.push(await data.img(name)); } catch { /* as above */ }
    }
    if (!mountainImages.length && !cloudImages.length) return null;
    arts = { mountains: mountainImages, clouds: cloudImages };
    skyArtCache.set(data, arts);
  }

  const { climate, weather } = skyClimateOf(opts.infName ?? 'TWN.INF');
  return composeArenaSky({
    mountains: arts.mountains,
    clouds: arts.clouds,
    volcano,
    volcanoAzimuth: opts.volcanoAzimuth ?? VOLCANO_AZIMUTH,
    palette,
    climate,
    weather,
    night: Boolean(opts.night),
    seed: opts.seed ?? 1,
  });
}

/** Decoded sky art, held per `ArenaData` so a night/day recompose re-reads nothing. */
const skyArtCache = new WeakMap();

/**
 * Lay one cutout image onto the panorama, its **bottom edge** at `yBase`, wrapping in x.
 *
 * The source rows run top-down and the panorama's run bottom-up from the horizon, so the
 * image is flipped as it lands: a mountain's base sits on the horizon and its peaks rise.
 * Index 0 is the cutout and is skipped, which is what lets the gradient and the clouds
 * behind show through.
 *
 * @param {Uint8ClampedArray} colors
 * @param {{width: number, height: number, indices: Uint8Array}} art
 * @param {Uint8Array} rgb       the palette's 3-byte entries
 * @param {number} x0 @param {number} yBase
 * @param {number} haze @param {number[]} horizonRgb
 * @param {boolean} flip
 */
function blit(colors, art, rgb, x0, yBase, haze, horizonRgb, flip, { dim = 1 } = {}) {
  const { width, height, indices } = art;
  for (let sy = 0; sy < height; sy++) {
    const dy = yBase + (height - 1 - sy);
    if (dy < 0 || dy >= PANO_HEIGHT) continue;
    for (let sx = 0; sx < width; sx++) {
      const v = indices[sy * width + (flip ? width - 1 - sx : sx)];
      if (!v) continue;
      const dx = ((x0 + sx) % PANO_WIDTH + PANO_WIDTH) % PANO_WIDTH;
      const o = (dy * PANO_WIDTH + dx) * 4;
      // ArenaRenderUtils.h names palette entries 1–8 as dynamic SKY colours, not static
      // VGA colours. The current gradient is our reconstructed sky-palette state: those
      // pixels reveal it instead of painting PAL.COL's red/green diagnostic slots.
      // Index zero remains the only transparency key; normal art indices are unchanged.
      if (v >= 1 && v <= 8) continue;
      const artRgb = art.palette?.rgb ?? rgb;
      const p = v * 3;
      // A night's art dims *before* the haze mixes in, so the silhouette reads against a
      // dark sky rather than glowing as the day's palette lit it.
      const art0 = artRgb[p] * dim, art1 = artRgb[p + 1] * dim, art2 = artRgb[p + 2] * dim;
      colors[o] = art0 + (horizonRgb[0] - art0) * haze;
      colors[o + 1] = art1 + (horizonRgb[1] - art1) * haze;
      colors[o + 2] = art2 + (horizonRgb[2] - art2) * haze;
      colors[o + 3] = 255;
    }
  }
}

/** @param {readonly number[]} a @param {readonly number[]} b @param {number} t */
function mixToward(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
