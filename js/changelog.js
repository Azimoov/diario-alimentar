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
