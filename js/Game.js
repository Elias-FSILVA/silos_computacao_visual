'use strict';
// ============================================================================
// js/Game.js — fluxo: BOOT → MENU → NOME → START → CINEMATIC → GAMEPLAY → RESULTADO → RANKING
// Estados: menu · intro · play · inventory (mochila aberta, jogo congelado) · paused · ending · result
// ============================================================================
class Game{
  constructor(){
    this.settings=Settings;
    const r=this.renderer=new THREE.WebGLRenderer({antialias:true});
    r.toneMapping=THREE.LinearToneMapping; r.toneMappingExposure=1;
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
    this.puzzles.reset(); this._zones();
    this.cinematic=new IntroCinematic(this);
    this.state='menu'; this.keys={}; this.playerName=''; this.result=null; this.saved=false; this.savedIndex=-1;
    this.gameBtn={}; this._lockGuard=0;   // gameBtn: botões do mouse pressionados DURANTE a partida (cliques na interface não contam)
    this.settingsReturn='menu'; this.wasLocked=false; this.menuT=0; this.vt=0;
    this._wire(); this.applySettings();
    try{ const n=LS&&LS.getItem('silos.lastName'); if(n) this.ui.$('nameIn').value=n; }catch(e){}
    this.ui.show('menu'); this.ui.setHUD(false);
    this.last=performance.now(); requestAnimationFrame(t=>this._loop(t));
  }
  // ---------- configurações ----------
  applySettings(){
    const s=this.settings.data;
    this.camera.fov=s.fov; this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix();
    const pr={low:.6,medium:1,high:Math.min(window.devicePixelRatio||1,2)}[s.quality]||1;
    this.renderer.setPixelRatio(pr); this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.domElement.style.filter=`brightness(${s.brightness})`;
    this.atmosphere.setLightCount(s.quality==='low'?3:5);
    this.audio.apply(s);
  }
  // ---------- fluxo ----------
  tryStart(){
    const v=this.ui.validateName(this.ui.$('nameIn').value);
    this.ui.$('nameErr').textContent=v.ok?'':v.error;
    if(!v.ok){ this.ui.$('nameIn').focus(); return; }
    this.playerName=v.value; try{ LS&&LS.setItem('silos.lastName',v.value); }catch(e){}
    this.audio.init(); this.audio.apply(this.settings.data);
    this.resetRun(); this.ui.hideScreens(); this.state='intro';
    this.cinematic.play(()=>this.beginPlay());
  }
  resetRun(){
    this.world.reset(); this.player.reset(); this.items.reset(); this.mass.reset(); this.timer.reset(); this.score.reset();
    this.fx.clear(); this.puzzles.reset(); this._zones(); this.audio.silence();
    this.checkpoints.reset(); this.atmosphere.reset(); this.result=null; this.saved=false; this.savedIndex=-1; this.vt=0;
    this.ui.hideNote(); this.ui.resetPack(); this.keys={}; this.gameBtn={};   // resetPack: fecha a mochila e esquece as posições dos itens
  }
  _zones(){ this.mass.safeZones=Object.values(this.world.puzzleRooms).flatMap(r=>[r.zoneRoom,r.zoneDuct].filter(Boolean)); }
  beginPlay(){
    this.state='play'; this.timer.start(); this.ui.hideScreens(); this.ui.setHUD(true);
    this.audio.setHum(1); this.lock();
    this.ui.msg('Olhe para uma saliência e segure o botão do mouse para agarrar.',5);
  }
  retry(){ this.audio.init(); this.resetRun(); this.ui.hideScreens(); this.beginPlay(); }
  toMenu(){
    this.state='menu'; this.unlock(); this.resetRun(); this.ui.clearMsg(); this.ui.setHUD(false); this.ui.show('menu');
    this.audio.setRumble(.03); this.audio.setTension(0);
  }
  pause(){
    if(this.state!=='play') return;
    this.state='paused'; this.timer.pause(); this.player.releaseAll(); this.items.use(false); this.keys={};
    this.ui.setPack(false);
    this.unlock(); this.ui.clearMsg(); this.ui.show('pause'); this.audio.setRumble(.02); this.pausedAt=performance.now();
  }
  resume(){ if(this.state!=='paused') return; this.ui.hideScreens(); this.state='play'; this.timer.resume(); this.lock(); }
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
    this.player.releaseAll(); this.unlock(); this.ui.hideNote(); this.ui.setPack(false); this.ui.clearMsg();
    this.audio.siren(false);
    if(result==='finish') this.audio.chime(); else this.audio.boom();
    this.lastRun={name:this.playerName,score:breakdown.total,time:this.timer.time,result,height:this.player.maxHeightReached,breakdown};
    setTimeout(()=>{ if(this.state!=='ending') return; this.state='result'; this.ui.setHUD(false); this.ui.showResult(this.lastRun); },result==='finish'?1400:900);
  }
  saveScore(){
    if(this.saved||!this.lastRun) return;
    const r=this.lastRun;
    const entry={name:r.name,score:r.score,time:Math.round(r.time*100)/100,result:r.result,height:Math.floor(r.height),date:new Date().toISOString().slice(0,10)};
    this.savedIndex=this.ranking.save(entry); this.saved=true;
    const b=this.ui.$('btnSave'); b.disabled=true; b.textContent='Pontuação salva';
    this.ui.$('resSaved').textContent=this.savedIndex>=0?`Posição ${this.savedIndex+1} no ranking.`:'Fora do top 20.';
  }
  showRanking(from){ this.rankReturn=from; this.ui.renderRanking(this.ranking.top(10),from==='result'?this.savedIndex:-1); this.ui.show('ranking'); }
  // ---------- ponteiro ----------
  lock(){ const el=this.renderer.domElement; if(!el.requestPointerLock) return;
    try{ const p=el.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} }
  unlock(){ try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){} }
  // ---------- interação ----------
  interact(){ this.interaction.interact(); }
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
    $('nameIn').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); this.tryStart(); } });
    $('nameIn').addEventListener('input',()=>{ $('nameErr').textContent=''; });
    $('btnSettings').onclick=()=>{ this.settingsReturn='menu'; this.ui.show('settings'); };
    $('btnPauseSettings').onclick=()=>{ this.settingsReturn='pause'; this.ui.show('settings'); };
    $('btnSetBack').onclick=()=>this.ui.show(this.settingsReturn);
    $('btnRanking').onclick=()=>this.showRanking('menu');
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
    addEventListener('blur',()=>{ this.keys={}; if(this.state==='play') this.pause(); });
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.renderer.domElement;
      // abrir/fechar a mochila troca o Pointer Lock de propósito: isso nunca é um pedido de pausa
      if(!locked&&this.wasLocked&&this.state==='play'&&performance.now()>this._lockGuard) this.pause();
      this.wasLocked=locked;
    });
    addEventListener('mousemove',e=>{ if(this.state==='play') this.player.look(e.movementX||0,e.movementY||0,this.settings.data); });
    this.renderer.domElement.addEventListener('mousedown',e=>{
      if(this.state!=='play') return;
      if(!document.pointerLockElement) this.lock();
      this.gameBtn[e.button]=true;
      if(e.button===0) this.player.setGrab(0,true);
      else if(e.button===2){ if(this.items.equipped) this.items.use(true); else this.player.setGrab(1,true); }
    });
    addEventListener('mouseup',e=>{
      // só solta o que um clique de partida segurou: cliques e arrastos na mochila não soltam as mãos
      if(!this.gameBtn[e.button]) return;
      this.gameBtn[e.button]=false;
      if(e.button===0) this.player.setGrab(0,false); else if(e.button===2){ this.items.use(false); this.player.setGrab(1,false); }
    });
    addEventListener('wheel',e=>{ if(this.state==='play'&&Math.abs(e.deltaY)>4) this.items.cycle(e.deltaY>0?1:-1); },{passive:true});
    addEventListener('keydown',e=>{
      const typing=e.target&&e.target.tagName==='INPUT'&&e.target.type==='text';
      if(typing) return;
      if(this.state==='intro'){ if(['Space','Escape','Enter'].includes(e.code)){ e.preventDefault(); this.cinematic.skip(); } return; }
      if(this.state==='inventory'){ this._inventoryKey(e); return; }
      if(this.state==='paused'&&(e.code==='Escape'||e.code==='KeyP')&&!this.ui.$('pause').hidden){ if(performance.now()-(this.pausedAt||0)>350) this.resume(); return; }
      if(this.state!=='play') return;
      this.keys[e.code]=true;
      const qk=QUICK_KEYS.findIndex(q=>q.code===e.code);   // 1–4 → atalhos de equipamento (seguem o vínculo, não o índice do slot)
      if(qk>=0||['Space','KeyW','KeyA','KeyS','KeyD','KeyF','KeyQ','KeyX','Tab'].includes(e.code)) e.preventDefault();
      if(e.repeat) return;
      if(qk>=0){ this.items.selectQuick(qk); return; }
      switch(e.code){
        case 'Space': this.player.jump(); break;
        case 'KeyF': this.interact(); break;
        case 'KeyQ': this.items.quick('pills'); break;
        case 'KeyX': this.items.holster(); break;
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
    p.on('walljump',()=>a.noise(.08,900,.18));
    p.on('mantle',()=>a.noise(.15,500,.28));
    p.on('land',v=>a.land(v));
    p.on('nailPop',()=>{ ui.msg('O prego solto escapou da parede.',1.8); a.noise(.1,2600,.15); });
    this.world.onCrumble=o=>{ if(o.userData.type==='nail') this.player.emit('nailPop'); else a.crack(); };
    this.world.onSecretRevealed=()=>{ this.score.onSecret(300); };
  }
  // ---------- loop ----------
  _loop(now){
    const dt=Math.min(.05,(now-this.last)/1000); this.last=now; this.vt+=dt;
    try{
      if(this.state==='play') this._play(dt);
      else if(this.state==='intro'){ this.cinematic.update(dt); this._ambient(dt,false); }
      else if(this.state==='menu'){ this._menuCam(dt); this._ambient(dt,false); }
      else if(this.state==='inventory'){ this._ambient(dt,false); this.ui.renderPack(this.items,this.player); }
      else this._ambient(dt,false);
      this.mass.visual(this.vt);
      this.ui.tick(dt);
      this.renderer.render(this.scene,this.camera);
    }catch(err){ console.error(err); }
    requestAnimationFrame(t=>this._loop(t));
  }
  _ambient(dt,playing){ this.fx.update(dt); this.atmosphere.update(dt,{player:this.player,world:this.world,mass:this.mass,state:this.getUIState(),playing}); }
  _menuCam(dt){
    this.menuT+=dt; const sp=this.world.spawnPoint, c=this.camera;
    c.position.set(sp.x,sp.y+EYE,sp.z); c.rotation.set(.85+Math.sin(this.menuT*.15)*.08,this.world.spawnYaw+this.menuT*.04,0); c.updateMatrixWorld();
    this.player.viewmodelVisible=false; this.player.updateViewmodel();
  }
  _play(dt){
    const k=this.keys, input={x:(k.KeyD?1:0)-(k.KeyA?1:0),y:(k.KeyW?1:0)-(k.KeyS?1:0)};
    this.world.update(dt);
    this.player.update(dt,input);
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
    this.ui.updateHUD(gs,this.player,this.interaction.query(),this.items);
    if(this.player.dead) this.endRun(this.player.deathReason);
    else if(cp.finished) this.endRun('finish');
  }
}