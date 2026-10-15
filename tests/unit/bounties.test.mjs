import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRadiantEvent, createRadiantState, deserializeRadiantState, radiantObjective, serializeRadiantState, slayProgress, MONSTERS } from '../../src/game/radiantQuests.js';
import { spawnEncounter } from '../../src/game/encounters.js';

const offer = { id:'17:slay', kind:'slay', subject:'goblins', title:'Clear the lair', giver:'Daggerfall', target:'Stonekeep', reward:100, days:10, offeredOn:1 };
const accept = () => applyRadiantEvent(createRadiantState(), 'accept', {offer}).state;
const kill = (state, encounterId, extra={}) => applyRadiantEvent(state, 'killed', {
  where:offer.target, questId:offer.id, monster:'goblin', encounterId, ...extra,
});

test('every bounty creature maps to an original drawable bestiary entry, including aliases', () => {
  for (const m of MONSTERS) assert.ok(slayProgress({...offer, subject:`${m.name}s`})?.monster, m.name);
});

test('bounty needs three unique contracted deaths, not arrival, E, an unrelated kill, or forged location', () => {
  let state=accept();
  const ids=slayProgress(state.active).ids;
  assert.equal(applyRadiantEvent(state,'arrive',{where:offer.target}).state.active.completed,false);
  assert.equal(applyRadiantEvent(state,'killed',{where:offer.target}).ok,false);
  assert.equal(kill(state,ids[0],{where:'Elsewhere'}).ok,false);
  assert.equal(kill(state,ids[0],{where:null}).ok,false);
  assert.equal(kill(state,ids[0],{monster:'rat'}).ok,false);
  assert.equal(kill(state,ids[0],{questId:'old job'}).ok,false);
  assert.equal(kill(state,'unrelated enemy').ok,false);
  assert.equal(applyRadiantEvent(state,'return',{where:offer.giver}).ok,false);
  for(let i=0;i<3;i++) {
    const before=state;
    const result=kill(state,ids[i]);
    assert.equal(result.ok,true,result.reason); state=result.state;
    assert.equal(slayProgress(before.active).defeated.length,i,'transition is immutable');
    assert.equal(kill(state,ids[i]).ok,false,'same corpse never counts twice');
    assert.equal(state.active.completed,i===2);
    state=deserializeRadiantState(serializeRadiantState(state));
    assert.equal(slayProgress(state.active).defeated.length,i+1,'partial progress survives reload');
  }
  assert.match(radiantObjective(state),/Return to/);
  assert.equal(applyRadiantEvent(state,'return',{}).ok,false);
  const paid=applyRadiantEvent(state,'return',{where:offer.giver});
  assert.equal(paid.gold,100);
  assert.equal(applyRadiantEvent(paid.state,'return',{where:offer.giver}).ok,false);
});

test('old bounty saves receive a valid contract and do not pre-credit previous enemy history', () => {
  const state=deserializeRadiantState({active:offer});
  assert.equal(slayProgress(state.active).required,3);
  assert.deepEqual(slayProgress(state.active).defeated,[]);
  assert.match(radiantObjective(state),/0\/3/);
});

test('encounters never place targets in disconnected rooms or occupied cells', () => {
  const width=10, depth=8;
  const cells=Array.from({length:width*depth},(_,i)=>{
    const row=Math.floor(i/width), col=i%width;
    return {kind:'air',solid:row===0||col===0||row===depth-1||col===width-1||col===5,floor:{texture:0,chasm:null}};
  });
  const level={width,depth,cells,floorY:1};
  const exclude=new Set(['2,2','3,3']);
  for(let seed=0;seed<30;seed++) {
    const spawns=spawnEncounter({level,seed,count:99,arrival:{row:1,col:1},minCells:0,monsters:['goblin'],exclude});
    assert.ok(spawns.length>5);
    assert.equal(new Set(spawns.map(s=>`${s.place.row},${s.place.col}`)).size,spawns.length);
    for(const s of spawns) {
      assert.ok(s.place.col<5,'all spawns in the arrival region');
      assert.ok(!exclude.has(`${s.place.row},${s.place.col}`));
    }
  }
});
