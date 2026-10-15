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
  tools/                     inspect, mif-dump, copy-engine, serve, lib/ probes    tests/
      unit/                    Node tests over the real Arena files
      run-browser.mjs + cdp.mjs  suites: testmap, movement, city, interior
      shots/                   what the machine saw
```

---

## D15 — Cities are assembled by Arena's own algorithm, not authored

**Decision.** A city is generated in the browser at load time: the settlement kind
picks a skeleton `.MIF`, `game/cityPlan.js` seeds `ArenaRandom` with the location's
city seed and stamps a `blocksPerSide × blocksPerSide` grid of 20×20 block `.MIF`s
into a copy of the skeleton's voxels, and the mesh is built from the result by the
*same* `decodeLevel`/`buildLevelMesh` pair the dungeons use. The level's textures
come from the location's INF (`TCN.INF`, …) because a skeleton has no `INFO` chunk.

**Rationale.** There is no other option that is faithful. Arena has no city map to
load: its cities are procedurally assembled at runtime from skeletons, blocks and a
seeded RNG, so "load a city" is not a thing the data supports. Doing it Arena's way
also gets the shape of every city for free, since the block distribution and the
guaranteed services (equipment shop, mages guild, noble house, temple, tavern) are
the original's.

The RNG is ported exactly — `value = value * 7143469 mod 2³²`, draw
`(value >> 16) & 0xFFFF` — rather than approximated with `Math.random`, because
otherwise a seed is meaningless and the same city could not be revisited. Draw
*order* matters as much as the generator, and both are documented in FORMATS.md §8b.

**Rejected: authoring cities by hand or generating them with a general procedural
city generator.** Both would produce a town that is not Arena's town and would make
the block `.MIF`s — 368 real files of real Arena art — decorative at best. Also
**rejected: implementing city generation but pointing it at `CITYDATA.64`'s city
seed without the RNG**, which is a city-shaped thing in the right place and the
wrong one.

**Consequence, and the simplification that remains:** the block grid's *start
position* and the *reserved-slot lists* live in `A.EXE` (D5/D11). The start is
reconstructed by centring the grid inside the skeleton's wall ring, and the
reserved list is measured from the skeleton (a slot already holding geometry is
kept; entity flats do not count, or `CITY1` would lose five blocks to ten street
decorations). Both are labelled `RECONSTRUCTED` in `tables/cityBlocks.js`'s
`SOURCE`, and the falsifiable consequence is tested: a stamped grid may never touch
the skeleton's wall ring or its water. Logged as S15 in PROGRESS.md.

## D15 — Side work is generated from Arena's world, in Arena's own words

**Decision.** Radiant quests are drawn from the data: the giver is a settlement in
`CITYDATA.64`, the target is a dungeon or settlement that exists, the distance and
deadline come from `world.travel()`, and the prose is Arena's own
(`artfact1.dat`/`artfact2.dat`) wherever the kind allows it.

**Rationale.** "Radiant quests" is the one Daggerfall feature with no Arena
counterpart, and the obvious way to satisfy it — a table of authored quests — would
be neither. The world data is already rich enough to generate from: 432 locations,
288 of them settlements, each with a real name, province, climate and seed. What was
missing was *words*, and those turned out to be in the game's folder the whole time
(FORMATS §10a): 372 artifact recruiting speeches, 811 talk templates, a gate
greeting for every city-state, and an arrival text for every quest dungeon.

**The two invariants, and why they matter more than the variety.**

1. A quest may only point at a place the game can open. Only **16 of Arena's 144
dungeon records ship as `.MIF` files** — the two quest dungeons of each of the eight
provinces — because the original generates the rest from their seed at run time.
The board therefore discovers the loose files (`discoverLooseMifs`) instead of
assuming, and refuses a dungeon kind when the install has none. A radiant quest can
never strand a player at a door that does not exist.
2. A quest is a pure function of `(world, library, kind, seed, giver, day)`. The
same town on the same day posts the same board; the browser suite can name an offer
and click it; and the save file is a seed rather than a transcript.

**Rejected: a fixed list of authored quests.** It would run out, and it would throw
away the fact that the same eight provinces and 288 settlements already exist.
**Rejected: authoring the offer text.** Arena has 372 of them, each naming the
player's race, the price and the country — writing my own would be strictly worse
text pretending to be the game's. **Rejected: sending jobs to the 128 dungeons whose
files are absent**, which is the tempting version of "all of Arena" and produces a
quest that cannot be finished.

**Consequences.** A quest's subject is drawn from the same prose it is sold with —
an artifact quest picks one of the 14 artifact names that provably **appear in the
banks**, then an offer that mentions it, so the title and the speech always agree
("Recover Auriel's Bow" sells Auriel's Bow). `MONSTERS` is read off the archive's
`.CFA` sprite sets (`GOBLIN*.CFA`, `GHOUL*.CFA`), which the unit test checks stem by
stem. `ITEMS` — a fetch quest's trinket — is **authored**, because Arena's
equipment names live in `A.EXE` (D11); it is labelled AUTHORED in the source and in
FORMATS. Logged as S20–S22 in PROGRESS.md.

## D22 — Work is given by people, and by the board, from one generator and one state machine

**Decision.** A settlement's people are job givers. Whoever the player speaks to (`T`) answers
with a job drawn from the world data, the talk panel shows its prose, its purse and its
deadline, and a button takes it. The offer is `personOffer` in `game/radiantQuests.js` — the
same `generateQuest` the world map's board calls — keyed by **the person's own cell and the
settlement's seed**, and the accept runs through **the same `applyRadiantEvent`** the board's
button does. The board stays where it is: the map is still where a player *looks* for work,
and the street is where it is *given*.

**Rationale.** The request this project exists to answer names "radiant quests given by NPCs"
as a feature, and the project had every part of it except the hand-off: a generator that
cannot name a place the game cannot open, Arena's own artifact speeches, a state machine that
refuses work done in the wrong place, and a town full of people who could only recite lines
from `template.dat`. Making the generator reachable from a conversation is the smallest change
that turns "a board" into "somebody asks you".

**Alternatives rejected.**

* **A separate quest system for people.** Two systems would drift — two idea of "one job at a
  time", two rewards, two deadlines — and the project has one calendar and one journal. Sharing
  the state machine means a street job and a board job are the *same* object, and a test can
  drive either through the same events.
* **Every conversation offering a job, always.** The panel says who is holding work instead:
  the rules are one job at a time and a job is taken once, and a person who re-offers a job the
  player already has in hand reads as a bug, not as generosity.
* **Rerolling the offer each time.** Determinism is the safety net everywhere else in `game/`
  (a save file is a seed, a test can name an offer) and it matters more here: a stranger whose
  work changes when the player walks away and comes back is not a person with a problem, it is a
  slot machine.

**What is reconstructed.** The *voice* is the person's only by adjacency: the offer's prose is
Arena's own where a bank of it exists (`artfact*.dat`, 372 offers) and this project's words
where it does not, and the panel says which. What a person *looks like* still comes from their
armour word, and they have no name (S30) — so an offer is "from the person in chain mail in
Daggerfall", which is as far as the data goes.

---

## D23 — The world's opinion of the player is the twin's own law, ported

**Decision.** A person's regard for the player is a number in a save, and the *law* that moves
it is copied from the twin Daggerfall project rather than invented here:
`daggerfall/src/systems/livingWorld/relations.js` — its thresholds (`FRIEND_AT` 40,
`ENEMY_AT` −40, `HOSTILE_AT` −70), its easing (`EASE_PER_DAY` 0.5, and never across zero), its
event table (`talk` +3 **once a day**, `job` +25, `gift` +8, `helped` +20, `saved` +35,
`struck` −45, `crime` −15, `slain` −75), and its cap-and-forget rule (`PEOPLE_MAX`, the
faintest and longest-unseen first, *as the regard stands* rather than as it was last written —
the bug its own audit found). The record is plain JSON (`game/regard.js`) beside the character
in `localStorage`, and the world map's board panel is the "who knows you" page the twin keeps
in `livingWorld/people.js`.

**Rationale.** Two projects share an engine here, and a rule that both games need is worth
having **one** of. Daggerfall's living world is the twin's most-developed system (sixteen
documented passes over it), its numbers are cited to the bible that set them, and a "friend"
that means the same thing in both games is worth more than a bespoke number that means nothing
anywhere. What is *not* copied is the identity: the twin keys a regard by a **census id**
minted from a town's seed, and this port has no census — Arena ships no name tables (S30) — so
a person here is `place#row,col` (`regard.personId`), the place they stand in and the cell they
were placed on, which is already what the town's people and their jobs are keyed by.

