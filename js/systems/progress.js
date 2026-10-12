'use strict';
// ============================================================================
// js/systems/progress.js · TimerSystem
// ============================================================================
class TimerSystem{
  constructor(){ this.reset(); }
  reset(){ this.elapsedTime=0; this.running=false; this.finished=false; this.finalTime=null; }
  start(){ this.reset(); this.running=true; }
  pause(){ this.running=false; }
  resume(){ if(!this.finished) this.running=true; }
  finish(){ if(this.finished) return; this.running=false; this.finished=true; this.finalTime=this.elapsedTime; }
  update(dt){ if(this.running) this.elapsedTime+=dt; }
  get time(){ return this.finished?this.finalTime:this.elapsedTime; }
}

// ============================================================================
// js/systems/progress.js · ScoreSystem
// ============================================================================
class ScoreSystem{
  constructor(){ this.reset(); }
  reset(){ this.score=0; this.heightScore=0; this.checkpointBonus=0; this.speedBonus=0; this.performanceBonus=0; this.penalties=0; this.puzzleBonus=0; this.secretBonus=0; this.collected=[]; }
  onPuzzle(bonus){ this.puzzleBonus+=bonus; this._sum(); }
  onSecret(bonus){ this.secretBonus+=bonus; this._sum(); }
  onCheckpoint(cp){ this.checkpointBonus+=cp.bonus||0; this.collected.push(cp.id); this._sum(); }
  update(player){
    this.heightScore=Math.floor(player.maxHeightReached)*10;
    this.penalties=player.stats.slips*50+player.stats.pillsUsed*100;
    this._sum();
  }
  finalize(result,time,player){
    this.update(player);
    if(result==='finish'){
      this.speedBonus=Math.max(0,Math.round(6000-time*15));
      this.performanceBonus=(player.stats.slips===0?600:0)+(player.stats.pillsUsed===0?400:0);
    }
    this._sum(); return this.breakdown();
  }
  breakdown(){ return {height:this.heightScore,checkpoints:this.checkpointBonus,puzzle:this.puzzleBonus,secrets:this.secretBonus,speed:this.speedBonus,performance:this.performanceBonus,penalties:this.penalties,total:this.score}; }
  _sum(){ this.score=Math.max(0,this.heightScore+this.checkpointBonus+this.puzzleBonus+this.secretBonus+this.speedBonus+this.performanceBonus-this.penalties); }
}

// ============================================================================
// js/systems/progress.js · CheckpointSystem — consome world.checkpoints e world.finish
// ============================================================================
class CheckpointSystem{
  constructor(world){ this.world=world; this.reset(); }
  reset(){ this.collected=new Set(); this.current=null; this.justCollected=null; this.finishReached=false; }
  update(player){
    this.justCollected=null; const p=player.position;
    for(const cp of this.world.checkpoints){
      if(this.collected.has(cp.id)) continue;
      let inside;
      if(cp.bounds){ const b=cp.bounds; inside=player.grounded&&Math.abs(p.y-b.top)<.2&&solidInXZ(b,p.x,p.z,RAD); }   // borda reta, girada ou curva
      else inside=cp.position.distanceTo(p)<=cp.radius;
      if(inside){ this.collected.add(cp.id); if(!cp.optional) this.current=cp; this.justCollected=cp; break; }
    }
    const f=this.world.finish;
    if(!this.finishReached&&f&&player.grounded&&Math.abs(p.y-f.position.y)<.25&&Math.hypot(p.x-f.position.x,p.z-f.position.z)<=f.radius) this.finishReached=true;
    return {justCollected:this.justCollected,finished:this.finishReached};
  }
}
