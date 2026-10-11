# PERFECTARENA — Architecture

**What this is:** *The Elder Scrolls: Arena* (1994) reimagined on the WebGL2 engine
written for `c:/arenaproject/daggerfall` ("Daggerfall Enhanced", `project-dagger`).
The engine is reused as a **presentation/gameplay shell**; Arena's own data is read
at runtime from the player's Arena folder and turned into geometry, textures,
text, and rules **by new Arena-native code**.

Read `DECISIONS.md` for *why*, `FORMATS.md` for *what the bits are*, and
`PROGRESS.md` for *what actually runs*. Anything not demonstrated by a command in
this repo is labelled **UNVERIFIED**.

---

## 1. High-level shape

```
                 ┌──────────────────────────────────────────┐
                 │  PERFECTARENA (static site, ES modules)  │
                 └──────────────────────────────────────────┘
   index.html ──▶ src/main.js  (router: ?city ?dungeon ?wild ?world ?shot)
                      │
      ┌───────────────┼─────────────────────────────┐
      ▼               ▼                             ▼
  src/arena/      src/engine/ (copied from      src/game/  (Arena rules,
  data layer      daggerfall/src, pruned)       quest, chargen, items,
  (Arena data)    renderer, math, UI, audio,    combat, world model)
                  input, collider
```

Three bands, one direction of dependency: `arena/` knows bytes, `engine/` knows
pixels and vectors, `game/` knows Arena's rules. `game/` may import from both;
`arena/` imports nothing from `engine/` or `game/`.

### Runtime data path (no game data in the repo or the build)

Mirrors Daggerfall Enhanced's "Port-Doctrine" (`scenes/dataSource.js`):

1. Player picks their **Arena folder** once (with the `ARENA/` subfolder).
   Persisted in **IndexedDB**; re-picked only on demand.
2. `src/arena/arenaSource.js` exposes `getBytes(name)`:
   memory cache → IndexedDB → loose file (`ARENA/<NAME>`).
3. `src/arena/bsaArchive.js` indexes `GLOBAL.BSA` in the picked folder and
   serves any record by name through the same `getBytes()`.
4. Nothing is embedded, bundled, or copied into `dist/`. `?arena=<url>` is a dev
   door that points the loader at a local static copy (used by tests).

---

## 2. Engine survey — module classification

Every entry is a real path in the read-only engine (`c:/arenaproject/daggerfall/src`).
`REUSE` = copied into `src/engine/` and used unchanged (or with a documented
shim); `ADAPT` = copied but with an Arena-specific adapter at its boundary;
`NEW` = the engine has an equivalent we will **not** use, so Arena logic is
written fresh; `DROP` = Daggerfall-data-specific, not copied.

