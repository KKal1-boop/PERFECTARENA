# The twins: PERFECTARENA and Daggerfall Enhanced

Two games, one engine, and a great deal of deliberate divergence. This document is the
comparison it is easy to get wrong, so it starts with the numbers measured off both trees
rather than remembered:

| | `daggerfall/` (Daggerfall Enhanced) | `PERFECTARENA/` (this project) |
|---|---|---|
| modules under `src/` | **1 892** | **210** |
| lines under `src/` | **≈ 734 000** | **≈ 81 600** |
| the engine subset | 1 892 modules, the whole engine | 152 modules, **151 of them also in the twin** |
| …of those 151, byte-identical | — | **53** |
| …of those 151, adapted or forked | — | **98** |
| scenes | 134 modules under `scenes/` | **4** (`interior`, `worldmap`, `chargen`, `testmap`) |
| data readers | 86 modules under `formats/` (Daggerfall's own files) | **15** under `arena/` (Arena's own files) |
| network | 165 modules under `net/` | **none** |

So the honest one-line summary: **this project is a small, hard fork of the twin's engine,
with an entirely different data layer and four scenes, wrapped around Arena's own files.**
It is not a copy of the twin, and the twin's 1 892 modules are not 1 892 features waiting to
be switched on — most of them describe Daggerfall's world data, which Arena does not have.

## 1. What is shared, and how far the sharing goes

The engine subset was copied from `daggerfall/src/` and then *pruned*: `src/engine/` here
holds the modules that Arena's four scenes actually reach. The provenance rule is in
[src/engine/PROVENANCE.md](../src/engine/PROVENANCE.md), and the count above (98 of 151 files
adapted) is what it costs — the copy is a starting point, not a library.

The **53 byte-identical** modules are the ones with no game in them, and they are worth
naming because they are the reason the two projects can be compared at all: `world/mat4.js`,
`world/perlin.js`, `formats/bsaFile.js`, `formats/imgFile.js`, `formats/fntFile.js`,
`formats/dfPalette.js`, `formats/dfRandom.js`, `formats/flcFile.js`, `formats/pakFile.js`,
`formats/sndFile.js`, `formats/umRandom.js`, `render/renderTarget.js`, `render/perfMeter.js`,
`render/precipitation.js`, `render/cloudShadow.js`, `render/retroPass.js`,
`player/moveScanner.js`, `systems/races.js`, `systems/lightning.js`, `systems/weather*.js`,
`ui/touch*.js`, and the rest of the `ui/` input and glyph helpers.

The **large forks** are where the two games genuinely differ, and they are documented one by
one rather than hidden:

| module | twin | here | lines that differ | why |
|---|---|---|---|---|
| `render/renderer.js` | 8 179 lines | 5 551 lines | 3 216 | Arena's draw passes: the `uCutout` uniform that draws a sign or a hedge as a picture on a hole, Arena texture-record rules, billboard batching for `.CFA` figures |
| `player/collider.js` | 1 264 stubs + | pruned | 1 380 | Arena's walls and doors; no Daggerfall climbing, swimming or parkour |
| `player/motor.js` | pruned | pruned | 1 661 | one world, one movement mode |
| `render/shadowPass.js` · `render/airPass.js` · `render/waterSurface.js` | — | — | 1 423 · 683 · 435 | Arena's levels have no Daggerfall weather volumes or deep-water bodies; the chasm surfaces (`game/chasmSurface.js`) replace them |
| `systems/modSettings.js` · `systems/features.js` | — | — | 1 527 · 1 065 | Daggerfall's options tree and mod system, which Arena's port has nothing to load |
| `net/` | 165 modules | **absent** | — | see §5 |

## 2. What each project has that the other does not

