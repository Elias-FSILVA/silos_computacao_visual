'use strict';
// ============================================================================
// js/systems/PuzzleSystem.js — puzzles modulares; cada puzzle expõe:
//   active, solved, failed, timeRemaining, requiredActions, completedActions
// O World só descreve a sala (world.puzzleDefs / world.puzzleRooms); a lógica vive aqui.
// ============================================================================
const inBox=(p,z)=>p.x>=z.minX&&p.x<=z.maxX&&p.z>=z.minZ&&p.z<=z.maxZ&&p.y>=z.minY&&p.y<=z.maxY;

class ContainmentPuzzle{
  constructor(game,room){
    this.g=game; this.room=room; this.id=room.id;
    this.duration=120;
    this.active=false; this.solved=false; this.failed=false; this.timeRemaining=this.duration;
    this.requiredActions=['code']; this.completedActions=[];
    this.phase='idle'; this.t=0; this.input=''; this.flash=null; this.nextBoom=0; this.lockIdx=0; this.grace=0; this.flood=null;
    this.lampT=0; this._screen();
  }
  get timeLeft(){ return Math.max(0,this.timeRemaining); }
  // ---------- entrada do teclado físico ----------
  press(label){
    const a=this.g.audio;
    if(this.solved){ a.tone(880,.06,.05,'square'); return; }
    if(label==='C'){ this.input=''; a.tone(520,.06,.05,'square'); }
    else if(label==='OK'){
      if(!this.input.length){ a.deny(); return; }
      if(this.input===this.room.code) this._solve();
      else { this.flash={text:'ACESSO NEGADO',color:'#ff4a3a',t:1.3}; this.input=''; a.denied(); this.g.player.addShake(.1); }
    } else if(this.input.length<3){ this.input+=label; a.tone(660+this.input.length*90,.07,.05,'square'); }
    else a.deny();
    this._screen();
  }
  // ---------- fluxo ----------
  _trigger(){
    const g=this.g, m=g.mass;
    this.active=true; this.phase='closing'; this.t=0;
    const cap=50.3; m.setHold(cap,Math.max(.6,(cap-m.y)/3.5));
    g.audio.siren(true); g.audio.motor(2.6);
  }
  _solve(){
    this.solved=true; this.completedActions.push('code'); this.flash={text:'ACESSO LIBERADO',color:'#7fe08a',t:99};
    this.phase='unlocking'; this.t=0; this.lockIdx=0; this.g.audio.granted(); this.g.audio.siren(false);
    this.room.alarm.light.intensity=0; this.room.alarm.mat.color.setHex(0x1f6a2a);
    this.g.score.onPuzzle(1000+Math.round(this.timeLeft*10));
  }
  _fail(){
    this.failed=true; this.phase='failing'; this.t=0; this.flash={text:'FALHA DE CONTENÇÃO',color:'#ff4a3a',t:99};
    this.g.ui.msg('A porta atrás de você está cedendo.',3); this.g.audio.siren(true);
  }
  _breach(){
    const g=this.g, d=this.room.entry; this.phase='breached'; this.t=0;
    this._setDoor(d,d.closedY+.9); g.audio.crash(); g.player.addShake(.6);
    g.fx.spawn('flesh',this.room.doorTop.clone().setY(50.4),new V3(0,0,-1),14);
    g.mass.releaseHold(); this._makeFlood();
  }
  _makeFlood(){
    const mat=g_massMat(this.g);
    const mk=(z0,z1,x0,x1)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,.3,z1-z0),mat); m.position.set((x0+x1)/2,49.6,(z0+z1)/2); this.g.world.root.add(m); return m; };
    this.flood={y:49.0,parts:[mk(-11,-4.5,-3.5,3.5),mk(-13,-11.3,-2.6,-.4)]};
  }
  _setDoor(d,y){ d.y=y; d.mesh.position.y=y; d.aabb.bottom=y-1.3; d.aabb.top=y+1.3; }
  _screen(){
    const s=this.room.screen; if(!s) return; const g=s.ctx, W2=s.canvas.width, H2=s.canvas.height;
    g.fillStyle='#020802'; g.fillRect(0,0,W2,H2);
    g.font='bold 20px monospace'; g.textAlign='center'; g.textBaseline='middle';
    if(this.flash&&this.flash.t>0){ g.fillStyle=this.flash.color; g.fillText(this.flash.text,W2/2,H2/2-10);
      if(this.solved){ g.font='14px monospace'; g.fillStyle='#4fa05a'; g.fillText('TRAVAS: '+'■'.repeat(this.lockIdx)+'□'.repeat(3-this.lockIdx),W2/2,H2/2+24); } }
    else {
      g.fillStyle='#4fa05a'; g.font='14px monospace'; g.fillText(this.phase==='idle'?'SISTEMA EM ESPERA':'[ SISTEMA BLOQUEADO ]',W2/2,30);
      g.fillText('SEQUÊNCIA DE ACESSO',W2/2,60);
      g.font='bold 34px monospace'; g.fillStyle='#7fe08a';
      g.fillText([0,1,2].map(i=>this.input[i]||'_').join(' '),W2/2,102);
    }
    s.tex.needsUpdate=true;
  }
  // ---------- atualização ----------
  update(dt){
    const g=this.g, p=g.player, R=this.room, pos=p.position;
    // luminárias da sala: uma pisca, a outra nunca falha (parte da pista)
    this.lampT+=dt; const fl=(Math.sin(this.lampT*17)+Math.sin(this.lampT*5.3)>.5)?.1:1;
    R.lampFlicker.light.intensity=1.0*fl; R.lampFlicker.mat.color.setRGB(.25+.75*fl,.24+.71*fl,.2+.58*fl);
    if(this.flash&&this.flash.t<99){ this.flash.t-=dt; if(this.flash.t<=0){ this.flash=null; this._screen(); } }
    if(this.phase==='idle'){ if(inBox(pos,R.zoneRoom)) this._trigger(); return; }
    this.t+=dt;
    // alarme pulsando
    if(!this.solved){ const k=(Math.sin(this.t*(this.failed?9:5))+1)/2; R.alarm.light.intensity=.4+k*1.6; R.alarm.mat.color.setRGB(.25+.7*k,.03,.02); }
    const d=R.entry;
    switch(this.phase){
      case 'closing': {
        const k=Math.min(1,this.t/2.6); this._setDoor(d,lerp(d.openY,d.closedY,smooth(k)));
        if(k>=1){ this.phase='running'; this.t=0; g.audio.clank(); g.player.addShake(.3); this.nextBoom=6+Math.random()*4; g.audio.siren(false); }
        break; }
      case 'running': case 'failing': {
        if(!this.solved||this.phase==='failing'){ this.timeRemaining-=dt; }
        this._booms(dt);
        if(this.phase==='running'&&this.timeRemaining<=0&&!this.solved) this._fail();
        if(this.phase==='failing'&&this.t>9) this._breach();
        break; }
      case 'breached': this._booms(dt); break;
      case 'unlocking': {
        this._booms(dt);
        const step=Math.floor(this.t/.45);
        while(this.lockIdx<Math.min(3,step)){ R.locks[this.lockIdx].color.setHex(0x2fb04a); this.lockIdx++; g.audio.clank(); this._screen(); }
        if(this.t>1.5&&!this.hissed){ this.hissed=true; g.audio.hiss(); g.audio.motor(2.2); }
        const k=clamp((this.t-1.6)/2.2,0,1); this._setDoor(R.exit,lerp(R.exit.closedY,R.exit.openY,smooth(k)));
        if(k>=1){ this.phase='open'; this.t=0; }
        break; }
      case 'open': {
        this._booms(dt);
        if(inBox(pos,R.zoneDuct)&&pos.y>53.2){ this.phase='sealing'; this.t=0; g.audio.motor(2); }
        break; }
      case 'sealing': {
        const k=Math.min(1,this.t/2); this._setDoor(R.exit,lerp(R.exit.openY,R.exit.closedY,smooth(k)));
        if(k>=1){ g.audio.clank(); this.phase='done'; this.t=0; this.grace=25; this.active=false; }
        break; }
      case 'done': {
        if(this.grace>0){ this.grace-=dt; if(this.grace<=0&&g.mass.hold){ g.mass.releaseHold(); g.audio.boom(); } }
        break; }
    }
    if(this.flood) this._updateFlood(dt);
    if(this.phase==='running'||this.phase==='failing') this._screenTick();
  }
  _screenTick(){ this._st=(this._st||0)+1; if(this._st%10===0) this._screen(); }
  _booms(dt){
    const g=this.g; if(!g.mass.hold||g.mass.hold.breach) return;
    this.nextBoom-=dt; if(this.nextBoom>0) return;
    const late=!this.solved&&this.timeRemaining<30, failing=this.phase==='failing';
    this.nextBoom=failing?1.3+Math.random()*.6:late?3+Math.random()*2:7+Math.random()*5;
    const d=this.room.entry, near=inBox(g.player.position,this.room.zoneRoom);
    g.audio.thump(near?1:.45); if(near) g.player.addShake(failing?.45:.3);
    this._setDoor(d,d.y+(Math.random()*.03)); setTimeout(()=>{ if(this.phase!=='breached') this._setDoor(d,d.closedY+(failing?.08:0)); },90);
    g.fx.spawn('dust',this.room.doorTop,new V3(0,-.2,-1),5);
  }
  _updateFlood(dt){
    const g=this.g, target=clamp(g.mass.y,49.0,62.4), y=this.flood.y=Math.min(target,this.flood.y+.25*dt);
    this.flood.parts[0].position.y=Math.min(y,54.5); this.flood.parts[1].position.y=y;
    const p=g.player.position;
    if((inBox(p,this.room.zoneRoom)||inBox(p,{...this.room.zoneDuct,minY:49})) && p.y+.1<y) g.player.die('mass');
  }
  get uiState(){ return {id:this.id,active:this.active,solved:this.solved,failed:this.failed,phase:this.phase,
    timeRemaining:this.timeLeft,requiredActions:this.requiredActions.slice(),completedActions:this.completedActions.slice()}; }
}
function g_massMat(game){ return game.mass.mesh.material; }

class PuzzleSystem{
  constructor(game){ this.g=game; this.puzzles=[]; }
  reset(){
    const w=this.g.world;
    this.puzzles=w.puzzleDefs.map(d=>d.kind==='containment'?new ContainmentPuzzle(this.g,w.puzzleRooms[d.id]):null).filter(Boolean);
  }
  input(channel,label){ const p=this.puzzles.find(x=>x.id===channel); if(p) p.press(label); }
  update(dt){ this.puzzles.forEach(p=>p.update(dt)); }
  get current(){ const p=this.puzzles.find(x=>x.active||x.phase==='breached'); return p?p.uiState:null; }
}
