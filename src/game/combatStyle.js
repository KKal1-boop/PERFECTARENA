// THE SHAPE OF A FIGHT — TELEGRAPHS, ROLLS, PARRIES, AND WHAT A BLOW LEAVES BEHIND.
//
// **None of this is Arena's.** Arena has no dodge, no parry and no stamina at all: a
// monster's blow and the player's swing are both resolved by one roll against a hit chance
// (`game/combat.js`, which is where every number that *is* Arena's lives). What this module
// adds is the layer a modern action RPG sits on — a fight you can *read* — and it is
// therefore this project's own design from top to bottom. Every figure below is labelled
// either with the engine constant it is derived from (`REACH` 3.0 m, `MONSTER_SPEED` 5.5 m/s,
// `PLAYER_SWING` 0.55 s, `CELL_SIZE` 2.5 m, and `attackInterval()`'s own cadence) or, where
// nothing in the data constrains it, **GUESS**, the same convention the rest of the port uses
// (`docs/DECISIONS.md`).
//
// Three rules hold it together, and they are the reason this is a module of pure functions
// rather than a lump inside the scene:
//
//   1. **An attack announces itself.** `attackProfile` splits a monster's own interval into
//      a wind-up it spends telling you what it is about to do, an active frame that hurts,
//      and a recovery that is your opening. `telegraphReading` is what the renderer draws
//      for each of those — a ring on the ground would be invisible in a corridor, so the
//      indicator carries both the ring and whether it belongs on the floor.
//   2. **Defence is a window, not a state.** A dodge has i-frames for a fifth of a second and
//      is airborne for the rest; a parry is live for a sixth of a second out of its 0.35.
//      `resolveDefence` therefore reads *whether the defence was live at the instant the blow
//      landed*, not what the player was holding — mashing has to lose to reading.
//   3. **A heavy charge is a different problem.** It cannot be parried or blocked at all: the
//      only answer is to be somewhere else, which is why `ground: true` and `unblockable` are
//      the same flag.
//
// Nothing here touches the DOM, the renderer or the level: `(profile, phase) -> reading` and
// `(profile, elapsed) -> phase` are what the scene's frame loop needs, and a test can walk a
// whole fight through them without a browser.

import { attackInterval } from './combat.js';

/**
 * The level at which a creature starts fighting like a brute rather than a rat.
 *
 * GUESS, but a constrained one: Arena's own rosters put the fast small things below it
 * (`rosterFor` in `game/monsters.js` fills a level-1 dungeon with rats and goblins) and the
 * tyrants above it, and 6 is where UESP's bestiary starts handing out creatures that hurt.
 */
const HEAVY_LEVEL = 6;

/**
 * The interval at or above which a heavy creature's blow *is* a charge.
 *
 * `attackInterval` (combat.js, RECONSTRUCTED) is `1.1 + min(1.4, level × 0.05)`, so it reaches
 * 1.8 s at level 14 and 2.5 s at level 28: the creatures that take two seconds between blows
 * are the ones whose single blow is meant to matter.
 */
const CHARGE_INTERVAL = 1.8;

/** The player's own reach, in metres — `REACH` in `scenes/interior.js`. */
const REACH = 3.0;
/** One MIF cell, in metres — `CELL_SIZE` in `game/mifMesh.js`. */
const CELL_SIZE = 2.5;

/**
 * A roll: what it costs, how long it takes, and which slice of it keeps you safe.
 *
 * `distance` 3.2 m in `seconds` 0.42 s is **7.6 m/s**, a third faster than the 5.5 m/s
 * `MONSTER_SPEED` of `scenes/interior.js` that a charging creature closes at — deliberately,
 * because a roll that does not outrun
 * the thing it is dodging is decoration. The i-frames are the middle of the roll rather than
 * all of it: the first 0.06 s is the step into it and the last 0.16 s is standing up, and a
 * player who rolls *into* a blow at the wrong moment should be hit for it.
 *
 * The stamina cost is GUESS, sized against the bar below so that two rolls fit and the third
 * leaves you waiting.
 *
 * @type {Readonly<{stamina: number, seconds: number, iframeStart: number, iframeEnd: number, distance: number}>}
 */
