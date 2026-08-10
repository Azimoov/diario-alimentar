// area-ia.mjs — E2E da área 💬 IA: conversa com memória e análises guardadas.
//
// O que importa provar aqui:
//   - a análise deixou de sobrescrever: cada uma vira um item do histórico
//     (antes o app guardava só a última, num campo `analysis`);
//   - a conversa mantém o fio — a segunda pergunta chega ao servidor junto
//     com a primeira e com a resposta do meio;
//   - a pergunta digitada não se perde se a resposta falhar.
//
// Precisa dos dois servidores locais no ar, em outros terminais:
//   node data/devserver.mjs              (app, porta 8123)
//   cd fase2-proxy && npm run dev:local  (Worker real, porta 8124)
import { chromium } from 'playwright';

const APP = 'http://localhost:8123';
const PROXY = 'http://localhost:8124';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 170) + ']' : ''));
  if (!ok) fails++;
};

const EMAIL = 'ia@example.com';
const SENHA = 'senha-da-conversa-1';
const CHAVE = 'sk-ant-api03-chave-de-teste-do-e2e-ia-00000';
// PW_CHROMIUM_PATH: só necessário em sandboxes com Chromium em local não padrão.
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
page.on('dialog', d => d.accept());

// ---------- entra e prepara a conta (o portão bloqueia tudo sem login) -------
await page.goto(APP);
await page.waitForSelector('.gate-card');
await page.evaluate((p) => { const s = window.Store.get(); s.settings.proxyUrl = p; window.Store.save(); }, PROXY);
await page.reload();
await page.waitForSelector('.gate-card');
await page.evaluate(async ({ email, senha }) => {
  await window.Auth.criarConta(email, senha, 'convite-local');
}, { email: EMAIL, senha: SENHA });
await page.reload();
await page.waitForSelector('.daynav');
await page.evaluate(async (k) => { await window.Auth.salvarChave(k); }, CHAVE);

// ---------- a área existe e abre na Conversa --------------------------------
check('botão da área IA existe', await page.locator('.app-btn[data-app="ia"]').count() === 1);
await page.click('.app-btn[data-app="ia"]');
await page.waitForSelector('#tab-conversa.active');
check('área IA abre na aba Conversa', await page.locator('#tab-conversa.active').count() === 1);
check('as duas sub-abas aparecem',
  await page.locator('nav.tabs[data-app="ia"] .tab-btn').count() === 2);

// ---------- primeira pergunta -----------------------------------------------
await page.locator('#tab-conversa .chat-campo').fill('minha proteína está suficiente?');
await page.getByRole('button', { name: 'Perguntar' }).click();
await page.waitForSelector('#tab-conversa .chat-msg.ia', { timeout: 30000 });
check('pergunta aparece como minha', (await page.locator('#tab-conversa .chat-msg.eu .chat-bolha').first().textContent())
  .includes('minha proteína'));
const r1 = await page.locator('#tab-conversa .chat-msg.ia .chat-bolha').first().textContent();
check('resposta chegou e cita a pergunta', r1.includes('minha proteína está suficiente?'), r1);
check('primeira pergunta = 1 turno', r1.includes('Turnos nesta conversa: 1'), r1);

// ---------- segunda pergunta: o FIO tem que ir junto ------------------------
await page.locator('#tab-conversa .chat-campo').fill('e o colesterol?');
await page.getByRole('button', { name: 'Perguntar' }).click();
await page.waitForFunction(
  () => document.querySelectorAll('#tab-conversa .chat-msg.ia').length === 2, { timeout: 30000 });
const r2 = await page.locator('#tab-conversa .chat-msg.ia .chat-bolha').nth(1).textContent();
check('a conversa tem memória: 3 turnos vão ao servidor', r2.includes('Turnos nesta conversa: 3'), r2);
check('a resposta é da pergunta nova', r2.includes('e o colesterol?'), r2);
check('4 mensagens no fio', await page.locator('#tab-conversa .chat-msg').count() === 4);

// ---------- a conversa sobrevive a recarregar o app -------------------------
// espera o envio automático concluir: recarregar antes disso faria a nuvem
// (ainda sem a conversa) sobrescrever o que está no aparelho
await page.waitForFunction(() => {
  const s = window.Store.get();
  return s.settings.account.lastSyncAt && !window.Auth.temPendencia();
}, { timeout: 25000 });
await page.reload();
await page.waitForSelector('.daynav');
await page.click('.app-btn[data-app="ia"]');
await page.waitForSelector('#tab-conversa.active');
check('conversa continua depois de recarregar',
  await page.locator('#tab-conversa .chat-msg').count() === 4);

