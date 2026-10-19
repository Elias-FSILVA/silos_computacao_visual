'use strict';
const assert=require('node:assert/strict');
let total=0,bad=0;function test(name,f,needsFlight=true){total++;try{const h=require('./_debug_harness')();if(needsFlight)assert.equal(typeof h.nav.setNoclip,'function','voo ausente');f(h);console.log('OK',name);}catch(e){bad++;console.error('FAIL',name,e.stack);}}
const pose=h=>h.p.position.clone(),v=(h,x,y,z)=>new h.THREE.Vector3(x,y,z);
const resources=h=>JSON.stringify({hands:h.p.hands.map(a=>[a.stamina,a.exhausted,a.cooldown]),fatigue:[h.p.pullFatigue,h.p.fatigueFx,h.p.restT,h.p.fatigueWarned],stats:h.p.stats,perks:h.p.attributes.activePerks,inv:h.g.items.inv,max:h.p.maxHeightReached});
const snapshot=h=>JSON.stringify({resources:resources(h),timer:[h.g.timer.elapsedTime,h.g.timer.running,h.g.timer.finished],mass:{y:h.mass.y,active:h.mass.active,caught:h.mass.caught,speed:h.mass.speed,scale:h.mass.scale,frozen:h.mass.frozen,hold:h.mass.hold,riseTime:h.mass.riseTime},puzzles:h.g.puzzles.puzzles.map(a=>[a.id,a.phase,a.t,a.timeRemaining,a.solved,a.active,a.completedActions,a.logic&&{stage:a.logic.stage,entered:a.logic.entered}]),elevator:[h.world.elevator.state,h.world.elevator.y,h.world.elevator.t,h.world.elevator.pd.top],doors:Object.values(h.world.puzzleRooms).flatMap(r=>Object.values(r.refs&&r.refs.doors||{})).concat(Object.values(h.world.elevator.doors)).map(d=>[d.open,d.k,d.moving,d.mesh.position.toArray(),d.pd&&[d.pd.bottom,d.pd.top]]),fans:h.world.fans.map(a=>[a.phase,a.time,a.t,a.rot&&a.rot.rotation.toArray()]),crumbles:h.world.crumbling.map(a=>[a.userData.crumbleT,a.userData.alive,a.position.toArray()]),screen:[h.world.mazeScr.state,h.world.mazeScr.t],checkpoints:[...h.g.checkpoints.collected],score:h.g.score,guard:h.nav.guard.protectedTriggers()});
function equipAxes(h){h.g.items.inv.add('climbing_axe',2);const slot=h.g.items.inv.slots.findIndex(a=>a&&a.id==='climbing_axe');for(const side of ['left','right']){h.g.items.select(slot,side);h.settle(side==='left'?h.g.items.left:h.g.items);}const surface=h.world.grabbables.find(a=>h.G('isAxeSurface')(a));for(let i=0;i<2;i++){assert.equal(h.p.anchorAxe(i,{object:surface,distance:.2,point:surface.getWorldPosition(new h.THREE.Vector3()),face:{normal:v(h,1,0,0)}}).ok,true);(i===0?h.g.items.left:h.g.items).phase='anchored';}}
function seed(h){h.p.attributes.addPerk('quick_recovery');h.p.hands.forEach((a,i)=>{a.stamina=33+i*10;a.exhausted=!!i;a.cooldown=.4;});h.p.pullFatigue=.44;h.p.fatigueFx=.31;h.p.restT=.5;}
function frame(h,dt=.02){h.wall.advance(dt*1000);h.g._loop(h.clock.now);}
function containment(h){const lamp=()=>({light:new h.THREE.PointLight(),mat:new h.THREE.MeshBasicMaterial()}),door=()=>({openY:103,closedY:100,y:100,mesh:new h.THREE.Object3D(),aabb:{bottom:98.7,top:101.3}}),room={id:'test-clock',baseY:100,zoneRoom:h.world.puzzleRooms.h1.zoneRoom,zoneDuct:{minX:6,maxX:15,minZ:-3.5,maxZ:-.1,minY:100,maxY:114},lampFlicker:lamp(),alarm:lamp(),entry:door(),exit:door(),doorTop:v(h,15,100,0),code:'123'};
  const puzzle=new (h.G('ContainmentPuzzle'))(h.g,room);h.g.puzzles.puzzles.push(puzzle);puzzle.phase='running';puzzle.active=true;puzzle.nextBoom=0;h.mass.setHold(99,.6);return puzzle;}
