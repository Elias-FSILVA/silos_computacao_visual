'use strict';
// B2+ — picareta GLB montada no jogo real: duas mãos, materiais, U aplicada uma vez na cena, reflexo por fase,
// independência e reserva procedural. Three.js/GLTFLoader reais; o Models é o js/core/models.js do jogo.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('./_axe_asset_harness'),T=H.THREE;
const DIST_REL='assets/models/items/climbing_axe_low_poly.glb';
const queue=[];function test(name,f){queue.push([name,f]);}
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg}: ${a} vs ${b}`);
const vnear=(a,b,tol,msg)=>{const A=Array.isArray(a)?a:a.toArray(),B=Array.isArray(b)?b:b.toArray();A.forEach((v,i)=>near(v,B[i],tol,msg+'['+i+']'));};
const M=new T.Matrix4().makeScale(-1,1,1);
let gltfP=null;const gltf=()=>gltfP||(gltfP=H.loadAxe(DIST_REL));

async function game(withGlb=true){
  const g=withGlb?await gltf():null,h=H.axeGame(g);
  assert.ok(fs.existsSync(path.join(H.ROOT,'js/items/climbingAxeAsset.js')),'climbingAxeAsset.js ausente');
  const G=h.makeGame();G.h=h;G.it.inv.add('climbing_axe',2);return G;
}
function equipBoth(G){const it=G.it,slot=it.inv.slots.findIndex(s=>s&&s.id==='climbing_axe');it.select(slot,'left');it.select(slot,'right');
  for(let n=0;n<90&&(it.left.phase!=='idle'||it.phase!=='idle');n++)G.h.step(it,1);assert.equal(it.left.phase,'idle');assert.equal(it.phase,'idle');}
function frame(G,n=1){for(let k=0;k<n;k++){G.h.step(G.it,1);G.p.updateViewmodel();}G.p.camera.updateMatrixWorld(true);for(const hm of G.p.handModels)hm.root.updateMatrixWorld(true);}
const tipWorld=inst=>inst.refs.tip.clone().applyMatrix4(inst.canonical.matrixWorld);
const meshes=o=>{const a=[];o.traverse(m=>{if(m.isMesh)a.push(m);});return a;};

test('duas picaretas reais: GLB nas duas mãos, instâncias e refs independentes, axeVisuals por mão',async()=>{
  const G=await game();equipBoth(G);frame(G);const [L,R]=G.p.axeVisuals;
  assert.ok(L&&R,'axeVisuals publicados');assert.equal(L.source,'glb');assert.equal(R.source,'glb');assert.equal(L.side,-1);assert.equal(R.side,1);
  assert.notEqual(L.canonical,R.canonical);assert.notEqual(L.refs.tip,R.refs.tip);assert.notEqual(L.refs.biteAxis,R.refs.biteAxis);
  assert.equal(G.it.left.mesh,L.canonical);assert.equal(G.it.mesh,R.canonical);assert.equal(meshes(L.canonical).length,4);assert.equal(meshes(R.canonical).length,4);
  assert.notEqual(G.p.itemPoses[0],L,'axeVisuals separado de itemPoses');
});
test('materiais originais intactos (tint da mão e outra instância), escalas positivas em toda a hierarquia',async()=>{
  const G=await game(),orig=H.summary(await H.loadAxe(H.ASSET));equipBoth(G);
  G.p.hands.forEach(h=>{h.stamina=1;});frame(G,30);   // cansado: a pele recebe tint
  for(const inst of G.p.axeVisuals){const mats={};for(const m of meshes(inst.canonical)){mats[m.material.name]={color:m.material.color.toArray().map(v=>+v.toFixed(6)),metalness:m.material.metalness,roughness:m.material.roughness,side:m.material.side,map:!!m.material.map,type:m.material.type};
      assert.ok(m.matrixWorld.determinant()>0,'det>0 '+m.name);assert.equal(m.material.emissive.getHex(),0,'sem emissivo de tint');}
    assert.deepEqual(Object.fromEntries(Object.entries(mats).sort()),orig.materials);
    inst.canonical.traverse(o=>{assert.ok(o.scale.x>0&&o.scale.y>0&&o.scale.z>0,'escala positiva '+o.name);});}
});
test('U aplicada uma vez na cena: canonical·refs.tip = vértice 280 da malha real no mundo',async()=>{
  const G=await game();equipBoth(G);G.p.camera.rotation.set(-.4,.7,0);frame(G,5);const A=G.h.G('ClimbingAxeAsset');
  for(const inst of G.p.axeVisuals){const m=inst.canonical.getObjectByName(A.data.glb.tipVertex.mesh);
    const v=new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,A.data.glb.tipVertex.index).applyMatrix4(m.matrixWorld);
    assert.ok(tipWorld(inst).distanceTo(v)<=1e-6,'ponta '+inst.side+': '+tipWorld(inst).distanceTo(v));}
});
test('reflexo mundial coerente em idle/striking/whiff/holstering (espaço da câmera)',async()=>{
  const G=await game();equipBoth(G);const it=G.it,[L,R]=G.p.axeVisuals,cam=G.p.camera;
  const check=tag=>{frame(G,0);const inv=new T.Matrix4().copy(cam.matrixWorld).invert();
    const l=new T.Matrix4().multiplyMatrices(inv,L.canonical.matrixWorld),r=new T.Matrix4().multiplyMatrices(inv,R.canonical.matrixWorld);
    const mr=new T.Matrix4().multiplyMatrices(M,r).multiply(M);l.elements.forEach((v,i)=>near(v,mr.elements[i],1e-6,tag+' matriz['+i+']'));
    const tl=L.refs.tip.clone().applyMatrix4(l),tr=R.refs.tip.clone().applyMatrix4(r);vnear(tl,[-tr.x,tr.y,tr.z],1e-6,tag+' ponta');};
  frame(G,20);check('idle');it.left.use(true);it.use(true);assert.equal(it.phase,'striking');frame(G,4);check('striking');
  frame(G,8);assert.equal(it.phase,'whiff','sem superfície: golpe no vazio');check('whiff');frame(G,30);
  it.left.holster();it.holster();frame(G,10);assert.equal(it.phase,'holstering');check('holstering');
});
test('esquerda não lê a direita: golpe da direita não move a picareta da esquerda; refs isoladas',async()=>{
  const A1=await game(),B1=await game();equipBoth(A1);equipBoth(B1);frame(A1,10);frame(B1,10);
  A1.it.use(true);for(let k=0;k<20;k++){frame(A1);frame(B1);}
  const la=A1.p.axeVisuals[0].canonical.matrixWorld.elements,lb=B1.p.axeVisuals[0].canonical.matrixWorld.elements;la.forEach((v,i)=>near(v,lb[i],1e-9,'esquerda['+i+']'));
  const before=A1.p.axeVisuals[0].refs.tip.clone();A1.p.axeVisuals[1].refs.tip.set(9,9,9);vnear(A1.p.axeVisuals[0].refs.tip,before,0,'refs esq');
});
test('desequipar limpa axeVisuals da mão certa',async()=>{
  const G=await game();equipBoth(G);G.it.holster();frame(G,60);assert.equal(G.p.axeVisuals[1],null);assert.ok(G.p.axeVisuals[0]&&G.p.axeVisuals[0].source==='glb');
});
test('reserva procedural só sem GLB: aviso identificável uma vez, refs próprias; nunca conta como GLB',async()=>{
  const warns=[],w=console.warn;console.warn=(...a)=>warns.push(a.join(' '));
  try{const G=await game(false);equipBoth(G);frame(G);const [L,R]=G.p.axeVisuals;
    assert.equal(L.source,'procedural');assert.equal(R.source,'procedural');assert.ok(meshes(R.canonical).length>=6,'malhas procedurais');
    const A=G.h.G('ClimbingAxeAsset');vnear(R.refs.tip,A.data.proceduralRefs.tip,0,'refs procedurais');
    assert.equal(warns.filter(s=>s.includes('[climbing_axe:fallback]')).length,1,'aviso uma vez: '+warns.join(' | '));
  }finally{console.warn=w;}
});

// ---------------------------------------------------------------- B4: restrição final do viewmodel (mãos rigged reais)
async function rigGame(){const g=await gltf(),hands=await H.loadHands(),h=H.axeGame(g,[],hands);const G=h.makeGame();G.h=h;G.it.inv.add('climbing_axe',2);
  assert.ok(G.p.handModels[0].rig&&G.p.handModels[1].rig,'mãos GLB com esqueleto');return G;}
// parede de rocha marcada para a picareta, de frente para a câmera (normal +z)
function wall(G){const m=new T.Mesh(new T.BoxGeometry(4,4,.2),new T.MeshBasicMaterial());m.position.set(0,1.6,-.8);m.userData={axe:true,wallNormal:new T.Vector3(0,0,1)};G.p.scene.add(m);m.updateMatrixWorld(true);return m;}
function anchor(G,i,pt,surf){const r=G.p.anchorAxe(i,{object:surf,distance:.5,point:pt,face:{normal:new T.Vector3(0,0,1)}});assert.equal(r.ok,true,'anchorAxe '+r.reason);
  const it=i===0?G.it.left:G.it;it.phase='anchored';it.t=0;it.useHeld=true;}
function camLook(G,yaw,pitch,bob=0){const c=G.p.camera;c.position.set(Math.sin(yaw)*.05,1.6+bob,Math.cos(yaw)*.05);c.rotation.set(pitch,yaw,0,'YXZ');c.updateMatrixWorld(true);}
const physState=G=>JSON.stringify({pos:G.p.position,hands:G.p.hands.map(h=>({point:h.point,normal:h.normal,stamina:h.stamina,anchor:h.anchor,inContact:h.inContact}))});
// esperado independente do solver: pica para dentro da parede (−N), cabo no plano da parede, para cima
function expectPinned(G,i,tag){const inst=G.p.axeVisuals[i],h=G.p.hands[i];inst.canonical.updateWorldMatrix(true,false);
  const d=tipWorld(inst).distanceTo(h.point);assert.ok(d<=.001,`${tag}: ponta a ${(d*1000).toFixed(3)} mm`);
  const q=inst.canonical.getWorldQuaternion(new T.Quaternion()),b=inst.refs.biteAxis.clone().applyQuaternion(q),u=inst.refs.headUp.clone().applyQuaternion(q);
  const N=h.normal.clone().normalize(),upT=new T.Vector3(0,1,0).addScaledVector(N,-N.y).normalize();
  assert.ok(b.angleTo(N.clone().negate())<=T.MathUtils.degToRad(.1),tag+' bite = −N');assert.ok(u.angleTo(upT)<=T.MathUtils.degToRad(.1),tag+' cabo para cima');
  // empunhadura: a origem de C (grip da ferramenta) continua no ponto do socket da mão dado pela montagem do item
  const side=i===0?-1:1,mp=G.h.G('ITEM_DEFS').climbing_axe.item.p,sock=G.p.handModels[i].socket;sock.updateWorldMatrix(true,false);
  const want=new T.Vector3(side*mp[0],mp[1],mp[2]).applyMatrix4(sock.matrixWorld),grip=new T.Vector3().setFromMatrixPosition(new T.Matrix4().multiplyMatrices(inst.canonical.matrixWorld,inst.refs.grip));
  assert.ok(grip.distanceTo(want)<=.005,`${tag}: empunhadura a ${(grip.distanceTo(want)*1000).toFixed(2)} mm do socket`);
  assert.ok(inst.canonical.matrixWorld.determinant()>0&&G.p.handModels[i].root.matrixWorld.determinant()>0);}
test('B4 600 quadros: duas picaretas cravadas, mãos rigged, olhar varrendo (inclui para baixo): ponta ≤1 mm, orientação ≤0,1°, empunhadura ≤5 mm, física intacta',async()=>{
  const G=await rigGame();equipBoth(G);const surf=wall(G);anchor(G,0,new T.Vector3(-.28,1.75,-.7),surf);anchor(G,1,new T.Vector3(.3,1.82,-.7),surf);
  const before=physState(G),audio0=G.h.audio.calls.length;
  for(let k=0;k<600;k++){camLook(G,Math.sin(k*.021)*1.2,-1.45+1.9*(.5+.5*Math.sin(k*.013)),Math.sin(k*.3)*.01);G.h.step(G.it,1);G.p.updateViewmodel();
    if(k%7===0||k>590){expectPinned(G,0,'esq k='+k);expectPinned(G,1,'dir k='+k);}}
  assert.equal(physState(G),before,'viewmodel não altera ponto/normal/stamina/corpo');assert.equal(G.h.audio.calls.length,audio0,'sem sons extras: '+G.h.audio.calls.slice(audio0));
});
test('Health T3: com 25 HP (pele crítica e tremor nos dedos) a ponta segue ≤1 mm em 240 quadros, mãos rigged',async()=>{
  const G=await rigGame();G.p.health.set(25);equipBoth(G);const surf=wall(G);anchor(G,0,new T.Vector3(-.28,1.75,-.7),surf);anchor(G,1,new T.Vector3(.3,1.82,-.7),surf);
  for(let k=0;k<240;k++){camLook(G,Math.sin(k*.021)*1.2,-1.2+1.6*(.5+.5*Math.sin(k*.013)));G.h.step(G.it,1);G.p.updateViewmodel();
    if(k%5===0||k>235){expectPinned(G,0,'esq k='+k);expectPinned(G,1,'dir k='+k);}}
  G.p.handModels.forEach(h=>{assert.equal(h.hurtTremor,G.h.G('HandWear').CRITICAL_TREMOR);assert.equal(h.mat.userData.wear.uWear.value,1);assert.ok(h.rig);});
});
test('B4 uma cravada, outra golpeando/ricocheteando/guardando; soltar e cansaço devolvem a ferramenta à mão',async()=>{
  const G=await rigGame();equipBoth(G);const surf=wall(G);anchor(G,0,new T.Vector3(-.25,1.7,-.7),surf);
  G.it.use(true);for(let k=0;k<40;k++){camLook(G,.4*Math.sin(k*.2),-.3);G.h.step(G.it,1);G.p.updateViewmodel();expectPinned(G,0,G.it.phase+' k='+k);}
  assert.ok(['bounce','idle'].includes(G.it.phase),'direita ricocheteou: '+G.it.phase);
  G.it.holster();for(let k=0;k<10;k++){G.h.step(G.it,1);G.p.updateViewmodel();expectPinned(G,0,'holster k='+k);}
  // soltar: volta ao espaço da câmera (sem pino), frame de contato descartado
  G.it.left.use(false);assert.equal(G.it.left.phase,'idle');camLook(G,.9,-.2);G.h.step(G.it,1);G.p.updateViewmodel();
  assert.equal(G.p._axeContact[0],null,'frame descartado');const inst=G.p.axeVisuals[0];inst.canonical.updateWorldMatrix(true,false);
  const pose=G.p.itemPoses[0],want=G.p.camera.localToWorld(pose.pos.clone());assert.ok(G.p.handModels[0].root.position.distanceTo(want)<.03,'mão volta ao viewmodel');
  // recrava e esgota: arrancada → mão segue a câmera, sem pino
  anchor(G,0,new T.Vector3(-.2,1.6,-.7),surf);G.h.step(G.it,1);G.p.updateViewmodel();expectPinned(G,0,'recravada');
  const h=G.p.hands[0];h.stamina=0;h.exhausted=true;G.p._release(h);G.p._dislodge(h);G.h.step(G.it,1);G.p.updateViewmodel();
  assert.equal(G.it.left.phase,'dislodged');assert.equal(G.p._axeContact[0],null);
});
test('B4 VR: cabeça e controle se movem sem arrastar a ponta; soltar volta ao controle sem mover o headset',async()=>{
  const G=await rigGame();equipBoth(G);const surf=wall(G);anchor(G,1,new T.Vector3(.3,1.8,-.7),surf);
  const ctrl=new T.Vector3(.4,1.2,-.3),cq=new T.Quaternion();G.p.xr={handPose(i,pos,quat){pos.copy(ctrl).setX(i?ctrl.x:-ctrl.x);quat.copy(cq);return true;}};
  for(let k=0;k<120;k++){ctrl.set(.4+.1*Math.sin(k*.1),1.2+.05*k/120,-.3);cq.setFromEuler(new T.Euler(.3*Math.sin(k*.07),.2,0));camLook(G,.5*Math.sin(k*.05),-.6);
    G.h.step(G.it,1);G.p.updateViewmodel();expectPinned(G,1,'VR k='+k);}
  const camBefore=G.p.camera.matrixWorld.clone();G.it.use(false);G.h.step(G.it,1);G.p.updateViewmodel();
  assert.ok(G.p.handModels[1].root.position.distanceTo(ctrl)<1e-9,'mão no controle');G.p.camera.matrixWorld.elements.forEach((v,i)=>assert.equal(v,camBefore.elements[i]));
});
test('B4 superfície que se move: o contato visual segue ponto/normal físicos atuais; reset/debug descartam o frame',async()=>{
  const G=await rigGame();equipBoth(G);const surf=wall(G);anchor(G,1,new T.Vector3(.3,1.8,-.7),surf);G.h.step(G.it,1);G.p.updateViewmodel();expectPinned(G,1,'início');
  const h=G.p.hands[1];for(let k=0;k<60;k++){h.point.x+=.002;h.point.y-=.001;h.normal.set(Math.sin(k*.004),0,Math.cos(k*.004));G.h.step(G.it,1);G.p.updateViewmodel();expectPinned(G,1,'movendo k='+k);}
  G.p.clearDebugTransient();assert.deepEqual(Array.from(G.p._axeContact),[null,null]);anchor(G,1,new T.Vector3(.2,1.7,-.7),surf);G.h.step(G.it,1);G.p.updateViewmodel();expectPinned(G,1,'após debug');
  G.p.reset();assert.deepEqual(Array.from(G.p._axeContact),[null,null]);
});

// ---------------------------------------------------------------- B5: loot real e ownership dos recursos compartilhados
// Mundo REAL (World/Climbs/Interactables/SectorManager) com o Models REAL servindo o GLB; dispose instrumentado.
async function worldGame(withGlb=true){
  const dh=require('./_debug_harness.js')();
  dh.load('js/core/modelDefs.js');dh.load('js/core/models.js');
  if(withGlb){const g=await gltf();dh.G('Models').ready.set('climbing_axe',{scene:g.scene,animations:[],def:dh.G('MODEL_DEFS').climbing_axe});}
  dh.world.reset();dh.g.sectors.update(1/60);    // mapa reconstruído já com o catálogo; setores reclassificados
  return dh;
}
const crates=w=>w.interactables.filter(o=>o.userData.type==='crate'&&o.userData.interactable.loot.climbing_axe).map(o=>o.userData.interactable).filter((c,i,a)=>a.indexOf(c)===i);
function openAxeCrates(dh){const out=[];for(const c of crates(dh.world)){c.interact({audio:dh.audio});out.push({crate:c,pk:c.pickups.find(p=>p.id==='climbing_axe')});}return out;}
const axeInst=o=>{let r=null;o.traverse(m=>{if(!r&&m.userData&&m.userData.axeInstance)r=m.userData.axeInstance;});return r;};
// conta dispose() das geometrias/materiais do cache (Models.ready), sem mudar o comportamento
function instrument(dh){const n={geo:0,mat:0},seen=new Set();dh.G('Models').ready.get('climbing_axe').scene.traverse(o=>{if(!o.isMesh)return;
  for(const [r,k] of [[o.geometry,'geo'],[o.material,'mat']]){if(seen.has(r))continue;seen.add(r);const f=r.dispose.bind(r);r.dispose=()=>{n[k]++;f();};}});return n;}
const matSnap=dh=>{const a=[];dh.G('Models').ready.get('climbing_axe').scene.traverse(o=>{if(o.isMesh)a.push([o.material.name,o.material.color.getHex(),o.material.metalness,o.material.roughness,o.material.side]);});return JSON.stringify(a);};
function equipRight(dh){const it=dh.g.items;it.inv.add('climbing_axe',1);const slot=it.inv.slots.findIndex(s=>s&&s.id==='climbing_axe');it.select(slot,'right');
  for(let n=0;n<90&&it.phase!=='idle';n++){dh.clock.now+=1000/60;it.update(1/60);}assert.equal(it.phase,'idle');assert.equal(it.equipped,'climbing_axe');return dh.p.axeVisuals[1];}
const usable=inst=>{assert.equal(inst.source,'glb');const ms=meshes(inst.canonical);assert.equal(ms.length,4);ms.forEach(m=>{assert.ok(m.geometry.attributes.position.count>0,'geometria viva');assert.ok(m.material&&m.material.name,'material vivo');});};

test('B5 caixas reais cp6/cp11: mesmo loot, contagem, raio e coleta; pickup GLB (usage pickup) em wrapper próprio',async()=>{
  const ref=await worldGame(false),dh=await worldGame(true);
  const lootOf=d=>JSON.stringify(crates(d.world).map(c=>c.loot));
  assert.deepEqual(lootOf(dh),lootOf(ref),'loot inalterado');assert.equal(crates(dh.world).length,2,'duas caixas com picareta');
  const a=openAxeCrates(dh),b=openAxeCrates(ref);
  a.forEach(({pk},i)=>{const r=b[i].pk;assert.ok(pk,'pickup criado');assert.equal(pk.count,r.count);assert.equal(pk.count,1);
    assert.equal(pk.mesh.geometry,dh.G('GEO').pickHit,'volume de acerto padrão');assert.equal(pk.mesh.geometry.type,r.mesh.geometry.type);assert.equal(JSON.stringify(pk.mesh.geometry.parameters),JSON.stringify(r.mesh.geometry.parameters),'mesmo raio');vnear(pk.mesh.position,r.mesh.position,1e-9,'posição do pickup');
    const inst=axeInst(pk.mesh);assert.ok(inst,'pickup traz AxeInstance');assert.equal(inst.source,'glb');assert.equal(inst.usage,'pickup');
    assert.equal(meshes(inst.canonical).length,4,'as 4 malhas do GLB');meshes(inst.canonical).forEach(m=>assert.equal(m.frustumCulled,true,'loot no mundo continua com culling'));
    assert.notEqual(inst.canonical,pk.mesh,'wrapper do pickup separado do volume de acerto');assert.equal(inst.canonical.parent&&inst.canonical.parent.name,'axePickup','wrapper próprio');});
  const ctx={items:dh.g.items,audio:dh.audio,ui:{msg(){},slotPulse(){}},player:dh.p};a[0].pk.interact(ctx);assert.equal(dh.g.items.inv.count('climbing_axe'),1,'coleta igual');
});
test('B5 mexer no wrapper do pickup não muda montagem/refs da mão; mão continua com culling desligado',async()=>{
  const dh=await worldGame(true),hand=equipRight(dh);const [{pk}]=openAxeCrates(dh);const inst=axeInst(pk.mesh);
  dh.p.updateViewmodel();hand.canonical.updateMatrixWorld(true);const before=hand.canonical.matrixWorld.clone(),tip=hand.refs.tip.clone();
  assert.notEqual(inst.refs,hand.refs);assert.notEqual(inst.refs.tip,hand.refs.tip);
  const wrap=inst.canonical.parent;wrap.scale.setScalar(3);wrap.rotation.set(1,2,3);inst.refs.tip.set(9,9,9);
  dh.p.updateViewmodel();hand.canonical.updateMatrixWorld(true);hand.canonical.matrixWorld.elements.forEach((v,i)=>near(v,before.elements[i],1e-12,'mão'));vnear(hand.refs.tip,tip,0,'refs da mão');
  meshes(hand.canonical).forEach(m=>assert.equal(m.frustumCulled,false,'ferramenta na mão sem culling'));
});
test('B5 reset do World com a picareta equipada: cache do GLB não é descartado; 4 materiais inalterados; mão utilizável',async()=>{
  const dh=await worldGame(true),hand=equipRight(dh);openAxeCrates(dh);const n=instrument(dh),mats=matSnap(dh);
  dh.world.reset();dh.g.sectors.update(1/60);(dh.world.trash||[]).forEach(x=>x.dispose&&x.dispose());dh.world.trash=[];
  assert.deepEqual(n,{geo:0,mat:0},'nada do cache descartado');assert.equal(matSnap(dh),mats,'materiais');usable(hand);
  const [{pk}]=openAxeCrates(dh);assert.equal(axeInst(pk.mesh).source,'glb','loot do mapa novo continua GLB');
});
test('B5 setor descarregado (freeGeometry) após rebuild, equipada DEPOIS do snapshot: cache preservado; geometria do mapa ainda é liberada',async()=>{
  const dh=await worldGame(true),sm=dh.g.sectors;sm.cfg=Object.assign({},sm.cfg,{freeGeometry:true});
  openAxeCrates(dh);sm.rebuild();                        // pickups GLB dentro dos setores; snapshot de keep sem picareta na mão
  const hand=equipRight(dh),n=instrument(dh),mats=matSnap(dh);
  const cache=new Set();dh.G('Models').ready.get('climbing_axe').scene.traverse(o=>{if(o.isMesh)cache.add(o.geometry);});
  const host=sm.list.filter(s=>[...s.geos].some(g=>cache.has(g)));assert.ok(host.length>=1,'algum setor usa a geometria do GLB (pickup)');
  let freed=0;for(const s of sm.list)s.state='unloaded';for(const s of host){sm._unload(s);freed+=s.freed.geos;}
  assert.deepEqual(n,{geo:0,mat:0},'cache do GLB não descartado pelo streaming');assert.equal(matSnap(dh),mats);usable(hand);
  assert.ok(freed>0,'o streaming continua liberando a geometria do próprio mapa (sem supressão global)');
});

module.exports={test,queue,game,equipBoth,frame,tipWorld,gltf,rigGame,wall,anchor};
if(require.main===module)(async()=>{let n=0,bad=0;
  for(const [name,f] of queue){n++;try{await f();console.log('OK',name);}catch(e){bad++;console.error('FAIL',name,e.stack.split('\n').slice(0,4).join('\n'));}}
  console.log(`${n} testes; falhas: ${bad}`);process.exitCode=bad?1:0;})();
