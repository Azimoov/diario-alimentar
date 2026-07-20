// charts.js — gráficos em SVG puro (sem biblioteca externa => funciona offline
// e abrindo o arquivo direto). Anel de kcal, barras de macro e linhas de
// histórico (kcal e peso).

window.Charts = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, children) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    (children || []).forEach(c => e.appendChild(c));
    return e;
  }
  function txt(x, y, s, attrs) {
    const t = el('text', Object.assign({ x, y }, attrs || {}));
    t.textContent = s;
    return t;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---- anel de progresso kcal vs meta ----
  function ring(consumed, goal) {
    const size = 180, r = 74, cx = size / 2, cy = size / 2, sw = 16;
    const C = 2 * Math.PI * r;
    const frac = goal > 0 ? clamp(consumed / goal, 0, 1.2) : 0;
    const over = goal > 0 && consumed > goal;
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, class: 'ring', width: size, height: size });
    svg.appendChild(el('circle', { cx, cy, r, fill: 'none', stroke: 'var(--track)', 'stroke-width': sw }));
    svg.appendChild(el('circle', {
      cx, cy, r, fill: 'none',
      stroke: over ? 'var(--danger)' : 'var(--accent)',
      'stroke-width': sw, 'stroke-linecap': 'round',
      'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - Math.min(frac, 1)),
      transform: `rotate(-90 ${cx} ${cy})`,
    }));
    svg.appendChild(txt(cx, cy - 2, Math.round(consumed), { class: 'ring-num', 'text-anchor': 'middle' }));
    svg.appendChild(txt(cx, cy + 18, '/ ' + (goal ? Math.round(goal) : '—') + ' kcal', { class: 'ring-sub', 'text-anchor': 'middle' }));
    const remaining = goal ? Math.round(goal - consumed) : null;
    if (remaining != null) {
      svg.appendChild(txt(cx, cy + 36, (remaining >= 0 ? remaining + ' restam' : (-remaining) + ' acima'),
        { class: 'ring-rem', 'text-anchor': 'middle', fill: remaining >= 0 ? 'var(--muted)' : 'var(--danger)' }));
    }
    return svg;
  }

  // ---- barras de macro (consumido vs alvo) ----
  // rows: [{label, value, target, color}]
  function macroBars(rows) {
    const W = 320, rowH = 46, padL = 60, padR = 46, top = 8;
    const H = top + rows.length * rowH;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'macrobars', width: '100%', height: H });
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const max = Math.max(r.target || 0, r.value || 0, 1);
      const barW = W - padL - padR;
      const vW = barW * clamp((r.value || 0) / max, 0, 1);
      svg.appendChild(txt(0, y + 20, r.label, { class: 'mb-label' }));
      svg.appendChild(el('rect', { x: padL, y: y + 8, width: barW, height: 16, rx: 8, fill: 'var(--track)' }));
      svg.appendChild(el('rect', { x: padL, y: y + 8, width: vW, height: 16, rx: 8, fill: r.color }));
      // marca do alvo
      if (r.target > 0) {
        const tx = padL + barW * clamp(r.target / max, 0, 1);
        svg.appendChild(el('line', { x1: tx, y1: y + 3, x2: tx, y2: y + 29, stroke: 'var(--fg)', 'stroke-width': 2, 'stroke-dasharray': '2 2', opacity: 0.6 }));
      }
      svg.appendChild(txt(W, y + 20, Math.round(r.value || 0) + (r.target ? ' / ' + Math.round(r.target) + ' g' : ' g'),
        { class: 'mb-val', 'text-anchor': 'end' }));
    });
    return svg;
  }

  // ---- gráfico de linha genérico ----
  // series: [{date:'YYYY-MM-DD', value:Number}], goalLine opcional
  function lineChart(series, opts) {
    opts = opts || {};
    const W = 640, H = 240, padL = 44, padR = 14, padT = 16, padB = 28;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'linechart', width: '100%', preserveAspectRatio: 'xMidYMid meet' });
    const pts = series.filter(p => p.value != null);
    if (!pts.length) {
      svg.appendChild(txt(W / 2, H / 2, opts.empty || 'Sem dados ainda', { 'text-anchor': 'middle', class: 'lc-empty' }));
      return svg;
    }
    // séries extras (ex.: média móvel) entram na escala e são desenhadas por cima
    const extraSets = (opts.extra || []).map(e => Object.assign({}, e, { pts: (e.series || []).filter(p => p.value != null) }));
    const allPts = pts.concat(...extraSets.map(e => e.pts));
    const xs = allPts.map(p => +new Date(p.date));
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...allPts.map(p => p.value));
    let maxY = Math.max(...allPts.map(p => p.value));
    if (opts.goalLine != null) { minY = Math.min(minY, opts.goalLine); maxY = Math.max(maxY, opts.goalLine); }
    const pad = (maxY - minY) * 0.15 || 10;
    minY = Math.floor((minY - pad) / 10) * 10;
    maxY = Math.ceil((maxY + pad) / 10) * 10;
    if (opts.zeroBase) minY = 0;

    const sx = v => padL + (maxX === minX ? (W - padL - padR) / 2 : (v - minX) / (maxX - minX) * (W - padL - padR));
    const sy = v => padT + (1 - (v - minY) / (maxY - minY || 1)) * (H - padT - padB);

    // grelha Y (3 linhas)
    for (let i = 0; i <= 3; i++) {
      const val = minY + (maxY - minY) * i / 3;
      const y = sy(val);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'var(--track)', 'stroke-width': 1 }));
      svg.appendChild(txt(padL - 6, y + 4, Math.round(val), { 'text-anchor': 'end', class: 'lc-axis' }));
    }
    // linha de meta
    if (opts.goalLine != null) {
      const y = sy(opts.goalLine);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', opacity: 0.8 }));
      svg.appendChild(txt(W - padR, y - 5, 'meta ' + Math.round(opts.goalLine), { 'text-anchor': 'end', class: 'lc-axis', fill: 'var(--accent)' }));
    }
    // caminho principal
    const d = pts.map((p, i) => (i ? 'L' : 'M') + sx(+new Date(p.date)).toFixed(1) + ' ' + sy(p.value).toFixed(1)).join(' ');
    svg.appendChild(el('path', {
      d, fill: 'none', stroke: opts.color || 'var(--fg)',
      'stroke-width': opts.width || 2, 'stroke-linejoin': 'round',
      opacity: opts.lineOpacity != null ? opts.lineOpacity : 1,
    }));
    // pontos + rótulos de data nas pontas
    pts.forEach((p, i) => {
      const cx = sx(+new Date(p.date)), cy = sy(p.value);
      const c = el('circle', { cx, cy, r: opts.pointR || 3.5, fill: opts.color || 'var(--fg)' });
      c.appendChild(el('title', {}, [document.createTextNode(fmtDate(p.date) + ': ' + (Math.round(p.value * 10) / 10) + (opts.unit || ''))]));
      svg.appendChild(c);
    });
    // séries extras (linha sem pontos — ex.: tendência/média móvel)
    extraSets.forEach(e => {
      if (!e.pts.length) return;
      const dd = e.pts.map((p, i) => (i ? 'L' : 'M') + sx(+new Date(p.date)).toFixed(1) + ' ' + sy(p.value).toFixed(1)).join(' ');
      svg.appendChild(el('path', {
        d: dd, fill: 'none', stroke: e.color || 'var(--fg)',
        'stroke-width': e.width || 2.5, 'stroke-linejoin': 'round',
        'stroke-dasharray': e.dash || null,
      }));
    });
    // rótulo primeira/última data
    svg.appendChild(txt(sx(minX), H - 8, fmtDate(pts[0].date), { 'text-anchor': 'start', class: 'lc-axis' }));
    if (pts.length > 1) svg.appendChild(txt(sx(maxX), H - 8, fmtDate(pts[pts.length - 1].date), { 'text-anchor': 'end', class: 'lc-axis' }));
    return svg;
  }

  function fmtDate(s) {
    const [y, m, d] = s.split('-');
    return d + '/' + m;
  }

  return { ring, macroBars, lineChart };
})();
