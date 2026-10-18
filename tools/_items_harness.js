'use strict';
// Harness com Three.js REAL para testar ItemSystem/Inventory/Player (mãos com HandModel procedural, sem DOM).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');
const ROOT=path.join(__dirname,'..');
module.exports=function harness(extra=[]){
  const noopCtx=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createRadialGradient'||k==='createLinearGradient'?()=>({addColorStop(){}}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}):()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
  const clock={now:0};
  const ctx=vm.createContext({THREE,console,performance:{now:()=>clock.now},document:{createElement:()=>({width:0,height:0,getContext:()=>noopCtx})},
    Models:{get(){return null},clips(){return []}},NAIL_REACH:1.8,setTimeout:()=>0,Image:class{ set src(v){} },Math:Object.assign(Object.create(Math),{random:()=>.5})});
  const load=f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
  for(const f of ['js/core/utils.js','js/world/surfaces.js','js/world/Collision.js','js/player/Handedness.js','js/items/climbingAxeAsset.js','js/items/itemDefs.js','js/items/Inventory.js','js/items/ItemSystem.js','js/player/HandWear.js','js/player/HandModel.js','js/player/AxeContactPose.js',
    'js/player/perkDefs.js','js/player/PlayerAttributes.js','js/player/PlayerStats.js','js/player/PlayerHealth.js','js/player/Player.js',...extra]) load(f);
  try{ load('js/ui/UIManager.js'); }catch(e){ /* UIManager só é necessário nos testes de interface */ }
  const G=n=>vm.runInContext(n,ctx);
  const audio=new Proxy({calls:[]},{get:(t,k)=>k in t?t[k]:(t[k]=function(){ t.calls.push(k); })});
  function realPlayer(){
    const Player=G('Player'), cam=new THREE.PerspectiveCamera(), scene=new THREE.Scene(); scene.add(cam);
    const p=new Player(scene,cam,{spawnPoint:new THREE.Vector3(0,5,.5),spawnYaw:0,platforms:[],raycastTargets:[],touch(){}});
    cam.position.set(0,1.6,0); cam.updateMatrixWorld(true); return p;
  }
  function makeGame(p=realPlayer()){
    const msgs=[], calls=[];
    const g={player:p,audio,ui:{msg(t){ msgs.push(t); }},vr:{active:false},interaction:{itemTarget:()=>null},msgs,calls};
    audio.calls=[];
    const it=new (G('ItemSystem'))(g); g.items=it; return {g,it,p,msgs};
  }
  function settle(h,max=120){ for(let n=0;n<max&&(h.phase==='equipping'||h.phase==='holstering');n++){ clock.now+=1000/60; h._updateLocal(1/60); } }
  function step(it,n=1,dt=1/60){ for(let k=0;k<n;k++){ clock.now+=dt*1000; it.update(dt); } }
  return {THREE,ctx,G,load,clock,audio,realPlayer,makeGame,settle,step};
};
