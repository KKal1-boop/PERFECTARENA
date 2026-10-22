// THE INSTALL'S OWN MUSIC — the law, and the reader that opens Arena's XMIDI.
//
// The owner, 2026-10-19: *"search if there are files in arena for music to the game dependent of
// the place you are if town or tavern or wilderness or dungeon etc etc"*.
//
// Two halves are tested here, both without a browser: `game/arenaMusic.js`'s **choice** (an
// interior's trade, a settlement's kind and land, the night, the weather, water and a fight) and
// its **reader** (the RIFF `EVNT` chunk and the XMIDI stream, note by note, against the install's
// real songs where it is present).
//
//   node --test tests/unit/arenamusic.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  MUSIC_CATALOG, XMI_TICKS_PER_QUARTER, cutsceneSong, interiorMusicKind, jingleFor, musicFor,
  nightMusicActive, officialTrackSeconds, parseXmi, weatherKind, xmiEvents,
} from '../../src/game/arenaMusic.js';
import { CUTSCENES } from '../../src/game/cutscene.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const hasInstall = fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));

test('a building hears its own trade, and the palace is the palace', () => {
  assert.equal(interiorMusicKind('EQUIP3.MIF'), 'equipment');
  assert.equal(interiorMusicKind('TAVERN1.MIF'), 'tavern');
  assert.equal(interiorMusicKind('TEMPLE5.MIF'), 'temple');
  assert.equal(interiorMusicKind('MAGE2.MIF'), 'mages');
  assert.equal(interiorMusicKind('PALACE4.MIF'), 'palace');
  assert.equal(interiorMusicKind('IMPPAL.MIF'), 'palace');
  assert.equal(interiorMusicKind('NOBLE7.MIF'), 'house');
  assert.equal(interiorMusicKind('BS1.MIF'), 'house');
  // The reference's table: a tower is dungeon stone, not a house; the town palaces are palaces.
  assert.equal(interiorMusicKind('TOWER1.MIF'), 'dungeon');
  assert.equal(interiorMusicKind('TOWNPAL2.MIF'), 'palace');
  assert.equal(interiorMusicKind('VILPAL3.MIF'), 'palace');
  // A dungeon is everything else: a quest dungeon's numeric file, START, a crypt.
  assert.equal(interiorMusicKind('41649375.MIF'), 'dungeon');
  assert.equal(interiorMusicKind('START.MIF'), 'dungeon');
  assert.equal(interiorMusicKind('WCRYPT2.MIF'), 'dungeon');
});

