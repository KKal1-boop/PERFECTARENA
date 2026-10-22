// WHAT ARMOUR IS WORTH, AND WHERE IT IS WORN (UESP's own armour table, in the fight).
//
// Arena's armour is not one number. `Arena:Base Armor` gives each *material* an armour
// rating — leather −3, chain −6, plate −9 — and says the rating is subtracted from an
// attacker's roll, so a more negative number protects more; the plate metals then move the
// plate figure (iron +1 for −8, steel and silver 0, elven −1 … ebony −5 for −14). UESP's
// `Arena:Base Shields` gives four shield types (−1 buckler … −4 tower) with the same metal
// shift, and names which **body areas** each one covers. The seven armour pieces each cover
// their own area: helm head, pauldrons the shoulders/upper arms, cuirass the chest and back,
// gauntlets the hands, greaves the waist and upper legs, boots the lower legs and feet.
//
// That is why a flat sum of everything worn is wrong: seven plate pieces at −9 would be −63
// against one roll, when in Arena a blow only meets the piece over the area it struck. This
// module therefore models the missing half — **the body area** — and keeps UESP's numbers
// untouched:
//
//   * `PROTECTION` is the positive form of UESP's rating (leather 3, chain 6, plate 9 + the
//     metal shift 0…+5, iron −1), because the fight adds a subtraction and the catalogue,
//     the panel and a shop all want a number that goes up.
//   * `PIECE_AREAS` and `SHIELD_AREAS` are the source's coverage, not a guess.
//   * `rolledArea` is **RECONSTRUCTED**: UESP does not print the area roll's weights and
//     Arena's own is in `A.EXE` (D11). A blow lands on the chest most often and the feet
//     least, which is the shape of a standing fight and the one this project wrote down.
//   * `armourAt` answers one area's protection from what the character wears, and
//     `armourRating` is the weighted average — the one number the character sheet prints.
//
// Nothing here imports `items.js` or `combat.js`: the catalogue imports this module to build
// its rows, the fight imports it to read them, and both get the same tables. The item lookup
// is a function the caller hands in (`armourAt(character, area, itemById)`), which keeps the
// dependency pointing one way.

/**
 * Every body area a blow can land on, in the order the weights below list them.
 * @type {ReadonlyArray<string>}
 */
export const AREAS = Object.freeze(['head', 'chest', 'leftArm', 'rightArm', 'hands', 'waist', 'legs', 'feet']);

/**
 * How often a blow lands on each area, in percent (sums to 100).
 *
 * **RECONSTRUCTED.** UESP prints the coverage per piece and no roll weights; this project's
 * shape is a standing fight — the chest is the target, the limbs are what a guard misses.
 * Kept in one table so the day a source turns up only this line changes.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const AREA_WEIGHT = Object.freeze({
  head: 8, chest: 30, leftArm: 10, rightArm: 10, hands: 10, waist: 12, legs: 12, feet: 8,
});

/**
 * UESP's material ratings, as positive protection: leather −3, chain −6, plate −9.
 * @type {Readonly<Record<string, number>>}
 */
export const MATERIAL_PROTECTION = Object.freeze({ leather: 3, chain: 6, plate: 9 });

/**
 * The plate metals' shift, from UESP's plate column: iron +1 (worse), steel/silver 0,
 * elven −1 … ebony −5. Written as protection gained, so iron is **−1** and ebony **+5**.
 * @type {Readonly<Record<string, number>>}
 */
export const METAL_SHIFT = Object.freeze({
  iron: -1, steel: 0, silver: 0, elven: 1, dwarven: 2, mithril: 3, adamantium: 4, ebony: 5,
});

/**
 * Which body area each armour slot covers — `Arena:Base Armor`'s "protected area" column.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const PIECE_AREAS = Object.freeze({
  helm: Object.freeze(['head']),
  cuirass: Object.freeze(['chest']),
  'pauldron-left': Object.freeze(['leftArm']),
  'pauldron-right': Object.freeze(['rightArm']),
  gauntlets: Object.freeze(['hands']),
  greaves: Object.freeze(['waist', 'legs']),
  boots: Object.freeze(['feet']),
});

/** Which body areas each shield type covers — `Arena:Base Shields`'s coverage column. */
export const SHIELD_AREAS = Object.freeze({
  buckler: Object.freeze(['hands', 'leftArm']),
  'round-shield': Object.freeze(['hands', 'leftArm', 'waist']),
  'kite-shield': Object.freeze(['hands', 'leftArm', 'waist', 'legs']),
  'tower-shield': Object.freeze(['hands', 'leftArm', 'waist', 'legs', 'head']),
});

