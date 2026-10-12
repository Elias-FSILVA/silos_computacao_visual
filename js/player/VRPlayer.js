'use strict';
// ============================================================================
// js/player/VRPlayer.js — modo VR opcional (WebXR, pensado para o Meta Quest 3/3S)
// O jogo de mouse e teclado não muda. Ao entrar em VR, a câmera vira filha de um rig que segue o corpo
// do Player; o headset move a cabeça dentro dele e os controles (ou as mãos, com hand tracking) viram as
// mãos do jogo. A física continua toda no Player: este módulo só traduz poses e botões e posiciona o rig.
// Controles (gamepad xr-standard):
//   grip (cada mão) = agarrar · segurando, descer o braço = puxada do corpo
//   analógico esq. = andar (clique = pausa) · analógico dir. = giro (passos ou suave) e, na vertical,
//   inclinar a vista (clique = nivelar) · A = pular/subir na borda · gatilho dir. = usar item ou interagir
//   B = trocar item · X = guardar · Y = abrir/fechar o inventário (no pulso; indicador direito + gatilho escolhe)
//   painel de senha: indicador na frente do número + gatilho da mesma mão (esquerdo ou direito)
// Sem gatilho: prego encostado na parede se coloca sozinho; martelada de verdade no prego ou numa parede
// quebrável conta como golpe; frasco de pílulas levado à boca é consumido.
// Hand tracking: mão fechada = agarrar · pinça direita = gatilho direito · pinça esquerda = pular/subir.
// Altura: com 'local-floor' (área de jogo do Quest), a vista fica na altura real do jogador; sentado (ou sem
// chão, espaço 'local'), os olhos vão para a altura do jogo (EYE). Passos reais no quarto levam o corpo
// junto (com colisão); pendurado, inclinar a cabeça só move a vista.
// Fora do gameplay (intro, pausa, resultado) roda idle(): menus flutuantes (VRMenu) clicados com o raio.
// ============================================================================
// Ajustes finos — calibrar no headset
const VR_TUNE={
  pullGain:420,                    // "pixels de mouse" por metro de braço puxado (~0,31 m = puxada completa)
  grabReach:.45,                   // agarre de perto: raio do controle (m)
  armMin:.3,                       // agarre de longe (até o alcance do desktop): braço estendido ao menos isto (m)
  minEyeHeight:1.3,                // abaixo disso (sentado/ajoelhado na calibragem), sobe a vista até a altura do jogo
  smoothJump:.12,                  // salto da vista acima do previsto pela velocidade (m) é suavizado, não teletransportado
  deadzone:.2, smoothTurn:2.4,     // analógicos; giro suave (rad/s)
  pitchSpeed:1.2, pitchLimit:.9,   // analógico direito na vertical: inclina a vista (rad/s, limite em rad)
  nailContact:.035, nailAlign:.8, nailDwell:.15, nailRearm:.08,   // prego: folga da ponta, alinhamento (cos), tempo encostado, afastar para o próximo
  hammerRadius:.06, hammerSpeed:1.1, hammerCooldown:.25,          // martelo: raio cabeça↔prego (m), velocidade mínima (m/s), intervalo entre pancadas (s)
  pillDwell:.3,                                                   // pílula: tempo com o frasco na boca (s)
  handBack:.05, handPitch:0,       // modelo da mão sobre o controle: recuo do pulso (m) e inclinação (rad)
  fistClose:.085, fistOpen:.115,   // hand tracking: distância média pontas dos dedos → pulso (m)
  pinchClose:.02, pinchOpen:.035   // hand tracking: polegar → indicador (m)
};
const VR_BTNS=['grip','trigger','a','b','stick'];
const VR_TIPS=['index-finger-tip','middle-finger-tip','ring-finger-tip'];
const _vh=new V3(), _vd=new V3(), _vo=new V3(), _vp=new V3(), _vy=new V3(0,1,0), _vx=new V3(1,0,0), _vqq=new THREE.Quaternion();
const _ta=new V3(), _tb=new V3(), _tc=new V3(), _tv=new V3(), _te=new THREE.Euler(0,0,0,'YXZ'), _tq=new THREE.Quaternion();
// distância do ponto p ao segmento ab
function segDist(a,b,p){ _tv.subVectors(b,a); const L2=_tv.lengthSq(); const t=L2>1e-9?clamp(_tc.subVectors(p,a).dot(_tv)/L2,0,1):0;
  return _tc.copy(a).addScaledVector(_tv,t).distanceTo(p); }
