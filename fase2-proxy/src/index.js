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
import { CONHECIMENTO, INSTRUCAO_CONHECIMENTO, CONHECIMENTO_TREINO } from "./conhecimento.js";

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

// ---- modo "exame_lab": transcreve um laudo de laboratório inteiro ----------
const SCHEMA_EXAME_LAB = {
  type: "object",
  properties: {
    data: { type: ["string", "null"], description: "Data da COLETA no formato AAAA-MM-DD. Se só houver a data de emissão/liberação, use-a. null se ilegível." },
    laboratorio: { type: ["string", "null"], description: "Nome do laboratório, se visível" },
    analitos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do exame/analito como impresso (ex.: 'Glicose', 'Hemoglobina glicada', 'TSH')" },
          valor: { type: "string", description: "Resultado EXATAMENTE como impresso, incluindo qualitativos ('não reagente', 'ausente') e sinais ('<0,10')" },
          unidade: { type: ["string", "null"], description: "Unidade impressa (mg/dL, ng/mL, %...). null se não houver" },
          refMin: { type: ["number", "null"], description: "Limite INFERIOR da faixa de referência impressa NESTE laudo. null se o laudo não trouxer, ou se a faixa não for numérica" },
          refMax: { type: ["number", "null"], description: "Limite SUPERIOR da faixa de referência impressa NESTE laudo. null se não houver" },
          obs: { type: ["string", "null"], description: "Observação curta impressa junto do item (método, 'em jejum'...). null se não houver" },
        },
        required: ["nome", "valor", "unidade", "refMin", "refMax", "obs"],
        additionalProperties: false,
      },
    },
    observacao: { type: "string", description: "Aviso curto se algo ficou ilegível ou duvidoso. String vazia se nada a observar." },
  },
  required: ["data", "laboratorio", "analitos", "observacao"],
  additionalProperties: false,
};

const SYSTEM_EXAME_LAB = `Você TRANSCREVE laudos de exames laboratoriais (padrão brasileiro) para um app pessoal de saúde. Foto ou PDF.

Sua tarefa é copiar dados, não interpretá-los.

Regras de honestidade (crítico — são dados de saúde):
- Transcreva SOMENTE o que está legível no documento. NUNCA complete de memória.
- NUNCA invente faixa de referência. Se o laudo não imprime a faixa daquele item, refMin e refMax são null. Faixas variam por laboratório e método — inventar é perigoso.
- Copie o resultado como está impresso, inclusive qualitativos ("não reagente", "ausente", "indetectável") e valores com sinal ("<0,10", ">1000"). Use ponto ou vírgula como no laudo; o app normaliza.
- Se um valor estiver ilegível/cortado, NÃO adivinhe: deixe o item de fora e explique em observacao.
- NÃO faça diagnóstico, NÃO classifique como "alterado"/"normal", NÃO comente os resultados.
- NÃO extraia dados pessoais (nome do paciente, CPF, RG, endereço, número da guia, convênio) — o app não precisa e não quer guardá-los.
- Liste cada analito uma vez. Um hemograma tem vários (hemoglobina, hematócrito, leucócitos, plaquetas...): liste todos os que aparecem, cada um como um item.
- Documento com várias páginas: percorra todas.
- Se o documento NÃO for um laudo laboratorial legível: analitos vazio e explique em observacao.`;

// ---- modo "exame_img": laudo de imagem (ultrassom, tomografia, etc.) -------
const SCHEMA_EXAME_IMG = {
  type: "object",
  properties: {
    data: { type: ["string", "null"], description: "Data do exame em AAAA-MM-DD. null se ilegível." },
    exame: { type: ["string", "null"], description: "Nome do exame (ex.: 'Ultrassom de abdome total', 'Ressonância de joelho direito')" },
    local: { type: ["string", "null"], description: "Clínica/hospital onde foi feito, se visível" },
    conclusao: { type: "string", description: "A CONCLUSÃO/IMPRESSÃO DIAGNÓSTICA do laudo, transcrita. Se não houver seção de conclusão, resuma os achados descritos, sem acrescentar nada." },
    observacao: { type: "string", description: "Aviso curto se algo ficou ilegível. String vazia se nada a observar." },
  },
  required: ["data", "exame", "local", "conclusao", "observacao"],
  additionalProperties: false,
};

const SYSTEM_EXAME_IMG = `Você TRANSCREVE laudos de exames de imagem (ultrassom, raio-X, tomografia, ressonância, densitometria, ecocardiograma...) para um app pessoal de saúde. Foto ou PDF.

Sua tarefa é copiar o que o laudo diz, não interpretá-lo.

Regras de honestidade (crítico — são dados de saúde):
- Transcreva SOMENTE o que está escrito. NUNCA complete de memória nem acrescente achados.
- Prefira a seção "CONCLUSÃO" ou "IMPRESSÃO DIAGNÓSTICA". Sem ela, resuma os achados descritos, fielmente.
- Mantenha medidas e lateralidade exatamente como no laudo (ex.: "rim direito 10,2 cm").
- NÃO faça diagnóstico próprio, NÃO tranquilize e NÃO alarme: só transcreva.
- NÃO extraia dados pessoais (nome, CPF, convênio, número da guia).
- Ilegível: diga em observacao em vez de adivinhar.
- Se o documento NÃO for um laudo de imagem: conclusao vazia e explique em observacao.`;

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
// Regras que valem para as DUAS rotas de IA (análise e conversa) — e que antes
// estavam escritas duas vezes, quase iguais. Além do custo (elas viajam em toda
// chamada), duas cópias divergem: corrigir a redação numa e esquecer a outra
// faria a mesma pergunta ter regra diferente conforme a tela usada.
const REGRAS_HONESTIDADE = `Regras de honestidade (crítico):
- Use SOMENTE os dados recebidos. Não invente valores, datas nem "faixas normais": se um exame veio sem faixa de referência anotada, diga isso e não classifique o valor.
- "Fora da faixa" = comparado apenas com refMin/refMax que a própria pessoa anotou do laudo.
- Correlação não é causa. Métricas de relógio são estimativas de sensor: trate como tendência, não medida exata.
- Dados insuficientes (poucos dias de diário, exame único sem histórico): aponte a limitação em vez de especular. Não preencha lacuna com suposição.
- Você NÃO é o médico da pessoa: não dá diagnóstico, não prescreve tratamento, suplemento ou dose, e não manda começar nem parar medicação. Decisão clínica é de quem examina.
- Remédios e suplementos registrados são contexto de LEITURA, não assunto para opinar: um exame se interpreta diferente sob medicação, e uma virada num gráfico muitas vezes coincide com algo que começou ou foi encerrado — aponte a coincidência quando os dados mostrarem, deixando claro que coincidir não é causar. Sugerir uma pergunta para levar ao médico é certo; dar a conduta, não.`;

