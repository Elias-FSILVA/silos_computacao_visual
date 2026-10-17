'use strict';
// B1/B2 — picareta GLB de Tiko: bytes, crédito, catálogo e parse real (GLTFLoader r128).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./_axe_asset_harness');
const DIST_REL='assets/models/items/climbing_axe_low_poly.glb', CREDIT_REL='assets/models/items/climbing_axe_low_poly.CREDITS.txt';
let n=0,bad=0;const queue=[];
function test(name,f){queue.push([name,f]);}
function modelDefs(){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(H.ROOT,'js/core/modelDefs.js'),'utf8')+';this.MODEL_DEFS=MODEL_DEFS;',ctx);return ctx.MODEL_DEFS;}

test('distributed_asset_is_the_unaltered_release',()=>{
  const b=fs.readFileSync(path.join(H.ROOT,H.ASSET));assert.equal(b.length,H.BYTES);assert.equal(H.sha(b),H.SHA256);
});
test('catalog_resolves_distributed_bytes',()=>{
  const d=modelDefs().climbing_axe;assert.ok(d,'MODEL_DEFS.climbing_axe ausente');
  assert.equal(d.file,'items/climbing_axe_low_poly.glb');
  // a normalização mora no módulo da picareta (B2), nunca no catálogo: sem escala/rotação/offset do martelo
  assert.ok(d.scale===undefined||d.scale===1);assert.equal(d.rotation,undefined);assert.equal(d.offset,undefined);
  const b=fs.readFileSync(path.join(H.ROOT,'assets/models',d.file));assert.equal(b.length,H.BYTES);assert.equal(H.sha(b),H.SHA256);
});
test('credit_distributed_with_asset',()=>{
  const p=path.join(H.ROOT,CREDIT_REL);assert.ok(fs.existsSync(p),'crédito ausente');const t=fs.readFileSync(p,'utf8');
  for(const s of ['Climbing Axe (Low Poly)','Tiko','https://sketchfab.com/tikoavp','https://sketchfab.com/3d-models/climbing-axe-low-poly-d74bb6a3aad146b5892a28ec5001a5f8',
    'CC BY 4.0','https://creativecommons.org/licenses/by/4.0/',H.SHA256])assert.ok(t.includes(s),'crédito sem: '+s);
  assert.match(t,/normaliza/i);assert.match(t,/espelh/i);assert.match(t,/sem alterar|não altera|inalterad/i);
  const readme=fs.readFileSync(path.join(H.ROOT,'assets/models/README.md'),'utf8');assert.ok(readme.includes('items/climbing_axe_low_poly.glb')&&readme.includes('Tiko'),'README de modelos sem o crédito');
});
test('parse_preserves_geometry_and_materials',async()=>{
  const b=H.summary(await H.loadAxe(DIST_REL));
  assert.equal(b.meshes.length,4);assert.equal(b.tris,774);assert.equal(b.verts,1542);assert.equal(b.animations,0);
  assert.deepEqual(Object.keys(b.materials),['Dark_Metal','Knife','Material.003','Metal.001']);
  for(const m of Object.values(b.materials)){assert.equal(m.map,false);assert.equal(m.type,'MeshStandardMaterial');}
  assert.equal(b.asset.extras.author,'Tiko (https://sketchfab.com/tikoavp)');assert.match(b.asset.extras.license,/^CC-BY-4\.0/);
  assert.equal(b.asset.extras.title,'Climbing Axe (Low Poly)');
});

