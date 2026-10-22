# PERFECTARENA — Progress

*What runs, what is claimed, and what is not established. Read after
[ARCHITECTURE.md](ARCHITECTURE.md); re-read it first after any context reset.*

**How to read this file.**

* **Verified** — a command in this repo produced the number or the picture. The command is
  named next to the claim.
* **UNVERIFIED** — written down as such, never as done.
* **S-numbers** (S1…S42) are the simplifications: where this port knowingly differs from the
  original and why. Code comments and the other docs cite them, so the numbers are stable.
* **D-numbers** are decisions and live in [DECISIONS.md](DECISIONS.md).

---

## 1. Status by subsystem

| Subsystem | What works | Verified by | What is NOT established |
|---|---|---|---|
| **Arena data readers** (`src/arena/`, `src/engine/formats/`) | BSA index (2 441 records, Σ sizes = directory start), `.MIF` framing and all three voxel layers, `.INF` grammar + archive decryption, `.IMG`/`.SET`, `.CFA`/`.CIF`/`.RCI`, `.COL`, `CITYDATA.64`, `SPELLSG.65`, Type-08 decompression; **`.VOC` whole** — all 251 clips the install ships decode (the repeat pair included, so `DRUMS.VOC` sounds); **`.FLC`** through the vendored FLIC reader, now *called* (`game/cutscene.js`) | `npm test` (`mif`, `rci`, `text`, `spells`, `city`, `voc`, `cutscene` suites) | The 6 bytes per `.RMD` cell; `FLAT`/`INNS`/`LOOT`/`STOR` bodies; Arena's font (partial); `.XFM`/`.XMI` music; the `.ADV` sound drivers |
| **Levels** (`game/mifLevel.js`, `mifMesh.js`) | Voxel bitfields → model → mesh + collider; oversized layers read the original's way; winding asserted per triangle on a 20 800-quad level; every cell has something level to stand on (no bottomless cell) | `npm test` (`mif`), `probe:mif`, `tools/lib/mapascii.mjs` | Raised-platform height/thickness ladders (reconstructed, S9); `.RCI` slicing is only partly confirmed |
| **Cities** (`game/cityPlan.js`) | 36/36 block slots stamped; the same seed is the same city; buildings block the player; a specific location's city comes from `CITYDATA.64` + `TERRAIN.IMG` | `probe:city`, `city` and `doors` browser suites | A city has never been judged **as a picture** (roof line, coastal water, the three climate palettes) |
| **Buildings & interiors** (`game/shops.js`) | Every shop sign the city `.INF` names opens its own room (8 interior variants per family, block number picks one); a house arrives on its third level; a keeper speaks their trade's bank (18 `muguild` + 20 `tavern` + 35 `equip` whole sentences) | `doors` browser suite, `npm test` (`shops`) | **Blocks with no door at all**: 13 of 36 blocks in a city-state carry no sign edge, so their buildings have no entrance (being fixed — see ROADMAP P1); no multi-level shops. Trade runs now (`game/services.js` — see its own row); furniture dressing landed (`game/furnish.js` — see ROADMAP C) |
| **The people** (`game/townsfolk.js`, `townPaths.js`, `livingWorld.js`) | 65 `.CFA` walk files → outfits with 5 views, turned to face the eye (`viewFacing`); a population from the seed (14 city / 9 town / 5 village); each person walks the day their own trade names, at 1 cell per 1.5 s, and arrives (`living`: 10 departures, 31 walks known, 1 arrival inside the watch window on one run); the path book spends 10 cells of the frame's 6 000; a wanderer's beat is a standable cell within 6 of home; **names** (S30 closed): the sibling install's `NAMEGEN.DAT` decoded (`game/names.js`, stride-law verified against UESP's decoded XML — 785 slots, 11 banks with the noble titles file-last), composed per race and climate, deterministic per face — 48/48 of a city's street folk named, "Mingina Mosswood" on the talk panel | `townsfolk`, `living` browser suites, `npm test` (`townpaths`, `townsfolk`, `livingworld`, `names`) | **A settlement's trades are its own blocks'** (D-01a closed 2026-10-16): the level's `*ITEM` people records (`loaded.peopleSpots` — Daggerfall's `CITYW2.MIF` places nineteen: ten priests, the Mages Guild's wizard, three vendors, a beggar, three harlots, a shady character) give the town its **roster of trades** while the cells stay the seeded placement's; a person whose own day puts them `home` is **indoors and not drawn** (`atHome` — the port has no home interior, so the street empties instead of filling with statues). Measured the same day: 10:00 → 48 people, 44 out, 41 walking, 16 on a route; 23:00 → **4 out** and walking (the harlots and the shady character, whose own day keeps them out), 44 indoors; 06:00 → 9 priests walking to worship. Still: two questions only (S31); nobody hires or pays |
| **The hour and the sun** (`game/daylight.js`, `game/arenaSky.js`) | The twin's clock rate (`GAME_MINUTES_PER_REAL_MINUTE = 12`); DFU's sun arc and light curve — east and 60° up at ten, overhead at noon, down and zero at twenty-three; a night street really is darker (mean luminance 80.1 → 36.8 of 255, back to 50.7 at dawn); Arena's own horizon composed from 22 mountains and 17 clouds; six trades keep hours that shut a door | `living` browser suite, `npm test` (`daylight`, `sky`) | No night sky (no stars, no moons — the day picture mixed into fog, S41); no city lanterns; weather is the level's own letter, not a moving front |
| **Character** (`game/character.js`, `chargen.js`, `progression.js`) | Arena's ten `QUESTION.TXT` scenarios, 18 classes, 8 races, `d20` roll + `4d6` pool, health `25 + class die + endurance`; levels and the monster XP rule | `chargen`, `progression` suites, `npm test` (`character`, `progression`) | — |
| **Combat** (`game/monsters.js`, `monsterArt.js`, `combat.js`, `weaponView.js`) | **the twenty-four monsters the game's own executable names, each drawn from the sheet its tables give it** — the Minotaur's is `PAT1.CFA`…`PAT6.CFA`, read out of `ACD.EXE` by block B24's tables (`exeTables.js`, `monsterArt.js`) rather than guessed from a `MINO*.CFA` search; the `.INF` slots `32`…`54` come out in the executable's order 23 of 23 (`unit/monsterart.test.mjs`); 340 `.CFA` creature sets under `PAL.COL`; per-monster HP inside UESP's range; damage and to-hit from the weapon/material tables (formula reconstructed, S27); a monster must **see** the player to wake or to strike (no blows through a wall); the first-person weapon draws Arena's own sheets — `SWORD AXE MACE HAMMER STAFF`, 33 images each, `HAND` 13, 16 frames a second — draw, six swings, hold, sheath; **backstab** — a blow from behind lands half again as hard (`combat.js`'s `fromBehind`, decided by the defender's own walk-facing); monsters carry proper names from the corpus's own `-goth` banks, read the first time the HUD names them (“Grolantor — Goblin 4/4 · 1 m away”, verified on a page) | `combat`, `actioncombat` suites (58/58 with the strike path live), `npm test` (`combat`, `weapon`, `names`) | `FLAIL.CIF`/`BOW.CIF` are not in this install (S37); a landed blow is a **blood-coloured burst**, not the original's blood *art* (D-20); no fight sound; a monster closes and swings but does not think (S29); a fight has never been timed on a GPU; the backstab's live flee-chase run is pending (ROADMAP §1) |
| **Items, pack, magic** (`game/items.js`, `inventory.js`, `spells.js`) | 64 spells decoded from `SPELLSG.65`, casting that costs and can refuse; a pack a thing can be equipped from, drunk or dropped | `gear` suite, `npm test` (`items`, `spells`) | `ITEMS` quest trinket names are authored (S20) |
| **The main quest** (`game/questData.js`, `questState.js`) | All eight Staff pieces derived from `CITYDATA.64`, each with the map dungeon that reveals it; the ten-stage machine modelled on Arena's `MQDATA` flags; the palace's four levels, the mithril key and the Jewel of Fire; the whole chain played through real keys (18 page loads); **the story's own movies** — `VISION.FLC` on the escape and `END01.FLC` before the ending page, both played in the install's own art with the world held still, skipping on any key | `mainquest` browser suite (60/60, with the two movie beats) | A piece is searched for on the level the player arrives on (S22); the finale's chambers are derived from the palace's bottom level (S24); a beat's movie is this project's reading of which file belongs where (S26) |
| **Side work** (`game/radiantQuests.js`) | Five kinds of job drawn from the world; a board of three per town; a person in the street offers their own (`personOffer`, keyed by the person's cell and the town's seed); only the 16 dungeons whose `.MIF` ships can be named; 300 jobs generated in one test run, every one with a real target | `radiant`, `townsfolk` suites, `npm test` (`radiant`) | Deadlines advance on travel, not on walking around (S23); a "clear the lair" job resolves on arrival, with no creature to fight for it (S21) |
| **Shops trade** (`game/services.js`) | `shelfFor` builds a level-appropriate shelf per trade; `stockFor` makes the shelf a **volume** — a place's own rows, seeded by the *door the player came in by* (two stores of a kind in one city carry different shelves — verified on a page), each row with a 1–3 count that sells down, and a **Great Find** just past the level's budget on 1-in-3 visits; `haggleRoll`: three tries a visit, a win kinder (15% and kinder), a loss dearer, then the keeper will hear no more; `buyItem`/`sellItem`/`buySpell`/`templeService`/`rest` run real gold through the keeper panel; prices AUTHORED and stamped `PRICE_NOTE` | `unit/shops.test.mjs` 11/11; `commerce` browser suite **25/25** (buy, sold-out row, haggle ledger, two shelves differ, fresh ledger per visit); trade buttons on the keeper panel (`gear`, `doors`) | The visit's ledger is scene state — it is not in the save yet (a page load in mid-visit resets the shelf); keeper *speech corpus* (bank's `%i`/`%mm` lines) still dropped (S34's remainder) |
| **Regard** (`game/regard.js`) | The twin's law with its numbers: `talk` +3 once a day, `job` +25, `struck` −45, `slain` −75, friend at 40, enemy at −40, hostile at −70, easing 0.5 a day; a blow at a townsperson is a blow at the town (26 of 26 witnesses turned hostile on one run); a job is paid by the person who gave it | `regard` suite, `npm test` (`regard`) | `gift`/`helped`/`saved` are in the table and nothing fires them (S38); a person is identified by where they stand (S39) |
| **Persistence** (`game/save.js`, `worldState.js`) | The character, the quest, the pending job, the regard ledger, what has been looted and the world's own record all survive the page loads travel is made of | `mainquest`, `world`, `townsfolk` suites, `npm test` (`worldstate`) | One save slot per browser profile; no cloud, no export |
| **UI** (`index.html`, scenes) | HUD in the original's status band (measured to the row), the world map, the sheet, the journal, the job panel, the conversation panel, the ending, and the **cutscene player** (Arena's own 320×200 movies on a whole-number-scaled sheet, on the file's own delay); `?cutscene[=NAME]` plays any of the 15 the install ships | `world`, `living`, `menu`, `cutscene` (13/13) suites | The UI is **DOM over the canvas**, not the engine's GL pass (S19); the 946 `.IMG` screens are still drawn as this project's own panels rather than the original's art |

### Test counts

| Command | Last recorded |
|---|---|
| `npm test` (`tests/unit/*.test.mjs`) | **499 pass, 0 fail** (last run this pass: +`unit/exetables.test.mjs` 8/8 and `unit/monsterart.test.mjs` 9/9, the executable's own tables and the creature-art join) |
| `npm run test:browser` (`tests/run-browser.mjs`, **24** suites) | **713/714 checks** on the last full run, before the `cutscene` and `exe` suites existed; re-measured 2026-10-15: `interior` 70/70 · `mainquest` 62/62 · `cutscene` 14/14 · `interior`+`cutscene` together 84/84; this pass: **`exe` 14/14** (the game's own executable unpacked *and read* in a page — the tables, the creature art, a spawned Minotaur), **`audit` 23/23**, `world`+`townsfolk`+`living` 123/123, `actioncombat` 23/23, `dungeonplay` 20/20, `combat` 37/37; the previous pass's record: `exe` 8/8, `dungeonplay` 20/20, `movement` 11/11, `world` 28/28, `chargen` 41/41, `menu` 39/39. The one wobble — `living`'s standing-still animation read, on a machine running every suite at once — passes 37/37 in isolation, as the page's own reads have tended to do) |

Re-run both (or `npm run check`) after any change; the numbers above are a record, not a promise.

---

## 2. Concrete numbers from the real data

| | |
|---|---|
| `GLOBAL.BSA` | 2 441 records; payload 16 758 198 B = directory start |
| `START.MIF` (the Imperial Dungeons, 50×50, 1 level) | 2 242 quads, 1 631 wall cells, 140 entities, 264 chasm cells, 13 textures |
| `39300577.MIF` (a 100×100 main-quest dungeon, 3 levels) | level 1: 20 821 quads, 4 857 walls, 585 raised platforms, 87 doors, 833 chasm cells, 271 entities |
| Chasm cells in the whole archive | 2 204 wet, 1 341 dry, **470 lava — all of them `IMPPAL.MIF` level 4** |
| Provinces / locations / settlements | 9 / 432 / 288 (and 144 dungeons) |
| Dungeons shipped as `.MIF` | **16 of 144**; the rest the original generates from their seed |
| City-state doors, `CITYW2.MIF` seed 20232 (Daggerfall) | 54: 23 equipment, 19 tavern, 8 house, 5 temple, 1 Mages Guild |
| Sign indices the blocks actually draw | exactly 5: 6, 11, 17, 24, 47 — and blocks with **no** sign edge: 13 of 36 |
| Interiors in the archive | 8 × (`EQUIP MAGE NOBLE TAVERN TEMPLE BS TOWER`) + `WCRYPT1..8`, each with its own `.INF` |
| People art | 89 `.CFA` files, **65** walk files, 10 sets, 7 armour words |
| Talk corpus | 811 records → 2 462 `&`-parts → **1 823** whole sentences (561 need no substitution, 14 only a city-state's name) |
| Prose | 64 city-state greetings (63 name their own city), 9 dungeon arrival texts, 372 artifact offers + 108 haggle replies, 539 shopkeeper lines |
| Weapon sheets in this install | **6 of Arena's 8**: `STAFF`, `SWORD`, `MACE`, `HAMMER`, `AXE` (33 frames each), `HAND` (13); no `FLAIL.CIF`, no `BOW.CIF` |
| A swing | 5 drawn frames at 16 a second — 0.3125 s |
| Population rule | 26 people in a city-state, 16 in a town, 10 in a village (S32, raised from the original's 14/9/5 in the living-world pass) |
| Engine | 154 modules copied into `src/engine/` (see `src/engine/PROVENANCE.md`) |
| Bounty contract | one `slay` job = three contracted targets of a real `MONSTERS` kind, spawned the level-1 dungeon of the named target; real `F` kills count uniquely by encounter id; partial progress survives a reload; the giver's town pays once on hand-in (`bounties` suite) |
| Reward rule | credited to the live character *and* its save on the same event, by the board's town, a person, or the bounty hand-in (`bounties` + `regard` suites) |

---

## 3. Not established (UNVERIFIED)

* **The wilderness and the landscape variety.** A city is one city: the block set, the climate
  `.INF` and the skeleton come from the location's data, but the surrounding country is a
  `.RMD` window whose 6 bytes per cell are not decoded — a desert city and a jungle city are
  two block grids with different palettes, not two landscapes.
* **The counter is a real counter.** A shop's shelf is a *place's* stock (seeded by the
  entered door, so two stores of a kind in a city differ — caught live), each row sells
  down by count, a Great Find waits past the budget, and the keeper haggles: three tries a
  visit, a win kinder and a loss dearer (`services.js`: `stockFor`, `haggleRoll` —
  `unit/shops.test.mjs` 11/11, `commerce` browser **25/25**). The visit's ledger is not yet
  saved; the keeper's spoken line corpus is still unused (S34's remainder).
* **Water wades and lava burns; nobody swims.** Wading is the engine's `swimSpeedScale` (0.5)
  and lava takes 6 health a second; drowning, fall damage and climbing out of a deep dry pit
  are not implemented (S12).
* **Doors and arches look right, not identical.** A `0xB` door decodes, opens and animates;
  transparent walls and edges are still drawn opaque (alpha test is open).
* **The first-person weapon is a 2D layer above the world**, not the engine's GL UI pass, and
  the third-person sheath-on-the-back is not drawn (S6, S36).
* **No audio at all.** `.VOC`/`.XFM` are located and unparsed; the engine's WebAudio layer is
  copied and unused.
* **Character frames and fights have never been timed on real GPU hardware** — headless
  software rendering only (SwiftShader).
* **Generated dungeons are this project's shape, not the original's.** 128 of 144 dungeons have
  no `.MIF`; `game/dungeonPlan.js` generates a coherent, connected, one-way-safe level from the
  seed, which is a reconstruction and says so (S22's sibling).

---

## 4. Simplifications (S1…S42)

| # | Simplification | Where / why |
|---|---|---|
| S1 | Rules tables come from documented community tables, not extracted `A.EXE` | `A.EXE` is absent from the provided data (D5); each table records its `source` |
| S2 | No continuous overworld; one scene per location | Arena's own model; the engine's streaming world is unfeedable (D2) |
| S3 | `.devtools/` holds a portable Node 22 | The machine has no Node (D8); git-ignored, not part of the deliverable |
| S4 | Browser tests drive system Chrome/Edge over raw CDP, not Playwright | No npm toolchain on the machine (D8) |
| S5 | Arena UI text may fall back to a built-in bitmap face | Arena's font is only partly decoded |
| S6 | HUD text is a **DOM** overlay, not the engine's GL text pass; the weapon is a 2D layer | The GL path wants an Arena FNT |
| S7 | *Superseded* — winding is now derived from the face normal and asserted per triangle | Resolved in the MIF pass (D14) |
| S8 | No audio | `.VOC`/`.XFM` unparsed; the WebAudio layer is copied and unused |
| S9 | Raised-platform heights and thicknesses are **reconstructed** | `A.EXE` absent, `ACD.EXE` packed (D11); only height index 0 occurs in the real data |
| S10 | One voxel layer = 2.5 world units, so `*CEILING` affects appearance only | The engine's 1.8 m capsule does not fit a `ceiling/128` layer (D12) |
| S11 | Interiors use one raised ambient term instead of Arena's light tables | `PAL.COL` is raw-dim (D13) |
| S12 | A chasm is a bed 0.45 m below the surface with a bank: wade or burn, never swim | Falling/swimming/drowning are gameplay, not format work |
| S13 | Transparent walls and edges draw opaque | The geometry and collision bits are exact; alpha test is open |
| S14 | `MIF` `FLAT`/`INNS`/`LOOT`/`STOR` bodies are captured but unparsed | Their placement is known; contents are not needed yet |
| S15 | A city's block-grid start and reserved-slot lists are **reconstructed** | Both live in `A.EXE` (D11); tested so no stamp touches the wall ring or the water |
| S16 | A city's climate is a parameter first, a location lookup second | `TERRAIN.IMG` sampling was later decoded (see `worldMap.js`); `?climate=` remains an override |
| S17 | Cities use one daylight ambient + sun instead of Arena's light tables | Same reason as S11; overridable with `?ambient=&sun=&fog=` |
| S18 | Fast travel is the plain distance between two world pixels | Arena's per-pixel speed table is in `A.EXE` (D11); the *scale* of a journey is kept |
| S19 | The world map and the arrival text are DOM/canvas layers | The GL UI pass wants an FNT; the map is static art plus markers |
| S20 | `ITEMS` (a fetch quest's trinket) is **authored** | Arena's equipment names are in `A.EXE` (D11); `ARTIFACTS` and `MONSTERS` are checked against real data |
| S21 | A quest's creature is named, not fought | The job resolves when the player reaches the objective, and the notice says so |
| S22 | A Staff piece lies in the deepest reachable chamber of the level the player arrives on | Guaranteed reachable; a multi-level dungeon's other floors are not searched |
| S23 | A radiant job's days pass on travel, not on walking around | `advanceDays` on fast travel, so a deadline is real without a full calendar behind interiors |
| S24 | The finale's two chambers are **derived** from the palace's bottom level | The walkthrough's coordinates name a wall in the shipped `IMPPAL.MIF`; the Jewel is the deepest reachable cell and the key the deepest cell 12+ from it (D19) |
| S25 | A settlement's people live a day but hold no purse; a city holds no monsters | Nobody trades, hires or is paid; Arena guards its streets and this port does not |
| S26 | A story beat's movie is this project's reading of which `.FLC` goes where | The reader and the player are real (`game/cutscene.js`, `scenes/cutscenePlayer.js` — the opening, the vision on the escape, the closing movie); **which** file belongs to **which** beat is a decision, not the original's jump table (`A.EXE` holds it, D11), and the panel still shows UESP's transcription of the closing words under the movie |
| S27 | Combat's to-hit number is a reconstruction | `A.EXE` absent; the roll has the era's documented shape and the damage tables carry their source (D18) |
| S28 | A character at zero health wakes at the way in | No death screen and no resurrection omen; the notice says why |
| S29 | Monsters close and swing; they do not think | Arena's AI is undocumented; no fleeing, no grouping, no ranged attacks |
| S30 | Names came from the sibling install, not this one | Arena's own `NAMES.DAT` is `EMPTY`-padded save slots; the corpus is the sibling Daggerfall install's `NAMEGEN.DAT` (`game/names.js`), decoded against UESP's decoded XML, loaded once per page through the dev door, and a run without it is nameless exactly as before |
| S31 | A conversation is two questions | The id → topic map is in `A.EXE` (D11); topics are chosen by which `%`-words this project can fill |
| S32 | How many people a settlement holds is a rule, not a table | 14 / 9 / 5, drawn deterministically from the place's seed |
| S33 | Which of the eight interiors a door opens is **reconstructed** | The block → interior table is in `A.EXE` (D11/D21); the block's own number picks one |
| S34 | A keeper speaks (the corpus is read, not performed) | A bank's lines wanting an `%i` or `%mm` are dropped; only whole plain sentences are used. The *system* the corpus served is here: stock and haggle live (`game/services.js`) |
| S35 | ~~A building is entered and left by a page load~~ **RETIRED 2026-10-15** | The code has not done this since `goInPlace` landed: a door, a gate and a stair re-boot the scene **inside the same document**. Measured, not argued — `docs/AUDIT-2026-10-15.md` §S-E: `__debug.navigations` stays flat across a real `E` into the smith and a variable set on the street is still readable inside. What is still true is the *reason* the row existed: a hop is a full scene re-boot, not a payload swap into a living world (P3) |
| S36 | Which of Arena's six swings a blow is comes from the movement keys | The original reads the mouse's gesture, which a key/click port does not have |
| S37 | `FLAIL.CIF` and `BOW.CIF` are not in this install | The game draws nothing and names the missing file rather than substituting art |
| S38 | Half the twin's regard table has nothing to fire it | `gift`/`helped`/`saved` are kept and unwired, and said so |
| S39 | A person is identified by where they stand | The twin mints a census id from the town seed; this port keys by `place#row,col` (S30) |
| S40 | The hours, the shifts and the clock's rate are this project's | Arena keeps them in `A.EXE` (D11); the *shape* is the twin's and the rate is DFU's `TimeScale 12` |
| S41 | The night sky is the day's picture mixed into the fog | There is no night copy of the composed panorama; no lanterns either, hence `NIGHT_AMBIENT_FLOOR` |
| S42 | The **air** of each kind of place is this project's (`game/sceneLighting.js`'s `LEVEL_FOG`: enclosed 0.040, city 0.0045, wilderness 0.0030) | Arena's own falloff is inside `A.EXE` (D11). The *shape* is the engine's `exp2` fog and the numbers are chosen so a dungeon's far end goes dark and a street's does not, stated as light-left (`fogTransmission`) and pinned in `unit/scenevisuals.test.mjs` |

---

## 5. Known risks

* **`src/scenes/interior.js` is one file of ~7 400 lines** hosting four kinds of level, the
  townsfolk, monsters, doors, the HUD and the weapon. Most defects of the last passes lived
  there. Splitting the scene's townsfolk/combat/door systems out is the single highest-value
  structural refactor on the list.
* **Arena's font remains on the critical path** for a fully engine-drawn UI (S5/S6); the
  decision should be recorded either way.
* **Draw calls scale with the number of distinct textures** (60 in a dungeon), not with map
  size; a texture atlas is the answer if a city's block variety becomes a problem (D14).
* **The `?arena=` door is a dev/test door.** A player runs the game with a picked folder; the
  URL door exists so headless runs need no file picker.
* **The tree carries scratch files**: `tools/tmp/*`, `tests/_*.tmp.mjs` and `tools/probe2.mjs`,
  `tools/rmd-probe*.mjs`, `tools/tmp-*` are working notes. They are not part of the game and
  should be swept before any release.

## 6. Where the detail lives

| For | Read |
|---|---|
| Where a file is, and how data flows | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Why a choice was made (D-numbers) | [DECISIONS.md](DECISIONS.md) |
| What the bits mean, with evidence | [FORMATS.md](FORMATS.md) |
| The comparison with Daggerfall Enhanced | [TWINS.md](TWINS.md) |
| The comparison with Arena and OpenTESArena, feature by feature | [PARITY.md](PARITY.md) |
| What is next, in checkable phases | [ROADMAP.md](ROADMAP.md) |
| Spells as decoded | [SPELLS.md](SPELLS.md) |
