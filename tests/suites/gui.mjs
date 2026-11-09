// SUITE: THE INTERFACE, IN ARENA'S OWN ART.
//
// The owner, 2026-10-25: *"the game has received a blunt criticism by the internet that deemed it
// ai slop based on the gui … the gui needs a rework keeping everything it has but using the
// original game gui artwork only cropped cutted and repurposed … it needs to be highly artistic
// … highly tested."*
//
// `unit/guikit.test.mjs` holds the **cutting table** against the player's `GLOBAL.BSA` — the
// rectangles, the slices, the inks, the contrast. This suite holds the **page** against the
// table: that the stylesheet really is wearing the paintings after they load, that no page
// invents a colour or a texture, that the type is the page's serif and never the monospace the
// first pass used, and that a screenshot of the parchment is the parchment's own colour rather
// than the near-black wash that made the interface read as a modern dashboard.
//
// Every check is made of a computed style, a palette read or a pixel — never of a class name.
// A sheet can be edited into anything; a computed `border-image-source` and the colour of the
// pixels under it cannot.

import path from 'node:path';
import { decodePng } from '../cdp.mjs';

/** WCAG contrast, in the page, from two computed colours. */
const CONTRAST_FN = `(fg, bg) => {
  const parse = (c) => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(parse(fg)), b = lum(parse(bg));
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}`;

/** The mean RGB of a rectangle of a decoded PNG. */
function meanRect(png, x0, y0, x1, y1) {
  const out = { r: 0, g: 0, b: 0 };
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++) {
      const o = (y * png.width + x) * 4;
      out.r += png.data[o]; out.g += png.data[o + 1]; out.b += png.data[o + 2];
      n++;
    }
  }
  if (!n) return out;
  return { r: out.r / n, g: out.g / n, b: out.b / n };
}

