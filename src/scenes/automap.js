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
// size, so a shop's two rooms and a 128-cell dungeon both fill the frame. It always **opens**
// that way; the **magnifier** (`zoom`, `panX`/`panY`) is the phone's, for reading the corridors a
// fit made small — the owner, 2026-10-22: *"the local dungeon map on android is too big and you
// cant zoom in or out"*.

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
 * How far the sheet may be magnified above the fit — a phone reading a 128-cell level.
 *
 * The level always opens whole (zoom 1), because a player who is lost wants the floor at once;
 * a magnifier is for reading the corridors that fit made small. Four times is where a street
 * plan's rooms separate on a 640-pixel phone.
 */
export const AUTOMAP_MAX_ZOOM = 4;

/** A zoom made safe: 1…AUTOMAP_MAX_ZOOM, or 1 for a number that is not one. */
export function clampAutomapZoom(zoom) {
  const n = Number(zoom);
  return Number.isFinite(n) ? Math.min(AUTOMAP_MAX_ZOOM, Math.max(1, n)) : 1;
}

/**
 * The cell size and the sheet's rectangle for a level in a canvas.
 *
 * `view` is the magnifier: `zoom` scales the fit, `panX`/`panY` slide a sheet that is now bigger
 * than the canvas (in backing-store pixels, clamped so no empty page is ever dragged into the
 * middle of the map). With no view the answer is the whole level, centred — the panel's opening
 * state and what every caller before the phone needed.
 *
 * @param {{width:number, depth:number}} map
 * @param {number} width  canvas backing-store width
 * @param {number} height canvas backing-store height
 * @param {{zoom?: number, panX?: number, panY?: number}} [view]
 * @returns {{scale:number, zoom:number, box:{x:number, y:number, width:number, height:number},
 *   limits:{x:number, y:number}}}
 */
export function automapLayout(map, width, height, view = {}) {
  // **The level's own canvas, not the file's grid** (`game/mifLevel.js`'s `levelCanvas`): a
  // storey that fills less of its `.MIF` grid than the header declares — the Fortress of Ice's
  // second floor is a 64×58 maze in an 80×96 grid — is laid out at its own size, so the sheet is
  // the level rather than the level plus the margin around it.
  const canvas = map && typeof map === 'object' ? map.canvas ?? null : null;
  const cols = Math.max(1, Math.trunc(canvas ? canvas.col1 - canvas.col0 + 1 : map?.width ?? 1));
  const rows = Math.max(1, Math.trunc(canvas ? canvas.row1 - canvas.row0 + 1 : map?.depth ?? 1));
  const fit = Math.min((width - AUTOMAP_PADDING * 2) / cols, (height - AUTOMAP_PADDING * 2) / rows);
  const zoom = clampAutomapZoom(view?.zoom);
  // A multiple of three, so `scale / 3` is a whole number of pixels per arrow sub-cell. A level
  // too large for even three pixels a cell still gets three and is cropped by the canvas; no
  // Arena level is (the widest is 128 cells, 384 px at this scale).
  const scale = Math.max(AUTOMAP_MIN_CELL, Math.floor(Math.max(0, fit) * zoom / 3) * 3);
  const sheetWidth = cols * scale;
  const sheetHeight = rows * scale;
  // How far the sheet may be slid before its own edge would leave the canvas: not at all while
  // the whole level fits, which is why a fit sheet cannot be dragged away from the middle.
  const limitX = Math.max(0, (sheetWidth - width) / 2);
  const limitY = Math.max(0, (sheetHeight - height) / 2);
  const panX = limitX ? Math.min(limitX, Math.max(-limitX, Number(view?.panX) || 0)) : 0;
  const panY = limitY ? Math.min(limitY, Math.max(-limitY, Number(view?.panY) || 0)) : 0;
  return {
    scale,
    zoom,
    limits: { x: limitX, y: limitY },
    box: {
      x: Math.round((width - sheetWidth) / 2 + panX),
      y: Math.round((height - sheetHeight) / 2 + panY),
      width: sheetWidth,
      height: sheetHeight,
    },
  };
}

