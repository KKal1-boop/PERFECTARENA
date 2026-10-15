# AGENT_STATE (updated 2026-10-16, third pass)

PHASE: **P0 done, P1 in progress** (session brief §8). The owner played the port beside the real
Arena on 2026-10-16 and reported a long list; it is written up as **D-12 … D-25 in
`docs/DEFECTS.md` with their own section** and is now the work list. **D-01a, D-15 and D-25 are
closed.**

LAST GREEN: unit **`423/423`, exit 0** (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm test`) at the
D-25 commit `50da1f0`. Browser, all run this pass: `actioncombat combat townsfolk` **118/118** ·
`living dungeonplay` **45/45** · `townsfolk city living` **133/133** (same pass, D-01a) ·
`audit` **15/23** (red on purpose; every red is the wilderness — D-01b/D-02a). The `townsfolk`
suite's one long-standing red (D-08) is fixed (`cefb8a6`).

IN PROGRESS: nothing half-edited. Working tree clean except `docs/` edits of this pass.

WHAT THIS PASS PROVED (full detail: `docs/AUDIT-2026-10-15.md`, `docs/DEFECTS.md`):
* **D-01a closed (`62b75b8`) — the night street.** Two causes: the indoors flag flickered for one
  frame per rest block; and no city had a single trade, because `populateTown` ignored the level's
  own `*ITEM` people records. Both fixed. Measured (`.scratch/nightprobe.mjs`): 10:00 → 48 people,
  44 out, 41 walking, 16 on a route; **23:00 → 4 out and walking, 44 indoors**; 06:00 → 9 priests
  walking to worship. The audit's own S-A night check went green for the first time.
* **D-25 closed (`50da1f0`) — enemies flipped left and right while they moved.** Two causes: the
  heading was read off a single frame of the scene's own one-axis-at-a-time stepping (a quarter
  turn a frame), and the mirrored half was `sin(angle)` which is zero for anybody walking at the
  player. `FACING_METRES` averages the heading over 0.3 m of travel; `mirrorFor` decides the side
  with a 0.2 rad deadband and remembers it. `.scratch/flipprobe.mjs`, 300 frames: **259 sharp
  turns and 258 mirror flips → 1 and 0.**
* **D-15 closed — the Imperial Dungeons' first rooms.** The level's roster was drawn **uniformly**,
  so a stone golem and a firedaemon stood where Arena has rats and goblins (the owner's own
  report). `encounters.rosterWindow` now fields a **prefix** of the level's own list, widening with
  danger and depth. Audit line, before → after:
  `{stonegolem:1, ghoul:1, goblin:1, firedaemon:1, vampire:1}` → `{lizardman:1, orc:2, wolf:1, rat:1, goblin:1}`.

NEXT 3 STEPS (the owner's list, cheapest-loudest first):
0. **D-20 — "hold left click and yellow particles come out of me" + the notice** (the held
   heavy's tell). The gate is already "an *armed* heavy" (`interior.js`, `defence.charging`), so
   what a player sees is the port's own tell design; the owner wants Arena's presentation (blood,
   not sparks) and no developer-voice notice. Settle the art trade-off, then make the tell the
   weapon's own wind-up — and check `tests/unit/combatfx.test.mjs` and the `dbg.chargeBursts`
   check in `actioncombat` before removing anything.
0b. **D-14 — the first-person weapon in hand.** The sheets and the state machine are right and
   `equipThing` does reset the rig, so the report ("always the dagger") is not yet reproduced:
   probe what the rig draws for each of `fists → dagger → longsword → war-axe → mace → staff`
   **through the real equip path**, and check the *starting* weapon (Arena starts you unarmed /
   per class; this port's `placeholderPlayer` carries a longsword and items.js's starting kit a
   dagger). Also D-16 (loot pile too big) and D-21 (no dungeon fog) are one-file reads.
1. **D-12/D-13 — the start of the game.** Whether `INTRO.FLC` is played at all after `?chargen`,
   and whether the start dungeon's mirrored look is a data or a camera issue (compare
   `START.MIF`'s own flat layout — `tools/lib/mapascii.mjs` — with what the port draws).

Then the two big ones the list names and the phases already own: **D-01b/D-02a** (people and
creatures in the country — the audit's four remaining reds) and **D-22** (P3/P4: the wilderness is
a 128×128 window, not a country — the owner: "you teleport around and cant even get out of a city").

OPEN DEFECTS (top): D-12 · D-13 · D-14 · D-16 · D-17 · D-18 · D-19 · D-20 · D-21 · D-01b ·
D-02a · D-22 · D-23 · D-24 · D-03 (coverage) · D-05 (P3) · D-06/D-07 (names outside this checkout).
Full list: `docs/DEFECTS.md`. O-01 stands (a live page whose clock is moved answers no probe).

DO-NOT-REPEAT (paid for already):
* Reading `src/scenes/interior.js` whole (478 KB, one ~8 400-line closure). Grep a name, then
  `sed -n 'A,Bp'` a ≤300-line window.
* **An in-page probe whose promise can hang.** An exception inside a `requestAnimationFrame`
  callback leaves the promise pending for ever; every audit watch catches per step and arms a
  `setTimeout` belt.
* Moving the clock on a live page from a probe (`setClock`). A page **booted** at an hour
  (`?clock=`) answers; boot a fresh page instead.
* Trusting `ARENA_PATH`'s default: run the suites with it set.
* **Addressing a suite's own creature by name or by array index.** An index moves when a creature
  dies; a name is not unique once a level fields its own bestiary (D-15). Use
  `__debug.combat()`'s `serial`.
* Assuming a failing check is pre-existing: attribute it in a `git worktree` at the baseline
  commit (`git worktree add -q .scratch/wt HEAD`) before believing either story.

FILES NOT TO READ WHOLE: `src/scenes/interior.js` (478 KB) · `src/engine/render/renderer.js`
(5 551 lines) · `src/scenes/worldmap.js` (59 KB) · `tests/run-browser.mjs` (89 KB) ·
`docs/DECISIONS.md` (52 KB) · `src/game/livingWorld.js` (49 KB) · `src/game/radiantQuests.js`
(42 KB) · `tests/suites/actioncombat.mjs` (319 lines — read the phase you touch).