test('the place chooses the song, in Arena’s own catalogue', () => {
  // A fight wins, then the water.
  assert.equal(musicFor({ combat: true, city: true, kind: 'city' }), MUSIC_CATALOG.combat);
  assert.equal(musicFor({ swimming: true, wild: true }), MUSIC_CATALOG.swimming);
  // The wild: night first, then the weather. **Arena's `.INF` letters work too** — `N` clear,
  // `R` overcast, `W` rain, `S` snow — because the first cut compared the letter to a word and
  // always played `SUNNYDAY`.
  assert.equal(musicFor({ wild: true, weather: 'W' }), MUSIC_CATALOG.weather.rain);
  assert.equal(musicFor({ wild: true, weather: 'R' }), MUSIC_CATALOG.weather.overcast);
  assert.equal(musicFor({ wild: true, weather: 'S' }), MUSIC_CATALOG.weather.snow);
  assert.equal(musicFor({ wild: true, weather: 'S', overcast: true }), MUSIC_CATALOG.weather.snowOvercast);
  assert.equal(musicFor({ wild: true, weather: 'N' }), MUSIC_CATALOG.weather.clear);
  assert.equal(musicFor({ wild: true, night: true, weather: 'rain' }), MUSIC_CATALOG.night);
  assert.equal(musicFor({ wild: true, weather: 'rain' }), MUSIC_CATALOG.weather.rain);
  assert.equal(musicFor({ wild: true, weather: 'snow' }), MUSIC_CATALOG.weather.snow);
  assert.equal(musicFor({ wild: true, weather: 'snow', overcast: true }), MUSIC_CATALOG.weather.snowOvercast);
  assert.equal(musicFor({ wild: true, weather: 'overcast' }), MUSIC_CATALOG.weather.overcast);
  assert.equal(musicFor({ wild: true, weather: 'clear' }), MUSIC_CATALOG.weather.clear);
  // A street's **ambience** is the weather, as the country's is; the settlement's own tune is
  // the one-shot `jingleFor`, played on arrival. The city's `.INF` letter drives it too.
  assert.equal(musicFor({ city: true, kind: 'city' }), 'SUNNYDAY.XFM');
  assert.equal(musicFor({ city: true, kind: 'city', weather: 'W' }), 'RAINING.XMI');
  assert.equal(musicFor({ city: true, kind: 'city', weather: 'R' }), 'OVERCAST.XMI');
  assert.equal(musicFor({ city: true, kind: 'city', weather: 'S', overcast: true }), 'OVERSNOW.XFM');
  assert.equal(musicFor({ city: true, kind: 'city', night: true }), 'NIGHT.XMI');
  // The arrival tune: its kind, and the desert's own three.
  assert.equal(jingleFor({ city: true, kind: 'city' }), 'CITY.XMI');
  assert.equal(jingleFor({ city: true, kind: 'town' }), 'TOWN.XMI');
  assert.equal(jingleFor({ city: true, kind: 'village' }), 'VILLAGE.XMI');
  assert.equal(jingleFor({ city: true, kind: 'city', desert: true }), 'ARABCITY.XMI');
  assert.equal(jingleFor({ city: true, kind: 'town', desert: true }), 'ARABTOWN.XMI');
  assert.equal(jingleFor({ city: true, kind: 'village', desert: true }), 'ARAB_VLG.XMI');
  assert.equal(jingleFor({}), null, 'only a settlement greets');
  // A building: its trade's song, and the same dungeon seed always the same dungeon song.
  assert.equal(musicFor({ interior: 'tavern' }), MUSIC_CATALOG.interior.tavern[0]);
  assert.equal(musicFor({ interior: 'palace' }), 'PALACE.XMI');
  assert.equal(musicFor({ interior: 'dungeon', seed: 7 }), musicFor({ interior: 'dungeon', seed: 7 }));
  assert.ok(MUSIC_CATALOG.interior.dungeon.includes(musicFor({ interior: 'dungeon', seed: 3 })));
  // Every named file is a real 8.3 record name, not an invented one.
  for (const name of [
    ...MUSIC_CATALOG.interior.dungeon, ...MUSIC_CATALOG.interior.equipment,
    ...MUSIC_CATALOG.interior.mages, ...MUSIC_CATALOG.interior.palace,
    ...MUSIC_CATALOG.interior.house, ...MUSIC_CATALOG.interior.tavern,
    ...MUSIC_CATALOG.interior.temple, ...Object.values(MUSIC_CATALOG.jingle.desert),
    ...Object.values(MUSIC_CATALOG.jingle.mild), ...Object.values(MUSIC_CATALOG.weather),
    MUSIC_CATALOG.night, MUSIC_CATALOG.swimming, MUSIC_CATALOG.combat,
    ...Object.values(MUSIC_CATALOG.cutscene),
  ]) assert.match(name, /^[A-Z0-9_]{1,8}\.(?:XMI|XFM)$/, `${name} is an 8.3 record`);
});

test('the music clock is the sources’ own: 06:19 to day, 17:40 to night', () => {
  assert.equal(nightMusicActive(0), true);
  assert.equal(nightMusicActive(6 * 60 + 18), true);
  assert.equal(nightMusicActive(6 * 60 + 19), false);
  assert.equal(nightMusicActive(12 * 60), false);
  assert.equal(nightMusicActive(17 * 60 + 39), false);
  assert.equal(nightMusicActive(17 * 60 + 40), true);
  // A `.INF` weather letter and the definitions' word answer the same thing.
  for (const [letter, word] of [['N', 'clear'], ['R', 'overcast'], ['W', 'rain'], ['S', 'snow']]) {
    assert.equal(weatherKind(letter), weatherKind(word), `${letter} = ${word}`);
    assert.equal(musicFor({ wild: true, weather: letter }), musicFor({ wild: true, weather: word }));
  }
});

