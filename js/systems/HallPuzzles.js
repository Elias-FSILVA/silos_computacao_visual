'use strict';
// ============================================================================
// js/systems/HallPuzzles.js — lógica dos três DESTINOS (puzzles em várias etapas) e a escolha da ROTA
//   HallPuzzle: controla presença (a massa fica contida abaixo enquanto você está dentro), eventos dos mecanismos e a decisão.
//   FoundryLogic    (Casa das Bombas): energia → equilibrar 4 tanques por dedução → ordem das bombas por 3 páginas → Válvula-Mestra (SELO)
//   GreenhouseLogic (Estufa):          raízes (martelo) → ciclo das estações (símbolos) → luzes em ordem → Coração com cartão (COMUNHÃO)
//   ArchiveLogic    (Arquivo):         mural a contar → labirinto no escuro → teclado na saída → 7 placas → cofre (TESTEMUNHO)
//   HubLogic        (Pátio das Máquinas): energia (geradores + barramento) e freio (a Estufa) → elevador de carga
//   ExhaustLogic    (Galeria do exaustor): registro de ar emperrado → porta pressurizada → escada do poço de serviço
// Os mecanismos (Wheel/Lever/Dial/Reader/Smashable/Tag/Decision/KeyButton/ElevatorControl) só avisam: puzzles.event(hall,nome,dados);
// a lógica responde com puzzles.allow(hall,nome,dados) e atualiza o cenário por room.refs.
// Presença: enquanto o jogador está numa ala obrigatória, a massa fica contida abaixo dela. Uma sala-filha (room.parent,
// ex.: a Estufa dentro do Pátio) não controla a presença: quem controla é a sala-mãe, que conta as zonas das filhas.
// ============================================================================
class HallPuzzle{
  constructor(game,room){
    this.g=game; this.room=room; this.id=room.id; this.kind=room.kind;
    this.active=false; this.solved=false; this.failed=false; this.timeRemaining=null; this.phase='idle'; this.t=0;
    this.requiredActions=[]; this.completedActions=[];
    const L={foundry:FoundryLogic,greenhouse:GreenhouseLogic,hub:HubLogic,exhaust:ExhaustLogic}[room.kind]||ArchiveLogic;
    this.logic=new L(this);
  }
  get refs(){ return this.room.refs; }
  msg(text,s=3){ this.g.ui.msg(text,s); }
  shake(a=.5){ if(this.g.player&&this.g.player.addShake) this.g.player.addShake(a); }
  score(v){ if(this.g.score&&this.g.score.onPuzzle) this.g.score.onPuzzle(v); }
  step(name){ if(!this.completedActions.includes(name)) this.completedActions.push(name); }
  allow(name,data){ return this.logic.allow?this.logic.allow(name,data):true; }
  onEvent(name,data){ this.logic.onEvent(name,data); }
  press(label){ if(this.logic.onKey) this.logic.onKey(label); }
  complete(){ if(this.solved) return; this.solved=true; this.step('lock'); this.score(1500); if(this.g.audio&&this.g.audio.chime) this.g.audio.chime(); }
  commit(route){ this.g.puzzles.commitRoute(route); }
  // zonas que contam como "dentro" (a sala, os braços, o duto e as salas-filhas)
  insideZones(){ const R=this.room, w=this.g.world, kids=(R.children||[]).map(id=>w.puzzleRooms[id]).filter(Boolean);
    return [R.zoneRoom,...(R.zones||[]),R.zoneDuct,...kids.flatMap(k=>[k.zoneRoom,...(k.zones||[])])].filter(Boolean); }
  presenceAt(pos){const R=this.room;return {inHall:inBox(pos,R.zoneRoom)&&(R.triggerZ==null||pos.z<R.triggerZ),inside:this.insideZones().some(z=>inBox(pos,z))};}
  update(dt){
    this.t+=dt; const g=this.g, R=this.room, pos=g.player.position;
    if(R.parent){ if(this.logic.update) this.logic.update(dt); return; }    // sala-filha: a mãe cuida da massa
    const seen=(g.presence&&g.presence.read('hall:'+this.id))||this.presenceAt(pos),{inHall,inside}=seen;
    if(this.phase==='idle'){
      if(inHall&&!seen.$protected&&!this.solved){ this.phase='inside'; g.mass.setHold(R.cap,Math.max(.6,(R.cap-g.mass.y)/3.5)); }
    } else if(this.phase==='inside'){
      if(!inside){ this.phase=this.solved?'done':'idle'; g.mass.releaseHold(); }
    }
    if(this.logic.update) this.logic.update(dt);
  }
  get uiState(){ return {id:this.id,active:false,solved:this.solved,failed:false,phase:this.phase,timeRemaining:0,requiredActions:this.requiredActions.slice(),completedActions:this.completedActions.slice()}; }
}