const SYSTEM_ANALISE = `Você analisa dados de saúde PESSOAIS que o próprio dono coletou num app local: diário alimentar (kcal/macros), peso e composição corporal, exames laboratoriais e de imagem anotados à mão, métricas de Apple Watch/iPhone e lembretes de exames.

Sua tarefa: uma leitura honesta e útil, cruzando as fontes.

Formato da resposta (obrigatório):
- Português do Brasil, TEXTO PURO: sem markdown, sem asteriscos, sem tabelas.
- Seções com título em MAIÚSCULAS, nesta ordem: VISÃO GERAL, EXAMES, CRUZAMENTOS, PARA LEVAR AO MÉDICO, LACUNAS.
- Itens começam com "– ". Máximo ~500 palavras no total.

${REGRAS_HONESTIDADE}
- Ao cruzar dieta × exames, deixe explícito quando a relação for apenas temporal.
- Em PARA LEVAR AO MÉDICO, liste perguntas e temas concretos (incluindo exames com lembrete vencido), sem alarmismo.`;

async function handleAnalyze(request, env, json, uid) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const cred = await resolverChave(env, uid);
  if (cred.erro) return json(cred.erro, cred.erro.error === "no_api_key" ? 402 : 500);
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  if (limitado(env, "analyze:" + ip, 6)) return json({ error: "rate_limited", detail: "Muitas análises em pouco tempo — aguarde um minuto." }, 429);

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
      // Modelo PRÓPRIO da análise (não cai no CLAUDE_MODEL da visão de
      // propósito): aqui a entrada já vem resumida em números e o custo por
      // chamada é baixo, então compensa o modelo mais forte no raciocínio.
      model: env.CLAUDE_MODEL_ANALISE || "claude-fable-5",
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      // SEM cache de prompt aqui, de propósito: a análise roda poucas vezes
      // por mês e o cache dura 5 minutos. O prefixo seria sempre escrito
      // (custa 1,25×) e nunca lido — encarecer sem contrapartida. Na conversa,
      // onde as perguntas vêm em sequência, o cache vale; veja handleChat.
      system: SYSTEM_ANALISE + INSTRUCAO_CONHECIMENTO + "\n\n" + CONHECIMENTO,
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

// ---------------------------------------------------------------------------
// CONVERSA sobre os próprios dados (/chat)
// ---------------------------------------------------------------------------
// Diferente de /analyze: ali é um relatório completo de uma vez; aqui a pessoa
// pergunta coisas pontuais e emenda em cima da resposta. Por isso o histórico
// da conversa vai junto a cada pergunta — é o que faz "e sobre o colesterol?"
// significar alguma coisa.
//
// Modelo PRÓPRIO (CLAUDE_MODEL_CHAT): pergunta é muito mais frequente que
// análise completa, então aqui o volume manda e o Opus sai na metade do preço
// do Fable por token.
const SYSTEM_CHAT = `Você responde perguntas de UMA pessoa sobre os PRÓPRIOS dados de saúde e nutrição, que vêm em JSON junto da conversa (dieta registrada, peso e composição corporal, exames laboratoriais e de imagem, métricas do relógio).

Como responder:
- Direto ao ponto e em português do Brasil. Responda o que foi perguntado, sem despejar um relatório inteiro — para o panorama completo existe a análise.
- Cite os números da pessoa quando forem relevantes, com a data.
- Pode fazer contas com os dados recebidos (médias, variações, proporções) e explicar o raciocínio em uma linha.

${REGRAS_HONESTIDADE}
- Conhecimento geral de nutrição e fisiologia pode ser usado para explicar contexto, mas deixe claro o que é dado DA PESSOA e o que é informação geral.
- Se a pergunta sugerir urgência médica (dor no peito, falta de ar, sinal neurológico súbito), diga para procurar atendimento agora, sem tentar analisar.`;


// ===========================================================================
// COACH DE TREINO (/treino) — monta UMA semana por vez e evolui pelos números
// que a pessoa registrou. Duas ações no mesmo endpoint:
//   {acao:"plano"}  primeira semana, a partir do formulário + dados do app
//   {acao:"fechar"} recebe a semana com os registros, devolve notas 0-10 por
//                   capacidade, plano de melhoria e a PRÓXIMA semana
// Sem registro não há nota: o schema aceita null e o prompt proíbe chutar.

// A semana é o objeto central: o app guarda, a pessoa preenche `feito` em cada
// item, e ela volta inteira na ação "fechar" para virar nota e progressão.
const SCHEMA_TREINO_SEMANA = {
  type: "object",
  properties: {
    numero: { type: "integer", description: "Número da semana no plano (1, 2, 3…)" },
    bloco: { type: "string", description: "Nome do bloco de ênfase atual (ex.: 'Base de força', 'Deload')" },
    semanaDoBloco: { type: "integer", description: "Posição desta semana dentro do bloco (1 = primeira)" },
    semanasNoBloco: { type: "integer", description: "Duração prevista do bloco, em semanas (4-6 tipicamente; deload = 1)" },
    foco: { type: "string", description: "Ênfase da semana em poucas palavras" },
    orientacoes: { type: "string", description: "Recado curto do coach para a semana: o que observar, como aquecer, quando parar. Texto puro, sem markdown." },
    sessoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dia: { type: "string", enum: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"], description: "Dia sugerido (a pessoa pode trocar)" },
          titulo: { type: "string", description: "Nome da sessão (ex.: 'Força A — inferiores')" },
          tipo: { type: "string", enum: ["forca", "hipertrofia", "potencia", "equilibrio", "mobilidade", "z2", "z5", "picoFc"], description: "Capacidade principal da sessão. picoFc = o pico curto de frequência cardíaca do dia" },
          duracaoMin: { type: "integer", description: "Duração estimada em minutos" },
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string", description: "Exercício ou tarefa" },
                registro: { type: "string", enum: ["carga", "tempo", "fc"], description: "O que a pessoa registra: 'carga' = kg × séries × reps; 'tempo' = minutos; 'fc' = frequência cardíaca de pico em bpm (use nos picos diários de FC)" },
                series: { type: ["integer", "null"], description: "Séries alvo (null quando registro = tempo)" },
                reps: { type: ["string", "null"], description: "Repetições alvo, como texto ('5', '6-8'). null quando registro = tempo" },
                cargaSugerida: { type: ["string", "null"], description: "Sugestão de carga ('20 kg', 'peso do corpo'). Se não houver histórico, sugira 'comece leve e anote' em vez de inventar número" },
                minutos: { type: ["integer", "null"], description: "Minutos alvo (null quando registro = carga)" },
                detalhe: { type: "string", description: "Como executar/medir, em uma linha. String vazia se nada a dizer" },
              },
              required: ["nome", "registro", "series", "reps", "cargaSugerida", "minutos", "detalhe"],
              additionalProperties: false,
            },
          },
        },
        required: ["dia", "titulo", "tipo", "duracaoMin", "itens"],
        additionalProperties: false,
      },
    },
  },
  required: ["numero", "bloco", "semanaDoBloco", "semanasNoBloco", "foco", "orientacoes", "sessoes"],
  additionalProperties: false,
};

