// THE MAIN QUEST'S STATE.
//
// Arena's quest is a fixed chain, and its save file records it as a handful of
// flags — a step counter and three booleans (`NextStep`, `DungeonLocationKnown`,
// `HasStaffPiece`, `HasKeyItem`). This is that, with the step counter naming a
// stage of `questData.js`'s derived chain instead of an offset into `A.EXE`.
//
// The machine is deliberately transparent: every transition is one named event,
// so the browser suite can drive the whole quest through `window.__debug` and
// assert the log grew, the flags flipped, and the finale became reachable. That is
// the "scripted run proving the main quest can be completed" the brief asks for,
// and it is only possible because the state is this small.
//
// The state is plain JSON — no functions, no class instances — so save/load is a
// `JSON.stringify` and back, and the round-trip test is meaningful.

/**
 * @typedef {object} QuestState
 * @property {number} step          index into the chain's stages
 * @property {number} pieces        how many Staff pieces are held, 0…8
 * @property {boolean} mapKnown     whether the current piece's dungeon is known
 * @property {boolean} mithrilKey   the key that opens the Jewel of Fire's cell
 * @property {boolean} hasKeyItem   the Jewel of Fire, in the finale
 * @property {boolean} ended        the confrontation is over
 * @property {string[]} log         the journal, newest last
 * @property {string[]} visited     titles of the stages entered
 */

/**
 * A fresh quest, at the escape from the Imperial Dungeons.
 * @returns {QuestState}
 */
export function createQuestState() {
  return {
    step: 0,
    pieces: 0,
    mapKnown: false,
    mithrilKey: false,
    hasKeyItem: false,
    ended: false,
    log: [],
    visited: [],
  };
}

/** The events the machine understands. */
export const QUEST_EVENTS = Object.freeze([
  'enter', 'escaped', 'foundClue', 'foundPiece', 'staffAssembled', 'mithrilKey', 'jewelOfFire', 'won',
]);

/**
 * Apply one event.
 *
 * `enter` records that the player reached the current stage's location; `escaped`
 * leaves the opening dungeon; `foundClue` is the parchment/map that reveals a
 * piece's dungeon; `foundPiece` is the piece itself; `staffAssembled` fires when
 * the eighth piece completes the Staff; `mithrilKey` and `jewelOfFire` are the
 * finale's two key items, in that order; `won` ends it. Anything out of order is
 * refused rather than silently applied, so a scripted run cannot "complete" the
 * quest by firing events in the wrong sequence.
 *
 * The finale's order is not invented: UESP's walkthrough of *The Imperial Palace*
 * has the Jewel of Fire sitting in a **magically locked cell** on the fourth and
 * final level, opened either by a mithril key found in the island's northwestern
 * room or by the Skeleton's Key. Arena's own save file carries one `HasKeyItem`
 * flag; this machine gives the key and the Jewel one each, because the cell door
 * is the thing the player has to solve and a state that cannot represent "the key
 * but not yet the Jewel" could not say so.
 *
 * @param {QuestState} state
 * @param {string} event
 * @param {{chain?: {stages: object[]}}} [ctx]
 * @returns {{ok: boolean, reason?: string, state: QuestState}}
 */
