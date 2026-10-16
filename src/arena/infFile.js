// ARENA `.INF` MAP DEFINITIONS.
//
// An `.INF` is a CRLF ASCII recipe that tells the engine what the voxel IDs in
// a `.MIF` *mean*: which texture each ID draws with, how tall the level is, which
// cells are doors, stairs, chasms or menu (building-entrance) triggers.
//
// It is organised into `@`-sections whose lines are either `*` directives or
// texture filenames. The *order of the filenames* is the level's texture table:
// the directive lines that precede a filename bind that filename's index into an
// ID slot, which is exactly what a `.MIF` voxel refers to.
//
//   @FLOORS                     @WALLS                    @FLATS
//     *CEILING 200                *BOXSIDE 0                *ITEM 3
//     *BOXCAP 0                   casb_side.img             candelab.img  Y:-4
//     casb_floor.img              *BOXSIDE 1
//                                 casb_side2.set #2
//
// A `name.set #n` line appends **n** consecutive texture entries, all pointing at
// the same `.SET` sheet with `setIndex` 0…n−1; the bound ID is the *first* of
// them.
//
// INF files inside `GLOBAL.BSA` are XOR-encrypted, loose ones are not; both are
// handled here. See docs/FORMATS.md §4.
//
// PROVENANCE: section/directive grammar and the archive encryption scheme come
// from OpenTESArena (`src/Assets/INFFile.cpp`, MIT), verified against the real
// `IMPPAL1.INF` (loose) and `CAS.INF` (in the archive).

/** The repeating XOR key Arena's installer uses on archive members. */
const INF_KEYS = Uint8Array.from([0xea, 0x7b, 0x4e, 0xbd, 0x19, 0xc9, 0x38, 0x99]);

/** `*BOXCAP`/`*BOXSIDE`/`*MENU` slots are indexed 0..15 in Arena's own tables. */
export const MAX_TEXTURE_SLOT = 16;

/**
 * @typedef {object} InfVoxelTexture
 * @property {string} filename    upper-case 8.3 name, e.g. `CASB_FLOOR.IMG`
 * @property {number} setIndex    index inside the `.SET` sheet, or -1 for a plain IMG
 */

/**
 * @typedef {object} InfFlat
 * @property {number} textureIndex  index into `flatTextures`
 * @property {number|null} itemIndex Arena item index from the preceding `*ITEM`
 * @property {number} yOffset       pixels (negative moves the flat up)
 * @property {number|null} lightIntensity  from an `S:n` modifier
 */

/**
 * @typedef {object} InfFile
 * @property {string} name
 * @property {InfVoxelTexture[]} voxelTextures  the ordered floor+wall table
 * @property {number} floorTextureCount  how many of `voxelTextures` the `@FLOORS` section
 *                  produced (the rest are the `@WALLS` table). Recorded because the two halves
 *                  are one table in the file but two different things in the world: a city's
 *                  **floors** are its country's climate and its **walls** are its architecture's
 *                  (`withGroundFloors`, B18/D-41)
 * @property {string[]} flatTextures
 * @property {InfFlat[]} flats
  * @property {{file:string, index:number}[]} sounds  `@SOUND` lines: the filename and
 *                  the **slot number** the line itself carries (`"CLANK.VOC 4"`), the
 *                  number a `TRIG` cell's sound byte names. Measured against
 *                  `halls1.inf`–`halls3.inf` from the install their own bytes point at.
 * @property {(number|null)[]} boxCaps   `*BOXCAP` n -> voxelTextures index
 * @property {(number|null)[]} boxSides
 * @property {(number|null)[]} menus
 * @property {number|null} dryChasmIndex
 * @property {number|null} wetChasmIndex
 * @property {number|null} lavaChasmIndex
 * @property {number|null} levelUpIndex
 * @property {number|null} levelDownIndex
 * @property {{height:number, boxScale:number|null, outdoorDungeon:boolean, textureIndex:number|null}} ceiling
 * @property {Map<number,number>} keys      `+n` text IDs -> key number
 * @property {Map<number,object>} riddles
 * @property {Map<number,string>} loreTexts
 */

