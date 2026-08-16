// Teste do js/health.js em Node: XML direto e dentro de um zip sintético.
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
const require = createRequire(import.meta.url);
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// caminhos portáteis: RAIZ é a pasta do projeto, TMP a pasta temporária do SO
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = tmpdir();
const HK = require(join(RAIZ, 'js/health.js'));

let fails = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra != null ? '  [' + JSON.stringify(extra) + ']' : ''));
  if (!ok) fails++;
};

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData>
<HealthData locale="pt_BR">
 <ExportDate value="2026-08-07 10:00:00 -0300"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone de Daniel" unit="count" startDate="2026-08-01 09:00:00 -0300" endDate="2026-08-01 09:10:00 -0300" value="500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone de Daniel" unit="count" startDate="2026-08-01 10:00:00 -0300" endDate="2026-08-01 10:10:00 -0300" value="700"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-08-01 09:05:00 -0300" endDate="2026-08-01 09:15:00 -0300" value="900"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-08-01 18:00:00 -0300" endDate="2026-08-01 18:10:00 -0300" value="400"/>
 <Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="Apple Watch" unit="mi" startDate="2026-08-01 09:00:00 -0300" endDate="2026-08-01 10:00:00 -0300" value="1"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="Cal" startDate="2026-08-01 09:00:00 -0300" endDate="2026-08-01 10:00:00 -0300" value="300"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="kJ" startDate="2026-08-01 11:00:00 -0300" endDate="2026-08-01 12:00:00 -0300" value="418.4"/>
 <Record type="HKQuantityTypeIdentifierBasalEnergyBurned" sourceName="Apple Watch" unit="Cal" startDate="2026-08-01 00:00:00 -0300" endDate="2026-08-01 23:59:00 -0300" value="1600"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-08-01 12:00:00 -0300" endDate="2026-08-01 12:00:00 -0300" value="55"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-08-01 20:00:00 -0300" endDate="2026-08-01 20:00:00 -0300" value="57"/>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" unit="ms" startDate="2026-08-01 07:00:00 -0300" endDate="2026-08-01 07:00:00 -0300" value="45.5"/>
 <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Apple Watch" unit="mL/min·kg" startDate="2026-08-01 09:30:00 -0300" endDate="2026-08-01 09:30:00 -0300" value="42.3"/>
 <Record type="HKQuantityTypeIdentifierAppleExerciseTime"
   sourceName="Apple Watch" unit="min"
   startDate="2026-08-01 09:00:00 -0300" endDate="2026-08-01 09:35:00 -0300" value="35"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-08-01 23:30:00 -0300" endDate="2026-08-02 06:30:00 -0300" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-08-02 06:30:00 -0300" endDate="2026-08-02 07:00:00 -0300" value="HKCategoryValueSleepAnalysisAwake"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone de Daniel" startDate="2026-08-02 00:00:00 -0300" endDate="2026-08-02 06:40:00 -0300" value="HKCategoryValueSleepAnalysisAsleepUnspecified"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-08-01 22:00:00 -0300" endDate="2026-08-01 23:00:00 -0300" value="HKCategoryValueSleepAnalysisInBed"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone de Daniel" unit="count" startDate="2020-01-01 09:00:00 -0300" endDate="2020-01-01 09:10:00 -0300" value="123"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Balança" unit="kg" startDate="2026-08-01 08:00:00 -0300" endDate="2026-08-01 08:00:00 -0300" value="82"/>
</HealthData>
`;

async function runChecks(label, res) {
  const d1 = res.daily['2026-08-01'] || {};
  const d2 = res.daily['2026-08-02'] || {};
  check(label + ': passos = maior fonte (1300, não 2500)', d1.steps === 1300, d1.steps);
  check(label + ': distância mi→km', d1.distKm === 1.61, d1.distKm);
  check(label + ': kcal ativa Cal+kJ (400)', d1.kcalOut === 400, d1.kcalOut);
  check(label + ': kcal basal', d1.kcalBasal === 1600);
  check(label + ': FC repouso média (56)', d1.hrRest === 56, d1.hrRest);
  check(label + ': HRV', d1.hrv === 45.5);
  check(label + ': VO2max', d1.vo2max === 42.3);
  check(label + ': exercício multi-linha (35)', d1.exMin === 35, d1.exMin);
  check(label + ': sono no dia que acorda, maior fonte (420)', d2.sleepMin === 420, d2.sleepMin);
  check(label + ': sono não vaza p/ dia 01', d1.sleepMin == null, d1.sleepMin);
  check(label + ': fromDate filtra 2020', !res.daily['2020-01-01']);
  check(label + ': BodyMass ignorado', d1.bodyMass === undefined && Object.keys(d1).length === 8, Object.keys(d1));
  check(label + ': firstDate/lastDate', res.firstDate === '2026-08-01' && res.lastDate === '2026-08-02', [res.firstDate, res.lastDate]);
}

// ---- XML direto ----
const xmlBlob = new Blob([XML]);
await runChecks('xml', await HK.parseExportFile(xmlBlob, { fromDate: '2026-01-01' }));

// ---- sem fromDate: 2020 entra ----
const all = await HK.parseExportFile(new Blob([XML]));
check('sem fromDate inclui 2020', all.daily['2020-01-01'] && all.daily['2020-01-01'].steps === 123);

// ---- zip sintético (deflate-raw + diretório central mínimo) ----
function makeZip(name, data) {
  const nameB = Buffer.from(name);
  const comp = zlib.deflateRawSync(data);
  const crc = zlib.crc32 ? zlib.crc32(data) : 0;
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(0, 12);
  cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameB.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
  cd.writeUInt32LE(0, 42); // local offset = 0
  const local = Buffer.concat([lh, nameB, comp]);
  const central = Buffer.concat([cd, nameB]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}
const zipBuf = makeZip('apple_health_export/export.xml', Buffer.from(XML));
let progressCalls = 0, lastFrac = 0;
const zres = await HK.parseExportFile(new Blob([zipBuf]), {
  fromDate: '2026-01-01',
  onProgress: f => { progressCalls++; lastFrac = f; },
});
await runChecks('zip', zres);
check('zip: progresso chegou a 100%', lastFrac === 1 && progressCalls >= 1, [progressCalls, lastFrac]);

// zip sem XML do Saúde -> erro claro, dizendo o que veio no lugar
// (quem escolhe é o CONTEÚDO, não o nome: em iPhone traduzido o arquivo não
// se chama export.xml. A cobertura por idioma está em fase2-proxy/test/import-saude.mjs.)
const bad = makeZip('outra-coisa.txt', Buffer.from('oi'));
let err = null;
try { await HK.parseExportFile(new Blob([bad])); } catch (e) { err = e.message; }
check('zip sem XML do Saúde dá erro claro',
  /XML do app Saúde/.test(err || '') && /outra-coisa\.txt/.test(err || ''), err);

console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
