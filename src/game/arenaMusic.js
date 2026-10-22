// ARENA'S OWN MUSIC — the install's `GLOBAL.BSA` songs, by the place you are standing in.
//
// The owner, 2026-10-19: *"search if there are files in arena for music to the game dependent of
// the place you are if town or tavern or wilderness or dungeon etc etc"*.
//
// **The files are there, and this module is the census.** `GLOBAL.BSA` holds 35 RIFF `XMI`/`XFM`
// songs — the count is the archive's, read with `tools/assetcoverage.mjs`'s own listing:
//
//   interiors   DUNGEON1…5, EQUIPMNT, MAGIC_2, PALACE, SNEAKING, SQUARE, TAVERN, TEMPLE
//   city        ARABCITY, ARABTOWN, ARAB_VLG, CITY, TOWN, VILLAGE
//   wild        SUNNYDAY, OVERCAST, RAINING, SNOWING, OVERSNOW, NIGHT
//   states      COMBAT, SWIMMING, EVIL, SNEAKING, VISION, EVLINTRO, WINGAME, CREDITS
//   screen      PERCNTRO, SHEET
//
// The mapping is **Arena's own**, not an invention: the reference's `data/audio/MusicDefinitions.txt`
// assigns each file to a type (the `[Interior]`, `[Jingle]`, `[Night]`, `[Swimming]` and `[Weather]`
// sections), and this module keeps that grouping. The `XFM` spellings are the same RIFF `XMID`
// container — measured, the reader below opens `DUNGEON1.XFM`, `SUNNYDAY.XFM` and `OVERSNOW.XFM`
// exactly as it opens the `.XMI` ones, so no second format is involved.
//
// ## The law
//
// One answer for one context, so the player hears the place change when it changes:
//
//   * a **fight** wins over everything (`COMBAT`);
//   * **swimming** (`SWIMMING`) wins over the place, because the water is the place;
//   * **night** outdoors and in the wild is `NIGHT`, then the weather's own song
//     (`RAINING`, `SNOWING`/`OVERSNOW`, `OVERCAST`, `SUNNYDAY` for clear);
//   * a **settlement's street** is its jingle — `CITY`, `TOWN` or `VILLAGE` by its kind, and the
//     desert's `ARAB*` variants when the land is desert (the definitions' own `Desert` rows);
//   * a **building** is its trade — `TAVERN`/`SQUARE` for a tavern, `TEMPLE`, `EQUIPMNT`,
//     `MAGIC_2` for a Mages Guild, `PALACE`, `SNEAKING` for a house, and a dungeon `DUNGEON1…5`
//     chosen by the level's own seed so two dungeons are not one song.
//
// Nothing here touches the DOM, `fetch` or WebAudio: the reader is pure and the player
// (`game/musicPlayer.js`) is the browser half.

/**
 * **The official track lengths**, in seconds, from the game's own soundtrack catalogue.
 *
 * The `.XMI`/`.XFM` files carry long silent tails and tracker rests — `SUNNYDAY.XFM` decodes to
 * 132 s with its last event at 2:12, while the official track is **0:48** of music and the rest
 * is silence. Looping the decoded file therefore played half a minute of nothing, and the owner
 * heard "the track playing right now is not correct". These are the catalogued durations
 * (Fandom's *The Elder Scrolls: Arena Official Soundtrack*), and `player/` caps each parsed song
 * at its own so the loop is the tune, not the file's padding.
 *
 * Where a version differs (Dungeon 1's FM release is 0:58 against the 1:57 MIDI), the longer —
 * the official track's — is kept only when it fits the decoded stream; a cap never extends a
 * file.
 */
