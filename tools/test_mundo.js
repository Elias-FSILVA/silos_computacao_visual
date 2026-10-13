// Geometria do mapa cilíndrico: progressão vertical + horizontal. Trancas (cada ala obrigatória fecha o poço e não há
// rota por fora), conectividade das subidas, travessia a pé dentro das alas, labirinto e as ligações entre alturas
// (escada, elevador e insuflador) com o Player real.
const log=console.log; console.log=()=>{};
const T=require('./_player.js'); console.log=log;
const {world,V3}=T, R=SHAFT_R, Gr=require('./_grafo.js')(world);
const out=(k,v)=>log(k.padEnd(74),v);
let fails=0; const chk=(k,ok,extra='')=>{ out(k,(ok?'OK ':'FALHOU ')+extra); if(!ok) fails++; };
const rOf=p=>Math.hypot(p.x,p.z);

out('TOP',TOP); out('sólidos (caixas / giradas / setores anelares)',`${world.platforms.filter(p=>!p.arc&&!p.obb).length} / ${world.platforms.filter(p=>p.obb).length} / ${world.platforms.filter(p=>p.arc).length}`);
out('agarráveis / paredes / interativos / checkpoints',`${world.grabbables.length} / ${world.walls.length} / ${world.interactables.length} / ${world.checkpoints.length}`);
out('alas com lógica',world.puzzleDefs.map(d=>d.id).join(', '));
const ids=world.checkpoints.map(c=>c.id); chk('checkpoints com id único',new Set(ids).size===ids.length);

// ---------- 1) trancas: o poço é fechado por geometria acima de cada ala obrigatória ----------
log('— Trancas —');
{ let bad=0; for(const b of LOCK_BANDS) for(const m of world.grabbables){ const p=m.position, t=m.userData.type; if(t==='ledge'||t==='beam') continue; if(p.y>b.y0-.5&&p.y<b.y1+.5&&rOf(p)<R+.05) bad++; }
  chk('sem agarras/pregos no poço dentro das faixas seladas',bad===0); }
{ // dentro de cada faixa selada não há NADA agarrável no poço (vigas, canos, bordas), nem parede que aceite prego
  let grab=0, nail=0;
  for(const b of LOCK_BANDS){ for(const p of world.platforms){ if(!p.climbable||p.top<b.y0+.05||solidBottom(p)>b.y1-.05) continue; const c=Gr.footDist(p,{minX:-.01,maxX:.01,minZ:-.01,maxZ:.01}); if(c<R-.05) grab++; }
    for(const s of world.walls){ const sd=s.userData.solid; if(!sd||!sd.arc||sd.arc.r0!==R) continue; if(sd.top>b.y0+.01&&sd.bottom<b.y1-.01&&s.userData.interactable) nail++; } }
  chk('  nem vigas, canos ou bordas agarráveis atravessando as faixas, nem parede que aceite prego',grab===0&&nail===0,`agarráveis ${grab} · pregáveis ${nail}`); }
// sem as alas, a escalada não passa de nenhuma; com elas, chega à porta da superfície
const all=Gr.search([Gr.start],{tele:Gr.tele}), none=Gr.search([Gr.start],{});
chk('com as alas: o grafo de alcance chega à porta de saída (400 m)',all.dd[Gr.exit]<1e8,'· saltos que exigem prego: '+all.dd[Gr.exit]);
chk('SEM as alas não se chega ao topo',none.dd[Gr.exit]>=1e8);
for(const w of Gr.wings){ const only=Gr.search([Gr.start],{tele:Gr.tele.filter(t=>t[1]!==Gr.idxP(w.to))});
  chk(`  sem passar pela ${w.label} não se alcança a saída dela`,only.dd[Gr.idxP(w.to)]>=1e8); }
{ let topNo=0; none.dd.forEach((d,i)=>{ if(d<1e8){ const n=Gr.node(i); const y=n.k==='h'?n.p.y:n.top; topNo=Math.max(topNo,y); } });
  chk('  sem nenhuma ala, a maior altura alcançável fica abaixo do primeiro diafragma',topNo<DIAPHRAGMS[0],topNo.toFixed(1)+' m'); }
{ let unreach=[]; world.checkpoints.forEach(c=>{ if(c.bounds){ const i=Gr.idxP(c.bounds); if(i>=Gr.N&&all.dd[i]>=1e8) unreach.push(c.id); } });
  chk('checkpoints alcançáveis (os de borda, pelo grafo; o do Pátio, a pé — abaixo)',unreach.length===0,unreach.join(',')); }
