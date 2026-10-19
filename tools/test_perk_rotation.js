'use strict';
// Rotação de perks por subida: sorteio de 2 ofertas por estação, sem repetir na subida, fortes só no fim; perks novos.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
let failures=0,total=0;
function test(name,fn){ total++; try{ fn(); console.log('OK',name); }catch(e){ failures++; console.error('FAIL',name,'-',e.message.split('\n')[0]); } }
const ctx=vm.createContext({console,Math});
for(const f of ['js/player/perkDefs.js','js/player/PlayerAttributes.js','js/systems/PerkStations.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
const G=n=>vm.runInContext(`typeof ${n}!=='undefined'?${n}:undefined`,ctx);
const PERK_DEFS=G('PERK_DEFS'), STATION_DEFS=G('STATION_DEFS'), PerkStations=G('PerkStations'), PlayerAttributes=G('PlayerAttributes'), BASE=G('PLAYER_BASE_ATTRIBUTES');
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-9,`${m||''} ${a} != ${b}`);
// gerador determinístico (mulberry32) para sorteios reprodutíveis
const seeded=s=>()=>{ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const fresh=(seed,...ids)=>{ const a=new PlayerAttributes(); ids.forEach(id=>assert.ok(a.addPerk(id),id)); return {a,st:new PerkStations(a,{rng:seeded(seed)})}; };
const GENERAL=['economical_grip','quick_recovery','powerful_launch','long_arms','calloused_hands','short_breath','economical_launch'];

// ---------------------------------------------------------------- perks novos
const NEW={
  long_arms:{name:'Braços longos',m:{reach:1.1,tiredReach:1.1,gripDrainMultiplier:1.15}},
  calloused_hands:{name:'Mãos calejadas',m:{fatigueGainMultiplier:.75,fatigueRecoveryMultiplier:.75}},
  short_breath:{name:'Respiro curto',m:{freeHandRecovery:1.4,groundRecovery:.8}},
  economical_launch:{name:'Salto econômico',m:{wallJumpStaminaCost:.7,wallJumpSpeed:.92}},
  anchor:{name:'Âncora',m:{gripDrainMultiplier:.8,gravity:1.1}},
  deep_breath:{name:'Fôlego fundo',m:{maxStamina:1.25,groundRecovery:.8,freeHandRecovery:.8}}
};
test('10 perks no catálogo: os 4 de antes e os 6 novos',()=>{
  assert.deepEqual(Object.keys(PERK_DEFS).sort(),[...GENERAL,'anchor','deep_breath','light_body'].sort());
});
for(const [id,d] of Object.entries(NEW)) test(`${d.name} (${id}): vantagem e contrapartida aprovadas`,()=>{
  const p=PERK_DEFS[id]; assert.ok(p,id); assert.equal(p.name,d.name); assert.ok(p.benefit&&p.tradeoff);
  assert.deepEqual({...p.multipliers},d.m);
  const a=new PlayerAttributes(); assert.equal(a.addPerk(id),true);
  for(const k of Object.keys(BASE)) near(a.effective[k],BASE[k]*(d.m[k]??1),`${id}.${k}`);
});
test('os 10 juntos continuam válidos (sem atributo zerado ou infinito)',()=>{
  const a=new PlayerAttributes(); for(const id of Object.keys(PERK_DEFS)) assert.equal(a.addPerk(id),true,id);
  for(const v of Object.values(a.effective)) assert.ok(Number.isFinite(v)&&v>0);
});
test('cada perk tem ícone no HUD',()=>{
  const src=fs.readFileSync(path.join(ROOT,'js/ui/UIManager.js'),'utf8'), block=src.slice(src.indexOf('const PERK_ICONS'),src.indexOf('function perkIcon'));
  for(const id of Object.keys(PERK_DEFS)) assert.ok(new RegExp(`\\b${id}:`).test(block),`sem ícone: ${id}`);
});

// ---------------------------------------------------------------- pools por estação
test('pools: E1 só gerais; E2 + Âncora; E3 + Âncora, Fôlego fundo e Corpo leve',()=>{
  assert.deepEqual([...STATION_DEFS.E1.pool].sort(),[...GENERAL].sort());
  assert.deepEqual([...STATION_DEFS.E2.pool].sort(),[...GENERAL,'anchor'].sort());
  assert.deepEqual([...STATION_DEFS.E3.pool].sort(),[...GENERAL,'anchor','deep_breath','light_body'].sort());
  for(const e of ['E1','E2','E3']) for(const id of STATION_DEFS[e].pool) assert.ok(PERK_DEFS[id],`${e}: ${id}`);
});

// ---------------------------------------------------------------- sorteio
test('cada estação oferece 2, do próprio pool, e nenhum perk se repete entre as 3 estações (2000 subidas)',()=>{
  for(let s=1;s<=2000;s++){ const {st}=fresh(s); const all=[];
    for(const e of ['E1','E2','E3']){ const o=Array.from(st.offers(e)); assert.equal(o.length,2,`seed ${s} ${e}`);
      o.forEach(id=>assert.ok(STATION_DEFS[e].pool.includes(id),`seed ${s}: ${id} fora do pool de ${e}`)); all.push(...o); }
    assert.equal(new Set(all).size,6,`seed ${s} repetiu: ${all}`);
  }
});
test('variedade: todo perk do pool aparece em sua estação, e as ofertas mudam entre subidas',()=>{
  const seen={E1:new Set(),E2:new Set(),E3:new Set()}, combos=new Set();
  for(let s=1;s<=2000;s++){ const {st}=fresh(s); for(const e of ['E1','E2','E3']) st.offers(e).forEach(id=>seen[e].add(id)); combos.add(['E1','E2','E3'].map(e=>[...st.offers(e)].sort().join('+')).join('|')); }
  for(const e of ['E1','E2','E3']) assert.deepEqual([...seen[e]].sort(),[...STATION_DEFS[e].pool].sort(),e);
  assert.ok(combos.size>200,`só ${combos.size} combinações`);
});
test('ofertas fixas durante a subida: consultar, ignorar ou escolher noutra estação não re-sorteia',()=>{
  const {st}=fresh(7); const snap=()=>['E1','E2','E3'].map(e=>Array.from(st.offers(e)).join(','));
  const before=snap(); for(let i=0;i<20;i++) st.offers('E2'); assert.deepEqual(snap(),before);
  const pick=st.offers('E1')[1]; assert.equal(st.choose('E1',pick).ok,true);
  assert.deepEqual(snap().slice(1),before.slice(1),'E2/E3 iguais depois de escolher na E1');
});
test('reset() (nova subida) sorteia de novo',()=>{
  const {a,st}=fresh(11), runs=new Set();
  for(let i=0;i<30;i++){ runs.add(['E1','E2','E3'].map(e=>st.offers(e).join(',')).join('|')); a.clearPerks(); st.reset(); }
  assert.ok(runs.size>20,`só ${runs.size} subidas diferentes`);
});
test('perk ativo pelo console sai da oferta sem trocar o outro (1 oferta; 0 → empty)',()=>{
  const {a,st}=fresh(3), [x,y]=Array.from(st.offers('E2'));
  a.addPerk(x); assert.deepEqual(Array.from(st.offers('E2')),[y]);
  a.addPerk(y); assert.deepEqual(Array.from(st.offers('E2')),[]); assert.equal(st.canChoose('E2').reason,'empty');
});
test('rng padrão é Math.random (sem rng injetado, ainda 2 por estação e sem repetição)',()=>{
  const st=new PerkStations(new PlayerAttributes()); const all=['E1','E2','E3'].flatMap(e=>Array.from(st.offers(e)));
  assert.equal(all.length,6); assert.equal(new Set(all).size,6);
});

// ---------------------------------------------------------------- efeito no jogador real
const log=console.log; console.log=()=>{};
const H=require('./_items_harness.js')(['js/systems/progress.js','js/systems/PerkStations.js','js/Game.js']); console.log=log;
test('Braços longos aumenta o alcance real do jogador (descansado e cansado)',()=>{
  const p=H.realPlayer(); near(p.reach,2); p.attributes.addPerk('long_arms'); near(p.reach,2.2);
  p.hands.forEach(h=>{ h.stamina=10; }); near(p.reach,1.7*1.1);
});
test('Fôlego fundo: stamina máxima 125 no jogador real',()=>{
  const p=H.realPlayer(); p.attributes.addPerk('deep_breath'); assert.equal(p.maxStamina,125);
});
test('Game: nova subida (stations.reset, chamado por resetRun/endRun) sorteia de novo; reabrir a estação mostra as mesmas ofertas',()=>{
  const Game=H.G('Game'), p=H.realPlayer(), g=Object.create(Game.prototype), shown=[];
  const noop=()=>{}, el={hidden:true,textContent:'',focus(){},addEventListener(){}};
  Object.assign(g,{state:'play',player:p,keys:{},gameBtn:{},timer:new (H.G('TimerSystem'))(),audio:H.audio,vr:{active:false,showPause:noop,closeMenu:noop,recenter:noop},
    items:{releaseUse:noop,reset:noop,use:noop},settings:{data:{}},world:{stations:[],reset:noop},
    ui:{$:()=>el,setPack:noop,clearMsg:noop,show:noop,hideNote:noop,msg:noop,showStation(v){ shown.push(v.offers.map(o=>o.id).join(',')); },hideStation:noop,resetPack:noop,hideScreens:noop,setHUD:noop,showResult:noop},
    lock:noop,unlock:noop});
  g.stations=new (H.G('PerkStations'))(p.attributes,{rng:seeded(5)}); g.timer.start();
  g.openStation('E2'); g.closeStation(); g.openStation('E2'); g.closeStation();
  assert.equal(shown[0],shown[1],'ignorar e reabrir não muda');
  const runs=new Set([shown[0]]);
  for(let i=0;i<15;i++){ g.stations.reset(); g.state='play'; g.openStation('E2'); runs.add(shown[shown.length-1]); g.closeStation(); }
  assert.ok(runs.size>5,`só ${runs.size} variações da E2`);
});

console.log(`${total} testes; falhas: ${failures}`); process.exitCode=failures?1:0;