test('the official track lengths trim the files’ silent tails', () => {
  // The catalogue's own running times: the town weather songs the owner named.
  assert.equal(officialTrackSeconds('SUNNYDAY.XFM'), 48);
  assert.equal(officialTrackSeconds('OVERCAST.XMI'), 46);
  // The catalogue's own table: Snowing 1:24, Oversnow 1:22, Rainy Day 1:15. (The owner's
  // message paired 1:22 with Snowing and 1:48 with Raining; the page's rows are these, and
  // 1:48 belongs to Swimming.)
  assert.equal(officialTrackSeconds('SNOWING.XMI'), 84);
  assert.equal(officialTrackSeconds('OVERSNOW.XFM'), 82);
  assert.equal(officialTrackSeconds('RAINING.XMI'), 75);
  assert.equal(officialTrackSeconds('DUNGEON1.XFM'), 58);
  assert.equal(officialTrackSeconds('DUNGEON1.XMI'), 117);
  assert.equal(officialTrackSeconds('NIGHT.XMI'), 121);
  // A stinger is seconds, not the 15 s file with its tail.
  assert.equal(officialTrackSeconds('CITY.XMI'), 5);
  assert.equal(officialTrackSeconds('VILLAGE.XMI'), 2);
  // A file the catalogue does not name has no cap.
  assert.equal(officialTrackSeconds('ARABCITY.XFM'), 3);
  assert.equal(officialTrackSeconds('NOSUCH.XMI'), null);
});

test('a cutscene hears the song its beat gives it — the definitions’ own cinematic table', () => {
  // `MusicDefinitions.txt` [Cinematic]: Intro = EVLINTRO, DreamGood/DreamBad = VISION,
  // Ending = EVLINTRO. Every story movie is one of those beats; WALK is the catalogue's tour.
  assert.equal(cutsceneSong('INTRO.FLC'), 'EVLINTRO.XMI');
  for (const file of ['VISION.FLC', 'CHAOSVSN.FLC', 'STAFF.FLC', 'SCROLL.FLC', 'KING.FLC',
    'MORPH.FLC', 'JAGAR.FLC', 'JAGRSHLD.FLC', 'JAGARDTH.FLC', 'NUJAGDTH.FLC']) {
    assert.equal(cutsceneSong(file), 'VISION.XMI', file);
  }
  assert.equal(cutsceneSong('END01.FLC'), 'EVLINTRO.XMI');
  assert.equal(cutsceneSong('END02.FLC'), 'EVLINTRO.XMI');
  assert.equal(cutsceneSong('AFLC2.FLC'), 'EVLINTRO.XMI');
  assert.equal(cutsceneSong('NUKING.FLC'), 'EVLINTRO.XMI');
  assert.equal(cutsceneSong('WARHAFT.FLC'), 'EVLINTRO.XMI');
  assert.equal(cutsceneSong('WALK.FLC'), 'CREDITS.XMI');
  assert.equal(cutsceneSong(''), null);
});

test('every movie the install ships is catalogued and has a cue', { skip: !hasInstall }, () => {
  // The owner, 2026-10-19: *"look ... all cutscenes with appropriate audio are added to the
  // game"*. A file on disk that the catalogue has never heard of is a movie no `?cutscene=`
  // door, no test and no future story beat can reach; a catalogued file with no cue is a
  // silent movie. Both are checked against the install's own directory, not a hand list.
  const loose = fs.readdirSync(ARENA)
    .filter((name) => /\.FLC$/i.test(name))
    .map((name) => name.toUpperCase())
    .sort();
  const catalogued = CUTSCENES.map((entry) => entry.file).sort();
  assert.equal(new Set(catalogued).size, catalogued.length, 'no duplicate catalogue rows');
  assert.deepEqual(catalogued, loose, 'the catalogue is exactly the install\'s loose movies');
  for (const file of loose) assert.ok(cutsceneSong(file), `${file} has no cue`);
});

