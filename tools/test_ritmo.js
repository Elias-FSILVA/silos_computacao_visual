// RITMO E VARIEDADE DA ESCALADA (Climbs.js): o trecho inicial continua idêntico; depois da passarela nenhum trecho contínuo
// é longo demais; cada subida usa apoios diferentes; os vãos de prego são obrigatórios (nem o grafo nem um pulo real os
// cruzam sem prego); nada decorativo é agarrável por acidente; e um jogador LENTO (ritmo humano) completa a rota com folga.
const log=console.log; console.log=()=>{};
const T=require('./_player.js'); console.log=log;
const {world,V3}=T, Gr=require('./_grafo.js')(world), {N}=Gr, percorrer=require('./_robo.js');
let fails=0; const out=(k,v)=>log(k.padEnd(78),v); const chk=(k,ok,x='')=>{ out(k,(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };
const ALL=new Set(['hang','pull','pullmax','stand','mantle','walk','climbup']);
const sector=y=>y<40.5?'Início':y<100?'Subida 1':y<150?'Subida 2':y<200?'Subida 2b':y<246?'Subida 3a':y<300?'Subida 3b':'Subida 4';
const plat=f=>world.platforms.find(f), cp=id=>world.checkpoints.find(c=>c.id===id).bounds;

// 1 · o trecho inicial (0–40 m) é o mesmo da versão anterior: agarras (posição, giro, desmorona) e bordas
{ const r=v=>Math.round(v*1000);
  const g=world.grabbables.filter(m=>m.position.y<40.5&&m.userData.type!=='ledge'&&!m.userData.samples).map(m=>[m.userData.type,r(m.position.x),r(m.position.y),r(m.position.z),r(m.rotation.x||0),m.userData.crumble?1:0].join(',')).sort();
  const p=world.platforms.filter(p=>p.top<=40.01&&p.top>-1).map(p=>[p.kind,r(p.minX),r(p.maxX),r(p.minZ),r(p.maxZ),r(p.top)].join(',')).sort();
  let h=0; for(const s of [...g,...p].join('|')) h=(h*31+s.charCodeAt(0))>>>0;
  chk('trecho inicial (0–40 m) idêntico ao da versão anterior',g.length===82&&p.length===35&&h===3765173198,`${g.length} agarras · ${p.length} bordas · impressão ${h}`); }

// 2 · trechos contínuos na rota (agarras seguidas sem um lugar para ficar em pé)
const route=Gr.search([Gr.start],{allowed:ALL,noCrumble:true,tele:Gr.tele}), path=route.path(Gr.exit);
chk('a rota do chão à porta da superfície existe no grafo de alcance',path.length>1&&path[0]===Gr.start,path.length+' nós');
{ let run=[]; const runs=[];
  for(const v of path){ if(v<N) run.push(Gr.holds[v]); else { if(run.length) runs.push({n:run.length,y0:run[0].p.y,y1:run[run.length-1].p.y}); run=[]; } }
  const before=runs.filter(r=>r.y1<40.5), after=runs.filter(r=>r.y0>40.5), mx=a=>a.reduce((m,r)=>Math.max(m,r.y1-r.y0),0), mn=a=>a.reduce((m,r)=>Math.max(m,r.n),0);
  out('  trechos contínuos antes da passarela (referência)',`${before.length} · até ${mx(before).toFixed(1)} m · até ${mn(before)} agarras`);
  chk('  depois da passarela nenhum trecho contínuo passa de 8 m nem de 12 agarras',mx(after)<=8&&mn(after)<=12,`${after.length} trechos · maior ${mx(after).toFixed(1)} m · ${mn(after)} agarras · média ${(after.reduce((s,r)=>s+r.y1-r.y0,0)/after.length).toFixed(1)} m`); }

// 3 · apoios para ficar em pé depois da passarela: cada lugar seguro é alcançável e há um a cada poucos metros
{ const stands=world.platforms.filter(p=>['islet','scaffold','catwalk','pipewalk','rest','beam','bridge','sill','exit','platform','grate','tunnel'].includes(p.kind)&&p.top>40.5).map(p=>p.top).sort((a,b)=>a-b);
  let gap=0; for(let i=1;i<stands.length;i++){ const g=stands[i]-stands[i-1]; if(!LOCK_BANDS.some(b=>stands[i-1]<b.y1&&stands[i]>b.y0)) gap=Math.max(gap,g); }
  const unreach=world.platforms.filter(p=>['islet','scaffold','catwalk','pipewalk'].includes(p.kind)&&route.dd[Gr.idxP(p)]>=1e9);
  chk('  saliências, andaimes, passarelas e tubos alcançáveis a partir do chão',unreach.length===0,unreach.map(p=>p.kind+'@'+p.top.toFixed(1)).join(' ')||`${world.platforms.filter(p=>['islet','scaffold','catwalk','pipewalk'].includes(p.kind)).length} peças`);
  chk('  maior distância vertical entre dois lugares para ficar em pé (fora das alas) ≤ 10 m',gap<=10,gap.toFixed(1)+' m'); }

// 4 · apoios contínuos: rachadura, corda, cano — agarráveis, com amostras na rota
{ const by=t=>world.grabbables.filter(m=>m.userData.type===t);
  out('  rachaduras · cordas · canos laterais · degraus de escada',`${by('crack').length} · ${by('rope').length} · ${by('pipe').filter(m=>m.userData.samples).length} · ${world.grabbables.filter(m=>m.userData.rung).length}`);
  const ok=['crack','rope','pipe'].every(t=>by(t).filter(m=>m.userData.samples).every(m=>m.userData.grab&&typeof m.userData.normalAt==='function'&&m.userData.samples.length>=4&&world.raycastTargets.includes(m)));
  chk('  rachaduras, cordas e canos: agarráveis, no raycast, normal por ponto',ok);
  const n=new V3(); const c=by('crack')[0], s=c.userData.samples[2]; c.userData.normalAt(s.p,n);
  const r=by('rope')[0], n2=new V3(); r.userData.normalAt(new V3(r.position.x+.1,r.position.y,r.position.z),n2);   // agarrada pelo lado +x do eixo
  chk('  normal da rachadura sai da parede · da corda, para o lado de quem agarra',n.distanceTo(s.n)<1e-6&&n2.x>.99,`(${n2.x.toFixed(2)}, ${n2.z.toFixed(2)})`);
  chk('  rachadura gasta mais pegada (dedos entalados) — corda e cano, o normal',c.userData.gripCost>0&&!r.userData.gripCost,`+${c.userData.gripCost}/s`); }

// 5 · vãos de prego obrigatórios (E): sem soquete, o grafo não cruza; um pulo real (correndo da borda ou da parede) também não
const E=[{label:'vão da Subida 3b (275 m)',from:cp('cp11'),to:plat(p=>p.kind==='islet'&&Math.abs(p.top-276.5)<.01),a1:5.30,yb:[273,281]},
         {label:'vão da Subida 4 (360 m)', from:cp('cp15'),to:plat(p=>p.kind==='islet'&&Math.abs(p.top-363.8)<.01),a1:4.17,yb:[358,364]}];
for(const e of E){
  const s=Gr.search([Gr.idxP(e.from)],{allowed:ALL}), sn=Gr.search([Gr.idxP(e.from)],{allowed:ALL,noSockets:true});
  chk(`${e.label}: com o soquete atravessa · sem ele não`,s.dd[Gr.idxP(e.to)]<1e9&&sn.dd[Gr.idxP(e.to)]>=1e9);
  const plate=world.walls.find(m=>m.userData.interactable===null&&m.material===MAT.liner&&m.position.y>e.yb[0]-6&&m.position.y<e.yb[1]+4);
  chk(`  a chapa do vão não aceita prego (só o soquete)`,!!plate);
  // alvos do outro lado (agarras depois da chapa)
  const far=Gr.holds.filter(h=>!h.socket&&h.p.y>e.yb[0]&&h.p.y<e.yb[1]&&wrap2(Math.atan2(h.p.z,h.p.x)-e.a1)<.6);
  const farP=world.platforms.filter(p=>p.climbable&&p.top>e.yb[0]&&p.top<e.yb[1]+1.5&&(()=>{ const c=Gr.centroid(p); return wrap2(Math.atan2(c.z,c.x)-e.a1)<.6; })());
  let best=Infinity;
  const watch=P=>{ const ey=P.eyePos(new V3()); for(const h of far) best=Math.min(best,ey.distanceTo(h.p)); for(const p of farP) best=Math.min(best,Gr.dist3(ey,p)); };
  // a) correndo pela borda de onde sai e pulando, com controle no ar
  for(const lat of [-1,1]) for(const t0 of [10,20,30,40]){ const P=T.makePlayer(); const pd=e.from, A=pd.arc;
    const aEnd=wrap2(e.a1-A.a0)<A.span+.5?A.a0+A.span:A.a0, ae=aEnd-.05*Math.sign(aEnd-A.a0-A.span/2), q=polar(SHAFT_R-.6,ae);
    P.position.set(q.x,pd.top,q.z); P._prev.copy(P.position); P.grounded=true;
    const dir=new V3(-Math.sin(ae),0,Math.cos(ae)).multiplyScalar(Math.sign(aEnd-A.a0-A.span/2)); P.yaw=Math.atan2(-dir.x,-dir.z)+lat*.25;
    for(let i=0;i<150&&!P.dead;i++){ if(i===t0&&P.grounded) P.jump(); T.step(P,1,{x:0,y:1}); watch(P); } }
  // b) pendurado na última agarra antes do vão, pulo de parede (para cima e de lado)
  { const near=Gr.holds.filter(h=>!h.socket&&h.p.y>e.yb[0]-1&&h.p.y<e.yb[1]&&wrap2(e.a1-Math.atan2(h.p.z,h.p.x))<.9&&wrap2(e.a1-Math.atan2(h.p.z,h.p.x))>.3).sort((a,b)=>b.p.y-a.p.y)[0];
    for(const ix of [-1,1]){ const P=T.makePlayer(); P.position.set(near.p.x+near.n.x*.5,near.p.y-.85-EYE,near.p.z+near.n.z*.5); P._prev.copy(P.position);
      T.grab(P,0,near.m,near.p,near.n); T.grab(P,1,near.m,near.p,near.n); T.step(P,30); P.jump(); for(let i=0;i<120&&!P.dead;i++){ T.step(P,1,{x:ix,y:0}); watch(P); } } }
  chk(`  nenhum pulo real alcança o outro lado sem prego (correndo da borda / pulo de parede)`,best>2.05,`mais perto: ${best.toFixed(2)} m do olho (alcance 2,0)`);
}

// 6 · superfícies acidentais: só é agarrável o que foi feito para isso; chapas e peças de enfeite ficam fora
{ const OK=new Set(['hold','crack','rope','pipe','ledge','beam','nail']);
  const bad=world.raycastTargets.filter(m=>m.userData.grab&&!OK.has(m.userData.type));
  chk('  tudo o que é agarrável é um apoio de escalada',bad.length===0,bad.map(m=>m.userData.type).join(' '));
  const rails=world.root.children.filter(m=>m.material===MAT.rust&&!world.raycastTargets.includes(m)).length;
  out('  peças de enfeite fora do raycast (guarda-corpos, mãos-francesas, braçadeiras…)',rails);
  // nenhuma agarra solta sorteada em cima dos apoios especiais
  const extras=world.grabbables.filter(m=>m.userData.extra&&world._inSmooth(Math.atan2(m.position.z,m.position.x),m.position.y,.6));
  chk('  nenhuma agarra solta em cima de chapas, rachaduras, canos, corda ou escadas',extras.length===0,extras.length+''); }

// 7 · recursos: pregos e pílulas no caminho antes de serem necessários
{ const crates=[...new Set(world.interactables.map(m=>m.userData.interactable).filter(o=>o&&o.constructor.name==='Crate'))];
  const sockets=path.filter(v=>v<N&&Gr.holds[v].socket).map(v=>Gr.holds[v].p.y).sort((a,b)=>a-b);
  const nailsBelow=y=>crates.reduce((s,c)=>s+(c.body.parent.position.y<=y+.5?(c.loot.nails||0):0),0);
  const short=sockets.filter((y,i)=>nailsBelow(y)<i+1+2);
  chk('  pregos: em cada soquete da rota já há pelo menos 2 de folga nas caixas abaixo',short.length===0,`soquetes em ${sockets.map(y=>y.toFixed(0)).join(', ')} m · pregos até o topo ${nailsBelow(TOP)}`); }

// 8 · o jogador real percorre a rota em dois ritmos: cuidadoso e LENTO (procura agarras, puxa devagar, martela devagar)
for(const [nome,pace] of [['cuidadoso',1],['lento (ritmo humano)',2.2]]){
  const P=T.makePlayer(); P.position.copy(world.spawnPoint); P._prev.copy(P.position);
  world.sockets.forEach(s=>{ s.sk.used=false; });
  const st=percorrer({world,P,grab:T.grab,step:T.step,Gr,path,sector,pace});
  chk(`ritmo ${nome}: chão → porta da superfície, sem quedas`,st.ok&&!P.dead&&Math.abs(P.position.y-TOP)<.05&&st.falls===0,st.stuck||`${(st.frames/3600).toFixed(1)} min · ${st.pills} pílulas · ${st.nails} pregos · ${P.health.value} HP`);
  const by=Object.entries(st.minBy).filter(([s])=>s!=='Início');
  chk(`  estamina mínima pendurado ≥ 35% em todas as subidas depois da passarela`,by.every(([,v])=>v>=35),by.map(([s,v])=>`${s.replace('Subida ','')}: ${v.toFixed(0)}`).join(' · '));
  if(pace===1){
    const kinds=u=>Object.keys(u||{}).map(k=>k.startsWith('borda:')?k.slice(6):k);
    for(const s of ['Subida 1','Subida 2','Subida 2b','Subida 3a','Subida 3b','Subida 4']){ const ks=new Set(kinds(st.usedBy[s])); ks.delete('rest'); ks.delete('sill');
      chk(`  ${s}: pelo menos 4 tipos de movimento`,ks.size>=4,[...ks].join(', ')); }
    const all=new Set(Object.values(st.usedBy).flatMap(kinds));
    const need=['tijolo','crack','rope','pipe','degrau','prego','islet','scaffold','catwalk','pipewalk','beam','andar'];
    chk('  a rota inteira usa todos os apoios novos',need.every(k=>all.has(k)),need.filter(k=>!all.has(k)).join(' ')||need.join(' '));
  }
}
log('\nfalhas:',fails); process.exit(fails?1:0);
