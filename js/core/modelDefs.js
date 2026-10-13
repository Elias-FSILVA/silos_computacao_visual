'use strict';
// ============================================================================
// js/core/modelDefs.js — catálogo dos modelos 3D (arquivos em assets/models/)
// Cada entrada diz o arquivo e o ajuste para o modelo baixado casar com o jogo:
//   scale     escala uniforme
//   rotation  [x,y,z] em radianos
//   offset    [x,y,z] em metros, aplicado depois da rotação
//   skinned   true para modelos com esqueleto (clonados com SkeletonUtils)
// O código do jogo usa só o id (Models.get('hammer')); se o modelo não carregar, cai no modelo feito por código.
// ============================================================================
const MODEL_DEFS={
  // mesmo eixo do makeHammer(): cabo ao longo de +y (base em y≈-.07, cabeça em y≈.29), orelha voltada para +z
  hammer:{file:'items/martelo.glb',scale:1,rotation:[0,Math.PI,0],offset:[0,.2,0]},
  // mãos com esqueleto: pulso na origem, dedos para +y, palma para +z (o HandModel gira para o seu espaço)
  // ossos esperados: <Index|Middle|Ring|Pinky>_<Proximal|Intermediate|Distal>, Thumb_<Metacarpal|Proximal|Distal>
  handR:{file:'player/hand_lowpoly_rigged.glb',skinned:true,scale:1},
  handL:{file:'player/hand_lowpoly_rigged_left.glb',skinned:true,scale:1},
  // peças do mapa (js/world/Climbs.js lê as malhas pelo nome; a colisão é sempre a das primitivas). São as cópias de
  // assets/models/map/otimizados — texturas ≤ 1024 px e só as malhas usadas (gere de novo com tools/otimizar_modelos.js)
  mapLadder:{file:'map/otimizados/escada.glb'},                    // escada de manutenção danificada (degraus que faltam)
  mapGrid:{file:'map/otimizados/grade_de_madeira.glb'},            // andaimes improvisados
  mapPipes:{file:'map/otimizados/tubulacoes_industriais.glb'},     // tubo de 0,75 m que atravessa o poço
  mapLamps:{file:'map/otimizados/lampadas_industriais.glb'}        // luminárias que marcam a rota (amarela = ferramenta)
};
