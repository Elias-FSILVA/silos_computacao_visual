'use strict';
// ============================================================================
// js/systems/PerkStations.js — estações de melhoria: ofertas, escolha, limite e estado da partida (módulo PURO)
// Sem DOM, sem mundo: só lê/escreve PlayerAttributes (que aplica os efeitos). O interativo (PerkStation) e a
// interface só consultam este módulo.
//   ofertas(estação) = os 2 primeiros IDs da ordem de preferência da estação que não estão ativos (determinístico)
//   escolher consome a estação só se addPerk der certo (atômico); Ignorar não consome; limite de 3 perks pela aquisição
//   (o console pode passar do limite — aí a estação mostra o aviso e não é consumida)
// ============================================================================
const MAX_RUN_PERKS=3;
const STATION_DEFS=Object.freeze({
  E1:Object.freeze({id:'E1',cp:'cp4',label:'Sala de controle',ahead:'Adiante: andaimes e saltos sobre o poço',
    order:Object.freeze(['powerful_launch','quick_recovery','economical_grip','light_body'])}),
  E2:Object.freeze({id:'E2',cp:'cp8',label:'Mezanino',ahead:'Adiante: rachaduras longas e o vão de prego',
    order:Object.freeze(['economical_grip','quick_recovery','powerful_launch','light_body'])}),
  E3:Object.freeze({id:'E3',cp:'cp14',label:'Cabine de guincho',ahead:'Adiante: a subida final, com vento e chapas',
    order:Object.freeze(['light_body','economical_grip','quick_recovery','powerful_launch'])})
});
class PerkStations{
  constructor(attributes,{defs=STATION_DEFS,max=MAX_RUN_PERKS}={}){ this.attributes=attributes; this.defs=defs; this.max=max; this.used=new Set(); }
  reset(){ this.used.clear(); }
  isUsed(id){ return this.used.has(id); }
  offers(id){ const d=this.defs[id]; if(!d) return []; return d.order.filter(p=>!this.attributes.hasPerk(p)).slice(0,2); }
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
