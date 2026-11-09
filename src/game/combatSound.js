// THE SOUNDS OF A FIGHT — swings, steel, wounds, spells and the small noises between.
//
// The owner, 2026-10-19: *"combat should have sound swinging magic everything should have
// sound"*. Then, 2026-10-21: *"sounds that perfectarena uses for everything from door opening
// to combat to everything are not the correct sounds the original arena is using"*. He was
// right: the first version of this module **synthesized** every cue from oscillators and
// filtered noise, on the belief that the archive carried no fight audio. It does.
//
// ## The clips are the install's own
//
// `GLOBAL.BSA` holds 76 Creative `.VOC` files, and `OpenTESArena/src/Assets/ArenaSoundName.h`
// names the ones the original engine wires — the list this module's `CLIPS` table follows:
//
//   `SWISH.VOC`      a weapon's swing          `CLANK.VOC`    steel on steel
//   `BASH.VOC`       a shield taking a blow    `EHIT.VOC`     a creature struck
//   `NHIT.VOC`       a fist's hit              `UHIT.VOC`     the player struck
//   `ARROWFR.VOC`    a bow loosed              `ARROWHT.VOC`  an arrow landing
//   `MDIE.VOC`       a man's death             `FDIE.VOC`     a woman's death
//   `BODYFALL.VOC`   a body hitting the floor   `UMPH.VOC`     a landing
//   `SLOWBALL.VOC`   a spell leaving the hand   `BURST5.VOC`   a spell bursting
//   `EXPLODE.VOC`    a fireball's finish        `OPENDOOR.VOC` a door opening
//   `CLOSDOOR.VOC`   a door shutting           `OPENALT.VOC`  a chest or hatch
//   `LOCK.VOC`       a lock refusing           `CLICKS.VOC`   a small handled thing
//   `DIRTL/DIRTR.VOC`, `MUDSTEP.VOC`, `SNOWL/SNOWR.VOC` — a boot on each ground
//   `SPLASH.VOC`, `SWIMMING.VOC` — water       `HALT.VOC`, `STPTHIEF.VOC` — a guard
//   `THUNDER.VOC` — the sky                    `FANFARE1/2.VOC` — an earned moment
//
// Which file serves which *game event* is this project's mapping (`CLIPS` below), because the
// original's jump table lives in `A.EXE` and is not in this checkout. The files, their bytes
// and their playback rate are Arena's; the `.VOC` decode is `arena/vocFile.js`, the same
// decoder the level's own `@SOUND` triggers use.
//
// ## A loader, because the bytes are the install's
//
// Nothing is bundled. The scene hands this module a loader (`setSfxLoader`) that reads a name
// through the same door as everything else (`ArenaData.bytes`: a player's picked folder, then
// `GLOBAL.BSA`). The first cue for a clip decodes it once and caches the buffer; a clip the
// install lacks (a flail's art, a made-up cue) falls back to the synth below, and the state
// says which path a cue took so a probe can tell.
//
// ## The autoplay law
//
// A browser may refuse a context until the page has been touched. Every entry point is safe
// without an `AudioContext` (a headless test, an old browser): `playSfx` answers `false` and
// never throws. A context already made is resumed on the next cue, and the first real input —
// which is what every fight cue follows — is the gesture the law wants.
//
// ## Volume
//
// The menu's **Sound** slider is `setSfxVolume(getSfxVolume())`, kept across pages in
// `localStorage`. Music has its own slider beside it; a player who wants a quiet fight and a
// loud score can have both.

import { decodeVoc } from '../arena/vocFile.js';

/** Where the sound level is remembered, 0…1. */
export const SFX_VOLUME_KEY = 'pa.sfx.volume';
/**
 * **A new player hears the world at full level.** The owner, 2026-11-04: *"when you start the game
 * for the first time the sound and music is to 100% and not 0"*. It was 0.8, and the absent-key
 * read below turned a first visit into 0 — `Number(null)` is 0, and 0 is a finite number.
 */
