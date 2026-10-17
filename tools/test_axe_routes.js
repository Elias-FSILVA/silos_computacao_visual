'use strict';
// PICARETA NO MAPA: faixas de rocha (R1–R4) e caixas das picaretas validadas pelo grafo de alcance.
// Invariantes (não podem quebrar com a picareta): vãos de prego, corda sobre chapa, puzzles, distância dos soquetes,
// acesso às caixas/estações/descansos sem picareta. Recompensa: cada faixa encurta um trecho (menos arestas) no modo
// em que ela está disponível (R1/R2 com 1 picareta; R3/R4 com 2).
const log=console.log; console.log=()=>{};
const T=require('./_player.js'); console.log=log;
const {world}=T, grafo=require('./_grafo.js');
let fails=0; const chk=(k,ok,x='')=>{ log(k.padEnd(84),(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };
const ALL=new Set(['hang','pull','pullmax','stand','mantle','walk','climbup']), AXE=new Set([...ALL,'axe']);
const G0=grafo(world), G1=grafo(world,null,{axes:1}), G2=grafo(world,null,{axes:2});
const plat=f=>world.platforms.find(f), cp=id=>world.checkpoints.find(c=>c.id===id).bounds;
const bands=world.raycastTargets.filter(m=>m.userData.type==='rockband');

// 1 · vãos de prego: sem soquete, nem com duas picaretas
for(const [label,from,to] of [['vão da Subida 3b (cp11 → 276,5 m)',cp('cp11'),plat(p=>p.kind==='islet'&&Math.abs(p.top-276.5)<.01)],
                              ['vão da Subida 4 (cp15 → 363,8 m)',cp('cp15'),plat(p=>p.kind==='islet'&&Math.abs(p.top-363.8)<.01)]]){
  const s=G2.search([G2.idxP(from)],{allowed:AXE,noSockets:true});
  chk(`${label}: sem prego não cruza nem com 2 picaretas`,s.dd[G2.idxP(to)]>=1e9);
}
// 2 · corda sobre chapa: sem a corda, os trechos continuam fechados com 2 picaretas
const noRope=G=>v=>v<G.N&&G.holds[v].cont==='rope';
for(const [label,from,to] of [['2b (ilha 181,8 → Mezanino)',plat(p=>p.kind==='islet'&&Math.abs(p.top-181.8)<.01),cp('cp8')],
                              ['4 (ilha 346,2 → Ponte de inspeção)',plat(p=>p.kind==='islet'&&Math.abs(p.top-346.2)<.01),cp('cp15')]]){
  const base=G0.search([G0.idxP(from)],{allowed:ALL,skip:noRope(G0)}), s=G2.search([G2.idxP(from)],{allowed:AXE,skip:noRope(G2)});
  chk(`corda ${label}: sem a corda não há caminho (sem picareta · com 2)`,base.dd[G0.idxP(to)]>=1e9&&s.dd[G2.idxP(to)]>=1e9);
}
// 3 · puzzles e halls: nenhuma faixa fora do poço
chk('nenhuma amostra de faixa fora do poço (halls, labirinto, puzzles)',bands.every(b=>b.userData.samples.every(s=>Math.hypot(s.p.x,s.p.z)<=SHAFT_R+.01)));
// 4 · distância dos soquetes de prego
const dSock=Math.min(Infinity,...bands.flatMap(b=>b.userData.samples.flatMap(s=>world.sockets.map(k=>k.p.distanceTo(s.p)))));
chk('toda amostra de faixa a ≥ 2,5 m de um soquete de prego',dSock>=2.5,isFinite(dSock)?dSock.toFixed(2)+' m':'sem faixas');
// 5 · acesso sem picareta e sem perks
const reach0=G0.search([G0.start],{allowed:ALL,tele:G0.tele});
for(const id of ['cp4','cp6','cp8','cp11','cp14']) chk(`${id} alcançável sem picareta`,reach0.dd[G0.idxP(cp(id))]<1e9);
const boxes=['cp6','cp11'].map(id=>{ const c=world.checkpoints.find(c=>c.id===id); return world.interactables.some(m=>{ const u=m.userData.interactable, y=m.parent?m.parent.position.y:m.position.y; return u&&u.loot&&u.loot.climbing_axe&&Math.abs(y-c.bounds.top)<1.5&&Math.hypot(m.parent.position.x-(c.bounds.minX+c.bounds.maxX)/2,m.parent.position.z-(c.bounds.minZ+c.bounds.maxZ)/2)<8; }); });
chk('caixas com picareta em cp6 (128 m) e cp11 (269,6 m)',boxes.every(Boolean),boxes.join(' · '));
// 6 · recompensa: cada faixa encurta algum par de nós vizinhos dela (menos arestas com a faixa do que sem)
const yOf=(G,v)=>{ const n=G.node(v); return n.p?n.p.y:n.top; };
const BANDS=[{id:'R1',axes:1},{id:'R2',axes:1},{id:'R3',axes:2},{id:'R4',axes:2,optional:true}];
for(const B of BANDS){
  const m=bands.find(b=>b.userData.bandId===B.id);
  if(!m){ chk(`${B.id}: no mapa`,!!B.optional,B.optional?'(opcional, fora do mapa)':''); continue; }
  const G=B.axes===1?G1:G2, mine=v=>v<G.N&&G.holds[v].m===m;
  // vizinhos da faixa: nós comuns que entram nela e que saem dela
  const ins=new Set(), outs=new Set();
  for(let u=0;u<G.adj.length;u++) for(const [v,c] of G.adj[u]){ if(mine(v)&&!mine(u)) ins.add(u); if(mine(u)&&!mine(v)) outs.add(v); }
  let best=null;
  for(const a of ins){ const w=G.search([a],{allowed:AXE}), wo=G.search([a],{allowed:AXE,skip:mine});
    for(const b of outs){ if(b===a||w.dd[b]>=1e9||yOf(G,b)<=yOf(G,a)+.5) continue;   // só subindo
      const pa=w.path(b), pb=wo.dd[b]<1e9?wo.path(b):null, gain=pb?pb.length-pa.length:Infinity;
      if(gain>0&&(!best||gain>best.gain)) best={gain,from:yOf(G,a),to:yOf(G,b)}; } }
  chk(`${B.id} (${B.axes} picareta${B.axes>1?'s':''}): encurta um trecho`,!!best,best?`${best.gain===Infinity?'caminho novo':'−'+best.gain+' arestas'} (${best.from.toFixed(1)} → ${best.to.toFixed(1)} m)`:'nenhum par vizinho fica mais curto');
}
log('\nfalhas:',fails); process.exit(fails?1:0);
