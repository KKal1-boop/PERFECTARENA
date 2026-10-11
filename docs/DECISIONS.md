# PERFECTARENA — Decisions

Each entry: the decision, the rationale, and the alternatives that were rejected.
Entries marked **DEVIATION** are places where a premise in the task brief turned
out to be wrong; the brief itself is the thing that failed, not the plan.

---

## D1 — Geometry: MIF grid → variable-height box meshes (**DEVIATION-adjacent**)

**Brief said:** "Arena maps are first-person raycaster grids with variable-height
columns (not isometric)."

**Verified:** half right, and the half that is wrong changes the pipeline. Arena's
level is **not** a Wolfenstein-style raycaster. `.MIF` is a *tagged chunk
container* (`MHDR` header + `LEVL` sections + `FLOR`/`MAP1`/`MAP2`/`TARG`/`TRIG`/
`LOCK`/`NUMF`/`NAME` chunks) holding per-cell **16-bit voxel IDs** at 50×50,
32×32 or 64×64 cells. The voxel ID is a **bitfield**, not a flat texture index:
`(id & 0x7F00) >> 8` and `id & 0x007F` are read separately, and the height class
comes from bits `0x80` / `0x8000` in `MAP2`. So it *is* a first-person grid with
per-column heights, but the geometry and the texture lookup are both derived
through `.INF`.

**Decision.** Convert each MIF cell into **quads**, not into a raycast loop:

* one floor quad per cell, at the column's floor height, with the INF `@FLOORS`
  texture for that cell's floor ID;
* one ceiling quad per cell (or open sky on an outdoor/wilderness map) from
  `*CEILING`;
* vertical wall quads along each cell edge where the neighbouring cell's height
  differs or where the cell is a "box side" (INF `*BOXSIDE`, `*DOOR`, chasm and
  level-up/down directives), with the INF `@WALLS` texture;
* door cells become either a solid wall (locked) or a gap + a billboard flat.

Textures come from `.INF`'s **ordered texture list** (filenames, with `.SET #n`
expanding to consecutive entries) → the corresponding IMG/SET record in
`GLOBAL.BSA` → palette lookup → `renderer.uploadTexture`.

The same builder emits a **triangle soup for collision** into
`engine/player/collider.js`, so geometry and collision can never disagree.

**Rejected: a GPU raycaster.** A DDA raymarch over the voxel grid in a fragment
shader is closer to the original engine and needs no mesh, but it throws away the
parts of the reused renderer that matter (fog, lighting lane, shadow pass,
billboards, sky), makes doors/flats/entity occlusion awkward, and would have to be
written from scratch. Meshing is cheap for a ≤64×64 grid (a few thousand quads)
and reuses the whole renderer. **Rejected: isometric/top-down**, which the brief
correctly rules out.

**Consequence:** an INF's texture list must be parsed before a MIF can be drawn,
so `infFile.js` is on the critical path for Milestone 3, and the two files are
loaded as a pair (MIF name → same-name INF, e.g. `CAS.MIF` + `CAS.INF`).

## D2 — World model: Arena's structure, no continuous terrain

**Decision.** World map → province map → location, with fast travel and
per-location loading; wilderness assembled from 64×64×6-byte `.RMD` blocks with the
settlement sitting in the middle 128×128 cells. **No continuous terrain.**

**Rationale.** (a) It is Arena's actual model (verified: `TERRAIN.IMG` and
province rectangles in `CITYDATA.64` exist, and the wilderness is per-settlement
and assembled from repeating blocks, so walking far out *repeats*, which is a bug
in the original, not a world). (b) The engine's continuous-terrain machinery is
**not** reusable — `streamingWorld.js`/`terrainGen.js`/`WORDS.WLD` are built on
Daggerfall's heightfield, block and map-pixel data, and Arena has no equivalent to
feed them. Choosing continuous terrain would mean writing a terrain generator *and*
a new streaming system, i.e. strictly more work for a worse match.

