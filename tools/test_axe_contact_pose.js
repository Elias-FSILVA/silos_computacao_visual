'use strict';
// B3 — AxeContactPose: solver puro de contato/orientação da picareta cravada (sem câmera, sem Player/World).
// Three.js real; refs medidas do GLB (ClimbingAxeAsset) e cadeias de pais/montagem perturbadas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('./_axe_asset_harness'),T=H.THREE;
const queue=[];function test(name,f){queue.push([name,f]);}
const DEG=T.MathUtils.degToRad;
let gltfP=null;const gltf=()=>gltfP||(gltfP=H.loadAxe('assets/models/items/climbing_axe_low_poly.glb'));
async function env(withGlb=true){
  const h=H.axeGame(withGlb?await gltf():null);
  assert.ok(fs.existsSync(path.join(H.ROOT,'js/player/AxeContactPose.js')),'AxeContactPose.js ausente');
  let P;try{P=h.G('AxeContactPose');}catch(e){h.load('js/player/AxeContactPose.js');P=h.G('AxeContactPose');}
  return {h,P,A:h.G('ClimbingAxeAsset')};
}
const rnd=(()=>{let a=987;return()=>{a=(a*16807)%2147483647;return a/2147483647;};})();
// cadeia parecida com a da mão: cena → pai (rot/trans) → root → wrist → base → socket → pivot → canonical (montagem)
function chain(inst,side=1){
  const scene=new T.Scene(),parent=new T.Group(),root=new T.Group(),wrist=new T.Group(),base=new T.Group(),socket=new T.Group(),pivot=new T.Group();
  parent.position.set(3.2,-1.4,7.9);parent.rotation.set(.31,-1.2,.17);scene.add(parent);parent.add(root);root.add(wrist);wrist.add(base);base.add(socket);socket.add(pivot);pivot.add(inst.canonical);
  inst.canonical.position.set(side*-.025,-.03,-.078);inst.canonical.rotation.set(.13,side*-.21,side*Math.PI/2);   // montagem perturbada
  return {scene,parent,root,wrist,base,socket,pivot};
}
// o "olhar" (câmera) mexe na raiz e nas articulações locais a cada quadro; o solver não pode depender disso
function look(c,yaw,pitch){c.root.position.set(Math.sin(yaw)*.3,-.2+pitch*.1,-.4);c.root.rotation.set(pitch,yaw,.2*yaw);c.wrist.rotation.set(-.85+.1*pitch,.05*yaw,0);c.base.rotation.set(-.5,.1*yaw,-Math.PI/2);c.scene.updateMatrixWorld(true);}
const tipW=inst=>inst.refs.tip.clone().applyMatrix4(inst.canonical.matrixWorld);
const qW=o=>o.getWorldQuaternion(new T.Quaternion());
const NORMALS={parede:[1,0,0],parede2:[0,0,-1],inclinada:[.6,.5,-.62],piso:[0,1,0],teto:[0,-1,0],quaseVertical:[.004,1,.003]};
const nrm=a=>new T.Vector3(...a).normalize();

