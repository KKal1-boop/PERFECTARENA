// @ts-check
// THE PHONE IN HAND — A TOUCH LAYER THAT SPEAKS THE GAME'S OWN KEYS.
//
// The owner, 2026-10-22: *"the game needs COMPLETE ANDROID/IOS SUPPORT IF OPENED ON A PHONE
// WITHOUT ALTERING THE CODE OF THE GAME"*, and then, the same day: *"make sure android/ios
// support is perfect you can move and remove buttons change their size and that you have a
// button for truly everything that you are able to click normally on pc"*.
//
// So this is a layer, not a build: it attaches itself when the device reports a finger
// (`engine/ui/touchDevice.js`'s law — a coarse pointer with no hover, not a sniff at
// `ontouchstart`), draws the controls a phone needs, and then **presses the same keys the
// keyboard presses**. The scene, the motor, the fight and every panel already listen for
// those keys, so nothing in the game has to know a phone exists.
//
// ## Every door the keyboard has, the thumb has
//
// `TOUCH_BUTTONS` and `TOUCH_SCREEN_BUTTONS` are the scene's whole keydown ladder, one entry
// per key: the strike (`F`), the hand (`E`), speech (`T`), a spell (`Z`), the guard (`B`), the
// jump (`Space`), the roll (`Q`), rest (`R`), the eye's view (`V`), the two stairs
// (`BracketLeft`/`BracketRight`), the pack (`I`), the book (`C`), Tamriel (`M`), this level's
// map (`Tab`), the face (`P`), the level's owed points (`L`) and the menu (`Escape`). The
// hotbar's ten cells are DOM buttons already (`#hotbar`), and every panel a key opens is DOM —
// so a finger taps what a mouse clicks, and this file only supplies the keys no panel draws.
//
// ## The layout is the player's
//
// A phone in a hand is not a desk. Any button can be **dragged** anywhere, **scaled** by its
// own corner grip, and **hidden** by its ✕; the stick can be dragged and scaled the same way.
// The gear (top right, under the screens) puts the layer into arrange mode, whose tray lists
// every hidden control so nothing can be lost, and offers Reset and Done. The layout is saved
// as fractions of the viewport (`localStorage`, key `perfectarena.touch.layout.v1`), so it
// survives a reload and a rotation, and `normaliseTouchLayout` clamps it back into the screen
// when a window shrinks.
//
// ## What is on the screen at rest
//
//   * **A stick, bottom left.** Pushing it past the rim's edge walks, past four fifths of it
//     runs, exactly as `Shift` does. It fills the four movement keys and lets go of them on
//     release, so the scene's held-key set is the same set a keyboard makes. It is a
//     *floating* stick: it appears under the thumb that presses and returns home at rest.
//   * **The view, everywhere else.** A drag turns the head through the host's own `look(dx,dy)`
//     — the seam the mouse already uses — so touch look and mouse look cannot drift apart.
//   * **The action cluster, bottom right** (strike, hand, speech, spell, guard, jump, roll), and
//     **the screens, top right** (pack, spellbook, Tamriel, this level, menu). The rest wait in
//     the tray rather than cluttering the world.
//
// A tap on the world is a `tap(x,y)` for the host, which aims `E` through the finger; a drag
// never becomes a tap, and every finger has its own record — a player holding the stick with
// one thumb and looking with the other is two pointers, never one shared cursor.
//
// Nothing here touches the renderer, the scene's state or the save. It is input, and only input.

import { isTouchDevice } from './touchDevice.js';

export { isTouchDevice };

/** The radius of the stick's travel, in CSS px. */
export const STICK_RADIUS = 64;
/** The radius the stick is *drawn* at, in CSS px (times its own scale). */
export const STICK_VISUAL_RADIUS = 58;
/** Past this share of the radius a push walks. */
export const STICK_DEAD_ZONE = 0.18;
/** Past this share it runs — the same "a full push is a run" rule the twin's stick uses. */
export const STICK_RUN = 0.8;
/** A finger that moves less than this, in CSS px, never turned the view. */
export const TAP_SLOP = 12;

/** Where the player's own layout is kept. */
export const LAYOUT_KEY = 'perfectarena.touch.layout.v1';
/** A control can be shrunk to 75 % and grown to 220 % of its drawn size. */
export const MIN_SCALE = 0.75;
export const MAX_SCALE = 2.2;

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
 * One button on the layer.
 *
 * `key` is the DOM's own `KeyboardEvent.code`, which is what the scene's handler reads. `w`,
 * `h` and `font` are the drawn size and type at scale 1; `hidden` is its place in the resting
 * layout (a hidden button is still on the layer, waiting in the tray).
 *
 * @param {string} id @param {string} key @param {string} label @param {string} title
 * @param {{w?: number, h?: number, font?: number, hidden?: boolean, hold?: boolean}} [opts]
 */
