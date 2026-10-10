// Tela de resultado com o final da rota + ranking mostrando o final.
const log=console.log; console.log=()=>{};
const L=require('./_load.js'); L.load('js/core/settings.js'); L.load('js/core/ranking.js'); L.load('js/ui/UIManager.js'); console.log=log;
const vm=require('vm'); let fails=0; const chk=(k,ok,x='')=>{ log(k.padEnd(60),(ok?'OK ':'FALHOU ')+x); if(!ok) fails++; };
const els={}; const el=id=>els[id]||(els[id]={id,textContent:'',hidden:false,className:'',children:[],append(){},appendChild(c){ this.children.push(c); },classList:{add(){},remove(){}},style:{},set innerHTML(v){},insertRow(){ return {cells:[],insertCell(){ const c={}; this.cells.push(c); return c; },className:''}; }});
const ui=Object.create(UIManager.prototype); ui.$=el; ui.show=()=>{}; ui.hideScreens=()=>{};
global.document.createElement=(t)=>({tagName:t,textContent:'',className:'',children:[],appendChild(){},insertRow(){ const cells=[]; return {cells,className:'',insertCell(){ const c={}; cells.push(c); return c; }}; }});
for(const ending of ['seal','commune','witness','escape']){
  Object.keys(els).forEach(k=>delete els[k]);
  try{ ui.showResult({name:'Jardhes',score:12000,time:1500,result:'finish',height:400,ending,breakdown:{total:12000,height:1000,speed:0,puzzle:0,secrets:0,performance:0,penalties:0,checkpoints:0}}); }catch(e){ chk('showResult '+ending,false,e.message); continue; }
  chk(`resultado do final ${ending}`,els.resT.textContent===ENDINGS[ending].name&&els.resEnd.textContent.includes(ENDINGS[ending].tag)&&els.resEnd.hidden===false,'· '+els.resT.textContent);
}
Object.keys(els).forEach(k=>delete els[k]); ui.showResult({name:'x',score:1,time:1,result:'fall',height:3,ending:null,breakdown:{total:1,height:1,speed:0,performance:0,penalties:0,checkpoints:0}}); chk('queda não mostra final',els.resEnd.hidden===true&&els.resT.textContent==='Você caiu');
log('falhas:',fails); process.exit(fails?1:0);
