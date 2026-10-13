const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=process.argv[2]||path.join(__dirname,'..');
// ---------- THREE falso ----------
class V3{ constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;} clone(){return new V3(this.x,this.y,this.z);}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;} addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);} setY(y){this.y=y;return this;} length(){return Math.hypot(this.x,this.y,this.z);} lengthSq(){return this.x**2+this.y**2+this.z**2;}
  normalize(){ const l=this.length()||1; return this.multiplyScalar(1/l); } divideScalar(s){ return this.multiplyScalar(1/s); } subVectors(a,b){ this.x=a.x-b.x; this.y=a.y-b.y; this.z=a.z-b.z; return this; } addVectors(a,b){ this.x=a.x+b.x; this.y=a.y+b.y; this.z=a.z+b.z; return this; }
  dot(v){ return this.x*v.x+this.y*v.y+this.z*v.z; } lerp(v,t){ this.x+=(v.x-this.x)*t; this.y+=(v.y-this.y)*t; this.z+=(v.z-this.z)*t; return this; } lerpVectors(a,b,t){ return this.copy(a).lerp(b,t); }
  setLength(l){ return this.normalize().multiplyScalar(l); } negate(){ return this.multiplyScalar(-1); } setFromMatrixPosition(){ return this; } transformDirection(){return this;} applyQuaternion(){return this;} }
class Obj{ constructor(geo,mat){ this.geometry=geo; this.material=mat; this.position=new V3(); this.rotation={x:0,y:0,z:0,order:'XYZ',set(x,y,z){this.x=x;this.y=y;this.z=z;}}; this.quaternion={setFromUnitVectors(){return this;},copy(){return this;}};
  this.scale={x:1,y:1,z:1,set(){},setScalar(){}}; this.children=[]; this.userData={}; this.parent=null; this.visible=true; this.intensity=1; this.color={setHex(){},copy(){return this;}}; }
  add(...c){ for(const o of c){ this.children.push(o); o.parent=this; } return this; } remove(o){ const i=this.children.indexOf(o); if(i>=0){ this.children.splice(i,1); o.parent=null; } return this; }
  traverse(f){ f(this); this.children.forEach(c=>c.traverse(f)); } updateMatrixWorld(){} lookAt(){} rotateZ(){} getWorldPosition(v){ return v.copy(this.position); } localToWorld(v){return v;} }
class Geo{ constructor(w,h,d){ this.parameters={w,h,d}; this.attributes={uv:{getX:()=>0,getY:()=>0,setXY(){},needsUpdate:false}}; this.userData={}; } translate(){return this;} rotateX(){return this;} dispose(){} }
class BufGeo{ constructor(){ this.attributes={}; this.userData={}; this.parameters={}; } setAttribute(k,v){ this.attributes[k]=v; return this; } setIndex(){ return this; } addGroup(){} translate(){ return this; } computeBoundingSphere(){} computeVertexNormals(){} rotateX(){ return this; } dispose(){} }
class F32Attr{ constructor(a,n){ this.array=a; this.itemSize=n; this.count=a.length/n; } }
class Mat{ constructor(o={}){ Object.assign(this,o); this.color=Object.assign({setHex(){},setRGB(){},copy(){return this;},lerp(){return this;}},o.color!=null?{v:o.color}:{}); this.userData={}; this.emissive={setHex(){},setRGB(){}}; } }
class Tex{ constructor(c){ this.image=c; this.userData={}; this.repeat={set(){}}; } }
const noopCtx=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createLinearGradient'?()=>({addColorStop(){}}):k==='measureText'?()=>({width:10}):()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
global.document={createElement:()=>({width:0,height:0,getContext:()=>noopCtx})};
global.THREE={Vector3:V3,Vector2:class{},Group:Obj,Mesh:Obj,PointLight:Obj,AmbientLight:Obj,Scene:Obj,PerspectiveCamera:Obj,
  Sprite:Obj,SpriteMaterial:Mat,BoxGeometry:Geo,PlaneGeometry:Geo,CylinderGeometry:Geo,SphereGeometry:Geo,TorusGeometry:Geo,RingGeometry:Geo,CircleGeometry:Geo,BufferGeometry:BufGeo,Float32BufferAttribute:F32Attr,Object3D:class extends Obj{ updateMatrix(){} },InstancedMesh:class extends Obj{ constructor(g,m,n){ super(g,m); this.count=n; this.instanceMatrix={}; } setMatrixAt(){} },
  MeshStandardMaterial:Mat,MeshBasicMaterial:Mat,CanvasTexture:Tex,Raycaster:class{},Color:class{setHex(){}},FogExp2:class{},
  RepeatWrapping:1,DoubleSide:2,LinearToneMapping:1,Quaternion:class{},Euler:class{},Matrix4:class{},WebGLRenderer:class{}};
global.window=global; global.localStorage=undefined; global.performance={now:()=>0};
function load(rel){ const f=path.join(ROOT,rel); vm.runInThisContext(fs.readFileSync(f,'utf8'),{filename:rel}); }
['js/core/utils.js','js/world/textures.js','js/world/assets.js','js/world/levelData.js','js/world/Collision.js','js/world/World.js','js/world/Halls.js','js/items/itemDefs.js','js/items/Inventory.js',
 'js/interaction/Interactables.js','js/world/Sectors.js','js/world/Climbs.js','js/systems/MassSystem.js','js/systems/progress.js','js/systems/PuzzleSystem.js','js/systems/HallPuzzles.js'].forEach(load);


const scene=new Obj(); const world=vm.runInThisContext('(s)=>new World(s)')(scene);
const noopCtxExport=noopCtx;
module.exports={V3,Obj,world,scene,vm,ROOT,noopCtx:noopCtxExport,load};
