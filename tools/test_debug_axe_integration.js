'use strict';
// J1 — composição A+B: DeveloperNavigation real × picareta GLB real.
// Three.js/GLTFLoader reais lendo o GLB distribuído; Models real (js/core/models.js); World/Climbs/Player/ItemSystem/
// puzzles/massa/Game reais (tools/_debug_harness.js). Só renderer/UI/áudio são dublês de apresentação, e o pointer
// lock (API do navegador) é dado como capturado. Nenhum stub de cancelamento, solver ou guarda.
// Posicionar o corpo diante de uma fenda é FIXTURE de escalada (as fendas ficam fora do alcance dos pisos seguros);
// os teleportes e o voo medidos aqui são sempre os comandos reais goto/back/noclip.
const assert=require('node:assert/strict');
const H=require('./_axe_asset_harness');
const DIST_REL='assets/models/items/climbing_axe_low_poly.glb';
let gltfP=null;const gltf=()=>gltfP||(gltfP=H.loadAxe(DIST_REL));
const queue=[];function test(name,f){queue.push([name,f]);}

async function setup(){
  const dh=require('./_debug_harness.js')();
  dh.load('js/core/modelDefs.js');dh.load('js/core/models.js');
  const g0=await gltf();dh.G('Models').ready.set('climbing_axe',{scene:g0.scene,animations:[],def:dh.G('MODEL_DEFS').climbing_axe});
  dh.world.reset();dh.g.sectors.update(1/60);                 // mapa reconstruído já com o catálogo GLB
  dh.g.locked=()=>true;                                       // pointer lock capturado (API do navegador)
  dh.T=dh.THREE;dh.EYE=dh.G('EYE');
  dh.emitted=[];const emit=dh.p.emit.bind(dh.p);dh.p.emit=(ev,...a)=>{dh.emitted.push(ev);return emit(ev,...a);};
  return dh;
}
function frame(dh,n=1,dt=1/60){for(let i=0;i<n;i++){dh.wall.advance(dt*1000);dh.g._loop(dh.clock.now);}}
function equipBoth(dh){const it=dh.g.items;it.inv.add('climbing_axe',2);const slot=it.inv.slots.findIndex(s=>s&&s.id==='climbing_axe');
  for(const side of ['left','right']){it.select(slot,side);dh.settle(side==='left'?it.left:it);}
  assert.equal(it.equippedFor('left'),'climbing_axe');assert.equal(it.equippedFor('right'),'climbing_axe');
  frame(dh,1);for(const v of dh.p.axeVisuals){assert.ok(v,'axeVisuals');assert.equal(v.source,'glb','GLB real, não reserva');}}
const cracks=dh=>dh.world.grabbables.filter(o=>dh.G('isAxeSurface')(o)&&o.userData.type==='crack');
// fixture de escalada: olho 1 m para dentro da fenda, mirando o centro deslocado em dy
function hangAt(dh,crack,dy=0,dl=0){const T=dh.T,p=dh.p,c=new T.Box3().setFromObject(crack).getCenter(new T.Vector3()),out=new T.Vector3(c.x,0,c.z).normalize();
  const eye=c.clone().addScaledVector(out,-1);p.position.copy(eye);p.position.y-=dh.EYE;p._prev.copy(p.position);p.velocity.set(0,0,0);p.grounded=false;aimAt(dh,crack,dy,dl);}
// dl: deslocamento lateral ao longo da parede (o corpo pendurado desce durante o golpe, então só dy não separa pontos)
function aimAt(dh,crack,dy=0,dl=0){const T=dh.T,p=dh.p,c=new T.Box3().setFromObject(crack).getCenter(new T.Vector3());c.y+=dy;c.addScaledVector(new T.Vector3(-c.z,0,c.x).normalize(),dl);
  const d=c.sub(p.eyePos(new T.Vector3())).normalize();p.yaw=Math.atan2(-d.x,-d.z);p.pitch=Math.asin(d.y);p.applyCamera();p.camera.updateMatrixWorld(true);}
// golpe real pelo mouse (Game._onMouseDown → ItemSystem.useHand → impacto → Player.anchorAxe), botão mantido
function strike(dh,side){const owner=side==='left'?dh.g.items.left:dh.g.items;dh.g._onMouseDown({button:side==='left'?0:2});
  assert.equal(owner.phase,'striking');for(let i=0;i<40&&owner.phase==='striking';i++)frame(dh,1);return owner.phase;}
