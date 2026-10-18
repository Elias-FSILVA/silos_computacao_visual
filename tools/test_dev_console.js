'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js/player/perkDefs.js'),'utf8'),{filename:'js/player/perkDefs.js'});
const src=fs.readFileSync(path.join(__dirname,'../js/ui/DevConsole.js'),'utf8');
vm.runInThisContext(src,{filename:'js/ui/DevConsole.js'});
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('OK',name);}catch(e){failed++;console.error('FAIL',name,'-',e.message);}}
function fixture(){
  const calls=[];
  const game={state:'menu',player:{position:{x:1.25,y:42,z:-3},maxStamina:100,hands:[{stamina:80},{stamina:65}],attributes:{activePerks:['light_body'],addPerk:id=>{calls.push(['add',id]);return id==='light_body';},removePerk:id=>{calls.push(['remove',id]);return id==='light_body';},clearPerks:()=>calls.push(['clear'])}},spectator:{enter:()=>calls.push(['spectator'])},clearDevConsoleOutput:()=>calls.push(['clearOutput'])};
  return {game,calls};
}
test('help lists only supported command families',()=>{const {game}=fixture();const out=DevConsole.execute('help',game);if(!out.includes('status')||!out.includes('perk add')||!out.includes('spectator'))throw Error(out);});
test('status reports state, coordinates, height and stamina',()=>{const {game}=fixture();const out=DevConsole.execute('status',game);for(const value of ['menu','1.3','42.0','80/100','65/100'])if(!out.includes(value))throw Error(`missing ${value}: ${out}`);});
test('perks lists active perks by readable name',()=>{const {game}=fixture();const out=DevConsole.execute('perks',game);if(!out.includes('Corpo leve')||!out.includes('light_body'))throw Error(out);});
test('perks add help lists valid perk ids and names',()=>{const {game,calls}=fixture();const out=DevConsole.execute('perks add help',game);for(const value of ['light_body','Corpo leve','economical_grip'])if(!out.includes(value))throw Error(`missing ${value}: ${out}`);if(calls.length)throw Error('help must not alter perks');});
test('clear clears existing console output',()=>{const {game,calls}=fixture();DevConsole.execute('clear',game);if(JSON.stringify(calls)!==JSON.stringify([['clearOutput']]))throw Error(JSON.stringify(calls));});
test('perk add/remove/clear dispatch allowlisted ids only',()=>{const {game,calls}=fixture();DevConsole.execute('perk add light_body',game);DevConsole.execute('perk remove light_body',game);DevConsole.execute('perk clear',game);if(JSON.stringify(calls)!==JSON.stringify([['add','light_body'],['remove','light_body'],['clear']]))throw Error(JSON.stringify(calls));});
test('spectator activates existing spectator mode',()=>{const {game,calls}=fixture();const out=DevConsole.execute('spectator',game);if(!out.includes('espectador')||calls[0][0]!=='spectator')throw Error(out);});
test('unknown/malformed commands are safe and do not evaluate input',()=>{const {game,calls}=fixture();for(const cmd of ['wat','perk add nope','perk add light_body; alert(1)','status extra']){const out=DevConsole.execute(cmd,game);if(!out.startsWith('Erro:'))throw Error(`${cmd}: ${out}`);}if(calls.length)throw Error('command had side effects');});

// ---------- A8: navegação de debug (despacho allowlist; validação real fica em DeveloperNavigation) ----------
function navFixture(over={}){
  const {game,calls}=fixture();game.state='play';
  const res=(ok,message)=>({ok,message});
  game.debugNavigation=Object.assign({noclipActive:false,speed:10,assisted:false,backPose:null,
    safety:{catalog:()=>{calls.push(['catalog']);return [{id:'cp2',name:'Passarela',height:40,note:'Nota A'},{id:'subida1',name:'Subida 1',height:40,note:'Início junto à Passarela'},{id:'cp6',name:'Andaime norte',height:128,note:'Estado dos mecanismos preservado'}];}},
    guard:{protectedTriggers:()=>[{id:'checkpoint:cp14',phase:'need-entry',instruction:'Reentre na região com locomoção normal'}]},
    eligibility(){return {assisted:this.assisted,competitiveEligible:!this.assisted,debugReasons:this.assisted?['goto']:[]};},
    goto(id){calls.push(['goto',id]);return id==='cp6'?res(true,'cp6 — Andaime norte, 128.00 m. Estado dos mecanismos preservado — Run assistida'):res(false,'Destino inexistente: '+id);},
    back(){calls.push(['back']);return res(false,'Nenhum retorno registrado');},
    setNoclip(on){calls.push(['noclip',on]);return res(true,'Noclip '+(on?'ligado':'desligado'));},
    setSpeed(n){calls.push(['speed',n]);return n>=1&&n<=50?res(true,'Velocidade noclip: '+n+' m/s'):res(false,'Velocidade deve estar entre 1 e 50 m/s');}},over);
  return {game,calls};
}
test('help documenta navegação, controles, desktop, ranking e rearme',()=>{const {game}=navFixture();const out=DevConsole.execute('help',game);for(const v of ['goto list','goto <id>','back','noclip on','noclip off','noclip speed <1–50>','WASD','Ctrl','Shift','desktop','ranking','saia e reentre','desliga onde você estiver'])if(!out.includes(v))throw Error(`missing ${v}: ${out}`);if(/só desliga com o corpo apoiado/.test(out))throw Error('help ainda descreve a regra antiga do noclip off');});
test('goto list é só consulta: agrupa por trecho, alinha colunas, altura pt-BR, esconde aliases',()=>{const {game,calls}=navFixture();game.state='menu';
  game.debugNavigation.safety.catalog=()=>{calls.push(['catalog']);return [{id:'cp2',name:'Passarela',height:40,note:'Nota A'},{id:'subida1',name:'Subida 1',height:40,note:'alias',listed:false},{id:'cp4',name:'Sala de controle',height:76.6,note:'Nota B'},{id:'cp6',name:'Andaime norte',height:128,note:'Nota C'}];};
  const out=DevConsole.execute('goto list',game);
  if(JSON.stringify(calls)!==JSON.stringify([['catalog']]))throw Error(JSON.stringify(calls));
  if(out.includes('subida1'))throw Error('alias listado: '+out);
  const i=['0–100 m','cp2','cp4','100–200 m','cp6'].map(t=>out.indexOf(t));if(i.some(x=>x<0)||i.some((x,k)=>k&&x<i[k-1]))throw Error(out);
  for(const v of ['Andaime norte','128 m','76,6 m','Nota C'])if(!out.includes(v))throw Error(`missing ${v}: ${out}`);
  const rows=out.split('\n').filter(l=>/^  (cp2|cp4|cp6) /.test(l)),col=r=>r.indexOf(r.trim().split(/\s{2,}/)[1]);
  if(rows.length!==3||new Set(rows.map(col)).size!==1)throw Error('colunas desalinhadas:\n'+rows.join('\n'));
  if(/Estado dos mecanismos/.test(out))throw Error(out);});
