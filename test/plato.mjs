// plato.mjs — o aviso de peso parado.
//
// O app JÁ calculava o gasto real observado, mas o número ficava parado num
// cartão da aba Perfil esperando a pessoa ir lá procurar e marcar uma caixinha.
// Quem registrava todo dia e via o peso empacado não era avisado de nada — o
// dado existia e nunca virava ação. Estes testes cobrem a ponte: detectar o
// platô, distinguir A CAUSA (meta alta demais × meta não cumprida) e nunca
// sugerir comer abaixo do piso de segurança.
import { abrirNavegador, paginaLogada } from './_comum.mjs';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 160) + ']' : ''));
  if (!ok) fails++;
};

const browser = await abrirNavegador();
const { page } = await paginaLogada(browser, { onErro: e => { console.log('PAGEERROR', e.message); fails++; } });

// Monta 28 dias de diário + pesagens. `kcalDia` é o que a pessoa registrou;
// `pesoInicial`/`pesoFinal` desenham a tendência que o app vai medir.
async function cenario({ kcalDia, pesoInicial, pesoFinal, pace = 0.5, useAdaptive = false, perfil = null }) {
  await page.evaluate(({ kcalDia, pesoInicial, pesoFinal, pace, useAdaptive, perfil }) => {
    const s = window.Store.get();
    s.profile = perfil || { sex: 'm', age: 40, height: 178, weight: pesoFinal, activity: 1.55 };
    s.goal = { pace, deficit: null, manualKcal: null, proteinPerKg: 1.8, fatPct: 0.25, useAdaptive };
    s.days = {}; s.weights = {};
    const iso = (d) => { const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
    const hoje = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(hoje); d.setDate(d.getDate() - i);
      const ds = iso(d);
      // um "alimento" sintético de 100 kcal/100 g resolve o total do dia sem
      // depender de nenhum item específico da base
      s.days[ds] = { items: [{ foodId: '__teste__', grams: kcalDia, raw: 'teste', meal: 'almoco' }] };
      const frac = (27 - i) / 27;
      s.weights[ds] = Math.round((pesoInicial + (pesoFinal - pesoInicial) * frac) * 100) / 100;
    }
    s.settings.platoAdiadoAte = null;
    window.Store.save();
  }, { kcalDia, pesoInicial, pesoFinal, pace, useAdaptive, perfil });
  // alimento sintético: 100 kcal por 100 g -> gramas == kcal do dia
  await page.evaluate(() => {
    const foods = window.Parser.getFoods();
    if (!foods.some(f => String(f.id) === '__teste__')) {
      window.Parser.setFoods(foods.concat([{
        id: '__teste__', name: 'Alimento de teste', norm: 'alimento de teste',
        kcal: 100, prot: 5, carb: 10, fat: 3, fiber: 0, cat: 0,
      }]));
    }
  });
  // trocar de aba não redesenha (applyNav só liga/desliga classes) — sem isto
  // a tela ficaria mostrando o que foi montado no carregamento
  await page.evaluate(() => window.App.renderAll());
  return page.evaluate(() => window.App.analisarPlato());
}

// ---- peso parado cumprindo a meta: a META é que está alta ----
const parado = await cenario({ kcalDia: 2200, pesoInicial: 85, pesoFinal: 85 });
check('peso parado é detectado', !!parado, JSON.stringify(parado));
check('causa correta: a meta é alta demais', parado && parado.causa === 'meta_alta', parado && parado.causa);
check('mede o gasto real a partir dos próprios registros',
  parado && Math.abs(parado.ad.tdee - 2200) < 60, parado && parado.ad.tdee);
check('sugere meta ABAIXO do gasto medido (o déficit que ela pediu)',
  parado && parado.sugerida < parado.ad.tdee, parado && JSON.stringify({ sugerida: parado.sugerida, tdee: parado.ad.tdee }));
check('sugere cortar de verdade (não repete a meta atual)',
  parado && parado.corte > 0, parado && parado.corte);

// ---- peso parado MAS estourando a própria meta: causa oposta ----
// Comendo 3200 com meta de ~2400: baixar a meta não resolveria nada.
const estourando = await cenario({ kcalDia: 3200, pesoInicial: 85, pesoFinal: 85 });
check('quem não cumpre a meta recebe outro diagnóstico',
  estourando && estourando.causa === 'aderencia', estourando && estourando.causa);
