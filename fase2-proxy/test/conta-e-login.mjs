// conta-e-login.mjs — E2E do login: cria conta, sincroniza, simula troca de
// aparelho, recupera senha por e-mail (lendo o link do dev-server), cadastra
// a chave da API da pessoa e confere que nada se perde.
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
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 160) + ']' : ''));
  if (!ok) fails++;
};

const EMAIL = 'daniel@example.com';
const SENHA = 'senha-forte-123';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// contexto = "aparelho". Cada contexto tem localStorage próprio.
async function novoAparelho(nome) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGEERROR[' + nome + ']', e.message); fails++; });
  page.on('dialog', d => d.accept());
  return { ctx, page };
}
async function configurarProxy(page) {
  await page.evaluate((p) => {
    const s = window.Store.get();
    s.settings.proxyUrl = p;
    window.Store.save();
  }, PROXY);
  await page.reload();
  await page.waitForSelector('.weight-card');
}

// ---------- APARELHO 1: dados locais, depois cria conta ----------
const a1 = await novoAparelho('A1');
await a1.page.goto(APP);
await a1.page.waitForSelector('.weight-card');
await configurarProxy(a1.page);

check('chip de conta convida a entrar', (await a1.page.textContent('#conta-chip')).includes('entrar'));

// registra dados locais ANTES de ter conta
await a1.page.locator('#entry').fill('100 g arroz');
await a1.page.getByRole('button', { name: '+ Adicionar' }).click();
const pesoInputs = a1.page.locator('.weight-card .comp-grid input');
await pesoInputs.nth(0).fill('82.4');
await pesoInputs.nth(0).blur();
check('dados locais criados', await a1.page.locator('#tab-hoje .item-name').count() >= 1);

// cria conta
await a1.page.click('#conta-chip');
await a1.page.locator('.auth-tabs button', { hasText: 'Criar conta' }).click();
await a1.page.locator('.modal input[type=email]').fill(EMAIL);
const senhas1 = a1.page.locator('.modal input[type=password]');
await senhas1.nth(0).fill(SENHA);
await senhas1.nth(1).fill(SENHA);
await a1.page.locator('.modal input[type=text]').last().fill('convite-local');
await a1.page.locator('.modal .btn.primary').click();
await a1.page.waitForFunction(() => !document.querySelector('.modal-back'), { timeout: 20000 });
check('logado após criar conta', (await a1.page.textContent('#conta-chip')).includes(EMAIL), await a1.page.textContent('#conta-chip'));

// convite errado é barrado
{
  const a0 = await novoAparelho('A0');
  await a0.page.goto(APP);
  await a0.page.waitForSelector('.weight-card');
  await configurarProxy(a0.page);
  await a0.page.click('#conta-chip');
  await a0.page.locator('.auth-tabs button', { hasText: 'Criar conta' }).click();
  await a0.page.locator('.modal input[type=email]').fill('intruso@example.com');
  const sp = a0.page.locator('.modal input[type=password]');
  await sp.nth(0).fill('senha-qualquer');
  await sp.nth(1).fill('senha-qualquer');
  await a0.page.locator('.modal input[type=text]').last().fill('chute-errado');
  await a0.page.locator('.modal .btn.primary').click();
  await a0.page.waitForSelector('.auth-msg.erro', { timeout: 15000 });
  const msg = await a0.page.textContent('.auth-msg.erro');
  check('convite inválido barrado com mensagem', /convite/i.test(msg), msg);
  await a0.ctx.close();
}

// espera o envio automático (debounce de 3 s) concluir
await a1.page.waitForFunction(() => {
  const c = window.Store.get().settings.account;
  return c && c.lastSyncAt;
}, { timeout: 20000 });
check('envio automático marcou lastSyncAt', true);

// mais uma alteração deve subir sozinha
const syncAntes = await a1.page.evaluate(() => window.Store.get().settings.account.lastSyncAt);
await a1.page.locator('#entry').fill('50 g aveia');
await a1.page.getByRole('button', { name: '+ Adicionar' }).click();
await a1.page.waitForFunction((antes) => {
  const c = window.Store.get().settings.account;
  return c.lastSyncAt && c.lastSyncAt !== antes;
}, syncAntes, { timeout: 20000 });
check('alteração posterior sincroniza sozinha', true);

// ---------- APARELHO 2: só faz login e recebe tudo ----------
const a2 = await novoAparelho('A2');
await a2.page.goto(APP);
await a2.page.waitForSelector('.weight-card');
await configurarProxy(a2.page);
check('aparelho 2 começa vazio', await a2.page.evaluate(() => Object.keys(window.Store.get().weights).length === 0));