export const MUSIC_TRACK_SECONDS = Object.freeze({
  'PERCNTRO.XMI': 56,
  'EVLINTRO.XMI': 67,
  'SHEET.XMI': 194,
  // The FM release of Dungeon 1 is its own 0:58 track; the General MIDI one is 1:57.
  'DUNGEON1.XMI': 117, 'DUNGEON1.XFM': 58,
  'DUNGEON2.XMI': 117, 'DUNGEON3.XMI': 120, 'DUNGEON4.XMI': 280, 'DUNGEON5.XMI': 117,
  'SUNNYDAY.XMI': 48, 'SUNNYDAY.XFM': 48,
  'OVERCAST.XMI': 46,
  // The catalogue's own table: Snowing 1:24, Oversnow 1:22, Rainy Day 1:15.
  'SNOWING.XMI': 84,
  'OVERSNOW.XMI': 82, 'OVERSNOW.XFM': 82,
  'RAINING.XMI': 75,
  'SWIMMING.XMI': 108,
  'NIGHT.XMI': 121,
  'EQUIPMNT.XMI': 33,
  'MAGIC_2.XMI': 86,
  'PALACE.XMI': 31,
  'TEMPLE.XMI': 29,
  'SNEAKING.XMI': 74,
  'TAVERN.XMI': 29,
  'SQUARE.XMI': 34,
  'VISION.XMI': 33,
  'CITY.XMI': 5,
  'TOWN.XMI': 5,
  'VILLAGE.XMI': 2,
  'ARABCITY.XMI': 3, 'ARABCITY.XFM': 3,
  'ARABTOWN.XMI': 4, 'ARABTOWN.XFM': 4,
  'ARAB_VLG.XMI': 2, 'ARAB_VLG.XFM': 2,
  'EVIL.XMI': 46,
  'COMBAT.XMI': 60,
  'WINGAME.XMI': 75,
  'CREDITS.XMI': 62,
});

/** The official length of a song, or null when the catalogue does not name it. */
export function officialTrackSeconds(name) {
  const key = String(name ?? '').toUpperCase();
  return MUSIC_TRACK_SECONDS[key] ?? null;
}

/** Every song the install ships, by the type `MusicDefinitions.txt` gives it. */
export const MUSIC_CATALOG = Object.freeze({
  interior: Object.freeze({
    dungeon: Object.freeze(['DUNGEON1.XMI', 'DUNGEON2.XMI', 'DUNGEON3.XMI', 'DUNGEON4.XMI', 'DUNGEON5.XMI']),
    equipment: Object.freeze(['EQUIPMNT.XMI']),
    mages: Object.freeze(['MAGIC_2.XMI']),
    palace: Object.freeze(['PALACE.XMI']),
    house: Object.freeze(['SNEAKING.XMI']),
    tavern: Object.freeze(['TAVERN.XMI', 'SQUARE.XMI']),
    temple: Object.freeze(['TEMPLE.XMI']),
  }),
  jingle: Object.freeze({
    desert: Object.freeze({ city: 'ARABCITY.XMI', town: 'ARABTOWN.XMI', village: 'ARAB_VLG.XMI' }),
    mild: Object.freeze({ city: 'CITY.XMI', town: 'TOWN.XMI', village: 'VILLAGE.XMI' }),
  }),
  night: 'NIGHT.XMI',
  swimming: 'SWIMMING.XMI',
  combat: 'COMBAT.XMI',
  // **The story's own cues, exactly as `MusicDefinitions.txt` lays them down.** Its
  // `[Cinematic]` section has one type per beat: `Intro` = `EVLINTRO`, `DreamGood` and
  // `DreamBad` = `VISION`, and `Ending` = `EVLINTRO` (not `WINGAME`, which the definitions do
  // not put in a cinematic). A movie plays one of these while it is on screen; the place's
  // song would score a scene the player is not standing in.
  cutscene: Object.freeze({
    intro: 'EVLINTRO.XMI',
    vision: 'VISION.XMI',
    ending: 'EVLINTRO.XMI',
    credits: 'CREDITS.XMI',
  }),
  weather: Object.freeze({
    // The FM release is the one the game's own `[Weather]` table names for a clear sky.
    clear: 'SUNNYDAY.XFM',
    overcast: 'OVERCAST.XMI',
    rain: 'RAINING.XMI',
    snow: 'SNOWING.XMI',
    snowOvercast: 'OVERSNOW.XFM',
  }),
});

