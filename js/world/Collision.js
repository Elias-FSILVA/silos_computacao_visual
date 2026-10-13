'use strict';
// ============================================================================
// js/world/Collision.js — sólidos do mundo e resolução do corpo do jogador (cilindro vertical: pés, raio RAD, altura BODY_H)
//
// Todo sólido vive em world.platforms e mantém o contrato antigo: {minX,maxX,minZ,maxZ} é a caixa ENVOLVENTE no plano,
// top/bottom são as alturas, kind/climbable continuam iguais. Duas formas acrescentam a geometria real:
//   arc: {cx,cz,r0,r1,a0,span}  SETOR ANELAR — parede curva, piso ou passarela circular. Ângulo θ = atan2(z−cz, x−cx),
//        de a0 até a0+span (span em (0, 2π]; 2π = anel inteiro). r0 = 0 → disco (diafragma, piso do poço).
//   obb: {cx,cz,c,s,hx,hz}      CAIXA GIRADA no plano: eixo local x = (c, s), eixo local z = (−s, c); hx/hz = meias medidas.
// Sem arc/obb é a caixa alinhada de sempre. Jogador, checkpoints, mantle, vento e testes usam as funções daqui:
// as três formas se comportam do mesmo jeito em todo o jogo.
// flat: sólido fino e horizontal (pisos, passarelas, diafragmas, cabine do elevador). Quando o corpo invade só um pouco
// por cima ou por baixo, a correção é vertical — um piso nunca empurra o jogador de lado através de uma parede.
// ============================================================================
const FLAT_FIX=.5;          // invasão (m) que um sólido flat corrige na vertical (degrau / cabeça encostando)

// ---------- caixa envolvente de um setor anelar ----------
function arcBounds(A){
  const pts=[[A.r1,A.a0],[A.r1,A.a0+A.span],[A.r0,A.a0],[A.r0,A.a0+A.span]];
  for(let k=-4;k<=8;k++){ const a=k*Math.PI/2; if(A.span>=TAU-1e-6||(a>=A.a0&&a<=A.a0+A.span)) pts.push([A.r1,a]); }
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const [r,a] of pts){ const x=A.cx+r*Math.cos(a), z=A.cz+r*Math.sin(a); minX=Math.min(minX,x); maxX=Math.max(maxX,x); minZ=Math.min(minZ,z); maxZ=Math.max(maxZ,z); }
  return {minX,maxX,minZ,maxZ};
}
function obbBounds(O){ const ex=Math.abs(O.c)*O.hx+Math.abs(O.s)*O.hz, ez=Math.abs(O.s)*O.hx+Math.abs(O.c)*O.hz; return {minX:O.cx-ex,maxX:O.cx+ex,minZ:O.cz-ez,maxZ:O.cz+ez}; }

// ---------- pertence (no plano), com margem m ----------
function arcIn(A,x,z,m){
  const dx=x-A.cx, dz=z-A.cz, r=Math.hypot(dx,dz);
  if(r>A.r1+m) return false; if(A.r0>0&&r<A.r0-m) return false;
  if(A.span>=TAU-1e-6) return true;
  const th=Math.atan2(dz,dx);
  if(wrap2(th-A.a0)<=A.span) return true;
  if(m<=0) return false;
  // fora do ângulo, mas a menos de m de uma das faces radiais (do lado de fora dela)
  const d0=wrapPi(th-A.a0), d1=wrapPi(A.a0+A.span-th);
  return (d0<0&&d0>-Math.PI/2&&-r*Math.sin(d0)<m)||(d1<0&&d1>-Math.PI/2&&-r*Math.sin(d1)<m);
}
function obbIn(O,x,z,m){ const dx=x-O.cx, dz=z-O.cz; return Math.abs(dx*O.c+dz*O.s)<=O.hx+m&&Math.abs(-dx*O.s+dz*O.c)<=O.hz+m; }
function solidInXZ(b,x,z,m=0){
  if(x<b.minX-m||x>b.maxX+m||z<b.minZ-m||z>b.maxZ+m) return false;
  if(b.arc) return arcIn(b.arc,x,z,m);
  if(b.obb) return obbIn(b.obb,x,z,m);
  return true;
}
const solidBottom=b=>b.bottom!=null?b.bottom:b.top-.3;
function solidHas(b,x,y,z,m=0){ return y>=solidBottom(b)-m&&y<=b.top+m&&solidInXZ(b,x,z,m); }
// zona (sala, trigger): {minX..maxZ,minY,maxY} com arc opcional (anel do pátio, corredor curvo)
function inZone(p,z){ return p.y>=z.minY&&p.y<=z.maxY&&p.x>=z.minX&&p.x<=z.maxX&&p.z>=z.minZ&&p.z<=z.maxZ&&(!z.arc||arcIn(z.arc,p.x,p.z,0)); }

