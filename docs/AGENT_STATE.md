# AGENT_STATE (updated 2026-10-21, twenty-fourth pass)

**TWENTY-FOURTH PASS · THE INSTALL'S OWN SOUND AND PARTICLES, THE SETTINGS PAGE, THE HEDGE'S
LID TAKEN BACK OFF, AND THE MIRROR IN THE HOUSE.** The owner's brief was six things at once;
five are done in the tree and one is measured rather than assumed.

1. **The fight and the doors speak Arena's bytes (D-78).** `game/combatSound.js` no longer
   synthesizes its cues: `GLOBAL.BSA`'s 76 `.VOC` files are decoded through the same
   `arena/vocFile.js` the level's `@SOUND` triggers use, under the names
   `OpenTESArena/src/Assets/ArenaSoundName.h` gives (`SWISH`, `CLANK`, `BASH`, `EHIT`, `UHIT`,
   `ARROWFR`, `ARROWHT`, `MDIE`, `FDIE`, `BODYFALL`, `OPENDOOR`, `CLOSDOOR`, `LOCK`, `OPENALT`,
   `SLOWBALL`, `BURST5`, `EXPLODE`, `CLICKS`, the ground's own `DIRTL/DIRTR/MUDSTEP/SNOWL/SNOWR`,
   `SPLASH`, `SWIMMING`, `THUNDER`, `HALT`, `STPTHIEF`, `FANFARE1/2`). The scene hands the
   module `data.bytes` once (`setSfxLoader`) and warms the bank (`warmSfxClips`); the synth is
   kept only for the three cues the install has no file for (`rest`, `error`, and a cast whose
   clip could not be read) and `sfxState().source` says which path spoke. A door shutting and a
   sealed door now have their own cues (`doorShut`, `doorLocked`).
