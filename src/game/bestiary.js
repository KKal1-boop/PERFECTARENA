// WHAT EACH CREATURE IS, BESIDES ITS HIT POINTS.
//
// `game/monsters.js` carries Arena's bestiary as a *stat block* — hit points, damage, the
// experience rule and the archive's own sprite name. That is what the fight rolls. What it
// did not carry is the half UESP's own bestiary prints beside those numbers, and which the
// owner's "all kinds of enemies" is really about: the fire daemon that no steel will bite,
// the vampire that silver cuts twice as deep, the ice golem that fire Unmakes, the spider
// whose bite holds you still, the lich that closes its own wounds and sees through
// invisibility, and the skeleton that shrugs a sword off but not a mace.
//
// Every entry below is **UESP's `Arena:Monsters` page** (read 2026-10-17), quoted in the
// comment that carries it. Nothing here is invented: the only this-project number is the
// *rate* at which a regenerating creature heals, because UESP says "regeneration" and gives
// no clock, and `REGEN_PER_SECOND` says so.
//
// The module is pure — a monster id (or a rolled monster) in, a fact out — so the fight, the
// bolt and the browser suite can all ask the same question and get the same answer.

// No import of `combat.js` here on purpose: `combat.js` imports *this* module for the
// immunity check, and a cycle whose top level reads `MATERIALS` before `combat.js` has
// initialised it is a TDZ page (the failure this repository has paid for twice). The ladder
// is written out and a unit test pins it against `combat.js`'s own `MATERIALS` order.

/** Material ids in Arena's own working order, weakest first (`combat.js`'s `MATERIALS`). */
export const MATERIAL_TIER = Object.freeze([
  'iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony',
]);

/**
 * The tier of a metal: iron 0 … ebony 7.
 *
 * UESP's immunity ladder is expressed in *materials* ("below mithril"), and this is the one
 * reading of that ladder. A material nobody knows is steel (tier 1), the game's own
 * unremarkable default.
 *
 * @param {string} id
 * @returns {number}
 */
export function tierOf(id) {
  const tier = MATERIAL_TIER.indexOf(String(id ?? '').toLowerCase());
  return tier >= 0 ? tier : MATERIAL_TIER.indexOf('steel');
}

/** Which weapon bases are edged — the ones a skeleton is said to shrug off. */
const EDGED = Object.freeze([
  'dagger', 'tanto', 'shortsword', 'wakizashi', 'broadsword', 'saber', 'longsword',
  'katana', 'claymore', 'dai-katana', 'war-axe', 'battle-axe', 'short-bow', 'long-bow',
]);
const EDGED_SET = new Set(EDGED);

/** Whether a weapon base cuts or pierces, rather than bludgeons. */
export function isEdged(weaponId) {
  return EDGED_SET.has(String(weaponId ?? '').toLowerCase());
}

/**
 * Hit points a regenerating creature takes back each second.
 *
 * UESP says the troll, the vampire and the lich regenerate and gives no rate; this is the
 * project's own figure, deliberately small enough that a fight is not unwinnable but large
 * enough that a slow weapon loses to it.
 */
export const REGEN_PER_SECOND = Object.freeze({ troll: 2, vampire: 3, lich: 4 });

/**
 * The bestiary's abilities, keyed by `monsters.js`'s id.
 *
 * The comment on each line is the UESP sentence it comes from. Fields:
 *
 *   `immuneBelow`   a metal tier; mundane blows under it do nothing (UESP: "subject to
 *                   attack only by mithril weapons or better")
 *   `fistsHurt`     bare hands still land (UESP on the ice golem: "although fists can hurt
 *                   them")
 *   `meleeImmune`   no physical weapon lands at all (Jagar Tharn)
 *   `silverDouble`  silver does twice the damage (the vampire)
 *   `edgedHalf`     daggers, swords, axes and bows do half (the skeleton)
 *   `resist`        element → multiplier below 1
 *   `vulnerable`    element → multiplier above 1
 *   `shockHeals`    shock magic mends it instead of hurting it (the iron golem)
 *   `regenerates`   hit points a second
 *   `seesInvisible` invisibility does not hide the player from it
 *   `paralysis`     'melee' or 'ranged': its blow can hold the player still
 *   `disease`       its blow can leave a disease
 *   `caster`        the spell it throws, its element and its caster level
 *
 * **The caster levels are mostly ours.** UESP prints a level for exactly three casters — the
 * ghost (5), the snow wolf (6) and the hell hound (6) — and for the rest it says "spellcasting"
 * without a number. Those (`level 8` … `level 30` below) are this project's stand-ins,
 * RECONSTRUCTED, and today they are inert data: the scene's bolt reads the *element* and the
 * creature's own damage, never the level. They are kept because the source's shape has a
 * level and a future bolt-scaling rule will want the field it already has.
 *
 * @type {Readonly<Record<string, object>>}
 */
