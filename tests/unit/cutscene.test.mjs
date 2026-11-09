// THE INSTALL'S OWN MOVIES — `game/cutscene.js` against the real `.FLC` bytes.
//
// Every pin here reads the install's own file: the catalogue's names must exist, the header
// must be the one Arena wrote (320×200, 8 bpp), the frame count and the pacing must come from
// the header rather than from a constant in this project, and a decoded frame must carry real
// art — not a black buffer that "decoded successfully". `JAGAR.FLC` is the small one (25 KB,
// 28 frames), so a whole walk through it is cheap; `INTRO.FLC` is 1.5 MB and is only opened
// far enough to prove the big ones load.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { CUTSCENES, cutsceneByName, cutsceneNames, decodeCutscene, frameBytes } from '../../src/game/cutscene.js';
import { cutsceneSong } from '../../src/game/arenaMusic.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const file = (name) => path.join(ARENA, name);
const bytesOf = (name) => (fs.existsSync(file(name)) ? new Uint8Array(fs.readFileSync(file(name))) : null);

const SMALL = 'JAGAR.FLC';
const small = bytesOf(SMALL);

test('every movie the catalogue names is in this install', () => {
  const missing = cutsceneNames().filter((name) => !fs.existsSync(file(name)));
  assert.deepEqual(missing, [], 'the install ships every `.FLC` the catalogue lists');
  // …and a bare word resolves the way the dev door's `?cutscene=intro` does.
  assert.equal(cutsceneByName('intro').file, 'INTRO.FLC');
  assert.equal(cutsceneByName('END01').file, 'END01.FLC');
  assert.equal(cutsceneByName('nonsense'), null);
  assert.ok(CUTSCENES.every((c) => c.beat && c.what), 'each one carries the beat it belongs to');
});

test('a movie decodes to the header Arena wrote, with the file’s own pacing', () => {
  if (!small) return; // no install: stand down like the other install-pinned units
  const movie = decodeCutscene(small, SMALL);
  assert.ok(movie.ok, movie.reason ?? 'decodes');
  assert.equal(movie.width, 320);
  assert.equal(movie.height, 200);
  assert.equal(movie.frameCount, 28, 'the header’s own frame count');
  // 128 ms in the header, through the reader's own law (ms / 1000 → seconds → ×1000).
  assert.equal(Math.round(movie.delayMs), 128);
  assert.equal(Math.round(movie.totalMs), 128 * 28);
  assert.equal(movie.beat, 'tharn');
});

test('the frames are really walked: in order, one at a time, and not forever', () => {
  if (!small) return;
  const movie = decodeCutscene(small, SMALL);
  const first = movie.next();
  assert.equal(first.index, 0);
  assert.equal(first.width, 320);
  const drawn = first.colours.reduce((n, word) => ((word & 0xffffff) !== 0 ? n + 1 : n), 0);
  assert.ok(drawn > 5000, `the first frame is a picture, not a black buffer (${drawn} lit pixels)`);
  let count = 1;
  let last = null;
  for (;;) {
    const next = movie.next();
    if (!next) break;
    assert.equal(next.index, count, 'frames answer in order');
    count++;
    last = next;
    assert.ok(count <= 28, 'no more frames than the header counts');
  }
  assert.equal(count, 28, 'every frame of the file was answered');
  assert.equal(movie.next(), null, 'and then nothing');
  assert.ok(last.colours.length === 320 * 200);
  // A rewind starts the same walk again from the beginning.
  movie.rewind();
  assert.equal(movie.index(), 0);
  assert.equal(movie.next().index, 0);
});

test('the reader’s RGBA packing unpacks to the bytes a canvas wants', () => {
  const colours = new Uint32Array([0xff203040 >>> 0, 0xff00ff00 >>> 0]);
  const bytes = frameBytes(colours);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x40, 0x30, 0x20, 0xff]);
  assert.deepEqual(Array.from(bytes.slice(4, 8)), [0x00, 0xff, 0x00, 0xff]);
  // …and a caller may hand its own buffer back, so a player does not allocate per frame.
  const reuse = new Uint8ClampedArray(8);
  assert.equal(frameBytes(colours, reuse), reuse);
});

