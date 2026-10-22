// Searchable bodies: Arena's humanLoot supplies the contents, never the transfer.
// The take-one/take-all split is adapted from sibling Daggerfall Enhanced's
// systems/quickLoot.js; this game's existing inventory panel supplies the UI.
// No creature loot percentages or enchantments are invented here.
import { itemById } from './items.js';

export const CORPSES_PER_PLACE = 32;

export function corpseContents(loot = {}) {
  return {
    gold: Math.max(0, Math.trunc(Number(loot.gold) || 0)),
    items: Array.isArray(loot.items) ? loot.items.filter((id) => itemById(id)) : [],
  };
}

export function corpseRows(loot) {
  const contents = corpseContents(loot);
  const rows = contents.gold ? [{ id: 'gold', name: 'Gold', qty: contents.gold }] : [];
  const counts = new Map();
  for (const id of contents.items) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, qty] of counts) rows.push({ id, name: itemById(id).name, qty });
  return rows;
}

/** Gold goes to the purse as a stack; equipment rows take one, never equip it. */
export function takeCorpseLoot(loot, selected = 'all') {
  const remaining = corpseContents(loot);
  const taken = { gold: 0, items: [] };
  if (selected === 'all' || selected === 'gold') {
    taken.gold = remaining.gold;
    remaining.gold = 0;
  }
  if (selected === 'all') {
    taken.items = remaining.items;
    remaining.items = [];
  } else {
    const index = remaining.items.indexOf(selected);
    if (index >= 0) taken.items.push(...remaining.items.splice(index, 1));
  }
  return { taken, remaining, changed: taken.gold > 0 || taken.items.length > 0 };
}