export const ABILITIES = Object.freeze({
  rat: { disease: true },
  goblin: {},
  wolf: {},
  // "Snow Wolves are a magical breed … cast Ice Bolt as a level 6 spellcaster."
  snowwolf: { caster: { spell: 'Ice Bolt', element: 'cold', level: 6 } },
  // "Can paralyze."
  lizardman: { paralysis: 'melee' },
  // "Takes half damage from daggers, swords, axes, and bows."
  skeleton: { edgedHalf: true },
  orc: {},
  // "Transmits disease."
  ghoul: { disease: true },
  // "Paralysis" / "using their paralyzing venom".
  spider: { paralysis: 'melee' },
  // "Resistance to spells."
  minotaur: { resist: { magic: 0.5 } },
  // "Casts Spell Drain as a level 5 spellcaster." and "sees invisible creatures".
  ghost: { seesInvisible: true, caster: { spell: 'Spell Drain', element: 'magic', level: 5 } },
  // "Resistance to fire. Casts Fireball as a level 6 spellcaster."
  hellhound: { resist: { fire: 0.5 }, caster: { spell: 'Fireball', element: 'fire', level: 6 } },
  // "Regeneration" — and UESP's troll paragraph says a magical death is the sure one.
  troll: { regenerates: REGEN_PER_SECOND.troll },
  zombie: { disease: true },
  // "Flight, Spellcaster, Sees invisible."
  wraith: { seesInvisible: true, caster: { spell: 'Fireball', element: 'fire', level: 8 } },
  // "They shoot a potent electrical spell."
  homonculus: { caster: { spell: 'Lightning', element: 'shock', level: 9 } },
  // "Resistance to cold, immune to mundane weapons, vulnerability to fire" and
  // "invulnerable to all weapons below elven (although fists can hurt them)".
  icegolem: { immuneBelow: 'elven', fistsHurt: true, resist: { cold: 0.5 }, vulnerable: { fire: 2 } },
  // "Immune to any weapon below dwarven" and a ranged magic attack "cannot be reduced by a
  // potion" — which is why its bolt carries no element this module resists.
  stonegolem: { immuneBelow: 'dwarven', caster: { spell: 'Force Bolt', element: 'magic', level: 12, irresistible: true } },
  // "Immune to all weapons below mithril. Avoid using shock magic as they will use the
  // energy to recover from damage." and "Resistance to spells".
  irongolem: { immuneBelow: 'mithril', shockHeals: true, resist: { shock: 0, magic: 0.5 } },
  // "Resistance to fire damage, immune to mundane weapons, sees invisible" and "mithril
  // weapons or better".
  firedaemon: { immuneBelow: 'mithril', resist: { fire: 0.5 }, seesInvisible: true, caster: { spell: 'Fireball', element: 'fire', level: 15 } },
  // "Ranged paralysis attack, immunity to mundane weapons" (below dwarven).
  medusa: { immuneBelow: 'dwarven', paralysis: 'ranged', caster: { spell: 'Pitfalls', element: 'magic', level: 18 } },
  // "Immunity to mundane weapons, vulnerability to silver weapons, fast healing,
  // spellcasting, sees invisible, transmits disease"; prose: "immune to iron, steel and
  // elven weapons" and "Silver weapons do double damage".
  vampire: {
    immuneBelow: 'dwarven', silverDouble: true, regenerates: REGEN_PER_SECOND.vampire,
    seesInvisible: true, disease: true, caster: { spell: 'Fireball', element: 'fire', level: 20 },
  },
  // "Spellcasting, self-healing, see invisible, immunity to mundane weapons" (below mithril).
  lich: {
    immuneBelow: 'mithril', regenerates: REGEN_PER_SECOND.lich, seesInvisible: true,
    caster: { spell: 'Lightning', element: 'shock', level: 25 },
  },
  // "Sees invisible. Cannot be hit by melee weapons" — and UESP's entry names the spells he
  // throws, **all six of them**: "Wizard's Fire, Ice Bolt, Wyvern's Sting, Lightning, Far
  // Silence, and Spell Drain". The port used to give him Lightning alone; `rotation` is the
  // six, in the source's own order, and the scene walks it cast by cast (`castFor`).
  // `spell`/`element` stay his first-listed bolt for every caller that wants one answer.
  // **No spellcasting level is published for him** — `level: 30` is this project's stand-in.
  jagartharn: {
    meleeImmune: true, seesInvisible: true, resist: { magic: 0.5 },
    caster: {
      spell: 'Lightning', element: 'shock', level: 30,
      rotation: [
        { spell: 'Wizard\'s Fire', element: 'fire' },
        { spell: 'Ice Bolt', element: 'cold' },
        { spell: 'Wyvern\'s Sting', element: 'poison' },
        { spell: 'Lightning', element: 'shock' },
        { spell: 'Far Silence', element: 'magic' },
        { spell: 'Spell Drain', element: 'magic' },
      ],
    },
  },
});

