# PONTO DE RETOMADA — Highlander

_Atualizado em 2026-08-17. Quem chega agora lê só até "O que falta"; o resto é
histórico e memória das decisões._

## O que é

Hub pessoal de saúde, estático (HTML/CSS/JS puros, sem build), publicado no
GitHub Pages e usável como app no iPhone. **Cinco áreas** na barra de cima:

| Área | O que faz |
|---|---|
| 🍽️ Diário | registro por texto em linguagem natural → kcal e macros, gráficos, histórico. Base de 6.273 alimentos (TACO + TBCA + USDA) embutida em `js/db.js` |
| 🧪 Exames | laboratoriais (analito por linha, com a faixa do SEU laudo) e de imagem; lembretes de repetição; leitura de laudo por **foto ou PDF** |
| ❤️ Métricas | peso e composição corporal; import do export do app Saúde do iPhone (passos, energia, sono, FC, VO₂máx) e saldo energético |
| 💊 Remédios | o que a pessoa toma e o que já tomou; encerrar guarda como histórico, não apaga |
| 💬 IA | conversa com memória sobre os próprios dados + histórico de análises |

A conversa e a análise consultam uma **base de referência de longevidade**
(Medicina 3.0 / Attia) em `fase2-proxy/src/conhecimento.js`, com etiqueta de
evidência item a item e procedência em `docs/REFERENCIAS.md`. Há ainda um
envio opcional de contexto para o **Open Brain**, desligado por padrão.

## Estado atual (17/08/2026)

- **Tudo o que foi pedido está implementado e no `main`.** Última rodada:
  mesclagem de duas frentes de trabalho que corriam em paralelo + toda a suíte
  de testes de volta ao verde.
- **Suíte: 13 conjuntos, todos passando**, e rodando duas vezes seguidas sem
  sujar estado. Um comando: `node test/todos.mjs` (ele mesmo sobe e derruba os
  dois servidores locais).
- **Site:** <https://azimoov.github.io/diario-alimentar/> — republica sozinho
  a cada `git push` na `main` (~1 min).
- **Proxy:** <https://diario-alimentar-proxy.azimoov.workers.dev> (Cloudflare
  Worker, pasta `fase2-proxy/`).

## O que falta — 1 passo, e é do Daniel

O app inteiro está **atrás de login** (o "portão"). O Worker publicado ainda é
a versão anterior, sem as rotas de conta: enquanto os segredos não forem
cadastrados e o deploy não for feito, **ninguém consegue entrar** — nem no
celular do Daniel. Na pasta `fase2-proxy/`, no computador dele:

```
npx wrangler secret put DATA_KEY        # texto longo e aleatório — GUARDE-O
npx wrangler secret put INVITE_CODE     # código de convite (quem cria conta usa)
npx wrangler secret put RESEND_API_KEY  # chave do Resend (recuperação de senha)
npx wrangler deploy
```

Opcional, só se for usar o envio para o Open Brain:
`npx wrangler secret put OPENBRAIN_KEY`. **Confira também `OPENBRAIN_CONTAS`
no `wrangler.jsonc`**: é a lista de e-mails autorizados a sincronizar. A chave
do Open Brain é uma só, do Worker — sem essa lista, os dados de saúde de
qualquer usuário que ligasse a opção cairiam no seu brain. Lista vazia =
ninguém sincroniza, nem você.

- **`DATA_KEY` é insubstituível**: é ela que cifra os dados das contas em
  repouso. Perdida ou trocada, as contas continuam existindo e os dados
  guardados na nuvem viram lixo ilegível. Guarde fora do computador.
- `MAIL_TO_OVERRIDE` está apontado para `serruyadaniel@gmail.com` porque o
  Resend, sem domínio verificado, só entrega para o dono da conta. **Efeito
  colateral aceito e explicado:** todo e-mail de recuperação, de qualquer
  usuário, cai nessa caixa — e quem recebe o link entra naquela conta. Para
  tirar isso, verifique um domínio no Resend e remova a variável.
