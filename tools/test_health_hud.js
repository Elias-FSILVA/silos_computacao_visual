'use strict';
// Tarefa 4 do plano Health: barra de vida sob o retículo (desktop), linha "vida" no relógio (VR), háptico e borda de dano.
// Spec §4.4 e §11 (D5). Three real via _items_harness; DOM com stub que conta escritas.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const H=require('./_items_harness.js')(['js/systems/progress.js','js/systems/PerkStations.js','js/Game.js']);
for(const f of ['js/ui/VRPanel.js','js/ui/VRMenu.js','js/ui/VRHud.js','js/player/VRPlayer.js']) H.load(f);
const ROOT=path.join(__dirname,'..');
let total=0,fails=0;
function test(name,fn){ total++; try{ fn(); console.log('OK',name); }catch(e){ fails++; console.error('FAIL',name,'-',e.message.split('\n').slice(0,6).join(' | ')); } }

// DOM falso: conta toda escrita de texto, estilo e classe
function fakeDOM(){
  const els={}, stat={writes:0};
  const mk=id=>{
    const s=new Set(), style=new Proxy({},{set(t,k,v){ if(t[k]!==v) stat.writes++; t[k]=v; return true; }});
    const el={id,hidden:false,dataset:{},style,_text:'',attrs:{},
      get textContent(){ return this._text; }, set textContent(v){ stat.writes++; this._text=String(v); },
      classList:{s,add(c){ if(!s.has(c)) stat.writes++; s.add(c); },remove(c){ if(s.has(c)) stat.writes++; s.delete(c); },
        toggle(c,on){ if(on===undefined) on=!s.has(c); on?this.add(c):this.remove(c); return on; },contains(c){ return s.has(c); }},
      setAttribute(k,v){ stat.writes++; this.attrs[k]=String(v); },focus(){},querySelector:()=>null};
    return el; };
  const $=id=>els[id]||(els[id]=mk(id));
  return {$,els,stat};
}
function ui(){ const d=fakeDOM(), u=Object.create(H.G('UIManager').prototype); u.$=d.$; return {u,...d}; }

