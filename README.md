# Highlander — diário alimentar, exames e métricas (local-first)

Hub pessoal de saúde com **seis áreas** na barra de cima:

- **🍽️ Diário** — o diário alimentar original: registro em **texto em
  linguagem natural** (ex.: `150 g patinho`, `120g arroz`, `1 ovo`), kcal e
  macros (P/C/G) por item e por dia, gráficos vs. meta, peso e composição
  corporal, histórico.
- **🧪 Exames** — duas abas: **Laboratoriais** (um analito por linha, com
  faixa de referência do SEU laudo e gráfico de evolução) e **Imagem**
  (data + resumo do laudo). **Lembretes de repetição** ("a cada N meses")
  avisam na própria área, na aba Hoje e com uma bolinha no botão Exames.
- **❤️ Métricas** — peso e composição corporal no topo, e o import do
  **export do app Saúde do iPhone** (Apple Watch: passos, energia, sono, FC de
  repouso, VO₂máx…), agregado por dia NESTE aparelho e cruzado com o diário
  (saldo energético).
- **💊 Remédios** — o que você toma (e o que já tomou), para a análise ler seus
  exames sabendo disso.
- **🏋️ Treino** — coach semanal (protocolos Huberman/Galpin/Nippard): força,
  potência/fibras rápidas, equilíbrio, mobilidade, cardio Z2 e Z5. Você
  registra carga e minutos; ele dá notas por capacidade e evolui a semana.
- **💬 IA** — conversa com memória sobre os seus próprios dados e o histórico
  de análises já geradas (nenhuma é sobrescrita).

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

### Versão dos assets — suba o número a cada publicação

No `index.html`, o CSS e os nove scripts locais são carregados com uma marca de
versão: `href="app.css?v=1"`, `src="js/app.js?v=1"`. **Toda publicação que mexa
em qualquer arquivo `.js` ou no `app.css` precisa incrementar esse número — o
mesmo número em todos os dez.**

Sem isso o navegador continua servindo o arquivo antigo do cache, e a correção
publicada parece uma correção que não funcionou. Já aconteceu duas vezes com o
iPhone e custou uma rodada inteira de diagnóstico em falso. Um único número
compartilhado (em vez de um por arquivo) é proposital: assim não existe o estado
meio-atualizado, em que um script novo conversa com um antigo.

A numeração é manual porque o projeto não tem build — os arquivos são servidos
direto e o app precisa continuar abrindo por `file://` (a query string não
atrapalha isso). **Não introduza um bundler só para gerar esse número.**

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
- **Composição corporal (opcional)** — junto do peso, no topo da aba
  **❤️ Métricas**, dá para registrar **% de gordura** e **% de massa magra** (da
  balança de bioimpedância ou avaliação física). Com o peso do dia preenchido o
  app mostra o equivalente em kg, e cada série vira um gráfico próprio no
  Histórico. Nada é derivado sozinho: só entra o que você medir, e se
  gordura + massa magra somarem mais de 100% o app avisa.
- **O cartão de peso tem data própria** (padrão: hoje), independente do dia
  aberto no Diário — a aba Métricas não tem navegação de data, e sem isso
  registrar a pesagem de ontem exigiria voltar ao Diário para mudar o dia.

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
- **📷 Foto ou 📄 PDF do laudo** (nas duas abas): o app manda o documento
  para a IA transcrever e preenche tudo. No laboratorial, os analitos vêm
  numa **tela de conferência** — cada um marcável e editável — e só entra o
  que você aprovar; no de imagem, o formulário vem preenchido para você
  revisar antes de salvar. **Nada é salvo às cegas**: transcrição
  automática erra e aqui o erro custa caro. A faixa de referência só vem
  preenchida quando está impressa no laudo. O arquivo em si não é guardado
  em lugar nenhum, e o prompt manda ignorar dados pessoais (nome, CPF,
  convênio). Usa a sua chave da Anthropic — alguns centavos por laudo.
- **Lembretes:** "repetir a cada N meses". Registrar um exame com o mesmo
  nome reinicia a contagem sozinho; ao vencer, aparece aviso na área, um
  banner na aba Hoje e a bolinha no botão Exames. (Aviso é dentro do app —
  não há notificação de sistema; o app é estático, sem servidor.)

