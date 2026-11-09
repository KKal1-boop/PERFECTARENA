// THE HUD'S OWN TWO SWITCHES — the compass, and the whole interface for a photograph.
//
// Two things the owner asked for on 2026-10-25:
//
//   * *"you should be able to turn on and off the compass in the settings, the compass need to
//     appear on android too"* — the bearing at the top of the screen is a setting now, kept
//     where the music and the 320×200 tick are kept (`localStorage`), and it is drawn on a
//     phone as it is on a desk.
//   * *"there should be a setting that turns gui both for android and pc off to take
//     screenshots"* — a page of the world with nothing of this project's on it. The switch
//     hides the vitals, the message band, the hotbar, the compass, the weapon in hand and the
//     touch layer, and leaves the menus reachable: `Esc` on a desk, a long press on a phone
//     (`scenes/interior.js` owns that half).
//
// Pure and tiny on purpose, the way `game/videoSettings.js` is: one key, one boolean, the same
// `localStorage` discipline — and every read tolerates a browser that refuses storage. The
// scene applies both as **classes on `<body>`** (`hudSettings().apply`), so the stylesheet in
// `index.html` is the only place a hidden thing is described.

/** Where the compass's own switch lives. */
export const COMPASS_KEY = 'pa.hud.compass';
/** Where the interface's switch lives. */
export const GUI_HIDDEN_KEY = 'pa.hud.hidden';

/** Read a boolean pref that defaults to `fallback`. */
function readFlag(key, fallback) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch { /* a browser that refuses storage gets the default */ }
  return fallback;
}

/** Write a boolean pref, tolerating a refused store. */
function writeFlag(key, on) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, on ? '1' : '0');
  } catch { /* the page still gets the setting for as long as it lives */ }
}

/** Is the bearing strip drawn? The default is **on**: it was on before the switch existed. */
export function compassEnabled() {
  return readFlag(COMPASS_KEY, true);
}

/**
 * Turn the compass on or off, and remember it.
 * @param {boolean} on
 * @returns {boolean} the state actually held
 */
export function setCompassEnabled(on) {
  const wanted = Boolean(on);
  writeFlag(COMPASS_KEY, wanted);
  return wanted;
}

/** Is the interface hidden for a photograph? The default is off. */
export function guiHidden() {
  return readFlag(GUI_HIDDEN_KEY, false);
}

/**
 * Hide the interface, or bring it back, and remember it.
 * @param {boolean} on
 * @returns {boolean} the state actually held
 */
export function setGuiHidden(on) {
  const wanted = Boolean(on);
  writeFlag(GUI_HIDDEN_KEY, wanted);
  return wanted;
}

/**
 * Write both switches onto the page as classes of `<body>`.
 *
 * `no-compass` is the compass's, `gui-hidden` the interface's; the stylesheet reads those two
 * names and nothing else, so a frame's cost is a class toggle rather than a walk over the DOM.
 *
 * @param {{compass?: boolean, hidden?: boolean, doc?: Document}} [state]
 *   omitted fields are read from the store, which is what boot wants
 * @returns {{compass: boolean, hidden: boolean}}
 */
export function applyHudSettings(state = {}) {
  const compass = typeof state.compass === 'boolean' ? state.compass : compassEnabled();
  const hidden = typeof state.hidden === 'boolean' ? state.hidden : guiHidden();
  const body = (state.doc ?? (typeof document !== 'undefined' ? document : null))?.body;
  if (body) {
    body.classList.toggle('no-compass', !compass);
    body.classList.toggle('gui-hidden', hidden);
  }
  return { compass, hidden };
}
