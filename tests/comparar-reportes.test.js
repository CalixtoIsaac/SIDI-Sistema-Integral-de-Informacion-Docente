const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const XLSX = require('xlsx');
const reportes = require('../services/reporteService');
const faltas = require('../services/faltasService');
const { crearEscenario } = require('./helpers/escenario');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'comparar-reportes.js');

function correr(...args) {
  try {
    return { codigo: 0, salida: execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' }) };
  } catch (e) {
    return { codigo: e.status, salida: e.stdout };
  }
}

test('comparar-reportes: sin diferencias contra sí mismo; detecta contrato distinto y marca $53 y la falta de total como esperadas', async () => {
  const { db, ids } = crearEscenario();
  const q = Number(db.prepare("INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (2026, 16, '2026-08-16', '2026-08-31', '2026-08-30')").run().lastInsertRowid);
  const a = db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id;
  const b = db.prepare("SELECT id FROM asignaturas WHERE crn = '16002'").get().id;
  faltas.crear(db, { motivo: 'Falta por asunto personal', docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a, b] });
  const { buffer } = await reportes.generarDescuentos(db, q);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidi-cmp-'));
  const generado = path.join(dir, 'gen.xlsx');
  const original = path.join(dir, 'orig.xlsx');
  fs.writeFileSync(generado, buffer);

  const igual = correr(generado, generado);
  assert.equal(igual.codigo, 0);
  assert.match(igual.salida, /Resultado: ✔ sin diferencias/);

  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
  wb.Sheets.Descuentos.K2.v = 53;          // error de captura conocido
  wb.Sheets.Descuentos.B3.v = 1234567;     // contrato distinto
  delete wb.Sheets.Descuentos.K4;          // sin fila de total
  XLSX.writeFile(wb, original);
  const r = correr(original, generado);
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /fila 3 → 3 \(CRN 16002\): distinto en contrato/);
  assert.match(r.salida, /monto 53 en el original es error de captura/);
  assert.match(r.salida, /el original no trae fila de total/);
  assert.match(r.salida, /Resultado: ✘ \d+ diferencia/); // el original simulado además pierde estilos al reescribirlo
  assert.doesNotMatch(r.salida, /María|L03500001|3500001/); // nunca imprime nombres ni nóminas
});
