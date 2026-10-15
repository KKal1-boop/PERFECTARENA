// THE SKY — Arena's own mountains and clouds, composed into a panorama.
//
// The compositor is pure (images in, bytes out), so the whole thing runs in Node against
// the real `GLOBAL.BSA`: that the install ships the art, that it is decoded, that the
// mountains stand on the horizon row and the clouds float above it, and that a place's
// sky is the same sky every time it is built.
//
//   node --test tests/unit/sky.test.mjs
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/sky.test.mjs
//
// The browser suite adds the picture: `state().sky` says which climate's art is up, and
// the frame it draws is a sky rather than a flat colour.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import {
  CLIMATE_GRADIENTS, PANO_HEIGHT, PANO_WIDTH, WEATHER_TWEAKS,
  buildArenaSky, collectSkyArt, composeArenaSky, precipitationMode, skyClimateOf,
} from '../../src/game/arenaSky.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

/** The colour at (x, y) of a panorama, as `[r, g, b]`. */
const at = (pano, x, y) => {
  const o = (y * pano.width + x) * 4;
  return [pano.colors[o], pano.colors[o + 1], pano.colors[o + 2]];
};

test('the install ships its own horizon: mountains and clouds, by name', async () => {
  const archive = await data.bsa();
  const { mountains, clouds } = collectSkyArt(archive.names());
  // Measured on the real archive: 22 mountain silhouettes and 17 clouds. A lean data set
  // that ships none of them is a *different* install, not a bug — the scene falls back to
  // its gradient — but this one has them, and the composition is built out of them.
  assert.equal(mountains.length, 22, `mountains: ${mountains.join(' ')}`);
  assert.equal(clouds.length, 17, `clouds: ${clouds.join(' ')}`);
  assert.ok(mountains.includes('MOUNT001.IMG') && mountains.includes('MOUNT022.IMG'));
  assert.ok(clouds.includes('CLOUD01.IMG') && clouds.includes('CLOUD17.IMG'));
  // They are cutouts over a sky: index 0 is a large fraction of every one of them.
  for (const name of ['MOUNT001.IMG', 'CLOUD17.IMG']) {
    const image = await data.img(name);
    const zero = image.indices.reduce((n, v) => n + (v === 0 ? 1 : 0), 0);
    assert.ok(zero / image.indices.length > 0.2, `${name}: ${Math.round(100 * zero / image.indices.length)}% cutout`);
  }
});

test('a level\'s own INF names its sky', () => {
  assert.deepEqual(skyClimateOf('TWN.INF'), { climate: 'T', weather: 'N' }, 'temperate, clear');
  assert.deepEqual(skyClimateOf('DCR.INF'), { climate: 'D', weather: 'R' }, 'desert, overcast');
  assert.deepEqual(skyClimateOf('MWR.INF'), { climate: 'M', weather: 'R' }, 'mountain, overcast');
  assert.deepEqual(skyClimateOf('TCN.INF'), { climate: 'T', weather: 'N' });
  // **`W` is rain, and it used to read as clear.** `tables/cityBlocks.js` names the four
  // letters — `N` clear, `R` overcast, `W` rain, `S` snow — and `cityInfName`/
  // `wildernessInfName` write them, so a rainy settlement's own city file is `TCW.INF`.
  // With no `W` arm, that came out `N`: rain reported as a clear sky.
  assert.deepEqual(skyClimateOf('TCW.INF'), { climate: 'T', weather: 'W' }, 'temperate city, rain');
  assert.deepEqual(skyClimateOf('TWR.INF'), { climate: 'T', weather: 'R' }, 'temperate country, overcast');
  assert.deepEqual(skyClimateOf('MWW.INF'), { climate: 'M', weather: 'W' }, 'mountain, rain');
  // A desert does not snow: `DSN` falls back to clear, as `wildernessInfName` has it.
  assert.deepEqual(skyClimateOf('DWS.INF'), { climate: 'D', weather: 'N' });
  assert.deepEqual(skyClimateOf('TWS.INF'), { climate: 'T', weather: 'S' });
  assert.deepEqual(skyClimateOf('nonsense'), { climate: 'T', weather: 'N' }, 'anything else is temperate');
});

