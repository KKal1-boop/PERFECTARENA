# THE BESTIARY — ALL OF ARENA'S CREATURES, AND WHAT IS PORTED

*Every claim here is UESP's `Arena:Monsters` page (read 2026-10-17) or a check in this
repository. The stat block is `src/game/monsters.js`; the abilities that are not a number are
`src/game/bestiary.js`; the fight reads both.*

## The count

UESP's contents list has **24 entries**: 23 creatures and **Jagar Tharn** (a human, listed
with the monsters because he is the endgame). The install ships a six-view `.CFA` set for
every one, including the two spellings that are easy to miss — the Fire Daemon is `DEAMON`,
and the Minotaur is `PAT` (`PATAUR` does not exist; `game/monsterArt.js` reads this from the
executable's own name/sheet runs).

| # | Creature | HP | Damage | XP | Lvl | Sprite | What it is besides a stat block |
|---|---|---|---|---|---|---|---|
| 1 | Rat | 1–6 | 1–4 | HP×5+35 | 1 | `RAT` | transmits disease |
| 2 | Goblin | 1–8 | 1–5 | HP×5+60 | 1 | `GOBLIN` | — |
| 3 | Wolf | 10–25 | 1–10 | HP×10+100 | 3 | `WOLF0` | — |
| 4 | Snow Wolf | 15–30 | 1–12 | HP×10+150 | 4 | `SWOLF0` | casts **Ice Bolt**, level 6 |
| 5 | Lizard Man | 10–20 | 1–8 | HP×10+75 | 3 | `LIZARD` | **paralyses** with its blow |
| 6 | Skeleton | 25–45 | 2–16 | HP×15+250 | 5 | `SKELE` | **half damage from daggers, swords, axes, bows** |
| 7 | Orc | 15–40 | 2–12 | HP×15+200 | 4 | `ORC` | — |
| 8 | Ghoul | 45–75 | 5–20 | HP×20+1000 | 7 | `GHOUL` | transmits disease |
| 9 | Spider | 40–70 | 4–20 | HP×20+500 | 6 | `SPIDER` | **paralyses** (venom) |
| 10 | Minotaur | 30–60 | 3–18 | HP×20+300 | 6 | `PAT` | resists magic (½) |
| 11 | Ghost | 60–80 | 5–25 | HP×25+1500 | 9 | `GHOST` | casts **Spell Drain** (5), sees invisible |
| 12 | Hell Hound | 50–75 | 5–25 | HP×25+1250 | 8 | `HOUND` | resists fire (½), casts **Fireball** (6) |
| 13 | Troll | 75–100 | 10–30 | HP×35+2500 | 10 | `TROLL` | **regenerates** 2 HP/s |
| 14 | Zombie | 70–90 | 5–30 | HP×35+2000 | 10 | `ZOMBIE` | transmits disease |
| 15 | Wraith | 80–110 | 10–35 | HP×45+5000 | 12 | `WRAITH` | casts **Fireball** (8), sees invisible |
| 16 | Homonculus | 90–120 | 10–35 | HP×45+7500 | 13 | `HOM` | casts **Lightning** (9) |
| 17 | Ice Golem | 150–200 | 10–35 | HP×55+10000 | 15 | `ICE` | immune below **elven** (**fists still hurt it**), resists cold (½), **takes double fire** |
| 18 | Stone Golem | 175–250 | 10–35 | HP×55+12500 | 16 | `STONE` | immune below **dwarven**, casts **Force Bolt** (12), **no resistance reduces it** |
| 19 | Iron Golem | 200–300 | 10–40 | HP×65+15000 | 18 | `IRON` | immune below **mithril**, resists magic (½), **shock heals it** |
| 20 | Fire Daemon | 225–350 | 10–40 | HP×65+20000 | 20 | `DEAMON` | immune below **mithril**, resists fire (½), sees invisible, casts **Fireball** (15) |
| 21 | Medusa | 250–400 | 10–50 | HP×75+25000 | 22 | `MEDUSA` | immune below **dwarven**, **paralyses at range**, casts **Pitfalls** (18) |
| 22 | Vampire | 500 | 10–50 | HP×75+30000 | 25 | `VAMPIRE` | immune below **dwarven**, **silver does double**, regenerates 3 HP/s, disease, sees invisible, casts **Fireball** (20) |
| 23 | Lich | 750 | 10–75 | HP×100+50000 | 30 | `LICH` | immune below **mithril**, regenerates 4 HP/s, sees invisible, casts **Lightning** (25) |
| 24 | Jagar Tharn | 500 | spell | 75 000 | 40 | `THARN0` | **no melee weapon lands**, sees invisible, resists magic (½), casts **Lightning** (30) |

`XP` is UESP's own rule, `HP × EExp/HP + EExperience` (`combat.js`'s `xpFor`). The levels are
this project's ordering of UESP's difficulty text, used only by `rosterFor` to decide what a
danger rating admits.

## Where each ability lives

| Law | In the code | Held by |
|---|---|---|
| stat block, sprite name, roster by danger | `src/game/monsters.js` | `unit/combat`, `unit/monsterart` |
| immunity ladder, silver, resistances, regeneration, holds, disease, casters | `src/game/bestiary.js` | `unit/bestiary` 11/11, browser `bestiary` 10/10 |
| the blow, the metal's two ends, the immunity refusal | `src/game/combat.js` `resolveAttack` | `unit/combat`, browser `combat` 37/37 |
| the bolt's element and the casters' list | `src/game/ranged.js` | `unit/ranged` |
| wards, resistances, invisibility, regeneration, holds and disease in play | `src/scenes/interior.js` | browser `bestiary` |

