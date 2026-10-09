'use strict';
// ============================================================================
// js/items/Inventory.js — slots pequenos, acesso rápido
// Atalhos de equipamento (teclas 1–4): `binds[k]` guarda o ID de um item que está em `slots`.
// O vínculo não copia nada: o slot real é sempre resolvido por boundSlot(k).
// ============================================================================
// Teclas dos atalhos. Fonte única: Game.js (entrada) e UIManager.js (rótulos e layout) leem esta tabela.
// A ordem define o lugar de cada atalho na mochila: 1 em cima, 2 à direita, 3 embaixo, 4 à esquerda.
const QUICK_KEYS=[
  {code:'Digit1',label:'1',place:'superior'},
  {code:'Digit2',label:'2',place:'direita'},
  {code:'Digit3',label:'3',place:'inferior'},
  {code:'Digit4',label:'4',place:'esquerda'}
];

class Inventory{
  constructor(size=4,quick=QUICK_KEYS.length){ this.size=size; this.quick=Math.min(quick,QUICK_KEYS.length); this.reset(); }
  reset(){ this.slots=new Array(this.size).fill(null); this.binds=new Array(this.quick).fill(null); this.version=(this.version||0)+1; }
  add(id,count=1){
    const d=ITEM_DEFS[id]; let i=this.slots.findIndex(s=>s&&s.id===id);
    if(i>=0&&d.stack) this.slots[i].count+=count;
    else if(i>=0) return i;
    else { i=this.slots.findIndex(s=>!s); if(i<0) return -1; this.slots[i]={id,count:d.stack?count:1}; }
    this.version++; return i;
  }
  slotOf(id){ return this.slots.findIndex(s=>s&&s.id===id); }
  count(id){ const s=this.slots.find(s=>s&&s.id===id); return s?s.count:0; }
  has(id){ return this.slotOf(id)>=0; }
  take(id,n=1){ const s=this.slots.find(s=>s&&s.id===id); if(!s||s.count<n) return false; s.count-=n; this.version++; return true; }
  // ---- atalhos ----
  // Vincula o item `id` ao atalho k. Um item ocupa um atalho só: se já estava em outro (j), o vínculo é transferido
  // e o item que ocupava k (se houver) passa a ocupar j. Nunca consome nem duplica unidades.
  bind(k,id){
    if(!(k>=0&&k<this.quick)||!this.has(id)) return false;
    const j=this.binds.indexOf(id), old=this.binds[k];
    if(j>=0&&j!==k) this.binds[j]=old;
    this.binds[k]=id; this.version++; return true;
  }
  unbind(k){ if(k>=0&&k<this.quick&&this.binds[k]){ this.binds[k]=null; this.version++; return true; } return false; }
  bindingOf(id){ return this.binds.indexOf(id); }
  // índice do slot real apontado pelo atalho k, ou -1 (vazio ou item que deixou de existir: o vínculo é limpo)
  boundSlot(k){
    const id=this.binds[k]; if(!id) return -1;
    const i=this.slotOf(id);
    if(i<0){ this.binds[k]=null; this.version++; }
    return i;
  }
  // compatibilidade com código antigo que lia inventory.pitons / pills / hammer
  get pitons(){ return this.count('nails'); } get pills(){ return this.count('pills'); } get hammer(){ return this.has('hammer'); }
}