// novidades.mjs — o histórico de versões e o popup de "o que mudou".
//
// Dois riscos que estes testes existem para pegar:
//  1. o changelog e o `?v=N` do index.html saírem de sincronia — aí a pessoa
//     vê novidades que não batem com o código que está rodando (ou não vê);
//  2. o popup aparecer toda vez (vira praga) ou nunca (não serve p/ nada).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirNavegador, paginaLogada, RAIZ } from './_comum.mjs';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 160) + ']' : ''));
  if (!ok) fails++;
};

// ---- sem navegador: o changelog casa com a versão dos assets? ----
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const changelog = readFileSync(join(RAIZ, 'js/changelog.js'), 'utf8');
const versoesHtml = [...html.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
const versaoTopo = (changelog.match(/versao:\s*'(\d+)'/) || [])[1];

check('todos os assets do index.html usam a MESMA versão',
  new Set(versoesHtml).size === 1, [...new Set(versoesHtml)].join(', '));
check('a versão do topo do changelog é a mesma do ?v=N',
  versaoTopo === versoesHtml[0], JSON.stringify({ changelog: versaoTopo, html: versoesHtml[0] }));

const browser = await abrirNavegador();

// ---- conta NOVA não leva popup: não perdeu atualização nenhuma ----
const nova = await paginaLogada(browser, { prefixo: 'versao-nova' });
check('conta recém-criada não recebe o popup',
  await nova.page.locator('.modal', { hasText: 'O que mudou' }).count() === 0);
check('mas a versão já fica marcada como vista (não aparece depois do nada)',
  await nova.page.evaluate(() => window.Store.get().settings.versaoVista) === versaoTopo);
await nova.ctx.close();

// ---- quem JÁ usava o app recebe o popup uma vez ----
const { page, ctx } = await paginaLogada(browser, { prefixo: 'versao-antiga' });
// simula alguém que vinha da versão anterior e tem dados
await page.evaluate(() => {
  const s = window.Store.get();
  s.settings.versaoVista = '1';                       // versão antiga
  s.weights['2026-08-01'] = 85;                       // e tem histórico
  window.Store.save();
});
await page.reload();
await page.waitForSelector('.daynav');
await page.waitForSelector('.modal', { timeout: 10000 });
const popup = await page.locator('.modal').textContent();
check('quem vinha de uma versão anterior recebe o popup', true);
check('o popup mostra o título e as mudanças da versão nova',
  popup.includes('versão ' + versaoTopo) && popup.length > 80, popup.slice(0, 120));
check('e mostra SÓ a versão nova, não o histórico inteiro',
  await page.locator('.modal .versao-bloco').count() === 1);
check('a versão vista foi atualizada',
  await page.evaluate(() => window.Store.get().settings.versaoVista) === versaoTopo);

// ---- e não volta na abertura seguinte ----
await page.locator('.modal .icon-btn').click();
await page.reload();
await page.waitForSelector('.daynav');
await page.waitForTimeout(600);
check('na segunda abertura o popup NÃO volta',
  await page.locator('.modal').count() === 0);

// ---- o histórico completo vive em Diário → Dados ----
await page.click('.app-btn[data-app="diario"]');
await page.click('nav.tabs[data-app="diario"] .tab-btn[data-tab="dados"]');
const cartao = page.locator('#tab-dados .card', { hasText: '✨ Novidades' });
check('cartão de novidades aparece nas configurações', await cartao.count() === 1);
check('e diz em que versão a pessoa está',
  (await cartao.textContent()).includes('versão ' + versaoTopo));
await cartao.getByRole('button', { name: /Ver o que mudou/ }).click();
await page.waitForSelector('.modal .versao-bloco');
check('a lista completa traz várias versões, não só a última',
  await page.locator('.modal .versao-bloco').count() >= 3,
  await page.locator('.modal .versao-bloco').count());
check('cada versão listada tem pelo menos uma mudança escrita',
  await page.locator('.modal .versao-lista li').count() >= 3);

await page.screenshot({ path: 'shot-novidades.png', fullPage: true });
await ctx.close();
await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
