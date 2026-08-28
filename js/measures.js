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

  // Peso por UNIDADE de alimentos contáveis ("1 ovo", "2 bananas", "1 morango").
  // GRAMAS por 1 unidade, considerando a PARTE COMESTÍVEL (sem casca, caroço,
  // osso). São MÉDIAS APROXIMADAS de tamanho médio, não valores de tabela
  // oficial — unidade de fruta/legume varia muito. O app sempre marca como
  // [estimativa] e deixa você corrigir na mão. Se você pesa, pese.
  //
  // Só precisa da forma SINGULAR: a busca já tenta singularizar o plural
  // ("morangos" -> "morango"). Chaves de até 3 palavras funcionam.
  unitWeights: {
    // --- ovos e derivados ---
    ovo: 50,
    'ovo de codorna': 10,

    // --- pães e padaria ---
    'pao frances': 50, paozinho: 50,
    pao: 50,                      // pão francês por padrão
    'pao de forma': 25,           // 1 fatia
    'pao de queijo': 30,
    'pao de hot dog': 55, 'pao de hamburguer': 60,
    torrada: 8,
    biscoito: 8, bolacha: 8,
    'biscoito recheado': 12, 'bolacha recheada': 12,
    'cream cracker': 7,
    croissant: 60,
    rosquinha: 12,

    // --- frutas ---
    morango: 12,
    uva: 6,
    banana: 100,
    maca: 130,
    laranja: 180,
    tangerina: 130, mexerica: 130, bergamota: 130, ponkan: 130,
    limao: 60,
    pera: 130,
    pessego: 100,
    ameixa: 50,
    kiwi: 70,
    manga: 200,
    goiaba: 130,
    caqui: 130,
    figo: 50,
    acerola: 8,
    jabuticaba: 8,
    cereja: 6,
    'damasco seco': 8,
    'uva passa': 0.5,
    carambola: 90,
    caju: 60,
    maracuja: 30,                 // polpa de 1 fruta
    abacate: 200,                 // polpa (abacate brasileiro é grande)
    'tomate cereja': 15,

    // --- legumes e verduras ---
    tomate: 110,
    cenoura: 80,
    batata: 100,
    'batata doce': 150,
    cebola: 100,
    'dente de alho': 3,
    pepino: 130,
    abobrinha: 200,
    berinjela: 250,
    pimentao: 130,
    chuchu: 200,
    'espiga de milho': 100,
    azeitona: 4,

    // --- oleaginosas ---
    'castanha de caju': 2,
    'castanha do para': 4,
    amendoa: 1.2,
    noz: 5,
    avela: 1.2,

    // --- carnes e pescados ---
    bife: 120,
    'file de frango': 150, 'peito de frango': 150,
    'coxa de frango': 100, sobrecoxa: 120,
    'asa de frango': 40,
    salsicha: 50,
    linguica: 80,
    hamburguer: 80,
    'almondega': 25,
    sardinha: 30,
    camarao: 10,

    // --- salgados e preparados ---
    coxinha: 50,                  // porção média segundo a TBCA (unidade M)
    pastel: 70,
    esfiha: 80, esfirra: 80,
    empada: 60,
    'bolinho de': 40,
    panqueca: 80,
    tapioca: 80,
    crepioca: 100,
    'misto quente': 90,

    // --- doces ---
    brigadeiro: 20,
    bombom: 15,
    bala: 5,
    'barra de cereal': 25, barrinha: 25,
    'quadradinho de chocolate': 5,
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
  // TBCA (ids são os códigos oficiais — conferíveis em tbca.net.br)
  'leite': 'C0043G',          // Leite, vaca, integral, fluído (64 kcal)
  'leite integral': 'C0043G',
  'leite de vaca': 'C0043G',
  'cerveja': 'C0009H',        // Bebida alcoólica, cerveja, Pilsen
  'pasta de amendoim': 'C0290T',
  'coxinha': 'C0100F',        // Coxinha de frango, industrializada, frita
  // comuns do dia a dia (escolha-padrão = variante mais típica; ids conferidos)
  'hamburguer': 417,              // Hambúrguer, bovino, grelhado (TACO)
  'cachorro quente': 'C0363A',    // pão hot dog + salsicha (TBCA)
  'hot dog': 'C0363A',
  'lasanha': 'C0395A',            // bolonhesa caseira assada (TBCA)
  'lasanha bolonhesa': 'C0395A',
  'panqueca': 'C0324A',           // c/ carne moída e molho (TBCA)
  'pastel': 56,                   // Pastel, de carne, frito (TACO)
  'empada': 389,                  // Empada de frango, assada (TACO)
  'picanha': 381,                 // com gordura, grelhada (TACO)
  'vitamina de banana': 'C0073G', // leite integral c/ banana, c/ açúcar (TBCA)
  'esfiha': 'C0439A',             // Esfirra caseira assada, média de sabores (TBCA)
  'esfirra': 'C0439A',
  'bolacha recheada': 9,          // Biscoito recheado com chocolate (TACO)
  'biscoito recheado': 9,
  'coca cola': 480,               // Refrigerante, tipo cola (TACO)
  'coca': 480,
  'salada de frutas': 'C0187C',   // laranja/banana/maçã/mamão s/ açúcar (TBCA)
  'salada de fruta': 'C0187C',
  'iogurte grego': 'C0133G',      // grego simples integral (TBCA)
  'sushi': 'C0305E',              // sushi c/ peixe (TBCA)
  'misto quente': 'C0267A',       // pão francês, presunto e queijo (TBCA)
  'sorvete': 'C0141K',            // industrializado, média de sabores (TBCA)
  'farofa': 131,                  // Mandioca, farofa, temperada (TACO)
  'linguica': 422,                // Lingüiça, porco, frita (TACO)
  'suco de laranja': 215,         // Laranja, pêra, suco (TACO)
  // USDA (subconjunto curado — ids u<fdc_id>, conferíveis em fdc.nal.usda.gov)
  'whey': 'u173180',          // Whey protein (pó)
  'whey protein': 'u173180',
  'whey isolado': 'u173177',
  'cottage': 'u172179',       // Queijo cottage
  'queijo cottage': 'u172179',
  'cream cheese': 'u173418',
  'leite de soja': 'u172456',
  'leite de amendoas': 'u174832',
  // frutas e itens contáveis que caíam em alimento errado ou "não encontrado"
  // (ids conferidos contra a base gerada — ver comentário de cada linha)
  'morango': 239,                 // Morango, cru (TACO)
  'uva': 256,                     // Uva, Itália, crua
  'pera': 242,                    // Pêra, Park, crua
  'pessego': 244,                 // Pêssego, Aurora, cru
  'kiwi': 207,                    // Kiwi, cru
  'ameixa': 172,                  // Ameixa, crua
  'figo': 194,                    // Figo, cru
  'abacate': 163,                 // Abacate, cru
  'cereja': 'C0182C',             // Cereja, in natura (TBCA)
  'tangerina': 251,               // Tangerina, Poncã, crua — "mexerica"/"bergamota"
  'mexerica': 251, 'bergamota': 251, 'poncan': 251, 'ponkan': 251,
  'tomate cereja': 157,           // mesma composição do tomate cru; muda só o peso
  'castanha do para': 589,        // na TACO o nome é "Castanha-do-Brasil, crua"
  'castanha do brasil': 589,
  'espiga de milho': 44,          // Milho, verde, cru (antes casava com "Glicose, milho")
  'milho verde': 44,
  'bolacha': 8,                   // Biscoito, doce, maisena (a base não usa "bolacha")
  'biscoito': 8,
  'barra de cereal': 'C0064N',    // Barra de cereal (TBCA)
  'barrinha': 'C0064N',
  'pepino': 142,                  // Pepino, cru
  'berinjela': 96,                // Berinjela, crua
  'abobrinha': 71,                // Abobrinha, italiana, crua
  'chuchu': 113,                  // Chuchu, cru
  'alho': 82,                     // Alho, cru
};

// Palavras que viram número (normalizadas, sem acento) — inclui as formas
// comuns de ditado por voz ("cem gramas de arroz").
window.NUMBER_WORDS = {
  'meia': 0.5, 'meio': 0.5, 'metade': 0.5,
  'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'quatro': 4,
  'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
  'onze': 11, 'doze': 12, 'quinze': 15, 'vinte': 20, 'trinta': 30,
  'quarenta': 40, 'cinquenta': 50, 'sessenta': 60, 'setenta': 70,
  'oitenta': 80, 'noventa': 90, 'cem': 100, 'duzentos': 200,
  'trezentos': 300, 'quatrocentos': 400, 'quinhentos': 500,
};
