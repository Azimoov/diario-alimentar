// build-db.mjs — monta a base de alimentos do app (js/db.js) a partir de
// TRÊS fontes verificáveis. Rode com:  node data/build-db.mjs
//
// 1) TACO 4ª ed. (NEPA/UNICAMP)  — CSVs em data/source/ (via raulfdm/taco-api, MIT)
// 2) TBCA 7.3 (USP/BRASILFOODS)  — data/source-tbca/alimentos.txt (JSON por linha,
//    digitalização resen-dev/web-scraping-tbca; amostras conferidas contra
//    tbca.net.br). USO NÃO COMERCIAL, COM CITAÇÃO OBRIGATÓRIA DA FONTE.
// 3) USDA SR Legacy (domínio público, CC0) — subconjunto curado em
//    data/usda-selecao.mjs; valores extraídos dos CSVs oficiais.
//
// Este script é DETERMINÍSTICO: reorganiza dados das fontes, nunca inventa.
// A normalização de busca (campo norm) é calculada pelo app ao carregar,
// para não dobrar o tamanho do arquivo.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { USDA_SELECAO } from "./usda-selecao.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "js", "db.js");

// ---------- utilitários ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
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
  return rows.slice(1).map(r => { const o = {}; header.forEach((h, i) => { o[h] = r[i]; }); return o; });
}
function numTaco(v) { // número ou null (vazio/NA/Tr/* viram null — padrão da digitalização TACO)
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "NA" || s === "*" || s === "Tr") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function numTbca(v) { // pt-BR: vírgula decimal; "tr" = traço (≈0); "NA"/"" = sem dado
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "" || s === "na" || s === "-") return null;
  if (s === "tr") return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  // OBS: valores TBCA não usam separador de milhar; o replace de "." cobre
  // apenas eventual formatação. Números como "0.58" já vêm com vírgula.
  return Number.isFinite(n) ? n : null;
}
const round1 = n => (n == null ? null : Math.round(n * 10) / 10);

// ---------- 1) TACO ----------
const SRC_TACO = join(__dirname, "source");
const tacoFoods = toRecords(readFileSync(join(SRC_TACO, "food.csv"), "utf8"));
const tacoNut = toRecords(readFileSync(join(SRC_TACO, "nutrients.csv"), "utf8"));
const tacoCat = toRecords(readFileSync(join(SRC_TACO, "categories.csv"), "utf8"));
const nutByFood = new Map(tacoNut.map(n => [n.foodId, n]));
const categories = {};
tacoCat.forEach(c => { categories[c.id] = c.name; });

const foods = [];
tacoFoods.forEach(f => {
  const n = nutByFood.get(f.id) || {};
  foods.push({
    id: Number(f.id), src: "taco", name: f.name, cat: Number(f.categoryId),
    kcal: numTaco(n.kcal), prot: numTaco(n.protein), carb: numTaco(n.carbohydrates),
    fat: numTaco(n.lipids), fiber: numTaco(n.dietaryFiber),
  });
});
const tacoCount = foods.length;

// ---------- 2) TBCA ----------
const TBCA_FILE = join(__dirname, "source-tbca", "alimentos.txt");
let tbcaCount = 0;
if (existsSync(TBCA_FILE)) {
  const lines = readFileSync(TBCA_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  const seen = new Set();
  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o.codigo || seen.has(o.codigo)) continue;
    seen.add(o.codigo);
    const get = (comp, unit) => {
      const e = (o.nutrientes || []).find(x => x.Componente === comp && (!unit || x.Unidades === unit));
      return e ? e["Valor por 100g"] : null;
    };
    const kcal = numTbca(get("Energia", "kcal"));
    if (kcal == null) continue; // sem energia não serve p/ o diário
    // limpa vírgula/espaço sobrando no fim da descrição
    const name = String(o.descricao || "").replace(/[\s,]+$/g, "").replace(/\s{2,}/g, " ");
    if (!name) continue;
    foods.push({
      id: o.codigo, src: "tbca", name, cat: 0,
      kcal,
      prot: round1(numTbca(get("Proteína"))),
      carb: round1(numTbca(get("Carboidrato total"))),
      fat: round1(numTbca(get("Lipídios"))),
      fiber: round1(numTbca(get("Fibra alimentar"))),
    });
    tbcaCount++;
  }
}

