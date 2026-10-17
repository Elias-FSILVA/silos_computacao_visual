'use strict';
// Inspeção da run: transações validadas antes de cancelar ações ou mover o corpo.
class DeveloperNavigation{
  constructor(game){this.g=game;this.safety=new NavigationSafety(game);this.reset();}
  reset(){
    this.noclipActive=false;this.speed=10;this._assisted=false;this._debugReasons=[];
    this._backPose=null;this._lastSafePose=null;this._flightBaseline=null;
    this.guard=new ProgressionGuard();this.presence=new PresenceObservers(this.g,this.guard);
    const g=this.g;g.presence=g.world.presence=g.mass.presence=g.checkpoints.presence=this.presence;g.player.debugFrozen=false;
  }
  get backPose(){return this._backPose&&NavigationSafety.clonePose(this._backPose);}
  get lastSafePose(){return this._lastSafePose&&NavigationSafety.clonePose(this._lastSafePose);}
  pose(){return NavigationSafety.clonePose(this.g.player);}
  get assisted(){return this._assisted;}
  eligibility(){return {assisted:this._assisted,competitiveEligible:!this._assisted,debugReasons:this._debugReasons.slice()};}
  // Voo ativo: nenhuma ação de gameplay (itens, interação, agarre, pulo); XR também fica vedado.
  allowsGameplayAction(){return !this.noclipActive;}
  canEnterXR(){return !this.noclipActive;}
  markAssisted(reason){this._assisted=true;if(!this._debugReasons.includes(reason))this._debugReasons.push(reason);}
  contextAllowed(){
    const g=this.g,state=g.state==='console'?g.devConsoleReturnState:g.state;
    if(g.vr&&(g.vr.active||g.vr.entering)||g.player.xr)return {ok:false,reason:'Navegação de debug disponível só no desktop, fora de XR'};
    if(!['play','paused'].includes(state)||g.player.dead||g.timer.finished)return {ok:false,reason:'É necessária uma partida viva em jogo ou pausa'};
    return {ok:true,reason:''};
  }
  syncTimer(){
    const g=this.g;
    if(g.state==='play'&&!g.player.dead&&!g.timer.finished&&!this.noclipActive)g.timer.resume();
    else g.timer.pause();
  }
  setSpeed(n){
    const context=this.contextAllowed();if(!context.ok)return {ok:false,message:context.reason};
    if(!Number.isFinite(n)||n<1||n>50)return {ok:false,message:'Velocidade deve estar entre 1 e 50 m/s'};
    this.speed=n;return {ok:true,message:'Velocidade noclip: '+n+' m/s'};
  }
  setNoclip(on){
    const context=this.contextAllowed();if(!context.ok)return {ok:false,message:context.reason};
    on=!!on;
    if(on===this.noclipActive)return {ok:true,message:'Noclip '+(on?'ligado':'desligado')+' — '+this.speed+' m/s'};
    if(on){
      const before=this.presence.sample(),pose=this.pose();
      if(this.safety.check(pose).ok)this._lastSafePose=pose;
      this._flightBaseline=before;this._clear();this.noclipActive=true;this.g.player.debugFrozen=true;this.markAssisted('noclip');this.syncTimer();this._syncPose();
      return {ok:true,message:'Noclip ligado — '+this.speed+' m/s — Run assistida'};
    }
    // Estilo CS/Half-Life (decisão do usuário, 2026-10-18): desliga NO LUGAR em qualquer posição — ar, fora do mapa,
    // dentro de parede ou perigo. Sem teleporte nem recusa; a física normal retoma dali (pode cair e morrer).
    const g=this.g,p=g.player,before=this._flightBaseline||this.presence.sample(),pose=this.pose(),risk=this.safety.check(pose);
    this._clear();p.velocity.set(0,0,0);p.grounded=false;
    if(risk.ok)this._lastSafePose=pose;
    this.guard.discontinue(before,this.presence.sample());this.presence.update();this.markAssisted('noclip');
    this.noclipActive=false;p.debugFrozen=false;this._flightBaseline=null;this._syncPose();this.syncTimer();
    const at=p.position,coords='('+[at.x,at.y,at.z].map(n=>n.toFixed(2)).join(', ')+')';
    return {ok:true,pose:this.pose(),message:'Noclip desligado em '+coords+' — física retomada'+(risk.ok?'':' — Aviso: '+risk.reason)+' — Run assistida. Gatilhos protegidos; saia e reentre normalmente.'};
  }
  updateFlight(dt,keys){
    if(!this.noclipActive||this.g.state!=='play'||!Number.isFinite(dt)||dt<=0)return;
    const p=this.g.player,k=keys||{},forward=(k.KeyW?1:0)-(k.KeyS?1:0),right=(k.KeyD?1:0)-(k.KeyA?1:0);
    const move=new V3(-Math.sin(p.yaw)*forward+Math.cos(p.yaw)*right,(k.Space?1:0)-((k.ControlLeft||k.ControlRight)?1:0),-Math.cos(p.yaw)*forward-Math.sin(p.yaw)*right);
    if(move.lengthSq()>0)move.normalize().multiplyScalar(Math.min(.05,dt)*this.speed*((k.ShiftLeft||k.ShiftRight)?4:1));
    const next=p.position.clone().add(move);if(![next.x,next.y,next.z].every(Number.isFinite))return;
    p.position.copy(next);p._prev.copy(next);
    const pose=this.pose();if(this.safety.check(pose).ok)this._lastSafePose=pose;
  }
  look(dx,dy,settings){
    if(!this.noclipActive||this.g.state!=='play'||!Number.isFinite(dx)||!Number.isFinite(dy))return;
    const p=this.g.player,k=.0022*settings.sensitivity;
    p.yaw-=dx*k;p.pitch=clamp(p.pitch-(settings.invertY?-dy:dy)*k,-1.5,1.5);
  }
  goto(id){
    const context=this.contextAllowed();if(!context.ok)return {ok:false,message:context.reason};
    const r=this.safety.resolve(id);if(!r.ok)return r;
    const moved=this.relocate(r.pose,{reason:'goto',storeBack:true});
    return moved.ok?{...r,message:r.message+' — Run assistida. Gatilhos protegidos; saia e reentre normalmente.'}:moved;
  }
  back(){
    const context=this.contextAllowed();if(!context.ok)return {ok:false,message:context.reason};
    if(!this._backPose)return {ok:false,message:'Nenhum retorno registrado'};
    const r=this.safety.recover(this._backPose,this._lastSafePose);if(!r.ok)return r;
    const moved=this.relocate(r.pose,{reason:'back',storeBack:false});if(!moved.ok)return moved;
    this._backPose=null;
    return {...r,message:'Retorno a '+this.pose().position.y.toFixed(2)+' m — '+r.message+' — Run assistida. Gatilhos protegidos; saia e reentre normalmente.'};
  }
  _clear(){const g=this.g;g.keys={};g.gameBtn={};g.player.clearDebugTransient();g.items.cancelPendingForDebug();}
  _syncPose(){
    const g=this.g,p=g.player;p._prev.copy(p.position);p.applyCamera();
    p.handModels.forEach(hm=>{hm.vmLocal=new V3(hm.side*.22,-.22,-.36);hm.root.position.copy(p.camera.localToWorld(hm.vmLocal.clone()));});
    p.updateViewmodel();p.camera.updateMatrixWorld(true);p.handModels.forEach(hm=>hm.root.updateMatrixWorld(true));
    if(g.sectors)g.sectors.refreshFocus();
  }
  relocate(pose,{reason,storeBack}){
    const context=this.contextAllowed();if(!context.ok)return {ok:false,message:context.reason};
    const checked=this.safety.check(pose);if(!checked.ok)return {ok:false,message:checked.reason};
    const origin=this.pose(),before=this._flightBaseline||this.presence.sample();
    this._clear();
    const p=this.g.player;p.position.copy(pose.position);p.yaw=pose.yaw;p.pitch=pose.pitch;p.grounded=true;
    if(storeBack)this._backPose=origin;
    this._lastSafePose=NavigationSafety.clonePose(pose);
    this.guard.discontinue(before,this.presence.sample());this.presence.update();this.markAssisted(reason);
    this._syncPose();
    return {ok:true,pose:this.pose(),message:'Posição segura — Run assistida'};
  }
}
