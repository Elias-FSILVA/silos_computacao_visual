'use strict';
// A7: run assistida por debug nunca entra no ranking — duas barreiras (Game.saveScore e Ranking.save/load) + aviso no resultado/HUD.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
let total=0,bad=0;function test(name,f){total++;try{f();console.log('OK',name);}catch(e){bad++;console.error('FAIL',name,e.stack);}}
const SRC=fs.readFileSync('js/core/ranking.js','utf8');
function storage(init){const data={'silos.ranking.v1':JSON.stringify(init||[])},calls=[];return {calls,data,getItem:k=>k in data?data[k]:null,setItem(k,v){calls.push(k);data[k]=String(v);}};}
function ranking(LS){const ctx=vm.createContext({LS,JSON,Array});vm.runInContext(SRC+';this.Ranking=Ranking;',ctx);return new ctx.Ranking();}
const legacy={name:'Antigo',score:900,time:50,result:'fall',height:40,ending:null,date:'2026-01-01'};
const fair={name:'Limpo',score:1200,time:60,result:'fall',height:50,ending:null,date:'2026-10-17',assisted:false,competitiveEligible:true};
const cheat={name:'Debug',score:99999,time:1,result:'finish',height:400,ending:'escape',date:'2026-10-17',assisted:true,competitiveEligible:false,debugReasons:['goto']};

test('Ranking.save rejeita assistida/inelegível sem escrever (localStorage e memória)',()=>{
  for(const e of [cheat,{...fair,assisted:true},{...fair,competitiveEligible:false}]){
    const LS=storage([legacy]),before=LS.data['silos.ranking.v1'],r=ranking(LS);assert.equal(r.save({...e}),-1);assert.equal(LS.calls.length,0);assert.equal(LS.data['silos.ranking.v1'],before);
    const m=ranking(null),mem=JSON.stringify(m.mem);assert.equal(m.save({...e}),-1);assert.equal(JSON.stringify(m.mem),mem);}
});
test('Ranking aceita legado sem metadados e entrada elegível; load/top filtram assistidas declaradas',()=>{
  const LS=storage([legacy,cheat,{...fair,name:'X',competitiveEligible:false}]),r=ranking(LS);
  assert.deepEqual(r.load().map(e=>e.name),['Antigo']);assert.deepEqual(r.top(10).map(e=>e.name),['Antigo']);
  assert.equal(r.save({...fair}),0);assert.deepEqual(r.top(10).map(e=>e.name),['Limpo','Antigo']);
  assert.ok(!JSON.parse(LS.data['silos.ranking.v1']).some(e=>e.assisted===true));
});

