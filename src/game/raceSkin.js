// THE RACES OF TAMRIEL, DRAWN IN THE INSTALL'S OWN COLOURS (block B11, D-45).
//
// The owner's own words, and the request this module answers:
//
//   *"in morrowind mostly dark elf npcs in skyrim mostly nords … in morrowind i want lizard mans
//   repurpused as npcs to simulate argonians etc etc all provinces should have a mix of people but
//   mostly their people"*
//
// `game/provinceStyle.js` already decides **which people a province's street is made of** (a
// weighted pool of the archive's own figures) and **which name bank its folk are named from**, and
// `game/peopleKinds.js` already stands the Lizard Man in for the Argonians. What none of them can
// do is change a figure's *skin*, because Arena ships no per-race art: one human body, drawn from
// the armoured roster and `MLGEN`/`FMGEN`, for every province in Tamriel.
//
// ── WHERE A SKIN COMES FROM (measured, not assumed) ──────────────────────────────────────
//
// Arena's figures are palettized: a sheet's bytes are indices into the install's own `PAL.COL`, and
// a *ladder* of adjacent entries is one material shaded light to dark. Measured off the install
// (`.scratch/raceprobe.mjs`: decode the sheet, histogram its indices, read each index's `PAL.COL`
// triple), the citizen sheets paint skin from one ordered ladder of the install's palette:
//
//   index   PAL.COL      pixels in `MLGEN01W.CFA` (a man of the town, walk, front)
//   224     #d3cbb3      — (the pale brow and hand highlight on the women's sheets)
//   226     #cdba9b      — (the step under it)
//   227     #d4b28f      — (the lightest face/hand highlight on the armoured sheets)
//   229     #bb9477      14
//   231     #aa765f      18
//   232     #9c6854      27
//   234     #7e4a3c      55
//   235     #673b30       6
//   236     #5a2d24       4
//   237     #4d1e18      — (the deepest shadow under the chin)
//
// light to dark in that order. **227 is the highlight the first measurement missed**, and it is
// the dominant face colour on figures such as `11MAGWLK.CFA` (measured 2026-11-04: 431 of its 671
// pixels are in the head, and the rest are the hands and chest), so leaving it out left every
// recoloured face wearing Arena's default flesh while its neck and hands changed race. **224, 226
// and 237 were the second miss** (2026-11-04, the owner's *"missing skin recoloring pixels on
// their face"*): the women's faces paint a pale brow above the old first step and a warm shadow
// under the chin — `FMGENW01` 45/40/50 pixels, `11MNKWLK` 106/67, and `11MAGWLK` 182/41 plus 18
// of the 237 — so a Dark Elf or a Redguard kept a pale forehead and a flesh-coloured chin. 224 is
// also the highlight on her hands (`11MAGWLK`: 79 pixels below the head line). 225, 228, 230 and
// 233 sit between these entries and no citizen sheet paints them. **Everything else the
// sheets paint is not skin and must not move:**
// 32–35, 38–39, 55 and 101 are steel, 75–81 teal cloth, 130–133 and 138 red cloth, 148–152 and 154
// brown boots and hair, and 161–167 green. A recolour that touched those would repaint a
// townsman's clothes to change his face.
//
// ── WHERE A RACE'S COLOUR COMES FROM (this project's own reading, stamped) ───────────────
//
// Arena has **no race colour table to read**: its executable holds the transformation, the install
// ships no `.COL` of its own for a race (measured: `GLOBAL.BSA`'s extensions are `IMG MIF CFA SET
// INF DFA VOC RMD CIF XFM XMI`), and the sheets are one body. So a race here is a **pair of
// anchors** — the lightest and the darkest tone of that race's skin — taken from the **later
// games' own reading** of Tamriel (the Dunmer's ash grey-blue, a Nord's pale northern skin, a
// Redguard's deep brown, an Argonian's green-grey scales), which is this project's standing rule
// for lore Arena does not give: *take the later reading* and say so. `docs/DECISIONS.md` carries
// the decision; `docs/DEFECTS.md` D-45 is the row, and it names this as the module that closed the
// palette half of it.
//
// ── THE LAW ─────────────────────────────────────────────────────────────────────────────
//
// A race does **not** invent a new ramp: it *rescales Arena's own*. The ladder's entries keep
// their own order and their own even spacing, and only the two ends move, so the art's own
// light-to-dark shading — which is what makes a pixel figure read as a body rather than a flat
// shape — survives the recolour exactly. That is one interpolation, no colour library, no
// randomness, and it is why a Dark Elf in this port is the install's own townsman with a Dunmer's
// ramp under him rather than a new sprite somebody drew.
//
// A recoloured palette is a **new** 768-byte table (`skinPaletteFor`), so the scene can hand one
// figure a race's palette and the next figure Arena's own without either touching the other.

import { toRgba } from '../arena/palette.js';

/**
 * The ten `PAL.COL` entries the citizen sheets paint skin with, light to dark.
 *
 * The run is the install's own shading, not a hand-picked set: 224/226 are the pale brow and hand
 * highlight, 227–236 the face's body, and 237 the shadow under the chin (see the header).
 */
export const SKIN_LADDER = Object.freeze([224, 226, 227, 229, 231, 232, 234, 235, 236, 237]);

/**
 * Arena's own skin, as those seven entries hold it — the ramp a race's own is rescaled from.
 * Read off the install's `PAL.COL` bytes (`.scratch/raceprobe.mjs`, `.scratch/attackprobe.mjs`).
 */
export const ARENA_SKIN = Object.freeze([
  Object.freeze([0xd3, 0xcb, 0xb3]),   // 224 lightest (pale brow/hand highlight)
  Object.freeze([0xcd, 0xba, 0x9b]),   // 226
  Object.freeze([0xd4, 0xb2, 0x8f]),   // 227 (face/hand highlight)
  Object.freeze([0xbb, 0x94, 0x77]),   // 229 light
  Object.freeze([0xaa, 0x76, 0x5f]),   // 231
  Object.freeze([0x9c, 0x68, 0x54]),   // 232
  Object.freeze([0x7e, 0x4a, 0x3c]),   // 234
  Object.freeze([0x67, 0x3b, 0x30]),   // 235
  Object.freeze([0x5a, 0x2d, 0x24]),   // 236 dark
  Object.freeze([0x4d, 0x1e, 0x18]),   // 237 darkest (under the chin)
]);

/**
 * Every race this port draws, each as the two ends of its skin ramp.
 *
 * The keys are the ones the rest of the project already uses: `provinceStyle.js`'s
 * `RACE_NAME_BANKS` (the eight banks the sibling name corpus carries) plus `argonian`, which the
 * corpus has **no** bank for and Black Marsh therefore names with another race's words — its skin
 * is still its own, which is the half a name cannot carry.
 *
 * @type {Readonly<Record<string, {light: string, dark: string, note: string}>>}
 */
export const RACE_SKIN = Object.freeze({
  breton: Object.freeze({
    light: '#d8ab8d', dark: '#7a4d38',
    note: "a Breton's mid tan — the later games' reading of High Rock's people, who are the race Arena's own body already looks like",
  }),
  redguard: Object.freeze({
    light: '#8d5c3c', dark: '#3f2317',
    note: "a Redguard's deep brown — the later games' reading of Hammerfell's people, the darkest ramp here",
  }),
  nord: Object.freeze({
    light: '#f7dcc0', dark: '#c09070',
    note: "a Nord's pale northern skin — the later games' reading of Skyrim's people, the lightest ramp here",
  }),
  darkElf: Object.freeze({
    light: '#a9a8a4', dark: '#4e5459',
    note: "a Dunmer's ash grey-blue — the later games' reading of Morrowind's people, and the only ramp here that is cool (blue above red)",
  }),
  highElf: Object.freeze({
    light: '#ecd9a8', dark: '#b08e51',
    note: "an Altmer's pale gold — the later games' reading of the Summerset Isles' people",
  }),
  woodElf: Object.freeze({
    light: '#d9b184', dark: '#8a5f3c',
    note: "a Bosmer's light tan — the later games' reading of Valenwood's people",
  }),
  khajiit: Object.freeze({
    light: '#e0b878', dark: '#8a5f2e',
    note: "a Khajiit's tawny fur — the later games' reading of Elsweyr's people, which is a fur ramp rather than a skin one",
  }),
  argonian: Object.freeze({
    light: '#9fb08c', dark: '#40503f',
    note: "an Argonian's green-grey scales — the later games' reading of Black Marsh's people, whose green is above their red (and whose figure the archive stands in with the Lizard Man, `peopleKinds.js`)",
  }),
  imperial: Object.freeze({
    light: '#cfa07c', dark: '#6f4633',
    note: "an Imperial's mid tan — the later games' reading of Cyrodiil's people, close to Arena's own body by design",
  }),
});