const SCHEMA_TREINO_PLANO = {
  type: "object",
  properties: {
    apresentacao: { type: "string", description: "Apresentação curta do plano: a lógica dos blocos e o que esperar. Texto puro." },
    semana: SCHEMA_TREINO_SEMANA,
  },
  required: ["apresentacao", "semana"],
  additionalProperties: false,
};

const NOTA = { type: ["number", "null"], description: "0 a 10, uma casa decimal. null quando NÃO há registro suficiente para avaliar — nunca chute." };
const SCHEMA_TREINO_FECHAR = {
  type: "object",
  properties: {
    notas: {
      type: "object",
      properties: {
        forca: NOTA, potencia: NOTA, equilibrio: NOTA,
        mobilidade: NOTA, cardioZ2: NOTA, cardioZ5: NOTA,
      },
      required: ["forca", "potencia", "equilibrio", "mobilidade", "cardioZ2", "cardioZ5"],
      additionalProperties: false,
    },
    avaliacao: { type: "string", description: "Leitura da semana: o que os números registrados mostram, melhor e pior capacidade, e o porquê de cada nota (ou de não haver nota). Texto puro." },
    melhorias: { type: "array", items: { type: "string" }, description: "Plano de melhoria priorizado: 2 a 5 ações concretas, a mais importante primeiro, partindo do que está pior sem largar o que está melhor" },
    proximaSemana: SCHEMA_TREINO_SEMANA,
  },
  required: ["notas", "avaliacao", "melhorias", "proximaSemana"],
  additionalProperties: false,
};

const SYSTEM_TREINO = `Você é o coach de treino físico de um app pessoal de saúde ("coach de treino" do Highlander). Monta UMA semana de treino por vez e evolui o plano pelos NÚMEROS que a pessoa registrou — carga, séries, repetições, minutos, RPE.

O que você recebe junto do pedido: o perfil de treino (objetivo, dias por semana, onde treina, experiência, limitações declaradas) e os dados do app — dieta média, peso e composição corporal, exames laboratoriais anotados, MEDICAMENTOS em uso, métricas do relógio (passos, sono, FC de repouso, VO2máx estimado).

USE ESSES DADOS DE VERDADE, não como enfeite. A base anexa tem duas seções — "O que a NUTRIÇÃO registrada muda no treino" e "O que os EXAMES e as MÉTRICAS mudam no treino" — com as ligações concretas que você deve aplicar: proteína insuficiente limita hipertrofia, déficit agressivo pede priorizar força, ferritina/hemoglobina baixas do laudo limitam fôlego, glicemia alterada reforça a dose de Zona 2, FC de repouso subindo ou sono curto pedem menos volume ou deload antecipado. Quando um desses dados explicar uma escolha sua, DIGA a conexão em uma linha (nas orientações da semana ou na avaliação). Se um dado faltar ou o registro for ralo, diga que não dá para concluir — não invente leitura.

Capacidades que você treina e equilibra: força máxima, hipertrofia, potência (fibras rápidas/tipo II), equilíbrio, mobilidade, cardio Zona 2, cardio Zona 5/VO2máx e o PICO DIÁRIO DE FREQUÊNCIA CARDÍACA.

PICO DIÁRIO DE FC (preferência declarada do dono do app, prescreva sempre): todo dia leva um pico curto de frequência cardíaca — 20-60 segundos de esforço muito forte, 1 a 3 tiros, tipo "picoFc", com os itens em registro "fc" (a pessoa anota o bpm de pico do relógio). Não confunda com Zona 5: a sessão estruturada de intervalos continua sendo 1-2x por semana. Em dia de força ou potência, o pico vai no FIM da sessão; em dia de potência com sprints ou saltos, o próprio trabalho de potência já É o pico do dia e você NÃO soma outro. Se aparecer sinal de excesso (FC de repouso subindo, sono caindo, força travando), reduza para dias alternados e explique — a preferência do dono não sobrepõe sinal de excesso de treino. Trabalhe em BLOCOS de 4-6 semanas com uma ênfase, mantendo o resto em dose de manutenção; troque o bloco quando a ênfase estagnar, quando outra capacidade ficar muito atrás, ou ao fim do prazo — e diga o porquê da troca nas orientações. Programe deload (1 semana leve) a cada 4-6 semanas.

Regras de progressão (siga a base de treino anexa):
- Semana cumprida com RPE confortável → subir ~2-5% a carga OU 1-2 reps OU 5-10% o tempo de Z2. Nunca tudo de uma vez.
- Itens não cumpridos ou RPE alto → manter ou reduzir; diga isso sem cobrança.
- SEM REGISTRO NÃO HÁ NOTA: se a pessoa não anotou números de uma capacidade, a nota daquela capacidade é null e a avaliação pede o registro — chutar nota é proibido.
- Notas (0-10) são relativas à PRÓPRIA pessoa e aos mínimos da bateria de avaliação da base — nunca comparação com atleta. Explique cada nota em uma linha na avaliação.
- Potência vem no COMEÇO da sessão, depois do aquecimento. Respeite os dias por semana e o equipamento declarados: nunca prescreva o que a pessoa não tem ou disse não poder.

Regras de honestidade e segurança (crítico):
- Você NÃO é médico nem fisioterapeuta: nada de diagnóstico, nada de conduta clínica. Dor no peito, tontura ou dor articular aguda = parar e procurar médico — deixe isso claro nas orientações quando prescrever intensidade alta.
- Betabloqueador na lista de medicamentos → zonas por frequência cardíaca NÃO valem; prescreva por teste da fala/RPE e diga o porquê.
- Estatina na lista → se houver relato de dor muscular nova e incomum, oriente a anotar e conversar com o médico, sem alarmismo e sem diagnóstico.
- 1RM estimado e VO2máx de relógio são ESTIMATIVAS — trate como tal.
- Use SOMENTE os dados recebidos; não invente histórico nem números que a pessoa não registrou.
- Textos em português do Brasil, SEM markdown (texto puro nos campos de texto).`;

