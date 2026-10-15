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

**Regression record** (`npm test` + `test:browser`, last runs 2026-10-15):
**412 unit passes, 0 failures** (exit 0); `interior` 70/70 · `mainquest` 62/62 ·
`cutscene` 14/14 (`interior`+`cutscene` 84/84 together) · earlier this session: last full browser set
713/714 (the one wobble passes in isolation); `commerce` 25/25; `actioncombat`
23/23; `guilds` 35/35 combined.

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
| **A. Combat reads like a fight** | Telegraphs, dodge/parry/riposte, poise/stagger/hit-stop, held heavy, ranged casters | **[~] core complete** — missing: lock-on, attack *cancellation* by a landed counter, backstab, combo strings, exhaustion | `actioncombat` 23/23 · `unit/ranged.test.mjs` 6/6 · `unit/poise.test.mjs` · `unit/heavy.test.mjs` |
| **B. Streets that live** | Crowds, day plans, trading, regard | **[~]** — stock+haggle ✅, names ✅ (S30), the archive's own townsfolk families ✅ (`peopleKinds.js`: the men and women with walk/**talk**/die, the watch, `BABE0`/`PAT`/`LGLIT0`); missing: greetings per trade, people seen going indoors | `commerce` 25/25 · `living` · `guilds` · `townsfolk` · `unit/peoplekinds.test.mjs` 3/3 |
| **C. Interiors worth entering** | Furnishing, shops, houses | **[~]** — furnishing ✅; missing: multi-storey shops, per-family pixel judge | `doors` · `unit/furnish.test.mjs` 8/8 |
| **D. The country is Tamriel** | Persistent wilderness, wild buildings | **[~]** — persistent wild cell ✅; missing: enterable wild buildings, moving weather front | `world` · `wildfoot.test.mjs` |
| **E. The whole main quest** | 8 Staff pieces, palace, ending | **[x]** whole chain playable page-load to throne | `mainquest` |
| **F. Presentation parity** | Sky, sun, weather, fit-and-finish | **[~]** — night sky recompose ✅, **the install's own movies ✅** (see §5); missing: climate side-by-side judge, the 946 `.IMG` screens, the `.SET` tilesets, the speech bank | `scenevisuals` · `unit/sky.test.mjs` · `unit/cutscene.test.mjs` · `cutscene` 13/13 |

---

## 1. Combat — the Elden Ring axis (top priority)

- [x] Telegraphed attacks in world space: ground ring, filled by the windup clock,
  committed before the move. `actioncombat`.
- [x] Charges announced on the ground, unguardable — dodge or read it. `actioncombat`.
- [x] Dodge `Q` with directional i-frames and a stamina cost. `actioncombat`.
- [x] Parry `B` in a timed window → bounded riposte window → guaranteed damage. `actioncombat`.
- [x] Bounded particles (≤192) on hits/parries; screen shake on wound; hit-stop by sim
  dilation. `unit/poise.test.mjs` + `actioncombat`.
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
- [ ] **Arrival greetings per trade** (S33's tail).

## 4. The country is Tamriel

- [x] All 144 dungeon records reachable (16 shipped `.MIF`, 128 assembled). `radiant` · `dungeonplan.test.mjs`.
- [x] 8 Staff pieces derived from world data; palace + ending. `mainquest`.
- [x] Outdoor persistence: absolute wilderness cell saved, gate crossings land right. `wildfoot.test.mjs`.
- [~] `.RMD` country decoded enough to draw, not the original's field layout — keep the
  window honest and say so.
- [ ] **Enterable wild buildings** (D's tail).
- [ ] **Moving weather front** across a journey.
- [ ] Daedra artifact quests as artifacts on a shelf.

## 5. Presentation + parity

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
