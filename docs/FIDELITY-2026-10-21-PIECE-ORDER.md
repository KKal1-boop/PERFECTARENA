# Staff-piece order — resolved against the executable (2026-10-21)

The dungeon ID that `0xa46` / `0x47e1` / `0x12a8` carry is a **province index**, in the executable's own province order (read from the image at the anchor `High Rock\0Hammerfell`): 0 High Rock, 1 Hammerfell, 2 Skyrim, 3 Morrowind, 4 Summurset, 5 Valenwood, 6 Elsweyr, 7 Black Marsh. The ID 8 is the Imperial Province, which matches the `cmpb $8` checks at `0x1eed3`-era routines.

The required-province table at `DS:0x80EC` (`DS = 0x3BA0`) is `1 2 5 6 4 0 7 3`. Read through the province list, that gives:

| Pickup | Province | Staff dungeon |
|---|---|---|
| 1 | Hammerfell (1) | Fang Lair |
| 2 | Skyrim (2) | Labyrinthian |
| 3 | Valenwood (5) | Elden Grove |
| 4 | Elsweyr (6) | Halls of Colossus |
| 5 | Summurset (4) | Crystal Tower |
| 6 | High Rock (0) | Crypt of Hearts |
| 7 | Black Marsh (7) | Murkwood |
| 8 | Morrowind (3) | Dagoth-Ur |

This matches the port's `STAFF_DUNGEON_ORDER`, so the port's order is **correct**. The earlier worry that the table implied Labyrinthian first came from reading the ID as a piece-list index; that reading was wrong.

The game enforces the order: entering a staff dungeon whose province isn't the required one fails the `0x1eed3` check and shows message `0x519`.

## Pending-cutscene path (2026-10-21, partial)

- `0x1ecef` tests the pending flag `0xf76`; if it is set and the guard `0xf7a` is clear, it calls `0xa611` at `0x1ed05` after pushing the word at `DS:0xa91a`.
- `0xa91a` is **not a movie ID**. Its neighbours `0xa914`, `0xa918`, `0xa91a` are a 320×200 screen rectangle (`0x013f`, `0x00c7` are written at `0x1167`–`0x1177`), so `0xa611` saves and restores the viewport around a movie. It does not choose the movie.
- After the viewport work, `0x1ed0a` shows a text when `0x1aa == 1`, and `0x1ed44` shows the speech chosen by `0x50e + counter` (`0x1ed9d`), then calls `0xa6b5`. `0xa6b5` is UI drawing (palette and window), not a movie.
- The routine that picks the movie file, and the table behind it, is still not found. Candidate: the movie player `2294:0895` → `0:6546`, which the earlier trace identified. Next step: find which caller passes the file name for each pickup.

## Overlay reliability (2026-10-21)

- The callers of `2294:10ec` (`0x15d17`, `0x15d45`, `0x160e6`, `0x1610b`) and of `2294:0895` (`0x1f2db`, `0x1f2e3`) are clear. But the code at linear `0x23A2C` (= `2294:10ec` if the overlay is mapped at `0x22940`) reads as sprite-position code, not a trigger.
- So the overlay segments in the unpacked image may not be the code that runs. ACD.EXE is PKLITE-packed (174,429 bytes), and overlays may be loaded at run time. Until that is settled, treat overlay readings as unverified. A trustworthy way forward is to run the original under DOSBox and watch which movie opens after each pickup.

## Movie names and call sites — from the main image (reliable, 2026-10-21)

These come from the main code and data, not from an overlay, so they are verified against the image.

**Movie names** (DS `0x3BA0`, file strings): `intro.flc` at `DS:0x4E23`, `title.img` at `0x4E2D`, `morph.flc` at `DS:0x884C`, `walk.flc` at `DS:0x803D`, `aflc2.flc` at `0x8046`, `nujagdth.flc` at `0x8050`, `staff.flc` at `0x805D`, `king.flc` at `0x8067`, `nuking.flc` at `0x8070`, `house.img` at `0x807B`, `vision.flc` at `0x8085` (from the dump; the `0x8090` text pointer is not verified).

**Movie-play call sites** (`lcall 2294:0895` with `SI` set to a name): `0x125F` (intro), `0x41BE` (morph), `0x1F2DB` (walk), `0x1F2E3` (aflc2), `0x1F30D` (staff), `0x1F315` (king). The `1F2xx` block is the finale sequence.

**Finale sequence, in order** (routine at `0x1F2C6`, which has no direct caller; it is reached through a dispatch not yet found): `walk.flc` → `aflc2.flc` → speech `0x57C` → `staff.flc` → `king.flc` → speeches `0x57D` and `0x57F` → then the routine falls through to the next section.

