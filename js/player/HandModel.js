'use strict';
// ============================================================================
// js/player/HandModel.js — mão articulada em 1ª pessoa
// Hierarquia: root (posição/orientação na tela) → wrist (flexão animada do pulso)
//             → base (orientação da pegada: palma para baixo, "aperto de mão"…) → palma, dedos, polegar, socket
// Cada dedo tem 3 falanges; o polegar tem base móvel + 2 falanges. Os ângulos seguem molas amortecidas
// rumo à pose-alvo, o que dá fechamento escalonado dos dedos e um leve "quique" ao abrir/fechar.
// Quem usa só escolhe: setPose(), setBase(), squeeze, slack, tremor, kick(), tint(); e chama update(dt).
// root deve ser adicionado à cena por quem cria a mão.
// Itens seguram-se pelo `socket` (filho de base), então acompanham a mão em qualquer movimento.
// Visual: modelo com esqueleto de assets/models/player (MODEL_DEFS handR/handL), com os ossos seguindo as molas;
// sem ele, low-poly facetado (sombreamento plano), pele pálida com rachaduras, veias e hematomas (textura procedural).
// ============================================================================
class HandModel{
  constructor(side){
    this.side=side; const s=side, A=HandModel.assets();
    this.mat=new THREE.MeshStandardMaterial({map:A.skin,roughness:.55,metalness:0,flatShading:true});
    this.root=new THREE.Group(); this.wrist=new THREE.Group(); this.base=new THREE.Group(); this.socket=new THREE.Group();
    this.root.add(this.wrist); this.wrist.add(this.base); this.base.add(this.socket);
    this.procMeshes=[];
    const add=(parent,geo,x,y,z,sx=1,sy=1,sz=1)=>{ const m=new THREE.Mesh(geo,this.mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); parent.add(m); this.procMeshes.push(m); return m; };
    add(this.base,A.palm,0,0,0,s);                                          // palma (o pulso fica em z=0; dedos para -z)
    add(this.base,A.wristStub,0,.001,0);                                    // toco do pulso
    add(this.base,A.lump,-.026*s,-.009,-.03,1.1,.75,1.7);                    // base carnuda do polegar
    // dedos: índice 0 = indicador (lado do polegar); prismas de 6 lados que afinam até a ponta, com nós salientes
    this.fingers=HandModel.FINGERS.map(f=>{
      const r=new THREE.Group(); r.position.set(f.x*s,0,f.z); this.base.add(r);
      add(this.base,A.lump,f.x*s,.011,f.z+.004,f.w*72,f.w*55,f.w*72);         // nó do dedo na palma
      const joints=[]; let parent=r;
      f.len.forEach((len,j)=>{ const jt=new THREE.Group(); if(j) jt.position.z=-f.len[j-1]; parent.add(jt);
        const r0=f.w*.5*(1-j*.1), r1=r0*(j===2?.62:.86);
        add(jt,A.seg(r0,r1,len),0,0,0,1,.86);
        if(j) add(jt,A.lump,0,.0015,0,r0*112,r0*92,r0*112);                    // articulação
        joints.push(jt); parent=jt; });
      return {root:r,joints};
    });
    // polegar: base na lateral da palma, voltada para dentro
    const tb=new THREE.Group(); tb.position.set(-.036*s,-.007,-.03); tb.rotation.order='YXZ'; this.base.add(tb);
    add(tb,A.seg(.0125,.0108,.032),0,0,0,1.15,.9);
    const t1=new THREE.Group(); t1.position.z=-.032; tb.add(t1); add(t1,A.seg(.0104,.0094,.024),0,0,0,1,.88); add(t1,A.lump,0,0,0,1.05,.9,1.05);
    const t2=new THREE.Group(); t2.position.z=-.024; t1.add(t2); add(t2,A.seg(.0092,.0058,.02),0,0,0,1,.85);
    this.thumb={base:tb,joints:[t1,t2]};
    // estado das molas: 4 dedos × [abertura, falange 1, 2, 3] + polegar [giro, descida, rolagem, falange 1, 2]
    this.x=new Float32Array(21); this.v=new Float32Array(21); this.tgt=new Float32Array(21); this.f=new Float32Array(21);
    this.squeeze=0; this.slack=0; this.tremor=0; this.time=Math.random()*10; this.wasContact=false;
    this.baseTgt=new THREE.Vector3();
    this.rig=null; this._useModel();
    // desgaste pela vida (HandWear): camada no material final (GLB ou procedural); hurtTremor só nas falanges
    HandWear.apply(this.mat,{side:s}); this._wear={from:0,to:0,t:1}; this.hurtTremor=0;
    this.setPose('relaxed'); this.x.set(this.tgt); this._apply();
  }
  // Modelo 3D com esqueleto (MODEL_DEFS handR/handL): troca a malha procedural pela do arquivo, e os ossos
  // passam a seguir as mesmas molas. Sem o modelo (file://, falha de carga, ossos faltando), fica a procedural.
  _useModel(){
    const id=this.side<0?'handL':'handR', g=typeof Models!=='undefined'&&Models.get(id); if(!g) return;
    const bones={}; let mesh=null;
    g.traverse(o=>{ if(o.isBone) bones[o.name]=o; if(o.isSkinnedMesh) mesh=o; });
    const fingers=HandModel.RIG_FINGERS.map(n=>['Proximal','Intermediate','Distal'].map(p=>bones[n+'_'+p]));
    const thumb=['Metacarpal','Proximal','Distal'].map(p=>bones['Thumb_'+p]);
    if(!mesh||fingers.flat().some(b=>!b)||thumb.some(b=>!b)){ console.warn(`HandModel: "${id}" sem os ossos esperados; usando a mão procedural.`); return; }
    // espaço do arquivo (dedos +y, palma +z) → espaço de base (dedos -z, palma -y); o polegar continua do mesmo lado
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-1,0)));
    // material próprio (tint() mexe no emissivo); pele não é metal; cor da textura sem conversão, como a pele procedural
    const mat=mesh.material.clone(); mat.metalness=0; if(mat.map) mat.map.encoding=THREE.LinearEncoding;
    mesh.material=this.mat=mat; mesh.frustumCulled=false;
    this.procMeshes.forEach(m=>{ m.visible=false; });
    this.base.add(g);
    // o metacarpo do polegar vai da pose aberta à do punho, ambas tiradas das poses do próprio arquivo
    const clipQ=(name)=>{ const c=Models.clips(id).find(c=>c.name===name), t=c&&c.tracks.find(t=>t.name===thumb[0].name+'.quaternion');
      return t?new THREE.Quaternion().fromArray(t.values,t.values.length-4):thumb[0].quaternion.clone(); };
    const rest=b=>({b,e:b.rotation.clone()});
    this.rig={fingers:fingers.map(f=>f.map(rest)),thumb:thumb.map(rest),qOpen:clipQ('Pose_Open'),qFist:clipQ('Pose_Fist')};
  }
  // pose-alvo; com b e t, mistura linear entre duas poses
  setPose(a,b=null,t=0){
    const A=HandModel.POSES[a]||HandModel.POSES.relaxed, B=b&&HandModel.POSES[b];
    for(let j=0;j<21;j++) this.tgt[j]=B?A[j]+(B[j]-A[j])*t:A[j];
  }
  // Interromper um gesto visual: aplicar o alvo atual sem deixar uma pose congelada nos overlays.
  snapPose(){ this.x.set(this.tgt); this.v.fill(0); this._apply(); }
  setBase(r){ this.baseTgt.set(r[0],r[1],r[2]); }
  snapBase(){ this.base.rotation.set(this.baseTgt.x,this.baseTgt.y,this.baseTgt.z); }
  kick(a){ for(let i=0;i<4;i++){ this.v[i*4+2]+=a; this.v[i*4+3]+=a*.6; } }
  tint(r){ this.mat.emissive.setRGB(r,0,0); }
  // estado da vida (healthy/hurt/injured/critical/dead): transição linear de 0,25 s no update, ou instantânea
  setWear(state,{instant=false}={}){
    const to=HandWear.level(state), u=this.mat.userData.wear.uWear, w=this._wear;
    if(instant){ u.value=to; w.from=w.to=to; w.t=1; return; }
    if(to===w.to) return;
    w.from=u.value; w.to=to; w.t=0;
  }
  update(dt){
    this.time+=dt;
    const w=this._wear; if(w.t<1){ w.t=Math.min(1,w.t+dt/HandWear.TWEEN); this.mat.userData.wear.uWear.value=w.from+(w.to-w.from)*w.t; }
    const F=this.f, T=this.tgt, O=HandModel.POSES.open, K=HandModel.STIFF;
    for(let j=0;j<21;j++) F[j]=T[j]+(O[j]-T[j])*this.slack;
    if(this.squeeze){ for(let i=0;i<4;i++){ F[i*4+1]+=this.squeeze*.5; F[i*4+2]+=this.squeeze; F[i*4+3]+=this.squeeze*.6; } F[19]+=this.squeeze*.4; F[20]+=this.squeeze*.4; }
    const n=Math.max(1,Math.ceil(dt*120)), h=dt/n;
    for(let st=0;st<n;st++) for(let j=0;j<21;j++){
      const k=520*K[j], c=2*Math.sqrt(k)*.62;
      this.v[j]+=(k*(F[j]-this.x[j])-c*this.v[j])*h; this.x[j]+=this.v[j]*h;
    }
    const a=1-Math.exp(-16*dt), r=this.base.rotation, b=this.baseTgt;
    r.set(r.x+(b.x-r.x)*a,r.y+(b.y-r.y)*a,r.z+(b.z-r.z)*a);
    this._apply();
  }
  _apply(){
    const x=this.x, s=this.side, tr=Math.max(this.tremor,this.hurtTremor||0), t=this.time;
    this.fingers.forEach((f,i)=>{
      const n=tr?(Math.sin(t*41+i*1.7)+Math.sin(t*27+i*2.9))*.5*tr:0;
      f.root.rotation.y=x[i*4]*s;
      f.joints.forEach((jt,j)=>{ jt.rotation.x=-(x[i*4+1+j]+n*(j?.6:1)); });
    });
    const tb=this.thumb.base, n=tr?Math.sin(t*33)*tr*.5:0;
    tb.rotation.set(-(x[17]+n),x[16]*s,x[18]*s);
    this.thumb.joints.forEach((jt,j)=>{ const c=x[19+j]; jt.rotation.set(-c*.45,-c*s*.85,0); });
    if(this.rig) this._applyRig();
  }
  // mesmas molas nos ossos do modelo: flexão = +x local; abertura = z local (sinal espelhado entre as mãos)
  _applyRig(){
    const x=this.x, s=this.side, tr=Math.max(this.tremor,this.hurtTremor||0), t=this.time, R=this.rig, rel=HandModel.POSES.relaxed;
    R.fingers.forEach((f,i)=>{
      const n=tr?(Math.sin(t*41+i*1.7)+Math.sin(t*27+i*2.9))*.5*tr:0;
      f.forEach(({b,e},j)=>{ b.rotation.set(x[i*4+1+j]+n*(j?.6:1),e.y,j?e.z:e.z-(x[i*4]-rel[i*4])*s); });
    });
    // polegar: abertura (16) e oposição (17) viram um só avanço da pose aberta (0) ao punho (1)
    const k=clamp((.95-x[16])/1.3*.7+(x[17]-.05)/.55*.3,0,1.1)+(tr?Math.sin(t*33)*tr*.3:0);
    R.thumb[0].b.quaternion.slerpQuaternions(R.qOpen,R.qFist,k);
    for(let j=1;j<3;j++){ const {b,e}=R.thumb[j]; b.rotation.set(x[18+j]*1.5,e.y,e.z); }
  }
  // geometrias e textura compartilhadas pelas duas mãos (criadas uma vez)
  static assets(){
    if(HandModel._assets) return HandModel._assets;
    const R=mulberry(4242), jit=a=>(R()-.5)*a;
    // UV proporcional ao tamanho real, para a textura ter a mesma densidade em peças grandes e pequenas
    const scaleUV=(geo,su,sv)=>{ const uv=geo.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*su,uv.getY(i)*sv); return geo; };
    const segs=new Map();
    const A={
      skin:HandModel._skinTexture(),
      // falange: prisma de 6 lados do pulso para a ponta (de z=0 até z=-len), afinando de r0 para r1
      seg(r0,r1,len){
        const k=r0+'|'+r1+'|'+len; if(segs.has(k)) return segs.get(k);
        const g=new THREE.CylinderGeometry(r1,r0,len,6,1).rotateX(-Math.PI/2).translate(0,0,-len/2).rotateZ(Math.PI/6);
        scaleUV(g,r0*6/.12,len/.12); segs.set(k,g); return g;
      },
      lump:new THREE.IcosahedronGeometry(.01,0),
      wristStub:scaleUV(new THREE.CylinderGeometry(.027,.026,.04,7,1).rotateX(Math.PI/2).translate(0,0,.016).scale(1.15,.82,1),1.6,.35)
    };
    // palma: caixa deformada — mais larga nos nós que no pulso, dorso abaulado, concha na palma, linha dos nós curva
    const palm=new THREE.BoxGeometry(1,1,1,4,2,4), p=palm.attributes.position, seen=new Map();
    for(let i=0;i<p.count;i++){
      const u=p.getX(i), v=p.getY(i), w=p.getZ(i), key=u+'|'+v+'|'+w;
      if(!seen.has(key)){
        const t=.5-w, half=.027+t*.017, thick=.027-t*.005, c=1-(2*u)**2, edge=Math.abs(2*u)*Math.abs(2*v);
        let X=u*2*half*(1-edge*.12), Y=v*thick*(1-Math.abs(2*u)**3*.35), Z=-.0475+w*.095+(2*u)**2*.007*t;
        if(v>0) Y+=c*.007*(.6+t*.4); else Y+=c*(1-(2*w)**2)*.005;
        seen.set(key,[X+jit(.0016),Y+jit(.0014),Z+jit(.0016)]);
      }
      p.setXYZ(i,...seen.get(key));
    }
    palm.computeVertexNormals(); A.palm=scaleUV(palm,.75,.8);
    return (HandModel._assets=A);
  }
  // pele pálida com variação de tom, hematomas, veias e rachaduras escuras
  static _skinTexture(){
    const S=512, c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'), R=mulberry(1313);
    g.fillStyle='#b39a82'; g.fillRect(0,0,S,S);
    const blob=(x,y,r,rgb,a)=>{ const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,`rgba(${rgb},${a})`); gr.addColorStop(1,`rgba(${rgb},0)`);
      g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); };
    for(let i=0;i<260;i++) blob(R()*S,R()*S,6+R()*42,R()<.5?'218,200,176':'138,110,88',.1+R()*.18);
    for(let i=0;i<16;i++) blob(R()*S,R()*S,12+R()*36,'156,42,36',.3+R()*.25);       // vermelhidão
    for(let i=0;i<9;i++) blob(R()*S,R()*S,10+R()*26,'92,38,58',.25+R()*.2);         // hematomas
    const walk=(x,y,steps,len,style,width,branch)=>{
      let a=R()*Math.PI*2; g.strokeStyle=style; g.lineWidth=width; g.beginPath(); g.moveTo(x,y);
      for(let k=0;k<steps;k++){ a+=(R()-.5)*1.1; x+=Math.cos(a)*len*(.6+R()*.8); y+=Math.sin(a)*len*(.6+R()*.8); g.lineTo(x,y);
        if(branch&&R()<.25){ g.stroke(); walk(x,y,3+R()*4|0,len*.7,style,width*.6,false); g.strokeStyle=style; g.lineWidth=width; g.beginPath(); g.moveTo(x,y); } }
      g.stroke();
    };
    for(let i=0;i<30;i++) walk(R()*S,R()*S,10,9,`rgba(132,46,40,${.2+R()*.25})`,.8+R(),false);  // veias
    for(let i=0;i<55;i++) walk(R()*S,R()*S,6+R()*7|0,11,`rgba(38,24,16,${.55+R()*.4})`,.9+R()*1.6,true); // rachaduras
    const img=g.getImageData(0,0,S,S), d=img.data;
    for(let i=0;i<d.length;i+=4){ const n=(R()-.5)*16; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
    g.putImageData(img,0,0);
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
  }
}
// x/z da raiz de cada dedo (mão direita), largura e comprimento das 3 falanges (dedos longos e ossudos)
HandModel.FINGERS=[
  {x:-.0295,z:-.094,w:.015,len:[.036,.024,.019]},
  {x:-.0095,z:-.096,w:.016,len:[.04,.026,.02]},
  {x:.0105,z:-.094,w:.015,len:[.037,.024,.019]},
  {x:.0295,z:-.089,w:.013,len:[.029,.019,.016]}
];
// prefixo dos ossos do modelo 3D na mesma ordem de FINGERS (indicador → mindinho)
HandModel.RIG_FINGERS=['Index','Middle','Ring','Pinky'];
// rigidez relativa: o indicador fecha primeiro, o mindinho por último
HandModel.STIFF=Float32Array.from([1.2,1.2,1.2,1.2, 1,1,1,1, .88,.88,.88,.88, .76,.76,.76,.76, 1,1,1,1,1]);
// orientação da mão (base): palma para baixo; "aperto de mão" (polegar para cima)
HandModel.BASE_FLAT=[0,0,0];
(function definePoses(){
  // dedos: [abertura, falange 1, 2, 3] × 4  ·  polegar: [giro para fora, descida sob a palma, rolagem, falange 1, 2]
  const P=(f,t)=>Float32Array.from([...f.flat(),...t]);
  HandModel.POSES={
    relaxed:P([[.06,.25,.3,.2],[.02,.3,.35,.25],[-.02,.36,.4,.3],[-.06,.42,.45,.35]],[.5,.25,0,.15,.1]),
    open:   P([[.16,.02,.04,.02],[.04,0,.03,.02],[-.06,.02,.04,.02],[-.16,.05,.05,.03]],[.95,.05,0,0,0]),
    hook:   P([[.04,.85,1.2,.8],[.01,.9,1.25,.85],[-.02,.95,1.25,.85],[-.05,1.0,1.25,.85]],[.35,.55,0,.5,.4]),
    // punho: polegar cruza na frente dos dedos (cabo do martelo passa por dentro)
    fist:   P([[.02,1.4,1.6,1.1],[0,1.45,1.65,1.1],[-.02,1.5,1.65,1.1],[-.04,1.5,1.6,1.05]],[-.35,.45,0,.5,.4]),
    // pinça: pontas do indicador e do polegar se encontram em ≈ (-.028, -.055, -.095) no espaço de base
    pinch:  P([[.04,.8,1.0,.6],[-.02,1.3,1.5,1.0],[-.04,1.4,1.6,1.1],[-.06,1.45,1.6,1.1]],[-.1,.6,0,.1,.1]),
    press:  P([[.04,.9,.95,.5],[-.02,1.35,1.55,1.05],[-.04,1.45,1.65,1.1],[-.06,1.5,1.65,1.1]],[-.12,.55,0,.05,0]),
    bottle: P([[.03,.9,1.0,.7],[0,.95,1.05,.7],[-.02,1.0,1.05,.7],[-.04,1.05,1.05,.7]],[-.25,.45,0,.3,.2]),
    // apontar: indicador estendido, os outros fechados, polegar por cima (apertar botões do painel)
    point:  P([[.02,.04,.05,.03],[0,1.4,1.6,1.1],[-.02,1.45,1.65,1.1],[-.04,1.5,1.6,1.05]],[-.2,.5,0,.45,.35])
  };
})();
// ponta do indicador estendido (pose 'point') no espaço de base da mão
HandModel.indexTip=(side,out)=>{ const f=HandModel.FINGERS[0]; return out.set(f.x*side,0,f.z-f.len[0]-f.len[1]-f.len[2]); };
