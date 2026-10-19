'use strict';
// Picareta que não crava: três reações distintas e legíveis.
//  · golpe no vazio (nada ao alcance): a picareta segue o golpe e volta, sem som de impacto nem texto;
//  · superfície errada (chapa, grade, cano, piso/teto de concreto): faísca no ponto, recuo seco, tink,
//    retículo pulsa e uma dica curta (só nas 2 primeiras vezes da subida);
//  · superfície certa, mas a mão não aguenta (sem stamina / caindo rápido): raspa, a mão treme e o motivo aparece.
// Nenhuma das três cobra stamina ou gasta a picareta. O recuo não usa mais a tremida sin(t*90).
const assert=require('node:assert/strict');
let failures=0,total=0;
const log=console.log;
function test(name,fn){ total++; try{ fn(); log('OK',name); }catch(e){ failures++; console.error('FAIL',name,'-',e.message.split('\n')[0]); } }

const Hx=require('./_items_harness.js')();
const T3=Hx.THREE, AX='climbing_axe', idle={x:0,y:0};
function surface(kind,y=6.4){
  const m=new T3.Mesh(new T3.BoxGeometry(.6,.6,.1)); m.position.set(0,y,0); m.updateMatrixWorld();
  const n=new T3.Vector3(0,0,1);
  m.userData=kind==='band'?{axe:true,type:'rockband',alive:true,wallNormal:n}
    :kind==='concrete'?{type:'wall',concrete:true,alive:true,wallNormal:n}
    :{type:'wall',alive:true,wallNormal:n};
  return m;
}
function aimAt(p,m){ p.eyePos(p.camera.position); p.camera.lookAt(m.position); p.camera.updateMatrixWorld(); }
function game(kind='metal',{fx=true}={}){
  const G0=Hx.makeGame(), {g,it,p}=G0; it.inv.add(AX,2); it.inv.bind(0,AX); it.inv.bind(2,AX);
  const fxCalls=[], pulses=[], vr=[];
  if(fx) g.fx={spawn:(type,pos,n,c)=>fxCalls.push({type,pos:pos.clone(),n:n&&n.clone(),c})};
  g.ui.pulseReticle=k=>pulses.push(k);
  g.vr={active:true,axeFeedback:(i,k)=>vr.push(i+':'+k)};
  let wall=null;
  if(kind==='floor'){ wall=surface('concrete'); wall.userData.wallNormal=null; wall.rotation.x=-Math.PI/2; wall.updateMatrixWorld(); }
  else if(kind) wall=surface(kind);
  p.world.raycastTargets=wall?[wall]:[]; if(wall) aimAt(p,wall); else { p.eyePos(p.camera.position); p.camera.lookAt(0,1.6,-10); p.camera.updateMatrixWorld(); }
  p.grounded=false;
  return {...G0,wall,fxCalls,pulses,vr};
}
function ready(it,side){ it.selectQuick(side==='left'?0:2); Hx.settle(side==='left'?it.left:it); assert.equal(it.phaseFor(side),'idle'); }
function frames(it,p,n,fps=60){ for(let k=0;k<n;k++){ Hx.clock.now+=1000/fps; p.update(1/fps,idle); it.update(1/fps); } }
// golpe segurando o botão até o impacto; devolve a fase logo depois do impacto
function strike(G,side='right'){ const {it,p}=G; Hx.audio.calls=[]; G.msgs.length=0; it.useHand(side,true); frames(it,p,12); const ph=it.phaseFor(side); return ph; }
function settleIdle(G,side='right',max=90){ const {it,p}=G; it.useHand(side,false); for(let n=0;n<max&&it.phaseFor(side)!=='idle';n++) frames(it,p,1); return it.phaseFor(side); }

// ---------------------------------------------------------------- golpe no vazio
test('vazio: fase whiff, sem tink nem texto, sem custo; volta a idle; VR whiff',()=>{
  const G=game(null); ready(G.it,'right');
  assert.equal(strike(G),'whiff');
  assert.ok(!Hx.audio.calls.includes('axeTink'),'sem som de impacto: '+Hx.audio.calls.join(','));
  assert.deepEqual(G.msgs,[]); assert.equal(G.p.rightHand.stamina,100); assert.deepEqual(G.fxCalls,[]); assert.deepEqual(G.pulses,[]);
  assert.deepEqual(G.vr,['1:whiff']);
  assert.equal(settleIdle(G),'idle');
});

