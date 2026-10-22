// ONE PERSON'S OWN WORDS: `template.dat` IS A KEYED FILE, AND THIS READS THE KEYS.
//
// The owner, 2026-10-19: *"you need to also fix the dialogue npcs have. now its mostly random but
// it needs to be coherent with their race, place and personality"*. He was right, and the reason
// was structural rather than a matter of picking better lines.
//
// ## What the port was doing
//
// `townsfolk.js`'s `talkCorpus` read `template.dat` as one undifferentiated pool: it kept the
// `&`-separated parts that were whole sentences **and needed no substitution** (561 of the file's
// 2 462 parts) plus the 14 that needed only a city-state's name, and every person drew from that
// single pool. Two consequences: a guard, a harlot and a king were interchangeable, and the 90% of
// the file that says *who* is speaking — its introductions, its rumours, its jokes, its swear
// words — was thrown away as "unfillable".
//
// ## What the file actually is
//
// `template.dat` is **keyed**, and the keys are subjects: 100…114 are the "who are you" answers,
// **one per personality**, and 115…129 the same answers for somebody the player has met before.
// OpenTESArena reads them by hand — `GameWorldUiState.cpp`'s `onNpcWhoAreYouButtonSelected`:
//
//     const int hasBeenIntroducedEntryOffset = prevHasBeenIntroduced ? 15 : 0;
//     const ArenaNpcPersonalityType personalityType = dialogueManager.getEntityPersonalityType();
//     const int entryIndex = 100 + hasBeenIntroducedEntryOffset + static_cast<int>(personalityType);
//
// and the personalities are Arena's own fifteen (`ArenaTypes.h:183`, `ArenaNpcPersonalityType`):
// Citizen, Prostitute, Prostitute2, Jester, Firebreather, SnakeCharmer, Beggar, StreetVendor,
// StreetVendor2, Thief, Wizard, Priest, Musician, StreetCleaner (unused), Slaver (unused). A
// figure's personality is read off **the item number the map placed** — `ArenaAnimUtils.cpp`'s
// `tryGetStaticNpcPersonalityType`: beggar 16, firebreather 17, harlot 18–20, jester 21, merchant
// 22/23, musician 24/25, priest 26/27, shady character 28, snake charmer 29, alchemist-vendor 30,
// wizard 31; `isNpcTavernPatron` names 83…90, the tavern's own drinkers, who have a bank of their
// own (1430) instead of a personality.
//
// The other keys this module reads, each with the reference call site that asks for it:
//
//     key      what it is                              where the reference asks it
//     100/115  "who are you", first / met before        GameWorldUiState.cpp:3430
//     159      tattle — "nothing much is going on"      GameWorldUiState.cpp:3520 (rumour, one of two)
//     160      no work to be had                        GameWorldUiState.cpp:3548
//     185      a real rumour (29 parts)                 GameWorldUiState.cpp:3520 (the other of two)
//     259–261  where-is: too far / a direction / on the map   GameWorldUiState.cpp:220
//     262      100 occupation names ("scribe", "servant" …)   DialogueFunctions.cpp's `%oc`
//     263…362  that occupation's own description, one key per name (`%doc`)
//     363      jokes, for `%jok`                         DialogueFunctions.cpp:333
//     364…371  an oath, one bank per province's race      DialogueManager.cpp:257 (`getOathsEntryKey`)
//     1430     a tavern's drinkers (51 parts)            GameWorldUiMVC.cpp:1637
//
// The occupation table is a **pair of keys**: `%oc` is `262[index]` and `%doc` is `263+index`, so a
// name and its description always agree ("scribe" + "record the deeds of great warriors" = *I am
// %n, a scribe. I record the deeds of great warriors.*). The reference draws the index at random
// per entity — `DialogueManager.cpp`'s `getEntityOccupationIndex` is `ArenaRandom(instanceID)
// .next(100)`, and OpenTESArena's own comment calls it "@todo store in entity instance". This port
// draws it deterministically from the person's identity instead (the same face is the same trade on
// every visit) and **narrows the draw by the figure's own role**: a smith is given one of the
// smith's own trades, a barkeep one of the tavern's.
//
// ## What opens up
//
// A person can now answer with far more of the words the file really uses, because the port fills
// more of the vocabulary than it could: `%n`/`%fn` (their own name, composed by the install's name
// generator — `game/names.js`), `%oc`/`%doc` (their trade), `%ra` (the player's race, which is how
// Arena addresses a stranger), `%pcn`/`%pcf` (the player's name), `%cn`/`%cn2` (the city-state and
// its neighbour), `%ct` (its kind — "city", "town", "village"), `%lp` (the province), `%hc` (the
// player's home province, from their race), `%g`/`%g2`/`%g3` (he/she/it, from the person's own
// sex), `%oth` (an oath of the province's own race), `%jok` (a joke). Measured over the whole file:
// **804** of its 1 823 whole-sentence parts become speakable, against the 575 the old pool held —
// 229 of them opened by the wider vocabulary, and not one of the 1 823 lost.
//
// A word the port cannot fill is still **refused, not blanked** (the law `townsfolk.js` set and
// this module keeps): a part that wants `%t` (a ruler's title, whose words live in `A.EXE`), `%en`,
// `%nt`, `%tem` (building names this install has none of), `%di`, `%st`, `%rf` or a holiday is
// dropped and the next part of the *same* bank is tried, so a player never reads a `%`-word and
// never reads half a sentence.

import { fillTemplate, placeholdersOf } from '../arena/arenaText.js';
import { directionWord } from './navFlow.js';
import { PROVINCE_STYLE, RACE_KEYS } from './provinceStyle.js';
import { raceKey } from './raceSkin.js';
import { isFemalePerson } from './townsfolk.js';