const DEFAULT_VOLUME = 1;

/**
 * **The event → Arena's own file.** A list, because two clips can make one sound (a body
 * falling is the death cry and the floor), and an empty list means the install has no answer
 * and the synth below speaks.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const CLIPS = Object.freeze({
  swing: ['SWISH.VOC'],
  monsterSwing: ['SWISH.VOC'],
  hitFlesh: ['EHIT.VOC'],
  hitArmour: ['CLANK.VOC'],
  clang: ['CLANK.VOC'],
  parry: ['CLANK.VOC'],
  block: ['BASH.VOC'],
  dodge: ['SWISH.VOC'],
  bow: ['ARROWFR.VOC'],
  arrowHit: ['ARROWHT.VOC'],
  arrowWall: ['ARROWHT.VOC'],
  cast: ['SLOWBALL.VOC'],
  spell: ['BURST5.VOC'],
  spellHit: ['BURST5.VOC'],
  explosion: ['EXPLODE.VOC'],
  playerHurt: ['UHIT.VOC'],
  monsterDeath: ['MDIE.VOC', 'BODYFALL.VOC'],
  death: ['MDIE.VOC', 'BODYFALL.VOC'],
  pickup: ['CLICKS.VOC'],
  coin: ['CLICKS.VOC'],
  equip: ['CLANK.VOC'],
  potion: ['CLICKS.VOC'],
  chest: ['OPENALT.VOC'],
  door: ['OPENDOOR.VOC'],
  doorShut: ['CLOSDOOR.VOC'],
  doorLocked: ['LOCK.VOC'],
  levelUp: ['FANFARE1.VOC'],
  quest: ['FANFARE2.VOC'],
  step: ['DIRTL.VOC'],
  stepDirtLeft: ['DIRTL.VOC'],
  stepDirtRight: ['DIRTR.VOC'],
  stepMud: ['MUDSTEP.VOC'],
  stepSnowLeft: ['SNOWL.VOC'],
  stepSnowRight: ['SNOWR.VOC'],
  jump: ['SWISH.VOC'],
  land: ['UMPH.VOC'],
  swim: ['SWIMMING.VOC'],
  splash: ['SPLASH.VOC'],
  thunder: ['THUNDER.VOC'],
  halt: ['HALT.VOC'],
  stopThief: ['STPTHIEF.VOC'],
  ui: ['CLICKS.VOC'],
  // **No file.** The install has no clip for a rest's hush, a level's fanfare-less bookkeeping
  // or a refusal's flat note; those are the cues the synth below still owns, and the state
  // marks them `synth`.
  rest: [],
  error: [],
});

/**
 * **EVERY CREATURE'S OWN VOICE** — the install's `.VOC` per monster.
 *
 * The owner, 2026-10-22: *"enemies all need to have their sounds like illustrated here
 * (https://en.uesp.net/wiki/Arena:Monsters)"*. `GLOBAL.BSA` carries a named clip for most of
 * UESP's roster, and they are the creatures' own recordings rather than a generic hit sound:
 * `RATS`, `WOLF`, `GHOST`, `SKELETON`, `ORC`, `TROLL`, `LICH`, `MEDUSA`, `VAMPIRE`,
 * `MINOTAUR`, `ZOMBIE`, `GHOUL`, `WRAITH`, `HELLHOUN`, `HOMO`, `FIREDAEM`, `ICEGOLEM`,
 * `STONEGOL`, `IRONGOLS`, `LIZARDST`. A creature the archive gives no name to (a goblin, a
 * spider, a human foe) takes the nearest voice the install does have rather than none, and
 * the mapping says which row is the stand-in.
 *
 * The creature's clip is the **cry**; a death is that cry plus the body hitting the floor
 * (`BODYFALL`), which is what the original's own death is.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MONSTER_VOICES = Object.freeze({
  rat: 'RATS.VOC',
  // No `GOBLIN.VOC` in this install: the goblin is the generic monster growl.
  goblin: 'MONSTER.VOC',
  wolf: 'WOLF.VOC',
  snowwolf: 'WOLF.VOC',
  lizardman: 'LIZARDST.VOC',
  skeleton: 'SKELETON.VOC',
  orc: 'ORC.VOC',
  ghoul: 'GHOUL.VOC',
  // A spider has no voice; the wet chitter is the closest the install has.
  spider: 'SQUISH1.VOC',
  minotaur: 'MINOTAUR.VOC',
  ghost: 'GHOST.VOC',
  hellhound: 'HELLHOUN.VOC',
  troll: 'TROLL.VOC',
  zombie: 'ZOMBIE.VOC',
  wraith: 'WRAITH.VOC',
  homonculus: 'HOMO.VOC',
  icegolem: 'ICEGOLEM.VOC',
  stonegolem: 'STONEGOL.VOC',
  irongolem: 'IRONGOLS.VOC',
  firedaemon: 'FIREDAEM.VOC',
  medusa: 'MEDUSA.VOC',
  vampire: 'VAMPIRE.VOC',
  lich: 'LICH.VOC',
  // Tharn is a lich's voice in the install; his own lines are the cutscenes' (`JAGAR.FLC`).
  jagartharn: 'LICH.VOC',
  // **A human foe** has no creature's clip: his breath is the install's own `UMPH`, and his
  // death is `MDIE`/`FDIE` (`clipsFor`'s `monsterDeath`), which is how the original voices one.
  human: 'UMPH.VOC',
});

/**
 * The clip a creature's cry is made of, or null when this install has no voice for it.
 * @param {string} id  a `monsters.js` id
 * @returns {string|null}
 */
