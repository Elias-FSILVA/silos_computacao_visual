'use strict';
// ============================================================================
// js/items/ItemSystem.js — equipar, guardar, usar; item visível na mão direita
// estado: equipped, phase (empty|equipping|idle|holstering|swing|place|consume), t
// ============================================================================
const POSE_REST=new V3(.22,-.22,-.42), POSE_HIP=new V3(.32,-.62,-.22);
const DUR={equipping:.42,holstering:.36,swing:.62,place:.5,consume:.6};
class ItemSystem{
  constructor(game){ this.g=game; this.inv=new Inventory(4); this.pivot=new THREE.Group(); this.mesh=null; this.reset(); }
  get player(){ return this.g.player; }
  reset(){
    this.inv.reset(); this.sel=-1; this.equipped=null; this.phase='empty'; this.t=0; this.pending=null; this.useHeld=false; this.next=-1; this.hinted=false;
    this._mount(null);
    this.pose={pos:POSE_REST.clone(),roll:0,visible:false};
    this.player.itemPose=this.pose; this.player.rightHand.occupied=false; this.player.inventory=this.inv;
  }
  get activeItem(){ return (this.phase==='idle'||this.phase==='swing'||this.phase==='place')?this.equipped:null; }
  _mount(id){
    if(this.mesh){ this.pivot.remove(this.mesh); this.mesh=null; }
    const hand=this.player._vm[1]; if(this.pivot.parent!==hand) hand.add(this.pivot);
    if(!id) return;
    const d=ITEM_DEFS[id]; this.mesh=d.make(); this.mesh.position.set(...d.item.p); this.mesh.rotation.set(...d.item.r);
    this.pivot.add(this.mesh);
  }
  onPickup(id,count){
    if(!this.hinted&&this.inv.has('hammer')&&this.inv.has('nails')){ this.hinted=true;
      this.g.ui.msg('1 a 4 escolhem o que vai na mão direita. Botão direito usa. X guarda.',5); }
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
    if(this.phase==='swing'){
      if(this.player.isClimbing) this.player.hands.forEach(h=>{ if(h.inContact) h.stamina=Math.max(0,h.stamina-2); });
      if(tg&&tg.obj&&tg.hit.object.userData.alive!==false) tg.obj.useItem('hammer',tg.ctx);
    } else if(this.phase==='place'){
      if(tg&&tg.obj) tg.obj.useItem(this.equipped,tg.ctx);
    } else if(this.phase==='consume'){
      if(this.inv.take('pills')){ this.player.restoreStamina(); this.g.audio.pill(); this.g.ui.msg('O tremor nas mãos passa.',2); }
    }
  }
  update(dt){
    if(this.phase==='empty'){ this.pose.visible=false; return; }
    if(this.player.dead){ return; }
    this.t+=dt; const id=this.equipped, d=ITEM_DEFS[id], idle=new V3(...d.held), P=this.pose; let k;
    P.roll=0;
    switch(this.phase){
      case 'equipping':
        k=Math.min(1,this.t/DUR.equipping);
        if(k<.4){ P.pos.lerpVectors(POSE_REST,POSE_HIP,smooth(k/.4)); P.visible=false; this.pivot.rotation.x=.8; }
        else { P.pos.lerpVectors(POSE_HIP,idle,smooth((k-.4)/.6)); P.visible=true; this.pivot.rotation.x=lerp(.8,0,smooth((k-.4)/.6)); }
        if(k>=1) this.phase='idle';
        break;
      case 'holstering':
        k=Math.min(1,this.t/DUR.holstering);
        if(k<.6){ P.pos.lerpVectors(idle,POSE_HIP,smooth(k/.6)); P.visible=true; this.pivot.rotation.x=lerp(0,.8,smooth(k/.6)); }
        else { P.pos.lerpVectors(POSE_HIP,POSE_REST,smooth((k-.6)/.4)); P.visible=false; }
        if(k>=1){ this.phase='empty'; this.equipped=null; this.sel=-1; this._mount(null); this.player.rightHand.occupied=false; P.visible=false;
          if(this.next>=0){ const n=this.next; this.next=-1; this.select(n); } }
        break;
      case 'swing': {
        const t=this.t; let rot, dz, dy;
        if(t<.18){ const e=smooth(t/.18); rot=lerp(0,1.1,e); dz=lerp(0,.05,e); dy=lerp(0,.07,e); }
        else if(t<.26){ rot=1.1; dz=.05; dy=.07; }
        else if(t<.34){ const e=(t-.26)/.08; rot=lerp(1.1,-.75,e*e); dz=lerp(.05,-.2,e); dy=lerp(.07,-.03,e); }
        else if(t<.44){ const e=smooth((t-.34)/.1); rot=lerp(-.75,-.45,e); dz=lerp(-.2,-.14,e); dy=-.03; }
        else { const e=smooth(Math.min(1,(t-.44)/.18)); rot=lerp(-.45,0,e); dz=lerp(-.14,0,e); dy=lerp(-.03,0,e); }
        if(t>=.34&&!this.impacted){ this.impacted=true; this._impact(); }
        this.pivot.rotation.x=rot; P.pos.set(idle.x-(dz<0?dz*.25:0),idle.y+dy,idle.z+dz); P.visible=true; P.roll=-rot*.08;
        if(t>=DUR.swing){ this.phase='idle'; this.pivot.rotation.x=0; }
        break; }
      case 'place': case 'consume': {
        const dur=DUR[this.phase], half=dur/2, t=this.t, to=this.phase==='place'?new V3(.06,-.1,-.64):new V3(.05,-.16,-.24);
        if(t<half) P.pos.lerpVectors(idle,to,smooth(t/half)); else P.pos.lerpVectors(to,idle,smooth(Math.min(1,(t-half)/half)));
        if(t>=half&&!this.impacted){ this.impacted=true; this._impact(); }
        let vis=true;
        if(this.equipped==='nails') vis=!(this.impacted&&t<dur*.85)&&this.inv.count('nails')>0;
        else if(this.equipped==='pills') vis=!this.impacted||this.inv.count('pills')>0;
        P.visible=vis;
        if(t>=dur){ this.phase='idle'; }
        break; }
      case 'idle': {
        const b=Math.sin(performance.now()/600)*.004; P.pos.set(idle.x,idle.y+b,idle.z);
        P.visible=!(id!=='hammer'&&id!=='card'&&this.inv.count(id)<=0);
        if(this.useHeld&&id==='hammer') this._tryUse();
        break; }
    }
    if(this.mesh) this.mesh.visible=P.visible;
  }
}