// ---------------------------------------------------------------------------------------------
class FoundryLogic{
  constructor(p){
    this.p=p; this.stage=0; this.seq=[]; this.counts=[0,0,0,0]; const F=FOUNDRY;
    this.target=F.faces.map(f=>f.indexOf(F.target));
    this.L0=this.target.map((t,k)=>{ let sum=0; for(let v=0;v<4;v++) sum+=F.solution[v]*F.M[v][k]; return (((t-sum)%4)+4)%4; });
    this.level=this.L0.slice(); this._show(true);
    p.requiredActions=['power','balance','pumps'];
  }
  get refs(){ return this.p.refs; }
  _show(instant){ this.level.forEach((l,i)=>this.refs.gauges[i].setLevel(l,instant)); }
  _recompute(){ const F=FOUNDRY; this.level=this.L0.map((l0,k)=>{ let s=l0; for(let v=0;v<4;v++) s+=this.counts[v]*F.M[v][k]; return s%4; }); }
  allow(name,d){
    if(name==='wheel') return this.stage===1;
    if(name==='lever'){ if(d.id==='breaker') return true; if(d.id.startsWith('pump:')) return d.on&&this.stage===2; return true; }
    if(name==='decide') return this.stage>=3;
    return true;
  }
  onEvent(name,d){
    const p=this.p, F=FOUNDRY;
    if(name==='lever'&&d.id==='breaker'&&d.on){
      this.stage=1; p.step('power'); p.score(400); this.refs.setPower(true); p.msg('O quadro de força volta. As luzes acendem — e os mostradores acordam.',4);
    } else if(name==='wheel'){
      const v=Number(d.id.replace('valve','')); this.counts[v]=d.state; this._recompute(); this._show(false);
      if(this.level.every((l,k)=>l===this.target[k])){ this.stage=2; p.step('balance'); p.score(600); p.msg('As quatro agulhas travam sobre △. As bombas já respondem.',4); if(p.g.audio.chime) p.g.audio.chime(); }
    } else if(name==='lever'&&d.id.startsWith('pump:')){
      this.seq.push(d.id.slice(5));
      if(this.seq.length===F.order.length){
        if(this.seq.every((s,i)=>s===F.order[i])){ this.stage=3; p.step('pumps'); p.complete(); this.refs.doors.exit.set(true); this.refs.doors.master.set(true);
          p.msg('As bombas assumem o ritmo. A porta da galeria e a câmara da Válvula-Mestra se abrem.',5); }
        else this._surge();
      }
    } else if(name==='decide') p.commit('seal');
  }
  _surge(){
    const p=this.p; p.shake(.9); p.msg('Surto de pressão! O circuito inteiro reiniciou.',4); this.stage=1; this.seq=[]; this.counts=[0,0,0,0]; this.level=this.L0.slice();
    this.refs.wheels.forEach(w=>w.setState(0,false)); this._show(false);
    Object.values(this.refs.pumps).forEach(l=>l.setOn(false,false));
    this.refs.lights.forEach(L=>{ L.intensity=.2; }); this._flick=1.4;
  }
  update(dt){ if(this._flick>0){ this._flick-=dt; const on=this._flick<=0||Math.sin(this._flick*40)>0; this.refs.lights.forEach(L=>{ L.intensity=on?1.15:.15; }); } }
}

