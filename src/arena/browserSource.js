// WHERE THE BROWSER READS ARENA'S DATA FROM.
//
// Two doors, and neither bundles a byte of game data:
//
//  * **The player's own folder.** A `<input type="file" webkitdirectory>` gives a
//    flat `FileList`; names are indexed upper-case so Arena's 8.3 names resolve
//    on any filesystem. This is the shipping path.
//  * **The dev/test door.** `?arena=<path>` points the loader at this project's
//    own static server (`tools/serve.mjs`), which will serve `/arena-local/<NAME>`
//    out of that path. The headless browser tests use this instead of driving a
//    file picker.
//
// Both produce the same `ArenaSource` the rest of the game consumes
// (`src/arena/arenaData.js`), so nothing downstream knows the difference.

/**
 * @typedef {import('./arenaData.js').ArenaSource} ArenaSource
 */

/**
 * Read Arena's data over HTTP from this project's static server.
 *
 * The server exposes an index of the loose files, which this fetches once. Almost
 * every name the game asks for lives inside `GLOBAL.BSA` rather than in the
 * folder, so without the index a miss would mean a 404 — a network error in the
 * browser console for something entirely expected. With it, only names that
 * actually exist on disk are requested.
 *
 * @param {string} arenaPath   the folder to serve, passed through to the server
 * @param {string} [mount='arena-local']  the server's mount point
 * @returns {ArenaSource & {listing: Set<string>|null}}
 */
export function localServerSource(arenaPath, mount = 'arena-local') {
  const query = `arena=${encodeURIComponent(arenaPath)}`;
  /** @type {Set<string>|null} */
  let listing = null;
  const source = {
    label: `server:${arenaPath}`,
    listing,
    list: () => (listing ? Array.from(listing).sort() : []),
    /**
     * Fetch the loose-file index once. A server without the index endpoint (or
     * an unreachable one) leaves `listing` null, and every name is probed — the
     * slow but still correct path.
     */
    async ensureListing() {
      if (listing) return listing;
      try {
        const res = await fetch(`/${mount}/?${query}`);
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body?.names)) {
            listing = new Set(body.names.map((n) => String(n).toUpperCase()));
            source.listing = listing;
          }
        }
      } catch { /* fall through to probing every name */ }
      return listing;
    },
    getBytes: async (name) => {
      const upper = name.toUpperCase();
      const index = await source.ensureListing();
      if (index && !index.has(upper)) return null;
      const res = await fetch(`/${mount}/${encodeURIComponent(upper)}?${query}`);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    },
  };
  return source;
}

/**
 * Wrap a directory `FileList` (from a `webkitdirectory` input, or a drag-and-drop
 * drop entry) as an `ArenaSource`.
 *
 * @param {FileList|File[]} files
 * @param {string} [label]
 * @returns {ArenaSource & {files: Map<string, File>}}
 */
export function fileListSource(files, label = 'picker') {
  /** @type {Map<string, File>} */
  const index = new Map();
  for (const file of Array.from(files)) {
    // webkitRelativePath is set by the directory input; either name works since
    // Arena's filenames are unique 8.3.
    const name = (file.webkitRelativePath || file.name).split('/').pop().toUpperCase();
    if (name) index.set(name, file);
  }
  return {
    label,
    files: index,
    list: () => Array.from(index.keys()).sort(),
    getBytes: async (name) => {
      const file = index.get(name.toUpperCase());
      if (!file) return null;
      return new Uint8Array(await file.arrayBuffer());
    },
  };
}

/**
 * Does a directory listing look like an Arena installation?
 *
 * @param {ArenaSource} source
 * @returns {boolean}
 */
export function looksLikeArena(source) {
  const names = typeof source.list === 'function' ? source.list() : [];
  return names.includes('GLOBAL.BSA');
}

/**
 * Ask the player for their Arena folder, and wait for a usable source.
 *
 * Resolves once a folder containing `GLOBAL.BSA` is chosen; the caller decides
 * what to do if the player cancels. `onProgress` is called with a short status
 * string so the boot overlay can say what it is waiting for.
 *
 * @param {{onProgress?:(msg:string)=>void}} [opts]
 * @returns {Promise<ArenaSource|null>} null when the player dismisses the picker
 */
export function pickArenaFolder(opts = {}) {
  const { onProgress = () => {} } = opts;
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // `webkitdirectory` is the de-facto standard name; `directory` is the older
    // Chrome spelling. Whichever the browser honours, the result is a FileList.
    input.webkitdirectory = true;
    input.directory = true;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => {
      if (!input.files || !input.files.length) return finish(null);
      const source = fileListSource(input.files);
      onProgress(`found ${source.files.size} files`);
      finish(source);
    });

    // **A dismissed dialog, and nothing else.** The first version of this armed a
    // `focus` listener with a one-second timeout that resolved with `null` when the
    // input still had no files — on the theory that a window which had stopped being
    // blurred must have been left by the picker. It fires if the page so much as
    // regains focus while the dialog is *open*, and one second later it cancelled a
    // selection the player was still making: the overlay said "No folder chosen. Reload
    // to try again", so a player who spent longer than a second finding their `ARENA`
    // folder could not run the game at all. Current browsers fire `cancel` on the input
    // when the dialog is dismissed, which is the honest signal; a browser without it
    // simply never resolves, and the overlay offers the picker again.
    input.addEventListener('cancel', () => finish(null));

    input.click();
  });
}