/**
 * Arena's own fifteen NPC personalities, index for index (`ArenaTypes.h`'s
 * `ArenaNpcPersonalityType`), with the words this port's own art census uses for each
 * (`staticFolk.js`'s `STILL_ROLES`, `dungeonItems.js`'s `PERSON_ITEMS`).
 *
 * The last two are the reference's own "unused" entries: the enum ships them and Arena's message
 * banks do too (keys 113/128 and 114/129), so they are read here rather than dropped.
 */
export const PERSONAS = Object.freeze([
  Object.freeze({ index: 0, key: 'citizen', name: 'Citizen', label: 'a citizen' }),
  Object.freeze({ index: 1, key: 'prostitute', name: 'Prostitute', label: 'a harlot' }),
  Object.freeze({ index: 2, key: 'prostitute2', name: 'Prostitute2', label: 'a courtesan' }),
  Object.freeze({ index: 3, key: 'jester', name: 'Jester', label: 'a jester' }),
  Object.freeze({ index: 4, key: 'firebreather', name: 'Firebreather', label: 'a fire-eater' }),
  Object.freeze({ index: 5, key: 'snakecharmer', name: 'SnakeCharmer', label: 'a snake charmer' }),
  Object.freeze({ index: 6, key: 'beggar', name: 'Beggar', label: 'a beggar' }),
  Object.freeze({ index: 7, key: 'vendor', name: 'StreetVendor', label: 'a vendor' }),
  Object.freeze({ index: 8, key: 'vendor2', name: 'StreetVendor2', label: 'an alchemist-vendor' }),
  Object.freeze({ index: 9, key: 'thief', name: 'Thief', label: 'a shady character' }),
  Object.freeze({ index: 10, key: 'wizard', name: 'Wizard', label: 'a wizard' }),
  Object.freeze({ index: 11, key: 'priest', name: 'Priest', label: 'a priest' }),
  Object.freeze({ index: 12, key: 'musician', name: 'Musician', label: 'a musician' }),
  Object.freeze({ index: 13, key: 'streetcleaner', name: 'StreetCleaner', label: 'a street cleaner' }),
  Object.freeze({ index: 14, key: 'slaver', name: 'Slaver', label: 'a slaver' }),
]);

/** A persona by its enum index. */
export const personaAt = (index) => PERSONAS[index] ?? PERSONAS[0];

/**
 * **The personality a figure's item number carries** — `ArenaAnimUtils.cpp`'s
 * `tryGetStaticNpcPersonalityType`, item for item, in this port's own item words
 * (`dungeonItems.js`'s `PERSON_ITEMS`).
 *
 * `15` is the shopkeeper: the reference gives it no personality at all (the trade's own bank
 * speaks for it, `game/shops.js`), so it is a citizen here. `72` (a knight) and `73` (Jagar Tharn)
 * are people the reference's switch answers `nullopt` for, and a citizen is the honest floor.
 */
export const PERSONA_BY_ITEM = Object.freeze({
  15: 0, 16: 6, 17: 4, 18: 1, 19: 2, 20: 2, 21: 3, 22: 7, 23: 7, 24: 12, 25: 12,
  26: 11, 27: 11, 28: 9, 29: 5, 30: 8, 31: 10, 72: 0, 73: 0,
});

/**
 * **The same reading by the art's own role word** — the port's `staticFolk.js`'s `STILL_ROLES` and
 * `dungeonItems.js`'s `ART_ROLES`, which are what a still figure in this build carries. The two
 * tables agree with the item numbers above record for record; a role the port ships no art for
 * (a merchant's `MERCH`) is kept because the art may arrive and the persona would come with it.
 */
export const PERSONA_BY_ROLE = Object.freeze({
  worker: 0, smith: 0, bartender: 0, guard: 0, knight: 0, ruler: 0, consort: 0, heir: 0,
  'jagar tharn': 0, beggar: 6, 'fire-eater': 4, harlot: 1, jester: 3, merchant: 7,
  musician: 12, priest: 11, 'shady character': 9, 'snake charmer': 5, vendor: 8, wizard: 10,
});

/**
 * **A tavern's drinker** — the one static family with a bank of its own rather than a personality
 * (`ArenaAnimUtils.cpp`'s `isNpcTavernPatron`: items 83…90; `GameWorldUiMVC.cpp:1637` reads key
 * `1430` for them and nothing else).
 *
 * The port's census is why this is a role and not a room: `MAN01…04`/`WOMAN01…04` appear in
 * `TAVERN.INF`/`NEWTAV.INF` and in no other `.INF` in the install (measured), so a figure wearing
 * that art is a tavern's.
 */
export const PATRON = Object.freeze({ index: null, key: 'patron', name: 'TavernPatron', label: 'a patron of the house' });

/** The roles that answer with the tavern's own bank. */
export const PATRON_ROLES = Object.freeze(new Set(['patron', 'man', 'woman']));

/**
 * …and the same reading **off the art's own first word**, for a caller that carries a record and no
 * role: `WIZZ1.DFA` is a wizard, `PREST2.DFA` a priest. The words are the install's record names,
 * and the map is `dungeonItems.js`'s `ART_ROLES` (which reads the same word into a role) folded
 * through `PERSONA_BY_ROLE` — one law, two spellings.
 */
