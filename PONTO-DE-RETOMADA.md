# PONTO DE RETOMADA — Diário Alimentar (kcal/macros)

_Atualizado em 2026-07-12._

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

## Próximos passos sugeridos
1. **Afinar staples do Daniel:** ajustar sinônimos/escolhas-padrão e pesos por
   unidade em `js/measures.js` conforme o uso real; cadastrar os alimentos dele
   (whey, cortes específicos) em Dados → Meus alimentos.
2. **Qualidade de vida (opcional):** copiar dia anterior/refeições favoritas;
   ordenar itens; metas por refeição.
3. **Fase 2 (foto):** só com **proxy serverless** guardando a chave. Plano em
   `docs/FASE-2-FOTO.md`. Não começar sem definir provedor + formato do proxy.

## Como retomar rápido
- Rodar local: `node data/devserver.mjs` → `http://localhost:8123` (ou abrir
  `index.html` direto).
- Regerar base após trocar CSVs: `node data/build-db.mjs`.
- Teste rápido do parser (Node): carregar `js/db.js`+`measures.js`+`parser.js`
  com `global.window={}` e chamar `Parser.parseLine("120g arroz")`.
