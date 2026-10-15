// Arena stationary animation. Format: OpenTESArena Assets/DFAFile.cpp (MIT).
// https://github.com/afritz1/OpenTESArena/blob/main/OpenTESArena/src/Assets/DFAFile.cpp
// Each update patches frame ZERO, never the preceding frame. No game data is bundled.
export function parseDfa(bytes, filename = '') {
  const fail = (reason) => { throw new Error(`.DFA ${filename}: ${reason}`); };
  if (!bytes || bytes.length < 12) fail('truncated header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset) => view.getUint16(offset, true);
  const frameCount = u16(0), width = u16(6), height = u16(8), compressedLength = u16(10);
  const pixels = width * height;
  if (!frameCount || frameCount > 256 || !pixels || pixels > 1048576 || pixels * frameCount > 16777216)
    fail('implausible frame dimensions/count');
  const end = 12 + compressedLength;
  if (end > bytes.length) fail('truncated first frame');
  const base = new Uint8Array(pixels);
  let cursor = 12, out = 0;
  while (out < pixels) {
    if (cursor >= end) fail('incomplete first frame RLE');
    const code = bytes[cursor++], count = code < 128 ? code + 1 : code - 127;
    if (out + count > pixels) fail('RLE exceeds image');
    if (code >= 128) {
      if (cursor >= end) fail('truncated RLE run');
      base.fill(bytes[cursor++], out, out + count);
    } else {
      if (cursor + count > end) fail('truncated RLE literals');
      base.set(bytes.subarray(cursor, cursor + count), out); cursor += count;
    }
    out += count;
  }
  cursor = end;
  const frames = [{ index: 0, width, height, indices: base }];
  for (let index = 1; index < frameCount; index++) {
    if (cursor + 4 > bytes.length) fail(`truncated frame ${index}`);
    // chunkSize is informational in the reference; chunkCount controls the cursor.
    const chunks = u16(cursor + 2); cursor += 4;
    const indices = base.slice();
    for (let chunk = 0; chunk < chunks; chunk++) {
      if (cursor + 4 > bytes.length) fail('truncated patch header');
      const offset = u16(cursor), count = u16(cursor + 2); cursor += 4;
      if (offset + count > pixels || cursor + count > bytes.length) fail('patch outside frame/file');
      indices.set(bytes.subarray(cursor, cursor + count), offset); cursor += count;
    }
    frames.push({ index, width, height, indices });
  }
  return { width, height, frameCount, frames };
}
