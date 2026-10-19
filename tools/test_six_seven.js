'use strict';
// Real Game/Player/World/ItemSystem and Three matrices; only presentation/browser APIs are doubles.
const assert=require('node:assert/strict'),fs=require('node:fs');
let total=0,bad=0;
function build(){
  const h=require('./_debug_harness')(),{g,p}=h,els={};
  const el=id=>els[id]||(els[id]={hidden:true,textContent:'',focus(){},classList:{add(){},remove(){},toggle(){}},style:{}});
  Object.assign(g.ui,{$:el,hideNote(){},packKey(){},setPack(){},clearMsg(){},setHUD(){},show(){},hideScreens(){},resetPack(){},showStation(){},hideStation(){},renderPack(){},showResult(){}});
  Object.assign(g.audio,{siren(){},chime(){},boom(){},init(){},silence(){},setHum(){},setTension(){}});
  Object.assign(g.vr,{closeMenu(){},showResult(){},recenter(){}});
  g.atmosphere.reset=()=>{};g.lock=()=>{};g.unlock=()=>{};g.canLock=()=>false;g.locked=()=>true;
  g.spectator={key(){}};g.settings.data.devConsoleEnabled=true;
  h.load('js/systems/PerkStations.js');g.stations=new (h.G('PerkStations'))(p.attributes);
  h.load('js/ui/DevConsole.js');
  // Explicit load makes missing implementation a visible RED, not a skipped test.
  if(fs.existsSync('js/player/SixSeven.js')) h.load('js/player/SixSeven.js');
  const Six=h.G('typeof SixSeven === "undefined" ? null : SixSeven');
  assert.ok(Six,'SixSeven controller missing');
  const s=g.sixSeven=new Six(g);
  const frame=(dt=1/60)=>{h.wall.advance(dt*1000);g._loop(h.clock.now);};
  const key=(code,extra={})=>g._onKeyDown({code,repeat:false,preventDefault(){},...extra});
  const run=c=>h.G('DevConsole').execute(c,g);
  frame();return {h,g,p,s,els,frame,key,run,Six};
}
function test(n,f){total++;try{f(build());console.log('OK',n);}catch(e){bad++;console.error('FAIL',n,'-',e.stack.split('\n').slice(0,3).join(' | '));}}
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const physical=p=>JSON.stringify({pos:p.position.toArray(),vel:p.velocity.toArray(),stats:p.stats,health:p.health.snapshot(),attributes:p.attributes.effective,hands:p.hands.map(h=>({occupied:h.occupied,inContact:h.inContact,anchor:h.anchor,stamina:h.stamina,pull:h.pull}))});
test('gesture lasts 2.6 s; three opposing alternations, smooth envelope',({s,Six})=>{
  assert.ok(s.start().ok);assert.equal(s.active,true);
  near(Six.sample(0,0).weight,0);near(Six.sample(2.6,0).weight,0);
  for(let k=0;k<3;k++){
    const hi=.4+(k+.25)*.6,lo=.4+(k+.75)*.6;
    const l=Six.sample(hi,0),r=Six.sample(hi,1);
    assert.ok(l.pos.y-r.pos.y>.09,'subtle but recognizable opposite height');
    assert.ok(Six.sample(lo,1).pos.y-Six.sample(lo,0).pos.y>.09);
    near(l.pos.x,-r.pos.x);near(l.base[2],-r.base[2]);
  }
  for(let i=0;i<155;i++)s.update(1/60);assert.equal(s.active,true);
  s.update(1/60+.001);assert.equal(s.active,false);
});
test('overlay has palms up, mirrors orientation, keeps HP/tremor and no physical writes',({h,p,s,frame})=>{
  p.health.set(25);for(let i=0;i<20;i++)frame();
  const before=physical(p);assert.ok(s.start().ok);s.update(.55);for(let i=0;i<30;i++){h.clock.now+=1000/60;p.applyCamera();p.updateViewmodel();}
  assert.equal(physical(p),before);
  const palms=p.handModels.map(hm=>{hm.root.updateMatrixWorld(true);return new h.THREE.Vector3(0,-1,0).transformDirection(hm.base.matrixWorld);});
  assert.ok(palms.every(v=>v.y>.7),'palms face up, not climbing');
  p.handModels.forEach(hm=>{near(hm.mat.userData.wear.uWear.value,1);near(hm.hurtTremor,h.G('HandWear').CRITICAL_TREMOR);});
  assert.notEqual(p.handModels[0].root.position.y,p.handModels[1].root.position.y);
});
test('normal pose restored smoothly on end, immediately on action; no stale wrist/base',({h,p,s,frame})=>{
  assert.ok(s.start().ok);for(let i=0;i<70;i++)frame();s.clear();h.clock.now+=16;p.updateViewmodel();
  p.handModels.forEach(hm=>{near(hm.base.rotation.z,0);near(hm.wrist.rotation.z,0);});
  assert.ok(s.start().ok);for(let i=0;i<190;i++)frame();assert.equal(s.active,false);
  p.handModels.forEach(hm=>{near(hm.base.rotation.z,0);near(hm.wrist.rotation.z,0);});
});
test('keyboard deadline inclusive, repeat ignored, no retroactive start',({h,key,s,frame})=>{
  key('Digit6');h.wall.advance(1000);key('Digit7');assert.equal(s.active,true);
  s.clear();key('Digit6');h.wall.advance(1001);key('Digit7');assert.equal(s.active,false);
  key('Digit6');h.wall.advance(900);key('Digit6',{repeat:true});h.wall.advance(101);key('Digit7');assert.equal(s.active,false);
  key('Digit6',{repeat:true});key('Digit7');assert.equal(s.active,false);
  key('Digit6');key('Digit7',{repeat:true});assert.equal(s.active,false);key('Digit7');assert.equal(s.active,true);
});
test('not recognized in text fields, contenteditable, overlays, VR or modifier shortcuts',({g,s,key})=>{
  for(const target of [{tagName:'INPUT',type:'text'},{tagName:'INPUT',type:'number'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true}]){
    key('Digit6',{target});key('Digit7');assert.equal(s.active,false);
    key('Digit6');key('Digit7',{target});key('Digit7');assert.equal(s.active,false);
  }
  for(const extra of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true}]){key('Digit6',extra);key('Digit7');assert.equal(s.active,false);}
  for(const state of ['menu','paused','inventory','station','ending','intro','spectate']){g.state=state;key('Digit6');g.state='play';key('Digit7');assert.equal(s.active,false);}
  g.vr.active=true;key('Digit6');g.vr.active=false;key('Digit7');assert.equal(s.active,false);
});
test('eligibility blocks hanging, items, transitions, mantle, noclip and VR, not movement/support',({g,p,s,h})=>{
  const sp=p.position.clone();
  const rejected=(setup,undo)=>{setup();const r=s.start();assert.equal(r.ok,false,r.reason);assert.equal(s.active,false);assert.ok(r.reason);undo();};
  rejected(()=>p.dead=true,()=>p.dead=false);
  rejected(()=>p.hands[0].inContact=true,()=>p.hands[0].inContact=false);
  rejected(()=>p.hands[1].isGrabbing=true,()=>p.hands[1].isGrabbing=false);
  rejected(()=>p.hands[1].occupied=true,()=>p.hands[1].occupied=false);
  rejected(()=>g.items.left.phase='equipping',()=>g.items.left.phase='empty');
  rejected(()=>g.items.equipped='hammer',()=>g.items.equipped=null);
  rejected(()=>p.mantle={},()=>p.mantle=null);
  rejected(()=>p.press[0]={t:0},()=>p.press[0]=null);
  rejected(()=>g.debugNavigation.noclipActive=true,()=>g.debugNavigation.noclipActive=false);
  rejected(()=>g.vr.entering=true,()=>g.vr.entering=false);
  rejected(()=>p.xr={},()=>p.xr=null);
  assert.ok(s.start().ok,'safe standing accepted again');
});
test('actions cancel before handler and keep their original behavior',({g,p,s,key,h})=>{
  const check=(act,verify)=>{s.clear();g.keys={};g.gameBtn={};p.reset();const r=s.start();assert.ok(r.ok,r.reason);act();assert.equal(s.active,false);verify();};
  check(()=>g._onMouseDown({button:0}),()=>assert.equal(p.hands[0].isGrabbing,true));
  let called=0;g.interaction.interact=()=>{called++;};check(()=>key('KeyF'),()=>assert.equal(called,1));
  g.items.inv.add('hammer',1);g.items.inv.bind(0,'hammer');
  check(()=>key('Digit1'),()=>assert.equal(g.items.left.equipped,'hammer'));
});
test('direct player/item APIs cancel too; picareta never overlapped',({g,p,s,h})=>{
  p.reset();assert.ok(s.start().ok);p.setGrab(1,true);assert.equal(s.active,false);assert.equal(p.hands[1].isGrabbing,true);
  p.reset();assert.ok(s.start().ok);p.pressButton();assert.equal(s.active,false);
  p.reset();g.items.inv.add('climbing_axe',1);const i=g.items.inv.slotOf('climbing_axe');assert.ok(s.start().ok);g.items.select(i,'right');assert.equal(s.active,false);assert.equal(g.items.equipped,'climbing_axe');
  assert.equal(s.start().ok,false);g.items.releaseUse();assert.equal(s.active,false);
});
test('state transitions, blur, death, reset and teleport clear gesture and sequence',({g,p,s,key,frame})=>{
  const actions=[()=>g.pause(),()=>g.openInventory(),()=>g.openStation('E1'),()=>g.openDevConsole(),()=>g._onBlur(),()=>p.die('mass'),()=>p.reset(),()=>g.debugNavigation.goto('cp6')];
  for(const action of actions){g.resetRun();g.state='play';frame();key('Digit6');action();assert.equal(s.active,false);assert.equal(s.first,null,'partial sequence cleared');g.state='play';key('Digit7');assert.equal(s.active,false);}
  g.resetRun();g.state='play';frame();assert.ok(s.start().ok);g.pause();assert.equal(s.active,false);
  g._resumeNow();frame();assert.ok(s.start().ok);p.position.y+=.5;frame();assert.equal(s.active,true,'loss of support no longer cancels');
});
test('console queues one execution on close, never closes itself or assists, absent help',({g,p,s,run,frame})=>{
  const before=g.debugNavigation.eligibility();g.openDevConsole();assert.match(run('67'),/fechar/i);assert.equal(g.state,'console');assert.equal(s.active,false);
  run('67');assert.equal(s.pending,true);g.closeDevConsole();assert.equal(s.pending,false);assert.equal(s.active,true);
  assert.deepEqual(g.debugNavigation.eligibility(),before);for(let i=0;i<190;i++)frame();assert.equal(s.active,false);g.openDevConsole();g.closeDevConsole();assert.equal(s.active,false,'no second run');
  assert.doesNotMatch(run('help'),/\b67\b|six.?seven/i);assert.match(run('67 extra'),/inválido|uso/i);
});
test('console revalidates, reports reason discreetly and drops request, no delayed start',({g,p,s,run,frame})=>{
  g.openDevConsole();run('67');p.hands[0].isGrabbing=true;g.closeDevConsole();assert.equal(s.active,false);assert.equal(s.pending,false);assert.match(g.ui.messages.at(-1),/mãos livres/i);p.hands[0].isGrabbing=false;
  p.velocity.set(0,0,0);frame();assert.equal(s.active,false);
  g.openDevConsole();run('67');g.debugNavigation.goto('cp6');assert.equal(s.pending,false,'teleport clears queue immediately');g.closeDevConsole();assert.equal(s.active,false,'teleport invalidates queue');
  g.state='menu';g.openDevConsole();assert.match(run('67'),/partida|jogo/i);assert.equal(s.pending,false);
});
test('world/timer/hazards and physics continue identically, HP not healed',({g,p,s,frame,h})=>{
  const other=build();p.health.set(50);other.p.health.set(50);assert.ok(s.start().ok);
  const start=g.timer.time;for(let i=0;i<100;i++){frame();other.frame();}
  assert.ok(g.timer.time>start+1);assert.equal(physical(p),physical(other.p));
  g.mass.active=true;g.mass.y=p.position.y+2;frame();assert.equal(p.dead,true);assert.equal(s.active,false);assert.equal(p.health.value,0);
});
test('overlay transitions restore visuals immediately; finish also cancels',({g,p,s,frame})=>{
  const begin=()=>{g.resetRun();g.state='play';frame();assert.ok(s.start().ok);for(let i=0;i<50;i++)frame();assert.ok(p.handModels[0].base.quaternion.angleTo(new p.camera.quaternion.constructor())>2);};
  for(const action of [()=>g.pause(),()=>g.openInventory(),()=>g.openStation('E1'),()=>g.openDevConsole()]){
    begin();action();assert.equal(s.active,false);p.handModels.forEach(hm=>{near(hm.base.rotation.x,0);near(hm.base.rotation.y,0);near(hm.base.rotation.z,0);near(hm.wrist.rotation.y,0);hm.x.forEach((x,j)=>near(x,hm.tgt[j],1e-6));});
    if(!g.ui.$('devConsole').hidden)g.closeDevConsole();
  }
  begin();g.endRun('finish');assert.equal(s.active,false);
});
test('modified movement keeps gesture; neither sequence nor gesture survives blur',({g,p,s,key,frame})=>{
  assert.ok(s.start().ok);key('KeyW',{shiftKey:true});assert.equal(s.active,true);assert.equal(g.keys.KeyW,true);
  g.keys={};s.clear();assert.ok(s.start().ok);g._onBlur();assert.equal(s.active,false);g._resumeNow();key('Digit6');g._onBlur();g._resumeNow();key('Digit7');assert.equal(s.active,false);
});
test('VR entry cancels before request; tracked viewmodel never receives gesture',({g,p,s,h,frame})=>{
  assert.ok(s.start().ok);for(let i=0;i<45;i++)frame();
  p.xr={handPose(i,pos,q){pos.set(i+10,20,30);q.identity();return true;}};
  h.clock.now+=16;p.updateViewmodel();assert.equal(s.active,false);
  p.handModels.forEach((hm,i)=>{near(hm.root.position.x,i+10);near(hm.root.position.y,20);near(hm.root.position.z,30);near(hm.base.rotation.z,0);});
  p.xr=null;assert.ok(s.start().ok);h.ctx.navigator={xr:{requestSession(){return new Promise(()=>{});}}};
  h.load('js/player/VRPlayer.js');g.vr.g=g;h.G('VRPlayer').prototype.enter.call(g.vr,()=>{});assert.equal(s.active,false);assert.equal(g.vr.entering,true);
});
test('exact 156 frames at 60 Hz complete the 2.6 s gesture',({s})=>{
  assert.ok(s.start().ok);for(let i=0;i<156;i++)s.update(1/60);assert.equal(s.active,false);
});
test('pill use cancels without consuming the action',({g,p,s,frame})=>{
  g.items.inv.add('pills',1);p.hands.forEach(h=>h.stamina=10);assert.ok(s.start().ok);g.items.quick('pills');assert.equal(s.active,false);assert.equal(g.items.inv.count('pills'),0);assert.ok(p.hands.every(h=>h.stamina===p.maxStamina));
});
test('teleport immediately clears a running gesture; XR remains rejected without tracking',({g,p,s,frame})=>{
  assert.ok(s.start().ok);for(let i=0;i<30;i++)frame();assert.ok(g.debugNavigation.goto('cp6').ok);assert.equal(s.active,false);assert.ok(p.handModels.every(h=>h.base.rotation.z===0));
  g.vr.active=true;assert.equal(s.start().ok,false);g.vr.active=false;g.vr.busy=true;assert.equal(s.start().ok,false);
});
test('HP changes during gesture still drive both hands without healing or resetting animation',({g,p,s,frame,h})=>{
  assert.ok(s.start().ok);for(let i=0;i<10;i++)frame();p.damage(75,'impact');for(let i=0;i<20;i++)frame();assert.equal(s.active,true);assert.equal(p.health.value,25);
  p.handModels.forEach(hm=>{near(hm.mat.userData.wear.uWear.value,1);near(hm.hurtTremor,h.G('HandWear').CRITICAL_TREMOR);});
  assert.ok(s.time>.45,'HP change did not restart the gesture');
});
test('palms up keep fingers forward, away from player, with relaxed thumbs',({h,p,s,frame})=>{
  const poses=JSON.stringify(h.G('HandModel').POSES);
  assert.ok(s.start().ok);for(let i=0;i<33;i++)frame();
  p.handModels.forEach((hm,i)=>{
    hm.root.updateMatrixWorld(true);
    const q=p.camera.getWorldQuaternion(new h.THREE.Quaternion()).invert();
    const forward=new h.THREE.Vector3(0,0,-1).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
    const palm=new h.THREE.Vector3(0,-1,0).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
    assert.ok(forward.z<-.8,'fingers point away from player (camera -Z), not toward player');
    for(const finger of hm.fingers){
      const knuckle=finger.root.getWorldPosition(new h.THREE.Vector3());
      const tip=finger.joints[2].localToWorld(new h.THREE.Vector3(0,0,-.015));
      const direction=tip.sub(knuckle).normalize().applyQuaternion(q);
      assert.ok(direction.z<-.5,'actual finger chain extends forward');
    }
    assert.ok(palm.y>.8,'palms still face up');
    assert.ok(hm.tgt[16]>=.5&&hm.tgt[16]<=.65,'thumb relaxed, not fully splayed');
  });
  assert.equal(JSON.stringify(h.G('HandModel').POSES),poses,'shared poses unchanged');
});
test('forward fingers stay camera-relative through all alternations and camera angles',({h,p,s})=>{
  assert.ok(s.start().ok);
  for(const [yaw,pitch] of [[0,0],[1.2,-.55],[-2,.6]]){
    p.yaw=yaw;p.pitch=pitch;p.applyCamera();
    for(let k=0;k<6;k++){
      s.time=.55+k*.3;h.clock.now+=1000/60;p.updateViewmodel();
      const q=p.camera.getWorldQuaternion(new h.THREE.Quaternion()).invert();
      for(const hm of p.handModels){
        hm.root.updateMatrixWorld(true);
        const forward=new h.THREE.Vector3(0,0,-1).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
        const palm=new h.THREE.Vector3(0,-1,0).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
        assert.ok(forward.z<-.8,'forward remains camera -Z on either hand/cycle');
        assert.ok(palm.y>.8,'palms remain camera-up');
      }
    }
  }
});
test('supination rolls thumbs upward, not under the wrist, on entry and return',({h,p,s})=>{
  assert.ok(s.start().ok);
  for(const [yaw,pitch] of [[0,0],[1.2,-.55],[-2,.6]]){
    p.yaw=yaw;p.pitch=pitch;p.applyCamera();
    for(const time of [.10,.15,.20,.25,.30,2.30,2.35,2.40,2.45,2.50]){
      s.time=time;h.clock.now+=1000/60;p.updateViewmodel();
      const q=p.camera.getWorldQuaternion(new h.THREE.Quaternion()).invert();
      p.handModels.forEach((hm,i)=>{
        hm.root.updateMatrixWorld(true);
        // Thumb side is local +X on left, -X on right. Anatomical supination lifts it.
        const thumbSide=new h.THREE.Vector3(i===0?1:-1,0,0).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
        assert.ok(thumbSide.y>.2,`thumb must pass above wrist at t=${time}, hand=${i}, y=${thumbSide.y}`);
        const f=new h.THREE.Vector3(0,0,-1).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
        assert.ok(f.z<-.8,'supination never turns fingers back toward camera');
      });
    }
  }
});
test('hands stay forward and frame lower and closer',({h,p,s,Six})=>{
  assert.ok(s.start().ok);
  for(const [yaw,pitch] of [[0,0],[1.2,-.55],[-2,.6]]){
    p.yaw=yaw;p.pitch=pitch;p.applyCamera();
    for(let k=0;k<6;k++){
      s.time=.55+k*.3;h.clock.now+=1000/60;p.updateViewmodel();
      const q=p.camera.getWorldQuaternion(new h.THREE.Quaternion()).invert();
      p.handModels.forEach((hm,i)=>{
        hm.root.updateMatrixWorld(true);
        const f=new h.THREE.Vector3(0,0,-1).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
        const palm=new h.THREE.Vector3(0,-1,0).transformDirection(hm.base.matrixWorld).applyQuaternion(q);
        assert.ok(f.z<-.8,'fingers remain away from camera');assert.ok(palm.y>.8,'palms remain up');
        const pose=Six.sample(s.time,i);
        assert.ok(Math.abs(pose.pos.x)>=.15&&Math.abs(pose.pos.x)<=.19,'closer without overlapping');
        assert.ok(pose.pos.y<=-.06&&pose.pos.y>=-.19,'lower, clear of reticle');
      });
    }
  }
  const hi=Six.sample(.55,0),lo=Six.sample(.85,0);
  assert.ok(Math.abs(hi.pos.y-lo.pos.y)<=.13,'vertical swing reduced from 20cm');
});
test('six short digit pulses alternate one slot, opacity <= .3 and gentle 12px rise',({Six})=>{
  assert.equal(typeof Six.numberSample,'function','number timeline missing');
  for(const t of [0,.2,.399,2.2,2.6,3])assert.equal(Six.numberSample(t),null);
  for(let k=0;k<6;k++){
    const start=.4+k*.3, text=k%2?'7':'6';
    let previous=-1;
    for(let j=1;j<27;j++){
      const t=start+j*.01, n=Six.numberSample(t);
      assert.equal(n.text,text);assert.equal(n.hand,k%2);
      assert.ok(n.opacity>0&&n.opacity<=.3);assert.ok(n.rise>=previous&&n.rise<=12);previous=n.rise;
      const reduced=Six.numberSample(t,true);near(reduced.rise,0);near(reduced.opacity,n.opacity);
    }
    near(Six.numberSample(start+.1).opacity,.3);
    assert.ok(Six.numberSample(start+.01).opacity<Six.numberSample(start+.1).opacity,'fade in');
    assert.ok(Six.numberSample(start+.26).opacity<Six.numberSample(start+.1).opacity,'fade out');
    assert.equal(Six.numberSample(start+.28),null,'gap before next digit, never overlap');
  }
});
test('single digit HUD follows simulation, clears immediately on overlays/action, no timers or GPU objects',({s,g,els,frame})=>{
  const el=els.sixSevenNumber;
  assert.ok(el,'single number element cached');assert.equal(el.hidden,true);
  assert.ok(s.start().ok);s.update(.5);
  assert.equal(el.hidden,false);assert.equal(el.textContent,'6');near(+el.style.opacity,.3);
  assert.match(el.style.transform,/translate3d/);
  s.update(.3);assert.equal(el.textContent,'7');
  g.pause();assert.equal(el.hidden,true);assert.equal(el.textContent,'');
  g._resumeNow();frame();assert.ok(s.start().ok);s.update(.5);g.player.setGrab(0,true);assert.equal(el.hidden,true);
});
test('keyboard starts and keeps gesture while walking, rising and falling; physics stays identical',({g,p,s,key,frame})=>{
  const other=build();
  for(const mode of ['walking','rising','falling']){
    for(const b of [{g,p,s,frame},other]){
      b.g.resetRun();b.g.state='play';b.frame();
      if(mode==='walking'){b.g.keys.KeyW=true;b.p.velocity.x=1;}
      else {b.p.position.y+=4;b.p.grounded=false;b.p.velocity.y=mode==='rising'?5:-5;}
    }
    key('Digit6');key('Digit7');assert.equal(s.active,true,mode+' activation');
    for(let i=0;i<20;i++){frame();other.frame();assert.equal(s.active,true,mode+' continuity');}
    assert.equal(physical(p),physical(other.p),mode+' does not change physics or HP');
    s.clear();
  }
  g.resetRun();g.state='play';frame();assert.ok(s.start().ok);
  key('Space');assert.ok(p.velocity.y>0);assert.equal(s.active,true,'keyboard jump does not cancel');
  key('KeyW');frame();assert.equal(s.active,true,'movement does not cancel');
  g.keys={};s.clear();p.reset();assert.ok(s.start().ok);p.jump();assert.equal(s.active,true,'direct jump does not cancel');
});
test('console request works airborne and moving and still revalidates free hands',({g,p,s,run,frame})=>{
  p.position.y+=3;p.grounded=false;p.velocity.set(1,3,0);g.keys.KeyW=true;
  g.openDevConsole();assert.match(run('67'),/fechar/i);g.closeDevConsole();assert.equal(s.active,true);
  frame();assert.equal(s.active,true);
  s.clear();g.openDevConsole();run('67');g.items.equipped='hammer';g.closeDevConsole();assert.equal(s.active,false);assert.equal(s.pending,false);
});
test('support no longer restricts gesture, but grabbing and mantle still have priority',({g,p,s,frame})=>{
  const old=g.world.platforms;g.world.platforms=[];p.grounded=false;p.position.y+=1;
  assert.ok(s.start().ok,'unsupported activation');frame();assert.equal(s.active,true);
  p.mantle={t:0};s.update(0);assert.equal(s.active,false,'mantle has priority');p.mantle=null;
  g.world.platforms=old;p.reset();assert.ok(s.start().ok);p.setGrab(1,true);assert.equal(s.active,false);
});
test('number tracks rendered palm after camera/viewmodel update across hands, FOVs and angles',({g,p,s,h})=>{
  assert.ok(s.start().ok);
  const el=s.number;
  for(const fov of [60,90])for(const [yaw,pitch] of [[0,0],[1.1,-.6]])for(let k=0;k<6;k++){
    p.camera.fov=fov;p.camera.updateProjectionMatrix();p.yaw=yaw;p.pitch=pitch;
    s.time=.5+k*.3;p.position.x+=.15;p.position.y+=.05;p.applyCamera();
    // The viewmodel must update the number in the same frame, not use last frame's camera/hand.
    s.updateNumber();h.clock.now+=16;p.updateViewmodel();
    const hm=p.handModels[k%2];hm.base.updateWorldMatrix(true,false);
    const palm=new h.THREE.Vector3(0,-.01,-.035);hm.base.localToWorld(palm);p.camera.worldToLocal(palm);palm.applyMatrix4(p.camera.projectionMatrix);
    const numbers=el.style.transform.match(/-?\d+(?:\.\d+)?(?=vw|vh)/g).map(Number);
    near(numbers[0],(palm.x+1)*50,1e-6);near(numbers[1],(1-palm.y)*50,1e-6);
    assert.equal(el.hidden,false);assert.equal(el.textContent,k%2?'7':'6');
    const rise=s.constructor.numberSample(s.time).rise;
    assert.ok(el.style.transform.includes(`- ${20+rise}px`),'20px above current palm plus subtle rise');
  }
});
test('digit node is decorative, noninteractive and absent public help',()=>{
  const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('css/hud.css','utf8');
  assert.equal((html.match(/id="sixSevenNumber"/g)||[]).length,1);
  assert.match(html,/<span[^>]*id="sixSevenNumber"[^>]*aria-hidden="true"[^>]*hidden/);
  assert.match(css,/#sixSevenNumber\s*\{[^}]*pointer-events:\s*none/);
});
console.log(`\n${total} tests; failures: ${bad}`);process.exitCode=bad?1:0;
