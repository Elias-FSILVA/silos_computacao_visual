'use strict';
// ============================================================================
// js/core/ranking.js — armazenamento local do ranking
// ============================================================================
// run com goto/back/noclip: a pontuação é só diagnóstica (Game, resultado desktop/VR e o próprio Ranking recusam)
const ASSISTED_RUN_MSG='Run assistida por debug — pontuação não competitiva';
class Ranking{
  // segunda barreira, independente do Game: entradas declaradas assistidas nunca são gravadas nem listadas; legados sem metadados valem
  static eligible(e){ return !!e&&e.assisted!==true&&e.competitiveEligible!==false; }
  constructor(key='silos.ranking.v1'){ this.key=key; this.mem=[]; }
  load(){
    if(!LS) return this.mem.filter(Ranking.eligible);
    try{ const raw=JSON.parse(LS.getItem(this.key)||'[]'); return Array.isArray(raw)?raw.filter(e=>e&&typeof e.name==='string'&&typeof e.score==='number'&&Ranking.eligible(e)):[]; }
    catch(e){ return []; }
  }
  save(entry){
    if(!Ranking.eligible(entry)) return -1;
    const list=this.load(); list.push(entry);
    list.sort((a,b)=>b.score-a.score||a.time-b.time);
    const kept=list.slice(0,20);
    if(LS){ try{ LS.setItem(this.key,JSON.stringify(kept)); }catch(e){ this.mem=kept; } } else this.mem=kept;
    return kept.indexOf(entry);
  }
  top(n=10){ return this.load().slice(0,n); }
}
