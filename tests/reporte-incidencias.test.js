const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const faltas = require('../services/faltasService');
const incidencias = require('../services/incidenciasService');
const reportes = require('../services/reporteService');
const { crearEscenario } = require('./helpers/escenario');

const BASE = { motivo: 'Falta por asunto personal' };

/**
 * Q16: María falta lunes 17 y jueves 20 (16001) y la cubre Guillermo (una fila agrupada); también falta a 16002
 * el lunes sin suplente. Ana tiene incapacidad IMSS el martes 18 (16434) y la cubre Guillermo. Tutoreo de Pedro.
 */
function escenario() {
  const e = crearEscenario();
  const { db, ids } = e;
  const cat = db.prepare('INSERT OR IGNORE INTO catalogos (tipo, valor, orden) VALUES (?, ?, 0)');
  [['cc_nomina', 'Sueldo Carga Académica'], ['motivo_incidencia', 'BB_Tutoreo (Preparatoria).']].forEach(([t, v]) => cat.run(t, v));
  const q16 = Number(db.prepare("INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (2026, 16, '2026-08-16', '2026-08-31', '2026-08-30')").run().lastInsertRowid);
  db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE docente_id = ?').run('5500002', ids.guillermo);
  db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE docente_id = ?').run('5500003', ids.ana);
  const asig = (crn) => db.prepare('SELECT id FROM asignaturas WHERE crn = ?').get(crn).id;
  const pedro = db.prepare("SELECT id FROM docentes WHERE nomina = 'L03500005'").get().id;

  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17', '2026-08-20'], asignaturaIds: [asig('16001')],
    suplencias: ['2026-08-17', '2026-08-20'].map((fecha) => ({ asignaturaId: asig('16001'), fecha, docenteSuplenteId: ids.guillermo })) });
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [asig('16002')] });
  faltas.crear(db, { ...BASE, docenteId: ids.ana, fechas: ['2026-08-18'], asignaturaIds: [asig('16434')], justificacion: 'incapacidad_imss', folioImss: 'UW465897',
    suplencias: [{ asignaturaId: asig('16434'), fecha: '2026-08-18', docenteSuplenteId: ids.guillermo }] });
  incidencias.crear(db, { docenteId: pedro, numContrato: '3077466', ccNomina: 'Sueldo Carga Académica', motivo: 'BB_Tutoreo (Preparatoria).',
    detalle: 'Tutoreo de 48 alumnos de 1er semestre', ceco: '5420103000', importeTotal: 10960, numPeriodos: 9 });
  return { ...e, q16 };
}

test('validar: incidencias que entran (suplencias + pago manual pendiente) y avisos', () => {
  const { db, q16 } = escenario();
  const v = reportes.validarIncidencias(db, q16);
  assert.deepEqual(v.incidencias.map((i) => [i.origen, i.importeTotal]), [['suplencia', 108], ['suplencia', 65], ['manual', 10960]]);
  assert.equal(v.totales.importe, 11133);
  assert.deepEqual(v.avisos, []);
});

