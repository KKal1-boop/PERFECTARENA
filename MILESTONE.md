# PERFECTARENA — THIS MILESTONE'S HAND-OFF

*The eleven upgrades of this work session, each with the check that holds it.*

---

## −6. Named monsters, and the backstab's law

The name corpus's two monster banks (the UESP leaves unnamed; the port's own reading,
content-pinned to UESP's samples — `Grol+an+tor` = Grolantor) now name the *enemies*:
a monster gains a proper name the first time the realm reads it (the HUD's nearest
line), from the corpus's own `-goth` tables, deterministically per body — and keeps it
for its life. The combat line reads `Grolantor — Goblin 4/4 · 1 m away`, verified on a
live page with the full-rule decode behind it (`unit/names.test.mjs` 6/6 including the
monster banks). The corpus's *mansion* bank rides one fragment deeper for a woman's name
(`Demogorgona`), the same generator split UESP's own XML shows.

The **backstab** is the Elden Ring axis's next law: a blow from behind lands half again
as hard — a *position*, not a roll (`combat.js`'s `fromBehind`; the strike computes it
from the defender's own recorded walk-facing, and a creature that never moved has no
backstab). Pinned by `unit/combat.test.mjs` (half again, kept on the result) and wired
into the strike path with `combat`+`actioncombat` 58/58 after it. Honest limit, stated:
a livePage flee-angle chase run is pending (ROADMAP §1) — a fleeing creature turning
its back mid-reach is geometry-flaky to stage from outside the sim.

---

## −5. The people have names (S30 closed from the sibling install)

