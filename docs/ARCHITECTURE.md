# PERFECTARENA — Architecture

**What this is:** *The Elder Scrolls: Arena* (1994) ported onto the WebGL2 engine written for
`c:/arenaproject/daggerfall` ("Daggerfall Enhanced"). The engine is reused as a
**presentation / gameplay shell**; Arena's own data is read at runtime from the player's
Arena folder and turned into geometry, textures, text and rules by new Arena-native code.

Reading order: **this file** (where things are) → [DECISIONS.md](DECISIONS.md) (*why*, D-numbers)
→ [FORMATS.md](FORMATS.md) (*what the bits are*) → [PROGRESS.md](PROGRESS.md) (*what runs, and
what is only claimed*) → [ROADMAP.md](ROADMAP.md) (*what is next*) → [TWINS.md](TWINS.md)
(the measured comparison with the Daggerfall Enhanced tree).

Anything in the docs that no command in this repo demonstrates is labelled **UNVERIFIED**.

---

## 1. Shape

```
index.html ──▶ src/main.js   router: ?map ?worldmap ?location ?dungeon ?city ?wild ?interior ?test
                   │
     ┌─────────────┼──────────────────────┬───────────────────────┐
     ▼             ▼                      ▼                       ▼
 src/arena/    src/engine/            src/game/                src/scenes/
 bytes →       (copied from the twin, the world model: rules,   the scene hosts that
 structures    pruned) pixels,        levels, meshes, people,   bind all three and
               vectors, input         quests, saves             own the frame loop
```

Three bands with one direction of dependency: `arena/` knows bytes, `engine/` knows pixels and
vectors, `game/` knows Arena's rules. `game/` may import from both; `arena/` imports from
neither. `scenes/` is the only place that talks to the renderer *and* the data layer at once.
`src/vendor/` holds third-party files.

## 2. Runtime data path (no game data in the repo or the build)

1. The player picks their **Arena folder** (the one holding `GLOBAL.BSA`). Persisted in
   IndexedDB; re-picked only on demand.
2. `src/arena/browserSource.js` exposes the two doors: `fileListSource` (the picked folder) and
   `localServerSource` (the dev/test door, `?arena=<folder>`, which fetches the server's
   loose-file index so a name that is not loose is not a 404).
3. `src/arena/arenaData.js` is the facade every caller uses: `mif()`, `inf()`, `img()`,
   `setFrames()`, `palette()`, `texture(ref)`. Lookup is loose file → `GLOBAL.BSA`; the cache
   and the warning sink live here.
4. `src/arena/bsaArchive.js` indexes `GLOBAL.BSA` (Arena's header has no directory-type field)
   and serves any record by name.
5. Nothing is embedded, bundled or copied into the output.

## 3. Subsystem map

### 3a. `src/arena/` — the data layer (bytes → structures)

| File | Owns |
|---|---|
| `arenaData.js` | **The facade**: every decoded name, the cache, the warning sink. |
| `browserSource.js` | The picked folder and the `?arena=` dev door; loose-file index. |
| `bsaArchive.js` | `GLOBAL.BSA` index + record extraction. Verified: 2 441 records, Σ sizes = directory start. |
| `decompress.js` | Arena's codecs: `decodeType08` (adaptive Huffman + 4 KiB history), Type-04, RLE, RLE-words. Pure, so Node and the browser share it. |
| `palette.js` | `.COL` (8-byte header + 256 RGB), embedded 6-bit palettes, palettized → RGBA with index 0 transparent. |
| `image.js` | `.IMG`: the raw 4096-byte wall form, the 12-byte headered form, three compressions, headerless cases. |
| `infFile.js` | `.INF` grammar: `@FLOORS/@WALLS/@FLATS/@SOUND/@TEXT`, `*`-directives into the `*BOXCAP`/`*BOXSIDE`/`*MENU` slots, the ordered texture table with `.SET #n` expansion, `*CEILING`, chasm/stair textures, and the archive decryption. |
| `mifFile.js` | `MHDR`, `LEVL` sections, tagged chunks (`FLOR/MAP1/MAP2/TARG/TRIG/LOCK/NAME/INFO/NUMF`), oversized layers, physical level order. |
| `cfa.js` | `.CFA` creature/people sprites: header fields, the palette lookup table at `0x4c` (zero-length is legal for 8-bit art), frame demuxing. |
| `cifFile.js`, `rciFile.js` | `.CIF`/`.RCI` containers and their per-image headers — the first-person weapon art. |
| `rmdFile.js` | Wilderness block framing (`.RMD`), sized and codec'd; the 6 bytes per cell are UNVERIFIED. |
| `cityDataFile.js`, `cityDataSeeds.js` | `CITYDATA.64`: nine province rectangles, 432 locations, the per-location seeds and the `.MIF` name a dungeon seed produces. |
| `arenaText.js` | Arena's prose: `citytxt`, `dungeon.txt`, `artfact*.dat`, `template.dat`, the shopkeeper banks, and the `%`-word filler. |
| `spellsFile.js` | `SPELLSG.65` spell records. |
| `pklite.js` | **The game's own executable**, unpacked: PKLITE 1.12 ("extra" + "large") → a 305 520-byte code image, 4 044 relocations, the footer's stack ending exactly at the image's end. Pure and dependency-free. |
| `exeTables.js` | **The tables inside that image**, found by their own words rather than by offsets (creature roster and sheets, classes/races/attributes, provinces and the sixty-four settlements, the calendar, the level markers, the loot tables), each with a reading that a drifted decode would break. |
| `exeData.js` | The runtime read of the executable through the player's own `ArenaData` source (`ACD.EXE`, then the floppy release's `A.EXE`), kept for the page's life; nothing derived is committed (law 6). |