test('the XMIDI reader opens the install’s own songs', { skip: !hasInstall }, async () => {
  const { parseBsa } = await import('../../src/arena/bsaArchive.js');
  const bsa = parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA');
  const every = [
    ...MUSIC_CATALOG.interior.dungeon, ...MUSIC_CATALOG.interior.equipment,
    ...MUSIC_CATALOG.interior.mages, ...MUSIC_CATALOG.interior.palace,
    ...MUSIC_CATALOG.interior.house, ...MUSIC_CATALOG.interior.tavern,
    ...MUSIC_CATALOG.interior.temple, ...Object.values(MUSIC_CATALOG.jingle.desert),
    ...Object.values(MUSIC_CATALOG.jingle.mild), ...Object.values(MUSIC_CATALOG.weather),
    MUSIC_CATALOG.night, MUSIC_CATALOG.swimming, MUSIC_CATALOG.combat,
    ...Object.values(MUSIC_CATALOG.cutscene),
  ];
  for (const name of [...new Set(every)]) {
    const bytes = bsa.get(name);
    assert.ok(bytes, `${name} is in GLOBAL.BSA`);
    const song = parseXmi(bytes);
    assert.ok(song, `${name} is a RIFF XMID with an EVNT chunk`);
    // A `[Jingle]` record is short (TOWN.XMI is 19 notes, 4 s); a dungeon is hundreds. The
    // assertion is that the reader found a tune, not that every record is long.
    assert.ok(song.notes.length > 5, `${name}: ${song.notes.length} notes`);
    // A `[Jingle]` is 2–15 s (VILLAGE 2.7, TOWN 4.0); a dungeon or a street is a minute or more.
    assert.ok(song.seconds > 1 && song.seconds < 1200, `${name}: ${song.seconds.toFixed(1)} s`);
    assert.equal(song.notes[0].at >= 0, true);
    // **Every note is a real note.** An XMIDI reader that forgets the note-on length reads the
    // next status as a velocity and produces keys and velocities above 127; those were the
    // "messy sounds". The assertions below are the reader's own invariant, not a sample.
    for (const note of song.notes) {
      assert.ok(note.note >= 0 && note.note <= 127, `${name}: key ${note.note}`);
      assert.ok(note.velocity > 0 && note.velocity <= 127, `${name}: velocity ${note.velocity}`);
      assert.ok(note.dur > 0 && Number.isFinite(note.dur), `${name}: duration ${note.dur}`);
      assert.ok(note.volume >= 0 && note.volume <= 1, `${name}: volume ${note.volume}`);
      assert.ok(note.at >= 0, `${name}: at ${note.at}`);
    }
  }
  // The measured examples: exact catalogue lengths from the corrected XMIDI clock.
  // A tavern is 0:29; Dungeon 2 is 1:57; Snowing 1:24; Raining 1:15; Sunny Day 0:48.
  const tavern = parseXmi(bsa.get('TAVERN.XMI'));
  assert.ok(Math.abs(tavern.seconds - 29) < 1, `TAVERN.XMI is about 29 s (${tavern.seconds.toFixed(1)})`);
  assert.ok(tavern.notes.length > 500, `TAVERN.XMI has 530 notes (${tavern.notes.length})`);
  const dungeon = parseXmi(bsa.get('DUNGEON2.XMI'));
  assert.ok(Math.abs(dungeon.seconds - 117) < 2, `DUNGEON2.XMI is about 117 s (${dungeon.seconds.toFixed(1)})`);
  const sunny = parseXmi(bsa.get('SUNNYDAY.XFM'));
  assert.ok(Math.abs(sunny.seconds - 48) < 1, `SUNNYDAY.XFM is about 48 s (${sunny.seconds.toFixed(1)})`);
  const rain = parseXmi(bsa.get('RAINING.XMI'));
  assert.ok(Math.abs(rain.seconds - 75) < 1, `RAINING.XMI is about 75 s (${rain.seconds.toFixed(1)})`);
  const snow = parseXmi(bsa.get('SNOWING.XMI'));
  assert.ok(Math.abs(snow.seconds - 84) < 1, `SNOWING.XMI is about 84 s (${snow.seconds.toFixed(1)})`);
  const night = parseXmi(bsa.get('NIGHT.XMI'));
  assert.ok(Math.abs(night.seconds - 121) < 1, `NIGHT.XMI is about 121 s (${night.seconds.toFixed(1)})`);
  // The stream's own laws are the ones the reader had to learn: 60 ticks a quarter, and a note
  // length written after every note-on.
  assert.ok(XMI_TICKS_PER_QUARTER === 60);
  assert.ok(xmiEvents(bsa.get('TAVERN.XMI'))?.length > 2000, 'the EVNT chunk is read by its big-endian size');
});
