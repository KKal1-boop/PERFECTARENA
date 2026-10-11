# PERFECTARENA

***The Elder Scrolls: Arena* (1994), reimagined on the WebGL2 engine written for
[Daggerfall Enhanced](../daggerfall).**

Arena's own maps, textures and — soon — its text and rules, read at runtime from
*your* copy of the game and rendered as walkable 3D by the Daggerfall engine's
renderer, player motor and collider. Nothing is bundled: the repository contains
no Arena data, and neither does the build output.

**Status: Milestone 3 of 6 complete.** You can walk real Arena interiors — the
Imperial Dungeons, any of the main-quest dungeons, any city or wilderness `.MIF`
in the archive — with correct decompressed geometry, correct textures from each
map's `.INF`, working collision and multi-level dungeons. See
[docs/PROGRESS.md](docs/PROGRESS.md) for exactly what is verified, what is
simplified, and what is untested.

---

## Run it

You need **your own Arena installation** and a modern browser with WebGL2.

```bash
npm run dev          # serves on http://localhost:8080
```

Then open <http://localhost:8080/>, click **Choose Arena folder**, and pick the
folder that contains `GLOBAL.BSA` (usually called `ARENA`). Everything is read in
place — nothing is uploaded, and nothing is copied into the project.

No Node? Any static server works:

```bash
py -m http.server 8080        # or: npx serve, php -S, …
```

The one requirement is that the page is served over HTTP rather than opened as a
`file://` URL, because the game loads ES modules and reads files.

### Controls

| Key | |
|---|---|
| `W A S D` | walk |
| `Shift` | run |
| `Space` | jump |
| `[` `]` | previous / next level of a dungeon |
| mouse | look (click the canvas to capture the pointer) |

`?interior=<NAME.MIF>` opens a specific map, e.g.
`http://localhost:8080/?interior=IMPPAL.MIF&level=1`. `?test` opens the
hand-made courtyard from Milestone 2, which needs no game data.

---

## What it does today

* **`.MIF` map data** — the header, `LEVL` sections and tagged chunks, with all
  three voxel layers (`FLOR`, `MAP1`, `MAP2`) decompressed by Arena's own Type-08
  codec and decoded through their bitfields into floors, walls, raised platforms,
  doors, diagonal walls, fences, arches, chasms and entities.
* **`.INF` map definitions** — the full grammar, including the ordered texture
  table (with `.SET #n` expansion), the `*BOXCAP`/`*BOXSIDE`/`*MENU` slot arrays,
  the ceiling, and the decryption Arena applies to `.INF` files inside
  `GLOBAL.BSA`.
* **Textures** — `.IMG` (raw 64×64 walls and the compressed headered form) and
  `.SET` sheets, palettized through `PAL.COL` or an image's own embedded palette.
* **Geometry** — a level meshed into the engine's `MeshBundle`, one sub-mesh per
  texture, with the collision soup built from the very same triangles so what you
  can see and what you can walk into can never disagree.
* **Walking** — the engine's fixed-step player motor, capsule collider, mouse
  look and distance fog, on maps up to 128×128 cells and 32 levels deep.

## What it does not do yet

Cities and wilderness, NPCs and dialog, combat, character creation, items, the
quest and save/load arrive with Milestone 4; the world map, all provinces and the
completable main quest with Milestone 5; magic, inventory, audio and a performance
pass with Milestone 6. Chasms are currently walkable, doors are always shut and
arches draw opaque — each is logged with its reason in
[docs/PROGRESS.md](docs/PROGRESS.md).

---

## Layout

```
index.html                 the game
src/main.js                router + boot
src/engine/                the reused engine (154 modules, pruned — see ARCHITECTURE §2)
src/arena/                 Arena's data layer: bytes and files → decoded structures
src/game/                  the world model: voxel bitfields → levels → meshes
src/scenes/                testmap.js, interior.js
docs/                      ARCHITECTURE, DECISIONS, FORMATS, PROGRESS
tools/                     offline inspectors, the mesh checks and the dev server
tests/unit/                Node tests against the real Arena files
tests/run-browser.mjs      headless Chrome suites + screenshots
```

## Developing

```bash
npm run test           # unit tests over the real Arena files (needs ARENA_PATH)
npm run test:browser   # headless Chrome: testmap, movement, interior suites
npm run check          # both
npm run probe:mif      # parse every loose .MIF and print what the game will see
```

```bash
ARENA_PATH=/path/to/arena/ARENA npm run test
ARENA_PATH=/path/to/arena/ARENA node tools/lib/mapascii.mjs 39300577.MIF 0 60
ARENA_PATH=/path/to/arena/ARENA node tools/lib/textures.mjs START.MIF 8
node tools/lib/shotascii.mjs tests/shots/m3-start.png 110
```

Set `ARENA_PATH` to the folder containing `GLOBAL.BSA`. The browser suite also
accepts `?arena=<folder>`, which is how the `interior` suite gets at your data
without a file picker.

## Credits

Format knowledge came from reverse-engineering by others, credited in
[docs/FORMATS.md](docs/FORMATS.md): **OpenTESArena** (afritz1 and contributors),
the **UESP** Arena pages, the **Imperial Library** game-data catalogue, and
**ArenaToolBox** (Dysperia). *The Elder Scrolls* and *Arena* are trademarks of
ZeniMax Media; this project ships none of their data and requires you to own a
copy.

## Scripts

| Script | |
|---|---|
| `npm run dev` / `serve` | static server (the game) |
| `npm run test` | unit tests over the real Arena files |
| `npm run test:browser` | headless Chrome suites |
| `npm run check` | both |
| `npm run probe:mif` | parse and dump `.MIF`/`.INF` files |
