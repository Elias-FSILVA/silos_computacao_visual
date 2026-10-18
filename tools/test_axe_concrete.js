'use strict';
// Picareta no concreto: fincada rasa (custo e dreno 2×, solta sozinha) e desgaste por picareta.
// Rocha escura e rachaduras continuam como antes: fincada funda, sem desgaste.
const assert=require('node:assert/strict');
const log=console.log; console.log=()=>{};
const L=require('./_load.js'); console.log=log;
const {world,vm}=L;
let failures=0,total=0;
function test(name,fn){ total++; try{ fn(); log('OK',name); }catch(e){ failures++; console.error('FAIL',name,'-',e.message.split('\n')[0]); } }
const GW=n=>vm.runInThisContext(`typeof ${n}!=='undefined'?${n}:undefined`);
const biteOf=o=>{ const f=GW('axeBiteOf'); if(!f) throw new Error('axeBiteOf is not defined'); return f(o); };

// ---------------------------------------------------------------- superfícies
test('axeBiteOf: rocha e rachadura = deep; concreto que aceita prego = shallow; o resto = null',()=>{
  assert.equal(biteOf({userData:{axe:true,type:'crack'}}),'deep');
  assert.equal(biteOf({userData:{axe:true,type:'rockband'}}),'deep');
  assert.equal(biteOf({userData:{type:'wall',concrete:true}}),'shallow');
  assert.equal(biteOf({userData:{type:'wall',concrete:true,interactable:{kind:'concrete'}}}),'shallow','parede que aceita prego');
  assert.equal(biteOf({userData:{type:'wall',concrete:true,interactable:{}}}),null,'concreto que é puzzle/botão');
  assert.equal(biteOf({userData:{type:'wall',concrete:true,noAxe:true}}),null,'noAxe');
  for(const t of GW('AXE_EXCLUDE_TYPES')) assert.equal(biteOf({userData:{type:t,concrete:true}}),null,t);
  assert.equal(biteOf({userData:{type:'wall'}}),null,'metal/chapa');
  assert.equal(biteOf(null),null); assert.equal(biteOf({}),null);
});
test('isAxeSurface continua só para fincada funda (rotas de rocha intactas)',()=>{
  assert.equal(GW('isAxeSurface')({userData:{type:'wall',concrete:true}}),false);
});
test('mundo: paredes de concreto, tijolo e pedra aceitam a fincada rasa; chapa do poço não',()=>{
  const MAT=GW('MAT'); let shallow=0, liner=0;
  for(const m of world.walls){
    const b=biteOf(m);
    if(m.material===MAT.liner||m.material===MAT.metal||m.material===MAT.grate){ liner++; assert.notEqual(b,'shallow','chapa/grade não'); }
    if(m.material===MAT.concrete||m.material===MAT.concreteCold||m.material===MAT.brick||m.material===MAT.stone){ if(m.userData.type==='wall'&&!m.userData.noAxe&&(!m.userData.interactable||m.userData.interactable.kind==='concrete')){ assert.equal(b,'shallow'); shallow++; } }
  }
  assert.ok(shallow>50,'várias paredes de concreto: '+shallow); assert.ok(liner>0,'há chapa no mundo');
  assert.equal(GW('SURFACE').concrete.kind,'concrete');
});

// ---------------------------------------------------------------- Player
const Hx=require('./_items_harness.js')(['js/interaction/InteractionSystem.js']);
const T3=Hx.THREE, AX='climbing_axe', idle={x:0,y:0};
function surface(kind,y=6.4,normal=[0,0,1]){
  const m=new T3.Mesh(new T3.BoxGeometry(.6,.6,.1)); m.position.set(0,y,0); m.updateMatrixWorld();
  const n=new T3.Vector3(...normal);
  m.userData=kind==='band'?{axe:true,type:'rockband',alive:true,wallNormal:n}
    :kind==='concrete'?{type:'wall',concrete:true,alive:true,wallNormal:n}
    :{type:'wall',alive:true,wallNormal:n};
  return m;
}
function aimAt(p,m){ p.eyePos(p.camera.position); p.camera.lookAt(m.position); p.camera.updateMatrixWorld(); }
function run(p,sec,fps=60){ const n=Math.round(sec*fps); for(let k=0;k<n;k++) p.update(1/fps,idle); }
const near=(a,b,e,msg)=>assert.ok(Math.abs(a-b)<=e,`${msg||''} ${a} ≠ ${b}`);
const AXC=()=>Hx.G('AXE_SHALLOW');

