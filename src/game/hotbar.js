// A HOTBAR — TEN CELLS, AND THE THINGS THE PLAYER PINS IN THEM.
//
// The owner, 2026-10-22: *"the hotbar should be for you to put things you have in the
// inventory and spells into, not the normal features of arena you can already click buttons
// to use"*.
//
// So a cell holds **a potion, a scroll or a spell the character owns**, and nothing else. The
// ten verbs the first version shipped (strike, guard, pack, the map…) are gone: every one of
// them is a key, a button on the page, or a click on the world already, and a bar that repeats
// them is a bar with nothing of the player's in it.
//
// The strip starts **empty**. A cell is filled from the pack's `Pin` button or the spellbook's,
// and emptied again by a right-click (or a long press) on the cell, or by the `Unpin` button
// that replaces `Pin` while the thing is on the bar. What a cell holds lives on the character
// (`character.hotbar`) — the field the save already writes — so a bar survives a page load with
// no new storage.
//
// It is **pure** on purpose, the way `game/services.js` and `game/playerHouse.js` are: what a
// cell is, what it is called, whether the player can use it right now, and how a pin is written
// on the character. The scene owns the pictures, the clicks and the casting.

/** How many cells the strip has. */
export const HOTBAR_SLOTS = 10;

/**
 * Is this a thing a cell may hold?
 *
 * A spell is its name (the catalogue's key); an item is its id (the pack's key). Anything else
 * — an old action entry from a save written by the first strip, a half-built object — is not a
 * pin, and `hotbarOf` drops it rather than drawing a dead cell.
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
export function isEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.kind === 'spell') return typeof entry.name === 'string' && entry.name.length > 0;
  if (entry.kind === 'item') return typeof entry.id === 'string' && entry.id.length > 0;
  return false;
}

/** The key a cell is pressed with, for the ten digits. */
export function slotKey(index) {
  const i = Math.trunc(Number(index));
  if (!(i >= 0 && i < HOTBAR_SLOTS)) return '';
  return i === 9 ? '0' : String(i + 1);
}

/**
 * The player's ten cells: a pin where one is saved, `null` where the cell is empty.
 *
 * @param {object|null} character
 * @returns {(object|null)[]} exactly `HOTBAR_SLOTS` entries
 */
export function hotbarOf(character) {
  const saved = Array.isArray(character?.hotbar) ? character.hotbar : [];
  return Array.from({ length: HOTBAR_SLOTS }, (_, i) => (isEntry(saved[i]) ? { ...saved[i] } : null));
}

/**
 * Write one cell, answering a new character (the game never mutates the sheet in place).
 *
 * @param {object} character
 * @param {number} index
 * @param {object} entry  a spell or an item
 * @returns {object} the character with the cell written
 */
export function assignSlot(character, index, entry) {
  const i = Math.trunc(Number(index));
  if (!(i >= 0 && i < HOTBAR_SLOTS) || !isEntry(entry)) return character;
  const cells = hotbarOf(character);
  cells[i] = { ...entry };
  return { ...character, hotbar: cells };
}

/**
 * The first empty cell, or -1 when every cell is full.
 *
 * @param {object|null} character
 * @returns {number}
 */
export function firstFreeSlot(character) {
  return hotbarOf(character).findIndex((entry) => entry === null);
}

/**
 * Take a pin back out, leaving the cell empty.
 *
 * @param {object} character
 * @param {number} index
 * @returns {object}
 */
export function clearSlot(character, index) {
  const i = Math.trunc(Number(index));
  if (!(i >= 0 && i < HOTBAR_SLOTS)) return character;
  const cells = hotbarOf(character);
  cells[i] = null;
  return { ...character, hotbar: cells };
}

/**
 * The cell a pinned thing occupies, or -1 when it is not on the bar.
 *
 * @param {object|null} character
 * @param {'spell'|'item'} kind
 * @param {string} key  the spell's name or the item's id
 * @returns {number}
 */
export function slotOf(character, kind, key) {
  return hotbarOf(character).findIndex((entry) => entry && entry.kind === kind
    && (entry.name ?? entry.id) === key);
}

/**
 * What a cell is, as the player reads it.
 *
 * `available` is the honest half: a spell the character does not know and an item the pack no
 * longer holds both draw as an empty cell with the name struck through, so a pin is never a
 * promise the game cannot keep.
 *
 * @param {object|null} entry
 * @param {{knownSpells?: string[], hasItem?: (id: string) => boolean, itemName?: (id: string) => string}} [world]
 * @returns {{label: string, hint: string, kind: string, available: boolean}}
 */
export function describeEntry(entry, world = {}) {
  if (!isEntry(entry)) {
    return { label: '', hint: 'Empty cell — pin a potion, a scroll or a spell from your pack (I)', kind: 'empty', available: false };
  }
  if (entry.kind === 'spell') {
    const known = !Array.isArray(world.knownSpells) || world.knownSpells.includes(entry.name);
    return { label: entry.name, hint: known ? `Cast ${entry.name}` : `${entry.name} is not in your book`, kind: 'spell', available: known };
  }
  const held = typeof world.hasItem === 'function' ? world.hasItem(entry.id) : true;
  const name = typeof world.itemName === 'function' ? world.itemName(entry.id) : entry.id;
  return { label: name || entry.id, hint: held ? `Use ${name || entry.id}` : `${name || entry.id} is not in your pack`, kind: 'item', available: held };
}

/**
 * The cells as a HUD reads them: number, key, entry, label, kind and whether it can be pressed.
 *
 * @param {object|null} character
 * @param {object} [world]  see `describeEntry`
 * @returns {{index: number, key: string, entry: object|null, label: string, hint: string, kind: string, available: boolean}[]}
 */
export function hotbarRows(character, world = {}) {
  return hotbarOf(character).map((entry, index) => ({
    index, key: slotKey(index), entry, ...describeEntry(entry, world),
  }));
}

/**
 * Find the cell a key names, so the scene's key handler and the strip's digits are one law.
 *
 * @param {string} code  a DOM `KeyboardEvent.code` (`Digit1`…`Digit0`, `Numpad1`…)
 * @returns {number} the cell, or -1 when the code is not a hotbar key
 */
export function slotFromCode(code) {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(String(code ?? ''));
  if (!match) return -1;
  const digit = Number(match[1]);
  return digit === 0 ? 9 : digit - 1;
}
