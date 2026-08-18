// remedios.mjs — a área 💊 Remédios: anotar, encerrar (sem apagar) e — o que
// dá sentido à área — chegar junto dos exames quando a IA for ler os dados.
import { abrirNavegador, paginaLogada } from './_comum.mjs';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 160) + ']' : ''));
  if (!ok) fails++;
};

const browser = await abrirNavegador();
const { page } = await paginaLogada(browser, { onErro: e => { console.log('PAGEERROR', e.message); fails++; } });

// ---- a área abre ----
check('6 áreas no topo', await page.locator('.app-btn').count() === 6, await page.locator('.app-btn').count());
await page.click('.app-btn[data-app="remedios"]');
check('área Remédios abre', await page.locator('#tab-remedios.active').count() === 1);
check('não tem sub-abas', await page.locator('nav.tabs[data-app="remedios"]').count() === 0);
// rótulo cortado no celular seria defeito visível: são 6 numa tela de 390 px
check('nenhum rótulo de área cortado', (await page.locator('.app-btn').evaluateAll(
  els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent))).length === 0);

// ---- anotar pelo formulário ----
const form = page.locator('#tab-remedios .card', { hasText: 'Novo remédio' });
async function anotar({ nome, dose, comoToma, paraQue, desde, tipo }) {
  await form.locator('input[type=text]').nth(0).fill(nome);
  if (tipo) await form.locator('select').selectOption(tipo);
  if (dose) await form.locator('input[type=text]').nth(1).fill(dose);
  if (comoToma) await form.locator('input[type=text]').nth(2).fill(comoToma);
  if (paraQue) await form.locator('input[type=text]').nth(3).fill(paraQue);
  if (desde) await form.locator('input[type=date]').fill(desde);
  await form.getByRole('button', { name: '+ Adicionar' }).click();
}
await anotar({ nome: 'Rosuvastatina', dose: '10 mg', comoToma: '1x ao dia, à noite', paraQue: 'colesterol', desde: '2026-03-02' });
check('remédio aparece em uso', await page.locator('.card:has-text("Em uso") .med-item', { hasText: 'Rosuvastatina' }).count() === 1);
check('dose e posologia na lista',
  (await page.locator('.med-item', { hasText: 'Rosuvastatina' }).textContent()).includes('10 mg')
  && (await page.locator('.med-item', { hasText: 'Rosuvastatina' }).textContent()).includes('1x ao dia'));
check('mostra desde quando', (await page.locator('.med-item', { hasText: 'Rosuvastatina' }).textContent()).includes('02/03/2026'));
check('nome vazio é recusado', await page.evaluate(() => {
  const antes = window.Store.get().meds.length;
  const b = [...document.querySelectorAll('#tab-remedios button')].find(x => x.textContent.includes('+ Adicionar'));
  b.click();
  return window.Store.get().meds.length === antes;
}));

await anotar({ nome: 'Vitamina D', tipo: 'suplemento', dose: '5.000 UI', comoToma: '1x ao dia', desde: '2025-11-10' });
check('suplemento é marcado como tal',
  await page.locator('.med-item', { hasText: 'Vitamina D' }).locator('.tag', { hasText: 'suplemento' }).count() === 1);
check('cartão de encerrados não aparece sem histórico',
  await page.locator('#tab-remedios .card', { hasText: 'Encerrados' }).count() === 0);

// ---- encerrar guarda, não apaga: é o que explica uma virada no exame ----
await page.locator('.med-item', { hasText: 'Vitamina D' }).getByRole('button', { name: /encerrar/ }).click();
await page.locator('.modal input[type=date]').fill('2026-06-20');
await page.locator('.modal input[type=text]').fill('nível normalizou');
await page.locator('.modal').getByRole('button', { name: 'Encerrar' }).click();
check('sai de "em uso"', await page.locator('.card:has-text("Em uso") .med-item', { hasText: 'Vitamina D' }).count() === 0);
check('entra no histórico', await page.locator('.card:has-text("Encerrados") .med-item', { hasText: 'Vitamina D' }).count() === 1);
check('continua no estado (não foi apagado)',
  await page.evaluate(() => window.Store.get().meds.length) === 2);
const encerrado = await page.locator('.med-item', { hasText: 'Vitamina D' }).textContent();
check('mostra o período fechado e o porquê',
  encerrado.includes('10/11/2025') && encerrado.includes('20/06/2026') && encerrado.includes('nível normalizou'), encerrado);

