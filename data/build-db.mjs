// build-db.mjs — junta os CSVs da TACO (food + nutrients + categories) num único
// arquivo JS embutido (js/db.js) que o app carrega via <script>. Rode com:
//   node data/build-db.mjs
// Fonte dos CSVs: raulfdm/taco-api (MIT) — digitalização da TACO 4ª ed. (NEPA/UNICAMP).
// Este script é DETERMINÍSTICO: não inventa valores, só reorganiza os CSVs originais.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "source");
const OUT = join(__dirname, "..", "js", "db.js");

// --- parser de CSV mínimo, com suporte a campos entre aspas ---------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignora */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function toRecords(text) {
  const rows = parseCSV(text);
  const header = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

// número ou null (campo vazio / não numérico vira null)
function num(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "NA" || s === "*" || s === "Tr") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// normaliza nome p/ busca: minúsculas, sem acento, sem pontuação, espaços colapsados
function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const foods = toRecords(readFileSync(join(SRC, "food.csv"), "utf8"));
const nutrients = toRecords(readFileSync(join(SRC, "nutrients.csv"), "utf8"));
const categories = toRecords(readFileSync(join(SRC, "categories.csv"), "utf8"));

const nutByFood = new Map(nutrients.map(n => [n.foodId, n]));
const catById = {};
categories.forEach(c => { catById[c.id] = c.name; });

let missingKcal = 0;
const out = foods.map(f => {
  const n = nutByFood.get(f.id) || {};
  const kcal = num(n.kcal);
  if (kcal == null) missingKcal++;
  return {
    id: Number(f.id),
    name: f.name,
    norm: normalize(f.name),
    cat: Number(f.categoryId),
    // por 100 g:
    kcal,
    prot: num(n.protein),
    carb: num(n.carbohydrates),
    fat: num(n.lipids),
    fiber: num(n.dietaryFiber),
  };
});

const db = {
  version: "taco-4",
  source: "TACO — Tabela Brasileira de Composicao de Alimentos, 4a edicao revisada e ampliada (NEPA/UNICAMP, 2011)",
  sourceUrl: "https://nepa.unicamp.br/tabela-brasileira-de-composicao-de-alimentos-4a-edicao/",
  digitizedFrom: "raulfdm/taco-api (licenca MIT) — https://github.com/raulfdm/taco-api",
  basis: "valores por 100 g de parte comestivel",
  generatedAt: new Date().toISOString().slice(0, 10),
  categories: catById,
  foods: out,
};

const banner = `// GERADO por data/build-db.mjs — NAO editar a mao (edite os CSVs em data/source/ e rode o script).\n// ${db.source}\n// Digitalizacao: ${db.digitizedFrom}\n`;
writeFileSync(OUT, banner + "window.FOOD_DB = " + JSON.stringify(db) + ";\n", "utf8");

console.log(`OK: ${out.length} alimentos, ${categories.length} categorias -> ${OUT}`);
console.log(`Alimentos sem kcal: ${missingKcal}`);
console.log("Amostra:", JSON.stringify(out[0]), JSON.stringify(out[6]));
