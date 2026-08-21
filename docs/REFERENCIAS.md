# Referências da base de conhecimento

De onde vem cada afirmação de `fase2-proxy/src/conhecimento.js` — a base que a
IA consulta na conversa (`/chat`) e na análise cruzada (`/analyze`), e a base
de treino (`CONHECIMENTO_TREINO`) que o coach consulta em `/treino`.

Marcações: `[verificado]` = fonte localizada e conferida · `[verificar]` =
citação registrada como fornecida, **não** confirmada em fonte primária.

Etiquetas de evidência usadas dentro da base: **[FORTE]** = bem estabelecido ·
**[ESCOLA]** = prática da escola de otimização/longevidade, base mais fraca ou
extrapolação · **[SECUNDÁRIO]** = divulgação/podcast, não literatura primária.

## Por que as etiquetas existem

Metade destas fontes é material secundário, e o próprio documento de origem
admite isso. Uma base que apresentasse podcast e revisão sistemática com a
mesma cara seria pior do que não ter base nenhuma: a IA passaria a afirmar com
segurança de ensaio clínico coisas que são opinião de escola. Por isso cada
item carrega o peso, e a instrução de uso proíbe achatar essa diferença.

## Artigos e revisões

1. **Health Outcomes of Sarcopenia: A Systematic Review and Meta-Analysis**
   `[verificado]` — Beaudart C. et al., *PLoS ONE*.
   <https://pubmed.ncbi.nlm.nih.gov/28095426/>
   *Na base:* prevalência de sarcopenia e razão de chances de mortalidade
   (OR 3,596). É a única fonte primária de alta qualidade desta lista.
   > A atribuição "PLoS ONE/ESCEO" da lista original misturava o periódico com
   > o grupo de trabalho dos autores. O artigo é do *PLoS ONE*.

2. **Benefícios do uso de Creatina na População Idosa** `[verificar]`
   Krepischi, A. C.; Nascimento, V. H. S. — *Brazilian Journal of Implantology
   and Health Sciences*.
   *Na base:* protocolo de saturação/manutenção e co-transporte com carboidrato.
   > Periódico de baixo impacto e revisão por pares pouco transparente. Ponto de
   > partida, **não** evidência primária — para creatina em idosos há
   > meta-análises melhores (Candow, Chilibeck e cols.) que valem substituir.

3. **Balance Training Program for Community-Dwelling Elders with Risk of Falls**
   `[verificar]` — Kim, Yang Rae — *Physical Therapy Rehabilitation Science*.
   *Na base:* citada apenas na seção de limites (protocolo 3x/semana, 32
   semanas), justamente por não ter link/DOI confirmado.

4. **Musculação protege o cérebro de idosos contra demência** `[verificado]`
   Agência FAPESP, cobertura de estudo Unicamp / CEPID BRAINN (2025).
   <https://agencia.fapesp.br/musculacao-protege-o-cerebro-de-idosos-contra-demencia-sugere-estudo/54124>
   > Jornalismo científico, não o artigo original. Sustenta a direção
   > (força × cognição), não números.

5. **Dieta da Longevidade: Mais Carboidratos, Jejum e Menos Proteína**
   `[verificar]` — ANAD (Associação Nacional de Atenção ao Diabetes).
   *Na base:* posição da escola Longo (metionina/mTOR, janela de 12 h, ciclos
   de dieta que imita jejum), marcada como [SECUNDÁRIO] **e** como lado de uma
   disputa aberta.

## Livros e manuais

6. **Outlive: The Science and Art of Longevity** — Peter Attia `[verificado]`
   *Na base:* Medicina 3.0, "Quatro Cavaleiros", Zona 2/Zona 5, VO₂ máx,
   decatlo do centenário.