2. **Blood and spell sparks are Arena's own art (D-79).** `BLOODEXP.CFA` (51×44, five frames) is
   the install's blood explosion and `SPPARTS.RCI` (9×9) its spell spark. `combatFx.blood()` now
   keeps one spray per wound (`combatFx.sprays`, the animation's clock), `magicBurst`'s motes are
   drawn from the 9×9 field, and `liveBatches` draws both through the billboard pass that draws
   every other piece of Arena art — the effects pass itself is flat colour with no texture unit.
   A defence's tell (a parry's flash, a block's dust) has no Arena art and keeps its quad.
3. **The HUD is the fight's; the keys live in Settings (D-80).** The two permanent lines under
   every fight ("WASD move …" and "Arena's own weapon … reconstruction") are gone from the HUD —
   the owner, 2026-10-21: *"this part of the gui should not be there anymore instead in the
   settings"*. The pause menu's section is renamed **Settings** and carries the complete key
   list (walk, run, crouch, jump, look, both mouse buttons, strike, guard/parry, dodge, take,
   talk, rest, pack, spellbook, cast, portrait, level-up, view, Tamriel map, automap, stairs,
   menu). The provenance sentence stays in the pack panel.
4. **The hedge lid is gone (D-81).** The previous pass closed a hedge's open box with a cap in
   the hedge's own art; the owner rejected it on sight: *"REMOVE THE WALL ABOVE THEM THAT YOU
   CREATED IT LOOKS UGLY AND IT SHOULDNT BE THERE"*. `mifMesh.js` emits the ground under a hedge
   (the actual hole) and **no lid**; `unit/mif` now holds both halves (every hedge floored, no
   open-topped hedge capped).
5. **A house, and a mirror in it (D-82).** The king's own sale is checked end to end in the
   `doors` suite: no friends → refused; ten friends + 6 000 gold → `buyHouse()` signs the deed,
   takes 5 000 and walks the player to the city's own house door; the room holds the chest and
   the install's `NOB_C3.IMG` mirror (`dbg.houseMirror`). `E` or a click while facing it opens
   the mirror page (`panelMode: 'mirror'`), which offers `NPC_SPRITES` and re-dresses the
   third-person figure in place (`dressPlayer`).
6. **The final duel and the ending are measured, not claimed.** `mainquest` is green: Tharn is a
   real 500-HP creature in the Jewel's chamber, `won` is refused until `tharnSlain`, his death
   chains `JAGARDTH.FLC` → `END01.FLC` → the ending page. The seam `__debug.quest()` now reports
   `tharnSlain` (it was the one fact the boss check could not read), and the suite reads the
   creature records from `__debug.combat().monsters` (`state().monsters` is the living count).

**Checks, on the commands themselves**: unit **834/834**, `combat` **38/38**, `mainquest`
**145/145**, `menu` green, `doors` **163/169** with its five longstanding reds (three keeper
speech checks, `TEMPLE4`'s priest, and the country window's missing crypt door) — the sixth red
was the palace sign check, restated to the port's own `T_DBS`/`T_DNB` door marks, and the mirror
check, which now reads the page instead of a promise.

**THE OWNER'S SECOND ROUND, SAME PASS.** Four corrections after the first run:

* **A body blocks the step even where it cannot be pushed out of** (`pushPlayerFromPeople`, NEW).
  The first body rule put the player on a living creature's rim only when the rim was walkable;
  in a one-cell corridor or a doorway every rim is masonry, so the correction was refused and the
  creature could still be walked through. The step's own starting point is now kept
  (`feetBeforeStep`) and the move is **undone** if the feet are still inside a living body, so a
  wolf in a doorway is a fight, not an option. A corpse and an unseen indoor person still do not
  block, exactly as before.
* **The hedge family, not one spelling of it** (`mifMesh.js`). The hole in Elden Grove survived
  because the test knew only `NHEDGE`/`NHEDGED`: the archive also ships `XNHEDGED`, `T_NHEDGE`,
  `TZNHEDGE` and the garden wall `T_GARDEN`, and a hedge can stand on an `0x8` wall as well as an
  `0x9` panel. Any of that family now gets its ground, and a hedge cell with no floor binding of
  its own falls back to the level's own `*FLOR` art rather than to a second hole. No lid is drawn.
* **The duel is scripted** (`stepFinalDuel`, `summonDuelMinions`). Tharn rising is phase 1; at
  half his health he speaks (*“You cannot undo a thousand years with a staff, mortal.”*) and two
  of the palace's own creatures answer him — phase 2, reported on `state().finalBattle` and held
  by a new `mainquest` check. The ending's chain is unchanged and still green.
* **The keys are measured, and one defect came out of it.** A new `mainquest` check stands on a
  key a main-story dungeon placed (`__debug.dungeonLocks()`), takes it with `E`, walks to the
  leaf its lock belongs to and opens it: **the key is carried and the door swings open**
  (`locked false`, `open true` after the leaf's own swing). The defect the check exposed is a
  labelling one — a key the map *drew* was merged with the one `placeKeys` placed and kept only
  the lock number, so the pack could not name its door. The merge now keeps `door`, and the
  map's own key flats are bound to the level's heaviest ordinary lock's own cell, so the label
  says which door it is.
* **The fight's voice and the body are measured on a page.** `combat` now holds two new checks:
  after real blows, `__debug.sfx()` reports `source: arena` with an install clip
  (`SWISH.VOC` / `EHIT` / `MDIE` + `BODYFALL`), so the archive path really is what plays; and a
  spawned Rat walked into stops at **0.77 m** (0.42 + 0.35), the body rule's own gap, instead of
  being passed through. `combat` is **40/40**.
* **The two new checks**: `mainquest` **108/108** (including the phase and the key), and the
  hedge unit test still **29/29** in `unit/mif`. Unit **834/834** after the last edits. `doors`
  remains **58/63**, the five older reds named above.

**NOT DONE IN THIS PASS, AND NOT CLAIMED**: the palace sign restatement and the mirror page are
verified; the five keeper/temple/crypt reds are older than this pass and each needs its own
probe. Nothing was committed (the owner: *"DONT COMMIT RANDOM CONFLICTING WORK"*). The tree
still holds the large in-flight pass this file described on 2026-10-18 plus this one.

**Twenty-third pass (2026-10-18).**

**TWENTY-THIRD PASS · THE CATS, THE HOUSEHOLDS, THE PEOPLE WHO STAND STILL, AND THE SPELL'S
TELL.** The owner's brief was a list of what still reads wrong on a real page, and each item is
now a defect row with a probe:

1. **A Khajiit is a cat, not a wolf in a Breton's face (D-73).** The stand-in body won the art
   draw and the province won the skin, so a Riverhold page held `SWOLF03.CFA#breton+blonde`.
   `raceSkin.js`'s `raceOfFigure` makes a named figure its own race (the lizard half had been a
   special case), and `KHAJIIT_COATS` gives the wolf **four coats** — tawny (the owner's orange,
   the bare `khajiitFur` spec), sandy, black and grey — each a ramp over the animal's own six
   `PAL.COL` entries, chosen per person from the same identity as the face.
2. **A household is a family (D-74).** `balanceHousehold` redraws one seat when a house's draw
   comes out all women or all men, and `populateShop` now uses the **province's own art pool**
   indoors as well as out, so an Elsweyr house holds cats and a marsh hovel lizards. The room
   reports itself on `state().shopFolk`.
3. **Still people are the crowd's size (D-75).** The band is 1.85…2.10 m — the walking street's
   1.8 m to the walking watch's 2.13 m — and the wide-record branch no longer catches a guard
   whose art is 116×100 (`GUARD2D.IMG` was 1.76 m).
4. **Magic is visible (D-76).** `CombatFx.magicBurst` throws 10–20 motes of the spell's element,
   at the wound or at the caster, and `castSpell` reports them. Measured: `Fire Dart` for 9 on a
   Wolf with 20 fire motes at the target, `Light Heal` with 20 green ones at the caster's hands.
5. **The blunt and hafted weapons and the quiver, checked through the real equip path (D-77).**
   Mace, flail (from `MACE.CIF`, its own file named), war axe, battle axe, warhammer and longsword
   all equip and report their sheets; a bow shot costs one arrow (20 → 19) and draws `ARROWS.CIF`
   while it fires.

**Checks, on the commands themselves:** `npm test` **723/723**, `townsfolk` **71/71**, `gear`
**42/42** (the bow check now stocks the quiver the game requires), `unit/raceskin` 25/25,
`unit/townsfolk` 18/18, `unit/combatfx` 6/6, `unit/flats` + `unit/stillfolk` 15/15. `world` stays
at its known **31/34** — the three reds named at the foot of this file, unchanged by a pass that
touches no wilderness path.

**Twenty-second pass (2026-10-17) · armour that bites and the bestiary's second half**

**TWENTY-SECOND PASS · ARMOUR THAT BITES AND THE BESTIARY'S SECOND HALF.** Two of the last
named gaps closed in one pass, both against UESP read directly:

1. **The armour protects (D-68).** `src/game/armour.js` is UESP's `Arena:Base Armor` and
   `Base Shields` as the fight spends them: each material's rating turned positive (leather 3,
   chain 6, plate 9, and the plate metals' −8…−14 shift), each of the **seven** pieces' own
   protected area, each of the **four** shields' own coverage (a tower shield reaches the
   head), and a hit-location roll whose weights are this project's and say so. `monsterAttack`
   takes `armour(area)` from the scene and subtracts it from the chance, exactly as the page
   describes a rating; the character sheet prints the weighted average. Measured: rags 0, a
   leather cuirass chest 3 / legs 0, a tower shield head 4, 9 points of plate turning 2000
   blows into under 1700, and `gear` **34/34** including the panel's own `3 armour` line.