// ---------- empurra p (pés) para fora do sólido, no plano, pela face mais próxima; zera a velocidade contra a face ----------
function _pushAlong(p,v,nx,nz,d){ p.x+=nx*d; p.z+=nz*d; const vn=v.x*nx+v.z*nz; if(vn<0){ v.x-=vn*nx; v.z-=vn*nz; } }
function _arcPush(A,p,v,m){
  const dx=p.x-A.cx, dz=p.z-A.cz, r=Math.hypot(dx,dz);
  if(r>=A.r1+m||(A.r0>0&&r<=A.r0-m)) return false;
  const ux=r>1e-6?dx/r:1, uz=r>1e-6?dz/r:0;
  let k=A.r1+m-r, mode=1;                                         // 1: para fora (raio maior)
  if(A.r0>m&&r-(A.r0-m)<k){ k=r-(A.r0-m); mode=2; }              // 2: para dentro (raio menor)
  if(A.span<TAU-1e-6){
    // dentro do ângulo: distância a cada face radial só vale no primeiro quarto de volta a partir dela (setores maiores
    // que meia volta também funcionam); fora do ângulo: só conta se estiver encostado numa face (a menos de m, por fora)
    const th=Math.atan2(dz,dx), d=wrap2(th-A.a0), inside=d<=A.span;
    let p0=Infinity, p1=Infinity;
    if(inside){ if(d<Math.PI/2) p0=r*Math.sin(d)+m; const e=A.span-d; if(e<Math.PI/2) p1=r*Math.sin(e)+m; }
    else {
      const d0=wrapPi(th-A.a0), d1=wrapPi(A.a0+A.span-th);
      if(d0<0&&d0>-Math.PI/2){ const t=r*Math.sin(d0); if(t>-m) p0=t+m; }
      if(d1<0&&d1>-Math.PI/2){ const t=r*Math.sin(d1); if(t>-m) p1=t+m; }
      if(p0===Infinity&&p1===Infinity) return false;
    }
    if(p0<k){ k=p0; mode=3; } if(p1<k){ k=p1; mode=4; }
  }
  if(k<=0) return false;
  if(mode===1) _pushAlong(p,v,ux,uz,k);
  else if(mode===2) _pushAlong(p,v,-ux,-uz,k);
  else if(mode===3) _pushAlong(p,v,Math.sin(A.a0),-Math.cos(A.a0),k);                 // face inicial: normal para fora
  else { const a1=A.a0+A.span; _pushAlong(p,v,-Math.sin(a1),Math.cos(a1),k); }       // face final
  return true;
}
function _obbPush(O,p,v,m){
  const dx=p.x-O.cx, dz=p.z-O.cz, lx=dx*O.c+dz*O.s, lz=-dx*O.s+dz*O.c;
  const ox1=O.hx+m-lx, ox2=lx+O.hx+m, oz1=O.hz+m-lz, oz2=lz+O.hz+m;
  if(ox1<=0||ox2<=0||oz1<=0||oz2<=0) return false;
  const k=Math.min(ox1,ox2,oz1,oz2);
  if(k===ox1) _pushAlong(p,v,O.c,O.s,ox1); else if(k===ox2) _pushAlong(p,v,-O.c,-O.s,ox2);
  else if(k===oz1) _pushAlong(p,v,-O.s,O.c,oz1); else _pushAlong(p,v,O.s,-O.c,oz2);
  return true;
}
function solidPush(b,p,v,m){
  if(b.arc) return _arcPush(b.arc,p,v,m);
  if(b.obb) return _obbPush(b.obb,p,v,m);
  const ox1=(b.maxX+m)-p.x, ox2=p.x-(b.minX-m), oz1=(b.maxZ+m)-p.z, oz2=p.z-(b.minZ-m);
  if(ox1<=0||ox2<=0||oz1<=0||oz2<=0) return false;
  const k=Math.min(ox1,ox2,oz1,oz2);
  if(k===ox1){ p.x+=ox1; v.x=Math.max(v.x,0); } else if(k===ox2){ p.x-=ox2; v.x=Math.min(v.x,0); }
  else if(k===oz1){ p.z+=oz1; v.z=Math.max(v.z,0); } else { p.z-=oz2; v.z=Math.min(v.z,0); }
  return true;
}