test('tip_matches_anchor_for_yaw_pitch_sweep: ponta ≤1 mm, orientação fixa ≤0,1° com o olhar variando',async()=>{
  const {P,A}=await env();
  for(const [name,n] of Object.entries(NORMALS)){const inst=A.create({side:1}),c=chain(inst),N=nrm(n),Apt=new T.Vector3(1.7,4.2,-2.3);
    const frame=P.capture(Apt,N,inst.refs),out=new T.Matrix4();let q0=null;
    for(let k=0;k<200;k++){const yaw=-Math.PI+k*.0314,pitch=-1.4+(k%40)*.07;look(c,yaw,pitch);P.solve(frame,Apt,N,inst.refs,out);P.applyHandRoot(c.root,inst.canonical,out);
      const d=tipW(inst).distanceTo(Apt);assert.ok(d<=.001,`${name} ponta ${d} m em k=${k}`);const q=qW(inst.canonical);if(!q0)q0=q;assert.ok(q.angleTo(q0)<=DEG(.1),`${name} orientação variou ${q.angleTo(q0)}`);
      assert.ok(inst.canonical.matrixWorld.determinant()>0&&c.root.matrixWorld.determinant()>0,'det>0');}
    // a pica entra na superfície: biteAxis do mundo = −N; o cabo (headUp) fica no plano da superfície
    const Q=qW(inst.canonical),b=inst.refs.biteAxis.clone().applyQuaternion(Q),u=inst.refs.headUp.clone().applyQuaternion(Q);
    assert.ok(b.dot(N)<-.9999,name+' bite = −N');assert.ok(Math.abs(u.dot(N))<1e-6,name+' up tangente');
    if(Math.abs(N.y)<.9)assert.ok(u.y>0,name+' cabo para cima na parede');}
});
test('near_parallel_up_no_roll_flip: normal passando pela vertical sem troca brusca de roll',async()=>{
  const {P,A}=await env();const inst=A.create({side:1}),c=chain(inst),Apt=new T.Vector3(0,2,0),out=new T.Matrix4();
  const at=t=>new T.Vector3(Math.cos(t),Math.sin(t),.02*Math.sin(3*t)).normalize();   // de parede (+x) pelo piso até a parede oposta (−x)
  let N=at(0);const frame=P.capture(Apt,N,inst.refs);let prev=null,prevN=N.clone();
  for(let k=0;k<=360;k++){const t=k/360*Math.PI;N=at(t);look(c,k*.01,0);P.solve(frame,Apt,N,inst.refs,out);P.applyHandRoot(c.root,inst.canonical,out);
    const q=qW(inst.canonical),dn=N.angleTo(prevN);if(prev)assert.ok(q.angleTo(prev)<=2*dn+DEG(.05),`salto de ${(q.angleTo(prev)*180/Math.PI).toFixed(3)}° com normal ${(dn*180/Math.PI).toFixed(3)}° em k=${k}`);
    assert.ok(tipW(inst).distanceTo(Apt)<=.001);prev=q;prevN=N.clone();}
  for(const n of [[0,1,0],[0,-1,0]]){const f1=P.capture(Apt,nrm(n),inst.refs),f2=P.capture(Apt,nrm(n),inst.refs);assert.ok(f1.tangent.distanceTo(f2.tangent)<1e-12,'tangente determinística na singularidade');assert.ok(Math.abs(f1.tangent.dot(nrm(n)))<1e-9);}
});
test('left_right_distinct_contacts: frames por mão, esquerda refletida, sem estado compartilhado',async()=>{
  const {P,A}=await env();const L=A.create({side:-1}),R=A.create({side:1}),cl=chain(L,-1),cr=chain(R,1);
  const AL=new T.Vector3(-.4,3,1),AR=new T.Vector3(.5,3.2,1),N=nrm([0,0,-1]),fl=P.capture(AL,N,L.refs),fr=P.capture(AR,N,R.refs);
  assert.notEqual(fl,fr);assert.notEqual(fl.tangent,fr.tangent);const mL=new T.Matrix4(),mR=new T.Matrix4();
  for(let k=0;k<50;k++){look(cl,-.02*k,.01*k);look(cr,.03*k,-.01*k);P.solve(fl,AL,N,L.refs,mL);P.applyHandRoot(cl.root,L.canonical,mL);P.solve(fr,AR,N,R.refs,mR);P.applyHandRoot(cr.root,R.canonical,mR);
    assert.ok(tipW(L).distanceTo(AL)<=.001);assert.ok(tipW(R).distanceTo(AR)<=.001);}
  const t=fl.tangent.clone();P.solve(fr,AR,nrm([.3,0,-1]),R.refs,mR);assert.ok(fl.tangent.equals(t),'resolver a direita não muda o frame da esquerda');
});
test('surface_moves_not_camera: ponta segue o ponto/normal físicos; câmera não move a ferramenta',async()=>{
  const {P,A}=await env();const inst=A.create({side:1}),c=chain(inst),N=nrm([1,0,0]),Apt=new T.Vector3(2,5,0),out=new T.Matrix4(),frame=P.capture(Apt,N,inst.refs);
  look(c,0,0);P.solve(frame,Apt,N,inst.refs,out);P.applyHandRoot(c.root,inst.canonical,out);const m0=inst.canonical.matrixWorld.clone();
  look(c,1.1,-.9);P.solve(frame,Apt,N,inst.refs,out);P.applyHandRoot(c.root,inst.canonical,out);
  inst.canonical.matrixWorld.elements.forEach((v,i)=>assert.ok(Math.abs(v-m0.elements[i])<1e-6,'câmera moveu a ferramenta'));
  const A2=Apt.clone().add(new T.Vector3(0,-.3,.2)),N2=nrm([.97,.05,.2]);P.solve(frame,A2,N2,inst.refs,out);P.applyHandRoot(c.root,inst.canonical,out);
  assert.ok(tipW(inst).distanceTo(A2)<=.001,'ponta segue a superfície');assert.ok(inst.refs.biteAxis.clone().applyQuaternion(qW(inst.canonical)).dot(N2)<-.9999);
});
test('normalization_applied_once: vértice real da ponta (malha GLB) no ponto, com pai/montagem perturbados; entradas imutáveis',async()=>{
  const {P,A}=await env();const inst=A.create({side:1}),c=chain(inst);assert.equal(inst.source,'glb');
  c.parent.scale.set(1,1,1);const m=inst.canonical.getObjectByName(A.data.glb.tipVertex.mesh);
  const Apt=new T.Vector3(-3.3,7.1,2.2),N=nrm([-.2,.1,.97]),A0=Apt.clone(),N0=N.clone(),refs0=JSON.stringify(inst.refs),out=new T.Matrix4(),frame=P.capture(Apt,N,inst.refs);
  for(let k=0;k<30;k++){look(c,.2*k,-.03*k);P.solve(frame,Apt,N,inst.refs,out);P.applyHandRoot(c.root,inst.canonical,out);inst.canonical.updateMatrixWorld(true);
    const v=new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,A.data.glb.tipVertex.index).applyMatrix4(m.matrixWorld);
    assert.ok(v.distanceTo(Apt)<=.001,'vértice da ponta a '+v.distanceTo(Apt)+' m');assert.ok(m.matrixWorld.determinant()>0);}
  assert.ok(Apt.equals(A0)&&N.equals(N0),'âncora/normal intactas');assert.equal(JSON.stringify(inst.refs),refs0,'refs intactas');
  const s=new T.Vector3();c.root.matrixWorld.decompose(new T.Vector3(),new T.Quaternion(),s);assert.ok(s.x>0&&s.y>0&&s.z>0&&Math.abs(s.x-1)<1e-9,'raiz sem escala nova');
});
test('procedural (reserva) usa as próprias refs e também crava pela ponta',async()=>{
  const {P,A}=await env(false);const w=console.warn;console.warn=()=>{};let inst;try{inst=A.create({side:1,fallback:()=>H.axeGame(null).G('makeClimbingAxe')()});}finally{console.warn=w;}
  assert.equal(inst.source,'procedural');const c=chain(inst),Apt=new T.Vector3(1,1,1),N=nrm([0,0,1]),out=new T.Matrix4(),f=P.capture(Apt,N,inst.refs);
  look(c,.4,.2);P.solve(f,Apt,N,inst.refs,out);P.applyHandRoot(c.root,inst.canonical,out);assert.ok(tipW(inst).distanceTo(Apt)<=.001);
});

module.exports={queue,env,chain,look};
if(require.main===module)(async()=>{let n=0,bad=0;
  for(const [name,f] of queue){n++;try{await f();console.log('OK',name);}catch(e){bad++;console.error('FAIL',name,e.stack.split('\n').slice(0,3).join('\n'));}}
  console.log(`${n} testes; falhas: ${bad}`);process.exitCode=bad?1:0;})();