function pinned(dh,i){const T=dh.T,inst=dh.p.axeVisuals[i],h=dh.p.hands[i];inst.canonical.updateWorldMatrix(true,true);
  const tip=inst.refs.tip.clone().applyMatrix4(inst.canonical.matrixWorld),q=inst.canonical.getWorldQuaternion(new T.Quaternion());
  const N=h.normal.clone().normalize(),b=inst.refs.biteAxis.clone().applyQuaternion(q),u=inst.refs.headUp.clone().applyQuaternion(q);
  const upT=new T.Vector3(0,1,0).addScaledVector(N,-N.y).normalize();
  return {mm:tip.distanceTo(h.point)*1000,bite:T.MathUtils.radToDeg(b.angleTo(N.clone().negate())),up:T.MathUtils.radToDeg(u.angleTo(upT)),tip};}
function expectPinned(dh,i,tag){const r=pinned(dh,i);assert.ok(r.mm<=1,`${tag}: ponta a ${r.mm.toFixed(3)} mm`);assert.ok(r.bite<=.1&&r.up<=.1,`${tag}: orientação ${r.bite.toFixed(4)}°/${r.up.toFixed(4)}°`);}
const tipOf=(dh,i)=>pinned(dh,i).tip;
const resources=dh=>JSON.stringify({hands:dh.p.hands.map(a=>[a.stamina,a.exhausted]),perks:dh.p.attributes.activePerks,stats:dh.p.stats,
  inv:dh.g.items.inv.slots.map(s=>s&&[s.id,s.count]),eq:[dh.g.items.equippedFor('left'),dh.g.items.equippedFor('right')]});
// progressão do plano J1: checkpoints/current/bônus/puzzles/final. maxHeight/heightScore ficam fora: a spec só proíbe
// atualização "como consequência direta" do comando (coberto por test_developer_navigation); ver nota J1 no progress.
const progression=dh=>{const s=dh.g.score;return JSON.stringify({cp:[...dh.g.checkpoints.collected],current:dh.g.checkpoints.current,finish:dh.g.checkpoints.finishReached,
  bonus:[s.checkpointBonus,s.speedBonus,s.performanceBonus,s.penalties,s.puzzleBonus,s.secretBonus,s.collected],puzzles:dh.g.puzzles.puzzles.map(a=>[a.id,a.phase,a.solved])});};
const frozen=dh=>JSON.stringify({timer:[dh.g.timer.elapsedTime,dh.g.timer.running],mass:[dh.mass.y,dh.mass.active,dh.mass.hold,dh.mass.speed],
  elevator:[dh.world.elevator.state,dh.world.elevator.y,dh.world.elevator.t],puzzles:dh.g.puzzles.puzzles.map(a=>[a.id,a.phase,a.t,a.timeRemaining]),
  fans:dh.world.fans.map(a=>[a.phase,a.time,a.t])});
const meshes=o=>{const a=[];o.traverse(m=>{if(m.isMesh)a.push(m);});return a;};
const matSnap=dh=>{const a=[];dh.G('Models').ready.get('climbing_axe').scene.traverse(o=>{if(o.isMesh)a.push([o.material.name,o.material.color.getHex(),o.material.metalness,o.material.roughness,o.material.side]);});return JSON.stringify(a);};
function expectNoItemResidue(dh,tag){const p=dh.p;
  for(const owner of [dh.g.items.left,dh.g.items])assert.ok(['idle','equip'].includes(owner.phase),`${tag}: fase ${owner.phase}`);
  p.hands.forEach((h,i)=>{assert.equal(h.inContact,false,`${tag}: mão ${i} em contato`);assert.equal(h.anchor,null,`${tag}: âncora ${h.anchor}`);});
  assert.deepEqual(Array.from(p._axeContact,f=>f===null),[true,true],`${tag}: frame de contato visual`);}