export const DODGE = Object.freeze({
  stamina: 12,
  seconds: 0.42,
  iframeStart: 0.06,
  iframeEnd: 0.26,
  distance: 3.2,
});

/**
 * A parry: cheap, short, and worth more than it costs when it lands.
 *
 * The live window is 0.05–0.22 s — a sixth of a second, about a third of the player's own
 * `PLAYER_SWING` (0.55 s) — so a parry is a read and not a hold. `riposteScale` 1.8 is
 * GUESS: a parried blow is turned back for most of twice its own damage, which is the same
 * order as Arena's own critical doubling (`combat.js`'s `resolveAttack`).
 *
 * @type {Readonly<{stamina: number, seconds: number, activeFrom: number, activeTo: number, riposteScale: number}>}
 */
export const PARRY = Object.freeze({
  stamina: 8,
  seconds: 0.35,
  activeFrom: 0.05,
  activeTo: 0.22,
  riposteScale: 1.8,
});

/**
 * The player's own heavy: **hold** the strike, then let go.
 *
 * This is the front the whole the-displayed-fight layer hangs on, and it is GUESS from the
 * bottom up, sized against the shapes already here:
 *
 *   * `armSeconds` 0.18 s — a click faster than this is a light blow, exactly as before;
 *     the heavy is a hold, so the light swing survives untouched under it.
 *   * `fullSeconds` 0.95 s — the hold that buys the full multiplier. It is deliberately a
 *     little longer than a charging creature's own wind-up at the smaller intervals
 *     (`attackProfile` puts the wind-up share at 0.4 of an interval that starts at 1.1 s,
 *     i.e. around 0.44 s): the heavy is a *decision* the creature can punish.
 *   * `stamina` 24 — the bar `staminaMax` sizes at 30 for an average level-1 figure: a heavy
 *     is the roll (`DODGE.stamina` 12) twice over, so a player cannot hold and then roll out
 *     of the answer without paying for it twice.
 *   * `scale` 2.0 — twice the light blow at the full hold, the same order as the riposte's
 *     1.8 and Arena's own critical doubling (`combat.js`'s `resolveAttack`); the scale
 *     *rises* with the hold (`chargeScale`), so a hurried heavy is a weaker heavy.
 *   * `cooldown` 0.85 s — the light swing's `PLAYER_SWING` 0.55 s plus the recovery the
 *     bigger animation readably takes.
 *
 * @type {Readonly<{armSeconds: number, fullSeconds: number, stamina: number, scale: number, cooldown: number}>}
 */
export const HEAVY = Object.freeze({
  armSeconds: 0.18,
  fullSeconds: 0.95,
  stamina: 24,
  scale: 2.0,
  cooldown: 0.85,
});

/**
 * What a blow struck after `held` seconds of hold is worth.
 *
 * A hold shorter than `HEAVY.armSeconds` is not a heavy at all: the caller strikes light.
 * Between the arm and `HEAVY.fullSeconds` the multiplier climbs linearly from 1.3 to the
 * full 2.0 — a hurried heavy is worth more than a light blow but less than a committed one
 * — and past the full hold it is the full multiplier, capped: holding longer is not
 * rewarded, or the fight stops being about the moment it is struck.
 *
 * @param {number} held  seconds the strike was held before release
 * @returns {{heavy: boolean, scale: number, progress: number}}  `progress` 0–1 is how full
 *   the charge is, for the weapon's own glow and the HUD to read
 */
export function chargeScale(held) {
  const t = Math.max(0, Number(held) || 0);
  if (t < HEAVY.armSeconds) return { heavy: false, scale: 1, progress: Math.min(1, t / HEAVY.armSeconds) };
  const charge = Math.min(1, (t - HEAVY.armSeconds) / Math.max(0.001, HEAVY.fullSeconds - HEAVY.armSeconds));
  return { heavy: true, scale: 1.3 + (HEAVY.scale - 1.3) * charge, progress: charge };
}

