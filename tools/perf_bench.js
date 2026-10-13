// Banco de desempenho do jogo no navegador: abre o jogo no Chrome headless (DevTools Protocol, sem dependências do npm),
// para o laço de animação e desenha quadros em posições FIXAS do mapa, sempre com os mesmos ângulos de câmera.
// Mede, por posição e direção do olhar: chamadas de desenho, triângulos, luzes pontuais ativas e tempo de quadro
// (CPU + espera da GPU com readPixels). Depois faz idas e voltas do fundo ao topo para ver picos (carregamento) e se a
// memória de GPU (geometrias/texturas) e o heap de JS crescem sem parar.
//
// Uso: node tools/perf_bench.js [caminho do chrome.exe] [--out arquivo.json] [--size 1280x720] [--trips 3]
// Os números servem para COMPARAR versões na mesma máquina. Não representam o Quest: lá, meça no aparelho
// (o modo de diagnóstico do jogo mostra os mesmos contadores: tecla F3 ou ?diag no endereço).
const fs=require('fs'), path=require('path'), os=require('os'), http=require('http'), {spawn}=require('child_process');
const ROOT=path.join(__dirname,'..');
const arg=(k,d)=>{ const i=process.argv.indexOf(k); return i>0?process.argv[i+1]:d; };
const CHROME=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(f=>fs.existsSync(f));
const OUT=arg('--out',null), [W,H]=arg('--size','1280x720').split('x').map(Number), TRIPS=+arg('--trips',3), SWEEP=+arg('--sweep',.5), SHOTS=arg('--shots',null), QUERY=arg('--query',''), ONLY=arg('--only',''), QUICK=process.argv.includes('--quick'), PROBE=arg('--probe','');
if(!CHROME){ console.error('Chrome não encontrado: passe o caminho do chrome.exe.'); process.exit(1); }

// ---------- servidor estático mínimo ----------
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.mtl':'text/plain','.obj':'text/plain'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]), f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(res);
});

