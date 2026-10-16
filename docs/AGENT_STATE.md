# AGENT_STATE (updated 2026-10-17, fifteenth pass)

THIS PASS, IN ONE LINE: **the town's people are drawn from their own art.** The owner's two NPC reports
(*"some Npcs are not setted up well and they dont have a proper 360 walking animation"*) were probed off
the archive itself (`.scratch/peopleProbe.mjs`) and answered in halves: the **360° turn is there and is
measured** (every person drawn from one of the five angles, and the eye walking round one reads
`11BARWLK.CFA` view 1 → `15BARWLK.CFA` view 5), the **commoners can only face one way because Arena's
own art gives them one angle** (the five-angle families are the armoured roster, the watch and `BABE`),
and the half that *was* a defect is now fixed: `actorFrame` read the layout off the **actor**, so every
person who is not a monster was given **every frame of their sheet as a stride** — a walking **guard
played its own head-turn (6/7) and its sword-swing (8–11)**, on the street. The layout is a property of
the **art** now (`peopleKinds.js`'s `layout`, `townsfolk.js` carrying it onto the person,
`actorAnimation`'s `walkFrames`, clamped to the sheet). This pass also repaired a check nobody owned
(**D-10b**: the panel's third heading shape, *`Bathi — a person in a habit`*, now admitted by a
regular expression built from the modules' own vocabulary) and wrote the owner's remaining list into the
queue as items **0h…0m**, each with its first probe.

LAST GREEN (this pass): unit **`554/554`, exit 0`** (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm test`)
— two new checks (`unit/actoranimation.test.mjs`: the stride of a twelve-frame sheet visits 0…5 and
never 6+; `unit/peoplekinds.test.mjs`: the layout is read from the family and matches the frames the
install ships, twelve-frame views against 6/9-frame actions). Browser: **`townsfolk` + `city` 97/97**,
including the new page check *and the watch walks on its walk frames, not on its head-turn or its
sword-swing* (six samples of a peaceful street, 44 batches drawn, no layout sheet past frame 5) and the
repaired heading check. **The suites that were not re-run**: `worldmap`, `world`, `generated`,
`dungeonplay`, `living`, `doors`, `movement`, `persist`, `audit`, `regard`, `guilds`, `gear`, `combat`,
`actioncombat`, `mainquest`, `progression`, `cutscene`, `bounties`, `exe`, `menu`, `chargen`,
`scenevisuals`, `sky`, `commerce`, `story`, `testmap` (`interior.js`, `townsfolk.js`, `peopleKinds.js`
and `actorAnimation.js` changed, so `living`/`world`/`audit` are the next re-runs — all four files are on
their paths).

THIS PASS, IN ONE LINE (fourteenth): **the world keeps the hour.** Queue item **0e** (B19 · a persistent world) was
probed rather than guessed at, and the probe found exactly one thing that did not survive a change of
place: `game/worldState.js` has carried `clock` since it was written and **nothing ever wrote it**, so
`__debug.worldMemory().clock` read `null` on every page this project has measured and every gate, stair,
shop door, fast travel, wilderness slide and reload put the player back at ten in the morning.
**Closed for the clock half** (§4j): `setWorldClock`/`worldClock` in `game/worldState.js` (one
`foldClock` law — minutes fold into a day, a day is at least one, a record that is not numbers is no
clock; `plainClock` comes through the same fold), and four small edits in `scenes/interior.js` — the
arrival hour is the world's unless `?clock=` forces one, the calendar's day is
`max(radiant.day, world day)`, and `rememberClock()` writes the world on **every** place change
(`goInPlace`, before the new scene is built), on the saves the world already makes (a door, a kill) and
on a 20-second tick. Two older laws shaped it: **an explicit arrival beats memory** (D-32 — a forced
`?clock=` page never writes the world, and the parameter is dropped from a transition's URL, or a
session that began at 23:00 would be pinned there for ever) and **a probe must not corrupt what it
measures** (`living` and `audit` drive the shutters and the sky with `?clock=`). **New suite `persist`**
holds the claim: a full page load of the country's own URL — no `?clock=` anywhere in it — comes back at
**22:10** rather than at **600**. **What is left of B19 is the other half of the row**: a place change is
still a full scene re-boot (the level, the crowd, the creatures and the light rebuilt from the save,
never carried), so **D-05 stays OPEN for that**, with its next first probe named in §4j.

LAST GREEN (this pass): unit **`552/552`, exit 0`** (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm test`)
— four new checks in `unit/worldstate.test.mjs` (the fold, the floor, a record that is not numbers, and
the setter, the reader, the summary and `parseWorld` agreeing). Browser, each suite on its own run:
**`persist` 12/12** (new — the hour across a real walk out of the city's own gate, a tab closed and
reopened, and the next place); **`living` + `doors` + `movement` 90/90** (the clock, the shutters, the
sky, the buildings and the gate — `living`'s *the player arrives at ten in the morning* is still green
and was **not touched**); **`worldmap` 52/52** (the suite that takes the third kind of transition —
fast travel from the map, which is `goInPlace` too); **`audit` 26/26**. **The suites that were not
re-run**: `world`, `generated`, `dungeonplay`, `city`, `townsfolk`, `regard`, `guilds`, `gear`,
`combat`, `actioncombat`, `mainquest`, `progression`, `cutscene`, `bounties`, `exe`, `menu`,
`chargen`, `scenevisuals`, `sky`, `commerce`, `story`, `testmap`. `interior.js` changed, so the next
pass's first re-runs are `world` (it boots places by name) and `generated`/`dungeonplay` (dungeons,
whose hour now arrives from the world rather than from a default).