/** UESP's shield base ratings as protection: buckler −1 … tower −4. */
export const SHIELD_PROTECTION = Object.freeze({
  buckler: 1, 'round-shield': 2, 'kite-shield': 3, 'tower-shield': 4,
});

/**
 * What a piece of armour protects, in UESP's positive form.
 *
 * @param {{material?: string, slot?: string, armour?: number}} item  a catalogue row
 * @returns {number} 0 when the row is not armour
 */
export function protectionOf(item) {
  const value = Number(item?.armour);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Roll the body area a blow lands on.
 *
 * @param {{nextBelow: (n: number) => number}} random  an `ArenaRandom` (or any 0…n−1 source)
 * @returns {string} one of `AREAS`
 */
export function rolledArea(random) {
  const roll = 1 + random.nextBelow(100);
  let edge = 0;
  for (const area of AREAS) {
    edge += AREA_WEIGHT[area];
    if (roll <= edge) return area;
  }
  return 'chest';
}

/**
 * The armour protecting one body area, from what the character wears.
 *
 * A slot covers only the areas `PIECE_AREAS` names (so a helm does nothing for the legs),
 * and a shield adds its own protection to every area `SHIELD_AREAS` gives its type — which
 * is why a tower shield's head coverage is worth a helm's.
 *
 * @param {object} character
 * @param {string} area  one of `AREAS`
 * @param {(id: string) => object|null} itemById  the catalogue's own lookup
 * @returns {number} protection points, 0 for bare skin
 */
export function armourAt(character, area, itemById) {
  if (!AREAS.includes(area) || typeof itemById !== 'function') return 0;
  let total = 0;
  for (const [slot, id] of Object.entries(character?.armour ?? {})) {
    const item = itemById(id);
    if (!item || item.kind !== 'armour') continue;
    // The slot is the character's own key (`equipFromBag` writes it); the item's `slot`
    // is the catalogue's. Either answers, and a save file that names a mismatched pair is
    // not given coverage the piece does not have.
    const covers = PIECE_AREAS[slot] ?? PIECE_AREAS[item.slot] ?? [];
    if (covers.includes(area)) total += protectionOf(item);
  }
  const shield = itemById(character?.shield);
  if (shield?.kind === 'shield' && (SHIELD_AREAS[shield.type] ?? []).includes(area)) {
    total += protectionOf(shield);
  }
  for (const id of Object.values(character?.jewelry ?? {})) total += Math.max(0, Number(itemById(id)?.armour) || 0);
  return total;
}

/**
 * The whole suit's protection as one number: the weighted average over the body.
 *
 * This is what the character sheet prints, and the honest single figure: a character in a
 * cuirass and nothing else is protected where it matters most and exposed everywhere else,
 * and the number says so. A bare character is 0; full leather is 3, full chain 6, full plate
 * 9, full ebony plate 14 — UESP's own ratings.
 *
 * @param {object} character
 * @param {(id: string) => object|null} itemById
 * @returns {number} 0…14
 */
export function armourRating(character, itemById) {
  if (typeof itemById !== 'function') return 0;
  let total = 0;
  let weight = 0;
  for (const area of AREAS) {
    total += armourAt(character, area, itemById) * AREA_WEIGHT[area];
    weight += AREA_WEIGHT[area];
  }
  return weight ? Math.round(total / weight) : 0;
}

/**
 * The coverage map the panel and a probe read: protection per area, and the average.
 *
 * @param {object} character
 * @param {(id: string) => object|null} itemById
 * @returns {{rating: number, areas: Record<string, number>, covered: string[]}}
 */
export function coverage(character, itemById) {
  const areas = {};
  for (const area of AREAS) areas[area] = armourAt(character, area, itemById);
  return {
    rating: armourRating(character, itemById),
    areas,
    covered: AREAS.filter((area) => areas[area] > 0),
  };
}
