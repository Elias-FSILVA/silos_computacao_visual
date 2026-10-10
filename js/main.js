'use strict';
// ============================================================================
// js/main.js — ponto de entrada: carrega os modelos 3D do catálogo e então instancia o jogo
// ============================================================================
Models.preload(MODEL_DEFS).then(()=>{ window.__silos=new Game(); });
