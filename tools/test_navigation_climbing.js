'use strict';
const assert=require('node:assert/strict');
const h=require('./_navigation_harness')(),{G,THREE,world:w,game:g,p}=h;
for(const f of ['js/systems/ProgressionGuard.js','js/systems/PresenceObservers.js'])h.load(f);
const V=(x,y,z)=>new THREE.Vector3(x,y,z),Guard=G('ProgressionGuard'),EYE=G('EYE');
function hang(pl,x=0,y=10,z=0){
  pl.reset();pl.trackNormalMotion=true;pl.position.set(x,y,z);pl._prev.copy(pl.position);pl.grounded=false;pl.yaw=0;pl.pull=pl.pullTarget=0;pl.velocity.set(0,0,0);
  const hand=pl.leftHand;Object.assign(hand,{surface:{userData:{alive:true}},inContact:true,isGrabbing:true,anchor:'hand'});
  hand.normal.set(0,0,1);hand.point.copy(pl.position).add(V(0,EYE+.97,-.5));
}
const isolated=()=>{const pl=h.realPlayer();hang(pl);return pl;};
const sample=(x)=>({inside:x>=-1&&x<=.12,values:{inside:x>=-1&&x<=.12},contains:(q,m=0)=>q.x>=-1-m&&q.x<=.12+m});
let n=0,bad=0;function test(name,f){n++;try{f();console.log('OK',name);}catch(e){bad++;console.error('FAIL',name,e.stack);}}
test('A-R1: escalada lateral física cruza histerese em vários frames e rearma no retorno',()=>{
  const pl=isolated(),guard=new Guard();guard.discontinue(new Map([['region',sample(2)]]),new Map([['region',sample(0)]]));
  for(let i=0;i<10;i++){pl.update(.02,{x:1,y:0});guard.advance(new Map([['region',sample(pl.position.x)]]),pl.consumeNormalMotion());}
  assert.ok(pl.position.x>.14,'saída física além da histerese');
  assert.equal(guard.protectedTriggers()[0]?.phase,'need-entry','escalada deve concluir saída, não perder testemunha entre frames');
  for(let i=0;i<30;i++){pl.update(.02,{x:-1,y:0});guard.advance(new Map([['region',sample(pl.position.x)]]),pl.consumeNormalMotion());}
  assert.equal(guard.isProtected('region'),false,'retorno voluntário libera a presença');
});
test('A-R1: limite real h1 reconhece saída/reentrada por escalada, sem stepBy',()=>{
  g.checkpoints=new (G('CheckpointSystem'))(w);g.puzzles={puzzles:[new (G('HallPuzzle'))(g,w.puzzleRooms.h1)]};
  p.reset();p.position.set(10,104,1.8);g.presence=new (G('PresenceObservers'))(g);const before=g.presence.sample();
  hang(p,15.12,104,1.8);g.presence.guard.discontinue(before,g.presence.sample());g.presence.update();
  for(let i=0;i<10;i++){p.update(.02,{x:-1,y:0});g.presence.update(p.consumeNormalMotion());}
  assert.ok(p.position.x<14.98,'corpo saiu da região real h1');
  assert.equal(g.presence.guard.protectedTriggers().find(t=>t.id==='hall:h1')?.phase,'need-entry');
  for(let i=0;i<30;i++){p.update(.02,{x:1,y:0});g.presence.update(p.consumeNormalMotion());}
  assert.equal(g.presence.guard.isProtected('hall:h1'),false);
});
test('A-R1: puxada vertical voluntária cruza histerese em vários frames',()=>{
  const pl=isolated(),guard=new Guard(),at=y=>({inside:y<=10.12,values:{inside:y<=10.12},contains:(q,m=0)=>q.y<=10.12+m});
  guard.discontinue(new Map([['vertical',at(12)]]),new Map([['vertical',at(10)]]));
  for(let i=0;i<30;i++){pl.pullIn=8;pl.update(.02,{x:0,y:0});guard.advance(new Map([['vertical',at(pl.position.y)]]),pl.consumeNormalMotion());}
  assert.ok(pl.position.y>10.14,'puxada moveu corpo além da histerese');assert.equal(guard.protectedTriggers()[0]?.phase,'need-entry');
});
test('A-R1 tether: saída e retorno com braço no limite mantêm testemunha contínua',()=>{
  const pl=isolated(),guard=new Guard(),at=z=>({inside:z>=-1&&z<=.12,values:{inside:z>=-1&&z<=.12},contains:(q,m=0)=>q.z>=-1-m&&q.z<=.12+m});
  pl.yaw=-Math.PI/2;guard.discontinue(new Map([['tether',at(2)]]),new Map([['tether',at(0)]]));
  let constrained=false;
  for(let i=0;i<10;i++){pl.update(.02,{x:1,y:0});constrained=constrained||Math.abs(pl.eyePos(new THREE.Vector3()).distanceTo(pl.leftHand.point)-1.15)<1e-9;guard.advance(new Map([['tether',at(pl.position.z)]]),pl.consumeNormalMotion());}
  assert.equal(constrained,true,'restrição física de 1,15 m foi ativada');assert.ok(pl.position.z>.14,'corpo saiu além da histerese');
  assert.equal(guard.protectedTriggers()[0]?.phase,'need-entry','projeção do braço não pode perder testemunha');
  for(let i=0;i<30;i++){pl.update(.02,{x:-1,y:0});guard.advance(new Map([['tether',at(pl.position.z)]]),pl.consumeNormalMotion());}
  assert.equal(guard.isProtected('tether'),false,'retorno normal conclui rearme');
});
test('A-R1 tether: observador h1 reconhece cruzamento com braço esticado',()=>{
  g.checkpoints=new (G('CheckpointSystem'))(w);g.puzzles={puzzles:[new (G('HallPuzzle'))(g,w.puzzleRooms.h1)]};
  p.reset();p.position.set(10,104,1.8);g.presence=new (G('PresenceObservers'))(g);const before=g.presence.sample();
  hang(p,15.12,104,1.8);p.yaw=Math.PI;p.leftHand.normal.set(-1,0,0);p.leftHand.point.copy(p.position).add(V(.5,EYE+.97,0));
  g.presence.guard.discontinue(before,g.presence.sample());g.presence.update();let constrained=false;
  for(let i=0;i<10;i++){p.update(.02,{x:1,y:0});constrained=constrained||Math.abs(p.eyePos(new THREE.Vector3()).distanceTo(p.leftHand.point)-1.15)<1e-9;g.presence.update(p.consumeNormalMotion());}
  assert.equal(constrained,true);assert.ok(p.position.x<14.98,'corpo saiu da região real');
  assert.equal(g.presence.guard.protectedTriggers().find(t=>t.id==='hall:h1')?.phase,'need-entry');
  for(let i=0;i<30;i++){p.update(.02,{x:-1,y:0});g.presence.update(p.consumeNormalMotion());}
  assert.equal(g.presence.guard.isProtected('hall:h1'),false);
});
test('tracking da mola não muda posição, velocidade, stamina ou puxada na escalada',()=>{
  const a=isolated(),b=isolated();b.trackNormalMotion=false;
  for(let i=0;i<80;i++){a.pullIn=b.pullIn=i<12?2:0;const input={x:i<20?1:i<50?-1:0,y:0};a.update(.02,input);b.update(.02,input);assert.ok(a.position.distanceTo(b.position)<1e-12);assert.ok(a.velocity.distanceTo(b.velocity)<1e-12);assert.equal(a.stamina,b.stamina);assert.equal(a.pull,b.pull);}
});
test('tracking sob tether ativo não altera a física nem cria locomoção passiva',()=>{
  const a=isolated(),b=isolated();a.yaw=b.yaw=-Math.PI/2;b.trackNormalMotion=false;let constrained=false;
  for(let i=0;i<80;i++){const input={x:i<20?1:i<50?-1:0,y:0};a.update(.02,input);b.update(.02,input);constrained=constrained||Math.abs(a.eyePos(new THREE.Vector3()).distanceTo(a.leftHand.point)-1.15)<1e-9;assert.ok(a.position.distanceTo(b.position)<1e-12);assert.ok(a.velocity.distanceTo(b.velocity)<1e-12);assert.equal(a.stamina,b.stamina);assert.equal(a.pull,b.pull);}
  assert.equal(constrained,true);
  const passive=isolated();passive.position.z=.3;passive._prev.copy(passive.position);let tethered=false;
  for(let i=0;i<30;i++){passive.update(.02,{x:0,y:0});tethered=tethered||Math.abs(passive.eyePos(new THREE.Vector3()).distanceTo(passive.leftHand.point)-1.15)<1e-9;assert.equal(passive.consumeNormalMotion().segments.length,0);}
  assert.equal(tethered,true,'mola passiva também exercita restrição real');
});
test('mola inicialmente deslocada, sem input, nunca emite evidência',()=>{
  const pl=isolated();pl.leftHand.point.x=.3;for(let i=0;i<40;i++){pl.update(.02,{x:0,y:0});assert.equal(pl.consumeNormalMotion().segments.length,0);}
  assert.ok(pl.position.x>.14,'movimento da mola ocorreu, sem autorizar rearme');
});
test('ventilador real opera e desloca corpo sem produzir evidência normal',()=>{
  p.reset();p.trackNormalMotion=true;const f=w.fans.find(f=>f.mode==='push');p.position.set(f.pos.x,246,f.pos.z);p._prev.copy(p.position);p.grounded=false;const from=p.position.clone();let wind=false;
  for(let i=0;i<20;i++){p.update(.02,{x:0,y:0});wind=wind||p.windLevel>0;assert.equal(p.consumeNormalMotion().segments.length,0);}
  assert.equal(wind,true,'coluna de ar real ativa');assert.ok(p.position.distanceTo(from)>.02,'não é teste de ar parado');assert.equal(p.dead,false);
});
test('elevador real transporta corpo sem rearmar presença por altura',()=>{
  p.reset();p.trackNormalMotion=true;const el=w.elevator,guard=new Guard(),at=y=>({inside:y<200.12,values:{inside:y<200.12},contains:(q,m=0)=>q.y<200.12+m});
  p.position.set((el.pd.minX+el.pd.maxX)/2,el.pd.top,(el.pd.minZ+el.pd.maxZ)/2);p._prev.copy(p.position);guard.discontinue(new Map([['lift',at(201)]]),new Map([['lift',at(200)]]));assert.equal(el.start(),true);
  for(let i=0;i<140;i++){el.update(.02,p);p.update(.02,{x:0,y:0});const motion=p.consumeNormalMotion();assert.equal(motion.segments.length,0);guard.advance(new Map([['lift',at(p.position.y)]]),motion);}
  assert.ok(p.position.y>200.14,'cabine efetivamente levou o jogador');assert.equal(guard.protectedTriggers()[0]?.phase,'need-exit');
});
test('novo agarre apaga toda a contribuição acumulada da mola anterior',()=>{
  const pl=isolated();for(let i=0;i<12;i++){pl.pullIn=8;pl.update(.02,{x:1,y:0});pl.consumeNormalMotion();}pl._fitPull();
  for(let i=0;i<20;i++){pl.update(.02,{x:0,y:0});assert.equal(pl.consumeNormalMotion().segments.length,0);}
});
console.log(`${n} testes; falhas: ${bad}`);process.exitCode=bad?1:0;
