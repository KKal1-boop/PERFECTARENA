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
2. **`A.EXE` is not in this checkout — but the game is, under the name `ARENA.BAT` runs.**
   `ls arena/ARENA` is 153 loose files plus `GLOBAL.BSA` and **`ACD.EXE`**, which `ARENA.BAT`
   launches (`@ACD -Ssbpdig.adv …`): the same program the floppy release ships as `A.EXE`, and
   PKLITE-packed either way. Since block B24 the executable is **unpacked and read** (`src/arena/pklite.js`,
   `src/arena/exeTables.js`), so the tables that live in it are readable here *if* a reader can
   find them by their own content. Still true, and still the rule: a number that has **not** been
   read out of that image is either quoted from OpenTESArena with its file and line, or stated
   plainly as *this project's own rule* and stamped as such in the module header. Never a third
   option. (Until 2026-10-16 the second option was the only one, because the file had never been
   opened — the rows below say which is which, and `[~]` on B24 is what is left of the first.)
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

## 1b. The standard: what "Daggerfall Enhanced" / "Daggerfall MMO online" actually is (read 2026-10-17)

The owner has asked for this project to *"match the standard of daggerfall mmo online"* and named
**Daggerfall Enhanced** twice as the persistent world he wants (D-05, the queue's item 0e). Neither was
verifiable from this checkout, so it was looked up rather than assumed — and the answer reframes the
request in this project's favour:

**They are one project, and it is this project's own engine family.** *Daggerfall Enhanced* and
*Daggerfall Online* are **earlier names** of what its own documentation now calls **DFO Online**
(*Daggerfall JavaScript*): an open-source **JavaScript + hand-written WebGL2** reimplementation in the
browser, using Daggerfall Unity only as a *reference for game logic and data* — no engine underneath,
playable from a browser, with an optional Electron shell over the same build. Source:
<https://github.com/Lattymoy/daggerfall-js-source> (MIT **code**; the player supplies their own
`ARENA2` data, which is exactly this project's own rule — Arena's files are read from the player's
install and none are bundled). Play site: <https://daggerfalljs.dev/>. The separately branded
<https://daggerfall.online/> is an independent community site around that client, not the upstream
domain.

**What it documents, as figures rather than adjectives** (its own multiplayer design and arc documents):

| the standard | DFO Online's own numbers |
|---|---|
| topology | a Cloudflare Worker plus **one Durable Object per room code**; clients connect by **WebSocket** (no WebRTC in the initial transport) |
| authority | **the host's browser simulates the shared world**; there is no server-side simulation for ordinary co-op, and the trust model is stated as friends-only |
| party | **2–8 players**, room-based rather than MMO-scale |
| cadences | world **time and weather at 1 Hz**; player transforms at **10–20 Hz**; enemies **on change, capped at 20 Hz** |
| state split | the **world half** of the save envelope is shared, then receives deltas; each player's **character, inventory and quest state stay their own** |
| wire format | the existing **save envelope is the wire format** for world state — a snapshot first, updates and requests after — with **schema versions** in JSON messages |
| persistence | a room's world snapshot is held in durable storage for a configured period after the last visitor (no published TTL) |
| honest gaps it names | host migration, reconnection and a party split across interiors are open work; no mod support and no import of classic/DFU saves |

**Why this matters to Block B19, and where this project already stands.** That split is **the same split
this port has had since `worldState.js` was written**, which is evidence the shape is right rather than a
coincidence to celebrate: the **world half** is `game/worldState.js` (doors, loot, kills, standing,
quest stages, and — since §4j — the **clock**, which is DFO's *"time at 1 Hz"* in its single-player
form), whose snapshot is exactly `serializeWorld`/`parseWorld` (versioned, JSON-safe, unable to throw on
a corrupt save — i.e. *a wire format already*), and the **player half** is `game/save.js`
(character, inventory, radiant state). So the persistent world the owner is asking for is **not** a
rewrite of the save: it is (a) the world half being complete and authoritative — the hour is done, the
weather and the player's own last ground are the two loose fields left (`weather`, `player`) — and
(b) **the scene keeping it in hand instead of re-booting** (item 0e's remaining half). Multiplayer is
**not** part of the request, and the standard's own authority model says why a solo port should not
pretend otherwise: its world is simulated by *a player's browser*, which is what this project's page
already is.

**What is deliberately not copied:** the room/host machinery (a Worker, Durable Objects, WebSocket
relay) is a *multiplayer* answer to a question nobody here has asked. It is recorded as the shape a
future co-op pass would take — Worker + one Durable Object per room, the world snapshot on the wire,
1 Hz time — and named in the queue rather than built.

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
| B12 | Shops, guilds, temples, services — **and every door on a wall, in a city and in the country** | `TEMPLATE.DAT`, `.INF` menus; OpenTESArena's `tryMakeVoxelTransitionDefGenInfo` for the wall case and `tryGetInteriorTypeFromMenuIndex` for both tables | `shops.js` (`interiorKindOfTexture`, `doorStand`, `cityDoors`, `wildDoors`), `services.js`, `guilds.js`, `interior.js` (`doorNear`, `enterDoor`) | `[x]` **(D-51, §4o/§4p: 3 925 city wall-door cells in the 368 blocks; Daggerfall 421 doors — 345 homes; and the country's own 209 doors over the 66 `.RMD` blocks, 154 of them farmhouses and barns; the sign is decoration, the wall art is the door)** | `doors` **54/54**, `commerce` 25/25, `guilds` 13/13, `unit/shops` **14/14** |
| B13 | Radiant quests **given by NPCs** | `TEMPLATE.DAT` + `.INF` people | `radiantQuests.js` | `[x]` | `unit/radiant`, `radiant`, `bounties` |
| B14 | Main quest: eight pieces, the palace, the ending | `CITYDATA.64/65`, `DUNGEON.TXT`, `TEMPLATE.DAT`, `END01.FLC` | `questData/questState/radiantQuests` | `[x]` | `mainquest`, `unit/quest` |
| B15 | **The first ten minutes**: creation → `INTRO.FLC` → the Imperial Dungeons | `START.MIF`, `INTRO.FLC`, `QUESTION.TXT` | `startFlow.js`, `chargen.js`, `newGame.js`, `main.js` | `[x]` (D-12, this session) | `unit/startflow`, `chargen`, `menu` |
| B16 | World map, all of Tamriel, fast travel | `TAMRIEL.MNU`, `CITYDATA.64/65`, `TERRAIN.IMG`, and — for the ninth province, which the file leaves empty — **the later games' Cyrodiil** | `worldMap.js`, `worldmap.js`, **`cyrodiil.js`** | `[x]` **(§4h: D-38 — the terrain-class table and the fail-safe sampling are the game's own now, which is what the owner's *"biomes … swapped … the imperial city is in the desert instead of temperate"* was; D-39 — the Imperial Province's 31 all-zero placeholder records, one pixel and one seed between them, are the later lore's Cyrodiil: 31 names, 31 pixels, 31 cities; D-40 named and open on the row below)** | `worldmap`, **`unit/worldmap`** |
| B17 | Wilderness, leaving a city on foot, **and a dungeon's own door out here** | `TWN/DWN/MWN.INF`, `GLOBAL.BSA` wild blocks, `CITYDATA.64`'s 144 dungeon records | `wilderness.js`, `wildernessBestiary.js`, **`dungeonSurface.js`** | `[~]` **(D-34 closed with `dungeonSurface.js` + `leaveThePlace`): a dungeon's way out is the country, not the map** — the country is the wilderness of the settlement nearest the dungeon's world-map pixel, the door is a ruin block of that country's drawn grid chosen by the dungeon's own seed, the country page stands the player at it (`state().wild.ruin`) and `E` goes back down by seed. Measured: `?dungeon=Stonekeep` (seed 3969902143) → the country at cell **(1568, 3360)** = the centre of ruin block **(24, 52)**, `onRuin: true`, then the same dungeon again; `START.MIF` (no record of its own) → the country outside Riverhold. **Gap named**: a ruin nothing points at is inert — the country's ruins are not doors yet (queue §5 item 0). **This pass (§4g) closed the two halves of the owner's next report — D-35: the exit stood the player on the ruin block's *centre cell* (4 096 cells of country; a field as often as a doorway), and now stands them in front of the ruin's own **door** (its arch, or the built cell nearest the centre) two or three cells out on the open side, facing it; D-36: a window slide re-booted the page facing north and now carries the player's bearing (`&yaw=`)**. **(D-01b and D-02a closed, `5cccb80`: the country is inhabited and its three climates field different creatures; D-27, `baf80ef`: the gate is a door the player *walks* through — the wall's opening holds the gateway as a solid voxel, so the crossing used to be behind `E` and read as no door at all)** · **the walk back in works (`dbf4058`) — D-32 was the save's remembered wilderness cell overriding the explicit `?at=` arrival; the only cause left on that row is `GATE_STEP` (3 cells = 7.5 m) against `GATE_WALK_REACH` (3.2 m)** · **D-22 still open**: a 128×128 window per climate, no relief, no coast, no roads, no continuous Tamriel | `world`, `audit` (S-A/S-B/S-D), `movement` (the gate), `wildfoot`, `unit/wilderness`, `unit/wildernessbestiary` |
| B18 | Climate + weather + night: ground, sky, precipitation | `.INF` name letters (`TCW` rain, `TCS` snow), `DAYTIME.COL`/`DREARY.COL`/`FOG.COL`, `ARENA.SKY`-family | `arenaSky.js`, `sceneLighting.js`, `daylight.js`, engine `weather.js` | `[~]` **D-23**: the level's *own* letter is honoured; there is no front that moves, no per-climate ground mix, no snow on the ground | `scenevisuals`, `unit/sky` |
| B19 | A persistent, seamless world (P3) | — (an engineering goal) | `worldState.js`, `save.js`, `interior.js:goInPlace` | `[~]` **(§4j this pass: *the world keeps the hour*)** — `world.clock` (`{day, minutes}`) is written on every place change, on the world's own saves and on a 20-second tick, and read on the way in: the hour a player leaves a place at is the hour the next place opens on, a bare reload comes back at it, and a world that has never kept an hour still starts at ten. `?clock=` still wins (and is dropped from a transition's URL — D-32's law) so a probe cannot rewrite the world it measures. **What stays open on D-05**: a place change is still a full scene re-boot (level, crowd, creatures, light rebuilt from the save — S-E), which is the block's other half | `unit/worldstate`, **`persist`**, `audit` |
| B20 | Sound: voices, one-shots, fanfare, music | `*.VOC`, `SOUND.CFG`, `FANFARE1/2.VOC`, `SPEECH/` | `trigSound.js`, `fanfare.js`, engine `audio.js` | `[~]` the speech bank (`arena/ARENA/SPEECH`) is unread; the `.INF` `@SOUND` slots are wired | `unit/voc`, `doors` |
| B21 | The automap — the level the player is standing in | OpenTESArena's `Interface/AutomapUiMVC.{h,cpp}` (MIT): the palette, `getPixelColor`, `PlayerArrowPatterns`, `PixelSize = 3` | **`game/automap.js`** (the law) + **`scenes/automap.js`** (the sheet) + `interior.js` (`Tab`, the pause, the seam, the hand-over button) | `[x]` **(this pass, uncommitted)**: **`Tab`** in a dungeon, a shop, a guildhall or the palace opens the level's own map in Arena's automap colours, with the reference's 8-direction 3×3 arrow; **`M` is Tamriel from everywhere** (the owner's correction: the first cut took `M`, and the sheet now also carries a world-map button); a city and the country have no local sheet. What is this project's is stamped in the header: the whole-level fitted view (the reference scrolls a 3-chunk window), the screen compass, and **no fog of war** (the reference has none) | **`unit/automap` 15/15**, **`automap` 13/13** (`M` still opening Tamriel in a dungeon; `Tab` opening START.MIF's own 686 floors / 1535 walls / 14 doors / 1 up; the canvas's real pixels; the marker on the player's cell; a quarter turn; the hand-over button; Escape; a tavern interior; a city's `M` still Tamriel and its `Tab` empty) |
| B22 | Asset coverage: the 946 `.IMG`, 180 `.SET`, 340 `.CFA` named by no source | `GLOBAL.BSA` census | `tools/assetcoverage.mjs`, `docs/ASSETS.md` | `[~]` **the census half is done (`5cccb80`)**: every one of the 1 691 unread records is grouped by the module that would consume it, with the five wiring jobs that would show most; the **wiring** is the open half (D-03/D-24, and the owner's "you should port much more from arena" = D-31) | `unit/assetcoverage.test.mjs` + the tool's own run |
| B24 | **`ACD.EXE` — the game's own tables** (read: the string tables are out — **§4f**; what is left is the numeric blocks) (the owner's "you need to decompile all of Arena"; the brief's P2) | `arena/ARENA/ACD.EXE` (174 429 B) — **the game itself**: `ARENA.BAT` runs `@ACD -Ssbpdig.adv -IOS220 -IRQS7 …`. The format's description is the entropymine write-up *Notes on PKLITE format* (jsummers, Parts 1–3) and the instance is the file's own bytes. **Measured from the bytes this session** (`node` read of the file): `MZ`, **1** relocation, header **96 B** (6 paragraphs) so the image is 174 333 B, `minAlloc` 9 024 paragraphs, `maxAlloc` 65 535, entry `IP:CS = 100:fff0`, `SS:SP = 2a96:200`; the stub carries `"PKLITE Copr. 1990-91 PKWARE Inc. All Rights Reserved"` at offset 30 (the **pre-1993** PKLITE string, so not the 1.5+ "1990-93" variant), **no** `LZ91` marker, and the tail's entropy is **7.872 bits/byte** over the last 64 KiB — packed, not encrypted | new (`src/arena/pklite.js`, runtime-only) + `src/arena/exeData.js` (anchor-located tables) | `[~]` **THE FILE IS UNPACKED (`fb8fa77`) — the game's tables are readable**. **What packed it, read from its own bytes:** offset 28 = `0x0C` (minor 12) and offset 29 = `0x31` → major **1**, bit `0x10` = **"extra"** compression, bit `0x20` = **"large"** codebook, i.e. **PKLITE 1.12 registered**; the copyright string is at **30** (`PKLITE Copr. 1990-91 PKWARE Inc. All Rights Reserved`, NUL at 83). *(Correction to the previous pass's reading: the `1` that looked like the string's version digit at 29 is the **flags byte**, and the string starts at 30 — the format's own version table keys on the pair `31 0c`.)* The write-up's table gives that pair **656** bytes into the code-image segment, and the image starts at 96 → compressed stream at **752**, which is exactly where this file's byte entropy climbs (7.0 bits/byte at 704, 7.2 from 752 on). **What came out:** a **305 520-byte code image** (19 095 whole paragraphs), **4 044 relocations**, footer `SS=19087 SP=128 CS=0 IP=0`, code image ending at 166 321, relocation table ending at **174 421 = the file's end − 8** (exactly the footer), no warnings, **33 ms** in Node. Four structural checks a desynchronised stream cannot pass, all green: the image is whole paragraphs; `SS×16+SP = 305 520 = ` the image's length (the stack ends at the top of the load image); the entry the footer names is the image's **first byte**, which is why it opens `BA A0 3B B4 30 CD 21` = `mov dx,3BA0h / mov ah,30h / int 21h` — a DOS version call, then PSP reads; and every relocation segment is a multiple of `0x0fff` (the extra-compression normalisation). **And it is this game:** measured offsets into the image — `to select your class?` @220304, `the world of Tamriel, home of the Arena…` @221192, `Imperial Province` @235528, `Khajiit` @251849, `Redguard` @255313, `Nord` @255323, `wild.mif` @249113, `menuscrn.img` @249067 — plus the **wilderness draws' own thresholds as words**: `0x6666` ×71, `0x4000` ×235, `0x2666` ×73, `0x1999` ×3, the cross-check `game/wilderness.js` has never had. **And the tables came out in the same session — see §4f**, which is what `a9aa3a6` is: `src/arena/exeTables.js` reads **thirty string tables** out of the image by their own words, the Minotaur's art among them (**D-30 closed, D-29's exist half with it**). Still unexplained and not needed by the static route: the stub's own setup words `mov ax,4DC1h` / `mov dx,2A90h` at offset 96. Doctrine unchanged: derived at runtime on the player's machine, cached for the page's life, **never committed** (law 6). **What is left of this block:** the image's **non-string** tables — the byte blocks behind the holidays and the race tables, the word offsets after the noble ranks, the creature stat rows — which need a reader that can say what a number *means* before it is worth reading (queue §5 item 0) | `unit/pklite.test.mjs` 6/6 (format, structure, and Arena's own words) + **`unit/exetables.test.mjs` 8/8** and **`unit/monsterart.test.mjs` 9/9** (install-optional, as the format suites are: the tables, the readings, the pairing, the fingerprint) + **`exe` browser suite 14/14** (every number and every table produced in a real page from the player's own copy, with a real Minotaur standing on it) |
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

