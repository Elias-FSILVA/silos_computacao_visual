'use strict';
// Somente métricas de percurso; atributos e perks pertencem ao PlayerAttributes.
class PlayerStats{
  constructor(){ this.reset(); }
  reset(){
    this.slips=0; this.pillsUsed=0; this.pitonsUsed=0; this.falls=0; this.jumps=0; this.wallJumps=0;
    this.distance=0; this.maxHeight=0;
  }
  recordJump(wall=false){ wall?this.wallJumps++:this.jumps++; }
  recordSlip(){ this.slips++; }
  recordFall(){ this.falls++; }
  snapshot(){ return {...this}; }
}