test('the weather letter decides what falls, and how heavy the sky is', () => {
  // What the four letters mean in the air — the port's precipitation pass draws exactly
  // this, and an overcast sky has nothing falling out of it in Arena's own tables.
  assert.equal(precipitationMode('W'), 'rain');
  assert.equal(precipitationMode('S'), 'snow');
  assert.equal(precipitationMode('N'), null, 'a clear sky has nothing in the air');
  assert.equal(precipitationMode('R'), null, 'and neither has a bare overcast one');
  // The sky's own hand, in the order the weather gets heavier: clear, overcast, rain,
  // snow. Every climate and every letter the tables can produce must have a tweak, or
  // `composeArenaSky` would silently fall back to a clear sky.
  const dim = (w) => WEATHER_TWEAKS[w].dim;
  assert.ok(dim('N') > dim('R') && dim('R') > dim('W'), 'clear is brightest, then overcast, then rain');
  assert.ok(dim('S') > dim('W'), 'snow is a bright fall, not a dark one');
  for (const w of ['N', 'R', 'W', 'S']) assert.ok(WEATHER_TWEAKS[w], `no tweak for ${w}`);
});

test('the panorama is one turn wide and 77 degrees tall, and the horizon is row 0', () => {
  const palette = { rgb: new Uint8Array(768) };
  const pano = composeArenaSky({ palette, climate: 'T', weather: 'N', seed: 7 });
  assert.equal(pano.width, PANO_WIDTH);
  assert.equal(pano.height, PANO_HEIGHT);
  assert.equal(pano.colors.length, PANO_WIDTH * PANO_HEIGHT * 4);
  // Row 0 is the horizon, so it carries the horizon end of the gradient; the last row is
  // the zenith. (The engine samples `v = 0` at the horizon and does not flip the upload.)
  const horizon = CLIMATE_GRADIENTS.T.horizon;
  assert.deepEqual(at(pano, 0, 0), [horizon[0], horizon[1], horizon[2]].map(Math.round));
  const zenith = CLIMATE_GRADIENTS.T.zenith;
  assert.deepEqual(at(pano, 0, PANO_HEIGHT - 1), [zenith[0], zenith[1], zenith[2]].map(Math.round));
  // Every pixel is opaque: a hole in the backdrop would show the clear colour through.
  for (let i = 3; i < pano.colors.length; i += 4) assert.equal(pano.colors[i], 255);
});

test('the mountains stand on the horizon and the clouds float above it', () => {
  const palette = { rgb: new Uint8Array(768) };
  // A red 8×4 block at ordinary art index 16 (1–8 are dynamic sky colours).
  palette.rgb[16 * 3] = 255;
  const art = { width: 8, height: 4, indices: new Uint8Array(8 * 4).fill(16) };
  const bare = composeArenaSky({ palette, climate: 'T', weather: 'N', seed: 3 });
  const withArt = composeArenaSky({ palette, climate: 'T', weather: 'N', seed: 3, mountains: [art], clouds: [art] });
  // Haze mixes the art 30% toward the horizon colour, so the bottom row is not the
  // gradient any more, and it is not the raw red either.
  const horizon = CLIMATE_GRADIENTS.T.horizon;
  const bottom = at(withArt, 0, 0);
  assert.notDeepEqual(bottom, at(bare, 0, 0), 'the mountain is on the horizon row');
  const expected = [255, 0, 0].map((v, i) => Math.round(v * 0.7 + horizon[i] * 0.3));
  assert.deepEqual(bottom, expected, 'hazed 30% toward the horizon');
  // The mountain's own height is 4 rows; the row above it is the gradient again there.
  assert.deepEqual(at(withArt, 0, 4), at(bare, 0, 4), 'nothing above the mountain top');
});

