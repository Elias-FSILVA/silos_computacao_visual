'use strict';
// ============================================================================
// js/world/SectorManager.js — o silo desenha só o que está em volta dos olhos.
//
// SETORES: faixas verticais do poço (RENDER_CONFIG.sectorHeight) e as salas de world.puzzleRooms (cada sala é um setor
// próprio: alas, Pátio, galeria do exaustor, labirinto, ramais). Cada filho de world.root vai para o setor da sala que
// contém o seu centro ou para a faixa da sua altura; peças muito altas (parede do poço) são avaliadas uma a uma.
// Estados: unloaded (buffers de GPU liberados) → loading (texturas enviadas aos poucos) → ready (residente, oculto) →
// active (desenhado). A janela é VERTICAL (above/below a partir dos olhos), com histerese na saída, pré-carga antes da
// entrada e descarga só bem depois, com atraso. Salas com puzzle em andamento ficam fixas (nunca descarregam).
//
// O QUE NUNCA MUDA: world.platforms (colisão), world.grabbables / raycastTargets / interactables (agarre, prego, martelo,
// interação) e o estado de puzzles, portas, elevador e pregos. Esconder ou descarregar só afeta o DESENHO: o Raycaster
// do Three.js ignora 'visible' e usa os dados de CPU da geometria, que nunca são apagados.
//
// Dentro de cada setor:
//   batches    as peças ESTÁTICAS (paredes, pisos, bordas, enfeites) viram uma malha por material. As originais continuam
//              na cena, invisíveis, como alvo do raycast e da colisão (mesmos objetos, mesmo userData).
//   instanced  as agarras de tijolo viram um InstancedMesh por material; a que começa a desmoronar volta a ser desenhada
//              sozinha (o tremor e a queda continuam iguais).
//   lods       modelos glTF pesados (andaime, luminária) trocam por uma caixa da mesma cor média além de 'lod' metros.
//   detail     enfeites pequenos/finos (parafusos, abraçadeiras, postes) somem além de 'detail' metros na vertical.
// Luzes: as PointLights do mapa viram luzes VIRTUAIS (ocultas; os puzzles continuam mudando intensidade e cor delas) e um
// pool fixo de localLights luzes reais copia as mais relevantes perto dos olhos, com fade. Contagem fixa = o shader não
// recompila quando se anda pelo mapa.
// Modo completo (espectador): tudo visível, peças originais no lugar dos batches (paredes fantasma funcionam).
// ============================================================================

// passo da máquina de estados de um setor (sem Three.js; tools/test_setores.js testa)
// d = distância vertical dos olhos ao setor (0 = dentro) · win = janela na direção do setor · P = perfil · dt em s
function sectorStep(sec,d,win,P,dt){
  const was=sec.state;
  if(sec.state==='active'){ if(d>win+P.hysteresis) sec.state='ready'; }
  else if(d<=win) sec.state='active';
  else if(sec.state==='unloaded'&&d<=win+P.preload) sec.state='loading';
  if(sec.state!=='active'&&sec.state!=='unloaded'&&!sec.pinned&&d>win+P.preload+P.unload){
    sec.farT=(sec.farT||0)+dt; if(sec.farT>=P.unloadDelay){ sec.state='unloaded'; sec.farT=0; }
  } else sec.farT=0;
  return sec.state===was?null:was+'>'+sec.state;
}
// distância vertical de y ao intervalo [y0,y1] e o lado (1 = o intervalo está acima)
function vgap(y,y0,y1){ return y<y0?[y0-y,1]:y>y1?[y-y1,-1]:[0,0]; }

const _sv=new THREE.Vector3(), _sv2=new THREE.Vector3();
const TEX_KEYS=['map','normalMap','emissiveMap','alphaMap','roughnessMap','metalnessMap','aoMap','bumpMap','lightMap'];

