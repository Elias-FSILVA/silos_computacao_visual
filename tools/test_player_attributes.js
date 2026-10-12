'use strict';
// Regressões: composição parcial, deriva cumulativa, mutação externa e IDs herdados.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx=vm.createContext({});
for(const file of ['perkDefs.js','PlayerAttributes.js']){
  const p=path.join(__dirname,'../js/player',file);
  assert.ok(fs.existsSync(p),`Módulo de atributos ausente: ${file}`);
  vm.runInContext(fs.readFileSync(p,'utf8'),ctx,{filename:file});
}
const {PlayerAttributes:A,PLAYER_BASE_ATTRIBUTES:base,PERK_DEFS:defs}=vm.runInContext('({PlayerAttributes,PLAYER_BASE_ATTRIBUTES,PERK_DEFS})',ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const def=(id,multipliers)=>({id,name:id,benefit:'benefício',tradeoff:'custo',multipliers});
let total=0,fails=0;
function test(name,fn){total++;try{fn();console.log('OK',name);}catch(e){fails++;console.error('FAIL',name,e.message);}}
test('bases e snapshots sem perks',()=>{
  assert.deepEqual(plain(new A().effective),{gravity:18,maxStamina:100,jumpSpeed:8.2,wallJumpSpeed:9,wallJumpStaminaCost:12,reach:2,tiredReach:1.7,gripDrainMultiplier:1,groundRecovery:35,freeHandRecovery:12,fatigueGainMultiplier:1,fatigueRecoveryMultiplier:1});
});
for(const [id,changes] of Object.entries({economical_grip:{gripDrainMultiplier:.85,groundRecovery:29.75,freeHandRecovery:10.2},quick_recovery:{gripDrainMultiplier:1.1,groundRecovery:42,freeHandRecovery:14.4},powerful_launch:{wallJumpSpeed:9.9,wallJumpStaminaCost:15},light_body:{gravity:13.5,maxStamina:60}})){
  test(`benefício e contrapartida atômicos: ${id}`,()=>{
    const a=new A(); assert.equal(a.addPerk(id),true); assert.equal(a.hasPerk(id),true);
    for(const [key,value] of Object.entries(base)) near(a.effective[key],changes[key]??value);
    assert.equal(a.addPerk(id),false); assert.equal(a.removePerk(id),true);
    assert.deepEqual(plain(a.effective),plain(base)); assert.equal(a.removePerk(id),false);
  });
}
test('ordem canônica, combinação e ausência de deriva em 100 ciclos',()=>{
  const a=new A(),b=new A(),ids=Object.keys(defs);
  ids.forEach(id=>a.addPerk(id));ids.reverse().forEach(id=>b.addPerk(id));
  assert.deepEqual(plain(a.effective),plain(b.effective));near(a.effective.gripDrainMultiplier,.935);near(a.effective.groundRecovery,35.7);near(a.effective.freeHandRecovery,12.24);
  assert.deepEqual(plain(a.activePerks),[...ids].sort());
  for(let i=0;i<100;i++){a.clearPerks();ids.forEach(id=>a.addPerk(id));ids.forEach(id=>a.removePerk(id));assert.deepEqual(plain(a.effective),plain(base));}
});
test('IDs herdados e não string não são perks',()=>{
  const a=new A(); for(const id of ['__proto__','constructor','toString','',null,undefined,12,{},['light_body']]){
    assert.equal(a.addPerk(id),false);assert.equal(a.hasPerk(id),false);assert.equal(a.removePerk(id),false);
  } assert.deepEqual(plain(a.activePerks),[]);
});
test('isolamento e dados públicos imutáveis',()=>{
  const a=new A(),b=new A(); a.addPerk('light_body'); const ids=a.activePerks;ids.push('powerful_launch');
  for(const obj of [base,defs,defs.light_body,defs.light_body.multipliers,a.effective]) assert.equal(Object.isFrozen(obj),true);
  assert.throws(()=>{a.effective.gravity=99;});assert.throws(()=>{defs.light_body.multipliers.gravity=99;});
  assert.equal(a.hasPerk('powerful_launch'),false); assert.equal(b.effective.gravity,18);
  const c={custom:def('custom',{gravity:.5})}; const d=new A({catalog:c}); c.custom.multipliers.gravity=99; delete c.custom;
  assert.equal(d.addPerk('custom'),true);assert.equal(d.effective.gravity,9);
});
test('notificação síncrona só após mudanças',()=>{
  let n=0; const a=new A({onChange:e=>{n++;assert.equal(e,a.effective);}});assert.equal(n,0);
  a.addPerk('light_body');assert.equal(n,1);a.addPerk('light_body');a.addPerk('nope');a.removePerk('nope');assert.equal(n,1);
  a.removePerk('light_body');assert.equal(n,2);a.clearPerks();assert.equal(n,2);
  a.addPerk('light_body');a.addPerk('quick_recovery');a.clearPerks();assert.equal(n,5);
});
test('catálogo malformado rejeitado na construção',()=>{
  const invalid=[null,[],{x:null},{x:def('other',{gravity:1})},{x:def('x',{unknown:1})},{x:{id:'x'}},{x:def('x',null)},{x:def('x',[])},...['2',NaN,Infinity,0,-1].map(f=>({x:def('x',{gravity:f})}))];
  for(const catalog of invalid) assert.throws(()=>new A({catalog}),{name:'TypeError'});
});
for(const factor of [1e155,1e-200]) test(`overflow/underflow rejeita ativação sem estado parcial (${factor})`,()=>{
  let calls=0; const a=new A({catalog:{a:def('a',{gravity:factor}),b:def('b',{gravity:factor})},onChange:()=>calls++});
  assert.equal(a.addPerk('a'),true);const snapshot=a.effective;
  assert.equal(a.addPerk('b'),false);assert.equal(a.hasPerk('b'),false);assert.equal(a.effective,snapshot);assert.equal(calls,1);
});
console.log(`\n${total} testes; falhas: ${fails}`);process.exitCode=fails?1:0;