await a2.page.click('#conta-chip');
await a2.page.locator('.modal input[type=email]').fill(EMAIL);
await a2.page.locator('.modal input[type=password]').fill(SENHA);
await a2.page.locator('.modal .btn.primary').click();
await a2.page.waitForFunction(() => !document.querySelector('.modal-back'), { timeout: 25000 });
check('aparelho 2 logado', (await a2.page.textContent('#conta-chip')).includes(EMAIL));
const peso2 = await a2.page.evaluate(() => window.Store.get().weights);
check('peso veio da nuvem no aparelho 2', Object.values(peso2)[0] === 82.4, JSON.stringify(peso2));
const itens2 = await a2.page.evaluate(() => {
  const d = window.Store.get().days;
  return Object.values(d).reduce((n, x) => n + (x.items || []).length, 0);
});
check('itens do diário vieram da nuvem', itens2 === 2, itens2);
check('sessão NÃO veio no backup (é deste aparelho)', await a2.page.evaluate(
  () => window.Store.get().settings.account.email) === EMAIL);

// ---------- recuperação de senha por e-mail ----------
const a3 = await novoAparelho('A3');
await a3.page.goto(APP);
await a3.page.waitForSelector('.weight-card');
await configurarProxy(a3.page);
await a3.page.click('#conta-chip');
await a3.page.locator('.auth-tabs button', { hasText: 'Esqueci' }).click();
await a3.page.locator('.modal input[type=email]').fill(EMAIL);
await a3.page.locator('.modal .btn.primary').click();
await a3.page.waitForSelector('.auth-msg.ok', { timeout: 20000 });
check('confirmação de envio na tela', /enviado/i.test(await a3.page.textContent('.auth-msg.ok')));

