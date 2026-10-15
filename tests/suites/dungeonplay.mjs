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
  };
}
