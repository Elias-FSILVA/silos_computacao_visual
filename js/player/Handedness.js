'use strict';
// ============================================================================
// js/player/Handedness.js — lateralidade das mãos num único ponto
// Poses, animações e montagens de itens são escritas no espaço da mão DIREITA (canônico).
// A mão esquerda é o reflexo no plano x=0 (M = diag(−1,1,1)) do espaço da câmera/da mão:
//   posição (x,y,z) → (−x,y,z) · rotação Euler (x,y,z) → (x,−y,−z) (vale em qualquer ordem: M·R·M)
// Nenhum Object3D recebe escala negativa (evita faces invertidas); um item quiral usa geometria espelhada nova.
// ============================================================================
const Handedness={
  sideOf(handIndex){ return handIndex===0?-1:1; },
  mirrorEuler(src,side,out){
    const x=Array.isArray(src)?src[0]:src.x, y=Array.isArray(src)?src[1]:src.y, z=Array.isArray(src)?src[2]:src.z;
    out[0]=x; out[1]=side<0?-y:y; out[2]=side<0?-z:z; return out;
  },
  mirrorVec(src,side,out){ return out.set(side<0?-src.x:src.x,src.y,src.z); },
  // pose canônica (espaço da direita) → pose do lado `side`; out.base é um array próprio de `out`
  toSide(canon,side,out){
    Handedness.mirrorVec(canon.pos,side,out.pos);
    const w=canon.wrist; out.wrist.set(w.x,side<0?-w.y:w.y,side<0?-w.z:w.z);
    if(!out._ownBase){ out._ownBase=[0,0,0]; }
    out.base=Handedness.mirrorEuler(canon.base,side,out._ownBase);
    out.roll=side<0?-(canon.roll||0):(canon.roll||0);
    out.visible=canon.visible; out.grip=canon.grip; out.grip2=canon.grip2; out.blend=canon.blend; out.squeeze=canon.squeeze; out.tremor=canon.tremor;
    return out;
  },
  // transformação do item dentro do socket da mão, no lado `side`
  mountTransform(item,side,mesh){
    const p=item.p, r=item.r||[0,0,0];
    mesh.position.set(side<0?-p[0]:p[0],p[1],p[2]);
    mesh.rotation.set(r[0],side<0?-r[1]:r[1],side<0?-r[2]:r[2]);
    if(item.s) mesh.scale.setScalar(item.s);   // a escala do catálogo de modelos fica no grupo de dentro
    return mesh;
  },
  // clone com x negado (posição e normal) e a ordem dos triângulos invertida (mantém as faces para fora)
  mirrorGeometryX(geo){
    const g=geo.clone();
    for(const k of ['position','normal']){ const a=g.attributes[k]; if(!a) continue; for(let i=0;i<a.count;i++) a.setX(i,-a.getX(i)); a.needsUpdate=true; }
    if(g.index){ const ix=g.index.array; for(let i=0;i<ix.length;i+=3){ const t=ix[i+1]; ix[i+1]=ix[i+2]; ix[i+2]=t; } g.index.needsUpdate=true; }
    else for(const k of Object.keys(g.attributes)){ const a=g.attributes[k], n=a.itemSize;
      for(let i=0;i+2<a.count;i+=3) for(let c=0;c<n;c++){ const t=a.array[(i+1)*n+c]; a.array[(i+1)*n+c]=a.array[(i+2)*n+c]; a.array[(i+2)*n+c]=t; } a.needsUpdate=true; }
    return g;
  },
  // reflexo de um objeto inteiro (item quiral): geometrias espelhadas e transformações locais refletidas, escala positiva
  mirrorMesh(obj){
    obj.traverse(o=>{
      if(o!==obj){ o.position.x=-o.position.x; o.rotation.set(o.rotation.x,-o.rotation.y,-o.rotation.z); }
      if(o.isMesh) o.geometry=Handedness.mirrorGeometryX(o.geometry);
    });
    return obj;
  }
};
