// openbrain.mjs — testa o envio de contexto de saúde para o Open Brain sem
// tocar no Open Brain de verdade: sobe uma cópia fiel do endpoint em
// localhost, com as MESMAS esquisitices da função real, porque foi nelas que
// o palpite inicial teria quebrado:
//   - autenticação é o cabeçalho x-brain-key (Authorization é IGNORADO);
//   - a resposta é text/plain, não JSON;
//   - erro vem com "⚠️ Não guardei: ..." (e status 4xx).
//
// O ponto mais importante coberto aqui é a NÃO-DUPLICAÇÃO: o Open Brain não
// tem apagar nem atualizar, então reenviar um exame é um estrago permanente.
//
// Roda sem navegador:  node test/openbrain.mjs
import { createServer } from "node:http";
import worker from "../src/index.js";

const PORT = 8127;
const CHAVE = "chave-de-teste-do-brain";
let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? "PASS" : "FAIL") + "  " + n + (extra != null ? "  [" + String(extra).slice(0, 170) + "]" : ""));
  if (!ok) fails++;
};

// ---- cópia fiel do endpoint real ------------------------------------------
const capturados = [];
let derrubado = false;
const brain = createServer((req, res) => {
  if (derrubado) { res.writeHead(500, { "Content-Type": "text/plain" }); return res.end("⚠️ Não guardei: caiu"); }
  if (req.method !== "POST") { res.writeHead(405, { "Content-Type": "text/plain" }); return res.end("⚠️ Não guardei: método"); }
  // Authorization NÃO vale; só x-brain-key (ou ?key=)
  const url = new URL(req.url, "http://x");
  const k = req.headers["x-brain-key"] || url.searchParams.get("key");
  if (k !== CHAVE) { res.writeHead(401, { "Content-Type": "text/plain" }); return res.end("⚠️ Não guardei: chave inválida"); }
  let d = "";
  req.on("data", (c) => (d += c));
  req.on("end", () => {
    let texto = "";
    if (String(req.headers["content-type"] || "").includes("application/json")) {
      try { const b = JSON.parse(d || "{}"); texto = b.text ?? b.content ?? ""; } catch { texto = ""; }
    } else { texto = d; }
    if (!String(texto).trim()) { res.writeHead(400, { "Content-Type": "text/plain" }); return res.end("⚠️ Não guardei: vazio"); }
    capturados.push(String(texto));
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("✅ Guardado em Áreas/Pessoal/Saúde · observação\n🏷️ saúde, exames");
  });
});

// ---- KV em memória + estado de uma conta ----------------------------------
const kv = new Map();
const EMAIL = "brain@example.com";
let UID = null;      // descoberto após criar a conta de verdade
let SESSAO = null;
const ENV = {
  ALLOWED_ORIGINS: "http://localhost:8123",
  INVITE_CODE: "convite-teste",
  RESEND_API_KEY: "re_falsa",
  MAIL_FROM: "Highlander <t@example.com>",
  APP_BASE_URL: "http://localhost:8123/",
  DIARIO_KV: {
    async get(k) { return kv.has(k) ? kv.get(k) : null; },
    async put(k, v) { kv.set(k, v); },
    async delete(k) { kv.delete(k); },
    async list({ prefix, cursor }) {
      const keys = [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: null };
    },
  },
  DATA_KEY: "chave-de-dados-de-teste-nao-usar-em-producao",
  OPENBRAIN_URL: `http://localhost:${PORT}`,
  OPENBRAIN_KEY: CHAVE,
  OPENBRAIN_DIAS_RETRATO: "7",
};

