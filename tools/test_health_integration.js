'use strict';
// Tarefa 6 do plano Health: integração com o Game, World e Player reais (_debug_harness), sem regra nova.
const assert=require('node:assert/strict');
let total=0,bad=0;
function test(name,fn){ total++; try{ fn(build()); console.log('OK',name); }catch(e){ bad++; console.error('FAIL',name,'-',String(e&&e.stack||e).split('\n').slice(0,4).join(' | ')); } }
function build(){
  const h=require('./_debug_harness')(), g=h.g, els={}, hud=[];
  const el=id=>els[id]||(els[id]={id,hidden:true,textContent:'',disabled:false,className:'',dataset:{},children:[],append(){},appendChild(){},focus(){},classList:{add(){},remove(){},toggle(){},contains(){return false}},style:{}});
  Object.assign(g.ui,{$:el,hideNote(){},setPack(){},clearMsg(){},setHUD(){},show(){},hideScreens(){},resetPack(){},renderPack(){},showStation(){},hideStation(){},toast(){},results:[],showResult(r){ this.results.push(r); },
    updateHUD(gs){ hud.push(gs); }});
  Object.assign(g.audio,{siren(){},chime(){},boom(){},setRumble(){},setHum(){},setTension(){},init(){},silence(){},pill(){},deny(){}});
  Object.assign(g.vr,{closeMenu(){},showResult(){},recenter(){}});
  try{ h.G('PerkStations'); }catch(e){ h.load('js/systems/PerkStations.js'); }
  g.stations=new (h.G('PerkStations'))(g.player.attributes,{preset:{E1:['powerful_launch','quick_recovery'],E2:['economical_grip','anchor'],E3:['light_body','deep_breath']}});
  if(!g.atmosphere.reset) g.atmosphere.reset=()=>{};
  g.lock=()=>{}; g.unlock=()=>{}; g.settings.data.devConsoleEnabled=true; els.devConsole={hidden:true}; els.devConsoleInput={focus(){}};
  h.load('js/ui/DevConsole.js'); const DC=h.G('DevConsole');
  const frame=(dt=1/60)=>{ h.wall.advance(dt*1000); g._loop(h.clock.now); };
  const run=c=>DC.execute(c,g);
  return {h,g,p:g.player,nav:g.debugNavigation,hud,frame,run,els};
}
const PlayerHealthOf=t=>t.h.G('PlayerHealth');
// cai de `meters` acima do piso do salão de partida, parado, e roda até pousar
function dropAt(t,meters){
  const {p,g,frame}=t, sp=g.world.spawnPoint;
  p.position.set(sp.x,sp.y+meters,sp.z); p._prev.copy(p.position); p.velocity.set(0,0,0); p.grounded=false;
  for(let i=0;i<600&&!(p.grounded&&i>2)&&!p.dead;i++) frame();
}
test('queda_real_cobra_e_hud_acompanha (5 m → ~64 HP, curva sobre o pouso medido)',t=>{
  const {p,hud,frame}=t; frame(); let vy=null; p.on('land',v=>{ vy=v; }); dropAt(t,5); frame();
  // pouso real (passo de 1/60 s) chega um pouco acima dos 13,4 m/s analíticos: o dano segue a curva sobre a velocidade medida
  assert.ok(vy!=null&&Math.abs(vy)>13.3&&Math.abs(vy)<13.9,'velocidade de pouso '+vy);
  assert.equal(p.dead,false); assert.equal(p.health.value,100-PlayerHealthOf(t).impactDamage(Math.abs(vy)),'HP segue a curva');
  assert.ok(p.health.value>=63&&p.health.value<=65,'≈65 HP após 5 m: '+p.health.value); assert.equal(p.health.lastChange.source,'fall');
  assert.equal(hud.at(-1).health.value,p.health.value,'o HUD recebe o snapshot'); assert.equal(hud.at(-1).health.state,'hurt');
});
test('pausa_inventario_estacao_console_preservam',t=>{
  const {g,p,frame}=t; p.health.set(40); frame();
  g.pause(); frame(); g._resumeNow(); frame();
  g.openInventory(); assert.equal(g.state,'inventory'); frame(); g.closeInventory(); frame();
  g.openStation('E1'); assert.equal(g.state,'station'); frame(); g.closeStation(); frame();
  g.openDevConsole(); assert.equal(g.state,'console'); frame(); g.closeDevConsole(); frame();
  assert.equal(g.state,'play'); assert.equal(p.health.value,40);
});
test('retry_e_menu_restauram (100 HP, mãos saudáveis na hora)',t=>{
  const {g,p,frame}=t; p.health.set(10); for(let i=0;i<20;i++) frame();
  assert.ok(p.handModels.every(hm=>hm.mat.userData.wear.uWear.value>.5),'mãos críticas antes');
  g.retry(); assert.equal(p.health.value,100); assert.equal(g.state,'play');
  assert.ok(p.handModels.every(hm=>hm.mat.userData.wear.uWear.value===0&&hm.hurtTremor===0),'reset instantâneo');
  p.health.set(10); g.toMenu(); assert.equal(p.health.value,100); assert.equal(g.state,'menu');
});
test('letais_zeram (massa, exaustor, queda > 16 m/s) com o texto de resultado de hoje',t=>{
  const texts={mass:'A massa te alcançou',fan:'O exaustor te puxou',fall:'Você caiu'};
  const T=build(); T.frame(); T.g.mass.active=true; T.g.mass.y=T.p.position.y+2; T.frame();
  assert.equal(T.p.dead,true); assert.equal(T.p.deathReason,'mass'); assert.equal(T.p.health.value,0);
  const F=build(); F.frame(); F.p.die('fan'); assert.equal(F.p.health.value,0);
  const Q=build(); Q.frame(); dropAt(Q,20); assert.equal(Q.p.dead,true); assert.equal(Q.p.deathReason,'fall'); assert.equal(Q.p.health.value,0);
  const ui=Object.create(Q.h.G('UIManager').prototype), E={};
  ui.$=id=>E[id]||(E[id]={id,hidden:false,textContent:'',disabled:false,className:'',children:[],append(){},classList:{add(){},remove(){}},style:{}}); ui.show=()=>{};
  for(const r of ['mass','fan','fall']){ ui.showResult({name:'x',score:1,time:1,result:r,height:3,ending:null,breakdown:{total:1,height:1,speed:0,performance:0,penalties:0,checkpoints:0}}); assert.equal(E.resT.textContent,texts[r]); }
});
test('goto_back_nao_mexem_no_HP',t=>{
  const {p,nav,frame}=t; frame(); p.health.set(60);
  assert.equal(nav.goto('cp6').ok,true); for(let i=0;i<60;i++) frame();
  assert.equal(nav.back().ok,true); for(let i=0;i<60;i++) frame();
  assert.equal(p.health.value,60);
});
test('noclip_off_no_ar_machuca (4 m → 20 de dano)',t=>{
  const {p,g,nav,frame}=t; frame(); const sp=g.world.spawnPoint;
  assert.equal(nav.setNoclip(true).ok,true); p.position.set(sp.x,sp.y+4,sp.z); p._prev.copy(p.position); frame();
  assert.equal(nav.setNoclip(false).ok,true);
  for(let i=0;i<300&&!(p.grounded&&i>2);i++) frame();
  assert.equal(p.health.value,80); assert.equal(p.dead,false);
});
test('damage_letal_em_noclip_encerra_ao_fechar_console (R-final I1)',t=>{
  const {p,g,nav,frame,run}=t; frame();
  assert.equal(nav.setNoclip(true).ok,true); frame();
  g.openDevConsole(); assert.equal(g.state,'console'); run('damage 100'); assert.equal(p.dead,true);
  g.closeDevConsole(); frame();
  assert.equal(g.state,'ending','a morte segue o fluxo normal mesmo em noclip');
  assert.equal(g.lastRun&&g.lastRun.result,'debug');
  for(let i=0;i<5;i++) frame(); assert.equal(g.state,'ending','endRun roda uma vez só');
});
test('pilulas_so_stamina',t=>{
  const {g,p,frame}=t; frame(); p.health.set(50); p.hands.forEach(h=>h.stamina=10);
  g.items.inv.add('pills',1); g.items.quick('pills');
  assert.ok(p.hands.every(h=>h.stamina>10),'pílula restaurou stamina'); assert.equal(p.health.value,50);
});

console.log(`\n${total} testes; falhas: ${bad}`); process.exitCode=bad?1:0;
