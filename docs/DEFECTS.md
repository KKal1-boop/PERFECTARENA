# DEFECTS

Every defect gets an id, the symptom in the reporter's words, the probe that shows it, the root
cause once found, and a status. A defect is **CLOSED** only when its probe passes on the same
command that failed before.

Status key: `OPEN` · `IN PROBE` (a failing probe exists, no fix yet) · `FIXED` (change landed,
probe green) · `WONTFIX` (with the reason) · `ENV` (not reachable on this machine) ·
`DOC` (a document or comment that says something the code no longer does).

The probe command for every row below is
`ARENA_PATH=C:/ArenaProject/arena/ARENA node tests/run-browser.mjs audit`
(the run of 2026-10-15 is written up in `docs/AUDIT-2026-10-15.md`; 14 of 23 checks pass).

| id | symptom (reporter's words) | probe | root cause | status |
|---|---|---|---|---|
| D-01a | "NPCs that can't move" — **at night** | S-A: Daggerfall at 23:00, 48 people, **0 moved > 5 m in 20 s**; at 10:00 the same probe reads 43 of 48 | not yet established (candidates: `stepTownsfolk`'s night gate; `townPaths` refusing a walk after dark; a `sleep` activity with no destination) | OPEN |
| D-01b | "NPCs that can't move" — **outside cities** | S-A: 0 people in all three wilderness climates, 0 moved | `interior.js`'s `populate()` sets `inhabited = inCity \|\| entryCell` and its final `else { townsfolk = []; }` empties the list for every wilderness window and dungeon — nobody exists to walk | OPEN |
| D-02a | "missing enemies" — **the country is empty** | S-B: 0 creatures in all three wilderness climates, `roster []` | `TWN.INF` / `DWN.INF` / `MWN.INF` place only item flats `[15, 2, 14]`, none in the monster range, so `monsterRosterFromInf` → `[]` and `monsterCountFor` → 0. Arena's own wilderness encounters evidently lived in the executable (P2). Until then the table is **this project's own** and must be stamped as such | OPEN |
| D-02b | a comment that is factually wrong | `monsterRosterFromInf(start.inf)` → **23 species** (itemIndexes 1…8, 32…54), and the Imperial Dungeons field 5 of them | `game/encounters.js`: "`start.inf` … lists keys, equipment and treasure and not one creature, which is exactly why the escape is quiet" — false against the bytes. The law ("a level that names none gets none") stays; the sentence defending it does not | DOC |
| D-03 | "missing textures/assets/backgrounds" | S-C: `state().missingTextures` empty on 7 levels (city, shop, 3 wilderness windows, dungeon); `scenery.missing` 0; `wild.missingBlocks` empty | no defect found *on the levels walked*; the complaint is real at archive level — `tools/assetcoverage.mjs`: 1 691 of 2 441 BSA records named by nothing, 946 `.IMG`, 180 `.SET`, 340 `.CFA`, the speech bank unread | OPEN (coverage) |
| D-04 | "missing landscapes/backgrounds" | S-D: at cell (1024,1024) the three climates place **[24,60,49,29] / [41,34,12,56] / [37,22,9,32]** — no shared block — with 1 123 / 1 154 / 1 753 flats and means 37.5 / 60.8 / 41.6 of 255 | not reproduced as reported: climate selects terrain records, not just a palette. Still absent, and never claimed: relief, coast, sea, rivers, roads, continuous Tamriel, far ring | OPEN (the P4 half) |
| D-05 | "persistent world features missing" | S-E: `__debug.navigations` 2 → 2 across a real `E` into the smith, and `window.__auditMark = 4242` set on the street is still readable inside `EQUIP2.MIF` | a door, a gate and a stair are **not** page loads (`goInPlace` re-boots the scene in the same document). The real gap is a hop being a full scene re-boot — crowd, clock, kills and loot are rebuilt from the save, never carried | OPEN (P3) |
| D-05a | stale mechanism in the docs | the same S-E run | `docs/PROGRESS.md` §5 (S35) still says "a building is entered and left by a page load", which the code has not done since `goInPlace` landed | DOC |
| D-06 | (hand-off) "5 names tests fail without arena2" | `npm test` on a machine without the sibling install's `NAMEGEN.DAT` (`C:/arenaproject/daggerfall/arena2/DF/DAGGER/ARENA2/NAMEGEN.DAT`) — `unit/names.test.mjs` asserts the file is reachable | not reachable here: the file is present, so **412/412 pass** on this machine. The brief's quick win stands and is **not done**: `daggerfall/src/characters/nameGen.json` (13 KB, verified present, the same 11 banks as `{setCount, sets:[{setIndex, parts}]}`) is a ready fallback when the DAT is absent | ENV + OPEN |
| D-07 | people have no names outside this checkout | read, not run: `interior.js`'s `ensurePeopleNames()` fetches `/arena-local/NAMEGEN.DAT?arena=<dfRoot>` with `DF_ROOT_DEFAULT = 'C:/ArenaProject/daggerfall/arena2/DF/DAGGER/ARENA2'` hard-coded, and every failure path is silent | names therefore exist **only** on the dev door of a checkout that has the sibling install exactly there. On the shipping path (a folder the player picked) there is no `/arena-local` route at all, so every person in every settlement is nameless and nothing says so. Two fixes, both cheap: serve the corpus through the picked folder's own source when it is reachable, and fall back to `nameGen.json` so a missing corpus is a *degraded* feature rather than an invisible one | OPEN |

## Observations with evidence, not yet defects

| id | observation | evidence | next step |
|---|---|---|---|
| O-01 | A *live* city page whose clock is moved with `__debug.setClock(1380)` did not answer a 20 s in-page watch — the probe hung for four minutes with no error, while a page **booted** at 23:00 (`?clock=1380`) answers fine | first two audit runs; the suite now boots a night page instead | if it repeats, bisect the clock/sky-recompose path; until then it is a probe limitation, not a claim about the game |

Fixed defects move to the bottom with the commit hash that closed them and the probe's output.
