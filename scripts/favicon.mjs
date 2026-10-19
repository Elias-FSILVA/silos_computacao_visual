// ============================================================================
// scripts/favicon.mjs — gera o ícone do jogo (favicon, ícone de app e de atalho no iOS)
// O desenho: o poço do silo visto de baixo. Anéis da parede que sobem e se fecham em direção à luz de sódio
// da saída, e a massa escura-vermelha subindo pelo fundo. A geometria é uma só lista de formas, usada tanto
// para escrever o SVG quanto para rasterizar os PNG (supersampling NxN por pixel), então os dois batem.
// Saída em assets/icon/: favicon.svg, favicon.ico (16/32/48), apple-touch-icon.png (180), icon-192.png, icon-512.png.
// Sem dependências: grava PNG com o zlib do Node e monta o ICO com PNG embutido.
// Uso: node scripts/favicon.mjs
// ============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets/icon');
const SS = 6;   // amostras por eixo em cada pixel

// paleta de css/base.css
const C = { bg: '#0d0c0b', dust: '#857f74', bone: '#ddd6c8', sodium: '#e3b341', glow: '#e3b341', flesh: '#c23a28', mass: '#5a160e' };

// ---------- geometria (grade 64x64) ----------
const S = 64, R = 13;                                   // lado e raio do canto do fundo
const rings = [                                          // [cx, cy, raio, espessura, cor]
  [32, 36, 25, 4, C.dust],
  [32, 32, 16, 3.5, C.bone],
  [32, 29, 8, 3, C.bone],
];
const light = [32, 28, 4];                             // a saída lá em cima
const glow = [32, 28, 6.5];                              // halo da luz (translúcido)
const massTop = 51;                                      // a massa enche o anel de fora abaixo desta linha

const hypot = Math.hypot;
const inRRect = (x, y) => { const dx = Math.max(R - x, 0, x - (S - R)), dy = Math.max(R - y, 0, y - (S - R)); return hypot(dx, dy) <= R && x >= 0 && y >= 0 && x <= S && y <= S; };
const [ox, oy, orr, ow] = rings[0];

// cada forma: cor, alfa e teste de ponto; a ordem é a de pintura
const shapes = [
  { color: C.bg, a: 1, hit: inRRect },
  { color: C.mass, a: 1, hit: (x, y) => y >= massTop && hypot(x - ox, y - oy) <= orr },
  { color: C.flesh, a: 1, hit: (x, y) => y >= massTop && y <= massTop + 2.2 && hypot(x - ox, y - oy) <= orr },
  ...rings.map(([cx, cy, r, w, color]) => ({ color, a: 1, hit: (x, y) => Math.abs(hypot(x - cx, y - cy) - r) <= w / 2 })),
  { color: C.glow, a: .28, hit: (x, y) => hypot(x - glow[0], y - glow[1]) <= glow[2] },
  { color: C.sodium, a: 1, hit: (x, y) => hypot(x - light[0], y - light[1]) <= light[2] },
];

// ---------- SVG ----------
// a massa é o disco do anel de fora recortado abaixo de massTop; a borda vermelha é a faixa do topo dela
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
<defs><clipPath id="o"><circle cx="${ox}" cy="${oy}" r="${orr}"/></clipPath></defs>
<rect width="${S}" height="${S}" rx="${R}" fill="${C.bg}"/>
<g clip-path="url(#o)"><rect x="0" y="${massTop}" width="${S}" height="${S - massTop}" fill="${C.mass}"/><rect x="0" y="${massTop}" width="${S}" height="2.2" fill="${C.flesh}"/></g>
${rings.map(([cx, cy, r, w, c]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/>`).join('\n')}
<circle cx="${glow[0]}" cy="${glow[1]}" r="${glow[2]}" fill="${C.glow}" fill-opacity=".28"/>
<circle cx="${light[0]}" cy="${light[1]}" r="${light[2]}" fill="${C.sodium}"/>
</svg>
`;

// ---------- rasterização ----------
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const cols = shapes.map(s => rgb(s.color));

function render(size) {
  const px = Buffer.alloc(size * size * 4), k = S / size;
  for (let py = 0; py < size; py++) for (let qx = 0; qx < size; qx++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (qx + (sx + .5) / SS) * k, y = (py + (sy + .5) / SS) * k;
      let cr = 0, cg = 0, cb = 0, ca = 0;   // pré-multiplicado, "over" na ordem das formas
      shapes.forEach((s, i) => {
        if (!s.hit(x, y)) return;
        const [sr, sg, sb] = cols[i];
        cr = sr * s.a + cr * (1 - s.a); cg = sg * s.a + cg * (1 - s.a); cb = sb * s.a + cb * (1 - s.a); ca = s.a + ca * (1 - s.a);
      });
      r += cr; g += cg; b += cb; a += ca;
    }
    const n = SS * SS, o = (py * size + qx) * 4;
    if (a <= 0) continue;
    px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); px[o + 3] = Math.round(a / n * 255);
  }
  return px;
}

// ---------- PNG e ICO ----------
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function png(size) {
  const px = render(size), raw = Buffer.alloc(size * (size * 4 + 1));   // filtro 0 em todas as linhas
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), out = Buffer.alloc(td.length + 8);
    out.writeUInt32BE(data.length, 0); td.copy(out, 4); out.writeUInt32BE(crc32(td), td.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function ico(sizes) {
  const imgs = sizes.map(png), head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length;
  imgs.forEach((img, i) => {
    const e = 6 + 16 * i, s = sizes[i] >= 256 ? 0 : sizes[i];
    head[e] = s; head[e + 1] = s; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(img.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += img.length;
  });
  return Buffer.concat([head, ...imgs]);
}

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'favicon.svg'), svg);
writeFileSync(join(dir, 'favicon.ico'), ico([16, 32, 48]));
writeFileSync(join(dir, 'apple-touch-icon.png'), png(180));
writeFileSync(join(dir, 'icon-192.png'), png(192));
writeFileSync(join(dir, 'icon-512.png'), png(512));
console.log('gerados em assets/icon/: favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png');
