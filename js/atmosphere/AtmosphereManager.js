'use strict';
// ============================================================================
// js/atmosphere/AtmosphereManager.js — fog, luz, exposição e eventos de tensão
// Lê: player.position.y, player.maxHeightReached, player.stamina; gameplay: checkpointJustCollected, finished, result
// ============================================================================
class AtmosphereManager{
  constructor(scene,renderer,audio){
    this.scene=scene; this.renderer=renderer; this.audio=audio;
    scene.fog=new THREE.FogExp2(0x050403,.06);
    this.ambient=new THREE.AmbientLight(0x2a2620,.55); scene.add(this.ambient);
    this.pool=[]; for(let i=0;i<5;i++){ const l=new THREE.PointLight(0xffe2a8,1.3,15,1.6); scene.add(l); this.pool.push(l); }
    this.lightCount=5;
    this.warm=new THREE.Color(0x070504); this.cold=new THREE.Color(0x04060a); this.red=new THREE.Color(0x1c0404); this.col=new THREE.Color();
    this.shapeMesh=new THREE.Mesh(new THREE.BoxGeometry(.55,4.5,.55),new THREE.MeshBasicMaterial({color:0x000000,fog:false}));
    this.shapeMesh.visible=false; scene.add(this.shapeMesh);
    this.reset();
  }
  reset(){ this.t=0; this.next=40+Math.random()*20; this.pending=null; this.last=null; this.shapes=0;
    this.blackout=0; this.blackoutY=0; this.shape=null; this.heartT=0; this.shapeMesh.visible=false; }
  setLightCount(n){ this.lightCount=n; this.pool.forEach((l,i)=>l.visible=i<n); }
  update(dt,ctx){
    const {player,world,mass,state,playing}=ctx; this.t+=dt;
    const y=player.position.y, h=clamp(y/TOP,0,1);
    const gap=mass.active?mass.gap(player):99, prox=clamp(1-gap/14,0,1);
    // fog: quente embaixo, fria em cima, avermelhada perto da massa
    this.col.copy(this.warm).lerp(this.cold,h).lerp(this.red,prox*.65);
    this.scene.fog.color.copy(this.col); this.scene.background&&this.scene.background.copy(this.col);
    this.scene.fog.density=.055+h*.02+prox*.03;
    // cansaço escurece a visão
    const tired=player.isClimbing?clamp((35-player.stamina)/35,0,1):0;
    this.renderer.toneMappingExposure=1-tired*.3-(this.blackout>0?.15:0);
    // batimento quando a estamina está crítica
    if(playing&&player.isClimbing&&player.stamina<22){ this.heartT-=dt; if(this.heartT<=0){ this.audio.heartbeat(); this.heartT=.5+player.stamina/40; } }
    this.audio.setTension(playing?prox:0);
    // lâmpadas
    if(this.blackout>0) this.blackout-=dt;
    for(const l of world.lamps){
      let k;
      if(l.dead) k=0;
      else if(l.broken) k=(Math.sin(this.t*19+l.phase)+Math.sin(this.t*7.3+l.phase*2)>.6)?.08:1;
      else k=.92+Math.sin(this.t*50+l.phase)*.03;
      if(this.blackout>0&&Math.abs(l.pos.y-this.blackoutY)<16) k=this.blackout<.35?k*Math.random():0;
      const T=world.tint||[1,1,1];                                    // tom das lâmpadas: muda conforme a ROTA escolhida (world.setRoute)
      l.k=k; l.mat.color.setRGB((.25+.75*k)*T[0],(.24+.71*k)*T[1],(.2+.58*k)*T[2]);
    }
    const near=world.lamps.slice().sort((a,b)=>Math.abs(a.pos.y-y)-Math.abs(b.pos.y-y));
    const tc=world.tint?world.tintColor:0xffffff; this.pool.forEach((l,i)=>{ const lp=near[i]; if(!lp){ l.intensity=0; return; } l.position.copy(lp.pos); l.intensity=1.3*lp.k; if(world.tint) l.color.setHex(tc); });
    // silhueta
    if(this.shape){ const s=this.shape; s.t+=dt; this.shapeMesh.position.y+=dt*7;
      if(s.t>=s.dur){ this.shape=null; this.shapeMesh.visible=false; } }
    // eventos
    if(!playing) return;
    if(state.checkpointJustCollected&&!this.pending&&Math.random()<.5) this.pending=this.t+4+Math.random()*4;
    const due=this.t>=this.next||(this.pending&&this.t>=this.pending);
    if(due&&gap>8&&!state.finished){ this._trigger(this._pick(),player); this.next=this.t+55+Math.random()*35; this.pending=null; }
  }
  _pick(){
    const opts=[['groan',.45],['blackout',.3],['shape',this.shapes<2?.25:0]].filter(o=>o[0]!==this.last&&o[1]>0);
    let r=Math.random()*opts.reduce((a,o)=>a+o[1],0);
    for(const [k,w] of opts){ if((r-=w)<=0) return k; }
    return opts[0][0];
  }
  _trigger(type,player){
    this.last=type;
    if(type==='groan'){ this.audio.groan(); player.addShake(.5); }
    else if(type==='blackout'){ this.blackout=2.6; this.blackoutY=player.position.y; this.audio.buzz(); }
    else if(type==='shape'){
      this.shapes++; const a=Math.random()*TAU;    // vulto colado à parede curva, em qualquer ponto da circunferência
      this.shapeMesh.position.set(Math.cos(a)*(SHAFT_R-.7),player.position.y+EYE+16+Math.random()*5,Math.sin(a)*(SHAFT_R-.7));
      this.shapeMesh.visible=true; this.shape={t:0,dur:2.2}; this.audio.whoosh();
    }
  }
}
