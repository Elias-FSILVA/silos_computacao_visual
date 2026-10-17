'use strict';
// ============================================================================
// js/world/Climbs.js — as SUBIDAS depois da passarela (40 → 400 m), montadas em trechos curtos com identidade própria
//
// O trecho inicial (0–40 m, World._start) é a referência: linhas de 4–8 m, mudanças de direção e um lugar para ficar em pé
// a cada poucos metros. Daqui para cima vale a mesma regra — nenhum trecho contínuo passa de ~6 m sem um apoio para os pés
// (saliência, andaime, passarela, viga, tubo) — e cada subida tem uma ideia principal:
//   Subida 1  (40–100)   A concreto em zigue-zague · primeiras vezes: rachadura, prego, cano lateral, viga de lado a lado
//   Subida 2  (110–150)  B estruturas que atravessam o poço: andaimes, tubo gigante como ponte, passarela, travessia lateral
//   Subida 2b (174–200)  D corda presa ao mezanino, sobre uma parede de chapa
//   Subida 3a (224–246)  C rachaduras profundas até o alçapão do insuflador
//   Subida 3b (252–300)  E escada de manutenção danificada · vão lateral que só se cruza com prego · rachadura de lado
//   Subida 4  (310–400)  tudo combinado: rachadura + viga, tubo + passarela, corda presa à ponte, prego + escada, andaime
//
// Apoios novos (todos usam o agarre de sempre — raycast em world.grabbables — sem sistema paralelo):
//   rachadura (type 'crack')  agarrável em QUALQUER ponto da fenda; a normal sai da parede (normalAt); custa um pouco mais
//                             de pegada (gripCost: dedos entalados)
//   corda     (type 'rope')   pendurada de um braço de aço; agarrável em qualquer altura; o corpo fica do lado de quem agarrou
//   cano      (type 'pipe')   cano curvo junto à parede, para atravessar de lado pendurado
//   degraus da escada danificada: agarras comuns (rung); faltam alguns
// Peças de cenário: chapa remendada (_plate: não aceita prego nem tem agarras), saliência de concreto (_islet), andaime de
// grade de madeira (_scaffold), passarela parcial (_catwalk), tubo que atravessa o poço (_pipeBridge), luminária (_routeLamp).
// Os modelos de assets/models/map/otimizados entram só no desenho; a colisão é sempre a das primitivas (Collision.js).
// userData.samples (pontos {p,n} ao longo dos apoios contínuos) servem às ferramentas de teste (grafo de alcance e robô).
// ============================================================================

// escada.glb: altura de cada degrau a partir da base (medida no arquivo) e altura total
const LADDER_RUNGS=[.47,.91,1.29,1.73,2.19,2.57,3.0,3.49,3.87,4.3,4.77,5.15,5.58,6.0,6.46,6.85,7.28], LADDER_H=7.86;
const CRACK_GRIP=1.2;      // pegada extra por segundo numa rachadura (estamina/s)
// faixa invisível de agarre da rachadura: DoubleSide, porque a ordem dos vértices depende do sentido em que a fenda é
// desenhada; com FrontSide o raio de quem está no poço atravessava a faixa por trás e a rachadura não era agarrável
const CRACK_HIT_MAT=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});

// peça de um modelo do mapa (Models, catálogo MAP_MODEL_DEFS): as malhas cujo nome casa com `re`, recentradas uma vez
// (centro em x/z; em y o centro ou a base) e compartilhadas entre as cópias. null sem o modelo (Node, file://).
const _MP=new Map();
function mapPart(id,re,base){
  if(typeof Models==='undefined'||!Models.ready||!Models.ready.has(id)) return null;
  const key=id+'|'+re+'|'+!!base; let e=_MP.get(key);
  if(!e){
    const parts=[]; Models.ready.get(id).scene.traverse(o=>{ if(o.isMesh&&re.test(o.name)) parts.push(o); });
    if(!parts.length) return null;
    const box=new THREE.Box3(); parts.forEach(p=>{ p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); });
    const c=box.getCenter(new THREE.Vector3()), dy=base?box.min.y:c.y;
    e={size:box.getSize(new THREE.Vector3()),geos:parts.map(p=>{ const g=p.geometry.clone(); g.translate(-c.x,-dy,-c.z); g.userData.shared=true; return {g,mat:p.material}; })};
    _MP.set(key,e);
  }
  const grp=new THREE.Group(); e.geos.forEach(({g,mat})=>grp.add(new THREE.Mesh(g,mat))); grp.userData.size=e.size; return grp;
}
// tubo ao longo de uma polilinha (pontos V3): malha sem índice, normais radiais
function tubeGeometry(pts,rad,seg=8){
  const P=[],N=[],U=[], ring=[];
  for(let i=0;i<pts.length;i++){
    const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)], t=new V3(b.x-a.x,b.y-a.y,b.z-a.z).normalize();
    const up=Math.abs(t.y)>.9?new V3(1,0,0):new V3(0,1,0);
    const s=new V3(t.y*up.z-t.z*up.y,t.z*up.x-t.x*up.z,t.x*up.y-t.y*up.x).normalize(), q=new V3(s.y*t.z-s.z*t.y,s.z*t.x-s.x*t.z,s.x*t.y-s.y*t.x);
    const r=[]; for(let k=0;k<=seg;k++){ const ang=k/seg*TAU, c=Math.cos(ang), sn=Math.sin(ang); r.push([c*s.x+sn*q.x,c*s.y+sn*q.y,c*s.z+sn*q.z]); }
    ring.push(r);
  }
  let len=0;
  for(let i=0;i<pts.length-1;i++){ const d=pts[i].distanceTo(pts[i+1]);
    for(let k=0;k<seg;k++){ const v=(o,kk)=>{ const p=pts[i+o], n=ring[i+o][kk]; P.push(p.x+n[0]*rad,p.y+n[1]*rad,p.z+n[2]*rad); N.push(n[0],n[1],n[2]); U.push(kk/seg,(len+o*d)/.5); };
      v(0,k); v(1,k); v(1,k+1); v(0,k); v(1,k+1); v(0,k+1); }
    len+=d; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
  return g;
}
const inward=a=>new V3(-Math.cos(a),0,-Math.sin(a));
// normal de agarre: para fora da parede do poço (rachadura, cano) · para fora do eixo da corda, do lado de quem agarrou
function wallNormalAt(p,out){ const r=Math.hypot(p.x,p.z)||1; return out.set(-p.x/r,0,-p.z/r); }

