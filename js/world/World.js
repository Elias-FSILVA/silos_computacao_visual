'use strict';
// ============================================================================
// js/world/World.js — geometria do poço (400 m), superfícies agarráveis e contratos de nível
// Contrato público: world.platforms [{minX,maxX,minZ,maxZ,top, bottom?, climbable?, kind?}]
//                   world.checkpoints [{id,label,bonus,optional,position,radius,bounds?}]
//                   world.finish {position,radius}   world.spawnPoint (pés)
// Extras opcionais: world.raycastTargets, world.lamps, world.interactables, addPiton(), touch(), update()
//   world.puzzleDefs / world.puzzleRooms  → lidos por PuzzleSystem e Game._zones()
//   world.onCrumble, world.onSecretRevealed, world.onMazeEvent('countdown'|'dark')  → ganchos opcionais do Game
//
// Layout vertical (ver levelData.js):  S1 0–100 · P1 100 · S2 110–200 · P2 200 · S3 210–300 · P3 300 (labirinto) · S4 310–400 (fuga)
// ============================================================================

// Anel de paredes do poço. a→b = sentido anti-horário (dir=+1); horário (dir=-1) percorre b→a.
// Os cantos se encaixam: o fim de uma parede é o início da próxima (lat ±3.55 = canto).
const RING=[
  {axis:'x',s: 1,a:-3.55,b: 3.55},   // W0  parede +x  (lat = z)
  {axis:'z',s: 1,a: 3.55,b:-3.55},   // W1  parede +z  (lat = x)
  {axis:'x',s:-1,a: 3.55,b:-3.55},   // W2  parede -x  (lat = z)
  {axis:'z',s:-1,a:-3.55,b: 3.55}    // W3  parede -z  (lat = x)  ← parede das salas de puzzle
];

// ---------- labirinto: gerador (backtracker com viés de linha reta) + solucionador ----------
// E[c][r] = parede a leste da célula; N[c][r] = parede ao norte (norte = mais fundo na sala, -z)
function mazeGrid(cols,rows,seed,straight,c0){
  const R=mulberry(seed), E=[],N=[],seen=[];
  for(let c=0;c<cols;c++){ E.push(new Array(rows).fill(true)); N.push(new Array(rows).fill(true)); seen.push(new Array(rows).fill(false)); }
  const D=[[1,0],[-1,0],[0,1],[0,-1]];
  const open=(c,r,d)=>{ if(d===0) E[c][r]=false; else if(d===1) E[c-1][r]=false; else if(d===2) N[c][r]=false; else N[c][r-1]=false; };
  const st=[[c0,0,-1]]; seen[c0][0]=true;
  while(st.length){
    const [c,r,last]=st[st.length-1], cand=[];
    for(let d=0;d<4;d++){ const nc=c+D[d][0], nr=r+D[d][1]; if(nc>=0&&nc<cols&&nr>=0&&nr<rows&&!seen[nc][nr]) cand.push(d); }
    if(!cand.length){ st.pop(); continue; }
    const d=(cand.includes(last)&&R()<straight)?last:cand[Math.floor(R()*cand.length)];
    const nc=c+D[d][0], nr=r+D[d][1]; open(c,r,d); seen[nc][nr]=true; st.push([nc,nr,d]);
  }
  return {E,N,cols,rows};
}
function mazeSolve(m,c0,c1){
  const {E,N,cols,rows}=m, D=[[1,0],[-1,0],[0,1],[0,-1]], prev={}, q=[[c0,0]]; prev[c0+',0']=null;
  const can=(c,r,d)=>d===0?(c<cols-1&&!E[c][r]):d===1?(c>0&&!E[c-1][r]):d===2?(r<rows-1&&!N[c][r]):(r>0&&!N[c][r-1]);
  while(q.length){ const [c,r]=q.shift(); if(c===c1&&r===rows-1) break;
    for(let d=0;d<4;d++){ if(!can(c,r,d)) continue; const nc=c+D[d][0], nr=r+D[d][1], k=nc+','+nr; if(k in prev) continue; prev[k]=c+','+r; q.push([nc,nr]); } }
  const path=[]; let k=c1+','+(rows-1); while(k){ const [a,b]=k.split(',').map(Number); path.unshift([a,b]); k=prev[k]; }
  return path;
}

