'use strict';
// Picareta (Climbing Axe): superfícies, inventário perHand, física de fixação, estados/entrada e VR.
const assert=require('node:assert/strict');
const log=console.log; console.log=()=>{};
const L=require('./_load.js'); console.log=log;
const {world,vm}=L;
let failures=0,total=0;
function test(name,fn){ total++; try{ fn(); log('OK',name); }catch(e){ failures++; console.error('FAIL',name,'-',e.message.split('\n')[0]); } }
const G=n=>vm.runInThisContext(`typeof ${n}!=='undefined'?${n}:undefined`);
const isAxe=o=>{ const f=G('isAxeSurface'); if(!f) throw new Error('isAxeSurface is not defined'); return f(o); };

// ---------------------------------------------------------------- superfícies
test('toda rachadura do mundo é axe e continua agarrável pela mão',()=>{
  const cracks=world.grabbables.filter(m=>m.userData.type==='crack'); assert.ok(cracks.length>=5,'há rachaduras');
  for(const c of cracks){ assert.equal(isAxe(c),true); assert.equal(c.userData.grab,true); }
});
test('rachaduras e faixas são atingíveis pelo raio de dentro do poço (faces para dentro ou DoubleSide)',()=>{
  const facesIn=m=>{ const P=m.geometry.attributes.position.array; let bad=0;
    for(let i=0;i<P.length;i+=9){ const a=[P[i],P[i+1],P[i+2]], b=[P[i+3],P[i+4],P[i+5]], c=[P[i+6],P[i+7],P[i+8]];
      const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]], n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if(n[0]*-a[0]+n[2]*-a[2]<=0) bad++; } return bad===0; };
  const band=world._rockBand([[2.0,21.0],[2.05,23.0]],{lamp:false});
  for(const m of [...world.grabbables.filter(m=>m.userData.type==='crack'),band])
    assert.ok(m.material.side===THREE.DoubleSide||facesIn(m),`${m.userData.type} em y≈${m.userData.samples[0].p.y.toFixed(0)} só é atingível por trás`);
  for(const arr of [world.raycastTargets,world.walls]){ const i=arr.indexOf(band); if(i>=0) arr.splice(i,1); }
});
test('_rockBand: axe, sem grab, alvo de raycast e fora das agarras',()=>{
  const n0=world.raycastTargets.length;
  const b=world._rockBand([[1.0,20.0],[1.05,22.5]]);
  assert.equal(isAxe(b),true); assert.ok(!b.userData.grab,'mão nua não segura');
  assert.equal(b.userData.type,'rockband'); assert.equal(typeof b.userData.normalAt,'function');
  assert.ok(b.userData.samples.length>=5,'amostras ao longo da faixa');
  assert.ok(world.raycastTargets.includes(b)); assert.equal(world.raycastTargets.length,n0+1);
  assert.ok(!world.grabbables.includes(b));
  // remove a faixa de teste (o mundo é compartilhado só neste processo)
  for(const arr of [world.raycastTargets,world.walls]){ const i=arr.indexOf(b); if(i>=0) arr.splice(i,1); }
});
test('nada além de rachaduras e faixas é axe (agarras, pregos, canos, cordas, portas, paredes, interativos)',()=>{
  const all=new Set([...world.grabbables,...world.walls,...world.interactables,...world.raycastTargets]);
  const seen={};
  for(const m of all){ const t=m.userData.type; seen[t]=(seen[t]||0)+1;
    if(t==='crack'||t==='rockband') continue;
    assert.equal(isAxe(m),false,`${t} não pode ser axe`); }
  for(const t of ['hold','pipe','rope','wall']) assert.ok(seen[t]>0,'o mundo tem '+t);
  const nail=world.addNail?world.addNail(new L.V3(6,5,0),new L.V3(-1,0,0)):null;
  if(nail){ assert.equal(isAxe(nail),false,'prego'); }
});
test('exclusões sempre vencem a marca axe',()=>{
  for(const t of G('AXE_EXCLUDE_TYPES')) assert.equal(isAxe({userData:{axe:true,type:t}}),false,t);
  assert.equal(isAxe({userData:{axe:true,type:'crack',noAxe:true}}),false,'noAxe');
  assert.equal(isAxe({userData:{axe:true,type:'crack',interactable:{}}}),false,'interativo');
  assert.equal(isAxe({userData:{type:'crack'}}),false,'sem marca explícita');
  assert.equal(isAxe({userData:{axe:true,type:'crack'}}),true);
  assert.equal(isAxe(null),false); assert.equal(isAxe({}),false);
  for(const t of ['door','breakable','plate','rope','pipe','nail','hold']) assert.ok(G('AXE_EXCLUDE_TYPES').includes(t),t);
});
test('nenhuma superfície axe fora do poço (halls, labirinto e puzzles ficam no corpo do silo)',()=>{
  for(const m of world.raycastTargets) if(isAxe(m)) for(const s of m.userData.samples){ const r=Math.hypot(s.p.x,s.p.z); assert.ok(r<=SHAFT_R+.01,`amostra a r=${r.toFixed(2)}`); }
});

