'use strict';
// ============================================================================
// js/items/itemDefs.js — definições, malhas 3D e ícones dos itens
// ============================================================================
const IMAT={
  wood:new THREE.MeshStandardMaterial({color:0x5a3b24,roughness:.8}),
  grip:new THREE.MeshStandardMaterial({color:0x1c1b1a,roughness:.9}),
  steel:new THREE.MeshStandardMaterial({color:0x8a8d90,roughness:.35,metalness:.85}),
  nail:new THREE.MeshStandardMaterial({color:0xb9b9b2,roughness:.3,metalness:.85}),
  bottle:new THREE.MeshStandardMaterial({color:0x7a4a20,roughness:.35}),
  cap:new THREE.MeshStandardMaterial({color:0xd8d2c4,roughness:.6}),
  card:new THREE.MeshStandardMaterial({color:0xcfc8b8,roughness:.7}),
  band:new THREE.MeshStandardMaterial({color:0x8a2a1a,roughness:.8}),
  hidden:new THREE.MeshBasicMaterial({visible:false})
};
function part(geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); return m; }
function makeHammer(){
  const g=new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(.016,.02,.34,8),IMAT.wood,0,.1,0));
  g.add(part(new THREE.CylinderGeometry(.022,.022,.1,8),IMAT.grip,0,-.03,0));
  g.add(part(new THREE.BoxGeometry(.045,.05,.15),IMAT.steel,0,.27,-.01));
  g.add(part(new THREE.BoxGeometry(.03,.028,.07),IMAT.steel,0,.29,.08,.55,0,0));
  return g;
}
function makeNail(){
  const g=new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(.011,.011,.26,6),IMAT.nail,0,0,0));
  g.add(part(new THREE.CylinderGeometry(.034,.034,.012,10),IMAT.nail,0,.135,0));
  g.add(part(new THREE.CylinderGeometry(.011,.001,.04,6),IMAT.nail,0,-.15,0));
  return g;
}
function makeNailBundle(){
  const g=new THREE.Group();
  for(let i=0;i<5;i++){ const n=makeNail(); n.position.set((i-2)*.022,0,(i%2)*.02); n.rotation.z=(i-2)*.05; g.add(n); }
  g.add(part(new THREE.TorusGeometry(.06,.01,6,14),IMAT.band,0,0,0,Math.PI/2,0,0));
  g.rotation.z=Math.PI/2; return g;
}
function makePills(){ const g=new THREE.Group(); g.add(part(new THREE.CylinderGeometry(.034,.034,.1,10),IMAT.bottle)); g.add(part(new THREE.CylinderGeometry(.036,.036,.03,10),IMAT.cap,0,.065,0)); return g; }
function makeCard(){ const g=new THREE.Group(); g.add(part(new THREE.BoxGeometry(.086,.054,.004),IMAT.card)); g.add(part(new THREE.BoxGeometry(.086,.012,.005),IMAT.band,0,.012,0)); return g; }

const ICONS={
  hammer:'<g transform="rotate(-35 16 16)"><rect x="14.3" y="10" width="3.4" height="19" rx="1.4"/><rect x="7" y="4" width="18" height="7" rx="1.5"/></g>',
  nails:'<g><rect x="9" y="7" width="2.6" height="17"/><rect x="6.3" y="5" width="8" height="2.6" rx="1"/><path d="M9 24h2.6l-1.3 4z"/></g><g transform="rotate(14 21 16)"><rect x="19.7" y="7" width="2.6" height="17"/><rect x="17" y="5" width="8" height="2.6" rx="1"/><path d="M19.7 24h2.6l-1.3 4z"/></g>',
  pills:'<g transform="rotate(-35 16 16)"><rect x="5" y="11.5" width="22" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="11.5" width="11" height="9" rx="4.5"/></g>',
  card:'<rect x="5" y="8" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="12" width="22" height="3"/><rect x="8" y="18" width="8" height="2"/>'
};
// held: posição do pulso direito (espaço da câmera) com o item em uso
// grip: pose da mão (HandModel.POSES); base: orientação da mão [x,y,z] — z=-π/2 é "aperto de mão", polegar para cima
// item: transformação do item dentro da mão (espaço de base do HandModel; a palma fica em z≈-.05, dedos para -z);
//       s = escala só da cópia na mão (o prego da parede é maior de propósito, para dar para agarrar)
const ITEM_DEFS={
  hammer:{name:'Martelo',stack:false,make:makeHammer,pickup:makeHammer,held:[.24,-.24,-.4],grip:'fist',base:[-.5,0,-Math.PI/2],item:{p:[-.025,-.03,-.078],r:[0,0,Math.PI/2]}},
  nails:{name:'Pregos',stack:true,make:makeNail,pickup:makeNailBundle,held:[.2,-.2,-.33],grip:'pinch',base:[0,0,-.55],item:{p:[-.028,-.055,-.13],r:[Math.PI/2,0,0],s:.5}},
  pills:{name:'Pílulas',stack:true,make:makePills,pickup:makePills,held:[.2,-.22,-.33],grip:'bottle',base:[0,0,-Math.PI/2],item:{p:[.004,-.034,-.072],r:[0,0,Math.PI/2],s:.75}},
  card:{name:'Cartão de acesso',stack:false,make:makeCard,pickup:makeCard,held:[.2,-.2,-.33],grip:'pinch',base:[0,0,-.55],item:{p:[-.028,-.058,-.13],r:[-Math.PI/2,0,0]}}
};
function itemLabel(id,count){ const d=ITEM_DEFS[id]; if(id==='nails') return count===1?'1 prego':`${count} pregos`; if(id==='pills') return count===1?'1 pílula':`${count} pílulas`; return d.name.toLowerCase(); }
