'use strict';
// Dano por queda e por impacto lateral (Tarefa 2 do plano Health) com o Player e o resolvedor REAIS.
// Arena = mundo de _load.js com sólidos próprios no centro do poço (longe da casca) e vento controlável.
// Regras (spec §11 D3/D4): até 10 m/s nada; 10–16 curva provisória; queda > 16 mata como hoje; lateral > 16 conta 16;
// contato contínuo (andar/escalar/deslizar encostado, vento contra a parede) nunca machuca; impactos em 0,25 s cobram
// só o excedente.
const assert=require('node:assert/strict');
const L=require('./_player.js');
const PH=L.vm.runInThisContext('PlayerHealth'), RAD=L.vm.runInThisContext('RAD'), Elevator=L.vm.runInThisContext('Elevator');
const idle={x:0,y:0};
let total=0,fails=0;
function test(name,fn){total++;try{fn();console.log('OK',name);}catch(e){fails++;console.error('FAIL',name,'\n ',e.message);}}
// registra o maior hitV devolvido pelo resolvedor (o Player chama a função global)
const realCollide=global.collideBody; let maxHit=0, sawHit=false;
global.collideBody=function(...a){ const r=realCollide.apply(this,a); if(r&&typeof r.hitV==='number'){ sawHit=true; if(r.hitV>maxHit) maxHit=r.hitV; } return r; };

const floor=(top,s=4)=>({minX:-s,maxX:s,minZ:-s,maxZ:s,bottom:top-1,top});
const wallAt=x=>({minX:x,maxX:x+.6,minZ:-4,maxZ:4,bottom:-1,top:9});   // parede com face em x, normal -x
function arena({wall=false}={}){
  const w=Object.create(L.world);
  w.platforms=[floor(0)]; if(wall) w.platforms.push(wallAt(RAD+.05));
  w._wind=null; w.wind=()=>w._wind; w.spawnPoint=new L.V3(0,0,0); w.spawnYaw=0;
  const P=L.makePlayer(w), dmg=[]; P.on('damage',d=>dmg.push(d));
  P.position.set(0,0,0); P._prev.copy(P.position); P.velocity.set(0,0,0); P.grounded=true; maxHit=0;
  return {w,P,dmg};
}
const run=(P,n,input=idle,dt=1/60,each)=>{ for(let i=0;i<n&&!P.dead;i++){ P.update(dt,input); if(each) each(i); } };
const air=(P,y)=>{ P.position.y=y; P._prev.copy(P.position); P.grounded=false; P.coyoteT=0; };
// impacto vertical a v m/s no próximo passo de 1/60 s
function impactV(P,v,top=0){ air(P,top+.02); P.velocity.set(P.velocity.x,-v+P.attributes.effective.gravity/60,P.velocity.z); P.update(1/60,idle); }
function dropFrom(P,h){ air(P,h); P.velocity.set(0,0,0); run(P,600,idle,1/60); }
function hang(P,y=3){   // pendura a mão direita numa agarra da parede (face em x=RAD+.05, normal -x)
  const h=P.hands[1]; h.inContact=h.isGrabbing=true; h.surface=new L.Obj(); h.surface.userData.grab=true;
  h.normal.set(-1,0,0); h.point.set(RAD+.05,y,0); P.grounded=false; return h;
}

