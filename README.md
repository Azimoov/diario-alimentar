# Minha Saúde — diário alimentar, exames e métricas (local-first)

Hub pessoal de saúde com **três áreas** na barra de cima:

- **🍽️ Diário** — o diário alimentar original: registro em **texto em
  linguagem natural** (ex.: `150 g patinho`, `120g arroz`, `1 ovo`), kcal e
  macros (P/C/G) por item e por dia, gráficos vs. meta, peso e composição
  corporal, histórico.
- **🧪 Exames** — duas abas: **Laboratoriais** (um analito por linha, com
  faixa de referência do SEU laudo e gráfico de evolução) e **Imagem**
  (data + resumo do laudo). **Lembretes de repetição** ("a cada N meses")
  avisam na própria área, na aba Hoje e com uma bolinha no botão Exames.
- **❤️ Métricas** — importa o **export do app Saúde do iPhone**
  (Apple Watch: passos, energia, sono, FC de repouso, VO₂máx…), agrega por
  dia NESTE aparelho e cruza com o diário (saldo energético).

Em qualquer área de exames/métricas, o botão **🔎 Analisar meus dados**
(opcional, requer o proxy da Fase 2) manda um resumo numérico para a IA
cruzar exames × dieta × métricas e devolver pontos para levar ao médico.

- **Núcleo sem IA, sem servidor, sem chave de API.** O texto é interpretado
  por um parser local (regex + normalização). App 100% estático; IA é
  estritamente opcional, via o SEU proxy.
- **Local-first.** Todos os seus dados ficam no aparelho (localStorage). Você
  exporta/importa um JSON para ter o backup e ser dono do dado.
- **Base de alimentos real:** TACO 4ª edição (NEPA/UNICAMP). Nenhum valor
  nutricional foi inventado — veja a fonte abaixo.

---

## Como rodar

**Opção 1 — abrir direto (mais simples):**
Dê dois cliques em `index.html`. O app funciona offline, sem instalar nada.
(Todos os scripts são carregados como `<script>` comuns e os dados são
embutidos em JS justamente para funcionar via `file://`.)

**Opção 2 — servidor local (opcional, p/ testar como fica na web):**
```
node data/devserver.mjs
```
Depois abra `http://localhost:8123`. O `devserver.mjs` serve só para teste
local; não é necessário em produção.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub e envie **todos** os arquivos desta pasta
   (`index.html`, `app.css`, a pasta `js/`, e opcionalmente `data/` e os `.md`).
2. No GitHub: **Settings → Pages → Build and deployment → Source: _Deploy from a
   branch_**, escolha a branch `main` e a pasta `/ (root)`. Salve.
3. Em ~1 minuto o site fica no ar em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

Como é tudo estático, não precisa de build. A pasta `data/source/` (CSVs
originais) e os scripts `data/*.mjs` **não são necessários** para o site
funcionar — servem para reproduzir/atualizar a base. Pode mantê-los no repo
para transparência ou removê-los do deploy, à sua escolha.

---

## Fontes da base de alimentos (6.273 itens)

Três fontes, montadas por `data/build-db.mjs` (determinístico: reorganiza,
nunca inventa valor). Cada alimento carrega a etiqueta da origem no app.
Valores **por 100 g de parte comestível**.

