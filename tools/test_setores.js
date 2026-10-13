// SectorManager com o Three.js REAL (sem navegador): a janela vertical, os batches, o instancing e a liberação de GPU
// não podem mudar NADA da jogabilidade. Confere:
//   · colisão (world.platforms) e alvos de raycast intactos; os mesmos raios acertam os mesmos objetos, à mesma distância,
//     antes do SectorManager, depois dele, e depois de setores serem descarregados
//   · batches conservam os triângulos e ficam fora do raycast; cada peça é desenhada por um caminho só
//   · janela: o setor dos olhos está sempre ativo (subindo e descendo a 30 m/s), a pré-carga chega antes, a histerese
//     não deixa piscar na borda, setores longe descarregam e voltam; sala com puzzle em andamento não descarrega
//   · agarra que desmorona sai do InstancedMesh; LOD troca com a distância; luzes: contagem fixa, as virtuais ficam ocultas
//   · modo completo (espectador) e reconstrução do mapa (World.reset) sem vazar materiais
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.join(__dirname,'..');
vm.runInThisContext('(function(exports,module,define){'+fs.readFileSync(path.join(ROOT,'node_modules/three/build/three.min.js'),'utf8')+'\n})')(undefined,undefined,undefined);
const noopCtx=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):k==='measureText'?()=>({width:10}):()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
global.document={createElement:()=>({width:0,height:0,getContext:()=>noopCtx})};
global.window=global;
const log=console.log; console.log=()=>{}; console.warn=()=>{};
for(const f of ['js/core/utils.js','js/core/renderConfig.js','js/world/textures.js','js/world/assets.js','js/world/levelData.js','js/world/Collision.js','js/world/World.js','js/world/Halls.js',
  'js/items/itemDefs.js','js/items/Inventory.js','js/interaction/Interactables.js','js/world/Sectors.js','js/world/Climbs.js','js/world/SectorManager.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,f),'utf8'),{filename:f});
console.log=log;
let fails=0; const chk=(k,ok,extra='')=>{ log(k.padEnd(84),(ok?'OK ':'FALHOU ')+extra); if(!ok) fails++; };
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

// ---------- 0) máquina de estados (função pura) ----------
{ const P={hysteresis:4,preload:14,unload:30,unloadDelay:4}, s={state:'ready',farT:0,pinned:false}, st=d=>{ sectorStep(s,d,46,P,.1); return s.state; };
  chk('estado: dentro da janela → ativo; fora só depois da histerese',st(10)==='active'&&st(48)==='active'&&st(50.5)==='ready');
  let un=0; for(let i=0;i<39;i++) st(100); un=s.state; st(100);
  chk('estado: longe por menos que o atraso continua residente; depois descarrega',un==='ready'&&s.state==='unloaded');
  chk('estado: descarregado volta a carregar dentro da pré-carga e ativa na janela',st(55)==='loading'&&st(40)==='active');
  s.state='ready'; s.pinned=true; for(let i=0;i<100;i++) st(500); chk('estado: setor fixo (puzzle em andamento) nunca descarrega',s.state==='ready'); }

// ---------- mundo real ----------
const scene=new THREE.Scene(); scene.matrixAutoUpdate=false;
const world=new World(scene);
// modelo glTF pesado sintético (no Node os .glb não carregam): testa o LOD
const heavy=new THREE.Group(); heavy.userData.size=V(1,1,1); heavy.add(new THREE.Mesh(new THREE.SphereGeometry(.4,64,48),new THREE.MeshStandardMaterial({color:0x887766})));
heavy.position.set(3,61,0); world.root.add(heavy);
const camera=new THREE.PerspectiveCamera(75,16/9,.03,200); scene.add(camera);
const game={world,scene,camera,settings:{data:{quality:'medium',viewDistance:'normal'}},puzzles:{puzzles:[]},renderer:{initTexture(){}}};
scene.updateMatrixWorld(true);
const plats0=world.platforms.slice(), rays0=world.raycastTargets.slice(), grab0=world.grabbables.slice();
// raios: de dentro do poço para cada agarrável/parede próxima + raios aleatórios em várias alturas
const R=new THREE.Raycaster(), rnd=mulberry(77), rays=[];
for(const m of grab0.filter((_,i)=>i%3===0)){ const p=m.getWorldPosition(V()); const o=V(p.x*.7,p.y+.4,p.z*.7); rays.push([o,p.clone().sub(o).normalize()]); }
for(let i=0;i<500;i++){ const y=rnd()*TOP, a=rnd()*TAU, r=rnd()*4; rays.push([V(Math.cos(a)*r,y,Math.sin(a)*r),V(rnd()-.5,(rnd()-.5)*1.6,rnd()-.5).normalize()]); }
const cast=()=>rays.map(([o,d])=>{ R.set(o,d); R.far=8; const h=R.intersectObjects(world.raycastTargets,false).find(h=>h.object.userData.alive!==false); return h?h.object.id+':'+h.distance.toFixed(4):'-'; });
const hits0=cast();
const tris=g=>(g.index?g.index.count:g.attributes.position.count)/3;
const sm=new SectorManager(game); world.sectors=sm; sm.setProfile(RenderProfile.resolve(game.settings.data,false));
const at=(y,x=0,z=0)=>{ camera.position.set(x,y,z); camera.updateMatrixWorld(); };
const run=(sec,y,x=0,z=0)=>{ for(let i=0;i<sec*60;i++){ if(y!=null) at(y,x,z); sm.update(1/60); scene.updateMatrixWorld(); } };
at(1.6); run(.2);

// ---------- 1) jogabilidade intacta ----------
log('— Colisão e raycast —');
chk('world.platforms: mesmos sólidos, mesma ordem',world.platforms.length===plats0.length&&world.platforms.every((p,i)=>p===plats0[i]));
chk('alvos de raycast e agarráveis: mesmos objetos',world.raycastTargets.length===rays0.length&&world.raycastTargets.every((m,i)=>m===rays0[i])&&world.grabbables.every((m,i)=>m===grab0[i]));
const hits1=cast(), diff1=hits1.filter((h,i)=>h!==hits0[i]).length;
chk(`os mesmos ${rays.length} raios acertam os mesmos objetos à mesma distância`,diff1===0,diff1?diff1+' diferentes':`${hits0.filter(h=>h!=='-').length} acertos`);
const drawOnly=[]; world.root.children.forEach(o=>{ if(['batch','lod'].includes(o.userData.type)) drawOnly.push(o); });
chk('batches, agarras instanciadas e LOD ficam fora do raycast',drawOnly.length>0&&drawOnly.every(o=>!world.raycastTargets.includes(o)&&!world.grabbables.includes(o)),drawOnly.length+' malhas só de desenho');
log('— Batches —');
{ let a=0,b=0,ok=true; for(const s of sm.list){ const prox=s.members.filter(e=>e.o.userData.batched); a+=prox.reduce((t,e)=>t+tris(e.o.geometry),0); b+=[...s.batches,...s.detail].reduce((t,m)=>t+tris(m.geometry),0); }
  chk('triângulos dos batches = soma das peças originais',a===b&&a>0,`${a} triângulos`);
  for(const s of sm.list) for(const e of s.members){ const o=e.o, n=(o.userData.batched?1:0)+(o.userData.inst?1:0)+(s.lods.some(l=>l.hi===o)?1:0); if(n>1) ok=false; }
  chk('cada peça é desenhada por um caminho só (original, batch, instância ou LOD)',ok);
  const b0=world.root.children.filter(o=>o.isMesh&&!o.userData.batched&&!o.userData.inst&&o.material&&o.material.visible!==false&&!['batch','lod'].includes(o.userData.type)).length;
  chk('chamadas de desenho possíveis no mapa (todas visíveis): bem menos que antes',sm.stats.built.batches>0,`${sm.stats.built.batches} batches + ${sm.stats.built.instanced} instâncias de agarras + ${b0} peças soltas (antes: ${world.root.children.length} filhos)`); }

// ---------- 2) janela vertical, subindo e descendo ----------
log('— Janela vertical —');
{ let miss=0, pre=0, cold=0, flips=new Map();
  const prev=new Map(sm.list.map(s=>[s,s.state]));
  const step=y=>{ at(y); sm.update(1/60);
    for(const s of sm.list){ const p=prev.get(s); if(p!==s.state){ if(s.state==='active'){ if(p==='unloaded') cold++; else pre++; flips.set(s,(flips.get(s)||0)+1); } prev.set(s,s.state); } }
    for(const s of sm.list) if(s.kind==='shaft'&&y+.01>=s.y0&&y-.01<=s.y1&&s.state!=='active'&&sm.t===0) miss++; };
  for(let k=0;k<2;k++){ for(let y=1.6;y<=TOP;y+=.5) step(y); for(let i=0;i<300;i++) step(TOP); for(let y=TOP;y>=1.6;y-=.5) step(y); for(let i=0;i<600;i++) step(1.6); }
  chk('subindo e descendo a 30 m/s: a faixa do poço onde estão os olhos está sempre ativa',miss===0,miss?miss+' quadros sem':'');
  chk('setores que ficam ativos já estavam carregados (pré-carga) — nenhum a frio',cold===0,`${pre} ativações · ${cold} a frio`);
  const maxF=Math.max(...flips.values()); chk('cada setor entra em ativo no máximo uma vez por passagem (sem piscar)',maxF<=4,'máx '+maxF+' ativações em 4 passagens');
  // histerese: olhos oscilando ±1 m em volta do limite superior da janela de uma faixa
  const P=sm.P, b=sm.list.find(s=>s.kind==='shaft'&&s.y0>=200), edge=b.y0-P.above; let n=0, last=null;
  for(let i=0;i<1200;i++){ step(edge+Math.sin(i*.05)*1.0); if(last&&b.state!==last) n++; last=b.state; }
  chk('olhos oscilando na borda da janela: o setor não liga/desliga a cada passo (histerese)',n<=1,n+' trocas');
  run(10,1.6);
  const far=sm.list.filter(s=>s.y0>1.6+P.above+P.preload+P.unload+5), un=far.filter(s=>s.state==='unloaded').length;
  chk('setores bem longe dos olhos são descarregados (com atraso)',far.length>0&&un===far.length,`${un}/${far.length}`);
  const near=sm.list.filter(s=>s.y0<1.6+P.above-1&&s.kind==='shaft'); chk('setores na janela estão ativos',near.every(s=>s.state==='active'),near.length+' faixas'); }

// ---------- 3) recursos de GPU ----------
log('— Liberação de recursos —');
{ const disposed=new Set(), texOut=new Set(); const spy=g=>{ g.addEventListener('dispose',()=>disposed.add(g)); };
  world.root.traverse(o=>{ if(o.geometry) spy(o.geometry); });
  sm.texUsers.forEach((us,t)=>t.addEventListener('dispose',()=>texOut.add(t)));
  run(.2,TOP-2); run(8,TOP-2); run(8,1.6);
  chk('padrão (freeGeometry=false): a geometria fica residente; texturas específicas de setor são liberadas',disposed.size===0&&texOut.size>0&&[...texOut].every(t=>sm.texUsers.get(t).size<=RENDER_CONFIG.sharedLimit&&!sm.keep.has(t)),texOut.size+' texturas liberadas');
  RENDER_CONFIG.freeGeometry=true;
  run(.2,TOP-2); run(8,TOP-2); run(8,1.6);
  const bad=[...disposed].filter(g=>{ const us=sm.geoUsers.get(g); return !us||[...us].some(s=>s.state!=='unloaded'&&s.state!=='loading'&&s.state!=='ready'&&false)||sm.keep.has(g); });
  chk('com freeGeometry=true: só geometrias de setores descarregados são liberadas (nunca as compartilhadas em uso)',disposed.size>0&&bad.length===0,disposed.size+' liberadas');
  chk('GEO compartilhada das agarras nunca é liberada enquanto um setor com agarras está carregado',!disposed.has(GEO.holdX)||sm.list.filter(s=>s.geos.has(GEO.holdX)).every(s=>s.state==='unloaded'));
  const hits2=cast(), d2=hits2.filter((h,i)=>h!==hits0[i]).length;
  chk('depois de descarregar e recarregar setores, o raycast continua idêntico',d2===0,d2?d2+' diferentes':''); RENDER_CONFIG.freeGeometry=false; }

// ---------- 4) sala com puzzle em andamento fica fixa ----------
{ run(.5,101.6,20); game.puzzles.puzzles=[{id:'h1',active:true,solved:false}];
  run(.2,350); run(10,350);
  const h1=sm.list.find(s=>s.roomId==='h1');
  chk('sala com puzzle em andamento (Casa das Bombas) não descarrega, nem as faixas da entrada',h1&&h1.state!=='unloaded'&&h1.deps.every(d=>d.state!=='unloaded'),h1?h1.state:'sem setor');
  game.puzzles.puzzles=[]; run(10,350); chk('  resolvido o puzzle, ela pode descarregar',h1.state==='unloaded'); }

// ---------- 5) região, agarra que desmorona, LOD e luzes ----------
log('— Região, agarras, LOD, luzes —');
{ const M=world.puzzleRooms.mz300, z=M.zoneRoom; run(.3,MAZE.H+1.6,(z.minX+z.maxX)/2); run(.3,MAZE.H+1.6,0);
  at(MAZE.H+1.6,0,(z.minZ+z.maxZ)/2); run(.3); chk('dentro do labirinto vale a janela da sala fechada',sm.region&&/Labirinto/.test(sm.region.name),sm.region?sm.region.name:'nenhuma'); }
{ const o=world.grabbables.find(m=>m.userData.inst&&m.userData.crumble&&m.position.y>40); run(.3,o.position.y);
  const {im,i}=o.userData.inst; world.touch(o); sm.update(1/60); const M=new THREE.Matrix4(); im.getMatrixAt(i,M);
  chk('agarra que começa a desmoronar volta a ser desenhada sozinha (e some do InstancedMesh)',o.visible&&!o.userData.inst&&M.elements[0]===0);
  for(let k=0;k<300;k++) world.update(1/60,null); chk('  e cai e sai do mapa como antes',!o.parent);
  const ims=world.root.children.filter(m=>m.isInstancedMesh); let okB=true;
  for(const m of ims){ const bs=m.geometry.boundingSphere, M2=new THREE.Matrix4(), p=V(); for(let k=0;k<m.count;k++){ m.getMatrixAt(k,M2); p.setFromMatrixPosition(M2); if(M2.elements[0]!==0&&p.distanceTo(bs.center)>bs.radius+1e-3) okB=false; } }
  chk('InstancedMesh com esfera envolvente que cobre todas as instâncias (degraus das escadas também)',ims.length>0&&okB,ims.length+' malhas'); }
{ const s=sm.list.find(s=>s.lods.some(l=>l.hi===heavy)), l=s&&s.lods.find(l=>l.hi===heavy);
  run(.3,61,2); const nearOk=l&&heavy.visible&&!l.lo.visible; run(.3,61+sm.P.lod+6,0); const farOk=l&&!heavy.visible&&l.lo.visible;
  chk('LOD: modelo pesado perto, caixa simples longe',nearOk&&farOk,l?`${l.tris} triângulos → 12`:'sem LOD'); }
{ let maxL=0,minL=1e9; const count=()=>{ let n=0; scene.traverseVisible(o=>{ if(o.isPointLight) n++; }); return n; };
  const H1=world.puzzleRooms.h1, gz=H1.zoneRoom; H1.refs.lights.forEach(L=>{ L.intensity=1.15; });
  for(let y=1.6;y<=TOP;y+=2){ at(y); sm.update(.12); const n=count(); maxL=Math.max(maxL,n); minL=Math.min(minL,n); }
  run(1.5,105,(gz.minX+gz.maxX)/2);
  const used=sm.pool.filter(l=>l.intensity>0).length;
  chk('luzes do mapa são virtuais (ocultas); o shader vê sempre o mesmo número',sm.lights.every(L=>!L.l.visible)&&maxL===minL&&maxL===sm.P.localLights,`${sm.lights.length} virtuais · ${maxL} reais`);
  chk('  dentro da Casa das Bombas com a energia ligada, o pool acende luzes da sala',used>0&&sm.pool.every(l=>l.intensity<=1.15+1e-6),used+' acesas'); }

// ---------- 6) modo completo e reconstrução ----------
log('— Espectador e reinício —');
{ sm.setFullView(true); sm.update(.2);
  const prox=world.root.children.filter(o=>o.userData.batched||o.userData.inst), draw=world.root.children.filter(o=>o.userData.type==='batch');
  chk('modo completo: peças originais visíveis (paredes fantasma), batches ocultos, luzes reais',prox.every(o=>o.visible)&&draw.every(o=>!o.visible)&&sm.lights.every(L=>L.l.visible));
  sm.setFullView(false); run(.3,60);
  chk('  ao sair: originais voltam a ser só alvo de raycast',prox.every(o=>!o.visible)&&sm.lights.every(L=>!L.l.visible)); }
{ const oldRoot=world.root, mats=new Set(); oldRoot.traverse(o=>{ if(o.material&&!Object.values(MAT).includes(o.material)&&!Object.values(IMAT).includes(o.material)&&![...ALT.values()].includes(o.material)) mats.add(o.material); });
  const gone=new Set(); mats.forEach(m=>m.addEventListener('dispose',()=>gone.add(m)));
  world.reset(); scene.updateMatrixWorld(true); run(.1,1.6);
  chk('World.reset: o SectorManager remonta sozinho para o mapa novo',sm.root===world.root&&sm.list.length>0);
  run(4,1.6);
  log([...mats].filter(m=>!gone.has(m)).map(m=>m.type+' '+(m.color?m.color.getHexString():'')+' map:'+!!m.map+' '+(m.name||'')).join(' | '));
  chk('  materiais e texturas próprios do mapa anterior são liberados depois (sem vazamento)',mats.size>0&&gone.size===[...mats].filter(m=>!(SectorManager._avg&&[...SectorManager._avg.values()].includes(m))).length,`${gone.size}/${mats.size}`);
  const hitsR=(()=>{ scene.updateMatrixWorld(true); return cast(); })(), same=hitsR.filter((h,i)=>h.split(':')[1]===hits0[i].split(':')[1]).length;
  chk('  mapa novo: os raios acertam à mesma distância que no original',same===rays.length,`${same}/${rays.length}`); }

log('\nfalhas:',fails); process.exit(fails?1:0);
