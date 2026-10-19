'use strict';
// ============================================================================
// js/player/AxeContactPose.js — pose visual da picareta cravada (solver puro: sem câmera, Player ou World)
// Entradas físicas: ponto A e normal N da âncora (Hand.point/normal, já calculados pela física). Saída: a matriz
// mundial desejada do frame C da ferramenta (ClimbingAxeAsset) e a raiz da mão que a realiza.
//   Q: biteAxis → −N (a pica entra na superfície); headUp → tangente u no plano da superfície
//   T = A − Q·tip  (C→mundo; U já está abaixo de C e não é reaplicada)
// u nasce da vertical do mundo projetada (cabo para cima numa parede); na singularidade (N ≈ ±y) usa uma tangente
// fixa do mundo. Depois é TRANSPORTADA de quadro a quadro (projeção no novo plano), sem trocar de eixo bruscamente.
// ContactFrame = {normal, tangent, point}: pertence a uma mão/âncora; nada é compartilhado entre mãos.
// ============================================================================
const AxeContactPose=(()=>{
  const _n=new THREE.Vector3(), _u=new THREE.Vector3(), _b=new THREE.Vector3(), _h=new THREE.Vector3(), _s=new THREE.Vector3(),
    _bw=new THREE.Vector3(), _sw=new THREE.Vector3(), _t=new THREE.Vector3(), _C=new THREE.Matrix4(), _W=new THREE.Matrix4(),
    _m1=new THREE.Matrix4(), _m2=new THREE.Matrix4();
  const SINGULAR=.999;   // |N·y| acima disto: a vertical projetada não define o roll
  function stableTangent(N,out){
    if(Math.abs(N.y)<SINGULAR){ out.set(0,1,0); }
    else out.set(0,0,-1);                    // piso/teto: tangente fixa do mundo (determinística, nunca a câmera)
    out.addScaledVector(N,-out.dot(N));
    if(out.lengthSq()<1e-10){ out.set(1,0,0).addScaledVector(N,-N.x); }
    return out.normalize();
  }
  const api={
    capture(point,normal,refs,frame){
      const f=frame||{normal:new THREE.Vector3(),tangent:new THREE.Vector3(),point:new THREE.Vector3()};
      f.normal.copy(normal).normalize(); stableTangent(f.normal,f.tangent); f.point.copy(point); return f;
    },
    // escreve em out a matriz C→mundo desejada; transporta a tangente do frame para a normal atual
    solve(frame,point,normal,refs,out){
      const N=_n.copy(normal).normalize();
      const u=_u.copy(frame.tangent).addScaledVector(N,-frame.tangent.dot(N));
      if(u.lengthSq()<1e-8) stableTangent(N,u); else u.normalize();
      frame.tangent.copy(u); frame.normal.copy(N); frame.point.copy(point);
      const b=_b.copy(refs.biteAxis).normalize(), h=_h.copy(refs.headUp).addScaledVector(b,-refs.headUp.dot(b)).normalize(), s=_s.crossVectors(b,h);
      const bw=_bw.copy(N).negate(), sw=_sw.crossVectors(bw,u);
      _C.makeBasis(b,h,s); _W.makeBasis(bw,u,sw);
      out.multiplyMatrices(_W,_C.transpose());                       // Q = W·Cᵀ (rotação própria)
      const tip=_t.copy(refs.tip).applyMatrix4(out);                  // Q·tip (out ainda sem translação)
      out.setPosition(point.x-tip.x,point.y-tip.y,point.z-tip.z);
      return out;
    },
    // posiciona a raiz da mão para que `canonical` fique em desiredToolWorld, mantendo a composição local
    // (wrist/base/socket/montagem) do quadro atual: rootToC é medido AGORA, nunca de um quadro anterior
    applyHandRoot(handRoot,canonical,desiredToolWorld){
      if(handRoot.parent) handRoot.parent.updateWorldMatrix(true,false);
      handRoot.updateMatrixWorld(true); canonical.updateWorldMatrix(true,false);
      const rootToC=_m1.copy(handRoot.matrixWorld).invert().multiply(canonical.matrixWorld);
      const rootW=_m2.multiplyMatrices(desiredToolWorld,rootToC.invert());
      if(handRoot.parent) rootW.premultiply(_m1.copy(handRoot.parent.matrixWorld).invert());
      rootW.decompose(handRoot.position,handRoot.quaternion,handRoot.scale);
      handRoot.updateMatrixWorld(true);
    }
  };
  return api;
})();
