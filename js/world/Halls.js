'use strict';
// ============================================================================
// js/world/Halls.js — os três DESTINOS (salas grandes), ramais opcionais e portas animadas.
// Estende World.prototype (World.js). Cada salão fica numa parede diferente do poço, formando uma árvore:
//   tronco (poço) → braço de entrada (H) → SALÃO (14 m de pé-direito, galeria a H+10) → braço de saída (H+10) → poço.
// Coordenadas locais do salão: u = distância a partir do eixo do poço para fora · v = lateral · y = altura.
// ============================================================================
class Door{   // porta deslizante que bloqueia (AABB em world.platforms) enquanto fechada
  constructor(world,mesh,pd,dy,dur=1.2){ this.world=world; this.mesh=mesh; this.pd=pd; this.y0=mesh.position.y; this.dy=dy; this.open=false; this.k=0; this.dur=dur; this.moving=false; }
  set(open,instant){
    if(open===this.open&&!this.moving) return; this.open=open;
    const i=this.world.platforms.indexOf(this.pd);
    if(open&&i>=0) this.world.platforms.splice(i,1); else if(!open&&i<0) this.world.platforms.push(this.pd);
    if(instant){ this.k=open?1:0; this.mesh.position.y=this.y0+this.dy*this.k; return; }
    if(!this.moving){ this.moving=true; this.world.animated.push(this); }
  }
  update(dt){ const tgt=this.open?1:0, step=dt/this.dur; this.k+=Math.sign(tgt-this.k)*Math.min(step,Math.abs(tgt-this.k)); this.mesh.position.y=this.y0+this.dy*smooth(this.k); if(this.k===tgt){ this.moving=false; return false; } return true; }
}

