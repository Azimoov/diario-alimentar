// laudo-foto-pdf.mjs — E2E: ler laudo por FOTO e por PDF nas duas abas de
// Exames, conferir a tela de revisão e o que efetivamente entra no app.
//
// Precisa dos dois servidores locais no ar, em outros terminais:
//   node data/devserver.mjs              (app, porta 8123)
//   cd fase2-proxy && npm run dev:local  (Worker real, porta 8124)
// e do Playwright instalado (npm i -D playwright).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = 'http://localhost:8123', PROXY = 'http://localhost:8124';
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 150) + ']' : ''));
  if (!ok) fails++;
};
const DIR = join(tmpdir(), '');
// arquivos de teste (o conteúdo não importa: o dev-server responde fixo)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
writeFileSync(join(DIR, 'laudo-teste.png'), PNG);
writeFileSync(join(DIR, 'laudo-teste.pdf'), Buffer.from('%PDF-1.4\n% laudo de teste\n'));

const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const EMAIL = 'laudo+' + Date.now().toString(36) + '@example.com';

const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
p.on('dialog', d => d.accept());
await p.goto(APP);
await p.waitForSelector('.gate-card');
await p.evaluate((u) => { const s = window.Store.get(); s.settings.proxyUrl = u; window.Store.save(); }, PROXY);
await p.reload();
await p.waitForSelector('.gate-card');

// conta + chave da API (BYOK é exigido para ler laudo)
await p.locator('.gate-card .auth-tabs button', { hasText: 'Criar conta' }).click();
await p.locator('.gate-card input[type=email]').fill(EMAIL);
const sp = p.locator('.gate-card input[type=password]');
await sp.nth(0).fill('senha-de-teste-1'); await sp.nth(1).fill('senha-de-teste-1');
await p.locator('.gate-card input[type=text]').fill('convite-local');
await p.locator('.gate-card .btn.primary').click();
await p.waitForFunction(() => !document.body.classList.contains('gate-active'), { timeout: 25000 });
await p.evaluate(async () => { await window.Auth.salvarChave('sk-ant-api03-chave-de-teste-do-laudo-000'); });

// ---------- LABORATORIAL por FOTO ----------
await p.click('.app-btn[data-app="exames"]');
const cardLab = p.locator('#tab-exlab .card', { hasText: 'Novo resultado' });
check('botão de câmera no formulário laboratorial',
  await cardLab.getByRole('button', { name: /Fotografar laudo/ }).count() === 1);
check('botão de PDF no formulário laboratorial',
  await cardLab.getByRole('button', { name: /Carregar PDF/ }).count() === 1);

await cardLab.locator('input[type=file][accept="image/*"]').setInputFiles(join(DIR, 'laudo-teste.png'));
await p.waitForSelector('.modal-head h3:has-text("Conferir o laudo")', { timeout: 30000 });
check('foto abre a tela de conferência (não salva direto)', true);
const linhas = p.locator('.conf-linha');
check('3 analitos listados para conferir', await linhas.count() === 3, await linhas.count());
check('data do laudo preenchida', (await p.locator('.modal input[type=date]').inputValue()) === '2026-07-30');
check('a foto virou bloco de imagem no servidor',
  /image/.test(await p.locator('.modal').textContent()));
// nada foi salvo ainda
check('nada entrou no app antes de aprovar',
  await p.evaluate(() => window.Store.get().labExams.length) === 0);
await p.screenshot({ path: join(DIR, 'shot-conferencia.png') });

// desmarca um e corrige outro antes de salvar
await linhas.nth(2).locator('input[type=checkbox]').uncheck();
await linhas.nth(0).locator('input[type=text]').nth(1).fill('95');   // corrige o valor
await p.locator('.modal').getByRole('button', { name: 'Adicionar os marcados' }).click();
await p.waitForFunction(() => !document.querySelector('.modal-back'), { timeout: 15000 });

