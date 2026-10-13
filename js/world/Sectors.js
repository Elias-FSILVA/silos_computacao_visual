'use strict';
// ============================================================================
// js/world/Sectors.js — as alas que acompanham a circunferência do silo e os ventiladores. Estende World.prototype.
//   _exhaust     150 m  GALERIA DO EXAUSTOR: boca abrigada, corredor curvo (r 6,5–9,3) com porta pressurizada,
//                       poço de serviço com ESCADA até o braço de 174 m. O exaustor (169 m) fecha o poço e puxa o ar.
//   _hub         200 m  PÁTIO DAS MÁQUINAS: anel de circulação em volta do poço, máquinas, Casa de Força (energia),
//                       Estufa (freio) e o ELEVADOR de carga até 224 m.
//   _insuflador  246 m  grade + ventilador que sopra para cima: o fluxo leva o jogador até o mirante.
// Ventiladores (Fan): o ar anda ao longo do eixo do rotor; a velocidade depende da distância axial (decai até 'range')
// e da distância ao eixo (borda do duto); sólidos entre o rotor e o jogador fazem abrigo (grades não). world.wind(p)
// devolve a velocidade do ar no peito do jogador — o Player transforma isso em força (ver Player._wind).
// ============================================================================
class Fan{
  // pos: centro do rotor · axis: direção em que o ar ANDA (unitário) · mode 'pull' (aspira: a região fica antes do rotor,
  // e ele puxa para si) ou 'push' (sopra: a região fica depois) · radius: raio do rotor (pás) · duct: raio da coluna de ar
  // (o poço inteiro, num exaustor que fecha o poço; = radius numa coluna livre) · range: alcance axial (m)
  // speed: velocidade do ar junto ao rotor (m/s) · p: forma do decaimento · kill: profundidade da zona das pás (pull)
  constructor(o){ Object.assign(this,{p:1,kill:0,spinRate:5},o); if(this.duct==null) this.duct=this.radius; this.rot=null; }
  // ar no ponto: {u (m/s), d (distância axial do lado da região), rho (distância ao eixo), q (desvio lateral)} ou null
  // Num duto (poço) o ar só pode andar ao longo do eixo: a velocidade é a mesma em toda a seção (continuidade) e não há
  // componente radial; numa coluna livre ela cai a zero na borda (0,7 m de transição).
  sample(x,y,z){
    const A=this.axis, dx=x-this.pos.x, dy=y-this.pos.y, dz=z-this.pos.z, s=dx*A.x+dy*A.y+dz*A.z, d=this.mode==='pull'?-s:s;
    if(d<0||d>this.range) return null;
    const qx=dx-s*A.x, qy=dy-s*A.y, qz=dz-s*A.z, rho=Math.hypot(qx,qy,qz);
    const edge=clamp((this.duct+.35-rho)/.7,0,1); if(edge<=0) return null;
    return {u:this.speed*Math.pow(1-d/this.range,this.p)*smooth(edge),d,rho,qx,qy,qz};
  }
  spin(dt){ if(this.rot) this.rot.rotation.y+=dt*this.spinRate; }
}

// rungs/agarras de escada: barra visível + caixa invisível (fácil de mirar), tratadas como 'hold' pela escalada
const LADDER_HIT=new THREE.BoxGeometry(.16,.15,.62); LADDER_HIT.userData.shared=true;

// painel do elevador dentro da cabine: F aciona (se o Pátio deixar)
class ElevatorControl extends Interactable{
  constructor(hall){ super(); this.hall=hall; }
  canInteract(ctx){ const el=ctx.world.elevator; if(!el||el.state!=='bottom') return null; return {prompt:'Acionar o elevador de carga',reticle:'panel'}; }
  interact(ctx){
    const p=ctx.game.puzzles, why=p.allow(this.hall,'elevator',{});
    if(why!==true){ ctx.ui.msg(typeof why==='string'?why:'O elevador não responde.',2.4); _snd(ctx,'deny'); return; }
    p.event(this.hall,'elevator',{});
  }
}

// elevador de carga: cabine (sólido flat que sobe) + portas de baixo/de cima. Leva junto quem estiver dentro da cabine.
class Elevator{
  constructor(world,o){ Object.assign(this,o); this.world=world; this.state='bottom'; this.y=o.y0; this.t=0; }
  inCabin(p){ const q=p.position, c=this.pd; return q.x>=c.minX-.05&&q.x<=c.maxX+.05&&q.z>=c.minZ-.05&&q.z<=c.maxZ+.05&&q.y>=c.top-.6&&q.y<=c.top+2.7; }
  start(){ if(this.state!=='bottom') return false; this.state='closing'; this.t=0; this.doors.bottom.set(false); return true; }
  _set(y){ const d=y-this.pd.top; this.pd.top=y; this.pd.bottom=y-.3; this.car.position.y+=d; this.y=y; }
  update(dt,player){
    if(this.state==='closing'){ this.t+=dt; if(this.t>=1.4){ this.state='moving'; this.t=0; if(this.onMove) this.onMove(); } return; }
    if(this.state!=='moving') return;
    this.t+=dt; const left=this.y1-this.y, v=this.speed*clamp(Math.min(this.t/1.2,left/1.6+.12),.12,1), dy=Math.min(left,v*dt);
    const carry=player&&!player.dead&&this.inCabin(player);
    this._set(this.y+dy);
    if(carry){ player.position.y+=dy; if(player._prev) player._prev.y+=dy; }
    if(this.y>=this.y1-1e-6){ this._set(this.y1); this.state='top'; this.doors.top.set(true); if(this.onArrive) this.onArrive(); }
  }
}

