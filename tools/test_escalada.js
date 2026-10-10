// Diagnóstico de ESCALADA com o alcance REAL do Player: olho a 0,85 m abaixo da agarra (pendurado) ou 0,2 m (puxado), 0,5 m à frente da parede,
// alcance 2,0 m (1,7 m com stamina baixa). Procura trechos onde o jogador fica preso e mede os vãos entre agarras.
const log=console.log; console.log=()=>{};
const {V3,world}=require('./_load.js'); console.log=log;
const REACH_OK=2.0, REACH_LOW=1.7;
const holds=[...world.grabbables.filter(m=>m.userData.type==='hold').map(m=>({p:m.position,n:m.userData.wallNormal||new V3(0,0,0),crumble:!!m.userData.crumble,socket:false,extra:!!m.userData.extra,m})),
  ...world.sockets.map(s=>({p:s.p,n:s.n,crumble:false,socket:true}))];
const plats=world.platforms.filter(p=>p.climbable&&p.kind!=='pipe'||['rest','sill','exit','tunnel','platform','gallery','tank','shelf','cache','floor'].includes(p.kind));
const eyePull=(h,pull)=>new V3(h.p.x+h.n.x*.5,h.p.y-(pull?.2:.85),h.p.z+h.n.z*.5);
const distAABB=(e,pd)=>{ const dx=Math.max(pd.minX-e.x,0,e.x-pd.maxX), dy=Math.max(pd.bottom-e.y,0,e.y-pd.top), dz=Math.max(pd.minZ-e.z,0,e.z-pd.maxZ); return Math.hypot(dx,dy,dz); };
const N=holds.length, M=plats.length, node=i=>i<N?holds[i]:plats[i-N];
const adj=Array.from({length:N+M},()=>[]);   // arestas dirigidas; custo: 'hang' (confortável) | 'pull' (puxando) | nail (soquete)
for(let i=0;i<N;i++){
  const A=holds[i], eh=eyePull(A,false), ep=eyePull(A,true);
  for(let j=0;j<N;j++){ if(i===j) continue; const B=holds[j]; const dh=eh.distanceTo(B.p), dp=ep.distanceTo(B.p);
    if(dp<=REACH_OK+.02) adj[i].push([j,dh<=REACH_OK?'hang':(dp<=REACH_LOW?'pull':'pullmax')]); }
  for(let k=0;k<M;k++){ const pd=plats[k]; if(distAABB(ep,pd)<=REACH_OK&&ep.y>=pd.bottom-1.3-.06) adj[i].push([N+k,'mantle']); }
}
for(let k=0;k<M;k++){ const pd=plats[k]; // em pé na plataforma: mãos alcançam agarras a ≤2,0 m do olho
  for(let j=0;j<N;j++){ const B=holds[j]; const e=new V3(Math.min(Math.max(B.p.x,pd.minX),pd.maxX),pd.top+1.6,Math.min(Math.max(B.p.z,pd.minZ),pd.maxZ)); if(e.distanceTo(B.p)<=REACH_OK) adj[N+k].push([j,'stand']); }
  for(let l=0;l<M;l++){ if(l===k) continue; const A=pd,B=plats[l]; const dx=Math.max(A.minX-B.maxX,0,B.minX-A.maxX), dz=Math.max(A.minZ-B.maxZ,0,B.minZ-A.maxZ); if(Math.abs(A.top-B.top)<.05&&Math.hypot(dx,dz)<.5) adj[N+k].push([N+l,'walk']); } }
// teletransportes: soleira → saída (dentro dos salões o jogador anda e escala; testado em test_mundo)
const idxP=pd=>N+plats.indexOf(pd);
const sill=H=>world.platforms.find(p=>p.kind==='sill'&&Math.abs(p.top-H)<.01), ex=H=>world.platforms.find(p=>p.kind==='platform'&&Math.abs(p.top-(H+10))<.01&&(Math.abs(p.minX)>2.4||Math.abs(p.minZ)>2.4||Math.abs(p.maxX)>2.4||Math.abs(p.maxZ)>2.4));
const tele=[100,200,300].map(H=>[idxP(sill(H)),idxP(ex(H))]);
function reach(opts){ // opts.noCrumble / opts.noSockets / opts.allowed(set de custos)
  const seen=new Array(N+M).fill(false), q=[]; const floor=plats.findIndex(p=>p.kind==='floor'&&p.minX<=-3.9&&p.maxX>=3.9&&Math.abs(p.top)<.01); if(floor<0) throw new Error('piso inicial');
  seen[N+floor]=true; q.push(N+floor);
  while(q.length){ const u=q.shift(); for(const [v,c] of adj[u]){ if(seen[v]||!opts.allowed.has(c)) continue; if(v<N){ if(opts.noCrumble&&holds[v].crumble) continue; if(opts.noSockets&&holds[v].socket) continue; } seen[v]=true; q.push(v); }
    for(const [a,b] of tele) if(u===a&&!seen[b]){ seen[b]=true; q.push(b); } }
  return seen; }
const exitIdx=N+plats.findIndex(p=>p.kind==='exit');
const modes=[['confortável (só pendurado)',{allowed:new Set(['hang','stand','mantle','walk']),noCrumble:true,noSockets:false}],
             ['puxando (até 1,7 m)',{allowed:new Set(['hang','pull','stand','mantle','walk']),noCrumble:true,noSockets:false}],
             ['puxando ao máximo (2,0 m)',{allowed:new Set(['hang','pull','pullmax','stand','mantle','walk']),noCrumble:true,noSockets:false}]];
