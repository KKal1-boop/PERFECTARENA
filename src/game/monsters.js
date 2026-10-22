// ARENA'S MONSTERS.
//
// Two independent sources, joined here, which is why this table is worth trusting more
// than most in the project:
//
//   **The sprites are from the player's own data.** Every monster below has a six-file
//     animation set in `GLOBAL.BSA` — `RAT1.CFA`…`RAT6.CFA`, `WOLF01.CFA`…`WOLF06.CFA`,
//     and so on — and the `sprite` field is that file's own base name, checked against
//     the archive's listing rather than guessed from the English name. Two are spelled as
//     only Arena spells them: the Fire Daemon is `DEAMON.CFA`, and **the Minotaur is
//     `PAT1.CFA`…`PAT6.CFA`**.
//
//     The Minotaur's art was missed for as long as this table has existed, on the
//     reasonable-looking reading that a search of `GLOBAL.BSA` for `MINO*.CFA` finds
//     nothing (it does not — there is only a `MINOTAUR.VOC`), and the cost was two
//     defects at once: a creature with statistics and no `sprite` is dropped from every
//     roster that filters on art, and the archive's own `PAT` sheets were being handed to
//     the town crowd as a person's walk (`game/peopleKinds.js`) — which is what
//     "*some npcs have enemy sprites like theres a minotaur guy somewhere*" was.
//
//     **The executable's own tables say `pat` is the Minotaur**, and they say it three
//     ways: its creature-name run (twenty-three names) and its creature-sheet run
//     (twenty-four sheets) pair index by index, twenty-one by spelling, and the one pair
//     with nothing behind it is **`Minotaur` / `pat@.cfa`**; the `.INF` roster's own
//     twenty-three monster slots (`32`…`54`, `dungeonItems.js`) come out in exactly the
//     executable's order, so the Minotaur is slot `39` in both readings; and `PAT`'s six
//     sheets carry `12, 8, 8, 8, 8, 3` frames — the shape twenty-one of the twenty-three
//     creature families carry, and one no person's sheets do. `game/monsterArt.js` is the
//     reading; `tests/unit/monsterart.test.mjs` holds it against the install.
//
//   **The numbers are from UESP**, whose bestiary gives each monster a hit-point range,
//     a damage range, and an experience rule: *"The Experience points (Exp) awarded for
//     defeating a monster are derived by multiplying a monster's 'Hit Points' by its
//     'EExp/HP' and then adding its 'EExperience Points'."* `xpRate` is that EExp/HP and
//     `xpBase` is that base, so `xpFor(monster, hitPoints)` is UESP's own arithmetic.
//
// What UESP does **not** give, and this project therefore does not pretend to know: an
// attack interval (no source states how often a monster swings), or a monster armour
// class distinct from its level. `game/combat.js` documents what it does about both.