| Engine module | Class | Why / what Arena needs |
|---|---|---|
| `render/renderer.js` | REUSE | The WebGL2 core: `createMesh`, `uploadTexture`, `createBillboardBatch`, `drawMesh`, `drawBillboards`, `drawTerrain`, `beginFrame/resolveFrame`, `setFog/setLighting/setPointLights`, sky. 5.5k lines, framework-free. Arena supplies meshes + textures; the renderer never touches game data. |
| `render/glProgram.js`, `fogGlsl.js`, `contract.js`, `bounds.js`, `renderTarget.js`, `orderedDither.js`, `perfMeter.js` | REUSE | Leaves of the renderer. `contract.js` documents the MeshBundle/BillboardBatch shapes the Arena mesh builders must emit. |
| `render/skyRenderer.js`, `cloudNoise.js` | REUSE | Procedural sky + night sky. Arena's outdoor maps and wilderness need exactly this. |
| `render/retroPass.js`, `render/characterSprite.js` | REUSE (optional) | Retro mode and the sprite pass; used for Milestone 6 flavour. |
| `world/mat4.js`, `quat.js`, `perlin.js` | REUSE | Math. `mirrorProjectionX` encodes the engine's handedness law — Arena geometry must respect it. |
| `player/pointerLock.js`, `lookFilter.js`, `mwCamera.js` (PITCH_LIMIT) | REUSE | Look input, smoothing, pitch clamp. |
| `player/motor.js` | REUSE | First-person motor: walk/run/crouch/swim/jump constants, gravity, capsule dims, fixed-step integration. Arena's movement is the same shape; step/slope laws are engine-side. |
| `player/collider.js` | REUSE | Capsule-vs-triangle-soup collider in a spatial grid, keyed by string with an optional translation provider. Arena MIF meshes register their triangles here. |
| `ui/cursor.js`, `text.js`, `fpsCounter.js`, `windowStack.js`, `touch.js`, `gamepadInput.js`, `input.js`, `lookSettings.js`, `viewSettings.js`, `hudShortcuts.js`, `nativePanel.js`, `screenshot.js` | REUSE | Input routing, the UI window stack (`pushWindow`/`PopWindow`/pause), text layout, on-screen HUD scaffolding. |
| `ui/bitmapCanvas.js` | REUSE | Generic "palettized bitmap + palette → canvas". Arena's IMG/CIF/DFA land here verbatim. |
| `systems/audio.js` | REUSE | WebAudio engine (3-D loops, one-shots, music ramp). Fed by a new Arena VOC/XMI loader. |
| `systems/settings.js`, `uiPrefs.js`, `frameCap.js`, `notify.js`, `timeScale.js`, `crashText.js` | REUSE | Settings store, frame cap, HUD notices, crash line. |
| `formats/flcFile.js` | REUSE | Autodesk FLI/FLC. Arena's 17 `.FLC` files (INTRO, KING, STAFF, END01/02…) are the *same* format — intro/movie playback works for free. |
| `formats/bsaFile.js` | ADAPT | Daggerfall BSA = `int16 count + uint16 directoryType + records@4`. **Arena BSA = `uint16 count + records@2`, no type field.** Verified by inspection (FORMATS.md §2). Arena gets its own reader; the Daggerfall one is kept for reference only. |
| `formats/dfPalette.js` | ADAPT | Daggerfall palette reader. Arena `.COL` = 8-byte header + 256×RGB (verified). Thin Arena reader in `arena/palette.js`; the RGB→material path is shared. |
| `formats/fntFile.js`, `ui/text.js` | ADAPT | DFU FNT = 240×16×16 glyphs with an offset table. **Arena fonts (`TEENYFNT.DAT`, `ARENAFNT.DAT`, `FONT*.DAT`) are their own format** (partial decode in FORMATS.md §9). `arena/font.js` adapts Arena glyphs into the FNT shape so `makeFont` is reused unchanged; falls back to a built-in bitmap face if parsing fails. |
| `formats/cifRciFile.js`, `imgFile.js`, `textureFile.js` | NEW | Daggerfall IMG/SET/CIF are not Arena's IMG/SET/CIF. `arena/image.js` (IMG), `arena/cif.js` (CIF/RCI), `arena/set.js` (SET wall sheets) are new, using the engine's palette + `bitmapCanvas` conventions. |
| `formats/*` (everything else: `arch3dFile`, `blocksFile`, `mapsFile`, `saveGames`, `bookFile`, `rumorFile`, `hmiFile`, `sndFile`, `spellsStd`, `worldData*`, `mw*`, `unityBundle*`, `pakFile`, `rscTable`, `skyFile`, `woodsFile`, `lz4`) | DROP | Daggerfall record layouts. `lz4.js` is worth remembering — Arena needs **Type08** decompression instead (FORMATS.md §5). |
| `scenes/world.js`, `exterior.js`, `interior.js`, `dungeon.js`, `interiorContext.js`, `dataPipeline.js`, `shared.js`, `modWorldData.js` | DROP → NEW | Daggerfall scene hosts built on RMB/RDB/BLOCKS/WOODS. Replaced by `src/scenes/{city,dungeon,wild,worldmap}.js`. `interior.js` is kept as the **reference host** for the minimum renderer call sequence (see §4). |
| `scenes/dataSource.js` | ADAPT | The folder-pick + IndexedDB + `getBytes` pattern is exactly right and is re-implemented for Arena with no ARENA2 `KEEP` diet. |
| `world/streamingWorld.js`, `terrainGen*.js`, `rmbLayout.js`, `rdbLayout.js`, `blocksFile`, `mapsFile`, `worldOfDaggerfall.js`, `roads*`, `deepWater*`, `windmills*`, `climateSwaps.js`, `seasonReskin.js`, `weather*`, `spawnedDungeons.js`, `smallerDungeons.js` | DROP | A continuous, streamed, procedurally-textured Tamriel built from Daggerfall's data. Arena has no counterpart and no data for it (DECISIONS.md D2). |
| `world/dungeonLayout.js`, `interiorLayout.js`, `locationLayout.js`, `staticDoors.js` | DROP → NEW | Daggerfall block/record layout. Arena's layout is the MIF grid itself. |
| `characters/*` (mobile types, beasts, daedra, paperdoll, dyes, nameGen…) | DROP → NEW | DFU creature tables and voxel/sprite rigs. Arena's monsters are a different, smaller set defined by A.EXE tables. |
| `combat/*` | DROP → NEW | DFU hit/damage/material formulas and the weapon rig. Arena's combat is a much smaller to-hit/damage model (Milestone 4/6). `combat/fpArm.js`, `fpsWeapon.js`, `weaponRig.js` are the *presentation* pieces worth revisiting in Milestone 6. |
| `systems/quest/*`, `scenes/questBridge.js`, `questData.js`, `questFoeHost.js` | DROP → NEW | **The engine does have a quest framework** — a full port of Daggerfall Unity's QRC quest machine, driven by `.txt` quest scripts in DFU's own language. Arena's main quest is a linear 10-stage chain in a different (save-file) format; porting the QRC machine and authoring Arena's quests in QRC is the rejected alternative in DECISIONS.md D3. |
| `systems/save.js`, `saveSlots.js`, `classicSave.js`, `cloudSaves.js`, `saveTransfer.js` | DROP → NEW | DFU save tree/record format. `saveSlots.js`'s IndexedDB multi-slot pattern is reused conceptually; the payload is new Arena JSON. |
| `systems/chargen.js`, `classQuestions.js`, `startingGear.js` | DROP → NEW | DFU skills/careers/backgrounds. Arena chargen (race, class, roll, name) is new logic (DECISIONS.md D5). |
| `ui/charsheet.js`, `enhancedCharSheet.js`, `hud.js`, `enhancedInventory.js`, `automap*.js`, `chargen.js`, `travelOptions.js`, `talk*.js`, `bankWindow.js`, `bookReader.js` | DROP → NEW | DFU window content and art. The *container* (`windowStack`, `text.js`, `bitmapCanvas.js`) is reused; Arena's char sheet, inventory, quest log, dialog and world map are new windows. |
| `ui/enhancedMenu.js`, `introScreen.js`, `videoPlayer.js`, `menu.js` | ADAPT | Menu/video plumbing. The splash video player is reusable with Arena `.FLC`; the menus are replaced with Arena's own titles (Milestone 4/6). |
| `systems/travel*.js`, `transport.js` | DROP → NEW | DFU travel math over a 1000×500 region grid. Arena's travel is province-map based (FORMATS.md §8). |
| `net/*`, `ai/*`, `systems/talk*.js` (DFU talk trees), `systems/*` remaining features | DROP | Multiplayer, navmesh, and the long feature tail are out of scope. |

