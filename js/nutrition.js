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

  function goalKcal(profile, goal) {
    if (goal && goal.manualKcal != null && goal.manualKcal !== '') return Number(goal.manualKcal);
    const t = tdee(profile);
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
    ACTIVITY, KCAL_PER_KG, floorKcal, bmr, tdee,
    deficitFromPace, goalKcal, macroTargets, itemNutrients, sumNutrients,
  };
})();
