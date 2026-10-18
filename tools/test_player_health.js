'use strict';
// Vida do jogador (Tarefa 1 do plano Health): PlayerHealth como fonte única, Player.damage/heal e o caminho único de morte.
const assert=require('node:assert/strict');
const L=require('./_player.js');
const PH=L.vm.runInThisContext('PlayerHealth');
let total=0,fails=0;
function test(name,fn){total++;try{fn();console.log('OK',name);}catch(e){fails++;console.error('FAIL',name,e.message);}}
const events=(P,type)=>{ const list=[]; P.on(type,d=>list.push(d)); return list; };

test('inicia_com_100_healthy',()=>{
  const h=new PH(); assert.equal(h.max,100); assert.equal(h.value,100); assert.equal(h.state,'healthy'); assert.equal(h.lastChange,null);
  assert.deepEqual(h.snapshot(),{value:100,max:100,state:'healthy'});
});
test('faixas',()=>{
  for(const [v,s] of [[100,'healthy'],[76,'healthy'],[75,'hurt'],[51,'hurt'],[50,'injured'],[26,'injured'],[25,'critical'],[1,'critical'],[0,'dead']])
    assert.equal(PH.stateOf(v),s,`stateOf(${v})`);
});
test('dano_e_cura_travados',()=>{
  const h=new PH();
  let r=h.damage(30.6,{source:'fall'}); assert.equal(r.applied,31); assert.equal(r.value,69); assert.equal(r.died,false);
  assert.equal(h.lastChange.amount,-31); assert.equal(h.lastChange.source,'fall');
  r=h.damage(500); assert.equal(r.value,0); assert.equal(r.applied,69); assert.equal(r.died,true); assert.equal(h.state,'dead');
  r=h.heal(50); assert.equal(r.applied,0); assert.equal(r.value,0);
  r=h.damage(5); assert.equal(r.applied,0); assert.equal(r.died,false,'já morto não morre de novo');
  const g=new PH(); g.damage(10); r=g.heal(50); assert.equal(r.applied,10); assert.equal(r.value,100);
});
test('entradas_invalidas',()=>{
  const h=new PH(); h.damage(20);
  for(const x of [NaN,-5,0,undefined,'abc']){ const r=h.damage(x); assert.equal(r.applied,0,`damage(${x})`); assert.equal(h.value,80); }
  for(const x of [Infinity,-Infinity,NaN,-3,0]){ const r=h.heal(x); assert.equal(r.applied,0,`heal(${x})`); assert.equal(h.value,80); }
  for(const x of [0,101,50.5,-1,NaN,'50']){ const r=h.set(x); assert.equal(r.ok,false,`set(${x})`); assert.equal(h.value,80); assert.ok(r.reason); }
  const r=h.set(25,{source:'debug'}); assert.equal(r.ok,true); assert.equal(r.value,25); assert.equal(h.state,'critical');
  assert.equal(h.damage(0.4).applied,0,'arredonda para 0: nada aplicado');
});
test('curva_impactDamage',()=>{
  for(const [v,d] of [[0,0],[9.99,0],[10,0],[10.01,8],[10.4,9],[12,20],[13.94,41],[15.9,68],[16,70],[30,70]])
    assert.equal(PH.impactDamage(v),d,`impactDamage(${v})`);
  assert.equal(PH.IMPACT_SAFE,10); assert.equal(PH.IMPACT_CAP,16);
  assert.equal(PH.impactDamage(NaN),0); assert.equal(PH.impactDamage(-12),0);
});
test('zero_apos_dano_fatal_mantem_o_golpe',()=>{ const h=new PH(); h.damage(100,{source:'impact'}); h.zero('impact'); assert.deepEqual([h.lastChange.amount,h.lastChange.source],[-100,'impact']); });
test('zero_e_reset',()=>{
  const h=new PH(); h.damage(30); h.zero('mass'); assert.equal(h.value,0); assert.equal(h.state,'dead'); assert.equal(h.lastChange.source,'mass');
  h.reset(); assert.equal(h.value,100); assert.equal(h.state,'healthy'); assert.equal(h.lastChange,null);
});
test('player_tem_health_e_snapshot_independente',()=>{
  const P=L.makePlayer(); assert.ok(P.health instanceof PH); assert.equal(P.health.value,100);
  const s=P.health.snapshot(); s.value=3; assert.equal(P.health.value,100,'snapshot é cópia');
});
test('player_damage_emite_evento',()=>{
  const P=L.makePlayer(), dmg=events(P,'damage');
  const r=P.damage(20,'fall'); assert.deepEqual(r,{applied:20,value:80,died:false});
  assert.equal(dmg.length,1); assert.deepEqual(dmg[0],{amount:20,source:'fall',value:80,state:'healthy'});
  P.damage(0,'fall'); P.damage(NaN); assert.equal(dmg.length,1,'sem evento quando nada é aplicado');
  assert.equal(P.damage(5).applied,5); assert.equal(dmg[1].source,'debug','fonte padrão');
});
test('player_damage_letal_chama_die_uma_vez',()=>{
  const P=L.makePlayer(), deaths=events(P,'death'), dmg=events(P,'damage');
  let dies=0; const die=P.die.bind(P); P.die=r=>{ dies++; return die(r); };
  const a=P.damage(60,'fall'), b=P.damage(60,'fall');
  assert.equal(a.died,false); assert.equal(b.died,true);
  const c=P.damage(60,'fall'); assert.equal(c.applied,0); assert.equal(c.died,false);
  assert.equal(dies,1); assert.equal(P.dead,true); assert.equal(P.deathReason,'fall'); assert.equal(P.health.value,0);
  assert.deepEqual(deaths,['fall']); assert.equal(dmg.length,2);
});
test('die_instantaneo_zera',()=>{
  for(const why of ['mass','fan','fall']){
    const P=L.makePlayer(), dmg=events(P,'damage'), deaths=events(P,'death');
    P.die(why); assert.equal(P.health.value,0,why); assert.equal(P.health.state,'dead'); assert.equal(dmg.length,0,'sem evento de dano'); assert.deepEqual(deaths,[why]);
    P.die('fan'); assert.deepEqual(deaths,[why],'morte única'); assert.equal(P.deathReason,why);
  }
});
test('player_heal',()=>{
  const P=L.makePlayer(); P.damage(40);
  assert.deepEqual(P.heal(15),{applied:15,value:75}); assert.deepEqual(P.heal(100),{applied:25,value:100}); assert.deepEqual(P.heal(5),{applied:0,value:100});
  P.die('mass'); assert.deepEqual(P.heal(50),{applied:0,value:0});
});
test('reset_restaura_100',()=>{
  const P=L.makePlayer(); P.damage(40); P.reset(); assert.equal(P.health.value,100); assert.equal(P.health.state,'healthy');
  P.die('mass'); P.reset(); assert.equal(P.health.value,100); assert.equal(P.dead,false);
});
test('debug_transient_nao_mexe_no_HP',()=>{
  const P=L.makePlayer(); P.damage(35); P.clearDebugTransient(); assert.equal(P.health.value,65);
});
test('independente_de_stamina_e_fadiga',()=>{
  const P=L.makePlayer(); P.hands.forEach(h=>h.stamina=60); P.pullFatigue=.4;
  P.damage(50); assert.deepEqual(P.hands.map(h=>h.stamina),[60,60]); assert.equal(P.pullFatigue,.4);
  P.hands.forEach(h=>h.stamina=5); P.pullFatigue=.9; P.restoreStamina(); assert.equal(P.health.value,50,'pílula não cura');
});
console.log(`\n${total} testes; falhas: ${fails}`);process.exitCode=fails?1:0;
