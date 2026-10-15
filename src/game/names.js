// PEOPLE'S NAMES — the corpus this install itself does not carry.
//
// Arena's own `NAMES.DAT` is 480 bytes of `EMPTY`-padded save-slot names (recorded as
// S30 in PROGRESS.md), so a town's folk have answered to no names but a town's regard.
// The **sibling Daggerfall install** does carry the corpus: `NAMEGEN.DAT`, the name
// generator whose fragments build every race's names — and it closes the file with a
// *noble* bank and two monster-name banks beside the eight race banks (the monster banks
// are the "/-goth/-rock" tables an artifact quest will want to name its Daedra lords).
//
// The binary layout was **measured out of the install's own bytes** (see
// `tests/unit/names.test.mjs`, which reproduces UESP's decoded XML samples from
// *indices* into this parse), and it is simpler than any guess: one fixed-width string
// area under the header, every slot 10 bytes, NUL-padded, ≤ 8 characters:
//
//   header  0..527                    — per bank: [nOffsets u32][0 sentinel][nCounts u32]
//   strings 528..8377                 — 785 slots × 10 bytes, NUL-padded
//
// The sets are **contiguous and stride-10 through the whole area**, so every bank and
// every set's offset is derivable from the counts alone — cumulative (count × 10) from
// 528, in the binary's bank order (which is *not* UESP's XML order; the content pins
// each one):
//
//   Breton 6 sets · Redguard 5 · Nord 4 · Dark Elf 6 · High Elf 6 · Wood Elf 6 ·
//   Khajiit 6 · Imperial 6 · "location" 3 (the -goth monster bank) · "location" 4
//   (the mansion bank) · Noble 4 (its title set closes the file exactly at 8378).
//
// A name is *composed*, exactly as the generator composes one: a Breton/Nord/Imperial/
// elf person is set0+set1 (male) or set2+set3 (female), surnamed set4+set5; a Redguard
// has one name, four fragments deep (male 0+1+2+3, female 0+1+2+4); a Khajiit is male
// 0+1 or female 2+3; a noble stands set0's title in front of the composed single name.
//
// RESULTS ARE NUL/EMPTY tolerant: a count of zero yields no fragment, a count read off
// the header that outruns its neighbour's offset is clamped to the stride-derived
// length — the stride math is the *law*, and the header's own counts confirmed it at
// every one of the 56 sets.
//
// The caller reads the file from the sibling install (the dev door's `?daggerfall=`
// or the machine's default path through `/arena-local/NAMEGEN.DAT`); with no corpus,
// everything here degrades to *no name*, and the game runs as it did.

/** The 10-byte slot every name fragment lives in. */
const SLOT = 10;
/** The strings area begins here; every set offset is derivable from this base. */
const BASE = 528;
/** Read at most this many bytes of an 8-character slot (the pad is NULs). */
const SLOT_CHARS = SLOT - 1;

/**
 * The corpus's own bank order and set counts, **measured, not asserted**: each count is
 * the stride-derived slot total (`nextSetOffset − setOffset` over 10), and the bank order
 * is the binary's. `breton`'s six counts of 13, `redguard`'s 5-set bank, and the Noble
 * bank's `6/14/14/14` closing the file exactly — those are checks, not assumptions
 * (`tests/unit/names.test.mjs`).
 *
 * @type {readonly {key: string, note: string, counts: number[]}[]}
 */
export const NAMEGEN_BANKS = Object.freeze([
  { key: 'breton', note: 'first + surname', counts: [13, 13, 13, 13, 13, 13] },
  { key: 'redguard', note: 'one name, four fragments', counts: [51, 5, 26, 22, 15] },
  { key: 'nord', note: 'first + surname', counts: [13, 13, 13, 7] },
  { key: 'darkElf', note: 'surname suffix lands past the XML\u2019s skipped set', counts: [12, 12, 12, 12, 12, 12] },
  { key: 'highElf', note: 'the Bosmer bank\u2019s neighbour, by content', counts: [12, 12, 12, 10, 12, 12] },
  { key: 'woodElf', note: 'Mossio/Eliswyn themselves', counts: [12, 12, 11, 10, 12, 12] },
  { key: 'khajiit', note: 'Moj, Ab\u2019, Ak\u2019 \u2014 one name per gender', counts: [15, 16, 15, 15, 15, 15] },
  { key: 'imperial', note: 'Tiberius\u2019s Rome, four sets tall', counts: [13, 13, 13, 13, 13, 13] },
  { key: 'goth', note: 'Grolantor and the -goth tables (monsters)', counts: [25, 16, 25] },
  { key: 'mansion', note: 'Homunilas\u2019 bank (monsters and mansions)', counts: [12, 12, 12, 12] },
  { key: 'noble', note: 'Lord Zothelgar\u2019s bank \u2014 the title set is the file\u2019s own last word', counts: [14, 14, 14, 6] },
]);