### And the fourth report, later the same day

| report | block | status |
|---|---|---|
| *"the biomes, biome backgrounds and buildings texture and architecture are completely different … they seem to be swapped like blackmarsh has nord architecture the imperial city is in the desert instead of temperate"* | B16 + B18 | **closed this session** (D-38, §4h: the terrain-class table and the fail-safe sampling are the game's own now; measured over the whole install — 288 settlements, 91 mountain / 129 temperate / 68 desert, none at sea, Daggerfall temperate, Skyrim 32/32 mountain, the Imperial City temperate at 254, Anvil's city built of `MCN.INF`) |
| *(no report — found while measuring the one above)* the province the game **begins** in is one named place and thirty-one empty records | B16 | **closed this session** (D-39, §4h: the later games' Cyrodiil fills all 31 slots — 31 names, 31 pixels, 31 cities; the greeting gap is queue item **0c**) |
| *(no report — measured while checking that)* `CITYDATA.64` repeats two settlement names across provinces | B16 | **open** · D-40, queue item **0d**: `?location=Glenpoint` always lands in High Rock, `?location=Riverbridge` always in Morrowind |

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

## 4c. What this pass closed (2026-10-16, part five)

**B17 · a dungeon's door is out in the country** (D-34, `682e48e`; the owner: *"STILL EXITING A DUNGEON JUST
SHOWS YOU THE MAP NOT THE FUCKING WILDERNESS"*). The exit opened the **world map**, and the comment
that defended it was the tell — *"the world map is the surface"*. It is not. New
`src/game/dungeonSurface.js` holds the rule and says in its own header which half is the install's
and which is this project's:

* **the country** is the wilderness of the settlement **nearest the dungeon's world-map pixel**
  (the rule fast travel already uses, `nearestSettlement`; a settlement with no wilderness seed —
  the palace — is skipped rather than answered with);
* **the door** is a **ruin block** of that country's drawn grid — 22 of the 66 scenery blocks are
  ruins (`classifyBlock`) — chosen by **one draw from the dungeon's own seed** (`ArenaRandom`, the
  same `(next() & 0xff) % list.length` habit the grid itself picks block ids with), and the door is
  that block's centre cell;
* **RECONSTRUCTED, and stamped so**: the original's per-dungeon entrance coordinate lives in
  `A.EXE`, which is not in this checkout. Nothing about the *country* is invented — the ruin is one
  of the blocks the settlement's own grid drew.

Measured on real pages (`dungeonplay`, 17 checks on one walk, booted at `?dungeon=Stonekeep` —
Hammerfell, seed 3969902143, `39699021.MIF`: **a dungeon reached by a dev door, never walked into
from the country**, which is exactly the case that used to end on the map):

