'use strict';
// ============================================================================
// js/core/utils.js — constantes e utilitários compartilhados
// ============================================================================
const V3 = THREE.Vector3;
const W = 4, TOP = 400;   // largura do poço e altura máxima (m)
const EYE = 1.6, BODY_H = 1.75, RAD = 0.3, REACH = 2.0, G = 18, FALL_KILL = 16;
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const LS=(()=>{ try{ const k='__silos'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return localStorage; }catch(e){ return null; } })();
function fmtTime(sec){ sec=Math.max(0,sec||0); const m=Math.floor(sec/60), s=Math.floor(sec%60), c=Math.floor((sec*100)%100);
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(c).padStart(2,'0'); }
const fmtInt=n=>Math.round(n).toLocaleString('pt-BR');
