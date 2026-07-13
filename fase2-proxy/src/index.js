// Proxy da Fase 2 — Cloudflare Worker.
// Recebe uma foto (base64) do app, chama a API da Anthropic (visão) e devolve
// a lista de alimentos estimados. A CHAVE DA API fica em segredo no Worker
// (env.ANTHROPIC_API_KEY) — jamais no front-end.
//
// Proteções: CORS restrito às origens do app, token compartilhado (X-App-Token),
// limite de tamanho de imagem e rate-limit simples por IP (best-effort).

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

const SYSTEM = `Você analisa fotos de refeições (comida majoritariamente brasileira) para um diário alimentar pessoal.

Tarefa: identificar cada alimento visível e estimar o peso em gramas da porção.

Regras de honestidade:
- Estimar gramas por foto é impreciso; seja realista, não chute com falsa precisão.
- Use "confianca": "alta" só quando o alimento é inequívoco e a porção bem visível; "media" no caso comum; "baixa" quando você está adivinhando (comida coberta, misturada, ângulo ruim).
- Se a foto não contém comida, devolva "itens" vazio e explique em "observacao".
- Nomes em português brasileiro, minúsculas, no estilo da tabela TACO (alimento + preparo), ex.: "arroz branco cozido", "feijão preto cozido", "carne bovina patinho grelhado", "ovo frito", "banana prata".
- Não liste temperos invisíveis nem invente acompanhamentos que não aparecem.
- Pratos compostos (estrogonofe, lasanha): liste como um item único com o nome do prato.`;

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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!allowOrigin) return json({ error: "origin_not_allowed" }, 403);

    // token compartilhado: o mesmo valor configurado no app (aba Dados)
    if (!env.APP_TOKEN || request.headers.get("X-App-Token") !== env.APP_TOKEN) {
      return json({ error: "unauthorized", detail: "Token do app ausente ou incorreto." }, 401);
    }
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

    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // ANTHROPIC_BASE_URL só é usado nos testes locais (mock); em produção fica indefinida
      baseURL: env.ANTHROPIC_BASE_URL || undefined,
    });

    let msg;
    try {
      msg = await client.messages.create({
        model: env.CLAUDE_MODEL || "claude-opus-4-8",
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: SCHEMA },
        },
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: "Identifique os alimentos desta refeição e estime as gramas de cada um." },
          ],
        }],
      });
    } catch (err) {
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
      return json({ error: "refused", detail: "O modelo recusou analisar esta imagem." }, 502);
    }
    const textBlock = (msg.content || []).find((b) => b.type === "text");
    if (!textBlock) return json({ error: "empty_response" }, 502);

    let parsed;
    try { parsed = JSON.parse(textBlock.text); } catch { return json({ error: "bad_model_output" }, 502); }

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
