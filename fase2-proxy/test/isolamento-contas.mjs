// isolamento-contas.mjs — prova o modelo de dados com DUAS contas reais no Worker real:
//   COMPARTILHADO -> catálogo de alimentos (quando a pessoa marca "compartilhar")
//   INDIVIDUAL    -> diário, peso, composição corporal, exames, métricas, análise
//
// Precisa dos dois servidores locais no ar, em outros terminais:
//   node data/devserver.mjs              (app, porta 8123)
//   cd fase2-proxy && npm run dev:local  (Worker real, porta 8124)
// e do Playwright instalado (npm i -D playwright).
import { chromium } from 'playwright';

const APP = 'http://localhost:8123';
const PROXY = 'http://localhost:8124';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 170) + ']' : ''));
  if (!ok) fails++;
};

// PW_CHROMIUM_PATH: só necessário em sandboxes com Chromium em local não padrão.
// Na máquina de quem administra o app, `npx playwright install chromium` basta
// e o launch() sem essa opção já encontra o navegador sozinho.
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
// e-mails novos a cada execução: o KV do dev-server vive em memória e
// sobrevive entre rodadas, então endereços fixos dariam "conta já existe"
const selo = Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
const EMAIL_A = 'ana+' + selo + '@example.com';
const EMAIL_B = 'bruno+' + selo + '@example.com';

async function aparelho(nome) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGEERROR[' + nome + ']', e.message); fails++; });
  page.on('dialog', d => d.accept());
  await page.goto(APP);
  await page.waitForSelector('.gate-card'); // ninguém entra sem logar — ver e2e-conta
  await page.evaluate((p) => { const s = window.Store.get(); s.settings.proxyUrl = p; window.Store.save(); }, PROXY);
  await page.reload();
  await page.waitForSelector('.gate-card');
  return { ctx, page };
}
// cria conta direto pela API do app (a UI já é coberta pelo e2e-conta)
async function criarConta(page, email, senha) {
  await page.evaluate(async ({ email, senha }) => {
    await window.Auth.criarConta(email, senha, 'convite-local');
  }, { email, senha });
  await page.reload();
  await page.waitForSelector('.weight-card');
}
async function esperarSync(page) {
  await page.waitForFunction(() => {
    const c = window.Store.get().settings.account;
    return c.session && c.lastSyncAt;
  }, { timeout: 25000 });
}

// ================== CONTA A: dados privados + 1 alimento compartilhado ======
const A = await aparelho('A');
await criarConta(A.page, EMAIL_A, 'senha-da-ana-1');

// dado de saúde e de alimentação, privados
await A.page.locator('#entry').fill('100 g arroz');
await A.page.getByRole('button', { name: '+ Adicionar' }).click();
const pesoA = A.page.locator('.weight-card .comp-grid input');
await pesoA.nth(0).fill('61.5'); await pesoA.nth(0).blur();
await pesoA.nth(1).fill('27.3'); await pesoA.nth(1).blur();

// exame laboratorial (privado)
await A.page.click('.app-btn[data-app="exames"]');
{
  const card = A.page.locator('#tab-exlab .card', { hasText: 'Novo resultado' });
  await card.locator('input[list="dl-analitos"]').fill('Ferritina');
  await card.locator('input[inputmode=decimal]').fill('18');
  await card.getByPlaceholder('ex.: mg/dL').fill('ng/mL');
  await card.getByRole('button', { name: '+ Adicionar resultado' }).click();
}

// métricas do relógio (privadas) — injetadas direto
await A.page.evaluate(() => {
  const s = window.Store.get();
  s.health.daily['2026-08-01'] = { steps: 12345, hrRest: 51 };
  s.health.lastImportAt = new Date().toISOString();
  window.Store.save();
});

// alimento PRIVADO (sem compartilhar)
await A.page.evaluate(() => {
  window.Store.addCustomFood({ name: 'Marmita secreta da Ana', kcal: 155, prot: 12, carb: 9, fat: 7 });
});
// alimento COMPARTILHADO (vai para o catálogo comum)
await A.page.evaluate(async () => {
  const rec = window.Store.addCustomFood({ name: 'Whey da Ana', kcal: 400, prot: 80, carb: 8, fat: 5 });
  const res = await fetch(window.Auth.urlProxy('/foods'), {
    method: 'POST',
    headers: window.Auth.cabecalhosProxy({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: rec.name, kcal: rec.kcal, prot: rec.prot, carb: rec.carb, fat: rec.fat }),
  });
  if (!res.ok) throw new Error('falhou compartilhar: ' + res.status);
});
await A.page.evaluate(() => window.Auth.enviarDados());
await esperarSync(A.page);
check('conta A sincronizou', true);

// o blob que subiu NÃO leva sessão nem o catálogo comum
const blobA = await A.page.evaluate(() => window.Store.exportJSON({ paraNuvem: true }));
check('blob da nuvem sem token de sessão', !/"session":\s*"[0-9a-f]{64}"/.test(blobA));
check('blob da nuvem sem catálogo comum', !/"sharedFoods"/.test(blobA));
const arquivoA = await A.page.evaluate(() => window.Store.exportJSON());
check('arquivo exportado também sem token de sessão', !/"session":\s*"[0-9a-f]{64}"/.test(arquivoA));