class World{
  constructor(scene){ this.scene=scene; this.W=W; this.TOP=TOP; this.root=null; this.onCrumble=null; this.onSecretRevealed=null; this.onMazeEvent=null; this.build(); }
  reset(){
    if(this.root){ this.scene.remove(this.root);
      this.root.traverse(o=>{ if(o.geometry&&!o.geometry.userData.shared) o.geometry.dispose(); }); }
    this.build();
  }
  rand(a,b){ return a+(b-a)*this.R(); }
  build(){
    this.R=mulberry(1987);
    this.root=new THREE.Group(); this.scene.add(this.root);
    this.platforms=[]; this.checkpoints=[]; this.walls=[]; this.grabbables=[]; this.interactables=[]; this.lamps=[]; this.crumbling=[];
    this.animated=[]; this.secrets=[]; this.puzzleRooms={}; this.puzzleDefs=[];
    this.maze=null; this.mazeScr=null; this._cam=null; this.cutaway=[]; this._routeGuide=null; this._labels=null;
    this.openings=OPENINGS.map(o=>({...o})); this.sockets=[]; this.halls=[]; this.route=null; this.finishLight=null; this.finishDoor=null;
    this.spawnPoint=new V3(0,0,0); this.spawnYaw=-Math.PI/2;
    this._layout(); this._shell(); this._scatter(); this._lamps();
    this.raycastTargets=[...this.walls,...this.grabbables,...this.interactables];
  }
  // ---------- primitivas ----------
  _box(minX,maxX,minY,maxY,minZ,maxZ,mat,o={}){
    const w=maxX-minX,h=maxY-minY,d=maxZ-minZ, geo=new THREE.BoxGeometry(w,h,d);
    if(UVSCALE_MATS.has(mat)) scaleUV(geo,w,h,d);
    const m=new THREE.Mesh(geo,mat); m.position.set((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);
    m.userData={type:o.type||'wall',interactable:o.interactable===undefined?(mat===MAT.concrete?SURFACE.concrete:null):o.interactable};
    (o.parent||this.root).add(m);
    if(o.cut) this.cutaway.push(m);                  // candidatos a 'parede fantasma' no modo espectador
    if(o.ray!==false) this.walls.push(m);
    if(o.solid!==false){ const pd={minX,maxX,minZ,maxZ,top:maxY,bottom:minY,kind:o.kind||'wall'}; this.platforms.push(pd); m.userData.solid=pd; }
    return m;
  }
  // caixa descrita por (lat, out) ao longo de uma parede do poço
  _boxLO(axis,la,lb,oa,ob,y0,y1,mat,o){
    const l0=Math.min(la,lb),l1=Math.max(la,lb),o0=Math.min(oa,ob),o1=Math.max(oa,ob);
    return axis==='x'?this._box(o0,o1,y0,y1,l0,l1,mat,o):this._box(l0,l1,y0,y1,o0,o1,mat,o);
  }
  // paredes do poço. Entre soleira e duto de cada puzzle (LOCK_BANDS) a parede vira CHAPA DE CONTENÇÃO:
  // sem prego (interactable nulo) e sem agarras — a única passagem para cima é pela sala.
  _shell(){
    for(const [axis,s] of [['x',1],['x',-1],['z',1],['z',-1]]){
      const ops=this.openings.filter(o=>o.axis===axis&&o.s===s);
      const oi=s*W, oo=s*(W+.5), L0=-W-.5, L1=W+.5;
      const ys=new Set([-30,TOP+30]); ops.forEach(o=>{ ys.add(o.y0); ys.add(o.y1); }); LOCK_BANDS.forEach(b=>{ ys.add(b.y0); ys.add(b.y1); });
      const Y=[...ys].sort((p,q)=>p-q);
      for(let i=0;i<Y.length-1;i++){
        const ya=Y[i], yb=Y[i+1]; if(yb-ya<1e-6) continue; const mid=(ya+yb)/2;
        const mat=LOCK_BANDS.some(b=>mid>b.y0&&mid<b.y1)?MAT.liner:MAT.concrete;
        const op=ops.find(o=>mid>o.y0&&mid<o.y1);
        if(op){ this._boxLO(axis,L0,op.lat0,oi,oo,ya,yb,mat,{cut:true}); this._boxLO(axis,op.lat1,L1,oi,oo,ya,yb,mat,{cut:true}); }
        else this._boxLO(axis,L0,L1,oi,oo,ya,yb,mat,{cut:true});
      }
    }
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*W,2*W),MAT.grate); fl.rotation.x=-Math.PI/2;
    fl.userData={type:'floor'}; this.root.add(fl); this.walls.push(fl);
    this.platforms.push({minX:-W,maxX:W,minZ:-W,maxZ:W,top:0,bottom:-.3,kind:'floor'});
  }
  _inOpening(axis,s,lat,y,m=.3){ return this.openings.some(o=>o.axis===axis&&o.s===s&&lat>o.lat0-m&&lat<o.lat1+m&&y>o.y0-m&&y<o.y1+m); }
  _inBand(y,m=.6){ return LOCK_BANDS.some(b=>y>b.y0-m&&y<b.y1+m); }
  _wallPos(axis,s,lat,y,out){ return axis==='x'?new V3(s*(W-out),y,lat):new V3(lat,y,s*(W-out)); }
  hold(axis,s,lat,y,crumble){
    const m=new THREE.Mesh(axis==='x'?GEO.holdX:GEO.holdZ,crumble?MAT.crumble:MAT.rust);
    m.position.copy(this._wallPos(axis,s,lat,y,.1));
    if(axis==='x') m.rotation.x=this.rand(-.25,.25); else m.rotation.z=this.rand(-.25,.25);
    m.userData={grab:true,type:'hold',crumble:!!crumble,alive:true,wallNormal:axis==='x'?new V3(-s,0,0):new V3(0,0,-s)};
    this.root.add(m); this.grabbables.push(m); return m;
  }
  // linha de agarras sobre uma parede; gaps = agarras omitidas (exigem impulso ou prego)
  path(axis,s,lat0,y0,lat1,y1,o={}){
    const L=Math.hypot(lat1-lat0,y1-y0), n=Math.max(1,Math.ceil(L/(o.step||1.05))), jl=o.jl||.22, jy=o.jy||.1;
    const gaps=new Set(); let tries=0;
    while(gaps.size<(o.gaps||0)&&tries++<60&&n>=5){ const i=2+Math.floor(this.R()*(n-3)); if(!gaps.has(i-1)&&!gaps.has(i+1)) gaps.add(i); }
    let side=1;
    for(let i=0;i<=n;i++){
      if(gaps.has(i)) continue;
      const f=i/n, end=(i===0||i===n);
      const lat=clamp(lerp(lat0,lat1,f)+(end?0:this.rand(-jl,jl)),-3.6,3.6);
      const y=lerp(y0,y1,f)+(end?0:this.rand(-jy,jy));
      if(o.crumbleLine) this.hold(axis,s,lat,y,!end&&this.R()<(o.crumble||0));      // (linhas antigas, à mão: o tijolo que desmorona FAZ parte da linha)
      else {
        this.hold(axis,s,lat,y,false);                                                // a linha é SEMPRE firme e contínua...
        if(!end&&i<n-1&&this.R()<(o.crumble||0)){ side=-side; const f2=(i+.5)/n; this.hold(axis,s,clamp(lerp(lat0,lat1,f2)+side*.55,-3.6,3.6),lerp(y0,y1,f2)+.12,true); }   // ...e o tijolo que desmorona é um EXTRA ao lado (armadilha opcional)
      }
    }
  }
  // soquete de prego: marca na parede onde o prego entra (1 prego + 3 marteladas); fica no meio de cada vão liso
  _socket(axis,s,lat,y){ return this._socketAt(this._wallPos(axis,s,lat,y,0),axis==='x'?new V3(-s,0,0):new V3(0,0,-s)); }
  _socketAt(p,nrm){   // p = ponto na SUPERFÍCIE da parede, nrm = normal para dentro da sala
    const g=new THREE.Group(); g.position.set(p.x+nrm.x*.03,p.y,p.z+nrm.z*.03); g.rotation.y=Math.atan2(nrm.x,nrm.z); this.root.add(g);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.022,6,14),MAT.socket); g.add(ring);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.03,10),MAT.darkLamp); core.rotation.x=Math.PI/2; g.add(core);
    const hit=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.3),IMAT.hidden); g.add(hit);
    const sk=new NailSocket(this,p,nrm,ring); [ring,core,hit].forEach(m=>{ m.userData={type:'socket',interactable:sk}; }); this.interactables.push(ring,core,hit); this.sockets.push({p,n:nrm,sk}); return sk;
  }
  // trecho de subida; com o.blank = comprimento (m) de parede LISA no meio da linha (sem tijolos):
  // ali o jogador precisa de martelo + prego para continuar
  _leg(axis,s,la,ya,lb,yb,o={}){
    if(o.blank){
      const L=Math.hypot(lb-la,yb-ya), f0=o.blankAt||.4, f1=Math.min(.9,f0+o.blank/L);
      const at=f=>[lerp(la,lb,f),lerp(ya,yb,f)];
      const [l0,y0]=at(f0), [l1,y1]=at(f1);
      this.path(axis,s,la,ya,l0,y0,{...o,crumble:0,gaps:0,blank:0}); this.path(axis,s,l1,y1,lb,yb,{...o,crumble:0,gaps:0,blank:0});   // sem tijolos que desmoronam ao lado do vão
      this._socket(axis,s,(l0+l1)/2,(y0+y1)/2);
    } else this.path(axis,s,la,ya,lb,yb,o);
  }
  _block(minX,maxX,minZ,maxZ,bottom,top,o){
    const m=new THREE.Mesh(new THREE.BoxGeometry(maxX-minX,top-bottom,maxZ-minZ),o.mat);
    m.position.set((minX+maxX)/2,(top+bottom)/2,(minZ+maxZ)/2);
    const grab=o.grab!==false;
    const pd={minX,maxX,minZ,maxZ,top,bottom,climbable:grab,kind:o.kind||o.type};
    m.userData={grab,type:o.type,alive:true,plat:pd,solid:pd};
    this.root.add(m); (grab?this.grabbables:this.walls).push(m); this.platforms.push(pd);
    if(o.label) this.checkpoints.push({id:o.id,label:o.label,bonus:500,optional:false,
      position:new V3(m.position.x,top,m.position.z),radius:Math.max(maxX-minX,maxZ-minZ)/2,bounds:pd});
    return pd;
  }
  platform(axis,s,lat,top,o={}){
    const w=o.w||3, d=o.d||1.8; let minX,maxX,minZ,maxZ;
    if(axis==='x'){ if(s>0){minX=W-d;maxX=W;}else{minX=-W;maxX=-W+d;} minZ=lat-w/2; maxZ=lat+w/2; }
    else { if(s>0){minZ=W-d;maxZ=W;}else{minZ=-W;maxZ=-W+d;} minX=lat-w/2; maxX=lat+w/2; }
    return this._block(minX,maxX,minZ,maxZ,top-.3,top,{mat:MAT.metal,type:'ledge',kind:o.kind||'platform',label:o.label,id:o.id});
  }
  beam(dir,c,y){ const h=.11;
    return dir==='x'?this._block(-W,W,c-h,c+h,y-h,y+h,{mat:MAT.beam,type:'beam'}):this._block(c-h,c+h,-W,W,y-h,y+h,{mat:MAT.beam,type:'beam'}); }
  pipe(x,z,y0,y1){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,y1-y0,12),MAT.pipe);
    m.position.set(x,(y0+y1)/2,z); m.userData={grab:true,type:'pipe',alive:true};
    this.root.add(m); this.grabbables.push(m);
    this.platforms.push({minX:x-.16,maxX:x+.16,minZ:z-.16,maxZ:z+.16,top:y1,bottom:y0,climbable:true,kind:'pipe'});
    for(let y=y0+1.5;y<y1;y+=3){ const br=new THREE.Mesh(new THREE.BoxGeometry(.6,.08,.08),MAT.metal); br.position.set(x+.3*Math.sign(x),y,z); this.root.add(br); }
  }
  // ---------- objetos interativos ----------
  box(x,y,z,loot){
    const g=new THREE.Group(); g.position.set(x,y,z); this.root.add(g);
    const body=new THREE.Mesh(new THREE.BoxGeometry(.6,.32,.4),MAT.metal); body.position.y=.16; g.add(body);
    const inner=new THREE.Mesh(new THREE.BoxGeometry(.54,.02,.34),MAT.weight); inner.position.y=.31; g.add(inner);
    const hinge=new THREE.Group(); hinge.position.set(0,.32,.2); g.add(hinge);
    const lid=new THREE.Mesh(new THREE.BoxGeometry(.62,.05,.42),MAT.metal); lid.position.set(0,.025,-.21); hinge.add(lid);
    const crate=new Crate(this,body,hinge,loot);
    body.userData={type:'crate',interactable:crate}; lid.userData={type:'crate',interactable:crate};
    this.interactables.push(body,lid); return crate;
  }
  addPickup(id,count,parent,local){
    const hit=new THREE.Mesh(GEO.pickHit,IMAT.hidden); hit.position.copy(local);
    hit.add(ITEM_DEFS[id].pickup()); parent.add(hit);
    const pk=new Pickup(this,hit,id,count); hit.userData={type:'pickup',interactable:pk};
    this.interactables.push(hit); if(this.raycastTargets) this.raycastTargets.push(hit); return pk;
  }
  detach(mesh){
    const rm=a=>{ const i=a.indexOf(mesh); if(i>=0) a.splice(i,1); };
    rm(this.interactables); rm(this.raycastTargets); rm(this.walls); rm(this.grabbables);
    if(mesh.parent) mesh.parent.remove(mesh);
  }
  removeSolid(mesh){ this.detach(mesh); const pd=mesh.userData.solid; if(pd){ const i=this.platforms.indexOf(pd); if(i>=0) this.platforms.splice(i,1); } }
  note(x,y,z,text){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.32,.42),MAT.paper);
    m.rotation.x=-Math.PI/2; m.rotation.z=this.rand(-.6,.6); m.position.set(x,y+.012,z);
    m.userData={type:'note',interactable:new Note(text)}; this.root.add(m); this.interactables.push(m); return m;
  }
  terminal(x,y,z,face,text){
    const g=new THREE.Group();
    const b=new THREE.Mesh(new THREE.BoxGeometry(.5,.42,.45),MAT.metal); b.position.y=.21; g.add(b);
    const s=new THREE.Mesh(new THREE.PlaneGeometry(.38,.26),new THREE.MeshBasicMaterial({color:0x2c7a34})); s.position.set(0,.24,.226); g.add(s);
    g.position.set(x,y,z); g.rotation.y=face; this.root.add(g);
    const it=new Note(text,true); b.userData={type:'terminal',interactable:it}; s.userData={type:'terminal',interactable:it};
    this.interactables.push(b,s);
  }
  // painel quebrável preenchendo uma abertura. Por padrão a pista é sutil (tom, parafusos, desalinhamento, som oco);
  // com o.mat (ex.: MAT.concreteCracked) a própria textura entrega o painel e o.bolts=false remove os parafusos.
  breakable(opId,o){
    const op=this.openings.find(x=>x.id===opId), s=op.s, mat=o.mat||MAT.concreteAlt;
    const m=this._boxLO(op.axis,op.lat0,op.lat1,s*(W-.015),s*(W+.5),op.y0,op.y1,mat,{type:'breakable',interactable:null,kind:'breakable'});
    if(op.axis==='x') m.rotation.x=.006; else m.rotation.z=.006;
    const n=op.axis==='x'?new V3(-s,0,0):new V3(0,0,-s);
    if(o.bolts!==false) for(const [la,ya] of [[op.lat0+.12,op.y0+.15],[op.lat1-.12,op.y0+.15],[op.lat0+.12,op.y1-.15],[op.lat1-.12,op.y1-.15]]){
      const b=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.03,6),MAT.bolt);
      const wp=op.axis==='x'?new V3(s*(W-.03),ya,la):new V3(la,ya,s*(W-.03));
      b.position.copy(wp).sub(m.position); b.quaternion.setFromUnitVectors(new V3(0,1,0),n); m.add(b);
    }
    const it=new BreakableWall(m,{maxDamage:o.maxDamage,secretId:o.secretId});
    m.userData.interactable=it; m.userData.alive=true; return it;
  }
  alcove(opId,depth=1.7,floorIn=0){
    const op=this.openings.find(x=>x.id===opId), s=op.s, ax=op.axis;
    const oi=s*(W-floorIn), o1=s*(W+.5), oD=s*(W+.5+depth), oE=s*(W+.75+depth), a=op.lat0, b=op.lat1;
    this._boxLO(ax,a-.25,b+.25,oi,oE,op.y0-.3,op.y0,MAT.concrete,{kind:'floor'});
    this._boxLO(ax,a-.25,b+.25,o1,oE,op.y1,op.y1+.3,MAT.concrete);
    this._boxLO(ax,a-.25,a,o1,oE,op.y0,op.y1,MAT.concrete);
    this._boxLO(ax,b,b+.25,o1,oE,op.y0,op.y1,MAT.concrete);
    this._boxLO(ax,a,b,oD,oE,op.y0,op.y1,MAT.concrete);
    const mid=(a+b)/2, oc=s*(W+.5+depth*.55);
    return ax==='x'?new V3(oc,op.y0,mid):new V3(mid,op.y0,oc);
  }
  // sala grande atrás de uma abertura: largura 'width' (lat), pé-direito 'height', profundidade útil 'depth' a partir da face externa do poço
  hall(opId,{depth=10,width=8,height=4}={}){
    const op=this.openings.find(x=>x.id===opId), s=op.s, ax=op.axis, hw=width/2, t=.3;
    const o0=s*(W+.5), o1=s*(W+.5+depth), o2=s*(W+.5+depth+t), y0=op.y0, yt=y0+height, C=MAT.concreteDark, sf=SURFACE.concrete;
    this._boxLO(ax,-hw-t,hw+t,s*W,o2,y0-.3,y0,C,{kind:'floor',interactable:sf});
    this._boxLO(ax,-hw-t,hw+t,o0,o2,yt,yt+.3,C,{interactable:sf,cut:true});
    this._boxLO(ax,-hw-t,-hw,o0,o2,y0,yt+.3,C,{interactable:sf});
    this._boxLO(ax,hw,hw+t,o0,o2,y0,yt+.3,C,{interactable:sf});
    this._boxLO(ax,-hw-t,hw+t,o1,o2,y0,yt+.3,C,{interactable:sf});
    const oc=s*(W+.5+depth/2);
    return {anchor:ax==='x'?new V3(oc,y0,0):new V3(0,y0,oc), zone:{minX:-(W+.5+depth+t),maxX:-(W+.05),minZ:-hw-t,maxZ:hw+t,minY:y0-.4,maxY:yt+.3}};
  }
  revealSecret(id,ctx){
    const sc=this.secrets.find(x=>x.id===id); if(!sc||sc.revealed) return;
    sc.revealed=true; if(sc.onReveal) sc.onReveal(ctx); if(this.onSecretRevealed) this.onSecretRevealed(sc);
  }
  addNail(point,normal){
    const a=new THREE.Mesh(GEO.nailHit,IMAT.hidden);
    a.position.copy(point); a.quaternion.setFromUnitVectors(new V3(0,1,0),normal);
    const vis=makeNail(); a.add(vis);
    const it=new NailAnchor(a,vis);
    a.userData={grab:true,type:'nail',alive:true,crumble:true,crumbleTime:.6,fixed:false,wallNormal:normal.clone(),interactable:it};
    this.root.add(a); this.grabbables.push(a); this.raycastTargets.push(a); return a;
  }
  nearAnchor(p,r){ return this.grabbables.some(m=>{ const t=m.userData.type; return (t==='hold'||t==='nail')&&m.userData.alive!==false&&m.position.distanceTo(p)<r; }); }

  // ---------- subida: gerador de trechos ----------
  // st = {w: parede do RING, dir: +1 anti-horário / -1 horário, lat: lat inicial (null = canto), y: altura do primeiro agarre}
  // n trechos (um por parede) até yEnd (altura do ÚLTIMO agarre, 1.4 m abaixo do topo da plataforma de chegada).
  // o.rests {i:{label,id,note,terminal,loot}} → plataforma de descanso (checkpoint) no fim do trecho i
  // o.gaps(i) → agarras omitidas · o.crumble → prob. de agarra que desmorona · o.blanks [i] → parede lisa (martelo+prego)
  // o.beams k → viga a cada k trechos · o.endLat → lat do último agarre (alinha com a soleira)
  _climb(st,yEnd,n,o={}){
    const rests=o.rests||{}, ws=[]; let sum=0, usable=yEnd-st.y;
    for(let i=0;i<n-1;i++) usable-=rests[i]?3.2:.7;
    for(let i=0;i<n;i++){ const w=.8+.4*this.R(); ws.push(w); sum+=w; }
    let y=st.y;
    for(let i=0;i<n;i++){
      const wall=RING[st.w], last=i===n-1;
      const from=st.lat!=null?st.lat:(st.dir>0?wall.a:wall.b);
      let to=st.dir>0?wall.b:wall.a; if(last&&o.endLat!=null) to=o.endLat;
      const yb=last?yEnd:y+usable*ws[i]/sum;
      const lo={gaps:0,crumble:o.crumble||0,step:CLIMB.step,jl:CLIMB.jitterLat,jy:CLIMB.jitterY};
      const blank=o.blanks&&o.blanks.includes(i);
      if(blank){ lo.blank=CLIMB.blank; lo.blankAt=.4+.1*this.R(); }
      this._leg(wall.axis,wall.s,from,y,to,yb,lo);
      if(o.beams&&!blank&&!rests[i]&&!last&&i%o.beams===o.beams-1){
        const c=clamp((from+to)/2,-2.4,2.4); this.beam(wall.axis==='x'?'x':'z',c,(y+yb)/2+.6);
      }
      if(last) break;
      if(rests[i]){ const T=yb+1.4; this._rest(wall,to,T,rests[i]); y=T+1.8; } else y=yb+.7;
      st.w=(st.w+st.dir+4)%4; st.lat=null;
    }
    return st;
  }
  // plataforma de descanso no canto: checkpoint + caixa/nota/terminal
  _rest(wall,endLat,T,sp={}){
    const sg=Math.sign(endLat)||1, c=endLat-sg*1.25, {axis,s}=wall;
    this.platform(axis,s,c,T,{w:3,d:1.8,label:sp.label,id:sp.id,kind:'rest'});
    const P=(lat,off)=>axis==='x'?new V3(s*(W-off),T,lat):new V3(lat,T,s*(W-off));
    if(sp.loot){ const p=P(c-sg*.6,.75); this.box(p.x,T,p.z,sp.loot); }
    if(sp.note){ const p=P(c+sg*.55,.55); this.note(p.x,T,p.z,sp.note); }
    if(sp.terminal){ const p=P(c,.45), face=axis==='x'?-s*Math.PI/2:(s>0?Math.PI:0); this.terminal(p.x,T,p.z,face,sp.terminal); }
    const wing=WINGS.find(w=>w.after===sp.id); if(wing) this._wing(wall,c,T,{id:wing.id,dress:(fr,I)=>this._dressWing(wing,fr,I)});
  }
  // soleira de um destino: pequena plataforma na parede (axis,s), na altura do piso da sala
  _sill(axis,sd,lat,w,H,note){
    this.platform(axis,sd,lat,H,{w,d:1.0,kind:'sill'});
    if(note){ const p=axis==='x'?new V3(sd*(W-.55),H,lat+(w>2.5?.45:-.3)):new V3(lat+(w>2.5?.45:-.3),H,sd*(W-.55)); this.note(p.x,p.y,p.z,note); }
  }
  // plataforma de saída (10 m acima da soleira)
  _exitPlat(axis,sd,lat,H,label,id,note,loot){
    this.platform(axis,sd,lat,H+10,{w:3,d:1.8,label,id});
    const P=(l,off)=>axis==='x'?new V3(sd*(W-off),H+10,l):new V3(l,H+10,sd*(W-off));
    if(note){ const p=P(lat-.9,.45); this.note(p.x,p.y,p.z,note); }
    if(loot){ const p=P(lat+.7,.9); this.box(p.x,p.y,p.z,loot); }
  }

  // ---------- layout vertical ----------
  _layout(){
    this._start();   // 0–40 m (S0 + bifurcação), desenhado à mão
    const [A,B,C]=HALLS;
    const reg=(cfg,g)=>{ this.halls.push(g); this.puzzleRooms[cfg.id]={id:cfg.id,kind:cfg.kind,baseY:cfg.H,cap:cfg.H-6,zoneRoom:g.zoneRoom,zones:g.zones,refs:g.refs,geo:g,cfg}; this.puzzleDefs.push({id:cfg.id,kind:'hall'}); };

    // ===== SUBIDA 1 · 40–100 m  → DESTINO I: Casa das Bombas (lado leste)
    this._climb({w:0,dir:1,lat:-1.5,y:41.8},A.H-1.4,9,{
      endLat:2.4,crumble:CLIMB.crumble[0],blanks:[4],beams:3,
      rests:{2:{label:'Casa de máquinas',id:'cp3',note:NOTES[60],loot:{nails:3}},
             5:{label:'Sala de controle',id:'cp4',terminal:NOTES[80],loot:{pills:1,nails:2}}}});
    this._sill('x',A.s,1.8*A.m,2.4,A.H,null);
    reg(A,this._foundry(A));
    this._exitPlat('x',A.s,-1.8*A.m,A.H,A.exitLabel,A.exitId,NOTES[A.exitNote],{nails:3});

    // ===== SUBIDA 2 · 110–200 m  → DESTINO II: A Estufa (lado oeste, espelhada)
    this._climb({w:0,dir:1,lat:-1.8,y:A.H+12.9},B.H-1.4,11,{
      endLat:-2.4,crumble:CLIMB.crumble[1],blanks:[5,9],beams:3,
      rests:{3:{label:'Andaime norte',id:'cp6',note:NOTES[150],loot:{nails:3}},
             6:{label:'Galeria de cabos',id:'cp7',note:NOTES[180],loot:{pills:1,nails:3}},
             8:{label:'Mezanino',id:'cp8',loot:{nails:3}}}});
    this._sill('x',B.s,1.8*B.m,2.4,B.H,NOTES[196]);
    reg(B,this._greenhouse(B));
    this._exitPlat('x',B.s,-1.8*B.m,B.H,B.exitLabel,B.exitId,NOTES[B.exitNote],{nails:3});

    // ===== SUBIDA 3 · 210–300 m  → DESTINO III: O Arquivo e o Labirinto (lado norte)
    this._climb({w:2,dir:1,lat:1.8,y:B.H+12.9},C.H-1.4,14,{
      endLat:.6,crumble:CLIMB.crumble[2],blanks:[2,6,10],beams:4,
      rests:{3:{label:'Câmara de válvulas',id:'cp10',note:NOTES[240],loot:{nails:3}},
             7:{label:'Corredor de serviço',id:'cp11',note:NOTES[270],loot:{pills:1,nails:3}},
             10:{label:'Antessala do Arquivo',id:'cp12',loot:{nails:3}}}});
    this._sill('z',-1,0,2.8,MAZE.H,NOTES[296]);
    this._mazeRoom(MAZE);
    this._exitPlat('z',-1,2.4,MAZE.H,'Duto do Arquivo','cp13',NOTES[310],{nails:3,pills:1});

    // ===== SUBIDA 4 · 310–400 m  → fuga até a superfície
    this._climb({w:3,dir:-1,lat:2.4,y:312.9},TOP-1.4,12,{
      endLat:.2,crumble:CLIMB.crumble[3],blanks:[3,6,9],beams:4,
      rests:{2:{label:'Cabine de guincho',id:'cp14',note:NOTES[340],loot:{nails:3}},
             5:{label:'Ponte de inspeção',id:'cp15',note:NOTES[370],loot:{pills:1,nails:3}},
             8:{label:'Último patamar',id:'cp16',loot:{nails:3}}}});
    this._exitDoor();
  }
  // 0–40 m: início, depósito (segredo 1), bifurcação e passarela — sala secreta inicial (segredo 0) atrás do jogador
  _start(){
    // S0 · 0–20 m
    this.box(1.1,0,1.0,{hammer:1,nails:6});
    this.note(1.7,0,-1.3,NOTES[0]);
    this.path('x',1,0,1.9,.6,9.0);
    this.beam('x',.6,10);
    this.path('x',-1,1.4,10.7,1.0,18.6);
    this.platform('x',-1,.5,20,{w:4.4,d:2.2,label:'Depósito',id:'cp1',kind:'rest'});
    this.box(-3.2,20,2.0,{nails:2}); this.note(-3.0,20,-1.0,NOTES[20]);
    // segredo 0: parede de concreto RACHADO atrás do ponto de partida → salão vazio de 10 m de profundidade
    this.breakable('secret0',{maxDamage:4,secretId:'secret0',mat:MAT.concreteCracked,bolts:false});
    const h0=this.hall('secret0',{depth:10,width:8,height:4});
    this.secrets.push({id:'secret0',revealed:false,anchor:h0.anchor,content:null,onReveal:null});
    this.puzzleRooms.secret0={id:'secret0',zoneRoom:h0.zone};   // sem puzzleDef: só vira zona segura contra a massa
    // segredo 1: painel quebrável atrás do depósito → nicho vazio (reservado para um easter egg futuro)
    this.breakable('secret1',{maxDamage:3,secretId:'secret1'});
    this.secrets.push({id:'secret1',revealed:false,anchor:this.alcove('secret1',1.7),content:null,onReveal:null});
    // S1 · 20–40 m: bifurcação
    this.path('x',-1,2.4,21.8,3.55,27.5);
    this.path('z',1,-3.55,28.2,-.3,31.0);
    this.platform('z',1,.2,32,{w:1.4,d:1.0,kind:'rest'});
    this.path('z',1,.9,33.9,3.55,37.0);
    this.path('x',1,3.55,37.6,-.4,38.6);
    this.path('x',-1,-1.2,21.8,-2.2,36.6,{crumble:.45,gaps:1});
    this.platform('x',-1,-3.1,29,{w:.9,d:.9,kind:'cache'}); this.box(-3.6,29,-3.1,{pills:1});
    this.beam('x',-2.4,37.6);
    this.checkpoints.push({id:'atalho',label:'Atalho enferrujado',bonus:750,optional:true,position:new V3(.5,36.0,-2.4),radius:2.0});
    this.platform('x',1,-1.5,40,{w:3.2,d:1.8,label:'Passarela',id:'cp2'});
  }
  _exitDoor(){
    this.platform('x',1,0,TOP,{w:3.2,d:2.2,kind:'exit'});
    const nm=new THREE.Mesh(new THREE.PlaneGeometry(.32,.42),MAT.paper); nm.rotation.x=-Math.PI/2; nm.position.set(W-1.7,TOP+.012,-1.0);
    nm.userData={type:'note',interactable:new LiveNote(()=>NOTES[395]+'\n\n'+(this.route?`Caminho escolhido: ${ENDINGS[this.route].name} (${ENDINGS[this.route].tag}).`:'Você não escolheu nenhum caminho. A porta leva à Fuga.'),false)}; this.root.add(nm); this.interactables.push(nm);
    this.finish={position:new V3(W-1.1,TOP,0),radius:1.3};
    const door=new THREE.Mesh(new THREE.PlaneGeometry(1.2,2.2),new THREE.MeshBasicMaterial({color:0xfff6e0}));
    door.position.set(W-.02,TOP+1.1,0); door.rotation.y=-Math.PI/2; this.root.add(door);
    const dl=new THREE.PointLight(0xfff0d0,2.2,18,1.4); dl.position.set(W-1,TOP+1.5,0); this.root.add(dl); this.finishDoor=door; this.finishLight=dl;
  }

  // ---------- duto vertical + túnel até o poço (compartilhado pelas salas de bombas e pelo labirinto) ----------
  // duto: interior x[x0,x1], profundidade 1.7 a partir do plano frontal zf (para -z), sobe de H a H+12.4;
  // túnel: de zf até o poço (z=-4.5), piso em H+10. roofTop = topo do teto da sala (fecha o vão até o túnel).
  _duct(x0,x1,zf,H,roofTop){
    const C=MAT.concrete, a=x0-.3, b=x1+.3, xc=(x0+x1)/2;
    this._box(a,b,H-.3,H,zf-2,zf,C,{kind:'floor'});
    this._box(a,x0,H,H+12.7,zf-2,zf,C); this._box(x1,b,H,H+12.7,zf-2,zf,C);
    this._box(a,b,H,H+12.7,zf-2,zf-1.7,C); this._box(a,b,H+12.4,H+12.7,zf-2,zf,C);
    this._box(a,b,roofTop,H+9.7,zf,zf+.3,C);
    // agarras na parede do fundo do duto (normal +z)
    for(let y=H+1.9,i=0;y<H+9.2;y+=1.0,i++){
      const m=new THREE.Mesh(GEO.holdZ,MAT.rust); m.position.set(xc+(i%2?.3:-.3)+this.rand(-.08,.08),y,zf-1.6); m.rotation.z=this.rand(-.25,.25);
      m.userData={grab:true,type:'hold',crumble:false,alive:true,wallNormal:new V3(0,0,1)}; this.root.add(m); this.grabbables.push(m);
    }
    // túnel até o poço
    this._block(x0,x1,zf,-4.0,H+9.7,H+10,{mat:MAT.metal,type:'ledge',kind:'tunnel'});
    this._box(a,x0,H+10,H+12.7,zf,-4.5,C); this._box(x1,b,H+10,H+12.7,zf,-4.5,C); this._box(a,b,H+12.4,H+12.7,zf,-4.5,C);
  }

  // ---------- O Labirinto (puzzle difícil, 300 m) ----------
  // Grande sala com paredes internas, entrada pela parede -z do poço. Na antecâmara, uma tela mostra a planta e a rota;
  // quando o jogador chega a < MAZE.near m, uma contagem de MAZE.countdown s começa e a tela apaga PARA SEMPRE.
  // O duto de manutenção de saída fica numa abertura baixa na parede do fundo, sem luz nem placa.
  _mazeRoom(M){
    const H=M.H, cs=M.cell, t=M.wall, h=M.height, halfW=M.cols*cs/2, C=MAT.concreteDark, sf=SURFACE.concrete;
    const zA=-4.5, zG=zA-M.ante, zF=zG-M.rows*cs;                 // face externa do poço · linha da frente da grade · face interna da parede do fundo
    const xb=c=>-halfW+cs*c, zb=r=>zG-cs*r;                         // bordas de coluna / de linha
    const o={interactable:sf};
    // casca da sala
    this._box(-halfW-t,halfW+t,H-.3,H,zF-t,-4.0,C,{kind:'floor',interactable:sf});
    this._box(-halfW-t,halfW+t,H+h,H+h+t,zF-t,-4.0,C,{interactable:sf,cut:true});
    this._box(-halfW-t,-halfW,H,H+h,zF-t,-4.0,C,o); this._box(halfW,halfW+t,H,H+h,zF-t,-4.0,C,o);
    this._box(-halfW-t,-W-.5,H,H+h+t,zA,-4.0,C,o); this._box(W+.5,halfW+t,H,H+h+t,zA,-4.0,C,o);   // fecha a frente ao lado do poço
    // parede do fundo, com a abertura baixa do duto na coluna de saída
    const e0=xb(M.exit), e1=xb(M.exit+1), gapH=2.4;
    this._box(-halfW-t,e0,H,H+h,zF-t,zF,C,o); this._box(e1,halfW+t,H,H+h,zF-t,zF,C,o); this._box(e0,e1,H+gapH,H+h,zF-t,zF,C,o);
    // grade do labirinto
    const grid=mazeGrid(M.cols,M.rows,M.seed,M.straight,M.entrance), route=mazeSolve(grid,M.entrance,M.exit);
    this.maze={grid,route,cfg:M,zG,zF,xb,zb};
    const hRun=(r,c0,c1)=>this._box(xb(c0)-t/2,xb(c1+1)+t/2,H,H+h,zb(r)-t/2,zb(r)+t/2,C,o);          // parede ao longo de x na borda r
    const vRun=(c,r0,r1)=>this._box(xb(c)-t/2,xb(c)+t/2,H,H+h,zb(r1+1)-t/2,zb(r0)+t/2,C,o);          // parede ao longo de z na borda c
    // borda r=0 (frente): tudo fechado, menos a coluna de entrada
    if(M.entrance>0) hRun(0,0,M.entrance-1); if(M.entrance<M.cols-1) hRun(0,M.entrance+1,M.cols-1);
    // bordas internas r=1..rows-1 (N[c][r-1]) em trechos contínuos
    for(let r=1;r<M.rows;r++){ let c=0; while(c<M.cols){ if(!grid.N[c][r-1]){ c++; continue; } let c1=c; while(c1+1<M.cols&&grid.N[c1+1][r-1]) c1++; hRun(r,c,c1); c=c1+1; } }
    // bordas internas c=1..cols-1 (E[c-1][r]) em trechos contínuos
    for(let c=1;c<M.cols;c++){ let r=0; while(r<M.rows){ if(!grid.E[c-1][r]){ r++; continue; } let r1=r; while(r1+1<M.rows&&grid.E[c-1][r1+1]) r1++; vRun(c,r,r1); r=r1+1; } }
    // saídas falsas: grades enferrujadas coladas na parede do fundo (parecem aberturas, não levam a nada)
    for(const c of [1,7]){ if(c===M.exit) continue; const g=new THREE.Mesh(new THREE.PlaneGeometry(1.7,2.2),MAT.grate); g.position.set((xb(c)+xb(c+1))/2,H+1.15,zF+.02); this.root.add(g);
      this._box(xb(c)+.3,xb(c+1)-.3,H,H+.12,zF,zF+.12,MAT.rust,{solid:false,interactable:null,ray:false}); }
    // duto de saída (escondido) + túnel de volta ao poço
    this._duct(e0,e1,zF-t,H,H+h+t);
    // tela da planta, na parede da frente, à esquerda da entrada
    this._mazeScreen(M,H,zG,xb);
    // sala de leitura, cofre, mural, teclado e porta da saída (Destino III)
    const info={grid,route,halfW,zA,zG,zF,xb,zb,e0,e1}; const refs=this._archiveProps(M,info);
    // zonas (a massa não alcança quem está dentro da sala / duto)
    const xc=(e0+e1)/2;
    this.puzzleRooms[M.id]={id:M.id,baseY:H,cap:H-6,
      zoneRoom:{minX:-halfW-t,maxX:halfW+t,minZ:zF-t,maxZ:zA,minY:H-.2,maxY:H+h+.3},
      zoneDuct:{minX:e0-.3,maxX:e1+.3,minZ:zF-t-2.2,maxZ:zA,minY:H-.2,maxY:H+13},
      zoneExit:{minX:e0,maxX:e1,minZ:zF-t-1.8,maxZ:zF-t,minY:H-.2,maxY:H+13},
      triggerZ:zA-.7,duct:{x:xc},kind:'archive',refs,code:info.code,info,cfg:M};
    this.puzzleDefs.push({id:M.id,kind:'hall'});
  }
  _mazeScreen(M,H,zG,xb){
    const w=3.2, hh=1.8, cx=xb(2)+M.cell*.4, cy=H+2.0, cz=zG+M.wall/2+.04;
    // mapa pré-renderizado (planta + rota), orientado como o jogador entra: cima = fundo da sala, direita = +x
    const mapCv=document.createElement('canvas'); mapCv.width=768; mapCv.height=432; this._drawMazeMap(mapCv.getContext('2d'),M);
    const tex=canvasTex(768,432,g=>{ g.fillStyle='#000'; g.fillRect(0,0,768,432); });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,hh),new THREE.MeshBasicMaterial({map:tex}));
    mesh.position.set(cx,cy,cz); this.root.add(mesh);
    this._box(cx-w/2-.12,cx+w/2+.12,cy-hh/2-.12,cy+hh/2+.12,cz-.07,cz-.01,MAT.metal,{solid:false,interactable:null,ray:false});
    const light=new THREE.PointLight(0x7fe08a,1.1,9,1.7); light.position.set(cx,cy,cz+1.4); this.root.add(light);
    // placa de aviso (nota) ao lado da tela
    this.note(cx+w/2+.9,H,zG+1.0,MAZE_TEXT.plate);
    this.mazeScr={state:'wait',t:0,count:M.countdown,near:M.near,hide:M.hideMapUntilNear,mesh,tex,canvas:tex.userData.canvas,ctx:tex.userData.ctx,
      mapCv,light,center:new V3(cx,cy,cz),baseLight:1.1,dirty:true};
    this._paintScreen(this.mazeScr);
  }
  _drawMazeMap(g,M){
    const m=this.maze.grid, route=this.maze.route, cell=44, ox=28, oy=84, hpx=M.rows*cell;
    const X=c=>ox+c*cell, Yp=r=>oy+hpx-r*cell;
    g.fillStyle='#031003'; g.fillRect(0,0,768,432);
    g.fillStyle='#0b2a0f'; g.fillRect(0,0,768,56); g.fillStyle='#7fe08a'; g.font='bold 24px monospace'; g.textAlign='left'; g.textBaseline='middle'; g.fillText(MAZE_TEXT.title,24,28);
    g.strokeStyle='rgba(79,160,90,.12)'; g.lineWidth=1;
    for(let c=0;c<=M.cols;c++){ g.beginPath(); g.moveTo(X(c),Yp(0)); g.lineTo(X(c),Yp(M.rows)); g.stroke(); }
    for(let r=0;r<=M.rows;r++){ g.beginPath(); g.moveTo(X(0),Yp(r)); g.lineTo(X(M.cols),Yp(r)); g.stroke(); }
    // paredes
    g.strokeStyle='#4fa05a'; g.lineWidth=4; g.lineCap='square'; g.beginPath();
    for(let c=0;c<M.cols;c++){
      if(c!==M.entrance){ g.moveTo(X(c),Yp(0)); g.lineTo(X(c+1),Yp(0)); }               // frente
      if(c!==M.exit){ g.moveTo(X(c),Yp(M.rows)); g.lineTo(X(c+1),Yp(M.rows)); }          // fundo
      for(let r=0;r<M.rows-1;r++) if(m.N[c][r]){ g.moveTo(X(c),Yp(r+1)); g.lineTo(X(c+1),Yp(r+1)); }
    }
    for(let r=0;r<M.rows;r++){ g.moveTo(X(0),Yp(r)); g.lineTo(X(0),Yp(r+1)); g.moveTo(X(M.cols),Yp(r)); g.lineTo(X(M.cols),Yp(r+1));
      for(let c=0;c<M.cols-1;c++) if(m.E[c][r]){ g.moveTo(X(c+1),Yp(r)); g.lineTo(X(c+1),Yp(r+1)); } }
    g.stroke();
    // rota de saída
    const px=c=>X(c)+cell/2, py=r=>Yp(r)-cell/2;
    g.save(); g.shadowColor='#46ff6a'; g.shadowBlur=14; g.strokeStyle='#b6ffc0'; g.lineWidth=7; g.lineJoin='round'; g.lineCap='round'; g.beginPath();
    g.moveTo(px(route[0][0]),Yp(0)+cell*.45); route.forEach(([c,r])=>g.lineTo(px(c),py(r))); g.lineTo(px(M.exit),Yp(M.rows)-cell*.45); g.stroke(); g.restore();
    // marcadores
    g.fillStyle='#b6ffc0'; g.font='bold 16px monospace'; g.textAlign='center';
    g.fillText('▲ ENTRADA',px(M.entrance),Yp(0)+cell*.62);
    g.fillStyle='#ffd24a'; g.fillText('SAÍDA',px(M.exit),Yp(M.rows)-cell*.62);
    g.fillStyle='#ffd24a'; g.beginPath(); g.arc(px(M.exit),Yp(M.rows)-cell*.3,6,0,Math.PI*2); g.fill();
    // legenda
    g.textAlign='left'; g.font='15px monospace'; g.fillStyle='#4fa05a';
    g.fillText('─ PAREDE',470,306); g.fillStyle='#b6ffc0'; g.fillText('━ '+MAZE_TEXT.legend[1],470,330); g.fillStyle='#ffd24a'; g.fillText('● '+MAZE_TEXT.legend[2],470,354);
  }
  _paintScreen(S,mode){
    const g=S.ctx, w=S.canvas.width, h=S.canvas.height;
    if(S.state==='off'){ g.fillStyle='#000'; g.fillRect(0,0,w,h); S.tex.needsUpdate=true; return; }
    if(S.state==='wait'&&S.hide){
      g.fillStyle='#031003'; g.fillRect(0,0,w,h); g.fillStyle='#0b2a0f'; g.fillRect(0,0,w,56);
      g.textAlign='center'; g.textBaseline='middle'; g.fillStyle='#4fa05a';
      MAZE_TEXT.standby.forEach((s,i)=>{ g.font=(i===0?'bold 30px':'22px')+' monospace'; g.fillText(s,w/2,120+i*52); });
      S.tex.needsUpdate=true; return;
    }
    g.drawImage(S.mapCv,0,0);
    const t=S.state==='count'?S.t:0, left=Math.max(0,S.count-t), p=S.state==='wait'?0:t/S.count;
    g.textAlign='center'; g.textBaseline='middle';
    g.fillStyle='#7fe08a'; g.font='bold 18px monospace'; g.fillText(({wait:'LEITURA PRONTA',preview:'MODO ESPECTADOR'})[S.state]||'LEITURA ÚNICA',596,88);
    if(S.state==='count'){
      g.fillStyle=left<1.01?'#ff6a5a':'#9bffa8'; g.font='bold 170px monospace'; g.fillText(String(Math.max(1,Math.ceil(left))),596,200);
      g.fillStyle='#17361b'; g.fillRect(470,282,252,14); g.fillStyle=left<1.01?'#ff6a5a':'#7fe08a'; g.fillRect(470,282,252*(left/S.count),14);
      // chuvisco crescente + tremor de linha
      const nz=.04+.7*p*p; g.fillStyle='#bfffc8';
      for(let i=0;i<Math.floor(nz*140);i++){ g.globalAlpha=Math.random()*.5; g.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*(60*nz),1+Math.random()*2); }
      g.globalAlpha=1; if(Math.random()<nz*.5){ const y=Math.random()*h; g.drawImage(S.canvas,0,y,w,10,(Math.random()-.5)*24,y,w,10); }
    }
    S.tex.needsUpdate=true;
  }
  _paintGlitch(S,k){
    const g=S.ctx, w=S.canvas.width, h=S.canvas.height;
    for(let i=0;i<60;i++){ g.fillStyle=Math.random()<.5?'#9bffa8':(Math.random()<.5?'#000':'#2c7a34'); g.globalAlpha=.4+Math.random()*.6;
      g.fillRect(Math.random()*w,Math.random()*h,20+Math.random()*w*.6,2+Math.random()*10); }
    g.globalAlpha=1; const sq=h*(1-k)*.5; g.fillStyle='#000'; g.fillRect(0,0,w,sq); g.fillRect(0,h-sq,w,sq);   // colapso estilo CRT
    S.tex.needsUpdate=true;
  }
  _updateMaze(dt,player){
    const S=this.mazeScr; if(!S||S.state==='off'||S.state==='preview') return;
    let pos; if(player&&player.position) pos=new V3(player.position.x,player.position.y+EYE,player.position.z);
    else { if(!this._cam) this._cam=this.scene.children.find(o=>o.isCamera); if(!this._cam) return; pos=this._cam.position; }
    if(S.state==='wait'){
      if(pos.distanceTo(S.center)<S.near){ S.state='count'; S.t=0; this._paintScreen(S); if(this.onMazeEvent) this.onMazeEvent('countdown'); }
      return;
    }
    S.t+=dt;
    if(S.state==='count'){
      S.light.intensity=S.baseLight*(1-.5*Math.random()*(S.t/S.count));
      if(S.t>=S.count){ S.state='glitch'; S.t=0; } else this._paintScreen(S);
    }
    if(S.state==='glitch'){
      if(S.t>=.45){ S.state='off'; S.mesh.material.color.setHex(0x000000); S.light.intensity=0; this._paintScreen(S); if(this.onMazeEvent) this.onMazeEvent('dark'); }
      else { S.light.intensity=S.baseLight*Math.random(); this._paintGlitch(S,S.t/.45); }
    }
  }

  // rota escolhida (seal|commune|witness): cor das lâmpadas do poço e da porta final
  setRoute(route){
    this.route=route; const col={seal:0xbfd8ff,commune:0x9bffb0,witness:0xffe0a0}[route]; if(!col) return;
    this.tint={seal:[.75,.9,1.35],commune:[.7,1.25,.8],witness:[1.05,.95,.6]}[route]; this.tintColor=col;     // a atmosfera aplica o tom a cada quadro
    if(this.finishDoor) this.finishDoor.material.color.setHex(col); if(this.finishLight) this.finishLight.color.setHex(col);
  }
  // ---------- modo espectador (ver js/systems/SpectatorMode.js) ----------
  // paredes do poço, tetos das salas e do salão secreto viram vidro fantasma para enxergar o interior por fora
  setCutaway(on){
    if(!this._ghostMat) this._ghostMat=new THREE.MeshBasicMaterial({color:0x7f93a8,transparent:true,opacity:.09,depthWrite:false,fog:false});
    for(const m of this.cutaway){
      if(on){ if(!m.userData.origMat) m.userData.origMat=m.material; m.material=this._ghostMat; }
      else if(m.userData.origMat){ m.material=m.userData.origMat; m.userData.origMat=null; }
    }
  }
  // linha verde no chão do labirinto: entrada → rota → duto de saída
  setRouteGuide(on){
    if(!this.maze) return;
    if(!this._routeGuide){
      const {route,cfg:M,zG,zF,xb,zb}=this.maze, g=new THREE.Group(), mat=new THREE.MeshBasicMaterial({color:0x46ff6a,fog:false});
      const seg=(x0,z0,x1,z1)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1-x0)+.3,.05,Math.abs(z1-z0)+.3),mat); m.position.set((x0+x1)/2,M.H+.06,(z0+z1)/2); g.add(m); };
      const cx=c=>(xb(c)+xb(c+1))/2, cz=r=>(zb(r)+zb(r+1))/2;
      const pts=[[cx(M.entrance),zG+1.8],...route.map(([c,r])=>[cx(c),cz(r)]),[cx(M.exit),zF-1.2]];
      for(let i=1;i<pts.length;i++) seg(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);
      this.root.add(g); this._routeGuide=g;
    }
    this._routeGuide.visible=!!on;
  }
  // etiquetas flutuantes (sempre visíveis, mesmo atrás de paredes) com o nome/altura de cada parte do mapa + régua de altura a cada 25 m
  _label(lines,x,y,z,o={}){
    const col=o.color||'#e8c15a', w=512, h=128;
    const t=canvasTex(w,h,g=>{ g.fillStyle='rgba(8,10,14,.82)'; g.fillRect(0,0,w,h); g.strokeStyle=col; g.lineWidth=6; g.strokeRect(3,3,w-6,h-6);
      g.textAlign='center'; g.textBaseline='middle'; g.fillStyle=col; g.font=`bold ${lines.length>1?44:56}px sans-serif`; g.fillText(lines[0],w/2,lines.length>1?44:64);
      if(lines[1]){ g.fillStyle='#d8d2c4'; g.font='30px sans-serif'; g.fillText(lines[1],w/2,95); } });
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,depthWrite:false,transparent:true,fog:false}));
    s.position.set(x,y,z); s.scale.set(o.w||10,(o.w||10)/4,1); s.renderOrder=999; return s;
  }
  setLabels(on){
    if(!this._labels){
      const g=new THREE.Group(), add=(...a)=>g.add(this._label(...a));
      add(['INÍCIO (0 m)','spawn do jogador'],0,3.2,0,{color:'#7fe08a'});
      for(const c of this.checkpoints) add([c.label||c.id,c.position.y.toFixed(0)+' m'+(c.optional?' · opcional':'')],c.position.x,c.position.y+1.6,c.position.z,{w:8});
      for(const h of this.halls){ if(!h.cfg||h.kind==='archive') continue; const c=h.fr.p((h.uN+h.uF)/2,h.H+h.h+3,0); add([h.cfg.name.toUpperCase(),`${h.H} m · ${h.cfg.tag} · final ${ENDINGS[h.cfg.route].name}`],c.x,c.y,c.z,{color:'#ff9a5a',w:14}); }
      for(const wg of WINGS){ const r=this.puzzleRooms[wg.id]; if(!r) continue; const z=r.zoneRoom; add([wg.name,'ramal opcional'],(z.minX+z.maxX)/2,z.maxY+1.2,(z.minZ+z.maxZ)/2,{color:'#c9a227',w:7}); }
      add(['O ARQUIVO + LABIRINTO',`${MAZE.H} m · MEMÓRIA · final ${ENDINGS.witness.name}`],0,MAZE.H+11,-17,{color:'#ff9a5a',w:14});
      if(this.maze){ const {zF,xb}=this.maze, M=this.maze.cfg; add(['Saída oculta (duto)','fundo do labirinto'],(xb(M.exit)+xb(M.exit+1))/2,M.H+3.4,zF+1.2,{color:'#7fe08a',w:8});
        add(['Tela da planta','mostra a rota por 3 s'],this.mazeScr?this.mazeScr.center.x:-5,M.H+4.2,-8.8,{color:'#7fe08a',w:8}); }
      for(const b of LOCK_BANDS) add(['TRECHO SELADO (chapa)',`${b.y0.toFixed(1)} – ${b.y1.toFixed(1)} m · só pela sala`],0,(b.y0+b.y1)/2,0,{color:'#ff5a5a',w:10});
      for(const s of this.secrets) add([s.id==='secret0'?'SALA SECRETA (0 m)':'Nicho secreto (20 m)',s.id==='secret0'?'parede rachada · martelo · 10 m de fundo':'vazio · easter egg'],s.anchor.x,s.anchor.y+2.6,s.anchor.z,{color:'#c28aff',w:9});
      if(this.finish) add(['PORTA DE SAÍDA',TOP+' m'],this.finish.position.x-1,this.finish.position.y+3,this.finish.position.z,{color:'#7fe08a'});
      for(let y=25;y<=TOP;y+=25) add([y+' m'],7.5,y,7.5,{color:'#6ec6ff',w:4});   // régua de altura
      this.root.add(g); this._labels=g;
    }
    this._labels.visible=!!on;
  }
  // com o espectador ligado a tela do labirinto mostra a planta e NÃO inicia a contagem
  setSpectator(on){
    const S=this.mazeScr; if(!S) return;
    if(on&&S.state==='wait'){ S.state='preview'; this._paintScreen(S); }
    else if(!on&&S.state==='preview'){ S.state='wait'; this._paintScreen(S); }
  }

  _scatter(){
    for(const [a,s] of [['x',1],['x',-1],['z',1],['z',-1]])
      for(let y=2.5;y<TOP-2;y+=.9){
        if(this._inBand(y,.8)) continue;                       // trechos selados: nenhuma agarra solta
        if(this.R()<lerp(.12,.05,y/TOP)){ const lat=this.rand(-3.3,3.3); if(!this._inOpening(a,s,lat,y,.4)){ const hm=this.hold(a,s,lat,y,this.R()<lerp(CLIMB.scatterCrumble[0],CLIMB.scatterCrumble[1],y/TOP)); hm.userData.extra=true; } }
      }
  }
  _lamps(){
    for(let y=4,i=0;y<TOP+2;y+=7,i++){
      const sz=i%2?1:-1, x=this.rand(-2.5,2.5);
      if(y>MAZE.H-5&&y<MAZE.H+14) continue;                    // o Labirinto é escuro: sem lâmpadas por perto (a luz do poço vaza pela parede)
      if(this._inOpening('z',sz,x,y,.7)) continue;
      const mat=new THREE.MeshBasicMaterial({color:0xfff2c8});
      const m=new THREE.Mesh(GEO.lamp,mat); m.position.set(x,y,sz*(W-.07)); this.root.add(m);
      const dead=this.R()<lerp(.1,.8,clamp(y/TOP,0,1));        // quanto mais alto, mais lâmpadas mortas
      this.lamps.push({mat,pos:new V3(x,y-.1,sz*(W-.5)),phase:this.R()*100,broken:!dead&&this.R()<.3,dead,k:dead?0:1});
    }
  }
  // ---------- runtime ----------
  touch(o){ const u=o.userData; if(u.crumble&&u.crumbleT==null){ u.crumbleT=u.crumbleTime||1.2; this.crumbling.push(o); } }
  update(dt,player){
    for(let i=this.crumbling.length-1;i>=0;i--){
      const o=this.crumbling[i], u=o.userData;
      if(u.alive){
        u.crumbleT-=dt; o.position.x+=(Math.random()-.5)*.004; o.position.z+=(Math.random()-.5)*.004;
        if(u.crumbleT<=0){ u.alive=false; u.vy=0; if(this.onCrumble) this.onCrumble(o); }
      } else { u.vy-=G*dt; o.position.y+=u.vy*dt; if(u.vy<-40){ this.root.remove(o); this.crumbling.splice(i,1); } }
    }
    if(this.animated.length) this.animated=this.animated.filter(a=>a.update(dt));
    if(this.mazeScr) this._updateMaze(dt,player);
  }
}
