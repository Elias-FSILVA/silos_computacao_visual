'use strict';
// ============================================================================
// js/player/HandWear.js — desgaste das mãos pela vida (spec Health §4.3, plano Tarefa 3)
// Uma máscara RGBA 512² (gerada uma vez, semente fixa) e um trecho de shader injetado por onBeforeCompile no material
// da mão (GLB ou procedural). Canais: R sujeira · G arranhões · B feridas · A palidez/sangue seco.
// uWear 0 = aparência original (todas as camadas somem), 1 = crítico. Não toca o emissivo (o tint da stamina).
// Programa único (customProgramCacheKey fixo): trocar de estado só muda o uniform, nada é recompilado.
// Nada de THREE no carregamento do arquivo: o harness do Player (THREE falso) pode carregá-lo.
// ============================================================================
const HandWear={
  LEVELS:Object.freeze({healthy:0,hurt:.34,injured:.67,critical:1,dead:1}),
  CRITICAL_TREMOR:.035,          // rad, só nas falanges (somado por max ao tremor da fadiga)
  TWEEN:.25,                     // s, transição linear entre estados
  SIZE:512,
  KEY:'handwear-v1',
  // offsets da máscara por mão, para a esquerda não repetir a direita
  OFFSETS:{'1':[0,0],'-1':[.37,.61]},
  level(state){ const v=HandWear.LEVELS[state]; return typeof v==='number'?v:0; },
  // máscara: ruído de valor periódico (repete sem emenda) + riscos + manchas, tudo determinístico
  texture(){
    if(HandWear._tex) return HandWear._tex;
    const S=HandWear.SIZE, data=new Uint8Array(S*S*4), R=mulberry(2718);
    const lattice=n=>{ const a=new Float32Array(n*n); for(let i=0;i<a.length;i++) a[i]=R(); return a; };
    const sm=t=>t*t*(3-2*t);
    const noise=(lat,n,x,y)=>{ const fx=x/S*n, fy=y/S*n, x0=Math.floor(fx), y0=Math.floor(fy), tx=sm(fx-x0), ty=sm(fy-y0);
      const g=(i,j)=>lat[((j%n+n)%n)*n+((i%n+n)%n)];
      const a=g(x0,y0)+(g(x0+1,y0)-g(x0,y0))*tx, b=g(x0,y0+1)+(g(x0+1,y0+1)-g(x0,y0+1))*tx; return a+(b-a)*ty; };
    const fbm=(octs,x,y)=>{ let v=0,w=0; for(const [lat,n,amp] of octs){ v+=noise(lat,n,x,y)*amp; w+=amp; } return v/w; };
    const dirtO=[[lattice(8),8,1],[lattice(16),16,.6],[lattice(32),32,.35],[lattice(64),64,.2]];
    const palO=[[lattice(4),4,1],[lattice(8),8,.5],[lattice(16),16,.25]];
    const grainO=[[lattice(32),32,1],[lattice(64),64,.5]];
    const G=new Float32Array(S*S), B=new Float32Array(S*S);
    const put=(arr,x,y,v)=>{ const i=((y%S+S)%S)*S+((x%S+S)%S); if(v>arr[i]) arr[i]=v; };
    // arranhões: riscos curtos, sozinhos ou em par (feixes maiores viravam grade ao cruzar)
    for(let k=0;k<70;k++){ const x0=R()*S, y0=R()*S, a=R()*Math.PI, len=14+R()*46, n=R()*2|0, gap=2+R()*3, inten=.55+R()*.45;
      for(let s=0;s<=n;s++){ const ox=-Math.sin(a)*gap*s, oy=Math.cos(a)*gap*s, l=len*(.6+R()*.4);
        for(let t=0;t<=l;t+=.5){ const fade=Math.sin(Math.PI*t/l), x=x0+ox+Math.cos(a)*t, y=y0+oy+Math.sin(a)*t, xi=Math.round(x), yi=Math.round(y);
          put(G,xi,yi,inten*fade); put(G,xi+1,yi,inten*fade*.75); put(G,xi,yi+1,inten*fade*.75); put(G,xi-1,yi,inten*fade*.3); put(G,xi,yi-1,inten*fade*.3); } } }
    // feridas: manchas irregulares (ruído recorta a borda)
    for(let k=0;k<38;k++){ const cx=R()*S, cy=R()*S, r=5+R()*17, sx=.6+R()*.9;
      for(let y=Math.floor(cy-r-2);y<=cy+r+2;y++) for(let x=Math.floor(cx-r*sx-2);x<=cx+r*sx+2;x++){
        const d=Math.hypot((x-cx)/sx,y-cy)/r, e=d-(fbm(grainO,x,y)-.5)*.7; if(e<1) put(B,x,y,Math.min(1,(1-e)*1.8)); } }
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){ const i=y*S+x, o=i*4;
      const dirt=Math.min(1,Math.max(0,(fbm(dirtO,x,y)-.32)*2.6));
      const pal=Math.min(1,Math.max(0,(fbm(palO,x,y)-.38)*2.4));
      data[o]=Math.round(dirt*255); data[o+1]=Math.round(G[i]*255); data[o+2]=Math.round(B[i]*255); data[o+3]=Math.round(pal*255); }
    const t=new THREE.DataTexture(data,S,S,THREE.RGBAFormat);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.magFilter=THREE.LinearFilter; t.minFilter=THREE.LinearMipmapLinearFilter; t.generateMipmaps=true;
    t.needsUpdate=true; return (HandWear._tex=t);
  },
  UNIFORMS:'uniform float uWear;\nuniform vec2 uWearOffset;\nuniform sampler2D uWearMask;\n',
  // depois de <map_fragment>. Três degraus (machucado/ferido/crítico) sobre as mesmas camadas; com uWear 0 todo termo
  // zera e a cor sai idêntica à WornSkin. Ordem: palidez → sujeira nas dobras → rachaduras da própria pele (lidas do
  // mapa, alargadas) → arranhões → vermelhidão → sangue seco → feridas. A WornSkin chega aqui sem decodificar (luminância média ≈ 0,5, desvio ≈ 0,06): os limiares de cavidade partem disso.
  FRAGMENT:[
    'float wnd = 0.0;',
    '#ifdef USE_UV',
    // saudável não paga nada: o desvio é por uniform (coerente), e com uWear = 0 a mão é a WornSkin por construção (R-final I2)
    'if( uWear > 0.0 ) {',
    '  vec4 wm = texture2D( uWearMask, vUv + uWearOffset );',
    '  float sH = smoothstep( 0.0, 0.34, uWear );',
    '  float sI = smoothstep( 0.34, 0.67, uWear );',
    '  float sC = smoothstep( 0.67, 1.0, uWear );',
    '  vec3 wc = diffuseColor.rgb;',
    '  float wl = dot( wc, vec3( 0.299, 0.587, 0.114 ) );',
    '  float cav = 1.0 - smoothstep( 0.32, 0.48, wl );',
    // palidez acinzentada, sem clarear (só no crítico)
    '  wc = mix( wc, vec3( wl * 0.97, wl * 0.99, wl * 1.01 ), 0.55 * sC );',
    // sujeira: assenta primeiro nas dobras (partes escuras da WornSkin) e se espalha a cada degrau
    '  float dCut = 0.62 - 0.14 * sI - 0.08 * sC;',
    '  float dirt = smoothstep( dCut, dCut + 0.25, wm.r * 0.75 + cav * 0.50 ) * ( 0.80 * sH + 0.12 * sI + 0.05 * sC );',
    '  wc = mix( wc, wc * vec3( 0.30, 0.24, 0.18 ), dirt );',
    // rachaduras: as fissuras que a WornSkin já tem, alargadas (mínimo de 4 vizinhos) e escurecidas
    '  float crk = 0.0;',
    '#ifdef USE_MAP',
    '  vec2 cd = vec2( 0.7 + 0.9 * sI + 0.8 * sC ) / 1024.0;',
    '  float cm = min( min( dot( texture2D( map, vUv + vec2( cd.x, 0.0 ) ).rgb, vec3( 0.299, 0.587, 0.114 ) ),',
    '                       dot( texture2D( map, vUv - vec2( cd.x, 0.0 ) ).rgb, vec3( 0.299, 0.587, 0.114 ) ) ),',
    '                  min( dot( texture2D( map, vUv + vec2( 0.0, cd.y ) ).rgb, vec3( 0.299, 0.587, 0.114 ) ),',
    '                       dot( texture2D( map, vUv - vec2( 0.0, cd.y ) ).rgb, vec3( 0.299, 0.587, 0.114 ) ) ) );',
    '  crk = min( 1.0, ( 1.0 - smoothstep( 0.33, 0.45 + 0.03 * sC, cm ) ) * ( 0.40 * sH + 0.55 * sI + 0.30 * sC ) );',
    '#endif',
    '  wc = mix( wc, mix( vec3( 0.045, 0.026, 0.018 ), vec3( 0.110, 0.020, 0.014 ), sC ), crk );',
    // arranhões: riscos avermelhados (cortes rasos)
    '  float scr = smoothstep( 0.15, 0.50, wm.g ) * ( 0.60 * sH + 0.25 * sI + 0.10 * sC );',
    '  wc = mix( wc, vec3( 0.260, 0.050, 0.035 ), scr );',
    // vermelhidão em volta de onde as feridas vão abrir (as marcas avermelhadas do machucado)
    '  float red = smoothstep( 0.05, 0.45, wm.b ) * ( 0.42 * sH + 0.15 * sI );',
    '  wc = mix( wc, wc * vec3( 1.30, 0.60, 0.52 ), red );',
    // sangue seco: manchas marrons recortadas pelo ruído (só no crítico)
    '  float bld = smoothstep( 0.60, 0.78, wm.a * 0.60 + wm.r * 0.45 ) * 0.75 * sC;',
    '  wc = mix( wc, vec3( 0.060, 0.022, 0.015 ) * ( 0.8 + 0.4 * wm.g ), bld );',
    // feridas: borda irregular (ruído da sujeira + detalhe da pele deslocam o limiar); crescem do ferido ao crítico; crosta + carne manchada
    '  float wb = wm.b + ( wm.r - 0.5 ) * 0.45 + ( wm.g - 0.2 ) * 0.25 + ( wl - 0.50 ) * 2.5;',
    '  float wt = 0.72 - 0.27 * sI - 0.25 * sC;',
    '  wnd = smoothstep( wt, wt + 0.10, wb ) * sI;',
    '  float core = smoothstep( wt + 0.12, wt + 0.45, wb ) * ( 0.45 + 0.55 * smoothstep( 0.25, 0.75, wm.r ) ) * ( 1.0 - 0.6 * cav );',
    '  wc = mix( wc, mix( vec3( 0.075, 0.022, 0.015 ), vec3( 0.240, 0.022, 0.014 ), core ), 0.90 * wnd );',
    '  diffuseColor.rgb = wc;',
    '}',
    '#endif'
  ].join('\n'),
  ROUGHNESS:'roughnessFactor *= 1.0 - 0.35 * wnd;',
  // injeta a camada; idempotente. material.userData.wear guarda os uniforms (o mesmo objeto vai para o shader)
  apply(material,{side=1}={}){
    if(material.userData.wear) return material;
    const off=HandWear.OFFSETS[String(side<0?-1:1)];
    const wear={uWear:{value:0},uWearOffset:{value:new THREE.Vector2(off[0],off[1])}};
    material.userData.wear=wear;
    const mask=HandWear.texture();   // gerada aqui, na carga do Player, e não no primeiro quadro (R-T3 M1)
    const prev=material.onBeforeCompile;
    material.onBeforeCompile=function(shader,renderer){
      if(typeof prev==='function'&&prev!==THREE.Material.prototype.onBeforeCompile) prev.call(this,shader,renderer);
      shader.uniforms.uWear=wear.uWear; shader.uniforms.uWearOffset=wear.uWearOffset; shader.uniforms.uWearMask={value:mask};
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>\n'+HandWear.UNIFORMS)
        .replace('#include <map_fragment>','#include <map_fragment>\n'+HandWear.FRAGMENT)
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+HandWear.ROUGHNESS);
    };
    material.customProgramCacheKey=()=>HandWear.KEY;
    return material;
  }
};