- No Windows use `npx.cmd`. O wrangler já está logado na conta
  `serruyadaniel@gmail.com`.

Depois do deploy: abrir o site, criar a conta com o convite, e cadastrar a
chave da Anthropic em **Diário → Dados → Sua chave** (cada pessoa paga a
própria IA — BYOK).

## Como retomar em 5 minutos

```
git clone https://github.com/Azimoov/diario-alimentar   # ou git pull
node data/devserver.mjs                 # app em http://localhost:8123
cd fase2-proxy && npm run dev:local     # Worker REAL em Node, porta 8124
```

No app: **Dados → servidor** = `http://localhost:8124`, convite
`convite-local`. Os e-mails de recuperação aparecem no terminal e em
`http://localhost:8124/__emails`. Nada disso usa internet, chave de API ou
conta na Cloudflare — a Anthropic é simulada pelo dev-server.

Para rodar os testes (uma vez só: `npm i -D playwright && npx playwright
install chromium`):

```
node test/todos.mjs
```

## Decisões que não devem ser revertidas sem conversa

1. **Sem build, sem bundler, sem CDN.** Scripts clássicos e base embutida em
   JS para o app abrir por `file://` e no Pages. Por isso a versão dos assets
   (`?v=N` no `index.html`) é manual — e **precisa subir a cada publicação que
   mexa em `.js`/`.css`**, senão o iPhone continua rodando o código velho
   (já custou duas rodadas de diagnóstico em falso).
2. **A senha nunca sai do aparelho.** PBKDF2 250k no navegador → o servidor
   recebe só o `authKey` e guarda um HMAC dele. PBKDF2 no servidor estouraria
   o limite de 10 ms de CPU do plano grátis do Workers.
3. **Modelo recuperável, não zero-knowledge.** Os dados na nuvem são cifrados
   com a chave DO SERVIDOR (`DATA_KEY`), não com a senha do usuário. É isso
   que faz "esqueci minha senha" funcionar sem perder o histórico — e implica
   que quem administra o Worker consegue ler os dados. O Daniel sabe e
   escolheu assim, depois de perder um backup por senha esquecida.
4. **Catálogo de alimentos é compartilhado; saúde e dieta são individuais.**
   `exportJSON({paraNuvem:true})` tira `sharedFoods` (o servidor já serve em
   `/foods`) e **sempre** tira o token de sessão. Coberto por
   `fase2-proxy/test/isolamento-contas.mjs`, que cria duas contas e confere
   item por item o que atravessa e o que não atravessa.
5. **Nada sobe antes da checagem inicial.** `Auth.travarEnvio()/liberarEnvio()`
   existe para o app não sobrescrever às cegas um histórico mais novo feito em
   outro aparelho. Na dúvida ele pergunta (juntar / nuvem / aparelho).
6. **Transcrição não é interpretação.** Os prompts de laudo proíbem inventar
   faixa de referência, proíbem diagnosticar e mandam ignorar dados pessoais
   (nome, CPF, convênio). Nada de laudo é salvo sem revisão humana.
7. **Dois modelos por tarefa** (`wrangler.jsonc`): visão/transcrição no
   `claude-opus-5` (volume alto e erro caro), análise cruzada no
   `claude-fable-5` (rara, raciocínio pesado). `test/smoke.mjs` trava a
   escolha — se trocarem, três testes falham.
8. **A base de referência é preferencial, não dogma.** Cada item carrega
   `[FORTE]`/`[ESCOLA]`/`[SECUNDÁRIO]`, a disputa proteína×jejum é declarada em
   vez de resolvida, e a IA é instruída a discordar da base quando os números
   da pessoa apontarem outra direção. Ela entra no prompt de TODAS as contas:
   **nada de dado clínico individual ali** — o `smoke.mjs` falha se algo
   individual reaparecer, ou se a base perder um domínio.
9. **Merge de dias por assinatura, não por `Object.assign`.** Juntar nuvem e
   aparelho comparando `foodId|gramas|refeição|texto` foi o que impediu perder
   itens quando o mesmo dia foi editado em dois lugares.

