'use strict';
// Mãos independentes e espelhadas: validação do espelhamento (Handedness), independência de uso por mão,
// poses espelhadas por fase e leitura do viewmodel. Usa o Three.js real (matrizes de verdade).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');
const ROOT=path.join(__dirname,'..');
const noopCtx=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createRadialGradient'||k==='createLinearGradient'?()=>({addColorStop(){}}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}):()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
const document={createElement:()=>({width:0,height:0,getContext:()=>noopCtx})};
let NOW=0; const perf={now:()=>NOW};
const ctx=vm.createContext({THREE,console,performance:perf,document,Models:{get(){return null},clips(){return []}},NAIL_REACH:1.8});
const load=f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
let handednessLoaded=true;
try{ load('js/player/Handedness.js'); }catch(e){ handednessLoaded=false; }
for(const f of ['js/core/utils.js','js/items/climbingAxeAsset.js','js/items/itemDefs.js','js/items/Inventory.js']) load(f);
load('js/items/ItemSystem.js'); load('js/player/HandModel.js'); load('js/Game.js');
const G=vm.runInContext('({V3,ITEM_DEFS,HandModel,ItemSystem,Inventory,get Handedness(){ return typeof Handedness!=="undefined"?Handedness:undefined; }})',ctx);

let failures=0,total=0;
function test(name,fn){ total++; try{ fn(); console.log('OK',name); }catch(e){ failures++; console.error('FAIL',name,'-',e.message.split('\n')[0]); } }
const H=()=>{ const h=G.Handedness; if(!h) throw new Error('Handedness is not defined'); return h; };
const M=new THREE.Matrix4().makeScale(-1,1,1);
const R=(()=>{ let a=12345; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; })();
const near=(a,b,tol,msg)=>{ if(Math.abs(a-b)>tol) throw new Error(`${msg}: ${a} ≠ ${b}`); };
const matNear=(A,B,tol,msg)=>A.elements.forEach((v,i)=>near(v,B.elements[i],tol,msg+`[${i}]`));
// quaternion espelhado no plano x=0 (M·R·M): (x,−y,−z,w)
const mirrorQ=q=>new THREE.Quaternion(q.x,-q.y,-q.z,q.w);
// pontos (vértices no mundo) de todas as malhas de um objeto
function worldPoints(obj){
  obj.updateMatrixWorld(true); const out=[], v=new THREE.Vector3();
  obj.traverse(o=>{ if(!o.isMesh) return; const p=o.geometry.attributes.position; for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld); out.push(v.clone()); } });
  return out;
}
// o conjunto L é M·(conjunto R), pelo vizinho mais próximo
function assertMirroredSet(L,Rp,tol,msg){
  assert.equal(L.length,Rp.length,msg+': contagem de vértices');
  const m=Rp.map(p=>new THREE.Vector3(-p.x,p.y,p.z));
  let worst=0;
  for(const p of L){ let best=Infinity; for(const q of m){ const d=p.distanceToSquared(q); if(d<best) best=d; if(best<1e-16) break; } worst=Math.max(worst,Math.sqrt(best)); }
  if(worst>tol) throw new Error(`${msg}: desvio máximo ${worst.toExponential(2)} m`);
}
// raízes de mão com a mesma pose na tela, uma o reflexo da outra
function rootPair(){
  const pos=new THREE.Vector3(.2+R()*.1,-.2-R()*.1,-.35-R()*.1);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(R()*2-1,R()*2-1,R()*2-1));
  return {R:{pos,q},L:{pos:new THREE.Vector3(-pos.x,pos.y,pos.z),q:mirrorQ(q)}};
}
function makeHand(side,root,wristE,base){
  const hm=new G.HandModel(side), scene=new THREE.Group(); scene.add(hm.root);
  hm.root.position.copy(root.pos); hm.root.quaternion.copy(root.q);
  hm.wrist.rotation.set(wristE[0],wristE[1],wristE[2]); hm.setBase(base); hm.snapBase();
  return {hm,scene};
}