/** Every race key this module knows, in the table's own order. */
export const RACE_KEYS = Object.freeze(Object.keys(RACE_SKIN));

/**
 * The spellings the rest of the game uses for the same eight races.
 *
 * `character.js`'s `RACES` hold the player-facing ids in one lowercase word (`darkelf`,
 * `highelf`, `woodelf`), the province mix holds the table's own camel case (`darkElf`), and
 * `game/humans.js` puts a race id on every human enemy. A human foe drawn from `GUARD01.CFA`
 * therefore asked this module for `darkelf` and was handed Arena's own skin — the owner's
 * *"in enemies using it it doesnt change even skin color"*. One folding table is the fix, and
 * it is the same law `figureKindFor` already folds.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const RACE_ALIASES = Object.freeze({
  darkelf: 'darkElf', 'dark elf': 'darkElf', dunmer: 'darkElf',
  highelf: 'highElf', 'high elf': 'highElf', altmer: 'highElf',
  woodelf: 'woodElf', 'wood elf': 'woodElf', bosmer: 'woodElf',
  khajiiti: 'khajiit', cat: 'khajiit',
  argonian: 'argonian', saxhleel: 'argonian',
  imperial: 'imperial', cyrodil: 'imperial', cyrodiil: 'imperial',
  breton: 'breton', redguard: 'redguard', nord: 'nord',
});

/**
 * The canonical key for a race, folding the game's other spellings onto this table's own.
 *
 * @param {unknown} race
 * @returns {string|null} a `RACE_SKIN` key, or null for anything this module cannot paint
 */
export function raceKey(race) {
  if (typeof race !== 'string') return null;
  if (Object.hasOwn(RACE_SKIN, race)) return race;
  // **The aliases are the game's own ids, not a case-insensitive match**: `darkelf`, `highelf`,
  // `woodelf` and the display spellings are folded, while `Nord` is still not a key — the table's
  // own spelling is the corpus's, and a typo that differs only in case should not be painted.
  if (race !== race.trim().toLowerCase()) return null;
  const folded = RACE_ALIASES[race.trim()];
  return folded && Object.hasOwn(RACE_SKIN, folded) ? folded : null;
}

/** Is this a race this module can draw? @param {unknown} race @returns {boolean} */
export function hasRace(race) {
  return raceKey(race) !== null;
}

