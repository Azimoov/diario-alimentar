// E2E da fase "Minha Saúde": navegação em 2 níveis, exames lab/imagem,
// lembretes, importação Apple Health (zip sintético) e análise IA via mock.
import { abrirNavegador, paginaLogada, APP as BASE } from './_comum.mjs';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

let fails = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra != null ? '  [' + String(extra).slice(0, 140) + ']' : ''));
  if (!ok) fails++;
};

// ---- gera export.zip sintético do app Saúde (20 dias até hoje) ----
function iso(d) { const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); }
const today = new Date();
const dates = [];
for (let i = 19; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); dates.push(iso(d)); }
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="pt_BR">\n';
dates.forEach((d, i) => {
  const prev = new Date(d + 'T12:00:00'); prev.setDate(prev.getDate() - 1);
  const dPrev = iso(prev);
  xml += ` <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="${d} 09:00:00 -0300" endDate="${d} 20:00:00 -0300" value="${8000 + i * 40}"/>\n`;
  xml += ` <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" startDate="${d} 09:00:00 -0300" endDate="${d} 20:00:00 -0300" value="${9000 + i * 50}"/>\n`;
  xml += ` <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Watch" unit="Cal" startDate="${d} 09:00:00 -0300" endDate="${d} 20:00:00 -0300" value="520"/>\n`;
  xml += ` <Record type="HKQuantityTypeIdentifierBasalEnergyBurned" sourceName="Watch" unit="Cal" startDate="${d} 00:00:00 -0300" endDate="${d} 23:59:00 -0300" value="1580"/>\n`;
  xml += ` <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="${d} 12:00:00 -0300" endDate="${d} 12:00:00 -0300" value="${54 + (i % 3)}"/>\n`;
  xml += ` <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="${dPrev} 23:30:00 -0300" endDate="${d} 06:45:00 -0300" value="HKCategoryValueSleepAnalysisAsleepCore"/>\n`;
});
xml += '</HealthData>\n';
function makeZip(name, data) {
  const nameB = Buffer.from(name);
  const comp = zlib.deflateRawSync(data);
  const crc = zlib.crc32 ? zlib.crc32(data) : 0;
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameB.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameB.length, 28); cd.writeUInt32LE(0, 42);
  const local = Buffer.concat([lh, nameB, comp]);
  const central = Buffer.concat([cd, nameB]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}
const ZIP_PATH = new URL('./export-teste.zip', import.meta.url).pathname;
writeFileSync(ZIP_PATH, makeZip('apple_health_export/export.xml', Buffer.from(xml)));

const browser = await abrirNavegador();
const { page } = await paginaLogada(browser, { comChave: true, onErro: e => { console.log('PAGEERROR', e.message); fails++; } });

// 10 dias de diário (p/ o saldo energético) direto no estado
const dietDates = dates.slice(-11, -1);
await page.evaluate(({ dietDates }) => {
  const s = window.Store.get();
  dietDates.forEach(d => {
    s.days[d] = { items: [{ raw: '300 g arroz', foodText: 'arroz', foodId: 3, grams: 300, conf: 'exact', match: 'matched', meal: 'almoco' }] };
  });
  window.Store.save();
}, { dietDates });
await page.reload();
await page.waitForSelector('.daynav');

// ---- navegação em 2 níveis ----
check('4 áreas no topo', await page.locator('.app-btn').count() === 4, await page.locator('.app-btn').count());
check('Diário ativo por padrão', await page.locator('.app-btn[data-app="diario"].active').count() === 1);
check('sub-abas do Diário visíveis', await page.locator('nav.tabs[data-app="diario"]:not([hidden])').count() === 1);
await page.click('.app-btn[data-app="exames"]');
check('Exames abre na aba Laboratoriais', await page.locator('#tab-exlab.active').count() === 1);
check('sub-abas de Exames visíveis', await page.locator('nav.tabs[data-app="exames"]:not([hidden])').count() === 1
  && await page.locator('nav.tabs[data-app="diario"][hidden]').count() === 1);
await page.click('.app-btn[data-app="saude"]');
check('Métricas abre direto (sem sub-abas)', await page.locator('#tab-saude.active').count() === 1);

// ---- exames laboratoriais ----
await page.click('.app-btn[data-app="exames"]');
const lab = page.locator('#tab-exlab');
async function addLab(date, nome, valor, unidade, lo, hi) {
  const card = lab.locator('.card', { hasText: 'Novo resultado' });
  await card.locator('input[type=date]').fill(date);
  await card.locator('input[list="dl-analitos"]').fill(nome);
  await card.locator('input[list="dl-analitos"]').blur();
  await card.locator('input[inputmode=decimal]').fill(valor);
  if (unidade != null) await card.getByPlaceholder('ex.: mg/dL').fill(unidade);
  if (lo != null) await card.locator('input[type=number]').nth(0).fill(lo);
  if (hi != null) await card.locator('input[type=number]').nth(1).fill(hi);
  await card.getByRole('button', { name: '+ Adicionar resultado' }).click();
}
const d1 = dates[0], d2 = dates[19];
await addLab(d1, 'Glicose em jejum', '105', 'mg/dL', '70', '99');
check('resultado listado', await lab.locator('.exam-table td', { hasText: 'Glicose em jejum' }).count() === 1);
check('badge acima da referência', await lab.locator('.badge-error', { hasText: '↑ acima' }).count() === 1);