// ---------- o que roda dentro da página ----------
function pageBench(W,H,TRIPS,SWEEP,SHOTS,ONLY,QUICK,PROBE){
  return `(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<300&&!window.__silos;i++) await wait(100);
  const g=window.__silos; if(!g) return {error:'jogo não iniciou'};
  await wait(2500);                                   // texturas adiadas (requestIdleCallback) e a foto do tijolo
  const r=g.renderer, gl=r.getContext(), px=new Uint8Array(4);
  r.setAnimationLoop(null); r.setPixelRatio(1); r.setSize(${W},${H}); g.camera.aspect=${W}/${H}; g.camera.updateProjectionMatrix();
  g.ui.hideScreens(); g.ui.setHUD(false); g.state='bench';
  const dbg=gl.getExtension('WEBGL_debug_renderer_info'), gpu=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  let T=performance.now();
  const frame=()=>{ T+=1000/60; const a=performance.now(); g._loop(T); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); return performance.now()-a; };
  const place=(p,yaw,pitch)=>{ g.player.position.set(p.x,p.y,p.z); if(g.player._prev) g.player._prev.copy(g.player.position);
    g.camera.position.set(p.x,p.y+EYE,p.z); g.camera.rotation.set(pitch,yaw,0); g.camera.updateMatrixWorld(); };
  const lightsOn=()=>{ let n=0; g.scene.traverseVisible(o=>{ if(o.isPointLight) n++; }); return n; };
  const W_=g.world, hall=id=>W_.halls.find(h=>h.cfg&&h.cfg.id===id);
  const h1=hall('h1'), mz=W_.maze;
  const spots=[
    ['inicio',{x:0,y:0,z:0}], ['subida1',{x:0,y:60,z:0}], ['casaBombas',h1.fr.p((h1.uN+h1.uF)/2,h1.H,0)], ['subida2',{x:0,y:125,z:0}],
    ['galeria',polar(8,1.9,EXHAUST.H)], ['patio',polar(10,.3,HUB.H)], ['insuflador',{x:0,y:INSUF.grateTop,z:0}], ['subida3b',{x:0,y:275,z:0}],
    ['labirinto',{x:0,y:MAZE.H,z:(mz.zA+mz.zF)/2}], ['subida4',{x:0,y:350,z:0}], ['topo',{x:0,y:TOP-2,z:0}]];
  const views=[['frente',0,0],['tras',Math.PI,0],['cima',0,1.35],['baixo',0,-1.35]];
  // --probe y,yaw,pitch: só esta vista (diagnóstico de um quadro caro)
  if('${PROBE}'){ const [y,yaw,pitch]='${PROBE}'.split(',').map(Number); spots.length=0; spots.push(['sonda',{x:0,y,z:0}]); views.length=0; views.push(['v',yaw,pitch]); }
  const med=a=>{ const s=a.slice().sort((p,q)=>p-q); return s[Math.floor(s.length/2)]; };
  const rows=[], shots={};
  for(const [name,p] of spots){ if("${ONLY}"&&!"${ONLY}".split(",").includes(name)) continue;
    for(const [vn,yaw,pitch] of views){
      place(p,yaw,pitch); for(let i=0;i<40;i++) frame();      // estabiliza (setores, luzes, programas)
      const ts=[]; for(let i=0;i<30;i++) ts.push(frame());
      rows.push({spot:name,view:vn,y:+p.y.toFixed(1),calls:r.info.render.calls,tris:r.info.render.triangles,lights:lightsOn(),ms:+med(ts).toFixed(2)});
      if(${!!SHOTS}){ frame(); shots[name+'_'+vn]=r.domElement.toDataURL('image/jpeg',.82); }   // mesmo quadro, antes de compor
    }
  }
  const mem=()=>{ if(window.gc) gc(); return {geometries:r.info.memory.geometries,textures:r.info.memory.textures,programs:(r.info.programs||[]).length,
    heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null}; };
  const settle=s=>{ for(let i=0;i<s*60;i++) frame(); };       // tempo simulado (o atraso de descarga é de alguns segundos)
  if(${QUICK}) return {gpu,size:"${W}x${H}",rows,memStart:null,trips:[],resets:[],shots};
  place({x:0,y:0,z:0},0,0); settle(6); const memStart=mem();
  // idas e voltas pelo poço (${SWEEP} m por quadro = ${(SWEEP*60).toFixed(0)} m/s, olhando para cima na subida e para baixo na descida)
  const trips=[];
  for(let k=0;k<${TRIPS};k++){
    let max=0, slow=0, n=0, sum=0; const ft=[], spikes=[];
    for(const dir of [1,-1]){ for(let y=dir>0?0:TOP; dir>0?y<=TOP:y>=0; y+=${SWEEP}*dir){ place({x:0,y,z:0},y*.01,dir>0?.9:-.9); const S=g.sectors, ev0=S&&S.events?(S.evCount||0):0, t=frame(); ft.push(t); if(t>33.3) spikes.push({y:+y.toFixed(1),ms:+t.toFixed(1),ev:S&&S.events?S.events.slice(Math.max(0,S.events.length-((S.evCount||0)-ev0))).map(e=>e.id+' '+e.ev).join(', '):''}); max=Math.max(max,t); if(t>33.3) slow++; sum+=t; n++; } }
    settle(6); ft.sort((a,b)=>a-b);
    trips.push({spikes:spikes.sort((a,b)=>b.ms-a.ms).slice(0,4),trip:k+1,frames:n,avgMs:+(sum/n).toFixed(2),p95Ms:+ft[Math.floor(n*.95)].toFixed(1),maxMs:+max.toFixed(1),over33ms:slow,...mem()});
  }
  // "Tentar de novo" três vezes: o mapa é reconstruído; a memória de GPU deve voltar ao mesmo patamar
  const resets=[];
  // depois de cada reinício o poço inteiro é percorrido olhando em todas as direções (o que se vê sobe para a GPU)
  for(let k=0;k<3;k++){ g.resetRun(); g.state='bench';
    for(let y=0;y<=TOP;y+=2) for(const pitch of [.9,0,-.9]){ place({x:0,y,z:0},y*.37,pitch); frame(); }
    place({x:0,y:0,z:0},0,0); settle(6); resets.push({reset:k+1,...mem()}); }
  const extra=g.world.sectors&&g.world.sectors.list?{sectors:g.world.sectors.list.length,activeSectors:g.world.sectors.list.filter(s=>s.state==='active').length,built:g.world.sectors.stats.built}:{};
  return {gpu,size:'${W}x${H}',rows,memStart,trips,resets,shots,...extra};
})()`;
}

