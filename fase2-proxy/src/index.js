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
        },
        required: ["nome", "gramas", "confianca"],
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
- Pratos compostos (estrogonofe, lasanha): liste como um item único com o nome do prato.`;

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
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // Navegadores mandam Origin: precisa estar na lista. Clientes nativos
    // (Atalhos da Apple, Siri) não mandam Origin: passam — o token é o porteiro.
    if (origin && !allowOrigin) return json({ error: "origin_not_allowed" }, 403);

    // Senhas: APP_TOKEN aceita várias, separadas por vírgula (uma por pessoa).
    const validTokens = (env.APP_TOKEN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const givenToken = request.headers.get("X-App-Token") || "";
    if (!validTokens.length || !validTokens.includes(givenToken)) {
      return json({ error: "unauthorized", detail: "Senha do app ausente ou incorreta." }, 401);
    }

    // ---- backup criptografado do diário (por senha; o servidor só vê o
    // blob cifrado — a criptografia acontece no aparelho) ----
    const url = new URL(request.url);
    if (url.pathname === "/backup") return handleBackup(request, env, json, givenToken);

    // ---- base COMUM de alimentos (compartilhada entre todos os usuários) ----
    if (url.pathname === "/foods") return handleFoods(request, env, json, givenToken, url);

    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "server_not_configured", detail: "ANTHROPIC_API_KEY não configurada no Worker." }, 500);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    if (rateLimited(ip)) return json({ error: "rate_limited", detail: "Muitas fotos em pouco tempo — aguarde um minuto." }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const image = body && body.image;
    const mediaType = body && body.mediaType;
    const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (typeof image !== "string" || !image.length) return json({ error: "missing_image" }, 400);
    if (image.length > 7_000_000) return json({ error: "image_too_large", detail: "Imagem grande demais (~5 MB máx)." }, 413);
    if (!okTypes.includes(mediaType)) return json({ error: "unsupported_media_type" }, 415);

    // Limite diário de fotos do grupo inteiro (proteção de custo).
    // Best-effort (KV é eventualmente consistente) — a trava definitiva é o
    // limite de gasto no console da Anthropic.
    if (env.DIARIO_KV) {
      const tz = env.TIMEZONE || "America/Sao_Paulo";
      const day = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      const quotaKey = "fotos:" + day;
      const used = parseInt((await env.DIARIO_KV.get(quotaKey)) || "0", 10);
      const limit = parseInt(env.PHOTO_DAILY_LIMIT || "60", 10);
      if (used >= limit) {
        return json({
          error: "daily_limit",
          detail: `Limite diário de ${limit} fotos do grupo atingido — volta amanhã ou registre por texto.`,
        }, 429);
      }
      await env.DIARIO_KV.put(quotaKey, String(used + 1), { expirationTtl: 172800 });
    }

    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // ANTHROPIC_BASE_URL só é usado nos testes locais (mock); em produção fica indefinida
      baseURL: env.ANTHROPIC_BASE_URL || undefined,
      // Workers + nodejs_compat: sem isto o SDK pode tentar o caminho de rede
      // do Node (inexistente aqui) e falhar com "Connection error."
      fetch: globalThis.fetch.bind(globalThis),
    });

    // dois modos de leitura: refeição (padrão) ou tabela nutricional
    const isRotulo = body.mode === "rotulo";

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
              : "Identifique os alimentos desta refeição e estime as gramas de cada um." },
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
      }));

    return json({
      itens,
      observacao: typeof parsed.observacao === "string" ? parsed.observacao : "",
      modelo: msg.model,
    });
  },
};