// caixas de itens no poço: cada uma está em cima de uma borda que o grafo alcança (as das alas são conferidas a pé, abaixo)
{ const crates=[...new Set(world.interactables.map(m=>m.userData.interactable).filter(o=>o&&o.constructor.name==='Crate'))];
  let n=0; const bad=[]; for(const c of crates){ const p=c.body.parent.position; if(rOf(p)>R) continue; n++;
    const pd=Gr.plats.find(q=>Math.abs(q.top-p.y)<.02&&solidInXZ(q,p.x,p.z,.05)); if(!pd||all.dd[Gr.idxP(pd)]>=1e8) bad.push(p.y.toFixed(1)+' m'); }
  chk('caixas de itens do poço (pregos, pílulas, martelo) em bordas alcançáveis',bad.length===0,`${n-bad.length}/${n}`+(bad.length?' faltam: '+bad.join(', '):'')); }

// ---------- 2) alas: navegação a pé (flood fill no piso com o raio do corpo) ----------
log('— Alas (a pé) —');
// flood fill no plano a partir de 'starts', com bloqueio pelos sólidos do nível (formas reais: caixa, girada, curva)
function flood(y,box,starts,skip=()=>false){
  const step=.2, x0=box.minX, z0=box.minZ, nx=Math.ceil((box.maxX-box.minX)/step), nz=Math.ceil((box.maxZ-box.minZ)/step);
  const blk=world.platforms.filter(p=>p.top>y+.5&&solidBottom(p)<y+1.6&&p.maxX>x0&&p.minX<box.maxX&&p.maxZ>z0&&p.minZ<box.maxZ&&!skip(p));
  const floor=world.platforms.filter(p=>Math.abs(p.top-y)<.51&&p.top<=y+.5&&p.maxX>x0&&p.minX<box.maxX&&p.maxZ>z0&&p.minZ<box.maxZ);
  const free=(x,z)=>!blk.some(b=>solidInXZ(b,x,z,RAD-.02))&&floor.some(f=>solidInXZ(f,x,z,RAD-.05));
  const seen=new Uint8Array((nx+1)*(nz+1)), q=[], gi=(x,z)=>[Math.round((x-x0)/step),Math.round((z-z0)/step)];
  starts.forEach(([x,z])=>{ const [a,b]=gi(x,z); seen[b*(nx+1)+a]=1; q.push([a,b]); });
  while(q.length){ const [a,b]=q.pop(); for(const [da,db] of [[1,0],[-1,0],[0,1],[0,-1]]){ const na=a+da,nb=b+db; if(na<0||nb<0||na>nx||nb>nz||seen[nb*(nx+1)+na]) continue; const x=x0+na*step, z=z0+nb*step; if(!free(x,z)) continue; seen[nb*(nx+1)+na]=1; q.push([na,nb]); } }
  const reach=(x,z)=>{ for(let r=0;r<=1.7;r+=.35) for(let k=0;k<8;k++){ const [a,b]=gi(x+Math.cos(k*.785)*r,z+Math.sin(k*.785)*r); if(a>=0&&b>=0&&a<=nx&&b<=nz&&seen[b*(nx+1)+a]) return true; } return false; };
  return {reach,at:(x,z)=>{ const [a,b]=gi(x,z); return a>=0&&b>=0&&a<=nx&&b<=nz&&!!seen[b*(nx+1)+a]; }};
}
// (superfícies que só aceitam prego — paredes de concreto, tijolo, pedra — não são objetos a alcançar)
const lowInteractables=(zone,y)=>[...world.interactables,...world.walls.filter(w=>w.userData.interactable&&w.userData.interactable!==SURFACE.concrete)].map(m=>{ let top=m; while(top.parent&&top.parent!==world.root) top=top.parent; return {m,p:top.position}; })
  .filter(({p})=>p.y>=y-.1&&p.y<=y+2.9&&inZone({x:p.x,y:Math.max(p.y,zone.minY),z:p.z},zone));
