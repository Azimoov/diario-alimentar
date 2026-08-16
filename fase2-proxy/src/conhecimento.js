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

export { CONHECIMENTO, INSTRUCAO_CONHECIMENTO };