## Mapa rápido

```
index.html app.css icons/     o app
js/db.js                      base de alimentos (GERADA — não editar à mão)
js/{parser,nutrition,storage,charts}.js
js/health.js                  lê o export do app Saúde (zip/xml, streaming)
js/auth.js                    conta, PBKDF2 no aparelho, sync com a nuvem
js/app.js                     interface e orquestração das 5 áreas
data/                         geração da base, servidor local, recorte do ícone
test/todos.mjs                roda TUDO com um comando
test/_comum.mjs               entrar pelo portão, conta descartável
fase2-proxy/src/index.js      o Worker (contas, dados, visão, laudos, análise)
fase2-proxy/src/conhecimento.js  base de referência consultada pela IA
docs/REFERENCIAS.md           de onde vem cada afirmação da base
fase2-proxy/dev-server.mjs    o Worker REAL em Node, com Anthropic simulada
docs/FASE-2-FOTO.md           arquitetura, rotas, custos e deploy
```

## Limitações conhecidas

- Estimar gramas por foto é impreciso por natureza — todo item de foto entra
  como estimativa editável. Pesar continua sendo o método de referência.
- O caminho de PDF de laudo foi validado contra a API **simulada**; a leitura
  de PDF de verdade só se confirma com a chave real depois do deploy. Vale para
  tudo que fala com a Anthropic: foto de refeição, rótulo, laudo, análise,
  conversa e o cache de prompt foram exercitados contra o mock, nunca contra a
  API de produção — o container onde o código foi escrito não tem saída de rede.
- O backup antigo do Daniel (modelo por senha do app) segue cifrado com uma
  senha esquecida. É irrecuperável **por desenho** — o registro no KV está
  intocado, mas não existe caminho de volta. O modelo de conta atual existe
  justamente para isso não se repetir.
- Medidas caseiras genéricas são aproximadas; a TACO não tem tudo cozido.

## O que foi decidido NÃO fazer (e por quê)

Não são pendências esquecidas — são escolhas. Se mudar de ideia, é aqui que
está o motivo original:

- **Remédios não vão para o Open Brain.** O envio leva retrato semanal e exames;
  medicação é dado sensível saindo para um serviço externo, e a decisão é do
  dono, não do código. Incluir é pequeno: entra no retrato em `src/index.js`.
- **O Open Brain é só do dono (`OPENBRAIN_CONTAS`), não de cada usuário.** A
  alternativa avaliada foi chave por conta, como a da Anthropic — mais correta
  para multiusuário, mas exige que cada pessoa tenha conta no Open Brain. Ficou
  a trava por lista; o caminho para mudar está no README.
- **Sem lembrete de tomar remédio.** O app não roda em segundo plano no iPhone;
  um lembrete que não dispara é pior do que nenhum.
- **Sem checagem de interação entre medicamentos.** Exigiria base
  farmacológica; improvisar isso seria perigoso.
- **A análise não usa cache de prompt** (a conversa usa). Roda poucas vezes por
  mês e o cache dura 5 minutos: o prefixo seria sempre escrito e nunca lido.

## Próximos passos sugeridos (nenhum é urgente)

1. Verificar um domínio no Resend e remover `MAIL_TO_OVERRIDE`, para cada
   pessoa receber o próprio e-mail de recuperação.
2. Completar as lacunas da base de referência com literatura primária: sono,
   rastreio oncológico e saúde mental são citados sem fonte de suporte (a
   própria base declara a lacuna quando o assunto surge).
3. Afinar `js/measures.js` (sinônimos, pesos por unidade) com o uso real.
4. Qualidade de vida: copiar dia anterior, refeições favoritas, metas por
   refeição.

---

# Histórico (mais recente primeiro)

## 2026-08-16 — Base de referência de longevidade e envio ao Open Brain
- Chegaram por patch (commits 4 e 5 de uma frente paralela) e foram ampliados
  aqui a partir dos documentos originais: faltava neurodegeneração inteira
  (APOE4, "diabetes tipo 3"), índice de vulnerabilidade metabólica, testes de
  função e autonomia, e vários itens de hormônio e suplementação.
