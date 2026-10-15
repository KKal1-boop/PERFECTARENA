// ESCAPING PLAYER TEXT INTO THE DOM LAYER.
//
// The scenes draw their panels with `innerHTML` — the alternative is building a
// dozen elements per panel by hand — so anything a *player* had a hand in (a name
// typed at creation) has to be escaped before it is interpolated. It lived as two
// identical copies in the character-creation scene and would have become a third in
// the world map's sheet, which is the point at which one shared implementation is
// obviously better than three that can drift.

/**
 * Escape the five characters that can change the structure of an HTML fragment.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}
