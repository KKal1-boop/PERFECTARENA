// THE MAP SCREEN'S OWN ICONOGRAPHY (**block B16's rework**, and `D-35`).
//
// The world map was the one screen this port drew itself: the game's map art with **this project's**
// circles, diamonds, gold province rectangles and uppercase monospace names painted over it. Arena
// shipped every one of those as art in `GLOBAL.BSA` — `MAPOUT.CIF` (four marker icons in the marker
// gold), `MAPBLINK.CIF` (the same four in the bright gold the map blinks to) and `OUTPROV.CIF` (the
// nine province name plates in the game's own lettering) — and nothing in this project had ever read
// them. `src/game/mapScreen.js` is the law that replaced the invention.
//
// These checks are in two halves, like the other install-optional suites:
//
//   * **the rules**, on their own, so they mean something on a machine with no game on it;
//   * **the readings**, held against the install's own bytes — the frames' indices, the palette's
//     four colours, the plates' nine sizes and the three-way agreement between the province order
//     in the plate record, in the executable and in `CITYDATA.64`.
//
// And the finding that came out of the same pass: **a `.MNU` is an `.IMG`** (`docs/FORMATS.md` §12
// had it as UNVERIFIED). `TAMRIEL.MNU` is the map screen, `STARTGAM.MNU` the start menu's art and
// `MAPBTNS.MNU` the map's button strip; all three decode through `image.js` untouched — 12-byte
// header, 320×200, own palette, compression flag 4 — and `TAMRIEL.MNU`'s land/sea mask agrees with
// `TAMRIEL.IMG`'s on **all 64 000 pixels**, which is what makes them the same screen rather than two
// pictures of the same size.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseBsa } from '../../src/arena/bsaArchive.js';
import { parseImg, RAW_DIMENSIONS } from '../../src/arena/image.js';
import { parseCif } from '../../src/arena/cifFile.js';
import { parseCol } from '../../src/arena/palette.js';
import { parseCityData } from '../../src/arena/cityDataFile.js';
import { unpackPklite } from '../../src/arena/pklite.js';
import { exeTables } from '../../src/arena/exeTables.js';
import {
  BLINK_INDEX, BLINK_PERIOD_MS, MARKER_COLORS, MARKER_ICONS, MARKER_INDEX, MARKER_KINDS,
  MARKER_RECORDS, MAP_SCREEN_RECORD, PLATE_BACKGROUND_INDEX, PLATE_COLORS, PLATE_RECORD,
  PLATE_TEXT_INDEX, PROVINCE_MAPS, PROVINCE_PLATES, RECORD_LAYOUT, SCREEN_SIZE, blinkingAt,
  frameToRgba, indicesToRgba, legendRows, markerIcon, markerKind, markerRecord, paletteColor,
  plateIndexFor, provinceMapRecord, provincePointOf,
} from '../../src/game/mapScreen.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const haveBsa = fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));
const haveCol = fs.existsSync(path.join(ARENA, 'PAL.COL'));
const haveCity = fs.existsSync(path.join(ARENA, 'CITYDATA.64'));
const haveExe = fs.existsSync(path.join(ARENA, 'ACD.EXE'));
const noInstall = haveBsa && haveCol ? false : `the install is not beside this checkout (${ARENA})`;

/** One read of the install, kept for the whole file. */
let cached = null;
function install() {
  if (!cached) {
    const archive = haveBsa ? parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA') : null;
    cached = {
      archive,
      palette: haveCol ? parseCol(new Uint8Array(fs.readFileSync(path.join(ARENA, 'PAL.COL')))) : null,
      cityData: haveCity ? parseCityData(new Uint8Array(fs.readFileSync(path.join(ARENA, 'CITYDATA.64')))) : null,
      exe: haveExe ? exeTables(unpackPklite(new Uint8Array(fs.readFileSync(path.join(ARENA, 'ACD.EXE')))).image) : null,
    };
  }
  return cached;
}

/** Every index a frame uses besides 0 and its own lit one. */
function strayIndices(indices, lit) {
  const seen = new Set();
  for (const value of indices) if (value !== 0 && value !== lit) seen.add(value);
  return [...seen].sort((a, b) => a - b);
}

// ── the rules, on their own ──────────────────────────────────────────────────────────────────

