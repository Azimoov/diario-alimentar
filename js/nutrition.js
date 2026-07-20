// nutrition.js — cálculos de meta (Mifflin-St Jeor), TDEE, macros e
// nutrientes por item. Fórmulas explícitas; nada de valor inventado.

window.Nutrition = (function () {
  const ACTIVITY = {
    1.2: 'Sedentário (pouco ou nenhum exercício)',
    1.375: 'Leve (1–3x/semana)',
    1.55: 'Moderado (3–5x/semana)',
    1.725: 'Intenso (6–7x/semana)',
    1.9: 'Muito intenso (2x/dia, trabalho físico)',
  };

  // ~7700 kcal por kg de gordura corporal.
  const KCAL_PER_KG = 7700;

  // Piso de segurança padrão (ajustável). Referência conservadora:
  // ~1500 kcal/dia p/ homens, ~1200 p/ mulheres. Abaixo disso, alerta.
  function floorKcal(sex) { return sex === 'f' ? 1200 : 1500; }

  // Taxa Metabólica Basal — Mifflin-St Jeor.
  function bmr(profile) {
    const { sex, weight, height, age } = profile;
    if (![weight, height, age].every(v => typeof v === 'number' && v > 0)) return null;
    const base = 10 * weight + 6.25 * height - 5 * age;
    return sex === 'f' ? base - 161 : base + 5;
  }

  function tdee(profile) {
    const b = bmr(profile);
    if (b == null) return null;
    const act = Number(profile.activity) || 1.2;
    return b * act;
  }

  // Meta calórica a partir do ritmo de perda (kg/semana) ou déficit manual.
  // pace em kg/sem -> déficit diário = pace * 7700 / 7.
  function deficitFromPace(pace) { return (Number(pace) || 0) * KCAL_PER_KG / 7; }

  // baseTdee (opcional): sobrepõe o TDEE da fórmula — usado pelo modo
  // adaptativo, que passa o TDEE real observado.
  function goalKcal(profile, goal, baseTdee) {
    if (goal && goal.manualKcal != null && goal.manualKcal !== '') return Number(goal.manualKcal);
    const t = baseTdee != null ? baseTdee : tdee(profile);
    if (t == null) return null;
    const deficit = goal && goal.deficit != null ? Number(goal.deficit) : deficitFromPace(goal ? goal.pace : 0.5);
    return Math.round(t - deficit);
  }

  // Alvos de macro. Proteína por kg de peso; gordura como % das kcal; carbo pega o resto.
  // Retorna gramas-alvo de P/C/G e as kcal de cada um.
  function macroTargets(profile, goal, kcalTarget) {
    const weight = Number(profile.weight);
    const kcal = Number(kcalTarget);
    if (!(weight > 0) || !(kcal > 0)) return null;
    const protPerKg = goal && goal.proteinPerKg != null ? Number(goal.proteinPerKg) : 1.8;
    const fatPct = goal && goal.fatPct != null ? Number(goal.fatPct) : 0.25; // fração das kcal

    const protG = Math.round(protPerKg * weight);
    const protKcal = protG * 4;
    const fatKcal = kcal * fatPct;
    const fatG = Math.round(fatKcal / 9);
    const carbKcal = Math.max(0, kcal - protKcal - fatKcal);
    const carbG = Math.round(carbKcal / 4);

    return {
      protG, carbG, fatG,
      protKcal: Math.round(protKcal), carbKcal: Math.round(carbKcal), fatKcal: Math.round(fatKcal),
      protPerKg, fatPct,
    };
  }

  // ---- TDEE adaptativo (gasto REAL observado) ----------------------------
  // TDEE_real ≈ média de kcal ingeridas + 7700 × perda de peso por dia.
  // Usa regressão linear sobre as pesagens da janela (robusto a oscilação
  // diária de água/glicogênio). Absorve o viés sistemático de sub-registro.
  // dailyKcal: {'YYYY-MM-DD': kcal}; weights: {'YYYY-MM-DD': kg}
  function adaptiveTDEE(dailyKcal, weights, opts) {
    const o = Object.assign({
      windowDays: 28,    // olha os últimos 28 dias
      minLoggedDays: 10, // mínimo de dias com registro válido
      minSpanDays: 10,   // intervalo mínimo entre 1ª e última pesagem
      minKcalDay: 500,   // dias abaixo disso = provavelmente incompletos
      todayStr: null,    // p/ testes
    }, opts || {});
    const iso = (d) => { const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
    const todayStr = o.todayStr || iso(new Date());
    const startD = new Date(todayStr + 'T12:00:00');
    startD.setDate(startD.getDate() - (o.windowDays - 1));
    const startStr = iso(startD);
    const dayNum = (ds) => Math.round((new Date(ds + 'T12:00:00') - new Date(startStr + 'T12:00:00')) / 86400000);

    const kcals = [];
    let excluded = 0;
    Object.keys(dailyKcal || {}).forEach(ds => {
      if (ds < startStr || ds > todayStr) return;
      const k = dailyKcal[ds];
      if (!(k > 0)) return;
      if (k < o.minKcalDay) { excluded++; return; }
      kcals.push(k);
    });

    const ws = Object.keys(weights || {})
      .filter(ds => ds >= startStr && ds <= todayStr && weights[ds] > 0)
      .sort()
      .map(ds => ({ x: dayNum(ds), y: Number(weights[ds]) }));

    const res = {
      ok: false, windowDays: o.windowDays,
      daysUsed: kcals.length, excludedDays: excluded,
      weighIns: ws.length, spanDays: ws.length ? ws[ws.length - 1].x - ws[0].x : 0,
    };
    if (kcals.length < o.minLoggedDays) { res.reason = 'poucos_dias'; return res; }
    if (ws.length < 2 || res.spanDays < o.minSpanDays) { res.reason = 'poucas_pesagens'; return res; }

    const meanIntake = kcals.reduce((a, b) => a + b, 0) / kcals.length;
    // regressão linear peso ~ dia (slope em kg/dia)
    const n = ws.length;
    const mx = ws.reduce((a, p) => a + p.x, 0) / n;
    const my = ws.reduce((a, p) => a + p.y, 0) / n;
    let num = 0, den = 0;
    ws.forEach(p => { num += (p.x - mx) * (p.y - my); den += (p.x - mx) * (p.x - mx); });
    const slope = den ? num / den : 0;

    res.ok = true;
    res.meanIntake = Math.round(meanIntake);
    res.slopeKgWeek = Math.round(slope * 7 * 100) / 100;
    res.tdee = Math.round(meanIntake - KCAL_PER_KG * slope);
    // fora da faixa fisiológica plausível → provável dado ruim (ex.: só
    // metade dos dias registrados, pesagem errada) — sinaliza, não esconde
    res.suspeito = res.tdee < 1000 || res.tdee > 5500;
    return res;
  }

  // Nutrientes de um item = valores/100 g * gramas/100.
  function itemNutrients(food, grams) {
    if (!food || !(grams > 0)) return { kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0, hasKcal: !!(food && food.kcal != null) };
    const f = grams / 100;
    const n = v => (v == null ? 0 : v * f);
    return {
      kcal: n(food.kcal), prot: n(food.prot), carb: n(food.carb),
      fat: n(food.fat), fiber: n(food.fiber),
      hasKcal: food.kcal != null,
    };
  }

  function sumNutrients(list) {
    return list.reduce((a, n) => ({
      kcal: a.kcal + n.kcal, prot: a.prot + n.prot,
      carb: a.carb + n.carb, fat: a.fat + n.fat, fiber: a.fiber + n.fiber,
    }), { kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0 });
  }

  return {
    ACTIVITY, KCAL_PER_KG, floorKcal, bmr, tdee, adaptiveTDEE,
    deficitFromPace, goalKcal, macroTargets, itemNutrients, sumNutrients,
  };
})();