// ---------- 3) USDA (subconjunto curado) ----------
const USDA_DIR = join(__dirname, "source-usda", "FoodData_Central_sr_legacy_food_csv_2018-04");
let usdaCount = 0;
if (existsSync(join(USDA_DIR, "food.csv"))) {
  const wanted = new Map(USDA_SELECAO.map(s => [String(s.fdcId), s]));
  const descById = new Map();
  toRecords(readFileSync(join(USDA_DIR, "food.csv"), "utf8")).forEach(r => {
    if (wanted.has(r.fdc_id)) descById.set(r.fdc_id, r.description);
  });
  // nutrient.id -> campo nosso
  const NUT = { "1008": "kcal", "1003": "prot", "1005": "carb", "1004": "fat", "1079": "fiber" };
  const vals = new Map(); // fdc_id -> {kcal,...}
  // food_nutrient.csv é grande — filtra em streaming simples por linha
  const fnText = readFileSync(join(USDA_DIR, "food_nutrient.csv"), "utf8");
  const header = fnText.slice(0, fnText.indexOf("\n"));
  const idxOf = (name) => header.replace(/"/g, "").split(",").indexOf(name);
  const iFdc = idxOf("fdc_id"), iNut = idxOf("nutrient_id"), iAmt = idxOf("amount");
  for (const line of fnText.split("\n")) {
    // filtro rápido antes do parse
    let hit = false;
    for (const id of wanted.keys()) if (line.includes('"' + id + '"')) { hit = true; break; }
    if (!hit) continue;
    const cols = parseCSV(line)[0];
    if (!cols) continue;
    const fdc = cols[iFdc], nut = cols[iNut];
    if (!wanted.has(fdc) || !NUT[nut]) continue;
    if (!vals.has(fdc)) vals.set(fdc, {});
    vals.get(fdc)[NUT[nut]] = Number(cols[iAmt]);
  }
  for (const [fdcId, sel] of wanted) {
    const v = vals.get(fdcId);
    const en = descById.get(fdcId);
    if (!v || v.kcal == null || !en) {
      console.warn("AVISO: USDA fdcId " + fdcId + " sem dados completos — pulado.");
      continue;
    }
    foods.push({
      id: "u" + fdcId, src: "usda", name: sel.nome, en, cat: 0,
      kcal: Math.round(v.kcal),
      prot: round1(v.prot), carb: round1(v.carb), fat: round1(v.fat),
      fiber: round1(v.fiber == null ? null : v.fiber),
    });
    usdaCount++;
  }
}

// ---------- saída ----------
const db = {
  version: "taco4+tbca7.3+usda-sr",
  basis: "valores por 100 g de parte comestivel",
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: [
    {
      id: "taco", label: "TACO 4ª ed.",
      detail: "Tabela Brasileira de Composição de Alimentos, 4ª edição revisada e ampliada (NEPA/UNICAMP, 2011). Digitalização: raulfdm/taco-api (MIT).",
      url: "https://nepa.unicamp.br/tabela-brasileira-de-composicao-de-alimentos-4a-edicao/",
      count: tacoCount,
    },
    {
      id: "tbca", label: "TBCA 7.3",
      detail: "Tabela Brasileira de Composição de Alimentos (TBCA). Universidade de São Paulo (USP). Food Research Center (FoRC). Versão 7.3. São Paulo, 2025. Uso não comercial, com citação. Digitalização: resen-dev/web-scraping-tbca (amostras conferidas contra o site oficial).",
      url: "http://www.tbca.net.br/",
      count: tbcaCount,
    },
    {
      id: "usda", label: "USDA SR Legacy",
      detail: "USDA FoodData Central, SR Legacy (abr/2018), domínio público (CC0). Subconjunto curado com nomes traduzidos; nome original preservado (campo en) e fdc_id no id.",
      url: "https://fdc.nal.usda.gov/",
      count: usdaCount,
    },
  ],
  categories,
  foods,
};

const banner = "// GERADO por data/build-db.mjs — NAO editar a mao.\n" +
  "// Fontes: TACO 4a ed. (NEPA/UNICAMP) + TBCA 7.3 (USP/BRASILFOODS, uso nao\n" +
  "// comercial, citacao obrigatoria) + USDA SR Legacy (dominio publico).\n" +
  "// Detalhes e conferencias: README.md\n";
writeFileSync(OUT, banner + "window.FOOD_DB = " + JSON.stringify(db) + ";\n", "utf8");

const kb = Math.round(Buffer.byteLength(readFileSync(OUT)) / 1024);
console.log(`OK: ${foods.length} alimentos (TACO ${tacoCount} + TBCA ${tbcaCount} + USDA ${usdaCount}) -> js/db.js (${kb} KB)`);

// conferências de sanidade (valores verificados manualmente nas fontes)
const check = (id, kcalEsperado, rotulo) => {
  const f = foods.find(x => String(x.id) === String(id));
  const ok = f && f.kcal === kcalEsperado;
  console.log(`${ok ? "OK " : "ERRO"} ${rotulo}: ${f ? f.kcal : "(ausente)"} kcal (esperado ${kcalEsperado})`);
  if (!ok) process.exitCode = 1;
};
check(3, 128, "TACO Arroz tipo 1 cozido");
check(377, 219, "TACO Patinho grelhado");
check("C0009H", 41, "TBCA Cerveja Pilsen");
check("C0100F", 273, "TBCA Coxinha de frango");
check("C0043G", 64, "TBCA Leite de vaca integral");
const whey = foods.find(f => f.id === "u173180");
console.log("USDA Whey:", whey ? `${whey.kcal} kcal, P ${whey.prot} (${whey.en})` : "(ausente)");
