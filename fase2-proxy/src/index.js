// Proxy da Fase 2 (foto) — Cloudflare Worker, com suporte a múltiplos usuários.
// Recebe uma foto (base64) do app, chama a API da Anthropic (visão) e devolve
// a lista de alimentos estimados. A CHAVE DA API fica em segredo no Worker
// (env.ANTHROPIC_API_KEY) — jamais no front-end.
//
// Multiusuário: o segredo APP_TOKEN aceita VÁRIAS senhas separadas por
// vírgula ("senha-daniel,senha-maria"). Cada pessoa recebe a sua; para
// revogar alguém, basta reescrever o segredo sem a senha dela.
// Custo protegido: limite diário de fotos p/ todo o grupo (PHOTO_DAILY_LIMIT,
// contado no KV DIARIO_KV) — além do limite de gasto no console da Anthropic.
//
// Proteções: senhas (X-App-Token); CORS restrito às origens do app para
// chamadas de navegador; limite de tamanho/tipo de imagem; rate-limit por IP.

import Anthropic from "@anthropic-ai/sdk";

// Saída estruturada: o modelo é OBRIGADO a devolver JSON neste formato.
const SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: {
            type: "string",
            description: "Nome do alimento em português brasileiro, estilo TACO (ex.: 'arroz branco cozido', 'feijão carioca cozido', 'peito de frango grelhado')",
          },
          gramas: { type: "number", description: "Peso estimado em gramas da porção visível" },
          confianca: { type: "string", enum: ["alta", "media", "baixa"] },
          produto: {
            type: ["string", "null"],
            description: "Se este item for a embalagem/rótulo de um produto da lista PRODUTOS CADASTRADOS fornecida, copie aqui o nome EXATO daquela lista. Caso contrário, null.",
          },
        },
        required: ["nome", "gramas", "confianca", "produto"],
        additionalProperties: false,
      },
    },
    observacao: {
      type: "string",
      description: "Aviso curto se algo ficou incerto (prato fundo, comida misturada, etc). String vazia se nada a observar.",
    },
  },
  required: ["itens", "observacao"],
  additionalProperties: false,
};

// ---- modo "rotulo": lê tabela nutricional p/ cadastro de alimento ----
const SCHEMA_ROTULO = {
  type: "object",
  properties: {
    nome: { type: ["string", "null"], description: "Nome do produto, se visível na embalagem" },
    base: { type: "string", enum: ["100g", "porcao", "desconhecida"], description: "A que se referem os valores extraídos" },
    porcao_g: { type: ["number", "null"], description: "Tamanho da porção em g (ou mL), quando base=porcao" },
    kcal: { type: ["number", "null"] },
    prot: { type: ["number", "null"] },
    carb: { type: ["number", "null"] },
    fat: { type: ["number", "null"] },
    fiber: { type: ["number", "null"] },
    observacao: { type: "string" },
  },
  required: ["nome", "base", "porcao_g", "kcal", "prot", "carb", "fat", "fiber", "observacao"],
  additionalProperties: false,
};

const SYSTEM_ROTULO = `Você lê FOTOS de tabelas nutricionais (rótulos de alimentos brasileiros no padrão ANVISA, ou importados) para preencher um cadastro.

Regras de honestidade (crítico):
- Extraia SOMENTE o que está legível na foto. NUNCA complete de memória nem estime valores que não aparecem.
- Rótulos novos (RDC 429/2020) têm coluna "por 100 g": prefira essa coluna e use base="100g".
- Rótulos antigos só trazem a porção: use base="porcao", reporte os valores da porção e porcao_g (ex.: "Porção de 30 g" → 30).
- Valor energético: o número em kcal (ignore o kJ).
- prot = proteínas; carb = carboidratos totais; fat = gorduras totais; fiber = fibra alimentar. Tudo em gramas.
- Campo ilegível ou ausente no rótulo: null.
- Se a foto NÃO for uma tabela nutricional legível: base="desconhecida", campos null, explicando em observacao.
- observacao: avisos curtos ("porção em mL", "fibra ilegível"). String vazia se nada a observar.`;

const SYSTEM = `Você analisa fotos de refeições (comida majoritariamente brasileira) para um diário alimentar pessoal.

Tarefa: identificar cada alimento visível e estimar o peso em gramas da porção.

Regras de honestidade:
- Estimar gramas por foto é impreciso; seja realista, não chute com falsa precisão.
- Use "confianca": "alta" só quando o alimento é inequívoco e a porção bem visível; "media" no caso comum; "baixa" quando você está adivinhando (comida coberta, misturada, ângulo ruim).
- Se a foto não contém comida, devolva "itens" vazio e explique em "observacao".
- Nomes em português brasileiro, minúsculas, no estilo da tabela TACO (alimento + preparo), ex.: "arroz branco cozido", "feijão preto cozido", "carne bovina patinho grelhado", "ovo frito", "banana prata".
- Não liste temperos invisíveis nem invente acompanhamentos que não aparecem.
- Pratos compostos (estrogonofe, lasanha): liste como um item único com o nome do prato.

Produtos cadastrados pelo usuário:
- Se a foto mostrar a EMBALAGEM/RÓTULO de um produto que está na lista "PRODUTOS CADASTRADOS" (quando fornecida), preencha "produto" com o nome EXATO como aparece na lista — assim o app reaproveita os valores que o usuário já cadastrou.
- Só faça isso quando tiver certeza razoável de que é aquele produto (marca/nome batem). Na dúvida, "produto": null.
- Mesmo com "produto" preenchido, estime as gramas normalmente (o quanto será consumido).`;

