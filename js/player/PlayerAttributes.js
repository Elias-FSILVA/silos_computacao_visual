'use strict';
const PLAYER_BASE_ATTRIBUTES=Object.freeze({
  gravity:18,maxStamina:100,jumpSpeed:8.2,wallJumpSpeed:9,wallJumpStaminaCost:12,
  reach:2,tiredReach:1.7,gripDrainMultiplier:1,groundRecovery:35,freeHandRecovery:12,
  fatigueGainMultiplier:1,fatigueRecoveryMultiplier:1
});

// Sem dependências de simulação/DOM. Nunca acumula multiplicações sobre o snapshot anterior.
class PlayerAttributes{
  #catalog;
  #active=new Set();
  #effective=PLAYER_BASE_ATTRIBUTES;
  #onChange;
  constructor({catalog=PERK_DEFS,onChange=null}={}){
    const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    if(!object(catalog)) throw new TypeError('Catálogo de perks inválido');
    if(onChange!==null&&typeof onChange!=='function') throw new TypeError('onChange inválido');
    const copy=Object.create(null);
    for(const [id,def] of Object.entries(catalog)){
      if(!id||!object(def)||def.id!==id||!['name','benefit','tradeoff'].every(k=>typeof def[k]==='string'&&def[k].length>0)||!object(def.multipliers))
        throw new TypeError(`Definição de perk inválida: ${id}`);
      const multipliers={};
      for(const [key,factor] of Object.entries(def.multipliers)){
        if(!Object.prototype.hasOwnProperty.call(PLAYER_BASE_ATTRIBUTES,key)||typeof factor!=='number'||!Number.isFinite(factor)||factor<=0)
          throw new TypeError(`Multiplicador inválido: ${id}.${key}`);
        multipliers[key]=factor;
      }
      copy[id]=Object.freeze({...def,multipliers:Object.freeze(multipliers)});
    }
    this.#catalog=Object.freeze(copy); this.#onChange=onChange;
  }
  get activePerks(){ return [...this.#active].sort(); }
  get effective(){ return this.#effective; }
  hasPerk(id){ return typeof id==='string'&&this.#active.has(id); }
  addPerk(id){
    if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(this.#catalog,id)||this.#active.has(id)) return false;
    return this.#publish(new Set([...this.#active,id]));
  }
  removePerk(id){
    if(!this.hasPerk(id)) return false;
    const next=new Set(this.#active); next.delete(id); return this.#publish(next);
  }
  clearPerks(){ if(this.#active.size) this.#publish(new Set()); }
  #publish(next){
    const values={...PLAYER_BASE_ATTRIBUTES};
    for(const id of [...next].sort()){
      for(const [key,factor] of Object.entries(this.#catalog[id].multipliers)){
        values[key]*=factor;
        if(!Number.isFinite(values[key])||values[key]<=0) return false;
      }
    }
    this.#active=next; this.#effective=Object.freeze(values);
    if(this.#onChange) this.#onChange(this.#effective);
    return true;
  }
}
