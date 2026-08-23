# PONTO DE RETOMADA — Highlander

_Atualizado em 2026-08-21. Quem chega agora lê só até "O que falta"; o resto é
histórico e memória das decisões._

## O que é

Hub pessoal de saúde, estático (HTML/CSS/JS puros, sem build), publicado no
GitHub Pages e usável como app no iPhone. **Seis áreas** na barra de cima:

| Área | O que faz |
|---|---|
| 🍽️ Diário | registro por texto em linguagem natural → kcal e macros, gráficos, histórico. Base de 6.273 alimentos (TACO + TBCA + USDA) embutida em `js/db.js` |
| 🧪 Exames | laboratoriais (analito por linha, com a faixa do SEU laudo) e de imagem; lembretes de repetição; leitura de laudo por **foto ou PDF** |
| ❤️ Métricas | peso e composição corporal; import do export do app Saúde do iPhone (passos, energia, sono, FC, VO₂máx) e saldo energético |
| 💊 Remédios | o que a pessoa toma e o que já tomou; encerrar guarda como histórico, não apaga |
| 🏋️ Treino | coach semanal (Huberman/Galpin/Nippard): monta a semana com força, potência, equilíbrio, mobilidade, Z2, Z5 e pico diário de FC; a pessoa registra carga/minutos/bpm, ele dá nota por capacidade e evolui o plano |
| 💬 IA | conversa com memória sobre os próprios dados + histórico de análises |

A conversa e a análise consultam uma **base de referência de longevidade**
(Medicina 3.0 / Attia) em `fase2-proxy/src/conhecimento.js`, com etiqueta de
evidência item a item e procedência em `docs/REFERENCIAS.md`. Há ainda um
envio opcional de contexto para o **Open Brain**, desligado por padrão.

## Estado atual (21/08/2026)

- **Tudo o que foi pedido está implementado, publicado e testado pelo Daniel
  de verdade** (não só em ambiente local). Última rodada: acrescentado **Jeff
  Nippard** (canal do YouTube, só os episódios de treino da série Fundamentals
  — dieta ficou de fora por pedido dele) como terceira fonte do coach, junto
  de Huberman/Galpin. Entrou em `CONHECIMENTO_TREINO`: frequência 2x/semana
  por grupo muscular, RIR como régua de esforço (2–3 RIR ≈ ir à falha, com
  menos fadiga) e seleção de exercício pela relação estímulo/fadiga (SFR —
  conceito de Mike Israetel, a base credita a origem certa). Procedência em
  `docs/REFERENCIAS.md` §19.
- **Deploy do Worker em produção, feito pelo Daniel** (`npx wrangler deploy` +
  os segredos, incluindo `OPENBRAIN_KEY`). Confirmado funcionando: login,
  coach de treino (montou plano de verdade) e envio ao Open Brain, todos
  testados por ele no app publicado, não só nos servidores locais de teste.
  **Não há mais nenhum passo pendente de configuração.**
- **Suíte: 16 conjuntos, todos passando**, e rodando duas vezes seguidas sem
  sujar estado. Um comando: `node test/todos.mjs` (ele mesmo sobe e derruba os
  dois servidores locais).
- **Site:** <https://azimoov.github.io/diario-alimentar/> — republica sozinho
  a cada `git push` na `main` (~1 min).
- **Proxy:** <https://diario-alimentar-proxy.azimoov.workers.dev> (Cloudflare
  Worker, pasta `fase2-proxy/`) — em produção, com as rotas de conta e o
  Open Brain ativos.

## O que falta

Nada bloqueando. Duas notas de manutenção, sem pressa:

- **`DATA_KEY` é insubstituível**: é ela que cifra os dados das contas em
  repouso. Perdida ou trocada, as contas continuam existindo e os dados
  guardados na nuvem viram lixo ilegível. Confirme que está guardada fora do
  computador (o Daniel já foi avisado ao cadastrar).
- `MAIL_TO_OVERRIDE` está apontado para `serruyadaniel@gmail.com` porque o
  Resend, sem domínio verificado, só entrega para o dono da conta. **Efeito
  colateral aceito e explicado:** todo e-mail de recuperação, de qualquer
  usuário, cai nessa caixa — e quem recebe o link entra naquela conta. Para
  tirar isso, verifique um domínio no Resend e remova a variável.
- Reparo de processo, não de produto: o computador do Daniel não tinha
  `wrangler login` feito e a pasta local do projeto estava remontada de
  pedaços (parte de outro PC, parte do notebook, parte do GitHub) — o que
  causou uma sessão inteira de diagnóstico por erros de pasta/autenticação em
  vez do problema real. Resolvido com um `git clone` limpo numa pasta nova
  (`diario-alimentar-novo`) e `wrangler login`. Se for mexer de novo no
  Worker a partir do computador dele, confirme que é essa pasta clonada
  (com `fase2-proxy/wrangler.jsonc` dentro) — não uma pasta antiga misturada.

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
js/app.js                     interface e orquestração das 6 áreas
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

