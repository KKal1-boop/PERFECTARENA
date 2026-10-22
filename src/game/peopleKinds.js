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
//   `MLGEN0<view><action>.CFA`  the town's **men**: `W` and `T` are **two men**, each from
//                               five sides (9 frames at view 1, 6 at views 2…5) — 52 px wide
//                               for `W`, 43 for `T` — and `D` is the death (9/41)
//   `FMGEN<action>0<view>.CFA`  the town's **women**, the letter *before* the view:
//                               `FMGENW0#` one woman's walk (9 then 6, 58), `FMGEN0#` the
//                               other woman's walk (9/…, 43–44), `FMGEND0#` the death (9/43)
//
// **`W` and `T` are two people** (measured 2026-10-18, `.scratch/measure3.mjs`): they paint
// different clothes from different palette runs and both animate a stride, so the digit is a
// direction and the letter names the *figure* as well as its action. The port used to read `T`
// (and the plain `FMGEN0#`) as a talking pose of the `W` figure and never drew them — which is
// why the owner saw only two of the four citizen figures on the street.
//   `GUARD0<view>.CFA`          the **watch**: views 1–5 are 12-frame sheets — the
//                               monster layout (walk 0–5, look 6/7, attack 8–11) — and
//                               `GUARD06.CFA` is the death (3 frames)
//   `BABE0#`                    the other woman of the town: 12-frame view sheets, a
//                               blonde figure in a blue dress
//
//   A seventh family was read here and is **not** one: `LGLIT0#` is a rod of light on a stand
// (24×60, every pixel one gold), not a person — measured 2026-10-18 and written down at
// `VIEW_SHEETS` below.
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

/**
 * **THE INSTALL'S STATIC PEOPLE — one picture of a person, not a walk cycle.**
 *
 * The owner, 2026-10-17: *"there are a lot of missing sprites for the game that most of the time
 * were static npcs in the original game that were not ported … like AR-sprite-GUARD1D.png
 * AR-sprite-KING.png AR-sprite-MAN01.png and much more man02 etc that are sitting at the tavern"*.
 *
 * Those UESP names are Arena's own art: the town's men, women, watch, king, barkeeps and trades are
 * drawn on **one sheet each** — a figure standing — and the game's own `.INF` files place them by
 * name. Three of them are named in this project's own scene comments already, which is what makes
 * the family list below the install's and not a guess:
 * `EQUIP.INF`'s armourer is `SMITH.DFA`, `TAVERN.INF`'s is `BARTEND.DFA` *"with `MUSIC1/2` and
 * `MAN01…04`/`WOMAN01…04` for the drinkers"*, and `TEMPLE.INF`'s is `PREST1.DFA`
 * (`scenes/interior.js`, `game/dungeonItems.js`).
 *
 * **Why a separate reading and not a `PersonKind` in the crowd.** A crowd kind is a *walking*
 * figure: five directions, a talk and a death, a sheet layout (see `PersonKind` above). A static
 * people sheet is one picture with none of that, so putting it in `peopleKindsFromListing` would
 * hand the town's crowd a person that cannot walk, turn or fall. It is read by its own function
 * (`staticKindsFromListing`) and marked `static: true`, so a caller that draws figures on the
 * ground and a caller that draws a picture in a panel can each ask for the half they mean.
 *
 * Every entry is a **name the install ships** — a kind exists only when the archive really has a
 * record for it, and a family with no record produces no kind — and the label is read off the
 * family word the name spells, never invented: `KING` is the king, `GUARD1D` a guard of the watch,
 * `MAN01` a man of the town. The digits are **variants of one family** (`MAN01…04` are four men in
 * a tavern, which is how `TAVERN.INF` lists them), not directions — that is the same trap D-47
 * records for `MLGEN0#`, and here the letter a `GUARD1D`-shaped name carries is a sheet variant
 * rather than an angle, so the variants are kept as the family's own file list.
 *
 * The single-digit `GUARD0#.CFA` **view sheets are excluded on purpose**: those are the walking
 * watch, already read by `VIEW_SHEETS` below, and matching them here would name one figure twice.
 */
