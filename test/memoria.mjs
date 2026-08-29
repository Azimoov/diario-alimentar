// memoria.mjs — trazer os dados de outra IA (memory.md) para dentro do app.
//
// POR QUE ESTA TELA EXISTE: quem chega no app já contou a própria história
// para outro assistente. Redigitar idade, altura, remédios e exames é o
// motivo mais comum de largar um app de saúde na primeira semana.
//
// O QUE ESTES TESTES PROTEGEM não é a leitura (essa é do modelo, e o
// servidor já peneira o que ele inventa — ver fase2-proxy/test/smoke.mjs).
// É o que o APP faz com o resultado, que é onde o estrago seria silencioso:
//   - não sobrescrever nada que a pessoa já preencheu;
//   - não datar exame que veio sem data;
//   - não transformar peso RELATADO em pesagem datada;
//   - dizer, na tela, tudo o que foi mexido.
import { abrirNavegador, paginaLogada } from './_comum.mjs';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 200) + ']' : ''));
  if (!ok) fails++;
};

const ARQUIVO = [
  '# Memória sobre o Daniel',
  '',
  '- Homem, 47 anos, 1,78 m de altura.',
  '- Objetivo: emagrecer sem perder força.',
  '- Toma Rosuvastatina 10 mg por causa do colesterol.',
  '- Exame de 10/06/2026: Glicose em jejum 92 mg/dL.',
  '- Prefere comida de verdade a suplemento.',
].join('\n');

const browser = await abrirNavegador();
const { page } = await paginaLogada(browser, { comChave: true, onErro: e => { console.log('PAGEERROR', e.message); fails++; } });

await page.click('.app-btn[data-app="diario"]');
await page.click('nav.tabs[data-app="diario"] .tab-btn[data-tab="dados"]');
const card = page.locator('#tab-dados .card', { hasText: 'Trazer meus dados de outra IA' });
check('o cartão de importar memória existe na aba Dados', await card.count() === 1);
check('o cartão explica de onde vem o arquivo',
  (await card.textContent()).includes('memory.md'));

// ---- importar pelo "colar texto" (mesmo caminho do arquivo, sem depender
// de um seletor de arquivo do sistema) ----
await card.getByRole('button', { name: /Colar texto/ }).click();
await page.locator('.modal textarea').fill(ARQUIVO);
await page.locator('.modal').getByRole('button', { name: /^Importar$/ }).click();
await page.waitForSelector('.modal-head h3:text("Pronto")', { timeout: 20000 });
const resumo = await page.locator('.modal-back').last().textContent();
check('a tela final diz o que foi preenchido', /Preenchi no app/.test(resumo), resumo.slice(0, 200));
check('avisa o que descartou por não achar a frase no arquivo',
  /Fantasma/.test(resumo), resumo.slice(0, 300));
check('avisa que exame sem data não entrou',
  /não dizia a data|NÃO importado/i.test(resumo), resumo.slice(0, 400));
await page.locator('.modal-head .icon-btn').last().click();

// ---- o que realmente entrou no estado ----
const estado = await page.evaluate(() => {
  const s = window.Store.get();
  return {
    perfil: s.profile,
    meds: (s.meds || []).map(m => ({ name: m.name, dose: m.dose, start: m.start, obs: m.obs })),
    labs: (s.labExams || []).map(x => ({ name: x.name, date: x.date, value: x.value })),
    pesagens: Object.keys(s.weights || {}).length,
    memoria: s.memoria,
  };
});
check('idade e altura foram preenchidas no perfil',
  estado.perfil.age === 47 && estado.perfil.height === 178,
  JSON.stringify(estado.perfil));
check('o remédio entrou', estado.meds.some(m => m.name === 'Rosuvastatina' && m.dose === '10 mg'),
  JSON.stringify(estado.meds));
check('o remédio guarda a frase que o originou',
  estado.meds.some(m => /importado de outra IA/.test(m.obs || '')), JSON.stringify(estado.meds));
// Sem data de início no arquivo, "hoje" seria inventar quando ela começou.
check('remédio sem data de início não recebe a data de hoje',
  estado.meds.every(m => !m.start), JSON.stringify(estado.meds.map(m => m.start)));
check('o exame COM data entrou com a data certa',
  estado.labs.some(x => x.name === 'Glicose em jejum' && x.date === '2026-06-10'),
  JSON.stringify(estado.labs));
