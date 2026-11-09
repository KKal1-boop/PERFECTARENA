// THE PLAYER'S WOUND, ON THE SCREEN — Daggerfall's `ShowPlayerDamage`.
//
// Daggerfall's `ui/damageFlash.js` is thirty-seven lines and one law: a blow sets a flat red
// quad to **0.4 alpha**, and the alpha falls at **0.7 a second** on the real clock — a touch
// under six tenths of a second. It rides `PlayerHealth.RemoveHealth`, so a creature's blow, a
// damage trap and a fall flash; spell damage, poison and disease do not. That distinction is
// kept here: the scene calls `flash()` for a physical blow and never for a spell.
//
// The same file's `bloodScreen.js` adds the heavier version: a blow that takes a real share of
// the player's health in one frame throws drops on the lens. This module keeps the **amount**
// law pure (`screenDrops`) and leaves the drawing to the page's CSS layer; the scene only sets
// the flash's alpha each frame.
//
// The scene owns the DOM element (`#damageflash`); this module owns the clock, so a unit test
// can walk a whole fade without a browser.

/** `ShowPlayerDamage.cs:35` — the alpha a flash starts at. */
export const FLASH_ALPHA = 0.4;
/** `:25` — alpha lost per real second. */
export const FLASH_FADE_SPEED = 0.7;
/** The share of a life lost in one frame that throws blood on the lens. */
export const SCREEN_SPATTER_MIN = 0.1;
/** The most drops one blow may throw, and the share of a life that reaches it. */
export const SCREEN_DROPS_MAX = 5;
export const SCREEN_DROPS_AT = 0.5;

/**
 * Daggerfall's flash state: `flash()` restarts at 0.4, `tick(dt)` fades on the real clock.
 *
 * Re-flashing restarts at `FLASH_ALPHA` rather than stacking darker, exactly as the reference
 * does; two blows in one second refill the same fade. A spell's hit calls `flash` only when the
 * scene decides it should, which is never for the reference's spell damage.
 *
 * @param {{alpha?: number, fadeSpeed?: number}} [opts]
 * @returns {{flash: (alpha?: number) => number, tick: (dt: number) => number,
 *   clear: () => void, readonly alpha: number, readonly fading: boolean}}
 */
export function createDamageFlash({ alpha = 0, fadeSpeed = FLASH_FADE_SPEED } = {}) {
  let value = Math.max(0, Math.min(1, Number(alpha) || 0));
  let fading = value > 0;
  const speed = Number.isFinite(fadeSpeed) && fadeSpeed > 0 ? fadeSpeed : FLASH_FADE_SPEED;
  return {
    flash(start = FLASH_ALPHA) {
      value = Math.max(0, Math.min(1, Number(start) || 0));
      fading = value > 0;
      return value;
    },
    tick(dt) {
      if (!fading) return 0;
      value -= speed * Math.max(0, Number(dt) || 0);
      if (value > 0) return value;
      value = 0;
      fading = false;
      return 0;
    },
    clear() {
      value = 0;
      fading = false;
    },
    get alpha() { return value; },
    get fading() { return fading; },
  };
}

/** The player's one flash, for the reason Daggerfall has one component on the player. */
export const playerDamageFlash = createDamageFlash();

/** The `RemoveHealth` edge: a physical blow, never a spell. */
export function flashPlayerDamage(alpha = FLASH_ALPHA) {
  return playerDamageFlash.flash(alpha);
}

/** How many screen drops a blow for `share` of max health throws. */
export function screenDrops(share) {
  if (!(share >= SCREEN_SPATTER_MIN)) return 0;
  const t = Math.max(0, Math.min(1, (share - SCREEN_SPATTER_MIN) / (SCREEN_DROPS_AT - SCREEN_SPATTER_MIN)));
  return Math.max(1, Math.round(1 + t * (SCREEN_DROPS_MAX - 1)));
}

/** Paint the flash's current alpha on the page's layer. Returns the alpha drawn. */
export function paintDamageFlash(element, flash = playerDamageFlash) {
  if (!element?.style) return 0;
  const alpha = Math.max(0, Math.min(1, Number(flash?.alpha) || 0));
  element.style.opacity = alpha > 0 ? alpha.toFixed(3) : '0';
  return alpha;
}