PREVIOUS PASS (thirteenth), IN ONE LINE: the owner's list of province looks and province people is one law —
**`src/game/provinceStyle.js`**: each place now has a **ground** and an **architecture** that may
differ (Morrowind is desert country built of the mountain's style, Elsweyr and the Summerset Isles are
temperate country built of the desert's, Skyrim is a latitude mix, Sentinel is desert, Winterhold
never stops snowing), its people are **named from its province's own race bank first**, and — because
his second report was exactly right — a settlement now keeps its architecture's walls and **lays its
country's floors under them** (`infFile.withGroundFloors`, five floor entries of 59 per city INF;
the map card says both readings). Four NPC reports and the volcano are their own rows with first
probes (D-42…D-46), and the persistent world stays queue item **0e**.

LAST GREEN (this pass): unit **`548/548`, exit 0** (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm
test`) — nine new checks in `unit/provincestyle.test.mjs` (the law, the pools, the merges, the
install's own readings) plus one in `unit/worldmap.test.mjs`; browser **`worldmap` 52/52** (the
province pairs, the merged floors, the snow, and the card's own words) — **only that suite was
re-run**, and `world`, `audit`, `dungeonplay`, `movement`, `city`, `scenevisuals`, `sky` and
`townsfolk` are the ones the next pass should take first (the world model, `interior.js` and the map
scene all changed). Previous pass in this file's own record: twelfth, D-38 + D-39.

THIS PASS, IN ONE LINE: the owner's *"the biomes … are completely different … they seem to be swapped
like blackmarsh has nord architecture the imperial city is in the desert instead of temperate"* was
one table — and measuring it found the province the game **begins** in had one named place and
thirty-one empty records. Both are closed (D-38, D-39, `docs/PORT_BLOCKS.md` §4h); a third thing the
checking turned up is **open** and is Arena's own data (D-40: `CITYDATA.64` repeats `Glenpoint` and
`Riverbridge` across provinces, so a name is not a world address). The queue's new items **0c** (the
later lore's own arrival words for Cyrodiil), **0d** (D-40) and **0e** (**B19 · a persistent world** —
the owner's *"there is no persistency in the world like instead there is in daggerfall enhanced"*,
with its first probe named) are what this pass hands on.

PHASE: **P0 done, P1 in progress** (session brief §8). The owner played the port beside the real
Arena on 2026-10-16 and reported two lists; they are written up as **D-12 … D-31 in
`docs/DEFECTS.md` with their own sections** and are the work list. **D-01a, D-01b, D-02a, D-12,
D-14b, D-15, D-16, D-17, D-19, D-20, D-21, D-25, D-26, D-30 and D-34 are closed, D-27 is closed for
the both directions** (walking out, and back in — `dbf4058`), **D-38 and D-39 are closed this pass**
(the terrain classes and the fail-safe sampling; the Imperial Province's 31 placeholders — §4h),
**D-40 is open** and is Arena's own repeated names, and **D-29 is half closed** (the
*exist* half: the Minotaur is drawable — `a9aa3a6`; the *spawn* half is queue item 8). **This pass
(fourteenth) closed B19's clock half** — the persistent world keeps its own hour across a place change,
a reload and a tab — and **D-05 stays open** for the other half of the same row (a place change is
still a full scene re-boot), with the row, the law, the measurements and the next probe as §4j. Both reports
ask for the port to advance in **blocks** rather than symptom by symptom: `docs/PORT_BLOCKS.md` is
that work order — **23** system-level blocks with their source of truth, their module, the check
that holds them, the reports mapped onto them, and the ordered queue with each block's first probe.
**Take blocks from its §5; a block is closed by the six rules in its §1.**

LAST GREEN (this pass, twelfth): unit **`538/538`, exit 0** (`ARENA_PATH=C:/ArenaProject/arena/ARENA
npm test`) — **twenty** new checks in a file that did not exist (`tests/unit/worldmap.test.mjs`, which
`docs/PORT_BLOCKS.md` had been listing as B16's own check since the ledger was written), and **one
restatement** the fix owed: `unit/radiant.test.mjs`'s "the install has 31 nameless city slots" is now
"the install ships 31 nameless settlement slots **and the world places every one of them**" — the law
it guards (a delivery never names an empty target) is unchanged and now has no anonymous entry to trip
over. Browser: **`worldmap` 44/44** green against a real page — its old 38 checks (the game's own art,
the two levels, the blink, the journey to Daggerfall) plus **six** for D-38/D-39: Anvil is a place the
map can name, it is not on the province's corner, its travel URL is real, it **boots the city it
names** (`citySeed 1048696`, `city {inf: MCN.INF, blocks: 30, cells: 12 000, missing: 0}`, no boot error,
no page errors), its city is built of its own climate's `MC*` textures, and it offers **no invented
arrival greeting** where Arena's `CITYTXT` has none for that province. **The suites that were not
re-run this pass**: `world`, `audit`, `dungeonplay`, `movement`, `interior`, `city`, `testmap`,
`chargen`, `menu`, `mainquest`, `story`, `combat`, `actioncombat`, `doors`, `gear`, `generated`,
`hunt`, `commerce`, `guilds`, `regard`, `radiant`, `living`, `townsfolk`, `scenevisuals`, `sky`,
`cutscene`, `progression`, `bounties`, `exe`. The world model changed, so the next pass's first
re-runs are `world` and `audit` (both boot places by name) — nothing else in this pass touched
`interior.js`. Pass before this one: unit **`518/518`, exit 0** (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm
test`) — sixteen new checks, `unit/exetables.test.mjs` **8/8** and `unit/monsterart.test.mjs` **9/9**,
plus the three restatements the fix owed (`unit/combat`, `unit/peoplekinds`, `unit/wildernessbestiary`).
Browser: the **`exe` suite 14/14** — every table the executable holds read **in a page** from the
player's own copy, the creature-art join, and a real Minotaur spawned there; **`audit` 23/23** (the
wilderness still fields `{rat,goblin}` / `{lizardman}` / `{wolf,snowwolf}` by climate and the
Minotaur is back in the `.INF` roster line); **`world` + `townsfolk` + `living` 123/123**;
**`actioncombat` 23/23**; **`dungeonplay` 20/20**; **`combat` 37/37**. The twenty-one other browser
suites were **not** re-run (nothing they cover was touched — `chargen`, `menu`, `mainquest`, `doors`,
`gear`, `generated`, `hunt`, `commerce`, `guilds`, `regard`, `radiant`, `story`, `cutscene`,
`scenevisuals`, `sky`, `movement`, `wildfoot`'s unit face, `interior`, `city`, `worldmap`, `testmap`).
Previous pass: unit **`482/482`**, browser the **new `exe` suite 8/8** — the game's
own `ACD.EXE` read from the install and unpacked **in the page**, with the four structural numbers
and Arena's own words read back. The pass before: unit **`476/476`**, browser **`dungeonplay` 20/20**
(17 of them one walk: a dev-door dungeon → its own stair → the country at the ruin its seed picks →
`E` back down, plus the opening dungeon → the country outside Riverhold) · **`mainquest` 62/62** ·
**`movement` 11/11** · **`world` 28/28**. Previous pass's record: unit **`469/469`, exit 0** — seven
new checks, `unit/stride.test.mjs`. Browser: **`movement` 11/11** (new then: every movement key
held leaves the frame counter climbing, the stride measured, the city gate walked through) ·
`world` + `living` + `audit` **88/88** · `world` + `dungeonplay` + `combat` **75/75** (and, after
D-32's fix, unit **469/469** and `movement` **11/11** re-run on the fixed tree). The full
nineteen-suite sweep has **not** been run this pass, and `chargen`/`menu` were not re-run (nothing
touched creation). Earlier browser runs, for the record:
**`audit` 51/51 — the audit is green for the first time** (it has been red on the wilderness since
it was written) · `world` **28/28** · `combat` + `actioncombat` **82/82** · `chargen` **41/41** ·
`menu` · `dungeonplay` **10/10** (the camp the level hears).

IN PROGRESS: nothing half-edited. **The executable is open *and read*** (block B24):
`src/arena/pklite.js` (the unpacker), `src/arena/exeTables.js` (**the tables** — new this pass),
`src/game/monsterArt.js` (the creature-art join, new) and `src/arena/exeData.js` (the runtime read)
are the modules; `interior.js`'s `exe()` seam reports the structure, the tables, the art audit and
the `.INF` slot audit; `tests/suites/exe.mjs` (**14/14**) holds it in a page. **The eleventh pass took the country instead**
(`docs/PORT_BLOCKS.md` §4g: the exit's door, and the bearing a window slide must not steal) because
the owner's report is the louder signal and always has been — §5 items **0a**/**0b** (the executable's
read-but-unwired tables, and its numeric ones) are still the first *quiet* items, with the country's
named gaps (§4g's own list: no landmarks, no roads, a ruin nothing points at, a slide that is still a
scene re-boot) the loud ones.

WHAT THIS PASS PROVED (twelfth pass, 2026-10-16 part nine — **the biomes, and the province that was
empty**; `docs/PORT_BLOCKS.md` §4h; the owner's *"the biomes, biome backgrounds and buildings texture
and architecture are completely different … they seem to be swapped like blackmarsh has nord
architecture the imperial city is in the desert instead of temperate"*):
* **D-38 — the biome complaint was one table, and it was ours, not Arena's.** `game/worldMap.js` had
  **249/250 temperate, 251/252 mountain, 253/254 desert**; the game's own classes are **249/250
  `MOUNTAIN`, 251/254 `TEMPERATE`, 252/253 `DESERT`** (OpenTESArena's `WorldMapTerrain` constants and
  `toClimateType`). A settlement's climate comes from `TERRAIN.IMG` through that table, and the
  climate picks the city `.INF` it is textured from, its wilderness `.INF`, its creatures and its
  sky — so one pair of numbers moved every biome a province over, which is exactly what the owner
  saw. The *sampling* was wrong in the same function: `getFailSafeAt` reads **every** sample twelve
  pixels to the left (a **linear-index** shift that wraps around the 320×200 buffer) and, when that
  is still sea, walks **below → above → right → left** outward, giving up at **254**; this project
  sampled the point itself, shifted only when it was sea, and answered the sea constant otherwise.
* **The reading, over the whole install**: **288 settlements — 91 mountain, 129 temperate, 68 desert,
  none sampling sea** (the fail-safe's guarantee); High Rock **two** temperate — **Daggerfall** and
  **Reich Gradkeep** — and thirty mountain, against UESP's *"warmer forests in the southwest around
  Daggerfall"*; Valenwood's mountains exactly **Arenthia, Thormar Keep, Ebon Ro**, against UESP's
  *"mountains in the north around Arenthia"*; Skyrim **32/32 mountain**; Elsweyr **all 32 temperate**
  (UESP: *"completely devoid of desert biome"* — the reported swap); the **Imperial City temperate at
  the game's own pixel 254**. In a page, **Anvil's city is built of `MCN.INF`** — the reading reaching
  the visible architecture.
* **D-39 — the province the game begins in had one place in it.** `CITYDATA.64` names every settlement
  of eight provinces and **one** of the Imperial Province's (**the Imperial City**); the other 31 are
  all-zero placeholders (no name, local (0,0), visibility 0). Read as places, they were **one** place
  four times over: **one pixel** (the rectangle's corner, (107,61) — 31 markers stacked, thirty
  unselectable), **one city seed** (0 — `citySeed` *is* the packed local point) and **one country**
  (0 — `wildernessSeed` is the name's first four letters), an **empty string** for the map's label,
  the marker card's title and the save's remembered place, and `?location=` **with nothing in it** for
  fast travel. New **`src/game/cyrodiil.js`** fills all 31 from the **later** games' Cyrodiil — the
  owner's own rule for Tamriel lore, and here Arena cannot disagree because it wrote nothing:
  **Anvil, Bruma, Bravil, Cheydinhal, Chorrol, Leyawiin, Skingrad** in the seven free city-state slots,
  **Kvatch** as a town (the city the Oblivion Crisis burned), eight towns (with **Vlastarus** and
  **Sutch**) and sixteen villages from Oblivion's own list. Names and kinds are the later games'
  (UESP: Oblivion:Settlements, Lore:Sutch, Online:Vlastarus, Online:Cyrodiil); directions are UESP's
  own words; **the pixel is this project's own**, because nothing in Arena's install has a coordinate
  for a place it never had — each entry carries a fraction of the province rectangle that
  `localPointOf` turns into the `local` point a record carries. The file's own record is untouched,
  and a placeholder the table cannot place is **not a place** (dropped, with a warning).
* **Measured after**: 288 settlements, **32 per province**, no province drawing two of its own on one
  pixel, **31 placed**, and a filled record booting a real city **in a page**: `?location=Anvil` →
  `citySeed 1048696`, `city {inf: MCN.INF, blocks: 30, cells: 12 000, missing: 0}`, empty `pageErrors`
  (Kvatch `CITY2.MIF`/`TCN.INF`, coastal Leyawiin `CITYW2.MIF`, desert Sutch `DCN.INF`).
* **Named gap on the row, measured**: a filled city arrives with **no greeting**, because Arena's
  `CITYTXT` holds **64** greetings — eight provinces × eight city slots — and **none for the Imperial
  Province**, not even for the Imperial City (`cityTextKey(8, 0..7)` absent). This project will not
  invent prose it did not read, so nothing is shown and the browser suite pins that. Queue item **0c**.
* **D-40, found while checking the above and left open because it is Arena's own data**: `CITYDATA.64`
  repeats **`Glenpoint`** (High Rock 52,71 and Valenwood 118,141) and **`Riverbridge`** (Morrowind
  226,84 and Black Marsh 253,133); `byName` — and therefore `?location=` — answers the first, so the
  second of each pair cannot be reached by name. Queue item **0d**.
* **Held by**: `tests/unit/worldmap.test.mjs` **20/20** (new, and `docs/PORT_BLOCKS.md` had listed
  `unit/worldmap` as B16's check all along) plus the `worldmap` browser suite **44/44** (6 new), with
  `unit/radiant.test.mjs` restated rather than weakened.

WHAT THIS PASS PROVED (eleventh pass, 2026-10-16 part eight — **the country you walk**;
`docs/PORT_BLOCKS.md` §4g; the owner's two reports *"you exit a building not a png with a dungeon
entrace like normal arena"* and *"you dont understand where you are going"*):
* **The exit's own arrival was the centre of a 64×64 block** — 4 096 cells of country. Measured on
  Daggerfall's wilderness with Stonekeep's seed: ruin block (26, 9), centre **(1696, 608)**, the
  player in open ground with their way back down out of sight, and the nearest wall of that ruin
  **12 cells west** at (1696, 596). A block's centre is not a door however it is drawn.
* **`game/dungeonSurface.js`'s `ruinDoorStand` is the rule** (pure, no I/O): the door is the ruin's
  own **arch** (the `0x9` voxel every `.INF` reads a gate with) nearest the centre, or the built cell
  nearest it (`arch` says which); the stand is two or three cells out along the **open side**
  (`HORIZON = 24` cells measured per axis — least ruin first, then the longest run, because a
  courtyard is open at the door and full of building beyond it); and the facing looks back at the
  door. `interior.js`'s `standAtRuinDoor` wires it to the loaded window and is skipped for any page
  that names its own cell.
* **Measured after** (same URL, in a page): door **(1696, 596)**, stand **(1699, 596)**, player on it
  (`state().wild.ruin.atDoor: true`), yaw **−1.571** = straight at the door, `arch: false`.
* **The window slide stole the compass.** Walking across the boundary on **yaw 0.35** came back
  **0.00**: the slide boots a page in place for the ground the player is already standing on, and
  `?yaw=` was a parameter **nothing read** (`params.has('yaw')` only ever suppressed the boot's own
  `openYaw`). The slide's URL now carries `&yaw=<cam.yaw>` and the boot applies it — **measured
  0.35 → 0.350**, cell (1703, 608) continuous across origin (1664, 512) → (1664, 576).
* **Held by**: `unit/dungeonsurface.test.mjs` **11/11** (four new checks) and the `audit` suite's new
  **S-E** (3 checks: the door and the stand, the facing, and the slide's bearing + ground).
* **Named gaps, untouched:** the country still has no landmarks and no roads (D-22), a ruin nothing
  points at is still inert scenery, and the slide is still a full scene re-boot (B19/D-05) — the
  measurements to start each are in §4g.

WHAT THE PASS BEFORE PROVED (tenth pass, 2026-10-16 part seven — **the executable's tables, read and
used**; `docs/PORT_BLOCKS.md` §4f):
* **Thirty of the game's own tables are read out of the code image** (`a9aa3a6`,
  `src/arena/exeTables.js`): the creature roster and the sheets each creature is drawn from, the
  commoners' families, the player's animation templates, the creature voices, the eighteen classes,
  the eight attributes, the races twice, the eight provinces, **all sixty-four settlements**, the
  eight capitals, the sixteen named dungeons, the settlement block kinds, the calendar (twelve
  months, seven weekdays, fifteen holidays, seven times of day), the noble ranks, the gem table, the
  artifacts, the spell effects, the status words, the travel menu, and the level markers `mifLevel.js`
  itself resolves. **A table is found by its own words** — an anchor of consecutive entries plus the
  spelling of its own entries — so **no offset is committed** and the floppy release's `A.EXE` reads
  the same way (law 6 kept: nothing derived is stored).
* **The Minotaur's art, and the two defects that were one mistake.** `monsters.js` carried the
  Minotaur with `sprite: null` ("this install ships no `MINO*.CFA`"), so it was dropped from every
  roster that filters on art — D-29's *exist* half — while `peopleKinds.js` handed the archive's
  `PAT1.CFA`…`PAT6.CFA` to the **town crowd** as a person's walk, which is D-30's *"minotaur guy"*
  standing in a street. **`pat` is the Minotaur**: the executable's creature-name run (23) and
  creature-sheet run (24) pair index by index, 21 by spelling, and index seven is `Minotaur` /
  `pat@.cfa` — the only pair with nothing behind it; the `.INF` monster slots (`32`…`54`) come out in
  the executable's creature order **23 of 23** with the Minotaur at `39`; and `PAT`'s sheets carry
  `12, 8, 8, 8, 8, 3` frames, the shape 21 of the 23 creatures carry and no person's do (the rat is
  the honest exception — it wears the person shape, which is why the tables decide and the
  fingerprint only corroborates).
* **Measured, on real pages and against the install** (`exe` 14/14): the tables read in a page from
  the player's own `ACD.EXE`; `__debug.spawnMonster('minotaur')` answered **`null`** before the fix
  and answers `{name: 'Minotaur', file: 'PAT1.CFA'}` with all six sheets loaded now; the audit's
  dungeon line prints `…, skeleton, minotaur, spider, …` where the id used to be filtered out.
* **`D-30` closed, `D-29` half closed**, and both rows in `docs/DEFECTS.md` say which half. Three
  test files were **restated** (not loosened) where they had pinned the old law:
  `monsterReport().spriteless` is `[]` (was `['Minotaur']`), `spriteFile(Minotaur)` is `PAT1.CFA`
  (was `null`), and `peopleKinds` reads **thirteen** families (was fourteen) with no `PAT` kind.
* **Named gap:** only the **string** tables are read; the image's numeric blocks (the byte rows
  behind the holidays, the word ladder after the noble ranks, the creature stat rows, the spawn
  tables B10/B11 have been calling *this project's own rule*) are §5 item **0b**, and the tables
  that are read but wired to nothing (calendar, settlements, class/race prose) are item **0a**.

WHAT THIS PASS PROVED (ninth pass, 2026-10-16 part six — **`ACD.EXE` unpacked**; `docs/PORT_BLOCKS.md` §4e):
* **The game's own executable is readable, in the page, from the player's own copy** (`fb8fa77`).
  `ARENA.BAT`
  runs `ACD` (not `A.EXE`), so the 174 429-byte `ACD.EXE` **is** the game, packed with **PKLITE 1.12
  registered, "extra" + "large"** (offset 28 `0x0C` = minor 12; offset 29 `0x31` = major 1 with the
  `0x10`/`0x20` flags; string at 30 — which corrects the previous pass's off-by-one reading of that
  pair). The previous pass planned to disassemble the stub to find the stream offset; the published
  format's own table gives **656** for that version pair and the image starts at 96, so the stream is
  at **752** — exactly where the file's byte entropy stops being stub-like. One table, one number,
  both checkable against the bytes.
* **What came out** (`src/arena/pklite.js`): a **305 520-byte code image** (19 095 whole paragraphs),
  **4 044 relocations**, footer `SS=19087 SP=128 CS=0 IP=0`, the relocation table ending at
  **174 421 = the file's end − 8** (on the footer), 33 ms, no warnings. Four checks a one-bit desync
  cannot pass, all green: the image is whole paragraphs; `SS×16+SP = 305 520` = the image's length;
  the entry the footer names is the image's **first byte** (`mov dx,3BA0h / mov ah,30h / int 21h`);
  and every relocation segment is a multiple of `0x0fff`.
* **It is this game**: `to select your class?` @220304, `the world of Tamriel, home of the Arena…`
  @221192, `Imperial Province` @235528, `Khajiit` @251849, `Redguard` @255313, `Nord` @255323,
  `wild.mif` @249113 — and the **wilderness draws' thresholds as words** (`0x6666` ×71, `0x4000` ×235,
  `0x2666` ×73, `0x1999` ×3), the first independent confirmation `game/wilderness.js`'s
  `CATEGORY_THRESHOLDS` has ever had.
* **Held where it will run**: `unit/pklite.test.mjs` **6/6** (including the refusal path — a
  non-PKLITE file is refused by name, not decoded into nonsense) and the new **`exe` suite 8/8**,
  which produces every number above *in a browser page, from the player's own install*. Doctrine
  kept: nothing derived is committed; the image is read at runtime and kept for the page's life.
* **A test bug worth the note**: the first run of `unit/pklite.test.mjs` failed twice on my own
  expectations, not the decoder — `PKLITE_NOT_ENOUGH_MEMORY` is in the *stub* (packed), not the code
  image, and the version label renders the minor byte as **decimal** (`0x0c` → `1.12`, `0x99` →
  `2.153`). Both were fixed in the test, which is where they belonged.

WHAT THIS PASS PROVED (eighth pass, 2026-10-16 part five — D-34, and `docs/PORT_BLOCKS.md` §4c):
* **D-34 — a dungeon's way out is the country, not the map.** The owner: *"STILL EXITING A DUNGEON
  JUST SHOWS YOU THE MAP NOT THE FUCKING WILDERNESS"*. The exit called `openWorldMap()` for
  anything without a back door, defended by the comment *"the world map is the surface"* — it is
  not, and the port had no rule for where a dungeon's door is (it never needed one: the only exit
  it had ever served was the one walked into from the country, which used D-32's memory). New
  **`src/game/dungeonSurface.js`**: the country is the wilderness of the settlement **nearest the
  dungeon's world-map pixel** (the fast-travel rule; the palace skipped — no wilderness seed), the
  door is a **ruin block** of that country's drawn grid (22 of 66 scenery blocks classify as ruins),
  and which ruin is **one draw from the dungeon's own seed** (`ArenaRandom`, the grid's own
  `(next() & 0xff) % list.length` habit) — the same, deterministic answer every time, so a player can
  walk back in. `leaveThePlace` boots that country (`?location=&wild&wildseed=&ruin=`, `crossGate`'s
  twin), the country page stands the player at the ruin (`state().wild.ruin`), and `E` there goes
  back down by seed (`enterRuin`). The **opening dungeon** (`START.MIF` — no `CITYDATA` record, and
  the *first* exit a player ever takes) uses the Imperial Palace's own marker at the continent's
  centre (`OPENING_DUNGEON_POINT`), stamped as this project's rule (`A.EXE` holds the original's).
  Measured on real pages (`dungeonplay` 20/20): `?dungeon=Stonekeep` (seed 3969902143) + its own
  `up` stair + real `E` → **`mapOpen: false`**, country blocks `[63,29,25,70]`, player at
  **(1568, 3360)** = the centre of **ruin block (24, 52)**, `wild.ruin.onRuin true`; real `E` again →
  the same dungeon; and `?interior=START.MIF` → the open country outside **Riverhold**. Unit:
  `unit/dungeonsurface.test.mjs` 7/7. **Gap named on the row**: a ruin the exit did *not* name is
  inert — the country's own ruins are not doors yet (the draw run backwards, or a record written the
  first time a door is used).
* **A fault found by measuring, and the reason the first attempt was wrong.** `wildRuin` was first
  declared beside `wild`/`standCell` in the level loader, where it is a **`loadLevel` local** — so
  `ruinAtPlayer()` read an undeclared name, `interact()` rejected, and **`E` stopped doing anything
  in every dungeon** (`dungeonplay` 2/6 on the first run: loot `0 → 0 → 0`, a door `0 → 0`).
  Attributed in a `git worktree` at the baseline (`a7d3f99` was 10/10), then fixed by carrying it on
  `current` like every other per-level fact. Worth keeping: a new module inside a 9 600-line closure
  is where scope mistakes hide, and the suite caught it in one run.

WHAT THIS PASS PROVED, SIXTH PASS (block by block; full detail: `docs/DEFECTS.md`, `docs/ASSETS.md`):
* **B17a closed (`5cccb80`) — the country is inhabited (D-01b, D-02a).** A wilderness window's
  `.INF` names no creature, so the roster was empty, `monsterCountFor` answered 0 and `populate`
  emptied the folk list: out of a gate was a land with nobody and nothing in it. New
  `game/wildernessBestiary.js` (per climate, per hour, weakest-first, every id a creature this
  install can draw) + `monsterCountFor`'s wilderness clause + `populateWilderness`/`dressCrowd` in
  the scene. Audit, before → after: wilderness people **0 → 1/1/6** by climate, creatures
  **0 → 4** on every road, day bestiaries **all `{rat:4}` → temperate `{rat,goblin}`, desert
  `{lizardman}`, mountain `{wolf,snowwolf}`**. Three faults found on the way: a double window that
  collapsed every climate to its weakest creature; the climate read off the `.INF` letter instead
  of the place (every road came out temperate); and the audit's own `beasts.push({ climate,
  hour: 'day', ...beast })`, whose label the page's clock overwrote — a check that could never pass.
* **B22 closed (`5cccb80`) — the asset census is a list of names (D-03, D-24).**
  `tools/assetcoverage.mjs` groups the unread records by consumer (`--groups`, `--top N`, `--json`,
  and a pure/live split so a Node test holds the rules without the install); `docs/ASSETS.md`
  writes up all 1 691 with the module each group belongs to and the five wiring jobs worth doing
  first.
* **B09 half-closed — blood instead of a generic burst.** `combatFx.blood()` (one blood red, shared
  with the arm that carried the literal), used where a landed blow was an amber burst;
  `game/bloodEffect.js` turns a blow into the engine's own decal records. **The remaining half is
  the decal pass**: the texture that `renderer.drawDecals` wants comes from `engine/combat/
  bloodArt.js` and nobody has read it yet.

WHAT THE PREVIOUS PASSES PROVED (kept, still green):
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

WHAT THIS PASS PROVED (the two blocks it closed, `docs/PORT_BLOCKS.md` §4):
* **B15/D-12 closed (`90c7cf1`) — the first ten minutes.** Creation handed a new character to the
  **world map**, and the opening movie's flag was once per *tab*, so a reload while creating
  suppressed `INTRO.FLC` for the rest of the session. `game/startFlow.js` holds the law now
  (`isGameStart`, `destinationParams`, `openingGate`), `scenes/newGame.js` plays the movie before
  booting the dungeon, and a character made just now wakes in `START.MIF` at the quest's own
  stage 0. Seen: `chargen` 41/41, `menu` (New Game → creation → the Imperial Dungeons).
* **B10/D-19 closed (`90c7cf1`) — a camp in a dungeon is heard.** A camp *did* exist; what did not
  was any reason not to sleep in a dungeon, because a creature only noticed a player inside its
  own 34-unit band. `encounters.stirTheLevel` + `isHunting` put every living creature on the
  sleeper until a deadline, and a disturbed sleep passes the day **without** handing back the
  wounds. `tests/unit/hunt.test.mjs` holds it; the roll itself is `A.EXE`'s and is stamped as this
  project's rule.

WHAT THIS PASS PROVED (2026-10-16, part four — `docs/PORT_BLOCKS.md` §4b):
* **B06 closed (`2c2b63f`) — the stride, and the page it killed (D-26).** The run gate landed last
  session read `weaponRig.drawn` from `interior.js`'s **module-level** `inputOf` while the rig is
  declared inside `bootInterior`: with a sprint key held the builder threw `ReferenceError`, the
  throw left `step()` and then `frame()` before its own `requestAnimationFrame`, and **the page
  stopped for good** — probed before the fix: walk 4.59 m in 1.2 s, then 0.00 m forever. Nineteen
  suites were green because **not one of them had ever held a movement key**. The law is now
  `game/weaponView.js`'s `canRunUnlessDrawn(drawn)`, taken by the builder as a parameter; the new
  **`movement`** suite holds every key the loop can hear (the frame counter is read *while the key
  is down*) and measures the stride: **walk 1.86 m/s → sprint 3.08 → sprint with the blade out
  1.86**, the sprint returning once the rig sheathes. `tests/unit/stride.test.mjs` holds the law.
* **The city gate is a door the player walks through (`baf80ef`) — D-27, the owner's evening
  report.** A city has a gate and `E` crossed it all along, but the wall's one opening holds the
  game's gateway as a **solid** voxel, so a player who walked at it stopped against the art — from
  their side, no door at all. `maybeWalkThroughGate` crosses on the **push**: within a cell of the
  gateway, with the frame's stride aimed at it, both directions, once per crossing. Measured in
  `movement`: walking at 8,127 of `CITYW2` leaves the city on foot with no keypress (Daggerfall and
  Rihad both probed), and a stride **along** the wall does not. **The walk back in from the country
  was fixed the same session (`dbf4058`): the boot let the save's remembered wilderness cell override
the explicit `?at=` arrival, so the crossing rebuilt the country at the cell the player had left
from. `movement` **11/11** holds both halves.
* **The owner's evening report is mapped and probed, not guessed** (`docs/DEFECTS.md`, D-28…D-31):
  dungeon depth/sewers is **B23** (new block, first probe: per dungeon `levelCount`, each stair's
  cell, which levels are wet); "most enemies dont exist or dont spawn" is D-29 (three numbers per
  dungeon: roster size, how many ids this install can draw, the field's real count); the "minotaur"
  NPC is D-30 and is **not reproduced** — Daggerfall 48 people / Corinth at 23:00 48 people / one
  wilderness page, every sheet a folk sheet and **zero creatures**, with `01MNKWLK.CFA` shown to be
  the *monk* sheet, not a minotaur; "port much more from arena" is the wiring half of B22.

**The country's own gate is recognized, and the walk back was undone — D-32, written here as OPEN
and fixed in the same session (the correction at the end of this paragraph is the fix).** `.scratch/gatein.mjs` after crossing out at Daggerfall's east gate:
the player stands at the world cell **three cells out (7.5 m)** where the push rule's reach is
**3.2 m**; pushing in, the very next sample reports the gate correctly —
`wildGate {row: 8, col: 127, to: 'city', axis: 'east'}` — and the sample after that is **the exact
arrival cell again**, so the approach was returned to where it began. Cause read off the code: the
window slide re-places the player from the **remembered entry cell** (`interior.js:1508`) rather
than the cell they are standing on, and `GATE_STEP` (3) disagrees with `GATE_WALK_REACH` (3.2 m).
**Superseded the same session, and both of those readings were wrong** (`dbf4058`): the probe that
reads `dbg.windowSlide` showed no slide at all, and a second reading of the boot found the real
cause at one line — `rememberedWild` refused memory only when the URL had no `location=`, while
`crossGate` keeps `location=` and adds `?at=`, so the save's remembered wilderness cell beat the
player's own arrival and the crossing rebuilt the **country** at the cell they had left from. The
guard now refuses memory when the URL asks for the settlement (it is what the comment above it
always said) and `movement` **11/11** holds both halves. The one cause still open on that row:
`GATE_STEP` (3 cells = 7.5 m) against `GATE_WALK_REACH` (3.2 m).

NEXT 3 STEPS (from `docs/PORT_BLOCKS.md` §5, each with its first probe):
0. **B24 continued · the tables out of the unpacked image** — the owner's own ask (*"you need to
   decompile all of Arena"*), and the block is now cheap to advance: the image, its anchors and its
   structure are all in hand (`§4e`). One table per pass, each verified against something this repo
   already trusts: the class and race tables against `chargen`'s list, the creation prose against
   the port's own text, the wilderness draws (already confirmed), the item and spell text. First
   probe: dump the ASCII runs around the creation offsets (`to select your class?` @220304) and the
   `img` name tables, and name the module each run belongs to — `docs/ASSETS.md`'s discipline,
   applied to the executable.
0b. **B23 · dungeon depth — the level below with water in it** (D-28, the owner's evening report).
   Probe: per shipped dungeon, `levelCount`, each stair's cell and which levels are wet; then
   assemble the second level the way the original's own second level reads. **D-27's open leftover
   rides with it**: `GATE_STEP` (3 cells = 7.5 m) against `GATE_WALK_REACH` (3.2 m), so a crossing
   arrives 7.5 m out where the push's own reach is 3.2 — Arena's gate puts the player in the
   opening, and one cell arithmetic settles it.
0a. **B17 · the country's ruins as doors** (the gap named on D-34). A ruin is a door because a
   dungeon's seed points at it; walk to the same country from a city gate and `E` there does
   nothing. Cheapest honest rule: give each ruin block an identity from the country's own grid
   (the draw run backwards — ruin index → seed → the record that seed names), so every ruin the
   grid drew is enterable, and the exit's own ruin is the same door by construction. Probe first:
   how many ruin blocks a country draws (measured: 22 of 66 blocks are ruins, and one country's
   grid drew `[63,29,25,70]` in its window) and whether a backwards draw lands on a `CITYDATA`
   dungeon record whose country is that same settlement.
1. **B02 · is the start dungeon mirrored?** (D-13) — the owner's "looks like a mirrored version".
   Probe `START.MIF`'s cell grid (`tools/mif-dump.mjs`, `tools/lib/mapascii.mjs`) against what the
   original shows: the cell door, the `GATE.IMG` stair, the arrival room, the arrival yaw. A
   mirror can only be `mifMesh`'s x/z mapping, the camera's handedness or the spawn facing — one
   line and one test. Then run the same probe over the eight quest dungeons and the palace, which
   the owner reports as "all glitched".
2. **B05 · water you can pass through** (D-18/D-18a) — probe per level: do flooded cells separate
   two otherwise-disjoint walkable regions? If a level *needs* the water, that is the original's
   swimming and this port's blocked wall, and the block ports `ArenaChasmUtils.allowsSwimming`
   properly instead of the current wade. B23's wet basement is the same water seen from the other
   side, so the two blocks should be probed together.

Then the two big ones the list names and the phases already own: **D-01b/D-02a** (people and
creatures in the country — the audit's four remaining reds) and **D-22** (P3/P4: the wilderness is
a 128×128 window, not a country — the owner: "you teleport around and cant even get out of a city").
The blocks those belong to are B11 and B17 in `docs/PORT_BLOCKS.md`; B17 is the largest block in
the ledger and is the owner's own "we will never go on" risk.

OPEN DEFECTS (top): D-28 (dungeon depth — B23, the queue's item 0) · D-13 (the mirrored start —
B02) · D-29 (enemies: three numbers per dungeon) · D-30 (the "minotaur" NPC: not reproduced,
needs the place or a sweep) · D-18 · D-18a (water — B05) · D-34's named gap (the country's own
ruins are not doors yet — B17, queue item 0a) · and the gate's own leftover: `GATE_STEP`
against `GATE_WALK_REACH` on D-27's row. ~~D-32~~ **closed `dbf4058`** · ~~D-34~~ **closed this pass**
(`682e48e`: the exit boots the country at the ruin the dungeon's seed picks) · D-28 (dungeon depth —
B23) · D-29 (enemies: three numbers per dungeon) · D-30 (the "minotaur" NPC: not reproduced, needs
the place or a sweep) · D-18 · D-18a (water — B05) · D-22 (P3/P4: the country is inhabited now but it is still a 128×128 window with
no relief, coast or roads — B17) · D-23 (weather that moves, a ground that knows the season —
B18) · D-03/D-24 (coverage: the list is named, the wiring is not done — B22) · D-05 (P3) ·
D-06/D-07 (names outside this checkout) · B09's decal half (the blood records exist; the pass is
not wired) · B06's measurement (the gate is landed, the check is not).
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