test('AXE_SHALLOW: custo 2×, dreno 2×, solta em 2,5 s; picareta com 10 de durabilidade',()=>{
  assert.deepEqual({...AXC()},{cost:2,drain:2,hold:2.5});
  assert.equal(Hx.G('ITEM_DEFS')[AX].durability,10);
});
test('axeTarget aceita parede de concreto (hit.bite shallow) e recusa piso/teto de concreto',()=>{
  const p=Hx.realPlayer(); const c=surface('concrete'); p.world.raycastTargets=[c]; aimAt(p,c);
  const hit=p.axeTarget(1); assert.ok(hit,'parede'); assert.equal(hit.bite,'shallow');
  const b=surface('band'); p.world.raycastTargets=[b]; aimAt(p,b); assert.equal(p.axeTarget(1).bite,'deep');
  const m=surface('metal'); p.world.raycastTargets=[m]; aimAt(p,m); assert.equal(p.axeTarget(1),null,'chapa');
  const f=surface('concrete',6.4); f.userData.wallNormal=null; f.rotation.x=-Math.PI/2; f.updateMatrixWorld();   // laje: a face atingida olha para cima/baixo
  p.world.raycastTargets=[f]; aimAt(p,f); assert.equal(p.axeTarget(1),null,'piso/teto');
});
test('fincada rasa custa 2 × 5 × gripDrainMultiplier e marca a mão (bite shallow)',()=>{
  for(const [perks,cost] of [[[],10],[['economical_grip'],8.5]]){
    const p=Hx.realPlayer(); perks.forEach(id=>p.attributes.addPerk(id)); const c=surface('concrete'); p.world.raycastTargets=[c]; aimAt(p,c);
    const r=p.anchorAxe(1,p.axeTarget(1)); assert.equal(r.ok,true); assert.equal(r.bite,'shallow');
    near(p.rightHand.stamina,100-cost,1e-9,'custo'); assert.equal(p.rightHand.bite,'shallow');
  }
  const p=Hx.realPlayer(); const c=surface('concrete'); p.world.raycastTargets=[c]; aimAt(p,c); p.rightHand.stamina=9.9;
  const r=p.anchorAxe(1,p.axeTarget(1)); assert.equal(r.reason,'stamina'); assert.equal(p.rightHand.stamina,9.9);
});
test('pendurado: o concreto drena o dobro da rocha',()=>{
  const A=Hx.realPlayer(), B=Hx.realPlayer();
  for(const [p,k] of [[A,'band'],[B,'concrete']]){ const s=surface(k); p.world.raycastTargets=[s]; aimAt(p,s); assert.ok(p.anchorAxe(1,p.axeTarget(1)).ok); p.rightHand.stamina=100; p.grounded=false; }
  run(A,1); run(B,1);
  const dA=100-A.rightHand.stamina, dB=100-B.rightHand.stamina; assert.ok(dA>0); near(dB,2*dA,.05*dA,'dreno');
});
test('a fincada rasa solta sozinha em 2,5 s (axeDislodged + axeSlip, sem exaustão); a rocha segura',()=>{
  const A=Hx.realPlayer(), B=Hx.realPlayer(), ev=[];
  B.on('axeDislodged',()=>ev.push('dislodged')); B.on('axeSlip',()=>ev.push('slip'));
  for(const [p,k] of [[A,'band'],[B,'concrete']]){ const s=surface(k); p.world.raycastTargets=[s]; aimAt(p,s); assert.ok(p.anchorAxe(1,p.axeTarget(1)).ok); p.grounded=false; }
  run(B,2.3); assert.equal(B.rightHand.anchor,'axe','ainda presa em 2,3 s');
  run(A,2.7); run(B,.4);
  assert.equal(A.rightHand.anchor,'axe','rocha segura');
  assert.equal(B.rightHand.inContact,false); assert.equal(B.rightHand.anchor,null); assert.equal(B.rightHand.exhausted,false);
  assert.deepEqual(ev,['dislodged','slip']); assert.equal(B.rightHand.bite,null);
});