test('entrada pendurado/duas picaretas preserva recursos e limpa intenção sem deslocar',h=>{equipAxes(h);seed(h);h.p.velocity.set(1,-15,3);h.p.pull=.3;h.p.pullIn=4;const q=pose(h),before=resources(h);assert.equal(h.nav.setNoclip(true).ok,true);assert.equal(h.p.position.distanceTo(q),0);assert.equal(h.p.velocity.length(),0);assert.equal(h.p.isClimbing,false);assert.equal(h.g.items.phase,'idle');assert.equal(h.g.items.left.phase,'idle');assert.equal(resources(h),before);assert.equal(h.nav.noclipActive,true);assert.equal(h.nav.eligibility().assisted,true);assert.equal(h.g.timer.running,false);});
test('voo yaw-horizontal, subida/descida e diagonal 3D normalizada, boost ×4',h=>{assert.equal(h.nav.setNoclip(true).ok,true);const q=pose(h);h.p.pitch=1.3;h.p.yaw=0;h.nav.updateFlight(.05,{KeyW:true,KeyD:true,Space:true});assert.ok(Math.abs(h.p.position.distanceTo(q)-.5)<1e-12);assert.ok(h.p.position.x>q.x&&h.p.position.z<q.z&&h.p.position.y>q.y);const r=pose(h);h.nav.updateFlight(.05,{ControlRight:true,ShiftRight:true});assert.ok(Math.abs(h.p.position.y-r.y+2)<1e-12);h.p.yaw=-Math.PI/2;const s=pose(h);h.nav.updateFlight(.05,{KeyW:true});assert.ok(Math.abs(h.p.position.x-s.x-.5)<1e-12);assert.ok(Math.abs(h.p.position.y-s.y)<1e-12);});
test('voo atravessa parede/casca/limite sem dano, vento, queda nem avanço de altura',h=>{seed(h);h.p.position.set(6.8,25,0);h.p._prev.copy(h.p.position);assert.equal(h.nav.setNoclip(true).ok,true);assert.equal(h.nav.setSpeed(50).ok,true);h.p.yaw=-Math.PI/2;const before=resources(h);for(let i=0;i<40;i++)h.nav.updateFlight(.05,{KeyW:true});assert.ok(h.p.position.x>100);assert.equal(h.p.dead,false);assert.equal(resources(h),before);assert.equal(h.p.consumeNormalMotion().segments.length,0);for(const dt of [NaN,Infinity,-1]){const old=pose(h);h.nav.updateFlight(dt,{KeyW:true});assert.equal(h.p.position.distanceTo(old),0);}h.nav.updateFlight(1,{KeyW:true});assert.ok(Number.isFinite(h.p.position.x));});
test('look do voo respeita sensibilidade/invertY e nunca injeta puxada',h=>{assert.equal(h.nav.setNoclip(true).ok,true);h.p.canPull;const yaw=h.p.yaw,pitch=h.p.pitch;h.nav.look(100,50,{sensitivity:2,invertY:true});assert.ok(Math.abs(h.p.yaw-(yaw-.44))<1e-12);assert.ok(Math.abs(h.p.pitch-(pitch+.22))<1e-12);assert.equal(h.p.pullIn,0);});
for(const route of ['seal','commune'])test('600 frames congelam simulação real na rota '+route+' mas render/HUD/setores continuam',h=>{assert.equal(h.g.puzzles.commitRoute(route),true);assert.equal(h.nav.goto('bombas').ok,true);h.nav.guard.reset();h.nav.presence.update();h.g.puzzles.update(.03);assert.equal(h.g.puzzles.byId('h1').phase,'inside');assert.equal(h.world.elevator.start(),true);const hold=h.world.grabbables.find(a=>a.userData.crumble);assert.ok(hold);h.world.touch(hold);assert.equal(h.world.crumbling.length,1);assert.ok(h.world.fans[0].rot);seed(h);assert.equal(h.nav.setNoclip(true).ok,true);h.g.keys={KeyW:true,Space:true};const before=snapshot(h),q=pose(h);for(let i=0;i<600;i++)frame(h,1/60);assert.equal(snapshot(h),before);assert.ok(h.p.position.distanceTo(q)>90);assert.equal(h.presentation.renders,600);assert.equal(h.presentation.hud,600);assert.equal(h.presentation.ticks,600);assert.ok(h.presentation.atmosphere>=600);assert.ok(h.g.sectors.focus.distanceTo(h.p.camera.position)<1e-9);assert.equal(h.mass.frozen,route==='seal');});
test('goto/back em voo mantêm modo, baseline e timer; off em cp não coleta parado',h=>{const q=h.nav.safety.resolve('bombas').pose;h.p.position.copy(q.position);h.nav.presence.update();h.g.puzzles.update(.01);const phase=h.g.puzzles.byId('h1').phase;assert.equal(h.nav.setNoclip(true).ok,true);assert.equal(h.nav.goto('cp6').ok,true);assert.equal(h.nav.back().ok,true);assert.equal(h.nav.noclipActive,true);assert.equal(h.g.timer.running,false);assert.equal(h.g.puzzles.byId('h1').phase,phase);const cp=h.nav.safety.resolve('cp14').pose;h.p.position.copy(cp.position);assert.equal(h.nav.setNoclip(false).ok,true);assert.equal(h.g.timer.running,true);for(let i=0;i<60;i++){h.nav.presence.update();h.g.checkpoints.update(h.p);}assert.equal(h.g.checkpoints.collected.has('cp14'),false);assert.ok(h.nav.guard.protectedTriggers().some(t=>t.id==='checkpoint:cp14'));assert.equal(h.g.puzzles.byId('h1').phase,phase);});
test('porta 90ms: 30ms consumidos + voo/console não vencem 60ms restantes',h=>{const pz=containment(h);pz.update(.01);const d=pz.room.entry,shaken=d.y;assert.ok(shaken>d.closedY);pz.update(.03);assert.equal(d.y,shaken);assert.equal(h.nav.setNoclip(true).ok,true);const before=snapshot(h);for(let i=0;i<600;i++)frame(h,1/60);assert.equal(d.y,shaken);assert.equal(snapshot(h),before);h.g.state='console';h.g.devConsoleReturnState='play';for(let i=0;i<20;i++)frame(h,.02);assert.equal(d.y,shaken);h.p.position.copy(h.nav.safety.resolve('cp6').pose.position);assert.equal(h.nav.setNoclip(false).ok,true);assert.equal(h.g.timer.running,false);h.g.state='play';h.nav.syncTimer();pz.update(.059);assert.equal(d.y,shaken);pz.update(.001);assert.equal(d.y,d.closedY);});
test('porta sem debug mantém 90ms simulados; fase breached e reset invalidam retorno',h=>{const pz=containment(h),d=pz.room.entry;pz.update(.01);const shaken=d.y;h.wall.advance(2000);assert.equal(d.y,shaken,'tempo de parede não é simulação');pz.update(.089);assert.equal(d.y,shaken);pz.update(.001);assert.equal(d.y,d.closedY);pz.nextBoom=0;pz.update(.01);assert.ok(d.y>d.closedY);pz.phase='breached';pz._setDoor(d,d.closedY+.9);pz.update(.1);assert.equal(d.y,d.closedY+.9);pz.phase='running';pz.nextBoom=0;pz.update(.01);const old=d.y;h.g.puzzles.reset();h.wall.advance(2000);assert.equal(d.y,old,'instância antiga não altera porta no reset');},false);
test('retomar após tempo de parede longo usa apenas dt do novo frame, sem catch-up',h=>{assert.equal(h.nav.setNoclip(true).ok,true);for(let i=0;i<10;i++){h.wall.advance(1000);h.g._loop(h.clock.now);}assert.equal(h.g.timer.time,0);h.p.position.copy(h.nav.safety.resolve('cp6').pose.position);assert.equal(h.nav.setNoclip(false).ok,true);frame(h,.01);assert.ok(Math.abs(h.g.timer.time-.01)<1e-12);assert.equal(h.nav.eligibility().assisted,true);});

