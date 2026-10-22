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

// ── THE NAMES THAT DO NOT NEED THE SIBLING INSTALL ────────────────────────────────────────
//
// The corpus above is the sibling's, and it is the best source there is: it *is* the generator
// Arena's own era used. But it is a second install's file, and two holes were visible to the
// owner (2026-10-18): *"make the name of npcs differenciate between male and female and by race
// … and make them have random names"*. The corpus is only as good as the caller:
//
//   * a woman of the town was named with a coin toss (`nextBelow(100) < 50`) rather than from
//     her own art, so the street's women carried men's names half the time;
//   * the bank was drawn from the *province's* pool rather than from the **person's race**, so a
//     Nord in Elsweyr could be called Moj'Dar;
//   * the corpus ships **no Argonian bank at all**, so Black Marsh's folk were named `imperial`;
//   * and with no sibling install there were no names whatsoever.
//
// The table below closes all four. It holds a **given-name list for each race and each sex** and
// a family-name list where that race uses one, taken from the names the later games actually give
// those peoples (UESP's per-race name lists): a Breton's Delphine and a Dunmer's Barenziah, a
// Khajiit's J'zargo (no family name), a Redguard's single long name, an Argonian's "Basks-In-The-
// Sun" beside its Jel forms. `names.test.mjs` holds every key to the races this project draws.
//
// The corpus still wins when it is there — it composes a name the way Arena's own generator did —
// and this table is the answer when it is absent, or for a race it has no bank for.

/**
 * @typedef {{given: readonly string[], family?: readonly string[]}} LoreNameList
 * @type {Readonly<Record<string, {male: LoreNameList, female: LoreNameList}>>}
 */
export const LORE_NAMES = Object.freeze({
  breton: {
    male: { given: ['Amaund', 'Arnand', 'Edouard', 'Gaston', 'Jauffre', 'Lucien', 'Mathieu', 'Riel', 'Vincent', 'Wayn'], family: ['Bienne', 'Cienne', 'Dufort', 'Gautier', 'Labouche', 'Meric', 'Montfort', 'Rielle', 'Valmont', 'Valen'] },
    female: { given: ['Adeline', 'Angeline', 'Bernadette', 'Celeste', 'Delphine', 'Elisa', 'Genevieve', 'Jeanne', 'Marguerite', 'Vivienne'], family: ['Bienne', 'Cienne', 'Dufort', 'Gautier', 'Labouche', 'Meric', 'Montfort', 'Rielle', 'Valmont', 'Valen'] },
  },
  redguard: {
    male: { given: ['Ahtar', 'Amren', 'Avik', 'Azzan', 'Dalan', 'Endon', 'Isran', 'Nazir', 'Ralis', 'Sadeer'] },
    female: { given: ['Aduri', 'Idesa', 'Nazneen', 'Nuria', 'Saadia', 'Saffir', 'Samira', 'Shavari', 'Zahra', 'Farah'] },
  },
  nord: {
    male: { given: ['Arnbjorn', 'Balgruuf', 'Bjorn', 'Froki', 'Galmar', 'Hadvar', 'Heimskr', 'Kodlak', 'Ralof', 'Tolfdir'], family: ['Bearclaw', 'Fire-Hand', 'Frostmoon', 'Iron-Helm', 'Stone-Fist', 'Stormblade', 'Winter-Song', 'Wolfheart'] },
    female: { given: ['Aela', 'Astrid', 'Bryling', 'Freya', 'Gerdur', 'Idgrod', 'Ingjard', 'Lydia', 'Njada', 'Sigrid'], family: ['Bearclaw', 'Fire-Hand', 'Frostmoon', 'Iron-Helm', 'Stone-Fist', 'Stormblade', 'Winter-Song', 'Wolfheart'] },
  },
  darkElf: {
    male: { given: ['Aryon', 'Baladas', 'Drevas', 'Fargoth', 'Galthis', 'Hleras', 'Neloth', 'Savos', 'Tarhiel', 'Voryn'], family: ['Andrano', 'Dralor', 'Falenas', 'Hlaalu', 'Indoril', 'Redoran', 'Sadras', 'Telvanni', 'Uveran', 'Vendu'] },
    female: { given: ['Ahnassi', 'Almalexia', 'Barenziah', 'Dratha', 'Ilmeni', 'Llavam', 'Mehra', 'Naryu', 'Seryna', 'Velsa'], family: ['Andrano', 'Dralor', 'Falenas', 'Hlaalu', 'Indoril', 'Redoran', 'Sadras', 'Telvanni', 'Uveran', 'Vendu'] },
  },
  highElf: {
    male: { given: ['Ancano', 'Estormo', 'Fasendil', 'Nelacar', 'Ondolemar', 'Quaranir', 'Rulindil', 'Savos', 'Tandil', 'Vingalmo'], family: ['Amberfell', 'Direnni', 'Ilessan', 'Lareth', 'Mothil', 'Nivine', 'Silver-Song', 'Telas', 'Varian', 'Wyrd'] },
    female: { given: ['Arannelya', 'Calianwe', 'Elenwen', 'Ilinwe', 'Laranalda', 'Mirulda', 'Niralen', 'Seryn', 'Talmana', 'Vindrel'], family: ['Amberfell', 'Direnni', 'Ilessan', 'Lareth', 'Mothil', 'Nivine', 'Silver-Song', 'Telas', 'Varian', 'Wyrd'] },
  },
  woodElf: {
    male: { given: ['Anoriath', 'Brelin', 'Faendal', 'Gathwen', 'Malborn', 'Nivenor', 'Raleth', 'Sinderion', 'Tindor', 'Varnor'], family: ['Ashwood', 'Greenleaf', 'Mossfoot', 'Oakvale', 'Riverwood', 'Silverbough', 'Thornwood', 'Willowbark'] },
    female: { given: ['Anwen', 'Camenwen', 'Faelin', 'Gilenya', 'Llanela', 'Nimriel', 'Orwen', 'Silvena', 'Tilda', 'Yavni'], family: ['Ashwood', 'Greenleaf', 'Mossfoot', 'Oakvale', 'Riverwood', 'Silverbough', 'Thornwood', 'Willowbark'] },
  },
  khajiit: {
    male: { given: ['Dro\'bar', 'Ji\'dar', 'Jo\'ban', 'Jo\'zah', 'J\'zargo', 'Kharjo', 'Ma\'jhad', 'Ma\'dran', 'M\'aiq', 'Ra\'jirr', 'Ri\'saad', 'S\'razo'] },
    female: { given: ['Ahkari', 'J\'zara', 'Kesh', 'Ma\'isha', 'Nahz', 'Ra\'sina', 'Sari', 'Shaba', 'Tsavani', 'Za\'hedra', 'Zhanbi'] },
  },
  imperial: {
    male: { given: ['Baurus', 'Claudius', 'Demetrius', 'Hieronymus', 'Lucan', 'Maro', 'Ocato', 'Tertius', 'Uriel', 'Valerius'], family: ['Bellamont', 'Caro', 'Mede', 'Motierre', 'Othran', 'Rilis', 'Sestius', 'Vantus', 'Vitellius', 'Wodan'] },
    female: { given: ['Alessia', 'Erina', 'Gwendolyn', 'Hestra', 'Ione', 'Lucia', 'Mirabelle', 'Selene', 'Valeria', 'Vittoria'], family: ['Bellamont', 'Caro', 'Mede', 'Motierre', 'Othran', 'Rilis', 'Sestius', 'Vantus', 'Vitellius', 'Wodan'] },
  },
  argonian: {
    male: {
      given: ['Beekatan', 'Dreekius', 'Gah-Julan', 'Huleeya', 'Im-Kilaya', 'Okan-Shei', 'Teeba-Ei', 'Wuleen-Shei', 'Weebam-Na', 'Yinz-Hei', 'Beem-Ja', 'Gulum-Ei', 'Talen-Jei', 'Veezara', 'Deekus', 'Basks-In-The-Sun', 'Hides-His-Eyes', 'Stands-In-Shallows', 'Swims-In-Deep-Water', 'Watches-The-Roots', 'Grey-Throat', 'Scar-Tail', 'Speaks-With-Blades'],
    },
    female: {
      given: ['Chuna', 'Deeja', 'Keerava', 'Kud-Ei', 'Ocheeva', 'Shahvee', 'Wujeeta', 'Zali', 'Teegla', 'Trees-That-Sway', 'Lifts-Her-Tail', 'Shulki', 'Marz', 'Onasha'],
    },
  },
});

