'use strict';
// ============================================================================
// js/world/surfaces.js — classes de superfície compartilhadas
// Picareta (Climbing Axe): a classificação é EXPLÍCITA — só crava onde o construtor marcou userData.axe=true
// (rachaduras e faixas de rocha). O material não decide nada, e as exclusões sempre vencem a marca:
// noAxe, qualquer interativo (portas, quebráveis, paredes que aceitam prego, puzzles) e os tipos abaixo.
// Concreto (fincada rasa, axeBiteOf) é uma classe à parte: segura pior, solta sozinha e gasta a picareta.
// ============================================================================
const AXE_EXCLUDE_TYPES=['door','breakable','plate','rope','pipe','nail','hold'];
function isAxeSurface(obj){
  const u=obj&&obj.userData; if(!u||u.axe!==true) return false;
  if(u.noAxe||u.interactable||AXE_EXCLUDE_TYPES.includes(u.type)) return false;
  return true;
}
// Que fincada a picareta dá em obj: 'deep' (rocha e rachadura, isAxeSurface) | 'shallow' (concreto, tijolo e pedra:
// as paredes que aceitam prego, userData.concrete) | null. Concreto que é puzzle/botão (outro interativo) não conta.
// A face precisa ser parede (Player.axeTarget confere a normal).
function axeBiteOf(obj){
  if(isAxeSurface(obj)) return 'deep';
  const u=obj&&obj.userData; if(!u||u.concrete!==true||u.noAxe||AXE_EXCLUDE_TYPES.includes(u.type)) return null;
  if(u.interactable&&u.interactable.kind!=='concrete') return null;
  return 'shallow';
}
