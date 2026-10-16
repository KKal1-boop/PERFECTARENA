// WHICH ART A CREATURE IS DRAWN FROM — the join between the executable's two tables (**block B24**).
//
// The executable keeps two tables side by side, and this module is the rule that reads them
// together (`arena/exeTables.js` finds them; this is what they mean):
//
//   * **the creature names** — `Rat`, `Goblin`, `Lizard Man`, `Wolf`, `Snow Wolf`, `Orc`,
//     `Skeleton`, **`Minotaur`**, `Spider`, … (twenty-three of them, then the class names);
//   * **the creature sheets** — `rat@.cfa`, `goblin@.cfa`, `lizard@.cfa`, `wolf0@.cfa`,
//     `swolf0@.cfa`, `orc@.cfa`, `skele@.cfa`, **`pat@.cfa`**, `spider@.cfa`, … (twenty-four,
//     the last being `tharn0@.cfa`, the boss's own art).
//
// **A sheet belongs to the name at its own index**, and that is a claim this module checks rather
// than assumes: the sheet's family is a *compressed spelling* of the creature's name — Arena's art
// drops vowels and shortens (`Skeleton` → `skele`, `Homonculus` → `hom`, `Snow Wolf` → `swolf0`,
// `Hell Hound` → `hound`, `Fire Daemon` → `deamon`, misspelt and all) — so `sheetSpellsName` tests
// the family as a subsequence of the name and the pairing reports how many agree. **Twenty-one of
// the twenty-three do.** The two that do not are:
//
//   * **index seven — `Minotaur` against `pat@.cfa`.** The port draws no Minotaur at all, so this
//     is the pair with nothing behind it, and the pair the whole module exists for;
//   * index nineteen — `Fire Daemon` against `deamon@.cfa`, where the *file name* misspells its own
//     creature (`daemon` → `deamon`). `game/monsters.js` spells the sheet `DEAMON` and has all
//     along, so this disagreement is the table's spelling, not a lost creature — and the audit
//     says so by naming what each disagreed sheet is drawn by.
////
// That single disagreement is the point of the whole module. `game/monsters.js` had carried the
// Minotaur with no `sprite` at all on the strength of a search for `MINO*.CFA` in `GLOBAL.BSA`
// (there is none — only a `MINOTAUR.VOC`), which cost the port the creature twice over: the
// Minotaur was dropped from every roster that filters on art, and the archive's own `PAT1.CFA`…
// `PAT6.CFA` were handed to the **town crowd** as a person's walk sheets (`game/peopleKinds.js`),
// which is what the owner saw when they reported *"some npcs have enemy sprites like theres a
// minotaur guy somewhere"*.
//
// **The third signal is the archive's own frames**, and it is the one that has to be stated
// carefully rather than prettily, because it is *not* a clean creature/person discriminator. The
// measured fingerprints of the archive's six sheets per family:
//
//   `12, 8, 8, 8, 8, 3`  twenty-one of the twenty-three creature families — `goblin`, `skele`,
//                        `spider`, `ghoul`, `hound`, `ghost`, `zombie`, `troll`, `wraith`, `hom`…
//                        (the homunculus is not one of them), **and `PAT`**
//   `12, 12, 12, 12, 12, 3`  the rat — and also the watch (`GUARD0`) and the townswoman (`BABE0`),
//                        so this shape alone says nothing
//   `12, 6, 6, 6, 6, 3`  the homunculus
//   `3, 3, 3, 3, 3, 3`   the small `LGLIT0` figures
//
// `PAT` carries `12, 8, 8, 8, 8, 3`: **the creature shape, which no person's sheets carry** (a
// person's are twelve across, nine for the one-angle commoners, or three for the small set). The
// rat sharing the watch's shape is why this is corroboration and not proof on its own — the proof
// is the executable's own two tables read index by index, and the rat is the reminder to say so.