/**
 * How much of a blocked blow gets through.
 *
 * GUESS. Arena has no blocking, so there is nothing to read it off: a quarter through is
 * "a shield is worth having, and is not a wall".
 */
const BLOCK_THROUGH = 0.25;

/** Stamina regained a second, once regeneration resumes — GUESS, see `stepStamina`. */
const STAMINA_REGEN = 6;
/** Seconds of no regeneration after spending — GUESS: a roll should cost a beat, not a rest. */
const REGEN_DELAY = 0.6;

/**
 * What *holding* a guard costs, a second at a time.
 *
 * GUESS. Blocking paid nothing before this (the roadmap's own gap: "block costs nothing");
 * the price is a drain a player can feel against the 6-regen-a-second bar: three seconds
 * under a long fight empties an average bar, so the guard is a decision and not a posture.
 */
export const BLOCK_COST = 0.9;

/**
 * A frame of the held guard: pay by the tick, and say when the guard gives way.
 *
 * The caller holds the button and passes `holding`; this drains while it is held and
 * returns **false** the first frame the bar cannot cover the tick, which is the signal
 * to drop the guard — a player cannot block forever with an empty bar.
 *
 * Note the deliberate asymmetry with a roll: a drain never sets `REGEN_DELAY` on its own,
 * so a player who leans on the guard still breathes between ticks rather than having to
 * wait a delay that every frame renews.
 *
 * @param {{stamina?: number, max?: number, regenIn?: number}} state  mutated in place
 * @param {number} dt  seconds
 * @param {boolean} holding  whether the guard is up this frame
 * @returns {boolean} whether the guard may stay up
 */
export function stepGuardStamina(state, dt, holding) {
  if (!state) return true;
  if (!holding) return true;
  const step = Math.max(0, Number(dt) || 0);
  if (step <= 0) return true;
  const cost = BLOCK_COST * step;
  const max = Number.isFinite(state.max) ? state.max : staminaMax(state);
  if (!Number.isFinite(state.stamina)) state.stamina = max;
  if (state.stamina < cost) return false;
  state.stamina -= cost;
  return true;
}

// ── the creature reads the guard ───────────────────────────────────────────
//
// A shield a monster walks straight into is a wall the fight does not notice. Making the
// foe answer the guard turns blocking from a damage filter into a *conversation*: the guard
// is respected (a light creature waits out of the reach and drifts, hunting the moment the
// guard comes down or grows bored), and the heavy ignores it entirely, because a creature
// whose answer is "be somewhere else" has no use for your shield — that is what its ground
// ring already said. Mashing a guard against a cautious foe earns a circling hunter.

/**
 * How a creature answers a raised guard.
 *
 * `respect` is whether the foe's plan *changes*: true for any body that cares. `bait` is
 * how long, in seconds, a light creature would rather wait than swing into the steel; a
 * heavy creature's bait is 0 — it comes anyway, and its ground ring is the warning. This is
 * pure policy, GUESS by design (`STAGGER_SECONDS`-shaped numbers the fight's own clocks can
 * punish); the *movement* of circling is the scene's, with its walls and its walkable test.
 *
 * @param {object} monster  a rolled monster, or anything with a `level`
 * @param {{guarding?: boolean, seconds?: number}} [opts]  `seconds` is how long the guard
 *   has already been held this foe: a foe that has waited long enough commits anyway, or
 *   the guard would be a pause button.
 * @returns {{respect: boolean, bait: number, circle: boolean}}
 */
export function foeReadsGuard(monster, opts = {}) {
  const level = Number.isFinite(monster?.level) ? monster.level : 1;
  const heavy = Boolean(monster?.heavy) || level >= HEAVY_LEVEL;
  if (!opts.guarding) return { respect: false, bait: 0, circle: false };
  if (heavy) return { respect: true, bait: 0, circle: false };
  // A guard held for `BAIT_PATIENCE` has been *read* long enough: the foe doubles down and
  // swings anyway, so a shield buys a breath, not a standstill.
  return { respect: true, bait: Number.isFinite(opts.seconds) && opts.seconds >= BAIT_PATIENCE ? 0 : 0.55, circle: true };
}

