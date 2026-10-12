'use strict';
// ============================================================================
// js/world/World.js — o silo: poço cilíndrico de 400 m, superfícies agarráveis e contratos de nível
// Contrato público: world.platforms (sólidos: caixa, caixa girada ou setor anelar — ver Collision.js)
//                   world.checkpoints [{id,label,bonus,optional,position,radius,bounds?}]
//                   world.finish {position,radius}   world.spawnPoint (pés)
// Extras: world.raycastTargets, world.lamps, world.interactables, guard() (parede do poço), wind() (ventiladores),
//   touch(), update(); world.puzzleDefs / world.puzzleRooms → PuzzleSystem e Game._zones();
//   world.onCrumble, world.onSecretRevealed, world.onMazeEvent('countdown'|'dark') → ganchos opcionais do Game
//
// O poço é um CILINDRO de raio SHAFT_R: a parede é feita de setores anelares (uma faixa por trecho de altura e por
// quadrante, recortada nas aberturas), as agarras ficam na superfície curva com a normal apontando para o eixo, e a
// subida gerada é uma espiral pela parede. Coordenadas polares: θ = atan2(z, x) (leste 0, sul π/2, oeste π, norte −π/2).
// Layout vertical: ver o cabeçalho de levelData.js.
// ============================================================================

