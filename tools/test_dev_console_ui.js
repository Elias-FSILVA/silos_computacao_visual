'use strict';
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const game=fs.readFileSync('js/Game.js','utf8');
const settings=fs.readFileSync('js/core/settings.js','utf8');
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('OK',name);}catch(e){failed++;console.error('FAIL',name,'-',e.message);}}
test('developer console is a persistent setting, disabled by default',()=>{
  const ctx={LS:null};vm.runInNewContext(settings+'\nglobalThis.SettingsForTest=Settings;',ctx);
  if(ctx.SettingsForTest.defaults.devConsoleEnabled!==false)throw Error('default must be false');
  if(!html.includes('data-key="devConsoleEnabled"'))throw Error('missing settings checkbox');
});
test('console is a hidden overlay outside the main menu',()=>{
  const start=html.indexOf('<section class="screen" id="menu"'),end=html.indexOf('</section>',start);
  if(html.slice(start,end).includes('devConsoleForm'))throw Error('console still lives in menu');
  if(!html.includes('id="devConsole"')||!html.includes('id="devConsoleForm"'))throw Error('overlay markup missing');
});
test('tilde shortcut and Escape open/close a gated console overlay',()=>{
  if(!game.includes("e.code==='Backquote'"))throw Error('Backquote shortcut missing');
  if(!game.includes('devConsoleEnabled'))throw Error('shortcut is not gated by setting');
  if(!game.includes('openDevConsole()')||!game.includes('closeDevConsole()'))throw Error('overlay lifecycle missing');
});
console.log(`\n${passed+failed} testes; falhas: ${failed}`);process.exit(failed?1:0);