test('the four markers are the four kinds of place, in the record’s own order', () => {
  assert.deepEqual(MARKER_KINDS, ['city', 'town', 'village', 'dungeon']);
  assert.deepEqual(MARKER_ICONS.city, { frame: 0, width: 18, height: 13 });
  assert.deepEqual(MARKER_ICONS.town, { frame: 1, width: 11, height: 12 });
  assert.deepEqual(MARKER_ICONS.village, { frame: 2, width: 10, height: 10 });
  assert.deepEqual(MARKER_ICONS.dungeon, { frame: 3, width: 16, height: 10 });
  assert.equal(MARKER_RECORDS.steady, 'MAPOUT.CIF');
  assert.equal(MARKER_RECORDS.blinking, 'MAPBLINK.CIF');
  assert.equal(MAP_SCREEN_RECORD, 'TAMRIEL.IMG');
  assert.deepEqual(SCREEN_SIZE, { width: 320, height: 200 });
});

test('a kind maps to its icon, a palace is a city, and nothing else has one', () => {
  assert.equal(markerKind('city'), 'city');
  assert.equal(markerKind('dungeon'), 'dungeon');
  assert.equal(markerKind('palace'), 'city', 'the records hold four icons; the palace is a city-state');
  assert.equal(markerKind('staff'), null);
  assert.equal(markerKind(''), null);
  assert.deepEqual(markerIcon('town'), MARKER_ICONS.town);
  assert.equal(markerIcon('staff'), null);
});

test('the blink is a function of the clock, and the record follows it', () => {
  assert.equal(blinkingAt(0), false);
  assert.equal(blinkingAt(BLINK_PERIOD_MS - 1), false);
  assert.equal(blinkingAt(BLINK_PERIOD_MS), true);
  assert.equal(blinkingAt(BLINK_PERIOD_MS * 2), false, 'and it comes back');
  assert.equal(markerRecord({ blinking: false }), 'MAPOUT.CIF');
  assert.equal(markerRecord({ blinking: true }), 'MAPBLINK.CIF');
});

test('a province is found by any of the three spellings, and an unknown one by none', () => {
  assert.equal(plateIndexFor('High Rock'), 0);
  assert.equal(plateIndexFor('high rock'), 0);
  assert.equal(plateIndexFor('Imperial Province'), 8);
  assert.equal(plateIndexFor('Summurset'), 4, 'the executable’s spelling');
  assert.equal(plateIndexFor('Summurset Isle'), 4, 'CITYDATA’s');
  assert.equal(plateIndexFor('Summerset Isle'), 4, 'the plate’s own spelling');
  assert.equal(plateIndexFor('Summerset Isles'), 4);
  assert.equal(plateIndexFor('the Summerset Isles'), 4, 'and with a word in front of it');
  assert.equal(plateIndexFor('Atmora'), -1);
  assert.equal(plateIndexFor(null), -1);
  assert.equal(PROVINCE_PLATES.length, 9);
});

test('the legend is the records’ own four rows', () => {
  const rows = legendRows();
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.kind), [...MARKER_KINDS]);
  assert.deepEqual(rows.map((r) => r.label), ['city-state', 'town', 'village', 'dungeon']);
  for (const row of rows) assert.equal(row.width, MARKER_ICONS[row.kind].width, `${row.kind} carries the record’s own size`);
});

test('a frame becomes pixels only where it is lit', () => {
  const indices = Uint8Array.from([0, 194, 0, 194, 12]);
  const rgba = frameToRgba(indices, 194, { r: 1, g: 2, b: 3 });
  assert.equal(rgba.length, 20);
  assert.deepEqual([...rgba.slice(0, 4)], [0, 0, 0, 0], 'index 0 is a cutout');
  assert.deepEqual([...rgba.slice(4, 8)], [1, 2, 3, 255]);
  assert.deepEqual([...rgba.slice(16, 20)], [0, 0, 0, 0], 'and so is any index the record does not use');
  const two = indicesToRgba(Uint8Array.from([20, 206]), { 20: { r: 9, g: 9, b: 9 }, 206: { r: 7, g: 7, b: 7 } });
  assert.deepEqual([...two.slice(0, 4)], [9, 9, 9, 255]);
  assert.deepEqual([...two.slice(4, 8)], [7, 7, 7, 255]);
});

// ── the readings, against the install ────────────────────────────────────────────────────────

