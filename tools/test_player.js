'use strict';
// Física real do Three.js; somente a representação visual das mãos é substituída.
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const THREE=require('three');
// Fixar apenas a fonte aleatória evita slips estocásticos nos pares comparativos.
const ctx=vm.createContext({THREE,console,performance,Math:Object.assign(Object.create(Math),{random:()=>.5}),HandModel:class{
  constructor(){ this.root=new THREE.Group(); this.wrist=new THREE.Group(); }
  static indexTip(side,out){ return out.set(0,0,-.1); }
  kick(){}
  setBase(){}
  setPose(){}
  tint(value){ this.lastTint=value; }
  setWear(){}
  update(){}
}});
for(const file of ['js/core/utils.js','js/world/Collision.js','js/items/Inventory.js','js/player/perkDefs.js','js/player/PlayerAttributes.js','js/player/PlayerStats.js','js/player/PlayerHealth.js','js/player/HandWear.js','js/player/Player.js','js/player/VRPlayer.js','js/Game.js','js/systems/progress.js','js/ui/UIManager.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx,{filename:file});
const Player=vm.runInContext('Player',ctx);
const idle={x:0,y:0};
function player(options){
  return new Player(new THREE.Scene(),new THREE.PerspectiveCamera(),{
    spawnPoint:new THREE.Vector3(0,5,.5),spawnYaw:0,platforms:[],raycastTargets:[],touch(){}
  },options);
}
function hold(p,i=0,normal=[0,0,1]){
  const h=p.hands[i];
  h.inContact=h.isGrabbing=true;
  h.surface=new THREE.Object3D(); h.surface.userData.grab=true;
  h.normal.set(...normal); h.point.set(0,7.57,0);
  p.grounded=false;
  return h;
}
function near(actual,want,eps=1e-8){ assert.ok(Math.abs(actual-want)<eps,`${actual} != ${want}`); }
let fails=0, total=0;
function test(name,fn){ total++; try{fn(); console.log('OK',name);}catch(e){fails++;console.error('FAIL',name,'\n ',e.message);} }

// Falha se a normal da parede voltar a causar recuo, inclusive com duas mãos/em cantos.
for(const normals of [[[0,0,1]],[[1,0,0]],[[0,0,-1]],[[0,-1,0]],[[0,0,1],[1,0,0]]]){
  test(`salto neutro vertical, normais ${JSON.stringify(normals)}`,()=>{
    const p=player(); normals.forEach((n,i)=>hold(p,i,n));
    p.jump();
    near(p.velocity.x,0); near(p.velocity.z,0);
    assert.ok(p.velocity.y>0); assert.equal(p.isClimbing,false);
  });
}
test('salto não herda oscilação horizontal nem queda anterior',()=>{
  const p=player(); hold(p); p.velocity.set(5,-12,4); p.jump();
  near(p.velocity.x,0); near(p.velocity.z,0); assert.ok(p.velocity.y>0);
});
// Falha se o salto ignorar o comando ou usar eixos absolutos em vez do olhar.
for(const [yaw,input,axis,sign] of [[0,{x:1,y:0},'x',1],[0,{x:0,y:1},'z',-1],[0,{x:0,y:-1},'z',1],[Math.PI/2,{x:0,y:1},'x',-1]]){
  test(`salto direcional yaw=${yaw}, input=${JSON.stringify(input)}`,()=>{
    const p=player(); hold(p); p.yaw=yaw; p.jump(input);
    assert.ok(p.velocity[axis]*sign>0);
    near(p.velocity[axis==='x'?'z':'x'],0);
    assert.ok(p.velocity.y>Math.hypot(p.velocity.x,p.velocity.z)*2);
  });
}
test('diagonal não ganha velocidade extra; analógico mantém intensidade',()=>{
  const a=player(),b=player(),c=player(); [a,b,c].forEach(p=>hold(p));
  a.jump({x:1,y:0}); b.jump({x:1,y:1}); c.jump({x:.5,y:0});
  assert.ok(a.velocity.x>0);
  near(Math.hypot(b.velocity.x,b.velocity.z),a.velocity.x);
  near(c.velocity.x,a.velocity.x/2);
});
for(const hz of [30,60,120]){
  test(`trajetória neutra sobe sem se afastar da parede em ${hz} Hz`,()=>{
    const p=player(); hold(p); const start=p.position.clone(); p.jump();
    for(let i=0;i<hz*.5;i++) p.update(1/hz,idle);
    assert.ok(p.position.y>start.y+1);
    near(p.position.x,start.x); near(p.position.z,start.z);
  });
}
test('impulso consome stamina, conta uma vez e não permite salto no vazio',()=>{
  const p=player(); const h=hold(p); let events=0; p.on('walljump',()=>events++);
  p.jump(); const vy=p.velocity.y;
  assert.ok(h.stamina<100); assert.ok(h.cooldown>0);
  assert.equal(p.stats.wallJumps,1); assert.equal(p.stats.jumps,0);
  p.jump(); near(p.velocity.y,vy); assert.equal(events,1);
});
test('após impulso, cooldown impede captura imediata e permite agarrar acima',()=>{
  const p=player(); const h=hold(p);
  const next=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.2));
  next.position.set(0,9,0); next.userData.grab=true; next.updateMatrixWorld();
  p.world.raycastTargets=[next];
  const start=p.position.y; p.jump();
  function frame(){
    p.eyePos(p.camera.position); p.camera.lookAt(next.position); p.camera.updateMatrixWorld();
    p.update(1/60,idle);
  }
  for(let i=0;i<12;i++) frame();
  assert.equal(h.inContact,false);
  for(let i=0;i<3;i++) frame();
  assert.equal(h.inContact,true); assert.equal(h.surface,next);
  assert.ok(p.position.y>start+1); assert.ok(h.stamina<100);
});
test('stamina insuficiente preserva a pegada',()=>{
  const p=player(); const h=hold(p); h.stamina=11; let weak=0; p.on('weak',()=>weak++);
  p.jump(); assert.equal(h.inContact,true); near(p.velocity.length(),0); assert.equal(weak,1);
});
test('borda exige puxada e mantle tem prioridade sobre impulso',()=>{
  const p=player(); const h=hold(p);
  h.surface.userData.plat={minX:-1,maxX:1,minZ:-1,maxZ:1,top:7.5,bottom:7.2};
  let needPull=0; p.on('needPull',()=>needPull++);
  p.jump(); assert.equal(needPull,1); assert.equal(h.inContact,true);
  p.pull=.6; p.jump({x:1,y:0});
  assert.ok(p.mantle); assert.equal(p.stats.wallJumps,0);
  p.update(.45,idle); assert.equal(p.mantle,null); assert.equal(p.grounded,true); near(p.position.y,7.5);
});
test('mãos alternadas: mão livre recupera enquanto a outra sustenta',()=>{
  const p=player(); const h=hold(p); p.rightHand.stamina=40;
  p.update(1/60,idle); assert.ok(h.stamina<100); assert.ok(p.rightHand.stamina>40);
});
test('duas mãos dividem a carga e puxada manual eleva o corpo',()=>{
  const a=player(),b=player(); hold(a); hold(b); hold(b,1);
  const start=b.position.y;
  for(let i=0;i<30;i++){ a.update(1/60,idle); b.pullBy(5); b.update(1/60,idle); }
  assert.ok(b.leftHand.stamina>a.leftHand.stamina);
  assert.ok(b.position.y>start); assert.ok(b.pull>0); assert.ok(b.pullFatigue>0);
});
test('chão e coyote time continuam permitindo um único salto',()=>{
  for(const grounded of [true,false]){
    const p=player(); p.grounded=grounded; p.coyoteT=grounded?0:.08;
    p.jump(); assert.ok(p.velocity.y>0); assert.equal(p.stats.jumps,1);
    p.jump(); assert.equal(p.stats.jumps,1);
  }
});
test('reset limpa impulso, fadiga, mãos e métricas da corrida',()=>{
  const p=player(); hold(p); p.jump({x:1,y:1}); p.pullFatigue=.9; p.stats.slips++;
  p.reset(); near(p.velocity.length(),0); near(p.pullFatigue,0);
  assert.equal(p.isClimbing,false); assert.equal(p.stats.wallJumps,0); assert.equal(p.stats.slips,0);
});
// Adaptadores exercitados contra o Player real; DOM e hardware XR são as fronteiras falsas.
test('Space usa WASD pressionado no evento, sem depender do próximo frame',()=>{
  const events={}; ctx.addEventListener=(name,fn)=>{events[name]=fn;};
  ctx.document={addEventListener(){}};
  const Game=vm.runInContext('Game',ctx), g=Object.create(Game.prototype);
  const p=player(); hold(p);
  Object.assign(g,{player:p,state:'play',keys:{},world:p.world,settings:{},
    ui:{$:id=>id==='devConsole'?{hidden:true}:{addEventListener(){}},bindSettings(){}},
    vr:{ready:Promise.resolve(false)},renderer:{domElement:{addEventListener(){}}},audio:{noise(){}}});
  g._wire();
  const key=code=>events.keydown({code,repeat:false,preventDefault(){}});
  key('KeyD'); key('Space'); assert.ok(p.velocity.x>0); near(p.velocity.z,0);
});
test('X guarda os itens equipados nas duas mãos',()=>{
  const events={}; ctx.addEventListener=(name,fn)=>{events[name]=fn;}; ctx.document={addEventListener(){}};
  const Game=vm.runInContext('Game',ctx), g=Object.create(Game.prototype), calls=[];
  Object.assign(g,{player:{on(){}},state:'play',keys:{},world:{},settings:{},hold:{},
    items:{holster(){calls.push('right');},holsterAll(){calls.push('both');}},
    ui:{$:id=>id==='devConsole'?{hidden:true}:{addEventListener(){}},bindSettings(){}},
    vr:{ready:Promise.resolve(false)},renderer:{domElement:{addEventListener(){}}},audio:{noise(){}}});
  g._wire(); events.keydown({code:'KeyX',repeat:false,preventDefault(){}});
  assert.deepEqual(calls,['both']);
});
for(const tracked of [false,true]){
  test(`VR usa direção e analógico do frame atual (${tracked?'pinça':'botão A'})`,()=>{
    const VRPlayer=vm.runInContext('VRPlayer',ctx), vr=Object.create(VRPlayer.prototype);
    const p=player(); hold(p); p.camera.rotation.y=Math.PI/2; p.camera.updateMatrixWorld();
    Object.assign(vr,{camera:p.camera,g:{player:p,settings:{data:{}},items:{equippedFor:()=>null,useHand(){}}},
      input:{x:0,y:0},rigYaw:0,anchor:new THREE.Vector3(),ctrl:[null,null],keyHover:[null,null],
      _frame(){},_lookInput(){return 0;},
      _readAll(){return [{d:{trigger:tracked},u:{},sx:0,sy:-1,tracked},{d:{a:!tracked},u:{}}];}});
    vr.update(1/60); assert.ok(p.velocity.x<0); near(p.velocity.z,0);
  });
}
// Perks: falham se capacidade curar, custo divergir da validação ou efeitos ignorarem a simulação.
test('Corpo leve limita imediatamente sem curar nem mudar estado físico',()=>{
  const p=player(); p.rightHand.stamina=45;p.rightHand.exhausted=true;p.pullFatigue=.8;p.velocity.set(1,2,3);
  const pos=p.position.clone(),vel=p.velocity.clone();
  p.attributes.addPerk('light_body'); assert.equal(p.maxStamina,60);assert.equal(p.leftHand.stamina,60);assert.equal(p.rightHand.stamina,45);
  for(let i=0;i<10;i++){p.attributes.removePerk('light_body');assert.equal(p.maxStamina,100);assert.equal(p.leftHand.stamina,60);p.attributes.addPerk('light_body');}
  assert.equal(p.rightHand.stamina,45);assert.equal(p.rightHand.exhausted,true);assert.equal(p.pullFatigue,.8);
  assert.deepEqual(p.position,pos);assert.deepEqual(p.velocity,vel);
  p.restoreStamina();assert.equal(p.leftHand.stamina,60);assert.equal(p.rightHand.stamina,60);
});
for(const ids of [[],['light_body'],['powerful_launch'],['light_body','powerful_launch']]){
  test(`custo efetivo e impulso sem recuo: ${ids}`,()=>{
    const p=player();ids.forEach(id=>p.attributes.addPerk(id));const a=hold(p),b=hold(p,1);
    const cost=ids.includes('powerful_launch')?15:12, speed=ids.includes('powerful_launch')?9.9:9;
    a.stamina=cost-.01;b.stamina=50;p.jump();assert.equal(a.inContact,true);assert.equal(b.stamina,50);
    a.stamina=cost;p.jump();near(a.stamina,0);near(b.stamina,50-cost);near(p.velocity.y,speed);near(p.velocity.x,0);near(p.velocity.z,0);
    const q=player();ids.forEach(id=>q.attributes.addPerk(id));hold(q);const free=q.rightHand.stamina;q.jump();assert.equal(q.rightHand.stamina,free);
    q.reset();ids.forEach(id=>q.attributes.addPerk(id));const stamina=q.stamina;q.jump();near(q.velocity.y,8.2);assert.equal(q.stamina,stamina);
  });
}
test('mantle mantém prioridade, custo e trajetória mesmo com perks',()=>{
  const a=player(),b=player();b.attributes.addPerk('light_body');b.attributes.addPerk('powerful_launch');b.attributes.addPerk('economical_grip');
  for(const p of [a,b]){const h=hold(p);h.stamina=40;h.surface.userData.plat={minX:-1,maxX:1,minZ:-1,maxZ:1,top:7.5,bottom:7.2};p.pull=.6;p.jump();assert.ok(p.mantle);near(h.stamina,32);p.update(.2,idle);}
  assert.deepEqual(a.position,b.position);
});
for(const [id,factor,recovery] of [['economical_grip',.85,.85],['quick_recovery',1.1,1.2]]){
  for(const n of [1,2]) test(`${id}: dreno total inclui esforço, fadiga crítica e lateral (${n} mãos)`,()=>{
    const a=player(),b=player();b.attributes.addPerk(id);
    for(const p of [a,b]){for(let i=0;i<n;i++)hold(p,i);p.pull=p.pullTarget=.6;p.pullFatigue=.95;p.effort=.7;p.pullIn=4;}
    a.update(.01,{x:1,y:0});b.update(.01,{x:1,y:0});
    near(100-b.leftHand.stamina,(100-a.leftHand.stamina)*factor);
  });
  test(`${id}: recuperação só no chão ou na mão livre`,()=>{
    for(const mode of ['ground','climb','air']){
      const p=player();p.attributes.addPerk(id);p.hands.forEach(h=>h.stamina=40);
      if(mode==='ground')p.world.platforms=[{minX:-2,maxX:2,minZ:-2,maxZ:2,top:5,bottom:4}];
      else if(mode==='climb')hold(p);else p.grounded=false;
      p.update(.1,idle);near(p.rightHand.stamina,40+(mode==='ground'?35:mode==='climb'?12:0)*recovery*.1);
    }
  });
}
test('bases de dreno/recuperação e teto efetivo',()=>{
  for(const light of [false,true]){
    const p=player();if(light)p.attributes.addPerk('light_body');p.hands.forEach(h=>h.stamina=40);hold(p);
    p.update(.1,idle);near(p.leftHand.stamina,39.1);near(p.rightHand.stamina,41.2);
    p.releaseAll();p.position.y=5;p.world.platforms=[{minX:-2,maxX:2,minZ:-2,maxZ:2,top:5,bottom:4}];p.velocity.set(0,0,0);p._prev.copy(p.position);
    p.update(.1,idle);near(p.rightHand.stamina,44.7);p.update(1,idle);assert.ok(p.rightHand.stamina<=p.maxStamina);
    if(light)near(p.rightHand.stamina,60);
  }
});
const probeDef=(multipliers)=>({probe:{id:'probe',name:'Probe',benefit:'Teste',tradeoff:'Teste',multipliers}});
test('alcance normal/cansado usa atributos e mantém limiar absoluto',()=>{
  const p=player({perkCatalog:probeDef({reach:1.5,tiredReach:1.5})});p.attributes.addPerk('probe');
  p.leftHand.stamina=20;near(p.reach,3);p.leftHand.stamina=19.99;near(p.reach,2.55);
});
test('fadiga: multiplicadores não alteram decisão de esforço nem espera',()=>{
  const a=player(),b=player({perkCatalog:probeDef({fatigueGainMultiplier:2,fatigueRecoveryMultiplier:2})});b.attributes.addPerk('probe');
  for(const p of [a,b]){hold(p);p.pullFatigue=.4;p.effort=.5;p._fatigue(.1,true);}near(b.pullFatigue-.4,2*(a.pullFatigue-.4));
  for(const p of [a,b]){p.effort=.2;p.pull=0;p.pullFatigue=.5;p.restT=0;p._fatigue(.4,true);near(p.pullFatigue,.5);p._fatigue(.4,true);near(p.pullFatigue,.5);p._fatigue(.2,true);}
  near(.5-b.pullFatigue,2*(.5-a.pullFatigue));assert.ok(b.fatigueFx>0);
  b.effort=1;b._fatigue(100,true);near(b.pullFatigue,1);b.releaseAll();b.grounded=true;b._fatigue(100,false);near(b.pullFatigue,0);
});
for(const hz of [30,60,120])test(`gravidade pessoal e mudanças no ar sem teleporte (${hz} Hz)`,()=>{
  const a=player(),b=player();b.attributes.addPerk('light_body');a.jump();b.jump();near(a.velocity.y,b.velocity.y);
  let highA=5,highB=5;
  for(let i=0;i<hz;i++){a.update(1/hz,idle);b.update(1/hz,idle);highA=Math.max(highA,a.position.y);highB=Math.max(highB,b.position.y);}
  assert.ok(highB>highA+.4);assert.ok(b.velocity.y>a.velocity.y);assert.ok(b.position.y>a.position.y);
  const p=player();p.grounded=false;p.velocity.y=-2;
  for(const [add,g] of [[true,13.5],[false,18]]){
    const pos=p.position.clone(),vel=p.velocity.clone();
    add?p.attributes.addPerk('light_body'):p.attributes.removePerk('light_body');
    assert.deepEqual(p.position,pos);assert.deepEqual(p.velocity,vel);p.update(1/hz,idle);near(p.velocity.y,vel.y-g/hz);
  }
  assert.equal(vm.runInContext('G',ctx),18);
});
test('Corpo leve não modifica mola de escalada nem dano letal existente',()=>{
  const a=player(),b=player();b.attributes.addPerk('light_body');
  for(const p of [a,b]){hold(p);p.update(.05,idle);}assert.deepEqual(a.position,b.position);assert.deepEqual(a.velocity,b.velocity);
  const p=player();p.attributes.addPerk('light_body');p.grounded=false;p.position.y=5.1;p.velocity.y=-20;
  p.world.platforms=[{minX:-2,maxX:2,minZ:-2,maxZ:2,top:5,bottom:4}];p.update(.01,idle);assert.equal(p.deathReason,'fall');
});
test('captura e escorregão não recebem multiplicador de pegada',()=>{
  for(const speed of [-6,-13]){
    const a=player(),b=player();b.attributes.addPerk('economical_grip');
    for(const p of [a,b]){
      const next=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.2));next.position.set(0,6.7,0);next.userData.grab=true;next.updateMatrixWorld();p.world.raycastTargets=[next];
      p.eyePos(p.camera.position);p.camera.lookAt(next.position);p.camera.updateMatrixWorld();p.velocity.y=speed;p.setGrab(0,true);
    }
    near(a.leftHand.stamina,speed===-6?95.6:75);near(b.leftHand.stamina,a.leftHand.stamina);
    assert.equal(a.leftHand.inContact,speed===-6);assert.equal(b.leftHand.inContact,a.leftHand.inContact);
  }
});

