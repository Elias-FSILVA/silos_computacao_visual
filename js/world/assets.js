'use strict';
// ============================================================================
// js/world/assets.js — texturas procedurais (canvas), materiais e geometrias compartilhadas
// Novidades: concreteCrackedCanvas() + MAT.concreteCracked (painel quebrável da sala secreta, 0 m),
//            linerCanvas() + MAT.liner (chapas de contenção que selam o poço nos trechos dos puzzles),
//            MAT.concreteDark (paredes do labirinto), UVSCALE_MATS (materiais cujo UV acompanha o tamanho da caixa)
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
// concreto rachado: mesmo tom do concreto do poço, mas com rachaduras ramificadas, placas de reboco soltas
// e ferrugem escorrida — a pista visual de que aquela parede não é maciça. Usa RNG fixo (aparência estável).
function concreteCrackedCanvas(){
  const S=512, c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'), R=mulberry(4141);
  g.fillStyle='#5f5b54'; g.fillRect(0,0,S,S);
  for(let i=0;i<26000;i++){ const v=70+R()*44|0; g.fillStyle=`rgba(${v},${v-3},${v-9},${R()*.35})`; g.fillRect(R()*S,R()*S,1+R()*2.2,1+R()*2.2); }
  for(let i=0;i<12;i++){ const x=R()*S,y=R()*S*.55, gr=g.createLinearGradient(0,y,0,S);
    gr.addColorStop(0,'rgba(72,40,16,.42)'); gr.addColorStop(1,'rgba(72,40,16,0)'); g.fillStyle=gr; g.fillRect(x,y,3+R()*10,S); }
  // placas de reboco soltas (tom mais claro, borda escura)
  for(let i=0;i<8;i++){
    const cx=R()*S, cy=R()*S, r=22+R()*38; g.beginPath();
    for(let k=0;k<7;k++){ const a=k/7*Math.PI*2, rr=r*(.6+R()*.5); const px=cx+Math.cos(a)*rr, py=cy+Math.sin(a)*rr; k?g.lineTo(px,py):g.moveTo(px,py); }
    g.closePath(); g.fillStyle='rgba(122,116,104,.28)'; g.fill(); g.strokeStyle='rgba(12,11,10,.5)'; g.lineWidth=1.6; g.stroke();
  }
  // rachaduras ramificadas: traço escuro + realce claro deslocado (dá relevo)
  const crack=(x,y,ang,len,w,depth)=>{
    let px=x,py=y; const n=Math.max(4,len/9|0); g.lineCap='round';
    for(let i=0;i<n;i++){
      const a=ang+(R()-.5)*.95, l=len/n, nx=px+Math.cos(a)*l, ny=py+Math.sin(a)*l;
      g.strokeStyle='rgba(8,7,6,.94)'; g.lineWidth=w; g.beginPath(); g.moveTo(px,py); g.lineTo(nx,ny); g.stroke();
      g.strokeStyle='rgba(160,152,138,.3)'; g.lineWidth=Math.max(.6,w*.38); g.beginPath(); g.moveTo(px+1.6,py+1.6); g.lineTo(nx+1.6,ny+1.6); g.stroke();
      if(depth>0&&R()<.38) crack(px,py,a+(R()<.5?-1:1)*(.5+R()*.8),len*.42,w*.66,depth-1);
      px=nx; py=ny; ang=a;
    }
  };
  crack(S*.06,S*.10,.62,S*.95,4.6,3); crack(S*.94,S*.04,2.35,S*.85,3.8,3);
  crack(S*.50,S*.58,1.35,S*.55,3.2,2); crack(S*.15,S*.92,-.55,S*.6,3.0,2);
  g.strokeStyle='rgba(15,15,15,.55)'; g.lineWidth=3; g.strokeRect(1,1,S-2,S-2);
  return c;
}
// chapa de contenção: placas de aço escuro com rebites e escorridos de ferrugem
function linerCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d'), R=mulberry(9001);
  g.fillStyle='#34373a'; g.fillRect(0,0,256,256);
  for(let i=0;i<7000;i++){ const v=44+R()*30|0; g.fillStyle=`rgba(${v},${v+2},${v+5},${R()*.4})`; g.fillRect(R()*256,R()*256,1+R()*2,1+R()*2); }
  g.strokeStyle='rgba(8,9,10,.85)'; g.lineWidth=4; g.strokeRect(2,2,252,252); g.beginPath(); g.moveTo(128,0); g.lineTo(128,256); g.moveTo(0,128); g.lineTo(256,128); g.stroke();
  for(const [x,y] of [[14,14],[114,14],[142,14],[242,14],[14,114],[114,114],[142,114],[242,114],[14,142],[114,142],[142,142],[242,142],[14,242],[114,242],[142,242],[242,242]]){
    g.fillStyle='rgba(90,92,94,.9)'; g.beginPath(); g.arc(x,y,4.2,0,Math.PI*2); g.fill(); g.fillStyle='rgba(20,20,20,.7)'; g.beginPath(); g.arc(x+1,y+1,2,0,Math.PI*2); g.fill(); }
  for(let i=0;i<10;i++){ const x=R()*256,y=R()*100, gr=g.createLinearGradient(0,y,0,256); gr.addColorStop(0,'rgba(110,52,22,.5)'); gr.addColorStop(1,'rgba(110,52,22,0)'); g.fillStyle=gr; g.fillRect(x,y,2+R()*5,256); }
  g.fillStyle='#c9a227'; g.globalAlpha=.55; g.fillRect(0,122,256,12); g.globalAlpha=1;
  g.fillStyle='#151515'; for(let i=-2;i<18;i++){ g.beginPath(); g.moveTo(i*16,134); g.lineTo(i*16+8,134); g.lineTo(i*16+16,122); g.lineTo(i*16+8,122); g.fill(); }
  return c;
}
function grateCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.clearRect(0,0,128,128); g.fillStyle='#55575a';
  for(let i=0;i<8;i++){ g.fillRect(i*16,0,4,128); g.fillRect(0,i*16,128,4); }
  for(let i=0;i<400;i++){ g.fillStyle=`rgba(90,50,25,${Math.random()*.6})`; const x=(Math.random()*8|0)*16+Math.random()*4, y=Math.random()*128; g.fillRect(x,y,2,2); }
  return c;
}


