# ASSETS — what the install ships, what the port reads, and what to wire next

Block **B22** in [PORT_BLOCKS.md](PORT_BLOCKS.md). The owner's report of 2026-10-16 —
*"there are a lot of assets missing in perfectarena that instead are in normal arena and a lot of
features, places, backgrounds of cities and wilderness textures"* — is true at archive level and
false at the level-walked level: `audit`'s S-C found **not one missing texture on seven levels**
(`state().missingTextures` empty, `scenery.missing` 0). Both halves are in
[DEFECTS.md](DEFECTS.md) as **D-03** and **D-24**. This document is the part that can be acted on:
the unread records, grouped by what would read them, with the module each group belongs to.

Every number here is one `tools/assetcoverage.mjs` prints. The tool's rules are pinned in
`tests/unit/assetcoverage.test.mjs` (no install needed), so the table below cannot drift from the
classifier without a red test.

```bash
ARENA_PATH=<folder holding GLOBAL.BSA> node tools/assetcoverage.mjs            # the totals
ARENA_PATH=… node tools/assetcoverage.mjs --groups                            # the table below
ARENA_PATH=… node tools/assetcoverage.mjs --unused img --top 40               # the largest unread .IMG
ARENA_PATH=… node tools/assetcoverage.mjs --used                              # what the port does read
ARENA_PATH=… node tools/assetcoverage.mjs --json > census.json                # everything, machine-readable
```

## 1. The totals

Recorded 2026-10-15/16 (`docs/ROADMAP.md` §1, `docs/AUDIT-2026-10-15.md` §S-C); regenerate with the
first command above.

| | |
|---|---|
| `GLOBAL.BSA` | **2 441 records, 16 758 196 B** of payload (Σ sizes = directory start − 2, `docs/FORMATS.md` §2) |
| named **whole** in `src/` | **156 (6.4 %)** |
| reachable through a **composed** name (a stem such as `RAT` → `RAT1.CFA`) | **594 (24.3 %)** |
| **named by no source either way** | **1 691** |
| loose files in the install | **325**, of which **54** named whole |
| unread bytes, by kind | `.voc` **10.0 MB** (the speech bank) · `.img` **3.8 MB** · `.set` **2.0 MB** · `.cfa` **1.5 MB** · `.mif` **438 KB** |
| archive census (records per extension) | `img:946 mif:533 cfa:340 set:180 inf:93 dfa:79 voc:76 rmd:70 cif:58 xfm:33 xmi:33` |

**A "mention" is not a use.** A record can be named in a comment and be unread in fact. The
opposite reading is the sound one, and it is the one this document leans on: **a record no source
file names cannot be drawn.**

## 2. The unread records, by what would read them

`node tools/assetcoverage.mjs --groups` prints this table; the group, the records and the module
are the tool's own, and the counts are its first two columns. The **group column** and the
**module column** are the facts; the *unread* counts per group are filled by that run, because the
last recorded census counted them by extension (the line above) rather than by consumer.

The **measured** count per group, from
`ARENA_PATH=C:/ArenaProject/arena/ARENA node tools/assetcoverage.mjs --groups`
(2026-10-16; the cell below is this run's own output, so a later change to the tool or the
install is visible as a difference rather than as a stale number):

```
── UNREAD IN THE ARCHIVE, BY CONSUMER ──
   716 records   3938.2 KB  image-art     src/game/flats.js + src/arena/image.js
   162 records   2036.0 KB  tileset       src/game/mifLevel.js (voxelTexture)
   164 records   1510.1 KB  creature-set  src/game/monsters.js + src/game/townsfolk.js
   491 records    450.6 KB  level-map     src/arena/mifFile.js + src/game/dungeonPlan.js
    48 records    410.4 KB  sound         src/game/trigSound.js + src/engine/systems/audio.js
    38 records    274.9 KB  fixture       src/game/furnish.js + the flat pass in src/game/mifMesh.js
    36 records    234.7 KB  music         src/engine/systems/audio.js (nothing plays it yet)
    36 records    198.6 KB  screen        src/scenes/* + index.html (the UI is DOM, S19)
  (plus 237 unread loose files — the census line above)
```