// Ciclo real de partida: efeitos externos de tela/áudio/timer são fronteiras do fixture.
const {Game,ScoreSystem,TimerSystem,CheckpointSystem,UIManager,Inventory}=vm.runInContext('({Game,ScoreSystem,TimerSystem,CheckpointSystem,UIManager,Inventory})',ctx);
function game(p){
  const g=Object.create(Game.prototype), scheduled=[];
  ctx.setTimeout=fn=>{scheduled.push(fn);};
  Object.assign(g,{player:p,state:'play',timer:new TimerSystem(),score:new ScoreSystem(),playerName:'Teste',keys:{},
    ui:{$:()=>({}),hideNote(){},setPack(){},clearMsg(){},setHUD(){},showResult(){},show(){},hideScreens(){}},
    audio:{siren(){},chime(){},boom(){},setRumble(){}},items:{use(){},releaseUse(){}},stations:{reset(){},isUsed:()=>false},
    vr:{active:false,closeMenu(){},busy:false},renderer:{domElement:{}},scheduled});
  g.timer.start();return g;
}
test('reset limpa perks mantendo componente, enche mãos e zera métricas',()=>{
  const p=player(),other=player();p.attributes.addPerk('light_body');p.attributes.addPerk('powerful_launch');other.attributes.addPerk('light_body');
  const component=p.attributes;p.stats.slips=2;p.leftHand.stamina=4;
  for(let i=0;i<2;i++){
    p.reset();assert.equal(p.attributes,component);assert.equal(p.attributes.activePerks.length,0);assert.equal(p.attributes.effective.gravity,18);assert.equal(p.maxStamina,100);
    assert.equal(p.stamina,100);assert.equal(p.stats.slips,0);
  }
  assert.equal(other.maxStamina,60);assert.equal(player().attributes.activePerks.length,0);assert.equal(component.addPerk('light_body'),true);
});
test('morte limpa antes do evento, preserva métricas e só registra uma queda',()=>{
  const p=player();p.attributes.addPerk('light_body');p.stats.slips=2;p.stats.pillsUsed=1;p.stats.pitonsUsed=3;let events=0;
  p.on('death',()=>{events++;assert.equal(p.attributes.activePerks.length,0);assert.equal(p.maxStamina,100);assert.equal(p.attributes.effective.gravity,18);});
  p.die('fall');p.die('fall');assert.equal(events,1);assert.equal(p.stats.falls,1);assert.equal(p.stats.slips,2);assert.equal(p.stats.pillsUsed,1);assert.equal(p.stats.pitonsUsed,3);
});
for(const result of ['finish','fall'])test(`endRun ${result} limpa sem alterar pontuação nem finalizar duas vezes`,()=>{
  const p=player();p.maxHeightReached=42;p.stats.slips=2;p.stats.pillsUsed=1;p.stats.pitonsUsed=3;p.attributes.addPerk('light_body');
  const g=game(p);g.timer.update(100);g.score.onCheckpoint({id:'cp',bonus:200});
  const control=new ScoreSystem();control.onCheckpoint({id:'cp',bonus:200});const want=control.finalize(result,100,p);
  g.endRun(result);assert.deepEqual(g.lastRun.breakdown,want);assert.equal(p.attributes.activePerks.length,0);assert.equal(p.maxStamina,100);
  assert.equal(p.attributes.effective.gravity,18);assert.equal(p.stats.slips,2);assert.equal(p.leftHand.stamina,60);
  const run=g.lastRun;g.endRun(result);assert.equal(g.lastRun,run);assert.equal(g.scheduled.length,1);g.scheduled[0]();assert.equal(g.state,'result');
});
test('morte seguida de endRun não duplica métricas',()=>{
  const p=player(),g=game(p);p.attributes.addPerk('light_body');p.on('death',reason=>g.endRun(reason));p.die('fall');p.die('fall');g.endRun('fall');
  assert.equal(p.stats.falls,1);assert.equal(g.scheduled.length,1);assert.equal(p.attributes.activePerks.length,0);
});
test('checkpoint, pausa e inventário preservam perks',()=>{
  const p=player();p.attributes.addPerk('light_body');p.world.checkpoints=[{id:'cp',position:p.position.clone(),radius:1,bonus:200}];
  const checkpoints=new CheckpointSystem(p.world);assert.equal(checkpoints.update(p).justCollected.id,'cp');
  const g=game(p);g.pause();assert.equal(g.state,'paused');assert.equal(p.attributes.hasPerk('light_body'),true);g.resume();assert.equal(g.state,'play');
  hold(p);g.openInventory();assert.equal(g.state,'inventory');assert.equal(p.leftHand.inContact,true);g.closeInventory();assert.equal(g.state,'play');
  assert.equal(p.attributes.hasPerk('light_body'),true);assert.equal(p.maxStamina,60);
});
test('snapshot contém somente métricas independentes',()=>{
  const p=player();p.stats.slips=2;p.stats.pillsUsed=3;p.stats.pitonsUsed=4;p.attributes.addPerk('light_body');
  const snapshot=p.stats.snapshot();assert.equal('modifiers' in snapshot,false);assert.equal('perks' in snapshot,false);
  assert.equal(snapshot.slips,2);assert.equal(snapshot.pillsUsed,3);assert.equal(snapshot.pitonsUsed,4);snapshot.slips=90;assert.equal(p.stats.slips,2);
});
function element(){
  const classes=new Set();return {style:{},dataset:{},attrs:{},children:[],textContent:'',
    appendChild(child){this.children.push(child);},setAttribute(k,v){this.attrs[k]=v;},
    classList:{add(k){classes.add(k);},toggle(k,on){if(on)classes.add(k);else classes.delete(k);},remove(k){classes.delete(k);},contains:k=>classes.has(k)}};
}
test('HUD e mãos usam capacidade efetiva mantendo alertas absolutos',()=>{
  const p=player();p.attributes.addPerk('light_body');hold(p);hold(p,1);p.rightHand.stamina=30;
  const ui=Object.create(UIManager.prototype),els={};ui.$=id=>els[id]||(els[id]=element());
  ui.handEls=[{el:element(),rect:element()},{el:element(),rect:element()}];ctx.document={createElement:element};
  const items={inv:new Inventory(),sel:-1,phase:'idle',equipped:null,left:{sel:-1,phase:'empty',equipped:null},isSelected:()=>false,phaseFor:()=> 'empty'};
  ui.updateHUD({time:0,score:0,massDistance:null},p, {reticle:'dot',prompt:''},items);
  near(+ui.handEls[0].rect.attrs.height,48);near(+ui.handEls[1].rect.attrs.height,24);near(+ui.handEls[1].rect.attrs.y,24);
  p.updateViewmodel();near(p.handModels[0].lastTint,0);near(p.handModels[1].lastTint,.075);
  for(const hm of p.handModels){assert.ok(Number.isFinite(hm.slack)&&hm.slack>=0&&hm.slack<=.75);assert.ok(Number.isFinite(hm.tremor)&&hm.tremor>=0&&hm.tremor<=.22);}
  p.leftHand.stamina=14;ui.updateHUD({time:0,score:0,massDistance:null},p,{reticle:'dot',prompt:''},items);
  assert.equal(ui.handEls[0].el.classList.contains('critical'),true);
});

