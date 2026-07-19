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
      },
      days: {},             // 'YYYY-MM-DD' -> { items:[{raw,foodId,grams}], weight:null }
      weights: {},          // 'YYYY-MM-DD' -> kg (peso corporal)
      customFoods: [],      // {id:'c1', name, kcal, prot, carb, fat, fiber}
      // Fase 2 (foto): endereço do SEU proxy + senha do app. A chave da API
      // fica só no proxy — aqui nunca entra chave nenhuma.
      settings: { proxyUrl: '', proxyToken: '' },
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
    state.customFoods = state.customFoods || [];
    state.settings = Object.assign({}, d.settings, state.settings || {});
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

  // Base combinada (TACO + custom) para o parser.
  function combinedFoods() {
    const taco = (window.FOOD_DB && window.FOOD_DB.foods) || [];
    return taco.concat(state.customFoods || []);
  }

  // ---- export / import ----
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }
  function importJSON(text, mode) {
    const incoming = JSON.parse(text); // pode lançar — tratado por quem chama
    if (typeof incoming !== 'object' || !incoming) throw new Error('Arquivo inválido.');
    if (mode === 'merge') {
      state.days = Object.assign({}, state.days, incoming.days || {});
      state.weights = Object.assign({}, state.weights, incoming.weights || {});
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
    save();
    return state;
  }

  function reset() { state = defaults(); save(); return state; }

  return {
    load, get, save, day, defaults,
    addCustomFood, updateCustomFood, removeCustomFood, combinedFoods,
    exportJSON, importJSON, reset,
  };
})();
