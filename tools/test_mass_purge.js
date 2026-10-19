'use strict';
// Válvulas de purga (stun da massa nos descansos) e a rota SELO, que segura a massa só até o exaustor.
const assert=require('node:assert/strict');
const h=require('./_navigation_harness.js')(),{G,THREE,game:g,world:w,p,mass}=h;
const tests=[];const test=(n,f)=>tests.push([n,f]);
const PURGE=G('PURGE'), SEAL=G('SEAL'), EXHAUST=G('EXHAUST');
const msgs=[]; g.ui={msg(t){ msgs.push(t); }}; g.audio=new Proxy({},{get:()=>()=>{}}); g.fx={spawn(){}}; g.items={}; g.score={onPuzzle(){}};
g.puzzles=new (G('PuzzleSystem'))(g);
const ctx=()=>({game:g,world:w,ui:g.ui,audio:g.audio,player:p,fx:g.fx,items:g.items,hit:{distance:1,point:new THREE.Vector3(),object:{}},normal:new THREE.Vector3(0,0,1)});
function fresh(y=60){ p.reset(); p.position.set(0,y,0); mass.reset(); mass.active=true; g.puzzles.reset(); w.purgeValves.forEach(v=>{ v.recharge=0; }); msgs.length=0; }
function run(sec,dt=.1){ for(let t=0;t<sec-1e-9;t+=dt){ mass.update(dt,100,p); g.puzzles._sealWatch(); w.update(dt,p); } }

test('uma válvula de purga em cada descanso de PURGE.rests',()=>{
  assert.equal(w.purgeValves.length,PURGE.rests.length);
  assert.deepEqual(w.purgeValves.map(v=>v.id).sort(),PURGE.rests.map(r=>'purge:'+r).sort());
  for(const v of w.purgeValves) assert.ok(w.interactables.some(m=>m.userData.interactable===v),`${v.id} sem malha interagível`);
});
test('purga: a massa recua, fica parada PURGE.stun s e volta a subir',()=>{
  fresh(); mass.y=50; const v=w.purgeValves[0];
  assert.equal(v.canInteract(ctx()).prompt,'Válvula de purga: soltar vapor');
  v.interact(ctx()); assert.equal(mass.y,50-PURGE.recoil,'recuo'); assert.ok(mass.stunned);
  run(PURGE.stun-1); assert.equal(mass.y,50-PURGE.recoil,'parada durante o stun'); assert.equal(mass.speed,0);
  run(2); assert.ok(!mass.stunned&&mass.y>50-PURGE.recoil,'voltou a subir depois do stun');
});
test('purga reutilizável: recarrega em PURGE.recharge s (e recusa antes)',()=>{
  fresh(); const v=w.purgeValves[1]; v.interact(ctx()); assert.ok(!v.ready);
  run(PURGE.stun+1); const y0=mass.y; msgs.length=0; v.interact(ctx());
  assert.ok(!mass.stunned&&mass.y===y0,'acionar recarregando não atordoa'); assert.match(msgs[0],/enchendo/);
  assert.match(v.canInteract(ctx()).prompt,/recarregando/);
  run(PURGE.recharge-PURGE.stun); assert.ok(v.ready,'pronta depois da recarga'); v.interact(ctx()); assert.ok(mass.stunned);
});
test('recarga maior que o stun: ficar parado ao lado da válvula ainda perde terreno',()=>assert.ok(PURGE.recharge>PURGE.stun));
test('purga dentro de uma ala contida não puxa a massa abaixo da contenção nem a solta',()=>{
  fresh(); mass.setHold(94,.6); mass.y=94; w.purgeValves[0].interact(ctx()); assert.equal(mass.y,94); run(1); assert.equal(mass.y,94); assert.ok(mass.hold);
});
test('SELO: congelada, a massa não sobe até a contenção das alas seguintes',()=>{
  fresh(); mass.y=90; g.puzzles.commitRoute('seal'); assert.ok(mass.frozen);
  mass.setHold(EXHAUST.H-6,10); run(5); assert.equal(mass.y,90,'subiu até a contenção mesmo selada');
});
test('SELO: range na galeria e rompe acima das pás do exaustor; volta a subir a SEAL.scale',()=>{
  fresh(); mass.y=90; g.puzzles.commitRoute('seal'); msgs.length=0;
  p.position.y=SEAL.warnY-1; run(1); assert.equal(msgs.length,0);
  p.position.y=SEAL.warnY+.5; run(1); assert.ok(mass.frozen,'ainda selada'); assert.match(msgs.join(' '),/gemendo/);
  p.position.y=SEAL.breakY+.1; run(.1); assert.ok(!mass.frozen,'rompeu'); assert.equal(mass.scale,SEAL.scale); assert.match(msgs.join(' '),/não conseguiu conter/);
  const y0=mass.y; run(2); assert.ok(mass.y>y0,'subindo de novo');
  assert.ok(SEAL.breakY>EXHAUST.fan.y&&SEAL.breakY<=EXHAUST.top,'ruptura entre as pás e o braço de 174 m');
});
test('outras rotas não rompem nada no exaustor',()=>{
  fresh(); g.puzzles.commitRoute('commune'); p.position.y=SEAL.breakY+1; run(.5); assert.equal(mass.scale,.45);
});

let fails=0;for(const [n,f] of tests){try{f();console.log('OK  ',n);}catch(e){fails++;console.log('FAIL',n,'-',e.message);}}
console.log(`${tests.length} testes; falhas: ${fails}`);process.exit(fails?1:0);
