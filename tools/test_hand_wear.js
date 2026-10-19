'use strict';
// Tarefa 3 do plano Health: camada de desgaste das mãos (HandWear) em quatro estados.
// Three.js r128 real em vm, como test_hand_visuals.js. Healthy = aparência original (uWear 0).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');
const ROOT=path.join(__dirname,'..');
const noopCtx=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createRadialGradient'||k==='createLinearGradient'?()=>({addColorStop(){}}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}):()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
const document={createElement:()=>({width:0,height:0,getContext:()=>noopCtx})};
const LIST=['js/core/utils.js','js/player/Handedness.js','js/items/climbingAxeAsset.js','js/items/itemDefs.js','js/items/Inventory.js','js/items/ItemSystem.js',
  'js/player/HandWear.js','js/player/HandModel.js','js/Game.js','js/world/Collision.js','js/player/perkDefs.js','js/player/PlayerAttributes.js',
  'js/player/PlayerStats.js','js/player/PlayerHealth.js','js/player/Player.js'];
function context(){
  const ctx=vm.createContext({THREE,console,performance:{now:()=>0},document,Models:{get(){return null},clips(){return []}},NAIL_REACH:1.8});
  for(const f of LIST) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
  return ctx;
}
const ctx=context();
const get=n=>vm.runInContext(`typeof ${n}!=="undefined"?${n}:undefined`,ctx);
const HW=()=>{ const h=get('HandWear'); if(!h) throw new Error('HandWear is not defined'); return h; };
const HandModel=get('HandModel');

let total=0,fails=0;
function test(name,fn){ total++; try{ fn(); console.log('OK',name); }catch(e){ fails++; console.error('FAIL',name,'-',e.message.split('\n').slice(0,12).join(' | ')); } }
const hash=a=>{ let h=2166136261>>>0; for(let i=0;i<a.length;i++){ h^=a[i]; h=Math.imul(h,16777619)>>>0; } return h; };
const near=(a,b,tol,msg)=>{ if(Math.abs(a-b)>tol) throw new Error(`${msg}: ${a} ≠ ${b}`); };
function compile(mat){
  const S=THREE.ShaderLib.standard, shader={uniforms:THREE.UniformsUtils.clone(S.uniforms),vertexShader:S.vertexShader,fragmentShader:S.fragmentShader};
  mat.onBeforeCompile(shader,null); return shader;
}
const pair=()=>[new HandModel(-1),new HandModel(1)];