export function monsterVoice(id) {
  const key = String(id ?? '').toLowerCase();
  return MONSTER_VOICES[key] ?? (key ? 'MONSTER.VOC' : null);
}

/** The live context and its two reusable pieces. */
let ctx = null;
let master = null;
let noiseBuffer = null;

/** The scene's door to the install's bytes, set once (`setSfxLoader`). */
let loadBytes = null;

/** Decoded clips by name, and the in-flight decodes so two hits do not decode twice. */
const clipCache = new Map();

/** The last cue, as the debug seam reads it. */
let state = { fires: 0, last: null, volume: DEFAULT_VOLUME, blocked: false, source: null, clip: null };

function storedVolume() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SFX_VOLUME_KEY) : null;
    // **No stored level means no choice yet**, not a mute. A real stored "0" keeps its silence.
    if (raw === null || raw === '') return DEFAULT_VOLUME;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}

let sfxVolume = storedVolume();
state.volume = sfxVolume;

/** The current sound level, 0…1. */
export function getSfxVolume() { return sfxVolume; }

/**
 * Set the sound level, and remember it.
 *
 * @param {number} value 0…1
 * @returns {number} the value actually held
 */
export function setSfxVolume(value) {
  const n = Number(value);
  sfxVolume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_VOLUME;
  try { localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume)); } catch { /* no storage */ }
  if (master && ctx) {
    try { master.gain.setTargetAtTime(0.9 * sfxVolume, ctx.currentTime, 0.03); } catch { /* gone */ }
  }
  state = { ...state, volume: sfxVolume };
  return sfxVolume;
}

/** The last cue's state, for a probe. */
export function sfxState() { return { ...state }; }

/**
 * Give this module its door to Arena's own bytes.
 *
 * The scene calls this once, with `(name) => data.bytes(name)` — the same loose-then-archive
 * lookup every other asset uses. The cues already played while no loader existed keep their
 * synthesized fallback; the next one asks for the install's clip.
 *
 * @param {((name: string) => Promise<Uint8Array|null>)|null} loader
 */
