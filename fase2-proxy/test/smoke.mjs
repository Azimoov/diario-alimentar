// smoke.mjs — testa o Worker localmente SEM chave real e SEM custo:
// sobe uma API da Anthropic falsa em localhost e chama o handler do Worker
// direto no Node (Request/Response nativos). Rode com: npm test
import { createServer } from "node:http";
import worker from "../src/index.js";

const MOCK_PORT = 8125;

// --- mock da API /v1/messages ---------------------------------------------
const mock = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const body = JSON.parse(data || "{}");
    // resposta no formato da Messages API, com o JSON estruturado no bloco text
    const payload = {
      id: "msg_mock", type: "message", role: "assistant",
      model: body.model || "claude-opus-4-8",
      stop_reason: "end_turn",
      content: [{
        type: "text",
        text: JSON.stringify({
          itens: [
            { nome: "arroz branco cozido", gramas: 150, confianca: "media" },
            { nome: "feijão carioca cozido", gramas: 100, confianca: "media" },
            { nome: "peito de frango grelhado", gramas: 120, confianca: "alta" },
          ],
          observacao: "",
        }),
      }],
      usage: { input_tokens: 1500, output_tokens: 120 },
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
});

// KV simulado (Fase 3)
const kvStore = new Map();
const ENV = {
  APP_TOKEN: "token-teste",
  ANTHROPIC_API_KEY: "sk-ant-teste-falsa",
  ANTHROPIC_BASE_URL: `http://localhost:${MOCK_PORT}`,
  ALLOWED_ORIGINS: "http://localhost:8123,https://azimoov.github.io",
  CLAUDE_MODEL: "claude-opus-4-8",
  TIMEZONE: "America/Sao_Paulo",
  DIARIO_KV: {
    async get(k) { return kvStore.has(k) ? kvStore.get(k) : null; },
    async put(k, v) { kvStore.set(k, v); },
  },
};

const ORIGIN = "http://localhost:8123";
const IMG = "aGVsbG8="; // base64 qualquer — o mock não valida a imagem

function req(opts = {}) {
  return new Request("https://proxy.example/analyze", {
    method: opts.method || "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: opts.origin !== undefined ? opts.origin : ORIGIN,
      ...(opts.token !== null ? { "X-App-Token": opts.token || "token-teste" } : {}),
    },
    body: opts.body !== undefined ? opts.body : JSON.stringify({ image: IMG, mediaType: "image/jpeg" }),
  });
}

let failed = 0;
async function check(name, resPromise, expectStatus, verify) {
  const res = await resPromise;
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  let ok = res.status === expectStatus;
  let extra = "";
  if (ok && verify) { const v = verify(res, body); ok = v === true; extra = ok ? "" : ` (${v})`; }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} -> ${res.status}${extra}`);
  if (!ok) { failed++; if (body) console.log("      body:", JSON.stringify(body)); }
}

mock.listen(MOCK_PORT, async () => {
  try {
    await check("preflight OPTIONS", worker.fetch(req({ method: "OPTIONS", body: null }), ENV), 204,
      (res) => res.headers.get("Access-Control-Allow-Origin") === ORIGIN || "CORS origin errado");
    await check("origem não autorizada", worker.fetch(req({ origin: "https://malicioso.example" }), ENV), 403);
    await check("sem token", worker.fetch(req({ token: null }), ENV), 401);
    await check("token errado", worker.fetch(req({ token: "errado" }), ENV), 401);
    await check("JSON inválido", worker.fetch(req({ body: "{{{" }), ENV), 400);
    await check("sem imagem", worker.fetch(req({ body: JSON.stringify({ mediaType: "image/jpeg" }) }), ENV), 400);
    await check("tipo não suportado", worker.fetch(req({ body: JSON.stringify({ image: IMG, mediaType: "image/tiff" }) }), ENV), 415);
    await check("imagem grande demais", worker.fetch(req({ body: JSON.stringify({ image: "x".repeat(7_000_001), mediaType: "image/jpeg" }) }), ENV), 413);
    await check("caminho feliz", worker.fetch(req(), ENV), 200, (res, body) =>
      (Array.isArray(body.itens) && body.itens.length === 3
        && body.itens[0].nome === "arroz branco cozido" && body.itens[0].gramas === 150
        && body.modelo === "claude-opus-4-8") || "payload inesperado");
    await check("GET bloqueado (foto)", worker.fetch(req({ method: "GET", body: null }), ENV), 405);

    // ---- Fase 3: /status ----
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const statusReq = (opts = {}) => new Request("https://proxy.example/status", {
      method: opts.method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.origin !== null ? { Origin: opts.origin || ORIGIN } : {}),
        ...(opts.token !== null ? { "X-App-Token": opts.token || "token-teste" } : {}),
      },
      body: opts.method === "GET" ? undefined : (opts.body !== undefined ? opts.body : JSON.stringify({ date: hoje, kcal: 1450, goal: 2230, prot: 82, protGoal: 158 })),
    });

    await check("status GET sem dados", worker.fetch(statusReq({ method: "GET", origin: null }), ENV), 200);
    await check("status POST grava", worker.fetch(statusReq(), ENV), 200);
    // GET sem Origin (como o Atalho da Apple) e com texto certo
    {
      const res = await worker.fetch(statusReq({ method: "GET", origin: null }), ENV);
      const text = await res.text();
      const ok = res.status === 200
        && text.includes("1.450") && text.includes("780") && text.includes("2.230")
        && text.includes("Proteína: 82 de 158");
      console.log(`${ok ? "PASS" : "FAIL"}  status GET frase completa -> ${res.status} "${text}"`);
      if (!ok) failed++;
    }
    await check("status GET sem token", worker.fetch(statusReq({ method: "GET", token: null, origin: null }), ENV), 401);
    await check("status POST sem kcal", worker.fetch(statusReq({ body: JSON.stringify({ date: hoje }) }), ENV), 400);
    // dado de ontem -> mensagem de "nenhum registro hoje"
    {
      kvStore.set("status", JSON.stringify({ date: "2020-01-01", kcal: 900, goal: 2230 }));
      const res = await worker.fetch(statusReq({ method: "GET", origin: null }), ENV);
      const text = await res.text();
      const ok = res.status === 200 && text.includes("Nenhum registro hoje");
      console.log(`${ok ? "PASS" : "FAIL"}  status GET dado velho -> ${res.status} "${text.slice(0, 60)}…"`);
      if (!ok) failed++;
    }
  } finally {
    mock.close();
    console.log(failed ? `\n${failed} teste(s) FALHARAM` : "\nTodos os testes passaram.");
    process.exit(failed ? 1 : 0);
  }
});