// ---------- A6: fronteiras de entrada, overlays, lifecycle e XR ----------
function shell(h){const g=h.g,el={},calls={lock:0,request:0};const $=id=>el[id]||(el[id]={id,hidden:true,textContent:'',value:'',disabled:false,focus(){},scrollTop:0,scrollHeight:0});
  g.renderer.domElement={requestPointerLock(){calls.lock++;}};h.ctx.document.pointerLockElement=g.renderer.domElement;h.ctx.document.exitPointerLock=()=>{h.ctx.document.pointerLockElement=null;};
  Object.assign(g.ui,{$,hideScreens(){},setPack(){},hideNote(){},clearMsg(){},show(){},setHUD(){},hideStation(){},showStation(){},renderPack(){},cancelDrag(){return false;},packKey(){}});
  Object.assign(g.vr,{busy:false,closeMenu(){},showPause(){},idle(){},updatePanel(){}});Object.assign(g.audio,{setRumble(){},deny(){},holster(){},pill(){},swing(){}});
  g.settings.data.devConsoleEnabled=true;g._lockGuard=0;g.devCommandHistory=[];return {el,calls};}
const key=(h,code,o={})=>h.g._onKeyDown({code,repeat:false,target:null,preventDefault(){},...o});
function equip(h,id,side,n=2){h.g.items.inv.add(id,n);const slot=h.g.items.inv.slots.findIndex(a=>a&&a.id===id);h.g.items.select(slot,side);h.settle(side==='left'?h.g.items.left:h.g.items);}
const itemState=h=>JSON.stringify({inv:h.g.items.inv.slots,L:[h.g.items.left.equipped,h.g.items.left.phase,h.g.items.left.pending&&1],R:[h.g.items.equipped,h.g.items.phase,h.g.items.pending&&1],stam:h.p.hands.map(a=>a.stamina),grab:h.p.hands.map(a=>[a.isGrabbing,a.inContact]),v:h.p.velocity.toArray()});
test('A6 contexto: só play/paused/console sobre eles; mortos, menus e overlays recusam sem marcar nem criar run',h=>{
  const ok=['play','paused'],no=['menu','intro','result','ending','inventory','station','spectate'];
  for(const st of ok){h.g.state=st;assert.equal(h.nav.contextAllowed().ok,true,st);}
  for(const rs of ok){h.g.state='console';h.g.devConsoleReturnState=rs;assert.equal(h.nav.contextAllowed().ok,true,'console/'+rs);}
  h.g.state='console';h.g.devConsoleReturnState='menu';assert.equal(h.nav.contextAllowed().ok,false,'console/menu');
  for(const st of no){h.g.state=st;const q=pose(h),t=JSON.stringify([h.g.timer.running,h.g.timer.elapsedTime]);
    for(const r of [h.nav.goto('cp6'),h.nav.setNoclip(true),h.nav.setSpeed(20),h.nav.back()])assert.equal(r.ok,false,st);
    assert.equal(h.p.position.distanceTo(q),0);assert.equal(h.nav.noclipActive,false);assert.equal(h.nav.speed,10);assert.equal(h.nav.eligibility().assisted,false,st);assert.equal(JSON.stringify([h.g.timer.running,h.g.timer.elapsedTime]),t);assert.equal(h.g.state,st);}
  h.g.state='play';h.p.dead=true;assert.equal(h.nav.setNoclip(true).ok,false);h.p.dead=false;
  for(const set of [()=>{h.g.vr.active=true;},()=>{h.g.vr.entering=true;},()=>{h.p.xr={};}]){h.g.vr.active=h.g.vr.entering=false;h.p.xr=null;set();assert.equal(h.nav.setNoclip(true).ok,false);assert.equal(h.nav.goto('cp6').ok,false);}
  h.g.vr.active=h.g.vr.entering=false;h.p.xr=null;assert.equal(h.nav.eligibility().assisted,false);assert.equal(h.nav.backPose,null);
},false);
test('A6 on/off repetidos não repetem limpeza, captura de baseline nem marcação',h=>{let clears=0;const c=h.g.items.cancelPendingForDebug.bind(h.g.items);h.g.items.cancelPendingForDebug=()=>{clears++;c();};
  assert.equal(h.nav.setNoclip(true).ok,true);const base=h.nav._flightBaseline,reasons=h.nav.eligibility().debugReasons.join();
  for(let i=0;i<3;i++)assert.equal(h.nav.setNoclip(true).ok,true);assert.equal(clears,1);assert.equal(h.nav._flightBaseline,base);assert.equal(h.nav.eligibility().debugReasons.join(),reasons);
  h.p.position.copy(h.nav.safety.resolve('cp6').pose.position);assert.equal(h.nav.setNoclip(false).ok,true);const n=clears;for(let i=0;i<3;i++)assert.equal(h.nav.setNoclip(false).ok,true);assert.equal(clears,n);});
