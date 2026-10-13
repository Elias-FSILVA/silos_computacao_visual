'use strict';
// ============================================================================
// js/ui/PerfOverlay.js — modo de diagnóstico de desempenho
// Liga/desliga: F3 · ?diag no endereço · comando "diag" no console do desenvolvedor.
// Mostra, por janela de 1 s: FPS, tempo entre quadros (média, p95, pior), tempo de CPU do quadro (lógica + envio ao
// renderer), draw calls e triângulos do último quadro (em VR somam os dois olhos), geometrias/texturas na GPU,
// programas de shader, heap de JS (Chrome), setores por estado, objetos visíveis, luzes pontuais ativas, região e perfil.
// Em VR o mesmo texto aparece num painel pequeno preso à vista e vai para o console a cada 5 s (depuração remota do Quest).
// Referência: 72 Hz ≈ 13,9 ms por quadro · 90 Hz ≈ 11,1 ms.
// ============================================================================
class PerfOverlay{
  constructor(game){
    this.g=game; this.on=false; this.win=[]; this.cpu=[]; this.t0=performance.now(); this.prev=0; this.text=''; this.logT=0; this.lights=0;
    const d=this.el=document.createElement('div'); d.hidden=true;
    d.style.cssText='position:fixed;right:10px;top:10px;z-index:30;padding:8px 11px;background:rgba(0,0,0,.74);color:#cfe8c8;font:12px/1.45 monospace;white-space:pre;pointer-events:none;border-left:3px solid #7fe08a';
    document.body.appendChild(d);
    this.vrMesh=null;
  }
  toggle(on){ this.on=on==null?!this.on:!!on; this.el.hidden=!this.on; this._vrAttach(); return this.on; }
  _vrAttach(){
    const want=this.on&&this.g.vr&&this.g.vr.active;
    if(want&&!this.vrMesh){
      const c=this.vrCanvas=document.createElement('canvas'); c.width=512; c.height=300; this.vrTex=new THREE.CanvasTexture(c);
      this.vrMesh=new THREE.Mesh(new THREE.PlaneGeometry(.24,.14),new THREE.MeshBasicMaterial({map:this.vrTex,transparent:true,depthTest:false,depthWrite:false,fog:false}));
      this.vrMesh.renderOrder=997; this.vrMesh.position.set(-.16,.1,-.55);
    }
    if(this.vrMesh){ if(want&&this.vrMesh.parent!==this.g.camera) this.g.camera.add(this.vrMesh); if(!want&&this.vrMesh.parent) this.vrMesh.parent.remove(this.vrMesh); }
  }
  // a cada quadro, DEPOIS do render: cpuMs = tempo do _loop inteiro
  frame(cpuMs){
    if(!this.on) return;
    const now=performance.now(); if(this.prev) this.win.push(now-this.prev); this.prev=now; this.cpu.push(cpuMs);
    if(now-this.t0<1000) return;
    const r=this.g.renderer, info=r.info, s=this.g.sectors, si=s?s.info():null, P=this.g.renderProfile||{};
    const ft=this.win.slice().sort((a,b)=>a-b), avg=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
    const fps=this.win.length*1000/(now-this.t0), p95=ft[Math.floor(ft.length*.95)]||0, worst=ft[ft.length-1]||0;
    let L=0; this.g.scene.traverseVisible(o=>{ if(o.isPointLight) L++; });
    const xr=r.xr&&r.xr.isPresenting, heap=performance.memory?(performance.memory.usedJSHeapSize/1048576).toFixed(0)+' MB':'—';
    this.text=[
      `FPS ${fps.toFixed(0)}   quadro ${avg(this.win).toFixed(1)} ms (p95 ${p95.toFixed(1)} · pior ${worst.toFixed(1)})`,
      `CPU do quadro ${avg(this.cpu).toFixed(2)} ms   alvo 72 Hz 13,9 ms · 90 Hz 11,1 ms`,
      `draw calls ${info.render.calls}   triângulos ${info.render.triangles}${xr?'   (2 olhos)':''}`,
      `GPU: geometrias ${info.memory.geometries} · texturas ${info.memory.textures} · programas ${(info.programs||[]).length}   heap JS ${heap}`,
      si?`setores ${si.active} ativos · ${si.ready} prontos · ${si.loading} carregando · ${si.unloaded} descarregados (de ${si.total})${si.full?' · MODO COMPLETO':''}`:'setores —',
      si?`objetos visíveis no mapa ${si.visibleRootObjects} · LOD alto ${si.lodHi} · fila de carga ${si.queue}`:'',
      `luzes pontuais ativas ${L} (locais ${si?si.lightsUsed:0} de ${s?s.pool.length:0} · virtuais ${si?si.lightsVirtual:0})`,
      `perfil ${P.platform||'?'}/${P.quality||'?'} · neblina ${(P.fogFull||0).toFixed(0)} m · janela +${(P.above||0).toFixed(0)}/−${(P.below||0).toFixed(0)} m · far ${(P.far||0).toFixed(0)} m${si&&si.region?' · '+si.region:''}`,
      `altura ${this.g.camera.getWorldPosition(new THREE.Vector3()).y.toFixed(1)} m · estado ${this.g.state}`
    ].filter(Boolean).join('\n');
    this.el.textContent=this.text;
    this._vrAttach();
    if(this.vrMesh&&this.vrMesh.parent){ const g=this.vrCanvas.getContext('2d'); g.fillStyle='rgba(0,0,0,.78)'; g.fillRect(0,0,512,300); g.fillStyle='#cfe8c8'; g.font='15px monospace';
      this.text.split('\n').forEach((l,i)=>g.fillText(l.slice(0,62),8,24+i*30)); this.vrTex.needsUpdate=true; }
    if(xr&&(this.logT+=now-this.t0)>=5000){ this.logT=0; console.log('[diag]\n'+this.text); }
    this.win=[]; this.cpu=[]; this.t0=now;
  }
}
