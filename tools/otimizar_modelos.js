// Gera as cópias OTIMIZADAS dos modelos do mapa (assets/models/map/*.glb → assets/models/map/otimizados/*.glb).
// Os originais baixados do Sketchfab têm texturas PNG de 2–4 mil px (12–23 MB por arquivo); o README de modelos pede
// texturas de até 1024 px e poucos triângulos. Para cada arquivo:
//   · guarda só as malhas usadas no mapa (filtro por nome);
//   · "assa" as transformações dos nós na geometria: cada malha sai em metros, com o eixo Y para cima e a origem do
//     arquivo original, num nó sem transformação (o jogo posiciona as peças pelo nome);
//   · regrava as texturas em JPEG com no máximo `tex` px (PNG se o material usa transparência).
// As imagens são decodificadas e reduzidas pelo próprio Chrome (sem dependências do npm), via DevTools Protocol.
// Uso: node tools/otimizar_modelos.js "C:/Program Files/Google/Chrome/Application/chrome.exe"
const fs=require('fs'), path=require('path'), os=require('os'), {spawn}=require('child_process');
const ROOT=path.join(__dirname,'..'), SRC=path.join(ROOT,'assets/models/map'), OUT=path.join(SRC,'otimizados');
const JOBS=[
  {file:'escada.glb',tex:1024},
  {file:'grade_de_madeira.glb',tex:1024},
  // tubos médios (0,75 m): trecho longo, suporte e válvula · tubo pequeno (0,36 m): longo e suporte
  {file:'tubulacoes_industriais.glb',tex:1024,keep:/\/ind_pipe_(medium_01_(long|frame_01|valve_01)|small_01_(long|frame_01))_inst_001_[^/]*$/},
  // luminária enferrujada e a pintada de amarelo (a com lente e a verde ficam de fora)
  {file:'lampadas_industriais.glb',tex:512,keep:/Lamp (Rusty|Painted Yellow)_\d+\//}
];

// ---------- GLB ----------
function readGlb(f){
  const b=fs.readFileSync(f); if(b.readUInt32LE(0)!==0x46546C67) throw new Error(f+': não é GLB');
  let o=12, json=null, bin=null;
  while(o<b.length){ const len=b.readUInt32LE(o), type=b.readUInt32LE(o+4), data=b.slice(o+8,o+8+len);
    if(type===0x4E4F534A) json=JSON.parse(data.toString('utf8')); else if(type===0x004E4942) bin=data; o+=8+len; }
  return {j:json,bin};
}
const COMP={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function readAcc(G,i){
  const a=G.j.accessors[i], bv=G.j.bufferViews[a.bufferView], C=COMP[a.componentType], n=NC[a.type], es=C.BYTES_PER_ELEMENT;
  const stride=bv.byteStride||n*es, base=(bv.byteOffset||0)+(a.byteOffset||0), out=new (C===Float32Array?Float32Array:C===Uint32Array?Uint32Array:Float32Array)(a.count*n);
  const dv=new DataView(G.bin.buffer,G.bin.byteOffset,G.bin.byteLength);
  const rd={5120:(o)=>dv.getInt8(o),5121:o=>dv.getUint8(o),5122:o=>dv.getInt16(o,true),5123:o=>dv.getUint16(o,true),5125:o=>dv.getUint32(o,true),5126:o=>dv.getFloat32(o,true)}[a.componentType];
  for(let k=0;k<a.count;k++) for(let c=0;c<n;c++) out[k*n+c]=rd(base+k*stride+c*es);
  if(a.normalized){ const s={5120:127,5121:255,5122:32767,5123:65535}[a.componentType]; for(let k=0;k<out.length;k++) out[k]=Math.max(out[k]/s,-1); }
  return {data:out,n,count:a.count};
}
// matrizes 4×4 coluna-maior (glTF)
const I4=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul(a,b){ const o=new Array(16).fill(0); for(let c=0;c<4;c++) for(let r=0;r<4;r++){ let s=0; for(let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s; } return o; }
function trs(n){
  if(n.matrix) return n.matrix.slice();
  const [x,y,z,w]=n.rotation||[0,0,0,1], [sx,sy,sz]=n.scale||[1,1,1], [tx,ty,tz]=n.translation||[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0, 2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0, 2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0, tx,ty,tz,1];
}
function inv3T(m){   // inversa-transposta do bloco 3×3 (normais)
  const a=m[0],b=m[1],c=m[2],d=m[4],e=m[5],f=m[6],g=m[8],h=m[9],i=m[10];
  const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, det=a*A+b*B+c*C;
  const inv=[A,-(b*i-c*h),b*f-c*e, B,a*i-c*g,-(a*f-c*d), C,-(a*h-b*g),a*e-b*d].map(v=>v/det);   // linhas da inversa (adjunta/det), coluna-maior
  return {n:[inv[0],inv[3],inv[6],inv[1],inv[4],inv[7],inv[2],inv[5],inv[8]],det};
}

// ---------- Chrome: redução e regravação das imagens ----------
async function chromeSession(chrome){
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'silos-otim-')), port=9400+Math.floor(Math.random()*400);
  const ch=spawn(chrome,['--headless=new','--no-first-run','--disable-extensions',`--user-data-dir=${prof}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<60;i++){ try{ await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; }catch(e){ await sleep(250); } }
  const tgt=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend=new Map(); ws.onmessage=ev=>{ const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } };
  const send=(method,params={})=>new Promise(r=>{ const i=++id; pend.set(i,r); ws.send(JSON.stringify({id:i,method,params})); });
  const recode=async(bytes,mime,max,type,q)=>{
    const r=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const bin=atob(${JSON.stringify(bytes.toString('base64'))}), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
      const bmp=await createImageBitmap(new Blob([u],{type:${JSON.stringify(mime)}})), k=Math.min(1,${max}/Math.max(bmp.width,bmp.height));
      const w=Math.max(1,Math.round(bmp.width*k)), h=Math.max(1,Math.round(bmp.height*k)), cv=new OffscreenCanvas(w,h), g=cv.getContext('2d');
      g.imageSmoothingQuality='high'; g.drawImage(bmp,0,0,w,h);
      const out=await cv.convertToBlob({type:${JSON.stringify(type)},quality:${q}}), ab=new Uint8Array(await out.arrayBuffer());
      let s=''; for(let i=0;i<ab.length;i+=32768) s+=String.fromCharCode.apply(null,ab.subarray(i,i+32768));
      return {w0:bmp.width,h0:bmp.height,w,h,b64:btoa(s)}; })()`});
    const v=r.result&&r.result.result&&r.result.result.value; if(!v) throw new Error('Chrome não decodificou a imagem: '+JSON.stringify(r.result&&r.result.exceptionDetails||r));
    return {...v,bytes:Buffer.from(v.b64,'base64')};
  };
  return {recode,close:()=>{ ws.close(); ch.kill(); }};
}

