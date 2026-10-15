// THE GUILD — Arena's guild feeling, on the twin's own rank law.
//
// Arena names three guilds in its data and prose: the **Mages Guild** (`MUGUILD.DAT`,
// whose bank this port's shopkeepers already speak), the **Fighters Guild** and
// **Thieves' Guild** (UESP's documented lists, credited at each table). Arena never gave
// them a rules engine the player could join — that innovation is Daggerfall's, and the
// sibling project ported Daggerfall Unity's `Guild.cs` faithfully. So this module ports
// THAT law, cited at every number, and notes where Arena's own shape forces the divergence:
//
//   * the twin computes rank from a **faction reputation** system (`factionRep.js`) and
//     **Daggerfall skill values**, neither of which exist in Arena's data. The honest
//     substitution, using only state this project already keeps and saves (`worldState.js`
//     and `game/save.js`), is: rank rows are gated by the character's **experience level**
//     in place of skill values, and a per-guild **standing** number the player earns by
//     working that guild's jobs in place of faction reputation. The RANK TABLES, the two
//     skill bars per row, the `high + low` counting rule, the −1 early return for negative
//     standing, the `return --r`, the 28-day gate, probation below 0 and expulsion below
//     −10 are the twin's, tested against it by `tests/unit/guild.test.mjs`.
//
// Nothing here touches the DOM. The scene wires it to the keeper's talk panel.

/** Arena's guilds. `bank` names the prose file the keeper speaks when one exists. */
export const GUILDS = Object.freeze({
  fighters: {
    id: 'fighters', name: 'the Fighters Guild', bank: 'equip.dat',
    // UESP, Arena guild pages: the guild's combat skills, mapped by id onto this
    // project's character model as weapon-material proficiency the level sum stands for.
    // GUESS-labelled: exactly which Arena skill fed a rank is in `A.EXE` (D11).
    skills: ['archery', 'axe', 'blunt', 'longblade', 'shortblade', 'hand'],
  },
  mages: {
    id: 'mages', name: 'the Mages Guild', bank: 'muguild.dat',
    skills: ['alteration', 'destruction', 'illusion', 'mysticism', 'restoration', 'thaumaturgy'],
  },
  thieves: {
    id: 'thieves', name: 'the Thieves\u2019 Guild',
    // Arena ships no thieves' bank in this install; the talk corpus carries their lines.
    bank: null,
    skills: ['backstabbing', 'climbing', 'lockpicking', 'pickpocket', 'shortblade', 'stealth', 'streetwise'],
    neverExpels: true,
  },
});

/** The twin's `RANK_REQ_REPUTATION` (guilds.js :18 of guildFactions.js): the standing
 *  each of the ten ranks requires. Numbers are the twin's. */