// ---------------------------------------------------------------- B2: medidas, U e refs (contra a geometria real)
const T=H.THREE;
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg}: ${a} vs ${b}`);
const vnear=(a,b,tol,msg)=>{const A=Array.isArray(a)?a:a.toArray(),B=Array.isArray(b)?b:b.toArray();A.forEach((v,i)=>near(v,B[i],tol,msg+'['+i+']'));};
async function assetCtx(){const g=await H.loadAxe(DIST_REL);const h=H.axeGame(g);assert.ok(fs.existsSync(path.join(H.ROOT,'js/items/climbingAxeAsset.js')),'climbingAxeAsset.js ausente');return {g,h,A:h.G('ClimbingAxeAsset')};}
function rawVerts(g,filter){g.scene.updateMatrixWorld(true);const out=[];g.scene.traverse(o=>{if(!o.isMesh||(filter&&!filter(o)))return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)out.push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});return out;}
test('B2 tip: vértice real da pica, extremo na direção da pica, mapeado por U',async()=>{
  const {g,A}=await assetCtx(),d=A.data,U=new T.Matrix4().fromArray(d.U);
  const mesh=g.scene.getObjectByName(d.glb.tipVertex.mesh);g.scene.updateMatrixWorld(true);
  const v=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,d.glb.tipVertex.index).applyMatrix4(mesh.matrixWorld);
  vnear(v,d.glb.tip,1e-9,'tip raw = vértice');const tipC=v.clone().applyMatrix4(U);vnear(tipC,d.refs.tip,1e-9,'refs.tip = U·vértice');
  const all=rawVerts(g).map(p=>p.applyMatrix4(U));const far=Math.max(...all.map(p=>-p.z));near(-tipC.z,far,1e-9,'ponta é o extremo em −z (pica)');
  assert.ok(tipC.y>0.2,'ponta na cabeça, acima da empunhadura');
});
test('B2 grip: no eixo do cabo, dentro do trecho livre (não origem nem centro da caixa)',async()=>{
  const {g,A}=await assetCtx(),d=A.data,U=new T.Matrix4().fromArray(d.U);
  const ring=rawVerts(g,o=>o.material.name==='Material.003').filter(p=>p.y>d.glb.pommelTop&&p.y<d.glb.spurBottom).map(p=>p.applyMatrix4(U));
  assert.ok(ring.length>=40,'anéis do trecho livre');const rad=ring.map(p=>Math.hypot(p.x,p.z));
  assert.ok(Math.min(...rad)>.004&&Math.max(...rad)<.02,'cabo envolve o grip a 4–20 mm: '+Math.min(...rad)+'..'+Math.max(...rad));
  const cx=ring.reduce((a,p)=>a+p.x,0)/ring.length,cz=ring.reduce((a,p)=>a+p.z,0)/ring.length;assert.ok(Math.hypot(cx,cz)<.003,'centro dos anéis no eixo');
  const quad=new Set(ring.map(p=>(p.x>=0?1:0)+(p.z>=0?2:0)));assert.equal(quad.size,4,'anéis em volta do grip');
  const pommel=new T.Vector3(d.grip[0],d.glb.pommelTop,d.grip[2]).applyMatrix4(U),spur=new T.Vector3(d.grip[0],d.glb.spurBottom,d.grip[2]).applyMatrix4(U);
  assert.ok(pommel.y<0&&spur.y>0,'grip entre o pomo e o apoio do indicador');
  const box=new T.Box3().setFromPoints(rawVerts(g)),c=box.getCenter(new T.Vector3());assert.ok(c.distanceTo(new T.Vector3(...d.grip))>5,'grip não é o centro da caixa');
  vnear(new T.Matrix4().fromArray(d.refs.grip).elements,new T.Matrix4().elements,1e-12,'grip = origem de C');
});
test('B2 eixos: biteAxis/headUp unitários, ortogonais, pica para −z e para baixo',async()=>{
  const {A}=await assetCtx();for(const r of [A.data.refs,A.data.proceduralRefs]){const b=new T.Vector3(...r.biteAxis),u=new T.Vector3(...r.headUp);
    near(b.length(),1,1e-9,'|bite|');near(u.length(),1,1e-9,'|up|');near(b.dot(u),0,1e-9,'bite⊥up');assert.ok(b.z<-.8&&b.y<0,'bite');assert.ok(u.y>.8,'up');}
});
test('B2 U: escala uniforme positiva, comprimento igual ao procedural medido, rotação própria',async()=>{
  const {g,h,A}=await assetCtx(),U=new T.Matrix4().fromArray(A.data.U);const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();U.decompose(p,q,s);
  assert.ok(s.x>0&&U.determinant()>0);near(s.x,s.y,1e-12,'sx=sy');near(s.y,s.z,1e-12,'sy=sz');
  const proc=h.G('makeClimbingAxe')();proc.updateMatrixWorld(true);const pb=new T.Box3().setFromObject(proc);
  const ys=rawVerts(g).map(v=>v.applyMatrix4(U).y);near(Math.max(...ys)-Math.min(...ys),pb.max.y-pb.min.y,1e-6,'comprimento ao longo do cabo');
  near(A.data.proceduralLength,pb.max.y-pb.min.y,1e-9,'data.proceduralLength medido');
  const pr=h.G('makeClimbingAxe')();let apex=null;pr.updateMatrixWorld(true);pr.traverse(o=>{if(o.isMesh&&o.geometry.type==='ConeGeometry'){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);if(!apex||v.z<apex.z)apex=v;}}});
  vnear(apex,A.data.proceduralRefs.tip,1e-9,'ponta procedural = vértice do cone');
});
test('B2 simetria: o GLB em C é o próprio reflexo no plano x=0 (esquerda não precisa de geometria espelhada)',async()=>{
  const {g,A}=await assetCtx(),U=new T.Matrix4().fromArray(A.data.U);const P=rawVerts(g).map(v=>v.applyMatrix4(U));let worst=0;
  for(const p of P){let best=Infinity;for(const q of P){const d=(q.x+p.x)**2+(q.y-p.y)**2+(q.z-p.z)**2;if(d<best)best=d;}worst=Math.max(worst,Math.sqrt(best));}
  assert.ok(worst<1e-6,'desvio '+worst);assert.equal(A.data.symmetricInC,true);
});
test('B2 imutável: data/refs congelados; instâncias com refs próprias; esquerda refletida',async()=>{
  const {A}=await assetCtx(),d=A.data;for(const o of [d,d.glb,d.refs,d.refs.tip,d.proceduralRefs])assert.ok(Object.isFrozen(o));
  const r=A.create({side:1,usage:'hand'}),l=A.create({side:-1,usage:'hand'});assert.equal(r.source,'glb');assert.equal(l.source,'glb');
  assert.notEqual(r.refs.tip,l.refs.tip);assert.notEqual(r.canonical,l.canonical);vnear(r.refs.tip,d.refs.tip,0,'direita');
  vnear(l.refs.tip,[-d.refs.tip[0],d.refs.tip[1],d.refs.tip[2]],0,'esquerda refletida');vnear(l.refs.biteAxis,[-d.refs.biteAxis[0],d.refs.biteAxis[1],d.refs.biteAxis[2]],0,'bite esq');
  assert.ok(l.refs.grip.determinant()>0);r.refs.tip.x=9;vnear(A.data.refs.tip,d.refs.tip,0,'data intacto');assert.notEqual(l.refs.tip.x,9);
});

module.exports={test,queue,H};
// B6: contrato estrutural do smoke de produção (não prova carregamento: o gate é o navegador sobre dist/ via HTTP)
test('production_smoke_has_executable_report',()=>{
  const f=path.join(H.ROOT,'tools/smoke_axe_asset.html');assert.ok(fs.existsSync(f),'tools/smoke_axe_asset.html ausente');
  const s=fs.readFileSync(f,'utf8');
  assert.match(s,/URLSearchParams\(location\.search\)/,'lê os parâmetros da URL');assert.match(s,/get\('base'\)/,'?base=');assert.match(s,/get\('glb'\)/,'?glb= (força falha de rede)');
  assert.match(s,/window\.__axeSmoke\s*=/,'publica window.__axeSmoke');
  for(const k of ['ok','errors','source','hash','meshes','materials','instances'])assert.match(s,new RegExp('\\b'+k+'\\s*:'),'campo '+k);
  assert.match(s,/crypto\.subtle\.digest\('SHA-256'/,'SHA-256 dos bytes servidos');assert.ok(s.includes(H.SHA256),'hash esperado');
  assert.match(s,/climbing_axe:fallback/,'reserva procedural reprova o smoke');
  assert.doesNotMatch(s,/node_modules\//,'não resolve node_modules');
  assert.doesNotMatch(s,/<script[^>]+src=/,'scripts só pela base informada (carregados dinamicamente)');
  // fora da distribuição
  assert.ok(!fs.existsSync(path.join(H.ROOT,'dist/tools')),'smoke não vai para dist/');
});
if(require.main===module)(async()=>{
  for(const extra of process.argv.slice(2))require(path.resolve(extra));
  for(const [name,f] of queue){n++;try{await f();console.log('OK',name);}catch(e){bad++;console.error('FAIL',name,e.stack);}}
  console.log(`${n} testes; falhas: ${bad}`);process.exitCode=bad?1:0;
})();