Object.assign(World.prototype,{
  // ---------- referencial local ----------
  _fr(axis,s){
    return { axis,s,
      p:(u,y,v)=>axis==='x'?new V3(s*u,y,v):new V3(v,y,s*u),
      box:(u0,u1,v0,v1)=>axis==='x'?[Math.min(s*u0,s*u1),Math.max(s*u0,s*u1),v0,v1]:[v0,v1,Math.min(s*u0,s*u1),Math.max(s*u0,s*u1)],
      yaw:(du,dv)=>{ const dx=axis==='x'?s*du:dv, dz=axis==='x'?dv:s*du; return Math.atan2(dx,dz); },   // faz o +z do objeto olhar para a direção local (du,dv)
      n:(nu,nv)=>axis==='x'?new V3(s*nu,0,nv):new V3(nv,0,s*nu)                                          // normal local → mundo
    };
  },
  _fb(fr,u0,u1,v0,v1,y0,y1,mat,o={}){ const [x0,x1,z0,z1]=fr.box(u0,u1,v0,v1); return this._box(x0,x1,y0,y1,z0,z1,mat,o); },
  _fblock(fr,u0,u1,v0,v1,bottom,top,o){ const [x0,x1,z0,z1]=fr.box(u0,u1,v0,v1); return this._block(x0,x1,z0,z1,bottom,top,o); },
  _fmesh(fr,geo,mat,u,y,v,yawDu,yawDv,parent){ const m=new THREE.Mesh(geo,mat); m.position.copy(fr.p(u,y,v)); if(yawDu!=null) m.rotation.y=fr.yaw(yawDu,yawDv); (parent||this.root).add(m); return m; },
  // agarra num ponto qualquer, com normal local (nu,nv)
  _fhold(fr,u,y,v,nu,nv,crumble){
    const n=fr.n(nu,nv), p=fr.p(u,y,v), m=new THREE.Mesh(Math.abs(n.x)>.5?GEO.holdX:GEO.holdZ,crumble?MAT.crumble:MAT.rust);
    m.position.set(p.x+n.x*.1,y,p.z+n.z*.1); if(Math.abs(n.x)>.5) m.rotation.x=this.rand(-.25,.25); else m.rotation.z=this.rand(-.25,.25);
    m.userData={grab:true,type:'hold',crumble:!!crumble,alive:true,wallNormal:n}; this.root.add(m); this.grabbables.push(m); return m;
  },
  // soquete de prego numa parede do salão (wall ∈ far|near|left|right, t = coordenada ao longo da parede)
  _fsocket(fr,g,wall,t,y){
    const u=wall==='far'?g.uF:wall==='near'?g.uN:t, v=wall==='left'?-g.V:wall==='right'?g.V:t;
    const nl=wall==='far'?[-1,0]:wall==='near'?[1,0]:wall==='left'?[0,1]:[0,-1];
    return this._socketAt(fr.p(u,y,v),fr.n(nl[0],nl[1]));
  },
  // linha de agarras numa parede do salão: wall ∈ far|near|left|right; t = coordenada ao longo da parede
  // o.blank = vão liso EXATO (m) com soquete de prego no meio; tijolos que desmoronam nunca ficam em sequência nem ao lado do vão
  _fpath(fr,g,wall,t0,y0,t1,y1,o={}){
    const L=Math.hypot(t1-t0,y1-y0);
    if(o.blank){
      const f0=o.blankAt||.4, f1=Math.min(.92,f0+o.blank/L), at=f=>[lerp(t0,t1,f),lerp(y0,y1,f)], [a,ya]=at(f0), [b,yb]=at(f1);
      this._fpath(fr,g,wall,t0,y0,a,ya,{...o,blank:0,crumble:0}); this._fpath(fr,g,wall,b,yb,t1,y1,{...o,blank:0,crumble:0});
      this._fsocket(fr,g,wall,(a+b)/2,(ya+yb)/2); return;
    }
    const n=Math.max(1,Math.ceil(L/(o.step||CLIMB.step))); let side=1;
    const put=(t,y,cr)=>{ if(wall==='far') this._fhold(fr,g.uF,y,t,-1,0,cr); else if(wall==='near') this._fhold(fr,g.uN,y,t,1,0,cr); else if(wall==='left') this._fhold(fr,t,y,-g.V,0,1,cr); else this._fhold(fr,t,y,g.V,0,-1,cr); };
    for(let i=0;i<=n;i++){
      const f=i/n, end=(i===0||i===n);
      const t=lerp(t0,t1,f)+(end?0:this.rand(-CLIMB.jitterLat,CLIMB.jitterLat)), y=lerp(y0,y1,f)+(end?0:this.rand(-CLIMB.jitterY,CLIMB.jitterY));
      put(t,y,false);                                                                                 // linha firme e contínua
      if(!end&&i<n-1&&this.R()<(o.crumble||0)){ side=-side; const f2=(i+.5)/n; put(clamp(lerp(t0,t1,f2)+side*.55,-3.4,3.4),lerp(y0,y1,f2)+.12,true); }   // extra que desmorona, ao lado
    }
  },
  // parede com buracos: holes=[{v0,v1,y0,y1}] (recortes retangulares) numa parede de espessura u0..u1
  _fwall(fr,u0,u1,v0,v1,y0,y1,holes,mat,o){
    const ys=new Set([y0,y1]); holes.forEach(h=>{ ys.add(h.y0); ys.add(h.y1); }); const Y=[...ys].sort((a,b)=>a-b);
    for(let i=0;i<Y.length-1;i++){
      const ya=Y[i], yb=Y[i+1], mid=(ya+yb)/2, hs=holes.filter(h=>mid>h.y0&&mid<h.y1).sort((a,b)=>a.v0-b.v0);
      let cur=v0; for(const h of hs){ if(h.v0>cur) this._fb(fr,u0,u1,cur,h.v0,ya,yb,mat,o); cur=h.v1; } if(cur<v1) this._fb(fr,u0,u1,cur,v1,ya,yb,mat,o);
    }
  },
  _door(fr,u,v,w,h,y,mat,axisAlong){   // porta fechada que bloqueia a passagem; axisAlong='v' → porta num plano u=const (largura em v)
    const t=.3; let u0,u1,v0,v1; if(axisAlong==='v'){ u0=u-t/2; u1=u+t/2; v0=v-w/2; v1=v+w/2; } else { u0=u-w/2; u1=u+w/2; v0=v-t/2; v1=v+t/2; }
    const [x0,x1,z0,z1]=fr.box(u0,u1,v0,v1), m=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,h,z1-z0),mat||MAT.door);
    m.position.set((x0+x1)/2,y+h/2,(z0+z1)/2); this.root.add(m); this.walls.push(m);
    const pd={minX:x0,maxX:x1,minZ:z0,maxZ:z1,bottom:y,top:y+h,kind:'door'}; this.platforms.push(pd); m.userData={type:'door',solid:pd};
    return new Door(this,m,pd,h+.15);
  },
  // face com texto/figura pintada (plano)
  _fsign(fr,u,y,v,du,dv,w,h,draw,cw=256,ch=128){
    const t=canvasTex(cw,ch,draw), m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:.7,metalness:.2}));
    m.position.copy(fr.p(u,y,v)); m.rotation.y=fr.yaw(du,dv); this.root.add(m); return {mesh:m,tex:t};
  },
  _lampBar(fr,u,y,v,len,mat,alongV=true){ const m=this._fmesh(fr,new THREE.BoxGeometry(alongV?.1:len,.08,alongV?len:.1),mat,u,y,v); m.userData={type:'lamp'}; return m; },

  // =====================================================================================
  // Casca comum de um salão: braços de entrada/saída, paredes (com recortes), teto, galeria em anel e linha de escalada.
  // Retorna o objeto de descrição do salão (zonas, referências para a lógica do puzzle).
  // =====================================================================================
  _hallShell(cfg,mats){
    const G=HALL_GEO, fr=this._fr(cfg.axis,cfg.s), H=cfg.H, m=cfg.m, t=G.t, V=G.V, climbV=cfg.climbV||0;
    const uN=4.5+G.arm, uF=uN+G.D, vin=1.8*m, vout=-1.8*m, aw=G.armW/2, ah=G.armH;
    const g={fr,H,m,uN,uF,V,vin,vout,h:G.h,mats};
    const W1=mats.wall, FL=mats.floor, CE=mats.ceil||mats.wall, sf=SURFACE.concrete;
    // chão do salão e do braço de entrada
    this._fb(fr,uN-t,uF+t,-V-t,V+t,H-.3,H,FL,{kind:'floor',interactable:sf});
    this._fb(fr,4.0,uN,vin-aw-t,vin+aw+t,H-.3,H,FL,{kind:'floor'});
    // braço de entrada: paredes laterais e teto
    this._fb(fr,4.5,uN,vin-aw-t,vin-aw,H,H+ah+t,W1,{interactable:sf}); this._fb(fr,4.5,uN,vin+aw,vin+aw+t,H,H+ah+t,W1,{interactable:sf});
    this._fb(fr,4.5,uN,vin-aw-t,vin+aw+t,H+ah,H+ah+t,CE,{cut:true});
    // braço de saída (nível da galeria)
    const gy=G.gallY;
    this._fb(fr,4.0,uN,vout-aw-t,vout+aw+t,H+gy-.3,H+gy,FL,{kind:'floor'});
    this._fb(fr,4.5,uN,vout-aw-t,vout-aw,H+gy,H+gy+ah+t,W1,{interactable:sf}); this._fb(fr,4.5,uN,vout+aw,vout+aw+t,H+gy,H+gy+ah+t,W1,{interactable:sf});
    this._fb(fr,4.5,uN,vout-aw-t,vout+aw+t,H+gy+ah,H+gy+ah+t,CE,{cut:true});
    // parede próxima (com as duas aberturas dos braços), parede do fundo, laterais e teto
    this._fwall(fr,uN-t,uN,-V-t,V+t,H,H+G.h+t,[{v0:vin-aw,v1:vin+aw,y0:H,y1:H+ah},{v0:vout-aw,v1:vout+aw,y0:H+gy,y1:H+gy+ah}],W1,{interactable:sf,cut:true});
    this._fb(fr,uF,uF+t,-V-t,V+t,H,H+G.h+t,W1,{interactable:sf,cut:true});
    this._fb(fr,uN,uF,-V-t,-V,H,H+G.h+t,W1,{interactable:sf,cut:true}); this._fb(fr,uN,uF,V,V+t,H,H+G.h+t,W1,{interactable:sf,cut:true});
    this._fb(fr,uN-t,uF+t,-V-t,V+t,H+G.h,H+G.h+t,CE,{cut:true});
    // galeria em anel (H+gallY): perto, fundo, laterais. Blocos agarráveis (dá para subir por qualquer lado, mantle)
    const gw=G.gallery, gm=mats.gall||MAT.metal, T=H+gy;
    this._fblock(fr,uN,uN+gw,-V,V,T-.3,T,{mat:gm,type:'ledge',kind:'gallery'});
    this._fblock(fr,uF-gw,uF,-V,V,T-.3,T,{mat:gm,type:'ledge',kind:'gallery'});
    this._fblock(fr,uN+gw,uF-gw,-V,-V+gw,T-.3,T,{mat:gm,type:'ledge',kind:'gallery'});
    this._fblock(fr,uN+gw,uF-gw,V-gw,V,T-.3,T,{mat:gm,type:'ledge',kind:'gallery'});
    // guarda-corpo (colisão) no lado interno, com um vão de 5 m no centro do fundo (por onde se chega subindo)
    const rail=(u0,u1,v0,v1)=>this._fb(fr,u0,u1,v0,v1,T,T+1.0,gm,{kind:'rail',ray:false});
    rail(uN+gw-.08,uN+gw,-V+gw,V-gw);
    rail(uN+gw,uF-gw,-V+gw-.08,-V+gw); rail(uN+gw,uF-gw,V-gw,V-gw+.08);
    rail(uF-gw,uF-gw+.08,-V+gw,-2.6+climbV); rail(uF-gw,uF-gw+.08,2.6+climbV,V-gw);
    // zonas seguras e gatilhos
    g.zoneRoom=(()=>{ const [x0,x1,z0,z1]=fr.box(uN+.5,uF+t,-V-t,V+t); return {minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:H-.2,maxY:H+G.h+t}; })();
    g.zones=[ (()=>{ const [x0,x1,z0,z1]=fr.box(4.5,uN+.5,vin-aw-t,vin+aw+t); return {minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:H-.2,maxY:H+ah+t}; })(),
              (()=>{ const [x0,x1,z0,z1]=fr.box(4.5,uN+.5,vout-aw-t,vout+aw+t); return {minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:H+gy-.2,maxY:H+gy+ah+t}; })() ];
    return g;
  },
  // ---------- ramais opcionais (salas pequenas ligadas aos descansos do poço) ----------
  _wing(wall,c,T,spec){
    const fr=this._fr(wall.axis,wall.s), id=spec.id, w=1.0;
    this.openings.push({id:id+'_in',axis:wall.axis,s:wall.s,lat0:c-w,lat1:c+w,y0:T,y1:T+2.6});
    const C=MAT.concrete, sf=SURFACE.concrete, L=7, RW=4.2, RL=9, rh=3.6, t=.3, u1=4.5+L, u2=u1+RL;
    this._fb(fr,4.0,u2+t,c-RW-t,c+RW+t,T-.3,T,C,{kind:'floor'});
    this._fb(fr,4.5,u1,c-w-t,c-w,T,T+2.9,C,{interactable:sf}); this._fb(fr,4.5,u1,c+w,c+w+t,T,T+2.9,C,{interactable:sf}); this._fb(fr,4.5,u1,c-w-t,c+w+t,T+2.6,T+2.9,C,{cut:true});
    this._fwall(fr,u1-t,u1,c-RW-t,c+RW+t,T,T+rh+t,[{v0:c-w,v1:c+w,y0:T,y1:T+2.6}],C,{interactable:sf});
    this._fb(fr,u1,u2,c-RW-t,c-RW,T,T+rh+t,C,{interactable:sf}); this._fb(fr,u1,u2,c+RW,c+RW+t,T,T+rh+t,C,{interactable:sf});
    this._fb(fr,u2,u2+t,c-RW-t,c+RW+t,T,T+rh+t,C,{interactable:sf}); this._fb(fr,u1-t,u2+t,c-RW-t,c+RW+t,T+rh,T+rh+t,C,{cut:true});
    const [x0,x1,z0,z1]=fr.box(4.5,u2,c-RW-t,c+RW+t);
    this.puzzleRooms[id]={id,zoneRoom:{minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:T-.2,maxY:T+rh+t}};
    if(spec.dress) spec.dress(fr,{u1,u2,c,T,RW,rh});
    return {fr,u1,u2,c,T};
  }
});

