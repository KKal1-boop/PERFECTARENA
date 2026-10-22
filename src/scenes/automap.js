// DRAWING THE AUTOMAP — the parchment, the cells and the player's 3×3 arrow.
//
// The law is `game/automap.js` (what every cell *is*); this file is the one thing that needs a
// canvas. It keeps OpenTESArena's presentation rules that survive a browser panel:
//
//   * **one cell is a square of `PixelSize`-sized pixels**, with the scale kept a multiple of
//     three so the 3×3 player arrow lands on whole pixels (`AutomapUiView::PixelSize = 3`);
//   * **ground is the parchment showing through** — a floor cell paints nothing, exactly as
//     `ColorFloor(0,0,0,0)` leaves the automap sheet visible;
//   * **the arrow is one of eight 3×3 patterns**, drawn in the reference's own yellow.
//
// What differs is the viewport: OpenTESArena scrolls a 3-chunk window with a quill cursor, and
// this panel fits the **whole level** into the canvas, because the panel has the room and a
// player who is lost wants the whole floor at once. The scale is chosen from the level's own
// size, so a shop's two rooms and a 128-cell dungeon both fill the frame.

import { AUTOMAP_COLORS, automapArrow } from '../game/automap.js';

/** The parchment the reference's transparent ground shows through. */
export const AUTOMAP_PARCHMENT = '#c9b78f';
/** The matte around the sheet (a page, not the map). */
export const AUTOMAP_MATTE = '#0c0a07';
/** The sheet's own border ink. */
export const AUTOMAP_BORDER = '#6d5a2e';

/** The smallest cell, in pixels — `PixelSize = 3`, so the arrow is exactly one cell. */
export const AUTOMAP_MIN_CELL = 3;
/**
 * The margin between the sheet and the canvas edge, in pixels — **10**, so a 50-cell dungeon
 * (`START.MIF`) reaches the nine-pixel cell that still fits the 480-pixel canvas and an 128-cell
 * city-sized level still lays out at three. The reference gives its sheet a drawn frame; this
 * panel's frame is the page's own border, so the sheet can use the room.
 */
export const AUTOMAP_PADDING = 10;

/**
 * The cell size and the sheet's rectangle for a level in a canvas.
 *
 * @param {{width:number, depth:number}} map
 * @param {number} width  canvas backing-store width
 * @param {number} height canvas backing-store height
 * @returns {{scale:number, box:{x:number, y:number, width:number, height:number}}}
 */
export function automapLayout(map, width, height) {
  const cols = Math.max(1, Math.trunc(map?.width ?? 1));
  const rows = Math.max(1, Math.trunc(map?.depth ?? 1));
  const fit = Math.min((width - AUTOMAP_PADDING * 2) / cols, (height - AUTOMAP_PADDING * 2) / rows);
  // The padding is the only margin; the sheet is centred on the canvas either way.
  // A multiple of three, so `scale / 3` is a whole number of pixels per arrow sub-cell. A level
  // too large for even three pixels a cell still gets three and is cropped by the canvas; no
  // Arena level is (the widest is 128 cells, 384 px at this scale).
  const scale = Math.max(AUTOMAP_MIN_CELL, Math.floor(Math.max(0, fit) / 3) * 3);
  const sheetWidth = cols * scale;
  const sheetHeight = rows * scale;
  return {
    scale,
    box: {
      x: Math.round((width - sheetWidth) / 2),
      y: Math.round((height - sheetHeight) / 2),
      width: sheetWidth,
      height: sheetHeight,
    },
  };
}

/**
 * Draw one level's automap and return what a test (or the debug seam) can hold.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{map: object, marker: object|null, name?: string, level?: number, levels?: number}} options
 * @returns {{painted:number, scale:number, box:object, cells:number, arrowPixels:number|null,
 *   width:number, height:number}}
 */
export function drawAutomap(canvas, options) {
  const { map, marker } = options ?? {};
  const width = Math.max(0, Math.trunc(canvas?.width ?? 0));
  const height = Math.max(0, Math.trunc(canvas?.height ?? 0));
  const report = { painted: 0, scale: 0, box: { x: 0, y: 0, width: 0, height: 0 }, cells: 0, arrowPixels: null, width, height };
  if (!canvas || !map || !width || !height) return report;
  const ctx = canvas.getContext('2d');
  if (!ctx) return report;

  const { scale, box } = automapLayout(map, width, height);
  report.scale = scale;
  report.box = box;
  ctx.imageSmoothingEnabled = false;

  // The page, then the sheet. A floor cell does not paint, so this fill **is** the floor colour.
  ctx.fillStyle = AUTOMAP_MATTE;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = AUTOMAP_PARCHMENT;
  ctx.fillRect(box.x, box.y, box.width, box.height);

  // Every marked cell, in the reference's colours. `floor` and `void` are the sheet itself.
  let painted = 0;
  for (let row = 0; row < map.depth; row++) {
    for (let col = 0; col < map.width; col++) {
      const kind = map.kinds[row * map.width + col];
      const color = AUTOMAP_COLORS[kind];
      if (!color || kind === 'floor') continue;
      ctx.fillStyle = color;
      ctx.fillRect(box.x + col * scale, box.y + row * scale, scale, scale);
      painted++;
    }
  }
  report.painted = painted;
  report.cells = map.width * map.depth;

  // The player's arrow — the reference's 3×3 pattern, whole pixels inside the one cell.
  if (marker && marker.row >= 0 && marker.col >= 0 && marker.row < map.depth && marker.col < map.width) {
    const pattern = automapArrow(marker.direction);
    const sub = scale / 3;
    // **The cell the arrow stands in gets an ink edge — drawn first, so the arrow sits on it.**
    // The reference's arrow is the size of one voxel, which on a 128-cell sheet is a handful of
    // pixels — correct, and hard to find at a glance on a 720-pixel canvas. A one-pixel dark edge
    // around the player's own cell is this project's presentation (the header stamps it): the
    // arrow, its colour and its 3×3 pattern are still the reference's, and the eye finds it in one
    // look. Painting the edge *after* the arrow would clip the outer sub-pixels of the pattern
    // (measured: 18 yellow pixels where the pattern is 27 at scale 9), so the order is the law.
    ctx.strokeStyle = '#1a1206';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      box.x + marker.col * scale + 0.5,
      box.y + marker.row * scale + 0.5,
      scale - 1, scale - 1,
    );
    ctx.fillStyle = AUTOMAP_COLORS.player;
    for (const [ax, ay] of pattern) {
      ctx.fillRect(
        box.x + marker.col * scale + ax * sub,
        box.y + marker.row * scale + ay * sub,
        sub, sub,
      );
    }
    report.arrowPixels = pattern.length;
  }

  // The sheet's edge, drawn last so it is not covered by a border cell.
  ctx.strokeStyle = AUTOMAP_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);
  return report;
}
