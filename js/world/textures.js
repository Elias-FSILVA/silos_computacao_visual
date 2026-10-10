'use strict';
// ============================================================================
// js/world/textures.js — biblioteca de texturas procedurais dos ambientes (canvas 2D, sem arquivos extras)
// Direção de arte: a folha de referência do projeto — concreto envelhecido, blocos de pedra, tijolos escuros,
// madeira gasta, pedras irregulares e superfícies rachadas; cinza, grafite e marrom, desgaste discreto, nada saturado.
// Regras: toda textura repete sem emenda e é INDEPENDENTE DA RESOLUÇÃO (a mesma semente desenha o mesmo padrão em
// 512 ou 1024 px). Cada gerador devolve {canvas (cor), height (relevo 0..1), S}; normalFrom() vira normal map.
// Sem canvas de verdade (testes em Node) os geradores devolvem telas vazias.
// ============================================================================
const TEXGEN=(()=>{
  const CAN=(()=>{ try{ const g=document.createElement('canvas').getContext('2d'); const d=g&&g.createImageData&&g.createImageData(1,1); return !!(d&&d.data); }catch(e){ return false; } })();
  const mk=(w,h=w)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
  const CPU={willReadFrequently:true};   // canvas na memória: putImageData/getImageData sem ida e volta à GPU
  const sstep=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
  const mix=(a,b,t)=>a+(b-a)*t;
  // ---------- ruído de valor em grade periódica (contínuo nas bordas) + fBm ----------
  function grid(R,nx,ny){ const a=new Float32Array(nx*ny); for(let i=0;i<a.length;i++) a[i]=R(); return {a,nx,ny}; }
  function samp(G,u,v){
    const x=u*G.nx, y=v*G.ny, xi=Math.floor(x), yi=Math.floor(y), fx=x-xi, fy=y-yi, sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
    const x0=((xi%G.nx)+G.nx)%G.nx, y0=((yi%G.ny)+G.ny)%G.ny, x1=(x0+1)%G.nx, y1=(y0+1)%G.ny, A=G.a;
    const a=A[y0*G.nx+x0], b=A[y0*G.nx+x1], c=A[y1*G.nx+x0], d=A[y1*G.nx+x1];
    return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
  }
  // base = células no eixo u na 1ª oitava; ax = proporção v/u (ax>1 → veios horizontais, ax<1 → escorridos verticais)
  // devolve f(u,v) centrado em 0 (≈ -1..1)
  function fbm(seed,base,oct,ax=1,gain=.5){
    const R=mulberry(seed), Gs=[]; let amp=1, norm=0;
    for(let o=0;o<oct;o++){ Gs.push({g:grid(R,base<<o,Math.max(1,Math.round(base*ax))<<o),amp}); norm+=amp; amp*=gain; }
    return (u,v)=>{ let s=0; for(const o of Gs) s+=samp(o.g,u,v)*o.amp; return (s/norm-.5)*2.6; };
  }
  // campo de baixa frequência pré-calculado numa grade N×N fixa e interpolado (mesmo resultado, muito menos amostras)
  function coarse(f,N){ const a=new Float32Array(N*N); for(let y=0;y<N;y++) for(let x=0;x<N;x++) a[y*N+x]=f(x/N,y/N);
    return (u,v)=>{ const x=u*N, y=v*N, xi=Math.floor(x), yi=Math.floor(y), fx=x-xi, fy=y-yi, ok=xi>=0&&xi<N-1&&yi>=0&&yi<N-1;
      const x0=ok?xi:((xi%N)+N)%N, y0=ok?yi:((yi%N)+N)%N, x1=ok?xi+1:(x0+1)%N, y1=ok?yi+1:(y0+1)%N;
      const p=a[y0*N+x0], q=a[y0*N+x1], r=a[y1*N+x0], s=a[y1*N+x1]; return p+(q-p)*fx+(r-p)*fy+(p-q-r+s)*fx*fy; }; }
  const flat=(S,rgb)=>{ const c=mk(S); if(CAN){ const g=c.getContext('2d',CPU); g.fillStyle='rgb('+rgb.join(',')+')'; g.fillRect(0,0,S,S); } return c; };
  // ---------- pós-processo ----------
  // ajusta a luminância média para 'lum' (mantém todas as superfícies na mesma faixa de brilho do jogo)
  function normalizeLum(d,lum){
    let s=0; const n=d.length/4; for(let i=0;i<d.length;i+=4) s+=.3*d[i]+.59*d[i+1]+.11*d[i+2];
    const k=lum/(s/n||1); for(let i=0;i<d.length;i+=4){ d[i]=Math.min(255,d[i]*k); d[i+1]=Math.min(255,d[i+1]*k); d[i+2]=Math.min(255,d[i+2]*k); }
  }
  // relevo → normal map (out = resolução de saída; str em unidades da textura, independe da resolução)
  function normalFrom(H,S,out,str){
    const c=mk(out); if(!CAN) return c;
    const k=S/out, h=new Float32Array(out*out);
    for(let y=0;y<out;y++) for(let x=0;x<out;x++){ let s=0; for(let j=0;j<k;j++) for(let i=0;i<k;i++) s+=H[(y*k+j)*S+x*k+i]; h[y*out+x]=s/(k*k); }
    const g=c.getContext('2d',CPU), im=g.createImageData(out,out), d=im.data, f=out*str/2;
    for(let y=0;y<out;y++) for(let x=0;x<out;x++){
      const l=h[y*out+(x-1+out)%out], r=h[y*out+(x+1)%out], up=h[((y-1+out)%out)*out+x], dn=h[((y+1)%out)*out+x];
      const nx=(l-r)*f, ny=(dn-up)*f, q=1/Math.hypot(nx,ny,1), i=(y*out+x)*4;   // canvas y desce, v da textura sobe
      d[i]=(nx*q*.5+.5)*255; d[i+1]=(ny*q*.5+.5)*255; d[i+2]=(q*.5+.5)*255; d[i+3]=255;
    }
    g.putImageData(im,0,0); return c;
  }
  // traço contínuo nas bordas: desenha a polilinha (coordenadas 0..1) nas 9 cópias vizinhas
  function strokeWrap(g,S,pts,w,style){
    g.strokeStyle=style; g.lineWidth=Math.max(.6,w*S); g.lineCap='round'; g.lineJoin='round';
    for(const ox of [-1,0,1]) for(const oy of [-1,0,1]){ g.beginPath(); pts.forEach(([x,y],i)=>{ const px=(x+ox)*S, py=(y+oy)*S; i?g.lineTo(px,py):g.moveTo(px,py); }); g.stroke(); }
  }
  // linha quebrada natural: subdivisão do ponto médio com desvio perpendicular
  function jag(pts,R,depth,amp){
    let P=pts;
    for(let k=0;k<depth;k++){ const N=[P[0]];
      for(let i=1;i<P.length;i++){ const [x0,y0]=P[i-1],[x1,y1]=P[i], dx=x1-x0, dy=y1-y0, L=Math.hypot(dx,dy)||1e-6, off=(R()-.5)*amp*L;
        N.push([(x0+x1)/2-dy/L*off,(y0+y1)/2+dx/L*off],[x1,y1]); }
      P=N; }
    return P;
  }
  // stamp de discos (poros, furos) — lista de posições em 0..1, raio em unidades da textura
  function disc(S,x,y,r,fn){
    const R=r*S, cx=x*S, cy=y*S, x0=Math.floor(cx-R-1), x1=Math.ceil(cx+R+1), y0=Math.floor(cy-R-1), y1=Math.ceil(cy+R+1);
    for(let py=y0;py<=y1;py++) for(let px=x0;px<=x1;px++){ const dd=Math.hypot(px+.5-cx,py+.5-cy)/R; if(dd<1.6) fn(((py%S)+S)%S*S+((px%S)+S)%S,dd); }
  }
  const out=(c,im)=>{ c.getContext('2d',CPU).putImageData(im,0,0); return c; };

  // =====================================================================================
  // CONCRETO MOLDADO IN LOCO — tile de 3 m. Painéis de fôrma de 1,5 m (juntas em u=0 e u=.5) e juntas de concretagem
  // a cada 3 m (v=0). Manchas largas, poros, marcas das tábuas da fôrma, furos de tirante com escorrido de ferrugem,
  // sujeira em veios verticais. Como as juntas caem a cada 1,5 m, painéis do mapa (ex.: sala secreta) coincidem com elas.
  // =====================================================================================
  function concrete(S,seed=4141,o={}){
    const c=mk(S), H=new Float32Array(S*S); if(!CAN) return {canvas:c,height:H,S};
    const R=mulberry(seed), base=o.base||[112,108,101];
    const big=coarse(fbm(seed+1,3,5),192), cloud=coarse(fbm(seed+7,7,4),256), mid=coarse(fbm(seed+2,20,4),512), fine=coarse(fbm(seed+3,96,2),512), hue=coarse(fbm(seed+6,2,3),64);
    const drip=coarse(fbm(seed+4,44,3,.07),512), dripAmt=coarse(fbm(seed+5,5,3),128), eff=coarse(fbm(seed+8,9,4),256), jw=coarse(fbm(seed+9,30,2),256);
    const boards=[]; for(let i=0;i<16;i++) boards.push((R()-.5)*2);
    const holes=[]; for(const p of [0,.5]) for(const hx of [.125,.375]) for(const hy of [1/6,.5,5/6]) holes.push({x:p+hx+(R()-.5)*.008,y:hy+(R()-.5)*.008,r:.0036+R()*.001,run:R()<.55?.03+R()*.11:0});
    const pores=[]; for(let i=0;i<2600;i++) pores.push({x:R(),y:R(),r:.0006+R()*R()*.0022,k:.25+R()*.5});
    const chips=[]; for(let i=0;i<5;i++){ const x=R(), y=R(), r=.004+R()*.007, parts=[]; for(let k=0;k<4;k++) parts.push([x+(R()-.5)*r*1.4,y+(R()-.5)*r,r*(.5+R()*.5)]); chips.push(parts); }
    const mk2=new Float32Array(S*S), rust=new Float32Array(S*S), chip=new Float32Array(S*S);   // escurecimento pontual · ferrugem · lascas
    pores.forEach(p=>disc(S,p.x,p.y,p.r,(i,dd)=>{ if(dd<1){ mk2[i]=Math.max(mk2[i],p.k*(1-dd*dd)); H[i]-=.25*p.k*(1-dd); } }));
    holes.forEach(h=>{
      disc(S,h.x,h.y,h.r*2.4,(i,dd)=>{ if(dd<1) rust[i]=Math.max(rust[i],.3*(1-dd)); });
      disc(S,h.x,h.y,h.r,(i,dd)=>{ if(dd<1){ mk2[i]=Math.max(mk2[i],.75*sstep(1,.55,dd)); H[i]-=.7*sstep(1,.5,dd); } else if(dd<1.35) H[i]+=.05; });
      if(h.run){ const x0=h.x*S, w=h.r*S*.9; for(let py=Math.floor(h.y*S);py<(h.y+h.run)*S;py++){ const t=(py/S-h.y)/h.run;
        for(let px=Math.floor(x0-w*1.6);px<=x0+w*1.6;px++){ const i=((py%S)+S)%S*S+((px%S)+S)%S, a=(1-t)*(1-Math.abs(px-x0)/(w*1.6)); if(a>0) rust[i]=Math.max(rust[i],.2*a); } } }
    });
    chips.forEach(parts=>parts.forEach(([x,y,r])=>disc(S,x,y,r,(i,dd)=>{ if(dd<1) chip[i]=Math.max(chip[i],sstep(1,.8,dd)); })));
    const im=c.getContext('2d',CPU).createImageData(S,S), d=im.data;
    for(let y=0;y<S;y++){ const v=(y+.5)/S, bv=v*16, bi=Math.min(15,bv|0), seam=Math.abs(bv-Math.round(bv))/16, dyJ=Math.min(v,1-v), top=Math.exp(-v*2.4);
      for(let x=0;x<S;x++){ const u=(x+.5)/S, i=y*S+x;
        const B=big(u,v), C=cloud(u,v), M=mid(u,v), F=fine(u,v);
        // escorridos: a água entra pela junta de concretagem (alto do tile) e desce em veios, mais fortes logo abaixo dela
        const dr=Math.max(0,drip(u,v)-.25)*Math.max(0,dripAmt(u,v)+.45)*(.35+.9*top);
        let t=1+.15*B+.07*C+.05*M+.035*F+.02*boards[bi];
        if(seam<.0011) t*=.95;                                                          // marca entre tábuas da fôrma
        const jo=jw(u,v)*.0012, dJ=Math.min(Math.abs(u*2-Math.round(u*2))/2+jo,dyJ+jo), gr=1-sstep(.0008,.0026,dJ);   // juntas de painel (levemente irregulares)
        t*=1-.2*gr;
        t*=1-.24*Math.min(1,dr)-.5*mk2[i];
        const ch=chip[i]; if(ch>0) t*=1-.22*ch+.12*ch*F;                                // lascas: concreto exposto, mais escuro e áspero
        const ef=Math.max(0,eff(u,v)-.35)*(.3+.7*top)*.5;                               // eflorescência: véu esbranquiçado
        const hz=hue(u,v)*.03, rs=rust[i];
        let r=mix(base[0]*t*(1+hz),92*t,rs), g=mix(base[1]*t,68*t,rs), b=mix(base[2]*t*(1-hz),50*t,rs);
        r=mix(r,150,ef*.35); g=mix(g,147,ef*.35); b=mix(b,140,ef*.35);
        d[i*4]=r; d[i*4+1]=g; d[i*4+2]=b; d[i*4+3]=255;
        H[i]+=.5+.10*M+.04*F-.45*gr-.22*ch;
      } }
    normalizeLum(d,o.lum||92);
    return {canvas:out(c,im),height:H,S};
  }
  // =====================================================================================
  // RACHADURA DA SALA SECRETA — desenhada SOBRE o concreto da parede (mesma semente, mesma escala): o painel é idêntico
  // ao concreto vizinho, só que trincado. Uma trinca principal irregular que nasce na junta superior e afina até sumir,
  // duas ramificações curtas, um pequeno lascado onde ela cruza a junta central e uma mancha de umidade muito leve.
  // Coordenadas do painel: u 0..1 = 3 m (esquerda→direita de quem olha), v 0..1 = topo→chão.
  // =====================================================================================
  function crackOver(base,seed=77){
    const S=base.S, c=mk(S), H=base.height.slice(); if(!CAN) return {canvas:c,height:H,S};
    const g=c.getContext('2d',CPU); g.drawImage(base.canvas,0,0);
    const R=mulberry(seed);
    const main=jag([[.352,-.004],[.395,.15],[.462,.31],[.503,.452],[.566,.575],[.612,.70],[.638,.805]],R,5,.4);
    const branch=(t,turn,len,w)=>{ const i=Math.floor(t*(main.length-1)), [x0,y0]=main[i], [x1,y1]=main[Math.min(main.length-1,i+4)], a=Math.atan2(y1-y0,x1-x0)+turn;
      return {pts:jag([[x0,y0],[x0+Math.cos(a)*len*.55,y0+Math.sin(a)*len*.55],[x0+Math.cos(a+turn*.25)*len,y0+Math.sin(a+turn*.25)*len]],R,5,.6),w}; };
    const lines=[{pts:main,w:.0030},branch(.37,.72,.105,.0013),branch(.66,-.62,.125,.0012),branch(.86,.45,.05,.0007)];
    // mancha de umidade sob o lascado (quase imperceptível) — antes da trinca, para ficar por baixo dela
    const sx=.505*S, sy=.47*S, gr=g.createLinearGradient(0,sy,0,sy+.24*S); gr.addColorStop(0,'rgba(34,31,27,.10)'); gr.addColorStop(1,'rgba(34,31,27,0)');
    g.fillStyle=gr; g.beginPath(); g.ellipse(sx,sy+.11*S,.026*S,.12*S,0,0,Math.PI*2); g.fill();
    const draw=(L,wk,style,dx=0,dy=0,ctx=g)=>{ const P=L.pts, n=P.length; ctx.strokeStyle=style; ctx.lineCap='round'; ctx.lineJoin='round';
      for(let i=0;i<n-1;i+=3){ const j=Math.min(n-1,i+3), t=j/(n-1), taper=Math.pow(Math.sin(Math.PI*Math.min(1,t*1.08)),.65)*(L===lines[0]?1:1-t*.7), w=L.w*(.35+.65*taper)*(.85+.3*R());
        ctx.lineWidth=Math.max(.5,w*wk*S); ctx.beginPath(); ctx.moveTo(P[i][0]*S+dx,P[i][1]*S+dy); for(let k=i+1;k<=j;k++) ctx.lineTo(P[k][0]*S+dx,P[k][1]*S+dy); ctx.stroke(); } };   // trechos de 3 segmentos: mesma forma, 3× menos traços
    const px=.6*S/1024;                                                           // 1 px a 1024 → mesma espessura em qualquer resolução
    lines.forEach(L=>draw(L,3.2,'rgba(26,24,21,.11)'));                               // halo: borda escurecida, poeira presa
    lines.forEach(L=>draw(L,1.2,'rgba(170,164,152,.14)',-px*1.4,-px*1.6));           // lábio iluminado (luz vem de cima)
    lines.forEach(L=>draw(L,1,'rgba(32,30,27,.84)'));                                 // núcleo da trinca
    // lascado: placa irregular de 7–9 cm onde a trinca cruza a junta central; agregado aparente e borda viva
    const chip=[]; for(let k=0;k<9;k++){ const a=k/9*Math.PI*2, r=(.011+.009*R())*(k%2?1:.8); chip.push([.506+Math.cos(a)*r*1.25,.452+Math.sin(a)*r]); }
    const pathChip=ctx=>{ ctx.beginPath(); chip.forEach(([x,y],i)=>i?ctx.lineTo(x*S,y*S):ctx.moveTo(x*S,y*S)); ctx.closePath(); };
    g.save(); pathChip(g); g.fillStyle='rgba(52,49,45,.55)'; g.fill(); g.clip();
    for(let k=0;k<70;k++){ const v=R()<.5?40:120; g.fillStyle=`rgba(${v},${v-3},${v-8},${.25+R()*.35})`; g.beginPath(); g.arc((.506+(R()-.5)*.05)*S,(.452+(R()-.5)*.04)*S,(.0008+R()*.0016)*S,0,Math.PI*2); g.fill(); }
    g.restore(); pathChip(g); g.lineWidth=Math.max(.6,.0011*S); g.strokeStyle='rgba(18,16,14,.55)'; g.stroke();
    g.save(); g.translate(-px*1.2,-px*1.4); pathChip(g); g.strokeStyle='rgba(170,164,152,.22)'; g.stroke(); g.restore();
    // relevo: a trinca e o lascado afundam (normal map mostra a borda quando a luz passa rasante)
    // (máscara só na área da trinca — bem menor que a textura inteira)
    let x0=1,y0=1,x1=0,y1=0; [...lines.flatMap(L=>L.pts),...chip].forEach(([x,y])=>{ x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y); });
    const bx=Math.max(0,Math.floor((x0-.01)*S)), by=Math.max(0,Math.floor((y0-.01)*S)), bw=Math.min(S,Math.ceil((x1+.01)*S))-bx, bh=Math.min(S,Math.ceil((y1+.01)*S))-by;
    const M=mk(bw,bh), mg=M.getContext('2d',CPU); mg.fillStyle='#000'; mg.fillRect(0,0,bw,bh); mg.translate(-bx,-by);
    lines.forEach(L=>draw(L,2.4,'rgba(255,255,255,.35)',0,0,mg)); lines.forEach(L=>draw(L,1,'#fff',0,0,mg));
    pathChip(mg); mg.fillStyle='rgba(255,255,255,.45)'; mg.fill();
    const md=mg.getImageData(0,0,bw,bh).data; for(let y=0;y<bh;y++) for(let x=0;x<bw;x++) H[(by+y)*S+bx+x]-=.75*md[(y*bw+x)*4]/255;
    return {canvas:c,height:H,S};
  }
  // =====================================================================================
  // ALVENARIA DE BLOCOS — pedra aparelhada (fiadas de alturas variadas) ou tijolo (aparelho corrido).
  // Cada bloco tem tom próprio; arestas lascadas por ruído; juntas recuadas e escuras; manchas e trincas finas raras.
  // =====================================================================================
  function masonry(S,seed,o){
    const c=mk(S), H=new Float32Array(S*S); if(!CAN) return {canvas:c,height:H,S};
    const R=mulberry(seed), rows=[], n=o.rows; let acc=0; const hs=[];
    for(let r=0;r<n;r++){ const h=o.bond?1:(.75+R()*.5); hs.push(h); acc+=h; }
    let y0=0;
    for(let r=0;r<n;r++){ const h=hs[r]/acc, blocks=[]; let ws=[], sw=0;
      if(o.bond){ const m=o.perRow; for(let k=0;k<m;k++) ws.push(1+(R()-.5)*.08); } else { while(sw<.999){ const w=o.minW+R()*(o.maxW-o.minW); ws.push(w); sw+=w; if(ws.length>12) break; } }
      sw=ws.reduce((a,b)=>a+b,0); let x=0;
      for(const w0 of ws){ const w=w0/sw, tone=1+(R()-.5)*o.toneJit, hue=(R()-.5)*o.hueJit;
        blocks.push({x0:x,w,tone,hue,stain:R()<o.stain?.3+R()*.5:0,dark:R()<(o.dark||0)}); x+=w; }
      rows.push({y0,y1:y0+h,off:o.bond?((r%2)*.5/o.perRow+(R()-.5)*.01):R(),blocks}); y0+=h;
    }
    const rowOf=new Int16Array(S); for(let y=0;y<S;y++){ const v=(y+.5)/S; rowOf[y]=Math.max(0,rows.findIndex(r=>v>=r.y0&&v<r.y1)); }
    const surf=fbm(seed+1,o.grain||14,4), big=fbm(seed+2,3,4), edge=fbm(seed+3,o.edgeCells||36,3), spk=fbm(seed+4,140,1);
    const jw=o.joint/2, bev=o.bevel, base=o.base, mor=o.mortar;
    const im=c.getContext('2d',CPU).createImageData(S,S), d=im.data;
    for(let y=0;y<S;y++){ const v=(y+.5)/S, row=rows[rowOf[y]];
      for(let x=0;x<S;x++){ const u=(x+.5)/S, i=y*S+x, xx=((u-row.off)%1+1)%1;
        let b=row.blocks[row.blocks.length-1]; for(const k of row.blocks) if(xx>=k.x0&&xx<k.x0+k.w){ b=k; break; }
        const E=edge(u,v)*o.rough, ex=Math.min(xx-b.x0,b.x0+b.w-xx), ey=Math.min(v-row.y0,row.y1-v), e=Math.min(ex,ey)+E;
        const s=surf(u,v), G=big(u,v), sp=spk(u,v);
        let r,g,bl,h;
        if(e<jw){ const t=.8+.12*s+.06*G; r=mor[0]*t; g=mor[1]*t; bl=mor[2]*t; h=.08+.04*s; }
        else{ const t=sstep(jw,jw+bev,e), st=b.stain?1-b.stain*.35*sstep(row.y0,row.y1,v):1;
          let k=b.tone*(.8+.2*t)*(1+.09*s+.06*G)*st*(sp>1.1?.82:1)*(b.dark?.7:1);
          r=base[0]*k*(1+b.hue); g=base[1]*k; bl=base[2]*k*(1-b.hue); h=.35+.45*t+.08*s; }
        d[i*4]=r; d[i*4+1]=g; d[i*4+2]=bl; d[i*4+3]=255; H[i]=h;
      } }
    normalizeLum(d,o.lum);
    out(c,im);
    // trincas finas em alguns blocos (como na referência: fissura escura junto à base da pedra)
    if(o.cracks){ const g=c.getContext('2d',CPU);
      rows.forEach(row=>row.blocks.forEach(b=>{ if(R()>o.cracks) return;
        const x0=row.off+b.x0+b.w*(.2+R()*.3), yA=row.y0+(row.y1-row.y0)*(.3+R()*.5), L=b.w*(.3+R()*.4);
        const P=jag([[x0,yA],[x0+L*.5,yA+(R()-.5)*.03],[x0+L,yA+(R()-.3)*.05]],R,4,.7);
        strokeWrap(g,S,P,.0016,'rgba(20,19,17,.75)'); }));
    }
    return {canvas:c,height:H,S};
  }
  // =====================================================================================
  // PEDRA IRREGULAR (rachão / calçamento) com musgo — Voronoi periódico: pedras arredondadas de tons cinza e marrom,
  // vãos de terra escura, musgo nos vãos e nas manchas de umidade, raízes finas.
  // =====================================================================================
  function cobble(S,seed,o){
    const c=mk(S), H=new Float32Array(S*S); if(!CAN) return {canvas:c,height:H,S};
    const R=mulberry(seed), N=o.n, P=[], T=[];
    for(let j=0;j<N;j++) for(let i=0;i<N;i++){ P.push([(i+.18+R()*.64)/N,(j+.18+R()*.64)/N]); T.push({tone:.72+R()*.5,warm:R()<.45?(R()*.12):-(R()*.05)}); }
    const surf=fbm(seed+1,18,4), warp=coarse(fbm(seed+2,10,3),256), moss=coarse(fbm(seed+3,4,5),256), mossF=fbm(seed+4,60,2);
    const im=c.getContext('2d',CPU).createImageData(S,S), d=im.data, base=o.base, soil=o.soil, mc=o.moss;
    for(let y=0;y<S;y++){ const v=(y+.5)/S;
      for(let x=0;x<S;x++){ const u=(x+.5)/S, i=y*S+x, wu=u+warp(u,v)*.012, wv=v+warp(v,u)*.012, ci=Math.floor(wu*N), cj=Math.floor(wv*N);
        let d1=9,d2=9,id=0;
        for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){ const a=((ci+di)%N+N)%N, b=((cj+dj)%N+N)%N, p=P[b*N+a];
          const fx=p[0]+Math.floor((ci+di)/N)*1, fy=p[1]+Math.floor((cj+dj)/N)*1, q=Math.hypot(wu-fx,wv-fy)*N;
          if(q<d1){ d2=d1; d1=q; id=b*N+a; } else if(q<d2) d2=q; }
        const e=d2-d1-.32*d1*d1, s=surf(u,v), t=sstep(o.gap,o.gap+.16,e), st=T[id];
        let r,g,b,h;
        if(e<o.gap){ const k=.75+.2*s; r=soil[0]*k; g=soil[1]*k; b=soil[2]*k; h=.12; }
        else { const k=st.tone*(.78+.22*t)*(1+.1*s)*(1-.18*Math.min(1,d1*d1)); r=base[0]*k*(1+st.warm); g=base[1]*k; b=base[2]*k*(1-st.warm); h=.3+.3*t+.4*(1-Math.min(1,d1*d1*1.6))+.05*s; }
        const mm=Math.max(0,Math.min(1,(moss(u,v)+.15+(1-t)*.45)*1.6))*o.mossAmt*(.75+.25*mossF(u,v));
        d[i*4]=mix(r,mc[0]*(.8+.2*s),mm); d[i*4+1]=mix(g,mc[1]*(.8+.2*s),mm); d[i*4+2]=mix(b,mc[2]*(.8+.2*s),mm); d[i*4+3]=255; H[i]=h+mm*.08;
      } }
    normalizeLum(d,o.lum); out(c,im);
    if(o.roots){ const g=c.getContext('2d',CPU); for(let k=0;k<o.roots;k++){ let x=R(), y=R()*.3; const pts=[[x,y]]; for(let s=0;s<7;s++){ x+=(R()-.5)*.07; y+=.06+R()*.05; pts.push([x,y]); }
      strokeWrap(g,S,jag(pts,R,3,.5),.0028+R()*.002,'rgba(34,24,16,.7)'); } }
    return {canvas:c,height:H,S};
  }
  // =====================================================================================
  // TÁBUAS DE MADEIRA ENVELHECIDA — tábuas horizontais com tom próprio, veio ondulado, nós, emendas de topo,
  // pregos com halo de ferrugem, desgaste acinzentado e frestas escuras entre tábuas.
  // =====================================================================================
  function planks(S,seed,o){
    const c=mk(S), H=new Float32Array(S*S); if(!CAN) return {canvas:c,height:H,S};
    const R=mulberry(seed), n=o.n, P=[];
    for(let p=0;p<n;p++){ const joints=[R()]; if(R()<.5) joints.push((joints[0]+.35+R()*.3)%1);
      const knots=[]; if(R()<.55) knots.push({x:R(),y:.25+R()*.5,r:.010+R()*.012});
      P.push({tone:.78+R()*.4,grey:R()*R()*.55,joints,knots,ph:R()*40,tones:[1,.86+R()*.24,.86+R()*.24]}); }
    const grain=fbm(seed+1,3,4,12), warp=coarse(fbm(seed+2,4,3,2),256), wear=coarse(fbm(seed+3,6,4),256), fine=fbm(seed+4,8,2,20), stain=coarse(fbm(seed+5,3,4),128);
    const im=c.getContext('2d',CPU).createImageData(S,S), d=im.data, base=o.base, gy=o.greyTo;
    for(let y=0;y<S;y++){ const v=(y+.5)/S, pv=v*n, pi=Math.min(n-1,pv|0), lv=pv-pi, pl=P[pi], seam=Math.min(lv,1-lv)/n;
      for(let x=0;x<S;x++){ const u=(x+.5)/S, i=y*S+x;
        let seg=0, dj=1; pl.joints.forEach((j,k)=>{ const dd=Math.abs(((u-j+1.5)%1)-.5); dj=Math.min(dj,dd); if(((u-j+1)%1)<((u-pl.joints[0]+1)%1)) seg=k+1; });
        let w=(lv*3+pl.ph+warp(u,v)*1.6+grain(u,v)*.9)*6;
        for(const k of pl.knots){ const kx=Math.abs(((u-k.x+1.5)%1)-.5), ky=(lv-k.y)/n, kd=Math.hypot(kx,ky); w+=k.r/(kd+k.r*.6)*2.4; if(kd<k.r*.55) w+=9; }
        const ring=Math.abs((w%1+1)%1-.5)*2, f=fine(u,v);
        let k=pl.tone*pl.tones[seg%3]*(.86+.12*ring+.06*f)*(1+.05*wear(u,v));
        const gr=Math.max(0,Math.min(1,pl.grey+.25*wear(u,v)));
        let r=mix(base[0]*k,gy[0]*k,gr), g=mix(base[1]*k,gy[1]*k,gr), b=mix(base[2]*k,gy[2]*k,gr), h=.55+.06*ring+.04*f;
        const sn=Math.max(0,stain(u,v)-.5); r*=1-.25*sn; g*=1-.25*sn; b*=1-.22*sn;
        const sg=1-sstep(.0015,.0045,seam), jg=1-sstep(.0008,.0024,dj);
        const dk=Math.max(sg*.75,jg*.6); r*=1-dk; g*=1-dk; b*=1-dk; h-=.5*Math.max(sg,jg*.6);
        d[i*4]=r; d[i*4+1]=g; d[i*4+2]=b; d[i*4+3]=255; H[i]=h;
      } }
    // pregos: dois por emenda e ao longo da tábua, com halo de ferrugem
    P.forEach((pl,p)=>{ const ys=[(p+.28)/n,(p+.72)/n], xs=[...pl.joints.flatMap(j=>[j-.012,j+.012])]; for(let q=0;q<2;q++) xs.push(R());
      xs.forEach(x=>ys.forEach(yy=>disc(S,(x+1)%1,yy,.0034,(i,dd)=>{ if(dd<1){ const a=dd<.45?.78:.18*(1-dd); d[i*4]=mix(d[i*4],dd<.45?34:80,a); d[i*4+1]=mix(d[i*4+1],dd<.45?30:50,a); d[i*4+2]=mix(d[i*4+2],dd<.45?28:34,a); if(dd<.45) H[i]-=.1; } }))); });
    normalizeLum(d,o.lum);
    return {canvas:out(c,im),height:H,S};
  }
  // ruído de grande escala (r, g) para variar o tom das paredes a cada ~10 m e quebrar a repetição do tile
  function macro(S=128){
    const c=mk(S); if(!CAN) return c; const a=fbm(911,2,5), b=fbm(912,3,4), im=c.getContext('2d',CPU).createImageData(S,S), d=im.data;
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){ const u=(x+.5)/S, v=(y+.5)/S, i=(y*S+x)*4; d[i]=Math.max(0,Math.min(255,128+a(u,v)*120)); d[i+1]=Math.max(0,Math.min(255,128+b(u,v)*120)); d[i+2]=128; d[i+3]=255; }
    return out(c,im);
  }
  // =====================================================================================
  // FOTO DO TIJOLO (assets/models/map/tijolo) → paleta da referência: dessatura, escurece, aprofunda a argamassa com o AO
  // e acrescenta fuligem contínua. Devolve um canvas S×S (repete sem emenda, como a foto original).
  // =====================================================================================
  function gradeBrick(img,ao,S,o){
    const c=mk(S), g=c.getContext('2d',CPU); g.drawImage(img,0,0,S,S); const im=g.getImageData(0,0,S,S), d=im.data;   // lança erro se a imagem 'contaminar' o canvas (file://)
    let A=null; if(ao){ const ca=mk(S), ga=ca.getContext('2d',CPU); ga.drawImage(ao,0,0,S,S); A=ga.getImageData(0,0,S,S).data; }
    const soot=fbm(o.seed||5150,3,5), spot=fbm((o.seed||5150)+1,9,3);
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){ const i=(y*S+x)*4, u=(x+.5)/S, v=(y+.5)/S; let r=d[i], gg=d[i+1], b=d[i+2];
      const L=.3*r+.59*gg+.11*b, sat=(r-b)/255, mortar=1-sstep(.08,.22,sat);
      r=mix(r,L,o.desat); gg=mix(gg,L,o.desat); b=mix(b,L,o.desat);
      const ao2=A?Math.pow(A[i]/255,o.aoPow||1.3):1, sk=1-o.soot*Math.max(0,soot(u,v)+.2)-.12*Math.max(0,spot(u,v)-.6);
      const k=ao2*sk*(1-o.mortarDark*mortar);
      d[i]=r*k*o.tint[0]; d[i+1]=gg*k*o.tint[1]; d[i+2]=b*k*o.tint[2]; }
    normalizeLum(d,o.lum); g.putImageData(im,0,0); return c;
  }
  // tijolo das agarras: um tijolo recortado da foto (ou procedural); 'worn' = tijolo gasto que esfarela (mais claro, trincado)
  function holdBrick(img,worn){
    const c=mk(128,64), g=c.getContext('2d',CPU); if(!CAN) return c; const R=mulberry(worn?61:60);
    if(img){ g.drawImage(img,414,402,206,92,0,0,128,64); }
    else { g.fillStyle='#7a4634'; g.fillRect(0,0,128,64); for(let k=0;k<900;k++){ const v=R()*60|0; g.fillStyle=`rgba(${60+v},${30+v*.5|0},${24+v*.4|0},${R()*.35})`; g.fillRect(R()*128,R()*64,1+R()*3,1+R()*2); } }
    const im=g.getImageData(0,0,128,64), d=im.data;
    for(let i=0;i<d.length;i+=4){ const L=.3*d[i]+.59*d[i+1]+.11*d[i+2];
      if(worn){ d[i]=mix(d[i],L,.75)*1.05; d[i+1]=mix(d[i+1],L,.75)*1.0; d[i+2]=mix(d[i+2],L,.75)*.92; }
      else { d[i]=mix(d[i],L,.12); d[i+1]=mix(d[i+1],L,.12); d[i+2]=mix(d[i+2],L,.12); } }
    normalizeLum(d,worn?106:104); g.putImageData(im,0,0);
    // aresta escurecida (volume) e, no gasto, trincas e uma quina lascada
    const gr=g.createLinearGradient(0,0,0,64); gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(.75,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(0,0,0,.35)'); g.fillStyle=gr; g.fillRect(0,0,128,64);
    if(worn){ strokeWrap(g,128,jag([[.18,.05],[.32,.5],[.44,.98]],R,4,.6).map(([x,y])=>[x,y*.5]),.012,'rgba(26,22,18,.85)');
      strokeWrap(g,128,jag([[.62,.95],[.7,.6],[.86,.4]],R,4,.6).map(([x,y])=>[x,y*.5]),.009,'rgba(26,22,18,.75)');
      g.fillStyle='rgba(40,34,28,.85)'; g.beginPath(); g.moveTo(128,0); g.lineTo(104,0); g.lineTo(112,9); g.lineTo(122,14); g.lineTo(128,20); g.fill(); }
    return c;
  }
  return {CAN,flat,concrete,crackOver,masonry,cobble,planks,macro,normalFrom,gradeBrick,holdBrick};
})();
