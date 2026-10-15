// A MINIMAL Chrome DevTools Protocol client.
//
// The task's verification rules ask for headless Chromium with WebGL2 and a
// console-error check. Playwright is not installed on this machine (see
// docs/DECISIONS.md D8), but Chrome/Edge are, and Node 22 has a global
// `WebSocket` — which is everything a CDP client needs. This file is that
// client: launch, attach, evaluate, screenshot, console capture.
//
// It is deliberately small and dependency-free so `npm test` works on a bare
// checkout.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

/** @returns {string|null} the first installed Chromium-family browser. */
export function findBrowser() {
  for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Launch a browser and open a CDP session on a fresh page. */
export async function launch({ width = 960, height = 600, browser = null, port = 9333 } = {}) {
  const exe = browser || findBrowser();
  if (!exe) throw new Error('no Chromium-family browser found; set CHROME_PATH');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-cdp-'));
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-dev-shm-usage', '--no-sandbox',
    // Headless WebGL2 runs on ANGLE/SwiftShader; the flag below is what Chrome
    // requires before it will fall back to software rendering.
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--window-size=${width},${height}`,
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });

  let version = null;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not up yet */ }
    await sleep(100);
  }
  if (!version) { proc.kill(); throw new Error(`browser did not start (port ${port})\n${stderr.slice(-800)}`); }

  const targetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await targetRes.json();
  const page = await attach(target.webSocketDebuggerUrl, { width, height });
  page.closeBrowser = () => {
    try { proc.kill(); } catch { /* gone */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
  };
  return page;
}

/** Open a CDP session and enable the domains the tests need. */
async function attach(wsUrl, { width, height } = {}) {
  const page = await connect(wsUrl);
  page.__console = [];
  page.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    page.__console.push(current(p.type ? { type: p.type, text } : { text }));
  });
  page.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails ?? {};
    page.__console.push({ type: 'error', text: d.exception?.description || d.text || 'exception' });
  });
  page.on('Log.entryAdded', (p) => {
    const e = p.entry ?? {};
    // The browser reports failed subresources and CSP noise here too; the URL
    // is kept so a caller can tell a missing favicon from a missing module.
    page.__console.push({ type: e.level === 'error' ? 'error' : 'info', source: e.source, url: e.url ?? '', text: `[${e.source}] ${e.text}${e.url ? ` <${e.url}>` : ''}` });
  });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  if (width && height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }
  /** Navigate and wait for the load event. */
  page.goto = async (url, { timeoutMs = 30000 } = {}) => {
    const loaded = new Promise((resolve) => page.once('Page.loadEventFired', resolve));
    await page.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(timeoutMs)]);
  };
  /** Evaluate an expression in the page and return its value. */
  page.evalJs = async (expression) => {
    const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    return r.result?.value;
  };
  /** Poll an expression until it is truthy (or give up). */
  page.waitFor = async (expression, { timeoutMs = 20000, label = expression } = {}) => {
    const t0 = Date.now();
    let lastErr = null;
    for (;;) {
      let v;
      try { v = await page.evalJs(expression); lastErr = null; } catch (e) { v = undefined; lastErr = e; }
      if (process.env.PA_DEBUG) console.log(`[wait] ${expression} => ${JSON.stringify(v)}${lastErr ? ` ERR ${lastErr.message}` : ''}`);
      if (v) return v;
      if (Date.now() - t0 > timeoutMs) {
        if (lastErr) throw lastErr;
        throw new Error(`timed out waiting for ${label}`);
      }
      await sleep(120);
    }
  };
  page.screenshot = async (file) => {
    const r = await page.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(r.data, 'base64');
    if (file) fs.writeFileSync(file, buf);
    return buf;
  };
  page.consoleMessages = () => page.__console.slice();
  page.consoleErrors = () => page.__console.filter((m) => m.type === 'error');
  /**
   * Click at a viewport point with real mouse events, so the page sees a pointer
   * press and release exactly as it would from a person. A synthetic
   * `element.click()` would prove only that the handler runs, not that anything is
   * hittable — and the board's buttons sit under a canvas.
   */
  page.clickAt = async (x, y, { button = 'left', clickCount = 1 } = {}) => {
    const base = { x: Math.round(x), y: Math.round(y), button, clickCount, buttons: button === 'left' ? 1 : 2 };
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, buttons: 0 });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  };
  /**
   * The centre of the first element matching a selector, or null if it has no box.
   * `extra` is prepended inside the probe, so a scroll can be done in the same
   * expression before the box is read.
   */
  const probeBox = (selector, extra = '') => page.evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    ${extra}
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    // "In view" is not enough: an ancestor that clips (--inventory's own
    // overflow auto and max-height 78vh) holds a button whose box is well
    // inside the window while the *button* sits under the clip, unreachable by
    // any pointer. The pointer's own answer -- what the click would hit -- is
    // what decides whether a press can land there.
    const at = document.elementFromPoint(x, y);
    const hit = at && (at === el || el.contains(at));
    return { x, y, hit, inView: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth };
  })()`);

  /**
   * Click the centre of the first element matching a selector, with real mouse
   * events at real viewport coordinates.
   *
   * A mouse event outside the viewport hits nothing at all, so a long panel — the
   * character-creation class list, whose button is below the fold — needs the same
   * thing a person needs: a scroll first. That scroll is done here, and the box is
   * re-read afterwards, because a click at the pre-scroll coordinates would be
   * dispatched to whatever happens to be there now. The press itself is still a
   * real press at real coordinates (see `clickAt`); only the reaching is helped.
   *
   * The reaching is *proved*, not assumed: the box is only accepted when a
   * probe click at its coordinates would land on the element itself (ancestor
   * clipping counts as not-in-view, which is where a shop's shelf, under its
   * panel's own scroll, used to lose every press to the canvas behind it).
   */
  page.clickSelector = async (selector) => {
    let rect = await probeBox(selector);
    if (!rect) throw new Error(`nothing clickable at ${selector}`);
    if (!rect.inView || !rect.hit) {
      rect = await probeBox(selector, 'el.scrollIntoView({ block: "center", inline: "center" });');
      if (!rect) throw new Error(`nothing clickable at ${selector}`);
      await sleep(120); // let the scroll land before the press
      rect = await probeBox(selector);
      if (!rect) throw new Error(`nothing clickable at ${selector}`);
      if (!rect.inView || !rect.hit) throw new Error(`${selector} could not be brought under the pointer (in ${JSON.stringify(rect)})`);
    }
    await page.clickAt(rect.x, rect.y);
    return rect;
  };
  /** Send a real key event for a DOM code (e.g. 'KeyW', 'Space'). */
  page.pressKey = async (code, down = true) => {
    const map = {
      KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68],
      KeyB: ['b', 66], KeyE: ['e', 69], KeyM: ['m', 77], KeyP: ['p', 80],
      KeyF: ['f', 70], KeyV: ['v', 86], KeyL: ['l', 76], KeyT: ['t', 84],
      Digit1: ['1', 49], Digit2: ['2', 50], Digit3: ['3', 51], Digit4: ['4', 52],
      Digit5: ['5', 53], Digit6: ['6', 54], Digit7: ['7', 55], Digit8: ['8', 56],
      BracketLeft: ['[', 219], BracketRight: [']', 221],
      Space: [' ', 32], ShiftLeft: ['Shift', 16], Escape: ['Escape', 27], Enter: ['Enter', 13],
    };
    const [key, vk] = map[code] ?? [code, 0];
    await page.send('Input.dispatchKeyEvent', {
      type: down ? (code === 'Space' ? 'rawKeyDown' : 'keyDown') : 'keyUp',
      code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    });
  };
  return page;
}