/**
 * The trade a building's map is, from its own filename.
 *
 * The city door table opens `EQUIP1…8`, `MAGE1…8`, `NOBLE1…8`, `TAVERN1…8`, `TEMPLE1…8`,
 * `BS1…8`, `TOWER1…8` and `WCRYPT1…8` (`game/shops.js`), and the palace has its own names
 * (`game/staticFolk.js`'s `isPalaceMap`). Everything else — `START.MIF`, a numeric `CITYDATA`
 * dungeon, `IMPPAL`'s levels — is a dungeon's stone.
 *
 * @param {string|null} mapName
 * @returns {'dungeon'|'equipment'|'mages'|'palace'|'house'|'tavern'|'temple'}
 */
export function interiorMusicKind(mapName) {
  const name = String(mapName ?? '').toUpperCase();
  // **The reference's own table** (`OpenTESArena`'s `MusicUtils::getInteriorMusicType`): a
  // crypt, a dungeon **and a tower** are all `Dungeon`; `BS` and `NOBLE` are a house; the
  // town and village palaces are the palace. The first cut filed a tower under the house's
  // sneaking song, which is not what the game plays.
  if (/^(?:IMPPAL|PALACE|TOWNPAL|VILPAL)\d*\.MIF$/.test(name)) return 'palace';
  if (/^EQUIP/.test(name)) return 'equipment';
  if (/^TAVERN/.test(name)) return 'tavern';
  if (/^TEMPLE/.test(name)) return 'temple';
  if (/^MAGE/.test(name)) return 'mages';
  if (/^(?:BS|NOBLE)\d*\.MIF$/.test(name)) return 'house';
  // `TOWER`, `WCRYPT` and everything else are the dungeon's stone.
  return 'dungeon';
}

/** One of the eight settlement kinds spelled as the jingle table spells it. */
function jingleKind(kind) {
  const k = String(kind ?? '').toLowerCase();
  if (k === 'city' || k === 'citystate' || k === 'city-state') return 'city';
  if (k === 'town') return 'town';
  return 'village';   // a village, and anything a caller did not name
}

/**
 * **The weather as `MusicDefinitions.txt` names it.** Arena's `.INF` filenames carry one letter —
 * `N` clear, `R` overcast, `W` rain, `S` snow (`game/arenaSky.js`) — and the definitions speak
 * words. The first cut compared the letter to a word, so every sky fell through to `SUNNYDAY`: the
 * owner's *"town music is not correct i suppose all musics are not the correct ones"*. Both
 * spellings are accepted here, and anything unknown is clear.
 *
 * @param {string} weather a `.INF` letter or a word
 * @returns {'clear'|'overcast'|'rain'|'snow'}
 */
/**
 * **When the night song takes over.** The soundtrack catalogue states Nighttime starts at
 * **5:40 p.m.**, and the reference's clock file puts the day switch at 06:19; neither is the
 * daylight shader's dawn and dusk, which is what this project used before the sources were read.
 */
export const MUSIC_DAY_START_MINUTES = 6 * 60 + 19;
// The soundtrack page's own sentence: Nighttime "Starts at 5:40 P.M." (17:40).
export const MUSIC_NIGHT_START_MINUTES = 17 * 60 + 40;

/**
 * Is the night music active at this minute of the day?
 * @param {number} minutes minutes since midnight
 * @returns {boolean}
 */
export function nightMusicActive(minutes) {
  const m = ((Math.trunc(Number(minutes) || 0) % 1440) + 1440) % 1440;
  return m < MUSIC_DAY_START_MINUTES || m >= MUSIC_NIGHT_START_MINUTES;
}

export function weatherKind(weather) {
  const w = String(weather ?? '').trim().toLowerCase();
  if (w === 'w' || w === 'rain' || w === 'raining') return 'rain';
  if (w === 's' || w === 'snow' || w === 'snowing') return 'snow';
  if (w === 'r' || w === 'overcast') return 'overcast';
  return 'clear';
}