// ---------------------------------------------------------------- validação do espelhamento
test('reflexo X conjuga rotações em XYZ e YXZ (M·R·M)',()=>{
  const Hd=H();
  for(const order of ['XYZ','YXZ']) for(let n=0;n<200;n++){
    const e=[R()*6-3,R()*6-3,R()*6-3], out=[0,0,0];
    Hd.mirrorEuler(e,-1,out);
    const Rr=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(e[0],e[1],e[2],order));
    const Rl=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(out[0],out[1],out[2],order));
    matNear(Rl,M.clone().multiply(Rr).multiply(M),1e-9,order);
    const same=Hd.mirrorEuler({x:e[0],y:e[1],z:e[2]},1,[0,0,0]); assert.deepEqual(Array.from(same),e);
  }
});
test('sideOf e mirrorVec',()=>{
  const Hd=H(); assert.equal(Hd.sideOf(0),-1); assert.equal(Hd.sideOf(1),1);
  const v=Hd.mirrorVec(new THREE.Vector3(.2,-.3,-.4),-1,new THREE.Vector3()); assert.deepEqual([v.x,v.y,v.z],[-.2,-.3,-.4]);
});
test('toSide reflete pos/wrist/base/roll, copia o resto e não reaproveita a base de ITEM_DEFS',()=>{
  const Hd=H(), d=G.ITEM_DEFS.hammer;
  const canon={pos:new THREE.Vector3(.24,-.24,-.4),roll:.3,visible:true,wrist:new THREE.Vector3(.1,.2,.3),base:d.base,grip:'fist',grip2:'press',blend:.4,squeeze:.2,tremor:.05};
  const out={pos:new THREE.Vector3(),wrist:new THREE.Vector3(),base:null};
  Hd.toSide(canon,-1,out);
  assert.deepEqual([out.pos.x,out.pos.y,out.pos.z],[-.24,-.24,-.4]);
  assert.deepEqual([out.wrist.x,out.wrist.y,out.wrist.z],[.1,-.2,-.3]);
  assert.equal(out.roll,-.3);
  assert.deepEqual(Array.from(out.base),[d.base[0],-d.base[1],-d.base[2]]);
  assert.notEqual(out.base,d.base); assert.deepEqual(Array.from(d.base),[-.5,0,-Math.PI/2],'ITEM_DEFS intacto');
  for(const k of ['visible','grip','grip2','blend','squeeze','tremor']) assert.equal(out[k],canon[k],k);
  const b=out.base; Hd.toSide(canon,1,out); assert.equal(out.base,b,'mesmo array por instância');
  assert.deepEqual(Array.from(out.base),Array.from(d.base)); assert.equal(out.roll,.3);
});
test('mountTransform: posição e rotação refletidas, escala positiva',()=>{
  const Hd=H();
  for(const id of Object.keys(G.ITEM_DEFS)){
    const d=G.ITEM_DEFS[id], r=Hd.mountTransform(d.item,1,new THREE.Object3D()), l=Hd.mountTransform(d.item,-1,new THREE.Object3D());
    assert.equal(l.position.x,-r.position.x,id); assert.equal(l.position.y,r.position.y,id); assert.equal(l.position.z,r.position.z,id);
    assert.equal(l.rotation.x,r.rotation.x,id); assert.equal(l.rotation.y,-r.rotation.y,id); assert.equal(l.rotation.z,-r.rotation.z,id);
    for(const k of ['x','y','z']){ assert.ok(l.scale[k]>0,id+' escala'); assert.equal(l.scale[k],d.item.s||1,id); }
  }
});
test('cadeia root→wrist→base→socket→item: esquerda é o reflexo exato da direita e det>0',()=>{
  const Hd=H();
  for(const id of Object.keys(G.ITEM_DEFS)) for(let n=0;n<4;n++){
    const d=G.ITEM_DEFS[id], pair=rootPair(), w=[R()-.5,R()-.5,R()-.5];
    const right=makeHand(1,pair.R,w,d.base), left=makeHand(-1,pair.L,Hd.mirrorEuler(w,-1,[0,0,0]),Hd.mirrorEuler(d.base,-1,[0,0,0]));
    const mr=Hd.mountTransform(d.item,1,d.make()), ml=Hd.mountTransform(d.item,-1,d.item.chiral?Hd.mirrorMesh(d.make()):d.make());
    right.hm.socket.add(mr); left.hm.socket.add(ml);
    const Lp=worldPoints(ml), Rp=worldPoints(mr);
    ml.traverse(o=>{ if(o.isMesh) assert.ok(o.matrixWorld.determinant()>0,id+': determinante da cadeia esquerda'); });
    assertMirroredSet(Lp,Rp,1e-6,id);
  }
});
test('HandModel procedural espelhado: dedos e polegar da esquerda são o reflexo da direita',()=>{
  const Hd=H();
  for(const pose of ['relaxed','fist','pinch','bottle','hook','open']){
    const pair=rootPair(), w=[R()-.5,R()-.5,R()-.5], base=[R()-.5,R()-.5,R()*3-1.5];
    const right=makeHand(1,pair.R,w,base), left=makeHand(-1,pair.L,Hd.mirrorEuler(w,-1,[0,0,0]),Hd.mirrorEuler(base,-1,[0,0,0]));
    for(const {hm} of [right,left]){ hm.setPose(pose); hm.x.set(hm.tgt); hm._apply(); hm.root.updateMatrixWorld(true); }
    const tips=hm=>{ const out=[]; hm.fingers.forEach(f=>f.joints.forEach(j=>out.push(j.getWorldPosition(new THREE.Vector3()))));
      [hm.thumb.base,...hm.thumb.joints].forEach(j=>out.push(j.getWorldPosition(new THREE.Vector3())));
      const t2=hm.thumb.joints[1]; out.push(t2.localToWorld(new THREE.Vector3(0,0,-.02))); return out; };
    const a=tips(left.hm), b=tips(right.hm);
    a.forEach((p,i)=>{ near(p.x,-b[i].x,1e-9,pose+' x'); near(p.y,b[i].y,1e-9,pose+' y'); near(p.z,b[i].z,1e-9,pose+' z'); });
  }
});
test('itens atuais não são quirais (ou têm geometria espelhada própria)',()=>{
  const Hd=H();
  for(const id of Object.keys(G.ITEM_DEFS)){
    const d=G.ITEM_DEFS[id], a=d.make(), b=d.make();
    a.position.set(0,0,0); b.position.set(0,0,0); a.rotation.set(0,0,0); b.rotation.set(0,0,0);
    const Pa=worldPoints(a), Pb=worldPoints(d.item.chiral?Hd.mirrorMesh(b):b);
    // geometria simétrica no plano x=0 do item: o próprio conjunto refletido é ele mesmo
    try{ assertMirroredSet(Pb,Pa,1e-6,id); }catch(e){ if(!d.item.chiral) throw new Error(id+' é quiral: marcar item.chiral'); throw e; }
  }
});
test('mirrorGeometryX: x negado, normais refletidas, triângulos com a ordem invertida',()=>{
  const Hd=H();
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, .1,0,0, 0,.2,.05, .3,.1,0],3)); g.setIndex([0,1,2, 1,3,2]); g.computeVertexNormals();
  const m=Hd.mirrorGeometryX(g); assert.notEqual(m,g);
  const p=g.attributes.position, q=m.attributes.position, n=g.attributes.normal, o=m.attributes.normal;
  for(let i=0;i<p.count;i++){ assert.equal(q.getX(i),-p.getX(i)); assert.equal(q.getY(i),p.getY(i)); assert.equal(o.getX(i),-n.getX(i)); assert.equal(o.getZ(i),n.getZ(i)); }
  assert.deepEqual(Array.from(m.index.array),[0,2,1, 1,2,3]);
  // a normal geométrica do triângulo refletido aponta como a normal refletida (winding preservado sem escala negativa)
  const tri=(geo,k)=>{ const ix=geo.index.array, P=geo.attributes.position, v=i=>new THREE.Vector3().fromBufferAttribute(P,ix[k*3+i]); const a=v(0),b=v(1),c=v(2); return b.sub(a).cross(c.sub(a)).normalize(); };
  const nr=tri(g,0), nl=tri(m,0); near(nl.x,-nr.x,1e-9,'nx'); near(nl.y,nr.y,1e-9,'ny'); near(nl.z,nr.z,1e-9,'nz');
  // sem índice também
  const gi=g.toNonIndexed(), mi=Hd.mirrorGeometryX(gi), ri=mi.attributes.position;
  assert.equal(ri.getX(1),-gi.attributes.position.getX(2)); assert.equal(ri.getX(2),-gi.attributes.position.getX(1));
});