// ---------------------------------------------------------------------------------------------
class GreenhouseLogic{
  constructor(p){ this.p=p; this.stage=0; this.attempt=0; this.lockUntil=0; this.seq=[]; p.requiredActions=['roots','cycle','lamps']; }
  get refs(){ return this.p.refs; }
  get locked(){ return this.p.t<this.lockUntil; }
  allow(name,d){
    if(name==='dial') return this.stage===1&&!this.locked;
    if(name==='lever'){
      if(d.id==='root') return this.stage===1&&!this.locked;
      if(d.id.startsWith('bed:')) return this.stage===2&&d.on;
      return true;
    }
    if(name==='decide') return true;
    return true;
  }
  onEvent(name,d){
    const p=this.p, G=GREEN, R=this.refs;
    if(name==='smash'&&d.id==='roots'){ this.stage=1; p.step('roots'); p.score(400); p.msg('As raízes cedem. O ar é úmido e doce.',4); }
    else if(name==='lever'&&d.id==='root'){
      const ok=R.dials.every((dl,i)=>dl.symbols[dl.state]===G.seasons[i]);
      if(ok){ this.stage=2; p.step('cycle'); p.score(700); p.msg('O altar aceita o ciclo. As luzes dos canteiros respondem.',5); if(p.g.audio.chime) p.g.audio.chime(); }
      else {
        const wait=G.lock[Math.min(this.attempt,G.lock.length-1)]; this.attempt++; this.lockUntil=p.t+wait; p.shake(.5);
        p.msg(`As raízes recuam. O altar fica inerte por ${wait} s.`,4); R.levers.root.setOn(false,false); this._dim=wait;
        R.lights.forEach(L=>{ L.intensity*=.25; });
      }
    } else if(name==='lever'&&d.id.startsWith('bed:')){
      const sym=d.id.slice(4), first=G.seasons[0], last=G.seasons[3]; this.seq.push(sym);
      const okSoFar=this.seq.length===1?sym===first:this.seq.length===2?sym===last:false;
      if(okSoFar){ R.setLamp(sym,true); if(this.seq.length===2){ this.stage=3; p.step('lamps'); p.complete();
        if(R.doors.exit){ R.doors.exit.set(true); p.msg('A estufa respira. A passarela da galeria se abre.',5); }
        else { p.msg('A estufa respira. Longe dali, no poço do elevador, as raízes afrouxam.',5); p.g.puzzles.event(p.room.parent,'brake',{}); } } }
      else this._wither();
    } else if(name==='reader'){ R.doors.heart.set(true); R.setHeart(true); p.step('heart'); p.score(300); p.msg('A câmara do Coração se abre.',4); }
    else if(name==='decide') p.commit('commune');
  }
  _wither(){
    const p=this.p, R=this.refs; p.shake(.7); p.msg('As raízes acordam e murcham tudo. As luzes se apagam — recomece pelo ciclo.',5);
    this.seq=[]; Object.keys(R.beds).forEach(s=>{ R.setLamp(s,false); if(R.levers['bed:'+s]) R.levers['bed:'+s].setOn(false,false); });
  }
  update(dt){ if(this._dim>0){ this._dim-=dt; if(this._dim<=0){ this._dim=0; this.refs.lights.forEach((L,i)=>{ L.intensity=i===2?1.3:.95; }); } } }
}

