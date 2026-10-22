// THE PHONE IN HAND — A TOUCH LAYER THAT SPEAKS THE GAME'S OWN KEYS.
//
// The owner, 2026-10-22: *"the game needs COMPLETE ANDROID/IOS SUPPORT IF OPENED ON A PHONE
// WITHOUT ALTERING THE CODE OF THE GAME"*. So this is a layer, not a build: it attaches itself
// when the device reports a finger (`engine/ui/touchDevice.js`'s law — a coarse pointer with no
// hover, not a sniff at `ontouchstart`), draws the controls a phone needs, and then **presses
// the same keys the keyboard presses**. The scene, the motor, the fight and every panel already
// listen for those keys, so nothing in the game has to know a phone exists.
//
// ## What is on the screen
//
//   * **A stick, bottom left.** Pushing it past the rim's edge walks, past four fifths of it
//     runs, exactly as `Shift` does. It fills the four movement keys and lets go of them on
//     release, so the scene's held-key set is the same set a keyboard makes.
//   * **The view, everywhere else.** A drag turns the head through the host's own `look(dx,dy)`
//     — the seam the mouse already uses — so touch look and mouse look cannot drift apart.
//   * **A column of buttons, bottom right**: strike, use, talk, cast, guard, jump; and a short
//     row above them for the pack, the spellbook, the map, this level's map and the menu. Each
//     is a keydown + keyup of the real code, on the button's own press.
//   * **The hotbar's ten cells** are DOM buttons already (`#hotbar`), so a finger taps them
//     directly; nothing here has to duplicate them.
//
// A tap on the world is a `tap(x,y)` for a host that wants one (the scene aims `E` through the
// finger), and a drag never becomes a tap: the gesture is classified once, at release, the way
// `ui/touch.js`'s law for the twin project does it.
//
// Nothing here touches the renderer, the scene's state or the save. It is input, and only input.

import { isTouchDevice } from './touchDevice.js';

export { isTouchDevice };

/** The radius of the stick's travel, in CSS px. */
export const STICK_RADIUS = 64;
/** Past this share of the radius a push walks. */
export const STICK_DEAD_ZONE = 0.18;
/** Past this share it runs — the same "a full push is a run" rule the twin's stick uses. */
export const STICK_RUN = 0.8;
/** A finger that moves less than this, in CSS px, never turned the view. */
export const TAP_SLOP = 12;

/**
 * The stick's reading, as the four movement axes a keyboard would hold.
 *
 * The dead zone is a **rescale**, not a cut: the motion just outside it is the smallest walk,
 * which is what makes a stick feel analog instead of like four buttons.
 *
 * @param {number} dx  from the stick's centre, + right
 * @param {number} dy  from the stick's centre, + down
 * @param {number} [radius]
 * @returns {{x: number, y: number, run: boolean, forward: boolean, back: boolean, left: boolean, right: boolean}}
 */
export function stickAxis(dx, dy, radius = STICK_RADIUS) {
  const length = Math.hypot(dx, dy);
  const throw_ = Math.min(1, length / Math.max(1, radius));
  if (throw_ < STICK_DEAD_ZONE) return { x: 0, y: 0, run: false, forward: false, back: false, left: false, right: false };
  const scaled = (throw_ - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
  const ux = dx / (length || 1);
  const uy = dy / (length || 1);
  return {
    x: ux * scaled,
    y: uy * scaled,
    run: throw_ >= STICK_RUN,
    // A diagonal push is a diagonal walk: both axes cross the same threshold, so a stick at 45°
    // is a strafe and a forward together, exactly as `W` and `D` held together are.
    forward: -uy * scaled > 0.22,
    back: -uy * scaled < -0.22,
    left: ux * scaled < -0.22,
    right: ux * scaled > 0.22,
  };
}

/**
 * The key each button presses. `null` means the button is not drawn.
 *
 * The codes are the DOM's own (`KeyboardEvent.code`), which is what the scene's handler reads.
 *
 * @type {ReadonlyArray<{id: string, key: string, label: string, title: string, hold?: boolean}>}
 */
export const TOUCH_BUTTONS = Object.freeze([
  Object.freeze({ id: 'strike', key: 'KeyF', label: '⚔', title: 'Strike' }),
  Object.freeze({ id: 'use', key: 'KeyE', label: '✋', title: 'Take / enter / talk to what is in front' }),
  Object.freeze({ id: 'talk', key: 'KeyT', label: '☰', title: 'Speak to whoever is nearest' }),
  Object.freeze({ id: 'cast', key: 'KeyZ', label: '✦', title: 'Cast the spell last read' }),
  Object.freeze({ id: 'guard', key: 'KeyB', label: '⛨', title: 'Guard' }),
  Object.freeze({ id: 'jump', key: 'Space', label: '⤒', title: 'Jump' }),
]);

/** The row of screens above the fight buttons. */
export const TOUCH_SCREEN_BUTTONS = Object.freeze([
  Object.freeze({ id: 'pack', key: 'KeyI', label: 'Pack', title: 'Your pack' }),
  Object.freeze({ id: 'spells', key: 'KeyC', label: 'Spell', title: 'Your spellbook' }),
  Object.freeze({ id: 'map', key: 'KeyM', label: 'Map', title: 'The world map of Tamriel' }),
  Object.freeze({ id: 'automap', key: 'Tab', label: 'Level', title: 'The map of this level' }),
  Object.freeze({ id: 'menu', key: 'Escape', label: 'Menu', title: 'Pause' }),
]);

/** The `key` value a synthetic event carries, so handlers that read `e.key` see the truth. */
const KEY_NAME = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyF: 'f', KeyT: 't', KeyZ: 'z',
  KeyB: 'b', KeyI: 'i', KeyC: 'c', KeyM: 'm', KeyQ: 'q', KeyR: 'r', KeyV: 'v', KeyL: 'l',
  Space: ' ', Tab: 'Tab', Escape: 'Escape', Enter: 'Enter', ShiftLeft: 'Shift',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
};