test('A6 XR: canEnterXR nega voo ativo; VRPlayer.enter não chama requestSession durante noclip',h=>{
  for(const f of ['js/ui/VRPanel.js','js/ui/VRMenu.js','js/ui/VRHud.js','js/player/VRPlayer.js'])h.load(f);
  let req=0;h.ctx.navigator={xr:{requestSession(){req++;return new Promise(()=>{});}}};
  const vr=Object.create(h.G('VRPlayer').prototype);Object.assign(vr,{g:h.g,active:false,entering:false});h.g.vr=Object.assign(vr,{closeMenu(){},showPause(){}});
  assert.equal(typeof h.nav.canEnterXR,'function');assert.equal(h.nav.canEnterXR(),true);
  assert.equal(h.nav.setNoclip(true).ok,true);assert.equal(h.nav.canEnterXR(),false);
  vr.enter(()=>{throw new Error('não deveria iniciar');});assert.equal(req,0);assert.equal(vr.entering,false);
  h.p.position.copy(h.nav.safety.resolve('cp6').pose.position);assert.equal(h.nav.setNoclip(false).ok,true);assert.equal(h.nav.canEnterXR(),true);vr.enter();assert.equal(req,1);});
test('A6 pontos de ação diretos durante voo: nenhum uso, coleta, custo, agarre ou pulo',h=>{shell(h);equip(h,'hammer','right');equip(h,'pills','left',3);
  assert.equal(h.nav.setNoclip(true).ok,true);assert.equal(typeof h.nav.allowsGameplayAction,'function');assert.equal(h.nav.allowsGameplayAction(),false);
  const before=itemState(h);let aims=0;const aim=h.p.aim.bind(h.p);h.p.aim=(...a)=>{aims++;return aim(...a);};
  h.g.items.useHand('right',true);h.g.items.useHand('left',true);h.g.items.quick('pills');
  assert.equal(h.g.items.consume('left'),false);assert.equal(h.g.items.strike({obj:null,hit:{object:{userData:{}}}},'right'),false);
  assert.equal(h.g.items.place({valid:true,hit:{},obj:{}},'right'),false);h.g.interact();h.g.interaction.interact(0);
  h.p.setGrab(0,true);h.p.setGrab(1,true);h.p.jump({x:1,y:1});
  for(let i=0;i<30;i++)frame(h,1/60);
  assert.equal(aims,0,'interact não mira em voo');assert.equal(itemState(h),before);});