// ---------------------------------------------------------------------------------------------
class ArchiveLogic{
  constructor(p){ this.p=p; this.typed=''; this.tags=new Set(); this.attempt=0; this.lockUntil=0; p.requiredActions=['code']; }
  get refs(){ return this.p.refs; }
  get locked(){ return this.p.t<this.lockUntil; }
  allow(name,d){ if(name==='decide') return this.tags.size>=7; return true; }
  onKey(label){
    const p=this.p, R=this.refs; if(p.solved) return;
    if(this.locked){ R.display('TRAVADO','#ff6a5a'); return; }
    if(label==='C'){ this.typed=''; R.display('- - -'); return; }
    if(label==='OK'){
      if(this.typed===p.room.code){ R.display('ABERTO','#9bffa8'); R.doors.hatch.set(true); p.step('code'); p.complete(); p.msg('O trinco cede. O duto de manutenção está aberto.',4); return; }
      this.attempt++; const wait=10*this.attempt; this.lockUntil=p.t+wait; this.typed=''; R.display('ERRO','#ff6a5a'); p.shake(.3); p.msg(`Código errado. O teclado trava por ${wait} s.`,3); return;
    }
    if(this.typed.length<3){ this.typed+=label; R.display(this.typed.padEnd(3,'-').split('').join(' ')); }
  }
  onEvent(name,d){
    const p=this.p, R=this.refs;
    if(name==='tag'){
      this.tags.add(d.id); const n=this.tags.size; p.score(150);
      p.msg(`Placa recolhida: ${d.name} (${n}/7)`,3);
      if(n>=7){ R.doors.vault.set(true); p.step('names'); p.msg('Sete placas. O cofre do Registro se abre.',5); if(p.g.audio.chime) p.g.audio.chime(); }
    } else if(name==='decide') p.commit('witness');
  }
}