const hojeISO = new Date().toISOString().slice(0, 10);
const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
function estadoBase() {
  return {
    days: {
      [hojeISO]: { items: [{ kcal: 800, prot: 60 }, { kcal: 700, prot: 40 }] },
      [ontem]: { items: [{ kcal: 1500, prot: 90 }] },
    },
    weights: { "2026-01-10": 92.4, [hojeISO]: 82.4 },
    bodyComp: { [hojeISO]: { fat: 19.4, lean: 42.1 } },
    labExams: [
      { id: "e1", date: "2026-07-30", name: "Ferritina", value: "18", num: 18, unit: "ng/mL", refLow: 30, refHigh: 400 },
      { id: "e2", date: "2026-07-30", name: "Glicose em jejum", value: "92", num: 92, unit: "mg/dL", refLow: 70, refHigh: 99 },
      { id: "e3", date: "2026-07-30", name: "Anti-HIV", value: "não reagente", num: null, unit: null, refLow: null, refHigh: null },
    ],
    imgExams: [{ id: "i1", date: "2026-07-15", name: "Ultrassom", place: "Clínica X", report: "LAUDO SIGILOSO EM TEXTO LIVRE" }],
    health: { daily: { [hojeISO]: { steps: 9800, sleepMin: 412, hrRest: 54, vo2max: 44.1 } } },
    analyses: [{ id: "a1", at: "2026-08-01T10:00:00Z", text: "ANÁLISE COMPLETA EM TEXTO LIVRE" }],
    chat: { mensagens: [{ role: "user", text: "PERGUNTA PRIVADA DO CHAT" }] },
  };
}
// mesmo PBKDF2 do navegador: a senha nunca vai crua ao servidor
async function derivarAuthKey(email, senha) {
  const te = new TextEncoder();
  const salt = await crypto.subtle.digest("SHA-256", te.encode("highlander-auth:" + email.trim().toLowerCase()));
  const base = await crypto.subtle.importKey("raw", te.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, base, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// grava pelo fluxo REAL (conta + sessão + rota), para usar a mesma cifragem
// que a produção usa — nada de atalho que testaria outra coisa
async function gravarEstado(state) {
  const res = await worker.fetch(new Request("https://p.example/account/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Session": SESSAO },
    body: JSON.stringify({ state: JSON.stringify(state) }),
  }), ENV);
  if (res.status !== 200) throw new Error("falha ao gravar estado: " + res.status);
}

const sync = (body) => new Request("https://p.example/openbrain/sync", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
});

