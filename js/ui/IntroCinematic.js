'use strict';
// ============================================================================
// js/ui/IntroCinematic.js — profundidade, escala, isolamento, perigo, objetivo
// ============================================================================
class IntroCinematic{
  constructor(game){ this.g=game; this.active=false; }
  play(done){
    this.t=0; this.done=done; this.active=true; this.cues=new Set();
    this.g.ui.showCine(true); this.g.ui.cine(1,'',0); this.g.player.viewmodelVisible=false; this.g.mass.y=-6;
  }
  update(dt){
    if(!this.active) return;
    this.t+=dt; const t=this.t, g=this.g, cam=g.camera, a=g.audio;
    const cue=(at,fn)=>{ if(t>=at&&!this.cues.has(at)){ this.cues.add(at); fn(); } };
    cue(.4,()=>a.noise(.7,260,.25));
    cue(1.2,()=>a.setHum(1));
    cue(3.0,()=>a.noise(.25,1800,.05));
    cue(5.6,()=>a.noise(1.2,500,.04,'bandpass',4));
    cue(7.4,()=>a.setHum(.15));
    cue(8.6,()=>a.rumbleBurst(2.4));
    cue(11.0,()=>a.setHum(0));
    cue(11.3,()=>a.boom());
    // em VR a cabeça é do jogador: a câmera fica onde o rig a pôs, e só o fade e o texto seguem o roteiro
    if(!g.vr.active){
      const base=g.world.spawnPoint;
      const eyeY=base.y+lerp(1.0,EYE,smooth(clamp((t-1.5)/2.5,0,1)));
      let pitch;
      if(t<4) pitch=.05; else if(t<7.4) pitch=lerp(.05,1.35,smooth((t-4)/3.4));
      else if(t<8.6) pitch=1.35; else if(t<10.2) pitch=lerp(1.35,-1.25,smooth((t-8.6)/1.6)); else pitch=-1.25;
      cam.position.set(base.x,eyeY,base.z);
      if(t>8.6&&t<11){ const s=.035*Math.sin(clamp((t-8.6)/2.4,0,1)*Math.PI); cam.position.x+=(Math.random()-.5)*s; cam.position.y+=(Math.random()-.5)*s; }
      cam.rotation.set(pitch,g.world.spawnYaw+Math.sin(t*.25)*.12,0); cam.updateMatrixWorld();
    }
    g.mass.y=t<8.6?-6:lerp(-6,-2.2,smooth(clamp((t-8.6)/2,0,1)));
    const fade=t<1.5?1:t<3.5?1-(t-1.5)/2:t<11?0:1;
    let text='', op=0;
    if(t>5&&t<7.2){ text='O poço continua além da luz.'; op=Math.min(1,(t-5)/.6)*Math.min(1,(7.2-t)/.6); }
    if(t>11.3&&t<12.6){ text='Suba.'; op=Math.min(1,(t-11.3)/.3)*Math.min(1,(12.6-t)/.3); }
    g.ui.cine(fade,text,op);
    if(g.vr.active) g.vr.cine(fade,text,op);
    if(t>=12.8) this.finish();
  }
  skip(){ if(this.active) this.finish(); }
  finish(){ this.active=false; const g=this.g; g.ui.showCine(false); g.vr.cine(0,'',0); g.mass.reset(); g.audio.setHum(1); g.player.viewmodelVisible=true; if(this.done) this.done(); }
}