test('goto_cancels_two_glb_contacts_without_late_effect',async()=>{
  const dh=await setup(),{g,p,nav}=dh;equipBoth(dh);const crack=cracks(dh)[0];
  hangAt(dh,crack,.3);assert.equal(strike(dh,'left'),'anchored','esquerda');
  aimAt(dh,crack,0,-.15);assert.equal(strike(dh,'right'),'anchored','direita');
  const old=p.hands.map(h=>h.point.clone());assert.ok(old[0].distanceTo(old[1])>.1,'pontos distintos');
  frame(dh,2);expectPinned(dh,0,'esq antes');expectPinned(dh,1,'dir antes');
  // direita solta e golpeia de novo: impacto pendente (≈150 ms) no momento do goto
  g._onMouseUp({button:2});frame(dh,1);g._onMouseDown({button:2});assert.equal(g.items.phase,'striking');
  const inst=p.axeVisuals.slice(),before=resources(dh),prog=progression(dh),emitted=dh.emitted.length;
  const r=nav.goto('cp6');assert.equal(r.ok,true,r.message);
  assert.equal(resources(dh),before,'stamina/perks/stats/unidades/equipamentos preservados');
  assert.equal(p.isClimbing,false);p.hands.forEach(h=>assert.equal(h.inContact,false));
  g._onMouseUp({button:0});g._onMouseUp({button:2});      // botões soltos depois do goto não têm efeito
  for(let k=0;k<60;k++){frame(dh,1);expectNoItemResidue(dh,'k='+k);
    for(let i=0;i<2;i++)assert.ok(tipOf(dh,i).distanceTo(old[i])>5,`ferramenta ${i} recolada à âncora antiga`);}
  const late=dh.emitted.slice(emitted).filter(e=>/^axe|anchor|slip/i.test(e));assert.deepEqual(late,[],'impacto/âncora tardio: '+late);
  assert.ok(p.axeVisuals[0]===inst[0]&&p.axeVisuals[1]===inst[1],'mesmas instâncias');inst.forEach(v=>{assert.equal(v.source,'glb');assert.equal(meshes(v.canonical).length,4);});
  assert.equal(nav.eligibility().assisted,true);assert.equal(nav.eligibility().competitiveEligible,false);
  assert.ok(nav.guard.protectedTriggers().some(t=>t.id==='checkpoint:cp6'),'proteção de chegada');
  assert.equal(progression(dh),prog,'sem checkpoint/bonus/puzzle sintético');assert.equal(p.dead,false);
});

test('back_between_distant_sectors_preserves_glb_and_progression',async()=>{
  const dh=await setup(),{g,p,nav}=dh;equipBoth(dh);
  const h0=p.maxHeightReached;assert.equal(nav.goto('cp6').ok,true);assert.equal(p.maxHeightReached,h0,'goto não atualiza maxHeight diretamente');frame(dh,5);const cp6=p.position.clone(),inst=p.axeVisuals.slice(),mats=matSnap(dh),prog=progression(dh);
  assert.equal(nav.goto('cp14').ok,true);frame(dh,5);assert.ok(Math.abs(p.position.y-331)<.05);const at14=JSON.stringify([p.position,p.yaw,p.pitch,p.hands.map(h=>[h.inContact,h.anchor])]);
  // destino tornado inseguro: back falha, preserva registro, pose e contatos
  dh.mass.active=true;dh.mass.reaches=()=>true;const r0=nav.back();assert.equal(r0.ok,false);
  assert.equal(JSON.stringify([p.position,p.yaw,p.pitch,p.hands.map(h=>[h.inContact,h.anchor])]),at14,'falha não move nem muda contatos');assert.ok(nav.backPose,'registro preservado');
  delete dh.mass.reaches;dh.mass.active=false;
  const r=nav.back();assert.equal(r.ok,true,r.message);assert.ok(p.position.distanceTo(cp6)<.05,'voltou ao apoio validado do cp6');
  // câmera e foco sincronizados antes de qualquer render
  assert.ok(p.camera.position.distanceTo(p.eyePos(new dh.T.Vector3()))<1e-9,'câmera');assert.ok(Math.abs(g.sectors.focus.y-(cp6.y+dh.EYE))<.02,'foco dos setores');
  assert.equal(nav.back().ok,false,'retorno consumido só no sucesso');
  frame(dh,120);
  assert.ok(p.axeVisuals[0]===inst[0]&&p.axeVisuals[1]===inst[1],'mesmas instâncias GLB');
  inst.forEach(v=>{assert.equal(v.source,'glb');meshes(v.canonical).forEach(m=>{assert.ok(m.geometry.attributes.position.count>0,'geometria viva');});});
  assert.equal(matSnap(dh),mats,'materiais do GLB');
  assert.equal(progression(dh),prog,'sem checkpoint/current/bonus/puzzle/final sintético na chegada nem depois de pousar');
  assert.equal(g.checkpoints.collected.has('cp6'),false);assert.equal(g.checkpoints.collected.has('cp14'),false);
  expectNoItemResidue(dh,'após back');
});

