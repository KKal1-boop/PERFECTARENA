import path from 'node:path';

export function makeSceneVisualsSuite({ check, realErrors, shots, getPort, decodePng }) {
  return async function sceneVisuals(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const url = `http://localhost:${getPort()}/?arena=${encodeURIComponent(arena)}`;
    const ready = () => page.waitFor('window.__debug?.light && window.__debug.state().painted > 3',
      { timeoutMs: 90000, label: 'scene ready' });
    const paint = () => page.evalJs('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    const shot = async (name) => decodePng(await page.screenshot(path.join(shots, name)));
    const difference = (a, b) => {
      let changed = 0, brighter = 0;
      for (let y = 10; y < a.height * 0.7; y++) for (let x = 10; x < a.width - 10; x++) {
        const i = (y * a.width + x) * 4;
        const delta = a.data[i] + a.data[i + 1] + a.data[i + 2] - b.data[i] - b.data[i + 1] - b.data[i + 2];
        if (Math.abs(delta) > 6) changed++;
        if (delta > 6) brighter++;
      }
      return { changed, brighter };
    };
    await page.goto(`${url}&interior=START.MIF`); await ready();
    await page.evalJs('window.__debug.pause(true); document.getElementById("arrival").classList.remove("on"); window.__debug.sceneEffects(true,false)');
    await paint();
    const lit = await shot('visual-room-lit.png');
    const room = await page.evalJs('window.__debug.light()');
    await page.evalJs('window.__debug.sceneEffects(false,false)'); await paint();
    const unlit = await shot('visual-room-unlit.png');
    const local = difference(lit, unlit);
    check('interior point lights actually brighten rendered geometry, not only a light counter',
      room.pointLights > 0 && local.brighter > 100, `${JSON.stringify(local)}, lights ${room.pointLights}`);
    await page.evalJs('window.__debug.sceneEffects(true,true)'); await paint();
    const air = await page.evalJs('window.__debug.light()');
    check('dungeon air draws a bounded set of ambient particles', air.ambientParticles > 0 && air.ambientParticles <= 64, `${air.ambientParticles} particles`);
    await shot('visual-room-atmosphere.png');

    await page.goto(`${url}&location=Daggerfall`); await ready();
    await page.evalJs('window.__debug.pause(true); document.getElementById("arrival").classList.remove("on"); window.__debug.setClock(1380); window.__debug.teleportToDoor("equipment"); window.__debug.sceneEffects(true,false)');
    await paint();
    const night = await page.evalJs('window.__debug.light()');
    const nightLit = await shot('visual-night-door-lit.png');
    await page.evalJs('window.__debug.sceneEffects(false,false)'); await paint();
    const nightDark = await shot('visual-night-door-unlit.png');
    const lanterns = difference(nightLit, nightDark);
    check('nighttime door lights illuminate the city street in pixels', night.pointLights > 0 && lanterns.brighter > 100,
      `${JSON.stringify(lanterns)}, lights ${night.pointLights}`);
    await page.evalJs('window.__debug.sceneEffects(true,true); window.__debug.setClock(600); window.__debug.look(0,0.65)'); await paint();
    const sky = await shot('visual-sky-clean.png');
    let debugPixels = 0;
    for (let y = 0; y < sky.height * 0.3; y++) for (let x = 0; x < sky.width; x++) {
      const i = (y * sky.width + x) * 4, r = sky.data[i], g = sky.data[i + 1], b = sky.data[i + 2];
      if ((r > 140 && r > g * 2.5 && r > b * 2.5) || (g > 140 && g > r * 2.5 && g > b * 2.5)) debugPixels++;
    }
    check('rendered daytime sky contains no VGA red/green palette streaks', debugPixels === 0, `${debugPixels} saturated debug pixels`);
    const layout = await page.evalJs(`(() => {
      const frame = document.createElement('iframe'); frame.style.cssText = 'width:549px;height:900px;position:fixed;left:-2000px';
      document.body.appendChild(frame);
      return new Promise(resolve => {
        frame.onload = () => {
          const doc = frame.contentDocument;
          const box = doc.getElementById('hud'); box.textContent = 'A long objective and control line '.repeat(80);
          doc.body.classList.add('combat-on');
          const combat = doc.getElementById('combat'); combat.classList.add('on'); combat.textContent = 'Health 60/60';
          const a = box.getBoundingClientRect(), b = combat.getBoundingClientRect();
          const style = frame.contentWindow.getComputedStyle(box);
          const result = { wraps: style.whiteSpace === 'pre-wrap', scrolls: style.overflowY === 'auto',
            separate: b.bottom <= a.top, inside: a.left >= 0 && a.right <= 549 };
          frame.remove(); resolve(result);
        };
        frame.srcdoc = '<!doctype html><style>' + document.querySelector('style').textContent + '</style><body><div id="hud"></div><div id="combat"></div></body>';
      });
    })()`);
    check('narrow HUD wraps and scrolls without overlapping combat status', layout.wraps && layout.scrolls && layout.separate && layout.inside, JSON.stringify(layout));
    check('scene visuals produce no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map(e => e.text).join(' | ').slice(0, 400));
    const warnings = page.consoleMessages().filter(e => /INVALID_OPERATION|INVALID_VALUE|GL_INVALID/.test(e.text));
    check('scene effects produce no WebGL misuse warnings', warnings.length === 0, warnings.map(e => e.text).join(' | ').slice(0, 400));
  };
}
