'use strict';
// ============================================================================
// js/systems/SpectatorMode.js — câmera livre para inspecionar o mapa por fora (sem jogador, sem massa, sem pontuação)
//   Menu → "Modo espectador".   Controles dentro do modo:
//   WASD mover · Espaço / C subir / descer · Shift acelera · roda do mouse muda a velocidade
//   1–9 vistas prontas · X paredes fantasma · L luz total · R rota do labirinto · H ajuda · Esc sai
// ============================================================================
const SPEC_VIEWS=[
  {k:'Digit1',n:'Início e sala secreta (0 m)',                  from:[-12,8,14],     to:[-12,1.5,0]},
  {k:'Digit2',n:'Destino I · Casa das Bombas (100 m, leste)',    from:[56,122,34],    to:[26,106,0]},
  {k:'Digit3',n:'Galeria do exaustor e escada (150–174 m)',      from:[16,182,20],    to:[-2,158,3]},
  {k:'Digit4',n:'Destino II · Pátio das Máquinas (200 m, anel)', from:[34,236,34],    to:[0,202,0]},
  {k:'Digit5',n:'Insuflador e mirante (246 m)',                  from:[10,262,10],    to:[-2.7,248,-1.3]},
  {k:'Digit6',n:'Destino III · Arquivo e Labirinto (de cima)',   from:[0,342,-20.45], to:[0,300,-20.4]},
  {k:'Digit7',n:'Porta de saída (400 m)',                        from:[14,405,12],    to:[4,400,0]},
  {k:'Digit8',n:'Poço inteiro (de lado)',                        from:[42,200,42],    to:[0,190,0]},
  {k:'Digit9',n:'O silo inteiro (visão externa)',                from:[150,300,150],  to:[0,200,0]}
];
class SpectatorMode{
  constructor(game){
    this.g=game; this.active=false; this.pos=new V3(); this.yaw=0; this.pitch=0; this.speed=10;
    this.ghost=true; this.bright=true; this.route=false; this.labels=true; this.help=true; this.hudT=0; this.saved=null;
    const d=document.createElement('div'); d.hidden=true;
    d.style.cssText='position:fixed;left:14px;bottom:14px;z-index:20;padding:10px 14px;background:rgba(0,0,0,.66);color:#d8d2c4;font:13px/1.55 monospace;border-left:3px solid #c9a227;pointer-events:none;white-space:pre';
    document.body.appendChild(d); this.hud=d;
  }
  // olha de 'from' para 'to'
  goto(v){
    const dx=v.to[0]-v.from[0], dy=v.to[1]-v.from[1], dz=v.to[2]-v.from[2];
    this.pos.set(v.from[0],v.from[1],v.from[2]); this.yaw=Math.atan2(-dx,-dz); this.pitch=clamp(Math.atan2(dy,Math.hypot(dx,dz)),-1.55,1.55);
  }
  enter(){
    if(this.active) return; const g=this.g, c=g.camera, atm=g.atmosphere;
    this.head=c.children.find(o=>o.isLight)||{intensity:0,distance:0};
    this.saved={far:c.far,headI:this.head.intensity,headD:this.head.distance,amb:atm.ambient.intensity};
    this.active=true; g.state='spectate'; g.keys={}; g.ui.hideScreens(); g.ui.setHUD(false); g.ui.clearMsg();
    c.far=1200; c.updateProjectionMatrix();
    g.world.setSpectator(true);            // tela do labirinto mostra a planta o tempo todo, sem contagem
    this._apply(); this.goto(SPEC_VIEWS[7]); this.hud.hidden=false; this._hud(true); g.lock();
  }
  exit(){
    if(!this.active) return; this.active=false; const g=this.g, c=g.camera, s=this.saved;
    c.far=s.far; c.updateProjectionMatrix(); this.head.intensity=s.headI; this.head.distance=s.headD; g.atmosphere.ambient.intensity=s.amb;
    g.world.setCutaway(false); g.world.setRouteGuide(false); g.world.setLabels(false); g.world.setSpectator(false);
    this.hud.hidden=true; g.toMenu();
  }
  _apply(){
    const g=this.g, atm=g.atmosphere, b=this.bright;
    g.scene.fog.density=b?.0012:.055; if(b) g.scene.fog.color.setHex(0x0e1218);
    g.scene.background&&g.scene.background.setHex(b?0x0e1218:0x050403);
    atm.ambient.intensity=b?1.7:.55; this.head.intensity=b?1.6:.45; this.head.distance=b?90:7;
    g.world.setCutaway(this.ghost); g.world.setRouteGuide(this.route); g.world.setLabels(this.labels);
    g.player.viewmodelVisible=false; g.player.updateViewmodel();
  }
  key(e){
    if(e.repeat) return;
    if(['Space','Tab'].includes(e.code)) e.preventDefault();
    const v=SPEC_VIEWS.find(x=>x.k===e.code); if(v){ this.goto(v); return; }
    switch(e.code){
      case 'Escape': this.exit(); break;
      case 'KeyX': this.ghost=!this.ghost; this._apply(); break;
      case 'KeyL': this.bright=!this.bright; this._apply(); break;
      case 'KeyR': this.route=!this.route; this._apply(); break;
      case 'KeyM': this.labels=!this.labels; this._apply(); break;
      case 'KeyH': this.help=!this.help; break;
    }
    this._hud(true);
  }
  look(dx,dy){ const s=.0022; this.yaw-=dx*s; this.pitch=clamp(this.pitch-dy*s,-1.55,1.55); }
  wheel(dy){ this.speed=clamp(this.speed*(dy<0?1.25:.8),1,150); this._hud(true); }
  update(dt){
    const g=this.g, k=g.keys, c=g.camera;
    const f=(k.KeyW?1:0)-(k.KeyS?1:0), r=(k.KeyD?1:0)-(k.KeyA?1:0), u=(k.Space?1:0)-((k.KeyC||k.ControlLeft)?1:0);
    const sp=this.speed*((k.ShiftLeft||k.ShiftRight)?4:1), cp=Math.cos(this.pitch);
    const dx=-Math.sin(this.yaw)*cp, dy=Math.sin(this.pitch), dz=-Math.cos(this.yaw)*cp, rx=Math.cos(this.yaw), rz=-Math.sin(this.yaw);
    this.pos.x+=(dx*f+rx*r)*sp*dt; this.pos.y+=(dy*f+u)*sp*dt; this.pos.z+=(dz*f+rz*r)*sp*dt;
    this.pos.y=clamp(this.pos.y,-30,TOP+60);
    c.position.copy(this.pos); c.rotation.set(this.pitch,this.yaw,0); c.updateMatrixWorld();
    this.hudT-=dt; if(this.hudT<=0) this._hud();
  }
  _section(y){
    const s=[[100,'Subida 1 (0–100 m)'],[110,'Destino I: Casa das Bombas (100–110 m)'],[150,'Subida 2 (110–150 m)'],[174,'Galeria do exaustor (150–174 m)'],
             [200,'Subida 2b (174–200 m)'],[224,'Destino II: Pátio das Máquinas (200–224 m)'],[246,'Subida 3a (224–246 m)'],[252,'Insuflador (246–252 m)'],
             [300,'Subida 3b (252–300 m)'],[310,'Destino III: Arquivo e Labirinto (300–310 m)']];
    for(const [top,n] of s) if(y<top) return n; return 'Subida 4 · Fuga (310–400 m)';
  }
  _hud(force){
    this.hudT=.15; const on=b=>b?'ON ':'OFF', p=this.pos;
    let t=`MODO ESPECTADOR · ${this._section(p.y)}\naltura ${p.y.toFixed(1)} m   (x ${p.x.toFixed(1)}  z ${p.z.toFixed(1)})   velocidade ${this.speed.toFixed(0)} m/s`;
    if(this.help) t+=`\n\nMOVER   W A S D · Espaço sobe · C desce · Shift ×4 · roda do mouse = velocidade\nVISTAS  `+
      SPEC_VIEWS.map((v,i)=>`${i+1} ${v.n}`).join('\n        ')+
      `\nVER     X paredes transparentes [${on(this.ghost)}] · L luz total [${on(this.bright)}]\n        M nomes das partes [${on(this.labels)}] · R rota do labirinto [${on(this.route)}]\nOUTROS  H esconde esta ajuda · Esc volta ao menu`;
    this.hud.textContent=t;
  }
}