/** A stable 0…n−1 from a seed, so a dungeon's song does not change between visits. */
function pick(list, seed) {
  if (!list || !list.length) return null;
  const n = Math.abs(Math.trunc(Number(seed) || 0)) % list.length;
  return list[n] ?? list[0];
}

/**
 * **THE SONG A CONTEXT HEARS.**
 *
 * @param {object} ctx
 * @param {boolean} [ctx.combat]      a living foe is in the fight's own reach
 * @param {boolean} [ctx.swimming]    the feet are under a named water line
 * @param {boolean} [ctx.wild]        the country, not a settlement
 * @param {boolean} [ctx.city]        a settlement's street
 * @param {string}  [ctx.kind]        `city`/`town`/`village` for a street
 * @param {boolean} [ctx.desert]      the land is desert (the `ARAB*` jingles)
 * @param {boolean} [ctx.night]       the clock says night
 * @param {string}  [ctx.weather]     `clear`/`overcast`/`rain`/`snow`
 * @param {string}  [ctx.interior]    `interiorMusicKind`'s answer for a building
 * @param {number}  [ctx.seed]        the level's seed, for the dungeon's pick
 * @returns {string|null} a file in the install, or null when nothing fits
 */
export function musicFor(ctx = {}) {
  if (ctx.combat) return MUSIC_CATALOG.combat;
  if (ctx.swimming) return MUSIC_CATALOG.swimming;
  // **Outdoors is the weather's** — a settlement's street and the country alike.
  if (ctx.wild || ctx.city) {
    if (ctx.night) return MUSIC_CATALOG.night;
    const weather = weatherKind(ctx.weather);
    if (weather === 'rain') return MUSIC_CATALOG.weather.rain;
    if (weather === 'snow') {
      return ctx.overcast ? MUSIC_CATALOG.weather.snowOvercast : MUSIC_CATALOG.weather.snow;
    }
    if (weather === 'overcast') return MUSIC_CATALOG.weather.overcast;
    return MUSIC_CATALOG.weather.clear;
  }
  const kind = ctx.interior ?? 'dungeon';
  const table = MUSIC_CATALOG.interior[kind] ?? MUSIC_CATALOG.interior.dungeon;
  return pick(table, ctx.seed);
}

/**
 * **A settlement's entrance tune**, played once when its street opens.
 *
 * `TOWN` is measured at 4.0 seconds and `VILLAGE` at 2.4 — these are the `[Jingle]` records, not
 * a loop — so they belong to the arrival and not to the ambience (`musicFor` gives the street
 * its weather song). A desert land hears the `ARAB*` three instead, the definitions' own
 * `Desert` rows.
 *
 * @param {{city?: boolean, kind?: string, desert?: boolean}} ctx
 * @returns {string|null}
 */
export function jingleFor(ctx = {}) {
  if (!ctx.city) return null;
  const table = ctx.desert ? MUSIC_CATALOG.jingle.desert : MUSIC_CATALOG.jingle.mild;
  return table[jingleKind(ctx.kind)] ?? table.town;
}

/**
 * **The song a cutscene hears**, from the movie's own beat (`game/cutscene.js`'s catalogue).
 *
 * The beats are this project's wiring, and so is this reading of them: the opening movie is
 * `EVLINTRO`, every dream and the Staff's own scenes are `VISION`, Tharn's transformation and
 * his fall are `EVIL`, and the endings are `WINGAME` (the closing roll is `CREDITS`).
 *
 * @param {string} name a `.FLC` name, e.g. `VISION.FLC`
 * @returns {string|null}
 */
export function cutsceneSong(name) {
  const file = String(name ?? '').trim().toUpperCase();
  if (!file) return null;
  // The definitions' own four cinematic beats: the opening and the ending share `EVLINTRO`;
  // every dream — good or bad, and every story movie is a vision — is `VISION`.
  if (file === 'INTRO.FLC' || file === 'WARHAFT.FLC') return MUSIC_CATALOG.cutscene.intro;
  if (/^(?:END0[12]|AFLC2|NUKING)\.FLC$/.test(file)) return MUSIC_CATALOG.cutscene.ending;
  if (file === 'WALK.FLC') return MUSIC_CATALOG.cutscene.credits;
  return MUSIC_CATALOG.cutscene.vision;
}

