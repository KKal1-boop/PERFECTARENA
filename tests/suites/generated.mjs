// Suite: the dungeons, entered the way the world map sends a player to one.
//
// Two kinds, and the defects are in both:
//
//   * **the 128 generated ones.** The install ships sixteen dungeon `.MIF`s; the other 128 of
//     Tamriel's dungeon records are *assembled* out of the pieces it does have
//     (`game/dungeonPlan.js`). Until this suite nothing in the browser ever entered one — the
//     dungeon suites travel to `Stonekeep` and `Fang Lair`, which the archive really holds.
//   * **the sixteen shipped ones**, which is where the reported "you find yourself blocked off
//     as soon as you enter" turned out to be hiding: decoded with no start points, `CRYPT1.MIF`
//     put the player in the arithmetic centre of a 100×100 grid, in a one-cell pocket, with
//     1 of the level's 3711 open cells reachable.
//
// The laws, all of them asked of the running game rather than of a separate node run — the
// level a player meets is the one the decoder, the mesher and the collider built:
//
//   * **an arrival that leads somewhere.** The file's own header point where the level leads
//     out of it, otherwise the middle of the *largest* walkable region; and then a flood fill
//     from the cell the player is actually standing on, over the same `cellAt` the collider was
//     built from, reaching the whole floor. Under 90% means part of the dungeon is walled off
//     behind the arrival.
//   * **a sealed boundary** (generated only): every piece's outward-facing border has a doorway
//     in it, and eight of those borders are the finished level's *outside*. The seal closes
//     them, and the whole outer ring is walked here so that one cell a player could step off the
//     map from fails the suite.
//   * **a way out** (generated only): a generated level's pieces carry no stairway at all, so
//     the pass stamps the level's own `*LEVELUP` art beside the arrival. `E` on that stair has
//     to put the player back under the sky — a dungeon with no exit is a trap.

import path from 'node:path';

/** The dev door's own folder, the same one every other suite travels by. */
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

/**
 * Three of the world map's **generated** dungeons, by the names the map prints.
 *
 * Chosen because none of them ships a `.MIF` (`tools/tmp-gen.mjs`'s own split: 144 dungeon
 * records = 16 shipped + 128 generated), which is exactly why each is asserted to have been
 * assembled: a name that quietly gained a file would otherwise turn this suite green while
 * testing nothing at all. The two suites before this one made that mistake on the first run and
 * the checks caught it — `Crypt of Hearts` and `Mines of Khuras` boot 100×100 `CRYPT1`/`KHU1`
 * levels, not assemblies.
 */
const GENERATED = ['Tower of Murk', 'Black Grove', 'Mines of Gemin'];

/** Two of the **sixteen** dungeons the archive really ships — the other half of the law. */
const SHIPPED = ['Crypt of Hearts', 'Mines of Khuras'];