| group | what it is | unread | where it belongs in this project |
|---|---|---|---|
| `screen` | full-screen art: panels, menus, faces, the map sheet | `.img` — run it | `src/scenes/*` + `index.html`. The UI is **DOM over the canvas** (S19); these are the pictures the original drew where this port draws HTML. |
| `image-art` | flats, scenery, wall/floor tiles, map pieces | `.img` | `src/game/flats.js`, `src/arena/image.js` |
| `class-art` | the class and character portraits (`.CEL`) | loose | `src/scenes/chargen.js` |
| `tileset` | 128×128 wall sheets | `.set` — run it | `src/game/mifLevel.js` (`voxelTexture`) — a level's own sheets, which is also B18's ground/climate work |
| `creature-set` | creature and crowd frame animations | `.cfa` — run it | `src/game/monsters.js` + `src/game/townsfolk.js` |
| `fixture` | room props and animated flats | `.dfa` | `src/game/furnish.js` + the flat pass in `src/game/mifMesh.js` |
| `level-map` | `.MIF` maps and their `.INF` definitions | `.mif` | `src/arena/mifFile.js` (`dungeonPlan.js` generates the 128 dungeons the install does not ship) |
| `wilderness-block` | the country's terrain blocks | `.rmd` | `src/game/wilderness.js` — B17 |
| `sound` | effects and voices | `.voc` (10.0 MB) | `src/game/trigSound.js` + `src/engine/systems/audio.js`; the speech bank is loose under `SPEECH/` |
| `movie` | Arena's own 320×200 cutscenes | loose `.flc` | `src/game/cutscene.js` + `src/scenes/cutscenePlayer.js` — **already wired** (15 of the 17 play) |
| `music` | `.XFM`/`.XMI` | `.xfm` `.xmi` | `src/engine/systems/audio.js` — **nothing plays music yet** |
| `palette` | `PAL.COL` and the climate palettes | `.col` | `src/arena/palette.js` |
| `table` | `CLASSES.DAT`, `SPELLSG.65`, `NAMEGEN.DAT`, … | `.dat` | `src/arena/arenaData.js` |
| `text` | the corpora | `.txt` `.mnu` | `src/arena/arenaText.js` (already read) |
| `other` | the archive itself, and anything the classifier does not know | run it | read the name and decide |

## 3. The five wiring jobs, most visible first

Chosen for **what the player would see for the work**, in the order a session should take them.
Each names the records to start from; every name here is one the install ships (loose names come
from the install's own directory listing, archive names from the port's code and `docs/FORMATS.md`).

1. **The `.IMG` screens → the UI panels.** The port's panels are its own HTML; the original's are
   946 pictures. Start with the title and menu art (`TITLE.IMG`, `SCROLL03.IMG`, loose), the class
   art (`MAGE.CEL`, `ROGUE.CEL`, `WARRIOR.CEL`, loose) and the character sheet's faces.
   *Seen by the player:* the menu, the sheet and the shop panels stop looking like a web page.
   The reader already exists (`src/arena/image.js`), so this is a drawing job.
2. **The speech bank → sound.** 10.0 MB of `.voc`, the largest unread family in the install, with
   `src/arena/vocFile.js` already decoding every clip the install ships. Start with the loose
   bank under `SPEECH/` and the `TEMPLATE.DAT` speakers (the Emperor, guards, guilds).
   *Seen:* the game talks.
3. **The `.SET` tilesets + the climate ground → B18.** The level's own wall sheets are bound today
   only for the ids its `.INF` names; the climate families (`TC*`/`TW*`-style city and wild
   INFs) are what make a province look like itself, and the same sheets are what snow and night
   variants would recolor. *Seen:* provinces that do not look alike.
4. **The `.CFA` sets → the creature and crowd drawers.** 340 sheets, of which **89 are people**
   and **65 are walk files** (`docs/FORMATS.md` §2). The port draws walk, attack and death; the
   unread part is the rest of the poses. Start with a monster's own set (`RAT.DFA` is the fixture,
   the `RAT*.CFA` family the frames) beside a crowd set (`01CHNWLK.CFA`, `05CHNWLK.CFA`).
   *Seen:* creatures and crowds that move like the original's.
5. **The `.DFA` fixtures and `.RMD` blocks → the country and the rooms (B17).** 79 animated props
   and 70 wild terrain blocks; the port places some props (`BRAZIER.DFA`, `CANDLE.DFA`,
   `NFOUNT1D.DFA` are drawn in the main-story dungeons — the `dungeonplay` suite prints them) and
   uses a subset of the wild blocks (`WILD001.RMD`). *Seen:* rooms that are furnished and a
   wilderness that is a place rather than a window.

## 4. What would make this document rot, and how it is prevented

* **A number nobody can regenerate.** Every figure above is a line the tool prints; the recorded
  ones name their source document.
* **A classifier that drifts.** The rules are exported and pinned by
  `tests/unit/assetcoverage.test.mjs` — the kinds, the consumer groups, the `.IMG` screen-prefix
  rule and `parseArgs` — and the test never opens the archive.
* **A group with no home.** `GROUP_MODULES` is a table in the tool, and the test asserts every
  group the classifier can answer names a module. A new family with nowhere to go fails the test
  rather than appearing in a report as a loose end.

When this block's wiring jobs land, the group table is how progress is read: a group's unread
count going down is the only honest measure of "the assets are in the game".