/**
 * Undo the XOR that Arena applies to INF records inside `GLOBAL.BSA`.
 *
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} a new, decrypted buffer
 */
export function decryptInf(bytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] ^ ((i & 0xff) + INF_KEYS[i & 7])) & 0xff;
  }
  return out;
}

/**
 * Parse an `.INF` map definition.
 *
 * @param {Uint8Array|string} input   raw bytes (auto-decrypted if needed) or text
 * @param {string} [name]
 * @returns {InfFile}
 */
export function parseInf(input, name = '') {
  const text = typeof input === 'string' ? input : decodeText(input);
  return parseInfText(text, name);
}

/**
 * Turn raw INF bytes into text, decrypting if the record is encrypted.
 * Loose INFs start with `@`; encrypted ones never do.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function decodeText(bytes) {
  const ascii = (b) => {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  };
  const direct = ascii(bytes);
  // A plaintext INF's first printable run is `@FLOORS`/`@WALLS`/`@...`.
  if (/^\s*@/.test(direct)) return direct;
  const decrypted = ascii(decryptInf(bytes));
  // Only accept the decryption if it actually looks like an INF.
  return /^\s*@/.test(decrypted) ? decrypted : direct;
}

/**
 * Parse INF text that is already plaintext.
 *
 * @param {string} text
 * @param {string} [name]
 * @returns {InfFile}
 */
export function parseInfText(text, name = '') {
  const inf = emptyInf(name);
  const lines = text.replace(/\r/g, '').split('\n');

  /** @type {'floors'|'walls'|'flats'|'sound'|'text'|null} */
  let section = null;
  // Per-group parser state, mirroring the original engine's modal reader: a
  // directive line opens a "slot" that the *next* filename fills.
  let floor = newFloorState(), wall = newWallState(), flat = newFlatState(), txt = newTextState();
  let sawCeiling = false;

  const flushText = () => {
    if (txt.mode === 'key' && txt.key !== null) inf.keys.set(txt.id, txt.key);
    else if (txt.mode === 'riddle') inf.riddles.set(txt.id, txt.riddle);
    else if (txt.mode === 'text' && txt.text !== null) inf.loreTexts.set(txt.id, txt.text);
    txt = newTextState();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line[0] === '@') {
      flushText();
      floor = newFloorState(); wall = newWallState(); flat = newFlatState();
      const tag = line.slice(1).trim().toUpperCase();
      // The floors end where the walls begin: the file's one voxel table is two tables, and the
      // boundary is the `@WALLS` tag. Recorded on the first one seen (an INF with no `@WALLS`
      // section at all — a wilderness window — keeps every entry as a floor, which is what it is).
      if (tag.startsWith('WALL') && inf.floorTextureCount == null) {
        inf.floorTextureCount = inf.voxelTextures.length;
      }
      section = tag.startsWith('FLOOR') ? 'floors'
        : tag.startsWith('WALL') ? 'walls'
        : tag.startsWith('FLAT') ? 'flats'
        : tag.startsWith('SOUND') ? 'sound'
        : tag.startsWith('TEXT') ? 'text'
        : null;
      continue;
    }

    if (section === 'floors') floor = parseFloorLine(line, inf, floor, () => { sawCeiling = true; });
    else if (section === 'walls') wall = parseWallLine(line, inf, wall);
    else if (section === 'flats') flat = parseFlatLine(line, inf, flat);
    else if (section === 'sound') {
      // Every line is `SOUNDNAME.VOC <slot>` — the slot number the line carries is
      // what a `TRIG` cell's sound byte refers to (measured against the install's
      // own `halls1.inf`–`halls3.inf`). A malformed line keeps its filename at slot
      // -1 rather than being dropped, so a level its bytes name is still readable.
      const space = line.lastIndexOf(' ');
      const index = space >= 0 ? Number.parseInt(line.slice(space + 1).trim(), 10) : NaN;
      const file = (space >= 0 ? line.slice(0, space) : line).trim().toUpperCase();
      inf.sounds.push({ file, index: Number.isFinite(index) ? index : -1 });
    }
    else if (section === 'text') txt = parseTextLine(line, txt, flushText);
  }
  flushText();
  if (!sawCeiling) inf.ceiling.height = 100;   // INFCeiling::DEFAULT_HEIGHT
  if (inf.floorTextureCount == null) inf.floorTextureCount = inf.voxelTextures.length;
  return inf;
}

