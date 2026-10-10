'use strict';
// ============================================================================
// js/systems/HallPuzzles.js — lógica dos três DESTINOS (puzzles em várias etapas) e a escolha da ROTA
//   HallPuzzle: controla presença (a massa fica contida abaixo enquanto você está dentro), eventos dos mecanismos e a decisão.
//   FoundryLogic    (Casa das Bombas): energia → equilibrar 4 tanques por dedução → ordem das bombas por 3 páginas → Válvula-Mestra (SELO)
//   GreenhouseLogic (Estufa):          raízes (martelo) → ciclo das estações (símbolos) → luzes em ordem → Coração com cartão (COMUNHÃO)
//   ArchiveLogic    (Arquivo):         mural a contar → labirinto no escuro → teclado na saída → 7 placas → cofre (TESTEMUNHO)
// Os mecanismos (Wheel/Lever/Dial/Reader/Smashable/Tag/Decision/KeyButton) só avisam: puzzles.event(hall,nome,dados);
// a lógica responde com puzzles.allow(hall,nome,dados) e atualiza o cenário por room.refs.
// ============================================================================
class HallPuzzle{
  constructor(game,room){
    this.g=game; this.room=room; this.id=room.id; this.kind=room.kind;
    this.active=false; this.solved=false; this.failed=false; this.timeRemaining=null; this.phase='idle'; this.t=0;
    this.requiredActions=[]; this.completedActions=[];
    this.logic=room.kind==='foundry'?new FoundryLogic(this):room.kind==='greenhouse'?new GreenhouseLogic(this):new ArchiveLogic(this);
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
  update(dt){
    this.t+=dt; const g=this.g, R=this.room, pos=g.player.position;
    const inHall=inBox(pos,R.zoneRoom)&&(R.triggerZ==null||pos.z<R.triggerZ);
    const inside=inBox(pos,R.zoneRoom)||(R.zones||[]).some(z=>inBox(pos,z))||(R.zoneDuct&&inBox(pos,R.zoneDuct));
    if(this.phase==='idle'){
      if(inHall&&!this.solved){ this.phase='inside'; g.mass.setHold(R.cap,Math.max(.6,(R.cap-g.mass.y)/3.5)); }
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
      if(okSoFar){ R.setLamp(sym,true); if(this.seq.length===2){ this.stage=3; p.step('lamps'); p.complete(); R.doors.exit.set(true); p.msg('A estufa respira. A passarela da galeria se abre.',5); } }
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
