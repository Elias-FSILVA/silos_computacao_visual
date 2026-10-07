'use strict';
// ============================================================================
// js/systems/MassSystem.js — a ameaça que sobe pelo poço
// ============================================================================
class MassSystem{
  constructor(scene){
    this.geo=new THREE.PlaneGeometry(2*W,2*W,36,36); this.geo.rotateX(-Math.PI/2);
    this.base=this.geo.attributes.position.array.slice();
    const mat=new THREE.MeshStandardMaterial({color:0x3a0b0c,emissive:0x1c0303,roughness:.3,metalness:.1});
    this.mesh=new THREE.Mesh(this.geo,mat); scene.add(this.mesh);
    this.column=new THREE.Mesh(new THREE.BoxGeometry(2*W,40,2*W),mat); scene.add(this.column);
    this.light=new THREE.PointLight(0x9a1a10,1.4,10,2); scene.add(this.light);
    this.reset();
  }
  reset(){ this.y=-14; this.active=false; this.riseTime=0; this.speed=0; this.caught=false; this.hold=null; }
  // contenção: a massa sobe até 'cap' (rápido, se surge) e fica presa ali; breach=true volta a contar como ameaça na sala
  setHold(cap,surge){ this.hold={cap,surge:surge||0,breach:false}; this.active=true; }
  releaseHold(y){ this.hold=null; if(y!=null) this.y=Math.min(this.y,y); }
  get contained(){ return !!(this.hold&&!this.hold.breach); }
  update(dt,elapsed,player){
    let ev=null;
    if(!this.active&&(player.position.y>1.6||elapsed>18)){ this.active=true; ev='activated'; }
    if(this.active&&this.hold){
      const h=this.hold; if(this.y<h.cap) this.y=Math.min(h.cap,this.y+Math.max(.3,h.surge)*dt); else this.y=h.cap;
      this.speed=0; this.riseTime+=dt;
      if(this.reaches(player)) this.caught=true;
    } else if(this.active){
      const gap=player.position.y-this.y;
      let sp=.22+this.riseTime*.0004; if(gap>24) sp+=(gap-24)*.06;
      this.speed=sp; this.y+=sp*dt; this.riseTime+=dt;
      if(this.reaches(player)) this.caught=true;
    }
    return ev;
  }
  reaches(player){ const p=player.position;
    if(this.inShaft(player)) return p.y+.1<this.y+.15;
    if((this.safeZones||[]).some(z=>p.x>=z.minX&&p.x<=z.maxX&&p.z>=z.minZ&&p.z<=z.maxZ)) return false;
    return p.y+1.6<this.y; }
  // a massa ocupa só o poço; salas laterais (puzzle, nichos) ficam fora dela
  inShaft(player){ const p=player.position; return Math.abs(p.x)<W+.1&&Math.abs(p.z)<W+.1; }
  gap(player){ const g=player.position.y-this.y; return this.inShaft(player)?g:Math.max(g,10); }
  eta(player){ return this.active&&!this.hold&&this.speed>0?Math.max(0,this.gap(player)/this.speed):null; }
  visual(t){
    this.mesh.position.y=this.y; this.column.position.y=this.y-20.02; this.light.position.set(0,this.y+1.5,0);
    const pa=this.geo.attributes.position.array, b=this.base;
    for(let i=0;i<pa.length;i+=3){ const x=b[i], z=b[i+2];
      pa[i+1]=Math.sin(x*1.3+t*.9)*.25+Math.sin(z*1.7-t*1.1)*.2+Math.sin((x+z)*3+t*2)*.06; }
    this.geo.attributes.position.needsUpdate=true; this.geo.computeVertexNormals();
  }
}