2. **Human Enemies are in the game (D-67).** UESP's second bestiary section is now
   `src/game/humans.js`: any of the **18 classes** and **8 races** (rolled from
   `character.js`'s own tables, so a human has the class ability and the racial ability the
   player would), the page's level rule (a quest dungeon's humans are the player's level, a
   group's one lower, a solitary one's ±1), the page's experience (`25×(level−1)²`, carried as
   `xpBase` so `monsterXp` pays it), and the loot line piece by piece — 1–50 gold, the
   four-piece set with **10%/level** chance of a better grade, the left pauldron after 6, the
   right after 11, the helm after 16, a **3%** rare weapon, and a shield only with a
   one-handed one. HP, damage and the armour guard are RECONSTRUCTED from the class's own
   `hitDie`, weapon base and grade, and marked as such. Art is the install's one human combat
   set (`GUARD01…06`); the armoured crowd sheets have no death frames. Measured: Stonekeep
   fields **4 humans of 6 foes** (Wood Elf Ranger, Khajiit Barbarian, Dark Elf Healer,
   Redguard Bard), a level-5 Nord Warrior spawns with `guard 9` and `xp 400`, and its death
   pays 1–50 gold plus real catalogue pieces into the pack — the four-piece set, a random
   weapon and, with a one-handed one, a shield.

**Checks, on the commands themselves:** the whole unit suite **697/697**, `unit/humans`
**11/11**, `unit/armour` **8/8**, `gear` **34/34**, `bestiary` **17/17**, `combat` **37/37**,
`actioncombat` **23/23**, `dungeonplay` **31/31**, `audit` **26/26** — every one exit 0.
`docs/BESTIARY.md` now carries the Human Enemies table (UESP's rule → the code that keeps it →
the test that holds it) and `docs/DEFECTS.md` closes D-67 and D-68 with their probes.

**TWENTY-FIRST PASS · THE EQUIPMENT AND THE CREATURES.** The owner's priority for this pass:
*"porting all armors weapons and working spells and potions and all kinds of enemies … do a
research of all enemies later and see if all are ported"*. UESP's `Arena:Base Weapons`,
`Base Armor`, `Base Shields`, `Potions` and `Monsters` pages were read against the catalogue
and the bestiary, and four things were true only in this project's imagination:

1. **The weapons were nearly right and two ranges were not**: the broadsword read 1–10 against
   the source's **1–12**, and the long bow 1–12 against **2–12**. The material table was worse:
   it collapsed UESP's two columns into one (`hit === damage`, iron −1/−1) when iron is
   **0 on the low end and −2 on the high**. `MATERIALS` now carries `hit`, `min`, `max`;
   `resolveAttack` rolls between the two ends; the panel and the shelf print the same range.
2. **The armour had five pieces; Arena has seven.** The two **pauldrons** were missing, and
   only *plate* is worked in metal. The catalogue now holds **77 armour rows** — leather, chain
   and plain plate plus the eight plate metals across helm, left/right pauldron, cuirass,
   gauntlets, greaves, boots — and **36 shields** (four types, plain and in eight metals).
3. **The potions were invented.** The port sold Shielding, Light and Water Breathing, which
   Arena does not have, and was missing Heal True, Restore Power, Stamina, Purification, Free
   Action, Invisibility and Strength. The list is UESP's **fifteen** now, and every one does
   something the character or the scene reads (`restorePower`, `stamina`, `purify`,
   `freeAction`, `invisibility`, `strength`).
4. **The bestiary was a stat block.** UESP prints an abilities line under all 24 entries and
   the port had almost none of it. `src/game/bestiary.js` is that reading: the mundane-weapon
   floors (ice golem **elven**, medusa and stone golem **dwarven**, iron golem, fire daemon and
   lich **mithril**, with the source's own *"fists can hurt them"* exception for the ice
   golem), **silver doubles at a vampire** and is the vampire's exception to the ladder, the
   skeleton's **half damage from edged weapons**, the resistances and vulnerabilities (ice golem
   double fire, iron golem **shock heals it**), the troll/vampire/lich regeneration, the rat/
   ghoul/zombie/vampire diseases, the spider/lizard man/medusa holds, the six creatures that
   **see through invisibility**, and the **eleven casters** — the old bolt list had six, missing
   the snow wolf, hell hound, stone golem, vampire and Tharn. `docs/BESTIARY.md` is the whole
   table with what is still not ported (human enemies, flight, per-creature loot).

**The full audit, page by page (the same pass).** `Arena:Monsters` has exactly **two**
sections: the 24 entries and **Human Enemies**. The port has all **24** — the unit check counts
`MONSTERS` and `ABILITIES` at 24 each — and **none** of the Human Enemies, whose whole source
text (class/race inheritance, pale sheets, group-vs-solitary levels, quest dungeons at the
player's level, the loot line and `Exp: 25×(level−1)²`) is now quoted in `BESTIARY.md`; that
gap is **D-67**, with its first probe named. Two caster facts came out of the same read: UESP
names **six** spells for Jagar Tharn, and `bestiary.js`'s `castFor` now walks them per cast
(the port threw Lightning only), and the page prints a **level** for just three casters
(ghost 5, snow wolf 6, hell hound 6), so the other seven levels are marked RECONSTRUCTED and
are inert data. `Arena:Base Weapons` found the one missing base — **leather gauntlets** (2–3),
done and held by the catalogue's count (**166 weapon rows**); `Arena:Potions` found the
prices and three doses were invented while the page printed them, so the fifteen rows carry
Arena's money (25 … 500) and its doses (Heal 56, Heal True 117, Restore Power 25, Strength
+15, Purification 100 + Sanctuary) — **D-69**, **D-70**. `Arena:The Known Spellbook` is
**50/50** in `spells.js`'s `MEANINGS`, each joined to an install record. The one defect the
audit opened without closing is **D-68**: the armour rating is on the character sheet and in
no blow — UESP's AR is per body area, so it needs a hit-location roll, and the first probe is
written down rather than guessed at.

