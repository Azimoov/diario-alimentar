// import-saude.mjs — testa a LEITURA do export do app Saúde (js/health.js)
// montando zips sintéticos que imitam o arquivo real da Apple.
//
// O caso que motivou este teste: num iPhone em PORTUGUÊS o export sai como
// "exportar.zip" e o XML lá dentro também vem traduzido. O parser antigo
// exigia o nome literal "export.xml" e recusava o arquivo do usuário com
// "export.xml não encontrado no zip". Agora quem decide é o CONTEÚDO
// (raiz <HealthData), então o idioma do aparelho deixa de importar.
//
// Roda sem servidor e sem navegador:  node test/import-saude.mjs
import { deflateRawSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HealthKit = require('../../js/health.js');

let fails = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (extra != null ? '  [' + String(extra).slice(0, 170) + ']' : ''));
  if (!ok) fails++;
};

// ---------- escritor de zip mínimo (só o que a Apple usa: deflate/stored) ----
function crc32(buf) {
  let c, tabela = crc32.t;
  if (!tabela) {
    tabela = crc32.t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabela[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = tabela[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// arquivos: [{ nome, texto, guardado? }]  guardado=true -> sem compressão
function montarZip(arquivos) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const cru = Buffer.from(a.texto, 'utf8');
    const comprimido = a.guardado ? cru : deflateRawSync(cru);
    const metodo = a.guardado ? 0 : 8;
    const crc = crc32(cru);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // versão
    lh.writeUInt16LE(metodo, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comprimido.length, 18);
    lh.writeUInt32LE(cru.length, 22);
    lh.writeUInt16LE(nome.length, 26);
    locais.push(lh, nome, comprimido);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(metodo, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comprimido.length, 20);
    ch.writeUInt32LE(cru.length, 24);
    ch.writeUInt16LE(nome.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrais.push(ch, nome);

    offset += lh.length + nome.length + comprimido.length;
  }
  const corpo = Buffer.concat(locais);
  const centro = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(centro.length, 12);
  fim.writeUInt32LE(corpo.length, 16);
  return new Blob([corpo, centro, fim]);
}

// ---------- conteúdos de mentira, no formato real ----------------------------
// Cabeçalho igual ao da Apple: DTD gigante antes da raiz (o "espiar" precisa
// aguentar isso sem se perder).
const DTD_GRANDE = '<!-- ' + 'x'.repeat(9000) + ' -->';
function xmlSaude(locale) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
${DTD_GRANDE}
]>
<HealthData locale="${locale}">
 <ExportDate value="2026-08-08 13:02:00 -0300"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-08-01 08:00:00 -0300" endDate="2026-08-01 08:10:00 -0300" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-08-01 18:00:00 -0300" endDate="2026-08-01 18:10:00 -0300" value="1500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-08-01 08:00:00 -0300" endDate="2026-08-01 08:10:00 -0300" value="5200"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-08-01 07:00:00 -0300" endDate="2026-08-01 07:01:00 -0300" value="52"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-08-01 22:00:00 -0300" endDate="2026-08-01 22:01:00 -0300" value="58"/>
 <Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="iPhone" unit="mi" startDate="2026-08-02 09:00:00 -0300" endDate="2026-08-02 09:30:00 -0300" value="1"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="kJ" startDate="2026-08-02 09:00:00 -0300" endDate="2026-08-02 09:30:00 -0300" value="418.4"/>
</HealthData>`;
}
// o export clínico: raiz diferente e, de propósito, MAIOR que o de verdade —
// se o parser escolhesse "o maior .xml", cairia nesta armadilha
const XML_CDA = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
${'<component>' + 'y'.repeat(40000) + '</component>'}
</ClinicalDocument>`;

async function importar(blob, opts) {
  return HealthKit.parseExportFile(blob, opts || {});
}
function conferirDados(nome, res) {
  // passos do dia 1: iPhone 3000+1500=4500, Watch 5200 -> usa a MAIOR fonte
  check(nome + ': não conta iPhone+Watch em dobro', res.daily['2026-08-01'].steps === 5200, res.daily['2026-08-01'].steps);
  check(nome + ': média de FC de repouso', res.daily['2026-08-01'].hrRest === 55, res.daily['2026-08-01'].hrRest);
  check(nome + ': milha vira km', res.daily['2026-08-02'].distKm === 1.61, res.daily['2026-08-02'].distKm);
  check(nome + ': kJ vira kcal', res.daily['2026-08-02'].kcalOut === 100, res.daily['2026-08-02'].kcalOut);
  check(nome + ': intervalo de datas', res.firstDate === '2026-08-01' && res.lastDate === '2026-08-02', res.firstDate + '..' + res.lastDate);
}

// ---------- 1) o export clássico, iPhone em inglês --------------------------
{
  const zip = montarZip([
    { nome: 'apple_health_export/export.xml', texto: xmlSaude('en_US') },
    { nome: 'apple_health_export/export_cda.xml', texto: XML_CDA },
  ]);
  const res = await importar(zip);
  check('export clássico (export.xml) é lido', res.records === 7, res.records);
  conferirDados('clássico', res);
}

// ---------- 2) O CASO DO USUÁRIO: iPhone em português -----------------------
// nomes traduzidos (exportar.zip -> exportar.xml), CDA maior como isca
{
  const zip = montarZip([
    { nome: 'exportar/exportar_cda.xml', texto: XML_CDA },
    { nome: 'exportar/exportar.xml', texto: xmlSaude('pt_BR') },
  ]);
  const res = await importar(zip);
  check('export em PORTUGUÊS (exportar.xml) é lido', res.records === 7, res.records);
  conferirDados('português', res);
}

// ---------- 3) outros idiomas, para não consertar só o português ------------
for (const [idioma, caminho] of [
  ['espanhol', 'exportación/exportación.xml'],
  ['alemão', 'apple_gesundheitsexport/Export.xml'],
  ['francês', 'exportation/exporter.xml'],
  ['japonês', '書き出したデータ/書き出したデータ.xml'],
]) {
  const zip = montarZip([
    { nome: caminho, texto: xmlSaude('xx_XX') },
    { nome: 'qualquer/export_cda.xml', texto: XML_CDA },
  ]);
  const res = await importar(zip);
  check('export em ' + idioma + ' é lido', res.records === 7, caminho + ' -> ' + res.records);
}

// ---------- 4) só o CDA no zip: recusa com mensagem útil --------------------
{
  const zip = montarZip([{ nome: 'exportar/exportar_cda.xml', texto: XML_CDA }]);
  let msg = '';
  try { await importar(zip); } catch (e) { msg = e.message; }
  check('zip só com CDA é recusado', /não achei o XML do app Saúde/.test(msg), msg);
  check('a mensagem mostra o que tinha no zip (ajuda a diagnosticar)', /exportar_cda\.xml/.test(msg), msg);
}

// ---------- 5) zip que não é do app Saúde -----------------------------------
{
  const zip = montarZip([
    { nome: 'fotos/gato.txt', texto: 'miau' },
    { nome: 'notas.xml', texto: '<notas><n>oi</n></notas>' },
  ]);
  let msg = '';
  try { await importar(zip); } catch (e) { msg = e.message; }
  check('zip alheio é recusado sem quebrar', /não achei o XML do app Saúde/.test(msg), msg);
}

// ---------- 6) export.xml solto (sem zip), como o app Arquivos entrega ------
{
  const res = await importar(new Blob([xmlSaude('pt_BR')]));
  check('export.xml solto (sem zip) é lido', res.records === 7, res.records);
  conferirDados('xml solto', res);
}

// ---------- 7) entrada sem compressão (stored) ------------------------------
{
  const zip = montarZip([{ nome: 'exportar/exportar.xml', texto: xmlSaude('pt_BR'), guardado: true }]);
  const res = await importar(zip);
  check('entrada sem compressão (stored) é lida', res.records === 7, res.records);
}

// ---------- 8) muitos arquivos de treino em volta ---------------------------
// export real vem cheio de rotas .gpx; o XML certo tem que ser achado no meio
{
  const arquivos = [];
  for (let i = 0; i < 300; i++) {
    arquivos.push({ nome: 'exportar/workout-routes/rota_' + i + '.gpx', texto: '<gpx><trk/></gpx>' });
  }
  arquivos.push({ nome: 'exportar/exportar.xml', texto: xmlSaude('pt_BR') });
  arquivos.push({ nome: 'exportar/exportar_cda.xml', texto: XML_CDA });
  const res = await importar(montarZip(arquivos));
  check('acha o XML no meio de centenas de rotas de treino', res.records === 7, res.records);
}

// ---------- 9) filtro por período ainda funciona ----------------------------
{
  const zip = montarZip([{ nome: 'exportar/exportar.xml', texto: xmlSaude('pt_BR') }]);
  const res = await importar(zip, { fromDate: '2026-08-02' });
  check('filtro de período descarta dias anteriores',
    !res.daily['2026-08-01'] && !!res.daily['2026-08-02'], Object.keys(res.daily).join(','));
}

// ---------- 10) progresso é reportado ---------------------------------------
{
  const zip = montarZip([{ nome: 'exportar/exportar.xml', texto: xmlSaude('pt_BR') }]);
  const fracoes = [];
  await importar(zip, { onProgress: f => fracoes.push(f) });
  check('barra de progresso recebe atualizações',
    fracoes.length > 0 && fracoes[fracoes.length - 1] === 1, JSON.stringify(fracoes));
}

console.log(fails ? 'RESULTADO: ' + fails + ' falha(s)' : 'RESULTADO: tudo passou');
process.exit(fails ? 1 : 0);
