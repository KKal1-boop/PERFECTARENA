# PERFECTARENA

*The Elder Scrolls: Arena* (1994) revived on the WebGL2 engine of
[Daggerfall Enhanced](../daggerfall). Arena's maps, textures, prose and rules are read
at runtime from **your** Arena install; nothing game-owned is bundled.

## What actually runs (all browser-verified)

| Area | State |
|---|---|
| Main quest | Imperial Dungeons → eight Staff pieces → palace finale; **Arena's own movies** play at its beats (`VISION.FLC` on the escape, `END01.FLC` before the ending page), and the ending is in Arena's words |
| World | All 288 settlements and all 144 dungeons reachable (128 dungeon maps assembled from data) |
| Combat | Soulslike: telegraphed world-space windups, real dodge rolls with i-frames, a timed parry that opens a riposte window, charges you must dodge, bounded particles |
| Enemies | Original `.CFA` art, per-actor walk/attack/death playback, charges labelled, sight checks; bounties are real fights |
| Dungeons | Correct wall orientation, animated `.DFA` fixtures, loot that pays once, reachable keys, safe resting on `R` |
| Towns | Day/night, people that walk schedules and work a regard ledger, jobs from people and boards |
| Persistence | Character, quest, bounty progress, loot, door and regard state survive reloads |
| Cutscenes | The install's own 320×200 `.FLC` movies, played at the file's own frame delay, any key to skip — `?cutscene=INTRO.FLC`, or `?cutscene` for the opening. The opening greets a new session once, like the game's own fanfare |

See [docs/PROGRESS.md](docs/PROGRESS.md) for what is claimed vs. proved, and
[docs/ROADMAP.md](docs/ROADMAP.md) for what must happen next.

## Run

Requires your Arena install (a folder holding `GLOBAL.BSA`) and a WebGL2 browser.

```
start.cmd                       Windows: finds Node, serves, opens the browser
./start.sh                      macOS / Linux / Git Bash
npm run dev                     static server only, http://localhost:8080
```

Then choose the Arena folder in the page. Data is read in place; nothing is copied out.

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
| `[` `]` | previous / next dungeon level |
| mouse | look |

## Tests

```bash
ARENA_PATH=C:/ArenaProject/arena/ARENA npm test            # 412 unit tests
ARENA_PATH=C:/ArenaProject/arena/ARENA npm run test:browser # the browser suites
ARENA_PATH=… node tests/run-browser.mjs bounties           # one suite
ARENA_PATH=… node tools/assetcoverage.mjs                  # what the install ships vs. what the port reads
```

`ARENA_PATH` is the folder holding `GLOBAL.BSA`. Browser suites need Chrome or Edge.

## Credits

Format knowledge: OpenTESArena, UESP's Arena pages, the Imperial Library, ArenaToolBox.
Engine code is Daggerfall Enhanced's (MIT). *The Elder Scrolls* and *Arena* are
ZeniMax Media trademarks; this project ships none of their data.