test('the two marker records are four icons each: one index, one shape, twice', { skip: noInstall }, () => {
  const { archive } = install();
  const pairs = [[MARKER_RECORDS.steady, MARKER_INDEX], [MARKER_RECORDS.blinking, BLINK_INDEX]];
  for (const [record, index] of pairs) {
    const cif = parseCif(archive.get(record), record);
    assert.equal(cif.images.length, MARKER_KINDS.length, `${record} holds four icons`);
    MARKER_KINDS.forEach((kind, i) => {
      const frame = cif.images[i];
      const icon = MARKER_ICONS[kind];
      assert.equal(frame.width, icon.width, `${record} #${i} (${kind}) width`);
      assert.equal(frame.height, icon.height, `${record} #${i} (${kind}) height`);
      // The frame carries the pixel the original draws it at (`RECORD_LAYOUT`), and it is the same
      // in both records for that kind — which is a second way the four frames are the same four
      // shapes rather than four unrelated pictures.
      assert.equal(frame.xOffset, RECORD_LAYOUT.markers[record][i].x, `${record} #${i} (${kind}) x offset`);
      assert.equal(frame.yOffset, RECORD_LAYOUT.markers[record][i].y, `${record} #${i} (${kind}) y offset`);
      const lit = [...frame.indices].filter((v) => v === index).length;
      assert.ok(lit > 10, `${record} #${i} carries index ${index} (${lit} pixels)`);
      assert.deepEqual(strayIndices(frame.indices, index), [], `${record} #${i} carries nothing else`);
      assert.ok(lit / frame.indices.length < 0.5,
        `${record} #${i} is an outline, not a disc: ${(100 * lit / frame.indices.length).toFixed(0)}% of its rectangle`);
    });
  }
});

