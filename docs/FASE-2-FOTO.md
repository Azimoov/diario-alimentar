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
- `node data/mock-proxy.mjs` + configurar `http://localhost:8124/analyze` e
  senha `senha-local` no app local — testa o fluxo completo do botão 📷 sem
  gastar API.
