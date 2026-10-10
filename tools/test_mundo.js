// Geometria do mapa: trancas, conectividade das subidas, salões (navegação + escalada) e labirinto.
const log=console.log; console.log=()=>{};
const {V3,world,vm}=require('./_load.js'); console.log=log;
const out=(k,v)=>log(k.padEnd(58),v);
let fails=0; const chk=(k,ok,extra='')=>{ out(k,(ok?'OK ':'FALHOU ')+extra); if(!ok) fails++; };

out('TOP',TOP); out('platforms / grabbables / walls',`${world.platforms.length} / ${world.grabbables.length} / ${world.walls.length}`);
out('interactables / lamps / checkpoints',`${world.interactables.length} / ${world.lamps.length} / ${world.checkpoints.length}`);
out('puzzleDefs',JSON.stringify(world.puzzleDefs)); out('openings (fixas + ramais)',world.openings.map(o=>o.id).join(','));
const ids=world.checkpoints.map(c=>c.id); chk('checkpoints com id único',new Set(ids).size===ids.length);

// ---------- 1) trancas: nenhuma agarra no poço dentro das bandas ----------
let bad=0; for(const b of LOCK_BANDS) for(const m of world.grabbables){ const p=m.position, t=m.userData.type; if(t==='ledge'||t==='beam') continue; if(p.y>b.y0-.5&&p.y<b.y1+.5&&Math.abs(p.x)<4.3&&Math.abs(p.z)<4.3) bad++; }
chk('sem agarras/pregos nas faixas seladas',bad===0);

// ---------- 2) conectividade (holds + plataformas) ----------
const holds=world.grabbables.filter(m=>m.userData.type==='hold').map(m=>({k:'h',p:m.position}));
const plats=world.platforms.filter(p=>p.climbable&&p.kind!=='pipe'||['rest','sill','cache','exit','tunnel','platform','gallery','tank','shelf'].includes(p.kind)).map(p=>({k:'p',pd:p}));
const nodes=[...holds,...plats], N=nodes.length;
const dPlat=(p,pd)=>{ const dx=Math.max(pd.minX-p.x,0,p.x-pd.maxX), dz=Math.max(pd.minZ-p.z,0,p.z-pd.maxZ), dy=p.y<pd.top-1.9?pd.top-1.9-p.y:(p.y>pd.top+2.0?p.y-pd.top-2.0:0); return Math.hypot(dx,dz,dy); };
function dist(a,b){ if(a.k==='h'&&b.k==='h') return a.p.distanceTo(b.p); if(a.k==='h') return dPlat(a.p,b.pd); if(b.k==='h') return dPlat(b.p,a.pd);
  const A=a.pd,B=b.pd, dx=Math.max(A.minX-B.maxX,0,B.minX-A.maxX), dz=Math.max(A.minZ-B.maxZ,0,B.minZ-A.maxZ), dy=Math.abs(A.top-B.top); return dy>2.2?9:Math.hypot(dx,dz)+(dy>.5?dy:0); }
const adj=Array.from({length:N},()=>[]);
for(let i=0;i<N;i++) for(let j=i+1;j<N;j++){ const d=dist(nodes[i],nodes[j]); if(d<=4.2){ const t=d<=1.75?0:d<=2.35?1:2; adj[i].push([j,t]); adj[j].push([i,t]); } }
const idxPlat=pd=>nodes.findIndex(n=>n.k==='p'&&n.pd===pd);
function bfs(starts,tele,cost){ const dd=new Array(N).fill(1e9), q=[]; starts.forEach(s=>{ dd[s]=0; q.push(s); }); const ex=new Map(); tele.forEach(([a,b])=>{ (ex.get(a)||ex.set(a,[]).get(a)).push(b); (ex.get(b)||ex.set(b,[]).get(b)).push(a); });
  while(q.length){ const u=q.shift(); for(const [v,t] of adj[u]){ const c=t===2?1:0; if(dd[u]+c<dd[v]){ dd[v]=dd[u]+c; c?q.push(v):q.unshift(v); } } for(const v of (ex.get(u)||[])) if(dd[u]<dd[v]){ dd[v]=dd[u]; q.unshift(v); } } return dd; }