export function setSfxLoader(loader) {
  loadBytes = typeof loader === 'function' ? loader : null;
  clipCache.clear();
  state = { ...state, source: loadBytes ? 'arena' : 'synth' };
}

/**
 * Which clips a cue names, with the ground's own step when the scene says where it walks.
 *
 * @param {string} name
 * @param {{surface?: string, side?: string, female?: boolean}} [opts]
 * @returns {readonly string[]}
 */
export function clipsFor(name, opts = {}) {
  if (name === 'step' && opts.surface) {
    const side = opts.side === 'right' ? 'Right' : 'Left';
    const surface = String(opts.surface).toLowerCase();
    if (surface === 'mud') return CLIPS.stepMud;
    if (surface === 'snow') return CLIPS[`stepSnow${side}`];
    if (surface === 'water') return CLIPS.splash;
    return CLIPS[`stepDirt${side}`] ?? CLIPS.step;
  }
  if (name === 'monsterDeath' && opts.female) return ['FDIE.VOC', 'BODYFALL.VOC'];
  if (name === 'death' && opts.female) return ['FDIE.VOC', 'BODYFALL.VOC'];
  // **A creature's own voice** (`MONSTER_VOICES`): its cry for an attack or a wound, and the
  // cry plus the floor for a death.
  if (name === 'monsterVoice') {
    const voice = monsterVoice(opts.monster);
    if (!voice) return [];
    return opts.event === 'death' ? [voice, 'BODYFALL.VOC'] : [voice];
  }
  return CLIPS[name] ?? [];
}

/**
 * One clip as WebAudio buffers, decoded at the file's own rate.
 *
 * @param {string} name e.g. `SWISH.VOC`
 * @returns {Promise<{name: string, parts: AudioBuffer[]}|null>}
 */
async function clip(name) {
  const key = name.toUpperCase();
  if (clipCache.has(key)) return clipCache.get(key);
  const pending = (async () => {
    if (!loadBytes) return null;
    const audio = makeContext();
    if (!audio) return null;
    try {
      const bytes = await loadBytes(key);
      if (!bytes?.length) return null;
      const voc = decodeVoc(bytes);
      if (!voc?.segments?.length) return null;
      const parts = voc.segments.map((segment) => {
        const buffer = audio.createBuffer(1, Math.max(1, segment.samples.length), Math.round(segment.rate));
        buffer.copyToChannel(segment.samples, 0);
        return buffer;
      });
      return { name: key, parts };
    } catch { return null; }
  })();
  clipCache.set(key, pending);
  const resolved = await pending;
  clipCache.set(key, resolved);
  return resolved;
}

/**
 * Play one decoded clip through the fight's own gain, panned by the scene when it says where.
 *
 * @param {{parts: AudioBuffer[]}} decoded
 * @param {{volume?: number, pan?: number}} opts
 * @returns {boolean}
 */
function playDecoded(decoded, opts = {}) {
  const audio = makeContext();
  if (!audio) return false;
  const gainValue = Math.max(0.05, Math.min(1, Number(opts.volume) || 1));
  const pan = Math.max(-1, Math.min(1, Number(opts.pan) || 0));
  let at = audio.currentTime + 0.008;
  let panner = null;
  if (pan && audio.createStereoPanner) {
    panner = audio.createStereoPanner();
    panner.pan.value = pan;
  }
  for (const part of decoded.parts) {
    const source = audio.createBufferSource();
    source.buffer = part;
    const amp = audio.createGain();
    amp.gain.value = gainValue;
    if (panner) source.connect(amp).connect(panner);
    else source.connect(amp).connect(master);
    source.start(at);
    at += part.duration;
  }
  if (panner) panner.connect(master);
  return true;
}

