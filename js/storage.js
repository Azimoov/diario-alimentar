// storage.js — estado do app em localStorage (local-first, fica no aparelho).
// Inclui export/import JSON para você ser dono do dado.

window.Store = (function () {
  const KEY = 'diario_kcal_v1';
  const SCHEMA = 1;

  function defaults() {
    return {
      schema: SCHEMA,
      profile: { sex: 'm', age: null, height: null, weight: null, activity: 1.55 },
      goal: {
        pace: 0.5,          // kg/semana
        deficit: null,      // se null, deriva de pace; se número, sobrepõe
        manualKcal: null,   // sobrepõe tudo se preenchido
        proteinPerKg: 1.8,
        fatPct: 0.25,
        useAdaptive: false, // usar TDEE real observado como base da meta
      },
      days: {},             // 'YYYY-MM-DD' -> { items:[{raw,foodId,grams}], weight:null }
      weights: {},          // 'YYYY-MM-DD' -> kg (peso corporal)
      bodyComp: {},         // 'YYYY-MM-DD' -> { fat:%, lean:% } (composição corporal, campos opcionais)
      // ---- área Exames ----
      labExams: [],         // [{id, date, name, norm, value, num, unit, refLow, refHigh, obs}] — 1 linha por analito
      imgExams: [],         // [{id, date, name, norm, place, report}] — exames de imagem c/ resumo do laudo
      examReminders: [],    // [{id, name, norm, kind:'lab'|'img', months, baseDate}] — "repetir a cada N meses"
      // ---- área Remédios ----
      // O que foi ENCERRADO continua na lista, com `end` preenchido. Não é
      // descuido: "o colesterol subiu" só faz sentido junto de "parei a
      // estatina em março". Apagar o remédio apagaria a explicação do exame.
      meds: [],             // [{id, name, norm, kind:'remedio'|'suplemento', dose, schedule, reason, start, end, endReason, obs}]
      // ---- área Treino (coach) ----
      // plano.semana é a semana CORRENTE: a pessoa preenche `feito` em cada
      // item e, ao fechar, a semana vai para semanasFechadas com os registros
      // — é esse histórico que deixa o coach progredir carga sem chutar.
      treino: {
        perfil: null,         // {objetivo, diasSemana, local, experiencia, limitacoes}
        plano: null,          // {criadoEm, apresentacao, semana:{numero, bloco, ..., sessoes:[{itens:[{... , feito}]}]}}
        semanasFechadas: [],  // [{...semana, fechadaEm}] — identidade = numero da semana
        avaliacoes: [],       // [{id, at, semanaNumero, notas, texto, melhorias, modelo}] mais recente primeiro
      },
      // ---- área Métricas de saúde (Apple Health) ----
      health: { daily: {}, lastImportAt: null }, // daily: 'YYYY-MM-DD' -> {steps, distKm, kcalOut, kcalBasal, exMin, hrRest, hrv, vo2max, sleepMin}
      // ---- área IA ----
      // Histórico COMPLETO das análises (a mais recente primeiro). Antes só a
      // última era guardada, num campo `analysis`; a migração no load() move
      // aquela análise para cá, então quem já usava não perde a que tinha.
      analyses: [],         // [{id, at, text, modelo}]
      // Conversa com a IA sobre os próprios dados. Uma conversa corrente por
      // aparelho; "nova conversa" arquiva a atual limpando esta lista.
      chat: { mensagens: [] }, // [{role:'user'|'assistant', text, at}]
      customFoods: [],      // {id:'c1', name, kcal, prot, carb, fat, fiber}
      sharedFoods: [],      // cache da base COMUM (compartilhada via proxy)
      // Fase 2 (foto): endereço do SEU proxy + senha do app. A chave da API
      // fica só no proxy — aqui nunca entra chave nenhuma.
      // autoBackup: diário cifrado no aparelho e guardado no proxy.
      // mealsFechados: refeições que o usuário deixou recolhidas na aba Hoje
      // account: conta com login (e-mail + sessão). A senha não fica guardada
      // em lugar nenhum — só o token de sessão devolvido pelo servidor.
      settings: {
        proxyUrl: '', proxyToken: '', autoBackup: false, lastBackupAt: null, mealsFechados: [],
        // espelho do envio ao Open Brain (a verdade fica no servidor)
        openBrain: false,
        account: { email: null, session: null, lastSyncAt: null },
      },
      createdAt: new Date().toISOString(),
    };
  }

  let state = null;

  // Chamada no load() E no import: um arquivo de fora pode trazer `treino`
  // ausente, nulo ou pela metade (backup antigo, arquivo editado à mão), e a
  // tela de treino lê `perfil`/`semanasFechadas` direto. Sem isto, importar
  // um desses quebrava a renderização DEPOIS de o import já ter dado certo —
  // e o app dizia "não consegui ler o arquivo", que era mentira.
  function normalizarTreino() {
    const d = defaults();
    const t = (state.treino && typeof state.treino === 'object') ? state.treino : {};
    state.treino = Object.assign({}, d.treino, t);
    if (!Array.isArray(state.treino.semanasFechadas)) state.treino.semanasFechadas = [];
    if (!Array.isArray(state.treino.avaliacoes)) state.treino.avaliacoes = [];
    const pl = state.treino.plano;
    if (!pl || typeof pl !== 'object' || !pl.semana || !Array.isArray(pl.semana.sessoes)) state.treino.plano = null;
    if (state.treino.perfil && typeof state.treino.perfil !== 'object') state.treino.perfil = null;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : defaults();
    } catch (e) {
      console.warn('Falha ao ler dados salvos, começando do zero.', e);
      state = defaults();
    }
    // migração leve: garante campos novos
    const d = defaults();
    state.profile = Object.assign({}, d.profile, state.profile || {});
    state.goal = Object.assign({}, d.goal, state.goal || {});
    state.days = state.days || {};
    state.weights = state.weights || {};
    state.bodyComp = state.bodyComp || {};
    state.labExams = state.labExams || [];
    state.imgExams = state.imgExams || [];
    state.examReminders = state.examReminders || [];
    state.meds = state.meds || [];
    normalizarTreino();
    state.health = Object.assign({}, d.health, state.health || {});
    state.health.daily = state.health.daily || {};
    state.customFoods = state.customFoods || [];
    state.sharedFoods = state.sharedFoods || [];
    // análises: campo único antigo (`analysis`) vira o primeiro item da lista.
    // Roda uma vez só: depois de migrar, o campo antigo é apagado.
    state.analyses = state.analyses || [];
    if (state.analysis && state.analysis.text) {
      const jaTem = state.analyses.some(a => a.at === state.analysis.at);
      if (!jaTem) state.analyses.unshift(Object.assign({ id: 'a' + Date.parse(state.analysis.at || '') }, state.analysis));
    }
    delete state.analysis;
    state.chat = Object.assign({ mensagens: [] }, state.chat || {});
    state.chat.mensagens = state.chat.mensagens || [];
    state.settings = Object.assign({}, d.settings, state.settings || {});
    state.settings.account = Object.assign({}, d.settings.account, state.settings.account || {});
    return state;
  }

  function get() { return state || load(); }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('Não consegui salvar (armazenamento cheio ou bloqueado). Faça um export de backup.');
      console.error(e);
    }
  }

  function day(dateStr) {
    if (!state.days[dateStr]) state.days[dateStr] = { items: [] };
    return state.days[dateStr];
  }

  // ---- alimentos do usuário (inclui receitas) ----
  // Receitas são alimentos custom com um campo extra `recipe`:
  //   { ingredients: [{foodId, grams}], finalWeight }  — os valores por 100 g
  // são derivados da soma dos ingredientes ÷ peso final.
  function addCustomFood(food) {
    const id = 'c' + Date.now().toString(36);
    const rec = {
      id,
      name: food.name,
      norm: window.Parser.normalize(food.name),
      cat: 0,
      custom: true,
      kcal: numOrNull(food.kcal), prot: numOrNull(food.prot),
      carb: numOrNull(food.carb), fat: numOrNull(food.fat), fiber: numOrNull(food.fiber),
      recipe: food.recipe || null,
      labelPhoto: food.labelPhoto || null, // miniatura do rótulo (data URL)
    };
    state.customFoods.push(rec);
    save();
    return rec;
  }
  function updateCustomFood(id, patch) {
    const f = state.customFoods.find(x => x.id === id);
    if (!f) return;
    Object.assign(f, patch);
    if (patch.name) f.norm = window.Parser.normalize(patch.name);
    save();
  }
  function removeCustomFood(id) {
    state.customFoods = state.customFoods.filter(x => x.id !== id);
    save();
  }
  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function setSharedFoods(list) {
    state.sharedFoods = Array.isArray(list) ? list : [];
    save();
  }

  // Base combinada (TACO/TBCA/USDA + base comum + custom) para o parser.
  // Se o usuário tem um custom com o MESMO nome de um item da base comum
  // (ex.: quem criou e compartilhou), o custom local vence — evita duplicata.
  function combinedFoods() {
    const taco = (window.FOOD_DB && window.FOOD_DB.foods) || [];
    const customNorms = new Set((state.customFoods || []).map(f => f.norm));
    const shared = (state.sharedFoods || [])
      .filter(f => f && f.name && f.kcal != null
        && !customNorms.has(window.Parser.normalize(f.name)))
      .map(f => Object.assign({ src: 'comum', cat: 0 }, f));
    return taco.concat(shared, state.customFoods || []);
  }

  // ---- export / import ----
  // O TOKEN DE SESSÃO nunca sai daqui: ele é uma credencial viva (vale 90
  // dias) e não é "dado do usuário". Sem isto ele iria para o arquivo que a
  // pessoa exporta e manda por e-mail, e para o blob guardado na nuvem.
  // `opts.paraNuvem` também tira o catálogo COMUM de alimentos, que é
  // compartilhado e vive no servidor — não é dado privado da conta.
  function exportJSON(opts) {
    const copia = JSON.parse(JSON.stringify(state));
    if (copia.settings && copia.settings.account) delete copia.settings.account.session;
    if (opts && opts.paraNuvem) delete copia.sharedFoods;
    return JSON.stringify(copia, null, 2);
  }
  function importJSON(text, mode) {
    const incoming = JSON.parse(text); // pode lançar — tratado por quem chama
    if (typeof incoming !== 'object' || !incoming) throw new Error('Arquivo inválido.');
    // A CONTA/SESSÃO é deste aparelho e nunca vem de fora: um backup carrega o
    // token de quem o gerou, e aplicá-lo deslogaria (ou pior, logaria como
    // outra pessoa). Guardamos o valor local e recolocamos depois.
    const contaLocal = (state && state.settings && state.settings.account)
      ? Object.assign({}, state.settings.account) : null;
    if (mode === 'merge') {
      // Dias precisam de cuidado: dois aparelhos escrevem no MESMO dia, e um
      // Object.assign trocaria o dia inteiro (perdendo os itens do outro lado).
      // Juntamos item a item, contando repetições por assinatura: quem comeu
      // dois cafés iguais continua com dois, mas o mesmo item vindo dos dois
      // lados não vira quatro.
      const assinatura = (it) => [it.foodId, it.grams, it.meal || '', it.foodText || it.raw || ''].join('|');
      const mesclarItens = (locais, vindos) => {
        const conta = new Map();
        locais.forEach(it => conta.set(assinatura(it), (conta.get(assinatura(it)) || 0) + 1));
        const extras = [];
        const vistos = new Map();
        vindos.forEach(it => {
          const k = assinatura(it);
          vistos.set(k, (vistos.get(k) || 0) + 1);
          if (vistos.get(k) > (conta.get(k) || 0)) extras.push(it);
        });
        return locais.concat(extras);
      };
      const diasVindos = incoming.days || {};
      Object.keys(diasVindos).forEach(date => {
        const vindo = diasVindos[date] || {};
        const atual = state.days[date];
        if (!atual) { state.days[date] = vindo; return; }
        state.days[date] = Object.assign({}, vindo, atual, {
          items: mesclarItens(atual.items || [], vindo.items || []),
        });
      });
      state.weights = Object.assign({}, state.weights, incoming.weights || {});
      state.bodyComp = Object.assign({}, state.bodyComp, incoming.bodyComp || {});
      // listas de exames/lembretes: mescla por id (não duplica o que já existe)
      const mergeById = (cur, inc) => {
        const ids = new Set(cur.map(x => x && x.id));
        (Array.isArray(inc) ? inc : []).forEach(x => { if (x && x.id && !ids.has(x.id)) cur.push(x); });
      };
      mergeById(state.labExams, incoming.labExams);
      mergeById(state.imgExams, incoming.imgExams);
      mergeById(state.examReminders, incoming.examReminders);
      mergeById(state.meds, incoming.meds);
      // Treino: só existe UMA semana corrente por vez — mesclar duas viraria
      // um plano que ninguém montou. Fica a mais AVANÇADA (maior número);
      // semanas fechadas juntam pelo número (a identidade de uma semana) e
      // avaliações por id, voltando à ordem "mais recente primeiro".
      const tIn = incoming.treino || {};
      const numSemana = (pl) => (pl && pl.semana && pl.semana.numero) || 0;
      if (numSemana(tIn.plano) > numSemana(state.treino.plano)) {
        state.treino.plano = tIn.plano;
        if (tIn.perfil) state.treino.perfil = tIn.perfil;
      }
      if (!state.treino.perfil && tIn.perfil) state.treino.perfil = tIn.perfil;
      const numerosFechados = new Set(state.treino.semanasFechadas.map(x => x && x.numero));
      (Array.isArray(tIn.semanasFechadas) ? tIn.semanasFechadas : []).forEach(x => {
        if (x && x.numero != null && !numerosFechados.has(x.numero)) state.treino.semanasFechadas.push(x);
      });
      state.treino.semanasFechadas.sort((a, b) => (a.numero || 0) - (b.numero || 0));
      mergeById(state.treino.avaliacoes, tIn.avaliacoes);
      state.treino.avaliacoes.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      // análises: juntam-se por id e voltam à ordem "mais recente primeiro".
      // Sem isto, "Juntar os dois" descartaria em silêncio as análises feitas
      // no outro aparelho.
      state.analyses = state.analyses || [];
      mergeById(state.analyses, incoming.analyses);
      state.analyses.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      // Conversa é um FIO: intercalar duas conversas diferentes produziria um
      // diálogo que nunca aconteceu. Ficamos com a mais longa — a mais
      // completa — em vez de misturar as duas.
      const msgsVindas = ((incoming.chat || {}).mensagens) || [];
      state.chat = state.chat || { mensagens: [] };
      if (msgsVindas.length > (state.chat.mensagens || []).length) state.chat = { mensagens: msgsVindas };
      if (incoming.health && incoming.health.daily) {
        state.health.daily = Object.assign({}, state.health.daily, incoming.health.daily);
        if (incoming.health.lastImportAt) state.health.lastImportAt = incoming.health.lastImportAt;
      }
      // custom foods: evita duplicar por nome
      const names = new Set(state.customFoods.map(f => f.norm));
      (incoming.customFoods || []).forEach(f => {
        if (!names.has(f.norm)) state.customFoods.push(f);
      });
      if (incoming.profile) state.profile = Object.assign({}, state.profile, incoming.profile);
      if (incoming.goal) state.goal = Object.assign({}, state.goal, incoming.goal);
    } else {
      // substitui tudo
      state = Object.assign(defaults(), incoming);
      state.schema = SCHEMA;
    }
    state.settings = Object.assign({}, defaults().settings, state.settings || {});
    state.settings.account = contaLocal || defaults().settings.account;
    normalizarTreino();
    save();
    return state;
  }

  function reset() { state = defaults(); save(); return state; }

  return {
    load, get, save, day, defaults,
    addCustomFood, updateCustomFood, removeCustomFood, combinedFoods,
    setSharedFoods, exportJSON, importJSON, reset,
  };
})();