**Alternatives rejected.**

* **Port the twin's `LivingWorld` module wholesale** (census, day plans, town paths, trips,
the watch). It is 30-odd modules and its whole substrate — a persistent resident population
with households, trades and a road network — is Daggerfall's data, which Arena does not have.
What *is* portable is the part that is only arithmetic, and that is what was taken. The rest
is item 2 and 4 of TWINS.md's ledger.
* **A guild-reputation system instead** (the twin's `factionRep`/`guilds` shape). Reputation
with an institution is not the same object as one person's opinion of a face, and the brief's
request is about the *people* who give work: the man who asked is the man who should remember.
* **Making the ledger part of the character record.** It is a separate save key because a
street has no character in hand when it writes it, and because a new character should meet a
world that has never heard of them.

**Consequences, each of which the code owns rather than hides.** `strike()` falls on a
**townsperson** when nothing else is in front (`strikeFolk`); a victim who falls gives every
witness `slain`, so a murder in the street turns the town hostile; `stepHostileFolk` makes the
hostile ones close and swing, with damage from the armour word in their file's name
(`townsfolk.FIGHT_WORDS` — **this project's numbers, labelled as such**, scaled against
`monsters.js`). The hand-in closed a real hole: `applyRadiantEvent`'s `return` had no caller in
the game at all, so a finished job's purse was unreachable in normal play; a job given by a
person is now paid by that person, and one posted on the board is paid by the town that posted
it. Half of the twin's event table (`gift`, `helped`, `saved`) has nothing in this game to fire
it yet, and is logged as S38.

---

## D21 — A building is entered through the sign over its door

**Decision.** In a settlement the `0xA` edge that carries a **shop sign** is a doorway:
stand in it and press `E` and the game loads the interior `.MIF` the `.INF`'s own `*MENU`
slot names — `EQUIP<n>` for an equipment sign, `TAVERN<n>` for the tavern's, `MAGE<n>`,
`TEMPLE<n>`, `NOBLE<n>` and `BS<n>` for the houses. Inside, the player arrives at the
building's **own start point** (the `.MIF` header's), one of the install's people keeps
the place, and `E` on the cell they arrived at puts them back on the street cell they went
in by. Nothing else in the game changed: a dungeon's fences, gates and bookstands are
edges too, and none of them opens.