/**
 * A stable 0…1 for one person and one purpose — the same FNV-1a law `raceSkin.raceDraw` uses.
 *
 * @param {{seed?: number, row?: number, col?: number, key?: string}} person
 * @param {string} salt  what the draw is *for* (`given`, `family`), so the two do not correlate
 * @returns {number}
 */
export function nameDraw(person, salt) {
  const text = `${(person?.seed ?? 0) >>> 0}|${person?.row ?? 0}|${person?.col ?? 0}|${person?.key ?? ''}|${salt}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

/**
 * A lore-accurate name from the built-in table, for a race and a sex.
 *
 * @param {string|null} race  a `raceSkin.js` race key (`darkElf`, `khajiit`, …)
 * @param {boolean} female
 * @param {{seed?: number, row?: number, col?: number, key?: string}} person
 * @returns {string|null} null for a race this table does not carry
 */
export function loreNameFor(race, female, person) {
  const row = race && LORE_NAMES[race];
  if (!row) return null;
  const list = female ? row.female : row.male;
  const given = list.given[Math.floor(nameDraw(person, 'given') * list.given.length) % list.given.length];
  const family = list.family?.length
    ? list.family[Math.floor(nameDraw(person, 'family') * list.family.length) % list.family.length]
    : null;
  return family ? `${given} ${family}` : given;
}

/**
 * One person's name: the sibling corpus where it has this race's bank, the built-in table
 * otherwise — and **always for the sex the figure is drawn as**.
 *
 * @param {object} opts
 * @param {{banks: Record<string, string[][]>}|null} [opts.banks]  `parseNamegen`'s answer
 * @param {string|null} [opts.race]  the person's own race (`raceSkin.js` key)
 * @param {boolean} [opts.female]  whether the art is a woman
 * @param {number} [opts.seed] @param {number} [opts.row] @param {number} [opts.col] @param {string} [opts.key]
 * @returns {string|null}
 */
export function nameForPerson({ banks, race, female = false, seed = 0, row = 0, col = 0, key = '' } = {}) {
  const person = { seed, row, col, key };
  const bank = race && banks && Array.isArray(banks[race]) ? race : null;
  if (bank) {
    // The corpus's own composed name, drawn from the person's identity rather than from a live
    // die: `personName` takes anything with `next()`, and this one is their cell and outfit.
    let n = 0;
    const rng = { next: () => nameDraw(person, `corpus${n++}`) };
    const composed = personName({ banks, rng }, bank, Boolean(female));
    if (composed) return composed;
  }
  return loreNameFor(race, Boolean(female), person);
}
