// Robô que percorre uma rota do grafo de alcance (_grafo.js) com a física REAL do Player — usado por test_rota.js e test_ritmo.js.
// Joga como um jogador cuidadoso: leva a mão de trás até a próxima agarra (~0,3 s), deixa o corpo balançar sob a mão
// da frente antes de puxar, só puxa o corpo quando a agarra ainda não está ao alcance, sobe nas bordas (mantle), crava
// prego nos soquetes e descansa em pé (estamina e fadiga dos braços) antes de continuar.
// Apoios contínuos (rachadura, corda, cano): agarra no ponto da amostra, com a normal da amostra.
// Prego: pendurado, a mão direita larga a parede e fica ocupada (sacar o prego, cravar, trocar pelo martelo, 3 marteladas e
// guardar: 4,4 s de animação no ItemSystem, mais 1,5 s de hesitação por unidade de pace acima de 1 — com um braço só, lockOff);
// em pé, só gasta o tempo. Passarelas curvas: anda acompanhando a curva (não corta caminho pelo vazio).
// Pílula só pendurado e quase sem força. As alas são atravessadas por teletransporte (conferidas em outros testes).
// opts: {world, P, grab(P,i,mesh,point,normal), step(P,n,input), Gr, path, sector(y), pace?}  →  estatísticas
// pace > 1 = jogador mais lento (procura a próxima agarra, puxa com menos pressa, martela devagar): o tempo de cada ação
// é multiplicado por pace e a puxada por quadro dividida por √pace.
module.exports=function percorrer({world,P,grab,step,Gr,path,sector,dbg,pace=1}){
  const {holds,plats,N}=Gr, V=world.spawnPoint.constructor;
  const teleTo=new Map(Gr.tele.map(([a,b])=>[a,b]));
  const meshOf=pd=>world.grabbables.find(m=>m.userData.plat===pd)||world.walls.find(m=>m.userData.solid===pd);
  const st={frames:0,pills:0,pillAt:[],nails:0,rests:0,falls:0,minStam:100,minBy:{},maxFatigue:0,stuck:null,ok:true,used:{},usedBy:{}};
  const tick=(n=1,input={x:0,y:0})=>{ for(let i=0;i<n;i++){ step(P,1,input); st.frames++;
    if(P.isClimbing){ const s=sector(P.position.y); st.minStam=Math.min(st.minStam,P.stamina); st.minBy[s]=Math.min(st.minBy[s]??100,P.stamina); st.maxFatigue=Math.max(st.maxFatigue,P.pullFatigue); } } };
  const T=n=>Math.round(n*pace), HAMMER=Math.round(265+(pace-1)*90);
  const eye=()=>P.eyePos(new V());
  const freeHand=tp=>{ const h0=P.hands[0], h1=P.hands[1]; if(!h0.inContact) return 0; if(!h1.inContact) return 1; return h0.point.distanceTo(tp)>=h1.point.distanceTo(tp)?0:1; };
  const swing=tp=>{ const hs=P.hands.filter(x=>x.inContact); if(hs.length<2) return; P._release(hs[0].point.distanceTo(tp)>hs[1].point.distanceTo(tp)?hs[0]:hs[1]); tick(10); };
  const pill=()=>{ if(P.isClimbing&&Math.min(...P.hands.map(h=>h.inContact?h.stamina:100))<12){ P.restoreStamina(); st.pills++; st.pillAt.push(+P.position.y.toFixed(0)); } };
  const pullUntil=(cond,max=90)=>{ for(let i=0;i<max*pace&&!P.dead;i++){ if(cond()) return true; if(P.canPull) P.pullBy(6/Math.sqrt(pace)); tick(); pill(); } return cond(); };
  // num descanso (checkpoint) recupera tudo antes de seguir; nas outras bordas, só se estiver gasto
  const rest=()=>{ if(!(P.grounded&&!P.isClimbing)) return; const on=plats.find(pd=>pd.kind==='rest'&&Math.abs(P.position.y-pd.top)<.06&&solidInXZ(pd,P.position.x,P.position.z,.05));
    if(!on&&P.stamina>=70&&P.pullFatigue<=.35) return; st.rests++; let k=0; while((P.stamina<98||P.pullFatigue>.05)&&k++<1500) tick(); };
  const use=k=>{ st.used[k]=(st.used[k]||0)+1; const s=sector(P.position.y); (st.usedBy[s]=st.usedBy[s]||{})[k]=1; };
  // anda em pé até q (no topo de pd); numa borda curva, segue a curva em passos de ~0,2 rad
  const walkTo=(q,pd,done,max=600)=>{ let i=0;
    while(i++<max&&!done()){ let tx=q.x, tz=q.z;
      if(pd&&pd.arc){ const A=pd.arc, px=P.position.x-A.cx, pz=P.position.z-A.cz, ac=Math.atan2(pz,px), d=wrapPi(Math.atan2(q.z-A.cz,q.x-A.cx)-ac);
        if(Math.abs(d)>.2){ const r=clamp(Math.hypot(px,pz),A.r0+.35,A.r1-.35), an=ac+Math.sign(d)*.2; tx=A.cx+Math.cos(an)*r; tz=A.cz+Math.sin(an)*r; } }
      const dx=tx-P.position.x, dz=tz-P.position.z; P.yaw=Math.atan2(-dx,-dz); tick(1,{x:0,y:Math.min(1,Math.hypot(q.x-P.position.x,q.z-P.position.z)*2)}); } };
  // prego: com um braço só (pendurado) ou em pé
  const hammer=()=>{
    if(P.isClimbing&&!P.grounded){
      const L=P.hands[0], R=P.hands[1];
      if(R.inContact){ if(L.inContact) P._release(R); else { grab(P,0,R.surface,R.point.clone(),R.normal.clone()); P._release(R); } }
      R.occupied=true; tick(HAMMER); pill(); R.occupied=false;
    } else tick(HAMMER);
  };
  const grabHold=h=>{
    let target=h.m, pt=h.cont?h.p:undefined, n=h.cont?h.n:undefined;
    if(h.socket){ const sk=h.sk; if(!sk.used){ hammer(); sk.used=true; const a=world.addNail(sk.pos.clone(),sk.normal.clone()); a.userData.crumble=false; a.userData.fixed=true; a.userData.interactable.fixed=true; st.nails++; h.nail=a; } target=h.nail; pt=undefined; n=undefined; }
    const i=freeHand(h.p), hh=P.hands[i];
    if(hh.inContact&&P.hands[1-i].inContact){ P._release(hh); tick(T(18)); }
    else if(hh.inContact) P._release(hh);
    grab(P,i,target,pt,n);
    use(h.socket?'prego':h.cont||(h.rung?'degrau':'tijolo'));
  };
  const fail=msg=>{ st.stuck=msg; st.ok=false; };
  for(let k=1;k<path.length&&st.ok;k++){
    const u=path[k-1], v=path[k];
    if(teleTo.get(u)===v){ const pd=plats[v-N], q=solidClampIn(pd,P.position.x,P.position.z,.4,{}); P.releaseAll(); P.position.set(q.x,pd.top,q.z); P._prev.copy(P.position); P.velocity.set(0,0,0); P.grounded=true; tick(30); rest(); continue; }
    if(v<N){ const h=holds[v];
      if(P.grounded&&!P.isClimbing){ rest();
        if(u>=N){ const pd=plats[u-N], q=solidClampIn(pd,h.p.x,h.p.z,.06,{});
          walkTo(q,pd,()=>Math.hypot(P.position.x-q.x,P.position.z-q.z)<=.12||eye().distanceTo(h.p)<=P.reach-.15); tick(6); } }
      if(pace>1) tick(T(8)-8);                                        // procura a próxima agarra
      const reachable=()=>eye().distanceTo(h.p)<=P.reach-(P.grounded?.005:.03);   // pendurado o corpo balança: folga de 3 cm
      if(!reachable()&&P.isClimbing){ swing(h.p); tick(8); }
      if(!reachable()&&P.isClimbing) pullUntil(reachable);
      if(!reachable()){ const e=eye(); fail(`agarra y=${h.p.y.toFixed(2)} θ=${(Math.atan2(h.p.z,h.p.x)*57.3).toFixed(0)}° (${h.cont||(h.socket?'soquete':'tijolo')}) fora do alcance (${e.distanceTo(h.p).toFixed(2)} m; alcance ${P.reach}; puxada ${P.pull.toFixed(2)}; fadiga ${P.pullFatigue.toFixed(2)})`); break; }
      grabHold(h); tick(T(12)); pill();
      if(dbg&&k%6===0) dbg(`mov ${k} y ${h.p.y.toFixed(1)} est ${P.hands.map(x=>x.stamina.toFixed(0)).join('/')} fadiga ${P.pullFatigue.toFixed(2)}`);
    } else { const pd=plats[v-N];
      const edge=(Gr.adj[u].find(e=>e[0]===v)||[])[1];
      if(u>=N&&edge==='walk'){ const from=plats[u-N], c=Gr.centroid(pd), q1=solidClampIn(from,c.x,c.z,.25,{}), q=solidClampIn(pd,q1.x,q1.z,.4,{});
        // primeiro até a ponta da borda de onde sai (por dentro dela: tubo, viga, passarela curva), depois passa para a outra
        walkTo(q1,from.arc?from:null,()=>Math.hypot(P.position.x-q1.x,P.position.z-q1.z)<=.12||solidInXZ(pd,P.position.x,P.position.z,-.3),400);
        walkTo(q,pd.arc?pd:null,()=>P.grounded&&Math.abs(P.position.y-pd.top)<.05&&solidInXZ(pd,P.position.x,P.position.z,-.3),400); tick(10); use('andar'); continue; }
      if(u>=N){ // em pé → borda mais alta: vai até o ponto mais perto dela, agarra e sobe
        const A=plats[u-N], c=Gr.centroid(pd), q=solidClampIn(A,c.x,c.z,.3,{});
        walkTo(q,A,()=>Math.hypot(P.position.x-q.x,P.position.z-q.z)<=.1||Gr.dist3(eye(),pd)<=P.reach-.2); tick(6); }
      const e=eye(), q=solidClampIn(pd,e.x,e.z,.02,{}), pt=new V(q.x,pd.top,q.z), m=meshOf(pd), n=new V(e.x-q.x,0,e.z-q.z); const nl=Math.hypot(n.x,n.z)||1; n.multiplyScalar(1/nl);
      const near=()=>Gr.dist3(eye(),pd)<=P.reach-.03; if(!near()){ swing(pt); tick(8); } if(!near()) pullUntil(near);
      const i=freeHand(pt), hh=P.hands[i]; if(hh.inContact) P._release(hh); grab(P,i,m,pt,n);
      pullUntil(()=>!!P.canMantle(),150);
      if(!P.canMantle()){ fail(`não conseguiu subir na borda ${pd.kind} (${pd.top.toFixed(1)} m)`); break; }
      P.jump(); tick(40); use('borda:'+pd.kind);
      if(!(P.grounded&&Math.abs(P.position.y-pd.top)<.05)){ fail(`mantle na borda ${pd.kind} (${pd.top.toFixed(1)} m) não deixou em pé`); break; }
      rest();
    }
    if(P.dead){ fail(`morreu (${P.deathReason}) em ${P.position.y.toFixed(1)} m`); break; }
    if(!P.isClimbing&&!P.grounded&&!P.mantle){ tick(20); if(!P.grounded) st.falls++; }
  }
  return st;
};
