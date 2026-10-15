// THE GUARD THAT PAYS, THE CREATURE THAT PAYS, AND THE CREATURE THAT WALKS AWAY.
//
// Three rules added to the fight, each pinned as a pure law here (`game/combatStyle.js`
// holds them; `scenes/interior.js` is only the room they are performed in):
//
//   * **A held guard drains.** Blocking paid nothing before; now it costs `BLOCK_COST`
//     a second off the same bar a roll and a parry pay into, and a bare bar makes the
//     guard give way — no player may press a button to be a wall.
//   * **A monster's blow costs the monster too.** A spent creature cannot begin an
//     attack; it keeps its distance and pushes its next attempt out, which is the delay
//     a fight needs between blows.
//   * **A spent light creature gives the fight up.** It flees — and heavy creatures,
//     the ones the unblockable charge marks, never do: a tyrant does not run.
//
// Run:  node --test tests/unit/combatstyle.guard.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_COST, MONSTER_ATTACK_COST, MONSTER_REGEN,
  payMonsterAttack, monsterCanAttack, stepMonsterStamina,
  stepGuardStamina, stepStamina, spendStamina, staminaMax, wantsToFlee,
} from '../../src/game/combatStyle.js';
/** The player's own pace, restated because the test reads the drain against it. */
const STAMINA_REGEN = 6;

// ── the guard that pays ────────────────────────────────────────────────────────

test('a held guard drains the bar at BLOCK_COST a second, and only while held', () => {
  const bar = { stamina: 20, max: 20 };
  assert.equal(stepGuardStamina(bar, 1, true), true, 'one second is affordable');
  assert.ok(Math.abs(bar.stamina - (20 - BLOCK_COST)) < 1e-9, `one second costs the rate (got ${bar.stamina})`);
  const idle = { stamina: 20, max: 20 };
  stepGuardStamina(idle, 1, false);
  assert.equal(idle.stamina, 20, 'a frame with the guard down pays nothing');
});

test('a drained guard gives way and does not come back up mid-press', () => {
  const bar = { stamina: 1, max: 30 };
  assert.equal(stepGuardStamina(bar, 2, true), false, 'a tick whose cost passes the bar refuses');
  assert.equal(stepGuardStamina(bar, 2, true), false, 'still below, so still broken');
  // And regeneration returns while the guard stays pressed, so the way back up is real.
  const before = bar.stamina;
  stepStamina(bar, 2);
  assert.ok(bar.stamina > before, `the bar breathes again after the guard gives way (${bar.stamina})`);
  assert.equal(stepGuardStamina(bar, 1, true), true, 'a restored bar may hold once more');
  // Two seconds of 6-a-second regen, minus one second of the drain itself.
  assert.ok(Math.abs(bar.stamina - (before + 2 * STAMINA_REGEN - BLOCK_COST)) < 1e-9,
    `the drain took from the very first live tick (${bar.stamina})`);
});

test('the guard drain never sets the post-spend delay — leaning on the guard still breathes', () => {
  const bar = { stamina: 20, max: 20 };
  stepGuardStamina(bar, 1, true);
  assert.equal(bar.regenIn, undefined, 'a tick of guard leaves the delay untouched');
  spendStamina(bar, 5);
  assert.ok(bar.regenIn > 0, 'a roll does set the delay, so the rules stay distinct');
});

// ── the creature that pays ─────────────────────────────────────────────────────

test('a creature pays blow after blow until its bar is bare, then waits for regen', () => {
  const bar = { stamina: staminaMax({ endurance: 50, level: 1 }), max: 30 };
  assert.equal(monsterCanAttack(bar), true);
  assert.equal(payMonsterAttack(bar), true, 'the first blow is paid');
  assert.equal(bar.stamina, 30 - MONSTER_ATTACK_COST, 'and the bar paid it');
  assert.equal(payMonsterAttack(bar), true, 'the second blow is paid barely');
  assert.equal(bar.stamina, MONSTER_ATTACK_COST, 'two blows in, the last one remains');
  assert.equal(monsterCanAttack(bar), true, 'a bar exactly at the cost can still swing');
  assert.equal(payMonsterAttack(bar), true, 'the third is paid to the skin');
  assert.equal(bar.stamina, 0);
  assert.equal(payMonsterAttack(bar), false, 'and a bare bar refuses — the creature is winded');
  assert.equal(monsterCanAttack(bar), false);
  // Regeneration gives the next blow back, slower than the player's own 6 a second.
  stepMonsterStamina(bar, 2.6);
  assert.equal(monsterCanAttack(bar), true, `two and a half seconds of MONSTER_REGEN buys an attack (${Math.abs(bar.stamina - MONSTER_REGEN * 2.6 - MONSTER_ATTACK_COST).toFixed(2)})`);
});

test('an actor with no ledger pays nothing and attacks as always', () => {
  assert.equal(monsterCanAttack(undefined), true, 'no bar, no refusal');
  assert.equal(payMonsterAttack(undefined), true, 'and nothing to pay with cannot refuse a blow');
});

// ── the creature that walks away ───────────────────────────────────────────────

test('a spent light creature wants out; a heavy one never does', () => {
  const spent = { stamina: 0.01, max: 30 };
  assert.equal(wantsToFlee({ health: 40, maxHealth: 40, level: 2 }, spent), true,
    'stamina at the bar\'s own floor is enough reason to leave');
  const dying = { stamina: 30, max: 30 };
  assert.equal(wantsToFlee({ health: 4, maxHealth: 40, level: 4 }, dying), true,
    'a wounded light creature gives up too');
  assert.equal(wantsToFlee({ health: 4, maxHealth: 40, level: 8 }, dying), false,
    'a heavy creature does not run, wounded or not');
  assert.equal(wantsToFlee({ health: 40, maxHealth: 40, level: 8 }, spent), false,
    'nor spent');
  const fresh = { stamina: 30, max: 30 };
  assert.equal(wantsToFlee({ health: 40, maxHealth: 40, level: 3 }, fresh), false,
    'a healthy, breathing creature stays to fight');
});
