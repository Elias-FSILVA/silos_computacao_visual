const log=console.log; console.log=()=>{};
const {V3,Obj}=require('./test_mundo.js'); console.log=log;
const vm=require('vm');
const scene=new Obj(); const world=vm.runInThisContext('(s)=>new World(s)')(scene);
const calls=[]; const noop=new Proxy({},{get:(t,k)=>(...a)=>{ if(k==='setHold'||k==='releaseHold') calls.push(k); }});
const mass={y:20,mesh:{material:{}},setHold(cap,s){ calls.push('hold@'+cap.toFixed(1)); this.cap=cap; },releaseHold(){ calls.push('release'); },active:true};
const game={world,mass,player:{position:new V3(0,0,0),addShake(){}},audio:new Proxy({},{get:()=>()=>{}}),ui:{msg(){}},fx:{spawn(){}},score:{onPuzzle(v){ calls.push('score'+v); }}};
const sys=vm.runInThisContext(`(g)=>{ const w=g.world; return w.puzzleDefs.map(d=>d.kind==='containment'?new ContainmentPuzzle(g,w.puzzleRooms[d.id]):d.kind==='maze'?new MazePuzzle(g,w.puzzleRooms[d.id]):null); }`)(game);
const [p1,p2,mz]=sys; const ok=(k,v)=>log(k.padEnd(46),v);
// ---- sala 2 (200 m, espelhada): gatilho, código invertido, solução ----
mass.y=176; game.player.position.set(-2.0,200.1,-6.0);
for(let i=0;i<60;i++) p2.update(.1);
ok('pz200 gatilho: fase / hold cap (esperado 200.3)',p2.phase+' / '+mass.cap.toFixed(1));
for(const k of '296') p2.press(k); p2.press('OK');
ok('pz200 código 296 resolve',p2.solved);
const q=sys[0]; q.input=''; for(const k of '174') q.press(k); q.press('OK'); ok('pz100 código 174 sem ativar fica "resolvido" só se logo',q.solved);
// código errado (ordem direta na sala 2)
const fresh=vm.runInThisContext(`(g)=>new ContainmentPuzzle(g,g.world.puzzleRooms.pz200)`)(game); for(const k of '629') fresh.press(k); fresh.press('OK'); ok('pz200 ordem direta (629) é negada',!fresh.solved);
// ---- falha → rompimento → enchente na altura certa ----
const p3=vm.runInThisContext(`(g)=>new ContainmentPuzzle(g,g.world.puzzleRooms.pz200)`)(game); game.player.position.set(-2.0,200.1,-6.0); mass.y=176;
for(let i=0;i<1500;i++){ p3.update(.1); if(p3.phase==='breached') break; }
ok('pz200 sem resolver → fase',p3.phase+' · timeRemaining '+p3.timeRemaining.toFixed(0));
mass.y=205; for(let i=0;i<40;i++) p3.update(.1);
ok('enchente criada na altura (≈199 → mín(y,204.5))',p3.flood?p3.flood.parts.map(m=>m.position.y.toFixed(1)).join(', '):'sem enchente');
// ---- labirinto ----
const R=world.puzzleRooms.mz300; calls.length=0; mass.y=280;
game.player.position.set(0,300.1,-3.6); mz.update(.1); ok('maze: no poço → fase',mz.phase);
game.player.position.set(0,300.1,-8.0); mz.update(.1); ok('maze: dentro da sala → fase / hold cap (esperado 294)',mz.phase+' / '+mass.cap.toFixed(1));
game.player.position.set(2.4,303.0,-27.0); mz.update(.1); ok('maze: duto → resolvido / chamadas',mz.solved+' / '+calls.join(','));
// ---- zonas de segurança lidas pelo Game._zones ----
const zones=Object.values(world.puzzleRooms).flatMap(r=>[r.zoneRoom,r.zoneDuct].filter(Boolean)); ok('zonas seguras (Game._zones)',zones.length);
const inb=(p,z)=>p.x>=z.minX&&p.x<=z.maxX&&p.z>=z.minZ&&p.z<=z.maxZ&&p.y>=z.minY&&p.y<=z.maxY;
ok('sala secreta cobre ponto (-10,1,0)',zones.some(z=>inb({x:-10,y:1,z:0},z)));
ok('túnel do labirinto cobre (2.4,311,-15)',zones.some(z=>inb({x:2.4,y:311,z:-15},z)));
ok('poço NÃO é zona segura (0,150,0)',!zones.some(z=>inb({x:0,y:150,z:0},z)));
