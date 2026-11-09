// THE LOGBOOK — what the player has done, and what they want to remember.
//
// Daggerfall gave the player a logbook: the quest's own journal, the places seen,
// and a page of notes written in their own hand. Arena has the journal half (the
// main quest's `log`, `questState.js`) but not the notes; this module is the
// Daggerfall side's quality-of-life layer, kept pure so it can be tested without a
// page and persisted by `game/save.js` like every other save record.
//
// It deliberately stores **plain JSON**: a note is a string, a day, an hour and a
// place, and a save is `JSON.stringify`. A browser in private mode may refuse the
// write; every caller tolerates that, and the journal half still works.

/** The record's version. A future shape can migrate rather than guess. */
export const LOGBOOK_VERSION = 1;

/** How many notes one character keeps. The oldest is dropped, never the newest. */
export const MAX_NOTES = 80;

/** A fresh, empty logbook. */
export function createLogbook() {
  return { version: LOGBOOK_VERSION, nextId: 1, notes: [] };
}

/**
 * A saved record made safe: one known version, integer ids, strings that are strings.
 * Missing, truncated or nonsense records become an empty logbook rather than an error.
 *
 * @param {unknown} raw
 * @returns {{version: number, nextId: number, notes: object[]}}
 */
export function normalizeLogbook(raw) {
  const fresh = createLogbook();
  if (!raw || typeof raw !== 'object') return fresh;
  const source = /** @type {{notes?: unknown, nextId?: unknown}} */ (raw);
  const notes = [];
  for (const value of Array.isArray(source.notes) ? source.notes : []) {
    if (!value || typeof value !== 'object') continue;
    const note = /** @type {Record<string, unknown>} */ (value);
    const text = String(note.text ?? '').trim().slice(0, 240);
    if (!text) continue;
    notes.push({
      id: String(note.id ?? `n${notes.length + 1}`),
      text,
      day: Number.isFinite(Number(note.day)) ? Math.max(0, Math.trunc(Number(note.day))) : 0,
      hour: Number.isFinite(Number(note.hour)) ? Math.max(0, Math.min(23, Math.trunc(Number(note.hour)))) : 0,
      place: String(note.place ?? '').slice(0, 80),
      questStep: Number.isFinite(Number(note.questStep)) ? Math.max(0, Math.trunc(Number(note.questStep))) : 0,
      at: Number.isFinite(Number(note.at)) ? Math.max(0, Math.trunc(Number(note.at))) : 0,
    });
  }
  const nextId = Math.max(
    Number.isInteger(source.nextId) ? source.nextId : 1,
    notes.reduce((max, note) => {
      const n = Number(String(note.id).replace(/^n/, ''));
      return Number.isFinite(n) ? Math.max(max, n + 1) : max;
    }, 1),
  );
  return { version: LOGBOOK_VERSION, nextId, notes: notes.slice(-MAX_NOTES) };
}

/**
 * Write a note.
 *
 * @param {{version?: number, nextId?: number, notes?: object[]}} logbook
 * @param {string} text
 * @param {{day?: number, hour?: number, place?: string, questStep?: number, at?: number}} [meta]
 * @returns {{ok: boolean, reason?: string, logbook: object, note?: object}}
 */
export function addNote(logbook, text, meta = {}) {
  const book = normalizeLogbook(logbook);
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!clean) return { ok: false, reason: 'a note needs a word in it', logbook: book };
  const note = {
    id: `n${book.nextId}`,
    text: clean,
    day: Number.isFinite(Number(meta.day)) ? Math.max(0, Math.trunc(Number(meta.day))) : 0,
    hour: Number.isFinite(Number(meta.hour)) ? Math.max(0, Math.min(23, Math.trunc(Number(meta.hour)))) : 0,
    place: String(meta.place ?? '').slice(0, 80),
    questStep: Number.isFinite(Number(meta.questStep)) ? Math.max(0, Math.trunc(Number(meta.questStep))) : 0,
    at: Number.isFinite(Number(meta.at)) ? Math.max(0, Math.trunc(Number(meta.at))) : 0,
  };
  const notes = [...book.notes, note].slice(-MAX_NOTES);
  return {
    ok: true,
    note,
    logbook: { version: LOGBOOK_VERSION, nextId: book.nextId + 1, notes },
  };
}

/**
 * Remove a note by id.
 * @param {{notes?: object[]}} logbook
 * @param {string} id
 * @returns {{ok: boolean, logbook: object}}
 */
export function removeNote(logbook, id) {
  const book = normalizeLogbook(logbook);
  const notes = book.notes.filter((note) => note.id !== String(id));
  if (notes.length === book.notes.length) return { ok: false, logbook: book };
  return { ok: true, logbook: { ...book, notes } };
}

/**
 * The words under a note: the world's own clock and the place it was written.
 * @param {{day?: number, hour?: number, place?: string}} note
 * @returns {string}
 */
export function formatLogbookStamp(note) {
  const day = Math.max(0, Math.trunc(Number(note?.day) || 0));
  const hour = Math.max(0, Math.min(23, Math.trunc(Number(note?.hour) || 0)));
  const clock = `${String(hour).padStart(2, '0')}:00`;
  const place = String(note?.place ?? '').trim();
  return `Day ${day + 1} · ${clock}${place ? ` · ${place}` : ''}`;
}

/**
 * The journal's entries newest-first, which is how a player reads a logbook.
 * @param {{log?: string[]}} quest
 * @param {number} [limit]
 * @returns {string[]}
 */
export function newestEntries(quest, limit = 18) {
  const entries = Array.isArray(quest?.log) ? quest.log.filter((line) => typeof line === 'string') : [];
  return entries.slice(-Math.max(1, limit)).reverse();
}
