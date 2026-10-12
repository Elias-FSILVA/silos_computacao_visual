'use strict';
// ============================================================================
// js/fx/FxSystem.js — partículas simples (poeira, lascas, faíscas, entulho)
// ============================================================================
class FxSystem{
  constructor(scene){
    this.scene=scene; this.pool=[]; this.live=[];
    this.mats={
      dust:new THREE.MeshBasicMaterial({color:0x6d6860,transparent:true,opacity:.7}),
      chips:new THREE.MeshStandardMaterial({color:0x6a665e,roughness:1}),
      sparks:new THREE.MeshBasicMaterial({color:0xffd27a}),
      debris:new THREE.MeshStandardMaterial({color:0x5d5a54,roughness:1}),
      flesh:new THREE.MeshStandardMaterial({color:0x4a0d0d,roughness:.4}),
      air:new THREE.MeshBasicMaterial({color:0xb9b4a8,transparent:true,opacity:.35})   // poeira levada pelo vento
    };
    const geo=new THREE.BoxGeometry(1,1,1); geo.userData.shared=true;
    for(let i=0;i<90;i++){ const m=new THREE.Mesh(geo,this.mats.dust); m.visible=false; scene.add(m); this.pool.push(m); }
  }
  spawn(type,pos,normal,count){
    // [tamanho mín, máx, espalhamento, gravidade, vida]; 'air': normal = velocidade do ar (m/s), sem gravidade
    const cfg={dust:[.03,.07,1.2,3,.9],chips:[.02,.045,2.2,12,.7],sparks:[.008,.014,3.2,9,.28],debris:[.08,.24,2.4,16,2.4],flesh:[.05,.12,1.5,10,1.2],air:[.012,.03,.4,0,1.1]}[type];
    for(let i=0;i<count;i++){
      const m=this.pool.pop(); if(!m) return;
      const s=cfg[0]+Math.random()*(cfg[1]-cfg[0]); m.scale.set(s,s*(type==='sparks'?3:1),s); m.material=this.mats[type];
      m.position.copy(pos); m.visible=true;
      const v=new V3((Math.random()-.5),(Math.random()-.2),(Math.random()-.5)).multiplyScalar(cfg[2]);
      if(normal) v.addScaledVector(normal,type==='air'?.7+Math.random()*.5:cfg[2]*(.6+Math.random()*.6));
      this.live.push({m,v,g:cfg[3],life:cfg[4]*(.6+Math.random()*.6),spin:new V3(Math.random()*8,Math.random()*8,0)});
    }
  }
  update(dt){
    for(let i=this.live.length-1;i>=0;i--){
      const p=this.live[i]; p.life-=dt; p.v.y-=p.g*dt; p.m.position.addScaledVector(p.v,dt);
      p.m.rotation.x+=p.spin.x*dt; p.m.rotation.y+=p.spin.y*dt;
      if(p.life<=0){ p.m.visible=false; this.pool.push(p.m); this.live.splice(i,1); }
    }
  }
  clear(){ this.live.forEach(p=>{ p.m.visible=false; this.pool.push(p.m); }); this.live=[]; }
}
