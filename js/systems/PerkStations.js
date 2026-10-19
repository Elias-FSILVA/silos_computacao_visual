'use strict';
// ============================================================================
// js/systems/PerkStations.js — estações de melhoria: ofertas, escolha, limite e estado da partida (módulo PURO)
// Sem DOM, sem mundo: só lê/escreve PlayerAttributes (que aplica os efeitos). O interativo (PerkStation) e a
// interface só consultam este módulo.
//   ofertas: no começo de cada subida (construtor e reset) cada estação sorteia 2 perks do próprio pool, sem repetir
//   perk entre as estações da subida; ficam fixas até a próxima subida (ignorar/reabrir não re-sorteia). Perk já ativo
//   (console) sai da oferta. Pools: E1 só gerais; E2 + Âncora; E3 + Âncora, Fôlego fundo e Corpo leve (os fortes)
//   escolher consome a estação só se addPerk der certo (atômico); Ignorar não consome; limite de 3 perks pela aquisição
//   (o console pode passar do limite — aí a estação mostra o aviso e não é consumida)
// ============================================================================
const MAX_RUN_PERKS=3;
const STATION_RULE='Vale até o fim da subida. Ignorar não gasta a estação.';   // texto fixo do painel (desktop e VR)
const GENERAL_PERKS=Object.freeze(['economical_grip','quick_recovery','powerful_launch','long_arms','calloused_hands','short_breath','economical_launch']);
const STATION_DEFS=Object.freeze({
  E1:Object.freeze({id:'E1',cp:'cp4',label:'Sala de controle',pool:GENERAL_PERKS}),
  E2:Object.freeze({id:'E2',cp:'cp8',label:'Mezanino',pool:Object.freeze([...GENERAL_PERKS,'anchor'])}),
  E3:Object.freeze({id:'E3',cp:'cp14',label:'Cabine de guincho',pool:Object.freeze([...GENERAL_PERKS,'anchor','deep_breath','light_body'])})
});
const OFFERS_PER_STATION=2;
class PerkStations{
  // preset ({E1:[ids],…}) fixa as ofertas de toda subida, sem sorteio (testes e cenários)
  constructor(attributes,{defs=STATION_DEFS,max=MAX_RUN_PERKS,rng=Math.random,preset=null}={}){
    this.attributes=attributes; this.defs=defs; this.max=max; this.rng=rng; this.preset=preset; this.used=new Set(); this._draw();
  }
  reset(){ this.used.clear(); this._draw(); }
  // sorteio da subida, na ordem das estações (E1, E2, E3): os fortes do fim continuam disponíveis para a E3
  _draw(){
    const taken=new Set(); this.drawn={};
    if(this.preset){ for(const id of Object.keys(this.defs)) this.drawn[id]=Object.freeze([...(this.preset[id]||[])]); return; }
    for(const [id,d] of Object.entries(this.defs)){
      const left=(d.pool||[]).filter(p=>!taken.has(p)), pick=[];
      while(pick.length<OFFERS_PER_STATION&&left.length){ const k=Math.min(left.length-1,Math.floor(this.rng()*left.length)); pick.push(left.splice(k,1)[0]); }
      pick.forEach(p=>taken.add(p)); this.drawn[id]=Object.freeze(pick);
    }
  }
  isUsed(id){ return this.used.has(id); }
  offers(id){ const o=this.drawn[id]; if(!o) return []; return o.filter(p=>!this.attributes.hasPerk(p)); }
  canChoose(id){
    if(!this.defs[id]) return {ok:false,reason:'empty'};
    if(this.used.has(id)) return {ok:false,reason:'used'};
    if(this.attributes.activePerks.length>=this.max) return {ok:false,reason:'limit'};
    if(!this.offers(id).length) return {ok:false,reason:'empty'};
    return {ok:true,reason:null};
  }
  choose(id,perkId){
    const c=this.canChoose(id); if(!c.ok) return c;
    if(!this.offers(id).includes(perkId)) return {ok:false,reason:'not_offered'};
    if(!this.attributes.addPerk(perkId)) return {ok:false,reason:'rejected'};
    this.used.add(id); return {ok:true,reason:null};
  }
}