check('mostra o quanto está acima da própria meta',
  estourando && estourando.excedente > 0, estourando && estourando.excedente);

// ---- peso subindo ----
const subindo = await cenario({ kcalDia: 2200, pesoInicial: 84, pesoFinal: 85.4 });
check('peso subindo também dispara o aviso', !!subindo);
check('e é rotulado como subida, não como platô', subindo && subindo.ganhando === true);

// ---- emagrecendo no ritmo pretendido: silêncio ----
// 0,5 kg/semana em 28 dias = 2 kg
const andando = await cenario({ kcalDia: 2200, pesoInicial: 87, pesoFinal: 85 });
check('quem está perdendo no ritmo não é incomodado', andando === null, JSON.stringify(andando));

// ---- piso de segurança: nunca sugerir passar fome ----
// Pessoa grande (basal ~2000 kcal) querendo perder 1 kg/semana, cumprindo a
// meta e com o peso parado: a conta pura pediria ~1200 kcal, abaixo do basal.
const piso = await cenario({
  kcalDia: 2300, pesoInicial: 100, pesoFinal: 100, pace: 1.0,
  perfil: { sex: 'm', age: 30, height: 185, weight: 100, activity: 1.725 },
});
check('cenário do piso é de meta alta (não de aderência)',
  piso && piso.causa === 'meta_alta', piso && piso.causa);
check('meta sugerida nunca fica abaixo do gasto basal',
  piso && piso.sugerida >= 2000, piso && piso.sugerida);
check('e o app avisa que travou no piso', piso && piso.noPiso === true, piso && piso.noPiso);
// No piso, quem entra em ação é o TREINO — nada de "coma menos" nem de
// mandar procurar profissional: o déficit que falta vira gasto.
check('calcula quanto do déficit tem que virar gasto',
  piso && piso.faltaPorTreino > 0, piso && piso.faltaPorTreino);
check('esse número viaja para o coach de treino', await page.evaluate(() => {
  const s = window.Store.get();
  s.treino.perfil = { objetivo: 'saude', diasSemana: 3, local: 'academia', experiencia: 'retomando', limitacoes: '', rotina: '', diasAcademia: [] };
  window.Store.save();
  return window.App.buildTreinoPayload('plano').gastoExtraAlvo > 0;
}));
await page.evaluate(() => { window.Store.get().treino.perfil = null; window.Store.save(); });

