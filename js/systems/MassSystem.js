'use strict';
// ============================================================================
// js/systems/MassSystem.js — a ameaça que sobe pelo poço
// ============================================================================
// a aceleração da massa foi calibrada para um poço de 120 m; mantém a mesma pressão proporcional em TOP m
const MASS_RAMP=.0004*(120/TOP);
// a massa é um líquido: uma superfície só, larga o bastante para entrar no poço e em todas as salas laterais
// (paredes e pisos a escondem onde não há passagem). Não há coluna: abaixo da superfície tudo já está tomado.
const MASS_SURFACE_R=SILO_R;                 // o labirinto (300 m) chega a ~40,5 m do eixo
class MassSystem{
  constructor(scene){
    this.surfaceR=MASS_SURFACE_R;
    this.geo=new THREE.RingGeometry(.02,MASS_SURFACE_R,96,28); this.geo.rotateX(-Math.PI/2);
    this.base=this.geo.attributes.position.array.slice();
    const mat=new THREE.MeshStandardMaterial({color:0x3a0b0c,emissive:0x1c0303,roughness:.3,metalness:.1,side:THREE.DoubleSide});
    this.mesh=new THREE.Mesh(this.geo,mat); scene.add(this.mesh);
    this.light=new THREE.PointLight(0x9a1a10,1.4,10,2); scene.add(this.light);
    this.reset();
  }
  reset(){ this.y=-14; this.active=false; this.riseTime=0; this.speed=0; this.caught=false; this.hold=null; this.frozen=false; this.scale=1; this.stunT=0; }
  // contenção: a massa sobe até 'cap' (rápido, se surge) e fica presa ali; breach=true volta a contar como ameaça na sala
  setHold(cap,surge){ this.hold={cap,surge:surge||0,breach:false}; this.active=true; }
  releaseHold(y){ this.hold=null; if(y!=null) this.y=Math.min(this.y,y); }
  get contained(){ return !!(this.hold&&!this.hold.breach); }
  // válvula de purga: recua 'recoil' m (fora da contenção) e fica parada 'sec' s; um stun novo não encurta o atual
  stun(sec,recoil=0){ this.stunT=Math.max(this.stunT,sec); if(!this.hold) this.y-=recoil; }
  get stunned(){ return this.stunT>0; }
  // rota SELO: o selo rompe no exaustor e a massa volta a subir, mais devagar
  rupture(scale){ this.frozen=false; this.scale=scale; }
  update(dt,elapsed,player){
    let ev=null;
    const seen=this.presence&&this.presence.read('mass:height');
    if(!this.active&&((seen?seen.above&&!seen.$protected:player.position.y>1.6)||elapsed>18)){ this.active=true; ev='activated'; }
    if(this.stunT>0) this.stunT=Math.max(0,this.stunT-dt);
    if(this.active&&this.hold){
      // selada, a massa não sobe nem até a contenção; só desce se estiver acima dela
      const h=this.hold; if(this.y<h.cap){ if(!this.frozen) this.y=Math.min(h.cap,this.y+Math.max(.3,h.surge)*dt); } else this.y=h.cap;
      this.speed=0; this.riseTime+=dt;
      if(this.reaches(player)) this.caught=true;
    } else if(this.active){
      const gap=player.position.y-this.y;
      let sp=.22+this.riseTime*MASS_RAMP; if(gap>24) sp+=(gap-24)*.06; sp*=this.scale||1;
      if(this.frozen||this.stunT>0) sp=0;            // rota SELO (até romper) ou purga: parada onde está
      this.speed=sp; this.y+=sp*dt; this.riseTime+=dt;
      if(this.reaches(player)) this.caught=true;
    }
    return ev;
  }
  // a mesma regra no poço e nas salas: a superfície passou dos pés, pegou. Nas salas com contenção a massa fica
  // presa abaixo do piso (setHold), então quem está lá dentro fica a salvo sem exceção nenhuma aqui.
  reaches(player){ const p=player.position; return p.y+.1<this.y+.15; }
  inShaft(player){ const p=player.position; return Math.hypot(p.x,p.z)<SHAFT_R+.1; }
  gap(player){ return player.position.y-this.y; }
  eta(player){ return this.active&&!this.hold&&this.speed>0?Math.max(0,this.gap(player)/this.speed):null; }
  visual(t){
    this.mesh.position.y=this.y; this.light.position.set(0,this.y+1.5,0); this.light.intensity=this.stunT>0?.45:1.4;   // escaldada pela purga: brilho baixo
    const pa=this.geo.attributes.position.array, b=this.base;
    for(let i=0;i<pa.length;i+=3){ const x=b[i], z=b[i+2];
      pa[i+1]=Math.sin(x*1.3+t*.9)*.25+Math.sin(z*1.7-t*1.1)*.2+Math.sin((x+z)*3+t*2)*.06; }
    this.geo.attributes.position.needsUpdate=true; this.geo.computeVertexNormals();
  }
}
