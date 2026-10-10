'use strict';
// ============================================================================
// js/interaction/InteractionSystem.js — consulta única para retícula, F e uso de itens
// ============================================================================
class InteractionSystem{
  constructor(game){ this.g=game; }
  ctx(hit){
    const g=this.g;
    return {game:g,player:g.player,world:g.world,items:g.items,audio:g.audio,fx:g.fx,ui:g.ui,hit,
      normal:hit?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):null};
  }
  query(){
    const p=this.g.player, items=this.g.items, res={reticle:'dot',prompt:''};
    if(p.dead) return res;
    if(p.canMantle()) res.prompt='Espaço|Subir';
    else if(p.needsPull) res.prompt=p.lockOff&&!p.xr?'X|Guarde o item para puxar':'Mouse ↓|Puxe o corpo para subir';
    const hit=p.aim(3.0); if(!hit) return res;
    const ud=hit.object.userData, obj=ud.interactable, ctx=this.ctx(hit);
    if(obj&&hit.distance<=2.4&&!(p.xr&&obj instanceof KeyButton)){ const c=obj.canInteract(ctx); if(c){ res.reticle=c.reticle||'pickup'; if(c.prompt) res.prompt='F|'+c.prompt; return res; } }
    const id=items.activeItem;
    if(id){
      if(obj){ const c=obj.canUseItem(id,ctx); if(c){ res.reticle=c.reticle; return res; } }
      if(id==='nails'){ res.reticle='nail-bad'; return res; }
    }
    if(ud.grab&&hit.distance<=p.reach&&p.hands.some(h=>!h.inContact&&!h.occupied&&!h.exhausted)) res.reticle='grab';
    return res;
  }
  // hand: mão preferida para o gesto de apertar botão (F = direita, clique esquerdo = esquerda)
  interact(hand=1){
    const ui=this.g.ui; if(ui.noteOpen){ ui.hideNote(); return; }
    const hit=this.g.player.aim(2.4); if(!hit) return;
    const obj=hit.object.userData.interactable; if(!obj) return;
    // VR: o painel é apertado com o dedo (VRPlayer), não de longe pelo raio
    if(this.g.player.xr&&obj instanceof KeyButton) return;
    const ctx=this.ctx(hit); if(!obj.canInteract(ctx)) return;
    obj.interact(ctx);
    if(obj instanceof KeyButton) this.g.player.pressButton(hit.point,hand);   // mão vai até o número apertado
  }
  // desktop: a mira está num botão do painel? (o clique esquerdo aperta em vez de agarrar)
  keypadAimed(){ const hit=this.g.player.aim(2.4); return !!(hit&&hit.object.userData.interactable instanceof KeyButton); }
  itemTarget(id,reach=REACH){
    const hit=this.g.player.aim(reach); if(!hit) return null;
    const obj=hit.object.userData.interactable; if(!obj) return null;
    const ctx=this.ctx(hit), c=obj.canUseItem(id,ctx); if(!c) return null;
    return {hit,obj,ctx,valid:c.valid!==false};
  }
}
