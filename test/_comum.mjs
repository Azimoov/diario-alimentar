// _comum.mjs — utilitários compartilhados pelos testes de navegador.
//
// Desde que o app passou a exigir login (o "portão"), nenhuma tela interna
// aparece sem conta. Todo teste de interface precisa entrar primeiro — é o
// que `paginaLogada()` faz, criando uma conta descartável a cada execução.
//
// Precisa dos dois servidores locais no ar, em outros terminais:
//   node data/devserver.mjs              (app, porta 8123)
//   cd fase2-proxy && npm run dev:local  (Worker real, porta 8124)
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TMP = tmpdir();
export const APP = 'http://localhost:8123';
export const PROXY = 'http://localhost:8124';
export const CONVITE = 'convite-local';   // o do dev-server

// PW_CHROMIUM_PATH só é necessário em ambientes com o Chromium fora do lugar
// padrão. Na máquina de quem administra o app, `npx playwright install
// chromium` basta e o launch() sem opção encontra o navegador sozinho.
export function abrirNavegador() {
  return chromium.launch(process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
}

// e-mail novo a cada execução: o KV do dev-server vive em memória e sobrevive
// entre rodadas, então um endereço fixo daria "conta já existe" na segunda vez
export function emailDescartavel(prefixo) {
  return (prefixo || 'teste') + '+' + Date.now().toString(36)
    + Math.floor(Math.random() * 46656).toString(36) + '@example.com';
}

// Devolve uma página já DENTRO do app: aponta para o servidor local, cria uma
// conta e espera o portão liberar.
export async function paginaLogada(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 } });
  const page = await ctx.newPage();
  if (opts.onErro) page.on('pageerror', opts.onErro);
  page.on('dialog', d => d.accept());

  await page.goto(APP);
  await page.waitForSelector('.gate-card');
  await page.evaluate((p) => {
    const s = window.Store.get();
    s.settings.proxyUrl = p;
    window.Store.save();
  }, opts.proxy || PROXY);
  await page.reload();
  await page.waitForSelector('.gate-card');

  const email = opts.email || emailDescartavel(opts.prefixo);
  await page.evaluate(async ({ email, convite }) => {
    await window.Auth.criarConta(email, 'senha-de-teste-1', convite);
  }, { email, convite: opts.convite || CONVITE });
  // comChave: foto, leitura de laudo e análise exigem a chave da própria conta
  // (BYOK). O dev-server aceita qualquer chave que comece com sk-ant-.
  if (opts.comChave) {
    await page.evaluate(async () => {
      await window.Auth.salvarChave('sk-ant-api03-chave-de-teste-do-e2e-00000');
    });
  }
  await page.reload();
  await page.waitForFunction(() => !document.body.classList.contains('gate-active'), { timeout: 25000 });
  // marca de "app montado": a navegação de data da aba Hoje, que é onde o app
  // abre. (Já foi `.weight-card`; o cartão de peso mudou para o topo de
  // Métricas e passou a nascer escondido.)
  await page.waitForSelector('.daynav');
  return { ctx, page, email };
}
