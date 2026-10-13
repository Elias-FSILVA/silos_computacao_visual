'use strict';
// ============================================================================
// js/core/utils.js — constantes e utilitários compartilhados
// ============================================================================
const V3 = THREE.Vector3;
// o silo: um cilindro gigante. O POÇO (por onde se escala) é o núcleo oco de raio SHAFT_R; a parede dele tem SHELL_T de
// espessura; as alas, salas e corredores ficam no corpo do silo, entre o poço e a casca externa (SILO_R).
const SHAFT_R = 6, SHELL_T = .5, SILO_R = 44, TOP = 400;   // m
const EYE = 1.6, BODY_H = 1.75, RAD = 0.3, REACH = 2.0, G = 18, FALL_KILL = 16;
// ângulos no plano: θ = atan2(z, x) · leste (+x) = 0 · sul (+z) = π/2 · oeste = π · norte (−z) = −π/2
const TAU = Math.PI*2;
const wrap2=a=>((a%TAU)+TAU)%TAU;                                   // [0, 2π)
const wrapPi=a=>{ a=wrap2(a); return a>Math.PI?a-TAU:a; };         // (−π, π]
const polar=(r,a,y=0)=>new V3(r*Math.cos(a),y,r*Math.sin(a));
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const LS=(()=>{ try{ const k='__silos'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return localStorage; }catch(e){ return null; } })();
function fmtTime(sec){ sec=Math.max(0,sec||0); const m=Math.floor(sec/60), s=Math.floor(sec%60), c=Math.floor((sec*100)%100);
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(c).padStart(2,'0'); }
const fmtInt=n=>Math.round(n).toLocaleString('pt-BR');
