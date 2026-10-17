'use strict';
// ============================================================================
// js/atmosphere/AudioManager.js — buses de música/efeitos e sons sintetizados
// ============================================================================
class AudioManager{
  constructor(settings){ this.s=settings; this.ctx=null; this.burstUntil=0; }
  init(){
    if(this.ctx){ if(this.ctx.state==='suspended') this.ctx.resume(); return; }
    const C=window.AudioContext||window.webkitAudioContext; if(!C) return;
    try{ this.ctx=new C(); }catch(e){ this.ctx=null; return; }
    const c=this.ctx;
    this.master=c.createGain(); this.music=c.createGain(); this.sfx=c.createGain();
    this.music.connect(this.master); this.sfx.connect(this.master); this.master.connect(c.destination);
    const len=c.sampleRate*2;
    this.white=c.createBuffer(1,len,c.sampleRate); const w=this.white.getChannelData(0);
    for(let i=0;i<len;i++) w[i]=Math.random()*2-1;
    const brown=c.createBuffer(1,len,c.sampleRate), b=brown.getChannelData(0); let last=0;
    for(let i=0;i<len;i++){ last=(last+.02*(Math.random()*2-1))/1.02; b[i]=last*3.5; }
    // rumble da massa (efeitos)
    const rs=c.createBufferSource(); rs.buffer=brown; rs.loop=true;
    const rl=c.createBiquadFilter(); rl.type='lowpass'; rl.frequency.value=140;
    this.rumbleG=c.createGain(); this.rumbleG.gain.value=.03;
    rs.connect(rl).connect(this.rumbleG).connect(this.sfx); rs.start();
    // zumbido das lâmpadas (efeitos)
    this.humG=c.createGain(); this.humG.gain.value=0;
    [[58,'sine'],[117,'triangle']].forEach(([f,t])=>{ const o=c.createOscillator(); o.type=t; o.frequency.value=f; o.connect(this.humG); o.start(); });
    this.humG.connect(this.sfx);
    // vento dos ventiladores (efeitos): ruído branco filtrado, volume e brilho seguem a força do fluxo
    const ws=c.createBufferSource(); ws.buffer=this.white; ws.loop=true;
    this.windF=c.createBiquadFilter(); this.windF.type='bandpass'; this.windF.frequency.value=380; this.windF.Q.value=.6;
    this.windG=c.createGain(); this.windG.gain.value=0; ws.connect(this.windF).connect(this.windG).connect(this.sfx); ws.start();
    // drone (música)
    this.droneF=c.createBiquadFilter(); this.droneF.type='lowpass'; this.droneF.frequency.value=260;
    this.droneG=c.createGain(); this.droneG.gain.value=.05;
    [[41.2,'sine'],[41.7,'sine'],[61.7,'triangle'],[92.5,'sine']].forEach(([f,t],i)=>{
      const o=c.createOscillator(); o.type=t; o.frequency.value=f; const g=c.createGain(); g.gain.value=i===3?.25:1; o.connect(g).connect(this.droneF); o.start(); });
    const lfo=c.createOscillator(); lfo.frequency.value=.07; const lg=c.createGain(); lg.gain.value=.02; lfo.connect(lg).connect(this.droneG.gain); lfo.start();
    this.droneF.connect(this.droneG).connect(this.music);
    this.apply(this.s);
  }
  apply(s){ this.s=s; if(!this.ctx) return; const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master,t,.05); this.music.gain.setTargetAtTime(s.music,t,.05); this.sfx.gain.setTargetAtTime(s.sfx,t,.05); }
  get now(){ return this.ctx?this.ctx.currentTime:0; }
  setRumble(x){ if(!this.ctx||this.now<this.burstUntil) return; this.rumbleG.gain.setTargetAtTime(x,this.now,.3); }
  rumbleBurst(d){ if(!this.ctx) return; const t=this.now; this.burstUntil=t+d;
    this.rumbleG.gain.cancelScheduledValues(t); this.rumbleG.gain.setTargetAtTime(.95,t,.25); this.rumbleG.gain.setTargetAtTime(.04,t+d*.7,.4); }
  setHum(x){ if(this.ctx) this.humG.gain.setTargetAtTime(.012*x,this.now,.4); }
  setWind(x){ if(!this.ctx) return; x=clamp(x,0,1.2); this.windG.gain.setTargetAtTime(.22*x,this.now,.25); this.windF.frequency.setTargetAtTime(300+x*900,this.now,.3); }
  setTension(x){ if(!this.ctx) return; this.droneF.frequency.setTargetAtTime(260+x*700,this.now,.5); this.droneG.gain.setTargetAtTime(.05+x*.06,this.now,.5); }
  noise(dur,freq,vol,type='bandpass',q=1,delay=0){
    if(!this.ctx) return; const c=this.ctx, t=c.currentTime+delay, s=c.createBufferSource(); s.buffer=this.white;
    const f=c.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    const g=c.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(f).connect(g).connect(this.sfx); s.start(t,Math.random()); s.stop(t+dur+.05); }
  tone(freq,dur,vol,type='sine',to=null,delay=0,bus=null){
    if(!this.ctx) return; const c=this.ctx, t=c.currentTime+delay, o=c.createOscillator(); o.type=type; o.frequency.setValueAtTime(freq,t);
    if(to) o.frequency.exponentialRampToValueAtTime(to,t+dur);
    const g=c.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+Math.min(.02,dur/4)); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(bus||this.sfx); o.start(t); o.stop(t+dur+.05); }
  grab(){ this.noise(.06,2200,.22); }
  land(v){ this.noise(.14,260,Math.min(.6,.15+Math.abs(v)*.03),'lowpass'); }
  crack(){ this.noise(.35,380,.5); this.noise(.5,900,.12,'bandpass',1,.08); }
  chime(){ this.tone(392,1.4,.07,'triangle',null,0,this.music); this.tone(587,1.6,.05,'triangle',null,.18,this.music); }
  boom(){ this.tone(48,1.6,.5,'sine',28); this.noise(.9,90,.5,'lowpass'); }
  heartbeat(){ this.tone(58,.12,.32); this.tone(52,.16,.26,'sine',null,.16); }
  buzz(){ this.tone(120,.45,.05,'square'); this.noise(.3,4200,.05); }
  whoosh(){ if(!this.ctx) return; const c=this.ctx,t=c.currentTime,s=c.createBufferSource(); s.buffer=this.white;
    const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=2; f.frequency.setValueAtTime(180,t); f.frequency.linearRampToValueAtTime(900,t+1.4);
    const g=c.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.14,t+.6); g.gain.linearRampToValueAtTime(.0001,t+1.6);
    s.connect(f).connect(g).connect(this.sfx); s.start(t,Math.random()); s.stop(t+1.7); }
  // ---- itens e interação ----
  equip(){ this.noise(.12,1200,.08); this.tone(220,.08,.04,'triangle',null,.08); }
  holster(){ this.noise(.1,900,.07); }
  swing(){ this.noise(.18,700,.06,'bandpass',.7,.12); }
  nailSet(){ this.tone(2100,.06,.05,'square'); this.noise(.05,3000,.08); }
  thud(){ this.noise(.12,180,.4,'lowpass'); this.noise(.05,1400,.08); }
  hollow(f){ this.tone(140-f*30,.35,.22,'sine',90); this.noise(.25,420,.25,'bandpass',3); }
  crash(){ this.noise(1.1,300,.7,'lowpass'); this.noise(.6,1500,.25,'bandpass',.8,.05); this.tone(70,.8,.35,'sine',35); }
  tang(n){ const f=1650+n*140; this.tone(f,.32,.09,'square'); this.tone(f*1.51,.22,.04,'triangle'); this.noise(.04,4200,.12); }
  crate(){ this.tone(180,.25,.08,'sawtooth',120); this.noise(.2,800,.1); }
  pickup(){ this.noise(.08,2400,.08); this.tone(440,.1,.04,'triangle'); }
  deny(){ this.tone(160,.12,.06,'square'); }
  // picareta: crava (impacto seco), ricocheteia (tilintar metálico), solta/arranca (raspão)
  axeBite(){ this.noise(.09,900,.35,'lowpass'); this.tone(120,.12,.18,'square',70); this.noise(.04,3200,.08); }
  axeTink(){ this.tone(2600,.18,.05,'triangle'); this.tone(3900,.12,.025,'sine',null,.02); }
  axeScrape(){ this.noise(.28,1800,.12,'bandpass',1.4); this.tone(300,.2,.04,'sawtooth',140); }
  denied(){ this.tone(180,.2,.08,'square'); this.tone(140,.3,.08,'square',null,.2); }
  granted(){ this.tone(660,.15,.07,'square'); this.tone(990,.3,.07,'square',null,.15); }
  pill(){ this.noise(.15,3200,.06); this.noise(.1,1800,.05,'bandpass',1,.15); }
  // ---- portas, contenção ----
  clank(){ this.tone(95,.35,.35,'square',60); this.noise(.2,700,.35); }
  hiss(){ this.noise(1.6,5000,.18,'highpass'); }
  motor(d){ if(!this.ctx) return; const c=this.ctx,t=c.currentTime,o=c.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(55,t); o.frequency.linearRampToValueAtTime(70,t+d);
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=400; const g=c.createGain();
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.12,t+.2); g.gain.setValueAtTime(.12,t+d-.2); g.gain.linearRampToValueAtTime(.0001,t+d);
    o.connect(f).connect(g).connect(this.sfx); o.start(t); o.stop(t+d+.05); }
  thump(v=1){ this.tone(42,.9,.6*v,'sine',26); this.noise(.5,110,.5*v,'lowpass'); this.noise(.3,600,.12*v,'bandpass',2,.05); }
  siren(on){ if(!this.ctx) return; const c=this.ctx;
    if(!this.sirenG){ this.sirenG=c.createGain(); this.sirenG.gain.value=0; const o=c.createOscillator(); o.type='triangle'; o.frequency.value=700;
      const l=c.createOscillator(); l.frequency.value=.8; const lg=c.createGain(); lg.gain.value=180; l.connect(lg).connect(o.frequency); l.start();
      const f=c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=800; f.Q.value=2; o.connect(f).connect(this.sirenG).connect(this.sfx); o.start(); }
    this.sirenG.gain.setTargetAtTime(on?.05:0,c.currentTime,.15); }
  silence(){ if(this.sirenG&&this.ctx) this.sirenG.gain.setTargetAtTime(0,this.ctx.currentTime,.05); }
  groan(){ if(!this.ctx) return; const c=this.ctx,t=c.currentTime,o=c.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(70,t); o.frequency.linearRampToValueAtTime(47,t+3);
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=280; const g=c.createGain();
    g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.16,t+.7); g.gain.linearRampToValueAtTime(.0001,t+3.2);
    let out=g; if(c.createStereoPanner){ const p=c.createStereoPanner(); p.pan.value=Math.random()*1.6-.8; g.connect(p); out=p; }
    o.connect(f).connect(g); out.connect(this.sfx); o.start(t); o.stop(t+3.3); this.noise(2.5,160,.12,'lowpass'); }
}
