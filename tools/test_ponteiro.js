// Pointer Lock (Game.js): a captura só vale depois da confirmação do navegador; Esc e recusas nunca deixam a partida
// rodando com o cursor solto; mochila e ciclos de pausa não prendem o mouse nem duplicam listeners.
// O navegador é simulado com as regras do Chrome: depois que o USUÁRIO sai com Esc, recapturar exige gesto (Esc não é gesto)
// e fica bloqueado por 1,25 s; depois de exitPointerLock() da própria página, recapturar não exige gesto.
const log=console.log; console.log=()=>{};
const L=require('./_load.js'); L.load('js/Game.js'); console.log=log;
const vm=require('vm'); let fails=0; const chk=(k,ok,x='')=>{ log(k.padEnd(78),(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };
const Game=vm.runInThisContext('Game'), TimerSystem=vm.runInThisContext('TimerSystem');

// ---------- relógio e navegador simulados ----------
let T=10000; global.performance={now:()=>T};
const H={win:{},doc:{},canvas:{}}; let listeners=0;
const on=m=>(t,f)=>{ (m[t]=m[t]||[]).push(f); listeners++; };
const fire=(m,t,e={})=>(m[t]||[]).forEach(f=>f(e));
const B={locked:false,byTarget:false,esc:-1e9,gesture:false,q:[],req:0};
const doc=global.document, canvas={addEventListener:on(H.canvas)};
doc.pointerLockElement=null; doc.addEventListener=on(H.doc); global.addEventListener=on(H.win);
canvas.requestPointerLock=()=>{
  B.req++; const ok=B.byTarget||(B.gesture&&T>=B.esc+1250);
  B.q.push(()=>{ if(ok){ B.locked=true; doc.pointerLockElement=canvas; fire(H.doc,'pointerlockchange'); } else fire(H.doc,'pointerlockerror'); });
  return {catch(){}};
};
doc.exitPointerLock=()=>{ if(B.locked) B.q.push(()=>{ B.locked=false; B.byTarget=true; doc.pointerLockElement=null; fire(H.doc,'pointerlockchange'); }); };
const flush=()=>{ while(B.q.length) B.q.shift()(); };
// Esc com o mouse capturado: o navegador solta e consome a tecla (a página só vê o pointerlockchange)
const userEsc=()=>{ B.locked=false; B.byTarget=false; B.esc=T; doc.pointerLockElement=null; fire(H.doc,'pointerlockchange'); };
const gesture=f=>{ B.gesture=true; try{ f(); }finally{ B.gesture=false; } };
const key=(code,o={})=>{ B.gesture=code!=='Escape'; fire(H.win,'keydown',{code,repeat:false,target:{},preventDefault(){},...o}); B.gesture=false; };
const mouse=(t,o)=>gesture(()=>fire(t==='mousedown'?H.canvas:H.win,t,{button:0,movementX:7,movementY:0,...o}));

// ---------- jogo com o código real de Game.js e o resto em stubs ----------
const els={}, $=id=>els[id]||(els[id]={id,hidden:false,textContent:'',value:'',addEventListener(){},focus(){}});
const screens=['menu','settings','ranking','quit','pause','result'];
const ui={$,msgs:[],pack:false,show(n){ screens.forEach(s=>$(s).hidden=s!==n); },hideScreens(){ screens.forEach(s=>$(s).hidden=true); },
  clearMsg(){},msg(t){ this.msgs.push(t); },setHUD(){},setPack(v){ this.pack=!!v; },hideNote(){},bindSettings(){},cancelDrag(){ return false; },packKey(){}};
const looks=[], grabs=[];
const g=Object.create(Game.prototype);
Object.assign(g,{renderer:{domElement:canvas},ui,settings:{data:{sensitivity:1,invertY:false}},timer:new TimerSystem(),
  player:{dead:false,on(){},releaseAll(){},look(dx){ looks.push(dx); },setGrab(i,d){ grabs.push([i,d]); }},
  items:{equipped:null,use(){}},audio:{setRumble(){},setHum(){},setTension(){}},resetRun(){},interaction:{keypadAimed:()=>false},
  vr:{busy:false,active:false,closeMenu(){},showPause(){},ready:Promise.resolve(false)},
  spectator:{exits:0,exit(){ this.exits++; g.state='menu'; },look(){},key(){}},cinematic:{skip(){}},world:{},
  state:'menu',keys:{},gameBtn:{},_lockGuard:0,_lockReq:0,_resuming:false,wasLocked:false});
g._wire(); const wired=listeners;
const click=id=>gesture(()=>$(id).onclick());
const hint=()=>$('pauseErr').textContent;

// ---------- início da partida sem gesto (a cinemática de 12,8 s terminou sozinha) ----------
g.beginPlay();
mouse('mousemove'); chk('início: captura pendente → mouse solto não gira a câmera',g.state==='play'&&!B.locked&&looks.length===0);
flush(); chk('início sem gesto: recusa vira pausa com aviso (não joga com o cursor solto)',g.state==='paused'&&!B.locked&&!g.timer.running&&!!hint(),'· '+hint());
T+=2000; click('btnResume');
chk('Continuar: segue pausado até o navegador confirmar a captura',g.state==='paused'&&g._resuming&&!$('pause').hidden);
flush(); chk('captura confirmada → retoma com o cursor oculto e o tempo correndo',g.state==='play'&&B.locked&&g.timer.running&&$('pause').hidden);
chk('a dica de como agarrar reaparece depois da retomada',ui.msgs.length===2&&ui.msgs[1]===ui.msgs[0]);
mouse('mousemove'); chk('mouse capturado gira a câmera',looks.length===1);

// ---------- Esc e retomada pelo botão ----------
T+=5000; userEsc();
chk('Esc → pausa, cursor do sistema visível, menu aberto, sem aviso',g.state==='paused'&&!B.locked&&!$('pause').hidden&&hint()==='');
T+=2000; const r0=B.req; click('btnResume'); click('btnResume'); flush();
chk('Continuar (clique duplo) → um único pedido, retoma capturado',g.state==='play'&&B.locked&&B.req===r0+1);

// ---------- Esc para retomar (não é gesto) ----------
T+=5000; userEsc(); T+=600; key('Escape'); flush();
chk('Esc na pausa: navegador recusa → continua pausado e explica',g.state==='paused'&&!B.locked&&!!hint());
T+=1000; click('btnResume'); flush(); chk('depois do aviso, um clique em Continuar retoma',g.state==='play'&&B.locked);

// ---------- Continuar rápido demais (bloqueio de 1,25 s do Chrome) ----------
T+=5000; userEsc(); T+=500; click('btnResume'); flush();
chk('Continuar 0,5 s após o Esc: recusado → pausado com aviso, sem travar',g.state==='paused'&&!g._resuming&&!!hint());
T+=1000; click('btnResume'); flush(); chk('novo clique em Continuar → retoma',g.state==='play'&&B.locked);

// ---------- Esc segurado (repetição do teclado) e P ----------
T+=5000; userEsc(); T+=600; const r1=B.req; key('Escape',{repeat:true}); flush();
chk('Esc segurado: a repetição não tenta retomar',g.state==='paused'&&B.req===r1&&hint()==='');
T+=1000; key('KeyP'); flush(); chk('P (é gesto) retoma capturado',g.state==='play'&&B.locked);

// ---------- mochila ----------
key('Tab'); flush(); chk('Tab abre a mochila: cursor livre e sem pausa',g.state==='inventory'&&!B.locked&&ui.pack);
key('Tab'); flush(); chk('Tab fecha: recapturado',g.state==='play'&&B.locked&&!ui.pack);
key('Tab'); flush(); key('Escape'); flush(); chk('Esc fecha a mochila: recaptura sem gesto (a página soltou o mouse)',g.state==='play'&&B.locked);
key('Tab'); flush(); key('Tab'); key('Tab'); flush();
chk('Tab ×3 rápido: captura que chega atrasada é desfeita na mochila',g.state==='inventory'&&!B.locked&&ui.pack);
key('Tab'); flush(); chk('fechar de novo → recapturado',g.state==='play'&&B.locked);

// ---------- clique com o cursor solto (Esc logo após fechar a mochila cai na janela de 400 ms) ----------
key('Tab'); flush(); key('Tab'); flush(); T+=100; userEsc(); const l0=looks.length;
mouse('mousemove'); chk('cursor solto em jogo: a câmera não segue o mouse',g.state==='play'&&!B.locked&&looks.length===l0);
T+=2000; mouse('mousedown'); flush(); chk('clique recaptura sem agarrar',B.locked&&grabs.length===0);
mouse('mousedown'); mouse('mouseup'); chk('com o mouse capturado o clique agarra e solta normalmente',grabs.length===2&&grabs[0][1]===true&&grabs[1][1]===false);

// ---------- dez ciclos de pausa e retomada ----------
const r2=B.req;
for(let i=0;i<10;i++){ T+=3000; userEsc(); T+=1500; click('btnResume'); flush(); }
chk('10 ciclos: termina capturado, 1 pedido por ciclo, nenhum listener novo',g.state==='play'&&B.locked&&B.req===r2+10&&listeners===wired,`· ${B.req-r2} pedidos, ${listeners-wired} listeners novos`);

// ---------- menu ----------
T+=3000; userEsc(); T+=1500; click('btnResume'); g.toMenu(); flush();
chk('voltar ao menu com captura pendente: confirmação é desfeita',g.state==='menu'&&!B.locked);

// ---------- espectador (comportamento antigo preservado) ----------
g.state='spectate'; gesture(()=>g.lock()); flush(); T+=1000; userEsc();
chk('espectador: Esc solta o mouse e volta ao menu',g.spectator.exits===1&&g.state==='menu'&&!B.locked);

// ---------- VR: sem Pointer Lock, a retomada é imediata ----------
g.state='play'; g.vr.busy=g.vr.active=true; const r3=B.req; g.pause(); click('btnResume');
chk('VR: Continuar retoma na hora, sem pedir captura',g.state==='play'&&B.req===r3);

log('falhas:',fails); process.exit(fails?1:0);