/**
 * The bolt a caster throws on its **nth** cast.
 *
 * Most casters have one spell, so the answer is always `caster.spell`. Jagar Tharn has six
 * (UESP's entry names them), and a Tharn who only ever threw lightning was one sixth of the
 * source's endgame: the rotation is walked in UESP's own order and repeats.
 *
 * @param {object|string} monster
 * @param {number} [castIndex] how many bolts this caster has already thrown
 * @returns {{spell: string, element: string, level: number|null}|null}
 */
export function castFor(monsterOrId, castIndex = 0) {
  const caster = abilitiesOf(monsterOrId).caster;
  if (!caster) return null;
  const rotation = Array.isArray(caster.rotation) ? caster.rotation : null;
  if (!rotation?.length) return { spell: caster.spell, element: caster.element, level: caster.level ?? null };
  const pick = rotation[Math.abs(Math.trunc(Number(castIndex) || 0)) % rotation.length];
  return { spell: pick.spell, element: pick.element, level: caster.level ?? null };
}

/** An ability record, tolerating an id or a rolled monster. */
export function abilitiesOf(monsterOrId) {
  const id = typeof monsterOrId === 'string' ? monsterOrId : monsterOrId?.id;
  return ABILITIES[String(id ?? '').toLowerCase()] ?? {};
}

/** The creatures that throw magic, from the abilities table (the install's own roster). */
export const CASTER_IDS = Object.freeze(Object.keys(ABILITIES).filter((id) => ABILITIES[id].caster));

/** A caster's spell, or null. */
export function spellOf(monsterOrId) {
  return abilitiesOf(monsterOrId).caster?.spell ?? null;
}

/** The element of a creature's own attack: its spell's, or plain magic for a claw. */
export function elementOf(monsterOrId) {
  return abilitiesOf(monsterOrId).caster?.element ?? 'magic';
}

/** Whether a creature's bolt shrugs off resistance (the stone golem's). */
export function isIrresistible(monsterOrId) {
  return Boolean(abilitiesOf(monsterOrId).caster?.irresistible);
}

/** Whether the creature can hold the player still with its blow. */
export function paralyses(monsterOrId) {
  return abilitiesOf(monsterOrId).paralysis ?? null;
}

/** Whether the creature's blow can leave a disease. */
export function transmitsDisease(monsterOrId) {
  return Boolean(abilitiesOf(monsterOrId).disease);
}

/** Hit points a creature takes back each second, or 0. */
export function regenerationOf(monsterOrId) {
  return Number(abilitiesOf(monsterOrId).regenerates) || 0;
}

/** Whether invisibility fails against this creature. */
export function seesInvisible(monsterOrId) {
  return Boolean(abilitiesOf(monsterOrId).seesInvisible);
}

