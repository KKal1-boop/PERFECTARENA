// Source: https://en.uesp.net/wiki/Arena:Artifacts
// Original identities, base equipment and powers; durations/charges are reconstructed
// on this engine's seconds-based spell model (not an assertion of exact Arena timing).
const row = (id, name, base, powers, extra = {}) => Object.freeze({ id, name, base, powers, artifact: true, price: 10000, ...extra });
export const ARTIFACTS = Object.freeze([
  row('auriels-shield', "Auriel's Shield", 'ebony-kite-shield', [{kind:'resist',element:'fire',power:8},{kind:'mirror',power:1},{kind:'ward',power:50,perLevel:35}], {armour:3}),
  row('ebony-mail', 'Ebony Mail', 'ebony-plate-cuirass', [{kind:'resist',element:'magic',power:10},{kind:'resist',element:'fire',power:10},{kind:'ward',power:80,perLevel:1}], {armour:9}),
  row('lords-mail', "Lord's Mail", 'adamantium-plate-cuirass', [{kind:'regeneration',power:5},{kind:'cure',element:'poison',power:100},{kind:'resist',element:'magic',power:10}], {armour:9}),
  row('spell-breaker', 'Spell Breaker', 'dwarven-tower-shield', [{kind:'mirror',power:1},{kind:'freeAction',power:100}], {armour:4}),
  row('auriels-bow', "Auriel's Bow", 'elven-long-bow', [{kind:'damage',power:50,perLevel:1},{kind:'fatigueDrain',power:50,perLevel:1},{kind:'spellDrain',power:50,perLevel:1}], {target:'single'}),
  row('chrysamere', 'Chrysamere', 'adamantium-claymore', [{kind:'heal',power:100,perLevel:100},{kind:'mirror',power:1},{kind:'resist',element:'fire',power:10}]),
  row('ebony-blade', 'Ebony Blade', 'ebony-katana', [{kind:'drain',power:100},{kind:'fatigueDrain',power:100},{kind:'silence',power:100}], {target:'single',onHit:'vampiric'}),
  row('staff-of-magnus', 'Staff of Magnus', 'ebony-staff', [{kind:'regeneration',power:2},{kind:'absorb',power:100}]),
  row('volendrung', 'Volendrung', 'dwarven-warhammer', [], {onHit:'volendrung'}),
  row('necromancers-amulet', "Necromancer's Amulet", null, [{kind:'absorb',power:100},{kind:'intelligence',power:50},{kind:'regeneration',power:1}], {kind:'jewelry',slot:'amulet',armour:9}),
  row('ring-of-khajiit', 'Ring of Khajiit', null, [{kind:'invisibility',power:1},{kind:'speed',power:100}], {kind:'jewelry',slot:'ring',armour:6}),
  row('ring-of-phynaster', 'Ring of Phynaster', null, [{kind:'resist',element:'poison',power:10},{kind:'resist',element:'shock',power:10},{kind:'resist',element:'magic',power:10}], {kind:'jewelry',slot:'ring',armour:6}),
  row('warlocks-ring', "Warlock's Ring", null, [{kind:'speed',power:100},{kind:'heal',power:50,perLevel:1},{kind:'mirror',power:1}], {kind:'jewelry',slot:'ring'}),
  row('king-orgnums-coffer', "King Orgnum's Coffer", null, [], {kind:'misc',utility:'gold'}),
  row('oghma-infinium', 'Oghma Infinium', null, [], {kind:'misc',utility:'attributes'}),
  row('skeletons-key', "Skeleton's Key", null, [], {kind:'misc',utility:'unlock'}),
]);
/** Original Coffer: 1–100 gold/day, disappearing after 10,000 gold total. */
export function useOrgnumsCoffer(character, day, roll) {
  const id = 'king-orgnums-coffer';
  if (!Number.isInteger(day) || !Number.isInteger(roll) || roll < 1 || roll > 100) return { ok: false, character };
  if (character.artifactDays?.[id] === day) return { ok: false, character };
  const total = Math.max(0, Math.min(10000, Number(character.cofferGold) || 0));
  if (total >= 10000) return { ok: false, exhausted: true, character };
  const gold = Math.min(roll, 10000 - total);
  return { ok: true, gold, exhausted: total + gold === 10000, character: {
    ...character, gold: (character.gold ?? 0) + gold, cofferGold: total + gold,
    artifactDays: { ...(character.artifactDays ?? {}), [id]: day },
  } };
}

const WEAPON_CLASSES = ['archer','assassin','barbarian','battlemage','knight','monk','ranger','rogue','sorcerer','spellsword','warrior'];
const ARTIFACT_CLASSES = {
  'auriels-shield': ['barbarian','bard','knight','ranger','rogue','spellsword','warrior'],
  'ebony-mail': ['knight','ranger','warrior'],
  'lords-mail': ['knight','ranger','warrior'],
  'spell-breaker': ['barbarian','knight','warrior'],
  'auriels-bow': WEAPON_CLASSES, chrysamere: WEAPON_CLASSES,
  'ebony-blade': WEAPON_CLASSES, volendrung: WEAPON_CLASSES,
  'staff-of-magnus': [...WEAPON_CLASSES,'healer','mage','nightblade'],
};
/** Unknown classes may not bypass restrictions; unrestricted jewelry/utility items remain usable. */
export function canUseArtifact(character, id) {
  if (!artifactById(id)) return false;
  const classes = ARTIFACT_CLASSES[id];
  return !classes || classes.includes(String(character?.classId ?? '').toLowerCase());
}

export function artifactById(id) { return ARTIFACTS.find(a => a.id === id) ?? null; }
export function artifactSpell(item, level = 1) {
  return { name: item.name, points: 1, target: item.target ?? 'self', effects: item.powers.map(e => ({...e, power:e.power + (e.perLevel ?? 0) * Math.max(1, level)})), codes:[], element:'magic' };
}
