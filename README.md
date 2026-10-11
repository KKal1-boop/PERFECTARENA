# PERFECTARENA

***The Elder Scrolls: Arena* (1994), reimagined on the WebGL2 engine written for
[Daggerfall Enhanced](../daggerfall).**

Arena's own maps, textures and — soon — its text and rules, read at runtime from
*your* copy of the game and rendered as walkable 3D by the Daggerfall engine's
renderer, player motor and collider. Nothing is bundled: the repository contains
no Arena data, and neither does the build output.

**Status: Milestone 4 in progress.** You can walk real Arena interiors, **and you can generate and walk a whole Arena city** — the
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
| `E` | take what you came for (a Staff piece, a map, a job's subject) |
| `M` | the world map of Tamriel — travel, and the town's job board |
| `B` | (on the map) the job board |
| `[` `]` | previous / next level of a dungeon |
| mouse | look (click the canvas to capture the pointer) |

### The world map, and work that never runs out

Press `M` and you are looking at **all of Tamriel**, drawn from your own copy of
Arena: `TAMRIEL.IMG` for the art, `CITYDATA.64` for the nine provinces and every one
of their 432 locations, and `TERRAIN.IMG` for each location's climate and coast.
Click a marker to travel there; `?location=Daggerfall` goes straight to a city.

Each town posts **three jobs** on its board (`B`). They are generated from the
world, not scripted: the target is a dungeon or settlement that really exists, the
deadline and the pay are measured in the map's own days and distance, and where
Arena wrote the words — the 372 artifact recruiting speeches in `artfact1.dat` and
`artfact2.dat` — the offer is Arena's own prose, credited on the card. Take one, walk
to the place, find the deepest chamber, press `E`, and come back to be paid. Travel
costs days, and days are what a deadline is made of.

The main quest runs through the same map: learn where piece 1 lies from a parchment
in Stonekeep, then take it from the deepest chamber of Fang Lair. Arriving anywhere
puts Arena's own text on screen — the gate greeting `citytxt` files for that
city-state, or the arrival prose `dungeon.txt` gives that dungeon. Your quest, your
journal, your pending job and the calendar all survive the page loads that travelling
is made of.

`?city` generates a city-state and drops you at its north gate: `?city=town&seed=99`,
`?city=village`, `?city&climate=desert`, `?city&mif=CITYW1.MIF`. A city is assembled
by Arena's own algorithm from the seed, so the same seed is always the same city.

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
* **Cities** — a settlement is *generated*, because Arena has no city map to load:
  a skeleton `.MIF` supplies the ground, wall ring, gates and water, and a seeded
  grid of 20×20 block `.MIF`s (equipment shops, mages guilds, noble houses,
  temples, taverns, houses) is stamped into it with Arena's own random number
  generator. Streets, roofs, shop signs, water and the block layout all come out of
  real data, and the grid size follows the settlement kind — 6×6 blocks for a
  city-state, 5×5 for a town, 4×4 for a village.
* **Textures** — `.IMG` (raw 64×64 walls and the compressed headered form) and
  `.SET` sheets, palettized through `PAL.COL` or an image's own embedded palette.
* **Geometry** — a level meshed into the engine's `MeshBundle`, one sub-mesh per
  texture, with the collision soup built from the very same triangles so what you
  can see and what you can walk into can never disagree.
* **Walking** — the engine's fixed-step player motor, capsule collider, mouse
  look and distance fog, on maps up to 128×128 cells and 32 levels deep.
* **The world of Tamriel** — `CITYDATA.64`'s nine province rectangles and 432
  locations, `TERRAIN.IMG`'s climate per pixel, and `TAMRIEL.IMG` drawn as the world
  map. Fast travel takes a location's *name* and brings back its own city, climate
  and coast.
* **Arena's prose** — 64 city-state greetings, 9 dungeon arrival texts, 372 artifact
  quest speeches, 811 talk templates and 539 shopkeeper lines, parsed out of the
  loose data files and shown where the game shows them.
* **The main quest, playable** — the eight Staff pieces derived from the data, with
the map dungeon that reveals each; escape the Imperial Dungeons, find the parchment
in Stonekeep, take piece 1 from Fang Lair's deepest chamber with `E`, and reload to
find it still taken.
* **Side work that does not run out** — a town posts three generated jobs on its
  board (`B` on the map), each pointing at a place the install can really open, with
  a deadline in the map's own days and Arena's own words where it has them.

## What it does not do yet

Character creation, NPCs you can hold a conversation with, combat, items and the UI
windows (character sheet, inventory, quest log) remain; so do the other seven Staff
pieces, the Imperial Palace finale and the ending, which is Milestone 5's remaining
work. Magic, audio and a performance pass are Milestone 6. Only the level you arrive
on is searched for a piece; chasms are walkable; doors are always shut and arches
draw opaque — each is logged with its reason in [docs/PROGRESS.md](docs/PROGRESS.md).

---

## Layout

```
index.html                 the game
src/main.js                router + boot
src/engine/                the reused engine (154 modules, pruned — see ARCHITECTURE §2)
src/arena/                 Arena's data layer: bytes and files → decoded structures
src/game/                  the world model: city generation, voxel bitfields → levels → meshes
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
| `npm run probe:city` | generate a city and print its plan, stats and ASCII map |
