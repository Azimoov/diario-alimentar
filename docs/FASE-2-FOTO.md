# Fase 2 — Registro por foto (IMPLEMENTADO)

O app tem um botão **📷 Foto** na aba Hoje: você fotografa o prato, um modelo
de visão (Claude) identifica os alimentos e estima as gramas, e cada item entra
no diário como **estimativa** (amarela, editável) casada com a base TACO.
A nutrição continua vindo da TACO/seus alimentos — a foto só sugere
**qual alimento e quantas gramas**.

## Arquitetura (chave protegida — inegociável)

```
[App no navegador/celular]
   1. comprime a foto no aparelho (máx 1024 px, JPEG)
   2. POST {image, mediaType} para o SEU proxy, com a senha do app (X-App-Token)
   v
[Proxy: Cloudflare Worker — pasta fase2-proxy/]
   - guarda ANTHROPIC_API_KEY como SEGREDO (nunca no front, nunca no git)
   - valida origem (CORS), senha do app, tamanho/tipo da imagem, rate-limit
   3. chama a API da Anthropic (visão + saída estruturada JSON)
   v
[API Claude]  ->  {itens: [{nome, gramas, confianca}], observacao}
   4. o proxy valida o formato e repassa só o JSON limpo
[App]  5. casa cada nome com a TACO e insere como estimativa a confirmar
```

Por que proxy: qualquer chave embutida em JS/HTML é pública (basta abrir o
DevTools). O proxy isola o segredo, controla custo e permite trocar de modelo
sem mexer no app.

## Como publicar o proxy (uma vez)

Pré-requisitos (ações do dono da conta):
1. **Conta na API da Anthropic** (console.anthropic.com) com crédito/billing e
   uma **API key**. Recomendado: definir um limite de gasto mensal no console.
2. **Conta na Cloudflare** (grátis — dash.cloudflare.com).

Deploy (na pasta `fase2-proxy/`):
```
npm install
npx wrangler login          # abre o navegador p/ autorizar (conta Cloudflare)
npx wrangler deploy         # publica; anote a URL *.workers.dev
npx wrangler secret put ANTHROPIC_API_KEY   # cole a chave quando pedir
npx wrangler secret put APP_TOKEN           # invente uma senha p/ o app
```

Depois, no app (aba **Dados → Registro por foto**): informe a URL do Worker e
a mesma senha (APP_TOKEN). Pronto — o botão 📷 passa a funcionar.

## Configuração do Worker

- `wrangler.jsonc` → `ALLOWED_ORIGINS`: origens autorizadas (já inclui o
  GitHub Pages do app e localhost). `CLAUDE_MODEL`: modelo de visão
  (padrão `claude-opus-4-8`; `claude-sonnet-5` é opção mais barata).
- Segredos (`wrangler secret put`): `ANTHROPIC_API_KEY` e `APP_TOKEN`.

## Custo (ordem de grandeza)

Foto de 1024 px ≈ 1.100–1.600 tokens de entrada + prompt + resposta curta.
Com `claude-opus-4-8` (US$5/M entrada, US$25/M saída): **~US$0,02 por foto**
[estimativa; varia com a foto]. Poucas fotos/dia → centavos por mês.
Defina um limite de gasto no console da Anthropic por segurança.

## Proteções implementadas no proxy

- CORS restrito às origens do app (`ALLOWED_ORIGINS`).
- Senha compartilhada (`X-App-Token` vs segredo `APP_TOKEN`).
- Limite de tamanho (~5 MB) e de tipos de imagem.
- Rate-limit simples por IP (15/min, best-effort em memória).
- Validação defensiva do JSON devolvido pelo modelo (saída estruturada
  `output_config.format` garante o schema; o proxy revalida mesmo assim).
- Erros da API tratados por classe (`RateLimitError`, `AuthenticationError`…)
  e recusas (`stop_reason: "refusal"`) devolvidas como erro claro.

## Limitação conhecida e honestidade

- Estimar gramas por foto é **impreciso por natureza**. Todo item de foto entra
  como estimativa com a confiança declarada (alta/média/baixa) e exige
  confirmação quando o casamento com a TACO não é exato. Pesar continua sendo
  o método de referência.
- A senha do app (APP_TOKEN) protege contra uso casual do seu proxy por
  terceiros, mas quem tiver acesso ao seu aparelho/localStorage a vê. O
  limite de gasto no console da Anthropic é a proteção final de custo.

## Testes locais (sem custo)

- `cd fase2-proxy && npm test` — testa o Worker contra uma API simulada
  (CORS, token, validações, caminho feliz).
- `node data/mock-proxy.mjs` + configurar `http://localhost:8124` (a RAIZ,
  sem caminho — o app monta `/foods`, `/backup` e `/analyze` sozinho) e
  senha `senha-local` no app local — testa o fluxo completo do botão 📷 e
  do botão 🔎 Analisar sem gastar API.

## Contas e login (`/auth/*`, `/account/data`)

Adicionado depois da Fase 2. Resolve o problema real de perder tudo ao
remover o app do iPhone (ou trocar de aparelho) e não ter como recuperar.

**Rotas** (as de `/auth/` são as únicas públicas; o resto exige sessão ou a
senha legada do app):