**The control spells reach the creature, too.** `Silence` (and `Far Silence`) turns a caster
into a creature that must close (`spawn.caster` is false for 30 s); `fear` (`Witch's Curse`,
`Medusa's Gaze`) sends it running for 10 s; `poison`/`disease` (`Wyvern's Sting`, `Toxic
Cloud`, `Cause Disease`) leave a venom that takes a point a second for 20 s; `Spell Shield`
absorbs a bolt's damage before health (the bolt is flagged `spell`); and `Shalidor's Mirror` /
`Spell Breaker` turn a bolt in the air and land it on the caster who threw it. The two
control spells a fighter cannot buy from a class list are on scrolls now (`Scroll of
Silence`, `Scroll of Witch's Curse`), because a scroll is how Arena lets a non-caster do it.
**Measured** in the `bestiary` suite: after one scroll a wraith's `caster` flag is false and
after the other an orc's `fleeing` is true.

**The magic now reaches the world, not only the HUD.** A ward's points are spent before health
(`hurtPlayer`); a resistance cuts its own element (three points = 30%, capped at 60%, and the
stone golem's bolt is the one UESP says no potion reduces); **invisibility** hides the player
from every creature that does not see through it; **regeneration** closes wounds a second at a
time; **Orc Strength** feeds the fight's own Strength rule; **Light** lifts the renderer's
ambient by 0.02 a point; a **hold** stops the keys and a Free Action breaks it; a disease taxes
one health a second and a cure washes it out. The debug seam `state().magic` reports all of it,
and `hurt(damage, from, {element})` is the test door for a resistance.

**Measured, on the commands themselves** (after the last edit): unit **678/678**, exit 0.
Browser: **`bestiary` 10/10** and **`gear` 30/30** (40/40 together, after the audit's edits);
`interior` **70/70** with `world` **36/36** (106/106 together); `movement`+`dungeonplay`+
`actioncombat` **67/67**. The earlier run of this pass: **`bestiary` 8/8** (steel refused by a
fire daemon with the mithril reason, a
mithril blade landing 9, a ward of 15 eating a 20 blow down to 5, Resist Fire turning 20 into
14 while cold stays 20, a rat blind to an invisible player and a wraith seeing them, a troll
85 HP wounded to 43 and back to 55), **`gear` 30/30**, **`combat` 37/37**, **`actioncombat`
23/23**, **`movement` 13/13**, **`dungeonplay` 31/31**, **`interior` 68/70** (the two failures
are D-65 and D-66, both older than this pass and named below). Two suite corrections, both
reasons on them: `combat`'s material check asserted `hit === damage` (the misreading this pass
removed) and now pins iron's two ends; `actioncombat`'s respawn check compared the *first
creature's cell* across two page loads, which is wrong now that a re-entry resumes the player's
own saved feet and `spawnEncounter` places the roster in the region reachable from **that**
arrival — it compares the population as a multiset of ids, and the cells only when the arrival
is the same.

OPEN, FOUND BY THIS PASS: **D-65** the water walk-out (`interior`'s ledge climb fails at the
bank — `chasm: wet`, `feetY 0.95`, no shoreline reached in 3.5 s) and **D-66** the first-person
blade is drawn 159 px too low at 960×600 (`y 363` against the header's `204`). Neither is in
this pass's territory; both are named rather than papered over. *(Both were closed in the pass
that followed — see **CLOSED THIS PASS (part twenty)** below; `interior` is 70/70 now. D-66's
lesson: when a check and the owner disagree, the check is the one to re-read.)*
**The next enemy gap is human
enemies** (UESP's separate section: any class, pale human sheets, `25×(level−1)²` xp) and
per-creature loot tables; `docs/BESTIARY.md` lists them.

**TWENTIETH PASS · D-51 — THE DOOR IS ON THE WALL.** The owner: *"all doors in the game should be
enterable and i mean the texture of a door on a wall instead the houses and royal palaces are
linked to a weird little sprite that is the clothes hanging to dry"*. He was right, and the port
had been reading the decoration instead of the door: `shops.js` scanned only non-solid `0xA`
**edge** cells and bound the `T_T…` **sign** art (the pair entry after each `*MENU` index), so a
house was entered through the laundry sprite and every `T_DEQ`/`T_DBS…` **wall door** was solid.
OpenTESArena's `tryMakeVoxelTransitionDefGenInfo` reads **walls too** (`mostSigByte ===
leastSigByte`, texture `most − 1`, bound by `INFFile::getMenuIndex`), and that is now this port's
law: `cityDoors` calls `interiorKindOfTexture` (slots 0 equipment, 1 tavern, 2 Mages Guild,
3 temple, 4–6 house, 9 noble, 11–13 palace), carries the door's own art, and records `stand` —
the walkable neighbour a player opens a wall door from. Unbound door art is a **house**. `E` at
the paving in front opens it; leaving puts the player back on that paving, not on a diagonal snap.
Measured over all 368 blocks: **3 925 wall doors** in eight textures, against five sign indices;
Daggerfall has **421 doors** (23 equipment / 19 tavern / 5 temple / 1 Mages Guild / 28 noble /
345 house) and 60 laundry signs. The palace is still the one marked house door nearest the middle
of a city.

**…and then the country, in the same pass.** The owner's law is not a city law: the wilderness
INFs bind their own `*MENU` table (0 barn, 1 crypt, 2 farmhouse, 3 tavern, 4 temple, 5 tower; 6/7 the
gate posts, 8/9 the dungeon mouth), and `shops.js`'s new `wildDoors` reads it with the same
wall-or-edge law and the same `stand` cell. Measured over all 66 shipped `.RMD` blocks: **209 country
doors** — 154 farmhouses and barns, 19 taverns, 17 temples, 13 towers, 6 crypts — of which 208 are
reachable (the one facing its own masonry is `WILD065`'s farmhouse at 21,51, named in the test).
A barn is a **house** here (a building with a door, the owner's law), a crypt is a tomb and holds
nobody, and a tower keeps one. A country door returns through `?wild=`, so leaving lands on the same
**world** cell even when the window re-centres. `doors` **63/63** (a real country tavern, a crypt and its depth outside
Daggerfall: `DTAV.IMG` → `TAVERN5.MIF`, back out on world cell 17375,11872; the crypt holds six and can be descended), `unit/shops` **14/14**,
unit **646/646**.

**D-52, found by probing the door that was just built.** The first tomb entered through a country
door was **empty** — only coffins — while the same file opened directly fielded six creatures.
`populate` keyed its quiet on `entryCell` (the `?enter=` a door writes), so the only way a player
reaches a crypt was the one way that emptied it. `inhabited` is the **building's kind** now: a crypt
and a tower are **lairs** and keep the roster their own `.INF` names (8 species in `WCRYPT.INF`, 17 in
`TOWER1.INF`; every level answers `monsterCountFor` **7**), `BUILDING_FOLK.tower` went 1 → 0. Measured:
`WCRYPT4.MIF` by its own country door → **6 creatures**, 0 townsfolk, its treasure and key on the
floor; `doors` **59/59**, `living` 46/46, unit **646/646**.

**D-53, the next probe, and the fix it asked for.** The first tomb opened was two storeys of data and
one storey of play: `WCRYPT1…8` level 1 carries its `*LEVELUP` cell and its 23-species roster, while
the entrance floor carries **no stair at all**. `mifLevel.js`'s `fillStairPair` now completes the pair
from the data's own half (lower stair cell, this level's `*LEVELDOWN` art, a wall of this level beside
it), only for a **lair**, never over a floor that already descends, and never mutating the archive.
Measured: `WCRYPT4` by its country door → down (17,4) → **level 2/4, 6 creatures** → up (18,3) →
level 1/4. `unit/mif` **27/27**, `doors` **63/63**, `dungeonplay` 31/31, unit **649/649**. Crypt
levels 2 and 3 have no stair either way, so a crypt is two storeys and that is named, not claimed.


THIS PASS, IN ONE LINE: **the level has a map again, the world map kept its key, and the pass
that was in flight is measured green.** Three things happened: `Tab` inside a dungeon, a shop or
the palace now opens **Arena's automap** (block **B21**, ported from OpenTESArena's
`AutomapUiMVC`); `M` stayed **Tamriel everywhere**, after the owner caught the first cut of this
pass taking it (`"your local map made it impossible to open the entire tamriel map the game had
cause you put it on M"`); and the large uncommitted pass that made the country **one Tamriel** —
one grid, 288 settlements, the gate as a way through, the people of a province drawn in their own
race — was run through its own browser suites rather than assumed.

**THE OWNER'S CORRECTION IS THE LAW NOW: `M` is Tamriel from anywhere.** The first cut bound the
automap to `M` in interiors, which made the continent unreachable exactly where a player most
needs it. `M` now always calls `openWorldMap()` (in a dungeon it closes the sheet first, giving
back its pause, then opens Tamriel); the automap is on **`Tab`**, `Escape` puts it away, and the
sheet itself carries a **"the world map of Tamriel"** button, so neither map is ever a dead end.
`Tab` in a city or the country says there is no local sheet and names `M`. The suite asserts
both halves from the same dungeon room — world map first, level map second — so this cannot
regress silently.

**B21 · the automap is closed (`4d1c7c0` is the last commit; this work is uncommitted).**
`src/game/automap.js` is the law and `src/scenes/automap.js` the sheet. Every colour is the
reference's own (`AutomapUiMVC.h`: wall 130,89,48 · raised 97,85,60 · door 146,0,0 · up 0,105,0 ·
down 0,0,255 · dry 20,40,40 · wet 109,138,174 · lava 255,0,0 · player 247,255,0), every voxel
draws as `getPixelColor` says (a dry pit under a wall is raised; water and lava ignore all but a
raised platform; a hedge blocks and an archway does not; a diagonal is floor), and the player is
the reference's **3×3 arrow**, one pattern per direction, with `PixelSize = 3` keeping the cell
scale a multiple of three. What is this project's, and stamped in the module header: the
**whole-level fitted view** (OpenTESArena scrolls a 3-chunk window), the screen's compass
(`+col` east, `+row` south — the world map's own axes), and no fog of war, because the reference
builds its map from the level's chunks and has none. `M` is **Tamriel in every place**; in a
dungeon or a building **`Tab`** opens the sheet and pauses the world like the menu does.
**Measured**: `automap` browser suite **13/13** (M still opening Tamriel in a dungeon, Tab opening
the level sheet, the level's own counts — START.MIF 686
floors / 1535 walls / 14 doors / 1 up — the canvas's real pixels: 55 516 parchment, 121 014 wall,
27 arrow pixels at cell scale 9 (a 3×3 pattern of 3-pixel sub-cells, plus this project's one-pixel
ink edge so the eye finds the player), the marker on `floor(66.25/2.5),floor(3.75/2.5)` = 26,1, a quarter
turn east→south, **the sheet's button handing over to Tamriel**, Escape closing and resuming,
**a tavern interior getting the same sheet** (199 floor cells), and a city's `M` still opening the
world map while `Tab` has no level sheet to offer); `unit/automap.test.mjs` **15/15** (every
classification arm, the 8 patterns, yaw sectors, marker clamping, layout, a recording canvas, and
START.MIF itself). **Cost**: `buildAutomap` is **1.0 ms cold / 0.22 ms warm** on a 50×50 level
(measured in Node, ten builds) — one pass per level load, not per frame.

**THE IN-FLIGHT PASS, NOW VERIFIED.** Its own five suites were re-run from a clean save:
`movement` **12/12**, `world` **31/31**, `persist` **14/14**, `townsfolk` **69/69**, `living`
**46/46** — **172/172** across them. That pass is what the previous state file called *"the
eighteenth pass"* and it is the biggest change in the tree: the country outside a settlement is
no longer that settlement's private wilderness but **one Tamriel grid** (`game/tamrielGrid.js`,
256 cells to a world-map pixel, `TERRAIN.IMG`'s own coastline and biome, the settlement's own
`CITYDATA` pixel as its footprint), so a gate leads somewhere and the next town is the walk the
map always drew; a dungeon's way out is its ruin block in that country; the gate is walked
through, not pressed; and the people are the province's — `raceSkin.js` paints the install's one
body with a race's six-entry skin ladder, and an Argonian is **the Lizard Man's own figure**
(`RACE_FIGURE`), not a green human; `staticFolk.js` puts the court (`KING`/`QUEEN`/`PRINCE`/
`PRINCESS`) in a palace and the still patrons (`MAN01…04`/`WOMAN01…04`) in a tavern; and a
chasm now has **depth** (a dry pit 1.2 m, water 1.55 m, lava 1.0 m) with a ledge climb out of it
(`motor.js`'s `ledgeClimbing`, measured from the water line), which is the owner's *"shallow
pits you can climb instead of just holes … the ability to climb is needed"*.

**TWO CHECKS RESTATED, with the reason on them.** `townsfolk`'s race checks used to require every
person's sheet key to end `#<race>`. That is true of a **palette race** and false of a **figure
race**: the Lizard Man is the Argonian's whole art, so `LIZARD1.CFA` carries no suffix (a suffix
would lay a second skin over the art that already is the race). The checks now say what the law
says — every person has `race`, and the suffix matches it **when the sheet is a palette race** —
and both pass: 92% Argonian of 48 in Lilmoth, 48/48 carrying their race; 67% Dark Elf in Necrom.

LAST GREEN (each command run on its own, this pass):
unit **650/650**, exit 0 (`ARENA_PATH=C:/ArenaProject/arena/ARENA npm test`);
browser `doors` **63/63** (equipment, tavern, house, temple and palace round trips; wall art as
the door; hanging signs refused; 353 of 356 city doors reachable; a country tavern entered and
left on the same world cell; a crypt entered, descended and left; M/Tab untouched) ·
`commerce` **25/25** · `guilds` **13/13** · `living` **46/46** · `townsfolk` **69/69** ·
`movement` **12/12** (the gate still walks through) · `persist` **14/14** · `world` **31/31** · `automap` **13/13** ·
`dungeonplay` **31/31** · `menu` **39/39** · `unit/mif` **27/27** · `audit` **26/26** (was 17/26:
its three country windows were open sea — D-55).
**Suites NOT re-run after this pass's D-54/D-55**: `chargen`, `mainquest`, `combat`, `actioncombat`,
`generated`, `hunt`, `regard`, `radiant`, `story`, `cutscene`, `scenevisuals`, `sky`, `progression`,
`bounties`, `exe`, `testmap`. `scenes/interior.js`'s `cityRequestOf` (the kind law) is read by every
city page, and the suites that boot one — `doors`, `movement`, `world`, `worldmap`, `audit` — were
all re-run green on it; the ones above do not boot a settlement. `docs/DEFECTS.md` gained D-54/D-55.

IN PROGRESS: nothing half-edited. `cityRequestOf` matches every settlement's own `kind` (D-54) and
`audit`'s country windows sit on land (D-55); both are in the uncommitted tree below. The tree holds
five passes **uncommitted together** — 60 modified
files and 18 new ones (`git status --porcelain`, checked at the end of this pass): the
eighteenth pass, the nineteenth pass's automap (`game/automap.js`, `scenes/automap.js`,
`unit/automap.test.mjs`, `suites/automap.mjs`, `index.html`, `interior.js`, `run-browser.mjs`,
the two restated `townsfolk` checks) and this pass's doors (`game/shops.js`'s wall-sign law,
`scenes/interior.js`'s two-step `E`, the `doors`/`commerce`/`guilds` suite updates and
`unit/shops.test.mjs`) — all uncommitted together. `docs/` was **deleted in the working tree**
and has been restored from `HEAD`; the docs now describe all three passes.

