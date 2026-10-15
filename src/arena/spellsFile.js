// ARENA'S OWN SPELL FILE, DECODED.
//
// `SPELLSG.65` is 10 880 bytes and `SPELLS.LST` is the same 10 880 bytes, byte for byte —
// **verified** by comparing the two files in the install this project is developed against.
// Read as 85-byte records that is 128 of them, and this module reads them.
//
// ## The record layout, as measured
//
// ```
//   0x00  6 × u16 LE   a table of six magnitudes, one 6-byte stride each
//          (0x00, 0x06, 0x0c, 0x12, 0x18, 0x1e) — see `magnitudes` below
//   0x24  u8           a range/area class (inferred)
//   0x26  u8           the spell's element/attack type
//   0x29  u8 × 3       the **effect codes**: three slots, one code each, with `0x00` and
//          `0xff` meaning "no effect in this slot"
//   0x2c  u8 × 6       the effects' **parameters** — the element a `Resist` spell resists
//          (`Resist Cold` is a 1, `Resist Shock` a 2), which slot an effect aims at, and
//          the flags the shipped artefact spells carry
//   0x32  u16 LE       the spell's cost in spell points
//   0x34  33 bytes     the name, ASCII, NUL-padded
// ```
//
// **The codes are three bytes wide and the parameters six, and the difference matters.**
// Reading 0x29…0x31 as one flat list of codes looks right for the simple spells — every one of
// them has its code in the first slot — and goes wrong exactly where the artefact spells are:
// `Heal`'s parameters begin `01`, which a flat scan reads as a *second effect*, and
// `Lord's Mail`'s `…14 03 18 | 00 01` would come out as five effects rather than three. The
// three-slot window is what the file's own structure shows: `Open`/`Wizard Lock`,
// `Resist Fire`/`Resist Cold`/`Resist Shock`/`Resist Poison`, `Light`/`Wanderlight` and
// `Cure Poison`/`Cure Disease` all put their single code in slot 1 and their parameters in
// 0x2c onwards.
//
// Concrete, straight out of the install's file:
//
//   * record 0 is `Stamina`, cost 60, element 5 (none), effect code `0x0c` (heal);
//   * record 1 is `Sanctuary`, cost 300, code `0x05`;
//   * record 2 is `Light`, cost 120, code `0x11`;
//   * record 16 is `Fireball`, cost 325, element **0** (fire), code `0x04` (damage);
//   * record 61 is `Fire Dart`, cost 82, element 0, code 0x04.
//
// ## What is verified and what is inferred
//
// **Verified against the file itself**, and pinned by `tests/unit/spells.test.mjs`:
//
//   * the file is 128 × 85 bytes, and records 0…63 carry names while 64…127 are empty
//     (66…127 are all zero; 64 and 65 carry header bytes with no name);
//   * the **name** at 0x34 and the **cost** at 0x32, over all 64 named records — the cost
//     column matches Arena's documented spell list, which is the cross-check that says the
//     offset is right rather than merely plausible;
//   * the **element** byte at 0x26: every fire spell in the file (`Fire Dart`, `Fireball`,
//     `Fire Storm`, `Wildfire`, `Wizard's Fire`, `Gods' Fire`) is 0, both cold spells
//     (`Ice Bolt`, `Ice Storm`) are 1, the three shock spells (`Shock`, `Lightning`,
//     `Force Bolt`) are 3, the poison/disease spells are 2, and every spell that does not
//     attack (`Heal`, `Light`, `Levitate`, …) is 5. See `ELEMENTS`.
//   * the **effect codes** at 0x29…0x2b for the spells whose meaning no one disputes:
//     `Open` is `0x13` and `Wizard Lock` is `0x12`; `Levitate` is `0x10`; `Invisibility`
//     is `0x0f`; `Light` and `Wanderlight` are both `0x11`; `Heal`, `Light Heal`,
//     `Stamina` and `Heal True` are all `0x0c`; the four `Resist` spells are `0x0a`;
//     `Cure Poison` and `Cure Disease` are `0x03`; `Shield`, `Earth Wall` and `Force Wall`
//     are `0x02`; `Passwall` and `Pitfalls` are `0x06`; the damage spells are `0x04`.
//
// **Inferred, and labelled as such wherever it is used**: the *six-magnitude table* is read
// as one magnitude per effect (`Gods' Fire` is 100, 100, 100, 100 and `Purify`'s is
// 100, 100, 100, 1, 100, 1, which is the shape of a four-effect artefact spell), and the
// byte at 0x24 is read as a range/area class. Neither is needed to cast a spell; both are
// exported so a later pass can use them.
//
// There is no field in the record naming a spell's *school* — Arena has no schools — and
// none naming the class that may buy it: that is the Mages Guild's business
// (`game/services.js`), not the file's.