// ---------------------------------------------------------------- inventário (perHand) e reserva de unidades
const Hx=require('./_items_harness.js')();
const AX='climbing_axe';
test('ITEM_DEFS.climbing_axe: Picareta, pilha de 2, perHand, modelo e ícone',()=>{
  const d=Hx.G('ITEM_DEFS')[AX]; assert.ok(d,'definido'); assert.equal(d.name,'Picareta'); assert.equal(d.stack,true); assert.equal(d.maxStack,2); assert.equal(d.perHand,true);
  assert.equal(d.grip,'fist'); assert.ok(d.make()&&d.pickup()); assert.ok(Hx.G('ICONS')[AX],'ícone SVG');
  assert.equal(Hx.G(`itemLabel('${AX}',1)`),'picareta'); assert.equal(Hx.G(`itemLabel('${AX}',2)`),'2 picaretas');
});
test('pilha de 2 num slot só; receive respeita o limite',()=>{
  const inv=new (Hx.G('Inventory'))();
  let r=inv.receive(AX,1); assert.equal(r.accepted,1); r=inv.receive(AX,3); assert.equal(r.accepted,1); assert.equal(r.remaining,2); assert.equal(r.reason,'limit');
  assert.equal(inv.count(AX),2); assert.equal(inv.usedSlots,1);
});
test('vínculo perHand: um atalho em cada grupo; mover dentro do grupo preserva o outro',()=>{
  const inv=new (Hx.G('Inventory'))(); inv.add(AX,2); inv.add('hammer');
  assert.ok(inv.bind(0,AX)); assert.ok(inv.bind(2,AX)); assert.deepEqual(Array.from(inv.bindingsOf(AX)),[0,2]);
  assert.ok(inv.bind(1,AX)); assert.deepEqual(Array.from(inv.bindingsOf(AX)),[1,2],'1→2 dentro da esquerda; o 3 fica');
  assert.equal(inv.bindingOf(AX,0),1); assert.equal(inv.bindingOf(AX,1),2); assert.equal(inv.bindingOf(AX),1);
  // item comum segue com um vínculo só
  inv.bind(0,'hammer'); inv.bind(3,'hammer'); assert.deepEqual(Array.from(inv.bindingsOf('hammer')),[3]);
  assert.deepEqual(Array.from(inv.bindingsOf(AX)),[1,2]);
});
test('uma picareta: equipa na esquerda; a direita é recusada com aviso e deny',()=>{
  const {it,msgs}=Hx.makeGame(); it.inv.add(AX,1); it.inv.bind(0,AX); it.inv.bind(2,AX);
  it.selectQuick(0); Hx.settle(it.left); assert.equal(it.equippedFor('left'),AX);
  Hx.audio.calls=[]; it.selectQuick(2); Hx.settle(it); assert.equal(it.equippedFor('right'),null);
  assert.ok(msgs.includes('Você só tem uma picareta'),msgs.join('|')); assert.ok(Hx.audio.calls.includes('deny'));
});
test('duas picaretas: as duas mãos equipam; pegar a 2ª com uma já na mão libera a outra',()=>{
  const {it}=Hx.makeGame(); it.inv.add(AX,1); it.inv.bind(0,AX); it.inv.bind(2,AX);
  it.selectQuick(0); Hx.settle(it.left); it.selectQuick(2); Hx.settle(it); assert.equal(it.equippedFor('right'),null);
  it.inv.receive(AX,1); it.selectQuick(2); Hx.settle(it);
  assert.equal(it.equippedFor('left'),AX); assert.equal(it.equippedFor('right'),AX); assert.equal(it._freeUnits(AX),0);
});
test('select com lado explícito vence o vínculo; isSelected marca cada mão',()=>{
  const {it}=Hx.makeGame(); it.inv.add(AX,2); it.inv.bind(0,AX); it.inv.bind(2,AX); const i=it.inv.slotOf(AX);
  it.select(i,'right'); Hx.settle(it); assert.equal(it.equippedFor('right'),AX); assert.equal(it.equippedFor('left'),null);
  assert.equal(it.isSelected(i,'right'),true); assert.equal(it.isSelected(i,'left'),false); assert.equal(it.isSelected(i),true);
  it.select(i,'left'); Hx.settle(it.left); assert.equal(it.isSelected(i,'left'),true);
});
test('itens comuns continuam com um vínculo e a mão pelo vínculo',()=>{
  const {it}=Hx.makeGame(); it.inv.add('hammer'); it.inv.add('pills',2); it.inv.bind(1,'hammer'); it.inv.bind(3,'pills');
  it.select(it.inv.slotOf('hammer')); Hx.settle(it.left); assert.equal(it.equippedFor('left'),'hammer');
  it.select(it.inv.slotOf('pills')); Hx.settle(it); assert.equal(it.equippedFor('right'),'pills');
});

