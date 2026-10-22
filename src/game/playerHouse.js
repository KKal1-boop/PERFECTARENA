// A HOUSE IN THE CITY — what the king sells a friend of the town, and which door it is.
//
// The owner, 2026-10-19: *"you should be able to ask the king to buy a house in the city if
// youre friend with at least 10 people in the city for a lot of money so you can always rest
// without paying an inn in the town also that should teleport you to your house that should be
// a random house door assigned to you and empty and with a functional chest and free resting"*.
//
// This module is the **rule**, and it is pure: whether the king will treat with the player,
// what the deed costs, and which of the city's own house doors becomes theirs. The scene owns
// the page — the conversation, the teleport and the room behind the door — exactly as
// `game/services.js` owns a trade's rules and `scenes/interior.js` owns its buttons.
//
// ## What is the install's and what is this project's
//
//   * **The door is the city's own**: `game/shops.js` already reads every door painted on a
//     city wall, its kind and the interior behind it. A house deed therefore picks from the
//     doors the install draws — never a building invented for the sale.
//   * **The price and the friendship threshold are AUTHORED.** Arena's own house prices are
//     in `A.EXE`, which this data set does not ship (DECISIONS.md D11), and the original has
//     no house-buying conversation this port can read. Five thousand gold and ten friends are
//     this project's numbers, stamped here so a later reading has one place to change.
//   * **A noble house is not for sale.** The owner's palace rule is the law next door to this
//     one: a court may only stand behind a noble house's door, and a player's home is an
//     ordinary house — the one kind of building a city has hundreds of.

/** What the deed costs, in gold. **AUTHORED** — a lot of money, as the owner asked. */
export const HOUSE_PRICE = 5000;
/** How many friends in the city the king requires. **AUTHORED.** */
export const HOUSE_FRIENDS_REQUIRED = 10;

/**
 * Will the king sell this player a house?
 *
 * @param {{friends?: number, gold?: number, owns?: boolean, city?: string|null}} opts
 * @returns {{ok: boolean, reason: string, cost: number, required: number, friends: number}}
 */
export function houseOffer(opts = {}) {
  const friends = Math.max(0, Math.round(Number(opts.friends) || 0));
  const gold = Math.max(0, Math.round(Number(opts.gold) || 0));
  const cost = HOUSE_PRICE;
  const required = HOUSE_FRIENDS_REQUIRED;
  if (!opts.city) return { ok: false, reason: 'There is no city here for the king to sell you a house in.', cost, required, friends };
  if (opts.owns) return { ok: false, reason: `You already own a house in ${opts.city}.`, cost, required, friends };
  if (friends < required) {
    return {
      ok: false,
      reason: `The king will only treat with a friend of ${opts.city}: ${required} friends, and you have ${friends}.`,
      cost, required, friends,
    };
  }
  if (gold < cost) {
    return { ok: false, reason: `A deed in ${opts.city} costs ${cost} gold, and you have ${gold}.`, cost, required, friends };
  }
  return { ok: true, reason: `The king will sell you a house in ${opts.city} for ${cost} gold.`, cost, required, friends };
}

/**
 * The door a deed is written against: one of the city's **house** doors, chosen by the seed.
 *
 * Only a house is eligible. A noble house is a court's seat (and, in this port, the palace's
 * own door), a shop is a trade, and the gate is a hole in the wall; a home is the one door a
 * king can give away. A door with no standable paving in front is refused too, because a home
 * a player cannot walk up to is not a home.
 *
 * @param {{kind: string, row: number, col: number, file: string, stand?: object|null}[]} doors
 * @param {number} seed
 * @returns {object|null} the chosen door record, or null when the city has none
 */
export function pickHouseDoor(doors, seed) {
  const pool = (Array.isArray(doors) ? doors : []).filter((door) =>
    door && door.kind === 'house' && door.stand && String(door.file ?? '').toUpperCase().startsWith('BS'));
  if (!pool.length) return null;
  const state = (Math.abs(Math.round(Number(seed) || 1)) >>> 0) || 1;
  return pool[state % pool.length];
}

/**
 * The shape saved on the character: enough to find the door again from any page, and to know
 * which room behind it is the player's.
 *
 * @param {string} city
 * @param {object} door  a `cityDoors` record
 * @param {number} day
 * @returns {{city: string, row: number, col: number, file: string, stand: {row: number, col: number}|null, boughtDay: number}}
 */
export function houseDeed(city, door, day = 0) {
  return {
    city: String(city ?? ''),
    row: Math.round(Number(door?.row) || 0),
    col: Math.round(Number(door?.col) || 0),
    file: String(door?.file ?? 'BS1.MIF').toUpperCase(),
    stand: door?.stand ? { row: Math.round(Number(door.stand.row) || 0), col: Math.round(Number(door.stand.col) || 0) } : null,
    boughtDay: Math.max(0, Math.round(Number(day) || 0)),
  };
}

/**
 * Is the room the player is standing in the house the deed names?
 *
 * A building page knows three things: the map file it loaded (`BS1.MIF`…`BS8.MIF`), the city
 * it came from (`fromPlace.name`) and the street cell of the doorway it came through
 * (`entryCell`). A deed matches on all three, because every house in a city shares the same
 * eight interiors — the **door**, not the map, is what the player owns.
 *
 * @param {{city?: string, row?: number, col?: number}|null} deed
 * @param {{name?: string}|null} city
 * @param {{row: number, col: number}|null} entryCell
 * @returns {boolean}
 */
export function isOwnedHouseDoor(deed, city, entryCell) {
  if (!deed || !city || !entryCell) return false;
  if (String(deed.city ?? '').toLowerCase() !== String(city.name ?? '').toLowerCase()) return false;
  return Number(deed.row) === Number(entryCell.row) && Number(deed.col) === Number(entryCell.col);
}
