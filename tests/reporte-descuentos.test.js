const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const faltas = require('../services/faltasService');
const reportes = require('../services/reporteService');
const quincenas = require('../services/quincenasService');
const { crearEscenario } = require('./helpers/escenario');

const BASE = { motivo: 'Falta por asunto personal' };

function escenario() {
  const e = crearEscenario();
  const ins = e.db.prepare('INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (2026, ?, ?, ?, ?)');
  const q16 = Number(ins.run(16, '2026-08-16', '2026-08-31', '2026-08-30').lastInsertRowid);
  const q17 = Number(ins.run(17, '2026-09-01', '2026-09-15', '2026-09-15').lastInsertRowid);
  e.db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE docente_id = ?').run('5500002', e.ids.guillermo);
  const a16001 = e.db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id;
  return { ...e, q16, q17, a16001 };
}

function leer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellDates: false });
  return { nombres: wb.SheetNames, hoja: wb.Sheets.Descuentos };
}

test('validar: incluye pendientes hasta el corte, marca IMSS y avisa; no cambia nada', () => {
  const { db, ids, q16, a16001 } = escenario();
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001] });
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-20'], asignaturaIds: [a16001], justificacion: 'cita_imss', folioImss: 'X1' });
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-09-03'], asignaturaIds: [a16001] }); // después del corte
  const v = reportes.validarDescuentos(db, q16);
  assert.deepEqual(v.filas.map((f) => [f.fecha, f.vaEnDescuentos, f.pendiente]), [['2026-08-17', true, true], ['2026-08-20', false, true]]);
  assert.deepEqual(v.totales, { faltas: 2, enDescuentos: 1, descuento: 54 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM faltas WHERE quincena_id IS NOT NULL').get().n, 0);
  assert.throws(() => reportes.validarDescuentos(db, 999), { status: 404 });
  assert.throws(() => reportes.validarDescuentos(db), { status: 400 });
});

test('generar Q16: asigna los pendientes, respeta excluir y arma el Excel con la plantilla y fila de total', async () => {
  const { db, ids, q16, a16001 } = escenario();
  const r1 = faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17', '2026-08-20'], observaciones: 'Viaje' });
  faltas.crear(db, { modo: 'manual', docenteId: ids.ana, motivo: 'Falta injustificadas', fechaTexto: '03/08/2026 al 16/08/2026', dias: 14, horasTexto: '6 horas= 14 días', monto: 3183.74 });
  const excluida = r1.faltas.find((f) => f.fecha === '2026-08-20' && f.asignatura.crn === '16002').id;

  const r = await reportes.generarDescuentos(db, q16, String(excluida));
  assert.equal(r.nombre, 'DESCUENTO-PREPA Q16.xlsx');
  assert.equal(r.asignadas, 4);
  assert.equal(faltas.obtener(db, excluida).pendiente, true);

  const { nombres, hoja } = leer(r.buffer);
  assert.deepEqual(nombres, ['Descuentos']);
  assert.match(String(hoja.A1.v), /^Nomina/); // el encabezado de la plantilla se conserva
  // Fila 2: María, CRN 16001, 17/08
  assert.deepEqual(['A2', 'B2', 'C2', 'D2', 'F2', 'G2', 'H2', 'K2'].map((c) => hoja[c].v),
    [3500001, 5500001, 'María López Ruiz', 1, 'Falta por asunto personal', '8 horas= 1 día completo', 5420103000, 54]);
  assert.equal(XLSX.SSF.format('yyyy-mm-dd', hoja.E2.v), '2026-08-17');
  assert.equal(hoja.I2.v, 'CRN 16001 de 3 horas a la semana, a descontar 54.00 = 54.00');
  // 4 faltas: 3 de María (16001 lunes, 16002 lunes, 16001 jueves) + la manual (al final, con el rango en texto)
  assert.deepEqual([hoja.E5.v, hoja.D5.v, hoja.K5.v], ['03/08/2026 al 16/08/2026', 14, 3183.74]);
  assert.deepEqual([hoja.K6.f, hoja.K6.v], ['SUM(K2:K5)', 3397.74]); // fórmula + valor ya calculado
  assert.equal(hoja.A6, undefined);
  assert.equal(hoja['!ref'], 'A1:L6');
});

test('el XML conserva los estilos de la plantilla y pide recalcular al abrir', async () => {
  const { db, ids, q16, a16001 } = escenario();
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001] });
  const { buffer } = await reportes.generarDescuentos(db, q16);
  const zip = await JSZip.loadAsync(buffer);
  const hoja = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(hoja, /<c r="E2" s="4"><v>\d+<\/v><\/c>/); // fecha con el formato de la plantilla
  assert.match(hoja, /<c r="K2" s="6"><v>54<\/v><\/c>/); // moneda
  assert.match(hoja, /<c r="K3" s="6"><f>SUM\(K2:K2\)<\/f><v>54<\/v><\/c>/);
  assert.match(await zip.file('xl/workbook.xml').async('string'), /fullCalcOnLoad="1"/);
  assert.ok(zip.file('xl/styles.xml'));
});

test('sin faltas: el archivo sale solo con encabezado y total en 0', async () => {
  const { db, q16 } = escenario();
  const { buffer, filas } = await reportes.generarDescuentos(db, q16);
  assert.equal(filas.length, 0);
  assert.equal(leer(buffer).hoja.K2.f, '0');
});

test('la suplencia pasa a la misma quincena con la fecha de pago; regenerar no duplica; cerrada no asigna', async () => {
  const { db, ids, q16, q17, a16001 } = escenario();
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001],
    suplencias: [{ asignaturaId: a16001, fecha: '2026-08-17', docenteSuplenteId: ids.guillermo }] });
  await reportes.generarDescuentos(db, q16);
  const inc = db.prepare("SELECT quincena_id, a_partir_de FROM incidencias WHERE origen = 'suplencia'").all();
  assert.deepEqual(inc, [{ quincena_id: q16, a_partir_de: '2026-08-30' }]);
  const otra = await reportes.generarDescuentos(db, q16);
  assert.equal(otra.filas.length, 1);
  assert.equal(quincenas.obtener(db, q16).descontado, 54);

  quincenas.actualizar(db, q17, { cerrada: true });
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-09-03'], asignaturaIds: [a16001] });
  const r17 = await reportes.generarDescuentos(db, q17);
  assert.deepEqual([r17.asignadas, r17.filas.length], [0, 0]);
});

test('quincenas: listar, actual, cambiar fecha de pago (actualiza la col. N de sus incidencias) y cerrar', () => {
  const { db, q16 } = escenario();
  assert.deepEqual(quincenas.listar(db, { anio: '2026' }).map((q) => q.etiqueta), ['Q16', 'Q17']);
  assert.equal(quincenas.actual(db, '2026-08-20').etiqueta, 'Q16');
  assert.equal(quincenas.actualizar(db, q16, { fechaPago: '31/08/2026' }).fechaPago, '2026-08-31');
  assert.equal(quincenas.actualizar(db, q16, { cerrada: true }).cerrada, true);
  assert.throws(() => quincenas.actualizar(db, q16, { fechaPago: 'mañana' }), { status: 400 });
  assert.throws(() => quincenas.actual(db, '2030-01-01'), { status: 404 });
});
