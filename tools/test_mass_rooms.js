'use strict';
// A massa nas salas laterais: ela pega quem está abaixo da superfície em qualquer lugar (poço, sala secreta, ramais);
// salas com contenção seguram a massa abaixo do piso; o HUD mede a distância real; a superfície entra nas salas.
const assert=require('node:assert/strict');
const h=require('./_navigation_harness.js')(),{G,THREE,game:g,world:w,p,mass}=h;
const tests=[];const test=(n,f)=>tests.push([n,f]);
// mesmas zonas que o Game entrega à massa (Game._zones)
mass.safeZones=Object.values(w.puzzleRooms).flatMap(r=>[r.zoneRoom,r.zoneDuct,...(r.zones||[])].filter(Boolean));
const zoneCenter=z=>new THREE.Vector3((z.minX+z.maxX)/2,z.minY+.4,(z.minZ+z.maxZ)/2);
const inSecret=()=>{const z=w.puzzleRooms.secret0.zoneRoom;return new THREE.Vector3((z.minX+z.maxX)/2,0,(z.minZ+z.maxZ)/2);};
function place(q){p.reset();p.position.copy(q);mass.reset();}
function run(seconds,dt=1/30){for(let t=0;t<seconds;t+=dt) mass.update(dt,30,p);}

test('sala secreta: fica e a massa sobe → morre',()=>{
  place(inSecret()); assert.ok(Math.hypot(p.position.x,p.position.z)>SHAFT(),'jogador fora do poço');
  mass.active=true; mass.y=-1; run(1); assert.equal(mass.caught,false,'massa abaixo do piso não pega');
  mass.y=p.position.y+.5; run(.1); assert.equal(mass.caught,true,'massa acima dos pés da sala secreta deveria pegar');
});
test('sala secreta, simulação real: entrar no começo e esperar termina em morte',()=>{
  place(inSecret()); let t=0; while(!mass.caught&&t<600){ mass.update(1/10,t,p); t+=.1; }
  assert.equal(mass.caught,true,`ainda vivo após ${t.toFixed(0)} s com a massa em ${mass.y.toFixed(1)} m`);
});
test('todas as salas/ramais: massa acima dos pés pega',()=>{
  const bad=[];
  for(const [id,r] of Object.entries(w.puzzleRooms)){ if(!r.zoneRoom) continue; const q=zoneCenter(r.zoneRoom); q.y=r.zoneRoom.minY+.2;
    place(q); mass.active=true; mass.y=q.y+.6; if(!mass.reaches(p)) bad.push(id); }
  assert.deepEqual(bad,[],'salas onde a massa acima dos pés não pega');
});
test('sala acima da massa continua segura',()=>{
  for(const r of Object.values(w.puzzleRooms)){ if(!r.zoneRoom) continue; const q=zoneCenter(r.zoneRoom); q.y=r.zoneRoom.minY+.2;
    place(q); mass.active=true; mass.y=q.y-2; assert.equal(mass.reaches(p),false); }
});
test('contenção de puzzle: massa presa abaixo do piso, quem está na sala não morre',()=>{
  const r=Object.values(w.puzzleRooms).find(x=>x.cap!=null&&x.zoneRoom); assert.ok(r,'há sala com contenção');
  const q=zoneCenter(r.zoneRoom); q.y=r.baseY; place(q); mass.y=r.baseY-30; mass.setHold(r.cap,2); run(60);
  assert.ok(mass.y<=r.cap+1e-9,'massa passou do teto da contenção'); assert.equal(mass.caught,false);
});
test('distância no HUD é a real fora do poço (sem piso de 10 m)',()=>{
  place(inSecret()); mass.active=true; mass.y=30; assert.equal(+mass.gap(p).toFixed(3),+(p.position.y-30).toFixed(3));
  mass.y=-5; assert.equal(+mass.gap(p).toFixed(3),5);
});
test('a superfície da massa cobre todas as salas (não é só o cilindro do poço)',()=>{
  const R=mass.surfaceR; assert.ok(R>SHAFT()+1,`surfaceR ${R} ainda é o raio do poço`);
  let far=0; for(const r of Object.values(w.puzzleRooms)){ const z=r.zoneRoom; if(!z) continue;
    for(const x of [z.minX,z.maxX]) for(const zz of [z.minZ,z.maxZ]) far=Math.max(far,Math.hypot(x,zz)); }
  assert.ok(R>=far,`superfície ${R.toFixed(1)} m não alcança a sala mais funda (${far.toFixed(1)} m)`);
  const outer=mass.mesh.geometry.parameters.outerRadius; assert.ok(outer>=far,`malha da superfície com raio ${outer}`);
});
test('sem coluna sólida: nada da massa forma parede vertical do tamanho do poço',()=>{
  const walls=[];mass.mesh.parent&&mass.mesh.parent.children.forEach(o=>{const gp=o.geometry&&o.geometry.parameters; if(o.material===mass.mesh.material&&gp&&gp.height>=10&&gp.openEnded) walls.push(o);});
  assert.equal(walls.length,0,'ainda há coluna cilíndrica da massa');
});
function SHAFT(){return G('SHAFT_R');}

let fails=0;for(const [n,f] of tests){try{f();console.log('OK  ',n);}catch(e){fails++;console.log('FAIL',n,'-',e.message);}}
console.log(`${tests.length} testes; falhas: ${fails}`);process.exit(fails?1:0);
