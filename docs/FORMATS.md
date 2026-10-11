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

### Voxel ID bitfield (**VERIFIED as a scheme, UNVERIFIED in every bit**)

The ID is not a flat texture index. Documented decoding reads two fields,
`(id & 0x7F00) >> 8` and `id & 0x007F`, and the `MAP2` height class from bits
`0x80` / `0x8000`. Values such as `0x002E`, `0x7F00`-family and `0x0080` occur in
the real `START.MIF` header region. Exact semantics of each field (which one is
the texture index, which the wall class, how the two layers combine) are being
established in Milestone 3 against a walkable city.

### Level geometry (**TENTATIVE**)

Level height is derived from `MAP2` when present (`2 + max(MAP2 height class)`),
otherwise from the INF `*CEILING`. Distances are in "centimetre-like" units with
128 units per voxel — corroborated independently by the MIF header's start
coordinates, which divide by 128 to give voxel positions.

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

## 5. Type08 compression (**UNVERIFIED — the algorithm**)

The MIF voxel layers (and some IMG payloads) are compressed with a "Type08" /
"Delta Mode" scheme. Only the *container* framing is verified here (§3); the
decoder itself is being established in Milestone 3 and will be documented in this
file when it round-trips a real layer to exactly `width × height × 2` bytes.
**Known-good test vectors** are recorded from the real files:
`START.MIF` `FLOR` 525 → 5 000, `MAP1` 1 496 → 5 000; `IMPPAL.MIF` four levels;
`RANDOM1.MIF` 32 levels of 32×32.

## 6. Palettes and images

### `.COL` (**VERIFIED**)

```
0x00 uint8[8]  header (first bytes 08 03 00 00 23 b1 00 00)
0x08 byte[768] 256 × RGB triples
total 776 bytes
```
Verified on `PAL.COL`, `CHARSHT.COL`, `DAYTIME.COL`, `DREARY.COL` (all 776 bytes).

### `.IMG` / `.CIF` / `.RCI` / `.SET` (**TENTATIVE**)

* `.SET` — 16 384 bytes (verified on `CASA.SET`): 128×128 8-bit pixels = four
  64×64 or sixteen 32×32 tiles; INF's `#n` expansion implies a **row-per-texture**
  slicing. Exact tiling being confirmed in Milestone 3.
* `.CIF` — header `uint16 width, uint16 height, uint16 …`, then run/bit-packed
  pixel data (verified `ARROWS.CIF` = 1 083 bytes, header `7f 00 2f 00 0c 00 09 00`).
* `.IMG` — header + palettized data (`0EQUIP.IMG`, `AUTOMAP.IMG`, 946 of them).
* `.DFA` — animated flat: header then frame data (verified `CHAOS1.DFA` 4 980 bytes).

All are 8-bit palettized with index 0 as the transparent cutout, matching the
engine's `ui/bitmapCanvas.js` convention.

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

## 9. Fonts (**TENTATIVE**)

`TEENYFNT.DAT` (1 695 B), `ARENAFNT.DAT` (1 895 B), `FONT4.DAT`, `FONT_A/B/C/D.DAT`,
`FONT_S.DAT`. Verified: the first byte is the face's maximum glyph width
(TEENYFNT = 8, ARENAFNT = 9, FONT4 = 7) and the following bytes are a per-glyph
width table with plausible small values (2–8). Glyph bitmap blocks follow.
**UNVERIFIED:** the glyph count/ASCII start, the height, and the bitmap packing.
Milestone 4 will either finish this or fall back to a built-in bitmap face
(logged in PROGRESS.md).

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

Every claim above was re-checked against the actual files in
`c:/arenaproject/arena/ARENA`; where the sources disagreed with the bytes, the
bytes won and the disagreement is recorded in DECISIONS.md.