// segundo valor do mesmo analito: unidade/refs pré-preenchidas + gráfico surge
{
  const card = lab.locator('.card', { hasText: 'Novo resultado' });
  await card.locator('input[type=date]').fill(d2);
  await card.locator('input[list="dl-analitos"]').fill('Glicose em jejum');
  await card.locator('input[list="dl-analitos"]').blur();
  const unit = await card.getByPlaceholder('ex.: mg/dL').inputValue();
  const lo = await card.locator('input[type=number]').nth(0).inputValue();
  check('unidade e refs pré-preenchidas do anterior', unit === 'mg/dL' && lo === '70', unit + '|' + lo);
  await card.locator('input[inputmode=decimal]').fill('92');
  await card.getByRole('button', { name: '+ Adicionar resultado' }).click();
}
check('gráfico de evolução aparece com 2 pontos', await lab.locator('.card', { hasText: 'Evolução' }).locator('svg.linechart').count() === 1);
check('valor dentro da faixa ganha ✓', await lab.locator('.badge-ok').count() === 1);

// exame qualitativo (sem número) não quebra nada
await addLab(d2, 'HIV (anti-HIV)', 'não reagente', '', null, null);
check('resultado qualitativo listado', await lab.locator('.exam-table td', { hasText: 'não reagente' }).count() === 1);

// ---- lembrete vencido → bolinha + aviso na aba Hoje ----
{
  const remCard = lab.locator('.card', { hasText: 'Lembretes de repetição' });
  await remCard.locator('summary').click();
  await remCard.locator('input[list="dl-rem-lab"]').fill('Hemograma completo');
  await remCard.locator('input[type=number]').fill('6');
  await remCard.locator('input[type=date]').fill('2025-06-01');
  await remCard.getByRole('button', { name: 'Criar lembrete' }).click();
}
check('lembrete vencido marcado', await lab.locator('.rem-item.due', { hasText: 'Hemograma completo' }).count() === 1);
check('bolinha no botão Exames', await page.locator('.app-btn[data-app="exames"] .dot:not([hidden])').count() === 1);
await page.click('.app-btn[data-app="diario"]');
check('aviso na aba Hoje', await page.locator('.due-banner', { hasText: 'Hemograma completo' }).count() === 1);
await page.click('.due-banner');
check('aviso leva à área Exames', await page.locator('#tab-exlab.active').count() === 1);

// lembrete auto-atualiza quando registro o exame com o mesmo nome
await addLab(iso(today), 'Hemograma completo', '1', '', null, null);
check('exame novo empurra o lembrete (sem vencido)', await lab.locator('.rem-item.due').count() === 0);
check('bolinha some', await page.locator('.app-btn[data-app="exames"] .dot[hidden]').count() === 1);

// ---- exames de imagem ----
await page.click('nav.tabs[data-app="exames"] .tab-btn[data-tab="eximg"]');
const img = page.locator('#tab-eximg');
{
  const card = img.locator('.card', { hasText: 'Novo exame de imagem' });
  await card.locator('input[type=date]').fill(d2);
  await card.locator('input[list="dl-imagem"]').fill('Ultrassom de abdome total');
  await card.getByPlaceholder('opcional').fill('Clínica Teste');
  await card.locator('textarea').fill('Esteatose hepática grau I. Demais órgãos sem alterações.');
  await card.getByRole('button', { name: '+ Adicionar exame' }).click();
}
check('exame de imagem listado', await img.locator('.exam-group summary', { hasText: 'Ultrassom de abdome total' }).count() === 1);
check('laudo visível', await img.locator('.exam-report', { hasText: 'Esteatose' }).count() === 1);
// editar no lugar
await img.locator('.link-btn', { hasText: 'editar' }).first().click();
await img.locator('.exam-group textarea').fill('Esteatose hepática grau I → acompanhar em 12 meses.');
await img.getByRole('button', { name: 'Salvar' }).first().click();
check('laudo editado', await img.locator('.exam-report', { hasText: 'acompanhar em 12 meses' }).count() === 1);

