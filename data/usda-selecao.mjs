// usda-selecao.mjs — subconjunto CURADO da USDA SR Legacy (domínio público,
// CC0). Só itens que faltam na TACO e na TBCA. Cada entrada aponta para um
// fdc_id oficial — os VALORES vêm direto do CSV da USDA (nunca digitados à
// mão); aqui só damos o nome em português. O nome original fica guardado
// no campo `en` para auditoria em fdc.nal.usda.gov.
export const USDA_SELECAO = [
  { fdcId: 173180, nome: "Whey protein (pó)" },                 // Beverages, Protein powder whey based
  { fdcId: 173177, nome: "Whey protein isolado (pó)" },         // Beverages, Whey protein powder isolate
  { fdcId: 172179, nome: "Queijo cottage" },                    // Cheese, cottage, creamed, large or small curd
  { fdcId: 172182, nome: "Queijo cottage light (2% gordura)" }, // Cheese, cottage, lowfat, 2% milkfat
  { fdcId: 173418, nome: "Cream cheese" },                      // Cheese, cream
  { fdcId: 174832, nome: "Leite de amêndoas, sem açúcar" },     // Beverages, almond milk, unsweetened, shelf stable
  { fdcId: 172456, nome: "Leite de soja" },                     // Soymilk, original and vanilla, with added calcium
  { fdcId: 167587, nome: "Chocolate ao leite (barra)" },        // Candies, milk chocolate
];
