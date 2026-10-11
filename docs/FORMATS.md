# PERFECTARENA — Arena data formats

Everything here is either **VERIFIED** (a `node tools/…` run against the real files
in `c:/arenaproject/arena/ARENA` produced it) or marked **UNVERIFIED / TENTATIVE**.
Where a format was first learned from community documentation, the source is
credited at the bottom.

Conventions: all integers little-endian unless stated. Arena filenames are
uppercase 8.3 and are matched case-insensitively.

---

## 1. The Arena folder

Loose files in `ARENA/` plus one archive. 153 files total, of which the important
ones by count: 24 `.DAT`, 21 `.MIF`, 19 `.ADV`, 17 `.FLC`, 6 `.TXT`, 5 `.INF`,
5 `.65`, 5 `.64`, 4 `.COL`, 4 `.BNK`, 3 `.RCI`, 3 `.MNU`, 3 `.IMG`, 3 `.CEL`,
1 `.BSA`.

**VERIFIED: `A.EXE` is not present.** (See DECISIONS.md D5.) `ACD.EXE`,
`INSTALL.EXE` and `ULTRAMID.EXE` only.

Two families of loose files:

* **Assets/definitions:** `.MIF`, `.INF`, `.MNU`, `.IMG`, `.CEL`, `.COL`, `.FLC`,
  `.DAT` (fonts, names, text), `.ADV` (sound drivers, not data).
* **Session/save state:** `.64` and `.65` numbered files (`CITYDATA`, `SPELLS`,
  `SPELLSG`, `STATES`, `LOG`). Per community findings these are the current
  session's working copies; the real save slots use other extensions.
  **UNVERIFIED:** the precise difference between `.64` and `.65`.

## 2. `GLOBAL.BSA` — the resource archive (**VERIFIED**)

```
offset 0 : uint16  recordCount            (= 2441)
offset 2 : payloads, concatenated in directory order, no padding, no per-record
           compression
end      : directory, recordCount × 18 bytes:
             +0  char[14]  name, NUL-terminated/padded (uppercase 8.3)
             +14 int32     size in bytes
```

Record *i* begins at `2 + sum(size[j], j < i)`. Verified by summing all 2 441
sizes: Σ = 16 758 196 and the directory starts at 16 758 198 = Σ + 2. ✔

**This is NOT Daggerfall's BSA.** Daggerfall's header is `int16 count` followed by
`uint16 directoryType` with records at offset 4; Arena has no type field. Feeding
`GLOBAL.BSA` to the engine's reader would treat bytes 2–3 as a directory type.

Contents by extension (**VERIFIED**, counted from the directory):

| Ext | n | Meaning |
|---|---:|---|
| `IMG` | 946 | Palettized images (flats, UI art, faces, map pieces) |
| `MIF` | 533 | Map/level data — **all** city, dungeon and wilderness maps |
| `CFA` | 340 | Character frame animations (sprite sets, e.g. `01AXE.CFA`, `ZOMBIE6.CFA`) |
| `SET` | 180 | Wall texture sheets (128×128 8-bit — see §6) |
| `INF` | 93 | Map definitions (text; **encrypted in the archive**, see §4) |
| `DFA` | 79 | Decor/flat animations (`CHAOS1.DFA`) |
| `VOC` | 76 | Sound effects (`BASH.VOC`) |
| `RMD` | 70 | Wilderness/map block records (`WILD001.RMD` … see §7) |
| `CIF` | 58 | Compressed images (`ARROWS.CIF`, equipment lists) |
| `XFM` / `XMI` | 33 / 33 | Music (`ARENA.XFM` and its `.XMI` companion) |

Loose map files in the game folder (not in the archive): the numeric-named
`39300577.MIF … 42488253.MIF` (17 files; **UNVERIFIED** naming scheme — likely
province/location hashes), `BS5.MIF`, `IMPPAL.MIF` + `IMPPAL1..4.INF` (Imperial
Palace), `START.MIF`, `RANDOM1.MIF` (random-dungeon template), `VILPAL3.MIF`,
`CRYSTAL3.INF`, `2651.GLD`.

## 3. `.MIF` — map data (**VERIFIED**)

```
MHDR header, 61-byte payload:
  0x00 char[4]  "MHDR"
  0x04 uint16   payload size = 61
  0x06 uint8    unknown (1)
  0x07 uint8    entryCount
  0x08 uint16×4 startX[4]      (divided by 128 → voxel X)
  0x10 uint16×4 startY[4]      (divided by 128 → voxel Y)
  0x18 uint8    startingLevel
  0x19 uint8    levelCount
  0x1A uint8    unknown2
  0x1B uint16   mapWidth   (cells)
  0x1D uint16   mapHeight  (cells)
  0x1F uint8[34] unknown3   (2 bytes of the 61-byte payload are unaccounted)
then levelCount × LEVL sections:
  0x00 char[4] "LEVL"
  0x04 uint16  section size (includes the size field itself)
  0x06 tagged chunks …
```

Tagged chunks (4-byte tag + uint16 size + payload), except the three compressed
layers:

