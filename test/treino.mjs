// treino.mjs — a área 🏋️ Treino: perfil → plano semanal → registrar carga e
// minutos → fechar a semana → notas por capacidade e a próxima semana.
// Roda contra o dev-server, cujo mock devolve fixtures fixas (semana "Base
// geral" com Agachamento 40 kg; fechar → notas 6,5/5/7/6/5,5/null e a semana
// seguinte com 42 kg) — o que os asserts abaixo conferem é o CICLO do app.
import { abrirNavegador, paginaLogada } from './_comum.mjs';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 160) + ']' : ''));
  if (!ok) fails++;
};

const browser = await abrirNavegador();
// comChave: o coach usa a chave da própria conta (BYOK), como a análise
const { page } = await paginaLogada(browser, { comChave: true, onErro: e => { console.log('PAGEERROR', e.message); fails++; } });

// ---- a área existe e abre ----
check('6 áreas no topo', await page.locator('.app-btn').count() === 6, await page.locator('.app-btn').count());
check('nenhum rótulo de área cortado', (await page.locator('.app-btn').evaluateAll(
  els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent))).length === 0);
await page.click('.app-btn[data-app="treino"]');
check('área Treino abre na aba Semana', await page.locator('#tab-trsemana.active').count() === 1);
check('sub-abas Semana e Evolução', await page.locator('nav.tabs[data-app="treino"] .tab-btn').count() === 2);

// ---- sem perfil, o que aparece é o formulário ----
const form = page.locator('#tab-trsemana .card', { hasText: 'Coach de treino' });
check('formulário de perfil na primeira visita', await form.locator('select').count() === 5);
check('formulário explica o que o coach cobre',
  (await form.textContent()).includes('zona 2') && (await form.textContent()).includes('fibras rápidas'));

// Evolução ainda vazia aponta o caminho
await page.click('nav.tabs[data-app="treino"] .tab-btn[data-tab="trevolucao"]');
check('Evolução vazia explica que vem do fechamento',
  (await page.locator('#tab-trevolucao').textContent()).includes('Monte seu plano'));
await page.click('nav.tabs[data-app="treino"] .tab-btn[data-tab="trsemana"]');

// ---- montar o plano ----
await form.locator('select').nth(0).selectOption('saude');
await form.locator('select').nth(1).selectOption('3');
await form.locator('select').nth(3).selectOption('academia');
await form.locator('select').nth(4).selectOption('retomando');
await form.locator('textarea').fill('dor no joelho direito');
await form.getByRole('button', { name: /Montar meu plano/ }).click();
await page.waitForSelector('.tr-sessao-card', { timeout: 20000 });

check('cabeçalho mostra Semana 1', (await page.locator('#tab-trsemana .card').first().textContent()).includes('Semana 1'));
check('bloco e posição no bloco visíveis', (await page.locator('.tr-bloco').textContent()).includes('Base geral'));
check('3 sessões na semana do mock', await page.locator('.tr-sessao-card').count() === 3);
check('sessões carregam o tipo (força, zona 2, potência)',
  await page.locator('.tr-tipo', { hasText: 'força' }).count() === 1
  && await page.locator('.tr-tipo', { hasText: 'zona 2' }).count() === 1
  && await page.locator('.tr-tipo', { hasText: 'potência' }).count() === 1);
const agacho = page.locator('.tr-item', { hasText: 'Agachamento' });
check('item de carga mostra o alvo', (await agacho.textContent()).includes('3 × 5') && (await agacho.textContent()).includes('40 kg'));
const z2item = page.locator('.tr-item', { hasText: 'Caminhada rápida' });
check('item de tempo mostra minutos-alvo', (await z2item.textContent()).includes('40 min'));
check('perfil ficou no estado', await page.evaluate(() =>
  window.Store.get().treino.perfil.diasSemana === 3 && window.Store.get().treino.perfil.limitacoes.includes('joelho')));
check('apresentação do plano aparece na semana 1',
  (await page.locator('#tab-trsemana').textContent()).includes('PLANO FIXO DO MOCK'));

