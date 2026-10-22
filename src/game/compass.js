// THE COMPASS — WHERE THE PLAYER IS FACING, IN TAMRIEL'S OWN POINTS.
//
// The owner, 2026-10-17: *"i have o compass to orient me in the wild"*. Arena's screen has a
// compass strip; this port had none at all — the only bearing in the game was the automap's
// arrow and the world map's own mark, and both of those need a keypress before they answer.
//
// ## The axes are the level's, and they are already written down
//
// `game/automap.js` states the page's own convention: **`+col` is east and `+row` is south**
// (`x` is the row and `z` the column, as every placement and the motor's own step agree), and
// `scenes/interior.js`'s movement comment gives the camera the same pair — the motor moves by
// `mx = sin(yaw)`, `mz = cos(yaw)`, so **yaw 0 faces `+z` (east)**, `+π/2` faces `+x` (south),
// `π` faces west and `−π/2` north. A compass heading is the other convention — **north is 0°,
// east 90°, south 180°, west 270°** — so the whole conversion is one addition:
//
//     heading = (90 + yaw·180/π) mod 360
//
// This is a *reading of this project's own axes*, not a claim about Arena's executable: the
// install names no bearing anywhere, so the law is stamped as the scene's, and `headingOf` is
// the only place it lives (the HUD and the debug seam both ask it).

/** The eight points, clockwise from north. */
export const COMPASS_POINTS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

/** One turn, in degrees. */
const TURN = 360;

/**
 * The heading a camera yaw faces, in degrees clockwise from north (0 … <360).
 *
 * @param {number} yaw  radians, the scene's own `cam.yaw` (0 faces east — see the header)
 * @returns {number} 0 ≤ heading < 360
 */
export function headingOf(yaw) {
  const degrees = 90 + (Number.isFinite(yaw) ? yaw : 0) * (180 / Math.PI);
  return ((degrees % TURN) + TURN) % TURN;
}

/**
 * The nearest of the eight points, and how far the heading is from it.
 *
 * @param {number} heading  degrees, 0 … <360
 * @returns {{point: string, index: number, off: number}} `off` is signed degrees, −22.5 … 22.5
 */
export function compassPoint(heading) {
  const at = ((Number(heading) % TURN) + TURN) % TURN;
  const index = Math.round(at / 45) % 8;
  let off = at - index * 45;
  if (off > 180) off -= TURN;
  if (off < -180) off += TURN;
  return { point: COMPASS_POINTS[index], index, off };
}

/**
 * The compass as one line of text — the form the HUD writes and a test can read.
 *
 * `E 96°` is a face, not a sentence: the point the player is facing and the bearing to the
 * degree, rounded the way a hand compass is read.
 *
 * @param {number} yaw  radians
 * @returns {{heading: number, point: string, off: number, text: string}}
 */
export function compassReading(yaw) {
  const heading = headingOf(yaw);
  const { point, index, off } = compassPoint(heading);
  return { heading, point, index, off, text: `${point} ${Math.round(heading) % TURN}°` };
}