test('a sky is the same sky every time, and the weather changes it', async () => {
  const { mountains, clouds } = collectSkyArt((await data.bsa()).names());
  const palette = await data.palette('PAL.COL');
  const image = async (name) => data.img(name);
  const mountainImages = [await image(mountains[0]), await image(mountains[5]), await image(mountains[11])];
  const cloudImages = [await image(clouds[0]), await image(clouds[3]), await image(clouds[9])];
  const opts = { mountains: mountainImages, clouds: cloudImages, palette, climate: 'T', weather: 'N', seed: 99 };
  const once = composeArenaSky(opts);
  const twice = composeArenaSky(opts);
  assert.deepEqual(Buffer.from(once.colors), Buffer.from(twice.colors), 'deterministic in the seed');
  const other = composeArenaSky({ ...opts, seed: 100 });
  assert.notDeepEqual(Buffer.from(once.colors), Buffer.from(other.colors), 'a different seed is a different sky');

  // Overcast is dimmer than a clear day at the horizon.
  const rain = composeArenaSky({ ...opts, weather: 'R' });
  const clear = at(once, 0, PANO_HEIGHT - 1).reduce((a, b) => a + b, 0);
  const grey = at(rain, 0, PANO_HEIGHT - 1).reduce((a, b) => a + b, 0);
  assert.ok(grey < clear, `overcast ${grey} is dimmer than clear ${clear}`);

  // A desert's horizon is sand and a mountain one cold grey, not the temperate blue.
  const desert = composeArenaSky({ ...opts, climate: 'D' });
  assert.notDeepEqual(at(desert, 0, 0), at(once, 0, 0));
  assert.ok(at(desert, 0, 0)[0] > at(desert, 0, 0)[2], 'sand is warm: red above blue');
});

test('the install\'s own sky is built end to end, and the light count is real', async () => {
  const built = await buildArenaSky(data, { infName: 'TCN.INF', seed: 20232 });
  assert.ok(built, 'the install has sky art');
  assert.equal(built.width, PANO_WIDTH);
  assert.equal(built.art.mountains, 22);
  assert.equal(built.art.clouds, 17);
  assert.ok(built.clearColor.every((v) => v >= 0 && v <= 1));
  assert.ok(built.fillColor.every((v) => v >= 0 && v <= 1));
  // A real sky is not a flat colour: many distinct shades over the strip.
  const seen = new Set();
  for (let i = 0; i < built.colors.length; i += 4) {
    seen.add((built.colors[i] << 16) | (built.colors[i + 1] << 8) | built.colors[i + 2]);
  }
  assert.ok(seen.size > 200, `the sky holds ${seen.size} distinct colours`);
});

test('the night card is its own sky, not a dimmed day', () => {
  const opts = { palette: { rgb: new Uint8Array(768) }, climate: 'T', weather: 'N', seed: 42 };
  const day = composeArenaSky(opts);
  const night = composeArenaSky({ ...opts, night: true });
  // The gradient really is darker, climatically: deep blue-black, not grey.
  const meanAt = (pano, predicate) => {
    let sum = 0, n = 0;
    for (let i = 0; i < pano.colors.length; i += 4) {
      if (predicate(pano, i)) { sum += (pano.colors[i] + pano.colors[i + 1] + pano.colors[i + 2]) / 3; n++; }
    }
    return n ? sum / n : 0;
  };
  const dayMean = meanAt(day, () => true);
  const nightMean = meanAt(night, (p, i) => p.colors[i + 3] === 255
    && !(p.colors[i] > 140 && p.colors[i + 1] > 140));  // stars excluded by their brightness
  assert.ok(nightMean < dayMean * 0.45, `${nightMean} vs a day mean ${dayMean}`);
  // Night is bluer than it is red: a night sky's own tint, not a grey filter.
  for (const [r, g, b] of [night.clearColor.map((v) => v * 255), night.fillColor.map((v) => v * 255)]) {
    assert.ok(b >= r, `night blue ${b} >= night red ${r}`);
  }
});
