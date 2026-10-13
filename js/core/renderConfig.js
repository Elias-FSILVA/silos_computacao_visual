'use strict';
// ============================================================================
// js/core/renderConfig.js — TODAS as distâncias de renderização, neblina, luzes e qualidade por plataforma, num lugar só.
// Quem usa: SectorManager (janela vertical, setores, LOD, luzes locais), AtmosphereManager (neblina), Game (câmera,
// pixel ratio) e VRPlayer (escala do framebuffer). Mudar o comportamento = mudar números aqui, não o código.
//
// Como as distâncias se encaixam (todas em metros, medidas na VERTICAL a partir dos olhos, exceto far):
//   fogFull    distância em que a neblina chega a ~99,5% (FogExp2 radial: densidade base = 2,3/fogFull). Tudo o que
//              está além dela já é cor de neblina — é ali que a geometria pode sumir sem o jogador perceber.
//   above      janela acima dos olhos: setores até aqui ficam ATIVOS (desenhados).   Deve ser ≥ fogFull.
//   below      janela abaixo dos olhos.                                               Deve ser ≥ fogFull.
//   hysteresis um setor ativo só sai da janela depois de passar do limite por esta margem (sem piscar na borda).
//   preload    setores até window+preload são preparados antes (texturas enviadas à GPU aos poucos).
//   unload     além de window+preload+unload, por unloadDelay segundos, os buffers de GPU do setor são liberados.
//              A colisão, as agarras e o estado dos puzzles NUNCA são descarregados.
//   far        plano distante da câmera (≥ fogFull: o corte do plano fica dentro da neblina opaca).
//   lod        modelos pesados (andaimes, luminárias) trocam pela versão simples além desta distância (3D).
//   detail     peças pequenas de enfeite (parafusos, vergalhões, abraçadeiras) somem além desta distância vertical.
//   localLights / lampLights  luzes pontuais simultâneas: das salas (pool do SectorManager) e das luminárias do poço
//              (pool do AtmosphereManager). O total é FIXO por perfil: o shader não recompila no meio do jogo.
// ============================================================================
const RENDER_CONFIG={
  sectorHeight:10,        // altura de cada faixa do poço (as salas grandes viram setores próprios)
  updateInterval:.1,      // s entre reavaliações da janela (a troca de luzes e o LOD usam o mesmo ritmo)
  unloadDelay:4,          // s além do limite de descarga antes de liberar a GPU
  texturesPerFrame:1,     // carregamento progressivo: texturas enviadas à GPU por quadro
  freeGeometry:false,     // geometria do mapa inteiro ≈ 6 MB: fica na GPU depois do 1º envio (reenviar ao voltar custava
                          // 25–37 ms no quadro em que a sala entra na janela). true = libera também a geometria.
  sharedLimit:4,          // recurso usado por mais setores que isto é GLOBAL (concreto, tijolo, normal maps): fica residente.
                          // Só o que é específico de poucos setores (placas, telas, teclados, peças das salas) é liberado —
                          // reenviar as texturas grandes compartilhadas a cada volta custaria picos de dezenas de ms.
  spanSplit:1.6,          // peças mais altas que sectorHeight×spanSplit (parede do poço) são avaliadas sozinhas
  smallRadius:.3,         // raio (m) abaixo do qual uma peça estática de enfeite conta como "detalhe"
  lodMinTris:1500,        // modelos (glTF) com mais triângulos que isto ganham a versão simples para longe
  lightFade:.3,           // s para uma luz local acender/apagar ao entrar/sair do pool
  profiles:{
    // PC: o visual atual (densidade base da neblina .055 ≈ fogFull 42 m) com o custo limitado
    pc:{   fogFull:42, above:46, below:46, hysteresis:4, preload:14, unload:30, far:52, lod:16, detail:24, localLights:4, lampLights:5, pixelRatio:{low:.6,medium:1,high:2} },
    // VR (Meta Quest 3/3S): neblina um pouco mais densa e janela mais curta; menos luzes; framebuffer conforme a qualidade
    // (lampLights 3 = o mesmo do VR antes desta otimização; a neblina 10% mais curta que a do PC mantém a leitura das agarras)
    vr:{   fogFull:38, above:40, below:39, hysteresis:3, preload:12, unload:24, far:44, lod:10, detail:15, localLights:2, lampLights:3,
           framebufferScale:{low:.8,medium:.9,high:1}, foveation:1 }
  },
  // Configuração "Distância de visão" (menu): multiplica as distâncias do perfil (a neblina acompanha)
  viewDistance:{ near:.8, normal:1, far:1.25 },
  // Ajustes por região: valem enquanto os OLHOS estão nela (room = dentro das zonas da sala; ou faixa y0–y1).
  // Salas fechadas enxergam pouco do poço → janela menor; trechos em que o corpo sobe rápido → mais pré-carga acima.
  regions:[
    {name:'Labirinto (sala fechada e escura)', room:'mz300', above:16, below:12},
    {name:'Casa das Bombas (salão fechado)',   room:'h1',    above:24, below:16},
    {name:'Galeria do exaustor (corredor)',    room:'ex150',above:20, below:14},
    {name:'Insuflador (o fluxo leva para cima)',y0:238,y1:256, preloadAbove:16},
    {name:'Sucção do exaustor',                 y0:140,y1:172, preloadAbove:10}
  ]
};
// Perfil efetivo: plataforma (pc|vr) + qualidade + distância de visão. Valores derivados (densidade da neblina) prontos.
const RenderProfile={
  resolve(settings,vr){
    const base=RENDER_CONFIG.profiles[vr?'vr':'pc'], s=settings||{}, q=s.quality||'medium';
    const k=RENDER_CONFIG.viewDistance[s.viewDistance]||1, p={...base,platform:vr?'vr':'pc',quality:q};
    for(const key of ['fogFull','above','below','preload','far','lod','detail']) p[key]=base[key]*k;
    p.fogDensity=Math.sqrt(-Math.log(.005))/p.fogFull;        // FogExp2: 1−exp(−(ρd)²) = 99,5% em d = fogFull
    if(!vr&&q==='low'){ p.localLights=Math.min(p.localLights,2); p.lampLights=Math.min(p.lampLights,3); }
    if(base.pixelRatio) p.pixelRatioFor=q;
    if(base.framebufferScale) p.framebufferScale=base.framebufferScale[q]||1;
    return p;
  },
  // região em que os olhos estão (a primeira que casar); inRoom(id) diz se o ponto está dentro das zonas da sala
  region(y,inRoom){
    for(const r of RENDER_CONFIG.regions){ if(r.room?inRoom(r.room):(y>=r.y0&&y<=r.y1)) return r; }
    return null;
  }
};
