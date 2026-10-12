// Jogador REAL (js/player/Player.js) rodando no Node, sobre o mundo de _load.js: física, colisão (Collision.js + trava do
// cilindro), vento, escalada, puxada e mantle são o código do jogo. Só o modelo da mão é trocado por um substituto e o
// raycast da câmera não existe: as mãos agarram direto (grab), como se o jogador tivesse mirado na agarra.
const L=require('./_load.js');
global.matchMedia=()=>({matches:false});
THREE.Raycaster=class{ set(){} setFromCamera(){} intersectObjects(){ return []; } };
L.vm.runInThisContext(`class HandModel{ constructor(side){ this.side=side; this.root=new THREE.Group(); this.socket=new THREE.Group(); this.wrist={rotation:{set(){}}}; }
  static indexTip(s,v){ return v.set(0,0,-.09); } kick(){} setPose(){} setBase(){} tint(){} update(){} }
  HandModel.BASE_FLAT=[0,0,0];`);
L.load('js/player/Player.js');
const makePlayer=(world=L.world)=>L.vm.runInThisContext('(s,c,w)=>new Player(s,c,w)')(L.scene,new L.Obj(),world);
// agarra uma malha (agarra, borda, prego) com a mão i, do jeito que Player._tryGrab faria depois do raycast
function grab(P,i,mesh,point,normal){
  const h=P.hands[i]; h.isGrabbing=true; h.inContact=true; h.surface=mesh; h.point.copy(point||mesh.position);
  h.normal.copy(normal||mesh.userData.wallNormal||new L.V3(0,1,0)); P._fitPull(); return h;
}
// anda/flutua: yaw tal que "frente" aponte para (dx,dz)
const face=(P,dx,dz)=>{ P.yaw=Math.atan2(-dx,-dz); };
const step=(P,n,input={x:0,y:0},dt=1/60,each)=>{ for(let i=0;i<n&&!P.dead;i++){ L.world.update(dt,P); P.update(dt,input); if(each) each(i); } };
module.exports={...L,makePlayer,grab,face,step};