/** The frame counts twenty-one of the creature families' six sheets carry: walk, four angles, death. */
export const CREATURE_LAYOUT = Object.freeze([12, 8, 8, 8, 8, 3]);
/** …and what a person's carry — the watch and the townswoman, which the rat happens to match. */
export const FOLK_LAYOUT = Object.freeze([12, 12, 12, 12, 12, 3]);

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Does this figure's six sheets carry the creature layout? @param {number[]} frames */
export function isCreatureLayout(frames) { return same(frames, CREATURE_LAYOUT); }
/** …the person's? @param {number[]} frames */
export function isFolkLayout(frames) { return same(frames, FOLK_LAYOUT); }

/**
 * Which layout six sheets' frame counts spell, or `null` for a figure that is neither (the
 * one-angle commoners have no six-view shape to match, and the homunculus and the small `LGLIT0`
 * figures have shapes of their own).
 * @param {number[]} frames  view 1…6, in order
 * @returns {'creature'|'folk'|null}
 */
export function layoutOf(frames) {
  if (isCreatureLayout(frames)) return 'creature';
  if (isFolkLayout(frames)) return 'folk';
  return null;
}

/** A name reduced to the letters and digits that matter for matching: `'Hell Hound'` → `'hellhound'`. */
export function artNameKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The family a sheet template names: `'pat@.cfa'` → `'pat'`, `'swolf0@.cfa'` → `'swolf0'`.
 * @param {string} template
 * @returns {string|null}
 */
export function sheetFamily(template) {
  const match = /^([a-z0-9]+)@[a-z]*\.cfa$/i.exec(String(template ?? ''));
  return match ? match[1].toLowerCase() : null;
}

/**
 * Is the sheet's family a compressed spelling of the creature's name?
 *
 * The test is a **subsequence**, which is what Arena's own file names are: `skele` inside
 * `skeleton`, `swolf` inside `snowwolf`, `deamon` inside `firedaemon` (the file name's own
 * misspelling), `hom` inside `homonculus`. Trailing digits are dropped first, because `wolf0`,
 * `swolf0` and `tharn0` number a family rather than name it.
 *
 * @param {string} template  e.g. `skelE@.cfa`'s `skele`
 * @param {string} name      e.g. `Skeleton`
 */
export function sheetSpellsName(template, name) {
  const family = (sheetFamily(template) ?? '').replace(/\d+$/, '');
  const key = artNameKey(name).replace(/\d+$/, '');
  if (!family || !key) return false;
  let at = 0;
  for (const ch of family) {
    at = key.indexOf(ch, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}

/**
 * The executable's two tables read as pairs, index by index — with the agreements counted, because
 * the pairing is only worth anything if something checks it.
 *
 * @param {{creatureNames: string[], creatureSheets: string[]}} tables
 *   `creatureNames` is `exeTables.splitBestiary(exeTables(image)).creatures`
 * @returns {{index: number, name: string, sheet: string, agrees: boolean}[]}
 */
export function creatureArtPairs({ creatureNames, creatureSheets }) {
  const names = creatureNames ?? [];
  const sheets = creatureSheets ?? [];
  const count = Math.min(names.length, sheets.length);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ index: i, name: names[i], sheet: sheets[i],
      agrees: sheetSpellsName(sheets[i], names[i]) });
  }
  return out;
}

/**
 * The whole reading, in the shape a test, a browser suite or a doc row can hold: every pair, the
 * ones that agree, the ones that do not, the sheets no name claimed, and — against the port's own
 * list — which monster draws from which sheet and which of them the executable's tables leave
 * without one.
 *
 * @param {object[]} monsters  `game/monsters.js`'s `MONSTERS`
 * @param {{creatureNames?: string[], creatureSheets?: string[]}} tables
 * @returns {object}
 */