// ---------- ponto do sólido mais próximo de (x,z), recuado 'inset' das bordas (alvo do mantle, distâncias) ----------
function solidClampIn(b,x,z,inset,out){
  out=out||{x:0,z:0};
  if(b.arc){
    const A=b.arc, dx=x-A.cx, dz=z-A.cz; let r=Math.hypot(dx,dz), th=Math.atan2(dz,dx);
    const lo=A.r0>0?A.r0+inset:0, hi=A.r1-inset; r=hi>=lo?clamp(r,lo,hi):(A.r0+A.r1)/2;
    if(A.span<TAU-1e-6){
      let d=wrap2(th-A.a0); if(d>A.span) d=(d-A.span<TAU-d)?A.span:0;                 // fora do ângulo: face mais próxima
      const pad=Math.min(A.span/2,inset/Math.max(r,.5)); th=A.a0+clamp(d,pad,A.span-pad);
    }
    out.x=A.cx+r*Math.cos(th); out.z=A.cz+r*Math.sin(th); return out;
  }
  if(b.obb){
    const O=b.obb, dx=x-O.cx, dz=z-O.cz; let lx=dx*O.c+dz*O.s, lz=-dx*O.s+dz*O.c;
    lx=O.hx>inset?clamp(lx,-O.hx+inset,O.hx-inset):0; lz=O.hz>inset?clamp(lz,-O.hz+inset,O.hz-inset):0;
    out.x=O.cx+lx*O.c-lz*O.s; out.z=O.cz+lx*O.s+lz*O.c; return out;
  }
  out.x=b.maxX-b.minX>2*inset?clamp(x,b.minX+inset,b.maxX-inset):(b.minX+b.maxX)/2;
  out.z=b.maxZ-b.minZ>2*inset?clamp(z,b.minZ+inset,b.maxZ-inset):(b.minZ+b.maxZ)/2;
  return out;
}
const _dq={x:0,z:0};
function solidDistXZ(b,x,z){ if(solidInXZ(b,x,z,0)) return 0; solidClampIn(b,x,z,0,_dq); return Math.hypot(x-_dq.x,z-_dq.z); }

// ---------- segmento a→b atravessa algum sólido? (abrigo do vento, linha de visada). skip(s) ignora sólidos ----------
function segBlocked(plats,ax,ay,az,bx,by,bz,skip){
  const minX=Math.min(ax,bx),maxX=Math.max(ax,bx),minY=Math.min(ay,by),maxY=Math.max(ay,by),minZ=Math.min(az,bz),maxZ=Math.max(az,bz);
  const n=Math.max(2,Math.ceil(Math.hypot(bx-ax,by-ay,bz-az)/.2));
  for(const s of plats){
    if(s.maxX<minX||s.minX>maxX||s.maxZ<minZ||s.minZ>maxZ||s.top<minY||solidBottom(s)>maxY) continue;
    if(skip&&skip(s)) continue;
    for(let i=1;i<n;i++){ const t=i/n, y=ay+(by-ay)*t; if(y<solidBottom(s)||y>s.top) continue;
      if(solidInXZ(s,ax+(bx-ax)*t,az+(bz-az)*t,0)) return s; }
  }
  return null;
}

// ---------- corpo do jogador contra todos os sólidos ----------
// p, v, prev: pés, velocidade e pés no quadro anterior. o.guard(p,prev,v) = restrição final (parede do poço).
// 1) vertical: pousa no topo (vindo de cima) ou bate a cabeça (vindo de baixo)  2) horizontal: sai pela face mais próxima
function collideBody(plats,p,v,prev,o){
  let landed=false, landVy=0;
  const lo=Math.min(p.y,prev.y), hi=Math.max(p.y,prev.y)+BODY_H;
  for(const b of plats){
    const bottom=solidBottom(b);
    if(lo>b.top||hi<bottom) continue;
    if(!solidInXZ(b,p.x,p.z,RAD)) continue;
    if(v.y<=0&&prev.y>=b.top-.06&&p.y<=b.top){ landVy=Math.min(landVy,v.y); p.y=b.top; v.y=0; landed=true; }
    else if(v.y>0&&prev.y+BODY_H<=bottom+.06&&p.y+BODY_H>bottom){ p.y=bottom-BODY_H; v.y=0; }
  }
  for(const b of plats){
    const bottom=solidBottom(b);
    if(p.y+BODY_H<=bottom+.01||p.y>=b.top-.01) continue;
    if(b.flat&&solidInXZ(b,p.x,p.z,RAD)){
      const up=b.top-p.y, down=p.y+BODY_H-bottom;
      if(up<=FLAT_FIX&&up<=down){ p.y=b.top; if(v.y<0) v.y=0; landed=true; continue; }
      if(down<=FLAT_FIX){ p.y=bottom-BODY_H; if(v.y>0) v.y=0; continue; }
    }
    solidPush(b,p,v,RAD);
  }
  if(o&&o.guard) o.guard(p,prev,v);
  return {landed,landVy};
}