test('generar: hoja Incidencia con Tabla17 redimensionada, fórmula del importe por periodo y fecha de pago', async () => {
  const { db, q16 } = escenario();
  const r = await reportes.generarIncidencias(db, q16);
  assert.equal(r.nombre, 'INCIDENCIAS PREPA Q16.xlsx');
  const wb = XLSX.read(r.buffer, { type: 'buffer', cellFormula: true });
  assert.deepEqual(wb.SheetNames, ['Incidencia', 'detalle']);
  const h = wb.Sheets.Incidencia;
  assert.match(String(h.A1.v), /^Ruta para enviar solicitudes/); // texto fijo de A1 intacto
  assert.equal(h.A2.v, 'Nómina');
  assert.equal(h.A3, undefined); // fila 3 vacía
  assert.deepEqual(['A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'H4', 'K4', 'L4'].map((c) => h[c].v),
    [3500002, 5500002, 'Guillermo Sosa Von Putlitz', 'determinado', 'Flex Act. Acad de Apoyo', 'B2_Cap.Profr(CADI Asore, Compet.)', 5420103000, 108, 1]);
  assert.equal(h.G4.v, 'Sustituyó al docente María López Ruiz, nómina: L03500001 CRN 16001 de 3 horas a la semana, del día 17 y 20 de agosto, a pagar 2 días. 2 días* 54.00 = 108.00');
  assert.match(h.G5.v, /Ana Laura De la Cruz Pérez, nómina: L03500003 CRN 16434 .* = 65\.00 Incapacidad IMSS folio UW465897$/);
  assert.deepEqual([h.C6.v, h.K6.v, h.L6.v, h.M6.v], ['Pedro Ramírez Soto', 10960, 9, 1217.78]);
  assert.equal(h.M6.f, 'Tabla17[[#This Row],[Importe Total]]/Tabla17[[#This Row],[No. de periodos a repartir el pago]]');
  assert.equal(XLSX.SSF.format('dd/mm/yyyy', h.N4.v), '30/08/2026');

  const zip = await JSZip.loadAsync(r.buffer);
  assert.match(await zip.file('xl/tables/table1.xml').async('string'), / ref="A2:N6"/);
  assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'), /<conditionalFormatting sqref="D4:D6">/);
  assert.equal(Object.keys(zip.files).some((f) => f.includes('externalLink')), false);
});

test('generar: hoja detalle con valores (IMSS = 0 y diferencia negativa) y fila Total', async () => {
  const { db, q16 } = escenario();
  const { buffer } = await reportes.generarIncidencias(db, q16);
  const d = XLSX.read(buffer, { type: 'buffer', cellFormula: true }).Sheets.detalle;
  // Ana (IMSS): C = 0, D = 65 (Incidencia!K5), E = −65
  assert.deepEqual(['A2', 'B2', 'C2', 'D2', 'E2'].map((c) => d[c].v), [3500003, 'Ana Laura De la Cruz Pérez', 0, 65, -65]);
  assert.equal(d.D2.f, 'Incidencia!K5');
  assert.equal(d.F2.v, 'No se hace descuento correspondiente por incapacidad del IMSS');
  // María: descontado 54 + 106 + 54 = 214, pagado 108 → 106
  assert.deepEqual(['B3', 'C3', 'D3', 'E3'].map((c) => d[c].v), ['María López Ruiz', 214, 108, 106]);
  assert.equal(d.G3.v, 'Se descuenta y se toma la falta correspondiente.');
  assert.deepEqual(['B4', 'C4', 'D4', 'E4'].map((c) => d[c].v), ['Total', 214, 173, 41]);
  assert.deepEqual([d.C4.f, d.D4.f, d.E4.f], ['SUM(C2:C3)', 'SUM(D2:D3)', 'C4-D4']);
});

test('Descuentos y Incidencias de la misma quincena cuadran entre sí', async () => {
  const { db, q16 } = escenario();
  const desc = await reportes.generarDescuentos(db, q16);
  const inc = await reportes.generarIncidencias(db, q16);
  const totalDescuentos = desc.filas.reduce((s, f) => s + f.monto, 0);
  const totalDetalle = inc.detalle.reduce((s, d) => s + d.descontado, 0);
  assert.equal(totalDescuentos, totalDetalle); // 214: lo descontado en Descuentos = columna C de detalle
  assert.equal(inc.incidencias.length, 3);
});

test('excluir un pago manual lo deja para la siguiente quincena; sin datos sale con Total en 0', async () => {
  const { db, q16 } = escenario();
  const tutoreo = db.prepare("SELECT id FROM incidencias WHERE origen = 'manual'").get().id;
  const r = await reportes.generarIncidencias(db, q16, '', String(tutoreo));
  assert.equal(r.incidencias.length, 2);
  assert.equal(incidencias.obtener(db, tutoreo).pendiente, true);

  const vacio = crearEscenario();
  const q = Number(vacio.db.prepare("INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (2026, 18, '2026-09-16', '2026-09-30', '2026-09-30')").run().lastInsertRowid);
  const sinNada = await reportes.generarIncidencias(vacio.db, q);
  const wb = XLSX.read(sinNada.buffer, { type: 'buffer', cellFormula: true });
  assert.equal(wb.Sheets.detalle.B2.v, 'Total');
  assert.match(await (await JSZip.loadAsync(sinNada.buffer)).file('xl/tables/table1.xml').async('string'), / ref="A2:N3"/);
});
