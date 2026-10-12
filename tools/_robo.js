// Robô que percorre uma rota do grafo de alcance (_grafo.js) com a física REAL do Player — usado por test_rota.js.
// Joga como um jogador cuidadoso: leva a mão de trás até a próxima agarra (~0,3 s), deixa o corpo balançar sob a mão
// da frente antes de puxar, só puxa o corpo quando a agarra ainda não está ao alcance, sobe nas bordas (mantle), crava
// prego nos soquetes (1 prego + 3 marteladas) e descansa em pé (estamina e fadiga dos braços) antes de continuar.
// Pílula só pendurado e quase sem força. As alas são atravessadas por teletransporte (conferidas em outros testes).
// opts: {world, P (Player), grab(P,i,mesh,point,normal), step(P,n,input), Gr, path, sector(y)}  →  estatísticas
module.exports=function percorrer({world,P,grab,step,Gr,path,sector,dbg}){
  const {holds,plats,N}=Gr, V=world.spawnPoint.constructor;
  const teleTo=new Map(Gr.tele.map(([a,b])=>[a,b]));
  const meshOf=pd=>world.grabbables.find(m=>m.userData.plat===pd)||world.walls.find(m=>m.userData.solid===pd);
  const st={frames:0,pills:0,pillAt:[],nails:0,rests:0,falls:0,minStam:100,minBy:{},maxFatigue:0,stuck:null,ok:true};
  const tick=(n=1,input={x:0,y:0})=>{ for(let i=0;i<n;i++){ step(P,1,input); st.frames++;
    if(P.isClimbing){ const s=sector(P.position.y); st.minStam=Math.min(st.minStam,P.stamina); st.minBy[s]=Math.min(st.minBy[s]??100,P.stamina); st.maxFatigue=Math.max(st.maxFatigue,P.pullFatigue); } } };
  const eye=()=>P.eyePos(new V());
  // a mão que vai para a próxima agarra: a livre, ou a que segura mais longe do alvo (a "de trás")
  const freeHand=tp=>{ const h0=P.hands[0], h1=P.hands[1]; if(!h0.inContact) return 0; if(!h1.inContact) return 1; return h0.point.distanceTo(tp)>=h1.point.distanceTo(tp)?0:1; };
  // fora do alcance com as duas mãos presas: solta a de trás e deixa o corpo balançar para baixo da mão da frente
  const swing=tp=>{ const hs=P.hands.filter(x=>x.inContact); if(hs.length<2) return; P._release(hs[0].point.distanceTo(tp)>hs[1].point.distanceTo(tp)?hs[0]:hs[1]); tick(10); };
  const pill=()=>{ if(P.isClimbing&&Math.min(...P.hands.map(h=>h.inContact?h.stamina:100))<12){ P.restoreStamina(); st.pills++; st.pillAt.push(+P.position.y.toFixed(0)); } };
  const pullUntil=(cond,max=90)=>{ for(let i=0;i<max&&!P.dead;i++){ if(cond()) return true; if(P.canPull) P.pullBy(6); tick(); pill(); } return cond(); };
  // em pé: descansa se a estamina ou os braços estiverem gastos (como quem para num patamar antes do próximo trecho)
  const rest=()=>{ if(!(P.grounded&&!P.isClimbing)) return; if(P.stamina>=70&&P.pullFatigue<=.35) return; st.rests++; let k=0; while((P.stamina<98||P.pullFatigue>.05)&&k++<1500) tick(); };
  const grabHold=h=>{
    let target=h.m;
    if(h.socket){ const sk=h.sk; if(!sk.used){ sk.used=true; const a=world.addNail(sk.pos.clone(),sk.normal.clone()); a.userData.crumble=false; a.userData.fixed=true; a.userData.interactable.fixed=true; st.nails++; h.nail=a; } target=h.nail; }
    const i=freeHand(h.p), hh=P.hands[i];
    if(hh.inContact&&P.hands[1-i].inContact){ P._release(hh); tick(18); }      // levar a mão até a próxima agarra leva ~0,3 s (ela descansa nesse tempo)
    else if(hh.inContact) P._release(hh);
    grab(P,i,target);
  };
  const fail=msg=>{ st.stuck=msg; st.ok=false; };
  for(let k=1;k<path.length&&st.ok;k++){
    const u=path[k-1], v=path[k];
    if(teleTo.get(u)===v){ const pd=plats[v-N], q=solidClampIn(pd,P.position.x,P.position.z,.4,{}); P.releaseAll(); P.position.set(q.x,pd.top,q.z); P._prev.copy(P.position); P.velocity.set(0,0,0); P.grounded=true; tick(30); rest(); continue; }
    if(v<N){ const h=holds[v];
      if(P.grounded&&!P.isClimbing){ rest();
        // em pé: anda até o ponto da borda mais perto da agarra (o grafo considera a borda inteira)
        if(u>=N){ const pd=plats[u-N], q=solidClampIn(pd,h.p.x,h.p.z,.06,{}); let i=0;
          while(i++<600&&Math.hypot(P.position.x-q.x,P.position.z-q.z)>.12&&eye().distanceTo(h.p)>P.reach-.15){ P.yaw=Math.atan2(-(q.x-P.position.x),-(q.z-P.position.z)); tick(1,{x:0,y:Math.min(1,Math.hypot(P.position.x-q.x,P.position.z-q.z)*2)}); }
          tick(6); } }
      const reachable=()=>eye().distanceTo(h.p)<=P.reach-.03;
      if(!reachable()&&P.isClimbing){ swing(h.p); tick(8); }          // primeiro balança sob a mão da frente…
      if(!reachable()&&P.isClimbing) pullUntil(reachable);           // …e só puxa o corpo se ainda faltar
      if(!reachable()){ const e=eye(); fail(`agarra y=${h.p.y.toFixed(2)} θ=${(Math.atan2(h.p.z,h.p.x)*57.3).toFixed(0)}° fora do alcance (${e.distanceTo(h.p).toFixed(2)} m; alcance ${P.reach}; puxada ${P.pull.toFixed(2)}; fadiga ${P.pullFatigue.toFixed(2)})`); break; }
      grabHold(h); tick(12); pill();
      if(dbg&&k%6===0) dbg(`mov ${k} y ${h.p.y.toFixed(1)} est ${P.hands.map(x=>x.stamina.toFixed(0)).join('/')} fadiga ${P.pullFatigue.toFixed(2)}`);
    } else { const pd=plats[v-N];
      if(u>=N){ // borda → borda: anda até ela
        const q=solidClampIn(pd,P.position.x,P.position.z,.4,{}); P.yaw=Math.atan2(-(q.x-P.position.x),-(q.z-P.position.z)); let i=0;
        while(i++<400&&!(P.grounded&&Math.abs(P.position.y-pd.top)<.05&&solidInXZ(pd,P.position.x,P.position.z,-.3))) tick(1,{x:0,y:1}); tick(10); continue; }
      // agarra → borda: segura a borda no ponto mais perto do olho e sobe (mantle)
      const e=eye(), q=solidClampIn(pd,e.x,e.z,.02,{}), pt=new V(q.x,pd.top,q.z), m=meshOf(pd), n=new V(e.x-q.x,0,e.z-q.z); const nl=Math.hypot(n.x,n.z)||1; n.multiplyScalar(1/nl);
      const near=()=>Gr.dist3(eye(),pd)<=P.reach-.03; if(!near()){ swing(pt); tick(8); } if(!near()) pullUntil(near);
      const i=freeHand(pt), hh=P.hands[i]; if(hh.inContact) P._release(hh); grab(P,i,m,pt,n);
      pullUntil(()=>!!P.canMantle(),150);
      if(!P.canMantle()){ fail(`não conseguiu subir na borda ${pd.kind} (${pd.top.toFixed(1)} m)`); break; }
      P.jump(); tick(40);
      if(!(P.grounded&&Math.abs(P.position.y-pd.top)<.05)){ fail(`mantle na borda ${pd.kind} (${pd.top.toFixed(1)} m) não deixou em pé`); break; }
      rest();
    }
    if(P.dead){ fail(`morreu (${P.deathReason}) em ${P.position.y.toFixed(1)} m`); break; }
    if(!P.isClimbing&&!P.grounded&&!P.mantle){ tick(20); if(!P.grounded) st.falls++; }
  }
  return st;
};
