'use strict';
// ============================================================================
// js/world/surfaces.js — classes de superfície compartilhadas
// Picareta (Climbing Axe): a classificação é EXPLÍCITA — só crava onde o construtor marcou userData.axe=true
// (rachaduras e faixas de rocha). O material não decide nada, e as exclusões sempre vencem a marca:
// noAxe, qualquer interativo (portas, quebráveis, paredes que aceitam prego, puzzles) e os tipos abaixo.
// ============================================================================
const AXE_EXCLUDE_TYPES=['door','breakable','plate','rope','pipe','nail','hold'];
function isAxeSurface(obj){
  const u=obj&&obj.userData; if(!u||u.axe!==true) return false;
  if(u.noAxe||u.interactable||AXE_EXCLUDE_TYPES.includes(u.type)) return false;
  return true;
}
