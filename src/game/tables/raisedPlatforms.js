// RAISED-PLATFORM GEOMETRY TABLES — **RECONSTRUCTED, NOT EXTRACTED**.
//
// Arena's raised platforms (the steps, crates, tables, daises and shop counters in
// dungeons, cities and the wilderness) are the low boxes a MAP1 voxel can be
// instead of a wall. Their geometry is not stored in the `.MIF`; it is *indexed*
// by it. A raised-platform MAP1 voxel's most-significant byte reads
// `0x0tttthhh`: `hhh` selects a height, `tttt` selects a thickness, and both index
// arrays that live inside `A.EXE`:
//
//     boxArrays[56] = heightsInterior[8], heightsCity[8], heightsWild[8],
//                     thicknessesInterior[16], thicknessesCity[16] (= wilderness), spare[8]
//
// **This project's Arena folder contains no `A.EXE`** — only `ACD.EXE`, which is
// PKLITE-packed (verified: its MZ stub carries the string "PKLITE Copr. 1990-").
// OpenTESArena reads these arrays from a *decompressed* `A.EXE` by byte offset,
// so with this data set they are simply not available.
//
// The arrays below are therefore a **reconstruction**, chosen so that:
//   * index 0 is flat ground (a zero-height platform), because the index appears
//     in ordinary floor-adjacent voxels and must not raise anything;
//   * the sequence is monotonically increasing, which is the only structural
//     property the original guarantees (the index is a size *selector*);
//   * values are in Arena's "centimetre-like" units, where the player's eye is at
//     60 and a voxel is 128 — so a step is 8–24 (a shin), a table 40–56, a crate
//     64–80, and the tallest interior platform stays under a 100-high ceiling.
//
// Consequence: **step and platform heights are approximate**. Nothing else in the
// map depends on them; walls, doors, floors and the ceiling are all exact. This is
// logged as simplification S9 in docs/PROGRESS.md and is the one place where the
// missing `A.EXE` changes what the player sees.

/** Interior/dungeon base offsets, in Arena units (≈ cm). */
export const HEIGHTS_INTERIOR = Object.freeze([0, 8, 16, 24, 32, 48, 64, 80]);
/** City base offsets, in Arena units. */
export const HEIGHTS_CITY = Object.freeze([0, 16, 24, 32, 48, 64, 80, 96]);
/** Wilderness base offsets, in Arena units. */
export const HEIGHTS_WILD = Object.freeze([0, 8, 16, 24, 32, 48, 64, 80]);

/** Interior platform thicknesses (box sizes), in Arena units. */
export const THICKNESSES_INTERIOR = Object.freeze([8, 12, 16, 24, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128, 144, 160]);
/** City and wilderness platform thicknesses, in Arena units. */
export const THICKNESSES_CITY = Object.freeze([8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 192, 224, 256, 288]);

/** Where the numbers came from — recorded per the brief's "record which" rule. */
export const SOURCE = 'RECONSTRUCTED (A.EXE absent; PKLITE-packed ACD.EXE present instead). Structure from OpenTESArena ExeDataRaisedPlatforms; values chosen, not extracted.';

/**
 * The tables for one map type.
 * @param {'interior'|'city'|'wilderness'} mapType
 * @returns {{heights: readonly number[], thicknesses: readonly number[], defaultBoxScale: number}}
 */
export function platformTables(mapType) {
  if (mapType === 'city') return { heights: HEIGHTS_CITY, thicknesses: THICKNESSES_CITY, defaultBoxScale: 256 };
  if (mapType === 'wilderness') return { heights: HEIGHTS_WILD, thicknesses: THICKNESSES_CITY, defaultBoxScale: 192 };
  return { heights: HEIGHTS_INTERIOR, thicknesses: THICKNESSES_INTERIOR, defaultBoxScale: 192 };
}