* its own `*LEVELUP` stair (the level's art; one `up` cell at 1,39) and the real `E` → **the
  country**, `mapOpen: false`, window blocks `[63,29,25,70]`, player at wilderness cell
  **(1568, 3360)** = the centre of **ruin block (24, 52)**;
* `state().wild.ruin` = `{ seed: 3969902143, block: {blockRow: 24, blockCol: 52},
  cell: {row: 1568, col: 3360}, onRuin: true }`;
* the real `E` again → **back down into the same dungeon**: the round trip closes;
* and the **opening dungeon** — `START.MIF`, the one dungeon `CITYDATA` has no record of, and the
  **first** exit every player takes (`startFlow.js` hands them to it) → the open country outside
  **Riverhold**, the settlement nearest the Imperial Palace's own marker at the continent's centre
  (`OPENING_DUNGEON_POINT`; this project's rule again, and named in the code).

`tests/unit/dungeonsurface.test.mjs` 7/7 holds the rule (a ruin is a block of the drawn grid, the
door is that block's centre, one dungeon one door, two ruins split over 64 seeds, no ruin → null,
the country skips a settlement with no wilderness seed, the whole answer is stable).

**The named gap on this block.** A ruin is a door *because a dungeon's seed points at it* — so a
country entered from a city gate has ruins that nothing points at, and `E` there does nothing. The
other direction (walk into a ruin first, whatever the country) needs an identity per ruin: either
the draw run backwards from the grid, or a record written the first time a door is used.

---

## 4e. What this pass closed (2026-10-16, part six — **the executable is open**)

**B24 · `ACD.EXE` is unpacked, in the page, from the player's own copy** (`fb8fa77`). The owner's ask has been
*"you need to decompile all of Arena"*; this is the pass where the door opened.

`ARENA.BAT` does not run A.EXE — it runs **`ACD`** (`@ACD -Ssbpdig.adv -IOS220 -IRQS7 -DMAS1
-Mgenmidi.adv -IOM330 -IRQM2 -DMAM1`), so the 174 429-byte `ACD.EXE` in this folder **is the game**,
and its own tables are inside it rather than in the 153 loose files. It is packed with **PKLITE
1.12 registered, "extra" + "large" compression** (offset 28 `0x0C` = minor 12; offset 29 `0x31` =
major 1 with the `0x10` "extra" and `0x20` "large" flags; copyright string at 30, which corrects the
previous pass's off-by-one reading of that pair).

The previous pass read the stub byte by byte and planned to disassemble it to find the stream's
offset. **It did not need to**: the published description of the format has a table of code-image
offsets by version, that pair (`31 0c`) is in it at **656**, the code image starts at `e_cparhdr`×16 =
**96**, so the compressed stream is at **752** — and that is exactly where this file's byte entropy
stops being stub-like. One table and one number, both checkable against the bytes, instead of an
8086 disassembler.

**What the unpacker produces** (`src/arena/pklite.js`, ~300 lines, no dependencies):

* a **305 520-byte code image** — 19 095 whole paragraphs;
* **4 044 relocations**, every segment a multiple of `0x0fff` (the extra-compression normalisation);
* the footer `SS=19087 SP=128 CS=0 IP=0`, with the table ending at **174 421 = the file's end − 8**,
  i.e. exactly on those eight bytes;
* 33 ms in Node, no warnings, every bound checked with the offset it failed at.

**Four structural checks, green, that a one-bit desync cannot pass** — and this is the whole reason
to believe the tables rather than merely that something came out:

1. the image is a whole number of paragraphs;
2. `SS × 16 + SP = 305 520` = the image's length — the stack ends exactly at the top of the load
   image, which is what a DOS program's stack *is*;
3. the entry the footer names is the image's **first byte**, and that byte opens `BA A0 3B B4 30 CD
   21` = `mov dx,3BA0h / mov ah,30h / int 21h` (a DOS version call, then PSP reads);
4. the compressed relocation table parses after the stop marker and lands on the file's own trailer.

**And the image is this game.** Arena's own words, at offsets measured in the image:
`to select your class?` @220304 · `the world of Tamriel, home of the Arena…` @221192 ·
`Imperial Province` @235528 · `Khajiit` @251849 · `Redguard` @255313 · `Nord` @255323 ·
`wild.mif` @249113 · `menuscrn.img` @249067. The **wilderness draws' thresholds are numbers in the
executable** — `0x6666` ×71, `0x4000` ×235, `0x2666` ×73, `0x1999` ×3 — which is the first
independent confirmation `game/wilderness.js`'s `CATEGORY_THRESHOLDS` has ever had.

**The runtime half matters more than the desktop one.** `src/arena/exeData.js` reads the executable
through the same `ArenaData` source the rest of the game uses (trying `ACD.EXE`, then the floppy
release's `A.EXE`), keeps the image for the page's life, and reports the four structural numbers
above plus the anchor offsets. Nothing derived is committed (law 6), so a new **`exe` browser suite**
proves the whole chain where it will actually run: **8/8**, all four structural checks and the anchors
produced **in a page, from the player's own install**.

**Held by:** `tests/unit/pklite.test.mjs` **6/6** (the file naming itself, the structural invariants,
the trailer, Arena's own words — and the refusal path: a non-PKLITE file is refused **by name**, not
decoded into nonsense) and the new `exe` suite **8/8** in `tests/run-browser.mjs`.

---

## 4f. What this pass closed (2026-10-16, part seven — **the tables are out of the image**)

**B24 continued · the executable's own tables, read and used** (`a9aa3a6`). The previous pass opened
the file; this one reads it, and the reading is what the owner's *"you need to decompile all of
Arena"* asked for.

**The reader** (`src/arena/exeTables.js`, ~330 lines, no dependencies): a table is found by **its own
words** — an anchor of two to five consecutive entries (`Rat`, `Goblin`, `Lizard Man`, `Wolf`, `Snow
Wolf`, `Orc` finds the creature roster) and then NUL-terminated strings until the run stops spelling
like that table (a `match`, a `stopAt` where the next table begins, an empty entry where the game has
one). **No offset is committed**, so the floppy release's `A.EXE` — the same program under another
name — reads exactly the same way, and an anchor that is missing answers `null` instead of guessing.
**Thirty tables** come out: the creature roster and the sheet table each creature is drawn from, the
commoners' families, the player's own animation templates, the creature voices, the eighteen classes,
the eight attributes, the races twice (a people and a person), the eight provinces, all **sixty-four
settlements**, the eight capitals, the sixteen named dungeons, the settlement block kinds, the
calendar (twelve months, seven weekdays, fifteen holidays, seven times of day), the noble ranks and
the gem table, the artifacts, the spell effects, the status words, the travel menu, and the level
markers this port's own `.INF` reader resolves. Seven readings hold them: the class block repeats
inside the bestiary run, the settlements divide by the provinces (eight each), the calendar is twelve
and seven, and the markers are the eight `mifLevel.js` looks for.

**And the find, which was two open defect rows seen from both ends.** The creature tables pair index
by index — **twenty-three names, twenty-four sheets** — and twenty-one of the pairs spell out
(`Skeleton`/`skele`, `Snow Wolf`/`swolf0`, `Hell Hound`/`hound`). The two that do not are the Fire
Daemon's — the *file name's* own misspelling (`deamon` for `daemon`), which `monsters.js` had always
spelled its own way — and **index seven: `Minotaur` against `pat@.cfa`**, the one pair with nothing
behind it. Three more measurements agree:

* the executable's **`.INF` monster slots** (`32`…`54`, read off the install's own art names by
  `dungeonItems.js` long before this block) come out in the executable's creature order **23 of 23**,
  the Minotaur at `39` — the same slot the port's own art reading had to explain (`OGRE.DFA`);
* the archive's **`PAT1.CFA`…`PAT6.CFA`** carry `12, 8, 8, 8, 8, 3` frames — the shape **twenty-one
  of the twenty-three** creature families carry, and one no person's sheets do (a person's are twelve
  across, nine for the one-angle commoners, three for the small set). The rat is the exception that
  keeps this honest: it carries the *person* shape, so the fingerprint corroborates and the tables
  decide;
* the executable's own **people table** holds `mlgen0@…` and `fmgen0@…` and **no creature at all** —
  `PAT` is not among the commoners, and `MINOTAUR.VOC` is the only thing in the archive spelled for
  the Minotaur besides its art.

So **D-30** (*"some npcs have enemy sprites like theres a minotaur guy somewhere"*) was the port
handing a creature's sheets to the town crowd (`peopleKinds.js` listed `PAT#` as "a townsman of the
PAT set"), and **D-29**'s *exist* half (*"most enemies dont exist"*) was the same sheets missing from
`monsters.js`. Both closed by one field and one removal: the Minotaur's `sprite` is `PAT`, and `PAT`
is nobody's townsman. Measured on a real page: `__debug.spawnMonster('minotaur')` answered **`null`**
before it and answers `{name: 'Minotaur', file: 'PAT1.CFA'}` with all six sheets loaded now, and the
`.INF` roster line in the audit prints `…, skeleton, minotaur, spider, …` where the id used to be
filtered out. **D-29's spawn half stays open** (the three per-dungeon numbers), and the wilderness
table now carries the Minotaur on the temperate and mountain roads (this project's own rule, stamped
in the module).

**Held by:** `tests/unit/exetables.test.mjs` **8/8** (the reader's refusals, the report's totality, and
every table against something this project already trusted), `tests/unit/monsterart.test.mjs` **9/9**
(the pairing, the slot order, the fingerprints, the archive's own files, and — the widest check of
all — **the port's own race, class and creature lists against the executable's**, name for name:
eight races, eighteen classes, every creature matched, the only name the port has that the creature
table does not being the boss, whose sheet the sheet table carries), and the **`exe` browser
suite 14/14** — every table read in a real page from the player's own copy, and a real Minotaur
spawned there. `npm test` **499/499, exit 0**; `audit` 23/23, `world`+`townsfolk`+`living` 123/123,
`actioncombat` 23/23, `dungeonplay` 20/20, `combat` 37/37.

**The named gap on the block:** only the **string** tables are read. The image's numeric blocks — the
byte rows behind the holidays and the race tables, the word offsets after the noble ranks, the
creature stat rows, the spawn tables — need a reader that can say what a number *means* before it is
worth claiming, which is the queue's next item. And the tables that *are* read are, so far, used by
one thing each: the creature art (this pass), the level markers (already the port's own), and the
readings. The calendar, the settlements and the class/race prose are read and **not yet wired** —
those are the cheapest visible follow-ons.

---

## 4g. What this pass closed (2026-10-16, part eight — **the country you walk**)

**B17 continued · a dungeon's door, and the compass a slide must not steal.** The most useful thing
this pass produced is a number: the exit of D-34 stood the player on the **centre cell** of the ruin
block it had just chosen, and a block is **64×64 = 4 096 cells** of country. Measured on Daggerfall's
own wilderness with Stonekeep's seed (`?location=Daggerfall&wild=&ruin=3969902143`): ruin block
(26, 9), centre **(1696, 608)** — the player in open ground with the structure that is their way back
down out of sight, and `state().wild.ruin` carrying no door at all. The block's nearest wall stands
**12 cells west** of that centre, at (1696, 596). "You exit a building" was a reading of the *centre
of a field*, which is what a block centre is: the structure is a building somewhere in it.

**The rule** (`game/dungeonSurface.js`'s **`ruinDoorStand`**, ~80 lines, pure, no I/O):

* **the door** is the ruin's own **arch** — the `0x9` voxel, which is the doorway every `.INF` in this
  game marks a gate with and which `scenes/interior.js` reads a settlement's gate from — **nearest**
  the block's centre. A ruin with no arch in it (this install's blocks are libraries, colonnades and
  grave-fields) falls back to the **built cell nearest the centre**, and `arch` says which reading
  answered;
* **the stand** is two or three cells out along the door's **open side**: `HORIZON = 24` cells of the
  block are measured per axis and the side with the **least ruin in it** wins, then the longest run of
  open ground. Both readings are needed and neither is enough — a ruin's courtyard is open at the door
  and full of building beyond it, so "longest open run" alone walked the player *into* the ring
  (the first version of the rule did, and a test now says so);
* **the facing** looks back at the door (`atan2` in `openYaw`'s own convention: yaw 0 is the column
  axis), so the way down is the first thing on screen — and that is the one claim a picture cannot
  fake and a number can.

**Measured after** (same URL, in a page): door **(1696, 596)**, stand **(1699, 596)**, the player
**on** the stand (`state().wild.ruin.atDoor: true`), yaw **−1.571** — exactly the direction of the
door — and `arch: false`, because that block has no arch. Held by
`tests/unit/dungeonsurface.test.mjs` **11/11** (four new: the arch beats a wall nearer the centre, the
stand is outside with the ruin exactly `paces − 1` cells in front and open country behind, a ring's
courtyard is refused as the outside, and a block with nothing built in it answers `null` rather than a
field). The wiring is `interior.js`'s `standAtRuinDoor`, which is **skipped for any page that names
its own cell** — a slide of the window, a gate crossing, a save's remembered foot — because those
pages are about the ground the player is already standing on.

**And the second half, which is the same question asked of the *window*.** The slide itself is the
original's own mechanism (`ArenaWildUtils::getCenteredWildOrigin` → `wildernessWindowOrigin`): a
128×128 window kept around the player and re-centred a 64-cell block at a time. The port boots a page
in place for it (`goInPlace`, B19's own work), and that boot recomputed the facing from scratch.
**Measured**: walking across the boundary on **yaw 0.35**, `state().yaw` came back **0.00** — the
compass reset every 64 cells, which is the owner's *"you dont understand where you are going"*; and
`?yaw=` was a parameter the boot **read by nothing** (`params.has('yaw')` only ever suppressed its own
`openYaw`; grep finds no `yaw=` in `src`, `tools` or `tests`). **Fixed**: the slide's URL carries
`&yaw=<cam.yaw>` and the boot applies it. **Measured after**: `yaw 0.35 → 0.350`, URL
`/…?wild=1703,608&…&yaw=0.35`, origin (1664, 512) → (1664, 576), and the player's cell **continuous**
(1703, 608 on both sides of the slide — the country kept their ground; only their compass was stolen).
The country's *terrain* was never the defect: the block grid is drawn from the settlement's seed and
is the same grid on every page and every visit.

**The queue this pass hands on** — the rest of the owner's country list, unclosed and named:

* **the country has no landmarks and no roads** (D-22, still open): a 128×128 window per climate, no
  relief, no coast, no continuous Tamriel. The door rule above gives the *dungeon* a place; what a
  walker needs next is something to walk *between* — the settlements' own `.RMD` villages are already
  in the grid (`classifyBlock`'s `village`/`tavern` lists) and no page says where they are.
* **a ruin nothing points at is still inert**: the country's ruins are not doors until something names
  them. The seed that opens a ruin is the *dungeon's*, so a ruin without one is scenery — the fix is a
  per-ruin address (`?ruin=` already carries a seed; it needs a record to resolve against).
* **the slide is still a scene re-boot** (B19/D-05): the bearing is kept now, and the people, the
  creatures and the level are rebuilt for the four blocks under the player. Making it incremental is
  B19's block, not this one's — but the measurement to start it is here: a slide is one `goInPlace` per
  64 cells of walking.

---

## 4h. What this pass closed (2026-10-16, part nine — **the biomes, and the province that was empty**)

**B16 · D-38 — every biome was one province over, and the owner said so first** (*"the biomes, biome
backgrounds and buildings texture and architecture are completely different … they seem to be swapped
like blackmarsh has nord architecture the imperial city is in the desert instead of temperate"*).
`game/worldMap.js`'s terrain-class table had **249/250 temperate, 251/252 mountain, 253/254 desert**;
Arena's own classes are **249/250 `MOUNTAIN`, 251/254 `TEMPERATE`, 252/253 `DESERT`** (OpenTESArena's
`WorldMapTerrain` constants and `toClimateType`). One pair of numbers decides a settlement's climate,
and the climate decides the city `.INF` a settlement is textured from (its architecture), its
wilderness `.INF`, its creatures and its sky. The same function's **sampling** was wrong too:
`getFailSafeAt` takes *every* sample **twelve pixels to the left** (a linear-index shift that wraps
around the 320×200 buffer) and, when that is still sea, walks **below → above → right → left**
outward for the first land, giving up at **254** after 199 cells; this project sampled the point
itself, shifted only when it was sea, and answered the sea constant otherwise.

**The readings that make it a reading and not a preference** (all in `tests/unit/worldmap.test.mjs`, 20
checks): **288 settlements — 91 mountain, 129 temperate, 68 desert, none sampling sea**; High Rock
**two** temperate (**Daggerfall**, **Reich Gradkeep**) and thirty mountain, against UESP's *"warmer
forests in the southwest around Daggerfall"*; Valenwood's three mountain settlements exactly
**Arenthia, Thormar Keep, Ebon Ro**, against UESP's *"mountains in the north around Arenthia"*;
Skyrim **32/32 mountain**; Elsweyr **all 32 temperate**, which is UESP's *"completely devoid of desert
biome"* and was the reported swap; the **Imperial City temperate** at the game's own `TEMPERATE`
pixel (254). The browser half is one line of the `worldmap` suite: **Anvil's city is built of
`MCN.INF`** — the climate reaching the visible textures.

**B16 · D-39 — the province the game begins in had one place in it.** `CITYDATA.64` names all 32
settlements of eight provinces and **one** of the Imperial Province's; the other 31 records are
all-zero placeholders (no name, local (0,0), visibility 0), and the port read them as 31 places:
**one world pixel** (the rectangle's own corner, 107,61 — 31 markers stacked, thirty unselectable),
**one city seed** (0: `citySeed` is the packed local point) and **one country** (0: `wildernessSeed`
is the name's first four letters), an **empty string** for the map's label and the marker card's
title, and a `?location=` **with nothing in it** for fast travel. New **`src/game/cyrodiil.js`** fills
them from the **later** games' Cyrodiil — the owner's own rule for Tamriel lore — because Arena wrote
nothing there to disagree with: **Anvil, Bruma, Bravil, Cheydinhal, Chorrol, Leyawiin, Skingrad** in
the seven free city-state slots, **Kvatch** as a town (the city the Oblivion Crisis burned), eight
towns with **Vlastarus** and **Sutch** among them, and sixteen villages from Oblivion's own list. The
module stamps the provenance line by line: names and kinds from the later games (UESP:
Oblivion:Settlements, Lore:Sutch, Online:Vlastarus/Online:Cyrodiil), directions from UESP's own words,
and **the pixel this project's own**, since nothing in Arena's install has a coordinate for a place it
never had. The file's own record — the Imperial City — is untouched, and a placeholder the table
cannot place is not a place at all (left out, with a warning).

**Measured after**: 288 settlements, **32 in every province**, no province drawing two of its own on
one pixel, **31 placed**, and a filled record booting a real city in a page — `?location=Anvil` →
`citySeed 1048696`, `city {inf: MCN.INF, blocks: 30, cells: 12 000, missing: 0}`, no boot error and no
page errors (Kvatch `CITY2.MIF`/`TCN.INF`, coastal Leyawiin `CITYW2.MIF`, desert Sutch `DCN.INF`).
**The gap named on the row**: a filled city arrives with **no greeting**, because Arena's `CITYTXT`
holds **64** greetings — eight provinces × eight city slots — and **none for the Imperial Province at
all**, not even for the Imperial City (`cityTextKey(8, 0..7)` absent). This project will not invent
prose it did not read, so nothing is shown and the browser suite pins that (*"offers no invented
arrival greeting where Arena's corpus has none"*).

**And D-40, found by checking the above and left open, because it is Arena's data**: `CITYDATA.64`
repeats two names across provinces — **`Glenpoint`** in High Rock (52,71) and Valenwood (118,141),
**`Riverbridge`** in Morrowind (226,84) and Black Marsh (253,133) — and `byName` (and therefore the
map's `?location=`) answers the first, so the second of each pair cannot be reached by name. The test
pins the exact pair.

---

---

## 4i. What this pass closed (2026-10-17, part ten — **a province's two climates, and the floor that
lied**)

**B18 · D-41 — the ground and the buildings are not the same climate.** The owner's list, and then
his correction of the first attempt (*"MORROWIND NOW JUST SAYS DESERT BUT WHEN YOU GET INTO IT ITS
COMPLETELY MOUNTAIN EVEN THE GROUND AND THERE IS NO DESERT LANDSCAPE WITH MOUNT ARCHITECTURE AND ITS
LIKE THIS FOR EVERYBODY"*). New **`src/game/provinceStyle.js`** is the law: per province a **ground**
(Morrowind desert, Elsweyr and the Summerset Isles temperate, Skyrim a latitude mix north of
`SKYRIM_SNOW_LINE = 50`), an **architecture** (Morrowind mountain, Elsweyr/Summerset desert), places
with a row of their own (**Sentinel** desert — its pixel is mountain; **Winterhold** `weather: 'snow'`),
and the **people pools** (each province's own race first and most of all, weighted, every key one of
the corpus's eight banks). The world model carries `terrainClimate` (the pixel, D-38), `climate` (the
ground), `architecture` and `weather`; the scene builds a settlement from its architecture's `.INF`
and **lays the country's floors under it** — an INF's voxel table is really two tables (`@FLOORS`
then `@WALLS`, `infFile.floorTextureCount`), and `withGroundFloors` swaps the ground climate's five
floor entries in, refusing (with the reason) when the two tables differ in length rather than
shifting an index. The map card says **both** readings, because one of them alone is what the owner
called a lie.

**Measured** — units: all three city INFs carry **5 floor entries of 59**, merged `MCN`+`DCN` is
`NROADD.IMG` (a desert road) with `DEQ.IMG` (a mountain wall); 288 settlements, 32 per province, no
province drawing two of its own on one pixel. Pages (`worldmap` **52/52**): `?location=Necrom` →
desert country, `MCN.INF`, `groundInf DCN.INF`, `merged: true`; `?location=Corinth` → temperate
country, `DCN.INF`, floors from `TCN.INF`; `?location=Winterhold` → `MCS.INF`, `weather: snow`, no
second INF; the card reads *"desert country, mountain buildings"*.

**Named gaps on the row**: the **sheets** a person is drawn from are still the archive's art (the
names follow the province; the Argonian/Khajiit art the owner asked for is queue **0f**), and the
corpus has **eight race banks with no `argonian` key** (measured), so Black Marsh's folk take the
closest names the file has. The four NPC reports are now their own rows — D-42 (the missing 360°
turn), D-43 (a person changing as you talk to them), D-44 (the stationary tavernkeeper/priest/rumour
roles), D-45 (the race art) — and the volcano is D-46; each carries its own first probe, and none of
them was measured this pass.

---

---

## 4j. What this pass closed (2026-10-17, part eleven — **the world keeps the hour**)

**B19 · D-05 — the persistent world's first half, found by probing instead of guessing.** The owner's
word twice (*"you dont understand where you are going"*, *"there is no persistency in the world like
instead there is in daggerfall enhanced"*), and queue item **0e**'s first probe was "on one page, list
what survives a change of place and what it costs". The list came back with exactly one hole, and it
was the one a player feels first: **the hour**. `game/worldState.js` has carried `clock` since it was
written (`{day, minutes}`, validated by `parseWorld` and reported by `worldSummary`) and **nothing had
ever written it** — `__debug.worldMemory().clock` read `null` on every page this project has ever
measured. `interior.js`'s `arrivalMinutes()` answered `?clock=<minutes>` or **ten in the morning**, and
`clockNow()` is `timeOfDay(radiant.day, dbg.seconds, {opensAt: arrivalMinutes()/60})`, where
`dbg.seconds` is the seconds *that page* has been standing. So every gate, stair, shop door, fast
travel, wilderness slide and reload put the world back at breakfast, for ever.

**The law, in `game/worldState.js`:** *the hour belongs to the world.* `setWorldClock(world, day,
minutes)` and `worldClock(world)` are the two doors and they meet in one normaliser (`foldClock`):
minutes fold into `[0, 1440)` with the overrun carried into the day, a day is at least one (the floor
`livingWorld.timeOfDay` already uses), and a pair that is not numbers is no clock — so a scene handing
over a **running** clock cannot write `minutes: 1500`. `plainClock` (the save's own reader) comes
through the same fold, which makes the setter, the reader, `worldSummary` and `parseWorld` one claim
rather than four.

**And in the scene** (`scenes/interior.js`, four small edits): `arrivalMinutes()` is the world's minute
unless the URL forces one; the calendar's day is `max(radiant.day, world clock day)` (`worldDay()` — a
calendar that rewinds is worse than one that is early, and neither writer can put time back);
`rememberClock()` stamps the world and saves, and is called from **every place change** (one line in
`goInPlace`, before the new scene is built), from the saves the world already makes (a door, a kill),
and from a 20-second tick so a tab closed mid-idle keeps its hour.

**Two laws older than this block shaped it, and both are the reason the fix is four edits and not one:**

* **An explicit arrival beats memory** (D-32, the `?at=` half). `?clock=` is an instruction about *this*
  page, not a fact about the world: a forced page never writes the world's hour (`clockIsForced()`), and
  `goInPlace` now **drops the parameter** from the URL it hands on — otherwise a session that began at
  `?clock=1380` would be pinned to eleven at night for ever (out of a city, up a stair, into a shop)
  while the world's own clock was ignored at every arrival. The next page takes its hour from the world,
  exactly as a player's own travel does.
* **A probe must not corrupt what it measures.** `living` and `audit` drive the shutters and the sky
  with `?clock=`; with the tick above, a forced page would have rewritten the world and the *next*
  suite's bare load would have inherited it. That is what `clockIsForced()` is for — and why `living`'s
  own arrival check (*the player arrives at ten in the morning*) is still green **without being
touched**.

**Measured, on a real install and a real page** (new suite `persist`, **12/12**; `unit/worldstate`
**552/552**, four new checks where the file had 548; `living`+`doors`+`movement` **90/90**; `audit`
**26/26**):

* a world that has never kept an hour still arrives at ten in the morning (**600** — so "the hour
  persists" cannot be bought by making every arrival midnight);
* `?clock=1330` is obeyed on arrival (**22:10**) and the world still reads `clock: null` — the *visit* is
  written down (`1 place`), the *instruction* is not;
* the player walks out of `CITYW2` through its own gate at ten past ten at night, and the country page
  opens at **22:10** with the world holding `{day: 1, minutes: 1330}`;
* a **full page load** of the country's own URL — no `?clock=` in it at all, which is the point — comes
  back at **22:10**: the tab closed and reopened, where before it was 600;
* and a settlement opened bare afterwards is at 22:10 too.

**What stays open on the row, and it is the rest of B19:** a place change is still a **full scene
re-boot** — the level, the crowd, the creatures and the light are built again (`audit`'s S-E measures a
door costing one boot in the same document). The clock had to cross that boundary first because it is
what the player feels first; what is left is swapping a payload into a living world rather than
re-running the boot. **Next first probe** for that half: on one page, time a single `goInPlace` and
list what the boot recomputes that the **world already knows** (the roster, the crowd, the hour's own
light) — the same shape as this pass's probe, and the list is the rest of the work order.

---

---

## 4k. What this pass closed (2026-10-17, part twelve — **the people of a place, drawn right**)

**B11 · D-42 — "some Npcs are not setted up well and they dont have a proper 360 walking animation or
going around him 360 animation": half a defect and half the archive.** The probe ran first
(`.scratch/peopleProbe.mjs`, which reads every people family out of `GLOBAL.BSA` by its own bytes, and
then reads the same names through this project's own readers), and it answered both halves of the
question at once:

* the **armoured roster** (`01PLTWLK.CFA`…`15MAGWLK.CFA`) is **six frames with one angle per file** —
  the angle is the file's own set digit, which `outfitsFromFolk` had already read correctly;
* the **town's men and women** (`MLGEN0#W`, `FMGENW0#`) are **one angle each** — six frames, nine for
  the set-1 pair — which is how Arena drew its commoners;
* the **watch** (`GUARD01`…`GUARD05`) and **`BABE01`…`BABE05`** are **twelve-frame view sheets** with
  Arena's layout inside one file: **walk 0–5, look 6/0/7/0, attack 8–11** — and `GUARD06`/`BABE06` are
  the three-frame deaths;
* `LGLIT0#` is three frames at 26…60 px tall, which is not a person's size (the next thing to read).

**The defect the probe found is not the one that was reported.** `actorFrame` read the layout from the
**actor** (`enemy: Boolean(actor.monster)`) and gave every actor that is not a monster `count` — *every
frame the file holds* — as its stride. On a twelve-frame sheet that means **the town's watch walked
through its own head-turn (6/7) and its sword-swing (8–11)**, in the street, in front of the player;
the `BABE` family with it. And the 360° turn the owner asked for was **already there** and is now
measured: on a page, *every person in the street is drawn from one of the archive's five angles — 48
people, views 1,2,3,4,5*, and the eye walking around one reads *from `11BARWLK.CFA` (view 1) to
`15BARWLK.CFA` (view 5)*. The half the owner cannot get is the archive's own: a **commoner has one
angle**, so no port can turn that figure — the five-angle families are the armoured roster, the watch
and `BABE`.

**The fix is in the modules, and the layout is now a property of the art:** `peopleKinds.js` gives every
kind a `layout` — `'view'` for the twelve-frame families, `'action'` for one-animation-per-file —
`townsfolk.js` carries it onto the person, `actorAnimation.actorFrame` takes a `walkFrames` reading
(clamped to the sheet, so a reading longer than the art cannot sample past it) and `interior.js` passes
`LAYOUT_WALK_FRAMES` for a `'view'` person. The old law stands where nothing was measured: a creature's
sheet is the layout, everything else is its whole sheet.

**Measured** — unit **554/554** (`unit/actoranimation.test.mjs`'s *a twelve-frame sheet strides on its
walk frames, and a nine-frame action on all nine*: the stride visits 0…5 and never 6+;
`unit/peoplekinds.test.mjs`'s *the layout is read from the family and matches the frames the archive
ships*: `GUARD0`/`BABE0` are twelve-frame `'view'` kinds, `MLGEN01/02` and `FMGEN01/05` are 6/9-frame
`'action'` kinds, and the armoured roster is six frames of one angle). Browser: **`townsfolk` + `city`
97/97**, including the new page check *and the watch walks on its walk frames, not on its head-turn or
its sword-swing* (six samples of a peaceful street, 44 batches drawn, no layout sheet past frame 5).

**The check this pass found broken, and repaired rather than loosened:** `townsfolk`'s *"T opens a
conversation with the person in front of the player"* failed on **`Bathi — a person in a habit`** — the
game's **third** heading shape, because the armoured roster is *named* too and D-10's two-shape
restatement admitted the name only in front of the unarmoured families (D-10b). The assertion is now
built out of the modules' own vocabulary (`ARMOUR_WORDS` + `peopleKinds`' four labels) with an optional
`name — ` in front, so a fourth description fails it instead of slipping through, and it still refuses
a heading made of words this project never wrote.

**What this pass hands on, in the order the owner's own message puts it** (queue §5, items **0h** the
people's identity while you talk — D-43, **0i** Arena's stationary roles — D-44, **0f** whose faces
these are — D-45 with the family table now measured, **0e** the seamless world — *"barely moving in the
persistent world reloads the game and its unplayable"*, **0l** the two map levels coherent, **0m**
Winterhold's snow and every biome's own background).

---

## 5. The queue — what the next sessions take, in order

Each entry names **the first probe**, because a block starts with a measurement.

**This pass (§4n) closed B21 (the automap) and verified the eighteenth pass's B26 / B11 work** —
one Tamriel grid, the gate walked through, the province's own people, the still folk, chasm depth
with a climb — on its own suites (172/172) and the unit set (643/643). Nothing below changed
order: the resident country is still the loudest open item.

0. ~~**B24 continued · the tables out of the unpacked image**~~ **THE STRING TABLES ARE READ
   (`a9aa3a6`, §4f)**: thirty of them, the creature art joined and D-29/D-30's Minotaur settled.
   **What is left of this block, and it is two different jobs:**
   0a. **Wire the tables that are read and unused.** The calendar (twelve months, seven weekdays,
   fifteen holidays), the sixty-four settlements with their eight capitals in province order, the
   class and race prose: each is read by `exeTables.js` today and consumed by nothing. First probe:
   for each of the three, name the module that should read it instead of its own hand-made table
   (`engine/systems/gameDate.js`'s month and day names against the executable's own, `worldMap.js`'s
   settlement list against the sixty-four, `chargen.js`'s class blurbs against the game's) and
   report every disagreement before changing one — the same shape as the Minotaur: the exe's answer
   is not automatically better, it is *the game's*, and the disagreements are the finding.
   0b. **The image's numeric tables.** The byte rows behind the holidays (`04 01 00 04 01 01 …` —
   fifteen of them, a month/day pair and something else), the word ladder after the noble ranks
   (`0e 00 2d 00 42 00 …`), the creature stat rows around `224690`, the spawn and rest tables that
   blocks B10/B11 have been calling *this project's own rule* for want of them. These are **not**
   string tables, so the reader's method does not transfer as-is: the first probe is to find, for
   each, a **constraint the numbers must satisfy** (a month 1…12 followed by a day 1…31, a ladder that
   sums to the table's own length, a hit-point pair whose range brackets the port's own UESP numbers)
   — a number read out of a code image with nothing to check it against is not a reading, it is a
   coincidence with an offset. This is the half of B24 where the owner's *"decompile all of Arena"*
   still has real work left.
0b. **B23 · dungeon depth — the level below with water in it** (D-28, the owner's evening report).
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
0c. **B16 · the later lore's own words for Cyrodiil** (D-39's named gap, §4h). The places boot and the
   markers are their own; what a player does not get is what every other Arena city says on arrival.
   `CITYTXT` holds **64** greetings — eight provinces × eight city slots — and **none for the Imperial
   Province**, not even for the Imperial City. First probe: read the later games'
   own arrival prose for the 31 (Oblivion's place descriptions and loading texts, UESP) and settle
   whether this project may use it — the standing rule is that prose is either the install's own or
   stamped as this project's, so the decision comes *before* the wiring. The same pass can give a
   **town** a greeting at all (today only `kind === 'city'` is looked up), which is older than the
   fill and affects every province.
0d. **B16 · a name is not a world address** (D-40). `?location=Glenpoint` always lands in High Rock
   and `?location=Riverbridge` always in Morrowind, because the file repeats both names across
   provinces and `byName` answers the first match. First probe: boot one page per repetition and read
   where they land (`?location=Glenpoint` twice), then choose the rule — a province-qualified arrival
   (`&province=`, the way a dungeon is addressed by seed), or the world's own disambiguation with the
   file's provenance written on it.
0f. **B11/B18 · whose faces these are** (D-45, and the *art* half of D-41). The **names** a province's
   people carry are the province's own now (`game/provinceStyle.js`); the **sheets** are the
   archive's, and the owner asked for Khajiit in Elsweyr, Dunmer in Morrowind, Nords in Skyrim and
   lizardmen standing in for Argonians. **THE FIRST HALF OF THE PROBE RAN** (§4k, `.scratch/peopleProbe.mjs`):
   fourteen families, and their own bytes — the **armoured roster** is six frames with **one angle per
   file** (the angle is the file's set digit), the **town's men and women** (`MLGEN0#W`/`FMGENW0#`) are
   **one angle each** (six frames, nine for the set-1 pair), the **watch** (`GUARD01–05`) and
   **`BABE01–05`** are **twelve-frame view sheets** (walk 0–5, look 6/0/7/0, attack 8–11), `GUARD06`
   and `BABE06` are three-frame deaths, and **`LGLIT0#` is three frames at `h26…60`** — too small to be
   a person, which is the next thing to read. **What is left of this item, and it is the owner's own
   request:** which way a province's folk are *drawn*. The archive ships no Khajiit, no Argonian and
   no Dunmer skin, and **no lizard-named `.CFA` at all** (measured), so the honest options are the
   creature art this install *does* carry (the Lizardman's sheets stand in for Argonians, the way
   `PAT#` turned out to be the Minotaur's) and a per-province choice among the fourteen families the
   archive has. First probe: for each family, what the figure reads as (a screenshot of one view per
   family, five angles), then the mapping with the provenance written on it — Arena's art where
   Arena has it, this project's substitution where it does not, stamped as such.
0g. **B17 · the country's landmarks** — the volcano is the one the owner named (D-46: *"in morrowind
   you still cant see a vulcano"*), and it is the cheapest honest one: a world-map *bitmap* cannot be
   drawn on (`TAMRIEL.IMG` and the nine province maps are Arena's own art), but the country is this
   project's, and `TERRAIN.IMG`'s own mountain classes already mark Red Mountain's pixel. First
   probe: what the Morrowind province bitmap shows at that pixel, and what `arenaSky`/the wilderness
   window draw over a Morrowind city today — then a **country feature** the terrain classes already
   imply, with the same rule as a ruin's door (one feature per place, deterministic from the seed).
0h. **B11 · a person's own identity, while the player is looking at them** (D-43, the owner's *"when you
   speak to them they change character sometimes"*). The crowd's art, its kind and its armour are
   chosen when the level is built; `livingWorld.js` guards a *class/arm/flag* change with
   `allowChange = !row.visible || allowChange` — i.e. a person in view is not supposed to be
   re-dressed — and the talk panel holds a `person` object while it is open. First probe: talk to
   twenty people in a row on one page and print each one's `key`, `armour`, `factions.kind` and
   `file` **before the panel opens, while it is open, and after it closes**; a change of identity
   while a player is looking at them is the bug whether or not it is what the owner saw. Owning
   block: **B11** (the people), check: `townsfolk` + a new unit test on the identity record.
0i. **B11 · Arena's own stationary roles** (D-44, the owner: *"you should add the npcs that dont move
   from the original arena the one in taverns the priest the ones you can ask rumors … they are
   probably object and not entities in the original arena"*). Arena places its tavernkeeper, its
   priest and its rumour-givers as **records in the map** (the `*ITEM` people spots this port already
   reads — Daggerfall's `CITYW2.MIF` places nineteen), and the port gives **every** person a day plan
   (`livingWorld.js`) so a keeper who should stand at a counter walks the street instead. First probe:
   for one city, list the level's own people spots with their `role` and cell, then watch each of them
   for an hour of in-page clock (`__debug.setClock`) and print how many ever leave their spawn cell:
   the ones that never move are the roles the port drew as wanderers. The fix is a *plan* change, not
   a new entity — a keeper's day begins and ends at their own cell (which is also what the taverns
   and temples of D-44's list need: an owner standing still is a shop you can talk to). Owning block:
   **B11** with **B18**'s trades; check: `townsfolk`, `doors`, `living`.
0l. **B16 · the two map levels, made coherent** (the owner: *"the big map and the region maps
   coherence needs to be redone in order for it to be visually and technically coherent and develop a
   persistent world"*). The world map is the continent with its nine provinces and the province maps
   are the game's own hand-drawn plates (`MAPOUT.CIF`/`MAPBLINK.CIF` icons, `OUTPROV.CIF` plates),
   and §4h/§4i put the climate, the province and the markers right; what has never been **read as one
   picture** is the pair: the same place on the continent, on the province plate, on the marker card
   and in the country the player walks. First probe: for three settlements chosen for their edges
   (a coastal city-state, a two-province name like `Glenpoint`, a `cyrodiil.js` fill), print the
   place's pixel on both maps, its province rectangle, its climate, its seed and the URL its marker
   builds, and check the four agree — then fix what disagrees in the *world model*, never in a
   drawing routine. Owning block: **B16**; check: `worldmap`, `unit/worldmap`, `unit/mapscreen`.
0m. **B18 · the sky a province never stops doing, and every biome's own background** (the owner:
   *"in winterhold it never needs to stop snowing"*, and *"make sure the backgrounds are correct for
   every biome"*). `provinceStyle.js` already gives Winterhold `weather: 'snow'` and the level's
   `.INF` letter is honoured (`MCS.INF`) — what no probe has shown is the **precipitation and the
   background** a player sees: D-23 (*"there is no front that moves, no per-climate ground mix"*)
   still stands. First probe: on one page per climate, read `state().sky`/`sceneLighting` and take a
   screenshot at the horizon, then compare the three climates' skylines and their weather — the
   claim to test is *"a desert's horizon is not a temperate one's, and Winterhold's snow does not
   stop"*, and each biome's answer belongs in `game/arenaSky.js`/`sceneLighting.js` rather than in a
   scene. Owning block: **B18**; check: `scenevisuals`, `sky`, `unit/sky`, `unit/lighting`.
0e. **B19 · a persistent world** — the owner's own words, twice: *"you dont understand where you are
   going and there is no persistency in the world like instead there is in daggerfall enhanced"* — and
   then, of the country: *"barely moving in the persistent world reloads the game and its unplayable"*,
   which is the same row said louder: a slide re-boots the whole scene every 64 cells, so the world is
   re-made under the player's feet. **The standard this block is judged against has now been READ
   (§1b)**: *Daggerfall Enhanced* and *Daggerfall Online* are earlier names of **DFO Online**, a
   JavaScript + WebGL2 browser reimplementation whose own documents split the state **exactly as this
   project does** — a shared **world half** (doors, loot, kills, standing, quests, **time at 1 Hz**) and
   a private **character, inventory and quest half** — with the save envelope itself as the wire format,
   a snapshot then deltas. Its room/host machinery (a Worker, one Durable Object per room, a WebSocket
   relay) is a *multiplayer* answer to a question this project has not been asked, so it is recorded in
   §1b rather than built; what the standard confirms is that **the remaining work is not a save rewrite
   but the world half being complete (the two loose fields, `weather` and `player`) and the scene
   keeping it in hand instead of re-booting**.
   **THE PROBE RAN AND HALF THE BLOCK IS CLOSED (§4j)**: the list of what survives a change of place
   came back with one hole, the **hour**, and the world keeps it now (`worldState.setWorldClock`/
   `worldClock`, `interior.js`'s `rememberClock`; held by the new `persist` suite, 12/12). **What is
   left of the block is the other half of the same list** — a place change is still a **scene
   re-boot** (`goInPlace`: the level, the crowd, the creatures and the light are built again from the
   save, never carried; D-36 measured one `goInPlace` per 64 cells of walking). First probe: on one
   page, time a single `goInPlace` and list what the boot recomputes that the **world already knows**
   (the roster, the crowd, the hour's own light) — that list is the remaining work order, and the
   shape of the fix is D-36's: the boot's URL carries what the player must not lose.
   **The seams, already located for that probe:** the world's memory is one object with a
   field-first API (`src/game/worldState.js`: `visitPlace`, `setDoorState`/`doorStateAt`, `noteKill`,
   `regard`, `quests`, `worldSummary`), the scene writes it at `interior.js:1676` (a door read),
   `:1955` (a place visited), `:1979` (a door set), `:6317` (a kill noted), and the page exposes it as
   **`__debug.worldMemory()`** (`interior.js:8035` — a place key plus `worldSummary`), with
   `__debug.setClock(minutes)` beside it. A probe that reads those before and after one forced place
   change (`__debug.leave()`, D-34's own exit) answers the whole question in one run.

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
   creatures (D-02a) there, and enter wild buildings. **A dungeon's door out here is closed
   (§4c, D-34)**, and what is left of the *door* part is the country's own ruins as entrances — a
   ruin nothing points at is inert today, which is one rule (an identity per ruin block) and the
   cheapest thing left on this block after that.
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

## 4l. What this pass closed (2026-10-16, part thirteen — **the people turn, and a province's street is its own**)

**B11 · D-47 — the archive's sprite digit is a direction, and five figures were read out of five
directions.** Queue item **0h**'s probe ran and answered *no* (`.scratch/talkidentity.mjs`, 20
people; `.scratch/talkrepeat.mjs`, eight presses) — the talk panel's heading never disagrees with
the person in front of the player — and D-43's own row was found to cite a symbol that is not in
the tree (`livingWorld.js`'s `allowChange`; grep: nothing). What *was* wrong is the reading
`peopleKinds.js` had carried since the previous pass: `MLGEN01…05` are **one man at five
directions**, not five men at one angle each. The evidence is OpenTESArena's own template
(`ExeData.h`'s `0@XXX`: the first digit is the gender, `@` the direction 1…5;
`ArenaAnimUtils::trySetHumanFilenameGender` implements `filename[0] = isMale ? '0' : '1'`;
`Directions = 8` with `FirstMirroredAnimID = 6`) *and* the archive's own widths (40/55/69/56/38,
symmetric about a profile, identical under every armour word). One kind per family with
per-direction `actions`; the scene asks by `viewFacing`; a talk and a death follow the direction
too. **Measured**: a man of the town reads `MLGEN01W.CFA` (view 1) → `MLGEN05W.CFA` (view 5) as
the eye orbits.

**B11/B18 · D-45 (the art half) — whose faces a province's street is made of.** Queue item **0f**.
The archive draws **one human body** and ships **no palette** for a per-race recolour (extensions
`IMG MIF CFA SET INF DFA VOC RMD CIF XFM XMI` — no `.COL`, no `.PAL`), so the half that is real
art is the one the owner named: `LIZARD1…6.CFA`, the Lizard Man's five directions and its death,
read as a kind (`standInKindsFromListing`) and put on Black Marsh's streets by a new per-province
pool (`provinceStyle.PEOPLE_ART`/`peopleArtFor`, `placeTownsfolk`'s `art`). **Measured on real
pages**: Lilmoth and Stormhold **27 of 48** figures are `LIZARD` sheets; Daggerfall and Necrom
**0**. The open half is named on the row: the recolour rule is in `ACD.EXE` (B24's numeric tables,
queue item 0b) or is stamped as this project's own — never invented quietly.

**What this pass hands on, in the queue's own order:** **0i** (D-44, *"the npcs that dont move"* —
probe first: a city's own people spots and how many ever leave their spawn cell), **0g** (the
volcano), **0l** (the two map levels, made coherent), **0m** (Winterhold's snow and every biome's
background), **0e** (the persistent world — *"barely moving … reloads the game and its
unplayable"*), and **0b**'s numeric tables (the executable's own recolour rule), which D-45 now
gives a second reason to read.
## 4m. What this pass closed (2026-10-16, part fourteen — **the gate is a way through, and the world reloads every 160 m**)

**One item closed, one item measured, one claim verified.**

**0a (D-48) · the settlement gate has no collision — DONE (`a16d551`).** The owner's own
priority, sent while the previous pass was running. Every shipped skeleton cuts exactly one
two-cell opening in its outermost line and hangs the game's gateway art in it — a `0x9`
transparent voxel — and the decoder read `solid` off that voxel's byte, so walking at the gate
stopped against the art and the country opened only through a push rule (D-27). `mifLevel.js`'s
new `openSettlementGate` marks the opening `gateway: true`; the mesher keeps it out of the
collision soup and keeps drawing it exactly as the file says; the scene's walkability test reads
the same flag. **Measured**: all **twenty** settlement skeletons (the file count is 20, not the
16 an earlier note guessed — `CITY1…5`, `CITYW1…3`, `TOWN1…5`, `TOWNW1…2`, `VILLAGE1…5`) open
one two-cell run; a `0x9` run on a **building's** own line is refused whole, which is what the
sweep over all 526 `.MIF` records showed was needed (a block's line carries runs of fourteen, or
a run on each of two lines); `colliderTris` falls by exactly the gate's quads while the drawn mesh
is byte-identical. **Seen on a page** (`movement` 12/12): the assembled city reports its two
gateway cells and walking at the gate leaves the city on foot with no keypress.

The same block carries **D-49**, and it is worth the ink: the gate code the previous pass left had
**never been booted** — it wrote the flag onto `current` four hundred lines before `current` is
built, so every city and country page died with *"Cannot set properties of null (setting
'gateway')"*. The suite that would have caught it (`movement`) was on that pass's *not re-run*
list. The lesson is the file's own (D-34): a new name beside the loader is where a scope mistake
hides.

**0e (B19/D-36) · the country reloads itself — MEASURED, not fixed.** `.scratch/slideidle.mjs`
on one country page: standing still for eight seconds re-boots nothing (`painted` 20 → 105); then
holding `W` climbs the frame counter to 380 over 19 s and **drops it to 6** — a page re-boot, the
window origin moving 64 cells, the player's cell and bearing kept (D-36's fix holding). So the
country re-boots **once per 64 cells of travel ≈ 160 m ≈ 20 s of walking**. That is the owner's
*"barely moving … reloads the game and its unplayable"*, and the cost is not the slide's position
— the window is the original's own mechanism — but that the slide is a **new page**: level,
crowd, creatures, light and sky all rebuilt from the save, and the country's folk re-rolled.

The block that fixes it is **B25 (new): one resident country.** Its first step is not code, it is
the probe the queue already names — *time one `goInPlace` on a page and list what the boot
recomputes that the world already knows* (level geometry and collider, textures uploaded from the
BSA, the crowd's placement, the sky's blend, the save read) — so the shift can be measured against
the boot it replaces. Only then: shift the window in place, keeping the blocks that did not change
and building only the new strip.

**0m (B18) · Winterhold never stops snowing — VERIFIED, with nothing forced.** The `city` suite's
two checks boot the real place by name (`?location=Winterhold`, no `?weather=`) and sample six
seconds of its air: its own `MCS.INF`, its own snow sky, and `mode: snow` with particles at every
sample. `city` **40/40** (38 before + these two).

**Also**: the `persist` suite's corner check is **restated** (logged in `DEFECTS.md`): it waited 21
wall seconds for a tick that counts *simulated* seconds, which on a software renderer lands at wall
second 25 — so the wait is now for the save to name the cell, bounded and reported (24 s), and
`persist` is **14/14**. A bare page really does return the player to the corner the world
remembers.

**Next, in the queue's own order** (unchanged otherwise): **0i** (D-44, the roles that never
move — probe as written), **0b/B24** (the executable's tables, now with the race recolour as a
second reason), **0l** (the two map levels, one picture — the owner's *"the big map and the
region maps coherence needs to be redone"*), **0g** (the volcano, D-46), **0e/B25** (the resident
country, above), then **0c/0d** and P2/P3's big ones.

## 4n. What this pass closed (2026-10-17, part fifteen — **the level has a map again, and the country is one Tamriel**)

**B21 · THE AUTOMAP — CLOSED.** The ledger had carried it as `[ ] nothing yet` since the first
pass. `M` was the world map everywhere, so inside a dungeon, a shop or the palace the one key a
player presses when lost opened the **continent** — which is exactly the owner's *"you dont
understand where you are going"*. The reference was in the checkout all along: OpenTESArena's
`Interface/AutomapUiMVC.{h,cpp}`.

**The key is `Tab`, and `M` was returned.** The first cut of this pass bound the sheet to `M` in
interiors and the owner reported the regression: *"your local map made it impossible to open the
entire tamriel map the game had cause you put it on M"*. `M` now always opens Tamriel — from a
city, from the country **and from inside a dungeon** (it closes the sheet, giving back the pause,
then opens the world map) — and the automap is on `Tab`, closed by `Tab` or `Escape`, with its own
"world map of Tamriel" button on the sheet. The suite's first two checks assert both halves from
the same room.

**What was ported, number for number.** The eight automap colours (`ColorWall(130,89,48)`,
`ColorRaised(97,85,60)`, `ColorDoor(146,0,0)`, `ColorLevelUp(0,105,0)`,
`ColorLevelDown(0,0,255)`, `ColorDryChasm(20,40,40)`, `ColorWetChasm(109,138,174)`,
`ColorLavaChasm(255,0,0)`, `ColorPlayer(247,255,0)`); `getPixelColor`'s own cases — a dry chasm
under a wall is `raised`, water and lava ignore everything but a raised platform, a hedge (a
transparent wall **with** collision) is a wall while an archway is floor, a diagonal is floor, a
door/gate/Enter/Exit is `door`, and the `.INF`'s own stair art is `levelUp`/`levelDown`; and
`PlayerArrowPatterns`, the eight 3×3 arrows, with `PixelSize = 3` keeping the cell scale a
multiple of three so one arrow sub-pixel is a whole canvas pixel.

**What is this project's, stamped in the header.** The **whole level fitted to the panel**
(the reference scrolls a 3-chunk window with a quill cursor; a browser panel has the room, and a
fitted map answers "where am I" in one look); the **screen compass** (`+col` east, `+row` south —
`tamrielGrid.pixelOfCell`'s own axes, so the automap and the world map agree about north); and
**no fog of war**, because `makeAutomap` builds from the level's loaded chunks and has none. If
the original revealed its map cell by cell, that is a later rule laid on top of this law, not a
silent invention now.

**Measured.** `unit/automap.test.mjs` **15/15** — every classification arm on a fixture, the
eight patterns (inside the cell, unique, distinct), the eight yaw sectors, marker clamping, the
layout's multiple of three, a recording canvas (parchment, wall ink, 3×3 yellow arrow in the
player's cell), and **START.MIF itself** (686 floors / 1535 walls / 14 doors / exactly 1 up-stair,
the spawn on a floor cell). `automap` browser suite **13/13** — the real page: `M` in a dungeon
still opens **Tamriel** and not the sheet, `Tab` then opens the automap on START.MIF, the panel
prints the level's own counts, the canvas really has 55 516 parchment / 121 014 wall / 27 arrow
pixels at cell scale 9, the marker is `floor(feet/2.5)` on both axes, a quarter turn changes
east→south, **the sheet's button hands over to Tamriel**, Escape closes it and resumes the world,
**a tavern interior draws the same sheet**, and a city's `M` still opens the world map while its
`Tab` offers nothing. **Cost**: one
`buildAutomap` is **1.0 ms cold / 0.22 ms warm** on a 50×50 level (ten builds in Node), taken
once per level load — never in the frame loop.

**THE IN-FLIGHT PASS, VERIFIED (not new in this pass, but unverified until now).** The large
uncommitted work — **one Tamriel grid** (`tamrielGrid.js`: 256 cells a pixel, `TERRAIN.IMG`'s
coastline and biome, every settlement on its own pixel, `?wild=` world cells, the gate walked
through), the **ruin door** in that country (`dungeonSurface.js`), the **province's own people**
(`raceSkin.js`: a palette race is Arena's body under a six-entry skin ladder; an Argonian is the
**Lizard Man's whole figure**, `RACE_FIGURE`), the **still folk and the court**
(`staticFolk.js`: `KING`/`QUEEN`/`PRINCE`/`PRINCESS`, tavern patrons `MAN01…04`/`WOMAN01…04`),
and **chasm depth with a ledge climb** (`mifMesh` 1.2/1.55/1.0 m, `motor.ledgeClimbing` measured
from the water line) — was run through its own suites this pass: `movement` **12/12**, `world`
**31/31**, `persist` **14/14**, `townsfolk` **69/69**, `living` **46/46** = **172/172**, and unit
**643/643** (628 + the automap's 15).

**Two checks restated, with the law they were measuring.** `townsfolk` required every person's
sheet key to end `#<race>`. That is true of a **palette race** and false of a **figure race**:
`LIZARD1.CFA` is the Argonian's whole art, and a suffix there would lay a second skin over the
art that already is the race (the "green people" the owner refused). The checks now require
`person.race` for everyone and the matching suffix **when the sheet is a palette race**; both
pass with 48/48 carrying their race (Lilmoth 92% Argonian, Necrom 67% Dark Elf).

**Docs restored.** `docs/` was **deleted in the working tree** (tracked deletions) when this pass
began; `git checkout -- docs` brought the thirteen documents back from `HEAD`, and this section,
`AGENT_STATE.md`, `DEFECTS.md`'s D-45 row, `ROADMAP.md` and `ARCHITECTURE.md` now describe both
passes. The hash for this work is owed on commit — the tree still holds the eighteenth pass
uncommitted as well, so the commit that lands them is the one to write into these rows.

## 4o. What this pass closed (2026-10-17, part sixteen — **the door is the wall's own art**)

**D-51 · EVERY CITY DOOR IS ENTERABLE, AND IT IS THE DOOR THE PLAYER SEES.** The owner: *"all
doors in the game should be enterable and i mean the texture of a door on a wall instead the
houses and royal palaces are linked to a weird little sprite that is the clothes hanging to dry"*.
The reference had the law all along, in OpenTESArena's `World/MapGeneration.cpp`, function
`tryMakeVoxelTransitionDefGenInfo`, and it reads **two** cases: `isWall = mostSigByte ===
leastSigByte` (texture `most − 1`) **or** `isEdge` (texture `(leastSigByte & 0x3F) − 1`), and then
asks `INFFile::getMenuIndex(textureIndex)` which `*MENU` slot (if any) binds that texture. The
port had implemented only the edge case **and** had substituted a pair rule (`T_T…` art after each
slot) for `getMenuIndex`, which is why the laundry sign — the *next* entry after a house slot, not
a slot — became the way into a house while every real door painted on a wall stayed solid.

**Measured from the player's own archive.** All 368 block `.MIF`s were walked:
**wall** cells bound by a menu slot carry exactly eight textures — 5 `T_DEQ` (167 cells), 10
`T_DTAV` (190), 16 `T_DMU` (54), 23 `T_DTEP` (84), 30/35/40 `T_DBS1..3` (1 040 + 879 + 1 688) and
53 `T_DNB1` (180) = **3 925 doors** — and the `0xA` edges carry exactly five **sign** indices — 6
`T_TEQ` (167), 11 `T_TTAV` (186), 17 `T_TMU` (49), 24 `T_TTEP` (84), 47 `TLAUNDRY` (60). One sign
per shop and no sign per home: in Daggerfall's city, **23 equipment signs for 23 equipment doors,
19 tavern signs for 19 tavern doors**, while **345 house doors share 60 laundry signs**.

**The law, ported.** `game/shops.js` exports `MENU_SLOT_INTERIORS` — the reference's city table:
0 equipment, 1 tavern, 2 Mages Guild, 3 temple, 4/5/6 house, 9 noble, 11/12/13 palace — and
`interiorKindOfTexture(inf, textureIndex)`, which is `inf.menus.indexOf(texture)` then that table;
`cityDoors` scans **wall and edge** cells, records the door's own art as `sign`, marks `wall`, and
gives every wall door a `stand` cell (`doorStand`: the first walkable neighbour) because a player
cannot stand in the wall. A wall whose art is a door but which no slot binds is a **house**,
which is the owner's *"every texture of a door … should be an enterable house"*. The palace is
still one marked house door nearest the middle of a city (this install's blocks draw no 11–13
door art), and a village still gets none.

**What changed in the scene.** `doorNear` measures to the door **or its stand cell**, so `E`
works anywhere on the paving in front of a door rather than only in its centre; `teleportToDoor`
stands on `stand`; `enterDoor`'s `?at=` (the return URL) is the stand cell, so leaving a building
puts the player back on the paving they entered from instead of snapping diagonally to the
nearest walkable cell. The HUD names the room (`This is a house — press E at the door to go in.`)
and the city line counts doors, not signs.

**Measured.** `unit/shops` **11/11** (all 368 blocks; the 421 doors of one city; no sign is a door;
every stand cell walkable; one palace in a city and none in a village). Browser `doors` **49/49**:
equipment, tavern, house, temple and palace round trips from the paving, the wall art names the
room, hanging signs are refused, 353 of 356 doors in the tested city are reachable (the 3 facing
masonry are counted, not hidden), and `M`/`Tab` from the automap pass are untouched. Around it:
`commerce` 25/25, `guilds` 13/13, `living` 46/46, `townsfolk` 69/69, `movement` 12/12 (the gate
still walks through), `persist` 14/14, unit **643/643**.

The **country's** doors are §4p below: the same law against the wilderness's own table.

## 4p. What this pass closed (2026-10-17, part seventeen — **the country has doors too**)

**D-51, the other half.** The owner's law — *"every texture of a door that is not a shop or a guild or a
door that leads you out of the settlement … should be an enterable house"* — is not a city law. The
wilderness is the same mechanism against a different table, and OpenTESArena says so in
`tryGetInteriorTypeFromMenuIndex` (`MapType::Wilderness`): **1 crypt, 2 house, 3 tavern, 4 temple,
5 tower**, with 6/7 the city gate and 8/9 the dungeon. The port had never asked the wilderness `.INF`
anything, so a farmhouse, a tavern, a temple, a tower or a crypt was solid wall from every side, and
the only wilderness building with an entrance was a dungeon (through the ruin's own flat).

**Measured from the archive.** All eight shipped wilderness INFs (`TWN`, `TWS`, `TWR`, `DWN`, `DWR`,
`MWN`, `MWS`, `MWR` — the ninth, `DWS`, is absent) bind the same fifteen slots to the same art, and
slot 0 is a **barn** door (`TZDBARN.IMG`) which the reference maps to *none*. Decoding every `.RMD`
against `TWN.INF` then counting wall cells whose art a slot binds: **123 `TZDFARM.IMG`, 31 `TZDBARN.IMG`,
19 `TZDTAV.IMG`, 17 `TZDTEP.IMG`, 13 `TZDTOWER.IMG`, 6 `TZDCRYPT.IMG`** — the country's doors, all of
them painted on walls, plus the gate's two posts and the dungeon mouth which are not doors.

**The law, ported.** `game/shops.js` exports `MENU_SLOT_WILDERNESS` (`0` barn → a **house**, because a
barn is a building and the owner's law is every door; `1` crypt, `2` house, `3` tavern, `4` temple,
`5` tower) and `wildDoors({ level, inf, blocks })`, which walks the window exactly as `cityDoors` walks
a city: wall or walk-through edge, `interiorKindOfTexture(inf, sideTexture, 'wilderness')`,
`doorStand` for the cell it opens from, the art as `sign`. Which of the eight interiors is the block's
own number plus the window's quadrant (a `.RMD` carries no rotation letter) — **RECONSTRUCTED**, and
said so. `interiorKindOfTexture` grew a `mapType`, because the two tables share slot **numbers** and not
meanings: the wrong table answers a door that is not there. `SHOP_KINDS` gained `crypt` (`WCRYPT1…8`)
and `tower` (`TOWER1…8`); a crypt holds nobody (`BUILDING_FOLK.crypt = 0`), a tower keeps one.

**What changed in the scene.** A country window gets `doors` from `wildDoors` and every reader of them
follows for free — `doorNear`, the HUD line (*"This is a tavern — press E at the door to go in."*),
`E`, the keeper, the spawn. The one thing that had to be country-specific is the **way back**: a city
door returns through `?at=` (a cell of the city), while a country page names its cell in world
coordinates, so `enterDoor` writes `?wild=row,col` for a `door.country` and the player lands on the same
world cell they entered from — even when the window re-centres a block on the way back (measured:
entered from window cell 31,32 of origin 17344, returned at window cell 95,32 of origin 17280 — **the
same world cell 17375,11872**).

**Measured.** `unit/shops` **14/14** (all 66 `.RMD`s: 209 doors, 154 houses/barns, 19 taverns, 17
temples, 13 towers, 6 crypts; every door's file is a real family; one unreachable door named). Browser
`doors` **54/54**: in the country outside Daggerfall, `DTAV.IMG` opens `TAVERN5.MIF`, the room is a
building with its own kind, and leaving puts the player back on the world cell they came from. Around
it: `movement` 12/12 (the gate crossing is untouched), `living` 46/46, `persist` 14/14, `townsfolk`
69/69, `world` 31/31, `commerce` 25/25, `guilds` 13/13, unit **646/646**.

**The tomb was empty, and that was a bug of this pass (D-52).** The probe that opened this section
went further than the door: `WCRYPT.INF` names eight species and every crypt and tower level answers
`monsterCountFor` **7**, and `?interior=WCRYPT1.MIF` fielded six — but the page a **door** reaches
fielded none. `populate` decided `inhabited = inCity || Boolean(entryCell)`, so the `?enter=` a door
writes (how every settlement building says "somebody is home") also quieted a tomb. `inhabited` is
now the **building's kind**: `shopForInteriorFile(mapName)?.kind` — `crypt` and `tower` are **lairs**
and keep their roster, everything else stays a household. Measured after the fix: `WCRYPT4.MIF` by
its own country door → **6 creatures**, 0 townsfolk, treasure and key still on the floor; `doors`
**59/59**.

**Still open, named.** The crypt is a lair now but its **deeper storeys** are only reachable by stairs
the levels themselves draw — a probe of `WCRYPT1…8`'s second, third and fourth floors for stairs and
for the roster their own INFs (`crypt2/3/4.inf`, 23 species) name is the next step on B12.

## 4q. What this pass closed (2026-10-17, part eighteen — **the other half of the stairway**)

**D-53 · a tomb's depth was drawn, and unreachable.** The pass that opened the country's doors
found the crypts holding their own rosters (seven creatures per level, out of `WCRYPT.INF`'s eight
species and `crypt2/3/4.inf`'s twenty-three) — and the storey holding them **unreachable**. Measured
over every interior `.MIF` with more than one level: a stairway is one cell drawn in the two levels it
joins, and the archive keeps both ends for towers, noble houses and several shops, but **only one**
for the crypts (`WCRYPT1…8`: level 0, the entrance, has no stair at all; level 1 has a single
`*LEVELUP` cell at (18,3)), for the palaces (`PALACE1…5`, `TOWNPAL1…3`, `VILPAL1…3`) and for the
tavern/temple/Mage/equipment rooms whose second level is unused data.

**The rule, and where it comes from.** `mifLevel.js`'s `fillStairPair` reads the pair out of the
data's own half: the lower level's `*LEVELUP` cell says **where**, this level's own `*LEVELDOWN` art
says **what**, and the cell must be a wall of this level — or the nearest wall within two cells when
the floor above is open there (which is `WCRYPT1`'s shape). A level that already has a down stair is
left exactly as the file drew it (a second one would be two ways into one storey), the archive's
bytes are copied and never mutated, and only a **lair** is completed in the scene: a shop's unused
upper floor is not a place the file means anybody to go. Stamped as this project's rule — Arena's own
placements are in `A.EXE` (D11).

**Measured.** All eight crypts gain their descent — `WCRYPT1` (16,1), `WCRYPT2/8` (17,2), `WCRYPT4`
(17,4) and the rest within three cells of the lower stair — every one of them inside `DOOR_REACH` of
the paving beside it (`stairs().filled.at[0].stand`). In the browser, `WCRYPT4` entered from its
country door: down stair at (17,4) → **level 2/4 with six creatures**, up stair at (18,3) → back to
level 1/4. `unit/mif` **27/27** (three new checks: the pair is completed, a whole pair is left alone,
all eight crypts descend), `doors` **63/63**, `dungeonplay` 31/31, unit **649/649**.

**Still open, named.** Crypt levels 2 and 3 carry **no stair in either direction**, so a crypt is two
storeys (entrance + one below) rather than four; completing those needs a rule for a level with no
data half at all, which is a different (and more invented) question than the pair this pass closed.

## 4r. What this pass closed (2026-10-17, part nineteen — **every village was a city**)

**D-54 · the record's kind, not its index.** The doors pass (D-51) left one number it could not
explain: a sweep of all 288 settlements gave **216 cities, 72 towns and no villages at all**. The
cause was one line in `scenes/interior.js`: `cityRequestOf` asked `cityTypeOf(place.index)` — the
executable's `getCityType(localCityID)`, which expects Arena's **flat** province-local id (0–7
city-states, 8–15 towns, 16–31 villages). `parseCityData` hands each record its **own** `index` (a
town is 0…7 again, a village 0…15) *and* the `kind` it was read under, so every town read as a
city-state and every village as a city or a town. A settlement whose record says `village` is built
from `VILLAGE1…5`/`VILLAGW1…3` on a 4×4 block grid, a town from `TOWN*` on 5×5, a city from `CITY*`
on 6×6 (`CITY_BLOCKS_PER_SIDE`, unchanged); `SETTLEMENT_KINDS.has(place.kind)` is the law and
`cityTypeOf` survives only as the fallback for a record built without a kind.

**Measured.** 72/72/144 — the file's own eight cities, eight towns and sixteen villages per province
— and the world's painted doors with them: **71 648** over the 288 settlements (28 628 city, 18 135
town, 24 885 village), each bound to an interior that exists in `GLOBAL.BSA`, and **0** door-art
wall cells left as plain wall. 586 of them (0.8 %) are painted where no paving faces them and are
listed with `stand: null` rather than hidden. In a page: `?location=Reich Gradkeep` →
`VILLAGW1.MIF`, 124×124, 4×4 blocks, 199 doors, **no palace** (the palace rule is a city's, D-51),
its gate on the east wall; `?location=Old Gate` → `TOWNW1.MIF`, 5×5, 221 doors; Daggerfall unchanged
(`CITYW2.MIF`, 356 doors, one palace).

**D-55 · and a check that had stopped measuring.** Verifying the sweep meant running `audit`, which
was **17/26**: its three country windows all sat at `1024,1024` — "the middle of the 64×64-block
grid, away from any settlement", i.e. the settlement's *private* wilderness, which the one-Tamriel
grid replaced — and that cell is **open sea** on `TERRAIN.IMG`. Three oceans were asked whether they
were inhabited (0 people, 0 creatures) and whether they differed (`-1,-1,-1,-1` each). A control run
— D-54's line reverted, same command — read the same nine failures, so the row is older than this
pass. Each climate now carries its own land window (temperate `14592,68608`, desert `13056,29696`,
mountain `7552,31872`, picked by requiring every 64-cell block in a 128-cell margin to be land and no
settlement within 400 cells): `audit` **26/26**, with blocks `[18,33,33,9]` / `[37,55,13,19]` /
`[59,7,58,51]`, flats 1808/1468/917 and first flat `NBOULDR2` / `CACTUS1` / `BOATQURT` — the three
countries really are three landscapes.

**Still open, named.** The country still re-boots the scene when the window crosses a block boundary
(B26's own remaining half), and the 586 doors facing masonry are the map's own art, not reachable
from any paving.
