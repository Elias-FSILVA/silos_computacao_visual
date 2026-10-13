// Percorre a ROTA INTEIRA (chão → porta da superfície) com a física REAL do Player: o robô de _robo.js segue o caminho
// mais curto do grafo de alcance (_grafo.js) agarrando, puxando, subindo nas bordas, cravando prego e descansando.
// As alas obrigatórias são atravessadas por teletransporte (o caminho dentro delas é conferido em test_mundo,
// test_halls e test_ventiladores). Responde: a estamina permite concluir as rotas obrigatórias? Quantas pílulas, e elas
// estão no caminho antes de serem necessárias?
const log=console.log; console.log=()=>{};
const T=require('./_player.js'); console.log=log;
const {world}=T, Gr=require('./_grafo.js')(world), {N}=Gr, percorrer=require('./_robo.js');
let fails=0; const out=(k,v)=>log(k.padEnd(76),v); const chk=(k,ok,x='')=>{ out(k,(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };

const route=Gr.search([Gr.start],{allowed:new Set(['hang','pull','pullmax','stand','mantle','walk','climbup']),noCrumble:true,tele:Gr.tele});
const path=route.path(Gr.exit);
const sector=y=>y<100?'Subida 1':y<150?'Subida 2':y<200?'Subida 2b':y<246?'Subida 3a':y<300?'Subida 3b':'Subida 4';
const P=T.makePlayer(); P.position.copy(world.spawnPoint); P._prev.copy(P.position);
const st=percorrer({world,P,grab:T.grab,step:T.step,Gr,path,sector,dbg:process.env.DBG?log:null});
// pílulas disponíveis: caixas no caminho (descansos, salas) — acumuladas por altura
const crates=[...new Set(world.interactables.map(m=>m.userData.interactable).filter(o=>o&&o.constructor.name==='Crate'))];
const pillsBelow=y=>crates.reduce((s,c)=>{ const p=c.body.parent.position; return s+(p.y<=y+.5?(c.loot.pills||0):0); },0);
out('rota (grafo, modo puxando): nós no caminho',`${path.length} · ${path.filter(v=>v<N).length} agarras/degraus/soquetes`);
chk('o jogador real percorre a rota inteira até a porta da superfície',st.ok&&!P.dead&&Math.abs(P.position.y-TOP)<.05,st.stuck||`pés ${P.position.y.toFixed(2)} m`);
chk('  sem quedas no caminho',st.falls===0,st.falls+' quedas');
out('  estamina mínima pendurado, por subida',Object.entries(st.minBy).map(([s,v])=>`${s}: ${v.toFixed(0)}`).join(' · '));
const short=st.pillAt.filter((y,i)=>i+1>pillsBelow(y));
chk('  pílulas usadas sempre disponíveis antes (nas caixas do caminho)',short.length===0,`usadas ${st.pills} (em ${st.pillAt.join(', ')||'—'} m) · disponíveis até o topo ${pillsBelow(TOP)}`);
out('  pregos cravados nos soquetes / pausas para descansar',`${st.nails} / ${st.rests}`);
out('  tempo de jogo simulado',`${(st.frames/60/60).toFixed(1)} min`);
log('\nfalhas:',fails); process.exit(fails?1:0);