function button(id, key, label, title, opts = {}) {
  return Object.freeze({
    id, key, label, title,
    w: opts.w ?? 56, h: opts.h ?? 56, font: opts.font ?? 22,
    hidden: opts.hidden === true, hold: opts.hold === true,
  });
}

/**
 * The scene's action keys: the sword, the hand, speech, magic, the guard, the feet.
 *
 * The last four are drawn only if the player asks for them (the tray): a phone's world should
 * be the fight and the walk first, and a stair or a rest is a decision, not a reflex.
 *
 * @type {ReadonlyArray<{id: string, key: string, label: string, title: string, w: number, h: number, font: number, hidden: boolean, hold: boolean}>}
 */
export const TOUCH_BUTTONS = Object.freeze([
  button('strike', 'KeyF', '⚔', 'Strike — the sword’s blow'),
  button('interact', 'KeyE', '✋', 'Take, open, enter, climb or use what is in front'),
  button('talk', 'KeyT', '☰', 'Speak to whoever is nearest'),
  button('cast', 'KeyZ', '✦', 'Cast the spell last read'),
  button('guard', 'KeyB', '⛨', 'Guard, and parry the blow'),
  button('jump', 'Space', '⤒', 'Jump'),
  button('roll', 'KeyQ', '⟳', 'Roll aside'),
  // **The sneak.** A desk crouches with `Ctrl`, and the layer carries every key the ladder
  // has; without this one a phone could not crouch at all (the owner, 2026-10-22: *"there is
  // no crouch button on phone"*). The scene reads the crouch as a **press edge**, so a tap is
  // the whole gesture — there is nothing to hold.
  button('crouch', 'ControlLeft', '⌗', 'Crouch, and stand again'),
  button('rest', 'KeyR', '☾', 'Rest here', { hidden: true }),
  button('view', 'KeyV', '◉', 'First or third person', { hidden: true }),
  button('stairsDown', 'BracketRight', '▼', 'Take the stair down', { hidden: true }),
  button('stairsUp', 'BracketLeft', '▲', 'Take the stair up', { hidden: true }),
]);

/** The panel keys: the pack, the book, both maps, the face, the level and the menu. */
export const TOUCH_SCREEN_BUTTONS = Object.freeze([
  button('pack', 'KeyI', 'Pack', 'Your pack', { w: 58, h: 36, font: 10 }),
  button('spells', 'KeyC', 'Spell', 'Your spellbook', { w: 58, h: 36, font: 10 }),
  button('map', 'KeyM', 'Map', 'The world map of Tamriel', { w: 58, h: 36, font: 10 }),
  button('automap', 'Tab', 'Level', 'The map of this level', { w: 58, h: 36, font: 10 }),
  button('menu', 'Escape', 'Menu', 'Pause, save and load', { w: 58, h: 36, font: 10 }),
  button('portrait', 'KeyP', 'Face', 'Your character’s own portrait', { w: 58, h: 36, font: 10, hidden: true }),
  button('level', 'KeyL', 'Lvl+', 'Spend the points a new level owes you', { w: 58, h: 36, font: 10, hidden: true }),
]);

/** Every button the layer can draw, actions first. */
export const TOUCH_ALL_BUTTONS = Object.freeze([...TOUCH_BUTTONS, ...TOUCH_SCREEN_BUTTONS]);

/** The button with that id, or null. */
export const touchButtonById = (id) => TOUCH_ALL_BUTTONS.find((entry) => entry.id === id) ?? null;

/** The `key` value a synthetic event carries, so handlers that read `e.key` see the truth. */
const KEY_NAME = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyF: 'f', KeyT: 't', KeyZ: 'z',
  KeyB: 'b', KeyI: 'i', KeyC: 'c', KeyM: 'm', KeyQ: 'q', KeyR: 'r', KeyV: 'v', KeyL: 'l', KeyP: 'p',
  Space: ' ', Tab: 'Tab', Escape: 'Escape', Enter: 'Enter', NumpadEnter: 'Enter', ShiftLeft: 'Shift',
  ControlLeft: 'Control', ControlRight: 'Control',
  BracketLeft: '[', BracketRight: ']',
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

/** A scale that is a real number inside the law's own bounds. */
export function clampTouchScale(scale) {
  const n = Number(scale);
  return Number.isFinite(n) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) : 1;
}

/**
 * Keep a control's centre on the screen, with room for the control itself.
 *
 * Editor and viewport both speak fractions; a phone's window can shrink under a saved layout
 * (a rotation, a browser bar), so every placement is passed through here.
 *
 * @param {number} x @param {number} y  centre, 0..1 of the viewport
 * @param {number} w @param {number} h  the control's drawn size in px
 * @param {number} width @param {number} height  the viewport in px
 * @returns {{x: number, y: number}}
 */