export function applyQuestEvent(state, event, ctx = {}) {
  const stages = ctx.chain?.stages ?? [];
  const stage = stages[state.step] ?? null;
  const next = { ...state, log: [...state.log], visited: [...state.visited] };

  switch (event) {
    case 'enter': {
      if (!stage) return refuse(state, 'the quest has no stage to enter');
      if (!next.visited.includes(stage.title)) next.visited.push(stage.title);
      next.log.push(`Arrived: ${stage.title}${stage.province ? ` (${stage.province})` : ''}.`);
      break;
    }
    case 'escaped': {
      if (state.step !== 0) return refuse(state, 'you have already escaped the Imperial Dungeons');
      next.step = 1;
      next.mapKnown = false;
      next.log.push('Escaped the Imperial Dungeons. Ria Silmane speaks of the Staff of Chaos.');
      break;
    }
    case 'foundClue': {
      if (!stage) return refuse(state, 'the quest has no stage');
      if (stage.kind === 'escape') return refuse(state, 'there is nothing to find here but the way out');
      if (state.mapKnown) return refuse(state, 'that location is already known');
      next.mapKnown = true;
      next.log.push(`Found a map: ${stage.clue ? stage.clue.title : 'the way onward'}.`);
      break;
    }
    case 'foundPiece': {
      if (!stage || stage.kind !== 'piece') return refuse(state, 'no Staff piece is within reach here');
      if (!state.mapKnown) return refuse(state, 'you do not know where this piece is yet');
      if (next.pieces >= stage.piece) return refuse(state, `piece ${stage.piece} is already in your pack`);
      next.pieces = stage.piece;
      next.mapKnown = false;
      next.step = Math.min(stages.length - 1, state.step + 1);
      next.log.push(`Recovered piece ${stage.piece} of the Staff of Chaos from ${stage.title}.`);
      break;
    }
    case 'staffAssembled': {
      if (state.pieces < 8) return refuse(state, `only ${state.pieces} of 8 pieces are held`);
      next.log.push('The Staff of Chaos is whole. Jagar Tharn cannot hide behind it.');
      break;
    }
    case 'mithrilKey': {
      if (stage?.kind !== 'finale') return refuse(state, 'there is no such key outside the Imperial Palace');
      if (state.pieces < 8) return refuse(state, 'Jagar Tharn holds the palace until the Staff is whole');
      if (state.mithrilKey) return refuse(state, 'you already carry the mithril key');
      next.mithrilKey = true;
      next.log.push('Found the mithril key. Jagar Tharn has locked the Jewel of Fire away.');
      break;
    }
    case 'jewelOfFire': {
      if (state.pieces < 8) return refuse(state, 'the Jewel is useless without the whole Staff');
      if (!state.mithrilKey) return refuse(state, 'the cell is magically locked — the mithril key opens it');
      if (state.hasKeyItem) return refuse(state, 'the Jewel of Fire is already held');
      next.hasKeyItem = true;
      next.log.push('The Jewel of Fire is in hand. The Emperor\'s prison can be opened.');
      break;
    }
    case 'won': {
      if (state.pieces < 8) return refuse(state, 'the Staff is not assembled');
      if (!state.hasKeyItem) return refuse(state, 'the Jewel of Fire is needed to free the Emperor');
      if (state.ended) return refuse(state, 'the quest is already over');
      next.ended = true;
      next.step = Math.max(0, stages.length - 1);
      next.log.push('Jagar Tharn is undone. The Emperor is restored, and the Arena knows peace.');
      break;
    }
    default:
      return refuse(state, `unknown quest event "${event}"`);
  }

  return { ok: true, state: next };
}

/** @returns {{ok: false, reason: string, state: QuestState}} */
function refuse(state, reason) {
  return { ok: false, reason, state };
}

/**
 * The current objective in one line, for the quest log's header and the HUD.
 * @param {QuestState} state
 * @param {{stages: object[]}} chain
 */
export function currentObjective(state, chain) {
  if (state.ended) return 'The Arena is at peace.';
  const stage = chain.stages[state.step];
  if (!stage) return 'The quest is complete.';
  if (state.step === 0) return `Escape ${stage.title}.`;
  if (stage.kind === 'finale') {
    if (state.ended) return 'The Arena is at peace.';
    if (!state.mithrilKey) return `Descend to the bottom of ${stage.title} and find the mithril key.`;
    if (!state.hasKeyItem) return 'Carry the mithril key to the Jewel of Fire, and take it.';
    return 'Touch the Staff of Chaos to the Jewel of Fire, and free the Emperor.';
  }
  if (!state.mapKnown) return `Learn where piece ${stage.piece} lies.`;
  return `Recover piece ${stage.piece} of the Staff from ${stage.title}.`;
}

/**
 * Everything the quest log window shows.
 * @param {QuestState} state
 * @param {{stages: object[]}} chain
 */
export function questLog(state, chain) {
  return {
    objective: currentObjective(state, chain),
    stage: chain.stages[state.step]?.title ?? null,
    pieces: state.pieces,
    mapKnown: state.mapKnown,
    hasJewel: state.hasKeyItem,
    hasMithrilKey: state.mithrilKey,
    ended: state.ended,
    entries: state.log,
    visited: state.visited,
  };
}

/** A save-file-safe copy (the state is already plain JSON; this makes it explicit). */
export function serializeQuestState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Restore a saved state, tolerating a missing or partial one.
 * @param {unknown} saved
 * @returns {QuestState}
 */
export function deserializeQuestState(saved) {
  const fresh = createQuestState();
  if (!saved || typeof saved !== 'object') return fresh;
  const source = /** @type {Partial<QuestState>} */ (saved);
  return {
    step: Number.isInteger(source.step) ? Math.max(0, source.step) : fresh.step,
    pieces: Number.isInteger(source.pieces) ? Math.max(0, Math.min(8, source.pieces)) : fresh.pieces,
    mapKnown: Boolean(source.mapKnown),
    hasKeyItem: Boolean(source.hasKeyItem),
    ended: Boolean(source.ended),
    log: Array.isArray(source.log) ? source.log.map(String) : fresh.log,
    visited: Array.isArray(source.visited) ? source.visited.map(String) : fresh.visited,
    mithrilKey: Boolean(source.mithrilKey),
  };
}
