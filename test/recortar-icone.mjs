// Testa data/recortar-icone.html: carrega uma imagem larga (4:3), enquadra,
// arrasta, dá zoom e confere se os PNGs baixados saem 512 e 180 quadrados.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// caminhos portáteis: RAIZ é a pasta do projeto, TMP a pasta temporária do SO
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = tmpdir();

let fails = 0;
const check = (n, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + extra + ']' : '')); if (!ok) fails++; };

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
page.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });

// imagem de teste 400x300 com metades distinguíveis (esquerda vermelha, direita azul)
const srcPng = await (async () => {
  const p = await browser.newPage();
  await p.setContent('<body style="margin:0"></body>');
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const x = c.getContext('2d');
    x.fillStyle = '#c00'; x.fillRect(0, 0, 200, 300);
    x.fillStyle = '#00c'; x.fillRect(200, 0, 200, 300);
    x.fillStyle = '#fff'; x.fillRect(180, 20, 40, 40); // marca no alto, ao centro
    return c.toDataURL('image/png').split(',')[1];
  });
  await p.close();
  return Buffer.from(b64, 'base64');
})();
const SRC = join(TMP, 'fonte-teste.png');
writeFileSync(SRC, srcPng);

await page.goto('file://' + join(RAIZ, 'data/recortar-icone.html'));
check('abre via file:// (sem servidor)', await page.locator('h1').count() === 1);
check('painel escondido antes da imagem', await page.locator('#stage.on').count() === 0);

await page.locator('#file').setInputFiles(SRC);
await page.waitForSelector('#stage.on');
check('painel aparece após escolher a imagem', true);

const info1 = await page.textContent('#info');
check('recorte inicial = maior quadrado centrado', info1.includes('300×300') && info1.includes('(50, 0)'), info1);

// arrastar para a esquerda move o recorte para a direita (segue o dedo)
const box = await page.locator('#main').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
const info2 = await page.textContent('#info');
const sx2 = Number(/\((\d+), /.exec(info2)[1]);
check('arrastar reposiciona o recorte', sx2 > 50, info2);

// zoom fecha o recorte e não sai da imagem
await page.locator('#zoom').fill('200');
const info3 = await page.textContent('#info');
const lado3 = Number(/recorte (\d+)×/.exec(info3)[1]);
const sx3 = Number(/\((\d+), /.exec(info3)[1]);
check('zoom 200% fecha o recorte (150px)', lado3 === 150, info3);
check('recorte continua dentro da imagem', sx3 >= 0 && sx3 + lado3 <= 400, sx3 + '+' + lado3);

// reset volta ao centro
await page.locator('#reset').click();
check('reset volta ao enquadramento inicial', (await page.textContent('#info')).includes('(50, 0)'));

// baixar os dois PNGs
const baixados = [];
page.on('download', async d => {
  const dest = join(TMP, 'dl-' + d.suggestedFilename());
  await d.saveAs(dest);
  baixados.push({ nome: d.suggestedFilename(), dest });
});
await page.locator('#baixar').click();
await page.waitForTimeout(1500);
check('baixou os dois arquivos', baixados.length === 2 && baixados.some(b => b.nome === 'icon-512.png') && baixados.some(b => b.nome === 'icon-180.png'),
  baixados.map(b => b.nome).join(','));

// confere dimensões reais lendo o header do PNG
function pngSize(path) {
  const buf = readFileSync(path);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
for (const b of baixados) {
  if (!existsSync(b.dest)) { check('arquivo ' + b.nome + ' existe', false); continue; }
  const esperado = b.nome.includes('512') ? 512 : 180;
  const s = pngSize(b.dest);
  check(b.nome + ' é ' + esperado + '×' + esperado, s.w === esperado && s.h === esperado, s.w + 'x' + s.h);
}

// prévia de 60px existe e é o tamanho real do ícone na tela
const pv = await page.locator('#pv60').boundingBox();
check('prévia de 60 px em tamanho real', pv && Math.round(pv.width) === 60, pv && pv.width);

await page.screenshot({ path: join(TMP, 'shot-cropper.png'), fullPage: true });
await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
