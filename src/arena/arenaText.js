// ARENA'S OWN PROSE.
//
// The game's talking is not in the executable: it is in loose text files beside
// it, and they are the reason a city can greet you by name and a dungeon can
// announce the Staff piece inside it. All of them are 7-bit text with `\r\n` line
// breaks; the tricky part is only how each one is framed.
//
//   `citytxt`       `#0600`…`#0663`, one greeting per **city-state**, the body
//                   ending in `&`. (VERIFIED — see `cityTextKey`.)
//   `dungeon.txt`   `#`-separated, the first line naming the dungeon. Eight blocks:
//                   the eight Staff dungeons, *not* in quest order. (VERIFIED)
//   `artfact1.dat`  `\0`-separated artifact-quest offers. (VERIFIED framing)
//   `artfact2.dat`  the same, for the second half of the artifacts. (VERIFIED)
//   `template.dat`  `#NNNNa`…`#NNNNl` talk templates: 811 records over ~80 ids,
//                   each id carrying up to twelve phrasings. (VERIFIED counts)
//   `muguild.dat`, `tavern.dat`, `equip.dat`, `selling.dat`  shopkeeper lines.
//                   `\0`-separated like the artifact banks, with `%i` (item) and
//                   `%mm` (gold) in them. (VERIFIED framing)
//
// The greeting index is the interesting one, because it makes the world data and
// the prose agree with each other:
//
//     id = 600 + provinceID * 8 + cityIndexWithinProvince
//
// Eight provinces (the Imperial Province has no city-state greeting) times eight
// city-states each is the 64 records that are there. The mapping was *checked*
// rather than assumed: `tests/unit/text.test.mjs` reads each greeting's opening
// words and requires them to name the city that the index points at — 600 → North
// Point, 601 → Daggerfall, 628 → Necrom, 663 → Archon. A greeting filed under the
// wrong city fails the suite.
//
// `%`-words are the original's placeholders. The ones this project fills:
//
//   %n / %an  a person's name        %t   a title          %ra  a race
//   %i / %mt  an item                %mm  gold             %cn  a country
//   %oap / %nap  a price             %nt  a tavern         %g   a guild
//
// `fillTemplate` is greedy about them: keys are matched longest-first so `%mm`
// never becomes `%m` + `m`, and an unknown one is dropped rather than printed.

/** The first city-state greeting's index in `citytxt` — **600 decimal**, not `0x600`:
 * the file's markers are `#0600`-style *decimal* numbers, which is worth stating
 * because reading them as hex shifts every greeting by 936. */
export const CITY_TEXT_BASE = 600;

/** Eight city-states per province, so the greetings stride by eight. */
export const CITY_TEXT_STRIDE = 8;

/** How many city-state greetings the original's file holds. */
export const CITY_TEXT_COUNT = 64;

/**
 * The index a city-state's greeting lives under.
 *
 * @param {number} provinceID 0…8, as `CITYDATA.64` orders provinces
 * @param {number} cityIndex  the city's position among its province's city-states, 0…7
 * @returns {number}
 */
export function cityTextKey(provinceID, cityIndex) {
  return CITY_TEXT_BASE + provinceID * CITY_TEXT_STRIDE + cityIndex;
}

/**
 * A decoded text file: its records, and what was noticed while reading it.
 * @typedef {object} TextFile
 * @property {string} name
 * @property {string[]} records  the raw record bodies, in file order
 * @property {string[]} warnings
 */