export function makeGeneratedSuite({ check, realErrors, shots, getPort }) {
  return async function suiteGenerated(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;
    const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
    const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    /**
     * Boot a dungeon by name and settle on its first level.
     *
     * **Settled, not merely painted.** The player is spawned at the floor line and the motor
     * decides whether they are standing on it over its next step or two, so `grounded` is false
     * for a frame or three after a level is built (measured: `Tower of Murk` answered `grounded:
     * false` at `painted > 2` on one run and `true` on the next, with the same arrival). Every
     * other suite waits for the same flag; this one waits rather than racing it.
     */
    const enter = async (name) => {
      await page.goto(`http://localhost:${PORT}/?dungeon=${encodeURIComponent(name)}&${q}`);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
        { label: `${name} builds`, timeoutMs: 120000 });
      await page.waitFor('window.__debug.state().grounded === true', { label: `${name} settles`, timeoutMs: 20000 })
        .catch(() => {});
      return page.evalJs('window.__debug.state()');
    };

    /**
     * How much of the level a walk from one cell reaches.
     *
     * The page's own reading of the level (`cellAt` is the decoder's cell, the same one the
     * mesher built a floor from and the collider a wall from), so this cannot disagree with what
     * the player meets — which is the whole point of asking it in the browser rather than in a
     * node run over the voxels.
     */
    /**
     * The level's walkable regions, and the one the player's own arrival stands in.
     *
     * The page's own reading of the level (`cellAt` is the decoder's cell, the same one the
     * mesher built a floor from and the collider a wall from), so this cannot disagree with what
     * the player meets — the whole point of asking it in the browser rather than in a node run
     * over the voxels.
     *
     * **Regions, not a ratio, because a shipped dungeon is allowed to be more than one room.**
     * What a player is entitled to is the arrival in the level's **largest** walkable region —
     * never a closet, never the middle of a sealed pocket — and on the install's own files the
     * largest region is all of the floor on some levels (`Mines of Gemin`, 100%) and 61.9% of it
     * on others (`Crypt of Hearts`, whose header point is what the original arrives at). A flat
     * "reaches 90% of the floor" law would fail the second for being the level it is.
     *
     * A start that is not a cell is reported as such rather than walked from: NaN and undefined
     * both pass a "row < 0 || row >= depth" test (each comparison is false), so an arrival read
     * wrong would otherwise index the grid with a non-integer — which is how this suite first
     * failed, with no number in the message.
     */
    const regionsFrom = (row, col) => page.evalJs(`(() => {
      const d = window.__debug;
      if (!Number.isInteger(${row}) || !Number.isInteger(${col})) return { error: 'no arrival cell to walk from' };
      const [rows, cols] = d.state().size;
      const cell = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols ? null : d.cellAt(r, c));
      const passable = (r, c) => {
        const k = cell(r, c);
        return Boolean(k) && (!k.solid || k.kind === 'door') && !k.chasm;
      };
      const key = (r, c) => r + ',' + c;
      const flood = (r0, c0) => {
        const seen = new Set([key(r0, c0)]);
        const queue = [[r0, c0]];
        while (queue.length) {
          const at = queue.pop();
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = at[0] + dr, nc = at[1] + dc;
            if (!passable(nr, nc)) continue;
            if (seen.has(key(nr, nc))) continue;
            seen.add(key(nr, nc));
            queue.push([nr, nc]);
          }
        }
        return seen;
      };
      let open = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (passable(r, c)) open++;
      const start = ${row} >= 0 && ${col} >= 0 && passable(${row}, ${col}) ? flood(${row}, ${col}) : new Set();
      // Every region, so "the largest" is measured rather than assumed.
      const visited = new Set(start);
      let largest = start.size;
      let regions = start.size ? 1 : 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!passable(r, c) || visited.has(key(r, c))) continue;
          const region = flood(r, c);
          for (const k of region) visited.add(k);
          regions++;
          if (region.size > largest) largest = region.size;
        }
      }
      return {
        open,
        // How many cells of the grid the arrival's own region holds, and how many the biggest
        // region holds: equal means the player is standing in the level's main floor.
        region: start.size,
        largest,
        isLargest: start.size > 0 && start.size === largest,
        regions,
        startPassable: passable(${row}, ${col}),
        share: open ? start.size / open : 0,
      };
    })()`);

    /** Every cell of the outer ring, in the game's own reading of the level. */
    const ring = () => page.evalJs(`(() => {
      const d = window.__debug;
      const [rows, cols] = d.state().size;
      const open = [];
      for (let k = 0; k < cols; k++) {
        for (const [r, c] of [[0, k], [rows - 1, k], [k, 0], [k, cols - 1]]) {
          const cell = d.cellAt(r, c);
          if (cell && (!cell.solid || cell.kind === 'door')) open.push([r, c, cell.kind]);
        }
      }
      return { tested: 4 * cols, open };
    })()`);

    /** Hold `W` for a moment and report what happened to the player. */
    const walk = async () => {
      await page.evalJs('window.__debug.look(0, 0)');
      await settle();
      const before = await page.evalJs('window.__debug.state()');
      await page.pressKey('KeyW', true);
      await settle(1400);
      await page.pressKey('KeyW', false);
      const after = await page.evalJs('window.__debug.state()');
      const moved = Math.hypot((after?.feet?.[0] ?? 0) - (before?.feet?.[0] ?? 0),
        (after?.feet?.[2] ?? 0) - (before?.feet?.[2] ?? 0));
      return { before, after, moved };
    };

    // ── the sixteen the archive ships ──────────────────────────────────────────
    //
    // **The defect these two first.** A dungeon the world map sends a player to by name was
    // decoded without the file's own header start points (`startPoints: entryCell || generated`
    // was false for it), so the arrival fell to a spiral out from the arithmetic centre of the
    // grid — which accepts a one-cell pocket. The player arrived inside it and could reach
    // nothing.
    for (const dungeon of SHIPPED) {
      const st = await enter(dungeon);
      const spawn = { row: Math.round((st?.spawn?.x ?? -9) - 0.5), col: Math.round((st?.spawn?.z ?? -9) - 0.5) };
      check(`${dungeon} is the archive's own level, read from its file`,
        st?.generated === null && st?.size?.[0] === 100 && (st?.levelCount ?? 0) >= 1,
        `${st?.size?.join('×')} cells · ${st?.quads} quads · inf ${st?.inf} · ${st?.levelCount} levels`);
      check(`${dungeon} arrives on the floor, standing, rather than at the grid's arithmetic centre`,
        st?.grounded === true && !(spawn.row === 50 && spawn.col === 50),
        `arrival ${JSON.stringify(spawn)}, feet y ${st?.feet?.[1]?.toFixed?.(2)}, grounded=${st?.grounded}`);
      const reach = await regionsFrom(spawn.row, spawn.col);
      check(`${dungeon} is not a pocket: the arrival stands in the level's largest walkable region`,
        !reach?.error && reach?.isLargest === true,
        `${reach?.error ?? ''}the arrival's region holds ${reach?.region} of the level's ${reach?.open} open cells `
        + `(${((reach?.share ?? 0) * 100).toFixed(1)}%), the largest holds ${reach?.largest} of ${reach?.regions} regions, `
        + `start passable=${reach?.startPassable}`);
      const walked = await walk();
      check(`${dungeon} lets the player walk out of the arrival, and holds them on the floor`,
        walked.after?.grounded === true && walked.moved > 0.4
          && Math.abs((walked.after?.feet?.[1] ?? 0) - (walked.before?.feet?.[1] ?? 0)) < 0.35,
        `moved ${walked.moved.toFixed(2)} units, grounded=${walked.after?.grounded}`);
      await page.screenshot(path.join(shots, `dungeon-${slug(dungeon)}.png`));
    }

    // ── the 128 that are assembled ────────────────────────────────────────────
    for (const dungeon of GENERATED) {
      const st = await enter(dungeon);
      const gen = st?.generated ?? null;
      const arrival = gen?.arrival ?? null;

      check(`${dungeon} is assembled out of the install's four pieces, not read from a file`,
        Boolean(gen) && gen.quadrants.length === 4 && / \+ /.test(gen.pieces ?? ''),
        `pieces ${gen?.pieces} (${JSON.stringify(gen?.quadrants ?? null)})`);
      check(`${dungeon} is the whole four-piece level, at its own 64×64 size`,
        st?.size?.[0] === 64 && st?.size?.[1] === 64 && (st?.quads ?? 0) > 2000,
        `${st?.size?.join('×')} cells · ${st?.quads} quads · inf ${st?.inf}`);
      check(`${dungeon} drew every surface it built (no untextured geometry)`,
        (st?.missingTextures ?? ['?']).length === 0 && (st?.textures ?? 0) > 2,
        `missing ${JSON.stringify(st?.missingTextures ?? null)}, ${st?.textures} textures`);

      const ringScan = await ring();
      check(`${dungeon} sealed the openings in the level's own outer wall`,
        (gen?.sealed ?? 0) > 0, `${gen?.sealed} cell(s) closed`);
      check(`${dungeon} has not one walkable cell on its outer ring, so nobody can walk off the map`,
        (ringScan?.open ?? null) !== null && ringScan.open.length === 0,
        `${ringScan?.tested} ring cells tested, open: ${JSON.stringify(ringScan?.open ?? null)}`);

      const feetCell = { row: Math.round((st?.spawn?.x ?? -9) - 0.5), col: Math.round((st?.spawn?.z ?? -9) - 0.5) };
      check(`${dungeon} puts the player on the assembler's own arrival, standing on the floor`,
        st?.grounded === true && arrival
          && feetCell.row === arrival.row && feetCell.col === arrival.col,
        `arrival ${JSON.stringify(arrival)}, player at ${JSON.stringify(feetCell)}, feet y ${st?.feet?.[1]?.toFixed?.(2)}`);
      check(`${dungeon} does not arrive on the level's own edge, with a wall missing`,
        Boolean(arrival) && arrival.row > 0 && arrival.col > 0 && arrival.row < 63 && arrival.col < 63,
        JSON.stringify(arrival));

      const reach = await regionsFrom(arrival?.row, arrival?.col);
      check(`${dungeon} is one level, not a room and a sealed maze: the arrival reaches it all`,
        !reach?.error && (reach?.share ?? 0) >= 0.9 && reach?.isLargest === true,
        `${reach?.error ?? ''}the arrival's region holds ${reach?.region} of the level's ${reach?.open} open cells `
        + `(${((reach?.share ?? 0) * 100).toFixed(1)}%), ${reach?.regions} region(s)`);

      const walked = await walk();
      check(`${dungeon} lets the player walk, and holds them on the floor`,
        walked.after?.grounded === true && walked.moved > 0.4
          && Math.abs((walked.after?.feet?.[1] ?? 0) - (walked.before?.feet?.[1] ?? 0)) < 0.35,
        `moved ${walked.moved.toFixed(2)} units, feet y ${walked.before?.feet?.[1]?.toFixed?.(2)} → ${walked.after?.feet?.[1]?.toFixed?.(2)}`);

      // ── the way out ─────────────────────────────────────────────────────────
      const exit = gen?.exit ?? null;
      const leaf = exit
        ? JSON.parse(await page.evalJs(`JSON.stringify(window.__debug.cellAt(${exit.row}, ${exit.col}))`) ?? 'null')
        : null;
      check(`${dungeon} stamps the level's own stair art as the way out, beside the arrival`,
        Boolean(exit) && leaf?.stair === 'up'
          && Math.max(Math.abs(exit.row - (arrival?.row ?? -9)), Math.abs(exit.col - (arrival?.col ?? -9))) <= 4,
        `exit ${JSON.stringify(exit)} reads as stair ${leaf?.stair}, arrival ${JSON.stringify(arrival)}`);

      // …and it is really the way out: stand beside it and press `E`. `leaveThePlace` puts the
      // world map over the running game, which is `state().mapOpen`.
      const beside = exit
        ? JSON.parse(await page.evalJs(`(() => {
          const d = window.__debug;
          for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
            const r = ${exit.row} + dr, c = ${exit.col} + dc;
            const cell = d.cellAt(r, c);
            if (cell && !cell.solid && !cell.chasm) return JSON.stringify({ row: r, col: c });
          }
          return 'null';
        })()`) ?? 'null')
        : null;
      check(`${dungeon} has ground beside the exit stair to stand on`, Boolean(beside), JSON.stringify(beside));
      if (beside) {
        await page.evalJs(`window.__debug.teleportCell(${beside.row}, ${beside.col})`);
        await settle(400);
        await page.pressKey('KeyE');
        await page.pressKey('KeyE', false);
        await settle(700);
        const left = JSON.parse(await page.evalJs('JSON.stringify({ mapOpen: window.__debug.state().mapOpen, notice: window.__debug.state().notice ?? "" })') ?? 'null');
        check(`${dungeon}'s stair is the way out: E on it puts the player back under the sky`,
          left?.mapOpen === true, JSON.stringify(left));
      }
      await page.screenshot(path.join(shots, `generated-${slug(dungeon)}.png`));
    }

    check('no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
