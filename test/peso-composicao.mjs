// Smoke test: campos de % gordura e % massa magra junto do peso.
import { abrirNavegador, paginaLogada, APP as BASE } from './_comum.mjs';
let fails = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra != null ? '  [' + extra + ']' : ''));
  if (!ok) fails++;
}

const browser = await abrirNavegador();
const { page } = await paginaLogada(browser, { onErro: e => { console.log('PAGEERROR', e.message); fails++; } });

// ---- card renovado na aba Hoje ----
check('titulo do card', (await page.textContent('.weight-card h3')) === 'Peso e composição corporal');
const inputs = page.locator('.weight-card .comp-grid input');
check('3 campos no card', await inputs.count() === 3);
const labels = await page.locator('.weight-card .comp-grid .lbl').allTextContents();
check('rotulos', JSON.stringify(labels) === JSON.stringify(['Peso (kg)', 'Gordura (%)', 'Massa magra (%)']), labels.join('|'));

// ---- preenche peso + gordura + massa magra (com vírgula p/ testar conversão) ----
async function setField(i, v) { await inputs.nth(i).fill(v); await inputs.nth(i).blur(); }
await setField(0, '82.4');
await setField(1, '24.5');
let derived = (await page.textContent('.comp-derived')).trim();
check('derivado so com gordura', derived === '≈ 20,2 kg de gordura', derived);
await setField(2, '72');
derived = (await page.textContent('.comp-derived')).trim();
check('derivado com os dois', derived === '≈ 20,2 kg de gordura · ≈ 59,3 kg de massa magra', derived);

let st = await page.evaluate(() => JSON.parse(localStorage.getItem('diario_kcal_v1')));
const hoje = await page.evaluate(() => window.App && Object.keys(JSON.parse(localStorage.getItem('diario_kcal_v1')).bodyComp)[0]);
check('bodyComp salvo', st.bodyComp && st.bodyComp[hoje] && st.bodyComp[hoje].fat === 24.5 && st.bodyComp[hoje].lean === 72, JSON.stringify(st.bodyComp));
check('peso salvo como numero', st.weights[hoje] === 82.4);

// ---- histórico: gráficos aparecem ----
await page.click('[data-tab=hist]');
check('grafico gordura', await page.locator('#tab-hist h3:has-text("Gordura corporal (%)")').count() === 1);
check('grafico massa magra', await page.locator('#tab-hist h3:has-text("Massa magra (%)")').count() === 1);
check('svg nos 2 graficos', await page.locator('#tab-hist .card:has(h3:has-text("corporal (%)")) svg.linechart').count() >= 1);
await page.screenshot({ path: 'hist.png', fullPage: true });

// ---- persistencia apos reload ----
await page.reload();
await page.waitForSelector('.weight-card');
const vals = [];
for (let i = 0; i < 3; i++) vals.push(await inputs.nth(i).inputValue());
check('persiste apos reload', JSON.stringify(vals) === JSON.stringify(['82.4', '24.5', '72']), vals.join('|'));
await page.screenshot({ path: 'hoje.png', fullPage: false, clip: null }).catch(() => {});
await page.locator('.weight-card').screenshot({ path: 'card.png' });

// ---- decimal ----
await setField(1, '23.7');
st = await page.evaluate(() => JSON.parse(localStorage.getItem('diario_kcal_v1')));
check('decimal salvo', st.bodyComp[hoje].fat === 23.7, JSON.stringify(st.bodyComp[hoje]));

// ---- aviso quando soma passa de 100% ----
await setField(2, '80');
derived = (await page.textContent('.comp-derived')).trim();
const warned = await page.locator('.comp-derived.comp-warn').count() === 1;
check('aviso soma > 100%', warned && derived.includes('103,7%') && derived.includes('confira'), derived);
await page.locator('.weight-card').screenshot({ path: 'card-warn.png' });

// ---- limpar os dois campos remove a entrada e os gráficos ----
await setField(1, '');
await setField(2, '');
st = await page.evaluate(() => JSON.parse(localStorage.getItem('diario_kcal_v1')));
check('entrada removida ao limpar', st.bodyComp[hoje] === undefined, JSON.stringify(st.bodyComp));
check('derivado some', await page.locator('.comp-derived').isHidden());
await page.click('[data-tab=hist]');
check('graficos somem sem dados', await page.locator('#tab-hist h3:has-text("corporal (%)")').count() === 0
  && await page.locator('#tab-hist h3:has-text("Massa magra")').count() === 0);

// ---- import (merge) traz bodyComp ----
await page.evaluate(() => {
  window.Store.importJSON(JSON.stringify({ bodyComp: { '2026-08-01': { fat: 26, lean: 70 }, '2026-08-05': { fat: 25.1 } } }), 'merge');
});
st = await page.evaluate(() => JSON.parse(localStorage.getItem('diario_kcal_v1')));
check('merge import', st.bodyComp['2026-08-01'].fat === 26 && st.bodyComp['2026-08-05'].fat === 25.1, JSON.stringify(st.bodyComp));
await page.reload();
await page.click('[data-tab=hist]');
check('grafico volta apos import', await page.locator('#tab-hist h3:has-text("Gordura corporal (%)")').count() === 1);
// massa magra: só 1 ponto (2026-08-01) — gráfico ainda renderiza
check('grafico massa magra com 1 ponto', await page.locator('#tab-hist h3:has-text("Massa magra (%)")').count() === 1);

// ---- export inclui bodyComp ----
const exp = await page.evaluate(() => JSON.parse(window.Store.exportJSON()));
check('export inclui bodyComp', !!exp.bodyComp && exp.bodyComp['2026-08-01'].lean === 70);

// ---- estado legado sem bodyComp não quebra (migração) ----
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('diario_kcal_v1'));
  delete s.bodyComp;
  localStorage.setItem('diario_kcal_v1', JSON.stringify(s));
});
await page.reload();
await page.waitForSelector('.weight-card');
check('migra estado antigo sem bodyComp', await page.locator('.weight-card .comp-grid input').count() === 3);

await browser.close();
console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