// ---------------------------------------------------------------- independência do uso por mão
// jogo mínimo em volta do ItemSystem real: mãos com socket do HandModel real, alvo sempre válido
function makeItems(stock={hammer:1,nails:5,pills:3,card:1,climbing_axe:2}){
  const calls={tryUse:[0,0],useItem:0};
  const g={player:{dead:false,isClimbing:false,leftHand:{inContact:false,occupied:false},rightHand:{inContact:false,occupied:false},handModels:[new G.HandModel(-1),new G.HandModel(1)],restoreStamina(){}},
    audio:{equip(){},holster(){},deny(){},swing(){},pill(){}},ui:{msg(){}},vr:{active:false},
    interaction:{itemTarget:()=>({valid:true,obj:{useItem(){ calls.useItem++; }},hit:{object:{userData:{}}},ctx:{}})}};
  g.player.hands=[g.player.leftHand,g.player.rightHand];
  const it=new G.ItemSystem(g); g.items=it;
  for(const [id,n] of Object.entries(stock)) it.inv.add(id,n);
  for(const h of [it.left,it]){ const o=h._tryUse; h._tryUse=function(){ calls.tryUse[this.handIndex]++; return o.call(this); }; }
  return {g,it,calls};
}
// equipa um item numa mão (pelo slot do inventário) e espera a animação terminar
function equip(it,side,id){
  const i=it.inv.slots.findIndex(s=>s&&s.id===id), h=side==='left'?it.left:it;
  h._equip(i); for(let n=0;n<60&&h.phase!=='idle';n++) h._updateLocal(1/60);
  assert.equal(h.phase,'idle',`${side} ${id} pronto`);
}
function step(it,n=1){ for(let k=0;k<n;k++){ NOW+=1000/60; it.update(1/60); } }

