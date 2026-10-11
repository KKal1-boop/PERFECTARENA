# PERFECTARENA

*The Elder Scrolls: Arena* (1994), reimagined on the WebGL2 engine from
`c:/arenaproject/daggerfall`. Reads Arena's original data from **your own Arena
folder** at runtime — no game data is bundled.

> **Status: Milestone 1 (survey and decisions) complete.** The game itself is not
> playable yet — Milestone 2 brings up the renderer on a test map. See
> [docs/PROGRESS.md](docs/PROGRESS.md) for exactly what does and does not run.

## Documentation

| File | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What is reused from the engine, what is new, and why |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every non-obvious decision, its rationale and the rejected alternatives |
| [docs/FORMATS.md](docs/FORMATS.md) | Arena binary formats as reverse-engineered (verified vs unverified) |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Status, simplifications, and unverified items |

## Requirements

* A copy of The Elder Scrolls: Arena (the freeware release) — the folder
  containing `GLOBAL.BSA`, `ARENA/`, etc.
* A static web server (any will do) and a WebGL2 browser.

## Run

```
node tools/serve.mjs          # or: py -m http.server 8080
```
Then open <http://localhost:8080>. The first launch asks for your Arena folder.

*(This command arrives with Milestone 2.)*

## Tests

```
ARENA_PATH=/path/to/arena node --test tests/unit/*.test.mjs   # data-format tests
node tests/run-browser.mjs                                    # headless browser tests
```

*(Arrives with Milestone 3.)*