test('textura_unica_e_deterministica',()=>{
  const t=HW().texture(); assert.equal(t,HW().texture(),'gerada uma vez');
  assert.equal(t.image.width,512); assert.equal(t.image.height,512); assert.equal(t.image.data.length,512*512*4);
  assert.equal(t.wrapS,THREE.RepeatWrapping); assert.equal(t.wrapT,THREE.RepeatWrapping);
  const other=vm.runInContext('HandWear.texture()',context());
  assert.equal(hash(other.image.data),hash(t.image.data),'mesma semente → mesma máscara');
  for(let c=0;c<4;c++){ let mn=255,mx=0; for(let i=c;i<t.image.data.length;i+=4){ const v=t.image.data[i]; if(v<mn) mn=v; if(v>mx) mx=v; } assert.ok(mx-mn>100,`canal ${'RGBA'[c]} tem variação (${mn}–${mx})`); }
});
test('shader_injetado',()=>{
  const m=new THREE.MeshStandardMaterial({map:new THREE.Texture()}); HW().apply(m,{side:1});
  const s=compile(m);
  assert.match(s.fragmentShader,/uniform float uWear/); assert.match(s.fragmentShader,/texture2D\( uWearMask/);
  assert.match(s.fragmentShader,/#include <emissivemap_fragment>/,'emissivo intacto');
  assert.ok(s.fragmentShader.indexOf('uWearMask, vUv')>s.fragmentShader.indexOf('#include <map_fragment>'),'depois do map');
  assert.ok(s.fragmentShader.indexOf('roughnessFactor *=')>s.fragmentShader.indexOf('#include <roughnessmap_fragment>'),'aspereza depois do roughnessmap');
  assert.equal(s.uniforms.uWear,m.userData.wear.uWear); assert.equal(s.uniforms.uWearOffset,m.userData.wear.uWearOffset);
  assert.equal(s.uniforms.uWearMask.value,HW().texture());
  assert.ok(!/emissive|totalEmissiveRadiance/.test(HW().FRAGMENT),'camada não toca o emissivo');
});
test('apply_idempotente',()=>{
  const m=new THREE.MeshStandardMaterial({map:new THREE.Texture()}); HW().apply(m,{side:1}); const w=m.userData.wear, f=m.onBeforeCompile;
  assert.equal(HW().apply(m,{side:1}),m); assert.equal(m.userData.wear,w); assert.equal(m.onBeforeCompile,f);
});
test('um_programa_duas_maos',()=>{
  const [L,R]=pair();
  assert.equal(L.mat.customProgramCacheKey(),R.mat.customProgramCacheKey()); assert.equal(R.mat.customProgramCacheKey(),'handwear-v1');
  assert.notEqual(L.mat.userData.wear.uWear,R.mat.userData.wear.uWear,'uniforms próprios');
  assert.ok(!L.mat.userData.wear.uWearOffset.value.equals(R.mat.userData.wear.uWearOffset.value),'offsets diferentes');
});
test('niveis',()=>{
  assert.deepEqual({...HW().LEVELS},{healthy:0,hurt:.34,injured:.67,critical:1,dead:1});
  assert.equal(HW().CRITICAL_TREMOR,.035);
});
test('nada_recriado',()=>{
  const [,R]=pair(); const mats=[R.mat], geo=R.procMeshes[0].geometry.uuid, map=R.mat.map.uuid, ver=R.mat.version, prog=R.mat.customProgramCacheKey();
  const st=['healthy','hurt','injured','critical','dead'];
  for(let i=0;i<100;i++){ R.setWear(st[i%5]); R.update(1/30); }
  assert.equal(R.mat,mats[0]); assert.equal(R.mat.version,ver,'sem needsUpdate'); assert.equal(R.procMeshes[0].geometry.uuid,geo); assert.equal(R.mat.map.uuid,map);
  assert.equal(R.mat.customProgramCacheKey(),prog);
});
test('tween_025s',()=>{
  const [,R]=pair(), u=R.mat.userData.wear.uWear;
  assert.equal(u.value,0,'nasce saudável'); R.setWear('critical'); assert.equal(u.value,0,'só anda no update');
  R.update(.125); near(u.value,.5,1e-6,'metade em 0,125 s'); R.update(.2); assert.equal(u.value,1);
  R.setWear('hurt'); R.update(.125); near(u.value,.67,1e-6,'1→.34 em 0,25 s'); R.update(.5); near(u.value,.34,1e-9,'hurt');
  R.setWear('healthy',{instant:true}); assert.equal(u.value,0,'instantâneo'); R.update(.1); assert.equal(u.value,0);
  R.setWear('nada'); R.update(1); assert.equal(u.value,0,'estado desconhecido = saudável');
});
test('procedural_recebe_camada',()=>{
  const [L,R]=pair(); assert.equal(R.rig,null,'sem GLB'); assert.ok(R.mat.userData.wear&&L.mat.userData.wear);
  assert.ok(R.procMeshes.every(m=>m.material===R.mat));
});
test('emissivo_da_stamina_intacto',()=>{
  const [,R]=pair(); R.tint(.3); R.setWear('critical'); R.update(.5); R.hurtTremor=HW().CRITICAL_TREMOR; R.update(.1);
  assert.deepEqual([R.mat.emissive.r,R.mat.emissive.g,R.mat.emissive.b],[.3,0,0]);
});
test('tremor_so_nos_dedos',()=>{
  const mk=()=>{ const h=new HandModel(1); h.time=1; h.setPose('hook'); h.setBase([.3,-.2,.5]); h.x.set(h.tgt); h.v.fill(0); h.snapBase(); h.root.position.set(.2,1.4,-.3); return h; };
  const A=mk(), B=mk(); B.hurtTremor=HW().CRITICAL_TREMOR; B.setWear('critical',{instant:true});
  let dev=0;
  for(let k=0;k<60;k++){ A.update(1/60); B.update(1/60); A.root.updateMatrixWorld(true); B.root.updateMatrixWorld(true);
    for(const n of ['root','wrist','base','socket']) A[n].matrixWorld.elements.forEach((v,i)=>near(v,B[n].matrixWorld.elements[i],1e-12,`${n} k=${k}`));
    A.fingers.forEach((f,i)=>f.joints.forEach((j,jj)=>{ dev=Math.max(dev,Math.abs(j.rotation.x-B.fingers[i].joints[jj].rotation.x)); })); }
  assert.ok(dev>=.005&&dev<=.04,`desvio angular máx. do dedo ${dev.toFixed(4)} rad`);
  const C=mk(); C.tremor=.1; C.hurtTremor=HW().CRITICAL_TREMOR; const D=mk(); D.tremor=.1;
  for(let k=0;k<30;k++){ C.update(1/60); D.update(1/60); }
  C.fingers.forEach((f,i)=>f.joints.forEach((j,jj)=>near(j.rotation.x,D.fingers[i].joints[jj].rotation.x,1e-12,'tremor maior (fadiga) prevalece: max, não soma')));
});
test('player_passa_estado',()=>{
  const Player=get('Player'), cam=new THREE.PerspectiveCamera(), scene=new THREE.Scene(); scene.add(cam);
  const p=new Player(scene,cam,{spawnPoint:new THREE.Vector3(0,5,.5),spawnYaw:0,platforms:[],raycastTargets:[],touch(){}});
  const calls=[]; p.handModels.forEach((hm,i)=>{ const o=hm.setWear.bind(hm); hm.setWear=(s,opt)=>{ calls.push([i,s,!!(opt&&opt.instant)]); return o(s,opt); }; });
  p.updateViewmodel(); assert.deepEqual(calls.filter(c=>c[1]!=='healthy'),[],'100 HP: saudável');
  assert.ok(p.handModels.every(h=>h.hurtTremor===0));
  p.health.set(25); calls.length=0; p.updateViewmodel();
  assert.deepEqual(calls.map(c=>c.slice(0,2)),[[0,'critical'],[1,'critical']]);
  assert.ok(p.handModels.every(h=>h.hurtTremor===HW().CRITICAL_TREMOR),'tremor de ferido grave');
  p.health.set(40); calls.length=0; p.updateViewmodel(); assert.deepEqual(calls.map(c=>c[1]),['injured','injured']);
  assert.ok(p.handModels.every(h=>h.hurtTremor===0));
  calls.length=0; p.reset(); assert.deepEqual(calls,[[0,'healthy',true],[1,'healthy',true]]);
  assert.ok(p.handModels.every(h=>h.hurtTremor===0&&h.mat.userData.wear.uWear.value===0));
});
test('index_carrega_antes_do_HandModel',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), a=html.indexOf('js/player/HandWear.js'), b=html.indexOf('js/player/HandModel.js');
  assert.ok(a>0&&a<b,'HandWear.js antes de HandModel.js');
});
test('mascara_gerada_na_carga_nao_no_primeiro_quadro',()=>{
  // R-T3 M1: a máscara 512² é gerada no apply (carga do Player), não dentro do onBeforeCompile
  const c2=context(), H2=vm.runInContext('HandWear',c2);
  assert.equal(H2._tex,undefined,'contexto novo sem máscara');
  const m=new THREE.MeshStandardMaterial(); H2.apply(m,{side:1});
  assert.ok(H2._tex,'máscara pronta depois do apply, antes de compilar');
  const t=H2._tex, sh={uniforms:{},vertexShader:'',fragmentShader:'#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>'};
  m.onBeforeCompile(sh,null); assert.equal(sh.uniforms.uWearMask.value,t,'compilar reaproveita a mesma máscara');
});
test('saudavel_nao_executa_a_camada (R-final I2/M2)',()=>{
  const F=HW().FRAGMENT, L=F.split('\n').map(l=>l.trim());
  const i=L.indexOf('if( uWear > 0.0 ) {');
  assert.ok(i>0,'bloco de desgaste guardado por uWear > 0');
  assert.equal(L[i-1],'#ifdef USE_UV'); assert.equal(L[i-2],'float wnd = 0.0;');
  const tex=L.map((l,k)=>/texture2D/.test(l)?k:-1).filter(k=>k>=0);
  assert.ok(tex.length&&tex.every(k=>k>i),'toda leitura de textura fica dentro do bloco');
  const close=L.lastIndexOf('}'); assert.ok(close>tex.at(-1)&&L.slice(close+1).join('')==='#endif','bloco fecha antes do #endif');
  assert.ok(L.slice(i+1,close).some(l=>l==='diffuseColor.rgb = wc;'),'só escreve a cor dentro do bloco');
  assert.equal(HW().ROUGHNESS.replace(/\s+/g,''),'roughnessFactor*=1.0-0.35*wnd;','roughness depende só de wnd (0 fora do bloco)');
});

console.log(`\n${total} testes; falhas: ${fails}`); process.exitCode=fails?1:0;
