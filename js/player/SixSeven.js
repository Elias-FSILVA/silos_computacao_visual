'use strict';
// Segredo desktop. Relógio da simulação; saída exclusivamente visual, sem alterar run/atributos/física.
class SixSeven{
  constructor(game){
    this.g=game; game.player.sixSeven=this;
    this.number=game.ui.$('sixSevenNumber'); this._numberAnchor=new V3();
    this._poses=[0,1].map(()=>({pos:new V3(),wrist:new V3()}));
    this.clear();
  }
  clear(){
    this.active=false; this.time=0; this.first=null; this.pending=false;
    this.number.hidden=true; this.number.textContent=''; this.number.style.opacity=0;
    // Overlays congelam o viewmodel: restaurar já, não só no próximo quadro de gameplay.
    for(const hm of this.g.player.handModels){
      const n=hm._sixSevenNormal; if(!hm._sixSeven||!n) continue;
      hm.root.position.copy(n.pos); hm.root.quaternion.copy(n.q); hm.wrist.rotation.copy(n.wrist);
      hm.baseTgt.copy(n.base); hm.snapBase(); hm.tgt.set(n.tgt);
      hm.snapPose();   // dedos também voltam na pausa, com o tremor de HP preservado
      hm._sixSeven=false;
    }
  }
  static typing(e){ const t=e.target; return !!(t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable||t.closest&&t.closest('[contenteditable]:not([contenteditable="false"])'))); }
  check(consoleRequest=false){
    const g=this.g,p=g.player,vr=g.vr;
    const fail=reason=>({ok:false,reason});
    if(!(g.state==='play'||consoleRequest&&g.state==='console'&&g._devConsoleWasPlaying)) return fail('Só durante a partida.');
    if(p.dead) return fail('Agora não.');
    if(p.xr||vr&&(vr.active||vr.entering||vr.busy)) return fail('Só no desktop.');
    if(g.debugNavigation&&g.debugNavigation.noclipActive||p.debugFrozen) return fail('Desligue o noclip primeiro.');
    if(p.isClimbing||p.mantle) return fail('Deixe as duas mãos livres.');
    if(p.hands.some(h=>h.inContact||h.isGrabbing||h.occupied||h.aiming||h.anchor)||p.press.some(Boolean)||p.point.some(Boolean)) return fail('Deixe as duas mãos livres.');
    const it=g.items;
    if(it&&[it.left,it].some(h=>h&&(h.equipped||h.phase!=='empty'||h.pending||h.next>=0||h.useHeld))) return fail('Guarde os itens primeiro.');
    return {ok:true};
  }
  start(){
    this.first=null; this.pending=false;
    if(this.active) return {ok:false,reason:'Agora não.'};
    const r=this.check(); if(!r.ok) return r;
    this.active=true; this.time=0; return {ok:true};
  }
  key(e){
    const g=this.g;
    if(g.state==='play'&&!SixSeven.typing(e)&&(QUICK_KEYS.some(k=>k.code===e.code)||['KeyF','KeyQ','KeyX','Tab','Escape','KeyP'].includes(e.code))) this.clear();
    if(g.state!=='play'||!g.ui.$('devConsole').hidden||SixSeven.typing(e)||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||g.vr&&(g.vr.active||g.vr.entering||g.vr.busy)){
      this.first=null; return;
    }
    if(e.repeat) return;
    const now=performance.now();
    if(e.code==='Digit6'){ this.first=now; return; }
    if(e.code==='Digit7'){
      const first=this.first; this.first=null;
      if(first!==null&&now-first>=0&&now-first<=1000) this.start();
      return;
    }
    this.first=null;
  }
  queue(){
    this.first=null; this.pending=false;
    if(this.g.state!=='console'||!this.g._devConsoleWasPlaying) return 'Só durante a partida, com o console aberto.';
    const r=this.check(true); if(!r.ok) return r.reason;
    this.pending=true; return 'Ao fechar o console.';
  }
  closeConsole(){
    const queued=this.pending; this.pending=false; this.first=null;
    if(!queued) return;
    const r=this.start(); if(!r.ok) this.g.ui.msg(r.reason,1.8);
  }
  update(dt){
    if(this.g.state!=='play'){
      const keep=this.g.state==='console'&&this.pending; this.clear(); this.pending=keep; return;
    }
    if(!this.active) return;
    if(!this.check().ok){ this.clear(); return; }
    this.time+=dt;
    if(this.time>=2.6-1e-9){ this.clear(); return; }   // 156 × 1/60 sofre arredondamento de ponto flutuante
    this.updateNumber();
  }
  // Um único span: seis sopros alternados, sem partículas, timers ou recursos de GPU.
  static numberSample(t,reduced=REDUCED_MOTION){
    if(t<.4||t>=2.2) return null;
    const pulse=Math.floor((t-.4+1e-9)/.3), age=Math.max(0,t-.4-pulse*.3);
    if(pulse>=6||age>=.27) return null;
    const hand=pulse%2, opacity=.3*smooth(clamp(age/.06,0,1))*(1-smooth(clamp((age-.16)/.11,0,1)));
    return {text:hand?'7':'6',hand,opacity,rise:reduced?0:12*smooth(clamp(age/.27,0,1))};
  }
  updateNumber(){
    const n=SixSeven.numberSample(this.time),el=this.number;
    if(!n){ el.hidden=true; el.textContent=''; el.style.opacity=0; return; }
    // Centro da palma renderizada, não a antiga posição fixa do gesto. O viewmodel
    // reprojeta no fim do quadro para acompanhar mão/câmera sem um quadro de atraso.
    const p=this.g.player,hm=p.handModels[n.hand],v=this._numberAnchor.set(0,-.01,-.035);
    hm.base.updateWorldMatrix(true,false); hm.base.localToWorld(v);
    p.camera.worldToLocal(v); v.applyMatrix4(p.camera.projectionMatrix);
    el.textContent=n.text; el.hidden=false; el.style.opacity=n.opacity;
    el.style.transform=`translate3d(${(v.x+1)*50}vw,calc(${(1-v.y)*50}vh - ${20+n.rise}px),0) translate(-50%,-100%)`;
  }
  beforeViewmodel(){
    const vr=this.g.vr;
    if(this.g.player.xr||vr&&(vr.active||vr.entering||vr.busy)) this.clear();
  }
  static sample(t,i,out={pos:new V3(),wrist:new V3()}){
    // .4 s para mostrar as palmas, 1.8 s / três ciclos opostos, .4 s de retorno.
    const weight=t<.4?smooth(clamp(t/.4,0,1)):t>2.2?1-smooth(clamp((t-2.2)/.4,0,1)):1;
    const wave=Math.sin(clamp((t-.4)/1.8,0,1)*Math.PI*6)*(i===0?1:-1);
    // Supinação: na direita, −π em Z leva o polegar por CIMA do punho; Handedness espelha a esquerda.
    // +π chega à mesma palma final, mas passa pelo lado anatômico errado durante entrada/retorno.
    // Sem giro em X: dedos (-Z) continuam para a frente. Mãos mais baixas/próximas, oscilação menor.
    const canonical={pos:new V3(.17,-.12+.055*wave,-.43),wrist:new V3(0,-.16,-.08),base:[0,0,-Math.PI],roll:0,visible:true,grip:'relaxed',grip2:'open',blend:.25,squeeze:0,tremor:0};
    Handedness.toSide(canonical,Handedness.sideOf(i),out); out.weight=weight; return out;
  }
  apply(hm,i){
    if(!this.active){ if(hm._sixSeven){ hm.snapBase(); hm._sixSeven=false; } return; }
    const n=hm._sixSevenNormal||(hm._sixSevenNormal={pos:new V3(),q:new THREE.Quaternion(),wrist:new THREE.Euler(),base:new V3(),tgt:new Float32Array(21)});
    n.pos.copy(hm.root.position);n.q.copy(hm.root.quaternion);n.wrist.copy(hm.wrist.rotation);n.base.copy(hm.baseTgt);n.tgt.set(hm.tgt);
    const p=this.g.player,pose=SixSeven.sample(this.time,i,this._poses[i]),w=pose.weight;
    // A pose normal foi calculada neste quadro. vmLocal permanece normal: cancelar não herda deslocamento.
    const target=p.camera.localToWorld(pose.pos);
    hm.root.position.lerp(target,w);
    hm.wrist.rotation.set(pose.wrist.x*w,pose.wrist.y*w,pose.wrist.z*w);
    hm.setBase([pose.base[0]*w,pose.base[1]*w,pose.base[2]*w]);
    hm.snapBase();   // a envoltória já suaviza o giro, sem atraso de mola na volta
    hm.setPose('relaxed','open',pose.blend*w); hm.squeeze=0;hm.slack=0;
    hm._sixSeven=true;
  }
}
