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
    const isAnalise = String(body.system || "").includes("dados de saúde PESSOAIS");
    const texto = isAnalise
      ? "VISÃO GERAL\n– Teste local do mock.\n\nEXAMES\n– Sem dados suficientes."
      : JSON.stringify(isRotulo
        ? { nome: "Whey Teste", base: "porcao", porcao_g: 30, kcal: 120, prot: 24, carb: 3, fat: 1.5, fiber: 0, observacao: "" }
        : {
            itens: [
              { nome: "arroz branco cozido", gramas: 150, confianca: "media" },
              { nome: "feijão carioca cozido", gramas: 100, confianca: "media" },
              { nome: "peito de frango grelhado", gramas: 120, confianca: "alta" },
            ],
            observacao: "",
          });
    const payload = {
      id: "msg_mock", type: "message", role: "assistant",
      model: body.model || "claude-opus-4-8",
      stop_reason: "end_turn",
      content: [{ type: "text", text: texto }],
      usage: { input_tokens: 1500, output_tokens: 120 },
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
});

// --- mock do Resend: guarda os e-mails "enviados" p/ o teste ler o link ----
const MAIL_PORT = 8126;
const emailsEnviados = [];
const mailMock = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    emailsEnviados.push(JSON.parse(data || "{}"));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "email_mock" }));
  });
});

// KV simulado (contador do limite diário de fotos, contas, sessões, dados)
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
  // contas
  DATA_KEY: "chave-de-dados-de-teste-nao-usar-em-producao",
  INVITE_CODE: "convite-teste, convite-maria",
  RESEND_API_KEY: "re_teste_falsa",
  RESEND_API_URL: `http://localhost:${MAIL_PORT}`,
  MAIL_FROM: "Highlander <teste@example.com>",
  APP_BASE_URL: "https://azimoov.github.io/diario-alimentar/",
  DIARIO_KV: {
    async get(k) { return kvStore.has(k) ? kvStore.get(k) : null; },
    async put(k, v) { kvStore.set(k, v); },
    async delete(k) { kvStore.delete(k); },
  },
};

