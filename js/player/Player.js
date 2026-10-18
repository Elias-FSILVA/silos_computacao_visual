'use strict';
// ============================================================================
// js/player/Player.js — movimento, escalada com duas mãos, estamina
// Contrato público: position (pés), velocity, grounded, fellOff, maxHeightReached,
//                   stamina (getter), maxStamina, leftHand, rightHand,
//                   isClimbing, isHanging, grabbedSurface,
//                   pull, effort, pullFatigue, fatigueFx, needsPull (puxada corporal)
// Consome do World: platforms, spawnPoint, raycastTargets, addPiton(), touch()
// Superfície agarrada (userData): wallNormal fixa, ou normalAt(ponto, out) nos apoios contínuos (rachadura, cano, corda);
// gripCost = pegada extra por segundo (rachadura).
// Puxada: agarrado e segurando o botão, arrastar o mouse para baixo ergue o corpo (pull 0 = pendurado,
// 1 = queixo na borda). O corpo segue a puxada com inércia, cede devagar sem esforço e a fadiga dos braços
// (pullFatigue) reduz a eficiência, faz a câmera/mão tremer e, no nível crítico, drena a pegada.
// Regras por mão: a mão com item comum não agarra; a outra mão escala e puxa normalmente (inclusive pelo mouse).
// Braço travado (lockOff): pendurado com a outra mão ocupada por item (não cravado), o braço que segura trava na altura
// atual: não cede, gasta a pegada de um braço travado (6/s, não 9/s) e a fadiga sobe aos poucos. Não bloqueia a puxada.
// Conflito de entrada (aimConflict): só enquanto uma mão faz um uso ativo que MIRA (hand.aiming, escrito pelo
// ItemSystem: golpe do martelo, colocar prego, cartão) o mouse mira em vez de puxar. Só no desktop; no VR a mira é
// do controle. Sem ferramentas, nenhum dos dois acontece.
// hand.anchor: 'hand' (pegada da mão nua), 'axe' (picareta cravada) ou null.
// Picareta: axeTarget/anchorAxe/releaseAxe usam a MESMA âncora da mão (inContact/point/normal): mola, puxada, fadiga,
// mantle, vento e salto são os de sempre. Fixar custa 5 × gripDrainMultiplier; sustentar é o dreno da mão SEM gripCost.
// Fincada rasa (concreto, hand.bite='shallow'): custo e dreno × AXE_SHALLOW, e solta sozinha após AXE_SHALLOW.hold s.
// Modo VR (opcional): com `xr` (VRPlayer) ligado, mira e agarre saem dos controles, a puxada vem do braço
// (pullBy) e a câmera é posicionada pelo rig; sem ele, tudo segue como no mouse e teclado.
// Colisão: Collision.collideBody contra world.platforms (caixas, caixas giradas e setores anelares) + world.guard
// (a parede do poço só se atravessa pelas aberturas). Vento: world.wind(pos) dá a velocidade do ar no peito; solto, o
// corpo é acelerado na direção do fluxo (WIND_K); pendurado, o fluxo desloca o corpo, gasta a pegada e, forte demais
// (WIND_TEAR), arranca as mãos da parede.
// ============================================================================
// PULL_GAIN: puxada por pixel de mouse (~130px levam de pendurado a puxado, descansado)
const PULL_GAIN=.0075, PULL_MANTLE=.5, FATIGUE_CRIT=.85;
const WIND_K=2.0, WIND_TEAR=24, WIND_DRAIN=.35;   // arrasto do ar (1/s) · força que arranca as mãos (m/s²) · pegada gasta por m/s² de vento
// Ajustes de movimento (não métricas de percurso): salto agarrado sobe sem recuo automático.
// A componente horizontal só existe por comando direcional, relativa ao olhar.
const PLAYER_PHYSICS={wallJumpControl:2.4,airControl:4.2,coyoteTime:.12};
// picareta no concreto: custo de fixar ×cost, dreno pendurado ×drain, e a ponta escapa sozinha depois de `hold` segundos
const AXE_SHALLOW={cost:2,drain:2,hold:2.5};
const REDUCED_MOTION=(()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();
class Hand{
  constructor(name,side){ this.name=name; this.side=side; this.point=new V3(); this.normal=new V3(); this.reset(); }
  reset(){ this.occupied=false; this.aiming=false; this.anchor=null; this.bite=null; this.biteT=0; this.isGrabbing=false; this.inContact=false; this.surface=null; this.stamina=PLAYER_BASE_ATTRIBUTES.maxStamina; this.cooldown=0; this.pull=0; this.exhausted=false; }
  get state(){ return this.isGrabbing?'closed':'open'; }
}
const _e=new V3(), _t=new V3(), _d=new V3(), _f=new V3(), _r=new V3(), _mv=new V3(), _p=new V3(), _q=new V3(), _n=new V3(), _c0=new THREE.Vector2(0,0), _wq=new THREE.Quaternion();
const IMPACT_WINDOW=.25;   // s: impactos mais próximos que isso cobram só o excedente
// gesto de apertar botão (painel): duração e distância pulso→ponta do indicador
const PRESS_T=.34, PRESS_TIP=-HandModel.indexTip(1,new V3()).z;
const _axeM=new THREE.Matrix4(), _pm=new THREE.Matrix4(), _pqa=new THREE.Quaternion(), _pqb=new THREE.Quaternion(), _pup=new V3(), _px=new V3(1,0,0);

class Player{
  constructor(scene,camera,world,{perkCatalog=PERK_DEFS}={}){
    this.scene=scene; this.camera=camera; this.world=world;
    this.leftHand=new Hand('left',-1); this.rightHand=new Hand('right',1);
    this.hands=[this.leftHand,this.rightHand];
    this.attributes=new PlayerAttributes({catalog:perkCatalog,onChange:effective=>{
      // Capacidade menor limita a reserva; capacidade maior nunca preenche a diferença.
      this.hands.forEach(h=>{ h.stamina=clamp(h.stamina,0,effective.maxStamina); });
    }});
    this.position=new V3(); this.velocity=new V3(); this._prev=new V3();
    this.ray=new THREE.Raycaster(); this.listeners={}; this.xr=null;
    this.windF=new V3(); this._colOpt={guard:(p,prev,v)=>{ if(this.world.guard) this.world.guard(p,prev,v); }};
    this.handModels=this.hands.map(h=>new HandModel(h.side)); this.handModels.forEach(hm=>scene.add(hm.root));
    this.health=new PlayerHealth();   // fonte única do HP (HUD, VR, mãos e console só leem)
    this.reset();
  }
  on(t,f){ (this.listeners[t]=this.listeners[t]||[]).push(f); }
  emit(t,d){ (this.listeners[t]||[]).forEach(f=>f(d)); }
  reset(){
    this._axeContact=[null,null];   // ContactFrame visual da picareta cravada, por mão (AxeContactPose)
    this._normalMotion=[]; this._normalVelocity=new V3(); this._normalClimbOffset=new V3(); this._normalClimbPull=0; this._normalPullDriven=false;
    this.attributes.clearPerks();
    this.health.reset(); this.handModels.forEach(hm=>{ hm.setWear('healthy',{instant:true}); hm.hurtTremor=0; });
    this._impactWin={t:0,charged:0};   // janela de excedente entre impactos próximos
    const w=this.world;
    this.position.copy(w.spawnPoint); this.velocity.set(0,0,0); this._prev.copy(this.position);
    this.yaw=w.spawnYaw; this.pitch=.1;
    this.grounded=true; this.fellOff=false; this.dead=false; this.deathReason=null;
    this.maxHeightReached=0; this.mantle=null; this.shake=0; this.coyoteT=0;
    this.stats=new PlayerStats();
    // puxada: pull (corpo) persegue pullTarget (comando do mouse); effort/jolt alimentam câmera e mão
    this.pull=0; this.pullTarget=0; this.pullIn=0; this.effort=0; this.jolt=0;
    this.pullFatigue=0; this.fatigueFx=0; this.restT=0; this.fatigueWarned=false; this.fxT=0; this.pulledNow=false;
    this.hands.forEach(h=>h.reset());
    this.press=[null,null]; this.point=[false,false];   // gesto do indicador (painel); point: VR, mão perto do painel
    this.stats.reset();
    this.viewmodelVisible=true;
    this.windAir=null; this.windG=0; this.windLevel=0; this.windFan=null; this.windF.set(0,0,0);
  }
  // Descontinuidade de debug: cancelar intenção/âncoras, nunca resetar recursos ou métricas da run.
  clearDebugTransient(){
    this._axeContact=[null,null];
    for(const h of this.hands){h.inContact=false;h.isGrabbing=false;h.anchor=null;h.surface=null;h.pull=0;h.aiming=false;}
    this.mantle=null;this.press=[null,null];this.point=[false,false];
    this.pull=this.pullTarget=this.pullIn=this.effort=this.jolt=0;this.pulledNow=false;
    this.velocity.set(0,0,0);this._prev.copy(this.position);this.grounded=false;this.fellOff=false;this.coyoteT=0;this.landDip=0;this.shake=0;
    this.windAir=null;this.windG=this.windLevel=0;this.windFan=null;this.windF.set(0,0,0);
    this._normalMotion=[];this._normalVelocity.set(0,0,0);this._normalClimbOffset.set(0,0,0);this._normalClimbPull=0;this._normalPullDriven=false;
    this._bob=0;this._vmT=0;
    this.handModels.forEach(hm=>{hm.vmLocal=new V3(hm.side*.22,-.22,-.36);hm.wasContact=false;});
  }
  // ---------- estado derivado ----------
  get maxStamina(){ return this.attributes.effective.maxStamina; }
  get stamina(){ return clamp(Math.min(this.leftHand.stamina,this.rightHand.stamina),0,this.maxStamina); }
  get isClimbing(){ return this.hands.some(h=>h.inContact); }
  get isHanging(){ return this.isClimbing&&!this.grounded; }
  get grabbedSurface(){ const h=this.hands.find(h=>h.inContact); return h?h.surface:null; }
  get reach(){ const a=this.attributes.effective; return this.stamina<20?a.tiredReach:a.reach; }
  eyePos(out){ return out.set(this.position.x,this.position.y+EYE,this.position.z); }
  addShake(a){ this.shake=Math.max(this.shake,a); }
  // ---------- entrada ----------
  // Pendurado e segurando: o movimento físico do mouse para baixo vira puxada (independe de invertY);
  // só uma fração vaza para a visão, para ainda ser possível olhar para baixo devagar.
  look(dx,dy,s){
    const k=.0022*s.sensitivity; this.yaw-=dx*k;
    if(dy>0&&this.canPull){ this.pullIn+=dy*s.sensitivity; dy*=.2; }
    this.pitch=clamp(this.pitch-(s.invertY?-dy:dy)*k,-1.5,1.5);
  }
  // VR: o braço que segura descendo vira puxada (mesma unidade do mouse)
  pullBy(px){ if(this.canPull) this.pullIn+=px; }
  // VR: passos reais no quarto; o corpo acompanha com colisão (só no chão e solto)
  stepBy(d){
    if(this.dead||this.mantle||!this.grounded||this.isClimbing) return false;
    this._prev.copy(this.position); this.position.add(d);
    const proposed=this.trackNormalMotion?this.position.clone():null;
    const vy=this.velocity.y; this.velocity.y=0; this._collide(false); this.velocity.y=vy;
    if(proposed)this._normalResolved(proposed,d);
    return true;
  }
  // Evidência de locomoção, não delta de câmera/input. Semântica física permanece no caminho original.
  consumeNormalMotion(){const segments=this._normalMotion||[];this._normalMotion=[];return {segments};}
  _normalSegment(from,to){if(this.trackNormalMotion&&from.distanceToSquared(to)>1e-12)this._normalMotion.push({from:from.clone(),to:to.clone(),source:'normal'});}
  _normalResolved(proposed,control){
    if(!this.trackNormalMotion||control.lengthSq()<1e-12||this.position.clone().sub(this._prev).dot(control)<=1e-12)return;
    // Contrafactual: a mesma colisão, sem a contribuição locomotora demonstrada. Vento/gravidade ficam nos dois lados.
    const passive=proposed.clone().sub(control),vel=this.velocity.clone();
    collideBody(this.world.platforms,passive,vel,this._prev,this._colOpt);
    passive.x=clamp(passive.x,-SILO_R,SILO_R);passive.z=clamp(passive.z,-SILO_R,SILO_R);
    this._normalSegment(passive,this.position);
  }
  // conflito de entrada: durante um uso ativo que mira, o mouse mira e não puxa
  // em VR a mira é do controle, então o braço puxa mesmo durante o uso
  get canPull(){ return !this.mantle&&!this.dead&&(!this.aimConflict||!!this.xr)&&this.pull<.995&&this.hands.some(h=>h.inContact&&h.isGrabbing); }
  get aimConflict(){ return this.isHanging&&this.hands.some(h=>h.aiming); }
  // braço travado: pendurado com a outra mão ocupada por item (a picareta cravada é âncora, não item na mão)
  get lockOff(){ return this.isHanging&&this.hands.some(h=>h.occupied&&h.anchor!=='axe'); }
  // pendurado numa borda, mas baixo demais para subir: a UI sugere puxar
  get needsPull(){ return this.isHanging&&!this.mantle&&this.pull<PULL_MANTLE&&this.hands.some(h=>h.inContact&&h.surface.userData.plat); }
  setGrab(i,down){
    const h=this.hands[i]; if(!h||this.dead||(down&&this.debugFrozen)) return;   // voo de debug: nenhum agarre novo
    h.isGrabbing=down;
    if(!down&&h.inContact) this._release(h);
    if(down&&!h.inContact) this._tryGrab(h);
  }
  releaseAll(){ this.hands.forEach(h=>{ h.isGrabbing=false; if(h.inContact) this._release(h); }); }
  // gesto de apertar um botão com o indicador (só visual: quem chama já registrou o número).
  // Desktop: a mão livre vai até `target` e volta. VR (target null): o dedo empurra para frente onde a mão está.
  pressButton(target,prefer=1){
    const free=i=>{ const h=this.hands[i]; return !h.inContact&&!h.occupied; };
    const i=free(prefer)?prefer:free(1-prefer)?1-prefer:-1; if(i<0) return;
    this.press[i]={t:0,target:target?target.clone():null};
  }
  // em VR, mira com o controle (i: 0 esquerda, 1 direita)
  aim(far,i=1){
    if(this.xr){ if(!this.xr.ray(i,_p,_q)) return null; this.ray.set(_p,_q); }
    else this.ray.setFromCamera(_c0,this.camera);
    this.ray.far=far; return this._cast();
  }
  _cast(){ const hits=this.ray.intersectObjects(this.world.raycastTargets,false); return hits.find(h=>h.object.userData.alive!==false)||null; }
  // VR: 1) o que o controle aponta de perto; 2) braço estendido: do ombro passando pela mão;
  // 3) o que está atrás da mão vista da cabeça. 2 e 3 vão até o mesmo alcance do desktop (this.reach)
  // ok(objeto): o que conta como alvo (mão: userData.grab; picareta: isAxeSurface)
  _grabHit(h,ok=o=>!!o.userData.grab){
    if(!this.xr) return this.aim(this.reach);
    const i=this.hands.indexOf(h), xr=this.xr;
    const grab=()=>{ const hit=this._cast(); return hit&&ok(hit.object)?hit:null; };
    let hit=null;
    if(xr.ray(i,_p,_q)){ this.ray.set(_p,_q); this.ray.far=xr.grabReach; hit=grab(); if(hit) return hit; }
    if(!xr.handPos(i,_p)) return null;
    for(const from of ['shoulder','eye']){
      if(from==='eye') _e.setFromMatrixPosition(this.camera.matrixWorld); else xr.shoulderPos(i,_e);
      _d.subVectors(_p,_e); const L=_d.length(); if(L<xr.armMin) continue;
      this.ray.set(_e,_d.multiplyScalar(1/L)); this.ray.far=this.reach; hit=grab(); if(hit) return hit;
    }
    return null;
  }
  canMantle(){
    if(this.mantle) return null;
    // pendurado, é preciso ter puxado o corpo até perto da borda; com os pés no chão, basta alcançar
    if(!this.grounded&&this.pull<PULL_MANTLE) return null;
    const eye=this.eyePos(_e);
    const h=this.hands.find(h=>h.inContact&&h.surface.userData.plat&&eye.y>=h.surface.userData.plat.bottom-1.3);
    return h||null;
  }
  _startMantle(led){
    const pl=led.surface.userData.plat, q=solidClampIn(pl,led.point.x,led.point.z,.3);   // ponto da borda (caixa, girada ou curva) recuado 30 cm
    this.mantle={t:0,from:this.position.clone(),to:new V3(q.x,pl.top,q.z)};
    this.hands.forEach(h=>{ if(h.inContact){ h.stamina=Math.max(0,h.stamina-8); this._release(h); } h.isGrabbing=false; });
    this.emit('mantle');
  }
  jump(input={x:0,y:0}){
    if(this.dead||this.mantle||this.debugFrozen) return;
    const attributes=this.attributes.effective;
    const held=this.hands.filter(h=>h.inContact);
    if(held.length){
      const led=this.canMantle();
      if(led){ this._startMantle(led); return; }
      if(this.needsPull){ this.emit('needPull'); return; }
      if(held.some(h=>h.stamina<attributes.wallJumpStaminaCost)){ this.emit('weak'); return; }
      // Soltar não é ricochetear: nem a normal da parede nem a oscilação da mola
      // decidem a trajetória. Sem direção, o impulso é estritamente vertical.
      _f.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw)); _r.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
      _mv.set(0,0,0).addScaledVector(_f,input.y).addScaledVector(_r,input.x); if(_mv.lengthSq()>1) _mv.normalize();
      held.forEach(h=>{ h.stamina-=attributes.wallJumpStaminaCost; this._release(h); h.cooldown=.22; });
      this.velocity.set(_mv.x*PLAYER_PHYSICS.wallJumpControl,attributes.wallJumpSpeed,_mv.z*PLAYER_PHYSICS.wallJumpControl);
      if(this.trackNormalMotion)this._normalVelocity.copy(this.velocity);
      this.grounded=false; this.coyoteT=0; this.stats.recordJump(true); this.emit('walljump');
    } else if(this.grounded||this.coyoteT>0){ this.velocity.y=attributes.jumpSpeed; if(this.trackNormalMotion)this._normalVelocity.y=attributes.jumpSpeed; this.grounded=false; this.coyoteT=0; this.stats.recordJump(); this.emit('jump'); }
  }
  restoreStamina(){ this.hands.forEach(h=>{ h.stamina=this.maxStamina; h.exhausted=false; }); this.stats.pillsUsed++; }
  die(reason){
    if(this.dead) return;
    this.health.zero(reason);
    this.dead=true; this.deathReason=reason; if(reason==='fall'){ this.fellOff=true; this.stats.recordFall(); }
    this.attributes.clearPerks();
    this.releaseAll(); this.emit('death',reason);
  }
  // única entrada de dano; se zerar, a morte sai pelo die() de sempre
  damage(amount,source='debug'){
    if(this.dead) return {applied:0,value:this.health.value,died:false};
    const r=this.health.damage(amount,{source});
    if(r.applied>0){ this.emit('damage',{amount:r.applied,source,value:r.value,state:this.health.state}); }
    if(r.died) this.die(source);
    return r;
  }
  heal(amount,source='debug'){ return this.dead?{applied:0,value:this.health.value}:this.health.heal(amount,{source}); }
  // ---------- mãos ----------
  _tryGrab(h){
    if(h.cooldown>0||h.exhausted||h.occupied||this.mantle||this.dead) return false;
    const hit=this._grabHit(h); if(!hit||!hit.object.userData.grab) return false;
    const fall=-this.velocity.y;
    if(!this.isClimbing&&fall>12){
      h.stamina=Math.max(0,h.stamina-25); h.cooldown=.35; this.stats.recordSlip(); this.emit('slip',h); return false;
    }
    h.stamina=Math.max(0,h.stamina-Math.max(0,fall-4)*2.2);
    h.inContact=true; h.anchor='hand'; h.surface=hit.object; h.point.copy(hit.point);
    const u=hit.object.userData, wn=u.wallNormal;
    if(u.normalAt) u.normalAt(hit.point,h.normal);          // apoio contínuo (rachadura, cano, corda): normal no ponto agarrado
    else if(wn) h.normal.copy(wn); else h.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    this._fitPull();
    this.world.touch(hit.object);
    this.emit('grab',h);
    return true;
  }
  // ---------- picareta ----------
  // que fincada a picareta dá neste ponto: 'deep' | 'shallow' (só em face de parede) | null
  _biteAt(hit){
    const kind=hit&&axeBiteOf(hit.object); if(kind!=='shallow') return kind||null;
    const u=hit.object.userData;
    if(u.normalAt) u.normalAt(hit.point,_n); else if(u.wallNormal) _n.copy(u.wallNormal);
    else if(hit.face) _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld); else return null;
    return Math.abs(_n.y)<.5?'shallow':null;          // piso e teto de concreto não aceitam
  }
  // alvo da picareta da mão i: mesmo raio e alcance do agarre; rocha/rachadura (hit.bite 'deep') ou parede de concreto ('shallow')
  axeTarget(i){ const h=this.hands[i]; if(!h) return null; const hit=this._grabHit(h,o=>!!axeBiteOf(o)), bite=this._biteAt(hit); if(!bite) return null; hit.bite=bite; return hit; }
  // o que o golpe da picareta da mão i atinge, aceite ou não: null = nada ao alcance (golpe no vazio);
  // senão {hit, bite} com bite null para superfície errada e flat=true para concreto em piso/teto
  axeProbe(i){ const h=this.hands[i]; if(!h) return null; const hit=this._grabHit(h,()=>true); if(!hit) return null;
    const bite=this._biteAt(hit); hit.bite=bite; return {hit,bite,flat:!bite&&axeBiteOf(hit.object)==='shallow'}; }
  // crava a picareta da mão i no ponto `hit`; falha sem cobrar nada ('state' | 'surface' | 'reach' | 'stamina' | 'slip')
  anchorAxe(i,hit){
    const h=this.hands[i];
    if(!h||this.dead||this.mantle||h.inContact||h.cooldown>0||h.exhausted) return {ok:false,reason:'state'};
    const bite=this._biteAt(hit);
    if(!bite) return {ok:false,reason:'surface'};
    if(!this.xr&&hit.distance>this.reach+1e-6) return {ok:false,reason:'reach'};
    const cost=5*this.attributes.effective.gripDrainMultiplier*(bite==='shallow'?AXE_SHALLOW.cost:1);
    if(h.stamina<cost) return {ok:false,reason:'stamina'};
    // caindo rápido, escorrega como a mão (mesma regra do _tryGrab)
    const fall=-this.velocity.y;
    if(!this.isClimbing&&fall>12){ h.stamina=Math.max(0,h.stamina-25); h.cooldown=.35; this.stats.recordSlip(); this.emit('slip',h); return {ok:false,reason:'slip'}; }
    h.stamina=Math.max(0,h.stamina-cost-Math.max(0,fall-4)*2.2);
    h.inContact=true; h.isGrabbing=true; h.anchor='axe'; h.bite=bite; h.biteT=0; h.surface=hit.object; h.point.copy(hit.point);
    const u=hit.object.userData, wn=u.wallNormal;
    if(u.normalAt) u.normalAt(hit.point,h.normal); else if(wn) h.normal.copy(wn); else h.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    this._fitPull(); this.world.touch(hit.object);
    this.emit('axeAnchor',h);
    return {ok:true,reason:null,bite};
  }
  // desprende a picareta da mão i (não mexe em pegada de mão nua)
  releaseAxe(i){ const h=this.hands[i]; if(!h||h.anchor!=='axe') return; h.isGrabbing=false; if(h.inContact) this._release(h); }
  // a picareta da mão h foi arrancada (exaustão, vento, superfície que sumiu)
  _dislodge(h){ if(h.anchor==='axe') this.emit('axeDislodged',h); }
  _release(h){
    h.inContact=false; h.anchor=null; h.bite=null; h.biteT=0; h.surface=null; h.pull=0;
    if(!this.isClimbing){ this.pull=this.pullTarget=0; if(this.velocity.length()>7) this.velocity.setLength(7); }
  }
  // [pendurado, puxado] abaixo da pegada; puxado na parede = olhos um pouco acima da pegada (peito na borda)
  static _span(h){ const bottom=h.normal.y<-.5; return bottom?[.95,.3]:[.85,-.1]; }
  _anchor(h,eye){
    const t=h.point.clone(); const n=_q.set(h.normal.x,0,h.normal.z);
    if(n.lengthSq()<.01){ n.set(eye.x-h.point.x,0,eye.z-h.point.z); if(n.lengthSq()<1e-4) n.set(1,0,0); n.normalize().multiplyScalar(.3); }
    else n.normalize().multiplyScalar(.5);
    t.add(n);
    const [hang,pulled]=Player._span(h);
    t.y-=lerp(hang,pulled,h.pull);
    return t;
  }
  // Ao agarrar, escolhe a puxada que mantém os olhos onde estão: sem tranco ao trocar de pegada
  // nem ao agarrar algo na altura do rosto (o corpo depois cede sozinho se não houver esforço).
  _fitPull(){
    const held=this.hands.filter(h=>h.inContact); if(!held.length) return;
    if(this.trackNormalMotion){this._normalVelocity.set(0,0,0);this._normalClimbOffset.set(0,0,0);this._normalClimbPull=0;this._normalPullDriven=false;}
    let base=0, span=0;
    for(const h of held){ const [hang,pulled]=Player._span(h); base+=h.point.y-hang; span+=hang-pulled; }
    base/=held.length; span/=held.length; if(held.length===1) base-=.12;
    const p=clamp((this.position.y+EYE-base)/span,0,1);
    this.pull=this.pullTarget=p; held.forEach(h=>{ h.pull=p; });
  }
  // ---------- simulação ----------
  update(dt,input){
    if(this.dead) return;
    if(this._impactWin.t>0) this._impactWin.t-=dt;
    this.hands.forEach(h=>{
      if(h.cooldown>0) h.cooldown-=dt;
      if(h.inContact&&h.surface.userData.alive===false){ this._dislodge(h); this._release(h); this.emit('crumble',h); }
      // fincada rasa no concreto: a ponta escapa sozinha
      else if(h.inContact&&h.anchor==='axe'&&h.bite==='shallow'&&!this.debugFrozen&&(h.biteT+=dt)>=AXE_SHALLOW.hold){ this._dislodge(h); this._release(h); h.cooldown=.25; this.emit('axeSlip',h); }
    });
    this.hands.forEach(h=>{ if(h.isGrabbing&&!h.inContact) this._tryGrab(h); });
    this._prev.copy(this.position);
    this._wind(); if(this.dead) return;
    if(this.grounded) this.coyoteT=PLAYER_PHYSICS.coyoteTime; else this.coyoteT=Math.max(0,this.coyoteT-dt);
    const held=this.hands.filter(h=>h.inContact);
    if(this.mantle) this._mantle(dt);
    else if(held.length) this._climb(dt,input,held);
    else this._free(dt,input);
    if(this.dead) return;
    const climbing=this.isClimbing;
    this.hands.forEach(h=>{
      if(h.inContact) return;
      const a=this.attributes.effective;
      const r=(this.grounded&&!climbing)?a.groundRecovery:(climbing?a.freeHandRecovery:0);
      h.stamina=clamp(h.stamina+r*dt,0,this.maxStamina);
      if(h.exhausted&&h.stamina>=30) h.exhausted=false;
    });
    this._fatigue(dt,climbing);
    this.maxHeightReached=Math.max(this.maxHeightReached,this.position.y);
    if(this.shake>0) this.shake=Math.max(0,this.shake-dt*1.5);
  }
  // Fadiga dos braços: sobe com o esforço de puxar e com o tempo travado lá em cima; só começa a
  // recuperar depois de um respiro e nunca de uma vez. fatigueFx é a versão suavizada usada nos efeitos.
  _fatigue(dt,climbing){
    this.pullIn=0;
    if(!climbing){ this.effort*=Math.exp(-6*dt); this.jolt*=Math.exp(-6*dt); }
    const f=this.pullFatigue;
    const gain=climbing?this.effort*.08+(this.grounded?0:this.pull*.03+(this.lockOff?.035:0)):0;
    if(gain>.02){ this.pullFatigue=Math.min(1,f+gain*dt*this.attributes.effective.fatigueGainMultiplier); this.restT=0; }
    else {
      this.restT+=dt;
      if(this.restT>.8){ const r=climbing?.035:(this.grounded?.14:.07); this.pullFatigue=Math.max(0,f-r*dt*this.attributes.effective.fatigueRecoveryMultiplier*(.4+.6*smooth(Math.min(1,(this.restT-.8)/1.5)))); }
    }
    const tgt=smooth(clamp((this.pullFatigue-.2)/.8,0,1));
    this.fatigueFx+=(tgt-this.fatigueFx)*(1-Math.exp(-(tgt>this.fatigueFx?3:1.2)*dt));
    if(climbing&&!this.fatigueWarned&&this.pullFatigue>=FATIGUE_CRIT){ this.fatigueWarned=true; this.emit('armsFailing'); }
    if(this.fatigueWarned&&this.pullFatigue<.6) this.fatigueWarned=false;
  }
  // vento: velocidade do ar no peito (world.wind) → força windF = WIND_K·ar; nas pás de um exaustor, morte
  _wind(){
    this.windAir=null; this.windG=0; this.windFan=null; this.windLevel=0; this.windF.set(0,0,0);
    const w=this.world.wind?this.world.wind(this.position):null; if(!w) return;
    if(w.kill){ this.die('fan'); return; }
    this.windAir=w.air; this.windG=w.g; this.windFan=w.fan; this.windF.copy(w.air).multiplyScalar(WIND_K);
    this.windLevel=this.windF.length()/WIND_TEAR;
  }
  _mantle(dt){
    const m=this.mantle; m.t+=dt/.45; const k=Math.min(1,m.t), e=smooth(k);
    const normalFrom=this.trackNormalMotion?this.position.clone():null;
    this.position.lerpVectors(m.from,m.to,e); this.position.y+=Math.sin(k*Math.PI)*.2;
    if(normalFrom)this._normalSegment(normalFrom,this.position);
    if(k>=1){ this.mantle=null; this.velocity.set(0,0,0); this.grounded=true; }
  }
  _free(dt,input){
    _f.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw)); _r.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    _mv.set(0,0,0).addScaledVector(_f,input.y).addScaledVector(_r,input.x); if(_mv.lengthSq()>1) _mv.normalize();
    const v=this.velocity;
    if(this.grounded){ const k=Math.min(1,dt*12); v.x+=(_mv.x*3.4-v.x)*k; v.z+=(_mv.z*3.4-v.z)*k; }
    else { v.x+=_mv.x*PLAYER_PHYSICS.airControl*dt; v.z+=_mv.z*PLAYER_PHYSICS.airControl*dt; v.x*=1-.10*dt; v.z*=1-.10*dt; }
    if(this.trackNormalMotion){
      const n=this._normalVelocity;
      if(this.grounded){const k=Math.min(1,dt*12);n.x+=(_mv.x*3.4-n.x)*k;n.z+=(_mv.z*3.4-n.z)*k;}
      else {n.x=(n.x+_mv.x*PLAYER_PHYSICS.airControl*dt)*(1-.10*dt);n.z=(n.z+_mv.z*PLAYER_PHYSICS.airControl*dt)*(1-.10*dt);}
    }
    // vento: acelera rumo à velocidade do ar ao longo do fluxo (o arrasto cresce com a força do fluxo: g)
    const a=this.windAir;
    if(a){ const u=a.length(); if(u>1e-4){ const nx=a.x/u, ny=a.y/u, nz=a.z/u, vn=v.x*nx+v.y*ny+v.z*nz, g=this.windG;
      v.x+=WIND_K*(a.x-g*vn*nx)*dt; v.y+=WIND_K*(a.y-g*vn*ny)*dt; v.z+=WIND_K*(a.z-g*vn*nz)*dt; } }
    v.y-=this.attributes.effective.gravity*dt;
    if(this.trackNormalMotion&&a){const u=a.length();if(u>1e-4){const axis=a.clone().divideScalar(u),n=this._normalVelocity;n.addScaledVector(axis,-WIND_K*this.windG*n.dot(axis)*dt);}}
    this.position.addScaledVector(v,dt);
    const proposed=this.trackNormalMotion?this.position.clone():null;
    this._collide(true);
    if(proposed){this._normalResolved(proposed,this._normalVelocity.clone().multiplyScalar(dt));for(const k of ['x','y','z'])if(Math.abs(this.velocity[k])<1e-8)this._normalVelocity[k]=0;}

  }
  _climb(dt,input,held){
    // fluxo forte demais: arranca as mãos (o corpo segue com o ar no quadro seguinte)
    const wf=this.windF.length();
    if(wf>WIND_TEAR){ held.forEach(h=>{ this._dislodge(h); this._release(h); h.cooldown=.6; }); this.emit('windTear'); this._free(dt,input); return; }
    const eye=this.eyePos(_e), tgt=_t.set(0,0,0),normalPullBefore=this.pull,commandedPull=this.pullIn>0;
    this._pullUp(dt,held);
    for(const h of held) tgt.add(this._anchor(h,eye));
    tgt.divideScalar(held.length);
    if(held.length===1) tgt.y-=.12;
    if(wf>0) tgt.addScaledVector(this.windF,1/(held.length===2?55:38));   // o fluxo desloca o corpo pendurado
    _r.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    tgt.addScaledVector(_r,input.x*.32);
    const low=Math.min(...held.map(h=>h.stamina));
    if(low<20){ const k=(20-low)/20*.05; tgt.x+=(Math.random()-.5)*k; tgt.y+=(Math.random()-.5)*k; tgt.z+=(Math.random()-.5)*k; }
    const K=held.length===2?55:38, D=2*Math.sqrt(K)*.62, v=this.velocity;
    v.x+=((tgt.x-eye.x)*K-v.x*D)*dt; v.y+=((tgt.y-eye.y)*K-v.y*D)*dt; v.z+=((tgt.z-eye.z)*K-v.z*D)*dt;
    eye.addScaledVector(v,dt);
    // Snapshot somente para proveniência, antes da projeção não linear do braço.
    const normalProposed=this.trackNormalMotion?{eye:eye.clone(),velocity:v.clone()}:null;
    for(const h of held){
      _d.subVectors(eye,h.point); const L=_d.length();
      if(L>1.15){ _d.multiplyScalar(1/L); eye.copy(h.point).addScaledVector(_d,1.15); const vr=v.dot(_d); if(vr>0) v.addScaledVector(_d,-vr); }
    }
    this.position.set(eye.x,eye.y-EYE,eye.z);
    this._collide(false);
    if(normalProposed){
      const n=this._normalVelocity,offset=this._normalClimbOffset;
      // Diferença entre a mola física e a contrafactual sem comandos voluntários.
      // O offset é histórico; sua derivada sozinha não atravessa corretamente tether/colisão.
      n.multiplyScalar(Math.max(0,1-D*dt));n.addScaledVector(offset,-K*dt);
      const right=new V3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
      n.addScaledVector(right,input.x*.32*K*dt);
      if(commandedPull&&held.some(h=>h.isGrabbing))this._normalPullDriven=true;
      if(this._normalPullDriven)this._normalClimbPull=Math.max(0,this._normalClimbPull+this.pull-normalPullBefore);
      const span=held.reduce((sum,h)=>{const [a,b]=Player._span(h);return sum+a-b;},0)/held.length;
      n.y+=this._normalClimbPull*span*K*dt;
      const passiveEye=normalProposed.eye.sub(offset).addScaledVector(n,-dt);
      const passiveVelocity=normalProposed.velocity.sub(n);
      // Resolver o contrafactual pela MESMA restrição, sem tocar no estado físico.
      for(const h of held){
        const d=passiveEye.clone().sub(h.point),length=d.length();
        if(length>1.15){d.divideScalar(length);passiveEye.copy(h.point).addScaledVector(d,1.15);const vr=passiveVelocity.dot(d);if(vr>0)passiveVelocity.addScaledVector(d,-vr);}
      }
      const passive=passiveEye;passive.y-=EYE;
      const passivePrev=this._prev.clone().sub(offset);
      collideBody(this.world.platforms,passive,passiveVelocity,passivePrev,this._colOpt);
      passive.x=clamp(passive.x,-SILO_R,SILO_R);passive.z=clamp(passive.z,-SILO_R,SILO_R);
      const nextOffset=this.position.clone().sub(passive),control=nextOffset.clone().sub(offset);
      n.copy(this.velocity).sub(passiveVelocity);offset.copy(nextOffset);
      if(control.lengthSq()>1e-12&&this.position.clone().sub(this._prev).dot(control)>1e-12)this._normalSegment(this.position.clone().sub(control),this.position);
    }

    // pegada: custo base + esforço de puxar; com os braços no limite, a pegada escorrega depressa
    const base=held.length===2?3:(this.lockOff?6:9), crit=clamp((this.pullFatigue-FATIGUE_CRIT)/(1-FATIGUE_CRIT),0,1);
    for(const h of held){
      let d=base+this.effort*3+crit*14+wf*WIND_DRAIN+(h.anchor==='axe'?0:(h.surface.userData.gripCost||0)); if(input.x) d+=1.5;   // gripCost: rachadura (dedos entalados; a picareta não paga)
      if(h.anchor==='axe'&&h.bite==='shallow') d*=AXE_SHALLOW.drain;   // concreto: ponta rasa, braço segura o resto
      h.stamina=Math.max(0,h.stamina-d*dt*this.attributes.effective.gripDrainMultiplier);
      if(h.stamina<=0){ h.exhausted=true; this._dislodge(h); this._release(h); this.emit('exhausted',h); }
    }
    if(this.isClimbing&&!this.mantle&&this.pull>=.97&&this.pulledNow){ const led=this.canMantle(); if(led) this._startMantle(led); }
  }
  // Mouse para baixo → pullTarget; o corpo (pull) persegue com velocidade limitada (inércia) e cede
  // quando não há esforço. A fadiga reduz o ganho e a velocidade e acelera a cedida.
  _pullUp(dt,held){
    const px=this.pullIn, f=this.pullFatigue, low=Math.min(...held.map(h=>h.stamina));
    const gripping=held.some(h=>h.isGrabbing);
    const eff=(held.length===2?1:.75)*(1-.55*f)*(low<20?.6:1);
    if(gripping&&px>0) this.pullTarget=Math.min(1,this.pullTarget+px*PULL_GAIN*eff);
    else if(this.lockOff) this.pullTarget=Math.max(0,this.pullTarget-Math.max(0,f-.5)*.6*dt);   // travado: só cede com os braços cansados
    else this.pullTarget=Math.max(0,this.pullTarget-((gripping?.015:.6)+f*f*.45+(held.length===1?.05:0))*dt);
    // no limite, a pegada dá trancos: o corpo despenca um pouco de repente
    const crit=clamp((f-FATIGUE_CRIT)/(1-FATIGUE_CRIT),0,1);
    if(crit>0&&Math.random()<dt*1.6*crit){ this.pullTarget=Math.max(0,this.pullTarget-.12); this.pull=Math.max(0,this.pull-.06); this.jolt=Math.max(this.jolt,.7);
      held.forEach(h=>this.handModels[this.hands.indexOf(h)].kick(-3)); this.emit('gripSlip'); }
    const prev=this.pull, up=1.6*(1-.45*f);
    this.pull=clamp(this.pull+clamp(this.pullTarget-this.pull,-up*1.5*dt,up*dt),0,1);
    this.pullTarget=Math.min(this.pullTarget,this.pull+.45);   // não acumula "crédito" muito à frente do corpo
    const rate=Math.max(0,(this.pull-prev)/Math.max(dt,1e-4));
    // esforço: velocidade da subida + o custo de se manter travado no alto
    const hang=this.grounded?0:1, e=gripping?clamp(rate/up,0,1)*.85+this.pull*.2*hang:0;
    this.pulledNow=gripping&&px>0;
    this.effort+=(Math.min(1,e)-this.effort)*(1-Math.exp(-(e>this.effort?10:4)*dt));
    const pxs=px/Math.max(dt,1e-4);
    if(pxs>900) this.jolt=Math.max(this.jolt,clamp((pxs-900)/1200,0,1));   // puxão brusco (px/s)
    this.jolt*=Math.exp(-5*dt);
    held.forEach(h=>{ h.pull=this.pull; });
  }
  _collide(lethal){
    const p=this.position;
    // sólidos (caixas, giradas e setores anelares) + a trava da parede curva do poço — ver js/world/Collision.js
    const wasGrounded=this.grounded;
    const {landed,landVy,hitV}=collideBody(this.world.platforms,p,this.velocity,this._prev,this._colOpt);
    p.x=clamp(p.x,-SILO_R,SILO_R); p.z=clamp(p.z,-SILO_R,SILO_R);   // rede de segurança: nada existe fora da casca do silo
    this.grounded=landed;
    if(landed&&landVy<-3) this.landDip=Math.min(.05,-landVy*.004);
    if(landed&&landVy<-7) this.emit('land',landVy);
    if(lethal&&landed&&landVy<-FALL_KILL) this.die('fall');
    else if(lethal&&!this.dead&&!this.debugFrozen) this._impact(landed&&!wasGrounded?-landVy:0,hitV);
  }
  // pouso/batida abaixo do letal (spec §11 D3/D4). Só no movimento livre: escalada, mantle e passos passivos usam
  // _collide(false). Encostado, a componente contra a parede é zerada a cada passo, então hitV fica bem abaixo de 10 m/s.
  // Impactos dentro de 0,25 s (quina, batida seguida de pouso) cobram só o excedente sobre o maior já cobrado.
  _impact(fall,side){
    const dmg=Math.max(PlayerHealth.impactDamage(fall),PlayerHealth.impactDamage(side)); if(dmg<=0) return;
    const w=this._impactWin, prior=w.t>0?w.charged:0, due=dmg-prior;
    if(due<=0) return;   // impacto menor dentro da janela: não cobra nem a prolonga
    w.t=IMPACT_WINDOW; w.charged=dmg; this.damage(due,fall>=side?'fall':'impact');
  }
  // ---------- câmera e mãos em primeira pessoa ----------
  applyCamera(){
    if(this.xr){ this.fxT=performance.now()/1000; this.xr.place(); return; }   // VR: o headset manda na câmera; sem tremor de tela
    const c=this.camera; this.eyePos(c.position);
    let s=this.shake*.06;
    if(this.isClimbing&&this.stamina<20) s+=(20-this.stamina)/20*.012;
    if(s>0){ c.position.x+=(Math.random()-.5)*s; c.position.y+=(Math.random()-.5)*s; c.position.z+=(Math.random()-.5)*s; }
    // esforço: tremor fino por somas de senos (contínuo, sem saltos aleatórios), um aceno ao dar puxões
    // bruscos e, com a fadiga, uma oscilação lenta e larga, como quem perde o controle do corpo
    const t=this.fxT=performance.now()/1000, e=this.effort, f=this.fatigueFx, mo=REDUCED_MOTION?.35:1;
    const tr=(e*.0028+this.jolt*.004+f*f*.0035)*mo, sw=f*f*.011*mo;
    const n=(a,b,o)=>(Math.sin(t*a+o)+Math.sin(t*b+o*1.7))*.5;
    c.position.x+=n(23.1,37.7,.3)*tr+Math.sin(t*1.13+.5)*sw*.6;
    c.position.y+=n(29.3,41.9,1.1)*tr+Math.sin(t*1.71)*sw-e*.012;
    const roll=(n(19.7,31.3,2.2)*tr*1.6+Math.sin(t*.93)*f*f*.014)*mo;
    const nod=(this.jolt*.02+n(17.3,26.9,.7)*tr*.8)*mo;
    c.rotation.set(this.pitch-nod,this.yaw,roll); c.updateMatrixWorld();
  }
  // Cada mão ocupada segue a pose do respectivo item; mãos livres mantêm as poses de escalada.
  updateViewmodel(){
    // relógio próprio: o Game chama sem dt; o tempo real mantém a animação igual em qualquer taxa de quadros
    const now=performance.now(), dt=this._vmT?Math.min(.05,(now-this._vmT)/1000):1/60; this._vmT=now;
    // balanço ao andar e afundada ao aterrissar (espaço da câmera)
    const sp=this.grounded&&!this.isClimbing&&!this.xr?Math.hypot(this.velocity.x,this.velocity.z):0, w=Math.min(1,sp/3.4);
    this._bob=(this._bob||0)+dt*(1.5+sp*2.4); this.landDip=(this.landDip||0)*Math.exp(-7*dt);
    const bobX=Math.sin(this._bob)*.01*w, bobY=-Math.abs(Math.cos(this._bob))*.012*w+Math.sin(this._bob*.7)*.002-this.landDip;
    const xr=this.xr, camPos=_n.setFromMatrixPosition(this.camera.matrixWorld), camQ=this.camera.getWorldQuaternion(_wq);
    this.hands.forEach((h,i)=>{
      const hm=this.handModels[i], m=hm.root; m.visible=this.viewmodelVisible&&!this.dead;
      const pose=h.occupied&&this.itemPoses?this.itemPoses[i]:null;   // já no lado certo (Handedness.toSide)
      // VR: a mão solta (ou com item) fica no controle (ou na mão rastreada)
      const inHand=xr&&!h.inContact&&xr.handPose(i,m.position,m.quaternion);
      if(pose){
        hm.vmLocal=null;
        if(h.anchor==='axe'&&h.inContact&&!inHand){
          // picareta cravada: a raiz é resolvida DEPOIS do hm.update, pela ponta na âncora (ver o fim do quadro);
          // aqui só a composição local (pulso/base/pegada) do quadro, igual à de qualquer item
          if(!(this.axeVisuals&&this.axeVisuals[i])){ const tgt=_p.copy(h.point).addScaledVector(_q.subVectors(camPos,h.point).normalize(),.16); tgt.y-=.2;
            m.position.lerp(tgt,1-Math.exp(-42*dt)); m.quaternion.copy(camQ); m.rotateX(-.15); }
        } else if(!inHand){ m.position.copy(this.camera.localToWorld(_p.copy(pose.pos).add(_q.set(bobX*.6,bobY*.6,0))));
          m.quaternion.copy(camQ); m.rotateX(.25); }
        m.rotateZ(pose.roll||0);
        hm.wrist.rotation.set(pose.wrist.x,pose.wrist.y,pose.wrist.z); hm.setBase(pose.base);
        hm.setPose(pose.grip,pose.grip2,pose.blend); hm.squeeze=pose.squeeze; hm.slack=0; hm.tremor=pose.tremor;
      } else {
        const f=this.fatigueFx, t=this.fxT+i*1.9;
        let pr=this.press[i];
        if(pr&&(h.inContact||(pr.t+=dt)>=PRESS_T)) pr=this.press[i]=null;
        if(inHand){ hm.vmLocal=null; if(pr) m.translateZ(-Math.sin(Math.PI*pr.t/PRESS_T)*.02); }   // VR: o dedo empurra 2 cm
        else if(pr&&pr.target){ this._pressReach(m,pr,h,camPos,camQ); hm.vmLocal=null; }
        else if(h.inContact){
          // agarrada: suaviza no mundo, presa à pegada
          const tgt=_p.copy(h.point).addScaledVector(_q.subVectors(camPos,h.point).normalize(),.11);
          // braço cansado: a mão agarrada escorrega e treme um pouco em volta da pegada
          if(f>0) tgt.add(_q.set(Math.sin(t*2.3)*.006*f,Math.sin(t*3.1)*.008*f-f*f*.01,0));
          m.position.lerp(tgt,1-Math.exp(-42*dt)); hm.vmLocal=null;
          m.quaternion.copy(camQ); m.rotateX(-.4-this.effort*.12);
        } else {
          // solta: suaviza no espaço da câmera, para não ficar para trás (nem entrar na câmera) ao andar;
          // ao soltar a pegada, parte de onde a mão está
          if(!hm.vmLocal) hm.vmLocal=this.camera.worldToLocal(m.position.clone());
          hm.vmLocal.lerp(_q.set(h.side*.22+bobX,-.22+(h.isGrabbing?.08:0)+bobY,-.36),1-Math.exp(-26*dt));
          m.position.copy(this.camera.localToWorld(_p.copy(hm.vmLocal)));
          m.quaternion.copy(camQ); m.rotateX(.3);
        }
        if(h.inContact&&f>0) m.rotateZ(Math.sin(t*1.7)*.06*f*h.side);
        hm.wrist.rotation.set(0,0,0); hm.setBase(HandModel.BASE_FLAT); hm.squeeze=0;
        if(h.inContact){
          // puxando, os dedos cravam mais (squeeze); com a fadiga, afrouxam e tremem
          const s=h.stamina/this.maxStamina, crit=clamp((this.pullFatigue-FATIGUE_CRIT)/(1-FATIGUE_CRIT),0,1);
          hm.setPose('hook'); hm.squeeze=(this.effort*.35+(this.lockOff?.25:0))*(1-f*.6);
          hm.slack=Math.min(.75,clamp((.3-s)/.3,0,1)*.55+crit*.35);
          hm.tremor=Math.min(.22,clamp((.35-s)/.35,0,1)*.14+this.effort*.04+f*.1);
        } else { hm.setPose(pr||this.point[i]?'point':h.isGrabbing&&!h.exhausted?'open':'relaxed'); hm.slack=0; hm.tremor=0; }
      }
      if(h.inContact&&!hm.wasContact) hm.kick(4);   // tranco ao agarrar
      hm.wasContact=h.inContact;
      const low=Math.max(1-h.stamina/this.maxStamina,this.fatigueFx*.8); hm.tint(low*low*.3);
      const hs=this.health.state; hm.setWear(hs); hm.hurtTremor=hs==='critical'?HandWear.CRITICAL_TREMOR:0;   // vida: pele e tremor dos dedos
      hm.update(dt);
      // restrição final: ponta da picareta cravada exatamente na âncora física (Hand.point/normal), orientada pela
      // normal e independente da câmera. Só move a raiz visual; nada da física é lido de volta.
      const vis=pose&&h.anchor==='axe'&&h.inContact&&this.axeVisuals?this.axeVisuals[i]:null;
      if(vis){
        let f=this._axeContact[i];
        if(!f||f.surface!==h.surface||f.inst!==vis){ f=this._axeContact[i]=AxeContactPose.capture(h.point,h.normal,vis.refs); f.surface=h.surface; f.inst=vis; }
        AxeContactPose.solve(f,h.point,h.normal,vis.refs,_axeM); AxeContactPose.applyHandRoot(m,vis.canonical,_axeM);
      } else this._axeContact[i]=null;
    });
  }
  // desktop: a mão sai do repouso, leva a ponta do indicador ao botão, aperta 1 cm e volta.
  // Botão além do braço (> 0,6 m da cabeça): a mão estica até o limite e só aponta.
  _pressReach(m,pr,h,camPos,camQ){
    const k=pr.t/PRESS_T, out=k<.45?smooth(k/.45):k<.6?1:1-smooth((k-.6)/.4);
    const push=k>.35&&k<.7?Math.sin((k-.35)/.35*Math.PI)*.01:0;
    const rest=this.camera.localToWorld(_p.set(h.side*.22,-.22,-.36));
    _d.subVectors(pr.target,rest).normalize();
    _e.copy(pr.target).addScaledVector(_d,-(PRESS_TIP-push));
    _t.subVectors(_e,camPos); if(_t.length()>.6) _e.copy(camPos).add(_t.setLength(.6));
    m.position.lerpVectors(rest,_e,out);
    _pqa.copy(camQ).multiply(_pqb.setFromAxisAngle(_px,.3));                                   // repouso
    _pqb.setFromRotationMatrix(_pm.lookAt(_e,pr.target,_pup.set(0,1,0).applyQuaternion(camQ)));   // dedo para o botão
    m.quaternion.slerpQuaternions(_pqa,_pqb,out);
  }
}
