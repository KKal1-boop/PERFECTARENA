
## 2026-10-16 (evening) — the people turn, and a province's street is its own

**What changed.** (1) The archive's sprite digit is read as a **direction** (D-47): the town's
men and women are one figure drawn from five sides, instead of five frozen one-angle figures, so
every person in a street turns as the player walks around them — the owner's *"they dont have a
proper 360 walking animation or going around them 360 animation"*. (2) A province's crowd is
drawn from **its own art pool** (D-45): Black Marsh's streets are mostly the Lizard Man's own
sheets standing in for the Argonians this install does not draw (`a lizard-folk of the marsh`),
and each province's street has its own mix of cloth, leather, armour and watch.

**What the player can now see.** Walk around a man or woman of the town and they turn to face
you, profile, and back (measured: `MLGEN01W.CFA` view 1 → `MLGEN05W.CFA` view 5). Enter a Black
Marsh city — Lilmoth or Stormhold — and **27 of its 48 figures** are lizard-folk; enter Daggerfall
or Necrom and none are. A talk panel's heading and the figure in front of the player are the same
person, before, during and after a conversation (20 people probed, 0 mismatches).

**Commands that prove it.**
```
ARENA_PATH=C:/ArenaProject/arena/ARENA npm test                    → 561/561, exit 0
ARENA_PATH=... node tests/run-browser.mjs townsfolk                → 65/65
ARENA_PATH=... node tests/run-browser.mjs city                     → 38/38
ARENA_PATH=... node tests/run-browser.mjs world                    → 28/28
ARENA_PATH=... node tests/run-browser.mjs audit                    → 26/26
ARENA_PATH=... node tests/run-browser.mjs living                   → 37/37
ARENA_PATH=... node tests/run-browser.mjs movement                 → 11/11
ARENA_PATH=... node .scratch/provincefaces.mjs                     → the lizard-folk counts above
```
Commits: `a79d885` (the direction), `3dc85c9` (the province's art).

**What is NOT established.** (a) The **race palette**: six of the nine provinces' humans are
still the archive's single human body — Arena's per-race recolour lives in `ACD.EXE` and has not
been read (the next probe is B24's numeric tables, item 0b). (b) The owner's *"some npcs dont
move"* (D-44) was **not probed this pass**; it is the next item in the queue. (c) The wilderness
reload ("barely moving … reloads the game") and the two-map coherence are untouched. (d) The
other browser suites (`chargen`, `menu`, `mainquest`, `combat`, `actioncombat`, `doors`,
`gear`, `generated`, `hunt`, `commerce`, `guilds`, `regard`, `radiant`, `story`, `cutscene`,
`scenevisuals`, `sky`, `progression`, `bounties`, `exe`, `worldmap`, `persist`, `dungeonplay`,
`interior`, `testmap`) were **not re-run** after D-45's change to `interior.js`; `world`,
`city`, `audit`, `living` and `movement` were, and they cover the crowd's own path.
