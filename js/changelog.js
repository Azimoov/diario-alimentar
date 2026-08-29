// changelog.js — o que mudou em cada versão, em português de gente.
//
// REGRA DE OURO: a versão do topo desta lista TEM QUE SER A MESMA do `?v=N`
// no index.html. É esse número que o app usa para saber se tem novidade a
// mostrar; se os dois saírem de sincronia, ou a pessoa vê um "novidades" que
// não corresponde ao código que está rodando, ou não vê nada. O teste
// `test/novidades.mjs` falha se divergirem — de propósito.
//
// Ao publicar algo que mexa em .js/.css: suba o ?v=N no index.html E acrescente
// a entrada aqui, no topo. Escreva do ponto de vista de quem USA o app, não de
// quem programa: "o app avisa quando o peso empaca", não "adicionado
// analisarPlato() em app.js".
window.CHANGELOG = [
  {
    versao: '16',
    data: '2026-08-29',
    titulo: 'Trazer seus dados de outra IA',
    mudancas: [
      'Em Diário → Dados tem um cartão novo: você joga o arquivo de memória de outra IA (o memory.md) ou cola o texto, e o app preenche o que conseguir — idade, altura, sexo, peso do perfil, remédios e exames.',
      'O texto inteiro fica guardado como seu contexto: a IA daqui passa a saber sua história sem você redigitar nada. Dá para editar ou apagar esse texto a qualquer momento.',
      'Três coisas o app se recusa a fazer, de propósito: não sobrescreve nada que você já preencheu; não importa exame sem data (carimbar "hoje" num exame antigo estragaria o gráfico); e não transforma um peso mencionado no texto em pesagem do histórico.',
      'Cada remédio e exame importado guarda a frase do arquivo que o originou, para você conferir de onde saiu.',
      'O servidor descarta qualquer campo que a IA não consiga sustentar com uma frase literal do arquivo — e a tela diz o que foi descartado, em vez de fingir que leu tudo.',
      'A IA trata esse texto como RELATO, não como medição: se ele contradisser um exame que você anotou, o exame anotado vence.',
    ],
  },
  {
    versao: '15',
    data: '2026-08-29',
    titulo: 'O coach passou a prescrever o descanso entre séries',
    mudancas: [
      'Cada exercício da semana agora vem com o tempo de descanso entre as séries, na linha do alvo: "3 × 5 · 40 kg · descanso 3 min".',
      'Antes o coach não tinha onde escrever isso. Quando lembrava, o descanso ia solto no texto de execução; na maioria das vezes não aparecia.',
      'Por que importa: o descanso decide o que a série treina. Descansar pouco num trabalho de força alta derruba a carga da série seguinte e vira outro exercício sem você perceber.',
      'A base de conhecimento ganhou uma seção sobre isso, separando o que é bem estabelecido (descanso curto derruba as séries seguintes) do que é convenção de escola (os números em si).',
      'Quando a sessão não couber no seu tempo, o coach foi instruído a cortar exercício em vez de espremer o descanso — e a dizer isso nas orientações.',
      'Planos montados antes desta versão continuam funcionando; eles simplesmente não mostram descanso, porque o coach não prescreveu. Refaça o plano para receber os tempos.',
    ],
  },
  {
    versao: '14',
    data: '2026-08-28',
    titulo: 'O app já sabe quanto pesa 1 morango',
    mudancas: [
      'Anotar "1 morango", "10 uvas" ou "2 dentes de alho" agora estima o peso sozinho. Antes o app só conhecia o peso de 7 alimentos (ovo, pão, banana, maçã, laranja, tangerina e coxinha) e pedia as gramas para todo o resto — o que na prática era desistir. A tabela cresceu para cerca de 80 itens: frutas, legumes, oleaginosas, carnes, salgados e doces.',
      'Plural passou a funcionar sem cadastro duplo: "3 morangos" acha o mesmo item que "1 morango".',
      'Como antes, peso por unidade é ESTIMATIVA e vem marcado como tal na tela — é média de tamanho médio, não pesagem. Se você pesa, corrija o número; o app aceita.',
      'Frutas e itens que caíam no alimento errado foram acertados: castanha-do-pará vinha como chocolate com castanha, espiga de milho vinha como glicose de milho, e bergamota/bolacha não achavam nada.',
      'Os textos do treino não são mais cortados no meio da palavra. A apresentação e as orientações do coach batiam num limite de caracteres e paravam no meio de uma frase ("...hemoglobina 14,8 e hematócri"), o que parecia defeito de tela. O limite subiu bastante e, quando ainda assim precisar cortar, o corte é no fim da palavra e marcado com reticências.',
    ],
  },
  {
    versao: '13',
    data: '2026-08-27',
    titulo: 'Caixinhas dos dias não encolhem mais',
    mudancas: [
      'Nos seletores de dia da semana, as caixinhas de marcar e os rótulos deixaram de espremer em telas estreitas.',
    ],
  },
  {
    versao: '12',
    data: '2026-08-26',
    titulo: 'A conversa da IA enxerga o app inteiro',
    mudancas: [
      'Nova área IA, com todas as análises guardadas e uma conversa que lembra o que já foi dito.',
      'A IA passou a receber o contexto completo do app — metas, diário recente, peso, composição, métricas, exames, treino e as análises anteriores. Antes ela respondia sem saber das suas próprias decisões dentro do app.',
      'O coach de treino saiu do modelo antigo e passou a caber no tempo de resposta do celular, em vez de estourar e não gerar nada.',
    ],
  },
  {
    versao: '11',
    data: '2026-08-21',
    titulo: 'Pausa da dieta em vez de cortar sempre',
    mudancas: [
      'Se você está em déficit há muitos meses e o peso travou, o app passou a oferecer uma pausa de 1 a 2 semanas comendo na manutenção — em vez de só mandar cortar mais. Parte da queda do gasto é resposta do corpo ao próprio déficit, e cortar mais rende cada vez menos.',
      'A IA aprendeu sobre refeed, pausa da dieta e adaptação metabólica, com as fontes e também com as críticas a elas — dá para perguntar na aba IA.',
    ],
  },
  {
    versao: '10',
    data: '2026-08-21',
    titulo: 'Cardio no lugar de "coma menos"',
    mudancas: [
      'Quando a meta de calorias chega no mínimo seguro, o app para de falar em cortar comida: o coach de treino assume e aumenta o cardio para fechar a diferença gastando mais.',
      'Nova tela de novidades: dá para ver tudo o que mudou em cada versão em Diário → Dados.',
      'Depois de cada atualização, o app mostra uma vez o que mudou.',
    ],
  },
  {
    versao: '9',
    data: '2026-08-21',
    titulo: 'O app avisa quando o peso empaca',
    mudancas: [
      'Se o peso parar (ou subir) enquanto a meta é emagrecer, um aviso aparece na aba Hoje — não fica mais escondido esperando você ir procurar.',
      'O aviso separa as duas causas: se você está cumprindo a meta e mesmo assim não anda, ele oferece a meta corrigida pelo seu gasto real em um toque; se você está comendo acima da meta, ele diz isso em vez de mandar cortar mais.',
      'O perfil de treino agora pergunta a sua rotina e em quais dias você tem academia — o treino de força vai nesses dias, e nos outros vai o que dá para fazer sem equipamento.',
    ],
  },
  {
    versao: '8',
    data: '2026-08-21',
    titulo: 'Pico de frequência cardíaca todo dia',
    mudancas: [
      'O coach passou a prescrever um pico curto de frequência cardíaca por dia, e você anota os bpm que o relógio marcou.',
      'O treino passou a usar de verdade a sua dieta e os seus exames: proteína baixa limita ganho de força, exame alterado muda a expectativa, frequência cardíaca de repouso subindo antecipa a semana leve.',
    ],
  },
  {
    versao: '7',
    data: '2026-08-19',
    titulo: 'Visual novo e correções',
    mudancas: [
      'Barra de áreas redesenhada, cores do tema escuro corrigidas e campos com destaque ao digitar.',
      'Corrigido: refazer o plano de treino recomeçava a contagem das semanas e podia descartar dados ao sincronizar entre aparelhos.',
    ],
  },
  {
    versao: '6',
    data: '2026-08-18',
    titulo: 'Área de treino',
    mudancas: [
      'Nova área 🏋️ Treino: um coach monta sua semana cobrindo força, potência, equilíbrio, mobilidade e cardio, você registra as cargas e os minutos, e ele dá nota por capacidade e evolui a semana seguinte pelos seus números.',
    ],
  },
  {
    versao: '5',
    data: '2026-08-17',
    titulo: 'Remédios',
    mudancas: [
      'Nova área 💊 Remédios: o que você toma e o que já tomou. Encerrar não apaga — vira histórico, porque é o que costuma explicar uma virada no exame.',
      'A análise e a conversa passaram a receber essa lista junto dos exames.',
    ],
  },
];