// ---------------------------------------------------------------- superfície errada
test('superfície errada: bounce, tink, faísca no ponto, retículo pulsa, sem custo; VR bounce',()=>{
  const G=game('metal'); ready(G.it,'right');
  assert.equal(strike(G),'bounce');
  assert.ok(Hx.audio.calls.includes('axeTink'));
  assert.equal(G.fxCalls.length,1); assert.equal(G.fxCalls[0].type,'sparks');
  assert.ok(Math.abs(G.fxCalls[0].pos.z-G.wall.position.z)<.1,'faísca na parede: z='+G.fxCalls[0].pos.z);
  assert.ok(G.fxCalls[0].n.z>.5,'faísca sai da parede, em direção ao jogador');
  assert.deepEqual(G.pulses,['axe-bad']); assert.deepEqual(G.vr,['1:bounce']);
  assert.equal(G.p.rightHand.stamina,100); assert.equal(G.it.durabilityFor('right',AX).left,10);
  assert.equal(settleIdle(G),'idle');
});
test('superfície errada: dica nas 2 primeiras vezes da subida, depois silêncio; nova subida mostra de novo',()=>{
  const G=game('metal'); ready(G.it,'right');
  const seen=[]; for(let k=0;k<3;k++){ strike(G); seen.push(G.msgs.slice()); settleIdle(G); }
  assert.match(seen[0][0]||'',/rachadura/i); assert.match(seen[0][0],/rocha escura/i); assert.match(seen[0][0],/concreto/i);
  assert.equal(seen[1].length,1); assert.deepEqual(seen[2],[],'3ª vez: só o recuo e o som');
  // a dica conta por subida, para as duas mãos juntas
  ready(G.it,"left"); strike(G,'left'); assert.deepEqual(G.msgs,[],'esquerda também já foi avisada');
  G.it.reset(); G.it.inv.add(AX,1); G.it.inv.bind(2,AX); ready(G.it,'right'); strike(G); assert.equal(G.msgs.length,1,'nova subida');
});
test('piso ou teto de concreto conta como superfície errada, com dica própria',()=>{
  const G=game('floor'); ready(G.it,'right');
  assert.equal(strike(G),'bounce'); assert.match(G.msgs[0]||'',/só crava em parede/i);
});
test('sem FxSystem (testes, VR mínimo) o ricochete não quebra',()=>{
  const G=game('metal',{fx:false}); ready(G.it,'right'); assert.equal(strike(G),'bounce');
});

// ---------------------------------------------------------------- superfície certa, mão não aguenta
test('sem stamina: weak, raspa, motivo com o lado da mão, sem custo; VR weak',()=>{
  for(const [side,name] of [['right','direita'],['left','esquerda']]){
    for(const kind of ['band','concrete']){
      const G=game(kind); ready(G.it,side); const h=side==='left'?G.p.leftHand:G.p.rightHand; h.stamina=3;
      assert.equal(strike(G,side),'weak',kind+' '+side);
      assert.ok(Hx.audio.calls.includes('axeScrape')); assert.ok(!Hx.audio.calls.includes('axeTink'));
      assert.deepEqual(G.msgs,[`Mão ${name} sem stamina para cravar.`]);
      assert.ok(h.stamina>=3&&h.stamina<=3.0001,'sem cobrar'); assert.equal(h.inContact,false);
      assert.deepEqual(G.vr,[(side==='left'?0:1)+':weak']);
      assert.equal(G.it.durabilityFor(side,AX).left,10,'não gasta a picareta');
      assert.equal(settleIdle(G,side),'idle');
    }
  }
});
test('caindo rápido: weak com o motivo',()=>{
  const G=game('band'); ready(G.it,'right'); G.it.useHand('right',true); frames(G.it,G.p,8);
  G.p.velocity.y=-30; Hx.audio.calls=[]; G.msgs.length=0; frames(G.it,G.p,4);
  assert.equal(G.it.phase,'weak'); assert.deepEqual(G.msgs,['Caindo rápido demais para cravar.']);
});
test('o motivo de "não aguenta" aparece sempre (não é dica limitada)',()=>{
  const G=game('band'); ready(G.it,'right');
  for(let k=0;k<4;k++){ G.p.rightHand.stamina=3; strike(G); assert.equal(G.msgs.length,1,'vez '+(k+1)); settleIdle(G); }
});