/**
 * How long a guarded light creature has patience before it commits anyway — the same shape
 * as `STAGGER_SECONDS`, a beat the fight can punish a passionate shield for.
 */
export const BAIT_PATIENCE = 1.8;

// ── poise — the weight a blow carries through a guard of flesh ─────────────
//
// A fight where every creature eats its own cadence of blows to the end is a spreadsheet.
// A creature that *budges* — takes a wound, keeps its footing, then takes another and
// finally loses it — is a fight with a shape: the player's bigger blows matter more than
// their fairness, and a wound can *cancel* the thing it interrupted instead of merely
// taking health. Poise is the meter of that: it drains with every landed blow, and when
// it empties the creature **staggers** — recoils, and drops whatever it had committed to.

/**
 * How long a poise break holds a creature.
 *
 * GUESS, but pinned against both clocks a fight runs on: it is noticeably longer than the
 * player's own swing cooldown (`PLAYER_SWING` 0.55 s in the scene) so the break is a real
 * opening, and clearly shorter than the smallest `attackInterval` (1.1 s), so a staggered
 * creature has *spent* something real by the time it is free.
 */
export const STAGGER_SECONDS = 0.9;

/**
 * How much poise a creature of a level has.
 *
 * GUESS, shaped by what breaks it: a level-1 rat (poise 20) staggers under a single
 * riposte (a light blow ~2–8 damage × 0.6 barely buds it, but a heavy or a riposte easily
 * empties it), while a level-14 tyrant (48) eats several heavies before its footing goes.
 * The slope is gentle — `base + 2 a level` — so level parity never makes a foe immune,
 * only stubborn.
 *
 * @param {number} level
 * @returns {number}
 */
export function poiseMax(level = 1) {
  const lvl = Number.isFinite(level) ? level : 1;
  return Math.round(18 + lvl * 2);
}

/**
 * The poise a landed blow takes.
 *
 * GUESS: six tenths of the damage, so a creature's *fairness* (its own damage table) also
 * measures how much of its footing each player blow eats — a mace eats footing faster than
 * a dagger draws it. A riposte is the windows' reward and takes a full damage-and-a-tenth:
 * being turned back at the moment of commitment is the most unsettling thing that can
 * happen to a body.
 *
 * @param {{damage?: number, riposte?: boolean}} [opts]
 * @returns {number} at least 1
 */
export function poiseCost({ damage = 0, riposte = false } = {}) {
  const hurt = Math.max(0, Number(damage) || 0);
  return Math.max(1, Math.round(hurt * (riposte ? 1.1 : 0.6)));
}

/**
 * Take a wound of poise; maybe lose the footing entirely.
 *
 * Mutates `state` (created on the first call: `{poise, max}`), and answers
 * `{staggered}` — the caller does the staggering (drops the committed attack, holds a
 * recovery clock), because that is a scene's business.
 *
 * When the meter empties it *fills again* — a creature that has staggered has its footing
 * back when the stagger itself is over; poise never stays broken.
 *
 * @param {{poise?: number, max?: number}} state  mutated in place
 * @param {number} cost
 * @returns {{staggered: boolean}}
 */
export function applyPoise(state, cost) {
  if (!state) return { staggered: false };
  const bite = Math.max(0, Number(cost) || 0);
  if (bite === 0) return { staggered: false };
  const max = Number.isFinite(state.max) ? state.max : poiseMax(1);
  state.max = max;
  if (!Number.isFinite(state.poise)) state.poise = max;
  state.poise -= bite;
  if (state.poise <= 0) {
    state.poise = max;
    return { staggered: true };
  }
  return { staggered: false };
}

// ── the creature's own breathing money ─────────────────────────────────────
//
// A monster that swings without end is a schedule, not a fight. The same bookkeeping
// the player's is applies to the creature: every attack spends, exhaustion denies, and
// regeneration – slower than the player's, because it is an appetite, not a hope –
// refills between blows. A spent creature still advances; it just cannot commit.