test('usar a direita não altera a esquerda',()=>{
  const {it,calls}=makeItems(); equip(it,'left','hammer'); equip(it,'right','nails');
  it.useHand('right',true); step(it,60);
  assert.equal(it.left.useHeld,false); assert.equal(it.left.phase,'idle'); assert.equal(calls.tryUse[0],0,'a esquerda não tenta usar');
});
test('soltar a direita não cancela o segurar da esquerda',()=>{
  const {it}=makeItems(); equip(it,'left','hammer'); equip(it,'right','nails');
  it.useHand('left',true); it.useHand('right',true); it.useHand('right',false);
  assert.equal(it.left.useHeld,true); assert.equal(it.useHeld,false);
});
test('uso simultâneo mantém a sequência de fases de cada mão isolada',()=>{
  for(const [L,Rr] of [['nails','pills'],['hammer','nails']]){
    const script=(it,who)=>{ const out={left:[],right:[]};
      for(let f=0;f<120;f++){
        if(who.left){ if(f===0) it.useHand('left',true); if(f===5) it.useHand('left',false); }
        if(who.right){ if(f===10) it.useHand('right',true); if(f===80) it.useHand('right',false); }
        step(it); out.left.push(it.left.phase); out.right.push(it.phase); }
      return out; };
    const run=who=>{ NOW=0; const {it}=makeItems(); equip(it,'left',L); equip(it,'right',Rr); return script(it,who); };
    const both=run({left:true,right:true}), onlyL=run({left:true}), onlyR=run({right:true});
    assert.deepEqual(both.left,onlyL.left,`${L}+${Rr}: esquerda`); assert.deepEqual(both.right,onlyR.right,`${L}+${Rr}: direita`);
  }
});
test('pausa, mochila e console soltam o uso das duas mãos (releaseUse uma vez cada)',()=>{
  const Game=vm.runInContext('Game',ctx);
  for(const m of ['pause','openInventory','openDevConsole']){
    const {it}=makeItems(); equip(it,'left','hammer'); equip(it,'right','nails');
    it.useHand('left',true); it.useHand('right',true);
    let rel=0; const orig=it.releaseUse; it.releaseUse=function(){ rel++; return orig?orig.call(this):this.use(false); };
    const el={hidden:true,textContent:'',focus(){},addEventListener(){}};
    const g=Object.assign(Object.create(Game.prototype),{state:'play',items:it,keys:{},gameBtn:{},player:{dead:false,releaseAll(){}},
      timer:{pause(){},resume(){}},audio:{setRumble(){}},settings:{data:{devConsoleEnabled:true}},vr:{active:false,showPause(){}},
      ui:{$:()=>el,setPack(){},clearMsg(){},show(){},hideNote(){}},unlock(){},lock(){}});
    g[m]();
    assert.equal(it.left.useHeld,false,m+': esquerda'); assert.equal(it.useHeld,false,m+': direita'); assert.equal(rel,1,m+': releaseUse');
  }
});
test('soltar o botão durante a mochila não deixa a mão "segurando" ao voltar',()=>{
  const {it,calls}=makeItems(); equip(it,'left','hammer');
  it.useHand('left',true); step(it,10); it.releaseUse(); step(it,90);
  const n=calls.tryUse[0]; step(it,90);
  assert.equal(calls.tryUse[0],n,'o martelo não continua golpeando'); assert.equal(it.left.phase,'idle');
});
test('temporários de pose não são compartilhados entre as mãos',()=>{
  const {it}=makeItems(); equip(it,'left','hammer'); equip(it,'right','nails');
  assert.ok(it._tmp&&it.left._tmp,'_tmp por instância'); assert.notEqual(it.left._tmp.idle,it._tmp.idle);
  const before=it.left.pose.pos.clone(); NOW+=0; it._updateLocal(1/60);
  assert.ok(it.left.pose.pos.equals(before),'atualizar a direita não mexe na pose da esquerda');
});