// ---------- identidade visual dos destinos ----------
// Casa das Bombas: chapa de aço queimado, rebites, listras de aviso e óleo
function foundryCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d'), R=mulberry(311);
  g.fillStyle='#3b2a22'; g.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++){ const v=36+R()*40|0; g.fillStyle=`rgba(${v+14},${v},${v-8},${R()*.45})`; g.fillRect(R()*256,R()*256,1+R()*2.4,1+R()*2.4); }
  g.strokeStyle='rgba(10,6,4,.9)'; g.lineWidth=4; g.strokeRect(2,2,252,252); g.beginPath(); g.moveTo(0,128); g.lineTo(256,128); g.moveTo(128,0); g.lineTo(128,256); g.stroke();
  for(const [x,y] of [[16,16],[112,16],[144,16],[240,16],[16,240],[112,240],[144,240],[240,240]]){ g.fillStyle='#8a5a38'; g.beginPath(); g.arc(x,y,4,0,Math.PI*2); g.fill(); }
  for(let i=0;i<14;i++){ const x=R()*256, gr=g.createLinearGradient(0,0,0,256); gr.addColorStop(0,'rgba(140,60,18,.55)'); gr.addColorStop(1,'rgba(140,60,18,0)'); g.fillStyle=gr; g.fillRect(x,R()*60,2+R()*6,256); }
  g.fillStyle='rgba(0,0,0,.35)'; for(let i=0;i<5;i++){ g.beginPath(); g.ellipse(R()*256,R()*256,10+R()*26,5+R()*10,0,0,Math.PI*2); g.fill(); }
  return c;
}
// Estufa: pedra coberta de musgo, raízes e manchas de umidade
function mossCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d'), R=mulberry(522);
  g.fillStyle='#2f3a2c'; g.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++){ const v=40+R()*50|0; g.fillStyle=`rgba(${v-12},${v+16},${v-18},${R()*.5})`; g.fillRect(R()*256,R()*256,1+R()*3,1+R()*3); }
  for(let i=0;i<7;i++){ g.strokeStyle='rgba(38,24,14,.85)'; g.lineWidth=2+R()*3; g.beginPath(); let x=R()*256,y=0; g.moveTo(x,y); for(let k=0;k<8;k++){ x+=(R()-.5)*34; y+=32; g.lineTo(x,y); } g.stroke(); }
  for(let i=0;i<12;i++){ g.fillStyle=`rgba(120,200,110,${.08+R()*.14})`; g.beginPath(); g.ellipse(R()*256,R()*256,14+R()*30,8+R()*16,0,0,Math.PI*2); g.fill(); }
  g.strokeStyle='rgba(10,16,8,.7)'; g.lineWidth=3; g.strokeRect(1,1,254,254);
  return c;
}
// Arquivo: madeira escura de estante e papel envelhecido
function archiveCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d'), R=mulberry(733);
  g.fillStyle='#4a3626'; g.fillRect(0,0,256,256);
  for(let i=0;i<180;i++){ const y=R()*256; g.strokeStyle=`rgba(${30+R()*30|0},${20+R()*20|0},12,${.15+R()*.3})`; g.lineWidth=1+R()*2; g.beginPath(); g.moveTo(0,y); g.bezierCurveTo(80,y+R()*6-3,170,y+R()*6-3,256,y); g.stroke(); }
  g.strokeStyle='rgba(12,8,4,.8)'; g.lineWidth=3; g.strokeRect(1,1,254,254);
  return c;
}
function paperCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d'), R=mulberry(844);
  g.fillStyle='#b9a98b'; g.fillRect(0,0,256,256);
  for(let i=0;i<7000;i++){ const v=150+R()*50|0; g.fillStyle=`rgba(${v},${v-14},${v-44},${R()*.4})`; g.fillRect(R()*256,R()*256,1+R()*2,1+R()*2); }
  for(let i=0;i<8;i++){ g.fillStyle=`rgba(90,60,30,${.05+R()*.1})`; g.beginPath(); g.arc(R()*256,R()*256,10+R()*30,0,Math.PI*2); g.fill(); }
  return c;
}
// pictograma de fase da planta (0 semente · 1 broto · 2 flor · 3 murcha) para as placas das estações
function drawPlantStage(g,stage,cx,cy,sc){
  g.save(); g.translate(cx,cy); g.scale(sc,sc); g.lineCap='round'; g.strokeStyle='#8fd87a'; g.fillStyle='#8fd87a'; g.lineWidth=5;
  g.fillStyle='#5b4330'; g.beginPath(); g.ellipse(0,26,34,9,0,0,Math.PI*2); g.fill(); g.fillStyle='#8fd87a';
  if(stage===0){ g.fillStyle='#d9b26a'; g.beginPath(); g.ellipse(0,18,8,5,0,0,Math.PI*2); g.fill(); }
  else if(stage===1){ g.beginPath(); g.moveTo(0,22); g.lineTo(0,-4); g.stroke(); g.beginPath(); g.ellipse(-9,-6,10,5,-.6,0,Math.PI*2); g.fill(); g.beginPath(); g.ellipse(9,-6,10,5,.6,0,Math.PI*2); g.fill(); }
  else if(stage===2){ g.beginPath(); g.moveTo(0,22); g.lineTo(0,-14); g.stroke(); g.fillStyle='#f0d25a'; for(let i=0;i<6;i++){ const a=i*Math.PI/3; g.beginPath(); g.ellipse(Math.cos(a)*10,-20+Math.sin(a)*10,8,5,a,0,Math.PI*2); g.fill(); } g.fillStyle='#8a4a22'; g.beginPath(); g.arc(0,-20,5,0,Math.PI*2); g.fill(); }
  else { g.strokeStyle='#8a7a4a'; g.beginPath(); g.moveTo(0,22); g.quadraticCurveTo(2,-6,18,-8); g.stroke(); g.fillStyle='#8a7a4a'; g.beginPath(); g.ellipse(20,-4,9,4,.9,0,Math.PI*2); g.fill(); }
  g.restore();
}
function glassCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.fillStyle='rgba(120,190,160,.18)'; g.fillRect(0,0,128,128); g.strokeStyle='rgba(30,60,48,.9)'; g.lineWidth=4; g.strokeRect(2,2,124,124); g.beginPath(); g.moveTo(64,0); g.lineTo(64,128); g.moveTo(0,64); g.lineTo(128,64); g.stroke();
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
  else if(sym==='diamond'){ g.moveTo(cx,cy-r*1.05); g.lineTo(cx+r*.8,cy); g.lineTo(cx,cy+r*1.05); g.lineTo(cx-r*.8,cy); g.closePath(); }
  else if(sym==='cross'){ const a=r*.32; g.rect(cx-a,cy-r,a*2,r*2); g.rect(cx-r,cy-a,r*2,a*2); }
  else if(sym==='star'){ for(let i=0;i<10;i++){ const rr=i%2?r*.45:r*1.05, an=-Math.PI/2+i*Math.PI/5; const px=cx+Math.cos(an)*rr, py=cy+Math.sin(an)*rr; i?g.lineTo(px,py):g.moveTo(px,py); } g.closePath(); }
  else g.rect(cx-r*.85,cy-r*.85,r*1.7,r*1.7);
  g.fill();
}
const TEX={}, MAT={}, GEO={}, UVSCALE_MATS=new Set();
(function initAssets(){
  const rep=t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; };
  TEX.wall=rep(new THREE.CanvasTexture(concreteCanvas()));
  TEX.wallCracked=rep(new THREE.CanvasTexture(concreteCrackedCanvas()));
  TEX.liner=rep(new THREE.CanvasTexture(linerCanvas()));
  TEX.grate=new THREE.CanvasTexture(grateCanvas()); TEX.grate.wrapS=TEX.grate.wrapT=THREE.RepeatWrapping; TEX.grate.repeat.set(4,4);
  MAT.concrete=new THREE.MeshStandardMaterial({map:TEX.wall,roughness:.95});
  // painel quebrável (segredos 1 e 2): mesma textura, tom levemente mais quente/claro
  MAT.concreteAlt=new THREE.MeshStandardMaterial({map:TEX.wall,roughness:.92,color:0xe9e2d6});
  // painel quebrável da sala secreta inicial (0 m): concreto RACHADO — a pista é a própria textura
  MAT.concreteCracked=new THREE.MeshStandardMaterial({map:TEX.wallCracked,roughness:.97});
  // paredes do labirinto: o mesmo concreto, mais escuro e frio
  MAT.concreteDark=new THREE.MeshStandardMaterial({map:TEX.wall,roughness:.97,color:0x8d8a84});
  // chapa de contenção (trechos de poço selados): não aceita prego, sem agarras
  MAT.liner=new THREE.MeshStandardMaterial({map:TEX.liner,roughness:.5,metalness:.65});
  [MAT.concrete,MAT.concreteAlt,MAT.concreteCracked,MAT.concreteDark,MAT.liner].forEach(m=>UVSCALE_MATS.add(m));
  TEX.foundry=rep(new THREE.CanvasTexture(foundryCanvas())); TEX.moss=rep(new THREE.CanvasTexture(mossCanvas()));
  TEX.archive=rep(new THREE.CanvasTexture(archiveCanvas())); TEX.paper=rep(new THREE.CanvasTexture(paperCanvas()));
  TEX.glass=rep(new THREE.CanvasTexture(glassCanvas()));
  MAT.foundry=new THREE.MeshStandardMaterial({map:TEX.foundry,roughness:.75,metalness:.5});
  MAT.moss=new THREE.MeshStandardMaterial({map:TEX.moss,roughness:1});
  MAT.archive=new THREE.MeshStandardMaterial({map:TEX.archive,roughness:.9});
  MAT.paperWall=new THREE.MeshStandardMaterial({map:TEX.paper,roughness:1});
  MAT.glass=new THREE.MeshStandardMaterial({map:TEX.glass,transparent:true,opacity:.45,roughness:.15,metalness:.2,side:THREE.DoubleSide,depthWrite:false});
  MAT.vine=new THREE.MeshStandardMaterial({color:0x2c5a2a,roughness:1});
  MAT.glowGreen=new THREE.MeshBasicMaterial({color:0x7be88f}); MAT.glowAmber=new THREE.MeshBasicMaterial({color:0xffb04a}); MAT.glowBlue=new THREE.MeshBasicMaterial({color:0x7fb8ff});
  MAT.darkLamp=new THREE.MeshBasicMaterial({color:0x1a1612});
  MAT.socket=new THREE.MeshBasicMaterial({color:0xd9962a});   // anel do soquete de prego (visível no escuro)
  MAT.socketUsed=new THREE.MeshBasicMaterial({color:0x55c46a});
  [MAT.foundry,MAT.moss,MAT.archive,MAT.paperWall].forEach(m=>UVSCALE_MATS.add(m));
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