**Rejected:** reuse `scenes/world.js` wholesale (16.8k lines bound to Daggerfall
data — dropping it is most of the reason this project is feasible); fake a
continuous overworld by stitching wilderness blocks into one giant map (memory and
load time explode for no gameplay gain).

**Consequence:** the "floating origin" problem the engine solves for 1000×500-pixel
Tamriel does not exist here; each location is at most a few thousand units across
and can be built at the world origin.

## D3 — Quest: a small Arena-native state machine

**Decision.** `src/game/questState.js`, a linear 10-stage machine:
escape the Imperial Dungeons → 8 Staff pieces (one per non-Imperial province,
each with an optional clue dungeon first) → the Imperial Palace. Flags modelled on
Arena's own save block: `NextStep`, `DungeonLocationKnown`, `HasStaffPiece`,
`HasKeyItem`. Quest definitions live in `src/game/questData.js` as plain objects
(stage → text, dungeon, clue dungeon, item granted, dialog topic unlocked).

**Rationale.** Arena's main quest is a fixed chain; its data lives in the save file
(`SAVEENGN`-style `MQDATA`), not in a quest script language. A 10-state table is
smaller, faster to debug, and trivially testable through `__debug` (which the
verification rules require).

**Rejected: the engine's quest framework.** It exists and is good — a full port of
Daggerfall Unity's QRC quest machine (`src/systems/quest/*`, ~20 modules, plus
`vendor/dfu-quests`). Using it would mean (i) porting its data seams, (ii)
authoring Arena's 10 quests in DFU's quest scripting language, and (iii) dragging
in DFU's faction/place/item registries that the language references. That is a
large detour to model a chain that is inherently linear. Also rejected: hard-coded
`if (stage === 5)` logic scattered through the game — the table keeps the quest
data-driven, which is what the brief asked for.

**Also rejected:** quest items as a bespoke type. See D4.

## D4 — Items: one generic item record; Staff pieces are flagged quest items

**Decision.** A single `Item` shape (`id`, `name`, `kind`, `weight`, `value`,
`damage/armor`, `flags`) used for weapons, armour, potions, quest items and
artifacts. Staff of Chaos pieces are items with `flags: ['quest','staffPiece']` and
a `pieceIndex` 0–7; picking one up sets the quest flag and the quest log entry.
Assembling means `staffPieces.size === 8` → the "Staff of Chaos" item replaces the
pieces in the inventory. The **Jewel of Fire** (Imperial Palace) is a quest item
that must be used with the assembled staff to finish the game.

**Rationale.** Arena has no enchantment/material model to speak of; a flat record
with flags covers everything the main quest and a shop need. Weighted flags keep
"is this inventory-safe?" and "does it advance the quest?" as one query each.

**Rejected:** DFU's deep item/template/material system (the engine's
`characters/itemTemplates.json`, `equipRules.js`) — it encodes Daggerfall's
material tiers and magic-item model that Arena does not have.

## D5 — Stats: Arena's own attributes and classes; **A.EXE is absent** (**DEVIATION**)

**Brief said:** "Some game rules (class/monster/item tables) may live in A.EXE
rather than data files: extract them or use documented tables, and record which."

**Verified:** the provided Arena folder contains **no `A.EXE`** — only
`ACD.EXE` (character/tech helper), `INSTALL.EXE`, `ULTRAMID.EXE`. The documented
community offsets (e.g. class hit dice at `0x42001`, base attributes at `0x39CF3`)
are for a *decompressed* `A.EXE` v1.06 and are unusable here. Data files that do
exist: `CLASSES.DAT` (216 bytes = 18 classes × 12, structure not yet decoded),
`GUARD.DAT`, `QUESTION.TXT` (chargen questions), `SPELLSG.65`/`SPELLS.LST`
(128 × 85-byte spell records, verified).

