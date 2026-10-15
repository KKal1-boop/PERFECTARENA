import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDfa } from '../../src/arena/dfa.js';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

test('DFA frame updates patch the original base, never accumulate previous updates', () => {
  const bytes = new Uint8Array([3,0,0,0,0,0,2,0,2,0,5,0, 3,1,2,3,4,
    9,0,1,0, 0,0,1,0,9, 9,0,1,0, 3,0,1,0,8]);
  const dfa = parseDfa(bytes);
  assert.deepEqual([...dfa.frames[0].indices], [1,2,3,4]);
  assert.deepEqual([...dfa.frames[1].indices], [9,2,3,4]);
  assert.deepEqual([...dfa.frames[2].indices], [1,2,3,8]);
  assert.throws(() => parseDfa(bytes.subarray(0, 14)), /truncated/);
  const bad = bytes.slice(); bad[23] = 99;
  assert.throws(() => parseDfa(bad), /patch outside/);
  assert.throws(() => parseDfa(new Uint8Array(12)), /implausible/);
});

test('every real Arena DFA decodes full, distinct stationary animation frames', async () => {
  const data = new ArenaData(nodeSource(process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA'));
  const names = (await data.bsa()).names().filter(name => name.endsWith('.DFA'));
  assert.ok(names.length > 5);
  for (const name of names) {
    const dfa = parseDfa(await data.bytes(name), name);
    assert.equal(dfa.frames.length, dfa.frameCount, name);
    assert.ok(dfa.frames.length > 1, name);
    assert.ok(dfa.frames.every(frame => frame.indices.length === dfa.width * dfa.height), name);
    assert.ok(dfa.frames.some(frame => !frame.indices.every((value, i) => value === dfa.frames[0].indices[i])), `${name} animates`);
  }
});
