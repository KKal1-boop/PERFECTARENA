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
    game/                    rules, world model, scenes
      tables/                documented class/monster/item tables
    scenes/                  city.js wild.js dungeon.js worldmap.js interiors.js
  tools/                     inspect.mjs, mif-dump.mjs, extract-rules.mjs, serve.mjs
  tests/
    unit/                    Node tests over the real Arena files
    browser/                 harness.html + run-browser.mjs (headless Chrome)
```