// ---- métricas de saúde: importa o zip sintético ----
await page.click('.app-btn[data-app="saude"]');
const saude = page.locator('#tab-saude');
await saude.locator('input[type=file]').setInputFiles(ZIP_PATH);
await page.waitForSelector('#tab-saude .card:has-text("Médias")', { timeout: 30000 });
check('médias 30 dias aparecem', await saude.locator('.stat', { hasText: 'Passos' }).count() === 1);
check('gráfico de métricas', await saude.locator('.card', { hasText: 'Métricas dia a dia' }).locator('svg.linechart').count() === 1);
check('saldo energético (diário × relógio)', await saude.locator('.card', { hasText: 'Saldo energético' }).count() === 1);
// troca a métrica do gráfico
await saude.locator('.metric-controls select').first().selectOption('sleepMin');
check('gráfico de sono renderiza', await saude.locator('.card', { hasText: 'Métricas dia a dia' }).locator('svg.linechart').count() === 1);
const passosStat = await saude.locator('.stat', { hasText: 'Passos' }).locator('.stat-val').textContent();
check('passos usam a maior fonte (>=9000)', Number(passosStat) >= 9000, passosStat);

// ---- análise IA (contra o Worker de desenvolvimento) ----
// confere também o RESUMO que o app monta: é ele que decide o que sai daqui
const resumo = await page.evaluate(() => window.App.buildAnalysisPayload());
check('resumo leva os exames desta conta', resumo.examesLaboratoriais.length === 3, resumo.examesLaboratoriais.length);
check('resumo leva o exame de imagem', resumo.examesImagem.length === 1);
check('resumo leva as métricas do relógio', !!resumo.metricasRelogio && resumo.metricasRelogio.diasComDados === 20,
  resumo.metricasRelogio && resumo.metricasRelogio.diasComDados);
check('resumo NÃO leva nome nem e-mail da pessoa', !/@|senha|session/i.test(JSON.stringify(resumo)));

await saude.getByRole('button', { name: '🔎 Analisar meus dados' }).click();
await page.getByRole('button', { name: '🔎 Analisar agora' }).click();
await page.waitForSelector('.analysis-text', { timeout: 20000 });
const analise = await page.locator('.analysis-text').textContent();
check('análise volta em texto', analise.includes('VISÃO GERAL'), analise.slice(0, 60));
check('análise entra na lista de análises', await page.evaluate(() => window.Store.get().analyses.length) === 1);
await page.locator('.modal .icon-btn').click();
check('card leva às análises guardadas', await saude.getByRole('button', { name: /Ver análises \(1\)/ }).count() === 1);

// ---- persistência e export ----
await page.reload();
await page.waitForSelector('.daynav');
await page.click('.app-btn[data-app="exames"]');
check('exames persistem após reload', await page.locator('#tab-exlab .exam-table td', { hasText: 'Glicose em jejum' }).count() === 2);
await page.click('.app-btn[data-app="saude"]');
check('métricas persistem após reload', await page.locator('#tab-saude .card', { hasText: 'Médias' }).count() === 1);
check('análise guardada persiste', await page.locator('#tab-saude button', { hasText: 'Ver análises' }).count() === 1);

const exp = await page.evaluate(() => JSON.parse(window.Store.exportJSON()));
check('export inclui exames/health/análise',
  exp.labExams.length === 4 && exp.imgExams.length === 1 && exp.examReminders.length === 1
  && Object.keys(exp.health.daily).length === 20 && exp.analyses.length === 1,
  'labs=' + exp.labExams.length + ' img=' + exp.imgExams.length + ' rem=' + exp.examReminders.length + ' health=' + Object.keys(exp.health.daily).length);

// import (mesclar) não duplica exames com mesmo id
await page.evaluate(() => { window.Store.importJSON(window.Store.exportJSON(), 'merge'); });
const exp2 = await page.evaluate(() => JSON.parse(window.Store.exportJSON()));
check('merge não duplica por id', exp2.labExams.length === 4 && exp2.imgExams.length === 1
  && exp2.examReminders.length === 1 && exp2.analyses.length === 1);

// ---- regressão: fluxo antigo do diário continua vivo ----
await page.click('.app-btn[data-app="diario"]');
await page.locator('#entry').fill('100 g arroz');
await page.getByRole('button', { name: '+ Adicionar' }).click();
check('registro por texto segue funcionando', await page.locator('#tab-hoje .item-name', { hasText: 'Arroz' }).count() >= 1);
await page.click('nav.tabs[data-app="diario"] .tab-btn[data-tab="hist"]');
check('histórico renderiza', await page.locator('#tab-hist svg.linechart').count() >= 1);

// screenshots p/ conferência visual
await page.click('.app-btn[data-app="exames"]');
await page.click('nav.tabs[data-app="exames"] .tab-btn[data-tab="exlab"]');
await page.screenshot({ path: 'shot-exlab.png', fullPage: true });
await page.click('nav.tabs[data-app="exames"] .tab-btn[data-tab="eximg"]');
await page.screenshot({ path: 'shot-eximg.png', fullPage: true });
await page.click('.app-btn[data-app="saude"]');
await page.screenshot({ path: 'shot-saude.png', fullPage: true });

await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