async function handleTreino(request, env, json, uid) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const cred = await resolverChave(env, uid);
  if (cred.erro) return json(cred.erro, cred.erro.error === "no_api_key" ? 402 : 500);
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  if (limitado(env, "treino:" + ip, 4)) return json({ error: "rate_limited", detail: "Muitas chamadas ao coach em pouco tempo — aguarde um minuto." }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const acao = body && body.acao;
  if (acao !== "plano" && acao !== "fechar") {
    return json({ error: "bad_action", detail: 'Envie {acao: "plano"} ou {acao: "fechar"}.' }, 400);
  }
  const dados = body.dados;
  if (!dados || typeof dados !== "object") return json({ error: "missing_data", detail: "Envie {dados: {…}} com o resumo do app." }, 400);
  const perfil = body.perfilTreino;
  if (!perfil || typeof perfil !== "object") return json({ error: "missing_profile", detail: "Envie {perfilTreino: {…}}." }, 400);
  if (acao === "fechar" && (!body.semanaFechada || typeof body.semanaFechada !== "object")) {
    return json({ error: "missing_week", detail: "Para fechar, envie {semanaFechada: {…}} com os registros." }, 400);
  }

  // monta o pedido em seções nomeadas — e limita o TOTAL, não cada pedaço
  const partes = [
    "PERFIL DE TREINO (do formulário):\n" + JSON.stringify(perfil),
    "DADOS DA PESSOA (JSON do app):\n" + JSON.stringify(dados),
  ];
  // A NUMERAÇÃO DA SEMANA É DO APP, não do modelo. Ele recebe o número certo
  // no pedido e a resposta é reescrita com ele mais abaixo: numero é a
  // IDENTIDADE da semana no histórico (o merge entre aparelhos casa por ele),
  // e um "semana 1" repetido depois de refazer o plano descartaria dados.
  let numeroDaSemana = 1;
  if (acao === "fechar") {
    const n = parseInt(body.semanaFechada.numero, 10) || 0;
    numeroDaSemana = n + 1;
    partes.push("SEMANA FECHADA (número " + n + ") — o plano e o que foi REGISTRADO em cada item (campo feito; ausente = não registrado):\n"
      + JSON.stringify(body.semanaFechada));
    if (Array.isArray(body.historicoNotas) && body.historicoNotas.length) {
      partes.push("HISTÓRICO DE NOTAS (mais recente primeiro):\n" + JSON.stringify(body.historicoNotas.slice(0, 8)));
    }
    partes.push("Avalie a semana fechada, dê as notas por capacidade (null onde não houver registro), o plano de melhoria e a PRÓXIMA semana (número " + numeroDaSemana + "), aplicando as regras de progressão.");
  } else {
    // refazer o plano NÃO apaga o histórico: o app manda em que número a
    // contagem continua, e as notas do que já foi feito vão junto
    const prox = parseInt(body.proximaNumero, 10);
    numeroDaSemana = Number.isInteger(prox) && prox >= 1 && prox <= 999 ? prox : 1;
    if (Array.isArray(body.historicoNotas) && body.historicoNotas.length) {
      partes.push("HISTÓRICO DE NOTAS de semanas já treinadas (mais recente primeiro):\n" + JSON.stringify(body.historicoNotas.slice(0, 8)));
    }
    partes.push(numeroDaSemana > 1
      ? "Esta pessoa JÁ TREINOU com o coach e está refazendo o plano. Monte a apresentação do novo plano e a SEMANA "
        + numeroDaSemana + ", continuando de onde ela parou: use o histórico de notas acima para escolher a ênfase do bloco novo."
      : "Monte a apresentação do plano e a SEMANA 1, respeitando dias por semana, equipamento e limitações do perfil. Sem histórico de cargas, sugira começar leve e anotar.");
  }
  const texto = partes.join("\n\n");
  if (texto.length > 250_000) return json({ error: "data_too_large", detail: "Pedido grande demais (~250 KB máx)." }, 413);

  // limite diário por conta: o coach roda ~1x por semana; 10/dia já cobre
  // refazer plano e fechar semana no mesmo dia com folga
  if (env.DIARIO_KV) {
    const tz = env.TIMEZONE || "America/Sao_Paulo";
    const day = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const quotaKey = "treino:" + (uid ? uid + ":" : "") + day;
    const used = parseInt((await env.DIARIO_KV.get(quotaKey)) || "0", 10);
    const limit = parseInt(env.TRAINING_DAILY_LIMIT || "10", 10);
    if (used >= limit) {
      return json({ error: "daily_limit", detail: `Limite de ${limit} chamadas ao coach por dia atingido — tente amanhã.` }, 429);
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
      // mesmo modelo da análise cruzada: chamada rara (semanal) e o raciocínio
      // mais pesado — equilibrar 7 capacidades com o histórico da pessoa.
      // SEM cache de prompt pelo mesmo motivo da análise: semanal + TTL de 5
      // min = prefixo sempre escrito e nunca lido.
      model: env.CLAUDE_MODEL_ANALISE || "claude-fable-5",
      // a semana inteira em JSON (até 6 sessões com itens) precisa de espaço
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: acao === "fechar" ? SCHEMA_TREINO_FECHAR : SCHEMA_TREINO_PLANO },
      },
      system: SYSTEM_TREINO + "\n\n" + CONHECIMENTO_TREINO,
      messages: [{ role: "user", content: texto }],
    });
  } catch (err) {
    console.log("ERRO API /treino:", err && err.status, String((err && err.message) || err).slice(0, 300));
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "upstream_rate_limited", detail: "API ocupada — tente de novo em instantes." }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "bad_api_key", detail: "Sua chave da Anthropic foi recusada. Cadastre de novo em Dados." }, 502);
    }
    return json({ error: "upstream_error", detail: String((err && err.message) || err) }, 502);
  }
  if (msg.stop_reason === "refusal") {
    console.log("RECUSA /treino:", JSON.stringify(msg.stop_details || null));
    return json({ error: "refused", detail: "O modelo recusou montar este treino." }, 502);
  }
  const textBlock = (msg.content || []).find((b) => b.type === "text");
  let parsed;
  try { parsed = JSON.parse(textBlock ? textBlock.text : ""); } catch {
    return json({ error: "bad_model_output", detail: "Resposta do coach em formato inesperado." }, 502);
  }

  // validação defensiva: o schema garante a forma, mas o app vai GUARDAR isto
  // e reapresentar por semanas — limites de tamanho e faixas valem revalidar
  const txt = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const intOk = (v, min, max, padrao) => (Number.isInteger(v) && v >= min && v <= max ? v : padrao);
  const validarSemana = (s) => {
    if (!s || typeof s !== "object" || !Array.isArray(s.sessoes) || !s.sessoes.length) return null;
    const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
    const TIPOS = ["forca", "hipertrofia", "potencia", "equilibrio", "mobilidade", "z2", "z5", "picoFc"];
    const sessoes = s.sessoes.slice(0, 7).map((x) => ({
      dia: DIAS.includes(x.dia) ? x.dia : "seg",
      titulo: txt(x.titulo, 80) || "Sessão",
      tipo: TIPOS.includes(x.tipo) ? x.tipo : "forca",
      duracaoMin: intOk(x.duracaoMin, 5, 240, 45),
      itens: (Array.isArray(x.itens) ? x.itens : []).slice(0, 12)
        .filter((it) => it && txt(it.nome, 100))
        .map((it) => ({
          id: null,   // o app preenche
          nome: txt(it.nome, 100),
          registro: (it.registro === "tempo" || it.registro === "fc") ? it.registro : "carga",
          series: intOk(it.series, 1, 12, null),
          reps: txt(it.reps, 20) || null,
          cargaSugerida: txt(it.cargaSugerida, 40) || null,
          minutos: intOk(it.minutos, 1, 240, null),
          detalhe: txt(it.detalhe, 200),
        })),
    })).filter((x) => x.itens.length);
    if (!sessoes.length) return null;
    return {
      numero: intOk(s.numero, 1, 999, 1),
      bloco: txt(s.bloco, 60) || "Bloco",
      semanaDoBloco: intOk(s.semanaDoBloco, 1, 12, 1),
      semanasNoBloco: intOk(s.semanasNoBloco, 1, 12, 4),
      foco: txt(s.foco, 100),
      orientacoes: txt(s.orientacoes, 1200),
      sessoes,
    };
  };

  if (acao === "plano") {
    const semana = validarSemana(parsed.semana);
    if (!semana) return json({ error: "bad_model_output", detail: "O coach devolveu uma semana vazia — tente de novo." }, 502);
    semana.numero = numeroDaSemana;   // o app manda, o modelo não escolhe
    return json({ apresentacao: txt(parsed.apresentacao, 1500), semana, modelo: msg.model });
  }
  // acao === "fechar"
  const nota = (v) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(10, Math.round(v * 10) / 10)) : null);
  const semana = validarSemana(parsed.proximaSemana);
  if (!semana) return json({ error: "bad_model_output", detail: "O coach não devolveu a próxima semana — tente de novo." }, 502);
  semana.numero = numeroDaSemana;   // sempre a fechada + 1, aconteça o que acontecer
  const n0 = parsed.notas || {};
  return json({
    notas: {
      forca: nota(n0.forca), potencia: nota(n0.potencia), equilibrio: nota(n0.equilibrio),
      mobilidade: nota(n0.mobilidade), cardioZ2: nota(n0.cardioZ2), cardioZ5: nota(n0.cardioZ5),
    },
    avaliacao: txt(parsed.avaliacao, 3000),
    melhorias: (Array.isArray(parsed.melhorias) ? parsed.melhorias : []).slice(0, 5).map((m) => txt(m, 300)).filter(Boolean),
    proximaSemana: semana,
    modelo: msg.model,
  });
}

