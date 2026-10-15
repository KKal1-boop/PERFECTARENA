// ONE-COMMAND LAUNCHER.
//
//   node tools/launch.mjs [--port 8080] [--arena <folder>] [--no-open]
//
// `start.cmd` (Windows) and `start.sh` (macOS/Linux/Git Bash) are three lines each
// and only find a Node binary; every decision lives here, so the launcher behaves
// the same on all three and can be run directly when Node is already on the PATH.
//
// What it does, in order:
//
//   1. pick a port — the requested one, or the next free one above it, so two
//      copies of the game can run side by side instead of one failing to bind;
//   2. start `tools/serve.mjs` on it;
//   3. wait until the server actually answers (not merely "the process started");
//   4. open the player's browser on the game, unless told not to;
//   5. keep running, forwarding the server's own output, and stop it on Ctrl+C.
//
// `--arena <folder>` is for someone who does not want to use the folder picker:
// the folder is passed to the server, which exposes it to the page as the dev door
// (`?arena=…`), and the launcher opens that URL.

import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

/** @param {string} name @returns {string|null} */
function option(name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? '') : null;
}

const wanted = Number(option('port') ?? process.env.PORT ?? 8080);

/**
 * The Arena folder sitting beside this project, if it is there.
 *
 * `arena/ARENA` (the game this project ports) is a sibling of `PERFECTARENA/` in the
 * checkout the two live in, and a folder the launcher can find is a folder the player does
 * not have to pick. Nothing is assumed about *where* it is beyond the two spellings the
 * project's own layout uses, and a machine without it falls back to the picker exactly as
 * before — the game ships no data of its own (docs/DECISIONS.md D9).
 *
 * @returns {string|null}
 */
function findArenaFolder() {
  const candidates = [
    path.resolve(ROOT, '..', 'arena', 'ARENA'),
    path.resolve(ROOT, '..', 'ARENA', 'ARENA'),
    path.resolve(ROOT, '..', 'arena'),
    path.resolve(ROOT, 'arena', 'ARENA'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join(candidate, 'GLOBAL.BSA'))) return candidate;
    } catch { /* an unreadable candidate is simply not the one */ }
  }
  return null;
}

const arena = option('arena') ?? process.env.ARENA_PATH ?? findArenaFolder();
const open = !argv.includes('--no-open');

/** Is a TCP port free on loopback? */
function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

/** The first free port at or above `from`, so a second copy of the game still runs. */
async function firstFreePort(from) {
  for (let port = from; port < from + 40; port++) {
    if (await portFree(port)) return port;
  }
  throw new Error(`no free port from ${from} to ${from + 40}`);
}

/** Wait until the URL answers, or give up with the server's own last words. */
async function waitForServer(url, child, timeoutMs = 15000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`the server exited with code ${child.exitCode}`);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`the server did not answer ${url} within ${timeoutMs}ms (${lastError?.message ?? 'no response'})`);
}

/** Hand the URL to the desktop's default browser. Best effort, never fatal. */
function openBrowser(url) {
  const command = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command[0], /** @type {string[]} */ (command[1]), { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error(`This does not look like the PERFECTARENA folder: ${ROOT}`);
    process.exit(2);
  }
  const port = await firstFreePort(Number.isFinite(wanted) ? wanted : 8080);
  if (port !== wanted) console.log(`port ${wanted} is taken; using ${port}`);

  const env = { ...process.env };
  if (arena) env.ARENA_PATH = arena;

  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs'), String(port)], {
    cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'],
  });
  const url = `http://localhost:${port}/${arena ? `?arena=${encodeURIComponent(arena)}` : ''}`;

  const stop = () => { if (server.exitCode === null) server.kill(); };
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
  server.on('exit', (code) => { if (code) process.exit(code); });

  try {
    await waitForServer(`http://localhost:${port}/`, server);
  } catch (err) {
    console.error(`\n${err.message}`);
    stop();
    process.exit(1);
  }

  console.log('\n  PERFECTARENA is running.');
  console.log(`  ${url}`);
  if (arena) {
    console.log(`\n  Reading Arena's data from ${arena}`);
    console.log('  (found beside this project — pass --arena <folder> to use another install)');
  } else {
    console.log('\n  No Arena folder was found beside this project.');
    console.log('  The first time, pick the folder that holds GLOBAL.BSA — usually ARENA.');
  }
  console.log('\n  Then answer the ten questions, and you are in Tamriel.');
  console.log('\n  Ctrl+C here stops the game.\n');
  if (open && !openBrowser(url)) console.log(`  (open ${url} yourself — no browser launcher was found)`);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