**Summary:** the reusable core is the renderer, math, motor/collider, input and
the UI container — roughly `render/` + `player/` + `ui/` (container only) +
a dozen `systems/` leaves. Everything that knows *Daggerfall's data* is dropped
and replaced by Arena-native code.

---

## 3. Arena data layer (`src/arena/`)

| Module | Responsibility |
|---|---|
| `arenaData.js` | **The facade.** Every name the game asks for comes back decoded and cached: `mif()`, `inf()`, `img()`, `setFrames()`, `palette()`, `texture(ref)`. Lookup order is loose file then `GLOBAL.BSA`. Owns the cache and the warning sink. |
| `browserSource.js` | The two ways the browser finds Arena: the player's picked folder (`fileListSource`, `pickArenaFolder`) and the dev/test door (`localServerSource`, which fetches a loose-file index so a miss is not a 404). |
| `bsaArchive.js` | `GLOBAL.BSA` index + record extraction. **Not** the engine's reader — Arena's header has no directory-type field (D6). Verified: 2 441 records, Σ sizes = directory start. |
| `decompress.js` | Arena's four codecs: `decodeType08` (adaptive Huffman + 4 KiB history), `decodeType04`, `decodeRle`, `decodeRleWords`. Pure, so the same code runs in Node and the browser. |
| `palette.js` | `.COL` (8-byte header + 256 RGB), embedded 6-bit palettes, and palettized → RGBA with index 0 transparent. |
| `image.js` | `.IMG`: the raw 4096-byte wall form, the 12-byte headered form, all three compressions, the by-name headerless cases. |
| `infFile.js` | `.INF` grammar: `@FLOORS/@WALLS/@FLATS/@SOUND/@TEXT`, `*`-directives into the `*BOXCAP`/`*BOXSIDE`/`*MENU` slot arrays, the ordered texture table with `.SET #n` expansion, `*CEILING`, chasm/stair/level textures, plus the **archive decryption**. |
| `mifFile.js` | `MHDR` header, `LEVL` sections, tagged chunks (`FLOR/MAP1/MAP2` compressed layers, `TARG/TRIG/LOCK/NAME/INFO/NUMF`), and the two quirks of the shipped data (oversized layers, physical level order). |
| `font.js` | *Milestone 4* — Arena font → FNT-shaped glyph table for `engine/ui/text.js`. |
| `rmdFile.js`, `cityData.js`, `text.js` | *Milestones 4–5* — wilderness blocks, the `CITYDATA.64` location table, and the `.DAT`/`TXT` text sources. |
| `tables.js` | *Milestone 4* — Arena **rules** tables. The provided data has **no `A.EXE`** and `ACD.EXE` is PKLITE-packed (D11), so classes/attributes/monsters/items come from documented community tables (UESP) transcribed into data files, each marked with its source. |

