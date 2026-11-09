// THE SONG COMES FROM THE PLAYER'S OWN FOLDER (2026-10-22).
//
// The owner, playing a Cloudflare deployment on Android: *"whole all the sounds work but the
// music doesnt"*. The cause was one line: `loadSong` fetched `/arena-local/<NAME>?arena=…`, which
// is this project's **dev server mount**. A deployed page has no such route and a picked folder is
// not a URL, so every `.VOC` effect played (they go through the scene's `ArenaSource`) and the
// soundtrack was silent.
//
// `setMusicSource` is the hand-off: the music asks the same lookup every other file does
// (`arenaData.js`: loose file, then `GLOBAL.BSA` — where the `.XMI` records live). This test drives
// it with a source built from the real install, and with the network nailed shut, so "the folder
// answered" cannot be confused with "the dev server answered".
//
//   node --test tests/unit/musicplayer.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadSong, musicSourceReady, setMusicSource } from '../../src/game/musicPlayer.js';
import { MUSIC_CATALOG } from '../../src/game/arenaMusic.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const hasInstall = fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));

/** A picked folder, as the browser hands one over: loose names, then the archive. */
function folderSource({ loose = new Map(), archive = null } = {}) {
  const reads = [];
  return {
    label: 'picker',
    reads,
    async getBytes(name) {
      const key = String(name).toUpperCase();
      reads.push(key);
      if (loose.has(key)) return loose.get(key);
      if (key === 'GLOBAL.BSA' && archive) return archive;
      return null;
    },
  };
}

/** The real install's `GLOBAL.BSA`, read once. */
const archiveBytes = hasInstall ? new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))) : null;

test('a song is read out of the folder the player picked — the archive, with no network at all', { skip: !hasInstall && 'no Arena install here' }, async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; return { ok: false }; };
  try {
    const source = folderSource({ archive: archiveBytes });
    setMusicSource(source);
    assert.equal(musicSourceReady(), true, 'the hand-off is what the frame loop relies on');
    const name = MUSIC_CATALOG.tavern ?? 'TAVERN.XMI';
    const song = await loadSong(name, 'C:/no-such-server-path');
    assert.ok(song, `${name} was not read from the picked folder`);
    assert.ok(song.notes.length > 0, 'and it is the parsed stream, not raw bytes');
    assert.ok(song.seconds > 0);
    assert.equal(fetched, 0, 'the dev server was never asked: a picked folder is not a URL');
    assert.ok(source.reads.includes(name.toUpperCase()), `the source was asked for ${name}`);
    assert.ok(source.reads.includes('GLOBAL.BSA'), 'and the archive answered, which is where the .XMI lives');
  } finally {
    globalThis.fetch = realFetch;
    setMusicSource(null);
  }
});

test('a loose copy of the song is read before the archive is opened', { skip: !hasInstall && 'no Arena install here' }, async () => {
  const { parseBsa } = await import('../../src/arena/bsaArchive.js');
  const archive = parseBsa(archiveBytes, 'GLOBAL.BSA');
  const name = MUSIC_CATALOG.tavern ?? 'TAVERN.XMI';
  const loose = archive.get(name);
  assert.ok(loose, `${name} is in the install's archive`);
  const source = folderSource({ loose: new Map([[name.toUpperCase(), loose]]) });
  setMusicSource(source);
  try {
    const song = await loadSong(name, 'C:/no-such-server-path');
    assert.ok(song && song.notes.length > 0);
    assert.deepEqual(source.reads, [name.toUpperCase()], 'the loose file answered; the archive was never parsed');
  } finally { setMusicSource(null); }
});

test('a page with no source keeps the dev door, and a missing song is an answer, not a throw', async () => {
  setMusicSource(null);
  assert.equal(musicSourceReady(), false);
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: false }; };
  try {
    assert.equal(await loadSong('NOSONG.XMI', 'C:/arena'), null);
    assert.match(asked[0], /^\/arena-local\/NOSONG\.XMI\?arena=/, 'the fallback is the dev mount it always was');
  } finally { globalThis.fetch = realFetch; }
});

test('a folder that changes clears the songs read from the old one', async () => {
  setMusicSource(null);
  assert.equal(musicSourceReady(), false);
  setMusicSource(folderSource());
  assert.equal(musicSourceReady(), true);
  setMusicSource(null);
  assert.equal(musicSourceReady(), false);
});