// ── THE READER: RIFF `XMID` (Arena's `.XMI` and `.XFM`) ───────────────────────────────────────

/**
 * XMIDI's own tempo is a **constant 120 BPM** (500 000 µs a quarter). The format's tempo meta
 * events are not the timing law: the reference player replaces every one of them with 500 000
 * (`MidiParser_XMIDI::parseNextEvent`'s `TEMPO_500K`), and doing the same is what makes the
 * decoded lengths land exactly on the catalogue's: SUNNYDAY 48.2 s, RAINING 74.9 s, NIGHT
 * 121.5 s, DUNGEON1.XFM 58.3 s. Keeping the files' own tempo meta gave a 2:00 SUNNYDAY and a
 * 4:43 NIGHT — the owner's "music is not correct" from the other end.
 */
const XMI_TEMPO = 500000;
/** XMIDI's own tick resolution: 60 ticks to a quarter, not MIDI's 120. */
export const XMI_TICKS_PER_QUARTER = 60;

/** A big-endian 32-bit size, the RIFF container's own law. */
function be32(bytes, at) {
  return (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
}

/** The `EVNT` chunk of a RIFF `FORM … XMID` (Arena wraps it in an `XDIR`/`CAT ` container). */
export function xmiEvents(bytes) {
  if (!bytes?.length) return null;
  // `EVNT` is sought by hand: `Buffer` is Node's, and this module also runs in the page.
  let at = -1;
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === 0x45 && bytes[i + 1] === 0x56 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x54) { at = i; break; }
  }
  if (at < 0 || at + 8 > bytes.length) return null;
  const size = be32(bytes, at + 4);
  const start = at + 8;
  if (size <= 0 || start + size > bytes.length) return null;
  return bytes.subarray(start, start + size);
}

/**
 * **THE XMIDI EVENT STREAM, READ.**
 *
 * Arena's songs are `XMID`, and it is **not** a Standard MIDI File. Three differences decide
 * whether a reader plays the tune or a bag of noise:
 *
 *   1. **The delta is a sum of 7-bit bytes, not a VLQ.** Between events every byte below 0x80
 *      adds to the delay, and the status byte (always ≥ 0x80) ends it — a zero delta is simply
 *      omitted. The reference player's `readVLQ2` is exactly this loop. A plain SMF reader takes
 *      `87 07` for a two-byte VLQ and loses the status that follows; that is how this port's
 *      first reader produced note 182 and velocity 178, which the owner heard as "a bunch of
 *      messy sounds".
 *   2. **A note-on carries its own length.** After note and velocity comes a standard MIDI VLQ
 *      duration in ticks; XMIDI has no note-off events. Reading the next status as a velocity —
 *      the old bug — leaves every length to an accidental note-off that may never come.
 *   3. **Timing is a constant 60 PPQN at 120 BPM.** See `XMI_TEMPO`: the tempo meta is replaced,
 *      not obeyed. With this the decoded lengths match the catalogue to a tenth of a second
 *      (`SUNNYDAY` 48.2, `RAINING` 74.9, `NIGHT` 121.5, `DUNGEON1.XFM` 58.3).
 *
 * The chunk size itself is big-endian, because RIFF is — `00 00 09 F8` is 2 552.
 *
 * The result is the notes as **seconds**, which is what a WebAudio player needs. `volume` is
 * the channel's own controller state (CC7 × CC11) at the note's onset, so a file's mix is
 * respected rather than every channel being equally loud.
 *
 * @param {Uint8Array} bytes  the whole RIFF file, `FORM XDIR` and all
 * @returns {{notes: {at: number, dur: number, note: number, velocity: number, channel: number,
 *   program: number, volume: number}[], seconds: number, events: number}|null}
 */