/**
 * Dispatch a real keyboard event at the window.
 * @param {'keydown'|'keyup'} type @param {string} code
 */
export function pressKey(type, code) {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: KEY_NAME[code] ?? code, bubbles: true, cancelable: true }));
}

/** A quick tap of a key: down then up, one frame apart. */
export function tapKey(code) {
  pressKey('keydown', code);
  setTimeout(() => pressKey('keyup', code), 60);
}

const CSS = `
#touchcontrols{position:fixed;inset:0;z-index:8;pointer-events:none;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}
#touchcontrols .tc-stick{position:absolute;left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(62px + env(safe-area-inset-bottom,0px));width:112px;height:112px;border-radius:50%;border:2px solid rgba(200,165,74,.5);background:radial-gradient(circle,rgba(20,16,10,.35),rgba(20,16,10,.08) 70%);pointer-events:none}
#touchcontrols .tc-nub{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px;border-radius:50%;background:rgba(200,165,74,.42);border:1px solid rgba(255,233,168,.7);box-shadow:0 2px 12px #0009}
#touchcontrols .tc-btn{position:absolute;display:grid;place-items:center;min-width:56px;min-height:56px;padding:0 10px;box-sizing:border-box;border-radius:10px;border:1px solid rgba(200,165,74,.55);background:rgba(12,12,16,.62);color:#ffe9a8;text-shadow:0 1px 2px #000;pointer-events:auto;touch-action:none}
#touchcontrols .tc-btn:active,#touchcontrols .tc-btn.on{background:rgba(90,64,20,.85);border-color:#ffe9a8;transform:scale(.95)}
#touchcontrols .tc-fight{right:calc(10px + env(safe-area-inset-right,0px));bottom:calc(62px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:repeat(3,auto);gap:6px;position:absolute;pointer-events:none}
#touchcontrols .tc-screens{right:calc(8px + env(safe-area-inset-right,0px));top:calc(8px + env(safe-area-inset-top,0px));display:flex;gap:4px;position:absolute;pointer-events:none}
#touchcontrols .tc-screens .tc-btn{min-height:34px;min-width:36px;font-size:9.5px;padding:0 4px;letter-spacing:.02em}
/* A button in a row is in the row: the base .tc-btn is absolute for the column, and inside a
   flex row that took every child out of flow the row collapsed to zero width, stacking all
   five screen buttons on its right edge - half of them off the phone. */
#touchcontrols .tc-fight .tc-btn,#touchcontrols .tc-screens .tc-btn{position:static}
@media (max-height:520px){#touchcontrols .tc-stick{width:88px;height:88px;bottom:calc(52px + env(safe-area-inset-bottom,0px))}#touchcontrols .tc-fight{bottom:calc(52px + env(safe-area-inset-bottom,0px))}}
`;

/**
 * Attach the layer.
 *
 * @param {HTMLCanvasElement} canvas  the game canvas: drags over it are view turns
 * @param {{look?: (dx:number, dy:number) => void, tap?: (x:number, y:number) => void,
 *          hotbar?: (index:number) => void, paused?: () => boolean, onFirstTouch?: () => void}} [hooks]
 * @returns {{element: HTMLElement, dispose: () => void}|null} null on a desktop
 */
