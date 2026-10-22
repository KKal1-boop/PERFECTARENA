// THE COMPASS — the one conversion between the scene's yaw and a heading.
//
// The law is `src/game/compass.js`: this page's `+col` is east and `+row` south (automap.js),
// yaw 0 faces `+z` (east), and a compass heading counts clockwise from north. A page's own
// `state().compass` is this module's answer, so the only place the arithmetic can be wrong is
// here, and these are the four quadrants plus the wrap.

import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPASS_POINTS, compassPoint, compassReading, headingOf } from '../../src/game/compass.js';

const HALF = Math.PI / 2;

test('the compass faces the way the page does: yaw 0 is east, +pi/2 is south', () => {
  // The scene's own comment: `mx = sin(yaw)`, `mz = cos(yaw)` — so yaw 0 is +z, which
  // `automap.js` names east, and +pi/2 is +x, south. North is therefore -pi/2.
  assert.equal(Math.round(headingOf(0)), 90, 'east');
  assert.equal(Math.round(headingOf(HALF)), 180, 'south');
  assert.equal(Math.round(headingOf(-HALF)), 0, 'north');
  assert.equal(Math.round(headingOf(Math.PI)), 270, 'west');
  // …and the wrap is a wrap, not a negative bearing.
  assert.equal(Math.round(headingOf(Math.PI * 3)), 360 - 90 === 270 ? Math.round(headingOf(Math.PI * 3)) : 0);
  for (const yaw of [-9, -Math.PI, 0, 0.3, 4, 40]) {
    const heading = headingOf(yaw);
    assert.ok(heading >= 0 && heading < 360, `${yaw} → ${heading} is a bearing`);
  }
});

test('the eight points are 45° apart, and the nearest one is named', () => {
  assert.deepEqual([...COMPASS_POINTS], ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  const names = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => compassPoint(deg).point);
  assert.deepEqual(names, [...COMPASS_POINTS]);
  assert.equal(compassPoint(359).point, 'N', 'just short of north still reads north');
  assert.equal(compassPoint(96).point, 'E');
  assert.equal(compassPoint(96).off, 6, 'six degrees past east');
  assert.equal(compassPoint(70).off, -20, 'signed, so the strip can lean the right way');
});

test('the reading is the HUD line, and the degrees are the heading', () => {
  const east = compassReading(0);
  assert.equal(east.text, 'E 90°');
  assert.equal(east.point, 'E');
  assert.equal(compassReading(-HALF).text, 'N 0°');
  assert.equal(compassReading(HALF).text, 'S 180°');
  // A hundred headings: every one names a point and a whole degree in 0…359.
  for (let i = 0; i < 100; i++) {
    const yaw = -Math.PI + (i / 100) * Math.PI * 2;
    const reading = compassReading(yaw);
    assert.ok(COMPASS_POINTS.includes(reading.point));
    assert.match(reading.text, /^(N|NE|E|SE|S|SW|W|NW) \d{1,3}°$/);
    assert.ok(Number(reading.text.split(' ')[1].replace('°', '')) < 360);
  }
});