export const STATIC_PEOPLE_FAMILIES = Object.freeze([
  { key: 'MAN', label: 'a man of the town, standing', match: /^MAN(\d{1,2})\.(IMG|CFA|DFA)$/ },
  { key: 'WOMAN', label: 'a woman of the town, standing', match: /^WOMAN(\d{1,2})\.(IMG|CFA|DFA)$/ },
  { key: 'GUARD', label: 'a guard of the watch, standing', match: /^GUARD(\d)([A-D])\.(IMG|CFA|DFA)$/ },
  { key: 'KING', label: 'the king', match: /^KING\.(IMG|CFA|DFA)$/ },
  { key: 'BARTEND', label: 'a barkeep', match: /^BARTEND(\d)?\.(IMG|CFA|DFA)$/ },
  { key: 'SMITH', label: 'an armourer', match: /^SMITH(\d)?\.(IMG|CFA|DFA)$/ },
  { key: 'PREST', label: 'a priest', match: /^PREST(\d)?\.(IMG|CFA|DFA)$/ },
  { key: 'NOBLE', label: 'a noble', match: /^NOBLE(\d{1,2})?\.(IMG|CFA|DFA)$/ },
  { key: 'BEGGAR', label: 'a beggar', match: /^BEGGAR(\d)?\.(IMG|CFA|DFA)$/ },
  { key: 'CHILD', label: 'a child of the town', match: /^CHILD(\d)?\.(IMG|CFA|DFA)$/ },
]);