**Rationale.** The signs had been decoded and drawn since Milestone 4 and nothing read
them, so the largest thing a city was missing was itself — you could walk Daggerfall's
streets and not open a single door. Everything needed was already in the data set: the
`.INF` names what each sign means, the block `.MIF`s draw them, and `GLOBAL.BSA` ships
**eight interiors of each kind** with their own `.INF`s. There was no need to invent a shop.

**What the data decides, and what is reconstructed.**

* **The shop kind is the sign's**, read out of the `.INF`'s `*MENU` table
  (FORMATS §8c): slot 0 is the equipment sign, 1 the tavern, 2 the Mages Guild, 3 the
temple, 4–6 the houses, 9 a noble house — and a slot binds *both* its own index and the
next one, because the blocks draw `T_TEQ.IMG` at index 6 where the table names
`T_DEQ.IMG` at 5. **The sign wins over the block's own code**, deliberately: `EQ` blocks
carry 137 equipment signs *and* 16 tavern signs, so a door in an equipment block can lead
to a tavern, and the sign is what the player can see.
* **The houses' laundry sign is a shop too**, though no `*MENU` slot binds it: the art's
own name (`TLAUNDRY`, `TLAUNDR1/2`) says so, and it stands on `BS` blocks.
* **Which of the eight interiors is RECONSTRUCTED** (D11/D5 — the table is in `A.EXE`):
  the block's own number picks it, `1 + ((variation − 1 + rotation) % 8)` from `EQBD9A.MIF`,
  so two equipment shops in one city are usually different rooms. The archive holds eight
  of each, so 13 equipment blocks must squash onto them, and this is the draw that does it.
