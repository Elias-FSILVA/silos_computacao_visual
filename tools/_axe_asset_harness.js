'use strict';
// Harness da picareta GLB: Three.js REAL (r128) + GLTFLoader REAL lendo os bytes do arquivo; nenhum stub de GLB.
// O .glb de Tiko não tem texturas, então o parse dispensa navegador (o smoke HTTP do build continua obrigatório).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const THREE=require('three');
const ROOT=path.join(__dirname,'..');
// Fonte única: a cópia distribuída (bytes idênticos à publicação de Tiko, travados pelo SHA-256 abaixo).
const ASSET='assets/models/items/climbing_axe_low_poly.glb';
const SHA256='f7bc04657843194aed6b702de0101b6c64238d6dc2be6911d300b0e5be8dde53', BYTES=50980;
if(!THREE.GLTFLoader||!THREE.SkeletonUtils){
  const ctx=vm.createContext({THREE,console,TextDecoder,URL,Blob:require('node:buffer').Blob,self:{},window:{}});
  if(!THREE.GLTFLoader) vm.runInContext(fs.readFileSync(path.join(ROOT,'node_modules/three/examples/js/loaders/GLTFLoader.js'),'utf8'),ctx,{filename:'GLTFLoader.js'});
  if(!THREE.SkeletonUtils) vm.runInContext(fs.readFileSync(path.join(ROOT,'node_modules/three/examples/js/utils/SkeletonUtils.js'),'utf8'),ctx,{filename:'SkeletonUtils.js'});
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// rel: caminho relativo à raiz do repositório
function parseBytes(buf){
  const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  return new Promise((res,rej)=>new THREE.GLTFLoader().parse(ab,'',res,rej));
}
function loadAxe(rel){ return parseBytes(fs.readFileSync(path.join(ROOT,rel))); }
// resumo comparável de um gltf carregado: malhas, materiais, triângulos, animações
function summary(gltf){
  const meshes=[],mats=new Map();let tris=0,verts=0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{ if(!o.isMesh) return; meshes.push(o.name); const g=o.geometry; verts+=g.attributes.position.count; tris+=(g.index?g.index.count:g.attributes.position.count)/3;
    const m=o.material; mats.set(m.name,{color:m.color.toArray().map(v=>+v.toFixed(6)),metalness:m.metalness,roughness:m.roughness,side:m.side,map:!!m.map,type:m.type}); });
  return {meshes,materials:Object.fromEntries([...mats].sort()),tris,verts,animations:(gltf.animations||[]).length,asset:gltf.asset};
}
// jogo de itens (Three real, HandModel, Player, ItemSystem) com o Models REAL (js/core/models.js) servindo o GLB parseado.
// gltf=null: catálogo vazio, como quando o arquivo não carrega (caminho de reserva).
function axeGame(gltf,extra=[],hands=null){
  const h=require('./_items_harness')(['js/core/modelDefs.js','js/core/models.js',...extra]);
  const ready=h.G('Models').ready, defs=h.G('MODEL_DEFS');
  if(gltf) ready.set('climbing_axe',{scene:gltf.scene,animations:gltf.animations||[],def:defs.climbing_axe});
  if(hands) for(const id of ['handR','handL']) ready.set(id,{scene:hands[id].scene,animations:hands[id].animations||[],def:defs[id]});
  return h;
}
// mãos com esqueleto (assets/models/player): só as TEXTURAS são removidas antes do parse (Node não decodifica PNG);
// malha, esqueleto, ossos e animações ficam como no arquivo
function stripTextures(b){
  const jl=b.readUInt32LE(12), j=JSON.parse(b.slice(20,20+jl).toString('utf8'));
  delete j.images; delete j.textures; delete j.samplers;
  for(const m of j.materials||[]){ const p=m.pbrMetallicRoughness||{}; delete p.baseColorTexture; delete p.metallicRoughnessTexture; delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture; }
  if(j.extensionsUsed) j.extensionsUsed=j.extensionsUsed.filter(e=>!/texture/i.test(e));
  let js=Buffer.from(JSON.stringify(j),'utf8'); js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
  const rest=b.slice(20+jl), head=Buffer.alloc(20); head.write('glTF',0); head.writeUInt32LE(2,4); head.writeUInt32LE(20+js.length+rest.length,8); head.writeUInt32LE(js.length,12); head.writeUInt32LE(0x4E4F534A,16);
  return Buffer.concat([head,js,rest]);
}
let handsP=null;
function loadHands(){ return handsP||(handsP=Promise.all(['player/hand_lowpoly_rigged.glb','player/hand_lowpoly_rigged_left.glb'].map(f=>parseBytes(stripTextures(fs.readFileSync(path.join(ROOT,'assets/models',f)))))).then(([R,L])=>({handR:R,handL:L}))); }
module.exports={THREE,ROOT,ASSET,SHA256,BYTES,sha,parseBytes,loadAxe,summary,axeGame,loadHands,stripTextures};