// ---------- pergunta não se perde quando a resposta falha -------------------
// derruba o endereço do proxy só para esta pergunta
await page.evaluate(() => { const s = window.Store.get(); s.settings.proxyUrl = 'http://localhost:9'; window.Store.save(); });
await page.locator('#tab-conversa .chat-campo').fill('pergunta que vai falhar');
await page.getByRole('button', { name: 'Perguntar' }).click();
await page.waitForSelector('#tab-conversa .auth-msg.erro', { timeout: 30000 });
check('erro é mostrado sem quebrar a tela', true);
check('a pergunta digitada NÃO se perde no erro',
  await page.evaluate(() => window.Store.get().chat.mensagens.some(m => m.text === 'pergunta que vai falhar')));
await page.evaluate((p) => { const s = window.Store.get(); s.settings.proxyUrl = p; window.Store.save(); }, PROXY);

// ---------- análises: acumulam em vez de sobrescrever -----------------------
await page.click('nav.tabs[data-app="ia"] .tab-btn[data-tab="analises"]');
await page.waitForSelector('#tab-analises.active');
check('começa sem análise guardada',
  (await page.textContent('#tab-analises')).includes('Nenhuma análise ainda'));

async function gerarAnalise() {
  await page.getByRole('button', { name: '🔎 Nova análise' }).click();
  await page.getByRole('button', { name: '🔎 Analisar agora' }).click();
  await page.waitForSelector('.modal .analysis-text', { timeout: 30000 });
  await page.locator('.modal .icon-btn').click();
}
await gerarAnalise();
check('primeira análise guardada', await page.evaluate(() => window.Store.get().analyses.length) === 1);
await gerarAnalise();
const n = await page.evaluate(() => window.Store.get().analyses.length);
check('segunda análise NÃO sobrescreve a primeira', n === 2, n);
check('as duas aparecem na lista', await page.locator('#tab-analises .card').count() === 3); // 1 cartão de topo + 2

// mais recente primeiro
const ordem = await page.evaluate(() => window.Store.get().analyses.map(a => a.at));
check('mais recente primeiro', ordem[0] >= ordem[1], JSON.stringify(ordem));

// abre e lê uma
await page.locator('#tab-analises .card', { hasText: 'Ler' }).first().getByRole('button', { name: 'Ler' }).click();
await page.waitForSelector('#tab-analises .analysis-text');
check('dá para ler a análise guardada',
  (await page.textContent('#tab-analises .analysis-text')).includes('VISÃO GERAL'));

// apagar remove só aquela
await page.locator('#tab-analises .link-btn.danger').first().click();
await page.waitForFunction(() => window.Store.get().analyses.length === 1, { timeout: 10000 });
check('apagar remove só a escolhida', await page.evaluate(() => window.Store.get().analyses.length) === 1);

// ---------- migração: quem tinha o campo antigo não perde a análise ---------
// Testada direto no Store, sem recarregar: aqui interessa a migração em si,
// e um reload traria a sincronização junto, misturando duas coisas diferentes
// num teste só.
const migrada = await page.evaluate(() => {
  const bruto = JSON.parse(localStorage.getItem('diario_kcal_v1'));
  delete bruto.analyses;
  bruto.analysis = { at: '2026-01-15T10:00:00.000Z', text: 'ANÁLISE ANTIGA DE ANTES DA LISTA', modelo: 'antigo' };
  localStorage.setItem('diario_kcal_v1', JSON.stringify(bruto));
  const s = window.Store.load();   // é o load() que migra
  return { n: s.analyses.length, texto: (s.analyses[0] || {}).text, sobrou: s.analysis };
});
check('análise do formato antigo é migrada para a lista', migrada.n === 1 && /ANTES DA LISTA/.test(migrada.texto), JSON.stringify(migrada));
check('campo antigo é removido após migrar', migrada.sobrou === undefined, JSON.stringify(migrada.sobrou));

// ---------- tudo isso vai para a nuvem --------------------------------------
// (o estado aqui é o migrado acima: 1 análise antiga + a conversa)
const naNuvem = await page.evaluate(() => {
  const s = JSON.parse(window.Store.exportJSON({ paraNuvem: true }));
  return { analises: (s.analyses || []).length, msgs: ((s.chat || {}).mensagens || []).length };
});
check('análises e conversa entram no backup da conta',
  naNuvem.analises === 1 && naNuvem.msgs >= 4, JSON.stringify(naNuvem));

await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
