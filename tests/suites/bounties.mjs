import path from 'node:path';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { loadArenaText } from '../../src/arena/arenaText.js';
import { applyRadiantEvent, createRadiantState, generateQuest, MONSTERS } from '../../src/game/radiantQuests.js';

export function makeBountiesSuite({check,realErrors,shots,getPort}) {
  return async function bounties(page) {
    const arena=process.env.ARENA_PATH||'C:/ArenaProject/arena/ARENA';
    const data=new ArenaData(nodeSource(arena),{onWarn:()=>{}});
    const world=await loadWorldMap(data), library=await loadArenaText(data);
    const offer=generateQuest({world,library,kind:'slay',seed:17,giver:world.byName('Daggerfall'),day:1,
      dungeons:[world.byName('Stonekeep')],tables:{artifacts:[{name:'Chrysamere',tier:3}],items:[{name:'a sealed letter',tier:1}],monsters:[MONSTERS[0]]}});
    const state=applyRadiantEvent(createRadiantState(),'accept',{offer}).state;
    const base=`http://localhost:${getPort()}/?arena=${encodeURIComponent(arena)}`;
    const dungeon=`${base}&dungeon=${encodeURIComponent(offer.target)}`;
    const ready=()=>page.waitFor('window.__debug?.combat && window.__debug.state().painted > 3',{timeoutMs:90000,label:'bounty dungeon'});
    const key=async code=>{await page.pressKey(code);await page.pressKey(code,false);};
    await page.goto(`${base}&interior=START.MIF`);await ready();
    // Deterministic setup uses the same generator and accept transition as the board.
    await page.evalJs(`localStorage.setItem('perfectarena.radiant',${JSON.stringify(JSON.stringify(state))})`);
    await page.goto(dungeon);await ready();await page.evalJs('window.__debug.pause(true)');
    const first=await page.evalJs('({job:window.__debug.jobs(),enemies:window.__debug.combat().monsters})');
    check('a bounty spawns three real original-art targets on entering its dungeon',
      first.enemies.filter(m=>m.bounty?.questId===offer.id&&m.health>0).length===3 && !first.job.active.completed);
    const firstTarget = first.enemies.findIndex(m=>m.bounty);
    await page.evalJs(`window.__debug.approach(${firstTarget})`);
    await key('KeyE');
    check('pressing E cannot collect a bounty without fighting',
      await page.evalJs('!window.__debug.jobs().active.completed && window.__debug.jobs().active.combat.defeated.length===0'));
    const ordinary=first.enemies.findIndex(m=>!m.bounty);
    if(ordinary>=0) {
      await page.evalJs(`window.__debug.damageEnemy(${ordinary},10000)`);
      check('an ordinary dungeon kill does not advance the contract',await page.evalJs('window.__debug.jobs().active.combat.defeated.length===0'));
    }
    for(let n=0;n<3;n++) {
      const index=await page.evalJs('window.__debug.combat().monsters.findIndex(m=>m.bounty&&m.health>0)');
      if(index<0) throw new Error('Missing unfinished bounty target');
      await page.evalJs(`window.__debug.approach(${index})`);
      let dead=false;
      for(let attempt=0;attempt<40;attempt++) {
        await page.evalJs(`window.__debug.approach(${index}); window.__debug.advance(0.6)`);await key('KeyF');
        dead=await page.evalJs(`window.__debug.combat().monsters[${index}].health===0`);
        if(dead)break;
      }
      check(`real F kills contracted creature ${n+1} and records unique progress`,dead&&await page.evalJs(`window.__debug.jobs().active.combat.defeated.length===${n+1}`));
      if(!dead) {
        await page.screenshot(path.join(shots,'bounty-failure.png'));
        console.log('BOUNTY_DIAGNOSTIC',JSON.stringify(await page.evalJs(`({target:window.__debug.combat().monsters[${index}],feet:window.__debug.state().feet,combat:window.__debug.combat().player,defence:window.__debug.combat().defence,notice:window.__debug.state().notice,approach:window.__debug.approach(${index}),strike:window.__debug.strike()})`)));
        throw new Error('Bounty target survived 40 real attacks; see BOUNTY_DIAGNOSTIC');
      }
      if(n===0) {
        await page.goto(dungeon);await ready();await page.evalJs('window.__debug.pause(true)');
        check('reload keeps one kill credited and respawns only two unfinished contract targets',await page.evalJs('window.__debug.jobs().active.combat.defeated.length===1 && window.__debug.combat().monsters.filter(m=>m.bounty&&m.health>0).length===2'));
      }
    }
    const finished=await page.evalJs('window.__debug.jobs()');
    check('only the third contracted death unlocks the return-and-payment stage',finished.active.completed&&/^Return to/.test(finished.objective));
    await page.screenshot(path.join(shots,'bounty-completed.png'));
    const purse=await page.evalJs('window.__debug.player().gold||0');
    await page.goto(`${base}&location=Daggerfall`);await ready();
    const paid=await page.evalJs('({job:window.__debug.jobs(),gold:window.__debug.player().gold})');
    check('returning to the actual town pays the promised bounty once',paid.job.active===null&&paid.job.taken===1&&paid.gold===purse+offer.reward,`${purse} → ${paid.gold}`);
    await page.goto(`${base}&location=Daggerfall`);await ready();
    check('reloading the giver does not pay twice',await page.evalJs(`window.__debug.player().gold===${paid.gold}`));
    check('bounty encounters and reward flow have no console errors',realErrors(page.consoleErrors()).length===0,realErrors(page.consoleErrors()).map(m=>m.text).join(' | ').slice(0,400));
  };
}
