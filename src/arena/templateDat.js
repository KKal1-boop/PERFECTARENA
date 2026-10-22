// ARENA `TEMPLATE.DAT` — THE GAME'S OWN TEXT, KEYED BY NUMBER.
//
// The install's `TEMPLATE.DAT` is plain text, not a binary table. A line that reads `#NNNN`
// (four digits, optionally followed by a letter that splits a key by season or weather) starts
// an entry, and the lines after it, up to the next key line, are its value. The narration of
// the main quest lives here: key `1400` is the cell's opening speech, `1402` and `1403` the two
// deaths, and the scroll and staff-piece texts sit under their own keys.
//
// Two rules come from OpenTESArena's `ArenaTemplateDat::init` (MIT): a line break in a value is
// a space, and a run of spaces collapses to one. A value may hold several strings separated by
// `&`, which `templateStrings` splits out. The file's CRLF line endings are read as line breaks.

/** A key line: `#` then four digits, then an optional letter. */
const KEY_LINE = /^#(\d{4})([A-Za-z]?)\s*$/;

/**
 * @typedef {object} TemplateEntry
 * @property {number} key       the four-digit number after `#`
 * @property {string|null} letter the optional letter, or null when the key has none
 * @property {string} value     the entry's text: line breaks and repeated spaces collapsed
 */

/**
 * Parse `TEMPLATE.DAT`'s text into its entries, in file order.
 *
 * @param {Uint8Array|string} bytes the whole file (bytes are read as Latin-1, which is how the
 *   DOS text is stored)
 * @returns {TemplateEntry[]}
 */
export function parseTemplateDat(bytes) {
  const text = typeof bytes === 'string' ? bytes : latin1(bytes);
  /** @type {TemplateEntry[]} */
  const entries = [];
  /** @type {{key: number, letter: string|null, lines: string[]}|null} */
  let open = null;
  const close = () => {
    if (!open) return;
    entries.push({
      key: open.key,
      letter: open.letter,
      value: collapse(open.lines.join(' ')),
    });
    open = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const match = KEY_LINE.exec(line);
    if (match) {
      close();
      open = { key: Number(match[1]), letter: match[2] || null, lines: [] };
    } else if (open) {
      open.lines.push(line);
    }
  }
  close();
  return entries;
}

/**
 * Every entry under one key (and letter, when given), in file order. A key may appear more than
 * once, once per season or weather variant, so the result can hold several entries.
 *
 * @param {TemplateEntry[]} entries the parsed file
 * @param {number} key
 * @param {string|null} [letter]   null or omitted means any letter
 * @returns {TemplateEntry[]}
 */
export function templateEntries(entries, key, letter = null) {
  return entries.filter((e) => e.key === key && (letter === null || e.letter === letter));
}

/**
 * The strings in one entry's value, split at `&` and trimmed; an empty piece is dropped.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function templateStrings(value) {
  return value.split('&').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Line breaks become spaces, and a run of spaces collapses to one. */
function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/** @param {Uint8Array} bytes */
function latin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