test('troca enfileirada na direita (martelo → picareta) fica na direita mesmo com a picareta vinculada também na esquerda',()=>{
  const {it}=Hx.makeGame(); it.inv.add(AX,2); it.inv.add('hammer'); it.inv.bind(0,AX); it.inv.bind(2,AX); it.inv.bind(3,'hammer');
  it.selectQuick(3); Hx.settle(it); assert.equal(it.equippedFor('right'),'hammer');
  it.selectQuick(2); Hx.settle(it); Hx.settle(it);
  assert.equal(it.equippedFor('right'),AX); assert.equal(it.equippedFor('left'),null);
});
test('hotbar: o estado da picareta é por atalho (1 e 3 independentes)',()=>{
  const {it,p}=Hx.makeGame(); it.inv.add(AX,1); it.inv.bind(0,AX); it.inv.bind(2,AX);
  it.selectQuick(0); Hx.settle(it.left);
  const UI=Hx.G('UIManager'), ui=Object.create(UI.prototype), i=it.inv.slotOf(AX);
  assert.equal(ui.slotInfo(it,p,i,0).k,'eq'); assert.notEqual(ui.slotInfo(it,p,i,2).k,'eq');
});

test('a mochila do jogo cabe os 5 tipos de item (cartão ainda guardado ao chegar à 1ª picareta)',()=>{
  const {it}=Hx.makeGame(); for(const [id,n] of [['hammer',1],['nails',3],['pills',1],['card',1]]) it.inv.add(id,n);
  const r=it.inv.receive(AX,1); assert.equal(r.accepted,1,'picareta coube: '+r.reason);
  assert.ok(it.inv.size>=Object.keys(Hx.G('ITEM_DEFS')).length);
});

// ---------------------------------------------------------------- física de fixação (Player)
const T3=Hx.THREE, idle={x:0,y:0};
// parede de teste em frente ao jogador: rachadura (axe+grab, gripCost 1.2), faixa (axe, sem grab) ou agarra comum
function surface(kind,y=6.4){
  const m=new T3.Mesh(new T3.BoxGeometry(.6,.6,.1)); m.position.set(0,y,0); m.updateMatrixWorld();
  const n=new T3.Vector3(0,0,1);
  m.userData=kind==='crack'?{grab:true,axe:true,type:'crack',alive:true,gripCost:1.2,wallNormal:n}:kind==='band'?{axe:true,type:'rockband',alive:true,wallNormal:n}:{grab:true,type:'hold',alive:true,wallNormal:n};
  return m;
}
function aimAt(p,m){ p.eyePos(p.camera.position); p.camera.lookAt(m.position); p.camera.updateMatrixWorld(); }
// pendura a mão i na superfície sem passar por anchorAxe (para comparar drenos com o mesmo estado inicial)
function hang(p,i,m,anchor){ const h=p.hands[i]; h.inContact=h.isGrabbing=true; h.surface=m; h.anchor=anchor; h.point.set(i?.15:-.15,m.position.y,.05); h.normal.set(0,0,1); if(anchor==='axe') h.occupied=true; p.grounded=false; p._fitPull(); return h; }
function run(p,sec,fps=60,input=idle){ const n=Math.round(sec*fps); for(let k=0;k<n;k++) p.update(1/fps,input); }
const near=(a,b,e,msg)=>assert.ok(Math.abs(a-b)<=e,`${msg||''} ${a} ≠ ${b}`);