7. **Practice Manual: Advanced Biomarkers for Cardiometabolic and
   Neurodegenerative Risk Assessment** `[verificar]`
   *Na base:* ApoB × LDL-C, discordância LDL-P, morfologia de partícula,
   Índice de Vulnerabilidade Metabólica (GlycA, LP-IR, BCAA), VO₂ máx como
   preditor, APOE4 e o paradigma "diabetes tipo 3".
   > Material de escola (Attia/Early Medical). Os mecanismos são bem
   > estabelecidos; os alvos numéricos e o agrupamento são da escola.

8. **Guia Mestre de Longevidade: Framework Medicina 3.0 e Protocolos Práticos**
   `[verificar]`
   *Na base:* sarcopenia como base da fragilidade, resistência anabólica,
   testes funcionais (Berg, TUG, Barthel, MMSE), creatina, sauna, sono e
   conexão social.

9. **Referência — TRT & Longevidade** (documento de apoio, não prescrição)
   `[verificar]`
   *Na base:* **só a parte técnica generalizável** — testosterona livre ×
   total, vigilância de hematócrito, papel do estradiol no homem, velocidade
   de PSA, ensaio sensível, supressão de LH/FSH, coleta no vale, ferritina e
   vitamina D, transferência do gel por contato.
   > **O original é um documento clínico individual** (idade, diagnóstico,
   > medicação e lacuna de exame de uma pessoa). Nada disso entrou na base: ela
   > vai no prompt de TODAS as contas. `test/smoke.mjs` tem uma checagem que
   > falha se dado clínico individual reaparecer ali.

10. **An Integrative, Scientific, and Practical Guide for a Happier Life**
    `[verificar]` — sem link/DOI confirmado; não sustenta nenhum item da base.

11. **Sempre em Movimento** — Grupo Fleury `[verificar]`
    Livro institucional; contexto histórico, não evidência clínica.

## Podcasts e vídeo

12. **The Peter Attia Drive** `[verificar]` — AMA #28 (testosterona e TRT),
    AMA #52 (reposição hormonal), #260 com Mohit Khera (saúde sexual
    masculina), episódio sobre o ensaio TRAVERSE.
    <https://peterattiamd.com/podcast/>

13. **Peter Attia MD — canal oficial** `[verificado]`
    <https://www.youtube.com/@PeterAttiaMD>

14. **FoundMyFitness (Rhonda Patrick)** `[verificar]` — episódio sobre TRT
    (sintoma > nível).

15. **Os 7 Pilares da Longevidade, com Dr. Thiago Volpi** — *TalksbyLeo* #142
    `[verificar]` — opinião clínica; serve para hipótese, não para afirmação.

## Base de treino (`CONHECIMENTO_TREINO` — usada só em `/treino`)

Protocolos públicos de Andrew Huberman (Huberman Lab) e Andy Galpin,
conferidos nas páginas dos episódios e em resumos independentes em 2026-08.
Tudo aqui é **[SECUNDÁRIO]** por definição (podcast/divulgação), de
divulgadores que citam a literatura primária — a base marca isso e o coach é
instruído a tratar como orientação de treino, nunca como conduta clínica.

16. **Huberman Lab — Guest Series com Dr. Andy Galpin** `[verificado]`
    <https://www.hubermanlab.com/episode/dr-andy-galpin-how-to-assess-improve-all-aspects-of-your-fitness>
    e os demais episódios da série (força/hipertrofia, resistência,
    recuperação, programa otimizado).
    *Na base:* bateria de avaliação (salto horizontal ≈ estatura, preensão,
    dead hang, VO₂máx mínimo/ideal), regra 3-a-5 para força (≥85% 1RM),
    hipertrofia 10–20 séries/músculo/semana com 4–30 reps perto da falha,
    blocos de ênfase com manutenção do resto, deload periódico.

17. **Huberman Lab — Fitness Toolkit / Foundational Fitness Protocol**
    `[verificado]` <https://www.hubermanlab.com/episode/fitness-toolkit-protocol-and-tools-to-optimize-physical-health>
    *Na base:* distribuição semanal (Z2 ≥ 180–200 min/semana pelo teste da
    fala, Z5/VO₂máx 1–2×/semana com intervalos, força 2–3×/semana), potência e
    velocidade no começo da sessão.