| Rota | O que faz |
|---|---|
| `POST /auth/signup` `{email, authKey, invite}` | cria conta; exige `INVITE_CODE` |
| `POST /auth/login` `{email, authKey}` | devolve `{session}` |
| `GET /auth/me` | valida a sessão guardada no aparelho |
| `POST /auth/forgot` `{email}` | manda o link por e-mail (resposta sempre igual, sem enumerar cadastro) |
| `POST /auth/reset` `{token, authKey}` | troca a senha; link de uso único, 30 min |
| `POST /auth/password` `{authKeyAtual, authKeyNova}` | troca a senha estando logado |
| `POST /auth/logout` | invalida a sessão |
| `GET/PUT /account/data` | lê/grava o estado do app (cifrado em repouso) |
| `GET/PUT/DELETE /account/apikey` | chave da Anthropic **daquela conta** (BYOK) |

**BYOK — cada conta paga a própria IA.** `PUT /account/apikey` valida o
formato, testa a chave contra `GET /v1/models` (barato) e só então guarda,
cifrada com a chave de dados do usuário em `apikey:<uid>`. As rotas de foto e
`/analyze` usam a chave de quem chamou; sem ela devolvem **402
`no_api_key`** com a orientação de onde cadastrar. O `GET` devolve só
`{configured, hint}` — os 4 últimos caracteres, nunca a chave. Os contadores
diários viraram `fotos:<uid>:<dia>` e `analises:<uid>:<dia>`. O caminho
legado (`X-App-Token`, sem conta) segue usando a `ANTHROPIC_API_KEY` do
Worker.

**A senha nunca chega ao servidor.** O navegador faz
`PBKDF2(senha, sal=SHA-256("highlander-auth:"+email), 250k, SHA-256)` e envia
só o `authKey`; o Worker guarda `HMAC(pepper, authKey)`, com o pepper
derivado de `DATA_KEY`. Duas vantagens: um dump do KV não dá login a
ninguém, e o custo de CPU por requisição fica desprezível — **PBKDF2 no
servidor estouraria o limite de 10 ms de CPU do plano grátis do Workers**.

**Dados cifrados em repouso, mas recuperáveis.** `/account/data` guarda o
estado com AES-GCM, chave = `HMAC(DATA_KEY, "data-key:"+uid)`. Como a chave
é do servidor e não da senha, redefinir a senha **não** perde os dados — é
exatamente o trade-off aceito (veja a seção de conta no README).

**Chaves no KV:** `acct:<uid>`, `sess:<sha256(token)>` (TTL 90 dias),
`reset:<sha256(token)>` (TTL 30 min), `data:<uid>`, onde `uid` = SHA-256 do
e-mail normalizado. O `backup:<sha256(senha)>` do modelo antigo fica
**intocado** — backups anteriores continuam restauráveis com a senha do app.

**Proteções:** convite obrigatório no cadastro; rate-limit por IP (5/min
cadastro, 10/min login, 4/min recuperação); mensagem de erro genérica no
login; comparação de segredos em tempo constante; `/account/data` limitado a
~8 MB.

**Testar sem deploy:** `npm run dev:local` sobe o Worker REAL em Node
(`dev-server.mjs`) com KV em memória, API simulada e e-mails capturados —
o link de recuperação aparece no terminal e em `GET /__emails`. No app,
aponte Dados → servidor para `http://localhost:8124` e use o convite
`convite-local`.

## Laudos por foto e PDF (`mode: "exame_lab" | "exame_img"`)

Mesma rota da foto (`POST /`), com dois modos novos e aceitando **PDF**:

- `mediaType: "application/pdf"` faz o anexo virar bloco `document` (a API lê
  PDF nativamente — o app **não** carrega biblioteca de PDF no navegador).
  Limite ~9 MB; foto continua em ~5 MB. PDF só é aceito nesses dois modos.
- `exame_lab` devolve `{exameLab: {data, laboratorio, analitos[], observacao}}`,
  cada analito com `{nome, valor, unidade, refMin, refMax, obs}`. `max_tokens`
  sobe para 8192 porque um laudo rende dezenas de itens.
- `exame_img` devolve `{exameImg: {data, exame, local, conclusao, observacao}}`.

Os prompts são de **transcrição, não interpretação**: proíbem inventar faixa
de referência (se o laudo não imprime, vem `null`), proíbem diagnosticar ou
classificar como normal/alterado, mandam copiar qualitativos como estão
("não reagente", "<0,10") e **ignorar dados pessoais** (nome, CPF, convênio).
Item ilegível fica de fora e é reportado em `observacao`.

No app, nada é salvo direto: o laboratorial abre uma tela de conferência com
cada analito marcável/editável, e o de imagem preenche o formulário para
revisão. O arquivo enviado não é guardado.

## Análise inteligente (`POST /analyze`)

Usada pelo botão **🔎 Analisar meus dados** (áreas Exames e Métricas). O app
monta um resumo numérico local — médias da dieta, peso/composição, exames
anotados (com as faixas de referência do usuário), métricas do relógio e
lembretes vencidos — e envia `{dados: {…}}`; o Worker chama a IA com um
prompt de honestidade (sem diagnóstico, sem inventar faixas de referência,
texto puro) e devolve `{analise, modelo}`.

- Mesmas proteções da foto: senha, CORS, rate-limit (6/min por IP).
- Limite diário próprio: `ANALYSIS_DAILY_LIMIT` (padrão 20/dia do grupo,
  contado no KV em `analises:AAAA-MM-DD`).
- Custo bem menor que foto (só texto, ~2–8k tokens por análise).
- Payload limitado a ~200 KB.
