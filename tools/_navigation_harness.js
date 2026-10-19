'use strict';
// Three.js real; mocks somente de canvas/áudio, sem renderer/GPU.
const base=require('./_items_harness.js');
module.exports=function navigationHarness(){
  const h=base();
  h.ctx.window=h.ctx;
  h.ctx.document.createElement=()=>({width:0,height:0,getContext:()=>new Proxy({measureText:s=>({width:String(s).length*10}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(t,k)=>k in t?t[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:(t,k,v)=>(t[k]=v,true)})});
  for(const f of ['js/world/textures.js','js/world/assets.js','js/world/levelData.js','js/world/World.js','js/world/Halls.js','js/interaction/Interactables.js','js/world/Sectors.js','js/world/Climbs.js','js/systems/MassSystem.js','js/systems/progress.js','js/systems/PuzzleSystem.js','js/systems/HallPuzzles.js']) h.load(f);
  const scene=new h.THREE.Scene(), world=new (h.G('World'))(scene);
  const p=new (h.G('Player'))(scene,new h.THREE.PerspectiveCamera(),world);
  const mass=new (h.G('MassSystem'))(scene);
  const game={world,player:p,mass,scene};
  return {...h,world,scene,game,p,mass};
};