const hexOf = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Distance between two `#rrggbb`, per channel, as the largest difference. */
function apart(a, b) {
  const one = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [one(a), one(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}

export function makeGuiSuite({ check, realErrors, shots, getPort }) {
  return async function suiteGui(page) {
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

    // ── the paintings, as the page received them ──────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?interior=START.MIF&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'the dungeon', timeoutMs: 120000 });
    await settle(600);

    const kit = await page.evalJs(`(() => {
      const css = getComputedStyle(document.documentElement);
      const read = (n) => css.getPropertyValue(n).trim();
      const names = ['--gk-scroll', '--gk-scroll-slice', '--gk-scroll-paper',
        '--gk-band', '--gk-flourish', '--gk-plate', '--gk-plate-slice',
        '--gk-compass', '--gk-coin', '--gk-gold', '--gk-gold-deep', '--gk-gold-lit',
        '--gk-ink', '--gk-ink-soft', '--gk-red', '--gk-green', '--gk-paper', '--gk-paper-deep',
        '--gk-stone', '--gk-well', '--gk-quiet-stone'];
      return {
        applied: document.documentElement.dataset.guiKit ?? null,
        vars: Object.fromEntries(names.map((n) => [n, read(n).slice(0, 28)])),
        slices: { scroll: read('--gk-scroll-slice'), plate: read('--gk-plate-slice') },
      };
    })()`);

    // Everything that is not an ink or a slice is a picture, and every picture is a data URL.
    const urls = Object.entries(kit.vars)
      .filter(([name]) => !/^--gk-(gold|gold-deep|gold-lit|ink|ink-soft|red|green|paper|paper-deep|stone|well|quiet-stone)$/.test(name))
      .filter(([name]) => !name.endsWith('-slice'));
    check('the cutting table reached the page: every picture is a URL from the player\'s own install',
      kit.applied === 'on' && urls.every(([, v]) => v.startsWith('url("data:image/png')),
      `${urls.filter(([, v]) => !v.startsWith('url(')).map(([n]) => n).join(', ') || 'all published'}`);
    check('and the inks are the paintings\' own colours, not a theme',
      kit.vars['--gk-gold'] === '#e7d700' && kit.vars['--gk-paper'] === '#aa8150'
      && kit.vars['--gk-ink'] === '#300c0c' && kit.vars['--gk-stone'] === '#13131f',
      JSON.stringify({ gold: kit.vars['--gk-gold'], paper: kit.vars['--gk-paper'], ink: kit.vars['--gk-ink'] }));
    check('the scroll is sliced where its rolls end and the plate where its rule is',
      kit.slices.scroll === '21 12 20 12' && kit.slices.plate === '3 3 3 3',
      JSON.stringify(kit.slices));

    // ── the plate: modern and quiet, with the paintings as accents ─────────────
    //
    // *"the black textures … everything looks cheap and horrible … make it also modern and
    // minimalistic while still using og assets"*. The law now is the opposite of the last pass's:
    // the plate is **one flat colour** (a pixel of `POPUP3.IMG`), not a surface with a picture on
    // it. The tests below hold both halves: no texture layer at all, and the gold *accent* still
    // coming out of the install (the scallop run on the vitals, the mark on the compass, the
    // command plates in the hotbar).
    const stone = await page.evalJs(`(() => {
      const read = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          borderWidth: s.borderTopWidth,
          image: s.backgroundImage.slice(0, 400),
          layers: (s.backgroundImage.match(/url\\(/g) || []).length,
          repeat: s.backgroundRepeat,
          size: s.backgroundSize,
          colour: s.backgroundColor,
          radius: s.borderTopLeftRadius,
          shadow: s.boxShadow,
          font: s.fontFamily,
        };
      };
      return { hud: read('hud'), notice: read('notice') };
    })()`);
    const flat = (colour) => /^rgba?\(15, 15, 27/.test(colour);
    // **The corner is written on the world.** *"the block at the top left … i dont even know if
    // its usefull"* — and a plate behind it was the last box on an otherwise boxless screen.
    // A HUD label is type with a shadow on it, not a widget: no fill, no edge, no corner, no
    // picture. The legibility is the shadow's job, and the suite below measures that the words
    // still clear 4.5:1 over the page's own paper.
    check('the corner of the screen is written on the world — no plate, no frame, no picture',
      stone.hud && stone.hud.colour === 'rgba(0, 0, 0, 0)' && stone.hud.image === 'none'
      && stone.hud.borderWidth === '0px' && stone.hud.radius === '0px' && stone.hud.shadow === 'none',
      stone.hud ? `${stone.hud.colour} · ${stone.hud.borderWidth} · ${stone.hud.radius} · ${stone.hud.image}` : 'missing');
    // **A window is still a plate.** The level-up and the map's tools are instruments over the
    // world, so they keep the painting's own black, laid flat: one colour, no texture, one edge.
    check('a window is the painting\'s own black, laid flat — no wallpaper',
      stone.notice && flat(stone.notice.colour) && stone.notice.image === 'none'
      && stone.notice.borderWidth === '1px' && stone.notice.radius === '8px',
      stone.notice ? `${stone.notice.colour} · ${stone.notice.image} · ${stone.notice.radius}` : 'missing');
    // **The strip is not a plate.** *"the block at the top left … i dont even know if its
    // usefull"* and the hotbar's own second frame were the two remaining boxes: the ten command
    // plates are the strip, and the corner card is the only plate left in the interface.
    const strip = await page.evalJs(`(() => {
      const el = document.getElementById('hotbar');
      const s = getComputedStyle(el);
      const cell = el.querySelector('.hb-cell');
      const c = cell ? getComputedStyle(cell) : null;
      return {
        cells: el.querySelectorAll('.hb-cell').length,
        colour: s.backgroundColor, border: s.borderTopWidth, image: s.backgroundImage, shadow: s.boxShadow,
        cellBorder: c ? c.borderTopWidth + ' ' + c.borderTopStyle : null,
        cellRadius: c ? c.borderTopLeftRadius : null, cellBg: c ? c.backgroundColor : null,
        size: cell ? { w: Math.round(cell.getBoundingClientRect().width), h: Math.round(cell.getBoundingClientRect().height) } : null,
      };
    })()`);
    check('the hotbar is a strip of wells on the world — no tray behind the slots',
      strip.cells === 10 && strip.colour === 'rgba(0, 0, 0, 0)' && strip.border === '0px'
      && strip.image === 'none' && strip.shadow === 'none',
      JSON.stringify({ cells: strip.cells, colour: strip.colour, border: strip.border }));
    check('…and every slot is one size on one rhythm: a dark well, no button outline',
      strip.size?.w >= 24 && strip.size?.h === 27 && strip.cellRadius === '2px'
      && (strip.cellBorder ?? '').startsWith('0px') && /^rgba\(6, 6, 10/.test(strip.cellBg ?? ''),
      JSON.stringify({ size: strip.size, radius: strip.cellRadius, bg: strip.cellBg }));

    // ── the vitals have their own small plate in the bottom-left ─────────────
    // *"the health stamina magicka gui plateau should be to the down left and me more
    // minimalistic mimicking the style of the other plateau that tho needs to stay on the top
    // left."* The command plateau is still the corner card; the gauges are only their bars on
    // the floor — no plate, no ring, no labels and no figures.
    const vitals = await page.evalJs(`(() => {
      const el = document.getElementById('vitalsbar');
      const status = document.getElementById('statusbar');
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const bars = [...el.querySelectorAll('i')].map((i) => {
        const b = getComputedStyle(i);
        return { h: b.height, radius: b.borderTopLeftRadius, image: b.backgroundImage.slice(0, 30) };
      });
      const labels = [...el.querySelectorAll('.sb-health span, .sb-stamina span, .sb-spell span')]
        .map((n) => ({ text: n.textContent, display: getComputedStyle(n).display }));
      const figures = [...el.querySelectorAll('.sb-health b, .sb-stamina b, .sb-spell b')]
        .map((n) => ({ text: n.textContent, display: getComputedStyle(n).display }));
      return {
        background: s.backgroundImage, colour: s.backgroundColor, border: s.borderTopWidth,
        shadow: s.boxShadow, radius: s.borderTopLeftRadius, bars, labels, figures,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) },
        viewport: { w: innerWidth, h: innerHeight },
        inPlateau: Boolean(status.querySelector('#sb-health')),
      };
    })()`);
    check('the vitals are only coloured bars in the bottom-left — no plate, ring, labels or figures',
      vitals.background === 'none' && vitals.colour === 'rgba(0, 0, 0, 0)'
      && vitals.border === '0px' && vitals.radius === '0px' && vitals.shadow === 'none'
      && vitals.labels.every((n) => n.display === 'none')
      && vitals.figures.every((n) => n.display === 'none')
      && vitals.inPlateau === false && vitals.rect.x < 40
      && vitals.rect.bottom > vitals.viewport.h - 40 && vitals.rect.w <= 260,
      `${vitals.background} · ${vitals.colour} · ${vitals.rect.w}×${vitals.rect.h} at ${vitals.rect.x},${vitals.rect.y}`);
    check('…each filled in its own vital\'s colour, with its text kept out of the visual field',
      vitals.bars.length === 3 && vitals.bars.every((b) => b.radius === '2px' && b.image.includes('linear-gradient'))
      && vitals.labels.map((n) => n.text).join(',') === 'health,stamina,magicka',
      JSON.stringify(vitals.bars.map((b) => b.h)) + ' ' + vitals.labels.map((n) => n.text).join(','));
    // The old gauge was a black glass channel with a segmented overlay. The owner asked for
    // the coloured fill only, so the channel is transparent and the fill is the whole drawing.
    const gauges = await page.evalJs(`(() => {
      const el = document.getElementById('vitalsbar');
      return {
        tracks: [...el.querySelectorAll('.sb-track')].map((t) => {
          const s = getComputedStyle(t);
          return { h: s.height, radius: s.borderTopLeftRadius, bg: s.backgroundColor,
            border: s.borderTopWidth, shadow: s.boxShadow, fill: Boolean(t.querySelector('i')) };
        }),
      };
    })()`);
    check('the gauges carry the coloured fill only: transparent channel, no frame or inset',
      gauges.tracks.length === 3 && gauges.tracks.every((t) => t.h === '7px' && t.radius === '2px'
        && t.border === '0px' && t.shadow === 'none' && t.bg === 'rgba(0, 0, 0, 0)' && t.fill === true),
      JSON.stringify(gauges.tracks));

    // ── the corner card: place, who is here, and what is in reach ──────────────
    // *"the block at the top left of the screen with all that info i dont even know if its
    // usefull"* — the build report (`50×50 cells · 6088 quads · 15 materials · 15 textures`)
    // was the loader's, and it is gone from the page. What is left is a card.
    const card = await page.evalJs(`(() => {
      const hud = document.getElementById('hud');
      const place = document.getElementById('hud-place');
      const foe = hud.querySelector('.hf-foe');
      return {
        text: hud.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200),
        name: place?.querySelector('.hp-name')?.textContent ?? null,
        meta: place?.querySelector('.hp-meta')?.textContent ?? null,
        foe: foe ? foe.textContent.replace(/\\s+/g, ' ').trim() : null,
        bar: Boolean(hud.querySelector('.hf-foe-bar i')),
        targetcard: Boolean(document.getElementById('targetcard')),
        width: Math.round(hud.getBoundingClientRect().width),
        toggle: Boolean(document.getElementById('hud-toggle')),
      };
    })()`);
    check('the corner card names the place and its kind — and carries no build report',
      Boolean(card.name) && Boolean(card.meta) && !/quads|materials|textures|\bcells\b/i.test(card.text)
      && card.width <= 320 && card.toggle === true,
      JSON.stringify(card).slice(0, 260));
    check('a foe is a card too: a name, its health as figures, and a gauge under them',
      Boolean(card.foe) && card.bar === true, JSON.stringify({ foe: card.foe }));
    check('no floating target card covers the view — the foe is read in the corner band only',
      card.targetcard === false, `targetcard=${card.targetcard}`);

    // ── the compass is the mark, with the reading inside it ───────────────────
    //
    // *"the compass should be inside the compass icon not have the compass icon to the left for
    // no reason"* — `COMPASS.IMG` is 38×17, a bezel with a hole in it, drawn here at 3× with the
    // point and the degree inside that hole. Measured: the face's rectangle has to be inside the
    // frame's window (the padding box leaves the mark's own border visible on all four sides).
    const dial = await page.evalJs(`(() => {
      const el = document.getElementById('compass');
      if (!el) return null;
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const face = document.getElementById('compass-face').getBoundingClientRect();
      const at = el.querySelector('#compass-points span.at');
      const atBox = at ? at.getBoundingClientRect() : null;
      return {
        image: s.backgroundImage.slice(0, 40), size: s.backgroundSize, rendering: s.imageRendering,
        box: { x: box.x, y: box.y, w: box.width, h: box.height },
        face: { x: face.x, y: face.y, w: face.width, h: face.height },
        cardinal: at ? { text: at.textContent, colour: getComputedStyle(at).color } : null,
        cardinalBox: atBox ? { x: atBox.x, y: atBox.y, w: atBox.width, h: atBox.height } : null,
        degree: document.getElementById('compass-face').textContent,
        shownPoints: [...el.querySelectorAll('#compass-points span')]
          .filter((n) => getComputedStyle(n).display !== 'none').length,
        points: el.querySelectorAll('#compass-points span').length,
      };
    })()`);
    check('the compass mark is the plate: `COMPASS.IMG` at its own pixels, never smoothed',
      Boolean(dial) && dial.image.includes('url("data:image/png')
      && dial.size === '100% 100%' && dial.rendering === 'pixelated',
      dial ? `${dial.size} · ${dial.rendering}` : 'missing');
    check('…and the bearing is inside the mark, between its own four edges',
      Boolean(dial) && dial.face.y > dial.box.y + 12 && dial.face.y + dial.face.h < dial.box.y + dial.box.h - 3
      && dial.face.x > dial.box.x + 3 && dial.face.x + dial.face.w < dial.box.x + dial.box.w - 3,
      dial ? `face ${dial.face.w.toFixed(0)}×${dial.face.h.toFixed(0)} in mark ${dial.box.w.toFixed(0)}×${dial.box.h.toFixed(0)}` : 'missing');
    check('the mark says which way the player faces: one gold point and the degree beside it',
      Boolean(dial) && dial.points === 8 && dial.shownPoints === 1 && /^[NSEW]{1,2}$/.test(dial.cardinal?.text ?? '')
      && /^\d{1,3}°$/.test(dial.degree ?? '') && dial.cardinal.colour === 'rgb(231, 215, 0)',
      dial ? `${dial.cardinal?.text} ${dial.degree} (${dial.shownPoints}/${dial.points} points)` : 'missing');

    // ── the hotbar cell is the empty command plate ────────────────────────────
    // A **window is not a page**: the level-up and the map's controls are instruments over the
    // world, so they wear `POPUP3.IMG`'s window — and, crucially, not the scroll's `border-image`.
    const windows = await page.evalJs(`(() => {
      const read = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          frame: s.borderImageSource.slice(0, 12), image: s.backgroundImage.slice(0, 40),
          repeat: s.backgroundRepeat, size: s.backgroundSize, colour: s.backgroundColor,
          ink: s.color, radius: s.borderTopLeftRadius,
        };
      };
      return { levelup: read('#levelup') };
    })()`);
    for (const [name, panel] of Object.entries(windows)) {
      check(`the ${name} is a quiet window, not a scroll`,
        Boolean(panel) && panel.frame === 'none' && panel.image === 'none'
        && /^rgba?\(15, 15, 27/.test(panel.colour)
        && panel.ink === 'rgb(231, 215, 0)' && panel.radius === '3px',
        panel ? `${panel.frame} · ${panel.colour} · ${panel.ink}` : 'missing');
    }

    const cell = await page.evalJs(`(() => {
      const cells = [...document.querySelectorAll('#hotbar .hb-cell')];
      return {
        keys: cells.map((el) => el.querySelector('.hb-key')?.textContent ?? ''),
        plus: cells.filter((el) => el.querySelector('.hb-plus')).length,
        pinned: cells.filter((el) => el.classList.contains('pinned')).length,
        glyphs: [...document.documentElement.style].filter((n) => /^--gk-icon-/.test(n)).length,
      };
    })()`);
    check('ten slots, a digit each, and the install\'s own glyph set behind a pinned thing',
      cell.keys.join('') === '1234567890' && cell.glyphs >= 6
      && cell.pinned + cell.plus === 10,
      JSON.stringify(cell));

    // ── the plateau: vitals, hotbar, four doors, and a chevron that closes it ─
    // *"daggerfall js inspired gui is still missing hotbar inventory spell book health stamina
    // magicka plateau and also the closable gui on the top left"*. The owner moved the plate to
    // the bottom-right on 2026-11-04; the same chevron folds it to itself and brings it back.
    const plateau = await page.evalJs(`(() => {
      const el = document.getElementById('statusbar');
      const buttons = [...el.querySelectorAll('[data-panel]')].map((b) => b.dataset.panel).join(',');
      const toggle = document.getElementById('plateau-toggle');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const skin = { bg: cs.backgroundColor, border: cs.borderTopWidth, shadow: cs.boxShadow, radius: cs.borderTopLeftRadius };
      toggle.click();
      const folded = el.classList.contains('folded') && Math.round(el.getBoundingClientRect().width) <= 40;
      const hidden = getComputedStyle(document.getElementById('hotbar')).display === 'none';
      const vitalsUp = getComputedStyle(document.getElementById('vitalsbar')).display !== 'none';
      toggle.click();
      const open = !el.classList.contains('folded') && getComputedStyle(document.getElementById('hotbar')).display !== 'none';
      return { buttons, folded, hidden, vitalsUp, open, skin, width: Math.round(el.getBoundingClientRect().width),
        rect: { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom) },
        vw: innerWidth, vh: innerHeight };
    })()`);
    check('the bottom-right plateau wears the enemy band\'s skin, and folds to its chevron',
      plateau.buttons === 'bag,spells,logbook,map' && plateau.folded && plateau.hidden
        && plateau.vitalsUp && plateau.open && plateau.width > 200
        && plateau.skin.bg === 'rgba(0, 0, 0, 0)' && plateau.skin.border === '0px'
        && plateau.skin.shadow === 'none' && plateau.skin.radius === '0px'
        && plateau.rect.right > plateau.vw - 40 && plateau.rect.bottom > plateau.vh - 40,
      JSON.stringify(plateau));

    // ── the paper: the menu is a scroll ───────────────────────────────────────
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await settle(400);
    const paper = await page.evalJs(`(() => {
      const el = document.querySelector('#menu .panel');
      if (!el) return null;
      const s = getComputedStyle(el);
      // The page's own body ink: the fact column, not the quest's red heading block.
      const body = el.querySelector('.facts .fv') ?? el.querySelector('p');
      const head = el.querySelector('h2');
      return {
        image: s.borderImageSource.slice(0, 40), slice: s.borderImageSlice,
        width: s.borderTopWidth, bg: s.backgroundColor,
        background: s.backgroundImage.slice(0, 60),
        font: s.fontFamily, text: getComputedStyle(body ?? el).color,
        heading: head ? getComputedStyle(head).color : null,
        rect: el.getBoundingClientRect().toJSON(),
        viewport: { w: window.innerWidth, h: window.innerHeight },
      };
    })()`);
    // `border-image-slice` computes normalised: four insets, with the last two dropped when they
    // repeat their opposite. `21 12 20` is the scroll's 21 / 12 / 20 / 12.
    const slice = (paper?.slice ?? '').split(/\s+/).map(Number);
    const four = slice.length === 4 ? slice : [slice[0], slice[1], slice[2], slice[1]];
    check('the menu is the scroll: a nine-sliced `PARCH.IMG` with its own slice',
      Boolean(paper) && paper.image.includes('url("data:image/png')
      && four.join(' ') === '21 12 20 12'
      && paper.width === '22px' && !paper.background.includes('url('),
      paper ? `${paper.slice} · ${paper.background}` : 'no panel');
    // **One tone, not a tile.** *"the black texture you're using for the gui is badly cropped it
    // repeats itself and its horrendous"* — a crop of `PARCH.IMG` repeated behind a four-screen
    // page showed its own grain six times. The page is now the parchment's tan, lifted into
    // light and laid once, with a breath of sheen down the sheet: paper, not wallpaper.
    check('and its paper is one tone of the parchment — laid once, never tiled',
      paper.bg === 'rgb(236, 226, 203)' && !paper.background.includes('url('),
      `${paper.bg} · ${paper.background}`);
    check('a page is set in the old serif, never in monospace',
      !/mono/i.test(paper.font) && /Palatino|Georgia|serif/i.test(paper.font),
      paper.font);
    check('its text is the page\'s own ink, far from the paper in value',
      paper.text === 'rgb(36, 28, 22)' && paper.heading === 'rgb(36, 28, 22)',
      `${paper.text} · heading ${paper.heading}`);

    // ── the screenshot is paper, not a dark slab ──────────────────────────────
    const shotName = path.join(shots, 'gui-menu.png');
    const decoded = decodePng(await page.screenshot(shotName));
    // The photograph is in device pixels; the page's rectangle is in CSS pixels.
    const scale = decoded.width / paper.viewport.w;
    const box = paper.rect;
    // Inside the page's own margin, clear of the rolled ends, the torn edge and any text.
    const sample = meanRect(decoded,
      Math.round((box.x + 60) * scale), Math.round((box.y + 70) * scale),
      Math.round((box.x + 150) * scale), Math.round((box.y + 100) * scale));
    check('and a photograph of it is the page\'s own paper — not a wash, not a texture',
      apart(hexOf(sample), '#ece2cb') <= 10, `${hexOf(sample)} against #ece2cb`);
    // The first pass put a 93%-opaque near-black wash over the same painting; that would read
    // here as a mean well under half the paper's luminance.
    const lum = 0.299 * sample.r + 0.587 * sample.g + 0.114 * sample.b;
    check('the page is lit: its paper is far brighter than the old ink wash',
      lum > 100, `luminance ${lum.toFixed(1)}`);

    // ── legibility, measured off the page ─────────────────────────────────────
    const contrast = await page.evalJs(`(() => {
      const ratio = (${CONTRAST_FN});
      const panel = document.querySelector('#menu .panel');
      const paper = getComputedStyle(panel).backgroundColor;
      const rows = [...panel.querySelectorAll('p, .who, .stat, .hint, h2, button')].slice(0, 12);
      return rows.map((el) => ({ text: el.textContent.trim().slice(0, 28), colour: getComputedStyle(el).color,
        ratio: Number(ratio(getComputedStyle(el).color, paper).toFixed(2)) }));
    })()`);
    check('every line on the page clears the 4.5:1 a page of text is held to',
      contrast.length > 3 && contrast.every((row) => row.ratio >= 4.5),
      contrast.filter((r) => r.ratio < 4.5).map((r) => `${r.ratio}:1 "${r.text}"`).join(' | ') || `${contrast.length} lines, worst ${Math.min(...contrast.map((r) => r.ratio))}:1`);

    // ── no page invents a colour ──────────────────────────────────────────────
    const palette = await page.evalJs(`(() => {
      // The page's palette is its **tokens**, read off the document, and nothing else: the ink,
      // the quiet ink, the accent and the green. Every page draws from the same four, so no
      // screen can quietly invent a fifth. (--gk-* still publishes the paintings' own pixels;
      // --ui-* is the page system built on top of them, and is checked here.)
      const css = getComputedStyle(document.documentElement);
      const token = (n) => css.getPropertyValue(n).trim();
      const inks = new Set(['rgb(48, 12, 12)', 'rgb(36, 16, 9)', 'rgb(63, 8, 3)', 'rgb(23, 48, 15)',
        'rgb(170, 129, 80)', 'rgb(170, 125, 72)']);
      const declared = [token('--ui-ink'), token('--ui-ink-soft'), token('--ui-accent'), token('--ui-green')];
      for (const hex of declared) {
        const h = hex.replace('#', '');
        if (h.length === 6) inks.add('rgb(' + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')');
      }
      // The level-up is a **window** now, not a page (the owner: *"not everything should be
      // scrolls"*), so its type is the stone's gold rather than a page's ink. Both sets are
      // pixels of the paintings — the check is that no page invents a third palette.
      const golds = new Set(['rgb(231, 215, 0)', 'rgb(255, 167, 0)', 'rgb(246, 226, 180)',
        'rgb(185, 160, 106)']);
      const pages = ['#menu .panel', '#inventory', '#talk', '#riddle', '#automap .panel'];
      const windows = ['#levelup', '#map-tools'];
      const out = [];
      for (const sel of pages) {
        const el = document.querySelector(sel);
        if (!el) continue;
        for (const node of [el, ...el.querySelectorAll('h2, p, b, button, .src, .hint, li')]) {
          const colour = getComputedStyle(node).color;
          if (!inks.has(colour)) out.push(sel + ' → ' + colour);
        }
      }
      for (const sel of windows) {
        const el = document.querySelector(sel);
        if (!el) continue;
        for (const node of [el, ...el.querySelectorAll('h2, p, b, button, .src, .hint, li, label, small, select, input')]) {
          const colour = getComputedStyle(node).color;
          if (!golds.has(colour)) out.push(sel + ' → ' + colour);
        }
      }
      return out.slice(0, 8);
    })()`);
    check('no page writes in a colour the paintings do not carry',
      palette.length === 0, palette.join(' | '));

    // ── the scroll's cut-outs are not paper ──────────────────────────────────
    // `PARCH.IMG` has transparent corners outside its rolled ends and torn sides. The paper
    // fill must stop at the border's inner edge, or it shows through those transparent pixels
    // as a pale rectangle around every scroll. The pack, the spellbook and the logbook each
    // wear the same frame; check the real pages, not the stylesheet's intent.
    await page.pressKey('Escape');
    await settle(300);
    await page.pressKey('KeyI');
    await page.waitFor('document.getElementById("inventory")?.classList.contains("on") === true',
      { label: 'the pack page', timeoutMs: 10000 });
    const packPage = await page.evalJs(`(() => {
      const el = document.getElementById('inventory');
      const s = getComputedStyle(el);
      return { mode: window.__debug.panel().mode, clip: s.backgroundClip, frame: s.borderImageSource.slice(0, 24) };
    })()`);
    await page.pressKey('KeyC');
    await page.waitFor('window.__debug.panel().mode === "spells"',
      { label: 'the spellbook page', timeoutMs: 10000 });
    const spellPage = await page.evalJs(`(() => {
      const el = document.getElementById('inventory');
      const s = getComputedStyle(el);
      return { mode: window.__debug.panel().mode, clip: s.backgroundClip, frame: s.borderImageSource.slice(0, 24) };
    })()`);
    await page.pressKey('Escape');
    await settle(250);
    await page.pressKey('KeyJ');
    await page.waitFor('document.getElementById("logbook")?.classList.contains("on") === true',
      { label: 'the logbook page', timeoutMs: 10000 });
    const logbookPage = await page.evalJs(`(() => {
      const el = document.getElementById('logbook');
      const s = getComputedStyle(el);
      return { open: el.classList.contains('on'), clip: s.backgroundClip, frame: s.borderImageSource.slice(0, 24) };
    })()`);
    await page.pressKey('Escape');
    await settle(250);
    check('the pack, the spellbook and the logbook keep their paper inside the scroll',
      packPage?.mode === 'bag' && spellPage?.mode === 'spells' && logbookPage?.open === true
      && [packPage, spellPage, logbookPage].every((page) => page?.clip === 'padding-box'
        && page.frame.includes('url("data:image/png')),
      JSON.stringify({ pack: packPage, spell: spellPage, logbook: logbookPage }));

    // ── the room a character is made in ───────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?chargen&${q}`);
    await page.waitFor('window.__debug?.scene === "chargen"', { label: 'creation', timeoutMs: 120000 });
    await settle(700);
    const room = await page.evalJs(`(() => {
      const art = document.getElementById('chargen-art');
      const s = art ? getComputedStyle(art) : null;
      const r = art ? art.getBoundingClientRect() : null;
      return {
        state: window.__debug.state().art,
        shown: Boolean(art && art.classList.contains('on')),
        width: art?.width, height: art?.height,
        css: s ? { w: s.width, h: s.height, border: s.borderTopWidth, shadow: s.boxShadow.slice(0, 40) } : null,
        rect: r ? { w: r.width, h: r.height } : null,
        panel: getComputedStyle(document.getElementById('chargen-panel')).borderImageSource.slice(0, 40),
      };
    })()`);
    check('character creation hangs the race\'s own painted sheet in the room',
      room.shown === true && room.state?.file === 'CHARBK00.IMG' && room.width > 0,
      JSON.stringify(room.state));
    check('the plate is the picture, not the sheet: its black margin is cut away',
      room.state?.crop?.x > 100 && room.width === room.state.crop.w && room.height === room.state.crop.h,
      JSON.stringify(room.state?.crop));
    check('it stands at its own aspect, framed in the scroll\'s gold — never stretched to the window',
      room.rect && Math.abs(room.rect.w / room.rect.h - room.width / room.height) < 0.03
      && room.css.border === '1px' && room.rect.w < 1280 * 0.6,
      `${room.rect?.w?.toFixed(0)}×${room.rect?.h?.toFixed(0)} for ${room.width}×${room.height}`);
    check('and the page beside it is a page of the same scroll',
      room.panel.includes('url("data:image/png'), room.panel);

    // The room follows the race and the gender: a Nord woman's sheet is the female Nord's.
    const switched = await page.evalJs(`(async () => {
      window.__debug.describe({ name: 'Probe', raceId: 'nord', gender: 'female' });
      await new Promise((r) => setTimeout(r, 500));
      return window.__debug.state().art;
    })()`);
    // **The woman's room is her own covered portrait.** `CHRBKF02.IMG` is Arena's bare
    // character sheet; a townswoman (`FMGENW01`) is not a portrait of the player either. The
    // room composes the same paper doll the inventory uses — female body, `FRSHIRT.IMG` robe,
    // `FPANTS.IMG` trousers — and the original `1EQUIP.CIF` plate cuirass, a closed breastplate,
    // over the robe's low neckline. The test names both covering layers. A test that accepted
    // `CHRBKF` alone, or the townswoman, would be asking for the defect back.
    check('and repaints when the race and the gender change — to her own clothed character portrait',
      String(switched?.file).startsWith('PORTRAIT:CHRBKF') && switched?.cover === 'FRSHIRT.IMG'
        && switched?.cuirass === 'plate-cuirass' && !String(switched?.file).includes('FMGENW')
        && switched?.crop?.x === 0 && switched?.crop?.w === switched?.width,
      JSON.stringify(switched));
    await page.screenshot(path.join(shots, 'gui-chargen.png'));

    // ── the map: a stone panel of controls, pages of paper, no character box ───
    await page.goto(`http://localhost:${getPort()}/?map&${q}`);
    await page.waitFor('window.__debug?.scene === "worldmap"', { label: 'the world map', timeoutMs: 120000 });
    await settle(900);
    const map = await page.evalJs(`(() => {
      const tools = document.getElementById('map-tools');
      const card = document.getElementById('map-card');
      const readout = document.getElementById('map-readout');
      const ts = tools ? getComputedStyle(tools) : null;
      return {
        tools: ts ? { frame: ts.borderImageSource.slice(0, 10), background: ts.backgroundImage,
          colour: ts.backgroundColor, ink: ts.color, radius: ts.borderTopLeftRadius } : null,
        readout: readout ? { colour: getComputedStyle(readout).color, text: readout.textContent.slice(0, 40) } : null,
        cardFrame: card ? getComputedStyle(card).borderImageSource.slice(0, 20) : null,
        sheet: Boolean(document.getElementById('map-sheet')),
        exit: Boolean(document.getElementById('map-exit')),
        newGame: Boolean(document.getElementById('map-newgame')),
      };
    })()`);
    check('the map\'s controls are a quiet stone window, and its place card is a page',
      map.tools?.frame === 'none' && map.tools.background === 'none'
      && /^rgba?\(15, 15, 27/.test(map.tools.colour) && map.tools.ink === 'rgb(231, 215, 0)'
      && map.tools.radius === '3px' && (map.cardFrame ?? '').includes('url("data:image/png'),
      JSON.stringify({ tools: map.tools, card: map.cardFrame }));
    check('the map\'s readout is readable on that stone — not dark red on near-black',
      map.readout?.colour === 'rgb(185, 160, 106)', `${map.readout?.colour} \u201c${map.readout?.text}\u201d`);
    check('the map has no character box — the vitals and the menu say all of it',
      map.sheet === false, map.sheet ? 'a #map-sheet is still in the page' : '');
    // The map's own page has nowhere to go back to, so `#map-exit` belongs to the overlay only
    // (the phone suite holds that one); what the map's page keeps is the new-game door.
    check('and the map keeps its way back to a new game, in the search panel',
      map.newGame === true, JSON.stringify({ newGame: map.newGame }));
    await page.screenshot(path.join(shots, 'gui-map.png'));

    // ── the room leaves nothing behind ────────────────────────────────────────
    check('no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