// ---------- Game/UI com o mundo real ----------
function game(){
  const h=require('./_debug_harness')(),g=h.g,els={};
  const el=id=>els[id]||(els[id]={id,hidden:false,textContent:'',disabled:false,className:'',dataset:{},children:[],append(){},appendChild(){},classList:{add(){},remove(){},toggle(){}},style:{},focus(){}});
  h.load('js/core/ranking.js');const saves=[];g.ranking={save(e){saves.push(e);return 0;},top(){return [];}};
  Object.assign(g.ui,{$:el,hideNote(){},setPack(){},clearMsg(){},setHUD(){},show(){},hideScreens(){},results:[],showResult(r){this.results.push(r);}});
  Object.assign(g.audio,{siren(){},chime(){},boom(){},setRumble(){}});Object.assign(g.vr,{closeMenu(){},showResult(){}});
  g.stations={reset(){},isUsed(){return false;}};g.unlock=()=>{};g.lock=()=>{};
  return {h,g,nav:h.nav,els,saves};
}
const atCp=(h,id)=>h.p.position.copy(h.nav.safety.resolve(id).pose.position);
test('assistida persiste após off/back/pausa/espectador e endRun; lastRun leva metadados',()=>{
  const {h,g,nav}=game();assert.equal(nav.goto('cp6').ok,true);assert.equal(nav.back().ok,true);assert.equal(nav.setNoclip(true).ok,true);atCp(h,'cp6');assert.equal(nav.setNoclip(false).ok,true);
  g.pause();g._resumeNow();g.returnFromSpectator('play');
  assert.equal(nav.eligibility().assisted,true);g.endRun('fall');
  assert.equal(g.lastRun.assisted,true);assert.equal(g.lastRun.competitiveEligible,false);assert.deepEqual([...g.lastRun.debugReasons].sort(),['back','goto','noclip']);
  assert.ok(Number.isFinite(g.lastRun.score),'score diagnóstico permanece');
});
test('erros, consultas e speed sem ativar não marcam; reset limpa a marca',()=>{
  const {g,nav}=game();assert.equal(nav.setSpeed(20).ok,true);assert.equal(nav.goto('inexistente').ok,false);assert.equal(nav.back().ok,false);assert.equal(nav.setNoclip(false).ok,true);nav.eligibility();nav.backPose;
  assert.equal(nav.eligibility().assisted,false);g.endRun('fall');assert.equal(g.lastRun.assisted,false);assert.equal(g.lastRun.competitiveEligible,true);
  const b=game();assert.equal(b.nav.goto('cp6').ok,true);b.nav.reset();assert.equal(b.nav.eligibility().assisted,false);assert.equal(b.nav.eligibility().debugReasons.length,0);
});
test('Game.saveScore não chama Ranking para run assistida e mostra aviso; run normal salva com metadados',()=>{
  const a=game();assert.equal(a.nav.goto('cp6').ok,true);a.g.endRun('fall');a.g.saveScore();assert.equal(a.saves.length,0);
  assert.equal(a.els.btnSave.disabled,true);assert.match(a.els.resSaved.textContent,/Run assistida por debug — pontuação não competitiva/);assert.equal(a.g.savedIndex,-1);
  const n=game();n.g.endRun('fall');n.g.saveScore();assert.equal(n.saves.length,1);assert.equal(n.saves[0].assisted,false);assert.equal(n.saves[0].competitiveEligible,true);assert.ok(!('debugReasons' in n.saves[0])||n.saves[0].debugReasons.length===0);
});
test('UIManager.showResult: aviso + botão desabilitado na assistida; próxima run normal restaura',()=>{
  const {h}=game();const ui=Object.create(h.G('UIManager').prototype);
  const E={};const el=id=>E[id]||(E[id]={id,hidden:false,textContent:'',disabled:false,className:'',children:[],append(){},classList:{add(){},remove(){}},style:{}});ui.$=el;ui.show=()=>{};
  const run={name:'x',score:1,time:1,result:'fall',height:3,ending:null,breakdown:{total:1,height:1,speed:0,performance:0,penalties:0,checkpoints:0}};
  ui.showResult({...run,assisted:true,competitiveEligible:false,debugReasons:['noclip']});assert.equal(E.btnSave.disabled,true);assert.match(E.resSaved.textContent,/Run assistida por debug — pontuação não competitiva/);assert.equal(E.resScore.textContent,'1');
  ui.showResult({...run,assisted:false,competitiveEligible:true});assert.equal(E.btnSave.disabled,false);assert.equal(E.btnSave.textContent,'Salvar pontuação');assert.equal(E.resSaved.textContent,'');
});
test('VR: resultado assistido não oferece salvar',()=>{
  const {h,g,nav}=game();for(const f of ['js/ui/VRPanel.js','js/ui/VRMenu.js','js/ui/VRHud.js','js/player/VRPlayer.js'])h.load(f);
  const vr=Object.create(h.G('VRPlayer').prototype),specs=[];Object.assign(vr,{g,_menu:s=>specs.push(s)});
  assert.equal(nav.goto('cp6').ok,true);g.endRun('fall');vr.showResult();const s=specs.pop();const save=s.buttons[0];
  assert.equal(save.disabled,true);assert.doesNotMatch(save.label,/Salvar/);assert.match(s.text,/Run assistida/);let saved=0;g.ranking.save=()=>{saved++;return 0;};save.action&&save.action();assert.equal(saved,0);
});
test('HUD: RUN ASSISTIDA e NOCLIP visíveis só quando aplicáveis',()=>{
  const {h,g,nav}=game();const ui=Object.create(h.G('UIManager').prototype),E={};
  const el=id=>E[id]||(E[id]={id,hidden:false,textContent:'',dataset:{},className:'',innerHTML:'',children:[],append(){},setAttribute(){},classList:{add(){},remove(){},toggle(){}},style:{}});ui.$=el;
  ui.handEls=[0,1].map(()=>({el:el('h'),rect:el('r')}));ui.setReticle=()=>{};ui.renderPerkHud=()=>{};ui.renderSlots=()=>{};ui._renderSlots=()=>{};
  const hud=()=>{try{ui.updateHUD(g.getUIState(),g.player,{reticle:'dot',prompt:''},g.items);}catch(e){if(!E.debugBadge)throw e;}return E.debugBadge;};
  assert.equal(g.getUIState().debug.assisted,false);let b=hud();assert.equal(b.hidden,true);
  assert.equal(nav.setNoclip(true).ok,true);assert.deepEqual({...g.getUIState().debug},{assisted:true,noclip:true});b=hud();assert.equal(b.hidden,false);assert.equal(b.textContent,'RUN ASSISTIDA · NOCLIP');
  atCp(h,'cp6');assert.equal(nav.setNoclip(false).ok,true);b=hud();assert.equal(b.hidden,false);assert.equal(b.textContent,'RUN ASSISTIDA');
});

