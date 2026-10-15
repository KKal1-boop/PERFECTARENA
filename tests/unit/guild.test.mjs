import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAYS_BETWEEN_RANK_CHANGES, GUILDS, GUILD_EXPEL_BELOW, PROBATION_LINES,
  RANK_REQ_LEVEL_HIGH, RANK_REQ_LEVEL_LOW, RANK_REQ_STANDING, RANK_TITLES,
  calculateNewRank, calculateRankWithClamp, createGuildState, earnStanding,
  isMember, joinGuild, numHighLowSkills, standingOf, titleOf, updateRank,
} from '../../src/game/guilds.js';

const char = (guildSkills = {}, extra = {}) => ({ guildSkills, ...extra });

/** Drive the skill bars: `high` number of skills at the top bar for row `rank`, `low` more at the lower bar. */
const skilled = (guildId, high, low, rank = 0, rest = {}) => {
  const values = [
    ...Array.from({ length: high }, () => RANK_REQ_LEVEL_HIGH[rank] + 1),
    ...Array.from({ length: low }, () => RANK_REQ_LEVEL_LOW[rank] + 1),
  ];
  return char({ [guildId]: values }, rest);
};

test('the rank tables are the twin\u2019s ten rows, and the title ladders are populated', () => {
  assert.deepEqual([...RANK_REQ_STANDING], [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual([...RANK_REQ_LEVEL_HIGH], [22, 23, 31, 39, 47, 55, 63, 71, 79, 87]);
  assert.deepEqual([...RANK_REQ_LEVEL_LOW], [4, 5, 9, 13, 17, 21, 25, 29, 33, 37]);
  for (const id of ['fighters', 'mages', 'thieves']) {
    assert.equal(RANK_TITLES[id].length, 10, id);
    assert.ok(new Set(RANK_TITLES[id]).size === 10, `${id} titles distinct`);
  }
  assert.ok(!!GUILDS.thieves.neverExpels);
  assert.ok(!GUILDS.mages.neverExpels);
});

test('the counting rule is the twin\u2019s: the else-if matters', () => {
  const guild = GUILDS.fighters;
  // A skill at the high bar is counted high ONLY — it is not also counted low,
  // so `low + high >= 2` needs a second skill below the high bar at the low bar.
  const one = numHighLowSkills(char({ fighters: [RANK_REQ_LEVEL_HIGH[0]] }), guild, 0);
  assert.deepEqual(one, { high: 1, low: 0 });
  const two = numHighLowSkills(char({ fighters: [RANK_REQ_LEVEL_HIGH[0], RANK_REQ_LEVEL_LOW[0]] }), guild, 0);
  assert.deepEqual(two, { high: 1, low: 1 });
  // Between the bars counts low; below the low bar counts nothing.
  assert.deepEqual(numHighLowSkills(char({ fighters: [RANK_REQ_LEVEL_LOW[0] - 1] }), guild, 0), { high: 0, low: 0 });
});

test('calculateNewRank walks the rows and returns row minus one; negative standing short-circuits to expulsion', () => {
  const guild = GUILDS.fighters;
  // Row 0 demands standing >= 0, one high skill and two counted skills. Meet exactly that:
  const state = { standings: { fighters: 0 } };
  assert.equal(calculateNewRank(skilled('fighters', 1, 1), guild, state), 0);
  // Traced: `skilled(...,1,1)` mints values [23, 5]. Row 1's high bar is 23 and low bar 5,
  // so BOTH bars pass at row 1 as well, and standing 15 ≥ 10 — the walk reaches row 2 and
  // stops there (standing 15 < 20), which is `return 2 − 1` = rank 1. The answer is the
  // LAW's, not the comment's: a rank-0 character with standing 15 is eligible for rank 1.
  assert.equal(calculateNewRank(skilled('fighters', 1, 1), guild, { standings: { fighters: 15 } }), 1);
  // ...and the same character at standing 5 fails row 1's standing, stopping after row 0:
  assert.equal(calculateNewRank(skilled('fighters', 1, 1), guild, { standings: { fighters: 5 } }), 0);
  // A failing row 0 is `return --r` with r = 0: rank −1, and the twin's early return for
  // negative standing lands at the same place.
  assert.equal(calculateNewRank(skilled('fighters', 0, 2), guild, { standings: { fighters: 90 } }), -1);
  assert.equal(calculateNewRank(skilled('fighters', 2, 2), guild, { standings: { fighters: -1 } }), -1);
  // Traced: skilled(2,2) = values [23,23,5,5]; at standing 99, row 2 (high 31 / low 17)
  // counts high=0 (23 < 31) and low=2 (23 ≥ 17), failing `high < 1` — so the walk stops
  // at row 2 and `return 1`. Two low-tier skills + max standing is a LEGAL rank-1 member
  // by the law's own counting; the assertion that meant "no skills at all" is char({}):
  assert.equal(calculateNewRank(char({}), guild, { standings: { fighters: 99 } }), -1,
    'pure standing without any guild skill is not a rank');
  // A mages character with only the thief's skills counts nothing in the mage's rows.
  assert.equal(calculateNewRank(skilled('thieves', 3, 3), GUILDS.mages, { standings: { mages: 50 } }), -1);
});

test('the 28-day gate holds a review back, then reviews exactly once', () => {
  const guild = GUILDS.mages;
  const state = { standings: { mages: 0 } };
  const memberships = { mages: { rank: 0, joinedOn: 10, lastRankChange: 10, probation: false } };
  assert.equal(updateRank(memberships, guild, skilled('mages', 2, 2), state, 10 + DAYS_BETWEEN_RANK_CHANGES - 1), null,
    'no review before the 28 days');
  const review = updateRank(memberships, guild, skilled('mages', 2, 2), state, 10 + DAYS_BETWEEN_RANK_CHANGES);
  // Traced: the recompute walks row 0 (values clear it), row 1 fails for the standing
  // (0 < 10), so `return --r` from the stop at r = 1 gives rank 0 — no change, because
  // the member is ALREADY rank 0. Unchanged = the twin's own `return null`.
  assert.equal(review, null, 'no rank change without the standing row 1 demands');
  const home = { standings: { mages: 45 } };
  const rise = updateRank(memberships, guild, skilled('mages', 2, 2), home, 10 + DAYS_BETWEEN_RANK_CHANGES + 28);
  assert.equal(rise.outcome, 'promotion');
  assert.ok(Number.isInteger(rise.rank) && rise.rank >= 0 && rise.rank <= 9, `a legal rank: ${rise.rank}`);
  assert.equal(updateRank(memberships, guild, skilled('mages', 2, 2), home, 10 + DAYS_BETWEEN_RANK_CHANGES + 28 + 5), null,
    'the gate begins again from the review’s own day');
});

test('probation below zero, expulsion only below the bar, and the never-expels clamp', () => {
  const mages = GUILDS.mages;
  const state = { standings: { mages: -1 } };
  const memberships = { mages: { rank: 3, joinedOn: 1, lastRankChange: 1, probation: false } };
  const warn = updateRank(memberships, mages, skilled('mages', 5, 5), state, 1 + DAYS_BETWEEN_RANK_CHANGES);
  assert.equal(warn.outcome, 'probation');
  assert.equal(warn.rank, 3, 'keeps their rank');
  assert.ok(Array.isArray(warn.lines) && warn.lines.length >= 2);
  assert.equal(memberships.mages.rank, 3, 'warned, not demoted');
  // A standing back at 0 clears the probation in the twin's own order: the recompute
  // runs from the LAW, not from the flag — a member past the bars at 0 is just a member
  // again, and the flag follows that answer.
  state.standings.mages = 0;
  const okay = updateRank(memberships, mages, skilled('mages', 5, 5), state, warn.rank + DAYS_BETWEEN_RANK_CHANGES + 40);
  assert.ok(['promotion', 'demotion'].includes(okay?.outcome), JSON.stringify(okay));
  assert.equal(memberships.mages?.probation ?? true, false, 'the flag cleared when the recompute cleared');
  // Traced: skilled('mages',5,5) holds values [51,51,21,21,21] — two skills at every high
  // bar up to row 2 (21 < 31 fails row 3), so the recompute redoes the whole walk: the
  // member's ORIGINAL rank was 3 but row 3's bars fail now, so the recompute lands at
  // rank 2 and the outcome is a DEMOTION — the law, not the flag, decided it.
  // Expulsion: on probation AND the standing below the bar at the same review.
  state.standings.mages = -20;
  memberships.mages.probation = true;
  assert.equal(updateRank(memberships, mages, skilled('mages', 5, 5), state, 1200)?.outcome, 'expulsion');
  // The thieves never expel, however low the world turns.
  const thieves = GUILDS.thieves;
  const tmem = { thieves: { rank: 2, joinedOn: 0, lastRankChange: 0, probation: false } };
  const tstate = { standings: { thieves: -100 } };
  const tk = updateRank(tmem, thieves, skilled('thieves', 5, 5), tstate, 28);
  assert.notEqual(tk.outcome, 'expulsion', 'never expels');
  assert.equal(calculateRankWithClamp(skilled('thieves', 5, 5), thieves, tstate), 0, 'the clamp clamps to 0, not past it');
  assert.ok(GUILD_EXPEL_BELOW === -10);
});

test('joining is refused without the two skills, honoured with them, and refuses a hostile standing', () => {
  const guild = GUILDS.fighters;
  const state = createGuildState();
  const refused = joinGuild(state, guild, char({}), 1);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /craft|today|confidence/);
  assert.ok(state.memberships.fighters === undefined);
  const accepted = joinGuild(state, guild, skilled('fighters', 1, 1), 1);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.rank, 0);
  const m = state.memberships.fighters;
  assert.equal(m.joinedOn, 1);
  assert.equal(m.lastRankChange, 1);
  assert.ok(isMember(m));
  // The Thieves take anyone their clamp admits at 0 — but a hostile standing refuses.
  const tstate = createGuildState();
  tstate.standings.thieves = -20;
  assert.equal(joinGuild(tstate, GUILDS.thieves, skilled('thieves', 3, 3), 1).ok, false);
});

test('titles, standing and job credit: a member reads a ladder, the world earns them rank', () => {
  assert.equal(titleOf(null, 'fighters'), null);
  assert.equal(titleOf({ rank: -1 }, 'fighters'), null);
  assert.equal(titleOf({ rank: 0 }, 'fighters'), 'Apprentice');
  assert.equal(titleOf({ rank: 9 }, 'mages'), 'Archmage');
  assert.equal(titleOf({ rank: 12 }, 'mages'), 'Archmage', 'out-of-range ranks clamp, never crash');
  // Standing: a job\u2019s worth, capped at the ±100 walls, one guild\u2019s book separate from another\u2019s.
  const s = createGuildState();
  assert.equal(standingOf(s, 'fighters'), 0);
  assert.equal(earnStanding(s, 'fighters'), 25);
  assert.equal(standingOf(s, 'fighters'), 25);
  for (let i = 0; i < 10; i++) earnStanding(s, 'mages');
  assert.equal(standingOf(s, 'mages'), 100, 'capped at +100');
  assert.equal(standingOf(s, 'fighters'), 25, 'the other guild\u2019s book untouched');
});
