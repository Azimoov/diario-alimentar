// todos.mjs — roda TODA a suíte com um comando só:
//
//     node test/todos.mjs
//
// Ele mesmo sobe os dois servidores locais (app na 8123, Worker de
// desenvolvimento na 8124), roda as catorze suítes em ordem, imprime um resumo
// e derruba o que subiu. Se os servidores já estiverem no ar, reaproveita.
//
// Nada aqui usa internet, chave de API ou conta na Cloudflare: o dev-server
// simula a Anthropic e captura os e-mails. Único requisito além do Node:
//     npx playwright install chromium
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'http://localhost:8123';
const PROXY = 'http://localhost:8124';

// pasta = onde o teste roda; alguns leem arquivos por caminho relativo
const SUITES = [
  ['health-parser', 'test/health-parser.mjs', RAIZ, 'leitura do export do app Saúde (sem navegador)'],
  ['import-saude', 'fase2-proxy/test/import-saude.mjs', join(RAIZ, 'fase2-proxy'), 'zip do Saúde em qualquer idioma'],
  ['smoke', 'fase2-proxy/test/smoke.mjs', join(RAIZ, 'fase2-proxy'), 'Worker: rotas, contas, limites, CORS, base de referência'],
  ['openbrain', 'fase2-proxy/test/openbrain.mjs', join(RAIZ, 'fase2-proxy'), 'envio de contexto p/ o Open Brain'],
  ['recortar-icone', 'test/recortar-icone.mjs', RAIZ, 'ferramenta de recorte do ícone'],
  ['peso-composicao', 'test/peso-composicao.mjs', RAIZ, 'peso, % gordura e massa magra'],
  ['marca-e-pwa', 'test/marca-e-pwa.mjs', RAIZ, 'marca, manifest, ícones, as 6 áreas'],
  ['remedios', 'test/remedios.mjs', RAIZ, 'área Remédios: anotar, encerrar, chegar na IA'],
  ['treino', 'test/treino.mjs', RAIZ, 'área Treino: plano semanal, registro, notas, evolução'],
  ['exames-e-metricas', 'test/exames-e-metricas.mjs', RAIZ, 'áreas Exames e Métricas + análise'],
  ['conta-e-login', 'fase2-proxy/test/conta-e-login.mjs', join(RAIZ, 'fase2-proxy'), 'portão, sync, recuperação, chave'],
  ['isolamento-contas', 'fase2-proxy/test/isolamento-contas.mjs', join(RAIZ, 'fase2-proxy'), 'compartilhado × individual'],
  ['laudo-foto-pdf', 'fase2-proxy/test/laudo-foto-pdf.mjs', join(RAIZ, 'fase2-proxy'), 'laudo por foto e por PDF'],
  ['area-ia', 'fase2-proxy/test/area-ia.mjs', join(RAIZ, 'fase2-proxy'), 'conversa com memória e análises'],
];

async function noAr(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; }
}
async function esperar(url, segundos) {
  for (let i = 0; i < segundos * 4; i++) {
    if (await noAr(url)) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

const subidos = [];
async function subir(nome, script, cwd, url) {
  if (await noAr(url)) { console.log(`· ${nome} já estava no ar (${url})`); return true; }
  const p = spawn(process.execPath, [script], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let erro = '';
  p.stderr.on('data', d => { erro += d; });
  subidos.push(p);
  if (await esperar(url, 20)) { console.log(`· ${nome} no ar (${url})`); return true; }
  console.error(`NÃO SUBIU: ${nome} (${url})\n${erro.trim().slice(0, 600)}`);
  return false;
}
function derrubar() { subidos.forEach(p => { try { p.kill(); } catch { /* já morreu */ } }); }

function rodar(script, cwd) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [script], { cwd, env: process.env });
    let saida = '';
    p.stdout.on('data', d => { saida += d; });
    p.stderr.on('data', d => { saida += d; });
    p.on('close', code => resolve({ code, saida }));
  });
}

console.log('Subindo os servidores locais…');
const ok = (await subir('app', join(RAIZ, 'data/devserver.mjs'), RAIZ, APP))
  && (await subir('Worker', join(RAIZ, 'fase2-proxy/dev-server.mjs'), join(RAIZ, 'fase2-proxy'), PROXY + '/__emails'));
if (!ok) { derrubar(); process.exit(1); }

const resultados = [];
for (const [nome, script, cwd, oque] of SUITES) {
  process.stdout.write(`\n▶ ${nome} — ${oque}\n`);
  const { code, saida } = await rodar(join(RAIZ, script), cwd);
  const falhou = code !== 0;
  // no verde só a última linha interessa; no vermelho, tudo
  if (falhou) process.stdout.write(saida);
  else process.stdout.write('  ' + saida.trim().split('\n').pop() + '\n');
  resultados.push({ nome, falhou });
  if (falhou && /Cannot find package 'playwright'/.test(saida)) {
    console.error('\nFalta o navegador de testes. Rode:  npx playwright install chromium'
      + '\n(e `npm i -D playwright` se a pasta node_modules não existir)');
    break;
  }
}

derrubar();
const ruins = resultados.filter(r => r.falhou);
console.log('\n' + '='.repeat(52));
resultados.forEach(r => console.log((r.falhou ? 'FALHOU  ' : 'passou  ') + r.nome));
console.log('='.repeat(52));
console.log(ruins.length ? `${ruins.length} suíte(s) com falha` : `Tudo passou (${resultados.length} suítes).`);
process.exit(ruins.length ? 1 : 0);