## 2026-08-21 (5) — Refeed, pausa da dieta e adaptação metabólica

O Daniel perguntou se as fontes tinham algo sobre refeed. **Não tinham nada** —
nem refeed, nem diet break, nem adaptação metabólica, nem leptina. E o buraco
batia exatamente no aviso de platô entregue horas antes, que só conhecia DUAS
causas (meta alta / não cumprir a meta) e ignorava a terceira: o gasto cai em
resposta ao déficit prolongado, e depois de meses cortar mais rende cada vez
menos.

Base ganhou a seção "Platô, adaptação metabólica e pausas da dieta", com a
honestidade de sempre sobre o peso de cada evidência:
- diet break tem o MATADOR (Byrne 2018, PMID 28925405) a favor — mas é UM
  ensaio, em homens com obesidade, e a base diz isso;
- refeed é mais fraco: o ensaio mais citado (Campbell 2020) foi REANALISADO e
  só a massa livre de gordura "seca" sobreviveu à estatística — nem a total,
  nem o gasto de repouso. Fica [ESCOLA], não comprovado;
- adaptação metabólica existe (~90-180 kcal/dia), mas o número de ~500 do
  "Biggest Loser" que circula como regra veio de perda extrema e está marcado
  como [SECUNDÁRIO quanto a generalizar].

Fontes em docs/REFERENCIAS.md §20-22. **Nippard ficou deliberadamente de fora
aqui**: o pedido dele foi que só os vídeos de TREINO daquele canal entrassem, e
refeed é dieta — então a seção veio de literatura primária.

No app, `analisarPlato()` ganhou `semanasEmDeficit()` e o cartão passou a
oferecer a PAUSA quando a dieta já passa de ~12 semanas, com botão que silencia
o aviso por 2 semanas. Dieta curta NÃO recebe esse conselho (seria conselho
errado) — e há teste para os dois lados. Assets em ?v=11; 16 suítes.

## 2026-08-21 (4) — No piso, quem age é o treino + novidades por versão

**"Coma menos" tem fim; gasto não.** O Daniel foi explícito: ao chegar perto do
limite de calorias, NÃO quer ouvir "procure um nutricionista" — quer que o
treino entre em ação e aumente o cardio. Faz sentido e foi implementado assim:
`analisarPlato()` passou a calcular `faltaPorTreino` (o pedaço do déficit que
não cabe no prato depois do piso), o cartão troca o texto de encaminhamento por
um botão que leva ao treino, e `buildTreinoPayload` manda `gastoExtraAlvo` ao
Worker. A base ganhou a seção "Fechar déficit com treino": o carro-chefe é
ZONA 2 (soma gasto com custo baixo de recuperação — encher de Z5 aumentaria
fadiga sem somar tanto), subir no máximo ~10-15% de minutos por semana, e
espalhar NEAT. Duas travas que continuam: o PISO em si não se mexe (nunca
sugerir comer abaixo do basal), e o coach é obrigado a ser honesto sobre
tamanho — se fechar o buraco exigir mais de 60-90 min de cardio por dia, dizer
que não cabe numa rotina normal e que o resto sai de um ritmo mais lento.
Prometer o impossível faz desistir de tudo.

**Novidades por versão.** `js/changelog.js` (novo) lista o que mudou em cada
versão em português de gente. Aparece em Diário → Dados → ✨ Novidades (lista
completa) e num popup que abre UMA vez por atualização (só a versão nova).
Conta recém-criada não recebe popup — não perdeu atualização nenhuma.

Armadilha que o teste pegou: a heurística de "conta nova" olhava
`Object.keys(S.days).length`, mas a própria aba Hoje CRIA um dia vazio ao
abrir — então toda conta nova parecia antiga e levava popup. Passou a contar
dia com ITENS.

Guarda novo que vale preservar: `test/novidades.mjs` falha se a versão do topo
do changelog divergir do `?v=N` do index.html. São dois números que precisam
andar juntos e que ninguém lembraria de sincronizar à mão. Assets em ?v=10;
16 suítes.

## 2026-08-21 (3) — Rotina no perfil de treino + o app finalmente AVISA do platô

Dois pedidos do Daniel, e o segundo era uma falha de verdade.

