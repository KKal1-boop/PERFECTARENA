# PARITY — against Arena (1994) and OpenTESArena

*What the original does, what the reference engine currently does, and where this port stands.
Measured on 2026-10-18; the OpenTESArena column is its own README and roadmap at release 0.18.0,
not a guess (sources at the foot).*

**How to read a cell.**

* **works** — a command in this repo produced the behaviour; the suite is named in the last column.
* **partial** — the system runs and a named piece is missing; the missing piece is written down.
* **absent** — not in this build, and said so.

---

## 1. The core loop

| Feature | Arena (original) | OpenTESArena 0.18 | PERFECTARENA | Verified by |
|---|---|---|---|---|
| Character creation | 8 races, 18 classes, 10 class questions, attribute rolls, starting kit | implemented **except the class-generation questions** (planned 0.19) | 10 `QUESTION.TXT` scenarios, 18 classes, 8 races, `d20` roll + `4d6` pool, health and kit from the class | `chargen` suite, `unit/chargen` |
| World map | the painted map of Tamriel, travel by clicking a location | **fast travel to any world-map location** works; automap notes/fog are roadmap | the same map drawn from the install's own pixels, **each settlement on its own pixel**, travel-time by distance, and the map is *permanent* — there is no map screen to "open" to find where you are, the world's grid is the map | `worldmap` suite, `unit/worldmap` |
| City generation | blocks assembled per city-state and seed | implemented (world generation "100%") | 36/36 block slots, deterministic per seed, every door derived from the block's own `.INF` | `city`, `probe:city` |
| Wilderness | the country around each city, climate by province | implemented | per-climate `.RMD` records, a 128×128 drawn country per settlement seed, the same ruin a dungeon exit returns to | `wilderness`, `unit/dungeonSurface` |
| Interiors and shops | 8 variants per shop family, keepers, services | interiors + buy/sell/rent/heal/cure; **bartering, repairing, spellmaking absent** | 8 variants per family, keeper behind the counter, shelf per level, haggle, services, the room's own census reported | `doors`, `gear`, `commerce` |
| Dungeons | 128 dungeon records, keys, stairs, triggers | starting/main-quest dungeon "minimum-playable"; quests absent | 128 records by seed, triggers, stairs, loot, monsters, doors, and the **exit to the country at the ruin** | `dungeonplay`, `unit/triggers` |
| NPCs | walkers, still folk, the watch, the court | citizens wander, talk, give directions (75%) | 65 `.CFA` walkers turned to face the eye, the still folk the `.INF` paints (innkeeper, smith, priest, wizard, king, watch), **province art indoors and out**, names from the corpus, regard | `townsfolk` 71/71, `unit/townsfolk` |
| Save / load | save slots, world state | **not implemented** (0%) | the character, the quest, the pending job, the regard ledger, looted cells and the world's own record survive the page loads travel is made of | `persist`, `mainquest` |
| Quests | the Staff of Chaos, ten stages, side jobs | **not implemented** (0%) | a **start menu** on Arena's title art, creation → the king's murder (`INTRO.FLC`) → the cell → Ria's explanation (`1400`, unmissable, once per save), the eight Staff pieces derived from `CITYDATA.64`, the ten-stage machine, **Arena's own script and speech for every beat** (the level-2 dream, a dream per piece, Tharn's answers with his minions arriving, the palace gate, the Jewel, the Emperor), five kinds of radiant job per town | `start` 11/11, `mainquest` 102/102, `menu` 39/39, `unit/quest`, `unit/storyscript` |

## 2. The fight

| Feature | Arena (original) | OpenTESArena 0.18 | PERFECTARENA | Verified by |
|---|---|---|---|---|
| Melee | 1d20 to hit, armour per area, materials, criticals, backstab | combat AI, XP and the original hit chance (75%) | to-hit, armour by area and material, criticals, backstab from the defender's own facing, six swing sheets | `combat` 37/37, `unit/combat` |
| Ranged | bows fire arrows that fly and land | bows fire arrows (added 0.18) | a shaft leaves the eye along the camera, dies on stone or in a body, wound rolled by the same law as a sword, **and it costs one arrow from the quiver** | `gear` 42/42, `unit/archery` |
| Weapons | 8 families including mace, flail, war axe, warhammer | equipment equips, use is partial | every family equips and draws from its own sheet, including the install's **original** flail (`STAR.CIF`) and bow (`ARROWHLF.CFA`), found in the executable's own filename table | `unit/weapon`, `gear` 43/43 |
| Magic | 50 spells, schools, spellmaking, enchantments | **spells not implemented** (10%; a "Test Spell" button) | all 50 decoded from `SPELLSG.65`, costs and refusals, damage/heal/ward/light/levitation flags, open/lock, silence, fear, poison, a **visible cast** (`magicBurst` motes per element) | `unit/spells`, `unit/combatfx`, `.scratch/probecast.mjs` |
| Monsters | 24 monster types + human enemies, class/level rolled | enemies attack and give XP/loot | the 24 the executable names, each on its sheet, human enemies with class and race, a fight that must **see** the player | `bestiary`, `unit/humans` |
| Potions | 15 potions, their own prices and doses | **potions not implemented** | 15 potions, prices and doses from `Arena:Potions` | `unit/items`, `gear` |

## 3. What this port has that neither reference ships

* **A persistent Tamriel.** The world map is not a screen the game opens to teleport: the player's
  position is a pixel on the same grid the cities were placed on, a journey is walked in days and
  hours, and the wilderness between two cities is the country around the nearer one.
* **The living world.** `livingWorld.js`: the hour decides which trades are open, who is on the
  street, what the watch is doing; a shut shop is shut, not a menu with a lock on it.
* **Regard and radiant work.** Talking, jobs, blows and killings move a per-person ledger, and the
  ledger changes what a person will say and do.
* **The province's look.** Architecture, ground, weather and **the people's own art** per province —
  the Khajiit from the snow wolf's repainted sheets, the Argonians from the Lizard Man's — chosen
  from the install's own bytes rather than authored.

## 4. Named gaps, unchanged by this pass

* **Passwall** says the stone is too thick and never opens it; **Levitate** is bought, cast and
  recorded, and nothing reads the flag yet.
* `BOW.CIF` and `FLAIL.CIF` are not in this install: the bow is drawn from `ARROWS.CIF` and the
  flail from `MACE.CIF`, both reported as stand-ins.
* A landed blow is a **blood spray**, not Arena's blood art; the fight's own cues are synthesized
  (the install ships no combat clips), and a monster closes and swings but does not think.
* **Spellmaking, enchanting and repairing** are built (a Mages Guild spellmaker and enchanter, a
  smith who quotes a turnaround and mends); their prices and durations are reconstructed, not the
  original's exact numbers.
* The main quest's **cinematics are assembled and speak**: every beat is the install's own words
  (`TEMPLATE.DAT`, `game/storyLines.js`), on the install's own face (`VISION.FLC` for Ria,
  `JAGAR.FLC` for Tharn), for the length of the install's own speech (`arena/storySpeech.js`),
  with those clips played under the picture. The order is UESP's: the cell's dream, the level-2
  Staff dream, a dream per piece at sleep, Tharn's answer at the next encounter, the palace gate,
  the Jewel's cry, and the Emperor's naming. The game opens on a **start menu** (Continue resumes
  the saved place, New Game is creation → the king's murder → the cell), and Ria's explanation of
  the betrayal is the save's own beat (`1400`), so skipping the start-up cards can never skip the
  story. The voice is read through **either door** — a
  player's picked folder or the dev server. **Tharn's minions arrive with his vision**, as the
  install's own words say they do: placed with the level's population, roused when the scene
  ends, and walking to the player. **Still partial:** the dreams' page breaks within a narration
  are approximated (the original's page timing is not recovered), and the number of minions is
  this project's (the executable's encounter table is not in this checkout).

---

### Sources for the OpenTESArena column

* README (status paragraph, feature list): <https://github.com/afritz1/OpenTESArena>
* Release 0.18.0 notes (enemy AI, bows firing, shop services, known issues):
  <https://github.com/afritz1/OpenTESArena/releases/tag/opentesarena-0.18.0>
* Roadmap percentages (world 100%, combat 75%, items 70%, spells 10%, NPCs 75%, quests 0%,
  cinematics 10%, save/load 0%): <https://github.com/afritz1/OpenTESArena/wiki>
* Release 0.16.0 (starting dungeon "minimum-playable", bows not firing):
  <https://github.com/afritz1/OpenTESArena/releases/tag/opentesarena-0.16.0>
