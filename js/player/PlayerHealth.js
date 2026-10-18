// js/player/PlayerHealth.js — vida do jogador: fonte única do HP (dono: Player).
// HP inteiro 0–100, sem regeneração. HUD, VR, mãos e console só leem; dano entra por Player.damage(),
// e a morte continua saindo só por Player.die(). Independente de stamina e fadiga.
class PlayerHealth{
  constructor(max=100){ this.max=max; this._seq=0; this.reset(); }
  reset(){ this.value=this.max; this.lastChange=null; }
  get state(){ return PlayerHealth.stateOf(this.value); }
  snapshot(){ return {value:this.value,max:this.max,state:this.state}; }
  _note(amount,source){ this.lastChange={amount,source:source||null,t:++this._seq}; }
  // dano arredondado ao inteiro; ignora não-finito/≤0 e jogador já morto; trava em 0
  damage(amount,{source}={}){
    const n=typeof amount==='number'&&Number.isFinite(amount)?Math.round(amount):0;
    if(n<=0||this.value<=0) return {applied:0,value:this.value,died:false};
    const applied=Math.min(n,this.value); this.value-=applied; this._note(-applied,source);
    return {applied,value:this.value,died:this.value===0};
  }
  heal(amount,{source}={}){
    const n=typeof amount==='number'&&Number.isFinite(amount)?Math.round(amount):0;
    if(n<=0||this.value<=0) return {applied:0,value:this.value};
    const applied=Math.min(n,this.max-this.value); if(applied>0){ this.value+=applied; this._note(applied,source); }
    return {applied,value:this.value};
  }
  // só inteiros 1..max (zerar é papel de damage/die)
  set(value,{source}={}){
    if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>this.max) return {ok:false,value:this.value,reason:`aceita inteiros de 1 a ${this.max}`};
    const d=value-this.value; this.value=value; if(d) this._note(d,source);
    return {ok:true,value:this.value};
  }
  // morte instantânea (massa, pás, queda letal): vai a 0 sem contar como dano
  // se um dano já zerou, mantém o golpe fatal como última mudança
  zero(reason){ if(this.value===0&&this.lastChange) return; this.value=0; this._note(0,reason); }
  static stateOf(v){ return v<=0?'dead':v<=25?'critical':v<=50?'injured':v<=75?'hurt':'healthy'; }
  // curva provisória (spec §11 D4 — não alterar sem o usuário): até 10 m/s nada; 10–16 cresce de 8 a 70; acima, 70
  static impactDamage(speed){
    if(typeof speed!=='number'||!(speed>PlayerHealth.IMPACT_SAFE)) return 0;
    const k=(Math.min(speed,PlayerHealth.IMPACT_CAP)-PlayerHealth.IMPACT_SAFE)/(PlayerHealth.IMPACT_CAP-PlayerHealth.IMPACT_SAFE);
    return Math.round(8+62*Math.pow(k,1.5));
  }
}
PlayerHealth.IMPACT_SAFE=10;
PlayerHealth.IMPACT_CAP=16;