async function handleChat(request, env, json, uid) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const cred = await resolverChave(env, uid);
  if (cred.erro) return json(cred.erro, cred.erro.error === "no_api_key" ? 402 : 500);
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  if (rateLimited("chat:" + ip, 20)) return json({ error: "rate_limited", detail: "Muitas perguntas em pouco tempo — aguarde um minuto." }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const dados = body && body.dados;
  if (!dados || typeof dados !== "object") return json({ error: "missing_data", detail: "Envie {dados: {…}}." }, 400);

  // histórico: [{role:'user'|'assistant', text}] — a última tem que ser do
  // usuário, senão não há pergunta para responder
  const brutas = Array.isArray(body.mensagens) ? body.mensagens : [];
  const mensagens = brutas
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-30)   // conversa longa: só as últimas trocas vão junto
    .map((m) => ({ role: m.role, content: m.text }));
  if (!mensagens.length) return json({ error: "missing_question", detail: "Envie ao menos uma mensagem." }, 400);
  if (mensagens[mensagens.length - 1].role !== "user") {
    return json({ error: "last_not_user", detail: "A última mensagem precisa ser uma pergunta sua." }, 400);
  }

  const texto = JSON.stringify(dados);
  if (texto.length > 200_000) return json({ error: "data_too_large", detail: "Resumo grande demais (~200 KB máx)." }, 413);
  // Medido no texto ORIGINAL, de propósito: cortar a mensagem para caber
  // devolveria uma resposta a uma pergunta que a pessoa não fez, sem ela
  // perceber. Melhor recusar e dizer o motivo.
  const totalConversa = mensagens.reduce((n, m) => n + m.content.length, 0);
  if (totalConversa > 200_000) return json({ error: "chat_too_large", detail: "Conversa longa demais — comece uma nova." }, 413);

  // cota diária separada da análise: perguntar é mais frequente que analisar,
  // e um limite comum faria uma conversa consumir a cota de análise do dia
  if (env.DIARIO_KV) {
    const tz = env.TIMEZONE || "America/Sao_Paulo";
    const day = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const quotaKey = "chats:" + (uid ? uid + ":" : "") + day;
    const used = parseInt((await env.DIARIO_KV.get(quotaKey)) || "0", 10);
    const limit = parseInt(env.CHAT_DAILY_LIMIT || "100", 10);
    if (used >= limit) {
      return json({ error: "daily_limit", detail: `Limite de ${limit} perguntas por dia atingido — tente amanhã.` }, 429);
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
      model: env.CLAUDE_MODEL_CHAT || "claude-opus-5",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      // os dados entram no system, não como mensagem: assim o histórico da
      // conversa fica só com o que a pessoa e a IA disseram.
      //
      // DOIS BLOCOS, e a ordem importa: o cache de prompt é casamento de
      // PREFIXO, então tudo que não muda vem primeiro e leva a marca. A partir
      // da segunda pergunta da mesma conversa, esses ~2.700 tokens de prompt +
      // base custam 10% em vez de 100%. Encarece a PRIMEIRA pergunta em 25% —
      // o empate é na segunda, e quem abre a aba de conversa quase nunca faz
      // só uma. O bloco de baixo é o que varia (dados da pessoa) e fica de
      // fora do cache de propósito: se entrasse antes da marca, qualquer
      // pesagem nova invalidaria tudo.
      system: [
        {
          type: "text",
          text: SYSTEM_CHAT + INSTRUCAO_CONHECIMENTO + "\n\n" + CONHECIMENTO,
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: "DADOS DA PESSOA (JSON):\n" + texto },
      ],
      messages: mensagens,
    });
  } catch (err) {
    console.log("ERRO API /chat:", err && err.status, String((err && err.message) || err).slice(0, 300));
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "upstream_rate_limited", detail: "API ocupada — tente de novo em instantes." }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "bad_api_key", detail: "Sua chave da Anthropic foi recusada. Cadastre de novo em Dados." }, 502);
    }
    return json({ error: "upstream_error", detail: String((err && err.message) || err) }, 502);
  }
  if (msg.stop_reason === "refusal") {
    console.log("RECUSA /chat:", JSON.stringify(msg.stop_details || null));
    return json({ error: "refused", detail: "O modelo recusou responder isto." }, 502);
  }
  const resposta = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!resposta) {
    return json({ error: "empty_response", detail: "Resposta sem conteúdo (stop: " + msg.stop_reason + ")." }, 502);
  }
  return json({ resposta, modelo: msg.model });
}

