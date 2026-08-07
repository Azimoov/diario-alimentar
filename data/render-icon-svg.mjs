// render-icon-svg.mjs — gera icons/icon-512.png e icons/icon-180.png a
// partir de icons/icon.svg. Rode depois de editar o desenho da espada.
//
// Uso: node data/render-icon-svg.mjs
// Requer Playwright (`npm i -D playwright`).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright não encontrado. Rode: npm i -D playwright');
  process.exit(1);
}

const ICONS = new URL('../icons/', import.meta.url).pathname;
const svg = readFileSync(join(ICONS, 'icon.svg'), 'utf8');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const size of [512, 180]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    '<body style="margin:0"><div style="width:' + size + 'px;height:' + size + 'px">'
    + svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ') + '</div></body>');
  const dest = join(ICONS, 'icon-' + size + '.png');
  await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('gerado ' + dest);
}
await browser.close();
