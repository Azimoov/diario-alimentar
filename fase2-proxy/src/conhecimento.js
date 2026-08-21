// conhecimento.js — base de referência consultada pela IA nas perguntas de
// saúde/nutrição (rota /chat) e na análise cruzada (/analyze).
//
// PESO: é referência PREFERENCIAL, não exclusiva nem infalível. O prompt manda
// a IA apoiar-se aqui de preferência, mas continuar crítica — inclusive
// discordando daqui quando o caso da pessoa ou evidência melhor apontar outra
// coisa. Cada item carrega o próprio peso de evidência, e isso é deliberado:
// metade desta base é material secundário (podcast, divulgação, institucional),
// e tratar tudo como se fosse ensaio clínico seria pior do que não ter base.
//
// PRIVACIDADE — regra dura: isto entra no prompt de TODAS as contas. Nada aqui
// pode ser dado clínico de uma pessoa específica. O documento de origem sobre
// TRT era personalizado (idade, diagnóstico, medicação de um paciente); só a
// parte técnica generalizável foi aproveitada. Dado individual vem do estado
// da própria conta, nunca daqui.
//
// TAMANHO: a base inteira viaja em TODA pergunta e TODA análise. Cada linha
// aqui é paga muitas vezes por mês, então repetição não é só deselegante — é
// custo recorrente. Um fato mora em UMA seção; quando outra precisa dele,
// aponta ("ver X"), não repete. Procedência item a item em docs/REFERENCIAS.md.

