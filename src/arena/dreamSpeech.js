// THE DREAM'S SPEECH — how long the narration after creation actually lasts.
//
// Arena's post-creation dream is `VISION.FLC` with Ria's narration over it. The movie itself is
// 3.4 seconds long (20 frames at 171 ms), but the narration is a run of `.VOC` clips in
// `SPEECH/`, one per spoken line of key `1400`, and those clips set how long the scene lasts.
//
// The lengths live in `arena/storySpeech.js` with every other story beat's, read from the
// install's own clip headers by `arena/vocFile.js`; this module names the dream's own key so a
// caller that only wants the dream does not have to know the table.
//
//   SPEECH/1400_00A.VOC … 1400_10A.VOC   21 clips, 133.3 seconds in all

import { STORY_SPEECH, narrationMs } from './storySpeech.js';

/** The `TEMPLATE.DAT` key of the dream after creation. */
export const DREAM_TEXT_KEY = 1400;

/** Each clip's length in seconds, in file-name order. */
export const DREAM_NARRATION_SECONDS = Object.freeze([...STORY_SPEECH[DREAM_TEXT_KEY]]);

/** The narration's whole length, in milliseconds. */
export const DREAM_NARRATION_MS = narrationMs(DREAM_TEXT_KEY);