export function attachTouchControls(canvas, hooks = {}) {
  if (!isTouchDevice() || typeof document === 'undefined') return null;

  if (!document.getElementById('touchcontrols-style')) {
    const style = document.createElement('style');
    style.id = 'touchcontrols-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const layer = document.createElement('div');
  layer.id = 'touchcontrols';

  // ── the stick ────────────────────────────────────────────────────────────────
  const stick = document.createElement('div');
  stick.className = 'tc-stick';
  const nub = document.createElement('div');
  nub.className = 'tc-nub';
  stick.appendChild(nub);
  layer.appendChild(stick);

  const held = new Set();
  const down = (code) => { if (!held.has(code)) { held.add(code); pressKey('keydown', code); } };
  const up = (code) => { if (held.has(code)) { held.delete(code); pressKey('keyup', code); } };
  const releaseAll = () => { for (const code of [...held]) up(code); };

  function applyStick(dx, dy) {
    const axis = stickAxis(dx, dy);
    const want = {
      KeyW: axis.forward, KeyS: axis.back, KeyA: axis.left, KeyD: axis.right, ShiftLeft: axis.run,
    };
    for (const [code, on] of Object.entries(want)) { if (on) down(code); else up(code); }
    nub.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function restStick() {
    nub.style.transform = 'translate(0,0)';
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) up(code);
  }

  // ── the buttons ──────────────────────────────────────────────────────────────
  const fight = document.createElement('div');
  fight.className = 'tc-fight';
  for (const button of TOUCH_BUTTONS) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tc-btn';
    el.textContent = button.label;
    el.title = button.title;
    el.setAttribute('aria-label', button.title);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('on');
      if (button.hold) down(button.key); else tapKey(button.key);
      try { navigator.vibrate?.(8); } catch { /* a platform without it */ }
    });
    const release = () => { el.classList.remove('on'); if (button.hold) up(button.key); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    fight.appendChild(el);
  }
  layer.appendChild(fight);

  const screens = document.createElement('div');
  screens.className = 'tc-screens';
  for (const button of TOUCH_SCREEN_BUTTONS) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tc-btn';
    el.textContent = button.label;
    el.title = button.title;
    el.setAttribute('aria-label', button.title);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); tapKey(button.key); });
    screens.appendChild(el);
  }
  layer.appendChild(screens);

  // ── gestures on the canvas ───────────────────────────────────────────────────
  /** Which finger is doing what: the first one on the stick's half drives movement. */
  let stickId = null;
  let lookId = null;
  let start = null;
  let last = null;
  let moved = 0;

  const relative = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse') return;
    // The stick's half is the lower-left quarter of the screen; everything else is the view.
    const point = relative(e);
    if (point.x < point.w * 0.45 && point.y > point.h * 0.45) {
      if (stickId != null) return;
      stickId = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
    } else {
      if (lookId != null) return;
      lookId = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY };
    }
    moved = 0;
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    hooks.onFirstTouch?.();
  };

  const onMove = (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.pointerId === stickId) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const length = Math.hypot(dx, dy);
      const clamped = length > STICK_RADIUS ? [dx / length * STICK_RADIUS, dy / length * STICK_RADIUS] : [dx, dy];
      applyStick(clamped[0], clamped[1]);
      e.preventDefault();
      return;
    }
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    moved += Math.hypot(dx, dy);
    if (!hooks.paused?.()) hooks.look?.(dx, dy);
    e.preventDefault();
  };

  const onUp = (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.pointerId === stickId) { stickId = null; restStick(); }
    else if (e.pointerId === lookId) {
      lookId = null;
      // A short, still touch is a **tap**, never a look: a drag that never moved is a finger
      // that meant to press the thing under it.
      if (moved < TAP_SLOP) {
        const point = relative(e);
        hooks.tap?.(point.x, point.y);
      }
    }
    e.preventDefault();
  };

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp, { passive: false });
  canvas.addEventListener('pointercancel', onUp, { passive: false });

  document.body.appendChild(layer);

  // A phone's first touch is the only gesture iOS/Android allow fullscreen and a landscape lock
  // from. Every refusal is swallowed: a browser that will not is not an error.
  function askFullscreen() {
    try {
      const de = document.documentElement;
      if (!de?.requestFullscreen || document.fullscreenElement) return;
      de.requestFullscreen({ navigationUI: 'hide' })?.then?.(
        () => { try { globalThis.screen?.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* unsupported */ } },
        () => {},
      );
    } catch { /* unsupported */ }
  }
  hooks.onFirstTouch = ((previous) => () => { previous?.(); askFullscreen(); })(hooks.onFirstTouch);

  return {
    element: layer,
    dispose() {
      releaseAll();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      layer.remove();
    },
  };
}