/** The monster list: UESP's stats, the archive's sprite names. */
export const MONSTERS = Object.freeze([
  { id: 'rat', name: 'Rat', sprite: 'RAT', hp: [1, 6], damage: [1, 4], xpRate: 5, xpBase: 35, level: 1 },
  { id: 'goblin', name: 'Goblin', sprite: 'GOBLIN', hp: [1, 8], damage: [1, 5], xpRate: 5, xpBase: 60, level: 1 },
  { id: 'wolf', name: 'Wolf', sprite: 'WOLF0', hp: [10, 25], damage: [1, 10], xpRate: 10, xpBase: 100, level: 3 },
  { id: 'snowwolf', name: 'Snow Wolf', sprite: 'SWOLF0', hp: [15, 30], damage: [1, 12], xpRate: 10, xpBase: 150, level: 4 },
  { id: 'lizardman', name: 'Lizard Man', sprite: 'LIZARD', hp: [10, 20], damage: [1, 8], xpRate: 10, xpBase: 75, level: 3 },
  { id: 'skeleton', name: 'Skeleton', sprite: 'SKELE', hp: [25, 45], damage: [2, 16], xpRate: 15, xpBase: 250, level: 5 },
  { id: 'orc', name: 'Orc', sprite: 'ORC', hp: [15, 40], damage: [2, 12], xpRate: 15, xpBase: 200, level: 4 },
  { id: 'ghoul', name: 'Ghoul', sprite: 'GHOUL', hp: [45, 75], damage: [5, 20], xpRate: 20, xpBase: 1000, level: 7 },
  { id: 'spider', name: 'Spider', sprite: 'SPIDER', hp: [40, 70], damage: [4, 20], xpRate: 20, xpBase: 500, level: 6 },
  { id: 'minotaur', name: 'Minotaur', sprite: 'PAT', hp: [30, 60], damage: [3, 18], xpRate: 20, xpBase: 300, level: 6 },
  { id: 'ghost', name: 'Ghost', sprite: 'GHOST', hp: [60, 80], damage: [5, 25], xpRate: 25, xpBase: 1500, level: 9 },
  { id: 'hellhound', name: 'Hell Hound', sprite: 'HOUND', hp: [50, 75], damage: [5, 25], xpRate: 25, xpBase: 1250, level: 8 },
  { id: 'troll', name: 'Troll', sprite: 'TROLL', hp: [75, 100], damage: [10, 30], xpRate: 35, xpBase: 2500, level: 10 },
  { id: 'zombie', name: 'Zombie', sprite: 'ZOMBIE', hp: [70, 90], damage: [5, 30], xpRate: 35, xpBase: 2000, level: 10 },
  { id: 'wraith', name: 'Wraith', sprite: 'WRAITH', hp: [80, 110], damage: [10, 35], xpRate: 45, xpBase: 5000, level: 12 },
  { id: 'homonculus', name: 'Homonculus', sprite: 'HOM', hp: [90, 120], damage: [10, 35], xpRate: 45, xpBase: 7500, level: 13 },
  { id: 'icegolem', name: 'Ice Golem', sprite: 'ICE', hp: [150, 200], damage: [10, 35], xpRate: 55, xpBase: 10000, level: 15 },
  { id: 'stonegolem', name: 'Stone Golem', sprite: 'STONE', hp: [175, 250], damage: [10, 35], xpRate: 55, xpBase: 12500, level: 16 },
  { id: 'irongolem', name: 'Iron Golem', sprite: 'IRON', hp: [200, 300], damage: [10, 40], xpRate: 65, xpBase: 15000, level: 18 },
  { id: 'firedaemon', name: 'Fire Daemon', sprite: 'DEAMON', hp: [225, 350], damage: [10, 40], xpRate: 65, xpBase: 20000, level: 20 },
  { id: 'medusa', name: 'Medusa', sprite: 'MEDUSA', hp: [250, 400], damage: [10, 50], xpRate: 75, xpBase: 25000, level: 22 },
  { id: 'vampire', name: 'Vampire', sprite: 'VAMPIRE', hp: [500, 500], damage: [10, 50], xpRate: 75, xpBase: 30000, level: 25 },
  { id: 'lich', name: 'Lich', sprite: 'LICH', hp: [750, 750], damage: [10, 75], xpRate: 100, xpBase: 50000, level: 30 },
  // UESP prints **"Spell Damage"** where the melee column would be: Tharn fights with his
  // own six spells, and his bolt takes its wound from this range. The melee immunity is
  // `game/bestiary.js`'s (`meleeImmune`), so the number is never a sword's.
  { id: 'jagartharn', name: 'Jagar Tharn', sprite: 'THARN0', hp: [500, 500], damage: [10, 40], xpRate: 0, xpBase: 75000, level: 40 },
]);

/** A monster by id or by the name UESP prints. @param {string} key */
export function monsterById(key) {
  const wanted = String(key).toLowerCase().replace(/[^a-z]/g, '');
  return MONSTERS.find((m) => m.id === wanted || m.name.toLowerCase().replace(/[^a-z]/g, '') === wanted) ?? null;
}

/**
 * UESP's experience rule, applied.
 * @param {object} monster
 * @param {number} hitPoints  the monster's rolled hit points
 * @returns {number}
 */
export function xpFor(monster, hitPoints) {
  return Math.max(0, Math.round(hitPoints * monster.xpRate + monster.xpBase));
}

/**
 * The six view files a creature ships, as the archive spells them.
 * @param {object} monster
 * @returns {string[]} e.g. `['RAT1.CFA', … 'RAT6.CFA']`, or `[]` when there is no art
 */
export function spriteFiles(monster) {
  if (!monster?.sprite) return [];
  return [1, 2, 3, 4, 5, 6].map((view) => `${monster.sprite}${view}.CFA`);
}

/**
 * A monster's sprite file for one view, or null when this install has no art for it.
 * @param {object} monster @param {number} [view]
 */
export function spriteFile(monster, view = 1) {
  if (!monster?.sprite) return null;
  return `${monster.sprite}${Math.max(1, Math.min(6, Math.trunc(view)))}.CFA`;
}

/**
 * Which monsters this install can actually draw, and which it cannot.
 *
 * `spriteless` is empty as of block B24's second pass, and it is worth leaving in place: it was
 * the Minotaur alone until the executable's own tables said which sheets are its art.
 *
 * @returns {{drawn: string[], spriteless: string[]}}
 */
export function monsterReport() {
  return {
    drawn: MONSTERS.filter((m) => m.sprite).map((m) => m.name),
    spriteless: MONSTERS.filter((m) => !m.sprite).map((m) => m.name),
  };
}

/**
 * A roster for a place, by depth: what a level's danger rating can put in front of you.
 *
 * There is no published "which monster appears where" table for Arena — the game keeps
 * that in `A.EXE`, which this data set does not ship (D11) — so the roster is this
 * project's own rule and is labelled as such: a level's danger rating `d` admits every
 * monster whose UESP level is within `d ± spread`.
 *
 * @param {number} danger   1…40, the level's difficulty
 * @param {{spread?: number}} [opts]
 * @returns {object[]}
 */
export function rosterFor(danger, opts = {}) {
  const spread = opts.spread ?? 4;
  const usable = MONSTERS.filter((m) => m.sprite && m.id !== 'jagartharn');
  const band = usable.filter((m) => Math.abs(m.level - danger) <= spread);
  return (band.length ? band : usable).sort((a, b) => a.level - b.level);
}
