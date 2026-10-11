# PERFECTARENA — Progress

*Re-read this file first after any context reset.*

**Current milestone: 1 (survey and decisions) — COMPLETE.**
Next: Milestone 2 (scaffold + hand-made test map).

---

## Status by milestone

| # | Milestone | Status |
|---|---|---|
| 1 | Survey and decisions (docs) | ✅ done — this document, ARCHITECTURE, DECISIONS, FORMATS |
| 2 | Scaffold + hand-made test map | ⬜ not started |
| 3 | MIF pipeline (decompress, parse, mesh, walk a real interior) | ⬜ not started |
| 4 | Vertical slice (chargen → city → dungeon → staff piece → save/load) | ⬜ not started |
| 5 | Full content (all provinces, all staff pieces, main quest completable) | ⬜ not started |
| 6 | Systems and polish (magic, inventory, audio, performance) | ⬜ not started |

---

## Milestone 1 — what was done

### Verifiable commands run

| Command | Result |
|---|---|
| `node tools/inspect.mjs GLOBAL.BSA START.MIF IMPPAL.MIF RANDOM1.MIF` | BSA directory decoded; MIF headers and chunk tags listed |
| `node tools/probe2.mjs` | loose file headers, BSA record extraction, entry census by extension |
| Node one-liners over `CITYDATA.64`, `SPELLSG.65`, `SPELLS.65`, `STATES.65` | province layout and record sizes confirmed by arithmetic |

(The Node used was the portable v22.11.0 installed into `.devtools/` — see
DECISIONS.md D8. `.devtools/` and `.scratch/` are git-ignored.)

### Verified

* **Arena BSA layout** — `uint16 count` at 0, payloads from offset 2 **with no
  directory-type field**, 18-byte directory (14-byte name + `int32` size) at the
  end. Confirmed by the size sum: Σ sizes = 16 758 196, directory at 16 758 198.
  2 441 records enumerated by extension.
* **MIF header** — `MHDR` + 61-byte payload; `startX/startY[4]`, `startingLevel`,
  `levelCount`, `width`, `height`. Read on four real files (`START.MIF` 50×50,
  `IMPPAL.MIF` 50×50 ×4 levels, `RANDOM1.MIF` 32×32 ×32 levels).
* **MIF chunk framing** — `FLOR`/`MAP1` compressed size *includes* the
  uncompressed-size field; `uncompressed == width × height × 2` exactly (5 000 for
  50×50).
* **INF is text**; **INF inside `GLOBAL.BSA` is encrypted** while loose INF files
  are plaintext (verified by the first bytes of the archive's `CAS.INF` vs the
  folder's `IMPPAL1.INF`), and the INF section/directive/filename grammar
  (`@FLOORS`, `*BOXCAP n`, `file.set  #n`, `*CEILING`).
* **`CITYDATA.64` = 9 provinces × 1 228 bytes**, with the province name, 8
  city-states, 8 towns + 16 villages, and 16 dungeon entries at fixed offsets,
  confirmed by the name positions of `High Rock`, `Hammerfell` … `Imperial
  Province`.
* **Record sizes:** `SPELLSG.65` = `SPELLS.LST` = 10 880 = 128 × 85;
  `SPELLS.65` = 2 720 = 32 × 85; `STATES.65` = 28 800 = 64 × 450;
  `WILD001.RMD` = 24 576 = 64 × 64 × 6; `.COL` = 776 = 8 + 256×3.
* **`A.EXE` is absent** from the provided data (recon finding; consequences in
  DECISIONS.md D5).
* The engine survey: entry point, renderer, hosts, input, UI stack, and the
  minimum renderer call sequence for a host (from `scenes/interior.js`).

### Broken / not yet established (UNVERIFIED)

* **The Type08 decompressor is not written yet.** Only the container framing is
  known. Without it no MIF voxel layer can be read — this is the first task of
  Milestone 3. Known-good vectors recorded in FORMATS.md §5.
* **Voxel-ID bitfield semantics** (which field is the texture index, which is the
  wall class, how `MAP1`/`MAP2` combine) — scheme known, meaning not yet proven.
* **MIF `FLAT` / `INNS` / `LOOT` / `STOR` chunk internals** — opaque; NPC and
  flat placement is therefore unread for now.
* **`.IMG` / `.CIF` / `.SET` / `.DFA` pixel layouts** — sizes and first headers
  known, slicing not confirmed.
* **Arena font glyph packing** — first byte is the max width, width table follows;
  count/height/bitmap packing unknown.
* **`CLASSES.DAT` / `GUARD.DAT` / `RAND.DAT` / `JAGTEMP.DAT` structure** — unknown.
* **`.64` vs `.65` file roles** — unknown.
* Nothing has been *rendered* yet; every engine claim above is read from source,
  not from a running frame.

---

## Simplifications logged

| # | Simplification | Where / why |
|---|---|---|
| S1 | Rules tables come from documented community tables, not extracted `A.EXE` | `A.EXE` is absent from the provided data (D5). Each table file records its `source`. |
| S2 | No continuous overworld; per-location scenes | Arena's own model, and the engine's streaming world is unfeedable (D2). |
| S3 | `.DEVTOOLS/` holds a portable Node 22 because the machine has no Node | Environment constraint (D8). Git-ignored; not part of the deliverable. |
| S4 | Browser tests will drive system Chrome/Edge over raw CDP rather than Playwright | No Node/npm toolchain on the machine; documented in D8. |
| S5 | Arena UI text may fall back to a built-in bitmap face | Arena font format only partly decoded (FORMATS.md §9); the fallback will be logged again if taken up. |

## Known risks

* **Type08 is the single largest unknown.** If it cannot be reproduced from the
  documented descriptions, Milestone 3 stalls and the fallback is to render
  hand-authored test grids (Milestone 2's deliverable) plus whatever MIF layers
  can be read (a scanner that finds uncompressed-looking layers may still yield
  a real map).
* **The INF↔MIF pairing is on the critical path**, so an undecryptable INF inside
  the archive would block city/dungeon rendering even with a working Type08.
* The engine copy may pull in more of the Daggerfall import graph than the survey
  suggests; pruning is a Milestone 2 task with its own risk of scope creep.