// ===========================================================================
// OPEN BRAIN — envio periódico de contexto de saúde
// ===========================================================================
// Manda SÍNTESE, não registro cru. O Open Brain é memória semântica: cada
// captura vira um "pensamento" com embedding, e NÃO existe apagar nem
// atualizar. Um envio diário de "12/08: 2150 kcal" viraria centenas de
// entradas quase idênticas competindo com as notas reais da pessoa na busca —
// e sem volta. Por isso: um retrato por semana + um pensamento por exame novo.
//
// O que SOBE: números agregados e resultados de exame com a faixa de
// referência anotada pela pessoa.
// O que NUNCA sobe: foto, laudo em texto livre, resumo de exame de imagem,
// e o diário item a item.

// QUEM pode mandar contexto para o Open Brain.
//
// O app é multiusuário e a chave do Open Brain é UMA só, do Worker: sem esta
// trava, o retrato semanal e os exames de QUALQUER pessoa que ligasse a opção
// cairiam no brain de quem hospeda — que não é dono desses dados e não deveria
// virar depositário deles. `OPENBRAIN_CONTAS` lista os e-mails autorizados.
//
// FALHA FECHADA de propósito: lista vazia = ninguém sincroniza, nem o dono.
// Um deploy que esqueceu de configurar tem que não enviar nada, e não enviar
// tudo de todo mundo.
async function podeOpenBrain(env, uid) {
  const lista = String(env.OPENBRAIN_CONTAS || "")
    .split(",").map((e) => normEmail(e)).filter(Boolean);
  if (!lista.length) return false;
  for (const email of lista) {
    if ((await sha256Hex(email)) === uid) return true;
  }
  return false;
}

const OPENBRAIN_URL_PADRAO = "https://speueyaplfprjpgnakxm.supabase.co/functions/v1/open-brain-capture";

// A API dispara um LEMBRETE com data quando o texto contém "me lembre de" e
// variantes. Nossa síntese fala de exames a repetir, então precisa evitar
// essas construções — senão o app cria lembretes fantasma no Open Brain.
function semGatilhoDeLembrete(texto) {
  return String(texto).replace(/\bme\s+lembr\w*\s+(de|da|do|dos|das|que|pra|para)\b/gi, "anotar");
}

// Adaptador do endpoint. Detalhes que NÃO são padrão e já custaram engano:
// autenticação é o cabeçalho x-brain-key (Authorization é ignorado), e a
// resposta vem em text/plain — erro chega como "⚠️ Não guardei: ...".
async function enviarAoOpenBrain(env, texto) {
  const url = env.OPENBRAIN_URL || OPENBRAIN_URL_PADRAO;
  const chave = env.OPENBRAIN_KEY;
  if (!chave) throw new Error("OPENBRAIN_KEY não configurada no Worker.");
  const limpo = semGatilhoDeLembrete(String(texto || "").trim());
  if (!limpo) throw new Error("texto vazio");

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-brain-key": chave, "Content-Type": "application/json" },
    body: JSON.stringify({ text: limpo }),
  });
  const corpo = (await res.text()).trim();
  if (!res.ok || corpo.startsWith("⚠️")) {
    throw new Error("Open Brain recusou (HTTP " + res.status + "): " + corpo.slice(0, 200));
  }
  return corpo;
}

const nz = (v) => (v == null || Number.isNaN(v) ? null : v);
function media(lista) {
  const v = lista.filter((x) => typeof x === "number" && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const dataBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "?");
};

// ---- retrato semanal ------------------------------------------------------
// Texto corrido de propósito: é assim que a busca semântica do Open Brain
// funciona bem. Só entra o que existe — nada de "sem dados" enchendo linguiça.
function montarRetrato(state, hojeISO) {
  const partes = [];
  const dias = state.days || {};
  const corte = new Date(Date.parse(hojeISO) - 30 * 86400000).toISOString().slice(0, 10);

  const kcalPorDia = [];
  const protPorDia = [];
  Object.keys(dias).filter((d) => d >= corte).forEach((d) => {
    const it = (dias[d] || {}).items || [];
    if (!it.length) return;
    const k = it.reduce((n, x) => n + (Number(x.kcal) || 0), 0);
    const p = it.reduce((n, x) => n + (Number(x.prot) || 0), 0);
    if (k > 0) { kcalPorDia.push(k); protPorDia.push(p); }
  });
  if (kcalPorDia.length) {
    partes.push(`Nos últimos 30 dias registrou ${kcalPorDia.length} dia(s) de diário alimentar, `
      + `com média de ${Math.round(media(kcalPorDia))} kcal/dia`
      + (media(protPorDia) ? ` e ${Math.round(media(protPorDia))} g de proteína/dia` : "") + ".");
  }

  const pesos = Object.keys(state.weights || {}).sort();
  if (pesos.length) {
    const ini = pesos[0], fim = pesos[pesos.length - 1];
    const kgIni = state.weights[ini], kgFim = state.weights[fim];
    partes.push(`Peso mais recente: ${kgFim} kg em ${dataBR(fim)}`
      + (pesos.length > 1 && ini !== fim
        ? ` (era ${kgIni} kg em ${dataBR(ini)}, variação de ${(kgFim - kgIni).toFixed(1)} kg).`
        : "."));
  }

  const bc = Object.keys(state.bodyComp || {}).sort();
  if (bc.length) {
    const u = state.bodyComp[bc[bc.length - 1]] || {};
    const campos = [];
    if (nz(u.fat) != null) campos.push(`${u.fat}% de gordura`);
    if (nz(u.lean) != null) campos.push(`${u.lean}% de massa magra`);
    if (campos.length) partes.push(`Composição corporal em ${dataBR(bc[bc.length - 1])}: ${campos.join(" e ")}.`);
  }

  const diasSaude = Object.keys((state.health || {}).daily || {}).sort().slice(-30);
  if (diasSaude.length) {
    const val = (k) => media(diasSaude.map((d) => state.health.daily[d][k]));
    const m = [];
    if (val("steps")) m.push(`${Math.round(val("steps"))} passos/dia`);
    if (val("sleepMin")) m.push(`${(val("sleepMin") / 60).toFixed(1)} h de sono/noite`);
    if (val("hrRest")) m.push(`frequência cardíaca de repouso ${Math.round(val("hrRest"))} bpm`);
    if (val("vo2max")) m.push(`VO2máx ${val("vo2max").toFixed(1)}`);
    if (m.length) partes.push(`Métricas do relógio (média dos últimos ${diasSaude.length} dias): ${m.join(", ")}.`);
  }

  if (!partes.length) return null;   // conta sem dado nenhum: não polui o brain
  return `Retrato de saúde de ${dataBR(hojeISO)} (registrado no app Highlander). ` + partes.join(" ");
}

