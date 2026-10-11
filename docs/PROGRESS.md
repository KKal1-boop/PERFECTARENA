# PERFECTARENA — Progress

*Re-read this file first after any context reset.*

**Current milestone: 4 (vertical slice) — IN PROGRESS.**
Cities are in and walkable; character creation, NPCs/dialog, combat, quest state and
save/load are not. See "Milestone 4 — what is done so far" below for the exact split.

---

## Status by milestone

| # | Milestone | Status |
|---|---|---|
| 1 | Survey and decisions (docs) | ✅ done — ARCHITECTURE, DECISIONS, FORMATS |
| 2 | Scaffold + hand-made test map | ✅ done — 17/17 browser checks |
| 3 | MIF pipeline (decompress, parse, mesh, walk a real interior) | ✅ done — 13/13 unit + 29/29 browser checks |
| 4 | Vertical slice (chargen → city → dungeon → staff piece → save/load) | 🟡 cities done (9/9 unit + 28/28 browser); chargen, NPCs, dialog, combat, quest, save/load remain |
| 5 | Full content (all provinces, all staff pieces, main quest completable) | ⬜ not started |
| 6 | Systems and polish (magic, inventory, audio, performance) | ⬜ not started |

### Verifiable commands

```
npm run test          # node --test tests/unit/*.test.mjs          → 22/22
npm run test:browser  # node tests/run-browser.mjs                → 78/78
npm run dev           # node tools/serve.mjs 8080                 → the game
npm run probe:mif     # node tools/mif-dump.mjs                   → format evidence
npm run probe:city    # node tools/city-dump.mjs --slots --ascii=60 → city evidence
```

The browser suite needs `ARENA_PATH` (or `?arena=<folder>` on the URL) so it can
read a real Arena installation. Without it the `interior` suite is the only one
that cannot run; `testmap` and `movement` need no game data.

---

## Milestone 4 — what is done so far

**A whole Arena city is generated and can be walked.** Cities were the largest
missing piece of the data model and they are not a file: `CITY1.MIF` is a skeleton
with an empty middle, and the game assembles the real city from a seeded grid of
20×20 block `.MIF`s at load time. `src/game/cityPlan.js` does exactly that, in the
original's draw order, with Arena's own RNG.

### Verified (all by running it)

| Evidence | Result |
|---|---|
| `node --test tests/unit/*.test.mjs` | **22/22** — 13 MIF + 9 city |
| `node tests/run-browser.mjs city` | **29/29** in headless Chrome with WebGL2 |
| `node tests/run-browser.mjs` (all four suites) | **79/79**, no console errors, no WebGL misuse warnings |
| `node tools/city-dump.mjs CITY1.MIF --slots` | 36/36 slots stamped, none missing, plan printed slot by slot |
| `node tools/lib/shotascii.mjs tests/shots/m4-city.png` | a street-level frame: sky above, sunlit buildings, ground below |

### Concrete numbers from the real data

* `tests/unit/city.test.mjs` checks all **368** names the block tables can produce
  against `GLOBAL.BSA`: every one exists. It also pins the three places the archive
  is *not* a bijection with the tables (52 zero-padded aliases, `BSBD1E`, bare
  `BSBD20`) and the one variation-count disagreement (`NB`: table 10, archive 12).
* Every city and wilderness INF name the tables can build exists: `DCN DCR DCW`,
  `MCN MCR MCS MCW`, `TCN TCR TCS TCW`, plus the eight wilderness ones.
* `CITY1.MIF`, seed 20232: 36 of 36 blocks stamped, 12 400 cells written, 22 847
  quads, 6 560 wall cells, 58 menu edges, 463 entities, 4 176 roofed cells of
  16 129 — **so 12 124 cells are open to the sky.**
* **A seed is reproducible:** `?city&seed=99` and `?city&seed=20232` produce
  different block sets, and the same seed produces the same city every time.
* **A city is walkable, and its buildings block:** the player walks 0.90 units down
  a street and stops at `z = 49.65` with the building wall's face at `50.00`
  (capsule radius 0.35).
* **Cities have no `0xB` door voxels at all** (`door: 0`, and `TCN.INF` declares no
  `*DOOR`). Building entrances are `0xA` **menu edges** carrying the shop's sign
  texture. Measured, not assumed.

### What the tests caught (each was a real defect)

1. **Entity flats are not structure.** The first reserved-slot rule counted any
   non-zero `MAP1` voxel, so the ten street decorations scattered through
   `CITY1.MIF`'s grid reserved **five of the city's thirty-six blocks** — 14% of the
   city deleted for two flats each. Caught by printing the assembled plan
   (`city-dump.mjs --slots`) and then measuring what each slot really held.
