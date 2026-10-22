import { itemById, countInBag, removeFromBag, addToBag } from './items.js';

export function equipmentCondition(character, id) {
  const value = Number(character?.itemCondition?.[id] ?? 100);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 100;
}
export function wearEquipment(character, id, amount = 1) {
  if (!itemById(id)) return character;
  return { ...character, itemCondition: { ...(character.itemCondition ?? {}), [id]: Math.max(0, equipmentCondition(character, id) - amount) } };
}
// Quote shape is reconstructed; original smiths negotiate time and price.
export function repairQuote(character, id, days = 10) {
  const item = itemById(id);
  const time = Number(days);
  if (!item || !['weapon', 'armour', 'shield', 'jewelry'].includes(item.kind) && !item.artifact || !Number.isInteger(time) || time < 1 || time > 10) return null;
  if (item.utility === 'gold' || item.utility === 'attributes') return null;
  const missing = Math.max(100 - equipmentCondition(character, id), 100 - Math.max(0, Math.min(100, Number(character?.itemCharges?.[id] ?? 100))));
  if (!missing) return null;
  return { id, days: time, cost: Math.max(1, Math.ceil((item.artifact ? 10000 : item.price) * missing / 100 * 10 / time)) };
}
export function orderRepair(character, bag, id, day, days = 10, smith = '') {
  const quote = repairQuote(character, id, days);
  if (!Number.isFinite(day) || !quote || !countInBag(bag, id)) return {ok:false, reason:'That item does not need repair or is not in your pack.',character,bag};
  if ((character.gold ?? 0) < quote.cost) return {ok:false, reason:`The smith asks ${quote.cost} gold.`,character,bag};
  const next = { ...character, gold: character.gold - quote.cost, repairs: [...(character.repairs ?? []), {...quote, ready: day + days, smith}] };
  if (next.weaponItem === id || next.weapon === id) {next.weapon = 'fists'; next.weaponItem = null;}
  if (next.shield === id) next.shield = null;
  next.armour = Object.fromEntries(Object.entries(next.armour ?? {}).filter(([,v]) => v !== id));
  next.jewelry = Object.fromEntries(Object.entries(next.jewelry ?? {}).filter(([,v]) => v !== id));
  return {ok:true, character:next, bag:removeFromBag(bag,id),quote};
}
export function collectRepairs(character, bag, day, smith = '') {
  const ready = (character.repairs ?? []).filter(r => r.smith === smith && r.ready <= day);
  let next = {...character, repairs:(character.repairs ?? []).filter(r => !ready.includes(r)),itemCondition:{...(character.itemCondition ?? {})},itemCharges:{...(character.itemCharges ?? {})}};
  let out = bag;
  for(const repair of ready) {out=addToBag(out,repair.id);next.itemCondition[repair.id]=100;next.itemCharges[repair.id]=100;}
  return {ok:ready.length>0,character:next,bag:out,count:ready.length};
}
// Requested extension, not an original Arena service. One enchantment per item ID
// matches the current bag's ID-stacked equipment model; duplicate gear is refused.
export function enchantEquipment(character, bag, id, spell) {
  const item = itemById(id);
  if (!item || item.artifact || !(item.kind==='weapon' || item.kind==='shield' || item.kind==='armour' && !['leather','chain'].includes(item.material))) return {ok:false,reason:'Only ordinary weapons, shields and plate can be enchanted.',character};
  if (countInBag(bag,id)!==1) return {ok:false,reason:'Carry exactly one of that item before enchanting it.',character};
  if (!spell?.effects?.length || !Number.isFinite(spell.points) || spell.points < 1) return {ok:false,reason:'Choose a valid spell.',character};
  const cost=Math.max(100,spell.points*10);
  if ((character.gold??0)<cost) return {ok:false,reason:`Enchanting costs ${cost} gold.`,character};
  return {ok:true,cost,character:{...character,gold:character.gold-cost,enchantments:{...(character.enchantments??{}),[id]:JSON.parse(JSON.stringify(spell))},itemCharges:{...(character.itemCharges??{}),[id]:100}}};
}