* **Arriving at the `.MIF`'s start point is not a reconstruction** — `EQUIP1.MIF`'s is the
  foot of the entry corridor — and neither is `startingLevelIndex`: a house arrives on its
  **third** level because that is the ground floor in these files.

**Consequences.** The round trip is two page loads, exactly as the game already changes
place (`M` for the world map), and the city the player comes back to is the *same* city
because a city is deterministic in its seed: `back` carries the whole page they left, with
`at` set to the doorway cell, and `?at=row,col` stands them there. A building has **no
monsters** (a shop with a keeper and four rats in it was the first run's behaviour, and it
read as a bug) and its keeper speaks their trade's own bank — `equip.dat`, `tavern.dat`,
`muguild.dat` — filtered to whole sentences that want no item and no price; a temple, a
noble house and a house have no bank of their own and say so (`SHOP_KINDS[kind].bank` is
`null`) rather than borrowing one.

**Rejected: entering a building in place.** Swapping the scene's `.MIF` under the same page
would need `cityRequest`, the quest's objective, the town's people and the lighting to be
re-derived mid-session, and the return trip has to rebuild the city anyway — a page load is
both simpler and honest about what has happened. **Rejected: keying the interior off the
block type.** The laundry sign stands in equipment blocks as well as house blocks, and a
door whose sign says *tavern* must not open an equipment store.

## D20 — A town is for talking to: unnamed people, and the game's own lines

**Decision.** Every settlement is populated with people drawn from the install's own
`.CFA` walk files (65 of them), standing on street cells, deterministic in the place's
seed — and `T` speaks to whoever is nearest. What they say is `template.dat`'s prose,
filtered to **whole sentences**; **they are not given names**, and a city no longer holds
any monsters.

**Rationale.** With the main quest finishable, the largest thing missing from Arena was
its towns: a city-state you could walk through but not talk to is a level, not a place.
The two halves of a conversation were already in the folder and unused — Arena's own
people art, and 811 lines of its own talk — so the work was to find what could be said
*truthfully* rather than to write dialogue.

**Three rules make the talk honest.**

1. **Whole sentences only.** `&` separates a record into parts, and most parts after the
   first continue the sentence before them: "…lookout for pickpockets.&" / "a great time
   to be in `%cn`, if you're a thief.&". Taking whole records produced greetings like
   "have been constructing some interior woodwork at the palace&", which is half a
   sentence and reads as a bug. Of the file's 2 462 parts, 1 823 are whole sentences.
2. **Only what can be filled.** `%cn` and `%cn2` are the only `%`-words this project can
   supply from data it has, and `%cn` is a **city-state's** name (FORMATS §10a), so a
   person can be asked about the city they are standing in and nothing else. 14 lines
   qualify; when a line's substituted form is still broken it is refused, not shown.
3. **No invented names.** A person is "a person in chain mail", read off their file's own
   armour word. Arena's name generator needs `NAMES.DAT`'s tables, which this install
   does not ship (480 bytes of `EMPTY`-padded save slots, FORMATS §10), so a name could
   only be a word this project made up — the one thing a talk system should not do.

**Rejected: monsters in a town.** A city was populated with a couple of wandering
creatures "for danger". With people about, the first thing that happened in Daggerfall
was a spider biting a shopkeeper — Arena's cities are patrolled and fights there are a
crime, so a settlement now has townsfolk and no monsters, and `dangerOf({city: true})`
says so. **Rejected: a dialog tree.** The topic list lives in `A.EXE` (D11); two
questions, answered with the game's own lines, is what the data supports without
inventing a conversation the original never had.