// ---- um exame laboratorial = um pensamento --------------------------------
function montarExame(ex) {
  const valor = [ex.value, ex.unit].filter(Boolean).join(" ");
  const faixa = (nz(ex.refLow) != null || nz(ex.refHigh) != null)
    ? ` Faixa de referência do laudo: ${nz(ex.refLow) != null ? ex.refLow : "?"} a ${nz(ex.refHigh) != null ? ex.refHigh : "?"}${ex.unit ? " " + ex.unit : ""}.`
    : " O laudo não trazia faixa de referência anotada.";
  const fora = (typeof ex.num === "number" && (
    (nz(ex.refLow) != null && ex.num < ex.refLow) || (nz(ex.refHigh) != null && ex.num > ex.refHigh)))
    ? " Está FORA da faixa anotada." : "";
  return `Exame laboratorial de ${dataBR(ex.date)}: ${ex.name} = ${valor}.${faixa}${fora}`
    + (ex.obs ? ` Observação: ${ex.obs}` : "");
}

// ---- reconciliação: manda o que ainda não foi mandado ----------------------
// O LEDGER é obrigatório, não otimização: sem apagar nem atualizar no destino,
// reenviar duplicaria de forma irreversível. Existir ledger = conta ativou.
async function sincronizarOpenBrain(env, uid, opts) {
  opts = opts || {};
  const chaveLedger = "openbrain:" + uid;
  const bruto = await env.DIARIO_KV.get(chaveLedger);
  if (!bruto && !opts.ativar) return { pulou: "conta não ativou o envio" };
  const ledger = bruto ? JSON.parse(bruto) : { ativo: true, ultimoRetratoEm: null, examesEnviados: [] };
  if (!ledger.ativo && !opts.ativar) return { pulou: "envio desativado nesta conta" };
  if (opts.ativar) ledger.ativo = true;

  const rec = await env.DIARIO_KV.get("data:" + uid);
  if (!rec) return { pulou: "conta sem dados na nuvem" };
  let state;
  try { state = JSON.parse(await decryptText(env, uid, JSON.parse(rec))); } catch {
    return { erro: "não consegui abrir os dados desta conta" };
  }

  const agora = opts.agora || new Date().toISOString();
  const hoje = agora.slice(0, 10);
  const enviados = [];
  const falhas = [];

  // 1) exames laboratoriais novos (o que a pessoa digitou; nunca o laudo)
  const jaFoi = new Set(ledger.examesEnviados || []);
  const novos = (state.labExams || []).filter((e) => e && e.id && !jaFoi.has(e.id));
  for (const ex of novos.slice(0, 40)) {   // teto por execução: 1–3 s cada
    try {
      await enviarAoOpenBrain(env, montarExame(ex));
      ledger.examesEnviados.push(ex.id);
      enviados.push("exame:" + ex.id);
    } catch (e) {
      falhas.push("exame " + ex.id + ": " + e.message);
      break;   // API fora do ar: para e tenta na próxima, sem furar o ledger
    }
  }

  // 2) retrato periódico (padrão: no máximo 1 a cada 7 dias)
  const minDias = parseInt(env.OPENBRAIN_DIAS_RETRATO || "7", 10);
  const passou = !ledger.ultimoRetratoEm
    || (Date.parse(hoje) - Date.parse(ledger.ultimoRetratoEm)) >= minDias * 86400000;
  if (passou || opts.forcarRetrato) {
    const texto = montarRetrato(state, hoje);
    if (texto) {
      try {
        await enviarAoOpenBrain(env, texto);
        ledger.ultimoRetratoEm = hoje;
        enviados.push("retrato");
      } catch (e) {
        falhas.push("retrato: " + e.message);
      }
    }
  }

  await env.DIARIO_KV.put(chaveLedger, JSON.stringify(ledger));
  return { enviados, falhas, ativo: ledger.ativo };
}