/**
 * Parse the corpus out of the install's bytes.
 *
 * @param {Uint8Array|Buffer} buf the raw `NAMEGEN.DAT`
 * @returns {{banks: Record<string, string[][]}, warn?: string[]}|null} null when the
 *   bytes are not the corpus (too small, or the file's own first set does not open with
 *   the Breton prefixes that anchor every check).
 */
export function parseNamegen(buf) {
  if (!buf || buf.length < BASE + 100) return null;
  const at = (off) => {
    let s = '';
    for (let j = 0; j < SLOT_CHARS && off + j < buf.length; j++) {
      const c = buf[off + j];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const banks = {};
  let off = BASE;
  for (const bank of NAMEGEN_BANKS) {
    const sets = [];
    for (const count of bank.counts) {
      if (off + count * SLOT > buf.length) return null;
      sets.push(Array.from({ length: count }, (_, k) => at(off + k * SLOT)));
      off += count * SLOT;
    }
    banks[bank.key] = sets;
  }
  // The corpus's own anchor: the Breton male prefixes open the strings area, and the
  // Noble titles close it (bank-last in the binary's own order). Anything else is a
  // different file entirely.
  if (banks.breton[0][0] !== 'Theod' || banks.noble[3][0] !== 'Lord') return null;
  return { banks, total: off };
}

/**
 * Compose one person's name from the bank of their race.
 *
 * The composition rules are the generator's own, read off UESP's decoded XML
 * (`Daggerfall:XML:Namegen dat xml`): the first name rides sets 0+1 (male) or 2+3
 * (female), the surname rides 4+5; a Redguard and a Khajiit carry a single part; a
 * *noble* — an employer, a patron — carries a title in front of the single name.
 *
 * @param {{banks: Record<string, string[][]}, rng: {next: () => number}} opts
 *   `rng` is a seeded `ArenaRandom` (or anything with `next()`), so a scene can keep the
 *   same face-to-name mapping stable across visits.
 * @param {string} bankKey  a key of `NAMEGEN_BANKS`
 * @param {boolean} [female]
 * @param {boolean} [titled] a patron's title rides the noble bank's own set 0
 * @returns {string|null} null when the corpus is absent or the bank is unknown
 */
export function personName({ banks, rng }, bankKey, female = false, titled = false) {
  if (!banks || !Array.isArray(banks[bankKey])) return null;
  const sets = banks[bankKey];
  const pick = (set) => (set.length ? set[Math.floor(rng.next() * set.length) % set.length] : '');
  if (bankKey === 'noble') {
    // The binary stores the Noble bank name-first and titles *last* (set3), opposite
    // the XML's display order — measured directly out of the file's tail slots.
    const title = titled && sets[3].length ? `${pick(sets[3])} ` : '';
    return title + [pick(sets[0]), pick(sets[1]), pick(sets[2])].join('');
  }
  if (bankKey === 'redguard') {
    return [pick(sets[0]), pick(sets[1]), pick(sets[2]), pick(sets[female ? 4 : 3])].join('');
  }
  if (bankKey === 'khajiit') {
    return [pick(sets[female ? 2 : 0]), pick(sets[female ? 3 : 1])].join('');
  }
  // The port's own extension for the two banks UESP leaves unnamed: the *monster* banks.
  // A -goth name is one long three-part word (Grol + an + tor = Grolantor, a male mansion
  // name the same shape, Dem + og + orgon = Demebrorgon); a mansion woman's rides one part
  // more (0+1+2+3 = Demebrorgona) — the generator's own male/female split, read off its
  // sample lists. These name the enemies of Tamriel and, later, a Daedra lord's quest.
  if (bankKey === 'goth' || bankKey === 'mansion') {
    const parts = bankKey === 'mansion' && female ? 4 : 3;
    const name = [...Array(parts)].map((_, k) => pick(sets[k])).join('');
    return name || null;
  }
  // Elf, Breton, Nord, Imperial: first name, then surname. Nord surnames are Breton's,
  // exactly as UESP's decode says — read them off the Breton bank.
  const surnameSets = bankKey === 'nord'
    ? banks.breton.slice(4, 6)
    : sets.slice(4, 6);
  const first = [pick(sets[female ? 2 : 0]), pick(sets[female ? 3 : 1])].join('');
  const second = surnameSets.length >= 2
    ? [pick(surnameSets[0]), pick(surnameSets[1])].join('')
    : '';
  return second ? `${first} ${second}` : first;
}