2. **`?city=town` used the city's skeleton.** The settlement kind was parsed but
   the template name was hard-coded, so asking for a town gave a city-state grid
   inside `CITY1.MIF`. The browser suite's `TOWNW?\d.MIF` check failed.
3. **The city gate is a vantage, not a sky.** The spawn is a two-cell passage
   *through* the wall, so the first frame from the spawn is a wall — the
   "top of the frame is sky" check failed until the suite started taking its
   picture from the middle of a street. The map was right; the test's vantage was
   wrong.
4. **The table's `NB` variation count disagrees with the data** (10 vs 12). Kept as
   the original's, with the eight unreachable records asserted by name so the
   disagreement stays visible instead of quietly shrinking the city.
5. **Arriving at a city gate stared at a wall.** A city's start point is a two-cell
   passage *through* the perimeter wall, so the default `yaw 0` put the player's
   first frame against the end of the passage — visible in `tests/shots/m4-city.png`
   before the fix. The player now arrives facing the most open of the four grid
   directions (`openYaw`), which took two attempts: the first version rounded the
   spawn's cell-unit coordinates instead of flooring them, so it stepped into the
   neighbour cell, read the passage as open, and the arrival walk measured 0.90
   units instead of 8.40. That is what the `arrives facing into the city` check is
   for.

### Broken / not yet established (UNVERIFIED)

* **A specific location's city is not reachable yet.** The climate that picks the
  INF comes from the **world map terrain image** sampled at the location's global
  pixel, and the city seed comes from `CITYDATA.64`'s per-location records. So
  `?city=town&seed=99` is a real Arena town with a plausible town seed, but
  "Daggerfall" is not. Neither the terrain image's classes nor `CITYDATA.64`'s
  per-location field offsets are decoded (FORMATS.md §8).
* **Wilderness is still unbuilt.** `WILD001.RMD`…`WILD070.RMD` (64×64×6 bytes each)
  are sized and their RLE codec is written, but the 6 bytes per cell are not
  decoded, so the outdoor ring around a city, the 4 096×4 096 assembly and the
  settlement's middle 128×128 cells are all Milestone 5.
* **You cannot enter a building.** The menu edges that mark entrances are decoded
  (and drawn), but nothing reads the INF's `*MENU` table to load the block's
  interior `.MIF`, and there is no interaction key. This is the next Milestone 4
  step, together with NPCs (`.CFA` sprite sets and the 340-record list) and dialog
  from `TEMPLATE.DAT`/`CITYTXT`.
* **Raised platforms contribute nothing to a city**: the block data uses only
  height index 0, exactly as in the dungeons (S9).
* **No character creation, combat, quest state, save/load or UI windows** — the
  rest of Milestone 4. `QUESTION.TXT`, `CLASSES.DAT`, `SPELLSG.65` and the text
  `.DAT` files are located but unparsed (FORMATS.md §10).
* **City frames are not performance-measured.** 22 847 quads at ~60 materials is
  fine in headless SwiftShader; no frame-time budget has been taken on a GPU, and
  the draw-call count grows with the number of distinct textures, which is highest
  in a city (S6/D14).

---

## Milestone 3 — what was done

**A real Arena dungeon now loads from the player's own data and can be walked.**

### Verified (all by running it)

| Evidence | Result |
|---|---|
| `node --test tests/unit/*.test.mjs` | **13/13** — every assertion runs against the real files in `c:/arenaproject/arena/ARENA` |
| `node tests/run-browser.mjs interior` | **29/29** in headless Chrome with WebGL2 |
| `node tests/run-browser.mjs` (all suites) | **50/50**, no console errors, no WebGL misuse warnings |
| `node tools/mif-dump.mjs` | all 21 loose `.MIF` files parse; parsed level counts match the declared counts; every level names its `.INF` |
| `node tools/lib/mapascii.mjs 39300577.MIF 0 60` | a recognisable dungeon: rooms, corridors, doors, staircases, chasms |
| `node tools/lib/voxhist.mjs 39300577.MIF 0` | raw-ID histograms with their bitfields (`0x3434` = wall texture 51, `0x703E` = a raised platform, `0xB010` = a swinging door) |
| `node tools/lib/textures.mjs START.MIF 8` | every INF texture decodes; stone `rgb(57,59,67)`, a door `rgb(57,30,30)` |

### Concrete numbers from the real data

* `GLOBAL.BSA`: **2 441 records**, payload `16 758 198` B and directory start
  `16 758 198` B — the directory begins exactly where the last payload ends.
* `START.MIF` (the Imperial Dungeons, 50×50, 1 level, `START.INF`): 2 242 quads,
  4 484 triangles, 1 631 wall cells, 140 entities, 264 chasm cells, 13 textures.