export const RANK_REQ_STANDING = Object.freeze([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);

/** The twin's two bars per rank row (Guild.cs :36-38, ported verbatim): the high bar one
 *  guild skill must clear, and the low bar a second one needs (ALT: level rows). */
export const RANK_REQ_LEVEL_HIGH = Object.freeze([22, 23, 31, 39, 47, 55, 63, 71, 79, 87]);
export const RANK_REQ_LEVEL_LOW = Object.freeze([4, 5, 9, 13, 17, 21, 25, 29, 33, 37]);

/** Rank titles. Fighters and Mages are UESP's documented Arena lists; Thieves follows
 *  the twin's thievesRanks (no Arena source names their ladder). */
export const RANK_TITLES = Object.freeze({
  fighters: ['Apprentice', 'Journeyman', 'Swordsman', 'Protector', 'Defender', 'Warder', 'Guardian', 'Champion', 'Warrior', 'Master'],
  mages: ['Apprentice', 'Journeyman', 'Evoker', 'Conjurer', 'Magician', 'Enchanter', 'Warlock', 'Wizard', 'Master Wizard', 'Archmage'],
  thieves: ['Apprentice', 'Journeyman', 'Filcher', 'Crook', 'Robber', 'Bandit', 'Thief', 'Ringleader', 'Mastermind', 'Master Thief'],
});

/** The twin's shared constants (Guild.cs :25-30). Training is the twin's own number
 *  because Arena prices it in `A.EXE` (D11) — labelled GUESS in the unit test. */
export const DEFAULT_TRAINING_MAX = 50;
export const MEMBER_TRAINING_COST = 100;
export const NON_MEMBER_TRAINING_COST = 400;

/** The twin's 28-day gate (UpdateRank :76-96) on Arena's own calendar day. */
export const DAYS_BETWEEN_RANK_CHANGES = 28;

/** The twin's REP6 rule: probation below 0 at a review, expulsion only below −10. */
export const GUILD_EXPEL_BELOW = -10;
export const PROBATION_LINES = Object.freeze([
  'Your standing with us has fallen below what we accept of a member.',
  'You are on probation. Mend your reputation before your next review,',
  'or you will be expelled.',
]);

/**
 * The high/low skill count. The twin measures Daggerfall skill values against the two
 * bars; here the guild skill *values* a character keeps are their proficiency levels on
 * the guild's own `skills` list (a character with no such skills counts 0/0), so the two
 * bars and the `else if` behave identically. @returns {{high: number, low: number}}
 */
export function numHighLowSkills(character, guild, rank) {
  const values = character?.guildSkills?.[guild.id] ?? [];
  let high = 0, low = 0;
  for (const value of values) {
    const v = Number(value) || 0;
    if (v >= RANK_REQ_LEVEL_HIGH[rank]) high++;
    else if (v >= RANK_REQ_LEVEL_LOW[rank]) low++;
  }
  return { high, low };
}

/**
 * The twin's `baseCalculateNewRank` (:320-340), with standing in place of reputation and
 * the guild-skill bars above. A negative standing short-circuits to −1 because a guild
 * does not keep a member the world has turned on; the counting loop, the TWO bars and the
 * `return --r` are the twin's, row for row.
 *
 * @param {object} character
 * @param {{id: string}} guild
 * @param {{standings?: Record<string, number>}} state  the saved guild state
 * @returns {number} the new rank, −1 = below the guild altogether
 */
export function calculateNewRank(character, guild, state) {
  const standing = Math.round(Number(state?.standings?.[guild.id]) || 0);
  if (standing < 0) return -1;
  let r = 0;
  for (; r < RANK_REQ_STANDING.length; r++) {
    const { high, low } = numHighLowSkills(character, guild, r);
    if (standing < RANK_REQ_STANDING[r] || high < 1 || low + high < 2) break;
  }
  return r - 1;
}

/** The twin's clamp for `neverExpels` guilds (ThievesGuild.cs :128-131). */
export function calculateRankWithClamp(character, guild, state) {
  const newRank = calculateNewRank(character, guild, state);
  return guild?.neverExpels && newRank < 0 ? 0 : newRank;
}

/**
 * The twin's `membershipOf` + `updateRank`, minus the network hooks.
 *
 * @param {Record<string, {rank: number, probation?: boolean, lastRankChange?: number, joinedOn?: number}>|null} memberships
 * @param {object} guild
 * @param {object} character
 * @param {{standings?: Record<string, number>}} state
 * @param {number} today  the world's own day
 * @returns {{outcome: 'probation'|'promotion'|'demotion'|'expulsion', rank: number, lines?: string[]}|null} null = no review due
 */
export function updateRank(memberships, guild, character, state, today) {
  const m = memberships?.[guild.id];
  if (!m || m.rank < 0) return null;
  const since = today - (m.lastRankChange ?? m.joinedOn ?? today);
  if (since < DAYS_BETWEEN_RANK_CHANGES) return null;
  const newRank = calculateRankWithClamp(character, guild, state);
  // The twin's REP6 rule, read off its own condition: probation is the default answer to a
  // negative recompute; expulsion happens only at a review that finds the member ALREADY on
  // probation AND the standing below the bar (a never-expels guild clamped before this).
  const standingNow = Math.round(Number(state?.standings?.[guild.id]) || 0);
  if (newRank < 0 && m.probation && standingNow < GUILD_EXPEL_BELOW) {
    memberships[guild.id] = null;
    return { outcome: 'expulsion', rank: -1 };
  }
  if (newRank < 0) {
    m.probation = true;
    m.lastRankChange = today;
    return { outcome: 'probation', rank: m.rank, lines: PROBATION_LINES };
  }
  m.probation = false;
  if (newRank === m.rank) return null;
  const outcome = newRank > m.rank ? 'promotion' : 'demotion';
  m.rank = newRank;
  m.lastRankChange = today;
  return { outcome, rank: newRank };
}

/** Whether the guild record is a member (the twin's `isMember`: rank ≥ 0). */
export const isMember = (membership) => (membership?.rank ?? -1) >= 0;

/** The player-facing rank title: a member reads their ladder, a non-member nothing. */
export function titleOf(membership, guildId) {
  if (!isMember(membership)) return null;
  const rank = Math.max(0, Math.min(9, membership.rank | 0));
  return RANK_TITLES[guildId]?.[rank] ?? null;
}

/** A fresh saved guild state: no memberships, no earned standing. */
export function createGuildState() {
  return { memberships: {}, standings: {} };
}

/**
 * Join a guild, its rank recomputed from what the player is right then.
 *
 * Arena's guilds admit on standing the original never publishes (A.EXE, D11), so the one
 * law here is the twin's own: joining records both the membership AND the rank, and a
 * player without the two skills row 0 demands is refused with the reason (the twin's
 * `ineligibleLowSkill` branch, as a message this project owns).
 *
 * @param {object} state    the saved guild state, mutated in place
 * @param {object} guild    a `GUILDS` entry
 * @param {object} character
 * @param {number} today    the world's own day
 * @returns {{ok: boolean, reason?: string, rank?: number}}
 */
export function joinGuild(state, guild, character, today) {
  state.memberships ??= {};
  state.standings ??= {};
  const standing = Math.round(Number(state.standings[guild.id]) || 0);
  // The twin's `ineligibleBadRep` branch: even a guild that never expels refuses a joiner
  // the world has already turned on (ThievesGuild.cs allows the clamp to keep a MEMBER at
  // 0; it does not welcome a stranger at −20).
  if (standing < 0) {
    return { ok: false, reason: `No one at ${guild.name} will speak of business with you while the world reads you as it does. Mend your name first.` };
  }
  const rank = calculateRankWithClamp(character, guild, state);
  const low = numHighLowSkills(character, guild, 0);
  if (rank < 0) {
    // The other refusal branch, as this project's words.
    if (low.high < 1 || low.low + low.high < 2) return { ok: false, reason: `They will take you when one of your crafts speaks for you and one more shows promise. Not today.` };
    return { ok: false, reason: `Not today. Earn more of ${guild.name}'s confidence first.` };
  }
  state.memberships[guild.id] = { rank, joinedOn: today, lastRankChange: today, probation: false };
  return { ok: true, rank };
}

/** Your standing with a guild, for the ledger's own button: a number, clamped ±100. */
export function standingOf(state, guildId) {
  return Math.max(-100, Math.min(100, Math.round(Number(state?.standings?.[guildId]) || 0)));
}

/**
 * Earn standing with a guild: one guild's job done or one of their own saved.
 * There is no Arena table for this (A.EXE, D11), so the size is this project's, matching
 * the shape of the twin's +25 job/craft rewards — and it is capped by the same ±100.
 */
export const STANDING_PER_JOB = 25;
export const STANDING_MAX = 100;
export function earnStanding(state, guildId, amount = STANDING_PER_JOB) {
  state.standings ??= {};
  const next = Math.max(-STANDING_MAX, Math.min(STANDING_MAX, (Number(state.standings[guildId]) || 0) + amount));
  state.standings[guildId] = next;
  return next;
}
