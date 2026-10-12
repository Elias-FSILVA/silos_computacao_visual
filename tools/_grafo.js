// Grafo de alcance sobre o mundo real — usado por test_mundo, test_escalada e test_rota.
// Nós: agarras (tijolos, degraus de escada), soquetes de prego e bordas onde se fica em pé (descansos, soleiras,
// passarelas, grades, vigas…), de qualquer forma: caixa, girada ou setor anelar (distâncias por Collision.js).
// Arestas dirigidas com o alcance REAL do Player: olho a 0,85 m abaixo da agarra (pendurado) ou 0,2 m (puxado), 0,5 m à
// frente da parede; alcance 2,0 m (1,7 m com estamina baixa).
//   'hang' / 'pull' / 'pullmax'  agarra → agarra      'mantle'  agarra → borda      'stand'  borda → agarra
//   'walk'  borda → borda no mesmo nível, encostadas
// As alas entram como teletransportes (o caminho dentro delas — puzzle, piso, escada, elevador, fluxo de ar — é conferido à parte).
// customWings(at,cp) → lista de alas (outro mapa); o.standClamp(q,hold) → onde o corpo para junto à parede (outro poço)
module.exports=function grafo(world,customWings,o={}){
  const V=world.spawnPoint.constructor, REACH_OK=2.0, REACH_LOW=1.7;
  const holds=[...world.grabbables.filter(m=>m.userData.type==='hold').map(m=>({k:'h',p:m.position,n:m.userData.wallNormal||new V(),crumble:!!m.userData.crumble,socket:false,extra:!!m.userData.extra,rung:!!m.userData.rung,m})),
               ...world.sockets.map(s=>({k:'h',p:s.p,n:s.n,crumble:false,socket:true,sk:s.sk}))];
  const KINDS=new Set(['rest','sill','cache','exit','tunnel','platform','gallery','tank','shelf','landing','grate','bridge']);
  const isFloor=p=>p.kind==='floor'&&p.top===0&&p.minX<=-3.5&&p.maxX>=3.5&&p.minZ<=-3.5&&p.maxZ>=3.5;   // piso do fundo do poço
  const plats=world.platforms.filter(p=>(p.climbable&&p.kind!=='pipe')||KINDS.has(p.kind)||isFloor(p));
  const N=holds.length, M=plats.length, node=i=>i<N?holds[i]:plats[i-N];
  const eyeOf=(h,pull)=>new V(h.p.x+h.n.x*.5,h.p.y-(pull?.2:.85),h.p.z+h.n.z*.5);
  const dist3=(e,pd)=>Math.hypot(solidDistXZ(pd,e.x,e.z),Math.max(solidBottom(pd)-e.y,0,e.y-pd.top));
  const centroid=pd=>pd.arc?{x:pd.arc.cx+Math.cos(pd.arc.a0+pd.arc.span/2)*(pd.arc.r0+pd.arc.r1)/2,z:pd.arc.cz+Math.sin(pd.arc.a0+pd.arc.span/2)*(pd.arc.r0+pd.arc.r1)/2}:pd.obb?{x:pd.obb.cx,z:pd.obb.cz}:{x:(pd.minX+pd.maxX)/2,z:(pd.minZ+pd.maxZ)/2};
  // distância entre as pegadas de duas bordas (pontos mais próximos por projeções alternadas)
  const footDist=(A,B)=>{ const cA=centroid(A), cB=centroid(B); if(solidInXZ(A,cB.x,cB.z)||solidInXZ(B,cA.x,cA.z)) return 0;
    let b=cB, a; for(let i=0;i<4;i++){ a=solidClampIn(A,b.x,b.z,0,{}); b=solidClampIn(B,a.x,a.z,0,{}); } return Math.hypot(a.x-b.x,a.z-b.z); };
  const adj=Array.from({length:N+M},()=>[]);
  // pré-filtro espacial por altura (o mapa tem 400 m): só compara o que está a menos de 4 m na vertical
  const byY=[...holds.keys()].sort((a,b)=>holds[a].p.y-holds[b].p.y), ys=byY.map(i=>holds[i].p.y);
  const lowerBound=y=>{ let lo=0,hi=ys.length; while(lo<hi){ const m=(lo+hi)>>1; if(ys[m]<y) lo=m+1; else hi=m; } return lo; };
  const holdsNear=(y0,y1,f)=>{ for(let k=lowerBound(y0);k<ys.length&&ys[k]<=y1;k++) f(byY[k]); };
  for(let i=0;i<N;i++){
    const A=holds[i], eh=eyeOf(A,false), ep=eyeOf(A,true);
    holdsNear(A.p.y-2.5,A.p.y+2.5,j=>{ if(i===j) return; const B=holds[j], dh=eh.distanceTo(B.p), dp=ep.distanceTo(B.p);
      if(dp<=REACH_OK+.02) adj[i].push([j,dh<=REACH_OK?'hang':(dp<=REACH_LOW?'pull':'pullmax')]); });
    for(let k=0;k<M;k++){ const pd=plats[k]; if(pd.top<A.p.y-3||solidBottom(pd)>A.p.y+3) continue; if(dist3(ep,pd)<=REACH_OK&&ep.y>=solidBottom(pd)-1.3-.06) adj[i].push([N+k,'mantle']); }
  }
  for(let k=0;k<M;k++){ const pd=plats[k];
    // em pé: o olho fica sobre o ponto da borda mais perto da agarra; dentro do poço o corpo encosta na parede em r = R − RAD
    holdsNear(pd.top-.5,pd.top+3.7,j=>{ const B=holds[j], q=solidClampIn(pd,B.p.x,B.p.z,0,{}), r=Math.hypot(q.x,q.z), lim=SHAFT_R-RAD;
      if(o.standClamp) o.standClamp(q,B); else if(Math.hypot(B.p.x,B.p.z)<SHAFT_R+.1&&r>lim){ q.x*=lim/r; q.z*=lim/r; }
      const e=new V(q.x,pd.top+1.6,q.z); if(e.distanceTo(B.p)<=REACH_OK) adj[N+k].push([j,'stand']); });
    for(let l=0;l<M;l++){ if(l===k) continue; const B=plats[l]; if(Math.abs(pd.top-B.top)<.05&&footDist(pd,B)<.5) adj[N+k].push([N+l,'walk']); }
  }
  const idxP=pd=>N+plats.indexOf(pd);
  // busca em largura (0-1: arestas que exigem prego custam 1). opts: allowed (Set de tipos), noCrumble, noSockets, tele [[a,b]]
  function search(starts,opts={}){
    const allowed=opts.allowed||new Set(['hang','pull','pullmax','stand','mantle','walk']), dd=new Array(N+M).fill(1e9), prev=new Array(N+M).fill(-1), q=[];
    const ex=new Map(); (opts.tele||[]).forEach(([a,b])=>{ (ex.get(a)||ex.set(a,[]).get(a)).push(b); });
    starts.forEach(s=>{ dd[s]=0; q.push(s); });
    while(q.length){ const u=q.shift();
      for(const [v,c] of adj[u]){ if(!allowed.has(c)) continue; if(v<N){ if(opts.noCrumble&&holds[v].crumble) continue; if(opts.noSockets&&holds[v].socket) continue; }
        const w=dd[u]+(v<N&&holds[v].socket?1:0); if(w<dd[v]){ dd[v]=w; prev[v]=u; if(w>dd[u]) q.push(v); else q.unshift(v); } }
      for(const v of (ex.get(u)||[])) if(dd[u]<dd[v]){ dd[v]=dd[u]; prev[v]=u; q.unshift(v); } }
    return {dd,prev,path:t=>{ const p=[]; for(let v=t;v>=0;v=prev[v]) p.unshift(v); return p; }};
  }
  // teletransportes das alas: soleira (ou boca) → plataforma de saída
  const plat=f=>world.platforms.find(f);
  const at=(kind,y)=>plat(p=>p.kind===kind&&Math.abs(p.top-y)<.01), cp=id=>{ const c=world.checkpoints.find(c=>c.id===id); return c&&c.bounds; };
  const wings=customWings?customWings(at,cp):[
    {id:'h1',   label:'Casa das Bombas (100 → 110 m)',   from:at('sill',100),   to:cp(HALLS[0].exitId)},
    {id:'ex150',label:'Galeria do exaustor (150 → 174 m)',from:cp('cp7'),        to:cp('cp_exa')},
    {id:'p200', label:'Pátio das Máquinas (200 → 224 m)', from:at('sill',HUB.H), to:cp(HUB.exitId)},
    {id:'insuf',label:'Insuflador (246 → 252 m)',         from:cp('cp10'),       to:cp('cp_ins')},
    {id:'mz300',label:'Arquivo (300 → 310 m)',            from:at('sill',MAZE.H),to:cp('cp13')}
  ];
  const tele=wings.map(w=>[idxP(w.from),idxP(w.to)]);
  const start=N+plats.findIndex(isFloor), exit=N+plats.findIndex(p=>p.kind==='exit');
  return {holds,plats,N,M,node,adj,idxP,search,wings,tele,start,exit,eyeOf,dist3,footDist};
};
