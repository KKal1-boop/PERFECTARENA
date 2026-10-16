import path from 'node:path';

export function makeDungeonPlaySuite({ check, realErrors, shots, getPort }) {
  return async function dungeonPlay(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const url = `http://localhost:${getPort()}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`;
    const ready = () => page.waitFor('window.__debug?.combat && window.__debug.state().painted > 3', { timeoutMs: 90000, label: 'dungeon play' });
    const paint = () => page.evalJs('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    const key = async code => { await page.pressKey(code); await page.pressKey(code, false); };
    await page.goto(url); await ready();
    await page.evalJs('window.__debug.pause(true)');

    // ── a camp the level hears (B10, D-19) ─────────────────────────────────────
    //
    // The owner, playing both games side by side (2026-10-16): *"resting spawns enemies or
    // moves enemies to you in normal arena and perfectarena doesnt"*. This is the
    // player-visible half of that law, and it is checked on the **level's own creatures**
    // rather than on a fixture: the suite walks to a cell no creature can see (a camp is
    // refused where one can, which the check further down proves), presses the real `R`, and
    // reads back what the player got — a day that passed, wounds that were **not** handed
    // back, and a line that names what woke them. A hunt that had not been roused would heal
    // to full and say "You make camp and rest."
    const restCells = await page.evalJs(`(() => {
      const d = window.__debug, s = d.state(), out = [];
      for (let r = 2; r < s.size[1] - 2 && out.length < 60; r++) {
        for (let c = 2; c < s.size[0] - 3 && out.length < 60; c++) {
          if (![0,1,2].every(k => { const q = d.cellAt(r, c + k); return q && !q.solid && !q.chasm; })) continue;
          if (d.sightBetween({row:r,col:c},{row:r,col:c+2}).sees) out.push([r, c]);
        }
      }
      return out;
    })()`);
    if (!restCells.length) throw new Error('No corridor to try a camp in');
    let heard = null;
    for (const [r, c] of restCells) {
      await page.evalJs(`window.__debug.teleportCell(${r},${c}); window.__debug.look(0,0)`);
      const healthBefore = await page.evalJs('window.__debug.player().health');
      await key('KeyR');
      const after = await page.evalJs('({rest: window.__debug.state().lastRest, health: window.__debug.player().health, notice: window.__debug.state().notice, alive: window.__debug.combat().monsters.filter(q=>q.health>0).length})');
      if (after.rest?.camp === true) { heard = { ...after, healthBefore, cell: [r, c] }; break; }
    }
    check('a camp with creatures left in the level is heard: the day passes and the wounds are not handed back',
      Boolean(heard) && heard.rest.disturbed === true && heard.rest.roused > 0
      && heard.health === heard.healthBefore && /heard you sleep/.test(heard.notice ?? ''),
      JSON.stringify(heard));
    check('and the creature that heard it is hunting the sleeper, not standing where it was',
      // The scene gates a creature's own band at `AGGRO`; a roused one comes from further. The
      // seam reports how many are alive, which is what `roused` counted, so the two agree.
      Boolean(heard) && heard.alive === heard.rest.roused,
      heard ? `${heard.rest.roused} roused of ${heard.alive} alive` : 'no camp answered');
    await page.screenshot(path.join(shots, 'dungeon-rest-heard.png'));
    await page.goto(url); await ready();
    await page.evalJs('window.__debug.pause(true)');
    const target = await page.evalJs(`(() => {
      const s = window.__debug.state();
      return s.loot.find(q => q.kind !== 'key' && q.kind !== 'equipment' && !q.taken
        && s.loot.filter(p => !p.taken && Math.hypot(p.row-q.row,p.col-q.col)*2.5 < 3).length === 1
        && s.leaves.every(d => Math.hypot(d.row-q.row,d.col-q.col)*2.5 > 3));
    })()`);
    if (!target) throw new Error('No isolated loot pile to verify repeated E');
    await page.evalJs(`window.__debug.teleportCell(${target.row},${target.col})`);
    const before = await page.evalJs('window.__debug.player().gold || 0');
    await key('KeyE'); await paint();
    const once = await page.evalJs('window.__debug.player().gold || 0');
    for (let i = 0; i < 8; i++) await key('KeyE');
    const repeated = await page.evalJs('window.__debug.player().gold || 0');
    const taken = await page.evalJs(`window.__debug.state().loot.find(q=>q.row===${target.row}&&q.col===${target.col})`);
    check('real E pays a loot pile once, not forever', once > before && repeated === once && taken.taken, `${before} → ${once} → ${repeated}`);
    await page.goto(url); await ready();
    const persisted = await page.evalJs(`window.__debug.state().loot.find(q=>q.row===${target.row}&&q.col===${target.col}).taken`);
    check('that real-key loot pickup remains empty after reload', persisted);
    await page.evalJs('window.__debug.pause(true)');
    const leaf = (await page.evalJs('window.__debug.state().leaves')).find(d=>!d.locked);
    if (!leaf) throw new Error('No unlocked test door');
    await page.evalJs(`window.__debug.teleportCell(${leaf.row},${leaf.col})`);
    await key('KeyE'); await page.evalJs('window.__debug.advance(0.6)');
    const open = await page.evalJs(`window.__debug.state().leaves.find(q=>q.row===${leaf.row}&&q.col===${leaf.col}).open`);
    await key('KeyE'); await page.evalJs('window.__debug.advance(0.4)');
    const shut = await page.evalJs(`window.__debug.state().leaves.find(q=>q.row===${leaf.row}&&q.col===${leaf.col}).open`);
    check('real E animates the live door open and shut, not a copy', open === 1 && shut === 0, `${open} → ${shut}`);

    const keyItem = (await page.evalJs('window.__debug.state().loot')).find(q=>q.kind==='key'&&!q.taken&&q.lock>0);
    if (!keyItem) throw new Error('No key in Imperial Dungeons');
    await page.evalJs(`window.__debug.teleportCell(${keyItem.row},${keyItem.col})`);
    await key('KeyE');
    check('a dungeon key can be collected through E and enters the saved pack',
      await page.evalJs(`window.__debug.player().keys.some(q=>q.lock>=${keyItem.lock})`), JSON.stringify(keyItem));
    await page.evalJs(`(() => {
      const d = window.__debug, s = d.state();
      for(let r=2;r<s.size[1]-2;r++) for(let c=2;c<s.size[0]-3;c++) {
        if([0,1,2].every(k=>{const q=d.cellAt(r,c+k);return q&&!q.solid&&!q.chasm})
          && d.sightBetween({row:r,col:c},{row:r,col:c+2}).sees) {
          d.teleportCell(r,c); d.look(0,0); return true;
        }
      }
      throw new Error('No open resting threat corridor');
    })()`);
    await page.evalJs('(async()=>{await window.__debug.spawnMonster("rat");return true})()');
    const health = (await page.evalJs('window.__debug.player()')).health;
    await key('KeyR');
    check('R refuses camping with a visible living enemy nearby',
      /cannot rest/.test(await page.evalJs('window.__debug.state().notice')) && (await page.evalJs('window.__debug.player()')).health === health);
    await page.evalJs('window.__debug.combat().monsters.forEach((_,i)=>window.__debug.damageEnemy(i,100000))');
    await page.evalJs('window.__debug.advance(0.6); window.__debug.hurt(10)');
    const day = await page.evalJs('window.__debug.jobs().day');
    await key('KeyR');
    const rested = await page.evalJs('({p:window.__debug.player(),day:window.__debug.jobs().day,notice:window.__debug.state().notice})');
    check('R safely camps, restores health, and spends a day without resetting dungeon enemies',
      rested.p.health === rested.p.maxHealth && rested.day === day + 1 && /make camp/.test(rested.notice)
      && await page.evalJs('window.__debug.combat().monsters.every(q=>q.health===0)'), JSON.stringify(rested));
    await page.screenshot(path.join(shots, 'dungeon-rested.png'));

    await page.goto(url.replace('START.MIF', '39300577.MIF')); await ready();
    await page.evalJs('window.__debug.pause(true)'); await paint();
    const first = await page.evalJs('window.__debug.state().scenery.animated');
    await page.evalJs('window.__debug.advance(0.09)'); await paint();
    const second = await page.evalJs('window.__debug.state().scenery.animated');
    check('main-story dungeon draws original DFA fixtures and advances their frames',
      first.length > 0 && first.every(q=>q.frames>1) && first.some((q,i)=>q.frame!==second[i]?.frame), JSON.stringify(first.slice(0,4)));
    await page.screenshot(path.join(shots, 'dungeon-original-fixtures.png'));
    check('dungeon interaction has no console errors', realErrors(page.consoleErrors()).length===0,
      realErrors(page.consoleErrors()).map(q=>q.text).join(' | ').slice(0,400));

    // ── a dungeon's way out is the country, not the map (D-34) ────────────────
    //
    // The owner, playing the port beside the original: *"STILL EXITING A DUNGEON JUST SHOWS YOU
    // THE MAP NOT THE FUCKING WILDERNESS"*. The way out is the level's own `*LEVELUP` art — the
    // same `E` every stair uses — and what must come back is the **country**: the ruin block this
    // dungeon's own seed picks in the country of its nearest settlement (`game/dungeonSurface.js`),
    // the world map down, and the way back in under the player's feet. A dungeon reached by fast
    // travel or a dev door — never walked into from the country — is the case that used to end
    // on the map, so it is the case this walks.
    const dungeonUrl = `http://localhost:${getPort()}/?dungeon=Stonekeep&arena=${encodeURIComponent(arena)}`;
    await page.goto(dungeonUrl); await ready();
    await page.evalJs('window.__debug.pause(true)');
    const here = await page.evalJs('({ location: window.__debug.state().location, wild: window.__debug.state().wild, mapOpen: window.__debug.state().mapOpen })');
    check('the page knows which dungeon it stands in, and that dungeon\'s own seed',
      here.location?.kind === 'dungeon' && typeof here.location?.dungeonSeed === 'number' && here.wild === null,
      JSON.stringify(here.location));
    const stairs = await page.evalJs('window.__debug.stairs()');
    const outCell = await page.evalJs(`(() => {
      const d = window.__debug, s = d.state();
      for (let r = 0; r < s.size[1]; r++) for (let c = 0; c < s.size[0]; c++) {
        const q = d.cellAt(r, c);
        if (q && q.stair === 'up') return { row: r, col: c };
      }
      return null;
    })()`);
    check('the dungeon has an up stair — the way out, from the level\'s own art',
      stairs.up > 0 && Boolean(outCell), JSON.stringify({ up: stairs.up, down: stairs.down, cell: outCell }));
    if (!outCell) throw new Error('No up stair to leave Stonekeep by');
    await page.evalJs(`window.__debug.teleportCell(${outCell.row},${outCell.col})`);
    await key('KeyE');
    await page.waitFor('window.__debug?.state && window.__debug.state().wild && window.__debug.state().painted > 3',
      { timeoutMs: 120000, label: 'the country outside the dungeon' });
    const country = await page.evalJs('({ wild: window.__debug.state().wild, mapOpen: window.__debug.state().mapOpen, location: window.__debug.state().location })');
    check('leaving a dungeon by its own stairs puts the player in the open country, with the map down',
      country.wild !== null && country.mapOpen === false && country.location?.kind !== 'dungeon',
      JSON.stringify({ blocks: country.wild?.blocks, mapOpen: country.mapOpen, at: country.wild?.cell }));
    check('…and the ruin the exit chose is this dungeon\'s own door, in that country',
      country.wild?.ruin?.seed === here.location.dungeonSeed && country.wild.ruin.onRuin === true,
      JSON.stringify(country.wild?.ruin ?? null));
    check('…standing at the ruin, not at the settlement\'s gate',
      Boolean(country.wild?.ruin) && Math.abs(country.wild.cell.row - country.wild.ruin.cell.row) <= 32
      && Math.abs(country.wild.cell.col - country.wild.ruin.cell.col) <= 32,
      JSON.stringify({ feet: country.wild?.cell, door: country.wild?.ruin?.cell }));
    await page.screenshot(path.join(shots, 'dungeon-out-in-the-country.png'));
    await key('KeyE');
    await page.waitFor('window.__debug?.state && window.__debug.state().location?.kind === "dungeon"',
      { timeoutMs: 120000, label: 'back down into the ruin' });
    const back = await page.evalJs('({ location: window.__debug.state().location, wild: window.__debug.state().wild, notice: window.__debug.state().notice })');
    check('E in the ruin goes back down into that same dungeon — the round trip closes',
      back.location?.dungeonSeed === here.location.dungeonSeed && back.wild === null,
      JSON.stringify({ seed: back.location?.dungeonSeed, notice: back.notice }));
    check('the dungeon round trip has no console errors', realErrors(page.consoleErrors()).length===0,
      realErrors(page.consoleErrors()).map(q=>q.text).join(' | ').slice(0,400));

    // ── the *first* dungeon a player ever leaves ──────────────────────────────
    //
    // `START.MIF` is the one dungeon `CITYDATA` has no record of — character creation hands every
    // new player to it (`game/startFlow.js`) — so it is the first exit anybody takes, and it used
    // to end on the world map. Its country is the one nearest the Imperial Palace's own marker
    // (`interior.js`'s `OPENING_DUNGEON_POINT`), which the map builds at the continent's centre:
    // this project's rule, because the original's own answer is in `A.EXE`.
    await page.goto(`http://localhost:${getPort()}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`);
    await ready();
    await page.evalJs('window.__debug.pause(true)');
    const opening = await page.evalJs('({ location: window.__debug.state().location, wild: window.__debug.state().wild })');
    check('the opening dungeon has no location record of its own — which is why its exit needed a rule',
      opening.location === null && opening.wild === null, JSON.stringify(opening));
    const wayOut = await page.evalJs(`(() => {
      const d = window.__debug, s = d.state();
      for (let r = 0; r < s.size[1]; r++) for (let c = 0; c < s.size[0]; c++) {
        const q = d.cellAt(r, c);
        if (q && q.stair === 'up') return { row: r, col: c };
      }
      return null;
    })()`);
    check('the way out of the Imperial Dungeons is the level\'s own stair art',
      Boolean(wayOut), JSON.stringify(wayOut));
    if (!wayOut) throw new Error('START.MIF has no way-out art to leave by');
    await page.evalJs(`window.__debug.teleportCell(${wayOut.row},${wayOut.col})`);
    // `E` twice at most: the first press can be the escape *objective* (a new game's own step),
    // and the second is the stair — exactly what a player who walks out does.
    let inCountry = false;
    for (let press = 0; press < 3 && !inCountry; press++) {
      await key('KeyE');
      await new Promise((r) => setTimeout(r, 400));
      inCountry = await page.evalJs('Boolean(window.__debug?.state && window.__debug.state().wild)');
    }
    check('…and leaving it comes up in the open country, with the map down',
      inCountry && await page.evalJs('window.__debug.state().mapOpen === false'),
      JSON.stringify(await page.evalJs('({ at: window.__debug.state().wild?.cell, settlement: window.__debug.state().location?.name, mapOpen: window.__debug.state().mapOpen })')));
    await page.screenshot(path.join(shots, 'opening-dungeon-out-in-the-country.png'));
  };
}