// ---- backup na nuvem (cofre por senha) ------------------------------------
// POST /backup  {blob, iv, salt, v, updatedAt}  <- estado CIFRADO no aparelho
// GET  /backup  -> devolve o último backup da senha em uso (404 se não há)
// Cada senha do app tem seu próprio cofre (chave = SHA-256 da senha) — em
// multiusuário, cada pessoa só alcança o próprio backup.
async function tokenKey(token) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return "backup:" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleBackup(request, env, json, token) {
  if (!env.DIARIO_KV) {
    return json({ error: "server_not_configured", detail: "KV não configurado." }, 500);
  }
  const key = await tokenKey(token);

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body.blob !== "string" || !body.blob || typeof body.iv !== "string" || typeof body.salt !== "string") {
      return json({ error: "invalid_backup" }, 400);
    }
    const record = JSON.stringify({
      v: 1, blob: body.blob, iv: body.iv, salt: body.salt,
      updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString(),
      savedAt: new Date().toISOString(),
    });
    if (record.length > 4_000_000) return json({ error: "backup_too_large", detail: "Backup acima de ~4 MB." }, 413);
    await env.DIARIO_KV.put(key, record);
    return json({ ok: true, bytes: record.length });
  }

  if (request.method === "GET") {
    const raw = await env.DIARIO_KV.get(key);
    if (!raw) return json({ error: "no_backup", detail: "Nenhum backup encontrado para esta senha." }, 404);
    return json(JSON.parse(raw)); // re-serializa p/ sair com os headers CORS
  }

  return json({ error: "method_not_allowed" }, 405);
}

// ---- base comum de alimentos --------------------------------------------
// GET    /foods         -> lista todos os alimentos compartilhados
// POST   /foods {name, kcal, prot?, carb?, fat?, fiber?} -> adiciona
// DELETE /foods?id=sXX  -> remove (modelo de confiança: qualquer usuário)
// Guardado num único registro KV; valores vêm do usuário (rótulo/manual) e
// aparecem no app com etiqueta "comum".
const FOODS_KEY = "foods-comum";
const normBR = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