- O documento hormonal de origem é clínico e INDIVIDUAL; só a parte técnica
  generalizável entrou. Teste no smoke falha se dado individual reaparecer.
- Open Brain: retrato semanal + um pensamento por exame novo, desligado por
  padrão, com livro-caixa no KV para nunca duplicar (a API não tem apagar).

## 2026-08-16 — Duas frentes mescladas e suíte de volta ao verde
- Duas conversas mexeram no app ao mesmo tempo. A mesclagem não deu conflito,
  mas quebrou testes: `.weight-card` deixou de servir como marca de "app
  montado" (o cartão foi para Métricas e nasce escondido → agora é `.daynav`),
  três áreas viraram quatro, e a análise única (`analysis`) virou lista
  (`analyses`).
- Defeito que só aparecia rodando a suíte DUAS vezes com o mesmo dev-server:
  e-mails fixos em dois testes e um alimento de nome fixo no catálogo comum
  (que é global) davam 409 na segunda rodada. Todos levam selo por execução.
- `test/todos.mjs`: um comando roda as 11 suítes, subindo e derrubando os
  servidores locais sozinho.

## 2026-08-09 — Área 💬 IA, modelos por tarefa e peso em Métricas
- Conversa com memória (`/chat`) e histórico de análises: nenhuma análise é
  sobrescrita; o campo antigo é migrado para a lista na carga.
- Visão/transcrição no Opus 5, análise cruzada no Fable 5 — travado por teste.
- Peso e composição corporal vão para o topo de Métricas, com **data própria**
  (a aba não tem navegação de data).
- Versão nos assets (`?v=N`) para o iPhone parar de rodar JS antigo do cache.

## 2026-08-08 — Portão de login e laudo por foto/PDF
- O app inteiro passa a exigir conta (`<body class="gate-active">` já no HTML,
  para não piscar a tela do app antes do login). O portão tem "Esqueci minha
  senha", e abrir um link de recuperação estando deslogado não pode deixar
  ninguém preso em "Carregando…" (regressão coberta por teste).
- Laudo lido por foto ou PDF nas duas abas de exames. O PDF vai nativo para a
  API como bloco `document` — o app **não** carrega biblioteca de PDF.
- Import do app Saúde passa a achar o XML pelo CONTEÚDO, não pelo nome: em
  iPhone em português o arquivo não se chama `export.xml`.

## 2026-08-07 — Contas, recuperação de senha e BYOK
- Login por e-mail com recuperação de verdade (Resend); dados da conta na
  nuvem; separação entre catálogo comum e dados individuais, com teste.
- Cada conta usa a **própria** chave da Anthropic (`/account/apikey`): a chave
  é validada contra `GET /v1/models` antes de salvar, fica cifrada no servidor
  e nunca volta inteira para o navegador. Limites diários passam a ser por
  conta.
- App renomeado para **Highlander**; ícone vira silhueta de espada.
- Áreas Diário / Exames / Métricas, e % de gordura e massa magra junto do peso.

---

_Daqui para baixo, o log antigo em ordem cronológica CRESCENTE (2026-07-13 →
2026-08-03), preservado como está._

## Fase 2 (foto) — PUBLICADA em 2026-07-13
- **Proxy no ar:** https://diario-alimentar-proxy.azimoov.workers.dev
  (Cloudflare, conta serruyadaniel@gmail.com, subdomínio azimoov.workers.dev).
  Segredos ANTHROPIC_API_KEY e APP_TOKEN cadastrados PELO DANIEL via
  `wrangler secret put` (dica Windows: usar `npx.cmd`). Verificado: 401 sem
  token, 403 origem estranha. Wrangler logado (config copiada p/
  ~/.config/.wrangler p/ funcionar no terminal do usuário).
- Falta apenas o Daniel configurar URL+senha na aba Dados de cada aparelho.

