'use strict';
// ============================================================================
// js/items/Inventory.js — slots pequenos, acesso rápido
// ============================================================================
class Inventory{
  constructor(size=4){ this.size=size; this.reset(); }
  reset(){ this.slots=new Array(this.size).fill(null); this.version=(this.version||0)+1; }
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
  // compatibilidade com código antigo que lia inventory.pitons / pills / hammer
  get pitons(){ return this.count('nails'); } get pills(){ return this.count('pills'); } get hammer(){ return this.has('hammer'); }
}