const checkLow=(label,f,zone,y)=>{ const L=lowInteractables(zone,y), miss=L.filter(({p})=>!f.reach(p.x,p.z)).map(({m,p})=>`${m.userData.type}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
  chk(label,L.length>0&&miss.length<=Math.ceil(L.length*.04),`${L.length-miss.length}/${L.length}`+(miss.length?' faltam: '+miss.slice(0,5).join(' | '):'')); };
const zbox=(z,pad=1)=>({minX:z.minX-pad,maxX:z.maxX+pad,minZ:z.minZ-pad,maxZ:z.maxZ+pad});
// I · Casa das Bombas
{ const g=world.halls.find(h=>h.cfg&&h.cfg.id==='h1'), fr=g.fr, H=g.H, e=fr.p(g.uN+1.2,H,g.vin), z=world.puzzleRooms.h1.zoneRoom;
  const f=flood(H,zbox(z,3),[[e.x,e.z]],p=>['rail','door','smash'].includes(p.kind));
  checkLow('Casa das Bombas: interativos baixos alcançáveis a pé',f,z,H);
  const s=fr.p(R+.4,H,g.vin); chk('  a soleira no poço leva a pé até o salão (braço radial)',flood(H,zbox(z,12),[[s.x,s.z]],p=>['door','smash'].includes(p.kind)).at(e.x,e.z)); }
// II · Pátio: anel → Casa de Força, Estufa (barreira de raízes excluída) e cabine do elevador
{ const H=HUB.H, z=world.puzzleRooms.p200.zoneRoom, s=polar(R+.9,HUB.entryA,H), box={minX:-42,maxX:42,minZ:-16,maxZ:20};
  const f=flood(H,box,[[s.x,s.z]],p=>['door','smash','elevator'].includes(p.kind));
  const frP=world._fr(HUB.power.theta), frE=world._fr(HUB.elevator.theta), gG=world.halls.find(h=>h.cfg&&h.cfg.id==='h2'), frG=gG.fr;
  chk('Pátio: da soleira norte se anda pelo anel até as três portas',[frP.p(15.5,H,0),frE.p(16.2,H,0),frG.p(gG.uN+1.6,H,gG.vin)].every(p=>f.at(p.x,p.z)));
  checkLow('  anel + Casa de Força + Estufa: interativos baixos alcançáveis a pé',f,{minX:-42,maxX:42,minZ:-16,maxZ:20,minY:H-.2,maxY:H+3},H);
  const f2=flood(H,box,[[s.x,s.z]],p=>['door','elevator'].includes(p.kind)); chk('  com a barreira de raízes inteira, a Estufa fica fechada',!f2.at(frG.p(gG.uN+2.5,H,gG.vin).x,frG.p(gG.uN+2.5,H,gG.vin).z));
  const c=polar(R+SHELL_T+1.8,HUB.entryA,H); chk('  checkpoint do Pátio fica no anel, ao alcance da entrada',f.at(c.x,c.z)); }
// galeria do exaustor: com a porta fechada, a boca não alcança a escada; aberta, alcança
{ const E=EXHAUST, H=E.H, s=polar(R-.5,E.entryA,H), base=world._fr(E.shaftTheta).p(E.r1+.3+1.2,H,0), box={minX:-14,maxX:14,minZ:-14,maxZ:14}, D=world.puzzleRooms[E.id].refs.door;
  chk('galeria: com a porta pressurizada fechada, a boca não chega ao pé da escada',!flood(H,box,[[s.x,s.z]]).at(base.x,base.z));
  D.set(true,true); const f=flood(H,box,[[s.x,s.z]]); D.set(false,true);
  chk('  com a porta aberta, chega',f.at(base.x,base.z));
  const rp=world.puzzleRooms[E.id].refs.register.rot.parent.position;   // grupo externo do volante (posição no mundo)
  chk('  o registro de ar fica ao alcance, do lado da boca (antes da porta)',flood(H,box,[[s.x,s.z]]).reach(rp.x,rp.z)); }
// III · labirinto (coordenadas relativas à sala: ela recuou para caber o braço reto até o poço redondo)
{ const M=MAZE, mz=world.maze, r=mz.route; let turns=0; for(let i=2;i<r.length;i++){ const a=[r[i-1][0]-r[i-2][0],r[i-1][1]-r[i-2][1]],b=[r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]]; if(a[0]!==b[0]||a[1]!==b[1]) turns++; }
  out('labirinto: rota / curvas / becos com placa',`${r.length} / ${turns} / ${world.puzzleRooms.mz300.info.deadTags.length}`);
  const H=M.H, I=world.puzzleRooms.mz300.info, s=polar(R-.4,-Math.PI/2,H), box={minX:-12,maxX:12,minZ:I.zF-1.2,maxZ:-R+.5};
  const f=flood(H,box,[[s.x,s.z]],p=>['door'].includes(p.kind));
  let cells=0; for(let c=0;c<M.cols;c++)for(let r2=0;r2<M.rows;r2++) if(f.at(-M.cols*M.cell/2+M.cell*(c+.5),I.zG-M.cell*(r2+.5))) cells++;
  chk('labirinto: da soleira, pelo braço, todas as células alcançáveis',cells===M.cols*M.rows,`${cells}/${M.cols*M.rows}`);
  const ex=(I.e0+I.e1)/2; chk('labirinto: chega à porta da saída',f.at(ex,I.zF+.7));
  chk('placas dos becos alcançáveis',I.deadTags.every(([c,r2])=>f.reach((I.xb(c)+I.xb(c+1))/2,(I.zb(r2)+I.zb(r2+1))/2)));
  const dz=I.zA+4.5; chk('sala de leitura: mesa, estante, cofre e teclado alcançáveis',[[-5.1,-5.6+dz],[-8.7,-7.4+dz],[9.4,-11.9+dz],[ex+2.4,I.zF+.6]].every(([x,z])=>f.reach(x,z))); }

// ---------- 3) ligações entre alturas, com o jogador real ----------
log('— Escada, elevador e insuflador (física real) —');
const place=(P,p)=>{ P.position.copy(p); P._prev.copy(p); P.velocity.set(0,0,0); P.releaseAll(); P.grounded=true; };
// anda na direção (dx,dz) até ficar inteiro sobre a plataforma pd (ou o tempo acabar); devolve se chegou
const walkOnto=(P,dx,dz,pd,frames=600)=>{ T.face(P,dx,dz); let ok=false;
  for(let i=0;i<frames&&!P.dead&&!ok;i++){ T.step(P,1,{x:0,y:1}); ok=P.grounded&&Math.abs(P.position.y-pd.top)<.05&&solidInXZ(pd,P.position.x,P.position.z,-.35); }
  T.step(P,20); return ok&&!P.dead&&solidInXZ(pd,P.position.x,P.position.z,0); };
// escada do poço de serviço: subir degrau a degrau (sempre o próximo ao alcance), puxando, até o patamar de 174 m
{ const E=EXHAUST, fr=world._fr(E.shaftTheta), rungs=world.grabbables.filter(m=>m.userData.rung&&Math.hypot(m.position.x,m.position.z)>SHAFT_R+.3).sort((a,b)=>a.position.y-b.position.y), P=T.makePlayer();
  place(P,fr.p(E.r1+.3+.9,E.H,0)); let i=0, hand=0, minSt=100;
  const land=world.platforms.find(p=>p.kind==='landing');
  for(let guard=0;guard<400&&!P.dead;guard++){
    if(P.canMantle()){ P.jump(); T.step(P,40); break; }
    const eye=P.eyePos(new V3()); let best=-1; for(let k=i;k<rungs.length;k++) if(rungs[k].position.distanceTo(eye)<=P.reach-.05) best=k;
    if(best<0) break;
    if(best===rungs.length-1&&P.hands.some(h=>h.inContact&&h.surface===rungs[best])){ T.grab(P,1-hand,land.__m||world.grabbables.find(m=>m.userData.plat===land),fr.p(E.r1+.3+1.3,E.top,0)); }
    else { const h=P.hands[hand]; if(h.inContact) P._release(h); T.grab(P,hand,rungs[best]); i=best; hand=1-hand; }
    for(let f=0;f<24;f++){ P.pullBy(14); T.step(P,1); }
    minSt=Math.min(minSt,P.stamina);
  }
  chk('escada (150 → 174 m): o jogador sobe degrau a degrau e chega ao patamar',!P.dead&&P.grounded&&Math.abs(P.position.y-E.top)<.05,`pés ${P.position.y.toFixed(2)} m · estamina mínima ${minSt.toFixed(0)}`);
  const d=polar(1,E.shaftTheta,0), exitPd=world.checkpoints.find(c=>c.id==='cp_exa').bounds;
  chk('  do patamar, o braço de 174 m leva à plataforma no poço acima do exaustor',walkOnto(P,-d.x,-d.z,exitPd),`r ${rOf(P.position).toFixed(2)} y ${P.position.y.toFixed(2)}`); }
// elevador de carga: o jogador real em pé na cabine sobe até 224 m e sai pelo braço até o poço
{ const el=world.elevator, P=T.makePlayer(), c=el.pd; place(P,new V3((c.minX+c.maxX)/2,HUB.H,(c.minZ+c.maxZ)/2)); T.step(P,10);
  el.start(); let minY=1e9; T.step(P,900,{x:0,y:0},1/60,()=>{ if(el.state==='moving') minY=Math.min(minY,P.position.y-el.pd.top); });
  chk(`elevador (200 → ${HUB.elevator.top} m): o jogador real sobe em pé na cabine, sem cair nem atravessar o piso`,el.state==='top'&&!P.dead&&P.grounded&&Math.abs(P.position.y-HUB.elevator.top)<.02&&minY>-.05,`pés ${P.position.y.toFixed(2)} m · folga mínima ${minY.toFixed(3)}`);
  const d=polar(1,HUB.elevator.theta,0), exitPd=world.checkpoints.find(c=>c.id===HUB.exitId).bounds;
  chk('  sai pela porta de cima e o braço leva à plataforma no poço acima do diafragma',walkOnto(P,-d.x,-d.z,exitPd),`r ${rOf(P.position).toFixed(2)} y ${P.position.y.toFixed(2)}`);
  // pular dentro da cabine em movimento não atravessa o piso (cabine "flat" + carona)
  el.state='bottom'; el._set(HUB.H); el.doors.top.set(false,true); el.doors.bottom.set(true,true);
  const Q=T.makePlayer(); place(Q,new V3((c.minX+c.maxX)/2,HUB.H,(c.minZ+c.maxZ)/2)); el.start(); let low=1e9;
  T.step(Q,900,{x:0,y:0},1/60,i=>{ if(i%35===0) Q.jump(); if(el.state==='moving') low=Math.min(low,Q.position.y-el.pd.top); });
  chk('  pulando sem parar durante a viagem: nunca atravessa o piso da cabine',!Q.dead&&low>-.06&&Math.abs(Q.position.y-HUB.elevator.top)<.6,`folga mínima ${low.toFixed(3)} · pés ${Q.position.y.toFixed(2)}`); }
// insuflador: da grade (246 m) até o mirante (252 m) pelo fluxo — conferido em detalhe em test_ventiladores
{ const fan=world.fans.find(f=>f.name==='insuflador'), P=T.makePlayer(); place(P,new V3(fan.pos.x,INSUF.grateTop,fan.pos.z)); T.step(P,420);
  const w=polar(1,INSUF.a,0); T.face(P,w.x,w.z); T.step(P,420,{x:0,y:1});
  const mir=world.checkpoints.find(c=>c.id==='cp_ins').bounds;
  chk('insuflador: da grade, o fluxo leva o jogador real até o mirante',!P.dead&&P.grounded&&Math.abs(P.position.y-mir.top)<.02&&solidInXZ(mir,P.position.x,P.position.z,RAD)); }

log('\nfalhas:',fails); process.exit(fails?1:0);