/**
 * **A country's ground under a city's architecture** (B18/D-41).
 *
 * The owner walked into Morrowind after the province law landed and said what the screen said:
 * *"MORROWIND NOW JUST SAYS DESERT BUT WHEN YOU GET INTO IT ITS COMPLETELY MOUNTAIN EVEN THE
 * GROUND AND THERE IS NO DESERT LANDSCAPE WITH MOUNT ARCHITECTURE"*. The law was right and the
 * level was not, because a settlement's whole look comes from **one** `.INF`: Morrowind's cities
 * are built from `MCN.INF` (the architecture the owner asked for) and therefore stood on the
 * mountain's ground as well.
 *
 * An INF's voxel table is really two tables — the `@FLOORS` section's entries first, then the
 * `@WALLS` section's — and the two halves are exactly the two things the provinces mean:
 *
 *   * the **floors** are the ground: sand, ash, tundra, the country under your feet;
 *   * the **walls** and everything else are the architecture.
 *
 * So this takes the architecture's INF and puts the **ground climate's** floors under it, and
 * nothing else: walls, flats, ceiling, sounds, keys and riddles are the architecture's own. Two
 * INFs whose floor tables differ in length are **refused**, not blended — an index shift here would
 * repaint the wrong voxel — and the caller is told why.
 *
 * @param {InfFile} architecture  the settlement's own `.INF` (its walls are the architecture)
 * @param {InfFile} ground        the country's own `.INF` for this place (its floors are the ground)
 * @returns {{inf: InfFile, merged: boolean, reason: string|null}}
 */
export function withGroundFloors(architecture, ground) {
  const floors = architecture?.floorTextureCount ?? 0;
  const groundFloors = ground?.floorTextureCount ?? 0;
  if (!floors || !groundFloors) return { inf: architecture, merged: false, reason: 'an INF without a floor table' };
  if (floors !== groundFloors) {
    return { inf: architecture, merged: false, reason: `floor tables differ (${floors} vs ${groundFloors})` };
  }
  const voxelTextures = architecture.voxelTextures.slice();
  for (let i = 0; i < floors; i++) voxelTextures[i] = ground.voxelTextures[i];
  return {
    inf: { ...architecture, voxelTextures, groundFloorsFrom: ground.name, merged: true, reason: null },
    merged: true,
    reason: null,
  };
}

/**
 * Arena's default ceiling when an INF has no `*CEILING` line.
 * @returns {InfFile}
 */
function emptyInf(name) {
  return {
    name,
    voxelTextures: [],
    flatTextures: [],
    flats: [],
    sounds: [],
    boxCaps: new Array(MAX_TEXTURE_SLOT).fill(null),
    boxSides: new Array(MAX_TEXTURE_SLOT).fill(null),
    menus: new Array(MAX_TEXTURE_SLOT).fill(null),
    dryChasmIndex: null,
    wetChasmIndex: null,
    lavaChasmIndex: null,
    levelUpIndex: null,
    levelDownIndex: null,
    ceiling: { height: 100, boxScale: null, outdoorDungeon: false, textureIndex: null },
    keys: new Map(),
    riddles: new Map(),
    loreTexts: new Map(),
  };
}

const newFloorState = () => ({ boxCapID: null, ceiling: null, mode: null });
const newWallState = () => ({
  mode: null, boxCapIDs: [], boxSideIDs: [], menuID: null,
  dryChasm: false, wetChasm: false, lavaChasm: false,
});
const newFlatState = () => ({ mode: null, itemID: null });
const newTextState = () => ({ id: -1, mode: null, key: null, riddle: null, text: null });