**Piece-related routines**: `0x1F25C` is the after-pickup speech (`0x570 + counter − 1`), with no movie. `0x1F2A1` checks the pending flag and the required province, then calls `0x1EED3` (the dungeon-entry check). Callers of `0x1F2A1`: `0x1C689`, `0x1DFC8`. Caller of `0x1F25C`: `0x1A331`.

**Open:** the dispatch that reaches `0x1F2C6`, and therefore which pickup or palace event plays the finale. That is still the blocker for item 3.

## The finale dispatch (2026-10-21)

- The finale routine at `0x1F2C6` has **no reference** in the main image: no `call`, `jmp` or far call names `0x1F2C6` or `0xF2C6`, and the word `0xF2C6` does not appear in the image.
- So either it is reached from an overlay (a dispatch in segment `0x2294` or `0x26F7` that computes the offset at run time), or it is dead in this image. The main image alone cannot say which.
- Consequence: the piece-to-movie wiring cannot be fully read from the main image. It needs the overlay data, or a run of the original that records which movie opens after each pickup.

## Emulator (2026-10-21)

- DOSBox Staging 0.83.0 portable is unpacked **project-locally** at `C:/ArenaProject/.scratch/dosbox/dosbox-staging-v0.83.0/` (not system-wide). `dosbox_with_debugger.exe --version` runs and reports 0.83.0.
- Plan for the piece-to-movie question: run `ACD.EXE` under the debugger build, breakpoint on DOS `INT 21h` `AH=3Dh` (open file), and set state directly. Set the piece counter `DS:0xF77`, the progression byte `DS:0x1AA`, and the current dungeon `DS:0xA46` to each value, then call the dispatch that reaches `0x1F2C6`. The file opened after each setup is the movie for that state. This tests the real code rather than reading overlays.
- Not done yet: the debugger session and the state-to-movie table.
- **Launch check:** `.scratch/dosbox/run.conf` mounts `C:/ArenaProject/arena/ARENA` and runs `ACD.EXE`. DOSBox started the game in VGA mode 03h and exited cleanly at `atexit` after about 14 seconds, with no error in `run.log`. The exit probably came from the shell command that started it, not from the game, so the next run should be a BACKGROUND process. The debugger session is not yet running.
- **MSCDEX fix:** the game needs its data on a CD-ROM drive (`ARENADATA=D:`). The install's own `arena.conf` mounts the folder as `C:` and as `D:` with `-t cdrom`. Copying that into `run.conf` removes the "MSCDEX DRIVER NOT INSTALLED" error. The log then shows `MSCDEX: Mounted subdirectory: limited support`, and the game keeps running in the background.

## Overlay extraction — route closed (2026-10-21)

- `ACD.EXE` is a plain MZ file (174,429 bytes). The load module covers the whole file, with **no data after it**. No `FBOV` (Borland overlay) signature is in the EXE or the unpacked image. No `.OVR` or `.OVL` file exists in the install.
- So the overlay segments (`0x2294`, `0x26F7`) are not stored as separate overlay data. Either they are part of the same load image, or the game reuses one segment for different code at run time.
- The code at `2294:10EC` reads as sprite-position code, which suggests the segment is reused. The piece-to-movie dispatch therefore can't be read from a fixed segment image. Only a runtime trace (the DOSBox debugger, or a patched run with logging) can say which movie opens for each state.
- **Logging check:** `log_level=debug` in DOSBox Staging logs no DOS file opens. The log has only setup lines. So the movie opens can't be read from the log, and a runtime trace needs the debugger.

## Decision (2026-10-21): accept the port's cutscene order

The user chose to keep the port's current cutscene order and stop matching the original's movie-by-event timing. The following are **accepted deviations**, not open work:

- Which movie plays after each staff-piece pickup. The port's order is kept.
- The palace and ending cutscene sequencing. The port's order is kept.
- The runtime debugger trace, and the keystroke harness that would drive it. Not building.

Still correct and kept: the staff-piece order (matches the original), the finale movie names and order as read from the main image, and the opening sequence.

Still unverified and worth doing separately: the video's chapter timings, the dream's caption timing (an even split), the dream in a browser, and the 32 browser-suite failures in areas not touched this session.

## Decision reverted (2026-10-21): 1:1 is the goal again

The user reverted the earlier decision to accept the port's cutscene order. The goal is a 1:1 match with the original's main quest. The runtime trace (DOSBox debugger harness) is back on the list.

## Harness attempt (2026-10-21): blocked on output

- `dosbox_with_debugger.exe` runs in the background, and PowerShell can focus its window and send `Alt+Pause` with `keybd_event`. That does reach the window.
- But the debugger prints to its **own console window**, not to the process's stdout or the log. The log shows only setup lines. I can't read that window from here, and there is no OCR available to read a screenshot.
- So the harness can't yet report what the debugger shows. The next step is one of: a debugger output route that writes to a file (not found in the help), a screenshot-and-OCR step (no OCR tool installed), or a different runtime probe.