/**
 * One CDP connection: request/response over the WebSocket plus an event emitter
 * for the domains the tests subscribe to.
 */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const listeners = new Map();
  let nextId = 1;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(new Error(`websocket failed: ${e?.message ?? 'error'}`));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else p?.resolve(msg.result ?? {});
      return;
    }
    for (const fn of listeners.get(msg.method) ?? []) fn(msg.params ?? {});
  };
  const page = {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
    once(method, fn) {
      const wrap = (p) => { fn(p); const list = listeners.get(method) ?? []; const i = list.indexOf(wrap); if (i >= 0) list.splice(i, 1); };
      page.on(method, wrap);
    },
    close: () => ws.close(),
  };
  return page;
}

const current = (x) => x;

// ── PNG reading (for the "screenshot is not blank" check) ────────────────────

/**
 * Decode a non-interlaced 8-bit PNG to RGBA.
 * @param {Buffer} buf
 * @returns {{width:number, height:number, data:Uint8Array}}
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let o = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    for (let i = 0; i < stride; i++) {
      const x = raw[p + i];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
    p += stride;
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      if (channels === 1 || channels === 2) { out[d] = out[d + 1] = out[d + 2] = cur[s]; out[d + 3] = channels === 2 ? cur[s + 1] : 255; }
      else { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = channels === 4 ? cur[s + 3] : 255; }
    }
    prev.set(cur);
    cur.fill(0);
  }
  return { width, height, data: out };
}

/**
 * How much picture is in a decoded PNG: distinct colours and the share of
 * pixels that differ from the most common one.
 * @param {{width:number,height:number,data:Uint8Array}} png
 */
export function imageStats(png) {
  const counts = new Map();
  for (let i = 0; i < png.data.length; i += 4) {
    const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = png.width * png.height;
  let top = 0;
  for (const n of counts.values()) if (n > top) top = n;
  return { width: png.width, height: png.height, distinctColors: counts.size, dominantShare: top / total };
}
