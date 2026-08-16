// Confere a marca Highlander na interface + regressão rápida das 3 áreas.
import { abrirNavegador, paginaLogada, APP as BASE } from './_comum.mjs';
let fails = 0;
const check = (n, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + extra + ']' : '')); if (!ok) fails++; };

const browser = await abrirNavegador();
// o app exige login: entra primeiro, depois confere as telas internas
const { page } = await paginaLogada(browser, { onErro: e => { console.log('PAGEERROR', e.message); fails++; } });
const falhasDeRede = [];
page.on('requestfailed', r => falhasDeRede.push(r.url()));
page.on('response', r => { if (r.status() >= 400) falhasDeRede.push(r.url() + ' -> ' + r.status()); });

check('título da página', (await page.title()) === 'Highlander — diário alimentar, exames e métricas', await page.title());
// o chip de conta vive dentro do .brand, então o nome é o primeiro nó de texto
check('marca no topo', (await page.evaluate(() => {
  const b = document.querySelector('.brand');
  return [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
})) === 'Highlander', await page.textContent('.brand'));
check('chip de conta presente no topo', await page.locator('#conta-chip').count() === 1);
const icon = page.locator('.brand-icon');
check('ícone ao lado do nome', await icon.count() === 1 && (await icon.getAttribute('src')) === 'icons/icon.svg', await icon.getAttribute('src'));
check('favicon aponta p/ o SVG', await page.evaluate(() => {
  const l = document.querySelector('link[rel=icon]');
  return l && l.getAttribute('href') === 'icons/icon.svg' && l.getAttribute('type') === 'image/svg+xml';
}));
const box = await icon.boundingBox();
check('ícone renderiza com tamanho', box && box.width >= 18 && box.height >= 18, box && (box.width + 'x' + box.height));
check('boas-vindas cita Highlander', (await page.textContent('.welcome h3')).includes('Highlander'));

const mani = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
check('manifest name/short_name', mani.name === 'Highlander' && mani.short_name === 'Highlander', mani.name + '|' + mani.short_name);
check('manifest splash escuro', mani.background_color === '#0d0906', mani.background_color);
check('ícones do manifest existem', await page.evaluate(async (icons) => {
  for (const i of icons) { const r = await fetch(i.src); if (!r.ok) return false; }
  return true;
}, mani.icons));

// nome do arquivo de export
const dl = await page.evaluate(() => {
  let captured = null;
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { captured = this.getAttribute('download'); };
  document.querySelectorAll('.app-btn')[0].click();
  window.__exp = null;
  const btns = [...document.querySelectorAll('#tab-dados button')];
  const b = btns.find(x => x.textContent.includes('Exportar JSON'));
  if (b) b.click();
  HTMLAnchorElement.prototype.click = orig;
  return captured;
});
check('export baixa como highlander-*.json', /^highlander-\d{4}-\d{2}-\d{2}\.json$/.test(dl || ''), dl);

// regressão: as 3 áreas ainda abrem
await page.click('.app-btn[data-app="exames"]');
check('área Exames abre', await page.locator('#tab-exlab.active').count() === 1);
await page.click('.app-btn[data-app="saude"]');
check('área Métricas abre', await page.locator('#tab-saude.active').count() === 1);
await page.click('.app-btn[data-app="diario"]');
check('área Diário abre', await page.locator('#tab-hoje.active').count() === 1);

check('nenhuma requisição falhou', falhasDeRede.length === 0, falhasDeRede.join(', '));
await page.screenshot({ path: 'shot-brand.png' });

await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