test('A6 teclado/mouse/roda em voo: só voo, look debug e overlays; nada de ação',h=>{const {calls}=shell(h);equip(h,'hammer','right');equip(h,'pills','left',3);h.g.items.inv.add('nails',3);
  assert.equal(h.nav.setNoclip(true).ok,true);const before=itemState(h);let jumps=0,grabs=0;const j=h.p.jump.bind(h.p),gr=h.p.setGrab.bind(h.p);h.p.jump=(...a)=>{jumps++;return j(...a);};h.p.setGrab=(...a)=>{grabs++;return gr(...a);};
  for(const c of ['Space','KeyF','KeyQ','KeyX','Digit1','Digit2','Digit3','Digit4'])key(h,c);
  assert.equal(h.g.keys.Space,true,'Space sobe o voo');assert.equal(jumps,0);
  for(const b of [0,2]){h.g._onMouseDown({button:b});h.g._onMouseUp({button:b});}assert.equal(grabs,0);assert.equal(Object.values(h.g.gameBtn).filter(Boolean).length,0);
  h.g._onWheel({deltaY:100});h.g._onWheel({deltaY:-100});
  h.p.hands[0].inContact=true;h.p.hands[0].isGrabbing=true;const yaw=h.p.yaw;h.g._onMouseMove({movementX:50,movementY:80});assert.notEqual(h.p.yaw,yaw);assert.equal(h.p.pullIn,0,'look debug sem puxada');h.p.hands[0].inContact=h.p.hands[0].isGrabbing=false;
  assert.equal(itemState(h),before);
  h.ctx.document.pointerLockElement=null;h.g._onMouseDown({button:0});assert.equal(calls.lock,1,'clique destravado só recaptura');assert.equal(Object.values(h.g.gameBtn).filter(Boolean).length,0);
  h.ctx.document.pointerLockElement=h.g.renderer.domElement;key(h,'KeyL');assert.notEqual(h.g.flashOn,null,'lanterna segue disponível');
  key(h,'Tab');assert.equal(h.g.state,'inventory');assert.equal(h.nav.noclipActive,true);});
