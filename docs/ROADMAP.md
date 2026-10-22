# PERFECTARENA — Master Plan

*One file, schematic, no prose. Mission first, phases as territory, every claim pinned
to its check or honestly marked not done.*

**Mission.** The Elder Scrolls: Arena, whole — Tamriel with every city, wilderness,
people and the main quest — running on the sibling Daggerfall-Enhanced web engine
(`c:/arenaproject/daggerfall`), with combat that feels like `c:/arenaproject/browsergame`
(Elden Ring logic: telegraphs, dodges with i-frames, parry→riposte, charges announced on
the ground) and graphics that deserve the source material. The bar is Daggerfall
Enhanced plus real combat; the enemy is a superficial port.

**Status key.** `[x]` done and held by a passing check · `[~]` partly done, one sentence
says what is missing · `[ ]` not started. A `[x]` without a check is not done.

**Regression record** (`npm test` + `test:browser`, last runs 2026-10-17):
**677 unit passes, 0 failures** (exit 0); this pass's browser set: **`interior` 70/70** ·
`world` 36/36 · `movement`+`dungeonplay`+`actioncombat` 67/67 · `townsfolk` 71/71 ·
`gear` 30/30 · `bestiary` 10/10 · `combat` 37/37. `interior`'s two old reds — walking out of
deep water (D-65) and the first-person blade's line (D-66) — are closed in `DEFECTS.md`.
Earlier runs: `doors` 63/63 ·
`commerce` 25/25 · `guilds` 13/13 · `world` 36/36 · `persist` 14/14 · `townsfolk` 69/69 ·
`living` 46/46 · `automap` 13/13 · `menu` 39/39 · `mainquest` 62/62.

**The install, counted** (`node tools/assetcoverage.mjs`, this session): `GLOBAL.BSA`
holds **2 441 records / 16.4 MB** — 156 (6.4%) named whole in `src/`, 594 (24.3%) more
reachable through a *composed* name (`monsters.js` builds `${sprite}${view}.CFA`), so
**1 691 records are touched by no source either way**. Unread bytes by kind: `.voc`
10.0 MB (the speech bank: 175 loose + `SPEECH/`), `.img` 3.8 MB (946 full-screen
screens), `.set` 2.0 MB (180 tilesets), `.cfa` 1.5 MB (monster/NPC sheets), `.mif` 438 KB,
`.cif` 293 KB, `.dfa` 275 KB. The loose install adds 17 `.FLC` (20 MB of movies) and
2 `.COL`, 3 `.RCI`, 3 `.LGT`. **This is the honest remaining-port list**, and the tool is
how it stays honest.

---

## Phase table