test('fixar custa 5 × gripDrainMultiplier (5 sem perks; 4,25 com Pegada econômica)',()=>{
  for(const [perks,cost] of [[[],5],[['economical_grip'],4.25]]){
    const p=Hx.realPlayer(); perks.forEach(id=>p.attributes.addPerk(id)); const c=surface('crack'); p.world.raycastTargets=[c]; aimAt(p,c);
    p.rightHand.occupied=true; const hit=p.axeTarget(1); assert.ok(hit,'alvo válido'); const r=p.anchorAxe(1,hit);
    assert.deepEqual({...r},{ok:true,reason:null,bite:'deep'}); near(p.rightHand.stamina,100-cost,1e-9,'custo');
    const h=p.rightHand; assert.equal(h.inContact,true); assert.equal(h.isGrabbing,true); assert.equal(h.anchor,'axe'); assert.equal(h.surface,c);
  }
});
test('axeTarget aceita só superfícies axe (faixa sim, agarra comum não); anchorAxe recusa o resto',()=>{
  const p=Hx.realPlayer(); const b=surface('band'), hold=surface('hold'); p.world.raycastTargets=[b]; aimAt(p,b);
  assert.ok(p.axeTarget(0),'faixa'); p.world.raycastTargets=[hold]; aimAt(p,hold); assert.equal(p.axeTarget(0),null,'agarra comum');
  const fake={object:hold,point:new T3.Vector3(0,6.4,.05),distance:1}; assert.equal(p.anchorAxe(0,fake).reason,'surface'); assert.equal(p.leftHand.stamina,100);
});
test('stamina menor que o custo: falha sem cobrar',()=>{
  const p=Hx.realPlayer(); const c=surface('crack'); p.world.raycastTargets=[c]; aimAt(p,c); p.leftHand.stamina=4.9;
  const r=p.anchorAxe(0,p.axeTarget(0)); assert.equal(r.ok,false); assert.equal(r.reason,'stamina'); assert.equal(p.leftHand.stamina,4.9); assert.equal(p.leftHand.inContact,false);
});
test('3 s pendurado: picareta na rachadura = mão nua na agarra comum = mão nua na rachadura − 3,6',()=>{
  const A=Hx.realPlayer(), B=Hx.realPlayer(), C=Hx.realPlayer();
  hang(A,1,surface('crack'),'axe'); hang(B,1,surface('hold'),'hand'); hang(C,1,surface('crack'),'hand');
  for(const p of [A,B,C]) run(p,3);
  near(100-A.rightHand.stamina,100-B.rightHand.stamina,1e-6,'picareta × agarra');
  near((100-C.rightHand.stamina)-(100-A.rightHand.stamina),3.6,1e-6,'rachadura nua − picareta');
});
test('a fadiga se acumula igual com picareta e com a mão',()=>{
  const A=Hx.realPlayer(), B=Hx.realPlayer(); hang(A,1,surface('crack'),'axe'); hang(A,0,surface('hold'),'hand'); hang(B,1,surface('crack'),'hand'); hang(B,0,surface('hold'),'hand');
  for(let k=0;k<180;k++){ for(const p of [A,B]){ if(k%3===0) p.pullBy(6); p.update(1/60,idle); } }
  near(A.pullFatigue,B.pullFatigue,1e-9,'fadiga'); near(A.pull,B.pull,1e-9,'puxada');
});
test('exaustão: axeDislodged, solta e cai sem outro apoio',()=>{
  const p=Hx.realPlayer(); const h=hang(p,1,surface('band'),'axe'); h.stamina=1; let ev=0; p.on('axeDislodged',()=>ev++);
  run(p,.5); assert.equal(ev,1); assert.equal(h.inContact,false); assert.equal(h.anchor,null); assert.equal(h.exhausted,true); assert.ok(p.velocity.y<0,'caindo');
});
test('vento acima de WIND_TEAR arranca a picareta (axeDislodged)',()=>{
  const p=Hx.realPlayer(); const h=hang(p,1,surface('band'),'axe'); let ev=0; p.on('axeDislodged',()=>ev++);
  p.world.wind=()=>({air:new T3.Vector3(20,0,0),g:0,fan:null}); p.update(1/60,idle);
  assert.equal(h.inContact,false); assert.equal(ev,1);
});
test('superfície que deixa de existir solta a picareta',()=>{
  const p=Hx.realPlayer(); const m=surface('crack'); const h=hang(p,1,m,'axe'); let ev=0; p.on('axeDislodged',()=>ev++);
  m.userData.alive=false; p.update(1/60,idle); assert.equal(h.inContact,false); assert.equal(h.anchor,null); assert.equal(ev,1);
});
test('picareta + mão nua: puxam e fazem mantle a partir da pegada de mão',()=>{
  const p=Hx.realPlayer(); const ledge=surface('hold',7.5); ledge.userData.plat={minX:-1,maxX:1,minZ:-1,maxZ:1,top:7.5,bottom:7.2};
  hang(p,1,surface('crack',7.3),'axe'); hang(p,0,ledge,'hand'); p.leftHand.point.set(-.15,7.5,.05);
  p.pull=p.pullTarget=.6; p.jump(); assert.ok(p.mantle,'mantle'); assert.equal(p.rightHand.inContact,false); assert.equal(p.rightHand.anchor,null);
});
test('salto agarrado sai da picareta com o custo atual',()=>{
  const p=Hx.realPlayer(); const h=hang(p,1,surface('band'),'axe'); const s=h.stamina; p.jump();
  assert.equal(h.inContact,false); near(h.stamina,s-p.attributes.effective.wallJumpStaminaCost,1e-9); near(p.velocity.y,9,1e-9);
});
test('picareta cravada: âncora válida, sem lockOff nem conflito de mira; o outro braço puxa',()=>{
  const p=Hx.realPlayer(); hang(p,1,surface('band'),'axe'); hang(p,0,surface('hold'),'hand'); p.pull=p.pullTarget=.3;
  assert.equal(p.lockOff,false); assert.equal(p.aimConflict,false); assert.equal(p.canPull,true);
  p.leftHand.inContact=false; p.leftHand.anchor=null; assert.equal(p.lockOff,false,'só a picareta segurando'); assert.equal(p.canPull,true);
});
test('Corpo leve reduz a gravidade também ao soltar da picareta',()=>{
  const a=Hx.realPlayer(), b=Hx.realPlayer(); b.attributes.addPerk('light_body');
  for(const p of [a,b]){ hang(p,1,surface('band'),'axe'); p.releaseAxe(1); p.velocity.set(0,0,0); run(p,.2); }
  near(b.velocity.y/a.velocity.y,.75,.02,'razão das quedas');
});
test('consistência de FPS: stamina após 4 s pendurado pela picareta varia ≤ 2% entre 30/60/120',()=>{
  const out=[30,60,120].map(fps=>{ const p=Hx.realPlayer(); const h=hang(p,1,surface('crack'),'axe'); run(p,4,fps); return h.stamina; });
  const used=out.map(s=>100-s), m=Math.max(...used), n=Math.min(...used); assert.ok((m-n)/m<=.02,used.join(' / '));
});
test('morte, reset e releaseAll deixam anchor=null e inContact=false nas duas mãos',()=>{
  for(const how of ['die','reset','releaseAll']){
    const p=Hx.realPlayer(); hang(p,1,surface('band'),'axe'); hang(p,0,surface('crack'),'axe');
    if(how==='die') p.die('fall'); else p[how]();
    for(const h of p.hands){ assert.equal(h.anchor,null,how); assert.equal(h.inContact,false,how); }
  }
});
test('releaseAxe solta só a mão cravada indicada e não mexe em pegada de mão',()=>{
  const p=Hx.realPlayer(); hang(p,1,surface('band'),'axe'); hang(p,0,surface('hold'),'hand');
  p.releaseAxe(0); assert.equal(p.leftHand.inContact,true,'mão nua intacta');
  p.releaseAxe(1); assert.equal(p.rightHand.inContact,false); assert.equal(p.rightHand.isGrabbing,false);
});

