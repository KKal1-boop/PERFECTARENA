// THE NUMBERS ON THE BLOW — Daggerfall's hit numbers, for this port's fight.
//
// The owner's report: the fight tells you a creature's health in a corner row, but the blow
// itself says nothing where it lands. Daggerfall's enhanced HUD answers with one number per
// attack, colour-coded and tagged: a hit, a critical, a backstab, "Miss", "Ineffective",
// "0" for a blow armour ate. Its `ui/hitNumbers.js` is the reference for the *readout* —
// one node per number, a little sideways scatter so a flurry fans out, removed when its rise
// ends — not for Arena's arithmetic. Arena's own formula (`game/combat.js`) is the only thing
// that decides a hit; this module draws exactly what it was told.
//
// The layer is DOM, like the pack and the map: the world is GL, and a number is text. It sits
// above the reticle because the point the player is looking at is the point they struck, which
// is Daggerfall's own placement. A tab with no DOM (a unit test, a worker) gets the pure
// formatting functions and a null node; it never throws.

/** How long a number rises before it is removed. Daggerfall's `RISE_MS`. */
export const HIT_RISE_MS = 950;
/** Sideways scatter either side of the reticle, in CSS pixels. */
export const HIT_SCATTER_PX = 36;
/** The layer's id, and the sheet's own hook. */
export const HIT_NUMBERS_ID = 'hitnumbers';
export const HIT_MARKER_ID = 'hitmarker';

/**
 * What a player's attack resolution becomes on screen.
 *
 * `critical` and `backstab` are Arena's own flags on `resolveAttack`'s answer; they are the
 * same damage, drawn gold and larger, never multiplied again here. A guard's `blocked` flag
 * is the target's armour or shield, not the player's defence.
 *
 * @param {{hit?: boolean, damage?: number, critical?: boolean, backstab?: boolean,
 *   ineffective?: boolean, immune?: boolean, blocked?: boolean, warded?: boolean}} [report]
 * @returns {{kind: string, text: string, tag: string|null}|null}
 */
export function hitNumberFor(report = {}) {
  if (!report) return null;
  if (report.ineffective || report.immune) return { kind: 'ineffective', text: 'Ineffective', tag: null };
  if (report.blocked) return { kind: 'blocked', text: 'Blocked', tag: null };
  if (report.hit === false) return { kind: 'miss', text: 'Miss', tag: null };
  const damage = Math.max(0, Math.round(Number(report.damage) || 0));
  if (damage === 0) return { kind: 'absorbed', text: '0', tag: null };
  if (report.backstab) return { kind: 'crit', text: String(damage), tag: 'Backstab' };
  if (report.critical) return { kind: 'crit', text: String(damage), tag: null };
  return { kind: 'hit', text: String(damage), tag: report.warded ? 'Warded' : null };
}

/**
 * What a blow that reached the **player** becomes: a red negative number, Daggerfall's own
 * readout for damage taken, with the source's tag when a ward or a spell is why it is small.
 *
 * @param {{damage?: number, blocked?: boolean, spell?: boolean, warded?: number,
 *   resisted?: number, shielded?: number}} [report]
 * @returns {{kind: string, text: string, tag: string|null}|null}
 */
export function playerDamageNumber(report = {}) {
  const damage = Math.max(0, Math.round(Number(report.damage) || 0));
  if (damage <= 0 && report.blocked) return { kind: 'blocked', text: 'Blocked', tag: null };
  if (damage <= 0) return null;
  const tag = report.spell ? 'spell' : (report.warded || report.resisted || report.shielded ? 'warded' : null);
  return { kind: 'taken', text: `-${damage}`, tag };
}

/**
 * A heal the player took, between two frames the HUD drew: `+N` in green. Only a **rise**;
 * a load, a night's rest or a level-up that restores health is not a heal the player cast.
 *
 * @param {number|null|undefined} previous
 * @param {number|null|undefined} now
 * @returns {{kind: string, text: string, tag: null}|null}
 */
export function healNumberFor(previous, now) {
  if (previous == null) return null;
  const before = Number(previous);
  const after = Number(now);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  const gain = Math.round(after - before);
  return gain > 0 ? { kind: 'heal', text: `+${gain}`, tag: null } : null;
}

