# Arena's spell files, decoded

This is the reference for `src/arena/spellsFile.js` and `src/game/spells.js`: what the install's
own spell data actually contains, how the offsets were established, and which parts are still
this project's own numbers. It is the companion to `docs/FORMATS.md` §10, which listed these
files as *located but unparsed* until now.

Everything marked **measured** below was read out of the copy of Arena this project is
developed against, and is pinned by `tests/unit/spells.test.mjs` against those bytes.

## The files

| File | Size | Records | What it is |
|---|---|---|---|
| `SPELLSG.65` | 10 880 | 128 × 85 | Arena's standard spell list |
| `SPELLS.LST` | 10 880 | 128 × 85 | **measured identical, byte for byte** |
| `SPELLS.65` | 2 720 | 32 × 85 | the spells a player has made at a spellmaker (same record layout) |
| `SPELLMKR.TXT` | 3 942 | 20+ templates | the spellmaker's own prose, `#NN`-numbered |

Of `SPELLSG.65`'s 128 records, **64 carry a name** (records 0…63) and 64 do not: records 66…127
are entirely zero, and 64 and 65 hold header bytes with no name.

## The record: 85 bytes

```
0x00   6 × u16 LE   a table of six magnitudes, one 6-byte stride each
                    (0x00, 0x06, 0x0c, 0x12, 0x18, 0x1e)
0x24   u8           range/area class            (inferred)
0x26   u8           element of the attack       (measured — see below)
0x29   u8 × 3       three effect-code slots; 0x00 and 0xff mean "empty slot"
0x2c   u8 × 6       the effects' parameters: which element a Resist resists, aim, flags
0x32   u16 LE       the spell's cost in spell points
0x34   33 bytes     the name, ASCII, NUL-padded
```

Worked examples straight out of the file:

| # | Name | Cost | Element | Code slots |
|---|---|---|---|---|
| 0 | `Stamina` | 60 | none | `0c` |
| 1 | `Sanctuary` | 300 | none | `05` |
| 2 | `Light` | 120 | none | `11` |
| 3 | `Wanderlight` | 150 | none | `11` |
| 9 | `Open` | 300 | none | `13` |
| 4 | `Wizard Lock` | 300 | none | `12` |
| 16 | `Fireball` | 325 | **fire** | `04` |
| 18 | `Levitate` | 50 | none | `10` |
| 24 | `Invisibility` | 150 | none | `0f` |
| 61 | `Fire Dart` | 82 | **fire** | `04` |

### Three code slots, not nine bytes of codes

The first pass at this file read `0x29…0x31` as one flat list of effect codes. That looks right
for the simple spells — every one of them has its code in the first slot — and it goes wrong
exactly where the shipped *artefact* spells are: `Heal`'s parameter byte at `0x2c` is `01`, which
a flat scan reads as a second effect, and `Lord's Mail`'s `… 14 03 18 | 00 01` would come out of
the decoder as five effects rather than three. The three-slot window and the six parameter bytes
are what the file's own structure shows:

* `Open` `13` and `Wizard Lock` `12` — the game's two opposite lock spells, adjacent codes, in
  the right order;
* every one of `Heal`, `Light Heal`, `Stamina`, `Heal True` carries `0c` and no damage spell does;
* all four `Resist` spells carry `0a`, and nothing else in the file does;
* `Shield`, `Earth Wall` and `Force Wall` all carry `02`;
* `Passwall` and `Pitfalls` both carry `06`.

### The element byte at 0x26 (measured)

| Value | Element | Spells that prove it |
|---|---|---|
| 0 | fire | `Fire Dart`, `Fireball`, `Fire Storm`, `Wildfire`, `Wizard's Fire`, `Gods' Fire` |
| 1 | cold | `Ice Bolt`, `Ice Storm` |
| 2 | poison | `Toxic Cloud`, `Wyvern's Sting`, `Witch's Curse`, `Cause Disease` |
| 3 | shock | `Shock`, `Lightning`, `Force Bolt` |
| 4 | magic | `Wizard Rend`, `Volendrung`, `Silence`, `Spell Drain`, `Auriel's Bow`, … |
| 5 | none | everything that attacks nothing: `Heal`, `Light`, `Levitate`, `Open`, … |

The parameters at `0x2c` carry the *resisted* element the same way: `Resist Fire` is a 0,
`Resist Cold` a 1, `Resist Shock` a 2.

## The effect codes

| Code | Effect | Read from |
|---|---|---|
| `02` | ward (blows turned aside) | `Shield`, `Earth Wall`, `Force Wall` |
| `03` | cure | `Cure Poison`, `Cure Disease` |
| `04` | damage | `Fire Dart`, `Fireball`, `Ice Bolt`, `Shock`, `Lightning`, `Toxic Cloud`, … |
| `05` | ward (Sanctuary's own) | `Sanctuary` |
| `06` | passwall | `Passwall`, `Pitfalls` |
| `0a` | resist | `Resist Fire`/`Cold`/`Shock`/`Poison` |
| `0b` | strength | `Orc Strength` |
| `0c` | heal | `Stamina`, `Heal`, `Light Heal`, `Heal True` |
| `0d` | drain | `Strength Leech`, `Lifesteal` |
| `0f` | invisibility | `Invisibility` |
| `10` | levitate | `Levitate` |
| `11` | light | `Light`, `Wanderlight` |
| `12` | lock | `Wizard Lock` |
| `13` | open | `Open` |
| `14` | regeneration | `Troll's Blood` |
| `15` | silence | `Silence`, `Far Silence` |
| `17` | mirror | `Shalidor's Mirror` |
| `18` | spell shield | `Spell Shield` |

**Three codes are carried and not named**, which is a real gap and is recorded as one rather than
papered over: `01` on `Wildfire` alone, `09` on `Volendrung` alone, and `16` on `Staff of Magnus`
and `Necromancer's Amulet`. Those four spells take their meaning from their names and their
elements, and the unit test fails if a fifth spell starts carrying an unexplained code.

`SPELLMKR.TXT`'s `#NN` numbering is **not** this numbering: `#00` is disease and `#02` is fear,
while a record's `02` is the ward `Shield` wears. The file is parsed as a bank of templates for
the spellmaker's screen, and no join between the two numbering schemes is claimed, because the
data does not contain one.

## What is still inferred, or this project's

* the **six-magnitude table** is read as one magnitude per effect — `Gods' Fire` is
  `100, 100, 100, 100` and `Purify`'s is `100, 100, 100, 1, 100, 1`, which is the shape of a
  four-effect artefact spell — but it is *not* used as points of damage, because `Fireball`'s is
  `1, 1, 4, 12, 1`: that is a skill progression, not a damage roll;
* the byte at `0x24` is read as a range/area class and is not used;
* **the numbers** — how much a `Fireball` hits for, how long a light lasts, how much a ward
  turns aside — are `src/game/spells.js`'s, said out loud in the game by `CASTING_NOTE`,
  because Arena's own progression tables live in `A.EXE` (`docs/DECISIONS.md` D11);
* a spell's **spell points** cost is the file's (that is `0x32`, and it matches Arena's
  documented list); what a **Mages Guild charges in gold** for it is
  `src/game/services.js`'s `guildPrice`.