// ---- registrar números: é isso que alimenta as notas ----
await agacho.getByPlaceholder('kg').fill('42,5');
await agacho.getByPlaceholder('sér.').fill('3');
await agacho.getByPlaceholder('reps').fill('5');
await z2item.getByPlaceholder('min').fill('40');
check('registro grava no estado (com vírgula decimal)', await page.evaluate(() => {
  const itens = window.Store.get().treino.plano.semana.sessoes.flatMap(s => s.itens);
  const ag = itens.find(i => i.nome === 'Agachamento');
  const z2 = itens.find(i => i.nome.includes('Caminhada'));
  return ag.feito.carga === 42.5 && ag.feito.series === 3 && ag.feito.reps === 5 && z2.feito.minutos === 40;
}));
check('item registrado acende (tr-ok)', await page.locator('.tr-item.tr-ok').count() === 2);
// apagar o número apaga o registro — para o coach, vazio = "não registrado"
await z2item.getByPlaceholder('min').fill('');
check('apagar o campo remove o feito', await page.evaluate(() => {
  const itens = window.Store.get().treino.plano.semana.sessoes.flatMap(s => s.itens);
  return !('feito' in itens.find(i => i.nome.includes('Caminhada')));
}));
await z2item.getByPlaceholder('min').fill('40');

// ---- o corpo do POST /treino sai do app com tudo que o Worker espera ----
const payload = await page.evaluate(() => window.App.buildTreinoPayload('fechar'));
check('payload leva perfil, dados do app e a semana com registros',
  payload.acao === 'fechar' && payload.perfilTreino.local === 'academia'
  && payload.dados && Array.isArray(payload.dados.medicamentos)
  && payload.semanaFechada.numero === 1
  && payload.semanaFechada.sessoes[0].itens[0].feito.carga === 42.5
  && Array.isArray(payload.historicoNotas) && payload.historicoNotas.length === 0,
  JSON.stringify({ acao: payload.acao, semana: payload.semanaFechada && payload.semanaFechada.numero }));
check('payload de plano não leva semanaFechada', await page.evaluate(() =>
  !('semanaFechada' in window.App.buildTreinoPayload('plano'))));

// ---- fechar a semana: registros viram notas e a próxima semana ----
await page.getByRole('button', { name: /Fechar a semana com o coach/ }).click();
await page.waitForSelector('#tab-trevolucao.active .nota-row', { timeout: 20000 });
check('fechar leva à aba Evolução', await page.locator('#tab-trevolucao.active').count() === 1);
const evo = await page.locator('#tab-trevolucao').textContent();
check('nota de força na tela (6,5)', evo.includes('6,5'));
check('capacidade sem registro fica "sem registro", não nota chutada',
  await page.locator('.nota-val.semdado', { hasText: 'sem registro' }).count() === 1);
check('avaliação do coach na tela', evo.includes('RESPOSTA FIXA DO COACH'));
check('plano de melhoria listado (2 ações do mock)', await page.locator('.tr-melhoria').count() === 2);
check('nota baixa fica com a cor de alerta', await page.locator('.nota-fill.baixa').count() >= 1);

await page.click('nav.tabs[data-app="treino"] .tab-btn[data-tab="trsemana"]');
check('a semana corrente agora é a 2', (await page.locator('#tab-trsemana .card').first().textContent()).includes('Semana 2'));
check('próxima semana veio com a progressão do mock (42 kg)',
  (await page.locator('.tr-item', { hasText: 'Agachamento' }).textContent()).includes('42 kg'));
check('semana fechada guardou os registros', await page.evaluate(() => {
  const t = window.Store.get().treino;
  return t.semanasFechadas.length === 1
    && t.semanasFechadas[0].numero === 1
    && t.semanasFechadas[0].sessoes[0].itens[0].feito.carga === 42.5
    && t.avaliacoes.length === 1 && t.avaliacoes[0].semanaNumero === 1;
}));
check('inputs da semana nova começam vazios', await page.evaluate(() =>
  window.Store.get().treino.plano.semana.sessoes.flatMap(s => s.itens).every(i => !('feito' in i) || i.feito == null)));

// ---- fechar de novo: o histórico de notas segue junto ----
const payload2 = await page.evaluate(() => window.App.buildTreinoPayload('fechar'));
check('histórico de notas vai para o coach a partir da 2ª semana',
  payload2.historicoNotas.length === 1 && payload2.historicoNotas[0].semana === 1
  && payload2.historicoNotas[0].notas.forca === 6.5, JSON.stringify(payload2.historicoNotas));

// ---- sobrevive ao recarregar (nuvem + localStorage) ----
await page.evaluate(() => window.Auth.enviarDados());
await page.waitForFunction(() => !window.Auth.temPendencia(), { timeout: 15000 });
await page.reload();
await page.waitForSelector('.daynav');
await page.click('.app-btn[data-app="treino"]');
check('semana 2 continua depois de recarregar',
  (await page.locator('#tab-trsemana .card').first().textContent()).includes('Semana 2'));
await page.click('nav.tabs[data-app="treino"] .tab-btn[data-tab="trevolucao"]');
check('notas continuam depois de recarregar', await page.locator('#tab-trevolucao .nota-row').count() === 6);

