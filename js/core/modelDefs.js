'use strict';
// ============================================================================
// js/core/modelDefs.js — catálogo dos modelos 3D (arquivos em assets/models/)
// Cada entrada diz o arquivo e o ajuste para o modelo baixado casar com o jogo:
//   scale     escala uniforme
//   rotation  [x,y,z] em radianos
//   offset    [x,y,z] em metros, aplicado depois da rotação
// O código do jogo usa só o id (Models.get('hammer')); se o modelo não carregar, cai no modelo feito por código.
// ============================================================================
const MODEL_DEFS={
  // mesmo eixo do makeHammer(): cabo ao longo de +y (base em y≈-.07, cabeça em y≈.29), orelha voltada para +z
  hammer:{file:'items/martelo.glb',scale:1,rotation:[0,Math.PI,0],offset:[0,.2,0]}
  // mao_direita.glb / mao_esquerda.glb: sem esqueleto (dedos não dobram); as mãos continuam as do HandModel
};
