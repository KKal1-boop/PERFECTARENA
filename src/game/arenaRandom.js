// ARENA'S RANDOM NUMBER GENERATOR.
//
// Arena generates its cities (and its random dungeons) from a 32-bit seed, and the
// only way to get *the game's* city for a given seed is to run the game's
// generator. It is four lines:
//
//     value *= 7143469;          // wrapping 32-bit multiply
//     return (value >> 16) & 0xFFFF;
//
// so it is ported rather than approximated. `next()` therefore returns a 16-bit
// value (0…65535), which is what every caller in the original indexes and
// compares against — see `tables/cityBlocks.js`'s thresholds, which are written
// in that range.
//
// The multiply-overflow behaviour is the whole subtlety: JavaScript numbers are
// doubles, so `value * 7143469` would be exact and *not* wrap. `Math.imul` gives
// the wrapping 32-bit product, and `>>> 0` keeps it unsigned, matching C++'s
// `uint32_t` on a two's-complement machine.

/** The seed the original falls back to when a caller gives none. */
export const DEFAULT_SEED = 12345;

/** The multiplier, named so a reader can find it in the original. */
export const ARENA_RANDOM_MULTIPLIER = 7143469;

/**
 * Arena's generator. Stateful, like the original's: the sequence depends on how
 * many times it has been drawn from, so a caller must consume draws in the same
 * order the original does.
 */
export class ArenaRandom {
  /** @param {number} [seed] */
  constructor(seed = DEFAULT_SEED) {
    /** @type {number} */
    this.value = seed >>> 0;
  }

  /** @returns {number} the current state, which is also the seed for a replay. */
  getSeed() {
    return this.value;
  }

  /** @param {number} seed */
  srand(seed) {
    this.value = seed >>> 0;
  }

  /** @returns {number} 0…65535, matching `ArenaRandom::next`. */
  next() {
    this.value = Math.imul(this.value, ARENA_RANDOM_MULTIPLIER) >>> 0;
    return (this.value >>> 16) & 0xffff;
  }

  /**
   * @param {number} exclusiveMax
   * @returns {number} 0…exclusiveMax-1
   */
  nextBelow(exclusiveMax) {
    return this.next() % exclusiveMax;
  }

  /** @returns {boolean} */
  nextBool() {
    return this.next() % 2 === 0;
  }
}