// ---------------------------------------------------------------- fases espelhadas e montagem
const poseNear=(l,r,msg)=>{ const Hd=H(), m=Hd.toSide(r,-1,{pos:new THREE.Vector3(),wrist:new THREE.Vector3()});
  for(const k of ['x','y','z']){ near(l.pos[k],m.pos[k],1e-6,msg+' pos.'+k); near(l.wrist[k],m.wrist[k],1e-6,msg+' wrist.'+k); }
  for(let j=0;j<3;j++) near(l.base[j],m.base[j],1e-6,msg+' base['+j+']');
  near(l.roll||0,m.roll||0,1e-6,msg+' roll');
  for(const k of ['visible','grip','grip2','blend','squeeze','tremor']) assert.equal(l[k],m[k],msg+' '+k); };
// as duas mãos com o mesmo item, a mesma fase e o mesmo relógio
function twinRun(id,phase){
  NOW=0; const {it}=makeItems({hammer:1,nails:5,pills:3,card:1,climbing_axe:2}); const i=it.inv.slots.findIndex(s=>s&&s.id===id);
  const both=f=>{ f(it.left); f(it); };
  both(h=>h._equip(i)); const frames=phase==='equipping'?40:0;
  for(let n=0;n<frames;n++){ NOW+=1000/60; both(h=>h._updateLocal(1/60)); poseNear(it.left.pose,it.pose,`${id} equipping #${n}`); }
  both(h=>{ for(let n=0;n<60&&h.phase!=='idle';n++) h._updateLocal(1/60); });
  if(phase==='idle'){ for(let n=0;n<20;n++){ NOW+=1000/60; both(h=>h._updateLocal(1/60)); poseNear(it.left.pose,it.pose,`${id} idle #${n}`); } return; }
  if(phase==='holstering') both(h=>h.holster()); else if(phase!=='equipping') both(h=>{ h.pending=null; h._start(phase); });
  for(let n=0;n<45;n++){ NOW+=1000/60; both(h=>h._updateLocal(1/60)); poseNear(it.left.pose,it.pose,`${id} ${phase} #${n}`); }
}
test('fases espelhadas: pose da esquerda = toSide(pose da direita) em todas as fases',()=>{
  for(const [id,phases] of [['hammer',['equipping','idle','swing','holstering']],['nails',['equipping','idle','place','holstering']],['pills',['idle','consume','holstering']],['card',['idle','place','holstering']],['climbing_axe',['equipping','idle','striking','bounce','holstering']]])
    for(const ph of phases) twinRun(id,ph);
});
test('montagem espelhada: posição x oposta, rotação (x,−y,−z), escala positiva',()=>{
  const {it}=makeItems();
  for(const id of ['hammer','nails','pills','card','climbing_axe']){
    const i=it.inv.slots.findIndex(s=>s&&s.id===id); it.left._mount(id); it._mount(id); it.left.sel=it.sel=i;
    const l=it.left.mesh, r=it.mesh;
    assert.equal(l.position.x,-r.position.x,id); assert.equal(l.position.y,r.position.y,id); assert.equal(l.position.z,r.position.z,id);
    assert.equal(l.rotation.x,r.rotation.x,id); assert.equal(l.rotation.y,-r.rotation.y,id); assert.equal(l.rotation.z,-r.rotation.z,id);
    for(const k of ['x','y','z']) assert.ok(l.scale[k]>0,id);
  }
});