| Tag | Payload | Notes |
|---|---|---|
| `NAME` | string + uint8 size prefix pattern | level name; verified text at offset 73 of `START.MIF` (`"s"`-style 1-byte-prefixed length) |
| `INFO` | string | level long name |
| `NUMF` | uint8 | floor-texture count |
| `TRIG` | 4 bytes/record: `int8 x, int8 y, int8 textIndex, int8 soundIndex` | triggers |
| `LOCK` | 3 bytes/record: `uint8 x, uint8 y, uint8 lockLevel` | locked cells |
| `TARG` | 2 bytes/record: `uint8 x, uint8 y` | targets |
| `FLAT` | opaque | flat placements (**UNVERIFIED** internal layout) |
| `INNS`/`LOOT`/`STOR` | opaque | interior NPC/loot/storage (**UNVERIFIED**) |
| `FLOR` | **compressed** voxel layer | floor IDs |
| `MAP1` | **compressed** voxel layer | primary voxel IDs |
| `MAP2` | **compressed** voxel layer | secondary voxel IDs / heights |

### Compressed voxel layers `FLOR` / `MAP1` / `MAP2` (**VERIFIED**)

```
+0 char[4]  tag
+4 uint16   compressed size   (INCLUDES the next field)
+6 uint16   uncompressed size (= width × height × 2)
+8 …        Type08-compressed bytes (compressed size − 2 of them)
```

Verified on `START.MIF` (50×50): `FLOR` compressed 525, uncompressed 5 000 ✔;
`MAP1` compressed 1 496, uncompressed 5 000 ✔. Uncompressed output is a
row-major `uint16[width × height]`, X varying fastest.

### Voxel ID bitfields (**VERIFIED**)

The ID is not a flat texture index, and `FLOR`, `MAP1` and `MAP2` each decode
differently. All three were confirmed by decoding real levels and printing them as
ASCII (`tools/lib/mapascii.mjs`) and as raw-ID histograms
(`tools/lib/voxhist.mjs`) — the results are recognisably dungeons, with walls,
rooms, corridors, doors, staircases and chasms.

**`FLOR` — the floor layer**

```
textureIndex = (id & 0xFF00) >> 8        index into the INF's texture table
flatIndex    = (id & 0x00FF) - 1         a flat lying on the floor, or -1
texture 0xC / 0xD / 0xE = dry / wet / lava chasm (the INF supplies the texture)
id == 0                                 still a floor: texture index 0
```

**`MAP1` — the one geometry layer.** The most-significant nibble selects the kind:

| Nibble | Kind | Decoding |
|---|---|---|
| `0x8` | entity | `flatIndex = id & 0xFF`; no geometry (flats/NPCs/door triggers) |
| `0x9` | transparent wall | `texture = (id & 0xFF) - 1`; collides when bit `0x100` is **clear** |
| `0xA` | edge (fence, gate, sign) | `texture = (id & 0x3F) - 1`, face `= (id & 0xC0) >> 4`, height index `= (id & 0xE00) >> 9`; collides when bit `0x100` is **set** |
| `0xB` | door | `texture = (id & 0x3F) - 1`, kind `= (id & 0xC0) >> 4` → swinging/sliding/raising/splitting |
| `0xC` | undocumented | treated as air |
| `0xD` | diagonal wall | `texture = (id & 0xFF) - 1`; right diagonal when bit `0x100` is clear |
| other, bit `0x8000` clear | wall **or** raised platform | see below |

For the last row: `most = (id & 0x7F00) >> 8` and `least = id & 0x7F`.

* `most == least` → **solid wall**, texture index `most - 1`.
* otherwise → **raised platform**. Its most-significant byte is `0x0tttthhh`, so
  height index `= most & 7` and thickness index `= (most & 0x78) >> 3` index the
  `A.EXE` tables (§13). The low byte selects texture slots: `*BOXSIDE` slot
  `= id & 0xF` and `*BOXCAP` slot `= (id & 0xF0) >> 4`.

Worked examples from `39300577.MIF` level 0: `0x3434` wall texture 51;
`0x703E` raised platform, side slot 14, cap slot 3, height 0, thickness 14;
`0xB010` a swinging door; `0x8000`/`0x8019` entities with flat indices 0 and 25.

**`MAP2` — the ceiling layer**

```
id == 0        no ceiling here: OPEN SKY above
otherwise      ceilingTexture = (id & 0x7F) - 1
height class   0x80 -> 2, 0x8000 -> 3, either -> 4, else 1 (0x80 tested first)
```

The height class only widens the solid mass above the ceiling; the visible
surface is always the *bottom* of the `MAP2` layer.

### Level geometry (**VERIFIED**)

* Level height in layers: `2 + max(MAP2 height class)` when `MAP2` is present,
  otherwise 3 with a ceiling and 2 without.
* Layer 0 is the floor slab, layer 1 is the playable layer, layers 2+ are the
  ceiling. **The playable volume is one layer tall**, which is why Arena is a
  first-person grid game rather than a 3D one.
* One layer is `*CEILING height / 128` world units tall in the original, and
  **128 units is one cell** (`MIFUtils::ARENA_UNITS`) — an interpretation
  independently confirmed by the MIF header's start coordinates, which divide by
  128 to give cell positions.
* `world X = MIF row index`, `world Z = MIF column index`. The transposition is
  OpenTESArena's (`VoxelUtils::originalVoxelToWorldVoxel`) and is what makes the
  `0xA` face codes order the same way as the original's compass.
* PERFECTARENA re-scales one layer to 2.5 world units so the reused engine's
  1.8 m player capsule fits (DECISIONS.md D12); the ceiling height therefore
  affects appearance only.

### Quirks of the shipped data (**VERIFIED**)