test('noclip_from_hanging_glb_freezes_then_recovers',async()=>{
  const dh=await setup(),{g,p,nav}=dh;equipBoth(dh);
  assert.equal(nav.goto('bombas').ok,true);frame(dh,3);const bombas=p.position.clone();
  p.attributes.addPerk('quick_recovery');
  hangAt(dh,cracks(dh)[0],.3);assert.equal(strike(dh,'left'),'anchored');aimAt(dh,cracks(dh)[0],-.3);assert.equal(strike(dh,'right'),'anchored');
  frame(dh,2);expectPinned(dh,0,'pendurado esq');expectPinned(dh,1,'pendurado dir');
  const before=resources(dh),prog=progression(dh);
  const on=nav.setNoclip(true);assert.equal(on.ok,true,on.message);
  assert.equal(resources(dh),before,'stamina/perks preservados');assert.equal(p.isClimbing,false);assert.equal(p.velocity.length(),0);
  const still=frozen(dh),q=p.position.clone();g.keys={KeyW:true,Space:true};
  for(let k=0;k<600;k++){frame(dh,1);if(k%50===0||k===599)expectNoItemResidue(dh,'voo k='+k);}
  g.keys={};assert.equal(frozen(dh),still,'massa/porta/elevador/puzzle/timer congelados');assert.ok(p.position.distanceTo(q)>50,'voou');
  assert.equal(resources(dh),before);
  // Estilo CS (decisão do usuário 2026-10-18): off desliga no lugar, mesmo 40 m acima do piso ou dentro de geometria
  p.position.copy(bombas).y+=40;const high=p.position.clone(),ro=nav.setNoclip(false);
  assert.equal(ro.ok,true,ro.message);assert.equal(nav.noclipActive,false);assert.equal(p.position.distanceTo(high),0,'sem teleporte');assert.match(ro.message,/Aviso: Sem apoio/);
  expectNoItemResidue(dh,'off no ar');assert.equal(nav.setNoclip(true).ok,true);
  const dir=new dh.T.Vector3(Math.cos(3*Math.PI/4),0,Math.sin(3*Math.PI/4));p.position.copy(bombas).addScaledVector(dir,1.4);
  assert.match(nav.safety.check(nav.pose()).reason,/intersecta/);const inside=p.position.clone(),ri=nav.setNoclip(false);
  assert.equal(ri.ok,true,ri.message);assert.equal(p.position.distanceTo(inside),0,'sem teleporte');assert.match(ri.message,/Aviso: Corpo intersecta/);
  // pouso normal: off sobre o piso de bombas, física retomada sem queda/dano
  assert.equal(nav.setNoclip(true).ok,true);p.position.copy(bombas);const r=nav.setNoclip(false);assert.equal(r.ok,true,r.message);assert.doesNotMatch(r.message,/Aviso/);
  assert.equal(nav.noclipActive,false);assert.equal(p.velocity.length(),0);assert.equal(p.position.distanceTo(bombas),0);
  const stats=JSON.stringify(p.stats);frame(dh,120);
  assert.equal(p.dead,false);assert.equal(JSON.stringify(p.stats),stats,'sem queda/escorregão');expectNoItemResidue(dh,'após off');
  assert.equal(g.timer.running,true);assert.equal(nav.eligibility().competitiveEligible,false,'continua inelegível');
  assert.equal(progression(dh),prog);
});

