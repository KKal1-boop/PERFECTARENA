// UESP Arena:The Imperial Palace uses original (column,row) coordinates.
// This engine's world X is the MIF row and world Z is the MIF column.
// Verified against IMPPAL.MIF floor 4: key FLOR 0x0306 on MAP1 0x2010
// raised platform, Jewel MAP1 0x802f, door MAP1 0xb01e, 452 lava cells.
export const PALACE_FINALE_LEVEL = 3;
export const PALACE_FINALE = Object.freeze({
  key: Object.freeze({x:25,z:26}),
  jewel: Object.freeze({x:24,z:20}),
  door: Object.freeze({x:24,z:21}),
});
export function palaceChambers(level) {
  if(level?.width!==50 || level?.depth!==50) return null;
  const at = point => level.cells[point.x*level.width+point.z];
  if(at(PALACE_FINALE.key)?.kind!=='raised' || at(PALACE_FINALE.jewel)?.kind!=='entity' || at(PALACE_FINALE.door)?.kind!=='door') return null;
  return {key:{...PALACE_FINALE.key,cells:level.cells.length},jewel:{...PALACE_FINALE.jewel,cells:level.cells.length},cells:level.cells.length};
}