// ---- voltar a tomar ----
await page.locator('.med-item', { hasText: 'Vitamina D' }).getByRole('button', { name: /voltei a tomar/ }).click();
check('volta para "em uso"', await page.locator('.card:has-text("Em uso") .med-item', { hasText: 'Vitamina D' }).count() === 1);
await page.locator('.med-item', { hasText: 'Vitamina D' }).getByRole('button', { name: /encerrar/ }).click();
await page.locator('.modal input[type=date]').fill('2026-06-20');
await page.locator('.modal').getByRole('button', { name: 'Encerrar' }).click();

// ---- editar ----
await page.locator('.med-item', { hasText: 'Rosuvastatina' }).getByRole('button', { name: /editar/ }).click();
await page.locator('.med-item input[type=text]').nth(1).fill('20 mg');
await page.locator('.med-item').getByRole('button', { name: 'Salvar' }).click();
check('edição de dose persiste no estado',
  await page.evaluate(() => (window.Store.get().meds.find(m => m.name === 'Rosuvastatina') || {}).dose) === '20 mg');

// ---- O PONTO DA ÁREA: a IA recebe os remédios junto dos exames ----
const payload = await page.evaluate(() => window.App.buildAnalysisPayload());
check('remédios entram no que vai para a IA', Array.isArray(payload.medicamentos) && payload.medicamentos.length === 2,
  JSON.stringify(payload.medicamentos || null));
const emUso = (payload.medicamentos || []).find(m => m.nome === 'Rosuvastatina');
const parado = (payload.medicamentos || []).find(m => m.nome === 'Vitamina D');
check('o em uso vai com dose, posologia e desde quando',
  emUso && emUso.situacao === 'em uso' && emUso.dose === '20 mg' && emUso.desde === '2026-03-02' && emUso.motivo === 'colesterol',
  JSON.stringify(emUso));
check('o encerrado vai com a data de parada', parado && parado.situacao === 'encerrado' && parado.ate === '2026-06-20',
  JSON.stringify(parado));
check('suplemento chega rotulado como suplemento', parado && parado.tipo === 'suplemento');

// encerrado há muito tempo não explica exame de agora — fica de fora do prompt
await page.evaluate(() => {
  const s = window.Store.get();
  s.meds.push({ id: 'mvelho', name: 'Remédio Antigo', norm: 'remedio antigo', kind: 'remedio',
    dose: '', schedule: '', reason: '', start: '2019-01-01', end: '2020-05-01', endReason: '', obs: '' });
  window.Store.save();
});
const payload2 = await page.evaluate(() => window.App.buildAnalysisPayload());
check('encerrado há anos não gasta espaço no prompt',
  !payload2.medicamentos.some(m => m.nome === 'Remédio Antigo'), JSON.stringify(payload2.medicamentos.map(m => m.nome)));

// ---- export/import ----
const exp = await page.evaluate(() => JSON.parse(window.Store.exportJSON()));
check('export leva os remédios', (exp.meds || []).length === 3, (exp.meds || []).length);
await page.evaluate(() => { window.Store.importJSON(window.Store.exportJSON(), 'merge'); });
check('merge não duplica por id', await page.evaluate(() => window.Store.get().meds.length) === 3);

// ---- sobrevive ao recarregar ----
await page.evaluate(() => window.Auth.enviarDados());
await page.waitForFunction(() => !window.Auth.temPendencia(), { timeout: 15000 });
await page.reload();
await page.waitForSelector('.daynav');
await page.click('.app-btn[data-app="remedios"]');
check('persiste depois de recarregar', await page.locator('.med-item', { hasText: 'Rosuvastatina' }).count() === 1);

// ---- estado antigo, de antes desta área, não quebra ----
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('diario_kcal_v1'));
  delete s.meds;
  localStorage.setItem('diario_kcal_v1', JSON.stringify(s));
});
await page.reload();
await page.waitForSelector('.daynav');
await page.click('.app-btn[data-app="remedios"]');
check('migra estado sem meds', await page.locator('#tab-remedios .card', { hasText: 'Novo remédio' }).count() === 1);
check('meds vira lista mesmo vindo de estado antigo',
  await page.evaluate(() => Array.isArray(window.Store.get().meds)));
check('payload não quebra com o campo ausente',
  Array.isArray((await page.evaluate(() => window.App.buildAnalysisPayload())).medicamentos));

await page.screenshot({ path: 'shot-remedios.png', fullPage: true });
await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
