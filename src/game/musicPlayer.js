// THE MUSIC PLAYER — Arena's own songs, decoded and played over WebAudio.
//
// `game/arenaMusic.js` is the law and the reader (which file for which place, and an XMIDI stream
// as timed notes). This is the browser half: fetch the record from the install through the same
// `/arena-local` door the fanfare and the level's `@SOUND` clips use, parse it once, and play it as
// a loop built out of oscillator notes.
//
// Arena's soundtrack is XMIDI with FM instrument programs; there are no samples to decode. A
// faithful FM bank is a much bigger thing than this needs, so each program family gets a small
// **patch**: one or two detuned oscillators, an amplitude envelope shaped like the instrument
// (a piano is struck, a string section swells, a harp is plucked), a low-pass with its own
// envelope, and a shared room reverb. That is what turns the raw oscillator map the owner called
// "a bunch of messy sounds" into something that reads as an instrument. It is the install's
// melody and harmony, in the install's tempo, not a new score.
//
// The autoplay law is honored like the fanfare's: a context the page has not touched waits for the
// first gesture. While it waits, `musicState()` says `blocked` honestly.
//
// Nothing plays if the page has no AudioContext (a headless test, an old browser): every entry
// point answers `null`/false rather than throwing.

import { officialTrackSeconds, parseXmi } from './arenaMusic.js';

/** Parsed songs, by upper-case file name — one parse per page per song. */
const songs = new Map();
/** The live AudioContext, made on the first song. */
let ctx = null;
/** The mix bus: every song and jingle goes through one compressor, so a dense chord cannot clip. */
let masterBus = null;
/** A shared white-noise buffer for the drum channel, made once per context. */
let noiseBuffer = null;
/** The shared room: every song and jingle sends a little of itself here, as a real score does. */
let room = null;
/**
 * Voice budget. An XMIDI song can have a hundred overlapping sustained notes; playing every one
 * with two oscillators is both heavy and muddy. Past this many sounding voices the quietest new
 * notes are dropped rather than the oldest being cut (which would click).
 */
const MAX_VOICES = 64;
/** Sounding voices' stop times, pruned every pump. */
let voiceEnds = [];
/** The live transport: `{ name, gain, startedAt, index, timer, song }`. */
let current = null;
/** The live one-shot jingles, so a scene change stops them with the ambience. */
const jingles = new Set();
/** The last state a caller may read. */
let state = { song: null, playing: false, blocked: false, seconds: 0, notes: 0 };

/** Seconds of notes scheduled ahead of the play head; enough to survive a busy frame. */
const LOOKAHEAD = 0.9;
/** How often the scheduler wakes. */
const TICK_MS = 120;
/**
 * Master level. The songs are dense — a dozen simultaneous voices is ordinary — so the per-note
 * gains are small and a compressor catches the peaks; a single oscillator at 0.16 used to clip
 * the whole mix into the "messy sounds" the owner reported.
 */
const MASTER = 0.9;
/**
 * **The player's own music level**, 0…1, kept across pages (`pa.music.volume`). 0 is off.
 *
 * The owner asked for a settings slider: the soundtrack has no other mute, and a player who
 * turns it off should be obeyed on the next page too.
 */
export const MUSIC_VOLUME_KEY = 'pa.music.volume';
const DEFAULT_VOLUME = 0.8;

function storedVolume() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MUSIC_VOLUME_KEY) : null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}

let musicVolume = storedVolume();

/** The current music level, 0…1. */
export function getMusicVolume() { return musicVolume; }

/**
 * Set the music level, and remember it. A live song follows at once; a jingle already
 * scheduled keeps its own level until it ends (it is at most fifteen seconds).
 *
 * @param {number} value 0…1 (the slider's 0–100 is divided by the caller)
 * @returns {number} the value actually held
 */
export function setMusicVolume(value) {
  const n = Number(value);
  musicVolume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_VOLUME;
  try { localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)); } catch { /* no storage */ }
  if (current && ctx) {
    try { current.gain.gain.setTargetAtTime(MASTER * musicVolume, ctx.currentTime, 0.05); } catch { /* gone */ }
  }
  state = { ...state, volume: musicVolume };
  return musicVolume;
}
/** Fade time for a change of song, in seconds. */
export const MUSIC_FADE_S = 1.2;

