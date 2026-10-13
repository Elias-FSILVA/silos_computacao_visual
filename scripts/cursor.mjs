// ============================================================================
// scripts/cursor.mjs — gera os sprites do cursor de interação (mão petrificada) a partir da arte original
// Entrada: assets/ponteiro/cursor_silo.png (arte grande, RGBA com transparência real).
// Saída:   assets/ponteiro/cursor_silo_1x.png e cursor_silo_2x.png (telas comuns e de alta densidade).
// A mão é recortada (sem esticar: a proporção original é mantida com margem transparente nas laterais) e
// reduzida por média de área, que é a filtragem correta para reduzir: nada é ampliado, então não há borrão.
// Pixels com alfa < 16 são ruído quase invisível espalhado pela arte e viram transparência total.
// Imprime o hotspot (ponta do indicador) que vai em css/cursor.css.
// Sem dependências: lê e grava PNG com o zlib do Node.
// Uso: node scripts/cursor.mjs [altura em px no 1x, padrão 40]
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets/ponteiro');
const height = Number(process.argv[2] || 40);
if (!Number.isInteger(height) || height < 8 || height > 128) throw new Error('Altura inválida: use um inteiro entre 8 e 128.');
const NOISE = 16;   // alfa abaixo disto é ruído
const TIP = 128;    // alfa mínimo para contar como parte da ponta do dedo

// ---------- PNG ----------
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function readPng(file) {
  const buf = readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`${file} não é PNG.`);
  let pos = 8, w = 0, h = 0, ok = false; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ok = data[8] === 8 && data[9] === 6 && data[12] === 0; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!ok) throw new Error(`${file}: esperado PNG RGBA de 8 bits, sem entrelaçamento.`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, cur = y * stride, prev = cur - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[cur + x - 4] : 0, b = y ? px[prev + x] : 0, c = y && x >= 4 ? px[prev + x - 4] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[cur + x] = (raw[src + x] + p) & 255;
    }
  }
  return { w, h, px };
}

function writePng(file, w, h, px) {
  const raw = Buffer.alloc(h * (w * 4 + 1));   // filtro 0 em todas as linhas
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), out = Buffer.alloc(td.length + 8);
    out.writeUInt32BE(data.length, 0); td.copy(out, 4); out.writeUInt32BE(crc32(td), td.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// ---------- recorte, hotspot e redução ----------
const src = readPng(join(dir, 'cursor_silo.png'));
const { w: W, h: H, px } = src;
let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (px[i + 3] < NOISE) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; continue; }
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
}
if (bx1 < 0) throw new Error('A imagem não tem nenhum pixel visível.');
const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;

// ponta do indicador: a linha visível mais alta; x = média dos pixels sólidos no topo do dedo (2% da altura da mão)
let tipY = -1, sx = 0, n = 0;
for (let y = by0; y <= by1 && (tipY < 0 || y < tipY + Math.max(2, bh * .02)); y++) for (let x = bx0; x <= bx1; x++) {
  if (px[(y * W + x) * 4 + 3] < TIP) continue;
  if (tipY < 0) tipY = y;
  sx += x; n++;
}
const tipX = sx / n;

// alfa pré-multiplicado: a média de área não escurece nem clareia o contorno
const pre = new Float32Array(W * H * 4);
for (let i = 0; i < W * H * 4; i += 4) { const a = px[i + 3] / 255; pre[i] = px[i] * a; pre[i + 1] = px[i + 1] * a; pre[i + 2] = px[i + 2] * a; pre[i + 3] = px[i + 3]; }

// mesma escala nos dois eixos: a largura arredonda para cima e o recorte ganha margem transparente centrada
const outW = Math.ceil(height * bw / bh), k1 = bh / height, x0 = bx0 + bw / 2 - outW * k1 / 2, y0 = by0;

function resample(scale) {
  const ow = outW * scale, oh = height * scale, k = k1 / scale;
  const taps = (start, count, len) => Array.from({ length: count }, (_, o) => {
    const a = start + o * k, b = a + k, list = [];
    for (let i = Math.floor(a); i < Math.ceil(b); i++) {
      const wgt = Math.min(b, i + 1) - Math.max(a, i);
      if (wgt > 0 && i >= 0 && i < len) list.push([i, wgt / k]);
    }
    return list;
  });
  const tx = taps(x0, ow, W), ty = taps(y0, oh, H), out = Buffer.alloc(ow * oh * 4);
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [y, wy] of ty[oy]) for (const [x, wx] of tx[ox]) {
      const s = (y * W + x) * 4, wgt = wx * wy;
      r += pre[s] * wgt; g += pre[s + 1] * wgt; b += pre[s + 2] * wgt; a += pre[s + 3] * wgt;
    }
    const o = (oy * ow + ox) * 4, A = Math.round(a);
    if (A <= 0) continue;
    const u = 255 / a;
    out[o] = Math.min(255, Math.round(r * u)); out[o + 1] = Math.min(255, Math.round(g * u)); out[o + 2] = Math.min(255, Math.round(b * u)); out[o + 3] = Math.min(255, A);
  }
  writePng(join(dir, `cursor_silo_${scale}x.png`), ow, oh, out);
  return `${ow}x${oh}`;
}

const sizes = [1, 2].map(resample);
const hx = Math.min(outW - 1, Math.floor((tipX - x0) / k1)), hy = Math.min(height - 1, Math.floor((tipY - y0) / k1));
console.log(`mão na arte original: x ${bx0}..${bx1}, y ${by0}..${by1} · ponta do indicador em (${tipX.toFixed(1)}, ${tipY})`);
console.log(`gerados: cursor_silo_1x.png (${sizes[0]}) e cursor_silo_2x.png (${sizes[1]})`);
console.log(`hotspot (CSS, em px do 1x): ${hx} ${hy}   → atualize css/cursor.css se mudou`);