Arena's own `NAMES.DAT` is `EMPTY`-padded save slots — the install ships no name corpus
at all, and a town's folk have been “a person in furs” since the port began. The
**sibling Daggerfall install** carries the generator: `NAMEGEN.DAT`. Its binary layout
was measured straight out of the bytes — one strings area, every slot 10 bytes,
stride-10 contiguous from 528 — so the whole corpus (11 banks, 56 sets, 785 fragments,
the Noble titles the file's own last word) is derived from the counts alone and
**verified against UESP's decoded XML**: pinned indices reproduce its samples exactly
(`Theod+istyr` = Theodistyr; `B+a+th+an` = Bathan; `Nebuch+iv+ezzar`).

`game/names.js` is that parser and the composer: per race (first name, then surname;
a Redguard four fragments deep; a Khajiit one; a noble titled), per climate (a desert's
folk are Redguards and Khajiit before Bretons, a jungle's mer before men), and
**deterministic per face** — the same stranger is the same name on every visit, the
same law the regard ledger keeps. The wiring rides the two placement seams already
there (street and room); the loader is once per page through the dev door, and a run
with no sibling install is nameless exactly as before.

**Verified:** `unit/names.test.mjs` 5/5 (all 56 sets, sample reproduction, the stride
law ending at the file's end, composition rules, foreign-file refusal) + `townsfolk`'s
new names-on-the-street check — 48/48 of a city's folk named, and the talk panel reads
`Mingina Mosswood — a person in robes` and `Solinar Gaeorin — a person in furs`.

---

## −4. The counter is a real counter: stock and a haggle (completing Phase B's tail)

A shop is now a place and a visit, not a mirror of the level's budget. `game/services.js`
holds both halves of it:

* **A shelf is a volume.** `stockFor` picks the place's own rows by seed — and the seed is
  the *door the player came in by* (`interior.js`'s `shopSeed`, which exposed the defect the
  fix removed: `current.index` is always 0 for a city's shops, so with it every store of a
  kind in town carried the same shelf). Each row carries a count of 1–3 that sells down; a
  quarter of visits (35%) carry one **Great Find** — the cheapest thing just past the
  level's budget, on the shelf for the visit the customer can finally pay for it.
* **The keeper haggles.** `haggleRoll`: three tries a visit; a win makes everything kinder
  (15%…) for the rest of the visit and a loss dearer (5%…); a third refusal closes the
  market — the Haggle buttons leave the panel with it. The factor rides `priceOf`'s existing
  regard scale, so a shop with feelings about the player can join it later unchanged.

The scene keeps the visit's ledger (`visitHaggle`, `stockTaken`) with `townWalk`'s own
declaration family — because the *first* `loadLevel` runs before later declarations exist,
the level-up's temporal-dead-zone mistake, caught again as a blank city page (and this time
in the browser before it shipped). A fresh door is a fresh visit: ledger and shelf both.

**Verified:** `unit/shops.test.mjs` 11/11 (seeded variance across two seeds, counts in
1–3, a find past the budget, three-tries-then-no-more, kinder-and-dearer); `commerce`
browser **25/25** — a page buys a row down to nothing (purse by the shelf's price, pack
keeps the lot), haggles three times with a real win and a real loss in the ledger, and
two equipment stores in one city show different shelves. The suite's fourth finding was
the harness's own: `clickSelector` trusted "in the viewport", and a panel that clips
(`#inventory`, `max-height: 78vh`) passed a button that no pointer could reach — the press
went through to the canvas and the shop never rang it up. `cdp.mjs` now probes with
`elementFromPoint` and scrolls until the press will land.

---

## −3. Ranged casters (completing Phase A)

The roster's casters — the ghost, the wraith, the homonculus, the fire daemon, the medusa,
the lich — now fight the way their own bestiary says they do: **they do not have to close**.
`game/ranged.js` is the half they own: a 4–12 m band (`castFootwork` — inside it a caster
walks *away* rather than stand in a warrior's lap), a cast whose telegraph is the melee
machinery's own wind-up, and a **bolt** fired from the caster's eye at the player's
*present* (no lead — a dart that leads its target denies the roll) that flies its own clock,
dies on a wall (the passage is the same ray the sight test trusts), and lands by the
melee fight's own rule (`resolveBolt`): a **roll dodges outright**, a **guard holds a
quarter through**, and a parry is honestly not a sword trick at magic — it answers as a
block. Caster bolts render in the combat-FX pass as crossed billboard sparks, and the seam
exposes casts, live bolts, bolt-ending counters and `lastBolt`.

**Verified:** `unit/ranged.test.mjs` 6/6 (bestiary join, ballistics, wall death, the
windows, the body, the band) + `actioncombat` browser **23/23** — a wraith holds its band
and its bolt is live in flight; a roll answers a mid-flight bolt with `lastBolt: dodged`.
Full units 385, `combat` 35/35, `doors` 41/41.

---

## −2. Foes read the guard; and the shop record corrected

A raised shield is now a *conversation*, not a damage filter: a **light** creature in
snapping distance does not press into the steel — it holds just outside the reach and
**drifts sideways** (`foeReadsGuard` → `circling` in the seam), deferring its blow while
the guard is fresh, and commits again once the patience (`BAIT_PATIENCE` 1.8 s) is spent
or the arm comes down. A **heavy** creature answers a guard with no regard at all — it
charges through, the same reason its blow is announced on the ground. Also swept the
stale commerce record: shops *do* trade (`game/services.js` — `shelfFor`/`buyItem`/
`sellItem`/`buySpell`/`templeService`/`rest` wired into the keeper panel with real gold),
so ROADMAP Phase B and PROGRESS's old "a shop sells nothing" (S34) now say what the
checks prove.

**Verified:** `unit/guardread.test.mjs` 4/4 (heavy charges through, light baits and
drifts, patience earned the swing) + `actioncombat` browser 20/20 (a guarded light
creature drifts at 0 attacks; guard down, the wind-up commits again) + `combat` 35/35
+ 379 unit tests green; `unit/shops.test.mjs` 9/9 for the trade itself.

---

## −1. Interiors are furnished (added last of all)

Every room family gets dressed in **Arena's own flat art** (`game/furnish.js`): the smith's
shelves and barrels, the tavern's tables and chairs, the college's bookshelves, the noble
house's bed and rare rug, the crypt's coffins and scattered bones — wall-huggers against a
solid neighbour, the heart of the room open for the floor kit, never within a cell of a
door, never doubling up a cell, capped below clutter, deterministic in the level's seed.
**Every dressed room is lit**: the sweep's first wall cell always takes the kit's torch,
which lights through the same `FIRE_ART` pass a dungeon already uses.

**Verified:** `tests/unit/furnish.test.mjs` 8/8 (kits, door clearance, wall-hugging,
determinism, caps) + `doors` browser 42/42 — *"a tavern is furnished: 32 kit props among
66 flats"* — and `living`/`scenevisuals`/`dungeonplay`/`generated`/`actioncombat`
116/116 (dungeons untouched: they match no interior family).

---

## 0. Poise, stagger, and hit-stop (added this session)

A landed wound now carries **weight**: every blow drains the creature's poise
(`poiseCost` = 0.6×damage, 1.1× for a riposte; `poiseMax` = 18 + 2×level — a rat is
felling-footed, a tyrant stubborn), and emptying it **staggers**: the committed attack
dies mid-windup (the telegraph with it), the body holds for `STAGGER_SECONDS` 0.9 s —
the player's opening — and poise refills exactly once on the break. The screen itself
**arrests** (`hitStop`): 0.12 s on a break, 0.08 s on any heavy, applied as a
*time dilation of the monsters only* while the player walks at full speed. The combat
seam gained `restoreStamina`, `heal`, a poise fixture on `prepareCombat`, and a
`staggers` counter; `prepareCombat` now makes a *fresh body* (breathing money refilled,
stagger released), which is what un-flaked the suite's own dodge check.

**Verified:** `tests/unit/poise.test.mjs` 5/5 + `actioncombat` browser 18/18 (a poise
break cancels the committed wind-up on a real page, with the screen arrested) +
`combat` 35/35 + 367 unit tests green.

---

## 1. The held heavy (souls core)

**What a player does:** hold the strike, release. A tap stays the light blow; a held
release lands at the charge's weight — 1.3× at the 0.18 s arm, scaling to **2.0×** at the
0.95 s full hold — capped there, and paid for from the same stamina bar (24 of the
average 30): the heavy and the dodge can no longer both be spammed. While the hold runs,
a thread of amber sparks announces it in front of the player, thickening as the charge
fills, with a one-beat "Heavy armed" notice at full charge. The heavy is always Arena's
overhead chop (`weaponView`'s `down`), with 1.6× the recovery. The model is pure
(`combatStyle.js` → `HEAVY` + `chargeScale`, S-labeled GUESSs sized against `DODGE` and
`PARRY`), and a hold the bar cannot pay for falls back to the light blow rather than
denying the swing.

**Verified:** `tests/unit/heavy.test.mjs` (4/4 — the thresholds, the climb, the cap, the
price) + `actioncombat` browser 16/16 — the bar pays 24 on a full hold
(`restoreStamina` seam added), a tap stays light, real clicks unchanged.

## 2. The camera has a body

A hold that lands — the player's heavy, a parry, a blow against the player, a monster's
charge — winds the view (`screenShake`, applied as a *view* perturbation in `paint`, never
touching the input's own yaw/pitch, decaying ~0.45 s). A blow you dodged moves nothing.

## 3. Streets that read as towns

Settlement crowds raised again, 26/16/10 → **48/28/14** (city/town/village), same seed
determinism, same one-person-per-cell and door-clearance rules. `townsfolk`+`living`
browser: 90/90.

## 4. The night has its own sky

The panorama is no longer the arrival hour's card all visit long:

* `arenaSky.js` composes a **night card per climate** (`CLIMATE_NIGHTS`: blue-black
  temperate, warm-horizon desert, cold mountain), with **stars written behind the
  clouds and the ridge** (deterministic in the seed, drowned under overcast) and the
  mountains/clouds dimmed to silhouettes (`NIGHT_DIM`).
* `interior.js` keys the composed panorama by `inf|seed|night`, and `maybeRecomposeSky`
  (once a second in the frame loop) recomposes when the living clock crosses dusk or dawn
  — decoded sky art is cached per archive (`skyArtCache`) so the switch is cheap.

**Verified:** `tests/unit/sky.test.mjs` 8/8 (night < 45 % of the day's mean luminance,
blue ≥ red, stars, per-climate) + `living`/`world`/`scenevisuals` browser 72/72.

---

**Regression state after this session:** 375 unit tests, `combat`+`actioncombat` 49/49,
`townsfolk`+`living` 90/90, `living`+`world`+`scenevisuals` 72/72 — 0 failures.
`docs/ROADMAP.md` §0 is the schematic master plan of what remains.