/** A word alone — "Stagger", "Perfect", "Slain" — on the same layer. */
export function wordNumber(text, kind = 'word') {
  const clean = String(text ?? '').trim();
  return clean ? { kind, text: clean, tag: null } : null;
}

/** The layer, created once, on the page's overlay plane. */
function ensureLayer(doc) {
  if (!doc?.body) return null;
  let layer = doc.getElementById(HIT_NUMBERS_ID);
  if (!layer) {
    layer = doc.createElement('div');
    layer.id = HIT_NUMBERS_ID;
    layer.setAttribute('aria-hidden', 'true');
    doc.body.append(layer);
  }
  return layer;
}

/**
 * Show one number. `scatter01` is injectable so a test's spawn point is deterministic.
 *
 * @param {{kind: string, text: string, tag: string|null}|null} number
 * @param {{doc?: Document, scatter01?: () => number}} [opts]
 * @returns {HTMLElement|null}
 */
export function showHitNumber(number, { doc = globalThis.document, scatter01 = Math.random } = {}) {
  if (!number || !doc) return null;
  const host = ensureLayer(doc);
  if (!host) return null;
  const node = doc.createElement('span');
  node.className = `hitnum hitnum-${number.kind}`;
  node.textContent = number.text;
  if (number.tag) {
    const tag = doc.createElement('small');
    tag.className = 'hitnum-tag';
    tag.textContent = number.tag;
    node.append(tag);
  }
  const scatter = Math.round((scatter01() * 2 - 1) * HIT_SCATTER_PX);
  node.style.setProperty('--dx', `${scatter}px`);
  node.style.setProperty('--rise', `${HIT_RISE_MS}ms`);
  node.dataset.seq = String(Number(host.dataset.seq ?? 0) + 1);
  host.dataset.seq = node.dataset.seq;
  host.append(node);
  const gone = () => { if (node.isConnected) node.remove(); };
  node.addEventListener('animationend', gone, { once: true });
  // A background tab does not run animations; the timer is the floor, as in Daggerfall's own
  // hit numbers (and what keeps a node from being a leak).
  const timer = setTimeout(gone, HIT_RISE_MS + 250);
  if (timer?.unref) timer.unref();
  return node;
}

/** A convenience for callers that hold the number's ingredients rather than its record. */
export function showNumberFor(report, opts) {
  return showHitNumber(hitNumberFor(report), opts);
}

/** A word on the same layer, for a stagger, a riposte or a kill. */
export function showWord(text, kind = 'word', opts) {
  return showHitNumber(wordNumber(text, kind), opts);
}

/**
 * The reticle's own four-stroke mark — a hit, a critical, a block, a miss.
 *
 * Daggerfall's hit numbers are the readout; the strike also wants a *tick* at the point of
 * aim, which is what a first-person fight has instead of a floating body. One node, restarted
 * by removing and re-adding the `on` class so a flurry re-runs the animation rather than
 * stacking marks.
 *
 * @param {'hit'|'crit'|'block'|'miss'|'taken'} kind
 * @param {{doc?: Document}} [opts]
 * @returns {HTMLElement|null}
 */
export function showHitMarker(kind = 'hit', { doc = globalThis.document } = {}) {
  if (!doc?.body) return null;
  let node = doc.getElementById(HIT_MARKER_ID);
  if (!node) {
    node = doc.createElement('div');
    node.id = HIT_MARKER_ID;
    node.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) {
      const stroke = doc.createElement('i');
      node.append(stroke);
    }
    doc.body.append(node);
  }
  node.className = '';
  node.dataset.kind = kind;
  // Force the animation to restart: a class swap in the same frame would otherwise be a
  // no-op, which is the bug Daggerfall's `chunkFrame` alternating animation names avoids.
  void node.offsetWidth;
  node.className = 'on';
  clearTimeout(node._timer);
  node._timer = setTimeout(() => { if (node.isConnected) node.className = ''; }, 260);
  if (node._timer?.unref) node._timer.unref();
  return node;
}

/** Remove every number and the marker — a level change must not carry the last fight over. */
export function clearHitNumbers(doc = globalThis.document) {
  doc?.getElementById?.(HIT_NUMBERS_ID)?.replaceChildren();
  const marker = doc?.getElementById?.(HIT_MARKER_ID);
  if (marker) marker.className = '';
}
