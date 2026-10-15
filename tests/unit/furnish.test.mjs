// The furniture — placement rules, not the pictures. The art's own names and the room's
// own shape give the rules their meaning; a test can hold the room as a grid and judge
// what the furnisher put where without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';

import { FURNITURE, DENSITY, DOOR_CLEARANCE, ROOM_CAP, familyOf, furnishRoom, hugsWall } from '../../src/game/furnish.js';

/** A walled 10×10 room: every cell open, the border and a pillar solid. */
function room({ width = 10, depth = 10, doors = [], occupied = [] } = {}) {
  const open = [];
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) open.push({ row, col });
  }
  const doorset = new Set(doors.map((d) => `${d.row},${d.col}`));
  const walls = (row, col) => row < 0 || col < 0 || row >= depth || col >= width
    || (row === 5 && col === 5);
  return { open: open.filter((c) => !doorset.has(`${c.row},${c.col}`) && !occupied.some((o) => o.row === c.row && o.col === c.col)), doors, occupied, solidAt: walls };
}

test('families are named by the .INF prefix, and every kit is complete', () => {
  assert.equal(familyOf('TAVERN1.INF'), 'TAVERN');
  assert.equal(familyOf('WCRYPT3.INF'), 'WCRYPT');
  assert.equal(familyOf('TCN.INF'), null, 'a wilderness sky is not a room');
  for (const kit of Object.values(FURNITURE)) {
    for (const name of kit.wall) assert.match(name, /\.IMG$/, `${name} is an art record`);
    assert.ok(kit.wall.includes(kit.torch), 'every kit hangs its own torch');
  }
});

test('a tavern is dressed: tables, chairs, and it is topped well below clutter', () => {
  const r = room();
  const room1 = furnishRoom({ infName: 'TAVERN1.INF', open: r.open, solidAt: r.solidAt, doors: r.doors, seed: 12345 });
  assert.equal(room1.family, 'TAVERN');
  assert.ok(room1.props.length >= 6, `dressed, not bare: ${room1.props.length} props`);
  assert.ok(room1.props.length < r.open.length / 3, `${room1.props.length} props ${r.open.length} walkable cells — a room, not a warehouse`);
  const names = new Set(room1.props.map((p) => p.name));
  assert.ok(names.has('TABLE1.IMG') || names.has('CHAIR3.IMG'), `a tavern holds its seats: [${[...names].join(', ')}]`);
});

test('nothing stands in or beside a door', () => {
  const doors = [{ row: 3, col: 0 }];
  const r = room({ doors });
  const f = furnishRoom({ infName: 'EQUIP1.INF', open: r.open, doors, solidAt: r.solidAt, seed: 7 });
  const clearRadius = DOOR_CLEARANCE + 1;  // the door cell and every cell beside it
  for (const prop of f.props) {
    for (const door of doors) {
      const dRow = Math.abs(prop.row - door.row), dCol = Math.abs(prop.col - door.col);
      assert.ok(dRow > DOOR_CLEARANCE || dCol > DOOR_CLEARANCE,
        `${prop.name} at ${prop.row},${prop.col} stands within ${clearRadius} of the door ${door.row},${door.col}`);
    }
  }
});

test('beds and shelves hug walls, while chairs sit at tables anywhere', () => {
  const r = room();
  const f = furnishRoom({ infName: 'NOBLE1.INF', open: r.open, solidAt: r.solidAt, seed: 99 });
  // Only the *wall-side* kit is bound to the wall — a bed against open air is a display
  //, not furniture — while the floor kit (chairs, tables) stands by the seats it serves.
  const wallArt = new Set(FURNITURE.NOBLE.wall);
  for (const prop of f.props) {
    if (!wallArt.has(prop.name)) continue;
    assert.ok(hugsWall(prop.row, prop.col, r.solidAt), `${prop.name} ${prop.row},${prop.col} hates open air`);
  }
});

test('torches are lit: the same art the lighting pass already names', () => {
  const r = room();
  const f = furnishRoom({ infName: 'WCRYPT2.INF', open: r.open, solidAt: r.solidAt, seed: 555 });
  assert.ok(f.torches > 0, 'a crypt is lit by kit torches');
  const torches = f.props.filter((p) => p.name === 'TORCH3.IMG');
  assert.equal(torches.length, f.torches);
});

test('the same seed dresses the same room, and a different seed does not simply repeat it', () => {
  const r = room();
  const art = (seed) => furnishRoom({ infName: 'TAVERN1.INF', open: [...r.open], solidAt: r.solidAt, seed })
    .props.map((p) => `${p.name}@${p.row},${p.col}`).join('|');
  assert.equal(art(4242), art(4242), 'deterministic in the place');
  assert.notEqual(art(4242), art(4243), 'a different seed, a different room');
});

test('the cap holds even in a hall, and an occupied cell is never doubled up', () => {
  const r = room({ width: 40, depth: 40 });
  const f = furnishRoom({ infName: 'TAVERN1.INF', open: r.open, solidAt: r.solidAt, doors: r.doors, seed: 3 });
  assert.ok(f.props.length <= ROOM_CAP);
  const spots = new Set(f.props.map((p) => `${p.row},${p.col}`));
  assert.equal(spots.size, f.props.length, 'no two props share a cell');
});

test('a room the level already decorated is dressed around it, not through it', () => {
  const occupied = [{ row: 2, col: 2 }, { row: 4, col: 1 }, { row: 5, col: 3 }];
  const all = [];
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) all.push({ row, col });
  const open = all.filter((c) => !occupied.some((o) => o.row === c.row && o.col === c.col));
  const f = furnishRoom({ infName: 'MAGE2.INF', open, occupied, solidAt: (rr, cc) => rr < 0 || cc < 0 || rr > 9 || cc > 9, seed: 17 });
  for (const [key] of [`${occupied}`]) { /* read below */ }
  for (const o of occupied) {
    assert.ok(!f.props.some((p) => p.row === o.row && p.col === o.col), 'no prop replaces the level art');
  }
  assert.ok(f.props.length > 0);
});
