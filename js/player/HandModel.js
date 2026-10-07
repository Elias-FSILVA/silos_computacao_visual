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
// ============================================================================
class HandModel{
  constructor(side){
    this.side=side; const s=side, G=HandModel.geo();
    this.mat=new THREE.MeshStandardMaterial({color:0x2b2520,roughness:.9});
    this.root=new THREE.Group(); this.wrist=new THREE.Group(); this.base=new THREE.Group(); this.socket=new THREE.Group();
    this.root.add(this.wrist); this.wrist.add(this.base); this.base.add(this.socket);
    const box=(parent,w,h,d,mat,x,y,z)=>{ const m=new THREE.Mesh(G.box,mat); m.scale.set(w,h,d); m.position.set(x,y,z); parent.add(m); return m; };
    box(this.base,.085,.028,.09,this.mat,0,0,-.05);                       // palma (o pulso fica em z=0)
    box(this.base,.07,.012,.016,this.mat,0,.012,-.088);                     // nós dos dedos
    // dedos: índice 0 = indicador (lado do polegar)
    this.fingers=HandModel.FINGERS.map(f=>{
      const r=new THREE.Group(); r.position.set(f.x*s,0,f.z); this.base.add(r);
      const joints=[]; let parent=r;
      f.len.forEach((len,j)=>{ const jt=new THREE.Group(); if(j) jt.position.z=-f.len[j-1]; parent.add(jt);
        box(jt,f.w,f.w*1.05,len-.003,this.mat,0,0,-len/2); joints.push(jt); parent=jt; });
      return {root:r,joints};
    });
    // polegar: base na lateral da palma, voltada para dentro
    const tb=new THREE.Group(); tb.position.set(-.036*s,-.007,-.03); tb.rotation.order='YXZ'; this.base.add(tb);
    box(tb,.022,.02,.032,this.mat,0,0,-.016);
    const t1=new THREE.Group(); t1.position.z=-.032; tb.add(t1); box(t1,.019,.018,.024,this.mat,0,0,-.012);
    const t2=new THREE.Group(); t2.position.z=-.024; t1.add(t2); box(t2,.017,.016,.02,this.mat,0,0,-.01);
    this.thumb={base:tb,joints:[t1,t2]};
    // estado das molas: 4 dedos × [abertura, falange 1, 2, 3] + polegar [giro, descida, rolagem, falange 1, 2]
    this.x=new Float32Array(21); this.v=new Float32Array(21); this.tgt=new Float32Array(21); this.f=new Float32Array(21);
    this.squeeze=0; this.slack=0; this.tremor=0; this.time=Math.random()*10; this.wasContact=false;
    this.baseTgt=new THREE.Vector3();
    this.setPose('relaxed'); this.x.set(this.tgt); this._apply();
  }
  // pose-alvo; com b e t, mistura linear entre duas poses
  setPose(a,b=null,t=0){
    const A=HandModel.POSES[a]||HandModel.POSES.relaxed, B=b&&HandModel.POSES[b];
    for(let j=0;j<21;j++) this.tgt[j]=B?A[j]+(B[j]-A[j])*t:A[j];
  }
  setBase(r){ this.baseTgt.set(r[0],r[1],r[2]); }
  snapBase(){ this.base.rotation.set(this.baseTgt.x,this.baseTgt.y,this.baseTgt.z); }
  kick(a){ for(let i=0;i<4;i++){ this.v[i*4+2]+=a; this.v[i*4+3]+=a*.6; } }
  tint(r){ this.mat.emissive.setRGB(r,0,0); }
  update(dt){
    this.time+=dt;
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
    const x=this.x, s=this.side, tr=this.tremor, t=this.time;
    this.fingers.forEach((f,i)=>{
      const n=tr?(Math.sin(t*41+i*1.7)+Math.sin(t*27+i*2.9))*.5*tr:0;
      f.root.rotation.y=x[i*4]*s;
      f.joints.forEach((jt,j)=>{ jt.rotation.x=-(x[i*4+1+j]+n*(j?.6:1)); });
    });
    const tb=this.thumb.base, n=tr?Math.sin(t*33)*tr*.5:0;
    tb.rotation.set(-(x[17]+n),x[16]*s,x[18]*s);
    this.thumb.joints.forEach((jt,j)=>{ const c=x[19+j]; jt.rotation.set(-c*.45,-c*s*.85,0); });
  }
  static geo(){
    if(!HandModel._geo) HandModel._geo={box:new THREE.BoxGeometry(1,1,1)};
    return HandModel._geo;
  }
}
// x/z da raiz de cada dedo (mão direita), largura e comprimento das 3 falanges
HandModel.FINGERS=[
  {x:-.0295,z:-.094,w:.016,len:[.034,.022,.018]},
  {x:-.0095,z:-.096,w:.017,len:[.037,.024,.019]},
  {x:.0105,z:-.094,w:.016,len:[.034,.022,.018]},
  {x:.0295,z:-.089,w:.014,len:[.027,.017,.015]}
];
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
    bottle: P([[.03,.9,1.0,.7],[0,.95,1.05,.7],[-.02,1.0,1.05,.7],[-.04,1.05,1.05,.7]],[-.25,.45,0,.3,.2])
  };
})();
