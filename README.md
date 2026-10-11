# PERFECTARENA

*The Elder Scrolls: Arena* (1994), reimagined on the WebGL2 engine from
`c:/arenaproject/daggerfall`. Reads Arena's original data **from your own Arena
folder at runtime** — no game data is bundled, copied into the build, or committed.

> **Status: Milestone 2 (scaffold and test map) complete.** The engine runs inside
> PERFECTARENA on a hand-made courtyard: renderer, fixed-step game loop, movement,
> collision, sky and lighting. Arena's own maps are not read yet — that is
> Milestone 3. See [docs/PROGRESS.md](docs/PROGRESS.md) for exactly what is and is
> not verified.

## Run

Requires **Node 20+** (only to serve files) and a **WebGL2 browser**.

```
node tools/serve.mjs                       # then open http://localhost:8080/
```

Port 8080 is taken? `node tools/serve.mjs 9000`, or let the OS choose with
`node tools/serve.mjs 0`. No Python? `py -m http.server 8080` works too, but the
bundled server is what the tests use.

Then open **<http://localhost:8080/?test>** — Milestone 2's test courtyard.

`npm run dev` is the same thing on port 8080.

### Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | move |
| mouse (click to capture) | look |
| `Shift` | run |
| `Space` | jump |
| `C` | crouch |

## Test

```
node --test tests/unit/            # data-format tests over the real Arena files
node tests/run-browser.mjs         # headless Chrome/Edge, WebGL2, screenshots
```

The browser suite boots the game in headless Chromium, drives `window.__debug`,
fails on console errors and WebGL misuse warnings, and asserts the screenshot is a
real picture (sky on top, ground below, hard colour edges). Screenshots are written
to `tests/shots/`.

* `ARENA_PATH=/path/to/arena node --test tests/unit/` — where the Arena data
  lives. Nothing but the tests needs it.
* No Chromium-family browser found? Set `CHROME_PATH`. The suite exits with code 2
  and says so rather than passing silently.

## Documentation

| File | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What is reused from the engine, module by module, and what is new |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every non-obvious decision with its rationale and the rejected alternatives |
| [docs/FORMATS.md](docs/FORMATS.md) | Arena's binary formats as reverse-engineered (verified vs unverified) |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Status, simplifications, verified/broken, next |

## Layout

```
index.html            the game
src/main.js           entry: renderer + scene routing
src/engine/           copied verbatim from the daggerfall tree (see PROVENANCE.md)
src/arena/            Arena data layer: BSA, MIF, INF, images, text, tables
src/game/             Arena rules and world model: quest, chargen, items, combat
src/scenes/           one host per scene: testmap, city, dungeon, wild, worldmap
tools/                serve.mjs, copy-engine.mjs, format inspectors
tests/                unit/ (Node) and run-browser.mjs + cdp.mjs (headless Chrome)
```

`src/engine/` is **copied, never hand-edited** — `tools/copy-engine.mjs` re-runs the
copy and `src/engine/PROVENANCE.md` records what came from where. Arena-specific
changes belong in `src/arena/`, `src/game/` or `src/scenes/`.

## Licence

Engine code is MIT (from Daggerfall Enhanced, which carries Daggerfall Unity's MIT
notice). Arena's data is freeware but not redistributable: it never enters this
repository or its build, and is read at runtime from the player's own copy.
