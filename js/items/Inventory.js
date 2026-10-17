'use strict';
// ============================================================================
// js/items/Inventory.js — armazenamento, limites de pilha, atalhos 1–4 e peso carregado
//
// CONFIGURAÇÃO (único lugar): INVENTORY_CONFIG
//   slots             entradas reais de armazenamento (item único ou pilha ocupam UMA entrada)
//   defaultStackLimit limite de unidades por pilha para itens empilháveis que não declaram `maxStack`
//   defaultWeight     peso por unidade para itens que não declaram `weight` (e aviso no console)
//
// METADADOS LIDOS DE ITEM_DEFS (nada aqui é específico de martelo, pregos, pílulas ou cartão):
//   stack     true = empilhável · false/ausente = item único (1 unidade por entrada, sem duplicata)
//   maxStack  limite da pilha (inteiro ≥ 1); só vale para itens com stack:true
//   weight    peso por unidade, em unidades de carga (número ≥ 0)
//
// PESO: totalWeight / getTotalWeight() é DERIVADO de `slots` a cada consulta (10 entradas: custo desprezível),
// logo não existe cache nem cópia para ficar desatualizada. Os atalhos (`binds`) guardam só IDs e nunca entram na soma.
// O peso NÃO é lido por nenhuma mecânica de gameplay nesta etapa; Player pode consultar player.inventory.totalWeight.
// ============================================================================
const INVENTORY_CONFIG={ slots:10, defaultStackLimit:10, defaultWeight:1 };

// Teclas dos atalhos. Fonte única: Game.js (entrada) e UIManager.js (rótulos e layout) leem esta tabela.
// Slots 1–2 pertencem à mão esquerda; 3–4 à direita. Cada mão pode ter até dois itens vinculados.
// Item perHand (picareta): pode ter UM vínculo em cada grupo; os demais itens têm um vínculo só.
const QUICK_KEYS=[
  {code:'Digit1',label:'1',place:'superior esquerda'},
  {code:'Digit2',label:'2',place:'inferior esquerda'},
  {code:'Digit3',label:'3',place:'superior direita'},
  {code:'Digit4',label:'4',place:'inferior direita'}
];

// ---- leitura dos metadados dos itens (valores inválidos caem no padrão, com aviso de desenvolvimento) ----
const _itemWarned=new Set();
function _warnItem(id,msg){ const k=id+'|'+msg; if(_itemWarned.has(k)) return; _itemWarned.add(k); console.warn(`[Inventory] item "${id}": ${msg}`); }
// unidades máximas numa entrada: 1 para item único; maxStack (ou o padrão) para empilháveis
function itemStackLimit(id){
  const d=ITEM_DEFS[id]; if(!d||!d.stack) return 1;
  if(d.maxStack==null) return INVENTORY_CONFIG.defaultStackLimit;
  if(Number.isInteger(d.maxStack)&&d.maxStack>=1) return d.maxStack;
  _warnItem(id,`maxStack inválido (${d.maxStack}); usando o padrão ${INVENTORY_CONFIG.defaultStackLimit}.`);
  return INVENTORY_CONFIG.defaultStackLimit;
}
// peso de UMA unidade
function itemWeight(id){
  const d=ITEM_DEFS[id]; if(!d) return 0;
  if(d.weight==null){ _warnItem(id,`sem "weight" em ITEM_DEFS; usando o peso padrão ${INVENTORY_CONFIG.defaultWeight}.`); return INVENTORY_CONFIG.defaultWeight; }
  if(Number.isFinite(d.weight)&&d.weight>=0) return d.weight;
  _warnItem(id,`weight inválido (${d.weight}); usando o peso padrão ${INVENTORY_CONFIG.defaultWeight}.`);
  return INVENTORY_CONFIG.defaultWeight;
}