check('o exame SEM data não entrou (nada de carimbar hoje)',
  !estado.labs.some(x => /Colesterol/.test(x.name)), JSON.stringify(estado.labs));
// O arquivo não trazia peso; se trouxesse, viraria peso do perfil e não um
// ponto no gráfico. Aqui o que se protege é o gráfico ficar intocado.
check('importar não cria pesagem no histórico', estado.pesagens === 0, estado.pesagens);
check('o texto ficou guardado como contexto',
  !!(estado.memoria && estado.memoria.texto.includes('Rosuvastatina')));

// ---- não sobrescrever: segunda importação com o perfil já preenchido ----
await page.evaluate(() => { const s = window.Store.get(); s.profile.age = 30; window.Store.save(); });
await page.reload();
await page.waitForSelector('.app-btn[data-app="diario"]');
await page.click('nav.tabs[data-app="diario"] .tab-btn[data-tab="dados"]');
const card2 = page.locator('#tab-dados .card', { hasText: 'Trazer meus dados de outra IA' });
await card2.getByRole('button', { name: /Colar texto/ }).click();
await page.locator('.modal textarea').fill(ARQUIVO);
await page.locator('.modal').getByRole('button', { name: /^Importar$/ }).click();
await page.waitForSelector('.modal-head h3:text("Pronto")', { timeout: 20000 });
await page.locator('.modal-head .icon-btn').last().click();
const depois = await page.evaluate(() => {
  const s = window.Store.get();
  return { idade: s.profile.age, remedios: (s.meds || []).length, labs: (s.labExams || []).length };
});
check('importar de novo NÃO sobrescreve o que a pessoa já tinha posto',
  depois.idade === 30, depois.idade);
check('importar de novo não duplica o remédio', depois.remedios === 1, depois.remedios);
check('importar de novo não duplica o exame', depois.labs === 1, depois.labs);

// ---- editar e apagar ----
await page.locator('#tab-dados .mem-texto').fill('só o que eu quero que a IA veja');
await page.locator('#tab-dados .card', { hasText: 'Trazer meus dados de outra IA' })
  .getByRole('button', { name: /Salvar o texto/ }).click();
check('dá para editar o texto do contexto',
  (await page.evaluate(() => window.Store.get().memoria.texto)) === 'só o que eu quero que a IA veja');

// o confirm() é aceito pelo handler que paginaLogada() já registra
await page.locator('#tab-dados .card', { hasText: 'Trazer meus dados de outra IA' })
  .getByRole('button', { name: /Apagar/ }).click();
await page.waitForTimeout(300);
const aposApagar = await page.evaluate(() => {
  const s = window.Store.get();
  return { memoria: s.memoria, remedios: (s.meds || []).length, idade: s.profile.age };
});
check('apagar remove o texto', aposApagar.memoria === null, JSON.stringify(aposApagar.memoria));
// O texto é contexto; o que virou dado do app é dado do app. Apagar um não
// pode apagar o outro — senão a pessoa perde o que já tinha corrigido à mão.
check('apagar o texto NÃO apaga o que já tinha sido preenchido',
  aposApagar.remedios === 1 && aposApagar.idade === 30, JSON.stringify(aposApagar));

// ---- a memória viaja no contexto da IA ----
const payload = await page.evaluate(() => {
  const s = window.Store.get();
  s.memoria = { texto: 'prefere comida de verdade', importadoEm: new Date().toISOString(), resumo: '', preenchido: [] };
  window.Store.save();
  return window.App.buildChatPayload();
});
check('o texto importado vai junto na conversa com a IA',
  payload.relatoTrazidoDeOutraIA && /comida de verdade/.test(payload.relatoTrazidoDeOutraIA.texto),
  JSON.stringify(payload.relatoTrazidoDeOutraIA));
// O texto NÃO pode vazar para dentro das seções de dado medido: se ele
// aparecesse dentro de examesLaboratoriais ou historicoPeso, a IA leria
// lembrança com a mesma confiança de medição — que é o erro que a separação
// existe para evitar.
const medidos = JSON.stringify({
  dieta: payload.dieta, peso: payload.peso, historicoPeso: payload.historicoPeso,
  examesLaboratoriais: payload.examesLaboratoriais, medicamentos: payload.medicamentos,
  metricasDiarias14Dias: payload.metricasDiarias14Dias,
});
check('o texto importado NÃO vaza para dentro dos dados medidos',
  !/comida de verdade/.test(medidos), medidos.slice(0, 200));

await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
