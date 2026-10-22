// THE MAIN QUEST'S SPEECH — how long each beat's narration runs, from the install's own clips.
//
// Arena speaks its story: every beat is a run of `SPEECH/<key>_<nn><A|B>.VOC` clips. The scene
// lasts as long as those clips do (the movie loops under them), so this is the quest's clock.
// GENERATED from `arena/ARENA/SPEECH` with `vocSeconds` (which counts a clip's repeat blocks the
// way the player plays them). `tests/unit/storyscript.test.mjs` re-measures the install.

/** Clip lengths in seconds, keyed by `TEMPLATE.DAT` number, in file-name order. */
export const STORY_SPEECH = Object.freeze({
  1400: [7.166, 5.562, 6.479, 6.205, 7.233, 5.715, 4.845, 6.731, 6.507, 6.313, 7.09, 6.277, 7.005, 5.571, 7.126, 6.329, 6.642, 6.355, 6.398, 6.829, 4.88],
  1500: [6.539, 5.282, 6.934, 4.698, 5.64, 6.788, 5.257, 7.015],
  1294: [4.692, 5.364, 6.916, 5.586, 6.671, 6.109, 5.9, 4.87],
  1295: [6.525, 6.895, 6.988, 5.3, 6.134, 6.427, 7.115, 5.097, 5.555, 5.729],
  1296: [5.253, 7.128, 6.866, 5.076, 6.369, 6.308, 6.66, 6.983, 1.812],
  1297: [7.134, 5.026, 5.674, 7.2, 6.333, 6.514, 5.328, 7.033, 6.095],
  1298: [7.121, 6.479, 6.49, 7.129, 6.909, 5.435, 7.211, 5.839, 7.019],
  1299: [7.122, 5.442, 6.216, 6.529, 6.651, 7.134, 5.232],
  1300: [7.14, 6.955, 6.109, 7.093, 5.342, 6.319],
  1301: [6.436, 6.198, 7.003, 5.683, 6.664, 5.896, 1.787],
  1302: [7.026, 5.374, 6.492, 6.782, 6.934, 5.836, 5.673, 7.122, 7.171, 6.085, 7.075, 5.225, 7.001, 6.184, 5.811, 7.214, 7.037, 4.625, 6.294, 6.681, 6.995, 7.157, 7.218],
  1392: [5.875, 5.651, 5.418, 5.883, 5.232, 5.775, 5.237],
  1393: [4.955, 5.892, 2.39, 3.946],
  1394: [5.875, 5.745, 2.667, 5.662],
  1395: [5.451, 6.914, 5.792, 5.774, 5.876],
  1396: [5.841, 5.788, 3.473, 5.852],
  1397: [5.482, 5.878, 5.508],
  1398: [6.953, 5.694, 5.127, 5.791, 5.648],
  1399: [5.878, 5.727, 5.872, 5.107, 5.864],
  1447: [6.706, 5.017, 5.879, 5.688, 5.878, 4.724],
  // Ria's death, spoken over `VISION.FLC` when the player falls (the owner, 2026-10-22).
  1402: [6.418, 6.816, 2.216],
  1404: [3.915],
  1405: [5.775],
  1407: [5.873, 5.775, 5.77, 5.437],
});

/**
 * The narration's length for one key, in milliseconds.
 * @param {number} key
 * @returns {number|null} null when this install has no speech for the key
 */
export function narrationMs(key) {
  const clips = STORY_SPEECH[key];
  if (!Array.isArray(clips) || clips.length === 0) return null;
  return Math.round(clips.reduce((sum, s) => sum + s, 0) * 1000);
}

/** How many clips a key's speech has. */
export function narrationClips(key) {
  return STORY_SPEECH[key]?.length ?? 0;
}

/**
 * The clip files of one key, in the order the speech plays them.
 *
 * Arena names them `SPEECH/<key>_<nn><A|B>.VOC`, two clips to a page (`00A`, `00B`, `01A`, …);
 * OpenTESArena's `TextCinematicSpeechState::getVoiceFilename` is the same rule.
 *
 * @param {number} key
 * @returns {string[]}
 */
export function narrationFiles(key) {
  const clips = STORY_SPEECH[key];
  if (!Array.isArray(clips)) return [];
  return clips.map((_, i) => `SPEECH/${key}_${String(Math.floor(i / 2)).padStart(2, '0')}${i % 2 ? 'B' : 'A'}.VOC`);
}
