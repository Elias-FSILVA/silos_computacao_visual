const log=console.log; console.log=()=>{};
const {V3,Obj}=require('./_load.js'); console.log=log;
const vm=require('vm'), fs=require('fs'), path=require('path');
const scene=new Obj(); const world=vm.runInThisContext('(s)=>new World(s)')(scene);
const ok=(k,v)=>log(k.padEnd(52),v);
// ---- mundo: fantasma ----
const total=world.cutaway.length; world.setCutaway(true);
const ghost=world.cutaway.filter(m=>m.material===world._ghostMat).length; world.setCutaway(false);
const back=world.cutaway.filter(m=>m.material!==world._ghostMat&&!m.userData.origMat).length;
ok('caixas fantasma (paredes + tetos)',total+' → '+ghost+' fantasma · restauradas '+back+'/'+total);
// ---- mundo: rota ----
world.setRouteGuide(true); const g=world._routeGuide; ok('rota: segmentos / visível',g.children.length+' / '+g.visible); world.setRouteGuide(false); ok('rota oculta',!g.visible);
// ---- mundo: tela em preview não dispara contagem ----
const S=world.mazeScr; world.setSpectator(true); world.update(.1,{position:new V3(0,300,-6.2)}); ok('espectador: tela fica em',S.state+' (esperado preview)');
world.setSpectator(false); ok('ao sair volta a',S.state+' (esperado wait)');
// ---- câmera ----
const noopCtx=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
global.document={createElement:()=>({style:{},hidden:true,width:0,height:0,getContext:()=>noopCtx}),body:{appendChild(){}}};
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js/systems/SpectatorMode.js'),'utf8'));
const head={isLight:true,intensity:.45,distance:7};
const cam={children:[head],far:200,position:new V3(),rotation:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},updateProjectionMatrix(){},updateMatrixWorld(){}};
const calls=[]; const fog={density:.06,color:{setHex(){}}};
const game={camera:cam,keys:{},state:'menu',scene:{fog,background:{setHex(){}}},atmosphere:{ambient:{intensity:.55}},world,
  ui:{hideScreens(){},setHUD(){},clearMsg(){}},player:{viewmodelVisible:true,updateViewmodel(){}},lock(){calls.push('lock');},toMenu(){calls.push('toMenu');}};
const sp=vm.runInThisContext('(g)=>new SpectatorMode(g)')(game);
sp.enter(); ok('entrar: estado / far / luz total',game.state+' / '+cam.far+' / amb '+game.atmosphere.ambient.intensity+' · tela '+S.state);
let worst=1; for(const v of SPEC_VIEWS){ sp.goto(v); const d=[v.to[0]-v.from[0],v.to[1]-v.from[1],v.to[2]-v.from[2]], L=Math.hypot(...d);
  const cp=Math.cos(sp.pitch), f=[-Math.sin(sp.yaw)*cp,Math.sin(sp.pitch),-Math.cos(sp.yaw)*cp]; worst=Math.min(worst,(f[0]*d[0]+f[1]*d[1]+f[2]*d[2])/L); }
ok('vistas prontas apontam para o alvo (cos ≥ .9999)',worst.toFixed(6));
sp.goto(SPEC_VIEWS[5]); const p0=sp.pos.clone(); game.keys={KeyW:true}; sp.update(1); ok('W avança ~10 m na direção do olhar',p0.distanceTo(sp.pos).toFixed(2)+' m');
game.keys={KeyW:true,ShiftLeft:true}; const p1=sp.pos.clone(); sp.update(1); ok('Shift ×4',p1.distanceTo(sp.pos).toFixed(2)+' m');
game.keys={Space:true}; const y0=sp.pos.y; sp.update(1); game.keys={KeyC:true}; sp.update(1); ok('Espaço sobe / C desce',(sp.pos.y-y0).toFixed(2)+' (esperado ≈0 após subir e descer)');
sp.key({code:'KeyX',repeat:false,preventDefault(){}}); ok('X desliga fantasma',world.cutaway.every(m=>m.material!==world._ghostMat));
sp.key({code:'KeyR',repeat:false,preventDefault(){}}); ok('R liga rota',world._routeGuide&&world._routeGuide.visible);
sp.key({code:'KeyL',repeat:false,preventDefault(){}}); ok('L apaga luz total → ambiente',game.atmosphere.ambient.intensity);
sp.wheel(-100); ok('roda aumenta velocidade',sp.speed.toFixed(1));
sp.key({code:'Escape',repeat:false,preventDefault(){}}); ok('Esc restaura far / luz / menu',cam.far+' / '+head.intensity+' / '+game.atmosphere.ambient.intensity+' / '+calls.join(','));
ok('tela voltou a esperar (sem queimar a contagem)',S.state);
// ---- marcadores / seções ----
sp.active=false; sp.enter();
world.setLabels(true); const L=world._labels; const n=L.children.length; ok('marcadores criados (partes + régua)',n+' · visíveis '+L.visible);
sp.key({code:'KeyM',repeat:false,preventDefault(){}}); ok('M esconde os marcadores',!world._labels.visible);
sp.key({code:'KeyM',repeat:false,preventDefault(){}}); ok('M mostra de novo',world._labels.visible);
ok('seção em 50 m / 105 m / 205 m / 305 m / 350 m',[50,105,205,305,350].map(y=>sp._section(y).split(' (')[0]).join(' | '));
sp.pos.set(0,305,-15); sp._hud(true); ok('HUD linha 1',sp.hud.textContent.split('\n')[0]);
sp.exit(); ok('ao sair os marcadores somem',!world._labels.visible);