## Detalhes da implementação
- **App:** botão 📷 na aba Hoje (comprime p/ 1024px JPEG no aparelho), config
  em Dados → "Registro por foto" (URL do proxy + APP_TOKEN, em
  `S.settings`). Itens de foto entram como estimativa com selo de confiança e
  confirmação quando o casamento com a TACO é parcial (fallback de matching
  parcial em `parser.js` — nunca resolve sozinho, sempre `ambiguous`).
- **Proxy:** Cloudflare Worker em `fase2-proxy/` (SDK oficial
  `@anthropic-ai/sdk`, saída estruturada `output_config.format` com JSON
  schema, modelo padrão `claude-opus-5`, CORS + X-App-Token + rate-limit).
  `npm test` roda 10 testes contra API simulada — todos passando.
- **Testado ponta a ponta** com mock (`data/mock-proxy.mjs`) no navegador.
- **FALTA (ações do Daniel):** (1) conta API Anthropic + billing + chave +
  limite de gasto; (2) conta Cloudflare. Depois: `wrangler login` (ele
  autoriza), `wrangler deploy`, e ELE cola os segredos via
  `npx wrangler secret put ANTHROPIC_API_KEY` / `APP_TOKEN` (a chave nunca
  passa pelo assistente). Por fim configurar URL+senha na aba Dados.
  Passo a passo completo em `docs/FASE-2-FOTO.md`.

## Fase 3 (Apple Watch/Siri) — CANCELADA pelo Daniel em 2026-07-13
- Chegou a ser publicada (endpoint /status + push do app) e foi **revertida
  no mesmo dia** a pedido dele: app não envia mais totais, /status removido
  do Worker, registro "status" apagado do KV. O KV DIARIO_KV foi mantido e
  repropositado p/ o contador do limite diário de fotos.
- Se retomar um dia: o commit ecb4b18 tem a implementação completa (Atalho
  da Apple de 2 ações lia frase pronta em GET /status).

## Fase 4 (multiusuário "cada um no seu celular") — PUBLICADA em 2026-07-13
- Modelo escolhido pelo Daniel: várias pessoas usam o mesmo site, cada uma
  com dados no próprio aparelho (sem contas, sem sync, sem painel — LGPD ok).
- **Worker:** APP_TOKEN aceita várias senhas separadas por vírgula (uma por
  pessoa; revogação = regravar o segredo sem a senha). Limite diário de
  fotos do grupo: var PHOTO_DAILY_LIMIT (padrão 60), contado no KV
  (chave fotos:YYYY-MM-DD, TTL 48h, fuso TIMEZONE). 14 testes passando.
- **App:** banner de boas-vindas no primeiro uso (some quando o perfil é
  preenchido; botão leva à aba Perfil).
- Segredo APP_TOKEN atual do Daniel continua válido (lista de 1). Para
  adicionar alguém: `npx.cmd wrangler secret put APP_TOKEN` com
  "senha-daniel,senha-nova".

## Fase 5 (receitas) — PUBLICADA em 2026-07-16
- Aba "Alimentos" → Receitas: monta receita com ingredientes por texto (parser
  da Fase 1) ou foto (fluxo da Fase 2), com confirmação por ingrediente.
- Receita = alimento custom com campo `recipe: {ingredients:[{foodId,grams}],
  finalWeight}`; valores por 100 g derivados da soma ÷ peso final (opcional —
  sem ele usa a soma dos ingredientes e avisa que assados perdem água).
- Registrar "30 g bolo" na aba Hoje calcula proporcional. Nome EXATO de
  alimento/receita custom casa direto no parser (sem confirmação).
- Sinônimos novos: trigo/farinha→#35, oleo→#272, fermento→#513,
  creme de leite→#447, leite condensado→#453.
- Testado no navegador: exemplo do bolo (4.583 kcal/1.100 g, peso final
  900 g → 509,2 kcal/100g; 30 g = 153 kcal), edição recalcula, persiste.