const startIdx=[]; holds.forEach((h,i)=>{ if(h.p.y<3.2&&Math.hypot(h.p.x,h.p.z)<4.2) startIdx.push(i); });
const exitIdx=plats.findIndex(p=>p.pd.kind==='exit')+holds.length;
const sillOf=H=>world.platforms.find(p=>p.kind==='sill'&&Math.abs(p.top-H)<.01), exitOf=H=>world.platforms.find(p=>p.kind==='platform'&&Math.abs(p.top-(H+10))<.01&&(Math.abs(p.minX)>2.4||Math.abs(p.minZ)>2.4||Math.abs(p.maxX)>2.4||Math.abs(p.maxZ)>2.4));
const tele=[100,200,300].map(H=>[idxPlat(sillOf(H)),idxPlat(exitOf(H))]); chk('soleira e plataforma de saída existem nos 3 destinos',tele.every(([a,b])=>a>=0&&b>=0));
const withRooms=bfs(startIdx,tele), noRooms=bfs(startIdx,[]);
chk('com os salões: chega à porta de saída (400 m)',withRooms[exitIdx]<1e8,'· saltos que exigem prego: '+withRooms[exitIdx]);
chk('SEM os salões não se passa (trancas)',noRooms[exitIdx]>=1e8);
for(const H of [100,200,300]) chk(`  sem sala não alcança o duto de ${H+10} m`,noRooms[idxPlat(exitOf(H))]>=1e8);
let unreach=0; world.checkpoints.forEach(c=>{ if(c.bounds){ const i=idxPlat(c.bounds); if(i>=0&&withRooms[i]>=1e8){ unreach++; log('   inalcançável',c.id); } } }); chk('checkpoints alcançáveis',unreach===0);