// ============================================================================
// peças reutilizáveis: roda de válvula, alavanca, mostrador, placa
// ============================================================================
Object.assign(World.prototype,{
  _makeWheel(pos,o){   // o.flat → roda deitada (mesa); senão vertical virada para a direção yaw
    const outer=new THREE.Group(); outer.position.copy(pos); if(o.flat) outer.rotation.x=-Math.PI/2; else outer.rotation.y=o.yaw||0; this.root.add(outer);
    const rot=new THREE.Group(); outer.add(rot); const r=o.r||.42;
    const parts=[]; const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.05,8,18),o.mat||MAT.rust); rot.add(ring); parts.push(ring);
    for(let i=0;i<2;i++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(r*2,.06,.06),o.mat||MAT.rust); sp.rotation.z=i*Math.PI/2; rot.add(sp); parts.push(sp); }
    const mk=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),MAT.glowAmber); mk.position.set(r,0,0); rot.add(mk);    // marca de posição na borda
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.14,8),MAT.metal); hub.rotation.x=Math.PI/2; rot.add(hub); parts.push(hub);
    const hit=new THREE.Mesh(new THREE.BoxGeometry(r*2.3,r*2.3,.5),IMAT.hidden); outer.add(hit); parts.push(hit);
    const w=new Wheel(rot,{hall:o.hall,id:o.id,steps:o.steps||4,state:o.state||0,label:o.label,jam:o.jam}); w.world=this;
    parts.forEach(m=>{ m.userData={type:'wheel',interactable:w}; }); this.interactables.push(...parts); return w;
  },
  _makeLever(pos,yaw,o){
    const outer=new THREE.Group(); outer.position.copy(pos); outer.rotation.y=yaw; this.root.add(outer);
    const base=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,.08),MAT.metal); outer.add(base);
    const rot=new THREE.Group(); rot.position.z=.05; outer.add(rot);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(.05,.5,.05).translate(0,.25,0),o.mat||MAT.rust); rot.add(arm);
    const knob=new THREE.Mesh(new THREE.BoxGeometry(.11,.11,.11),o.knob||MAT.glowAmber); knob.position.y=.52; rot.add(knob);
    const hit=new THREE.Mesh(new THREE.BoxGeometry(.5,.8,.4),IMAT.hidden); hit.position.set(0,.15,.1); outer.add(hit);
    const lv=new Lever(rot,{hall:o.hall,id:o.id,label:o.label,on:o.on,jam:o.jam,deny:o.deny}); lv.world=this; lv.knob=knob;
    [base,arm,knob,hit].forEach(m=>{ m.userData={type:'lever',interactable:lv}; }); this.interactables.push(base,arm,knob,hit); return lv;
  },
  // mostrador de pressão: 4 posições (níveis 0–3), com os símbolos na ordem 'faces' (diferente em cada mostrador)
  _makeGauge(pos,yaw,faces,o){
    const outer=new THREE.Group(); outer.position.copy(pos); outer.rotation.y=yaw; this.root.add(outer);
    const ang=k=>-1.15+k*.77;
    const tex=canvasTex(256,256,g=>{ g.fillStyle='#17140f'; g.fillRect(0,0,256,256); g.strokeStyle='#6a5a3a'; g.lineWidth=10; g.beginPath(); g.arc(128,128,118,0,Math.PI*2); g.stroke();
      g.strokeStyle='rgba(220,190,110,.35)'; g.lineWidth=3; g.beginPath(); g.arc(128,128,86,-Math.PI/2+ang(0),-Math.PI/2+ang(3)); g.stroke();
      faces.forEach((sym,k)=>{ const a=ang(k)-Math.PI/2; g.fillStyle='#f0d27a'; drawSymbol(g,sym,128+Math.cos(a)*86,128+Math.sin(a)*86,15); }); });
    const mat=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:0x000000,roughness:.6,metalness:.3});
    const face=new THREE.Mesh(new THREE.PlaneGeometry(o.size||1.5,o.size||1.5),mat); outer.add(face);
    const pivot=new THREE.Group(); pivot.position.z=.04; outer.add(pivot);
    const needle=new THREE.Mesh(new THREE.BoxGeometry(.05,(o.size||1.5)*.34,.03).translate(0,(o.size||1.5)*.17,0),MAT.glowAmber); pivot.add(needle);
    const g={face,mat,pivot,level:o.level||0,tw:null,world:this,
      setPower(on){ this.mat.emissive.setHex(on?0xffffff:0x000000); },
      setLevel(l,instant){ const from=this.pivot.rotation.z; this.level=l; const to=-ang(l); if(instant){ this.pivot.rotation.z=to; this.tw=null; } else { this.tw={from,to,t:0}; if(!this._q){ this._q=true; this.world.animated.push(this); } } },
      update(dt){ const w=this.tw; if(!w){ this._q=false; return false; } w.t+=dt; const k=Math.min(1,w.t/.5); this.pivot.rotation.z=lerp(w.from,w.to,smooth(k)); if(k>=1){ this.tw=null; this._q=false; return false; } return true; } };
    g.pivot.rotation.z=-ang(g.level); return g;
  },
  _lbl(fr,u,y,v,du,dv,w,h,text,color){ return this._fsign(fr,u,y,v,du,dv,w,h,(g,cw,ch)=>{ g.fillStyle='#14110d'; g.fillRect(0,0,cw,ch); g.strokeStyle=color||'#c9a227'; g.lineWidth=6; g.strokeRect(3,3,cw-6,ch-6);
      g.fillStyle=color||'#e8c15a'; g.font='bold 64px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,cw/2,ch/2+3); }); },
  _addHit(mesh){ this.interactables.push(mesh); if(this.raycastTargets) this.raycastTargets.push(mesh); },
  _smashBox(fr,u0,u1,v0,v1,y0,y1,mat,o){   // caixa sólida que cede ao martelo
    const m=this._fb(fr,u0,u1,v0,v1,y0,y1,mat,{interactable:null,type:'smash',kind:'smash'});
    const sm=new Smashable(m,{hall:o.hall,id:o.id,hits:o.hits,onBreak:o.onBreak,fx:o.fx}); m.userData.interactable=sm; return sm;
  }
});

// ============================================================================
// DESTINO I — A CASA DAS BOMBAS  (contenção · final SELO)
// ============================================================================
Object.assign(World.prototype,{
  _foundry(cfg){
    const F=FOUNDRY, T=FOUNDRY_TEXT, H=cfg.H, hall=cfg.id;
    const mats={wall:MAT.foundry,floor:MAT.foundry,ceil:MAT.metal,gall:MAT.metal};
    const g=this._hallShell({...cfg,climbV:-6.5},mats), fr=g.fr, V=g.V, uN=g.uN, uF=g.uF, P=(u,y,v)=>fr.p(u,y,v);
    const sf=SURFACE.concrete, FM=MAT.foundry;
    const refs={wheels:[],gauges:[],pumps:{},lamps:[],lights:[],doors:{}};
    // ---- luzes: o salão começa APAGADO; o quadro de força (no alto) acende tudo ----
    [[19,-7],[27,6],[34,-5],[22,7]].forEach(([u,v])=>{ const L=new THREE.PointLight(0xffa24a,0,17,1.5); L.position.copy(P(u,H+9.5,v)); this.root.add(L); refs.lights.push(L); });
    for(let i=0;i<6;i++){ const u=18+i*4.2, v=(i%2?4.5:-4.5); const lamp=this._lampBar(fr,u,H+13.2,v,2.2,MAT.darkLamp); refs.lamps.push(lamp); }
    // ---- cabine de controle (aberta para +v): terminal, esquema das válvulas, armário com o cartão ----
    const bu0=15.0, bu1=21.4, bv0=-V, bv1=-5.0;
    this._fb(fr,bu0-.25,bu0,bv0,bv1,H,H+3.4,FM,{interactable:sf}); this._fb(fr,bu1,bu1+.25,bv0,bv1,H,H+3.4,FM,{interactable:sf});
    this._fb(fr,bu0-.25,bu1+.25,bv0,bv1,H+3.4,H+3.65,MAT.metal,{cut:true});
    this._fb(fr,17.2,19.0,-10.8,-9.5,H,H+.8,MAT.metal,{interactable:null});                                 // mesa
    this.terminal(...(()=>{ const q=P(18.1,H+.8,-10.2); return [q.x,q.y,q.z]; })(),fr.yaw(0,1),T.log);
    this._lbl(fr,20.6,H+3.0,-5.4,-1,0,2.4,.8,'CABINE DE CONTROLE','#e8c15a').mesh.position.y=H+3.0;
    // esquema das válvulas: quais tanques cada válvula empurra
    this._fsign(fr,bu1-.02,H+1.9,-8.0,-1,0,2.6,1.6,(gc,cw,ch)=>{ gc.fillStyle='#10100c'; gc.fillRect(0,0,cw,ch); gc.strokeStyle='#8a7a4a'; gc.lineWidth=4; gc.strokeRect(4,4,cw-8,ch-8);
      gc.fillStyle='#e8c15a'; gc.font='bold 22px sans-serif'; gc.textAlign='center'; gc.fillText('ESQUEMA DAS LINHAS',cw/2,34);
      gc.font='bold 24px sans-serif'; for(let i=0;i<4;i++){ const y=64+i*46; gc.fillStyle='#e8c15a'; gc.fillText('V'+(i+1),52,y+8); gc.fillText('T'+(i+1),cw-52,y+8); }
      gc.strokeStyle='#d9a441'; gc.lineWidth=5; for(let v=0;v<4;v++) for(let t=0;t<4;t++) if(F.M[v][t]){ gc.beginPath(); gc.moveTo(84,64+v*46+2); gc.bezierCurveTo(cw/2,64+v*46,cw/2,64+t*46,cw-84,64+t*46+2); gc.stroke(); } },320,200);
    // armário com o cartão de acesso (o vidro cede ao martelo)
    const cab=this._smashBox(fr,15.05,15.65,-8.9,-7.7,H,H+1.7,MAT.glass,{hall,id:'cabCard',hits:F.cabinetCard,
      onBreak:ctx=>{ const q=P(15.35,H+1.0,-8.3); this.addPickup('card',1,this.root,q); }});
    cab.mesh.userData.type='smash'; this.box(...(()=>{ const q=P(19.2,H,-6.2); return [q.x,q.y,q.z]; })(),{pills:1,nails:3});
    // ---- ilha das válvulas (centro): 4 rodas deitadas; os mostradores ficam na parede oposta ----
    this._fb(fr,25.6,32.4,-1.0,1.0,H,H+.9,FM,{interactable:null});
    for(let i=0;i<4;i++){
      const u=26.5+i*1.7, w=this._makeWheel(P(u,H+1.0,0),{flat:true,hall,id:'valve'+i,label:'Válvula '+(i+1),state:0,r:.5});
      refs.wheels.push(w);
      for(const sgn of [1,-1]) this._lbl(fr,u,H+.52,sgn*1.01,0,sgn,.6,.4,String(i+1),'#e8c15a');
    }
    // mostradores (parede esquerda), cada um com os símbolos em outra ordem
    for(let i=0;i<4;i++){ const gg=this._makeGauge(P(24+i*3.2,H+2.7,-V+.06),fr.yaw(0,1),F.faces[i],{size:1.7,level:0}); refs.gauges.push(gg); }
    // ---- bombas (fundo): cada uma com a placa do seu símbolo e uma alavanca ----
    const pv=[-5.4,-1.8,1.8,5.4];
    F.pumps.forEach((sym,i)=>{
      const v=pv[i], body=this._fb(fr,33.6,35.0,v-.7,v+.7,H,H+2.1,MAT.metal,{interactable:null});
      this._fmesh(fr,new THREE.CylinderGeometry(.18,.18,3.2,8),MAT.pipe,34.3,H+3.7,v);
      this._fsign(fr,33.58,H+2.55,v,-1,0,.9,.9,(gc,cw,ch)=>{ gc.fillStyle='#14110d'; gc.fillRect(0,0,cw,ch); gc.strokeStyle='#c9a227'; gc.lineWidth=6; gc.strokeRect(3,3,cw-6,ch-6); gc.fillStyle='#e8c15a'; drawSymbol(gc,sym,cw/2,ch/2,cw*.28); },128,128);
      const lv=this._makeLever(P(33.4,H+1.0,v),fr.yaw(-1,0),{hall,id:'pump:'+sym,label:'Bomba '+SYMBOLS[sym],deny:'As bombas só partem com a pressão equilibrada.'}); refs.pumps[sym]=lv;
    });
    // ---- reservatório (página 2 no topo): subida curta com agarras ----
    const tankV=8.1;
    this._fb(fr,30.0,33.2,7.0,9.2,H,H+2.7,FM,{interactable:sf});
    this._fblock(fr,30.0,33.2,7.0,9.2,H+2.7,H+3.0,{mat:MAT.metal,type:'ledge',kind:'tank'});
    for(let k=0;k<4;k++) this._fhold(fr,30.0,H+.7+k*.5,tankV+(k%2?.25:-.25),-1,0,false);
    this._fhold(fr,30.0,H+1.6,tankV,-1,0,false);
    const q2=P(31.6,H+3.0,tankV); this.note(q2.x,q2.y,q2.z,T.p2);
    // ---- armário A (página 3, vidro) no canto esquerdo do fundo ----
    this._smashBox(fr,36.6,37.6,-10.9,-9.7,H,H+1.8,MAT.glass,{hall,id:'cabPage',hits:F.cabinetPage});
    const q3=P(37.1,H+.9,-10.3); this.note(q3.x,q3.y,q3.z,T.p3);
    // página 1 está no terminal da cabine (texto do diário cita as três)
    const q1=P(18.1,H+.82,-9.7); this.note(q1.x,q1.y,q1.z,T.p1);
    // ---- quadro de força no alto da parede do fundo + linha de escalada até a galeria ----
    this._fpath(fr,g,'far',-6.5,H+.6,-6.5,H+8.6,{blank:CLIMB.blank,blankAt:.55,crumble:.06});
    this._fb(fr,uF-.35,uF,-8.3,-6.9,H+4.5,H+5.9,MAT.metal,{interactable:null,solid:false});
    const br=this._makeLever(P(uF-.4,H+5.2,-7.6),fr.yaw(-1,0),{hall,id:'breaker',label:'Disjuntor geral',jam:F.jam,on:false}); refs.breaker=br;
    this._lbl(fr,uF-.38,H+6.25,-7.6,-1,0,1.3,.4,'QUADRO GERAL','#ff9a5a');
    const bp=P(uF-.5,H+5.2,-7.6); void bp;
    // ---- câmara da Válvula-Mestra (canto direito do fundo) ----
    const cu0=34.6, cu1=38.4, cv0=6.4;
    this._fb(fr,cu0-.3,cu0,cv0,V,H,H+3.4,FM,{interactable:sf});
    this._fb(fr,cu0-.3,35.6,cv0-.3,cv0,H,H+3.4,FM,{interactable:sf}); this._fb(fr,37.2,cu1,cv0-.3,cv0,H,H+3.4,FM,{interactable:sf}); this._fb(fr,35.6,37.2,cv0-.3,cv0,H+2.6,H+3.4,FM,{interactable:sf});
    // (parede lateral com vão para a porta)
    this._fb(fr,cu0-.3,cu1+.05,cv0-.3,V,H+3.4,H+3.7,MAT.metal,{cut:true});
    const dm=this._door(fr,36.4,cv0-.15,1.6,2.6,H,MAT.door,'u'); refs.doors.master=dm;
    this._lbl(fr,36.4,H+3.0,cv0-.32,0,-1,2.4,.7,'VÁLVULA-MESTRA','#ff6a5a');
    const dec=new Decision({hall,id:'seal',route:'seal',label:'Girar a Válvula-Mestra',text:T.master});
    const mw=this._makeWheel(P(cu1-.2,H+1.5,8.7),{yaw:fr.yaw(-1,0),hall,id:'master',label:'Válvula-Mestra',r:.7,mat:MAT.rust}); mw.interact=(ctx)=>dec.interact(ctx); mw.canInteract=(ctx)=>dec.canInteract(ctx); refs.decision=dec;
    const ql=P(37.4,H,7.6); this.note(ql.x,ql.y,ql.z,T.last);
    // ---- porta da galeria (saída), fechada até o circuito completo ----
    refs.doors.exit=this._door(fr,uN-.2,g.vout,2.4,2.6,H+HALL_GEO.gallY,MAT.door,'v');
    // ---- cenário: colunas, canos e vazamentos ----
    [[21.5,3.8],[22,-1.5],[35.5,-8.6],[28.5,-6.5]].forEach(([u,v])=>this._fb(fr,u-.45,u+.45,v-.45,v+.45,H,H+HALL_GEO.h,FM,{interactable:sf}));
    for(let k=0;k<3;k++){ const m=this._fmesh(fr,new THREE.CylinderGeometry(.22,.22,2*V,10),MAT.pipe,19+k*8,H+12.2+k*.3,0); m.rotation.x=Math.PI/2; }
    // ---- API de visual da lógica ----
    refs.setPower=(on)=>{ refs.lamps.forEach(l=>{ l.material=on?MAT.glowAmber:MAT.darkLamp; }); refs.lights.forEach(L=>{ L.intensity=on?1.15:0; }); refs.gauges.forEach(gg=>gg.setPower(on)); };
    g.id=hall; g.kind='foundry'; g.refs=refs; g.cfg=cfg;
    return g;
  }
});

// ============================================================================
// DESTINO II — A ESTUFA  (raiz · final COMUNHÃO)
// ============================================================================
Object.assign(World.prototype,{
  _greenhouse(cfg){
    const G=GREEN, T=GREEN_TEXT, H=cfg.H, hall=cfg.id;
    const mats={wall:MAT.moss,floor:MAT.moss,ceil:MAT.glass,gall:MAT.metal};
    const g=this._hallShell({...cfg,climbV:-6.5},mats), fr=g.fr, V=g.V, uN=g.uN, uF=g.uF, P=(u,y,v)=>fr.p(u,y,v);
    const sf=SURFACE.concrete, MS=MAT.moss, refs={dials:[],beds:{},lights:[],doors:{},levers:{}};
    // luz: esporos verdes (a estufa nunca fica totalmente escura)
    [[20,-3],[33,4],[26.5,0]].forEach(([u,v],i)=>{ const L=new THREE.PointLight(0x74e08a,i===2?1.3:.95,i===2?24:17,1.5); L.position.copy(P(u,H+(i===2?10:7.5),v)); this.root.add(L); refs.lights.push(L); });
    // ---- ETAPA A · barreira de raízes na boca do braço de entrada: só cede ao martelo ----
    const barrier=this._smashBox(fr,g.uN-1.5,g.uN-.5,g.vin-1.2,g.vin+1.2,H,H+2.6,MAT.vine,{hall,id:'roots',hits:G.barrierHits,fx:'dust'});
    for(let i=0;i<7;i++){ const m=this._fmesh(fr,new THREE.CylinderGeometry(.07,.09,2.6,6),MAT.vine,g.uN-1.7+this.rand(-.1,.1),H+1.3,g.vin+(i-3)*.34); m.rotation.z=this.rand(-.2,.2); }
    // ---- A Grande Árvore (centro): coluna sólida, galhos e folhas brilhantes ----
    this._fb(fr,25.7,27.3,-.8,.8,H,H+HALL_GEO.h,MAT.vine,{interactable:null});
    for(let i=0;i<5;i++){ const b=this._fmesh(fr,new THREE.BoxGeometry(.35,.3,5.5),MAT.vine,26.5+Math.cos(i*1.26)*2.4,H+9.5+i*.5,Math.sin(i*1.26)*2.4); b.rotation.y=-i*1.26; b.rotation.x=.25; }
    for(let i=0;i<26;i++){ const a=this.R()*Math.PI*2, r=2+this.R()*5; this._fmesh(fr,new THREE.BoxGeometry(.35,.05,.5),MAT.glowGreen,26.5+Math.cos(a)*r,H+10.5+this.R()*3,Math.sin(a)*r).rotation.set(this.R(),this.R(),0); }
    for(let i=0;i<16;i++){ const u=16+this.R()*21, v=-9.5+this.R()*19; const h=3+this.R()*5; this._fmesh(fr,new THREE.CylinderGeometry(.03,.05,h,5),MAT.vine,u,H+HALL_GEO.h-h/2,v); }
    // ---- ETAPA B · altar das raízes: 4 seletores de símbolo + alavanca "Enraizar" ----
    this._fb(fr,22.4,24.4,-2.6,2.6,H,H+1.0,MAT.metal,{interactable:null});
    const symbols=['circle','triangle','square','diamond','cross','star'];
    for(let i=0;i<4;i++){
      const tex=canvasTex(128,128,()=>{}); const m=new THREE.Mesh(new THREE.PlaneGeometry(.9,.9),new THREE.MeshBasicMaterial({map:tex}));
      m.position.copy(P(22.37,H+.55,-1.65+i*1.1)); m.rotation.y=fr.yaw(-1,0); this.root.add(m);
      const d=new Dial(tex,{hall,id:'d'+i,symbols,label:'Estação '+(i+1)}); m.userData={type:'dial',interactable:d}; this._addHit(m); refs.dials.push(d);
    }
    const root=this._makeLever(P(22.35,H+.5,2.3),fr.yaw(-1,0),{hall,id:'root',label:'Enraizar',deny:'O altar está inerte.'}); refs.levers.root=root;
    { const q=P(23.4,H+1.0,-2.1); this.terminal(q.x,q.y,q.z,fr.yaw(-1,0),T.log); const c=P(18.5,H,6.0); this.box(c.x,c.y,c.z,{nails:3}); }
    // ---- placas das estações: figura = fase da planta · símbolo = nome da estação ----
    const stagePlate=(i,u,y,v,du,dv,sz)=>this._fsign(fr,u,y,v,du,dv,sz,sz,(gc,cw,ch)=>{ gc.fillStyle='#10160f'; gc.fillRect(0,0,cw,ch); gc.strokeStyle='#8fd87a'; gc.lineWidth=6; gc.strokeRect(3,3,cw-6,ch-6);
      drawPlantStage(gc,i,cw/2,ch*.42,1.7); gc.fillStyle='#e3c768'; drawSymbol(gc,G.seasons[i],cw/2,ch*.84,cw*.1); },192,192);
    stagePlate(0,uN+.06,H+1.9,7.2,1,0,1.4);                        // semente — perto da entrada (parede)
    stagePlate(2,25.66,H+1.9,0,-1,0,1.1);                          // flor — no tronco, atrás do altar
    { stagePlate(1,33.0,H+5.7,V-.06,0,-1,1.5);                     // broto — no alto da parede direita (sobe-se por uma linha de agarras)
      this._fpath(fr,g,'right',31.2,H+.6,32.4,H+4.3,{crumble:.0}); }
    // murcha — dentro de uma vitrine de vidro (martelo)
    this._fb(fr,uN,uN+.6,-7.8,-6.6,H+.5,H+.8,MAT.metal,{interactable:null});
    this._smashBox(fr,uN+.05,uN+.6,-7.8,-6.6,H+.8,H+2.0,MAT.glass,{hall,id:'case',hits:2});
    { const q=P(uN+.3,H+.8,-7.2); this.note(q.x,q.y,q.z,"PLACA DA ESTAÇÃO\n\nFase: a planta murcha, o caule se curva.\nSímbolo: □"); }
    // ---- ETAPA C · 4 canteiros com lâmpada e alavanca (a regra está na placa ao lado) ----
    G.bedOrder.forEach((sym,i)=>{
      const u=20+i*5, bm=this._fb(fr,u-1.4,u+1.4,-10.5,-8.4,H,H+.7,MS,{interactable:null});
      this._fmesh(fr,new THREE.CylinderGeometry(.07,.1,2.4,6),MAT.vine,u,H+1.9,-9.45);
      this._fsign(fr,u,H+3.3,-9.35,0,1,1.3,1.3,(gc,cw,ch)=>{ gc.fillStyle='rgba(0,0,0,0)'; gc.clearRect(0,0,cw,ch); gc.fillStyle='#f0a0c8'; for(let k=0;k<8;k++){ const a=k*Math.PI/4; gc.beginPath(); gc.ellipse(cw/2+Math.cos(a)*38,ch/2+Math.sin(a)*38,24,13,a,0,Math.PI*2); gc.fill(); }
        gc.fillStyle='#2a1a22'; gc.beginPath(); gc.arc(cw/2,ch/2,34,0,Math.PI*2); gc.fill(); gc.fillStyle='#f0d27a'; drawSymbol(gc,sym,cw/2,ch/2,22); },160,160).mesh.material.transparent=true;
      const lamp=this._lampBar(fr,u,H+6.2,-9.4,2.4,MAT.darkLamp,false); refs.beds[sym]={lamp,u};
      const lv=this._makeLever(P(u,H+.45,-8.36),fr.yaw(0,1),{hall,id:'bed:'+sym,label:'Luz do canteiro',deny:'As luzes só respondem depois que o altar aceitar o ciclo.'}); refs.levers['bed:'+sym]=lv;
    });
    { this._fb(fr,27.0,28.0,-6.9,-6.1,H,H+.8,MAT.metal,{interactable:null}); const q=P(27.5,H+.8,-6.5); this.terminal(q.x,q.y,q.z,fr.yaw(0,1),T.lamps); }
    // ---- ETAPA D · câmara do Coração (leitor de cartão; decisão COMUNHÃO) ----
    const cu0=34.0, cu1=38.4, cv0=2.8, cv1=9.2;
    this._fwall(fr,cu0-.3,cu0,cv0,cv1,H,H+3.6,[{v0:5.1,v1:6.9,y0:H,y1:H+2.6}],MS,{interactable:sf});
    this._fb(fr,cu0,cu1,cv0-.3,cv0,H,H+3.6,MS,{interactable:sf}); this._fb(fr,cu0,cu1,cv1,cv1+.3,H,H+3.6,MS,{interactable:sf});
    this._fb(fr,cu0-.3,cu1+.1,cv0-.3,cv1+.3,H+3.6,H+3.9,MAT.vine,{cut:true});
    const heartDoor=this._door(fr,cu0-.15,6.0,1.8,2.6,H,MAT.vine,'v'); refs.doors.heart=heartDoor;
    const rm=new THREE.Mesh(new THREE.BoxGeometry(.4,.5,.12),MAT.metal); rm.position.copy(P(cu0-.5,H+1.5,4.3)); rm.rotation.y=fr.yaw(-1,0); this.root.add(rm);
    const rl=new THREE.Mesh(new THREE.BoxGeometry(.2,.06,.04),MAT.glowAmber); rl.position.copy(P(cu0-.58,H+1.65,4.3)); rl.rotation.y=fr.yaw(-1,0); this.root.add(rl);
    const reader=new Reader(rm,rl,{hall,id:'heart',label:'Leitor do Coração',hint:T.heart}); rm.userData={type:'reader',interactable:reader}; rl.userData={type:'reader',interactable:reader}; this._addHit(rm); this._addHit(rl); refs.reader=reader;
    this._lbl(fr,cu0-.34,H+2.5,6.0,-1,0,1.8,.55,'O CORAÇÃO','#7be88f');
    const heart=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,.9),MAT.glowGreen); heart.position.copy(P(37.2,H+1.4,6.0)); heart.rotation.set(.6,.6,0); this.root.add(heart);
    const hl=new THREE.PointLight(0x74ff9a,.0,10,1.6); hl.position.copy(P(36.4,H+1.8,6.0)); this.root.add(hl); refs.heartLight=hl; refs.heart=heart;
    const hh=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.6,1.4),IMAT.hidden); hh.position.copy(heart.position); this.root.add(hh);
    const dec=new Decision({hall,id:'commune',route:'commune',label:'Pôr a mão no Coração',text:T.decide}); hh.userData={type:'heart',interactable:dec}; heart.userData={type:'heart',interactable:dec}; this._addHit(hh); this._addHit(heart);
    { const q=P(36.0,H,3.6); this.note(q.x,q.y,q.z,T.last); }
    // ---- porta da galeria e linha de escalada até lá ----
    refs.doors.exit=this._door(fr,uN-.2,g.vout,2.4,2.6,H+HALL_GEO.gallY,MAT.door,'v');
    this._fpath(fr,g,'far',-6.5,H+.6,-6.5,H+8.6,{blank:CLIMB.blank,blankAt:.5,crumble:.08});
    refs.setLamp=(sym,on)=>{ const b=refs.beds[sym]; if(b) b.lamp.material=on?MAT.glowGreen:MAT.darkLamp; };
    refs.setHeart=(on)=>{ refs.heartLight.intensity=on?1.1:0; };
    g.id=hall; g.kind='greenhouse'; g.refs=refs; g.cfg=cfg; g.barrier=barrier;
    return g;
  }
});

