'use strict';
// ============================================================================
// js/player/Player.js — movimento, escalada com duas mãos, estamina
// Contrato público: position (pés), velocity, grounded, fellOff, maxHeightReached,
//                   stamina (getter), maxStamina, leftHand, rightHand,
//                   isClimbing, isHanging, grabbedSurface,
//                   pull, effort, pullFatigue, fatigueFx, needsPull (puxada corporal)
// Consome do World: platforms, spawnPoint, raycastTargets, addPiton(), touch()
// Puxada: agarrado e segurando o botão, arrastar o mouse para baixo ergue o corpo (pull 0 = pendurado,
// 1 = queixo na borda). O corpo segue a puxada com inércia, cede devagar sem esforço e a fadiga dos braços
// (pullFatigue) reduz a eficiência, faz a câmera/mão tremer e, no nível crítico, drena a pegada.
// Com item na mão direita (pregos, martelo…), o braço que segura trava na altura atual (lockOff):
// não cede, o mouse fica livre para mirar, mas a fadiga sobe aos poucos.
// ============================================================================
// PULL_GAIN: puxada por pixel de mouse (~130px levam de pendurado a puxado, descansado)
const PULL_GAIN=.0075, PULL_MANTLE=.5, FATIGUE_CRIT=.85;
const REDUCED_MOTION=(()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();
class Hand{
  constructor(name,side){ this.name=name; this.side=side; this.point=new V3(); this.normal=new V3(); this.reset(); }
  reset(){ this.occupied=false; this.isGrabbing=false; this.inContact=false; this.surface=null; this.stamina=100; this.cooldown=0; this.pull=0; this.exhausted=false; }
  get state(){ return this.isGrabbing?'closed':'open'; }
}
const _e=new V3(), _t=new V3(), _d=new V3(), _f=new V3(), _r=new V3(), _mv=new V3(), _p=new V3(), _q=new V3(), _n=new V3(), _c0=new THREE.Vector2(0,0);

class Player{
  constructor(scene,camera,world){
    this.scene=scene; this.camera=camera; this.world=world;
    this.maxStamina=100;
    this.leftHand=new Hand('left',-1); this.rightHand=new Hand('right',1);
    this.hands=[this.leftHand,this.rightHand];
    this.position=new V3(); this.velocity=new V3(); this._prev=new V3();
    this.ray=new THREE.Raycaster(); this.listeners={};
    this.handModels=this.hands.map(h=>new HandModel(h.side)); this.handModels.forEach(hm=>scene.add(hm.root));
    this.reset();
  }
  on(t,f){ (this.listeners[t]=this.listeners[t]||[]).push(f); }
  emit(t,d){ (this.listeners[t]||[]).forEach(f=>f(d)); }
  reset(){
    const w=this.world;
    this.position.copy(w.spawnPoint); this.velocity.set(0,0,0); this._prev.copy(this.position);
    this.yaw=w.spawnYaw; this.pitch=.1;
    this.grounded=true; this.fellOff=false; this.dead=false; this.deathReason=null;
    this.maxHeightReached=0; this.mantle=null; this.shake=0;
    // puxada: pull (corpo) persegue pullTarget (comando do mouse); effort/jolt alimentam câmera e mão
    this.pull=0; this.pullTarget=0; this.pullIn=0; this.effort=0; this.jolt=0;
    this.pullFatigue=0; this.fatigueFx=0; this.restT=0; this.fatigueWarned=false; this.fxT=0; this.pulledNow=false;
    this.hands.forEach(h=>h.reset());
    this.itemPose=null;
    this.stats={slips:0,pillsUsed:0,pitonsUsed:0};
    this.viewmodelVisible=true;
  }
  // ---------- estado derivado ----------
  get stamina(){ return clamp(Math.min(this.leftHand.stamina,this.rightHand.stamina),0,this.maxStamina); }
  get isClimbing(){ return this.hands.some(h=>h.inContact); }
  get isHanging(){ return this.isClimbing&&!this.grounded; }
  get grabbedSurface(){ const h=this.hands.find(h=>h.inContact); return h?h.surface:null; }
  get reach(){ return this.stamina<20?1.7:REACH; }
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
  // com um item na mão direita o braço que segura fica travado (lockOff): o mouse volta a mirar livremente
  get canPull(){ return !this.mantle&&!this.dead&&!this.lockOff&&this.pull<.995&&this.hands.some(h=>h.inContact&&h.isGrabbing); }
  get lockOff(){ return this.rightHand.occupied&&this.isHanging; }
  // pendurado numa borda, mas baixo demais para subir: a UI sugere puxar
  get needsPull(){ return this.isHanging&&!this.mantle&&this.pull<PULL_MANTLE&&this.hands.some(h=>h.inContact&&h.surface.userData.plat); }
  setGrab(i,down){
    const h=this.hands[i]; if(!h||this.dead) return;
    h.isGrabbing=down;
    if(!down&&h.inContact) this._release(h);
    if(down&&!h.inContact) this._tryGrab(h);
  }
  releaseAll(){ this.hands.forEach(h=>{ h.isGrabbing=false; if(h.inContact) this._release(h); }); }
  aim(far){
    this.ray.setFromCamera(_c0,this.camera); this.ray.far=far;
    const hits=this.ray.intersectObjects(this.world.raycastTargets,false);
    return hits.find(h=>h.object.userData.alive!==false)||null;
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
    const pl=led.surface.userData.plat;
    this.mantle={t:0,from:this.position.clone(),to:new V3(clamp(led.point.x,pl.minX+.3,pl.maxX-.3),pl.top,clamp(led.point.z,pl.minZ+.3,pl.maxZ-.3))};
    this.hands.forEach(h=>{ if(h.inContact){ h.stamina=Math.max(0,h.stamina-8); this._release(h); } h.isGrabbing=false; });
    this.emit('mantle');
  }
  jump(){
    if(this.dead||this.mantle) return;
    const held=this.hands.filter(h=>h.inContact);
    if(held.length){
      const led=this.canMantle();
      if(led){ this._startMantle(led); return; }
      if(this.needsPull){ this.emit('needPull'); return; }
      if(held.some(h=>h.stamina<12)){ this.emit('weak'); return; }
      _n.set(0,0,0); held.forEach(h=>_n.add(_q.set(h.normal.x,0,h.normal.z))); if(_n.lengthSq()>1e-4) _n.normalize();
      held.forEach(h=>{ h.stamina-=12; this._release(h); h.cooldown=.22; });
      this.velocity.set(_n.x*2.2+this.velocity.x*.3,5.8,_n.z*2.2+this.velocity.z*.3);
      this.grounded=false; this.emit('walljump');
    } else if(this.grounded){ this.velocity.y=5.2; this.grounded=false; this.emit('jump'); }
  }
  restoreStamina(){ this.hands.forEach(h=>{ h.stamina=this.maxStamina; h.exhausted=false; }); this.stats.pillsUsed++; }
  die(reason){
    if(this.dead) return;
    this.dead=true; this.deathReason=reason; if(reason==='fall') this.fellOff=true;
    this.releaseAll(); this.emit('death',reason);
  }
  // ---------- mãos ----------
  _tryGrab(h){
    if(h.cooldown>0||h.exhausted||h.occupied||this.mantle||this.dead) return false;
    const hit=this.aim(this.reach); if(!hit||!hit.object.userData.grab) return false;
    const fall=-this.velocity.y;
    if(!this.isClimbing&&fall>12){
      h.stamina=Math.max(0,h.stamina-25); h.cooldown=.35; this.stats.slips++; this.emit('slip',h); return false;
    }
    h.stamina=Math.max(0,h.stamina-Math.max(0,fall-4)*2.2);
    h.inContact=true; h.surface=hit.object; h.point.copy(hit.point);
    const wn=hit.object.userData.wallNormal;
    if(wn) h.normal.copy(wn); else h.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    this._fitPull();
    this.world.touch(hit.object);
    this.emit('grab',h);
    return true;
  }
  _release(h){
    h.inContact=false; h.surface=null; h.pull=0;
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
    let base=0, span=0;
    for(const h of held){ const [hang,pulled]=Player._span(h); base+=h.point.y-hang; span+=hang-pulled; }
    base/=held.length; span/=held.length; if(held.length===1) base-=.12;
    const p=clamp((this.position.y+EYE-base)/span,0,1);
    this.pull=this.pullTarget=p; held.forEach(h=>{ h.pull=p; });
  }
  // ---------- simulação ----------
  update(dt,input){
    if(this.dead) return;
    this.hands.forEach(h=>{
      if(h.cooldown>0) h.cooldown-=dt;
      if(h.inContact&&h.surface.userData.alive===false){ this._release(h); this.emit('crumble',h); }
    });
    this.hands.forEach(h=>{ if(h.isGrabbing&&!h.inContact) this._tryGrab(h); });
    this._prev.copy(this.position);
    const held=this.hands.filter(h=>h.inContact);
    if(this.mantle) this._mantle(dt);
    else if(held.length) this._climb(dt,input,held);
    else this._free(dt,input);
    if(this.dead) return;
    const climbing=this.isClimbing;
    this.hands.forEach(h=>{
      if(h.inContact) return;
      const r=(this.grounded&&!climbing)?35:(climbing?12:0);
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
    if(gain>.02){ this.pullFatigue=Math.min(1,f+gain*dt); this.restT=0; }
    else {
      this.restT+=dt;
      if(this.restT>.8){ const r=climbing?.035:(this.grounded?.14:.07); this.pullFatigue=Math.max(0,f-r*dt*(.4+.6*smooth(Math.min(1,(this.restT-.8)/1.5)))); }
    }
    const tgt=smooth(clamp((this.pullFatigue-.2)/.8,0,1));
    this.fatigueFx+=(tgt-this.fatigueFx)*(1-Math.exp(-(tgt>this.fatigueFx?3:1.2)*dt));
    if(climbing&&!this.fatigueWarned&&this.pullFatigue>=FATIGUE_CRIT){ this.fatigueWarned=true; this.emit('armsFailing'); }
    if(this.fatigueWarned&&this.pullFatigue<.6) this.fatigueWarned=false;
  }
  _mantle(dt){
    const m=this.mantle; m.t+=dt/.45; const k=Math.min(1,m.t), e=smooth(k);
    this.position.lerpVectors(m.from,m.to,e); this.position.y+=Math.sin(k*Math.PI)*.2;
    if(k>=1){ this.mantle=null; this.velocity.set(0,0,0); this.grounded=true; }
  }
  _free(dt,input){
    _f.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw)); _r.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    _mv.set(0,0,0).addScaledVector(_f,input.y).addScaledVector(_r,input.x); if(_mv.lengthSq()>1) _mv.normalize();
    const v=this.velocity;
    if(this.grounded){ const k=Math.min(1,dt*12); v.x+=(_mv.x*3.4-v.x)*k; v.z+=(_mv.z*3.4-v.z)*k; }
    else { v.x+=_mv.x*2.5*dt; v.z+=_mv.z*2.5*dt; v.x*=1-.15*dt; v.z*=1-.15*dt; }
    v.y-=G*dt;
    this.position.addScaledVector(v,dt);
    this._collide(true);
  }
  _climb(dt,input,held){
    const eye=this.eyePos(_e), tgt=_t.set(0,0,0);
    this._pullUp(dt,held);
    for(const h of held) tgt.add(this._anchor(h,eye));
    tgt.divideScalar(held.length);
    if(held.length===1) tgt.y-=.12;
    _r.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    tgt.addScaledVector(_r,input.x*.32);
    const low=Math.min(...held.map(h=>h.stamina));
    if(low<20){ const k=(20-low)/20*.05; tgt.x+=(Math.random()-.5)*k; tgt.y+=(Math.random()-.5)*k; tgt.z+=(Math.random()-.5)*k; }
    const K=held.length===2?55:38, D=2*Math.sqrt(K)*.62, v=this.velocity;
    v.x+=((tgt.x-eye.x)*K-v.x*D)*dt; v.y+=((tgt.y-eye.y)*K-v.y*D)*dt; v.z+=((tgt.z-eye.z)*K-v.z*D)*dt;
    eye.addScaledVector(v,dt);
    for(const h of held){
      _d.subVectors(eye,h.point); const L=_d.length();
      if(L>1.15){ _d.multiplyScalar(1/L); eye.copy(h.point).addScaledVector(_d,1.15); const vr=v.dot(_d); if(vr>0) v.addScaledVector(_d,-vr); }
    }
    this.position.set(eye.x,eye.y-EYE,eye.z);
    this._collide(false);
    // pegada: custo base + esforço de puxar; com os braços no limite, a pegada escorrega depressa
    const base=held.length===2?3:(this.lockOff?6:9), crit=clamp((this.pullFatigue-FATIGUE_CRIT)/(1-FATIGUE_CRIT),0,1);
    for(const h of held){
      let d=base+this.effort*3+crit*14; if(input.x) d+=1.5;
      h.stamina=Math.max(0,h.stamina-d*dt);
      if(h.stamina<=0){ h.exhausted=true; this._release(h); this.emit('exhausted',h); }
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
    const p=this.position, v=this.velocity, prev=this._prev; let landed=false, landVy=0;
    const plats=this.world.platforms;
    for(const b of plats){
      const bottom=b.bottom!=null?b.bottom:b.top-.3;
      if(p.x<b.minX-RAD||p.x>b.maxX+RAD||p.z<b.minZ-RAD||p.z>b.maxZ+RAD) continue;
      if(v.y<=0&&prev.y>=b.top-.06&&p.y<=b.top){ landVy=Math.min(landVy,v.y); p.y=b.top; v.y=0; landed=true; }
      else if(v.y>0&&prev.y+BODY_H<=bottom+.06&&p.y+BODY_H>bottom){ p.y=bottom-BODY_H; v.y=0; }
    }
    for(const b of plats){
      const bottom=b.bottom!=null?b.bottom:b.top-.3;
      if(p.y+BODY_H<=bottom+.01||p.y>=b.top-.01) continue;
      const ox1=(b.maxX+RAD)-p.x, ox2=p.x-(b.minX-RAD), oz1=(b.maxZ+RAD)-p.z, oz2=p.z-(b.minZ-RAD);
      if(ox1<=0||ox2<=0||oz1<=0||oz2<=0) continue;
      const m=Math.min(ox1,ox2,oz1,oz2);
      if(m===ox1){ p.x+=ox1; v.x=Math.max(v.x,0); } else if(m===ox2){ p.x-=ox2; v.x=Math.min(v.x,0); }
      else if(m===oz1){ p.z+=oz1; v.z=Math.max(v.z,0); } else { p.z-=oz2; v.z=Math.min(v.z,0); }
    }
    // as paredes do poço agora são sólidos AABB em world.platforms; isto é só uma rede de segurança
    p.x=clamp(p.x,-40,40); p.z=clamp(p.z,-40,40);
    this.grounded=landed;
    if(landed&&landVy<-3) this.landDip=Math.min(.05,-landVy*.004);
    if(landed&&landVy<-7) this.emit('land',landVy);
    if(lethal&&landed&&landVy<-FALL_KILL) this.die('fall');
  }
  // ---------- câmera e mãos em primeira pessoa ----------
  applyCamera(){
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
  // A mão direita com item segue `itemPose` (preenchida pelo ItemSystem); sem item, a pose vem da escalada:
  // relaxada → aberta ao tentar agarrar → gancho ao segurar (abre e treme quando a estamina acaba).
  updateViewmodel(){
    // relógio próprio: o Game chama sem dt; o tempo real mantém a animação igual em qualquer taxa de quadros
    const now=performance.now(), dt=this._vmT?Math.min(.05,(now-this._vmT)/1000):1/60; this._vmT=now;
    // balanço ao andar e afundada ao aterrissar (espaço da câmera)
    const sp=this.grounded&&!this.isClimbing?Math.hypot(this.velocity.x,this.velocity.z):0, w=Math.min(1,sp/3.4);
    this._bob=(this._bob||0)+dt*(1.5+sp*2.4); this.landDip=(this.landDip||0)*Math.exp(-7*dt);
    const bobX=Math.sin(this._bob)*.01*w, bobY=-Math.abs(Math.cos(this._bob))*.012*w+Math.sin(this._bob*.7)*.002-this.landDip;
    this.hands.forEach((h,i)=>{
      const hm=this.handModels[i], m=hm.root; m.visible=this.viewmodelVisible&&!this.dead;
      const pose=(h.occupied&&this.itemPose)?this.itemPose:null;
      if(pose){
        m.position.copy(this.camera.localToWorld(_p.copy(pose.pos).add(_q.set(bobX*.6,bobY*.6,0))));
        m.quaternion.copy(this.camera.quaternion); m.rotateX(.25); m.rotateZ(pose.roll||0);
        hm.wrist.rotation.set(pose.wrist.x,pose.wrist.y,pose.wrist.z); hm.setBase(pose.base);
        hm.setPose(pose.grip,pose.grip2,pose.blend); hm.squeeze=pose.squeeze; hm.slack=0; hm.tremor=pose.tremor;
      } else {
        const tgt=h.inContact?_p.copy(h.point).addScaledVector(_q.subVectors(this.camera.position,h.point).normalize(),.11)
          :this.camera.localToWorld(_p.set(h.side*.22+bobX,-.22+(h.isGrabbing?.08:0)+bobY,-.36));
        // braço cansado: a mão agarrada escorrega e treme um pouco em volta da pegada
        const f=this.fatigueFx, t=this.fxT+i*1.9;
        if(h.inContact&&f>0) tgt.add(_q.set(Math.sin(t*2.3)*.006*f,Math.sin(t*3.1)*.008*f-f*f*.01,0));
        m.position.lerp(tgt,1-Math.exp(-(h.inContact?42:26)*dt));
        m.quaternion.copy(this.camera.quaternion); m.rotateX(h.inContact?-.4-this.effort*.12:.3);
        if(h.inContact&&f>0) m.rotateZ(Math.sin(t*1.7)*.06*f*h.side);
        hm.wrist.rotation.set(0,0,0); hm.setBase(HandModel.BASE_FLAT); hm.squeeze=0;
        if(h.inContact){
          // puxando, os dedos cravam mais (squeeze); com a fadiga, afrouxam e tremem
          const s=h.stamina/this.maxStamina, crit=clamp((this.pullFatigue-FATIGUE_CRIT)/(1-FATIGUE_CRIT),0,1);
          hm.setPose('hook'); hm.squeeze=(this.effort*.35+(this.lockOff?.25:0))*(1-f*.6);
          hm.slack=Math.min(.75,clamp((.3-s)/.3,0,1)*.55+crit*.35);
          hm.tremor=Math.min(.22,clamp((.35-s)/.35,0,1)*.14+this.effort*.04+f*.1);
        } else { hm.setPose(h.isGrabbing&&!h.exhausted?'open':'relaxed'); hm.slack=0; hm.tremor=0; }
      }
      if(h.inContact&&!hm.wasContact) hm.kick(4);   // tranco ao agarrar
      hm.wasContact=h.inContact;
      const low=Math.max(1-h.stamina/this.maxStamina,this.fatigueFx*.8); hm.tint(low*low*.3);
      hm.update(dt);
    });
  }
}