/**
 * Can this weapon hurt this creature at all?
 *
 * UESP's immunity ladder is a *floor*, not a percentage: a steel longsword swung at a fire
 * daemon is not a weak blow, it is no blow. The bare hand is the one exception the source
 * itself makes for the ice golem, so it is the one exception here.
 *
 * @param {object|string} monster
 * @param {{weapon?: string, material?: string}} held
 * @returns {{ok: boolean, reason?: string, tier?: string}}
 */
export function canHurt(monster, held = {}) {
  const abilities = abilitiesOf(monster);
  const weapon = String(held.weapon ?? 'fists').toLowerCase();
  if (abilities.meleeImmune) {
    return { ok: false, reason: `${nameOf(monster)} cannot be touched by a weapon` };
  }
  if (!abilities.immuneBelow) return { ok: true };
  // **Silver is the vampire's own exception.** UESP's prose: the vampire is "immune to iron,
  // steel and elven weapons" and "silver weapons do double damage" — silver is *below* the
  // dwarven floor by the metal ladder, yet it is the one metal the source says bites. So the
  // exception is checked before the ladder, not through it.
  if (abilities.silverDouble && String(held.material ?? '').toLowerCase() === 'silver') return { ok: true };
  if (weapon === 'fists' && abilities.fistsHurt) return { ok: true };
  // A gauntlet is a weapon in `combat.js`'s table; it is still a thing worn on a hand, so
  // it is a fist for this law. (UESP's immunity is to *weapons*, and the gauntlet rows are
  // armour attacks.)
  if ((weapon === 'chain-gauntlets' || weapon === 'plate-gauntlets') && abilities.fistsHurt) return { ok: true };
  const need = tierOf(abilities.immuneBelow);
  const have = tierOf(held.material ?? 'steel');
  if (have < need) {
    const metal = String(held.material ?? 'steel').toLowerCase();
    return {
      ok: false,
      reason: `a ${metal} weapon will not bite ${nameOf(monster)} — ${abilities.immuneBelow} or better is needed`,
      tier: abilities.immuneBelow,
    };
  }
  return { ok: true };
}

/**
 * How much a blow of a given weapon, metal and element is worth against a creature.
 *
 * 0 for a blow that cannot land, 0.5 for a resisted element or a skeleton's edged-weapon
 * half, 2 for silver at a vampire and for fire at an ice golem, 1 otherwise. The caller
 * multiplies; `resolveAttack` and the scene's spell damage both go through here.
 *
 * @param {object|string} monster
 * @param {{weapon?: string, material?: string, element?: string}} blow
 * @returns {number}
 */
export function damageMultiplier(monster, blow = {}) {
  const abilities = abilitiesOf(monster);
  const element = String(blow.element ?? '').toLowerCase();
  if (abilities.shockHeals && element === 'shock') return 0;
  if (abilities.resist?.[element] != null) return Number(abilities.resist[element]);
  if (abilities.vulnerable?.[element] != null) return Number(abilities.vulnerable[element]);
  const physical = !element || element === 'magic' ? true : false;
  if (physical) {
    const hurt = canHurt(monster, blow);
    if (!hurt.ok) return 0;
    if (abilities.silverDouble && String(blow.material ?? '').toLowerCase() === 'silver') return 2;
    if (abilities.edgedHalf && isEdged(blow.weapon)) return 0.5;
  }
  return 1;
}

/** The creature's printed name, for a refusal line. */
function nameOf(monster) {
  if (typeof monster === 'string') return monster;
  return monster?.name ?? 'that creature';
}

/**
 * The catalogue's own report: every bestiary entry, with what it is besides numbers.
 *
 * `tests/unit/bestiary.test.mjs` walks it against UESP's page; the browser's debug seam can
 * print it. A creature absent from the list is a creature with no abilities, which is the
 * honest reading of a goblin.
 *
 * @returns {{id: string, name: string, abilities: object, caster: string|null}[]}
 */
export function bestiaryReport() {
  return Object.keys(ABILITIES).map((id) => ({
    id,
    name: id,
    abilities: ABILITIES[id],
    caster: ABILITIES[id].caster?.spell ?? null,
  }));
}

/** Every edged base, for a UI or a test (pinned against `combat.js`'s `WEAPONS`). */
export const EDGED_WEAPONS = EDGED;