/** One attack's cost to the creature — GUESS, two blows then a beat at regen 4/s. */
export const MONSTER_ATTACK_COST = 10;
/** Stamina a creature regains a second — GUESS, slower than the player's 6. */
export const MONSTER_REGEN = 4;

/**
 * Whether a creature can afford its next blow.
 *
 * @param {{stamina?: number, max?: number}} state
 * @returns {boolean}
 */
export function monsterCanAttack(state) {
  if (!state) return true;
  if (!Number.isFinite(state.stamina)) return true;
  return state.stamina >= MONSTER_ATTACK_COST;
}

/**
 * Pay for a creature's blow; a refused pay is a creature too winded to commit.
 *
 * Unlike the player's, this does not consider an empty `regenIn` ledger: the caller
 * regenerates the creature's bar on its own clock (`stepMonsterStamina`).
 *
 * @param {{stamina?: number, max?: number, regenIn?: number}} state  mutated in place
 * @returns {boolean} whether the attack may begin
 */
export function payMonsterAttack(state) {
  // An actor with no ledger (a townsperson in a squabble) pays nothing: it never had one.
  if (!state) return true;
  if (!monsterCanAttack(state)) return false;
  return spendStamina(state, MONSTER_ATTACK_COST);
}

/**
 * A frame of a creature's regeneration — the player's clock at the creature's pace.
 *
 * @param {{stamina?: number, max?: number, regenIn?: number}} state  mutated in place
 * @param {number} dt  seconds
 * @returns {number} the bar after this frame
 */
export function stepMonsterStamina(state, dt) {
  if (!state) return 0;
  const max = Number.isFinite(state.max) ? state.max : staminaMax(state);
  state.max = max;
  if (!Number.isFinite(state.stamina)) state.stamina = max;
  state.stamina = Math.min(max, state.stamina + MONSTER_REGEN * Math.max(0, Number(dt) || 0));
  return state.stamina;
}

/**
 * When a creature gives up the fight.
 *
 * GUESS twice over. A creature wants out when it is nearly dead (`FLEE_HEALTH` of its own
 * health) or spent (stamina at `FLEE_STAMINA` of its bar) — and **heavy creatures never
 * flee**: the profile that makes its charge unblockable is the same thing that makes it
 * a tyrant, and a tyrant does not run. A fleeing creature keeps the battlefield honest a
 * different way: it walks off the fight, and the player may let it or cut it down.
 */
export const FLEE_HEALTH = 0.15;
export const FLEE_STAMINA = 0.05;

/**
 * Does this creature want to be somewhere else?
 *
 * @param {{health?: number, maxHealth?: number, heavy?: boolean, level?: number}} monster
 * @param {{stamina?: number, max?: number}} [state]
 * @returns {boolean}
 */
export function wantsToFlee(monster, state) {
  const level = Number.isFinite(monster?.level) ? monster.level : 1;
  const heavy = Boolean(monster?.heavy) || level >= HEAVY_LEVEL;
  if (heavy) return false;
  const health = Number.isFinite(monster?.health) ? monster.health : Infinity;
  const maxHealth = Number.isFinite(monster?.maxHealth) ? monster.maxHealth : 0;
  if (maxHealth > 0 && health / maxHealth <= FLEE_HEALTH) return true;
  if (state && Number.isFinite(state.max) && Number.isFinite(state.stamina)) {
    return state.stamina <= FLEE_STAMINA * state.max;
  }
  return false;
}

/**
 * How big the stamina bar is.
 *
 * Endurance is Arena's own attribute and its index in the rolled array (2 = willpower,
 * 3 = agility… see `combat.js`'s `attributeOf` callers for the same table); half of it plus
 * five a level is GUESS, sized so that an average character (Endurance 50, level 1) has 30:
 * two rolls of 12, or a roll and two parries, with nothing to spare.
 *
 * @param {{endurance?: number, level?: number}} [actor]
 * @returns {number} 10 or more
 */
export function staminaMax({ endurance = 50, level = 1 } = {}) {
  const end = Number.isFinite(endurance) ? endurance : 50;
  const lvl = Number.isFinite(level) ? level : 1;
  return Math.max(10, Math.round(end / 2) + lvl * 5);
}