// ================== CONTA B: outra pessoa, mesmo servidor ==================
const B = await aparelho('B');
await criarConta(B.page, EMAIL_B, 'senha-do-bruno-2');
await B.page.waitForTimeout(1200);   // deixa o syncSharedFoods rodar

const estadoB = await B.page.evaluate(() => {
  const s = window.Store.get();
  return {
    dias: Object.keys(s.days).length,
    itens: Object.values(s.days).reduce((n, d) => n + (d.items || []).length, 0),
    pesos: Object.keys(s.weights).length,
    comp: Object.keys(s.bodyComp).length,
    labs: s.labExams.length,
    img: s.imgExams.length,
    metricas: Object.keys(s.health.daily).length,
    analise: !!s.analysis,
    custom: s.customFoods.map(f => f.name),
    comuns: (s.sharedFoods || []).map(f => f.name),
  };
});

// ---- INDIVIDUAL: nada da Ana pode estar aqui ----
check('B não vê o diário de A', estadoB.itens === 0, JSON.stringify(estadoB.itens));
check('B não vê as pesagens de A', estadoB.pesos === 0);
check('B não vê a composição corporal de A', estadoB.comp === 0);
check('B não vê os exames de laboratório de A', estadoB.labs === 0);
check('B não vê as métricas do relógio de A', estadoB.metricas === 0);
check('B não vê o alimento PRIVADO de A', !estadoB.custom.includes('Marmita secreta da Ana'), JSON.stringify(estadoB.custom));

// ---- COMPARTILHADO: o catálogo atravessa ----
check('B VÊ o alimento compartilhado por A', estadoB.comuns.includes('Whey da Ana'), JSON.stringify(estadoB.comuns));
check('catálogo comum não traz o alimento privado de A', !estadoB.comuns.includes('Marmita secreta da Ana'));

// o compartilhado é usável na busca/parser de B
const achouB = await B.page.evaluate(() => {
  const m = window.Parser.matchFood('whey da ana');
  const f = m && window.Parser.getFood(m.foodId);
  return f ? { nome: f.name, kcal: f.kcal, src: f.src } : null;
});
check('B consegue registrar o alimento compartilhado', achouB && achouB.kcal === 400, JSON.stringify(achouB));
const achouPrivado = await B.page.evaluate(() => {
  const foods = window.Parser.getFoods();
  return foods.some(f => /marmita secreta/i.test(f.name));
});
check('parser de B não conhece o alimento privado de A', !achouPrivado);

// ---- B cria dados próprios; A não pode vê-los ----
await B.page.locator('#entry').fill('200 g feijao');
await B.page.getByRole('button', { name: '+ Adicionar' }).click();
const pesoB = B.page.locator('.weight-card .comp-grid input');
await pesoB.nth(0).fill('88.8'); await pesoB.nth(0).blur();
await esperarSync(B.page);

// A recarrega e puxa da nuvem: deve continuar só com o que é dela
await A.page.reload();
await A.page.waitForSelector('.weight-card');
await A.page.waitForTimeout(1500);
const estadoA = await A.page.evaluate(() => {
  const s = window.Store.get();
  return {
    pesos: Object.values(s.weights),
    labs: s.labExams.map(x => x.name),
    metricas: Object.keys(s.health.daily),
    comuns: (s.sharedFoods || []).map(f => f.name),
    custom: s.customFoods.map(f => f.name),
  };
});
check('A mantém a própria pesagem', estadoA.pesos.includes(61.5), JSON.stringify(estadoA.pesos));
check('A NÃO recebe a pesagem de B', !estadoA.pesos.includes(88.8), JSON.stringify(estadoA.pesos));
check('A mantém o próprio exame', estadoA.labs.includes('Ferritina'), JSON.stringify(estadoA.labs));
check('A mantém as próprias métricas', estadoA.metricas.includes('2026-08-01'));
check('A recuperou o catálogo comum após restaurar', estadoA.comuns.includes('Whey da Ana'), JSON.stringify(estadoA.comuns));
check('A mantém seus alimentos privados', estadoA.custom.includes('Marmita secreta da Ana'), JSON.stringify(estadoA.custom));

// ---- no servidor: um não alcança os dados do outro ----
const cruzado = await A.page.evaluate(async () => {
  // tenta ler /account/data usando a sessão de A e conferir de quem é
  const r = await fetch(window.Auth.urlProxy('/account/data'), { headers: window.Auth.cabecalhosProxy() });
  const d = await r.json();
  const st = JSON.parse(d.state);
  return { pesos: Object.values(st.weights), email: st.settings.account && st.settings.account.email };
});
check('a nuvem devolve para A apenas os dados de A',
  cruzado.pesos.includes(61.5) && !cruzado.pesos.includes(88.8), JSON.stringify(cruzado.pesos));

// sessão inválida não abre nada
const semSessao = await A.page.evaluate(async () => {
  const r = await fetch(window.Auth.urlProxy('/account/data'), { headers: { 'X-Session': 'f'.repeat(64) } });
  return r.status;
});
check('sessão forjada não abre dados de ninguém', semSessao === 401, semSessao);

await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
