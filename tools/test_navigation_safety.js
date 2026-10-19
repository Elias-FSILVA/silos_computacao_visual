'use strict';
const assert=require('node:assert/strict');
const h=require('./_navigation_harness.js')(),{THREE,world,game,G}=h;
h.load('js/systems/NavigationSafety.js');
const v=(x,y,z)=>new THREE.Vector3(x,y,z), pose=(x,y,z)=>({position:v(x,y,z),yaw:0,pitch:0});
let count=0,bad=0;function test(name,f){ count++;try{ assert.equal(G('typeof NavigationSafety'),'function','NavigationSafety ausente');f();console.log('OK',name); }catch(e){bad++;console.error('FAIL',name,e.stack);} }
const safety=()=>new (G('NavigationSafety'))(game);
const box=(x0,x1,z0,z1,y0,y1)=>({minX:x0,maxX:x1,minZ:z0,maxZ:z1,bottom:y0,top:y1});
function fixture(platforms){ const w={platforms,shellSegs:[],fans:[],checkpoints:[],spawnPoint:v(0,0,0),spawnYaw:0,bodyRegionAt:()=>({ok:true,reason:''})};return new (G('NavigationSafety'))({world:w,mass:null}); }
const floor=()=>box(-4,4,-4,4,-.3,0);
const physical=()=>JSON.stringify({platforms:world.platforms,cp:world.checkpoints,shell:world.shellSegs,fans:world.fans.map(f=>({near:f._nearN,pos:f.pos,axis:f.axis})),el:world.elevator&&{state:world.elevator.state,y:world.elevator.y}});
test('catálogo contém todos os IDs reais e aliases; não inventa cp5/cp9',()=>{ const s=safety(),ids=s.catalog().map(d=>d.id); for(const c of world.checkpoints)assert.ok(ids.includes(c.id),c.id); for(const id of ['subida1','subida2','subida2b','subida3a','subida3b','subida4','bombas','mezanino','arquivo'])assert.ok(ids.includes(id)); assert.ok(!ids.includes('cp5')&&!ids.includes('cp9')); });
test('goto list: cada lugar listado tem nota própria e concreta, sem frase genérica, "Subida N" ou dica do que vem',()=>{
  const s=safety(),cat=s.catalog(),listed=cat.filter(d=>d.listed!==false);
  for(const c of world.checkpoints.filter(c=>c.id!=='atalho'))assert.ok(listed.some(d=>d.id===c.id),'falta na lista: '+c.id);
  const notes=listed.map(d=>d.note);assert.equal(new Set(notes).size,notes.length,'notas repetidas: '+notes.join(' | '));
  for(const d of listed){assert.ok(d.note&&d.note.length<=48,d.id+': nota vazia/longa');assert.ok(!/mecanismos preservado|preservad|Adiante|Não consome|não é resolvid/i.test(d.note),d.id+': '+d.note);assert.ok(!/^Subida/.test(d.name),d.id+': '+d.name);}
  const note=id=>listed.find(d=>d.id===id).note;
  assert.match(note('cp6'),/picareta/);assert.match(note('cp11'),/picareta/);
  assert.match(note('cp4'),/E1/);assert.match(note('cp8'),/E2/);assert.match(note('cp14'),/E3/);
});
test('goto list: aliases e atalho continuam no catálogo (goto funciona) mas não aparecem na lista',()=>{
  const s=safety(),cat=s.catalog();
  for(const id of ['subida1','subida2','subida2b','subida3a','subida3b','subida4','mezanino','atalho']){const d=cat.find(d=>d.id===id);assert.ok(d,id);assert.equal(d.listed,false,id);}
  assert.equal(s.resolve('subida1').ok,true);
  const ids=cat.filter(d=>d.listed!==false).map(d=>d.id);assert.equal(new Set(ids.map(id=>cat.find(d=>d.id===id).height)).size,ids.length,'dois IDs listados no mesmo lugar');
});
test('todos os checkpoints e aliases resolvem pés em apoio real não letal sem mutar mundo',()=>{const s=safety(),before=physical(); for(const d of s.catalog()){const r=s.resolve(d.id);if(d.id==='atalho'){assert.equal(r.ok,false,'atalho é suspenso; sem apoio seguro');continue;}assert.equal(r.ok,true,`${d.id}: ${r.message}`);assert.equal(s.check(r.pose).ok,true,d.id); if(d.id==='cp6')assert.equal(r.pose.position.y,128);if(d.id==='cp11')assert.equal(r.pose.position.y,269.6);if(d.id==='cp14')assert.equal(r.pose.position.y,331);}assert.equal(physical(),before);});
test('resolver referência removida falha em vez de usar centro/spawn',()=>{ const s=safety(),c=world.checkpoints.find(c=>c.id==='cp6'),i=world.checkpoints.indexOf(c);world.checkpoints.splice(i,1);try{assert.equal(s.resolve('cp6').ok,false);}finally{world.checkpoints.splice(i,0,c);} });
test('corpo colide embora câmera livre; cabeça no teto é recusada; contato com piso permitido',()=>{const s=fixture([floor(),box(-1,1,-1,1,.3,.7)]); assert.equal(s.check(pose(0,0,0)).ok,false);assert.equal(s.check(pose(3,0,0)).ok,true);const t=fixture([floor(),box(-1,1,-1,1,1.7,2)]);assert.equal(t.check(pose(0,0,0)).ok,false);});
test('cantos arredondados do cilindro em AABB e OBB, sem teste só de AABB envolvente',()=>{ const b=box(0,1,0,1,.2,2),s=fixture([floor(),b]);assert.equal(s.check(pose(-.25,0,-.25)).ok,true);assert.equal(s.check(pose(-.2,0,-.2)).ok,false);const O={cx:0,cz:0,hx:2,hz:.1,c:Math.SQRT1_2,s:Math.SQRT1_2},o={...G('obbBounds')(O),obb:O,bottom:.2,top:2};const t=fixture([floor(),o]);assert.equal(t.check(pose(1,0,-1)).ok,true);assert.equal(t.check(pose(1,0,1)).ok,false);});
test('setor anelar usa arco real; furo central livre e beirada sem apoio completo recusada',()=>{const a={cx:0,cz:0,r0:2,r1:3,a0:0,span:Math.PI*2},b={...G('arcBounds')(a),arc:a,bottom:.2,top:2},s=fixture([floor(),b]);assert.equal(s.check(pose(0,0,0)).ok,true);assert.equal(s.check(pose(1.8,0,0)).ok,false);assert.equal(s.check(pose(4.1,0,0)).ok,false);const t=fixture([{...b,bottom:-.3,top:0}]);assert.equal(t.check(pose(2.5,0,0)).ok,true);assert.equal(t.check(pose(2.15,0,0)).ok,false);});
test('casca fechada recusa corpo inteiro; abertura real aceita passagem sem depender de prev',()=>{ const s=safety(),R=G('SHAFT_R');assert.equal(world.bodyRegionAt(v(R+.2,25,0)).ok,false);const op=world.openings.find(o=>o.id==='h1_in'),a=(op.a0+op.a1)/2;assert.equal(world.bodyRegionAt(v((R+.2)*Math.cos(a),op.y0+.4,(R+.2)*Math.sin(a))).ok,true);assert.equal(s.check(pose(500,0,500)).ok,false);});
test('piso removido/cabine movida e massa invalidam posição previamente segura',()=>{const f=floor(),s=fixture([f]);assert.equal(s.check(pose(0,0,0)).ok,true);f.top=10;f.bottom=9.7;assert.equal(s.check(pose(0,0,0)).ok,false);f.top=0;f.bottom=-.3;const m=new (G('MassSystem'))(new THREE.Scene());m.y=1;m.active=true;s.game.mass=m;assert.equal(s.check(pose(0,0,0)).ok,false);});
test('pás letais são recusadas sem construir cache/mutar fan',()=>{const f=new (G('Fan'))({pos:v(0,1.1,0),axis:v(0,1,0),mode:'pull',radius:2,duct:2,range:2,speed:8,kill:.4}),s=fixture([floor()]);s.game.world.fans=[f];const before=JSON.stringify(f);assert.equal(s.check(pose(0,0,0)).ok,false);assert.equal(JSON.stringify(f),before);});
test('fallback é próximo, apoiado, não atravessa porta fechada nem usa lastSafe obsoleto',()=>{const wall=box(-.1,.1,-4,4,0,3),s=fixture([floor(),wall]);let r=s.recover(pose(.5,0,0),pose(-1,0,0));assert.equal(r.ok,true);assert.equal(r.pose.position.x,.5);r=s.recover(pose(.15,0,0),pose(-1,0,0));assert.equal(r.ok,true,r.message);assert.ok(r.pose.position.x>=.4-1e-3);assert.ok(r.pose.position.distanceTo(v(.15,0,0))<1);assert.equal(r.fallback,true);assert.match(r.message,/fallback/i);});
test('fallback sem conexão apoiada provada não teleporta entre ilhas ou atravessa outra parede',()=>{ const s=fixture([box(-3,-1,-1,1,-.3,0),box(1,3,-1,1,-.3,0)]);assert.equal(s.recover(pose(0,0,0),pose(2,0,0)).ok,false);assert.equal(s.recover(pose(0,5,0),pose(2,0,0)).ok,false);});
test('decisão off: contato ≤4 cm ajusta só a altura no lugar (antes de lastSafe); >4 cm não desce nem busca piso',()=>{const s=fixture([floor()]);for(const dy of [.04,.02,-.02]){const r=s.recover(pose(2,dy,0),pose(0,0,0));assert.equal(r.ok,true,r.message);assert.ok(!r.fallback,r.message);assert.equal(r.pose.position.x,2);assert.equal(r.pose.position.z,0);assert.equal(r.pose.position.y,0);}for(const dy of [.05,.5,3])assert.equal(s.recover(pose(2,dy,0),pose(0,0,0)).ok,false,'dy '+dy);});
test('decisão off: mensagem do ajuste mostra a fração real de cm (J-final m3)',()=>{const s=fixture([floor()]);const r=s.recover(pose(2,.003,0),pose(0,0,0));assert.equal(r.ok,true,r.message);assert.match(r.message,/contato ajustado 0\.3 cm/);const r2=s.recover(pose(2,-.035,0),pose(0,0,0));assert.match(r2.message,/contato ajustado 3\.5 cm/);});
console.log(`${count} testes; falhas: ${bad}`);process.exitCode=bad?1:0;