// POST /openbrain/sync   — o app chama depois de registrar exame
// POST /openbrain/sync {ativar:true} / {desativar:true} — liga/desliga
// GET  /openbrain/sync   — estado atual (para a interface)
async function handleOpenBrain(request, env, json, uid) {
  if (!uid) return json({ error: "login_required", detail: "Entre na sua conta." }, 401);
  if (!env.DIARIO_KV) return json({ error: "server_not_configured" }, 500);
  const chaveLedger = "openbrain:" + uid;
  const permitido = await podeOpenBrain(env, uid);

  if (request.method === "GET") {
    const bruto = await env.DIARIO_KV.get(chaveLedger);
    const l = bruto ? JSON.parse(bruto) : null;
    return json({
      permitido,
      ativo: !!(l && l.ativo),
      configurado: !!env.OPENBRAIN_KEY,
      ultimoRetratoEm: l ? l.ultimoRetratoEm : null,
      examesEnviados: l ? (l.examesEnviados || []).length : 0,
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!permitido) {
    return json({
      error: "openbrain_nao_permitido",
      detail: "O envio ao Open Brain está restrito à conta de quem administra este app.",
    }, 403);
  }

  let body = {};
  try { body = await request.json(); } catch { /* corpo vazio é válido aqui */ }

  if (body.desativar) {
    const bruto = await env.DIARIO_KV.get(chaveLedger);
    // preserva o histórico do que já foi enviado: religar não pode reenviar tudo
    const l = bruto ? JSON.parse(bruto) : { ultimoRetratoEm: null, examesEnviados: [] };
    l.ativo = false;
    await env.DIARIO_KV.put(chaveLedger, JSON.stringify(l));
    return json({ ok: true, ativo: false });
  }
  if (!env.OPENBRAIN_KEY) {
    return json({ error: "openbrain_off", detail: "Quem administra o app ainda não cadastrou a chave do Open Brain." }, 501);
  }
  const r = await sincronizarOpenBrain(env, uid, { ativar: !!body.ativar, forcarRetrato: !!body.forcarRetrato });
  return json(r);
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
    if (limitado(env, "signup:" + ip, 5)) return json({ error: "rate_limited", detail: "Muitas tentativas — aguarde um minuto." }, 429);
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
    if (limitado(env, "login:" + ip + ":" + email, 10)) {
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
    if (limitado(env, "forgot:" + ip, 4)) return json({ error: "rate_limited", detail: "Muitas tentativas — aguarde um minuto." }, 429);
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
    if (limitado(env, "reset:" + ip, 10)) return json({ error: "rate_limited" }, 429);
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
// Envolve o rate-limit permitindo desligá-lo APENAS no servidor de
// desenvolvimento (RATE_LIMIT_OFF=1). Em produção a variável não existe, então
// o limite vale sempre — rodar a bateria de testes local é que ficaria
// impraticável com 5 cadastros por minuto.
function limitado(env, chave, max) {
  if (env && env.RATE_LIMIT_OFF === "1") return false;
  return rateLimited(chave, max);
}

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

    // ---- conversa sobre os próprios dados (perguntas pontuais) ----
    if (url.pathname === "/chat") return handleChat(request, env, json, uid);

    // ---- coach de treino (semana a semana, com notas) ----
    if (url.pathname === "/treino") return handleTreino(request, env, json, uid);

    // ---- envio de contexto de saúde para o Open Brain ----
    if (url.pathname === "/openbrain/sync") return handleOpenBrain(request, env, json, uid);

    // ---- chave da API da própria pessoa (BYOK) ----
    if (url.pathname === "/account/apikey") {
      if (!uid) return json({ error: "no_session", detail: "Esta rota exige login por conta." }, 401);
      return handleApiKey(request, env, json, uid);
    }

    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const cred = await resolverChave(env, uid);
    if (cred.erro) return json(cred.erro, cred.erro.error === "no_api_key" ? 402 : 500);

    if (limitado(env, ip, 15)) return json({ error: "rate_limited", detail: "Muitas fotos em pouco tempo — aguarde um minuto." }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const image = body && body.image;
    const mediaType = body && body.mediaType;
    const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    // PDF é enviado direto para a API (ela lê documento nativamente) — assim
    // o app não precisa de biblioteca de PDF no navegador. Laudo costuma ter
    // várias páginas, então o limite é maior que o de foto.
    const ehPdf = mediaType === "application/pdf";
    if (typeof image !== "string" || !image.length) return json({ error: "missing_image" }, 400);
    if (ehPdf) {
      if (image.length > 12_000_000) return json({ error: "file_too_large", detail: "PDF grande demais (~9 MB máx)." }, 413);
    } else {
      if (image.length > 7_000_000) return json({ error: "image_too_large", detail: "Imagem grande demais (~5 MB máx)." }, 413);
      if (!okTypes.includes(mediaType)) return json({ error: "unsupported_media_type" }, 415);
    }
    // PDF só faz sentido nos modos de laudo (refeição/rótulo são foto)
    if (ehPdf && !["exame_lab", "exame_img"].includes(body.mode)) {
      return json({ error: "unsupported_media_type", detail: "PDF só é aceito para laudos de exame." }, 415);
    }

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

    // modos de leitura: refeição (padrão), tabela nutricional, laudo de
    // laboratório ou laudo de imagem
    const modo = body.mode || "refeicao";
    const isRotulo = modo === "rotulo";
    const isLab = modo === "exame_lab";
    const isImg = modo === "exame_img";
    // produtos que o usuário cadastrou com foto de rótulo — permitem que a
    // foto da embalagem reaproveite o alimento já cadastrado
    const produtos = Array.isArray(body.produtos)
      ? body.produtos.filter((p) => typeof p === "string" && p.trim()).slice(0, 60).map((p) => p.trim().slice(0, 120))
      : [];

    const esquema = isLab ? SCHEMA_EXAME_LAB : isImg ? SCHEMA_EXAME_IMG : isRotulo ? SCHEMA_ROTULO : SCHEMA;
    const sistema = isLab ? SYSTEM_EXAME_LAB : isImg ? SYSTEM_EXAME_IMG : isRotulo ? SYSTEM_ROTULO : SYSTEM;
    const pedido = isLab
      ? "Transcreva TODOS os analitos deste laudo laboratorial, com valor, unidade e a faixa de referência impressa (quando houver)."
      : isImg
        ? "Transcreva a conclusão deste laudo de imagem, com a data, o nome do exame e o local."
        : isRotulo
          ? "Extraia os dados da tabela nutricional desta foto."
          : "Identifique os alimentos desta refeição e estime as gramas de cada um."
            + (produtos.length ? "\n\nPRODUTOS CADASTRADOS (use no campo \"produto\" se a foto mostrar a embalagem de um deles):\n- " + produtos.join("\n- ") : "");
    // PDF vai como bloco "document" (a API lê PDF nativamente); foto como "image"
    const anexo = ehPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: image } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: image } };

    let msg;
    try {
      msg = await client.messages.create({
        model: env.CLAUDE_MODEL || "claude-opus-5",
        // laudo de laboratório rende muitos analitos: precisa de mais espaço
        max_tokens: isLab ? 8192 : 4096,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: esquema },
        },
        system: sistema,
        messages: [{ role: "user", content: [anexo, { type: "text", text: pedido }] }],
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

    // ---- modo laudo laboratorial: valida cada analito ----
    if (isLab) {
      const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
      const txt = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
      const dataOk = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      const analitos = (Array.isArray(parsed.analitos) ? parsed.analitos : [])
        .filter((a) => a && txt(a.nome, 120) && txt(a.valor, 80))
        .slice(0, 120)   // laudo grande (hemograma + bioquímica) cabe folgado
        .map((a) => ({
          nome: txt(a.nome, 120),
          valor: txt(a.valor, 80),
          unidade: txt(a.unidade, 30),
          refMin: num(a.refMin),
          refMax: num(a.refMax),
          obs: txt(a.obs, 200),
        }));
      return json({
        exameLab: {
          data: dataOk(parsed.data),
          laboratorio: txt(parsed.laboratorio, 120),
          analitos,
          observacao: typeof parsed.observacao === "string" ? parsed.observacao : "",
        },
        modelo: msg.model,
      });
    }

    // ---- modo laudo de imagem ----
    if (isImg) {
      const txt = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
      const dataOk = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      return json({
        exameImg: {
          data: dataOk(parsed.data),
          exame: txt(parsed.exame, 140),
          local: txt(parsed.local, 140),
          conclusao: typeof parsed.conclusao === "string" ? parsed.conclusao.trim().slice(0, 4000) : "",
          observacao: typeof parsed.observacao === "string" ? parsed.observacao : "",
        },
        modelo: msg.model,
      });
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

  // ---- cron (wrangler.jsonc -> triggers.crons): retrato periódico ----------
  // Percorre só quem ATIVOU (a existência da chave openbrain:<uid> é o opt-in),
  // então o custo é proporcional a quem quis, não ao total de contas.
  async scheduled(event, env, ctx) {
    if (!env.OPENBRAIN_KEY || !env.DIARIO_KV) return;
    let cursor;
    do {
      const pag = await env.DIARIO_KV.list({ prefix: "openbrain:", cursor });
      for (const k of pag.keys) {
        const uid = k.name.slice("openbrain:".length);
        // trava também aqui, não só na rota: um livro-caixa criado antes da
        // regra (ou depois de tirarem alguém da lista) não pode voltar a enviar
        if (!(await podeOpenBrain(env, uid))) continue;
        try {
          const r = await sincronizarOpenBrain(env, uid);
          if (r && r.falhas && r.falhas.length) console.log("OPENBRAIN falhas", uid, r.falhas.join(" | "));
        } catch (e) {
          console.log("OPENBRAIN erro", uid, String((e && e.message) || e).slice(0, 200));
        }
      }
      cursor = pag.list_complete ? null : pag.cursor;
    } while (cursor);
  },
};