**PERFECTARENA-only** (`src/arena/`, `src/game/`, `src/scenes/`, ~19 500 lines): the Arena
data layer — `bsaArchive`, `cfa`, `cifFile`, `rciFile`, `rmdFile`, `mifFile`, `infFile`,
`cityDataFile`, `cityDataSeeds`, `arenaText`, `decompress`, `palette`, `image` — and the game
rules built on it: `cityPlan`, `dungeonPlan`, `mifMesh`, `mifLevel`, `wilderness`,
`radiantQuests`, `questData`, `questState`, `townsfolk`, `shops`, `doors`, `flats`,
`dungeonItems`, `encounters`, `monsters`, `combat`, `inventory`, `weaponView`, `chargen`,
`character`, `save`, `worldMap`, `arenaSky`, `chasmSurface`, `playerSprite`, and now
`regard`.

**Daggerfall-only**, by the directory, with the honest note on each:

* `net/` (165 modules) — a real multiplayer layer: sessions, an account system, a relay,
  parties, PvP arenas, guilds, chat, an economy synced across players. **This is the one that
  matters to the brief's "match the standard of Daggerfall MMO Online"** — see §5.
* `characters/` (93 modules) — Daggerfall's paperdoll, armour pieces, cloth simulation,
  beast bodies, werewolf skins, its own animation rig. Arena's people are five `.CFA` angles
  per outfit (`game/townsfolk.js`), which is *all Arena ships*: no rig, no pieces, no cloth.
* `combat/` (47 modules) — DUEL's weapon rigs, gun sheets, blood decals, technique rosters,
  siege combat, shield widgets. Arena's fight is `game/combat.js`: UESP's hit and damage
  tables, a swing, a block. Porting DUEL wholesale would be importing Daggerfall's *feel*
  with none of its data behind it.
* `systems/` (639 modules) — the largest prize and the largest trap. See §3.
* `formats/` (86 modules) — `.BSA` variants, Daggerfall's quest QRC/QBN, save trees, Unity
  bundles, Morrowind's ESM/NIF/DDS. None of it reads an Arena file.
* `world/` (210 modules) — terrain generation, roads, deep water, Iliac Bay geography. Arena
  ships its own world as `TERRAIN.IMG` + `CITYDATA.64`, which `game/worldMap.js` reads.

## 3. The port ledger

### Ported (this project, in order)

