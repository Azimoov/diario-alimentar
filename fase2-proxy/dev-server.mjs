// dev-server.mjs — roda o Worker REAL localmente, em Node, sem Cloudflare e
// sem gastar API. Serve para testar contas/login/sincronização de verdade
// (é o mesmo src/index.js que vai para produção), com:
//   - KV em memória
//   - API da Anthropic simulada (respostas fixas)
//   - e-mails capturados em memória (o link de recuperação é impresso aqui
//     no terminal e também fica em GET /__emails, para testes automatizados)
//
// Uso:  node dev-server.mjs        (porta 8124, a mesma do mock-proxy)
// No app: Dados -> proxy = http://localhost:8124 ; convite = convite-local

import { createServer } from "node:http";
import worker from "./src/index.js";

const PORT = Number(process.env.PORT || 8124);
const MOCK_ANTHROPIC = PORT + 100;
const MOCK_MAIL = PORT + 101;

// ---- API da Anthropic simulada -------------------------------------------
createServer((req, res) => {
  // validação de chave: aceita qualquer sk-ant-… (é tudo local e sem custo)
  if (req.method === "GET" && req.url.startsWith("/v1/models")) {
    const ok = String(req.headers["x-api-key"] || "").startsWith("sk-ant-");
    res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(ok ? { data: [] } : { error: { message: "invalid x-api-key" } }));
  }
  let d = "";
  req.on("data", (c) => (d += c));
  req.on("end", () => {
    const body = JSON.parse(d || "{}");
    const sys = String(body.system || "");
    const isRotulo = sys.includes("tabelas nutricionais");
    const isAnalise = sys.includes("dados de saúde PESSOAIS");
    const isChat = sys.includes("responde perguntas de UMA pessoa");
    const isLab = sys.includes("laudos de exames laboratoriais");
    const isImg = sys.includes("laudos de exames de imagem");
    const tipoAnexo = ((((body.messages || [])[0] || {}).content || [])[0] || {}).type || "?";
    if (isLab || isImg) {
      const conteudo = isLab
        ? {
            data: "2026-07-30",
            laboratorio: "Laboratório de teste (" + tipoAnexo + ")",
            analitos: [
              { nome: "Glicose em jejum", valor: "92", unidade: "mg/dL", refMin: 70, refMax: 99, obs: "jejum de 12h" },
              { nome: "Colesterol total", valor: "188", unidade: "mg/dL", refMin: null, refMax: 190, obs: null },
              { nome: "Anti-HIV", valor: "não reagente", unidade: null, refMin: null, refMax: null, obs: null },
            ],
            observacao: "",
          }
        : {
            data: "2026-07-15",
            exame: "Ultrassom de abdome total",
            local: "Clínica de teste (" + tipoAnexo + ")",
            conclusao: "Esteatose hepática grau I. Demais órgãos sem alterações.",
            observacao: "",
          };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        id: "msg_dev", type: "message", role: "assistant", model: "dev", stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(conteudo) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }));
    }
    const texto = isChat
      // eco da última pergunta: o teste confere que o fio da conversa chegou
      ? "RESPOSTA LOCAL (sem custo) para: "
        + String(((body.messages || []).slice(-1)[0] || {}).content || "")
        + "\nTurnos nesta conversa: " + (body.messages || []).length
      : isAnalise
      ? "VISÃO GERAL\n– Resposta FIXA do servidor de desenvolvimento (sem custo).\n\nEXAMES\n– Nada real analisado aqui.\n\nPARA LEVAR AO MÉDICO\n– Nada: isto é teste local."
      : JSON.stringify(isRotulo
        ? { nome: "Whey Local", base: "porcao", porcao_g: 30, kcal: 120, prot: 24, carb: 3, fat: 1.5, fiber: 0, observacao: "teste local" }
        : {
            itens: [
              { nome: "arroz branco cozido", gramas: 150, confianca: "media", produto: null },
              { nome: "feijão carioca cozido", gramas: 100, confianca: "media", produto: null },
            ],
            observacao: "Teste local — dados fixos.",
          });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "msg_dev", type: "message", role: "assistant",
      model: body.model || "dev", stop_reason: "end_turn",
      content: [{ type: "text", text: texto }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }));
  });
}).listen(MOCK_ANTHROPIC);

