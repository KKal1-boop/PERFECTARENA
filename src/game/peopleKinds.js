// ARENA'S OTHER PEOPLE — the families the `xxNNNWLK` roster never matched.
//
// `townsfolk.js` reads the install's **armoured** folk: `01PLTWLK.CFA`…`15MAGWLK.CFA`,
// 89 files in ten sets, which the archive's own listing says are the *fighting* figures.
// They are not who lives in a town. The archive ships four more families of people beside
// them, and until now the port drew none of them — which is the reported "there are NPCs
// that are always still; we ported only the moving ones and are missing sprites because of
// that". Measured from `GLOBAL.BSA` itself (`BsaArchive#names()`), each file's own bytes
// read by `arena/cfa.js`:
//
//   `MLGEN0<view><action>.CFA`  the town's **men**: three actions per view — `W` walk (9
//                               frames at view 1, 6 at views 2…5, 52 px wide), `T` talk
//                               (9/43), `D` die (9/41)
//   `FMGEN<action>0<view>.CFA`  the town's **women**, the same three actions spelled with
//                               the letter *before* the view: `FMGEN0#` talk (9/…, ≈43–44
//                               wide), `FMGENW0#` walk (9 then 6, 58), `FMGEND0#` die (9/43)
//   `GUARD0<view>.CFA`          the **watch**: views 1–5 are 12-frame sheets — the
//                               monster layout (walk 0–5, look 6/7, attack 8–11) — and
//                               `GUARD06.CFA` is the death (3 frames)
//   `BABE0#`, `LGLIT0#`         the archive's remaining people sets: 12-frame view
//                               sheets for `BABE`, 3-frame ones for `LGLIT`
//
// ── THE DIGIT IS A DIRECTION, NOT A PERSON (D-47, and the reading that was wrong) ────────
//
// This module used to read `MLGEN01…MLGEN05` as **five different men**, one angle each, and
// said so in its own header. It is not: the digit is a **direction**, and Arena ships five of
// them per figure (its other three directions are the mirrored ones — see the provenance
// below). That mistake is visible to the player and is the owner's own report: *"some Npcs are
// not setted up well and they dont have a proper 360 walking animation or going around them
// 360 animation"* — the armoured roster and the watch turned as the eye moved, and the town's
// commoners could not, because each of them had been given a single file for **all** five
// angles. `MLGEN01…05` are one man seen from five sides; the same is true of `FMGENW01…05`.
//
// **PROVENANCE (the number is not this project's guess).** OpenTESArena (MIT) documents the
// human sprite template in `ExeData.h` as `0@XXX` — *"Replace '0@' with either 0 or 1 for the
// gender, and 1 to 5 depending on the kind of animation"* — and its creature template as
// *"Replace '@' with a number from 1 to 5 indicating which .CFA file to fetch for
// angle-relative animations"*; `ArenaAnimUtils::trySetHumanFilenameGender()` implements the
// leading digit as `filename[0] = isMale ? '0' : '1';` and `ArenaAnimUtils::Directions` is
// **8** with `FirstMirroredAnimID = 6`, so the five shipped files cover eight directions by
// mirroring three of them. The archive's own bytes agree: the five sets of one armour word
// run **40 / 55 / 69 / 56 / 38** px wide — symmetric about a profile, the same numbers for
// every armour word, every citizen action and the watch (`.scratch/viewsym.mjs`,
// `.scratch/peopleProbe.mjs`) — which is a figure *turning*, not five figures drawn alike.
// The gender digit's meaning is carried by `townsfolk.js`'s `outfitsFromFolk` (group `0` is a
// man's body, group `1` a woman's: `01CHNWLK` and `11CHNWLK` are one armour, two sexes).
//
// **`PAT#` is not a person, and reading it as one was a defect** (D-30: *"some npcs have
// enemy sprites like theres a minotaur guy somewhere"*). The executable's own creature-sheet
// table lists `pat@.cfa` in its creature run, at the index its creature-name table gives to the
// **Minotaur**, and the archive's `PAT` sheets carry the creature fingerprint (`12, 8, 8, 8,
// 8, 3` frames) where every person's carry twelve across (`12, 12, 12, 12, 12, 3`) or ship one
// figure's five directions. So `PAT` is `game/monsters.js`'s Minotaur — see
// `game/monsterArt.js` for the join and `monsters.js`'s header for the three ways it is
// checkable — and this module must not hand it to a town's crowd.
//
// **The action letters are read off the widths, not guessed.** A stride is wider than a
// stance in every one of these sheets — walk `52`/`58` px against talk `43`/`44` and die
// `41`/`43` — and the `W`/`T`/`D` in the male names says which is which outright; the
// female family uses the same three widths under the same letters (`W`, `D`) with the
// plain name for the talking pose. A family whose action letters the archive does not
// ship is left without that action rather than filled with another pose.
//
// Nothing here invents art: a kind is a **set of files the install actually has**, read by
// name, exactly the way `folkFromListing` reads the armoured roster.