* `39300577.MIF` (a 100×100 main-quest dungeon, 3 levels, `HALLS1–3.INF`):
  20 821 quads / 41 642 triangles on level 1, 4 857 walls, 585 raised platforms,
  87 doors, 833 chasm cells, 271 entities.
* **Collision is exact:** walking into a wall from a cell centre stops the capsule
  at `z = 9.65` with the wall face at `z = 10.00` and a capsule radius of `0.35`
  — the contact distance, to the centimetre.
* **Level switching rebuilds geometry, textures and collision** (level 2 of
  `39300577.MIF`: 13 448 quads, `HALLS2.INF`, all sub-mesh textures present,
  player lands on the new floor).
* **Lighting was tuned by measurement**, not taste: peak luminance and hard-edge
  count on a fixed vantage across ambient 0.26 → 1.0 (13 → 107 edges). See
  DECISIONS.md D13.

### What the tests caught (each was a real defect, each is now fixed)

1. **`.MIF` voxel layers can be larger than the map.** `VILPAL3.MIF`'s second
   level declares 25×25 and ships a 100×100 grid (20 000 B). The original reads
   the first `width × height` voxels; throwing instead broke every file that has
   such a stub. Now read the same way, with a warning on the level.
2. **A cell has a floor *and* a structure.** The first decoder put both in one
   `kind` field, so every wall erased the floor beneath it — the chasm count came
   out 644 instead of the true 833 and the floor statistics were meaningless.
3. **A missing loose file is not an error.** Arena resolves most names out of
   `GLOBAL.BSA`, so probing the folder first produced a 404 in the console for
   every one of them. The dev server now exposes a loose-file index and the client
   requests only names that exist, so "no console errors" stays a real signal.
4. **Winding had to be derived, not guessed.** The engine runs
   `gl.frontFace(gl.CW)` through its mirrored projection; a unit test now asserts
   per triangle, on a 20 800-quad real level, that each triangle's geometric normal
   agrees with its vertex normal.

### Broken / not yet established (UNVERIFIED)

* **Raised-platform heights and thicknesses are reconstructed, not extracted** —
  `A.EXE` is absent and `ACD.EXE` is PKLITE-packed. Only height index 0 is ever
  used by the real data (measured), so only the thickness ladder's absolute scale
  is uncertain. See DECISIONS.md D11 and simplification S9.
