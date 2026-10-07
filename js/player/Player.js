'use strict';
// ============================================================================
// js/player/Player.js — movimento, escalada com duas mãos, estamina
// Contrato público: position (pés), velocity, grounded, fellOff, maxHeightReached,
//                   stamina (getter), maxStamina, leftHand, rightHand,
//                   isClimbing, isHanging, grabbedSurface
// Consome do World: platforms, spawnPoint, raycastTargets, addPiton(), touch()
// ============================================================================
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
    this._vm=this.hands.map(h=>this._makeHandMesh(h.side));
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
  look(dx,dy,s){ const k=.0022*s.sensitivity; this.yaw-=dx*k; this.pitch=clamp(this.pitch-(s.invertY?-dy:dy)*k,-1.5,1.5); }
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
    const eye=this.eyePos(_e);
    const h=this.hands.find(h=>h.inContact&&h.surface.userData.plat&&eye.y>=h.surface.userData.plat.bottom-1.3);
    return h||null;
  }
  jump(){
    if(this.dead||this.mantle) return;
    const held=this.hands.filter(h=>h.inContact);
    if(held.length){
      const led=this.canMantle();
      if(led){
        const pl=led.surface.userData.plat;
        this.mantle={t:0,from:this.position.clone(),to:new V3(clamp(led.point.x,pl.minX+.3,pl.maxX-.3),pl.top,clamp(led.point.z,pl.minZ+.3,pl.maxZ-.3))};
        held.forEach(h=>{ h.stamina=Math.max(0,h.stamina-8); });
        this.hands.forEach(h=>{ if(h.inContact) this._release(h); h.isGrabbing=false; });
        this.emit('mantle'); return;
      }
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
    h.pull=0;
    this.world.touch(hit.object);
    this.emit('grab',h);
    return true;
  }
  _release(h){
    h.inContact=false; h.surface=null; h.pull=0;
    if(!this.isClimbing&&this.velocity.length()>7) this.velocity.setLength(7);
  }
  _anchor(h,eye){
    const t=h.point.clone(); const n=_q.set(h.normal.x,0,h.normal.z);
    if(n.lengthSq()<.01){ n.set(eye.x-h.point.x,0,eye.z-h.point.z); if(n.lengthSq()<1e-4) n.set(1,0,0); n.normalize().multiplyScalar(.3); }
    else n.normalize().multiplyScalar(.5);
    t.add(n);
    const bottom=h.normal.y<-.5, hang=bottom?.95:.85, pulled=bottom?.55:.2;
    t.y-=lerp(hang,pulled,h.pull);
    return t;
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
    this.maxHeightReached=Math.max(this.maxHeightReached,this.position.y);
    if(this.shake>0) this.shake=Math.max(0,this.shake-dt*1.5);
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
    for(const h of held){
      if(h.isGrabbing&&h.pull<1) h.pull=Math.min(1,h.pull+dt*(h.stamina<20?.7:2.0));
      tgt.add(this._anchor(h,eye));
    }
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
    const base=held.length===2?3:9;
    for(const h of held){
      let d=base; if(h.pull<1) d+=5; if(input.x) d+=1.5;
      h.stamina=Math.max(0,h.stamina-d*dt);
      if(h.stamina<=0){ h.exhausted=true; this._release(h); this.emit('exhausted',h); }
    }
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
    if(landed&&landVy<-7) this.emit('land',landVy);
    if(lethal&&landed&&landVy<-FALL_KILL) this.die('fall');
  }
  // ---------- câmera e mãos em primeira pessoa ----------
  applyCamera(){
    const c=this.camera; this.eyePos(c.position);
    let s=this.shake*.06;
    if(this.isClimbing&&this.stamina<20) s+=(20-this.stamina)/20*.012;
    if(s>0){ c.position.x+=(Math.random()-.5)*s; c.position.y+=(Math.random()-.5)*s; c.position.z+=(Math.random()-.5)*s; }
    c.rotation.set(this.pitch,this.yaw,0); c.updateMatrixWorld();
  }
  _makeHandMesh(side){
    const g=new THREE.Group(), mat=new THREE.MeshStandardMaterial({color:0x2b2520,roughness:.9});
    g.add(new THREE.Mesh(new THREE.BoxGeometry(.09,.03,.1),mat));
    const fingers=new THREE.Group(); fingers.position.set(0,0,-.05);
    for(let i=0;i<4;i++){ const f=new THREE.Mesh(new THREE.BoxGeometry(.018,.022,.07),mat); f.position.set(-.032+i*.021,0,-.035); fingers.add(f); }
    g.add(fingers);
    const th=new THREE.Mesh(new THREE.BoxGeometry(.02,.02,.05),mat); th.position.set(-.055*side,0,-.02); th.rotation.y=.6*side; g.add(th);
    g.userData={fingers,mat}; this.scene.add(g); return g;
  }
  updateViewmodel(){
    this.hands.forEach((h,i)=>{
      const m=this._vm[i]; m.visible=this.viewmodelVisible&&!this.dead;
      const pose=(h.occupied&&this.itemPose)?this.itemPose:null;
      if(pose){
        m.position.copy(this.camera.localToWorld(_p.copy(pose.pos)));
        m.quaternion.copy(this.camera.quaternion); m.rotateX(.25); m.rotateZ(pose.roll||0);
      } else {
        const tgt=h.inContact?_p.copy(h.point).addScaledVector(_q.subVectors(this.camera.position,h.point).normalize(),.07)
          :this.camera.localToWorld(_p.set(h.side*.22,-.22+(h.isGrabbing?.08:0),-.42));
        m.position.lerp(tgt,h.inContact?.5:.35);
        m.quaternion.copy(this.camera.quaternion); m.rotateX(h.inContact?-.4:.3);
      }
      const f=m.userData.fingers, curl=(h.isGrabbing||(pose&&pose.visible))?-1.4:-.15; f.rotation.x+=(curl-f.rotation.x)*.4;
      const low=1-h.stamina/this.maxStamina; m.userData.mat.emissive.setRGB(low*low*.3,0,0);
    });
  }
}