// ---- "Resend" simulado: guarda os e-mails ---------------------------------
const emails = [];
createServer((req, res) => {
  let d = "";
  req.on("data", (c) => (d += c));
  req.on("end", () => {
    const msg = JSON.parse(d || "{}");
    emails.push({ ...msg, recebidoEm: new Date().toISOString() });
    const link = /(#recuperar=[0-9a-f]{64})/.exec(msg.text || "");
    console.log(`\n📧 e-mail para ${(msg.to || []).join(", ")}: ${msg.subject}`);
    if (link) console.log(`   link: http://localhost:8123/${link[1]}\n`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "email_dev" }));
  });
}).listen(MOCK_MAIL);

// ---- KV em memória --------------------------------------------------------
const kv = new Map();
const ENV = {
  APP_TOKEN: "senha-local",
  ANTHROPIC_API_KEY: "sk-ant-dev-falsa",
  ANTHROPIC_BASE_URL: `http://localhost:${MOCK_ANTHROPIC}`,
  ALLOWED_ORIGINS: "http://localhost:8123,http://127.0.0.1:8123",
  CLAUDE_MODEL: "dev",
  CLAUDE_MODEL_ANALISE: "dev-analise",
  CLAUDE_MODEL_CHAT: "dev-chat",
  CHAT_DAILY_LIMIT: "999",
  TIMEZONE: "America/Sao_Paulo",
  PHOTO_DAILY_LIMIT: "999",
  ANALYSIS_DAILY_LIMIT: "999",
  DATA_KEY: "chave-de-desenvolvimento-local-nao-usar-em-producao",
  INVITE_CODE: "convite-local",
  RESEND_API_KEY: "re_dev_falsa",
  RESEND_API_URL: `http://localhost:${MOCK_MAIL}`,
  MAIL_FROM: "Highlander dev <dev@example.com>",
  APP_BASE_URL: "http://localhost:8123/",
  DIARIO_KV: {
    async get(k) { return kv.has(k) ? kv.get(k) : null; },
    async put(k, v) { kv.set(k, v); },
    async delete(k) { kv.delete(k); },
  },
};

// ---- ponte Node <-> Worker ------------------------------------------------
createServer(async (nodeReq, nodeRes) => {
  const url = "http://localhost:" + PORT + nodeReq.url;

  // rota extra só do dev-server: lista os e-mails "enviados"
  if (nodeReq.url.startsWith("/__emails")) {
    nodeRes.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return nodeRes.end(JSON.stringify({ emails }));
  }

  const chunks = [];
  for await (const c of nodeReq) chunks.push(c);
  const temCorpo = !["GET", "HEAD", "OPTIONS"].includes(nodeReq.method);
  const request = new Request(url, {
    method: nodeReq.method,
    headers: nodeReq.headers,
    body: temCorpo && chunks.length ? Buffer.concat(chunks) : undefined,
  });

  let res;
  try {
    res = await worker.fetch(request, ENV);
  } catch (e) {
    console.error("ERRO no worker:", e);
    nodeRes.writeHead(500, { "Content-Type": "application/json" });
    return nodeRes.end(JSON.stringify({ error: "dev_server_error", detail: String(e && e.message || e) }));
  }
  const headers = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  const corpo = Buffer.from(await res.arrayBuffer());
  console.log(`${nodeReq.method} ${nodeReq.url} -> ${res.status}`);
  nodeRes.writeHead(res.status, headers);
  nodeRes.end(corpo);
}).listen(PORT, () => {
  console.log(`Worker de desenvolvimento em http://localhost:${PORT}`);
  console.log(`  senha do app (legado): senha-local`);
  console.log(`  código de convite:     convite-local`);
  console.log(`  e-mails enviados:      http://localhost:${PORT}/__emails`);
});
