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
    // **The camp is refused, and the refusal is the message.** It used to pass the day and say
    // "4 of them are coming", which cost the player a day to be told a count they could not see,
    // and the owner's reply (2026-10-17) was that nothing ever came and they never rested. Now a
    // heard camp costs nothing and says how far off the nearest one is — and the creatures are
    // still roused, which is what the check below proves by watching one walk in.
    check('a camp with creatures in earshot is refused: no day passes, and the line names the nearest',
      Boolean(heard) && heard.rest.disturbed === true && heard.rest.roused > 0
      && heard.rest.days === 0 && heard.health === heard.healthBefore
      && /You cannot rest/.test(heard.notice ?? '') && /heard you sleep/.test(heard.notice ?? '')
      && /\d+ m off|in the dark/.test(heard.notice ?? ''),
      JSON.stringify(heard));
    check('and the creature that heard it is hunting the sleeper, not standing where it was',
      // The scene gates a creature's own band at `AGGRO`; a roused one comes from further. Only
      // creatures that can arrive inside the hold are counted (`HUNT_RUN` times the walk, times
      // `HUNT_SECONDS` — 250 m at the scene's numbers), so the count is at most the living and
      // the nearest is a real distance the player can wait out.
      Boolean(heard) && heard.rest.roused > 0 && heard.rest.roused <= heard.alive
      && Number.isFinite(heard.rest.nearest) && heard.rest.nearest <= 250,
      heard ? `${heard.rest.roused} roused of ${heard.alive} alive, nearest ${heard.rest.nearest} m` : 'no camp answered');
    await page.screenshot(path.join(shots, 'dungeon-rest-heard.png'));

    // **And "coming" is a walk, not a wish.** The owner, 2026-10-17: *"you can never rest"* — a
    // camp answered "4 of them are coming" and then nothing moved, because the step was gated on
    // `spawn.awake` ("inside my band **and** I can see you"), which is exactly what a creature on
    // the far side of the level is not. Measured on a country page before the fix: four roused,
    // distances 41 / 90 / 129 / 202 m, **byte-identical** four seconds later, so the hunt was a
    // message and nothing else and a clean rest never came.
    //
    // The creature is **placed** rather than found: the law is about distance, and a body the
    // level happened to spawn inside its own band cannot show it. It goes in a cell with a clear
    // line to the player (the sight test's own answer) so that the walk has nothing to argue
    // with, and further than `AGGRO` (34 m) so that sight cannot be what moves it.
    //
    // **The country, not a corridor**, because the report is the country's: *"in the wilderness …
    // enemies disappear when you change url but they are still there and so you can never rest"*.
    // A 50×50 dungeon is a maze, and a maze has no 18-cell straight line to place a watcher on —
    // the first draft of this check asked one for a 45-metre sightline and got `null`. Open
    // country has the line, and it is the place the owner was standing when they said it.
    const huntUrl = `http://localhost:${getPort()}/?location=Daggerfall&wild=19016,11202&arena=${encodeURIComponent(arena)}`;
    await page.goto(huntUrl);
    await page.waitFor('window.__debug?.combat && window.__debug.state().wild && window.__debug.state().painted > 3',
      { timeoutMs: 180000, label: 'the country for the hunt' });
    await page.evalJs('window.__debug.pause(true)');
    // The pairing is searched on the page: a **camp-able** cell (no living creature within `AGGRO`
    // with a line to it — the same test `R` itself makes, made without pressing `R`) and, from
    // there, a cell beyond the band with a clear line to the camp. Then the creature is placed and
    // the level's own clock is walked.
    const hunt = await page.evalJs(`(async () => {
      const d = window.__debug, s = d.state(), CELL = 2.5;
      const seen = (here, there) => d.sightBetween(here, there).sees;
      const foesClearOf = (here) => d.combat().monsters.every(q => q.health <= 0 || q.distance > 34
        || !seen(here, { row: q.cell.row, col: q.cell.col }));
      const free = [];
      for (let r = 2; r < s.size[0] - 2; r++) for (let c = 2; c < s.size[1] - 2; c++) {
        const q = d.cellAt(r, c);
        if (q && !q.solid && !q.chasm) free.push({ row: r, col: c });
      }
      // **A stride, not the first cells.** free is in row-major order, so its first forty
      // entries are one corner of the map — the first draft of this check asked them for a
      // 45-metre sightline and got null. Both halves are sampled across the whole level, which
      // keeps the pairing to a few thousand sight tests in a 50x50 grid instead of millions.
      const stride = (list, n) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0);
      const camps = stride(free, 60);
      const farCells = stride(free, 180);
      let tried = 0;
      const why = [];
      for (const here of camps) {
        if (tried >= 60) break;
        // A teleport moves the body and leaves it in the air: grounded is what the physics step
        // says, so the step has to run before the cell is judged (the first draft read
        // grounded false on every cell of a flat field and found no camp at all).
        d.teleportCell(here.row, here.col); d.look(0, 0); d.advance(0.2);
        const w = d.water();
        if (w.chasm || !w.grounded || !foesClearOf(here)) {
          if (why.length < 6) why.push({ here: [here.row, here.col], chasm: w.chasm, grounded: w.grounded, foes: foesClearOf(here) });
          continue;
        }
        tried++;
        // Just beyond the band a camp is refused inside (AGGRO, 34 m), and with a clear line so
        // the walk has nothing to argue with. A 36 m line is what a 50x50 dungeon can offer: an
        // 18-cell straight corridor is common, a 25-cell one is not.
        const far = farCells.find((there) => {
          const away = Math.hypot((there.row - here.row) * CELL, (there.col - here.col) * CELL);
          return away > 36 && away < 90 && seen(here, there);
        });
        if (!far) {
          if (why.length < 6) why.push({ here: [here.row, here.col], far: null, farCells: farCells.length });
          continue;
        }
        // **The camp is tried before the creature is placed**, so a cell where R would refuse
        // does not leave a rat behind for the next candidate to trip over. A heard camp now
        // *refuses* (returns false) and says so — that answer is what this check wants, because
        // refusal is what rouses the level. Any other refusal (an enemy in the band, wet ground)
        // is a candidate skipped rather than a check failed.
        d.rest();
        if (!/heard you sleep/.test(d.state().notice ?? '')) continue;
        const placed = await d.placeMonster('rat', far);
        if (!placed) continue;
        const before = d.combat().monsters[placed.index];
        const seesAtStart = before.sees;
        const from = before.distance;
        const fromFeet = d.state().feet;
        const rested = d.rest();                  // and this one rouses the newcomer too
        const rousedNow = d.combat().monsters[placed.index].roused;
        const heardNow = /heard you sleep/.test(d.state().notice ?? '');
        // **Ten seconds in real frames, not one giant step.** A monster's stride is
        // min(MONSTER_SPEED * dt, the distance left), and walkableWorld refuses a body that would
        // land in a tree — so a single 10-second step asks the creature to leap 26 m and it is
        // stopped every time (the first run of this check read 65 m to 65 m for exactly that
        // reason). 200 steps of 50 ms is what the game's own loop does.
        for (let i = 0; i < 200; i++) d.advance(0.05);
        const to = d.combat().monsters[placed.index].distance;
        const healthAtStart = d.player().health;
        // **And the walk ends in a blow**, which is the whole promise: the report was that they
        // never get close. Twenty more seconds of real frames — enough for a rat to finish the
        // last 27 m, wind up and swing — read back as the lowest the player's health got.
        let lowest = healthAtStart;
        for (let i = 0; i < 400; i++) { d.advance(0.05); lowest = Math.min(lowest, d.player().health); }
        const closed = d.combat().monsters[placed.index];
        return { ok: true, camp: here, far, seesAtStart, from, to, rousedNow, rest: rested === true,
          refused: rested === false, heard: heardNow,
          atEnd: closed.distance, sees: closed.sees, healthAtStart, health: lowest,
          stoodStill: Math.hypot(fromFeet[0] - d.state().feet[0], fromFeet[2] - d.state().feet[2]) < 0.3,
          notice: d.state().notice };
      }
      return { ok: false, free: free.length, camps: camps.length, farCells: farCells.length, why,
        foes: d.combat().monsters.map(m => ({ n: m.name, d: Math.round(m.distance) })) };
    })()`);
    check('the level offers a camp with a plain-sight cell far enough away to watch a hunt cross',
      hunt?.ok === true, JSON.stringify(hunt?.ok === true ? { camp: hunt.camp, far: hunt.far, from: hunt.from } : hunt));
    check('a creature roused by a refused camp walks in from beyond its own band',
      hunt?.ok === true && hunt.refused === true && hunt.heard === true && hunt.seesAtStart === false
      && hunt.rousedNow === true && hunt.from > 34 && hunt.from - hunt.to > 8 && hunt.stoodStill === true,
      hunt?.ok === true
        ? `${Math.round(hunt.from)} m → ${Math.round(hunt.to)} m in ten seconds, saw the player at the start: ${hunt.seesAtStart}, the sleeper stood still: ${hunt.stoodStill}, camp said "${hunt.notice}"`
        : JSON.stringify(hunt));
    check('and the hunter that walks in gets within reach and hits the sleeper',
      hunt?.ok === true && hunt.atEnd < 4 && hunt.health < hunt.healthAtStart,
      hunt?.ok === true
        ? `closed to ${Math.round(hunt.atEnd)} m, in sight: ${hunt.sees}, health ${hunt.healthAtStart} → ${hunt.health}`
        : JSON.stringify(hunt));
    await page.screenshot(path.join(shots, 'country-hunt-arrives.png'));
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
    // **Eight hours, not a day.** A camp is passed as `8×60` game minutes (`restHere`'s own
    // notice says so), so the check reads the clock it moved rather than the day counter that
    // only changes when the sleep crosses midnight — the old pin asked for `day + 1` and passed
    // or failed on the hour the suite happened to arrive at.
    const beforeCamp = await page.evalJs('({clock: window.__debug.clock(), day: window.__debug.jobs().day})');
    await key('KeyR');
    const rested = await page.evalJs('({p:window.__debug.player(),day:window.__debug.jobs().day,notice:window.__debug.state().notice,rest:window.__debug.state().lastRest,clock:window.__debug.clock()})');
    // Whole minutes on the level's own clock: the base day plus the days it has turned since
    // the arrival (`timeOfDay` folds both), so a camp that crosses midnight measures the same.
    const absMinutes = (c) => (c.day + (c.turned ?? 0)) * 1440 + c.minutes;
    const elapsed = absMinutes(rested.clock) - absMinutes(beforeCamp.clock);
    check('R safely camps, restores health, and spends eight hours without resetting dungeon enemies',
      rested.p.health === rested.p.maxHealth && rested.rest?.hours === 8 && elapsed === 480
      && /make camp/.test(rested.notice)
      && await page.evalJs('window.__debug.combat().monsters.every(q=>q.health===0)'),
      `${JSON.stringify(rested.rest)} clock ${JSON.stringify(beforeCamp.clock)} → ${JSON.stringify(rested.clock)} (${elapsed} min)`);
    await page.screenshot(path.join(shots, 'dungeon-rested.png'));

    // ── the owner's own fight reports (2026-10-19) ───────────────────────────
    //
    // Four claims in one message, and each is a state the scene already keeps:
    //
    //   * a **caster** throws with no ground ring (`spawn.attack` is what draws both the amber
    //     circle and the attack animation, and a ghost must have neither);
    //   * a creature that **gives the fight up mid-swing** drops the blow (`spawn.attack` is
    //     cleared, `fledMidBlow` counts it) and runs — the reported stuck ring and frozen rig;
    //   * a body's flight **turns corners** rather than pressing into the wall (its distance to
    //     the player grows while it is out of sight);
    //   * the **flow field** has a route to cells the player cannot see, which is the pathfinding
    //     the sliding step did not have.
    // **The window is the cast's own clock, not a guess.** Since the caster throws *through its
    // attack sheet* (the 2026-10-19 rule: "enemies that cast spells still need to use their
    // attack animation to cast them"), a ghost's bolt leaves 1.6 s after the fight starts — the
    // cast clock's 0.9 s, then the animation's own windup — and the 1.5 s the old pin allowed had
    // stopped at "still casting", failing a caster that was working. Measured on the page: the
    // arm comes over at 0.9 s, the bolt leaves at 1.6 s, and no ring is ever drawn. Four seconds
    // is the whole of that with room, and the laws are unchanged (a bolt, no melee circle).
    const caster = await page.evalJs(`(async () => {
      const d = window.__debug;
      await d.spawnMonster('ghost');
      const index = d.combat().monsters.length - 1;
      d.prepareCombat(index, { nextAttack: 0 });
      const castsAtStart = d.combat().casts;
      let ringed = false;
      let castingAt = null, castAt = null;
      for (let i = 0; i < 80; i++) {
        d.advance(0.05);
        const spawn = d.combat().monsters[index];
        const now = d.combat();
        if (castingAt === null && now.monsters[index]?.casting) castingAt = (i + 1) * 0.05;
        if (castAt === null && (now.casts ?? 0) > castsAtStart) castAt = (i + 1) * 0.05;
        if (spawn && spawn.attacking) ringed = true;
      }
      const after = d.combat();
      return {
        name: after.monsters[index]?.name ?? null,
        caster: after.monsters[index]?.caster ?? false,
        casts: (after.casts ?? 0) - castsAtStart,
        castingAt, castAt,
        ringed,
        ringOnIt: after.attacks.some((a) => a.serial === after.monsters[index]?.serial),
        health: d.player().health,
      };
    })()`);
    check('a caster throws bolts and never plants the melee circle',
      caster?.name === 'Ghost' && caster.caster === true && caster.casts >= 1 && caster.ringed === false && caster.ringOnIt === false,
      JSON.stringify(caster));

    const fled = await page.evalJs(`(async () => {
      const d = window.__debug;
      await d.spawnMonster('rat');
      const index = d.combat().monsters.length - 1;
      d.prepareCombat(index, { begin: true });
      const before = d.combat();
      const was = before.monsters[index].attacking;
      const at = before.monsters[index].world;
      d.forceFlee(index, 8);
      d.advance(0.05);
      const after = d.combat();
      const ringed = after.attacks.some((a) => a.serial === before.monsters[index].serial);
      const attacking = after.monsters[index].attacking;
      for (let i = 0; i < 120; i++) d.advance(0.05);
      const end = d.combat().monsters[index];
      return {
        was, attacking, ringed,
        fledMidBlow: d.combat().fledMidBlow,
        travelling: Math.hypot(end.world.x - at.x, end.world.z - at.z),
        fleeing: end.fleeing,
      };
    })()`);
    check('a flight ends the blow it was in — no ring, no attack frames, and it runs',
      fled?.was === true && fled.attacking === false && fled.ringed === false
      && fled.fledMidBlow >= 1 && fled.travelling > 2 && fled.fleeing === true,
      JSON.stringify(fled));
    await page.screenshot(path.join(shots, 'dungeon-flight.png'));

    const route = await page.evalJs(`(() => {
      const d = window.__debug;
      const open = (r, c) => { const q = d.cellAt(r, c); return q && !q.solid && !q.chasm; };
      // A room to walk in, not a corridor: the richest 9×9 window on the level. A dungeon's
      // corridors are four cells of reachable floor, which is too small to tell a route around a
      // wall from a straight line; a room with a pillar in it is the case the old step failed.
      let hall = null;
      for (let r = 5; r < d.state().size[1] - 5; r += 2) for (let c = 5; c < d.state().size[0] - 5; c += 2) {
        if (!open(r, c)) continue;
        let count = 0;
        for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) if (open(r + dr, c + dc)) count++;
        if (!hall || count > hall.count) hall = { row: r, col: c, count };
      }
      if (!hall) return { cell: null, why: 'no room' };
      d.teleportCell(hall.row, hall.col);
      d.advance(0.05);
      const row = hall.row, col = hall.col;
      // A cell the player cannot see but the search reaches: the route exists only by walking
      // around whatever stands between them, which is the whole point of the field.
      const seen = { hall, cells: 0, unseen: 0, reached: 0, best: null };
      for (let r = 1; r < d.state().size[1] - 1; r++) for (let c = 1; c < d.state().size[0] - 1; c++) {
        const cell = d.cellAt(r, c);
        if (!cell || cell.solid || cell.chasm) continue;
        seen.cells++;
        const sight = d.sightBetween({ row: r, col: c }, { row, col });
        if (!sight || sight.sees) continue;
        seen.unseen++;
        const nav = d.navAt(r, c);
        if (!nav || !(nav.dist > 0)) continue;
        seen.reached++;
        if (!seen.best || nav.dist > seen.best.dist) seen.best = { row: r, col: c, dist: nav.dist };
        if (nav.dist > 4 && nav.step) return { cell: { row: r, col: c }, nav, goal: d.combat().nav, seen };
      }
      return { cell: null, nav: null, goal: d.combat().nav, seen };
    })()`);
    check('the flow field routes to a cell the player cannot see',
      Boolean(route?.cell) && (route?.nav?.dist ?? 0) > 4, JSON.stringify(route));

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
    // **A pinned spell survives the world changing place.** The owner, 2026-10-25: *"you
    // shouldnt need to open the book every time you fast travel to use a spell that you have in
    // the hotbar"*. The strip's "can this be pressed" read the spell **file**, which a fresh
    // scene has not opened yet — leaving by a stair rebuilds the scene exactly as a fast travel
    // does — so every pinned cell turned into "not in your book" until `C` was pressed. Pin one
    // here, leave by the stair, and press it in the country.
    const pinned = await page.evalJs(`(async () => {
      const d = window.__debug;
      const book = await d.spellbook();
      if (!book.known.length) await d.learn('Light Heal');
      d.openSpellbook();
      for (let i = 0; i < 40 && !document.querySelector('[data-pin-spell]'); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const button = document.querySelector('[data-pin-spell]');
      button?.click();
      d.toggleInventory(false);
      return d.hotbar().filter((row) => row.kind === 'spell');
    })()`);
    check('a spell is pinned to the hotbar before the world changes place',
      (pinned ?? []).length === 1 && pinned[0].available === true, JSON.stringify(pinned));
    await page.evalJs(`window.__debug.teleportCell(${outCell.row},${outCell.col})`);
    await key('KeyE');
    await page.waitFor('window.__debug?.state && window.__debug.state().wild && window.__debug.state().painted > 3',
      { timeoutMs: 120000, label: 'the country outside the dungeon' });
    const bar = await page.evalJs('window.__debug.hotbar().filter((row) => row.kind === "spell")');
    check('…and it is still ready in the new place, without opening the spellbook there',
      bar.length === 1 && bar[0].available === true && bar[0].entry?.name === pinned[0]?.entry?.name,
      JSON.stringify(bar));
    if (bar.length) {
      await page.evalJs('window.__debug.pressHotbar(0)');
      await new Promise((r) => setTimeout(r, 900));
      const cast = await page.evalJs('window.__debug.state().notice');
      check('pressing the cell casts the spell — not “not in your book”',
        String(cast ?? '').includes(bar[0].entry?.name ?? '\u0000') && !/not in your book/i.test(cast ?? ''), String(cast));
    }
    const country = await page.evalJs('({ wild: window.__debug.state().wild, mapOpen: window.__debug.state().mapOpen, location: window.__debug.state().location, scenery: window.__debug.state().scenery, dungeonMouth: window.__debug.state().dungeonMouth })');
    check('leaving a dungeon by its own stairs puts the player in the open country, with the map down',
      country.wild !== null && country.mapOpen === false && country.location?.kind !== 'dungeon',
      JSON.stringify({ blocks: country.wild?.blocks, mapOpen: country.mapOpen, at: country.wild?.cell }));
    check('…and the ruin the exit chose is this dungeon\'s own door, in that country',
      country.wild?.ruin?.seed === here.location.dungeonSeed && country.wild.ruin.onRuin === true,
      JSON.stringify(country.wild?.ruin ?? null));
    // **The dungeon's mouth is a picture, not a building.** The owner, 2026-10-17: *"dungeon
    // entrances are full buildings instead, dungeon entrances should be a PNG not a building"*.
    // The country block at the dungeon's pixel is now ordinary ground (`countryAt`'s
    // `forceCategory`), and the way down is the install's own 127×100 `NDENT1.IMG` ruin entrance flat at the
    // door cell — the cell the door answer and the player's arrival both name, which is what the
    // checks below already prove.
    check('…and the way down is a painted mouth, not a house you can walk into',
      country?.scenery?.names?.includes('NDENT1.IMG') === true
      && country?.dungeonMouth && country.dungeonMouth.name === 'NDENT1.IMG',
      JSON.stringify({ mouth: country?.dungeonMouth ?? null,
        painted: country?.scenery?.names?.includes('NDENT1.IMG') ?? null }));
    check('…standing at the ruin, not at the settlement\'s gate',
      Boolean(country.wild?.ruin) && Math.abs(country.wild.cell.row - country.wild.ruin.cell.row) <= 32
      && Math.abs(country.wild.cell.col - country.wild.ruin.cell.col) <= 32,
      JSON.stringify({ feet: country.wild?.cell, door: country.wild?.ruin?.cell }));
    // **The door and the map's icon are one place.** The owner, 2026-10-17: *"DUNGEONS ARE NOT
    // WHERE THEY ARE SUPPOSED TO BE ON THE MAP WHEN YOU EXIT A DUNGEON YOURE FAR FROM WHERE YOU
    // SHOULD BE"*. The map marks a dungeon at its `CITYDATA` pixel (one pixel is 256 world cells),
    // and the door used to be up to eight blocks (512 cells) of country away. The block is the
    // dungeon's own pixel now, so the cell a player climbs out on rounds to the icon's own pixel.
    const doorPixel = country.wild?.ruin ? {
      x: Math.floor(country.wild.ruin.cell.col / 256), y: Math.floor(country.wild.ruin.cell.row / 256),
    } : null;
    check('…and the door stands in the dungeon\'s own pixel, where the map draws its icon',
      Boolean(doorPixel && here.location?.global)
      && doorPixel.x === here.location.global.x && doorPixel.y === here.location.global.y,
      `door pixel ${JSON.stringify(doorPixel)} of the icon ${JSON.stringify(here.location?.global)}`);
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
      // **The country is rebuilt in place, not navigated to**, so the press is answered a beat
      // later (a fixed 400 ms read raced that rebuild on a software renderer). Waiting for the
      // *fact* is the same claim the loop made, without the frame rate in it.
      try {
        await page.waitFor('window.__debug?.state && window.__debug.state().wild',
          { timeoutMs: 20000, label: 'the country after the way out' });
        inCountry = true;
      } catch { inCountry = false; }
    }
    check('…and leaving it comes up in the open country, with the map down',
      inCountry && await page.evalJs('window.__debug.state().mapOpen === false'),
      JSON.stringify(await page.evalJs('({ at: window.__debug.state().wild?.cell, settlement: window.__debug.state().location?.name, mapOpen: window.__debug.state().mapOpen })')));
    await page.screenshot(path.join(shots, 'opening-dungeon-out-in-the-country.png'));

    // ── a pit is a hole you climb out of, never a doorway under the walls ──────
    //
    // The owner, 2026-10-17: *"i still fall off maps in pits and water pits … and you can go
    // outside boundaries of the dungeon"*. A chasm's bank was skipped wherever the cell beside
    // it was a structure ("a structure already draws this face"), but a structure's faces start
    // at the FLOOR PLANE and the bank runs from the **bed** up to it — so the whole band
    // between bed and floor was missing and a body on the bed walked into the rock. This is
    // the owner's own walk: stand in the dungeon's water, walk at the wall, and see where the
    // body ends up.
    const walkAt = async (key, ms) => {
      await page.evalJs(`window.__debug.input('${key}', true)`);
      await new Promise((r) => setTimeout(r, ms));
      await page.evalJs(`window.__debug.input('${key}', false)`);
      await new Promise((r) => setTimeout(r, 120));
    };
    const pitUrl = `http://localhost:${getPort()}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`;
    await page.goto(pitUrl); await ready();
    const pit = await page.evalJs(`(() => {
      const d = window.__debug, s = d.state();
      const rock = (q) => q && q.solid && ['wall', 'door', 'transparent', 'diagonal'].includes(q.kind);
      for (let r = 0; r < s.size[0]; r++) {
        for (let c = 0; c < s.size[1]; c++) {
          const cell = d.cellAt(r, c);
          if (!cell || !cell.chasm || cell.solid) continue;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nb = d.cellAt(r + dr, c + dc);
            if (rock(nb)) return { row: r, col: c, dr, dc, kind: cell.chasm, rock: nb.kind };
          }
        }
      }
      return null;
    })()`);
    check('the Imperial Dungeons have a pit with rock beside it to try', Boolean(pit), JSON.stringify(pit));
    if (pit) {
      const CELL = 2.5;
      // The drop is real physics, so it is stepped and waited for rather than skipped.
      let inPit = null;
      for (let i = 0; i < 8; i++) {
        inPit = await page.evalJs(`(() => {
          const d = window.__debug;
          ${i === 0 ? `d.teleportCell(${pit.row}, ${pit.col}); d.look(Math.atan2(${pit.dr} * ${CELL}, ${pit.dc} * ${CELL}), 0);` : ''}
          d.advance(0.4);
          const w = d.water();
          return { feet: d.state().feet, feetY: w.feetY, surface: w.surface, chasm: w.chasm, grounded: w.grounded };
        })()`);
        if (inPit.grounded) break;
      }
      check('standing in the pit, the body is on its bed and not in the water line',
        inPit.chasm === pit.kind && inPit.grounded === true && inPit.feetY < inPit.surface - 0.2,
        JSON.stringify(inPit));
      await walkAt('KeyW', 1600);
      const after = await page.evalJs('({ feet: window.__debug.state().feet, water: window.__debug.water(), size: window.__debug.state().size })');
      // The wall's face is the pit cell's own boundary: the body stops a capsule radius short
      // of it, and — the whole point — it is still on the pit's side, still on the bed. The
      // cell spans [row·S, (row+1)·S) × [col·S, (col+1)·S), so the boundary the body walks at
      // is the far one in the direction it walks.
      const [x0, x1] = [pit.row * CELL, (pit.row + 1) * CELL];
      const [z0, z1] = [pit.col * CELL, (pit.col + 1) * CELL];
      const onTheBed = after.water.chasm === pit.kind && after.feet[1] < after.water.surface - 0.2;
      const insideCell = pit.dr > 0 ? after.feet[0] < x1
        : pit.dr < 0 ? after.feet[0] > x0
          : pit.dc > 0 ? after.feet[2] < z1
            : after.feet[2] > z0;
      check('walking at the rock from inside the pit is stopped by its bank, and stays in the pit',
        onTheBed && insideCell && after.feet[1] > 0,
        `feet ${after.feet.map((q) => q.toFixed(2)).join(', ')} ${JSON.stringify(after.water)}`);
      check('and it never left the level\'s own rectangle',
        after.feet[0] > 0 && after.feet[2] > 0
        && after.feet[0] < after.size[0] * CELL && after.feet[2] < after.size[1] * CELL,
        `feet ${after.feet.map((q) => q.toFixed(2)).join(', ')} of ${after.size.join('×')} cells`);
      await page.screenshot(path.join(shots, 'dungeon-pit-wall.png'));
    }

    // …and the same law at the edge of the map, which is the other half of the report:
    // *"you can go outside boundaries of the dungeon"*.
    //
    // The ring of most quest dungeons is solid rock (`raised`), so there is nothing to walk off
    // there — but the Crypt of Hearts' second level has a **walkable** ring cell (row 0, col 65)
    // and the level's data simply stops beyond it. `mifMesh.js`'s boundary pass is what stands
    // in the way, and this is the owner's own walk at it.
    await page.goto(`http://localhost:${getPort()}/?interior=41649375.MIF&arena=${encodeURIComponent(arena)}`);
    await ready();
    await page.evalJs('window.__debug.loadLevelAndSettle(1)');
    await page.evalJs('window.__debug.pause(true)');
    const edge = await page.evalJs(`(() => {
      const d = window.__debug, s = d.state();
      let best = null;
      for (let c = 0; c < s.size[1]; c++) {
        const q = d.cellAt(0, c);
        if (q && !q.solid && !q.floor?.chasm) { best = { row: 0, col: c, dr: -1, dc: 0 }; break; }
      }
      return best;
    })()`);
    check('a quest dungeon still has a walkable ring to try to walk off', Boolean(edge), JSON.stringify(edge));
    if (edge) {
      await page.evalJs(`window.__debug.teleportCell(${edge.row}, ${edge.col}); window.__debug.look(Math.atan2(-2.5, 0), 0); window.__debug.advance(0.5)`);
      await page.evalJs('window.__debug.pause(false)');
      await walkAt('KeyW', 2000);
      const out = await page.evalJs('({ feet: window.__debug.state().feet, grounded: window.__debug.state().grounded, size: window.__debug.state().size })');
      check('holding W at the map\'s edge is stopped by the boundary wall, not by the void',
        out.grounded === true && out.feet[0] > 0 && out.feet[0] < out.size[0] * 2.5
        && out.feet[2] > 0 && out.feet[2] < out.size[1] * 2.5 && out.feet[1] > 0,
        `feet ${out.feet.map((q) => q.toFixed(2)).join(', ')} of ${out.size.join('×')} cells, grounded ${out.grounded}`);
      await page.screenshot(path.join(shots, 'dungeon-edge-wall.png'));
    }
  };
}