async function handleFoods(request, env, json, token, url) {
  if (!env.DIARIO_KV) return json({ error: "server_not_configured", detail: "KV não configurado." }, 500);

  if (request.method === "GET") {
    const raw = await env.DIARIO_KV.get(FOODS_KEY);
    return json({ foods: raw ? JSON.parse(raw) : [] });
  }

  if (request.method === "POST") {
    let b;
    try { b = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const nm = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
    const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null);
    const kcal = num(b.kcal);
    if (!nm || kcal == null) return json({ error: "invalid_food", detail: "Nome e kcal são obrigatórios." }, 400);

    const raw = await env.DIARIO_KV.get(FOODS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (list.some((f) => normBR(f.name) === normBR(nm))) {
      return json({ error: "duplicate", detail: "Já existe um alimento com esse nome na base comum." }, 409);
    }
    if (list.length >= 500) return json({ error: "catalog_full", detail: "Base comum cheia (máx. 500)." }, 413);

    // atribuição anônima: 6 hex da senha de quem criou (p/ auditoria leve)
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const por = [...new Uint8Array(hash)].slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("");
    const food = {
      id: "s" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
      name: nm, kcal,
      prot: num(b.prot), carb: num(b.carb), fat: num(b.fat), fiber: num(b.fiber),
      por, criadoEm: new Date().toISOString(),
    };
    list.push(food);
    await env.DIARIO_KV.put(FOODS_KEY, JSON.stringify(list));
    return json({ ok: true, food });
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "missing_id" }, 400);
    const raw = await env.DIARIO_KV.get(FOODS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const nova = list.filter((f) => f.id !== id);
    if (nova.length === list.length) return json({ error: "not_found" }, 404);
    await env.DIARIO_KV.put(FOODS_KEY, JSON.stringify(nova));
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
}

// ---- análise inteligente (exames × dieta × métricas) ----------------------
// POST /analyze {dados: {...}} — o app monta um RESUMO numérico local
// (exames anotados, médias da dieta, peso/composição, métricas do relógio)
// e recebe uma leitura em TEXTO PURO. Sem imagem: custo bem menor que a foto.
const SYSTEM_ANALISE = `Você analisa dados de saúde PESSOAIS que o próprio dono coletou num app local: diário alimentar (kcal/macros), peso e composição corporal, exames laboratoriais e de imagem anotados à mão, métricas de Apple Watch/iPhone e lembretes de exames.

Sua tarefa: uma leitura honesta e útil, cruzando as fontes. Você NÃO é o médico da pessoa; NÃO faça diagnóstico nem prescreva tratamento, suplemento ou dose.

Formato da resposta (obrigatório):
- Português do Brasil, TEXTO PURO: sem markdown, sem asteriscos, sem tabelas.
- Seções com título em MAIÚSCULAS, nesta ordem: VISÃO GERAL, EXAMES, CRUZAMENTOS, PARA LEVAR AO MÉDICO, LACUNAS.
- Itens começam com "– ". Máximo ~500 palavras no total.

Regras de honestidade (crítico):
- Use SOMENTE os dados recebidos. Não invente valores nem "faixas normais": se um exame veio sem faixa de referência anotada, diga isso e não classifique o valor.
- "Fora da faixa" = comparado apenas com refMin/refMax que o usuário anotou do próprio laudo.
- Correlação não é causa — deixe isso claro ao cruzar dieta × exames.
- Dados insuficientes (poucos dias de diário, exame único sem histórico): aponte a limitação em vez de especular.
- Métricas de relógio são estimativas de sensor; trate como tendência, não medida exata.
- Em PARA LEVAR AO MÉDICO, liste perguntas e temas concretos (incluindo exames com lembrete vencido), sem alarmismo.`;

async function handleAnalyze(request, env, json, uid) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const cred = await resolverChave(env, uid);
  if (cred.erro) return json(cred.erro, cred.erro.error === "no_api_key" ? 402 : 500);
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  if (rateLimited("analyze:" + ip, 6)) return json({ error: "rate_limited", detail: "Muitas análises em pouco tempo — aguarde um minuto." }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const dados = body && body.dados;
  if (!dados || typeof dados !== "object") return json({ error: "missing_data", detail: "Envie {dados: {…}}." }, 400);
  const texto = JSON.stringify(dados);
  if (texto.length > 200_000) return json({ error: "data_too_large", detail: "Resumo grande demais (~200 KB máx)." }, 413);

  // limite diário — por CONTA quando há login (cada um protege o próprio
  // bolso), global no caminho legado da senha do app
  if (env.DIARIO_KV) {
    const tz = env.TIMEZONE || "America/Sao_Paulo";
    const day = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const quotaKey = "analises:" + (uid ? uid + ":" : "") + day;
    const used = parseInt((await env.DIARIO_KV.get(quotaKey)) || "0", 10);
    const limit = parseInt(env.ANALYSIS_DAILY_LIMIT || "20", 10);
    if (used >= limit) {
      return json({ error: "daily_limit", detail: `Limite de ${limit} análises por dia atingido — tente amanhã.` }, 429);
    }
    await env.DIARIO_KV.put(quotaKey, String(used + 1), { expirationTtl: 172800 });
  }

  const client = new Anthropic({
    apiKey: cred.chave,
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
    fetch: globalThis.fetch.bind(globalThis),
  });
  let msg;
  try {
    msg = await client.messages.create({
      model: env.CLAUDE_MODEL || "claude-opus-4-8",
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      system: SYSTEM_ANALISE,
      messages: [{ role: "user", content: "DADOS (JSON):\n" + texto }],
    });
  } catch (err) {
    console.log("ERRO API /analyze:", err && err.status, String((err && err.message) || err).slice(0, 300));
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "upstream_rate_limited", detail: "API ocupada — tente de novo em instantes." }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "upstream_auth", detail: "Chave da API inválida no Worker." }, 500);
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: "upstream_error", status: err.status, detail: err.message }, 502);
    }
    return json({ error: "upstream_error", detail: String((err && err.message) || err) }, 502);
  }
  if (msg.stop_reason === "refusal") {
    console.log("RECUSA /analyze:", JSON.stringify(msg.stop_details || null));
    return json({ error: "refused", detail: "O modelo recusou analisar estes dados." }, 502);
  }
  const analise = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!analise) {
    return json({ error: "empty_response", detail: "Resposta sem conteúdo (stop: " + msg.stop_reason + ")." }, 502);
  }
  return json({ analise, modelo: msg.model });
}

// ===========================================================================
// CONTAS (login por e-mail, com recuperação de senha)
// ===========================================================================
// Modelo escolhido pelo dono do app: RECUPERÁVEL. Os dados são cifrados em
// repouso com uma chave DO SERVIDOR (secret DATA_KEY), não com a senha do
// usuário — é isso que permite "esqueci minha senha" funcionar de verdade.
// Consequência honesta: quem controla o Worker consegue ler os dados. O
// caminho antigo (/backup com X-App-Token, cifrado no aparelho) continua
// intacto e é o único que o servidor NÃO consegue abrir.
//
// A senha nunca chega aqui: o navegador faz PBKDF2 (250k, SHA-256, sal
// derivado do e-mail) e envia só o `authKey`. O servidor guarda
// HMAC(pepper, authKey) — assim um vazamento do KV não dá login a ninguém,
// e o custo de CPU por requisição fica perto de zero (importante: o plano
// grátis do Workers corta em 10 ms de CPU, e PBKDF2 no servidor estouraria).
const TE = new TextEncoder();
const SESSION_TTL = 90 * 24 * 3600;   // 90 dias
const RESET_TTL = 30 * 60;            // 30 minutos

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(s) {
  return hex(await crypto.subtle.digest("SHA-256", TE.encode(s)));
}
async function hmacRaw(secret, msg) {
  const key = await crypto.subtle.importKey("raw", TE.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, TE.encode(msg));
}
async function hmacHex(secret, msg) {
  return hex(await hmacRaw(secret, msg));
}
// comparação de tempo constante (evita vazar a senha por timing)
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}
function emailValido(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160;
}
// authKey é o resultado do PBKDF2 do navegador: 64 hex (32 bytes)
function authKeyValido(k) {
  return typeof k === "string" && /^[0-9a-f]{64}$/.test(k);
}