/**
 * Pay for a dodge or a parry.
 *
 * Refuses at zero — a roll you cannot afford does not happen — and refuses atomically: a
 * refused spend leaves the bar exactly as it was, so a player cannot spend the last of it
 * twice on the same frame. Spending also stops regeneration for `REGEN_DELAY`, which is what
 * makes stamina a thing a fight is *about* rather than a number that refills while you spam.
 *
 * @param {{stamina?: number, max?: number, regenIn?: number}} state  mutated in place
 * @param {number} amount
 * @returns {boolean} whether it was affordable
 */
export function spendStamina(state, amount) {
  if (!state) return false;
  const cost = Number(amount) || 0;
  if (cost <= 0) return true;
  const max = Number.isFinite(state.max) ? state.max : staminaMax(state);
  state.max = max;
  if (!Number.isFinite(state.stamina)) state.stamina = max;
  if (state.stamina < cost) return false;
  state.stamina -= cost;
  state.regenIn = REGEN_DELAY;
  return true;
}

/**
 * A frame of regeneration.
 *
 * `STAMINA_REGEN` 6 a second means a full 30-point bar takes five seconds — longer than any
 * `attackInterval` (1.1–2.5 s), so a player who rolls out of every blow runs dry and has to
 * fight for the space to breathe. GUESS, but bounded by that cadence on purpose.
 *
 * @param {{stamina?: number, max?: number, regenIn?: number}} state  mutated in place
 * @param {number} dt  seconds
 * @returns {number} the bar after this frame
 */
export function stepStamina(state, dt) {
  if (!state) return 0;
  const max = Number.isFinite(state.max) ? state.max : staminaMax(state);
  state.max = max;
  if (!Number.isFinite(state.stamina)) state.stamina = max;
  const step = Math.max(0, Number(dt) || 0);
  if (Number.isFinite(state.regenIn) && state.regenIn > 0) {
    state.regenIn = Math.max(0, state.regenIn - step);
    return state.stamina;
  }
  state.stamina = Math.min(max, state.stamina + STAMINA_REGEN * step);
  return state.stamina;
}

/**
 * How one creature's attack is laid out in time, so it can be read and answered.
 *
 * The *total* is Arena's own cadence (`attackInterval`, which the port already uses to decide
 * when a monster swings again — nothing here changes how often it swings). What is added is
 * the split: a wind-up long enough to see, an active frame that hurts, and a recovery that is
 * the player's turn. The fractions are GUESS; the shapes are not:
 *
 *   * a heavy creature (level ≥ `HEAVY_LEVEL`) winds up for longer and hits harder, because
 *     its whole point is that you saw it coming;
 *   * a heavy creature *slow* enough (interval ≥ `CHARGE_INTERVAL`) is charging — its blow
 *     cannot be parried or blocked, so its wind-up is the longest of all and its indicator
 *     goes on the ground;
 *   * its `reach` grows with its size, from just inside the player's own `REACH` (3.0 m) up to
 *     a shade beyond it, so a big thing can hit you before you can hit it.
 *
 * @param {object} monster  a rolled monster (`combat.js`'s `rollMonster`), or anything with a level
 * @param {{distance?: number}} [opts]  where the player is, in metres: read by the caller (a
 *   creature that is not in range never commits to the attack at all), and deliberately *not*
 *   part of the returned profile, which is a property of the creature and not of the moment
 * @returns {{windup: number, active: number, recover: number, reach: number, unblockable: boolean, charge: boolean, damageScale: number}}
 */
