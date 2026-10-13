'use strict';
// ============================================================================
// js/world/assets.js — texturas, materiais e geometrias compartilhadas
// Superfícies dos ambientes (concreto, tijolo, pedra, pedra com musgo, madeira) vêm de js/world/textures.js e seguem a
// folha de referência de texturas do projeto. Materiais com userData.tile recebem UV DE MUNDO (worldUV): o desenho
// continua de uma caixa para a vizinha — por isso o painel rachado da sala secreta encaixa no concreto em volta.
// FINISH = acabamentos das paredes do poço (levelData.js → SHELL_FINISH). UVSCALE_MATS = materiais antigos com UV por caixa.
// ============================================================================
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
// UV DE MUNDO: u,v = coordenada do mundo ÷ tile (m) — o desenho continua entre caixas vizinhas e entre os trechos em que
// uma parede é partida (aberturas, fases). tile=[tu,tv,offU,offV]. Faces horizontais: fiadas/veios seguem o lado mais longo.
function worldUV(geo,cx,cy,cz,tile){
  const pos=geo.attributes&&geo.attributes.position, uv=geo.attributes&&geo.attributes.uv; if(!pos||!uv) return geo;
  const tu=tile[0], tv=tile[1]||tile[0], ou=tile[2]||0, ov=tile[3]||0, p=geo.parameters||{}, along=(p.depth||0)>(p.width||0);
  for(let i=0;i<pos.count;i++){ const f=i>>2, x=pos.getX(i)+cx, y=pos.getY(i)+cy, z=pos.getZ(i)+cz; let u,v;   // faces da caixa: +x −x +y −y +z −z
    if(f===0){ u=-z; v=y; } else if(f===1){ u=z; v=y; } else if(f===4){ u=x; v=y; } else if(f===5){ u=-x; v=y; } else if(along){ u=z; v=x; } else { u=x; v=-z; }
    uv.setXY(i,u/tu+ou,v/tv+ov); }
  uv.needsUpdate=true; return geo;
}
// variação de tom em grande escala (≈12 m e ≈3,5 m, coordenadas de mundo) — quebra a repetição dos tiles sem textura extra
// por superfície. A mesma função em todos os materiais → um único programa de shader (mesma chave de cache).
function macroHook(sh){
  sh.uniforms.macroMap={value:TEX.macro}; sh.uniforms.macroAmt={value:this.userData.macro||0};
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMacroP; varying vec3 vMacroN;')
    .replace('#include <project_vertex>','#include <project_vertex>\n  vMacroP=(modelMatrix*vec4(transformed,1.)).xyz; vMacroN=mat3(modelMatrix)*objectNormal;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D macroMap; uniform float macroAmt; varying vec3 vMacroP; varying vec3 vMacroN;')
    .replace('#include <map_fragment>',`#include <map_fragment>
  { vec3 an=abs(vMacroN); vec2 mp=an.y>max(an.x,an.z)?vMacroP.xz:(an.x>an.z?vMacroP.zy:vMacroP.xy);
    float mv=texture2D(macroMap,mp*.083).r*.65+texture2D(macroMap,mp*.29+vec2(.37,.11)).g*.35;
    diffuseColor.rgb*=1.+macroAmt*(mv-.5)*2.; }`);
}
// variante discreta de um acabamento (painéis quebráveis "disfarçados"): mesmo desenho e escala, tom um pouco mais quente
const ALT=new Map();
function altOf(mat){
  if(!mat||!mat.clone) return mat;
  if(!ALT.has(mat)){ const m=mat.clone(); m.color.multiply(new THREE.Color(0xe9e2d6)); m.onBeforeCompile=macroHook; ALT.set(mat,m); }
  return ALT.get(mat);
}
// filtragem anisotrópica: num poço vertical as paredes são vistas quase sempre em ângulo rasante — é a melhora mais barata
const TEXQ={aniso:1};
function surfTex(c){ const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=TEXQ.aniso; t.userData={aniso:true}; return t; }
function applyTextureQuality(renderer,quality){
  const max=renderer.capabilities&&renderer.capabilities.getMaxAnisotropy?renderer.capabilities.getMaxAnisotropy():1;
  TEXQ.aniso=Math.max(1,Math.min(max,{low:2,medium:4,high:8}[quality]||4));
  for(const k in TEX){ const t=TEX[k]; if(t&&t.userData&&t.userData.aniso&&t.anisotropy!==TEXQ.aniso){ t.anisotropy=TEXQ.aniso; t.needsUpdate=true; } }
}
// TIJOLO: a foto do projeto (assets/models/map/tijolo/_TEXTURES · Brick_Wall_017), levada para a paleta da referência,
// vale para as paredes e para as agarras. Enquanto ela carrega as paredes usam um tom liso; se não carregar (ex.: jogo aberto
// por duplo clique, file://, onde o navegador bloqueia a leitura dos pixels) entra o tijolo procedural.
// O .obj do tijolo não é usado: ~3,7 mil triângulos × ~900 agarras pesaria demais.
// troca a textura TEX[key] (e o normal map TEX[key+'N']) em todos os materiais que a usam
function swapTex(key,map,nmap){
  const oldM=TEX[key], oldN=TEX[key+'N'];
  for(const m of [...Object.values(MAT),...ALT.values()]){ if(m.map===oldM){ m.map=map; m.normalMap=nmap; m.needsUpdate=true; } }
  TEX[key]=map; TEX[key+'N']=nmap; [oldM,oldN].forEach(t=>t&&t.dispose&&t.dispose());
}
// texturas que não aparecem na abertura (madeira, pedra com musgo da Estufa): geradas logo depois do primeiro quadro,
// sem atrasar a carga do jogo; até lá os materiais usam um tom liso equivalente
function deferTex(fn){
  if(!TEXGEN.CAN||typeof window==='undefined'){ fn(); return; }
  (window.requestIdleCallback||(f=>setTimeout(f,120)))(()=>fn(),{timeout:1500});
}
const flatTex=rgb=>surfTex(TEXGEN.flat(8,rgb));
function brickFallback(){
  const br=TEXGEN.masonry(512,1618,{rows:8,bond:true,perRow:4,joint:.018,bevel:.014,rough:.004,toneJit:.32,hueJit:.06,stain:.2,dark:.12,base:[96,66,56],mortar:[60,58,54],lum:56,grain:22,edgeCells:56});
  swapTex('brick',surfTex(br.canvas),surfTex(TEXGEN.normalFrom(br.height,br.S,512,.010)));
}
function loadBrickPhoto(){
  if(!TEXGEN.CAN||typeof Image==='undefined'||typeof location==='undefined'||location.protocol==='file:'){ brickFallback(); return; }
  const dir='assets/models/map/tijolo/_TEXTURES/Brick_Wall_017_', ld=f=>new Promise((ok,no)=>{ const im=new Image(); im.onload=()=>ok(im); im.onerror=no; im.src=dir+f; });
  Promise.all([ld('basecolor.jpg'),ld('ambientOcclusion.jpg').catch(()=>null),ld('normal.jpg').catch(()=>null)]).then(([col,ao,nrm])=>{
    try{
      const map=surfTex(TEXGEN.gradeBrick(col,ao,512,{desat:.62,tint:[1,.9,.8],mortarDark:.45,soot:.26,lum:54}));
      let nmap; if(nrm){ const c=document.createElement('canvas'); c.width=c.height=512; c.getContext('2d').drawImage(nrm,0,0,512,512); nmap=surfTex(c); }
      else nmap=surfTex(TEXGEN.flat(8,[128,128,255]));
      swapTex('brick',map,nmap);
      TEX.hold.image=TEXGEN.holdBrick(col,false); TEX.hold.needsUpdate=true;
      TEX.holdWorn.image=TEXGEN.holdBrick(col,true); TEX.holdWorn.needsUpdate=true;
    }catch(e){ console.warn('Tijolo: foto indisponível, usando o tijolo procedural.',e&&e.message); brickFallback(); }
  }).catch(()=>brickFallback());
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
const TEX={}, MAT={}, GEO={}, FINISH={}, UVSCALE_MATS=new Set();
(function initAssets(){
  const rep=t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; };
  // ---------- superfícies dos ambientes (js/world/textures.js · folha de referência de texturas) ----------
  // tile em metros: concreto 3 m (painéis de fôrma de 1,5 m) · tijolo 1,4 m (8 fiadas de 17,5 cm) · pedra 3 m · madeira 1,6–4 m
  const N=(t,s)=>surfTex(TEXGEN.normalFrom(t.height,t.S,512,s));
  const surf=(map,nrm,o)=>{ const m=new THREE.MeshStandardMaterial({map,normalMap:nrm,color:o.color==null?0xffffff:o.color,roughness:o.rough||.95,metalness:0});
    if(m.normalScale&&m.normalScale.set) m.normalScale.set(o.ns||.85,o.ns||.85);
    m.userData.tile=o.tile; m.userData.macro=o.macro==null?.22:o.macro; if(o.nail) m.userData.nailable=true; m.onBeforeCompile=macroHook; return m; };
  TEX.macro=rep(new THREE.CanvasTexture(TEXGEN.macro(128)));
  // concreto moldado: cinza levemente quente, poros, fôrma, tirantes, escorridos (1024 px → nítido de perto)
  const conc=TEXGEN.concrete(1024,4141,{lum:96}), crk=TEXGEN.crackOver(conc,77);
  TEX.concrete=surfTex(conc.canvas); TEX.concreteN=N(conc,.010);
  TEX.cracked=surfTex(crk.canvas); TEX.crackedN=N(crk,.010);
  const CT=[3,3,.5,0];                         // offset .5: os painéis de 1,5 m do mundo caem nas juntas da textura
  MAT.concrete=surf(TEX.concrete,TEX.concreteN,{tile:CT,color:0xe6dfd4,nail:true,macro:.3});          // envelhecido (base do poço, dutos)
  MAT.concreteCold=surf(TEX.concrete,TEX.concreteN,{tile:CT,color:0xbcc1c6,nail:true});      // frio e mais escuro (fases do meio)
  MAT.concretePale=surf(TEX.concrete,TEX.concreteN,{tile:CT,color:0xf3efe8,nail:true});      // mais novo, perto da superfície
  MAT.concreteBand=surf(TEX.concrete,TEX.concreteN,{tile:CT,color:0x9a948b,rough:.9,nail:true});   // cinta de amarração entre fases
  // painel quebrável da sala secreta inicial (0 m): o MESMO concreto de MAT.concrete (cor, escala, relevo), só que trincado
  MAT.concreteCracked=surf(TEX.cracked,TEX.crackedN,{tile:CT,color:0xe6dfd4,macro:.3});
  MAT.concreteDark=surf(TEX.concrete,TEX.concreteN,{tile:CT,color:0x8d8a84});              // salão secreto
  // pedra aparelhada: blocos cinza de fiadas irregulares, juntas escuras, trincas finas na base de algumas pedras
  const st=TEXGEN.masonry(512,2718,{rows:5,minW:.2,maxW:.36,joint:.007,bevel:.010,rough:.004,edgeCells:16,toneJit:.26,hueJit:.05,stain:.3,dark:.08,base:[100,99,96],mortar:[50,48,44],lum:84,cracks:.14});
  TEX.stone=surfTex(st.canvas); TEX.stoneN=N(st,.007);
  MAT.stone=surf(TEX.stone,TEX.stoneN,{tile:[3,3],nail:true});
  MAT.stoneDark=surf(TEX.stone,TEX.stoneN,{tile:[3,3],color:0x8e9196,nail:true});        // labirinto
  // tijolo escuro: tom liso até a foto do projeto carregar (loadBrickPhoto; sem ela, brickFallback)
  TEX.brick=flatTex([70,52,45]); TEX.brickN=flatTex([128,128,255]);
  MAT.brick=surf(TEX.brick,TEX.brickN,{tile:[1.4,1.4],nail:true});
  MAT.brickSoot=surf(TEX.brick,TEX.brickN,{tile:[1.4,1.4],color:0xa49b94,nail:true});       // fuligem (casa das bombas, sala do rádio)
  // pedra irregular com musgo, raízes e terra nos vãos (Estufa)
  TEX.mossStone=flatTex([62,64,52]); TEX.mossStoneN=flatTex([128,128,255]);
  deferTex(()=>{ const cb=TEXGEN.cobble(512,3141,{n:5,gap:.06,base:[98,95,88],soil:[46,42,34],moss:[60,70,46],mossAmt:.5,lum:64,roots:6}); swapTex('mossStone',surfTex(cb.canvas),N(cb,.022)); });
  MAT.moss=surf(TEX.mossStone,TEX.mossStoneN,{tile:[3.2,3.2],rough:1,macro:.28});
  // madeira envelhecida: tábuas com veio, nós, emendas e pregos
  TEX.wood=flatTex([66,50,38]); TEX.woodN=flatTex([128,128,255]);
  deferTex(()=>{ const wd=TEXGEN.planks(512,7331,{n:10,base:[84,61,44],greyTo:[94,90,84],lum:64}); swapTex('wood',surfTex(wd.canvas),N(wd,.006)); });
  MAT.archive=surf(TEX.wood,TEX.woodN,{tile:[1.6,1.6],rough:.85});                           // móveis, estantes, beliches
  MAT.woodDeck=surf(TEX.wood,TEX.woodN,{tile:[2,2],color:0xc9bfb2,rough:.9});               // tablado dos descansos (andaime)
  MAT.beam=surf(TEX.wood,TEX.woodN,{tile:[3,4],color:0x9a8a7c,rough:.85,macro:.12});        // vigas de madeira que cruzam o poço
  // agarras: tijolos salientes (firmes = tijolo inteiro; gastos = claros, trincados e com a quina lascada → esfarelam)
  TEX.hold=new THREE.CanvasTexture(TEXGEN.holdBrick(null,false)); TEX.holdWorn=new THREE.CanvasTexture(TEXGEN.holdBrick(null,true));
  MAT.holdBrick=new THREE.MeshStandardMaterial({map:TEX.hold,roughness:.78});
  MAT.crumble=new THREE.MeshStandardMaterial({map:TEX.holdWorn,roughness:1});
  Object.assign(FINISH,{concrete:MAT.concrete,concreteCold:MAT.concreteCold,concretePale:MAT.concretePale,brick:MAT.brick,brickSoot:MAT.brickSoot,stone:MAT.stone,stoneDark:MAT.stoneDark});
  // ---------- metal, chapas e demais ----------
  TEX.liner=rep(new THREE.CanvasTexture(linerCanvas()));
  TEX.grate=new THREE.CanvasTexture(grateCanvas()); TEX.grate.wrapS=TEX.grate.wrapT=THREE.RepeatWrapping; TEX.grate.repeat.set(4,4);
  // chapa de contenção (trechos de poço selados): não aceita prego, sem agarras
  MAT.liner=new THREE.MeshStandardMaterial({map:TEX.liner,roughness:.5,metalness:.65});
  UVSCALE_MATS.add(MAT.liner);
  TEX.foundry=rep(new THREE.CanvasTexture(foundryCanvas())); TEX.paper=rep(new THREE.CanvasTexture(paperCanvas()));
  TEX.glass=rep(new THREE.CanvasTexture(glassCanvas()));
  MAT.foundry=new THREE.MeshStandardMaterial({map:TEX.foundry,roughness:.75,metalness:.5});
  MAT.paperWall=new THREE.MeshStandardMaterial({map:TEX.paper,roughness:1});
  MAT.glass=new THREE.MeshStandardMaterial({map:TEX.glass,transparent:true,opacity:.45,roughness:.15,metalness:.2,side:THREE.DoubleSide,depthWrite:false});
  MAT.vine=new THREE.MeshStandardMaterial({color:0x2c5a2a,roughness:1});
  MAT.glowGreen=new THREE.MeshBasicMaterial({color:0x7be88f}); MAT.glowAmber=new THREE.MeshBasicMaterial({color:0xffb04a}); MAT.glowBlue=new THREE.MeshBasicMaterial({color:0x7fb8ff});
  MAT.darkLamp=new THREE.MeshBasicMaterial({color:0x1a1612});
  MAT.socket=new THREE.MeshBasicMaterial({color:0xd9962a});   // anel do soquete de prego (visível no escuro)
  MAT.socketUsed=new THREE.MeshBasicMaterial({color:0x55c46a});
  [MAT.foundry,MAT.paperWall].forEach(m=>UVSCALE_MATS.add(m));
  MAT.crack=new THREE.MeshBasicMaterial({color:0x1a1814});
  // rachadura profunda (Climbs.js): o fundo da fenda quase preto e as bordas lascadas, mais claras, que pegam a luz
  MAT.crackDeep=new THREE.MeshBasicMaterial({color:0x0b0a09,side:THREE.DoubleSide});
  MAT.crackLip=new THREE.MeshStandardMaterial({color:0x4a4640,roughness:1,side:THREE.DoubleSide});
  MAT.bolt=new THREE.MeshStandardMaterial({color:0x6b5a44,roughness:.6,metalness:.6});
  MAT.grate=new THREE.MeshStandardMaterial({map:TEX.grate,alphaTest:.5,side:THREE.DoubleSide,metalness:.5,roughness:.6});
  MAT.rust=new THREE.MeshStandardMaterial({color:0x8a4a22,roughness:.7,metalness:.4});
  MAT.metal=new THREE.MeshStandardMaterial({color:0x3c3f42,roughness:.55,metalness:.6});
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
  loadBrickPhoto();
})();