/**
 * Append one texture entry (or `#n` entries for a `.SET`) and return the index
 * the first of them was given.
 * @param {InfFile} inf
 * @param {string} line
 * @returns {number}
 */
function addTexture(inf, line) {
  const name = line.trim();
  const hash = line.indexOf('#');
  if (hash < 0) {
    inf.voxelTextures.push({ filename: name.toUpperCase(), setIndex: -1 });
    return inf.voxelTextures.length - 1;
  }
  const filename = line.slice(0, hash).trim().toUpperCase();
  const setSize = Number.parseInt(line.slice(hash + 1).trim(), 10);
  if (!Number.isFinite(setSize) || setSize <= 0) {
    inf.voxelTextures.push({ filename, setIndex: -1 });
    return inf.voxelTextures.length - 1;
  }
  const first = inf.voxelTextures.length;
  for (let i = 0; i < setSize; i++) inf.voxelTextures.push({ filename, setIndex: i });
  return first;
}

/** @param {string} line @param {InfFile} inf */
function parseFloorLine(line, inf, state, onCeiling) {
  if (line[0] === '*') {
    const tokens = line.split(/\s+/);
    const tag = tokens[0].slice(1).toUpperCase();
    if (tag === 'BOXCAP') state.boxCapID = Number.parseInt(tokens[1], 10);
    else if (tag === 'CEILING') {
      state.ceiling = {
        height: tokens.length >= 2 ? Number.parseInt(tokens[1], 10) : 100,
        boxScale: tokens.length >= 3 ? Number.parseInt(tokens[2], 10) : null,
        outdoorDungeon: tokens.length >= 4 && tokens[3] === '1',
      };
    }
    // `*TOP` occurs in LABRNTH1/2.INF and is not understood by the original either.
    return state;
  }

  const currentIndex = addTexture(inf, line);
  if (state.boxCapID !== null && state.boxCapID < MAX_TEXTURE_SLOT) inf.boxCaps[state.boxCapID] = currentIndex;
  if (state.ceiling) {
    inf.ceiling.textureIndex = currentIndex;
    inf.ceiling.height = state.ceiling.height;
    inf.ceiling.boxScale = state.ceiling.boxScale;
    inf.ceiling.outdoorDungeon = state.ceiling.outdoorDungeon;
    onCeiling();
  }
  return newFloorState();
}

/** @param {string} line @param {InfFile} inf */
function parseWallLine(line, inf, state) {
  if (line[0] === '*') {
    const tokens = line.split(/\s+/);
    const tag = tokens[0].slice(1).toUpperCase();
    switch (tag) {
      case 'BOXCAP': state.boxCapIDs.push(Number.parseInt(tokens[1], 10)); break;
      case 'BOXSIDE': state.boxSideIDs.push(Number.parseInt(tokens[1], 10)); break;
      case 'MENU': state.menuID = Number.parseInt(tokens[1], 10); break;
      case 'DRYCHASM': state.dryChasm = true; break;
      case 'WETCHASM': state.wetChasm = true; break;
      case 'LAVACHASM': state.lavaChasm = true; break;
      case 'LEVELUP': state.mode = 'levelUp'; break;
      case 'LEVELDOWN': state.mode = 'levelDown'; break;
      // *DOOR, *TRANS, *TRANSWALKTHRU and *WALKTHRU are recognised and ignored:
      // door and transition textures are selected by the level data, not here.
      default: break;
    }
    return state;
  }

  const currentIndex = addTexture(inf, line);
  for (const id of state.boxCapIDs) if (id < MAX_TEXTURE_SLOT) inf.boxCaps[id] = currentIndex;
  for (const id of state.boxSideIDs) if (id < MAX_TEXTURE_SLOT) inf.boxSides[id] = currentIndex;
  if (state.menuID !== null && state.menuID < MAX_TEXTURE_SLOT) inf.menus[state.menuID] = currentIndex;
  if (state.dryChasm) inf.dryChasmIndex = currentIndex;
  else if (state.lavaChasm) inf.lavaChasmIndex = currentIndex;
  else if (state.wetChasm) inf.wetChasmIndex = currentIndex;
  if (state.mode === 'levelUp') inf.levelUpIndex = currentIndex;
  else if (state.mode === 'levelDown') inf.levelDownIndex = currentIndex;
  return newWallState();
}

