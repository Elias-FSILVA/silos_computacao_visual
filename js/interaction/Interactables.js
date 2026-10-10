'use strict';
// ============================================================================
// js/interaction/Interactables.js — contrato comum: canInteract / interact / canUseItem / useItem
// ctx = { game, player, world, items, audio, fx, ui, hit, normal }
// ============================================================================
const NAIL_REACH=1.8;
class Interactable{
  canInteract(ctx){ return null; }      // → { prompt, reticle } | null   (tecla F)
  interact(ctx){}
  canUseItem(id,ctx){ return null; }    // → { reticle, valid } | null    (item na mão + botão direito)
  useItem(id,ctx){}
}
class ConcreteSurface extends Interactable{
  canUseItem(id,ctx){
    const h=ctx.hit;
    if(id==='nails'){
      const ok=h.distance<=NAIL_REACH&&Math.abs(ctx.normal.y)<.35&&!ctx.world.nearAnchor(h.point,.3)&&ctx.items.inv.count('nails')>0;
      return {reticle:ok?'nail-ok':'nail-bad',valid:ok};
    }
    if(id==='hammer') return {reticle:h.distance<=REACH?'impact':'dot',valid:h.distance<=REACH};
    return null;
  }
  useItem(id,ctx){
    if(id==='nails'){
      if(!ctx.items.inv.take('nails')) return;
      ctx.world.addNail(ctx.hit.point,ctx.normal); ctx.player.stats.pitonsUsed++;
      ctx.audio.nailSet(); ctx.fx.spawn('chips',ctx.hit.point,ctx.normal,3);
    } else if(id==='hammer'){
      ctx.audio.thud(); ctx.fx.spawn('chips',ctx.hit.point,ctx.normal,5); ctx.player.addShake(.15);
    }
  }
}
const SURFACE={concrete:new ConcreteSurface()};

class BreakableWall extends Interactable{
  constructor(mesh,o){ super(); this.mesh=mesh; this.breakable=true; this.damage=0; this.maxDamage=o.maxDamage||3; this.broken=false; this.secretId=o.secretId||null; }
  canUseItem(id,ctx){
    if(this.broken) return null;
    if(id==='hammer') return ctx.hit.distance<=REACH?{reticle:'fragile',valid:true}:{reticle:'dot',valid:false};
    if(id==='nails') return {reticle:'nail-bad',valid:false};
    return null;
  }
  useItem(id,ctx){
    if(id!=='hammer'||this.broken) return;
    this.damage++;
    ctx.audio.hollow(this.damage/this.maxDamage); ctx.fx.spawn('dust',ctx.hit.point,ctx.normal,7); ctx.fx.spawn('chips',ctx.hit.point,ctx.normal,3);
    ctx.player.addShake(.22); this._crack(ctx.hit.point,ctx.normal);
    if(this.damage>=this.maxDamage) this._break(ctx);
  }
  _crack(point,normal){
    const m=this.mesh, t1=Math.abs(normal.x)>.5?new V3(0,0,1):new V3(1,0,0), t2=new V3(0,1,0);
    for(let i=0;i<2+this.damage;i++){
      const len=.12+Math.random()*.25*(1+this.damage*.5);
      const c=new THREE.Mesh(new THREE.BoxGeometry(len,.012,.004),MAT.crack);
      const wp=point.clone().addScaledVector(normal,.006).addScaledVector(t1,(Math.random()-.5)*.35).addScaledVector(t2,(Math.random()-.5)*.35);
      m.add(c); c.position.copy(wp).sub(m.position);
      m.updateMatrixWorld(); c.lookAt(wp.clone().add(normal)); c.rotateZ(Math.random()*Math.PI);
    }
  }
  _break(ctx){
    this.broken=true;
    const c=this.mesh.position.clone(), n=ctx.normal.clone();
    ctx.world.removeSolid(this.mesh);
    ctx.fx.spawn('debris',c,n,14); ctx.fx.spawn('dust',c,n,16);
    ctx.audio.crash(); ctx.player.addShake(.5);
    ctx.world.revealSecret(this.secretId,ctx);
  }
}

class NailAnchor extends Interactable{
  constructor(anchor,visual){ super(); this.anchor=anchor; this.visual=visual; this.placed=true; this.fixed=false; this.hits=0; this.required=3; this._pose(); }
  _pose(){ const out=[.2,.14,.09,.05][Math.min(this.hits,3)]; this.visual.position.set(0,out-.13,0); this.visual.rotation.set(.28*(1-this.hits/3),0,.18*(1-this.hits/3)); }
  canUseItem(id,ctx){
    if(id==='hammer'&&!this.fixed) return ctx.hit.distance<=REACH?{reticle:'hammer-nail',valid:true}:{reticle:'dot',valid:false};
    if(id==='nails') return {reticle:'nail-bad',valid:false};
    return null;
  }
  useItem(id,ctx){
    if(id!=='hammer'||this.fixed||this.anchor.userData.alive===false) return;
    this.hits++; this._pose();
    ctx.audio.tang(this.hits); ctx.fx.spawn('sparks',ctx.hit.point,ctx.normal,6); ctx.player.addShake(.2);
    if(this.hits>=this.required){
      this.fixed=true; const u=this.anchor.userData; u.crumble=false; u.fixed=true;
      if(u.crumbleT!=null){ u.crumbleT=null; ctx.world.crumbling=ctx.world.crumbling.filter(o=>o!==this.anchor); }
    }
  }
}