/**
 * Draw one level's automap and return what a test (or the debug seam) can hold.
 *
 * `options.zoom`/`panX`/`panY` are the magnifier (`automapLayout`); the report carries what was
 * drawn so a suite can hold the zoom and the slide.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{map: object, marker: object|null, name?: string, level?: number, levels?: number,
 *   zoom?: number, panX?: number, panY?: number}} options
 * @returns {{painted:number, scale:number, zoom:number, box:object, limits:object, cells:number,
 *   arrowPixels:number|null, width:number, height:number}}
 */
export function drawAutomap(canvas, options) {
  const { map, marker, zoom = 1, panX = 0, panY = 0 } = options ?? {};
  const width = Math.max(0, Math.trunc(canvas?.width ?? 0));
  const height = Math.max(0, Math.trunc(canvas?.height ?? 0));
  const report = {
    painted: 0, scale: 0, zoom: 1, box: { x: 0, y: 0, width: 0, height: 0 }, limits: { x: 0, y: 0 },
    cells: 0, arrowPixels: null, width, height,
  };
  if (!canvas || !map || !width || !height) return report;
  const ctx = canvas.getContext('2d');
  if (!ctx) return report;

  const { scale, zoom: applied, box, limits } = automapLayout(map, width, height, { zoom, panX, panY });
  report.scale = scale;
  report.zoom = applied;
  report.box = box;
  report.limits = limits;
  ctx.imageSmoothingEnabled = false;

  // The page, then the sheet. A floor cell does not paint, so this fill **is** the floor colour.
  ctx.fillStyle = AUTOMAP_MATTE;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = AUTOMAP_PARCHMENT;
  ctx.fillRect(box.x, box.y, box.width, box.height);

  // **Every marked cell of the level's canvas**, in the reference's colours — the margin a storey
  // leaves around itself in the file's grid is not drawn at all, because the sheet is the canvas
  // (`automapLayout`). A `floor` cell is the sheet itself and paints nothing.
  const bounds = map.canvas ?? null;
  const row0 = bounds ? bounds.row0 : 0;
  const col0 = bounds ? bounds.col0 : 0;
  const rowEnd = bounds ? bounds.row1 : map.depth - 1;
  const colEnd = bounds ? bounds.col1 : map.width - 1;
  let painted = 0;
  for (let row = row0; row <= rowEnd; row++) {
    for (let col = col0; col <= colEnd; col++) {
      const kind = map.kinds[row * map.width + col];
      const color = AUTOMAP_COLORS[kind];
      if (!color || kind === 'floor') continue;
      ctx.fillStyle = color;
      ctx.fillRect(box.x + (col - col0) * scale, box.y + (row - row0) * scale, scale, scale);
      painted++;
    }
  }
  report.painted = painted;
  report.cells = map.width * map.depth;

  // The player's arrow — the reference's 3×3 pattern, whole pixels inside the one cell.
  if (marker && marker.row >= row0 && marker.col >= col0 && marker.row <= rowEnd && marker.col <= colEnd) {
    const pattern = automapArrow(marker.direction);
    const sub = scale / 3;
    // The sheet is the canvas, so a cell's place on it is measured from the canvas's own corner.
    const markerX = box.x + (marker.col - col0) * scale;
    const markerY = box.y + (marker.row - row0) * scale;
    // **The cell the arrow stands in gets an ink edge — drawn first, so the arrow sits on it.**
    // The reference's arrow is the size of one voxel, which on a 128-cell sheet is a handful of
    // pixels — correct, and hard to find at a glance on a 720-pixel canvas. A one-pixel dark edge
    // around the player's own cell is this project's presentation (the header stamps it): the
    // arrow, its colour and its 3×3 pattern are still the reference's, and the eye finds it in one
    // look. Painting the edge *after* the arrow would clip the outer sub-pixels of the pattern
    // (measured: 18 yellow pixels where the pattern is 27 at scale 9), so the order is the law.
    ctx.strokeStyle = '#1a1206';
    ctx.lineWidth = 1;
    ctx.strokeRect(markerX + 0.5, markerY + 0.5, scale - 1, scale - 1);
    ctx.fillStyle = AUTOMAP_COLORS.player;
    for (const [ax, ay] of pattern) {
      ctx.fillRect(markerX + ax * sub, markerY + ay * sub, sub, sub);
    }
    report.arrowPixels = pattern.length;
  }

  // The sheet's edge, drawn last so it is not covered by a border cell.
  ctx.strokeStyle = AUTOMAP_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);
  return report;
}