test('A6 overlays em voo: pause/mochila/console/estação/espectador interrompem e voltam ao voo com timer parado',h=>{shell(h);assert.equal(h.nav.setNoclip(true).ok,true);const q=pose(h);
  h.g.keys={ControlLeft:true,Space:true,KeyW:true};h.g.pause();assert.equal(h.g.state,'paused');assert.equal(Object.keys(h.g.keys).length,0);
  h.g._resuming=true;h.g._resumeNow();assert.equal(h.g.state,'play');assert.equal(h.g.timer.running,false,'resume');
  h.g.openInventory();assert.equal(h.g.state,'inventory');h.g.closeInventory();assert.equal(h.g.timer.running,false,'mochila');
  h.g.openDevConsole();assert.equal(h.g.state,'console');h.g.closeDevConsole();assert.equal(h.g.state,'play');assert.equal(h.g.timer.running,false,'console');
  h.g.state='station';h.g.stationOpen={id:'E1',sel:-1};h.g.closeStation();assert.equal(h.g.timer.running,false,'estação');
  h.g.returnFromSpectator('play');assert.equal(h.g.timer.running,false,'espectador');
  assert.equal(h.nav.noclipActive,true);assert.equal(h.nav.eligibility().assisted,true);assert.equal(h.p.position.distanceTo(q),0);
  for(let i=0;i<20;i++)frame(h,.02);assert.equal(h.g.timer.time,0);
  h.g.keys={};h.g._onBlur();assert.equal(h.g.state,'paused');h.g._resumeNow();assert.equal(h.g.timer.running,false,'blur');});