## OCR loop (2026-10-21): working, with limits

- `.scratch/dosbox/shot_ocr.ps1` captures the DOSBox window to a PNG (962×749 for the game window). `.scratch/dosbox/ocr.ps1` reads a PNG with the built-in Windows OCR engine (`en-GB` is installed).
- The OCR reads the DOSBox status line (`ACD.EXE - max 100% cycles/ms`), so the game is confirmed running. It can't read the game's VGA graphics, which is expected.
- The debugger prints text in its own console window. If that window is visible and captured, OCR can read its text. Reading a full debugger session this way is slow and fragile, so the state-injection run is still multi-session work.

## Debugger attempt (2026-10-21): not opened

- A visible `dosbox_with_debugger.exe` launched, but the `Alt+Pause` key went to a stale PID, so the debugger never opened. The OCR capture showed only the game status line, and no debugger text.
- Next session: have the key script take the live PID of the window it launched, confirm the debugger prompt with an OCR capture, then type `HELP` and check the output. Only then start state injection.

## Debugger attempt 2 (2026-10-21): still not opened

- The launch and key script now use the live PID from `Start-Process`. Alt+Pause and `HELP` were sent, but the OCR capture showed the game's status line and other windows, not the debugger prompt. The keystrokes don't reach the debugger's console reliably from here.
- Conclusion: keystroke-driven access to the debugger is too brittle for this session. Any next attempt needs a different control path for the debugger, not more keystrokes.

## Movie lengths (measured from the FLC headers, 2026-10-21)

Duration = frame count × per-frame delay from each file's header. These are the movie's own length, before any captions or holds.

| File | Frames | Delay | Length | Where it plays (evidence) |
|---|---|---|---|---|
| SCROLL.FLC | 50 | 42 ms | 2.1 s | opening scroll, before the menu (OpenTESArena startup) |
| INTRO.FLC | 76 | 142 ms | 10.8 s | startup intro (the port plays it after creation) |
| VISION.FLC | 20 | 171 ms | 3.4 s | post-creation dream, with Ria's captions |
| CHAOSVSN.FLC | 31 | 114 ms | 3.5 s | vision of chaos (placement not decoded) |
| MORPH.FLC | 27 | 114 ms | 3.1 s | called at `0x41BE` (event not identified) |
| JAGAR.FLC | 28 | 128 ms | 3.6 s | Tharn (placement not decoded) |
| JAGRSHLD.FLC | 17 | 128 ms | 2.2 s | Tharn's shield (placement not decoded) |
| JAGARDTH.FLC | 58 | 128 ms | 7.4 s | Tharn's death (placement not decoded) |
| NUJAGDTH.FLC | 62 | 142 ms | 8.8 s | new Tharn's fall (placement not decoded) |
| WALK.FLC | 390 | 114 ms | 44.5 s | finale block, first movie (`0x1F2D8`) |
| AFLC2.FLC | 30 | 114 ms | 3.4 s | finale block, second movie (`0x1F2E0`) |
| STAFF.FLC | 31 | 114 ms | 3.5 s | finale block, after a speech (`0x1F30D`) |
| KING.FLC | 90 | 114 ms | 10.3 s | finale block, last movie (`0x1F315`) |
| NUKING.FLC | 17 | 114 ms | 1.9 s | revised Emperor shot (not in the main story) |
| END01.FLC | 21 | 185 ms | 3.9 s | first ending (placement not decoded) |
| END02.FLC | 55 | 114 ms | 6.3 s | second ending (placement not decoded) |
| WARHAFT.FLC | 18 | 128 ms | 2.3 s | cut slide (not in the final game) |

**Placement is only partly known.** Only the finale block (`WALK` → `AFLC2` → speech → `STAFF` → `KING`) and the opening (`SCROLL`, `INTRO`) are read from the main image. The rest is inferred from names. UESP lists the movies but not where they play, and a Reddit thread on the full story wasn't readable.

## The finale block is unreferenced (2026-10-21)

- Searched the full disassembly and the image for `1F2C6` / `F2C6` in every form: no `call`, `jmp`, far call, immediate, or word pointer (`c6 f2` appears 0 times in the image).
- So the routine that plays WALK → AFLC2 → speech → STAFF → KING is **dead code in this `ACD.EXE`**. It is not evidence for how the game ends. The earlier idea that it was the finale is withdrawn.
- The port's current ending chain (`JAGARDTH.FLC` then `END01.FLC`) is not contradicted by this block. The real ending trigger is still unknown.
- `storyBeats.js` now carries a comment saying this.
