'use strict';
// ============================================================================
// js/world/World.js — geometria do poço, superfícies agarráveis e contratos de nível
// Contrato público: world.platforms [{minX,maxX,minZ,maxZ,top, bottom?, climbable?, kind?}]
//                   world.checkpoints [{id,label,bonus,optional,position,radius,bounds?}]
//                   world.finish {position,radius}   world.spawnPoint (pés)
// Extras opcionais: world.raycastTargets, world.lamps, world.interactables, addPiton(), touch(), update()
// ============================================================================
class World{
  constructor(scene){ this.scene=scene; this.W=W; this.TOP=TOP; this.root=null; this.onCrumble=null; this.onSecretRevealed=null; this.build(); }
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
    this.spawnPoint=new V3(0,0,0); this.spawnYaw=-Math.PI/2;
    this._shell(); this._layout(); this._scatter(); this._lamps();
    this.raycastTargets=[...this.walls,...this.grabbables,...this.interactables];
  }
  // ---------- primitivas ----------
  _box(minX,maxX,minY,maxY,minZ,maxZ,mat,o={}){
    const w=maxX-minX,h=maxY-minY,d=maxZ-minZ, geo=new THREE.BoxGeometry(w,h,d);
    if(mat===MAT.concrete||mat===MAT.concreteAlt) scaleUV(geo,w,h,d);
    const m=new THREE.Mesh(geo,mat); m.position.set((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);
    m.userData={type:o.type||'wall',interactable:o.interactable===undefined?(mat===MAT.concrete?SURFACE.concrete:null):o.interactable};
    (o.parent||this.root).add(m);
    if(o.ray!==false) this.walls.push(m);
    if(o.solid!==false){ const pd={minX,maxX,minZ,maxZ,top:maxY,bottom:minY,kind:o.kind||'wall'}; this.platforms.push(pd); m.userData.solid=pd; }
    return m;
  }
  // caixa descrita por (lat, out) ao longo de uma parede do poço
  _boxLO(axis,la,lb,oa,ob,y0,y1,mat,o){
    const l0=Math.min(la,lb),l1=Math.max(la,lb),o0=Math.min(oa,ob),o1=Math.max(oa,ob);
    return axis==='x'?this._box(o0,o1,y0,y1,l0,l1,mat,o):this._box(l0,l1,y0,y1,o0,o1,mat,o);
  }
  _shell(){
    for(const [axis,s] of [['x',1],['x',-1],['z',1],['z',-1]]){
      const ops=OPENINGS.filter(o=>o.axis===axis&&o.s===s).sort((a,b)=>a.y0-b.y0);
      const oi=s*W, oo=s*(W+.5), L0=-W-.5, L1=W+.5; let y=-30;
      for(const op of ops){
        this._boxLO(axis,L0,L1,oi,oo,y,op.y0,MAT.concrete);
        this._boxLO(axis,L0,op.lat0,oi,oo,op.y0,op.y1,MAT.concrete);
        this._boxLO(axis,op.lat1,L1,oi,oo,op.y0,op.y1,MAT.concrete);
        y=op.y1;
      }
      this._boxLO(axis,L0,L1,oi,oo,y,TOP+30,MAT.concrete);
    }
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*W,2*W),MAT.grate); fl.rotation.x=-Math.PI/2;
    fl.userData={type:'floor'}; this.root.add(fl); this.walls.push(fl);
    this.platforms.push({minX:-W,maxX:W,minZ:-W,maxZ:W,top:0,bottom:-.3,kind:'floor'});
  }
  _inOpening(axis,s,lat,y,m=.3){ return OPENINGS.some(o=>o.axis===axis&&o.s===s&&lat>o.lat0-m&&lat<o.lat1+m&&y>o.y0-m&&y<o.y1+m); }
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
    const L=Math.hypot(lat1-lat0,y1-y0), n=Math.max(1,Math.ceil(L/1.05));
    const gaps=new Set(); let tries=0;
    while(gaps.size<(o.gaps||0)&&tries++<60&&n>=5){ const i=2+Math.floor(this.R()*(n-3)); if(!gaps.has(i-1)&&!gaps.has(i+1)) gaps.add(i); }
    for(let i=0;i<=n;i++){
      if(gaps.has(i)) continue;
      const f=i/n, end=(i===0||i===n);
      const lat=clamp(lerp(lat0,lat1,f)+(end?0:this.rand(-.22,.22)),-3.6,3.6);
      const y=lerp(y0,y1,f)+(end?0:this.rand(-.1,.1));
      this.hold(axis,s,lat,y,!end&&this.R()<(o.crumble||0));
    }
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
  // painel quebrável preenchendo uma abertura; a pista é sutil (tom, parafusos, desalinhamento, som oco)
  breakable(opId,o){
    const op=OPENINGS.find(x=>x.id===opId), s=op.s;
    const m=this._boxLO(op.axis,op.lat0,op.lat1,s*(W-.015),s*(W+.5),op.y0,op.y1,MAT.concreteAlt,{type:'breakable',interactable:null,kind:'breakable'});
    if(op.axis==='x') m.rotation.x=.006; else m.rotation.z=.006;
    const n=op.axis==='x'?new V3(-s,0,0):new V3(0,0,-s);
    for(const [la,ya] of [[op.lat0+.12,op.y0+.15],[op.lat1-.12,op.y0+.15],[op.lat0+.12,op.y1-.15],[op.lat1-.12,op.y1-.15]]){
      const b=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.03,6),MAT.bolt);
      const wp=op.axis==='x'?new V3(s*(W-.03),ya,la):new V3(la,ya,s*(W-.03));
      b.position.copy(wp).sub(m.position); b.quaternion.setFromUnitVectors(new V3(0,1,0),n); m.add(b);
    }
    const it=new BreakableWall(m,{maxDamage:o.maxDamage,secretId:o.secretId});
    m.userData.interactable=it; m.userData.alive=true; return it;
  }
  alcove(opId,depth=1.7,floorIn=0){
    const op=OPENINGS.find(x=>x.id===opId), s=op.s, ax=op.axis;
    const oi=s*(W-floorIn), o1=s*(W+.5), oD=s*(W+.5+depth), oE=s*(W+.75+depth), a=op.lat0, b=op.lat1;
    this._boxLO(ax,a-.25,b+.25,oi,oE,op.y0-.3,op.y0,MAT.concrete,{kind:'floor'});
    this._boxLO(ax,a-.25,b+.25,o1,oE,op.y1,op.y1+.3,MAT.concrete);
    this._boxLO(ax,a-.25,a,o1,oE,op.y0,op.y1,MAT.concrete);
    this._boxLO(ax,b,b+.25,o1,oE,op.y0,op.y1,MAT.concrete);
    this._boxLO(ax,a,b,oD,oE,op.y0,op.y1,MAT.concrete);
    const mid=(a+b)/2, oc=s*(W+.5+depth*.55);
    return ax==='x'?new V3(oc,op.y0,mid):new V3(mid,op.y0,oc);
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
  // ---------- layout vertical ----------
  _layout(){
    // S0 · 0–20 m
    this.box(1.1,0,1.0,{hammer:1,nails:6});
    this.note(1.7,0,-1.3,NOTES[0]);
    this.path('x',1,0,1.9,.6,9.0);
    this.beam('x',.6,10);
    this.path('x',-1,1.4,10.7,1.0,18.6);
    this.platform('x',-1,.5,20,{w:4.4,d:2.2,label:'Depósito',id:'cp1',kind:'rest'});
    this.box(-3.2,20,2.0,{nails:2}); this.note(-3.0,20,-1.0,NOTES[20]);
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

    // S2 · 40–60 m: cano até a soleira da sala de bombas (puzzle), duto de saída até 60 m
    this.pipe(3.45,-3.62,38,49.6);
    this._block(-1.2,.4,-.6,1.0,44,46.4,{mat:MAT.weight,type:'ledge',kind:'obstacle'});
    const chain=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,8.4,6),MAT.metal); chain.position.set(-.4,50.6,.2); this.root.add(chain);
    this.platform('z',-1,2.0,50,{w:2.4,d:1.0,kind:'sill'});
    this._pumpRoom();
    this.platform('z',-1,-1.5,60,{w:3,d:1.8,label:'Duto de manutenção',id:'cp3'});
    this.note(-2.4,60,-3.3,NOTES[60]); this.box(-.6,60,-2.7,{nails:2});

    // S3 · 60–80 m
    this.path('z',-1,-2.6,61.8,-3.55,69.5,{gaps:1});
    this.path('x',-1,-3.55,70.2,1.2,78.6,{gaps:1});
    this.beam('x',-1.6,63); this.beam('z',-1.2,66); this.beam('x',.6,69);
    this.beam('z',1.4,72); this.beam('x',2.2,75); this.beam('z',-1.0,78);
    this.platform('x',-1,1.5,80,{w:3.4,d:2,label:'Sala de controle',id:'cp4'});
    this.terminal(-3.6,80,.4,Math.PI/2,NOTES[80]); this.box(-3.2,80,2.6,{pills:1});

    // S4 · 80–100 m
    this.path('x',-1,3.0,81.8,3.55,84.5);
    this.path('z',1,-3.55,85.2,3.55,88.5);
    this.path('x',1,3.55,89.2,-3.55,92.5);
    this.path('x',1,2.0,90.9,2.6,93.4,{crumble:1});
    this.platform('x',1,2.9,95,{w:.9,d:.9,kind:'cache'}); this.box(3.55,95,2.9,{nails:2,pills:1});
    this.path('x',1,2.2,96.5,-3.55,95.6);
    this.path('z',-1,3.55,93.2,0,96.5);
    this.beam('z',0,97.5);
    this.platform('z',1,0,100,{w:3,d:1.8,label:'Ventilação',id:'cp5'});
    this.note(-.9,100,3.3,NOTES[100]); this.box(.9,100,3.4,{nails:1});
    // segredo 2: painel ao lado da ventilação → nicho com pregos
    this.breakable('secret2',{maxDamage:4,secretId:'secret2'});
    const a2=this.alcove('secret2',1.7,.4);
    this.box(a2.x,a2.y,a2.z,{nails:3});
    this.secrets.push({id:'secret2',revealed:false,anchor:a2,content:'pregos',onReveal:null});

    // S5 · 100–120 m
    this.path('z',1,1.2,101.8,3.55,106,{gaps:1});
    this.path('x',1,3.55,106.7,0,118.6,{gaps:1,crumble:.15});
    this.platform('x',1,0,TOP,{w:3.2,d:2.2,kind:'exit'});
    this.finish={position:new V3(W-1.1,TOP,0),radius:1.3};
    const door=new THREE.Mesh(new THREE.PlaneGeometry(1.2,2.2),new THREE.MeshBasicMaterial({color:0xfff6e0}));
    door.position.set(W-.02,TOP+1.1,0); door.rotation.y=-Math.PI/2; this.root.add(door);
    const dl=new THREE.PointLight(0xfff0d0,2.2,18,1.4); dl.position.set(W-1,TOP+1.5,0); this.root.add(dl);
  }
  // ---------- sala de bombas (puzzle dos 50 m) ----------
  _pumpRoom(){
    const C=MAT.concrete;
    // sala: x[-3.5,3.5] y[50,54.5] z[-11,-4.5]
    this._box(-3.8,3.8,49.7,50,-11.3,-4.0,C,{kind:'floor'});
    this._box(-3.8,3.8,54.5,54.8,-11.3,-4.5,C);
    this._box(-3.8,-3.5,50,54.5,-11.3,-4.5,C); this._box(3.5,3.8,50,54.5,-11.3,-4.5,C);
    this._box(-3.8,-2.6,50,54.5,-11.3,-11,C); this._box(-.4,3.8,50,54.5,-11.3,-11,C); this._box(-2.6,-.4,52.6,54.5,-11.3,-11,C);
    // duto vertical: x[-2.6,-.4] z[-13,-11.3] y[50,62.4]
    this._box(-2.9,-.1,49.7,50,-13.3,-11.3,C,{kind:'floor'});
    this._box(-2.9,-2.6,50,62.7,-13.3,-11.3,C); this._box(-.4,-.1,50,62.7,-13.3,-11.3,C);
    this._box(-2.9,-.1,50,62.7,-13.3,-13,C); this._box(-2.9,-.1,62.4,62.7,-13.3,-11.3,C);
    this._box(-2.9,-.1,54.8,59.7,-11.3,-11.0,C);
    // agarras na parede do fundo do duto (normal +z)
    for(let y=51.9,i=0;y<59.2;y+=1.0,i++){
      const m=new THREE.Mesh(GEO.holdZ,MAT.rust); m.position.set(-1.5+(i%2?.3:-.3)+this.rand(-.08,.08),y,-12.9); m.rotation.z=this.rand(-.25,.25);
      m.userData={grab:true,type:'hold',crumble:false,alive:true,wallNormal:new V3(0,0,1)}; this.root.add(m); this.grabbables.push(m);
    }
    // túnel até o poço: x[-2.6,-.4] y[60,62.4] z[-11.3,-4.5]
    this._block(-2.6,-.4,-11.3,-4.0,59.7,60,{mat:MAT.metal,type:'ledge',kind:'tunnel'});
    this._box(-2.9,-2.6,60,62.7,-11.3,-4.5,C); this._box(-.4,-.1,60,62.7,-11.3,-4.5,C); this._box(-2.9,-.1,62.4,62.7,-11.3,-4.5,C);
    this._pumpRoomProps();
  }
  _pumpRoomProps(){
    const R=this.root, D={id:'pz50',code:'174'};
    // bombas (decoração sólida) e canos
    for(const [x,z] of [[-2.95,-7.0],[2.95,-8.6]]){
      const p=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1.5,16),MAT.pump); p.position.set(x,50.75,z); R.add(p);
      this.platforms.push({minX:x-.42,maxX:x+.42,minZ:z-.42,maxZ:z+.42,top:51.5,bottom:50,kind:'pump'}); p.userData={type:'pump',solid:true}; this.walls.push(p);
      const pp=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,3,8),MAT.pipe); pp.position.set(x,53,z); R.add(pp);
    }
    // placas: símbolo + número
    const plate=(sym,num,x,y,z,ry)=>{
      const t=canvasTex(128,128,g=>{ g.fillStyle='#2a2c2e'; g.fillRect(0,0,128,128); g.strokeStyle='#5a5c5e'; g.lineWidth=6; g.strokeRect(5,5,118,118);
        g.fillStyle='#c9a227'; drawSymbol(g,sym,64,44,24); g.fillStyle='#d8d2c4'; g.font='bold 46px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(num,64,98); });
      const m=new THREE.Mesh(new THREE.PlaneGeometry(.36,.36),new THREE.MeshStandardMaterial({map:t,roughness:.6,metalness:.3}));
      m.position.set(x,y,z); m.rotation.y=ry; R.add(m);
    };
    plate('circle','1',-3.49,52.1,-7.0,Math.PI/2);
    plate('triangle','4',3.49,52.1,-8.6,-Math.PI/2);
    plate('square','7',2.0,53.55,-4.51,Math.PI);
    // luminárias da sala: uma pisca, a outra nunca falha
    const lamp=(x,z,steady)=>{ const mat=new THREE.MeshBasicMaterial({color:0xfff2c8}); const m=new THREE.Mesh(new THREE.BoxGeometry(.8,.06,.12),mat); m.position.set(x,54.44,z); R.add(m);
      const l=new THREE.PointLight(0xffe2a8,1.0,6.5,1.6); l.position.set(x,54.1,z); R.add(l); return {mat,light:l,steady}; };
    D.lampFlicker=lamp(-2.2,-7.0,false); D.lampSteady=lamp(2.2,-8.6,true);
    const amat=new THREE.MeshBasicMaterial({color:0x3a0c08}); const am=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.16),amat); am.position.set(.2,54.35,-4.7); R.add(am);
    const al=new THREE.PointLight(0xff2a14,0,9,1.5); al.position.set(.2,54.0,-5.0); R.add(al); D.alarm={mat:amat,light:al};
    // portas de contenção
    const door=(cx,w,cz,openY,closedY)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,2.6,.2),MAT.door); m.position.set(cx,openY,cz); R.add(m);
      const pd={minX:cx-w/2,maxX:cx+w/2,minZ:cz-.1,maxZ:cz+.1,bottom:openY-1.3,top:openY+1.3,kind:'door'}; this.platforms.push(pd);
      m.userData={type:'door'}; this.walls.push(m); return {mesh:m,aabb:pd,openY,closedY,y:openY}; };
    D.entry=door(2.0,2.4,-4.25,53.9,51.3);
    D.exit=door(-1.5,2.2,-11.15,53.9,51.3); D.exit.y=51.3; D.exit.mesh.position.y=51.3; D.exit.aabb.bottom=50; D.exit.aabb.top=52.6;
    D.locks=[-2.1,-1.5,-.9].map(x=>{ const mat=new THREE.MeshBasicMaterial({color:0xb3241b}); const m=new THREE.Mesh(new THREE.BoxGeometry(.14,.08,.03),mat); m.position.set(x,52.85,-10.97); R.add(m); return mat; });
    // terminal com teclado físico
    this._box(1.2,2.4,50.85,52.4,-11.0,-10.97,MAT.metal,{interactable:null,solid:false,type:'panel'});
    const scr=canvasTex(256,144,g=>{ g.fillStyle='#020802'; g.fillRect(0,0,256,144); });
    const sm=new THREE.Mesh(new THREE.PlaneGeometry(.8,.45),new THREE.MeshBasicMaterial({map:scr})); sm.position.set(1.8,52.06,-10.965); R.add(sm);
    D.screen={tex:scr,canvas:scr.userData.canvas,ctx:scr.userData.ctx};
    const rows=[['1','2','3'],['4','5','6'],['7','8','9'],['C','0','OK']];
    rows.forEach((r,ri)=>r.forEach((lab,ci)=>{
      const t=canvasTex(64,64,g=>{ g.fillStyle='#1d1f20'; g.fillRect(0,0,64,64); g.fillStyle='#cfc8b8'; g.font=`bold ${lab.length>1?26:34}px sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText(lab,32,34); });
      const m=new THREE.Mesh(new THREE.BoxGeometry(.11,.09,.035),new THREE.MeshStandardMaterial({map:t,roughness:.7}));
      m.position.set(1.67+ci*.13,51.6-ri*.115,-10.95); R.add(m);
      m.userData={type:'button',interactable:new KeyButton(m,lab,'pz50')}; this.interactables.push(m);
    }));
    this.note(.9,50,-9.7,CLUE_PZ50);
    D.zoneRoom={minX:-3.5,maxX:3.5,minZ:-11,maxZ:-5.2,minY:49.8,maxY:54};
    D.zoneDuct={minX:-2.6,maxX:-.4,minZ:-13,maxZ:-11.6,minY:49.8,maxY:63};
    D.doorTop=new V3(2.0,52.5,-4.6);
    this.puzzleRooms.pz50=D; this.puzzleDefs.push({id:'pz50',kind:'containment'});
  }
  _scatter(){
    for(const [a,s] of [['x',1],['x',-1],['z',1],['z',-1]])
      for(let y=2.5;y<TOP-2;y+=.9) if(this.R()<.12){ const lat=this.rand(-3.3,3.3); if(!this._inOpening(a,s,lat,y,.4)) this.hold(a,s,lat,y,this.R()<.2); }
  }
  _lamps(){
    for(let y=4,i=0;y<TOP+2;y+=7,i++){
      const sz=i%2?1:-1, x=this.rand(-2.5,2.5);
      if(this._inOpening('z',sz,x,y,.7)) continue;
      const mat=new THREE.MeshBasicMaterial({color:0xfff2c8});
      const m=new THREE.Mesh(GEO.lamp,mat); m.position.set(x,y,sz*(W-.07)); this.root.add(m);
      const dead=this.R()<(y>100?.7:.1);
      this.lamps.push({mat,pos:new V3(x,y-.1,sz*(W-.5)),phase:this.R()*100,broken:!dead&&this.R()<.3,dead,k:dead?0:1});
    }
  }
  // ---------- runtime ----------
  touch(o){ const u=o.userData; if(u.crumble&&u.crumbleT==null){ u.crumbleT=u.crumbleTime||1.2; this.crumbling.push(o); } }
  update(dt){
    for(let i=this.crumbling.length-1;i>=0;i--){
      const o=this.crumbling[i], u=o.userData;
      if(u.alive){
        u.crumbleT-=dt; o.position.x+=(Math.random()-.5)*.004; o.position.z+=(Math.random()-.5)*.004;
        if(u.crumbleT<=0){ u.alive=false; u.vy=0; if(this.onCrumble) this.onCrumble(o); }
      } else { u.vy-=G*dt; o.position.y+=u.vy*dt; if(u.vy<-40){ this.root.remove(o); this.crumbling.splice(i,1); } }
    }
    if(this.animated.length) this.animated=this.animated.filter(a=>a.update(dt));
  }
}
