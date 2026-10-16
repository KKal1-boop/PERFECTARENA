# PORT_BLOCKS — the port, advanced one whole system at a time

The owner's own words, 2026-10-16, after playing this port beside the original:

> *"what you are doing each session is nearly not enough you should maybe make a way to more
> systematically and cleanly really import basically copypaste/recreate actual arena code to go
> forward in blocks otherwise we will never go on."*

This file is that way. It is the **work order**: every session takes whole blocks from the queue
at the bottom, closes them, and moves the next one up. A block is a *system of the original*, not
a symptom: "resting" is a block, "the pile of loot is too big" is a row in `docs/DEFECTS.md`
inside its block.

---

## 1. What a "block" is, and what closes it

A block is closed when **all six** of these are true. The order matters — it is the order that
stops a session from guessing.

1. **The source of truth is named.** One of:
   * a file in the install (`arena/ARENA/…`: `START.MIF`, `IMPPAL1.INF`, `WATERANI.RCI`,
     `TEMPLATE.DAT`, `INTRO.FLC`, …) — the bytes are the law;
   * a text corpus in the install (`QUESTION.TXT`, `CITYINTR`, `TEMPLE.DAT`, `READ.ME`, …);
   * a **reference implementation**, quoted with its file and line, when the number lives in
     the executable: OpenTESArena (MIT) is the one this project uses
     (`ArenaWeaponUtils`, `ArenaAnimUtils`, `ArenaChasmUtils`, `VoxelDoorUtils`, `INFFile`).
2. **`A.EXE` is not in this checkout.** `ls arena/ARENA` is 153 loose files plus
   `GLOBAL.BSA` — `ACD.EXE`, `INSTALL.EXE`, `ULTRAMID.EXE`, `ARENA.BAT`, no `A.EXE`. So every
   table that lived in the executable (spawn tables, weapon animation timing, rest rolls, the
   fixed quest text) is **not** readable here. A block that needs one either quotes
   OpenTESArena's extraction of it, or states plainly that the number is *this project's own
   rule* and stamps it as such in the module header. Never a third option.
3. **The law lives in a module, not in a scene.** `src/scenes/interior.js` is 9 000 lines of
   wiring; anything that can be *decided* (a size, a swing angle, a fog density, a start
   destination, a hunt) belongs in `src/game/*.js` where a Node test can hold it. This is what
   made D-16, D-17, D-21, D-25 and this session's two blocks closable at all.
4. **A probe measures before/after.** "It looks better" is not a measurement: every row in
   `docs/DEFECTS.md` says what the probe printed before and after. Probes live in `.scratch/`
   (a few lines, throwaway) or, when they keep earning their place, in `tests/`.
5. **A Node unit test holds the law**, and **a browser suite holds the player's half** — the
   thing the owner would see. A change that only has a unit test has not been seen; a change
   that only has a browser check has no law under it.
6. **The docs move with it**: a `docs/DEFECTS.md` row goes `OPEN → FIXED` **pointing at the
   commit hash that closed it** (the repo's own convention: the row is rewritten in a follow-up
   commit, once the hash exists), and `docs/AGENT_STATE.md` names the next three steps.

---

## 2. The ledger

`[x]` closed and held by a passing check · `[~]` working, with a named gap · `[ ]` not started.
"Check" is the test that fails if the block regresses.