export function clampTouchPoint(x, y, w, h, width, height) {
  const vw = Math.max(1, Number(width) || 0);
  const vh = Math.max(1, Number(height) || 0);
  const mx = Math.min(0.5, (Math.max(0, w) / 2 + 4) / vw);
  const my = Math.min(0.5, (Math.max(0, h) / 2 + 4) / vh);
  const px = Number.isFinite(x) ? x : 0.5;
  const py = Number.isFinite(y) ? y : 0.5;
  return {
    x: Math.min(1 - mx, Math.max(mx, px)),
    y: Math.min(1 - my, Math.max(my, py)),
  };
}

/** A grid slot's centre, as a clamped fraction of the viewport. */
function gridSlot(index, spec, entry, width, height) {
  const col = index % spec.cols;
  const row = Math.floor(index / spec.cols);
  const cx = width - spec.margin - (spec.cols - 1 - col) * (entry.w + spec.gap) - entry.w / 2;
  const cy = spec.top != null
    ? spec.top + row * (entry.h + spec.gap) + entry.h / 2
    : height - spec.bottom - row * (entry.h + spec.gap) - entry.h / 2;
  return clampTouchPoint(cx / width, cy / height, entry.w, entry.h, width, height);
}

/**
 * The layout a fresh phone gets: the fight under the right thumb, the panels at the top right,
 * the stick under the left thumb, and the rest in the tray.
 *
 * @param {number} [width] @param {number} [height]  the viewport in px
 * @returns {{version: number, buttons: Record<string, {x: number, y: number, scale: number, hidden: boolean}>, stick: {x: number, y: number, scale: number}}}
 */
export function defaultTouchLayout(width = 1024, height = 768) {
  const vw = Math.max(1, Number(width) || 0);
  const vh = Math.max(1, Number(height) || 0);
  /** @type {Record<string, {x: number, y: number, scale: number, hidden: boolean}>} */
  const buttons = {};
  const grid = (group, spec) => {
    // A hidden button still has a slot — its own home — so restoring it from the tray puts it
    // where the design meant it rather than in the middle of the screen.
    const visible = group.filter((entry) => !entry.hidden);
    const hidden = group.filter((entry) => entry.hidden);
    [...visible, ...hidden].forEach((entry, index) => {
      const at = gridSlot(index, spec, entry, vw, vh);
      buttons[entry.id] = { x: at.x, y: at.y, scale: 1, hidden: entry.hidden };
    });
  };
  grid(TOUCH_BUTTONS, { cols: 3, margin: 10, gap: 8, bottom: 74 });
  grid(TOUCH_SCREEN_BUTTONS, { cols: 3, margin: 10, gap: 6, top: 10 });
  return {
    version: 1,
    buttons,
    stick: {
      x: (16 + STICK_VISUAL_RADIUS) / vw,
      y: 1 - (62 + STICK_VISUAL_RADIUS) / vh,
      scale: 1,
    },
  };
}

/**
 * A saved layout, made safe: unknown ids dropped, missing ones put back, every scale and every
 * centre inside the law, and a viewport that shrank since the save is honoured.
 *
 * @param {unknown} raw  the parsed `localStorage` value, or null
 * @param {number} [width] @param {number} [height]
 */
export function normaliseTouchLayout(raw, width = 1024, height = 768) {
  const base = defaultTouchLayout(width, height);
  const source = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {};
  const saved = source.buttons && typeof source.buttons === 'object' ? source.buttons : {};
  /** @type {Record<string, {x: number, y: number, scale: number, hidden: boolean}>} */
  const buttons = {};
  for (const entry of TOUCH_ALL_BUTTONS) {
    const fallback = base.buttons[entry.id];
    const row = saved[entry.id];
    if (!row || typeof row !== 'object') { buttons[entry.id] = { ...fallback }; continue; }
    const scale = clampTouchScale(row.scale);
    const point = clampTouchPoint(
      Number.isFinite(row.x) ? row.x : fallback.x,
      Number.isFinite(row.y) ? row.y : fallback.y,
      entry.w * scale, entry.h * scale, width, height,
    );
    buttons[entry.id] = { x: point.x, y: point.y, scale, hidden: row.hidden === true };
  }
  const stickIn = source.stick && typeof source.stick === 'object' ? source.stick : {};
  const stickScale = clampTouchScale(stickIn.scale);
  const r = STICK_VISUAL_RADIUS * stickScale;
  const stickAt = clampTouchPoint(
    Number.isFinite(stickIn.x) ? stickIn.x : base.stick.x,
    Number.isFinite(stickIn.y) ? stickIn.y : base.stick.y,
    r * 2, r * 2, width, height,
  );
  return { version: 1, buttons, stick: { x: stickAt.x, y: stickAt.y, scale: stickScale } };
}