// Regras por mão (§9.4, ajustado): item equipado não trava a puxada da outra mão; só o uso ativo que mira é conflito de entrada.
const S={sensitivity:1,invertY:false};
for(const [itemHand,holdHand] of [[0,1],[1,0]]) test(`item equipado (idle) na mão ${itemHand} não bloqueia a puxada pela mão ${holdHand}`,()=>{
  const p=player(); hold(p,holdHand); p.hands[itemHand].occupied=true;
  assert.equal(p.aimConflict,false); assert.equal(p.canPull,true);
  assert.equal(p.lockOff,true,'braço travado mantém a economia de pegada (6/s)');
  const before=p.pullIn; p.look(0,10,S); assert.ok(p.pullIn>before,'o mouse puxa');
});
test('uso ativo que mira é conflito de entrada só durante o uso (desktop); no VR a puxada segue livre',()=>{
  const p=player(); hold(p,1); p.leftHand.occupied=true; p.leftHand.aiming=true;
  assert.equal(p.aimConflict,true); assert.equal(p.canPull,false);
  const before=p.pullIn; p.look(0,10,S); assert.equal(p.pullIn,before,'o mouse mira, não puxa');
  p.leftHand.aiming=false; assert.equal(p.canPull,true,'terminou o uso: volta a puxar');
  p.leftHand.aiming=true; p.xr={}; assert.equal(p.canPull,true,'VR: a mira é do controle');
});
test('sem ferramentas: lockOff/aimConflict sempre falsos e escalada idêntica à referência anterior à mudança',()=>{
  const p=player(); const surf=new THREE.Object3D(); surf.userData.grab=true;
  p.hands.forEach((h,i)=>{ h.inContact=h.isGrabbing=true; h.surface=surf; h.normal.set(0,0,1); h.point.set(i?.25:-.25,7.57,0); });
  p.grounded=false; const out=[];
  for(let f=0;f<240;f++){
    if(f===60){ p.hands[0].isGrabbing=false; p.setGrab(0,false); }
    if(f<200) p.look(0,f%3===0?6:0,S);
    p.update(1/60,idle); assert.equal(p.lockOff,false); assert.equal(p.aimConflict,false);
    if(f%20===19) out.push([p.pull,p.pullTarget,p.hands[1].stamina,p.hands[0].stamina,p.pullFatigue,p.position.y].map(v=>+v.toFixed(9)));
  }
  const ref=[[0.311040899,0.311040899,98.565728115,98.565728115,0.012477943,5.259973378],[0.600845684,0.618756057,96.915187954,96.915187954,0.034413758,5.566246076],[0.878088222,0.878088222,95.195642774,95.195642774,0.061100301,5.839502502],[0.995448523,0.995448523,91.54357996,99.195642774,0.088191301,5.945978574],[1,1,88.173167859,100,0.108040114,5.952813936],[0.99760152,0.99760152,84.887969964,100,0.125617,5.947123588],[0.995073171,0.995073171,81.618030955,100,0.142783779,5.946774159],[1,1,78.348263702,100,0.159946276,5.94702663],[0.99736935,0.99736935,75.075937987,100,0.17717728,5.946976056],[0.994557262,0.994557262,71.801707464,100,0.194455315,5.946848004],[0.966753329,0.966753329,68.566791908,100,0.210520142,5.934653934],[0.937975981,0.937975981,65.363155008,100,0.225467724,5.907115087]];
  assert.deepEqual(JSON.parse(JSON.stringify(out)),ref);
});
test('item na esquerda: a direita agarra, solta e salta normalmente; a esquerda não agarra',()=>{
  const p=player(); p.leftHand.occupied=true;
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.2)); wall.position.set(0,6.4,0); wall.userData.grab=true; wall.updateMatrixWorld(); p.world.raycastTargets=[wall];
  const aim=()=>{ p.eyePos(p.camera.position); p.camera.lookAt(wall.position); p.camera.updateMatrixWorld(); };
  aim(); p.setGrab(0,true); assert.equal(p.leftHand.inContact,false,'mão com item não agarra');
  p.setGrab(0,false); aim(); p.setGrab(1,true); assert.equal(p.rightHand.inContact,true,'direita agarra');
  assert.equal(p.rightHand.anchor,'hand');
  p.setGrab(1,false); assert.equal(p.rightHand.inContact,false); assert.equal(p.rightHand.anchor,null);
  aim(); p.setGrab(1,true); assert.equal(p.rightHand.inContact,true);
  p.jump(); assert.equal(p.rightHand.inContact,false,'salto agarrado sai da pegada direita'); assert.ok(p.velocity.y>0);
});
test('braço travado: item na outra mão mantém o dreno 6/s de antes, com a puxada livre',()=>{
  const a=player(),b=player(); hold(a,1); hold(b,1); b.leftHand.occupied=true;
  a.update(.5,idle); b.update(.5,idle);
  near(100-a.rightHand.stamina,4.5,1e-6); near(100-b.rightHand.stamina,3,1e-6); assert.equal(b.canPull,true);
});
test('anchor segue o contato: hand ao agarrar; null ao soltar, em releaseAll e em reset',()=>{
  const p=player(); const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.2)); wall.position.set(0,6.4,0); wall.userData.grab=true; wall.updateMatrixWorld(); p.world.raycastTargets=[wall];
  p.eyePos(p.camera.position); p.camera.lookAt(wall.position); p.camera.updateMatrixWorld();
  assert.equal(p.leftHand.anchor,null); p.setGrab(0,true); assert.equal(p.leftHand.anchor,'hand');
  p.releaseAll(); assert.equal(p.leftHand.anchor,null);
  p.setGrab(0,true); assert.equal(p.leftHand.anchor,'hand'); p.reset(); assert.equal(p.leftHand.anchor,null); assert.equal(p.leftHand.aiming,false);
});
test('VR: A esquerdo guarda as mãos livres (holsterAll), não só a direita',()=>{
  const VRPlayer=vm.runInContext('VRPlayer',ctx), vr=Object.create(VRPlayer.prototype), calls=[];
  const p=player();
  Object.assign(vr,{camera:p.camera,g:{player:p,settings:{data:{}},items:{equippedFor:()=>null,useHand(){},holster(){calls.push('right');},holsterAll(){calls.push('all');}}},
    input:{x:0,y:0},rigYaw:0,anchor:new THREE.Vector3(),ctrl:[null,null],keyHover:[null,null],
    _frame(){},_lookInput(){return 0;},
    _readAll(){return [{d:{a:true},u:{}},{d:{},u:{}}];}});
  vr.update(1/60); assert.deepEqual(calls,['all']);
});

console.log(`\n${total} testes; falhas: ${fails}`); process.exitCode=fails?1:0;