// ---------- malha de um setor anelar (casca grossa) ----------
// faces curvas interna/externa, topo, base e as duas faces radiais. UV de mundo: faces curvas → (arco, y);
// topo/base → (x, −z); faces radiais → (r, y) — o desenho continua entre setores vizinhos, como o worldUV das caixas.
// A orientação de cada triângulo é conferida contra a normal desejada (o raycast usa a face para pregos e martelo).
const ARC_TILE=new Map([[MAT.liner,[2.4,2.4]],[MAT.grate,[8,8]],[MAT.foundry,[4.5,4]],[MAT.paperWall,[2,2]],[MAT.metal,[2,2]]]);
const arcTile=mat=>(mat.userData&&mat.userData.tile)||ARC_TILE.get(mat)||[2,2];
function arcGeometry(A,y0,y1,tile,segs=72){
  const {cx,cz,r0,r1,a0,span}=A, full=span>=TAU-1e-6, n=Math.max(1,Math.ceil(span/(TAU/segs))), ym=(y0+y1)/2;
  const tu=tile[0], tv=tile[1]||tile[0], ou=tile[2]||0, ov=tile[3]||0, P=[],N=[],U=[];
  const put=q=>{ P.push(q[0]-cx,q[1]-ym,q[2]-cz); N.push(q[3],q[4],q[5]); U.push(q[6]/tu+ou,q[7]/tv+ov); };
  const quad=(a,b,c,d)=>{
    const e1x=b[0]-a[0],e1y=b[1]-a[1],e1z=b[2]-a[2], e2x=c[0]-a[0],e2y=c[1]-a[1],e2z=c[2]-a[2];
    const nx=e1y*e2z-e1z*e2y, ny=e1z*e2x-e1x*e2z, nz=e1x*e2y-e1y*e2x;
    if(nx*a[3]+ny*a[4]+nz*a[5]>=0){ put(a); put(b); put(c); put(a); put(c); put(d); } else { put(a); put(c); put(b); put(a); put(d); put(c); }
  };
  const wall=(r,t,y,sg)=>{ const c=Math.cos(t), s=Math.sin(t); return [cx+r*c,y,cz+r*s,sg*c,0,sg*s,r*t,y]; };
  const flat=(r,t,y,ny)=>{ const x=cx+r*Math.cos(t), z=cz+r*Math.sin(t); return [x,y,z,0,ny,0,x,-z]; };
  for(let i=0;i<n;i++){
    const t0=a0+span*i/n, t1=a0+span*(i+1)/n;
    if(r0>1e-4) quad(wall(r0,t0,y0,-1),wall(r0,t1,y0,-1),wall(r0,t1,y1,-1),wall(r0,t0,y1,-1));
    quad(wall(r1,t0,y0,1),wall(r1,t1,y0,1),wall(r1,t1,y1,1),wall(r1,t0,y1,1));
    quad(flat(r0,t0,y1,1),flat(r1,t0,y1,1),flat(r1,t1,y1,1),flat(r0,t1,y1,1));
    quad(flat(r0,t0,y0,-1),flat(r1,t0,y0,-1),flat(r1,t1,y0,-1),flat(r0,t1,y0,-1));
  }
  if(!full){
    const end=(t,sg)=>{ const nx=sg*Math.sin(t), nz=-sg*Math.cos(t), q=(r,y)=>[cx+r*Math.cos(t),y,cz+r*Math.sin(t),nx,0,nz,r,y];
      quad(q(r0,y0),q(r1,y0),q(r1,y1),q(r0,y1)); };
    end(a0,1); end(a0+span,-1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
  return g;
}
// ângulo de um ponto do trecho inicial desenhado à mão (0–40 m): as quatro "paredes" antigas viraram quadrantes do
// cilindro; lat em metros a partir do centro de cada quadrante (±4 m ↔ ±45°, os cantos antigos coincidem)
const wallA=(w,lat)=>w==='E'?lat*Math.PI/16:w==='S'?Math.PI/2-lat*Math.PI/16:w==='W'?Math.PI-lat*Math.PI/16:-Math.PI/2+lat*Math.PI/16;
const REST_PAD=.5/SHAFT_R;   // depois de um descanso, o trecho seguinte começa meio metro adiante na parede

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
  constructor(scene){ this.scene=scene; this.TOP=TOP; this.root=null; this.onCrumble=null; this.onSecretRevealed=null; this.onMazeEvent=null; this.build(); }
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
    this.animated=[]; this.movers=[]; this.fans=[]; this.secrets=[]; this.puzzleRooms={}; this.puzzleDefs=[];
    this.maze=null; this.mazeScr=null; this._cam=null; this.cutaway=[]; this._routeGuide=null; this._labels=null;
    this.openings=OPENINGS.map(o=>this._opening(o)); this.shellSegs=[]; this.sockets=[]; this.halls=[]; this.route=null; this.finishLight=null; this.finishDoor=null;
    this.spawnPoint=new V3(0,0,0); this.spawnYaw=-Math.PI/2;
    this._layout(); this._shell(); this._scatter(); this._lamps();
    this.raycastTargets=[...this.walls,...this.grabbables,...this.interactables];
  }
  // ---------- aberturas (polares) ----------
  _opening(o){
    if(o.theta!=null) return {...o,a0:o.theta+Math.asin(clamp(o.v0/SHAFT_R,-1,1)),a1:o.theta+Math.asin(clamp(o.v1/SHAFT_R,-1,1))};
    return {...o,a0:o.a-o.w/(2*SHAFT_R),a1:o.a+o.w/(2*SHAFT_R)};
  }
  _op(id){ return this.openings.find(o=>o.id===id); }
  _opA(id){ const o=this._op(id); return (o.a0+o.a1)/2; }
  // referencial local de uma direção θ: u = distância ao eixo do poço, v = lateral (sentido de θ crescente).
  // Direções cardeais dão sólidos alinhados (caixas); as demais, caixas giradas.
  _fr(theta){
    const c0=Math.cos(theta), s0=Math.sin(theta), rc=Math.round(c0), rs=Math.round(s0), aligned=Math.abs(c0-rc)<1e-9&&Math.abs(s0-rs)<1e-9;
    const C=aligned?rc:c0, S=aligned?rs:s0;
    return {theta,c:C,s:S,aligned,
      p:(u,y,v)=>new V3(u*C-v*S,y,u*S+v*C),
      box:(u0,u1,v0,v1)=>{ const xs=[u0*C-v0*S,u1*C-v0*S,u0*C-v1*S,u1*C-v1*S], zs=[u0*S+v0*C,u1*S+v0*C,u0*S+v1*C,u1*S+v1*C]; return [Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)]; },
      yaw:(du,dv)=>Math.atan2(du*C-dv*S,du*S+dv*C),      // faz o +z do objeto olhar para a direção local (du,dv)
      n:(nu,nv)=>new V3(nu*C-nv*S,0,nu*S+nv*C)           // normal local → mundo
    };
  }
  // ---------- primitivas ----------
  _solidData(m,pd,mat,o){
    const nail=mat===MAT.concrete||!!(mat.userData&&mat.userData.nailable);   // concreto, tijolo e pedra: aceitam prego
    m.userData={type:o.type||'wall',interactable:o.interactable===undefined?(nail?SURFACE.concrete:null):o.interactable};
    (o.parent||this.root).add(m);
    if(o.cut) this.cutaway.push(m);                  // candidatos a 'parede fantasma' no modo espectador
    if(o.ray!==false) this.walls.push(m);
    if(o.solid!==false){ pd.kind=o.kind||'wall'; if(o.flat) pd.flat=true; if(o.porous) pd.porous=true; this.platforms.push(pd); m.userData.solid=pd; }
    return m;
  }
  _box(minX,maxX,minY,maxY,minZ,maxZ,mat,o={}){
    const w=maxX-minX,h=maxY-minY,d=maxZ-minZ, geo=new THREE.BoxGeometry(w,h,d);
    if(mat.userData&&mat.userData.tile) worldUV(geo,(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2,mat.userData.tile); else if(UVSCALE_MATS.has(mat)) scaleUV(geo,w,h,d);
    const m=new THREE.Mesh(geo,mat); m.position.set((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);
    return this._solidData(m,{minX,maxX,minZ,maxZ,top:maxY,bottom:minY},mat,o);
  }
  // caixa girada: centro (cx,cz), meias medidas hx (eixo local x = direção yaw) e hz
  _obox(cx,cz,hx,hz,yaw,y0,y1,mat,o={}){
    const geo=new THREE.BoxGeometry(2*hx,y1-y0,2*hz);
    if(mat.userData&&mat.userData.tile) worldUV(geo,0,(y0+y1)/2,0,mat.userData.tile); else if(UVSCALE_MATS.has(mat)) scaleUV(geo,2*hx,y1-y0,2*hz);
    const m=new THREE.Mesh(geo,mat); m.position.set(cx,(y0+y1)/2,cz); m.rotation.y=-yaw;
    const O={cx,cz,c:Math.cos(yaw),s:Math.sin(yaw),hx,hz};
    return this._solidData(m,{...obbBounds(O),top:y1,bottom:y0,obb:O},mat,o);
  }
  // setor anelar: A = {cx,cz,r0,r1,a0,span}; centro padrão = eixo do poço
  _arc(A,y0,y1,mat,o={}){
    const arc={cx:A.cx||0,cz:A.cz||0,r0:Math.max(0,A.r0),r1:A.r1,a0:A.a0,span:Math.min(TAU,A.span)};
    const m=new THREE.Mesh(arcGeometry(arc,y0,y1,arcTile(mat),o.segs),mat); m.position.set(arc.cx,(y0+y1)/2,arc.cz);
    return this._solidData(m,{...arcBounds(arc),top:y1,bottom:y0,arc},mat,o);
  }
  // sólido agarrável (borda, viga, passarela): mantle por cima. Forma: caixa (x/z), girada (o.obb) ou anel (o.arc)
  _grabSolid(m,pd,o){
    const grab=o.grab!==false; pd.climbable=grab; pd.kind=o.kind||o.type; if(o.flat) pd.flat=true; if(o.porous) pd.porous=true;
    m.userData={grab,type:o.type,alive:true,plat:pd,solid:pd};
    this.root.add(m); (grab?this.grabbables:this.walls).push(m); this.platforms.push(pd);
    if(o.label){ const c=pd.arc?polar((pd.arc.r0+pd.arc.r1)/2,pd.arc.a0+pd.arc.span/2,pd.top).add(new V3(pd.arc.cx,0,pd.arc.cz)):new V3((pd.minX+pd.maxX)/2,pd.top,(pd.minZ+pd.maxZ)/2);
      const rad=pd.arc?Math.max(pd.arc.span*(pd.arc.r0+pd.arc.r1)/2,pd.arc.r1-pd.arc.r0)/2:Math.max(pd.maxX-pd.minX,pd.maxZ-pd.minZ)/2;
      this.checkpoints.push({id:o.id,label:o.label,bonus:500,optional:false,position:c,radius:rad,bounds:pd}); }
    return pd;
  }
  _block(minX,maxX,minZ,maxZ,bottom,top,o){
    const geo=new THREE.BoxGeometry(maxX-minX,top-bottom,maxZ-minZ), m=new THREE.Mesh(geo,o.mat);
    m.position.set((minX+maxX)/2,(top+bottom)/2,(minZ+maxZ)/2);
    if(o.mat.userData&&o.mat.userData.tile) worldUV(geo,m.position.x,m.position.y,m.position.z,o.mat.userData.tile);
    return this._grabSolid(m,{minX,maxX,minZ,maxZ,top,bottom},o);
  }
  _oblock(cx,cz,hx,hz,yaw,bottom,top,o){
    const geo=new THREE.BoxGeometry(2*hx,top-bottom,2*hz), m=new THREE.Mesh(geo,o.mat); m.position.set(cx,(top+bottom)/2,cz); m.rotation.y=-yaw;
    if(o.mat.userData&&o.mat.userData.tile) worldUV(geo,0,m.position.y,0,o.mat.userData.tile);
    const O={cx,cz,c:Math.cos(yaw),s:Math.sin(yaw),hx,hz};
    return this._grabSolid(m,{...obbBounds(O),top,bottom,obb:O},o);
  }
  _arcBlock(A,bottom,top,o){
    const arc={cx:A.cx||0,cz:A.cz||0,r0:Math.max(0,A.r0),r1:A.r1,a0:A.a0,span:Math.min(TAU,A.span)};
    const m=new THREE.Mesh(arcGeometry(arc,bottom,top,arcTile(o.mat),o.segs),o.mat); m.position.set(arc.cx,(top+bottom)/2,arc.cz);
    return this._grabSolid(m,{...arcBounds(arc),top,bottom,arc},o);
  }
  // caixas descritas num referencial local (fr = _fr(θ)): alinhadas nas direções cardeais, giradas nas demais
  _fb(fr,u0,u1,v0,v1,y0,y1,mat,o={}){
    if(fr.aligned){ const [x0,x1,z0,z1]=fr.box(u0,u1,v0,v1); return this._box(x0,x1,y0,y1,z0,z1,mat,o); }
    const c=fr.p((u0+u1)/2,0,(v0+v1)/2); return this._obox(c.x,c.z,Math.abs(u1-u0)/2,Math.abs(v1-v0)/2,fr.theta,y0,y1,mat,o);
  }
  _fblock(fr,u0,u1,v0,v1,bottom,top,o){
    if(fr.aligned){ const [x0,x1,z0,z1]=fr.box(u0,u1,v0,v1); return this._block(x0,x1,z0,z1,bottom,top,o); }
    const c=fr.p((u0+u1)/2,0,(v0+v1)/2); return this._oblock(c.x,c.z,Math.abs(u1-u0)/2,Math.abs(v1-v0)/2,fr.theta,bottom,top,o);
  }
  _fmesh(fr,geo,mat,u,y,v,yawDu,yawDv,parent){ const m=new THREE.Mesh(geo,mat); m.position.copy(fr.p(u,y,v)); if(yawDu!=null) m.rotation.y=fr.yaw(yawDu,yawDv); (parent||this.root).add(m); return m; }

  // ---------- parede do poço ----------
  // Uma faixa por trecho de altura (quebras nas aberturas, nas bandas seladas e nas fases de acabamento) e por quadrante,
  // recortada nas aberturas. Nas bandas seladas a parede vira CHAPA DE CONTENÇÃO: sem prego (interactable nulo) e sem
  // agarras. Cada pedaço sólido fica registrado em shellSegs (a trava final do cilindro, guard(), usa).
  _shell(){
    const ys=new Set([-30,TOP+30]); this.openings.forEach(o=>{ ys.add(o.y0); ys.add(o.y1); }); LOCK_BANDS.forEach(b=>{ ys.add(b.y0); ys.add(b.y1); });
    SHELL_FINISH.forEach(f=>{ ys.add(f.y); if(f.band) ys.add(f.y+SHELL_BAND); });
    const Y=[...ys].sort((p,q)=>p-q);
    // as faixas que continuam iguais (mesmo quadrante, mesmo material, mesmo recorte) viram uma peça só: menos chamadas de
    // desenho, mesma colisão (a UV de mundo não muda)
    const open=new Map(), pieces=[], mats=new Map(), matId=m=>{ if(!mats.has(m)) mats.set(m,mats.size); return mats.get(m); };
    const piece=(key,a0,span,ya,yb,mat,porous)=>{ const last=open.get(key); if(last&&Math.abs(last.y1-ya)<1e-9) last.y1=yb; else { const p={a0,span,y0:ya,y1:yb,mat,porous}; open.set(key,p); pieces.push(p); } };
    for(let i=0;i<Y.length-1;i++){
      const ya=Y[i], yb=Y[i+1]; if(yb-ya<1e-6) continue; const mid=(ya+yb)/2, band=this._inBand(mid,0);
      const here=this.openings.filter(o=>mid>o.y0&&mid<o.y1);
      for(let q=0;q<4;q++){
        const q0=-Math.PI/4+q*Math.PI/2, mat=band?MAT.liner:this._wallMat(q,mid);
        for(const [s0,s1] of this._subtract(q0,Math.PI/2,here)) piece(`${q}|${s0.toFixed(6)}|${s1.toFixed(6)}|${matId(mat)}`,q0+s0,s1-s0,ya,yb,mat,false);
      }
      for(const o of here) if(o.grate) piece('grade|'+o.id,o.a0,o.a1-o.a0,ya,yb,MAT.grate,true);   // janela de grade: sólida, deixa o ar passar
    }
    for(const p of pieces) this._shellArc(p.a0,p.span,p.y0,p.y1,p.mat,p.porous);
    // piso de grade do fundo do poço
    this._arc({r0:0,r1:SHAFT_R+.05,a0:0,span:TAU},-.3,0,MAT.grate,{kind:'floor',flat:true,porous:true,interactable:null});
    // nervuras de aço nas juntas dos quadrantes (só visual): orientam o olhar num poço sem cantos; uma peça por trecho contínuo
    for(let q=0;q<4;q++){ const a=Math.PI/4+q*Math.PI/2, p=polar(SHAFT_R-.04,a); let y0=null;
      for(let i=0;i<Y.length;i++){ const cut=i===Y.length-1||this._inOpening(a,(Y[i]+Y[i+1])/2,.3);
        if(!cut&&y0==null) y0=Y[i];
        if(cut&&y0!=null){ this._obox(p.x,p.z,.05,.13,a,y0,Y[i],MAT.metal,{solid:false,ray:false}); y0=null; } } }
    // casca externa do silo (vista de fora, no modo espectador): tudo o que existe fica dentro dela
    const outer=new THREE.Mesh(new THREE.CylinderGeometry(SILO_R,SILO_R,TOP+60,64,1,true),new THREE.MeshStandardMaterial({color:0x6d6a64,roughness:.95}));
    outer.position.y=TOP/2; this.root.add(outer); this.cutaway.push(outer);
    const roof=new THREE.Mesh(new THREE.RingGeometry(SHAFT_R+SHELL_T,SILO_R,64,1),outer.material); roof.rotation.x=-Math.PI/2; roof.position.y=TOP+30; this.root.add(roof); this.cutaway.push(roof);
  }
  _shellArc(a0,span,y0,y1,mat,porous){
    this._arc({r0:SHAFT_R,r1:SHAFT_R+SHELL_T,a0,span},y0,y1,mat,{cut:true,porous,segs:72});
    this.shellSegs.push({a0,span,y0,y1});
  }
  // trechos de [0, Q] (a partir de q0) que nenhuma abertura cobre
  _subtract(q0,Q,ops){
    let segs=[[0,Q]];
    for(const o of ops){ const w=o.a1-o.a0, d=wrap2(o.a0-q0);
      for(const s of [d,d-TAU]){ const e=s+w; segs=segs.flatMap(([a,b])=>(e<=a||s>=b)?[[a,b]]:[[a,Math.max(a,s)],[Math.min(b,e),b]].filter(([x,y])=>y-x>1e-4)); } }
    return segs;
  }
  _quad(a){ return Math.floor(wrap2(a+Math.PI/4)/(Math.PI/2))%4; }
  // acabamento da parede do poço no quadrante q e na altura y — SHELL_FINISH (levelData.js)
  _wallMat(q,y){
    let f=SHELL_FINISH[0]; for(const k of SHELL_FINISH) if(y>=k.y) f=k;
    return f.band&&y<f.y+SHELL_BAND?MAT.concreteBand:(FINISH[f.mats[q]]||MAT.concrete);
  }
  _inOpening(a,y,m=.3){ const da=m/SHAFT_R; return this.openings.some(o=>wrap2(a-(o.a0-da))<=o.a1-o.a0+2*da&&y>o.y0-m&&y<o.y1+m); }
  _inBand(y,m=.6){ return LOCK_BANDS.some(b=>y>b.y0-m&&y<b.y1+m); }
  // há parede do poço (sólida) no ângulo a, em alguma parte da altura do corpo [y, y+BODY_H]?
  _shellAt(a,y){ const y0=y+.05, y1=y+BODY_H-.05; return this.shellSegs.some(s=>s.y0<y1&&s.y1>y0&&wrap2(a-s.a0)<=s.span); }
  // TRAVA DO CILINDRO (chamada pelo jogador depois da colisão): quem estava dentro do poço não sai pela parede, e quem
  // estava fora não entra por ela — só pelas aberturas. Nenhuma sequência de empurrões atravessa a parede curva.
  guard(p,prev,v){
    const r=Math.hypot(p.x,p.z), rp=Math.hypot(prev.x,prev.z), IN=SHAFT_R-RAD, OUT=SHAFT_R+SHELL_T+RAD;
    if(rp<SHAFT_R&&r>IN+1e-4&&this._shellAt(Math.atan2(p.z,p.x),p.y)){
      const ux=p.x/r, uz=p.z/r; p.x=ux*IN; p.z=uz*IN; const vn=v.x*ux+v.z*uz; if(vn>0){ v.x-=vn*ux; v.z-=vn*uz; }
    } else if(rp>SHAFT_R+SHELL_T&&r<OUT-1e-4&&r>1e-6&&this._shellAt(Math.atan2(p.z,p.x),p.y)){
      const ux=p.x/r, uz=p.z/r; p.x=ux*OUT; p.z=uz*OUT; const vn=v.x*ux+v.z*uz; if(vn<0){ v.x-=vn*ux; v.z-=vn*uz; }
    }
  }

  // ---------- agarras na parede curva ----------
  hold(a,y,crumble){
    const m=new THREE.Mesh(GEO.holdX,crumble?MAT.crumble:MAT.holdBrick);
    m.position.copy(polar(SHAFT_R-.1,a,y)); m.rotation.order='YXZ'; m.rotation.set(this.rand(-.25,.25),-a,0);   // eixo longo tangente à parede
    m.userData={grab:true,type:'hold',crumble:!!crumble,alive:true,wallNormal:new V3(-Math.cos(a),0,-Math.sin(a))};
    this.root.add(m); this.grabbables.push(m); return m;
  }
  // linha de agarras sobre a parede, de (a0,y0) a (a1,y1); gaps = agarras omitidas (exigem impulso ou prego)
  path(a0,y0,a1,y1,o={}){
    const R=SHAFT_R, L=Math.hypot(R*(a1-a0),y1-y0), n=Math.max(1,Math.ceil(L/(o.step||1.05))), jl=(o.jl||.22)/R, jy=o.jy||.1;
    const gaps=new Set(); let tries=0;
    while(gaps.size<(o.gaps||0)&&tries++<60&&n>=5){ const i=2+Math.floor(this.R()*(n-3)); if(!gaps.has(i-1)&&!gaps.has(i+1)) gaps.add(i); }
    let side=1;
    for(let i=0;i<=n;i++){
      if(gaps.has(i)) continue;
      const f=i/n, end=(i===0||i===n);
      const a=lerp(a0,a1,f)+(end?0:this.rand(-jl,jl)), y=lerp(y0,y1,f)+(end?0:this.rand(-jy,jy));
      if(o.crumbleLine) this.hold(a,y,!end&&this.R()<(o.crumble||0));      // (linhas antigas, à mão: o tijolo que desmorona FAZ parte da linha)
      else {
        this.hold(a,y,false);                                               // a linha é SEMPRE firme e contínua...
        if(!end&&i<n-1&&this.R()<(o.crumble||0)){ side=-side; const f2=(i+.5)/n; this.hold(lerp(a0,a1,f2)+side*.55/R,lerp(y0,y1,f2)+.12,true); }   // ...e o tijolo que desmorona é um EXTRA ao lado (armadilha opcional)
      }
    }
  }
  // soquete de prego: marca na parede onde o prego entra (1 prego + 3 marteladas); fica no meio de cada vão liso
  _socket(a,y){ return this._socketAt(polar(SHAFT_R,a,y),new V3(-Math.cos(a),0,-Math.sin(a))); }
  _socketAt(p,nrm){   // p = ponto na SUPERFÍCIE da parede, nrm = normal para dentro da sala
    const g=new THREE.Group(); g.position.set(p.x+nrm.x*.03,p.y,p.z+nrm.z*.03); g.rotation.y=Math.atan2(nrm.x,nrm.z); this.root.add(g);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.022,6,14),MAT.socket); g.add(ring);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.03,10),MAT.darkLamp); core.rotation.x=Math.PI/2; g.add(core);
    const hit=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.3),IMAT.hidden); g.add(hit);
    const sk=new NailSocket(this,p,nrm,ring); [ring,core,hit].forEach(m=>{ m.userData={type:'socket',interactable:sk}; }); this.interactables.push(ring,core,hit); this.sockets.push({p,n:nrm,sk}); return sk;
  }
  // trecho de subida; com o.blank = comprimento (m) de parede LISA no meio da linha (sem tijolos):
  // ali o jogador precisa de martelo + prego para continuar
  _leg(a0,y0,a1,y1,o={}){
    if(o.blank){
      const L=Math.hypot(SHAFT_R*(a1-a0),y1-y0), f0=o.blankAt||.4, f1=Math.min(.9,f0+o.blank/L);
      const at=f=>[lerp(a0,a1,f),lerp(y0,y1,f)], [b0,c0]=at(f0), [b1,c1]=at(f1);
      this.path(a0,y0,b0,c0,{...o,crumble:0,gaps:0,blank:0}); this.path(b1,c1,a1,y1,{...o,crumble:0,gaps:0,blank:0});   // sem tijolos que desmoronam ao lado do vão
      this._socket((b0+b1)/2,(c0+c1)/2);
    } else this.path(a0,y0,a1,y1,o);
  }
  // borda curva presa à parede do poço: centro angular aC, largura w (m, medida na parede), profundidade d, topo top
  _ledge(aC,w,d,top,o={}){
    const span=w/SHAFT_R;
    return this._arcBlock({r0:SHAFT_R-d,r1:SHAFT_R+.02,a0:aC-span/2,span},top-.3,top,{mat:o.mat||(o.kind==='rest'?MAT.woodDeck:MAT.metal),type:'ledge',kind:o.kind||'platform',label:o.label,id:o.id,flat:true});
  }
  // viga radial que cruza o poço inteiro (diâmetro) na direção a; agarrável e dá para subir nela
  beamA(a,y){ const h=.11; return this._oblock(0,0,SHAFT_R+.25,h,a,y-h,y+h,{mat:MAT.beam,type:'beam'}); }
  // viga numa corda paralela a x (dir 'x', a z = c) ou a z (dir 'z', a x = c) — trecho inicial
  beam(dir,c,y){ const h=.11, L=Math.sqrt(Math.max(0,SHAFT_R*SHAFT_R-c*c))+.25;
    return dir==='x'?this._block(-L,L,c-h,c+h,y-h,y+h,{mat:MAT.beam,type:'beam'}):this._block(c-h,c+h,-L,L,y-h,y+h,{mat:MAT.beam,type:'beam'}); }
  pipe(x,z,y0,y1){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,y1-y0,12),MAT.pipe);
    m.position.set(x,(y0+y1)/2,z); m.userData={grab:true,type:'pipe',alive:true};
    this.root.add(m); this.grabbables.push(m);
    this.platforms.push({minX:x-.16,maxX:x+.16,minZ:z-.16,maxZ:z+.16,top:y1,bottom:y0,climbable:true,kind:'pipe'});
    const r=Math.hypot(x,z)||1;
    for(let y=y0+1.5;y<y1;y+=3){ const br=new THREE.Mesh(new THREE.BoxGeometry(.6,.08,.08),MAT.metal); br.position.set(x+.3*x/r,y,z+.3*z/r); br.rotation.y=-Math.atan2(z,x); this.root.add(br); }
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
  // painel quebrável preenchendo uma abertura da parede curva. Por padrão a pista é sutil (o acabamento da parede em volta
  // num tom um pouco mais quente, parafusos, desalinhamento, som oco); com o.mat (ex.: MAT.concreteCracked) a própria
  // textura entrega o painel, o.bolts=false remove os parafusos e o.flush deixa o painel rente à parede.
  breakable(opId,o){
    const op=this._op(opId), mid=(op.y0+op.y1)/2, mat=o.mat||altOf(this._wallMat(this._quad((op.a0+op.a1)/2),mid));
    const m=this._arc({r0:SHAFT_R+(o.flush?.002:.015),r1:SHAFT_R+SHELL_T,a0:op.a0,span:op.a1-op.a0},op.y0,op.y1,mat,{type:'breakable',interactable:null,kind:'breakable'});
    if(!o.flush) m.rotation.y=.004;                      // desalinhado de leve
    if(o.bolts!==false){ const pad=.12/SHAFT_R;
      for(const [a,y] of [[op.a0+pad,op.y0+.15],[op.a1-pad,op.y0+.15],[op.a0+pad,op.y1-.15],[op.a1-pad,op.y1-.15]]){
        const b=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.03,6),MAT.bolt), n=new V3(-Math.cos(a),0,-Math.sin(a));
        b.position.copy(polar(SHAFT_R-.015,a,y)).sub(m.position); b.quaternion.setFromUnitVectors(new V3(0,1,0),n); m.add(b);
      } }
    const it=new BreakableWall(m,{maxDamage:o.maxDamage,secretId:o.secretId});
    m.userData.interactable=it; m.userData.alive=true; return it;
  }
  // nicho atrás de uma abertura (direção cardeal da abertura)
  alcove(opId,depth=1.7){
    const op=this._op(opId), fr=this._fr(op.theta), C=this._wallMat(this._quad(op.theta),(op.y0+op.y1)/2), a=op.v0, b=op.v1;
    const u0=SHAFT_R+.02, u1=SHAFT_R+SHELL_T, uD=u1+depth, uE=uD+.25;
    this._fb(fr,u0,uE,a-.25,b+.25,op.y0-.3,op.y0-.003,C,{kind:'floor',flat:true});
    this._fb(fr,u1-.3,uE,a-.25,b+.25,op.y1,op.y1+.3,C);
    this._fb(fr,u1-.3,uE,a-.25,a,op.y0,op.y1,C); this._fb(fr,u1-.3,uE,b,b+.25,op.y0,op.y1,C);
    this._fb(fr,uD,uE,a,b,op.y0,op.y1,C);
    return fr.p(u1+depth*.55,op.y0,(a+b)/2);
  }
  // sala grande atrás de uma abertura: largura 'width', pé-direito 'height', profundidade útil 'depth' a partir da face
  // externa do poço. A frente é reta: entre ela e a parede curva fica concreto maciço (paredes de fechamento ao lado da abertura).
  hall(opId,{depth=10,width=8,height=4}={}){
    const op=this._op(opId), fr=this._fr(op.theta), hw=width/2, t=.3, y0=op.y0, yt=y0+height, C=MAT.concreteDark, sf=SURFACE.concrete;
    const u0=SHAFT_R+SHELL_T, u1=u0+depth, u2=u1+t;
    this._fb(fr,SHAFT_R+.02,u2,-hw-t,hw+t,y0-.3,y0-.003,C,{kind:'floor',interactable:sf,flat:true});
    this._fb(fr,u0-.3,u2,-hw-t,hw+t,yt,yt+.3,C,{interactable:sf,cut:true});
    this._fb(fr,u0-.3,u0,-hw-t,op.v0,y0,yt,C,{interactable:sf}); this._fb(fr,u0-.3,u0,op.v1,hw+t,y0,yt,C,{interactable:sf});   // frente, dos lados da abertura
    this._fb(fr,u0,u1,-hw-t,-hw,y0,yt+.3,C,{interactable:sf}); this._fb(fr,u0,u1,hw,hw+t,y0,yt+.3,C,{interactable:sf});
    this._fb(fr,u1,u2,-hw-t,hw+t,y0,yt+.3,C,{interactable:sf});
    const [x0,x1,z0,z1]=fr.box(u0-.4,u2,-hw-t,hw+t);
    return {anchor:fr.p(u0+depth/2,y0,0), zone:{minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:y0-.4,maxY:yt+.3}};
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
  // diafragma de grade: disco que fecha o poço inteiro (sólido, não agarrável, sem prego; o ar e o olhar passam)
  _diaphragm(y){
    this._arc({r0:0,r1:SHAFT_R+.06,a0:0,span:TAU},y,y+.3,MAT.grate,{kind:'diaphragm',flat:true,porous:true,interactable:null});
    this._arc({r0:SHAFT_R-.35,r1:SHAFT_R,a0:0,span:TAU},y-.28,y+.02,MAT.metal,{solid:false,ray:false,segs:48});
    for(let k=0;k<4;k++) this._obox(0,0,SHAFT_R-.05,.07,k*Math.PI/4,y-.26,y-.01,MAT.metal,{solid:false,ray:false});
  }

  // ---------- subida: gerador de trechos em espiral ----------
  // st = {a: ângulo inicial, y: altura do primeiro agarre, dir?: +1 (θ crescente: leste → sul → oeste → norte) / −1, pad?: recuo
  // inicial na parede (m→rad)}. n trechos até yEnd (altura do ÚLTIMO agarre, 1,4 m abaixo do topo da plataforma de chegada).
  // Cada trecho gira CLIMB.sweep em volta do poço; com o.endA a espiral fecha exatamente nesse ângulo (soleira, plataforma de
  // destino) — sem dir, escolhe o sentido em que os trechos ficam mais perto do tamanho nominal (nem voltas extras, nem paredões retos).
  // o.rests {i:{label,id,note,terminal,loot,bridge}} → plataforma de descanso (checkpoint) no fim do trecho i
  // o.crumble → prob. de agarra extra que desmorona · o.blanks [i] → parede lisa (martelo+prego) · o.beams k → viga a cada k trechos
  _climb(st,yEnd,n,o={}){
    const rests=o.rests||{}, ws=[], sw=[]; let usable=yEnd-st.y, wsum=0, ssum=0, pads=0;
    for(let i=0;i<n-1;i++){ usable-=rests[i]?3.2:.7; if(rests[i]) pads+=REST_PAD; }
    for(let i=0;i<n;i++){ const w=.8+.4*this.R(); ws.push(w); wsum+=w; const s=lerp(CLIMB.sweep[0],CLIMB.sweep[1],this.R()); sw.push(s); ssum+=s; }
    let dir=st.dir;
    if(o.endA!=null){
      const fit=d=>{ const a0=st.a+d*(st.pad||0), base=wrap2((o.endA-a0)*d), k=Math.max(0,Math.round((ssum+pads-base)/TAU)); return (base+k*TAU-pads)/ssum; };
      const bad=f=>f>.25?Math.abs(Math.log(f)):Infinity;
      if(dir==null) dir=bad(fit(1))<=bad(fit(-1))?1:-1;
      const f=fit(dir); for(let i=0;i<n;i++) sw[i]*=f;
    }
    dir=st.dir=dir||1;
    let a=st.a+dir*(st.pad||0), y=st.y;
    for(let i=0;i<n;i++){
      const last=i===n-1, b=a+st.dir*sw[i], yb=last?yEnd:y+usable*ws[i]/wsum;
      const lo={gaps:0,crumble:o.crumble||0,step:CLIMB.step,jl:CLIMB.jitterLat,jy:CLIMB.jitterY};
      const blank=o.blanks&&o.blanks.includes(i);
      if(blank){ lo.blank=CLIMB.blank; lo.blankAt=.4+.1*this.R(); }
      this._leg(a,y,b,yb,lo);
      if(o.beams&&!blank&&!rests[i]&&!last&&i%o.beams===o.beams-1) this.beamA((a+b)/2,(y+yb)/2+.6);
      if(last){ a=b; break; }
      if(rests[i]){ const T=yb+1.4; this._rest(b,dir,T,rests[i]); a=b+dir*REST_PAD; y=T+1.8; } else { a=b; y=yb+.7; }
    }
    st.a=a; return st;
  }
  // plataforma de descanso junto à parede, terminando logo depois do último agarre do trecho: checkpoint + caixa/nota/terminal
  _rest(aEnd,dir,T,sp={}){
    const c=aEnd-dir*1.25/SHAFT_R, P=(lat,off)=>polar(SHAFT_R-off,c+lat/SHAFT_R,T);
    this._ledge(c,3,1.8,T,{label:sp.label,id:sp.id,kind:'rest'});
    if(sp.loot){ const p=P(-dir*.6,.75); this.box(p.x,T,p.z,sp.loot); }
    if(sp.note){ const p=P(dir*.55,.55); this.note(p.x,T,p.z,sp.note); }
    if(sp.terminal){ const p=P(0,.45); this.terminal(p.x,T,p.z,Math.atan2(-Math.cos(c),-Math.sin(c)),sp.terminal); }
    if(sp.bridge) this._bridge(c,T);
    const wing=WINGS.find(w=>w.after===sp.id); if(wing) this._wingA(c,T,{id:wing.id,finish:wing.finish,dress:(fr,I)=>this._dressWing(wing,fr,I)});
  }
  // ponte de inspeção: passarela reta que cruza o poço pelo diâmetro, do descanso até a parede oposta
  _bridge(a,T){
    this._oblock(0,0,SHAFT_R,.6,a,T-.3,T,{mat:MAT.grate,type:'ledge',kind:'bridge',flat:true,porous:true});
    for(const sg of [-1,1]){ const p=polar(.62,a+sg*Math.PI/2); this._obox(p.x,p.z,SHAFT_R-.2,.03,a,T+1.0,T+1.06,MAT.metal,{solid:false,ray:false}); }
  }
  // soleira de uma ala: borda curta na parede, na altura do piso da sala, diante da abertura
  _sill(a,w,H,note){
    this._ledge(a,w,1.0,H,{kind:'sill'});
    if(note){ const p=polar(SHAFT_R-.55,a+(w>2.5?.45:-.3)/SHAFT_R,H); this.note(p.x,p.y,p.z,note); }
  }
  // plataforma de saída de uma ala (dez metros acima da soleira, já acima do trecho selado)
  _exitPlat(a,top,label,id,note,loot){
    this._ledge(a,3,1.8,top,{label,id});
    const P=(lat,off)=>polar(SHAFT_R-off,a+lat/SHAFT_R,top);
    if(note){ const p=P(-.9,.45); this.note(p.x,p.y,p.z,note); }
    if(loot){ const p=P(.7,.9); this.box(p.x,p.y,p.z,loot); }
  }

  // ---------- layout vertical ----------
  _layout(){
    this._start();   // 0–40 m (S0 + bifurcação + passarela anelar), desenhado à mão
    const [A,B]=HALLS;
    const reg=(cfg,g)=>{ this.halls.push(g); this.puzzleRooms[cfg.id]={id:cfg.id,kind:cfg.kind,baseY:cfg.H,cap:cfg.H-6,zoneRoom:g.zoneRoom,zones:g.zones,refs:g.refs,geo:g,cfg,parent:cfg.hub||null}; this.puzzleDefs.push({id:cfg.id,kind:'hall'}); };

    // ===== SUBIDA 1 · 40–100 m → I: Casa das Bombas (leste)
    this._climb({a:wallA('E',-1.5),y:41.8},A.H-1.4,9,{endA:this._opA('h1_in'),crumble:CLIMB.crumble[0],blanks:[4],beams:3,
      rests:{2:{label:'Casa de máquinas',id:'cp3',note:NOTES[60],loot:{nails:3}},
             5:{label:'Sala de controle',id:'cp4',terminal:NOTES[80],loot:{pills:1,nails:2}}}});
    this._sill(this._opA('h1_in'),2.4,A.H,null);
    this._diaphragm(DIAPHRAGMS[0]);
    reg(A,this._foundry(A));
    this._exitPlat(this._opA('h1_out'),A.H+10,A.exitLabel,A.exitId,NOTES[A.exitNote],{nails:3});

    // ===== SUBIDA 2 · 113–150 m → boca da galeria do exaustor (o vento começa a puxar perto do fim)
    this._climb({a:this._opA('h1_out'),y:A.H+12.9},EXHAUST.H-1.4,6,{endA:EXHAUST.entryA,crumble:CLIMB.crumble[1],blanks:[4],beams:3,
      rests:{2:{label:'Andaime norte',id:'cp6',note:NOTES[130],loot:{nails:3}}}});
    this._exhaust(EXHAUST);

    // ===== SUBIDA 2b · 177–200 m → II: Pátio das Máquinas (entrada pelo norte)
    this._climb({a:this._opA('ex174_out'),y:EXHAUST.top+2.9},HUB.H-1.4,4,{endA:this._opA('p200_in'),crumble:CLIMB.crumble[1],blanks:[2],beams:3,
      rests:{1:{label:'Mezanino',id:'cp8',note:NOTES[186],loot:{pills:1,nails:3}}}});
    this._sill(this._opA('p200_in'),2.4,HUB.H,NOTES[196]);
    this._diaphragm(DIAPHRAGMS[1]);
    this._hub(HUB,B,reg);

    // ===== SUBIDA 3a · 227–246 m → insuflador
    this._climb({a:this._opA('p200_out'),y:HUB.elevator.top+2.9},INSUF.grateTop-1.4,4,{endA:INSUF.a-.7,crumble:CLIMB.crumble[2],blanks:[1],beams:3});   // chega por baixo do alçapão da grade
    this._insuflador(INSUF);

    // ===== SUBIDA 3b · 253–300 m → III: o Arquivo e o Labirinto (norte)
    this._climb({a:INSUF.a,y:INSUF.ledge.top+2.9},MAZE.H-1.4,8,{endA:this._opA('mz300_in'),crumble:CLIMB.crumble[2],blanks:[3,6],beams:4,
      rests:{2:{label:'Corredor de serviço',id:'cp11',note:NOTES[270],loot:{pills:1,nails:3}},
             5:{label:'Antessala do Arquivo',id:'cp12',note:NOTES[240],loot:{nails:3}}}});
    this._sill(this._opA('mz300_in'),2.8,MAZE.H,NOTES[296]);
    this._diaphragm(DIAPHRAGMS[2]);
    this._mazeRoom(MAZE);
    this._exitPlat(this._opA('mz300_out'),MAZE.H+10,'Duto do Arquivo','cp13',NOTES[310],{nails:3,pills:1});

    // ===== SUBIDA 4 · 313–400 m → fuga até a superfície
    this._climb({a:this._opA('mz300_out'),y:312.9},TOP-1.4,12,{endA:wallA('E',.2),crumble:CLIMB.crumble[3],blanks:[3,6,9],beams:4,
      rests:{2:{label:'Cabine de guincho',id:'cp14',note:NOTES[340],loot:{nails:3}},
             5:{label:'Ponte de inspeção',id:'cp15',note:NOTES[370],loot:{pills:1,nails:3},bridge:true},
             8:{label:'Último patamar',id:'cp16',loot:{nails:3}}}});
    this._exitDoor();
  }
  // 0–40 m: início, depósito (segredo 1), bifurcação e passarela anelar — sala secreta inicial (segredo 0) atrás do jogador
  _start(){
    // S0 · 0–20 m
    this.box(1.1,0,1.0,{hammer:1,nails:6});
    this.note(1.7,0,-1.3,NOTES[0]);
    this.path(wallA('E',0),1.9,wallA('E',.6),9.0);
    this.beam('x',.6,10);
    this.path(wallA('W',1.4),10.7,wallA('W',1.0),18.6);
    this._ledge(wallA('W',.5),4.4,2.2,20,{label:'Depósito',id:'cp1',kind:'rest'});
    { const p=polar(5.2,wallA('W',2.0),20); this.box(p.x,20,p.z,{nails:2}); const q=polar(5.0,wallA('W',-1.0),20); this.note(q.x,20,q.z,NOTES[20]); }
    // segredo 0: parede de concreto RACHADO atrás do ponto de partida → salão vazio de 10 m de profundidade.
    // O painel é o mesmo concreto da parede em volta (mesma escala e UV), com uma trinca natural desenhada (TEXGEN.crackOver)
    this.breakable('secret0',{maxDamage:4,secretId:'secret0',mat:MAT.concreteCracked,bolts:false,flush:true});
    const h0=this.hall('secret0',{depth:10,width:8,height:4});
    this.secrets.push({id:'secret0',revealed:false,anchor:h0.anchor,content:null,onReveal:null});
    this.puzzleRooms.secret0={id:'secret0',zoneRoom:h0.zone};   // sem puzzleDef: só vira zona segura contra a massa
    // segredo 1: painel quebrável atrás do depósito → nicho vazio (reservado para um easter egg futuro)
    this.breakable('secret1',{maxDamage:3,secretId:'secret1'});
    this.secrets.push({id:'secret1',revealed:false,anchor:this.alcove('secret1',1.7),content:null,onReveal:null});
    // S1 · 20–40 m: bifurcação (oeste → sul → leste) e o atalho enferrujado (oeste, tijolos que desmoronam)
    this.path(wallA('W',2.4),21.8,wallA('W',3.55),27.5);
    this.path(wallA('S',-3.55),28.2,wallA('S',-.3),31.0);
    this._ledge(wallA('S',.2),1.4,1.0,32,{kind:'rest'});
    this.path(wallA('S',.9),33.9,wallA('S',3.55),37.0);
    this.path(wallA('E',3.55),37.6,wallA('E',-.4),38.6);
    this.path(wallA('W',-1.2),21.8,wallA('W',-2.2),36.6,{crumble:.45,gaps:1});
    this._ledge(wallA('W',-3.1),.9,.9,29,{kind:'cache'}); { const p=polar(5.55,wallA('W',-3.1),29); this.box(p.x,29,p.z,{pills:1}); }
    this.beam('x',-2.4,37.6);
    this.checkpoints.push({id:'atalho',label:'Atalho enferrujado',bonus:750,optional:true,position:new V3(.5,36.0,-2.4),radius:2.0});
    // passarela anelar: contorna o poço inteiro a 40 m (dá para dar a volta completa sem tocar a parede)
    this._arcBlock({r0:SHAFT_R-1.2,r1:SHAFT_R+.02,a0:0,span:TAU},39.7,40,{mat:MAT.grate,type:'ledge',kind:'platform',label:'Passarela',id:'cp2',flat:true,porous:true});
    for(let k=0;k<12;k++){ const a=k*TAU/12, p=polar(SHAFT_R-1.17,a); this._obox(p.x,p.z,.025,.025,a,40,41,MAT.metal,{solid:false,ray:false}); }
    this._arc({r0:SHAFT_R-1.2,r1:SHAFT_R-1.14,a0:0,span:TAU},40.98,41.04,MAT.metal,{solid:false,ray:false,segs:48});
  }
  _exitDoor(){
    const a=0;
    this._ledge(a,3.2,2.2,TOP,{kind:'exit'});
    const nm=new THREE.Mesh(new THREE.PlaneGeometry(.32,.42),MAT.paper); nm.rotation.x=-Math.PI/2; nm.position.set(SHAFT_R-1.7,TOP+.012,-1.0);
    nm.userData={type:'note',interactable:new LiveNote(()=>NOTES[395]+'\n\n'+(this.route?`Caminho escolhido: ${ENDINGS[this.route].name} (${ENDINGS[this.route].tag}).`:'Você não escolheu nenhum caminho. A porta leva à Fuga.'),false)}; this.root.add(nm); this.interactables.push(nm);
    this.finish={position:new V3(SHAFT_R-1.1,TOP,0),radius:1.3};
    const door=new THREE.Mesh(new THREE.PlaneGeometry(1.2,2.2),new THREE.MeshBasicMaterial({color:0xfff6e0}));
    door.position.set(SHAFT_R-.02,TOP+1.1,0); door.rotation.y=-Math.PI/2; this.root.add(door);
    const dl=new THREE.PointLight(0xfff0d0,2.2,18,1.4); dl.position.set(SHAFT_R-1,TOP+1.5,0); this.root.add(dl); this.finishDoor=door; this.finishLight=dl;
  }

  // ---------- duto vertical + túnel até o poço (saída do labirinto) ----------
  // duto: interior x[x0,x1], profundidade 1.7 a partir do plano frontal zf (para -z), sobe de H a H+12.4;
  // túnel: de zf até a parede curva do poço, piso em H+10. roofTop = topo do teto da sala (fecha o vão até o túnel).
  _duct(x0,x1,zf,H,roofTop){
    const C=MAT.concrete, a=x0-.3, b=x1+.3, xc=(x0+x1)/2, zIn=x=>-Math.sqrt(Math.max(0,SHAFT_R*SHAFT_R-x*x));   // face interna do poço em x
    this._box(a,b,H-.3,H,zf-2,zf,C,{kind:'floor',flat:true});
    this._box(a,x0,H,H+12.7,zf-2,zf,C); this._box(x1,b,H,H+12.7,zf-2,zf,C);
    this._box(a,b,H,H+12.7,zf-2,zf-1.7,C); this._box(a,b,H+12.4,H+12.7,zf-2,zf,C);
    this._box(a,b,roofTop,H+9.7,zf,zf+.3,C);
    // agarras na parede do fundo do duto (normal +z)
    for(let y=H+1.9,i=0;y<H+9.2;y+=1.0,i++){
      const m=new THREE.Mesh(GEO.holdZ,MAT.holdBrick); m.position.set(xc+(i%2?.3:-.3)+this.rand(-.08,.08),y,zf-1.6); m.rotation.z=this.rand(-.25,.25);
      m.userData={grab:true,type:'hold',crumble:false,alive:true,wallNormal:new V3(0,0,1)}; this.root.add(m); this.grabbables.push(m);
    }
    // túnel até o poço: cada peça termina na face interna da parede curva medida no |x| mais perto do eixo (nunca
    // invade o poço); o teto vai em faixas para acompanhar a curva. O piso entra embaixo da plataforma de saída.
    const near=(p,q)=>p<=0&&q>=0?0:Math.min(Math.abs(p),Math.abs(q));
    this._block(x0,x1,zf,zIn(Math.max(Math.abs(x0),Math.abs(x1))),H+9.7,H+9.995,{mat:MAT.metal,type:'ledge',kind:'tunnel',flat:true});
    this._box(a,x0,H+10,H+12.7,zf,zIn(near(a,x0)),C); this._box(x1,b,H+10,H+12.7,zf,zIn(near(x1,b)),C);
    const n=Math.ceil((b-a)/.6); for(let i=0;i<n;i++){ const s0=a+(b-a)*i/n, s1=a+(b-a)*(i+1)/n; this._box(s0,s1,H+12.4,H+12.7,zf,zIn(near(s0,s1)),C); }
  }

  // ---------- O Labirinto (puzzle difícil, 300 m) ----------
  // Grande sala com paredes internas, ligada ao poço (norte) por um braço reto curto. Na antecâmara, uma tela mostra a
  // planta e a rota; quando o jogador chega a < MAZE.near m, uma contagem de MAZE.countdown s começa e a tela apaga PARA
  // SEMPRE. O duto de manutenção de saída fica numa abertura baixa na parede do fundo, sem luz nem placa.
  _mazeRoom(M){
    const H=M.H, cs=M.cell, t=M.wall, h=M.height, halfW=M.cols*cs/2, C=MAT.stoneDark, sf=SURFACE.concrete;   // labirinto de pedra antiga
    const zA=-(SHAFT_R+SHELL_T+M.arm), zG=zA-M.ante, zF=zG-M.rows*cs;      // frente da sala · linha da frente da grade · face interna da parede do fundo
    const xb=c=>-halfW+cs*c, zb=r=>zG-cs*r;                                  // bordas de coluna / de linha
    const o={interactable:sf}, zIn=-Math.sqrt(SHAFT_R*SHAFT_R-1.2*1.2);
    // casca da sala (a frente fica em z ∈ [zA, zA+t], com a porta do braço)
    this._box(-halfW-t,halfW+t,H-.3,H,zF-t,zA+t,C,{kind:'floor',interactable:sf,flat:true});
    this._box(-halfW-t,halfW+t,H+h,H+h+t,zF-t,zA+t,C,{interactable:sf,cut:true});
    this._box(-halfW-t,-halfW,H,H+h,zF-t,zA+t,C,o); this._box(halfW,halfW+t,H,H+h,zF-t,zA+t,C,o);
    this._box(-halfW-t,-1.2,H,H+h,zA,zA+t,C,o); this._box(1.2,halfW+t,H,H+h,zA,zA+t,C,o); this._box(-1.2,1.2,H+2.6,H+h,zA,zA+t,C,o);
    // braço de entrada: do poço (parede curva) até a porta da sala
    this._box(-1.5,1.5,H-.3,H-.005,zA,-SHAFT_R,C,{kind:'floor',interactable:sf,flat:true});
    this._box(-1.5,-1.2,H,H+2.9,zA+t,zIn,C,o); this._box(1.2,1.5,H,H+2.9,zA+t,zIn,C,o); this._box(-1.5,1.5,H+2.6,H+2.9,zA+t,-SHAFT_R,C,{interactable:sf,cut:true});
    // parede do fundo, com a abertura baixa do duto na coluna de saída
    const e0=xb(M.exit), e1=xb(M.exit+1), gapH=2.4;
    this._box(-halfW-t,e0,H,H+h,zF-t,zF,C,o); this._box(e1,halfW+t,H,H+h,zF-t,zF,C,o); this._box(e0,e1,H+gapH,H+h,zF-t,zF,C,o);
    // grade do labirinto
    const grid=mazeGrid(M.cols,M.rows,M.seed,M.straight,M.entrance), route=mazeSolve(grid,M.entrance,M.exit);
    this.maze={grid,route,cfg:M,zA,zG,zF,xb,zb};
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
      zones:[{minX:-1.5,maxX:1.5,minZ:zA,maxZ:-SHAFT_R-.2,minY:H-.2,maxY:H+2.9}],
      zoneDuct:{minX:e0-.3,maxX:e1+.3,minZ:zF-t-2.2,maxZ:-SHAFT_R-.2,minY:H-.2,maxY:H+13},
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
  // parede do poço, casca do silo e tetos das salas viram vidro fantasma para enxergar o interior por fora
  setCutaway(on){
    if(!this._ghostMat) this._ghostMat=new THREE.MeshBasicMaterial({color:0x7f93a8,transparent:true,opacity:.09,depthWrite:false,fog:false,side:THREE.DoubleSide});
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
      if(this.maze){ const {zA,zF,xb}=this.maze, M=this.maze.cfg;
        add(['O ARQUIVO + LABIRINTO',`${MAZE.H} m · MEMÓRIA · final ${ENDINGS.witness.name}`],0,MAZE.H+11,(zA+zF)/2,{color:'#ff9a5a',w:14});
        add(['Saída oculta (duto)','fundo do labirinto'],(xb(M.exit)+xb(M.exit+1))/2,M.H+3.4,zF+1.2,{color:'#7fe08a',w:8});
        if(this.mazeScr) add(['Tela da planta','mostra a rota por 3 s'],this.mazeScr.center.x,M.H+4.2,this.mazeScr.center.z+1.2,{color:'#7fe08a',w:8}); }
      { const p=polar(10,Math.PI*.75,HUB.H+9.5); add(['PÁTIO DAS MÁQUINAS',`${HUB.H} m · anel · energia + freio → elevador`],p.x,p.y,p.z,{color:'#ff9a5a',w:14});
        const e=this._fr(HUB.elevator.theta).p(16.2,HUB.H+3,0); add(['Elevador de carga',`${HUB.H} → ${HUB.elevator.top} m`],e.x,e.y,e.z,{color:'#7fe08a',w:8});
        const f=this._fr(HUB.power.theta).p(20,HUB.H+8.5,0); add(['Casa de Força','energia do elevador'],f.x,f.y,f.z,{color:'#c9a227',w:8}); }
      { const p=polar(8,(EXHAUST.a0+EXHAUST.a1)/2,EXHAUST.H+4.6); add(['GALERIA DO EXAUSTOR',`${EXHAUST.H} m · corredor protegido → escada`],p.x,p.y,p.z,{color:'#ff9a5a',w:12});
        add(['EXAUSTOR',`${EXHAUST.fan.y} m · zona de sucção abaixo`],0,EXHAUST.fan.y+2.4,0,{color:'#ff5a5a',w:9}); }
      { const p=polar(INSUF.fan.r,INSUF.a,INSUF.grateTop+3); add(['INSUFLADOR',`${INSUF.grateTop} m · o fluxo leva até o mirante`],p.x,p.y,p.z,{color:'#6ec6ff',w:10}); }
      for(const b of LOCK_BANDS) add(['TRECHO SELADO (chapa)',`${b.y0.toFixed(1)} – ${b.y1.toFixed(1)} m · ${b.label}`],0,(b.y0+b.y1)/2,0,{color:'#ff5a5a',w:10});
      for(const y of DIAPHRAGMS) add(['DIAFRAGMA DE GRADE',`${y.toFixed(1)} m · fecha o poço`],0,y+.8,0,{color:'#ff5a5a',w:8});
      for(const s of this.secrets) add([s.id==='secret0'?'SALA SECRETA (0 m)':'Nicho secreto (20 m)',s.id==='secret0'?'parede rachada · martelo · 10 m de fundo':'vazio · easter egg'],s.anchor.x,s.anchor.y+2.6,s.anchor.z,{color:'#c28aff',w:9});
      if(this.finish) add(['PORTA DE SAÍDA',TOP+' m'],this.finish.position.x-1,this.finish.position.y+3,this.finish.position.z,{color:'#7fe08a'});
      for(let y=25;y<=TOP;y+=25) add([y+' m'],SHAFT_R+3.5,y,SHAFT_R+3.5,{color:'#6ec6ff',w:4});   // régua de altura
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

  // agarras soltas pela parede (em cada quadrante), fora das aberturas e dos trechos selados
  _scatter(){
    for(let q=0;q<4;q++)
      for(let y=2.5;y<TOP-2;y+=.9){
        if(this._inBand(y,.8)) continue;                       // trechos selados: nenhuma agarra solta
        if(this.R()<lerp(.12,.05,y/TOP)){ const a=-Math.PI/4+q*Math.PI/2+this.rand(.06,Math.PI/2-.06); if(!this._inOpening(a,y,.4)){ const hm=this.hold(a,y,this.R()<lerp(CLIMB.scatterCrumble[0],CLIMB.scatterCrumble[1],y/TOP)); hm.userData.extra=true; } }
      }
  }
  // luminárias de parede em espiral (ângulo de ouro): a luz nunca fica toda do mesmo lado
  _lamps(){
    for(let y=4,i=0;y<TOP+2;y+=7,i++){
      const a=wrap2(i*2.39996+this.rand(-.2,.2));
      if(y>MAZE.H-5&&y<MAZE.H+14) continue;                    // o Labirinto é escuro: sem lâmpadas por perto (a luz do poço vaza pela parede)
      if(this._inOpening(a,y,.7)) continue;
      const mat=new THREE.MeshBasicMaterial({color:0xfff2c8});
      const m=new THREE.Mesh(GEO.lamp,mat); m.position.copy(polar(SHAFT_R-.07,a,y)); m.rotation.y=-a+Math.PI/2; this.root.add(m);
      const dead=this.R()<lerp(.1,.8,clamp(y/TOP,0,1));        // quanto mais alto, mais lâmpadas mortas
      this.lamps.push({mat,pos:polar(SHAFT_R-.5,a,y-.1),phase:this.R()*100,broken:!dead&&this.R()<.3,dead,k:dead?0:1});
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
    for(const m of this.movers) m.update(dt,player);        // elevador (leva o jogador junto)
    for(const f of this.fans) f.spin(dt);
    if(this.mazeScr) this._updateMaze(dt,player);
  }
}