**Rotina no perfil de treino.** "Ajustar perfil" ganhou dois campos: um
texto livre "Como é a sua rotina?" (horário de trabalho, dias corridos,
quando dá para treinar, o que atrapalha) e sete caixinhas de **em que dias
tem academia**. As caixinhas são o que resolve o problema prático: força e
hipertrofia com equipamento vão SÓ nesses dias, e nos outros o coach monta o
que dá para fazer sem nada. SYSTEM_TREINO manda ler os dois campos, obedecer
(não botar sessão longa em dia que a pessoa disse ser corrido, usar o dia
livre que ela apontou para o treino pesado) e dizer em uma linha quando a
rotina determinou uma escolha.

**O aviso de peso parado — o app tinha o dado e nunca falava.** Reclamação
literal do Daniel: "meu peso tem se mantido e em momento algum o app sugeriu
reduzir as calorias como deveria". Ele estava certo. O `adaptiveTDEE` já
calculava o gasto real a partir dos registros dele desde sempre, mas o número
ficava parado num cartão da aba Perfil, esperando ele ir lá procurar E marcar
uma caixinha de opt-in. Dado que existe e não vira ação é o mesmo que não
existir.

Agora `analisarPlato()` roda e o cartão aparece na aba **Hoje**. O cuidado que
vale preservar: ele DISTINGUE AS DUAS CAUSAS, que pedem conselhos opostos —
cumprindo a meta e sem emagrecer = a meta está alta (oferece a corrigida pelo
gasto medido, em um toque); comendo acima da própria meta = dizer isso, porque
mandar cortar mais quem já não cumpre o que tem seria trocar o problema de
lugar. Nunca sugere abaixo do basal nem do piso (1500/1200) — e quando trava
no piso, diz que ali o assunto é nutricionista e que o caminho costuma ser
gastar mais, não comer menos.

Duas armadilhas resolvidas no caminho: (1) ao ACEITAR a nova meta, o aviso
voltaria no segundo seguinte com causa "aderência", porque a média dos últimos
28 dias ainda é a de antes — então aceitar também adia 14 dias; (2) trocar de
aba não redesenha nada (`applyNav` só liga/desliga classes), o que quase fez o
teste passar por engano. `renderAll` virou exposto para os testes.

Suíte nova `test/plato.mjs` (15 suítes no total) cobre: as duas causas, peso
subindo, quem está no ritmo (silêncio), o piso de segurança, meta na mão
(não intervir), quem não quer emagrecer, o cartão aparecendo sozinho, o botão
baixando a meta de verdade, e o adiar que volta depois de 14 dias. Assets em
?v=9.

## 2026-08-21 (2) — Pico diário de FC + a ligação nutrição/exames -> treino

Duas lacunas que o Daniel apontou perguntando "já estão todos esses
alinhados?", e não estavam.

**1. Os dados chegavam, mas o coach não sabia o que fazer com eles.** O
payload já levava dieta, exames, remédios e métricas do relógio, e a única
instrução era "use tudo como contexto" — genérico demais para virar decisão.
Agora `CONHECIMENTO_TREINO` tem duas seções com as ligações CONCRETAS:
proteína < ~1,6 g/kg limita hipertrofia (dizer, sem virar nutricionista),
déficit agressivo -> priorizar força, ferritina/hemoglobina abaixo da faixa DO
LAUDO limitam fôlego/Z5, glicemia alterada reforça a dose de Z2, FC de repouso
subindo ou sono curto antecipam o deload, VO2máx de relógio é tendência e não
nota. `SYSTEM_TREINO` manda usar e DIZER a conexão em uma linha. As regras de
honestidade continuam valendo: só a faixa do laudo da própria pessoa, sem
diagnosticar, sem prescrever suplemento.

**2. Pico diário de FC** (pedido explícito dele): novo tipo de sessão
`picoFc` e novo registro `fc` (bpm de pico), do schema do Worker até o campo
na tela. NÃO é Z5 diária — a sessão estruturada continua 1-2x/semana; o pico é
20-60 s, 1-3 tiros, no FIM do treino em dia de força/potência, e em dia com
sprints o próprio trabalho de potência JÁ é o pico (não soma). A tensão está
escrita na base: pico todo dia compete com recuperação, então se FC de repouso
subir, sono cair ou força travar, o coach reduz para dias alternados e explica
— preferência do dono não sobrepõe sinal de excesso de treino. Betabloqueador
troca o alvo de bpm por RPE 9-10; cardiopatia/hipertensão pedem liberação
médica antes.

Cuidado de implementação que vale lembrar: `validarSemana` tem whitelist de
tipos e de registro — tipo novo que não entre nela vira "forca"/"carga"
silenciosamente e o pico sumiria sem erro nenhum. O smoke test agora prova que
`picoFc` e `registro: "fc"` ATRAVESSAM a validação. Assets em ?v=8.

## 2026-08-21 — Deploy em produção pelo Daniel + Jeff Nippard como 3ª fonte do coach

