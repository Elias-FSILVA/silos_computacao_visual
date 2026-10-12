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
console.log(`\\n${passed+failed} testes; falhas: ${failed}`);process.exit(failed?1:0);