* **`FLAT` / `INNS` / `LOOT` / `STOR` chunk internals** — still opaque. Flats are
  *placed* (their indices come from `FLOR`'s low byte and `MAP1` `0x8` voxels) but
  not drawn: billboards arrive with Milestone 4 NPCs.
* **Doors are solid.** The `0xB` bitfield decodes (kind and texture are known and
  reported by `state()`), but nothing opens them yet — Milestone 4.
* **Chasms are rendered as a lower floor with the chasm texture**, not as pits
  with swimming, falling and drowning. They are walkable for now.
* **Edges (fences/gates/signs) and transparent walls (arches)** decode and mesh,
  but the transparent ones are drawn opaque; alpha test is Milestone 6.
* **Diagonals** are drawn as a thin two-sided slab across the cell, which is the
  right shape and the right collision, not the original's exact quad split.
* **`.CIF` / `.RCI` / `.DFA` pixel layouts** — sizes and headers known, slicing
  not confirmed. `.CIF` is on the Milestone 4 path (UI art); `.RCI` is Milestone 6.
* **Arena fonts** — still only partly decoded (FORMATS.md §9). Milestone 4 either
  finishes it or takes the built-in bitmap face fallback (S5/S6).
* **Cities and wilderness are untouched.** `RMD` sizing is verified but nothing
  reads a city `.MIF` yet — that is Milestone 4/5.
* **No audio.** `.VOC`/`.XFM` decoding is Milestone 6.
* **Performance is untuned.** ~21 000 quads at 60 materials is fine on this
  machine in headless SwiftShader; no frame-time budget has been measured on a GPU.

---

## Milestones 1–2 — what was done (kept for the record)

### Milestone 2

* `node tools/copy-engine.mjs` copied **154 engine modules** into `src/engine/`.
* The engine's WebGL2 `Renderer` boots inside PERFECTARENA and draws a mesh built
  by hand: 3 draw calls, 164 triangles, 3 sub-meshes, 3 textures.
* Sky, ground, distance fog and lighting all verified by measuring the captured
  PNG, not by eye: 451 distinct colours, 2.0% dominant colour, 97 hard colour
  edges along the best scanline.
* Movement and collision verified with real key events through CDP:
  `W` moves 3.9 units in 0.9 s; a wall stops the capsule at exactly the contact
  distance; the player does not fall through the floor.
* **Two real bugs the tests caught:** a foreign pass (the sky) leaves the
  renderer's state shadows stale unless the host calls `markForeignPass()` — the
  courtyard rendered *as sky*, silently, with three `INVALID_OPERATION` warnings a
  frame — and a sub-mesh whose texture is missing draws **untextured, not black**,
  so "3 textures uploaded" was not "the textures the mesh asked for were
  uploaded". Both lessons are now assertions.

### Milestone 1

* The BSA, MIF header and chunk framing, INF grammar, `CITYDATA.64` layout,
  palette and text-file structures were established by inspecting the real bytes
  (see FORMATS.md §1–§4, §8, §10).
* `A.EXE` was found to be absent; `CITYDATA.64` was confirmed as 9 provinces ×
  1 228 bytes by the province names landing at exactly `0`, `1228`, `2456`, ….

---

## Simplifications logged

| # | Simplification | Where / why |
|---|---|---|
| S1 | Rules tables come from documented community tables, not extracted `A.EXE` | `A.EXE` is absent from the provided data (D5). Each table file records its `source`. |
| S2 | No continuous overworld; per-location scenes | Arena's own model, and the engine's streaming world is unfeedable (D2). |
| S3 | `.DEVTOOLS/` holds a portable Node 22 because the machine has no Node | Environment constraint (D8). Git-ignored; not part of the deliverable. |
| S4 | Browser tests drive system Chrome/Edge over raw CDP rather than Playwright | No Node/npm toolchain on the machine; documented in D8. |
| S5 | Arena UI text may fall back to a built-in bitmap face | Arena font format only partly decoded (FORMATS.md §9). |
| S6 | HUD text is a **DOM** overlay, not the engine's GL text pass | The GL text path needs an FNT font; Arena's is still only partly decoded (§9). Arena's windows (character sheet, inventory, quest log, dialog, map) move to the engine's GL UI in Milestone 4. |
| S7 | Superseded: the test map emitted both windings; `mifMesh.js` emits one | Resolved in Milestone 3 — winding is derived from the face normal and asserted per triangle (D14). |
| S8 | No audio yet | `.VOC`/`.XFM` decoding is Milestone 6; the engine's WebAudio layer is copied and unused. |
| S9 | **Raised-platform heights and thicknesses are reconstructed** | `A.EXE` absent, `ACD.EXE` PKLITE-packed (D11). Only height index 0 is exercised by the real data, so in practice only the thickness ladder's scale is approximate. |
| S10 | **One voxel layer = 2.5 world units**, so `*CEILING` affects appearance only | The engine's metric capsule (1.8) does not fit a `ceiling/128` layer (D12). |
| S11 | Interiors use one raised ambient term instead of Arena's light tables | `PAL.COL` is raw-dim; light tables are Milestone 6 polish (D13). |
| S12 | Chasms are a lower textured floor, walkable | Falling, swimming and drowning are gameplay, not format work; Milestone 6. |
| S13 | Transparent walls and edges draw opaque | Alpha test is Milestone 6; the geometry and the collision bits are already exact. |
| S14 | `MIF` `FLAT`/`INNS`/`LOOT`/`STOR` bodies are captured but unparsed | Their placement is known; their contents are not needed until Milestone 4/5 NPCs and loot. |
| S15 | **A city's block-grid start position and reserved-slot lists are reconstructed** | Both live in `A.EXE` (D11). The grid is centred inside the skeleton's wall ring and the reserved list is measured from the skeleton, so neither invents data. Consequences are tested: no stamp may touch the wall ring or the water. |
| S16 | **A city's climate is a parameter (`?climate=`), not a location lookup** | Climate comes from the world map terrain image at the location's global pixel; decoding that image and the province rectangles is Milestone 5. Any of the eleven city INFs can be selected meanwhile. |
| S17 | **Cities use one daylight ambient + sun** instead of Arena's light tables | Same reason as the interiors (D13). The sun is on for a city so buildings read as solid rather than flat-lit; the numbers are in `scenes/interior.js` and overridable with `?ambient=&sun=&fog=`. |

## Known risks

* **Milestone 4 needs the INF `.INF`-driven *interiors* as well as dungeons** —
  a city is a different `MAP1` population (menu voxels with `*MENU` ids, `0xA`
  edges for shop signs) plus the building `.MIF`s those menu voxels point at.
  The `*MENU` slot array already parses (`inf.menus`), so the seam exists.
* **Arena's font is on the Milestone 4 critical path** for the character sheet,
  inventory, quest log and dialog. Either finish §9 or take the S5/S6 fallback;
  the decision should be recorded either way.
* **Draw-call count scales with the number of distinct textures**, not with map
  size (60 for a dungeon). A city with many building types will be higher; if it
  becomes a problem the atlas in D14 is the answer, not a change of mesher.
* **The dev-server door is a dev door.** A player runs the game with a picked
  folder; the `?arena=` path exists so the headless tests do not need a file
  picker, and it is not part of the shipping flow.