// ---- chave de dados por usuário, derivada do secret do servidor ----
async function userDataKey(env, uid) {
  const raw = await hmacRaw(env.DATA_KEY, "data-key:" + uid);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptText(env, uid, texto) {
  const key = await userDataKey(env, uid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, TE.encode(texto));
  return { iv: bufToB64(iv), blob: bufToB64(ct) };
}
function bufToB64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
  return btoa(s);
}
function b64ToBuf(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function decryptText(env, uid, rec) {
  const key = await userDataKey(env, uid);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(rec.iv) }, key, b64ToBuf(rec.blob));
  return new TextDecoder().decode(pt);
}

// ---- chave da API DE CADA PESSOA (BYOK) ----------------------------------
// Cada conta guarda a própria chave da Anthropic, cifrada com a chave de
// dados daquele usuário. Assim o custo de foto/análise cai na conta de quem
// usa, não na de quem hospeda. A chave NUNCA volta para o navegador (só um
// pedacinho do fim, p/ a pessoa reconhecer qual é) e NUNCA entra no backup.
async function getUserApiKey(env, uid) {
  const raw = await env.DIARIO_KV.get("apikey:" + uid);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    return { chave: await decryptText(env, uid, rec), hint: rec.hint, updatedAt: rec.updatedAt };
  } catch { return null; }
}
async function setUserApiKey(env, uid, chave) {
  const cif = await encryptText(env, uid, chave);
  await env.DIARIO_KV.put("apikey:" + uid, JSON.stringify({
    ...cif, hint: chave.slice(-4), updatedAt: new Date().toISOString(),
  }));
}
// confere a chave contra a própria API antes de guardar (evita descobrir que
// está errada só na hora de tirar a foto). GET /v1/models é barato.
async function validarChaveAnthropic(env, chave) {
  const base = (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
  let res;
  try {
    res = await fetch(base + "/v1/models?limit=1", {
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01" },
    });
  } catch (e) {
    return { ok: false, detail: "Não consegui falar com a API da Anthropic agora. Tente de novo." };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, detail: "A Anthropic recusou esta chave. Confira se copiou inteira e se ela não foi revogada." };
  }
  if (!res.ok) return { ok: false, detail: "A API respondeu HTTP " + res.status + " ao testar a chave." };
  return { ok: true };
}

async function handleApiKey(request, env, json, uid) {
  if (!env.DIARIO_KV) return json({ error: "server_not_configured", detail: "KV não configurado." }, 500);

  if (request.method === "GET") {
    const k = await getUserApiKey(env, uid);
    return json({ configured: !!k, hint: k ? k.hint : null, updatedAt: k ? k.updatedAt : null });
  }

  if (request.method === "PUT" || request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const chave = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(chave)) {
      return json({ error: "invalid_key", detail: "Isso não parece uma chave da Anthropic (ela começa com sk-ant-)." }, 400);
    }
    const teste = await validarChaveAnthropic(env, chave);
    if (!teste.ok) return json({ error: "key_rejected", detail: teste.detail }, 400);
    await setUserApiKey(env, uid, chave);
    return json({ ok: true, hint: chave.slice(-4) });
  }

  if (request.method === "DELETE") {
    await env.DIARIO_KV.delete("apikey:" + uid);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
}

// Qual chave usar nesta requisição: a da conta de quem chamou. O caminho
// legado (senha do app, sem conta) continua usando a chave do servidor.
async function resolverChave(env, uid) {
  if (uid) {
    const k = await getUserApiKey(env, uid);
    if (k && k.chave) return { chave: k.chave, dona: "conta" };
    return {
      erro: {
        error: "no_api_key",
        detail: "Sua conta ainda não tem uma chave da API. Vá em Diário → Dados → Sua chave da Anthropic e cadastre a sua — o custo das fotos e análises cai na sua conta, não na de quem hospeda o app.",
      },
    };
  }
  if (env.ANTHROPIC_API_KEY) return { chave: env.ANTHROPIC_API_KEY, dona: "servidor" };
  return { erro: { error: "server_not_configured", detail: "Sem chave da API disponível." } };
}

async function getAccount(env, uid) {
  const raw = await env.DIARIO_KV.get("acct:" + uid);
  return raw ? JSON.parse(raw) : null;
}
async function authPepper(env) {
  return hmacHex(env.DATA_KEY, "auth-pepper");
}
// sessão -> uid (null se inválida/expirada)
async function sessionUid(env, token) {
  if (!token || !env.DIARIO_KV) return null;
  const raw = await env.DIARIO_KV.get("sess:" + (await sha256Hex(token)));
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (s.exp && Date.now() > s.exp) return null;
  return s.uid || null;
}
async function novaSessao(env, uid) {
  const token = randomToken();
  await env.DIARIO_KV.put(
    "sess:" + (await sha256Hex(token)),
    JSON.stringify({ uid, exp: Date.now() + SESSION_TTL * 1000 }),
    { expirationTtl: SESSION_TTL },
  );
  return token;
}

