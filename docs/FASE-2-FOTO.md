# Fase 2 — Registro por foto (STUB, não implementado)

> Este documento marca **onde e como** a Fase 2 entraria. Nada aqui está
> implementado. A regra inegociável: **a chave de API nunca fica no cliente.**

## Objetivo
A partir de uma foto do prato, estimar (a) quais alimentos e (b) as gramas de
cada um, gerando itens que caem no mesmo fluxo da Fase 1 (lista editável +
dashboard). O usuário sempre confirma/corrige antes de salvar.

## Arquitetura segura (obrigatória)
```
[App estático no navegador]
   |  1. usuário tira/seleciona foto
   |  2. POST multipart para o SEU proxy (não para a API do modelo)
   v
[Proxy serverless — ex.: Cloudflare Workers / Vercel / Netlify Functions]
   |  - guarda a CHAVE como variável de ambiente (secret), nunca no front
   |  - valida tamanho/tipo da imagem, aplica rate limit
   |  3. chama o modelo de visão com a chave
   v
[API de visão]  ->  devolve alimentos + gramas estimadas
   ^
   |  4. proxy repassa só o JSON já limpo de volta ao app
[App]  5. cria itens (foodId + grams) reutilizando o parser/casamento da Fase 1
```

Por que proxy: qualquer chave embutida em JS/HTML é pública (basta abrir o
DevTools). O proxy isola o segredo, controla custo (rate limit) e permite trocar
de provedor sem mexer no app.

## Ponto de integração no código (Fase 1)
- **Entrada:** hoje os itens nascem em `App.addEntries()` (`js/app.js`), que chama
  `Parser.parseText()`. A Fase 2 acrescentaria um botão "📷 Foto" que, ao receber
  a resposta do proxy, cria itens no mesmo formato `{ raw, foodId, grams, conf }`
  e os empurra para `currentDay().items` — reaproveitando `Parser.matchFood()`
  para casar os nomes retornados com a base TACO/alimentos do usuário.
- **Config:** a URL do proxy ficaria numa config do app (ex.: campo em "Dados"),
  **nunca** a chave.

## O que falta decidir antes de implementar
- Provedor do modelo de visão e do proxy.
- Formato do JSON de resposta do proxy (sugestão: `[{ nome, gramas, confianca }]`).
- Estratégia de confirmação na UI (toda estimativa entra como "estimativa"
  amarela, igual às medidas caseiras).

## Regras de honestidade que continuam valendo
- Estimativa de foto é aproximada → marcar como estimativa e deixar editável.
- Não inventar valores: o cálculo nutricional continua vindo da base
  (TACO/alimentos do usuário), a foto só sugere **qual alimento e quantas gramas**.
