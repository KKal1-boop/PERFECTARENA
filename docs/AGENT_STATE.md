# AGENT_STATE (updated 2026-10-16, fourth pass)

PHASE: **P0 done, P1 in progress** (session brief §8). The owner played the port beside the real
Arena on 2026-10-16 and reported a long list; it is written up as **D-12 … D-25 in
`docs/DEFECTS.md` with their own section** and is now the work list. **D-01a, D-14b, D-15, D-16,
D-17, D-20, D-21 and D-25 are closed** — the first ten minutes of the game now match the
original's own numbers: the class weapon in the pack and empty hands at creation, a loot pile a
person could lift, doors that stop short of the jamb, and a dungeon whose air goes dark with
distance.

LAST GREEN: unit **`427/427`, exit 0** (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm test`) — four
new checks (the swing law, the flat-size law, the fog law, the starting kit). Browser, all run
**after** the last edit of this pass: `menu gear world` **95/95** · `mainquest combat actioncombat
doors` **164/164** · `chargen` **40/40** (four new checks: empty hands, the class weapon in the
pack, no weapon in hand, the fight reading fists) · `dungeonplay living townsfolk` **103/103** ·
`world dungeonplay` **36/36**. `audit` is red on purpose (the wilderness, D-01b/D-02a).

IN PROGRESS: nothing half-edited. Working tree clean except `docs/` edits of this pass.

WHAT THIS PASS PROVED (full detail: `docs/AUDIT-2026-10-15.md`, `docs/DEFECTS.md`):
* **D-01a closed (`62b75b8`) — the night street.** Two causes: the indoors flag flickered for one
  frame per rest block; and no city had a single trade, because `populateTown` ignored the level's
  own `*ITEM` people records. Both fixed. Measured (`.scratch/nightprobe.mjs`): 10:00 → 48 people,
  44 out, 41 walking, 16 on a route; **23:00 → 4 out and walking, 44 indoors**; 06:00 → 9 priests
  walking to worship. The audit's own S-A night check went green for the first time.
* **D-20 closed (`7be9d77`) — the held heavy sprayed the player.** Fourteen amber particles out
  of the player every 0.12 s for the whole of a hold, and a notice in design jargon. The spray is
  gone (the tell is the drawn weapon's wind-up plus one plain line), the mechanic is reported
  (`defence.charge`), and a landed blow is now **blood** instead of amber sparks.
* **D-25 closed (`50da1f0`) — enemies flipped left and right while they moved.** Two causes: the
  heading was read off a single frame of the scene's own one-axis-at-a-time stepping (a quarter
  turn a frame), and the mirrored half was `sin(angle)` which is zero for anybody walking at the
  player. `FACING_METRES` averages the heading over 0.3 m of travel; `mirrorFor` decides the side
  with a 0.2 rad deadband and remembers it. `.scratch/flipprobe.mjs`, 300 frames: **259 sharp
  turns and 258 mirror flips → 1 and 0.**
* **D-17 closed (`SWING_DEGREES`) — doors clipped into the wall.** The leaf turned **96°** where a
  panel that spans a cell comes to rest in the wall's own plane at 90°, so its far end drove
  26 cm into the next cell — which is solid by construction (`mifMesh` gives a door `panel: 'x'`
  only when the two cells it does not swing into are walls). Arena's margin is OpenTESArena's
  (`VoxelDoorUtils.cpp`: `HalfPi - 0.005`). `.scratch/doorprobe.mjs`, 273 doors in eight levels:
  **244 of 244 swinging leaves inside a wall at 96° → 0 of 244 at 89.714°.** The law is code now
  (`doorLeaf`, `leafIntoSolid`) and `tests/unit/doors.test.mjs` walks the real levels.
* **D-16 closed — the loot pile with the helm.** `EQUIPMEN.IMG` is 84×72 and the size law split on
  the art's own height, so that one record took the *wall's* density and stood **2.81 m tall**
  (every other loot art is under the threshold and was fine). The law now asks what the flat *is*
  (`flatSize`'s `item` flag), the densities moved into `game/flats.js` where Node can test them,
  and the pile is 1.27 m. Measured over all 93 shipped INFs (`.scratch/lootsizes.mjs`).
* **D-21 closed — no fog in dungeons.** One density (0.012) for every enclosed level kept 94 % of
  the light at 20 m: no fog at all. The air is now per kind of place (`fogForLevel`), an enclosed
  level gets **0.040** (24 % at 30 m), and a real page measured the change (`?fog=` vs `?fog=0`,
  `.scratch/fogprobe.mjs`): the air's reach over the frame went **0.6 % → 3.6 %** and its cost on
  the pixels it touches 8.1 → 11.2 luminance.
* **D-14b closed — the port had no empty hands.** `interior.js` issued a phantom longsword to
  every weaponless character, so the `fists` sheet (`HAND.CIF`) was unreachable and a new
  character was drawn holding a blade — the owner's "always the dagger animation". The line is
  gone, the HUD's two readers default to `fists` as the fight always did, and `startingKit(classId)`
  now puts **UESP's class weapon** (broadsword / shortsword / dagger) in the pack. Seen on a page:
  an Archer in `START.MIF` with `HAND.CIF` and a broadsword in the pack (`chargen` 40/40).
* **D-15 closed — the Imperial Dungeons' first rooms.** The level's roster was drawn **uniformly**,
  so a stone golem and a firedaemon stood where Arena has rats and goblins (the owner's own
  report). `encounters.rosterWindow` now fields a **prefix** of the level's own list, widening with
  danger and depth. Audit line, before → after:
  `{stonegolem:1, ghoul:1, goblin:1, firedaemon:1, vampire:1}` → `{lizardman:1, orc:2, wolf:1, rat:1, goblin:1}`.

NEXT 3 STEPS (the owner's list, cheapest-loudest first):
0. **D-14's remaining half — the weapon in hand through the real equip path.** The class weapon
   and the empty hands are done (D-14b); what is not yet *probed* is that equipping moves the rig
   for every family: walk `equipThing` (from the bag) through `fists → dagger → longsword →
   war-axe → mace → staff` on a page and report `weaponViewReport()`'s `file`/`frame` at each
   step. The unit suite proves the table, not that an equip moves the rig.
1. **D-12/D-13 — the start of the game.** Whether `INTRO.FLC` is played at all after `?chargen`,
   and whether the start dungeon's mirrored look is a data or a camera issue (compare
   `START.MIF`'s own flat layout — `tools/lib/mapascii.mjs` — with what the port draws).
2. **D-19 — resting brings the world to you.** Arena's rest in a dungeon is where creatures
   find you; this port's `R` heals and passes a day with nothing happening (`dungeonplay` pins
   the calm half). The encounter roll needs the world clock (P3) to be honest about an hour
   passing, which is why it sits behind the two above.

Then the two big ones the list names and the phases already own: **D-01b/D-02a** (people and
creatures in the country — the audit's four remaining reds) and **D-22** (P3/P4: the wilderness is
a 128×128 window, not a country — the owner: "you teleport around and cant even get out of a city").

OPEN DEFECTS (top): D-12 · D-13 · D-14 (the equip-path probe) · D-18 · D-18a · D-19 · D-01b ·
D-02a · D-22 · D-23 · D-24 · D-03 (coverage) · D-05 (P3) · D-06/D-07 (names outside this
checkout).
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
* **Starting a static server in one shell command and driving a browser from another.** The
  browser reaches a server spawned by *its own* process only (`tests/run-browser.mjs` spawns
  `tools/serve.mjs` with port 0 and reads `PORT=` off its stdout) — and a backgrounded
  `serve.mjs` left running holds the port, so the next `EADDRINUSE` looks like a network
  failure. `.scratch/fogprobe.mjs` is the pattern that works: spawn, read `PORT=`, drive, kill.

FILES NOT TO READ WHOLE: `src/scenes/interior.js` (478 KB) · `src/engine/render/renderer.js`
(5 551 lines) · `src/scenes/worldmap.js` (59 KB) · `tests/run-browser.mjs` (89 KB) ·
`docs/DECISIONS.md` (52 KB) · `src/game/livingWorld.js` (49 KB) · `src/game/radiantQuests.js`
(42 KB) · `tests/suites/actioncombat.mjs` (319 lines — read the phase you touch).