test('every movie the install ships decodes and carries a cue', () => {
  // The owner, 2026-10-19: *"all cutscenes with appropriate audio are added to the game"*.
  // This walks the install's own directory rather than a hand list: a `.FLC` that is not in
  // the catalogue, or that the FLIC reader cannot open, is a movie a player can never see.
  const loose = fs.readdirSync(ARENA).filter((name) => /\.FLC$/i.test(name)).sort();
  assert.ok(loose.length >= 17, `${loose.length} loose movies`);
  for (const name of loose) {
    const movie = decodeCutscene(bytesOf(name), name);
    assert.equal(movie.ok, true, `${name}: ${movie.reason ?? ''}`);
    assert.equal(movie.width, 320, `${name} width`);
    assert.equal(movie.height, 200, `${name} height`);
    assert.ok(movie.frameCount > 0, `${name} frames`);
    const first = movie.next();
    assert.ok(first && first.colours.some((word) => (word & 0xffffff) !== 0), `${name} has a drawn first frame`);
    assert.ok(cutsceneSong(name), `${name} has no music cue`);
  }
});

test('the big opening loads, and a name the install does not ship is refused honestly', () => {
  const intro = bytesOf('INTRO.FLC');
  if (intro) {
    const movie = decodeCutscene(intro, 'INTRO.FLC');
    assert.ok(movie.ok, movie.reason ?? 'the 1.5 MB opening decodes');
    assert.equal(movie.width, 320);
    assert.ok(movie.frameCount > 28, `a movie of its own length (${movie.frameCount} frames)`);
  }
  const refused = decodeCutscene(new Uint8Array(64).fill(0x42), 'NOSUCH.FLC');
  assert.equal(refused.ok, false);
  assert.match(String(refused.reason), /FLIC reader/);
});

// THE START-UP'S ORDER — Arena's own start-up sequence (OpenTESArena `IntroUiMVC.cpp`): the 3-D
// opening book (`INTRO.FLC`), a title and a quote card of 5 s, the scroll movie, then the three
// scroll pictures held for 13, 13 and 10 s. New Game has its own sequence from OpenTESArena's
// `MainMenuUiMVC::onNewGameButtonSelected`: the opening scroll, then nine `INTRO01–09.IMG`
// history panels at 5 s each, before creation. Every step's file must be in the install, loose
// or in GLOBAL.BSA.
import { NEW_GAME_STEPS, STARTUP_STEPS } from '../../src/game/cutscene.js';
import { parseImg } from '../../src/arena/image.js';
import { parseBsa } from '../../src/arena/bsaArchive.js';

test('the start-up and New Game each run Arena\'s own order and timing', () => {
  const order = STARTUP_STEPS.map((s) => s.file);
  assert.deepEqual(order, [
    'INTRO.FLC', 'TITLE.IMG', 'QUOTE.IMG', 'SCROLL.FLC', 'SCROLL01.IMG', 'SCROLL02.IMG', 'SCROLL03.IMG',
  ]);
  const stills = STARTUP_STEPS.filter((s) => s.kind === 'still');
  assert.deepEqual(stills.map((s) => s.seconds), [5, 5, 13, 13, 10]);
  for (const step of STARTUP_STEPS.filter((s) => s.kind === 'movie')) {
    assert.ok(cutsceneByName(step.file), `${step.file} is a catalogued movie`);
  }
  // **The New Game button owns the longer history.** OpenTESArena chains the opening scroll
  // and nine `INTRO` pictures before creation; the panels are the Emperor's betrayal and the
  // banishment of his champion. They are not the shorter `SCROLL01–03` start-up cards.
  assert.deepEqual(NEW_GAME_STEPS.map((s) => s.file), [
    'SCROLL.FLC', 'INTRO01.IMG', 'INTRO02.IMG', 'INTRO03.IMG', 'INTRO04.IMG', 'INTRO05.IMG',
    'INTRO06.IMG', 'INTRO07.IMG', 'INTRO08.IMG', 'INTRO09.IMG',
  ]);
  const newStills = NEW_GAME_STEPS.filter((s) => s.kind === 'still');
  assert.deepEqual(newStills.map((s) => s.seconds), Array(9).fill(5));
  assert.deepEqual(newStills.map((s) => s.paletteFile), Array(9).fill('SCROLL03.IMG'));
  assert.ok(cutsceneByName('SCROLL.FLC'), 'the New Game scroll is a catalogued movie');
  assert.equal(order[0], 'INTRO.FLC', 'the book greets the session first');
});