function makeContext() {
  if (ctx) return ctx;
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9 * sfxVolume;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/**
 * **The gesture iOS wants.** A phone's audio context starts suspended and may only be
 * resumed inside a real touch or click, so the first one is spent here rather than on the
 * first footstep's later frame — a `playSfx` out of a gesture's own task is refused, and the
 * fight then plays silently until the player taps something that happens to swing.
 *
 * Safe everywhere: a desktop's context is already running, and one that never starts is
 * simply no audio, which is what `playSfx` already answers.
 *
 * @returns {Promise<boolean>} whether a context is running afterwards
 */
export async function unlockSfx() {
  const audio = makeContext();
  if (!audio) return false;
  try {
    if (audio.state === 'suspended') await audio.resume();
    return audio.state === 'running';
  } catch { return false; }
}

/** One second of white noise, made once per context. */
function noiseSource(audio) {
  if (!noiseBuffer) {
    const frames = Math.max(1, Math.round(audio.sampleRate * 0.8));
    noiseBuffer = audio.createBuffer(1, frames, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  return source;
}

/**
 * One tonal stroke — the fallback's own voice, used only for a cue the install has no clip for.
 *
 * @param {AudioContext} audio
 * @param {{type?: OscillatorType, from: number, to?: number, gain?: number, attack?: number,
 *   decay?: number, when?: number, pan?: number}} opts
 */
function tone(audio, opts) {
  const {
    type = 'sine', from, to = from, gain = 0.2,
    attack = 0.006, decay = 0.15, when = 0, pan = 0,
  } = opts;
  const at = audio.currentTime + 0.006 + when;
  const life = Math.max(0.02, attack + decay);
  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, from), at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + life);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + Math.max(0.002, attack));
  amp.gain.exponentialRampToValueAtTime(0.0001, at + life);
  let node = osc;
  if (pan) {
    const panner = audio.createStereoPanner?.();
    if (panner) { panner.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(panner); node = panner; }
  }
  node.connect(amp).connect(master);
  osc.start(at);
  osc.stop(at + life + 0.02);
}

/**
 * One filtered-noise stroke — the fallback's other voice.
 *
 * @param {AudioContext} audio
 * @param {{from?: number, to?: number, gain?: number, attack?: number, decay?: number,
 *   when?: number, q?: number, type?: BiquadFilterType, pan?: number}} opts
 */
function noise(audio, opts) {
  const {
    from = 1800, to = 400, gain = 0.18, attack = 0.004, decay = 0.14,
    when = 0, q = 0.9, type = 'bandpass', pan = 0,
  } = opts;
  const at = audio.currentTime + 0.006 + when;
  const life = Math.max(0.02, attack + decay);
  const source = noiseSource(audio);
  const filter = audio.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(Math.max(20, from), at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + life);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + Math.max(0.002, attack));
  amp.gain.exponentialRampToValueAtTime(0.0001, at + life);
  let node = filter;
  if (pan) {
    const panner = audio.createStereoPanner?.();
    if (panner) { panner.pan.value = Math.max(-1, Math.min(1, pan)); filter.connect(panner); node = panner; }
  }
  source.connect(filter);
  node.connect(amp).connect(master);
  source.start(at);
  source.stop(at + life + 0.02);
}

/** The register a spell's element speaks in — only for a spell the install has no clip for. */
function elementVoicing(element) {
  switch (String(element ?? 'magic').toLowerCase()) {
    case 'fire': return { type: 'sawtooth', from: 180, to: 760, noise: [1600, 600] };
    case 'cold': return { type: 'sine', from: 1400, to: 2100, noise: [2600, 1200] };
    case 'shock': return { type: 'square', from: 90, to: 1500, noise: [3200, 900] };
    case 'poison': return { type: 'triangle', from: 260, to: 120, noise: [700, 250] };
    case 'disease': return { type: 'triangle', from: 220, to: 110, noise: [600, 220] };
    case 'heal': return { type: 'sine', from: 440, to: 680, noise: [1400, 900] };
    default: return { type: 'triangle', from: 240, to: 980, noise: [2000, 800] };
  }
}

