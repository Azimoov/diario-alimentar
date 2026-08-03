// mock-proxy.mjs — proxy FALSO da Fase 2, só para testar o app localmente sem
// gastar API. Responde qualquer foto com uma refeição fixa. Uso:
//   node data/mock-proxy.mjs   (porta 8124)
import { createServer } from "node:http";

const PORT = 8124;
const CORS = {
  "Access-Control-Allow-Origin": "http://localhost:8123",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
};

const backups = new Map(); // token -> registro (Fase backup)
const foodsComum = [];     // base comum de alimentos

createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const token = req.headers["x-app-token"];
  if (token !== "senha-local") {
    res.writeHead(401, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "unauthorized", detail: "token errado" }));
  }
  // ---- /foods (base comum) ----
  if (req.url.startsWith("/foods")) {
    if (req.method === "GET") {
      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ foods: foodsComum }));
    }
    if (req.method === "POST") {
      let d = ""; req.on("data", c => d += c);
      return req.on("end", () => {
        const b = JSON.parse(d || "{}");
        const food = { id: "s" + Date.now().toString(36), ...b, criadoEm: new Date().toISOString() };
        foodsComum.push(food);
        console.log("alimento comum adicionado:", b.name);
        res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, food }));
      });
    }
  }
  // ---- /backup ----
  if (req.url.startsWith("/backup")) {
    if (req.method === "POST") {
      let d = ""; req.on("data", c => d += c);
      return req.on("end", () => {
        const b = JSON.parse(d || "{}");
        backups.set(token, { ...b, savedAt: new Date().toISOString() });
        console.log("backup recebido:", (d.length / 1024).toFixed(1), "KB");
        res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    }
    if (req.method === "GET") {
      const b = backups.get(token);
      res.writeHead(b ? 200 : 404, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify(b || { error: "no_backup", detail: "Nenhum backup." }));
    }
  }
  if (req.method !== "POST") { res.writeHead(405, CORS); return res.end(); }
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const body = JSON.parse(data || "{}");
    console.log(`foto recebida: ${((body.image || "").length / 1024).toFixed(0)} KB base64, tipo ${body.mediaType}, modo ${body.mode || "refeicao"}`);
    if (body.mode === "rotulo") {
      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        rotulo: { nome: "Whey Mock", base: "porcao", porcao_g: 30, kcal: 120, prot: 24, carb: 3, fat: 1.5, fiber: 0, observacao: "teste local" },
        modelo: "mock",
      }));
    }
    // se o app mandou produtos cadastrados, simula reconhecer o primeiro
    const prod = Array.isArray(body.produtos) && body.produtos.length ? body.produtos[0] : null;
    res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      itens: [
        { nome: "arroz branco cozido", gramas: 150, confianca: "media", produto: null },
        { nome: "feijão carioca cozido", gramas: 100, confianca: "media", produto: null },
        prod
          ? { nome: prod, gramas: 30, confianca: "alta", produto: prod }
          : { nome: "peito de frango grelhado", gramas: 120, confianca: "alta", produto: null },
      ],
      observacao: "Teste local — dados fixos do mock.",
      modelo: "mock",
    }));
  });
}).listen(PORT, () => console.log("mock proxy em http://localhost:" + PORT));
