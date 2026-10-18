'use strict';
// ============================================================================
// js/items/ItemSystem.js — equipar, guardar, usar; uma instância por mão (a direita guarda a esquerda em `left`)
// estado: equipped, phase (empty|equipping|idle|holstering|swing|place|consume), t
// picareta (climbing_axe): idle = pronta → striking → anchored | bounce; anchored → idle (soltar) | dislodged (exausta)
//   A âncora física é a do Player (hand.anchor='axe'); aqui só se lê esse estado. Cravada/golpeando não guarda nem troca.
//   Desgaste: cada mão segura UMA unidade (`unit`, índice na entrada da mochila). Fincada no concreto gasta 1 de
//   ITEM_DEFS.durability; rocha e rachadura não gastam. A fincada que zera segura; ao sair dela, a picareta quebra.
// A cada quadro calcula `_canon` no espaço da mão DIREITA e escreve em `pose` (lida pelo Player) o seu lado,
// via Handedness.toSide: posição do pulso, flexão do pulso (wrist), orientação da mão (base), pegada (grip,
// misturável com grip2/blend), squeeze e tremor. Nenhuma pose ou animação tem sinal por mão.
// ============================================================================
const POSE_REST=new V3(.22,-.22,-.42), POSE_HIP=new V3(.32,-.62,-.22);
const DUR={equipping:.55,holstering:.45,swing:.62,place:.5,consume:.6,striking:.15,bounce:.25};
// itens que miram pelo mouse: o uso ativo deles é um conflito de entrada com a puxada (Player.aimConflict)
const AIMING_ITEMS={hammer:true,nails:true,card:true};
const AXE_LOCKED_MSG='A picareta está cravada';
class ItemSystem{
  constructor(game,handIndex=1,sharedInventory=null){
    this.g=game; this.handIndex=handIndex; this.side=Handedness.sideOf(handIndex); this.hand=game.player.hands[handIndex];
    // uma entrada por tipo de item (a última unidade gasta libera a entrada): a mochila cabe todos os tipos ao mesmo tempo
    this.inv=sharedInventory||new Inventory(Object.keys(ITEM_DEFS).length); this.pivot=new THREE.Group(); this.mesh=null;
    this._tmp={idle:new V3(),to:new V3(),rest:new V3(),hip:new V3()};   // temporários de pose: um conjunto por mão
    this.reset();
    if(handIndex===1){ this.left=new ItemSystem(game,0,this.inv); game.player.inventory=this.inv; }
    // picareta arrancada (exaustão, vento, superfície que sumiu): som de raspão
    if(game.player.on) game.player.on('axeDislodged',h=>{ if(h===this.hand){ this.g.audio.axeScrape(); this._vrFeedback('release'); } });
  }
  get player(){ return this.g.player; }
  reset(){
    if(this.handIndex===1) this.inv.reset();
    this.sel=-1; this.equipped=null; this.phase='empty'; this.t=0; this.pending=null; this.useHeld=false; this.next=-1; this.hinted=false; this.unit=-1; this.worn=false;
    this._mount(null);
    this._canon={pos:POSE_REST.clone(),roll:0,visible:false,wrist:new V3(),base:HandModel.BASE_FLAT,grip:'relaxed',grip2:null,blend:0,squeeze:0,tremor:0};
    this.pose=Handedness.toSide(this._canon,this.side,{pos:new V3(),wrist:new V3()});
    this.player.itemPoses=this.player.itemPoses||[]; this.player.itemPoses[this.handIndex]=this.pose; this.hand.occupied=false; this.hand.aiming=false;
    if(this.handIndex===1&&this.left) this.left.reset();
  }
  get activeItem(){ return (this.phase==='idle'||this.phase==='swing'||this.phase==='place')?this.equipped:null; }
  get activeItems(){ return [this.left,this].map(h=>h.activeItem); }
  handForQuick(k){ return k>=0&&k<2?'left':k>=2&&k<4?'right':null; }
  equippedFor(side){ return (side==='left'?this.left:this).equipped; }
  phaseFor(side){ return (side==='left'?this.left:this).phase; }
  // slot i na mão `side`; sem lado: em qualquer mão que o tenha equipado (perHand pode estar nas duas)
  isSelected(i,side){ const s=this.inv.slots[i]; if(!s) return false;
    if(side) { const h=side==='left'?this.left:this; return h.sel===i&&!!h.equipped; }
    return [this.left,this].some(h=>h.sel===i&&!!h.equipped); }
  // mão de um slot pelo vínculo do item (sem vínculo: direita)
  sideOf(i){ const s=this.inv.slots[i]; const k=s?this.inv.bindingOf(s.id):-1; return k>=0&&k<2?'left':'right'; }
  // unidades do item que nenhuma mão está segurando (perHand: cada mão equipada reserva uma)
  _freeUnits(id){ return this.inv.count(id)-[this.left||this,this].filter((h,n,a)=>a.indexOf(h)===n&&h.equipped===id).length; }
  useHand(side,down){ (side==='left'?this.left:this).use(down); }
  holsterHand(side){ (side==='left'?this.left:this).holster(); }
  // picareta cravada (ou no golpe): a mão não guarda nem troca
  get axeLocked(){ return this.equipped==='climbing_axe'&&(this.phase==='anchored'||this.phase==='striking'); }
  isAnchored(side){ return (side==='left'?this.left:this).phase==='anchored'; }
  _denyLocked(){ this.g.audio.deny(); this.g.ui.msg(AXE_LOCKED_MSG,1.4); }
  _mount(id){
    if(this.mesh){ this.pivot.remove(this.mesh); this.mesh=null; }
    const hand=this.player.handModels[this.handIndex].socket; if(this.pivot.parent!==hand) hand.add(this.pivot);
    const vis=this.player.axeVisuals=this.player.axeVisuals||[null,null]; vis[this.handIndex]=null;   // instância da picareta desta mão (B: ancoragem visual)
    if(!id) return;
    const d=ITEM_DEFS[id]; this.mesh=d.make(this.side);
    if(this.mesh.userData.axeInstance) vis[this.handIndex]=this.mesh.userData.axeInstance;
    if(d.item.chiral&&this.side<0) Handedness.mirrorMesh(this.mesh);   // item com lado: geometria refletida, nunca escala negativa
    Handedness.mountTransform(d.item,this.side,this.mesh);
    this.pivot.add(this.mesh);
  }
  onPickup(id,count){
    if(!this.hinted&&this.inv.has('hammer')&&this.inv.has('nails')){ this.hinted=true;
      this.g.ui.msg(this.g.vr.active?'Y abre o inventário: toque num item com o indicador e use os atalhos para atribuir à mão. Cada gatilho usa o item daquela mão.'
        :'Tab abre a mochila: atalhos 1–2 equipam a mão esquerda; 3–4, a direita. Cada botão do mouse usa o item da mão correspondente; clique esquerdo agarra quando vazia.',5); }
  }
  // equipa/troca/guarda o slot i; `side` explícito ('left'|'right') vence a dedução pelo vínculo
  select(i,side){
    if(this.handIndex===1){ const s=side||this.sideOf(i); if(s==='left') return this.left.select(i,'left'); }
    const p=this.player; if(p.dead) return;
    const slot=this.inv.slots[i]; if(!slot) return;
    if(this.axeLocked){ this._denyLocked(); return; }
    if(this.sel===i&&this.equipped){ if(this.phase==='idle') this.holster(); return; }
    const d=ITEM_DEFS[slot.id], root=this.handIndex===1?this:this.g.items;
    if(d.perHand&&root._freeUnits(slot.id)<=0){ this.g.audio.deny(); this.g.ui.msg(`Você só tem uma ${d.name.toLowerCase()}`,1.6); return; }
    if(this.phase!=='idle'&&this.phase!=='empty'){ this.next=i; return; }
    if(this.hand.inContact){ this.g.ui.msg(`A mão ${this.handIndex===0?'esquerda':'direita'} está segurando.`,1.4); return; }
    // posse única: um item (que não seja perHand) está em uma mão só; pegá-lo com esta mão o tira da outra
    const other=this.handIndex===1?this.left:this.g.items;
    if(!d.perHand&&other&&other!==this&&other.equipped===slot.id){
      if(other.phase!=='idle'&&other.phase!=='equipping'&&other.phase!=='holstering'){
        this.g.audio.deny(); this.g.ui.msg(`A mão ${other.handIndex===0?'esquerda':'direita'} está usando ${d.name.toLowerCase()}.`,1.4); return; }
      other._release();
    }
    if(this.equipped){ this.next=i; this.holster(); return; }
    this._equip(i);
  }
  // atalhos 1–4: resolve o item vinculado e entrega ao select() existente (equipar, trocar ou guardar)
  selectQuick(k){
    const owner=k<2?this.left:this;
    const inv=this.inv, i=inv.boundSlot(k); if(i<0) return false;
    const s=inv.slots[i], d=ITEM_DEFS[s.id];
    if(d.stack&&s.count<=0&&owner.sel!==i){ this.g.audio.deny(); this.g.ui.msg(`Esgotado: ${d.name.toLowerCase()}.`,1.3); return false; }
    owner.select(i,k<2?'left':'right'); return true;
  }
  cycle(dir){
    const filled=this.inv.slots.map((s,i)=>s?i:-1).filter(i=>i>=0); if(!filled.length) return;
    let k=filled.indexOf(this.sel); k=k<0?(dir>0?0:filled.length-1):(k+dir+filled.length)%filled.length;
    this.select(filled[k]);
  }
  _equip(i){
    this.sel=i; this.equipped=this.inv.slots[i].id; this.phase='equipping'; this.t=0; this.next=-1; this.worn=false; this.unit=this._pickUnit(this.equipped);
    const p=this.player; this.hand.occupied=true; this.hand.isGrabbing=false; this._mount(this.equipped); this.g.audio.equip();
  }
  get _otherHand(){ const o=this.handIndex===1?this.left:this.g.items; return o&&o!==this?o:null; }
  // item com desgaste: a unidade menos gasta que a outra mão não está segurando (empate: a de menor índice)
  _pickUnit(id){
    if(!this.inv.durabilityOf(id)) return -1;
    const o=this._otherHand, taken=o&&o.equipped===id?o.unit:-1; let best=-1;
    for(let u=0;u<this.inv.count(id);u++) if(u!==taken&&(best<0||this.inv.durabilityLeft(id,u)>this.inv.durabilityLeft(id,best))) best=u;
    return best;
  }
  // restante/máximo da picareta na mão `side` (null se a mão não segura item com desgaste)
  axeDurability(side){ const h=side==='left'?this.left:this; if(!h||!h.equipped||h.unit<0) return null;
    return {left:this.inv.durabilityLeft(h.equipped,h.unit),max:this.inv.durabilityOf(h.equipped)}; }
  // HUD: desgaste do item `id` na mão `side` — o da unidade que ela segura, ou o da que ela pegaria
  durabilityFor(side,id){ const h=side==='left'?this.left:this; if(!h||!this.inv.durabilityOf(id)) return null;
    const u=h.equipped===id&&h.unit>=0?h.unit:h._pickUnit(id); if(u<0) return null;
    return {left:this.inv.durabilityLeft(id,u),max:this.inv.durabilityOf(id)}; }
  // a picareta gasta saiu da parede: quebra, sai da mochila e a mão esvazia
  _breakAxe(){
    const id=this.equipped, u=this.unit, o=this._otherHand;
    this.inv.breakUnit(id,u); if(o&&o.equipped===id&&o.unit>u) o.unit--;
    this._release(); this.g.audio.axeBreak(); this._vrFeedback('release');
    this.g.ui.msg(this.inv.has(id)?'A picareta quebrou. Sobrou uma.':'A picareta quebrou.',2);
  }
  // esvazia a mão na hora, sem animação (item passou para a outra mão ou acabou)
  _release(){
    this.phase='empty'; this.equipped=null; this.sel=-1; this.next=-1; this.pending=null; this.useHeld=false; this.t=0; this.unit=-1; this.worn=false;
    this._mount(null); this.hand.occupied=false; this._canon.visible=false; this.pose.visible=false; this._syncAim();
  }
  holster(){ if(!this.equipped||this.phase==='holstering') return; if(this.axeLocked){ this._denyLocked(); return; } this.phase='holstering'; this.t=0; this.g.audio.holster(); }
  // X: guarda as mãos livres (a picareta cravada fica)
  holsterAll(){ for(const h of [this,this.left]) if(h&&!h.axeLocked) h.holster(); }
  // o botão de uma mão só mexe no item daquela mão
  // voo de debug (noclip): nenhum uso, consumo ou impacto — guarda no ponto de ação, além das teclas
  _debugBlocked(){ const n=this.g.debugNavigation; return !!(n&&n.allowsGameplayAction&&!n.allowsGameplayAction()); }
  use(down){
    if(down&&this._debugBlocked()) return;
    this.useHeld=down; if(down) this._tryUse();
    else if(this.phase==='anchored'){ this.player.releaseAxe(this.handIndex); if(this.worn){ this._breakAxe(); return; } this.phase='idle'; this.t=0; this.g.audio.axeScrape(); this._vrFeedback('release'); }
    this._syncAim();
  }
  // pausa, mochila e console: solta o botão das duas mãos (não desprende nada preso à parede)
  releaseUse(){ this.useHeld=false; this._syncAim(); if(this.left){ this.left.useHeld=false; this.left._syncAim(); } }
  // Debug cancela a ação inteira, diferente de releaseUse (que não cancela impactos nem desprende).
  cancelPendingForDebug(){
    for(const owner of this.left?[this.left,this]:[this]){
      owner.pending=null;owner.next=-1;owner.useHeld=false;owner.impacted=false;owner.landed=false;owner.t=0;
      owner.phase=owner.equipped?'idle':'empty';owner._updateLocal(0);owner._syncAim();
    }
  }
  // uso ativo que mira (golpe, colocar, botão segurado): a mão disputa o mouse com a puxada
  get aimingNow(){ if(this.equipped==='climbing_axe') return this.phase==='striking';
    return !!this.equipped&&!!AIMING_ITEMS[this.equipped]&&(this.phase==='swing'||this.phase==='place'||(this.useHeld&&this.phase==='idle')); }
  _syncAim(){ this.hand.aiming=this.aimingNow; }
  quick(id){ // pílula sem precisar equipar (tecla Q)
    if(id!=='pills'||this._debugBlocked()) return;
    if(this.inv.count('pills')<=0){ this.g.ui.msg('Nenhuma pílula.',1.3); return; }
    this.inv.take('pills'); this.player.restoreStamina(); this.g.audio.pill(); this.g.ui.msg('O tremor nas mãos passa.',2);
  }
  _tryUse(){
    if(this.phase!=='idle') return;
    const id=this.equipped, I=this.g.interaction;
    if(id==='hammer'){ const tg=I.itemTarget('hammer'); this.pending=tg&&tg.valid?tg:null; this._start('swing'); }
    else if(id==='nails'){
      if(this.inv.count('nails')<=0){ this.g.audio.deny(); this.g.ui.msg('Nenhum prego.',1.3); return; }
      const tg=I.itemTarget('nails',NAIL_REACH);
      if(!tg||!tg.valid){ this.g.audio.deny(); return; }
      this.pending=tg; this._start('place');
    } else if(id==='pills'){
      if(this.inv.count('pills')<=0){ this.g.audio.deny(); return; }
      this._start('consume');
    } else if(id==='card'){
      const tg=I.itemTarget('card'); if(!tg||!tg.valid){ this.g.audio.deny(); return; }
      this.pending=tg; this._start('place');
    } else if(id==='climbing_axe'){ this._start('striking'); this.g.audio.swing(); }
  }
  // fim do golpe da picareta: crava se o botão ainda está pressionado e a superfície aceita; senão, ricocheteia sem custo
  _axeImpact(){
    if(!this.useHeld){ this.phase='idle'; this.t=0; return; }
    const p=this.player, hit=p.axeTarget(this.handIndex), r=hit?p.anchorAxe(this.handIndex,hit):{ok:false,reason:'surface'};
    if(r.ok&&r.bite==='shallow'){
      // concreto: entra pouco, lasca a parede e gasta a picareta
      this.phase='anchored'; this.t=0; this.g.audio.axeChip(); this._vrFeedback('bite');
      if(this.g.fx) this.g.fx.spawn('chips',hit.point,p.hands[this.handIndex].normal,4);
      const left=this.inv.addWear(this.equipped,this.unit,1);
      if(left<=0){ this.worn=true; this.g.ui.msg('A picareta não aguenta outra fincada.',1.8); }
      else if(left<=3) this.g.ui.msg(`Picareta gasta: ${left===1?'resta 1 fincada':`restam ${left} fincadas`} no concreto.`,1.6);
    }
    else if(r.ok){ this.phase='anchored'; this.t=0; this.g.audio.axeBite(); this._vrFeedback('bite'); }
    else { this.phase='bounce'; this.t=0; this.g.audio.axeTink(); this._vrFeedback('bounce'); }
  }
  _vrFeedback(kind){ const v=this.g.vr; if(v&&v.active!==false&&v.axeFeedback) v.axeFeedback(this.handIndex,kind); }
  _start(ph){ this.phase=ph; this.t=0; this.impacted=false; if(ph==='swing') this.g.audio.swing(); this._syncAim(); }
  _impact(){
    const tg=this.pending; this.pending=null;
    if(this.phase==='swing') this._hammerHit(tg);
    else if(this.phase==='place'){
      if(tg&&tg.obj) tg.obj.useItem(this.equipped,tg.ctx);
    } else if(this.phase==='consume'){
      if(this.inv.take('pills')){ this.player.restoreStamina(); this.g.audio.pill(); this.g.ui.msg('O tremor nas mãos passa.',2); }
    }
  }
  _hammerHit(tg){
    if(this.player.isClimbing) this.player.hands.forEach(h=>{ if(h.inContact) h.stamina=Math.max(0,h.stamina-2); });
    this.landed=!!(tg&&tg.obj&&tg.hit.object.userData.alive!==false);
    if(this.landed) tg.obj.useItem('hammer',tg.ctx);
  }
  // VR: prego encostado na parede (detectado pelo VRPlayer) — mesma colocação do botão, sem o clique
  place(tg,side='right'){
    const hand=side==='left'?this.left:this; if(this._debugBlocked()) return false;
    if(hand.phase!=='idle'||hand.equipped!=='nails'||!tg||!tg.valid||this.inv.count('nails')<=0) return false;
    hand.pending=tg; hand._start('place'); return true;
  }
  // VR: frasco levado à boca (detectado pelo VRPlayer) — mesmo consumo do botão: animação, uma pílula, cura das mãos
  consume(side='right'){ const hand=side==='left'?this.left:this; if(this._debugBlocked()||hand.phase!=='idle'||hand.equipped!=='pills'||this.inv.count('pills')<=0) return false; hand._start('consume'); return true; }
  // VR: pancada física do martelo (num prego ou numa parede quebrável, detectada pelo VRPlayer) — mesmo efeito do golpe, sem a animação
  strike(tg,side='right'){ const hand=side==='left'?this.left:this; if(this._debugBlocked()||hand.phase!=='idle'||hand.equipped!=='hammer') return false; hand._hammerHit(tg); return hand.landed; }
  update(dt){ if(this.handIndex===1&&this.left) this.left._updateLocal(dt); this._updateLocal(dt); }
  _updateLocal(dt){
    if(this.phase==='empty'){ this._canon.visible=false; this.pose.visible=false; this.hand.aiming=false; return; }
    if(this.player.dead){ return; }
    // o item acabou (última pílula/prego): a entrada sumiu; a animação em curso termina e a mão esvazia
    if(this.equipped&&!this.inv.has(this.equipped)){
      this.sel=-1;
      if(this.phase==='idle'||this.phase==='equipping'){ this._release(); return; }
    }
    // a âncora é do Player: se sumiu por fora (pausa, morte, vento, exaustão, salto, mantle), a fase acompanha
    if(this.phase==='anchored'&&this.hand.anchor!=='axe'){ if(this.worn){ this._breakAxe(); return; } this.phase=this.hand.exhausted?'dislodged':'idle'; this.t=0; }
    this.t+=dt; const id=this.equipped, d=ITEM_DEFS[id], T=this._tmp, idle=T.idle.set(...d.held), rest=T.rest.copy(POSE_REST), hip=T.hip.copy(POSE_HIP), P=this._canon; let k;
    P.roll=0; P.wrist.set(0,0,0); P.base=d.base; P.grip=d.grip; P.grip2=null; P.blend=0; P.squeeze=0; P.tremor=0;
    switch(this.phase){
      case 'equipping': {
        // pegar: a mão desce aberta até o cinto, fecha no item e sobe com ele
        k=Math.min(1,this.t/DUR.equipping);
        if(k<.4){ const e=smooth(k/.4); P.pos.lerpVectors(rest,hip,e); P.visible=false; P.grip='open'; P.base=HandModel.BASE_FLAT; P.wrist.set(-.6*e,0,0); }
        else if(k<.55){ P.pos.copy(hip); P.visible=true; P.squeeze=.25; P.wrist.set(-.6,0,0); }
        else { const e=smooth((k-.55)/.45); P.pos.lerpVectors(hip,idle,e); P.visible=true; P.wrist.set(lerp(-.6,0,e)+Math.sin(e*Math.PI)*.35,0,0); }
        if(k>=1) this.phase='idle';
        break; }
      case 'holstering': {
        // guardar: desce com o item, solta no cinto e volta vazia
        k=Math.min(1,this.t/DUR.holstering);
        if(k<.55){ const e=smooth(k/.55); P.pos.lerpVectors(idle,hip,e); P.visible=true; P.wrist.set(-.6*e,0,0); }
        else { const e=smooth((k-.55)/.45); P.pos.lerpVectors(hip,rest,e); P.visible=false; P.grip='open'; P.base=HandModel.BASE_FLAT; P.wrist.set(-.6*(1-e),0,0); }
        if(k>=1){ this.phase='empty'; this.equipped=null; this.sel=-1; this.unit=-1; this._mount(null); this.hand.occupied=false; P.visible=false;
          if(this.next>=0){ const n=this.next; this.next=-1; this.select(n,this.handIndex===0?'left':'right'); } }
        break; }
      case 'swing': {
        // golpe: o pulso inteiro gira com o martelo; aperta o cabo e treme no impacto
        const t=this.t; let rot, dz, dy;
        if(t<.18){ const e=smooth(t/.18); rot=lerp(0,1.1,e); dz=lerp(0,.05,e); dy=lerp(0,.07,e); }
        else if(t<.26){ rot=1.1; dz=.05; dy=.07; }
        else if(t<.34){ const e=(t-.26)/.08; rot=lerp(1.1,-.75,e*e); dz=lerp(.05,-.2,e); dy=lerp(.07,-.03,e); }
        else if(t<.44){ const e=smooth((t-.34)/.1); rot=lerp(-.75,-.45,e); dz=lerp(-.2,-.14,e); dy=-.03; }
        else { const e=smooth(Math.min(1,(t-.44)/.18)); rot=lerp(-.45,0,e); dz=lerp(-.14,0,e); dy=lerp(-.03,0,e); }
        if(t>=.34&&!this.impacted){ this.impacted=true; this._impact(); }
        P.wrist.set(rot,0,0); P.pos.set(idle.x-(dz<0?dz*.25:0),idle.y+dy,idle.z+dz); P.visible=true; P.roll=-rot*.08;
        P.squeeze=t<.44?.3*smooth(Math.min(1,t/.18)):.3*(1-smooth(Math.min(1,(t-.44)/.18)));
        if(this.impacted&&this.landed){ const r=Math.max(0,1-(t-.34)/.14); P.wrist.z+=Math.sin(t*110)*.06*r; P.tremor=.08*r; }
        if(t>=DUR.swing) this.phase='idle';
        break; }
      case 'place': case 'consume': {
        const dur=DUR[this.phase], half=dur/2, t=this.t, place=this.phase==='place';
        const to=place?T.to.set(.06,-.1,-.56):T.to.set(.05,-.14,-.2);
        const go=t<half?smooth(t/half):1-smooth(Math.min(1,(t-half)/half));
        P.pos.lerpVectors(idle,to,go);
        if(t>=half&&!this.impacted){ this.impacted=true; this._impact(); }
        if(place){
          // prego/cartão: aproxima em pinça, empurra contra a parede; o prego é solto e a mão pega o próximo
          P.wrist.set(-.25*go,0,0); P.squeeze=.2*go;
          if(!this.impacted){ P.grip2='press'; P.blend=smooth(clamp((t-half*.6)/(half*.4),0,1)); }
          else if(id==='nails'&&t<dur*.8) P.grip='relaxed';
        } else {
          // pílula: leva o frasco à boca, inclina e chacoalha
          P.wrist.set(1.1*go,0,.35*go); P.roll=.25*go;
          if(this.impacted&&t<half+.12) P.tremor=.12;
        }
        let vis=true;
        if(this.equipped==='nails') vis=!(this.impacted&&t<dur*.85)&&this.inv.count('nails')>0;
        else if(this.equipped==='pills') vis=!this.impacted||this.inv.count('pills')>0;
        P.visible=vis;
        if(t>=dur){ this.phase='idle'; }
        break; }
      case 'striking': case 'bounce': case 'anchored': case 'dislodged': {
        // picareta: golpe curto para frente, crava (pulso dobrado, punho apertado), ricochete, ou largada exausta
        const t=this.t, ph=this.phase;
        if(ph==='striking'){ const e=smooth(Math.min(1,t/DUR.striking)); P.wrist.set(lerp(.35,-.85,e),0,0); P.pos.set(idle.x,idle.y+.04*e,idle.z-.16*e); P.squeeze=.3*e; }
        else if(ph==='anchored'){ P.wrist.set(-.85,0,0); P.pos.set(idle.x,idle.y+.04,idle.z-.16); P.squeeze=.35+this.player.effort*.3; P.tremor=Math.min(.12,this.player.fatigueFx*.1); }
        else if(ph==='bounce'){ const e=Math.min(1,t/DUR.bounce), k=1-smooth(e); P.wrist.set(-.85*k+Math.sin(e*Math.PI)*.4,0,Math.sin(t*90)*.05*k); P.pos.set(idle.x,idle.y+.04*k,idle.z-.16*k); P.tremor=.1*k; }
        else { P.wrist.set(.25,0,0); P.pos.set(idle.x,idle.y-.06,idle.z+.03); P.tremor=.06; }
        P.visible=true;
        if(ph==='striking'&&t>=DUR.striking) this._axeImpact();
        else if(ph==='bounce'&&t>=DUR.bounce){ this.phase='idle'; this.t=0; }
        else if(ph==='dislodged'&&!this.hand.exhausted){ this.phase='idle'; this.t=0; }
        break; }
      case 'idle': {
        const now=performance.now(), b=Math.sin(now/600)*.004; P.pos.set(idle.x,idle.y+b,idle.z);
        P.wrist.set(Math.sin(now/900)*.03,0,0);
        P.visible=!(id!=='hammer'&&id!=='card'&&this.inv.count(id)<=0);
        if(this.useHeld&&id==='hammer') this._tryUse();
        break; }
    }
    if(!P.visible&&P.grip===d.grip&&this.phase!=='equipping') P.grip='relaxed';   // sem item à vista, a mão relaxa
    if(this.mesh) this.mesh.visible=P.visible;
    Handedness.toSide(P,this.side,this.pose); this._syncAim();
  }
}