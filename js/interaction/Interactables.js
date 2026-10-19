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
  get kind(){ return 'concrete'; }                  // a picareta reconhece a parede que aceita prego (axeBiteOf)
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

// estação de melhoria (PerkStations): F (ou a interação do VR) abre o painel do jogo; usada, mostra "SEM CARGA"
class PerkStation extends Interactable{
  constructor(id,group,lampMat,screenTex){ super(); this.id=id; this.group=group; this.lampMat=lampMat; this.screen=screenTex; this.used=null; this.setUsed(false); }
  canInteract(){ return {prompt:this.used?'Estação esgotada':'Usar a estação de melhoria',reticle:'pickup'}; }
  interact(ctx){
    const g=ctx.game;
    if(g.stations.isUsed(this.id)){ ctx.ui.msg('Estação esgotada',1.4); if(ctx.audio.deny) ctx.audio.deny(); return; }
    g.openStation(this.id);
  }
  // lâmpada âmbar e tela pronta quando disponível; apagada e "SEM CARGA" depois de usada
  setUsed(used){
    if(this.used===used) return; this.used=used;
    if(this.lampMat&&this.lampMat.color) this.lampMat.color.setHex(used?0x1a1612:0xffb04a);
    const t=this.screen, u=t&&t.userData; if(!u||!u.ctx) return;
    const g=u.ctx, w=u.canvas.width, h=u.canvas.height;
    g.fillStyle=used?'#0d0c0a':'#1d1405'; g.fillRect(0,0,w,h);
    g.fillStyle=used?'#4a4236':'#ffb04a'; g.font='bold 40px "Barlow Condensed", sans-serif'; g.textAlign='center'; g.textBaseline='middle';
    g.fillText(used?'SEM CARGA':'MELHORIA',w/2,h/2-12);
    g.font='24px "Barlow Condensed", sans-serif'; g.fillStyle=used?'#3a342b':'#d8a53a'; g.fillText(used?'—':'pronta · F',w/2,h/2+28);
    t.needsUpdate=true;
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

// ============================================================================
// Mecanismos dos Destinos (Casa das Bombas, Estufa, Arquivo). Todos falam com o PuzzleSystem por eventos:
//   game.puzzles.allow(hall,nome,dados) → pode agir?    game.puzzles.event(hall,nome,dados) → avisa a lógica da sala
// Mesmo contrato de Interactable (F interage; item na mão + botão direito usa o item).
// ============================================================================
const _snd=(ctx,n,...a)=>{ const f=ctx.audio&&ctx.audio[n]; if(f) f.apply(ctx.audio,a); };
const _can=(ctx,hall,name,data)=>{ const p=ctx.game.puzzles; return p.allow?p.allow(hall,name,data):true; };
const _tween=(o,key,from,to,dur=.35)=>{ o._tw={key,from,to,t:0,dur}; };
function _tweenStep(o,dt,target,axis){ const w=o._tw; if(!w) return false; w.t+=dt; const k=Math.min(1,w.t/w.dur); target.rotation[axis]=lerp(w.from,w.to,smooth(k)); if(k>=1){ o._tw=null; return false; } return true; }

// válvula-roda: cada F avança um passo (steps posições). Pode estar emperrada (precisa de martelo).
class Wheel extends Interactable{
  constructor(rot,o){ super(); this.rot=rot; this.hall=o.hall; this.id=o.id; this.steps=o.steps||4; this.state=o.state||0; this.label=o.label||'Válvula'; this.jam=o.jam||0; this._tw=null; this.rot.rotation.z=-this.state*Math.PI/2; }
  canInteract(ctx){ return this.jam>0?{prompt:`${this.label} emperrada — precisa de força`,reticle:'fragile'}:{prompt:`${this.label}: girar um passo`,reticle:'panel'}; }
  interact(ctx){
    if(this.jam>0){ ctx.ui.msg('Emperrada. Só cede à força.',1.8); _snd(ctx,'thud'); return; }
    const ok=_can(ctx,this.hall,'wheel',{id:this.id});
    if(ok!==true){ ctx.ui.msg(typeof ok==='string'?ok:'A válvula não responde.',1.6); _snd(ctx,'thud'); return; }
    this.setState((this.state+1)%this.steps,false); _snd(ctx,'tang',1); ctx.player.addShake(.08);
    ctx.game.puzzles.event(this.hall,'wheel',{id:this.id,state:this.state});
  }
  setState(s,instant){ const from=this.rot.rotation.z; this.state=s; const to=-s*Math.PI/2; if(instant||!this.world) this.rot.rotation.z=to; else { _tween(this,'z',from,to,.4); this.world.animated.push(this); } }
  update(dt){ return _tweenStep(this,dt,this.rot,'z'); }
  canUseItem(id,ctx){ return (id==='hammer'&&this.jam>0)?{reticle:'fragile',valid:ctx.hit.distance<=REACH}:null; }
  useItem(id,ctx){ if(id!=='hammer'||this.jam<=0) return; this.jam--; _snd(ctx,'tang',3-this.jam); ctx.fx.spawn('sparks',ctx.hit.point,ctx.normal,6); ctx.player.addShake(.2); if(!this.jam) ctx.ui.msg('A válvula cede.',1.8); }
}
// alavanca de dois estados; 'jam' = golpes de martelo para destravar; 'locked' bloqueia até a lógica liberar
class Lever extends Interactable{
  constructor(rot,o){ super(); this.rot=rot; this.hall=o.hall; this.id=o.id; this.label=o.label||'Alavanca'; this.on=!!o.on; this.jam=o.jam||0; this.denyMsg=o.deny||'Nada acontece.'; this._tw=null; this.rot.rotation.x=this.on?-.9:.9; }
  canInteract(ctx){ if(this.jam>0) return {prompt:`${this.label} emperrada`,reticle:'fragile'}; return {prompt:`${this.label}: ${this.on?'desligar':'acionar'}`,reticle:'panel'}; }
  interact(ctx){
    if(this.jam>0){ ctx.ui.msg('Emperrada. Só cede à força.',1.8); _snd(ctx,'thud'); return; }
    const ok=_can(ctx,this.hall,'lever',{id:this.id,on:!this.on});     // a lógica pode devolver o motivo (texto)
    if(ok!==true){ ctx.ui.msg(typeof ok==='string'?ok:this.denyMsg,1.8); _snd(ctx,'thud'); return; }
    this.setOn(!this.on,false); _snd(ctx,'tang',2); ctx.player.addShake(.1);
    ctx.game.puzzles.event(this.hall,'lever',{id:this.id,on:this.on});
  }
  setOn(on,instant){ const from=this.rot.rotation.x; this.on=on; const to=on?-.9:.9; if(instant||!this.world) this.rot.rotation.x=to; else { _tween(this,'x',from,to,.3); this.world.animated.push(this); } }
  update(dt){ return _tweenStep(this,dt,this.rot,'x'); }
  canUseItem(id,ctx){ return (id==='hammer'&&this.jam>0)?{reticle:'fragile',valid:ctx.hit.distance<=REACH}:null; }
  useItem(id,ctx){ if(id!=='hammer'||this.jam<=0) return; this.jam--; _snd(ctx,'tang',3-this.jam); ctx.fx.spawn('sparks',ctx.hit.point,ctx.normal,6); ctx.player.addShake(.22); if(!this.jam) ctx.ui.msg('A alavanca cede.',1.8); }
}
// válvula de purga (descansos do poço): solta vapor, a massa recua e fica parada PURGE.stun s; recarrega em PURGE.recharge s
class PurgeValve extends Interactable{
  constructor(rot,o){ super(); this.rot=rot; this.id=o.id; this.lamp=o.lamp; this.outlet=o.outlet; this.dir=o.dir; this.recharge=0; this._tw=null; this.rot.rotation.x=.9; this._lamp(); }
  get ready(){ return this.recharge<=0; }
  canInteract(){ return this.ready?{prompt:'Válvula de purga: soltar vapor',reticle:'panel'}:{prompt:`Purga recarregando · ${Math.ceil(this.recharge)} s`,reticle:'panel'}; }
  interact(ctx){
    if(!this.ready){ ctx.ui.msg(`O tanque ainda está enchendo. ${Math.ceil(this.recharge)} s.`,1.8); _snd(ctx,'deny'); return; }
    const m=ctx.game.mass; m.stun(PURGE.stun,PURGE.recoil); this.recharge=PURGE.recharge; this._lamp();
    _tween(this,'x',.9,-.9,.3); if(this.world&&!this.world.animated.includes(this)) this.world.animated.push(this);
    _snd(ctx,'tang',2); _snd(ctx,'hiss'); _snd(ctx,'boom'); ctx.player.addShake(.35);
    if(ctx.fx&&this.outlet) ctx.fx.spawn('air',this.outlet,this.dir,30);
    ctx.ui.msg(m.hold?`Vapor no poço. Lá embaixo ela se encolhe. ${PURGE.stun} s de folga.`:`O vapor desce chiando pelo poço. A massa recua e para. ${PURGE.stun} s.`,4);
  }
  // recarga (e o braço volta devagar para cima conforme o tanque enche); fica em world.animated até ficar pronta
  update(dt){
    const tw=_tweenStep(this,dt,this.rot,'x');
    if(this.recharge>0){ this.recharge=Math.max(0,this.recharge-dt); if(!tw) this.rot.rotation.x=lerp(.9,-.9,this.recharge/PURGE.recharge); if(this.recharge<=0) this._lamp(); }
    return tw||this.recharge>0;
  }
  _lamp(){ if(this.lamp) this.lamp.material=this.ready?MAT.glowGreen:MAT.glowAmber; }
}
// seletor de símbolo: cada F avança para o próximo símbolo e redesenha a face
class Dial extends Interactable{
  constructor(tex,o){ super(); this.tex=tex; this.hall=o.hall; this.id=o.id; this.symbols=o.symbols; this.state=o.state||0; this.label=o.label||'Seletor'; this.paint(); }
  paint(){ const g=this.tex.userData.ctx, c=this.tex.userData.canvas, sym=this.symbols[this.state];
    g.fillStyle='#10140f'; g.fillRect(0,0,c.width,c.height); g.strokeStyle='#5a6a4a'; g.lineWidth=6; g.strokeRect(4,4,c.width-8,c.height-8);
    g.fillStyle='#e3c768'; drawSymbol(g,sym,c.width/2,c.height/2,c.width*.28); this.tex.needsUpdate=true; }
  canInteract(){ return {prompt:`${this.label}: próximo símbolo`,reticle:'panel'}; }
  interact(ctx){
    if(!_can(ctx,this.hall,'dial',{id:this.id})){ ctx.ui.msg('O altar está inerte.',1.6); _snd(ctx,'thud'); return; }
    this.state=(this.state+1)%this.symbols.length; this.paint(); _snd(ctx,'tang',1);
    ctx.game.puzzles.event(this.hall,'dial',{id:this.id,state:this.state,symbol:this.symbols[this.state]});
  }
}
// leitor de cartão: usa o item 'card' (já existente no jogo) — o cartão é consumido
class Reader extends Interactable{
  constructor(mesh,lamp,o){ super(); this.mesh=mesh; this.lamp=lamp; this.hall=o.hall; this.id=o.id; this.label=o.label||'Leitor de cartão'; this.hint=o.hint||'Precisa de um cartão de acesso.'; this.ok=false; }
  canInteract(){ return this.ok?null:{prompt:`${this.label} — segure o cartão e use (botão direito)`,reticle:'panel'}; }
  interact(ctx){ if(!this.ok) ctx.ui.msg(this.hint,2.6); }
  canUseItem(id,ctx){ if(id!=='card'||this.ok) return null; const v=ctx.hit.distance<=REACH; return {reticle:v?'panel':'dot',valid:v}; }
  useItem(id,ctx){ if(id!=='card'||this.ok) return; const inv=ctx.items.inv; if(!inv.take('card')) return;
    const i=inv.slotOf('card'); if(i>=0&&inv.slots[i].count<=0){ inv.slots[i]=null; inv.version++; }   // o cartão é consumido: libera o espaço
    this.ok=true; if(this.lamp) this.lamp.material=MAT.glowGreen; _snd(ctx,'chime'); ctx.ui.msg('Cartão aceito.',2); if(ctx.items.holster) ctx.items.holster();
    ctx.game.puzzles.event(this.hall,'reader',{id:this.id}); }
}
// objeto que cede a golpes de martelo (vidro, armário, grade, raízes). onBreak(ctx) é chamado ao ceder.
class Smashable extends Interactable{
  constructor(mesh,o){ super(); this.mesh=mesh; this.hall=o.hall; this.id=o.id; this.hits=o.hits||2; this.left=this.hits; this.label=o.label||'Quebrar'; this.onBreak=o.onBreak||null; this.broken=false; this.fx=o.fx||'debris'; }
  canUseItem(id,ctx){ if(this.broken) return null; if(id==='hammer') return ctx.hit.distance<=REACH?{reticle:'fragile',valid:true}:{reticle:'dot',valid:false}; return null; }
  useItem(id,ctx){ if(id!=='hammer'||this.broken) return; this.left--; _snd(ctx,'hollow',1-this.left/this.hits); ctx.fx.spawn('chips',ctx.hit.point,ctx.normal,4); ctx.player.addShake(.22);
    this.mesh.rotation.z+=(Math.random()-.5)*.03;
    if(this.left<=0){ this.broken=true; ctx.fx.spawn(this.fx,this.mesh.position.clone(),ctx.normal,12); _snd(ctx,'crash'); ctx.player.addShake(.4);
      ctx.world.removeSolid(this.mesh); if(this.onBreak) this.onBreak(ctx); ctx.game.puzzles.event(this.hall,'smash',{id:this.id}); } }
}
// placa de nome (colecionável de narrativa; não ocupa o inventário)
class Tag extends Interactable{
  constructor(mesh,o){ super(); this.mesh=mesh; this.hall=o.hall; this.id=o.id; this.name=o.name; this.taken=false; }
  _nm(ctx){ return typeof this.name==='function'?this.name(ctx):this.name; }
  canInteract(ctx){ return this.taken?null:{prompt:`Recolher a placa de ${this._nm(ctx)}`,reticle:'pickup'}; }
  interact(ctx){ if(this.taken) return; this.taken=true; ctx.world.detach(this.mesh); _snd(ctx,'pickup');
    ctx.game.puzzles.event(this.hall,'tag',{id:this.id,name:this._nm(ctx)}); }
}
// decisão: 1º F lê o que será feito; 2º F confirma. Define a ROTA (e o final) — a primeira decisão vale.
class Decision extends Interactable{
  constructor(o){ super(); this.hall=o.hall; this.id=o.id; this.route=o.route; this.label=o.label; this.text=o.text; this.armed=false; }
  canInteract(ctx){ const p=ctx.game.puzzles; if(p.route&&p.route!==this.route) return {prompt:'Você já fez a sua escolha',reticle:'panel'}; return {prompt:this.armed?`CONFIRMAR: ${this.label}`:this.label,reticle:'panel'}; }
  interact(ctx){
    const p=ctx.game.puzzles;
    if(p.route){ ctx.ui.msg(p.route===this.route?'Está feito.':'Você já fez a sua escolha. Não há volta.',2.4); return; }
    if(!_can(ctx,this.hall,'decide',{route:this.route})){ ctx.ui.msg('Ainda não.',1.6); return; }
    if(!this.armed){ this.armed=true; ctx.ui.showNote(this.text+'\n\n(aperte F de novo para confirmar — não há volta)',true); _snd(ctx,'noise',.15,3000,.06); return; }
    ctx.game.puzzles.event(this.hall,'decide',{route:this.route});
  }
}
// nota cujo texto é calculado na hora (ex.: nome do jogador, estado do puzzle)
class LiveNote extends Note{ constructor(fn,term){ super('',term); this.fn=fn; } interact(ctx){ ctx.ui.showNote(this.fn(ctx),this.term); ctx.audio.noise(.15,3000,.06); } }

// soquete de prego: marca fixa na parede (vão liso). O prego entra exatamente no centro, a distância certa para o próximo tijolo.
// A parede continua aceitando prego em qualquer outro ponto de concreto; o soquete só garante um lugar bom e visível.
class NailSocket extends Interactable{
  constructor(world,pos,normal,ring){ super(); this.world=world; this.pos=pos; this.normal=normal; this.ring=ring; this.used=false; }
  canUseItem(id,ctx){
    if(id==='nails'){ const ok=!this.used&&ctx.hit.distance<=NAIL_REACH&&ctx.items.inv.count('nails')>0; return {reticle:ok?'nail-ok':'nail-bad',valid:ok}; }
    if(id==='hammer') return {reticle:ctx.hit.distance<=REACH?'impact':'dot',valid:ctx.hit.distance<=REACH};
    return null;
  }
  useItem(id,ctx){
    if(id==='nails'){ if(this.used||!ctx.items.inv.take('nails')) return; this.used=true; ctx.world.addNail(this.pos.clone(),this.normal.clone()); ctx.player.stats.pitonsUsed++;
      this.ring.material=MAT.socketUsed; ctx.audio.nailSet(); ctx.fx.spawn('chips',this.pos,this.normal,3); }
    else if(id==='hammer'){ ctx.audio.thud(); ctx.fx.spawn('chips',ctx.hit.point,this.normal,4); ctx.player.addShake(.12); }
  }
}
