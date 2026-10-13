// Diagnóstico de ESCALADA com o alcance REAL do Player (ver _grafo.js): procura trechos onde o jogador fica preso, mede os
// vãos entre agarras na parede curva e estima a estamina no pior trecho sem descanso de cada subida obrigatória.
const log=console.log; console.log=()=>{};
const {world,V3}=require('./_load.js'); console.log=log;
const Gr=require('./_grafo.js')(world), {holds,plats,N,M}=Gr, R=SHAFT_R;
let fails=0; const out=(k,v)=>log(k.padEnd(76),v);
out('agarras / soquetes / bordas',`${holds.filter(h=>!h.socket).length} / ${holds.filter(h=>h.socket).length} / ${M}`);
out('agarras que desmoronam',`${holds.filter(h=>h.crumble).length} (${(100*holds.filter(h=>h.crumble).length/holds.filter(h=>!h.socket).length).toFixed(0)}%)`);
const modes=[['confortável (só pendurado)',new Set(['hang','stand','mantle','walk','climbup'])],['puxando (até 1,7 m)',new Set(['hang','pull','stand','mantle','walk','climbup'])],['puxando ao máximo (2,0 m)',new Set(['hang','pull','pullmax','stand','mantle','walk','climbup'])]];
let best=null;
for(const [name,allowed] of modes){ const s=Gr.search([Gr.start],{allowed,noCrumble:true,tele:Gr.tele}); const top=Math.max(0,...holds.map((h,i)=>s.dd[i]<1e8?h.p.y:0)); const ok=s.dd[Gr.exit]<1e8;
  out(`chega ao topo SEM agarras que desmoronam — ${name}`,(ok?'SIM':'NÃO')+` · altura máxima ${top.toFixed(1)} m`); if(name.startsWith('puxando (')){ if(!ok) fails++; best=s; } }
// onde trava (modo puxando): maior altura alcançada e quais agarras ficam logo acima sem ligação
if(best.dd[Gr.exit]>=1e8){ let top=-1, ti=-1; holds.forEach((h,i)=>{ if(best.dd[i]<1e8&&h.p.y>top){ top=h.p.y; ti=i; } });
  log(`  trava em y=${top.toFixed(1)} (x ${holds[ti].p.x.toFixed(1)}, z ${holds[ti].p.z.toFixed(1)})`); }
// vãos: para cada agarra firme do poço, a distância (olho puxado) até a próxima agarra firme logo ACIMA
const shaft=h=>Math.hypot(h.p.x,h.p.z)<R+.05;
const gaps=[]; holds.forEach(a=>{ if(a.socket||a.crumble||!shaft(a)) return; const ep=Gr.eyeOf(a,true); let b=9; for(const c of holds){ if(c===a||c.crumble||c.p.y<=a.p.y+.2||c.p.y>a.p.y+3) continue; const d=ep.distanceTo(c.p); if(d<b) b=d; } if(b<9) gaps.push([a.p.y,b]); });
out('agarras do poço cuja próxima (acima) exige mais que 1,7 m / 2,0 m',`${gaps.filter(g=>g[1]>1.7).length} / ${gaps.filter(g=>g[1]>2.0).length} de ${gaps.length}`);
out('  >1,7 m por trecho',[[0,100],[100,200],[200,300],[300,400]].map(([a,b])=>{ const g=gaps.filter(x=>x[0]>=a&&x[0]<b); return `${a}-${b}: ${g.filter(x=>x[1]>1.7).length}/${g.length}`; }).join('  '));
// becos reais nas subidas: apoio firme sem nenhum próximo ao alcance — acima ou de lado (travessias), num soquete ou numa
// borda para subir
{ const firm=holds.filter(h=>!h.crumble&&!h.socket); let dead=[], tot=0;
  firm.forEach(a=>{ if(a.p.y<41||a.extra||!shaft(a)) return; tot++; const ep=Gr.eyeOf(a,true);
    const next=holds.some(b=>b!==a&&!b.crumble&&b.p.distanceTo(a.p)>.05&&(b.socket||b.p.y>a.p.y-.3)&&b.p.y<a.p.y+3&&ep.distanceTo(b.p)<=(b.socket?1.8:2.02));
    const ledge=plats.some(pd=>Gr.dist3(ep,pd)<=2.0&&ep.y>=solidBottom(pd)-1.36);
    if(!next&&!ledge) dead.push(a); });
  // um beco só conta se não for o topo da rota antiga do exaustor (que termina de propósito na zona de sucção)
  const old=EXHAUST.oldRoute, real=dead.filter(a=>!(a.p.y>old.y1-.5&&a.p.y<old.y1+.5));
  out('subidas: tijolos firmes sem próximo ao alcance (fora o topo da rota antiga)',`${real.length} de ${tot}`);
  real.slice(0,6).forEach(a=>log(`   y=${a.p.y.toFixed(1)} θ=${(Math.atan2(a.p.z,a.p.x)*180/Math.PI).toFixed(0)}°`)); if(real.length>6) fails++; }
// estamina: na rota encontrada (modo puxando), o maior número de lances seguidos pendurado entre dois lugares de ficar em pé
{ const path=best.path(Gr.exit); let run=0, worst=0, worstAt=0, sockets=0;
  for(const v of path){ if(v<N){ run++; if(holds[v].socket) sockets++; if(run>worst){ worst=run; worstAt=holds[v].p.y; } } else run=0; }
  // modelo do Player: 2 mãos penduradas gastam ~3/s + esforço; cada lance (~1,1 s) solta uma mão, que recupera 12/s por ~0,4 s
  const perMove=1.1*(3+1.6)-.4*12, left=100-worst*perMove;
  out('rota mais curta: lances seguidos sem descanso (pior trecho) · estamina estimada no fim',`${worst} lances (perto de ${worstAt.toFixed(0)} m) · ~${Math.max(0,left).toFixed(0)}%`);
  out('  soquetes de prego na rota (1 prego + martelo cada)',sockets);
  if(left<15) fails++; }
log('falhas:',fails); process.exit(fails?1:0);
