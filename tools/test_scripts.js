// Carrega TODOS os scripts do index.html na ordem real (menos main.js) e confere declarações duplicadas / referências quebradas no topo.
const log=console.log; console.log=()=>{};
const L=require('./_load.js'); console.log=log;   // já carregou utils…HallPuzzles
const fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(L.ROOT,'index.html'),'utf8');
const srcs=[...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m=>m[1]).filter(s=>s!=='js/main.js');
const already=new Set(['js/core/utils.js','js/world/textures.js','js/world/assets.js','js/world/levelData.js','js/world/Collision.js','js/world/World.js','js/world/Halls.js','js/items/itemDefs.js','js/items/Inventory.js','js/interaction/Interactables.js','js/world/Sectors.js','js/systems/MassSystem.js','js/systems/progress.js','js/systems/PuzzleSystem.js','js/systems/HallPuzzles.js']);
let fails=0;
global.document=Object.assign(global.document,{getElementById:()=>({}),body:{appendChild(){}}}); global.addEventListener=()=>{};
for(const s of srcs){ if(already.has(s)) continue; try{ vm.runInThisContext(fs.readFileSync(path.join(L.ROOT,s),'utf8'),{filename:s}); log('OK ',s); }catch(e){ fails++; log('FALHOU',s,e.message.split('\n')[0]); } }
log('ordem dos scripts no index.html confere com os arquivos:',srcs.every(s=>fs.existsSync(path.join(L.ROOT,s)))?'OK':'FALHOU');
const files=[]; (function walk(d){ for(const f of fs.readdirSync(d)){ const p=path.join(d,f); if(fs.statSync(p).isDirectory()){ if(f!=='node_modules'&&f!=='tools') walk(p); } else if(f.endsWith('.js')) files.push(path.relative(L.ROOT,p)); } })(path.join(L.ROOT,'js'));
const orphan=files.filter(f=>!srcs.includes(f)&&f!=='js/main.js'); log('arquivos .js fora do index.html:',orphan.length?orphan.join(', '):'nenhum');
log('falhas:',fails); process.exit(fails?1:0);