// Para onde o e-mail de recuperação realmente vai.
// MAIL_TO_OVERRIDE existe por causa de uma limitação de quem envia: sem um
// domínio verificado, o Resend só entrega no endereço do dono da conta. Com
// essa variável, TODAS as recuperações caem numa caixa só (a do dono), que
// repassa o link. Funciona, mas quem recebe consegue entrar na conta alheia
// — por isso fica desligado por padrão e o texto avisa de quem é o pedido.
function destinoDoEmail(env, emailDaConta) {
  const forcado = (env.MAIL_TO_OVERRIDE || "").trim();
  return forcado || emailDaConta;
}

async function enviarEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) return { ok: false, detail: "RESEND_API_KEY não configurada no Worker." };
  // RESEND_API_URL só existe p/ os testes locais apontarem para um mock
  const res = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Highlander <onboarding@resend.dev>",
      to: [to], subject, text,
    }),
  });
  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.log("ERRO RESEND:", res.status, detalhe.slice(0, 300));
    return { ok: false, detail: "Falha ao enviar e-mail (HTTP " + res.status + ")." };
  }
  return { ok: true };
}

async function handleAuth(request, env, json, url, ip) {
  if (!env.DIARIO_KV) return json({ error: "server_not_configured", detail: "KV não configurado." }, 500);
  if (!env.DATA_KEY) {
    return json({ error: "server_not_configured", detail: "DATA_KEY não configurada no Worker (npx wrangler secret put DATA_KEY)." }, 500);
  }
  const rota = url.pathname.slice("/auth/".length);
  const sessionToken = request.headers.get("X-Session") || "";

  // ---- GET /auth/me : quem sou eu (valida a sessão guardada no aparelho) ----
  if (rota === "me") {
    const uid = await sessionUid(env, sessionToken);
    if (!uid) return json({ error: "no_session" }, 401);
    const acct = await getAccount(env, uid);
    if (!acct) return json({ error: "no_session" }, 401);
    return json({ email: acct.email, createdAt: acct.createdAt });
  }

  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  // ---- POST /auth/logout ----
  if (rota === "logout") {
    if (sessionToken) await env.DIARIO_KV.delete("sess:" + (await sha256Hex(sessionToken)));
    return json({ ok: true });
  }

  // ---- POST /auth/signup {email, authKey, invite} ----
  if (rota === "signup") {
    if (rateLimited("signup:" + ip, 5)) return json({ error: "rate_limited", detail: "Muitas tentativas — aguarde um minuto." }, 429);
    const email = normEmail(body.email);
    if (!emailValido(email)) return json({ error: "invalid_email", detail: "E-mail inválido." }, 400);
    if (!authKeyValido(body.authKey)) return json({ error: "invalid_password", detail: "Senha inválida (o app deve enviar authKey)." }, 400);

    // convite obrigatório: impede estranho criando conta e gastando a API do dono
    const convites = (env.INVITE_CODE || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!convites.length) {
      return json({ error: "server_not_configured", detail: "INVITE_CODE não configurado no Worker." }, 500);
    }
    if (!convites.some((c) => sameSecret(c, String(body.invite || "").trim()))) {
      return json({ error: "bad_invite", detail: "Código de convite inválido." }, 403);
    }

    const uid = await sha256Hex(email);
    if (await getAccount(env, uid)) {
      return json({ error: "email_taken", detail: "Já existe conta com este e-mail — use Entrar, ou recupere a senha." }, 409);
    }
    const acct = {
      uid, email,
      authHash: await hmacHex(await authPepper(env), body.authKey),
      createdAt: new Date().toISOString(),
    };
    await env.DIARIO_KV.put("acct:" + uid, JSON.stringify(acct));
    return json({ session: await novaSessao(env, uid), email });
  }

  // ---- POST /auth/login {email, authKey} ----
  if (rota === "login") {
    const email = normEmail(body.email);
    if (rateLimited("login:" + ip + ":" + email, 10)) {
      return json({ error: "rate_limited", detail: "Muitas tentativas — aguarde um minuto." }, 429);
    }
    const uid = await sha256Hex(email);
    const acct = await getAccount(env, uid);
    const esperado = authKeyValido(body.authKey) ? await hmacHex(await authPepper(env), body.authKey) : "";
    // mensagem genérica: não revela se o e-mail existe
    if (!acct || !sameSecret(acct.authHash, esperado)) {
      return json({ error: "bad_credentials", detail: "E-mail ou senha incorretos." }, 401);
    }
    return json({ session: await novaSessao(env, uid), email: acct.email });
  }

  // ---- POST /auth/forgot {email} -> manda e-mail com link de redefinição ----
  if (rota === "forgot") {
    if (rateLimited("forgot:" + ip, 4)) return json({ error: "rate_limited", detail: "Muitas tentativas — aguarde um minuto." }, 429);
    const email = normEmail(body.email);
    // resposta SEMPRE igual (existindo conta ou não) p/ não vazar cadastro
    const resposta = { ok: true, detail: "Se existe conta com este e-mail, enviamos o link de redefinição." };
    if (!emailValido(email)) return json(resposta);
    const uid = await sha256Hex(email);
    const acct = await getAccount(env, uid);
    if (!acct) return json(resposta);

    const token = randomToken();
    await env.DIARIO_KV.put(
      "reset:" + (await sha256Hex(token)),
      JSON.stringify({ uid, exp: Date.now() + RESET_TTL * 1000 }),
      { expirationTtl: RESET_TTL },
    );
    const base = (env.APP_BASE_URL || "https://azimoov.github.io/diario-alimentar/").replace(/#.*$/, "");
    const link = base + "#recuperar=" + token;
    const destino = destinoDoEmail(env, acct.email);
    const paraTerceiro = destino !== acct.email;
    const envio = paraTerceiro
      ? await enviarEmail(env, destino, "Recuperação de senha do Highlander — conta " + acct.email,
        "Pedido de nova senha da conta " + acct.email + ".\n\n"
        + "Você está recebendo porque o servidor está configurado para mandar todas as\n"
        + "recuperações para este endereço. Repasse o link abaixo para a pessoa:\n\n"
        + link + "\n\n"
        + "O link vale 30 minutos e funciona UMA vez. Ao abri-lo, quem estiver com ele\n"
        + "define a senha e entra na conta — então repasse só se o pedido for legítimo.\n")
      : await enviarEmail(env, destino, "Redefinir sua senha do Highlander",
        "Você pediu para redefinir a senha do Highlander.\n\n"
        + "Abra este link no seu aparelho (vale por 30 minutos):\n" + link + "\n\n"
        + "Se não foi você, ignore este e-mail — nada muda.\n");
    if (!envio.ok) return json({ error: "mail_failed", detail: envio.detail }, 502);
    return json(resposta);
  }

  // ---- POST /auth/reset {token, authKey} ----
  if (rota === "reset") {
    if (rateLimited("reset:" + ip, 10)) return json({ error: "rate_limited" }, 429);
    if (!authKeyValido(body.authKey)) return json({ error: "invalid_password", detail: "Senha inválida." }, 400);
    const chave = "reset:" + (await sha256Hex(String(body.token || "")));
    const raw = await env.DIARIO_KV.get(chave);
    if (!raw) return json({ error: "bad_token", detail: "Link expirado ou já usado — peça outro." }, 400);
    const rec = JSON.parse(raw);
    if (rec.exp && Date.now() > rec.exp) {
      await env.DIARIO_KV.delete(chave);
      return json({ error: "bad_token", detail: "Link expirado — peça outro." }, 400);
    }
    const acct = await getAccount(env, rec.uid);
    if (!acct) return json({ error: "bad_token", detail: "Conta não encontrada." }, 400);
    acct.authHash = await hmacHex(await authPepper(env), body.authKey);
    acct.updatedAt = new Date().toISOString();
    await env.DIARIO_KV.put("acct:" + acct.uid, JSON.stringify(acct));
    await env.DIARIO_KV.delete(chave); // link é de uso único
    // os dados continuam legíveis: eles não dependem da senha (modelo recuperável)
    return json({ session: await novaSessao(env, acct.uid), email: acct.email });
  }

  // ---- POST /auth/password {authKeyAtual, authKeyNova} (logado) ----
  if (rota === "password") {
    const uid = await sessionUid(env, sessionToken);
    if (!uid) return json({ error: "no_session" }, 401);
    const acct = await getAccount(env, uid);
    if (!acct) return json({ error: "no_session" }, 401);
    if (!authKeyValido(body.authKeyNova)) return json({ error: "invalid_password", detail: "Senha nova inválida." }, 400);
    const atual = authKeyValido(body.authKeyAtual) ? await hmacHex(await authPepper(env), body.authKeyAtual) : "";
    if (!sameSecret(acct.authHash, atual)) return json({ error: "bad_credentials", detail: "Senha atual incorreta." }, 401);
    acct.authHash = await hmacHex(await authPepper(env), body.authKeyNova);
    acct.updatedAt = new Date().toISOString();
    await env.DIARIO_KV.put("acct:" + uid, JSON.stringify(acct));
    return json({ ok: true });
  }

  return json({ error: "not_found" }, 404);
}

// ---- dados da conta na nuvem ---------------------------------------------
// GET /account/data -> devolve o estado guardado (404 se ainda não há)
// PUT /account/data {state} -> guarda (cifrado em repouso com DATA_KEY)
async function handleAccountData(request, env, json, uid) {
  if (!env.DIARIO_KV) return json({ error: "server_not_configured", detail: "KV não configurado." }, 500);
  const chave = "data:" + uid;

  if (request.method === "GET") {
    const raw = await env.DIARIO_KV.get(chave);
    if (!raw) return json({ error: "no_data", detail: "Esta conta ainda não tem dados na nuvem." }, 404);
    const rec = JSON.parse(raw);
    let state;
    try { state = await decryptText(env, uid, rec); } catch {
      return json({ error: "decrypt_failed", detail: "Não consegui abrir os dados (DATA_KEY mudou?)." }, 500);
    }
    return json({ state, updatedAt: rec.updatedAt, savedAt: rec.savedAt });
  }

  if (request.method === "PUT" || request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const state = typeof body.state === "string" ? body.state : JSON.stringify(body.state || null);
    if (!state || state === "null") return json({ error: "missing_state" }, 400);
    if (state.length > 8_000_000) return json({ error: "state_too_large", detail: "Dados acima de ~8 MB." }, 413);
    const cif = await encryptText(env, uid, state);
    await env.DIARIO_KV.put(chave, JSON.stringify({
      v: 1, iv: cif.iv, blob: cif.blob,
      updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString(),
      savedAt: new Date().toISOString(),
    }));
    return json({ ok: true, bytes: state.length });
  }

  return json({ error: "method_not_allowed" }, 405);
}

// rate-limit simples em memória (por isolate — best-effort, não é garantia)
const hits = new Map();
function rateLimited(ip, max = 15, windowMs = 60_000) {
  const now = Date.now();
  const rec = hits.get(ip) || [];
  const recent = rec.filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // não crescer sem limite
  return recent.length > max;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const allowOrigin = allowed.includes(origin) ? origin : null;

    const cors = {
      "Access-Control-Allow-Origin": allowOrigin || allowed[0] || "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Token, X-Session",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // Navegadores mandam Origin: precisa estar na lista. Clientes nativos
    // (Atalhos da Apple, Siri) não mandam Origin: passam — o token é o porteiro.
    if (origin && !allowOrigin) return json({ error: "origin_not_allowed" }, 403);

    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "?";

    // ---- CONTAS: as rotas /auth/* são as únicas públicas (é aqui que a
    // pessoa entra); todo o resto exige sessão OU a senha antiga do app ----
    if (url.pathname.startsWith("/auth/")) return handleAuth(request, env, json, url, ip);

    // Dois porteiros aceitos:
    //  1. X-Session  -> conta com login (caminho novo, zero configuração)
    //  2. X-App-Token -> senha compartilhada (caminho legado, segue valendo)
    const sessionToken = request.headers.get("X-Session") || "";
    const uid = sessionToken ? await sessionUid(env, sessionToken) : null;
    const validTokens = (env.APP_TOKEN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const givenToken = request.headers.get("X-App-Token") || "";
    const tokenOk = validTokens.length > 0 && validTokens.includes(givenToken);
    if (!uid && !tokenOk) {
      return json({
        error: "unauthorized",
        detail: sessionToken ? "Sessão expirada — entre de novo." : "Faça login no app (ou informe a senha do app).",
      }, 401);
    }

    // ---- dados da conta na nuvem (só com login; é o backup novo) ----
    if (url.pathname === "/account/data") {
      if (!uid) return json({ error: "no_session", detail: "Esta rota exige login por conta." }, 401);
      return handleAccountData(request, env, json, uid);
    }

    // ---- backup criptografado do diário (caminho LEGADO, por senha: o
    // servidor só vê o blob cifrado — a criptografia acontece no aparelho).
    // Mantido de propósito: backups antigos continuam restauráveis. ----
    if (url.pathname === "/backup") {
      if (!tokenOk) return json({ error: "unauthorized", detail: "O backup antigo exige a senha do app (X-App-Token)." }, 401);
      return handleBackup(request, env, json, givenToken);
    }

    // ---- base COMUM de alimentos (compartilhada entre todos os usuários) ----
    if (url.pathname === "/foods") return handleFoods(request, env, json, uid || givenToken, url);

    // ---- análise inteligente (exames × dieta × métricas do app) ----
    if (url.pathname === "/analyze") return handleAnalyze(request, env, json, uid);

    // ---- chave da API da própria pessoa (BYOK) ----
    if (url.pathname === "/account/apikey") {
      if (!uid) return json({ error: "no_session", detail: "Esta rota exige login por conta." }, 401);
      return handleApiKey(request, env, json, uid);
    }

    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const cred = await resolverChave(env, uid);
    if (cred.erro) return json(cred.erro, cred.erro.error === "no_api_key" ? 402 : 500);

    if (rateLimited(ip)) return json({ error: "rate_limited", detail: "Muitas fotos em pouco tempo — aguarde um minuto." }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const image = body && body.image;
    const mediaType = body && body.mediaType;
    const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (typeof image !== "string" || !image.length) return json({ error: "missing_image" }, 400);
    if (image.length > 7_000_000) return json({ error: "image_too_large", detail: "Imagem grande demais (~5 MB máx)." }, 413);
    if (!okTypes.includes(mediaType)) return json({ error: "unsupported_media_type" }, 415);

    // Limite diário de fotos — por CONTA quando há login (cada um protege o
    // próprio bolso), global no caminho legado da senha do app.
    // Best-effort (KV é eventualmente consistente) — a trava definitiva é o
    // limite de gasto no console da Anthropic.
    if (env.DIARIO_KV) {
      const tz = env.TIMEZONE || "America/Sao_Paulo";
      const day = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      const quotaKey = "fotos:" + (uid ? uid + ":" : "") + day;
      const used = parseInt((await env.DIARIO_KV.get(quotaKey)) || "0", 10);
      const limit = parseInt(env.PHOTO_DAILY_LIMIT || "60", 10);
      if (used >= limit) {
        return json({
          error: "daily_limit",
          detail: `Limite de ${limit} fotos por dia atingido — volta amanhã ou registre por texto.`,
        }, 429);
      }
      await env.DIARIO_KV.put(quotaKey, String(used + 1), { expirationTtl: 172800 });
    }

    const client = new Anthropic({
      apiKey: cred.chave,
      // ANTHROPIC_BASE_URL só é usado nos testes locais (mock); em produção fica indefinida
      baseURL: env.ANTHROPIC_BASE_URL || undefined,
      // Workers + nodejs_compat: sem isto o SDK pode tentar o caminho de rede
      // do Node (inexistente aqui) e falhar com "Connection error."
      fetch: globalThis.fetch.bind(globalThis),
    });

    // dois modos de leitura: refeição (padrão) ou tabela nutricional
    const isRotulo = body.mode === "rotulo";
    // produtos que o usuário cadastrou com foto de rótulo — permitem que a
    // foto da embalagem reaproveite o alimento já cadastrado
    const produtos = Array.isArray(body.produtos)
      ? body.produtos.filter((p) => typeof p === "string" && p.trim()).slice(0, 60).map((p) => p.trim().slice(0, 120))
      : [];

    let msg;
    try {
      msg = await client.messages.create({
        model: env.CLAUDE_MODEL || "claude-opus-4-8",
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: isRotulo ? SCHEMA_ROTULO : SCHEMA },
        },
        system: isRotulo ? SYSTEM_ROTULO : SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: isRotulo
              ? "Extraia os dados da tabela nutricional desta foto."
              : "Identifique os alimentos desta refeição e estime as gramas de cada um."
                + (produtos.length ? "\n\nPRODUTOS CADASTRADOS (use no campo \"produto\" se a foto mostrar a embalagem de um deles):\n- " + produtos.join("\n- ") : "") },
          ],
        }],
      });
    } catch (err) {
      // aparece no `wrangler tail` p/ diagnóstico (sem dados sensíveis)
      console.log("ERRO API:", err && err.status, String((err && err.message) || err).slice(0, 300));
      if (err instanceof Anthropic.RateLimitError) {
        return json({ error: "upstream_rate_limited", detail: "API ocupada — tente de novo em instantes." }, 429);
      }
      if (err instanceof Anthropic.AuthenticationError) {
        return json({ error: "upstream_auth", detail: "Chave da API inválida no Worker." }, 500);
      }
      if (err instanceof Anthropic.APIError) {
        return json({ error: "upstream_error", status: err.status, detail: err.message }, 502);
      }
      return json({ error: "upstream_error", detail: String((err && err.message) || err) }, 502);
    }

    if (msg.stop_reason === "refusal") {
      console.log("RECUSA:", JSON.stringify(msg.stop_details || null));
      return json({ error: "refused", detail: "O modelo recusou analisar esta imagem." }, 502);
    }
    const textBlock = (msg.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      console.log("SEM TEXTO: stop_reason=", msg.stop_reason, "blocos=", (msg.content || []).map((b) => b.type).join(","));
      return json({ error: "empty_response", detail: "Resposta sem conteúdo (stop: " + msg.stop_reason + ")." }, 502);
    }

    let parsed;
    try { parsed = JSON.parse(textBlock.text); } catch {
      console.log("JSON RUIM: stop_reason=", msg.stop_reason, "inicio=", textBlock.text.slice(0, 200));
      return json({ error: "bad_model_output", detail: "Resposta em formato inesperado." }, 502);
    }

    // ---- modo rótulo: valida e devolve os campos da tabela nutricional ----
    if (isRotulo) {
      const numN = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);
      return json({
        rotulo: {
          nome: typeof parsed.nome === "string" && parsed.nome.trim() ? parsed.nome.trim().slice(0, 120) : null,
          base: ["100g", "porcao", "desconhecida"].includes(parsed.base) ? parsed.base : "desconhecida",
          porcao_g: numN(parsed.porcao_g),
          kcal: numN(parsed.kcal),
          prot: numN(parsed.prot),
          carb: numN(parsed.carb),
          fat: numN(parsed.fat),
          fiber: numN(parsed.fiber),
          observacao: typeof parsed.observacao === "string" ? parsed.observacao : "",
        },
        modelo: msg.model,
      });
    }

    // validação defensiva do formato antes de devolver ao app
    const itens = (Array.isArray(parsed.itens) ? parsed.itens : [])
      .filter((i) => i && typeof i.nome === "string" && i.nome.trim()
        && typeof i.gramas === "number" && isFinite(i.gramas) && i.gramas > 0)
      .slice(0, 20)
      .map((i) => ({
        nome: i.nome.trim().slice(0, 120),
        gramas: Math.round(i.gramas),
        confianca: ["alta", "media", "baixa"].includes(i.confianca) ? i.confianca : "baixa",
        // só aceita produto que realmente está na lista enviada pelo app
        produto: typeof i.produto === "string" && produtos.includes(i.produto.trim()) ? i.produto.trim() : null,
      }));

    return json({
      itens,
      observacao: typeof parsed.observacao === "string" ? parsed.observacao : "",
      modelo: msg.model,
    });
  },
};