## The coverage audit, against the page itself (2026-10-17)

`Arena:Monsters` has exactly two sections: **Arena Monsters** (24 entries — the 23 creatures
and Jagar Tharn) and **Human Enemies**. The port covers the first section completely: the
unit check counts `MONSTERS` at 24, `ABILITIES` at 24, and the browser suite walks the same
table. The second section is **not** in the port at all.

| UESP's section | Entries | In the port | Held by |
|---|---|---|---|
| Arena Monsters | 24 | **24** | `unit/bestiary` 11/11 · `bestiary` 17/17 |
| Human Enemies | any of 18 classes × 8 races | **18 × 8, all of them** | `unit/humans` 11/11 · `bestiary` 17/17 |

The page's own **Human Enemies** text, which is the whole of the specification it gives:

> Human enemies can be of any class or race and have the abilities given them by their race
> and class. They only appear as pale skinned humans, regardless in which province they are
> fought. Humans met in groups usually have a lower level than solitary ones. Humans met in
> quest dungeons such as Fortress of Ice have the same level as the player. Loot: {1 .. 50}
> gold, set of armor (cuirass, greaves, boots and gauntlets; 0+10%/level chance to have a
> chain/plate one for corresponding classes), left pauldron after level 6, right pauldron
> after level 11, helmet after level 16, random weapon (3% chance for a rare/magic weapon), a
> shield (if one-handed weapon was generated). Exp: 25*(level-1)²

So the source gives the experience rule and the loot rule exactly, and gives **no hit-point
or damage rule** — those would be reconstructed from the player's own class and level the
day they are ported. `Arena:Classes` lists the 18 classes (Acrobat … Warrior) and
`Arena:Races` the eight races, which is the list a human's abilities would come from.

**Two caster facts the audit corrected.** UESP names **six** spells for Jagar Tharn
(Wizard's Fire, Ice Bolt, Wyvern's Sting, Lightning, Far Silence, Spell Drain); the port
used to throw Lightning alone, and `bestiary.js`'s `castFor` now walks the six per cast. And
the page prints a spellcasting **level** for exactly three creatures — ghost 5, snow wolf 6,
hell hound 6 — so every other `caster.level` in the table is this project's stand-in, marked
RECONSTRUCTED in `bestiary.js`.

## Human Enemies, in the port (D-67, closed)

The page's four exact rules are implemented as written in `src/game/humans.js`, and the
two it does not give are marked RECONSTRUCTED in the code:

| UESP's rule | How the port keeps it | Held by |
|---|---|---|
| any of the 18 classes and 8 races | `character.js`'s own `CLASSES`/`RACES` — a human is rolled from the same tables a player is built from, ability lines included | `unit/humans` |
| only pale-skinned humans | `GUARD01.CFA`…`GUARD06.CFA`, the install's one human **combat** set (12-frame walk/attack sheets + a death sheet) | `unit/humans` · `bestiary` |
| a quest dungeon's humans are the player's level; groups are lower; solitary ones about it | `humanLevel`: quest → exactly the player's level, group → one below, otherwise ±1 | `unit/humans` · `bestiary` |
| `Exp: 25×(level−1)²` | `humanXp`, carried as `xpBase` so `monsterXp` pays it unchanged | `unit/humans` · `bestiary` |
| loot: 1–50 gold, cuirass/greaves/boots/gauntlets, 10%/level chain/plate for the right classes, left pauldron after 6, right after 11, helm after 16, a weapon (3% rare), a shield with a one-handed one | `humanLoot`, with every id checked against `items.js` by a unit test | `unit/humans` · `bestiary` |
| **no** hit-point or damage rule | RECONSTRUCTED: hit points from the class's own `hitDie` × level; damage from the class's weapon base + a level term; the class's armour grade (3/6/9) is a guard on the player's chance to hit | `unit/humans` · `bestiary` |

A dungeon fields about a third of its foes as humans (half in a quest dungeon, none in the
countryside) — a frequency the page does not print, and `humanShare` says so. The class and
race are in the name, the statistics, the two ability lines and the loot; the *silhouette* is
the one human combat set the archive ships, because the armoured crowd roster (`01CHN…`,
`01PLT…`) has walk and attack frames but **no death sheet**. A corpse's gear is taken into the
pack rather than laid on the floor — the one place the port's delivery differs from Arena's.

## What is **not** ported
* **Flight.** Ghost, wraith and the airborne kinds are drawn and fought on the floor; the
  sprite and the lore say they fly, the collision does not.
* **Loot tables.** UESP gives each creature its own gold/item chances; the port's loot is the
  level's own (`dungeonItems.js`), not the creature's.
* **"Cannot appear outdoors by day"** (all undead, hell hounds, fire daemons). The wilderness
  bestiary draws by climate and hour but does not yet exclude those kinds by day.

## Re-running the audit

```
ARENA_PATH=C:/ArenaProject/arena/ARENA node --test tests/unit/bestiary.test.mjs
ARENA_PATH=C:/ArenaProject/arena/ARENA node --test tests/unit/combat.test.mjs
ARENA_PATH=C:/ArenaProject/arena/ARENA node tests/run-browser.mjs bestiary
```

The unit file asserts the table is exactly UESP's 24, that every immunity floor is the
source's, that silver doubles at a vampire, that a skeleton halves an edge, that the casters
are the eleven the source names, that a bolt carries its caster's element, and that Tharn's
six spells are thrown in UESP's own order.