Object.assign(World.prototype,{
  // ar no peito do jogador (pés p): soma dos ventiladores que alcançam o ponto sem abrigo. {air: V3 (m/s), g (0–1), fan} |
  // {kill:true, fan} (nas pás de um exaustor) | null
  wind(p){
    let res=null; const cy=p.y+1.0;
    for(const f of this.fans){
      const s=f.sample(p.x,cy,p.z); if(!s) continue;
      if(f.mode==='pull'&&s.d<f.kill&&s.rho<f.radius) return {kill:true,fan:f};
      // abrigo: do ponto do rotor diante do jogador até o peito; grades (porous) e as peças do próprio ventilador não contam.
      // Só testa os sólidos que cabem na coluna de ar do ventilador (lista refeita quando o mundo ganha/perde sólidos)
      if(!f._near||f._nearN!==this.platforms.length){ const A=f.axis, e=f.range, w=f.duct+.5, lo={x:f.pos.x-w+Math.min(0,A.x*e*(f.mode==='pull'?-1:1)),y:f.pos.y-w+Math.min(0,A.y*e*(f.mode==='pull'?-1:1)),z:f.pos.z-w+Math.min(0,A.z*e*(f.mode==='pull'?-1:1))};
        const hi={x:f.pos.x+w+Math.max(0,A.x*e*(f.mode==='pull'?-1:1)),y:f.pos.y+w+Math.max(0,A.y*e*(f.mode==='pull'?-1:1)),z:f.pos.z+w+Math.max(0,A.z*e*(f.mode==='pull'?-1:1))};
        f._near=this.platforms.filter(b=>!b.porous&&b.fan!==f&&b.maxX>=lo.x&&b.minX<=hi.x&&b.maxZ>=lo.z&&b.minZ<=hi.z&&b.top>=lo.y&&solidBottom(b)<=hi.y); f._nearN=this.platforms.length; }
      const k=s.rho>f.radius?f.radius/s.rho:1, qx=f.pos.x+s.qx*k, qy=f.pos.y+s.qy*k, qz=f.pos.z+s.qz*k;
      if(segBlocked(f._near,qx,qy,qz,p.x,cy,p.z)) continue;
      // g = quanto do arrasto relativo vale aqui: pleno no fluxo forte, quase nada na borda fraca (quem cai rápido numa
      // brisa não é freado de repente)
      if(!res) res={air:new V3(),g:0,fan:f};
      const g=Math.min(1,1.6*s.u/f.speed); res.air.addScaledVector(f.axis,s.u); if(g>res.g){ res.g=g; res.fan=f; }
    }
    return res;
  },
  // rotor visual (pás + cubo) centrado em c, girando em torno de y; raio r
  _rotor(c,r,blades,mat){
    const g=new THREE.Group(); g.position.copy(c); this.root.add(g);
    for(let i=0;i<blades;i++){ const b=new THREE.Mesh(new THREE.BoxGeometry(r*.92,.05,r*.34),mat); b.position.set(Math.cos(i*TAU/blades)*r*.5,0,Math.sin(i*TAU/blades)*r*.5);
      b.rotation.y=-i*TAU/blades; b.rotation.x=.32; g.add(b); }
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(r*.15,r*.15,.5,16),MAT.metal); g.add(hub);
    return g;
  },
  // placa com texto (canvas) presa numa parede: pos, yaw (para onde a face olha); com note, F lê o texto completo
  _plaque(pos,yaw,w,h,lines,o={}){
    const col=o.color||'#e8c15a', t=canvasTex(512,Math.round(512*h/w),(g,cw,ch)=>{ g.fillStyle=o.bg||'#14110d'; g.fillRect(0,0,cw,ch); g.strokeStyle=col; g.lineWidth=8; g.strokeRect(4,4,cw-8,ch-8);
      g.fillStyle=col; g.textAlign='center'; g.textBaseline='middle'; const n=lines.length, lh=ch/(n+1);
      lines.forEach((s,i)=>{ g.font=`bold ${Math.min(64,lh*(i===0?.62:.5))|0}px sans-serif`; g.fillText(s,cw/2,lh*(i+1)); }); });
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:.7,metalness:.2,emissive:o.glow?0x332a10:0x000000}));
    m.position.copy(pos); m.rotation.y=yaw; this.root.add(m);
    if(o.note){ m.userData={type:'note',interactable:new Note(o.note)}; this._addHit(m); }
    return m;
  },
  // escada de marinheiro numa parede do referencial fr (u = distância ao eixo do poço): degraus agarráveis de y0 a y1
  _ladder(fr,u,v,y0,y1,step=.38){
    for(const s of [-1,1]){ const r=this._fmesh(fr,new THREE.BoxGeometry(.06,y1-y0+.6,.06),MAT.rust,u-.05,(y0+y1)/2,v+s*.27); r.userData={type:'decor'}; }
    const n=fr.n(-1,0), ys=[]; for(let y=y0;y<=y1+1e-6;y+=step) ys.push(y);
    // degraus: uma malha instanciada para o desenho (uma chamada só) + uma caixa invisível por degrau para agarrar
    const bars=new THREE.InstancedMesh(new THREE.BoxGeometry(.6,.045,.045),MAT.rust,ys.length), d=new THREE.Object3D();
    ys.forEach((y,i)=>{
      const hit=new THREE.Mesh(LADDER_HIT,IMAT.hidden); hit.position.copy(fr.p(u-.09,y,v)); hit.rotation.y=fr.yaw(-1,0);
      hit.userData={grab:true,type:'hold',crumble:false,alive:true,wallNormal:n.clone(),rung:true};
      this.root.add(hit); this.grabbables.push(hit);
      d.position.copy(hit.position); d.rotation.y=hit.rotation.y; d.updateMatrix(); bars.setMatrixAt(i,d.matrix);
    });
    bars.instanceMatrix.needsUpdate=true; this.root.add(bars);
  },
  // faixa [a0,a1] de uma porta lateral (v0..v1, referencial θ) numa parede curva de raio r
  _doorArc(theta,v0,v1,r){ return {a0:theta+Math.asin(v0/r),a1:theta+Math.asin(v1/r)}; },
  // parede curva com portas: r0..r1, de y0 a y1, anel inteiro (ou [a0,a0+span]) menos as portas [{a0,a1,y0,y1}]
  _arcWall(r0,r1,y0,y1,doors,mat,o={},a0=0,span=TAU){
    const ys=new Set([y0,y1]); doors.forEach(d=>{ ys.add(clamp(d.y0,y0,y1)); ys.add(clamp(d.y1,y0,y1)); }); const Y=[...ys].sort((p,q)=>p-q);
    for(let i=0;i<Y.length-1;i++){ const ya=Y[i], yb=Y[i+1]; if(yb-ya<1e-6) continue; const mid=(ya+yb)/2;
      for(const [s0,s1] of this._subtract(a0,span,doors.filter(d=>mid>d.y0&&mid<d.y1))) this._arc({r0,r1,a0:a0+s0,span:s1-s0},ya,yb,mat,o); }
  },

  // =====================================================================================
  // GALERIA DO EXAUSTOR (150 m) + exaustor (169 m) + poço de serviço com escada + braço de 174 m
  // =====================================================================================
  _exhaust(E){
    const H=E.H, R=SHAFT_R, r0=R+SHELL_T, r1=E.r1, t=.3, h=E.h, sf=SURFACE.concrete, C=MAT.concreteCold, M=MAT.metal, hall=E.id;
    const refs={};
    // ---- boca da galeria: descanso com marquise de aço (abrigo do fluxo) ----
    this._ledge(E.entryA,3.2,1.8,H,{label:'Galeria de manutenção',id:'cp7',kind:'rest'});
    this._arc({r0:R-2.0,r1:R+.02,a0:E.entryA-1.9/R,span:3.8/R},H+2.75,H+2.9,M,{kind:'canopy',flat:true,interactable:null});
    { const n=polar(R-.55,E.entryA-.9/R,H); this.note(n.x,H,n.z,NOTES[148]); const b=polar(R-.75,E.entryA+.8/R,H); this.box(b.x,H,b.z,{pills:1,nails:2}); }
    // ---- rota antiga (tentação): sobe pela parede para dentro da zona de sucção; placa de perigo ----
    const O=E.oldRoute; this.path(O.a0,O.y0,O.a1,O.y1,{step:CLIMB.step,jl:CLIMB.jitterLat,jy:CLIMB.jitterY});
    { const a=(O.a0+O.a1)/2+.12, p=polar(R-.03,a,O.y0+1.3); this._plaque(p,Math.atan2(-Math.cos(a),-Math.sin(a)),1.3,.7,['PERIGO','ZONA DE SUCÇÃO'],{color:'#ff5a3a',glow:true}); }
    // ---- corredor curvo protegido: r de r0 a r1, de a0 a a1 (por dentro da parede do silo) ----
    const ta=t/r0, A0=E.a0-ta, SP=E.a1-E.a0+2*ta, svc=this._doorArc(E.shaftTheta,-1.0,1.0,r1+t/2);
    this._arc({r0:R+.02,r1:r1+t,a0:A0,span:SP},H-.3,H-.003,C,{kind:'floor',flat:true,interactable:sf});
    this._arc({r0:r0-.3,r1:r1+t,a0:A0,span:SP},H+h,H+h+t,C,{cut:true,interactable:sf});
    this._arcWall(r1,r1+t,H,H+h,[{...svc,y0:H,y1:H+2.6}],C,{interactable:sf},A0,SP);
    this._arc({r0:r0-.3,r1:r1,a0:E.a0-ta,span:ta},H,H+h,C,{interactable:sf}); this._arc({r0:r0-.3,r1:r1,a0:E.a1,span:ta},H,H+h,C,{interactable:sf});
    // obstáculos industriais encostados na parede externa (o corredor continua com 2 m livres)
    for(const a of [1.0,2.1,2.75]){ const c=polar(r1-.42,a); this._obox(c.x,c.z,.4,.6,a,H,H+(a>2.5?1.1:2.2),M,{interactable:null}); }
    this._arc({r0:r1-.35,r1:r1-.15,a0:E.a0,span:E.a1-E.a0},H+h-.45,H+h-.25,MAT.pipe,{solid:false,ray:false});   // tubulação no teto
    for(const a of [.9,1.9,2.9]){ const L=new THREE.PointLight(0xffc27a,.8,7,1.7); L.position.copy(polar((r0+r1)/2,a,H+h-.4)); this.root.add(L);
      const lb=new THREE.Mesh(new THREE.BoxGeometry(.12,.06,1.2),MAT.glowAmber); lb.position.copy(polar((r0+r1)/2,a,H+h-.05)); lb.rotation.y=-a; this.root.add(lb); }
    { const b=polar(r1-.6,2.35,H); this.box(b.x,H,b.z,{nails:2}); }
    // ---- porta pressurizada (radial, na direção sul) + registro de ar emperrado ao lado ----
    const frD=this._fr(E.doorA);
    refs.door=this._door(frD,(r0+r1)/2,0,r1-r0+.1,h,H,MAT.door,'u');
    { const a=E.doorA-.32, fw=this._fr(a); refs.register=this._makeWheel(fw.p(r1-.12,H+1.35,0),{yaw:fw.yaw(-1,0),hall,id:'register',label:'Registro de ar',steps:2,jam:E.registerJam,mat:MAT.rust,r:.36});
      const pl=polar(r1-.03,a+.16,H+1.5); this._plaque(pl,Math.atan2(-Math.cos(a),-Math.sin(a)),1.0,.6,['REGISTRO','DE AR'],{color:'#ff9a5a'});
      const n=polar(r0+.9,E.doorA-.18,H); this.note(n.x,H,n.z,EXHAUST_TEXT.door); }
    { const p=frD.p((r0+r1)/2,H+h-.35,-.17); this._plaque(p,frD.yaw(0,-1),1.6,.4,['PORTA PRESSURIZADA'],{color:'#ff9a5a'}); }
    // ---- poço de serviço (oeste, além do corredor) com a escada até 174 m e o braço de volta ao poço ----
    const fr=this._fr(E.shaftTheta), u0=r1+t, u1=u0+2.4, top=E.top, yTop=top+3.4, V=1.2;
    this._fb(fr,r1,u1+t,-V-t,V+t,H-.3,H,C,{kind:'floor',flat:true});
    this._fwall(fr,r1,u0,-V-t,V+t,H+h+t,yTop,[{v0:-V,v1:V,y0:top,y1:top+2.6}],C,{interactable:sf});            // parede próxima acima do corredor, com a porta do braço de 174 m
    this._fb(fr,r1-.1,u1+t,-V-t,-V,H,yTop,C,{interactable:sf}); this._fb(fr,r1-.1,u1+t,V,V+t,H,yTop,C,{interactable:sf});
    this._fb(fr,u1,u1+t,-V,V,H,yTop,C,{interactable:sf}); this._fb(fr,r1-.1,u1+t,-V-t,V+t,yTop,yTop+t,C,{cut:true});
    this._ladder(fr,u1,0,H+.45,top-.45);
    this._fblock(fr,u0,u0+1.3,-V,V,top-.3,top,{mat:M,type:'ledge',kind:'landing',flat:true});                // patamar no alto da escada
    this._fblock(fr,u1-1.3,u1,.45,V,(H+top)/2-.3,(H+top)/2,{mat:MAT.grate,type:'ledge',kind:'landing',flat:true,porous:true});   // descanso no meio, ao lado da escada
    { const p=fr.p(u0+.02,H+2.0,.9); this._plaque(p,fr.yaw(1,0),.9,.5,['ESCADA','↑ 174 m'],{color:'#7fe08a',note:EXHAUST_TEXT.service}); }
    // braço de 174 m: do poço de serviço até a parede do poço (acima do exaustor)
    const uw=v=>Math.sqrt(Math.max(0,R*R-v*v))-.02;
    this._fb(fr,R,u0,-V-t,V+t,top-.3,top-.005,C,{kind:'floor',flat:true});
    this._fb(fr,uw(V),u0,-V-t,-V,top,top+2.9,C,{interactable:sf}); this._fb(fr,uw(V),u0,V,V+t,top,top+2.9,C,{interactable:sf});
    this._fb(fr,uw(0),u0,-V-t,V+t,top+2.6,top+2.9,C,{cut:true});
    this._exitPlat(this._opA('ex174_out'),top,'Casa do exaustor','cp_exa',NOTES[175],{nails:2});
    // ---- o exaustor: carcaça presa à parede, disco das pás (sólido) e rotor; aspira o poço de baixo para cima ----
    const F=E.fan, fan=new Fan({name:'exaustor',pos:new V3(0,F.y,0),axis:new V3(0,1,0),mode:'pull',radius:F.radius,duct:R+.3,range:F.range,speed:F.speed,p:F.p,kill:F.kill,spinRate:7});
    this._arc({r0:F.radius,r1:R+.04,a0:0,span:TAU},F.y-.6,F.y+1.6,M,{kind:'fan',interactable:null}).userData.solid.fan=fan;
    this._arc({r0:0,r1:F.radius+.03,a0:0,span:TAU},F.y-.15,F.y+.15,IMAT.hidden,{kind:'fan',interactable:null,ray:false,flat:true}).userData.solid.fan=fan;
    fan.rot=this._rotor(new V3(0,F.y,0),F.radius,7,MAT.rust);
    for(let k=0;k<3;k++) this._obox(0,0,R,.12,k*Math.PI/3,F.y+.9,F.y+1.15,M,{solid:false,ray:false});         // travessas do motor
    { const mo=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.0,1.4,20),M); mo.position.set(0,F.y+1.3,0); this.root.add(mo); }
    this.fans.push(fan); refs.fan=fan;
    // ---- zonas: a massa fica contida enquanto o jogador está na galeria / no poço de serviço / no braço ----
    const zarc={cx:0,cz:0,r0:r0-.25,r1:r1+t,a0:A0,span:SP};
    const box=(a,b,c,d,y0,y1)=>{ const [x0,x1,z0,z1]=fr.box(a,b,c,d); return {minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:y0,maxY:y1}; };
    this.puzzleRooms[hall]={id:hall,kind:'exhaust',baseY:H,cap:H-6,refs,
      zoneRoom:{...arcBounds(zarc),minY:H-.2,maxY:H+h+t,arc:zarc},
      zones:[box(r1-.1,u1+t,-V-t,V+t,H-.2,yTop),box(R+SHELL_T-.2,u0,-V-t,V+t,top-.2,top+2.9)]};
    this.puzzleDefs.push({id:hall,kind:'hall'});
  },

  // =====================================================================================
  // PÁTIO DAS MÁQUINAS (200 m): anel + Casa de Força (leste) + Estufa (oeste) + elevador de carga (sul) até 224 m
  // =====================================================================================
  _hub(Hc,greenCfg,reg){
    const H=Hc.H, R=SHAFT_R, r0=R+SHELL_T, r1=Hc.rOut, t=Hc.t, h=Hc.h, rm=r1+t/2, sf=SURFACE.concrete, C=MAT.concreteCold, M=MAT.metal, hall=Hc.id;
    const refs={gens:[],lamps:[],status:{}}, EL=Hc.elevator, PW=Hc.power, vin=1.8*greenCfg.m, aw=1.2;
    // ---- o anel: piso, teto e parede externa (com as três portas) ----
    const doors=[{...this._doorArc(PW.theta,-aw,aw,rm),y0:H,y1:H+2.6},{...this._doorArc(greenCfg.theta,vin-aw,vin+aw,rm),y0:H,y1:H+2.6},{...this._doorArc(EL.theta,-aw,aw,rm),y0:H,y1:H+2.6}];
    this._arc({r0:R+.02,r1:r1+t,a0:0,span:TAU},H-.3,H-.003,MAT.foundry,{kind:'floor',flat:true,interactable:null});
    this._arc({r0:r0-.3,r1:r1+t,a0:0,span:TAU},H+h,H+h+t,C,{cut:true,interactable:sf});
    this._arcWall(r1,r1+t,H,H+h,doors,C,{interactable:sf});
    // batentes de aço nas portas (fecham a fresta entre a parede curva do anel e a parede reta de cada setor)
    for(const [th,v0,v1] of [[PW.theta,-aw,aw],[greenCfg.theta,vin-aw,vin+aw],[EL.theta,-aw,aw]]){ const fr=this._fr(th);
      for(const [a,b] of [[v0-.15,v0],[v1,v1+.15]]) this._fb(fr,r1-.25,14.8,a,b,H,H+2.75,M,{interactable:null});
      this._fb(fr,r1-.25,14.8,v0-.15,v1+.15,H+2.6,H+2.75,M,{interactable:null,ray:false}); }
    // ---- máquinas distribuídas em volta (sólidos girados na direção da parede) e tubulação ----
    const machine=(a,w,d,ht,mat)=>{ const c=polar(r1-.25-d/2,a); this._obox(c.x,c.z,d/2,w/2,a,H,H+ht,mat,{interactable:null}); return c; };
    machine(-Math.PI/4,2.2,2.6,2.4,MAT.pump); machine(Math.PI/4,1.8,2.2,2.0,M); machine(Math.PI*3/4,2.6,2.0,1.6,MAT.pump); machine(-Math.PI*3/4,1.6,2.4,2.8,M);
    machine(-Math.PI/4+.32,1.0,1.2,1.2,MAT.rust); machine(Math.PI*3/4+.3,1.0,1.0,.9,MAT.rust);
    for(const a of [-Math.PI/4,Math.PI*3/4]){ const p=polar(r1-1.5,a); const fly=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,.35,20),MAT.rust); fly.position.set(p.x,H+2.6,p.z); fly.rotation.z=Math.PI/2; fly.rotation.y=-a; this.root.add(fly); }
    for(const a of [.55,1.2,2.1,2.6,-.6,-2.4]){ const p=polar(r1-.35,a); this.pipe(p.x,p.z,H,H+h); }
    this._arc({r0:r1-.6,r1:r1-.4,a0:0,span:TAU},H+h-.7,H+h-.5,MAT.pipe,{solid:false,ray:false,segs:96});
    this._arc({r0:r0+.2,r1:r0+.4,a0:0,span:TAU},H+h-.5,H+h-.3,MAT.pipe,{solid:false,ray:false,segs:96});
    for(let k=0;k<6;k++){ const a=k*TAU/6+.3, L=new THREE.PointLight(0xffd9a0,.9,11,1.6); L.position.copy(polar((r0+r1)/2,a,H+h-.6)); this.root.add(L);
      const lb=new THREE.Mesh(new THREE.BoxGeometry(.14,.07,1.6),MAT.glowAmber); lb.position.copy(polar((r0+r1)/2,a,H+h-.05)); lb.rotation.y=-a; this.root.add(lb); }
    // ---- plataforma segura na entrada: tablado, banco e poucos recursos (1 pílula, 2 pregos) ----
    const ea=Hc.entryA;
    this._arcBlock({r0:r0+.4,r1:r0+3.2,a0:ea-.55,span:1.1},H,H+.35,{mat:MAT.woodDeck,type:'ledge',kind:'rest',flat:true});
    { const b=polar(r0+2.4,ea+.32,H+.35); this.box(b.x,H+.35,b.z,{pills:1,nails:2}); const s=polar(r0+2.7,ea-.3,0); this._obox(s.x,s.z,.25,.8,ea,H+.35,H+.8,MAT.archive,{interactable:null}); }
    this.checkpoints.push({id:'cp_patio',label:'Pátio das Máquinas',bonus:500,optional:false,position:polar(r0+1.8,ea,H),radius:2.4});
    // ---- painel do elevador no anel: placa do motor (demanda), regras e as duas luzes de estado ----
    { const fe=this._fr(EL.theta), face=fe.yaw(-1,0);
      this._plaque(fe.p(r1-.02,H+2.0,-2.4),face,1.5,1.0,['MOTOR DO ELEVADOR','DEMANDA: '+POWER.demand+' MW','freio: hidráulico'],{note:POWER_TEXT.motor,glow:true});
      this._plaque(fe.p(r1-.02,H+2.0,2.4),face,1.5,1.0,['ELEVADOR DE CARGA',HUB.H+' m → '+EL.top+' m','energia + freio'],{note:POWER_TEXT.elevator});
      const lamp=(v,txt)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(.32,.32,.08),MAT.darkLamp); m.position.copy(fe.p(r1-.05,H+2.95,v)); m.rotation.y=face; this.root.add(m);
        this._plaque(fe.p(r1-.03,H+3.35,v),face,.8,.22,[txt],{color:'#d8d2c4'}); return m; };
      refs.status.power=lamp(-1.75,'ENERGIA'); refs.status.brake=lamp(1.75,'FREIO');
      const red=new THREE.MeshBasicMaterial({color:0xb02a1a}); refs.status.power.material=red; refs.status.brake.material=red;
      refs.setStatus=(k,on)=>{ refs.status[k].material=on?MAT.glowGreen:red; }; }
    // ---- os dois setores de puzzle e o elevador ----
    this._powerHouse(Hc,refs);
    reg(greenCfg,this._greenhouse(greenCfg));
    this._elevator(Hc,refs);
    // ---- zonas: anel (setor anelar), Casa de Força, poço do elevador e braço de 224 m; a Estufa entra pela sala-filha ----
    const zarc={cx:0,cz:0,r0:r0-.25,r1:r1+t,a0:0,span:TAU}, zf=(th,a,b,c,d,y0,y1)=>{ const [x0,x1,z0,z1]=this._fr(th).box(a,b,c,d); return {minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:y0,maxY:y1}; };
    this.puzzleRooms[hall]={id:hall,kind:'hub',baseY:H,cap:H-6,refs,children:[greenCfg.id],
      zoneRoom:{...arcBounds(zarc),minY:H-.2,maxY:H+h+t,arc:zarc},
      zones:[zf(PW.theta,r1,PW.u1+.3,-PW.V-.3,PW.V+.3,H-.2,H+PW.h+.3),zf(EL.theta,r1,EL.u1+.3,-EL.V,EL.V,H-.6,EL.top+3.4),zf(EL.theta,r0-.2,r1,-1.5,1.5,EL.top-.2,EL.top+2.9)]};
    this.puzzleDefs.push({id:hall,kind:'hall'});
  },
  // CASA DE FORÇA (leste do anel): quatro geradores com a potência pintada, barramento e visor de carga
  _powerHouse(Hc,refs){
    const P0=Hc.power, H=Hc.H, fr=this._fr(P0.theta), uN=14.5, uF=P0.u1, V=P0.V, h=P0.h, t=.3, hall=Hc.id, sf=SURFACE.concrete, W1=MAT.foundry, M=MAT.metal, P=(u,y,v)=>fr.p(u,y,v);
    this._fb(fr,uN,uF+t,-V-t,V+t,H-.3,H,W1,{kind:'floor',flat:true,interactable:null});
    this._fwall(fr,uN,uN+t,-V-t,V+t,H,H+h+t,[{v0:-1.2,v1:1.2,y0:H,y1:H+2.6}],MAT.brickSoot,{interactable:sf,cut:true});
    this._fb(fr,uF,uF+t,-V-t,V+t,H,H+h+t,MAT.brickSoot,{interactable:sf,cut:true});
    this._fb(fr,uN,uF,-V-t,-V,H,H+h+t,MAT.brickSoot,{interactable:sf,cut:true}); this._fb(fr,uN,uF,V,V+t,H,H+h+t,MAT.brickSoot,{interactable:sf,cut:true});
    this._fb(fr,uN,uF+t,-V-t,V+t,H+h,H+h+t,M,{cut:true});
    // geradores G1…G4 (ordem física, de −v para +v), com placa da potência, lâmpada e alavanca
    const gv=[-4.8,-1.6,1.6,4.8];
    gv.forEach((v,i)=>{
      this._fb(fr,uF-2.0,uF,v-1.0,v+1.0,H,H+2.6,MAT.pump,{interactable:null});
      this._fmesh(fr,new THREE.CylinderGeometry(.35,.35,1.6,14),MAT.pipe,uF-1.0,H+3.4,v).rotation.x=0;
      this._fsign(fr,uF-2.02,H+1.95,v,-1,0,1.1,.75,(g,cw,ch)=>{ g.fillStyle='#15120d'; g.fillRect(0,0,cw,ch); g.strokeStyle='#c9a227'; g.lineWidth=6; g.strokeRect(3,3,cw-6,ch-6);
        g.fillStyle='#e8c15a'; g.textAlign='center'; g.textBaseline='middle'; g.font='bold 40px sans-serif'; g.fillText('G'+(i+1),cw/2,ch*.32); g.font='bold 52px sans-serif'; g.fillText(POWER.ratings[i]+' MW',cw/2,ch*.7); },256,176);
      const lamp=this._fmesh(fr,new THREE.BoxGeometry(.3,.12,.3),MAT.darkLamp,uF-1.0,H+2.66,v); refs.lamps.push(lamp);
      const lv=this._makeLever(P(uF-2.18,H+1.0,v),fr.yaw(-1,0),{hall,id:'gen:'+i,label:'Gerador G'+(i+1),jam:POWER.jam[i],deny:'O barramento está desarmado. Espere o rearme.'});
      refs.gens.push(lv);
    });
    // barramento (parede esquerda) com o visor de carga
    refs.bus=this._makeLever(P(18.2,H+1.2,-V+.06),fr.yaw(0,1),{hall,id:'bus',label:'Barramento',deny:'O barramento está desarmado. Espere o rearme.',knob:MAT.glowGreen});
    const scr=canvasTex(512,256,()=>{}), sm=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.8),new THREE.MeshBasicMaterial({map:scr})); sm.position.copy(P(18.2,H+2.5,-V+.05)); sm.rotation.y=fr.yaw(0,1); this.root.add(sm);
    this._fb(fr,17.25,19.15,-V,-V+.04,H+2.0,H+3.0,M,{interactable:null,solid:false,ray:false});
    refs.display=(load,state,col)=>{ const g=scr.userData.ctx; g.fillStyle='#030803'; g.fillRect(0,0,512,256); g.fillStyle='#4fa05a'; g.font='bold 30px monospace'; g.textAlign='center'; g.textBaseline='middle';
      g.fillText('BARRAMENTO · CARGA',256,46); g.fillStyle=col||'#9bffa8'; g.font='bold 96px monospace'; g.fillText(load+' MW',256,132); g.font='bold 30px monospace'; g.fillText(state||'',256,214); scr.needsUpdate=true; };
    refs.display(0,'DESLIGADO');
    this._lbl(fr,18.2,H+3.35,-V+.06,0,1,2.2,.45,'BARRAMENTO','#e8c15a');
    // mesa com o diário da engenheira e a regra de operação; transformadores de decoração
    this._fb(fr,16.0,17.6,4.6,6.4,H,H+.9,M,{interactable:null});
    { const q=P(16.8,H+.9,5.5); this.terminal(q.x,q.y,q.z,fr.yaw(0,-1),POWER_TEXT.log); const n=P(17.3,H+.9,4.9); this.note(n.x,n.y,n.z,POWER_TEXT.rule); }
    for(const v of [-5.6,5.6]) this._fb(fr,20.5,21.9,v-.7,v+.7,H,H+1.8,MAT.pump,{interactable:null});
    for(const [u,v] of [[17,-3],[22,3],[17,3]]){ const L=new THREE.PointLight(0xffb070,.0,10,1.6); L.position.copy(P(u,H+h-.6,v)); this.root.add(L); (refs.powerLights=refs.powerLights||[]).push(L); }
    { const L=new THREE.PointLight(0xff8040,.55,9,1.8); L.position.copy(P(18,H+4,0)); this.root.add(L); refs.emergency=L; }   // luz de emergência (até a energia voltar)
    this._fmesh(fr,new THREE.BoxGeometry(.1,.1,2*V),MAT.pipe,uF-.4,H+h-.5,0);
  },
  // ELEVADOR DE CARGA (sul do anel): poço com duas portas (200 m e 224 m), cabine que sobe com o jogador, freio
  // travado pelas raízes e o braço de 224 m que devolve ao poço acima do diafragma
  _elevator(Hc,refs){
    const E=Hc.elevator, H=Hc.H, top=E.top, fr=this._fr(E.theta), u0=14.5, uw0=u0+.3, u1=E.u1, V=E.V, t=.3, C=MAT.concreteCold, M=MAT.metal, sf=SURFACE.concrete, hall=Hc.id;
    const yTop=top+3.4;
    // poço: parede próxima (porta de baixo e porta de cima), fundo, laterais, teto e fosso
    this._fwall(fr,u0,uw0,-V,V,H-.3,yTop,[{v0:-1.2,v1:1.2,y0:H,y1:H+2.6},{v0:-1.2,v1:1.2,y0:top,y1:top+2.6}],C,{interactable:sf,cut:true});
    this._fb(fr,u1,u1+t,-V,V,H-.6,yTop,C,{interactable:sf,cut:true});
    this._fb(fr,u0,u1+t,-V-t,-V+.0001,H-.6,yTop,C,{interactable:sf,cut:true}); this._fb(fr,u0,u1+t,V-.0001,V+t,H-.6,yTop,C,{interactable:sf,cut:true});
    this._fb(fr,u0,u1+t,-V-t,V+t,yTop,yTop+t,C,{cut:true});
    this._fb(fr,uw0,u1,-V,V,H-.9,H-.6,C,{kind:'floor',flat:true});
    for(const v of [-V+.08,V-.08]) this._fmesh(fr,new THREE.BoxGeometry(.08,yTop-H+.6,.08),M,u1-.2,(yTop+H-.6)/2,v);   // guias
    // portas (a de baixo começa aberta; a de cima, fechada)
    const dB=this._door(fr,u0+.15,0,2.4,2.6,H,MAT.door,'v'), dT=this._door(fr,u0+.15,0,2.4,2.6,top,MAT.door,'v');
    dB.set(true,true);
    // cabine: piso (sólido que sobe), grades baixas e o painel de comando preso a ela
    const car=new THREE.Group(); this.root.add(car);
    const cu0=uw0+.05, cu1=u1-.05, cv=V-.08, [x0,x1,z0,z1]=fr.box(cu0,cu1,-cv,cv);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,.3,z1-z0),MAT.grate); floor.position.set((x0+x1)/2,H-.15,(z0+z1)/2); car.add(floor);
    const pd={minX:x0,maxX:x1,minZ:z0,maxZ:z1,top:H,bottom:H-.3,kind:'elevator',flat:true,porous:true}; this.platforms.push(pd); floor.userData={type:'elevator',solid:pd}; this.walls.push(floor);
    const rail=(a,b,c,d)=>{ const [p0,p1,q0,q1]=fr.box(a,b,c,d), m=new THREE.Mesh(new THREE.BoxGeometry(p1-p0,.06,q1-q0),M); m.position.set((p0+p1)/2,H+1.0,(q0+q1)/2); car.add(m); };
    rail(cu1-.06,cu1,-cv,cv); rail(cu0,cu1,-cv,-cv+.06); rail(cu0,cu1,cv-.06,cv);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.5,.7,.12),M), pp=fr.p(cu1-.12,H+1.25,.7); panel.position.set(pp.x,H+1.25,pp.z); panel.rotation.y=fr.yaw(-1,0); car.add(panel);
    const btn=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.06),MAT.glowAmber); btn.position.set(0,.08,.07); panel.add(btn);
    const ctl=new ElevatorControl(hall); [panel,btn].forEach(m=>{ m.userData={type:'panel',interactable:ctl}; this.interactables.push(m); });
    refs.elevatorButton=btn;
    // freio de segurança (no alto do poço, à vista pela porta) abraçado pelas raízes
    const bk=fr.p(u1-.3,H+3.2,0); { const b=new THREE.Mesh(new THREE.BoxGeometry(.5,.8,1.2),MAT.pump); b.position.copy(bk); b.rotation.y=fr.yaw(1,0); this.root.add(b); }
    refs.brakeLamp=this._fmesh(fr,new THREE.BoxGeometry(.06,.18,.18),new THREE.MeshBasicMaterial({color:0xb02a1a}),u1-.04,H+3.75,0);
    refs.roots=[]; for(let i=0;i<9;i++){ const m=this._fmesh(fr,new THREE.CylinderGeometry(.06,.09,2.4,6),MAT.vine,u1-.35+this.rand(-.15,.15),H+2.2+this.rand(-.3,.6),this.rand(-.9,.9)); m.rotation.set(this.rand(-.6,.6),0,this.rand(-.9,.9)); refs.roots.push(m); }
    refs.releaseBrake=()=>{ refs.roots.forEach(m=>{ if(m.parent) m.parent.remove(m); }); refs.brakeLamp.material=MAT.glowGreen; };
    // braço de 224 m: da porta de cima do elevador até a parede do poço; plataforma de saída no poço
    const uw=v=>Math.sqrt(Math.max(0,SHAFT_R*SHAFT_R-v*v))-.02, Va=1.2;
    this._fb(fr,SHAFT_R,u0,-Va-t,Va+t,top-.3,top-.005,C,{kind:'floor',flat:true});
    this._fb(fr,uw(Va),u0,-Va-t,-Va,top,top+2.9,C,{interactable:sf}); this._fb(fr,uw(Va),u0,Va,Va+t,top,top+2.9,C,{interactable:sf});
    this._fb(fr,uw(0),u0,-Va-t,Va+t,top+2.6,top+2.9,C,{cut:true});
    this._exitPlat(this._opA('p200_out'),top,Hc.exitLabel,Hc.exitId,NOTES[Hc.exitNote],{nails:2});
    // o mecanismo
    const el=new Elevator(this,{car,pd,y0:H,y1:top,speed:E.speed,doors:{bottom:dB,top:dT}});
    this.movers.push(el); this.elevator=el; refs.elevator=el;
  },

  // =====================================================================================
  // INSUFLADOR (246 m): grade quase inteira sobre um ventilador que sopra para cima; parede lisa até o mirante
  // =====================================================================================
  _insuflador(I){
    const R=SHAFT_R, a=I.a, F=I.fan, fc=polar(F.r,a,F.y), gt=I.grateTop, notch=[a-.9,a-.5];
    // grade: disco interno + coroa com um alçapão junto à parede (por onde se chega escalando)
    this._arcBlock({r0:0,r1:4.4,a0:0,span:TAU},gt-.3,gt,{mat:MAT.grate,type:'ledge',kind:'grate',flat:true,porous:true,label:'Câmara do insuflador',id:'cp10'});
    this._arcBlock({r0:4.4,r1:R+.02,a0:notch[1],span:TAU-(notch[1]-notch[0])},gt-.3,gt,{mat:MAT.grate,type:'ledge',kind:'grate',flat:true,porous:true});
    { const n=polar(4.9,notch[1]+.35,gt); this.note(n.x,gt,n.z,NOTES[246]); }
    // círculo pintado na grade marcando a coluna de ar
    { const ring=new THREE.Mesh(new THREE.RingGeometry(F.radius-.12,F.radius,48),new THREE.MeshBasicMaterial({color:0x6ec6ff,transparent:true,opacity:.75,side:THREE.DoubleSide}));
      ring.rotation.x=-Math.PI/2; ring.position.set(fc.x,gt+.012,fc.z); this.root.add(ring); }
    // o ventilador debaixo da grade (carcaça só visual: fica toda sob a grade)
    const fan=new Fan({name:'insuflador',pos:new V3(fc.x,F.y,fc.z),axis:new V3(0,1,0),mode:'push',radius:F.radius,range:F.range,speed:F.speed,p:F.p,spinRate:9});
    this._arc({cx:fc.x,cz:fc.z,r0:F.radius,r1:F.radius+.14,a0:0,span:TAU},F.y-.5,F.y+.55,MAT.metal,{solid:false,ray:false,segs:40});
    fan.rot=this._rotor(new V3(fc.x,F.y,fc.z),F.radius,5,MAT.metal);
    this.fans.push(fan);
    // mirante: o único lugar onde dá para sair do fluxo, junto à parede, acima do trecho de chapa lisa
    const L=I.ledge;
    this._arcBlock({r0:L.r0,r1:R+.02,a0:a-L.w/2/R,span:L.w/R},L.top-.3,L.top,{mat:MAT.woodDeck,type:'ledge',kind:'rest',flat:true,label:'Mirante do insuflador',id:'cp_ins'});
    { const b=polar(R-.6,a+.12,L.top); this.box(b.x,L.top,b.z,{nails:2}); }
    { const p=polar(R-.03,a-.62,gt+2.3); this._plaque(p,Math.atan2(-Math.cos(a-.62),-Math.sin(a-.62)),1.6,.8,['INSUFLADOR','pise no círculo','o ar leva ao mirante'],{color:'#6ec6ff',glow:true}); }
  }
});