function makeContext() {
  if (ctx) return ctx;
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    masterBus = ctx.createDynamicsCompressor();
    // A gentle limiter, not a pump: the songs need their phrasing, but a ten-voice chord must
    // not turn into a square wave at the destination.
    masterBus.threshold.value = -16;
    masterBus.knee.value = 12;
    masterBus.ratio.value = 6;
    masterBus.attack.value = 0.004;
    masterBus.release.value = 0.25;
    masterBus.connect(ctx.destination);
    // **A room around the instruments.** The XMIDI files were written for a synthesizer feeding
    // a hall, and dry oscillators at this density sound like a test tone. A generated stereo
    // impulse (decaying noise, slightly darkened) costs one buffer and turns a chord into a
    // performance; the send is low enough that a tavern stays a tavern.
    room = ctx.createConvolver();
    room.buffer = impulse(ctx, 1.9);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    room.connect(wet).connect(masterBus);
  } catch { ctx = null; masterBus = null; room = null; }
  return ctx;
}

/**
 * A short stereo impulse response for the room: two decorrelated noise channels under an
 * exponential decay, with the highest frequencies dying first (air absorbs them).
 *
 * @param {AudioContext} audio
 * @param {number} seconds
 * @returns {AudioBuffer}
 */
function impulse(audio, seconds) {
  const frames = Math.max(1, Math.round(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(2, frames, audio.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < frames; i++) {
      const t = i / frames;
      // A one-pole low-pass whose cutoff falls over time: a bright slap becoming a dark tail.
      const alpha = 0.55 - 0.45 * t;
      last = last + alpha * ((Math.random() * 2 - 1) - last);
      data[i] = last * (1 - t) ** 2.4;
    }
  }
  return buffer;
}

/** A send from a song bus into the shared room. */
function roomSend(audio, out) {
  if (!room) return;
  const send = audio.createGain();
  send.gain.value = 0.9;
  out.connect(send).connect(room);
}

/** Resume on the first gesture, and run `then` once the context is running. */
function unlock(then) {
  if (!ctx) return;
  if (ctx.state !== 'suspended') { then?.(); return; }
  const wake = () => {
    void ctx.resume().then(() => { then?.(); });
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
}

/**
 * The oscillator family a General MIDI program is closest to.
 *
 * General MIDI's own families are eight programs apart: 0–7 piano, 8–15 chromatic, 16–23
 * organ, 24–31 guitar, 32–39 bass, 40–47 strings, 48–55 ensemble, 56–63 brass, 64–71 reed,
 * 72–79 pipe, 80–87 synth lead, 88–95 synth pad. Arena's songs use 46 (harp), 48 (strings),
 * 52 (choir), 60 (horn), 68/71 (oboe/bassoon), 73 (flute), so the reed and pipe rows are not
 * academic: a flute played with a sawtooth is the harsh "messy" sound, and an oboe with a
 * triangle is a muffled one.
 */
export function voiceFor(program) {
  return patchFor(program).waves[0];
}

/**
 * The patch table: one entry per General MIDI family, tuned by ear against the install's songs.
 *
 * `waves` are layered oscillators (the second is detuned by `spread` cents), `attack` is the
 * swell in seconds, `sustain` is the fraction of the peak held until the note ends, `decay` is
 * the plucked/struck fall in seconds (0 = held), `cutoff` is the low-pass at the start and
 * `open` the filter's own envelope destination, `vibrato` adds a slow pitch wobble (cents), and
 * `level` scales the whole family so a string section is not four times a flute.
 */
const PATCHES = [
  /* 0 piano */       { waves: ['triangle', 'sine'], spread: 4, attack: 0.004, sustain: 0.0, decay: 1.5, cutoff: 4200, open: 5200, level: 1.0 },
  /* 1 chromatic */   { waves: ['triangle', 'sine'], spread: 6, attack: 0.003, sustain: 0.0, decay: 1.1, cutoff: 5200, open: 6400, level: 1.0 },
  /* 2 organ */       { waves: ['sine', 'sine'], spread: 0, octave: true, attack: 0.02, sustain: 0.9, decay: 0, cutoff: 5200, open: 5200, level: 0.85 },
  /* 3 guitar */      { waves: ['triangle', 'triangle'], spread: 5, attack: 0.004, sustain: 0.05, decay: 1.3, cutoff: 3200, open: 4200, level: 0.95 },
  /* 4 bass */        { waves: ['sine', 'triangle'], spread: 3, attack: 0.012, sustain: 0.72, decay: 0, cutoff: 1200, open: 1400, level: 1.25 },
  /* 5 strings */     { waves: ['sawtooth', 'sawtooth'], spread: 9, attack: 0.18, sustain: 0.8, decay: 0, cutoff: 2100, open: 3000, level: 0.55 },
  /* 6 ensemble */    { waves: ['sawtooth', 'triangle'], spread: 12, attack: 0.25, sustain: 0.85, decay: 0, cutoff: 1800, open: 2600, level: 0.6 },
  /* 7 brass */       { waves: ['sawtooth', 'square'], spread: 6, attack: 0.06, sustain: 0.7, decay: 0, cutoff: 1100, open: 3600, level: 0.5, vibrato: 4 },
  /* 8 reed */        { waves: ['square', 'sine'], spread: 4, attack: 0.035, sustain: 0.85, decay: 0, cutoff: 1500, open: 2100, level: 0.55, vibrato: 7 },
  /* 9 pipe */        { waves: ['sine', 'triangle'], spread: 3, attack: 0.06, sustain: 0.9, decay: 0, cutoff: 3600, open: 4200, level: 0.9, vibrato: 5 },
  /* 10 synth lead */ { waves: ['square', 'sawtooth'], spread: 8, attack: 0.03, sustain: 0.75, decay: 0, cutoff: 1900, open: 2800, level: 0.45 },
  /* 11 synth pad */  { waves: ['triangle', 'sawtooth'], spread: 14, attack: 0.3, sustain: 0.85, decay: 0, cutoff: 1500, open: 2200, level: 0.5 },
];

/** The family patch for a program number (0–127). */
export function patchFor(program) {
  const family = Math.max(0, Math.min(15, Math.floor((Number(program) || 0) / 8)));
  return PATCHES[Math.min(PATCHES.length - 1, family)];
}

/** MIDI note number → Hz (A4 = 69 = 440). */
export function noteHz(note) {
  return 440 * (2 ** ((Number(note) - 69) / 12));
}

/**
 * Fetch, parse and cache one song.
 *
 * @param {string} name  e.g. `TAVERN.XMI`
 * @param {string} arenaPath  the dev door's `?arena=` path
 * @returns {Promise<object|null>}
 */
async function loadSong(name, arenaPath) {
  const key = name.toUpperCase();
  if (songs.has(key)) return songs.get(key);
  const pending = (async () => {
    try {
      const res = await fetch(`/arena-local/${key}?arena=${encodeURIComponent(arenaPath)}`);
      if (!res.ok) return null;
      const song = parseXmi(new Uint8Array(await res.arrayBuffer()));
      if (!song) return null;
      // **The official track is the loop.** The decoded stream keeps the file's silent tail
      // and sparse outro (SUNNYDAY's last event is at 2:12 against a 0:48 track), so the
      // catalogue's seconds cap both the loop and the notes scheduled into it.
      const cap = officialTrackSeconds(key);
      if (!cap || cap >= song.seconds) return song;
      const notes = song.notes.filter((note) => note.at < cap);
      return { ...song, seconds: cap, notes, officialSeconds: cap, decodedSeconds: song.seconds };
    } catch {
      return null;
    }
  })();
  songs.set(key, pending);
  const song = await pending;
  songs.set(key, song);
  return song;
}

/**
 * One pitched note at an absolute context time.
 *
 * The envelope holds its level instead of decaying over the whole length: an XMIDI note's
 * length is its duration, so a seven-second string pad must not fade to a whisper in its first
 * second. Only the last 120 ms is the release.
 */
function playNote(audio, out, note, when) {
  if (note.channel === 9) { playDrum(audio, out, note, when); return; }
  if (voiceEnds.length >= MAX_VOICES) return;
  const patch = patchFor(note.program);
  const dur = Math.max(0.06, note.dur);
  const end = when + dur;
  const attack = Math.max(0.003, Math.min(patch.attack, dur * 0.5));
  const release = Math.min(0.22, Math.max(0.05, dur * 0.25));
  // The struck families fall away on their own (`decay`), whatever the file's note length;
  // bowed and blown families hold until the note is released, as on a real instrument.
  const hold = patch.decay > 0
    ? Math.min(end - release, when + attack + patch.decay)
    : Math.max(when + attack, end - release);
  const level = (note.volume ?? 1) * patch.level * (note.note < 48 ? 0.075 : 0.052);
  const amp = Math.max(0.0012, Math.min(0.1, (note.velocity / 127) * level));

  const gain = audio.createGain();
  gain.connect(out);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(amp, when + attack);
  gain.gain.setTargetAtTime(amp * Math.max(0.0001, patch.sustain), hold, patch.decay > 0 ? patch.decay * 0.2 : 0.04);
  gain.gain.setValueAtTime(Math.max(0.0001, amp * Math.max(0.0001, patch.sustain)), Math.max(hold, end - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  // One low-pass shapes the whole patch, and its own envelope is what makes a horn swell and a
  // piano speak. Without it, stacked sawtooths at this density are the buzz the owner heard.
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  const cutoff = patch.cutoff * (note.note < 48 ? 0.8 : 1);
  filter.frequency.setValueAtTime(cutoff, when);
  filter.frequency.linearRampToValueAtTime(Math.min(12000, Math.max(cutoff, patch.open)), when + Math.min(0.25, dur * 0.4));
  filter.frequency.setTargetAtTime(cutoff, hold, 0.3);
  filter.connect(gain);

  const hz = noteHz(note.note);
  patch.waves.forEach((wave, index) => {
    const osc = audio.createOscillator();
    osc.type = wave;
    const cents = index === 0 ? 0 : patch.spread;
    osc.frequency.setValueAtTime(hz * (2 ** (cents / 1200)), when);
    if (patch.octave && index === 1) osc.frequency.setValueAtTime(hz * 2, when);
    // A slow, shared vibrato for the winds and brass: one LFO per note, not per oscillator.
    if (patch.vibrato) {
      const lfo = audio.createOscillator();
      const depth = audio.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 5.1 + (note.note % 5) * 0.06;
      depth.gain.value = hz * (patch.vibrato / 1200);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(when); lfo.stop(end + 0.03);
    }
    osc.connect(filter);
    osc.start(when);
    osc.stop(end + 0.03);
  });
  voiceEnds.push(end + 0.05);
}

/** The shared white-noise buffer, made once. */
function noiseFor(audio) {
  if (noiseBuffer) return noiseBuffer;
  const frames = Math.max(1, Math.round(audio.sampleRate * 0.5));
  noiseBuffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/**
 * **Channel 10 is percussion.** An XMIDI drum note is a *drum*, not a pitch: sending note 38
 * through the string oscillator is a random high tone on every snare hit, which is most of what
 * "a bunch of messy sounds" meant. The set below is General MIDI's own note map.
 */
function playDrum(audio, out, note, when) {
  const key = Number(note.note) || 0;
  const level = (note.volume ?? 1) * Math.max(0.02, Math.min(0.11, (note.velocity / 127) * 0.08));
  const end = when + Math.max(0.05, Math.min(0.6, note.dur));
  const gain = audio.createGain();
  gain.connect(out);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  const noise = () => {
    const src = audio.createBufferSource();
    src.buffer = noiseFor(audio);
    src.loop = true;
    src.start(when);
    src.stop(end + 0.02);
    return src;
  };
  // Kick.
  if (key === 35 || key === 36) {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + Math.min(0.18, end - when));
    osc.connect(gain);
    osc.start(when); osc.stop(end + 0.02);
    return;
  }
  // Snare and clap: noise plus a short body.
  if (key === 38 || key === 39 || key === 40) {
    const filter = audio.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 900;
    noise().connect(filter).connect(gain);
    const osc = audio.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 180;
    osc.connect(gain); osc.start(when); osc.stop(end + 0.02);
    return;
  }
  // Closed and open hi-hats.
  if (key === 42 || key === 44 || key === 46) {
    const filter = audio.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 6500;
    noise().connect(filter).connect(gain);
    return;
  }
  // Crashes, rides and splashes.
  if ([49, 51, 52, 53, 55, 57, 59].includes(key)) {
    const filter = audio.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 4200;
    noise().connect(filter).connect(gain);
    return;
  }
  // Toms and everything else: a pitched drum with a fast fall.
  const osc = audio.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(80, when + Math.min(0.2, end - when));
  osc.connect(gain);
  osc.start(when); osc.stop(end + 0.02);
}

/** Schedule everything that starts within the lookahead. */
function pump() {
  if (!current || !ctx) return;
  const transport = current;
  const elapsed = ctx.currentTime - transport.startedAt;
  // Loop an instant before the last note has finished, so the return is a breath and not a gap.
  if (elapsed > transport.song.seconds) {
    transport.startedAt = ctx.currentTime + 0.05;
    transport.index = 0;
    return;
  }
  const horizon = elapsed + LOOKAHEAD;
  const now = ctx.currentTime;
  if (voiceEnds.length) voiceEnds = voiceEnds.filter((end) => end > now);
  const notes = transport.song.notes;
  while (transport.index < notes.length && notes[transport.index].at <= horizon) {
    const note = notes[transport.index++];
    const when = transport.startedAt + note.at;
    if (when >= ctx.currentTime - 0.05) playNote(ctx, transport.gain, note, Math.max(ctx.currentTime, when));
  }
}

/**
 * **Play a song, or keep the one already playing.**
 *
 * Same name → no-op (the frame loop may ask every tick). A different name fades the old one out
 * and the new one in, so walking from a street into a tavern is a breath rather than a cut.
 *
 * @param {string|null} name  a file from `arenaMusic.js`, or null to stop
 * @param {{arenaPath?: string}} [opts]
 * @returns {Promise<object>} `musicState()`
 */
export async function playMusic(name, opts = {}) {
  if (!name) { stopMusic(); return state; }
  const key = String(name).toUpperCase();
  if (current?.name === key) return state;
  // A song asked for while an earlier one is still loading: the newest wins.
  const token = (playMusic.token = (playMusic.token ?? 0) + 1);
  const arenaPath = opts.arenaPath || 'C:/arenaproject/arena/ARENA';
  const song = await loadSong(key, arenaPath);
  if (token !== playMusic.token || !song) {
    state = { ...state, song: key, error: song ? undefined : 'not in the install' };
    return state;
  }
  const audio = makeContext();
  if (!audio) { state = { ...state, song: key, blocked: true }; return state; }
  // **One song at a time.** The old transport used to fade under the new one for 1.2 s, which
  // is two songs playing at once — the owner heard it as overlap on every place change. The
  // old one is stopped and disconnected first; the new one then rises under a short 0.12 s
  // attack, which is a clean start rather than a layer.
  if (current) {
    const old = current;
    current = null;
    clearInterval(old.timer);
    try {
      old.gain.gain.cancelScheduledValues(audio.currentTime);
      old.gain.gain.setValueAtTime(0.0001, audio.currentTime);
      old.gain.disconnect();
    } catch { /* a closed context */ }
  }
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.linearRampToValueAtTime(MASTER * musicVolume, audio.currentTime + 0.12);
  gain.connect(masterBus ?? audio.destination);
  roomSend(audio, gain);
  current = { name: key, song, gain, startedAt: audio.currentTime + 0.06, index: 0, timer: null };
  state = { song: key, playing: audio.state === 'running', blocked: audio.state === 'suspended',
    seconds: song.seconds, notes: song.notes.length, program: null, volume: musicVolume };
  const begin = () => {
    if (!current || current.name !== key) return;
    current.startedAt = ctx.currentTime + 0.06;
    current.index = 0;
    clearInterval(current.timer);
    current.timer = setInterval(pump, TICK_MS);
    pump();
    state = { ...state, playing: true, blocked: false };
  };
  if (audio.state === 'suspended') unlock(begin);
  else begin();
  return state;
}

/**
 * **A one-shot tune** — a settlement's entrance jingle.
 *
 * The jingles are 2–15 seconds (`VILLAGE` 2.4, `TOWN` 4.0, `CITY` 15.4 measured), so they are
 * not looped and they do not replace the ambient song: the whole tune is scheduled at once through
 * a gain of its own, and the weather's own song keeps playing underneath.
 *
 * @param {string|null} name @param {{arenaPath?: string, volume?: number}} [opts]
 * @returns {Promise<boolean>} whether it started (or was queued for the first gesture)
 */
export async function playJingle(name, opts = {}) {
  if (!name) return false;
  const key = String(name).toUpperCase();
  const arenaPath = opts.arenaPath || 'C:/arenaproject/arena/ARENA';
  const song = await loadSong(key, arenaPath);
  const audio = makeContext();
  if (!audio || !song) return false;
  const start = () => {
    // **The jingle replaces the ambience, it does not sit on top of it.** The street's weather
    // song used to keep playing under the city's arrival tune, which is the overlap the owner
    // reported. `onEnd` lets the scene ask for the place's song again when the tune is over.
    stopMusic();
    const out = audio.createGain();
    out.gain.value = Math.max(0, Math.min(1, (opts.volume ?? 0.8) * musicVolume));
    out.connect(masterBus ?? audio.destination);
    roomSend(audio, out);
    const at = audio.currentTime + 0.05;
    for (const note of song.notes) playNote(audio, out, note, at + note.at);
    jingles.add(out);
    state = { ...state, jingle: key, jingleSeconds: song.seconds };
    setTimeout(() => {
      jingles.delete(out);
      try { out.disconnect(); } catch { /* gone */ }
      state = { ...state, jingle: null, jingleSeconds: 0 };
      opts.onEnd?.(song);
    }, (song.seconds + 0.5) * 1000);
  };
  if (audio.state === 'suspended') { unlock(start); return true; }
  start();
  return true;
}

/** Stop the music, under a fade. A **jingle goes with it** — the arrival tune used to outlive
 *  the street it was played for and score the fast travel that followed. */
export function stopMusic() {
  // A song still loading when the scene changed must not start on the dead scene.
  playMusic.token = (playMusic.token ?? 0) + 1;
  for (const out of jingles) {
    try {
      if (ctx) {
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
        out.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      }
      setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, 1000);
    } catch { /* a closed context */ }
  }
  jingles.clear();
  state = { ...state, jingle: null, jingleSeconds: 0 };
  if (!current) { state = { ...state, playing: false, song: null }; return state; }
  const old = current;
  current = null;
  clearInterval(old.timer);
  if (ctx) {
    try {
      old.gain.gain.cancelScheduledValues(ctx.currentTime);
      old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
      old.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + MUSIC_FADE_S);
      setTimeout(() => { try { old.gain.disconnect(); } catch { /* gone */ } }, MUSIC_FADE_S * 1000 + 400);
    } catch { /* a closed context */ }
  }
  state = { ...state, playing: false, song: null };
  return state;
}

/** What the music is doing, for the debug seam and the tests. */
export function musicState() {
  return { ...state, volume: musicVolume, fadeSeconds: MUSIC_FADE_S };
}

/** Is a song loaded under this name? (For a test that only wants the reader.) */
export function cachedSong(name) {
  const hit = songs.get(String(name ?? '').toUpperCase());
  return hit && typeof hit.then !== 'function' ? hit : null;
}
