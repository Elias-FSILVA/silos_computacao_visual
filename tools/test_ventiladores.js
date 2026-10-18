// Ventiladores no silo cilíndrico: direção e intensidade do fluxo (eixo, distância, borda do duto), abrigo por geometria,
// zona de sucção do exaustor e o insuflador como rota. Usa o Player real (força do vento, pegada, queda, pouso).
const log=console.log; console.log=()=>{};
const T=require('./_player.js'); console.log=log;
const {world,V3}=T, R=SHAFT_R, E=EXHAUST, I=INSUF;
let fails=0; const out=(k,v)=>log(k.padEnd(78),v); const chk=(k,ok,x='')=>{ out(k,(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };
const rOf=p=>Math.hypot(p.x,p.z), air=p=>{ const w=world.wind(p); return w&&!w.kill?w.air:null; };
const place=(P,p,v=new V3())=>{ P.position.copy(p); P._prev.copy(p); P.velocity.copy(v); P.grounded=false; P.releaseAll(); };

// ---------- 1) exaustor: fluxo axial, crescendo até as pás; nada fora do poço ----------
log('— Exaustor (169 m) —');
{ let mono=true, lateral=0, prev=-1; const us=[];
  for(let y=E.fan.y-E.fan.range-4;y<E.fan.y-3;y+=.5){ const a=air(new V3(0,y-1,0)); const u=a?a.length():0; us.push([y,u]);
    if(a){ lateral=Math.max(lateral,Math.hypot(a.x,a.z)); if(u+1e-9<prev) mono=false; prev=u; } }
  chk('ar sobe (eixo do exaustor) e acelera continuamente até as pás',mono&&lateral<1e-9,us.filter((_,i)=>i%8===0).map(([y,u])=>`${y.toFixed(0)} m: ${u.toFixed(1)}`).join(' · ')+' m/s');
  chk('abaixo do alcance (24 m) não há vento',!air(new V3(0,E.fan.y-E.fan.range-2.2,0)));
  // fluxo confinado ao duto: mesma velocidade em toda a seção (sem forças radiais "puxando" para o centro ou para a parede)
  let spread=0; const y0=158; const u0=air(new V3(0,y0,0)).length();
  for(let r=0;r<=R-RAD;r+=.5) for(let k=0;k<8;k++){ const a=air(polar(r,k*TAU/8,y0)); if(a) spread=Math.max(spread,Math.abs(a.length()-u0)+Math.hypot(a.x,a.z)); }
  chk('seção do poço: fluxo uniforme e puramente vertical em qualquer ponto (r ≤ 5,7 m)',spread<.05,`variação ${spread.toFixed(3)} m/s`);
  chk('fora do poço não há vento: galeria, poço de serviço, braço de 174 m',!air(polar(8,1.4,E.H))&&!air(polar(10.8,Math.PI,160))&&!air(polar(8,Math.PI,E.top))&&!air(polar(3,0,E.top)));
  chk('abrigo: na boca da galeria, sob a marquise, o fluxo não pega',!air(polar(R-.9,E.entryA,E.H)));
  chk('  ao lado da marquise, sem abrigo, pega (fraco)',!!air(polar(R-.9,E.entryA+.6,E.H)),air(polar(R-.9,E.entryA+.6,E.H))?air(polar(R-.9,E.entryA+.6,E.H)).length().toFixed(1)+' m/s':'');
  const w=world.wind(new V3(0,E.fan.y-1-1.0,0)); chk('zona das pás (a < 1,4 m do rotor) é letal',!!(w&&w.kill));
}
// ---------- 2) a rota antiga: pendurado, a sucção gasta a pegada; solto, o jogador é sugado ----------
{ const old=world.grabbables.filter(m=>m.userData.type==='hold'&&!m.userData.extra&&Math.abs(Math.atan2(m.position.z,m.position.x)-(E.oldRoute.a0+E.oldRoute.a1)/2)<.25&&m.position.y>E.oldRoute.y0-.2&&m.position.y<E.oldRoute.y1+.2).sort((a,b)=>b.position.y-a.position.y);
  const top=old[0], low=world.grabbables.find(m=>m.userData.type==='hold'&&Math.abs(m.position.y-125)<2&&!m.userData.extra);
  const hang=(m)=>{ const P=T.makePlayer(); const n=m.userData.wallNormal; place(P,new V3(m.position.x+n.x*.5,m.position.y-.85-EYE,m.position.z+n.z*.5)); T.grab(P,0,m); T.grab(P,1,m); const s0=P.stamina; T.step(P,180); return {P,drop:s0-P.stamina}; };
  const a=hang(top), b=hang(low);
  chk(`rota antiga: topo (${top.position.y.toFixed(1)} m) existe e fica sob a zona selada`,!!top&&top.position.y<LOCK_BANDS[1].y0-.3);
  chk('pendurado no topo da rota antiga, a pegada acaba bem mais rápido que sem vento',a.drop>b.drop*1.6&&!a.P.dead,`3 s: ${a.drop.toFixed(1)} vs ${b.drop.toFixed(1)} de estamina · vento ${(a.P.windF.length()).toFixed(1)} m/s²`);
  a.P.releaseAll(); let maxY=a.P.position.y; T.step(a.P,600,{x:0,y:0},1/60,()=>{ maxY=Math.max(maxY,a.P.position.y); });
  chk('soltando ali, o fluxo puxa o corpo para cima até as pás (morte por exaustor)',a.P.dead&&a.P.deathReason==='fan',`subiu até ${maxY.toFixed(1)} m · ${a.P.deathReason||'vivo'}`);
}
// ---------- 3) na boca da galeria (rota obrigatória) dá para ficar parado ----------
{ const P=T.makePlayer(); place(P,polar(R-.9,E.entryA,E.H)); T.step(P,300);
  chk('parado na boca da galeria por 5 s: vivo e no piso (o abrigo segura)',!P.dead&&P.grounded&&Math.abs(P.position.y-E.H)<.01);
  const can=world.platforms.find(p=>p.kind==='canopy'), led=world.platforms.find(p=>p.kind==='rest'&&p.top===E.H);
  chk('  a marquise cobre a boca inteira (em ângulo e em profundidade)',can.arc.a0<=led.arc.a0&&can.arc.a0+can.arc.span>=led.arc.a0+led.arc.span&&can.arc.r0<=led.arc.r0);
  const Q=T.makePlayer(); place(Q,polar(R-.9,E.entryA+.2,E.H)); let maxY=E.H; for(let k=0;k<6;k++){ Q.jump(); T.step(Q,50,{x:0,y:0},1/60,()=>{ maxY=Math.max(maxY,Q.position.y); }); }
  chk('  pulando na boca, a marquise segura a cabeça e o fluxo não leva',!Q.dead&&Q.grounded&&maxY+BODY_H<=can.bottom+.01,`topo da cabeça ${(maxY+BODY_H).toFixed(2)} m · marquise ${can.bottom.toFixed(2)} m`); }

// ---------- 4) insuflador: o fluxo leva até o mirante; cair da coluna não mata ----------
log('— Insuflador (245 m) —');
{ const fan=world.fans.find(f=>f.name==='insuflador'), c=fan.pos, mir=world.platforms.find(p=>p.kind==='rest'&&Math.abs(p.top-I.ledge.top)<.01);
  chk('fluxo para cima só dentro da coluna (círculo pintado); fora dela, nada',!!air(new V3(c.x,I.grateTop,c.z))&&!air(polar(.3,I.a+Math.PI,I.grateTop))&&!air(polar(R-.6,I.a-.7,I.grateTop)));
  chk('abrigo: acima do mirante o fluxo não chega (a borda tapa o ar)',!air(polar(R-.6,I.a,I.ledge.top))&&!!air(polar(I.fan.r,I.a,I.ledge.top)));
  const P=T.makePlayer(); place(P,new V3(c.x,I.grateTop,c.z)); P.grounded=true;
  let maxY=0, vy=[]; T.step(P,540,{x:0,y:0},1/60,i=>{ maxY=Math.max(maxY,P.position.y); if(i>420) vy.push(Math.abs(P.velocity.y)); });
  const hover=P.position.y, calm=Math.max(...vy);
  chk('pisando no círculo o corpo sobe e flutua estável',hover>I.ledge.top+.3&&hover<I.ledge.top+1.6&&calm<.6,`pés a ${hover.toFixed(2)} m (mirante ${I.ledge.top} m) · pico ${maxY.toFixed(2)} · |vy| ${calm.toFixed(2)} m/s`);
  chk('  e a queda da altura da flutuação até a grade fica abaixo da letal',Math.sqrt(2*G*(maxY-I.grateTop))<FALL_KILL,`${Math.sqrt(2*G*(maxY-I.grateTop)).toFixed(1)} < ${FALL_KILL} m/s`);
  const w=polar(1,I.a,0); T.face(P,w.x,w.z); let landed=false; T.step(P,600,{x:0,y:1},1/60,()=>{ if(P.grounded&&Math.abs(P.position.y-I.ledge.top)<.02&&solidInXZ(mir,P.position.x,P.position.z,RAD)) { landed=true; P.dead=true; } });
  P.dead=false; chk('inclinando para a parede, pousa no mirante (rota obrigatória)',landed,`pés ${P.position.y.toFixed(2)} m · r ${rOf(P.position).toFixed(2)}`);
  // sair da coluna para o lado errado: cai na grade sem morrer
  const Q=T.makePlayer(); place(Q,new V3(c.x,I.grateTop,c.z)); Q.grounded=true; T.step(Q,360);
  const away=new V3(-c.x,0,-c.z); T.face(Q,away.x,away.z); T.step(Q,420,{x:0,y:1});
  chk('saindo da coluna para o centro do poço: cai na grade e sobrevive',!Q.dead&&Q.grounded&&Math.abs(Q.position.y-I.grateTop)<.02,`pés ${Q.position.y.toFixed(2)} m · ${Q.deathReason||'vivo'} · ${Q.health.value} HP`);
}
// ---------- 5) o vento nunca empurra através da parede curva ----------
{ let esc=0, n=0, viaOpening=0; const rnd=T.vm.runInThisContext('mulberry')(77);
  const opAt=(a,y)=>world.openings.some(o=>!o.grate&&wrap2(a-o.a0+.08)<=o.a1-o.a0+.16&&y>=o.y0-.3&&y<o.y1);
  for(let t=0;t<60;t++){ const P=T.makePlayer(), a=rnd()*TAU, r=rnd()*(R-RAD), y=E.fan.y-6-rnd()*14; place(P,polar(r,a,y),new V3((rnd()-.5)*8,0,(rnd()-.5)*8));
    let bad=false, out=false; T.step(P,240,{x:(rnd()-.5)*2,y:1},1/60,()=>{ const q=P.position; if(rOf(q)>R-RAD+.002){ if(opAt(Math.atan2(q.z,q.x),q.y)) out=true; else bad=true; } });
    n++; if(bad) esc++; if(out) viaOpening++; }
  chk('60 corpos soltos no fluxo do exaustor, andando para qualquer lado: nenhum atravessa a parede',esc===0,`${esc} de ${n} · ${viaOpening} saíram por aberturas (boca da galeria, saída das Bombas)`); }

log('\nfalhas:',fails); process.exit(fails?1:0);
