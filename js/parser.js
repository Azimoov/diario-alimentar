// parser.js — entende linhas em linguagem natural ("100 g patinho",
// "meia xicara de feijao", "1 ovo") e casa com a base de alimentos.
// Sem IA, sem rede: só regex + normalização + busca. (Fase 2/foto entraria
// atrás de um proxy — ver README; NÃO implementado aqui.)

window.Parser = (function () {
  let FOODS = []; // base combinada (TACO + alimentos do usuário), setada pelo app

  // Mesma normalização usada na geração da base: minúsculas, sem acento,
  // sem pontuação, espaços colapsados.
  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Normalização LEVE para interpretar quantidade/unidade: mantém dígitos e
  // os separadores . , / (senão "0,5", "1/2" e "120g" quebram). Só é usada
  // antes de extrair número+unidade; o nome do alimento é normalizado depois.
  function prep(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s.,/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // singulariza plural simples ("ovos"->"ovo", "bananas"->"banana")
  function sing(w) { return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w; }

  function setFoods(list) { FOODS = list || []; }
  function getFoods() { return FOODS; }
  function getFood(id) {
    if (id == null) return null;
    return FOODS.find(f => String(f.id) === String(id)) || null;
  }

  // conectores/preposições ignorados na comparação
  const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'em', 'a', 'o']);

  // ---- pontuação de similaridade nome<->consulta -------------------------
  // Retorna { score, matched } — quantos termos da consulta casaram e quão bem.
  function scoreFood(qTokens, food) {
    const fWords = food.norm.split(' ').filter(Boolean);
    let score = 0, matched = 0;
    for (const qt of qTokens) {
      const qs = sing(qt);
      let best = 0;
      for (let wi = 0; wi < fWords.length; wi++) {
        const w = fWords[wi], ws = sing(w);
        const posPenalty = wi * 0.3;
        if (w === qt || ws === qs) best = Math.max(best, 10 - posPenalty);
        else if (qt.length >= 3 && (w.startsWith(qt) || ws.startsWith(qs))) best = Math.max(best, 4 - posPenalty);
        else if (w.length >= 3 && (qt.startsWith(w) || qs.startsWith(ws))) best = Math.max(best, 2.5 - posPenalty);
      }
      if (best > 0) { matched++; score += best; }
    }
    score -= Math.max(0, fWords.length - qTokens.length) * 0.4; // prefere conciso
    if (sing(fWords[0]) === sing(qTokens[0]) || sing(fWords[0]).startsWith(sing(qTokens[0]))) score += 2;
    return { score, matched };
  }

  // Retorna { status, foodId, candidates:[{id,score}] } para um texto de alimento.
  function matchFood(foodText) {
    const norm = normalize(foodText);
    if (!norm) return { status: 'not_found', foodId: null, candidates: [] };

    const qTokens = norm.split(' ').filter(t => t && !STOPWORDS.has(t));
    if (!qTokens.length) return { status: 'not_found', foodId: null, candidates: [] };
    const normSing = qTokens.map(sing).join(' ');

    // Alimento/receita DO USUÁRIO com nome exatamente igual ao digitado:
    // casa direto — quem cadastrou sabe o que quis dizer.
    const exactCustom = FOODS.find(f => f.custom && (f.norm === norm || f.norm === normSing));
    if (exactCustom) {
      return { status: 'matched', foodId: exactCustom.id, candidates: [{ id: exactCustom.id, score: 999 }] };
    }

    // atalho por sinônimo (escolha-padrão verificada); tenta forma singular
    let synId = null;
    const SYN = window.SYNONYMS || {};
    if (Object.prototype.hasOwnProperty.call(SYN, norm)) synId = SYN[norm];
    else if (Object.prototype.hasOwnProperty.call(SYN, normSing)) synId = SYN[normSing];

    // 1ª passada (estrita): todos os termos precisam casar
    const scored = [];
    const partial = [];
    for (const f of FOODS) {
      const r = scoreFood(qTokens, f);
      if (r.matched === qTokens.length && r.score > 0) scored.push({ id: f.id, score: r.score });
      else if (r.matched > 0) partial.push({ id: f.id, score: r.score, matched: r.matched });
    }
    scored.sort((a, b) => b.score - a.score);
    let candidates = scored.slice(0, 8);

    // 2ª passada (parcial): p/ nomes descritivos (ex. vindos de foto) que têm
    // palavras a mais ("arroz branco cozido"). Exige a maioria dos termos e
    // NUNCA resolve sozinha: entra sempre como ambígua (usuário confirma).
    if (!candidates.length && qTokens.length >= 2) {
      const minMatched = Math.ceil(qTokens.length / 2);
      const loose = partial
        .filter(c => c.matched >= minMatched)
        .sort((a, b) => (b.matched - a.matched) || (b.score - a.score))
        .slice(0, 8);
      if (loose.length) {
        return {
          status: 'ambiguous',
          foodId: synId != null && getFood(synId) ? synId : loose[0].id,
          candidates: loose,
        };
      }
    }

    if (synId != null && getFood(synId)) {
      // sinônimo manda; garante que ele apareça no topo dos candidatos
      const rest = candidates.filter(c => String(c.id) !== String(synId));
      return {
        status: 'matched',
        foodId: synId,
        candidates: [{ id: synId, score: 999 }, ...rest].slice(0, 8),
      };
    }

    if (!candidates.length) return { status: 'not_found', foodId: null, candidates: [] };

    const best = candidates[0];
    const second = candidates[1];
    // ambíguo se o 2º concorrente é quase tão bom quanto o 1º
    const ambiguous = second && second.score / best.score > 0.78;
    return {
      status: ambiguous ? 'ambiguous' : 'matched',
      foodId: best.id,
      candidates,
    };
  }

  // ---- interpreta quantidade + unidade -----------------------------------
  // Converte "1/2", "0,5", "meia", "2" no começo da string.
  function extractQuantity(s) {
    // fração tipo 1/2, 3/4
    let m = s.match(/^(\d+)\s*\/\s*(\d+)/);
    if (m) return { qty: Number(m[1]) / Number(m[2]), rest: s.slice(m[0].length).trim() };
    // decimal com vírgula ou ponto, ou inteiro (sem \b p/ pegar "120g" grudado)
    m = s.match(/^(\d+(?:[.,]\d+)?)/);
    if (m) return { qty: Number(m[1].replace(',', '.')), rest: s.slice(m[0].length).trim() };
    // palavra-número (meia, um, dois...)
    const w = s.split(' ')[0];
    if (window.NUMBER_WORDS && window.NUMBER_WORDS[w] != null) {
      return { qty: window.NUMBER_WORDS[w], rest: s.slice(w.length).trim() };
    }
    return { qty: null, rest: s };
  }

  // tenta casar uma unidade no começo de `rest`. Retorna {kind, grams, name, rest}.
  function extractUnit(rest) {
    const M = window.MEASURES;
    // ordena chaves por tamanho desc p/ casar "colher de sopa" antes de "colher"
    const tryTable = (table, kind) => {
      const keys = Object.keys(table).sort((a, b) => b.length - a.length);
      for (const k of keys) {
        const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (re.test(rest)) return { kind, gramsPer: table[k], name: k, rest: rest.slice(k.length).trim() };
      }
      return null;
    };
    return tryTable(M.mass, 'mass') || tryTable(M.volume, 'volume')
      || tryTable(M.household, 'household')
      || (function () {
        for (const a of M.ambiguous) {
          const re = new RegExp('^' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
          if (re.test(rest)) return { kind: 'ambiguous', gramsPer: null, name: a, rest: rest.slice(a.length).trim() };
        }
        return null;
      })();
  }

  // remove conectores iniciais: "de", "da", "do", "dos", "das"
  function stripConnector(s) {
    return s.replace(/^(de|da|do|dos|das)\s+/, '').trim();
  }

  function unitWeightFor(foodNorm) {
    const uw = window.MEASURES.unitWeights;
    const words = foodNorm.split(' ').filter(Boolean);
    // tenta chave de 2 palavras ("pao frances") depois 1 palavra
    for (let i = 0; i < words.length; i++) {
      const two = words.slice(i, i + 2).join(' ');
      if (uw[two] != null) return uw[two];
    }
    for (const w of words) if (uw[w] != null) return uw[w];
    return null;
  }

  // ---- interpreta uma linha inteira --------------------------------------
  // Retorna objeto completo com gramas sugeridas, alimento sugerido e flags.
  function parseLine(raw) {
    const flags = [];
    const p = prep(raw);            // mantém números/decimais/frações
    if (!p) return null;

    const q = extractQuantity(p);
    let rest = q.rest;
    const unit = extractUnit(rest);
    if (unit) rest = unit.rest;
    let foodText = stripConnector(rest);

    // se não sobrou texto de alimento mas havia unidade tipo "de", trata tudo
    if (!foodText) foodText = rest;

    // ---- decide as gramas ----
    let grams = null;
    let confidence = 'exact'; // exact | estimate | needs_grams
    const qty = q.qty;

    if (unit && unit.kind === 'mass') {
      if (qty == null) { grams = null; confidence = 'needs_grams'; flags.push({ level: 'warn', msg: 'Informe a quantidade.' }); }
      else grams = qty * unit.gramsPer;
    } else if (unit && unit.kind === 'volume') {
      grams = (qty == null ? 1 : qty) * unit.gramsPer;
      confidence = 'estimate';
      flags.push({ level: 'info', msg: 'Volume convertido em gramas assumindo densidade ~1 — confira.' });
    } else if (unit && unit.kind === 'household') {
      grams = (qty == null ? 1 : qty) * unit.gramsPer;
      confidence = 'estimate';
      flags.push({ level: 'info', msg: 'Medida caseira (' + unit.name + ') — estimativa, confira as gramas.' });
    } else if (unit && unit.kind === 'ambiguous') {
      grams = null; confidence = 'needs_grams';
      flags.push({ level: 'warn', msg: 'Medida "' + unit.name + '" é imprecisa — informe as gramas.' });
    } else if (qty != null) {
      // número sem unidade => contagem ("1 ovo", "2 bananas")
      const uw = unitWeightFor(foodText);
      if (uw != null) {
        grams = qty * uw;
        confidence = 'estimate';
        flags.push({ level: 'info', msg: 'Peso por unidade estimado (' + uw + ' g) — confira.' });
      } else {
        grams = null; confidence = 'needs_grams';
        flags.push({ level: 'warn', msg: 'Não sei o peso por unidade — informe as gramas.' });
      }
    } else {
      // sem quantidade e sem unidade: assume 100 g (referência da tabela)
      grams = 100; confidence = 'estimate';
      flags.push({ level: 'info', msg: 'Quantidade não informada — assumi 100 g.' });
    }

    // ---- casa o alimento ----
    const match = matchFood(foodText);
    if (match.status === 'not_found') {
      flags.push({ level: 'warn', msg: 'Alimento não encontrado na base — escolha ou cadastre.' });
    } else if (match.status === 'ambiguous') {
      flags.push({ level: 'warn', msg: 'Vários alimentos parecidos — confirme qual é.' });
    }

    return {
      raw,
      foodText,
      qty,
      unit: unit ? unit.name : null,
      unitKind: unit ? unit.kind : null,
      grams,
      confidence,
      foodId: match.foodId,
      matchStatus: match.status,
      candidates: match.candidates,
      flags,
    };
  }

  function parseText(text) {
    return String(text || '')
      .split(/\r?\n|;|,\s*(?=\d)|\se\s(?=\d)/) // quebra por linha, ; ou vírgula antes de número
      .map(s => s.trim())
      .filter(Boolean)
      .map(parseLine)
      .filter(Boolean);
  }

  return { normalize, setFoods, getFoods, getFood, matchFood, parseLine, parseText };
})();
