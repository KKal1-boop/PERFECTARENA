# Engine provenance

Copied verbatim from `c:/arenaproject/daggerfall/src` by
`tools/copy-engine.mjs`. The daggerfall tree is read-only; do not edit
`src/engine/` by hand — re-run the copy tool and put Arena-specific changes in
`src/arena/`, `src/game/` or `src/scenes/`.

Entry modules requested:

- `render/renderer.js`
- `render/skyRenderer.js`
- `world/mat4.js`
- `world/quat.js`
- `world/perlin.js`
- `player/pointerLock.js`
- `player/lookFilter.js`
- `player/motor.js`
- `player/collider.js`
- `player/mwCamera.js`
- `ui/text.js`
- `ui/cursor.js`
- `ui/windowStack.js`
- `ui/fpsCounter.js`
- `ui/input.js`
- `ui/touch.js`
- `ui/gamepadInput.js`
- `ui/lookSettings.js`
- `ui/viewSettings.js`
- `ui/hudShortcuts.js`
- `ui/nativePanel.js`
- `ui/screenshot.js`
- `ui/bitmapCanvas.js`
- `ui/touchDevice.js`
- `systems/settings.js`
- `systems/uiPrefs.js`
- `systems/frameCap.js`
- `ui/crashText.js`
- `systems/audio.js`
- `systems/timeScale.js`
- `formats/flcFile.js`
- `formats/dfPalette.js`

Closure size: 154 modules.

buildTag.js first line: `unknown`

---

## Ports added after the base copy

**`render/precipitation.js`** (631 lines) — the twin's rain and snow, copied verbatim with
`node tools/copy-engine.mjs --only=render/precipitation.js` (closure: `glProgram.js`). Arena
drives it from its own four weather letters, which live in the level's `.INF` *filename*
(`src/game/arenaSky.js`: `skyClimateOf`, `precipitationMode`), and draws it over the world in
`src/scenes/interior.js`'s `drawWeather`. `state().weather` and `state().precipitation` report
what it is doing.

## ⚠ A full re-copy is destructive

The promise above was broken early and has stayed broken: several files in `src/engine/` are
**forked**, and the largest is `render/renderer.js`, which carries roughly 1 900 lines of
PERFECTARENA work (the `uCutout` uniform and the sub-mesh cutout flag that draws Arena's
signs, banners and hedges as pictures on holes rather than black panels; the texture-record
rules; the billboard-pass changes). Running `node tools/copy-engine.mjs` with no arguments
copies over every one of those files and deletes that work silently.

Before a full run, check what is forked:

```
git diff --stat src/engine     # every file listed here is lost by a full run
```

and copy modules one at a time with `--only=<path relative to daggerfall/src>` until the forks
have been moved into `src/arena/`, `src/game/` or `src/scenes/`.
