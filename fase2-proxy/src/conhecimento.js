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

const CONHECIMENTO = `BASE DE REFERÊNCIA (Medicina 3.0 / longevidade)

Peso de evidência usado abaixo: [FORTE] = bem estabelecido · [ESCOLA] = prática
da escola de otimização/longevidade, base mais fraca ou extrapolação ·
[SECUNDÁRIO] = veio de divulgação/podcast, não de literatura primária.

## Framework geral
- Medicina 3.0 (Peter Attia): foco em healthspan (anos com função), não só
  lifespan. Intervir décadas antes do diagnóstico, quando o custo da mudança é
  baixo. [ESCOLA]
- "Quatro Cavaleiros": doença cardiovascular, câncer, neurodegeneração e
  disfunção metabólica. Elo comum: resistência à insulina e inflamação
  crônica. [FORTE quanto aos desfechos; ESCOLA quanto ao agrupamento]
- Diagnóstico tradicional falha por chegar tarde: a fisiopatologia costuma
  progredir 20–30 anos antes de bater critério clínico. [FORTE]

## Cardiovascular / lipídios
- ApoB é o melhor marcador lipídico de risco aterosclerótico, superior ao
  LDL-C isolado: conta partículas aterogênicas, não massa de colesterol.
  [FORTE]
- Discordância LDL-C normal com LDL-P/ApoB alto identifica risco que o painel
  padrão perde. [FORTE]
- Lp(a) é largamente genético e merece pelo menos uma dosagem na vida. [FORTE]
- Alvo praticado na escola de longevidade: ApoB o mais baixo tolerável.
  [ESCOLA] — o alvo numérico exato é disputado.

## Metabólico
- Resistência à insulina é a base de quase todo o resto. Marcadores úteis:
  HbA1c, insulina de jejum, triglicerídeos/HDL. [FORTE]
- Alvos de otimização citados: HbA1c < 5,7% (ideal ~5,3%), hsCRP < 1 mg/L.
  [ESCOLA]
- Cinco alavancas: nutrição, exercício, sono, estresse e, quando insuficiente,
  farmacologia. [FORTE]

## Exercício
- Aptidão cardiorrespiratória (VO2 máx) é dos preditores mais potentes de
  mortalidade por todas as causas. Sair do quartil inferior para a faixa alta
  tem efeito comparável ou maior que parar de fumar. [FORTE]
- Zona 2 constrói densidade mitocondrial e flexibilidade metabólica; Zona 5
  eleva o teto aeróbico. [ESCOLA quanto ao protocolo; FORTE quanto ao VO2 máx]
- Treino de força é obrigatório: sarcopenia é preditor independente de
  mortalidade (razão de chances ~3,6 em revisão sistemática — Beaudart et al.,
  PLoS ONE, PMID 28095426), com risco bem maior acima dos 79 anos. [FORTE]
- Exercício de alta intensidade aumenta BDNF; combinação força + cardio é a
  defesa mais consistente contra declínio cognitivo. [FORTE]

## Nutrição — ATENÇÃO: há disputa real aqui
- Attia e Valter Longo DISCORDAM frontalmente sobre proteína e jejum. Não
  finja consenso. Ao tocar no assunto, apresente os dois lados:
  - Escola Longo: restringir proteína/metionina até ~65 anos (vias mTOR/IGF-1),
    janela alimentar de 12 h, ciclos de dieta que imita jejum. [SECUNDÁRIO —
    material de divulgação, não evidência primária]
  - Escola Attia/Layman: proteína alta para preservar massa magra, sobretudo
    com déficit calórico e no envelhecimento (resistência anabólica). [ESCOLA]
- Ponto de concordância: após os 65 anos a necessidade proteica sobe, com
  bolus maiores pós-exercício. [FORTE]

## Suplementação
- Creatina monoidratada: ~3–5 g/dia manutenção; saturação opcional
  0,3 g/kg/dia por 5–7 dias. Um dos suplementos com melhor base. [FORTE]
- Co-ingestão com carboidrato melhora captação. [ESCOLA]

## Hormônios (referência técnica geral — nunca prescrição)
- Testosterona: a fração livre correlaciona melhor com sintoma do que a total;
  a total sofre influência da SHBG. Decisão não se toma pela total isolada.
  [ESCOLA]
- Hematócrito é o efeito adverso de risco real em reposição (viscosidade →
  trombose). Teto clássico de segurança ~54%; alvo conservador < 50%. [FORTE]
- Estradiol no homem NÃO é vilão: é necessário para libido, osso, cognição e
  saúde cardiovascular. Estradiol baixo demais causa libido no chão, dor
  articular e perda óssea. Erro comum do autogerenciamento é suprimir com
  inibidor de aromatase ao ver o número subir. Regra: vigiar sintoma, não
  perseguir número. [ESCOLA]
- Estradiol elevado pode refletir composição corporal (aromatase age no tecido
  adiposo), não necessariamente dose. [ESCOLA]
- PSA: importa a VELOCIDADE de subida, mais que o valor isolado. [FORTE]
- Pedir estradiol por ensaio sensível (LC-MS/MS): o imunoensaio comum é
  impreciso em homens. [FORTE]
- LH/FSH suprimem com reposição exógena — é esperado, não é alarme. [FORTE]

## Sono, ambiente e social
- Sono regula ritmo circadiano e limpeza metabólica cerebral. [FORTE]
- Sauna/termoterapia: proteínas de choque térmico, associação com menor risco
  neurodegenerativo. [ESCOLA]
- Isolamento social é fator potente de inflamação crônica. [FORTE]

## Limites conhecidos DESTA base (declare quando for relevante)
- Viés pró-Attia. Metade das fontes é secundária (podcast, agência de notícia,
  material institucional). Só a revisão de sarcopenia é primária de alta
  qualidade.
- Lacunas sem fonte de suporte aqui: sono, rastreio oncológico, saúde mental.
- Protocolos citados com fonte não confirmada: equilíbrio 3x/semana por 32
  semanas; creatina em idosos (periódico de baixo impacto).`;

// Instrução de USO — o que faz esta base pesar mais sem virar dogma.
const INSTRUCAO_CONHECIMENTO = `
USO DA BASE DE REFERÊNCIA:
- Ela tem peso PREFERENCIAL sobre o seu conhecimento geral em saúde,
  longevidade e nutrição: quando houver sobreposição, raciocine dentro dela.
- Peso preferencial NÃO é obediência. Discorde dela quando o caso da pessoa,
  os números dela ou evidência melhor apontarem outra direção — e diga que
  está discordando e por quê. Não seja eco.
- Respeite as etiquetas de evidência. Não apresente item [ESCOLA] ou
  [SECUNDÁRIO] com a mesma segurança de um [FORTE]; diga que é prática de
  escola de otimização ou material secundário.
- Onde a base registra disputa (proteína e jejum), apresente os dois lados.
  Nunca invente consenso.
- Alvo de "otimização" não é faixa de referência de laboratório. Ao comparar
  um exame da pessoa, use a faixa que ELA anotou do próprio laudo; se citar um
  alvo de otimização, deixe claro que é outra coisa.
- Nada aqui é prescrição. Dose, medicação e conduta clínica são do médico que
  examina a pessoa.
- Você NÃO tem acesso à internet nesta conversa: não afirme ter consultado
  nada online e não invente links, números de estudo ou citações.`;

export { CONHECIMENTO, INSTRUCAO_CONHECIMENTO };