test('the marker gold and the blink gold are two bytes of PAL.COL', { skip: noInstall }, () => {
  const { palette } = install();
  const hex = (index) => {
    const c = paletteColor(palette, index);
    return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  assert.equal(hex(MARKER_INDEX), MARKER_COLORS.steady);
  assert.equal(hex(BLINK_INDEX), MARKER_COLORS.blinking);
  assert.equal(hex(PLATE_BACKGROUND_INDEX), PLATE_COLORS.background);
  assert.equal(hex(PLATE_TEXT_INDEX), PLATE_COLORS.text);
  assert.equal(MARKER_INDEX, 194);
  assert.equal(BLINK_INDEX, 223);
  assert.notEqual(MARKER_COLORS.steady, MARKER_COLORS.blinking, 'a blink has to be visible');
});

test('the plate record is nine plates, and the order of them is the province order', { skip: noInstall }, () => {
  const { archive, palette, cityData, exe } = install();
  const cif = parseCif(archive.get(PLATE_RECORD), PLATE_RECORD);
  assert.equal(cif.images.length, PROVINCE_PLATES.length, `${PLATE_RECORD} holds nine plates`);
  // The plates' own sizes, read off the record. They are the evidence for the order: the widest is
  // the longest name (`IMPERIAL PROVINCE` is 78 pixels) and the two-line one is `SUMMERSET ISLE`.
  assert.deepEqual(cif.images.map((f) => `${f.width}x${f.height}`),
    ['39x7', '45x9', '29x7', '47x7', '44x15', '44x9', '32x7', '50x9', '78x9']);
  for (const [i, frame] of cif.images.entries()) {
    assert.equal(frame.xOffset, RECORD_LAYOUT.plates[i].x, `plate #${i} carries the record’s own x`);
    assert.equal(frame.yOffset, RECORD_LAYOUT.plates[i].y, `plate #${i} carries the record’s own y`);
    assert.deepEqual(strayIndices([...frame.indices].filter((v) => v !== PLATE_BACKGROUND_INDEX), 0), [PLATE_TEXT_INDEX],
      `plate #${i} (${PROVINCE_PLATES[i]}) is drawn in the two palette indices and nothing else`);
    const bg = [...frame.indices].filter((v) => v === PLATE_BACKGROUND_INDEX).length;
    const text = [...frame.indices].filter((v) => v === PLATE_TEXT_INDEX).length;
    assert.ok(bg > 0 && text > 0, `plate #${i} has a plate and letters`);
    assert.ok(text < bg, `plate #${i} is a plate with words on it, not a wall of text`);
    assert.notEqual(paletteColor(palette, PLATE_BACKGROUND_INDEX).r, paletteColor(palette, PLATE_TEXT_INDEX).r);
  }
  // Three sources, one order: the plate record, the executable's province table and CITYDATA.64.
  // The executable lists **eight** provinces (the Imperial Province has no city-states and no
  // greeting), so the agreement is on the first eight and the ninth is CITYDATA's own.
  const ordered = (list) => list.map((name) => name.toLowerCase().replace(/[^a-z]/g, ''));
  const fromPlates = ordered(PROVINCE_PLATES.slice(0, 8));
  const fromCITYDATA = ordered(cityData.provinces.slice(0, 8).map((p) => p.name));
  assert.deepEqual(fromPlates, fromCITYDATA, 'the plates are in CITYDATA’s province order');
  assert.equal(cityData.provinces.length, 9);
  assert.match(cityData.provinces[8].name, /Imperial/, 'and the ninth is the Imperial Province, which has no plate of its own kind');
  if (exe) {
    const exeProvinces = ordered(exe.provinces);
    assert.equal(exeProvinces.length, 8, 'the executable lists the eight provinces');
    // The spellings are where the three disagree, and the check says so rather than hiding it:
    // the executable writes `Summurset`, CITYDATA `Summurset Isle`, the plate `SUMMERSET ISLE`.
    const reconciled = (name) => (name.startsWith('summurs') ? 'summurset' : name);
    assert.deepEqual(fromPlates.map(reconciled), exeProvinces.map(reconciled),
      'the plates are in the executable’s own province order');
  }
});

test('the executable’s settlement table is the 64 city-states — the same 64 the greetings are filed under', { skip: haveExe && haveCity ? false : 'needs ACD.EXE and CITYDATA.64', }, () => {
  // The third table this screen is built on, and the one that settles what "settlement" means in
  // Arena: the executable's sixty-four are **the city-states of the eight provinces** — eight each,
  // which is exactly the sixty-four greetings `citytxt` files (`arenaText.js`'s
  // `600 + provinceID × 8 + cityIndex`). The Imperial Province's own city-state is the world's
  // sixty-fifth named city-state and is not in the table at all.
  const { exe, cityData } = install();
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const named = [];
  for (const [provinceID, province] of cityData.provinces.entries()) {
    for (const location of province.locations) {
      if (location.kind === 'city' && location.name) named.push({ name: location.name, provinceID });
    }
  }
  assert.equal(named.length, 65, 'CITYDATA names 65 city-states: eight in each of the eight, one in the Imperial Province');
  assert.equal(exe.settlements.length, 64, 'and the executable lists sixty-four of them');
  for (const settlement of exe.settlements) {
    assert.ok(named.some((c) => norm(c.name) === norm(settlement)),
      `the executable's ${settlement} is a city-state of this world, spelled the same way`);
  }
  assert.deepEqual(named.filter((c) => !exe.settlements.some((s) => norm(s) === norm(c.name))).map((c) => c.name),
    ['Imperial City'], 'the one it does not list is the Imperial Province\u2019s own');
  // Its eight blocks of eight are one province each — **in a different province order from its own
  // province table**, which is the disagreement worth writing down: `PROVINCE_PLATES` (and the nine
  // map records, and `CITYDATA`) follow the province table, not this one.
  const blockProvinces = [];
  for (let block = 0; block < 8; block++) {
    const provinces = new Set(exe.settlements.slice(block * 8, block * 8 + 8)
      .map((s) => named.find((c) => norm(c.name) === norm(s)).provinceID));
    assert.equal(provinces.size, 1, `block ${block} of the settlement table is one province`);
    blockProvinces.push([...provinces][0]);
  }
  assert.deepEqual(blockProvinces, [2, 6, 1, 0, 3, 5, 4, 7],
    'Skyrim, Elsweyr, Hammerfell, High Rock, Morrowind, Valenwood, Summurset, Black Marsh');
});

test('the map’s icons are the HUD’s four icons, in the same order, one size up', { skip: noInstall }, () => {
  // The order of `MAPOUT.CIF`'s frames is settled without guessing: the archive also ships the four
  // HUD icons as headerless images whose sizes `image.js` already knows by name, and each map icon
  // is the HUD icon of the same order, two pixels wider and taller.
  const hud = { city: 'CITY.IMG', town: 'TOWN.IMG', village: 'VILLAGE.IMG', dungeon: 'DUNGEON.IMG' };
  const { archive } = install();
  const sizes = [];
  for (const kind of MARKER_KINDS) {
    const [w, h] = RAW_DIMENSIONS[hud[kind]];
    const decoded = parseImg(archive.get(hud[kind]), hud[kind]);
    assert.equal(decoded.width, w, `${hud[kind]} decodes at its known size`);
    assert.equal(decoded.height, h);
    sizes.push({ kind, hud: w / h, map: MARKER_ICONS[kind].width / MARKER_ICONS[kind].height });
  }
  // The shapes keep their proportions: the dungeon is the wide low one in both sets, the village the
  // square one, and each map icon is the same aspect as the HUD icon it stands for.
  assert.ok(sizes[3].map > 1.4 && sizes[3].hud > 1.4, 'the dungeon is the wide, low icon in both sets');
  assert.equal(sizes[2].map, 1, 'the village is the square one on the map');
  assert.equal(sizes[2].hud, 1, 'and in the HUD');
  for (const { kind, hud: a, map: b } of sizes) {
    assert.ok(Math.abs(a - b) < 0.16, `${kind}: HUD ${a.toFixed(2)} vs map ${b.toFixed(2)}`);
  }
});

test('the province map is the province, and a place on it is the file’s own pixel', () => {
  assert.equal(PROVINCE_MAPS.length, PROVINCE_PLATES.length);
  assert.deepEqual([...PROVINCE_MAPS], [
    'HIGHROCK.IMG', 'HAMERFEL.IMG', 'SKYRIM.IMG', 'MOROWIND.IMG', 'SUMERSET.IMG',
    'VALNWOOD.IMG', 'ELSWEYR.IMG', 'BLAKMRSH.IMG', 'IMPERIAL.IMG',
  ]);
  assert.equal(provinceMapRecord(0), 'HIGHROCK.IMG');
  assert.equal(provinceMapRecord('Skyrim'), 'SKYRIM.IMG');
  assert.equal(provinceMapRecord('Summerset Isle'), 'SUMERSET.IMG', 'any of the three spellings');
  assert.equal(provinceMapRecord('Imperial Province'), 'IMPERIAL.IMG');
  assert.equal(provinceMapRecord(9), null);
  assert.equal(provinceMapRecord('Atmora'), null);
  // A place's own pixel on its province's map is the `local` pair `CITYDATA.64` stores — the
  // province map is 320×200 and so is that pair's range, which is what makes this a reading.
  assert.deepEqual(provincePointOf({ local: { x: 9, y: 162 } }), { x: 9, y: 162 });
  assert.deepEqual(provincePointOf({}), { x: 0, y: 0 });
});

test('the nine province maps are one per province, and every place lands inside them', { skip: noInstall }, () => {
  const { archive, cityData } = install();
  for (const [i, record] of PROVINCE_MAPS.entries()) {
    const image = parseImg(archive.get(record), record);
    assert.equal(image.width, SCREEN_SIZE.width, `${record} is a screen wide`);
    assert.equal(image.height, SCREEN_SIZE.height, 'and a screen tall');
    assert.ok(image.palette, `${record} carries its own palette`);
    // The whole point of the second level: the 48 places of the province are inside its picture.
    const places = cityData.provinces[i].locations;
    assert.equal(places.length, 48, `${PROVINCE_PLATES[i]} holds 48 places`);
    for (const place of places) {
      const p = provincePointOf(place);
      assert.ok(p.x < image.width && p.y < image.height,
        `${place.name || `(unnamed ${place.id})`} at ${p.x},${p.y} is inside ${record}`);
    }
    // And they are spread over it rather than clustered in a corner (a wrong scale would do that).
    const xs = places.map((p) => p.local.x);
    const ys = places.map((p) => p.local.y);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 150, `${record}: the places span the map horizontally`);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 100, `${record}: and vertically`);
  }
});