## Métricas de saúde — importar do app Saúde (iPhone)

Área **❤️ Métricas**: o primeiro cartão é **peso e composição corporal** (o
que se digita toda semana, na mão); o resto da aba vem do iPhone. Para importar:
no iPhone, app Saúde → sua foto de perfil →
**“Exportar Todos os Dados de Saúde”** → escolha o arquivo aqui (ou o XML
solto, se preferir descompactar no app Arquivos). O arquivo é lido em
**streaming, neste aparelho** (o zip é aberto com `DecompressionStream`
nativo — sem biblioteca, sem upload), e vira **métricas diárias compactas**:
passos, distância, energia ativa/basal, minutos de exercício, sono, FC de
repouso, variabilidade (HRV) e VO₂máx.

- **Funciona em qualquer idioma do iPhone.** A Apple traduz o nome do arquivo
  (em português o export sai como `exportar.zip`, com o XML traduzido dentro),
  então o app **não procura pelo nome**: ele lê o índice do zip e identifica o
  arquivo certo pelo conteúdo (a raiz `<HealthData`, que não é traduzida).
  Isso também descarta sozinho o export clínico (CDA), que vem no mesmo zip.
  Coberto por `fase2-proxy/test/import-saude.mjs` (`npm run test:saude`), que
  monta exports sintéticos em vários idiomas — roda sem servidor e sem
  navegador.

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

## Área 💬 IA — conversa e análises guardadas

Quarta área na barra de cima, com duas abas:

- **Conversa** — caixa de texto para perguntas pontuais sobre os próprios
  dados (`POST /chat`): *“minha proteína está suficiente?”*, *“o que mudou
  nos meus exames no último ano?”*. A IA recebe o MESMO resumo numérico da
  análise e **o fio da conversa** (últimas 30 mensagens), então dá para
  emendar sem repetir contexto. Modelo próprio (`CLAUDE_MODEL_CHAT`, padrão
  `claude-opus-5`): perguntar é bem mais frequente que analisar, e aqui o
  volume é que manda. Cota diária separada (`CHAT_DAILY_LIMIT`, padrão 100)
  para uma conversa longa não consumir as análises do dia.
- **Análises** — todas as análises já geradas, da mais recente para a mais
  antiga, com leitura expansível e opção de apagar uma a uma. Antes o app
  guardava só a última (campo `analysis`); agora é uma lista (`analyses`) e
  a migração no `Store.load()` move a análise antiga para o topo dela — quem
  já usava não perde nada.

Conversa e análises entram no backup da conta e contam como dados locais na
hora de resolver conflito entre aparelhos: quem só tivesse essas duas coisas
não corre o risco de a nuvem sobrescrevê-las em silêncio. Ao “juntar os
dois”, análises são mescladas por id e a conversa mantida é a mais longa —
intercalar dois fios produziria um diálogo que nunca aconteceu.

Coberto por `fase2-proxy/test/area-ia.mjs` (`npm run test:ia`).

## Remédios — o que você toma, e o que já tomou

Área **💊 Remédios**: nome, dose, como toma, para quê e desde quando. Marque
como *remédio* ou *suplemento*.

O ponto não é a lista em si — é que **a análise e a conversa recebem essa lista
junto dos exames**. Um exame alterado se lê de um jeito quando a pessoa começou
uma medicação há três meses e de outro quando não tomava nada.

- **Parar não apaga.** "⏹ encerrar" pede a data real da parada e move o item
  para *Encerrados*, riscado mas legível. É de propósito: quando um exame vira,
  a explicação costuma estar justamente no que foi suspenso. Quem quiser sumir
  com o registro tem "apagar", que avisa a diferença.
- **Voltou a tomar?** Um toque reabre o item, sem redigitar.
- **O que vai para a IA:** os em uso e os encerrados no último ano — encerrado
  há dois anos não explica exame de agora e só gastaria tokens.
- **A IA não opina sobre isso.** A regra no Worker é explícita: remédio é
  contexto de leitura, e ela é proibida de indicar começar, parar ou mudar dose.
  Levantar a pergunta para você levar ao médico, sim; dar a conduta, não.