## Fase 6 (base ampliada TACO+TBCA+USDA) — PUBLICADA em 2026-07-18
- **6.273 alimentos**: TACO 597 + TBCA 7.3 5.668 (pratos prontos, bebidas,
  industrializados — ids = códigos oficiais BRCxxxx, conferidos campo a campo
  contra tbca.net.br: cerveja C0009H, coxinha C0100F, leite C0043G) + USDA
  SR Legacy 8 curados (whey, cottage, cream cheese… ids u<fdcId>, domínio
  público; seleção em `data/usda-selecao.mjs`).
- **Licença TBCA:** uso não comercial com citação obrigatória — Daniel ciente
  e decidiu incluir (repo público). Citação no README e na aba Dados.
- TABNUT descartada (é USDA traduzida, sem download oficial).
- `build-db.mjs` reescrito multi-fonte com checks de sanidade que quebram o
  build se valores-âncora divergirem. `norm` não é mais gravado no db.js
  (app calcula no load — 34ms). db.js ~1,1 MB (~220 KB gzip).
- App: etiqueta de fonte na busca/candidatos, cartão de fontes em Dados,
  sinônimos novos (leite→C0043G resolve o gap nº1, whey→u173180, cerveja,
  cottage, coxinha 50g/unidade conforme porção TBCA).
- Ids TACO e de custom foods preservados — dados antigos intactos.

## Próximos passos sugeridos
1. **Afinar staples do Daniel:** ajustar sinônimos/escolhas-padrão e pesos por
   unidade em `js/measures.js` conforme o uso real; cadastrar os alimentos dele
   (whey, cortes específicos) na aba Alimentos.
2. **Qualidade de vida (opcional):** copiar dia anterior/refeições favoritas;
   ordenar itens; metas por refeição.

## Como retomar rápido
- Rodar local: `node data/devserver.mjs` → `http://localhost:8123` (ou abrir
  `index.html` direto).
- Regerar base após trocar CSVs: `node data/build-db.mjs`.
- Teste rápido do parser (Node): carregar `js/db.js`+`measures.js`+`parser.js`
  com `global.window={}` e chamar `Parser.parseLine("120g arroz")`.

## Fase 7 (precisão) — PUBLICADA em 2026-07-20
- **TDEE adaptativo:** `Nutrition.adaptiveTDEE(dailyKcal, weights)` — janela
  28d, mín. 10 dias válidos (>500 kcal) e 2 pesagens com 10+ dias de
  intervalo; regressão linear no peso; TDEE real = média ingerida −
  7700×slope. Toggle `goal.useAdaptive` na aba Perfil (cartão "TDEE real");
  `effectiveGoal()` no app.js decide manual > adaptativo > Mifflin e é usado
  por dashboard/histórico/perfil. Valores implausíveis (suspeito) não são
  usados na meta.
- **Guarda cru×cozido:** dispara só quando o alimento casado é CRU, o usuário
  NÃO digitou "cru" e a classe é perigosa (RAW_GUARD_RE: grãos, carnes,
  peixes, ovos, raízes — fruta/salada crua não alarma). Badge + select
  "pesei pronto → trocar para…" com irmãos cozidos (cookedSiblings). Receitas
  não têm guarda (ingrediente cru é o correto lá).
- **Peso:** média móvel de 7 dias no gráfico (linha de tendência; extraSeries
  em charts.js), pesagens viram pontos claros.
- Testado: sintético 14d/2000kcal/-0,7kg → TDEE 2414 ✓; toggle muda meta
  2236→1781; arroz silenciosamente cru (537 kcal) capturado e trocado (192).

## 2026-07-21 — Comuns do dia a dia (pedido "Foodvisor")
- Daniel pediu p/ copiar dados do Foodvisor (app comercial) — RECUSADO pelas
  regras de honestidade dele mesmo (banco proprietário de concorrente; e é
  agregador das mesmas fontes primárias que já usamos). Entregue o
  equivalente legítimo: auditoria de 34 alimentos comuns contra nossa base
  (33 já existiam!) + ~25 sinônimos-padrão verificados (hamburguer→417
  grelhado, esfiha→C0439A, sushi, lasanha, picanha, misto quente, pastel…).