test('the province pictures dot their own towns, on the towns’ own pixels', { skip: noInstall }, () => {
  // **The art checking the data, and the data checking the art.** Each province picture marks its
  // towns with a single cyan dot — no city, no village, no dungeon is dotted — and every one of
  // those dots sits on the town's own `local` pixel, a number this suite took from `CITYDATA.64`
  // and never told the picture about. Eight of eight towns are dotted in each of the **eight outer
  // provinces**; the Imperial Province's map carries no town dots at all, and the check says so
  // rather than being quietly relaxed for it.
  const { archive, cityData } = install();
  let outerTowns = 0;
  let dotted = 0;
  for (const [i, record] of PROVINCE_MAPS.entries()) {
    if (i === 8) continue;
    const image = parseImg(archive.get(record), record);
    const dots = cyanDotCentroids(image);
    const towns = cityData.provinces[i].locations.filter((l) => l.kind === 'town');
    assert.equal(towns.length, 8, `${PROVINCE_PLATES[i]} has eight towns`);
    for (const town of towns) {
      const nearest = Math.min(...dots.map((d) => Math.hypot(d.x - town.local.x, d.y - town.local.y)));
      assert.ok(nearest <= 3,
        `${record}: ${town.name} at ${town.local.x},${town.local.y} has a dot on it (nearest ${nearest.toFixed(1)} px, ${dots.length} dots)`);
      outerTowns++;
      dotted++;
    }
  }
  assert.equal(dotted, outerTowns, `${dotted} of ${outerTowns} towns in the eight outer provinces are dotted`);
  // And no dot is on anything else: every dot's nearest place is a town.
  for (const [i, record] of PROVINCE_MAPS.entries()) {
    if (i === 8) continue;
    const image = parseImg(archive.get(record), record);
    const places = cityData.provinces[i].locations;
    for (const dot of cyanDotCentroids(image)) {
      let best = null;
      let distance = Infinity;
      for (const place of places) {
        const d = Math.hypot(place.local.x - dot.x, place.local.y - dot.y);
        if (d < distance) { distance = d; best = place; }
      }
      if (distance <= 3) assert.equal(best.kind, 'town', `${record}: the dot at ${Math.round(dot.x)},${Math.round(dot.y)} is on a ${best.kind}`);
    }
  }
});