/** `#rrggbb` to `[r, g, b]`. @param {string} hex @returns {[number, number, number]} */
function hexToRgb(hex) {
  const n = Number.parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** A race's two anchors as triples, or null for a race this module does not know. */
export function raceSkinFor(race) {
  const key = raceKey(race);
  if (!key) return null;
  const spec = RACE_SKIN[key];
  return { light: hexToRgb(spec.light), dark: hexToRgb(spec.dark), note: spec.note };
}

/** @type {Map<string, [number, number, number][]>} */
const ladderCache = new Map();

/**
 * The colours a race's skin ladder holds, light to dark — Arena's own steps between the
 * race's two anchors.
 *
 * `ladderFor(race)[0]` is the light anchor and the last entry the dark one; the steps between
 * them are the straight line between the two, so the ladder keeps Arena's even shading steps.
 * Returns **a fresh array of fresh triples** every call, so a caller cannot mutate the cache.
 *
 * @param {string} race
 * @returns {[number, number, number][]|null} one triple per ladder entry, or null for a race this
 *   module does not know
 */
export function ladderFor(race) {
  const anchors = raceSkinFor(race);
  if (!anchors) return null;
  const key = raceKey(race);
  let ramp = ladderCache.get(key);
  if (!ramp) {
    const last = SKIN_LADDER.length - 1;
    ramp = SKIN_LADDER.map((_, i) => {
      const t = i / last;
      return [0, 1, 2].map((c) => Math.round(anchors.light[c] + (anchors.dark[c] - anchors.light[c]) * t));
    });
    ladderCache.set(key, ramp);
  }
  return ramp.map((triple) => [...triple]);
}

// ── HAIR: THE SAME LAW, ON A DIFFERENT RUN OF ENTRIES ─────────────────────────────────────
//
// The owner, 2026-10-17: *"you could also have the blonde hair in npcs change color to a random
// hair color like you do with the skin color to make more npc variety"*. A street where every
// head is the install's one auburn is the same defect the races closed, on the head instead of
// the face.
//
// Whose entries the hair is, measured off the install's own sheets (`.scratch/hair5.mjs`):
//
//   sheet        entries            rows           what it is
//   MLGEN01W     130–133            0…14           hair (the rest of the ramp 128–136 unpainted)
//   FMGENW01     141–145            2…18           hair
//   FMGEN01      130–133            0…16           hair  ← a *woman* of the older family
//   FMGEN01      141–145            18…47          her dress
//   BABE01       141–145            0…100          the whole figure: a red dress, no hair at all
//
// So **the run is not the sheet's sex** — `FMGEN01`'s hair is the men's run and `BABE01`'s is a
// dress — and a table keyed on male/female would repaint a dress on one family and a face on
// another (exactly the owner's *"a man and a woman of the town npcs change their clothes when I
// speak to them"*). The law is therefore the **sheet's own head**: among the candidate entries,
// the ones this sheet paints *only* above the head line are its hair (`hairIndicesOf`). A figure
// with a helmet, a hood or no painted head answers with no entries and is left exactly alone.

/**
 * **THE WALKING CROWD'S SHEETS AND THE RUN EACH ONE PAINTS ITS HAIR WITH** — measured.
 *
 * The owner, 2026-10-18: *"MLGEN01WCFA … GUARD01CFA … FMGENW01CFA … BABE01CFA … those are not part
 * of not moving npcs … they are sprites of moving npcs together with a lot of other and this ones
 * need the yellow hair some of them have to be affected by the hair changer"*. **These are the
 * crowd's walk sheets, not the stills**: `STATIC_FOLK`'s `MAN01`/`GUARD1D`/`KING` are one painted
 * picture the map places, while `MLGEN0#W`, `FMGEN0#`, `FMGENW0#`, `BABE0#` and `GUARD0#` are a
 * person who walks, turns and talks — five directions and an action apiece. They are read by
 * `peopleKinds.js` and drawn by the crowd, so they are the sheets the hair changer paints.
 *
 * **Why a family table and not one candidate list.** The first pass had a single list of every run
 * any sheet paints a head with, and asked each sheet which of those it paints only above the head
 * line. That is right for a head and wrong for a helmet: measured 2026-10-18 across every sheet of
 * the five families (`.scratch/hairfamilies.mjs`), the **watch's** `GUARD01` paints palette entry
 * 142 twenty times above its head line (a shadow under the helm) and `GUARD05` paints 218 twenty
 * times, so both were "hair" and a guard's helmet could be repainted skin-dark. A race or a hair
 * colour is a fact about the *figure*, so the law is now the figure's own family: the run below,
 * then the sheet's head-band test on top of it. A family with an empty run (the watch) answers
 * with no hair at all, whatever its stray pixels say.
 *
 * Measured per family, one row per run:
 *
 *   family      sheets                              hair run          what the art shows
 *   `MLGEN0#`   `MLGEN01W`…`MLGEN05D`, `…0#T`       128…136           auburn, painted on the crown
 *   `FMGEN0#`   `FMGEN01`…`FMGEN05`, `FMGEND0#`     128…136 + 192…199 the town's older woman: auburn,
 *                                                                   and the gold of her older head
 *   `FMGENW0#`  `FMGENW01`…`FMGENW05`               139…147           dark auburn, and 92 a dark hood
 *   `BABE0#`    `BABE01`…`BABE06`                   212…218 + 190/205/209  the blonde head
 *   `GUARD0#`   `GUARD01`…`GUARD06`                 190/204…218       the gold mane either side of
 *                                                                   the helm
 *   `ROSTER`    `01UNAWLK`…`15MNKWLK`              128…147, 192…207  the armoured crowd: auburn, and
 *                                                                   two gold runs
 *
 * The gold run is the owner's **yellow hair**: `BABE01`'s 215/216/218 (`#714c0b`, `#64450e`,
 * `#4a3515`) are the install's fair head, and 212/214/217 are the same ramp falling over her
 * shoulders.
 *
 * **THE MISSED GOLD (2026-10-18).** The owner: *"check the back of the woman you color the yellow
 * hair into different colors too because you missed a few yellow pixels and from behind it looks
 * awful"*. Measured across every sheet of every family (`.scratch/measure3.mjs`), the women of the
 * armoured roster paint a **second** gold run — `11UNAWLK` 202–207 (`#8b7300` … `#514512`),
 * `13UNAWLK` and `14/15UNAWLK` the same — and that run was in no family's list, so their hair was
 * half-repainted and half-left yellow. `FMGEN01`'s older head paints 192/195 the same way. Both
 * runs are in the families below now.
 *
 * **The family's run is the truth for a named family.** The head-band test below exists to keep a
 * sheet's *clothes* out of the changer when the sheet is unknown; a measured family already knows
 * which entries are its head, and its hair can fall to the shoulders (and, on the watch, be the
 * only thing in the sheet that paints the gold ramp at all — measured: `GUARD01`'s 212 paints 140
 * pixels above the head line and 168 below it, so the band test rejected the very mane the owner
 * asked to change).
 */
/**
 * **THE GOLD RUN, TAKEN WHOLE ON EVERY WALKING BODY.**
 *
 * The owner, 2026-10-19: *"you need to intercept ALL of the female hair involved in this change
 * because there is a female that is not AR-sprite-BABE01-06.gif or the woman in town in a bodice
 * this woman when you speak to her says a person in furs AND a person in chainmail but btw this
 * womans sprite yellow hair dont get fully recolored and more yellow needs to be included in her
 * recolor this also happens with man that get recognised as \"a person in leather\""*.
 *
 * Measured off those exact sheets (`.scratch/hairdetail.mjs`, `.scratch/hairgold.mjs`), the gold
 * ramp is the install's fair head **and it falls to the shoulders and the back**, far below the
 * head band the band test allows:
 *
 *   `11CHNWLK` (a woman in chain mail)  216 head 27 / below 395, 217 head 36 / below 397, 218 below 511
 *   `01LTRWLK` (a man in leather)      215 head 12 / below 144, 216 6/114, 217 18/42, 218 12/54
 *   `14BARWLK` / `15BARWLK` (furs)     194, 196, 197 paint 18–41% of their hair below the line
 *   `FMGENW01` (the blue-coated woman) 215 head 9 / below 153, 217 below 54
 *   `BABE06`                           214 and 215 miss the band the same way
 *
 * Every one of those entries is the same gold ramp Arena paints hair with (192–199, the older
 * woman's 202–207, and the fair head's 209/211–218). The **position** test cannot separate them
 * from a tunic — a tunic also crosses the head band — so the law for this run is the owner's own:
 * on a walking person it is **hair wherever it is painted**, and it is recoloured whole. The
 * honest cost is the gold trim/greave cap a few sheets share the ramp with (the watch already
 * pays it, `GUARD0`). The auburn runs keep the band/foot tests; they are the ones clothes use.
 *
 * @type {readonly number[]}
 */
export const HAIR_GOLD_WHOLE = Object.freeze([
  192, 193, 194, 195, 196, 197, 198, 199,
  202, 203, 204, 205, 206, 207,
  // 209 and 211 are a near-black shade the plain-clothes woman paints her **skirt** with
  // (measured: `11UNAWLK` 211 is rows 44–72), so the dark end of the ramp is not taken whole.
  212, 213, 214, 215, 216, 217, 218,
]);

export const HAIR_FAMILIES = Object.freeze([
  // The watch first: its name also matches nothing else, and a family with no run must never fall
  // through to a broader one. The gold is the mane under the helm **and** the same gold trim on
  // the belt and boots — Arena paints both from one ramp, so a guard whose hair is black has black
  // boot caps, which is the honest cost of changing a colour the art shares.
  Object.freeze({
    key: 'GUARD0',
    match: /^GUARD0[1-6]\.CFA$/,
    run: Object.freeze([190, 204, 205, 209, 211, 212, 213, 214, 215, 216, 217, 218]),
    // **The watch is the one family whose whole run is taken** (measured 2026-10-18): the gold
    // mane either side of the helm shares its ramp with the belt and the boot caps (on `GUARD01`,
    // 212 paints 140 pixels above the head line and 168 below it; 217 paints 528 in the hair and
    // 938 on the greaves), so any region test leaves the mane two-tone. Changing a guard's hair
    // therefore changes that gold trim with it — the honest cost of one palette over a figure
    // that paints two things with it.
    whole: true,
  }),
  // **The crowd proper**: the armoured roster's walk sheets (`01UNAWLK.CFA`…`15MNKWLK.CFA`), which
  // is what `townsfolk.js` places on every street. The owner, 2026-10-18: *"a lot of walking npcs
  // sprites with yellow hair dont hair change"* — and this is why: measured across all 65 roster
  // sheets (`.scratch/bowhair.mjs`), **62 of them paint their hair above the head line from the
  // bright gold run 192–199** (`#d79f07`, `#c4910a`, `#b1840d`, … `#51401b` — 26 sheets use 192,
  // 31 use 195), and not one of those entries was in the changer's runs, so `hairIndicesOf`
  // answered **nothing** for a blonde commoner and their head never changed. The same sheets also
  // use the auburn runs above (133, 139–147), which is why both are in this family's list — and
  // the women's arms paint a **third** gold run, 202–207, which is the one the owner caught
  // half-repainted (the header above).
  // Deliberately **not** included, and measured too: the greys 17–23 and 32–35 (a mage's hood),
  // 51 and 107–112 (dark cloth and armour, painted down the body as well) — those are worn, not
  // grown.
  // **The women of the mage house.** `11MAG`'s head is the white ramp 16–25, not the gold
  // embroidery: every one of those entries is painted above the head line on all six angles, down
  // the sides and back of her head, and the strike sheet paints the same run. The old roster family
  // did not include them at all, so a hair colour left her white head untouched and repainted
  // one stray gold trim pixel (212) instead. `ATT` is included so the swing keeps her head.
  Object.freeze({
    key: 'ROSTER_MAG_W',
    // **Every action is the same woman**: the walk's 360, the strike and the bow, and the sword,
    // staff and spell sheets, whose white hair is the same run (measured 2026-11-04).
    match: /^1[1-5]MAG(WLK|ATT|BOW|SPL|STF|SWD)\.CFA$/,
    // **The whole white ramp, in the order the eye sees it.** 16–25 are the contiguous run, but
    // some of her angles paint the same hair from a second cool-grey run — `12MAGWLK` uses
    // 180–184 at the crown (measured 2026-11-04: all 42 of its pixels above the head line), and
    // `11MAGSWD` uses 183/184/186/187 down the back. Sorted by index those would land after 25
    // and take the darkest steps, so the run is written in tone order and `complete` keeps it.
    run: Object.freeze([
      16, 17, 18, 180, 19, 181, 20, 182, 21, 183, 184, 22, 23, 186, 187, 24, 25,
    ]),
    // **The whole white run is her head.** The walk paints seven of the eight shades and the
    // strike paints all eight; using each sheet's painted subset would give the same hair two
    // different ramps. Naming the whole run keeps every shared entry the same colour on both.
    complete: true,
  }),
  // **The men of the mage house wear a hood.** The same 16–23 entries are a full outline around
  // `01MAG`'s face with no hair below it (measured 2026-11-04), so naming them as hair would
  // recolour his hood. An empty run is a real answer: the figure has no painted head for the
  // changer, and its robe trim stays the install's own.
  Object.freeze({
    key: 'ROSTER_MAG_M',
    match: /^0[1-5]MAG(WLK|ATT|BOW)\.CFA$/,
    run: Object.freeze([]),
  }),
  // **The men of the monk house wear a tonsure** (2026-11-04). The fringe at the sides of his bald
  // crown is **237** (`#4d1e18`, the dark red hair) and **133** (`#59252b`, its auburn highlight),
  // with **190** (`#381919`) on the strike. 237 is outside the auburn run, so `hairIndicesOf`
  // answered `[133]` — two red pixels — and the owner's *"MNK fighter male red hair dont get
  // recolored at all"* was the fringe itself, still there. His correction — *"changed part of his
  // dress instead of his hair"* — is why **191 stays out**: 191 paints the robe's outline (127
  // head-band pixels and 128 down the body on `01MNKWLK`), so recolouring it moves the dress. 237
  // is the right entry because it is painted **only on the head** (measured: 114 head / 0 body on
  // `01MNKWLK`, 53/0 on the strike, 44/0 on the kick), so recolouring it cannot touch the robe.
  // The run is taken whole so the walk and the strike cannot shade the fringe differently (190 is
  // painted only on the strike).
  Object.freeze({
    key: 'ROSTER_MNK_M',
    match: /^0[1-5]MNK(WLK|ATT|KIC)\.CFA$/,
    run: Object.freeze([133, 237, 190]),
    complete: true,
  }),
  // **The monks' robes.** Their heads are the auburn run and their gold is embroidery on the
  // robe, not grown hair (measured: `11MAGWLK` 194/196/197 are dabs at rows 19–54, 1–9 pixels
  // above the head line) — so this family keeps the head-band law even for the gold run. It is
  // listed before `ROSTER` because `hairFamilyOf` takes the first match.
  Object.freeze({
    key: 'ROSTER_ROBE',
    match: /^\d\dMNK(WLK|ATT|BOW)\.CFA$/,
    run: Object.freeze([
      128, 129, 130, 131, 132, 133, 134, 135, 136,
      139, 140, 141, 142, 143, 144, 145, 146, 147,
      ...HAIR_GOLD_WHOLE,
    ]),
  }),
  // **The women's figures.** The owner's report names the woman in furs and the woman in chain
  // mail; every one of the archive's five directions of each is here (sets 11–15). On a woman's
  // figure the whole gold ramp is her head — including the shade that starts below the band
  // (`11CHNWLK` 218 is painted only down the back) — so the run is taken whole.
  Object.freeze({
    key: 'ROSTER_W',
    // **`ATT` and `BOW` are the same figure**, and a woman's hair has to keep its colour as she
    // swings or looses. The armoured roster's three actions are one body drawn three ways.
    match: /^1[1-5](UNA|LTR|CHN|PLT|BAR)(WLK|ATT|BOW)\.CFA$/,
    run: Object.freeze([
      128, 129, 130, 131, 132, 133, 134, 135, 136,
      139, 140, 141, 142, 143, 144, 145, 146, 147,
      ...HAIR_GOLD_WHOLE,
    ]),
    wholeRun: HAIR_GOLD_WHOLE,
  }),
  // **The men's figures**, sets 01–05. The gold taken whole is the owner's *"man that get
  // recognised as a person in leather"*: `01LTRWLK`'s 215–218 fall down his back (12/144,
  // 6/114, 18/42, 12/54). An entry with **no paint in the head band at all** is worn, not grown
  // — the barkeep's apron keeps its gold (`01BARWLK` 212/214/215 are rows 22–54 only).
  Object.freeze({
    key: 'ROSTER_M',
    // **`ATT` and `BOW` are the same figure**: an archer is drawn from `01PLTWLK.CFA` walking and
    // `01PLTBOW.CFA` loosing (`game/humans.js`'s `rosterFile`), and a head that changes colour
    // between the two is two people. The two actions face forward only (the `01` file), which the
    // match allows too.
    match: /^0[1-5](UNA|LTR|CHN|PLT|BAR)(WLK|ATT|BOW)\.CFA$/,
    run: Object.freeze([
      128, 129, 130, 131, 132, 133, 134, 135, 136,
      139, 140, 141, 142, 143, 144, 145, 146, 147,
      ...HAIR_GOLD_WHOLE,
    ]),
    wholeRun: HAIR_GOLD_WHOLE,
    wholeHead: true,
  }),
  Object.freeze({
    key: 'BABE0',
    match: /^BABE0[1-6]\.CFA$/,
    run: Object.freeze([190, 204, 205, 209, 212, 213, 214, 215, 216, 217, 218]),
    // Every entry here is the fair head. `BABE06`'s 214/215 sit past the band and used to be
    // left yellow (`HAIR_GOLD_WHOLE`'s measurement), so this family takes its run whole too.
    whole: true,
  }),
  // `FMGENW` before `FMGEN`, because `FMGENW01` is both a `W` sheet and a generic woman's.
  Object.freeze({
    key: 'FMGENW',
    match: /^FMGENW0[1-5]\.CFA$/,
    run: Object.freeze([139, 140, 141, 142, 143, 144, 145, 146, 147, ...HAIR_GOLD_WHOLE]),
    // Her fair hair falls down her back (`FMGENW01`: 215 is 9 pixels above the line, 153 below).
    wholeRun: HAIR_GOLD_WHOLE,
  }),
  Object.freeze({
    key: 'FMGEN',
    match: /^FMGEN[DW]?0[1-5]\.CFA$/,
    run: Object.freeze([
      128, 129, 130, 131, 132, 133, 134, 135, 136, 192, 193, 194, 195, 196, 197, 198, 199,
      ...HAIR_GOLD_WHOLE,
    ]),
    wholeRun: HAIR_GOLD_WHOLE,
    // **This woman's gold hair falls to her shoulders** (measured: `FMGEN01.CFA` paints 192 at
    // rows 18–51 of 104, so two thirds of it is below the head line), which the head band would
    // reject. Her body is the test instead: the hair never reaches her legs, and a garment would.
    long: true,
  }),
  Object.freeze({ key: 'MLGEN', match: /^MLGEN0[1-5][WTD]\.CFA$/, run: Object.freeze([128, 129, 130, 131, 132, 133, 134, 135, 136]) }),
]);

/**
 * The hair family a sheet belongs to, or null for a sheet no family claims.
 *
 * @param {string|null} name  e.g. `BABE01.CFA`
 * @returns {{key: string, run: readonly number[]}|null}
 */
export function hairFamilyOf(name) {
  const upper = typeof name === 'string' ? name.toUpperCase() : '';
  if (!upper) return null;
  return HAIR_FAMILIES.find((family) => family.match.test(upper)) ?? null;
}

/**
 * Every run any **walking** sheet paints hair with — the fallback for a sheet whose family this
 * module does not know (a dev page, a record from another install).
 *
 * It exists so `hairIndicesOf` still answers for an unnamed sheet, and it is deliberately *not* the
 * law: a named family is decided by `HAIR_FAMILIES` above, which is what keeps the watch's helmet
 * out of the changer.
 */
export const HAIR_CANDIDATES = Object.freeze([
  ...new Set(HAIR_FAMILIES.flatMap((family) => family.run)),
].sort((a, b) => a - b));

/**
 * How much of an entry's paint may sit **below** the head band and still count as hair.
 *
 * The first reading demanded *none* (`!below.has(i)`) and that is right for a hair ladder painted
 * only on the crown — but a woman's hair falls past her shoulders, so `BABE01`'s 212/214/217 were
 * excluded for the sake of 22 pixels of hair on a body of 500. A tenth of the head's own count is
 * the tolerance: honest hair over a shoulder passes, a tunic or a pair of boots (which are painted
 * all the way down) does not.
 */
export const HAIR_BELOW_SHARE = 0.15;

/**
 * The share of an entry's paint that may sit on the **legs and hem** and still count as hair.
 *
 * This is the owner's own report made into a rule: *"is not BABE01CFA or FMGENW01CFA or FMGEN01CFA
 * that i still dont know if you used to make an npcs that have a problem with their hair in the
 * back is te other girl"* — the armoured roster's women. Measured on `11BARWLK.CFA`, palette entry
 * 207 paints **the trousers** (1 162 pixels down both legs); on `11CHNWLK.CFA`, 214–219 paint the
 * **skirt's hem and side trim**. Both were in the same gold ramps as hair, so a run alone cannot
 * tell them apart — the body can: hair hangs from the head, a garment covers the legs. An entry
 * with more than a tenth of its paint in the bottom third of the figure is worn, not grown.
 */
export const HAIR_FOOT_SHARE = 0.1;

/** Where the feet begin: the bottom third of the sheet. */
export const HAIR_FOOT_FROM = 0.65;

/**
 * The hair colours a person of Tamriel may be given.
 *
 * Each is a pair of anchors like a race's skin (light and dark), rescaled over whichever hair
 * entries the sheet turned out to have, so the art's own light-to-dark shading survives. The
 * tones are the later games' reading again — black, brown, auburn, blonde, red and grey — with
 * the install's own auburn among them, so the archive's default is one strand of the set rather
 * than a colour nobody on the street has.
 *
 * @type {Readonly<Record<string, {light: string, dark: string}>>}
 */
export const HAIR_COLORS = Object.freeze({
  black: Object.freeze({ light: '#2f2c2a', dark: '#121011' }),
  brown: Object.freeze({ light: '#6b4a33', dark: '#2f2019' }),
  auburn: Object.freeze({ light: '#8a3b2c', dark: '#3f1d18' }),
  // **The yellow head**, by the owner's own word for it: the first pair here was the sand-brown
  // the install uses for leather (`#d9b878`), and a blonde on the street read as a tan cap. The
  // later games' fair hair is a gold, so the light anchor is one.
  blonde: Object.freeze({ light: '#e8c45c', dark: '#8f6a24' }),
  red: Object.freeze({ light: '#b04a2a', dark: '#521f10' }),
  grey: Object.freeze({ light: '#cdc7bc', dark: '#77726a' }),
});

/** Every hair colour, in the table's own order. */
export const HAIR_KEYS = Object.freeze(Object.keys(HAIR_COLORS));

/**
 * Which entries of one sheet are its hair: the candidates it paints **only above the head line**.
 *
 * The head line is the top `headShare` of the sheet — a citizen is about 100 pixels tall and its
 * head is the top fifth, so 22% is the band every measured sheet's hair sits in and no sheet's
 * clothes do. Every frame is scanned, because a turned figure shows hair a front view hides.
 *
 * An entry qualifies when at least `1 - HAIR_BELOW_SHARE` of its paint is above the line: a hair
 * ladder that falls over a shoulder still counts, a tunic or a pair of boots does not.
 *
 * **The family decides the run, and a named family's run is its whole answer.** A sheet whose
 * family this module was measured for (`HAIR_FAMILIES`) gets back every entry of that run it
 * paints, at any height: long hair crosses the head band, and the watch's mane is painted from
 * the same gold as its trim. The band test is the **fallback** for a sheet no family claims (a dev
 * page, another install), where the union of every walking run (`HAIR_CANDIDATES`) is a guess and
 * the band is what keeps a tunic out of it.
 *
 * @param {{width: number, height: number, frames: {indices: ArrayLike<number>}[]}} cfa
 * @param {{headShare?: number, name?: string|null}} [opts]  `name` — the record's own file name
 *   (`BABE01.CFA`), which is what names the family; without it the union is used
 * @returns {number[]} the hair entries this sheet paints, light to dark (a completed family's
 *   authored order; otherwise ascending index)
 */
export function hairIndicesOf(cfa, { headShare = 0.22, name = null } = {}) {
  const frames = cfa?.frames ?? [];
  const w = Number(cfa?.width) || 0;
  const h = Number(cfa?.height) || 0;
  if (!frames.length || !w || !h) return [];
  const family = hairFamilyOf(name) ?? hairFamilyOf(cfa?.name);
  // A family with no hair has none.
  if (family && !family.run.length) return [];
  // A family whose run is all hair answers the whole run, painted or not: the missing shade in
  // one view must not shift the ramp the next view uses (`ROSTER_MAG_W`'s walk and strike, the
  // monk's 190 on the walk). The order is the family's own, **light to dark** — some of the white
  // hair shades are not adjacent in the palette (180–187), so sorting by index would paint a
  // highlight with the darkest step.
  if (family?.complete) return [...family.run];
  const head = Math.max(1, Math.round(h * headShare));
  const feet = Math.round(h * HAIR_FOOT_FROM);
  const candidates = new Set(family ? family.run : HAIR_CANDIDATES);
  const inHead = new Map();
  const below = new Map();
  const low = new Map();
  const painted = new Set();
  for (const frame of frames) {
    const indices = frame?.indices ?? [];
    for (let y = 0; y < h; y++) {
      const band = y < head ? inHead : below;
      for (let x = 0; x < w; x++) {
        const i = indices[y * w + x];
        if (!candidates.has(i)) continue;
        painted.add(i);
        band.set(i, (band.get(i) ?? 0) + 1);
        if (y >= feet) low.set(i, (low.get(i) ?? 0) + 1);
      }
    }
  }
  // **A measured family answers from its run, with the test its own art needs**:
  //   * the watch takes the **whole** run (its mane and its trim share one gold ramp);
  //   * the woman whose hair falls past her shoulders is tested by her **feet** — hair does not
  //     cover the legs, a garment does;
  //   * every other family keeps the **head band**, which is what separates a head from a torso
  //     (`04UNAWLK.CFA` paints its tunic at rows 12–52 with 140–144; its hair is 192–195 on rows
  //     1–11).
  if (family) {
    const wholeRun = family.wholeRun ?? [];
    const keep = (i) => {
      if (family.whole) return true;
      if (wholeRun.includes(i) && (!family.wholeHead || (inHead.get(i) ?? 0) > 0)) return true;
      const total = (inHead.get(i) ?? 0) + (below.get(i) ?? 0);
      if (family.long) return (low.get(i) ?? 0) <= total * HAIR_FOOT_SHARE;
      return (below.get(i) ?? 0) <= (inHead.get(i) ?? 0) * HAIR_BELOW_SHARE;
    };
    return [...painted].filter(keep).sort((a, b) => a - b);
  }
  return [...inHead.keys()]
    .filter((i) => (below.get(i) ?? 0) <= (inHead.get(i) ?? 0) * HAIR_BELOW_SHARE)
    .filter((i) => (low.get(i) ?? 0) <= ((inHead.get(i) ?? 0) + (below.get(i) ?? 0)) * HAIR_FOOT_SHARE)
    .sort((a, b) => a - b);
}

/**
 * A hair colour's ramp for a run of `count` entries, light to dark.
 *
 * @param {string} hair  a `HAIR_COLORS` key
 * @param {number} count how many entries the sheet paints hair with
 * @returns {[number, number, number][]|null}
 */
export function hairRampFor(hair, count) {
  const spec = typeof hair === 'string' && Object.hasOwn(HAIR_COLORS, hair) ? HAIR_COLORS[hair] : null;
  const n = Math.round(Number(count));
  if (!spec || !(n > 0)) return null;
  const light = hexToRgb(spec.light);
  const dark = hexToRgb(spec.dark);
  return [...Array(n)].map((_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return [0, 1, 2].map((c) => Math.round(light[c] + (dark[c] - light[c]) * t));
  });
}

/**
 * A **skin spec** — a race, a hair colour, or both — as the one string a sheet is keyed by.
 *
 * `darkElf` (a race), `darkElf+blonde` (a Dunmer with fair hair), or null for a person drawn
 * with Arena's own colours. The `+` is why the sheet key can carry both: a person's texture is
 * `MLGEN01W.CFA#darkElf+blonde`, so two Dunmer of one family with different heads are two
 * textures and every downstream seam (`raceSheetKey`, the batch key, the debug report) already
 * carries the whole answer.
 *
 * **A head is not always a race** (2026-10-18). This used to answer `null` unless a race was
 * named, so a person in a place whose province the table does not know (a bare `?city=` page, a
 * dungeon, a dev door) kept the install's one auburn however their hair had been drawn — and the
 * owner's report is exactly that: *"the npcs with red hair successfully get them a random color but
 * the npcs with blonde hair still dont swap their hair color randomly"*. A hair-only spec is
 * written with the empty race half (`+blonde`), which is the shape a race-and-hair spec already
 * has, so every downstream key (`raceSheetKey`, the batch key, the debug report) needs no new
 * case.
 *
 * @param {string|null} race @param {string|null} [hair]
 * @returns {string|null}
 */
export function skinSpec(race, hair) {
  const r = hasRace(race) ? race : null;
  const h = typeof hair === 'string' && Object.hasOwn(HAIR_COLORS, hair) ? hair : null;
  if (r && h) return `${r}+${h}`;
  if (h) return `+${h}`;
  return r;
}

/**
 * The race and the hair colour inside a skin spec.
 *
 * The parser is strict about the race (a table key is the corpus's own spelling — `Nord` is not
 * `nord`) and drops a hair colour it does not know rather than failing the whole spec, so a page
 * holding an old key still draws its face.
 *
 * @param {unknown} spec  e.g. `darkElf+blonde`, `+blonde` (hair only), `nord`, `null`
 * @returns {{race: string|null, hair: string|null}}
 */
export function parseSkinSpec(spec) {
  if (typeof spec !== 'string' || !spec) return { race: null, hair: null };
  // The Khajiit's fur is not a race recolour (no human body is involved): it is one palette written
  // over the wolf's own ramp, so it is its own kind of spec. `khajiitFur:black` names a coat
  // (`KHAJIIT_COATS`), so a street of cat-folk is not a street of one cat.
  if (spec === KHAJIIT_FUR_SPEC || spec.startsWith(`${KHAJIIT_FUR_SPEC}:`)) {
    const coat = spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : 'tawny';
    return { race: null, hair: null, fur: Object.hasOwn(KHAJIIT_COATS, coat) ? coat : 'tawny' };
  }
  // A normal spec answers exactly the two halves it always did, so a caller that destructures it
  // needs no knowledge of the fur case.
  const cut = spec.indexOf('+');
  const race = cut < 0 ? spec : spec.slice(0, cut);
  const hair = cut < 0 ? null : spec.slice(cut + 1);
  const key = raceKey(race);
  return {
    race: key,
    hair: hair && Object.hasOwn(HAIR_COLORS, hair) ? hair : null,
  };
}

/**
 * Does this spec name a colour this module can paint? @param {unknown} spec @returns {boolean}
 *
 * A **race or a hair colour** is enough: a street whose province is unknown still has heads to
 * vary (`+blonde`), and the sheet key is the same either way.
 */
export function hasSkin(spec) {
  const { race, hair, fur } = parseSkinSpec(spec);
  return Boolean(race || hair || fur);
}

/**
 * A palette with one skin spec's colours written over it — a race's skin **and** a hair colour.
 *
 * This is the whole recolour: the base table is copied byte for byte and only the entries the
 * spec names change — every `SKIN_LADDER` entry for a race, and the entries `hairIndices` names
 * for a hair colour — so a townsman's clothes, armour and boots are exactly the install's
 * own colours and only his face is his province's race and only his head is his own. The input is
 * never modified.
 *
 * The hair entries are passed in because **the sheet, not the table, knows where its hair is**
 * (`hairIndicesOf`): the same four `PAL.COL` entries are hair on one family and a dress on
 * another, and a palette is always built for one sheet.
 *
 * @param {string} spec  a race, or a skin spec (`skinSpec`)
 * @param {Uint8Array|number[]} baseRgb  768 bytes, 3 per entry (`palette.js`'s `parseCol`)
 * @param {{hairIndices?: number[]}} [opts]  the hair entries of the sheet this palette is for
 * @returns {Uint8Array|null} a new 768-byte table, or null when the spec names nothing this
 *   module can paint or the base is not a palette of the right size
 */
export function skinPaletteFor(spec, baseRgb, { hairIndices = [] } = {}) {
  const { race, hair, fur } = parseSkinSpec(spec);
  const ramp = race ? ladderFor(race) : null;
  if (fur && baseRgb && baseRgb.length === 768) {
    const out = new Uint8Array(768);
    out.set(baseRgb);
    for (const [index, triple] of KHAJIIT_COATS[fur] ?? KHAJIIT_FUR) {
      out[index * 3] = triple[0];
      out[index * 3 + 1] = triple[1];
      out[index * 3 + 2] = triple[2];
    }
    return out;
  }
  // **The hair does not need the face.** It was gated on `race &&` here, which is why a blonde
  // head whose province the table does not know kept the install's own colour (`skinSpec` now
  // writes `+blonde`, which this reads as hair without a race).
  const hairRun = hair && Array.isArray(hairIndices) && hairIndices.length
    ? hairRampFor(hair, hairIndices.length)
    : null;
  if (!ramp && !hairRun) return null;
  if (!baseRgb || typeof baseRgb.length !== 'number' || baseRgb.length !== 768) return null;
  const out = new Uint8Array(768);
  out.set(baseRgb);
  const write = (index, triple) => {
    const at = index * 3;
    out[at] = triple[0];
    out[at + 1] = triple[1];
    out[at + 2] = triple[2];
  };
  if (ramp) SKIN_LADDER.forEach((index, i) => write(index, ramp[i]));
  if (hairRun) hairIndices.forEach((index, i) => {
    if (Number.isInteger(index) && index >= 0 && index < 256) write(index, hairRun[i]);
  });
  return out;
}

/**
 * WHICH RACE ONE PERSON IS — drawn from the province's own mix, per paving stone.
 *
 * `provinceStyle.js`'s `raceMix` is a weighted pool (`RACE_KEYS`, the province's own race
 * repeated most), and this is the draw that reads it: a **weighted pick preserving the pool's
 * order**, so a race written into the pool four times in eight is drawn half the time. Nothing
 * here prefers one band of the draw over another — a stranger is drawn from the pool by where
 * they are standing, and nothing else.
 *
 * @param {readonly string[]} pool  `raceMixFor(provinceID)`
 * @param {number} draw  0…1 (see `raceDraw`)
 * @returns {string|null} a race this module can paint, or null when the pool names none
 */
export function raceFromPool(pool, draw) {
  if (!pool || !pool.length) return null;
  const t = Number(draw);
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor((Number.isFinite(t) ? t : 0) * pool.length)));
  const race = pool[i];
  return hasRace(race) ? race : null;
}