test('saudavel_discreto',()=>{
  const {u,$}=ui(); u.setHealth({value:100,max:100,state:'healthy'});
  assert.equal($('hpN').textContent,'100');
  for(const c of ['hurt','injured','critical','recent']) assert.equal($('hp').classList.contains(c),false,c);
  assert.equal($('hpFill').style.width,'100%');
  assert.equal($('hpWord').hidden,true,'sem "crítico" quando saudável');
});
test('ferido_visivel',()=>{
  const {u,$}=ui(); u.setHealth({value:72,max:100,state:'hurt'});
  assert.equal($('hpN').textContent,'72'); assert.ok($('hp').classList.contains('hurt')); assert.equal($('hpFill').style.width,'72%');
  u.setHealth({value:40,max:100,state:'injured'}); assert.ok($('hp').classList.contains('injured')); assert.equal($('hp').classList.contains('hurt'),false);
  u.setHealth({value:25,max:100,state:'critical'});
  assert.ok($('hp').classList.contains('critical')); assert.equal($('hpN').textContent,'25');
  assert.equal($('hpWord').hidden,false); assert.equal($('hpWord').textContent,'crítico');
  assert.match($('hp').attrs['aria-label'],/25/);
});
test('rastro_mostra_o_que_se_perdeu',()=>{
  const {u,$}=ui(); u.setHealth({value:100,max:100,state:'healthy'}); u.setHealth({value:70,max:100,state:'hurt'});
  assert.equal($('hpFill').style.width,'70%'); assert.equal($('hpTrail').style.width,'70%','o rastro encolhe por transição CSS de 0,4 s');
  assert.equal($('hp').classList.contains('up'),false,'perda: rastro com transição');
  u.setHealth({value:90,max:100,state:'hurt'}); assert.ok($('hp').classList.contains('up'),'cura: rastro sem transição');
  const css=fs.readFileSync(path.join(ROOT,'css/hud.css'),'utf8');
  assert.match(css,/#hpTrail\{[^}]*transition:width \.4s/);
});
test('sem_escrita_repetida',()=>{
  const {u,stat}=ui(); const s={value:72,max:100,state:'hurt'};
  u.setHealth(s); const n=stat.writes; u.setHealth({...s}); u.setHealth({...s}); assert.equal(stat.writes,n);
});
test('flash_dano',()=>{
  const {u,$}=ui(); H.clock.now=1000; u.setHealth({value:100,max:100,state:'healthy'});
  u.flashDamage({amount:20}); assert.ok($('hurtEdge').classList.contains('on')); assert.ok($('hp').classList.contains('recent'));
  H.clock.now=2900; u.setHealth({value:80,max:100,state:'healthy'}); assert.ok($('hp').classList.contains('recent'),'1,9 s: ainda visível');
  H.clock.now=3100; u.setHealth({value:80,max:100,state:'healthy'}); assert.equal($('hp').classList.contains('recent'),false,'2 s depois volta a discreta');
  const css=fs.readFileSync(path.join(ROOT,'css/hud.css'),'utf8');
  assert.match(css,/#hurtEdge\.on\{[^}]*animation:hurtEdge \.3s/); assert.match(css,/@keyframes hurtEdge\{\s*from\{\s*opacity:\.25/);
  assert.match(css,/prefers-reduced-motion[^{]*\{[^@]*#hp\.critical #hpFill\{\s*animation:none/);
});
test('index_tem_barra_sob_o_retículo_e_borda',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const ret=html.slice(html.indexOf('<div id="reticle">')); const ret1=ret.slice(0,ret.indexOf('<div id="perkHud"'));
  for(const id of ['hp','hpTrail','hpFill','hpN','hpWord']) assert.ok(ret1.includes(`id="${id}"`),id+' dentro do #reticle');
  const hud=html.slice(html.indexOf('<div id="hud"'),html.indexOf('<div id="reticle">')); assert.ok(hud.includes('id="hurtEdge"'));
});
function vrHud(hp){
  const hud=new (H.G('VRHud'))(); hud.wrist.visible=true; const texts=[];
  const x=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='fillText'?(s)=>texts.push(String(s)):()=>{}),set:(t,k,v)=>{ t[k]=v; return true; }});
  hud.canvas={getContext:()=>x}; hud.tex={};
  const el={textContent:'',classList:{contains:()=>false}}, u={$:()=>el};
  const player={hands:[{stamina:50},{stamina:60}],attributes:{activePerks:[]},health:{snapshot:()=>hp}};
  hud.update(1,u,player,null); return {hud,texts};
}
test('vr_relogio',()=>{
  const a=vrHud({value:72,max:100,state:'hurt'}), b=vrHud({value:71,max:100,state:'hurt'});
  assert.notEqual(a.hud.key,b.hud.key); assert.ok(a.texts.includes('vida'),a.texts.join('|')); assert.ok(a.texts.includes('72'));
  const c=vrHud({value:20,max:100,state:'critical'}); assert.ok(c.texts.includes('crítico'),c.texts.join('|'));
});
function playerEvents(vrActive){
  const p=H.realPlayer(), calls={flash:[],haptic:[],kick:[]};
  p.handModels.forEach((hm,i)=>{ const k=hm.kick.bind(hm); hm.kick=a=>{ calls.kick.push([i,a]); k(a); }; });
  const vr=Object.create(H.G('VRPlayer').prototype); Object.assign(vr,{active:vrActive,_haptic:(i,v,ms)=>calls.haptic.push([i,v,ms])});
  const g=Object.create(H.G('Game').prototype);
  Object.assign(g,{player:p,audio:H.audio,vr,world:{},ui:{msg(){},flashDamage(d){ calls.flash.push(d); }}});
  g._bindPlayerEvents(); return {p,g,calls};
}
test('vr_haptico',()=>{
  const {p,calls}=playerEvents(true); p.damage(20,'fall');
  assert.deepEqual(calls.haptic.map(h=>h.join(',')).sort(),['0,0.35,60','1,0.35,60']);
  assert.equal(calls.flash.length,0,'em VR nenhum efeito de tela');
});
test('desktop_flash_e_tranco',()=>{
  const {p,calls}=playerEvents(false); p.damage(20,'impact');
  assert.equal(calls.flash.length,1); assert.equal(calls.flash[0].amount,20); assert.equal(calls.haptic.length,0);
  assert.deepEqual(calls.kick.map(k=>k.join(',')).sort(),['0,-5','1,-5'],'tranco nas duas mãos');
  calls.kick.length=0; p.damage(0,'impact'); assert.equal(calls.kick.length,0,'dano 0 não dá tranco');
});
test('game_liga',()=>{
  const p=H.realPlayer(); p.health.set(63);
  const g=Object.create(H.G('Game').prototype);
  Object.assign(g,{player:p,checkpoints:{justCollected:null,current:null},puzzles:{current:null},score:{score:0},timer:{time:0,finished:false},
    mass:{active:false,eta:()=>null},result:null,debugNavigation:null,playerName:''});
  const gs=g.getUIState(); assert.equal(JSON.stringify(gs.health),JSON.stringify({value:63,max:100,state:'hurt'}));
  // updateHUD encaminha o snapshot para setHealth
  const src=fs.readFileSync(path.join(ROOT,'js/ui/UIManager.js'),'utf8'), body=src.slice(src.indexOf('  updateHUD('));
  assert.match(body.slice(0,body.indexOf('\n  }\n')),/this\.setHealth\(gs\.health\)/);
});

console.log(`\n${total} testes; falhas: ${fails}`); process.exitCode=fails?1:0;