export function attackProfile(monster, { distance = 0 } = {}) {
  // `distance` is accepted and deliberately unused: it is the caller's business whether the
  // creature is close enough to commit at all, and returning it here would put the moment
  // inside a value that is a property of the creature.
  void distance;
  const level = Number.isFinite(monster?.level) ? monster.level : 1;
  const interval = Math.max(0.6, attackInterval({ level }));
  const heavy = Boolean(monster?.heavy) || level >= HEAVY_LEVEL;
  const charge = Boolean(monster?.charge) || (heavy && interval >= CHARGE_INTERVAL);
  // The split of the cadence. A charging blow spends more than half of its interval telling
  // the player what it is; an ordinary one spends two fifths.
  const windupShare = charge ? 0.55 : heavy ? 0.45 : 0.4;
  const windup = Math.max(0.25, interval * windupShare);
  const active = interval * 0.15;
  // The recovery is whatever is left, never negative — and the sum is the interval exactly,
  // so this cannot change a monster's rate of attack.
  const recover = Math.max(0.05, interval - windup - active);
  const reach = Number.isFinite(monster?.reach)
    ? monster.reach
    : Math.min(4.4, 2.6 + 0.06 * level);
  return {
    windup,
    active,
    recover,
    reach,
    unblockable: charge,
    charge,
    damageScale: charge ? 1.6 : heavy ? 1.25 : 1,
  };
}

/**
 * Where an attack is, `elapsed` seconds into it.
 *
 * Phases are half-open and cover the whole timeline with no gaps, so a frame loop can ask
 * every frame and always get an answer: `windup` for the telegraph, `active` for the blow,
 * `recover` for the opening, and `done` once the creature is free to start again.
 *
 * @param {{windup: number, active: number, recover: number}} profile
 * @param {number} elapsed  seconds since the attack began
 * @returns {{phase: 'windup'|'active'|'recover'|'done', progress: number, remaining: number}}
 */
export function attackPhase(profile, elapsed) {
  const t = Math.max(0, Number(elapsed) || 0);
  const windup = Math.max(0, Number(profile?.windup) || 0);
  const active = Math.max(0, Number(profile?.active) || 0);
  const recover = Math.max(0, Number(profile?.recover) || 0);
  if (t < windup) return { phase: 'windup', progress: windup > 0 ? t / windup : 1, remaining: windup - t };
  if (t < windup + active) {
    return { phase: 'active', progress: active > 0 ? (t - windup) / active : 1, remaining: windup + active - t };
  }
  if (t < windup + active + recover) {
    return { phase: 'recover', progress: recover > 0 ? (t - windup - active) / recover : 1, remaining: windup + active + recover - t };
  }
  return { phase: 'done', progress: 1, remaining: 0 };
}

/**
 * Who wins when a blow and a defence arrive together.
 *
 * `intent` is what the player tried and `defence` is what was **actually live** at the instant
 * the blow landed (`DODGE`'s i-frame window, `PARRY`'s active window, a raised shield); only
 * the live one counts, which is the rule that makes mashing lose to reading. `intent` is
 * accepted so that a caller can hand over the one record of what the player did and **nothing
 * is decided by it** — a parry meant but a shield raised resolves as a block. `phase` is the
 * attack's phase at that instant: if the attacker is still winding up, the player's window has
 * already closed by the time the blow lands, and if it is recovering the blow is over — either
 * way the action missed its moment and the player is hit.
 *
 * The four outcomes, in the order they are decided:
 *
 *   1. nothing live → **hit**, full damage;
 *   2. the timing missed (phase is not `active`) → **hit**, full damage;
 *   3. a live dodge → **dodged**, no damage, whatever the attack is;
 *   4. an `unblockable` charge → **hit**, full damage — a parry or a block is not an answer to
 *      it, which is what the ground indicator told the player;
 *   5. a live parry → **parried**, no damage, and `riposte` is the multiplier the player's own
 *      next blow may be turned by (`PARRY.riposteScale`);
 *   6. a live block → **blocked**, `BLOCK_THROUGH` of the damage.
 *
 * @param {{phase?: string, intent?: string, defence?: string, unblockable?: boolean}} opts
 * @returns {{outcome: 'dodged'|'parried'|'blocked'|'hit', damageScale: number, riposte: number}}
 */