// ---- export/merge não duplica nem regride a semana ----
await page.evaluate(() => { window.Store.importJSON(window.Store.exportJSON(), 'merge'); });
check('merge consigo mesmo não duplica fechadas/avaliações', await page.evaluate(() => {
  const t = window.Store.get().treino;
  return t.semanasFechadas.length === 1 && t.avaliacoes.length === 1 && t.plano.semana.numero === 2;
}));
// aparelho atrasado (semana 1) chegando por merge não regride a corrente (2)
check('merge de um export antigo mantém a semana mais avançada', await page.evaluate(() => {
  const velho = JSON.parse(window.Store.exportJSON());
  velho.treino.plano = { criadoEm: '2026-01-01', apresentacao: '', semana: Object.assign({}, velho.treino.plano.semana, { numero: 1 }) };
  window.Store.importJSON(JSON.stringify(velho), 'merge');
  return window.Store.get().treino.plano.semana.numero === 2;
}));

// ---- refazer o plano CONTINUA a contagem (não recomeça na semana 1) ----
// numero é a identidade da semana no histórico: duas "semana 1" fariam o merge
// entre aparelhos descartar uma delas em silêncio. Como o mock sempre devolve
// numero 1, chegar em 2 aqui prova que app e Worker impõem a contagem.
await page.click('nav.tabs[data-app="treino"] .tab-btn[data-tab="trsemana"]');
// (o confirm é aceito pelo handler global de paginaLogada)
await page.locator('#tab-trsemana button', { hasText: 'refazer o plano' }).click();
await page.locator('#tab-trsemana').getByRole('button', { name: /Montar meu plano/ }).click();
await page.waitForSelector('.tr-sessao-card', { timeout: 20000 });
check('refazer o plano segue de onde parou (semana 2, não semana 1)',
  (await page.locator('#tab-trsemana .card').first().textContent()).includes('Semana 2'));
check('nenhum número de semana repetido no histórico', await page.evaluate(() => {
  const nums = window.Store.get().treino.semanasFechadas.map(x => x.numero);
  return new Set(nums).size === nums.length;
}));
check('o coach recebe onde a contagem continua', await page.evaluate(() =>
  window.App.buildTreinoPayload('plano').proximaNumero === 2));
// ids de item têm que ser únicos DENTRO da semana: são gerados num laço só,
// no mesmo milissegundo (uid sozinho repetiria)
check('cada item da semana tem id próprio', await page.evaluate(() => {
  const ids = window.Store.get().treino.plano.semana.sessoes.flatMap(s => s.itens).map(i => i.id);
  return ids.length >= 5 && ids.every(Boolean) && new Set(ids).size === ids.length;
}));

// ---- estado de antes desta área não quebra ----
// (checado via Store.load() direto: um reload traria os dados de volta da
// nuvem — o que é o comportamento certo do app, mas esconderia a migração)
check('estado sem o campo treino migra para a estrutura válida', await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('diario_kcal_v1'));
  delete s.treino;
  localStorage.setItem('diario_kcal_v1', JSON.stringify(s));
  const t = window.Store.load().treino;
  return t && t.perfil === null && t.plano === null
    && Array.isArray(t.semanasFechadas) && Array.isArray(t.avaliacoes);
}));
// volta ao estado normal (a nuvem restaura) antes da foto final
await page.reload();
await page.waitForSelector('.daynav');
await page.click('.app-btn[data-app="treino"]');
check('depois do reload a nuvem devolve a semana corrente',
  (await page.locator('#tab-trsemana .card').first().textContent()).includes('Semana 2'));

// ---- sem chave da conta: o app aponta o caminho, não só o erro ----
const semChave = await paginaLogada(browser, { prefixo: 'treino-sem-chave' });
await semChave.page.click('.app-btn[data-app="treino"]');
const form2 = semChave.page.locator('#tab-trsemana .card', { hasText: 'Coach de treino' });
await form2.getByRole('button', { name: /Montar meu plano/ }).click();
await semChave.page.waitForSelector('#tab-trsemana button:has-text("Cadastrar minha chave")', { timeout: 15000 });
check('sem chave: erro explica e oferece o atalho da chave', true);
await semChave.page.locator('#tab-trsemana button', { hasText: 'Cadastrar minha chave' }).click();
check('atalho leva a Diário → Dados', await semChave.page.locator('#tab-dados.active').count() === 1);
await semChave.ctx.close();

await page.screenshot({ path: 'shot-treino.png', fullPage: true });
await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