class SectorManager{
  constructor(game){
    this.g=game; this.world=game.world; this.root=null; this.enabled=true; this.full=false;
    this.cfg=RENDER_CONFIG; this.P=RenderProfile.resolve(game.settings&&game.settings.data,false);
    this.list=[]; this.spanning=[]; this.exterior=[]; this.lights=[]; this.pool=[]; this.slots=[];
    this.queue=[]; this.t=0; this.focus=new THREE.Vector3(); this.events=[]; this.stats={};
    this.region=null; this.batched=true; this.freed=new WeakSet();   // texturas liberadas da GPU por um setor descarregado
  }
  // ---------- perfil (Game.applyRenderProfile) ----------
  setProfile(p){
    this.P=p;
    // pool de luzes locais: contagem fixa por perfil (mudar a contagem recompila os shaders — só aqui)
    while(this.pool.length<p.localLights){ const l=new THREE.PointLight(0xffffff,0,10,1.6); l.userData.pool=true; this.g.scene.add(l); this.pool.push(l); this.slots.push({src:null,w:0,next:null}); }
    while(this.pool.length>p.localLights){ const l=this.pool.pop(); this.slots.pop(); if(l.parent) l.parent.remove(l); }
    this.pool.forEach(l=>{ l.visible=!this.full; });
    this.t=1e9;   // reavalia no próximo quadro
  }
  // ---------- montagem ----------
  rebuild(){
    const W=this.world, root=W.root;
    this.root=root; this.list=[]; this.spanning=[]; this.exterior=[]; this.lights=[]; this.queue=[]; this.events=[];
    this.slots.forEach(s=>{ s.src=null; s.w=0; s.next=null; }); this.pool.forEach(l=>{ l.intensity=0; });
    root.updateMatrixWorld(true);
    root.matrixAutoUpdate=false; root.updateMatrix();     // o mapa nunca se move: sem recomposição de matriz por quadro
    // luzes do mapa → virtuais
    root.traverse(o=>{ if(o.isPointLight){ o.visible=this.full; this.lights.push({l:o,w:0,want:false}); } });
    // salas e faixas
    const rooms=[], H=this.cfg.sectorHeight, bands=new Map();
    for(const r of Object.values(W.puzzleRooms)){
      const zones=[r.zoneRoom,...(r.zones||[]),r.zoneDuct,r.zoneExit].filter(Boolean); if(!zones.length) continue;
      rooms.push(this._sector('room:'+r.id,'room',r.id,zones));
    }
    const band=y=>{ const k=Math.floor(y/H); if(!bands.has(k)) bands.set(k,this._sector('poço:'+(k*H)+'–'+((k+1)*H),'shaft',null,null,k*H,(k+1)*H)); return bands.get(k); };
    const dyn=this._dynamic(), box=new THREE.Box3(), c=new THREE.Vector3();
    for(const o of root.children.slice()){
      if(o.isLight||o.userData.type==='batch'||o.userData.type==='lod') continue;
      if(o.userData.exterior){ this.exterior.push(o); continue; }
      this._box(o,box.makeEmpty()); if(box.isEmpty()) continue;
      box.getCenter(c);
      const room=rooms.find(s=>s.zones.some(z=>this._inZone(c,z,.8)));
      if(!room&&box.max.y-box.min.y>H*this.cfg.spanSplit){ this.spanning.push({o,y0:box.min.y,y1:box.max.y,shown:true}); continue; }
      (room||band(c.y)).members.push({o,y0:box.min.y,y1:box.max.y,r:box.getSize(_sv).length()/2,size:_sv.clone(),dyn:dyn.has(o)});
    }
    this.list=[...rooms,...[...bands.values()].sort((a,b)=>a.y0-b.y0)].filter(s=>s.members.length);
    for(const s of this.list){ s.y0=Math.min(...s.members.map(m=>m.y0)); s.y1=Math.max(...s.members.map(m=>m.y1)); }
    // dependências: a sala precisa das faixas do poço na altura dela (entrada e saída)
    for(const s of this.list) if(s.kind==='room') s.deps=this.list.filter(b=>b.kind==='shaft'&&b.y1>s.y0&&b.y0<s.y1);
    for(const s of this.list) this._prepare(s,root);
    this._resources();
    // estado inicial: nada desenhado; o primeiro update() ativa o que está na janela
    for(const s of this.list){ s.state='ready'; s.shown=true; this._show(s,false); }
    for(const sp of this.spanning){ sp.shown=true; }
    this.exterior.forEach(o=>{ o.visible=this.full; });
    this.t=1e9;
    this.stats.built={sectors:this.list.length,spanning:this.spanning.length,batches:this.list.reduce((a,s)=>a+s.batches.length,0),
      instanced:this.list.reduce((a,s)=>a+s.instanced.length,0),lods:this.list.reduce((a,s)=>a+s.lods.length,0),lights:this.lights.length};
  }
  _sector(id,kind,roomId,zones,y0=0,y1=0){
    return {id,kind,roomId,zones,y0,y1,state:'ready',shown:false,farT:0,pinned:false,members:[],items:[],batches:[],detail:[],detailOn:false,
      instanced:[],lods:[],geos:new Set(),texs:new Set(),deps:[]};
  }
  // caixa no mundo, inclusive de InstancedMesh (o Box3 do r128 só vê a geometria base)
  _box(o,box){
    o.traverse(m=>{
      if(!m.geometry||!m.geometry.attributes||!m.geometry.attributes.position) return;
      const g=m.geometry; if(!g.boundingBox) g.computeBoundingBox();
      if(m.isInstancedMesh){ const M=new THREE.Matrix4(), b=new THREE.Box3();
        for(let i=0;i<m.count;i++){ m.getMatrixAt(i,M); b.copy(g.boundingBox).applyMatrix4(M.premultiply(m.matrixWorld)); box.union(b); } }
      else { const b=g.boundingBox.clone().applyMatrix4(m.matrixWorld); box.union(b); }
    });
    return box;
  }
  // zona de sala (caixa ou setor anelar, como em Collision.inZone) com folga
  _inZone(p,z,pad){
    if(p.y<z.minY-pad||p.y>z.maxY+pad) return false;
    if(z.arc){ const A=z.arc, dx=p.x-(A.cx||0), dz=p.z-(A.cz||0), r=Math.hypot(dx,dz); if(r<A.r0-pad||r>A.r1+pad) return false;
      const da=pad/Math.max(r,1); return wrap2(Math.atan2(dz,dx)-(A.a0-da))<=A.span+2*da; }
    return p.x>=z.minX-pad&&p.x<=z.maxX+pad&&p.z>=z.minZ-pad&&p.z<=z.maxZ+pad;
  }
  // objetos que a lógica do jogo move, troca de material ou remove: nunca entram em batch
  _dynamic(){
    const W=this.world, out=new Set(), seen=new Set();
    const mark=o=>{ o.traverse(c=>out.add(c)); let p=o.parent; while(p&&p!==W.root){ out.add(p); p=p.parent; } };
    const scan=(v,depth)=>{
      if(!v||typeof v!=='object'||seen.has(v)) return; seen.add(v);
      if(v.isObject3D){ mark(v); return; }
      if(v.isMaterial||v.isTexture||v.isBufferGeometry||v.isVector3||v.isColor||ArrayBuffer.isView(v)||depth>5) return;
      if(Array.isArray(v)||v instanceof Set||v instanceof Map){ v.forEach(x=>scan(x,depth+1)); return; }
      for(const k of Object.keys(v)){ if(k==='world'||k==='g'||k==='game'||k==='cfg') continue; scan(v[k],depth+1); }
    };
    Object.values(W.puzzleRooms).forEach(r=>scan(r,0));
    [W.animated,W.movers,W.fans,W.secrets,W.mazeScr,W.finishDoor,W.finishLight,W.elevator,W.maze&&W.maze.screen].forEach(v=>scan(v,0));
    for(const arr of [W.interactables,W.walls,W.grabbables]) for(const m of arr){ const it=m.userData.interactable;
      if(it&&it!==SURFACE.concrete){ mark(m); scan(it,0); } const t=m.userData.type; if(t==='door'||t==='hold'||t==='nail'||t==='breakable'||t==='smash') mark(m); }
    return out;
  }
  // assinatura de atributos para o batch (posição + normal [+ uv]); null = não entra
  _sig(m){
    const g=m.geometry, a=g&&g.attributes; if(!a||!a.position||!a.normal) return null;
    if(a.position.isInterleavedBufferAttribute||a.normal.isInterleavedBufferAttribute||a.position.itemSize!==3||a.normal.itemSize!==3) return null;
    for(const k in a) if(k!=='position'&&k!=='normal'&&k!=='uv') return null;
    if(a.uv&&(a.uv.isInterleavedBufferAttribute||a.uv.itemSize!==2)) return null;
    if(g.morphAttributes&&Object.keys(g.morphAttributes).length) return null;
    if(g.drawRange.start!==0||g.drawRange.count!==Infinity||a.position.count>65535) return null;
    return a.uv?'pnu':'pn';
  }
  _static(e){
    const m=e.o, mt=m.material;
    return !e.dyn&&m.isMesh&&!m.isInstancedMesh&&!m.isSkinnedMesh&&!m.children.length&&mt&&!Array.isArray(mt)&&mt.visible!==false&&!mt.transparent
      &&m.matrixWorld.determinant()>0&&!!this._sig(m);
  }
  // batches, instancing das agarras e LOD de um setor
  _prepare(s,root){
    const cfg=this.cfg, groups=new Map(), holds=new Map();
    for(const e of s.members){
      const o=e.o, u=o.userData, mt=o.material;
      // agarra de tijolo: instanciada (a original fica como alvo do raycast)
      if(u.type==='hold'&&o.isMesh&&!o.children.length&&(mt===MAT.holdBrick||mt===MAT.crumble)&&(o.geometry===GEO.holdX||o.geometry===GEO.holdZ)){
        const k=o.geometry.uuid+'|'+mt.uuid; if(!holds.has(k)) holds.set(k,[]); holds.get(k).push(o); continue; }
      // alvo de raycast invisível sem filhos: fica fora do desenho (não muda nada no raycast)
      if(o.isMesh&&mt&&mt.visible===false&&!o.children.length){ o.visible=false; continue; }
      if(this.batched&&this._static(e)){
        // detalhe = pequeno (parafuso, vergalhão, abraçadeira) ou HASTE fina (poste, escora: duas medidas finas); placas finas não
        const d3=[e.size.x,e.size.y,e.size.z].sort((a,b)=>a-b), small=e.r<cfg.smallRadius||(d3[1]<.12&&d3[2]<1.6);
        const k=mt.uuid+'|'+this._sig(o)+(small?'|d':''); if(!groups.has(k)) groups.set(k,{small,list:[]}); groups.get(k).list.push(o); continue; }
      if(o.isGroup&&o.userData.size&&!e.dyn){ const lod=this._lod(o); if(lod){ s.lods.push(lod); continue; } }
      if(o.isInstancedMesh) this._fitInstanced(o);
      s.items.push(o);
    }
    for(const {small,list} of groups.values()){
      if(list.length<2&&!small){ s.items.push(list[0]); continue; }      // sozinho não ganha nada
      for(const geo of this._merge(list)){
        const b=new THREE.Mesh(geo,list[0].material); b.matrixAutoUpdate=false; b.updateMatrix(); b.name='batch:'+s.id; b.userData={type:'batch'};
        root.add(b); (small?s.detail:s.batches).push(b); s.geos.add(geo);
      }
      for(const o of list){ o.visible=false; o.matrixAutoUpdate=false; o.userData.batched=true; }
    }
    for(const list of holds.values()){
      const geo=list[0].geometry.clone(); geo.userData.shared=false;
      const im=new THREE.InstancedMesh(geo,list[0].material,list.length); im.matrixAutoUpdate=false; im.updateMatrix(); im.name='holds:'+s.id; im.userData={type:'batch'};
      list.forEach((o,i)=>{ im.setMatrixAt(i,o.matrixWorld); o.userData.inst={im,i}; o.visible=false; });
      im.instanceMatrix.needsUpdate=true; this._fitInstanced(im); root.add(im); s.instanced.push(im); s.geos.add(geo);
    }
  }
  // esfera envolvente real de um InstancedMesh (o r128 usa só a da geometria base, na origem do mundo)
  _fitInstanced(im){
    if(im.geometry.userData.shared){ im.geometry=im.geometry.clone(); im.geometry.userData.shared=false; }
    const g=im.geometry; if(!g.boundingSphere) g.computeBoundingSphere();
    const b=new THREE.Box3(), M=new THREE.Matrix4(), r=g.boundingSphere.radius;
    for(let i=0;i<im.count;i++){ im.getMatrixAt(i,M); b.expandByPoint(_sv.setFromMatrixPosition(M)); }
    if(b.isEmpty()) return;
    g.boundingSphere=b.getBoundingSphere(new THREE.Sphere()); g.boundingSphere.radius+=r;
  }
  // une as malhas (mesmo material, mesmos atributos) já transformadas para o mundo; um buffer a cada 65 535 vértices
  _merge(list){
    const out=[], uv=!!list[0].geometry.attributes.uv; let cur=[], n=0;
    const flush=()=>{ if(!cur.length) return;
      let ni=0; for(const m of cur){ const g=m.geometry; ni+=g.index?g.index.count:g.attributes.position.count; }
      const P=new Float32Array(n*3), N=new Float32Array(n*3), U=uv?new Float32Array(n*2):null, I=new Uint16Array(ni), nm=new THREE.Matrix3();
      let v=0, ii=0;
      for(const m of cur){
        const g=m.geometry, p=g.attributes.position, q=g.attributes.normal, t=g.attributes.uv, mw=m.matrixWorld; nm.getNormalMatrix(mw);
        for(let i=0;i<p.count;i++){
          _sv.fromBufferAttribute(p,i).applyMatrix4(mw); P[(v+i)*3]=_sv.x; P[(v+i)*3+1]=_sv.y; P[(v+i)*3+2]=_sv.z;
          _sv.fromBufferAttribute(q,i).applyMatrix3(nm).normalize(); N[(v+i)*3]=_sv.x; N[(v+i)*3+1]=_sv.y; N[(v+i)*3+2]=_sv.z;
          if(U){ U[(v+i)*2]=t.getX(i); U[(v+i)*2+1]=t.getY(i); }
        }
        if(g.index){ for(let i=0;i<g.index.count;i++) I[ii++]=g.index.getX(i)+v; } else for(let i=0;i<p.count;i++) I[ii++]=v+i;
        v+=p.count;
      }
      const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(P,3)); geo.setAttribute('normal',new THREE.BufferAttribute(N,3));
      if(U) geo.setAttribute('uv',new THREE.BufferAttribute(U,2)); geo.setIndex(new THREE.BufferAttribute(I,1));
      geo.computeBoundingSphere(); geo.computeBoundingBox(); out.push(geo); cur=[]; n=0; };
    for(const m of list){ const c=m.geometry.attributes.position.count; if(n+c>65535) flush(); cur.push(m); n+=c; }
    flush(); return out;
  }
  // LOD de um modelo glTF pesado: caixa orientada do tamanho do modelo, na cor média da textura dele
  _lod(grp){
    let tris=0, best=null, bt=-1; const lb=new THREE.Box3();
    grp.traverse(m=>{ if(!m.isMesh||!m.geometry.attributes.position) return; const g=m.geometry, t=(g.index?g.index.count:g.attributes.position.count)/3;
      tris+=t; if(t>bt){ bt=t; best=m; } if(!g.boundingBox) g.computeBoundingBox();
      const b=g.boundingBox.clone(); if(m!==grp) b.applyMatrix4(m.matrix); lb.union(b); });
    if(tris<this.cfg.lodMinTris||!best||lb.isEmpty()) return null;
    const size=lb.getSize(new THREE.Vector3()), ctr=lb.getCenter(new THREE.Vector3());
    const lo=new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x,.02),Math.max(size.y,.02),Math.max(size.z,.02)),this._avgMat(best.material));
    lo.position.copy(ctr); grp.updateMatrixWorld(); lo.applyMatrix4(grp.matrixWorld); lo.updateMatrix(); lo.matrixAutoUpdate=false; lo.updateMatrixWorld(true);
    lo.name='lod:'+(best.name||'modelo'); lo.userData={type:'lod'}; this.root.add(lo);
    return {hi:grp,lo,c:new THREE.Vector3().setFromMatrixPosition(lo.matrixWorld),hiOn:null,tris};
  }
  _avgMat(src){
    const cache=SectorManager._avg||(SectorManager._avg=new Map()); src=Array.isArray(src)?src[0]:src;
    if(cache.has(src)) return cache.get(src);
    const col=new THREE.Color(src.color?src.color.getHex():0x777777);
    try{ const img=src.map&&src.map.image; if(img&&img.width){ const c=document.createElement('canvas'); c.width=c.height=4; const x=c.getContext('2d'); x.drawImage(img,0,0,4,4);
      const d=x.getImageData(0,0,4,4).data; let r=0,g=0,b=0; for(let i=0;i<64;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; }
      col.multiply(new THREE.Color(r/16/255,g/16/255,b/16/255)); } }catch(e){}
    const m=new THREE.MeshStandardMaterial({color:col,roughness:src.roughness!=null?src.roughness:.9,metalness:src.metalness||0}); cache.set(src,m); return m;
  }
  // geometrias e texturas de cada setor (contagem de uso: um recurso só é liberado quando todos os setores que o usam
  // estão descarregados e nada fora dos setores o usa)
  _resources(){
    this.geoUsers=new Map(); this.texUsers=new Map(); this.keep=new Set();
    const addMat=(set,mt)=>{ (Array.isArray(mt)?mt:[mt]).forEach(x=>{ if(x) TEX_KEYS.forEach(k=>{ if(x[k]&&x[k].isTexture) set.add(x[k]); }); }); };
    const use=(s,o)=>o.traverse(m=>{ if(m.geometry&&m.geometry.isBufferGeometry) s.geos.add(m.geometry); if(m.material) addMat(s.texs,m.material); });
    for(const s of this.list){
      [...s.members.map(e=>e.o),...s.batches,...s.detail,...s.instanced].forEach(o=>use(s,o));
      s.lods.forEach(l=>{ use(s,l.hi); use(s,l.lo); });
      s.geos.forEach(g=>{ if(!this.geoUsers.has(g)) this.geoUsers.set(g,new Set()); this.geoUsers.get(g).add(s); });
      s.texs.forEach(t=>{ if(!this.texUsers.has(t)) this.texUsers.set(t,new Set()); this.texUsers.get(t).add(s); });
    }
    // o que é usado fora dos setores (mãos, itens, massa, HUD do VR, peças altas da parede) nunca é liberado
    const keepO=o=>o.traverse(m=>{ if(m.geometry) this.keep.add(m.geometry); if(m.material) addMat(this.keep,m.material); });
    this.g.scene.children.forEach(o=>{ if(o!==this.root) keepO(o); });
    for(const [r,us] of [...this.geoUsers,...this.texUsers]) if(us.size>this.cfg.sharedLimit) this.keep.add(r);   // globais: residentes
    this.spanning.forEach(sp=>keepO(sp.o)); this.exterior.forEach(keepO);
  }
  // ---------- quadro a quadro ----------
  update(dt){
    if(!this.enabled) return;                       // desligado (?nosectors): o mapa fica exatamente como o World montou
    if(this.world.root!==this.root) this.rebuild();
    // materiais/texturas do mapa anterior (World.reset): liberados quando o novo já está em uso
    const tr=this.world.trash; if(tr&&tr.length&&(this.trashT=(this.trashT||0)+dt)>3){ tr.forEach(x=>{ if(x.dispose) x.dispose(); }); this.world.trash=[]; this.trashT=0; }
    if(!this.enabled||!this.list.length) return;
    this._syncCrumbles();
    this._pump();
    this.t+=dt;
    const cam=this.g.camera; cam.getWorldPosition(this.focus);
    if(this.t>=this.cfg.updateInterval){ const step=Math.min(this.t,.5); this.t=0; if(!this.full) this._evaluate(step); this._pickLights(); }
    this._lightsFrame(dt);
  }
  // Salto espacial: foco/visibilidade no destino antes do render, sem consumir dt físico ou full view.
  refreshFocus(){
    if(!this.enabled)return;
    if(this.world.root!==this.root)this.rebuild();
    this.g.camera.getWorldPosition(this.focus);this.t=0;
    if(!this.full)this._evaluate(0);
    this._pickLights();this._lightsFrame(0);
  }
  _inRoom(id,p){ const r=this.world.puzzleRooms[id]; if(!r) return false; return [r.zoneRoom,...(r.zones||[]),r.zoneDuct,r.zoneExit].filter(Boolean).some(z=>inZone(p,z)); }
  _evaluate(dt){
    const P=this.P, f=this.focus, reg=this.region=RenderProfile.region(f.y,id=>this._inRoom(id,f));
    const above=reg&&reg.above!=null?Math.min(reg.above,P.above):P.above, below=reg&&reg.below!=null?Math.min(reg.below,P.below):P.below;
    const PP={hysteresis:P.hysteresis,preload:P.preload,unload:P.unload,unloadDelay:this.cfg.unloadDelay}, preUp=reg&&reg.preloadAbove?reg.preloadAbove:0;
    const pz=this.g.puzzles, act=new Set((pz&&pz.puzzles||[]).filter(p=>p.active&&!p.solved).map(p=>p.id));
    for(const s of this.list) s.pinned=false;
    for(const s of this.list) if(s.roomId&&act.has(s.roomId)){ s.pinned=true; s.deps.forEach(d=>d.pinned=true); }
    for(const s of this.list){
      let [d,side]=vgap(f.y,s.y0,s.y1);
      if(s.kind==='room'&&d>0&&s.zones.some(z=>this._inZone(f,z,.5))) d=0;
      const win=side>0?above:below, was=s.state;
      const ev=sectorStep(s,d,win,side>0?{...PP,preload:PP.preload+preUp}:PP,dt);
      if(ev){ this.events.push({t:performance.now(),id:s.id,ev}); this.evCount=(this.evCount||0)+1; if(this.events.length>40) this.events.shift();
        if(s.state==='unloaded') this._unload(s);
        else if(was==='unloaded') this._load(s); }
      this._show(s,s.state==='active');
      const dOn=s.state==='active'&&d<=P.detail+(s.detailOn?2:0);
      if(dOn!==s.detailOn){ s.detailOn=dOn; s.detail.forEach(b=>{ b.visible=dOn; }); }
      if(s.lods.length) for(const l of s.lods){
        const dist=f.distanceTo(l.c), hi=l.hiOn?dist<P.lod+1:dist<P.lod-1, on=s.state==='active';
        if(hi!==l.hiOn||on!==l.on){ l.hiOn=hi; l.on=on; l.hi.visible=on&&hi; l.lo.visible=on&&!hi; }
      }
    }
    // peças altas da parede: janela própria
    for(const sp of this.spanning){ const [d,side]=vgap(f.y,sp.y0,sp.y1), win=(side>0?above:below)+(sp.shown?P.hysteresis:0), on=d<=win;
      if(on!==sp.shown){ sp.shown=on; sp.o.visible=on; } }
  }
  _show(s,on){
    if(s.shown===on) return; s.shown=on;
    for(const o of s.items) o.visible=on; for(const b of s.batches) b.visible=on; for(const b of s.instanced) b.visible=on;
    if(!on){ s.detail.forEach(b=>{ b.visible=false; }); s.detailOn=false; s.lods.forEach(l=>{ l.hi.visible=l.lo.visible=false; l.on=false; }); }
  }
  // agarra que começou a desmoronar: sai do InstancedMesh e volta a ser desenhada sozinha (treme, cai e some como antes)
  _syncCrumbles(){
    const C=this.world.crumbling; if(!C.length) return;
    for(const o of C){ const u=o.userData.inst; if(!u) continue;
      u.im.setMatrixAt(u.i,new THREE.Matrix4().makeScale(0,0,0)); u.im.instanceMatrix.needsUpdate=true; o.userData.inst=null; o.visible=true; }
  }
  // ---------- GPU: liberar e recarregar ----------
  _unload(s){
    let g=0,t=0;
    if(this.cfg.freeGeometry) for(const geo of s.geos){ if(this.keep.has(geo)) continue; const us=this.geoUsers.get(geo); if(us&&[...us].every(x=>x.state==='unloaded')){ geo.dispose(); g++; } }
    for(const tx of s.texs){ if(this.keep.has(tx)) continue; const us=this.texUsers.get(tx); if(us&&[...us].every(x=>x.state==='unloaded')){ tx.dispose(); this.freed.add(tx); t++; } }
    s.freed={geos:g,texs:t};
  }
  // carregamento progressivo: as texturas liberadas voltam para a GPU algumas por quadro (as geometrias sobem no 1º desenho,
  // já dentro da neblina)
  _load(s){ for(const tx of s.texs) if(this.freed.has(tx)) this.queue.push({tx,s}); if(!this.queue.some(q=>q.s===s)&&s.state==='loading') s.state='ready'; }
  _pump(){
    const r=this.g.renderer;
    for(let n=0;n<this.cfg.texturesPerFrame&&this.queue.length;n++){
      const {tx,s}=this.queue.shift();
      if(s.state==='unloaded') continue;                                 // descarregou de novo antes da vez dela
      if(this.freed.has(tx)){ this.freed.delete(tx); if(r&&r.initTexture&&tx.image) try{ r.initTexture(tx); }catch(e){} }
      if(s.state==='loading'&&!this.queue.some(q=>q.s===s)) s.state='ready';
    }
  }
  // ---------- luzes locais ----------
  _pickLights(){
    const f=this.focus, N=this.pool.length;
    const cand=[];
    for(const L of this.lights){ const l=L.l; L.want=false; if(this.full||!(l.intensity>.001)) continue;
      l.getWorldPosition(_sv2); const d=_sv2.distanceTo(f), reach=(l.distance||30)+6; if(d>reach) continue;
      const q=1-d/reach; cand.push({L,score:l.intensity*q*q}); }
    cand.sort((a,b)=>b.score-a.score);
    for(let i=0;i<Math.min(N,cand.length);i++) cand[i].L.want=true;
    // slots: a que não é mais desejada apaga (fade); a desejada sem slot espera um slot livre
    for(const sl of this.slots) sl.next=null;
    for(const L of this.lights){ if(!L.want||this.slots.some(sl=>sl.src===L||sl.next===L)) continue;
      const free=this.slots.find(sl=>!sl.src)||this.slots.find(sl=>sl.src&&!sl.src.want&&!sl.next); if(free){ if(!free.src) free.src=L; else free.next=L; } }
  }
  _lightsFrame(dt){
    const k=dt/Math.max(.01,this.cfg.lightFade);
    this.slots.forEach((sl,i)=>{
      const out=this.pool[i];
      if(!sl.src||this.full){ out.intensity=0; return; }
      const wantOn=sl.src.want&&!sl.next;
      sl.w=clamp(sl.w+(wantOn?k:-k),0,1);
      if(sl.w<=0&&!wantOn){ sl.src=sl.next; sl.next=null; sl.w=0; if(!sl.src){ out.intensity=0; return; } }
      const l=sl.src.l; l.getWorldPosition(out.position); out.color.copy(l.color); out.distance=l.distance; out.decay=l.decay; out.intensity=l.intensity*sl.w;
    });
  }
  // ---------- modo completo (espectador) ----------
  setFullView(on){
    on=!!on; if(on===this.full) return; this.full=on;
    if(this.world.root!==this.root) this.rebuild();
    for(const s of this.list){
      if(on){ s.state='active'; s.shown=false;
        for(const e of s.members){ const o=e.o; if(o.userData.batched||o.userData.inst) o.visible=true; else if(!(o.isMesh&&o.material&&o.material.visible===false&&!o.children.length)) o.visible=true; }
        s.batches.concat(s.detail,s.instanced).forEach(b=>{ b.visible=false; }); s.lods.forEach(l=>{ l.hi.visible=true; l.lo.visible=false; l.on=null; });
      } else {
        for(const e of s.members){ const o=e.o; if(o.userData.batched||o.userData.inst) o.visible=false; }
        s.state='ready'; s.shown=true; this._show(s,false); s.lods.forEach(l=>{ l.hiOn=null; l.on=null; });
      }
    }
    this.spanning.forEach(sp=>{ sp.o.visible=true; sp.shown=true; }); this.exterior.forEach(o=>{ o.visible=on; });
    this.lights.forEach(L=>{ L.l.visible=on; }); this.pool.forEach(l=>{ l.visible=!on; l.intensity=0; }); this.slots.forEach(sl=>{ sl.src=null; sl.next=null; sl.w=0; });
    this.t=1e9;
  }
  // ---------- diagnóstico ----------
  info(){
    const c={active:0,ready:0,loading:0,unloaded:0}; this.list.forEach(s=>c[s.state]++);
    let objs=0; if(this.root) for(const o of this.root.children) if(o.visible&&!o.isLight) objs++;
    return {...c,total:this.list.length,visibleRootObjects:objs,lightsUsed:this.slots.filter(s=>s.src).length,lightsVirtual:this.lights.length,
      queue:this.queue.length,region:this.region?this.region.name:'',lodHi:this.list.reduce((a,s)=>a+s.lods.filter(l=>l.hiOn&&l.on).length,0),full:this.full};
  }
}