// ---------------------------------------------------------------- viewmodel e VR (Player real)
for(const f of ['js/world/Collision.js','js/player/perkDefs.js','js/player/PlayerAttributes.js','js/player/PlayerStats.js','js/player/Player.js']) load(f);
function realPlayer(){
  const Player=vm.runInContext('Player',ctx), cam=new THREE.PerspectiveCamera(), scene=new THREE.Scene(); scene.add(cam);
  const p=new Player(scene,cam,{spawnPoint:new THREE.Vector3(0,5,.5),spawnYaw:0,platforms:[],raycastTargets:[],touch(){}});
  cam.position.set(0,1.6,0); cam.updateMatrixWorld(true); return p;
}
function itemsFor(p){
  const g={player:p,audio:{equip(){},holster(){},deny(){},swing(){},pill(){}},ui:{msg(){}},vr:{active:false},interaction:{itemTarget:()=>null}};
  const it=new G.ItemSystem(g); g.items=it; it.inv.add('hammer'); it.inv.add('nails',5); it.inv.add('pills',2); return it;
}
test('viewmodel lê só itemPoses[i] (sem itemPose legado)',()=>{
  const p=realPlayer(); assert.equal('itemPose' in p,false,'Player não tem mais itemPose');
  const it=itemsFor(p); equip(it,'left','hammer'); equip(it,'right','nails');
  p.updateViewmodel();
  const [L,Rh]=p.handModels;
  assert.deepEqual([L.baseTgt.x,L.baseTgt.y,L.baseTgt.z],Array.from(it.left.pose.base)); assert.deepEqual([Rh.baseTgt.x,Rh.baseTgt.y,Rh.baseTgt.z],Array.from(it.pose.base));
  for(const k of ['x','y','z']){ assert.equal(L.wrist.rotation[k],it.left.pose.wrist[k]); assert.equal(Rh.wrist.rotation[k],it.pose.wrist[k]); }
  // legado: um itemPose solto não é aplicado à direita
  it.holsterHand('right'); for(let n=0;n<60;n++) it._updateLocal(1/60);
  p.rightHand.occupied=true; p.itemPoses[1]=undefined; p.itemPose={pos:new THREE.Vector3(),wrist:new THREE.Vector3(1,1,1),base:[1,1,1],roll:0,grip:'fist'};
  p.updateViewmodel(); assert.notEqual(Rh.wrist.rotation.x,1,'itemPose legado ignorado');
});
test('VR (controles espelhados): ponta do prego e cabeça do martelo da esquerda são o reflexo das da direita',()=>{
  for(const id of ['nails','hammer']){
    NOW=0; const p=realPlayer(), it=itemsFor(p); equip(it,'left',id); equip(it,'right',id);
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,-.4,.2)), pos=new THREE.Vector3(.25,1.3,-.35);
    p.xr={handPose(i,outP,outQ){ const s=i?1:-1; outP.set(s*pos.x,pos.y,pos.z); outQ.set(q.x,s*q.y,s*q.z,q.w); return true; },grabReach:.1};
    p.camera.position.set(0,1.6,0); p.camera.rotation.set(0,0,0); p.camera.updateMatrixWorld(true);
    p.updateViewmodel(); p.handModels.forEach(hm=>{ hm.snapBase(); hm.root.updateMatrixWorld(true); });
    const local=id==='nails'?new THREE.Vector3(0,-.17,0):new THREE.Vector3(0,.27,0);
    const l=it.left.mesh.localToWorld(local.clone()), r=it.mesh.localToWorld(local.clone());
    near(l.x,-r.x,1e-6,id+' x'); near(l.y,r.y,1e-6,id+' y'); near(l.z,r.z,1e-6,id+' z');
    assert.ok(l.x<0&&r.x>0,id+': cada ponta do seu lado');
  }
});


