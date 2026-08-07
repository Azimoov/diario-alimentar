// health.js — lê o EXPORT do app Saúde do iPhone (Ajustes → foto de perfil →
// "Exportar Todos os Dados de Saúde") e agrega em MÉTRICAS DIÁRIAS compactas.
//
// Sem biblioteca externa: o .zip é lido com um parser mínimo (diretório
// central) + DecompressionStream nativo do navegador; o export.xml é
// processado em STREAMING (linha a linha) — arquivos de centenas de MB não
// estouram a memória do celular. Também aceita o export.xml solto (no iPhone,
// o app Arquivos descompacta o zip com um toque, se precisar).
//
// HONESTIDADE (importante):
// - Passos/energia/distância podem vir do iPhone E do Apple Watch no mesmo
//   dia; SOMAR tudo contaria em dobro. Para cada dia somamos por fonte e
//   usamos a MAIOR — aproximação conservadora do total real do app Saúde.
// - Valores de energia/sono do relógio são ESTIMATIVAS do sensor, não medida
//   clínica. O app apresenta como vieram, sem inventar nada.

(function () {
  'use strict';

  // métricas agregadas; how: 'sum' (por fonte, pega a maior), 'avg', 'sleep'
  const METRICS = {
    HKQuantityTypeIdentifierStepCount:               { key: 'steps',     how: 'sum',   dec: 0 },
    HKQuantityTypeIdentifierDistanceWalkingRunning:  { key: 'distKm',    how: 'sum',   dec: 2 },
    HKQuantityTypeIdentifierActiveEnergyBurned:      { key: 'kcalOut',   how: 'sum',   dec: 0 },
    HKQuantityTypeIdentifierBasalEnergyBurned:       { key: 'kcalBasal', how: 'sum',   dec: 0 },
    HKQuantityTypeIdentifierAppleExerciseTime:       { key: 'exMin',     how: 'sum',   dec: 0 },
    HKQuantityTypeIdentifierRestingHeartRate:        { key: 'hrRest',    how: 'avg',   dec: 0 },
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN:{ key: 'hrv',       how: 'avg',   dec: 1 },
    HKQuantityTypeIdentifierVO2Max:                  { key: 'vo2max',    how: 'avg',   dec: 1 },
    HKCategoryTypeIdentifierSleepAnalysis:           { key: 'sleepMin',  how: 'sleep', dec: 0 },
  };
  const LABELS = {
    steps: 'Passos', distKm: 'Distância (km)', kcalOut: 'Energia ativa (kcal)',
    kcalBasal: 'Energia basal (kcal)', exMin: 'Exercício (min)',
    hrRest: 'FC de repouso (bpm)', hrv: 'Variabilidade FC (ms)',
    vo2max: 'VO₂máx', sleepMin: 'Sono',
  };

  const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
  const ATTR_RE = /([A-Za-z]+)="([^"]*)"/g;

  // "2026-08-01 07:31:02 -0300" -> epoch ms (só usamos p/ DURAÇÃO de sono)
  function epoch(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\s*([+-])(\d{2}):?(\d{2}))?/.exec(s || '');
    if (!m) return null;
    let t = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (m[7]) t += (m[7] === '+' ? -1 : 1) * ((+m[8]) * 60 + (+m[9])) * 60000;
    return t;
  }

  // valor na unidade que o app usa (km, kcal, min…)
  function convert(value, unit) {
    if (unit === 'mi') return value * 1.60934;
    if (unit === 'kJ') return value / 4.184;
    return value; // count, km, Cal/kcal, min, count/min, ms, mL/min·kg
  }

  function newState(fromDate) {
    return { fromDate: fromDate || null, daily: {}, counts: {}, pending: null, records: 0 };
  }

  function processRecord(st, rec) {
    const attrs = {};
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(rec))) attrs[m[1]] = m[2];
    const spec = METRICS[attrs.type];
    if (!spec) return;
    const date = spec.how === 'sleep'
      ? (attrs.endDate || '').slice(0, 10)     // sono conta no dia em que acorda
      : (attrs.startDate || '').slice(0, 10);
    if (!DATE_RE.test(date)) return;
    if (st.fromDate && date < st.fromDate) return;

    const src = attrs.sourceName || '?';
    const day = st.daily[date] || (st.daily[date] = {});

    if (spec.how === 'sleep') {
      const v = attrs.value || '';
      if (v.indexOf('Asleep') === -1) return; // ignora InBed/Awake
      const t0 = epoch(attrs.startDate), t1 = epoch(attrs.endDate);
      if (t0 == null || t1 == null) return;
      const min = (t1 - t0) / 60000;
      if (!(min > 0 && min < 1440)) return;
      const slot = day[spec.key] || (day[spec.key] = {});
      slot[src] = (slot[src] || 0) + min;
    } else {
      const v = Number(attrs.value);
      if (!Number.isFinite(v)) return;
      const val = convert(v, attrs.unit);
      if (spec.how === 'sum') {
        const slot = day[spec.key] || (day[spec.key] = {});
        slot[src] = (slot[src] || 0) + val;
      } else { // avg
        const slot = day[spec.key] || (day[spec.key] = { s: 0, n: 0 });
        slot.s += val; slot.n++;
      }
    }
    st.counts[spec.key] = (st.counts[spec.key] || 0) + 1;
    st.records++;
  }

  function handleLine(st, line) {
    if (st.pending != null) {
      st.pending += ' ' + line;
      if (line.indexOf('/>') !== -1) { processRecord(st, st.pending); st.pending = null; }
      else if (st.pending.length > 20000) st.pending = null; // malformado — descarta
      return;
    }
    const i = line.indexOf('<Record ');
    if (i === -1) return;
    if (line.indexOf('/>', i) === -1) { st.pending = line.slice(i); return; } // registro quebrado em várias linhas
    processRecord(st, line.slice(i));
  }

  // processa o texto acumulado linha a linha; devolve o resto (linha incompleta)
  function consume(st, buf, flush) {
    let start = 0, idx;
    while ((idx = buf.indexOf('\n', start)) !== -1) {
      handleLine(st, buf.slice(start, idx));
      start = idx + 1;
    }
    if (flush) { if (start < buf.length) handleLine(st, buf.slice(start)); return ''; }
    return buf.slice(start);
  }

  function round(v, dec) { const p = Math.pow(10, dec); return Math.round(v * p) / p; }

  function finalize(st) {
    const daily = {};
    let firstDate = null, lastDate = null;
    Object.keys(st.daily).sort().forEach(date => {
      const raw = st.daily[date];
      const out = {};
      Object.keys(METRICS).forEach(t => {
        const spec = METRICS[t];
        const slot = raw[spec.key];
        if (!slot) return;
        let v;
        if (spec.how === 'avg') v = slot.s / slot.n;
        else { // sum/sleep: maior fonte do dia (evita iPhone+Watch em dobro)
          v = 0;
          for (const src in slot) if (slot[src] > v) v = slot[src];
        }
        out[spec.key] = round(v, spec.dec);
      });
      if (Object.keys(out).length) {
        daily[date] = out;
        if (!firstDate) firstDate = date;
        lastDate = date;
      }
    });
    return { daily, counts: st.counts, records: st.records, firstDate, lastDate };
  }

  // ---- zip mínimo: acha a entrada export.xml no diretório central ----------
  async function findExportEntry(file) {
    const ZIP64 = 0xffffffff;
    const tailLen = Math.min(file.size, 65580);
    const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { e = i; break; }
    }
    if (e < 0) throw new Error('Não parece um .zip válido.');
    const dv = new DataView(tail.buffer, tail.byteOffset);
    const count = dv.getUint16(e + 10, true);
    const cdSize = dv.getUint32(e + 12, true);
    const cdOff = dv.getUint32(e + 16, true);
    if (cdOff === ZIP64 || cdSize === ZIP64) throw new Error('Zip grande demais (Zip64) — descompacte e importe o export.xml.');
    const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const cdv = new DataView(cd.buffer, cd.byteOffset);
    const dec = new TextDecoder();
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cdv.getUint32(p, true) !== 0x02014b50) break;
      const method = cdv.getUint16(p + 10, true);
      const compSize = cdv.getUint32(p + 20, true);
      const nameLen = cdv.getUint16(p + 28, true);
      const extraLen = cdv.getUint16(p + 30, true);
      const cmtLen = cdv.getUint16(p + 32, true);
      const locOff = cdv.getUint32(p + 42, true);
      const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
      if (name === 'export.xml' || name.endsWith('/export.xml')) {
        if (compSize === ZIP64 || locOff === ZIP64) throw new Error('Zip grande demais (Zip64) — descompacte e importe o export.xml.');
        const lh = new DataView(await file.slice(locOff, locOff + 30).arrayBuffer());
        if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('Cabeçalho do zip inválido.');
        const dataStart = locOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        return { start: dataStart, compSize, method };
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
    throw new Error('export.xml não encontrado no zip — este é mesmo o export do app Saúde?');
  }

  function trackProgress(rs, total, cb) {
    if (!cb) return rs;
    let done = 0, last = -1;
    return rs.pipeThrough(new TransformStream({
      transform(chunk, ctrl) {
        done += chunk.byteLength;
        const frac = total > 0 ? Math.min(1, done / total) : 0;
        if (frac - last >= 0.01 || frac === 1) { last = frac; cb(frac); }
        ctrl.enqueue(chunk);
      },
    }));
  }

  // ---- API principal --------------------------------------------------------
  // file: File/Blob (.zip do Saúde ou export.xml). opts: {fromDate, onProgress}
  // Devolve {daily, counts, records, firstDate, lastDate}.
  async function parseExportFile(file, opts) {
    opts = opts || {};
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const isZip = head[0] === 0x50 && head[1] === 0x4b;

    let stream;
    if (isZip) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Este navegador não descompacta .zip — descompacte no app Arquivos e importe o export.xml.');
      }
      const entry = await findExportEntry(file);
      stream = trackProgress(file.slice(entry.start, entry.start + entry.compSize).stream(), entry.compSize, opts.onProgress);
      if (entry.method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
      else if (entry.method !== 0) throw new Error('Compactação não suportada no zip (método ' + entry.method + ').');
    } else {
      stream = trackProgress(file.stream(), file.size, opts.onProgress);
    }

    const st = newState(opts.fromDate);
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let buf = '', sinceYield = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      buf = consume(st, buf + dec.decode(r.value, { stream: true }));
      sinceYield += r.value.byteLength;
      if (sinceYield > 4_000_000) { // respira p/ não travar a interface
        sinceYield = 0;
        await new Promise(res => setTimeout(res, 0));
      }
    }
    consume(st, buf + dec.decode(), true);
    return finalize(st);
  }

  const HealthKit = { parseExportFile, METRICS, LABELS };
  if (typeof window !== 'undefined') window.HealthKit = HealthKit;
  if (typeof module !== 'undefined' && module.exports) module.exports = HealthKit;
})();