test('A6 sem voo: fechar overlays retoma o timer normalmente; run assistida com voo desligado mantém F/itens',h=>{shell(h);
  h.g.pause();h.g._resumeNow();assert.equal(h.g.timer.running,true);h.g.openInventory();h.g.closeInventory();assert.equal(h.g.timer.running,true);
  h.g.openDevConsole();h.g.closeDevConsole();assert.equal(h.g.timer.running,true);h.g.state='station';h.g.stationOpen={id:'E1',sel:-1};h.g.closeStation();assert.equal(h.g.timer.running,true);
  assert.equal(h.nav.goto('cp6').ok,true);assert.equal(h.nav.allowsGameplayAction(),true);equip(h,'pills','left',3);const n=h.g.items.inv.count('pills');key(h,'KeyQ');assert.equal(h.g.items.inv.count('pills'),n-1);
  let aims=0;const aim=h.p.aim.bind(h.p);h.p.aim=(...a)=>{aims++;return aim(...a);};key(h,'KeyF');assert.equal(aims,1);},false);
test('A6 reset limpa modo, retorno, guardas, motivos, speed e bloqueio do Player',h=>{assert.equal(h.nav.goto('cp6').ok,true);assert.equal(h.nav.setSpeed(33).ok,true);assert.equal(h.nav.setNoclip(true).ok,true);assert.equal(h.p.debugFrozen,true);
  h.nav.reset();assert.equal(h.nav.noclipActive,false);assert.equal(h.nav.speed,10);assert.equal(h.nav.backPose,null);assert.equal(h.nav.eligibility().assisted,false);assert.equal(h.nav.eligibility().debugReasons.length,0);assert.equal(h.nav.guard.protectedTriggers().length,0);assert.equal(h.p.debugFrozen,false);});
test('A-final M-3: abrir mochila limpa teclas presas como pausa/console',h=>{shell(h);h.g.state='play';h.g.keys={KeyW:true,Space:true};h.g.openInventory();assert.equal(h.g.state,'inventory');assert.equal(Object.keys(h.g.keys).length,0);},false);
test('A-final M-4: mouseup em voo não solta/age e esvazia botões',h=>{shell(h);assert.equal(h.nav.setNoclip(true).ok,true);let grabs=0,uses=0;h.p.setGrab=()=>{grabs++;};h.g.items.useHand=()=>{uses++;};h.g.gameBtn={0:true,2:true};h.g._onMouseUp({button:0});h.g._onMouseUp({button:2});assert.equal(grabs+uses,0);assert.equal(Object.values(h.g.gameBtn).filter(Boolean).length,0);});