O que a área **não** faz, de propósito: não lembra de tomar, não confere
interação entre medicamentos e não sugere nada. Nenhuma das três dá para fazer
com honestidade num app local sem base farmacológica.

## Treino — o coach semanal (opcional — usa o seu proxy)

Área **🏋️ Treino**: um coach que monta **uma semana por vez** e evolui o plano
pelos **números que você registra** — carga, séries, repetições, minutos, RPE.
A base do que ele prescreve vem dos protocolos públicos de **Andrew Huberman,
Andy Galpin e Jeff Nippard** (fontes em `docs/REFERENCIAS.md`), resumidos em
`fase2-proxy/src/conhecimento.js` (`CONHECIMENTO_TREINO`) e enviados junto de
cada chamada.

O que ele cobre, e por quê:

- **Força e hipertrofia** — a base; força é a capacidade que mais protege a
  independência com a idade.
- **Potência (fibras rápidas/tipo II)** — o envelhecimento perde primeiro
  velocidade, depois força, depois tamanho; saltos e arremessos no começo da
  sessão, descansado, são o antídoto. Foi o pedido que originou a área.
- **Equilíbrio e mobilidade** — dose de manutenção toda semana.
- **Cardio Zona 2** — volume na base (~180+ min/semana como alvo de longo
  prazo, teste da fala).
- **Cardio Zona 5/VO₂máx** — 1–2×/semana, intervalos curtos.

Como funciona o ciclo:

1. **Perfil** (uma vez): objetivo, dias por semana, tempo por sessão, onde
   treina, experiência e limitações. Editável depois.
2. **Plano**: o coach monta a semana 1 em **blocos de 4–6 semanas** com uma
   ênfase por bloco (e deload programado), respeitando seus dias e equipamento.
   Ele recebe também o resumo do app — dieta, peso/composição, exames,
   **remédios** e métricas do relógio — e considera isso (ex.: betabloqueador →
   zonas por RPE/fala em vez de frequência cardíaca).
3. **Registrar**: cada item tem campos de **kg × séries × reps** (ou minutos)
   e RPE. Aceita vírgula ("42,5"). O que ficou vazio conta como "não
   registrado" — de propósito.
4. **Fechar a semana**: o coach devolve **nota 0–10 por capacidade** (força,
   potência, equilíbrio, mobilidade, Z2, Z5), a leitura da semana, um **plano
   de melhoria** priorizado no que está pior, e já monta a semana seguinte com
   a progressão (~2–5% de carga OU 1–2 reps OU 5–10% de tempo — nunca tudo).
5. **Evolução**: notas em barras, avaliação e histórico de semanas fechadas.

As regras de honestidade valem aqui também: **sem registro não há nota** (vem
"sem registro", nunca um chute), notas são relativas a você (não a atleta), e
o coach não é médico — dor no peito/tontura/lesão = parar e procurar um. Os
dados de treino ficam na sua conta como tudo o mais (local + nuvem da conta);
a chamada usa a **sua** chave da Anthropic (BYOK), custa centavos e é limitada
por `TRAINING_DAILY_LIMIT` (10/dia por conta).

## Base de referência de longevidade (o que a IA consulta)

A conversa e a análise cruzada recebem junto uma **base de referência**
(Medicina 3.0 / Attia) em `fase2-proxy/src/conhecimento.js`: framework geral,
cardiovascular e lipídios (ApoB, Lp(a), morfologia de partícula), metabólico
(incluindo o índice de vulnerabilidade metabólica), neurodegeneração (APOE4,
"diabetes tipo 3"), exercício e VO₂ máx, testes de função e autonomia,
nutrição, suplementação, hormônios e higiene de sono/ambiente.

O que a torna útil em vez de perigosa:

- **Peso preferencial, não obediência.** A instrução manda a IA raciocinar
  dentro da base — e **discordar dela** quando os números da própria pessoa
  apontarem outra direção, dizendo que está discordando.
