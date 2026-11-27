const test = require('node:test');
const assert = require('node:assert/strict');
const faltas = require('../services/faltasService');
const suplencias = require('../services/suplenciaService');
const texto = require('../lib/textoSuplencia');
const { crearEscenario } = require('./helpers/escenario');

const BASE = { motivo: 'Falta por asunto personal' };

/** Escenario con contratos: Guillermo (suplente) tiene 5500002; Ana no tiene contratos. */
function escenario() {
  const e = crearEscenario();
  e.db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE docente_id = ?').run('5500002', e.ids.guillermo);
  const asig = (crn) => e.db.prepare('SELECT id FROM asignaturas WHERE crn = ?').get(crn).id;
  return { ...e, a16001: asig('16001'), a16002: asig('16002') };
}

const incidencias = (db) => db.prepare("SELECT * FROM incidencias WHERE origen = 'suplencia' ORDER BY id").all();

test('texto de fechas: un día, consecutivos y sueltos', () => {
  assert.equal(texto.textoFechas(['2026-08-17']), 'del día 17 de agosto');
  assert.equal(texto.textoFechas(['2026-09-03', '2026-09-01', '2026-09-02', '2026-09-04']), 'del 1 al 4 de septiembre');
  assert.equal(texto.textoFechas(['2026-08-24', '2026-08-25', '2026-08-27', '2026-08-28']), 'del día 24, 25, 27 y 28 de agosto');
  assert.equal(texto.textoFechas(['2026-10-01', '2026-10-02']), 'del 1 al 2 de octubre');
});

test('al registrar la falta con suplente se crea su incidencia con el mismo monto y el texto de Nacional', () => {
  const { db, ids, a16001 } = escenario();
  const r = faltas.crear(db, {
    ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001], observaciones: 'Viaja a CDMX por examen',
    suplencias: [{ asignaturaId: a16001, fecha: '2026-08-17', docenteSuplenteId: ids.guillermo }],
  });
  assert.deepEqual(r.faltas[0].suplencia.monto, 54);
  assert.equal(r.faltas[0].suplencia.numContrato, '5500002'); // el primero del suplente
  const [i] = incidencias(db);
  assert.deepEqual([i.docente_id, i.num_contrato, i.cc_nomina, i.motivo, i.ceco, i.importe_total, i.num_periodos, i.quincena_id],
    [ids.guillermo, '5500002', 'Flex Act. Acad de Apoyo', 'B2_Cap.Profr(CADI Asore, Compet.)', '5420103000', 54, 1, null]);
  assert.equal(i.detalle, 'Sustituyó al docente María López Ruiz, nómina: L03500001 CRN 16001 de 3 horas a la semana, '
    + 'del día 17 de agosto, a pagar 1 día. 1 día* 54.00 = 54.00 Viaja a CDMX por examen');
});

test('agrupa días del mismo suplente, titular, CRN y mes; meses distintos van en filas separadas', () => {
  const { db, ids, a16002 } = escenario();
  const fechas = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-31', '2026-09-01'];
  faltas.crear(db, {
    ...BASE, docenteId: ids.maria, fechas, asignaturaIds: [a16002],
    suplencias: fechas.map((fecha) => ({ asignaturaId: a16002, fecha, docenteSuplenteId: ids.guillermo })),
  });
  const [ago, sep] = incidencias(db);
  assert.equal(incidencias(db).length, 2);
  assert.match(ago.detalle, /CRN 16002 de 5 horas a la semana, del día 17, 18, 19 y 31 de agosto, a pagar 4 días\. 4 días\* 106\.00 = 424\.00$/);
  assert.equal(ago.importe_total, 424);
  assert.match(sep.detalle, /del día 1 de septiembre, a pagar 1 día\. 1 día\* 106\.00 = 106\.00$/);
});

test('con reportes.agrupar_suplencias = 0 va una incidencia por día', () => {
  const { db, ids, a16002 } = escenario();
  db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('reportes.agrupar_suplencias', '0')").run();
  const fechas = ['2026-08-17', '2026-08-18'];
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas, asignaturaIds: [a16002], suplencias: fechas.map((fecha) => ({ asignaturaId: a16002, fecha, docenteSuplenteId: ids.guillermo })) });
  assert.equal(incidencias(db).length, 2);
});

test('contrato del suplente: se captura a mano (cualquier número), 422 si no son dígitos; vacío con aviso si no tiene', () => {
  const { db, ids, a16001 } = escenario();
  const [f] = faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001] }).faltas;
  // Retro de la cliente: el contrato del suplente no sale de los archivos, ella lo escribe
  const manual = faltas.asignarSuplencia(db, f.id, { docenteSuplenteId: ids.guillermo, numContrato: ' 5699999 ' });
  assert.deepEqual([manual.suplencia.numContrato, manual.avisos], ['5699999', []]);
  assert.throws(() => faltas.asignarSuplencia(db, f.id, { docenteSuplenteId: ids.guillermo, numContrato: '56-99' }),
    (e) => e.status === 422 && e.code === 'CONTRATO_INVALIDO');
  const r = faltas.asignarSuplencia(db, f.id, { docenteSuplenteId: ids.ana });
  assert.deepEqual([r.suplencia.numContrato, r.avisos], [null, ['SUPLENTE_SIN_CONTRATO']]);
  assert.throws(() => faltas.asignarSuplencia(db, f.id, { docenteSuplenteId: ids.maria }), { status: 400, code: 'SUPLENTE_ES_TITULAR' });
  assert.deepEqual(suplencias.contratos(db, ids.guillermo).map((c) => c.contrato), ['5500002']);
  // A Ana (sin contratos en sus grupos) se le propone el último que se le capturó
  faltas.asignarSuplencia(db, f.id, { docenteSuplenteId: ids.ana, numContrato: '5612345' });
  assert.deepEqual(suplencias.contratos(db, ids.ana).map((c) => c.contrato), ['5612345']);
});