// ============================================================================
// DESTINO III — O ARQUIVO  (memória · final TESTEMUNHO). O labirinto é construído em World._mazeRoom;
// aqui ficam a sala de leitura (mural a contar, mesa, estante alta, cofre), o teclado/porta da saída e as placas nos becos.
// ============================================================================
Object.assign(World.prototype,{
  _tagMesh(pos,glow){ const m=new THREE.Mesh(new THREE.BoxGeometry(.34,.46,.05),glow?MAT.glowBlue:MAT.paper); m.position.copy(pos); m.rotation.y=this.rand(0,6.28); m.rotation.x=-.25; this.root.add(m); return m; },
  _archiveProps(M,I){
    const H=M.H, fr=this._fr('z',-1), hall=M.id, T=ARCHIVE_TEXT, A=ARCHIVE, C=MAT.archive, sf=SURFACE.concrete, refs={doors:{},tags:[],lights:[]};
    const V3p=(x,y,z)=>new V3(x,y,z), halfW=I.halfW, zA=I.zA, zG=I.zG, zF=I.zF, t=M.wall;
    // luz da sala de leitura: alcance curto para o labirinto continuar escuro
    [[-4,-7.2],[5,-7.2]].forEach(([x,z])=>{ const L=new THREE.PointLight(0xffd9a0,1.0,8,1.7); L.position.set(x,H+5.2,z); this.root.add(L); refs.lights.push(L);
      const lb=new THREE.Mesh(new THREE.BoxGeometry(1.6,.08,.18),MAT.glowAmber); lb.position.set(x,H+6.4,z); this.root.add(lb); });
    // ---- mural na parede direita: contar ○ △ □ (há símbolos no alto e distratores ◇ ✚ ✶) ----
    const R=mulberry(2024), cells=[]; for(let r=0;r<5;r++) for(let c=0;c<4;c++) cells.push({r,c});
    for(let i=cells.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); [cells[i],cells[j]]=[cells[j],cells[i]]; }
    const top=cells.filter(c=>c.r===0), rest=cells.filter(c=>c.r!==0), order=[top[0],top[1],...rest,...top.slice(2)];
    const targets=[]; Object.entries(A.counts).forEach(([sym,n])=>{ for(let i=0;i<n;i++) targets.push(sym); });
    for(let i=targets.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); [targets[i],targets[j]]=[targets[j],targets[i]]; }
    const distract=['diamond','cross','star','diamond','star','cross'], placed=[];
    targets.forEach((sym,i)=>placed.push({sym,cell:order[i]})); distract.forEach((sym,i)=>placed.push({sym,cell:order[targets.length+i]}));
    I.muralSymbols=placed.map(p=>({sym:p.sym,row:p.cell.r}));
    this._fsign(fr,7.4,H+3.9,halfW-.06,0,-1,5.4,5.6,(g,cw,ch)=>{ g.fillStyle='#b8a888'; g.fillRect(0,0,cw,ch); for(let i=0;i<500;i++){ g.fillStyle=`rgba(${110+R()*40|0},${90+R()*30|0},60,${R()*.12})`; g.fillRect(R()*cw,R()*ch,3+R()*20,2); }
      g.strokeStyle='#3a2a1c'; g.lineWidth=10; g.strokeRect(10,10,cw-20,ch-20);
      placed.forEach(p=>{ const x=(p.cell.c+.5)*cw/4+(R()-.5)*50, y=(p.cell.r+.5)*ch/5+(R()-.5)*34; g.fillStyle=['circle','triangle','square'].includes(p.sym)?'#4a1612':'#4a3a1c'; drawSymbol(g,p.sym,x,y,40); }); },1024,1024);
    { const q=V3p(10.2,H,-4.9); this.note(q.x,q.y,q.z,T.mural); this.box(-2.2,H,-5.6,{nails:3}); }
    // ---- mesa de leitura com gaveta (placa de ÍCARO) ----
    this._fb(fr,6.4,8.0,-6.0,-4.2,H,H+.9,C,{interactable:null});
    { const q=V3p(-5.1,H+.9,-7.2); this.note(q.x,q.y,q.z,T.desk); }
    const drawerPos=V3p(-5.1,H+1.05,-7.2);
    const drawer=this._smashBox(fr,6.4,6.55,-5.9,-4.3,H+.15,H+.8,MAT.metal,{hall,id:'drawer',hits:2,onBreak:()=>{ const tg=this._tagMesh(drawerPos,true); const tt=new Tag(tg,{hall,id:'t5',name:A.names[5]}); tg.userData={type:'tag',interactable:tt}; this._addHit(tg); refs.tags.push(tt); }});
    // ---- estante alta: a 7ª placa (nome do jogador). Sobe-se por uma linha de agarras na lateral ----
    this._fb(fr,6.4,8.4,-10.8,-9.4,H,H+5.0,C,{interactable:sf});
    this._fblock(fr,6.4,8.4,-10.8,-9.4,H+4.7,H+5.0,{mat:MAT.metal,type:'ledge',kind:'shelf'});
    for(let k=0;k<4;k++) this._fhold(fr,7.4+(k%2?.25:-.25),H+.7+k*.75,-9.4,0,1,false);
    this._fhold(fr,7.4,H+3.6,-9.4,0,1,false);
    const t7=this._tagMesh(V3p(-10.1,H+5.12,-7.4),true), tag7=new Tag(t7,{hall,id:'t6',name:(ctx)=>String((ctx&&ctx.game&&(ctx.game.playerName||ctx.game.name))||'VOCÊ').toUpperCase()});
    t7.userData={type:'tag',interactable:tag7}; this._addHit(t7); refs.tags.push(tag7);
    // estantes decorativas
    [[-12.9,-10.6],[-6.1,-5.0]].forEach(([za,zb2])=>this._fb(fr,-zb2,-za,-10.8,-9.9,H,H+3.4,C,{interactable:sf}));
    // ---- cofre do registro (canto direito da frente) ----
    const vx0=7.4, vz0=-13.35, vz1=-10.4;
    this._fb(fr,-vz1,-vz1+.25,vx0-.15,halfW,H,H+3.4,C,{interactable:sf});                                  // parede de trás do cofre (z=-10.4)
    this._fb(fr,-vz1,11.2,vx0-.3,vx0,H,H+3.4,C,{interactable:sf}); this._fb(fr,12.6,-vz0,vx0-.3,vx0,H,H+3.4,C,{interactable:sf}); this._fb(fr,11.2,12.6,vx0-.3,vx0,H+2.6,H+3.4,C,{interactable:sf});
    this._fb(fr,-vz1,-vz0,vx0-.3,halfW,H+3.4,H+3.65,MAT.metal,{cut:true});
    const vault=this._door(fr,11.9,vx0-.15,1.4,2.6,H,MAT.door,'u'); refs.doors.vault=vault;
    this._lbl(fr,11.9,H+3.0,vx0-.32,0,-1,1.8,.5,'COFRE','#c28aff');
    this._fb(fr,12.0,12.8,9.0,9.9,H,H+1.0,MAT.metal,{interactable:null});
    const lh=new THREE.Mesh(new THREE.BoxGeometry(1.0,1.2,1.0),IMAT.hidden); lh.position.set(9.45,H+1.1,-12.4); this.root.add(lh);
    const dec=new Decision({hall,id:'witness',route:'witness',label:'Levar os sete nomes para a superfície',text:T.decide}); lh.userData={type:'lectern',interactable:dec}; this._addHit(lh);
    { const q=V3p(9.7,H+1.0,-12.6); this.note(q.x,q.y,q.z,T.vault); const q2=V3p(9.2,H+1.0,-12.2); this.note(q2.x,q2.y,q2.z,T.last); }
    // ---- saída do labirinto: porta (grade) + teclado de 3 dígitos com visor ----
    const e0=I.e0, e1=I.e1, fm=(e0+e1)/2;
    refs.doors.hatch=this._door(fr,-zF+.15,fm,e1-e0,2.4,H,MAT.door,'v');
    const px=e1+1.2; this._box(px-.6,px+.6,H+.85,H+2.4,zF,zF+.04,MAT.metal,{interactable:null,solid:false,type:'panel'});
    const scr=canvasTex(256,144,()=>{}), sm=new THREE.Mesh(new THREE.PlaneGeometry(.8,.45),new THREE.MeshBasicMaterial({map:scr})); sm.position.set(px,H+2.06,zF+.045); this.root.add(sm);
    refs.display=(text,col)=>{ const g=scr.userData.ctx; g.fillStyle='#020802'; g.fillRect(0,0,256,144); g.fillStyle=col||'#7fe08a'; g.font='bold 54px monospace'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,128,76); scr.needsUpdate=true; }; refs.display('- - -');
    [['1','2','3'],['4','5','6'],['7','8','9'],['C','0','OK']].forEach((r,ri)=>r.forEach((lab,ci)=>{
      const tx=canvasTex(64,64,g=>{ g.fillStyle='#1d1f20'; g.fillRect(0,0,64,64); g.fillStyle='#cfc8b8'; g.font=`bold ${lab.length>1?26:34}px sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText(lab,32,34); });
      const m=new THREE.Mesh(new THREE.BoxGeometry(.11,.09,.035),new THREE.MeshStandardMaterial({map:tx,roughness:.7})); m.position.set(px-.13+ci*.13,H+1.6-ri*.115,zF+.06);
      this.root.add(m); m.userData={type:'button',interactable:new KeyButton(m,lab,hall)}; this.interactables.push(m); }));
    // ---- placas nos becos do labirinto (brilho azul fraco): 5 dos 7 nomes ----
    const g=I.grid, onRoute=new Set(I.route.map(([c,r])=>c+','+r)), dead=[];
    for(let c=0;c<M.cols;c++) for(let r=0;r<M.rows;r++){ let o=0; if(c<M.cols-1&&!g.E[c][r]) o++; if(c>0&&!g.E[c-1][r]) o++; if(r<M.rows-1&&!g.N[c][r]) o++; if(r>0&&!g.N[c][r-1]) o++; if(o===1&&!onRoute.has(c+','+r)) dead.push([c,r]); }
    dead.sort((a,b)=>(b[1]-a[1])||(a[0]-b[0]));
    I.deadTags=dead.slice(0,A.deadEnds);
    I.deadTags.forEach(([c,r],i)=>{ const x=(I.xb(c)+I.xb(c+1))/2, z=(I.zb(r)+I.zb(r+1))/2; const tg=this._tagMesh(V3p(x,H+.5,z),true), tt=new Tag(tg,{hall,id:'t'+i,name:A.names[i]});
      tg.userData={type:'tag',interactable:tt}; this._addHit(tg); refs.tags.push(tt); });
    I.code=String(A.counts.circle)+A.counts.triangle+A.counts.square;
    return refs;
  }
});

// ============================================================================
// RAMAIS opcionais: cada um conta um pedaço da história e antecipa os três caminhos
// ============================================================================
Object.assign(World.prototype,{
  _dressWing(w,fr,I){
    const {u1,u2,c,T,RW}=I, uc=(u1+u2)/2, P=(u,y,v)=>fr.p(u,y,v), A=MAT.archive, M=MAT.metal;
    const note=(u,y,v,text)=>{ const q=P(u,y,v); this.note(q.x,q.y,q.z,text); };
    const loot=(u,v,l)=>{ const q=P(u,T,v); this.box(q.x,q.y,q.z,l); };
    if(w.id==='w1'){        // dormitório: 7 beliches, 6 arrumados
      for(let i=0;i<3;i++) for(const sg of [-1,1]){ const u=u1+1.6+i*2.7, v=c+sg*(RW-.7); this._fb(fr,u-.95,u+.95,v-.45,v+.45,T,T+.5,A,{interactable:null}); this._fb(fr,u-.95,u-.7,v-.45,v+.45,T+.5,T+.8,MAT.paperWall,{interactable:null}); }
      note(u1+4.3,T+.5,c+(RW-.7),w.text); loot(u2-1.1,c-.5,{nails:2});
    } else if(w.id==='w2'){ // refeitório: mesa posta para sete
      this._fb(fr,uc-2.6,uc+2.6,c-.75,c+.75,T,T+.85,A,{interactable:null});
      for(let i=0;i<6;i++){ const u=uc-2.2+i*.88; this._fmesh(fr,new THREE.BoxGeometry(.28,.04,.28),MAT.paperWall,u,T+.87,c+(i%2?.35:-.35)); }
      this._fb(fr,uc-2.6,uc+2.6,c-1.4,c-1.05,T,T+.45,A,{interactable:null}); this._fb(fr,uc-2.6,uc+2.6,c+1.05,c+1.4,T,T+.45,A,{interactable:null});
      note(uc,T+.86,c,w.text); loot(u2-1,c+RW-.8,{pills:1});
    } else if(w.id==='w3'){ // sala do rádio
      this._fb(fr,u2-1.6,u2-.4,c-2.0,c+2.0,T,T+.9,A,{interactable:null});
      this._fmesh(fr,new THREE.BoxGeometry(.8,.45,.35),M,u2-1.0,T+1.12,c); this._fmesh(fr,new THREE.BoxGeometry(.3,.12,.04),MAT.glowAmber,u2-1.0,T+1.2,c-.2);
      this._fb(fr,uc-.2,uc+.4,c-.2,c+.4,T,T+.5,A,{interactable:null}); note(u2-1.0,T+.9,c+1.3,w.text); loot(u1+1,c-RW+.9,{nails:2});
    } else {                // capela
      this._fb(fr,u2-1.4,u2-.5,c-1.8,c+1.8,T,T+1.0,A,{interactable:null});
      for(let i=0;i<5;i++) this._fmesh(fr,new THREE.BoxGeometry(.07,.28,.07),MAT.glowAmber,u2-.95,T+1.15,c-1.4+i*.7);
      for(let i=0;i<3;i++) this._fb(fr,uc-1.6+i*1.6,uc-1.0+i*1.6,c-.4,c+.4,T,T+.45,A,{interactable:null});
      note(u2-.95,T+1.0,c,w.text); loot(u1+1,c+RW-.8,{pills:1,nails:2});
    }
  }
});
