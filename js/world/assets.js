'use strict';
// ============================================================================
// js/world/assets.js — texturas procedurais (canvas), materiais e geometrias compartilhadas
// ============================================================================
function concreteCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d');
  g.fillStyle='#5d5a54'; g.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++){ const v=70+Math.random()*40|0; g.fillStyle=`rgba(${v},${v-3},${v-8},${Math.random()*.35})`;
    g.fillRect(Math.random()*256,Math.random()*256,1+Math.random()*2,1+Math.random()*2); }
  for(let i=0;i<14;i++){ const x=Math.random()*256,y=Math.random()*120; const gr=g.createLinearGradient(0,y,0,256);
    gr.addColorStop(0,'rgba(60,30,12,.4)'); gr.addColorStop(1,'rgba(60,30,12,0)'); g.fillStyle=gr; g.fillRect(x,y,2+Math.random()*6,256); }
  g.strokeStyle='rgba(15,15,15,.55)'; g.lineWidth=3; g.strokeRect(1,1,254,254);
  return c;
}
function grateCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.clearRect(0,0,128,128); g.fillStyle='#55575a';
  for(let i=0;i<8;i++){ g.fillRect(i*16,0,4,128); g.fillRect(0,i*16,128,4); }
  for(let i=0;i<400;i++){ g.fillStyle=`rgba(90,50,25,${Math.random()*.6})`; const x=(Math.random()*8|0)*16+Math.random()*4, y=Math.random()*128; g.fillRect(x,y,2,2); }
  return c;
}

function scaleUV(geo,w,h,d){
  const uv=geo.attributes&&geo.attributes.uv; if(!uv) return geo;
  for(let f=0;f<6;f++){ const su=f<2?d/4.5:w/4.5, sv=f<2||f>3?h/4:d/4;
    for(let v=0;v<4;v++){ const i=f*4+v; uv.setXY(i,uv.getX(i)*su,uv.getY(i)*sv); } }
  uv.needsUpdate=true; return geo;
}
function canvasTex(w,h,draw){ const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); draw(g,w,h); const t=new THREE.CanvasTexture(c); t.userData={canvas:c,ctx:g}; return t; }
function drawSymbol(g,sym,cx,cy,r){
  g.beginPath();
  if(sym==='circle') g.arc(cx,cy,r,0,Math.PI*2);
  else if(sym==='triangle'){ g.moveTo(cx,cy-r); g.lineTo(cx+r*.95,cy+r*.75); g.lineTo(cx-r*.95,cy+r*.75); g.closePath(); }
  else g.rect(cx-r*.85,cy-r*.85,r*1.7,r*1.7);
  g.fill();
}
const TEX={}, MAT={}, GEO={};
(function initAssets(){
  const cc=concreteCanvas();
  TEX.wall=new THREE.CanvasTexture(cc); TEX.wall.wrapS=TEX.wall.wrapT=THREE.RepeatWrapping;
  TEX.grate=new THREE.CanvasTexture(grateCanvas()); TEX.grate.wrapS=TEX.grate.wrapT=THREE.RepeatWrapping; TEX.grate.repeat.set(4,4);
  MAT.concrete=new THREE.MeshStandardMaterial({map:TEX.wall,roughness:.95});
  // painel quebrável: mesma textura, tom levemente mais quente/claro
  MAT.concreteAlt=new THREE.MeshStandardMaterial({map:TEX.wall,roughness:.92,color:0xe9e2d6});
  MAT.crack=new THREE.MeshBasicMaterial({color:0x1a1814});
  MAT.bolt=new THREE.MeshStandardMaterial({color:0x6b5a44,roughness:.6,metalness:.6});
  MAT.grate=new THREE.MeshStandardMaterial({map:TEX.grate,alphaTest:.5,side:THREE.DoubleSide,metalness:.5,roughness:.6});
  MAT.rust=new THREE.MeshStandardMaterial({color:0x8a4a22,roughness:.7,metalness:.4});
  MAT.crumble=new THREE.MeshStandardMaterial({color:0x6a5c4c,roughness:1});
  MAT.metal=new THREE.MeshStandardMaterial({color:0x3c3f42,roughness:.55,metalness:.6});
  MAT.beam=new THREE.MeshStandardMaterial({color:0x4a3628,roughness:.6,metalness:.5});
  MAT.pipe=new THREE.MeshStandardMaterial({color:0x2f4038,roughness:.5,metalness:.6});
  MAT.weight=new THREE.MeshStandardMaterial({color:0x2a2622,roughness:.8,metalness:.3});
  MAT.paper=new THREE.MeshStandardMaterial({color:0xd8cfb8,roughness:1});
  MAT.pump=new THREE.MeshStandardMaterial({color:0x2e3a33,roughness:.5,metalness:.7});
  TEX.hazard=canvasTex(128,128,(g)=>{ g.fillStyle='#4a4d50'; g.fillRect(0,0,128,128);
    g.save(); g.beginPath(); g.rect(0,96,128,32); g.clip(); for(let i=-4;i<10;i++){ g.fillStyle=i%2?'#c9a227':'#151515'; g.beginPath(); g.moveTo(i*16,128); g.lineTo(i*16+16,128); g.lineTo(i*16+48,96); g.lineTo(i*16+32,96); g.fill(); } g.restore();
    g.fillStyle='rgba(0,0,0,.35)'; for(let y=8;y<92;y+=21) g.fillRect(6,y,116,2); });
  MAT.door=new THREE.MeshStandardMaterial({map:TEX.hazard,roughness:.5,metalness:.6});
  GEO.holdX=new THREE.BoxGeometry(.2,.12,.38); GEO.holdZ=new THREE.BoxGeometry(.38,.12,.2);
  GEO.lamp=new THREE.BoxGeometry(1.0,.08,.12);
  GEO.nailHit=new THREE.BoxGeometry(.14,.26,.14).translate(0,.13,0);
  GEO.pickHit=new THREE.BoxGeometry(.24,.18,.24);
  for(const k in GEO) GEO[k].userData.shared=true;
})();
