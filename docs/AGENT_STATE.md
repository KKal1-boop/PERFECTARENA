# AGENT_STATE (updated 2026-10-16, seventeenth pass)

THIS PASS, IN ONE LINE: **the gate is a way through, and the country's reload is measured.** The
owner's priority, sent mid-session: *"CITY GATES SHOULD HAVE NO COLLISION SO I CAN ACTUALLY GO INTO
THE WILDERNESS AND FOCUS WITH THE PERSISTENT WORLD CALCULATIONS"*. Done (`a16d551`, D-48): every
shipped skeleton cuts exactly one two-cell opening in its outermost line and hangs the game's
gateway art in it, and the decoder had read `solid` off that voxel's own byte — so walking at the
gate stopped against the art. `mifLevel.js`'s `openSettlementGate` now marks the opening
`gateway: true` (*drawn exactly as the file says, in nobody's collision soup*); `mifMesh.js`'s
`collides(cell)` and `interior.js`'s `walkableWorld` both read it, so the player and a body agree.
**Measured**: 20 of 20 settlement skeletons open one run of two cells (the file count is 20 —
`CITY1…5`, `CITYW1…3`, `TOWN1…5`, `TOWNW1…2`, `VILLAGE1…5`); a block's own `0x9` arches are refused
whole (sweep of all 526 `.MIF` records: blocks show a 14-cell run or two runs on two lines);
`colliderTris` falls by the gate's quads while `model.indices` is byte-identical; and on a real
assembled city page the two gateway cells are reported and **walking at the gate leaves the city on
foot with no keypress** (`movement` 12/12). The same commit fixes **D-49**, which is the lesson of
the day: the previous pass's gate code had **never been booted** (`current.gateway = …` written 400
lines before `current` is built → *"Cannot set properties of null (setting 'gateway')"* on every
city and country page), and `movement` — the suite that catches it — was on that pass's *not re-run*
list.