// ---------------------------------------------------------------- regras por mão: conflito de mira e trocas rápidas
test('aiming: só uso ativo de item que mira (martelo/prego/cartão); pílulas e idle sem botão não',()=>{
  const {it,g}=makeItems(); const L=g.player.leftHand;
  equip(it,'left','hammer'); assert.equal(L.aiming,false,'idle sem botão');
  it.useHand('left',true); assert.equal(it.left.phase,'swing'); assert.equal(L.aiming,true,'golpe');
  step(it,60); assert.equal(L.aiming,true,'botão segurado com martelo');
  it.useHand('left',false); step(it,60); assert.equal(it.left.phase,'idle'); assert.equal(L.aiming,false,'soltou e terminou');
  const b=makeItems(); equip(b.it,'right','nails'); b.it.useHand('right',true); assert.equal(b.it.phase,'place'); assert.equal(b.g.player.rightHand.aiming,true,'prego');
  b.it.useHand('right',false); step(b.it,60); assert.equal(b.g.player.rightHand.aiming,false);
  const c=makeItems(); equip(c.it,'left','pills'); c.it.useHand('left',true); assert.equal(c.it.left.phase,'consume'); assert.equal(c.g.player.leftHand.aiming,false,'pílulas não miram');
  step(c.it,10); assert.equal(c.g.player.leftHand.aiming,false);
  const d=makeItems(); equip(d.it,'right','card'); d.it.useHand('right',true); assert.equal(d.g.player.rightHand.aiming,true,'cartão');
  d.it.releaseUse(); step(d.it,60); assert.equal(d.g.player.rightHand.aiming,false,'releaseUse encerra o conflito');
});
test('troca rápida não contorna: durante holstering a mão segue ocupada e não agarra; ao terminar, agarra',()=>{
  NOW=0; const p=realPlayer(), it=itemsFor(p); equip(it,'left','hammer');
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.2)); wall.position.set(0,6.4,0); wall.userData.grab=true; wall.updateMatrixWorld(); p.world.raycastTargets=[wall];
  const aim=()=>{ p.eyePos(p.camera.position); p.camera.lookAt(wall.position); p.camera.updateMatrixWorld(); };
  it.holsterHand('left'); for(let n=0;n<10;n++) it.update(1/60);
  assert.equal(it.left.phase,'holstering'); assert.equal(p.leftHand.occupied,true);
  aim(); p.setGrab(0,true); assert.equal(p.leftHand.inContact,false,'agarre recusado durante holstering');
  p.setGrab(0,false); for(let n=0;n<40;n++) it.update(1/60);
  assert.equal(it.left.phase,'empty'); assert.equal(p.leftHand.occupied,false);
  aim(); p.setGrab(0,true); assert.equal(p.leftHand.inContact,true,'agarra depois de guardar');
});
test('equipar com a mão agarrada é recusado (por mão)',()=>{
  const {it,g}=makeItems(); g.player.leftHand.inContact=true;
  it.selectQuick; const i=it.inv.slots.findIndex(s=>s&&s.id==='hammer'); it.left.select(i);
  assert.equal(it.left.equipped,null,'esquerda agarrada não equipa');
  const k=it.inv.slots.findIndex(s=>s&&s.id==='pills'); it.select(k); assert.equal(it.equipped,'pills','a direita livre equipa');
});

module.exports={G,ctx,THREE,test,H,load,setNow:t=>{ NOW=t; }};
if(require.main===module){ console.log(`${total} testes; falhas: ${failures}`); if(failures) process.exitCode=1; }