const CSS = `
#touchcontrols{position:fixed;inset:0;z-index:8;pointer-events:none;font:600 13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none;-webkit-tap-highlight-color:transparent}
#touchcontrols .tc-btn{position:absolute;left:0;top:0;transform:translate(-50%,-50%);display:grid;place-items:center;box-sizing:border-box;padding:1px;border-radius:12px;border:1px solid rgba(200,165,74,.55);background:rgba(12,12,16,.62);color:#ffe9a8;text-shadow:0 1px 2px #000;line-height:1.05;text-align:center;white-space:nowrap;overflow:hidden;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent;box-shadow:0 2px 10px #0006,inset 0 1px 0 rgba(255,233,168,.12)}
#touchcontrols .tc-btn.on{background:rgba(96,68,22,.88);border-color:#ffe9a8;box-shadow:inset 0 0 12px rgba(255,233,168,.35)}
#touchcontrols .tc-gear{position:absolute;right:calc(10px + env(safe-area-inset-right,0px));top:calc(94px + env(safe-area-inset-top,0px));width:32px;height:32px;box-sizing:border-box;display:grid;place-items:center;padding:0;border-radius:50%;border:1px solid rgba(200,165,74,.45);background:rgba(12,12,16,.5);color:#c8a54a;font-size:15px;line-height:1;pointer-events:auto;touch-action:none;box-shadow:0 2px 8px #0006}
#touchcontrols.tc-arrange .tc-gear{color:#ffe9a8;border-color:#ffe9a8;background:rgba(60,44,14,.9)}
#touchcontrols .tc-stick{position:absolute;left:0;top:0;transform:translate(-50%,-50%);box-sizing:border-box;border-radius:50%;border:2px solid rgba(200,165,74,.5);background:radial-gradient(circle,rgba(20,16,10,.34),rgba(20,16,10,.06) 70%);pointer-events:none;opacity:.55}
#touchcontrols .tc-stick.tc-live{opacity:1}
#touchcontrols .tc-nub{position:absolute;left:50%;top:50%;width:46%;height:46%;margin:-23% 0 0 -23%;border-radius:50%;background:rgba(200,165,74,.42);border:1px solid rgba(255,233,168,.7);box-shadow:0 2px 12px #0009}
/* **The two handles live OUTSIDE the control, and the control clips its own content**
   (overflow:hidden, so a long label cannot spill). In arrange mode that clipped the ✕ and the
   ◢ away entirely — the owner, 2026-10-22: "removing buttons doesnt work" — which is why
   .tc-arrange .tc-btn above turns the clip off and the handles are drawn a little larger here.
   A 26 px target is the floor for a thumb. */
#touchcontrols .tc-kill,#touchcontrols .tc-grip{position:absolute;width:23px;height:23px;box-sizing:border-box;display:none;place-items:center;padding:0;border-radius:50%;border:1px solid #ffe9a8;color:#ffe9a8;font:600 11px/1 system-ui,sans-serif;touch-action:none;pointer-events:auto;z-index:3}
#touchcontrols .tc-kill{left:-13px;top:-13px;background:#7a2a22}
#touchcontrols .tc-grip{right:-13px;bottom:-13px;background:#3a2f12;font-size:10px}
#touchcontrols.tc-arrange .tc-btn{border-style:dashed;border-color:#ffe9a8;background:rgba(24,20,12,.9);overflow:visible}
#touchcontrols.tc-arrange .tc-kill,#touchcontrols.tc-arrange .tc-grip{z-index:3;width:26px;height:26px;font-size:12px}
#touchcontrols.tc-arrange .tc-kill,#touchcontrols.tc-arrange .tc-grip{display:grid}
#touchcontrols .tc-tray{position:absolute;left:calc(8px + env(safe-area-inset-left,0px));right:auto;top:calc(8px + env(safe-area-inset-top,0px));width:min(56vw,420px);display:none;flex-direction:column;gap:7px;padding:9px 11px;box-sizing:border-box;max-height:42vh;overflow:auto;touch-action:pan-y;border-radius:10px;border:1px solid rgba(200,165,74,.55);background:rgba(8,8,10,.95);color:#ece0c0;font-size:11px;line-height:1.45;pointer-events:auto;box-shadow:0 8px 26px #000a}
#touchcontrols.tc-arrange .tc-tray{display:flex}
#touchcontrols .tc-tray .row{display:flex;flex-wrap:wrap;gap:6px}
#touchcontrols .tc-tray button{font:inherit;font-size:11px;min-height:32px;padding:5px 10px;border-radius:7px;border:1px solid #6d5a1e;background:#17140e;color:#ffe9a8;touch-action:manipulation}
#touchcontrols .tc-tray button.done{background:#22301c;border-color:#9fd8a8;color:#d8f0dc}
#touchcontrols .tc-tray button.danger{background:#2a1a18;border-color:#8c3a2e;color:#ffb4a8}
#touchcontrols .tc-tray .hint{color:#b3a276}
#touchcontrols.tc-blocked .tc-btn,#touchcontrols.tc-blocked .tc-gear{opacity:0;pointer-events:none}
#touchcontrols.tc-blocked .tc-stick{opacity:0}
`;