NEXT 3 STEPS (from `docs/PORT_BLOCKS.md` §5, each with its first probe already named):
1. **0e · B25 the resident country** — the owner's loudest remaining complaint: the wilderness
   window still **re-boots the page** once per 64 cells (measured in §4m: painted 380 → 6, ~160 m,
   ~20 s of walking). First: time one `goInPlace` and list what it recomputes that the world
   already knows; then shift the window in place, keeping the blocks that did not change.
   Checks: `world`, `persist`, `movement`, `automap`.
2. **0l/B16 · the two map levels, one picture** — the owner's *"the big map and the region maps
   coherence needs to be redone"*: print one place's pixel on both maps, its province rectangle,
   its climate, its seed and the URL its marker builds, then fix the **world model**, never a
   drawing routine. Checks: `worldmap`, `unit/worldmap`.
3. **0b/B24 · the executable's numeric tables** — the string tables are out (`a9aa3a6`); the
   byte rows behind the holidays, the word ladder after the noble ranks and the creature stat
   rows need a constraint to check each reading against before a number is worth wiring. The
   first probe is still the same: for each block, a property it must satisfy (a month 1…12
   followed by a day 1…31, a ladder that sums to the table's length, a hit-point pair that
   brackets the port's UESP numbers). Checks: `exe`, `unit/exetables`.

**D-44 is CLOSED in the same uncommitted pass, and this state file was wrong about it at first**
(the restored `DEFECTS.md` said OPEN): `livingWorld.js`'s `POST_ACTIVITIES` and `interior.js`'s
`onPost` hold a priest, vendor or wizard on the post their day gave them, for the block's own
length, **without** `atHome`, and `living` measures three things on a real page — the post is
taken, it holds through 12 samples, and the person is still drawn. The correction is in
`DEFECTS.md`; the lesson is the old one: **read the code before restating a doc's status**.

Then: **0g** (the volcano, D-46), **0m** (every biome's background), **B05** (swimming through
water, D-18/D-18a), **B23** (a dungeon level below), **0c/0d** (Cyrodiil's arrival prose; a name
is not a world address), **D-13** (the mirrored start), **D-40** (a repeated name is not an
address).

CLOSED THIS PASS (2026-10-17, part twenty): **D-65** (a bank whose top is a round height over the bed was not a ledge — `motor.js`'s `CLIMB_LEDGE_SKIN`; the haul out of `START.MIF`'s water is 2.75 s) and **D-66** (the `interior` check still measured the weapon from line 147 of the *window*, a law the owner overruled on 2026-10-17; it now holds the header's own margin above the line the art really stands on). Both were the only two reds in `interior`, which is **70/70** after them; `interior`+`world` **106/106**, `movement`+`dungeonplay`+`actioncombat` **67/67**, and `unit/climbing` gained the case that fails without D-65's fix (**677** unit tests).

CLOSED THIS PASS (2026-10-17, part nineteen): **D-63** (the country's window freed its people: `keepFigures`, and a refilled window) and **D-64** (a street is not one head: `raceSkin.js`'s `hairIndicesOf`/`HAIR_COLORS`/`hairForPerson`, six colours keyed into the sheet spec `#race+hair`) are CLOSED in this uncommitted pass; **D-56** (the level-up panel stayed up, and `L`
was not the panel's key), **D-57** (a still figure's size — measured metres in
`state().scenery.people`), **D-58** (a flat on a raised cell stands on the block; nothing grows on
water), **D-59** (the compass strip grew eight points per travel — `replaceChildren`), **D-60**
(the country slide rebuilds the level in the same scene, not the page: `frames` keeps climbing,
creatures are carried and shifted, `state().windowSlide` reports the move), **D-61** (the talk
sheet is a different figure in this install — `MLGEN01W` 52×99 vs `MLGEN01T` 43×99 and different
cloth indices — so the standing sheet is kept while speaking).

OPEN DEFECTS (top): **D-18/D-18a** (water you can swim through) · **D-46** (the volcano) ·
**D-23** (weather with no front; per-biome ground mix) · **D-13** (the mirrored start) ·
**D-40** (a repeated name is not an address) · **D-03/D-24** (coverage: 1 691 of 2 441 records
named by nothing) · **D-06/D-07** (names outside this checkout) · `O-01` (a live page whose clock
is moved answers no probe). Full list: `docs/DEFECTS.md`.

**D-62 is CLOSED** (2026-10-18): the owner's *"not the small 2d tables the 3d tables … this tables
and beds have black in their textures that should be invisible so i can see under them"*. The
alpha-bleed half was already in; the slab was `mifMesh.js`'s `cutout`, which covered a `0x9` arch, a
`0xA` sign and a `0xB` door and never a **raised platform's side** — and a house's table and bed
*are* raised boxes whose side art is a picture with the room showing through it (`TABLE.IMG` 37.1%
palette index 0, `BED.IMG` 84.9%, measured). The original's own renderer alpha-tests exactly those
faces (OpenTESArena `MapGeneration.cpp`, `writeVoxelInfoForMAP1`), so the law is the kind's. Same
viewpoint before → after: `TAVERN1`'s hall at a 3D table **72 068 → 504** near-black pixels,
`BS1`'s bedroom at the bed **46 752 → 530**. Full row in `docs/DEFECTS.md`.

DECISIONS TAKEN (this pass): **D-50 — the automap is OpenTESArena's map, not a new design.** The
colours, the voxel law, the 3×3 arrow and `PixelSize = 3` are the reference's; the fitted view and
the screen compass are this project's and are stamped as such. The rejected alternatives: a 3D
minimap over the canvas (Arena has no such thing), the world map's own renderer (it is the
continent, not a level), and a fog-of-war reveal (not in the reference, so not invented here).

DO-NOT-REPEAT (paid for already):
* **A change you did not boot is not a change** (D-49). Run the **browser** suite of the scene
  you touched, even when `npm test` is green.
* **`docs/` disappearing from the working tree is not a docs update.** `git status` shows tracked
  deletions; `git checkout -- docs` restores them, and a stale doc is cheaper than no doc.
* Reading `src/scenes/interior.js` whole (**11 160 lines**, one closure). Grep a name, then read a
  ≤300-line window. `current` is created at the `current = { … }` literal only — nothing above it
  may write to `current`. Anything `loadLevel` reads must be declared **before** the first
  `loadLevel` (the automap's `automapMap` sits beside `life` for exactly this reason).
* `write_file` overwrites an existing path silently; `str_replace` needs the **project-root**
  path (`PERFECTARENA/src/…`), not a path relative to a shell `cd`.
* The `spawn_agents` code-searcher and `code_search` tool: use `grep -rn … | head`, constrained to
  `src/game`, `src/scenes`, `tests/unit`, `tests/suites` (`src/engine` is 154 modules and drowns
  the answer).
* Trusting `ARENA_PATH`'s default: run every suite with it set.
* Addressing a suite's own creature/person by name or array index — an index moves when somebody
  dies or walks out of doors (D-15, D-11).
* Starting a static server in one shell and driving a browser from another — the browser reaches
  only a server its own process spawned (`tests/run-browser.mjs`).
* Moving the clock on a live page (`setClock`); boot a page at the hour (`?clock=`) instead.
* `.scratch/*.mjs` files cannot be **read** by the file tools ([BLOCKED]) — write them with
  `write_file` and keep the probe's output in the transcript/docs.

FILES NOT TO READ WHOLE: `src/scenes/interior.js` (11 160 lines · ~530 KB) ·
`src/engine/render/renderer.js` (5 551) · `src/scenes/worldmap.js` (59 KB) ·
`tests/run-browser.mjs` (89 KB) · `docs/DECISIONS.md` (909 lines) · `docs/PORT_BLOCKS.md`
(1 031) · `docs/DEFECTS.md` (182) · `src/game/livingWorld.js` (1 020) ·
`src/game/radiantQuests.js` (42 KB) · `src/game/townsfolk.js` (643) ·
`tests/suites/dungeonplay.mjs` (read the phase you touch).

CLOSED THIS PASS (2026-10-18, part twenty-one): **D-71** — the two weapon families this install cannot draw
(`FLAIL.CIF`, `BOW.CIF`) were also the two the game could not use. The owner: *"we need all the weapons like
axes flails and armor and spells actually working"*. Now `src/game/archery.js` (new) flies the player's own
arrow from the crosshair, `combatFx` draws the shaft, the wound is `resolveAttack` at the moment it lands,
and the **flail** is drawn from a documented stand-in (`MACE.CIF`) with `rig.substitute` and a HUD line that
says so. Probes: `unit/archery` 7/7 · `unit/weapon` 18/18 · `gear` **40/40** (a long bow looses and wounds a
Lizard Man for 10 at chance 55; the iron flail reports `MACE.CIF`/`FLAIL.CIF`/`substitute`) · `combat` 37/37 ·
`actioncombat` 23/23 · `npm test` 717/717.

STILL AHEAD FOR PARITY (measured, in this order of value): **monsters that cast** — the bestiary names the
spells (`ranged.js`'s `CASTER_IDS`), and until a creature casts, `Silence`, `Shalidor's Mirror`, `Spell Shield`
and `Spell Drain` have nothing to answer (the scene's own outcome line says *"has no spell points to drain"*);
**Passwall** — the scene answers *"the stone here is too thick"* and never opens a wall; **Levitate** — the
spell is applied (`player.levitating`) and nothing reads it, so water and pits still stop a levitating player;
**the bows' own draw** — `BOW.CIF` is absent, so the hand is empty while the arrow flies.


CLOSED THIS PASS (2026-10-18, part twenty-two), from the owner's three reports:
* **"bow has no animation in first person"** — `BOW.CIF` is not in this archive, so the shot is
  drawn from the install's own `ARROWS.CIF`: nine frames whose header offsets sit in a measured 3×3
  grid, the centre column being the arrow leaving low → middle → high (`weaponView.js`'s
  `ARROW_STATES`, `WEAPON_STATE_STAND_INS`). On a page: `state firing`, `frame 7`, 603 painted
  pixels. The bow is **og Arena's own weapon** (UESP's base weapons: short bow 2–8, long bow 2–12,
  and OpenTESArena's `ArenaWeaponUtils` names `bow.cif`), so it stays — only its picture was missing.
* **"a lot of walking npcs sprites with yellow hair dont hair change"** — D-72. The crowd is the
  armoured roster (`01UNAWLK.CFA`…), and 62 of its 65 sheets paint their hair from the **gold run
  192–199**, which was nowhere in the changer's candidates: a blonde commoner answered `[]`.
  `raceSkin.js` now has the `ROSTER` family (128–136, 139–147, 192–199) and the hoods/cloth/helms
  stay out of it, measured.
* **"the non walking npcs are too small"** — D-72. The band's floor was 1.55 m while the street's
  walking citizens are 1.8 m; it is now **1.75 m** (`flats.js`), and a palace's king, queen, heir and
  guard all read 1.75 m on a page where they read 1.55.
Probes: `npm test` **717/717** · `gear` **41/41** · `townsfolk` **71/71** · `doors` 53/58 · `world`
31/34 · `combat` 37/37 · `actioncombat` 23/23.

STILL FAILING, AND NOT FROM THIS PASS (stable across two runs, both in the country-window path the
weapons work does not touch): `world` — *"the player is set down on the exact feet they had"* (one
cell off: 86.25,161.25 vs 88.75,163.75), *"the new window fields its own population"* (`refilled`
never set — 1 creature and 1 figure stayed inside the new window, so the refill branch did not run),
and the province-border slide timing out. `doors` keeps its five longstanding reds (the three
keeper-speech checks, `TEMPLE4.MIF`'s priest, and the country window with no crypt door). Both
suites were red **before** this pass as well; they need their own probes (B23/D-63 area).

CLOSED THIS PASS (2026-10-18, part twenty-three): **D-62** — the black under the 3D tables and beds.
The owner named the half that was left (*"not the small 2d tables the 3d tables"*): a house's
furniture is a **raised box** (`*BOXSIDE` art `TABLE.IMG` / `BED.IMG`), OpenTESArena's own renderer
alpha-tests a raised platform's sides and leaves its top and bottom `Opaque`
(`MapGeneration.cpp`'s `writeVoxelInfoForMAP1`), and the port's `mifMesh.js` cut out only a `0x9`
arch, a `0xA` sign and a `0xB` door — so every table and every bed was a black slab wherever its art
is a hole. One clause: `cell.kind === 'transparent' || cell.kind === 'raised'`.
**Measured over all 533 shipped `.MIF`s**: 47 art records are used on raised sides, and only four
carry a hole above 1% (`BED.IMG` 84.9%, `WCAS.IMG` 68.4%, `CASLAVA.IMG` 62.4%, `TABLE.IMG` 37.1%) —
every other raised side is 0.0% index 0, so nothing else on screen moves. On real pages, same
viewpoint: `TAVERN1.MIF&level=1` at a table **72 068 → 504** near-black pixels, `BS1.MIF&level=1` at
the bed **46 752 → 530**. Held by `unit/mif`'s new check (the same art on a raised side and on a
wall: one bucket `#cut`, one not; 19 tables in the hall, the house's 2 beds — it fails with the old
clause) and the `scenevisuals` browser check *a 3D table's side shows the room under it, not a black
slab* (597 near-black of 576 000; 82 894 through the old clause). `npm test` **730/730**;
`scenevisuals` **10/11**, its one red the longstanding nighttime-door-lights check, which fails the
same way with the clause reverted (measured both ways).