Duas coisas nesta rodada, uma de conteúdo e uma de processo.

**Conteúdo:** a pedido do Daniel, Jeff Nippard entrou como referência do
coach — só os episódios de TREINO da série Fundamentals no canal dele (ele
pediu explicitamente pra ignorar dieta e outros assuntos). Três acréscimos em
`CONHECIMENTO_TREINO`, sem duplicar o que Huberman/Galpin já cobriam:
frequência de treino (bater cada grupo 2x/semana supera 1x/semana no mesmo
volume), RIR como régua de esforço pra maioria das séries (2–3 RIR ≈ falha,
com menos fadiga — falha vira ferramenta ocasional, não regra), e seleção de
exercício pela relação estímulo/fadiga (SFR — conceito de Mike Israetel,
ensinado por Nippard; a base credita a origem certa, não quem popularizou).
Fontes em `docs/REFERENCIAS.md` §19, com os dois vídeos específicos usados.

**Processo:** o Daniel fez o deploy de produção pela primeira vez nesta
sessão — segredos + `wrangler deploy` + depois `OPENBRAIN_KEY`. Duas travas
não óbvias custaram tempo: (1) o computador dele nunca tinha rodado `wrangler
login`, e os primeiros erros (pasta errada, depois "Worker name missing")
mascararam isso; (2) a pasta local do projeto era uma colcha de retalhos de
mais de uma máquina, então resolvemos com `git clone` limpo numa pasta nova
em vez de tentar consertar a antiga. Também: ao colar uma chave de API, "só o
que vem depois do `=`" não é óbvio pra quem não mexe com isso no dia a dia —
colar `key=abc123` inteiro (em vez de só `abc123`) rendeu um "chave inválida"
que parecia bug e não era. Depois de resolvido: login funcionando, coach
montando plano de verdade, Open Brain recebendo — tudo confirmado pelo
próprio Daniel no app publicado.

## 2026-08-18 — Área 🏋️ Treino: coach semanal (Huberman/Galpin)

O coach monta UMA semana por vez e evolui pelos números registrados. Worker:
rota `/treino` (ações `plano`/`fechar`), saída estruturada por JSON-schema,
validação defensiva antes de guardar, notas 0–10 clampadas com null permitido
("sem registro não há nota — chutar é proibido"), modelo o mesmo da análise
(chamada rara, raciocínio pesado), sem cache de prompt (semanal + TTL 5 min =
prefixo sempre escrito, nunca lido). Base `CONHECIMENTO_TREINO` separada — só
viaja em `/treino` (força 3-a-5, hipertrofia 10–20 séries, potência/fibras
tipo II no começo da sessão, Z2 pelo teste da fala, Z5 1–2×/sem, bateria de
avaliação Galpin, progressão 2–5% OU 1–2 reps OU 5–10% tempo, deload, troca de
bloco; betabloqueador → RPE/fala, estatina → dor nova ao médico). App: estado
`treino` em storage.js (perfil, plano com a semana corrente, semanasFechadas
por número, avaliações), merge entre aparelhos fica com a semana MAIS
AVANÇADA, inputs de registro em `type=text inputmode=decimal` (o teclado
pt-BR digita "42,5" e o input numérico descartaria a vírgula) gravando em
`oninput` (change só dispara ao sair do campo — o último registro se perderia
ao fechar o app). Suíte `test/treino.mjs` cobre o ciclo inteiro contra os
fixtures do dev-server. Fontes em `docs/REFERENCIAS.md` §16–18.

Depois da entrega, dois agentes passaram por cima: um revisor independente e
um de design. Do revisor saiu um defeito **grave** que os testes não pegavam —
"refazer o plano" recomeçava a contagem na semana 1, e como `numero` é a
identidade da semana no histórico, o merge entre dois aparelhos descartava uma
delas em silêncio. Agora o app manda `proximaNumero` (maior fechada + 1) e o
Worker REESCREVE `semana.numero` na resposta em vez de confiar no modelo — nos
dois lados, porque Pages e Worker sobem separados. Junto foram: a corrida entre
"fechar semana" em voo e "refazer o plano" (gravava avaliação de plano
descartado), `importJSON('replace')` sem normalizar `treino` (dava alerta
mentiroso de "arquivo ilegível"), "Cardio Z2"/"Cardio Z5" que apareciam ambos
como "Cardio" no resumo, separador órfão no alvo do exercício e ids de item que
colidiam dentro do mesmo laço. Do design saiu o restyle da barra de áreas
(pílula ativa), contraste do tema escuro (`--on-accent`: texto branco sobre
verde claro era ilegível), foco visível nos campos, e o polimento da semana e
das barras de nota.

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