const CONHECIMENTO = `BASE DE REFERÊNCIA (Medicina 3.0 / longevidade)

Peso de evidência: [FORTE] = bem estabelecido · [ESCOLA] = prática da escola de
otimização/longevidade, base mais fraca ou extrapolação · [SECUNDÁRIO] = veio
de divulgação/podcast, não de literatura primária.

## Framework geral
- Medicina 3.0 (Peter Attia): foco em healthspan (anos com função), não só
  lifespan. Intervir décadas antes do diagnóstico, quando o custo da mudança é
  baixo. [ESCOLA]
- "Quatro Cavaleiros": doença cardiovascular, câncer, neurodegeneração e
  disfunção metabólica, com resistência à insulina e inflamação crônica como
  elo comum. [FORTE quanto aos desfechos; ESCOLA quanto ao agrupamento]
- O diagnóstico tradicional chega tarde: a fisiopatologia costuma progredir
  20–30 anos antes de bater critério clínico. [FORTE]

## Cardiovascular / lipídios
- ApoB é o melhor marcador lipídico de risco aterosclerótico, superior ao
  LDL-C isolado: conta partículas aterogênicas, não massa de colesterol.
  Discordância (LDL-C normal com ApoB/LDL-P alto) é justamente o risco que o
  painel padrão perde. [FORTE]
- Alvo praticado na escola: ApoB o mais baixo tolerável — o número exato é
  disputado. [ESCOLA]
- Partícula pequena e densa (padrão B) atravessa o endotélio e se prende na
  parede arterial com mais facilidade que a grande e leve (padrão A), para a
  mesma massa de colesterol. [ESCOLA quanto ao peso clínico de separá-las]
- Lp(a): largamente genético, merece ao menos uma dosagem na vida; junto de
  hsCRP elevado, também pesa no dano microvascular cerebral. [FORTE quanto à
  dosagem; ESCOLA quanto à ponte com o cérebro]

## Metabólico
- Resistência à insulina é a base de quase todo o resto. Marcadores úteis:
  HbA1c, insulina de jejum, triglicerídeos/HDL. [FORTE]
- Alvos de otimização citados: HbA1c < 5,7% (ideal ~5,3%), hsCRP < 1 mg/L.
  [ESCOLA]
- Cinco alavancas: nutrição, exercício, sono, estresse e, quando insuficiente,
  farmacologia. [FORTE]
- Índice de Vulnerabilidade Metabólica (MVI), derivado de RMN, combina GlycA
  (inflamação sistêmica), escore LP-IR de resistência à insulina e aminoácidos
  de cadeia ramificada num preditor de mortalidade. [ESCOLA]

## Neurodegeneração
- Paradigma do "diabetes tipo 3": boa parte da neurodegeneração passa por
  falência metabólica e vascular no cérebro — o que torna tudo da seção
  Metabólico aplicável aqui. A mitigação começa na meia-idade, muito antes do
  primeiro sinal cognitivo. [ESCOLA]
- APOE4 aumenta bastante o risco de Alzheimer e costuma motivar controle
  lipídico e metabólico mais agressivo. [FORTE quanto ao risco; ESCOLA quanto à
  conduta que se deriva dele]

## Exercício
- Aptidão cardiorrespiratória (VO2 máx) é dos preditores mais potentes de
  mortalidade por todas as causas: sair do quartil inferior para a faixa alta
  tem efeito comparável ou maior que parar de fumar. [FORTE]
- Zona 2 constrói densidade mitocondrial e flexibilidade metabólica; Zona 5
  eleva o teto aeróbico. [ESCOLA quanto ao protocolo]
- Treino de força é obrigatório: sarcopenia é preditor independente de
  mortalidade (razão de chances ~3,6; prevalência ~5–13% dos 60 aos 70 anos e
  ~11–50% acima dos 80; risco bem maior acima dos 79 — Beaudart et al.,
  PLoS ONE, PMID 28095426). [FORTE]
- Resistência anabólica: com a idade o músculo exige estímulo mais intenso e
  bolus proteico maior para a mesma síntese — e menos músculo piora a
  resistência à insulina, que aumenta a inflamação, num ciclo que se
  retroalimenta. [FORTE]
- Alta intensidade aumenta BDNF; força + cardio é a defesa mais consistente
  contra declínio cognitivo. [FORTE]
- A meta é funcional, não estética: manter a capacidade exigida pelas tarefas
  que a pessoa quer executar na última década de vida ("decatlo do
  centenário"). [ESCOLA]

## Função e autonomia (o que se mede além do sangue)
- Composição corporal importa mais que peso isolado; padrão-ouro citado é a
  densitometria corporal total. [FORTE]
- Testes funcionais de fragilidade: Berg Balance Scale (≤ 45 = risco elevado de
  queda), Timed Up and Go, Índice de Barthel modificado (perto de 100 =
  autonomia plena) e MMSE (> 24 no rastreio cognitivo). [FORTE quanto aos
  instrumentos; ESCOLA quanto a usá-los como meta em quem não é idoso]

## Nutrição — ATENÇÃO: há disputa real aqui
- Attia e Valter Longo DISCORDAM frontalmente sobre proteína e jejum. Não
  finja consenso; apresente os dois lados:
  - Escola Longo: restringir proteína/metionina até ~65 anos (vias mTOR/IGF-1),
    janela alimentar de 12 h, ciclos de dieta que imita jejum, base
    vegetal/pescetariana com ~30% das calorias em gordura vegetal (azeite,
    nozes). [SECUNDÁRIO — divulgação, não evidência primária]
  - Escola Attia/Layman: proteína alta para preservar massa magra, sobretudo em
    déficit calórico e no envelhecimento (ver resistência anabólica, em
    Exercício). [ESCOLA]
- Ponto de concordância: após os 65 anos a necessidade proteica sobe. [FORTE]

## Suplementação
- Creatina monoidratada, um dos suplementos com melhor base: ~3–5 g/dia de
  manutenção, saturação opcional 0,3 g/kg/dia por 5–7 dias. Ganho de
  desempenho citado na ordem de ~7%, variando com protocolo e população
  [este número é SECUNDÁRIO]. Co-ingestão com carboidrato melhora a captação
  (insulina estimula a bomba Na-K ATPase, que co-transporta sódio e creatina
  para dentro da célula) [ESCOLA]. [FORTE quanto ao suplemento e à dose]
- Creatina + coenzima Q10 é citada para proteção mitocondrial cerebral em
  Parkinson. [SECUNDÁRIO — não trate como conduta estabelecida]

## Hormônios (referência técnica geral)
- Testosterona: a fração livre correlaciona melhor com sintoma que a total (a
  total sofre influência da SHBG), então não se decide pela total isolada.
  Colher no VALE, pela manhã; alvo praticado é o terço superior da faixa do
  laboratório, e total muito acima dela num vale sugere dose além do
  necessário. [ESCOLA]
- Hematócrito é o efeito adverso de risco real em reposição (viscosidade →
  trombose). Teto clássico de segurança ~54%; alvo conservador < 50%. [FORTE]
- Estradiol no homem NÃO é vilão: é necessário para libido, osso, cognição e
  saúde cardiovascular, e baixo demais causa libido no chão, dor articular e
  perda óssea. Erro comum do autogerenciamento é suprimi-lo com inibidor de
  aromatase ao ver o número subir — a regra é vigiar sintoma, não perseguir
  número. Elevado pode refletir composição corporal (a aromatase age no tecido
  adiposo), não necessariamente dose. [ESCOLA]
- Pedir estradiol por ensaio sensível (LC-MS/MS): o imunoensaio comum é
  impreciso em homens. [FORTE]
- PSA: importa a VELOCIDADE de subida, mais que o valor isolado. [FORTE]
- LH/FSH suprimem com reposição exógena — esperado, não é alarme. [FORTE]
- Ferritina ~50–100 ng/mL (nem baixa nem alta; reposição mexe na eritropoese) e
  vitamina D 25-OH ~40–60 ng/mL (alvo debatido). [ESCOLA]
- SEGURANÇA da apresentação em gel: transfere por contato pele a pele e
  viriliza quem recebe — relevante com crianças e parceiros em casa. Lavar as
  mãos, cobrir a área, deixar secar. [FORTE]

## Sono, ambiente e social
- Sono regula ritmo circadiano e limpeza metabólica cerebral. [FORTE]
- Sauna/termoterapia: proteínas de choque térmico, associação com menor risco
  neurodegenerativo. [ESCOLA]
- Isolamento social é fator potente de inflamação crônica. [FORTE]

## Limites conhecidos DESTA base (declare quando for relevante)
- Viés pró-Attia. Metade das fontes é secundária (podcast, agência de notícia,
  material institucional); só a revisão de sarcopenia é primária de alta
  qualidade, e o material sobre creatina em idosos veio de periódico de baixo
  impacto.
- Sem fonte de suporte aqui: sono, rastreio oncológico, saúde mental.
- Faixas "ideais" de longevidade têm base mais fraca que as faixas clínicas —
  são extrapolação de estudo observacional e opinião de escola, não desfecho
  controlado. Onde o número exato importar, mande confirmar na fonte primária;
  vale sobretudo para testosterona livre e estradiol, cujos alvos variam por
  unidade e método.
- Ninguém sabe a dose ou formulação que Attia usa nele próprio: ele não
  divulga. Quem afirma um número específico está preenchendo lacuna — público
  é o princípio, não o número pessoal.`;