| what | from the twin | where it lives here |
|---|---|---|
| the engine | `src/` | `src/engine/` (152 modules) |
| **precipitation** — rain and snow as a particle pass | `render/precipitation.js` | copied verbatim; driven by Arena's own four weather letters out of the `.INF` **filename** (`game/arenaSky.js`: `skyClimateOf`, `precipitationMode`), drawn in `scenes/interior.js` |
| the sky, read from the install's own art | the twin's `world/weather.js`, `render/dynamicSkies*` ideas | rewritten as `game/arenaSky.js` + `engine/render/skyRenderer.js`: 39 `GLOBAL.BSA` `.IMG` records composed into a panorama |
| **the regard law** — friends and enemies, numbered | `systems/livingWorld/relations.js` | `game/regard.js`: the twin's own thresholds (`FRIEND_AT` 40, `ENEMY_AT` −40, `HOSTILE_AT` −70), its `EASE_PER_DAY` 0.5 easing, its event table (`talk` +3 once a day, `job` +25, `struck` −45, `slain` −75), its cap-and-trim rule. Keyed by *place and cell* instead of a census id, because Arena ships no name tables (S30) |
| **"people who know you"** | `systems/livingWorld/people.js` | the world map's board panel (`scenes/worldmap.js`): the ones who matter most first, with the friend/enemy tally |
| **one of their own struck down turns the town** | `systems/livingWorld/relations.js` `HAND_KINDS` + `livingTown.js` consequences | `strikeFolk` in `scenes/interior.js`: the victim takes `struck`, a death gives every witness `slain` (−75), and `stepHostileFolk` makes the hostile ones close and swing |
| **the hand-in** | `systems/quest/offerFlow.js`, `quest/machine.js` — a job is paid by whoever gave it | `radiantQuests.js` (`giverId`, `handInWith`, `handInAtPlace`) + the talk panel's own button: a job given by a person is paid by that person, one off the board is paid by the town |
| **a living town's day** | `systems/livingWorld/dayPlan.js`, `townPaths.js` | `game/livingWorld.js`: `dayPlanFor` (a day tiled from the person's own **trade** and their own seed, deterministic per person and day), `currentActivity`, `streetGoal` (which door they are walking to, measured from their home so a walker never turns round), `isOpen`/`SHOP_HOURS`, and the trade aliases read off the data this port actually has (`person.shop.kind`, an `.INF` `*ITEM` role). Wired into `scenes/interior.js`: a shut door is *refused* by the hour, the plans move the walkers, and the HUD reads the hour out |
| **the watch** | `systems/townWatch.js` (`runTownWatchFrame`, its threat test and countdown) | `game/livingWorld.js`: `watchDecision` (a crime **nobody saw is nobody's business**, a murder in a watchman's sight is an *arrest*, a stolen purse a warning), `watchSpawn` (the crime's own count plus a seeded draw, capped in total — the twin's `TOWN_WATCH_MAX_WAVES`), the three rotating shifts with a rest day in four, and `WATCH_REGARD`. Carried out by `scenes/interior.js`'s `callWatch`, which swears in the nearest of the crowd rather than minting guards |
| **the sun over Tamriel** | `world/worldClock.js` (itself 1:1 with DFU's `DaggerfallDateTime`, `SunlightManager`, `PlayerAmbientLight`) | `game/daylight.js`: DawnHour 6 / DuskHour 18, the sun's own arc (`t = (minute − 360)/720`, dawn in the east, noon overhead), `LightCurve`'s Hermite keys and its `evaluateCurve`, the night→noon ambient lerp, the rig's colour, and the frame's sky/fog mix. Applied every painted frame in `scenes/interior.js`, so a town's light and its clock are one claim |

### Next, in the order the brief's own list suggests

1. **The quest machine's structure** (`systems/quest/`, 29 modules). The twin runs Daggerfall's
   QBN language — a real quest *script* with symbols, tasks, timers and resources — and its
   offer flow gates work by guild membership and reputation (`questLists.js`). Arena's side
   work is this project's own five kinds drawn from the world (`radiantQuests.js`), and the
   main quest is a fixed chain. What is worth taking is **not** the parser (it parses
   Daggerfall's files) but the *shape*: more kinds, arcs that reference each other, a job that
   can fail because a rival took it, and a reputation gate. Each of those is a change to
   `radiantQuests.js`'s state machine, testable in Node.
2. **Pathfinding between the doors** (`livingWorld/townPaths.js`'s A*). *Ported in part:* the
   **day** is in (`game/livingWorld.js`), and a person's goal is a real door or their own home
   cell — but the walker still steers toward that goal rather than along the street grid, so a
   person can be seen cutting a corner through a courtyard. Arena's streets are a cell grid
   (`mifLevel`) with walkability already known (`game/cityPlan.js`), so the A* is the remaining
   half of the same port.
3. **Friendship with a cost and a reward** (the twin's `relations.js` remainder, `talkTopics`,
   `rumorMill`). Now that a regard exists, the gates are cheap: a friend tells the player
   something a stranger will not, a hostile one refuses service, a guild will not deal with an
   enemy. The numbers and the easing are already ported and tested.
4. **City lanterns and window light** (`world/worldClock.js`'s `isCityLightsOn` at 17:00,
   `DaggerfallLight.AnimateLight`'s 14-tick flicker, `render/realWindows.js`'s `roomLightFor`).
   *The sun is in and the lanterns are not*, which is why the night needs this project's own
   ambient floor (`daylight.NIGHT_AMBIENT_FLOOR`, S41): DFU lights its towns from five in the
   evening and its night is a third of noon because of it. A lantern is an emissive quad and a
   flickering point light at a door — small, and the port's own doors already know where the
   doors are.
5. **Weather with a forecast** (`systems/weatherFront.js`, `weatherSim.js`, `seasonsIliacBay`
   for the idea). This port reads each level's weather from its `.INF` name, so the same city
   is snowy forever. The twin runs weather as a *field* that moves over the map. Arena's
   `TERRAIN.IMG` has the climates; a front would make a journey change the sky.

### Deliberately not ported

* **`net/` and the MMO.** See §5 — this is a decision, not an omission, and it is the one
  item on the brief that would change what the project *is*.
* **The mod system** (`systems/modSettings.js`, `modSaveData`, the mod manager). The twin
  loads player mods; Arena's port has nothing to load and no UI pack to skin.
* **Daggerfall's formats** (`formats/*` beyond the shared ones). Reading them here would be
  reading a different game's data.
* **The `arena*` modules in the twin** — and this is a trap worth naming. `world/arenaModel.js`,
  `world/arenaCity.js`, `scenes/arenaBouts.js` and the fifteen `systems/arena*.js` modules are
  **Daggerfall's colosseum**: Kamer's "Daggerfall Arena" mod, a gladiatorial pit in the middle
  of Daggerfall city. They have nothing to do with *The Elder Scrolls: Arena*, and nothing in
  this project should ever import one.

## 4. The rule that keeps the comparison honest

The twin's `@ts-check` headers cite the decision, the date and the person who asked for each
feature ("LW4 (2026-10-04, bible/06-Systems/Living-World.md)"). This project's convention is
different and deliberately so: **every claim in the code says where its numbers come from** —
`FORMATS.md` for a file format, a named source for a rule, "this project's own" for anything
invented (D5, D11, S20, S30 in `PROGRESS.md`). A port from the twin is cited as a port, with
the twin's file named, because the twin's law is a *source* in exactly the sense the rest of
this project means it.

The practical consequence: when a twin number is ported (the regard table is the example this
milestone added), the twin's number is kept **and** the port's own tests pin it
(`tests/unit/regard.test.mjs` asserts `talk` is worth 3 and that it counts once a day), so a
later change to either project shows up as a difference rather than as drift.

## 5. "Match the standard of Daggerfall MMO Online"

Said plainly, because it is the most ambitious item on the brief and the easiest to
misrepresent: **the twin has a real online game and this port has none.** `daggerfall/src/net/`
is 165 modules — presence, chat, a relay with per-room settings, accounts, parties, PvP
arenas, guilds, a shared market, and a save codec that carries a character's world between
machines. Nothing in `PERFECTARENA/src/` talks to a network, and the save is `localStorage`.

Three things are true at once:

1. **The shape is readable.** The twin's `net/online.js` states its own architecture in a
   paragraph: every player runs their own world from their own save, presence is shared, and
   a room's memory is the host's snapshot handed to whoever arrives. That is exactly the shape
   Arena's port would need — Arena's world *is* persistent and shared between players in the
   fiction (`CITYDATA.64` is the same 288 settlements for everybody), so a peer would be able
   to walk into the same Daggerfall.
2. **Nothing about this project blocks it.** The world is deterministic in a seed
   (`cityPlan`, `dungeonPlan`, `townsfolk`), which is what makes two players' worlds agree;
   the saves are plain JSON in one place (`game/save.js`); and the regard ledger added this
   milestone is already designed as "the world is shared, what one player changed in it is
   theirs" — the twin's own rule for its character-side data.
3. **It is a project of its own.** Tens of thousands of lines, a relay to host, accounts to
   hold, and a moderation surface. It is listed here as future work with its size stated,
   not as a feature that exists.

The honest milestone order if the brief's last clause is to be met: the *single-player* world
first (the ledger items in §3), because an online Arena whose towns are empty of people with
days, work and opinions would be a shared emptiness.