**Decision.** Use **documented community tables** (UESP's Arena class/race/monster
lists, the Codex Scientia) transcribed into `src/game/tables/` as data files, each
carrying a `source` field naming where the numbers came from. If the player's
folder *does* contain a decompressed `A.EXE`, the extractor in
`tools/extract-rules.mjs` will read the documented offsets and prefer them, and
`docs/PROGRESS.md` records which path was used at run time.

Arena attributes are **STR INT WIL AGI SPD END PER LUC** on a 0–100 display scale
(internally 0–255). Mapping to the engine's containers:

| Arena concept | Engine container | Notes |
|---|---|---|
| Attribute (0–100) | our own `attributes` object | DFU skills are *not* used; Arena has no skill system |
| Health / Stamina / Spell points | our own `vitals` | Stamina is Arena's own bar |
| Speed attribute | `engine/player/motor.js` speed input | motor already takes a running/speed value |
| Encumbrance | our own | arena uses STR-derived carry limits |
| Class hit die / HP per level | our own level-up rule | from documented table |
| Weapon damage range | our own | ditto |

**Rejected:** importing DFU's `systems/chargen.js` (skills, careers, primary/major/
minor skill rolls) — Arena has none of that; and reverse-engineering `A.EXE` from a
copy we do not have (impossible here, and not something to fake).

## D6 — A separate Arena BSA reader

**Decision.** `src/arena/bsaArchive.js`, not the engine's `formats/bsaFile.js`.

