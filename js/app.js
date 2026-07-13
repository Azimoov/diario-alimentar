// app.js — controla a interface: registro do dia, dashboard, histórico,
// perfil/meta e dados (export/import + alimentos do usuário).

window.App = (function () {
  let S;            // estado (Store)
  let currentDate;  // 'YYYY-MM-DD' visível na aba Hoje

  // ---------- utilidades ----------
  function isoLocal(d) {
    const t = new Date(d);
    t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
    return t.toISOString().slice(0, 10);
  }
  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return isoLocal(d);
  }
  function fmtBR(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  function round(n, k) { const p = Math.pow(10, k || 0); return Math.round((n || 0) * p) / p; }
  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(c => {
      if (c == null || c === false) return; // ignora filhos condicionais vazios
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function $(sel) { return document.querySelector(sel); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---------- init ----------
  function init() {
    S = window.Store.load();
    window.Parser.setFoods(window.Store.combinedFoods());
    currentDate = isoLocal(new Date());
    bindTabs();
    renderAll();
  }

  function refreshFoods() { window.Parser.setFoods(window.Store.combinedFoods()); }

  function renderAll() {
    renderHoje();
    renderHist();
    renderPerfil();
    renderDados();
  }

  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        $('#tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  // ================= ABA HOJE =================
  function currentDay() {
    if (!S.days[currentDate]) S.days[currentDate] = { items: [] };
    return S.days[currentDate];
  }

  function addEntries() {
    const ta = $('#entry');
    const parsed = window.Parser.parseText(ta.value);
    if (!parsed.length) return;
    const day = currentDay();
    parsed.forEach(p => {
      day.items.push({
        raw: p.raw,
        foodText: p.foodText,
        foodId: p.foodId,
        grams: p.grams,
        conf: p.confidence,
        match: p.matchStatus,   // 'matched' | 'ambiguous' | 'not_found'
        note: primaryFlag(p),
      });
    });
    window.Store.save();
    ta.value = '';
    renderHoje();
    renderHist();
  }

  function primaryFlag(p) {
    const warn = p.flags.find(f => f.level === 'warn');
    const info = p.flags.find(f => f.level === 'info');
    return (warn || info || {}).msg || '';
  }

  // ============ FASE 2: registro por foto ============
  // A foto NÃO calcula nutrição: só sugere alimento + gramas. Cada item entra
  // como estimativa (amarela, editável) e é casado com a base TACO/custom.
  // A análise acontece no SEU proxy (aba Dados) — a chave da API nunca fica aqui.

  // Redimensiona p/ máx 1024 px e converte p/ JPEG (menos dados, mais rápido).
  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl.split(',')[1]); // só o base64, sem o prefixo data:
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui ler a imagem.')); };
      img.src = url;
    });
  }

  async function analyzePhoto(base64) {
    const res = await fetch(S.settings.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': S.settings.proxyToken },
      body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
    });
    let data = null;
    try { data = await res.json(); } catch { /* resposta sem corpo */ }
    if (!res.ok) {
      const detail = (data && (data.detail || data.error)) || ('HTTP ' + res.status);
      throw new Error(detail);
    }
    return data || { itens: [], observacao: '' };
  }

  // Insere os itens estimados no dia atual (exposta p/ testes).
  function addPhotoItems(itens, observacao) {
    const day = currentDay();
    let added = 0;
    (itens || []).forEach(it => {
      if (!it || !it.nome || !(it.gramas > 0)) return;
      const match = window.Parser.matchFood(it.nome);
      day.items.push({
        raw: '[foto] ' + it.nome,
        foodText: it.nome,
        foodId: match.foodId,
        grams: Math.round(it.gramas),
        conf: 'estimate',
        match: match.status,
        note: 'Estimado por foto (confiança ' + (it.confianca || 'baixa') + ') — confira alimento e gramas.',
      });
      added++;
    });
    window.Store.save();
    renderHoje();
    renderHist();
    let msgTxt = added
      ? added + ' item(ns) adicionados pela foto como ESTIMATIVA — confira os alimentos e as gramas.'
      : 'Nenhum alimento identificado na foto.';
    if (observacao) msgTxt += '\n\nObservação do modelo: ' + observacao;
    alert(msgTxt);
    return added;
  }

  async function handlePhotoPick(file) {
    const btn = $('#photo-btn');
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ analisando…'; }
    try {
      const base64 = await compressPhoto(file);
      const data = await analyzePhoto(base64);
      addPhotoItems(data.itens, data.observacao);
    } catch (err) {
      alert('Não consegui analisar a foto: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  function itemNutrients(item) {
    const food = window.Parser.getFood(item.foodId);
    return window.Nutrition.itemNutrients(food, item.grams);
  }

  function renderHoje() {
    const root = $('#tab-hoje');
    clear(root);
    const day = currentDay();

    // ----- navegação de data -----
    const isToday = currentDate === isoLocal(new Date());
    root.appendChild(h('div', { class: 'daynav' }, [
      h('button', { class: 'icon-btn', onclick: () => { currentDate = shiftDate(currentDate, -1); renderHoje(); } }, '‹'),
      h('input', {
        type: 'date', value: currentDate, class: 'date-input',
        onchange: e => { currentDate = e.target.value || currentDate; renderHoje(); },
      }),
      h('button', { class: 'icon-btn', disabled: isToday ? 'disabled' : null, onclick: () => { if (!isToday) { currentDate = shiftDate(currentDate, 1); renderHoje(); } } }, '›'),
      isToday ? null : h('button', { class: 'link-btn', onclick: () => { currentDate = isoLocal(new Date()); renderHoje(); } }, 'hoje'),
    ]));

    // ----- entrada de texto -----
    // ----- boas-vindas no primeiro uso (multiusuário: cada aparelho é de
    // uma pessoa; some sozinho quando o perfil é preenchido) -----
    const p = S.profile;
    const perfilIncompleto = !(p.age > 0) || !(p.height > 0) || !(p.weight > 0);
    if (perfilIncompleto) {
      root.appendChild(h('div', { class: 'card welcome' }, [
        h('h3', {}, '👋 Bem-vindo(a) ao Diário Alimentar'),
        h('p', { class: 'note' }, 'Seus dados ficam só neste aparelho — ninguém mais vê o que você registra. Para começar:'),
        h('ol', { class: 'welcome-steps' }, [
          h('li', {}, [h('strong', {}, '1. Preencha seu perfil'), ' (sexo, idade, altura, peso) para calcular sua meta diária de calorias.']),
          h('li', {}, [h('strong', {}, '2. Registre o que comer'), ' escrevendo, ex.: “100 g arroz, 1 ovo”.']),
          h('li', {}, [h('strong', {}, '3. Faça backup'), ' de vez em quando na aba Dados (Exportar).']),
        ]),
        h('button', {
          class: 'btn primary',
          onclick: () => document.querySelector('.tab-btn[data-tab="perfil"]').click(),
        }, 'Preencher meu perfil'),
      ]));
    }

    const photoInput = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
      onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) handlePhotoPick(f); },
    });
    const box = h('div', { class: 'card entry-card' }, [
      h('label', { class: 'lbl', for: 'entry' }, 'O que você comeu? (uma linha por alimento)'),
      h('textarea', { id: 'entry', rows: '3', placeholder: '100 g patinho\n120g arroz\n1 ovo\nmeia xicara de feijao' }),
      h('div', { class: 'entry-actions' }, [
        h('span', { class: 'hint' }, 'Ex.: “150 g frango”, “2 colheres de sopa de azeite”, “1 banana”'),
        photoInput,
        h('button', {
          class: 'btn', id: 'photo-btn', title: 'Registrar por foto (Fase 2)',
          onclick: () => {
            if (!S.settings.proxyUrl || !S.settings.proxyToken) {
              alert('Para usar foto, configure o endereço do proxy e a senha do app na aba Dados (seção "Registro por foto").');
              return;
            }
            photoInput.click();
          },
        }, '📷 Foto'),
        h('button', { class: 'btn primary', onclick: addEntries }, '+ Adicionar'),
      ]),
    ]);
    root.appendChild(box);
    // Ctrl+Enter envia
    box.querySelector('#entry').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addEntries(); }
    });

    // ----- lista de itens -----
    const list = h('div', { class: 'items' });
    if (!day.items.length) {
      list.appendChild(h('p', { class: 'empty' }, 'Nenhum item ainda. Escreva acima e toque em Adicionar.'));
    }
    day.items.forEach((item, idx) => list.appendChild(renderItem(item, idx)));
    root.appendChild(list);

    // ----- dashboard -----
    root.appendChild(renderDashboard(day));

    // ----- peso do dia -----
    root.appendChild(renderWeightInput());
  }

  function renderItem(item, idx) {
    const food = window.Parser.getFood(item.foodId);
    const n = itemNutrients(item);
    const resolved = food && item.grams > 0;
    const noKcal = food && food.kcal == null;
    const needsGrams = !(item.grams > 0);
    const ambiguous = item.match === 'ambiguous';
    const searchQuery = item.foodText || item.raw;
    const pickFood = id => { item.foodId = id; item.match = 'matched'; window.Store.save(); renderHoje(); renderHist(); };

    let cls = 'item';
    if (!food || needsGrams || noKcal || ambiguous) cls += ' item-warn';
    if (!food) cls += ' item-error';

    const row = h('div', { class: cls });

    // linha 1: nome + gramas + kcal
    const nameBtn = h('button', { class: 'item-name', title: 'Trocar alimento', onclick: () => openFoodSearch(searchQuery, pickFood) },
      food ? food.name + (food.custom ? ' ·meu' : '') : 'escolher alimento…');

    const gramsInput = h('input', {
      type: 'number', min: '0', step: '1', class: 'grams', value: item.grams != null ? round(item.grams, 0) : '',
      placeholder: 'g',
      onchange: e => {
        const v = e.target.value;
        item.grams = v === '' ? null : Number(String(v).replace(',', '.'));
        item.conf = 'exact'; item.note = '';
        window.Store.save(); renderHoje(); renderHist();
      },
    });

    row.appendChild(h('div', { class: 'item-main' }, [
      nameBtn,
      h('div', { class: 'item-qty' }, [gramsInput, h('span', { class: 'unit' }, 'g')]),
      h('div', { class: 'item-kcal' }, resolved && !noKcal ? round(n.kcal, 0) + ' kcal' : '—'),
      h('button', { class: 'del', title: 'Remover', onclick: () => { currentDay().items.splice(idx, 1); window.Store.save(); renderHoje(); renderHist(); } }, '✕'),
    ]));

    // linha 2: macros
    if (resolved && !noKcal) {
      row.appendChild(h('div', { class: 'item-macros' }, [
        macroPill('P', n.prot, 'p'), macroPill('C', n.carb, 'c'), macroPill('G', n.fat, 'g'),
        n.fiber ? h('span', { class: 'fiber' }, 'fibra ' + round(n.fiber, 1) + ' g') : null,
      ]));
    }

    // badges/avisos
    const badges = h('div', { class: 'item-badges' });
    if (!food) badges.appendChild(badge('não encontrado', 'error'));
    if (ambiguous && food) badges.appendChild(badge('confirme o alimento', 'warn', 'Havia vários parecidos — este foi o palpite.'));
    if (noKcal) badges.appendChild(badge('sem valor na TACO — cadastre', 'error'));
    if (needsGrams && food) badges.appendChild(badge('informe as gramas', 'warn'));
    if (item.conf === 'estimate' && item.note) badges.appendChild(badge('estimativa', 'warn', item.note));
    if (badges.children.length) row.appendChild(badges);

    // seletor de candidatos quando não encontrado ou ambíguo
    if (!food || ambiguous) {
      // usa o texto do alimento já isolado (importante p/ itens de foto);
      // cai no parse da linha crua só para itens antigos sem foodText
      const parsed = item.foodText
        ? window.Parser.matchFood(item.foodText)
        : window.Parser.parseLine(item.raw);
      if (parsed && parsed.candidates && parsed.candidates.length) {
        const sel = h('select', { class: 'cand', onchange: e => { if (e.target.value) pickFood(e.target.value); } }, [
          h('option', { value: '' }, food ? 'trocar / confirmar…' : 'escolher da base…'),
          ...parsed.candidates.map(c => {
            const f = window.Parser.getFood(c.id);
            return f ? h('option', { value: c.id, selected: String(c.id) === String(item.foodId) ? 'selected' : null }, f.name) : null;
          }).filter(Boolean),
        ]);
        row.appendChild(sel);
      }
      row.appendChild(h('button', { class: 'link-btn', onclick: () => openCustomFoodForm(searchQuery, newId => { item.foodId = newId; item.match = 'matched'; window.Store.save(); refreshFoods(); renderHoje(); renderHist(); }) }, '+ cadastrar alimento'));
    }

    return row;
  }

  function macroPill(letter, grams, cls) {
    return h('span', { class: 'pill pill-' + cls }, letter + ' ' + round(grams, 1) + ' g');
  }
  function badge(text, kind, title) {
    return h('span', { class: 'badge badge-' + kind, title: title || '' }, text);
  }

  function renderDashboard(day) {
    const nutrients = day.items.map(itemNutrients).filter(n => n.hasKcal);
    const total = window.Nutrition.sumNutrients(nutrients);
    const goalK = window.Nutrition.goalKcal(S.profile, S.goal);
    const mt = window.Nutrition.macroTargets(S.profile, S.goal, goalK);

    const wrap = h('div', { class: 'card dash' });
    wrap.appendChild(h('h3', {}, 'Resumo do dia'));

    const grid = h('div', { class: 'dash-grid' });
    // anel
    const ringWrap = h('div', { class: 'ring-wrap' });
    ringWrap.appendChild(window.Charts.ring(total.kcal, goalK || 0));
    grid.appendChild(ringWrap);

    // macros
    const rows = [
      { label: 'Proteína', value: total.prot, target: mt ? mt.protG : 0, color: 'var(--p)' },
      { label: 'Carbo', value: total.carb, target: mt ? mt.carbG : 0, color: 'var(--c)' },
      { label: 'Gordura', value: total.fat, target: mt ? mt.fatG : 0, color: 'var(--g)' },
    ];
    grid.appendChild(h('div', { class: 'bars-wrap' }, [window.Charts.macroBars(rows)]));
    wrap.appendChild(grid);

    if (!goalK) wrap.appendChild(h('p', { class: 'note' }, 'Defina seu perfil na aba Perfil para ver a meta.'));
    return wrap;
  }

  function renderWeightInput() {
    const card = h('div', { class: 'card weight-card' }, [
      h('label', { class: 'lbl' }, 'Peso corporal em ' + fmtBR(currentDate) + ' (kg)'),
      h('div', { class: 'weight-row' }, [
        h('input', {
          type: 'number', min: '0', step: '0.1', class: 'w-input',
          value: S.weights[currentDate] != null ? S.weights[currentDate] : '',
          placeholder: 'ex.: 82.4',
          onchange: e => {
            const v = e.target.value;
            if (v === '') delete S.weights[currentDate];
            else S.weights[currentDate] = Number(String(v).replace(',', '.'));
            window.Store.save(); renderHist();
          },
        }),
        h('span', { class: 'hint' }, 'opcional — registre quando pesar'),
      ]),
    ]);
    return card;
  }

  // ================= ABA HISTÓRICO =================
  function renderHist() {
    const root = $('#tab-hist');
    clear(root);
    const goalK = window.Nutrition.goalKcal(S.profile, S.goal);

    // série de kcal por dia
    const kcalSeries = Object.keys(S.days).sort().map(date => {
      const items = S.days[date].items || [];
      const tot = window.Nutrition.sumNutrients(items.map(it => window.Nutrition.itemNutrients(window.Parser.getFood(it.foodId), it.grams)).filter(n => n.hasKcal));
      return { date, value: items.length ? round(tot.kcal, 0) : null };
    }).filter(p => p.value != null);

    const weightSeries = Object.keys(S.weights).sort().map(date => ({ date, value: S.weights[date] }));

    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, 'Calorias por dia'),
      window.Charts.lineChart(kcalSeries, { goalLine: goalK || null, color: 'var(--accent)', unit: ' kcal', zeroBase: true, empty: 'Registre alimentos para ver o histórico' }),
    ]));

    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, 'Peso corporal'),
      window.Charts.lineChart(weightSeries, { color: 'var(--g)', unit: ' kg', empty: 'Registre seu peso na aba Hoje' }),
    ]));

    // tabela resumida (últimos 14 dias com registro)
    const dates = Object.keys(S.days).filter(d => (S.days[d].items || []).length).sort().reverse().slice(0, 14);
    if (dates.length) {
      const table = h('table', { class: 'histtable' }, [
        h('thead', {}, h('tr', {}, [h('th', {}, 'Dia'), h('th', {}, 'kcal'), h('th', {}, 'P'), h('th', {}, 'C'), h('th', {}, 'G'), h('th', {}, 'Peso')])),
      ]);
      const tb = h('tbody');
      dates.forEach(date => {
        const items = S.days[date].items || [];
        const tot = window.Nutrition.sumNutrients(items.map(it => window.Nutrition.itemNutrients(window.Parser.getFood(it.foodId), it.grams)).filter(n => n.hasKcal));
        tb.appendChild(h('tr', {}, [
          h('td', {}, fmtBR(date)),
          h('td', {}, round(tot.kcal, 0)),
          h('td', {}, round(tot.prot, 0)),
          h('td', {}, round(tot.carb, 0)),
          h('td', {}, round(tot.fat, 0)),
          h('td', {}, S.weights[date] != null ? S.weights[date] : '—'),
        ]));
      });
      table.appendChild(tb);
      root.appendChild(h('div', { class: 'card' }, [h('h3', {}, 'Últimos dias'), table]));
    }
  }

  // ================= ABA PERFIL =================
  function renderPerfil() {
    const root = $('#tab-perfil');
    clear(root);
    const p = S.profile, g = S.goal;

    function field(label, node) { return h('div', { class: 'field' }, [h('label', { class: 'lbl' }, label), node]); }
    function numInput(val, on, step, min) {
      return h('input', { type: 'number', step: step || '1', min: min || '0', value: val != null ? val : '', class: 'in', onchange: e => { on(e.target.value === '' ? null : Number(String(e.target.value).replace(',', '.'))); } });
    }

    const form = h('div', { class: 'card' }, [h('h3', {}, 'Seus dados')]);
    const grid = h('div', { class: 'form-grid' });

    grid.appendChild(field('Sexo', h('select', { class: 'in', onchange: e => { p.sex = e.target.value; save(); } }, [
      h('option', { value: 'm', selected: p.sex === 'm' ? 'selected' : null }, 'Masculino'),
      h('option', { value: 'f', selected: p.sex === 'f' ? 'selected' : null }, 'Feminino'),
    ])));
    grid.appendChild(field('Idade (anos)', numInput(p.age, v => { p.age = v; save(); })));
    grid.appendChild(field('Altura (cm)', numInput(p.height, v => { p.height = v; save(); })));
    grid.appendChild(field('Peso (kg)', numInput(p.weight, v => { p.weight = v; save(); }, '0.1')));
    grid.appendChild(field('Atividade', h('select', { class: 'in', onchange: e => { p.activity = Number(e.target.value); save(); } },
      Object.keys(window.Nutrition.ACTIVITY).map(k => h('option', { value: k, selected: String(p.activity) === k ? 'selected' : null }, window.Nutrition.ACTIVITY[k])))));
    form.appendChild(grid);
    root.appendChild(form);

    // meta
    const goalCard = h('div', { class: 'card' }, [h('h3', {}, 'Meta')]);
    const gGrid = h('div', { class: 'form-grid' });
    gGrid.appendChild(field('Ritmo de perda', h('select', { class: 'in', onchange: e => { g.pace = Number(e.target.value); g.deficit = null; g.manualKcal = null; save(); } }, [
      ['0', 'Manter peso'], ['0.25', '0,25 kg/semana'], ['0.5', '0,5 kg/semana'], ['0.75', '0,75 kg/semana'], ['1', '1 kg/semana'],
    ].map(([v, t]) => h('option', { value: v, selected: String(g.pace) === v && g.manualKcal == null ? 'selected' : null }, t)))));
    gGrid.appendChild(field('Proteína (g/kg)', numInput(g.proteinPerKg, v => { g.proteinPerKg = v; save(); }, '0.1')));
    gGrid.appendChild(field('Gordura (% das kcal)', numInput(Math.round((g.fatPct || 0.25) * 100), v => { g.fatPct = (v || 0) / 100; save(); })));
    gGrid.appendChild(field('Meta manual (kcal, opcional)', numInput(g.manualKcal, v => { g.manualKcal = v; save(); })));
    goalCard.appendChild(gGrid);

    // resultados
    const bmr = window.Nutrition.bmr(p);
    const tdee = window.Nutrition.tdee(p);
    const goalK = window.Nutrition.goalKcal(p, g);
    const mt = window.Nutrition.macroTargets(p, g, goalK);
    const results = h('div', { class: 'results' });
    if (bmr == null) {
      results.appendChild(h('p', { class: 'note' }, 'Preencha idade, altura e peso para calcular.'));
    } else {
      results.appendChild(statBox('TMB', round(bmr, 0), 'kcal/dia'));
      results.appendChild(statBox('TDEE', round(tdee, 0), 'kcal/dia'));
      results.appendChild(statBox('Meta', goalK, 'kcal/dia'));
      if (mt) {
        results.appendChild(statBox('Proteína', mt.protG, 'g/dia'));
        results.appendChild(statBox('Carbo', mt.carbG, 'g/dia'));
        results.appendChild(statBox('Gordura', mt.fatG, 'g/dia'));
      }
    }
    goalCard.appendChild(results);

    // guardrail de segurança
    if (goalK != null) {
      const floor = window.Nutrition.floorKcal(p.sex);
      if (goalK < floor) {
        goalCard.appendChild(h('div', { class: 'warnbar' },
          `⚠ Meta de ${goalK} kcal está abaixo do piso seguro sugerido (${floor} kcal/dia para ${p.sex === 'f' ? 'mulheres' : 'homens'}). ` +
          'Dietas muito restritivas podem ser contraproducentes e devem ser acompanhadas. Ajuste o ritmo ou revise a meta manual.'));
      }
    }
    root.appendChild(goalCard);

    function save() { window.Store.save(); renderPerfil(); renderHoje(); renderHist(); }
  }

  function statBox(label, value, unit) {
    return h('div', { class: 'stat' }, [
      h('div', { class: 'stat-val' }, value != null ? value : '—'),
      h('div', { class: 'stat-lbl' }, label),
      h('div', { class: 'stat-unit' }, unit),
    ]);
  }

  // ================= ABA DADOS =================
  function renderDados() {
    const root = $('#tab-dados');
    clear(root);

    // export/import
    const io = h('div', { class: 'card' }, [
      h('h3', {}, 'Backup dos seus dados'),
      h('p', { class: 'note' }, 'Tudo fica só neste aparelho (localStorage). Exporte um arquivo JSON para backup ou para levar a outro dispositivo.'),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn', onclick: doExport }, '⬇ Exportar JSON'),
        h('label', { class: 'btn' }, ['⬆ Importar (substituir)', h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: e => doImport(e, 'replace') })]),
        h('label', { class: 'btn' }, ['⬆ Importar (mesclar)', h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: e => doImport(e, 'merge') })]),
      ]),
    ]);
    root.appendChild(io);

    // alimentos do usuário
    const cf = h('div', { class: 'card' }, [
      h('h3', {}, 'Meus alimentos'),
      h('p', { class: 'note' }, 'Cadastre o que não está na TACO (whey, peito de peru, marcas específicas) com os valores do rótulo, por 100 g.'),
      h('button', { class: 'btn', onclick: () => openCustomFoodForm('', () => { refreshFoods(); renderDados(); renderHoje(); }) }, '+ Novo alimento'),
    ]);
    const cfList = h('div', { class: 'cf-list' });
    if (!S.customFoods.length) cfList.appendChild(h('p', { class: 'empty' }, 'Nenhum alimento cadastrado ainda.'));
    S.customFoods.forEach(f => {
      cfList.appendChild(h('div', { class: 'cf-item' }, [
        h('div', {}, [h('strong', {}, f.name), h('div', { class: 'hint' }, `${f.kcal != null ? f.kcal : '—'} kcal · P${f.prot != null ? f.prot : '—'} C${f.carb != null ? f.carb : '—'} G${f.fat != null ? f.fat : '—'} /100g`)]),
        h('div', {}, [
          h('button', { class: 'link-btn', onclick: () => openCustomFoodForm('', () => { refreshFoods(); renderDados(); renderHoje(); }, f) }, 'editar'),
          h('button', { class: 'link-btn danger', onclick: () => { if (confirm('Remover ' + f.name + '?')) { window.Store.removeCustomFood(f.id); refreshFoods(); renderDados(); renderHoje(); } } }, 'remover'),
        ]),
      ]));
    });
    cf.appendChild(cfList);
    root.appendChild(cf);

    // Fase 2: registro por foto
    const st = S.settings;
    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, '📷 Registro por foto (Fase 2)'),
      h('p', { class: 'note' }, 'Opcional. Requer o SEU proxy publicado (veja fase2-proxy/ no projeto). A chave da API fica só no proxy — aqui você informa apenas o endereço dele e a senha do app.'),
      h('div', { class: 'field' }, [
        h('label', { class: 'lbl' }, 'Endereço do proxy'),
        h('input', {
          type: 'url', class: 'in', placeholder: 'https://seu-proxy.workers.dev',
          value: st.proxyUrl || '',
          onchange: e => { st.proxyUrl = e.target.value.trim(); window.Store.save(); },
        }),
      ]),
      h('div', { class: 'field' }, [
        h('label', { class: 'lbl' }, 'Senha do app (APP_TOKEN)'),
        h('input', {
          type: 'password', class: 'in', placeholder: 'a mesma configurada no proxy',
          value: st.proxyToken || '',
          onchange: e => { st.proxyToken = e.target.value.trim(); window.Store.save(); },
        }),
      ]),
      h('p', { class: 'hint' }, 'Cada foto analisada tem custo (centavos) cobrado na sua conta da API. Itens de foto entram sempre como estimativa editável.'),
    ]));

    // fonte / sobre
    const db = window.FOOD_DB || {};
    root.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, 'Sobre a base de alimentos'),
      h('p', { class: 'note' }, db.source || ''),
      h('p', { class: 'note' }, 'Digitalização: ' + (db.digitizedFrom || '')),
      h('p', { class: 'note' }, (db.foods ? db.foods.length : 0) + ' alimentos · base por 100 g.'),
      h('button', { class: 'btn danger', onclick: doReset }, 'Apagar tudo'),
    ]));
  }

  function doExport() {
    const blob = new Blob([window.Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'diario-alimentar-' + isoLocal(new Date()) + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function doImport(e, mode) {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        if (mode === 'replace' && !confirm('Isso vai SUBSTITUIR todos os dados atuais. Continuar?')) return;
        window.Store.importJSON(r.result, mode);
        S = window.Store.get();
        refreshFoods();
        renderAll();
        alert('Importado com sucesso.');
      } catch (err) {
        alert('Não consegui ler o arquivo: ' + err.message);
      }
    };
    r.readAsText(file);
    e.target.value = '';
  }
  function doReset() {
    if (!confirm('Apagar TODOS os dados (perfil, histórico, alimentos)? Faça um export antes se quiser backup.')) return;
    if (!confirm('Tem certeza? Isso não tem volta.')) return;
    S = window.Store.reset();
    refreshFoods();
    currentDate = isoLocal(new Date());
    renderAll();
  }

  // ================= MODAIS =================
  function modal(title, bodyNode) {
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } });
    function close() { back.remove(); }
    back.appendChild(h('div', { class: 'modal' }, [
      h('div', { class: 'modal-head' }, [h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close }, '✕')]),
      bodyNode,
    ]));
    document.body.appendChild(back);
    return { close, back };
  }

  function openFoodSearch(query, onPick) {
    const results = h('div', { class: 'search-results' });
    const input = h('input', { type: 'text', class: 'in', placeholder: 'buscar alimento…', value: query || '' });
    const m = modal('Buscar alimento', h('div', {}, [
      input,
      h('div', { class: 'hint' }, 'Base TACO + seus alimentos. Não achou? Cadastre um novo.'),
      results,
      h('button', { class: 'btn', onclick: () => { m.close(); openCustomFoodForm(input.value, id => onPick(id)); } }, '+ Cadastrar novo alimento'),
    ]));
    function run() {
      clear(results);
      const q = window.Parser.normalize(input.value);
      const foods = window.Parser.getFoods();
      let matches;
      if (!q) matches = [];
      else {
        const toks = q.split(' ');
        matches = foods.filter(f => toks.every(t => f.norm.includes(t))).slice(0, 40);
      }
      if (!matches.length) results.appendChild(h('p', { class: 'empty' }, q ? 'Nada encontrado.' : 'Digite para buscar.'));
      matches.forEach(f => results.appendChild(h('button', {
        class: 'search-item', onclick: () => { onPick(f.id); m.close(); },
      }, [
        h('span', {}, f.name + (f.custom ? ' ·meu' : '')),
        h('span', { class: 'si-kcal' }, (f.kcal != null ? f.kcal + ' kcal' : 'sem kcal') + '/100g'),
      ])));
    }
    input.addEventListener('input', run);
    run();
    setTimeout(() => input.focus(), 30);
  }

  function openCustomFoodForm(prefillName, onSaved, editing) {
    const vals = editing || { name: prefillName || '', kcal: '', prot: '', carb: '', fat: '', fiber: '' };
    function inp(key, label, step) {
      const i = h('input', { type: key === 'name' ? 'text' : 'number', step: step || '0.1', min: '0', class: 'in', value: vals[key] != null ? vals[key] : '' });
      i.dataset.key = key;
      return h('div', { class: 'field' }, [h('label', { class: 'lbl' }, label), i]);
    }
    const body = h('div', {}, [
      inp('name', 'Nome do alimento'),
      h('div', { class: 'form-grid' }, [
        inp('kcal', 'kcal /100g', '1'), inp('prot', 'Proteína /100g'),
        inp('carb', 'Carbo /100g'), inp('fat', 'Gordura /100g'),
        inp('fiber', 'Fibra /100g (opcional)'),
      ]),
      h('p', { class: 'hint' }, 'Use os valores do rótulo por 100 g. Não invente — copie da embalagem ou de fonte confiável.'),
    ]);
    const m = modal(editing ? 'Editar alimento' : 'Novo alimento', h('div', {}, [
      body,
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary', onclick: () => {
            const data = {};
            body.querySelectorAll('input').forEach(i => { data[i.dataset.key] = i.value; });
            if (!data.name || !data.name.trim()) { alert('Dê um nome ao alimento.'); return; }
            if (editing) {
              window.Store.updateCustomFood(editing.id, {
                name: data.name.trim(),
                kcal: numOrNull(data.kcal), prot: numOrNull(data.prot), carb: numOrNull(data.carb), fat: numOrNull(data.fat), fiber: numOrNull(data.fiber),
              });
              refreshFoods(); m.close(); onSaved && onSaved(editing.id);
            } else {
              const rec = window.Store.addCustomFood(data);
              refreshFoods(); m.close(); onSaved && onSaved(rec.id);
            }
          },
        }, 'Salvar'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
      ]),
    ]));
  }
  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // funções expostas p/ testes automatizados
  return { init, addPhotoItems, compressPhoto, analyzePhoto };
})();

document.addEventListener('DOMContentLoaded', window.App.init);
