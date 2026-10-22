// WHICH PALETTE A CREATURE SHEET IS DRAWN IN — measured, not guessed.
//
// The owner, 2026-10-18: *"some sprites like the litch and the ghost are rainbowy and dont have
// their proper textures"*.
//
// Arena's `.CFA` pixel bytes are **palette indices**, and almost every sheet in this install is
// authored against `PAL.COL` — the same 256-entry table the walls use. Two of them are not:
// `GHOST1.CFA` and `WRAITH1.CFA` are drawn in the **character-sheet palette**
// (`CHARSHT.COL`), where indices 1…7 are skin tones. Under `PAL.COL` those same indices are
// VGA's diagnostic colours — pure blue, green, cyan, red, magenta, orange and grey — which is
// exactly the rainbow the owner saw.
//
// This is a **measured** rule rather than a name list, and it is stated as one so a sheet that
// behaves this way next time is fixed by the same law. Swept over the twenty-four monster
// families on 2026-10-18 (`<BASE>1.CFA`, every frame):
//
//   * `GHOST1.CFA` spends **15.2 %** of its pixels on indices 1…7, `WRAITH1.CFA` **6.0 %**;
//   * every other family — rat, goblin, wolf, snow wolf, lizard, skeleton, orc, ghoul, spider,
//     minotaur, hell hound, troll, zombie, homonculus, ice/stone/iron golem, fire daemon, medusa,
//     vampire, **lich**, Jagar Tharn — spends **0.0 %** on them.
//
// No hand-inked sprite paints a fifth of itself in pure VGA diagnostic colours on purpose, so the
// test is: **a sheet whose pixels lean on the diagnostic run is a character-palette sheet.** One
// percent is far above the 0.0 % of the other twenty-two and far below the 6 % of the lowest
// offender, so it separates the families without a filename test.
//
// The lich is *not* on this list: its bytes index `PAL.COL` (dark blue-greys, its own art), and
// the rainbow the owner saw on it was the ghost/wraith art beside it in the same room. The
// measured sweep is what says so.

/** The palette a character-palette sheet is drawn from — the portraits/people table. */
export const CHARACTER_PALETTE = 'CHARSHT.COL';

/** The palette every other sheet is drawn from — the world's own table. */
export const WORLD_PALETTE = 'PAL.COL';

/** Indices 1…7 are VGA diagnostic colours in `PAL.COL` and skin tones in `CHARSHT.COL`. */
export const DIAGNOSTIC_INDICES = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

/** Above this share of diagnostic pixels, a sheet is a character-palette sheet. */
export const CHARACTER_PALETTE_SHARE = 0.01;

/**
 * What share of a sheet's opaque pixels land on the diagnostic run.
 *
 * Indices count across **every frame** of the sheet, because the walk and attack frames are the
 * same art recoloured by index and a rule read off frame 1 alone would miss a sheet whose first
 * view is a silhouette.
 *
 * @param {ArrayLike<number>|Array<ArrayLike<number>>} frames  one frame's indices, or many
 * @returns {number} 0…1
 */
export function diagnosticShare(frames) {
  const lists = Array.isArray(frames) && frames.length && typeof frames[0] === 'object'
    ? frames.map((frame) => frame?.indices ?? frame ?? [])
    : [frames ?? []];
  let hits = 0;
  let total = 0;
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const value = list[i];
      // Index 0 is transparent, and it is in every sheet; it is not a colour at all.
      if (value === 0) continue;
      total++;
      if (value >= 1 && value <= 7) hits++;
    }
  }
  return total ? hits / total : 0;
}

/**
 * **Does this sheet need the character palette?**
 *
 * @param {Array<{indices: ArrayLike<number>}>|ArrayLike<number>} frames  a `.CFA`'s frames
 * @returns {boolean}
 */
export function usesCharacterPalette(frames) {
  return diagnosticShare(frames) > CHARACTER_PALETTE_SHARE;
}

/**
 * The palette name a sheet should be uploaded with.
 *
 * A caller's own choice (`?sprites=DAYTIME`, the daylight pass) wins, because that is a lighting
 * decision about the whole scene; this rule only decides between the two base tables.
 *
 * @param {Array<{indices: ArrayLike<number>}>|ArrayLike<number>} frames
 * @param {string} [asked]  the palette the scene asked for
 * @returns {string}
 */
