'use strict';
// ============================================================================
// js/ui/VRPanel.js — texto flutuante em VR (o HUD em HTML não aparece dentro do headset)
// Espelha a mensagem atual (#msg) e a nota aberta (#note) do UIManager num painel preso à câmera;
// na cinemática, mostra o texto dela.
// Só redesenha o canvas quando o texto muda.
// ============================================================================
class VRPanel{
  constructor(){
    const c=this.canvas=document.createElement('canvas'); c.width=1024; c.height=384;
    this.tex=new THREE.CanvasTexture(c);
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(.96,.36),
      new THREE.MeshBasicMaterial({map:this.tex,transparent:true,depthTest:false,depthWrite:false,fog:false}));
    this.mesh.position.set(0,-.2,-1.1); this.mesh.renderOrder=999; this.mesh.visible=false;
    this.text=null;
  }
  attach(camera){ camera.add(this.mesh); }
  detach(){ if(this.mesh.parent) this.mesh.parent.remove(this.mesh); this.text=null; }
  // cine: {text, op} da cinemática, que tem prioridade sobre as mensagens
  update(ui,cine){
    let t='', note=false;
    this.mesh.material.opacity=cine&&cine.text?cine.op:1;
    if(cine&&cine.text) t=cine.text;
    else if(ui.noteOpen){ note=true; t=(ui.$('note').firstChild||{}).textContent||''; t+='\n\n(gatilho direito para fechar)'; }
    else if(ui.msgT>0) t=ui.$('msg').textContent||'';
    if(t===this.text) return;
    this.text=t; this.mesh.visible=!!t; if(!t) return;
    this._draw(t,note);
  }
  _draw(text,note){
    const c=this.canvas, x=c.getContext('2d'), W=c.width, H=c.height, pad=36;
    x.clearRect(0,0,W,H);
    x.fillStyle=note?'rgba(20,17,12,.88)':'rgba(5,4,3,.6)'; x.fillRect(0,0,W,H);
    x.fillStyle='#e8dfc8'; x.textAlign='center'; x.textBaseline='top';
    const size=note?30:40; x.font=`${size}px "Barlow Condensed", sans-serif`;
    const lines=[];
    text.split('\n').forEach(par=>{
      let line='';
      par.split(' ').forEach(w=>{ const tr=line?line+' '+w:w; if(x.measureText(tr).width>W-pad*2&&line){ lines.push(line); line=w; } else line=tr; });
      lines.push(line);
    });
    const lh=size*1.25, max=Math.floor((H-pad*2)/lh), shown=lines.slice(0,max);
    let y=(H-shown.length*lh)/2;
    shown.forEach(l=>{ x.fillText(l,W/2,y); y+=lh; });
    this.tex.needsUpdate=true;
  }
}
