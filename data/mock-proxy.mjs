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

createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== "POST") { res.writeHead(405, CORS); return res.end(); }
  if (req.headers["x-app-token"] !== "senha-local") {
    res.writeHead(401, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "unauthorized", detail: "token errado" }));
  }
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const body = JSON.parse(data || "{}");
    console.log(`foto recebida: ${((body.image || "").length / 1024).toFixed(0)} KB base64, tipo ${body.mediaType}`);
    res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      itens: [
        { nome: "arroz branco cozido", gramas: 150, confianca: "media" },
        { nome: "feijão carioca cozido", gramas: 100, confianca: "media" },
        { nome: "peito de frango grelhado", gramas: 120, confianca: "alta" },
        { nome: "quibebe de abóbora", gramas: 80, confianca: "baixa" },
      ],
      observacao: "Teste local — dados fixos do mock.",
      modelo: "mock",
    }));
  });
}).listen(PORT, () => console.log("mock proxy em http://localhost:" + PORT));