// ---------------------------------------------------------------- desgaste (ItemSystem + Inventory)
function axeGame(n=1,kind='concrete'){
  const G0=Hx.makeGame(), {it,p}=G0; it.inv.add(AX,n); it.inv.bind(0,AX); it.inv.bind(2,AX);
  const wall=surface(kind); p.world.raycastTargets=[wall]; aimAt(p,wall); p.grounded=false;
  return {...G0,wall};
}
function ready(it,side){ it.selectQuick(side==='left'?0:2); Hx.settle(side==='left'?it.left:it); assert.equal(it.phaseFor(side),'idle'); }
function frames(it,p,n){ for(let k=0;k<n;k++){ Hx.clock.now+=1000/60; p.update(1/60,idle); it.update(1/60); } }
function bite(it,p,side='right'){ const h=side==='left'?p.leftHand:p.rightHand; h.stamina=100; h.cooldown=0;
  it.useHand(side,true); frames(it,p,12); const ok=it.phaseFor(side)==='anchored'; it.useHand(side,false); frames(it,p,1); return ok; }

test('inventário guarda o desgaste de cada picareta; picareta nova chega inteira',()=>{
  const {it}=axeGame(1); const inv=it.inv;
  assert.equal(inv.durabilityLeft(AX,0),10); assert.equal(inv.addWear(AX,0,3),7); assert.equal(inv.durabilityLeft(AX,0),7);
  inv.add(AX,1); assert.equal(inv.count(AX),2); assert.equal(inv.durabilityLeft(AX,1),10); assert.equal(inv.durabilityLeft(AX,0),7);
  assert.equal(inv.breakUnit(AX,0),true); assert.equal(inv.count(AX),1); assert.equal(inv.durabilityLeft(AX,0),10,'sobrou a nova');
  assert.equal(inv.breakUnit(AX,0),true); assert.equal(inv.has(AX),false,'a última some da mochila'); assert.equal(inv.binds.includes(AX),false);
});
test('cada fincada no concreto gasta 1; na rocha não gasta',()=>{
  const {it,p,g}=axeGame(1,'band'); ready(it,'right');
  assert.equal(bite(it,p),true); assert.equal(it.inv.durabilityLeft(AX,it.unit),10,'rocha');
  const c=surface('concrete'); p.world.raycastTargets=[c]; aimAt(p,c); Hx.audio.calls=[];
  assert.equal(bite(it,p),true); assert.equal(it.inv.durabilityLeft(AX,it.unit),9,'concreto'); assert.ok(Hx.audio.calls.includes('axeChip'),'som próprio da fincada rasa');
});
test('a 10ª fincada segura; ao sair dela a picareta quebra, some e a mão esvazia',()=>{
  const {it,p,msgs}=axeGame(1); ready(it,'right');
  for(let k=0;k<9;k++) assert.equal(bite(it,p),true,'fincada '+(k+1));
  assert.equal(it.inv.durabilityLeft(AX,it.unit),1);
  p.rightHand.stamina=100; it.useHand('right',true); frames(it,p,12); assert.equal(it.phase,'anchored','a última fincada segura');
  assert.equal(it.inv.has(AX),true,'ainda não quebrou');
  Hx.audio.calls=[]; it.useHand('right',false); frames(it,p,1);
  assert.equal(it.inv.has(AX),false); assert.equal(it.equipped,null); assert.equal(it.phase,'empty'); assert.equal(p.rightHand.occupied,false);
  assert.ok(Hx.audio.calls.includes('axeBreak')); assert.ok(msgs.some(m=>/quebrou/i.test(m)),msgs.join('|'));
});
test('gasta quando a fincada rasa solta sozinha também quebra a picareta no fim',()=>{
  const {it,p}=axeGame(1); ready(it,'right'); it.inv.addWear(AX,0,9);
  p.rightHand.stamina=100; it.useHand('right',true); frames(it,p,12); assert.equal(it.phase,'anchored');
  frames(it,p,170); assert.equal(it.inv.has(AX),false,'soltou sozinha e quebrou'); assert.equal(it.equipped,null);
});
test('duas picaretas: o desgaste é de cada uma; quebrar a esquerda não mexe na direita',()=>{
  const {it,p}=axeGame(2); ready(it,'left'); ready(it,'right');
  assert.notEqual(it.left.unit,it.unit,'cada mão segura uma');
  for(let k=0;k<3;k++) assert.equal(bite(it,p,'right'),true);
  const rUnit=it.unit; assert.equal(it.inv.durabilityLeft(AX,rUnit),7);
  it.inv.addWear(AX,it.left.unit,9); assert.equal(bite(it,p,'left'),true);
  assert.equal(it.left.equipped,null,'esquerda quebrou'); assert.equal(it.inv.count(AX),1);
  assert.equal(it.equipped,AX,'direita segue'); assert.equal(it.inv.durabilityLeft(AX,it.unit),7,'desgaste da direita preservado');
});
test('equipar escolhe a picareta menos gasta que a outra mão não segura',()=>{
  const {it}=axeGame(2); it.inv.addWear(AX,0,6); ready(it,'right'); assert.equal(it.unit,1,'pega a inteira');
  ready(it,'left'); assert.equal(it.left.unit,0);
  it.holsterHand('right'); Hx.settle(it); assert.equal(it.unit,-1);
});
test('axeDurability(side): restante e máximo da picareta na mão',()=>{
  const {it}=axeGame(1); ready(it,'right'); it.inv.addWear(AX,it.unit,4);
  assert.deepEqual({...it.axeDurability('right')},{left:6,max:10}); assert.equal(it.axeDurability('left'),null);
});
test('durabilityFor(side): a da mão que segura, ou a que aquela mão pegaria',()=>{
  const {it}=axeGame(2); it.inv.addWear(AX,0,4);
  assert.deepEqual({...it.durabilityFor('left',AX)},{left:10,max:10},'guardadas: pegaria a inteira');
  ready(it,'right'); assert.equal(it.unit,1);
  assert.deepEqual({...it.durabilityFor('right',AX)},{left:10,max:10});
  assert.deepEqual({...it.durabilityFor('left',AX)},{left:6,max:10},'esquerda ficaria com a gasta');
  assert.equal(it.durabilityFor('left','hammer'),null);
});
test('HUD: retículo axe-shallow desenhado (âmbar), diferente de axe',()=>{
  const UI=Hx.G('UIManager'), el={innerHTML:''}, fake={$:()=>el};
  UI.prototype.setReticle.call(fake,'axe'); const a=el.innerHTML;
  UI.prototype.setReticle.call(fake,'axe-shallow'); const b=el.innerHTML;
  assert.match(b,/<path/); assert.notEqual(a,b); assert.match(b,/sodium/);
});
test('retículo: rocha = axe, concreto = axe-shallow, chapa = axe-bad',()=>{
  for(const [kind,want] of [['band','axe'],['concrete','axe-shallow'],['metal','axe-bad']]){
    const {it,p,g}=Hx.makeGame(); it.inv.add(AX,1); it.inv.bind(2,AX); it.selectQuick(2); Hx.settle(it);
    const m=surface(kind); p.world.raycastTargets=[m]; aimAt(p,m);
    const I=new (Hx.G('InteractionSystem'))(g); g.interaction=I; assert.equal(I.query().reticle,want,kind);
  }
});

log(`\n${total} testes; falhas: ${failures}`); process.exit(failures?1:0);
