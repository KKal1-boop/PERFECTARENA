# PERFECTARENA

*The Elder Scrolls: Arena* (1994) revived on a WebGL2 engine. Arena's maps, textures, prose and rules are read
at runtime from **your** Arena install; nothing game-owned is bundled.

## What actually runs (all browser-verified)

| Area | State |
|---|---|
| Main quest | Imperial Dungeons → eight Staff pieces → palace finale; **Arena's own movies** play at its beats (`VISION.FLC` on the escape, `END01.FLC` before the ending page), and the ending is in Arena's words |
| World | All 288 settlements and all 144 dungeons reachable (128 dungeon maps assembled from data) |
| Combat | Soulslike: telegraphed world-space windups, real dodge rolls with i-frames, a timed parry that opens a riposte window, charges you must dodge, bounded particles. Daggerfall's fight readout: floating hit/miss/critical/heal numbers, a reticle hit marker, a 0.4-alpha damage flash, and a target card with a ghost health bar |
| Enemies | Original `.CFA` art, per-actor walk/attack/death playback, charges labelled, sight checks; bounties are real fights |
| Dungeons | Correct wall orientation, animated `.DFA` fixtures, loot that pays once, safe resting on `R`; keys carry Arena's type id (`(lockLevel - 1) % 12`), are spent when a lock turns, cap at twelve slots, and clear at a stair. Staff dungeons put up their own `DUNGEON.TXT` arrival page and carry `STAFDUNG.CIF`'s province mark on the map |
| Towns | Day/night, people that walk schedules and work a regard ledger, jobs from people and boards |
| Persistence | Character, quest, bounty progress, loot, door and regard state survive reloads |
| Cutscenes | All 17 of the install's own 320×200 `.FLC` movies, played at the file's own frame delay, any key to skip. The start-up book (`INTRO`), the pre-title scroll cards, New Game's opening scroll and nine-panel history, Ria's and Tharn's visions, the Staff's assembly, the palace reveal and shield, and the whole ending chain (`NUJAGDTH`/`JAGARDTH` → `NUKING`/`KING` → `END01` → `END02` → `AFLC2`) are wired. `?cutscene=…` plays every film, including the cut Warhaft slide and the CD alternates |

See [docs/PROGRESS.md](docs/PROGRESS.md) for what is claimed vs. proved, and
[docs/ROADMAP.md](docs/ROADMAP.md) for what must happen next.

## Run

Requires your Arena install (a folder holding `GLOBAL.BSA`) and a WebGL2 browser.

```
start.cmd                       Windows: finds Node, serves, opens the browser
./start.sh                      macOS / Linux / Git Bash
npm run dev                     static server only, http://localhost:8080
```

Then choose the Arena folder in the page — or open the whole install as a `.zip` / `.rar`,
which is the door a phone and a locked-down browser can use. Data is read in place;
nothing is copied out.

## Publish

The game is a static site: a host needs `index.html` and `src/`, and no build step. Cloudflare's
dashboard uploader refuses a folder that holds TypeScript (it reads `.ts` as “this project wants
a build”, and `.scratch/` and `node_modules/` are full of them), so pack first:

```
npm run pack                       # writes dist/ — 294 files, 6.4 MB, no TypeScript
npx wrangler pages deploy dist     # or drag dist/ onto the dashboard
```

`dist/` holds nothing of Arena's: the player supplies the folder or the archive. The RAR decoder
(`src/vendor/unrar/unrar.wasm`, 208 KB) must ship with it — a `.zip` still opens without it.

## Controls

| Key | Action |
|---|---|
| `W A S D` | walk |
| `Shift` | run |
| `Space` | jump |
| `Q` (+dir) | dodge roll with i-frames |
| `F` / left click | strike |
| `B` / right click | guard; tap before impact to parry |
| `E` | open a door, take a thing, cross a gate, use a stair |
| `R` | rest (refused in danger) / rent a room |
| `T` | speak to the nearest person |
| `I` / `C` | pack / spellbook |
| `Z` | cast the last read spell |
| `V` | first / third person |
| `M` | world map (travel; job board) |
| `J` | logbook (objective, journal, places seen, your own notes) |
| `[` `]` | previous / next dungeon level |
| mouse | look |

## Tests

```bash
ARENA_PATH=C:/ArenaProject/arena/ARENA npm test            # 920+ unit tests
ARENA_PATH=C:/ArenaProject/arena/ARENA npm run test:browser # the browser suites
ARENA_PATH=… node tests/run-browser.mjs bounties           # one suite
ARENA_PATH=… node tools/assetcoverage.mjs                  # what the install ships vs. what the port reads
```

`ARENA_PATH` is the folder holding `GLOBAL.BSA`. Browser suites need Chrome or Edge.