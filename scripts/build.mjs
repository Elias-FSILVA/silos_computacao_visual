// ============================================================================
// scripts/build.mjs — monta a versão estática do jogo em dist/ (deploy na Vercel ou em qualquer host)
// Sem bundler: copia index.html, css, js e assets, e traz só os arquivos do Three.js que o jogo usa
// para dist/vendor/three (node_modules não vai para o deploy). O index.html de dist aponta para lá.
// Uso: npm run build   (depois, "npm run preview" serve dist/ localmente)
// ============================================================================
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const THREE_FILES = [
  'build/three.min.js',
  'examples/js/loaders/GLTFLoader.js',
  'examples/js/utils/SkeletonUtils.js',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// os .glb originais do mapa não vão para o deploy quando existe a cópia otimizada (assets/models/map/otimizados)
const mapDir = join(root, 'assets/models/map');
const skip = src => dirname(src) === mapDir && src.endsWith('.glb') && existsSync(join(mapDir, 'otimizados', src.slice(mapDir.length + 1)));
for (const dir of ['css', 'js', 'assets']) cpSync(join(root, dir), join(out, dir), { recursive: true, filter: src => !skip(src) });

for (const f of THREE_FILES) {
  const src = join(root, 'node_modules/three', f);
  if (!existsSync(src)) throw new Error(`Falta ${src}. Rode "npm install" antes do build.`);
  const dst = join(out, 'vendor/three', f);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
const built = html.replaceAll('node_modules/three/', 'vendor/three/');
if (built.includes('node_modules/')) throw new Error('index.html ainda referencia node_modules/ fora do Three.js.');
writeFileSync(join(out, 'index.html'), built);

console.log('dist/ pronto.');