* **Oversized voxel layers.** A layer's `uncompressedSize` may exceed
  `width × height × 2`. `VILPAL3.MIF`'s second level (named `test2`, INF
  `sd1.inf`) declares a 25×25 map and ships a 100×100 grid (20 000 bytes). The
  original reads the first `width × height` voxels; PERFECTARENA does the same and
  records a warning on the level.
* **Level order is physical.** `BS5.MIF` lists `level3`, `level2`, `level1` in
  that order, and its `startingLevelIndex` is 2 — an index into the physical
  array, not a level *number*. Never sort by the `NAME` chunk.
* **The `.INF` name comes from `INFO`,** not from the `.MIF` filename. `CAS.MIF`
  and `CAS.INF` happen to pair, but `39300577.MIF` uses `HALLS1.INF` and
  `IMPPAL.MIF`'s levels use `IMPPAL1..4.INF`.

## 4. `.INF` — map definitions (**VERIFIED**)

Plain ASCII text with CRLF line endings for loose files; **encrypted inside
`GLOBAL.BSA`** (verified: the archive's `CAS.INF` begins `aa 3a 1c 8f 52 9c 6d ad`,
the loose `IMPPAL1.INF` begins `@FLOORS`). Decryption is the documented repeating
8-byte key XOR with a 256-byte period; verified here by round-tripping a real
record into valid `@FLOORS` text.

Line grammar (verified by reading `IMPPAL1.INF` and `CRYSTAL3.INF`):

```
@FLOORS | @WALLS | @FLATS | @SOUND | @TEXT        section headers
*directive [args]                                 settings
<filename>[  #n]                                  ordered texture-list entry
```