/** Male generics: `MLGEN0<view><action>.CFA`, one action letter — one man, five directions. */
const MALE_GENERIC = /^MLGEN0([1-5])([WTD])\.CFA$/;
/** Female generics: `FMGEN<action>0<view>.CFA` — letter first, and the plain name talks. */
const FEMALE_GENERIC = /^FMGEN([WD]?)0([1-5])\.CFA$/;
/**
 * The watch and the archive's other view sheets: `<FAMILY><view>.CFA`, 1–5 the directions and 6
 * the death.
 *
 * `PAT` is deliberately absent: it is the Minotaur's own art (`game/monsters.js`), and a creature
 * in a town's crowd is D-30.
 */
const VIEW_SHEETS = Object.freeze({
  GUARD0: { view: /^GUARD0([1-6])\.CFA$/, label: 'a guard of the watch' },
  BABE0: { view: /^BABE0([1-6])\.CFA$/, label: 'a woman of the town' },
  LGLIT0: { view: /^LGLIT0([1-6])\.CFA$/, label: 'a small figure of the LGLIT set' },
});

/** The five directions the archive ships, in its own order: `1` faces the eye, `5` shows the back. */
const DIRECTIONS = Object.freeze([1, 2, 3, 4, 5]);

/**
 * @typedef {object} PersonKind
 * @property {string} key           stable id, e.g. `MLGEN`
 * @property {string} label         what the file's own name says the figure is
 * @property {Record<number,string>} views  direction 1…5 → walk sheet (what `viewFileFor` hands back)
 * @property {{walk?: Record<number,string>, talk?: Record<number,string>, die?: Record<number,string>}} actions
 *   each action as a **direction → file** reading, because Arena draws one figure from five sides:
 *   `actions.talk[3]` is what a man plays while the player stands at his left
 * @property {'view'|'action'} layout  what a *sheet* of this kind is: `view` means Arena's
 *   twelve-frame layout (walk 0–5, look 6/0/7/0, attack 8–11) and a stride of six; `action` means
 *   one animation per file, so the whole sheet is the stride. Measured off the archive (the probe
 *   is `.scratch/peopleProbe.mjs`): the five-direction sheets carry **12** frames and the action
 *   families **6 or 9**. **Read here rather than guessed in the scene**, because it is a fact
 *   about the file: a walking guard used to play frames 0…11, i.e. its own head-turn and its
 *   sword-swing as part of its stride (D-42).
 * @property {string[]} files       every file this kind draws from, for loading
 *
 * There is no `fighter` flag: whether a kind can fight is a fact about the **loaded
 * sheet's frame count** (the twelve-frame families carry the attack layout, the nine and
 * three-frame ones do not), and the scene is where the frames are actually in hand.
 */

/**
 * Read every people family the archive ships, in a stable order.
 *
 * @param {string[]} names  every record name in the archive (`BsaArchive#names()`)
 * @returns {PersonKind[]}
 */