// auditoria da cena: o que existe no mapa, por categoria e por faixa de altura (malhas, triângulos, materiais, luzes)
function pageAudit(){
  return `(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<300&&!window.__silos;i++) await wait(100);
  const g=window.__silos; if(!g) return {error:'jogo não iniciou'}; await wait(2500);
  const root=g.world.root, tri=o=>{ const ge=o.geometry; if(!ge||!ge.attributes||!ge.attributes.position) return 0; return ((ge.index?ge.index.count:ge.attributes.position.count)/3)*(o.isInstancedMesh?o.count:1); };
  const cat={}, band={}, mats=new Map(), geos=new Set(), texs=new Set(); let lights=0, meshes=0, hidden=0, tris=0;
  const add=(m,k,o)=>{ const c=m[k]||(m[k]={meshes:0,tris:0}); c.meshes++; c.tris+=tri(o); };
  const big=[];
  root.updateMatrixWorld(true);
  root.traverse(o=>{
    if(o.isPointLight){ lights++; return; }
    if(!o.isMesh) return;
    const mt=o.material; if(mt&&mt.visible===false){ hidden++; return; }
    meshes++; tris+=tri(o); geos.add(o.geometry); mats.set(mt,(mats.get(mt)||0)+1); if(mt&&mt.map) texs.add(mt.map);
    let k=o.userData.type||'?'; if(o.parent!==root) k='(em grupo) '+(o.parent.userData.type||o.parent.type);
    add(cat,k,o);
    const y=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).y; add(band,String(Math.floor(y/20)*20).padStart(3,'0'),o);
    if(tri(o)>2000) big.push({tris:tri(o),type:k,y:+y.toFixed(1),name:o.name||o.parent.name||''});
  });
  big.sort((a,b)=>b.tris-a.tris);
  return {meshes,hiddenHitMeshes:hidden,tris,lights,geometries:geos.size,materials:mats.size,mapTextures:texs.size,rootChildren:root.children.length,
    byType:cat,byBand20m:band,biggest:big.slice(0,15),matsUsedOnce:[...mats.values()].filter(n=>n===1).length};
})()`;
}

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/index.html${QUERY?"?"+QUERY:""}`;
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'silos-bench-')), port=9400+Math.floor(Math.random()*400);
  const ch=spawn(CHROME,['--headless=new','--no-first-run','--disable-extensions','--ignore-gpu-blocklist','--enable-gpu','--enable-precise-memory-info','--js-flags=--expose-gc',
    '--disable-background-timer-throttling','--disable-renderer-backgrounding',`--window-size=${W},${H}`,`--user-data-dir=${prof}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let tgt=null;
  for(let i=0;i<80&&!tgt;i++){ try{ tgt=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'); }catch(e){} if(!tgt) await sleep(250); }
  if(!tgt) throw new Error('não conectou ao Chrome');
  const ws=new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend=new Map(), logs=[];
  ws.onmessage=ev=>{ const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
    else if(m.method==='Runtime.consoleAPICalled'&&(m.params.type==='error'||m.params.type==='warning')) logs.push(m.params.type+': '+m.params.args.map(a=>a.value||a.description||'').join(' '));
    else if(m.method==='Runtime.exceptionThrown') logs.push('exceção: '+(m.params.exceptionDetails.exception||{}).description); };
  const send=(method,params={})=>new Promise(r=>{ const i=++id; pend.set(i,r); ws.send(JSON.stringify({id:i,method,params})); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate',{url});
  const AUDIT=process.argv.includes('--audit');
  const res=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,timeout:600000,expression:AUDIT?pageAudit():pageBench(W,H,TRIPS,SWEEP,SHOTS,ONLY,QUICK,PROBE)});
  ws.close(); ch.kill(); server.close();
  const out=res.result&&res.result.result&&res.result.result.value;
  if(AUDIT){ console.log(JSON.stringify(out,null,1)); if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,1)); process.exit(out&&!out.error?0:1); }
  if(!out||out.error){ console.error('falhou:',out&&out.error||JSON.stringify(res.result).slice(0,800)); logs.forEach(l=>console.error(l)); process.exit(1); }
  out.logs=logs.slice(0,20);
  if(SHOTS&&out.shots){ fs.mkdirSync(SHOTS,{recursive:true}); for(const [k,v] of Object.entries(out.shots)) fs.writeFileSync(path.join(SHOTS,k+".jpg"),Buffer.from(v.split(",")[1],"base64")); console.log("capturas em",SHOTS); }
  delete out.shots;
  // resumo
  const pad=(s,n)=>String(s).padEnd(n);
  console.log('GPU:',out.gpu,'·',out.size);
  console.log(pad('posição',12)+pad('olhar',8)+pad('y',7)+pad('draws',8)+pad('triângulos',12)+pad('luzes',7)+'ms');
  for(const r of out.rows) console.log(pad(r.spot,12)+pad(r.view,8)+pad(r.y,7)+pad(r.calls,8)+pad(r.tris,12)+pad(r.lights,7)+r.ms);
  const avg=k=>(out.rows.reduce((a,r)=>a+r[k],0)/out.rows.length);
  console.log(`média: ${avg('calls').toFixed(0)} draws · ${avg('tris').toFixed(0)} triângulos · ${avg('lights').toFixed(1)} luzes · ${avg('ms').toFixed(2)} ms`);
  console.log('memória no início:',JSON.stringify(out.memStart));
  for(const t of out.trips) console.log('ida e volta',JSON.stringify(t));
  for(const t of out.resets||[]) console.log('reinício',JSON.stringify(t));
  if(out.sectors!=null) console.log('setores:',out.sectors,'· ativos no fim:',out.activeSectors);
  if(logs.length) console.log('console:',logs.slice(0,8).join(' | '));
  if(OUT){ fs.writeFileSync(OUT,JSON.stringify(out,null,1)); console.log('salvo em',OUT); }
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