export function monsterArtAudit(monsters, tables) {
  const creatureNames = tables?.creatureNames ?? [];
  const creatureSheets = tables?.creatureSheets ?? [];
  const pairs = creatureArtPairs({ creatureNames, creatureSheets });
  const agreed = pairs.filter((p) => p.agrees);
  const claimed = new Set(agreed.map((p) => p.sheet));
  const spriteOf = (name) => (monsters ?? [])
    .find((m) => artNameKey(m.name) === artNameKey(name))?.sprite ?? null;
  // A pair whose *spelling* disagrees may still be the sheet the port draws from — `deamon@.cfa`
  // against `Fire Daemon` is the file name's own misspelling, and `game/monsters.js` spells it
  // `DEAMON` already. Saying which is which is the difference between "the table disagrees" and
  // "this creature has no art", and those are very different findings.
  const disagreed = pairs.filter((p) => !p.agrees)
    .map((p) => ({ ...p, drawnBy: spriteOf(p.name) }));

  const rows = (monsters ?? []).map((monster) => {
    const at = creatureNames.findIndex((name) => artNameKey(name) === artNameKey(monster.name));
    const sheet = at >= 0 && at < creatureSheets.length ? creatureSheets[at] : null;
    return {
      id: monster.id,
      name: monster.name,
      sprite: monster.sprite ?? null,
      exeSheet: sheet,
      exeFamily: sheet ? sheetFamily(sheet) : null,
      // What the executable's tables say the art is, against what the port draws from.
      agrees: sheet ? artNameKey(sheetFamily(sheet)) === artNameKey(monster.sprite) : null,
      namedInExe: at >= 0,
    };
  });

  return {
    pairs,
    agreed: agreed.length,
    disagreed,
    // Sheets the agreeing pairs did not claim: the Minotaur's `pat@.cfa` (nothing draws it), the
    // Fire Daemon's `deamon@.cfa` (a misspelling the port already uses), and `tharn0@.cfa`, the
    // boss's own art, whose name the creature table does not hold because Jagar Tharn is not a
    // common creature.
    unclaimedSheets: creatureSheets.filter((s) => !claimed.has(s)),
    monsters: rows,
    // The monsters the port draws from no sheet of the executable's — the Minotaur before this
    // block's fix, and nothing else.
    withoutExeArt: rows.filter((r) => r.sprite === null).map((r) => r.name),
    // …and the monsters whose port sheet is not the one the pairing names.
    spriteDisagreements: rows.filter((r) => r.agrees === false).map((r) => r.name),
  };
}

/**
 * The executable's creature order against the port's `.INF` monster slots — the check that turns
 * the creature table into the **roster** table.
 *
 * A shipped `.INF` names its creatures by *item number* (`32`…`54`, `game/dungeonItems.js`), and
 * that module reads which creature each slot is from the flat's own art file (`RAT.DFA`,
 * `LIZRDMAN.DFA`, `SKELETON.DFA`, …) — a reading made from the install's bytes, years before this
 * block opened the executable. The executable's creature table is twenty-three names long; the
 * slots are twenty-three numbers wide. **Read together they are the same table**: slot `32 + i` is
 * the creature at index `i`, for all twenty-three, `Minotaur` at `39` where the port's own art
 * reading put it (`OGRE.DFA` — the one art name the game kept from another creature, which is why
 * the port's comment had to explain it rather than quote it).
 *
 * Nothing here is assumed: the audit reports every slot and which ones disagree, so a build whose
 * order differs says so instead of being quietly absorbed.
 *
 * @param {Record<number, {monster?: string}|string>} slots  `dungeonItems.DUNGEON_MONSTERS`
 * @param {string[]} creatureNames  the executable's own creature order
 * @returns {{rows: object[], agreed: number, first: number, last: number}}
 */
export function monsterSlotAudit(slots, creatureNames) {
  const items = Object.keys(slots ?? {}).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const first = items.length ? items[0] : 0;
  const names = creatureNames ?? [];
  const rows = items.map((item, i) => {
    const entry = slots[item];
    const id = typeof entry === 'string' ? entry : entry?.monster ?? null;
    const exeName = names[i] ?? null;
    return { item, id, exeName,
      agrees: exeName !== null && artNameKey(exeName) === artNameKey(id) };
  });
  return { rows, agreed: rows.filter((r) => r.agrees).length,
    first, last: items.length ? items[items.length - 1] : 0 };
}