brain.listen(PORT, async () => {
  try {
    // ---- conta de verdade, sessão de verdade, cifragem de verdade ----
    const authKey = await derivarAuthKey(EMAIL, "senha-do-brain-1");
    const rSignup = await worker.fetch(new Request("https://p.example/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, authKey, invite: "convite-teste" }),
    }), ENV);
    SESSAO = (await rSignup.json()).session;
    check("conta de teste criada", rSignup.status === 200 && !!SESSAO, rSignup.status);
    UID = [...kv.keys()].filter((k) => k.startsWith("acct:")).map((k) => k.slice(5))[0];
    check("uid da conta descoberto", !!UID, UID);

    await gravarEstado(estadoBase());
    check("estado de teste foi cifrado e gravado", !!kv.get("data:" + UID));

    // ---- 1) sem login a rota recusa ----
    const r1 = await worker.fetch(sync({ ativar: true }), ENV);
    check("sem login a rota recusa", r1.status === 401, r1.status);

    // ---- ativação pela rota real (com sessão) ----
    const rAtiva = await worker.fetch(new Request("https://p.example/openbrain/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session": SESSAO },
      body: JSON.stringify({ ativar: true }),
    }), ENV);
    const corpoAtiva = await rAtiva.json();
    check("ativar pela rota envia exames e retrato", rAtiva.status === 200
      && (corpoAtiva.enviados || []).length === 4, JSON.stringify(corpoAtiva).slice(0, 160));

    const scheduled = worker.scheduled;
    check("enviou os 3 exames laboratoriais", capturados.filter(t => /Exame laboratorial/.test(t)).length === 3,
      capturados.filter(t => /Exame laboratorial/.test(t)).length);
    check("enviou 1 retrato", capturados.filter(t => /^Retrato de saúde/.test(t)).length === 1);

    // ---- 2) o que NUNCA pode vazar ----
    const tudo = capturados.join("\n");
    check("laudo de imagem NÃO sobe", !tudo.includes("LAUDO SIGILOSO"));
    check("texto da análise NÃO sobe", !tudo.includes("ANÁLISE COMPLETA"));
    check("conversa do chat NÃO sobe", !tudo.includes("PERGUNTA PRIVADA"));
    check("diário item a item NÃO sobe (só a média)", !/\bitems?\b/i.test(tudo));

    // ---- 3) conteúdo útil de verdade ----
    check("exame leva valor, unidade e faixa do laudo",
      /Ferritina = 18 ng\/mL/.test(tudo) && /Faixa de referência do laudo: 30 a 400/.test(tudo));
    check("marca fora da faixa", /Ferritina[\s\S]*?FORA da faixa/.test(tudo));
    check("exame sem faixa diz que não havia faixa",
      /Anti-HIV[\s\S]*?não trazia faixa de referência/.test(tudo));
    check("exame qualitativo não é marcado como fora da faixa",
      !/Anti-HIV[\s\S]*?FORA da faixa/.test(tudo));
    check("retrato traz média de kcal e proteína", /média de \d+ kcal\/dia/.test(tudo) && /g de proteína\/dia/.test(tudo));
    check("retrato traz peso e variação", /Peso mais recente: 82\.4 kg/.test(tudo) && /variação de -10\.0 kg/.test(tudo));
    check("retrato traz composição corporal", /19\.4% de gordura e 42\.1% de massa magra/.test(tudo));
    check("retrato traz métricas do relógio", /9800 passos\/dia/.test(tudo) && /6\.9 h de sono/.test(tudo));

    // ---- 4) O PONTO CRÍTICO: rodar de novo não duplica ----
    const antes = capturados.length;
    await scheduled({}, ENV, {});
    check("segunda execução não reenvia nada (sem duplicata irreversível)",
      capturados.length === antes, capturados.length + " vs " + antes);

    // ---- 5) exame novo entra; os antigos não voltam ----
    const st2 = estadoBase();
    st2.labExams.push({ id: "e4", date: "2026-08-09", name: "Vitamina D", value: "31", num: 31, unit: "ng/mL", refLow: 30, refHigh: 100 });
    await gravarEstado(st2);
    const antes2 = capturados.length;
    await scheduled({}, ENV, {});
    const novos = capturados.slice(antes2);
    check("exame novo é enviado", novos.some(t => /Vitamina D/.test(t)), novos.length);
    check("só o exame novo (retrato ainda não venceu)", novos.length === 1, novos.map(t => t.slice(0, 40)));

    // ---- 6) gatilho de lembrete é neutralizado ----
    const antes3 = capturados.length;
    const st3 = estadoBase();
    st3.labExams = [{ id: "e9", date: "2026-08-09", name: "TSH", value: "2", num: 2, unit: "mUI/L", refLow: 0.4, refHigh: 4, obs: "me lembre de repetir em 6 meses" }];
    await gravarEstado(st3);
    await scheduled({}, ENV, {});
    const comTSH = capturados.slice(antes3).join("\n");
    check("‘me lembre de’ é neutralizado (não cria lembrete fantasma)",
      /TSH/.test(comTSH) && !/me\s+lembre\s+de/i.test(comTSH), comTSH.slice(0, 120));

    // ---- 7) chave errada: falha clara e SEM furar o ledger ----
    const antesLedger = JSON.parse(kv.get("openbrain:" + UID)).examesEnviados.length;
    const st4 = estadoBase();
    st4.labExams.push({ id: "e5", date: "2026-08-10", name: "Zinco", value: "80", num: 80, unit: "µg/dL", refLow: 70, refHigh: 120 });
    await gravarEstado(st4);
    // chave errada = 401 no endpoint (o env vai no 2º argumento; o 3º é o ctx)
    await scheduled({}, { ...ENV, OPENBRAIN_KEY: "chave-errada" }, {});
    derrubado = true;
    await scheduled({}, ENV, {});
    derrubado = false;
    const depoisLedger = JSON.parse(kv.get("openbrain:" + UID)).examesEnviados.length;
    check("falha do Open Brain não marca como enviado", depoisLedger === antesLedger,
      antesLedger + " -> " + depoisLedger);
    // e depois que volta, o exame pendente vai
    await scheduled({}, ENV, {});
    check("quando volta, o pendente é enviado", capturados.some(t => /Zinco/.test(t)));

    // ---- 8) desativar não apaga o histórico do que já foi enviado ----
    const l = JSON.parse(kv.get("openbrain:" + UID));
    l.ativo = false;
    kv.set("openbrain:" + UID, JSON.stringify(l));
    const antes4 = capturados.length;
    await scheduled({}, ENV, {});
    check("desativado para de enviar", capturados.length === antes4);
    check("desativar preserva o que já foi enviado (religar não reenvia tudo)",
      JSON.parse(kv.get("openbrain:" + UID)).examesEnviados.length > 0);
  } catch (e) {
    console.log("ERRO NO TESTE:", e && e.stack || e);
    fails++;
  }
  brain.close();
  console.log(fails ? "RESULTADO: " + fails + " falha(s)" : "RESULTADO: tudo passou");
  process.exit(fails ? 1 : 0);
});