test('collideBody_informa_hitV',()=>{ const {P}=arena({wall:true}); air(P,2); P.velocity.set(12,0,0); P.update(1/60,idle); assert.ok(sawHit,'collideBody devolve hitV numérico'); assert.ok(maxHit>11.5&&maxHit<12.01,`hitV ${maxHit}`); });
test('pulo_no_mesmo_nivel_nao_machuca',()=>{
  const {P,dmg}=arena(); P.jump(); assert.ok(P.velocity.y>8,'pulou'); run(P,120); assert.equal(P.grounded,true); assert.equal(P.health.value,100); assert.equal(dmg.length,0);
  for(const perk of [null,'powerful_launch']){
    const {P:Q}=arena(); if(perk) Q.attributes.addPerk(perk); air(Q,0.0001); Q.velocity.set(0,Q.attributes.effective.wallJumpSpeed,0); run(Q,150);
    assert.equal(Q.grounded,true); assert.equal(Q.health.value,100,`salto agarrado vertical ${perk||''}`);
  }
});
test('limites_da_curva',()=>{
  for(const [v,hp] of [[9.99,100],[10,100],[10.01,92],[12,80],[15.9,32]]){ const {P}=arena(); impactV(P,v); assert.equal(P.health.value,hp,`${v} m/s`); assert.equal(P.dead,false); }
  const {P,dmg}=arena(); const deaths=[]; P.on('death',r=>deaths.push(r)); impactV(P,16.5);
  assert.equal(P.dead,true); assert.equal(P.deathReason,'fall'); assert.equal(P.health.value,0); assert.deepEqual(deaths,['fall']); assert.equal(dmg.length,0,'queda letal continua instantânea');
});
test('dano_de_queda_tem_fonte_fall',()=>{ const {P,dmg}=arena(); impactV(P,12); assert.deepEqual(dmg.map(d=>[d.amount,d.source]),[[20,'fall']]); });
test('queda_parada_2_7m_x_3m',()=>{
  let a=arena(); dropFrom(a.P,2.7); assert.equal(a.P.grounded,true); assert.equal(a.P.health.value,100,'2,7 m');
  a=arena(); dropFrom(a.P,3); assert.equal(a.P.health.value,91,'3 m');
});
test('degrau_apos_pulo',()=>{
  for(const [h,hp] of [[.85,100],[1.0,92]]){ const {w,P}=arena(); P.jump(); P.update(1/60,idle); w.platforms=[floor(-h)]; run(P,200);
    assert.equal(P.grounded,true); assert.ok(Math.abs(P.position.y+h)<1e-6); assert.equal(P.health.value,hp,`degrau ${h} m`); }
});
test('light_body_machuca_menos',()=>{
  const a=arena(); dropFrom(a.P,4); assert.equal(a.P.health.value,80,'normal');
  const b=arena(); assert.equal(b.P.attributes.addPerk('light_body'),true); dropFrom(b.P,4); assert.equal(b.P.health.value,91,'Corpo leve');
});
test('um_pouso_um_dano',()=>{ const {P,dmg}=arena(); impactV(P,12); run(P,120); assert.equal(dmg.length,1); assert.equal(P.health.value,80); });
test('lateral_valido',()=>{
  let a=arena({wall:true}); air(a.P,3); a.P.velocity.set(12,0,0); a.P.update(1/60,idle);
  assert.deepEqual(a.dmg.map(d=>[d.amount,d.source]),[[20,'impact']]); assert.equal(a.P.health.value,80);
  a=arena({wall:true}); air(a.P,3); a.P.velocity.set(20,0,0); a.P.update(1/60,idle);
  assert.equal(a.P.health.value,30,'acima de 16 conta 16 (70)'); assert.equal(a.P.dead,false,'lateral nunca mata na hora');
  a=arena({wall:true}); a.P.health.set(70); air(a.P,3); a.P.velocity.set(20,0,0); a.P.update(1/60,idle);
  assert.equal(a.P.dead,true); assert.equal(a.P.deathReason,'impact'); assert.equal(a.P.health.value,0);
  a=arena({wall:true}); air(a.P,3); a.P.velocity.set(9.5,0,0); a.P.update(1/60,idle); assert.equal(a.P.health.value,100,'9,5 m/s não machuca');
});
test('quina_cobra_uma_vez',()=>{
  let a=arena({wall:true}); air(a.P,.02); a.P.velocity.set(12,-12+a.P.attributes.effective.gravity/60,0); a.P.update(1/60,idle);
  assert.equal(a.P.health.value,80,'pouso 12 + lateral 12 no mesmo passo = 20'); assert.equal(a.dmg.length,1);
  a=arena({wall:true}); air(a.P,1); a.P.velocity.set(12,0,0); a.P.update(1/60,idle); assert.equal(a.P.health.value,80);
  run(a.P,5); impactV(a.P,15.9); assert.equal(a.P.health.value,32,'lateral 12 + pouso 15,9 em 0,25 s = 68'); assert.deepEqual(a.dmg.map(d=>d.amount),[20,48]);
});
test('fora_da_janela_cobra_de_novo',()=>{
  const a=arena({wall:true}); air(a.P,1); a.P.velocity.set(12,0,0); a.P.update(1/60,idle);
  run(a.P,18); impactV(a.P,12); assert.equal(a.P.health.value,60,'0,32 s depois: dois danos de 20');
});
test('janela_so_reabre_quando_cobra',()=>{   // R-T2 Minor 1: impacto menor dentro da janela não a prolonga
  const {P,dmg}=arena(); P._impact(0,12); P._impactWin.t-=.2; P._impact(0,11); assert.equal(dmg.length,1,'11 m/s logo após 12 não cobra');
  P._impactWin.t-=.2; P._impact(0,12); assert.deepEqual(dmg.map(d=>d.amount),[20,20],'0,4 s após o 1º: a janela já fechou');
});
test('golpe_fatal_preserva_lastChange',()=>{   // R-T2 Minor 2
  const a=arena({wall:true}); a.P.health.set(70); air(a.P,3); a.P.velocity.set(20,0,0); a.P.update(1/60,idle);
  assert.equal(a.P.dead,true); assert.deepEqual([a.P.health.lastChange.amount,a.P.health.lastChange.source],[-70,'impact']);
});
test('parede_curva_do_poco_nao_machuca',()=>{   // R-T2 Minor 4: World.guard + arco da casca, passarela anelar (40 m)
  const R=L.vm.runInThisContext('SHAFT_R'), polar=L.vm.runInThisContext('polar'), y=40;
  const mk=()=>{ const w=Object.create(L.world); w._wind=null; w.wind=()=>w._wind; const P=L.makePlayer(w);
    P.position.copy(polar(R-.55,.3,y)); P._prev.copy(P.position); P.velocity.set(0,0,0); P.grounded=true; maxHit=0; return {w,P}; };
  const rad=P=>{ const r=Math.hypot(P.position.x,P.position.z); return [P.position.x/r,P.position.z/r]; };
  const cases={
    'andar contra a casca (1/60)':({P})=>{ L.face(P,...rad(P)); run(P,400,{x:0,y:1}); },
    'andar contra a casca (dt 0,05)':({P})=>{ L.face(P,...rad(P)); run(P,150,{x:0,y:1},.05); },
    'contornar encostado na casca':({P})=>{ run(P,900,{x:0,y:1},1/60,()=>{ const [ux,uz]=rad(P); L.face(P,-uz+ux*.4,ux+uz*.4); }); },
    'contornar encostado (dt 0,05)':({P})=>{ run(P,300,{x:0,y:1},.05,()=>{ const [ux,uz]=rad(P); L.face(P,-uz+ux*.4,ux+uz*.4); }); },
    'vento forte contra a casca':({w,P})=>{ const [ux,uz]=rad(P); w._wind={air:new L.V3(ux*40,0,uz*40),g:1,fan:null}; run(P,300); run(P,60,idle,.05); },
  };
  for(const [name,fn] of Object.entries(cases)){ const a=mk(); fn(a);
    assert.equal(a.P.dead,false,name); assert.equal(a.P.health.value,100,`${name}: HP ${a.P.health.value}`); assert.ok(maxHit<10,`${name}: hitV máx ${maxHit.toFixed(2)}`);
    assert.ok(Math.abs(a.P.position.y-y)<.05,`${name}: saiu da passarela (y ${a.P.position.y.toFixed(2)})`);
    console.log(`   ${name}: hitV máx ${maxHit.toFixed(2)} m/s, r ${Math.hypot(a.P.position.x,a.P.position.z).toFixed(2)}`); }
});
test('contato_continuo_nao_machuca',()=>{
  const cases={
    'andar contra a parede (1/60)':a=>{ L.face(a.P,1,0); run(a.P,600,{x:0,y:1}); },
    'andar contra a parede (dt 0,05)':a=>{ L.face(a.P,1,0); run(a.P,200,{x:0,y:1},.05); },
    'vento forte contra a parede':a=>{ a.w._wind={air:new L.V3(40,0,0),g:1,fan:null}; run(a.P,300); run(a.P,60,idle,.05); },
    'cair 2 m deslizando a 3 m/s':a=>{ L.face(a.P,1,0); air(a.P,2); a.P.velocity.set(3,0,0); run(a.P,200,{x:0,y:1}); },
    'cair 2 m deslizando (dt 0,05)':a=>{ L.face(a.P,1,0); air(a.P,2); a.P.velocity.set(3,0,0); run(a.P,80,{x:0,y:1},.05); },
    'pendurado encostado e soltar':a=>{ air(a.P,1); hang(a.P,3); run(a.P,180,{x:.6,y:0}); run(a.P,60,idle,.05); a.P.releaseAll(); run(a.P,200); },
    'salto agarrado contra a parede':a=>{ air(a.P,1); hang(a.P,3); run(a.P,60); const fy=a.P.position.y; a.P.jump(); assert.ok(a.P.stats.wallJumps===1||a.P.velocity.y>8,'saltou');
      a.w.platforms=[floor(fy),wallAt(RAD+.05)]; run(a.P,200); assert.equal(a.P.grounded,true); },
  };
  for(const [name,fn] of Object.entries(cases)){ const a=arena({wall:true}); fn(a);
    assert.equal(a.P.dead,false,name); assert.equal(a.P.health.value,100,`${name}: HP ${a.P.health.value}`); assert.ok(maxHit<10,`${name}: hitV máx ${maxHit.toFixed(2)}`);
    console.log(`   ${name}: hitV máx ${maxHit.toFixed(2)} m/s`); }
});
test('escalada_e_mantle_sem_dano',()=>{
  const a=arena(); const plat={minX:-1,maxX:1,minZ:-1.2,maxZ:-.05,top:4.5,bottom:4.2};
  a.w.platforms.push(plat); air(a.P,2.2); const h=a.P.hands[0]; h.inContact=h.isGrabbing=true; h.surface=new L.Obj(); h.surface.userData.grab=true; h.surface.userData.plat=plat;
  h.normal.set(0,0,1); h.point.set(0,4.57,-.05); h.stamina=80; run(a.P,90,{x:.4,y:0}); a.P.pull=.6; a.P.jump(); assert.ok(a.P.mantle,'mantle começou'); run(a.P,90);
  assert.equal(a.P.mantle,null); assert.equal(a.P.health.value,100); assert.equal(a.dmg.length,0);
});
test('noclip_e_collide_false_sem_dano',()=>{
  let a=arena(); a.P.debugFrozen=true; impactV(a.P,12); assert.equal(a.P.health.value,100,'debugFrozen');
  a=arena(); air(a.P,.02); a.P.velocity.set(0,-12,0); a.P.position.y-=.2; a.P._collide(false); assert.equal(a.P.grounded,true); assert.equal(a.P.health.value,100,'_collide(false)');
});
test('chao_que_some_e_elevador',()=>{
  let a=arena(); const pillar={minX:-1,maxX:1,minZ:-1,maxZ:1,bottom:0,top:2.5}; a.w.platforms.push(pillar); a.P.position.y=2.5; a.P._prev.copy(a.P.position); run(a.P,30);
  a.w.platforms.splice(a.w.platforms.indexOf(pillar),1); run(a.P,200); assert.equal(a.P.grounded,true); assert.equal(a.P.health.value,100,'tijolo some a 2,5 m');
  a=arena(); const pd={minX:-1.5,maxX:1.5,minZ:-1.5,maxZ:1.5,bottom:-.3,top:0,flat:true}; a.w.platforms=[pd];
  const el=new Elevator(a.w,{y0:0,y1:30,speed:3,pd,car:{position:{y:0}},doors:{bottom:{set(){}},top:{set(){}}}}); el.start();
  run(a.P,900,idle,1/60,()=>el.update(1/60,a.P)); assert.equal(el.state,'top'); assert.ok(Math.abs(a.P.position.y-30)<.05,`subiu ${a.P.position.y}`); assert.equal(a.P.health.value,100,'andar de elevador');
  a=arena(); const pd2={...pd}; a.w.platforms=[pd2]; const el2=new Elevator(a.w,{y0:0,y1:30,speed:3,pd:pd2,car:{position:{y:0}},doors:{bottom:{set(){}},top:{set(){}}}}); el2.start();
  for(let i=0;i<180;i++) el2.update(1/60,null); air(a.P,el2.y+2.5); a.P.velocity.set(0,0,0); run(a.P,300,idle,1/60,()=>el2.update(1/60,a.P));
  assert.equal(a.P.health.value,100,'cair 2,5 m sobre o elevador subindo');
});
console.log(`\n${total} testes; falhas: ${fails}`);process.exitCode=fails?1:0;