class VRPlayer{
  constructor(game){
    this.g=game; this.renderer=game.renderer; this.camera=game.camera;
    this.active=false; this.entering=false; this.session=null;
    this.rig=new THREE.Group(); game.scene.add(this.rig);
    this.rigYaw=0; this.rigPitch=0; this.anchor=new V3();   // anchor: deslocamento horizontal da cabeça já absorvido pelo corpo
    // altura: rig.y = pés + heightOffset. Com 'local-floor' a câmera já traz a altura real do jogador;
    // com 'local' (origem na cabeça), heightOffset põe a cabeça na altura dos olhos do jogo
    this.floor=false; this.heightOffset=EYE; this.frames=0; this.pendingRecenter=false;
    this.smooth=new V3(); this._rigLast=null; this._rigT=0;   // suavização de trancos da vista
    this.input={x:0,y:0}; this.motion=0; this.cineState=null;
    this.caster=new THREE.Raycaster();
    this.nail=[{t:0,armed:true},{t:0,armed:true}]; this.ham=[0,1].map(()=>({prev:null,cd:0,armed:new WeakMap(),wall:null}));
    this.pill=[{t:0,armed:true},{t:0,armed:true}]; this.keyHover=[null,null]; this.invHover=-1; this.invOpen=false;
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
  get armMin(){ return VR_TUNE.armMin; }
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
    navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','hand-tracking']}).then(s=>
      // chão real quando o Quest tem a área de jogo configurada; senão, origem na cabeça
      s.requestReferenceSpace('local-floor').then(()=>'local-floor',()=>'local').then(type=>{
      this.floor=type==='local-floor'; this.renderer.xr.setReferenceSpaceType(type);
      s.addEventListener('end',()=>this._onEnd());
      s.addEventListener('visibilitychange',()=>this.g.onVRVisibility(s.visibilityState));
      return this.renderer.xr.setSession(s).then(()=>{ this.session=s; this._onStart(); if(onStart) onStart(); });
    })).catch(err=>{ console.warn('VR:',err); this.g.ui.msg('Não foi possível entrar em VR.',3); })
      .then(()=>{ this.entering=false; });
  }
  exit(){ if(this.session) this.session.end().catch(()=>{}); }
  _onStart(){
    this.active=true;
    const l=this.session.renderState.baseLayer; if(l&&'fixedFoveation' in l) l.fixedFoveation=1;   // Quest: menos pixels na periferia
    this.rig.add(this.camera); this.camera.position.set(0,0,0); this.camera.rotation.set(0,0,0);
    this.panel.attach(this.camera); this.hud.attach(this.g.scene,this.camera);
    this.g.atmosphere.setLightCount(3);
    this.frames=0; this.heightOffset=this.floor?0:EYE; this.rigPitch=0;
    this.nail=[{t:0,armed:true},{t:0,armed:true}]; this.ham=[0,1].map(()=>({prev:null,cd:0,armed:new WeakMap(),wall:null}));
    this.pill=[{t:0,armed:true},{t:0,armed:true}]; this.keyHover=[null,null]; this.invHover=-1; this.invOpen=false; this.hud.setInventory(false);
    this.player.xr=this; this.recenter();
  }
  _onEnd(){
    this.active=false; this.session=null; this.player.xr=null; this.cineState=null;
    this.g.scene.add(this.camera); this.panel.detach(); this.hud.detach(); this.closeMenu();
    this._setKeyHover(0,null); this._setKeyHover(1,null); this.player.point=[false,false]; this.invOpen=false; this.hud.setInventory(false);
    this._all.forEach(c=>{ c.prev=null; c.lastY=null; c.fist=c.pinch=false; });
    this.g.onVRExit();
  }
  // corpo embaixo da cabeça, olhando para player.yaw, vista nivelada; calibra a altura.
  // A pose da cabeça só chega depois do primeiro quadro desenhado: até lá, fica pendente.
  recenter(){
    if(this.frames<2){ this.pendingRecenter=true; this.place(true); return; }
    this.pendingRecenter=false;
    // altura: em pé, vale a altura real (local-floor); sentado/ajoelhado ou sem chão, os olhos vão para EYE
    const h=this.camera.position.y;
    this.heightOffset=this.floor?(h<VR_TUNE.minEyeHeight?EYE-h:0):EYE-h;
    this.rigPitch=0;
    _te.set(0,0,0); _te.setFromQuaternion(this.camera.quaternion,'YXZ');
    this.rigYaw=this.player.yaw-_te.y;
    this._headOffset(this.anchor); this.anchor.y=0;
    this.place(true);
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
    this._frame();
    const [L,R]=this._readAll();
    for(let i=0;i<2;i++){ const st=i?R:L; if(!st) continue;
      if(st.d.grip) p.setGrab(i,true); else if(st.u.grip) p.setGrab(i,false); }
    let mx=0, my=0, turning=0, jumpRequested=false;
    if(L){
      if(L.d.stick){ g.pause(); return; }
      if(Math.hypot(L.sx,L.sy)>VR_TUNE.deadzone){ mx=L.sx; my=-L.sy; }
      if(L.d.a) g.items.holster();
      if(L.d.b) this.toggleInventory();
      // gatilho esquerdo: aperta o número sob o indicador esquerdo; com hand tracking, a pinça pula
      if(L.d.trigger){ if(this.keyHover[0]) this._pressKey(0); else if(this.invOpen&&this.invHover>=0){ g.items.select(this.invHover); this._haptic(0,.3,20); } else if(g.items.equippedFor('left')) g.items.useHand('left',true); else if(L.tracked) jumpRequested=true; }
      else if(L.u.trigger) g.items.useHand('left',false);
    }
    if(R){
      // gatilho direito: número do painel sob o indicador > item do inventário sob o indicador > usar/interagir
      if(R.d.trigger){
        if(this.keyHover[1]) this._pressKey(1);
        else if(this.invOpen&&this.invHover>=0){ g.items.select(this.invHover); this._haptic(1,.3,20); }
        else if(g.ui.noteOpen||!g.items.equippedFor('right')) g.interact(); else g.items.useHand('right',true);
      }
      else if(R.u.trigger) g.items.useHand('right',false);
      if(R.d.a) jumpRequested=true;
      if(R.d.b) g.items.cycle(1);
      turning=this._lookInput(R,dt,s.vrTurn);
    }
    this.input.x=mx; this.input.y=my; this.motion=Math.max(Math.min(1,Math.hypot(mx,my)),turning);
    // andar segue o olhar
    this.camera.getWorldDirection(_vd);
    if(Math.hypot(_vd.x,_vd.z)>.1) p.yaw=Math.atan2(-_vd.x,-_vd.z);
    p.pitch=Math.asin(clamp(_vd.y,-1,1));
    // O salto usa analógico e olhar deste quadro, não os valores do quadro anterior.
    if(jumpRequested) p.jump(this.input);
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
  // gameplay, depois da física, das mãos e do HUD: prego/martelo, mira, pulso e vinheta
  afterPlay(dt,look,gs){
    const s=this.g.settings.data;
    this._tools(dt);
    this._fingers();
    this.pointer.visible=!!look.reticle&&look.reticle!=='dot'&&look.reticle!=='grab';
    this._placeWrist(); this.hud.update(dt,this.g.ui,this.player,look);
    this.hud.updateInventory(this.g.items,this.invOpen?this.invHover:-1);
    const mass=gs.massDistance!=null?clamp((14-gs.massDistance)/12,0,.85):0;
    this.hud.setVignette(dt,this.motion,this.player.fatigueFx||0,mass,s.vrVignette);
  }
  // fora do gameplay: menus, pular a intro
  idle(dt){
    this._frame();
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
  // início de cada quadro em VR: conta quadros (pose da cabeça disponível) e atualiza as matrizes dos controles
  _frame(){
    this.frames++;
    if(this.pendingRecenter&&this.frames>=2) this.recenter();
    this.rig.updateMatrixWorld(true);
  }
  // depois da física: rig nos pés do corpo (+ altura), descontado o que a cabeça já andou.
  // reset: posição nova de propósito (início, recentralizar, giro) — sem suavizar
  place(reset){
    const p=this.player;
    _vo.set(p.position.x-this.anchor.x,p.position.y+this.heightOffset,p.position.z-this.anchor.z);
    // inclinação pelo analógico: gira em volta da cabeça, não dos pés
    _te.set(this.rigPitch,this.rigYaw,0); this.rig.quaternion.setFromEuler(_te);
    if(this.rigPitch){ _vo.add(_vh.copy(this.camera.position).applyAxisAngle(_vy,this.rigYaw)).sub(_vp.copy(this.camera.position).applyQuaternion(this.rig.quaternion)); }
    // trancos da física (agarrar longe, correção de colisão): a vista alcança o corpo em ~0,1 s em vez de pular
    const now=performance.now()/1000, dt=this._rigLast?Math.min(.1,now-this._rigT):0; this._rigT=now;
    if(reset||this._noSmooth||!this._rigLast) this.smooth.set(0,0,0);
    else if(this.g.state==='play'){
      _vd.subVectors(_vo,this._rigLast).addScaledVector(p.velocity,-dt);
      if(_vd.length()>VR_TUNE.smoothJump) this.smooth.sub(_vd);
    }
    this._noSmooth=false;
    this.smooth.multiplyScalar(Math.exp(-14*dt));
    this._rigLast=(this._rigLast||new V3()).copy(_vo);
    this.rig.position.copy(_vo).add(this.smooth); this.rig.updateMatrixWorld(true);
  }
  _turn(a){
    // gira em volta da cabeça: ela fica no mesmo ponto do mundo
    this.anchor.sub(this._headOffset(_vh)); this.rigYaw+=a; this.anchor.add(this._headOffset(_vh)); this.anchor.y=0;
    this._noSmooth=true;
  }
  // analógico direito: giro horizontal (passos ou suave) e inclinação vertical, pelo eixo dominante.
  // Soma-se ao rastreamento da cabeça (o headset continua mandando na vista); clique no analógico nivela.
  _lookInput(R,dt,mode){
    const ax=R.sx, ay=R.sy, c=this.ctrl[1], vertical=Math.abs(ay)>Math.abs(ax)*1.2;
    let m=0;
    if(R.d.stick) this.rigPitch=0;
    if(vertical&&Math.abs(ay)>VR_TUNE.deadzone+.1){
      this.rigPitch=clamp(this.rigPitch-ay*VR_TUNE.pitchSpeed*dt,-VR_TUNE.pitchLimit,VR_TUNE.pitchLimit); m=Math.abs(ay)*.8;
    }
    if(mode==='0'){ if(!vertical&&Math.abs(ax)>VR_TUNE.deadzone){ this._turn(-ax*VR_TUNE.smoothTurn*dt); m=Math.max(m,Math.abs(ax)); } return m; }
    const step=(+mode||30)*Math.PI/180;
    if(!vertical&&Math.abs(ax)>.7){ if(!c.turned){ c.turned=true; this._turn(ax>0?-step:step); return 1; } }
    else if(Math.abs(ax)<.3) c.turned=false;
    return m;
  }
  // ombro aproximado (da pose da cabeça): origem do agarre de longe com o braço estendido
  shoulderPos(i,out){
    out.setFromMatrixPosition(this.camera.matrixWorld);
    this.camera.getWorldDirection(_tv); const yaw=Math.hypot(_tv.x,_tv.z)>.1?Math.atan2(-_tv.x,-_tv.z):this.player.yaw;
    return out.add(_tc.set(i?.17:-.17,-.2,0).applyAxisAngle(_vy,yaw));
  }
  // ---------- prego e martelo sem gatilho ----------
  _tools(dt){
    const it=this.g.items;
    for(let i=0;i<2;i++){
      const hand=i===0?it.left:it, m=hand.mesh, ok=!!m&&m.visible&&hand.phase==='idle';
      if(ok) m.updateWorldMatrix(true,false);
      if(ok&&hand.equipped==='nails') this._nailCheck(dt,m,i); else this.nail[i].t=0;
      if(ok&&hand.equipped==='hammer') this._hammerCheck(dt,m,i); else this.ham[i].prev=null;
      if(ok&&hand.equipped==='pills') this._pillCheck(dt,m,i); else this.pill[i].t=0;
    }
  }
  // ---------- inventário (Y) ----------
  toggleInventory(){ this.invOpen=!this.invOpen; this.invHover=-1; this.hud.setInventory(this.invOpen); this._haptic(0,.2,15); }
  // ---------- indicador: painel de senha e inventário ----------
  // ponta do indicador (pose de apontar) e direção do dedo, no mundo, a partir do modelo da mão
  _fingerTip(i,tip,dir){
    const hm=this.player.handModels[i]; hm.root.updateMatrixWorld(true);
    hm.base.localToWorld(HandModel.indexTip(hm.side,tip));
    dir.set(0,0,-1).transformDirection(hm.base.matrixWorld); return tip;
  }
  // Para cada mão livre: perto do painel (30 cm), o indicador se estica; com a ponta na frente de um número
  // (até 6 cm, dentro da tecla e apontando para ela), ele fica em foco — o gatilho daquela mão aperta.
  _fingers(){
    const p=this.player, keys=this.g.world.interactables.filter(m=>m.userData.interactable instanceof KeyButton);
    for(let i=0;i<2;i++){
      const h=p.hands[i]; let best=null, bz=Infinity, near=false;
      if(this.ctrl[i]&&!h.inContact&&!h.occupied&&keys.length){
        this._fingerTip(i,_ta,_tb);
        for(const m of keys){
          m.updateWorldMatrix(true,false);
          if(!near&&_tc.setFromMatrixPosition(m.matrixWorld).distanceTo(_ta)<.3) near=true;
          const l=m.worldToLocal(_tc.copy(_ta));
          if(Math.abs(l.x)>.065||Math.abs(l.y)>.055||l.z<-.01||l.z>.06) continue;
          if(-_tb.dot(_tv.set(0,0,1).transformDirection(m.matrixWorld))<.4) continue;   // dedo virado para a tecla
          if(l.z<bz){ bz=l.z; best=m; }
        }
      }
      p.point[i]=near; this._setKeyHover(i,best);
    }
    // inventário aberto: slot sob o indicador direito
    this.invHover=this.invOpen&&this.ctrl[1]?this.hud.slotAt(this._fingerTip(1,_ta,_tb)):-1;
  }
  _setKeyHover(i,m){
    const old=this.keyHover[i]; if(old===m) return;
    this.keyHover[i]=m;
    if(old&&this.keyHover[1-i]!==old) old.material.emissive.setHex(0x000000);
    if(m){ m.material.emissive.setHex(0x3a2c0c); this._haptic(i,.12,10); }   // tecla em foco acende de leve
  }
  // gatilho com o indicador numa tecla: o dedo empurra e a tecla registra (uma vez por aperto)
  _pressKey(i){
    const m=this.keyHover[i], kb=m.userData.interactable;
    const hit={point:m.localToWorld(new V3(0,0,.0175)),object:m,distance:0,face:{normal:new V3(0,0,1)}};
    const ctx=this.g.interaction.ctx(hit); if(kb.canInteract(ctx)) kb.interact(ctx);
    this.player.pressButton(null,i); this._haptic(i,.6,30);
  }
  // ---------- pílula levada à boca ----------
  // frasco na mão: com a tampa a até 12 cm da boca (abaixo e à frente dos olhos) e virada para ela por
  // 0,3 s, dispara o mesmo consumo do botão (ItemSystem.consume). Para outra, é preciso afastar o frasco.
  _pillCheck(dt,m,i=1){
    const P=this.pill[i], cap=m.localToWorld(_ta.set(0,.05,0)), up=_tb.set(0,1,0).transformDirection(m.matrixWorld);
    const mouth=this.camera.localToWorld(_tc.set(0,-.08,-.06)), d=cap.distanceTo(mouth);
    if(d>.25) P.armed=true;
    if(!P.armed||d>.12||up.dot(_tv.subVectors(mouth,cap).normalize())<.2){ P.t=0; return; }
    P.t+=dt; if(P.t<VR_TUNE.pillDwell) return;
    if(this.g.items.consume(i===0?'left':'right')){ P.armed=false; P.t=0; this._haptic(i,.4,60); }
  }
  // prego na mão: com a ponta encostada numa superfície válida, alinhado com a parede por um instante,
  // dispara a mesma colocação do botão (ItemSystem.place). Para o próximo, é preciso afastar a ponta.
  _nailCheck(dt,m,i=1){
    const N=this.nail[i], tip=m.localToWorld(_ta.set(0,-.17,0)), back=m.localToWorld(_tb.set(0,.05,0));
    _tv.subVectors(tip,back); const len=_tv.length(); if(len<1e-4) return; _tv.multiplyScalar(1/len);
    this.caster.set(back,_tv); this.caster.far=len+VR_TUNE.nailRearm+.02;
    const hit=this.caster.intersectObjects(this.g.world.raycastTargets,false).find(h=>h.object.userData.alive!==false);
    const gap=hit?hit.distance-len:Infinity;   // folga entre a ponta e a superfície (<0: já encostou)
    if(gap>VR_TUNE.nailRearm) N.armed=true;
    if(!hit||gap>VR_TUNE.nailContact||!N.armed){ N.t=0; return; }
    const ctx=this.g.interaction.ctx(hit), obj=hit.object.userData.interactable, c=obj&&obj.canUseItem('nails',ctx);
    if(!c||!c.valid||-_tv.dot(ctx.normal)<VR_TUNE.nailAlign){ N.t=0; return; }
    N.t+=dt; if(N.t<VR_TUNE.nailDwell) return;
    if(this.g.items.place({hit,obj,ctx,valid:true},i===0?'left':'right')){ N.armed=false; N.t=0; this._haptic(i,.5,40); }
  }
  // martelo na mão: a cabeça do martelo cruzando a cabeça de um prego, rápido e indo contra a parede,
  // conta como uma pancada (ItemSystem.strike → NailAnchor.useItem, que avança o prego como no desktop).
  // Uma pancada por contato: o martelo precisa se afastar do prego e há um intervalo mínimo.
  _hammerCheck(dt,m,i=1){
    const H=this.ham[i], head=m.localToWorld(_ta.set(0,.27,0));
    H.cd=Math.max(0,H.cd-dt);
    if(!H.prev){ H.prev=head.clone(); return; }
    _tb.subVectors(head,H.prev); const k=1/Math.max(dt,1e-4), speed=_tb.length()*k;
    // parede quebrável: a cabeça do martelo atravessando a superfície neste quadro, rápido e de frente.
    // Uma pancada por contato: só vale outra depois de afastar a cabeça 10 cm da parede.
    if(H.wall&&_tc.subVectors(head,H.wall.point).dot(H.wall.normal)>.1) H.wall=null;
    if(H.cd<=0&&speed>=VR_TUNE.hammerSpeed){
      const len=_tb.length(); this.caster.set(H.prev,_tc.copy(_tb).multiplyScalar(1/len)); this.caster.far=len+.04;
      const hit=this.caster.intersectObjects(this.g.world.raycastTargets,false)[0], wall=hit&&hit.object.userData.interactable;
      if(wall instanceof BreakableWall&&!wall.broken&&!(H.wall&&H.wall.obj===wall)){
        const ctx=this.g.interaction.ctx(hit);
        if(-_tc.dot(ctx.normal)>.5){
          this.g.items.strike({hit,obj:wall,ctx,valid:true},i===0?'left':'right'); this._haptic(i,1,70);
          H.wall={obj:wall,point:hit.point.clone(),normal:ctx.normal.clone()}; H.cd=VR_TUNE.hammerCooldown;
          H.prev.copy(head); return;
        }
      }
    }
    for(const a of this.g.world.grabbables){
      const u=a.userData, nail=u.interactable;
      if(u.type!=='nail'||u.alive===false||!(nail instanceof NailAnchor)||nail.fixed) continue;
      _vp.set(0,.135,0); nail.visual.localToWorld(_vp);   // cabeça do prego
      const d=segDist(H.prev,head,_vp);
      if(d>VR_TUNE.hammerRadius*2) H.armed.set(a,true);
      if(d>VR_TUNE.hammerRadius||H.armed.get(a)===false||H.cd>0) continue;
      if(speed<VR_TUNE.hammerSpeed||-_tb.dot(u.wallNormal)*k<VR_TUNE.hammerSpeed*.5) continue;   // só encostar não vale
      const hit={point:_vp.clone(),object:a,distance:0,face:{normal:new V3(0,1,0)}};
      if(this.g.items.strike({hit,obj:nail,ctx:this.g.interaction.ctx(hit),valid:true},i===0?'left':'right')) this._haptic(i,.9,60);
      H.armed.set(a,false); H.cd=VR_TUNE.hammerCooldown; break;
    }
    H.prev.copy(head);
  }
  _haptic(i,v,ms){
    try{ const c=this.ctrl[i], gp=c&&c.source&&c.source.gamepad, a=gp&&gp.hapticActuators&&gp.hapticActuators[0];
      if(a&&a.pulse){ const r=a.pulse(v,ms); if(r&&r.catch) r.catch(()=>{}); } }catch(e){}
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