### 3b. `src/engine/` — the copied engine (pixels, vectors, input)

154 modules copied by `tools/copy-engine.mjs` and pruned; `src/engine/PROVENANCE.md` records what
was copied, what was adapted and what was dropped. The bands that matter to this port:

| Band | Modules | Used for |
|---|---|---|
| `render/` | `renderer.js`, `glProgram.js`, `fogGlsl.js`, `skyRenderer.js`, `retroPass.js`, `perfMeter.js`, `renderTarget.js`, `bounds.js`, `orderedDither.js` | The WebGL2 core: meshes, textures, billboard batches, sky, fog, lighting, point lights, retro pass. |
| `player/` | `motor.js`, `collider.js`, `pointerLock.js`, `lookFilter.js`, `mwCamera.js`, `climbing.js` | First-person motor (fixed-step integration, walk/run/crouch/swim constants), capsule-vs-triangle collider, look input. |
| `world/` | `mat4.js`, `quat.js`, `perlin.js`, `weather.js` | Math (`mirrorProjectionX` is the engine's handedness law) and weather. |
| `ui/` | `text.js`, `bitmapCanvas.js`, `windowStack.js`, `cursor.js`, `input.js`, `viewSettings.js`, … | Text layout, palettized bitmap → canvas, the UI window stack, input routing. |
| `systems/`, `formats/`, `combat/`, `characters/`, `net/` | `audio.js`, `settings.js`, format readers, the twin's own systems | Mostly unused by this port; kept because they compile and the renderer/motor depend on some. |

### 3c. `src/game/` — the world model (Arena's rules, levels, people)

| File | Owns |
|---|---|
| `mifLevel.js` | The one place Arena's voxel bitfields become a model: `kind`, `solid`, textures, `facing`, heights, `spawn`, `outdoors`, stairs, doors. |
| `mifMesh.js` | That model → the engine's `MeshBundle` + the collider + one bundle per `0xB` door leaf. |
| `cityPlan.js` | A city, which is not a file: seeds `arenaRandom.js` with the city seed and stamps 20×20 block `.MIF`s into a skeleton. |
| `tables/cityBlocks.js` | The block tables (which `.MIF`s each settlement kind draws from). |
| `tables/raisedPlatforms.js` | Raised-platform heights/thicknesses — **reconstructed** (`A.EXE` is absent, D11). |
| `wilderness.js` | The `.RMD` ring around a settlement and the window of it that is built. |
| `dungeonPlan.js` | Generated dungeons (128 of 144 are not shipped as files) and the deepest-chamber search. |
| `dungeonItems.js`, `flats.js`, `encounters.js` | What the map's own chunks leave on the floor: item flats, scenery flats, creature placements. |
| `arenaRandom.js` | Arena's own RNG, so a seed reproduces a city, a dungeon and a town. |
| `character.js`, `chargen.js` | Races, classes, attributes, the ten creation scenarios, health/spell-point derivation. |
| `progression.js` | Levels, experience, the monster XP rule. |
| `monsters.js`, `monsterArt.js`, `combat.js` | The creature table, **which sheet each creature is drawn from** (the join against the executable's own two tables), the to-hit/damage model, monster attacks. |
| `weaponView.js`, `playerSprite.js` | The first-person weapon states (draw, six swings, hold, sheath) and the player's own billboard. |
| `items.js`, `inventory.js`, `spells.js` | Items, the pack, the 64 decoded spells and casting costs. |
| `doors.js` | Locks, forcing, keys, door animation and the HUD line for a door. |
| `chasmSurface.js` | Water/lava: the bed below the surface, wading and lava damage. |
| `livingWorld.js` | The clock's rate, the day plan tiled from a trade and a seed, opening hours, the town watch. |
| `townsfolk.js` | The people: the roster from the install's `.CFA` files, outfits, views, description, their fighter. |
| `townPaths.js` | The town's walking: `pathLine`/`pointOnLine`, and the path book that budgets a frame's searching. |
| `services.js` | Trades, their hours and what a keeper says. |
| `shops.js` | Door → room: the sign over a city door, the shop it means, the interior `.MIF` behind it, the keeper's greetings. |
| `regard.js` | The world's opinion of the player: one regard per person, keyed by place and cell. |
| `radiantQuests.js` | Side work: five kinds of job drawn from the world, the board, and the person who gives one. |
| `questData.js`, `questState.js` | The main quest as derived data (eight provinces, eight Staff dungeons, their map dungeons) and its ten-stage machine. |
| `worldMap.js` | The world model: global pixel, latitude, climate, coast, `travel()`. |
| `arenaSky.js` | Arena's own horizon: the install's mountains and clouds composited over the level's gradient. |
| `daylight.js` | DFU's day/night law: the sun's arc, the light curve, the night ambient floor, the sky mix at dusk. |
| `dungeonNames.js` | Dungeon names — from the data, not invented. |
| `save.js` | The one place saved things live: last location, quest, side work, character, regard, loot, world state. |
| `worldState.js` | The persistent world: what has been visited, opened, taken and killed, versioned and migration-safe. |
| `testmap.js` | The hand-made courtyard (needs no game data). |

### 3d. `src/scenes/` — the hosts

| File | Owns |
|---|---|
| `interior.js` | **The one scene host for every map**: city, wilderness, dungeon and building interior. Owns the frame loop, the camera, the player motor, monsters, the townsfolk step, the HUD, interaction (`E`, `T`, `F`), level switching, the door leaves and the weapon. It is the largest file in the project and the place most defects live. |
| `worldmap.js` | The map of all Tamriel, travel, the job board, the regard ledger page. |
| `chargen.js` | Character creation on Arena's own sheet. |
| `testmap.js` | The Milestone-2 courtyard (renderer regression test, no data needed). |
| `newGame.js` | The "start over" flow. |

### 3e. `tools/` and `tests/`

| Path | Owns |
|---|---|
| `tools/launch.mjs`, `tools/serve.mjs` | The launcher (`npm start`) and the static dev server (`npm run dev`). |
| `tools/copy-engine.mjs` | Copies the twin's engine modules into `src/engine/`. |
| `tools/mif-dump.mjs`, `city-dump.mjs`, `cfa-dump.mjs`, `tex-dump.mjs`, `world-dump.mjs`, `wild-dump.mjs`, `dungeon-audit.mjs`, `inspect.mjs`, `rmd-probe.mjs` | Offline inspectors: formats, cities, creature art, textures, the world, the wilderness. |
| `tools/lib/` | `mapascii.mjs` (a decoded level as ASCII), `textures.mjs`, `voxhist.mjs`, `shotascii.mjs`, `nodeSource.mjs` (the Node side of the data door). |
| `tools/tmp/` | Throwaway probes kept out of the build. |
| `tests/unit/*.test.mjs` | Node tests (`node --test`) over the **real** Arena files. |
| `tests/suites/*.mjs` | The browser suites that are their own flow — one file each (22 of them: `chargen`, `combat`, `cutscene`, `doors`, `dungeonplay`, `exe`, `gear`, `generated`, …). |
| `tests/run-browser.mjs`, `tests/cdp.mjs` | The headless suite driver and the raw-CDP client (launch, evaluate, key/mouse events, screenshots). Two further suites live inline in `run-browser.mjs` rather than in a file — `testmap`, `worldmap` — so the driver offers **24** suites in all (`node tests/run-browser.mjs` for every one, or a name for one). |

## 4. Data flow

**Into a city (or a wilderness window, or a building):**

```
?location=Daggerfall  →  arena/cityDataFile.js + cityDataSeeds.js  →  worldMap.js (climate, coast, seed)
                      →  game/cityPlan.js (skeleton .MIF + block grid, arenaRandom.js)
                      →  game/mifLevel.js (cells)            →  game/mifMesh.js (mesh + collider)
                      →  scenes/interior.js: collider → engine/player/collider.js, mesh → engine/render/renderer.js
                      →  game/shops.js (doors + rooms)       →  game/townsfolk.js + townPaths.js + livingWorld.js (people)
```

**Into a dungeon:** `questData.js`/`dungeonNames.js` name it → `arenaData.mif()` if the file
ships, else `dungeonPlan.js` generates it → `mifLevel.js` → `mifMesh.js` → `interior.js` →
`doors.js` (locks, keys) and `dungeonItems.js`/`encounters.js` (loot and creatures).

**The world map:** `TAMRIEL.IMG` (art) + `CITYDATA.64` (provinces, 432 locations) +
`TERRAIN.IMG` (climate/coast per pixel) → `worldMap.js` → `scenes/worldmap.js` (canvas + DOM
panels) → a click on a marker is `travel()`, which advances days and hands the next scene its
`?location=`.

**Saving:** everything the player has done goes through `game/save.js` into `localStorage`: the
character, the quest, the radiant job, the regard ledger, what has been looted, and
`worldState.js`'s record of the world.

## 5. The renderer contract

Minimum call sequence proven by the twin's own interior scene:

```js
renderer.setClearColor(...); renderer.setLighting(ambient, sunScale, ...);
renderer.setFog(mode, density, start, end, color);
renderer.setWorldViewport(rect);
renderer.setPointLights(lights, null, colors);
renderer.beginFrame(proj, view, lightDir, WORLD_FRAME);
for (const d of drawList) renderer.drawMesh(d.mesh, d.matrix, texRemap);
renderer.drawBillboards(batches, camRight, UP_Y);
renderer.resolveFrame();
```

Rules that are asserted rather than assumed: a foreign pass (the sky) must call
`markForeignPass()` or the renderer's state shadows go stale; a sub-mesh whose texture is
missing draws **untextured, not black**; winding is derived per triangle from the face normal
(`gl.frontFace(gl.CW)` runs through the mirrored projection).

## 6. Where a feature lives (index)

| Feature | Files |
|---|---|
| Read Arena's data | `arena/arenaData.js` → the reader for the format |
| A city | `game/cityPlan.js`, `game/tables/cityBlocks.js`, `game/mifLevel.js`, `game/mifMesh.js` |
| A dungeon | `game/dungeonPlan.js`, `game/dungeonNames.js`, `game/mifLevel.js`, `game/mifMesh.js` |
| Doors, locks, keys | `game/doors.js` (+ the `0xB` leaf bundles from `mifMesh.js`) |
| Entering a building | `game/shops.js` → `scenes/interior.js` (`enterDoor`/`leaveDoor`) |
| The people | `game/townsfolk.js`, `game/townPaths.js`, `game/livingWorld.js`, `game/services.js` |
| Talking, jobs, regard | `scenes/interior.js`, `game/radiantQuests.js`, `game/regard.js`, `arena/arenaText.js` |
| Combat | `game/monsters.js`, `game/monsterArt.js`, `game/combat.js`, `game/weaponView.js`, `scenes/interior.js` |
| Character and items | `game/character.js`, `game/chargen.js`, `game/items.js`, `game/inventory.js`, `game/spells.js` |
| The main quest | `game/questData.js`, `game/questState.js`, `scenes/worldmap.js` |
| The world of Tamriel | `game/worldMap.js`, `arena/cityDataFile.js`, `arena/cityDataSeeds.js`, `scenes/worldmap.js` |
| Sky, sun, weather | `game/daylight.js`, `game/arenaSky.js`, `engine/render/skyRenderer.js` |
| Saving and the persistent world | `game/save.js`, `game/worldState.js`, `game/regard.js` |

## 7. Verification

```bash
ARENA_PATH=/path/to/arena/ARENA npm test            # node --test tests/unit/*.test.mjs
ARENA_PATH=/path/to/arena/ARENA npm run test:browser # headless Chrome/Edge, all suites
npm run check                                        # both, in order
node tests/run-browser.mjs townsfolk|doors|combat|living   # one suite
npm run probe:mif   ·  npm run probe:city            # format and city evidence
```

The browser suite drives real key and mouse events and measures the captured frame (colour
count, dominant share, hard-edge count, band brightness) instead of trusting an exit code.
It needs `ARENA_PATH` or `?arena=<folder>`; `testmap` needs no game data.

See [PROGRESS.md](PROGRESS.md) for what those runs currently prove, and for the simplifications
(S-numbers) that code and docs cite.
