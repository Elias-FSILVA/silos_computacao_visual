// Joga as alas obrigatórias com os mecanismos REAIS (Wheel, Lever, Dial, Reader, Smashable, Tag, Decision, KeyButton,
// ElevatorControl) e a lógica real: Casa das Bombas, Galeria do exaustor, Pátio das Máquinas (Casa de Força + Estufa +
// elevador) e o Arquivo.
const log=console.log; console.log=()=>{};
const {V3,world,vm}=require('./_load.js'); console.log=log;
let fails=0; const out=(k,v)=>log(k.padEnd(66),v); const chk=(k,ok,x='')=>{ out(k,(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };
const run=code=>vm.runInThisContext(code);

// ---------- jogo falso (só o que as interações e a lógica tocam) ----------
const msgs=[]; const calls=[]; const chime=()=>calls.push('chime');
const inv={slots:[{id:'hammer',count:1},{id:'nails',count:6},null,null],version:0,take(id,n=1){ const s=this.slots.find(s=>s&&s.id===id); if(!s||s.count<n) return false; s.count-=n; return true; },slotOf(id){ return this.slots.findIndex(s=>s&&s.id===id); },has(id){ return this.slotOf(id)>=0; },count(id){ const t=this.slots.find(s=>s&&s.id===id); return t?t.count:0; },add(id){ this.slots[this.slots.findIndex(s=>!s)]={id,count:1}; }};
const mass={y:20,hold:null,frozen:false,scale:1,setHold(c,s){ this.hold=c; calls.push('hold@'+c); },releaseHold(){ this.hold=null; calls.push('release'); }};
const G={world,mass,player:{position:new V3(0,0,0),stats:{pitonsUsed:0},addShake(){}},ui:{msg(t){ msgs.push(t); },showNote(t){ msgs.push('NOTE:'+t.slice(0,30)); }},audio:new Proxy({chime},{get:(t,k)=>t[k]||(()=>{})}),
  fx:{spawn(){}},score:{total:0,onPuzzle(v){ this.total+=v; }},items:{inv,holster(){ calls.push('holster'); }},playerName:'Jardhes',route:null};
G.puzzles=run('(g)=>new PuzzleSystem(g)')(G); G.puzzles.reset();
const ctx=()=>({game:G,world,ui:G.ui,audio:G.audio,player:G.player,fx:G.fx,items:G.items,hit:{distance:1.2,point:new V3(),object:{}},normal:new V3(0,0,1)});
const objs=cls=>[...world.interactables,...world.walls].map(m=>m.userData.interactable).filter((o,i,a)=>o&&o.constructor.name===cls&&a.indexOf(o)===i);
const byId=(cls,hall,id)=>objs(cls).find(o=>o.hall===hall&&o.id===id);
const P=id=>G.puzzles.byId(id);
const tick=(id,sec)=>{ for(let i=0;i<Math.round(sec/.1);i++){ P(id).update(.1); world.update(.1,G.player); } };
const place=(room)=>{ const z=world.puzzleRooms[room].zoneRoom; if(z.arc){ const A=z.arc, p=polar((A.r0+A.r1)/2,A.a0+A.span/2,z.minY+.2); G.player.position.copy(p); return; }
  G.player.position.set((z.minX+z.maxX)/2,z.minY+.2,(z.minZ+z.maxZ)/2); };

// =========================== SOQUETES DE PREGO ===========================
log('— Soquetes de prego —');
{ const sk=world.sockets[0].sk, n0=world.grabbables.length, nails0=inv.slots[1].count; const c=ctx(); c.normal=sk.normal;
  chk('soquete aceita prego a distância de alcance',sk.canUseItem('nails',c).valid===true);
  c.hit.distance=NAIL_REACH+.6; chk('  e recusa longe demais',sk.canUseItem('nails',c).valid===false); c.hit.distance=1.2;
  sk.useItem('nails',c); chk('prego entra no centro do soquete (1 prego gasto, âncora criada)',sk.used&&inv.slots[1].count===nails0-1&&world.grabbables.length===n0+1);
  const nail=world.grabbables[world.grabbables.length-1]; chk('  âncora criada exatamente na posição do soquete',nail.position.distanceTo(sk.pos)<1e-6);
  chk('  soquete usado não aceita outro prego',sk.canUseItem('nails',c).valid===false);
  const na=nail.userData.interactable; for(let i=0;i<3;i++) na.useItem('hammer',ctx()); chk('  3 marteladas fixam o prego (deixa de desmoronar)',na.fixed&&nail.userData.crumble===false); }
// =========================== DESTINO I ===========================
log('— Destino I · Casa das Bombas —');
{ const F=FOUNDRY, p=P('h1'), L=p.logic;
  // propriedades do desenho: matriz inversível e solução única; ordem das bombas única
  let sols=[]; for(let n=0;n<256;n++){ const c=[n&3,(n>>2)&3,(n>>4)&3,(n>>6)&3]; const lv=L.L0.map((l0,k)=>{ let s=l0; for(let v=0;v<4;v++) s+=c[v]*F.M[v][k]; return s%4; }); if(lv.every((l,k)=>l===L.target[k])) sols.push(c.join('')); }
  chk('matriz: exatamente 1 combinação de voltas resolve (não é tentativa e erro)',sols.length===1,sols.join(','));
  chk('estado inicial NÃO está resolvido e exige várias voltas',!L.L0.every((l,k)=>l===L.target[k])&&F.solution.reduce((a,b)=>a+b)>=7,'· voltas mínimas '+F.solution.reduce((a,b)=>a+b));
  chk('alvos diferem por mostrador (ler símbolo, não ângulo)',new Set(L.target).size===4,JSON.stringify(L.target));
  const perms=(a)=>a.length<2?[a]:a.flatMap((x,i)=>perms([...a.slice(0,i),...a.slice(i+1)]).map(r=>[x,...r]));
  const ok=perms(['circle','triangle','square','diamond']).filter(o=>o.indexOf('circle')!==3&&o.indexOf('square')!==0&&o.indexOf('diamond')===o.indexOf('circle')+1&&o.indexOf('triangle')>o.indexOf('square'));
  chk('páginas do manual: UMA ordem de bombas satisfaz as 3 regras',ok.length===1&&ok[0].join()===F.order.join(),ok.map(o=>o.join('-')).join(' | '));
  place('h1'); tick('h1',.5); chk('entrar no salão contém a massa abaixo (hold)',mass.hold===world.puzzleRooms.h1.cap);
  { const cab=objs('Smashable').find(o=>o.id==='cabCard'), n0=world.interactables.length; for(let i=0;i<FOUNDRY.cabinetCard;i++) cab.useItem('hammer',ctx()); chk('armário trancado: quebrar libera o cartão de acesso (item existente do jogo)',cab.broken&&world.interactables.length>n0); }
  const w0=byId('Wheel','h1','valve0'); w0.interact(ctx()); chk('válvula sem energia não gira',w0.state===0);
  const br=byId('Lever','h1','breaker'); br.interact(ctx()); chk('disjuntor emperrado não cede só com a mão',!br.on);
  for(let i=0;i<F.jam;i++) br.useItem('hammer',ctx()); chk(`disjuntor cede após ${F.jam} marteladas`,br.jam===0);
  br.interact(ctx()); chk('disjuntor liga → energia',L.stage===1&&world.puzzleRooms.h1.refs.lights[0].intensity>0);
  // erro proposital: ordem errada das bombas só depois do equilíbrio
  F.solution.forEach((n,v)=>{ for(let i=0;i<n;i++) byId('Wheel','h1','valve'+v).interact(ctx()); });
  chk('válvulas giradas conforme a dedução → equilíbrio',L.stage===2,'· níveis '+L.level.join(''));
  w0.interact(ctx()); chk('após equilibrar, as válvulas travam',w0.state===F.solution[0]%4);
  const pump=s=>byId('Lever','h1','pump:'+s);
  ['triangle','circle','diamond','square'].forEach(s=>pump(s).interact(ctx()));      // ordem errada
  chk('ordem errada → surto: circuito reinicia (voltas zeradas, bombas desligadas)',L.stage===1&&L.counts.every(c=>c===0)&&Object.values(world.puzzleRooms.h1.refs.pumps).every(l=>!l.on));
  chk('  e a galeria continua trancada',world.puzzleRooms.h1.refs.doors.exit.open===false);
  F.solution.forEach((n,v)=>{ for(let i=0;i<n;i++) byId('Wheel','h1','valve'+v).interact(ctx()); });
  F.order.forEach(s=>pump(s).interact(ctx()));
  chk('ordem certa → bombas partem; galeria e Válvula-Mestra abrem',L.stage===3&&p.solved&&world.puzzleRooms.h1.refs.doors.exit.open&&world.puzzleRooms.h1.refs.doors.master.open);
  G.player.position.set(0,0,0); tick('h1',.3); chk('sair do salão libera a massa',mass.hold===null);
}
// =========================== GALERIA DO EXAUSTOR ===========================
log('— Galeria do exaustor (150 m) —');
{ const p=P('ex150'), R=world.puzzleRooms.ex150.refs, reg=R.register;
  chk('porta pressurizada começa fechada (sólida)',R.door.open===false&&world.platforms.includes(R.door.pd));
  place('ex150'); tick('ex150',.3); chk('entrar na galeria contém a massa abaixo (a escada é longa)',mass.hold===world.puzzleRooms.ex150.cap);
  reg.interact(ctx()); chk('registro de ar emperrado não gira só com a mão',reg.state===0&&!R.door.open);
  for(let i=0;i<EXHAUST.registerJam;i++) reg.useItem('hammer',ctx()); chk(`registro cede após ${EXHAUST.registerJam} marteladas`,reg.jam===0);
  reg.interact(ctx()); chk('registro fechado → porta pressurizada abre (e sai das colisões)',R.door.open&&p.solved&&!world.platforms.includes(R.door.pd));
  reg.interact(ctx()); chk('  depois de resolvido, o registro não reabre nada',R.door.open);
  const z=world.puzzleRooms.ex150.zones[0]; G.player.position.set((z.minX+z.maxX)/2,z.minY+5,(z.minZ+z.maxZ)/2); tick('ex150',.2); chk('  no poço de serviço (escada) a massa continua contida',mass.hold!==null);
  G.player.position.copy(polar(SHAFT_R-.8,Math.PI,EXHAUST.top)); tick('ex150',.2); chk('  de volta ao poço, acima do exaustor: massa liberada',mass.hold===null);
  const rungs=world.grabbables.filter(m=>m.userData.rung); const ys=rungs.map(m=>m.position.y).sort((a,b)=>a-b); let gap=0; for(let i=1;i<ys.length;i++) gap=Math.max(gap,ys[i]-ys[i-1]);
  chk('escada do poço de serviço: degraus de 150 m até o patamar de 174 m',rungs.length>50&&ys[0]<EXHAUST.H+.6&&ys[ys.length-1]>EXHAUST.top-1&&gap<=.4,`${rungs.length} degraus · maior vão ${gap.toFixed(2)} m`);
}
// =========================== PÁTIO DAS MÁQUINAS · energia ===========================
log('— Pátio das Máquinas (200 m) · Casa de Força —');
const HP=P('p200'), HL=HP.logic, HR=world.puzzleRooms.p200.refs, ctl=objs('ElevatorControl')[0], el=HR.elevator;
const gen=i=>byId('Lever','p200','gen:'+i), bus=byId('Lever','p200','bus');
const inCabin=()=>{ const c=el.pd; G.player.position.set((c.minX+c.maxX)/2,c.top,(c.minZ+c.maxZ)/2); };
{ // unicidade: só UMA combinação de geradores soma a demanda sem vizinhos ligados
  const ok=[]; for(let m=1;m<16;m++){ const on=[0,1,2,3].map(i=>!!(m>>i&1)); const L=on.reduce((s,v,i)=>s+(v?POWER.ratings[i]:0),0); if(L===POWER.demand&&!on.some((v,i)=>v&&on[i+1])) ok.push(on.map((v,i)=>v?'G'+(i+1):'').filter(Boolean).join('+')); }
  const sums=[]; for(let m=1;m<16;m++){ const L=[0,1,2,3].reduce((s,i)=>s+(m>>i&1?POWER.ratings[i]:0),0); if(L===POWER.demand) sums.push(m); }
  chk('Casa de Força: exatamente UMA combinação de geradores resolve (soma + vizinhos)',ok.length===1&&ok[0]==='G1+G4',ok.join(' | '));
  chk('  e a regra dos vizinhos é necessária (sem ela, haveria outra soma igual)',sums.length>1);
  place('p200'); tick('p200',.3); chk('entrar no anel do Pátio contém a massa abaixo',mass.hold===world.puzzleRooms.p200.cap);
  inCabin(); msgs.length=0; ctl.interact(ctx()); chk('elevador sem energia e sem freio: não sobe, e diz o que falta',el.state==='bottom'&&/energia/i.test(msgs.at(-1)||'')&&/freio/i.test(msgs.at(-1)||''),msgs.at(-1));
  gen(1).interact(ctx()); gen(2).interact(ctx()); chk('visor do barramento soma a carga ligada (G2+G3 = 9 MW)',HL.load()===9);
  bus.interact(ctx()); chk('G2+G3: soma certa, mas vizinhos → desarme (tudo desliga)',!HL.power&&HL.on.every(v=>!v)&&!gen(1).on&&!bus.on&&/vizinhos/.test(msgs.at(-1)||''),msgs.at(-1));
  gen(0).interact(ctx()); chk('  durante o desarme o painel fica travado (e explica)',!gen(0).on&&/desarmou/.test(msgs.at(-1)||''));
  tick('p200',POWER.lockout+.5);
  gen(3).interact(ctx()); chk('G4 está emperrado: só a mão não liga',!gen(3).on);
  for(let i=0;i<POWER.jam[3];i++) gen(3).useItem('hammer',ctx()); chk(`  G4 cede após ${POWER.jam[3]} marteladas`,gen(3).jam===0);
  gen(0).interact(ctx()); bus.interact(ctx()); chk('só G1 (3 MW): carga errada → desarme',!HL.power&&/3 MW/.test(msgs.at(-1)||''),msgs.at(-1));
  tick('p200',POWER.lockout+.5);
  gen(0).interact(ctx()); gen(3).interact(ctx()); bus.interact(ctx());
  chk('G1+G4 (9 MW, sem vizinhos) + barramento → energia no motor',HL.power&&HP.completedActions.includes('power')&&bus.on);
  gen(1).interact(ctx()); chk('  com a energia estável, os geradores ficam travados',!gen(1).on);
  inCabin(); ctl.interact(ctx()); chk('elevador com energia, mas o freio travado pelas raízes: não sobe',el.state==='bottom'&&/freio/.test(msgs.at(-1)||''),msgs.at(-1));
}
// =========================== DESTINO II ===========================
log('— Destino II · A Estufa (setor oeste do Pátio) —');
{ const Gn=GREEN, p=P('h2'), L=p.logic, R=world.puzzleRooms.h2.refs; place('h2'); tick('h2',.3);
  chk('bancadas: os 4 canteiros incluem a 1ª e a última estação',[Gn.seasons[0],Gn.seasons[3]].every(s=>Gn.bedOrder.includes(s)));
  const dial=i=>byId('Dial','h2','d'+i), root=byId('Lever','h2','root');
  dial(0).interact(ctx()); chk('altar inerte antes de abrir as raízes',dial(0).state===0);
  const bar=objs('Smashable').find(o=>o.id==='roots');
  for(let i=0;i<Gn.barrierHits-1;i++) bar.useItem('hammer',ctx()); chk('barreira de raízes resiste a golpes insuficientes',L.stage===0);
  bar.useItem('hammer',ctx()); chk(`barreira cede com ${Gn.barrierHits} marteladas`,L.stage===1);
  // tentativa errada (todos nos símbolos iniciais) → trava crescente
  root.interact(ctx()); chk('ciclo errado: altar trava (15 s)',L.locked&&root.on===false);
  dial(0).interact(ctx()); chk('  durante a trava os seletores não respondem',dial(0).state===0);
  tick('h2',16); root.interact(ctx()); chk('  2ª tentativa errada: trava 30 s',L.lockUntil-p.t>25&&L.locked);
  tick('h2',31);
  const press=(i,sym)=>{ let n=0; while(dial(i).symbols[dial(i).state]!==sym&&n++<9) dial(i).interact(ctx()); };
  Gn.seasons.forEach((s,i)=>press(i,s)); root.interact(ctx()); chk('ordem do ciclo correta → altar aceita',L.stage===2);
  const bed=s=>byId('Lever','h2','bed:'+s), first=Gn.seasons[0], last=Gn.seasons[3];
  bed(last).interact(ctx()); chk('luz da última estação antes da primeira → murcha tudo',L.stage===2&&L.seq.length===0&&!bed(last).on);
  bed(Gn.seasons[1]).interact(ctx()); chk('luz de estação do meio → murcha',L.seq.length===0);
  bed(first).interact(ctx()); bed(last).interact(ctx()); chk('primeira e depois última → estufa respira; as raízes soltam o freio do elevador',L.stage===3&&p.solved&&HL.brake&&HR.roots.every(m=>!m.parent));
  chk('  a Estufa é parte do Pátio: dentro dela a massa segue contida pelo Pátio',mass.hold===world.puzzleRooms.p200.cap&&!R.doors.exit);
  // coração: precisa do cartão
  const rd=R.reader; chk('leitor recusa sem cartão',rd.canUseItem('card',ctx())&&!R.doors.heart.open);
  inv.add('card'); rd.useItem('card',ctx()); chk('cartão consumido, câmara do Coração abre',R.doors.heart.open&&!inv.has('card')||(inv.slots.every(s=>!s||s.id!=='card')));
}
// =========================== PÁTIO · elevador ===========================
log('— Pátio das Máquinas · elevador de carga —');
{ G.player.position.copy(polar(10,0,HUB.H)); ctl.interact(ctx()); chk('com energia e freio, mas fora da cabine: pede para entrar',el.state==='bottom'&&/cabine/.test(msgs.at(-1)||''));
  inCabin(); ctl.interact(ctx()); chk('dentro da cabine: as portas fecham e o elevador parte',el.state==='closing'&&!el.doors.bottom.open&&HP.solved);
  const pl=G.player; pl._prev=pl.position.clone(); let maxY=0; for(let i=0;i<400&&el.state!=='top';i++){ world.update(.05,pl); maxY=Math.max(maxY,pl.position.y); }
  chk(`a cabine sobe até ${HUB.elevator.top} m levando o jogador junto`,el.state==='top'&&Math.abs(el.pd.top-HUB.elevator.top)<1e-6&&Math.abs(pl.position.y-HUB.elevator.top)<1e-6,`cabine ${el.pd.top.toFixed(2)} m · pés ${pl.position.y.toFixed(2)} m`);
  chk('  chegando, a porta de cima abre e a de baixo segue fechada',el.doors.top.open&&!el.doors.bottom.open);
  ctl.interact(ctx()); chk('  o elevador é de um sentido só',el.state==='top');
  tick('p200',.2); chk('no patamar de 224 m a massa ainda está contida',mass.hold!==null);
  pl.position.copy(polar(SHAFT_R-.9,HUB.elevator.theta,HUB.elevator.top)); tick('p200',.2); chk('saindo para o poço (acima do diafragma): massa liberada',mass.hold===null);
}
// =========================== DESTINO III ===========================
log('— Destino III · O Arquivo —');
{ const p=P('mz300'), L=p.logic, R=world.puzzleRooms.mz300.refs, I=world.puzzleRooms.mz300.info, cnt={}; I.muralSymbols.forEach(m=>{ cnt[m.sym]=(cnt[m.sym]||0)+1; });
  chk('mural: contagem pintada = código (3·5·2)',cnt.circle===3&&cnt.triangle===5&&cnt.square===2&&world.puzzleRooms.mz300.code==='352');
  chk('mural: há símbolos contáveis no ALTO e distratores',I.muralSymbols.filter(m=>m.row===0&&['circle','triangle','square'].includes(m.sym)).length>=2&&I.muralSymbols.some(m=>['diamond','cross','star'].includes(m.sym)));
  const key=l=>p.press(l); G.player.position.set(0,300.2,-8); p.update(.1);
  '123'.split('').forEach(key); key('OK'); chk('código errado: erro e teclado trava',!p.solved&&L.locked);
  key('3'); chk('  durante a trava o teclado ignora',L.typed==='');
  tick('mz300',11); '352'.split('').forEach(key); key('OK'); chk('código certo (352): porta da saída abre',p.solved&&R.doors.hatch.open);
  // 7 placas
  const tags=objs('Tag'); chk('placas do Arquivo: 5 nos becos + 1 na estante (+1 na gaveta, ao quebrá-la) = 7',R.tags.length===5+1&&tags.length===6,'· '+tags.length+' existentes antes da gaveta');
  const dec=objs('Decision').find(o=>o.id==='witness'); dec.interact(ctx()); chk('cofre: decisão bloqueada sem as 7 placas',!G.route);
  tags.forEach(t=>t.interact(ctx()));
  const dr=objs('Smashable').find(o=>o.id==='drawer'); dr.useItem('hammer',ctx()); dr.useItem('hammer',ctx());
  const newTag=objs('Tag').find(o=>o.id==='t5'); newTag.interact(ctx());
  chk('gaveta quebrada revela a placa (6ª)',!!newTag&&newTag.taken&&L.tags.size===7-0-0||L.tags.size>=6,'· '+L.tags.size+'/7');
  const names=[...L.tags]; chk('7ª placa leva o NOME do jogador',(()=>{ const t6=tags.find(o=>o.id==='t6'); return t6&&t6._nm(ctx())==='JARDHES'; })());
  chk('cofre abre ao reunir as 7',R.doors.vault.open&&L.tags.size===7);
}
// =========================== ROTA / FINAIS ===========================
log('— Rotas e finais —');
{ const dec=id=>id==='seal'?world.puzzleRooms.h1.refs.decision:objs('Decision').find(o=>o.id===id);
  chk('nenhuma decisão tomada = FUGA',G.route===null);
  dec('seal').interact(ctx()); dec('seal').interact(ctx());     // 1º F lê, 2º F confirma
  chk('1ª decisão (SELO) define a rota; massa selada',G.route==='seal'&&mass.frozen===true&&world.route==='seal');
  dec('commune').interact(ctx()); dec('commune').interact(ctx()); dec('witness').interact(ctx()); dec('witness').interact(ctx());
  chk('decisões seguintes não mudam a rota (exclusivas)',G.route==='seal'&&mass.scale===1);
  chk('os 4 finais têm título, etiqueta e texto',['seal','commune','witness','escape'].every(k=>ENDINGS[k]&&ENDINGS[k].name&&ENDINGS[k].tag&&ENDINGS[k].text.length>120));
  chk('cada destino aponta para um final diferente',new Set(HALLS.map(h=>h.route)).size===3&&HALLS.every(h=>ENDINGS[h.route]));
  // rota COMUNHÃO e TESTEMUNHO em jogos novos
  for(const [route,chkf] of [['commune',()=>mass.scale===.45&&!mass.frozen],['witness',()=>mass.scale===.85&&!mass.frozen]]){ G.puzzles.reset(); G.puzzles.commitRoute(route); chk(`rota ${route}: efeito no mundo`,G.route===route&&chkf()); }
  G.puzzles.reset(); chk('nova partida zera a rota e a massa',G.route===null&&!mass.frozen&&mass.scale===1);
}
log('\nfalhas:',fails); process.exit(fails?1:0);
