# Diário Alimentar — kcal e macros (local-first, sem IA)

Ferramenta pessoal de diário alimentar para perda de peso. Você registra o que
comeu em **texto em linguagem natural** (ex.: `150 g patinho`, `120g arroz`,
`1 ovo`, `meia xícara de feijão`), e o app calcula **calorias e macros (P/C/G)**
por item e por dia, mostra em **gráficos** o total do dia vs. sua meta e a
distribuição de macros, e guarda o **histórico** no seu aparelho.

- **Sem IA, sem servidor, sem chave de API.** O texto é interpretado por um
  parser local (regex + normalização). App 100% estático.
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

## Fonte da base de alimentos (TACO)

- **Tabela:** TACO — Tabela Brasileira de Composição de Alimentos, **4ª edição
  revisada e ampliada** (NEPA/UNICAMP, 2011).
  Página oficial: <https://nepa.unicamp.br/tabela-brasileira-de-composicao-de-alimentos-4a-edicao/>
- **Digitalização usada (JSON/CSV):** repositório **`raulfdm/taco-api`** (licença
  MIT) — <https://github.com/raulfdm/taco-api>. Os arquivos originais baixados
  estão em `data/source/` (`food.csv`, `nutrients.csv`, `categories.csv`).
- **Como a base foi montada:** o script `data/build-db.mjs` junta os três CSVs
  (sem alterar valores) e gera `js/db.js`, que o app carrega. Para atualizar:
  substitua os CSVs em `data/source/` e rode `node data/build-db.mjs`.
- **Conferência:** alguns valores foram checados contra a TACO (ex.: *Arroz,
  tipo 1, cozido* = 128 kcal/100g; *Carne bovina, patinho, grelhado* = 219
  kcal/100g; *Feijão, carioca, cozido* = 76 kcal/100g). **597 alimentos**, valores
  **por 100 g de parte comestível**.

> Se você quiser trocar por outra edição/fonte, mantenha a mesma estrutura de
> CSV e rode o script de novo. Não edite `js/db.js` à mão.

---

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
receitas** — você cadastra em **Dados → Meus alimentos**, com os valores do
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

Em **Dados → Minhas receitas** você monta uma receita (bolo, marmita, sopa…)
juntando ingredientes por texto (mesmo parser da aba Hoje: `500 g trigo`,
`4 ovos`) ou por foto. A soma dos nutrientes vira um **alimento seu** com
valores por 100 g — depois é só registrar `30 g bolo` na aba Hoje que as
calorias saem na proporção. Detalhe importante: informe o **peso final depois
de pronto** se puder pesar (assados perdem água no forno — sem isso o app usa
a soma dos ingredientes e avisa que é estimativa). Editar a receita recalcula
tudo; digitar o nome exato da receita casa direto, sem pedir confirmação.

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
  app.js            interface e orquestração
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