function installStyle() {
  if (document.getElementById('touchcontrols-style')) return;
  const style = document.createElement('style');
  style.id = 'touchcontrols-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * Attach the layer.
 *
 * @param {HTMLCanvasElement} canvas  the game canvas: drags over it are view turns
 * @param {{look?: (dx:number, dy:number) => void, tap?: (x:number, y:number) => void,
 *          paused?: () => boolean, blocked?: () => boolean, onFirstTouch?: () => void}} [hooks]
 *   `paused` drops the look while a layer is up; `blocked` hides the controls entirely while a
 *   DOM window owns the screen (that window's own buttons are the finger's then).
 * @returns {{element: HTMLElement, layout: () => object, arrange: (on: boolean) => void, dispose: () => void}|null} null on a desktop
 */
export function attachTouchControls(canvas, hooks = {}) {
  if (!isTouchDevice() || typeof document === 'undefined') return null;

  installStyle();

  const viewport = () => ({
    w: Math.max(1, globalThis.innerWidth || document.documentElement?.clientWidth || 1024),
    h: Math.max(1, globalThis.innerHeight || document.documentElement?.clientHeight || 768),
  });

  /** @type {{version: number, buttons: Record<string, {x: number, y: number, scale: number, hidden: boolean}>, stick: {x: number, y: number, scale: number}}} */
  let layout = readLayout();
  let arranging = false;

  const layer = document.createElement('div');
  layer.id = 'touchcontrols';
  document.body.appendChild(layer);

  // ── the saved layout ──────────────────────────────────────────────────────────
  function readLayout() {
    const vp = viewport();
    /** @type {unknown} */
    let raw = null;
    try { raw = JSON.parse(globalThis.localStorage?.getItem(LAYOUT_KEY) ?? 'null'); } catch { raw = null; }
    return normaliseTouchLayout(raw, vp.w, vp.h);
  }
  function saveLayout() {
    try {
      globalThis.localStorage?.setItem(LAYOUT_KEY, JSON.stringify({
        version: 1, buttons: layout.buttons, stick: layout.stick,
      }));
    } catch { /* a private-mode store is not an error */ }
  }
  const sizeOf = (spec, scale) => ({ w: spec.w * scale, h: spec.h * scale });

  // ── the gear, and the tray it opens ──────────────────────────────────────────
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'tc-gear';
  gear.textContent = '⚙';
  gear.setAttribute('aria-label', 'Arrange the touch controls');
  gear.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setArranging(!arranging); });
  layer.appendChild(gear);

  const tray = document.createElement('div');
  tray.className = 'tc-tray';
  layer.appendChild(tray);

  function setArranging(on) {
    arranging = Boolean(on);
    layer.classList.toggle('tc-arrange', arranging);
    gear.textContent = arranging ? '✔' : '⚙';
    gear.setAttribute('aria-label', arranging ? 'Finish arranging the touch controls' : 'Arrange the touch controls');
    if (arranging) { releaseAll(); refreshTray(); }
    else saveLayout();
  }

  function refreshTray() {
    tray.replaceChildren();
    const head = document.createElement('div');
    head.className = 'hint';
    head.textContent = 'Drag a control to move it · its ◢ grip resizes it · ✕ hides it · the chips below bring one back.';
    tray.appendChild(head);

    const chips = document.createElement('div');
    chips.className = 'row';
    for (const spec of TOUCH_ALL_BUTTONS) {
      if (!layout.buttons[spec.id]?.hidden) continue;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = `＋ ${spec.title}`;
      chip.addEventListener('click', () => {
        layout.buttons[spec.id].hidden = false;
        renderButton(spec);
        saveLayout();
        refreshTray();
      });
      chips.appendChild(chip);
    }
    if (!chips.childElementCount) {
      const none = document.createElement('span');
      none.className = 'hint';
      none.textContent = 'Every control is on the screen.';
      chips.appendChild(none);
    }
    tray.appendChild(chips);

    const row = document.createElement('div');
    row.className = 'row';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'danger';
    reset.textContent = 'Reset to the default layout';
    reset.addEventListener('click', () => {
      const vp = viewport();
      layout = defaultTouchLayout(vp.w, vp.h);
      saveLayout();
      renderAll();
      refreshTray();
    });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'done';
    done.textContent = 'Done';
    done.addEventListener('click', () => setArranging(false));
    row.append(reset, done);
    tray.appendChild(row);
  }

  // ── the keys ──────────────────────────────────────────────────────────────────
  const held = new Set();
  const down = (code) => { if (!held.has(code)) { held.add(code); pressKey('keydown', code); } };
  const up = (code) => { if (held.has(code)) { held.delete(code); pressKey('keyup', code); } };
  const releaseAll = () => { for (const code of [...held]) up(code); };

  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* a platform without it */ } };

  // ── the buttons ───────────────────────────────────────────────────────────────
  /** @type {Map<string, HTMLButtonElement>} */
  const elements = new Map();
  /** @type {{id: string, pointerId: number, mode: 'move'|'resize', offsetX: number, offsetY: number, startScale: number, startDistance: number}|null} */
  let drag = null;

  function renderButton(spec) {
    const entry = layout.buttons[spec.id];
    const el = elements.get(spec.id);
    if (!entry || !el) return;
    const { w, h } = sizeOf(spec, entry.scale);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.left = `${entry.x * 100}%`;
    el.style.top = `${entry.y * 100}%`;
    el.style.fontSize = `${Math.max(8, spec.font * entry.scale)}px`;
    el.style.display = entry.hidden ? 'none' : 'grid';
  }

  function moveTo(spec, entry, clientX, clientY, grabX = 0, grabY = 0) {
    const vp = viewport();
    const { w, h } = sizeOf(spec, entry.scale);
    const at = clampTouchPoint((clientX - grabX) / vp.w, (clientY - grabY) / vp.h, w, h, vp.w, vp.h);
    entry.x = at.x;
    entry.y = at.y;
    renderButton(spec);
  }

  function makeButton(spec) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tc-btn';
    el.textContent = spec.label;
    el.title = spec.title;
    el.setAttribute('aria-label', spec.title);
    el.dataset.touch = spec.id;

    const kill = document.createElement('span');
    kill.className = 'tc-kill';
    kill.textContent = '✕';
    kill.title = 'Hide this control';
    kill.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      layout.buttons[spec.id].hidden = true;
      renderButton(spec); saveLayout(); refreshTray();
    });
    const grip = document.createElement('span');
    grip.className = 'tc-grip';
    grip.textContent = '◢';
    grip.title = 'Drag to resize';
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const entry = layout.buttons[spec.id];
      const vp = viewport();
      const cx = entry.x * vp.w, cy = entry.y * vp.h;
      drag = {
        id: spec.id, pointerId: e.pointerId, mode: 'resize',
        offsetX: 0, offsetY: 0,
        startScale: entry.scale,
        startDistance: Math.max(12, Math.hypot(e.clientX - cx, e.clientY - cy)),
      };
      el.setPointerCapture?.(e.pointerId);
    });
    el.append(kill, grip);

    el.addEventListener('pointerdown', (e) => {
      if (arranging) {
        e.preventDefault(); e.stopPropagation();
        const rect = el.getBoundingClientRect();
        drag = {
          id: spec.id, pointerId: e.pointerId, mode: 'move',
          offsetX: e.clientX - (rect.left + rect.width / 2),
          offsetY: e.clientY - (rect.top + rect.height / 2),
          startScale: layout.buttons[spec.id].scale, startDistance: 0,
        };
        el.setPointerCapture?.(e.pointerId);
        return;
      }
      e.preventDefault(); e.stopPropagation();
      el.classList.add('on');
      buzz(8);
      hooks.onFirstTouch?.();
      if (spec.hold) down(spec.key); else tapKey(spec.key);
    });

    const release = () => { el.classList.remove('on'); if (spec.hold) up(spec.key); };
    el.addEventListener('pointerup', (e) => {
      if (drag && drag.pointerId === e.pointerId && drag.mode === 'move') { drag = null; saveLayout(); }
      release();
    });
    el.addEventListener('pointercancel', (e) => {
      if (drag && drag.pointerId === e.pointerId) { drag = null; saveLayout(); }
      release();
    });
    el.addEventListener('pointerleave', release);

    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.pointerId !== e.pointerId || drag.id !== spec.id) return;
      e.preventDefault();
      const entry = layout.buttons[spec.id];
      if (drag.mode === 'move') { moveTo(spec, entry, e.clientX, e.clientY, drag.offsetX, drag.offsetY); return; }
      const vp = viewport();
      const cx = entry.x * vp.w, cy = entry.y * vp.h;
      const distance = Math.hypot(e.clientX - cx, e.clientY - cy);
      entry.scale = clampTouchScale(drag.startScale * (distance / drag.startDistance));
      const at = clampTouchPoint(entry.x, entry.y, spec.w * entry.scale, spec.h * entry.scale, vp.w, vp.h);
      entry.x = at.x; entry.y = at.y;
      renderButton(spec);
    });

    elements.set(spec.id, el);
    layer.appendChild(el);
    renderButton(spec);
    return el;
  }

  for (const spec of TOUCH_ALL_BUTTONS) makeButton(spec);

  // ── the stick ─────────────────────────────────────────────────────────────────
  const stick = document.createElement('div');
  stick.className = 'tc-stick';
  const nub = document.createElement('div');
  nub.className = 'tc-nub';
  stick.appendChild(nub);
  const gripStick = document.createElement('span');
  gripStick.className = 'tc-grip';
  gripStick.textContent = '◢';
  gripStick.title = 'Drag to resize the stick';
  gripStick.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const vp = viewport();
    drag = {
      id: 'stick', pointerId: e.pointerId, mode: 'resize',
      offsetX: 0, offsetY: 0,
      startScale: layout.stick.scale,
      startDistance: Math.max(12, Math.hypot(e.clientX - layout.stick.x * vp.w, e.clientY - layout.stick.y * vp.h)),
    };
    stick.setPointerCapture?.(e.pointerId);
  });
  stick.appendChild(gripStick);
  stick.style.pointerEvents = 'none';
  layer.appendChild(stick);

  // In arrange mode the stick is a control too: drag it, grip it.
  stick.addEventListener('pointerdown', (e) => {
    if (!arranging) return;
    e.preventDefault(); e.stopPropagation();
    const vp = viewport();
    drag = {
      id: 'stick', pointerId: e.pointerId, mode: 'move',
      offsetX: e.clientX - layout.stick.x * vp.w,
      offsetY: e.clientY - layout.stick.y * vp.h,
      startScale: layout.stick.scale, startDistance: 0,
    };
    stick.setPointerCapture?.(e.pointerId);
  });
  stick.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId || drag.id !== 'stick') return;
    e.preventDefault();
    const vp = viewport();
    const r = STICK_VISUAL_RADIUS * layout.stick.scale;
    if (drag.mode === 'move') {
      const at = clampTouchPoint((e.clientX - drag.offsetX) / vp.w, (e.clientY - drag.offsetY) / vp.h, r * 2, r * 2, vp.w, vp.h);
      layout.stick.x = at.x; layout.stick.y = at.y;
    } else {
      const distance = Math.hypot(e.clientX - layout.stick.x * vp.w, e.clientY - layout.stick.y * vp.h);
      layout.stick.scale = clampTouchScale(drag.startScale * (distance / drag.startDistance));
      const scaled = STICK_VISUAL_RADIUS * layout.stick.scale;
      const at = clampTouchPoint(layout.stick.x, layout.stick.y, scaled * 2, scaled * 2, vp.w, vp.h);
      layout.stick.x = at.x; layout.stick.y = at.y;
    }
    renderStick();
  });
  const endStickDrag = (e) => {
    if (drag && drag.pointerId === e.pointerId && drag.id === 'stick') { drag = null; saveLayout(); }
  };
  stick.addEventListener('pointerup', endStickDrag);
  stick.addEventListener('pointercancel', endStickDrag);

  function stickRadius() { return STICK_VISUAL_RADIUS * layout.stick.scale; }
  function stickCentre() {
    const vp = viewport();
    return { x: layout.stick.x * vp.w, y: layout.stick.y * vp.h };
  }
  function renderStick() {
    const r = stickRadius();
    stick.style.width = `${r * 2}px`;
    stick.style.height = `${r * 2}px`;
    stick.style.left = `${layout.stick.x * 100}%`;
    stick.style.top = `${layout.stick.y * 100}%`;
    stick.style.pointerEvents = arranging ? 'auto' : 'none';
    gripStick.style.display = arranging ? 'grid' : 'none';
  }
  renderStick();

  function placeStick(x, y) {
    stick.style.left = `${(x / viewport().w) * 100}%`;
    stick.style.top = `${(y / viewport().h) * 100}%`;
  }
  function restStick() {
    const vp = viewport();
    placeStick(layout.stick.x * vp.w, layout.stick.y * vp.h);
    nub.style.transform = 'translate(0,0)';
    stick.classList.remove('tc-live');
  }
  restStick();

  function applyStick(dx, dy) {
    const axis = stickAxis(dx, dy);
    const want = { KeyW: axis.forward, KeyS: axis.back, KeyA: axis.left, KeyD: axis.right, ShiftLeft: axis.run };
    for (const [code, on] of Object.entries(want)) { if (on) down(code); else up(code); }
    const r = STICK_RADIUS * layout.stick.scale;
    const length = Math.hypot(dx, dy);
    const clampedX = length > r ? (dx / length) * r : dx;
    const clampedY = length > r ? (dy / length) * r : dy;
    nub.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  }

  // ── gestures on the canvas ────────────────────────────────────────────────────
  /** Which finger is doing what: every pointer has its own record, so a look never reads the
   *  stick's origin and a stick drag never counts as the look's movement. */
  /** @type {Map<number, {kind: 'stick'|'look', startX: number, startY: number, lastX: number, lastY: number, moved: number}>} */
  const pointers = new Map();
  let stickId = null;
  let lookId = null;

  const relative = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width || viewport().w, h: rect.height || viewport().h };
  };

  function stickWanted(point) {
    const c = stickCentre();
    const near = Math.hypot(point.x - c.x, point.y - c.y) <= stickRadius() * 1.9;
    // The lower-left quarter is the walk's own ground even when the stick has been moved away
    // from the corner: a thumb that reaches for the pad should find it, not start a look.
    const quadrant = point.x < point.w * 0.45 && point.y > point.h * 0.45;
    return near || quadrant;
  }

  const onDown = (e) => {
    if (e.pointerType === 'mouse') return;
    if (arranging) return;
    if (hooks.blocked?.()) return;
    const point = relative(e);
    const kind = stickId === null && stickWanted(point) ? 'stick' : 'look';
    if (kind === 'stick') stickId = e.pointerId;
    else if (lookId !== null) return;
    else lookId = e.pointerId;
    pointers.set(e.pointerId, {
      kind, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: 0,
    });
    if (kind === 'stick') {
      // The stick is born under the thumb that pressed it, and goes home when that thumb lets
      // go: a floating stick is what a phone game's hand expects, and it can never be pressed
      // by accident behind a panel.
      placeStick(point.x, point.y);
      nub.style.transform = 'translate(0,0)';
      stick.classList.add('tc-live');
    }
    canvas.setPointerCapture?.(e.pointerId);
    hooks.onFirstTouch?.();
    e.preventDefault();
  };

  const onMove = (e) => {
    if (e.pointerType === 'mouse') return;
    const record = pointers.get(e.pointerId);
    if (!record) return;
    if (record.kind === 'stick') {
      applyStick(e.clientX - record.startX, e.clientY - record.startY);
      e.preventDefault();
      return;
    }
    const dx = e.clientX - record.lastX;
    const dy = e.clientY - record.lastY;
    record.lastX = e.clientX;
    record.lastY = e.clientY;
    record.moved += Math.hypot(dx, dy);
    if (!hooks.paused?.()) hooks.look?.(dx, dy);
    e.preventDefault();
  };

  const onUp = (e) => {
    if (e.pointerType === 'mouse') return;
    const record = pointers.get(e.pointerId);
    if (!record) return;
    pointers.delete(e.pointerId);
    if (record.kind === 'stick') {
      stickId = null;
      restStick();
      for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) up(code);
    } else {
      lookId = null;
      // A short, still touch is a **tap**, never a look: a drag that never moved is a finger
      // that meant to press the thing under it.
      if (record.moved < TAP_SLOP && e.type !== 'pointercancel') {
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

  /** A window that shrinks (a rotation, a browser bar) must not leave a control off-screen. */
  function reflow() {
    const vp = viewport();
    layout = normaliseTouchLayout(layout, vp.w, vp.h);
    renderAll();
  }
  function renderAll() { for (const spec of TOUCH_ALL_BUTTONS) renderButton(spec); renderStick(); restStick(); }
  globalThis.addEventListener('resize', reflow);
  globalThis.addEventListener('orientationchange', reflow);

  // A thumb held on `W` when the app goes to the background would otherwise stay held for the
  // rest of the session: the keyup never arrives. Every door out of the page lets go.
  const letGo = () => releaseAll();
  globalThis.addEventListener('blur', letGo);
  document.addEventListener('visibilitychange', letGo);

  // A phone's first touch is the only gesture iOS/Android allow fullscreen and a landscape lock
  // from. Every refusal is swallowed: a browser that will not is not an error.
  let fullAsked = false;
  function askFullscreen() {
    if (fullAsked) return;
    fullAsked = true;
    try {
      const de = document.documentElement;
      if (!de?.requestFullscreen || document.fullscreenElement) return;
      de.requestFullscreen({ navigationUI: 'hide' })?.then?.(
        () => { try { globalThis.screen?.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* unsupported */ } },
        () => {},
      );
    } catch { /* unsupported */ }
  }
  const firstTouch = ((previous) => () => { previous?.(); askFullscreen(); })(hooks.onFirstTouch);
  hooks.onFirstTouch = firstTouch;

  // ── the world's state, watched ───────────────────────────────────────────────
  // A DOM window (the pack, the map, the menu) owns the screen while it is up, and it draws
  // above this layer: its buttons are the finger's then, so these go quiet rather than sit
  // under it looking pressable. A quarter-second is far below a finger's patience and far
  // above a frame's cost.
  const watch = setInterval(() => {
    const blocked = Boolean(hooks.blocked?.());
    layer.classList.toggle('tc-blocked', blocked);
    if (blocked && arranging) setArranging(false);
  }, 250);

  return {
    element: layer,
    layout: () => ({ buttons: layout.buttons, stick: layout.stick }),
    arrange: setArranging,
    dispose() {
      clearInterval(watch);
      releaseAll();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      globalThis.removeEventListener('resize', reflow);
      globalThis.removeEventListener('orientationchange', reflow);
      globalThis.removeEventListener('blur', letGo);
      document.removeEventListener('visibilitychange', letGo);
      layer.remove();
    },
  };
}