// ---- dieta longa: cortar mais não é a única saída ----
// 20 semanas de peso caindo devagar e agora parado. Depois de tanto tempo,
// parte da queda do gasto é resposta ao próprio déficit — a resposta com
// melhor base é uma PAUSA em manutenção, não mais um corte.
await page.evaluate(() => {
  const s = window.Store.get();
  const iso = (d) => { const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
  const hoje = new Date();
  s.weights = {};
  for (let i = 140; i >= 0; i -= 7) {              // 20 semanas de pesagens
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    s.weights[iso(d)] = Math.round((90 - (140 - i) * 0.03) * 100) / 100;
  }
  // as últimas 4 semanas travadas, que é o que dispara o aviso
  for (let i = 27; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    s.weights[iso(d)] = 85.8;
  }
  s.settings.platoAdiadoAte = null;
  window.Store.save();
  window.App.renderAll();
});
const longa = await page.evaluate(() => window.App.analisarPlato());
check('reconhece que a dieta já é longa', longa && longa.semanasDeDieta >= 12, longa && longa.semanasDeDieta);
const cartaoLongo = await page.locator('#tab-hoje .plato-card').textContent();
check('oferece PAUSA em manutenção, não só cortar mais',
  cartaoLongo.includes('PAUSA') && cartaoLongo.includes('MANUTENÇÃO'), cartaoLongo.slice(-260));
check('e diz que a pausa não é desistir', /não é desistir/i.test(cartaoLongo));
check('tem botão para aceitar a pausa',
  await page.locator('#tab-hoje .plato-card button', { hasText: 'pausa de 2 semanas' }).count() === 1);
await page.locator('#tab-hoje .plato-card button', { hasText: 'pausa de 2 semanas' }).click();
check('aceitar a pausa silencia o aviso por 2 semanas',
  await page.locator('#tab-hoje .plato-card').count() === 0);

// dieta curta NÃO recebe conselho de pausa (seria conselho errado)
const curta = await cenario({ kcalDia: 2200, pesoInicial: 85, pesoFinal: 85 });
check('dieta curta não recebe conselho de pausa',
  curta && curta.semanasDeDieta === 0, curta && curta.semanasDeDieta);
check('e o cartão dela não fala em pausa',
  !(await page.locator('#tab-hoje .plato-card').textContent()).includes('PAUSA'));

// ---- meta na mão é escolha da pessoa: o app não intervém ----
await page.evaluate(() => {
  const s = window.Store.get();
  s.goal.manualKcal = 2000;
  window.Store.save();
});
check('meta definida na mão não é contestada',
  await page.evaluate(() => window.App.analisarPlato()) === null);
await page.evaluate(() => { window.Store.get().goal.manualKcal = null; window.Store.save(); });

// ---- quem não quer emagrecer não recebe conselho de cortar ----
const semMeta = await cenario({ kcalDia: 2200, pesoInicial: 85, pesoFinal: 85, pace: 0 });
check('sem meta de emagrecer, nenhum aviso', semMeta === null, JSON.stringify(semMeta));

// ---- o aviso APARECE na aba Hoje (o ponto todo: vir até a pessoa) ----
await cenario({ kcalDia: 2200, pesoInicial: 85, pesoFinal: 85 });
await page.click('.app-btn[data-app="diario"]');
await page.click('nav.tabs[data-app="diario"] .tab-btn[data-tab="hoje"]');
await page.waitForSelector('#tab-hoje .plato-card', { timeout: 10000 });
const cartao = await page.locator('#tab-hoje .plato-card').textContent();
check('o cartão aparece sozinho na aba Hoje, sem procurar nada', true);
check('diz o gasto medido e a meta sugerida em kcal',
  /\d{4} kcal/.test(cartao) && cartao.includes('gasto real'), cartao.slice(0, 120));
check('oferece a outra leitura (registro incompleto), sem esconder',
  cartao.includes('sem registrar'));

// ---- aplicar a sugestão muda a meta de verdade ----
const metaAntes = await page.evaluate(() => window.App.buildAnalysisPayload().dieta.metaKcalDia);
await page.locator('#tab-hoje .plato-card button', { hasText: 'Usar' }).click();
const metaDepois = await page.evaluate(() => window.App.buildAnalysisPayload().dieta.metaKcalDia);
check('o botão realmente baixa a meta diária', metaDepois < metaAntes,
  JSON.stringify({ metaAntes, metaDepois }));
check('e o aviso some depois de resolvido',
  await page.locator('#tab-hoje .plato-card').count() === 0);

// ---- "depois eu vejo" silencia por 14 dias, não para sempre ----
await page.evaluate(() => {
  const s = window.Store.get();
  s.goal.useAdaptive = false;          // volta a condição de platô
  s.settings.platoAdiadoAte = null;
  window.Store.save();
  window.App.renderAll();
});
await page.waitForSelector('#tab-hoje .plato-card', { timeout: 10000 });
await page.locator('#tab-hoje .plato-card button', { hasText: 'depois eu vejo' }).click();
check('adiar esconde o cartão', await page.locator('#tab-hoje .plato-card').count() === 0);
check('adiar guarda uma data ~14 dias à frente', await page.evaluate(() => {
  const ate = window.Store.get().settings.platoAdiadoAte;
  const dias = Math.round((Date.parse(ate + 'T12:00:00') - Date.now()) / 86400000);
  return dias >= 13 && dias <= 15;
}));
await page.evaluate(() => {
  window.Store.get().settings.platoAdiadoAte = '2020-01-01';   // data no passado
  window.Store.save();
  window.App.renderAll();
});
check('passada a data, o aviso volta (não some para sempre)',
  await page.locator('#tab-hoje .plato-card').count() === 1);

await page.screenshot({ path: 'shot-plato.png', fullPage: true });
await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