18. **Andy Galpin (podcast/aulas públicas) — envelhecimento neuromuscular**
    `[verificado — direção; números conferidos nos resumos dos episódios]`
    *Na base:* a sequência do envelhecimento (perde-se primeiro velocidade,
    depois força, depois tamanho), atrofia preferencial de fibras tipo II e o
    antídoto — saltos/arremessos/sprints curtos, descansado, no início da
    sessão; progressão ~2–5% de carga OU 1–2 reps; alongamento estático 30 s.
    > Nada da base de treino é dado clínico individual, e as adaptações a
    > medicamentos (betabloqueador → RPE/fala; estatina → dor muscular nova ao
    > médico) são regras de SEGURANÇA no prompt do coach, não prescrição.

19. **Jeff Nippard — canal do YouTube, série Fundamentals (só os episódios de
    treino)** `[verificado — direção confirmada em resumos independentes das
    fontes primárias abaixo; não é transcrição integral dos vídeos]`
    <https://www.youtube.com/@JeffNippard>
    *Episódios usados* (pedido explícito do Daniel: só treino, dieta ficou de
    fora):
    - "Rep Ranges and Training Intensity | The Fundamentals Series: Chapter 3"
      <https://www.youtube.com/watch?v=3JOEZb46-dM>
    - "What Are The Best Exercises for Muscle and Strength? | Fundamentals
      Series Ep. 4" <https://www.youtube.com/watch?v=vyiQw-qiv80>
    *Na base:* frequência de treino (bater cada grupo muscular 2x/semana supera
    1x/semana no mesmo volume total), RIR (repetições de reserva) como régua de
    esforço para a maioria das séries — treinar a 2–3 RIR rende hipertrofia
    parecida com ir à falha, com menos fadiga acumulada — e seleção de
    exercício pela relação estímulo/fadiga (SFR), útil para trocar um exercício
    quando há dor articular ou limitação, sem só reduzir carga.
    > O conceito de SFR é de **Mike Israetel** (Renaissance Periodization) —
    > Nippard ensina e aplica, não é originalmente dele. A base credita a
    > origem certa, não quem popularizou.

## O que esta base ainda não cobre

Sono, rastreio oncológico e saúde mental aparecem citados de passagem, mas sem
fonte de suporte aqui. A própria base declara essa lacuna quando o assunto
surge, em vez de improvisar. Preencher isso — com literatura primária — é o
próximo passo natural.

## Como alterar a base

`fase2-proxy/src/conhecimento.js` é texto puro dentro de uma string. Ao mexer:

1. **Toda afirmação nova precisa de etiqueta de evidência.** Sem etiqueta, a
   instrução de uso não tem como impedir que vire dogma.
2. **Nenhum dado clínico individual**, de ninguém — a base é compartilhada por
   todas as contas.
3. **Rode `node fase2-proxy/test/smoke.mjs`**: ele confere que a base chega às
   duas rotas, que as travas de uso continuam no prompt e que nada individual
   vazou.
4. Lembre do custo: a base inteira viaja em toda pergunta. Mantenha densa —
   **um fato mora em uma seção só**; quando outra precisar dele, aponte ("ver
   X") em vez de repetir.
5. O que vale para as duas rotas de IA com ou sem base (não inventar faixa
   normal, comparar só com a faixa do laudo, não prescrever) NÃO entra aqui:
   mora em `REGRAS_HONESTIDADE`, no `index.js`, e viaja no mesmo prompt.
6. Não mexa na ordem dos blocos do `system` na conversa: o prefixo cacheável
   (prompt + base) vem primeiro e leva a marca; os dados da pessoa vêm depois.
   Inverter faria cada pesagem nova invalidar o cache.