let fails=0; const out=(k,v)=>log(k.padEnd(60),v);
out('agarras / soquetes / plataformas',`${holds.filter(h=>!h.socket).length} / ${holds.filter(h=>h.socket).length} / ${M}`);
out('agarras que desmoronam',`${holds.filter(h=>h.crumble).length} (${(100*holds.filter(h=>h.crumble).length/holds.filter(h=>!h.socket).length).toFixed(0)}%)`);
for(const [name,o] of modes){ const s=reach(o); const top=Math.max(0,...holds.map((h,i)=>s[i]?h.p.y:0)); const ok=s[exitIdx]; out(`chega ao topo SEM agarras que desmoronam — ${name}`,(ok?'SIM':'NÃO')+` · altura máxima ${top.toFixed(1)} m`); if(name.startsWith('puxando (')&&!ok) fails++; }
// onde trava (modo puxando): maior altura alcançada e quais agarras ficam logo acima sem ligação
{ const s=reach(modes[1][1]); let top=-1, ti=-1; holds.forEach((h,i)=>{ if(s[i]&&h.p.y>top){ top=h.p.y; ti=i; } });
  if(!s[exitIdx]){ log(`  trava em y=${top.toFixed(1)} (x ${holds[ti].p.x.toFixed(1)}, z ${holds[ti].p.z.toFixed(1)})`); const above=holds.map((h,i)=>({h,i})).filter(o=>!s[o.i]&&o.h.p.y>top&&o.h.p.y<top+4).sort((a,b)=>a.h.p.y-b.h.p.y).slice(0,3); above.forEach(o=>log(`   próxima agarra isolada: y=${o.h.p.y.toFixed(1)} dist ${holds[ti].p.distanceTo(o.h.p).toFixed(2)} m`)); } }
// vãos: para cada agarra (normal) a distância até a próxima agarra utilizável logo ACIMA (sem as que desmoronam)
const gaps=[]; holds.forEach((a,i)=>{ if(a.socket||a.crumble) return; const ep=eyePull(a,true); let best=9; for(const b of holds){ if(b===a||b.crumble||b.p.y<=a.p.y+.2||b.p.y>a.p.y+3) continue; const d=ep.distanceTo(b.p); if(d<best) best=d; } if(best<9) gaps.push([a.p.y,best]); });
const big=gaps.filter(g=>g[1]>1.7), huge=gaps.filter(g=>g[1]>2.0); out('agarras cuja próxima (acima) exige mais que 1,7 m / 2,0 m',`${big.length} / ${huge.length} de ${gaps.length}`);
const byStage=[[0,100],[100,200],[200,300],[300,400]].map(([a,b])=>{ const g=gaps.filter(x=>x[0]>=a&&x[0]<b); return `${a}-${b}: ${g.filter(x=>x[1]>1.7).length}/${g.length}`; }); out('  >1,7 m por subida',byStage.join('  '));
// detalhe: nas subidas GERADAS (y>41), qual a pior distância até o próximo tijolo firme acima e quantos 'becos' (sem próximo ao alcance)?
{ const firm=holds.filter(h=>!h.crumble); const worst=[]; let dead=0, tot=0;
  firm.forEach(a=>{ if(a.p.y<41||a.socket||a.extra||Math.abs(a.p.x)>4.3||Math.abs(a.p.z)>4.3) return; const ep=eyePull(a,true); let best=9; for(const b of firm){ if(b===a||b.p.y<=a.p.y+.15||b.p.y>a.p.y+3) continue; const d=ep.distanceTo(b.p); if(d<best) best=d; } tot++; if(best>2.02){ dead++; worst.push([a.p.y,a.p.x,a.p.z]); } });
  // um 'beco' só é problema se também não houver plataforma ao alcance (mantle) nem soquete
  const real=worst.filter(([y,x,z])=>{ const a={p:new V3(x,y,z)}; const h=firm.find(f=>f.p.y===y&&f.p.x===x&&f.p.z===z); const ep=eyePull(h,true); return !plats.some(pd=>distAABB(ep,pd)<=2.0&&ep.y>=pd.bottom-1.36); });
  out('subidas geradas: tijolos firmes sem próximo ao alcance (exceto topo de trecho/plataforma)',`${real.length} de ${tot}`); real.slice(0,8).forEach(r=>{ const h=firm.find(f=>f.p.y===r[0]&&f.p.x===r[1]&&f.p.z===r[2]); const ep=eyePull(h,true); const near=firm.filter(b=>b!==h&&b.p.y>h.p.y-.5&&b.p.y<h.p.y+4).map(b=>[ep.distanceTo(b.p),b]).sort((a,b)=>a[0]-b[0]).slice(0,2); log(`   y=${r[0].toFixed(1)} (x ${r[1].toFixed(1)}, z ${r[2].toFixed(1)}) normal(${h.n.x},${h.n.z}) · vizinhos: `+near.map(([d,b])=>`${d.toFixed(2)}m→(y ${b.p.y.toFixed(1)}, x ${b.p.x.toFixed(1)}, z ${b.p.z.toFixed(1)})`).join(' | ')); }); if(real.length>6) fails++; }
log('falhas:',fails); process.exit(fails?1:0);