test('goto/back/noclip despacham com caixa e espaços normalizados',()=>{const {game,calls}=navFixture();
  const out=DevConsole.execute('  GOTO   Cp6  ',game);if(!out.includes('cp6')||!out.includes('128')||!out.includes('Run assistida')||out.startsWith('Erro'))throw Error(out);
  DevConsole.execute('back',game);DevConsole.execute('noclip',game);game.debugNavigation.noclipActive=true;DevConsole.execute('NOCLIP',game);DevConsole.execute('noclip on',game);DevConsole.execute('noclip OFF',game);
  for(const [v,n] of [['1',1],['50',50],['12.5',12.5],['0',0],['51',51],['.5',.5]])DevConsole.execute('noclip speed '+v,game);
  const want=[['goto','cp6'],['back'],['noclip',true],['noclip',false],['noclip',true],['noclip',false],['speed',1],['speed',50],['speed',12.5],['speed',0],['speed',51],['speed',.5]];
  if(JSON.stringify(calls)!==JSON.stringify(want))throw Error(JSON.stringify(calls));});
test('recusas da navegação viram “Erro:” com o motivo; console não fecha nem muda estado',()=>{const {game}=navFixture();let closed=0;game.closeDevConsole=()=>closed++;game.state='console';
  for(const [c,m] of [['goto nada','Destino inexistente: nada'],['back','Nenhum retorno registrado'],['noclip speed 0','entre 1 e 50'],['noclip speed 51','entre 1 e 50']]){const out=DevConsole.execute(c,game);if(!out.startsWith('Erro:')||!out.includes(m))throw Error(`${c}: ${out}`);}
  if(closed||game.state!=='console')throw Error('console fechou/mudou estado');});
test('aridade/argumentos inválidos e números não estritos não chamam a navegação',()=>{const {game,calls}=navFixture();
  for(const c of ['goto','goto cp6 extra','goto list x','back now','noclip maybe','noclip on x','noclip speed','noclip speed 1abc','noclip speed NaN','noclip speed Infinity','noclip speed -5','noclip speed 1e1','noclip speed 0x10','noclip speed 5 6','noclip speed ;alert(1)','goto cp6;alert(1)']){const out=DevConsole.execute(c,game);if(!out.startsWith('Erro:'))throw Error(`${c}: ${out}`);}
  if(calls.length)throw Error(JSON.stringify(calls));});
test('status mostra assistida/motivos, noclip, velocidade, retorno e gatilhos protegidos com instrução',()=>{const {game}=navFixture();const n=game.debugNavigation;n.assisted=true;n.noclipActive=true;n.speed=22;n.backPose={position:{x:0,y:0,z:0}};
  const out=DevConsole.execute('status',game);for(const v of ['Run assistida','goto','Noclip: ligado','22 m/s','Retorno: registrado','checkpoint:cp14','need-entry','Reentre na região com locomoção normal','80/100'])if(!out.includes(v))throw Error(`missing ${v}: ${out}`);
  n.assisted=false;n.noclipActive=false;n.backPose=null;const o2=DevConsole.execute('status',game);for(const v of ['Run normal','Noclip: desligado','Retorno: nenhum'])if(!o2.includes(v))throw Error(`missing ${v}: ${o2}`);});
console.log(`\\n${passed+failed} testes; falhas: ${failed}`);process.exit(failed?1:0);