- Bug corrigido no parser: fallback parcial devolvia "ambíguo" antes de
  honrar sinônimo cadastrado; agora sinônimo vence (matched).
- Ambiguidades deliberadas mantidas: cuscuz (paulista×nordestino), açaí
  (puro×com xarope), salgadinho, milanesa — diferença grande demais p/
  decidir em silêncio.

## 2026-07-28 — Foto de tabela nutricional (cadastro de alimento)
- Botão "📷 Fotografar tabela nutricional" no formulário de alimento
  individual: foto do rótulo → proxy modo "rotulo" (SYSTEM_ROTULO +
  SCHEMA_ROTULO, campos anuláveis, nunca inventa) → applyLabelToForm
  converte porção→100g quando o rótulo não tem coluna 100g (RDC 429) e
  preenche os campos editáveis, com aviso p/ conferir com a embalagem.
- Foto de rótulo comprime a 1600px (letra miúda); refeição segue 1024px.
- Conta no mesmo limite diário de fotos. Worker: 15 testes passando.

## 2026-07-28 — Backup automático na nuvem (pós-incidente)
- INCIDENTE: Daniel perdeu dados ao remover/re-adicionar o app da tela de
  início (a atualização do ícone tornou o app standalone via manifest — no
  iOS isso move o localStorage p/ um cofre próprio do app, apagado junto).
  Instrução minha estava errada ("dados não são apagados"). Possível
  recuperação: dados antigos podem seguir no cofre do SAFARI (abrir o site
  no navegador → Exportar → Importar no app).
- SOLUÇÃO: backup automático opt-in (aba Dados). Estado cifrado NO APARELHO
  (AES-GCM 256, chave PBKDF2-SHA256 150k da senha do app) → POST /backup no
  Worker (KV, chave = SHA-256 da senha → cofre por pessoa no multiusuário).
  Restauração: botão "Restaurar da nuvem…" (exige proxy+senha; confirma
  substituição). Debounce 4s no gancho do renderHist. lastBackupAt na UI.
  Senha trocada = backup antigo indecifrável (mensagem clara).
- 20 testes do Worker passando; ciclo desastre→restauração testado no
  navegador com mock.

## 2026-07-28 — Base COMUM de alimentos (multiusuário)
- Alimento cadastrado com "🌐 Compartilhar" (checkbox padrão ON no form de
  alimento novo, se proxy configurado) vai p/ o Worker (GET/POST/DELETE
  /foods, KV chave foods-comum, máx 500, dedupe por nome, atribuição
  anônima 6-hex da senha) e aparece p/ TODOS os usuários com etiqueta
  "comum" na busca. Sync no init com cache local (sharedFoods no estado —
  funciona offline). Custom local de mesmo nome vence o comum (dedupe).
- CORS ganhou GET/DELETE nos Allow-Methods. 27 testes do Worker passando.
- Fluxo 2 usuários testado no navegador (criador compartilha → aparelho
  zerado sincroniza, busca e registra).

## 2026-08-03 — Refeições, avisos discretos e rótulo reconhecido
- **Refeições:** item ganha campo `meal` (cafe/almoco/lanche/jantar);
  seletor na caixa de registro (padrão por horário: 4-11 café, 11-15
  almoço, 15-19 lanche, resto jantar), lista agrupada com subtotal por
  refeição e seletor em cada item p/ mover. Itens antigos sem meal caem
  no grupo "Outros".
- **Sem alertas na foto:** helper toast() (rodapé, some sozinho) substitui
  alert() em TODOS os fluxos de foto/rótulo/import/backup. confirm()
  mantido só onde a ação é destrutiva.
- **Foto do rótulo linkada:** a foto usada p/ ler a tabela nutricional é
  guardada como miniatura (320px q0.6) em customFood.labelPhoto; o app
  envia a lista desses produtos ao proxy (campo `produtos`) e o modelo
  devolve `produto` quando reconhece a embalagem — o item entra já casado
  com o alimento cadastrado (valores conferidos pelo usuário). Worker
  valida que o produto devolvido está na lista enviada.
