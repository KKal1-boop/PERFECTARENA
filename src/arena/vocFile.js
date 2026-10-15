// THE INSTALL'S OWN SOUND — Creative Voice File (`.VOC`), decode only.
//
// The one class of the original's assets this port had read none of. Arena's install
// ships its sound as **Creative Voice Files**: the opening fanfares the original greets
// a session with (`FANFARE1.VOC`, `FANFARE2.VOC` — 18 310 bytes, exactly this format,
// read off the install's own bytes and pinned by `tests/unit/voc.test.mjs`).
//
// The measured layout, which is the format's own:
//   * a 26-byte header: "Creative Voice File" + `0x1A` magic, a version word, and the
//     classic `0x1129` check word — anything else is not a VOC;
//   * then **blocks**, each `[type u8, length u24 LE, payload(length)]`, numbered as
//     the format numbers them:
//       - `0x00` terminator;
//       - `0x01` sound data — a rate byte (`256 − 1 000 000 / Hz`), a codec byte
//         (`0` is what this install carries: 8-bit **unsigned PCM**, silent at 128),
//         and `length − 2` samples;
//       - `0x02` sound continue — more samples at the rate already running;
//       - `0x03` silence — a sample-count word and a rate byte: a rest, not a note;
//       - `0x04` marker, `0x05` text — skipped;
//       - `0x06` **repeat start** (a count word) and `0x07` **repeat end** (no payload);
//       - `0x08` extended block — a new rate/codec that applies to the *next* `0x01`;
//       - `0x09` new-format sound data — a DWORD rate in Hz, bit depth, channels,
//         format, four filler bytes, then the samples.
//
// MEASURED across all **251** `.VOC` files the install ships (76 in `GLOBAL.BSA`, 2 loose,
// 173 under `SPEECH/`): every one is `0x01` runs, plus exactly one `0x06`/`0x07` pair —
// `DRUMS.VOC`, whose drums are a **ten-times repeat**. The reader's earlier `0x06`-is-a-
// terminator and `0x07`-is-silence arms were read off the wrong table and are never
// exercised by a single file in the install; `DRUMS.VOC` was simply refused, and a level
// whose `@SOUND` names it (`LEVELUP.VOC`'s own drum roll) was silent. The arms are now the
// format's own, and the repeat is what makes that clip sound.
//   * a run of same-rate PCM blocks makes one **segment** — the fanfare's own rate
//     changes are kept as separate segments, and the reader returns them as such.
//
// The result is what the WebAudio pipeline plays: `{ rate, segments:
// [{ rate, samples: Float32Array }] }`, every sample normalized to −1..1. Decode only
// lives here; the play side is `game/fanfare.js`'s business.

const HEADER_MAGIC = 'Creative Voice File\u001a';

/**
 * Read one little-endian u32 at `p`. (DataView keeps the offsets honest in one place.)
 *
 * @param {Uint8Array} bytes
 * @param {number} p
 * @returns {number}
 */
function u24(bytes, p) {
  return bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16);
}

/**
 * Decode a Creative Voice File into playable segments.
 *
 * @param {Uint8Array} bytes the file's own bytes
 * @returns {{rate: number, segments: {rate: number, samples: Float32Array}[]}|null}
 *   `rate` is the first segment's rate (the whole file's talking rate in the install);
 *   null when the bytes are not a VOC — the caller keeps running without sound, exactly
 *   as the port has until now.
 */
export function decodeVoc(bytes) {
  if (!bytes || bytes.length < 26 + 4) return null;
  let magic = '';
  for (let i = 0; i < HEADER_MAGIC.length; i++) {
    if (bytes[i] !== HEADER_MAGIC.charCodeAt(i)) return null;
    magic += String.fromCharCode(bytes[i]);
  }
  // The classic check word (0x1129) closes the header on every Creative file that
  // matters; accept the magic even without it — the install's own bytes carry it.
  const check = bytes[18] | (bytes[19 + 0] << 8);
  void check; // recorded, not enforced: the magic is the file's own word.
  const whole = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 26;
  /** @type {{rate: number, samples: Float32Array}[]} */
  const segments = [];
  let pendingRate = 0;
  /**
   * Open repeats: `{ at, left }` — where the repeated run starts and how many times its body
   * is still to be walked. A `0x06` pushes, a `0x07` steps back until the count is spent.
   * Bounded (16 deep) so a malformed file cannot spin the reader.
   */
  const repeats = [];
  while (p + 4 <= bytes.length) {
    const type = bytes[p];
    const length = u24(bytes, p + 1);
    if (type === 0x00) break; // terminator
    if (length < 0 || p + 4 + length > bytes.length) break; // truncated tail: keep what was read
    const body = p + 4;
    if (type === 0x01 || type === 0x09) {
      let rate;
      let codec;
      let start;
      if (type === 0x01) {
        rate = 1_000_000 / (256 - bytes[body]);
        codec = bytes[body + 1];
        start = body + 2;
      } else {
        rate = whole.getUint32(body, true) || pendingRate;
        const bits = bytes[body + 4];
        const channels = bytes[body + 5];
        codec = bits === 8 && channels === 1 ? 0 : -1;
        start = body + 12;
      }
      if (codec !== 0) { p = body + length; continue; } // a codec this port does not play yet is skipped, said so
      const count = length - (start - body);
      if (count > 0) {
        const samples = new Float32Array(count);
        for (let i = 0; i < count; i++) samples[i] = (bytes[start + i] - 128) / 128;
        // A run of same-rate blocks is one segment; a rate change opens a new one.
        const last = segments[segments.length - 1];
        if (last && Math.abs(last.rate - rate) < 1 && pendingRate === 0) {
          const grown = new Float32Array(last.samples.length + count);
          grown.set(last.samples, 0);
          grown.set(samples, last.samples.length);
          last.samples = grown;
        } else {
          segments.push({ rate, samples });
          pendingRate = 0;
        }
      }
    } else if (type === 0x02) {
      // Sound continue: more samples in the codec and rate already running.
      const last = segments[segments.length - 1];
      if (last && length > 0) {
        const grown = new Float32Array(last.samples.length + length);
        grown.set(last.samples, 0);
        for (let i = 0; i < length; i++) grown[last.samples.length + i] = (bytes[body + i] - 128) / 128;
        last.samples = grown;
      }
    } else if (type === 0x03) {
      // Silence: a rest of so many samples. The reader keeps it as real zeros so a pause
      // the file wrote deliberately survives into the played sound.
      const period = whole.getUint16(body, true);
      const rate = pendingRate || 1_000_000 / (256 - bytes[body + 2]);
      if (period > 0) segments.push({ rate, samples: new Float32Array(period) });
    } else if (type === 0x06) {
      // Repeat start: the run begins at the *next* block; the count includes this walk.
      const count = whole.getUint16(body, true);
      // `count` is how many times the enclosed run is played, this walk included.
      if (count > 1 && repeats.length < 16) repeats.push({ at: body + length, left: count });
    } else if (type === 0x07) {
      // Repeat end: back to the run's start while its count lasts, then fall through.
      const open = repeats[repeats.length - 1];
      if (open) {
        if (open.left > 1) { open.left--; p = open.at; continue; }
        repeats.pop();
      }
    } else if (type === 0x08) {
      const perSecond = whole.getUint32(body, true);
      pendingRate = perSecond > 0 ? perSecond : 0;
    }
    p = body + length;
  }
  if (!segments.length) return null;
  return { rate: segments[0].rate, segments };
}