// Instrução de USO — o que faz esta base pesar mais sem virar dogma.
//
// Aqui só entra regra ESPECÍFICA DA BASE. O que vale para as duas rotas de IA
// com ou sem base — não inventar faixa normal, comparar só com a faixa anotada
// do laudo, não prescrever, não diagnosticar — mora em REGRAS_HONESTIDADE, no
// index.js, e viaja no mesmo prompt. Repetir aqui custaria em toda chamada e
// criaria duas redações da mesma regra para divergirem com o tempo.
const INSTRUCAO_CONHECIMENTO = `
USO DA BASE DE REFERÊNCIA:
- Ela tem peso PREFERENCIAL sobre o seu conhecimento geral em saúde,
  longevidade e nutrição: quando houver sobreposição, raciocine dentro dela.
- Peso preferencial NÃO é obediência. Discorde dela quando o caso da pessoa,
  os números dela ou evidência melhor apontarem outra direção — e diga que
  está discordando e por quê. Não seja eco.
- Respeite as etiquetas de evidência: não apresente [ESCOLA] ou [SECUNDÁRIO]
  com a mesma segurança de um [FORTE], e diga de que tipo de base se trata.
- Onde a base registra disputa (proteína e jejum), apresente os dois lados.
  Nunca invente consenso.
- Alvo de "otimização" daqui NÃO é faixa de referência de laboratório: se
  citar um, deixe claro que é outra coisa.
- Você NÃO tem acesso à internet nesta conversa: não afirme ter consultado
  nada online e não invente links, números de estudo ou citações.`;

export { CONHECIMENTO, INSTRUCAO_CONHECIMENTO, CONHECIMENTO_TREINO };

