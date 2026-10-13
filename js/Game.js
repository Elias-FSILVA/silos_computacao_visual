'use strict';
// ============================================================================
// js/Game.js — fluxo: BOOT → MENU → NOME → START → CINEMATIC → GAMEPLAY → RESULTADO → RANKING
// Estados: menu · intro · play · inventory (mochila aberta, jogo congelado) · paused · ending · result
// ============================================================================
class Game{
  constructor(){
    this.settings=Settings;
    const r=this.renderer=new THREE.WebGLRenderer({antialias:true});
    r.toneMapping=THREE.LinearToneMapping; r.toneMappingExposure=1; r.xr.enabled=true;
    document.getElementById('view').appendChild(r.domElement);
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color(0x050403);
    this.camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.03,200); this.camera.rotation.order='YXZ';
    this.scene.add(this.camera);
    const head=new THREE.PointLight(0xb8ae98,.45,7,2); this.camera.add(head);
    this.audio=new AudioManager(this.settings.data);
    this.world=new World(this.scene);
    this.player=new Player(this.scene,this.camera,this.world);
    this.mass=new MassSystem(this.scene);
    this.fx=new FxSystem(this.scene);
    this.items=new ItemSystem(this);
    this.interaction=new InteractionSystem(this);
    this.puzzles=new PuzzleSystem(this);
    this.timer=new TimerSystem(); this.score=new ScoreSystem(); this.checkpoints=new CheckpointSystem(this.world); this.ranking=new Ranking();
    this.atmosphere=new AtmosphereManager(this.scene,r,this.audio);
    this.ui=new UIManager();
    this.vr=new VRPlayer(this);
    this.puzzles.reset(); this._zones();
    this.cinematic=new IntroCinematic(this);
    this.spectator=new SpectatorMode(this);
    this.state='menu'; this.keys={}; this.playerName=''; this.result=null; this.saved=false; this.savedIndex=-1;
    this.devCommandHistory=[]; this.devHistoryIndex=0; this.devHistoryDraft='';
    this.devConsoleReturnState=null; this._devConsoleWasPlaying=false;
    this.gameBtn={}; this._lockGuard=0;   // gameBtn: botões do mouse pressionados DURANTE a partida (cliques na interface não contam)
    this._lockReq=0; this._resuming=false;   // pedido de Pointer Lock pendente (instante) · retomada aguardando a captura
    this.settingsReturn='menu'; this.wasLocked=false; this.menuT=0; this.vt=0;
    this._wire(); this.applySettings();
    try{ const n=LS&&LS.getItem('silos.lastName'); if(n) this.ui.$('nameIn').value=n; }catch(e){}
    this.ui.show('menu'); this.ui.setHUD(false);
    if(/[?&]espectador\b/.test(location.search)) this.spectator.enter();   // link direto: .../index.html?espectador
    // setAnimationLoop: igual ao requestAnimationFrame no monitor, e o único jeito de desenhar no headset
    this.last=performance.now(); r.setAnimationLoop(t=>this._loop(t));
  }
  // ---------- configurações ----------
  applySettings(){
    const s=this.settings.data;
    this.camera.fov=s.fov; this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix();
    const pr={low:.6,medium:1,high:Math.min(window.devicePixelRatio||1,2)}[s.quality]||1;
    if(!this.renderer.xr.isPresenting){ this.renderer.setPixelRatio(pr); this.renderer.setSize(innerWidth,innerHeight); }
    this.renderer.domElement.style.filter=`brightness(${s.brightness})`;
    this.atmosphere.setLightCount(s.quality==='low'?3:5);
    applyTextureQuality(this.renderer,s.quality);   // filtragem anisotrópica das paredes (assets.js)
    this.audio.apply(s);
  }
  // ---------- console do desenvolvedor ----------
  openDevConsole(){
    if(!this.settings.data.devConsoleEnabled||this.vr.active||this.ui.$('devConsole').hidden===false) return;
    if(!['play','paused','menu'].includes(this.state)) return;
    this.devConsoleReturnState=this.state; this._devConsoleWasPlaying=this.state==='play';
    if(this._devConsoleWasPlaying){ this.state='console'; this.timer.pause(); this._lockGuard=performance.now()+500; this.unlock(); }
    this.keys={}; this.ui.$('devConsole').hidden=false; this.ui.$('devConsoleInput').focus();
  }
  closeDevConsole(){
    const panel=this.ui.$('devConsole'); if(panel.hidden) return;
    panel.hidden=true;
    if(this._devConsoleWasPlaying){ this.state='play'; this.timer.resume(); this._lockGuard=performance.now()+500; this.lock(); }
    else this.state=this.devConsoleReturnState||this.state;
    this.devConsoleReturnState=null; this._devConsoleWasPlaying=false;
  }
  toggleDevConsole(){ if(this.ui.$('devConsole').hidden) this.openDevConsole(); else this.closeDevConsole(); }
  clearDevConsoleOutput(){ this.ui.$('devConsoleOutput').textContent=''; }
  // ---------- fluxo ----------
  tryStart(vr){
    const v=this.ui.validateName(this.ui.$('nameIn').value);
    this.ui.$('nameErr').textContent=v.ok?'':v.error;
    if(!v.ok){ this.ui.$('nameIn').focus(); return; }
    this.playerName=v.value; try{ LS&&LS.setItem('silos.lastName',v.value); }catch(e){}
    this.audio.init(); this.audio.apply(this.settings.data);
    // VR: a cinemática roda com a câmera parada (só fade, som e texto); mover a vista sozinha enjoa
    if(vr){ this.vr.enter(()=>{ this.resetRun(); this.vr.recenter(); this.ui.hideScreens(); this.state='intro'; this.cinematic.play(()=>this.beginPlay()); }); return; }
    this.resetRun(); this.ui.hideScreens(); this.state='intro';
    this.cinematic.play(()=>this.beginPlay());
  }
  resetRun(){
    this.world.reset(); this.player.reset(); this.items.reset(); this.mass.reset(); this.timer.reset(); this.score.reset();
    this.fx.clear(); this.puzzles.reset(); this._zones(); this.audio.silence();
    this.checkpoints.reset(); this.atmosphere.reset(); this.result=null; this.saved=false; this.savedIndex=-1; this.vt=0;
    this.ui.hideNote(); this.ui.resetPack(); this.keys={}; this.gameBtn={};   // resetPack: fecha a mochila e esquece as posições dos itens
  }
  _zones(){ this.mass.safeZones=Object.values(this.world.puzzleRooms).flatMap(r=>[r.zoneRoom,r.zoneDuct,...(r.zones||[])].filter(Boolean)); }
  beginPlay(){
    this.state='play'; this.timer.start(); this.ui.hideScreens(); this.ui.setHUD(true); this.vr.closeMenu();
    this.audio.setHum(1); this.lock();
    this.ui.msg(this._startTip=this.vr.active?'Leve a mão até uma saliência e aperte o grip para agarrar. Puxe o braço para baixo para subir.'
      :'Olhe para uma saliência e segure o botão do mouse para agarrar.',5);
  }
  retry(){ this.audio.init(); this.resetRun(); if(this.vr.active) this.vr.recenter(); this.ui.hideScreens(); this.beginPlay(); }
  toMenu(){
    this.state='menu'; this.unlock(); this.resetRun(); this.ui.clearMsg(); this.ui.setHUD(false); this.ui.show('menu');
    this.audio.setRumble(.03); this.audio.setTension(0);
  }
  returnFromSpectator(previousState){
    if(previousState==='play'){
      this.state='play'; this.ui.hideScreens(); this.ui.setHUD(true); this.player.viewmodelVisible=true; this.player.updateViewmodel();
      this.timer.resume(); this.lock(); return;
    }
    if(previousState==='paused'){
      this.state='paused'; this.ui.setHUD(true); this.ui.show('pause'); return;
    }
    if(previousState==='menu'){
      this.state='menu'; this.ui.setHUD(false); this.ui.show('menu'); return;
    }
    this.toMenu();
  }
  pause(){
    if(this.state!=='play') return;
    this.state='paused'; this._resuming=false; this.timer.pause(); this.player.releaseAll(); this.items.use(false); this.keys={};
    this.ui.setPack(false);
    this.unlock(); this.ui.clearMsg(); this.ui.$('pauseErr').textContent=''; this.ui.show('pause'); this.audio.setRumble(.02); this.pausedAt=performance.now();
    if(this.vr.active) this.vr.showPause();
  }
  // Desktop: a partida só volta quando o navegador CONFIRMA a captura do mouse (pointerlockchange → _resumeNow);
  // se ele recusar (pointerlockerror → _lockFailed), continua pausada e a tela diz o que fazer.
  // Em VR, sem suporte a Pointer Lock ou com o mouse já capturado, volta direto.
  resume(){
    if(this.state!=='paused') return;
    if(this.vr.busy||!this.canLock()||this.locked()){ this._resumeNow(); return; }
    this._resuming=true; this.lock();
  }
  _resumeNow(){
    this._resuming=false; this.ui.hideScreens(); this.vr.closeMenu(); this.state='play'; this.timer.resume();
    if(this.timer.time<1&&this._startTip) this.ui.msg(this._startTip,5);   // a captura falhou logo no início: a dica de como agarrar volta
  }
  // ---------- inventário (mochila circular) ----------
  // Abrir congela a partida (nenhum sistema com tempo roda no estado 'inventory'), solta o mouse para a interface
  // e NÃO solta as mãos: a escalada continua exatamente como estava ao fechar.
  openInventory(){
    if(this.state!=='play'||this.player.dead) return;
    this.state='inventory'; this._lockGuard=performance.now()+400;   // o estado muda antes do unlock: o pointerlockchange não vira pausa
    this.timer.pause(); this.items.use(false); this.gameBtn={};      // soltar botões durante a mochila não mexe nas mãos
    this.ui.hideNote(); this.audio.setRumble(.02);
    this.ui.setPack(true,this.items,this.player);
    this.unlock();
  }
  closeInventory(){
    if(this.state!=='inventory') return;
    this.ui.setPack(false); this.state='play'; this.timer.resume();
    this._lockGuard=performance.now()+400; this.lock();
  }
  _inventoryKey(e){
    if(e.code==='Tab'||e.code==='Escape'){
      e.preventDefault(); if(e.repeat) return;
      if(e.code==='Escape'&&this.ui.cancelDrag()) return;   // Esc cancela um arrasto em andamento antes de fechar
      this.closeInventory(); return;
    }
    this.ui.packKey(e);
  }
  endRun(result){
    if(this.state!=='play') return;
    this.state='ending'; this.result=result; this.timer.finish();
    const breakdown=this.score.finalize(result,this.timer.time,this.player);
    this.player.attributes.clearPerks();
    this.player.releaseAll(); this.unlock(); this.ui.hideNote(); this.ui.setPack(false); this.ui.clearMsg();
    this.audio.siren(false);
    if(result==='finish') this.audio.chime(); else this.audio.boom();
    this.lastRun={name:this.playerName,score:breakdown.total,time:this.timer.time,result,height:this.player.maxHeightReached,breakdown,ending:result==='finish'?(this.route||'escape'):null};
    setTimeout(()=>{ if(this.state!=='ending') return; this.state='result'; this.ui.setHUD(false); this.ui.showResult(this.lastRun);
      if(this.vr.active) this.vr.showResult(); },result==='finish'?1400:900);
  }
  saveScore(){
    if(this.saved||!this.lastRun) return;
    const r=this.lastRun;
    const entry={name:r.name,score:r.score,time:Math.round(r.time*100)/100,result:r.result,height:Math.floor(r.height),ending:r.ending||null,date:new Date().toISOString().slice(0,10)};
    this.savedIndex=this.ranking.save(entry); this.saved=true;
    const b=this.ui.$('btnSave'); b.disabled=true; b.textContent='Pontuação salva';
    this.ui.$('resSaved').textContent=this.savedIndex>=0?`Posição ${this.savedIndex+1} no ranking.`:'Fora do top 20.';
  }
  showRanking(from){ this.rankReturn=from; this.ui.renderRanking(this.ranking.top(10),from==='result'?this.savedIndex:-1); this.ui.show('ranking'); }
  // ---------- ponteiro (Pointer Lock) ----------
  // Único lugar que pede e solta a captura. "Capturado" só vale com a confirmação do navegador (locked());
  // a recusa chega como pointerlockerror e cai em _lockFailed. _lockReq evita pedidos duplicados enquanto um está pendente.
  canLock(){ return !!this.renderer.domElement.requestPointerLock; }
  locked(){ return document.pointerLockElement===this.renderer.domElement; }
  lock(){
    if(!this.canLock()||this.vr.busy||this.locked()||(this._lockReq&&performance.now()-this._lockReq<1000)) return;
    this._lockReq=performance.now();
    try{ const p=this.renderer.domElement.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(e){ this._lockFailed(); }
  }
  unlock(){ try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){} }
  // Recusa (sem gesto do usuário, Esc apertado há pouco, janela sem foco…): nunca se joga com o cursor solto.
  // A partida pausa (ou continua pausada) com o aviso; o botão Continuar é a ação explícita para tentar de novo.
  _lockFailed(){
    this._lockReq=0; if(this.locked()) return;
    if(this.state==='play'&&!this.vr.busy) this.pause();
    if(this.state!=='paused') return;
    this._resuming=false; this.ui.$('pauseErr').textContent='O navegador não capturou o mouse. Clique em Continuar para jogar.';
  }
  // ---------- VR ----------
  // menu do sistema do Quest aberto (botão Meta): pausa; ao voltar, o menu de pausa em VR está lá
  onVRVisibility(vis){ if(vis!=='visible'&&this.state==='play') this.pause(); }
  // saiu do headset no meio da corrida: fica pausado na tela 2D (com "Continuar em VR")
  onVRExit(){ this.applySettings(); if(this.state==='play') this.pause(); }
  // ---------- interação ----------
  interact(hand){ this.interaction.interact(hand); }
  // ---------- estado para UI e atmosfera ----------
  getUIState(){
    const cp=this.checkpoints.justCollected, pz=this.puzzles.current;
    return {
      score:this.score.score, time:this.timer.time,
      timeLeft:(pz&&!pz.solved)?pz.timeRemaining:this.mass.eta(this.player), puzzle:pz,
      currentCheckpoint:this.checkpoints.current?this.checkpoints.current.label:null,
      checkpointJustCollected:cp?{id:cp.id,label:cp.label,bonus:cp.bonus,optional:cp.optional}:null,
      finished:this.timer.finished, result:this.result,
      massDistance:this.mass.active?this.mass.gap(this.player):null, playerName:this.playerName
    };
  }
  // ---------- entrada ----------
  _wire(){
    const $=this.ui.$;
    $('btnStart').onclick=()=>this.tryStart();
    $('btnStartVR').onclick=()=>this.tryStart(true);
    $('btnPauseVR').onclick=()=>this.vr.enter(()=>{ this.vr.recenter(); this.resume(); });
    this.vr.ready.then(ok=>{ $('btnStartVR').hidden=!ok; $('btnPauseVR').hidden=!ok; $('vrNote').hidden=!ok; });
    $('nameIn').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); this.tryStart(); } });
    $('nameIn').addEventListener('input',()=>{ $('nameErr').textContent=''; });
    $('btnSettings').onclick=()=>{ this.settingsReturn='menu'; this.ui.show('settings'); };
    $('btnPauseSettings').onclick=()=>{ this.settingsReturn='pause'; this.ui.show('settings'); };
    $('btnSetBack').onclick=()=>this.ui.show(this.settingsReturn);
    $('btnRanking').onclick=()=>this.showRanking('menu');
    const devInput=$('devConsoleInput'),devOutput=$('devConsoleOutput');
    const runDevCommand=()=>{
      const raw=devInput.value.trim(); if(!raw) return;
      this.devCommandHistory.push(raw); if(this.devCommandHistory.length>50) this.devCommandHistory.shift();
      this.devHistoryIndex=this.devCommandHistory.length; this.devHistoryDraft='';
      const result=DevConsole.execute(raw,this);
      devOutput.textContent+=`\n> ${raw}\n${result}`;
      const lines=devOutput.textContent.split('\n'); if(lines.length>80) devOutput.textContent=lines.slice(-80).join('\n');
      devOutput.scrollTop=devOutput.scrollHeight; devInput.value='';
    };
    $('devConsoleForm').addEventListener('submit',e=>{e.preventDefault();runDevCommand();});
    $('devConsoleClose').onclick=()=>this.closeDevConsole();
    devInput.addEventListener('keydown',e=>{
      if(e.key==='ArrowUp'){
        e.preventDefault(); if(this.devHistoryIndex===this.devCommandHistory.length) this.devHistoryDraft=devInput.value;
        this.devHistoryIndex=Math.max(0,this.devHistoryIndex-1); devInput.value=this.devCommandHistory[this.devHistoryIndex]||'';
      }else if(e.key==='ArrowDown'){
        e.preventDefault(); this.devHistoryIndex=Math.min(this.devCommandHistory.length,this.devHistoryIndex+1);
        devInput.value=this.devHistoryIndex===this.devCommandHistory.length?this.devHistoryDraft:(this.devCommandHistory[this.devHistoryIndex]||'');
      }
    });
    $('btnResRanking').onclick=()=>this.showRanking('result');
    $('btnRankBack').onclick=()=>this.ui.show(this.rankReturn||'menu');
    $('btnQuit').onclick=()=>this.ui.show('quit');
    $('btnQuitBack').onclick=()=>this.ui.show('menu');
    $('btnResume').onclick=()=>this.resume();
    $('btnPauseMenu').onclick=()=>this.toMenu();
    $('btnSave').onclick=()=>this.saveScore();
    $('btnRetry').onclick=()=>this.retry();
    $('btnMenu').onclick=()=>this.toMenu();
    $('cine').addEventListener('click',()=>this.cinematic.skip());
    this.ui.bindSettings(this.settings,()=>this.applySettings());
    this.ui.onPackClose=()=>this.closeInventory();

    addEventListener('resize',()=>this.applySettings());
    addEventListener('contextmenu',e=>{ if(this.state==='play'||this.state==='inventory') e.preventDefault(); });
    // em VR a janela perde o foco e o ponteiro ao entrar no headset: isso não é pausa
    addEventListener('blur',()=>{ this.keys={}; if(this.state==='play'&&!this.vr.busy) this.pause(); });
    document.addEventListener('pointerlockchange',()=>{
      const locked=this.locked(); if(locked) this._lockReq=0;
      if(locked&&this.state==='paused'&&this._resuming) this._resumeNow();          // retomada: só agora, com a captura confirmada
      else if(locked&&this.state!=='play'&&this.state!=='spectate') this.unlock();   // confirmação atrasada (ex.: Tab duas vezes): menus e mochila precisam do cursor
      // abrir/fechar a mochila troca o Pointer Lock de propósito: isso nunca é um pedido de pausa
      if(!locked&&this.wasLocked&&this.state==='play'&&!this.vr.busy&&performance.now()>this._lockGuard) this.pause();
      if(!locked&&this.wasLocked&&this.state==='spectate') this.spectator.exit();
      this.wasLocked=locked;
    });
    document.addEventListener('pointerlockerror',()=>this._lockFailed());
    // a câmera só segue o mouse capturado: com o cursor solto (captura pendente) o movimento é do cursor, não da vista
    addEventListener('mousemove',e=>{
      if(this.state==='play'){ if(this.locked()||this.vr.busy||!this.canLock()) this.player.look(e.movementX||0,e.movementY||0,this.settings.data); }
      else if(this.state==='spectate'&&this.locked()) this.spectator.look(e.movementX||0,e.movementY||0);
    });
    this.renderer.domElement.addEventListener('mousedown',e=>{
      if(this.state==='spectate'){ if(!this.locked()) this.lock(); return; }
      if(this.state!=='play') return;
      if(!this.locked()&&this.canLock()&&!this.vr.busy){ this.lock(); return; }   // clique com o cursor solto só recaptura: não agarra nem usa item
      if(e.button===0&&this.interaction.keypadAimed()){ this.interact(0); return; }   // painel de senha: clique aperta o número
      this.gameBtn[e.button]=true;
      if(e.button===0){ if(this.items.equippedFor('left')) this.items.useHand('left',true); else this.player.setGrab(0,true); }
      else if(e.button===2){ if(this.items.equippedFor('right')) this.items.useHand('right',true); else this.player.setGrab(1,true); }
    });
    addEventListener('mouseup',e=>{
      // só solta o que um clique de partida segurou: cliques e arrastos na mochila não soltam as mãos
      if(!this.gameBtn[e.button]) return;
      this.gameBtn[e.button]=false;
      if(e.button===0){ if(this.items.equippedFor('left')) this.items.useHand('left',false); else this.player.setGrab(0,false); }
      else if(e.button===2){ if(this.items.equippedFor('right')) this.items.useHand('right',false); else this.player.setGrab(1,false); }
    });
    addEventListener('wheel',e=>{ if(this.state==='play'&&Math.abs(e.deltaY)>4) this.items.cycle(e.deltaY>0?1:-1); else if(this.state==='spectate'&&Math.abs(e.deltaY)>4) this.spectator.wheel(e.deltaY); },{passive:true});
    addEventListener('keydown',e=>{
      if(e.code==='Backquote'&&this.settings.data.devConsoleEnabled&&!this.vr.active){ e.preventDefault(); this.toggleDevConsole(); return; }
      if(!this.ui.$('devConsole').hidden){
        if(e.code==='Escape'){ e.preventDefault(); this.closeDevConsole(); }
        return;
      }
      if(e.code==='F2'&&this.state==='menu'&&!this.ui.$('menu').hidden){ e.preventDefault(); this.spectator.enter(); return; }   // atalho do modo espectador
      const typing=e.target&&e.target.tagName==='INPUT'&&e.target.type==='text';
      if(typing) return;
      if(this.state==='intro'){ if(['Space','Escape','Enter'].includes(e.code)){ e.preventDefault(); this.cinematic.skip(); } return; }
      if(this.state==='inventory'){ this._inventoryKey(e); return; }
      // Esc/P retomam (Esc não conta como gesto para o navegador: se ele recusar a captura, a pausa avisa); repetição do teclado não alterna
      if(this.state==='paused'&&(e.code==='Escape'||e.code==='KeyP')&&!this.ui.$('pause').hidden){ if(!e.repeat&&performance.now()-(this.pausedAt||0)>350) this.resume(); return; }
      if(this.state==='spectate'){ this.keys[e.code]=true; this.spectator.key(e); return; }
      if(this.state!=='play') return;
      this.keys[e.code]=true;
      const qk=QUICK_KEYS.findIndex(q=>q.code===e.code);   // 1–4 → atalhos de equipamento (seguem o vínculo, não o índice do slot)
      if(qk>=0||['Space','KeyW','KeyA','KeyS','KeyD','KeyF','KeyQ','KeyX','Tab'].includes(e.code)) e.preventDefault();
      if(e.repeat) return;
      if(qk>=0){ this.items.selectQuick(qk); return; }
      switch(e.code){
        case 'Space': this.player.jump({x:(this.keys.KeyD?1:0)-(this.keys.KeyA?1:0),y:(this.keys.KeyW?1:0)-(this.keys.KeyS?1:0)}); break;
        case 'KeyF': this.interact(); break;
        case 'KeyQ': this.items.quick('pills'); break;
        case 'KeyX': this.items.holsterAll(); break;
        case 'Tab': this.openInventory(); break;   // alterna: a mochila é interativa e precisa do mouse solto
        case 'Escape': case 'KeyP': this.pause(); break;
      }
    });
    addEventListener('keyup',e=>{ this.keys[e.code]=false; });
    // eventos do player → áudio/UI
    const p=this.player, a=this.audio, ui=this.ui;
    const handName=h=>h.side<0?'esquerda':'direita';
    p.on('grab',()=>a.grab());
    p.on('slip',h=>{ ui.msg(`A mão ${handName(h)} não conseguiu segurar a queda.`,1.8); a.noise(.12,1500,.2); });
    p.on('exhausted',h=>{ ui.msg(`Sua mão ${handName(h)} cedeu.`,1.8); a.noise(.1,900,.2); });
    p.on('crumble',()=>ui.msg('A saliência se desfez.',1.8));
    p.on('weak',()=>ui.msg('Sem força para se impulsionar.',1.5));
    p.on('needPull',()=>ui.msg(this.vr.active?'Segurando, desça o braço para puxar o corpo.':'Segure e arraste o mouse para baixo para puxar o corpo.',2));
    p.on('armsFailing',()=>{ ui.msg('Seus braços estão cedendo.',1.8); a.heartbeat(); });
    p.on('gripSlip',()=>a.noise(.06,1200,.1));
    p.on('walljump',()=>a.noise(.08,900,.18));
    p.on('mantle',()=>a.noise(.15,500,.28));
    p.on('land',v=>a.land(v));
    p.on('nailPop',()=>{ ui.msg('O prego solto escapou da parede.',1.8); a.noise(.1,2600,.15); });
    p.on('windTear',()=>{ ui.msg('O vento arrancou suas mãos da parede.',2); a.whoosh(); });
    this.world.onCrumble=o=>{ if(o.userData.type==='nail') this.player.emit('nailPop'); else a.crack(); };
    this.world.onSecretRevealed=()=>{ this.score.onSecret(300); };
    this.world.onMazeEvent=ev=>{ if(ev==='countdown'){ ui.msg('A tela começou a falhar. Memorize a rota.',3); a.buzz(); } else if(ev==='dark'){ ui.msg('A tela apagou. Agora é de memória.',3); a.buzz(); } };
  }
  // ---------- loop ----------
  _loop(now){
    const dt=Math.min(.05,(now-this.last)/1000); this.last=now; this.vt+=dt;
    try{
      if(this.state==='play') this._play(dt);
      else if(this.state==='intro'){ this.cinematic.update(dt); this._ambient(dt,false); }
      else if(this.state==='menu'){ this._menuCam(dt); this._ambient(dt,false); }
      else if(this.state==='inventory'){ this._ambient(dt,false); this.ui.renderPack(this.items,this.player); }
      else if(this.state==='spectate'){ this.spectator.update(dt); this.fx.update(dt); }
      else this._ambient(dt,false);
      this.mass.visual(this.vt);
      this.ui.tick(dt);
      if(this.vr.active){ if(this.state!=='play') this.vr.idle(dt); this.vr.updatePanel(this.ui); }
      this.renderer.render(this.scene,this.camera);
    }catch(err){ console.error(err); }
  }
  _ambient(dt,playing){ this.fx.update(dt); this.audio.setWind(0); this.atmosphere.update(dt,{player:this.player,world:this.world,mass:this.mass,state:this.getUIState(),playing}); }
  // vento dos ventiladores: som, poeira levada pelo fluxo e um aviso na primeira vez que ele pega o jogador
  _windFx(dt){
    const p=this.player, lvl=p.windLevel||0, a=p.windAir;
    this.audio.setWind(lvl);
    if(a&&Math.random()<dt*(6+lvl*40)){ const q=p.position, r=()=>(Math.random()-.5)*2.4; this.fx.spawn('air',new V3(q.x+r(),q.y+.3+Math.random()*2.2,q.z+r()),a,1); }
    if(lvl>.3&&!this._windWarned){ this._windWarned=true; this.ui.msg(p.windFan&&p.windFan.mode==='pull'?'O ar puxa você para cima, na direção do exaustor.':'O fluxo de ar empurra você para cima.',3); }
    if(lvl<.05) this._windWarned=false;
  }
  _menuCam(dt){
    if(this.vr.active){ this.vr.place(); return; }
    this.menuT+=dt; const sp=this.world.spawnPoint, c=this.camera;
    c.position.set(sp.x,sp.y+EYE,sp.z); c.rotation.set(.85+Math.sin(this.menuT*.15)*.08,this.world.spawnYaw+this.menuT*.04,0); c.updateMatrixWorld();
    this.player.viewmodelVisible=false; this.player.updateViewmodel();
  }
  _play(dt){
    const k=this.keys;
    let input={x:(k.KeyD?1:0)-(k.KeyA?1:0),y:(k.KeyW?1:0)-(k.KeyS?1:0)};
    if(this.vr.active){ this.vr.update(dt); if(this.state!=='play') return; input=this.vr.input; }
    this.world.update(dt,this.player);
    this.player.update(dt,input);
    this._windFx(dt);
    this.items.update(dt); this.fx.update(dt);
    this.timer.update(dt);
    this.puzzles.update(dt);
    if(this.mass.update(dt,this.timer.elapsedTime,this.player)==='activated') this.ui.msg('O piso vibra. Algo lá embaixo começou a subir.',4);
    if(this.mass.caught&&!this.player.dead) this.player.die('mass');
    this.player.applyCamera(); this.player.updateViewmodel();
    const cp=this.checkpoints.update(this.player);
    if(cp.justCollected){ this.score.onCheckpoint(cp.justCollected); this.audio.chime(); }
    this.score.update(this.player);
    const gs=this.getUIState();
    this.atmosphere.update(dt,{player:this.player,world:this.world,mass:this.mass,state:gs,playing:true});
    this.audio.setRumble(this.mass.active?clamp(1-gs.massDistance/35,.04,.9):.03);
    const q=this.interaction.query();
    this.ui.updateHUD(gs,this.player,q,this.items);
    if(this.vr.active) this.vr.afterPlay(dt,q,gs);
    if(this.player.dead) this.endRun(this.player.deathReason);
    else if(cp.finished) this.endRun('finish');
  }
}