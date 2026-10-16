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
//   `MLGEN0<set><action>.CFA`   the town's **men**: five figures (sets 1–5), each with
//                               three actions — `W` walk (9 frames, 52 px wide), `T` talk
//                               (9, 43), `D` die (9, 41) — and **one angle each**, which is
//                               how Arena drew its commoners
//   `FMGEN<action>0<set>.CFA`   the town's **women**, the same five figures and three
//                               actions spelled with the letter *before* the set:
//                               `FMGEN0#` talk (9, ≈43–44 wide), `FMGENW0#` walk (9, 58),
//                               `FMGEND0#` die (9, 43)
//   `GUARD0<view>.CFA`          the **watch**: views 1–5 are 12-frame sheets — the
//                               monster layout (walk 0–5, look 6/7, attack 8–11) — and
//                               `GUARD06.CFA` is the death (3 frames)
//   `BABE0#`, `LGLIT0#`         the archive's remaining people sets: 12-frame view
//                               sheets for `BABE`, 3-frame ones for `LGLIT`
//
// **`PAT#` is not a person, and reading it as one was a defect** (D-30: *"some npcs have
// enemy sprites like theres a minotaur guy somewhere"*). The executable's own creature-sheet
// table lists `pat@.cfa` in its creature run, at the index its creature-name table gives to the
// **Minotaur**, and the archive's `PAT` sheets carry the creature fingerprint (`12, 8, 8, 8,
// 8, 3` frames) where every person's carry twelve across (`12, 12, 12, 12, 12, 3`) or ship one
// angle. So `PAT` is `game/monsters.js`'s Minotaur — see `game/monsterArt.js` for the join and
// `monsters.js`'s header for the three ways it is checkable — and this module must not hand it
// to a town's crowd.
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

/** Male generics: `MLGEN0<set><action>.CFA`, one action letter. */
const MALE_GENERIC = /^MLGEN0([1-5])([WTD])\.CFA$/;
/** Female generics: `FMGEN<action>0<set>.CFA` — letter first, and the plain name talks. */
const FEMALE_GENERIC = /^FMGEN([WD]?)0([1-5])\.CFA$/;
/**
 * The watch and the archive's other view sheets: `<FAMILY><view>.CFA`, 1–5 the angles and 6 the
 * death.
 *
 * `PAT` is deliberately absent: it is the Minotaur's own art (`game/monsters.js`), and a creature
 * in a town's crowd is D-30.
 */
const VIEW_SHEETS = Object.freeze({
  GUARD0: { view: /^GUARD0([1-6])\.CFA$/, label: 'a guard of the watch' },
  BABE0: { view: /^BABE0([1-6])\.CFA$/, label: 'a woman of the town' },
  LGLIT0: { view: /^LGLIT0([1-6])\.CFA$/, label: 'a small figure of the LGLIT set' },
});

/**
 * @typedef {object} PersonKind
 * @property {string} key           stable id, e.g. `MLGEN03`
 * @property {string} label         what the file's own name says the figure is
 * @property {Record<number,string>} views  angle 1…5 → walk sheet (what `viewFileFor` hands back)
 * @property {{walk?: string, talk?: string, die?: string}} actions
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
  /** @type {Map<string, {views: Record<number,string>, actions: object, label: string, fighter: boolean}>} */
  const byKey = new Map();
  const kind = (key, label) => {
    let found = byKey.get(key);
    if (!found) byKey.set(key, found = { views: {}, actions: {}, label, fighter: false });
    return found;
  };

  for (const name of names ?? []) {
    const upper = String(name).toUpperCase();

    const male = MALE_GENERIC.exec(upper);
    if (male) {
      const entry = kind(`MLGEN0${male[1]}`, 'a man of the town');
      const action = male[2] === 'W' ? 'walk' : male[2] === 'T' ? 'talk' : 'die';
      entry.actions[action] = upper;
      // Walk sheets are the five angles: for the male family the *set* digits say which
      // angle a sheet is, and the file name carries no separate view digit.
      if (action === 'walk') entry.views[1] = upper;
      continue;
    }

    const female = FEMALE_GENERIC.exec(upper);
    if (female) {
      const entry = kind(`FMGEN0${female[2]}`, 'a woman of the town');
      const action = female[1] === 'W' ? 'walk' : female[1] === 'D' ? 'die' : 'talk';
      entry.actions[action] = upper;
      if (action === 'walk') entry.views[1] = upper;
      continue;
    }

    for (const [family, spec] of Object.entries(VIEW_SHEETS)) {
      const match = spec.view.exec(upper);
      if (!match) continue;
      // One kind per family: its five angles and its death are one person's art.
      const entry = kind(family, spec.label);
      const view = Number(match[1]);
      if (view === 6) entry.actions.die = upper;
      else entry.views[view] = upper;
    }
  }

  const out = [];
  for (const [key, entry] of byKey) {
    if (!Object.keys(entry.views).length && !entry.actions.die) continue;
    // A kind with only one angle still needs the five: the archive's own fallback rule,
    // the same one `outfitsFromFolk` applies to an incomplete armour family.
    const walk = entry.actions.walk ?? entry.views[1];
    for (let view = 1; view <= 5; view++) entry.views[view] ??= walk;
    out.push({
      key,
      label: entry.label,
      views: entry.views,
      actions: { ...entry.actions },
      files: [...new Set([...Object.values(entry.views), ...Object.values(entry.actions)].filter(Boolean))],
    });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
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
 * The five angles of a kind, in the archive's own view order.
 * @param {PersonKind} kind @param {number} view 1…5
 * @returns {string|null}
 */
export function kindViewFile(kind, view) {
  const v = Math.min(5, Math.max(1, Math.trunc(view) || 1));
  return kind?.views?.[v] ?? kind?.views?.[1] ?? null;
}
