// measures.js — tabelas EDITÁVEIS de medidas caseiras, pesos por unidade e
// sinônimos/escolhas-padrão de alimentos. Tudo carregado como globais (funciona
// abrindo o index.html direto, sem servidor). Edite à vontade.
//
// IMPORTANTE (honestidade): medidas caseiras são APROXIMADAS e dependem do
// alimento. O app SEMPRE marca conversões caseiras como [estimativa] e deixa
// você corrigir as gramas na mão. Você pesa a comida — este é só um atalho.

window.MEASURES = {
  // Unidades de MASSA/volume — conversão direta para gramas.
  // g/kg = exato. ml/l assume densidade ~1 (aprox. p/ líquidos) => estimativa.
  mass: {
    g: 1, grama: 1, gramas: 1, gr: 1, grs: 1,
    kg: 1000, quilo: 1000, quilos: 1000, kilo: 1000, kilos: 1000, k: 1000,
  },
  volume: { // densidade ~1 assumida => marcado como estimativa
    ml: 1, l: 1000, litro: 1000, litros: 1000,
  },

  // Medidas caseiras — GRAMAS POR 1 medida. Valores GENÉRICOS (volume padrão,
  // densidade ~1), sempre sinalizados como estimativa. Chaves já normalizadas
  // (minúsculas, sem acento). Ordem não importa; o parser casa a mais longa.
  household: {
    'colher de sopa': 15, 'colheres de sopa': 15, 'colher sopa': 15,
    'colher de cha': 5, 'colheres de cha': 5,
    'colher de sobremesa': 10, 'colheres de sobremesa': 10,
    'colher de servir': 60, 'colheres de servir': 60,
    'colher': 15, 'colheres': 15,           // assume sopa
    'xicara de cha': 200, 'xicaras de cha': 200,
    'xicara': 200, 'xicaras': 200,
    'copo americano': 150, 'copos americanos': 150,
    'copo': 200, 'copos': 200,
    'concha': 100, 'conchas': 100,
    'escumadeira': 40, 'escumadeiras': 40,
    'fatia': 30, 'fatias': 30,               // muito variável — confira
  },

  // Medidas AMBÍGUAS demais p/ estimar sozinho: exigem que você informe gramas.
  ambiguous: ['prato', 'pratos', 'pedaco', 'pedacos', 'porcao', 'porcoes',
    'punhado', 'punhados', 'pote', 'potes', 'lata', 'latas', 'saco', 'sacos',
    'ponta de faca', 'a gosto', 'q b'],

  // Peso por UNIDADE de alimentos contáveis ("1 ovo", "2 bananas").
  // GRAMAS por 1 unidade (média, estimativa). Chaves normalizadas.
  unitWeights: {
    ovo: 50, ovos: 50,
    'pao frances': 50, 'paes franceses': 50, paozinho: 50, paozinhos: 50,
    banana: 100, bananas: 100,
    maca: 130, macas: 130,
    laranja: 180, laranjas: 180,
    tangerina: 130, mexerica: 130, bergamota: 130,
    pao: 50, // pão francês por padrão
  },
};

// Sinônimos / escolha-padrão: quando você digita um termo comum, o app já casa
// com um item específico da TACO (id verificado). Você sempre pode trocar pelo
// seletor. Ids conferidos contra a base gerada (TACO 4ª ed.).
window.SYNONYMS = {
  'arroz': 3,                 // Arroz, tipo 1, cozido
  'arroz branco': 3,
  'arroz integral': 1,        // Arroz, integral, cozido
  'feijao': 561,              // Feijão, carioca, cozido
  'feijao carioca': 561,
  'feijao preto': 567,        // Feijão, preto, cozido
  'frango': 408,              // Frango, peito, sem pele, cozido
  'peito de frango': 408,
  'frango grelhado': 408,
  'ovo': 488,                 // Ovo, de galinha, inteiro, cozido/10min
  'ovo cozido': 488,
  'ovo frito': 490,           // Ovo, de galinha, inteiro, frito
  'patinho': 377,             // Carne, bovina, patinho, sem gordura, grelhado
  'batata': 91,               // Batata, inglesa, cozida
  'batata inglesa': 91,
  'batata doce': 88,          // Batata, doce, cozida
  'mandioca': 129, 'aipim': 129, 'macaxeira': 129,  // Mandioca, cozida
  'macarrao': 40,             // Macarrão, trigo, cru (TACO não tem cozido)
  'pao': 53, 'pao frances': 53,   // Pão, trigo, francês
  'aveia': 7,                 // Aveia, flocos, crua
  'tomate': 157,              // Tomate, com semente, cru
  'alface': 79,               // Alface, lisa, crua
  'cebola': 107,              // Cebola, crua
  'cenoura': 110,             // Cenoura, crua
  'azeite': 260,              // Azeite, de oliva, extra virgem
  'manteiga': 261,            // Manteiga, com sal
  'margarina': 263,           // Margarina, óleo hidrogenado, com sal
  'acucar': 494,              // Açúcar, refinado
  'cafe': 471,                // Café, infusão 10%
  'presunto': 439,            // Presunto, sem capa de gordura
  'requeijao': 468,           // Queijo, requeijão, cremoso
  'queijo minas': 461,        // Queijo, minas, frescal
  'atum': 277,                // Atum, conserva em óleo
  'sardinha': 321,            // Sardinha, inteira, crua
  'couve': 115,               // Couve, manteiga, crua
  'tapioca': 551,             // Tapioca, com manteiga
  'banana': 182,              // Banana, prata, crua
  'banana prata': 182,
  'banana nanica': 179,
  'iogurte': 448,             // Iogurte, natural
  'iogurte natural': 448,
  'pao de forma': 52,         // Pão, trigo, forma, integral
  'pao integral': 52,
  'pao de queijo': 140,       // Pão, de queijo, assado
  // ingredientes de receita comuns
  'trigo': 35,                // Farinha, de trigo
  'farinha de trigo': 35,
  'farinha': 35,
  'oleo': 272,                // Óleo, de soja
  'oleo de soja': 272,
  'fermento': 513,            // Fermento em pó, químico
  'creme de leite': 447,
  'leite condensado': 453,
};

// Palavras que viram número (normalizadas, sem acento).
window.NUMBER_WORDS = {
  'meia': 0.5, 'meio': 0.5, 'metade': 0.5,
  'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'quatro': 4,
  'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
};
