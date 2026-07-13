# PONTO DE RETOMADA — Diário Alimentar (kcal/macros)

_Atualizado em 2026-07-13._

## O que é
App pessoal de diário alimentar para perda de peso. Registro por **texto em
linguagem natural** (o Daniel dita por voz no nível do SO; chega como texto),
cálculo de **kcal e macros** por item/dia, **gráficos** (meta do dia + macros +
histórico) e **histórico persistente**. Local-first, estático, sem IA e sem
servidor na Fase 1.

## Estado atual: **Fase 1 (MVP) COMPLETA e testada**
Tudo funcionando e verificado ponta a ponta (parser em Node + app dirigido no
navegador):
- ✅ Setup de perfil → TMB, TDEE e meta (Mifflin-St Jeor) + guardrail de piso.
- ✅ Registro do dia: texto → parser → itens com kcal/macros, gramas editáveis.
- ✅ Dashboard: anel kcal vs meta + barras de macro (consumido vs alvo).
- ✅ Histórico: linha de kcal/dia (com linha de meta) + linha de peso + tabela.
- ✅ Export/import JSON; reset; **alimentos do usuário** (base extensível).
- ✅ Base **TACO 4ª ed.** real embutida (597 alimentos), fonte citada.

## Decisões de arquitetura (importantes)
- **Zero IA / zero backend / zero chave** na Fase 1. Parser = regex +
  normalização + busca com pontuação. (Regra do dono, respeitada.)
- **Scripts clássicos + base embutida em `js/db.js`** (não `fetch` de JSON) para
  o app funcionar **abrindo o arquivo direto** (`file://`) e no GitHub Pages.
- **Gráficos em SVG puro** (sem Chart.js/CDN): funciona offline, nada de URL
  externa para verificar.
- **Persistência em localStorage** (volume pequeno) + export/import JSON.
- **Base TACO:** CSVs de `raulfdm/taco-api` (MIT) → `data/build-db.mjs` gera
  `js/db.js`. Valores **não** foram inventados; conferidos por amostragem.

## Regras de honestidade aplicadas
- Nada de valor nutricional chutado. 6 alimentos sem kcal na fonte ficam
  **sinalizados** e fora do total (não preenchidos). Medidas caseiras e pesos por
  unidade são **estimativas editáveis**, sempre marcadas. Não encontrado/ambíguo
  não entra no total até o usuário resolver.

## Arquivos
Ver seção "Estrutura dos arquivos" no `README.md`. Núcleo: `index.html`,
`app.css`, `js/{db,measures,parser,nutrition,storage,charts,app}.js`.
Tabelas editáveis pelo usuário-dono: **`js/measures.js`** (medidas, pesos/unidade,
sinônimos/escolhas-padrão).

## Limitações conhecidas (ver README)
- Medidas caseiras genéricas (densidade ~1) — aproximadas.
- TACO não tem tudo cozido (ex.: macarrão só cru).
- 6 itens da TACO sem valor calórico na digitalização usada.

## Publicado
- **Site (usar no celular):** https://azimoov.github.io/diario-alimentar/
- **Repositório:** https://github.com/Azimoov/diario-alimentar (conta **Azimoov**)
- Deploy = GitHub Pages, branch `main`, raiz. Qualquer `git push` na main
  republica sozinho em ~1 min.
- `gh` CLI portátil em `%LOCALAPPDATA%\gh-cli\bin\gh.exe` (logado como Azimoov).

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
  schema, modelo padrão `claude-opus-4-8`, CORS + X-App-Token + rate-limit).
  `npm test` roda 10 testes contra API simulada — todos passando.
- **Testado ponta a ponta** com mock (`data/mock-proxy.mjs`) no navegador.
- **FALTA (ações do Daniel):** (1) conta API Anthropic + billing + chave +
  limite de gasto; (2) conta Cloudflare. Depois: `wrangler login` (ele
  autoriza), `wrangler deploy`, e ELE cola os segredos via
  `npx wrangler secret put ANTHROPIC_API_KEY` / `APP_TOKEN` (a chave nunca
  passa pelo assistente). Por fim configurar URL+senha na aba Dados.
  Passo a passo completo em `docs/FASE-2-FOTO.md`.

## Próximos passos sugeridos
1. **Deploy da Fase 2** (acima) quando o Daniel criar as contas.
2. **Afinar staples do Daniel:** ajustar sinônimos/escolhas-padrão e pesos por
   unidade em `js/measures.js` conforme o uso real; cadastrar os alimentos dele
   (whey, cortes específicos) em Dados → Meus alimentos.
3. **Qualidade de vida (opcional):** copiar dia anterior/refeições favoritas;
   ordenar itens; metas por refeição.

## Como retomar rápido
- Rodar local: `node data/devserver.mjs` → `http://localhost:8123` (ou abrir
  `index.html` direto).
- Regerar base após trocar CSVs: `node data/build-db.mjs`.
- Teste rápido do parser (Node): carregar `js/db.js`+`measures.js`+`parser.js`
  com `global.window={}` e chamar `Parser.parseLine("120g arroz")`.