class Inventory{
  constructor(size=INVENTORY_CONFIG.slots,quick=QUICK_KEYS.length){ this.size=size; this.quick=Math.min(quick,QUICK_KEYS.length); this.reset(); }
  reset(){ this.slots=new Array(this.size).fill(null); this.binds=new Array(this.quick).fill(null); this.version=(this.version||0)+1; }
  // ---- coleta ----
  // Tenta guardar `count` unidades de `id`, respeitando espaços, limite de pilha e itens únicos.
  // Devolve {accepted, remaining, index, reason}:
  //   accepted  unidades realmente guardadas · remaining  unidades que NÃO couberam (quem chamou decide o que fazer com elas)
  //   index     entrada usada (ou já existente), -1 se não há
  //   reason    null (tudo coube) | 'limit' (pilha ou item único no limite) | 'duplicate' (item único já possuído)
  //             | 'full' (sem entrada livre) | 'invalid' (item desconhecido ou quantidade inválida)
  receive(id,count=1){
    const d=ITEM_DEFS[id], want=Math.floor(count);
    if(!d||!(want>=1)) return {accepted:0,remaining:want>=1?want:0,index:-1,reason:'invalid'};
    const limit=itemStackLimit(id); let i=this.slotOf(id);
    if(i>=0){
      if(!d.stack) return {accepted:0,remaining:want,index:i,reason:'duplicate'};
      const room=Math.max(0,limit-this.slots[i].count);
      if(room<=0) return {accepted:0,remaining:want,index:i,reason:'limit'};
      const n=Math.min(want,room); this.slots[i].count+=n; this.version++;
      return {accepted:n,remaining:want-n,index:i,reason:n<want?'limit':null};
    }
    i=this.slots.findIndex(s=>!s);
    if(i<0) return {accepted:0,remaining:want,index:-1,reason:'full'};
    const n=Math.min(want,limit);
    this.slots[i]={id,count:n}; this.version++;
    return {accepted:n,remaining:want-n,index:i,reason:n<want?'limit':null};
  }
  // compatível com o contrato antigo: índice da entrada se algo foi guardado, -1 se nada coube
  add(id,count=1){ const r=this.receive(id,count); return r.accepted>0?r.index:-1; }
  slotOf(id){ return this.slots.findIndex(s=>s&&s.id===id); }
  count(id){ const s=this.slots.find(s=>s&&s.id===id); return s?s.count:0; }
  has(id){ return this.slotOf(id)>=0; }
  take(id,n=1){ const s=this.slots.find(s=>s&&s.id===id); if(!s||s.count<n) return false; s.count-=n; this.version++; return true; }
  // ---- capacidade ----
  get usedSlots(){ return this.slots.reduce((n,s)=>n+(s?1:0),0); }
  get freeSlots(){ return this.size-this.usedSlots; }
  get isFull(){ return this.usedSlots>=this.size; }
  stackLimitOf(id){ return itemStackLimit(id); }
  // ---- peso (somente leitura; sem efeito em gameplay) ----
  weightOf(id){ return itemWeight(id); }                              // uma unidade
  entryWeight(i){ const s=this.slots[i]; return s&&s.count>0?itemWeight(s.id)*s.count:0; }   // a entrada inteira
  getTotalWeight(){ let w=0; for(let i=0;i<this.slots.length;i++) w+=this.entryWeight(i); return Math.round(w*1e6)/1e6; }
  get totalWeight(){ return this.getTotalWeight(); }
  // ---- atalhos ----
  // Vincula o item `id` ao atalho k. Um item ocupa um atalho só: se já estava em outro (j), o vínculo é transferido
  // e o item que ocupava k (se houver) passa a ocupar j. Nunca consome nem duplica unidades.
  // perHand: a transferência só acontece dentro do grupo de k (0–1 ou 2–3); o vínculo do outro grupo fica.
  bind(k,id){
    if(!(k>=0&&k<this.quick)||!this.has(id)) return false;
    const per=!!(ITEM_DEFS[id]&&ITEM_DEFS[id].perHand), j=per?this.bindingOf(id,k<2?0:1):this.binds.indexOf(id), old=this.binds[k];
    if(j>=0&&j!==k) this.binds[j]=old;
    this.binds[k]=id; this.version++; return true;
  }
  unbind(k){ if(k>=0&&k<this.quick&&this.binds[k]){ this.binds[k]=null; this.version++; return true; } return false; }
  // atalho do item (o primeiro); com group (0 = esquerda 1–2, 1 = direita 3–4), só naquele grupo
  bindingOf(id,group){ if(group==null) return this.binds.indexOf(id); const a=group?2:0; for(let k=a;k<Math.min(a+2,this.quick);k++) if(this.binds[k]===id) return k; return -1; }
  bindingsOf(id){ const out=[]; this.binds.forEach((b,k)=>{ if(b===id) out.push(k); }); return out; }
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