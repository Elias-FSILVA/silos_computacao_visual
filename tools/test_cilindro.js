// O poço é um CILINDRO de verdade: geometria, parede contínua, colisão funcional, agarras na superfície curva,
// volta completa na circunferência, aberturas que levam às alas e diafragmas que fecham o poço. Usa o Player real.
const log=console.log; console.log=()=>{};
const T=require('./_player.js'); console.log=log;
const {world,V3}=T, R=SHAFT_R, ST=SHELL_T;
let fails=0; const out=(k,v)=>log(k.padEnd(76),v); const chk=(k,ok,x='')=>{ out(k,(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };
const rOf=p=>Math.hypot(p.x,p.z), deg=a=>(a*180/Math.PI).toFixed(1)+'°';
const opAt=(a,y,m=0)=>world.openings.some(o=>wrap2(a-o.a0+m/R)<=o.a1-o.a0+2*m/R&&y>=o.y0-m&&y<o.y1+m);

// ---------- 1) geometria: a casca do poço é um círculo (todos os vértices em r = R ou R+T) ----------
log('— Geometria —');
const shell=world.walls.filter(m=>{ const s=m.userData.solid; return s&&s.arc&&Math.abs(s.arc.r0-R)<1e-9&&Math.abs(s.arc.r1-R-ST)<1e-9&&s.arc.cx===0&&s.arc.cz===0; });
let maxDev=0, verts=0; const angles=new Set();
for(const m of shell){ const a=m.geometry.attributes.position.array;
  for(let i=0;i<a.length;i+=3){ const x=a[i]+m.position.x, z=a[i+2]+m.position.z, r=Math.hypot(x,z); maxDev=Math.max(maxDev,Math.min(Math.abs(r-R),Math.abs(r-R-ST))); verts++;
    if(Math.abs(r-R)<1e-6) angles.add(Math.round(wrap2(Math.atan2(z,x))*1e4)); } }
chk('casca do poço: setores anelares (pedaços)',shell.length>100,shell.length+' pedaços');
chk('todos os vértices da parede em r = 6,00 m ou 6,50 m (círculo, não quadrado)',maxDev<1e-6,`${verts} vértices · desvio máx ${maxDev.toExponential(1)} m`);
{ const s=[...angles].sort((a,b)=>a-b).map(v=>v/1e4); let gap=0; for(let i=1;i<s.length;i++) gap=Math.max(gap,s[i]-s[i-1]); gap=Math.max(gap,s[0]+TAU-s[s.length-1]);
  chk('faceta máxima da superfície interna ≤ 5° (desvio da curva < 6 mm)',gap<=5.01*Math.PI/180,'maior faceta '+deg(gap)+' · flecha '+(R*(1-Math.cos(gap/2))*1000).toFixed(1)+' mm'); }
chk('nenhuma parede reta do poço antigo (caixas na faixa r 4–4,5 m)',!world.platforms.some(p=>!p.arc&&!p.obb&&p.kind==='wall'&&Math.min(Math.abs(p.minX),Math.abs(p.maxX))>3.9&&Math.max(Math.abs(p.minX),Math.abs(p.maxX))<4.6&&p.maxZ-p.minZ>7));
// continuidade: em cada altura e ângulo, ou há parede, ou há uma abertura (e nunca as duas)
{ let holes=0, both=0, n=0;
  for(let y=-1;y<=TOP+20;y+=.25) for(let k=0;k<360;k++){ const a=k*Math.PI/180+.0013, wall=world.shellSegs.some(s=>s.y0<=y&&s.y1>y&&wrap2(a-s.a0)<=s.span), op=opAt(a,y); n++;
    if(!wall&&!op) holes++; if(wall&&op&&!world.openings.some(o=>o.grate&&wrap2(a-o.a0)<=o.a1-o.a0&&y>o.y0&&y<o.y1)) both++; }
  chk('parede contínua: toda falha da casca é uma abertura declarada',holes===0,`${n} amostras · falhas ${holes}`);
  chk('nenhuma abertura fica tampada por parede (grades são janelas sólidas)',both===0); }

// ---------- 2) agarras na superfície curva ----------
log('— Agarras —');
{ const hs=world.grabbables.filter(m=>m.userData.type==='hold'&&!m.userData.rung&&rOf(m.position)<R+.05);
  let bad=0, nb=0; for(const m of hs){ const r=rOf(m.position), n=m.userData.wallNormal, ux=m.position.x/r, uz=m.position.z/r;
    if(Math.abs(r-(R-.1))>1e-6) bad++; if(-(n.x*ux+n.z*uz)<.9999||Math.abs(n.y)>1e-6) nb++; }
  chk('agarras do poço a 10 cm da superfície (r = 5,90 m)',bad===0,`${hs.length} agarras · fora ${bad}`);
  chk('normal de cada agarra aponta para o eixo do poço',nb===0,'desalinhadas '+nb);
  const angs=hs.map(m=>wrap2(Math.atan2(m.position.z,m.position.x))), q=[0,0,0,0]; angs.forEach(a=>q[Math.floor(wrap2(a+Math.PI/4)/(Math.PI/2))%4]++);
  chk('agarras espalhadas por toda a circunferência (os quatro quadrantes)',q.every(c=>c>80),'L/S/O/N '+q.join(' / ')); }

// ---------- 3) colisão radial: empurrar o corpo contra a parede em toda a volta ----------
log('— Colisão —');
const pushOut=(a,y,speed=8,frames=60,dt=1/60)=>{ const p=new V3(Math.cos(a)*(R-1.2),y,Math.sin(a)*(R-1.2)), v=new V3(Math.cos(a)*speed,0,Math.sin(a)*speed), prev=new V3();
  for(let i=0;i<frames;i++){ prev.copy(p); v.x=Math.cos(a)*speed; v.z=Math.sin(a)*speed; v.y=0; p.x+=v.x*dt; p.z+=v.z*dt; collideBody(world.platforms,p,v,prev,{guard:(q,pr,vv)=>world.guard(q,pr,vv)}); p.y=y; }
  return p; };
{ let worst=0, tested=0; const ys=[5,25,55,87,125,140,185,230,265,290,330,370];
  for(const y of ys) for(let k=0;k<72;k++){ const a=k*TAU/72+.01; if(opAt(a,y,.6)||opAt(a,y+1.75,.6)) continue; const p=pushOut(a,y); worst=Math.max(worst,rOf(p)); tested++; }
  chk('empurrado para fora (8 m/s) em 72 direções × 12 alturas: fica em r ≤ R − 0,3',worst<=R-RAD+1e-6,`${tested} testes · r máx ${worst.toFixed(4)} m`); }
// estresse: posições e velocidades aleatórias, quadros lentos (30 fps) — ninguém escapa pela parede curva
{ let esc=0, n=0; const rnd=T.vm.runInThisContext('mulberry')(4242);
  for(let t=0;t<2500;t++){ const y=2+rnd()*(TOP-6), a0=rnd()*TAU, r0=rnd()*(R-RAD-.05); const p=new V3(Math.cos(a0)*r0,y,Math.sin(a0)*r0), prev=new V3();
    const b=rnd()*TAU, s=2+rnd()*7, v=new V3(Math.cos(b)*s,0,Math.sin(b)*s);
    for(let i=0;i<40;i++){ prev.copy(p); p.x+=v.x/30; p.z+=v.z/30; collideBody(world.platforms,p,v,prev,{guard:(q,pr,vv)=>world.guard(q,pr,vv)}); p.y=y; v.x=Math.cos(b)*s; v.z=Math.sin(b)*s;
      const r=rOf(p), a=Math.atan2(p.z,p.x); if(r>R+.01&&!opAt(a,y,.4)&&!opAt(a,y+1.7,.4)){ esc++; break; } } n++; }
  chk('estresse: 2500 corpos com velocidade aleatória (2–9 m/s, 30 fps): escapes pela parede',esc===0,`${esc} de ${n}`); }

// ---------- 4) volta completa na circunferência (jogador real, andando) ----------
log('— Circunferência —');
const loop=(label,r0,y,laps,maxR,minR)=>{
  const P=T.makePlayer(); P.position.copy(polar(r0,0,y)); P._prev.copy(P.position); P.grounded=true; P.velocity.set(0,0,0);
  let ang=0, last=0, rmax=0, rmin=99, off=0, air=0;
  T.step(P,9000,{x:0,y:1},1/60,()=>{ const a=Math.atan2(P.position.z,P.position.x), r=rOf(P.position); let d=a-last; if(d>Math.PI) d-=TAU; if(d<-Math.PI) d+=TAU; ang+=d; last=a;
    rmax=Math.max(rmax,r); rmin=Math.min(rmin,r); if(Math.abs(P.position.y-y)>.05) off++; if(!P.grounded) air++;
    const tx=-Math.sin(a), tz=Math.cos(a), ux=Math.cos(a), uz=Math.sin(a), k=r<r0?.35:-.35; T.face(P,tx+ux*k,tz+uz*k);   // tangente, corrigindo o raio
    if(ang>=laps*TAU) P.dead=true; });
  chk(label,ang>=laps*TAU&&rmax<=maxR+1e-6&&rmin>=minR-1e-6&&off===0&&air===0,`${(ang/TAU).toFixed(2)} voltas · r ${rmin.toFixed(2)}–${rmax.toFixed(2)} m · fora do piso ${off} quadros`);
};
loop('passarela anelar (40 m): duas voltas completas sem sair do piso nem atravessar a parede',R-.55,40,2,R-RAD,R-1.2);
loop('anel do Pátio das Máquinas (200 m): volta completa em volta do poço, entre a parede do poço e as máquinas',10.4,HUB.H,1,HUB.rOut-RAD,R+ST+RAD);
// galeria do exaustor: da boca, pelo corredor curvo, até a porta pressurizada (fechada); aberta, segue até o poço de serviço
{ const E=EXHAUST, room=world.puzzleRooms[E.id], P=T.makePlayer(), a0=E.entryA; P.position.copy(polar(R-.6,a0,E.H)); P._prev.copy(P.position); P.grounded=true;
  T.face(P,Math.cos(a0),Math.sin(a0)); T.step(P,90,{x:0,y:1});
  let rmin=99,rmax=0,off=0; const walk=(n,target)=>T.step(P,n,{x:0,y:1},1/60,()=>{ const a=Math.atan2(P.position.z,P.position.x), r=rOf(P.position), rc=(R+ST+E.r1)/2, k=clamp((rc-r)*.8,-.6,.6);
    rmin=Math.min(rmin,r); rmax=Math.max(rmax,r); if(Math.abs(P.position.y-E.H)>.05) off++; T.face(P,-Math.sin(a)+Math.cos(a)*k,Math.cos(a)+Math.sin(a)*k); if(wrap2(a)>=target) P.dead=true; });
  walk(1500,E.a1);
  const stop=wrap2(Math.atan2(P.position.z,P.position.x));
  chk('galeria: anda pelo corredor curvo e para na porta pressurizada fechada',Math.abs(stop-E.doorA)<.12&&stop<E.doorA&&off===0&&rmin>=R+ST+RAD-1e-6&&rmax<=E.r1-RAD+1e-6,`parou em ${deg(stop)} (porta ${deg(E.doorA)}) · r ${rmin.toFixed(2)}–${rmax.toFixed(2)} m`);
  room.refs.door.set(true,true); P.dead=false; walk(2500,E.shaftTheta);
  const a=Math.atan2(P.position.z,P.position.x); chk('  com a porta aberta, segue a curva até o poço de serviço (oeste)',Math.abs(wrapPi(a-E.shaftTheta))<.06&&off===0,`chegou a ${deg(wrap2(a))}`);
  P.dead=false; T.face(P,Math.cos(a),Math.sin(a)); T.step(P,150,{x:0,y:1});
  chk('  e entra no poço de serviço pela porta da parede externa',rOf(P.position)>E.r1+.5,`r ${rOf(P.position).toFixed(2)} m`);
  room.refs.door.set(false,true); }

// ---------- 5) aberturas levam às alas; janelas de grade não ----------
log('— Aberturas —');
const through=(o,yFeet,brk)=>{ const a=(o.a0+o.a1)/2, P=T.makePlayer(); P.position.copy(polar(R-.65,a,yFeet)); P._prev.copy(P.position); P.grounded=true;
  T.face(P,Math.cos(a),Math.sin(a)); for(let i=0;i<200&&rOf(P.position)<=R+ST+.7;i++) T.step(P,1,{x:0,y:1}); T.step(P,10); return P; };
for(const o of world.openings){
  if(o.grate){ const a=(o.a0+o.a1)/2, y=o.y0+.05; const p=pushOut(a,y,6,60); chk(`janela de grade ${o.id} (${o.y0}–${o.y1} m) é sólida`,rOf(p)<=R-RAD+1e-6); continue; }
  if(o.id.startsWith('secret')) continue;
  const P=through(o,o.y0); chk(`abertura ${o.id} (${o.y0.toFixed(1)} m, ${deg((o.a0+o.a1)/2)}) leva para fora do poço`,rOf(P.position)>R+ST+.6&&Math.abs(P.position.y-o.y0)<.5&&!P.dead,`r ${rOf(P.position).toFixed(2)} m · y ${P.position.y.toFixed(2)}`);
}
{ const o=world.openings.find(x=>x.id==='secret0'); const P=through(o,0); chk('sala secreta: painel rachado fecha a abertura enquanto inteiro',rOf(P.position)<=R-RAD+.01,`r ${rOf(P.position).toFixed(3)} m`);
  const panel=world.walls.find(m=>m.userData.type==='breakable'&&m.userData.solid&&m.userData.solid.top===3); world.removeSolid(panel);
  const P2=through(o,0); chk('  quebrado, dá passagem para o salão',rOf(P2.position)>R+ST+.6); }

// ---------- 6) o poço é fechado por geometria acima das alas ----------
log('— Fechamentos —');
for(const yd of DIAPHRAGMS){
  const d=world.platforms.find(p=>p.kind==='diaphragm'&&Math.abs(p.bottom-yd)<1e-6);
  chk(`diafragma ${yd} m: disco que cobre o poço inteiro, sem agarras`,!!d&&d.arc.r0===0&&d.arc.r1>=R&&d.arc.span>=TAU-1e-9&&!world.grabbables.some(m=>m.userData.solid===d));
  let passed=0; for(let k=0;k<12;k++){ const P=T.makePlayer(), a=k*TAU/12, r=k%3*2; P.position.copy(polar(r,a,yd-2.2)); P._prev.copy(P.position); P.grounded=false; P.velocity.set(0,9,0);
    T.step(P,60); if(P.position.y+BODY_H>yd+.31) passed++; }
  chk(`  pulando por baixo (9 m/s) em 12 pontos ninguém atravessa`,passed===0);
}
{ const F=EXHAUST.fan, disc=world.platforms.filter(p=>p.kind==='fan'); chk('exaustor (169 m): carcaça + disco das pás fecham o poço',disc.some(p=>p.arc.r0===0&&p.arc.r1>=F.radius)&&disc.some(p=>p.arc.r0<=F.radius+1e-9&&p.arc.r1>=R)); }

log('\nfalhas:',fails); process.exit(fails?1:0);
