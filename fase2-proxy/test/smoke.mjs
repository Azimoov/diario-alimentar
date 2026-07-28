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
    // detecta o modo pelo system prompt que o worker enviou
    const isRotulo = String(body.system || "").includes("tabelas nutricionais");
    const conteudo = isRotulo
      ? { nome: "Whey Teste", base: "porcao", porcao_g: 30, kcal: 120, prot: 24, carb: 3, fat: 1.5, fiber: 0, observacao: "" }
      : {
          itens: [
            { nome: "arroz branco cozido", gramas: 150, confianca: "media" },
            { nome: "feijão carioca cozido", gramas: 100, confianca: "media" },
            { nome: "peito de frango grelhado", gramas: 120, confianca: "alta" },
          ],
          observacao: "",
        };
    const payload = {
      id: "msg_mock", type: "message", role: "assistant",
      model: body.model || "claude-opus-4-8",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(conteudo) }],
      usage: { input_tokens: 1500, output_tokens: 120 },
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
});

// KV simulado (contador do limite diário de fotos)
const kvStore = new Map();
const ENV = {
  // multiusuário: várias senhas separadas por vírgula
  APP_TOKEN: "token-teste, senha-maria",
  ANTHROPIC_API_KEY: "sk-ant-teste-falsa",
  ANTHROPIC_BASE_URL: `http://localhost:${MOCK_PORT}`,
  ALLOWED_ORIGINS: "http://localhost:8123,https://azimoov.github.io",
  CLAUDE_MODEL: "claude-opus-4-8",
  TIMEZONE: "America/Sao_Paulo",
  PHOTO_DAILY_LIMIT: "60",
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

    // ---- multiusuário ----
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    await check("segunda senha da lista funciona", worker.fetch(req({ token: "senha-maria" }), ENV), 200);
    await check("senha fora da lista", worker.fetch(req({ token: "senha-intrusa" }), ENV), 401);
    // contador do limite diário incrementa a cada foto analisada
    {
      const usadas = parseInt(kvStore.get("fotos:" + hoje) || "0", 10);
      const ok = usadas >= 2; // caminho feliz + senha-maria
      console.log(`${ok ? "PASS" : "FAIL"}  contador diário incrementa -> ${usadas} fotos registradas`);
      if (!ok) failed++;
    }
    // limite diário estourado -> 429
    kvStore.set("fotos:" + hoje, "60");
    await check("limite diário estourado", worker.fetch(req(), ENV), 429);
    kvStore.delete("fotos:" + hoje);

    // ---- backup na nuvem ----
    const bkReq = (opts = {}) => new Request("https://proxy.example/backup", {
      method: opts.method || "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        "X-App-Token": opts.token || "token-teste",
      },
      body: opts.method === "GET" ? undefined :
        JSON.stringify(opts.body !== undefined ? opts.body : { blob: "Y2lmcmFkbw==", iv: "aXY=", salt: "c2FsdA==", updatedAt: "2026-07-28T12:00:00Z" }),
    });
    await check("backup GET sem nada", worker.fetch(bkReq({ method: "GET", token: "senha-maria" }), ENV), 404);
    await check("backup POST grava", worker.fetch(bkReq(), ENV), 200);
    await check("backup GET devolve", worker.fetch(bkReq({ method: "GET" }), ENV), 200,
      (res, body) => (body.blob === "Y2lmcmFkbw==" && body.iv === "aXY=" && body.updatedAt === "2026-07-28T12:00:00Z") || "conteúdo diferente");
    await check("backup isolado por senha", worker.fetch(bkReq({ method: "GET", token: "senha-maria" }), ENV), 404);
    await check("backup inválido", worker.fetch(bkReq({ body: { blob: 123 } }), ENV), 400);

    // ---- base comum de alimentos ----
    const fdReq = (opts = {}) => new Request("https://proxy.example/foods" + (opts.qs || ""), {
      method: opts.method || "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-App-Token": opts.token || "token-teste" },
      body: (opts.method === "GET" || opts.method === "DELETE") ? undefined :
        JSON.stringify(opts.body !== undefined ? opts.body : { name: "Whey do Grupo", kcal: 400, prot: 80, carb: 10, fat: 5 }),
    });
    await check("foods lista vazia", worker.fetch(fdReq({ method: "GET" }), ENV), 200,
      (res, body) => (Array.isArray(body.foods) && body.foods.length === 0) || "deveria estar vazia");
    let sharedId = null;
    {
      const res = await worker.fetch(fdReq(), ENV);
      const body = await res.json();
      const ok = res.status === 200 && body.ok && body.food && body.food.name === "Whey do Grupo" && body.food.kcal === 400;
      sharedId = body.food && body.food.id;
      console.log(`${ok ? "PASS" : "FAIL"}  foods adiciona -> ${res.status} id=${sharedId}`);
      if (!ok) failed++;
    }
    await check("foods duplicado rejeitado", worker.fetch(fdReq({ body: { name: "whey do grupo", kcal: 390 } }), ENV), 409);
    await check("foods outro usuário vê", worker.fetch(fdReq({ method: "GET", token: "senha-maria" }), ENV), 200,
      (res, body) => (body.foods.length === 1 && body.foods[0].name === "Whey do Grupo") || "não viu o alimento");
    await check("foods sem kcal", worker.fetch(fdReq({ body: { name: "Sem Valor" } }), ENV), 400);
    await check("foods remove", worker.fetch(fdReq({ method: "DELETE", qs: "?id=" + sharedId }), ENV), 200);
    await check("foods removido some", worker.fetch(fdReq({ method: "GET" }), ENV), 200,
      (res, body) => body.foods.length === 0 || "ainda tem itens");

    // ---- modo rótulo (tabela nutricional) ----
    await check("modo rótulo devolve campos", worker.fetch(req({
      body: JSON.stringify({ image: IMG, mediaType: "image/jpeg", mode: "rotulo" }),
    }), ENV), 200, (res, body) =>
      (body.rotulo && body.rotulo.base === "porcao" && body.rotulo.porcao_g === 30
        && body.rotulo.kcal === 120 && body.rotulo.prot === 24) || "payload rótulo inesperado");
  } finally {
    mock.close();
    console.log(failed ? `\n${failed} teste(s) FALHARAM` : "\nTodos os testes passaram.");
    process.exit(failed ? 1 : 0);
  }
});