// ---------- Health T5: health / health set / damage / heal no console (Player, PlayerHealth e navegação reais) ----------
function hgame(){ const r=game(); r.h.load('js/ui/DevConsole.js'); const DC=r.h.G('DevConsole'); r.run=c=>DC.execute(c,r.g); return r; }
const ASS=' Run assistida (fora do ranking).';
test('health: consulta sem marcar; textos dos rótulos',()=>{
  const {g,nav,run}=hgame(); assert.equal(run('health'),'Vida: 100/100 · Saudável'); assert.equal(nav.eligibility().assisted,false);
  g.player.health.set(72); assert.equal(run('HEALTH'),'Vida: 72/100 · Machucado'); assert.equal(nav.eligibility().assisted,false);
});
test('health set / damage / heal: textos, valores e marca assistida "health"',()=>{
  const {g,nav,run}=hgame(), H=g.player.health;
  assert.equal(run('health set 100'),'Vida já está em 100/100 · Saudável.'); assert.equal(nav.eligibility().assisted,false,'nada mudou: não marca');
  assert.equal(run('health set 50'),'Vida definida: 50/100 · Ferido.'+ASS); assert.equal(H.value,50);
  assert.deepEqual([...nav.eligibility().debugReasons],['health']);
  assert.equal(run('damage 20'),'Dano 20: 30/100 · Ferido.'+ASS); assert.equal(H.value,30);
  assert.equal(run('heal 40'),'Cura 40: 70/100 · Machucado.'+ASS); assert.equal(H.value,70);
  assert.equal(run('health set 25'),'Vida definida: 25/100 · Crítico.'+ASS);
  assert.equal(run('heal 100'),'Cura 75: 100/100 · Saudável.'+ASS,'cura informa o aplicado');
  assert.equal(run('heal 20'),'Vida já está cheia (100/100).');
  assert.deepEqual([...nav.eligibility().debugReasons],['health']);
  assert.equal(g.player.dead,false);
});
test('valores inválidos recusados sem mexer na vida nem marcar',()=>{
  const {g,nav,run}=hgame(), H=g.player.health; H.set(60);
  assert.equal(run('health set 0'),'Use damage para testar a morte (health set aceita 1–100).');
  for(const c of ['health set 101','health set 50.5','health set abc','health set','health set 5 5','health set -3']) assert.equal(run(c),'Uso: health set <1–100>',c);
  for(const c of ['damage 0','damage 101','damage 1e2','damage -3','damage','damage 2 2']) assert.equal(run(c),'Uso: damage <1–100>',c);
  for(const c of ['heal x','heal 0','heal 101','heal']) assert.equal(run(c),'Uso: heal <1–100>',c);
  assert.equal(run('health 5'),'Uso: health · health set <1–100>');
  assert.equal(H.value,60); assert.equal(nav.eligibility().assisted,false);
});
test('fora de partida viva: recusado com o motivo, sem marcar',()=>{
  const a=hgame(); a.g.state='menu'; for(const c of ['health','health set 50','damage 5','heal 5']) assert.equal(a.run(c),'Erro: É necessária uma partida viva em jogo ou pausa',c);
  assert.equal(a.g.player.health.value,100); assert.equal(a.nav.eligibility().assisted,false);
  const b=hgame(); b.g.player.die('fall'); assert.match(b.run('heal 5'),/^Erro: É necessária uma partida viva/);
  const c=hgame(); c.g.state='console'; c.g.devConsoleReturnState='paused'; assert.equal(c.run('damage 5'),'Dano 5: 95/100 · Saudável.'+ASS,'console aberto sobre a pausa vale');
});
test('liveRun: só partida viva, sem a cláusula de XR; contextAllowed continua igual',()=>{
  const {g,nav}=hgame(); assert.equal(nav.liveRun().ok,true); g.vr.active=true; assert.equal(nav.liveRun().ok,true); assert.equal(nav.contextAllowed().ok,false); assert.match(nav.contextAllowed().reason,/desktop/);
  g.vr.active=false; g.timer.finish(); assert.equal(nav.liveRun().ok,false); assert.equal(nav.contextAllowed().reason,nav.liveRun().reason);
});
test('morte_ao_fechar_console: damage 100 mata, endRun("debug") só ao fechar, uma vez',()=>{
  const {h,g,run,els}=hgame(); g.settings.data.devConsoleEnabled=true; els.devConsole={hidden:true}; els.devConsoleInput={focus(){}};
  g.state='play'; g.openDevConsole(); assert.equal(g.state,'console');
  let ends=0; const end=g.endRun.bind(g); g.endRun=r=>{ ends++; end(r); };
  assert.equal(run('damage 100'),'Dano 100: 0/100 · a morte acontece ao fechar o console.'+ASS);
  assert.equal(g.player.dead,true); assert.equal(g.state,'console');
  for(let i=0;i<5;i++){ h.clock.now+=20; g._loop(h.clock.now); } assert.equal(ends,0,'console aberto: nada encerra');
  g.closeDevConsole(); assert.equal(g.state,'play');
  h.clock.now+=20; g._loop(h.clock.now); assert.equal(ends,1); assert.equal(g.state,'ending');
  for(let i=0;i<3;i++){ h.wall.advance(500); g._loop(h.clock.now); }
  assert.equal(ends,1); assert.equal(g.state,'result'); assert.equal(g.lastRun.result,'debug'); assert.equal(g.lastRun.assisted,true);
  assert.equal(g.ui.results.at(-1).result,'debug');
});
test('resultado e ranking: debug → "Ferimentos (debug)"; run com damage/heal não salva, só health salva',()=>{
  const {h}=hgame(); const ui=Object.create(h.G('UIManager').prototype), E={};
  const el=id=>E[id]||(E[id]={id,hidden:false,textContent:'',disabled:false,className:'',children:[],append(){},classList:{add(){},remove(){}},style:{}}); ui.$=el; ui.show=()=>{};
  ui.showResult({name:'x',score:1,time:1,result:'debug',height:3,ending:null,assisted:true,competitiveEligible:false,debugReasons:['health'],breakdown:{total:1,height:1,speed:0,performance:0,penalties:0,checkpoints:0}});
  assert.equal(E.resT.textContent,'Ferimentos (debug)'); assert.equal(E.resT.className,'danger');
  const a=hgame(); a.run('damage 10'); a.g.endRun('fall'); a.g.saveScore(); assert.equal(a.saves.length,0); assert.equal(a.g.savedIndex,-1);
  const b=hgame(); b.run('heal 10'); b.g.player.health.set(50); b.run('heal 10'); b.g.endRun('fall'); b.g.saveScore(); assert.equal(b.saves.length,0);
  const c=hgame(); c.run('health'); c.g.endRun('fall'); c.g.saveScore(); assert.equal(c.saves.length,1); assert.equal(c.saves[0].competitiveEligible,true);
});
console.log(`${total} testes; falhas: ${bad}`);process.exitCode=bad?1:0;
