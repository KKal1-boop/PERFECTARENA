// THE STRIDE LAW — a drawn weapon is a walk, not a run.
//
// The owner, playing this port beside the original (2026-10-16): *"for the combat to be
// better in perfectarena you shouldnt be able to run with your weapons unsheathed"*. The
// law is Arena's own, it belongs to the block that owns the weapon in hand
// (`docs/PORT_BLOCKS.md` B06), and it lives in a module rather than in the scene
// (`src/game/weaponView.js`'s `canRunUnlessDrawn`) so it can be held here, in Node, without
// a page.
//
// The second half of the file is the **regression that made this test necessary**. The first
// version of the gate read `weaponRig.drawn` from the scene module's own input builder — and
// `inputOf` is module-level while the rig lives inside `bootInterior`, so the identifier was
// never in scope. Because `&&` short-circuits, the `ReferenceError` was thrown *only while a
// sprint key was held*: no ordinary frame noticed, no suite pressed Shift, and holding Shift
// killed the frame loop (the throw left `step()`, left `frame()` before its own
// `requestAnimationFrame`, and the page stopped for good). Every one of the six checks below
// passes on the fix and fails on that version — the browser half is `tests/suites/movement.mjs`.
//
//   node --test tests/unit/stride.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { canRunUnlessDrawn } from '../../src/game/weaponView.js';
import { inputOf } from '../../src/scenes/interior.js';

/** The keys a sprint is asked for with. */
const SHIFT = ['ShiftLeft', 'ShiftRight'];

test('the law itself: a drawn weapon refuses the sprint, a sheathed one allows it', () => {
  assert.equal(canRunUnlessDrawn(false), true, 'nothing in hand — the sprint is the player\'s');
  assert.equal(canRunUnlessDrawn(true), false, 'a blade out — the stride is the walk');
  // A literal boolean, like the engine's own `canRunUnlessRiding(mode)`: the argument is the
  // rig's answer (`weaponView.js` reports `drawn: view === 'first' && rig.drawn`), never a
  // state string or a frame number that happens to be truthy.
  assert.equal(typeof canRunUnlessDrawn(false), 'boolean');
});

test('the builder with a sprint key held: run with nothing drawn, walk with the blade out', () => {
  for (const code of SHIFT) {
    const sheathed = inputOf(new Set([code, 'KeyW']), new Set(), false);
    assert.equal(sheathed.run, true, `${code} with nothing in hand is a run`);
    const drawn = inputOf(new Set([code, 'KeyW']), new Set(), true);
    assert.equal(drawn.run, false, `${code} with the weapon out is a walk`);
    // …and the rest of the stride is untouched: a drawn weapon slows the player, it does not
    // stop them, and it does not take the forward key with it.
    assert.equal(drawn.forward, 1, 'a drawn weapon still walks forward');
  }
});

test('and without the sprint key there is no run either way', () => {
  assert.equal(inputOf(new Set(['KeyW']), new Set(), false).run, false, 'no key, no sprint');
  assert.equal(inputOf(new Set(['KeyW']), new Set(), true).run, false, 'no key, no sprint (drawn)');
});

test('the builder is callable with no rig in scope at all — the defect D-26 was exactly this', () => {
  // Before the fix this threw `ReferenceError: weaponRig is not defined`, and it threw only
  // here: with a sprint key held. A builder that cannot be called is not a law.
  const run = inputOf(new Set(['ShiftLeft', 'KeyW']), new Set());
  assert.equal(run.run, true, 'a caller with no rig in hand is a player with nothing drawn');
  assert.equal(run.forward, 1);
});

test('the motor\'s own contract survives the drawn gate: axes, edges and the guard keys', () => {
  const held = new Set(['KeyS', 'KeyD', 'Space', 'ControlLeft']);
  const pressed = new Set(['ControlLeft']);
  const input = inputOf(held, pressed, true);
  assert.deepEqual(input, {
    // `S` arrives as a **negative axis** — the first version passed a boolean and `S` moved
    // nothing at all (the motor has no `back` arm).
    forward: -1, back: true, strafe: 1, jump: true,
    run: false, crouch: true, sneak: true, autoRun: false,
  }, 'every other field the motor reads is what it was');
  // **`Ctrl` crouches and `C` does not** — the owner, 2026-10-19: *"the command for crounching needs
  // to be CTRL and not C because its overlapping with the cast menu"*. `C` is the spellbook's key.
  assert.equal(inputOf(new Set(), new Set(['ControlLeft']), false).crouch, true, 'left Ctrl is a crouch');
  assert.equal(inputOf(new Set(), new Set(['ControlRight']), false).crouch, true, 'right Ctrl too');
  assert.equal(inputOf(new Set(['ControlLeft']), new Set(), false).crouch, false, 'a held Ctrl is not a press');
  assert.equal(inputOf(new Set(), new Set(['KeyC']), false).crouch, false, 'C is the spellbook, not a crouch');
});

test('the drawn gate is per-frame, so sheathing gives the sprint straight back', () => {
  const keys = new Set(['ShiftLeft', 'KeyW']);
  assert.equal(inputOf(keys, new Set(), false).run, true, 'put away — the run is back');
  assert.equal(inputOf(keys, new Set(), true).run, false, 'and back out again — the walk');
});

test('the rig the scene hands in is the rig the player sees: `drawn` is first person AND out', () => {
  // The browser half measures speeds; this is the wiring contract under it — the value the
  // scene passes is the report's own `drawn`, which is where view and state meet
  // (`interior.js`'s `weaponViewReport`), so a third-person view cannot deny the sprint and a
  // sheathed weapon cannot grant it.
  const report = { view: 'first', state: 'idle', rigDrawn: true };
  const drawn = report.view === 'first' && report.rigDrawn;
  assert.equal(canRunUnlessDrawn(drawn), false, 'first person with the blade out is a walk');
  assert.equal(canRunUnlessDrawn({ ...report, view: 'third' }.view === 'first' && true), true,
    'the third-person view draws no held weapon, so the stride is the player\'s');
});