- **Etiqueta de evidência em cada item:** `[FORTE]`, `[ESCOLA]` (prática da
  escola de otimização, base mais fraca) e `[SECUNDÁRIO]` (divulgação, não
  literatura primária). Metade das fontes é secundária — apresentá-las com
  cara de ensaio clínico seria pior do que não ter base.
- **Disputa declarada:** em proteína e jejum, Attia e Longo discordam
  frontalmente. A base manda mostrar os dois lados em vez de fingir consenso.
- **Alvo de otimização ≠ faixa de laboratório.** Ao comentar um exame, vale a
  faixa que VOCÊ anotou do seu laudo.
- **Sem internet:** a IA é proibida de alegar consulta online ou inventar
  links e números de estudo.
- **Nada individual.** A base entra no prompt de todas as contas, então não
  pode conter dado clínico de ninguém — o documento de origem sobre reposição
  hormonal era personalizado, e só a parte técnica generalizável foi
  aproveitada. `test/smoke.mjs` falha se algo individual reaparecer ali, e
  também se a base encolher e perder um domínio.

Procedência item a item — com o que está conferido e o que não está — em
[`docs/REFERENCIAS.md`](docs/REFERENCIAS.md).

**Custo, e o que foi feito para baixá-lo.** A base viaja em toda pergunta:
~3.150 tokens de prompt + base, algo como US$ 0,016. Duas medidas:

- **Cada fato mora em UMA seção.** Quando outra precisa dele, aponta ("ver X")
  em vez de repetir. As regras de honestidade que valiam para a conversa e para
  a análise viraram um bloco único (`REGRAS_HONESTIDADE`) — antes eram duas
  redações quase iguais, que além do custo divergiriam com o tempo.
- **Cache de prompt na conversa.** O prefixo (prompt + base) não muda; os dados
  da pessoa vêm depois dele, num segundo bloco. Da 2ª pergunta em diante na
  mesma sentada, esse prefixo custa 10% em vez de 100% — três perguntas seguidas
  saem 52% mais baratas. A 1ª pergunta fica 25% mais cara: o empate é na
  segunda. A **análise** não usa cache de propósito — roda poucas vezes por mês,
  o cache dura 5 minutos, e o prefixo seria sempre escrito e nunca lido.
  `test/smoke.mjs` trava a ordem dos blocos: se os dados da pessoa subirem para
  antes da marca de cache, qualquer pesagem nova invalidaria tudo e a economia
  viraria prejuízo.

## Envio de contexto para o Open Brain (restrito, desligado por padrão)

