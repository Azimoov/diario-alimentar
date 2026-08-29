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
    // o system pode vir como texto ou como LISTA DE BLOCOS (é assim que o
    // cache de prompt marca o prefixo estável) — achata para inspecionar
    const sys = Array.isArray(body.system)
      ? body.system.map((b) => (b && b.text) || "").join("\n\n")
      : String(body.system || "");
    const isRotulo = sys.includes("tabelas nutricionais");
    const isAnalise = sys.includes("dados de saúde PESSOAIS");
    const isChat = sys.includes("responde perguntas de UMA pessoa");
    const isLab = sys.includes("laudos de exames laboratoriais");
    const isImg = sys.includes("laudos de exames de imagem");
    const isTreino = sys.includes("coach de treino");
    const tipoAnexo = ((((body.messages || [])[0] || {}).content || [])[0] || {}).type || "?";
    // ---- modo coach de treino: fixtures fixas que os testes conhecem ------
    const semanaTreino = (n, carga) => ({
      numero: n,
      bloco: "Base geral", semanaDoBloco: n, semanasNoBloco: 4,
      foco: "Adaptação e técnica",
      orientacoes: "Comece leve, anote tudo. Dor articular aguda não é dor boa: troque o exercício.",
      sessoes: [
        { dia: "seg", titulo: "Força A", tipo: "forca", duracaoMin: 45, itens: [
          { nome: "Agachamento", registro: "carga", series: 3, reps: "5", cargaSugerida: carga + " kg", descansoSeg: 180, minutos: null, detalhe: "carga alta pede série de qualidade" },
          { nome: "Supino", registro: "carga", series: 3, reps: "5", cargaSugerida: "30 kg", descansoSeg: 90, minutos: null, detalhe: "" },
        ] },
        { dia: "qua", titulo: "Zona 2", tipo: "z2", duracaoMin: 40, itens: [
          { nome: "Caminhada rápida ou bike", registro: "tempo", series: null, reps: null, cargaSugerida: null, descansoSeg: null, minutos: 40, detalhe: "ritmo de conversa" },
        ] },
        { dia: "ter", titulo: "Pico do dia", tipo: "picoFc", duracaoMin: 10, itens: [
          { nome: "Subida de escada forte", registro: "fc", series: 2, reps: "30 s", cargaSugerida: "esforço máximo", descansoSeg: 45, minutos: null, detalhe: "anote o pico do relógio" },
        ] },
        { dia: "sex", titulo: "Potência e equilíbrio", tipo: "potencia", duracaoMin: 30, itens: [
          { nome: "Salto horizontal", registro: "carga", series: 3, reps: "3", cargaSugerida: "peso do corpo", descansoSeg: 240, minutos: null, detalhe: "intenção máxima, descansado" },
          { nome: "Apoio unipodal olhos fechados", registro: "tempo", series: null, reps: null, cargaSugerida: null, descansoSeg: null, minutos: 2, detalhe: "anote os segundos por perna" },
        ] },
      ],
    });
    const isMemoria = sys.includes("arquivo de memória");
    if (isMemoria) {
      // ecoa trechos REAIS do arquivo recebido: a peneira do Worker exige que
      // o `trecho` exista no texto, então uma fixture inventada seria
      // descartada e o teste passaria a testar o descarte, não a leitura.
      const arq = String(((body.messages || [])[0] || {}).content || "");
      const acha = (re) => { const m = re.exec(arq); return m ? m[0] : null; };
      const linhaIdade = acha(/[^\n]*4[0-9] anos[^\n]*/);
      const linhaRemedio = acha(/[^\n]*[Rr]osuvastatina[^\n]*/);
      const linhaExame = acha(/[^\n]*[Gg]licose[^\n]*/);
      const conteudo = {
        resumo: "Achei idade, altura e um remédio. Não achei peso recente nem exames com data.",
        perfil: linhaIdade
          ? { sexo: "m", idade: 47, altura: 178, peso: null, objetivo: "emagrecer sem perder força", trecho: linhaIdade }
          : { sexo: null, idade: null, altura: null, peso: null, objetivo: null, trecho: "" },
        medicamentos: linhaRemedio
          ? [{ nome: "Rosuvastatina", tipo: "remedio", dose: "10 mg", motivo: "colesterol", trecho: linhaRemedio },
             // este NÃO existe no arquivo: o Worker tem que descartar
             { nome: "Remedio Fantasma", tipo: "remedio", dose: "1 g", motivo: "inventado", trecho: "frase que nunca foi escrita neste arquivo" }]
          : [],
        exames: linhaExame
          ? [{ nome: "Glicose em jejum", valor: "92", unidade: "mg/dL", data: "2026-06-10", trecho: linhaExame },
             // sem data: o app não importa, mas o Worker deixa passar
             { nome: "Colesterol total", valor: "188", unidade: "mg/dL", data: null, trecho: linhaExame }]
          : [],
        rotinaTreino: "Treina de manhã cedo, três vezes por semana.",
        contexto: "Prefere comida de verdade a suplemento. Já tentou low carb e não sustentou.",
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        id: "msg_memoria", type: "message", role: "assistant", model: body.model || "dev", stop_reason: "end_turn",
        content: [{ type: "tool_use", id: "tu_1", name: "registrar", input: conteudo }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }));
    }
    if (isTreino) {
      const corpo = JSON.stringify(body.messages || []);
      const m = /SEMANA FECHADA \(número (\d+)\)/.exec(corpo);
      const conteudoTreino = m
        ? {
            notas: { forca: 6.5, potencia: 5, equilibrio: 7, mobilidade: 6, cardioZ2: 5.5, cardioZ5: null },
            avaliacao: "RESPOSTA FIXA DO COACH: melhor capacidade equilíbrio, pior potência. Zona 5 sem registro — sem nota.",
            melhorias: ["Priorizar potência: saltos no começo da sessão", "Registrar uma sessão de Zona 5 para ter nota"],
            proximaSemana: semanaTreino(parseInt(m[1], 10) + 1, "42"),
          }
        : {
            apresentacao: "PLANO FIXO DO MOCK: blocos de 4 semanas, começando por base geral.",
            semana: semanaTreino(1, "40"),
          };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        id: "msg_treino", type: "message", role: "assistant", model: "dev", stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(conteudoTreino) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }));
    }
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
  // só no desenvolvimento: sem isto, rodar a bateria de testes seguida esbarra
  // no limite de 5 cadastros por minuto por IP
  RATE_LIMIT_OFF: "1",
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