THE OWNER'S OTHER HALF: *"barely moving in the persistent world wilderness reloads the game and its
unplayable"* — **measured, not fixed** (D-36's second half, `.scratch/slideidle.mjs`): standing
still re-boots nothing (painted 20 → 105 over 8 s); walking re-boots **once per 64 cells ≈ 160 m ≈
20 s of walking** (painted 380 → 6, window origin 2048 → 2112, the player's cell and bearing kept).
The slide is the original's own mechanism; the cost is that it is a **new page**. Owning block
**B25 (new): one resident country** — first step is the cost probe (*time one `goInPlace` and list
what the boot recomputes that the world already knows*), then shift the window in place.

ALSO THIS PASS: the owner's *"in winterhold it never needs to stop snowing"* is **VERIFIED with
nothing forced** — the `city` suite's two checks boot `?location=Winterhold` by name and sample six
seconds: `MCS.INF`, the snow sky, and `mode: snow` with particles at every sample (`city` 40/40,
38 before). And the `persist` suite's corner check is **restated** (logged in `DEFECTS.md`): it
waited 21 wall seconds for a tick that counts **simulated** seconds (`CLOCK_SAVE_EVERY = 20`, `dt`
capped at 0.1), which lands at wall second 25 on a software renderer — the wait is now for the save
to name the cell, bounded and reported (24 s here), and `persist` **14/14**: a bare page really does
return the player to the corner the world remembers.

LAST GREEN (this pass, each command run on its own): unit **562/562**, exit 0
(`ARENA_PATH=C:/ArenaProject/arena/ARENA npm test`, `unit/mif.test.mjs` +1 check that walks all
twenty skeletons and both refused blocks). Browser: **movement 12/12** (+1: the page's own gateway
cells), **city 40/40** (+2: Winterhold with nothing forced), **world 28/28**, **persist 14/14**
(+1 and one restated), **living 37/37**, **townsfolk 65/65**, **doors 42/42**, **audit 26/26**.
**Suites NOT re-run this pass**: `chargen`, `menu`, `mainquest`, `combat`, `actioncombat`,
`generated`, `hunt`, `commerce`, `guilds`, `regard`, `radiant`, `story`, `cutscene`,
`scenevisuals`, `sky`, `progression`, `bounties`, `exe`, `worldmap`, `dungeonplay`, `interior`,
`testmap` — none of them reads the gate flag, but `interior.js` changed, so `dungeonplay`,
`actioncombat` and `combat` are the first re-runs next pass.

IN PROGRESS: nothing half-edited. `interior.js` is 10 080 lines; this pass touched it at two seams
(the gate block's local + the `current` literal's `gateway` field). The law lives in
`mifLevel.js`'s `openSettlementGate` and `mifMesh.js`'s `collides`.

NEXT 3 STEPS (from `docs/PORT_BLOCKS.md` §4m and §5, each with its first probe already named):
1. **0e · B25 the resident country** — the owner's loudest remaining complaint. First: the cost
   probe (one `goInPlace`, what it recomputes); then shift the window in place, keeping the blocks
   that did not change. Checks: `world`, `persist`, `movement`.
2. **0i · D-44 "the npcs that dont move"** (the tavern keeper, the priest, the rumour-givers) —
   probe as written: for one city, list the level's own `*ITEM` people spots with `role` and cell,
   then watch each for an hour of in-page clock and print how many ever leave their spawn cell. A
   building's keeper already stands still (`interior.js`: `if (person.shop) continue;`); a
   **street**'s share of stationary roles is what is unmeasured. Checks: `townsfolk`, `doors`,
   `living`.
3. **0b/B24 · the executable's numeric tables** — now with the race recolour as a second reason
   (D-45's open half: the archive ships one human body and **no `.PAL`/`.COL`**, so a province's
   skin is either read out of `ACD.EXE` or stamped as this project's own). First probe: the
   `ACD.EXE` table list, against what `src/arena/exeTables.js` already reads.
Then: **0l** (the two map levels, one picture — the owner's *"the big map and the region maps
coherence needs to be redone"*), **0g** (the volcano, D-46), **0m**'s other half (every biome's own
background), **0c/0d**, P2/P3 (`D-13` mirrored start, `D-18/D-18a` water, `D-22` the country).

OPEN DEFECTS (top): **D-36's second half / D-22 / D-05** (the country is a 128×128 window and the
slide is a page re-boot — measured, B25) · **D-44** (the stationary roles — unprobed) · **D-45**'s
palette half · **D-46** (the volcano) · **D-23** (weather with no front; per-biome ground mix) ·
**D-13** (the mirrored start) · **D-18/D-18a** (water) · **D-40** (a repeated name is not an
address) · **D-03/D-24** (coverage: 1 691 of 2 441 records named by nothing, `docs/ASSETS.md`) ·
**D-06/D-07** (names outside this checkout) · `O-01` (a live page whose clock is moved answers no
probe). Full list: `docs/DEFECTS.md`.

DECISIONS TAKEN (this pass): **D-48** — a settlement's gate is read off the level's own geometry
(one contiguous run of two gateway voxels on the outermost line over walkable ground), a
building's line is refused whole, and neither a filename test nor a lighter flag was the answer
(`docs/DECISIONS.md`'s own section, with the rejected alternatives).

DO-NOT-REPEAT (paid for already):
* **A change you did not boot is not a change.** The previous pass's gate code passed `npm test`
  and was never loaded by a page; it crashed every settlement on boot (D-49). Run the **browser**
  suite of the scene you touched before calling a change done, even when the unit tests are green.
* **`persist`'s clock/position checks count *simulated* seconds** (`CLOCK_SAVE_EVERY = 20`, `dt`
  capped at 0.1): a fixed wall-clock sleep is a frame-rate assumption. Wait for the *fact* in the
  save (`localStorage['perfectarena.world']`), not for a duration. The debug seam
  `worldMemory()` is `worldSummary`-shaped and does **not** carry `player` — read the save.
* Reading `src/scenes/interior.js` whole (**10 080 lines**, one closure). Grep a name, then
  `sed -n 'A,Bp'` a ≤300-line window. `current` is created at the `current = { … }` literal only —
  **nothing above it may write to `current`**.
* **`write_file` overwrites an existing path silently.** Check first (`ls tests/unit | grep …`) and
  prefer appending to a test file that already covers the law.
* **`spawn_agents`' code-searcher and the `code_search` tool are broken on this host** (the vendored
  `rg.exe` is missing). Use `grep -rn … | head`, constrained to `src/game`, `src/scenes`,
  `tests/unit`, `tests/suites` (`src/engine` is 154 modules and drowns the answer).
* **A long bash heredoc append to a doc can be truncated mid-write.** Write the section to a temp
  file with `write_file`, `cat … >> doc`, then `rm`.
* Trusting `ARENA_PATH`'s default: run the suites with it set.
* **Addressing a suite's own creature/person by name or array index** — an index moves when
  somebody dies or walks out of doors (D-15, D-11).
* **Assuming a failing check is pre-existing**: attribute it in a `git worktree` at the baseline, or
  by measuring the mechanism it depends on (this pass: the slow tick's simulated seconds).
* **Starting a static server in one shell and driving a browser from another** — the browser reaches
  only a server its own process spawned (`tests/run-browser.mjs`, or the `.scratch/*.mjs` pattern
  that spawns `tools/serve.mjs`, reads `PORT=` off its stdout, drives, kills).
* Moving the clock on a live page (`setClock`); boot a page at the hour (`?clock=`) instead.
* `.scratch/*.mjs` files cannot be **read** by the file tools ([BLOCKED]) — write them with
  `write_file` and keep the probe's own output in the transcript/docs.

FILES NOT TO READ WHOLE: `src/scenes/interior.js` (10 080 lines · 478 KB) ·
`src/engine/render/renderer.js` (5 551) · `src/scenes/worldmap.js` (59 KB) ·
`tests/run-browser.mjs` (89 KB) · `docs/DECISIONS.md` (878 lines) · `docs/PORT_BLOCKS.md`
(1 031) · `docs/DEFECTS.md` (123) · `src/game/livingWorld.js` (976) · `src/game/radiantQuests.js`
(42 KB) · `src/game/townsfolk.js` (534 — read the roster and the placement, not the corpus) ·
`tests/suites/actioncombat.mjs` (read the phase you touch).