/** The record size, in bytes. 85 × 128 = 10 880, the size of both files. */
export const SPELL_RECORD_BYTES = 85;

/** How many records the standard file holds. */
export const SPELL_RECORD_COUNT = 128;

/** The install's own spell files, by what they are for. */
export const SPELL_FILES = Object.freeze({
  standard: 'SPELLSG.65',
  /** The same 10 880 bytes under another name — verified identical in this install. */
  list: 'SPELLS.LST',
  /** 2 720 bytes: 32 records, the spells the player has made at a spellmaker. */
  custom: 'SPELLS.65',
});

/**
 * The element byte at 0x26, as spelled by the install's own file.
 *
 * Measured, not guessed: the six fire spells are all 0, the two ice spells are both 1, the
 * poison and disease spells are 2, the three shock spells are 3, the untyped magic attacks
 * are 4, and every spell that does not attack is 5. The labels are the game's words for
 * them; the numbers are the file's.
 */
export const ELEMENTS = Object.freeze(['fire', 'cold', 'poison', 'shock', 'magic', 'none']);

/** Where each field lives, so a reader does not have to count bytes in the comments above. */
export const SPELL_FIELDS = Object.freeze({
  magnitudeTable: 0x00,
  magnitudeStride: 6,
  magnitudeCount: 6,
  element: 0x26,
  /** The byte before the list; measured as a range/area class, and labelled inferred. */
  shape: 0x24,
  codes: 0x29,
  codesEnd: 0x2b,
  params: 0x2c,
  paramsEnd: 0x31,
  points: 0x32,
  name: 0x34,
  nameBytes: 33,
});

/** Padding in the effect-code list. `0xff` is the end marker Arena's own tools wrote. */
const CODE_PAD = Object.freeze([0x00, 0xff]);

/**
 * The name of a record, or an empty string.
 *
 * Arena's names are plain ASCII, upper and lower case, NUL-padded — `Stamina`, `Wizard's
 * Fire`, `Shodai...` — so the padding is cut at the first NUL and the result trimmed. A name
 * is never invented: a record with no name in it reads as unnamed here, and the caller is
 * expected to skip it.
 *
 * @param {Uint8Array} bytes
 * @param {number} at  the record's start
 * @returns {string}
 */
function nameAt(bytes, at) {
  const start = at + SPELL_FIELDS.name;
  let text = '';
  for (let i = 0; i < SPELL_FIELDS.nameBytes; i++) {
    const byte = bytes[start + i];
    if (byte === undefined || byte === 0) break;
    text += String.fromCharCode(byte);
  }
  return text.trim();
}

/** A little-endian u16 at a record-relative offset. */
function u16At(bytes, at, offset) {
  const i = at + offset;
  const low = bytes[i] ?? 0;
  const high = bytes[i + 1] ?? 0;
  return low | (high << 8);
}

/**
 * One record, decoded.
 *
 * @param {Uint8Array} bytes  the whole file
 * @param {number} index      which record
 * @returns {{
 *   index: number, name: string, points: number, element: string|null, shape: number,
 *   codes: number[], params: number[], magnitudes: number[], empty: boolean, raw: Uint8Array,
 * }}
 */
export function decodeSpellRecord(bytes, index) {
  const at = index * SPELL_RECORD_BYTES;
  const raw = bytes.subarray(at, at + SPELL_RECORD_BYTES);
  let empty = true;
  for (const byte of raw) { if (byte !== 0) { empty = false; break; } }
  /** The effect codes, padding removed but the order kept (`Purify` is 3, 12, 5). */
  const codes = [];
  for (let i = SPELL_FIELDS.codes; i <= SPELL_FIELDS.codesEnd; i++) {
    const byte = raw[i] ?? 0;
    if (CODE_PAD.includes(byte)) continue;
    codes.push(byte);
  }
  /** The six parameter bytes as they stand, padding and all (see this file's header). */
  const params = [];
  for (let i = SPELL_FIELDS.params; i <= SPELL_FIELDS.paramsEnd; i++) params.push(raw[i] ?? 0);
  const magnitudes = [];
  for (let i = 0; i < SPELL_FIELDS.magnitudeCount; i++) {
    magnitudes.push(u16At(bytes, at, SPELL_FIELDS.magnitudeTable + i * SPELL_FIELDS.magnitudeStride));
  }
  const elementIndex = raw[SPELL_FIELDS.element] ?? ELEMENTS.length - 1;
  return {
    index,
    name: nameAt(bytes, at),
    points: u16At(bytes, at, SPELL_FIELDS.points),
    element: ELEMENTS[elementIndex] ?? null,
    shape: raw[SPELL_FIELDS.shape] ?? 0,
    codes,
    params,
    magnitudes,
    empty,
    raw,
  };
}

