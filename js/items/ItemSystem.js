'use strict';
// ============================================================================
// js/items/ItemSystem.js — equipar, guardar, usar; item visível na mão direita
// estado: equipped, phase (empty|equipping|idle|holstering|swing|place|consume), t
// A cada quadro preenche `pose` (lida pelo Player): posição do pulso, flexão do pulso (wrist),
// orientação da mão (base), pegada (grip, misturável com grip2/blend), squeeze e tremor.
// ============================================================================
const POSE_REST=new V3(.22,-.22,-.42), POSE_HIP=new V3(.32,-.62,-.22);
const DUR={equipping:.55,holstering:.45,swing:.62,place:.5,consume:.6};
const _itemIdle=new V3(), _itemTo=new V3();
class ItemSystem{
  constructor(game){ this.g=game; this.inv=new Inventory(4); this.pivot=new THREE.Group(); this.mesh=null; this.reset(); }
  get player(){ return this.g.player; }
  reset(){
    this.inv.reset(); this.sel=-1; this.equipped=null; this.phase='empty'; this.t=0; this.pending=null; this.useHeld=false; this.next=-1; this.hinted=false;
    this._mount(null);
    this.pose={pos:POSE_REST.clone(),roll:0,visible:false,wrist:new V3(),base:HandModel.BASE_FLAT,grip:'relaxed',grip2:null,blend:0,squeeze:0,tremor:0};
    this.player.itemPose=this.pose; this.player.rightHand.occupied=false; this.player.inventory=this.inv;
  }
  get activeItem(){ return (this.phase==='idle'||this.phase==='swing'||this.phase==='place')?this.equipped:null; }
  _mount(id){
    if(this.mesh){ this.pivot.remove(this.mesh); this.mesh=null; }
    const hand=this.player.handModels[1].socket; if(this.pivot.parent!==hand) hand.add(this.pivot);
    if(!id) return;
    const d=ITEM_DEFS[id]; this.mesh=d.make(); this.mesh.position.set(...d.item.p); this.mesh.rotation.set(...d.item.r);
    if(d.item.s) this.mesh.scale.setScalar(d.item.s);
    this.pivot.add(this.mesh);
  }
  onPickup(id,count){
    if(!this.hinted&&this.inv.has('hammer')&&this.inv.has('nails')){ this.hinted=true;
      this.g.ui.msg(this.g.vr.active?'Y abre o inventário: toque num item com o indicador direito e aperte o gatilho. B troca, X guarda.'
        :'1 a 4 escolhem o que vai na mão direita. Botão direito usa. X guarda.',5); }
  }
  select(i){
    const p=this.player; if(p.dead) return;
    const slot=this.inv.slots[i]; if(!slot) return;
    if(this.sel===i&&this.equipped){ if(this.phase==='idle') this.holster(); return; }
    if(this.phase!=='idle'&&this.phase!=='empty'){ this.next=i; return; }
    if(p.rightHand.inContact){ this.g.ui.msg('A mão direita está segurando.',1.4); return; }
    if(this.equipped){ this.next=i; this.holster(); return; }
    this._equip(i);
  }
  cycle(dir){
    const filled=this.inv.slots.map((s,i)=>s?i:-1).filter(i=>i>=0); if(!filled.length) return;
    let k=filled.indexOf(this.sel); k=k<0?(dir>0?0:filled.length-1):(k+dir+filled.length)%filled.length;
    this.select(filled[k]);
  }
  _equip(i){
    this.sel=i; this.equipped=this.inv.slots[i].id; this.phase='equipping'; this.t=0; this.next=-1;
    const p=this.player; p.rightHand.occupied=true; p.rightHand.isGrabbing=false; this._mount(this.equipped); this.g.audio.equip();
  }
  holster(){ if(!this.equipped||this.phase==='holstering') return; this.phase='holstering'; this.t=0; this.g.audio.holster(); }
  use(down){ this.useHeld=down; if(down) this._tryUse(); }
  quick(id){ // Q: pílula sem precisar equipar
    if(id!=='pills') return;
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
    }
  }
  _start(ph){ this.phase=ph; this.t=0; this.impacted=false; if(ph==='swing') this.g.audio.swing(); }
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
  place(tg){
    if(this.phase!=='idle'||this.equipped!=='nails'||!tg||!tg.valid||this.inv.count('nails')<=0) return false;
    this.pending=tg; this._start('place'); return true;
  }
  // VR: frasco levado à boca (detectado pelo VRPlayer) — mesmo consumo do botão: animação, uma pílula, cura das mãos
  consume(){ if(this.phase!=='idle'||this.equipped!=='pills'||this.inv.count('pills')<=0) return false; this._start('consume'); return true; }
  // VR: pancada física do martelo (num prego ou numa parede quebrável, detectada pelo VRPlayer) — mesmo efeito do golpe, sem a animação
  strike(tg){ if(this.phase!=='idle'||this.equipped!=='hammer') return false; this._hammerHit(tg); return this.landed; }
  update(dt){
    if(this.phase==='empty'){ this.pose.visible=false; return; }
    if(this.player.dead){ return; }
    this.t+=dt; const id=this.equipped, d=ITEM_DEFS[id], idle=_itemIdle.set(...d.held), P=this.pose; let k;
    P.roll=0; P.wrist.set(0,0,0); P.base=d.base; P.grip=d.grip; P.grip2=null; P.blend=0; P.squeeze=0; P.tremor=0;
    switch(this.phase){
      case 'equipping': {
        // pegar: a mão desce aberta até o cinto, fecha no item e sobe com ele
        k=Math.min(1,this.t/DUR.equipping);
        if(k<.4){ const e=smooth(k/.4); P.pos.lerpVectors(POSE_REST,POSE_HIP,e); P.visible=false; P.grip='open'; P.base=HandModel.BASE_FLAT; P.wrist.set(-.6*e,0,0); }
        else if(k<.55){ P.pos.copy(POSE_HIP); P.visible=true; P.squeeze=.25; P.wrist.set(-.6,0,0); }
        else { const e=smooth((k-.55)/.45); P.pos.lerpVectors(POSE_HIP,idle,e); P.visible=true; P.wrist.set(lerp(-.6,0,e)+Math.sin(e*Math.PI)*.35,0,0); }
        if(k>=1) this.phase='idle';
        break; }
      case 'holstering': {
        // guardar: desce com o item, solta no cinto e volta vazia
        k=Math.min(1,this.t/DUR.holstering);
        if(k<.55){ const e=smooth(k/.55); P.pos.lerpVectors(idle,POSE_HIP,e); P.visible=true; P.wrist.set(-.6*e,0,0); }
        else { const e=smooth((k-.55)/.45); P.pos.lerpVectors(POSE_HIP,POSE_REST,e); P.visible=false; P.grip='open'; P.base=HandModel.BASE_FLAT; P.wrist.set(-.6*(1-e),0,0); }
        if(k>=1){ this.phase='empty'; this.equipped=null; this.sel=-1; this._mount(null); this.player.rightHand.occupied=false; P.visible=false;
          if(this.next>=0){ const n=this.next; this.next=-1; this.select(n); } }
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
        const to=place?_itemTo.set(.06,-.1,-.56):_itemTo.set(.05,-.14,-.2);
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
      case 'idle': {
        const now=performance.now(), b=Math.sin(now/600)*.004; P.pos.set(idle.x,idle.y+b,idle.z);
        P.wrist.set(Math.sin(now/900)*.03,0,0);
        P.visible=!(id!=='hammer'&&id!=='card'&&this.inv.count(id)<=0);
        if(this.useHeld&&id==='hammer') this._tryUse();
        break; }
    }
    if(!P.visible&&P.grip===d.grip&&this.phase!=='equipping') P.grip='relaxed';   // sem item à vista, a mão relaxa
    if(this.mesh) this.mesh.visible=P.visible;
  }
}