| Phase | Territory | Status | Check |
|---|---|---|---|
| **A. Combat reads like a fight** | Telegraphs, dodge/parry/riposte, poise/stagger/hit-stop, held heavy, ranged casters, **the bestiary's own abilities** | **[~] core complete** — every one of UESP's 24 entries has its immunity floor, resistances, casters, holds, diseases and regeneration (`game/bestiary.js`, `docs/BESTIARY.md`); missing: lock-on, attack *cancellation*, human enemies, flight, per-creature loot | `actioncombat` 23/23 · `bestiary` 10/10 · `unit/ranged` 6/6 · `unit/bestiary` 11/11 · `unit/poise` · `unit/heavy` |
| **B. Streets that live** | Crowds, day plans, trading, regard | **[~]** — stock+haggle ✅, names ✅ (S30), the archive's own townsfolk families ✅ (`peopleKinds.js`: the men and women with walk/**talk**/die, the watch, `BABE0`/`PAT`/`LGLIT0`), **a province's own race on every figure ✅** (`raceSkin.js`: a palette ladder for the human races, the Lizard Man's whole figure for the Argonians), **the still folk ✅** (`staticFolk.js`: a palace's court, a tavern's patrons); missing: the **serving roles hold a post** (D-44 — a priest still walks 22 cells in 21 minutes), greetings per trade, people seen going indoors | `commerce` 25/25 · `living` 46/46 · `guilds` · `townsfolk` 69/69 · `unit/raceskin` · `unit/staticfolk` |
| **C. Interiors worth entering** | Furnishing, shops, houses | **[~]** — furnishing ✅; **every door is enterable at its own wall art** ✅ (D-51: 356 doors in Daggerfall, 294 of them homes, and 209 country doors over the 66 `.RMD` blocks; signs are decoration), and **every settlement is the size its own record names** ✅ (D-54: 72 cities on 6×6, 72 towns on 5×5, 144 villages on 4×4 — 71 648 painted doors over the world, 0 door-art wall cells left as wall); missing: multi-storey shops, per-family pixel judge | `doors` 63/63 · `unit/furnish.test.mjs` 8/8 · `unit/shops` 14/14 · `unit/mif` 27/27 · `unit/city` 10/10 · `audit` 26/26 |
| **D. The country is Tamriel** | Persistent wilderness, wild buildings | **[~]** — **one continuous Tamriel ✅** (`tamrielGrid.js`: 256 cells a pixel, `TERRAIN.IMG`'s coastline and biome, all 288 settlements on their own `CITYDATA` pixel, a gate walked through into the same country); missing: **a resident window** (a wilderness slide is still a scene re-boot, B25), enterable wild buildings, moving weather front | `world` 31/31 · `persist` 14/14 · `movement` 12/12 · `unit/tamrielgrid` · `wildfoot.test.mjs` |
| **E. The whole main quest** | 8 Staff pieces, palace, ending | **[x]** whole chain playable page-load to throne | `mainquest` |
| **F. Presentation parity** | Sky, sun, weather, fit-and-finish | **[~]** — night sky recompose ✅, **the install's own movies ✅** (see §5); missing: climate side-by-side judge, the 946 `.IMG` screens, the `.SET` tilesets, the speech bank | `scenevisuals` · `unit/sky.test.mjs` · `unit/cutscene.test.mjs` · `cutscene` 13/13 |
| **G. Navigation** | The map of the level, and the map of the world | **[x]** — **Arena's automap ✅** (`game/automap.js`, ported from OpenTESArena: its palette, its voxel law, its 8-direction 3×3 arrow, `PixelSize = 3`), the world map already ✅; **`M` is Tamriel everywhere** (the owner's correction), **`Tab`** is the level in a dungeon or a building, and the sheet has a world-map button | **`unit/automap` 15/15** · **`automap` 13/13** |

---

## 1. Combat — the Elden Ring axis (top priority)

- [x] Telegraphed attacks in world space: ground ring, filled by the windup clock,
  committed before the move. `actioncombat`.
- [x] Charges announced on the ground, unguardable — dodge or read it. `actioncombat`.
- [x] Dodge `Q` with directional i-frames and a stamina cost. `actioncombat`.
- [x] Parry `B` in a timed window → bounded riposte window → guaranteed damage. `actioncombat`.
- [x] Bounded particles (≤192) on hits/parries; screen shake on wound; hit-stop by sim
  dilation. `unit/poise.test.mjs` + `actioncombat`.
- [x] **Control magic that the fight obeys**: Silence stops a caster throwing, fear sends a
  creature running, poison/disease take a point a second, Spell Shield eats a bolt, and
  Shalidor's Mirror turns one back on its caster. `bestiary` 10/10.
- [x] Held heavy: 1.3×–2.0× charge, amber thread announces it, paid from the same bar a
  roll pays into. `unit/heavy.test.mjs` + `actioncombat` 16/16.
- [x] Poise/stagger: a break drops the committed windup, 0.9 s opening. `unit/poise.test.mjs`.
- [x] A creature pays stamina for its own blows; spent monsters cannot commit; the wounded
  light ones flee. `combatstyle.guard.test.mjs`.
- [~] **Foes read the player's guard** — holds landed, chapter notes recorded; complete the
  seam read (`foeReadsGuard`) into the melee AI's own commitment.
- [~] **Backstab** — the law is pinned (`unit/combat.test.mjs`: a blow from behind lands half again as hard, the position kept on the result) and wired into the strike (the defender's own walk-facing decides it; the notice says “A backstab — landed before the turn.”). Still pending: a live flee-angle chase run on a page — the natural case, a fleeing creature turning its back mid-reach, is geometry-flaky to stage from outside the sim.
- [ ] **Exhaustion**: a bare bar makes the guard give way with a real recovery debt.
- [ ] **Lock-on** (Tab cycle target, camera bias) — browsergame's `combatTargetValid` is the model.
- [ ] **Attack cancellation by a landed counter** — a stagger should cancel, it currently
  drops the telegraph only.
- [ ] **First-person weapon in the GL UI pass, not a 2D layer** (the last visual gap vs the engine).

## 1b. The equipment, whole

- [x] **Every weapon Arena makes, in every metal** (UESP's 18 bases and the **four** bodily
  attacks — punch, leather, chain and plate gauntlets — crossed with the eight materials):
  a smith's shelf can show an Ebony Longsword, and equipping one sets the base and the metal
  together. **166 weapon rows** (22 bases + 144 forged), after the audit found leather
  gauntlets missing. `unit/items` · `unit/combat` · `gear`.
- [x] **Every armour piece and shield** (UESP's **seven** slots — helm, left and right
  pauldron, cuirass, gauntlets, greaves, boots — in leather, chain and the eight plate
  metals, and four shield types in every metal). 77 armour rows and 36 shields, all wearable.
  **And they protect**: UESP's rating is spent per body area (`armour.js` — a hit-location
  roll, the piece's own coverage, the shield's own reach), so a cuirass covers the chest and
  a tower shield reaches the head. `unit/armour` · `gear` 34/34. D-68 closed.
- [x] **Every weapon family usable, including the two the archive does not draw** (D-71):
  a **bow looses an arrow** now — `src/game/archery.js` flies it from the crosshair, `CombatFx`
  draws the shaft, and the wound is the fight's own `resolveAttack` at the moment it lands, so
  a silver arrow doubles at a vampire and an iron one is refused by an iron golem exactly as a
  sword's is. The **flail** is drawn from `MACE.CIF`, a documented stand-in (`weaponView.js`'s
  `WEAPON_SHEET_STAND_INS`, printed in the HUD), because this install ships six of Arena's
  eight sheets — and the bow **has its animation**: `weaponView.js`'s `ARROW_STATES` draws the
  shot from the install's own `ARROWS.CIF` (its nine frames sit on Arena's screen in a measured
  3×3 grid, and the centre column is the arrow leaving). `unit/archery` 7/7 · `unit/weapon` 13/13 ·
  `gear` **41/41** (603 pixels of arrow on screen, `state firing`, `frame 7`) · `combat` 37/37.