// mesmo PBKDF2 que o navegador faz (js/auth.js) — a senha nunca vai ao servidor
async function derivarAuthKey(email, senha) {
  const te = new TextEncoder();
  const salt = await crypto.subtle.digest("SHA-256", te.encode("highlander-auth:" + email.trim().toLowerCase()));
  const base = await crypto.subtle.importKey("raw", te.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, base, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ORIGIN = "http://localhost:8123";
const IMG = "aGVsbG8="; // base64 qualquer — o mock não valida a imagem

function req(opts = {}) {
  return new Request("https://proxy.example/", {
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

mailMock.listen(MAIL_PORT);
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

    // ---- análise inteligente (/analyze) ----
    const anReq = (opts = {}) => new Request("https://proxy.example/analyze", {
      method: opts.method || "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-App-Token": opts.token || "token-teste" },
      body: opts.method === "GET" ? undefined :
        (opts.body !== undefined ? opts.body : JSON.stringify({ dados: { perfil: { idade: 40 }, examesLaboratoriais: [] } })),
    });
    await check("análise caminho feliz", worker.fetch(anReq(), ENV), 200, (res, body) =>
      (typeof body.analise === "string" && body.analise.includes("VISÃO GERAL")
        && body.modelo === "claude-opus-4-8") || "payload de análise inesperado");
    await check("análise sem dados", worker.fetch(anReq({ body: JSON.stringify({}) }), ENV), 400);
    await check("análise GET bloqueado", worker.fetch(anReq({ method: "GET" }), ENV), 405);
    await check("análise resumo grande demais", worker.fetch(anReq({
      body: JSON.stringify({ dados: { blob: "x".repeat(200_001) } }),
    }), ENV), 413);
    {
      const usadas = parseInt(kvStore.get("analises:" + hoje) || "0", 10);
      const ok = usadas === 1; // só o caminho feliz consome cota
      console.log(`${ok ? "PASS" : "FAIL"}  contador de análises incrementa -> ${usadas}`);
      if (!ok) failed++;
    }
    kvStore.set("analises:" + hoje, "20");
    await check("análise limite diário", worker.fetch(anReq(), ENV), 429);
    kvStore.delete("analises:" + hoje);

    // =====================================================================
    // CONTAS: cadastro, login, sessão, dados na nuvem e recuperação
    // =====================================================================
    const EMAIL = "daniel@example.com";
    const SENHA = "senha-boa-do-daniel";
    const authKey = await derivarAuthKey(EMAIL, SENHA);

    // cada teste manda um IP próprio: o rate-limit é por IP e não deve fazer
    // um teste derrubar o outro (o limite em si é testado à parte, no fim)
    let ipSeq = 0;
    const authReq = (rota, body, opts = {}) => new Request("https://proxy.example/auth/" + rota, {
      method: opts.method || "POST",
      headers: {
        "Content-Type": "application/json", Origin: ORIGIN,
        "CF-Connecting-IP": opts.ip || "10.0.0." + (++ipSeq),
        ...(opts.session ? { "X-Session": opts.session } : {}),
      },
      body: opts.method === "GET" ? undefined : JSON.stringify(body || {}),
    });

    // rotas /auth/* são públicas (não exigem senha do app)
    await check("signup sem convite", worker.fetch(authReq("signup", { email: EMAIL, authKey }), ENV), 403);
    await check("signup convite errado", worker.fetch(authReq("signup", { email: EMAIL, authKey, invite: "chute" }), ENV), 403);
    await check("signup e-mail inválido", worker.fetch(authReq("signup", { email: "naoehemail", authKey, invite: "convite-teste" }), ENV), 400);
    await check("signup sem authKey (senha crua barrada)", worker.fetch(authReq("signup", { email: EMAIL, invite: "convite-teste", password: SENHA }), ENV), 400);

    let sessao = null;
    {
      const res = await worker.fetch(authReq("signup", { email: EMAIL, authKey, invite: "convite-teste" }), ENV);
      const body = await res.json();
      sessao = body.session;
      const ok = res.status === 200 && typeof sessao === "string" && sessao.length === 64 && body.email === EMAIL;
      console.log(`${ok ? "PASS" : "FAIL"}  signup cria conta -> ${res.status}`);
      if (!ok) { failed++; console.log("      body:", JSON.stringify(body)); }
    }
    await check("signup duplicado", worker.fetch(authReq("signup", { email: EMAIL, authKey, invite: "convite-teste" }), ENV), 409);
    // a senha crua NUNCA chega ao servidor: nada no KV pode conter ela
    {
      const dump = [...kvStore.values()].join("|");
      const ok = !dump.includes(SENHA) && !dump.includes(authKey);
      console.log(`${ok ? "PASS" : "FAIL"}  KV não guarda senha nem authKey`);
      if (!ok) failed++;
    }

    await check("login senha errada", worker.fetch(authReq("login", { email: EMAIL, authKey: await derivarAuthKey(EMAIL, "errada") }), ENV), 401);
    await check("login e-mail inexistente", worker.fetch(authReq("login", { email: "ninguem@example.com", authKey }), ENV), 401);
    await check("login correto", worker.fetch(authReq("login", { email: EMAIL, authKey }), ENV), 200,
      (res, body) => (typeof body.session === "string" && body.email === EMAIL) || "sem sessão");
    await check("me sem sessão", worker.fetch(authReq("me", null, { method: "GET" }), ENV), 401);
    await check("me com sessão", worker.fetch(authReq("me", null, { method: "GET", session: sessao }), ENV), 200,
      (res, body) => body.email === EMAIL || "e-mail diferente");
    await check("me com sessão inválida", worker.fetch(authReq("me", null, { method: "GET", session: "x".repeat(64) }), ENV), 401);

    // ---- dados da conta: PUT/GET com sessão ----
    const dataReq = (opts = {}) => new Request("https://proxy.example/account/data", {
      method: opts.method || "PUT",
      headers: {
        "Content-Type": "application/json", Origin: ORIGIN,
        ...(opts.session !== null ? { "X-Session": opts.session || sessao } : {}),
        ...(opts.token ? { "X-App-Token": opts.token } : {}),
      },
      body: opts.method === "GET" ? undefined : JSON.stringify(opts.body !== undefined ? opts.body : { state: JSON.stringify({ weights: { "2026-08-01": 82.4 }, customFoods: [{ name: "Whey" }] }) }),
    });
    await check("dados GET antes de gravar", worker.fetch(dataReq({ method: "GET" }), ENV), 404);
    await check("dados sem sessão", worker.fetch(dataReq({ session: null }), ENV), 401);
    await check("dados com senha do app (sem conta) barrado", worker.fetch(dataReq({ session: null, token: "token-teste" }), ENV), 401);
    await check("dados PUT grava", worker.fetch(dataReq(), ENV), 200);
    await check("dados GET devolve igual", worker.fetch(dataReq({ method: "GET" }), ENV), 200, (res, body) => {
      try {
        const st = JSON.parse(body.state);
        return (st.weights["2026-08-01"] === 82.4 && st.customFoods[0].name === "Whey") || "estado diferente";
      } catch { return "state não é JSON"; }
    });
    // cifrado em repouso: o KV não pode conter os dados em texto claro
    {
      const dump = [...kvStore.values()].join("|");
      const ok = !dump.includes("82.4") && !dump.includes("Whey\"");
      console.log(`${ok ? "PASS" : "FAIL"}  dados cifrados em repouso no KV`);
      if (!ok) failed++;
    }
    await check("dados grandes demais", worker.fetch(dataReq({ body: { state: "x".repeat(8_000_001) } }), ENV), 413);

    // ---- foto/análise funcionam SÓ com a sessão (zero configuração) ----
    {
      const fotoComSessao = new Request("https://proxy.example/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Session": sessao },
        body: JSON.stringify({ image: IMG, mediaType: "image/jpeg" }),
      });
      await check("foto autenticada pela sessão", worker.fetch(fotoComSessao, ENV), 200);
    }

    // ---- recuperação de senha por e-mail ----
    emailsEnviados.length = 0;
    await check("forgot e-mail inexistente responde igual", worker.fetch(authReq("forgot", { email: "ninguem@example.com" }), ENV), 200);
    {
      const ok = emailsEnviados.length === 0;
      console.log(`${ok ? "PASS" : "FAIL"}  forgot não envia e-mail p/ conta inexistente (sem enumeração)`);
      if (!ok) failed++;
    }
    await check("forgot conta real", worker.fetch(authReq("forgot", { email: EMAIL }), ENV), 200);
    let resetToken = null;
    {
      const msg = emailsEnviados[emailsEnviados.length - 1];
      const m = msg && /#recuperar=([0-9a-f]{64})/.exec(msg.text || "");
      resetToken = m && m[1];
      const ok = !!resetToken && msg.to[0] === EMAIL && /Redefinir/.test(msg.subject);
      console.log(`${ok ? "PASS" : "FAIL"}  e-mail de recuperação com link válido`);
      if (!ok) { failed++; console.log("      msg:", JSON.stringify(msg)); }
    }
    await check("reset token inválido", worker.fetch(authReq("reset", { token: "y".repeat(64), authKey }), ENV), 400);
    const NOVA = "senha-nova-anotada";
    const authKeyNova = await derivarAuthKey(EMAIL, NOVA);
    await check("reset troca a senha", worker.fetch(authReq("reset", { token: resetToken, authKey: authKeyNova }), ENV), 200,
      (res, body) => (typeof body.session === "string" && body.email === EMAIL) || "sem sessão nova");
    await check("reset link é de uso único", worker.fetch(authReq("reset", { token: resetToken, authKey: authKeyNova }), ENV), 400);
    await check("senha antiga não entra mais", worker.fetch(authReq("login", { email: EMAIL, authKey }), ENV), 401);
    let sessaoNova = null;
    {
      const res = await worker.fetch(authReq("login", { email: EMAIL, authKey: authKeyNova }), ENV);
      const body = await res.json();
      sessaoNova = body.session;
      const ok = res.status === 200 && !!sessaoNova;
      console.log(`${ok ? "PASS" : "FAIL"}  senha nova entra -> ${res.status}`);
      if (!ok) failed++;
    }
    // O PONTO CRÍTICO: depois de redefinir a senha, os dados continuam lá
    await check("dados sobrevivem à troca de senha", worker.fetch(dataReq({ method: "GET", session: sessaoNova }), ENV), 200, (res, body) => {
      try { return JSON.parse(body.state).weights["2026-08-01"] === 82.4 || "dados diferentes"; }
      catch { return "state inválido"; }
    });

    // ---- trocar senha estando logado ----
    await check("trocar senha com atual errada", worker.fetch(authReq("password", { authKeyAtual: authKey, authKeyNova: authKey }, { session: sessaoNova }), ENV), 401);
    await check("trocar senha logado", worker.fetch(authReq("password", { authKeyAtual: authKeyNova, authKeyNova: authKey }, { session: sessaoNova }), ENV), 200);
    await check("entra com a senha trocada", worker.fetch(authReq("login", { email: EMAIL, authKey }), ENV), 200);

    // ---- logout invalida a sessão ----
    await check("logout", worker.fetch(authReq("logout", null, { session: sessaoNova }), ENV), 200);
    await check("sessão morta não abre dados", worker.fetch(dataReq({ method: "GET", session: sessaoNova }), ENV), 401);

    // ---- o backup LEGADO continua funcionando (e exige a senha antiga) ----
    await check("backup legado segue vivo", worker.fetch(bkReq({ method: "GET" }), ENV), 200,
      (res, body) => body.blob === "Y2lmcmFkbw==" || "backup antigo mudou");
    await check("backup legado não aceita só sessão", worker.fetch(new Request("https://proxy.example/backup", {
      method: "GET", headers: { Origin: ORIGIN, "X-Session": sessao },
    }), ENV), 401);

    // ---- MAIL_TO_OVERRIDE: recuperação de OUTRA pessoa cai na caixa do dono ----
    {
      const EMAIL_OUTRO = "maria@example.com";
      const akMaria = await derivarAuthKey(EMAIL_OUTRO, "senha-da-maria");
      await worker.fetch(authReq("signup", { email: EMAIL_OUTRO, authKey: akMaria, invite: "convite-maria" }), ENV);
      emailsEnviados.length = 0;
      const ENV_OVERRIDE = { ...ENV, MAIL_TO_OVERRIDE: "dono@example.com" };
      await check("forgot de outra conta com override", worker.fetch(authReq("forgot", { email: EMAIL_OUTRO }), ENV_OVERRIDE), 200);
      const msg = emailsEnviados[emailsEnviados.length - 1];
      const okDestino = msg && msg.to[0] === "dono@example.com";
      const okIdentifica = msg && msg.subject.includes(EMAIL_OUTRO) && (msg.text || "").includes(EMAIL_OUTRO);
      const temLink = msg && /#recuperar=([0-9a-f]{64})/.test(msg.text || "");
      console.log(`${okDestino && okIdentifica && temLink ? "PASS" : "FAIL"}  override manda p/ o dono dizendo de quem é a conta`);
      if (!(okDestino && okIdentifica && temLink)) { failed++; console.log("      msg:", JSON.stringify(msg)); }

      // o link redirecionado funciona de verdade e é da conta certa
      const tk = (/#recuperar=([0-9a-f]{64})/.exec(msg.text || "") || [])[1];
      const akNovaMaria = await derivarAuthKey(EMAIL_OUTRO, "maria-senha-nova");
      await check("link repassado redefine a senha da pessoa certa",
        worker.fetch(authReq("reset", { token: tk, authKey: akNovaMaria }), ENV_OVERRIDE), 200,
        (res, body) => body.email === EMAIL_OUTRO || "conta errada");
      await check("a pessoa entra com a senha nova",
        worker.fetch(authReq("login", { email: EMAIL_OUTRO, authKey: akNovaMaria }), ENV), 200);

      // sem override, volta a ir para o e-mail da própria pessoa
      emailsEnviados.length = 0;
      await check("sem override vai p/ o e-mail da conta", worker.fetch(authReq("forgot", { email: EMAIL_OUTRO }), ENV), 200);
      const msg2 = emailsEnviados[emailsEnviados.length - 1];
      const ok2 = msg2 && msg2.to[0] === EMAIL_OUTRO;
      console.log(`${ok2 ? "PASS" : "FAIL"}  sem override o destino é a própria pessoa`);
      if (!ok2) failed++;
    }

    // ---- rate-limit de cadastro: protege o convite de força bruta ----
    {
      const IP_FIXO = "203.0.113.9";
      let ultimo = 0;
      for (let i = 0; i < 7; i++) {
        const res = await worker.fetch(authReq("signup", { email: `x${i}@example.com`, authKey, invite: "chute" }, { ip: IP_FIXO }), ENV);
        ultimo = res.status;
      }
      const ok = ultimo === 429;
      console.log(`${ok ? "PASS" : "FAIL"}  cadastro em rajada é barrado -> ${ultimo}`);
      if (!ok) failed++;
    }
  } finally {
    mock.close();
    mailMock.close();
    console.log(failed ? `\n${failed} teste(s) FALHARAM` : "\nTodos os testes passaram.");
    process.exit(failed ? 1 : 0);
  }
});
