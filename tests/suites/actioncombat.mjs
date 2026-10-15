export function makeActionCombatSuite({ check, realErrors, shots, getPort }) {
  return async function actionCombat(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const url = `http://localhost:${getPort()}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
    await page.goto(url);
    await page.waitFor('window.__debug?.combat && window.__debug.state().painted > 3', { timeoutMs: 90000, label: 'action combat dungeon' });
    const census = await page.evalJs('window.__debug.combat().monsters.map((m) => ({id:m.id,cell:m.cell}))');
    await page.evalJs(`(() => {
      window.__debug.pause(true);
      for (let r = 2; r < 45; r++) for (let c = 2; c < 45; c++) {
        const cells = [0,1,2].map(d => window.__debug.cellAt(r,c+d));
        if (cells.every(q => q && !q.solid && !q.chasm) && window.__debug.sightBetween({row:r,col:c},{row:r,col:c+2}).sees) {
          window.__debug.teleport((r+.5)*2.5, window.__debug.state().feet[1], (c+.5)*2.5);
          window.__debug.look(0,0);
          return true;
        }
      }
      throw new Error('No open corridor for action combat');
    })()`);
    await page.evalJs('(async () => { await window.__debug.spawnMonster("rat"); return true; })()');
    // ── the fixture's own rat, by a handle that cannot drift ────────────────────────────────
    //
    // **A name is not a handle and an index is not one either.** This suite used to find its
    // rat with `attacks.find((a) => a.name === 'Rat')` and `monsters.find((m) => m.name ===
    // 'Rat')`, which held only while the level's own bestiary happened to field no rat: since
    // the Imperial Dungeons field their own weakest creatures (D-15 — rats, goblins, skeletons
    // at the top and a golem only deep down) a by-name lookup returns *somebody else's* rat
    // half a dungeon away, and nine of these checks read the wrong creature. The spawn is given
    // a `serial` by the seam (`__debug.combat()`), stable across the array being compacted when
    // a creature dies, and every read below addresses this rat by it.
    const RAT = await page.evalJs('window.__debug.combat().monsters.at(-1).serial');
    const ratIndex = () => page.evalJs(`window.__debug.combat().monsters.findIndex((m) => m.serial === ${RAT})`);
    const mine = (snap) => (snap?.monsters ?? []).find((m) => m.serial === RAT) ?? null;
    const itsAttack = async () => page.evalJs(`window.__debug.combat().attacks.find((a) => a.serial === ${RAT}) ?? null`);
    await page.evalJs(`window.__debug.prepareCombat(${await ratIndex()}, {health:200, charge:false, begin:true})`);
    await settle();
    const windup = await page.evalJs('window.__debug.combat()');
    const attack = windup.attacks.find((a) => a.serial === RAT);
    check('an enemy winds up using live attack frames, never its death sheet',
      /^RAT1\.CFA#(8|9|10|11)$/.test(mine(windup).frame), mine(windup).frame);
    check('telegraphs are world-space GL geometry, not unoccluded DOM ellipses',
      windup.effects.space === 'world' && windup.effects.depthTested && windup.telegraphs > 0
        && await page.evalJs('document.getElementById("telegraphs") === null'), JSON.stringify(windup.effects));
    const origin = JSON.stringify(attack.origin);
    await page.evalJs('window.__debug.look(0.35, -0.1)');
    await settle();
    check('turning the camera cannot move the committed attack footprint',
      JSON.stringify((await itsAttack()).origin) === origin, origin);
    await page.evalJs('window.__debug.look(0,0)');
    await page.evalJs(`window.__debug.advance(${attack.windup - 0.08})`);
    await page.pressKey('KeyB');
    await page.evalJs('window.__debug.advance(0.1)');
    await page.pressKey('KeyB', false);
    await settle();
    const parry = await page.evalJs('window.__debug.combat()');
    check('timed B parries a real enemy strike and creates a riposte opening',
      parry.parries > 0 && parry.defence.riposte === 1.8 && parry.lastDefence === 'parried', JSON.stringify(parry.defence));
    check('a parry emits bounded world-space spark particles', parry.effects.particles > 0 && parry.effects.particles <= 192, JSON.stringify(parry.effects));
    const healthBefore = mine(parry).health;
    await page.pressKey('KeyF'); await page.pressKey('KeyF', false);
    const riposte = await page.evalJs('window.__debug.combat()');
    check('F consumes that opening and damages the parried enemy',
      riposte.ripostes > 0 && riposte.defence.riposte === 0 && mine(riposte).health < healthBefore,
      `${healthBefore} → ${mine(riposte).health}, ripostes ${riposte.ripostes}`);
    await page.screenshot(path.join(shots, 'action-parry-particles.png'));

    await page.evalJs('window.__debug.advance(0.6)');
    await page.evalJs(`window.__debug.prepareCombat(${await ratIndex()}, {charge:false, begin:true})`);
    const rollAttack = await itsAttack();
    await page.evalJs(`window.__debug.advance(${rollAttack.windup - 0.08})`);
    const posBefore = await page.evalJs('window.__debug.state().feet');
    await page.pressKey('KeyA'); await page.pressKey('KeyQ'); await page.pressKey('KeyQ', false); await page.pressKey('KeyA', false);
    await page.evalJs('window.__debug.advance(0.1)');
    const dodged = await page.evalJs('({combat:window.__debug.combat(),feet:window.__debug.state().feet})');
    check('A+Q commits to a sideways swept dodge with active i-frames',
      dodged.combat.defence.direction[0] < -0.9 && dodged.feet[0] < posBefore[0] - 0.1
        && dodged.combat.lastDefence === 'dodged', JSON.stringify(dodged.combat.defence));
    // ── the held heavy ───────────────────────────────────────────────────────
    // The release-with-a-hold model, proven where the timers live: stand before the rat
    // again, release the strike with the hold full, and *the same bar* shows it — the
    // heavy (24 of 30) costs well more than the riposte light `F` found, and a hold below
    // the arm pays the light price.
    const rat = (await page.evalJs(`(() => { const s = window.__debug.combat().monsters.find((m) => m.serial === ${RAT}); return { x: s.world.x, z: s.world.z }; })()`));
    await page.evalJs(`window.__debug.teleport(${rat.x}, window.__debug.state().feet[1], ${rat.z + 2.2})`);
    await page.evalJs('window.__debug.look(Math.PI, 0)');
    await page.evalJs('window.__debug.restoreStamina()');
    await page.evalJs('window.__debug.advance(0.6)');
    await page.evalJs('window.__debug.look(Math.PI, 0)');
    const beforeHeavy = (await page.evalJs('window.__debug.combat()')).defence.stamina;
    const heavyBlow = await page.evalJs('window.__debug.strike({ held: 1.2 })');
    const heavy = await page.evalJs('window.__debug.combat()');
    check('a full-held release is a heavy: the bar pays for it',
      beforeHeavy - heavy.defence.stamina >= 20, `${beforeHeavy} → ${heavy.defence.stamina} ${JSON.stringify(heavyBlow)}`);
    await page.evalJs('window.__debug.advance(0.9)');
    const rat3 = (await page.evalJs(`(() => { const s = window.__debug.combat().monsters.find((m) => m.serial === ${RAT}); return { x: s.world.x, z: s.world.z }; })()`));
    await page.evalJs(`window.__debug.teleport(${rat3.x}, window.__debug.state().feet[1], ${rat3.z + 2.2})`);
    await page.evalJs('window.__debug.look(Math.PI, 0)');
    const tapBefore = (await page.evalJs('window.__debug.combat()')).defence.stamina;
    await page.evalJs('window.__debug.strike({ held: 0.05 })');
    const tap = await page.evalJs('window.__debug.combat()');
    check('a tap release is still the light blow',
      tapBefore - tap.defence.stamina < 12, `stamina ${tapBefore} → ${tap.defence.stamina}`);
    // ── poise: a break cancels the committed attack ─────────────────────────────
    // The meter's arithmetic is a unit test; this is the *consequence* on a real page: a
    // creature with thin footing commits to its wind-up, the heavy drains what is left,
    // and the attack dies mid-telegraph with the body staggered and the screen arrested.
    // The corridor's own golem is not part of this phase — it has been chewing on the
    // player for the whole run (the heavy section strikes it because it is nearest), and a
    // wound it lands can end the fixture by death. So it is laid down first, and the
    // player is healed, before the phase begins.
    const golemIdx = (await page.evalJs('window.__debug.combat().monsters.findIndex((m) => m.name === "Stone Golem" && m.health > 0)'));
    if (golemIdx >= 0) await page.evalJs(`window.__debug.damageEnemy(${golemIdx}, 10000)`);
    await page.evalJs('window.__debug.heal()');
    // The player of this fixture fights bare-handed, so its heavy is small — poise 1 makes
    // the break certain under `poiseCost`'s floor of 2, whatever the fist's wound turns out
    // to be.
    await page.evalJs(`window.__debug.prepareCombat(${await ratIndex()}, { poise: 1, charge: false, begin: true })`);
    await settle();
    const thinWindup = await itsAttack();
    check('a thin-footed creature still commits to a wind-up (there is something to cancel)',
      thinWindup && thinWindup.phase === 'windup', JSON.stringify(thinWindup));
    // Stand where the *rat* is the target: find the ring point around it that is furthest
    // from any other living creature, so the reach's nearest-front target is not a neighbour
    // the fixture never meant to test.
    const spot = await page.evalJs(`(() => {
      const c = window.__debug.combat();
      const rat = c.monsters.find((m) => m.serial === ${RAT});
      const others = c.monsters.filter((m) => m.serial !== ${RAT} && m.id);
      let bestPt = [rat.world.x, rat.world.z - 2.2], bestScore = -1;
      for (let a = 0; a < 24; a++) {
        const x = rat.world.x + Math.sin(a / 24 * 2 * Math.PI) * 2.4;
        const z = rat.world.z + Math.cos(a / 24 * 2 * Math.PI) * 2.4;
        // A **standable** candidate: this cell exists and is open, and this cell and the
        // rat's own cell see each other — a circle point inside a wall proves nothing.
        const here = { row: Math.floor(z / 2.5), col: Math.floor(x / 2.5) };
        const there = { row: Math.floor(rat.world.z / 2.5), col: Math.floor(rat.world.x / 2.5) };
        const seen = window.__debug.cellAt(here.row, here.col);
        if (!seen || seen.solid || !window.__debug.sightBetween(here, there).sees) continue;
        let nearest = 99;
        for (const o of others) nearest = Math.min(nearest, Math.hypot(o.world.x - x, o.world.z - z));
        if (nearest > bestScore) { bestScore = nearest; bestPt = [x, z]; }
      }
      return { pt: bestPt, sep: bestScore };
    })()`);
    await page.evalJs(`window.__debug.teleport(${spot.pt[0]}, window.__debug.state().feet[1], ${spot.pt[1]})`);      const rat2 = (await page.evalJs(`(() => { const s = window.__debug.combat().monsters.find((m) => m.serial === ${RAT}); return { x: s.world.x, z: s.world.z }; })()`));
    await page.evalJs(`window.__debug.look(Math.atan2(${rat2.x} - ${spot.pt[0]}, ${rat2.z} - ${spot.pt[1]}), 0)`);
    await page.evalJs('window.__debug.restoreStamina()');
    await page.evalJs('window.__debug.advance(0.9)');
    const preStrike = await page.evalJs(`(() => {
      const c = window.__debug.combat();
      const rat = c.monsters.find((m) => m.serial === ${RAT});
      const feet = window.__debug.state().feet;
      return { monsters: c.monsters.length, rat: rat ? { x: rat.world.x, z: rat.world.z, alive: rat.health > 0 } : null,
        feet: [Math.round(feet[0] * 10) / 10, Math.round(feet[2] * 10) / 10],
        dist: rat ? Math.round(Math.hypot(rat.world.x - feet[0], rat.world.z - feet[2]) * 10) / 10 : null };
    })()`);
    const poiseBlow = await page.evalJs('window.__debug.strike({ held: 1.2 })');
    const burned = await page.evalJs('window.__debug.combat()');
    const sight = await page.evalJs(`(() => {
      const c = window.__debug.combat().monsters.find((m) => m.serial === ${RAT});
      const feet = window.__debug.state().feet;
      return { rat: { x: c.x, z: c.z }, feet: [feet[0], feet[2]], sight: window.__debug.sightBetween(
        { row: Math.floor(feet[2] / 2.5), col: Math.floor(feet[0] / 2.5) },
        { row: Math.floor(c.z / 2.5), col: Math.floor(c.x / 2.5) }).sees, dist: Math.hypot(c.x - feet[0], c.z - feet[2]) };
    })()`);
    check('a poise break cancels the committed attack, staggers, and arrests the screen',
      burned.staggers > 0 && !burned.attacks.find((a) => a.serial === RAT)
        && burned.effects.hitStop >= 0.1,
      `${JSON.stringify(poiseBlow)} stop ${String(burned.effects.hitStop)} sight ${JSON.stringify(sight)} pre ${JSON.stringify(preStrike)}`);
    // ── the foe reads the guard ─────────────────────────────────────────────────
    // A held guard against a light creature denies the swing outright: the creature keeps
    // its distance and drifts (`circling`), until the patience is spent or the arm comes
    // down — then it commits. This is the shield's conversation, read from the same bar
    // the melee meters read. Everything here is read **by name**, because the golem's
    // removal after its death shrank the array a fixture captured an hour ago.
    await page.evalJs(`window.__debug.prepareCombat(${await ratIndex()}, { charge: false, begin: false, nextAttack: 0.15 })`);
    const ratG = await page.evalJs(`(() => { const s = window.__debug.combat().monsters.find((m) => m.serial === ${RAT}); return { x: s.world.x, z: s.world.z }; })()`);
    await page.evalJs(`window.__debug.teleport(${ratG.x}, window.__debug.state().feet[1], ${ratG.z + 2.2})`);
    await page.evalJs('window.__debug.look(Math.PI, 0)');
    await settle();
    await page.pressKey('KeyB');
    await page.evalJs('window.__debug.advance(0.4)');
    const baited = await page.evalJs('window.__debug.combat()');
    check('a guarded light creature does not swing: it drifts and waits instead',
      Boolean(mine(baited)?.circling)
        && !baited.attacks.some((a) => a.serial === RAT),
      `circling ${mine(baited)?.circling} · attacks ${baited.attacks.length}`);
    await page.pressKey('KeyB', false);
    // Not too long: the rat's whole cadence (its interval) fits inside 1.2 s, and a read
    // after it would find the blow *over* — the proof is a live wind-up, and the bait
    // clock (0.55) plus the wind-up (0.46) sit inside this one.
    await page.evalJs('window.__debug.advance(0.75)');
    const released = await page.evalJs('window.__debug.combat()');
    check('with the guard down, the foe commits to its wind-up again',
      Boolean(released.attacks.find((a) => a.serial === RAT)),
      `attacks ${released.attacks.length} · dist ${JSON.stringify(mine(released)?.distance)} · awake ${JSON.stringify(mine(released)?.awake)}`);
    // ── the casters throw ──────────────────────────────────────────────────
    // The roster's casters (`game/ranged.js`'s list) do not close: out of the band they
    // stand their ground and cast, a bolt leaves from the caster's eye, flies on its own
    // clock, and is answered by the same windows the melee fight decides by — a dodge
    // flees it, a guard holds a quarter of it, nothing else lands whole.
    await page.evalJs('window.__debug.spawnMonster("wraith")');
    // The caster is addressed by its own serial too: a level's bestiary may hold a wraith
    // (`START.MIF` names one), and a by-name lookup would then aim the whole phase at a
    // caster the fixture never spawned.
    const WRAITH = await page.evalJs('window.__debug.combat().monsters.at(-1).serial');
    const wIdx = await page.evalJs(`window.__debug.combat().monsters.findIndex((m) => m.serial === ${WRAITH})`);
    await page.evalJs('window.__debug.heal()');
    await page.evalJs('window.__debug.prepareCombat(' + wIdx + ', { charge: false, begin: false, nextAttack: 0.2 })');
    // Stand off at a spot the *scene itself* calls sighted: candidates are sampled around
    // the caster by ring, teleported to, and the first one whose own `sees` flag wakes is
    // the stand where a bolt can leave from. Layer gets no vote here — the point-level
    // ray is the fight's real rule, not the cell map's.
    let cw = null;
    const wPos0 = await page.evalJs(`(() => { const s = window.__debug.combat().monsters[${wIdx}]; return { x: s.world.x, z: s.world.z }; })()`);
    for (const radius of [4.5, 5.5, 6.5]) {
      for (let a = 0; a < 24; a++) {
        const cand = await page.evalJs(`(() => {
          const s = window.__debug.combat().monsters[${wIdx}];
          const x = s.world.x + Math.sin(${a} / 24 * 2 * Math.PI) * ${radius};
          const z = s.world.z + Math.cos(${a} / 24 * 2 * Math.PI) * ${radius};
          const cell = window.__debug.cellAt(Math.floor(z / 2.5), Math.floor(x / 2.5));
          if (!cell || cell.solid) return null;
          return [x, z];
        })()`);
        if (!cand) continue;
        await page.evalJs(`window.__debug.teleport(${cand[0]}, window.__debug.state().feet[1], ${cand[1]})`);
        await page.evalJs(`window.__debug.look(Math.atan2(${wPos0.x} - ${cand[0]}, ${wPos0.z} - ${cand[1]}), 0)`);
        // The sim is paused between `advance`s, so `sees` holds the value of the *last*
        // step: a step first, then read where the teleport actually left them — and the
        // probe reads the *same ray* the fight reads, so a refusal can be argued with.
        await page.evalJs('window.__debug.advance(0.05)');
        const sees = await page.evalJs(`(() => { const s = window.__debug.combat().monsters[${wIdx}]; const f = window.__debug.state().feet; return { sees: s?.sees, probe: window.__debug.losProbe([s.world.x, s.world.y + 1.25, s.world.z], [f[0], f[1] + 1.25, f[2]]), feet: [Math.round(f[0]*10)/10, Math.round(f[2]*10)/10] }; })()`);
        if (sees && (sees.sees || sees.probe)) { cw = { pt: cand, radius, probe: sees }; break; }
      }
      if (cw) break;
    }
    check('the fixture found a sighted stand-off spot for the caster', Boolean(cw), JSON.stringify(cw));
    const wPos = await page.evalJs(`(() => { const s = window.__debug.combat().monsters[${wIdx}]; return { x: s.world.x, z: s.world.z }; })()`);
    await page.evalJs(`window.__debug.look(Math.atan2(${wPos.x} - ${cw.pt[0]}, ${wPos.z} - ${cw.pt[1]}), 0)`);
    let seen = null;
    // A bolt at this stand-off crosses the gap in about a third of a second — reads must
    // be finer than that, or every read finds the bolt *past* them.
    for (let read = 0; read < 30 && !(seen && seen.casts > 0 && seen.bolt); read++) {
      await page.evalJs('window.__debug.advance(0.1)');
      seen = await page.evalJs('(() => { const c = window.__debug.combat(); const s = c.monsters[' + wIdx + ']; return { casts: c.casts, bolt: c.bolts.length > 0, dist: s?.distance, name: s?.name, caster: s?.caster, awake: s?.awake, next: s?.nextAttack, attack: Boolean(s?.attack) }; })()');
    }
    check('a caster keeps its band and its bolt is in flight',
      seen && seen.casts > 0 && seen.bolt && Number(seen.dist) > 4,
      `${JSON.stringify(seen)}`);
    // ── and the roll answers it: the dodge window is the same one the melee fight owns ──
    await page.evalJs('window.__debug.restoreStamina()');
    await page.evalJs(`window.__debug.prepareCombat(${wIdx}, { charge: false, begin: false, nextAttack: 0.15 })`);
    let dodgedBolt = null;
    for (let attempt = 0; attempt < 3 && !(dodgedBolt === 'dodged'); attempt++) {
      await page.evalJs('window.__debug.restoreStamina()');
      await page.evalJs(`window.__debug.prepareCombat(${wIdx}, { charge: false, begin: false, nextAttack: 0.15 })`);
      for (let slice = 0; slice < 40 && dodgedBolt !== 'dodged'; slice++) {
        await page.evalJs('window.__debug.advance(0.05)');
        const mid = await page.evalJs('(() => { const c = window.__debug.combat(); const b = c.bolts; if (!b.length) return null; const feet = window.__debug.state().feet; return Math.hypot(b[0].x - feet[0], b[0].z - feet[2]); })()');
        if (mid !== null && mid < 2.6 && mid > 0.4) { await page.pressKey('KeyQ'); await page.pressKey('KeyQ', false); }
        // A later cast's *hit* must not overwrite this attempt's `dodged`: the instance the
        // roll answers is this cast's own bolt, read the slice it resolved in.
        dodgedBolt = await page.evalJs('window.__debug.combat().lastBolt');
      }
    }
    // A final read of the answer, for the message; the check reads the slice value.
    const lastBoltNow = await page.evalJs('window.__debug.combat().lastBolt');
    const ends = await page.evalJs('window.__debug.combat().boltEnds');
    check('a thrown bolt burns past a roll — the dodge is the answer',
      dodgedBolt === 'dodged', `sliced ${JSON.stringify(dodgedBolt)} · final ${JSON.stringify(lastBoltNow)} · ends ${JSON.stringify(ends)}`);
    await page.evalJs('window.__debug.advance(0.5)');
    await page.evalJs(`window.__debug.prepareCombat(${await ratIndex()}, {charge:true, begin:true})`);
    await settle();
    const charge = await itsAttack();
    check('a charge commits to a direction and a longer lane before it moves', charge.charge && charge.reach >= 5.5, JSON.stringify(charge));
    await page.screenshot(path.join(shots, 'action-charge-lane.png'));

    await page.evalJs(`window.__debug.damageEnemy(${await ratIndex()}, 10000)`);
    await settle();
    const death0 = mine(await page.evalJs('window.__debug.combat()'));
    await page.evalJs('window.__debug.advance(0.09)'); await settle();
    const death1 = mine(await page.evalJs('window.__debug.combat()'));
    await page.evalJs('window.__debug.advance(0.1)'); await settle();
    const death2 = mine(await page.evalJs('window.__debug.combat()'));
    check('death plays the original 6.CFA sequence then holds the corpse',
      death0.frame === 'RAT6.CFA#0' && death1.frame === 'RAT6.CFA#1' && death2.frame === 'RAT6.CFA#2',
      `${death0.frame} → ${death1.frame} → ${death2.frame}`);
    await page.screenshot(path.join(shots, 'action-death-corpse.png'));
    await page.evalJs('window.__debug.damageEnemy(0, 10000)');
    const door = (await page.evalJs('window.__debug.state().leaves')).find((leaf) => !leaf.locked);
    if (!door) throw new Error('Replay dungeon has no unlocked door for persistence check');
    await page.evalJs(`window.__debug.openDoor(${door.row}, ${door.col})`);
    await page.evalJs('window.__debug.advance(0.6)');
    const historyBefore = await page.evalJs('window.__debug.worldMemory()');
    const savedBefore = await page.evalJs('({q:localStorage.getItem("perfectarena.quest"),c:localStorage.getItem("perfectarena.character")})');
    await page.goto(url);
    await page.waitFor('window.__debug?.combat && window.__debug.state().painted > 3', { timeoutMs: 90000, label: 'replayed dungeon' });
    const replay = await page.evalJs('window.__debug.combat()');
    const savedAfter = await page.evalJs('({q:localStorage.getItem("perfectarena.quest"),c:localStorage.getItem("perfectarena.character")})');
    check('re-entering a dungeon restores its enemy population, including a previously killed enemy',
      replay.monsters.length === census.length && replay.monsters.every((m) => m.health > 0)
        && replay.monsters[0].id === census[0].id && JSON.stringify(replay.monsters[0].cell) === JSON.stringify(census[0].cell), `${census.length} → ${replay.monsters.length} living enemies`);
    const restoredDoor = (await page.evalJs('window.__debug.state().leaves')).find((leaf) => leaf.row === door.row && leaf.col === door.col);
    const historyAfter = await page.evalJs('window.__debug.worldMemory()');
    check('an opened dungeon door stays open after reload while enemies still respawn',
      restoredDoor?.open === 1 && !restoredDoor.locked, JSON.stringify(restoredDoor));
    check('persistent kill history and visit counts never suppress replay encounters',
      historyBefore.kills >= 2 && historyAfter.kills === historyBefore.kills && historyAfter.places >= 1
        && historyAfter.doors >= 1, JSON.stringify(historyAfter));
    check('replaying does not erase saved quest or character progress',
      savedBefore.q === savedAfter.q && savedBefore.c === savedAfter.c);
    check('action combat produces no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0,400));
  };
}
