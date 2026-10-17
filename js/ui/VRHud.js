'use strict';
// ============================================================================
// js/ui/VRHud.js — HUD de VR: "relógio" no pulso esquerdo, vinheta e fade presos à cabeça
// Pulso: altura, tempo, ameaça/contenção (os mesmos textos que o UIManager já calculou no HUD HTML),
//        estamina das duas mãos, item na mão e a dica de botão do momento (traduzida para o controle).
// Vinheta: conforto ao andar com o analógico (opcional), fadiga dos braços e massa perto.
// Fade: esfera preta em volta da cabeça (cinemática).
// ============================================================================
const VR_PROMPT_KEYS={'Espaço':'A','Mouse ↓':'Braço ↓','F':'Gatilho','X':'X'};
class VRHud{
  constructor(){
    // pulso
    const c=this.canvas=document.createElement('canvas'); c.width=512; c.height=320;
    this.tex=new THREE.CanvasTexture(c);
    this.wrist=new THREE.Mesh(new THREE.PlaneGeometry(.144,.09),
      new THREE.MeshBasicMaterial({map:this.tex,transparent:true,fog:false}));
    this.wrist.visible=false; this.key=''; this.drawT=0;
    // inventário (atalho Y): os mesmos slots do HUD do desktop, numa faixa acima do relógio
    const ic=this.invCanvas=document.createElement('canvas'); ic.width=512; ic.height=160;
    this.invTex=new THREE.CanvasTexture(ic);
    this.inv=new THREE.Mesh(new THREE.PlaneGeometry(.2,.0625),new THREE.MeshBasicMaterial({map:this.invTex,transparent:true,fog:false}));
    this.inv.position.set(0,.085,.01); this.inv.visible=false; this.wrist.add(this.inv);
    this.invKey=''; this.icons={};
    // vinheta: gradiente radial num plano logo à frente dos olhos
    const v=document.createElement('canvas'); v.width=v.height=256;
    const g=v.getContext('2d'), gr=g.createRadialGradient(128,128,40,128,128,128);
    gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(.55,'rgba(0,0,0,.35)'); gr.addColorStop(1,'rgba(0,0,0,1)');
    g.fillStyle=gr; g.fillRect(0,0,256,256);
    this.vig=new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.3),
      new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(v),transparent:true,opacity:0,depthTest:false,depthWrite:false,fog:false}));
    this.vig.position.z=-.3; this.vig.renderOrder=996; this.vig.visible=false;
    this.fade=new THREE.Mesh(new THREE.SphereGeometry(.4,16,12),
      new THREE.MeshBasicMaterial({color:0x000000,side:THREE.BackSide,transparent:true,opacity:0,depthTest:false,depthWrite:false,fog:false}));
    this.fade.renderOrder=1000; this.fade.visible=false;
    this.comfort=0;
  }
  attach(scene,camera){ scene.add(this.wrist); camera.add(this.vig); camera.add(this.fade); }
  detach(){ [this.wrist,this.vig,this.fade].forEach(m=>{ if(m.parent) m.parent.remove(m); }); this.key=''; }
  setFade(a){ this.fade.material.opacity=a; this.fade.visible=a>.002; }
  // vinheta: motion 0..1 (analógico/giro), fatigue 0..1, mass 0..1
  setVignette(dt,motion,fatigue,mass,comfortOn){
    const tgt=comfortOn?motion:0;
    this.comfort+=(tgt-this.comfort)*(1-Math.exp(-(tgt>this.comfort?10:4)*dt));
    const a=Math.max(this.comfort*.75,fatigue*.65,mass*.8);
    this.vig.material.opacity=a; this.vig.visible=a>.01;
  }
  // pose do pulso esquerdo (mundo); hide = sem controle esquerdo
  placeWrist(pos,quat){
    if(!pos){ this.wrist.visible=false; return; }
    this.wrist.visible=true;
    this.wrist.position.copy(pos); this.wrist.quaternion.copy(quat);
    this.wrist.translateY(.035); this.wrist.translateZ(.11); this.wrist.rotateX(-1.05);   // dorso do antebraço, inclinado para o rosto
  }
  // ---------- inventário ----------
  setInventory(open){ this.inv.visible=open; this.invKey=''; }
  // slot sob a ponta do dedo (mundo), ou -1: dentro da faixa e a até 4 cm dela
  slotAt(tip){
    if(!this.inv.visible||!this.wrist.visible) return -1;
    this.inv.updateWorldMatrix(true,false); const l=this.inv.worldToLocal(tip.clone());
    if(Math.abs(l.z)>.04||Math.abs(l.y)>.0325||Math.abs(l.x)>=.1) return -1;
    return Math.min((this.invN||4)-1,Math.floor((l.x+.1)/(.2/(this.invN||4))));
  }
  updateInventory(items,hover){
    if(!this.inv.visible) return;
    const inv=items.inv, key=inv.version+'|'+items.left.sel+'|'+items.sel+'|'+hover+'|'+Object.keys(this.icons).length;
    if(key===this.invKey) return; this.invKey=key;
    this.invN=inv.slots.length;   // uma caixa por entrada da mochila
    const x=this.invCanvas.getContext('2d'), W=512, H=160, sw=W/this.invN;
    x.clearRect(0,0,W,H);
    inv.slots.forEach((s,i)=>{
      const bx=i*sw+6, sel=items.isSelected(i), hov=hover===i;
      x.fillStyle=hov?'rgba(216,165,58,.55)':sel?'rgba(216,207,184,.28)':'rgba(8,7,5,.82)'; x.fillRect(bx,6,sw-12,H-12);
      x.strokeStyle=sel||hov?'#f0c870':'rgba(216,207,184,.35)'; x.lineWidth=sel?5:3; x.strokeRect(bx,6,sw-12,H-12);
      x.fillStyle='#7d7566'; x.font='500 24px "Barlow Condensed", sans-serif'; x.textAlign='left'; x.textBaseline='top'; x.fillText(String(i+1),bx+8,10);
      if(!s) return;
      const ic=Math.min(72,sw-36), img=this._icon(s.id); if(img) x.drawImage(img,bx+(sw-12)/2-ic/2,22+(72-ic)/2,ic,ic);
      x.textAlign='center'; x.fillStyle='#e8dfc8'; x.font=`500 ${this.invN>4?21:26}px "Barlow Condensed", sans-serif`;
      x.fillText(ITEM_DEFS[s.id].stack?`${ITEM_DEFS[s.id].name} ×${s.count}`:ITEM_DEFS[s.id].name,bx+(sw-12)/2,104);
    });
    this.invTex.needsUpdate=true;
  }
  // ícone do item (o mesmo SVG do HUD), carregado uma vez; ao carregar, força redesenhar
  _icon(id){
    const c=this.icons[id]; if(c) return c.ready?c.img:null;
    const img=new Image(), e={img,ready:false}; this.icons[id]=e;
    img.onload=()=>{ e.ready=true; this.invKey=''; };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="96" height="96" style="color:#e8dfc8"><g fill="#e8dfc8">${ICONS[id]}</g></svg>`);
    return null;
  }
  update(dt,ui,player,look){
    if(!this.wrist.visible) return;
    this.drawT-=dt; if(this.drawT>0) return; this.drawT=.15;
    const $=ui.$, st=player.hands.map(h=>Math.round(h.stamina));
    let prompt='';
    if(look&&look.prompt){ const [k,t]=look.prompt.split('|'); prompt=`${VR_PROMPT_KEYS[k]||k} · ${t}`; }
    const L=[`${$('altN').textContent} m`,$('timeN').textContent,$('massN').textContent,$('slotName').textContent,prompt];
    const hot=$('massN').classList.contains('hot');
    const key=L.join('|')+st.join(',')+hot;
    if(key===this.key) return; this.key=key;
    const x=this.canvas.getContext('2d'), W=512, H=320;
    x.clearRect(0,0,W,H); x.fillStyle='rgba(8,7,5,.82)'; x.fillRect(0,0,W,H);
    x.strokeStyle='rgba(216,207,184,.3)'; x.lineWidth=3; x.strokeRect(4,4,W-8,H-8);
    x.textBaseline='top'; x.textAlign='left'; x.fillStyle='#e8dfc8';
    x.font='800 64px "Big Shoulders Stencil Display", sans-serif'; x.fillText(L[0],24,18);
    x.textAlign='right'; x.font='500 40px "Barlow Condensed", sans-serif'; x.fillText(L[1],W-24,30);
    x.textAlign='left'; x.fillStyle=hot?'#ff6a4a':'#bfb6a2'; x.font='500 34px "Barlow Condensed", sans-serif'; x.fillText(L[2],24,100);
    // estamina: esquerda | direita
    st.forEach((s,i)=>{ const bx=24+i*236, by=150, bw=216;
      x.fillStyle='rgba(216,207,184,.15)'; x.fillRect(bx,by,bw,22);
      x.fillStyle=staminaColor(s); x.fillRect(bx,by,bw*clamp(s/100,0,1),22);
      x.fillStyle='#7d7566'; x.font='400 24px "Barlow Condensed", sans-serif'; x.fillText(i?'mão dir.':'mão esq.',bx,by+26); });
    x.fillStyle='#e8dfc8'; x.font='500 32px "Barlow Condensed", sans-serif';
    if(L[3]) x.fillText(L[3],24,214);
    if(L[4]){ x.fillStyle='#f0c870'; x.fillText(L[4],24,260); }
    this.tex.needsUpdate=true;
  }
}