/** Male generics: `MLGEN0<view><action>.CFA` — `W`/`T` two men, `D` the death, five directions each. */
const MALE_GENERIC = /^MLGEN0([1-5])([WTD])\.CFA$/;
/** Female generics: `FMGEN<action>0<view>.CFA` — letter first; `W` one woman, plain another. */
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
  // **`LGLIT` is not a person** (measured 2026-10-18, `.scratch/peoplecolors.mjs`): the five
  // sheets are 24×60, three frames, and **every pixel is palette entry 223 — `#ffb800`, one flat
  // gold** — a rod of light on a stand, not a figure. It read as a kind here because its name is
  // in the same family shape as `BABE0`, so the town's crowd could stand a glowing bar in the
  // street labelled "a small figure of the LGLIT set". The owner: *"its litterally a rod of light
  // and he should not be an npc"*. The install's own lamp art is drawn by the scenery pass
  // (`SCOLUMN*`, `SLAMP*`, the fire flats), so nothing is lost by dropping it.
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
      // **`T` is a second man, not a talking pose of the first** (2026-10-18). The owner:
      // *"FMGEN01CFA and MLGEN01TCFA … arent being used at all to create moving npcs only theyr
      // counterparts MLGEN01WCFA and FMGENW01CFA are being used and this is not good because
      // undermines the variety of the npcs"*. Measured, the two sheets are two figures —
      // `MLGEN01W` paints its tunic on palette indices 148/32/151/130, `MLGEN01T` a green shirt
      // with a red sash on 162/161/164/165 — and **both animate a stride**: frame-to-frame changes
      // in the lower body are 282/326/291/280/241/798 for `W` and 253/298/302/253/245/172 for
      // `T` over the same six frames. So `T` is its own walking citizen (`MLGENT`), and the port
      // gains a second unarmoured man on the street instead of a talk sheet nothing drew.
      const view = Number(male[1]);
      if (male[2] === 'T') {
        put(kind('MLGENT', 'a man of the town, in a tunic'), 'walk', view, upper);
      } else if (male[2] === 'D') {
        put(kind('MLGEN', 'a man of the town'), 'die', view, upper);
        put(kind('MLGENT', 'a man of the town, in a tunic'), 'die', view, upper);
      } else {
        put(kind('MLGEN', 'a man of the town'), 'walk', view, upper);
      }
      continue;
    }

    const female = FEMALE_GENERIC.exec(upper);
    if (female) {
      // The same reading on the women: `FMGENW01` is the blue-coated walker and the plain
      // `FMGEN01` is another woman (a red bodice and a grey skirt) whose frames stride too
      // (717/480/599/397/461/453 in the lower body) — two women for the street, not one woman
      // and her talk pose.
      const view = Number(female[2]);
      const walking = kind('FMGENW', 'a woman of the town');
      if (female[1] === 'D') {
        put(walking, 'die', view, upper);
        put(kind('FMGEN', 'a woman of the town, in a bodice'), 'die', view, upper);
      } else if (female[1] === 'W') {
        put(walking, 'walk', view, upper);
      } else {
        put(kind('FMGEN', 'a woman of the town, in a bodice'), 'walk', view, upper);
      }
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
  {
    // The owner, 2026-10-18: *"you might instead of coloring people for khajeets you might uuse the
    // white wolf sprite make it orange with stripes and use it as a khajeet npc to make it more
    // lore accurate"*. The snow wolf (`SWOLF01.CFA`…`SWOLF06.CFA`) is the install's only
    // five-direction feline-shaped figure; its white coat is repainted tawny by
    // `raceSkin.js`'s `KHAJIIT_FUR`, and the sheets' own layout is the creature one (walk 0–5,
    // attack 8–11, death in file 6), which this table marks as `view`.
    key: 'KHAJIIT',
    label: 'a cat-folk of the Elsweyr sands',
    // **Zero-padded, unlike the Lizard Man**: the archive's wolf sheets are `SWOLF01.CFA`…
    sheets: 'SWOLF0',
    note: "the snow wolf's own sheets (SWOLF01\u20266 + its death) stand in for the Khajiit this install does not draw, repainted orange with stripes",
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
 * Read every **static** people family the archive ships (**D-48**: the figures that stand still).
 *
 * @param {string[]} names  every record name in the archive (`BsaArchive#names()`)
 * @returns {Array<{key: string, label: string, static: true, layout: 'static', files: string[]}>}
 *   one entry per family the install really ships, in the order of `STATIC_PEOPLE_FAMILIES`
 */
export function staticKindsFromListing(names) {
  const have = (names ?? []).map((n) => String(n).toUpperCase());
  const out = [];
  for (const family of STATIC_PEOPLE_FAMILIES) {
    const files = [...new Set(have.filter((name) => family.match.test(name)))].sort();
    if (!files.length) continue;
    out.push({
      key: family.key,
      label: family.label,
      static: true,
      // **No directions, no actions** — one picture per variant. A caller that wants the figure to
      // walk is asking the wrong half of this module (`peopleKindsFromListing`).
      layout: 'static',
      files,
    });
  }
  return out;
}

/**
 * One variant of a static family, by index, wrapping — the picker a room's own seed uses.
 *
 * @param {{files: string[]}|null} kind
 * @param {number} index
 * @returns {string|null}
 */
export function staticFileFor(kind, index) {
  const files = kind?.files;
  if (!files?.length) return null;
  const i = Math.abs(Math.trunc(Number(index) || 0)) % files.length;
  return files[i];
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
  if (/^MLGEN0([1-5])T\.CFA$/.test(upper)) return 'a man of the town, in a tunic';
  if (/^MLGEN0([1-5])[WD]\.CFA$/.test(upper)) return 'a man of the town';
  if (/^GUARD0([1-6])\.CFA$/.test(upper)) return 'a guard of the watch';
  if (/^BABE0([1-6])\.CFA$/.test(upper)) return 'a woman of the town';
  // `LGLIT0#` answers `null` on purpose: it is a rod of light, not a person (see `VIEW_SHEETS`).
  if (/^LGLIT0([1-6])\.CFA$/.test(upper)) return null;
  // `PAT#` answers `null` on purpose — it is the Minotaur's art, and a label here would put it
  // back in the crowd as a person (D-30).
  if (/^PAT([1-6])\.CFA$/.test(upper)) return null;
  // The static people families (D-48): a standing NPC's own picture, named off its family word.
  for (const family of STATIC_PEOPLE_FAMILIES) {
    if (family.match.test(upper)) return family.label;
  }
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