export function peopleKindsFromListing(names) {
  /** @type {Map<string, {views: Record<number,string>, actions: Record<string, Record<number,string>>, label: string}>} */
  const byKey = new Map();
  const kind = (key, label) => {
    let found = byKey.get(key);
    if (!found) byKey.set(key, found = { views: {}, actions: {}, label });
    return found;
  };
  const put = (entry, action, view, file) => {
    const map = entry.actions[action] ?? (entry.actions[action] = {});
    map[view] ??= file;
    if (action === 'walk') entry.views[view] ??= file;
  };

  for (const name of names ?? []) {
    const upper = String(name).toUpperCase();

    const male = MALE_GENERIC.exec(upper);
    if (male) {
      const entry = kind('MLGEN', 'a man of the town');
      const action = male[2] === 'W' ? 'walk' : male[2] === 'T' ? 'talk' : 'die';
      put(entry, action, Number(male[1]), upper);
      continue;
    }

    const female = FEMALE_GENERIC.exec(upper);
    if (female) {
      const entry = kind('FMGEN', 'a woman of the town');
      const action = female[1] === 'W' ? 'walk' : female[1] === 'D' ? 'die' : 'talk';
      put(entry, action, Number(female[2]), upper);
      continue;
    }

    for (const [family, spec] of Object.entries(VIEW_SHEETS)) {
      const match = spec.view.exec(upper);
      if (!match) continue;
      // One kind per family: its five directions and its death are one person's art.
      const entry = kind(family, spec.label);
      const view = Number(match[1]);
      if (view === 6) put(entry, 'die', 1, upper);
      else put(entry, 'walk', view, upper);
    }
  }

  const out = [];
  for (const [key, entry] of byKey) {
    if (!Object.keys(entry.views).length && !entry.actions.die) continue;
    // **The layout, from the family the name spells.** A `VIEW_SHEETS` family is the twelve-frame
    // one (the watch, and `BABE`); the male and female generics are one action per file.
    const layout = Object.hasOwn(VIEW_SHEETS, key) ? 'view' : 'action';
    // A direction the archive does not ship falls back to the front sheet, the same rule
    // `outfitsFromFolk` applies to an incomplete armour family — and **to the same person's
    // direction 1**, never another figure's, because there is only one figure.
    const firstKey = (map) => Object.keys(map).map(Number).sort((a, b) => a - b)[0];
    if (!Object.keys(entry.views).length) entry.views[1] = entry.actions.die?.[1];
    const walkFallback = entry.views[1] ?? entry.views[firstKey(entry.views)];
    for (const view of DIRECTIONS) entry.views[view] ??= walkFallback;
    const actions = {};
    for (const [action, map] of Object.entries(entry.actions)) {
      if (!Object.keys(map).length) continue;
      const fallback = map[1] ?? map[firstKey(map)];
      const filled = {};
      for (const view of DIRECTIONS) filled[view] = map[view] ?? fallback;
      actions[action] = filled;
    }
    out.push({
      key,
      label: entry.label,
      views: entry.views,
      actions,
      layout,
      files: [...new Set([
        ...Object.values(entry.views),
        ...Object.values(actions).flatMap((map) => Object.values(map)),
      ].filter(Boolean))],
    });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * THE RACES THIS INSTALL HAS NO CITIZEN ART FOR, and the art that stands in for them.
 *
 * The owner's own words: *"in blackmarsh i want lizard mans repurpused as npcs to simulate
 * argonians"*. This archive draws exactly one human body (`MLGEN`/`FMGEN` and the armoured
 * roster) and ships no palette to recolour it by race, so a province's folk cannot be drawn
 * with their own skin — with **one** exception, and it is the one the owner named: the marsh's
 * people are lizard-folk in the later games, and Arena ships the creature that looks like them,
 * `LIZARD1.CFA`…`LIZARD6.CFA` (measured: five directions of 12/8/8/8/8 frames and a 3-frame
 * death — the creature shape `game/monsterArt.js` reads for the Minotaur).
 *
 * **This is a substitution and it says so.** The figure is Arena's own art, drawn from Arena's
 * own files; the *name* on it (`label`) is this project's, because Arena calls these sheets a
 * monster and this is a shopkeeper. Nothing else in the crowd is invented.
 *
 * @type {ReadonlyArray<{key: string, label: string, sheets: string, note: string}>}
 */
export const RACE_STAND_INS = Object.freeze([
  {
    key: 'ARGONIAN',
    label: 'a lizard-folk of the marsh',
    sheets: 'LIZARD',
    note: "the Lizard Man's own sheets (LIZARD1\u20265 + its death) stand in for the Argonians this install does not draw",
  },
]);

/**
 * Read the stand-in figures this install can actually draw (**B11**, D-45).
 *
 * A stand-in is a **kind** like any other, so the whole crowd path already knows what to do with
 * it: the five directions come from the creature's five sheets (index 6 is its death, which is
 * Arena's own rule — *"Death state is only in the last .CFA file"*, and `game/monsters.js` draws
 * it the same way), and the layout is Arena's twelve-frame one.
 *
 * A stand-in whose sheets this install lacks is **not invented**: it is left out, so a province
 * that asked for it simply keeps the human art it would otherwise have.
 *
 * @param {string[]} names  every record name in the archive (`BsaArchive#names()`)
 * @returns {PersonKind[]}
 */
export function standInKindsFromListing(names) {
  const have = new Set((names ?? []).map((n) => String(n).toUpperCase()));
  const out = [];
  for (const spec of RACE_STAND_INS) {
    const views = {};
    for (const view of DIRECTIONS) {
      const file = `${spec.sheets}${view}.CFA`;
      if (have.has(file)) views[view] = file;
    }
    const death = `${spec.sheets}6.CFA`;
    if (!Object.keys(views).length) continue;
    const walk = views[1] ?? Object.values(views)[0];
    for (const view of DIRECTIONS) views[view] ??= walk;
    const actions = { walk: { ...views } };
    if (have.has(death)) actions.die = Object.fromEntries(DIRECTIONS.map((v) => [v, death]));
    out.push({
      key: spec.key,
      label: spec.label,
      views,
      actions,
      layout: 'view',
      files: [...new Set([...Object.values(views), ...Object.values(actions).flatMap((m) => Object.values(m))])],
    });
  }
  return out;
}

/**
 * What a kind plays for one action, seen from one direction.
 *
 * A kind's action is a **direction → file** reading (the archive draws one figure from five
 * sides), so the scene must ask by the direction the eye is in — `viewFacing` answers 1…5 — and
 * the answer falls back to the front sheet when the archive ships nothing for that direction.
 *
 * @param {PersonKind} kind
 * @param {'walk'|'talk'|'die'} action
 * @param {number} view  direction 1…5
 * @returns {string|null}
 */
export function actionFile(kind, action, view) {
  const map = kind?.actions?.[action];
  if (!map) return null;
  const v = Math.min(5, Math.max(1, Math.trunc(view) || 1));
  return map[v] ?? map[1] ?? Object.values(map)[0] ?? null;
}

/**
 * What a file name says its figure is — for the families this module reads.
 *
 * A person in the port is described by what the archive's own name says they are, and
 * never given more: the armoured `xxNNNWLK` roster is described by `townsfolk.js` from its
 * armour word, and these four families are described from the family the name spells.
 *
 * @param {string} file e.g. `MLGEN02W.CFA`, `GUARD03.CFA`
 * @returns {string|null} the label, or `null` when the name is not one of these families
 */
export function labelForFile(file) {
  const upper = String(file).toUpperCase();
  const female = /^FMGENW?D?0([1-5])\.CFA$/.test(upper) || /^FMGEND0([1-5])\.CFA$/.test(upper);
  if (female) return 'a woman of the town';
  if (/^MLGEN0([1-5])[WTD]\.CFA$/.test(upper)) return 'a man of the town';
  if (/^GUARD0([1-6])\.CFA$/.test(upper)) return 'a guard of the watch';
  if (/^BABE0([1-6])\.CFA$/.test(upper)) return 'a woman of the town';
  if (/^LGLIT0([1-6])\.CFA$/.test(upper)) return 'a small figure of the LGLIT set';
  // `PAT#` answers `null` on purpose — it is the Minotaur's art, and a label here would put it
  // back in the crowd as a person (D-30).
  if (/^PAT([1-6])\.CFA$/.test(upper)) return null;
  return null;
}

/**
 * The five directions of a kind, in the archive's own order.
 * @param {PersonKind} kind @param {number} view 1…5
 * @returns {string|null}
 */
export function kindViewFile(kind, view) {
  const v = Math.min(5, Math.max(1, Math.trunc(view) || 1));
  return kind?.views?.[v] ?? kind?.views?.[1] ?? null;
}