/**
 * Decode bytes as Arena text: 7-bit, `\r\n` line breaks, `\0` as a separator.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeText(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Arena's text files are **pure 7-bit ASCII** — measured, not assumed: `citytxt`,
    // `dungeon.txt`, `template.dat`, `muguild.dat` and `artfact1.dat` contain not one
    // byte above 127 between them. So a high byte is padding rather than a CP437
    // glyph, and dropping it keeps the line readable instead of corrupting it. The
    // NUL is kept because it is the banks' record separator.
    if (b === 0) out += '\0';
    else if (b === 10 || b === 13) out += String.fromCharCode(b);
    else if (b >= 32 && b < 127) out += String.fromCharCode(b);
  }
  return out;
}

/**
 * Rewrap an Arena text body into plain lines: `\r\n` → `\n`, runs of blank lines
 * collapsed, trailing `&` (the original's own end-of-record marker) dropped.
 *
 * @param {string} body
 * @returns {string}
 */
export function cleanText(body) {
  return body
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s*&+\s*$/, '')
    .trim();
}

/**
 * Split a `#NNNN`-framed file (and the `#NNNNa` variants) into records.
 *
 * @param {string} text
 * @returns {{id: number, variant: string, body: string}[]}
 */
export function splitHashRecords(text) {
  const out = [];
  const re = /#(\d{4})([a-z]?)/g;
  let match = null;
  const starts = [];
  while ((match = re.exec(text)) !== null) {
    starts.push({ id: Number(match[1]), variant: match[2] ?? '', bodyFrom: re.lastIndex, at: match.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : text.length;
    out.push({ id: starts[i].id, variant: starts[i].variant, body: text.slice(starts[i].bodyFrom, end) });
  }
  return out;
}

/**
 * Split a bank whose records are separated by NULs, falling back to blank lines.
 *
 * `muguild.dat`'s first record opens with a run of `?` bytes — the original's
 * editor wrote a length it did not fill in. They are stripped here rather than
 * shown to a player.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitNulRecords(text) {
  const byNul = text.split('\0').map((r) => r.trim()).filter(Boolean);
  if (byNul.length > 1) return byNul.map((r) => r.replace(/^\?+/, '').trim()).filter(Boolean);
  return text
    .split(/\n\s*\n/)
    .map((r) => r.replace(/^\?+/, '').trim())
    .filter(Boolean);
}

/**
 * Parse `citytxt`: the gate greeting of every city-state.
 *
 * @param {Uint8Array} bytes
 * @param {{provinceNames?: string[]}} [opts] names, for the warning text only
 * @returns {{greetings: Map<number, {id: number, text: string, lines: string[]}>, warnings: string[]}}
 */
export function parseCityText(bytes, opts = {}) {
  const warnings = [];
  const text = decodeText(bytes);
  /** @type {Map<number, {id:number,text:string,lines:string[]}>} */
  const greetings = new Map();
  for (const record of splitHashRecords(text)) {
    const clean = cleanText(record.body);
    if (!clean) continue;
    greetings.set(record.id, { id: record.id, text: clean, lines: clean.split('\n') });
  }
  if (greetings.size !== CITY_TEXT_COUNT) {
    warnings.push(`citytxt has ${greetings.size} greetings; ${CITY_TEXT_COUNT} city-states are expected`);
  }
  const names = opts.provinceNames ?? [];
  for (const [id, greeting] of greetings) {
    const provinceID = Math.floor((id - CITY_TEXT_BASE) / CITY_TEXT_STRIDE);
    if (!Number.isInteger(provinceID) || provinceID < 0 || provinceID > 8) {
      warnings.push(`citytxt record ${id} falls outside the ${CITY_TEXT_COUNT} city-state indices`);
      continue;
    }
    greeting.provinceID = provinceID;
    greeting.cityIndex = (id - CITY_TEXT_BASE) % CITY_TEXT_STRIDE;
    greeting.province = names[provinceID] ?? null;
  }
  return { greetings, warnings };
}

/**
 * Parse `dungeon.txt`: what the game says when you stand before a dungeon.
 *
 * The blocks are `#`-separated, the first line is the dungeon's own name, and the
 * order is *not* the quest order — so the result is a map by name, and nothing
 * downstream may assume a position.
 *
 * @param {Uint8Array} bytes
 * @returns {{intros: Map<string, {name: string, text: string}>, warnings: string[]}}
 */
export function parseDungeonText(bytes) {
  const warnings = [];
  const text = decodeText(bytes);
  /** @type {Map<string, {name: string, text: string}>} */
  const intros = new Map();
  for (const block of text.split('#')) {
    const clean = cleanText(block);
    if (!clean) continue;
    const lines = clean.split('\n');
    const name = lines[0].trim();
    const body = lines.slice(1).join('\n').trim() || name;
    if (name) intros.set(name.toLowerCase(), { name, text: body });
  }
  if (!intros.size) warnings.push('dungeon.txt held no named dungeons');
  return { intros, warnings };
}

/**
 * Parse an artifact bank (`artfact1.dat`, `artfact2.dat`).
 *
 * A bank holds two kinds of record, and they are worth separating:
 *
 *   **offers**  the recruiting speeches, with `%`-words for whatever varies per
 *               player — `%an` the speaker, `%ra` the player's race, `%oap` the
 *               price, `%cn` the country. These are the ones a quest can use.
 *   **replies** the follow-ups to a haggled offer — `"Forget it, pal. You're going
 *               to have to do a lot better than that."` — which carry no
 *               placeholders because they name nothing. Kept rather than thrown
 *               away, and counted by the tests, so the split is a measured one.
 *
 * @param {Uint8Array} bytes
 * @returns {{offers: {text: string, lines: string[], placeholders: string[]}[], replies: string[], warnings: string[]}}
 */
export function parseArtifactText(bytes) {
  const warnings = [];
  const text = decodeText(bytes);
  /** @type {{text: string, lines: string[], placeholders: string[]}[]} */
  const offers = [];
  /** @type {string[]} */
  const replies = [];
  for (const record of splitNulRecords(text)) {
    const clean = cleanText(record);
    if (!clean) continue;
    const placeholders = [...new Set(clean.match(/%[a-z0-9]+/gi) ?? [])];
    if (placeholders.length) offers.push({ text: clean, lines: clean.split('\n'), placeholders });
    else replies.push(clean);
  }
  if (!offers.length) warnings.push('the artifact bank held no offers');
  return { offers, replies, warnings };
}

/**
 * Parse `template.dat`: the talk templates, grouped by id.
 *
 * The file walks `#0000a`, `#0000b`, … `#0001a`, so a record id carries up to
 * twelve interchangeable phrasings. Grouping is the point: picking one at random
 * is what stops a shopkeeper repeating itself.
 *
 * @param {Uint8Array} bytes
 * @returns {{templates: Map<number, string[]>, count: number, warnings: string[]}}
 */
export function parseTalkTemplates(bytes) {
  const warnings = [];
  /** @type {Map<number, string[]>} */
  const templates = new Map();
  let count = 0;
  for (const record of splitHashRecords(decodeText(bytes))) {
    const clean = cleanText(record.body);
    if (!clean) continue;
    const list = templates.get(record.id) ?? [];
    list.push(clean);
    templates.set(record.id, list);
    count++;
  }
  if (!count) warnings.push('template.dat held no talk templates');
  return { templates, count, warnings };
}

/**
 * Parse a shopkeeper bank (`muguild.dat`, `tavern.dat`, `equip.dat`, `selling.dat`).
 *
 * @param {Uint8Array} bytes
 * @returns {{lines: string[], warnings: string[]}}
 */
export function parseServiceBank(bytes) {
  const warnings = [];
  const lines = splitNulRecords(decodeText(bytes)).flatMap((record) => record.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) warnings.push('the bank held no service lines');
  return { lines, warnings };
}

/**
 * Fill a `%`-word template.
 *
 * Keys are matched longest-first: `%mm` must not be read as `%m` followed by `m`,
 * and `%oap` must not be read as `%o` followed by `ap`. An unknown `%word` is
 * dropped instead of shown, because a player should never read `%qmn`.
 *
 * @param {string} template
 * @param {Record<string, string|number>} values
 * @returns {string}
 */
export function fillTemplate(template, values) {
  const keys = Object.keys(values).sort((a, b) => b.length - a.length);
  let out = template;
  for (const key of keys) {
    out = out.split(`%${key}`).join(String(values[key]));
  }
  return out
    .replace(/%[a-z0-9]+/gi, '')
    // A dropped placeholder leaves its punctuation behind: "listen up, %g" becomes
    // "listen up, ". Tidy the seams so a player never sees the mark of one.
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*\./g, '.')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The `%`-words a template uses, in the order they appear.
 * @param {string} template
 * @returns {string[]}
 */
export function placeholdersOf(template) {
  return [...new Set((template.match(/%[a-z0-9]+/gi) ?? []).map((p) => p.slice(1)))];
}

/**
 * Wrap text at a column, breaking on spaces, for a fixed-width panel.
 *
 * @param {string} text
 * @param {number} [width]
 * @returns {string[]}
 */
export function wrapText(text, width = 56) {
  const out = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) continue;
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!line) { line = word; continue; }
      if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Everything readable, loaded once from an `ArenaData` facade.
 *
 * Every file is optional: an install missing `artfact2.dat` still plays, it just
 * has fewer offers. What is *missing* is reported in `warnings` rather than
 * thrown, because the game's own text is decoration — the world and the maps are
 * what the game cannot do without.
 *
 * @typedef {object} ArenaLibrary
 * @property {Map<number, object>} cityGreetings
 * @property {Map<string, object>} dungeonIntros
 * @property {object[]} artifactOffers
 * @property {object[]} artifactReplies
 * @property {Map<number, string[]>} talkTemplates
 * @property {Record<string, string[]>} service  bank name → lines
 * @property {string[]} warnings
 */

/**
 * Load every text file, tolerating the ones an install does not have.
 *
 * @param {import('./arenaData.js').ArenaData} data
 * @returns {Promise<ArenaLibrary>}
 */
export async function loadArenaText(data) {
  /** @type {string[]} */
  const warnings = [];
  /** @type {Record<string, Uint8Array|null>} */
  const bytes = {};
  for (const name of ['citytxt', 'dungeon.txt', 'artfact1.dat', 'artfact2.dat', 'template.dat', 'muguild.dat', 'tavern.dat', 'equip.dat', 'selling.dat']) {
    bytes[name] = await data.bytes(name);
    if (!bytes[name]) warnings.push(`${name} is not in this Arena install`);
  }

  const city = bytes.citytxt ? parseCityText(bytes.citytxt) : { greetings: new Map(), warnings: [] };
  const dungeon = bytes['dungeon.txt'] ? parseDungeonText(bytes['dungeon.txt']) : { intros: new Map(), warnings: [] };
  const offers = [];
  const replies = [];
  for (const name of ['artfact1.dat', 'artfact2.dat']) {
    if (!bytes[name]) continue;
    const parsed = parseArtifactText(bytes[name]);
    offers.push(...parsed.offers.map((o, i) => ({ ...o, bank: name, index: i })));
    replies.push(...parsed.replies.map((t) => ({ text: t, bank: name })));
  }
  const talk = bytes['template.dat'] ? parseTalkTemplates(bytes['template.dat']) : { templates: new Map(), count: 0, warnings: [] };

  /** @type {Record<string, string[]>} */
  const service = {};
  for (const name of ['muguild.dat', 'tavern.dat', 'equip.dat', 'selling.dat']) {
    service[name] = bytes[name] ? parseServiceBank(bytes[name]).lines : [];
  }

  for (const part of [city, dungeon, talk]) warnings.push(...part.warnings);

  return {
    cityGreetings: city.greetings,
    dungeonIntros: dungeon.intros,
    artifactOffers: offers,
    artifactReplies: replies,
    talkTemplates: talk.templates,
    service,
    warnings,
  };
}