// ---------------------------------------------------------------- estados da picareta (ItemSystem) e desktop
// jogo com Player real e picareta(s) prontas; a parede (faixa) fica à frente da câmera
function axeGame(n=1,kind='band'){
  const G0=Hx.makeGame(), {it,p}=G0; it.inv.add(AX,n); it.inv.bind(0,AX); it.inv.bind(2,AX);
  const wall=surface(kind); p.world.raycastTargets=[wall]; aimAt(p,wall); p.grounded=false;
  return {...G0,wall};
}
function ready(it,side){ it.selectQuick(side==='left'?0:2); Hx.settle(side==='left'?it.left:it); assert.equal(it.phaseFor(side),'idle'); }
function frames(it,p,n,input=idle){ for(let k=0;k<n;k++){ Hx.clock.now+=1000/60; p.update(1/60,input); it.update(1/60); } }
test('ciclo: ready → striking (aiming) → anchored (axeBite); soltar → ready (axeScrape)',()=>{
  const {it,p}=axeGame(); ready(it,'right'); Hx.audio.calls=[];
  it.useHand('right',true); assert.equal(it.phase,'striking'); assert.equal(p.rightHand.aiming,true); assert.equal(p.aimConflict,false,'não está pendurado ainda');
  frames(it,p,12); assert.equal(it.phase,'anchored'); assert.equal(p.rightHand.anchor,'axe'); assert.equal(p.rightHand.aiming,false,'cravada não mira');
  assert.ok(Hx.audio.calls.includes('axeBite')); assert.equal(it.isAnchored('right'),true); assert.equal(it.isAnchored('left'),false);
  near(p.rightHand.stamina,95,.5,'custo de 5');
  it.useHand('right',false); assert.equal(p.rightHand.inContact,false); frames(it,p,1); assert.equal(it.phase,'idle'); assert.ok(Hx.audio.calls.includes('axeScrape'));
});
test('superfície inválida: bounce sem custo, com axeTink; volta a ready',()=>{
  const {it,p}=axeGame(1,'hold'); ready(it,'right'); Hx.audio.calls=[];
  it.useHand('right',true); frames(it,p,12); assert.equal(it.phase,'bounce'); assert.equal(p.rightHand.stamina,100); assert.ok(Hx.audio.calls.includes('axeTink'));
  frames(it,p,20); assert.equal(it.phase,'idle');
});
test('sem stamina para o custo: bounce, sem cobrar',()=>{
  const {it,p}=axeGame(); ready(it,'right'); p.rightHand.stamina=3;
  it.useHand('right',true); frames(it,p,12); assert.equal(it.phase,'bounce'); assert.ok(p.rightHand.stamina>=3);
});
test('cravada (ou golpeando): guardar, trocar e holsterHand recusam com aviso e deny',()=>{
  const {it,p,msgs}=axeGame(); it.inv.add('hammer'); it.inv.bind(3,'hammer'); ready(it,'right');
  it.useHand('right',true); assert.equal(it.phase,'striking'); Hx.audio.calls=[]; it.holsterHand('right'); assert.equal(it.phase,'striking'); assert.ok(msgs.includes('A picareta está cravada'));
  frames(it,p,12); assert.equal(it.phase,'anchored'); msgs.length=0; Hx.audio.calls=[];
  it.selectQuick(3); it.selectQuick(2); it.holsterHand('right'); it.select(it.inv.slotOf('hammer'),'right');
  assert.equal(it.phase,'anchored'); assert.equal(it.equippedFor('right'),AX); assert.ok(msgs.length>=3&&msgs.every(m=>m==='A picareta está cravada'),msgs.join('|'));
  assert.ok(Hx.audio.calls.filter(c=>c==='deny').length>=3);
});
test('X (holsterAll) guarda só a mão livre',()=>{
  const {it,p}=axeGame(1); it.inv.add('pills',2); it.inv.bind(1,'pills'); ready(it,'right'); it.selectQuick(1); Hx.settle(it.left);
  it.useHand('right',true); frames(it,p,12); assert.equal(it.phase,'anchored');
  it.holsterAll(); assert.equal(it.left.phase,'holstering'); assert.equal(it.phase,'anchored');
});
test('duas picaretas cravam e soltam cada uma pelo seu botão',()=>{
  const {it,p}=axeGame(2); ready(it,'left'); ready(it,'right');
  it.useHand('left',true); frames(it,p,12); it.useHand('right',true); frames(it,p,12);
  assert.equal(it.left.phase,'anchored'); assert.equal(it.phase,'anchored'); assert.equal(p.leftHand.anchor,'axe'); assert.equal(p.rightHand.anchor,'axe');
  it.useHand('left',false); frames(it,p,1); assert.equal(it.left.phase,'idle'); assert.equal(it.phase,'anchored'); assert.equal(p.rightHand.inContact,true);
});
test('pausa (releaseAll) leva a ready; mochila/console (releaseUse) mantêm cravada',()=>{
  const {it,p}=axeGame(2); ready(it,'left'); ready(it,'right');
  it.useHand('left',true); it.useHand('right',true); frames(it,p,12);
  it.releaseUse(); frames(it,p,1); assert.equal(it.left.phase,'anchored'); assert.equal(it.phase,'anchored'); assert.equal(p.rightHand.anchor,'axe');
  p.releaseAll(); it.update(1/60); assert.equal(it.left.phase,'idle'); assert.equal(it.phase,'idle'); assert.equal(p.leftHand.anchor,null);
});
test('âncora perdida por fora: exaustão → dislodged até recuperar; morte/crumble → sincroniza',()=>{
  const {it,p,wall}=axeGame(); ready(it,'right'); it.useHand('right',true); frames(it,p,12);
  p.rightHand.stamina=.2; frames(it,p,3); assert.equal(it.phase,'dislodged'); assert.equal(it.equippedFor('right'),AX,'continua equipada');
  it.useHand('right',true); assert.equal(it.phase,'dislodged','não golpeia exausta'); it.useHand('right',false);
  p.rightHand.stamina=40; p.rightHand.exhausted=false; it.update(1/60); assert.equal(it.phase,'idle');
  it.useHand('right',true); frames(it,p,12); assert.equal(it.phase,'anchored'); wall.userData.alive=false; frames(it,p,2); assert.equal(it.phase,'idle');
});
test('desktop: botão do mouse da mão com picareta crava e solta (Game._wire)',()=>{
  const {it,p}=axeGame(); ready(it,'left');
  // o roteamento do mouse é o de sempre: mão com item → useHand; sem item → setGrab
  it.useHand('left',true); frames(it,p,12); assert.equal(it.left.phase,'anchored'); it.useHand('left',false); assert.equal(p.leftHand.inContact,false);
});
test('puxada pelo mouse funciona com a picareta cravada; o conflito existe só durante striking',()=>{
  const {it,p}=axeGame(); ready(it,'right'); hang(p,0,surface('hold'),'hand'); p.pull=p.pullTarget=.3;
  it.useHand('right',true); assert.equal(p.aimConflict,true,'golpeando (desktop)'); assert.equal(p.canPull,false);
  frames(it,p,12); p.pull=p.pullTarget=.3; assert.equal(p.aimConflict,false); assert.equal(p.canPull,true);
});