- [x] **Human Enemies** — UESP's second bestiary section: any of the **18 classes** and
  **8 races** (`character.js`'s own tables, abilities included), a quest dungeon's at the
  player's exact level and a group's one lower, `Exp: 25×(level−1)²`, and the page's loot
  line (1–50 gold, the four-piece set with a 10%/level better grade, pauldrons after 6 and
  11, helm after 16, a 3% rare weapon, a shield with a one-handed one). `src/game/humans.js`,
  `unit/humans` 11/11, `bestiary` 17/17. D-67 closed.
- [x] **Every potion Arena has, at Arena's own prices** (UESP's fifteen: Healing, Heal True,
  Restore Power, Stamina, Purification, Free Action, Cure Poison, Cure Disease, Levitation,
  Invisibility, Strength, Resist Fire/Cold/Shock/Poison). The three invented ones are gone;
  the retired id an old save may name still heals (`items.js`'s `RETIRED_IDS`). The audit
  replaced the invented prices and three doses with the page's (25 … 500; Heal 56, Heal True
  117, Restore Power 25, Strength +15, Purification 100 + Sanctuary) — D-70.
- [x] **Every spell in the Known Spellbook** — UESP's **50** named spells, joined to the
  install's own `SPELLSG.65` records (`spells.js`'s `MEANINGS`; the file spells one of them
  `Gods' Fire`), each with an effect the scene carries out. `[~]` the caster levels UESP does not print are this project's stand-ins
  (inert data; marked RECONSTRUCTED in `bestiary.js`).
- [x] **A metal's two ends** (UESP: iron is 0 / −2, elven…ebony +1…+5; silver doubles at a
  vampire and is the vampire's own exception to the ladder). The fight, the panel and the
  shelf print the same range.

## 2. Dungeons stay coherent

- [x] Wall texture orientation all faces; `.DFA` animated fixtures; loot pays once and
  persists; locked doors have reachable keys; rest refuses visible enemies; arrival
  reachable; sealed boundary. Checks: `mif`, `dfa`, `dungeonplay`, `doors`, `generated`.