export function resolveDefence({ phase = 'active', intent = 'none', defence = 'none', unblockable = false } = {}) {
  const live = ['dodge', 'parry', 'block'].includes(defence) ? defence : 'none';
  if (live === 'none') return { outcome: 'hit', damageScale: 1, riposte: 0 };
  if (phase !== 'active') return { outcome: 'hit', damageScale: 1, riposte: 0 };
  if (live === 'dodge') return { outcome: 'dodged', damageScale: 0, riposte: 0 };
  if (unblockable) return { outcome: 'hit', damageScale: 1, riposte: 0 };
  if (live === 'parry') return { outcome: 'parried', damageScale: 0, riposte: PARRY.riposteScale };
  return { outcome: 'blocked', damageScale: BLOCK_THROUGH, riposte: 0 };
}

/**
 * What the renderer draws for an attack, right now.
 *
 * Two readings, because one is not enough: a ring of threat around the creature (the
 * `radiusInCells` a body has to be outside of) and whether that threat is **on the ground** —
 * true only for a charge, whose whole answer is to run out of the marked area rather than to
 * time anything. `radiusInCells` is the profile's own `reach` over `CELL_SIZE`, so the ring is
 * the real distance the blow lands at and not a decoration: a level-1 creature marks 1.1 cells
 * and a level-30 one 1.8.
 *
 * The colours are GUESS and deliberately the two a player already reads everywhere else —
 * amber for "it is coming", red for "now".
 *
 * @param {{reach?: number, charge?: boolean, unblockable?: boolean}} profile
 * @param {{phase: string}} phase  from `attackPhase`
 * @returns {{ring: 'none'|'windup'|'active', colour: string, radiusInCells: number, ground: boolean}}
 */
export function telegraphReading(profile, phase) {
  const reach = Number.isFinite(profile?.reach) ? profile.reach : REACH;
  const radius = Math.max(0, reach / CELL_SIZE);
  const ground = Boolean(profile?.charge || profile?.unblockable);
  if (phase?.phase === 'windup') return { ring: 'windup', colour: '#e0a03c', radiusInCells: radius, ground };
  if (phase?.phase === 'active') return { ring: 'active', colour: '#d2402c', radiusInCells: radius, ground };
  return { ring: 'none', colour: '#000000', radiusInCells: 0, ground: false };
}

/**
 * The burst a blow leaves: particles and the shake of the camera.
 *
 * Deterministic on purpose — no `Math.random`, no clock: the same input twice gives the same
 * burst, so a test can hold the picture still and compare it, and a replay of a fight is the
 * same fight. The directions are a ring of `count` evenly spaced angles plus a fixed upward
 * component, which reads as a spray rather than a fountain.
 *
 * `screenShake` is GUESS at every point, and said to be: a landed blow is 0.12, a heavy one
 * 0.35, a parried one 0.2 (the ring of steel is felt), a blocked one 0.08, and a dodged one
 * none at all — a blow you avoided should not move the camera.
 *
 * @param {{outcome?: string, damage?: number, heavy?: boolean}} opts
 * @returns {{particles: {vx: number, vy: number, vz: number, life: number, size: number, colour: string}[], count: number, screenShake: number}}
 */
export function hitSpark({ outcome = 'hit', damage = 0, heavy = false } = {}) {
  const hurt = Math.max(0, Number(damage) || 0);
  const colour = outcome === 'parried' ? '#f2e3b0' : outcome === 'blocked' ? '#9aa0a6' : '#c8321e';
  const shake = outcome === 'dodged' ? 0
    : outcome === 'parried' ? 0.2
      : outcome === 'blocked' ? 0.08
        : heavy ? 0.35 : 0.12;
  if (outcome === 'dodged') return { particles: [], count: 0, screenShake: 0 };
  // A burst that grows with the blow, capped: 6 from a tap, 14 from a hammer, plus a few for
  // the damage on top of it.
  const base = heavy ? 14 : 6;
  const count = Math.min(24, base + Math.min(8, Math.round(hurt / 4)));
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const spread = 1 + (i % 3) * 0.4;
    particles.push({
      vx: Math.cos(angle) * spread,
      vy: 0.6 + (i % 4) * 0.35,
      vz: Math.sin(angle) * spread,
      life: 0.25 + (i % 5) * 0.06,
      size: 0.06 + (i % 3) * 0.03,
      colour,
    });
  }
  return { particles, count, screenShake: shake };
}