test('retículo: axe numa superfície válida ao alcance; axe-bad fora dela',()=>{
  const Hr=require('./_items_harness.js')(['js/interaction/InteractionSystem.js']);
  for(const [kind,want] of [['band','axe'],['hold','axe-bad']]){
    const {it,p,g}=Hr.makeGame(); it.inv.add(AX,1); it.inv.bind(2,AX); it.selectQuick(2); Hr.settle(it);
    const T=Hr.THREE, m=new T.Mesh(new T.BoxGeometry(.6,.6,.1)); m.position.set(0,6.4,0); m.updateMatrixWorld();
    m.userData=kind==='band'?{axe:true,type:'rockband',alive:true}:{grab:true,type:'hold',alive:true}; p.world.raycastTargets=[m];
    p.eyePos(p.camera.position); p.camera.lookAt(m.position); p.camera.updateMatrixWorld();
    const I=new (Hr.G('InteractionSystem'))(g); g.interaction=I; assert.equal(I.query().reticle,want,kind);
  }
});

// ---------------------------------------------------------------- VR (mock de controles; Quest não testado)
const Hv=require('./_items_harness.js')(['js/ui/VRPanel.js','js/ui/VRMenu.js','js/ui/VRHud.js','js/player/VRPlayer.js']);
function vrRig({equipped={},tracked=false}={}){
  const p=Hv.realPlayer(), calls=[], grabs=[], haptics=[], frames=[];
  p.setGrab=(i,d)=>grabs.push([i,d]);
  const VRPlayer=Hv.G('VRPlayer'), vr=Object.create(VRPlayer.prototype);
  Object.assign(vr,{camera:p.camera,g:{player:p,settings:{data:{}},ui:{noteOpen:false},interact(){ calls.push('interact'); },pause(){},
      items:{equippedFor:s=>equipped[s]||null,useHand:(s,d)=>calls.push(`${s}:${d}`),holsterAll(){},cycle(){},select:(i,s)=>calls.push(`select:${i}:${s}`)}},
    input:{x:0,y:0},rigYaw:0,anchor:new Hv.THREE.Vector3(),ctrl:[null,null],keyHover:[null,null],invOpen:false,invHover:-1,
    _frame(){},_lookInput(){return 0;},_haptic:(i,v,ms)=>haptics.push([i,v,ms]),_readAll(){ return frames.shift()||[{d:{},u:{}},{d:{},u:{}}]; }});
  return {vr,p,calls,grabs,haptics,push:(L,R)=>frames.push([{d:{},u:{},tracked,...L},{d:{},u:{},tracked,...R}])};
}
test('VR: gatilho da mão com picareta crava e solta (useHand), nas duas mãos, sem interferência',()=>{
  const {vr,calls,push}=vrRig({equipped:{left:AX,right:AX}});
  push({d:{trigger:true}},{}); vr.update(1/60); push({},{d:{trigger:true}}); vr.update(1/60);
  push({u:{trigger:true}},{}); vr.update(1/60); push({},{u:{trigger:true}}); vr.update(1/60);
  assert.deepEqual(calls,['left:true','right:true','left:false','right:false']);
});
test('VR: na mão com item o grip não agarra nem solta (não desprende a picareta cravada)',()=>{
  const {vr,grabs,push}=vrRig({equipped:{left:AX}});
  push({d:{grip:true}},{d:{grip:true}}); vr.update(1/60); push({u:{grip:true}},{u:{grip:true}}); vr.update(1/60);
  assert.deepEqual(grabs,[[1,true],[1,false]],'só a mão vazia (direita) agarra');
});
test('VR hand tracking: a pinça da mão com picareta faz o papel do gatilho (não pula)',()=>{
  const {vr,calls,p,push}=vrRig({equipped:{left:AX},tracked:true}); let jumped=0; p.jump=()=>jumped++;
  push({d:{trigger:true}},{}); vr.update(1/60); assert.deepEqual(calls,['left:true']); assert.equal(jumped,0);
});
test('VR hápticos: crava = forte e curto; ricochete = duplo fraco; solta = longo',()=>{
  const {vr,haptics}=vrRig(); const t=[]; Hv.ctx.setTimeout=(fn,ms)=>{ t.push(ms); fn(); };
  vr.axeFeedback(0,'bite'); vr.axeFeedback(1,'bounce'); vr.axeFeedback(0,'release');
  assert.deepEqual(haptics[0],[0,1,40]); assert.deepEqual(haptics.slice(1,3),[[1,.25,18],[1,.25,18]]); assert.equal(t[0],90); assert.deepEqual(haptics[3],[0,.5,140]);
});
test('ItemSystem chama o háptico do VR ao cravar, ricochetear e soltar',()=>{
  const {it,p,g}=axeGame(); const fb=[]; g.vr={active:true,axeFeedback:(i,k)=>fb.push(i+':'+k)}; ready(it,'right');
  it.useHand('right',true); frames(it,p,12); it.useHand('right',false);
  assert.deepEqual(fb,['1:bite','1:release']);
});
test('VR inventário: picareta escolhida pelo gatilho vai para a mão daquele gatilho',()=>{
  const {vr,calls,push}=vrRig(); vr.invOpen=true; vr.invHover=2; vr.g.items.inv={slots:[null,null,{id:AX,count:2}]};
  push({},{d:{trigger:true}}); vr.update(1/60); push({d:{trigger:true}},{}); vr.update(1/60);
  assert.deepEqual(calls.filter(c=>c.startsWith('select')),['select:2:right','select:2:left']);
});
test('VR inventário no pulso: uma caixa por entrada da mochila (5), todas alcançáveis',()=>{
  const hud=new (Hv.G('VRHud'))(); hud.inv.visible=true; hud.wrist.visible=true; hud.wrist.updateMatrixWorld(true);
  const {it}=Hv.makeGame(); it.inv.add(AX,1); hud.updateInventory(it,-1);
  const at=x=>hud.slotAt(hud.inv.localToWorld(new Hv.THREE.Vector3(x,0,0)));
  assert.equal(at(.099),it.inv.size-1,'última caixa'); assert.equal(at(-.099),0);
});

module.exports={test,world,L,G,isAxe,done:()=>{ log(`${total} testes; falhas: ${failures}`); if(failures) process.exitCode=1; }};
if(require.main===module) module.exports.done();