test('post_debug_reanchor_uses_new_contact_frame',async()=>{
  const dh=await setup(),{g,p,nav}=dh;equipBoth(dh);const crack=cracks(dh)[0];
  hangAt(dh,crack,.3);assert.equal(strike(dh,'left'),'anchored');aimAt(dh,crack,-.3);assert.equal(strike(dh,'right'),'anchored');frame(dh,1);
  const oldPoint=p.hands[1].point.clone(),oldFrame=p._axeContact[1];assert.ok(oldFrame,'frame antigo existia');
  assert.equal(nav.goto('cp3').ok,true);frame(dh,10);assert.deepEqual(Array.from(p._axeContact,f=>f===null),[true,true]);
  assert.equal(nav.setNoclip(true).ok,true);frame(dh,5);const off=nav.setNoclip(false);assert.equal(off.ok,true,off.message);frame(dh,5);
  // volta à parede (fixture de escalada) e crava de novo, com uso normal, num ponto diferente
  g._onMouseUp({button:0});g._onMouseUp({button:2});
  hangAt(dh,crack,.05);const physBefore=()=>JSON.stringify(p.hands.map(h=>[h.point,h.normal,h.anchor,h.inContact]));
  assert.equal(strike(dh,'right'),'anchored');frame(dh,1);
  const h=p.hands[1],f=p._axeContact[1];assert.ok(f,'novo frame capturado');assert.ok(f!==oldFrame,'não reaproveita o frame antigo');
  assert.ok(f.point.distanceTo(h.point)<1e-9,'frame do contato novo');assert.ok(h.point.distanceTo(oldPoint)>.05,'ponto novo ≠ antigo');
  assert.equal(p.hands[0].inContact,false,'esquerda livre');
  // 30 quadros reais e 600 quadros de câmera varrendo (inclui olhar para baixo)
  for(let k=0;k<30;k++){frame(dh,1);expectPinned(dh,1,'loop k='+k);}
  const phys=physBefore();
  for(let k=0;k<600;k++){p.yaw+=Math.sin(k*.021)*.02;p.pitch=-1.45+1.9*(.5+.5*Math.sin(k*.013));p.applyCamera();g.items.update(1/60);p.updateViewmodel();
    expectPinned(dh,1,'câmera k='+k);if(k%60===0){assert.ok(p._axeContact[0]===null,'esquerda sem pino');
      const L=p.handModels[0].root.position,cam=p.camera.position;assert.ok(L.distanceTo(cam)<1,'esquerda segue a câmera');}}
  assert.equal(physBefore(),phys,'âncora física não foi movida pelo visual');
});

test('goto_back_rearm_with_glb_does_not_lock_puzzle',async()=>{
  const dh=await setup(),{g,p,nav}=dh;equipBoth(dh);
  const q=nav.safety.resolve('bombas').pose.position;p.position.copy(q);p._prev.copy(q);frame(dh,1);
  const h1=g.puzzles.byId('h1');assert.equal(h1.phase,'inside');
  assert.equal(nav.goto('cp6').ok,true);assert.equal(nav.back().ok,true);
  const ids=()=>nav.guard.protectedTriggers().map(t=>t.id);assert.ok(ids().includes('hall:h1'));const others=ids().filter(i=>i!=='hall:h1'&&i!=='mass:height');
  frame(dh,120);assert.ok(ids().includes('hall:h1'),'parado não rearma');assert.equal(h1.phase,'inside');
  p.yaw=Math.PI/2;g.keys={KeyW:true};for(let i=0;i<600&&p.position.x>5.55;i++)frame(dh,1);assert.ok(p.position.x<=5.6,'saiu andando');
  p.yaw=-Math.PI/2;for(let i=0;i<600&&p.position.x<q.x;i++)frame(dh,1);g.keys={};
  assert.equal(ids().includes('hall:h1'),false,'locomoção normal rearmou h1: '+ids());
  others.forEach(id=>assert.ok(ids().includes(id),'gatilho não envolvido continua protegido: '+id));
  assert.equal(h1.phase,'inside');assert.equal(nav.noclipActive,false);
  // ação explícita disponível fora do voo: golpe real com GLB (sem superfície à frente → golpe no vazio)
  assert.equal(g._gameplayAllowed(),true);p.pitch=.6;p.applyCamera();g._onMouseDown({button:2});assert.equal(g.items.phase,'striking');
  for(let i=0;i<20&&g.items.phase==='striking';i++)frame(dh,1);assert.ok(['whiff','bounce','idle'].includes(g.items.phase),g.items.phase);
  assert.equal(p.axeVisuals[1].source,'glb');
});

if(require.main===module)(async()=>{let n=0,bad=0;
  for(const [name,f] of queue){n++;try{await f();console.log('OK',name);}catch(e){bad++;console.error('FAIL',name,e.stack.split('\n').slice(0,4).join('\n'));}}
  console.log(`${n} testes; falhas: ${bad}`);process.exitCode=bad?1:0;})();