// Decisão do usuário (2026-10-18): noclip estilo CS/Half-Life — `noclip off` desliga NO LUGAR em qualquer posição
// (ar, fora do mapa, dentro de parede, perigo). Sem teleporte nem recusa; a física normal retoma dali (pode cair/morrer).
const COORDS=/\(-?\d+\.\d\d, -?\d+\.\d\d, -?\d+\.\d\d\)/;
test('estilo CS: off desliga no lugar em qualquer posição, sem teleporte nem recusa',h=>{
  assert.equal(h.nav.goto('cp6').ok,true);const back=JSON.stringify(h.nav.backPose),cp6=h.nav.safety.resolve('cp6').pose.position;
  const w=h.world,fan=w.fans[0];
  const cases=[['piso',()=>h.p.position.copy(cp6)],['ar 40 m',()=>h.p.position.copy(cp6).add(v(h,0,40,0))],['ar y=99',()=>h.p.position.set(0,99,0)],
    ['fora do mapa',()=>h.p.position.set(h.G('SILO_R')+30,50,-h.G('SILO_R')-30)],['abaixo do mapa',()=>h.p.position.set(0,-20,0)],
    ['dentro de parede',()=>{w.platforms.push({minX:-.1,maxX:.1,minZ:-1,maxZ:1,bottom:0,top:3});h.p.position.set(.05,0,0);}],
    ['ventilador',()=>h.p.position.copy(fan.pos)],['massa',()=>{h.p.position.copy(cp6);h.mass.active=true;h.mass.y=200;}]];
  for(const [name,set] of cases){
    h.mass.active=false;assert.equal(h.nav.setNoclip(true).ok,true,name);set();h.p._prev.copy(h.p.position);h.p.velocity.set(0,-30,0);
    const q=pose(h),before=resources(h),r=h.nav.setNoclip(false);
    assert.equal(r.ok,true,name+': '+r.message);assert.ok(!r.fallback,name+' sem fallback');
    assert.equal(h.nav.noclipActive,false,name);assert.equal(h.p.debugFrozen,false,name);
    assert.equal(h.p.position.distanceTo(q),0,name+': nenhum teleporte');assert.equal(h.p.velocity.length(),0,name+': velocidade zerada');
    assert.equal(h.g.timer.running,true,name+': timer retoma');assert.equal(resources(h),before,name+': recursos intactos');
    assert.equal(JSON.stringify(h.nav.backPose),back,name+': retorno não consumido');assert.equal(h.nav.eligibility().competitiveEligible,false,name);
    assert.match(r.message,COORDS,name);}
});
test('estilo CS: off avisa o risco da posição sem recusar',h=>{
  const cp6=()=>{h.p.position.copy(h.nav.safety.resolve('cp6').pose.position);};
  h.p.position.set(0,0,0);assert.equal(h.nav.setNoclip(true).ok,true);let r=h.nav.setNoclip(false);assert.equal(r.ok,true);assert.doesNotMatch(r.message,/Aviso/,'piso: sem aviso');
  assert.equal(h.nav.setNoclip(true).ok,true);h.p.position.set(0,5,0);r=h.nav.setNoclip(false);assert.equal(r.ok,true);assert.match(r.message,/Aviso: Sem apoio/);
  assert.equal(h.nav.setNoclip(true).ok,true);h.world.platforms.push({minX:-.1,maxX:.1,minZ:-1,maxZ:1,bottom:0,top:3});h.p.position.set(.05,0,0);r=h.nav.setNoclip(false);assert.equal(r.ok,true);assert.match(r.message,/Aviso: Corpo intersecta/);
});
test('estilo CS: off no ar retoma a física normal e o corpo cai até o piso',h=>{
  h.p.position.set(0,0,0);h.p._prev.copy(h.p.position);seed(h);assert.equal(h.nav.setNoclip(true).ok,true);
  h.p.position.set(1.5,2,0);assert.equal(h.nav.setNoclip(false).ok,true);let minY=2;
  for(let i=0;i<120;i++){frame(h);minY=Math.min(minY,h.p.position.y);}
  assert.ok(minY<1,'caiu: '+minY);assert.ok(Math.abs(h.p.position.y)<=1e-3,'pousou no piso: '+h.p.position.y);assert.equal(h.p.dead,false,'2 m não mata');
});
test('estilo CS: off de grande altura usa a física normal (queda letal conta)',h=>{
  h.p.position.set(0,0,0);assert.equal(h.nav.setNoclip(true).ok,true);h.p.position.set(1.5,30,0);assert.equal(h.nav.setNoclip(false).ok,true);
  let ended=null;h.g.endRun=r=>{ended=r;h.g.state='ending';};// harness sem stations/UI de resultado
  for(let i=0;i<200&&!h.p.dead;i++)frame(h);frame(h);assert.equal(h.p.dead,true);assert.equal(h.p.deathReason,'fall');assert.ok(ended,'run encerrada pela física normal');
});
test('estilo CS: off dentro de parede ou fora do mapa não gera NaN nem quebra o loop',h=>{
  for(const set of [()=>{h.world.platforms.push({minX:-.1,maxX:.1,minZ:-1,maxZ:1,bottom:0,top:3});h.p.position.set(.05,1,0);},()=>h.p.position.set(h.G('SILO_R')+30,1,h.G('SILO_R')+30)]){
    h.p.dead=false;h.g.state='play';assert.equal(h.nav.setNoclip(true).ok,true);set();assert.equal(h.nav.setNoclip(false).ok,true);
    for(let i=0;i<120;i++){frame(h);const q=h.p.position;assert.ok([q.x,q.y,q.z,h.p.velocity.x,h.p.velocity.y,h.p.velocity.z].every(Number.isFinite),'finito');}}
});
console.log(`${total} testes; falhas: ${bad}`);process.exitCode=bad?1:0;
