'use strict';
// ============================================================================
// js/ui/VRMenu.js — menu flutuante em VR (pausa, resultado): as telas HTML não aparecem no headset
// open({title, tone, lines:[[rótulo, valor]…], text, buttons:[{label, action, disabled}]}) desenha num canvas;
// o raio do controle passa por hit() para achar o botão sob a mira, e click() aciona o botão em foco.
// O painel abre no espaço do rig, à frente da cabeça (só o giro horizontal), e fica parado enquanto aberto.
// ============================================================================
class VRMenu{
  constructor(){
    const c=this.canvas=document.createElement('canvas'); c.width=1024; c.height=1024;
    this.tex=new THREE.CanvasTexture(c);
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(.8,.8),
      new THREE.MeshBasicMaterial({map:this.tex,transparent:true,depthTest:false,depthWrite:false,fog:false}));
    this.mesh.renderOrder=997; this.mesh.visible=false;
    this.spec=null; this.hover=-1; this.rects=[];
    this.caster=new THREE.Raycaster();
  }
  get open(){ return this.mesh.visible; }
  // parent: rig; head: câmera (filha do rig)
  show(spec,parent,head){
    if(this.mesh.parent!==parent) parent.add(this.mesh);
    const fw=new V3(0,0,-1).applyQuaternion(head.quaternion); fw.y=0;
    if(fw.lengthSq()<1e-4) fw.set(0,0,-1); fw.normalize();
    this.mesh.position.copy(head.position).addScaledVector(fw,1.1); this.mesh.position.y=head.position.y-.08;
    this.mesh.rotation.set(0,Math.atan2(-fw.x,-fw.z),0);
    this.spec=spec; this.hover=-1; this.mesh.visible=true; this._draw();
  }
  close(){ this.mesh.visible=false; this.spec=null; this.hover=-1; }
  // devolve a distância até o painel (para o comprimento do raio) ou null
  hit(origin,dir){
    if(!this.open) return null;
    this.caster.set(origin,dir); this.caster.far=6;
    const h=this.caster.intersectObject(this.mesh,false)[0];
    let idx=-1;
    if(h&&h.uv){ const x=h.uv.x*1024, y=(1-h.uv.y)*1024;
      idx=this.rects.findIndex(r=>!r.disabled&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); }
    if(idx!==this.hover){ this.hover=idx; this._draw(); }
    return h?h.distance:null;
  }
  click(){ const b=this.spec&&this.spec.buttons[this.hover]; if(b&&!b.disabled&&b.action){ b.action(); return true; } return false; }
  _draw(){
    const s=this.spec; if(!s) return;
    const x=this.canvas.getContext('2d'), W=1024, H=1024, pad=64;
    x.clearRect(0,0,W,H);
    x.fillStyle='rgba(12,10,8,.92)'; x.fillRect(0,0,W,H);
    x.strokeStyle='rgba(216,207,184,.25)'; x.lineWidth=3; x.strokeRect(10,10,W-20,H-20);
    let y=pad;
    x.textAlign='center'; x.textBaseline='top';
    x.fillStyle=s.tone==='danger'?'#e0633a':s.tone==='win'?'#9fd6a4':'#e8dfc8';
    x.font='800 84px "Big Shoulders Stencil Display", sans-serif'; x.fillText(s.title||'',W/2,y); y+=110;
    x.font='400 38px "Barlow Condensed", sans-serif'; x.fillStyle='#bfb6a2';
    if(s.text){ x.fillText(s.text,W/2,y); y+=60; }
    (s.lines||[]).forEach(([k,v])=>{
      x.textAlign='left'; x.fillStyle='#9d947f'; x.fillText(k,pad+40,y);
      x.textAlign='right'; x.fillStyle='#e8dfc8'; x.fillText(v,W-pad-40,y); y+=50;
    });
    // botões empilhados no rodapé
    const bs=s.buttons||[], bh=96, gap=22;
    let by=Math.max(y+30,H-pad-bs.length*(bh+gap)+gap);
    this.rects=bs.map((b,i)=>{
      const r={x:pad,y:by,w:W-pad*2,h:bh,disabled:!!b.disabled}; by+=bh+gap;
      const hov=i===this.hover;
      x.fillStyle=b.disabled?'rgba(60,55,48,.6)':hov?'#d8a53a':'rgba(216,207,184,.12)'; x.fillRect(r.x,r.y,r.w,r.h);
      x.strokeStyle=hov?'#f0c870':'rgba(216,207,184,.4)'; x.lineWidth=3; x.strokeRect(r.x,r.y,r.w,r.h);
      x.textAlign='center'; x.textBaseline='middle'; x.font='600 46px "Barlow Condensed", sans-serif';
      x.fillStyle=b.disabled?'#7d7566':hov?'#140f08':'#e8dfc8'; x.fillText(b.label,W/2,r.y+r.h/2);
      x.textBaseline='top';
      return r;
    });
    this.tex.needsUpdate=true;
  }
}
