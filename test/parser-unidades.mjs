// parser-unidades.mjs — peso por unidade de alimentos contáveis ("1 morango").
//
// POR QUE ESTE TESTE EXISTE: a tabela `unitWeights` tinha 12 entradas (ovo,
// pão, banana, maçã, laranja, tangerina, coxinha) e a busca não singularizava.
// Resultado: "1 morango" — e quase toda fruta, legume ou salgado — caía em
// "Não sei o peso por unidade — informe as gramas", que na prática é o app
// desistindo. Estes testes travam as duas coisas: a tabela grande e a busca
// que aceita plural e chaves de até 3 palavras ("dente de alho").
//
// Roda sem navegador e sem rede: só carrega os três arquivos como globais.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = {};
for (const f of ['js/db.js', 'js/measures.js', 'js/parser.js']) {
  // eslint-disable-next-line no-eval
  (0, eval)(readFileSync(join(RAIZ, f), 'utf8'));
}
const { Parser, FOOD_DB, MEASURES, SYNONYMS } = globalThis.window;
Parser.setFoods(FOOD_DB.foods);

let fails = 0;
const check = (nome, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + nome + (extra != null ? '  [' + String(extra).slice(0, 160) + ']' : ''));
  if (!ok) fails++;
};
const ler = (linha) => {
  const r = Parser.parseLine(linha);
  const f = r && r.foodId != null ? Parser.getFood(r.foodId) : null;
  return { ...r, nome: f ? f.name : null };
};

// --- o caso que originou o teste ---------------------------------------
const morango = ler('1 morango');
check('"1 morango" estima o peso em vez de pedir gramas',
  morango.grams === 12 && morango.confidence === 'estimate', morango.grams + 'g/' + morango.confidence);
check('"1 morango" casa com o morango cru da base',
  /^Morango/.test(morango.nome || ''), morango.nome);

// --- plural: a tabela só guarda o singular ------------------------------
const cinco = ler('5 morangos');
check('plural funciona sem cadastrar a forma plural ("5 morangos")',
  cinco.grams === 60, cinco.grams);
check('"2 ovos" continua 100 g', ler('2 ovos').grams === 100, ler('2 ovos').grams);

// --- chave de 3 palavras e a ordem certa (3 -> 2 -> 1) ------------------
// "dente de alho" tem que ganhar de "alho": uma cabeça inteira não pesa 3 g.
const alho = ler('2 dentes de alho');
check('"2 dentes de alho" usa a chave de 3 palavras, não "alho"',
  alho.grams === 6, alho.grams);

// --- cobertura: as frutas e itens do dia a dia respondem ----------------
const contaveis = ['1 uva', '1 tomate', '1 pera', '1 kiwi', '1 abacate', '1 pepino',
  '1 azeitona', '1 salsicha', '1 bife', '1 pastel', '1 pao de queijo', '1 bolacha',
  '1 brigadeiro', '1 castanha do para', '1 espiga de milho'];
const mudos = contaveis.filter(c => ler(c).confidence === 'needs_grams');
check('nenhum contável comum cai em "não sei o peso por unidade"',
  mudos.length === 0, mudos.join(', '));

// --- o peso continua sendo ESTIMATIVA, nunca "exact" --------------------
// Isso importa: a tela usa `confidence` para marcar o valor como aproximado.
// Se virar "exact", o app passa a mentir que pesou.
const porUnidade = contaveis.map(ler).filter(r => r.grams != null);
check('peso por unidade é sempre marcado como estimativa',
  porUnidade.every(r => r.confidence === 'estimate'), porUnidade.map(r => r.confidence).join(','));
check('peso por unidade sempre vem com aviso de "confira"',
  porUnidade.every(r => r.flags.some(f => /por unidade/.test(f.msg))));

// --- gramas explícitas não viram estimativa -----------------------------
const exato = ler('100 g arroz');
check('"100 g arroz" continua exato, sem estimativa',
  exato.grams === 100 && exato.confidence === 'exact', exato.grams + '/' + exato.confidence);

// --- o que o app NÃO sabe continua pedindo gramas -----------------------
// A tabela cresceu, mas não pode virar chute universal: alimento sem peso
// conhecido tem que continuar pedindo o número.
const desconhecido = ler('1 jaboti');
check('alimento sem peso por unidade ainda pede gramas',
  desconhecido.confidence === 'needs_grams', desconhecido.confidence + '/' + desconhecido.grams);

// --- integridade: todo sinônimo aponta p/ um id que existe --------------
const orfaos = Object.entries(SYNONYMS).filter(([, id]) => !Parser.getFood(id)).map(([k]) => k);
check('nenhum sinônimo aponta p/ id inexistente na base', orfaos.length === 0, orfaos.join(', '));

// --- integridade: toda chave da tabela tem peso positivo ---------------
const pesosRuins = Object.entries(MEASURES.unitWeights)
  .filter(([, g]) => !(typeof g === 'number' && g > 0)).map(([k]) => k);
check('todo peso por unidade é número positivo', pesosRuins.length === 0, pesosRuins.join(', '));

// --- chave morta: "fatia" é medida caseira e é lida ANTES do alimento ---
// "1 fatia de pizza" nunca chega em unitWeights — a unidade "fatia" resolve
// primeiro. Ter a chave lá dá a falsa impressão de que o valor é usado.
check('a tabela não tem chaves que começam com uma medida caseira',
  !Object.keys(MEASURES.unitWeights).some(k => /^(fatia|colher|xicara|copo|concha)\b/.test(k)));

console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
