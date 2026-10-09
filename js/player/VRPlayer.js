'use strict';
// ============================================================================
// js/player/VRPlayer.js — modo VR opcional (WebXR, pensado para o Meta Quest 3/3S)
// O jogo de mouse e teclado não muda. Ao entrar em VR, a câmera vira filha de um rig que segue o corpo
// do Player; o headset move a cabeça dentro dele e os controles (ou as mãos, com hand tracking) viram as
// mãos do jogo. A física continua toda no Player: este módulo só traduz poses e botões e posiciona o rig.
// Controles (gamepad xr-standard):
//   grip (cada mão) = agarrar · segurando, descer o braço = puxada do corpo
//   analógico esq. = andar (clique = pausa) · analógico dir. = giro (passos ou suave, nas configurações)
//   A = pular/subir na borda · gatilho dir. = usar item ou interagir · B = trocar item · X = guardar · Y = pílula
// Hand tracking: mão fechada = agarrar · pinça direita = gatilho direito · pinça esquerda = pular/subir.
// Espaço de referência 'local': a origem é a cabeça no início da sessão, então a altura dos olhos do
// jogo (EYE) vale tanto em pé quanto sentado. Passos reais no quarto levam o corpo junto (com colisão);
// pendurado, inclinar a cabeça só move a vista.
// Fora do gameplay (intro, pausa, resultado) roda idle(): menus flutuantes (VRMenu) clicados com o raio.
// ============================================================================
// Ajustes finos — calibrar no headset
const VR_TUNE={
  pullGain:320,                    // "pixels de mouse" por metro de braço puxado (~0,4 m = puxada completa)
  grabReach:.45,                   // alcance do agarre a partir do controle (m)
  deadzone:.2, smoothTurn:2.4,     // analógicos; giro suave (rad/s)
  handBack:.05, handPitch:0,       // modelo da mão sobre o controle: recuo do pulso (m) e inclinação (rad)
  fistClose:.085, fistOpen:.115,   // hand tracking: distância média pontas dos dedos → pulso (m)
  pinchClose:.02, pinchOpen:.035   // hand tracking: polegar → indicador (m)
};
const VR_BTNS=['grip','trigger','a','b','stick'];
const VR_TIPS=['index-finger-tip','middle-finger-tip','ring-finger-tip'];
const _vh=new V3(), _vd=new V3(), _vo=new V3(), _vp=new V3(), _vy=new V3(0,1,0), _vx=new V3(1,0,0), _vqq=new THREE.Quaternion();
class VRPlayer{
  constructor(game){
    this.g=game; this.renderer=game.renderer; this.camera=game.camera;
    this.active=false; this.entering=false; this.session=null;
    this.rig=new THREE.Group(); game.scene.add(this.rig);
    this.rigYaw=0; this.anchor=new V3();   // deslocamento horizontal da cabeça já absorvido pelo corpo
    this.input={x:0,y:0}; this.motion=0; this.cineState=null;
    this.ctrl=[null,null];                 // 0 = esquerda, 1 = direita (mesma ordem de Player.hands)
    const xr=this.renderer.xr;
    this._all=[0,1].map(i=>{
      const c={ray:xr.getController(i),grip:xr.getControllerGrip(i),hand:xr.getHand(i),source:null,prev:null,lastY:null,turned:false,fist:false,pinch:false};
      this.rig.add(c.ray); this.rig.add(c.grip); this.rig.add(c.hand);
      c.ray.addEventListener('connected',e=>{ c.source=e.data; c.prev=null; c.lastY=null; this._assign(); });
      c.ray.addEventListener('disconnected',()=>{ c.source=null; this._assign(); });
      return c;
    });
    // raio de mira: risco curto e discreto no controle direito; nos menus, vai até o painel
    const lg=new THREE.BufferGeometry().setFromPoints([new V3(0,0,0),new V3(0,0,-.6)]);
    this.pointer=new THREE.Line(lg,new THREE.LineBasicMaterial({color:0xd8cfb8,transparent:true,opacity:.35}));
    this.pointer.visible=false;
    this.panel=new VRPanel(); this.menu=new VRMenu(); this.hud=new VRHud();
    this.ready=(navigator.xr&&navigator.xr.isSessionSupported)
      ?navigator.xr.isSessionSupported('immersive-vr').catch(()=>false):Promise.resolve(false);
  }
  get player(){ return this.g.player; }
  get busy(){ return this.active||this.entering; }
  get grabReach(){ return VR_TUNE.grabReach; }
  _assign(){
    this.ctrl=[null,null];
    this._all.forEach(c=>{ const h=c.source&&c.source.handedness; if(h==='left') this.ctrl[0]=c; else if(h==='right') this.ctrl[1]=c; });
    if(this.pointer.parent) this.pointer.parent.remove(this.pointer);
    if(this.ctrl[1]) this.ctrl[1].ray.add(this.pointer);
  }
  // ---------- sessão ----------
  // precisa ser chamado dentro de um clique (gesto do usuário)
  enter(onStart){
    if(!navigator.xr||this.busy) return;
    this.entering=true;
    navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','hand-tracking']}).then(s=>{
      this.renderer.xr.setReferenceSpaceType('local');
      s.addEventListener('end',()=>this._onEnd());
      s.addEventListener('visibilitychange',()=>this.g.onVRVisibility(s.visibilityState));
      return this.renderer.xr.setSession(s).then(()=>{ this.session=s; this._onStart(); if(onStart) onStart(); });
    }).catch(err=>{ console.warn('VR:',err); this.g.ui.msg('Não foi possível entrar em VR.',3); })
      .then(()=>{ this.entering=false; });
  }
  exit(){ if(this.session) this.session.end().catch(()=>{}); }
  _onStart(){
    this.active=true;
    const l=this.session.renderState.baseLayer; if(l&&'fixedFoveation' in l) l.fixedFoveation=1;   // Quest: menos pixels na periferia
    this.rig.add(this.camera); this.camera.position.set(0,0,0); this.camera.rotation.set(0,0,0);
    this.panel.attach(this.camera); this.hud.attach(this.g.scene,this.camera);
    this.g.atmosphere.setLightCount(3);
    this.player.xr=this; this.recenter();
  }
  _onEnd(){
    this.active=false; this.session=null; this.player.xr=null; this.cineState=null;
    this.g.scene.add(this.camera); this.panel.detach(); this.hud.detach(); this.closeMenu();
    this._all.forEach(c=>{ c.prev=null; c.lastY=null; c.fist=c.pinch=false; });
    this.g.onVRExit();
  }
  // corpo embaixo da cabeça, olhando para player.yaw
  recenter(){
    this.camera.getWorldDirection(_vd);
    const headYaw=Math.hypot(_vd.x,_vd.z)>.1?Math.atan2(-_vd.x,-_vd.z)-this.rigYaw:0;
    this.rigYaw=this.player.yaw-headYaw;
    this._headOffset(this.anchor); this.anchor.y=0;
    this.place();
  }
  // ---------- menus e cinemática ----------
  showPause(){
    const g=this.g;
    this._menu({title:'Pausado',text:'O tempo e a massa estão parados.',buttons:[
      {label:'Continuar',action:()=>g.resume()},
      {label:'Recentralizar a vista',action:()=>{ this.recenter(); this.showPause(); }},
      {label:'Sair do VR',action:()=>this.exit()},
      {label:'Abandonar e voltar ao menu',action:()=>{ g.toMenu(); this.exit(); }}]});
  }
  showResult(){
    const g=this.g, r=g.lastRun; if(!r) return;
    this._menu({title:r.result==='finish'?'Subida completa':r.result==='mass'?'A massa te alcançou':'Você caiu',
      tone:r.result==='finish'?'win':'danger',
      text:g.saved?(g.savedIndex>=0?`Posição ${g.savedIndex+1} no ranking.`:'Fora do top 20.'):r.name,
      lines:[['Tempo',fmtTime(r.time)],['Altura',`${Math.floor(r.height)} m de ${TOP} m`],['Pontuação',`${fmtInt(r.breakdown.total)} pts`]],
      buttons:[
        {label:g.saved?'Pontuação salva':'Salvar pontuação',disabled:g.saved,action:()=>{ g.saveScore(); this.showResult(); }},
        {label:'Tentar de novo',action:()=>g.retry()},
        {label:'Sair do VR',action:()=>this.exit()}]});
  }
  _menu(spec){ this.menu.show(spec,this.rig,this.camera); }
  closeMenu(){ this.menu.close(); this.pointer.scale.set(1,1,1); }
  // fade/texto da IntroCinematic (a câmera fica parada em VR)
  cine(fade,text,op){ this.cineState=text&&op>.02?{text,op}:null; this.hud.setFade(fade); }
  updatePanel(ui){ this.panel.update(ui,this.cineState); }
  // ---------- quadro ----------
  _headOffset(out){ return out.copy(this.camera.position).applyAxisAngle(_vy,this.rigYaw); }
  // gameplay, antes de Player.update: botões, analógicos, puxada e direção do corpo
  update(dt){
    const g=this.g, p=this.player, s=g.settings.data;
    this.rig.updateMatrixWorld(true);
    const [L,R]=this._readAll();
    for(let i=0;i<2;i++){ const st=i?R:L; if(!st) continue;
      if(st.d.grip) p.setGrab(i,true); else if(st.u.grip) p.setGrab(i,false); }
    let mx=0, my=0, turning=0;
    if(L){
      if(L.d.stick){ g.pause(); return; }
      if(Math.hypot(L.sx,L.sy)>VR_TUNE.deadzone){ mx=L.sx; my=-L.sy; }
      if(L.d.a) g.items.holster();
      if(L.d.b) g.items.quick('pills');
      if(L.tracked&&L.d.trigger) p.jump();
    }
    if(R){
      if(R.d.trigger){ if(g.ui.noteOpen||!g.items.equipped) g.interact(); else g.items.use(true); }
      else if(R.u.trigger) g.items.use(false);
      if(R.d.a) p.jump();
      if(R.d.b) g.items.cycle(1);
      turning=this._turnInput(R,dt,s.vrTurn);
    }
    this.input.x=mx; this.input.y=my; this.motion=Math.max(Math.min(1,Math.hypot(mx,my)),turning);
    // andar segue o olhar
    this.camera.getWorldDirection(_vd);
    if(Math.hypot(_vd.x,_vd.z)>.1) p.yaw=Math.atan2(-_vd.x,-_vd.z);
    p.pitch=Math.asin(clamp(_vd.y,-1,1));
    // passos reais: o corpo acompanha a cabeça (só no chão e solto; pendurado, a cabeça só inclina)
    const off=this._headOffset(_vh); off.y=0;
    _vo.subVectors(off,this.anchor);
    if(_vo.lengthSq()>1e-6&&p.stepBy(_vo)) this.anchor.copy(off);
    // puxada: a mão que segura descendo (no espaço do rig, que já sobe junto com o corpo)
    let pull=0;
    this.ctrl.forEach((c,i)=>{
      if(!c) return; const h=p.hands[i], y=this._handLocal(c,_vp)?_vp.y:null;
      if(y!=null&&h.inContact&&h.isGrabbing&&c.lastY!=null) pull=Math.max(pull,c.lastY-y);
      c.lastY=y;
    });
    if(pull>0) p.pullBy(pull*VR_TUNE.pullGain);
  }
  // gameplay, depois da física e do HUD: mira, pulso e vinheta
  afterPlay(dt,look,gs){
    const s=this.g.settings.data;
    this.pointer.visible=!!look.reticle&&look.reticle!=='dot'&&look.reticle!=='grab';
    this._placeWrist(); this.hud.update(dt,this.g.ui,this.player,look);
    const mass=gs.massDistance!=null?clamp((14-gs.massDistance)/12,0,.85):0;
    this.hud.setVignette(dt,this.motion,this.player.fatigueFx||0,mass,s.vrVignette);
  }
  // fora do gameplay: menus, pular a intro
  idle(dt){
    this.rig.updateMatrixWorld(true);
    const st=this._readAll(), g=this.g;
    if(this.menu.open){
      const i=this.ctrl[1]?1:0, dist=this.ray(i,_vo,_vd)?this.menu.hit(_vo,_vd):null;
      this.pointer.visible=true; this.pointer.scale.set(1,1,dist?dist/.6:1);
      if(st.some(s=>s&&s.d.trigger)) this.menu.click();
    } else {
      this.pointer.visible=false;
      if(g.state==='intro'&&st.some(s=>s&&(s.d.trigger||s.d.a))) g.cinematic.skip();
    }
    this._placeWrist();
    this.hud.setVignette(dt,0,0,0,false);
  }
  // depois da física: rig nos olhos do corpo, descontado o que a cabeça já andou
  place(){
    const p=this.player; p.eyePos(_vo);
    this.rig.position.set(_vo.x-this.anchor.x,_vo.y,_vo.z-this.anchor.z);
    this.rig.rotation.set(0,this.rigYaw,0); this.rig.updateMatrixWorld(true);
  }
  _turn(a){
    // gira em volta da cabeça: ela fica no mesmo ponto do mundo
    this.anchor.sub(this._headOffset(_vh)); this.rigYaw+=a; this.anchor.add(this._headOffset(_vh)); this.anchor.y=0;
  }
  _turnInput(R,dt,mode){
    const ax=R.sx;
    if(mode==='0'){ if(Math.abs(ax)>VR_TUNE.deadzone){ this._turn(-ax*VR_TUNE.smoothTurn*dt); return Math.abs(ax); } return 0; }
    const step=(+mode||30)*Math.PI/180, c=this.ctrl[1];
    if(Math.abs(ax)>.7){ if(!c.turned){ c.turned=true; this._turn(ax>0?-step:step); return 1; } }
    else if(Math.abs(ax)<.3) c.turned=false;
    return 0;
  }
  _placeWrist(){ const ok=this.handPose(0,_vh,_vqq,true); this.hud.placeWrist(ok?_vh:null,_vqq); }
  // ---------- leitura dos controles ----------
  // estado lógico de cada mão, com bordas (d = acabou de apertar, u = acabou de soltar)
  _readAll(){
    return this.ctrl.map(c=>{
      if(!c) return null;
      const s=this._read(c), pv=c.prev||{};
      if(!s){ c.prev=null; return null; }
      s.d={}; s.u={}; for(const k of VR_BTNS){ s.d[k]=s[k]&&!pv[k]; s.u[k]=!s[k]&&!!pv[k]; }
      c.prev=s; return s;
    });
  }
  _read(c){
    const src=c.source; if(!src) return null;
    if(src.hand){
      const J=c.hand.joints, w=J&&J['wrist']; if(!w||!w.visible) return null;
      let d=0; for(const n of VR_TIPS){ const j=J[n]; if(!j) return null; d+=j.position.distanceTo(w.position); } d/=VR_TIPS.length;
      if(c.fist&&d>VR_TUNE.fistOpen) c.fist=false; else if(!c.fist&&d<VR_TUNE.fistClose) c.fist=true;
      const it=J['index-finger-tip'], th=J['thumb-tip'], pd=th?th.position.distanceTo(it.position):1;
      if(c.pinch&&pd>VR_TUNE.pinchOpen) c.pinch=false; else if(!c.pinch&&!c.fist&&d>VR_TUNE.fistOpen&&pd<VR_TUNE.pinchClose) c.pinch=true;
      return {grip:c.fist,trigger:c.pinch,a:false,b:false,stick:false,sx:0,sy:0,tracked:true};
    }
    const gp=src.gamepad; if(!gp) return null;
    const B=k=>!!(gp.buttons[k]&&gp.buttons[k].pressed);
    return {grip:B(1),trigger:B(0),a:B(4),b:B(5),stick:B(3),sx:gp.axes[2]||0,sy:gp.axes[3]||0,tracked:false};
  }
  // palma no espaço do rig (controle: grip; hand tracking: base do dedo médio)
  _handLocal(c,out){
    if(c.source&&c.source.hand){ const J=c.hand.joints, j=J&&(J['middle-finger-metacarpal']||J['wrist']); return j&&j.visible?out.copy(j.position):null; }
    return c.source?out.copy(c.grip.position):null;
  }
  // ---------- consultas do Player ----------
  // raio de mira do controle (-Z para frente), em coordenadas do mundo
  ray(i,origin,dir){
    const c=this.ctrl[i]; if(!c) return false;
    origin.setFromMatrixPosition(c.ray.matrixWorld); dir.set(0,0,-1).transformDirection(c.ray.matrixWorld);
    return true;
  }
  handPos(i,out){ const c=this.ctrl[i]; return c&&this._handLocal(c,out)?out.applyMatrix4(this.rig.matrixWorld):null; }
  // pose do modelo da mão (pulso) no mundo; raw = sem os ajustes do modelo
  handPose(i,pos,quat,raw){
    const c=this.ctrl[i]; if(!c||!c.source) return false;
    if(c.source.hand){
      const w=c.hand.joints&&c.hand.joints['wrist']; if(!w||!w.visible) return false;
      pos.setFromMatrixPosition(w.matrixWorld); w.getWorldQuaternion(quat); return true;
    }
    pos.setFromMatrixPosition(c.grip.matrixWorld); c.ray.getWorldQuaternion(quat);
    if(!raw){ if(VR_TUNE.handPitch) quat.multiply(_vqq.setFromAxisAngle(_vx,VR_TUNE.handPitch)); pos.add(_vh.set(0,0,VR_TUNE.handBack).applyQuaternion(quat)); }
    return true;
  }
}