**1. TACO 4ª ed. — 597 alimentos** (NEPA/UNICAMP, 2011)
<https://nepa.unicamp.br/tabela-brasileira-de-composicao-de-alimentos-4a-edicao/>
Digitalização: [`raulfdm/taco-api`](https://github.com/raulfdm/taco-api) (MIT),
CSVs em `data/source/`. Conferência por amostragem: *Arroz tipo 1 cozido* =
128 kcal; *Patinho grelhado* = 219 kcal; *Feijão carioca cozido* = 76 kcal ✓.

**2. TBCA 7.3 — 5.668 alimentos** (USP/BRASILFOODS/FoRC)
<http://www.tbca.net.br/> — inclui pratos prontos, preparações regionais,
bebidas e industrializados. Citação: *Tabela Brasileira de Composição de
Alimentos (TBCA). Universidade de São Paulo (USP). Food Research Center
(FoRC). Versão 7.3. São Paulo, 2025.* **Uso não comercial, com citação
obrigatória** (termos do site). Digitalização:
[`resen-dev/web-scraping-tbca`](https://github.com/resen-dev/web-scraping-tbca),
em `data/source-tbca/`. Conferência campo a campo contra o site oficial:
*Cerveja Pilsen BRC0009H* = 41 kcal/0,56 P/3,34 C ✓; *Coxinha BRC0100F* =
273 kcal/9,61 P/34,5 C ✓; *Leite integral BRC0043G* = 64 kcal ✓.

**3. USDA SR Legacy — 8 alimentos** (domínio público, CC0)
<https://fdc.nal.usda.gov/> — subconjunto curado só com o que falta nas bases
brasileiras (whey, cottage, cream cheese, leites vegetais…). Nomes traduzidos
à mão em `data/usda-selecao.mjs`; valores extraídos direto dos CSVs oficiais;
o nome original em inglês e o `fdc_id` ficam guardados para auditoria.

O script de sanidade em `build-db.mjs` confere valores-âncora a cada build e
falha se algo divergir. Para atualizar qualquer fonte: substitua os arquivos
em `data/source*` e rode `node data/build-db.mjs`. Não edite `js/db.js` à mão.

> As pastas `data/source-tbca/` e `data/source-usda/` (61 MB de dados brutos)
> **não vão para o git** — para reconstruir a base do zero, baixe
> `alimentos.txt` do repositório da digitalização TBCA e o zip
> `FoodData_Central_sr_legacy_food_csv_2018-04.zip` de
> <https://fdc.nal.usda.gov/download-datasets/>.

---

## Precisão: TDEE adaptativo, guarda cru×cozido e tendência de peso

- **TDEE real (adaptativo)** — aba Perfil: com 10+ dias registrados e 2+
  pesagens espaçadas (janela de 28 dias), o app calcula seu gasto REAL:
  `média ingerida + 7.700 × perda de peso por dia` (regressão linear sobre as
  pesagens; dias com <500 kcal são ignorados como incompletos). Um toque
  passa a usar esse valor como base da meta — ele absorve inclusive o viés
  sistemático de sub-registro. Valores implausíveis (<1000 ou >5500) são
  sinalizados e não são usados.
- **Guarda cru × cozido** — se um item casar silenciosamente com uma variante
  CRUA de grãos/carnes/peixes/ovos/raízes sem você ter escrito "cru", o app
  alerta (o erro pode ser de 3x) e oferece a troca para a versão pronta em um
  toque. Quem escreve "cru" de propósito não é incomodado; ingredientes de
  receita (pesados crus, correto) também não.
- **Média móvel de 7 dias** no gráfico de peso: o peso diário oscila ±1 kg por
  água/glicogênio; a linha de tendência é o sinal que importa.
- **Composição corporal (opcional)** — junto do peso, na aba Hoje, dá para
  registrar **% de gordura** e **% de massa magra** (da balança de
  bioimpedância ou avaliação física). Com o peso do dia preenchido o app
  mostra o equivalente em kg, e cada série vira um gráfico próprio no
  Histórico. Nada é derivado sozinho: só entra o que você medir, e se
  gordura + massa magra somarem mais de 100% o app avisa.

## Como o app calcula a meta

- **TMB (Mifflin-St Jeor):**
  - Homem: `10·peso(kg) + 6,25·altura(cm) − 5·idade + 5`
  - Mulher: `10·peso(kg) + 6,25·altura(cm) − 5·idade − 161`
- **TDEE** = TMB × fator de atividade (1,2 / 1,375 / 1,55 / 1,725 / 1,9).
- **Meta** = TDEE − déficit. O déficit vem do ritmo de perda escolhido
  (0,5 kg/semana ≈ −550 kcal/dia, usando ~7700 kcal/kg). Você pode digitar uma
  **meta manual** que sobrepõe o cálculo.
- **Guardrail de segurança:** se a meta ficar abaixo de um piso conservador
  (1500 kcal/dia p/ homens, 1200 p/ mulheres), o app mostra um **aviso** — mas
  deixa você decidir. Não é conselho médico.
- **Macros:** você define proteína em **g/kg de peso** (padrão 1,8) e a gordura
  como **% das kcal** (padrão 25%); o carboidrato pega o restante.

---

## Como o parser entende o texto

Uma linha por alimento. Ele extrai **quantidade + unidade + alimento**,
normaliza acentos e casa com a base:

| Você escreve | Vira |
|---|---|
| `150 g patinho`, `120g arroz` | gramas exatas (verde) |
| `0,5 kg patinho`, `1/2 xícara de arroz` | decimais e frações |
| `1 ovo`, `2 bananas` | peso por unidade **estimado** (amarelo) |
| `meia xícara de feijão`, `2 colheres de sopa de azeite` | medida caseira **estimada** (amarelo) |
| `1 prato de arroz` | medida imprecisa → **pede as gramas** |
| `whey`, `carne moída` | não está na TACO → **escolher ou cadastrar** |

**Nunca adivinha em silêncio:** medidas caseiras e pesos por unidade são
marcados como *estimativa* (você pesa a comida — o campo de gramas é sempre
editável); alimentos não encontrados ou ambíguos ficam sinalizados e **não
entram no total** até você resolver.

As tabelas de conversão (medidas caseiras, pesos por unidade) e os
sinônimos/escolhas-padrão são **editáveis** em `js/measures.js`.

---

## Meus alimentos (base extensível)

O que não está na TACO — **whey, peito de peru, marcas específicas, suas
receitas** — você cadastra na aba **Alimentos → Alimentos individuais**, com os valores do
rótulo por 100 g. Eles entram na busca e no parser junto com a TACO.

---

## Limitações conhecidas

- **Medidas caseiras são aproximadas.** "1 xícara", "1 colher de sopa" etc. usam
  valores genéricos (volume padrão, densidade ~1) e dependem muito do alimento.
  Sempre marcadas como estimativa — confira/edite as gramas.
- **6 alimentos da TACO estão sem valor calórico na fonte** (ex.: *Leite, de
  vaca, integral*; *Sal, grosso*; *Coco verde, cru*). O app os sinaliza e não os
  soma; cadastre uma versão própria se precisar. **Não preenchemos esses valores
  para não inventar dado.**
- **A TACO não tem tudo cozido.** Ex.: massa aparece como *Macarrão, trigo, cru*.
  Ajuste as gramas ou cadastre sua versão.
- Não é conselho médico/nutricional. Metas e macros são estimativas.

---

## Fase 2 — registro por foto (opcional)

Implementada: botão **📷 Foto** na aba Hoje. A foto é comprimida no aparelho e
enviada ao **seu proxy** (Cloudflare Worker em [`fase2-proxy/`](fase2-proxy/)),
que guarda a chave da API da Anthropic como segredo — **a chave jamais fica no
front-end**. Cada alimento identificado entra como **estimativa editável**
casada com a base TACO; a nutrição continua vindo da tabela, a foto só sugere
alimento + gramas.

Requer conta na API da Anthropic (paga por uso, ~US$0,02/foto) e conta grátis
na Cloudflare. Passo a passo de deploy, custos e proteções em
[`docs/FASE-2-FOTO.md`](docs/FASE-2-FOTO.md). Sem configurar o proxy, o app
continua 100% funcional só com texto (Fase 1).

## Receitas — comida feita em casa

Em **Alimentos → Receitas** você monta uma receita (bolo, marmita, sopa…)
juntando ingredientes por texto (mesmo parser da aba Hoje: `500 g trigo`,
`4 ovos`) ou por foto. A soma dos nutrientes vira um **alimento seu** com
valores por 100 g — depois é só registrar `30 g bolo` na aba Hoje que as
calorias saem na proporção. Detalhe importante: informe o **peso final depois
de pronto** se puder pesar (assados perdem água no forno — sem isso o app usa
a soma dos ingredientes e avisa que é estimativa). Editar a receita recalcula
tudo; digitar o nome exato da receita casa direto, sem pedir confirmação.

## Exames — laboratoriais, de imagem e lembretes

Área **🧪 Exames**, para a vida inteira de laudos:

- **Laboratoriais:** um analito por linha (`Glicose em jejum · 92 mg/dL ·
  ref. 70–99`). A data fica travada entre um lançamento e outro para digitar
  o laudo inteiro em sequência; nome repetido puxa unidade e faixa do
  lançamento anterior. Valores numéricos com 2+ coletas viram **gráfico de
  evolução** com a faixa de referência tracejada. Fora da faixa ganha badge
  (↑/↓) — **somente comparando com a faixa que VOCÊ anotou do laudo** (elas
  variam por laboratório; o app não inventa referência). Resultados
  qualitativos ("não reagente") são aceitos como texto.
- **Imagem:** data, tipo (com sugestões), local e um resumo do laudo em
  texto — editável depois.
- **Lembretes:** "repetir a cada N meses". Registrar um exame com o mesmo
  nome reinicia a contagem sozinho; ao vencer, aparece aviso na área, um
  banner na aba Hoje e a bolinha no botão Exames. (Aviso é dentro do app —
  não há notificação de sistema; o app é estático, sem servidor.)

## Métricas de saúde — importar do app Saúde (iPhone)

Área **❤️ Métricas**: no iPhone, app Saúde → sua foto de perfil →
**“Exportar Todos os Dados de Saúde”** → escolha o `export.zip` aqui (ou o
`export.xml`, se preferir descompactar no app Arquivos). O arquivo é lido em
**streaming, neste aparelho** (o zip é aberto com `DecompressionStream`
nativo — sem biblioteca, sem upload), e vira **métricas diárias compactas**:
passos, distância, energia ativa/basal, minutos de exercício, sono, FC de
repouso, variabilidade (HRV) e VO₂máx.

- **Sem dupla contagem:** iPhone e Watch registram passos/energia em
  paralelo; em cada dia o app soma por fonte e usa a MAIOR — aproximação
  conservadora do total do app Saúde.
- **Honestidade:** energia e sono do relógio são estimativas de sensor; o
  app apresenta como vieram e diz isso na tela.
- **Cruzamento imediato:** card de **saldo energético** (média ingerida do
  diário × gasto estimado do relógio nos dias em que os dois existem) e
  gráficos por métrica com média de 7 dias.

## Análise inteligente (opcional — usa o seu proxy)

O botão **🔎 Analisar meus dados** monta um resumo numérico local (médias da
dieta, peso/composição, exames com as faixas anotadas, métricas do relógio,
lembretes vencidos) e envia ao SEU proxy (`POST /analyze`), que consulta a
IA e devolve uma leitura em texto puro: visão geral, evolução de exames,
cruzamentos, o que levar ao médico e lacunas. A resposta fica guardada para
reler offline. **Não é diagnóstico.** Proteções: mesma senha do app,
rate-limit e limite diário próprio (`ANALYSIS_DAILY_LIMIT`, padrão 20/dia).

## Multiusuário — compartilhando com outras pessoas

O app é multiusuário por natureza: **basta enviar o link**. Cada pessoa que
abrir o site tem seu próprio diário, perfil e metas, guardados **no aparelho
dela** (ninguém vê os dados de ninguém — não há servidor de dados). No
primeiro acesso, um guia de boas-vindas orienta a preencher o perfil.
Backup é individual: cada um exporta/importa seu JSON na aba Dados.

**Foto (opcional, custo é do dono do proxy):** o segredo `APP_TOKEN` aceita
**várias senhas separadas por vírgula** (`senha-daniel,senha-maria`) — dê uma
senha para cada pessoa e ela configura em Dados → Registro por foto. Para
revogar alguém, regrave o segredo sem a senha da pessoa
(`npx wrangler secret put APP_TOKEN`). O custo de todas as fotos cai na conta
de API do dono; proteções: `PHOTO_DAILY_LIMIT` (máx. de fotos/dia do grupo,
padrão 60) + limite de gasto no console da Anthropic.

---

## Estrutura dos arquivos

```
index.html          página única (carrega os scripts na ordem)
app.css             estilo (claro/escuro automático, mobile-first)
js/
  db.js             base TACO embutida (GERADA — não editar à mão)
  measures.js       medidas caseiras, pesos/unidade e sinônimos (EDITÁVEL)
  parser.js         interpreta o texto e casa com a base
  nutrition.js      Mifflin-St Jeor, TDEE, meta e macros
  storage.js        persistência (localStorage) + export/import
  charts.js         gráficos em SVG puro (sem biblioteca)
  health.js         lê o export do app Saúde (zip/xml) e agrega por dia
  app.js            interface e orquestração (3 áreas: Diário/Exames/Métricas)
data/
  source/*.csv      CSVs originais da TACO (raulfdm/taco-api, MIT)
  build-db.mjs      gera js/db.js a partir dos CSVs
  devserver.mjs     servidor estático só p/ teste local
  mock-proxy.mjs    proxy falso p/ testar o botão 📷 sem gastar API
fase2-proxy/        Cloudflare Worker da Fase 2 (guarda a chave da API)
  src/index.js      o proxy em si (CORS, token, validações, chamada de visão)
  test/smoke.mjs    testes locais com API simulada (npm test)
docs/FASE-2-FOTO.md arquitetura, deploy e custos da Fase 2
```
