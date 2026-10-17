'use strict';
// ============================================================================
// js/items/climbingAxeAsset.js — a picareta GLB de Tiko ("Climbing Axe (Low Poly)", CC BY 4.0) nas mãos e no loot
// Crédito distribuído: assets/models/items/climbing_axe_low_poly.CREDITS.txt. O arquivo nunca é alterado.
//
// Frames:
//   raw  cena do glTF como Models.get('climbing_axe') devolve (catálogo SEM ajuste; unidades do arquivo, ~cm)
//   C    frame canônico da picareta, o mesmo do makeClimbingAxe(): origem na empunhadura (grip), cabo em +y,
//        pica (ponta que crava) para −z, espessura em x. A montagem na mão (ITEM_DEFS.item) posiciona C.
//   U    raw→C: escala uniforme positiva · rotação · translação (−grip). Aplicada UMA vez, no nó `axeU`.
// Hierarquia de uma instância: canonical (C→pai) → axeU (U) → raw (Models.get) → nós/malhas do glTF.
//
// Medidas: tiradas do arquivo original por tools/test_axe_asset.js (que confere cada número contra a geometria).
// Nada aqui é coordenada inventada: ver `data.explain`.
// ============================================================================
const ClimbingAxeAsset=(()=>{
  const V=(a)=>new THREE.Vector3(a[0],a[1],a[2]);
  // ---------------------------------------------------------------- medidas do GLB (frame raw)
  const GLB=Object.freeze({
    // cabo (malha vermelha "Material.003"): eixo por PCA dos anéis do cabo, sem o apoio do indicador (y 41–51)
    shaftPoint:Object.freeze([476.60633956012884,52.402795158906265,0.6966565420776263]),
    shaftDir:Object.freeze([0.0006801322734507137,0.9999997687100172,4.836848567397334e-8]),
    // espessura: o modelo é simétrico no plano z = 0,69666 (desvio medido 0); normal desse plano
    thicknessDir:Object.freeze([0,0,1]),
    // trecho livre do cabo: do topo do pomo ("Dark_Metal", y 23,8045) ao início do apoio do indicador (y 42,2012)
    pommelTop:23.804495545707816, spurBottom:42.20122462824507,
    // ponta da pica: vértice 280 da malha "Climbing_Axe_Metal001_0" (o mais distante do cabo; 375/474/571 coincidem)
    tipVertex:Object.freeze({mesh:'Climbing_Axe_Metal001_0',index:280}),
    tip:Object.freeze([507.138528522843,81.7196092610496,0.6966573638114611]),
    // direção de cravada: da média dos vértices da pica a 3–6 unidades da ponta até a ponta (68 vértices)
    bite:Object.freeze([0.8937603469449866,-0.4485448051519229,-2.8530498229485016e-8]),
    // extensão total ao longo do cabo (do bico do pomo ao topo da cabeça)
    lengthAlongShaft:74.23528847475771
  });
  // extensão longitudinal (y) do makeClimbingAxe(), medida pelo Box3 das malhas: a GLB fica do mesmo tamanho
  const PROCEDURAL_LENGTH=0.4875000004470348;
  // ponta/direção da picareta procedural (reserva): vértice do cone da ponta curva, eixo do cone
  const PROC=Object.freeze({tip:Object.freeze([0,0.2589510342683302,-0.20201341246678345]),bite:Object.freeze([0,Math.cos(-Math.PI/2-.45),Math.sin(-Math.PI/2-.45)])});

  // ---------------------------------------------------------------- U e referências (calculadas uma vez, no 1º uso)
  let K=null;
  function init(){ if(K) return K;
  const shaftDir=V(GLB.shaftDir).normalize();
  // grip: ponto do eixo do cabo na metade do trecho livre (onde o punho fecha)
  const gripY=(GLB.pommelTop+GLB.spurBottom)/2, sp=V(GLB.shaftPoint);
  const grip=sp.clone().addScaledVector(shaftDir,(gripY-sp.y)/shaftDir.y);
  const xC=V(GLB.thicknessDir).addScaledVector(shaftDir,-V(GLB.thicknessDir).dot(shaftDir)).normalize();
  const zC=new THREE.Vector3().crossVectors(xC,shaftDir).normalize();
  const basis=new THREE.Matrix4().makeBasis(xC,shaftDir,zC);           // C→raw (rotação)
  const R=basis.clone().transpose();                                    // raw→C
  const scale=PROCEDURAL_LENGTH/GLB.lengthAlongShaft;
  const U=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-grip.x,-grip.y,-grip.z));
  const uPos=new THREE.Vector3(), uQuat=new THREE.Quaternion(), uScl=new THREE.Vector3(); U.decompose(uPos,uQuat,uScl);
  K={grip,R,U,scale,uPos,uQuat,uScl,REFS_GLB:null,REFS_PROC:null};
  K.REFS_GLB=makeRefs(V(GLB.tip).applyMatrix4(U),V(GLB.bite).applyMatrix4(R)); K.REFS_PROC=makeRefs(V(PROC.tip),V(PROC.bite));
  K.data=Object.freeze({glb:GLB,proceduralLength:PROCEDURAL_LENGTH,procedural:PROC,scale,grip:Object.freeze(grip.toArray()),
    U:Object.freeze(U.toArray()),R:Object.freeze(R.toArray()),refs:K.REFS_GLB,proceduralRefs:K.REFS_PROC,
    // o GLB é simétrico no plano x=0 de C (desvio máximo medido 0): a esquerda usa a mesma geometria; só as refs refletem
    symmetricInC:true,explain:EXPLAIN});
  return K; }
  function orthoUp(bite){ const up=new THREE.Vector3(0,1,0); return up.addScaledVector(bite,-up.dot(bite)).normalize(); }
  function makeRefs(tip,bite){ const b=bite.clone().normalize(); return Object.freeze({grip:Object.freeze(new THREE.Matrix4().toArray()),tip:Object.freeze(tip.toArray()),biteAxis:Object.freeze(b.toArray()),headUp:Object.freeze(orthoUp(b).toArray())}); }
  // refs vivas por instância (cópias novas); esquerda = reflexo no plano x=0 de C (Handedness), sem escala negativa
  function liveRefs(src,side){
    const m=v=>{ const o=V(v); if(side<0) o.x=-o.x; return o; };
    const g=new THREE.Matrix4().fromArray(src.grip); if(side<0){ const M=new THREE.Matrix4().makeScale(-1,1,1); g.premultiply(M).multiply(M); }
    return {grip:g,tip:m(src.tip),biteAxis:m(src.biteAxis),headUp:m(src.headUp)};
  }

  const EXPLAIN=Object.freeze({
    grip:'eixo do cabo (PCA dos anéis da malha Material.003) na metade do trecho livre entre o topo do pomo (Dark_Metal) e o apoio do indicador',
    tip:'vértice 280 de Climbing_Axe_Metal001_0: o mais distante do cabo na direção da pica',
    biteAxis:'da média dos vértices da pica a 3–6 unidades da ponta até a ponta',
    headUp:'+y de C (cabo) ortogonalizado contra biteAxis',
    scale:'comprimento ao longo do cabo igual ao do makeClimbingAxe() (Box3 em y)'});
  let warned=false;
  const api={
    get data(){ return init().data; },
    // AxeInstance = {canonical, raw, refs, source:'glb'|'procedural', side}
    create({side=1,usage='hand',fallback}={}){
      const k=init(), s=side<0?-1:1, canonical=new THREE.Group(); canonical.name='climbing_axe';
      const raw=typeof Models!=='undefined'&&Models.get?Models.get('climbing_axe'):null;
      let inst;
      if(raw){
        warned=false;
        const u=new THREE.Group(); u.name='axeU'; u.position.copy(k.uPos); u.quaternion.copy(k.uQuat); u.scale.copy(k.uScl);
        u.add(raw); canonical.add(u);
        // materiais do arquivo: só leitura (o tint da pele usa material próprio do HandModel)
        // geometria do cache (Models): compartilhada por mãos e loot; dono é o cache, não o World (reset) nem o streaming
        raw.traverse(o=>{ if(o.isMesh){ o.userData.sharedAsset=true; o.geometry.userData.shared=true; o.geometry.userData.modelCache=true;
          if(usage==='hand') o.frustumCulled=false; } });   // loot no mundo mantém o culling
        inst={canonical,raw,refs:liveRefs(k.REFS_GLB,s),source:'glb',side:s,usage};
      } else {
        if(!warned){ warned=true; console.warn('[climbing_axe:fallback] modelo GLB indisponível (assets/models/items/climbing_axe_low_poly.glb); usando a picareta feita por código'); }
        const mesh=(fallback||(()=>new THREE.Group()))(); canonical.add(mesh);
        inst={canonical,raw:mesh,refs:liveRefs(k.REFS_PROC,s),source:'procedural',side:s,usage};
      }
      canonical.userData.axeInstance=inst;
      return inst;
    },
    // fábrica para ITEM_DEFS: devolve o Object3D (canonical) com userData.axeInstance
    factory(usage,fallback){ return side=>api.create({side,usage,fallback}).canonical; },
    // loot no mundo: instância própria (refs próprias) dentro de um wrapper só do pickup. C já é o frame do
    // makeClimbingAxe(), então o wrapper fica na identidade (mesma pose/tamanho do loot procedural); ajustes do
    // loot vão SÓ no wrapper, nunca no socket da mão nem nas refs.
    pickup(fallback){ const w=new THREE.Group(); w.name='axePickup'; w.add(api.create({side:1,usage:'pickup',fallback}).canonical); return w; }
  };
  return api;
})();