export const PERSONA_BY_ART = Object.freeze({
  SMITH: 0, BARTEND: 0, GUARD: 0, KING: 0, QUEEN: 0, PRINCE: 0, PRINCESS: 0, KNIGHT: 0,
  JTHARN: 0, MAN: null, WOMAN: null, BEG: 6, FIREMN: 4, HOKER: 1, JSTER: 3, MERCH: 7,
  MUSIC: 12, PREST: 11, SHADY: 9, SNAKTM: 5, VENDER: 8, WIZZ: 10,
});

/**
 * The persona a person speaks with.
 *
 * Read in the order the port can trust: an explicit stamp (a caller that knows better), the item
 * number the map placed, the role word the art census read, and otherwise **Citizen** — which is
 * what Arena's own table answers for a walking townsperson, a guard or a member of the court.
 *
 * @param {{persona?: object, itemIndex?: number, role?: string, kind?: string, file?: string|null, armour?: string|null}|null} person
 * @returns {object} a `PERSONAS` entry, or `PATRON`
 */
export function personaOf(person) {
  if (person?.persona) return person.persona;
  const role = String(person?.role ?? '').toLowerCase();
  if (role && PATRON_ROLES.has(role)) return PATRON;
  if (Number.isInteger(person?.itemIndex) && PERSONA_BY_ITEM[person.itemIndex] !== undefined) {
    return personaAt(PERSONA_BY_ITEM[person.itemIndex]);
  }
  if (role && PERSONA_BY_ROLE[role] !== undefined) return personaAt(PERSONA_BY_ROLE[role]);
  // The art's own stem, for a caller that carries the record but not the role (`WIZZ1.DFA`).
  const stem = String(person?.kind ?? person?.file ?? '').toUpperCase().replace(/\..*$/, '').replace(/#?\d+[A-Z]?$/, '');
  if (Object.hasOwn(PERSONA_BY_ART, stem)) {
    return PERSONA_BY_ART[stem] === null ? PATRON : personaAt(PERSONA_BY_ART[stem]);
  }
  return PERSONAS[0];
}

/** The `template.dat` keys this module reads, with what each one holds. */
export const TALK_KEYS = Object.freeze({
  /** `#100 + persona` — "who are you", first meeting. */
  intro: 100,
  /** `#115 + persona` — the same, for somebody already met. */
  introAgain: 115,
  /** `#185` — a real rumour (29 parts). */
  rumour: 185,
  /** `#159` — "nothing much is going on". */
  tattle: 159,
  /** `#160` — no work to be had. */
  noWork: 160,
  /** `#259`/`#260`/`#261` — where-is: too far, a direction, on the map. */
  whereFar: 259,
  whereNear: 260,
  whereMark: 261,
  /** `#262` — 100 occupation names, and `#263 + i` that occupation's own description. */
  occupationNames: 262,
  occupations: 263,
  /** `#363` — jokes, for `%jok`. */
  joke: 363,
  /** `#364 + province` — the oaths a province's own race swears by. */
  oaths: 364,
  /** `#1430` — a tavern's drinkers. */
  patron: 1430,
});

/** How many races the oath banks cover (`#364`…`#371`). */
export const OATH_COUNT = 8;

/** The jokes a person may tell, in one bank; `%jok` draws from it. */
export const MIN_LINE_LENGTH = 30;
/** A part that starts a sentence rather than continuing one. */
const STARTS_A_SENTENCE = /^["'(A-Z0-9]/;
/** …and ends one. */
const ENDS_A_SENTENCE = /[.!?”"]$/;

/** Is this whole sentence something a person could say on its own? */
export const isWholeSentence = (text) => STARTS_A_SENTENCE.test(text) && ENDS_A_SENTENCE.test(text);

/**
 * Split one recorded line into the parts Arena separates with `&`.
 *
 * `&` is the game's own part separator, and a record is a *set* of parts that are read together: a
 * lead-in, then the variations it introduces. Each part is one paragraph of one variant, which is
 * exactly the granularity a single answer wants. (This lived in `townsfolk.js` until the speech
 * half moved here; a part that begins or ends mid-sentence is still refused — it is half of a
 * sentence, not a remark.)
 *
 * @param {string} text
 * @returns {string[]}
 */
export function talkParts(text) {
  return String(text).split('&').map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** One line, as a bank holds it: its own key, its id inside that key, and its words. */
function lineOf(key, index, text) {
  return { key, index, id: key, text, words: placeholdersOf(text) };
}

/** The whole sentences of one key's records, in the file's own order. */
function sentencesOf(templates, key, { whole = true } = {}) {
  const out = [];
  for (const record of templates?.get(key) ?? []) {
    talkParts(record).forEach((part, index) => {
      if (whole && (!isWholeSentence(part) || part.length < MIN_LINE_LENGTH)) return;
      out.push(lineOf(key, index, part));
    });
  }
  return out;
}

/**
 * Fill a `%`-word template with what this game honestly knows — and **refuse** when it cannot.
 *
 * The law `townsfolk.js` set is unchanged, and it is the reason the banks can be trusted: an
 * unfilled word means the line is dropped and the next part of the same bank is read, rather than a
 * player seeing "The of Daggerfall". `unfilled` names the words that were missing, which is the
 * truth about why a line was refused (a `%t` — a ruler title from `A.EXE` — is the commonest).
 *
 * @param {string} template
 * @param {Record<string, string|number>} values
 * @returns {{text: string, unfilled: string[]}}
 */
export function fillSpeech(template, values) {
  const missing = placeholdersOf(template).filter((word) => !values?.[word]);
  const text = fillTemplate(template, values ?? {});
  // **One stop at the end of a sentence, not two.** The file's own `%jok` parts are written as
  // `%jok.` and every joke of its 21 already ends in `!` or `.`, so the filled line came out as
  // "Most %ra family trees don't fork!." — Arena's own text with a redundant stop where its two
  // sentences were joined. Nothing is rewritten: a second terminal stop is dropped, and an ellipsis
  // (`...`, which is three) is left alone.
  const tidied = text.replace(/([!?])\.$/, '$1').replace(/([^.]\.)\.$/, '$1');
  return { text: tidied, unfilled: [...new Set([...missing, ...placeholdersOf(tidied)])] };
}

/**
 * **The occupations**: `#262`'s hundred names, each with the description `#263 + i` holds for it.
 *
 * The pairing is the install's own, and it is what `%oc` and `%doc` mean: name `i` and description
 * `i` are one trade, in the same order, in the same file (`DialogueFunctions.cpp`'s `get_oc` reads
 * `262` at an index and `get_doc` reads `263 + index`). A row whose own text cannot be filled is
 * *speakable* only in its name, so `occupationFor` never hands one out.
 *
 * @param {Map<number, string[]>} templates  `library.talkTemplates`
 * @returns {{row: number, name: string, lines: {key: number, index: number, id: number, text: string, words: string[]}[]}[]}
 */
export function occupationsOf(templates) {
  const names = (templates?.get(TALK_KEYS.occupationNames) ?? []).flatMap((record) => talkParts(record));
  // **A description is a phrase, not a remark**, so it is kept whole: the intro grafts it onto
  // "I %doc." and a description that is a sentence of its own would read as two. (This is the one
  // place the file's parts are taken unfiltered, and `%doc` is why.)
  return names.map((name, row) => {
    const lines = [];
    for (const record of templates?.get(TALK_KEYS.occupations + row) ?? []) {
      talkParts(record).forEach((part, index) => lines.push(lineOf(TALK_KEYS.occupations + row, index, part)));
    }
    return { row, name, lines };
  });
}

/**
 * **The trades a role may be given.** This project's reading — the *names* are the install's own
 * hundred (`#262`), and what is added here is which of them a figure whose art says "smith" may be.
 *
 * It is a reading and it says so: Arena keeps the real pairing in `A.EXE` (D-11), the reference
 * draws an index at random (`DialogueManager.cpp`'s `getEntityOccupationIndex` is a hash of the
 * instance id, with its own `@todo`), and this port draws deterministically from the rows the role
 * owns. A role the table does not name is given the whole list, which is the reference's behaviour
 * with the draw made stable. `tests/unit/dialogue.test.mjs` holds every word in this table against
 * the install's own hundred, so a typo cannot quietly empty a trade.
 */
export const ROLE_TRADES = Object.freeze({
  smith: ['blacksmith', 'armorist', 'ebonysmith', 'apprentice', 'tanner'],
  bartender: ['innkeeper', 'tavernkeeper', 'publican', 'bartender', 'cook'],
  merchant: ['merchant', 'peddler', 'grocer', 'tinker', 'trapper'],
  vendor: ['peddler', 'merchant', 'grocer', 'herbalist'],
  priest: ['Priest', 'Monk', 'crusader', 'pilgrim', 'Exorcist', 'Oracle'],
  wizard: ['Mage', 'warlock', 'Mystic', 'sage', 'alchemist', 'astrologist'],
  jester: ['actor', 'Bard', 'musician', 'poet', 'playwright'],
  musician: ['musician', 'Bard', 'poet', 'dancer'],
  'fire-eater': ['actor', 'dancer', 'musician'],
  harlot: ['dancer', 'actor', 'barber'],
  beggar: ['bum', 'laborer', 'fieldhand', 'nomad'],
  'shady character': ['thug', 'Thief', 'Assassin', 'Rogue', 'moneylender', 'peddler'],
  'snake charmer': ['animal handler', 'falconer', 'herbalist', 'nomad'],
  guard: ['bodyguard', 'mercenary', 'squire', 'gaoler', 'crusader'],
  knight: ['crusader', 'squire', 'mercenary'],
  ruler: ['aristocrat', 'politician', 'steward', 'herald'],
  consort: ['aristocrat', 'politician'],
  heir: ['student', 'squire', 'apprentice'],
  worker: ['laborer', 'fieldhand', 'servant', 'carpenter', 'mason'],
  'jagar tharn': ['Mage', 'warlock', 'Mystic'],
});

/**
 * Every `template.dat` key this module knows, read out as **banks a person speaks from**.
 *
 * One read of the file, and every later question is a lookup: a persona's introductions, the
 * rumours a town's talk is made of, a tavern's drinkers, the jokes, the province's own oaths, and
 * the hundred trades. The `weird` count is the honest bookkeeping: parts the file carries that
 * begin or end mid-sentence (639 of its 2 462), which no bank ever hands to a player.
 *
 * @param {Map<number, string[]>} templates  `library.talkTemplates` (`arena/arenaText.js`)
 * @returns {object} banks + a `census` for the debug seam and the suites
 */
export function dialogueBanks(templates) {
  const intro = new Map();
  const introAgain = new Map();
  for (const persona of PERSONAS) {
    intro.set(persona.index, sentencesOf(templates, TALK_KEYS.intro + persona.index));
    introAgain.set(persona.index, sentencesOf(templates, TALK_KEYS.introAgain + persona.index));
  }
  // **An oath is an exclamation, not a sentence** — "By Thorig's Beard", "By the Rat-god" — and it
  // is always *inside* somebody else's line (`%oth`), so the bank keeps every part of it: all ten
  // of a province's oaths, not only the ones that read as whole sentences on their own (none do).
  const oaths = [];
  for (let race = 0; race < OATH_COUNT; race++) {
    const lines = [];
    for (const record of templates?.get(TALK_KEYS.oaths + race) ?? []) {
      talkParts(record).forEach((part, index) => lines.push(lineOf(TALK_KEYS.oaths + race, index, part)));
    }
    oaths.push(lines);
  }
  const occupations = occupationsOf(templates);
  // **The city-state bank**: every whole sentence in the file that needs nothing but the name of
  // the place — which is the one substitution a person can always make, wherever they stand. It is
  // the old `talkCorpus`'s `province` half, and it is what the panel's second question has always
  // been. One rule was added to it: **a line credited as "about Daggerfall" has to name it**, so a
  // part that mentions only `%cn2` (the neighbouring city-state) is not in this bank — the answer
  // the player reads and the name in its credit line are the same place by construction, rather
  // than by whichever line a seed happened to land on.
  const city = [];
  for (const key of templates?.keys() ?? []) {
    for (const line of sentencesOf(templates, key)) {
      if (line.words.includes('cn') && line.words.every((word) => word === 'cn' || word === 'cn2')) city.push(line);
    }
  }
  city.sort((a, b) => (a.id - b.id) || (a.index - b.index) || a.text.localeCompare(b.text));
  const rumour = [...sentencesOf(templates, TALK_KEYS.rumour), ...sentencesOf(templates, TALK_KEYS.tattle)];
  const banks = {
    intro,
    introAgain,
    rumour,
    noWork: sentencesOf(templates, TALK_KEYS.noWork),
    joke: sentencesOf(templates, TALK_KEYS.joke),
    patron: sentencesOf(templates, TALK_KEYS.patron),
    where: {
      far: sentencesOf(templates, TALK_KEYS.whereFar),
      near: sentencesOf(templates, TALK_KEYS.whereNear),
      mark: sentencesOf(templates, TALK_KEYS.whereMark),
    },
    oaths,
    occupations,
    city,
  };
  const count = (lines) => lines.length;
  // The file's own shape, so a different install shows up as a failing test rather than a quietly
  // thinner town: 2 462 `&`-separated parts, 1 823 of them whole sentences (`townsfolk.js` measured
  // the same two numbers when it owned this half).
  let parts = 0;
  let sentences = 0;
  for (const key of templates?.keys() ?? []) {
    for (const record of templates.get(key) ?? []) {
      for (const part of talkParts(record)) {
        parts++;
        if (isWholeSentence(part) && part.length >= MIN_LINE_LENGTH) sentences++;
      }
    }
  }
  banks.census = {
    keys: templates?.size ?? 0,
    parts,
    sentences,
    intros: [...intro.values()].reduce((n, lines) => n + count(lines), 0),
    introsAgain: [...introAgain.values()].reduce((n, lines) => n + count(lines), 0),
    personas: [...intro.values()].filter((lines) => lines.length).length,
    rumour: count(banks.rumour),
    jokes: count(banks.joke),
    patron: count(banks.patron),
    oaths: oaths.reduce((n, lines) => n + count(lines), 0),
    oathBanks: oaths.filter((lines) => lines.length).length,
    occupations: occupations.length,
    trades: occupations.filter((row) => row.lines.length).length,
    where: count(banks.where.far) + count(banks.where.near) + count(banks.where.mark),
    city: count(banks.city),
  };
  return banks;
}

/** The words a bank line needs before it can be said, filtered to what `values` holds. */
export const canSay = (line, values) => Boolean(line) && line.words.every((word) => Boolean(values?.[word]));

/**
 * **The next line of a bank this speaker can actually say**, in the install's own order.
 *
 * The bank's *speakable* lines are its ring — a part that wants a word this game cannot fill (a
 * ruler's title, a building's name) is not in it — and the walk begins at the speaker's own seed
 * plus the step (how many times they have been spoken to, or asked). Two things follow, and both are
 * the point: a person is **never mute** while their bank holds one sayable line, and a person is
 * **never random** — the same face says the same thing in the same order on every visit, and a
 * second press walks to the *next* line rather than to whichever one a fragment happened to be.
 *
 * (The first version walked the raw bank and took the first sayable part from the start index. That
 * is a different thing when a bank is sparse: a priest's remembered bank has two sayable parts out
 * of five, and steps 1 and 2 both landed on the second of them — the browser suite's "speaking twice
 * is not the same sentence twice" failed on exactly that, which is how this was found.)
 *
 * @param {{key: number, index: number, id: number, text: string, words: string[]}[]} lines
 * @param {Record<string, string|number>} values
 * @param {number} seed
 * @param {number} [step]
 * @returns {object|null}
 */
export function lineFrom(lines, values, seed, step = 0) {
  const sayable = (lines ?? []).filter((line) => canSay(line, values));
  if (!sayable.length) return null;
  const walk = Math.max(0, Math.trunc(step) || 0);
  return sayable[(Math.abs(Math.trunc(seed)) + walk) % sayable.length];
}

/**
 * **The province a race calls home** — the province whose own people are that race
 * (`provinceStyle.js`'s `PROVINCE_STYLE`, whose order is the install's own: High Rock, Hammerfell,
 * Skyrim, Morrowind, Summurset Isle, Valenwood, Elsweyr, Black Marsh, the Imperial Province).
 *
 * The reference reads it the same way round for `%hc` (`DialogueFunctions.cpp`'s `get_hc`:
 * `provinceLibrary.getProvinceDef(player.raceID)`), and the oath banks are indexed by the same
 * number (`getOathsEntryKey`: `364 + provinceDef.getRaceID()`).
 *
 * @param {string|null} race  a display name (`Khajiit`) or a key (`khajiit`)
 * @returns {number} a province index, or -1 for a race this install has no province for
 */
export function homeProvinceOf(race) {
  // **The fold is the game's own, both spellings at once**: a character's race is `Dark Elf`
  // (`character.js`'s display name, capitalized) and the province table's key is `darkElf`, and
  // `raceKey` takes the *lowercased* spelling for its aliases — so the name is folded down first and
  // then read, which is the same fold `raceSkin.js` makes for a face and a name bank.
  const key = raceKey(String(race ?? '').toLowerCase()) ?? null;
  return RACE_KEYS.indexOf(key);
}

/** The name of the province a race calls home, or null. */
export function homeProvinceName(race) {
  const id = homeProvinceOf(race);
  return id >= 0 ? (PROVINCE_STYLE[id]?.name ?? null) : null;
}

/**
 * The oath a province's own people swear by, or null.
 *
 * `#364 + race` for the eight provinces the file has banks for; the **Imperial Province** answers a
 * bank at random in the reference (`getOathsEntryKey` falls back to `random.next(8)` for the centre
 * province), and here the draw is the speaker's own seed instead, so a Cyrodiil's oath is stable
 * rather than different on every sentence.
 *
 * @param {object} banks
 * @param {number} provinceID
 * @param {number} seed
 * @returns {{text: string, id: number, key: number}|null}
 */
export function oathFor(banks, provinceID, seed) {
  const id = Number.isInteger(provinceID) && provinceID >= 0 && provinceID < banks?.oaths?.length ? provinceID : null;
  const bank = banks?.oaths?.[id ?? (Math.abs(Math.trunc(seed)) % OATH_COUNT)];
  if (!bank?.length) return null;
  return bank[Math.abs(Math.trunc(seed)) % bank.length];
}

/**
 * The joke a person tells, or null.
 *
 * **A joke is a template of its own** — every one of the file's 21 is a joke about the *player's* race
 * ("Why did the `%ra` put the letters 'T.G.I.F.' on his boots?"), and two of them name a building
 * (`%nt`, `%tem`) this install has no name for. So when the values are handed in, the bank is
 * narrowed to the jokes that can be filled and the draw is made inside it: `%jok` is inserted into
 * somebody else's line and then read back by `fillSpeech`, so a joke still carrying a `%`-word would
 * have refused the whole line — twelve of the file's own introductions mention a joke, and none of
 * them could be said until this was found (the browser suite printed the unfilled joke, `%ra` and
 * all, in a speaker's values).
 *
 * @param {object} banks
 * @param {number} seed
 * @param {Record<string, string|number>} [values]  what the speaker can fill, for the narrow
 * @returns {{text: string, id: number, key: number, words: string[]}|null}
 */
export function jokeFor(banks, seed, values = null) {
  const all = banks?.joke ?? [];
  const bank = values ? all.filter((line) => canSay(line, values)) : all;
  return bank.length ? bank[Math.abs(Math.trunc(seed)) % bank.length] : null;
}

/**
 * **Everything a person can be answered with, read off their own record and where they stand.**
 *
 * `Without%`-words, the table is the whole of what this port knows that Arena's lines ask for, and
 * each entry is a fact already in the scene — nothing here is invented for a sentence's sake:
 *
 *   `n`/`fn`   their own name, composed by the install's own generator (`game/names.js`; the
 *              scene names every figure it places, walking and still alike);
 *   `oc`/`doc` their trade, drawn from `ROLE_TRADES` (see `occupationFor`);
 *   `ra`       **the player's race**, which is how Arena has a stranger addressed — "young %ra",
 *              "Most %ra family trees don't fork!";
 *   `pcn`/`pcf` the player's name;
 *   `cn`/`cn2` the city-state the player is standing in, and its nearest neighbour;
 *   `ct`       its kind, lowercase — "this %ct" is "this city" / "this town" / "this village";
 *   `lp`       the province it is in, and `hc` the province the player's own race is from;
 *   `g`/`g2`/`g3` he/she/it, from the person's own sex (`townsfolk.isFemalePerson`);
 *   `oth`      an oath of the province's race (`oathFor`);
 *   `jok`      a joke (`jokeFor`).
 *
 * @param {object} ctx
 * @param {object|null} ctx.person
 * @param {object} ctx.banks
 * @param {{place?: string, neighbour?: string, province?: string, kind?: string}|null} [ctx.place]
 * @param {{name?: string, race?: string, female?: boolean}|null} [ctx.player]
 * @param {number} [ctx.provinceID]
 * @param {number} [ctx.seed]
 * @returns {Record<string, string>}
 */
export function speakValuesFor(ctx) {
  const { person, banks } = ctx;
  const place = ctx.place ?? null;
  const player = ctx.player ?? null;
  const seed = Math.trunc(ctx.seed ?? 1);
  const kind = String(place?.kind ?? '').toLowerCase();
  const values = {};
  if (person?.name) {
    values.n = person.name;
    values.fn = String(person.name).split(' ')[0];
  }
  if (player?.race) values.ra = String(player.race);
  if (player?.name) {
    values.pcn = String(player.name);
    values.pcf = String(player.name).split(' ')[0];
  }
  if (place?.place) values.cn = String(place.place);
  if (place?.neighbour) values.cn2 = String(place.neighbour);
  if (['city', 'town', 'village'].includes(kind)) values.ct = kind;
  if (place?.province) values.lp = String(place.province);
  const home = homeProvinceName(player?.race);
  if (home) values.hc = home;
  // **Their own sex, for the person a line speaks about.** A figure whose art names a sex
  // (`01CHNWLK` a man, `11CHNWLK` a woman, `WOMAN01` a woman, `QUEEN.IMG` a queen) answers with it;
  // a stand-in (`KHAJIIT`) takes the same draw the name did, so the pronoun agrees with the name.
  // A still person carries no outfit, so the art's own name is handed to the same reader rather
  // than a second sex table being written beside it.
  const sexed = person ? { kind: person.kind ?? person.outfit?.key ?? person.set ?? String(person.file ?? person.art ?? '') } : null;
  const female = person?.female ?? (sexed ? isFemalePerson(sexed, 0.5) : null);
  if (female !== null && female !== undefined) {
    values.g = female ? 'she' : 'he';
    values.g2 = female ? 'her' : 'him';
    values.g3 = female ? 'her' : 'his';
  }
  const oath = oathFor(banks, ctx.provinceID, seed);
  if (oath) values.oth = oath.text;
  // The joke's own words are filled here, before it is handed to a line as `%jok` — otherwise the
  // line's read-back sees `%ra` inside the joke and refuses a remark that is perfectly sayable.
  const joke = jokeFor(banks, seed, values);
  if (joke) {
    const filled = fillSpeech(joke.text, values);
    if (!filled.unfilled.length) values.jok = filled.text;
  }
  return values;
}

/**
 * **The trade a person is given**, name and description together.
 *
 * The index is drawn deterministically from the person's identity — the reference draws one too
 * (`getEntityOccupationIndex`), and this is the same law with the randomness removed, so the same
 * face has the same trade on every visit. Two things narrow it, both read off the figure:
 *
 *   * **the role owns a set of rows** (`ROLE_TRADES`): a smith is given one of the smith's trades,
 *     a barkeep one of the tavern's. A role the table does not name draws from the whole list,
 *     which is what the reference does for every figure;
 *   * **only rows the install's own text can speak are handed out.** Two of the hundred name a
 *     place this port has no name for in all three of their descriptions — `bodyguard` ("one of the
 *     %t's private bodyguards", "keep the meaner element out of the %nt") and `bartender` ("serve
 *     ale at the %nt" ×3) — so a person given one of those rows could not introduce themselves at
 *     all. They are never drawn; the *rows themselves* are untouched, and the census keeps them.
 *
 * @param {object} ctx  as `speakValuesFor`, minus the trade (it is chosen against those values)
 * @returns {{row: number, name: string, line: {text: string, id: number}|null}|null}
 */
export function occupationFor(ctx) {
  const rows = ctx?.banks?.occupations ?? [];
  if (!rows.length) return null;
  const persona = ctx.persona ?? personaOf(ctx.person);
  const role = String(ctx.person?.role ?? '').toLowerCase();
  const wanted = ROLE_TRADES[role] ?? null;
  const own = wanted ? rows.filter((row) => wanted.includes(row.name)) : [];
  const values = ctx.values ?? {};
  const pool = (own.length ? own : rows).filter((row) => row.lines.some((line) => canSay(line, values)));
  if (!pool.length) return null;
  const seed = Math.trunc(ctx.seed ?? 1);
  // The role's own rows first when there are any; otherwise the whole hundred, weighted by the
  // same identity every other draw in the scene uses. `persona` is read but not selected on: Arena
  // gives a personality and a trade independently, and so does this.
  const row = pool[((Math.abs(seed) * 2654435761 + role.length * 97 + (persona.index ?? 0) * 31) >>> 0) % pool.length];
  if (!row) return null;
  const line = lineFrom(row.lines, values, seed, 0);
  if (!line) return null;
  return { row: row.row, name: row.name, line };
}

/**
 * **A speaker, ready to say something** — the persona, the trade, and every word they can fill.
 *
 * One call, because the three are entangled: the trade is chosen against the values (so a trade
 * whose own description names something unfillable is never handed to somebody who cannot describe
 * it), and the values then hold the trade (`oc`/`doc`) for every bank that asks.
 *
 * @param {object} ctx  `{person, banks, place, player, provinceID, seed}`
 * @returns {{person: object|null, persona: object, occupation: object|null, values: Record<string,string>, place: object|null, player: object|null, seed: number}}
 */
export function speakerFor(ctx) {
  const persona = personaOf(ctx?.person);
  const seed = Math.trunc(ctx?.seed ?? 1);
  const values = speakValuesFor({ ...ctx, seed });
  const occupation = occupationFor({ ...ctx, persona, values, seed });
  if (occupation) {
    values.oc = occupation.name;
    values.doc = occupation.line.text;
  }
  return {
    person: ctx?.person ?? null,
    persona,
    occupation,
    values,
    place: ctx?.place ?? null,
    player: ctx?.player ?? null,
    // The buildings the player may ask the way to, nearest of each kind: the scene measures them
    // (`interior.js`'s `nearbyBuildings`), because only the scene has the street's door list.
    nearby: Array.isArray(ctx?.nearby) ? ctx.nearby : [],
    seed,
  };
}

/**
 * **What the person says when the player speaks to them.**
 *
 * First meeting: their personality's own "who are you" (key `100 + persona`). Met before — the
 * regard ledger's own memory, or a second press of `T` — the "I remember you" bank (`115 +
 * persona`), which is the same figure for the fifteenth time rather than a new stranger's face.
 *
 * A tavern's drinker answers from their own bank (`1430`, the reference's `TavernPatron`), and a
 * persona whose bank cannot be filled falls back to the other bank and then to the town's own
 * city-state lines — a person is never mute while the file holds one sentence they could say.
 *
 * @param {object} speaker  a `speakerFor` result
 * @param {object} banks
 * @param {{turn?: number, met?: boolean}} [opts]
 * @returns {{text: string, id: number, key: number, subject: string}|null}
 */
export function greetingFor(speaker, banks, opts = {}) {
  const { persona, values, seed } = speaker;
  const turn = Math.max(0, Math.trunc(opts.turn ?? 0));
  const met = Boolean(opts.met) || turn > 0;
  const subjects = [];
  if (persona.index === null) {
    // **A tavern's drinker has one bank and walks it**: the reference reads `1430` for that family
    // as many times as the player knocks, so the second word to them is another line of it rather
    // than a repeat of the first.
    subjects.push({ lines: banks.patron, name: 'a tavern\u2019s own drinker', step: turn });
  } else {
    const first = banks.intro.get(persona.index) ?? [];
    const again = banks.introAgain.get(persona.index) ?? [];
    const own = met ? [again, first] : [first, again];
    subjects.push({ lines: own[0], name: met ? `${persona.label}\u2019s own words, remembered` : `${persona.label}\u2019s own introduction`, step: turn });
    subjects.push({ lines: own[1], name: `${persona.label}\u2019s own words`, step: turn });
  }
  // The floor: the town's own lines. A sentence about the city-state needs nothing but its name,
  // which is a fact wherever a person is standing.
  subjects.push({ lines: banks.city, name: 'the town\u2019s own talk', step: turn });
  for (const subject of subjects) {
    const line = lineFrom(subject.lines, values, seed, subject.step);
    if (!line) continue;
    const filled = fillSpeech(line.text, values);
    if (filled.unfilled.length) continue;
    return { text: filled.text, id: line.id, key: line.key, subject: subject.name };
  }
  return null;
}

/**
 * **The questions a person can answer here**, each answered with the words of the bank that fits.
 *
 * The panel's questions are **this place** — the rumour answer the reference gives a citizen
 * (`185`'s twenty-nine parts, or `159`'s "nothing much is going on") — the **city-state** the player
 * is standing in, whose name is the one substitution the file's own city lines ask for, and **the way
 * to each building** the street offers (tavern, shop, Mages Guild, palace — see below). When there is
 * no place (a dungeon, a bare map file) the city-state question is simply not offered.
 *
 * The rest of the file is not offered as questions because the port cannot fill them yet, and says
 * so rather than showing a hole: a direction needs a building's name (two things this install
 * spells in `A.EXE`: `%di`'s destination and `%en`/`%nt`/`%tem`), a joke is told inside somebody's
 * own words (`%jok`) rather than asked for, and `%st` — whether the city-states are at war — is not
 * a thing this port's world has.
 *
 * @param {object} speaker  a `speakerFor` result
 * @param {object} banks
 * @param {number} [step]  how many questions have been asked already
 * @returns {{key: string, label: string, text: string, id: number, subject: string}[]}
 */
export function topicsFor(speaker, banks, step = 0) {
  const { values, seed } = speaker;
  const topics = [];
  const rumour = lineFrom(banks.rumour, values, seed + 11, step);
  if (rumour) {
    const filled = fillSpeech(rumour.text, values);
    if (!filled.unfilled.length) {
      topics.push({ key: 'here', label: 'this place', text: filled.text, id: rumour.id, subject: 'the talk of this place' });
    }
  }
  if (speaker.place?.place) {
    const city = lineFrom(banks.city, values, seed + 29, step);
    if (city) {
      const filled = fillSpeech(city.text, values);
      if (!filled.unfilled.length) {
        topics.push({ key: 'city', label: speaker.place.place, text: filled.text, id: city.id, subject: `about ${speaker.place.place}` });
      }
    }
  }
  // **The way to the tavern, the shop, the guild and the palace** — the owner, 2026-10-19:
  // *"speaking with town npcs that are outside you need to be able to ask for directions for the
  // nearest tavern, shop, mages guild and palace"*. The street already knows where every building
  // is (`shops.js`'s `cityDoors` gives each door its kind, its name and its cell), and the scene
  // hands the nearest of each kind in as `speaker.nearby`; what this adds is Arena's own answer:
  // the **where-is bank** (`template.dat` #260, *"Oh, you'll find that %di of here"*), whose one
  // word `%di` is a compass direction and not a building. The direction is the bearing from the
  // player's feet to the door, on the automap's own eight sectors (`automapDirection`), so a player
  // finds the place by the same word the map's arrow uses.
  //
  // The sentence *after* Arena's prose is this project's, and it says so: it names the building and
  // its distance in metres, which is the part the original leaves to the map (bank #261 inscribes
  // the spot, and this port has no per-building map mark to inscribe).
  for (const entry of speaker.nearby ?? []) {
    const bearing = directionWord(entry.bearing);
    const line = lineFrom(banks.where.near, { ...values, di: bearing }, seed + 31 + topics.length, 0);
    const filled = line ? fillSpeech(line.text, { ...values, di: bearing }) : null;
    const arena = filled && !filled.unfilled.length ? filled.text : null;
    const metres = Math.max(1, Math.round(Number(entry.distance) || 0));
    const own = `${capitalised(entry.name ?? entry.label)} is ${bearing} of here, about ${metres} metres off.`;
    topics.push({
      key: `where:${entry.kind}`,
      label: entry.label,
      text: arena ? `${arena} ${own}` : own,
      id: line?.id ?? null,
      subject: `the way to ${entry.label}`,
      credit: arena ? null : 'this project\u2019s words \u2014 the where-is bank could not be filled',
    });
  }
  return topics;
}

/** `the nearest tavern` → `The nearest tavern`, for a sentence's own start. */
function capitalised(text) {
  const value = String(text ?? 'it');
  return value.charAt(0).toUpperCase() + value.slice(1);
}
