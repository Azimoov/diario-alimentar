# Referências da base de conhecimento

De onde vem cada afirmação de `fase2-proxy/src/conhecimento.js` — a base que a
IA consulta na conversa (`/chat`) e na análise cruzada (`/analyze`).

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
