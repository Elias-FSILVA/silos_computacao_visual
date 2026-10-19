'use strict';
// Posse única de itens entre as mãos (sem duplicar ao trocar de mão) e pilhas esgotadas que somem da mochila.
// Cada teste monta um ItemSystem novo (Inventory/ItemSystem/itemDefs reais; jogador e áudio são dublês).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');
const ctx=vm.createContext({THREE,console,performance,Models:{get(){return null}},HandModel:{BASE_FLAT:[0,0,0]},V3:THREE.Vector3,smooth:x=>x,lerp:(a,b,t)=>a+(b-a)*t,clamp:(x,a,b)=>Math.max(a,Math.min(b,x))});
for(const f of ['js/core/utils.js','js/items/Inventory.js','js/player/Handedness.js','js/items/climbingAxeAsset.js','js/items/itemDefs.js','js/items/ItemSystem.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx,{filename:f});
const fresh=vm.runInContext(`(()=>()=>{
  const msgs=[], hand=()=>({inContact:false,occupied:false,anchor:null,exhausted:false});
  const g={player:{dead:false,effort:0,fatigueFx:0,restored:0,restoreStamina(){this.restored++;},hands:[],handModels:[{socket:new THREE.Group()},{socket:new THREE.Group()}]},
    audio:{equip(){},holster(){},deny(){},swing(){},pill(){}},ui:{msg(t){msgs.push(t);}},interaction:{itemTarget(){return null}}};
  g.player.leftHand=hand(); g.player.rightHand=hand(); g.player.hands=[g.player.leftHand,g.player.rightHand];
  const it=new ItemSystem(g); g.items=it;
  return {g,it,inv:it.inv,msgs};
})()`,ctx);
const tick=(it,s=1,dt=1/60)=>{for(let i=0;i<Math.round(s/dt);i++) it.update(dt);};
const holders=(it,id)=>[it.left,it].filter(h=>h.equipped===id).map(h=>h===it?'right':'left');
const meshes=it=>[it.left,it].filter(h=>h.mesh).length;
let failures=0,total=0;
function test(name,fn){total++;try{fn(fresh());console.log('OK',name)}catch(e){failures++;console.error('FAIL',name,e.message)}}

// ---- posse única ----
test('martelo na esquerda, revinculado à direita e selecionado: muda de mão, não duplica',({it,inv})=>{
  inv.add('hammer'); inv.bind(0,'hammer'); it.selectQuick(0); tick(it);
  assert.deepEqual(holders(it,'hammer'),['left']);
  assert.equal(inv.bind(2,'hammer'),true); it.selectQuick(2); tick(it);
  assert.deepEqual(holders(it,'hammer'),['right'],'um único martelo, agora na direita');
  assert.equal(meshes(it),1,'um único modelo visível');
  assert.equal(it.left.phase,'empty'); assert.equal(it.left.hand.occupied,false);
});
test('pilha (pregos) segurada numa mão e escolhida na outra pelo seletor explícito (VR): não duplica',({it,inv})=>{
  inv.add('nails',3); inv.bind(2,'nails'); it.selectQuick(2); tick(it);
  const i=inv.slotOf('nails'); it.select(i,'left'); tick(it);
  assert.deepEqual(holders(it,'nails'),['left']); assert.equal(meshes(it),1);
  assert.equal(inv.count('nails'),3,'nenhuma unidade criada ou perdida');
});
test('troca de mão com a outra mão ocupada por outro item: guarda o item antigo e pega o transferido',({it,inv})=>{
  inv.add('hammer'); inv.add('pills',2); inv.bind(0,'hammer'); inv.bind(2,'pills');
  it.selectQuick(0); it.selectQuick(2); tick(it);
  inv.bind(3,'hammer'); it.selectQuick(3); tick(it,2);
  assert.deepEqual(holders(it,'hammer'),['right']); assert.deepEqual(holders(it,'pills'),[]);
  assert.equal(meshes(it),1);
});
test('a outra mão no meio do uso (golpe): a troca é recusada e o item continua só nela',({it,inv,msgs})=>{
  inv.add('hammer'); inv.bind(0,'hammer'); it.selectQuick(0); tick(it);
  it.useHand('left',true); assert.equal(it.left.phase,'swing'); it.useHand('left',false);
  inv.bind(2,'hammer'); it.selectQuick(2); tick(it,.05);
  assert.deepEqual(holders(it,'hammer'),['left']); assert.ok(msgs.some(m=>/esquerda/i.test(m)),'explica por que não trocou: '+msgs.join(' | '));
});
test('mesma mão: selecionar o item já empunhado continua guardando (comportamento existente)',({it,inv})=>{
  inv.add('hammer'); inv.bind(2,'hammer'); it.selectQuick(2); tick(it); it.selectQuick(2); tick(it);
  assert.deepEqual(holders(it,'hammer'),[]); assert.equal(inv.count('hammer'),1);
});
test('picareta (perHand) segue podendo estar nas duas mãos',({it,inv})=>{
  inv.add('climbing_axe',2); inv.bind(0,'climbing_axe'); inv.bind(2,'climbing_axe'); it.selectQuick(0); it.selectQuick(2); tick(it);
  assert.deepEqual(holders(it,'climbing_axe').sort(),['left','right']);
});

// ---- esgotados somem ----
test('última pílula consumida na mão: a entrada some, o atalho é limpo e a mão esvazia',({it,inv,g})=>{
  inv.add('pills',1); inv.bind(2,'pills'); it.selectQuick(2); tick(it); it.useHand('right',true); it.useHand('right',false); tick(it);
  assert.equal(g.player.restored,1);
  assert.equal(inv.slotOf('pills'),-1,'sem entrada "×0"'); assert.equal(inv.slots.some(s=>s&&s.count<=0),false);
  assert.equal(inv.binds[2],null,'atalho liberado');
  assert.equal(it.equipped,null); assert.equal(it.phase,'empty'); assert.equal(it.sel,-1); assert.equal(it.mesh,null); assert.equal(it.hand.occupied,false);
});
test('Q com a última pílula (sem equipar): a entrada some e o atalho é limpo',({it,inv})=>{
  inv.add('pills',1); inv.bind(1,'pills'); it.quick('pills');
  assert.equal(inv.slotOf('pills'),-1); assert.equal(inv.binds[1],null);
});
test('último prego gasto (Inventory.take): a entrada some; pilha parcial continua',({inv})=>{
  inv.add('nails',2); inv.bind(3,'nails');
  assert.equal(inv.take('nails'),true); assert.equal(inv.count('nails'),1); assert.equal(inv.binds[3],'nails');
  assert.equal(inv.take('nails'),true); assert.equal(inv.slotOf('nails'),-1); assert.equal(inv.binds[3],null);
  assert.equal(inv.take('nails'),false,'nada a tirar');
});
test('esgotado e coletado de novo: volta como entrada nova, vinculável',({it,inv})=>{
  inv.add('pills',1); it.quick('pills'); assert.equal(inv.slotOf('pills'),-1);
  const r=inv.receive('pills',2); assert.equal(r.accepted,2); assert.equal(inv.count('pills'),2); assert.equal(inv.bind(0,'pills'),true);
});
test('mão segurando a pilha que esgota por fora (ex.: prego colocado): esvazia ao terminar, sem modelo órfão',({it,inv})=>{
  inv.add('nails',1); inv.bind(0,'nails'); it.selectQuick(0); tick(it); inv.take('nails'); tick(it,.1);
  assert.equal(it.left.equipped,null); assert.equal(it.left.phase,'empty'); assert.equal(meshes(it),0);
});

console.log(`${total} testes; falhas: ${failures}`);if(failures)process.exitCode=1;
