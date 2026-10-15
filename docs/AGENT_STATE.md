# AGENT_STATE (updated 2026-10-15, second pass)

PHASE: **P0 — reality audit** (session brief §8). The audit exists and has been run.
ITEM: P0.1 baseline commit ✅ · P0.2 audit suite + audit doc ✅ (`tests/suites/audit.mjs`,
`docs/AUDIT-2026-10-15.md`) · P0.3 the cheap certain fixes ← **next**.

LAST GREEN: unit `412/412` at commit `2986324` (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm test`).
The audit itself is **14/23 checks, red on purpose** (`node tests/run-browser.mjs audit`); its
nine reds are the work list in `docs/DEFECTS.md`.

IN PROGRESS: nothing half-edited. `src/main.js` gained `installPageLoadCounter()` (the audit's
S-E instrument: `__debug.navigations`, `sessionStorage`-based, 0 in a tab's first document);
`tests/suites/audit.mjs` is new and registered as `audit` in `tests/run-browser.mjs`;
`tests/unit/modules.test.mjs` is the P0 **module gate** (every `src/` module parses, every static
import resolves, every module imports in bare Node, one entry point) — mutation-checked: a
missing import and a syntax error each turn it red.

WHAT THE AUDIT PROVED (full write-up: `docs/AUDIT-2026-10-15.md`):
* **S-A town, 10:00: 48 people, 43 of them (90 %) moved > 5 m in 20 s, 17 mid-step, 7 mid-route.**
  The previous pass's walking is real. **23:00: the same 48 people, 0 moved — a frozen crowd (D-01a).**
* **S-A/S-B the country is empty — 0 people and 0 creatures in all three climates (D-01b, D-02a).**
  Root cause read off the bytes: `TWN/DWN/MWN.INF` place only item flats `[15,2,14]`, so the
  monster roster is `[]` and `monsterCountFor` returns 0 by its own law; and `populate()`'s
  `else { townsfolk = [] }` empties the people outside cities.
* **S-C: 0 missing textures on all 7 levels walked** (city, shop, 3 windows, dungeon). The real
  asset gap is coverage: 1 691 of 2 441 BSA records named by nothing.
* **S-D is NOT reproduced**: at cell (1024,1024) the three climates place *no shared block*
  (`[24,60,49,29]` / `[41,34,12,56]` / `[37,22,9,32]`, 1 123/1 154/1 753 flats). Climate selects
  terrain, not just a palette. Relief/sea/roads/continuity remain absent and unclaimed.
* **S-E: a door is NOT a page load.** `navigations` stayed flat and a variable set on the street
  survived into the shop — `goInPlace` re-boots the scene in one document. The brief's S35 is
  **stale** (D-05a); the real gap is that a hop re-boots the scene instead of swapping into a
  living world (P3).

NEXT 3 STEPS:
1. **D-01b then D-02a** — people and creatures in the country (P1 items 1–2). These two are the
   same complaint ("there is nothing out there") and are the biggest player-visible win. For the
   bestiary, `rosterFor(danger)` already exists and is annotated; a *terrain/clock* table does not,
   and until ACD.EXE is unpacked (P2) it must be stamped this project's own.
2. **D-01a** — find out why the town freezes at 23:00; probe `stepTownsfolk`/`townPaths` at night
   before changing anything.
3. **D-07** — names exist only on this checkout's dev door (hard-coded
   `C:/ArenaProject/daggerfall/arena2/...` behind a silent catch). Serve the corpus through the
   player's own folder and fall back to `daggerfall/src/characters/nameGen.json` (D-06), so a
   missing corpus is a degraded feature rather than an invisible one.

OPEN DEFECTS (top): D-01a · D-01b · D-02a · D-03 (breadth) · D-05 · D-06 (the fallback) · D-07 —
D-02b and D-05a are DOC and landed in `f2003c7`. Full list and the observation O-01:
`docs/DEFECTS.md`.

DO-NOT-REPEAT (paid for already):
* Reading `src/scenes/interior.js` whole (478 KB, one ~8 400-line closure). Grep a name, then
  `sed -n 'A,Bp'` a ≤300-line window.
* **An in-page probe whose promise can hang.** `page.evalJs` awaits the page's promise, and an
  exception inside a `requestAnimationFrame` callback leaves that promise pending *forever* —
  the first audit run sat for four minutes with nothing on screen. Every in-page watch in
  `audit.mjs` now catches per step and arms a `setTimeout` belt. Never write another one without.
* Moving the clock on a live page (`setClock(1380)`) from a probe: a page **booted** at an hour
  (`?clock=`) answers; the live move did not (O-01).
* Trusting `ARENA_PATH`'s default: run the suites with it set, or the audit's own folder line and
  every suite's `q` disagree.

FILES NOT TO READ WHOLE: `src/scenes/interior.js` (478 KB) · `src/engine/render/renderer.js`
(5 551 lines) · `src/scenes/worldmap.js` (59 KB) · `tests/run-browser.mjs` (89 KB) ·
`docs/DECISIONS.md` (52 KB) · `src/game/livingWorld.js` (49 KB) · `src/game/radiantQuests.js` (42 KB).