Object.assign(World.prototype,{
  // ---------- apoios e peças ----------
  // linha de tijolos por uma polilinha [[a,y],…] na parede, um tijolo a cada CLIMB.step; extremos exatos. o.crumble → chance
  // de um tijolo extra (que desmorona) ao lado da linha
  _holds(pts,o={}){
    if(pts.length===1){ this.hold(pts[0][0],pts[0][1],false); return; }
    const R=SHAFT_R, seg=[]; let L=0;
    for(let i=0;i<pts.length-1;i++){ const d=Math.hypot(R*(pts[i+1][0]-pts[i][0]),pts[i+1][1]-pts[i][1]); seg.push(d); L+=d; }
    const n=Math.max(1,Math.ceil(L/CLIMB.step)), jl=CLIMB.jitterLat/R, jy=CLIMB.jitterY; let side=1;
    for(let i=0;i<=n;i++){
      let s=L*i/n, k=0; while(k<seg.length-1&&s>seg[k]){ s-=seg[k]; k++; } const f=seg[k]?Math.min(1,s/seg[k]):0;
      const end=i===0||i===n, a=lerp(pts[k][0],pts[k+1][0],f)+(end?0:this.rand(-jl,jl)), y=lerp(pts[k][1],pts[k+1][1],f)+(end?0:this.rand(-jy,jy));
      this.hold(a,y,false);
      if(!end&&i<n-1&&this.R()<(o.crumble||0)){ side=-side; this.hold(a+side*.55/R,y+.12+.4/n,true); }
    }
  },
  // regiões da parede sem agarras soltas (chapas, rachaduras, corda): _scatter respeita
  _smoothAdd(a0,a1,y0,y1){ (this.smooth=this.smooth||[]).push({a0,a1,y0,y1}); },
  _inSmooth(a,y,m=.6){ return (this.smooth||[]).some(s=>wrap2(a-(s.a0-m/SHAFT_R))<=s.a1-s.a0+2*m/SHAFT_R&&y>s.y0-m&&y<s.y1+m); },
  // chapa remendada sobre a parede (aço com rebites, como as chapas de contenção): não aceita prego e não tem agarras
  _plate(a0,a1,y0,y1){
    this._arc({r0:SHAFT_R-.03,r1:SHAFT_R+.004,a0,span:a1-a0},y0,y1,MAT.liner,{interactable:null,solid:false,segs:96});
    this._smoothAdd(a0,a1,y0,y1);
  },
  // saliência de concreto: um bloco quebrado da parede (com o vergalhão à mostra) onde dá para ficar em pé
  _islet(a,top,o={}){
    const w=o.w||1.3, d=o.d||.85, span=w/SHAFT_R;
    const pd=this._ledge(a,w,d,top,{kind:'islet',mat:MAT.concreteDark});
    this._arc({r0:SHAFT_R-d*.55,r1:SHAFT_R,a0:a-span*.4,span:span*.8},top-.85,top-.3,MAT.concreteDark,{solid:false,ray:false,segs:48});   // mísula embaixo
    for(const s of [-.3,.25]){ const p=polar(SHAFT_R-d-.05,a+s*span,top-.16), m=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.32,5),MAT.rust);
      m.position.copy(p); m.rotation.set(Math.PI/2-.35,-a+Math.PI/2,0); this.root.add(m); }
    return pd;
  },
  // mão-francesa: barra enferrujada de p a q (só desenho)
  _strut(p,q,r){ const d=new V3().subVectors(q,p), L=d.length(), m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,6),MAT.rust);
    m.position.copy(p).addScaledVector(d,.5); m.quaternion.setFromUnitVectors(new V3(0,1,0),d.multiplyScalar(1/L)); this.root.add(m); return m; },
  // andaime improvisado: grade de madeira (grade_de_madeira.glb) sobre duas mãos-francesas enferrujadas
  _scaffold(a,top,o={}){
    const w=o.w||2.0, d=o.d||1.35, pd=this._ledge(a,w,d,top,{kind:'scaffold',mat:MAT.woodDeck});
    const grid=mapPart('mapGrid',/wood_grid/);
    if(grid){ const m=this.grabbables.find(g=>g.userData.plat===pd); if(m) m.material=IMAT.hidden;
      grid.position.copy(polar(SHAFT_R-d/2,a,top-.05)); grid.rotation.y=-a; grid.scale.set(d/2,1,w/2); this.root.add(grid); }
    for(const s of [-.36,.36]){ const aa=a+s*w/SHAFT_R; this._strut(polar(SHAFT_R,aa,top-1.1),polar(SHAFT_R-d+.12,aa,top-.08),.035); }
    return pd;
  },
  // passarela parcial junto à parede (grade sobre perfil de 30 cm; guarda-corpo só de enfeite — não se agarra nele). o.label/id → checkpoint;
  // o.terminal / o.loot / o.note como nos descansos
  _catwalk(a0,a1,top,o={}){
    const d=o.d||1.1, pd=this._arcBlock({r0:SHAFT_R-d,r1:SHAFT_R+.02,a0,span:a1-a0},top-.3,top,{mat:MAT.grate,type:'ledge',kind:'catwalk',flat:true,porous:true,label:o.label,id:o.id});
    const r=SHAFT_R-d+.05, n=Math.max(2,Math.round((a1-a0)*r/1.4));
    for(let i=0;i<=n;i++){ const a=lerp(a0,a1,i/n), p=polar(r,a);
      this._obox(p.x,p.z,.025,.025,a,top,top+1.0,MAT.rust,{solid:false,ray:false});
      if(i<n){ const am=a+(a1-a0)/(2*n); this._strut(polar(SHAFT_R,am,top-1.0),polar(SHAFT_R-d+.1,am,top-.3),.03); } }
    this._arc({r0:r-.03,r1:r+.03,a0,span:a1-a0},top+.97,top+1.03,MAT.rust,{solid:false,ray:false,segs:48});
    const c=(a0+a1)/2, P=(lat,off)=>polar(SHAFT_R-off,c+lat/SHAFT_R,top);
    if(o.terminal){ const p=P(0,.4); this.terminal(p.x,top,p.z,Math.atan2(-Math.cos(c),-Math.sin(c)),o.terminal); }
    if(o.loot){ const p=P(-.9,.6); this.box(p.x,top,p.z,o.loot); }
    if(o.note){ const p=P(.8,.5); this.note(p.x,top,p.z,o.note); }
    if(o.station){ const p=P(1.6,.4); this.perkStation(p.x,top,p.z,Math.atan2(-Math.cos(c),-Math.sin(c)),o.station); }
    return pd;
  },
  // cano curvo junto à parede, de a0 a a1 na altura y: atravessa-se de lado, pendurado (agarra em qualquer ponto)
  _pipeRun(a0,a1,y){
    const r=SHAFT_R-.26, n=Math.max(4,Math.ceil(Math.abs(a1-a0)*r/.3)), pts=[];
    for(let i=0;i<=n;i++) pts.push(polar(r,lerp(a0,a1,i/n),y));
    const pipe=new THREE.Mesh(tubeGeometry(pts,.075,10),MAT.pipe); this.root.add(pipe);
    const hit=new THREE.Mesh(tubeGeometry(pts,.16,6),IMAT.hidden); this.root.add(hit);
    const samples=[]; const m=Math.max(2,Math.ceil(Math.abs(a1-a0)*r/.4));
    for(let i=0;i<=m;i++){ const a=lerp(a0,a1,i/m); samples.push({p:polar(r,a,y+.06),n:inward(a)}); }
    hit.userData={grab:true,type:'pipe',alive:true,normalAt:wallNormalAt,samples}; this.grabbables.push(hit);
    for(let i=0,k=Math.max(2,Math.round(Math.abs(a1-a0)*r/1.6));i<=k;i++){ const a=lerp(a0,a1,i/k), p=polar(SHAFT_R-.13,a,y);   // abraçadeiras
      this._obox(p.x,p.z,.13,.03,a,y-.12,y+.12,MAT.rust,{solid:false,ray:false}); }
    this._smoothAdd(Math.min(a0,a1),Math.max(a0,a1),y-.8,y+.8);
    return hit;
  },
  // rachadura profunda na parede, ao longo de [[a,y],…]: a fenda (escura) e as bordas lascadas são o desenho; uma faixa
  // invisível um pouco mais larga recebe o agarre — em qualquer ponto da fenda, com a normal da parede
  _crack(pts,o={}){
    const R=SHAFT_R, W=[], C=[];   // pontos densos da fenda (a cada ~12 cm, com um zigue-zague fino)
    for(let i=0;i<pts.length-1;i++){ const [a0,y0]=pts[i], [a1,y1]=pts[i+1], L=Math.hypot(R*(a1-a0),y1-y0), n=Math.max(2,Math.ceil(L/.12));
      for(let k=(i?1:0);k<=n;k++){ const f=k/n, end=(i===0&&k===0)||(i===pts.length-2&&k===n); C.push([lerp(a0,a1,f)+(end?0:this.rand(-.025,.025)/R),lerp(y0,y1,f)+(end?0:this.rand(-.02,.02))]); } }
    const P=[],N=[],Pl=[],Nl=[];
    const quad=(arr,nrm,a,b,c,d,n)=>{ for(const v of [a,b,c,a,c,d]){ arr.push(v.x,v.y,v.z); nrm.push(n.x,n.y,n.z); } };
    let wPrev=null;
    for(let i=0;i<C.length-1;i++){
      const [a0,y0]=C[i], [a1,y1]=C[i+1], am=(a0+a1)/2, n=inward(am);
      const t=new V3(-Math.sin(am)*R*(a1-a0),y1-y0,Math.cos(am)*R*(a1-a0)).normalize(), s=new V3(t.y*n.z-t.z*n.y,t.z*n.x-t.x*n.z,t.x*n.y-t.y*n.x).normalize();
      const w0=wPrev??(.09+this.R()*.04), w1=.08+this.R()*.08; wPrev=w1;
      const at=(a,y,r,off)=>polar(r,a,y).addScaledVector(s,off);
      // fenda: faixa escura um pouco à frente da parede
      quad(P,N,at(a0,y0,R-.008,-w0/2),at(a1,y1,R-.008,-w1/2),at(a1,y1,R-.008,w1/2),at(a0,y0,R-.008,w0/2),n);
      // bordas lascadas: rampas que saem da parede até a beira da fenda (pegam a luz e dão profundidade)
      for(const sg of [-1,1]){ const e0=sg*(w0/2+.035+this.R()*.03), e1=sg*(w1/2+.035+this.R()*.03), ln=n.clone().addScaledVector(s,-sg*.9).normalize();
        quad(Pl,Nl,at(a0,y0,R-.022,sg*w0/2),at(a1,y1,R-.022,sg*w1/2),at(a1,y1,R-.002,e1),at(a0,y0,R-.002,e0),ln); }
    }
    const mk=(p,n,mat)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3)); const m=new THREE.Mesh(g,mat); this.root.add(m); return m; };
    mk(P,N,MAT.crackDeep); mk(Pl,Nl,MAT.crackLip);
    // faixa de agarre (invisível) e amostras para as ferramentas
    const Hp=[],Hn=[], samples=[]; let acc=0;
    for(let i=0;i<C.length-1;i++){ const [a0,y0]=C[i], [a1,y1]=C[i+1], am=(a0+a1)/2, n=inward(am);
      const t=new V3(-Math.sin(am)*R*(a1-a0),y1-y0,Math.cos(am)*R*(a1-a0)).normalize(), s=new V3(t.y*n.z-t.z*n.y,t.z*n.x-t.x*n.z,t.x*n.y-t.y*n.x).normalize();
      const at=(a,y,off)=>polar(R-.05,a,y).addScaledVector(s,off);
      quad(Hp,Hn,at(a0,y0,-.17),at(a1,y1,-.17),at(a1,y1,.17),at(a0,y0,.17),n);
      const d=Math.hypot(R*(a1-a0),y1-y0); if(i===0) samples.push({p:polar(R-.05,a0,y0),n:inward(a0)});
      acc+=d; if(acc>=.35||i===C.length-2){ acc=0; samples.push({p:polar(R-.05,a1,y1),n:inward(a1)}); }
    }
    const hit=mk(Hp,Hn,CRACK_HIT_MAT); hit.userData={grab:true,axe:true,type:'crack',alive:true,normalAt:wallNormalAt,gripCost:CRACK_GRIP,samples}; this.grabbables.push(hit);
    const as=pts.map(p=>p[0]), ys=pts.map(p=>p[1]); this._smoothAdd(Math.min(...as),Math.max(...as),Math.min(...ys),Math.max(...ys));
    if(o.lamp!==false){ const [a,y]=pts[0]; this._routeLamp(a+(o.lampSide||-1)*.75/R,y+.4,'rusty'); }
    return hit;
  },
  // faixa de rocha exposta ao longo de [[a,y],…]: só a PICARETA crava (axe:true, sem grab — a mão nua não se segura).
  // Desenho: placa irregular escura e granulada, um pouco à frente da parede; o alvo de raycast é a própria placa
  // (entra em world.walls/raycastTargets, não em grabbables). o.lamp:false dispensa a lâmpada de rota (amarela); o.id nomeia a
  // faixa (R1–R4, conferidas por tools/test_axe_routes.js). Usa um gerador próprio: não mexe no sorteio do resto do mapa.
  _rockBand(pts,o={}){
    const R0=this.R; this.R=mulberry(Math.round(pts[0][0]*1e4)+Math.round(pts[0][1]*1e2)*7919);
    const R=SHAFT_R, half=(o.w||.7)/2, C=[];
    for(let i=0;i<pts.length-1;i++){ const [a0,y0]=pts[i], [a1,y1]=pts[i+1], n=Math.max(2,Math.ceil(Math.hypot(R*(a1-a0),y1-y0)/.25));
      for(let k=(i?1:0);k<=n;k++) C.push([lerp(a0,a1,k/n),lerp(y0,y1,k/n)]); }
    const P=[],N=[],U=[],samples=[]; let acc=0, run=0;
    for(let i=0;i<C.length-1;i++){
      const [a0,y0]=C[i], [a1,y1]=C[i+1], am=(a0+a1)/2, n=inward(am), seg=Math.hypot(R*(a1-a0),y1-y0), u0=run/.6, u1=(run+=seg)/.6;
      const t=new V3(-Math.sin(am)*R*(a1-a0),y1-y0,Math.cos(am)*R*(a1-a0)).normalize(), s=new V3(t.y*n.z-t.z*n.y,t.z*n.x-t.x*n.z,t.x*n.y-t.y*n.x).normalize();
      const w0=half*(.85+this.R()*.3), w1=half*(.85+this.R()*.3);
      const at=(a,y,off)=>polar(R-.04,a,y).addScaledVector(s,off);
      for(const v of [at(a0,y0,-w0),at(a1,y1,-w1),at(a1,y1,w1),at(a0,y0,-w0),at(a1,y1,w1),at(a0,y0,w0)]){ P.push(v.x,v.y,v.z); N.push(n.x,n.y,n.z); }
      U.push(u0,0, u1,0, u1,1, u0,0, u1,1, u0,1);
      const d=Math.hypot(R*(a1-a0),y1-y0); if(i===0) samples.push({p:polar(R-.05,a0,y0),n:inward(a0)});
      acc+=d; if(acc>=.35||i===C.length-2){ acc=0; samples.push({p:polar(R-.05,a1,y1),n:inward(a1)}); }
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
    const m=new THREE.Mesh(g,MAT.rockBand||MAT.crackLip); this.root.add(m);
    m.userData={type:'rockband',axe:true,alive:true,normalAt:wallNormalAt,samples,bandId:o.id||null};
    this.walls.push(m); if(this.raycastTargets) this.raycastTargets.push(m);
    const as=pts.map(p=>p[0]), ys=pts.map(p=>p[1]); this._smoothAdd(Math.min(...as),Math.max(...as),Math.min(...ys),Math.max(...ys));
    if(o.lamp!==false){ const [a,y]=pts[0]; this._routeLamp(a+(o.lampSide||1)*.75/R,y+.4,'yellow'); }
    this.R=R0;
    return m;
  },
  // corda pendurada de um braço de aço (turco) preso à parede (ou a o.from: ponto de amarração, ex. a ponte): de yTop até
  // yBot, a r do eixo (ou na posição o.at). Agarra em qualquer altura; o corpo fica do lado de onde se agarrou.
  _rope(a,yTop,yBot,o={}){
    const p=o.at||polar(o.r||SHAFT_R-1.0,a), L=yTop-yBot, cy=(yTop+yBot)/2;
    if(!MAT.rope) MAT.rope=new THREE.MeshStandardMaterial({map:canvasTex(64,128,(g,w,h)=>{ g.fillStyle='#6b5a3e'; g.fillRect(0,0,w,h);
      for(let i=-4;i<12;i++){ g.fillStyle=i%2?'#4e4029':'#8a7550'; g.beginPath(); g.moveTo(0,i*16); g.lineTo(w,i*16+24); g.lineTo(w,i*16+32); g.lineTo(0,i*16+8); g.fill(); }
      g.fillStyle='rgba(20,15,8,.25)'; for(let i=0;i<300;i++) g.fillRect(Math.random()*w,Math.random()*h,1,2+Math.random()*3); }),roughness:1});
    const geo=new THREE.CylinderGeometry(.032,.032,L,8,1); const uv=geo.attributes.uv; if(uv&&uv.count) { for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i),uv.getY(i)*L/.25); uv.needsUpdate=true; }
    if(MAT.rope.map&&MAT.rope.map.wrapS!==undefined){ MAT.rope.map.wrapS=MAT.rope.map.wrapT=THREE.RepeatWrapping; }
    const rope=new THREE.Mesh(geo,MAT.rope); rope.position.set(p.x,cy,p.z); this.root.add(rope);
    const knot=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),MAT.rope); knot.position.set(p.x,yBot+.05,p.z); this.root.add(knot);
    const hit=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,L-.1,6),IMAT.hidden); hit.position.set(p.x,cy+.05,p.z); this.root.add(hit);
    const ax=p.x, az=p.z, toward=new V3(-ax,0,-az).normalize(), samples=[];
    for(let y=yBot+.25;y<=yTop-.3;y+=.4) samples.push({p:new V3(ax,y,az).addScaledVector(toward,.03),n:toward.clone()});
    hit.userData={grab:true,type:'rope',alive:true,samples,normalAt:(q,out)=>{ out.set(q.x-ax,0,q.z-az); const l=Math.hypot(out.x,out.z); return l>1e-3?out.multiplyScalar(1/l):out.copy(toward); }};
    this.grabbables.push(hit);
    if(!o.at){   // braço de aço (turco) saindo da parede, com a roldana
      const arm=SHAFT_R-(o.r||SHAFT_R-1.0)+.25, q=polar(SHAFT_R-arm/2+.1,a,yTop+.08);
      this._obox(q.x,q.z,arm/2,.06,a,yTop,yTop+.16,MAT.rust,{solid:false,ray:false});
      const st=polar(SHAFT_R-.1,a,yTop-.5); this._obox(st.x,st.z,.06,.06,a,yTop-1.0,yTop,MAT.rust,{solid:false,ray:false});
      const pul=new THREE.Mesh(new THREE.TorusGeometry(.11,.03,6,12),MAT.metal); pul.position.set(p.x,yTop-.04,p.z); pul.rotation.y=-a; this.root.add(pul);
    } else { const t=new THREE.Mesh(new THREE.TorusGeometry(.07,.025,6,10),MAT.rope); t.position.set(p.x,yTop,p.z); t.rotation.x=Math.PI/2; this.root.add(t); }
    return hit;
  },
  // tubo industrial que atravessa o poço numa corda, de a0 a a1 (passa por dentro da parede nas pontas): anda-se por cima.
  // Desenho: tubulacoes_industriais.glb (tubo médio, 0,75 m) em trechos iguais com flange; colisão: caixa girada
  _pipeBridge(a0,a1,top){
    const P0=polar(SHAFT_R,a0), P1=polar(SHAFT_R,a1), L=P0.distanceTo(P1), cx=(P0.x+P1.x)/2, cz=(P0.z+P1.z)/2, yaw=Math.atan2(P1.z-P0.z,P1.x-P0.x), r=.37, yc=top-r;
    const pd=this._oblock(cx,cz,L/2,r*.92,yaw,top-2*r,top,{mat:MAT.pipe,type:'ledge',kind:'pipewalk'});
    const mesh=this.grabbables.find(g=>g.userData.plat===pd), Lv=L+.7, n=Math.ceil(Lv/6.02);
    const part=mapPart('mapPipes',/medium_01_long/);
    if(part&&mesh){ mesh.material=IMAT.hidden;
      for(let i=0;i<n;i++){ const g=i?mapPart('mapPipes',/medium_01_long/):part, f=(i+.5)/n-.5, k=Lv/n/part.userData.size.x;
        g.position.set(cx+Math.cos(yaw)*f*Lv,yc,cz+Math.sin(yaw)*f*Lv); g.rotation.y=-yaw; g.scale.set(k,1,1); this.root.add(g); }
    }
    return pd;
  },
  // escada de manutenção danificada (escada.glb) presa à parede no ângulo a, base em y0. o.missing = degraus que faltam
  // (índices de LADDER_RUNGS): sem desenho e sem agarra
  _brokenLadder(a,y0,o={}){
    const miss=new Set(o.missing||[]), r=SHAFT_R-.22, nrm=inward(a);
    for(let i=0;i<LADDER_RUNGS.length;i++){ if(miss.has(i)) continue;
      const hit=new THREE.Mesh(LADDER_HIT,IMAT.hidden); hit.position.copy(polar(r+.02,a,y0+LADDER_RUNGS[i])); hit.rotation.y=-a;
      hit.userData={grab:true,type:'hold',crumble:false,alive:true,wallNormal:nrm.clone(),rung:true}; this.root.add(hit); this.grabbables.push(hit); }
    const lad=mapPart('mapLadder',/Ladder/,true);
    if(lad){
      lad.children.forEach(m=>{ const src=m.geometry, pos=src.attributes.position, idx=src.index, keep=[];   // tira os triângulos dos degraus que faltam
        if(idx&&miss.size){ const yb=LADDER_RUNGS.filter((_,i)=>miss.has(i)), inBand=y=>yb.some(b=>Math.abs(y-b)<.07);
          for(let t=0;t<idx.count;t+=3){ const v=[idx.getX(t),idx.getX(t+1),idx.getX(t+2)], ys=v.map(k=>pos.getY(k)), zs=v.map(k=>pos.getZ(k));
            if(!(ys.every(inBand)&&Math.max(...zs)-Math.min(...zs)>.3)) keep.push(...v); }
          const g=src.clone(); g.setIndex(keep); m.geometry=g; } });
      lad.position.copy(polar(r,a,y0)); lad.rotation.y=-a; this.root.add(lad);
    } else {
      for(const s of [-1,1]){ const p=polar(r,a,y0+LADDER_H/2).addScaledVector(new V3(-Math.sin(a),0,Math.cos(a)),s*.27); this._obox(p.x,p.z,.03,.03,a,y0,y0+LADDER_H,MAT.rust,{solid:false,ray:false}); }
      const ys=LADDER_RUNGS.filter((_,i)=>!miss.has(i)), bars=new THREE.InstancedMesh(new THREE.BoxGeometry(.045,.045,.56),MAT.rust,ys.length), d=new THREE.Object3D();
      ys.forEach((y,i)=>{ d.position.copy(polar(r,a,y0+y)); d.rotation.y=-a; d.updateMatrix(); bars.setMatrixAt(i,d.matrix); }); bars.instanceMatrix.needsUpdate=true; this.root.add(bars);
    }
    for(const f of [.2,.8]){ const p=polar(SHAFT_R-.1,a,y0+LADDER_H*f); this._obox(p.x,p.z,.12,.03,a,p.y-.03,p.y+.03,MAT.rust,{solid:false,ray:false}); }   // braçadeiras
    this._smoothAdd(a-.4/SHAFT_R,a+.4/SHAFT_R,y0,y0+LADDER_H);
  },
  // luminária de parede (lampadas_industriais.glb): 'yellow' marca onde se usa a ferramenta (soquete, vão); 'rusty' marca o
  // começo de um apoio diferente (rachadura, corda). Entra em world.lamps (a atmosfera acende as luzes mais próximas)
  _routeLamp(a,y,kind){
    const n=inward(a), mat=new THREE.MeshBasicMaterial({color:kind==='yellow'?0xffd27a:0xfff2c8});
    const m=mapPart('mapLamps',kind==='yellow'?/Yellow/:/Rusty/);
    const g=m||new THREE.Mesh(GEO.lamp,MAT.metal); g.position.copy(polar(SHAFT_R-.01,a,y)); g.rotation.y=Math.atan2(n.x,n.z); if(!m) g.scale.set(.4,1,1); this.root.add(g);
    const bulb=new THREE.Mesh(new THREE.BoxGeometry(.1,.07,.05),mat); bulb.position.copy(polar(SHAFT_R-.15,a,y-.06)); this.root.add(bulb);
    this.lamps.push({mat,pos:polar(SHAFT_R-.6,a,y-.1),phase:this.R()*100,broken:false,dead:false,k:1});
  },
  // descanso (checkpoint) centrado em c — o mesmo _rest de antes, com o centro explícito
  _restAt(c,T,sp={}){
    const P=(lat,off)=>polar(SHAFT_R-off,c+lat/SHAFT_R,T);
    this._ledge(c,3,1.8,T,{label:sp.label,id:sp.id,kind:'rest'});
    if(sp.loot){ const p=P(-.6,.75); this.box(p.x,T,p.z,sp.loot); }
    if(sp.note){ const p=P(.55,.55); this.note(p.x,T,p.z,sp.note); }
    if(sp.terminal){ const p=P(0,.45); this.terminal(p.x,T,p.z,Math.atan2(-Math.cos(c),-Math.sin(c)),sp.terminal); }
    if(sp.station){ const p=P(1.05,.4); this.perkStation(p.x,T,p.z,Math.atan2(-Math.cos(c),-Math.sin(c)),sp.station); }
    if(sp.bridge) this._bridge(c,T);
    const wing=WINGS.find(w=>w.after===sp.id); if(wing) this._wingA(c,T,{id:wing.id,finish:wing.finish,dress:(fr,I)=>this._dressWing(wing,fr,I)});
  },

  // ---------- as subidas ----------
  // Ângulos em rad (θ crescente: leste → sul → oeste → norte); alturas em m. Regras de alcance (Player): o último tijolo
  // fica até 1,46 m abaixo do topo de uma borda (1,38 m de uma viga); de pé, alcança-se até ~2 m acima dos olhos.
  // ===== SUBIDA 1 · 40 → 100 m: concreto em zigue-zague; cada apoio novo aparece primeiro com chão logo embaixo
  _subida1(){
    const k=CLIMB.crumble[0];
    this._holds([[-.30,41.8],[.10,46.6]],{crumble:k});
    this._islet(.30,48.0);
    this._holds([[.36,49.8],[.62,52.0],[.55,53.4]],{crumble:k});
    this._islet(.72,54.8);
    // C · primeira rachadura: curta, logo acima da saliência
    this._crack([[.80,56.5],[.86,57.3],[.82,58.0],[.90,58.7]]);
    this._restAt(1.10,60.0,{label:'Casa de máquinas',id:'cp3',note:NOTES[60],loot:{nails:3}});
    // E · primeiro prego: na ponta do descanso, em pé e sem pressa. O tijolo seguinte só se alcança pendurado no prego
    this._socket(1.40,62.4); this._routeLamp(1.28,63.6,'yellow');
    this._holds([[1.46,63.8],[1.72,67.7]],{crumble:k});
    this._islet(1.85,69.0);
    // B · primeiro cano: a parede acima da saliência é chapa; o caminho é atravessar de lado, pendurado no cano
    this._plate(1.62,2.74,69.35,75.6);
    this._pipeRun(1.80,2.78,70.9); this._routeLamp(1.95,73.0,'rusty');
    this._holds([[2.86,71.9],[3.02,75.2]],{crumble:k});
    this._catwalk(2.90,3.75,76.6,{label:'Sala de controle',id:'cp4',terminal:NOTES[80],loot:{pills:1,nails:2},station:'E1'});
    // viga de lado a lado: sobe-se nela e atravessa-se o poço por cima até a outra parede
    this._holds([[3.80,78.4],[3.95,82.8]],{crumble:k});
    this.beamA(4.05,84.0);
    this._holds([[.86,86.0],[.60,90.2]],{crumble:k});
    this._islet(.45,91.6);
    this._holds([[.40,93.4],[this._opA('h1_in'),98.6]],{crumble:k});
  },
  // ===== SUBIDA 2 · 113 → 150 m: o espaço do poço — andaime, tubo gigante como ponte, passarela, travessia lateral
  _subida2(){
    const k=CLIMB.crumble[1];
    this._holds([[this._opA('h1_out')+.01,112.9],[-.05,117.4]],{crumble:k});
    this._scaffold(.12,118.8);
    this._pipeBridge(.32,2.07,120.0);            // sobe-se no tubo a partir do andaime e anda-se por cima dele
    this._catwalk(1.86,2.62,120.0);
    this._holds([[2.68,121.9],[2.92,126.7]],{crumble:k});
    this._restAt(3.15,128.0,{label:'Andaime norte',id:'cp6',note:NOTES[130],loot:{nails:3,climbing_axe:1}});   // 1ª picareta
    // B · travessia lateral: acima do descanso a parede é chapa; os tijolos seguem de lado antes de voltar a subir
    this._plate(2.95,4.32,131.0,135.6);
    this._holds([[3.45,129.9],[4.36,130.6]],{crumble:k*1.6});
    this._holds([[4.44,131.8],[4.60,134.7]],{crumble:k});
    this._scaffold(4.75,136.0);
    this._holds([[4.82,137.8],[4.98,140.6]],{crumble:k});
    this._catwalk(5.00,6.05,142.0);
    this._holds([[6.12,143.8],[EXHAUST.entryA+TAU,148.6]],{crumble:k});   // o vento do exaustor já puxa
    this._rockBand([[6.2,145.0],[6.125,146.5],[6.05,148.0]],{id:'R1'});     // R1 · atalho da passarela de 142 m até a boca do exaustor (só picareta)
  },
  // ===== SUBIDA 2b · 177 → 200 m: corda presa ao mezanino, sobre uma parede de chapa
  _subida2b(){
    const k=CLIMB.crumble[1];
    this._holds([[this._opA('ex174_out')+.28,176.4],[3.62,180.4]],{crumble:k});   // ao lado da porta do braço de 174 m
    this._islet(3.80,181.8);
    this._plate(3.60,4.45,182.2,188.3);
    this._rope(3.94,190.2,182.6,{r:3.95}); this._routeLamp(3.72,186.0,'rusty');
    this._restAt(4.05,188.6,{label:'Mezanino',id:'cp8',note:NOTES[186],loot:{pills:1,nails:3},station:'E2'});
    this._holds([[4.30,190.4],[4.56,194.4]],{crumble:k});
    this._catwalk(4.56,4.95,195.8,{d:1.0});      // resto da passarela de acesso ao Pátio
    this._holds([[this._opA('p200_in')+TAU,198.6]]);
  },
  // ===== SUBIDA 3a · 227 → 246 m: rachaduras profundas até o alçapão do insuflador
  _subida3a(){
    const k=CLIMB.crumble[2];
    this._holds([[this._opA('p200_out')+.2,226.9],[2.05,230.6]],{crumble:k});
    this._islet(2.20,232.0);
    this._crack([[2.30,233.7],[2.36,234.6],[2.28,235.6],[2.40,236.6],[2.47,237.5]]);
    this._scaffold(2.58,238.8,{w:1.6,d:1.1});    // tábuas de grade que a equipe deixou no bolsão onde o concreto cedeu
    this._rockBand([[2.26,236.5],[2.335,238.0],[2.41,239.5]],{id:'R2',lampSide:-1});   // R2 · elo entre as duas rachaduras, sem descer ao andaime
    this._crack([[2.66,240.4],[2.72,241.3],[2.68,242.2],[2.80,243.2],[2.86,244.0],[INSUF.a-.7,244.6]],{lampSide:1});
  },
  // ===== SUBIDA 3b · 253 → 300 m: escada danificada · vão lateral que só se cruza com prego · rachadura de lado
  _subida3b(){
    const k=CLIMB.crumble[2];
    this._holds([[INSUF.a+.15,254.5],[4.00,258.6]],{crumble:k});
    this._islet(4.15,260.0);
    this._brokenLadder(4.30,261.0,{missing:[0,1,8,9]});
    this._restAt(4.55,269.6,{label:'Corredor de serviço',id:'cp11',note:NOTES[270],loot:{pills:1,nails:3,climbing_axe:1}});   // 2ª picareta
    // E · o vão: chapa lisa entre duas linhas de tijolos, a 3 m uma da outra; o soquete fica no meio
    this._holds([[4.82,271.4],[4.86,275.2]],{crumble:0});
    this._plate(4.92,5.30,269.8,281.0);
    this._socket(5.11,274.7); this._routeLamp(5.11,276.4,'yellow');
    this.hold(5.37,275.1,false);
    this._islet(5.47,276.5);                      // chegada: depois do vão, um lugar para ficar em pé
    this._holds([[5.62,278.7],[5.82,282.4]],{crumble:k});
    this._islet(5.97,283.8);
    this._holds([[6.06,286.4]]);
    this._restAt(6.26,287.8,{label:'Antessala do Arquivo',id:'cp12',note:NOTES[240],loot:{nails:3}});
    this._holds([[5.98,289.6],[5.72,293.2]],{crumble:k});
    this._scaffold(5.55,294.6);
    this._crack([[5.36,296.2],[5.22,296.9],[5.06,297.6],[4.90,298.1],[this._opA('mz300_in')+TAU,298.6]],{lampSide:1});
  },
  // ===== SUBIDA 4 · 313 → 400 m: tudo combinado, com mais tijolos que desmoronam
  _subida4(){
    const k=CLIMB.crumble[3];
    this._holds([[this._opA('mz300_out')+.04,312.9],[-.75,317.6]],{crumble:k});
    this._islet(-.60,319.0);
    this._crack([[-.50,320.6],[-.42,321.8],[-.48,322.9],[-.36,324.2]]);
    this.beamA(-.30,325.4);
    this._rockBand([[-.22,324.0],[-.295,325.5],[-.37,327.0]],{id:'R3',lampSide:-1});   // R3 · rota alternativa curta para a Cabine de guincho
    this._holds([[-.20,327.3],[0,329.6]],{crumble:k});
    this._restAt(.15,331.0,{label:'Cabine de guincho',id:'cp14',note:NOTES[340],loot:{nails:3},station:'E3'});
    this._holds([[.42,332.8],[.58,337.6]],{crumble:k});
    this._pipeBridge(.66,2.42,339.4);
    this._catwalk(2.24,2.95,339.4);
    this._crack([[3.00,341.2],[3.08,342.4],[3.02,343.6],[3.12,344.8]]);
    this._islet(3.24,346.2);
    // corda amarrada na lateral da ponte de inspeção: a parede atrás é chapa
    const c15=3.36, T15=354.8, side=new V3(-Math.sin(c15),0,Math.cos(c15)), at=polar(3.9,c15).addScaledVector(side,.85);
    this._plate(2.95,3.75,346.6,354.4);
    this._rope(c15,T15-.1,347.4,{at}); this._obox(at.x-side.x*.12,at.z-side.z*.12,.04,.16,c15+Math.PI/2,T15-.2,T15-.08,MAT.rust,{solid:false,ray:false});
    this._restAt(c15,T15,{label:'Ponte de inspeção',id:'cp15',note:NOTES[370],loot:{pills:1,nails:3},bridge:true});
    // E · segundo vão de prego, agora seguido da escada danificada
    this._holds([[3.66,356.6],[3.72,360.2]],{crumble:0});
    this._plate(3.78,4.17,355.0,365.6);
    this._socket(4.04,359.9); this._routeLamp(4.04,361.4,'yellow');
    this._holds([[4.29,360.1],[4.33,362.4]],{crumble:0});   // 4.29: o pulo da ponte (8.2 m/s) não alcança sem prego; soquete deslocado para cá mantém o lance ≤ 1,7 m
    this._islet(4.42,363.8);
    this._brokenLadder(4.60,364.6,{missing:[0,1,6,7]});
    this._restAt(4.85,373.2,{label:'Último patamar',id:'cp16',loot:{nails:3}});
    this._holds([[5.12,375.0],[5.30,379.2]],{crumble:k});
    this._scaffold(5.48,380.6);
    this._crack([[5.66,382.2],[5.74,383.3],[5.68,384.4],[5.80,385.4],[5.86,386.2]]);
    this._catwalk(5.88,6.45,387.6);
    this._holds([[6.52,389.4],[6.62,392.6]],{crumble:k});
    this.beamA(6.70,393.8);
    this._holds([[6.55,395.6],[TAU+.039,398.6]],{crumble:k});
  }
});