/**
 * The cues the install's own archive has no clip for.
 *
 * @param {AudioContext} audio
 * @param {string} name
 * @param {{element?: string, pan?: number, volume?: number}} opts
 * @returns {boolean} whether the synth spoke
 */
function playSynth(audio, name, opts) {
  const gain = (value) => value * Math.max(0.1, Math.min(1, Number(opts.volume) || 1));
  const pan = Number(opts.pan) || 0;
  switch (String(name)) {
    case 'rest':
      tone(audio, { type: 'sine', from: 392, gain: gain(0.07), decay: 0.5, pan });
      tone(audio, { type: 'sine', from: 523, gain: gain(0.06), decay: 0.65, pan, when: 0.18 });
      return true;
    case 'error':
      tone(audio, { type: 'square', from: 180, to: 140, gain: gain(0.06), decay: 0.16, pan });
      return true;
    case 'cast': {
      const voice = elementVoicing(opts.element);
      tone(audio, { type: voice.type, from: voice.from, to: voice.to, gain: gain(0.13), attack: 0.01, decay: 0.3, pan });
      return true;
    }
    default:
      return false;
  }
}

/**
 * Play one cue.
 *
 * The names are the game's events rather than its files: `swing`, `hitFlesh`, `hitArmour`,
 * `parry`, `block`, `dodge`, `bow`, `arrowHit`, `cast`, `spellHit`, `playerHurt`, `death`,
 * `monsterDeath`, `pickup`, `coin`, `equip`, `potion`, `chest`, `door`, `doorShut`, `rest`,
 * `levelUp`, `ui`, `error`, `step`, `jump`, `land`, `swim`.
 *
 * @param {string} name
 * @param {{heavy?: boolean, element?: string, power?: number, volume?: number, pan?: number,
 *   surface?: string, side?: string, female?: boolean}} [opts]
 * @returns {boolean} whether a context accepted it
 */
export function playSfx(name, opts = {}) {
  const audio = makeContext();
  if (!audio) return false;
  try {
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const files = clipsFor(name, opts);
    const first = files[0] ? clip(files[0]) : null;
    if (first) {
      // **A cached clip answers this very cue; a cold one starts decoding and this cue keeps
      // the synth for a beat.** A fight's first swing is not silent, and the second is the
      // install's own bytes. `state.source` says which path spoke.
      const cached = clipCache.get(files[0].toUpperCase());
      if (cached && !(cached instanceof Promise)) {
        let played = false;
        for (const file of files) {
          const decoded = clipCache.get(file.toUpperCase());
          if (!decoded || decoded instanceof Promise) continue;
          const ok = playDecoded(decoded, opts);
          played ||= ok;
        }
        if (played) {
          state = { ...state, fires: state.fires + 1, last: String(name), clip: files.join('+'),
            blocked: audio.state === 'suspended', source: 'arena' };
          return true;
        }
      }
    }
    const spoke = playSynth(audio, name, opts);
    state = {
      ...state,
      fires: state.fires + 1,
      last: String(name),
      clip: spoke ? null : (files[0] ?? null),
      blocked: audio.state === 'suspended',
      source: spoke ? 'synth' : 'missing',
    };
    return spoke;
  } catch {
    return false;
  }
}

/**
 * Decode every clip this module can name, through the loader.
 *
 * The scene calls it once after `setSfxLoader`: a level's first battle should not spend its
 * first two blows on the synth because a file had not been read yet. A clip the install lacks
 * resolves to `null` and stays there; nothing throws.
 *
 * @returns {Promise<number>} how many clips decoded
 */
export async function warmSfxClips() {
  if (!loadBytes) return 0;
  const names = new Set();
  for (const files of Object.values(CLIPS)) for (const file of files) names.add(file);
  const decoded = await Promise.all([...names].map((name) => clip(name)));
  return decoded.filter(Boolean).length;
}