// ---------------------------------------------------------------------------------------------
// PÁTIO DAS MÁQUINAS: dois objetivos destravam o elevador de carga.
//   ENERGIA (Casa de Força): ligar geradores cuja soma dê a demanda do motor (placa junto ao elevador), sem dois
//     vizinhos ligados, e fechar o barramento. Errado → desarma: tudo desliga e o painel trava alguns segundos.
//   FREIO (Estufa): o ciclo completo faz as raízes soltarem o freio de segurança (evento 'brake' vindo da Estufa).
//   ELEVADOR: com os dois, o painel da cabine leva o jogador (dentro da cabine) até 224 m.
class HubLogic{
  constructor(p){ this.p=p; this.power=false; this.brake=false; this.on=POWER.ratings.map(()=>false); this.lockUntil=0; this.trips=0; this.entered=false; p.requiredActions=['power','brake','elevator'];
    const el=this.refs.elevator; if(el) el.onArrive=()=>{ p.msg(`Patamar de ${HUB.elevator.top} m. O braço devolve ao poço, acima da grade.`,4); if(p.g.audio.clank) p.g.audio.clank(); }; }
  get refs(){ return this.p.refs; }
  get locked(){ return this.p.t<this.lockUntil; }
  load(){ return this.on.reduce((s,v,i)=>s+(v?POWER.ratings[i]:0),0); }
  _show(state,col){ const R=this.refs; R.lamps.forEach((l,i)=>{ l.material=this.on[i]?MAT.glowAmber:MAT.darkLamp; }); if(R.display) R.display(this.load(),state,col); }
  allow(name,d){
    if(name==='lever'){
      if(this.power) return 'Energia estável no motor. Melhor não mexer em mais nada.';
      if(this.locked) return 'O barramento desarmou. O painel rearma em instantes.';
      if(d.id==='bus'&&!d.on) return 'O barramento só abre sozinho, no desarme.';
      return true;
    }
    if(name==='elevator'){
      const el=this.refs.elevator, pl=this.p.g.player;
      if(!el||el.state!=='bottom') return 'O elevador já subiu.';
      if(!this.power&&!this.brake) return 'Nada acende. Sem energia, e o freio de segurança continua travado.';
      if(!this.power) return 'Sem energia. A Casa de Força (leste do anel) está desligada.';
      if(!this.brake) return 'O motor ronca, mas o freio de segurança não solta: as raízes ainda o seguram.';
      if(!el.inCabin(pl)) return 'Entre na cabine antes de acionar.';
      return true;
    }
    return true;
  }
  onEvent(name,d){
    const p=this.p, R=this.refs;
    if(name==='lever'&&d.id.startsWith('gen:')){ this.on[Number(d.id.slice(4))]=d.on; this._show(this.load()?'GERADORES PRONTOS':'DESLIGADO'); }
    else if(name==='lever'&&d.id==='bus'){
      const L=this.load(), adj=this.on.some((v,i)=>v&&this.on[i+1]);
      if(L===POWER.demand&&!adj){
        this.power=true; p.step('power'); p.score(600); this._show('ENERGIA NO MOTOR','#9bffa8');
        R.setStatus('power',true); R.setPowerLights(true);
        p.msg(`O barramento fecha em ${L} MW. Lá no anel, o motor do elevador acorda.`,5); if(p.g.audio.chime) p.g.audio.chime();
        this._check();
      } else this._trip(adj?'Dois geradores vizinhos ligados: o cabo entre eles estoura e o barramento desarma.':`Carga de ${L} MW: não é o que o motor pede. O barramento desarma.`);
    }
    else if(name==='brake'&&!this.brake){ this.brake=true; p.step('brake'); p.score(400); R.releaseBrake(); R.setStatus('brake',true); this._check(); }
    else if(name==='elevator'){
      if(R.elevator.start()){ p.step('elevator'); p.complete(); p.msg('As portas fecham. A cabine estremece e começa a subir.',4); if(p.g.audio.motor) p.g.audio.motor(12); }
    }
  }
  _check(){ if(this.power&&this.brake) this.p.msg('Energia e freio liberados: o elevador de carga (sul do anel) está pronto.',5); }
  _trip(why){
    const p=this.p, R=this.refs; p.shake(.6); p.msg(why+` Painel travado por ${POWER.lockout} s.`+this._tip(++this.trips),this.trips>1?7:4); if(p.g.audio.crash) p.g.audio.crash();
    this.on=this.on.map(()=>false); R.gens.forEach(l=>l.setOn(false,false)); R.bus.setOn(false,false);
    this.lockUntil=p.t+POWER.lockout; this._show('DESARMADO','#ff6a5a');
  }
  // dica cada vez mais direta a cada desarme: a regra → as potências dos vizinhos → a resposta
  _tip(n){
    const r=POWER.ratings, d=POWER.demand;
    if(n===2) return ` Dica: some as placas dos geradores (${r.map((v,i)=>'G'+(i+1)+'='+v).join(', ')}) até dar ${d} MW, pulando os vizinhos.`;
    if(n>=3){ const sol=[]; for(let m=1;m<1<<r.length;m++){ if(m&(m>>1)) continue; let s=0; r.forEach((v,i)=>{ if(m>>i&1) s+=v; }); if(s===d){ r.forEach((_,i)=>{ if(m>>i&1) sol.push('G'+(i+1)); }); break; } }
      return ` Dica: ligue só ${sol.join(' e ')} e depois feche o barramento.`; }
    return '';
  }
  presenceAt(pos){const z=this.p.room.zones&&this.p.room.zones[0];return {powerEntry:!!z&&inBox(pos,z)};}
  update(){
    if(this._wasLocked&&!this.locked) this._show('REARMADO'); this._wasLocked=this.locked;
    // primeira vez na Casa de Força sem energia: diz o objetivo e onde está a regra
    const g=this.p.g,seen=(g.presence&&g.presence.read('hub:'+this.p.id+':power-entry'))||this.presenceAt(g.player.position);
    if(!this.entered&&!this.power&&!seen.$protected&&seen.powerEntry){ this.entered=true;
      this.p.msg(`Casa de Força sem energia. Para religar a luz e o elevador: ligue geradores que somem ${POWER.demand} MW (sem dois vizinhos) e feche o barramento. O quadro ao lado da porta explica.`,8); }
  }
}

// ---------------------------------------------------------------------------------------------
// GALERIA DO EXAUSTOR: o registro de ar (emperrado: martelo) fecha o fluxo e destrava a porta pressurizada;
// depois dela, a escada do poço de serviço leva ao braço de 174 m, acima do exaustor.
class ExhaustLogic{
  constructor(p){ this.p=p; p.requiredActions=['door']; }
  get refs(){ return this.p.refs; }
  allow(name,d){ if(name==='wheel') return !this.p.solved; return true; }
  onEvent(name,d){
    const p=this.p;
    if(name==='wheel'&&d.id==='register'&&d.state===1&&!p.solved){
      this.refs.door.set(true); p.step('door'); p.complete();
      p.msg('O registro fecha com um baque. A porta pressurizada destrava: siga até a escada do poço de serviço.',5);
    }
  }
}