class Crate extends Interactable{
  constructor(world,body,hinge,loot){ super(); this.world=world; this.body=body; this.hinge=hinge; this.loot=loot; this.opened=false; this.t=0; this.pickups=[]; }
  canInteract(){ return this.opened?null:{prompt:'Abrir a caixa',reticle:'pickup'}; }
  interact(ctx){
    if(this.opened) return; this.opened=true; this.t=0; ctx.audio.crate();
    const items=Object.entries(this.loot).filter(([,n])=>n);
    items.forEach(([id,n],i)=>{
      const off=(i-(items.length-1)/2)*.2;
      const p=this.world.addPickup(id,id==='hammer'?1:n,this.body.parent,new V3(off,.12,0),true);
      this.pickups.push(p);
    });
    this.world.animated.push(this);
  }
  update(dt){
    this.t+=dt; const k=Math.min(1,this.t/.55);
    this.hinge.rotation.x=-1.95*smooth(k);
    this.pickups.forEach(p=>{ if(!p.taken) p.mesh.position.y=lerp(.12,.36,smooth(k)); });
    return k<1;
  }
}

// Texto mostrado quando Inventory.receive() não aceita nada (reason vem do próprio Inventory)
function pickupRefusal(id,reason,inv){
  const d=ITEM_DEFS[id];
  if(reason==='full') return `Mochila cheia (${inv.size} / ${inv.size} espaços).`;
  if(reason==='duplicate') return `Você já carrega este item: ${d.name}.`;
  if(reason==='limit') return `Limite de ${d.name.toLowerCase()} atingido (${inv.stackLimitOf(id)}).`;
  return 'Não foi possível pegar isso.';
}

class Pickup extends Interactable{
  constructor(world,mesh,id,count){ super(); this.world=world; this.mesh=mesh; this.id=id; this.count=count; this.taken=false; }
  canInteract(){ return this.taken?null:{prompt:`Pegar ${itemLabel(this.id,this.count)}`,reticle:'pickup'}; }
  // Coleta parcial: o que cabe vai para o inventário; o que não coube continua aqui (this.count) e o pickup permanece no mundo.
  // Se nada coube, nada muda (nem o pickup nem o inventário).
  interact(ctx){
    if(this.taken) return;
    const inv=ctx.items.inv, r=inv.receive(this.id,this.count);
    if(r.accepted<=0){ ctx.audio.deny(); ctx.ui.msg(pickupRefusal(this.id,r.reason,inv),1.8); return; }
    this.count=r.remaining;
    ctx.audio.pickup(); ctx.ui.slotPulse(r.index); ctx.items.onPickup(this.id,r.accepted);
    if(r.remaining>0){
      const d=ITEM_DEFS[this.id];
      ctx.ui.msg(`${d.name}: levou ${r.accepted}, sobraram ${r.remaining} no chão (limite ${inv.stackLimitOf(this.id)}).`,2.4);
      return;
    }
    this.taken=true; this.t=0; this.cam=ctx.player.camera;
    this.from=new V3(); this.mesh.getWorldPosition(this.from);
    this.world.detach(this.mesh); this.world.root.add(this.mesh); this.mesh.position.copy(this.from);
    this.world.animated.push(this);
  }
  update(dt){
    this.t+=dt; const k=Math.min(1,this.t/.28);
    const to=this.cam.localToWorld(new V3(.18,-.3,-.35));
    this.mesh.position.lerpVectors(this.from,to,smooth(k)); this.mesh.scale.setScalar(1-k*.8);
    if(k>=1){ this.world.root.remove(this.mesh); return false; }
    return true;
  }
}

class Note extends Interactable{
  constructor(text,term){ super(); this.text=text; this.term=!!term; }
  canInteract(){ return {prompt:this.term?'Ler o terminal':'Ler',reticle:this.term?'panel':'pickup'}; }
  interact(ctx){ ctx.ui.showNote(this.text,this.term); ctx.audio.noise(.15,3000,.06); }
}

class KeyButton extends Interactable{
  constructor(mesh,label,channel){ super(); this.mesh=mesh; this.label=label; this.channel=channel; this.t=1; this.base=mesh.position.z; }
  canInteract(){ return {prompt:'',reticle:'panel'}; }
  interact(ctx){ this.t=0; ctx.world.animated.push(this); ctx.game.puzzles.input(this.channel,this.label); }
  update(dt){ this.t+=dt; const k=Math.min(1,this.t/.18); this.mesh.position.z=this.base-.018*Math.sin(k*Math.PI); return k<1; }
}