# AGENT_STATE (updated 2026-10-16, sixteenth pass)

THIS PASS, IN ONE LINE: **the people turn, and a province's street is its own.** The owner's
*"some Npcs are not setted up well and they dont have a proper 360 walking animation or going
around them 360 animation"* was **the reading, not the art**: `MLGEN01…05` / `FMGENW01…05` are
**one man / one woman drawn from five directions**, and the previous pass had read them as five
one-angle figures — so the town's commoners could not be walked around at all. The digit is a
**direction** (OpenTESArena `ExeData.h`'s `0@XXX`: first digit gender, `@` = 1…5;
`ArenaAnimUtils::Directions = 8`, `FirstMirroredAnimID = 6`), and the archive's own widths agree
(the five views of one armour word run **40/55/69/56/38** px, symmetric about a profile, the same
numbers under every armour word). `peopleKinds.js` now reads one kind per family with per-direction
`actions`; `townsfolk.js` carries them; `interior.js` loads every direction's sheets and asks by
`viewFacing` — so a talk and a death follow the direction too. **Measured in a page**: a man of the
town reads `MLGEN01W.CFA` (view 1) → `MLGEN05W.CFA` (view 5) as the eye orbits (D-47, `a79d885`).
The second half of the owner's message — *"in morrowind mostly dark elf npcs … in blackmarsh i want
lizard mans repurpused as npcs to simulate argonians … all provinces should have a mix but mostly
their own"* — is **D-45's art half, closed for the marsh** (`3dc85c9`): a per-province **art pool**
(`provinceStyle.PEOPLE_ART`/`peopleArtFor`, `placeTownsfolk`'s `art`), and the one race-specific art
this archive carries — `LIZARD1…6.CFA`, the Lizard Man's five directions and its death — read as a
kind and put on Black Marsh's streets: **27 of 48 figures** in Lilmoth and Stormhold, **0** in
Daggerfall and Necrom. The other six provinces' humans are still the archive's single body: the
recolour rule is in `ACD.EXE` and has not been read (queue 0b).

LAST GREEN (this pass): unit **`561/561`, exit 0** (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm
test`) — `unit/peoplekinds.test.mjs` **restated** onto the direction reading (5 kinds, not 13;
per-direction actions; the archive's width signature) and two new check groups
(`unit/provincestyle.test.mjs`: every pool key is a roster key, the marsh is mostly lizard-folk;
`unit/townsfolk.test.mjs`: the pool draws only what it names, weights repeat, a key the install
lacks falls back to the roster). Browser, each run on its own: **`townsfolk` 65/65** (three new
checks: a citizen family carries five walk directions; a man of the town reads direction 1 → 5 as
the eye moves; Black Marsh is mostly lizard-folk and High Rock has none), **`city` 38/38**,
**`world` 28/28**, **`audit` 26/26**, **`living` 37/37**, **`movement` 11/11**. **The suites NOT
re-run**: `chargen`, `menu`, `mainquest`, `combat`, `actioncombat`, `doors`, `gear`, `generated`,
`hunt`, `commerce`, `guilds`, `regard`, `radiant`, `story`, `cutscene`, `scenevisuals`, `sky`,
`progression`, `bounties`, `exe`, `worldmap`, `persist`, `dungeonplay`, `interior`, `testmap`
(`interior.js` changed, so `actioncombat`/`combat` — the crowd's other readers — are the first
re-runs next pass, with `characters`/`chargen` for the armoured roster's gender digit).

WHAT THIS PASS PROVED (detail: `docs/DEFECTS.md`'s *The owner's sixth report* section,
`docs/PORT_BLOCKS.md` §4l, `docs/DECISIONS.md` D-47):
* **D-47 FIXED (`a79d885`)** — the direction reading, above. `tests/unit/peoplekinds.test.mjs` was
  **restated** with the evidence in its header (law 5: the old pin was wrong about the archive).
* **D-43 probed and NOT reproduced** (`.scratch/talkidentity.mjs`: 20 people, the panel read before
  `T`, twice while open, after a question and after `Escape`; `.scratch/talkrepeat.mjs`: eight
  presses on one person): **0 of 20 rows** showed the heading disagreeing with the person in front,
  and the eight presses stayed on one record (cell 47,98). **The row's own "what is known" cited
  `livingWorld.js`'s `allowChange`, which is not in the tree** — a DOC defect. The visible half of
  the owner's report is D-47's (a figure that cannot turn reads as changing character).
* **D-45 HALF FIXED (`3dc85c9`)** — the province art pool + the Lizard Man stand-in, above. The
  **palette half is open** and its next probe is named: the executable's numeric tables (0b).
* **D-44 NOT STARTED** (the owner's *"add the npcs that dont move … the one in taverns the priest
  the ones you can ask rumors"*): its probe is written and unrun — for one city, list the level's
  own `*ITEM` people spots with `role` and cell, then watch each for an hour of in-page clock and
  print how many ever leave their spawn cell. A building's keeper already stands still
  (`interior.js`: `if (person.shop) continue;`); a **street**'s share of stationary roles is what
  is unmeasured.
* **Also measured while checking**: `GLOBAL.BSA`'s extensions are `IMG MIF CFA SET INF DFA VOC RMD
  CIF XFM XMI` — **no `.COL` and no `.PAL`**, so no per-race palette is shipped; and the whole
  `.CFA` census is `BABE DEAMON FMGEN FMGEND FMGENW GHOST GHOUL GOBLIN GUARD HOM HOUND ICE IRON
  LGLIT LICH LIZARD MEDUSA MLGEN ORC PAT RAT SKELE SPIDER STONE SWOLF THARN TROLL VAMPIRE WOLF
  WRAITH ZOMBIE` — the families a province can be built from.

IN PROGRESS: nothing half-edited. **`interior.js` is 10 074 lines**; this pass touched it at four
small seams (the peopleKinds/actionFile import, `loadPeopleActions`, `liveBatches`'s talk/die
direction, the `people()` seam's flattened `actions`, and the two `placeTownsfolk` calls' `art`);
`src/game/{peopleKinds,townsfolk,provinceStyle}.js` are the law.

NEXT 3 STEPS (from `docs/PORT_BLOCKS.md` §5 and §4l, each with its first probe):
1. **0i · D-44 "the npcs that dont move"** — the probe above; then a *plan* change (a keeper's day
   begins and ends at their own cell) rather than a new entity. Blocks B11+B18; check `townsfolk`,
   `doors`, `living`.
2. **0m · B18 the sky a province never stops doing, and every biome's own background** (the owner,
   twice: *"in winterhold it never needs to stop snowing"*). `provinceStyle` gives Winterhold
   `weather: 'snow'` and the `.INF` letter `MCS`, but no probe has shown **precipitation**. First
   probe: on one page per climate, read `state().sky`/`sceneLighting` and take a horizon
   screenshot; the law belongs in `game/arenaSky.js`/`sceneLighting.js`, never in the scene.
3. **0g · B17 the country's landmarks — the volcano** (D-46, *"in morrowind you still cant see a
   vulcano"*). The province maps are Arena's own bitmaps, so the cheapest honest landmark is a
   **country feature** the terrain classes already imply, deterministic from the place's seed (the
   same rule as a ruin's door). First probe: what `MOROWIND.IMG` shows at Red Mountain's pixel and
   what the Morrowind wilderness window draws today.
Then, in the queue's own order: **0l** (the two map levels, one picture), **0e** (the persistent
world — the owner's *"barely moving in the persistent world reloads the game and its unplayable"*:
a slide is still a full scene re-boot, D-05/B19), **0b** (the executable's numeric tables — now
with a second reason: the race recolour), **0c/0d**, and P2/P3's big ones (`D-13` mirrored start,
`D-18/D-18a` water, `D-22` the country).

OPEN DEFECTS (top): **D-44** (the stationary roles — unprobed) · **D-45**'s palette half · **D-46**
(the volcano) · **D-22/D-05** (the country is a 128×128 window and a slide re-boots it) · **D-23**
(weather with no front; per-climate ground mix) · **D-13** (the mirrored start dungeon) ·
**D-18/D-18a** (water) · **D-40** (a repeated name is not an address) · **D-03/D-24** (coverage:
1 691 of 2 441 records named by nothing — `docs/ASSETS.md`) · **D-06/D-07** (names outside this
checkout) · `O-01` (a live page whose clock is moved answers no probe). Full list:
`docs/DEFECTS.md`.

DECISIONS TAKEN (this pass): **D-47** — the digit is a direction; a province's street is its own
art, the Lizard Man stands in for Argonians (stamped), and a per-province human recolour is
**rejected** until it is either read out of `ACD.EXE` or stamped as this project's own
(`docs/DECISIONS.md`).

DO-NOT-REPEAT (paid for already):
* Reading `src/scenes/interior.js` whole (**10 074 lines**, one closure). Grep a name, then
  `sed -n 'A,Bp'` a ≤300-line window.
* **`write_file` overwrites an existing path silently.** This pass destroyed
  `tests/unit/townsfolk.test.mjs` (299 lines, tracked) with a new file of the same name and had to
  restore it with `git checkout -- …`. **Check first** (`ls tests/unit | grep townsfolk`), and
  prefer *appending* to a test file that already covers the law.
* **`spawn_agents`' code-searcher and the `code_search` tool are broken on this host** (the
  vendored `rg.exe` is missing). Use `grep -rn … | head` in the shell, and constrain it —
  `grep -rn` over `src/` also hits `src/engine/` (154 modules) and drowns the answer; search
  `src/game`, `src/scenes`, `tests/unit`, `tests/suites`.
* **A long bash heredoc append to a doc can be truncated mid-write** (the `PORT_BLOCKS` §4l append
  lost its tail). Write the section to a temp file with `write_file`, `cat … >> doc`, then `rm`.
* Trusting `ARENA_PATH`'s default: run the suites with it set.
* **Addressing a suite's own creature/person by name or array index** — a index moves when
  somebody dies or walks out of doors (D-15, D-11).
* **Assuming a failing check is pre-existing**: attribute it in a `git worktree` at the baseline.
* **Starting a static server in one shell and driving a browser from another** — the browser
  reaches only a server its own process spawned (`tests/run-browser.mjs`, or the
  `.scratch/*.mjs` pattern that spawns `tools/serve.mjs`, reads `PORT=` off its stdout, drives,
  kills).
* Moving the clock on a live page (`setClock`); boot a page at the hour (`?clock=`) instead.

FILES NOT TO READ WHOLE: `src/scenes/interior.js` (10 074 lines · 478 KB) ·
`src/engine/render/renderer.js` (5 551) · `src/scenes/worldmap.js` (59 KB) ·
`tests/run-browser.mjs` (89 KB) · `docs/DECISIONS.md` (876 lines) · `docs/PORT_BLOCKS.md`
(973 lines) · `src/game/livingWorld.js` (976) · `src/game/radiantQuests.js` (42 KB) ·
`src/game/townsfolk.js` (534 — read the roster and the placement, not the corpus) ·
`tests/suites/actioncombat.mjs` (read the phase you touch).
