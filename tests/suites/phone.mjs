// THE PHONE IN HAND, ON A REAL PAGE (2026-10-22).
//
// The owner played this on Android and reported four things:
//
//   1. *"in chrome when i click it starts saying 'change app to see the cursor again' and i cant
//      look around"* — a pointer lock requested on a screen whose only pointer is a finger, which
//      is the browser's own permission banner sitting over the world;
//   2. *"the local dungeon map on android is too big and you cant zoom in or out and you cant
//      reach the leave button cause its out of the screen and you get stuck"*;
//   3. *"the part of the gui that says 'CITY2.MIF city seed … 128x128 cells … quads … materials'
//      should not at all be there while playing on phone"*.
//
// So this suite **is** a phone: Chrome's touch emulation makes the page answer `(any-pointer:
// coarse)` / `(hover: none)`, the window is a 412×915 phone and then the same phone turned
// sideways, and the gestures are real `Input.dispatchTouchEvent` touches — the layer's own law
// (`ui/touchDevice.js`), the layer itself, the camera, and the sheet.
//
//   node tests/run-browser.mjs phone
//
// Run it alone or in the full run; it puts the browser back to a desk in `finally`, because the
// emulation belongs to the page the next suite inherits.

export function makePhoneSuite({ check, getPort }) {
  return async function phone(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const metrics = (width, height, mobile) => page.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile,
    });
    const touchMode = (enabled) => page.send('Emulation.setTouchEmulationEnabled', { enabled, maxTouchPoints: 5 });
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const touch = (type, points) => page.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    /** One finger, dragging across the world in `steps` real touch moves. */
    const drag = async (from, to, steps = 6) => {
      await touch('touchStart', [{ x: from.x, y: from.y, id: 1 }]);
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await touch('touchMove', [{ x, y, id: 1 }]);
        await wait(30);
      }
      await touch('touchEnd', []);
      await wait(200);
    };
    /** What the panel's own layout says: is every way out of it on the screen? */
    const panelBox = () => page.evalJs(`(() => {
      const inView = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5;
      };
      const panel = document.querySelector('#automap .panel');
      const canvas = document.getElementById('automap-canvas');
      const p = panel.getBoundingClientRect();
      return {
        vw: innerWidth, vh: innerHeight,
        open: document.getElementById('automap').classList.contains('on'),
        panelIn: inView(panel), closeIn: inView(document.querySelector('[data-automap="close"]')),
        fitIn: inView(document.querySelector('[data-automap="fit"]')),
        panel: { w: Math.round(p.width), h: Math.round(p.height) },
        canvas: { w: Math.round(canvas.getBoundingClientRect().width), h: Math.round(canvas.getBoundingClientRect().height) },
        scroll: panel.scrollHeight - panel.clientHeight,
      };
    })()`);
    const bearing = () => page.evalJs('document.getElementById("compass-face")?.textContent ?? ""');

    try {
      // ── a phone, and a page that says so ───────────────────────────────────
      await touchMode(true);
      await metrics(412, 915, true);
      await page.goto(`http://localhost:${getPort()}/?interior=START.MIF&${q}`);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 3',
        { timeoutMs: 90000, label: 'a level on a phone' });

      const media = await page.evalJs(`({
        fine: matchMedia('(any-pointer: fine)').matches,
        coarse: matchMedia('(any-pointer: coarse)').matches,
        hover: matchMedia('(hover: none)').matches,
        touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      })`);
      check('a phone answers the page as a phone: a coarse pointer that does not hover',
        media.coarse === true && media.fine === false && media.hover === true && media.touch === true,
        JSON.stringify(media));

      const layer = await page.evalJs(`({
        buttons: document.querySelectorAll('#touchcontrols .tc-btn').length,
        asked: new URLSearchParams(location.search).get('touch'),
      })`);
      check('…and the touch layer is on it without being asked for', layer.buttons >= 10 && layer.asked === null,
        `${layer.buttons} controls, ?touch=${layer.asked}`);

      // ── 3. the phone's HUD is three things on the floor, and nothing else ──
      // The owner, 2026-11-04: *"the health stamina and magicka bar needs to be on the bottom
      // left on mobile … mobile needs to remove the other two gui plateaus and instead have a
      // hotbar in the down center that is clickable and to the left of this hotbar there should
      // be the mission indications nothing else so no enemy healthbar and place information gui
      // plateau or adventurer lvl1 gold number ect plateau."*
      const hud = await page.evalJs(`(() => {
        const shown = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).display !== 'none' : false;
        };
        return {
          card: getComputedStyle(document.getElementById('hud')).display,
          fight: shown('#hud-fight'), place: shown('#hud-place'), here: shown('#hud-here'),
          head: shown('#statusbar .sb-head'), panels: shown('#statusbar .sb-panels'),
          purse: shown('#statusbar .sb-purse'), toggle: shown('#statusbar .plateau-toggle'),
          plate: getComputedStyle(document.getElementById('statusbar')).display,
          text: (document.getElementById('hud').textContent ?? '').slice(0, 60),
        };
      })()`);
      check('the phone has no place card, no foe health, no name/level/gold plate and no plateau frame',
        hud.card === 'none' && hud.fight === false && hud.place === false && hud.here === false
          && hud.head === false && hud.panels === false && hud.purse === false && hud.toggle === false
          && hud.plate === 'contents',
        `${hud.plate} · head ${hud.head}, panels ${hud.panels}, purse ${hud.purse}, message ${hud.card} “${hud.text}”`);

      // ── the floor: vitals bottom-left, ten wells bottom-centre, mission above them ──
      const floor = await page.evalJs(`(() => {
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
            right: Math.round(r.right), bottom: Math.round(r.bottom), top: Math.round(r.top) };
        };
        // A quest only draws when there is one; a sentence is put in for the measurement and
        // the scene's own line is put back immediately.
        const quest = document.getElementById('hud-quest');
        const saved = quest.textContent;
        quest.textContent = '120 m north — the Jewel of Fire';
        const bar = box(document.getElementById('vitalsbar'));
        const hot = box(document.getElementById('hotbar'));
        const line = box(quest);
        quest.textContent = saved;
        const cells = [...document.querySelectorAll('#hotbar .hb-cell')];
        const first = cells[0].getBoundingClientRect();
        return {
          vw: innerWidth, vh: innerHeight, bar, hot, line, cells: cells.length,
          cell: { w: Math.round(first.width), h: Math.round(first.height) },
          clickable: cells.every((c) => getComputedStyle(c).pointerEvents !== 'none'),
          centred: Math.abs((hot.x + hot.w / 2) - innerWidth / 2) <= 2,
          lineCentred: Math.abs((line.x + line.w / 2) - innerWidth / 2) <= 2,
        };
      })()`);
      check('a portrait phone puts the vitals bottom-left and ten clickable wells bottom-centre',
        floor.bar.x < 40 && floor.bar.bottom > floor.vh - 140 && floor.bar.w <= 210
          && floor.hot.bottom > floor.vh - 20 && floor.centred === true
          && floor.cells === 10 && floor.cell.w >= 24 && floor.cell.h >= 24 && floor.clickable === true,
        `vitals ${floor.bar.w}×${floor.bar.h} at ${floor.bar.x},${floor.bar.y} · hotbar ${floor.hot.w}×${floor.hot.h} at ${floor.hot.x},${floor.hot.y} · cells ${floor.cells} × ${floor.cell.w}px · ${floor.vw}×${floor.vh}`);
      check('…and the mission line rides clear above the strip, centred, where a portrait window can hold it',
        floor.line.bottom <= floor.hot.top && floor.line.w > 0 && floor.lineCentred === true,
        `quest ${floor.line.w}×${floor.line.h} at ${floor.line.x},${floor.line.y} · hotbar top ${floor.hot.top}`);

      // ── removing a button: the arrange mode's ✕ is really on the screen ───
      const kill = await page.evalJs(`(() => {
        const gear = document.querySelector('#touchcontrols .tc-gear');
        gear.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 90, bubbles: true, cancelable: true }));
        const btn = [...document.querySelectorAll('#touchcontrols .tc-btn')].find((b) => getComputedStyle(b).display !== 'none');
        const x = btn.querySelector('.tc-kill');
        const r = x.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          arrange: document.getElementById('touchcontrols').classList.contains('tc-arrange'),
          id: btn.dataset.touch,
          w: Math.round(r.width), h: Math.round(r.height),
          x: r.left + r.width / 2, y: r.top + r.height / 2,
          // The control clips its own content; if the ✕ were inside that clip it would be
          // half-drawn and nothing would be under the finger.
          hitSelf: at === x || x.contains(at),
        };
      })()`);
      check('arrange mode puts a real ✕ on every control, outside its clip and under the finger',
        kill.arrange === true && kill.w >= 20 && kill.h >= 20 && kill.hitSelf === true,
        `${kill.id}: ✕ ${kill.w}×${kill.h} at ${Math.round(kill.x)},${Math.round(kill.y)}, hittable ${kill.hitSelf}`);

      await touch('touchStart', [{ x: kill.x, y: kill.y, id: 1 }]);
      await touch('touchEnd', []);
      await wait(350);
      const hidden = await page.evalJs(`(() => {
        const el = document.querySelector('[data-touch="${kill.id}"]');
        const saved = JSON.parse(localStorage.getItem('perfectarena.touch.layout.v1') || 'null');
        const tray = document.querySelector('#touchcontrols .tc-tray');
        const restored = document.querySelector('#touchcontrols .tc-tray .danger');
        const done = [...document.querySelectorAll('#touchcontrols .tc-tray button')].find((b) => b.textContent === 'Done');
        const answer = {
          display: getComputedStyle(el).display,
          hidden: saved?.buttons?.['${kill.id}']?.hidden,
          chips: [...(tray?.querySelectorAll('.row button') ?? [])].filter((b) => b.textContent.includes('＋')).length,
        };
        restored?.click(); done?.click();
        return answer;
      })()`);
      check('tapping it removes the control, the layout remembers, and the tray offers it back',
        hidden.display === 'none' && hidden.hidden === true && hidden.chips >= 1,
        `${kill.id}: display ${hidden.display}, saved hidden ${hidden.hidden}, ${hidden.chips} chips in the tray`);

      // ── 1. no pointer lock is ever asked for ───────────────────────────────
      await page.evalJs(`(() => {
        window.__lockAsked = 0;
        const real = HTMLCanvasElement.prototype.requestPointerLock;
        window.__restoreLock = () => { HTMLCanvasElement.prototype.requestPointerLock = real; };
        HTMLCanvasElement.prototype.requestPointerLock = function () { window.__lockAsked++; return Promise.resolve(); };
      })()`);
      await page.pressKey('KeyV', true);
      await page.pressKey('KeyV', false);
      await wait(120);
      const askedOnKey = await page.evalJs('window.__lockAsked');
      check('a keypress on a phone asks for no pointer lock — that request IS Chrome’s “change app to see the cursor again”',
        askedOnKey === 0, `${askedOnKey} requests`);

      // ── and a finger still turns the head ─────────────────────────────────
      const before = await bearing();
      await drag({ x: 320, y: 320 }, { x: 120, y: 320 });
      const after = await bearing();
      const askedOnDrag = await page.evalJs('window.__lockAsked');
      check('a finger dragged across the world turns the head, with nothing asking for a lock',
        before !== after && askedOnDrag === 0, `“${before}” → “${after}”, ${askedOnDrag} lock requests`);
      await page.evalJs('window.__restoreLock?.()');

      // ── 2. the sheet fits, can be read, and can always be left ─────────────
      await page.pressKey('Tab', true);
      await page.pressKey('Tab', false);
      await page.waitFor('document.getElementById("automap")?.classList.contains("on") === true',
        { timeoutMs: 20000, label: 'the automap' });
      const portrait = await panelBox();
      check('the sheet on a phone is on the screen, with its close and fit buttons above the edge',
        portrait.open === true && portrait.panelIn === true && portrait.closeIn === true && portrait.fitIn === true,
        `panel ${portrait.panel.w}×${portrait.panel.h} in ${portrait.vw}×${portrait.vh}, close ${portrait.closeIn}, fit ${portrait.fitIn}`);

      await metrics(915, 412, true);
      await wait(400);
      const landscape = await panelBox();
      check('…and turned sideways it still is, scrollable if the page is taller than the window',
        landscape.open === true && landscape.panelIn === true && landscape.closeIn === true && landscape.fitIn === true,
        `panel ${landscape.panel.w}×${landscape.panel.h} in ${landscape.vw}×${landscape.vh}, scroll ${landscape.scroll}, close ${landscape.closeIn}`);

      // **The case the owner hit:** a landscape phone is WIDER than the narrow-window rule's
      // 900 px, so a width test cannot be the switch. Sideways, the vitals take the corner, the
      // ten wells take the centre, and the mission line stands to their left.
      const sideways = await page.evalJs(`(() => {
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
            right: Math.round(r.right), bottom: Math.round(r.bottom), top: Math.round(r.top) };
        };
        const quest = document.getElementById('hud-quest');
        const saved = quest.textContent;
        quest.textContent = '120 m north — the Jewel of Fire';
        const bar = box(document.getElementById('vitalsbar'));
        const hot = box(document.getElementById('hotbar'));
        const line = box(quest);
        quest.textContent = saved;
        const cells = [...document.querySelectorAll('#hotbar .hb-cell')];
        return {
          vw: innerWidth, vh: innerHeight, bar, hot, line, cells: cells.length,
          centred: Math.abs((hot.x + hot.w / 2) - innerWidth / 2) <= 2,
          overlap: !(bar.right < hot.x || bar.x > hot.right || bar.bottom < hot.y || bar.y > hot.bottom),
          clear: line.right <= hot.x - 6 && line.bottom <= bar.top,
        };
      })()`);
      check('sideways — wider than the narrow layout’s 900 px — the vitals keep the bottom-left corner and ten wells the bottom centre',
        sideways.vw > 900 && sideways.bar.x < 40 && sideways.bar.bottom > sideways.vh - 40
          && sideways.hot.bottom > sideways.vh - 20 && sideways.centred === true
          && sideways.cells === 10 && sideways.overlap === false,
        `${sideways.vw}×${sideways.vh}: vitals ${sideways.bar.w}×${sideways.bar.h} at ${sideways.bar.x},${sideways.bar.y} · hotbar ${sideways.hot.w}×${sideways.hot.h} at ${sideways.hot.x},${sideways.hot.y}, overlap ${sideways.overlap}`);
      check('…and the mission line stands to the left of the strip, above the vitals',
        sideways.clear === true,
        `quest right ${sideways.line.right} vs hotbar left ${sideways.hot.x}, quest bottom ${sideways.line.bottom} vs vitals top ${sideways.bar.top}`);

      // The magnifier: a wheel is a desk's pinch, and the arithmetic is the sheet's own.
      const zoomed = await page.evalJs(`(() => {
        const canvas = document.getElementById('automap-canvas');
        const before = window.__debug.automap();
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -260, cancelable: true, bubbles: true }));
        const after = window.__debug.automap();
        document.querySelector('[data-automap="fit"]').click();
        const fit = window.__debug.automap();
        return { before: before.view, after: after.view, fit: fit.view,
          scale: [before.drawn.scale, after.drawn.scale, fit.drawn.scale] };
      })()`);
      check('the level opens whole and magnifies on a finger’s pinch (or a wheel), and “fit” puts it back',
        zoomed.before.zoom === 1 && zoomed.after.zoom > 1 && zoomed.fit.zoom === 1
          && zoomed.scale[1] > zoomed.scale[0] && zoomed.scale[2] === zoomed.scale[0],
        `zoom ${zoomed.before.zoom} → ${zoomed.after.zoom} → ${zoomed.fit.zoom}, cell ${zoomed.scale.join(' → ')}`);

      // Two fingers, spread — the phone's own pinch, not a synthetic wheel.
      const pinched = await page.evalJs(`(() => {
        const canvas = document.getElementById('automap-canvas');
        const r = canvas.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const send = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
          pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: x, clientY: y, bubbles: true, cancelable: true,
        }));
        send('pointerdown', 11, cx - 40, cy); send('pointerdown', 12, cx + 40, cy);
        send('pointermove', 11, cx - 90, cy); send('pointermove', 12, cx + 90, cy);
        send('pointerup', 11, cx - 90, cy); send('pointerup', 12, cx + 90, cy);
        const view = window.__debug.automap().view;
        document.querySelector('[data-automap="fit"]').click();
        return view;
      })()`);
      check('two fingers spread on the sheet magnify it, and a drag slides the enlarged sheet',
        pinched.zoom > 1, `zoom ${pinched.zoom.toFixed(2)}, slide ${Math.round(pinched.panX)},${Math.round(pinched.panY)}`);

      // The way out: the button the owner could not reach.
      const left = await page.evalJs(`(() => {
        document.querySelector('[data-automap="close"]').click();
        return {
          open: document.getElementById('automap').classList.contains('on'),
          paused: window.__debug.state().paused,
        };
      })()`);
      check('the close button puts the sheet away and gives the world back — a phone cannot be stuck in the map',
        left.open === false && left.paused === false, JSON.stringify(left));

      // ── the sneak, which the phone had no button for ───────────────────────
      // The owner, 2026-10-22: *"there is no crouch button on phone"*. A desk crouches with
      // `Ctrl`; the layer is one button per key, so the sneak is a control like any other — and
      // this taps it with a real finger rather than trusting the catalogue. (The map has just
      // closed; the layer goes `tc-blocked` — no pointer events — while a sheet is up, so the
      // first frame after it needs to pass before a thumb can land on anything.)
      await wait(250);
      const crouchAt = await page.evalJs(`(() => {
        const el = document.querySelector('[data-touch="crouch"]');
        if (!el || getComputedStyle(el).display === 'none') return null;
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height),
          blocked: document.getElementById('touchcontrols')?.classList.contains('tc-blocked') ?? null,
          hitSelf: at === el || el.contains(at),
          over: at ? at.tagName.toLowerCase() + (at.id ? '#' + at.id : '') + (at.dataset && at.dataset.touch ? '[data-touch=' + at.dataset.touch + ']' : '') : null,
        };
      })()`);
      let crouched = null;
      if (crouchAt) {
        await touch('touchStart', [{ x: crouchAt.x, y: crouchAt.y, id: 1 }]);
        await touch('touchEnd', []);
        await wait(250);
        crouched = await page.evalJs('window.__debug.stance()');
        await touch('touchStart', [{ x: crouchAt.x, y: crouchAt.y, id: 1 }]);
        await touch('touchEnd', []);
        await wait(250);
      }
      const stood = await page.evalJs('window.__debug.stance()');
      check('a phone has a crouch button, and tapping it sneaks and then stands',
        Boolean(crouchAt) && crouchAt.hitSelf === true && crouched?.crouching === true && stood.crouching === false,
        crouchAt
          ? `${crouchAt.w}×${crouchAt.h}px at ${Math.round(crouchAt.x)},${Math.round(crouchAt.y)} — under the finger ${crouchAt.over}, layer blocked ${crouchAt.blocked} — crouched ${crouched?.crouching}, stood ${stood.crouching}`
          : 'no crouch control on the layer');

      // ── the phone walks, and the body on the screen walks with it ─────────
      // *"walking with the phone controls doesnt trigger the walking animation correctly in third
      // person"*. The stick presses `W`, so the test holds it for a real second and reads the
      // stride the third person drew: more than one pose, and the pose in order.
      await page.evalJs('window.__debug.setView("third")');
      await page.evalJs(`(() => {
        window.__walkSamples = [];
        window.__walkStop = false;
        const tick = () => {
          const state = window.__debug.state();
          const anim = window.__debug.animation();
          window.__walkSamples.push({ frame: anim.player ?? null, view: state.playerView?.view ?? null, mirrored: state.playerView?.mirrored ?? null });
          if (!window.__walkStop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })()`);
      const stickAt = await page.evalJs(`(() => {
        const r = document.querySelector('#touchcontrols .tc-stick').getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`);
      await touch('touchStart', [{ x: stickAt.x, y: stickAt.y - 30, id: 1 }]);
      for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: stickAt.x, y: stickAt.y - 30 - i * 18, id: 1 }]);
      await wait(1100);
      const walked = await page.evalJs('window.__walkStop = true, window.__walkSamples');
      await touch('touchEnd', []);
      const poses = [...new Set(walked.map((s) => s.frame).filter(Boolean))];
      const steps = [...new Set(walked.map((s) => String(s.frame).split('#')[1]).filter(Boolean))];
      const views = [...new Set(walked.map((s) => s.view).filter((v) => v != null))];
      check('walking with the stick plays the walk in third person — several poses, in more than one frame',
        poses.length >= 3 && steps.length >= 2,
        `${walked.length} frames drawn, poses ${poses.length}, steps ${steps.slice(0, 6).join(',')}`);
      // A flicker is a sheet that comes back: A → B → A inside a few frames. A body turning once
      // — settling onto its heading and staying there — is not one, so the law counts reversals,
      // not the number of sheets seen.
      const sheetOf = (s) => `${s.view}/${s.mirrored}`;
      const sheets = walked.map(sheetOf).filter((s) => !s.startsWith('null'));
      let flips = 0;
      for (let i = 2; i < sheets.length; i++) {
        if (sheets[i] !== sheets[i - 1] && sheets[i] === sheets[i - 2]) flips++;
      }
      check('…and the body does not flicker between sheets while it walks (D-94)',
        flips === 0,
        `${flips} reversals, ${sheets.length} draws: ${sheets.slice(0, 14).join(' ')}${sheets.length > 14 ? ' …' : ''}`);
      await page.evalJs('window.__debug.setView("first")');

      // ── the level-up, answered by a thumb ───────────────────────────────────
      // *"the level up menu on the phone is all bugged up you cant confirm and so it softlocks"*:
      // the panel is taller than a sideways phone, so its answer row was below the screen. It
      // scrolls, the row sticks to its own bottom edge, and Take is under the finger.
      await page.evalJs('window.__debug.awardXp(4000)');
      await page.waitFor('document.getElementById("levelup")?.classList.contains("on") === true',
        { timeoutMs: 15000, label: 'the level-up panel' });
      const levelPanel = await page.evalJs(`(() => {
        const el = document.getElementById('levelup');
        const r = el.getBoundingClientRect();
        const take = el.querySelector('[data-level-take]');
        const t = take.getBoundingClientRect();
        const at = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
        return {
          vw: innerWidth, vh: innerHeight,
          panel: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          onScreen: r.top >= -0.5 && r.bottom <= innerHeight + 1 && r.left >= -0.5 && r.right <= innerWidth + 1,
          take: { x: t.left + t.width / 2, y: t.top + t.height / 2, w: Math.round(t.width), h: Math.round(t.height) },
          takeOnScreen: t.top >= 0 && t.bottom <= innerHeight + 0.5,
          hittable: at === take || take.contains(at),
          scrolls: el.scrollHeight > el.clientHeight + 1,
          overflow: getComputedStyle(el).overflowY,
          points: window.__debug.progression().panel?.points ?? null,
        };
      })()`);
      check('a level-up on a phone is on the screen and can be scrolled, not spilled off it',
        levelPanel.onScreen === true && levelPanel.points > 0
          && (levelPanel.scrolls === false || levelPanel.overflow === 'auto'),
        `${levelPanel.vw}×${levelPanel.vh}: panel ${levelPanel.panel.w}×${levelPanel.panel.h} at ${levelPanel.panel.x},${levelPanel.panel.y}, scrolls ${levelPanel.scrolls} (${levelPanel.overflow})`);
      check('…and Take the level is under the thumb, not below the edge',
        levelPanel.takeOnScreen === true && levelPanel.hittable === true,
        `take ${levelPanel.take.w}×${levelPanel.take.h} at ${Math.round(levelPanel.take.x)},${Math.round(levelPanel.take.y)}`);
      const beforeLevel = await page.evalJs('window.__debug.progression().level');
      await touch('touchStart', [{ x: levelPanel.take.x, y: levelPanel.take.y, id: 1 }]);
      await touch('touchEnd', []);
      await wait(600);
      const afterLevel = await page.evalJs(`({
        level: window.__debug.progression().level,
        open: document.getElementById('levelup').classList.contains('on'),
        taken: window.__debug.progression().lastLevel,
        owed: window.__debug.progression().owed,
      })`);
      // A big hand of experience earns more than one level, and the panel rightly stays for the
      // next one (`beginLevelUp`); what must never happen is the level not being taken.
      check('tapping Take takes the level, and does not softlock the page',
        afterLevel.level > beforeLevel && afterLevel.taken != null,
        `level ${beforeLevel} → ${afterLevel.level}, panel open ${afterLevel.open} (owed ${afterLevel.owed})`);

      // ── the weapon is drawn in the middle of a landscape phone ─────────────
      // *"the first person attack animations should be at the center of the screen even if the
      // phone is horizontal and instead are at the right"*. Arena's art lives on a 320×200
      // screen, so at this 915×412 window the frame is 660 px wide and starts 127 px in; every
      // frame of the weapon must be inside it.
      // The panel is a layer: it owns the keys while it is up, and another level is still owed.
      // Put it away the way a phone does (its own Later row, `Escape`'s answer) before the fight.
      await page.evalJs(`(() => {
        const later = [...document.querySelectorAll('#levelup button')].find((b) => /Later/i.test(b.textContent));
        later?.click();
        return document.getElementById('levelup').classList.contains('on');
      })()`);
      await wait(120);
      await page.evalJs('window.__debug.setView("first")');
      await page.pressKey('KeyF', true);
      await page.pressKey('KeyF', false);
      await wait(900);
      // The scene's own report of where the last frame put the art (`weaponView().onScreen`),
      // not a flag: `weaponPixels` proves something was painted, this says where.
      const weapon = await page.evalJs('window.__debug.weaponView()?.onScreen ?? null');
      const frame = await page.evalJs('({ w: innerWidth, h: innerHeight })');
      const scale = Math.min(frame.w / 320, frame.h / 200);
      const frameLeft = (frame.w - 320 * scale) / 2;
      check('the first-person weapon is drawn inside the centred 320×200 frame on a sideways phone',
        Boolean(weapon) && weapon.x >= frameLeft - 1 && weapon.right <= frameLeft + 320 * scale + 1,
        weapon
          ? `art ${weapon.x}…${weapon.right} of the frame ${Math.round(frameLeft)}…${Math.round(frameLeft + 320 * scale)} in ${frame.w}×${frame.h}`
          : `nothing drawn in ${frame.w}×${frame.h}`);
      // ── the compass, and the two switches that own it ────────────────────────
      // The owner, 2026-10-25: *"you should be able to turn on and off the compass in the
      // settings, the compass need to appear on android too … there should be a setting that
      // turns gui both for android and pc off to take screenshots"*. The strip used to be
      // `display: none` under 900 px; on a phone it is now the same reading in a narrower pill
      // on the screen's centre line, and both switches are ticks in the menu.
      const compass = await page.evalJs(`(() => {
        const el = document.getElementById('compass');
        const r = el.getBoundingClientRect();
        const hot = document.getElementById('hotbar').getBoundingClientRect();
        const at = el.querySelector('#compass-points span.at');
        return {
          display: getComputedStyle(el).display,
          // The mark is COMPASS.IMG's window; the reading inside it is two pieces of type —
          // the point the strip lights, and the degree the face writes.
          text: (at ? at.textContent : '') + ' ' + document.getElementById('compass-face').textContent,
          points: el.querySelectorAll('#compass-points span').length,
          shownPoints: [...el.querySelectorAll('#compass-points span')].filter((s) => getComputedStyle(s).display !== 'none').length,
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5,
          centred: Math.abs((r.x + r.width / 2) - innerWidth / 2) <= 2,
          clearOfHotbar: r.bottom <= hot.top,
        };
      })()`);
      check('a phone has the compass, on the screen, on its centre line — not in a corner',
        compass.display !== 'none' && compass.inView === true && compass.centred === true
          && compass.clearOfHotbar === true
          && compass.points === 8 && compass.shownPoints === 1 && /^[NSEW]{1,2} \d+°$/.test(compass.text ?? ''),
        JSON.stringify(compass));
      // A level-up still owed owns the keys while it is up (`Escape` postpones it), so the
      // phone's own Later row is answered first — the same door the sword check above uses.
      await page.evalJs(`(() => {
        const el = document.getElementById('levelup');
        if (!el.classList.contains('on')) return false;
        const later = [...el.querySelectorAll('button')].find((b) => /Later/i.test(b.textContent));
        later?.click();
        return true;
      })()`);
      await wait(200);
      // The menu's own seam, which is the same `toggleMenu` the key calls — a level-up still
      // owed owns `Escape` (it postpones itself), and this block is about the ticks.
      await page.evalJs('window.__debug.menu(true)');
      await page.waitFor('document.getElementById("menu")?.classList.contains("on") === true',
        { timeoutMs: 10000, label: 'the phone menu' });
      const stripped = await page.evalJs(`(() => {
        // The compass off, then the whole interface: the two ticks the menu carries.
        document.getElementById('hud-compass').click();
        const compassOff = getComputedStyle(document.getElementById('compass')).display;
        document.getElementById('hud-compass').click();
        const compassOn = getComputedStyle(document.getElementById('compass')).display;
        document.getElementById('hud-hidden').click();
        const answer = {
          compassOff, compassOn,
          statusbar: getComputedStyle(document.getElementById('statusbar')).display,
          vitalsbar: getComputedStyle(document.getElementById('vitalsbar')).display,
          hud: getComputedStyle(document.getElementById('hud')).display,
          hotbar: getComputedStyle(document.getElementById('hotbar')).display,
          compass: getComputedStyle(document.getElementById('compass')).display,
          touch: getComputedStyle(document.getElementById('touchcontrols')).display,
          menu: getComputedStyle(document.getElementById('menu')).display,
          hudState: window.__debug.hud(),
        };
        return answer;
      })()`);
      check('the compass switch turns the bearing off and on again',
        stripped.compassOff === 'none' && stripped.compassOn !== 'none', JSON.stringify(stripped));
      check('…and the interface switch hides the whole HUD on a phone and leaves the menu to bring it back',
        stripped.statusbar === 'none' && stripped.vitalsbar === 'none' && stripped.hud === 'none'
          && stripped.hotbar === 'none' && stripped.compass === 'none' && stripped.touch === 'none'
          && stripped.menu !== 'none' && stripped.hudState?.hidden === true,
        JSON.stringify(stripped));
      // Resumed with nothing on the screen, the phone is not stuck: a press held on the world
      // opens the menu again (`scenes/interior.js`'s quiet hold), and its own tick restores it.
      await page.evalJs('window.__debug.menu(false)');
      await wait(250);
      await touch('touchStart', [{ x: 200, y: 300, id: 1 }]);
      await wait(1100);
      // A cancel, not a release: the finger is still down over the menu the hold just opened, and
      // a release there would tap whatever stands under it.
      await touch('touchCancel', []);
      await wait(300);
      const reopenedMenu = await page.evalJs(`({ open: document.getElementById('menu').classList.contains('on'), hidden: window.__debug.hud().hidden })`);
      check('with the interface hidden, a held finger brings the menu back on a phone',
        reopenedMenu.open === true && reopenedMenu.hidden === true, JSON.stringify(reopenedMenu));
      await page.evalJs(`document.getElementById('hud-hidden').click()`);
      await wait(200);
      const restored = await page.evalJs(`({
        hidden: window.__debug.hud().hidden,
        statusbar: getComputedStyle(document.getElementById('statusbar')).display,
        vitalsbar: getComputedStyle(document.getElementById('vitalsbar')).display,
      })`);
      check('and the tick brings the interface home again',
        restored.hidden === false && restored.statusbar !== 'none' && restored.vitalsbar !== 'none',
        JSON.stringify(restored));

      // ── off the map of Tamriel without a journey ─────────────────────────────
      // *"you should be able to exit the map of tamriel on android without needing to fast
      // travel (with a button in the search gui)"*: `M` and `Esc` are a desk's way out, and a
      // phone has neither. The search panel opens with a close button in the overlay.
      await page.goto(`http://localhost:${getPort()}/?dungeon=Stonekeep&${q}`);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 3',
        { timeoutMs: 90000, label: 'Stonekeep on a phone' });
      const beforeMap = await page.evalJs('location.search');
      await page.pressKey('KeyM');
      await page.waitFor('Boolean(window.__debug.worldMap)', { label: 'the map on a phone', timeoutMs: 120000 });
      await wait(500);
      const exitButton = await page.evalJs(`(() => {
        const b = document.getElementById('map-exit');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return {
          text: b.textContent.trim(),
          inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5,
          x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
          travelHandoffs: window.__debug.worldMap.state?.().handoffs ?? 0,
        };
      })()`);
      check('the map of Tamriel offers a way to leave it without travelling, on the search panel',
        Boolean(exitButton) && exitButton.inView === true && /close/i.test(exitButton.text ?? ''),
        JSON.stringify(exitButton));
      if (exitButton) {
        await touch('touchStart', [{ x: exitButton.x, y: exitButton.y, id: 1 }]);
        await touch('touchEnd', []);
        await wait(500);
        const leftMap = await page.evalJs(`({
          mapOpen: window.__debug.state().mapOpen,
          seam: Boolean(window.__debug.worldMap),
          scene: window.__debug.scene,
          search: location.search,
        })`);
        check('…and tapping it puts the map away with no journey and no page load',
          leftMap.mapOpen === false && leftMap.seam === false && leftMap.scene === 'interior'
            && leftMap.search === beforeMap,
          JSON.stringify({ ...leftMap, before: beforeMap }).slice(0, 300));
      }
    } finally {
      await touchMode(false).catch(() => {});
      await page.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    }
  };
}