// lê o link do e-mail capturado pelo dev-server
const emails = await (await fetch(PROXY + '/__emails')).json();
const ultimo = emails.emails[emails.emails.length - 1];
const token = (/#recuperar=([0-9a-f]{64})/.exec(ultimo.text || '') || [])[1];
check('e-mail chegou com link de recuperação', !!token && ultimo.to[0] === EMAIL, ultimo && ultimo.subject);

// abre o app pelo link, como o usuário faria
const NOVA = 'senha-nova-anotada-9';
// caso 1: app JÁ ABERTO e o link muda só o #hash (não recarrega a página)
await a3.page.locator('.modal .icon-btn').click();
await a3.page.evaluate((t) => { location.hash = 'recuperar=' + t; }, token);
await a3.page.waitForSelector('.modal-head h3:has-text("nova senha")', { timeout: 20000 });
check('link com app aberto (hashchange) abre a tela', true);
await a3.page.locator('.modal .icon-btn').click();
// caso 2: app aberto DE NOVO pelo link (recarrega com o hash na URL)
await a3.page.goto(APP + '/#recuperar=' + token);
await a3.page.reload();
await a3.page.waitForSelector('.modal-back', { timeout: 20000 });
check('link abre a tela de nova senha', (await a3.page.textContent('.modal-head h3')).includes('nova senha'));
await a3.page.locator('.modal input[type=email]').fill(EMAIL);
const sp3 = a3.page.locator('.modal input[type=password]');
await sp3.nth(0).fill(NOVA);
await sp3.nth(1).fill(NOVA);
await a3.page.locator('.modal .btn.primary').click();
await a3.page.waitForFunction(() => !document.querySelector('.modal-back'), { timeout: 25000 });
check('entrou direto após redefinir', (await a3.page.textContent('#conta-chip')).includes(EMAIL));

// O PONTO QUE MOTIVOU TUDO: os dados voltam depois de esquecer a senha
const pesoRec = await a3.page.evaluate(() => window.Store.get().weights);
check('DADOS RECUPERADOS após esquecer a senha', Object.values(pesoRec)[0] === 82.4, JSON.stringify(pesoRec));
check('hash do link foi limpo da URL', !(await a3.page.evaluate(() => location.hash)));

// senha antiga não entra mais
const a4 = await novoAparelho('A4');
await a4.page.goto(APP);
await a4.page.waitForSelector('.weight-card');
await configurarProxy(a4.page);
await a4.page.click('#conta-chip');
await a4.page.locator('.modal input[type=email]').fill(EMAIL);
await a4.page.locator('.modal input[type=password]').fill(SENHA);
await a4.page.locator('.modal .btn.primary').click();
await a4.page.waitForSelector('.auth-msg.erro', { timeout: 20000 });
check('senha antiga rejeitada', /incorret/i.test(await a4.page.textContent('.auth-msg.erro')));

// ---------- conflito: dois lados com dados -> pergunta ----------
await a4.page.locator('.modal .icon-btn').click();
await a4.page.locator('#entry').fill('30 g tapioca');
await a4.page.getByRole('button', { name: '+ Adicionar' }).click();
await a4.page.click('#conta-chip');
await a4.page.locator('.modal input[type=email]').fill(EMAIL);
await a4.page.locator('.modal input[type=password]').fill(NOVA);
await a4.page.locator('.modal .btn.primary').click();
await a4.page.waitForSelector('.modal-head h3:has-text("Dados em dois lugares")', { timeout: 25000 });
check('conflito é perguntado, não decidido sozinho', true);
await a4.page.getByRole('button', { name: /Juntar os dois/ }).click();
await a4.page.waitForFunction(() => !document.querySelector('.modal-back'), { timeout: 20000 });
const dadosJuntos = await a4.page.evaluate(() => {
  const s = window.Store.get();
  return {
    peso: Object.values(s.weights)[0],
    itens: Object.values(s.days).reduce((n, x) => n + (x.items || []).length, 0),
  };
});
check('juntar preserva nuvem E aparelho', dadosJuntos.peso === 82.4 && dadosJuntos.itens >= 3, JSON.stringify(dadosJuntos));

// ---------- sair não apaga os dados locais ----------
await a4.page.click('.app-btn[data-app="diario"]');
await a4.page.click('nav.tabs[data-app="diario"] .tab-btn[data-tab="dados"]');
await a4.page.getByRole('button', { name: 'Sair' }).click();
await a4.page.waitForFunction(() => !window.Store.get().settings.account.session, { timeout: 15000 });
check('após sair, chip volta a convidar', (await a4.page.textContent('#conta-chip')).includes('entrar'));
check('sair NÃO apagou os dados locais', await a4.page.evaluate(
  () => Object.keys(window.Store.get().weights).length > 0));

// ---------- chave da API por pessoa (BYOK) ----------
await a2.page.evaluate(() => { const s = window.Store.get(); s.settings.proxyToken = ''; window.Store.save(); });

// sem chave: a análise recusa e oferece o caminho para cadastrar
await a2.page.click('.app-btn[data-app="saude"]');
await a2.page.getByRole('button', { name: '🔎 Analisar meus dados' }).click();
await a2.page.getByRole('button', { name: '🔎 Analisar agora' }).click();
await a2.page.waitForSelector('.modal .btn:has-text("Cadastrar minha chave")', { timeout: 30000 });
check('sem chave, a análise explica e oferece cadastrar', true);
await a2.page.locator('.modal .btn', { hasText: 'Cadastrar minha chave' }).click();
check('botão leva para a aba Dados', await a2.page.locator('#tab-dados.active').count() === 1);

// cadastra uma chave pela interface
const cartaoChave = a2.page.locator('#tab-dados .card', { hasText: 'Sua chave da Anthropic' });
await cartaoChave.locator('.hint.comp-warn').waitFor({ timeout: 15000 });
check('cartão avisa que falta a chave', /Sem chave/.test(await cartaoChave.locator('.hint.comp-warn').textContent()));
await cartaoChave.locator('input[type=password]').fill('senha-errada-nao-e-chave');
await cartaoChave.getByRole('button', { name: /Salvar chave/ }).click();
await cartaoChave.locator('.auth-msg.erro').waitFor({ timeout: 20000 });
check('chave em formato inválido é recusada', /sk-ant-/.test(await cartaoChave.locator('.auth-msg.erro').textContent()));

const CHAVE = 'sk-ant-api03-chave-de-teste-do-e2e-000000';
await cartaoChave.locator('input[type=password]').fill(CHAVE);
await cartaoChave.getByRole('button', { name: /Salvar chave/ }).click();
await cartaoChave.locator('.auth-msg.ok').waitFor({ timeout: 25000 });
check('chave válida é aceita', /guardada/i.test(await cartaoChave.locator('.auth-msg.ok').textContent()));
check('mostra só o final da chave', (await cartaoChave.textContent()).includes(CHAVE.slice(-4))
  && !(await cartaoChave.textContent()).includes(CHAVE), 'ok');
check('a chave não fica guardada no aparelho', !(await a2.page.evaluate(() => JSON.stringify(window.Store.get()))).includes(CHAVE));

// agora a análise funciona
await a2.page.click('.app-btn[data-app="saude"]');
await a2.page.getByRole('button', { name: '🔎 Analisar meus dados' }).click();
await a2.page.getByRole('button', { name: '🔎 Analisar agora' }).click();
await a2.page.waitForSelector('.analysis-text', { timeout: 30000 });
check('com a chave própria, a análise funciona',
  (await a2.page.textContent('.analysis-text')).includes('VISÃO GERAL'));
await a2.page.locator('.modal .icon-btn').click();

await a1.page.screenshot({ path: 'shot-conta.png', fullPage: false });
await a1.page.click('.app-btn[data-app="diario"]');
await a1.page.click('nav.tabs[data-app="diario"] .tab-btn[data-tab="dados"]');
await a1.page.screenshot({ path: 'shot-conta-dados.png', fullPage: true });

await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
