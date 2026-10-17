'use strict';
// Estações de melhoria: módulo puro (ofertas/escolha/limite), interativo no mundo e ciclo de vida, interface e VR.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
let failures=0,total=0;
function test(name,fn){ total++; try{ fn(); console.log('OK',name); }catch(e){ failures++; console.error('FAIL',name,'-',e.message.split('\n')[0]); } }
const ctx=vm.createContext({console});
for(const f of ['js/player/perkDefs.js','js/player/PlayerAttributes.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
let pureLoaded=true; try{ vm.runInContext(fs.readFileSync(path.join(ROOT,'js/systems/PerkStations.js'),'utf8'),ctx,{filename:'js/systems/PerkStations.js'}); }catch(e){ pureLoaded=false; }
const G=n=>vm.runInContext(`typeof ${n}!=='undefined'?${n}:undefined`,ctx);
const need=n=>{ const v=G(n); if(v===undefined) throw new Error(n+' is not defined'); return v; };
const attrs=(...ids)=>{ const a=new (G('PlayerAttributes'))(); ids.forEach(id=>assert.ok(a.addPerk(id),id)); return a; };
const stations=a=>new (need('PerkStations'))(a);
const S={launch:'powerful_launch',recovery:'quick_recovery',grip:'economical_grip',light:'light_body'};

// ---------------------------------------------------------------- módulo puro
test('MAX_RUN_PERKS = 3 e STATION_DEFS E1/E2/E3 nos descansos certos',()=>{
  assert.equal(need('MAX_RUN_PERKS'),3); const D=need('STATION_DEFS');
  assert.deepEqual(['E1','E2','E3'].map(k=>D[k].cp),['cp4','cp8','cp14']);
  assert.deepEqual(['E1','E2','E3'].map(k=>D[k].label),['Sala de controle','Mezanino','Cabine de guincho']);
  for(const k of ['E1','E2','E3']){ assert.equal(D[k].id,k); assert.equal(D[k].order.length,4); assert.ok(D[k].ahead.startsWith('Adiante:')); }
});
test('tabela completa da §4.2 (ativos ao chegar × estação)',()=>{
  const rows=[[[],{E1:['launch','recovery'],E2:['grip','recovery'],E3:['light','grip']}],
    [['launch'],{E2:['grip','recovery'],E3:['light','grip']}],
    [['recovery'],{E2:['grip','launch'],E3:['light','grip']}],
    [['grip'],{E2:['recovery','launch'],E3:['light','recovery']}],
    [['launch','grip'],{E3:['light','recovery']}],
    [['launch','recovery'],{E3:['light','grip']}],
    [['recovery','grip'],{E3:['light','launch']}]];
  for(const [act,want] of rows){ const st=stations(attrs(...act.map(k=>S[k])));
    for(const [e,ids] of Object.entries(want)) assert.deepEqual(Array.from(st.offers(e)),ids.map(k=>S[k]),`${act.join('+')||'nenhum'} @ ${e}`); }
});
test('nenhuma oferta repete um perk ativo; light_body só aparece na E3 pelo jogo',()=>{
  const combos=[[],['launch'],['recovery'],['grip'],['launch','grip'],['launch','recovery'],['recovery','grip']];
  for(const act of combos){ const a=attrs(...act.map(k=>S[k])), st=stations(a);
    for(const e of ['E1','E2','E3']){ const o=Array.from(st.offers(e)); assert.ok(o.every(id=>!a.hasPerk(id)),`${e} repete`);
      if(e!=='E3'&&act.length<(e==='E1'?1:2)) assert.ok(!o.includes(S.light),`${e} ofereceu light_body`); } }
});
test('escolher aplica o perk e consome a estação; não restaura stamina (só atributos)',()=>{
  const a=attrs(), st=stations(a); const r=st.choose('E1',S.launch);
  assert.deepEqual({...r},{ok:true,reason:null}); assert.equal(a.hasPerk(S.launch),true); assert.equal(st.isUsed('E1'),true);
  assert.deepEqual({...st.canChoose('E1')},{ok:false,reason:'used'}); assert.equal(st.choose('E1',S.recovery).reason,'used'); assert.equal(a.hasPerk(S.recovery),false);
});
test('Ignorar (não escolher) mantém a estação disponível; perk fora da oferta é recusado',()=>{
  const a=attrs(), st=stations(a); st.offers('E2'); assert.equal(st.isUsed('E2'),false);
  assert.equal(st.choose('E2',S.light).reason,'not_offered'); assert.equal(st.isUsed('E2'),false); assert.equal(a.activePerks.length,0);
});
test('addPerk recusado → rejected, estação continua livre (atomicidade)',()=>{
  const a=attrs(); const orig=a.addPerk.bind(a); a.addPerk=()=>false; const st=stations(a);
  assert.equal(st.choose('E1',S.launch).reason,'rejected'); assert.equal(st.isUsed('E1'),false); a.addPerk=orig;
});
test('3 perks ativos (console) → limit, sem consumir',()=>{
  const a=attrs(S.launch,S.recovery,S.grip), st=stations(a);
  assert.deepEqual({...st.canChoose('E3')},{ok:false,reason:'limit'}); assert.equal(st.choose('E3',S.light).reason,'limit'); assert.equal(st.isUsed('E3'),false);
});
test('1 candidato → 1 oferta; 0 candidatos → empty',()=>{
  const a=attrs(S.launch,S.recovery,S.grip); assert.deepEqual(Array.from(stations(a).offers('E1')),[S.light]);
  const b=attrs(S.launch,S.recovery,S.grip,S.light), st=stations(b); assert.deepEqual(Array.from(st.offers('E1')),[]);
  // com 4 ativos o limite vence; sem limite, a falta de candidatos é 'empty'
  assert.equal(st.canChoose('E1').reason,'limit');
  const c=attrs(S.launch,S.recovery); const sc=stations(c); sc.max=99; sc.offers=()=>[]; assert.equal(sc.canChoose('E1').reason,'empty');
});
test('reset() libera todas as estações',()=>{
  const a=attrs(), st=stations(a); st.choose('E1',S.launch); a.clearPerks(); st.reset(); assert.equal(st.isUsed('E1'),false); assert.equal(st.canChoose('E1').ok,true);
});
test('preview(id): antes → depois sem alterar perks nem atributos efetivos',()=>{
  const a=attrs(S.grip), eff=a.effective, act=a.activePerks;
  const p=a.preview(S.light); assert.equal(p.before.maxStamina,100); assert.equal(p.after.maxStamina,60); assert.equal(p.after.gravity,13.5);
  assert.equal(p.after.gripDrainMultiplier,eff.gripDrainMultiplier,'mantém os ativos na composição');
  assert.equal(a.effective,eff); assert.deepEqual(a.activePerks,act); assert.equal(a.hasPerk(S.light),false);
  assert.equal(a.preview('nope'),null); assert.equal(a.preview(S.grip),null,'perk já ativo');
});

// ---------------------------------------------------------------- jogo: estação no mundo e ciclo de vida
const log=console.log; console.log=()=>{};
const Lw=require('./_load.js'); console.log=log;
test('cada estação existe no mundo no seu descanso (E1 cp4, E2 cp8, E3 cp14)',()=>{
  const W=Lw.world; assert.ok(Array.isArray(W.stations),'world.stations');
  for(const [id,cp] of [['E1','cp4'],['E2','cp8'],['E3','cp14']]){
    const st=W.stations.find(s=>s.id===id); assert.ok(st,id); const b=W.checkpoints.find(c=>c.id===cp).bounds, p=st.group.position;
    assert.ok(Math.abs(p.y-b.top)<.05,`${id} na altura do ${cp}`); assert.ok(solidInXZ(b,p.x,p.z),`${id} em cima do ${cp}`);
    assert.ok(W.interactables.some(m=>m.userData.interactable===st),`${id} interativo`);
  }
});
test('estação esgotada: "Estação esgotada" e o painel não abre',()=>{
  const st=Lw.world.stations[0], msgs=[]; let opened=0;
  const ctx={game:{stations:{isUsed:()=>true},openStation(){ opened++; }},ui:{msg(t){ msgs.push(t); }},audio:{deny(){}}};
  st.interact(ctx); assert.equal(opened,0); assert.deepEqual(msgs,['Estação esgotada']);
  const ctx2={...ctx,game:{stations:{isUsed:()=>false},openStation(id){ opened++; assert.equal(id,st.id); }}}; st.interact(ctx2); assert.equal(opened,1);
  assert.ok(st.canInteract(ctx2).prompt); 
});
// Game real (protótipo) com o mínimo em volta
const Hg=require('./_items_harness.js')(['js/systems/progress.js','js/systems/PerkStations.js','js/Game.js']);
function stationGame(){
  const p=Hg.realPlayer(), calls={releaseUse:0,lock:0,unlock:0,show:[],hide:0,sync:[]};
  const Game=Hg.G('Game'), g=Object.create(Game.prototype);
  const el={hidden:true,textContent:'',focus(){},addEventListener(){}};
  Object.assign(g,{state:'play',player:p,keys:{},gameBtn:{},timer:new (Hg.G('TimerSystem'))(),audio:Hg.audio,vr:{active:false,showPause(){},closeMenu(){},recenter(){}},
    items:{releaseUse(){ calls.releaseUse++; },reset(){},use(){}},settings:{data:{devConsoleEnabled:true}},
    world:{stations:['E1','E2','E3'].map(id=>({id,setUsed(u){ calls.sync.push(id+':'+u); }})),reset(){}},
    ui:{$:()=>el,setPack(){},clearMsg(){},show(){},hideNote(){},msg(t){ (calls.msgs=calls.msgs||[]).push(t); },showStation(v){ calls.show.push(v); },hideStation(){ calls.hide++; },resetPack(){},hideScreens(){},setHUD(){},showResult(){}},
    lock(){ calls.lock++; },unlock(){ calls.unlock++; }});
  g.stations=new (Hg.G('PerkStations'))(p.attributes); g.timer.start();
  return {g,p,calls};
}
test('F abre e congela (estado station, timer parado, botões soltos); fechar retoma',()=>{
  const {g,calls}=stationGame(); g.openStation('E1');
  assert.equal(g.state,'station'); assert.equal(g.timer.running,false); assert.equal(calls.releaseUse,1); assert.equal(calls.show.length,1);
  assert.deepEqual(Array.from(calls.show[0].offers.map(o=>o.id)),['powerful_launch','quick_recovery']);
  g.closeStation(); assert.equal(g.state,'play'); assert.equal(g.timer.running,true); assert.equal(calls.hide,1); assert.equal(g.stations.isUsed('E1'),false,'Ignorar não consome');
});
test('escolher aplica o perk, consome, apaga a lâmpada e fecha; sem curar',()=>{
  const {g,p,calls}=stationGame(); p.hands.forEach(h=>{ h.stamina=40; }); g.openStation('E2'); g.chooseStation('economical_grip');
  assert.equal(p.attributes.hasPerk('economical_grip'),true); assert.equal(g.stations.isUsed('E2'),true); assert.equal(g.state,'play');
  assert.ok(calls.sync.includes('E2:true')); assert.ok(p.hands.every(h=>h.stamina===40),'sem cura');
  g.openStation('E2'); assert.equal(g.state,'play','esgotada não reabre');
});
test('limite de 3 (console): mensagem, painel não abre, estação não é consumida',()=>{
  const {g,p,calls}=stationGame(); ['powerful_launch','quick_recovery','economical_grip'].forEach(id=>p.attributes.addPerk(id));
  g.openStation('E3'); assert.equal(g.state,'play'); assert.equal(calls.show.length,0); assert.equal(g.stations.isUsed('E3'),false);
  assert.ok((calls.msgs||[]).some(t=>/3/.test(t)&&/limite/i.test(t)),String(calls.msgs));
});
test('morte/endRun e resetRun limpam perks e liberam estações',()=>{
  const {g,p}=stationGame(); g.openStation('E1'); g.chooseStation('powerful_launch');
  Object.assign(g,{score:{finalize:()=>({total:0}),reset(){}},lastRun:null}); g.endRun('dead');
  assert.equal(p.attributes.activePerks.length,0); assert.equal(g.stations.isUsed('E1'),false);
  const b=stationGame(); b.g.openStation('E1'); b.g.chooseStation('powerful_launch');
  Object.assign(b.g,{mass:{reset(){}},score:{reset(){}},fx:{clear(){}},puzzles:{reset(){}},_zones(){},audio:Hg.audio,checkpoints:{reset(){}},atmosphere:{reset(){}},flashlight:{intensity:0}});
  b.g.resetRun(); assert.equal(b.p.attributes.activePerks.length,0); assert.equal(b.g.stations.isUsed('E1'),false);
});
test('pausa, mochila e console preservam perks e estações',()=>{
  const {g,p}=stationGame(); g.openStation('E1'); g.chooseStation('quick_recovery');
  g.pause(); g.state='play'; g.openInventory(); g.state='play'; g.openDevConsole();
  assert.equal(p.attributes.hasPerk('quick_recovery'),true); assert.equal(g.stations.isUsed('E1'),true);
});

// ---------------------------------------------------------------- interface desktop
function fakeUI(){
  const els={}, el=id=>els[id]||(els[id]={id,hidden:true,innerHTML:'',textContent:'',dataset:{},classList:{s:new Set(),add(c){this.s.add(c)},remove(c){this.s.delete(c)},toggle(c,on){ if(on===undefined) on=!this.s.has(c); on?this.s.add(c):this.s.delete(c); },contains(c){return this.s.has(c)}},setAttribute(){},focus(){}});
  const ui=Object.create(Hg.G('UIManager').prototype); ui.$=el; return {ui,els,el};
}
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
test('index.html tem o painel da estação, os ícones de perks no HUD e "Melhorias" na mochila',()=>{
  for(const id of ['stationPanel','perkHud','packPerks']) assert.ok(html.includes(`id="${id}"`),id);
});
test('painel: nome, Adiante, 2 cartões (benefício/contrapartida/prévia), ativos e n/3, Escolher e Ignorar',()=>{
  const {g}=stationGame(); g.player.attributes.addPerk('powerful_launch'); g.openStation('E3');
  const {ui,el}=fakeUI(), v=g.stationView('E3'); ui.showStation(v); const h=el('stationPanel').innerHTML;
  assert.equal(el('stationPanel').hidden,false);
  for(const t of ['Cabine de guincho','Adiante:','Corpo leve','25% menos gravidade pessoal.','40% menos stamina máxima por mão.','Pegada econômica','Escolher','Ignorar','1/3','Impulso potente','100 → 60','18 → 13,5'])
    assert.ok(h.includes(t),'falta: '+t);
  assert.ok(!/class="pcard[^"]*sel/.test(h),'nada selecionado ainda'); assert.ok(/data-act="confirm"[^>]*disabled/.test(h),'Escolher desabilitado sem seleção');
  ui.showStation({...v,sel:1}); assert.ok(/class="pcard sel"[^>]*data-i="1"/.test(el('stationPanel').innerHTML),'cartão 2 selecionado');
  ui.hideStation(); assert.equal(el('stationPanel').hidden,true);
});
test('escolha em dois passos: 1/2 selecionam, Enter confirma; Enter sem seleção não faz nada; Esc ignora',()=>{
  const {g,p}=stationGame(); g.openStation('E1'); const key=code=>g._stationKey({code,repeat:false,preventDefault(){}});
  key('Enter'); assert.equal(g.state,'station'); assert.equal(p.attributes.activePerks.length,0);
  key('Digit2'); assert.equal(g.stationOpen.sel,1); key('Enter'); assert.equal(g.state,'play'); assert.equal(p.attributes.hasPerk('quick_recovery'),true);
  const b=stationGame(); b.g.openStation('E2'); b.g._stationKey({code:'Escape',repeat:false,preventDefault(){}}); assert.equal(b.g.state,'play'); assert.equal(b.g.stations.isUsed('E2'),false);
});
test('HUD mostra os ícones dos perks ativos (até 3 pelo jogo) e a mochila lista "Melhorias"; UI só lê',()=>{
  const {ui,el}=fakeUI(); const a=attrs(S.grip,S.light);
  const ro=new Proxy(a,{get:(t,k)=>{ if(['addPerk','removePerk','clearPerks'].includes(k)) throw new Error('UI escreveu em '+k); const v=t[k]; return typeof v==='function'?v.bind(t):v; }});
  ui.renderPerkHud({attributes:ro}); const hud=el('perkHud').innerHTML; assert.equal((hud.match(/class="perk-ic/g)||[]).length,2);
  ui.renderPackPerks({attributes:ro}); const pk=el('packPerks').innerHTML;
  for(const t of ['Melhorias','Pegada econômica','Corpo leve','15% menos consumo de pegada.','40% menos stamina máxima por mão.']) assert.ok(pk.includes(t),t);
  ui.renderPackPerks({attributes:attrs()}); assert.ok(el('packPerks').hidden||!/perk-row/.test(el('packPerks').innerHTML));
});
test('console: perks mostra n/3 e avisa acima do limite',()=>{
  for(const f of ['js/ui/DevConsole.js']) Hg.load(f);
  const DC=Hg.G('DevConsole'), a=attrs(S.grip,S.light,S.launch,S.recovery);
  const out=DC.execute('perks',{player:{attributes:a},state:'play',stations:{max:3}});
  assert.ok(/4\/3/.test(out),out); assert.ok(/acima do limite/i.test(out),out);
  const out2=DC.execute('perks',{player:{attributes:attrs(S.grip)},state:'play',stations:{max:3}}); assert.ok(/1\/3/.test(out2)&&!/acima/i.test(out2),out2);
});

// ---------------------------------------------------------------- VR (mock; Quest não testado)
for(const f of ['js/ui/VRPanel.js','js/ui/VRMenu.js','js/ui/VRHud.js','js/player/VRPlayer.js']) Hg.load(f);
test('VR: painel da estação no menu flutuante, em dois passos (selecionar → Escolher), Ignorar não consome',()=>{
  const {g,p}=stationGame(); const specs=[]; let closed=0;
  const vr=Object.create(Hg.G('VRPlayer').prototype); Object.assign(vr,{g,active:true,_menu:s=>specs.push(s),closeMenu(){ closed++; }}); g.vr=vr;
  g.openStation('E1'); let sp=specs.at(-1);
  assert.equal(sp.title,'Sala de controle'); assert.ok(sp.text.startsWith('Adiante:'));
  const lab=sp.buttons.map(b=>b.label); assert.ok(lab[0].includes('Impulso potente')&&lab[1].includes('Recuperação rápida'),lab.join('|'));
  const esc=sp.buttons.find(b=>b.label.startsWith('Escolher')); assert.equal(esc.disabled,true,'Escolher só depois de selecionar');
  sp.buttons[1].action(); sp=specs.at(-1); assert.ok(sp.buttons[1].label.startsWith('▶'),'selecionado marcado');
  assert.ok(sp.lines.some(([k,v])=>v.includes('20% mais recuperação')),'mostra benefício do selecionado');
  sp.buttons.find(b=>b.label.startsWith('Escolher')).action(); assert.equal(p.attributes.hasPerk('quick_recovery'),true); assert.equal(g.state,'play'); assert.ok(closed>=1);
  const b=stationGame(); const sp2=[]; const vr2=Object.create(Hg.G('VRPlayer').prototype); Object.assign(vr2,{g:b.g,active:true,_menu:s=>sp2.push(s),closeMenu(){}}); b.g.vr=vr2;
  b.g.openStation('E2'); sp2.at(-1).buttons.find(x=>x.label==='Ignorar').action(); assert.equal(b.g.state,'play'); assert.equal(b.g.stations.isUsed('E2'),false);
});
test('VRHud: ícones dos perks ativos no pulso',()=>{
  const hud=new (Hg.G('VRHud'))(); hud.wrist.visible=true; const a=attrs(S.grip,S.light);
  const el={textContent:'',classList:{contains:()=>false}}, ui={$:()=>el};
  hud.update(1,ui,{hands:[{stamina:50},{stamina:60}],attributes:a},null);
  assert.ok(hud.key.includes('economical_grip')&&hud.key.includes('light_body'),hud.key);
});

module.exports={test,ctx,G,need,attrs,stations,S,ROOT,done:()=>{ console.log(`${total} testes; falhas: ${failures}`); if(failures) process.exitCode=1; }};
if(require.main===module) module.exports.done();