const salvos = await p.evaluate(() => window.Store.get().labExams.map(x => ({
  n: x.name, v: x.value, num: x.num, u: x.unit, lo: x.refLow, hi: x.refHigh, d: x.date,
})));
check('só os marcados entraram', salvos.length === 2, JSON.stringify(salvos.map(s => s.n)));
check('correção manual foi respeitada', salvos[0].v === '95' && salvos[0].num === 95, JSON.stringify(salvos[0]));
check('faixa de referência veio do laudo', salvos[0].lo === 70 && salvos[0].hi === 99);
check('faixa ausente fica vazia (não inventa)', salvos[1].lo === null && salvos[1].hi === 190, JSON.stringify(salvos[1]));
check('data aplicada a todos', salvos.every(s => s.d === '2026-07-30'));
check('resultados aparecem na lista', await p.locator('#tab-exlab .exam-table td', { hasText: 'Glicose em jejum' }).count() === 1);

// ---------- LABORATORIAL por PDF ----------
await cardLab.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles(join(DIR, 'laudo-teste.pdf'));
await p.waitForSelector('.modal-head h3:has-text("Conferir o laudo")', { timeout: 30000 });
check('PDF também abre a conferência', true);
check('o PDF virou bloco document no servidor',
  /document/.test(await p.locator('.modal').textContent()));
await p.locator('.modal').getByRole('button', { name: 'Cancelar' }).click();
check('cancelar não adiciona nada',
  await p.evaluate(() => window.Store.get().labExams.length) === 2);

// ---------- IMAGEM por PDF ----------
await p.click('nav.tabs[data-app="exames"] .tab-btn[data-tab="eximg"]');
const cardImg = p.locator('#tab-eximg .card', { hasText: 'Novo exame de imagem' });
check('botões de laudo na aba de imagem',
  await cardImg.getByRole('button', { name: /Fotografar laudo/ }).count() === 1
  && await cardImg.getByRole('button', { name: /Carregar PDF/ }).count() === 1);
await cardImg.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles(join(DIR, 'laudo-teste.pdf'));
await p.waitForFunction(() => {
  const el = document.querySelector('#tab-eximg textarea');
  return el && el.value.includes('Esteatose');
}, { timeout: 30000 });
check('PDF preencheu o formulário de imagem', true);
check('data preenchida', (await cardImg.locator('input[type=date]').inputValue()) === '2026-07-15');
check('nome do exame preenchido', (await cardImg.locator('input[list="dl-imagem"]').inputValue()).includes('abdome'));
check('local preenchido', (await cardImg.getByPlaceholder('opcional').inputValue()).includes('document'));
check('imagem NÃO salva sozinha (ainda é rascunho)',
  await p.evaluate(() => window.Store.get().imgExams.length) === 0);
await p.screenshot({ path: join(DIR, 'shot-imagem-preenchida.png') });

await cardImg.getByRole('button', { name: '+ Adicionar exame' }).click();
await p.waitForTimeout(500);
check('salva depois de confirmar', await p.evaluate(() => window.Store.get().imgExams.length) === 1);

// ---------- sem chave da API, o botão avisa ----------
await p.evaluate(async () => { await window.Auth.removerChave(); });
await p.click('nav.tabs[data-app="exames"] .tab-btn[data-tab="exlab"]');
// some com o toast anterior (o de "anotado ✅") para não ler mensagem velha
await p.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.classList.remove('show'); });
await cardLab.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles(join(DIR, 'laudo-teste.pdf'));
await p.waitForFunction(() => {
  const t = document.querySelector('#toast');
  return t && t.classList.contains('show') && /chave/i.test(t.textContent);
}, { timeout: 30000 }).catch(() => {});
check('sem chave, explica em vez de falhar em silêncio',
  /chave/i.test(await p.textContent('#toast')), await p.textContent('#toast'));
check('e leva para a tela de cadastrar a chave',
  await p.locator('#tab-dados.active').count() === 1);

await b.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
