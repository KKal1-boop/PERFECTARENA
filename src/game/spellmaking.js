// Arena:Magic: three effects per custom spell, 32 custom spells per character.
// Magnitude pricing is reconstructed, like the existing spell engine, not original bytecode.
import { EFFECTS, describeSpell, knownSpellsOf } from './spells.js';
export const CUSTOM_SPELL_LIMIT = 32;
export const CUSTOM_EFFECT_LIMIT = 3;
export function makeSpell(character, library, spec) {
  const fail = (reason) => ({ ok: false, reason, character });
  if (character?.spellPoints == null) return fail('Only magic-using classes can make spells.');
  const name = String(spec?.name ?? '').trim();
  if (!name || name.length > 32) return fail('Give the spell a name of 1–32 characters.');
  const old = Array.isArray(character.customSpells) ? character.customSpells : [];
  if (old.length >= CUSTOM_SPELL_LIMIT) return fail('Your 32 custom-spell slots are full.');
  if (library?.byName?.has(name.toLowerCase()) || old.some(s => s.name.toLowerCase() === name.toLowerCase())) return fail('A spell already has that name.');
  const selected = spec?.effects;
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > CUSTOM_EFFECT_LIMIT) return fail('Choose one to three effects.');
  const effects = [];
  const targets = new Set();
  let points = 0;
  for (const choice of selected) {
    const source = library?.byName?.get(String(choice.spell ?? '').toLowerCase());
    const index = Number(choice.index ?? 0);
    const base = Number.isInteger(index) ? source?.effects?.[index] : null;
    const power = Number(choice.power ?? base?.power ?? 1);
    if (!base || !EFFECTS[base.kind] || !Number.isInteger(power) || power < 1 || power > 100) return fail('Each effect needs a valid source and a magnitude from 1 to 100.');
    targets.add(source.target);
    effects.push({ ...base, power });
    points += Math.max(1, Math.round(source.points / source.effects.length * power / Math.max(1, base.power ?? 1)));
  }
  // The current cast interface has a single target. Do not silently redirect mixed effects.
  if (targets.size > 1) return fail('Combine effects with the same target type.');
  const cost = Math.max(1, points * 2);
  if ((Number(character.gold) || 0) < cost) return fail(`Spellmaking costs ${cost} gold.`);
  const spell = { id: `custom-${old.length}`, name, points, target: [...targets][0], effects, element: effects[0].element ?? 'none', codes: [], custom: true };
  spell.note = describeSpell(spell);
  return { ok: true, cost, spell, character: { ...character, gold: character.gold - cost, customSpells: [...old, spell], knownSpells: [...knownSpellsOf(character), name] } };
}
export function customSpell(character, name) {
  return (character?.customSpells ?? []).find(s => s.name.toLowerCase() === String(name).toLowerCase()) ?? null;
}