**Rationale.** Verified by inspection: Daggerfall's BSA is `int16 count` +
`uint16 directoryType` with records starting at offset 4; Arena's `GLOBAL.BSA` is
`uint16 count` (**no type field**) with records starting at offset 2, and an
18-byte directory (`14-byte name + int32 size`) at the end. The engine's reader
would misparse byte 2..3 (the first payload's start) as a directory type. The
engine's reader is kept in-tree unused as documentation of the difference.

## D7 — Encrypted INF files are decrypted, not skipped

**Decision.** `infFile.js` XOR-decrypts INF bytes that do not start with `@`.
Arena stores INF **encrypted inside `GLOBAL.BSA`** (verified: `CAS.INF` from the
archive begins `aa 3a 1c 8f`, while the loose `IMPPAL1.INF` in the game folder is
plaintext). Loose INFs are read as-is; archive INFs are decrypted before parsing.

**Rationale.** Every city and dungeon INF lives in the archive, so without this
there is no Milestone 3 at all. The repeating 8-byte key + 256-period counter is
the documented community scheme; it is verified here by round-tripping a real
record into valid `@FLOORS` text (see `tests/unit/inf.test.mjs`).

## D8 — Test and tooling stack: portable Node + system Chrome

**DEVIATION (environment).** The machine has **no Node, no npm and no Python
`python3` on PATH**. The brief's "Node tool" and "Playwright" premises assume a
toolchain that is not installed. What *was* available: a working network, the
host's Electron binary (Node 20.18.3 under `ELECTRON_RUN_AS_NODE=1`), system
Chrome/Edge, and `py` (Python 3.14).

**Decision.** Install a **portable Node 22 into `.devtools/` (git-ignored)** and
use it for the tools and tests. Browser testing uses the **installed Chrome/Edge
in headless mode** driven by `tests/run-browser.mjs` (raw CDP over WebSocket, no
Playwright dependency, no browser download). `package.json` still declares the
normal `npm test` entry points so a machine that *does* have Node plus
`npm i playwright-core` can run the same suite.

**Rejected:** writing the offline tools in Python (the parsers must ship as JS in
the game anyway — two implementations would drift), and downloading a
Playwright-managed Chromium (hundreds of MB, and the system browser already
supports headless WebGL2 via SwiftShader).

## D9 — Static site, served, no bundler on the critical path

**Decision.** `index.html` loads `src/main.js` as an ES module; the one-command run
is a static server (`node tools/serve.mjs`, or `py -m http.server`). No Vite on the
player's path.

**Rationale.** The engine is plain ES modules with relative imports and works
unbundled (the engine itself has a `play/index.html` that does exactly this).
Adding Vite would mean the player needs Node to *play*, which contradicts
"Arena assets are loaded at runtime from a configurable local path" — the whole
thing must be openable from a static server. `npm run build` is offered only as an
optional optimisation pass for Milestone 6.

## D11 — `A.EXE` is PKLITE-packed, and is left packed (**DEVIATION, amended**)

**Brief said:** "Some game rules (class/monster/item tables) may live in A.EXE
rather than data files: extract them or use documented tables, and record which."

**Verified after D5:** the folder has no `A.EXE` but does have **`ACD.EXE`**
(174 429 B), which is the only plausible candidate for the game executable. It is
**PKLITE**-compressed (the string `PKLITE Copr. 1990-` sits at offset 30 in its MZ
stub) and contains **no readable game strings**, so it cannot be identified from
its contents. Earlier recon notes that called it "LZEXE-packed" were wrong —
`src/arena/lzexe.js` was written on that assumption and **proved it false** (all
three executables fail the LZEXE signature test), so it was deleted rather than
left in the tree as dead code.

**Decision.** Use documented community tables (D5), and reconstruct only the one
table the *geometry* cannot do without — the raised-platform heights and
thicknesses — in `src/game/tables/raisedPlatforms.js`, marked `RECONSTRUCTED` in
its own `SOURCE` constant and in FORMATS.md §13.

**Rejected: writing a PKLITE decompressor.** It is a bounded but real reverse-
engineering task (bit-tree duplication modes; OpenTESArena carries a ~1 100-line
`ExeUnpacker` for it plus an offsets file), it would still leave the offsets
version-dependent — OpenTESArena's are for a *decompressed* A.EXE v1.06 and
`ACD.EXE` is a different build — and its entire payoff is a handful of numbers of
which the data only ever exercises one index. That is a poor trade against
Milestones 4–6, and the brief explicitly permits documented tables.

**Consequence:** step and platform heights are approximate; everything structural
in a level is exact. Logged as S9 in PROGRESS.md.

## D12 — World scale: one cell = 2.5 units, one layer = 2.5 units

**Decision.** `mifLevel.js` reports geometry in **cell units** (1 = one grid cell)
and `mifMesh.js` multiplies by `CELL_SIZE = 2.5` world units. One layer is 2.5
units tall, so the playable corridor is 2.5 units of headroom.

**Rationale.** The reused engine is metric: `player/motor.js` has
`CAPSULE_HEIGHT = 1.8`, `CAPSULE_RADIUS = 0.35` and `EYE_HEIGHT = 1.7`. Arena's own
scale is `layer = *CEILING height / 128`, which for a real interior (135, 150, 200)
is **1.05–1.56** — a room too short for a 1.8-unit capsule, so the player would be
permanently stuck. Scaling a layer to 2.5 gives a 2.5-unit-wide cell and a
2.5-unit-tall room, which fits the capsule with room to look up, and keeps the
grid cubic so raised platforms, doors and edges all scale consistently.

**Rejected: squashing the layer to `ceiling/128` and shrinking the capsule.**
Faithful to the original's units, but it means retuning the engine's motor, eye
height, step and jump constants for a scale nothing else in the engine uses, and
it makes every movement constant Arena-specific. **Also rejected: scaling
horizontally too** (a cell as 1 unit and the room as 2.5) — that would make a
cell narrower than the player is tall and put the capsule within reach of two
walls at once in a 1-cell corridor.

**Consequence:** `*CEILING` height no longer affects geometry, only appearance
(and the raised-platform scale, which is applied in cell units). Logged as S10.

## D13 — Interiors are lit by one ambient term, not Arena's light tables

**Decision.** `scenes/interior.js` lights a level with
`renderer.setLighting(ambient, 0, [0,0,0])` and no sun, at `ambient ≈ 0.86`,
overridable for tuning with `?ambient=` and `?fog=`.

**Rationale.** Arena renders the world by *brightening `PAL.COL`* through
per-map light tables. `PAL.COL` is genuinely dim (mean component 81.5 of 255), so
using it raw plus a low ambient produced a frame with a peak luminance of 66 of
255 and 13 hard edges — legible only because it is a dungeon. Raising the ambient
is a one-line stand-in that keeps the engine's own lighting lane working
(measured: 0.26 → 13 edges, 0.5 → 63, 0.7 → 76, 0.86 → 103, 1.0 → 107).

**Rejected: porting Arena's light tables now.** They need `LIGHT*.DAT`-equivalent
handling and a second texture slot per surface, which is Milestone 6 polish; doing
it in Milestone 3 would delay the milestone the brief calls the minimum
acceptable deliverable.

## D14 — Level geometry is emitted per-texture, and the collider is the same soup

**Decision.** `game/mifMesh.js` buckets quads by INF texture reference and emits
one renderer sub-mesh per texture (that renderer takes one texture per sub-mesh).
Collision reuses the same quad corners, so the drawn mesh and the collider can
never disagree; faces of non-colliding decor are simply omitted from the soup.

**Rationale.** A 100×100 dungeon is ~20 800 quads over ~60 materials — 60 draw
calls and no texture atlas needed, which is well inside budget and needs no new
renderer work. Reusing the corners removes a whole class of "I can see through it
but I can't walk through it" bugs, which is exactly the sort of defect that is
invisible in a screenshot.

**Winding is derived, not assumed.** Every quad passes through a helper that
reads the intended face normal and reverses the corner order when the geometric
normal disagrees, so the winding cannot silently be backwards under the engine's
mirrored projection (`gl.frontFace(gl.CW)` + `mat4.mirrorProjectionX`).
`tests/unit/mif.test.mjs` asserts per triangle that the geometric normal agrees
with the vertex normal, on a real 20 800-quad level.

**Rejected: a texture atlas.** It would cut draw calls but needs careful 1-pixel
bleeding to avoid seam artifacts, and the budget does not require it.

## D10 — File structure

```
PERFECTARENA/
  index.html                 the game
  README.md                  one-command run + controls
  package.json               scripts: dev, test, test:browser, lint
  .gitignore                 .devtools/, node_modules/, dist/, .scratch/
  docs/                      ARCHITECTURE, DECISIONS, FORMATS, PROGRESS
  src/
    main.js                  router + boot
    engine/                  ← copied from daggerfall/src, pruned (see ARCHITECTURE §2)
      render/ player/ ui/ systems/ formats/ world/mat4.js ...
    arena/                   Arena data layer (bytes → structs/images)
      arenaData.js           names → decoded + cached; loose file then GLOBAL.BSA
      bsaArchive.js          GLOBAL.BSA index and record extraction
      browserSource.js       folder picker + the `?arena=` dev/test door
      decompress.js          Arena's four codecs (Type08/Type04/RLE/RLE-words)
      image.js palette.js set + img decoding
      infFile.js             .INF grammar, texture table, archive decryption
      mifFile.js             .MIF header, LEVL sections, tagged chunks
    game/                    the world model
      mifLevel.js            voxel bitfields → a walkable level
      mifMesh.js             level → MeshBundle + collider triangles
      tables/                rules tables, each with a `source`
    scenes/                  testmap.js interior.js … (city/wild/worldmap: M4–M5)
  tools/                     inspect, mif-dump, copy-engine, serve, lib/ probes
  tests/
    unit/                    Node tests over the real Arena files
    run-browser.mjs + cdp.mjs  suites: testmap, movement, interior
    shots/                   what the machine saw
```