/** @param {string} line @param {InfFile} inf */
function parseFlatLine(line, inf, state) {
  if (line[0] === '*') {
    const tokens = line.split(/\s+/);
    if (tokens[0].slice(1).toUpperCase() === 'ITEM') state = { mode: 'item', itemID: Number.parseInt(tokens[1], 10) };
    return state;
  }

  // `name.dfa  Y:-4  S:2` — the texture name, then `X:value` modifiers.
  const tokens = line.split(/[\s\t]+/).filter(Boolean);
  const first = tokens[0];
  const filename = (first[0] === '-' ? first.slice(1) : first).toUpperCase();
  inf.flatTextures.push(filename);
  /** @type {InfFlat} */
  const record = {
    textureIndex: inf.flatTextures.length - 1,
    itemIndex: state.mode === 'item' ? state.itemID : null,
    yOffset: 0,
    lightIntensity: null,
  };
  for (let i = 1; i < tokens.length; i++) {
    const [k, v] = tokens[i].split(':');
    const value = Number.parseInt(v, 10);
    if (!Number.isFinite(value)) continue;
    const type = k.toUpperCase();
    if (type === 'F') record.yOffset = value;                 // flat-property modifier
    else if (type === 'S') record.lightIntensity = value;      // light intensity
    else if (type === 'Y') record.yOffset = value;             // Y offset
  }
  inf.flats.push(record);
  return { mode: null, itemID: null };
}

/** @param {string} line */
function parseTextLine(line, txt, flush) {
  const head = line[0];
  if (head === '*') {
    flush();
    const tokens = line.split(/\s+/);
    return { id: Number.parseInt(tokens[1], 10), mode: null, key: null, riddle: null, text: null };
  }
  if (head === '+') {
    return { ...txt, mode: 'key', key: Number.parseInt(line.slice(1).trim(), 10) };
  }
  if (head === '^') {
    const tokens = line.slice(1).trim().split(/\s+/);
    return {
      ...txt, mode: 'riddle',
      riddle: { answers: [], riddle: '', correct: '', wrong: '', firstNumber: Number.parseInt(tokens[0], 10), secondNumber: Number.parseInt(tokens[1], 10) },
    };
  }
  if (head === '~') {
    return { ...txt, mode: 'text', text: line.slice(1) + '\n' };
  }
  if (txt.mode === 'riddle') {
    const r = txt.riddle;
    if (head === ':') r.answers.push(line.slice(1));
    else if (head === '`') r.phase = line.slice(1).toUpperCase();
    else if (r.phase === 'CORRECT') r.correct += line + '\n';
    else if (r.phase === 'WRONG') r.wrong += line + '\n';
    else r.riddle += line + '\n';
    return txt;
  }
  if (txt.mode === 'text' && txt.text !== null) {
    txt.text += line + '\n';
    return txt;
  }
  if (txt.mode === null && txt.id >= 0) {
    return { ...txt, mode: 'text', text: line + '\n' };
  }
  return txt;
}

/**
 * Resolve a voxel texture ID to its filename, mirroring `ArenaVoxelUtils`.
 * Out-of-range IDs wrap modulo 64 exactly as the original does.
 *
 * @param {number} id
 * @param {InfFile} inf
 * @returns {InfVoxelTexture}
 */
export function voxelTexture(id, inf) {
  const n = inf.voxelTextures.length;
  if (!n) return { filename: '', setIndex: -1 };
  let i = id;
  if (i >= 64) i %= 64;
  if (i < 0 || i >= n) i = 0;
  return inf.voxelTextures[i];
}