* A bare filename appends **one** entry to the level's ordered texture list.
* `name.set   #n` appends **n consecutive** entries (the `.SET` sheet's rows).
* Directives bind IDs into that list:
  * `*BOXCAP n` — floor/ceiling texture ID *n*
  * `*BOXSIDE n` — wall texture ID *n*
  * `*DOOR n` — door texture (and door behaviour by *n*)
  * `*DRYCHASM` / `*WETCHASM` / `*LAVACHASM` — chasm walls
  * `*LEVELUP` / `*LEVELDOWN` / `*TRANS` — stair/transition textures
  * `*CEILING h [scale] [outdoor]` — ceiling height (and the outdoor flag)
  * `*MENU`, `*ITEM`, `*BOXCAP`/`*BOXSIDE` on flats — see below
* Order matters: `*BOXCAP 0` binds the *next* filename to ID 0.

Real example (`IMPPAL1.INF`, verbatim): `@FLOORS` → `*CEILING 200` →
`*BOXCAP 0` → `flcas_a1.img` → `*BOXCAP 1` → `flcas_b1.img` →
`*BOXCAP 2` → `flcasc.set      #2` …

Consequence for the pipeline: **an INF must be parsed before its MIF can be
drawn**, because the MIF's voxel IDs are indices into the INF's ordered list.

## 5. Arena's four compression schemes (**VERIFIED**)

`src/arena/decompress.js` implements all four. Round-trip evidence: every voxel
layer in every loose `.MIF` in the game folder decodes to exactly its stated
`uncompressedSize`, checked by `tests/unit/mif.test.mjs`.

| Codec | Used by | Shape |
|---|---|---|
| `decodeType08` | MIF voxel layers, type-8 IMG/CIF | adaptive Huffman with a 4096-byte sliding history: a codeword below 256 is a literal, at or above 256 a back-reference whose length comes from the codeword and whose offset is read through two 256-entry tables. The tree re-weights after every symbol. |
| `decodeType04` | type-4 IMG/CIF | 1-bit mask per 8 symbols, alternating literal bytes and LZ back-references |
| `decodeRle` | remaining IMG/CIF payloads | byte RLE: bit 7 set introduces a run, else a literal count |
| `decodeRleWords` | `.RMD` wilderness blocks | signed 16-bit count: positive = literals follow, negative = repeat the next word |

Known-good vectors: `START.MIF` `FLOR` 525 → 5 000, `MAP1` 1 496 → 5 000;
`IMPPAL.MIF` four levels (255/629/753 → 5 000 each); `RANDOM1.MIF` 32 levels of
32×32; `BS5.MIF` three levels of 20×20 (31/40/45 → 800 each).

## 6. Palettes and images

### `.COL` (**VERIFIED**)

```
0x00 uint8[8]  header (first bytes 08 03 00 00 23 b1 00 00)
0x08 byte[768] 256 × RGB triples
total 776 bytes
```
Verified on `PAL.COL`, `CHARSHT.COL`, `DAYTIME.COL`, `DREARY.COL` (all 776 bytes).

### `.IMG` (**VERIFIED**)

Two shapes share the extension, and both are common:

```
raw wall       exactly 4096 bytes: no header at all, 64×64 8-bit pixels
headered       12-byte header, then pixel data
                  +0 uint16 xOffset      +2 uint16 yOffset
                  +4 uint16 width        +6 uint16 height
                  +8 uint16 flags       +10 uint16 payloadLength
```

The low byte of `flags` is the compression: `0` flat, `4` Type-04, `8` Type-08
(with a 2-byte decompressed length before the stream) — see §5. Bit `0x0100` of
`flags` means a **built-in palette** follows the payload: 768 bytes in the VGA
6-bit range 0..63, so each component must be scaled by `255/63`. A handful of
filenames are headerless with dimensions the original hardcodes by name
(`ARENARW`, `CITY`, `DITHER`, `DUNGEON`, `TOWN`, `VILLAGE`, …); they are listed in
`src/arena/image.js`.

**Verified:** the raw-wall and headered paths, all three compressions, and the
embedded palette. Decoded correctly, the level textures are clearly stone,
wood and doors — `FLOORA.SET#0` averages `rgb(57,59,67)` with 77 distinct colours,
`FLOORC.IMG` `rgb(53,23,26)`, `DOOR_1.IMG` `rgb(57,30,30)`; see
`tools/lib/textures.mjs`, which prints ASCII thumbnails.

### `.SET` (**VERIFIED**)

A plain sequence of **64×64 8-bit chunks** with no header: `size / 4096` textures.
`CASA.SET` is 16 384 bytes = four frames. The INF's `name.set  #n` binds `n`
consecutive texture-table entries, all the same filename, with `setIndex` 0…n−1 —
so the `#n` value must equal the sheet's frame count.

### `.CIF` / `.RCI` / `.DFA` (**TENTATIVE**)

* `.CIF` — header `uint16 xOffset, yOffset, width, height, flags` then compressed
  data (verified `ARROWS.CIF` = 1 083 bytes, header `7f 00 2f 00 0c 00 09 00`).
  Needed for UI art in Milestone 4, not for maps.
* `.DFA` — animated flat: header then frame data (verified `CHAOS1.DFA` 4 980 bytes).
* `.RCI` — animated wall textures (`LAVAANI.RCI`, `WATERANI.RCI`). Milestone 6.

All are 8-bit palettized with index 0 as the transparent cutout, matching the
engine's `ui/bitmapCanvas.js` convention.

### Palette selection (**VERIFIED**)

`PAL.COL` is the world palette: OpenTESArena names it `ArenaPaletteName::Default`
and uses it for the game world (`SceneManager::gameWorldPaletteID`), with
`CHARSHT.COL` for character-sheet art and `DAYTIME.COL`/`DREARY.COL` for weather
skies. `PAL.COL` is a *dim* palette (mean component 81.5 of 255); the original
brightens it per map with light tables, which PERFECTARENA does not reproduce, so
interiors are lit by a single raised ambient term instead (DECISIONS.md D13).

## 7. `.RMD` — wilderness blocks (**VERIFIED size, TENTATIVE layout**)

`WILD001.RMD` … `WILD070.RMD`, each **24 576 bytes** = 64 × 64 cells × 6 bytes.
This matches the community description of 66 unique wilderness blocks of 64×64
cells. The six bytes per cell are being decoded in Milestone 5 (likely a tile ID
plus elevation/feature bytes). Assembly: 64×64 blocks → a 4 096×4 096-cell
wilderness area, with the settlement occupying the middle 128×128 cells
(4 blocks, chosen by settlement seed).

## 8. `CITYDATA.64` — world locations (**VERIFIED structure**)

11 052 bytes = **9 provinces × 1 228 bytes**, verified by the province names
appearing at exactly `0`, `1228`, `2456`, … and `Imperial Province` at `9824`.

Per-province layout (offsets relative to the province start, verified by name
positions):

| Offset | Size | Contents |
|---:|---:|---|
| 0 | 25 | province name, NUL-padded (`High Rock`, `Hammerfell`, …, `Imperial Province`) |
| 25 | 8×25 | **8 city-states** (`North Point`, `Daggerfall`, `Camlorn`, …) |
| 225 | 24×25 | **8 towns + 16 villages** (`Old Gate` … `Dunalin Falls`) |
| 825 | 3 | unknown |
| 828 | 16×25 | **dungeons**: 2 named main-quest dungeons (`Crypt of Hearts`, `Mines of Khuras`) followed by 14 anonymous entries |

Example (High Rock): `High Rock` @0, cities @28…228, towns/villages @228…803,
`Crypt of Hearts` @828, `Mines of Khuras` @853. Total 828 + 400 = 1 228 ✔.

The 25-byte records beyond the name field hold coordinates and flags; the exact
field offsets are being established in Milestone 5 (the province rectangle and the
per-location map pixel live in there). `CITYDATA.65` is 11 052 bytes too but is a
binary working copy — **UNVERIFIED**.

## 8b. Cities and wilderness — the level that is not a file (**VERIFIED**)

A dungeon is a `.MIF` you can point at. **A city is not.** There is no `CITY.INF`
and no complete `CITY1.MIF` holding a city: the map is *assembled* at load time from
a skeleton plus a grid of block `.MIF`s. This is why `?interior=CITY1.MIF` renders
an empty walled field, and why every city needs the tables in
`src/game/tables/cityBlocks.js` before it has textures at all.

### The skeleton

`CITY1..5.MIF`, `CITYW1..3.MIF`, `TOWN1..5.MIF`, `TOWNW1..2.MIF`,
`VILLAGE1..5.MIF`, `VILLAGW1..2.MIF`. `W` variants are coastal. All are in
`GLOBAL.BSA`, all have **one level**, and:

* **no `NAME` and no `INFO` chunk.** `level.info` is `""`. The file cannot name its
  own `.INF` — see "The INF" below. Measured on `CITY1.MIF` and `CITY2.MIF`.
* a full `FLOR`/`MAP1`/`MAP2` triple of `width × height` voxels (127×127 for
  `CITY1.MIF`, 128×128 for `CITY2.MIF`), plus the usual `FLAT`/`INNS`/`LOOT`/`STOR`
  chunks that are still unparsed.
* a **perimeter wall ring** two cells thick (rows/cols 0–1 and `dim-2…dim-1`),
  broken by **gate passages** two cells wide. `CITY1.MIF` has its gates at row 1
  columns 18–19 and 58–59, and `MAP1` also carries an arch (`0x9`) pair in the
  row-0 wall above the second gate.
* **water as chasm floors**: `CITYW1.MIF`'s `FLOR` high byte is `0xD` (wet chasm)
  along its coastal edge and *inside* its block grid, so a block slot that the
  water covers must be left alone.
* `startPoints` are the gates. `CITY1.MIF` = `(7616,192)` → world `(1.5, 59.5)`, which
  is the north gate passage, and it is where the player starts.
* the interior of the wall ring is **bare ground**: `CITY1.MIF` holds nothing there
  but ten scattered entity flats (street furniture).

### The blocks

Every block is exactly **20×20 cells** and is named `<code>BD<variation><rotation>.MIF`:

| Code | Type | Variations | Code | Type | Variations |
|---|---|---:|---|---|---:|
| `EQ` | equipment shop | 13 | `TV` | tavern | 15 |
| `MG` | mages guild | 11 | `TS` | spacer (empty lot) | 11 |
| `NB` | noble house | 10 (data has 12) | `BS` | houses / generic building | 20 |
| `TP` | temple | 12 | | | |

Rotations are `A`–`D`. `tests/unit/city.test.mjs` asserts, record by record, that
**every name these tables can produce exists in `GLOBAL.BSA`**, which is the
strongest available check on a table that lives in `A.EXE` (D5/D11).

Three wrinkles in the shipped archive, all measured and all pinned by that test:

* **Zero-padded aliases.** 52 records carry an extra leading zero — `EQBD09A`
  beside `EQBD9A`, and `MGBD01..09` beside `MGBD1..9`. The generator emits `%d`
  (unpadded), so the padded ones are aliases, not a second naming scheme.
* **`NBBD11`/`NBBD12`** exist (8 records with rotations) although the variation
  count is 10, so two noble-house variants are never drawn. Six of the seven codes
  agree with the archive exactly, so the count is kept as the original's.
* **`BSBD1E.MIF`** (a stray rotation letter) and **`BSBD20.MIF`** (no rotation) exist
  and are not producible names.

### The plan

`blocksPerSide²` slots, row-major, drawn from one `ArenaRandom(citySeed)`:

1. reserved slots are marked first (the original reads their indices from `A.EXE`);
2. then six guaranteed placements, **in this order**: equipment, mages guild, noble
   house, temple, tavern, spacer;
3. then every remaining slot from `randomBlockType`: houses 45%, tavern 20%,
   equipment 15%, temple 10%, noble house 10% (thresholds `0x7333`, `0xA666`,
   `0xCCCC`, `0xE666` on a 16-bit draw);
4. then, in slot order, each non-reserved block's name is drawn as it is stamped:
   **rotation first, then variation**, with variation 0 promoted to 1.

Draw order is the format. A slot that is already taken still consumes a draw
(rejection sampling), and a block name consumes two more, so any deviation shifts
every later slot: a city with the right blocks in the wrong places, rather than an
error. Grid sizes: **city-state 6×6 (120×120 cells), town 5×5, village 4×4.**

Measured on `CITY1.MIF`, seed 20232: 36 of 36 slots stamped, 12 400 cells written,
22 847 quads, 6 560 wall cells, 58 menu edges, 463 entities, 4 176 roofed cells of
16 129 (so 12 124 are open to the sky).

### The INF — from the location, not the map

`<climate><location><weather>.INF`, where climate is `T`emperate / `D`esert /
`M`ountain, location is `C`ity or `W`ilderness, and weather is `N` (clear), `R`
(overcast), `W` (rain), `S` (snow). Wilderness has no rain template, so overcast
and rain both give `R`; a desert has no snow, so snow falls back to `N`.

All eleven city INFs (`DCN DCR DCW`, `MCN MCR MCS MCW`, `TCN TCR TCS TCW`) and all
eight wilderness ones (`DWN DWR`, `MWN MWR MWS`, `TWN TWR TWS`) are in the archive,
which is what fixes the letter set. `TCN.INF` holds 59 textures, 57 flats and 16
menus; its first textures are `T_NROAD`, `T_NSDWLK`, `T_NGRASS`, `T_NGRATE`,
`T_NBRIDG`, `T_DEQ` — roads, sidewalks, grass, grates, bridges, then shop doors.
The desert INF's equivalents are the same art without the `T_` prefix.

Climate comes from the **world map terrain image**, sampled at the location's
global pixel (`ArenaLocationUtils::getClimateType`) — a pixel is classified
Temperate / Mountain / Desert / Sea. Reproducing a *specific* location therefore
needs that image, its province rectangles and the terrain classes; this milestone
takes the climate as a parameter (`?climate=`).

### What a city's entrances look like (**VERIFIED, and not what you would guess**)

A city has **no `0xB` door voxels at all.** `TCN.INF` declares no `*DOOR`
directive, and a built city decodes to `door: 0`. What marks a building entrance is
an **`0xA` edge voxel** whose texture index selects the shop's sign —
`T_DEQ.IMG` for the equipment shop, for instance — which is what the game tests
when you look at a building and press the interaction key. A city's `MAP2` still
puts roofs over the buildings (4 176 cells on the seed above) while the streets
stay `MAP2 == 0`, which is how "outdoors" is decided.

### Reconstructed, not extracted

`A.EXE` holds the block grid's start position and the reserved-slot lists per
skeleton. Both are derived here instead (`blockStartPosition`, `detectReservedBlocks`)
and labelled `RECONSTRUCTED` in `SOURCE`: the grid is centred inside the wall ring,
and a slot is reserved when its skeleton cells already hold *geometry* (a wall,
platform, door, edge, arch, diagonal, or a chasm floor). Entity flats are
deliberately excluded — counting them reserved five of `CITY1`'s thirty-six blocks
for two street decorations each. `tests/unit/city.test.mjs` asserts the rule in
both directions, including that `CITY2.MIF` (74 structural voxels inside its grid)
does reserve slots and `CITYW1.MIF` reserves exactly the slots its water sits in.

## 9. Fonts (**TENTATIVE**)

`TEENYFNT.DAT` (1 695 B), `ARENAFNT.DAT` (1 895 B), `FONT4.DAT`, `FONT_A/B/C/D.DAT`,
`FONT_S.DAT`. Verified: the first byte is the face's maximum glyph width
(TEENYFNT = 8, ARENAFNT = 9, FONT4 = 7) and the following bytes are a per-glyph
width table with plausible small values (2–8). Glyph bitmap blocks follow.
**UNVERIFIED:** the glyph count/ASCII start, the height, and the bitmap packing.
Milestone 4 will either finish this or fall back to a built-in bitmap face
(logged in PROGRESS.md).

## 10a. The loose text files (**VERIFIED**) — the game's own prose

Arena does not keep its writing inside `A.EXE`. Six kinds of loose file beside it
hold every word the game says, and all of them are **pure 7-bit ASCII** — measured,
not assumed: `citytxt`, `dungeon.txt`, `template.dat`, `muguild.dat`,
`tavern.dat`, `equip.dat`, `selling.dat`, `artfact1.dat` and `artfact2.dat`
contain not one byte above 127 between them, so a high byte in one of them is
padding rather than a CP437 glyph (`arenaText.decodeText` drops it).

Parsed by `src/arena/arenaText.js`; `tests/unit/text.test.mjs` checks every count
and every mapping below against the real files.

### `citytxt` — the gate greeting of every city-state

```
#0600<CRLF>            #0600…#0663, 64 records
<CRLF>
North Point hail thee, <CRLF>
...body, hard-wrapped...<CRLF>
fortune within our walls...&   <- the body ends with '&'
```

**The index is the finding.**

```
id = 600 + provinceID * 8 + cityIndexWithinProvince
```

600 is **decimal**, not `0x600` — the markers are written `#0600`, and reading
them as hex shifts every greeting by 936 and lands each one on the wrong city.
Eight provinces × eight city-states = the 64 records that are there; the Imperial
Province has none, because its one city is the palace the game shows instead.

This is checked *by name*: each greeting's own opening words name the city it
belongs to — 600 → North Point, 601 → Daggerfall, 602 → Camlorn, 628 → Necrom,
663 → Archon, and **63 of the 64** name their city (Firsthold's opens with "When
High Lord Torinaan came to this…"). `tests/unit/text.test.mjs` pins the five named
above and asserts the one exception by name, so a shifted stride fails loudly
rather than quietly greeting the wrong town.

### `dungeon.txt` — what a quest dungeon says as you stand before it

`#`-separated blocks; the first line of each is the dungeon's own name and the rest
is its arrival prose. **Nine** blocks: the eight Staff dungeons, plus the palace.
The order is **not** the quest order (it runs Halls of Colossus, Crypt of Hearts,
Crystal Tower, Dagoth-Ur, Elden Grove, Fang Lair, Labyrinthian, Murkwood), which is
why the parse returns a map keyed by lower-cased name and nothing downstream may
rely on a position. Each of the eight names a Staff piece, e.g. Halls of
Colossus's says "Here lies the fourth piece of the Staff of Chaos" — and the fourth
piece is Halls of Colossus's in the quest chain, so the prose and `CITYDATA.64`
confirm each other.

### `artfact1.dat` / `artfact2.dat` — the artifact quests (**VERIFIED**)

NUL-separated `\0` records, 240 per bank, and each bank holds **two kinds**:

| kind | count | has `%`-words? | example |
|---|---:|---|---|
| offer | 186 | yes | "As soon as you mention the Lord's Mail, a man you didn't see when you entered seats himself by you at the bar…" |
| reply | 54 | no | "Forget it, pal. You're going to have to do a lot better than that." |

372 offers and 108 replies across the two banks. The offers are the recruiting
speeches a quest can use; the replies are what a haggle gets back. The split is by
content — an offer names what varies (`%an` the speaker, `%ra` the player's race,
`%oap` the price, `%cn` the country), a reply names nothing — so no record can be
in both sets, and the tests assert exactly that.

**Fourteen artifact names are provably in this text**, which is what makes
`radiantQuests.ARTIFACTS` a data-backed table rather than a list from memory:
Lord's Mail, Staff of Magnus, Ebony Blade, Chrysamere, Oghma Infinium, Ring of
Phynaster, Ring of Khajiit, Skeleton's Key, Warlock's Ring, Auriel's Bow, Auriel's
Shield, Ebony Mail, Spell Breaker, Volendrung. (Masque of Clavicus Vile, Sanguine
Rose, Skull of Corruption and Savior's Hide are **not** in these banks and are
consequently not in the table.)

### `template.dat` — the talk templates (**VERIFIED**)

`#NNNNa`-style markers, where the four digits are an id and the trailing letter
picks one of several interchangeable phrasings of the same moment:

```
#0000a<CRLF> You walk into the %t's audience chamber… %rf, %t of %cn …&<CRLF>
#0000b<CRLF> …the same scene, raining outside…&<CRLF>
…
#0015<CRLF> …(a one-off line)…&<CRLF>
```

**811 records over 613 ids.** The shape is measured: **six** ids carry more than
one phrasing — the largest holds **48** — and **607** are single one-off lines.
Note `#0015` appearing between `#0000l` and `#0001a`: the original's numbering is
not sorted, so the parse groups by id and never by position. The `%`-word
vocabulary is wide (67 distinct words, `%a` … `%u`), which is why
`arenaText.fillTemplate` matches keys **longest-first** (`%mm` must not be read as
`%m` + `m`) and drops an unknown word rather than showing a player `%qmn`.

### The shopkeeper banks — `muguild.dat`, `tavern.dat`, `equip.dat`, `selling.dat`

NUL/blank-line separated lines, all of them templates for a transaction
(`%i` the item, `%mm` the gold): 123 mages-guild lines, 75 tavern lines, 200
equipment lines, 141 selling lines. `muguild.dat`'s first record opens with a run of
`?` bytes (the original's editor wrote a length it never filled in); they are
stripped rather than shown. Tavern lines are the flavour of the game's own speech —
"Me give you %i, for %mm gold. Okay?" — and are reused by the city's services.

### `guard.dat`, `classes.dat`, `names.dat` — **not** text

Binary despite the extension: 72 bytes for the guard table, 216 for the class table
(stat pairs), and `names.dat` is 480 bytes of the literal string `EMPTY` repeated —
an unusable stub in this install, so nothing here generates a person's name from
the game's data. `artfact*.dat`'s `%an` is filled from a table in
`radiantQuests.js` instead, and labelled AUTHORED where it is.

## 10b. What a quest's dungeon holds (**RECONSTRUCTED**)

The MIF grid's index convention is **`cells[x * width + z]`** — `x` is the *row*
(world X, spanning `depth`) and `z` is the *column* (world Z, spanning `width`) —
as `mifMesh.buildLevelMesh` shows by building `x0 = row * S` and `z0 = col * S`.
Reading it the other way round is invisible on a square, centred level (`START.MIF`,
and every dungeon's first floor) and only shows on an off-centre one, where the
spawn cell turns out to be inside a wall: that is how it was caught.

Arena keeps a piece in a room that `A.EXE` names (D11). Derived instead: a
breadth-first flood from the level's spawn over every cell that is **not a wall** —
doors open, chasms are jumped, raised platforms are stepped onto — taking the last
cell reached. Walking, not flying: reachability across the sixteen shipped dungeons
measures 5–100% per level, and the deepest cell is 60–305 cells from the spawn on
the floors it is used on.

## 10. Text and rules data

| File | Size | Status | Contents |
|---|---:|---|---|
| `TEMPLATE.DAT` | 395 981 | VERIFIED text | numbered records (`#0000a \r\n…`), CRLF, `%`-macros (`%t`) — location descriptions, NPC dialogue, rumours |
| `CITYTXT` | 10 669 | VERIFIED text | `#0600\r\nNorth Point hail thee, traveller. …` — per-city greetings |
| `CITYINTR` | 13 871 | VERIFIED text | city interior greeting variants |
| `ARTFACT1.DAT` / `2.DAT` | 46 865 / 38 648 | VERIFIED text | artifact lore messages |
| `TAVERN.DAT`, `MUGUILD.DAT`, `EQUIP.DAT`, `SELLING.DAT`, `TEMPLE.DAT` | 5 743 … | VERIFIED text | merchant dialogue, NUL-separated strings, `%i` / `%mm` macros |
| `QUESTION.TXT` | 29 822 | VERIFIED text | character-creation class questions |
| `DUNGEON.TXT` | 2 215 | VERIFIED text | dungeon entrance descriptions (`Halls of Colossus\r\nYou stand before…`) |
| `SPELLMKR.TXT`, `HELP.TXT`, `READ.ME`, `README.TXT` | | VERIFIED text | spellmaker UI text, help, readme |
| `NAMES.DAT`, `NAMES.CLR` | 480 | VERIFIED | 10 save-slot names × 48 bytes, `EMPTY`-padded |
| `NAMECHNK.DAT` | 3 496 | UNVERIFIED | name-generation chunks (58 lists per community docs) |
| `CLASSES.DAT` | 216 | UNVERIFIED | 18 classes × 12 bytes; values small (0–10); structure not decoded |
| `GUARD.DAT` | 72 | UNVERIFIED | 6 × 12 bytes |
| `RAND.DAT` | 1 445 | UNVERIFIED | small-value table (0–0x0F), likely map/block randomisation |
| `JAGTEMP.DAT` | 5 345 | UNVERIFIED | design notes for the main quest |
| `SPELLSG.65` / `SPELLS.LST` | 10 880 | **VERIFIED size** | 128 × 85-byte spell records |
| `SPELLS.65` | 2 720 | **VERIFIED size** | 32 × 85-byte custom spell records |
| `STATES.65` | 28 800 | VERIFIED size | 64 × 450 bytes — dungeon lock/trigger state |
| `LOGO/CONFIG.CPY`, `INSTALL.CFG`, `SOUND.CFG`, `DISKS.BAK` | | config | install-time config, not game data |

## 11. Music and sound

* Music: `XFM` + `XMI` pairs inside `GLOBAL.BSA` (33 each) plus loose `.BNK`
  (AdLib/GM instrument banks, `GM1.BNK`, `MT1.BNK`), `28` `.ADV` files and
  `SAMPLE.AD`/`SAMPLE.OPL` — AdLib/MIDI instrument and driver data. Playback is
  Milestone 6.
* Sound effects: `.VOC` (Creative Voice File) inside the archive (`BASH.VOC`,
  `ARROWFR.VOC`, …) plus loose `FANFARE1/2.VOC`. `.VOC` is a documented
  container; the engine's WebAudio layer is fed decoded PCM.
* `.FLC` movies (17 files: `INTRO.FLC`, `KING.FLC`, `STAFF.FLC`, `WARHAFT.FLC`,
  `END01/02.FLC`, `CHAOSVSN.FLC`, …) — **Autodesk FLI/FLC, the same format the
  engine already reads** (`formats/flcFile.js`). Reuse as-is.

## 12. `.MNU`, `.CEL`, `.GLD`, `.XFM`

* `.MNU` (3): menu layout definitions (`TAMRIEL.MNU`, `STARTGAM.MNU`, `MAPBTNS.MNU`) — **UNVERIFIED**.
* `.CEL` (3): `MAGE.CEL`, `ROGUE.CEL`, `WARRIOR.CEL` — class portraits, palettized.
* `.GLD` (1): `2651.GLD`, 192 bytes, **UNVERIFIED**.
* `.XFM` (1 loose): a music companion file; the 33 archive pairs are the real set.
* `.RCI` (3): `LAVAANI.RCI`, `SPPARTS.RCI`, `WATERANI.RCI` — animated texture data.

---

## 13. Rules that live in `A.EXE` (**NOT AVAILABLE — reconstructed**)

The provided Arena folder contains **no `A.EXE`**. It has `ACD.EXE` (174 429 B),
`INSTALL.EXE` and `ULTRAMID.EXE`, and `ACD.EXE` is **PKLITE-packed** — its MZ stub
carries the string `PKLITE Copr. 1990-` at offset 30, and no game string survives
in it. OpenTESArena reads its rule tables from a *decompressed* `A.EXE` by byte
offset, so with this data set those tables are simply out of reach (see
DECISIONS.md D11 for why unpacking was not attempted, and D5 for the general
fallback).

The one place this changes what the player sees is raised-platform geometry. A
raised-platform `MAP1` voxel indexes two arrays:

```
boxArrays[56] = heightsInterior[8], heightsCity[8], heightsWild[8],
                thicknessesInterior[16], thicknessesCity[16] (= wilderness), spare[8]
box3a[8], box3b[8], box4[8]  texture-mapping values
```

`src/game/tables/raisedPlatforms.js` holds a **reconstruction**, not an
extraction: index 0 is flat ground, the sequences are monotonically increasing,
and the values are chosen so a step is shin-high, a crate chest-high and a dais
waist-high in a 100–200-unit room. Because height index 0 is the only one the
game's data actually uses (measured — `tools/lib/voxhist.mjs`), only the
*thickness* ladder is observable at all, and its absolute scale is approximate.
Walls, doors, floors, ceilings, chasms and edges are all exact.

## Credits

Format knowledge was first learned from, and is credited to:

* **OpenTESArena** (afritz1 and contributors) — the MIF/INF/RMD structure, the
  compressed-layer framing, the voxel-ID bitfield, INF's section/directive grammar
  and the INF decryption scheme, the Type08 decompressor's existence, and the
  save-file record sizes. <https://github.com/afritz1/OpenTESArena> ·
  <https://github.com/afritz1/OpenTESArena/wiki>
* **UESP — Arena** pages — file inventory and roles, main-quest structure and
  dungeon list, province/city/village lists, wilderness block dimensions, monster
  and class tables, and the A.EXE table offsets (unusable here, see D5).
  <https://en.uesp.net/wiki/Arena:Files> ·
  <https://en.uesp.net/wiki/Arena_Mod:Technical_Reference> ·
  <https://en.uesp.net/wiki/Arena:Places> ·
  <https://en.uesp.net/wiki/Arena:Main_Quest>
* **The Imperial Library — Arena game data catalogue** — the roles of the loose
  text `.DAT` files. <https://www.imperial-library.info/out-of-game/game-data>
* **ArenaToolBox (Dysperia)** — the Arena BSA directory layout and the `IMG`
  compression-flag observation. <https://github.com/Dysperia/ArenaToolBox-BSATool>

Beyond reading the sources above, the decoding in this project was checked by
printing it: `tools/mif-dump.mjs` (headers, chunk sizes, decoded-level statistics),
`tools/lib/mapascii.mjs` (a level as ASCII), `tools/lib/voxhist.mjs` (raw voxel-ID
histograms with their bitfields) and `tools/lib/textures.mjs` (ASCII texture
thumbnails with mean colours). Every number quoted in this file came out of one of
them or out of `tests/unit/mif.test.mjs`.

Every claim above was re-checked against the actual files in
`c:/arenaproject/arena/ARENA`; where the sources disagreed with the bytes, the
bytes won and the disagreement is recorded in DECISIONS.md.
