// VIDEO SETTINGS THE PLAYER ASKS FOR — Arena's own 320×200 picture, on or off.
//
// The owner, 2026-10-19: *"add in the setting a tick to set on and off the 320x200 resolution
// to see the game how it would look originally"*. The renderer already carries DFU's retro
// machinery (`engine/render/retroPass.js` and `engine/systems/retroMode.js`): the world is drawn
// into a small image and presented point-sampled to the canvas. This module is the one setting
// that asks for the 1994 size, kept as a **pref** so a player's choice survives every page.
//
// It is deliberately not `engine/systems/retroMode.js`'s settings store: that file is
// Daggerfall's `Video` section, and this project's menu has no settings file behind it. One
// key, one boolean, the same `localStorage` discipline as the music and sound levels.

/** Where the player's choice lives. */
export const RETRO_320_KEY = 'pa.video.retro320';

/** The world's image: Arena's VGA mode, 320×200, as `retroTargetSize(1, false)` has it. */
export const RETRO_320_FRAME = Object.freeze({
  width: 320,
  height: 200,
  hudWidth: 320,
  hudHeight: 200,
  post: 0,       // no posterization: the install's own palette, not a filter over it
  lutShift: 0,
  mipmaps: false // the original had no mip chains
});

/** Is the player looking through Arena's own pixels? @returns {boolean} */
export function retro320Enabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(RETRO_320_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Turn the 320×200 picture on or off, and remember it.
 *
 * @param {boolean} on
 * @returns {boolean} the state actually held
 */
export function setRetro320(on) {
  const wanted = Boolean(on);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RETRO_320_KEY, wanted ? '1' : '0');
  } catch { /* a browser that refuses storage still gets the picture for this page */ }
  return wanted;
}

/** The frame the renderer is asked for, or null (the whole canvas). */
export function retro320Frame() {
  return retro320Enabled() ? RETRO_320_FRAME : null;
}