// ---------------------------------------------------------------- animação: recuo, sem tremelique
function trace(G,ph,fps=240){
  const {it,p}=G; const xs=[],zs=[],rz=[];
  it.useHand('right',true); for(let n=0;n<600&&it.phase==='striking';n++) frames(it,p,1,fps);
  assert.equal(it.phase,ph);
  for(let n=0;n<600&&it.phase===ph;n++){ frames(it,p,1,fps); xs.push(it._canon.wrist.x); zs.push(it._canon.pos.z); rz.push(it._canon.wrist.z); }
  return {xs,zs,rz};
}
const turns=a=>{ let n=0; for(let i=2;i<a.length;i++){ const d1=a[i-1]-a[i-2], d2=a[i]-a[i-1]; if(Math.abs(d1)>1e-5&&Math.abs(d2)>1e-5&&Math.sign(d1)!==Math.sign(d2)) n++; } return n; };
test('recuo (bounce), vazio (whiff) e não aguenta (weak): no máximo 2 viradas de direção, sem rolagem tremida',()=>{
  for(const [kind,ph,prep] of [['metal','bounce'],[null,'whiff'],['band','weak',G=>{ G.p.rightHand.stamina=3; }]]){
    const G=game(kind); ready(G.it,'right'); if(prep) prep(G);
    const {xs,zs,rz}=trace(G,ph);
    assert.ok(xs.length>20,ph+' dura algumas frações de segundo: '+xs.length);
    assert.ok(turns(xs)<=2,`${ph} pulso: ${turns(xs)} viradas`); assert.ok(turns(zs)<=2,`${ph} avanço: ${turns(zs)} viradas`);
    assert.ok(rz.every(v=>Math.abs(v)<1e-9),ph+' sem rolagem do pulso');
  }
});
test('recuo seco: o pulso volta para trás além do repouso antes de assentar',()=>{
  const G=game('metal'); ready(G.it,'right'); const rest=G.it._canon.wrist.x;
  const {xs}=trace(G,'bounce');
  assert.ok(Math.max(...xs)>rest+.1,`passa do repouso (${Math.max(...xs).toFixed(3)} vs ${rest.toFixed(3)})`);
  assert.ok(Math.abs(xs[xs.length-1]-rest)<.15,'assenta perto do repouso');
});
test('vazio: a picareta segue o golpe (vai mais à frente que no impacto) antes de voltar',()=>{
  const G=game(null); ready(G.it,'right'); const {zs}=trace(G,'whiff');
  assert.ok(Math.min(...zs)<zs[0]-.03,'avança além do ponto do golpe');
});

// ---------------------------------------------------------------- VR e HUD
test('VR: cada reação tem vibração própria',()=>{
  Hx.load('js/player/VRPlayer.js');
  const VR=Hx.G('VRPlayer'), got={}; Hx.ctx.setTimeout=(fn,ms)=>{ fn(); return 0; };
  for(const k of ['bite','bounce','whiff','weak','release']){ const h=[]; VR.prototype.axeFeedback.call({_haptic:(i,v,ms)=>h.push(v+'/'+ms)},0,k); got[k]=h.join(' '); }
  Hx.ctx.setTimeout=()=>0;
  const vals=Object.values(got); assert.equal(new Set(vals).size,vals.length,JSON.stringify(got));
  assert.ok(got.whiff.split(' ').length===1,'vazio: um toque leve'); assert.ok(parseFloat(got.whiff)<.25);
  assert.ok(got.weak.split(' ').length>=3,'não aguenta: tremido');
});
test('HUD: pulseReticle reinicia a animação do retículo',()=>{
  const UI=Hx.G('UIManager'), cls=new Set(); let reflow=0;
  const el={classList:{add:c=>cls.add(c),remove:c=>cls.delete(c)},get offsetWidth(){ reflow++; return 0; }};
  UI.prototype.pulseReticle.call({$:()=>el},'axe-bad'); assert.ok(cls.has('deny')); assert.equal(reflow,1);
});

log(`\n${total} testes; falhas: ${failures}`); process.exit(failures?1:0);