/** The centroids of an image's cyan pixels — the dots the province pictures draw their towns with. */
function cyanDotCentroids(image) {
  const cyan = (x, y) => {
    const p = image.indices[y * image.width + x] * 3;
    const [r, g, b] = [image.palette.rgb[p], image.palette.rgb[p + 1], image.palette.rgb[p + 2]];
    return g > r + 40 && b > r + 40;
  };
  const seen = new Set();
  const dots = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!cyan(x, y) || seen.has(`${x},${y}`)) continue;
      const stack = [[x, y]];
      let sx = 0; let sy = 0; let n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const key = `${cx},${cy}`;
        if (seen.has(key) || cx < 0 || cy < 0 || cx >= image.width || cy >= image.height) continue;
        if (!cyan(cx, cy)) continue;
        seen.add(key);
        sx += cx; sy += cy; n++;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      if (n >= 2) dots.push({ x: sx / n, y: sy / n });
    }
  }
  return dots;
}

test('a .MNU is an .IMG, and TAMRIEL.MNU is the map screen TAMRIEL.IMG already draws', { skip: noInstall }, () => {
  const screens = ['TAMRIEL.MNU', 'STARTGAM.MNU', 'MAPBTNS.MNU'].filter((n) => fs.existsSync(path.join(ARENA, n)));
  assert.equal(screens.length, 3, `the install ships the three .MNU files (found ${screens.join(', ') || 'none'})`);
  const decoded = {};
  for (const name of screens) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(ARENA, name)));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.deepEqual([...bytes.slice(0, 4)], [0, 0, 0, 0], `${name} opens like a headered image`);
    assert.equal(view.getUint16(4, true), 320, `${name} declares a 320-pixel width`);
    assert.equal(view.getUint16(6, true), 200, 'and 200 rows — a screen');
    assert.equal(view.getUint16(8, true) & 0x00ff, 4, `${name} is compressed the way a .IMG is (flag 4)`);
    assert.ok(view.getUint16(8, true) & 0x0100, 'and carries its own palette');
    const image = parseImg(bytes, name);
    assert.equal(image.width, 320);
    assert.equal(image.height, 200);
    assert.ok(image.palette, `${name} decoded with an embedded palette`);
    decoded[name] = image;
  }
  // **The same screen, not merely the same size.** Through each picture's own palette, every pixel
  // is either blue-dominant (sea) or not; the two masks agree on all 64 000 pixels.
  const art = parseImg(install().archive.get(MAP_SCREEN_RECORD), MAP_SCREEN_RECORD);
  const seaMask = (image) => {
    const out = new Uint8Array(image.width * image.height);
    for (let i = 0; i < out.length; i++) {
      const p = image.indices[i] * 3;
      const [r, g, b] = [image.palette.rgb[p], image.palette.rgb[p + 1], image.palette.rgb[p + 2]];
      out[i] = (b > r + 8 && b > g + 8) ? 1 : 0;
    }
    return out;
  };
  const a = seaMask(art);
  const b = seaMask(decoded['TAMRIEL.MNU']);
  let agree = 0;
  let sea = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] === b[i]) agree++; sea += a[i]; }
  assert.ok(sea > 10000, `the screen has a sea on it (${sea} pixels)`);
  assert.equal(agree, a.length, 'TAMRIEL.MNU and TAMRIEL.IMG are the same screen');
});