- [~] Replayability: respawns + persistence live; the decoded `*TRIG` cells do their own
  work now (prose + the level's `@SOUND` clip, step-gated); no trap placement independent
  of the map.
- [ ] **Traps that hurt** — the decoded `*TRIG` voxels are the seam (their sound half is
  wired; the damaging kinds are not identified in the data yet).
- [ ] **Dungeon quest-objectives re-populate on later visits** (bounty re-runs).

## 3. The world stays lived-in

- [x] Invariant walker pace, camera-facing figures, collision; regard ledger with
  hand-in payment; the town turns on a killer. `townsfolk` · `regard`.
- [x] Guilds as a save: rank/title/probation, standing earned by real completed jobs,
  guildhall keeper invitation. `guilds`.
- [x] Trading: shelf per trade, buy/sell/spells/temple/rest real gold. `gear`.
- [x] **The counter is real** (this session): per-shop stock by entered door, rows that
  sell down, Great Find, three-try haggle. `commerce` 25/25 · `unit/shops.test.mjs` 11/11.
- [x] **Every door painted on a wall is enterable — in the city and in the country** (D-51, this pass): the door is the wall's
  own art (`T_DEQ`, `T_DTAV`, `T_DBS1..3`, `T_DNB1`), bound by the `.INF`'s `*MENU` table as
  OpenTESArena's `tryMakeVoxelTransitionDefGenInfo` reads it; the hanging signs the blocks draw
  are decoration. 3 925 wall doors in the 368 blocks; Daggerfall 421 (345 houses, 23 equipment,
  19 taverns, 5 temples, 1 Mages Guild, 28 noble); `E` on the paving in front opens, and leaving
  returns to that paving. The palace is one marked house door. `doors` 49/49 · `unit/shops` 11/11.
- [x] **The archive's own townsfolk, not only its fighters** (this session): the roster
  matched the 89 armoured `xxNNNWLK` files and nothing else, so a town held only figures in
  armour — the reported "we ported the moving NPCs and are missing assets because of that".
  `game/peopleKinds.js` reads the families the listing also carries, by name and by the
  widths of their own bytes: `MLGEN0<set><W|T|D>` (the town's men — walk 9 frames/52 px,
  **talk** 9/43, die 9/41), `FMGEN[W|D]?0<set>` (the women, same three actions), `GUARD0#`
  (the watch: 12-frame view sheets + a 3-frame death), and the `BABE0`/`PAT`/`LGLIT0` sets —
  14 families, every file verified present in `GLOBAL.BSA`. The port draws the **talk**
  sheet while the player is speaking to somebody and the **die** sheet when one falls (a
  killing is now seen; the body used to be deleted on the frame its health hit zero).
  Checks: `unit/peoplekinds.test.mjs` 3/3 + `townsfolk`'s roster and talk-art checks.
- [~] People go indoors — plan says so, no home has a recorded door to be *seen* through.
- [~] Exits *out* of a building to `back` work; deep interiors' second floors and below
  are next (multi-storey shops are C's tail).
- [x] **Names for people** (S30 closed): the sibling install's `NAMEGEN.DAT` decoded,
  stride-law-verified against UESP's own decoded XML samples, composed per race and
  climate, and deterministic per face — a person keeps their name on every visit. The
  corpus also carries the noble and two monster-name banks for what comes next. Checks:
  `unit/names.test.mjs` 5/5 + `townsfolk`'s names-on-the-street check (48/48 named,
  "Solinar Gaeorin" on the panel).
- [x] **A province's own people, on the street** (`game/raceSkin.js`, D-45): the names were the province's since S30; the **race** is now too. A palette race is Arena's own body under a six-entry skin ladder written over `PAL.COL`'s skin entries only; an **Argonian is the Lizard Man's whole figure** (`RACE_FIGURE`), because that is the race's art the install really ships, not a green human. Measured: Lilmoth 92% Argonian, Necrom 67% Dark Elf, Daggerfall 58% Breton, 48/48 carrying a race. `unit/raceskin` · `townsfolk` 69/69.
- [x] **The still folk and the court** (`game/staticFolk.js`): a palace holds `KING`/`QUEEN`/`PRINCE`/`PRINCESS` as painted figures, and a tavern holds `MAN01…04`/`WOMAN01…04` as its patrons — the art nobody had placed. `living`'s still-patrons check.
- [x] **The serving roles hold their post** (D-44): `livingWorld.js`'s `POST_ACTIVITIES` (`openShop`, `work`, `worship`) marks the goal `post`, and `stepTownsfolk` holds that person for the block's own length **without** `atHome` — the priest, vendor and wizard stand where Arena puts them and are still drawn. Measured before: a priest visited 22 cells in 21 minutes; on a page now a post holds through 12 samples and stays outside. `living` 46/46 · `unit/livingworld`.
- [ ] **Arrival greetings per trade** (S33's tail).

## 4. The country is Tamriel

- [x] All 144 dungeon records reachable (16 shipped `.MIF`, 128 assembled). `radiant` · `dungeonplan.test.mjs`.
- [x] 8 Staff pieces derived from world data; palace + ending. `mainquest`.
- [x] Outdoor persistence: absolute wilderness cell saved, gate crossings land right. `wildfoot.test.mjs`.
- [x] **One continuous Tamriel** (`game/tamrielGrid.js`): 256 cells to a world-map pixel, the coastline and biome from `TERRAIN.IMG`, every one of the 288 settlements on its own `CITYDATA` pixel, and a gate that is **walked through** into the same country rather than a page of its own. A town's wall is now the distance the map always drew it at, and the country outside Daggerfall is not Daggerfall's private wilderness. `unit/tamrielgrid` · `movement` 12/12 · `world` 31/31.
- [~] **A resident country** (B25): the window still **re-boots the page** once per 64 cells (~160 m, ~20 s of walking). The slide is the original's own mechanism; the cost is that it is a new page. Next: time one `goInPlace`, then shift the window in place. `persist` 14/14.
- [~] `.RMD` country decoded enough to draw, not the original's field layout — keep the
  window honest and say so.
- [ ] **Enterable wild buildings** (D's tail).
- [ ] **Moving weather front** across a journey.
- [ ] Daedra artifact quests as artifacts on a shelf.

## 5. Presentation + parity

- [x] **Arena's automap** (`game/automap.js` + `scenes/automap.js`, B21, ported from OpenTESArena's `AutomapUiMVC`): **`Tab`** inside a dungeon, a shop, a guildhall or the palace draws the level in the game's own automap palette — wall, raised, door, up-stair, down-stair, dry/wet/lava chasm — with the reference's eight 3×3 player arrows and `PixelSize = 3`. **`M` stays Tamriel from everywhere**, and the sheet carries its own world-map button. `unit/automap` 15/15 · `automap` 13/13.

- [x] Night sky per climate with stars, dusk/dawn recompose. `unit/sky.test.mjs`.
- [x] The landscape measured (three-storey trees by species). `flats.test.mjs`.
- [x] **The install's own cutscenes** (this session): the FLIC reader that shipped with the
  vendored engine had **never been called**. `game/cutscene.js` is the catalogue (15 `.FLC`s,
  each with the beat this project plays it at) plus a cursor loader over `FlcFile`, and
  `scenes/cutscenePlayer.js` plays one on a whole-number-scaled 320×200 sheet on the file's
  **own** frame delay, skipping on any key or click — *including while the file is still
  arriving* (the skip used to be attached after the fetch, so a key pressed in that window was
  thrown away: caught by the main quest's own vision). Wired: `?cutscene[=NAME]` dev door,
  the opening (`INTRO.FLC`, once per session, when a person starts the game), the vision on
  the escape (`VISION.FLC`) and the closing movie before the ending page (`END01.FLC` — which
  used to say, in its own words, "the cutscene itself (END01.FLC) is not decoded"). While a
  movie plays the world is **held still** (`life.paused`) and the world's input is suspended,
  so the click that skips a cutscene cannot also swing a sword. Checks:
  `unit/cutscene.test.mjs` 5/5 (header, frame count, the file's own pacing, the RGBA
  unpacking, an honest refusal) · `cutscene` 14/14 (played on screen, frames advancing on
  their own clock, the art as pixels, ends itself, key-skip, the arrival-window skip, refusal
  without a console error) · `mainquest`'s own four movie checks (the vision and the ending).
- [x] **The sound bank reads whole** (this session): the `.VOC` reader's block table was
  wrong where it had never been exercised — `0x06` read as a *terminator* and `0x07` as
  *silence* — so `DRUMS.VOC`, the one clip in the install that is a **ten-times repeat**, was
  refused outright and the level whose `@SOUND` names it was silent. The arms are now the
  format's own (`0x00` terminator, `0x02` continue, `0x03` silence, `0x06`/`0x07` the repeat
  pair, `0x08` extended, `0x09` new-format), and **all 251 clips the install ships decode**
  (76 in `GLOBAL.BSA`, 2 loose, 173 in `SPEECH/`), measured by
  `unit/voc.test.mjs`'s own walk of the archive.
- [x] **The trigger law, corrected at both ends** (this session): a level load **clears** the
  sound cooldown instead of stamping it with `dbg.seconds` — the stamp read "0.9 s since the
  last clip" on a page's first level and swallowed every level's opening trigger — and the
  suite's own walk-in faced the *offset it found the neighbour by* instead of the walk
  direction, so it walked away from the cell it meant to enter (measured: `(76,6)` → `(76,4)`,
  nothing fired). Both fixed, and the no-second-fire check is now a second **real step**
  rather than a teleport. `interior` 70/70.
- [~] **Audio** — the install's own greeting decoded from its Creative `.VOC`
  (`arena/vocFile.js`) and **played on a page**: 18 277 samples at its own 8 000 Hz,
  one buffer, `window.debug.fanfare(): played: true` (`unit/voc.test.mjs` 4/4 pins the
  header, block walk, rate and lead-in against the file's own bytes; autoplay law
  honored with a first-gesture resume). **`*TRIG` semantics pinned** (OpenTESArena's
  own sources: `ArenaTypes.h`/`MIFFile.cpp`, and `INFFile.cpp` for the resolution): each
  trigger's 4 bytes are `x, y,` then **signed** bytes — `textIndex` a `*TEXT` ID in the
  level's own `.INF` (lore, riddle or key data; a leading `~` marks once-only),
  `soundIndex` an `@SOUND` ID resolving to a `.VOC` filename in the same `.INF`.
  **Wired, both halves** (`game/levelTriggers.js` + `game/trigSound.js`): the level's own
  clips are fetched through the dev door's `GLOBAL.BSA` fallback (most `@SOUND` files are
  archive members; only the fanfares are loose), decoded once per filename and played as
  one-shots, and a trigger's prose goes on the notice bar in the original's own words —
  41 cells on `39300577.MIF`'s first hall, 1 436 across the 42 MIFs that carry `.TRIG`,
  pinned against `halls1.inf`'s bytes (`unit/triggers.test.mjs` 4/4). **A walk-onto is a
  step, not an arrival**: the clip is silent on the frame a level loads and on every
  teleport (the walk cycle's own law — a step is up to two cells, a teleport is several at
  once), one clip per cell per visit, and 2 s apart (`TRIGGER_SOUND_COOLDOWN`) — the
  reported **"I hear randomly the level up sound in my computer"** was this firing on the
  spawn frame and on every `warp`. **Both ends of that report are now fixed and pinned**: the
  third cause was the *settle stamp* on the cooldown (see §5) and the fourth was the
  **fanfare** — `FANFARE1.VOC` is a triumph sting, it was asked for once per *page*, and a
  page here is a level, so every town, dungeon and wilderness window greeted the player
  again; it is now once per **session** (`sessionStorage`), like a real program start. Still
  ahead: the speech bank (10 MB of `.VOC` under `SPEECH/` and in the archive), swimming,
  climbing, fall damage, the remaining sound set (`MINO*.CFA`'s voices), and the `.IMG`
  screens the port still draws with its own DOM panels.

## 6. Engineering

- [x] GL payload disposal on every level swap; bounded FX pools; reward idempotence.
- [x] **Module gate** (`unit/modules.test.mjs`): every module under `src/` parses (`node --check`),
  every static import and re-export resolves to a file, no bare dependency is imported, every
  module imports in bare Node, and `src/main.js` is still the one module `index.html` boots.
  4/4, mutation-checked 2026-10-15: a missing import and a syntax error each turn it red. This is
  the guard against the failure this repo has paid for twice — a name used before it was declared
  and a TDZ page that only a human opening the browser could see.
- [~] `typecheck` (`tsc --noEmit`) — best structural addition left.
- [ ] Texture atlas iff the 45-material city blocks become the draw-call ceiling (D14).

## How to work this list

1. One item at a time; name the check before writing code.
2. Prove it on the real page, not only in unit tests.
3. Tick only when the check passes. Re-run `npm run check` after changes.
4. No cheap fixes: a failing check is a fact about the game, fixed at its cause.