test('every opening and New Game picture is in the install and decodes with a palette', () => {
  const archive = fs.existsSync(file('GLOBAL.BSA'))
    ? parseBsa(new Uint8Array(fs.readFileSync(file('GLOBAL.BSA'))), 'GLOBAL.BSA')
    : null;
  const pictures = [...STARTUP_STEPS, ...NEW_GAME_STEPS].filter((s) => s.kind === 'still');
  for (const step of pictures) {
    const loose = bytesOf(step.file);
    const bytes = loose ?? archive?.get(step.file) ?? null;
    assert.ok(bytes, `${step.file} is in the install (loose or GLOBAL.BSA)`);
    const img = parseImg(new Uint8Array(bytes), step.file);
    assert.equal(img.width, 320, `${step.file} is 320 wide`);
    assert.equal(img.height, 200, `${step.file} is 200 high`);
    const paletteFile = step.paletteFile ?? step.file;
    const paletteBytes = bytesOf(paletteFile) ?? archive?.get(paletteFile);
    const palette = img.palette ?? (paletteBytes ? parseImg(new Uint8Array(paletteBytes), paletteFile).palette : null);
    assert.ok(palette, `${step.file} has a palette, its own or ${paletteFile}'s`);
  }
});

// THE DREAM AFTER CREATION — `TEMPLATE.DAT` key 1400 as captions, with the player's name filled in.
import { dreamCaptions } from '../../src/game/cutscene.js';
import { parseTemplateDat, templateEntries, templateStrings } from '../../src/arena/templateDat.js';

test('the dream narration (key 1400) is captions, one sentence group at a time, with the name filled', { skip: !fs.existsSync(file('TEMPLATE.DAT')) && 'no TEMPLATE.DAT' }, () => {
  const [entry] = templateEntries(parseTemplateDat(new Uint8Array(fs.readFileSync(file('TEMPLATE.DAT')))), 1400);
  assert.ok(entry, 'key 1400 exists');
  const captions = dreamCaptions(templateStrings(entry.value), { pcf: 'Ulf', pcn: 'Ulf Stone' });
  assert.ok(captions.length > 3, 'the narration spans several captions');
  assert.ok(captions.every((c) => c.length > 0), 'no empty caption');
  assert.ok(captions.every((c) => !c.includes('%pcf')), 'the first name is filled in');
  assert.ok(captions.join(' ').includes('Ulf, listen to me'), 'the name reads as the file means it');
  assert.ok(captions[0].startsWith('Do not fear for it is I, Ria Silmane.'), 'the speech opens with the file\'s first line');
  for (const c of captions) {
    const sentences = c.split(/(?<=[.!?])\s+/).length;
    assert.ok(c.length <= 140 || sentences === 1, 'a caption is at most 140 characters unless one sentence is longer');
  }
});

test('dreamCaptions fills a placeholder and groups sentences up to the limit', () => {
  const grouped = dreamCaptions(['One. Two. Three.'], {}, 10);
  assert.deepEqual(grouped, ['One. Two.', 'Three.']);
  assert.deepEqual(dreamCaptions(['Hello %pcf.'], { pcf: 'Ann' }), ['Hello Ann.']);
});