/**
 * Read a whole spell file.
 *
 * @param {Uint8Array|ArrayBuffer|null} bytes
 * @param {{file?: string}} [opts]  which file this is, for the report
 * @returns {{
 *   file: string, count: number, records: object[], named: object[], unnamed: object[],
 *   warnings: string[],
 * }}
 */
export function parseSpellsFile(bytes, opts = {}) {
  const file = opts.file ?? SPELL_FILES.standard;
  const warnings = [];
  const view = bytes instanceof Uint8Array ? bytes : (bytes ? new Uint8Array(bytes) : new Uint8Array(0));
  if (!view.length) {
    return { file, count: 0, records: [], named: [], unnamed: [], warnings: [`${file} is not in this install`] };
  }
  if (view.length % SPELL_RECORD_BYTES !== 0) {
    // Not fatal: the last partial record is dropped and said out loud, because a
    // mis-sized file is the one way this decode can silently go wrong.
    warnings.push(`${file} is ${view.length} bytes, which is not a whole number of ${SPELL_RECORD_BYTES}-byte spell records; the tail is ignored`);
  }
  const count = Math.floor(view.length / SPELL_RECORD_BYTES);
  const records = [];
  for (let index = 0; index < count; index++) records.push(decodeSpellRecord(view, index));
  const named = records.filter((record) => record.name && !record.empty);
  const unnamed = records.filter((record) => !record.name);
  return { file, count, records, named, unnamed, warnings };
}

/**
 * One spell by its name, as the install spells it.
 *
 * Case-insensitive, because a name reaches this from a scroll's own text, a shop's shelf and
 * a save file alike, and the install's own capitalisation (`Wizard's Fire`) is not something
 * a caller should have to reproduce.
 *
 * @param {object[]} records   `parseSpellsFile().records`
 * @param {string} name
 * @returns {object|null}
 */
export function spellByName(records, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return (records ?? []).find((record) => record.name.toLowerCase() === wanted) ?? null;
}

/**
 * The spells whose *effects* are of a kind, by the codes the file carries.
 *
 * The join is the decoder's whole point — a caller asks for the damage spells and gets the
 * ones whose record says `0x04` — and it is done here rather than in the game so that the
 * tables of effect codes (`game/spells.js`) stay the only place a code is named.
 *
 * @param {object[]} records
 * @param {number[]} codes  the effect codes to match any of
 * @returns {object[]}
 */
export function spellsWithCode(records, codes) {
  const wanted = new Set(codes);
  return (records ?? []).filter((record) => record.name && record.codes.some((code) => wanted.has(code)));
}

/**
 * `SPELLMKR.TXT` — the spellmaker's own prose.
 *
 * The file is a bank of `#NN`-numbered effect descriptions, each a template with `%0`…`%5`
 * for the caster's chosen chance, magnitude and duration:
 *
 * ```
 * #00
 * %0%% chance to inflict disease. Deterioration is %2 pts of
 * STR, AGI, SPD, and END, every round. +%1%% every %4
 * level(s). Duration is %5 rnd(s) per level.
 * ```
 *
 * **The template number is not the effect code** the record carries: `#00` is disease and
 * `#02` is fear, while a spell's own `0x02` code is the ward `Shield` wears. Nothing here
 * joins the two, because the join is not in the data — what this returns is the bank, so the
 * spellmaker's screen can show a spell's numbers in Arena's own words.
 *
 * @param {Uint8Array|ArrayBuffer|null} bytes
 * @returns {{entries: {index: number, text: string}[], warnings: string[]}}
 */
export function parseSpellMakerText(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : (bytes ? new Uint8Array(bytes) : new Uint8Array(0));
  if (!view.length) return { entries: [], warnings: ['SPELLMKR.TXT is not in this install'] };
  const text = new TextDecoder('latin1').decode(view);
  const entries = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const header = /^#(\d+)\s*$/.exec(line);
    if (header) {
      if (current) entries.push(current);
      current = { index: Number(header[1]), text: '' };
      continue;
    }
    if (current) current.text = current.text ? `${current.text} ${line.trim()}` : line.trim();
  }
  if (current) entries.push(current);
  return { entries, warnings: [] };
}

/**
 * The spell points a record costs — the one number in the record that is Arena's and that a
 * player sees, printed by the spellbook beside the spell's name.
 *
 * @param {object|null} record
 * @returns {number}
 */
export function spellPoints(record) {
  return Math.max(0, Math.round(Number(record?.points) || 0));
}