Na aba **Análises** há um cartão para ligar o envio do seu contexto de saúde
para o [Open Brain](https://speueyaplfprjpgnakxm.supabase.co/functions/v1/open-brain-capture),
de modo que outras IAs suas encontrem esse histórico depois.

> **Só para as contas listadas em `OPENBRAIN_CONTAS`.** A chave do Open Brain é
> **uma só, do Worker** — ela não é por usuário. Num app multiusuário isso
> significa que, sem trava, o retrato semanal e os exames de *qualquer* pessoa
> que ligasse a opção cairiam no brain de quem hospeda o app, que não é dono
> desses dados. Por isso a rota e o cron conferem a conta, e para quem não está
> na lista **o cartão nem aparece**. A lista **vazia = ninguém** (falha
> fechada): um deploy que esqueceu de configurar não envia nada, em vez de
> enviar tudo de todo mundo.
>
> Se um dia cada pessoa precisar do próprio destino, o caminho é o mesmo da
> chave da Anthropic (`/account/apikey`): guardar uma chave por conta, cifrada
> com a chave de dados daquele usuário. Aí a trava por lista sai de cena.

- **O que sobe:** um **retrato semanal** (médias de dieta dos últimos 30 dias,
  peso e variação, composição corporal, médias do relógio) e **um pensamento
  por exame laboratorial novo**, com valor, unidade, data e a faixa de
  referência que VOCÊ anotou do laudo (marcando quando está fora dela).
- **O que nunca sobe:** foto, laudo em texto livre, exame de imagem, o texto
  das análises, a conversa da área IA e o diário item a item.
- **Por que síntese e não registro cru:** o Open Brain é memória semântica e
  **não tem apagar nem atualizar**. Um envio diário viraria centenas de
  entradas quase idênticas competindo com as notas reais da pessoa na busca —
  e sem volta.
- **Livro-caixa obrigatório:** `openbrain:<uid>` no KV guarda o último retrato
  e os ids de exame já enviados. Sem ele, cada execução reenviaria tudo e
  duplicaria de forma irreversível. A existência dessa chave É o opt-in; o
  cron só percorre quem ligou.
- **Quando roda:** cron semanal do Worker (`triggers.crons`, segunda 09:00 UTC)
  e também na hora em que você registra um exame (o app chama
  `POST /openbrain/sync`; o servidor decide o que ainda falta).
- **Configuração:** `OPENBRAIN_URL` no `wrangler.jsonc` e o segredo
  `OPENBRAIN_KEY` (`npx wrangler secret put OPENBRAIN_KEY`). Sem a chave, o
  recurso fica desligado e a interface diz isso.

Duas armadilhas da API real que o código trata e que não são óbvias: a
autenticação é o cabeçalho `x-brain-key` (**`Authorization` é ignorado**) e a
resposta é `text/plain`, com erro em `⚠️ Não guardei: …`. Além disso, a API
cria um LEMBRETE quando o texto contém “me lembre de” — como o app fala de
exames a repetir, o texto é higienizado antes de sair.

Coberto por `fase2-proxy/test/openbrain.mjs` (`npm run test:openbrain`), que
sobe uma cópia fiel do endpoint em localhost e prova, entre outras coisas, que
rodar duas vezes não duplica e que falha do destino não marca nada como
enviado.

## Conta e login (recomendado) — nunca mais perder dados

Sem conta, o app é 100% local: rápido e privado, mas os dados existem só
naquele navegador — e no iPhone **remover o app da tela de início apaga
tudo**. Com conta, você entra com e-mail e senha e o histórico volta.

- **Zero configuração.** O endereço do servidor já vem embutido no app; a
  pessoa só faz login. Foto, leitura de rótulo e análise passam a funcionar
  com a mesma sessão — sem preencher proxy nem senha do app.
- **Sincronização automática.** Toda alteração sobe sozinha poucos segundos
  depois de salvar. O chip no topo mostra `☁ seu@email` (em dia) ou
  `↻ seu@email` (enviando).
- **Cadastro só com convite.** Precisa do `INVITE_CODE` — é o que impede
  estranhos criando conta e gastando a API de quem paga o servidor.
- **Recuperação por e-mail.** "Esqueci a senha" manda um link válido por 30
  minutos; ao abri-lo o app pede a senha nova e **os dados continuam lá**.
- **A senha não sai do aparelho.** O PBKDF2 (250 mil iterações) roda no
  navegador; o servidor recebe só o resultado e guarda um HMAC dele. Um
  vazamento do banco não dá login a ninguém.
- **Conflito nunca é resolvido no escuro.** Se o aparelho e a nuvem tiverem
  versões diferentes, o app pergunta: juntar (padrão, não descarta nada),
  usar a da nuvem, ou usar a do aparelho.
- **…mas só pergunta quando há diferença de verdade.** Um envio que chega ao
  servidor e cuja resposta não volta (app fechado no meio, aparelho dormiu)
  deixa a nuvem com data mais nova e o aparelho com o `lastSyncAt` velho, sem
  nenhuma diferença real. Antes de perguntar, o app compara os dois estados
  byte a byte; se forem iguais, adota a data da nuvem e segue calado. Alarme
  falso repetido ensina a clicar sem ler justamente no único modal que
  precisa ser lido.
- **“Salvo na nuvem” só depois que o servidor confirma.** Enquanto o envio
  está no ar, o chip do topo continua em `↻` — dizer `☁` antes da resposta é
  uma mentira que só aparece quando a pessoa fecha o app no meio.

### O trade-off, dito com clareza

Para que "esqueci minha senha" funcione de verdade, os dados na nuvem são
cifrados com uma chave **do servidor** (`DATA_KEY`), não com a sua senha.
Isso significa que **quem administra o Worker consegue ler os dados** das
contas. Não existe recuperação de senha e sigilo absoluto ao mesmo tempo:
qualquer app que ofereça reset de senha e devolva seus dados está neste
mesmo modelo.

Quem preferir sigilo absoluto tem a opção antiga preservada em
**Dados → Backup sigiloso**: o diário é cifrado no aparelho com a senha do
app, de um jeito que nem o servidor abre — ao custo de que **esquecer essa
senha é perder o backup**, sem exceção.

## Multiusuário — o que é compartilhado e o que é individual

Este é o modelo de dados do app, e ele é **verificado por teste automatizado**
(duas contas reais contra o Worker real; veja "Testes" abaixo):

| Dado | Escopo | Onde vive |
|---|---|---|
| **Catálogo de alimentos comum** (nome + kcal/macros) | 🌐 **compartilhado** entre todas as contas | `foods-comum` no KV do Worker |
| Alimentos e receitas que você cadastra | 🔒 individual (só ficam comuns se você **marcar** "compartilhar") | seu blob de conta |
| Diário (refeições, gramas, kcal) | 🔒 individual | seu blob de conta |
| Peso, % de gordura e massa magra | 🔒 individual | seu blob de conta |
| Exames laboratoriais e de imagem, lembretes | 🔒 individual | seu blob de conta |
| Métricas do Apple Watch / app Saúde | 🔒 individual | seu blob de conta |
| Perfil, metas e a última análise de IA | 🔒 individual | seu blob de conta |

Detalhes que sustentam isso:

- Cada conta tem seu próprio registro (`data:<uid>`), cifrado com uma chave
  derivada só para ela. Uma sessão nunca alcança o registro de outra: pedir
  `/account/data` devolve **apenas** os dados de quem está logado.
- Ao compartilhar um alimento, sobem **somente** nome e valores nutricionais —
  nunca foto de rótulo, ingredientes de receita ou qualquer dado de saúde. A
  autoria fica como um hash anônimo de 6 caracteres.
- O catálogo comum **não** é copiado para dentro do seu blob privado (ele é
  cache; o servidor o serve em `/foods`), e o **token de sessão nunca sai do
  aparelho** — não vai para a nuvem nem para o arquivo que você exporta.
- Sem conta, nada sai do aparelho: o app segue 100% local.

**Quem pode entrar:** criar conta exige o `INVITE_CODE` — passe o código para
quem você quiser incluir. Para fechar a porta, troque o segredo
(`npx wrangler secret put INVITE_CODE`); contas já criadas continuam valendo.
Fora o convite, a pessoa não precisa de mais nada: abre o link, cria a conta
com o e-mail e a senha dela, e usa.

**E-mail de recuperação para outras pessoas.** No Resend, sem um domínio
verificado só é possível entregar no endereço do dono da conta do Resend.
Duas saídas:

- **Verificar um domínio** (recomendado) — em Domains → Add Domain, colar uns
  registros DNS. Depois ajuste `MAIL_FROM` para esse domínio e cada pessoa
  passa a receber a própria recuperação. É o jeito certo e a entrega é boa.
- **`MAIL_TO_OVERRIDE`** (paliativo) — todas as recuperações vão para um
  endereço só, que repassa o link. O e-mail diz de qual conta é o pedido.
  ⚠ Quem recebe o link **entra na conta da pessoa** — use só com gente de
  confiança e desligue (`""`) assim que tiver domínio.

**Cada conta usa a PRÓPRIA chave da Anthropic (BYOK).** Foto, leitura de
rótulo e análise são pagas por uso, e o custo cai em quem usa — não em quem
hospeda. A pessoa cadastra a chave dela em **Dados → Sua chave da Anthropic**
(o app testa na hora se funciona); sem chave, essas funções respondem `402`
com uma mensagem explicando onde cadastrar. Detalhes:

- A chave fica **cifrada no servidor**, na conta daquela pessoa, e **nunca**
  volta inteira para o navegador (só os 4 últimos caracteres), nunca é
  guardada no aparelho e nunca entra no backup nem no arquivo exportado.
- `PHOTO_DAILY_LIMIT` (padrão 60) e `ANALYSIS_DAILY_LIMIT` (padrão 20)
  passaram a contar **por conta** — cada um protege o próprio bolso. Vale
  também definir um limite de gasto no console da Anthropic.
- O caminho legado (senha do app, sem conta) continua usando a
  `ANTHROPIC_API_KEY` do servidor, se ela estiver configurada.

**Modelo antigo (ainda suportado):** o segredo `APP_TOKEN` aceita várias
senhas separadas por vírgula (`senha-daniel,senha-maria`), usadas antes das
contas. Continua funcionando para abrir backups sigilosos antigos.

---

## Nome, ícone e o proxy (nota de manutenção)

O app se chama **Highlander**. O ícone é `icons/icon.svg` — uma silhueta
simples de espada, desenhada em SVG (sem foto de terceiros, sem questão de
direito autoral) — e os PNGs derivados dele (`icon-512.png`, `icon-180.png`)
usados pelo manifest, pelo atalho do iPhone e pela tag `<link rel="icon">`
(navegadores sem suporte a favicon SVG). O favicon e a miniatura no topo
apontam para o próprio `.svg` (escalável, nítido em qualquer tamanho).

**Para editar o desenho da espada:** abra `icons/icon.svg` — são só 4 formas
(lâmina, guarda, cabo, pomo) num `<g fill="#eef0ee">`; mude os números do
`<path>`/`<rect>`/`<circle>` e rode `node data/render-icon-svg.mjs` para
gerar os dois PNGs de novo (requer `npm i -D playwright`).

**Para trocar por uma FOTO sua** (como era antes desta versão), há dois
caminhos que não tocam no `.svg` — geram os PNGs direto de uma imagem:

- **`data/recortar-icone.html`** — abra este arquivo no navegador (funciona
  direto, sem servidor, inclusive no celular). Escolha a foto, arraste para
  enquadrar, ajuste o zoom conferindo a prévia de 60 px (o tamanho real na
  tela de início) e baixe os dois PNGs. A imagem **não sai do aparelho**.
- **`node data/make-icon.mjs <imagem> [--x=50] [--y=45] [--zoom=1]`** — a
  mesma coisa por linha de comando (requer `npm i -D playwright`).
  Nesse caso, troque também o `<link rel="icon">` e o `.brand-icon` em
  `index.html` para apontar para o PNG (o navegador não sabe recortar foto
  em SVG) — veja o histórico do repositório para o formato exato.

Depois de trocar os PNGs (por qualquer caminho), faça commit. No iPhone o
ícone da tela de início só muda depois de **remover e adicionar o app de
novo** — o iOS guarda o antigo em cache.

> Se a arte escolhida for fotografia de terceiros, a licença é decisão do
> dono do app — o projeto não distribui licença de imagem.

> O Worker da Fase 2 continua chamado `diario-alimentar-proxy`
> (`fase2-proxy/wrangler.jsonc`) e sua URL segue
> `diario-alimentar-proxy.azimoov.workers.dev`. **Não renomeie:** trocar o
> `name` cria um Worker NOVO no deploy, deixando para trás os segredos
> (chave da API, senhas) e o KV do backup. O repositório e a URL do GitHub
> Pages também seguem `diario-alimentar` — renomear o repo mudaria o
> endereço do site e exigiria reconfigurar `ALLOWED_ORIGINS` no proxy.

## Testes

Nada aqui precisa de conta na Cloudflare, chave de API ou internet.

```
node test/todos.mjs             # RODA TUDO (14 suítes) — sobe os dois
                                # servidores locais sozinho e derruba no fim
```

Requisito único além do Node: o navegador de testes, uma vez só —
`npm i -D playwright && npx playwright install chromium`.

Para mexer no app com os servidores no ar (e testar à mão no navegador):

```
cd fase2-proxy && npm test      # Worker: contas, login, recuperação de senha,
                                # dados na nuvem, foto, análise, limites, CORS
cd fase2-proxy && npm run dev:local   # sobe o Worker REAL em Node (porta 8124)
node data/devserver.mjs               # serve o app (porta 8123)
```

Com esses dois no ar, o app roda de verdade contra o Worker de verdade: dá
para criar conta (convite `convite-local`), sincronizar e testar a
recuperação de senha — o link do e-mail aparece no terminal do dev-server e
em `http://localhost:8124/__emails`.

O modelo de dados descrito acima (catálogo comum compartilhado × dados de
saúde individuais) é coberto por `fase2-proxy/test/isolamento-contas.mjs`:
ele cria duas contas simultâneas e confere item por item o que atravessa e o
que não atravessa entre elas. Com os dois servidores acima no ar:

```
# testes do SERVIDOR (contas, dados, laudos, isolamento entre contas)
node fase2-proxy/test/smoke.mjs              # rotas do Worker, limites, CORS
node fase2-proxy/test/conta-e-login.mjs      # login, sync, recuperação, chave
node fase2-proxy/test/isolamento-contas.mjs  # o que é compartilhado × individual
node fase2-proxy/test/laudo-foto-pdf.mjs     # laudo por foto e por PDF
node fase2-proxy/test/area-ia.mjs            # conversa com memória e análises
node fase2-proxy/test/openbrain.mjs          # envio de contexto p/ o Open Brain
node fase2-proxy/test/import-saude.mjs       # zip do Saúde em qualquer idioma

# testes do APP (interface e cálculos)
node test/health-parser.mjs       # leitura do export do app Saúde (só Node)
node test/peso-composicao.mjs     # peso, % gordura e massa magra
node test/exames-e-metricas.mjs   # áreas Exames e Métricas + análise
node test/marca-e-pwa.mjs         # marca, manifest, ícones, as 6 áreas
node test/remedios.mjs            # área Remédios: anotar, encerrar, chegar na IA
node test/treino.mjs              # área Treino: plano, registro, notas, evolução
node test/recortar-icone.mjs      # ferramenta de recorte do ícone
```

Todos criam contas descartáveis a cada execução, então dá para rodar quantas
vezes quiser. `test/_comum.mjs` guarda o que eles compartilham (entrar pelo
portão, cadastrar chave de teste). O `dev-server` desliga o rate-limit
(`RATE_LIMIT_OFF`) só no ambiente local — em produção ele continua valendo.

## Estrutura dos arquivos

```
index.html          página única (carrega os scripts na ordem)
app.css             estilo (claro/escuro automático, mobile-first)
icons/icon.svg      ícone do app: silhueta de espada (fonte editável)
icons/icon-*.png    PNGs gerados do svg (512 e 180) — veja a seção acima
js/
  db.js             base TACO embutida (GERADA — não editar à mão)
  measures.js       medidas caseiras, pesos/unidade e sinônimos (EDITÁVEL)
  parser.js         interpreta o texto e casa com a base
  nutrition.js      Mifflin-St Jeor, TDEE, meta e macros
  storage.js        persistência (localStorage) + export/import
  charts.js         gráficos em SVG puro (sem biblioteca)
  health.js         lê o export do app Saúde (zip/xml) e agrega por dia
  auth.js           conta/login, PBKDF2 no aparelho e sync com a nuvem
  app.js            interface e orquestração (6 áreas: Diário/Exames/Métricas/Remédios/Treino/IA)
data/
  source/*.csv      CSVs originais da TACO (raulfdm/taco-api, MIT)
  build-db.mjs      gera js/db.js a partir dos CSVs
  devserver.mjs     servidor estático só p/ teste local
  mock-proxy.mjs    proxy falso p/ testar 📷 e 🔎 sem gastar API
  recortar-icone.html  recorta uma foto e baixa os PNGs do ícone (offline)
  make-icon.mjs     o mesmo recorte por linha de comando
test/               testes do app (interface, parser do Saúde, ícone)
  todos.mjs         roda TUDO com um comando (sobe e derruba os servidores)
  _comum.mjs        utilitários: entrar pelo portão, conta descartável
fase2-proxy/        Cloudflare Worker (chave da API, contas e backup)
  src/index.js      o proxy em si (contas, CORS, validações, visão, análise)
  dev-server.mjs    roda o Worker REAL em Node p/ testar login sem deploy
  test/smoke.mjs    testes locais com API simulada (npm test)
docs/FASE-2-FOTO.md arquitetura, deploy e custos da Fase 2
```
