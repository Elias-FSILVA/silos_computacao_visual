'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');
const ctx=vm.createContext({THREE,console,performance,Models:{get(){return null}},HandModel:{BASE_FLAT:[0,0,0]},V3:THREE.Vector3,smooth:x=>x,lerp:(a,b,t)=>a+(b-a)*t,clamp:(x,a,b)=>Math.max(a,Math.min(b,x))});
for(const f of ['js/core/utils.js','js/items/Inventory.js','js/player/Handedness.js','js/items/itemDefs.js','js/items/ItemSystem.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx,{filename:f});
const run=vm.runInContext(`(()=>{
 const g={player:{dead:false,rightHand:{inContact:false,occupied:false},leftHand:{inContact:false,occupied:false},hands:[],handModels:[{socket:new THREE.Group()},{socket:new THREE.Group()}]},audio:{equip(){},holster(){},deny(){},swing(){},pill(){}},ui:{msg(){}},interaction:{itemTarget(){return null}}};
 g.player.hands=[g.player.leftHand,g.player.rightHand]; g.player.handModels.forEach(h=>h.socket=new THREE.Group());
 const it=new ItemSystem(g); g.items=it;
 it.inv.add('hammer'); it.inv.add('pills',2); it.inv.add('card'); it.inv.bind(0,'hammer'); it.inv.bind(1,'card'); it.inv.bind(2,'pills');
 return {g,it};
})()`,ctx);
let failures=0,total=0;
function test(name,fn){total++;try{fn();console.log('OK',name)}catch(e){failures++;console.error('FAIL',name,e.message)}}
test('quick slots map 1-2 left, 3-4 right',()=>{const {it}=run;assert.equal(it.handForQuick(0),'left');assert.equal(it.handForQuick(1),'left');assert.equal(it.handForQuick(2),'right');assert.equal(it.handForQuick(3),'right')});
test('each hand can equip its own item simultaneously',()=>{const {it,g}=run;it.selectQuick(0);it.selectQuick(2);assert.equal(it.equippedFor('left'),'hammer');assert.equal(it.equippedFor('right'),'pills');assert.equal(g.player.leftHand.occupied,true);assert.equal(g.player.rightHand.occupied,true)});
test('switching slots on one side leaves the other hand equipped',()=>{const {it}=run;it.selectQuick(0);it.selectQuick(2);it.left.phase='idle';it.phase='idle';it.selectQuick(1);assert.equal(it.left.next,2);assert.equal(it.equippedFor('right'),'pills');assert.equal(it.sel,1)});
test('using each hand dispatches only its own equipped item',()=>{const {it}=run;it.selectQuick(0);it.selectQuick(2);it.left.phase='idle';it.phase='idle';it.useHand('left',true);assert.equal(it.phaseFor('left'),'swing');assert.equal(it.phaseFor('right'),'idle');it.useHand('right',true);assert.equal(it.phaseFor('right'),'consume')});
test('holstering a hand leaves the other equipped item untouched',()=>{const {it}=run;it.selectQuick(0);it.selectQuick(2);it.holsterHand('left');assert.equal(it.equippedFor('left'),'hammer');assert.equal(it.equippedFor('right'),'pills');assert.equal(it.phaseFor('left'),'holstering')});
console.log(`${total} testes; falhas: ${failures}`);if(failures)process.exitCode=1;