## 4. Game layer (`src/game/`) — the world model

Arena's structure, taken literally (DECISIONS.md D2):

```
world map (continental)  ──pick province──▶  province map  ──pick location──▶  location scene
      │                                                                          ├── city/town/village  (MIF grid + INF + people)
      │  fast travel (time + cost)                                             ├── wilderness  (RMD chunks around the settlement)
      └── quest dungeon unlock                                                 ├── dungeon           (MIF grid, multi-level)
                                                                               └── interior building (MIF grid + flat doors)
```

* **Location scenes** are loaded one at a time; each is a self-contained MIF grid
  turned into a mesh bundle by `game/mifMesh.js`. No continuous overworld, no
  streaming terrain, no floating origin needed for a 100×100 grid.
* **`game/mifLevel.js` is where Arena's voxel bitfields become a model** and
  `game/mifMesh.js` is where that model becomes geometry and collision. Splitting
  them means the decoding can be tested (and printed as ASCII) on its own, and it
  is: `tools/lib/mapascii.mjs` prints a decoded level, which is how the bitfields
  were established.
* **Wilderness** is assembled from RMD blocks around the settlement using the
  settlement seed, matching Arena's 64×64-block area with the town in the middle
  128×128 cells. Only a window of blocks around the player is built (Milestone 5).
* **Collision** registers the built mesh's triangles into `engine/player/collider.js`.
* **Height**: MIF voxel layers give per-column floor/ceiling heights; MAP1/MAP2
  bits give the column height class. Walls are box sides from the INF mapping.

Minimum renderer call sequence (proven by the engine's own `scenes/interior.js`):

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

## 5. Rules layer

| System | Source | Notes |
|---|---|---|
| Races / classes / attributes | documented community tables | 8 races, 18 classes, STR INT WIL AGI SPD END PER LUC. `A.EXE` absent in the provided data (DECISIONS.md D5). |
| Monsters | documented community tables + `A.EXE` offsets where a matching binary is supplied | Arena's monster list with HP/damage/XP. |
| Items / artifacts | Arena item list + `ARTFACT*.DAT` lore text | Staff of Chaos pieces and artifacts are flagged quest items (DECISIONS.md D4). |
| Spells | `SPELLSG.65` / `SPELLS.LST` (128 × 85 bytes, verified) | Milestone 6. |
| Quest | `game/questState.js` — a 10-stage machine modelled on Arena's `MQDATA` save block (`NextStep`, `DungeonLocationKnown`, `HasStaffPiece`, `HasKeyItem`) | DECISIONS.md D3. |
| Combat | `game/combat.js` — Arena's to-hit / damage / monster attack model | Milestone 4. |
| Raised-platform geometry | `game/tables/raisedPlatforms.js` — **reconstructed**, because the arrays live in `A.EXE` which this data set does not have | DECISIONS.md D11, FORMATS.md §13. |

## 6. Tests (`tests/`)

* `tests/unit/*.test.mjs` — Node tests (`node --test`) over the **real** Arena
  files: the BSA directory identity, MIF framing and level counts, every loose
  `.MIF` parsing and decoding, oversized layers, physical level order, Type08
  output sizes, INF decryption and grammar, every referenced texture decoding, and
  winding on a 20 800-quad level. `ARENA_PATH` selects the folder.
* `tests/run-browser.mjs` + `tests/cdp.mjs` — launches the installed Chrome/Edge
  headless over raw CDP, drives real key events, captures screenshots into
  `tests/shots/`, fails on console errors, and measures the frame (colour count,
  dominant share, hard-edge count, band brightness) rather than trusting an exit
  code. Suites: `testmap`, `movement`, `interior`.
* `tools/lib/shotascii.mjs` — prints a screenshot as ASCII so a human can read the
  shape of a frame in a terminal.

`window.__debug` is the one test seam. The interior scene exposes `state()`,
`levels()`, `loadLevel(i)`, `loadLevelAndSettle(i)`, `teleportCell(row, col)`,
`cellAt(row, col)`, `teleport`, `look`, `input`, `advance`, `spawnPoint`,
`shotPose`. Milestone 4 adds `giveItem`, `setQuestFlag`, `questLog`, `save`, `load`.
