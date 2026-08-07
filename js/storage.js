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
      // ---- área Métricas de saúde (Apple Health) ----
      health: { daily: {}, lastImportAt: null }, // daily: 'YYYY-MM-DD' -> {steps, distKm, kcalOut, kcalBasal, exMin, hrRest, hrv, vo2max, sleepMin}
      analysis: null,       // {at, text, modelo} — última análise IA (guardada p/ reler offline)
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
        account: { email: null, session: null, lastSyncAt: null },
      },
      createdAt: new Date().toISOString(),
    };
  }

  let state = null;

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
    state.health = Object.assign({}, d.health, state.health || {});
    state.health.daily = state.health.daily || {};
    state.customFoods = state.customFoods || [];
    state.sharedFoods = state.sharedFoods || [];
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
  function exportJSON() {
    return JSON.stringify(state, null, 2);
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
