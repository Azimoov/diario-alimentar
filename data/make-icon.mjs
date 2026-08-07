// make-icon.mjs — gera os ícones do app (icons/icon-512.png e icon-180.png)
// recortando um QUADRADO de uma imagem sua.
//
// Uso:
//   node data/make-icon.mjs icons/fonte.jpg
//   node data/make-icon.mjs icons/fonte.jpg --y=38 --zoom=1.15
//
// Opções (todas opcionais):
//   --x=50     centro do recorte no eixo horizontal, em % da largura
//   --y=45     centro do recorte no eixo vertical, em % da altura
//              (menor = mais para cima; útil quando o assunto está no alto)
//   --zoom=1   1 = maior quadrado que cabe na imagem; 1.2 = 20% mais fechado
//   --out=icons  pasta de saída
//
// Não depende de ImageMagick/sharp: usa o Chromium do Playwright para
// desenhar o recorte num canvas e exportar PNG.
//
// Precisa do Playwright (`npm i -D playwright`). Se preferir NÃO instalar
// nada, abra `data/recortar-icone.html` no navegador: mesma coisa, com
// controles visuais, e baixa os PNGs prontos.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { extname, resolve, join } from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright não encontrado. Duas saídas:\n'
    + '  1) npm i -D playwright   (e rode este script de novo)\n'
    + '  2) abra data/recortar-icone.html no navegador — não instala nada.');
  process.exit(1);
}

const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith('--'));
if (!src) {
  console.error('Uso: node data/make-icon.mjs <imagem> [--x=50] [--y=45] [--zoom=1] [--out=icons]');
  process.exit(1);
}
const opt = (nome, padrao) => {
  const a = args.find(x => x.startsWith('--' + nome + '='));
  return a ? Number(a.split('=')[1]) : padrao;
};
const outDir = (args.find(a => a.startsWith('--out=')) || '--out=icons').split('=')[1];
const fx = opt('x', 50) / 100;
const fy = opt('y', 45) / 100;
const zoom = opt('zoom', 1);

const srcPath = resolve(src);
if (!existsSync(srcPath)) { console.error('Não achei o arquivo: ' + srcPath); process.exit(1); }
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const mime = MIME[extname(srcPath).toLowerCase()];
if (!mime) { console.error('Formato não suportado: ' + extname(srcPath) + ' (use jpg, png ou webp)'); process.exit(1); }
const dataUrl = 'data:' + mime + ';base64,' + readFileSync(srcPath).toString('base64');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<body style="margin:0"></body>');

const info = await page.evaluate(async ({ dataUrl, fx, fy, zoom }) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  // maior quadrado que cabe, fechado por `zoom`, centrado no ponto focal e
  // preso às bordas para nunca sair da imagem
  const side = Math.min(img.width, img.height) / zoom;
  const sx = Math.max(0, Math.min(img.width - side, img.width * fx - side / 2));
  const sy = Math.max(0, Math.min(img.height - side, img.height * fy - side / 2));
  const saidas = {};
  for (const size of [512, 180, 60]) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    saidas[size] = c.toDataURL('image/png').split(',')[1];
  }
  return { w: img.width, h: img.height, side: Math.round(side), sx: Math.round(sx), sy: Math.round(sy), saidas };
}, { dataUrl, fx, fy, zoom });

await browser.close();

for (const size of [512, 180]) {
  const dest = join(outDir, 'icon-' + size + '.png');
  writeFileSync(dest, Buffer.from(info.saidas[size], 'base64'));
  console.log('gerado ' + dest);
}
// prévia no tamanho que o ícone realmente aparece na tela de início
writeFileSync(join(outDir, 'previa-60.png'), Buffer.from(info.saidas[60], 'base64'));
console.log('gerado ' + join(outDir, 'previa-60.png') + '  (prévia — não é usada pelo app)');
console.log(`origem ${info.w}x${info.h} · recorte ${info.side}x${info.side} a partir de (${info.sx}, ${info.sy})`);
console.log('Não gostou do enquadramento? Repita com --x/--y (ponto focal em %) e --zoom.');
