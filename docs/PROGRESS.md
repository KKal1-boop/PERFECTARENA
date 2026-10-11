# PERFECTARENA — Progress

*Re-read this file first after any context reset.*

**Current milestone: 2 (scaffold + hand-made test map) — COMPLETE.**
Next: Milestone 3 (MIF pipeline: decompress, parse, mesh, walk a real Arena interior).

---

## Status by milestone

| # | Milestone | Status |
|---|---|---|
| 1 | Survey and decisions (docs) | ✅ done — this document, ARCHITECTURE, DECISIONS, FORMATS |
| 2 | Scaffold + hand-made test map | ✅ done — renderer, loop, movement, collision, sky, lighting; 21/21 browser checks |
| 3 | MIF pipeline (decompress, parse, mesh, walk a real interior) | ⬜ in progress |
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

## Milestone 2 — what was done

### Verifiable commands run

| Command | Result |
|---|---|
| `node tools/copy-engine.mjs` | 154 engine modules copied into `src/engine/`, preserving paths; provenance recorded |
| `node tests/run-browser.mjs` | **21/21 checks passed** against headless Chrome with WebGL2; screenshot in `tests/shots/m2-testmap.png` |
| `node tools/serve.mjs` + browser | the one-command run, exercised by every browser test |

### Verified (all by running it, in headless Chrome)

* The engine's WebGL2 `Renderer` boots inside PERFECTARENA and draws a mesh built
  by hand: **3 draw calls, 164 triangles, 3 sub-meshes, 3 textures**.
* The **sky** renders above the horizon and **the ground below it** (measured on
  the captured PNG: top band `rgb(138,151,176)`, bottom band `rgb(110,109,99)`).
* The frame is a **picture, not a gradient**: 451 distinct colours, 2.0% dominant
  colour, 97 hard colour edges along the best scanline.
* **Movement**: holding `W` moves the player 3.9 units in 0.9 s (real key events
  through CDP `Input.dispatchKeyEvent`).
* **Collision**: walking into the west wall stops the capsule at
  `x = -23.65` with the wall face at `-24.00` and a capsule radius of `0.35` — the
  exact engine contact distance. The player does not fall through the floor.
* **Lighting and fog** apply (surfaces are shaded, not flat albedo; distance the
  same).
* **No console errors, no uncaught page errors, and no WebGL misuse warnings.**
* The `__debug` seam works from the page: `state()`, `teleport()`, `look()`,
  `input()`, `advance()`, `shotPose()`.

### Two real bugs the tests caught (both fixed, both worth recording)

1. **A foreign pass leaves the renderer's state shadows stale.** `SkyRenderer.draw`
   binds its own program and VAO. The engine expects the host to call
   `renderer.markForeignPass()` afterwards; without it the mesh drew with the sky's
   program still bound — silently, with three `INVALID_OPERATION` warnings a frame
   and the courtyard rendered *as sky*. The screenshot check is what found it:
   dominant colour went from 50.6% → 2.0% once the mesh actually drew.
2. **A sub-mesh whose texture is missing draws untextured, not black.** Three
   textures were uploaded under records 1/2/3 while the mesh asked for 0/1/2, so
   the floor was lit but featureless — 0 hard edges on any scanline. `state()` now
   reports `missingTextures`, and the suite asserts it is empty for every
   sub-mesh. **The lesson: "3 textures uploaded" is not "the textures the mesh
   asked for were uploaded".**

### Environment finding

* The machine has no Node/npm/Python on `PATH`. A portable Node 22 lives in
  `.devtools/` (git-ignored) for the tools and tests; `package.json` still declares
  normal `npm` scripts for anyone with a toolchain. Details in DECISIONS.md D8.

---

## Simplifications logged

| # | Simplification | Where / why |
|---|---|---|
| S1 | Rules tables come from documented community tables, not extracted `A.EXE` | `A.EXE` is absent from the provided data (D5). Each table file records its `source`. |
| S2 | No continuous overworld; per-location scenes | Arena's own model, and the engine's streaming world is unfeedable (D2). |
| S3 | `.DEVTOOLS/` holds a portable Node 22 because the machine has no Node | Environment constraint (D8). Git-ignored; not part of the deliverable. |
| S4 | Browser tests will drive system Chrome/Edge over raw CDP rather than Playwright | No Node/npm toolchain on the machine; documented in D8. |
| S5 | Arena UI text may fall back to a built-in bitmap face | Arena font format only partly decoded (FORMATS.md §9); the fallback will be logged again if taken up. |
| S6 | Milestone 2's HUD is a **DOM** overlay, not the engine's GL text pass | The GL text path needs an FNT font; Arena's font format is still only partly decoded (§9). The Arena windows (character sheet, inventory, quest log, dialog, map) will use the engine's GL UI once `arena/font.js` exists. |
| S7 | Both triangle windings are emitted by the test map | Proves visibility without knowing the engine's winding law yet. `game/mifMesh.js` (M3) emits ONE winding, and the walk-through test is what proves it is the right one. |
| S8 | No audio yet | `.VOC`/`.XFM` decoding is Milestone 6; the engine's WebAudio layer is copied and unused. |

## Known risks

* **Milestone 4 is where the DOM HUD has to go** — the Arena windows are meant to
  draw through the engine's GL UI pass, so `arena/font.js` (or the built-in face
  fallback, S5/S6) is on the critical path for the character sheet, inventory and
  quest log.

* **Type08 is the single largest unknown.** If it cannot be reproduced from the
  documented descriptions, Milestone 3 stalls and the fallback is to render
  hand-authored test grids (Milestone 2's deliverable) plus whatever MIF layers
  can be read (a scanner that finds uncompressed-looking layers may still yield
  a real map).
* **The INF↔MIF pairing is on the critical path**, so an undecryptable INF inside
  the archive would block city/dungeon rendering even with a working Type08.
* The engine copy may pull in more of the Daggerfall import graph than the survey
  suggests; pruning is a Milestone 2 task with its own risk of scope creep.