/**
 * A stable 0…1 for one person, from the things that identify them: their cell and their outfit.
 *
 * The law is the regard ledger's own (`game/regard.js`'s `personId`): **the same man on the same
 * paving stone is the same man every visit**, so his race cannot move either. The cell is the one
 * he was *placed* on — the one that does not move as he walks — and the outfit is what the pool
 * gave him, so the same draw always names the same race for the same figure.
 *
 * FNV-1a over the identity text, plain 32-bit arithmetic, no randomness.
 *
 * @param {number} seed @param {number} row @param {number} col @param {string} key
 * @returns {number} 0 ≤ n < 1
 */
export function raceDraw(seed, row, col, key) {
  let h = 2166136261 >>> 0;
  const text = `${(seed ?? 0) >>> 0}|${row ?? 0}|${col ?? 0}|${key ?? ''}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

/**
 * A placed figure's race: the province's mix, drawn from their own cell and outfit.
 *
 * @param {{pool: readonly string[]|null, seed: number, row: number, col: number, key: string}} person
 * @returns {string|null}
 */
export function raceForPerson(person) {
  return raceFromPool(person?.pool, raceDraw(person?.seed, person?.row, person?.col, person?.key));
}

/**
 * **THE RACES THIS INSTALL DRAWS WITH THEIR OWN FIGURE** rather than with a palette (D-45).
 *
 * One race, and it is the owner's own: *"argonians should be all lizard man not green people"*.
 * Arena ships no Argonian citizen art, so the port had answered with the palette half of D-45 —
 * the marsh's folk were the install's own human body with a green ramp painted over its face,
 * which is exactly the "green people" the owner refused. `peopleKinds.js` already carries the
 * honest answer and always did: `LIZARD1.CFA`…`LIZARD6.CFA`, the Lizard Man's five directions and
 * its death, standing in for the Argonians this install does not draw. A race named here is
 * therefore drawn from **that figure**, whole — and **no palette is laid over it**, because the
 * art already *is* the race (a lizard painted green is a green lizard, and a lizard painted with a
 * Dunmer's ramp is the same mistake in another colour, measured 2026-10-17 in Lilmoth as
 * `LIZARD1.CFA#darkElf`).
 *
 * The key is `peopleKinds.js`'s `RACE_STAND_INS` key, which is where the figure's own files live;
 * `scenes/interior.js` does the swapping (it owns the crowd), and this table is the law it reads.
 * A race **not** named here keeps the palette law above, which is what a body this install cannot
 * redraw at all needs.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const RACE_FIGURE = Object.freeze({
  argonian: 'ARGONIAN',
  // **The cat, from the wolf** (the owner, 2026-10-18): *"you might instead of coloring people for
  // khajeets you might uuse the white wolf sprite make it orange with stripes and use it as a
  // khajeet npc to make it more lore accurate"*. The archive's snow wolf (`SWOLF01.CFA`…) is the
  // one five-direction figure whose silhouette reads as a cat at Arena's resolution, and its
  // white fur ramp is repainted tawny below (`KHAJIIT_FUR`) — orange, with the ramp's own steps
  // alternating light and dark so the shading reads as stripes.
  khajiit: 'KHAJIIT',
});

/**
 * The stand-in figure a race is drawn from, or null when the race is a skin rather than a body.
 *
 * @param {string|null} race
 * @returns {string|null} a `peopleKinds.js` stand-in key, e.g. `ARGONIAN`
 */
/**
 * **The race a stand-in figure *is*** — the inverse of `RACE_FIGURE`.
 *
 * A figure from `peopleKinds.js`'s stand-ins is a whole body, and its race is its own: a wolf's
 * sheets are a Khajiit whatever a province's race pool says. The crowd read this the other way
 * round and gave a swim in human skins — measured on a Riverhold page, 2026-10-18:
 * `SWOLF03.CFA#breton+blonde` and `SWOLF04.CFA#imperial+brown`, a cat under a Breton's face and a
 * Breton's hair. The lizard half had been special-cased by name; this is the same law for every
 * figure the table names.
 *
 * @param {string|null} key  a `peopleKinds.js` kind key, e.g. `KHAJIIT`
 * @returns {string|null} a `raceSkin.js` race key, e.g. `khajiit`
 */
export function raceOfFigure(key) {
  const upper = typeof key === 'string' ? key.toUpperCase() : '';
  if (!upper) return null;
  for (const [race, figure] of Object.entries(RACE_FIGURE)) if (figure === upper) return race;
  return null;
}

export function figureKindFor(race) {
  // **Both spellings of a race answer here**, because the game carries two: a province's
  // crowd holds the pool's own key (`argonian`, `provinceStyle.js`), and the player's own
  // record holds the display name (`Argonian`, `game/character.js`'s `RACES`). The table is
  // keyed in the lowercase and the lookup folds what it is given, so "an Argonian is drawn as
  // the Lizard Man" is one law for the player and for the street rather than two that agree
  // only by accident.
  const key = typeof race === 'string' ? race.toLowerCase() : null;
  return key && Object.hasOwn(RACE_FIGURE, key) ? RACE_FIGURE[key] : null;
}

/**
 * The hair colour one person is given, drawn from the same identity their race is.
 *
 * The owner: *"you could also have the blonde hair in npcs change color to a random hair color
 * like you do with the skin color to make more npc variety"*. It is the same law as the race —
 * FNV-1a over **their cell and their outfit** (`raceDraw`) with one extra word in the text, so a
 * street's six colours are spread over its people, the same man gets the same hair on every
 * visit, and his hair does not move when his face's own draw is a different number.
 *
 * @param {{seed: number, row: number, col: number, key: string}} person
 * @returns {string|null} a `HAIR_COLORS` key, or null for a figure that should keep Arena's own
 */
export function hairForPerson(person) {
  if (!person) return null;
  const draw = raceDraw(person.seed, person.row, person.col, `${person.key ?? ''}|hair`);
  const i = Math.min(HAIR_KEYS.length - 1, Math.floor(draw * HAIR_KEYS.length));
  return HAIR_KEYS[i] ?? null;
}

/**
 * **THE KHAJIIT'S FUR** — the snow wolf's white ramp, repainted tawny with stripes.
 *
 * Arena draws no Khajiit and no cat at all; the snow wolf is the install's only five-direction
 * creature whose head and body read as a feline, so the owner's instruction is to repaint it. The
 * wolf paints its coat from six contiguous `PAL.COL` entries (measured on `SWOLF01.CFA`: 16
 * `#d4e8f8` light … 21 `#76808e` dark, 5 900–8 300 pixels each). Those six are mapped onto six
 * oranges **alternating light and dark** — the art's own shading is drawn in broad fur bands, so
 * alternating the ramp turns those bands into stripes rather than a flat orange dog.
 *
 * The blue eyes (62/63) are repainted black in `catFrameRgba`, because the owner's cat has black
 * eyes; the cyan collar (126/127) and the dark muzzle (147) are **not** touched, because a repaint
 * of the coat is not a repaint of the creature.
 *
 * @type {ReadonlyArray<readonly [number, readonly [number, number, number]]>}
 */
export const KHAJIIT_FUR = Object.freeze([
  Object.freeze([16, Object.freeze([0xf2, 0xae, 0x4a])]),
  Object.freeze([17, Object.freeze([0xc9, 0x6d, 0x14])]),
  Object.freeze([18, Object.freeze([0xe6, 0x94, 0x2c])]),
  Object.freeze([19, Object.freeze([0xa9, 0x52, 0x0c])]),
  Object.freeze([20, Object.freeze([0xd2, 0x7c, 0x1e])]),
  Object.freeze([21, Object.freeze([0x8a, 0x3d, 0x08])]),
]);

/** The skin spec that asks for the Khajiit's fur instead of a human race's skin. */
export const KHAJIIT_FUR_SPEC = 'khajiitFur';

/**
 * The wolf art's blue eye indices. `63` is the eye proper (26 pixels on `SWOLF01`),
 * and `62` its darker rim (2 pixels) — both are saturated VGA blue and both have to go
 * black, or the cat keeps one blue fleck in each eye.
 */
export const KHAJIIT_EYE_INDICES = Object.freeze([62, 63]);
/** @deprecated The first of the two eye entries; kept for callers that name one. */
export const KHAJIIT_EYE_INDEX = 63;
const KHAJIIT_EYE_INDICES_SET = new Set(KHAJIIT_EYE_INDICES);
const KHAJIIT_EYE_RGB = Object.freeze([18, 15, 13]);

/**
 * **THE COATS OF ELSWEYR** — the snow wolf's own ramp in more than one colour.
 *
 * The owner, 2026-10-18: *"focus on khajeet npcs"*. One repainted wolf makes every cat in Elsweyr
 * the same cat, and a province's street has to read as a *people*, not one figure repeated — the
 * same law the races and the hair already keep. The six entries below are the wolf's coat ramp
 * (`KHAJIIT_FUR`, measured: `SWOLF01.CFA` paints `PAL.COL` 16…21), and each coat is a ramp over
 * the same six, alternating light and dark so the art's own fur bands still read as stripes:
 *
 *   * `tawny` — the orange the owner asked for ("make it orange with stripes"), and the default;
 *   * `sandy` — the pale desert cat of the Elsweyr dunes;
 *   * `black` — a Suthay-raht of the deep jungle, its stripes the grey of the art's hilights;
 *   * `grey`  — a Cathay, silvered.
 *
 * A coat is a **sheet key** (`raceSheetKey`), not a second drawing, so each coat costs one palette
 * and the wolf's own bytes stay the install's.
 *
 * @type {Readonly<Record<string, ReadonlyArray<readonly [number, readonly [number, number, number]]>>>}
 */
/**
 * The markings laid over a coat's base ramp: a spot colour and a pale underside.
 *
 * The first passes painted the coat with bars, a wide and a thin wave across the body, and the
 * owner's verdict was that the result read as a tiger rather than a cat. A Khajiit's fur is
 * ticked and rosetted, not barred, so `catFrameRgba` draws small broken spots and a faint
 * underside, and these are the colours it draws them in. The spots are a deep umber for the
 * tawny and sandy coats (a dark brown, not ink), near-black for the black coat and charcoal
 * for the grey.
 *
 * @type {Readonly<Record<string, {mark: readonly number[], cream: readonly number[]}>>}
 */
export const KHAJIIT_MARKINGS = Object.freeze({
  tawny: Object.freeze({ mark: Object.freeze([0x5a, 0x30, 0x14]), cream: Object.freeze([0xf1, 0xdc, 0xb4]) }),
  sandy: Object.freeze({ mark: Object.freeze([0x6e, 0x52, 0x34]), cream: Object.freeze([0xf3, 0xe8, 0xd0]) }),
  black: Object.freeze({ mark: Object.freeze([0x1e, 0x1c, 0x1b]), cream: Object.freeze([0xb8, 0xb0, 0xa4]) }),
  grey: Object.freeze({ mark: Object.freeze([0x44, 0x4a, 0x52]), cream: Object.freeze([0xe8, 0xe4, 0xdb]) }),
});

export const KHAJIIT_COATS = Object.freeze({
  tawny: KHAJIIT_FUR,
  sandy: Object.freeze([
    Object.freeze([16, Object.freeze([0xe9, 0xd3, 0x9c])]),
    Object.freeze([17, Object.freeze([0xbd, 0x9d, 0x62])]),
    Object.freeze([18, Object.freeze([0xdc, 0xbe, 0x80])]),
    Object.freeze([19, Object.freeze([0x9c, 0x7d, 0x44])]),
    Object.freeze([20, Object.freeze([0xc9, 0xa6, 0x69])]),
    Object.freeze([21, Object.freeze([0x7c, 0x5e, 0x2b])]),
  ]),
  black: Object.freeze([
    Object.freeze([16, Object.freeze([0x6f, 0x6b, 0x66])]),
    Object.freeze([17, Object.freeze([0x33, 0x30, 0x2d])]),
    Object.freeze([18, Object.freeze([0x55, 0x51, 0x4d])]),
    Object.freeze([19, Object.freeze([0x24, 0x22, 0x20])]),
    Object.freeze([20, Object.freeze([0x45, 0x41, 0x3e])]),
    Object.freeze([21, Object.freeze([0x15, 0x14, 0x13])]),
  ]),
  grey: Object.freeze([
    Object.freeze([16, Object.freeze([0xd9, 0xdd, 0xe2])]),
    Object.freeze([17, Object.freeze([0x94, 0x9b, 0xa4])]),
    Object.freeze([18, Object.freeze([0xbc, 0xc2, 0xc9])]),
    Object.freeze([19, Object.freeze([0x74, 0x7b, 0x84])]),
    Object.freeze([20, Object.freeze([0xa7, 0xad, 0xb5])]),
    Object.freeze([21, Object.freeze([0x55, 0x5b, 0x63])]),
  ]),
});

/**
 * The skin spec for one coat. The **tawny** coat is the bare spec, so every key already written
 * (`khajiitFur`) keeps meaning what it meant and a page holding one still draws a cat.
 *
 * @param {string} [coat]  a `KHAJIIT_COATS` key
 * @returns {string}
 */
export function khajiitCoatSpec(coat = 'tawny') {
  const key = Object.hasOwn(KHAJIIT_COATS, coat) ? coat : 'tawny';
  return key === 'tawny' ? KHAJIIT_FUR_SPEC : `${KHAJIIT_FUR_SPEC}:${key}`;
}

/**
 * Which coat one cat-folk is born with, from the same identity draw their face uses.
 *
 * Tawny is weighted (three draws in six) because it is the coat the owner named; the other three
 * share the rest, so a street of Elsweyr holds a majority of orange cats and a few sandy, black
 * and grey ones — a crowd, not a uniformity. The same person keeps the same coat on every visit.
 *
 * @param {{seed: number, row: number, col: number, key?: string}} person
 * @returns {string} a `KHAJIIT_COATS` key
 */
export function khajiitCoatFor(person) {
  if (!person) return 'tawny';
  const draw = raceDraw(person.seed, person.row, person.col, `${person.key ?? ''}|coat`);
  if (draw < 0.5) return 'tawny';
  if (draw < 0.7) return 'sandy';
  if (draw < 0.87) return 'black';
  return 'grey';
}

/**
 * **Paint one Khajiit frame per pixel**, over the wolf's own coat.
 *
 * A palette recolour gives every source shade one colour, which is why a coat written that way is a
 * flat orange, so the frame is expanded to RGBA and only the wolf's coat indices (16…21) are
 * repainted. The one thing outside the coat is the eye: the wolf's blue becomes a black slit, as the
 * owner's cat has. The collar and the muzzle keep Arena's own colours.
 *
 * The coat is built in three layers, all deterministic in the pixel's own position:
 *
 *   1. **The base coat**: the coat's light and dark anchors interpolated by the source pixel's own
 *      shade, which keeps the art's form shading.
 *   2. **Markings**: a sparse field of two incommensurate waves whose crests are small, broken spots
 *      (a cat's ticking and rosettes). The field is never a band across the body, and only its
 *      crests are painted, so most of the fur stays clean.
 *   3. **Countershading**: a faint pale underside on the belly, kept low so the coat does not read as
 *      a patterned hide.
 *
 * @param {Uint8Array|Uint8ClampedArray} indices  the frame's palette indices
 * @param {number} width @param {number} height
 * @param {{rgb: Uint8Array}} palette  the palette the frame's non-coat pixels use
 * @param {string} [coat]  a `KHAJIIT_COATS` key
 * @returns {Uint8ClampedArray} `width * height * 4`, bottom-up, index 0 transparent
 */
export function catFrameRgba(indices, width, height, palette, coat = 'tawny') {
  const out = toRgba(indices, palette, { width, height, rowsBottomUp: true });
  const key = Object.hasOwn(KHAJIIT_COATS, coat) ? coat : 'tawny';
  const ramp = KHAJIIT_COATS[key];
  const marks = KHAJIIT_MARKINGS[key] ?? KHAJIIT_MARKINGS.tawny;
  const light = ramp[0][1], dark = ramp[ramp.length - 1][1];
  const shadeOf = new Map(ramp.map(([index, colour], i) => [index, { colour, shade: i / (ramp.length - 1) }]));
  for (let y = 0; y < height; y++) {
    // The source rows run top-down; `toRgba` wrote them bottom-up, so the paint target is the
    // mirrored row. The marking field is in **source** coordinates, so the spots sit on the body
    // rather than on the renderer's row order.
    const outRow = height - 1 - y;
    const fy = height <= 1 ? 0.5 : y / (height - 1);
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x];
      const entry = shadeOf.get(v);
      if (KHAJIIT_EYE_INDICES_SET.has(v)) {
        // The wolf's eye is a saturated blue; the Khajiit's is a black slit. Keep it opaque so
        // the eye reads as painted rather than as a hole in the mask.
        const eye = (outRow * width + x) * 4;
        out[eye] = KHAJIIT_EYE_RGB[0];
        out[eye + 1] = KHAJIIT_EYE_RGB[1];
        out[eye + 2] = KHAJIIT_EYE_RGB[2];
        out[eye + 3] = 255;
        continue;
      }
      if (!entry) continue;
      const fx = width <= 1 ? 0.5 : x / (width - 1);
      // 1. base coat, with the art's own shade.
      let r = light[0] + (dark[0] - light[0]) * entry.shade;
      let g = light[1] + (dark[1] - light[1]) * entry.shade;
      let b = light[2] + (dark[2] - light[2]) * entry.shade;
      // 2. markings: only the crests of a sparse field are painted, so they read as broken spots.
      const field = Math.sin(x * 0.83 + 0.9 * Math.sin(y * 0.41)) * Math.sin(y * 0.67 + 0.6 * Math.cos(x * 0.29));
      if (field > 0.9) {
        const crest = Math.min(1, (field - 0.9) / 0.1);
        const strength = 0.7 * crest;
        r += (marks.mark[0] - r) * strength;
        g += (marks.mark[1] - g) * strength;
        b += (marks.mark[2] - b) * strength;
      }
      // 3. countershading: a faint pale underside, kept low so the coat is not a patterned hide.
      const belly = Math.max(0, 1 - Math.abs(fx - 0.52) / 0.34) * Math.max(0, 1 - Math.abs(fy - 0.66) / 0.30);
      const cream = belly * (0.12 + 0.12 * (1 - entry.shade));
      if (cream > 0.02) {
        r += (marks.cream[0] - r) * cream;
        g += (marks.cream[1] - g) * cream;
        b += (marks.cream[2] - b) * cream;
      }
      const o = (outRow * width + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * The sheet key one person's figure is loaded and drawn under.
 *
 * A race is a **second texture**, not a second drawing: `PAL.COL` with six entries moved and the
 * sheets left alone, so a person's artefact is the install's own file with a suffix — and a figure
 * with no race (a province this table knows nothing about, a monster) keeps the plain name and
 * Arena's own skin. The scene loads, batches and draws a person by this key, which is what keeps
 * one street's Dunmer and the next street's Nord from sharing a texture.
 *
 * @param {string|null} race @param {string} file  e.g. `MLGEN01W.CFA`
 * @returns {string} e.g. `MLGEN01W.CFA#darkElf`
 */
export function raceSheetKey(spec, file) {
  return hasSkin(spec) && file ? `${file}#${spec}` : file;
}
