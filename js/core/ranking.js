'use strict';
// ============================================================================
// js/core/ranking.js — armazenamento local do ranking
// ============================================================================
class Ranking{
  constructor(key='silos.ranking.v1'){ this.key=key; this.mem=[]; }
  load(){
    if(!LS) return this.mem.slice();
    try{ const raw=JSON.parse(LS.getItem(this.key)||'[]'); return Array.isArray(raw)?raw.filter(e=>e&&typeof e.name==='string'&&typeof e.score==='number'):[]; }
    catch(e){ return []; }
  }
  save(entry){
    const list=this.load(); list.push(entry);
    list.sort((a,b)=>b.score-a.score||a.time-b.time);
    const kept=list.slice(0,20);
    if(LS){ try{ LS.setItem(this.key,JSON.stringify(kept)); }catch(e){ this.mem=kept; } } else this.mem=kept;
    return kept.indexOf(entry);
  }
  top(n=10){ return this.load().slice(0,n); }
}