export function parseXmi(bytes) {
  const events = xmiEvents(bytes);
  if (!events) return null;
  const notes = [];
  /** @type {Map<number, number>} */ const programs = new Map();
  /** @type {Map<number, number>} */ const volumes = new Map();
  /** @type {Map<number, number>} */ const expressions = new Map();
  let index = 0;
  let tick = 0;
  let count = 0;
  let endTick = 0;
  let noteEndTick = 0;
  /** One tick is a sixtieth of a quarter at 500 000 µs: 120 ticks a second. */
  const secondsAt = (wanted) => (Math.max(0, wanted) / XMI_TICKS_PER_QUARTER) * (XMI_TEMPO / 1e6);

  /** A standard MIDI variable-length quantity (used for note lengths and meta sizes). */
  const lengthAt = (pos) => {
    let value = 0;
    for (let n = 0; n < 4 && pos < events.length; n++) {
      const byte = events[pos++];
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return [value, pos];
  };

  while (index < events.length) {
    // **The XMIDI delay**: every byte below 0x80 adds to it; the status ends it. Zero is
    // encoded by writing no bytes at all.
    let delta = 0;
    while (index < events.length && !(events[index] & 0x80)) delta += events[index++];
    if (index >= events.length) break;
    tick += delta;
    const status = events[index++];
    count++;
    const high = status & 0xf0;
    const channel = status & 0x0f;
    if (high === 0x90) {
      const note = events[index++];
      const velocity = events[index++];
      const [length, next] = lengthAt(index);
      index = next;
      if (velocity > 0 && note <= 127) {
        // A zero length is a very short note in the AIL driver; one tick keeps it audible and
        // keeps the end of the song honest.
        const durTicks = Math.max(1, length);
        const gain = (volumes.get(channel) ?? 1) * (expressions.get(channel) ?? 1);
        notes.push({
          at: secondsAt(tick),
          dur: secondsAt(tick + durTicks) - secondsAt(tick),
          note,
          velocity,
          channel,
          program: programs.get(channel) ?? 0,
          volume: Math.max(0, Math.min(1, gain)),
        });
        endTick = Math.max(endTick, tick + durTicks);
        noteEndTick = Math.max(noteEndTick, tick + durTicks);
      }
    } else if (high === 0x80) {
      // XMIDI does not normally write note-offs; if one appears it has the two data bytes and
      // no length (the note-on already carried its own).
      index += 2;
    } else if (high === 0xa0 || high === 0xb0 || high === 0xe0) {
      const a = events[index++];
      const b = events[index++];
      if (high === 0xb0) {
        // Channel volume and expression are the mix. The file's own balance is the reason a
        // pad is not as loud as a lead, and throwing it away made every channel shout.
        if (a === 0x07) volumes.set(channel, b / 127);
        else if (a === 0x0b) expressions.set(channel, b / 127);
      }
    } else if (high === 0xc0) {
      programs.set(channel, events[index++]);
    } else if (high === 0xd0) {
      index += 1;
    } else if (status === 0xff) {
      const type = events[index++];
      const [length, next] = lengthAt(index);
      index = next;
      // **The tempo is replaced, not obeyed** (`XMI_TEMPO`): skip it like any other meta.
      index += length;
      if (type === 0x2f) break;   // end of track
    } else if (status === 0xf0 || status === 0xf7) {
      const [length, next] = lengthAt(index);
      index = next + length;
    } else {
      // An unknown system status: stop honestly rather than read the rest as garbage.
      break;
    }
  }
  notes.sort((a, b) => a.at - b.at);
  // **The song ends with its last note.** `SUNNYDAY.XMI` carries a long silent tail after its
  // final event whose stray delta decodes to 9 994 s; `noteEndTick` is the music's own end, and
  // the tick-only fallback is for a file with no notes at all.
  return { notes, seconds: Math.max(0.1, secondsAt(noteEndTick || tick)), events: count };
}
