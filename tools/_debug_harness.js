'use strict';
// Real World/Player/puzzles/items/Three.js; only renderer, UI and sound are presentation doubles.
const base=require('./_navigation_harness.js');
module.exports=function debugHarness(){
  const h=base(),{G,game:g,p,world:w,THREE}=h;
  for(const f of ['js/core/renderConfig.js','js/world/SectorManager.js','js/systems/NavigationSafety.js','js/systems/ProgressionGuard.js','js/systems/PresenceObservers.js','js/systems/DeveloperNavigation.js'])h.load(f);
  Object.assign(g,{camera:p.camera,audio:h.audio,ui:{messages:[],msg(t){this.messages.push(t)}},vr:{active:false,entering:false},fx:{spawn(){}},settings:{data:{quality:'medium',viewDistance:'normal',sensitivity:1,invertY:false}},renderer:{initTexture(){}},state:'play',keys:{},gameBtn:{}});
  g.scene.add(g.camera);
  g.timer=new (G('TimerSystem'))();g.timer.start();g.score=new (G('ScoreSystem'))();g.checkpoints=new (G('CheckpointSystem'))(w);
  g.puzzles=new (G('PuzzleSystem'))(g);g.puzzles.reset();g.items=new (G('ItemSystem'))(g);
  g.interaction={itemTarget:()=>null};g.sectors=new (G('SectorManager'))(g);g.sectors.setProfile(G('RenderProfile').resolve(g.settings.data,false));
  g.debugNavigation=new (G('DeveloperNavigation'))(g);
  // Controlled wall clock: real callbacks can be observed independently from simulation dt.
  const jobs=[];h.ctx.setTimeout=(callback,ms)=>{jobs.push({callback,at:h.clock.now+ms});return jobs.length;};
  const wall={advance(ms){h.clock.now+=ms;for(let i=jobs.length-1;i>=0;i--)if(jobs[i].at<=h.clock.now){const [job]=jobs.splice(i,1);job.callback();}},pending:jobs};
  h.load('js/interaction/InteractionSystem.js');h.load('js/Game.js');Object.setPrototypeOf(g,G('Game').prototype);
  const presentation={renders:0,hud:0,ticks:0,atmosphere:0,fx:0};
  Object.assign(g,{last:0,vt:0,menuT:0,playerName:'Teste',result:null,flashlight:{intensity:0},flashOn:null,flashAuto:false,
    atmosphere:{update(){presentation.atmosphere++;}},perf:{frame(){}},interaction:new (G('InteractionSystem'))(g)});
  Object.assign(g.fx,{update(){presentation.fx++;},clear(){}});
  Object.assign(g.ui,{tick(){presentation.ticks++;},updateHUD(){presentation.hud++;},toast(){}});
  g.renderer.render=()=>{presentation.renders++;};
  h.ctx.console={...console,error(e){throw e;}};
  return {...h,g,nav:g.debugNavigation,wall,presentation};
};