| id | block | source of truth | module | state | check |
|---|---|---|---|---|---|
| B01 | Asset + format readers | `GLOBAL.BSA`, loose `.IMG/.SET/.CFA/.CIF/.MIF/.RMD/.INF/.FLC/.VOC/.RCI/.COL` | `src/arena/*` | `[x]` | `unit/mif`, `unit/flats`, `unit/voc`, `unit/cutscene`, `unit/doors` |
| B02 | Level data → world: cells, flats, colliders, arrival | the install's `*.MIF` + `*.INF` | `mifFile/mifLevel/mifMesh/flats` | `[~]` **D-13 mirrored-start unmeasured** | `unit/mif`, `unit/flats`, `dungeonplay` |
| B03 | Generated levels (the dungeons the install does not ship) | 29 raw blocks in `GLOBAL.BSA` | `dungeonPlan.js` | `[x]` | `unit/dungeonplan`, `generated` |
| B04 | Doors: hinges, swing, locks, keys | `IMPPAL1.INF` doors, OpenTESArena `VoxelDoorUtils` | `doors.js` | `[x]` (D-17) | `unit/doors`, `doors` |
| B05 | Chasms: water, lava, falling, **swimming/passing through water** | `WATERANI.RCI`/`LAVAANI.RCI`, OpenTESArena `ArenaChasmUtils` | `chasmSurface.js`, `interior.js:updateWater` | `[~]` **D-18/D-18a open** | `unit/mif` (chasm cells), `interior` |
| B06 | First person: the weapon in hand, the swing, empty hands, **and the stride** | `HAND.CIF`, `SWORD.CIF`, `AXE.CIF`, `MACE.CIF`, `HAMMER.CIF`, `STAFF.CIF` + OpenTESArena `ArenaWeaponUtils` | `weaponView.js`, `items.js` | `[x]` **(D-14b, and D-26 for the run gate)**: a drawn weapon is a walk — `canRunUnlessDrawn` is the law and the builder takes the rig's own answer as a parameter; the page measures **walk 1.86 m/s → sprint 3.08 → sprint with the blade out 1.86**, and every movement key held leaves the frame counter climbing | `unit/weapon`, `unit/items`, `unit/stride`, `chargen`, `gear`, **`movement`** |
| B07 | Billboards: five views, walk/attack/death cycles, facing | OpenTESArena `ArenaAnimUtils` | `actorAnimation.js` | `[x]` (D-25) | `unit/actoranimation`, `townsfolk`, `actioncombat` |
| B08 | Combat rules: to-hit, damage, poise, stagger, parry/riposte | Arena's own stat table (`SPELLS.LST`, `.INF` `*ITEM` stats) | `combat.js`, `combatStyle.js` | `[x]` | `unit/combat`, `actioncombat`, `combat` |
| B09 | Combat **presentation**: blood, tells, no invented particles | the original's own look (no wind-up bursts) | `combatFx.js`, `bloodEffect.js`, `engine/combat/bloodDecals.js` | `[~]` **the owner's "ugly battle particles"** — the invented amber bursts are gone (D-20), a landed blow is now `combatFx.blood()` (one blood red, `5cccb80`), and `bloodEffect.js` turns a blow into the engine's own decal records; **the remaining half is the decal pass** (`renderer.createDecalBatch` / `place` / `writeDecalSlot` / `drawDecals`, `renderer.js:3128-3166`) — nobody has read `engine/combat/bloodArt.js`, which is where that pass's texture comes from | `combat`, `actioncombat`, `unit/bloodeffect.test.mjs` |
| B10 | Rest: a tavern room, a camp in the wild, **a dungeon that hears you** | the original's own behaviour (roll is `A.EXE`, not shipped) | `services.js` (`rest`), `interior.js:rest`, `encounters.js` (`stirTheLevel`) | `[x]` (D-19, this session) | `unit/hunt` |
| B11 | Townsfolk, day plans, trades, regard | `NAMEGEN.DAT`, `.INF` `*ITEM` people, `GLOBAL.BSA` crowd sheets | `townsfolk.js`, `livingWorld.js`, `peopleKinds.js`, `wildernessBestiary.js` | `[x]` **(D-01b closed, `5cccb80`)**: a city's crowd is its own blocks' trades, its night is the trades whose day keeps them out, and the country has travellers of its own on every road | `living`, `townsfolk`, `regard`, `audit` (S-A ×4) |
| B12 | Shops, guilds, temples, services | `TEMPLATE.DAT`, `.INF` menus | `shops.js`, `services.js`, `guilds.js` | `[x]` | `commerce`, `guilds`, `unit/shops` |
| B13 | Radiant quests **given by NPCs** | `TEMPLATE.DAT` + `.INF` people | `radiantQuests.js` | `[x]` | `unit/radiant`, `radiant`, `bounties` |
| B14 | Main quest: eight pieces, the palace, the ending | `CITYDATA.64/65`, `DUNGEON.TXT`, `TEMPLATE.DAT`, `END01.FLC` | `questData/questState/radiantQuests` | `[x]` | `mainquest`, `unit/quest` |
| B15 | **The first ten minutes**: creation → `INTRO.FLC` → the Imperial Dungeons | `START.MIF`, `INTRO.FLC`, `QUESTION.TXT` | `startFlow.js`, `chargen.js`, `newGame.js`, `main.js` | `[x]` (D-12, this session) | `unit/startflow`, `chargen`, `menu` |
| B16 | World map, all of Tamriel, fast travel | `TAMRIEL.MNU`, `CITYDATA.64/65` | `worldMap.js`, `worldmap.js` | `[x]` | `worldmap`, `unit/worldmap` |
| B17 | Wilderness, leaving a city on foot | `TWN/DWN/MWN.INF`, `GLOBAL.BSA` wild blocks | `wilderness.js`, `wildernessBestiary.js` | `[~]` **(D-01b and D-02a closed, `5cccb80`: the country is inhabited and its three climates field different creatures; D-27, `baf80ef`: the gate is a door the player *walks* through — the wall's opening holds the gateway as a solid voxel, so the crossing used to be behind `E` and read as no door at all)** · **the walk back in works (`dbf4058`) — D-32 was the save's remembered wilderness cell overriding the explicit `?at=` arrival; the only cause left on that row is `GATE_STEP` (3 cells = 7.5 m) against `GATE_WALK_REACH` (3.2 m)** · **D-22 still open**: a 128×128 window per climate, no relief, no coast, no roads, no continuous Tamriel | `world`, `audit` (S-A/S-B/S-D), `movement` (the gate), `wildfoot`, `unit/wilderness`, `unit/wildernessbestiary` |
| B18 | Climate + weather + night: ground, sky, precipitation | `.INF` name letters (`TCW` rain, `TCS` snow), `DAYTIME.COL`/`DREARY.COL`/`FOG.COL`, `ARENA.SKY`-family | `arenaSky.js`, `sceneLighting.js`, `daylight.js`, engine `weather.js` | `[~]` **D-23**: the level's *own* letter is honoured; there is no front that moves, no per-climate ground mix, no snow on the ground | `scenevisuals`, `unit/sky` |
| B19 | A persistent, seamless world (P3) | — (an engineering goal) | `worldState.js`, `save.js`, `interior.js:goInPlace` | `[~]` **D-05**: doors/gates/stairs are in-page, but a place change re-boots the scene | `unit/worldstate`, `audit` |
| B20 | Sound: voices, one-shots, fanfare, music | `*.VOC`, `SOUND.CFG`, `FANFARE1/2.VOC`, `SPEECH/` | `trigSound.js`, `fanfare.js`, engine `audio.js` | `[~]` the speech bank (`arena/ARENA/SPEECH`) is unread; the `.INF` `@SOUND` slots are wired | `unit/voc`, `doors` |
| B21 | The automap (the original's map screen, with notes) | `A.EXE`'s map screen (not shipped) | — **nothing yet** | `[ ]` | — |
| B22 | Asset coverage: the 946 `.IMG`, 180 `.SET`, 340 `.CFA` named by no source | `GLOBAL.BSA` census | `tools/assetcoverage.mjs`, `docs/ASSETS.md` | `[~]` **the census half is done (`5cccb80`)**: every one of the 1 691 unread records is grouped by the module that would consume it, with the five wiring jobs that would show most; the **wiring** is the open half (D-03/D-24, and the owner's "you should port much more from arena" = D-31) | `unit/assetcoverage.test.mjs` + the tool's own run |
| B24 | **`ACD.EXE` — the game's own tables** (the owner's "you need to decompile all of Arena"; the brief's P2) | `arena/ARENA/ACD.EXE` (174 429 B) — the executable `ARENA.BAT` runs. **Measured from the bytes this session** (`node` read of the file): `MZ`, **1** relocation, header **96 B** (6 paragraphs) so the image is 174 333 B, `minAlloc` 9 024 paragraphs, `maxAlloc` 65 535, entry `IP:CS = 100:fff0`, `SS:SP = 2a96:200`; the stub carries `"PKLITE Copr. 1990-91 PKWARE Inc. All Rights Reserved"` at offset 30 (the **pre-1993** PKLITE string, so not the 1.5+ "1990-93" variant), **no** `LZ91` marker, and the tail's entropy is **7.872 bits/byte** over the last 64 KiB — packed, not encrypted | new (`src/arena/pklite.js`, runtime-only) + `src/arena/exeData.js` (anchor-located tables) | `[ ]` **started, nothing unpacked yet.** First probe: the bytes after the copyright string select the variant and give the stub's own length, which is where the compressed stream starts; then the LZ decoder, verified by anchors this repo already trusts (class and race names, "Jagar Tharn", `.MIF` names) **and** by a fact it proved itself (the wilderness thresholds `0x6666/0x4000/0x2666/0x1999`). Doctrine: derived at runtime on the player's machine, cached in memory/IndexedDB, **never committed** (law 6) |
| B23 | **Dungeon depth**: the level below (a wet basement — the original's sewers) and the storeys a tall level implies | the install's `*.MIF` + each level's `*.INF` `*LEVELUP`/`*LEVELDOWN` markers; OpenTESArena's `INFFile` for the marker names | `dungeonPlan.js` (assembly), `mifLevel.js` (markers), `interior.js` (`stairNear`/`useStair`) | `[ ]` **the owner's "dungeons should have a level below like with water (sewers) and some maybe should have one more level above because there are statues that go trough the ceiling"** — a multi-level file is walkable already (`state().level`/`levelCount`); what does not exist is a level *below* an assembled dungeon, and the storey a decoration pokes through | first probe: per dungeon, `levelCount`, each stair's cell, and which levels are wet — then assemble the second level (D-28) |

---

## 3. The owner's comparison, mapped

Every row of the 2026-10-16 report, with the block that owns it. Full rows live in
`docs/DEFECTS.md`; this is the index.

| report | block | status |
|---|---|---|
| "after character creation a cutscene missing … you start in the imperial dungeon" | B15 | **closed this session** — creation → `INTRO.FLC` → `START.MIF` (D-12) |
| "it looks like the version in perfectarena is a mirrored version of that" | B02 | **open** — needs a measurement, not a guess (§5, queue 1) |
| "attack animation is fists … instead in perfectarena is always the dagger" | B06 | closed (D-14b: `HAND.CIF` for empty hands, the class's weapon in the pack) |
| "the pile of loot with a helm is bigger than it should be" | B02 | closed (D-16) |
| "when doors open they clip into the wall" | B04 | closed (D-17) |
| "passing through the water to other rooms like sewers" | B05 | **open** (D-18/D-18a) |
| "resting spawns enemies or moves enemies to you" | B10 | **closed this session** (D-19: `stirTheLevel` + `isHunting`) |
| "ugly battle particles" | B09 | half closed (D-20 removed the invented bursts); blood is the original's own feedback and is still to land in the scene |
| "ENEMIES FLIP LEFT AND RIGHT FOR NO REASON" | B07 | closed (D-25) |
| "there is no fog in dungeons" | B18 | closed (D-21: enclosed levels 0.012 → 0.040) |
| "normal arena has wilderness … you teleport around and cant even get out of a city" | B17 | **open** (D-22, the structural one) |
| "biomes texture changing depending on night or snow" | B18 | **open** (D-23) |
| "a lot of assets missing … and features" | B22 | **open** (D-03/D-24) |
| "shouldn't be able to run with your weapons unsheathed" | B06 | **closed this session** (D-26: the law, and the freeze the landing had made — `2c2b63f`, measured in `movement`) |

### The same owner, later the same day (2026-10-16 evening)

| report | block | status |
|---|---|---|
| "still you cant go out of cities and into the wilderness gates dont work there is no door to bring you to the wilderness" | B17 | **closed this session** (D-27, `baf80ef`: the gate is walked through, and D-32, `dbf4058`: the walk *back in* works — the save's remembered wilderness cell no longer overrides an explicit `?at=` arrival) |
| "dungeons should have a level below like with water (sewers) and some maybe should have one more level above because there are statues that go trough the ceiling" | **B23** (new) | **open** · D-28, first probe named in the ledger |
| "most enemies dont exist or dont spawn" | B11 + B22 | **open** · D-29: three numbers per dungeon (roster size, how many ids this install can draw, the field's real count) |
| "some npcs have enemy sprites like theres a minotaur guy somewhere" | B11 | **open** · D-30: **not reproduced** in Daggerfall, Corinth or a wilderness page (48/48/1 people, every sheet a folk sheet); needs the place, or a sweep of every city × clock × interior |
| "still stuff from arena is missing you should port much more from arena" | B22 | **open** · D-31: the wiring half, group by group in `docs/ASSETS.md`'s order (screens first) |

---

## 4. What this session closed (2026-10-16, part three)

**B17a — the country is inhabited** (`5cccb80`; D-01b, D-02a and the climate row). A wilderness
window's `.INF` names no creature, so the roster was empty, `monsterCountFor` answered 0 and
`populate` emptied the folk list: a player who walked out of a city gate found a land with nobody
and nothing in it. `game/wildernessBestiary.js` is the country's population — per climate and per
hour, weakest-first, every id a creature this install can draw — the scene wires it into
`populate()` (creatures through `spawnEncounter`, travellers through a `dressCrowd` a town's crowd
now shares). The audit, which has been red on the wilderness since it was written, is **green**:
people 0 → 1/1/6 by climate, creatures 0 → 4 on every road, the hour changes what is abroad, and
the three day bestiaries differ (temperate `{rat,goblin}`, desert `{lizardman}`, mountain
`{wolf,snowwolf}`) where all three read `{rat:4}`. Three faults fell out on the way, each named in
the code: a **double window** (this module narrowed what `spawnEncounter` narrows again, so a
six-kind list came out as its own first entry), a **climate read off the `.INF` letter instead of
the place** (`?climate=` does not change a wild window's `.INF`, so every road was temperate), and
**a check that could never pass** (`tests/suites/audit.mjs`'s `beasts.push({ climate, hour: 'day',
...beast })` — the page's own `hour` overwrote the label the check filtered on).

**B22 — the census is a list of names** (`5cccb80`; D-03, D-24). `tools/assetcoverage.mjs` groups
the unread records by consumer, with `--groups`, `--top N`, `--json`, and a pure/live split so a
Node test holds the rules without the install; `docs/ASSETS.md` writes up all **1 691** with the
module each group belongs to and the five wiring jobs worth doing first.

**B09 — half: blood, not sparks** (`5cccb80`). `combatFx.blood()` carries the one blood red and is
what a landed blow leaves now; `game/bloodEffect.js` turns a blow into the engine's own decal
records. The **decal pass itself is still unwired** — see the queue.

## 4a. What the previous pass closed (2026-10-16, part two)

**B15 — the start of a game.** `game/startFlow.js` (new) holds the law: which URL is a game
start (`isGameStart`), where creation hands the player on (`destinationParams`: a character made
*just now* wakes in `START.MIF`; anyone else still lands on the world map), and when the opening
movie is owed (`openingGate`: **once per new game, not once per tab** — the session flag alone was
the reported missing cutscene). `main.js` and `scenes/newGame.js` both follow it, and the New Game
path now plays `INTRO.FLC` before booting the dungeon. Seen on real pages: `chargen` 41/41 (the
dungeon it lands in is `START.MIF`, with the cell door and the escape objective),
`menu` (New Game → creation → the Imperial Dungeons, the opening reported as played or honestly
skipped). `tests/unit/startflow.test.mjs` holds the law.

**B10 — a sleep in a dungeon is heard.** `encounters.js` gained `stirTheLevel` (a camp rouses
every living creature with a deadline, `spawn.huntingUntil`, and a corpse hears nothing) and
`isHunting` (a creature's own band, **or** a hunt it heard, from anywhere in the level);
`interior.js`'s camp rest uses them, and a disturbed sleep passes the day without handing back the
wounds — the player did not get the sleep they paid a day for. The original's own roll (chance,
hours, wake-up call) is `A.EXE`'s and is stamped as this project's rule in the module header.
`tests/unit/hunt.test.mjs` holds it, and the player's half is held on a real page by
`dungeonplay` (10/10): walking to a cell no creature can see, pressing the real `R`, and reading
back `state().lastRest` — *"Something in the dark heard you sleep. 6 of them are coming."* with
health **not** restored — while the same suite still proves the calm half (a cleared level heals
and passes the day: "You make camp and rest.").

---

## 5. The queue — what the next sessions take, in order

Each entry names **the first probe**, because a block starts with a measurement.

0. **B23 · dungeon depth — the level below with water in it** (D-28, the owner's evening report).
   First probe: per shipped dungeon, `levelCount`, each stair's cell and which levels are wet; then
   assemble the second level the way the original's own second level reads. The owner's own words
   are the acceptance test.
0a. ~~D-27's reverse walk + D-32~~ **CLOSED (`dbf4058`)**. The probe ran and answered, and the
   answer was neither of the two causes first written here: the country *did* recognize the gate
   and the push *did* cross — the boot let the save's remembered wilderness cell override the
   explicit `?at=` arrival (`interior.js`'s `rememberedWild` guarded only on `!location=`, which
   `crossGate` keeps), so the crossing rebuilt the **country** at the cell the player had left from.
   `movement` **11/11** holds both halves: a bare `location` opens the country on the remembered
   cell, `?at=` lands in the city. **One cause still open on that row**: `GATE_WALK_REACH` (3.2 m)
   and `GATE_STEP` (3 cells = 7.5 m) disagree — the crossing arrives 7.5 m out, so the walk back has
   to be walked 4 m first, where Arena's own gate puts the player in the opening.
1. **B02 · is the start dungeon mirrored?** (D-13.) Probe: render `START.MIF`'s cell grid as
   text (`tools/mif-dump.mjs`, `tools/lib/mapascii.mjs`) and compare it against the original's
   own screen — the cell door, the stair (`GATE.IMG`), the room the arrival point is in, and the
   direction the player faces on arrival. A mirror can only come from `mifMesh`'s x/z mapping,
   the camera's handedness, or the arrival yaw; whichever it is, it is one line and one test.
   *Then* walk the same probe over the eight quest dungeons and the palace, which the owner
   reports as "all glitched".
2. **B05 · water you can pass through** (D-18/D-18a). Probe: per level, count flooded cells that
   separate two otherwise-disjoint walkable regions (`tools/mif-dump.mjs` + a BFS). If a level
   *needs* the water to get anywhere, that is the original's swimming and this port's blocked
   wall; the block then ports `ArenaChasmUtils.allowsSwimming` properly (enter the water, swim,
   climb out) instead of the current wade.
3. ~~**B06 · a drawn weapon is a walk — measure it.**~~ **CLOSED this session (`2c2b63f`)**, and
   it closed a defect the landing itself had made: `inputOf` is module-level and read the rig out
   of `bootInterior`'s scope, so **holding Shift threw `ReferenceError` out of `step()`, left
   `frame()` before its own `requestAnimationFrame`, and killed the page** — for a whole session,
   under nineteen green suites, because **no suite had ever held a movement key**. The law is
   `canRunUnlessDrawn(drawn)` and the builder takes it as a parameter; the new **`movement`** suite
   holds every key the loop can hear (frame counter read *during* the hold) and measures the
   stride: walk 1.86 m/s → sprint 3.08 → sprint with the blade out 1.86, the sprint returning when
   the rig sheathes. The same suite walks through the city gate (D-27, `baf80ef`).
3a. **B09 · the blood's decal half.** `combatFx.blood()` and `game/bloodEffect.js` are landed and
   turn a blow into the engine's own decal records; **the pass that draws them is not wired** —
   `renderer.js`'s `createDecalBatch`/`place`/`writeDecalSlot`/`drawDecals` are the seam and
   `engine/combat/bloodArt.js` holds the texture. Probe first: what a landed blow leaves on the
   floor and the walls in the Arena scene, and where `bloodEffect`'s records go today (they are
   produced and never read — the same shape as D-26 and it would be the third time this session's
   work was wired at one end only).
3b. **B23 · dungeon depth** (D-28, new this session): a level below — the original's wet sewers —
   and the storey a tall decoration pokes through. Probe: per dungeon, `levelCount`, each stair's
   cell, and which levels are wet; then assemble the second level the way the original's own
   second level reads. The owner's own words are the acceptance test.

## 4b. What this session closed (2026-10-16, part four)

**B06 · the stride, and the page it killed** (`2c2b63f`; D-26). The run gate landed last session
read `weaponRig.drawn` from a module-level function while the rig lives inside `bootInterior`: with
a sprint key held the builder threw, `step()` propagated it out of `frame()`, and the page stopped
for good (`painted` frozen, every later measurement 0.00 m). Found by writing the check the queue
itself asked for — a page that holds each movement key and reads the frame counter **while it is
down** — which is also the suite that now proves the law: `movement`, walk 1.86 m/s → sprint 3.08 →
sprint with the blade out 1.86. `tests/unit/stride.test.mjs` holds the law and the scope.

**The gate is a door you walk through** (`baf80ef`; D-27, the owner's evening report). The gate
existed, `E` crossed it, and the crossing was invisible to a player because the wall's one opening
holds the gateway as a **solid** voxel: walking at it stopped you. `maybeWalkThroughGate` crosses on
the push — aimed at the gateway, within a cell of it, either direction, once per crossing. Measured
on `CITYW2` and `CITY2`: walking at the opening leaves the city on foot with no keypress, and a
stride along the wall does not. **The walk back in from the country works (`dbf4058`)**; that
is the row's next task.
4. **B09 · blood, not sparks.** The engine already has `engine/combat/bloodDecals.js` (lands in
   the Daggerfall side). Probe: what a landed blow leaves on the floor and on the walls in the
   Arena scene; then wire the decals into `combatFx`, and delete any remaining invented burst.
5. **B17 · the country** (D-22, P3/P4). The largest block: leave a city gate on foot, walk a
   continuous Tamriel (relief, coast, roads, per-climate terrain), meet people (D-01b) and
   creatures (D-02a) there, and enter wild buildings.
6. **B18 · weather that moves and a ground that knows the season** (D-23): the front, the
   per-climate ground mix, snow on the ground, and the night/snow variants of city art.
7. **B22 · asset coverage** (D-03/D-24, and the owner's "you should port much more from arena" =
   D-31): the 1 691 BSA records named by nothing are where the missing screens, tilesets, crowd
   sheets and speech live. The census is done; this is the wiring, one group per session in
   `docs/ASSETS.md`'s own order, screens first (they are what a player meets before anything else).
8. **B11 · "most enemies dont exist or dont spawn"** (D-29, the owner's evening report). First
   probe: per shipped dungeon, the `.INF` roster size, how many of those ids this install can draw
   (a missing `.CFA` drops the creature silently — `loadSpriteSet` → null), and the count the page
   really fields. Three numbers, and they tell the three causes apart.
9. **B11 · "some npcs have enemy sprites (a minotaur guy)"** (D-30). First probe: sweep every
   city (each `CITY*`/`TOWN*`/`VILLAGE*` skeleton × a clock) and every interior for a person whose
   sheet is outside the folk namespaces, and for a **creature** standing on a settlement's own
   cells. Daggerfall, Corinth and one wilderness page came back clean, so the next probe has to be
   the sweep — or the owner's own place name, which would settle it in one run.

---

## 6. Keeping this file honest

* A block's state changes **only** with the check that holds it. "Working on it" is not a state
  in this table; `[~]` requires a named gap in the same cell.
* Dependencies are real: B05 cannot be settled before B02 (a flooded cell you cannot walk to is
  not a route), B17 needs B11's wilderness people and creatures, B18's ground needs B17's
  terrain.
* When a block's number comes from `A.EXE`, the module header says so. `docs/DECISIONS.md` D11
  is the standing rule.