**Consequences.** `townsfolk` — its own browser suite — asserts the roster, the street
placement, the corpus counts, that `T` opens a panel whose line is a *whole* sentence of
Arena's prose with no `%` in it, that the click on "Ask about Daggerfall" answers with
Daggerfall, and that a dungeon still has monsters and no people. The suite found two real
bugs: a `let townsfolk` declared below the first `loadLevel`, whose temporal dead zone
blanked the whole page, and people who were *uploaded* but never *drawn* — `liveBatches`
still batched monsters only, so the check read "14 files uploaded" while the street was
empty. Both are now checks of their own (`state().figures` is the frame's own count).

## D19 — The finale is played as three beats, from the walkthrough's own facts

**Decision.** The Imperial Palace's last level holds the finale, in the order UESP's
walkthrough describes it: the **mithril key**, which opens the **Jewel of Fire**'s
magically locked cell, and then the Emperor's freedom. The Jewel and the key lie in two
different chambers, derived from the level; the ending is Arena's closing *text*, over
a dark panel, rather than its `.FLC` cutscene.

**Rationale.** The main quest is the brief, and the last three beats are the ones a
player remembers. UESP gives the facts that make them a sequence: the Jewel sits in a
locked cell on the fourth and final level, opened by a mithril key found elsewhere on
the same island (or by the Skeleton's Key). That is a *puzzle*, and a state machine
that could not represent "the key, but not yet the Jewel" could not say what the player
still had to do — hence two flags, where Arena's save file carries one `HasKeyItem`.

The rooms' own coordinates do not survive into the data: UESP puts the key at `26,25`
and the Jewel at `20,24`, and the bottom level of the `IMPPAL.MIF` this project ships
and decodes has **no chasm cell at all**, so the lava lake the walkthrough describes is
not in that map and those coordinates would name a wall. Rather than pretend to a room
it cannot find, the level is searched the way every other objective is (S22): the
deepest reachable cell is the Jewel's chamber, and the key lies in the deepest cell at
least twelve cells away from it. Logged as S24.

**Rejected: the cutscene.** `END01.FLC` is in the folder and its frames are exactly
what a player who finished Arena in 1994 saw — but the `.FLC` codec is not decoded
(FORMATS), and playing a guessed decode of the ending would be worse than the words of
it, credited to UESP. **Rejected: ending the game on a notice line.** The one moment
that deserves a page of its own got one, with the player's own record under it.

**Consequences.** `mainquest` — a browser suite, every step through a real `E` key and
the palace's real `]` key — plays the whole quest from the escape to the Emperor, and
asserts the two finale chambers are different, the four levels, the descent hint, the
ending on screen, and that a finished quest is still finished after a page load.

## D16 — `localStorage` behind one module, and the cell grid read the mesh's way

**Decision.** Everything that survives a page load goes through `game/save.js`:
last location, the main quest, the side work. And the voxel grid is indexed the way
`mifMesh` builds it — `cells[x * width + z]`, `x` over `depth` — everywhere.

**Rationale.** Fast travel in this game *is* a page change: the world map is one
page, a city another, a dungeon a third. That is honest about what fast travel is,
but it means progress must live outside the page, and three scenes each keeping
their own copy of the keys is three chances to disagree. The states are deliberately
plain JSON — no functions, no class instances — so a save is `JSON.stringify` and a
load is `JSON.parse`, and the round-trip is a real test.

**The grid convention is a bug that was found, not a preference.** The flood that
finds a dungeon's deepest chamber first used `cells[z * width + x]`, which is
indistinguishable from the truth on a square, centred level — `START.MIF`, and every
dungeon's first floor — and wrong on off-centre ones, where the "spawn cell" came
out inside a wall. The mesh builder's own `x0 = row * S` / `z0 = col * S` settles
it, and the same reading is used for the quest objective, the deepest-chamber search
and the teleport seam.

**Rejected: a URL-carried save** (`?save=…` on every link) — it would work and would
put a save in every link a player might share. **Rejected: `sessionStorage`**, which
loses the game on a tab close, and a dungeon crawl is longer than that.

**Consequences.** A browser that refuses storage is fine: every write may fail and
the game starts fresh. `clearSave()` exists for the tests and for a new game.

**What this does not yet give you:** a *specific* location's city. Climate comes
from the world map terrain image plus province rectangles, and the city seed comes
from `CITYDATA.64`'s per-location records — so `?city=town&seed=99` is a real Arena
town, but not yet "Daggerfall, on the 3rd of Morning Star". That is Milestone 5's
world-map work, and the pieces it needs (the terrain image's classes, the province
rectangles, the per-location seeds) are listed in PROGRESS.md's risks.

## D17 — Who draws the player, and who is drawn as a person

**Decision.** The player and every creature are drawn from `GLOBAL.BSA`'s `.CFA`
sprite sets, as camera-facing billboards, and the **palette for them is
`DAYTIME.COL` — not `PAL.COL`**.

**Rationale.** `PAL.COL` is the palette the walls are decoded with, and reaching for
it was the obvious thing. It is wrong: under it every creature came out as a patchwork
of unrelated hues — a skeleton in green and purple. `tools/cfa-dump.mjs` renders the
same decoded frame under each palette Arena ships (`PAL.COL`, `DAYTIME.COL`,
`DREARY.COL`, `CHARSHT.COL`) and one of them is obviously right for a *creature*: the
skeleton is bone-white, the goblin is a green swamp-thing, the rat is brown. Four
palettes, 340 `.CFA` files, and the answer came from looking at one of them under all
four rather than from a document.

The `.CFA` container itself was a small reverse-engineering job of its own
(FORMATS §11): a ten-word header whose **second field is the height and third the
width** — `field[1] × field[2]` is the same pixel count either way, so the giveaway is
a human figure, `01PLTWLK.CFA`, reading 102 × 27 in file order: 27 wide, 102 tall.
Every creature's frames then decode to exactly `height × width` pixels, and the RLE is
Arena's own Type-08 scheme, reused from `decompress.js`.

**Consequences.** The third-person view is the same machinery with the player's own
sprite, chosen by class (`01CHNWLK.CFA` for a warrior, `01LTRWLK.CFA` for an acrobat),
so switching to it proves the class table, the archive and the billboard path at once.
A creature whose art is missing from the install is left out of the fight rather than
drawn as a black box. `?sprites=dreary` selects the dim twin for a night scene.

## D18 — Combat is one formula, with the genre's shape and the project's numbers

**Decision.** A blow is `resolveAttack({attacker, defender, weapon, material, random})`:
`A.EXE`'s to-hit table is not available (D11), so the roll is the one the community
documentation describes for Arena's era — a level-weighted chance against the
class's own skill — and the damage comes from the weapon and material tables in
`game/combat.js`, each labelled with its `source`.

**Rationale.** The alternative is a combat system with no damning failures: either
invent everything silently, or build nothing. What a fight *feels* like is mostly
whether the numbers are consistent — the same character with the same weapon should
hit harder than an unarmed one, a Lich should be a wall, and a rat should fall to one
blow. The monster table is not authored at all: it is read off the archive's sprite
sets, with hit points inside UESP's range for each kind (checked per monster, in unit
tests and again in the browser), and experience from the same source. Where a number
*is* the project's own, `HIT_FORMULA_NOTE` says so on the HUD: the panel tells the
player which figures are Arena's and which are a reconstruction.

**Rejected: a real-time action model with no rolls** — Arena's fights are a
level-vs-level roll and pretending otherwise would make the character sheet (D5)
pointless, since a level-1 character would fight as well as a level-20 one.
**Rejected: scripting the monsters' positions per level** — they are drawn from the
level's own seed, so a dungeon is the same fight when you come back.

**Consequences.** `game/encounters.js` places monsters in cells that are walkable and
away from the arrival point; they sleep until the player is within 34 units and then
close to reach. A player at zero health wakes at the way in, which is what the game's
own save system implies and is logged as a simplification (S25) rather than dressed up
as a death screen.

## D24 — The town's people walk to the places their own day names

**Decision.** A townsperson's movement is **the goal their day plan names**, walked over the
level's own streets. `game/livingWorld.js`'s `streetGoal` answers *where* — the door of their
trade (`TRADE_DOOR`), the place the hour sends them (`PLACE_DOOR`: the tavern, the temple, the
Mages Guild, the market), their own home cell, or a wanderer's beat — and
`game/townPaths.js` answers *how*, with the twin's own A* over a walkable grid of the level the
collider was built from, kept in a **path book** that answers by the two ends of a walk and
searches inside a per-frame budget (`PATH_CELLS_PER_FRAME = 6000`, `PATH_ASKS_PER_FRAME = 64`).
The walk is kept on the person (`person.route`) and walked to its end; only then is the goal
asked for again.

**Rationale.** The first fix for "npcs dont move around" gave every person a random neighbour
cell, and it produced the other half of the report: a street of people pacing on the spot, none
of them going anywhere a player could follow or care about. A destination is what makes a town
read as a place rather than a crowd — the smith crosses the square to his own shop at seven, the
priest walks to the temple, the drunk goes home at closing. The *shape* of this is the twin's
(`livingWorld/townPaths.js`, `livingWorld/dayPlan.js`); Arena's cities ship no navigation grid
of their own, so the grid is derived from the level the game already has — every cell the player
can stand on, plus the doorways, which is exactly the paving a resident could use.

**Rejected: a random walk with a longer leash.** A person drifting further is still a person
going nowhere; the destination is the feature.
**Rejected: a per-frame A* per person.** A town's morning is a hundred people changing their
minds at once; the book's budget is what keeps that from being a hitch (measured: the busiest
frame of a real city's morning spent **46** of its 6000 cells).
**Rejected: a wanderer drawing from every door in the settlement.** A city's wanderer then set
off for the far side of it — a walk of seventy cells, eighty seconds of a player's time, and
near streets left empty because everybody was somewhere else walking.
**Rejected: drawing from the twelve doors *nearest* the wanderer's home.** Still not a stroll:
a real city's doors are sparse (54 over 128×128 cells in Daggerfall), so "the twelve nearest"
can be thirty cells away, and the running game showed exactly that — wanderers mid-route from
`(2,14)` to `(9,51)`. A **beat is a place, not a shop**: with the level's own grid in hand
(the scene hands `streetGoal` the very grid the walk is planned over, `opts.nav`) a wanderer
draws a **standable cell within `WANDER_STEPS` = 6 of their home** — a few paces across their
own end of the street — falling back to the door draw and then to their own cell when the grid
says there is nowhere to stand. It is never the cell they are standing on: the draw is
deterministic, so a beat that is their own paving stone would be a person who never walks again
for the rest of the day. (Before this, `living` measured wanderers at 2 cells of travel —
`(47,124) → (45,125)` — against 21 and 37 cells for the two door-based rules.)

**Consequences.** `streetGoal` reads the person's **home**, never where they are standing, so a
goal does not move as they walk towards it; an arrival updates `place` and the person idles for
their own `TOWN_WAIT_MIN…MAX`. A keeper (`person.shop`) never walks — a shopkeeper who wandered
off would leave the counter empty — and someone being spoken to stands and faces the player,
abandoning the step they were on rather than snapping back to a cell centre. A person the regard
ledger has turned **hostile** has dropped their day (`stepHostileFolk` marks them and this pass
leaves them alone): without that, the street's own man kept his route and outran his own advance,
because the town's walk is 3.3 m a second and a charge is slower.

## D25 — A building's company: the install's roster first, a minimum for the rooms it leaves empty

**Decision.** Who is inside a building is the `.INF`'s own list where the data names anyone, and
a **minimum per kind** (`BUILDING_FOLK`: a house 3, a noble house 3, a temple 4, a guild hall 3)
where it names nobody or one. The top-up is drawn from the building's own seed, so the same
family is at home in the same house on every visit, and it skips a cell somebody already stands
on. Equipment stores and taverns are deliberately absent from the table: their own `INF` already
names their keeper *and* their patrons, and adding a crowd the install did not name would be this
port inventing a shopkeeper's customers.

**Rationale.** `BS*.MIF` names **nobody** — a house is a home, not a business — so the room the
laundry sign over a door opens used to be an empty one with a single man in it who had nothing to
do with the place. A home has a family in it, and a temple's `INF` names its priest and stops
there: one man praying in an empty hall. Where the data speaks, it is followed; where it is
silent, the room is filled, and the fill is deterministic.

**Rejected: topping every building up to a crowd.** The install's own rosters are the better
authority — a smithy with one smith at his counter is what the data says a smithy is — and
inventing customers for it would be dressing up a guess as content.
**Rejected: placing the top-up people in the room's free cells by index.** Two billboards in one
cell is one person with two heads, so the cells already occupied are skipped.

**Consequences.** A house's own people are townspeople and walk about the room (its keeper being
the first of them, who stands); `state().shops` now reports the building's own **kind** and
whether its doors are **open** at this hour, and the keeper is *asked* for by the flag on the
person rather than read off `townsfolk[0]` — which was only ever the keeper by luck once a room's
company stopped being exactly one person.
