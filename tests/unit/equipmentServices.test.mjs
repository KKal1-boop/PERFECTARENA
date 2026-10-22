import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSpell } from '../../src/game/spellmaking.js';
import { ARTIFACTS, artifactSpell, useOrgnumsCoffer, canUseArtifact } from '../../src/game/artifacts.js';
import { addToBag, equipFromBag, itemById, armourOn } from '../../src/game/items.js';
import { applySpell } from '../../src/game/spells.js';
import { orderRepair, collectRepairs, repairQuote, wearEquipment, enchantEquipment } from '../../src/game/equipmentServices.js';
import { sellItem, stockFor } from '../../src/game/services.js';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { palaceChambers } from '../../src/game/palaceFinale.js';
import { STAFF_PICKUP_LEVELS, CLUE_PICKUP_LEVELS } from '../../src/game/questData.js';
import { applyQuestEvent, deserializeQuestState } from '../../src/game/questState.js';
const caster = {classId:'mage',gold:20000,spellPoints:1000,maxSpellPoints:1000,health:20,maxHealth:100,attributes:{strength:50},level:1,knownSpells:[]};
const heal={name:'Heal',points:5,target:'self',effects:[{kind:'heal',power:10}],codes:[]};
const lib={byName:new Map([['heal',heal]])};
test('Orgnum’s Coffer pays once per day, persists its total and exhausts at exactly 10,000 gold',()=>{
  let c={gold:0};
  for(let day=1;day<=100;day++){
    const r=useOrgnumsCoffer(c,day,100);assert.ok(r.ok);assert.equal(r.exhausted,day===100);
    c=JSON.parse(JSON.stringify(r.character));assert.equal(useOrgnumsCoffer(c,day,1).ok,false);
  }
  assert.equal(c.gold,10000);assert.equal(c.cofferGold,10000);assert.equal(useOrgnumsCoffer(c,101,100).ok,false);
  const last=useOrgnumsCoffer({gold:3,cofferGold:9999},102,100);assert.equal(last.gold,1);assert.equal(last.character.gold,4);assert.ok(last.exhausted);
  for(const roll of [0,101,NaN,1.5])assert.equal(useOrgnumsCoffer({},1,roll).ok,false);
});
test('custom spells validate, charge, persist and actually cast',()=>{
  const result=makeSpell(caster,lib,{name:'Mending',effects:[{spell:'Heal',power:20}]});
  assert.ok(result.ok);assert.equal(result.cost,20);assert.equal(result.character.gold,19980);
  const saved=JSON.parse(JSON.stringify(result.character));
  const cast=applySpell(saved.customSpells[0],{character:saved});
  assert.ok(cast.ok);assert.ok(cast.character.health>20);assert.equal(cast.character.spellPoints,990);
  assert.equal(makeSpell({...caster,spellPoints:null},lib,{name:'x',effects:[{spell:'Heal'}]}).ok,false);
  assert.equal(makeSpell({...caster,customSpells:Array(32).fill({name:'old'})},lib,{name:'x',effects:[{spell:'Heal'}]}).ok,false);
  assert.equal(makeSpell(caster,lib,{name:'x',effects:Array(4).fill({spell:'Heal'})}).ok,false);
  for(const power of [NaN,Infinity,-1,101,1.5])assert.equal(makeSpell(caster,lib,{name:'x',effects:[{spell:'Heal',power}]}).ok,false);
});
test('all 16 artifacts are real pack records and equipment equips its original base',()=>{
  assert.equal(ARTIFACTS.length,16);assert.equal(new Set(ARTIFACTS.map(a=>a.id)).size,16);
  for(const a of ARTIFACTS){const item=itemById(a.id);assert.ok(item?.artifact);let bag=addToBag([],a.id);assert.equal(bag[0].id,a.id);
    if(a.base){const eq=equipFromBag({...caster,classId:'warrior'},bag,a.id);assert.ok(eq.ok);if(item.kind==='weapon')assert.equal(eq.character.weapon,item.weapon);}
    assert.equal(sellItem(caster,bag,a.id,{kind:'equipment'}).ok,false);
    if(a.powers.length){const spell=artifactSpell(a,1);const cast=applySpell(spell,{character:{...caster,knownSpells:[a.name]}});assert.ok(cast.ok,a.name);assert.ok(!cast.note.includes('nothing in this build carries it out'),a.name);}
  }
});
test('artifact class restrictions apply to both equipment and activated powers',()=>{
  assert.equal(canUseArtifact({classId:'mage'},'chrysamere'),false);
  assert.equal(canUseArtifact({classId:'mage'},'staff-of-magnus'),true);
  assert.equal(canUseArtifact({classId:'bard'},'auriels-shield'),true);
  assert.equal(canUseArtifact({classId:'bard'},'spell-breaker'),false);
  assert.equal(canUseArtifact({classId:'mage'},'ring-of-khajiit'),true);
  assert.equal(equipFromBag(caster,addToBag([],'ebony-mail'),'ebony-mail').ok,false);
  assert.equal(equipFromBag({...caster,classId:'warrior'},addToBag([],'ebony-mail'),'ebony-mail').ok,true);
});
test('repair removes equipment from use, charges once, waits and returns at the same smith',()=>{
  let c=wearEquipment({...caster,weapon:'longsword',weaponItem:'steel-longsword'},'steel-longsword',40);
  const bag=addToBag([],'steel-longsword');const quote=repairQuote(c,'steel-longsword',5);assert.ok(quote.cost>0);
  const order=orderRepair(c,bag,'steel-longsword',3,5,'smith-A');assert.ok(order.ok);assert.equal(order.bag.length,0);assert.equal(order.character.weapon,'fists');assert.equal(order.character.gold,c.gold-quote.cost);
  const saved=JSON.parse(JSON.stringify(order.character));assert.equal(collectRepairs(saved,[],7,'smith-A').count,0);assert.equal(collectRepairs(saved,[],8,'smith-B').count,0);
  const ready=collectRepairs(saved,[],8,'smith-A');assert.equal(ready.count,1);assert.equal(ready.bag[0].id,'steel-longsword');assert.equal(ready.character.itemCondition['steel-longsword'],100);assert.equal(collectRepairs(ready.character,ready.bag,9,'smith-A').count,0);
});
test('enchant extension rejects leather, artifacts and duplicate stack identities',()=>{
  assert.equal(enchantEquipment(caster,addToBag([],'leather-cuirass'),'leather-cuirass',heal).ok,false);
  assert.equal(enchantEquipment(caster,addToBag([],'chrysamere'),'chrysamere',heal).ok,false);
  assert.equal(enchantEquipment(caster,addToBag([],'steel-longsword',2),'steel-longsword',heal).ok,false);
  const r=enchantEquipment(caster,addToBag([],'steel-longsword'),'steel-longsword',heal);assert.ok(r.ok);assert.equal(r.character.itemCharges['steel-longsword'],100);assert.equal(JSON.parse(JSON.stringify(r.character)).enchantments['steel-longsword'].name,'Heal');
});
test('artifact jewelry and unique armor use listed passive ratings',()=>{
  assert.equal(armourOn({jewelry:{amulet:'necromancers-amulet'}},'head'),9);
  assert.equal(itemById('auriels-shield').armour,3);
  assert.equal(itemById('ebony-mail').armour,9);
  assert.equal(itemById('lords-mail').armour,9);
  assert.equal(itemById('spell-breaker').armour,4);
});
test('repair can recharge worn magic, but not recharge Orgnum’s coffer',()=>{
  assert.ok(repairQuote({...caster,itemCharges:{chrysamere:0}},'chrysamere'));
  assert.equal(repairQuote({...caster,itemCondition:{'king-orgnums-coffer':0}},'king-orgnums-coffer'),null);
});
test('quest floor tables retain Stonekeep and Labyrinthian exceptions',()=>{
  assert.deepEqual(STAFF_PICKUP_LEVELS,[1,0,1,2,3,3,1,2]);
  assert.deepEqual(CLUE_PICKUP_LEVELS,[0,1,1,2,1,1,1,1]);
});
test('Skeleton’s Key palace access survives saving and bypasses only the Mithril Key requirement',()=>{
  const state=deserializeQuestState({step:9,pieces:8,skeletonKey:true,log:[],visited:[]});
  assert.ok(state.skeletonKey);
  const result=applyQuestEvent(state,'jewelOfFire',{chain:{stages:Array(9).fill({}).concat({kind:'finale'})}});
  assert.ok(result.ok);assert.ok(result.state.hasKeyItem);assert.equal(result.state.mithrilKey,false);
});
test('smith shelf keeps arrows in bounded seeded stock',()=>{for(let seed=1;seed<100;seed++){const s=stockFor('equipment',{level:3,seed});assert.ok(s.items.length<=10);assert.ok(s.items.some(r=>r.item.ammo));assert.ok(s.items.every(r=>r.qty>=1&&r.qty<=3));}});
test('original fourth-floor key, Jewel and lava lake are present without generating a replacement',async()=>{
  const data=new ArenaData(nodeSource(process.env.ARENA_PATH||'C:/ArenaProject/arena/ARENA'));const m=await data.mif('IMPPAL.MIF');assert.equal(m.levels.length,4);
  const level=decodeLevel(m.levels[3],await data.inf(m.levels[3].info),{width:m.width,depth:m.height});const chambers=palaceChambers(level);assert.deepEqual([chambers.key.x,chambers.key.z],[25,26]);assert.deepEqual([chambers.jewel.x,chambers.jewel.z],[24,20]);assert.equal(level.cells.filter(c=>c.floor.chasm==='lava').length,452);
});