// ---------- 3) salões: flood fill no chão (raio .3) a partir da boca do braço de entrada ----------
const uF_=g=>g.uF;
const floodHall=(g,starts)=>{
  const rm=world.puzzleRooms[g.id], z=rm.zoneRoom, H=g.H, R=.3, step=.2;
  const boxes=world.platforms.filter(p=>p.top>H+.35&&p.bottom<H+1.6&&!['floor','rail','gallery','door','smash'].includes(p.kind)&&p.maxX>z.minX-3&&p.minX<z.maxX+3&&p.maxZ>z.minZ-3&&p.minZ<z.maxZ+3);
  const x0=z.minX-3, z0=z.minZ-3, nx=Math.ceil((z.maxX-z.minX+6)/step), nz=Math.ceil((z.maxZ-z.minZ+6)/step);
  const blocked=(x,zz)=>boxes.some(b=>x>b.minX-R&&x<b.maxX+R&&zz>b.minZ-R&&zz<b.maxZ+R);
  const seen=new Uint8Array((nx+1)*(nz+1)), q=[]; const gi=(x,zz)=>[Math.round((x-x0)/step),Math.round((zz-z0)/step)];
  starts.forEach(([x,zz])=>{ const [a,b]=gi(x,zz); seen[b*(nx+1)+a]=1; q.push([a,b]); });
  while(q.length){ const [a,b]=q.pop(); for(const [da,db] of [[1,0],[-1,0],[0,1],[0,-1]]){ const na=a+da,nb=b+db; if(na<0||nb<0||na>nx||nb>nz||seen[nb*(nx+1)+na]) continue; const x=x0+na*step, zz=z0+nb*step; if(blocked(x,zz)) continue; seen[nb*(nx+1)+na]=1; q.push([na,nb]); } }
  return (x,zz)=>{ const [a,b]=gi(x,zz); return !!seen[b*(nx+1)+a]; };
};
for(const g of world.halls){
  const fr=g.fr, H=g.H, entry=fr.p(g.uN+1.2,H,g.vin), reach=floodHall(g,[[entry.x,entry.z]]);
  // pontos que o jogador precisa alcançar a pé (a menos de 1,6 m): todos os interativos de altura baixa dentro do salão
  const z=world.puzzleRooms[g.id].zoneRoom; let total=0,okc=0,miss=[];
  for(const m of [...world.interactables,...world.walls.filter(w=>w.userData.interactable)]){ let top=m; while(top.parent&&top.parent!==world.root) top=top.parent; const p=top.position; if(p.y<H-.1||p.y>H+2.9) continue; const px=p.x, pz=p.z;
    if(px<z.minX||px>z.maxX||pz<z.minZ||pz>z.maxZ) continue; total++; let hit=false; for(let r=0;r<=1.7&&!hit;r+=.4) for(let a=0;a<8&&!hit;a++) if(reach(px+Math.cos(a*.785)*r,pz+Math.sin(a*.785)*r)) hit=true; if(hit) okc++; else miss.push(`${m.userData.type}@${px.toFixed(1)},${p.y.toFixed(1)},${pz.toFixed(1)}`); }
  chk(`${g.id} (${g.kind}): interativos baixos alcançáveis a pé`,miss.length<=Math.ceil(total*.04),`${okc}/${total}`+(miss.length?' faltam: '+miss.slice(0,6).join(' | '):''));
  { const base=fr.p(uF_(g)-1.0,H,-6.5); chk(`${g.id}: pé da linha de escalada (fundo) alcançável a pé`,reach(base.x,base.z)); }
  // escalada interna: da linha de agarras do fundo até a galeria, e da galeria até a boca do braço de saída
  const gall=world.platforms.filter(p=>p.kind==='gallery'&&Math.abs(p.top-(H+10))<.01); const gi=gall.map(idxPlat);
  const base=[]; holds.forEach((h,i)=>{ const q=g.fr; const dx=h.p.x,dz=h.p.z; if(h.p.y>H+.4&&h.p.y<H+1.4&&dx>z.minX&&dx<z.maxX&&dz>z.minZ&&dz<z.maxZ) base.push(i); });
  const dd=bfs(base,[]); chk(`${g.id}: da base da parede do fundo até a galeria (H+10)`,gi.some(i=>dd[i]<1e8),'· pregos: '+Math.min(...gi.map(i=>dd[i])));
}
// subidas curtas dentro dos salões (reservatório da Casa das Bombas e estante alta do Arquivo)
for(const [kind,label,H0] of [['tank','topo do reservatório (página 2)',100],['shelf','topo da estante alta (7ª placa)',300]]){
  const tgt=plats.findIndex(p=>p.pd.kind===kind)+holds.length, base=[]; const pdT=plats[tgt-holds.length].pd;
  holds.forEach((h,i)=>{ if(h.p.y>H0+.4&&h.p.y<H0+1.3&&h.p.x>pdT.minX-1.6&&h.p.x<pdT.maxX+1.6&&h.p.z>pdT.minZ-1.6&&h.p.z<pdT.maxZ+1.6) base.push(i); });
  const dd=bfs(base,[]); chk(`subida curta: ${label}`,base.length>0&&dd[tgt]<1e8,`· agarras de partida ${base.length}, pregos ${dd[tgt]}`);
}
// labirinto
{ const M=MAZE, mz=world.maze, r=mz.route; let turns=0; for(let i=2;i<r.length;i++){ const a=[r[i-1][0]-r[i-2][0],r[i-1][1]-r[i-2][1]],b=[r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]]; if(a[0]!==b[0]||a[1]!==b[1]) turns++; }
  out('labirinto: rota / curvas / becos com placa',`${r.length} / ${turns} / ${mz.cfg&&world.puzzleRooms.mz300.info.deadTags.length}`);
  const H=M.H, rm=world.puzzleRooms.mz300, I=rm.info, boxes=world.platforms.filter(p=>p.top>H+1&&p.bottom<H+.5&&p.maxZ<-4.1&&!['floor','tunnel','door'].includes(p.kind));
  const step=.15,R=.3,x0=-11.2,z0=I.zF-1.2,x1=11.2,z1=-4.6,nx=Math.round((x1-x0)/step),nz=Math.round((z1-z0)/step), blocked=(x,z)=>boxes.some(b=>x>b.minX-R&&x<b.maxX+R&&z>b.minZ-R&&z<b.maxZ+R);
  const seen=new Uint8Array((nx+1)*(nz+1)), q=[], gi=(x,z)=>[Math.round((x-x0)/step),Math.round((z-z0)/step)]; { const [a,b]=gi(0,-6.5); seen[b*(nx+1)+a]=1; q.push([a,b]); }
  while(q.length){ const [a,b]=q.pop(); for(const [da,db] of [[1,0],[-1,0],[0,1],[0,-1]]){ const na=a+da,nb=b+db; if(na<0||nb<0||na>nx||nb>nz||seen[nb*(nx+1)+na]) continue; if(blocked(x0+na*step,z0+nb*step)) continue; seen[nb*(nx+1)+na]=1; q.push([na,nb]); } }
  const reach=(x,z)=>{ const [a,b]=gi(x,z); return !!seen[b*(nx+1)+a]; };
  let cells=0; for(let c=0;c<M.cols;c++)for(let r2=0;r2<M.rows;r2++) if(reach(-M.cols*M.cell/2+M.cell*(c+.5),I.zG-M.cell*(r2+.5))) cells++;
  chk('labirinto: todas as células alcançáveis a partir da entrada',cells===M.cols*M.rows,`${cells}/${M.cols*M.rows}`);
  const ex=(I.e0+I.e1)/2; chk('labirinto: chega à porta da saída',reach(ex,I.zF+.7));
  for(const t of I.deadTags){ const x=(I.xb(t[0])+I.xb(t[0]+1))/2, z=(I.zb(t[1])+I.zb(t[1]+1))/2; if(!reach(x,z)){ chk('placa de beco alcançável',false); } }
  chk('placas dos becos alcançáveis',true);
  chk('sala de leitura: mesa, estante, cofre e teclado alcançáveis',[[-5.1,-5.6],[-8.7,-7.4],[9.4,-11.9],[ex+2.4,I.zF+.6]].every(([x,z])=>reach(x,z)));
}
log('\nfalhas:',fails); process.exit(fails?1:0);