// ---------------------------------------------------------------------------
// BASE DE TREINO — viaja SÓ nas chamadas da área Treino (/treino), nunca na
// conversa nem na análise: quem pergunta sobre colesterol não paga pelos
// protocolos de agachamento. Fontes: série de 6 episódios do Andy Galpin no
// Huberman Lab (2023) + episódios avulsos do Huberman Lab + série Fundamentals
// (SÓ os episódios de treino — dieta ficou de fora por pedido do Daniel) do
// canal de Jeff Nippard; procedência item a item em docs/REFERENCIAS.md.
// Mesmas etiquetas de evidência da base principal.
const CONHECIMENTO_TREINO = `BASE DE TREINO (Galpin / Huberman Lab / Nippard)

Peso de evidência: [FORTE] = bem estabelecido na fisiologia do exercício ·
[ESCOLA] = prática recomendada por esses educadores, base razoável ·
[SECUNDÁRIO] = número citado em podcast/divulgação, sem fonte primária conferida.

## Capacidades treinadas (adaptações são específicas do estímulo) [FORTE]
Força máxima, hipertrofia, potência (fibras rápidas/tipo II), equilíbrio,
mobilidade, base aeróbica (Zona 2) e potência aeróbica (Zona 5/VO2máx) são
adaptações DIFERENTES: cada uma responde ao seu estímulo, e não dá para
maximizar todas ao mesmo tempo — daí treinar em blocos com uma ênfase por vez,
mantendo o resto em dose de manutenção. [ESCOLA quanto ao arranjo em blocos]

## Bateria de avaliação (Galpin) — referências MÍNIMAS, não metas de atleta
- Salto horizontal ≈ a própria altura é aceitável (mulheres ~15% menos) —
  mede potência. [SECUNDÁRIO]
- Preensão manual ≥ 40 kg homens / ≥ 35 kg mulheres, diferença < 10% entre as
  mãos. [SECUNDÁRIO]
- Pendurar na barra (dead hang) ≥ 30 s; 50–60 s é bom. [SECUNDÁRIO]
- VO2máx: mínimo ~35 mL/kg/min homens / ~30 mulheres; ideal > 55 / > 50.
  O número do relógio é ESTIMATIVA de sensor. [FORTE quanto ao VO2máx como
  preditor; SECUNDÁRIO quanto aos cortes]
- Equilíbrio: apoio unipodal cronometrado (progredir de olhos abertos para
  fechados). [FORTE como instrumento simples]
- Ordem de testes num mesmo dia: não fatigantes primeiro (medidas, equilíbrio,
  potência), força depois, fôlego por último. [ESCOLA]

## Força máxima — regra do 3-a-5 (Galpin) [ESCOLA]
3–5 exercícios COMPOSTOS por sessão · 3–5 repetições · 3–5 séries ·
3–5 minutos de descanso completo. Cargas altas (≥ ~85% de 1RM) recrutam as
fibras rápidas; menos de 3 reps também vale (singles/doubles), mais de 5 vira
outra coisa. 1RM estimado por fórmula (Epley: carga × (1 + reps/30)) é
ESTIMATIVA — nunca testar 1RM real sem experiência. [FORTE quanto ao
recrutamento por carga alta]

## Hipertrofia [FORTE nos princípios]
10–20 séries de trabalho por grupo muscular POR SEMANA; 4–30 reps por série
funcionam se chegarem perto da falha (parar ~2 reps antes); a faixa 8–15 é o
melhor custo-benefício; descanso ~2 min. Progressão dupla: subir reps dentro
da faixa, depois subir carga. Frequência: bater cada grupo muscular pelo
menos 2x/semana supera 1x/semana no MESMO volume total — distribuir as
séries em 2+ sessões por grupo em vez de empilhar tudo numa sessão só.
(Nippard, série Fundamentals) [FORTE]

## Seleção de exercícios — relação estímulo/fadiga (SFR) [ESCOLA]
Exercícios diferem em quanto estímulo de crescimento dão por quanto fadiga
cobram. Agachamento estimula bem o quadríceps mas cobra fadiga sistêmica
alta; leg press estimula parecido com fadiga bem menor — variar/trocar
conforme a meta (fadiga sobrando → preferir opções de fadiga menor; força
específica → o multiarticular continua sendo o exercício certo, fadiga à
parte). Útil sobretudo para adaptar quando há dor articular ou limitação
declarada no perfil: trocar por uma opção de fadiga/impacto menor no MESMO
grupo muscular, não só reduzir carga. (Conceito de Mike Israetel, ensinado
e aplicado por Nippard, série Fundamentals)

## Potência e fibras rápidas — a prioridade que envelhece primeiro
- Com a idade se perde VELOCIDADE antes de força, e força antes de tamanho; a
  atrofia é desproporcional nas fibras rápidas (tipo II). [FORTE]
- Fibra rápida só é recrutada com carga alta OU intenção de velocidade máxima:
  saltos, arremessos, subidas explosivas, sprints curtos, levantamentos com
  intenção rápida. Poucas reps (3–5), longe da falha, com o corpo DESCANSADO —
  potência vem logo depois do aquecimento, nunca no fim do treino. [FORTE]
- É o que preserva a capacidade de "botar o pé na frente" numa queda: potência
  + força excêntrica de frear. [FORTE]

## Cardio Zona 2 [FORTE nos efeitos; ESCOLA na dose]
Ritmo em que dá para conversar com esforço perceptível (teste da fala). Meta
da escola: somar ≥ 180–200 min/semana; sessões contínuas de 40–75 min são as
mais eficientes, mas caminhada rápida acumulada conta. Base mitocondrial e
flexibilidade metabólica.

## Cardio Zona 5 / VO2máx [FORTE]
1–2 sessões por semana bastam. Formatos: intervalos longos ~4 min forte + ~4
min leve (3–5 voltas) ou sprints de 8–30 s com recuperação generosa. Esforço
que NÃO deixa conversar. Exige liberação médica em quem tem doença
cardiovascular conhecida — na dúvida, orientar a conversar com o médico antes.

## Equilíbrio [FORTE como capacidade treinável]
Progressão: apoio unipodal olhos abertos → fechados → superfície instável;
exercícios unilaterais de força (afundo, subida no banco) treinam equilíbrio
junto. Poucos minutos, várias vezes por semana, valem mais que uma sessão
longa rara. [ESCOLA na dosagem]

## Mobilidade / flexibilidade [ESCOLA]
Alongamento ESTÁTICO de 30 s por posição, 2–4 séries, ≥ 5 dias/semana,
somando ~5 min por grupo muscular na semana; sempre aquecido. Alongar forte
demais ANTES de treino de força/potência pode reduzir o desempenho imediato —
mobilidade pesada fica para depois do treino ou em sessão própria.

## Progressão semana a semana [ESCOLA]
- Cumpriu tudo com RPE confortável (≤ 7–8): subir ~2–5% a carga OU +1–2 reps,
  OU +5–10% o tempo de Z2. Não subir tudo de uma vez.
- RIR (repetições de reserva; RPE 7–8 ≈ 2–3 RIR) é a régua da maioria das
  séries: treinar a 2–3 RIR rende hipertrofia parecida com ir até a falha
  total, com bem menos fadiga acumulada. Falha é ferramenta ocasional (ex.:
  última série de um exercício), não regra de toda série. (Nippard, série
  Fundamentals) [FORTE]
- Não cumpriu, RPE alto ou dor: repetir ou reduzir. Progresso não é linear.
- DELOAD a cada 4–6 semanas: ~metade do volume, intensidade leve, uma semana.
- Bloco novo (trocar a ênfase) quando: a ênfase atual estagnou por 2+ semanas,
  a nota de outra capacidade está muito atrás, ou o bloco completou 4–6
  semanas. Avisar o porquê da troca.
- Sem registro não há progressão honesta: pedir os números em vez de assumir.

## Contexto clínico que muda o treino [FORTE]
- Betabloqueador SEGURA a frequência cardíaca: zonas por FC não valem — usar o
  teste da fala e RPE (esforço percebido 0–10) no lugar.
- Estatina: dor muscular NOVA e incomum não é normal de treino — anotar e
  levar ao médico (sem diagnosticar, sem alarmar).
- Dor no peito, falta de ar desproporcional, tontura ou desmaio durante
  exercício: PARAR e procurar atendimento — não é assunto de coach.
- Dor ARTICULAR aguda não é dor muscular boa: trocar o exercício, não
  "empurrar". Dor muscular tardia (24–72 h) é esperada no começo.
- Hipertensão descontrolada, cardiopatia ou cirurgia recente: liberação
  médica antes de intensidade alta.`;