// ---------- um arquivo ----------
async function optimize(job,ch){
  const G=readGlb(path.join(SRC,job.file)), J=G.j, keep=job.keep||/.*/;
  // matrizes de mundo de cada nó
  const world=new Array(J.nodes.length), names=new Array(J.nodes.length);   // names = caminho de nomes até o nó (o filtro olha o caminho)
  const walk=(i,parent,pn)=>{ world[i]=mul(parent,trs(J.nodes[i])); names[i]=pn+'/'+(J.nodes[i].name||''); (J.nodes[i].children||[]).forEach(c=>walk(c,world[i],names[i])); };
  (J.scenes[J.scene||0].nodes).forEach(i=>walk(i,I4(),''));
  const out={asset:{version:'2.0',generator:'silos tools/otimizar_modelos.js',extras:J.asset&&J.asset.extras},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}],materials:[],textures:[],images:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}]};
  const chunks=[]; let off=0;
  const pushView=(buf,target)=>{ const pad=(4-(off%4))%4; if(pad){ chunks.push(Buffer.alloc(pad)); off+=pad; } chunks.push(buf); out.bufferViews.push({buffer:0,byteOffset:off,byteLength:buf.length,...(target?{target}:{})}); off+=buf.length; return out.bufferViews.length-1; };
  const pushAcc=(arr,type,ctype,target,mm)=>{ const buf=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength); const bv=pushView(Buffer.from(buf),target);
    const a={bufferView:bv,componentType:ctype,count:arr.length/NC[type],type}; if(mm){ const n=NC[type], mn=new Array(n).fill(Infinity), mx=new Array(n).fill(-Infinity);
      for(let k=0;k<arr.length;k+=n) for(let c=0;c<n;c++){ mn[c]=Math.min(mn[c],arr[k+c]); mx[c]=Math.max(mx[c],arr[k+c]); } a.min=mn; a.max=mx; }
    out.accessors.push(a); return out.accessors.length-1; };
  const matMap=new Map(), texMap=new Map(), imgMap=new Map(), report=[];
  const alphaMats=new Set((J.materials||[]).map((m,i)=>m.alphaMode&&m.alphaMode!=='OPAQUE'?i:-1).filter(i=>i>=0));
  const image=async(ii,alpha)=>{ if(imgMap.has(ii)) return imgMap.get(ii);
    const im=J.images[ii], bv=J.bufferViews[im.bufferView], bytes=G.bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);
    const r=await ch.recode(bytes,im.mimeType,job.tex,alpha?'image/png':'image/jpeg',.86);
    out.images.push({bufferView:pushView(r.bytes),mimeType:alpha?'image/png':'image/jpeg',name:im.name});
    report.push(`${r.w0}×${r.h0} ${(bytes.length/1e6).toFixed(2)} MB → ${r.w}×${r.h} ${(r.bytes.length/1e6).toFixed(2)} MB`);
    imgMap.set(ii,out.images.length-1); return out.images.length-1; };
  const texture=async(ti,alpha)=>{ const k=ti+'|'+alpha; if(texMap.has(k)) return texMap.get(k);
    out.textures.push({sampler:0,source:await image(J.textures[ti].source,alpha)}); texMap.set(k,out.textures.length-1); return out.textures.length-1; };
  const material=async mi=>{ if(matMap.has(mi)) return matMap.get(mi); const m=JSON.parse(JSON.stringify(J.materials[mi])), alpha=alphaMats.has(mi), pbr=m.pbrMetallicRoughness||{};
    if(pbr.baseColorTexture) pbr.baseColorTexture={index:await texture(pbr.baseColorTexture.index,alpha)};
    if(pbr.metallicRoughnessTexture) pbr.metallicRoughnessTexture={index:await texture(pbr.metallicRoughnessTexture.index,false)};
    for(const k of ['normalTexture','occlusionTexture','emissiveTexture']) if(m[k]) m[k]={...m[k],index:await texture(m[k].index,false)};
    delete m.extensions; out.materials.push(m); matMap.set(mi,out.materials.length-1); return out.materials.length-1; };
  let tris=0;
  for(let ni=0;ni<J.nodes.length;ni++){ const nd=J.nodes[ni]; if(nd.mesh==null) continue; if(!keep.test(names[ni])) continue; const name=names[ni].split('/').filter(Boolean).slice(-2).join('/');
    const M=world[ni], {n:NM,det}=inv3T(M), prims=[];
    for(const p of J.meshes[nd.mesh].primitives){
      const P=readAcc(G,p.attributes.POSITION).data, pos=new Float32Array(P.length);
      for(let k=0;k<P.length;k+=3){ const x=P[k],y=P[k+1],z=P[k+2]; pos[k]=M[0]*x+M[4]*y+M[8]*z+M[12]; pos[k+1]=M[1]*x+M[5]*y+M[9]*z+M[13]; pos[k+2]=M[2]*x+M[6]*y+M[10]*z+M[14]; }
      const attrs={POSITION:pushAcc(pos,'VEC3',5126,34962,true)};
      if(p.attributes.NORMAL!=null){ const N=readAcc(G,p.attributes.NORMAL).data, nn=new Float32Array(N.length);
        for(let k=0;k<N.length;k+=3){ const x=N[k],y=N[k+1],z=N[k+2]; let a=NM[0]*x+NM[3]*y+NM[6]*z, b=NM[1]*x+NM[4]*y+NM[7]*z, c=NM[2]*x+NM[5]*y+NM[8]*z; const l=Math.hypot(a,b,c)||1; nn[k]=a/l; nn[k+1]=b/l; nn[k+2]=c/l; }
        attrs.NORMAL=pushAcc(nn,'VEC3',5126,34962); }
      if(p.attributes.TEXCOORD_0!=null) attrs.TEXCOORD_0=pushAcc(Float32Array.from(readAcc(G,p.attributes.TEXCOORD_0).data),'VEC2',5126,34962);
      let idx=p.indices!=null?Uint32Array.from(readAcc(G,p.indices).data):Uint32Array.from({length:P.length/3},(_,k)=>k);
      if(det<0) for(let k=0;k<idx.length;k+=3){ const t=idx[k+1]; idx[k+1]=idx[k+2]; idx[k+2]=t; }   // espelhamento: inverte a ordem dos triângulos
      tris+=idx.length/3;
      const small=P.length/3<65536, ia=small?Uint16Array.from(idx):idx;
      prims.push({attributes:attrs,indices:pushAcc(ia,'SCALAR',small?5123:5125,34963),material:p.material!=null?await material(p.material):undefined,mode:4});
    }
    out.meshes.push({name,primitives:prims}); out.nodes.push({name,mesh:out.meshes.length-1}); out.scenes[0].nodes.push(out.nodes.length-1);
  }
  if(!out.meshes.length) throw new Error(job.file+': nenhuma malha passou no filtro');
  if(!out.images.length){ delete out.images; delete out.textures; delete out.samplers; }
  const bin=Buffer.concat(chunks), binPad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]); out.buffers[0].byteLength=binPad.length;
  const js=Buffer.from(JSON.stringify(out),'utf8'), jsPad=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
  const head=Buffer.alloc(12); head.writeUInt32LE(0x46546C67,0); head.writeUInt32LE(2,4); head.writeUInt32LE(12+8+jsPad.length+8+binPad.length,8);
  const ch1=Buffer.alloc(8); ch1.writeUInt32LE(jsPad.length,0); ch1.writeUInt32LE(0x4E4F534A,4);
  const ch2=Buffer.alloc(8); ch2.writeUInt32LE(binPad.length,0); ch2.writeUInt32LE(0x004E4942,4);
  const glb=Buffer.concat([head,ch1,jsPad,ch2,binPad]); fs.writeFileSync(path.join(OUT,job.file),glb);
  console.log(`${job.file}: ${(fs.statSync(path.join(SRC,job.file)).size/1e6).toFixed(1)} MB → ${(glb.length/1e6).toFixed(2)} MB · ${out.meshes.length} malhas · ${Math.round(tris)} triângulos`);
  out.meshes.forEach(m=>{ const a=out.accessors[m.primitives[0].attributes.POSITION]; console.log(`   ${m.name}  min ${a.min.map(v=>v.toFixed(2)).join(' ')}  max ${a.max.map(v=>v.toFixed(2)).join(' ')}`); });
  report.forEach(r=>console.log('   textura',r));
}

(async()=>{
  const chrome=process.argv[2]||'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if(!fs.existsSync(chrome)){ console.error('Chrome não encontrado em '+chrome+'. Passe o caminho do executável como argumento.'); process.exit(1); }
  fs.mkdirSync(OUT,{recursive:true});
  const ch=await chromeSession(chrome);
  try{ for(const job of JOBS) await optimize(job,ch); } finally { ch.close(); }
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