export function paletteNameForSheet(frames, asked = WORLD_PALETTE) {
  const wanted = String(asked ?? WORLD_PALETTE).toUpperCase();
  if (wanted !== WORLD_PALETTE) return wanted;
  return usesCharacterPalette(frames) ? CHARACTER_PALETTE : WORLD_PALETTE;
}

/**
 * **The ramp the two spectral sheets are drawn with** — indices 1…13, darkest first.
 *
 * The owner, 2026-10-19: *"ghosts and wraiths texture is bugged and all white instead of their
 * normal arena texture"*. The palette rule above had already stopped the rainbow; what it put in
 * its place was `CHARSHT.COL`'s **skin ramp**, whose entries 1–13 are eleven nearly identical
 * creams (`#d3cbb3` … `#b7856b`). Measured over every frame of both sheets, 88 % of `GHOST1`'s
 * opaque pixels fall in the two brightest buckets of that ramp — a featureless pale blob, which is
 * exactly the white the owner saw. The art is not flat: it is a **13-step gradient** (the ASCII
 * read of `GHOST1.CFA` frame 0 fills its hood with 1,2,3,4,5,7,9,A,B,C), so the fix is a palette
 * whose 1–13 are a ramp again.
 *
 * **The colours are this project's choice and are marked as such**: the install ships four palettes
 * and none of them is a ghost ramp (`PAL.COL`'s 1–15 are the VGA diagnostic set, `DAYTIME.COL`'s
 * are night blues, `DREARY.COL`'s are dark greys). What Arena's own spectral table looked like is
 * not in this checkout. This one is a cool grey-blue from a near-black at index 1 to a pale
 * spectral white at 13, so the shading the art carries reads again and the creature looks like the
 * ghost it is drawn as rather than a bare body.
 */
export const SPECTRAL_RAMP = Object.freeze([
  [22, 26, 34], [30, 36, 46], [39, 47, 58], [49, 59, 71], [60, 72, 85], [72, 86, 99],
  [85, 100, 114], [99, 115, 129], [114, 131, 145], [130, 147, 161], [147, 164, 178],
  [165, 182, 195], [184, 200, 211], [203, 217, 226], [222, 234, 241],
]);

/**
 * A palette whose spectral entries are `SPECTRAL_RAMP` and whose others are the base's own.
 *
 * A copy, never the caller's palette: the same `CHARSHT.COL` is the table every portrait and every
 * person is drawn with, and one ghost must not tint the town.
 *
 * @param {{rgb: Uint8Array}} base  the palette the sheet was assigned
 * @returns {{rgb: Uint8Array}}
 */
export function spectralPalette(base) {
  const rgb = Uint8Array.from(base?.rgb ?? new Uint8Array(768));
  // Index 0 is transparency (`toRgba` writes it as a hole whatever the table says); kept black so
  // the table reads as a palette rather than as a copy with a stray colour in slot zero.
  rgb[0] = 0; rgb[1] = 0; rgb[2] = 0;
  for (let i = 0; i < SPECTRAL_RAMP.length; i++) {
    const [r, g, b] = SPECTRAL_RAMP[i];
    rgb[(i + 1) * 3] = r;
    rgb[(i + 1) * 3 + 1] = g;
    rgb[(i + 1) * 3 + 2] = b;
  }
  return { rgb };
}

/**
 * **The palette to upload a sheet with**, which is the name's answer and then the spectral ramp.
 *
 * Kept beside `paletteNameForSheet` so a caller cannot take one half without the other: a sheet the
 * measured rule calls a character-palette sheet is a spectral sheet, and its download is that
 * palette with the ramp written over it.
 *
 * @param {Array<{indices: ArrayLike<number>}>|ArrayLike<number>} frames
 * @param {string} [asked]
 * @param {(name: string) => Promise<{rgb: Uint8Array}>|{rgb: Uint8Array}} load  the palette table
 * @returns {Promise<{rgb: Uint8Array}>}
 */
export async function paletteForSheet(frames, asked, load) {
  const base = await load(paletteNameForSheet(frames, asked));
  return usesCharacterPalette(frames) ? spectralPalette(base) : base;
}