test('falta IMSS: no se descuenta, pero el suplente cobra la tarifa y se anota el folio', () => {
  const { db, ids, a16001 } = escenario();
  const [f] = faltas.crear(db, {
    ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001], justificacion: 'incapacidad_imss', folioImss: 'UW465897',
    suplencias: [{ asignaturaId: a16001, fecha: '2026-08-17', docenteSuplenteId: ids.guillermo }],
  }).faltas;
  assert.deepEqual([f.montoDescuento, f.suplencia.monto], [0, 54]);
  assert.match(incidencias(db)[0].detalle, /= 54\.00 Incapacidad IMSS folio UW465897$/);
});

test('editar la falta actualiza la suplencia; cambiar de suplente y borrar ajustan la incidencia', () => {
  const { db, ids, a16001 } = escenario();
  const fechas = ['2026-08-17', '2026-08-20'];
  const r = faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas, asignaturaIds: [a16001], suplencias: fechas.map((fecha) => ({ asignaturaId: a16001, fecha, docenteSuplenteId: ids.guillermo })) });
  assert.equal(incidencias(db)[0].importe_total, 108); // agrupadas: 17 y 20

  faltas.actualizar(db, r.faltas[0].id, { monto: 50 });
  assert.equal(faltas.obtener(db, r.faltas[0].id).suplencia.monto, 50);
  assert.deepEqual(incidencias(db).map((i) => i.importe_total).sort(), [50, 54]); // montos distintos → filas distintas

  faltas.asignarSuplencia(db, r.faltas[1].id, { docenteSuplenteId: ids.ana });
  assert.deepEqual(incidencias(db).map((i) => i.docente_id).sort(), [ids.guillermo, ids.ana].sort());

  faltas.eliminar(db, r.faltas[0].id);
  assert.deepEqual(incidencias(db).map((i) => i.docente_id), [ids.ana]);
  faltas.quitarSuplencia(db, r.faltas[1].id);
  assert.equal(incidencias(db).length, 0);
  assert.throws(() => faltas.quitarSuplencia(db, r.faltas[1].id), { status: 404 });
});

test('una suplencia que no corresponde a ninguna falta deshace todo el registro', () => {
  const { db, ids, a16001, a16002 } = escenario();
  assert.throws(() => faltas.crear(db, {
    ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001],
    suplencias: [{ asignaturaId: a16002, fecha: '2026-08-17', docenteSuplenteId: ids.guillermo }],
  }), { status: 400, code: 'SUPLENCIA_SIN_FALTA' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM faltas').get().n, 0);
});

test('suplencia de un descuento manual: el texto usa el pago por día del periodo y el total real', () => {
  const { db, ids, a16001 } = escenario();
  const { faltas: [f] } = faltas.crear(db, { ...BASE, docenteId: ids.maria, modo: 'manual', asignaturaId: a16001,
    fechaTexto: '03/08/2026 al 16/08/2026', dias: 14, horasTexto: '6 horas= 14 días', monto: 3183.74 });
  faltas.asignarSuplencia(db, f.id, { docenteSuplenteId: ids.guillermo });
  const [i] = incidencias(db);
  assert.equal(i.importe_total, 3183.74);
  assert.match(i.detalle, /del 03\/08\/2026 al 16\/08\/2026, a pagar 14 días\. 14 días\* 227\.41 = 3183\.74$/);
});

test('suplencias de tarifa normal: el texto no cambia (n días × tarifa = total)', () => {
  const { db, ids, a16001 } = escenario();
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17', '2026-08-20'], asignaturaIds: [a16001],
    suplencias: ['2026-08-17', '2026-08-20'].map((fecha) => ({ asignaturaId: a16001, fecha, docenteSuplenteId: ids.guillermo })) });
  assert.match(incidencias(db)[0].detalle, /a pagar 2 días\. 2 días\* 54\.00 = 108\.00$/);
});

test('el contrato capturado del suplente se conserva aunque no esté en sus grupos (al editar, generar y en el reporte)', async () => {
  const reportes = require('../services/reporteService');
  const { db, ids, a16001 } = escenario();
  const [f] = faltas.crear(db, {
    ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [a16001],
    suplencias: [{ asignaturaId: a16001, fecha: '2026-08-17', docenteSuplenteId: ids.guillermo, numContrato: '5677777' }],
  }).faltas;
  faltas.actualizar(db, f.id, { observaciones: 'Cambio cualquiera' }); // se sincroniza la suplencia
  assert.equal(incidencias(db)[0].num_contrato, '5677777');
  const q = { id: Number(db.prepare("INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (2026, 16, '2026-08-16', '2026-08-31', '2026-08-30')").run().lastInsertRowid) };
  const v = reportes.validarIncidencias(db, q.id);
  assert.ok(!v.avisos.some((a) => /CONTRATO/.test(a.tipo)), JSON.stringify(v.avisos));
  const d = await reportes.generarDescuentos(db, q.id);
  assert.equal(d.asignadas, 1);
  assert.equal(incidencias(db)[0].num_contrato, '5677777');
  const inc = await reportes.generarIncidencias(db, q.id);
  assert.equal(inc.incidencias[0].numContrato, '5677777');
});
