'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const {V3}=require('./_load.js');
global.V3=V3; global.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
global.TOP=400;
global.document={createElement:()=>({style:{},hidden:true}),body:{appendChild(){}}};
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js/systems/SpectatorMode.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js/Game.js'),'utf8'));
const GameClass=vm.runInThisContext('Game');
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('OK',name);}catch(e){failed++;console.error('FAIL',name,'-',e.message);}}
function fixture(state){
  const calls=[],head={isLight:true,intensity:.45,distance:7},camera={children:[head],far:200,updateProjectionMatrix(){}};
  const game={state,camera,keys:{KeyW:true},scene:{fog:{density:.06,color:{setHex(){}}},background:{setHex(){}}},atmosphere:{ambient:{intensity:.55}},
    world:{setSpectator(){},setCutaway(){},setRouteGuide(){},setLabels(){}},
    player:{viewmodelVisible:true,updateViewmodel(){calls.push('viewmodel');}},ui:{hideScreens(){calls.push('hideScreens');},setHUD(v){calls.push(['hud',v]);},clearMsg(){},show(s){calls.push(['show',s]);}},
    timer:{pause(){calls.push('timer.pause');},resume(){calls.push('timer.resume');}},lock(){calls.push('lock');},unlock(){calls.push('unlock');},toMenu(){calls.push('toMenu');this.state='menu';}};
  Object.setPrototypeOf(game,GameClass.prototype);
  return {game,calls,camera};
}
test('spectator restores the in-progress session instead of sending it to menu',()=>{
  const {game,calls}=fixture('play'),mode=new SpectatorMode(game);mode.enter();
  if(game.state!=='spectate')throw Error(`expected spectate, got ${game.state}`);
  mode.exit();
  if(game.state!=='play')throw Error(`expected play, got ${game.state}`);
  for(const expected of ['timer.pause','timer.resume','hideScreens','lock'])if(!calls.includes(expected))throw Error(`missing ${expected}: ${JSON.stringify(calls)}`);
  if(!game.player.viewmodelVisible)throw Error('player viewmodel was not restored');
});
test('spectator records and returns to the prior non-game state',()=>{
  const {game,calls}=fixture('paused'),mode=new SpectatorMode(game);mode.enter();mode.exit();
  if(game.state!=='paused'||!calls.some(c=>Array.isArray(c)&&c[0]==='show'&&c[1]==='pause'))throw Error(JSON.stringify(calls));
  if(calls.includes('timer.resume'))throw Error('paused session timer resumed');
});
console.log(`${passed+failed} testes; falhas: ${failed}`);process.exit(failed?1:0);
