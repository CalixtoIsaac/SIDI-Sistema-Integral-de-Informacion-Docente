/**
 * Resumen de la quincena por docente (GET /faltas/resumen-quincena) = hoja detalle. Datos inventados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const faltas = require('../services/faltasService');
const reporteService = require('../services/reporteService');
const { resumenQuincena } = require('../services/resumenQuincenaService');
const { crearEscenario } = require('./helpers/escenario');

/** Q16 2026 (16–31 ago). María falta el 17 en 2 CRN; Ana tiene incapacidad el 18 y la cubre Guillermo. */
function escenario() {
  const e = crearEscenario();
  const { db, ids } = e;
  const asig = (crn) => db.prepare('SELECT id FROM asignaturas WHERE crn = ? AND periodo_id = 1').get(crn).id;
  db.prepare("UPDATE asignaturas SET num_contrato = '5500003' WHERE docente_id = ?").run(ids.ana);
  const q = Number(db.prepare("INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (2026, 16, '2026-08-16', '2026-08-31', '2026-08-28')").run().lastInsertRowid);
  const base = { motivo: 'Falta por asunto personal' };
  faltas.crear(db, { ...base, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [asig('16001'), asig('16002')] });
  faltas.crear(db, { ...base, docenteId: ids.ana, fechas: ['2026-08-18'], asignaturaIds: [asig('16434')], justificacion: 'incapacidad_imss',
    folioImss: 'UW1', suplencias: [{ asignaturaId: asig('16434'), fecha: '2026-08-18', docenteSuplenteId: ids.guillermo }] });
  faltas.crear(db, { ...base, docenteId: ids.maria, fechas: ['2026-09-02'], asignaturaIds: [asig('16001')] }); // fuera de Q16
  return { ...e, q };
}

test('resumen de quincena: por docente, con pendientes ≤ fin y sin tocar la BD', () => {
  const { db, ids, q } = escenario();
  const r = resumenQuincena(db, { quincenaId: q });
  assert.equal(r.quincena.numero, 16);
  const porId = Object.fromEntries(r.docentes.map((d) => [d.docenteId, d]));
  assert.deepEqual(Object.keys(porId).map(Number).sort(), [ids.maria, ids.ana].sort());
  assert.equal(porId[ids.maria].faltas, 2);
  assert.equal(porId[ids.maria].pendientes, 2);
  assert.ok(porId[ids.maria].descontado > 0);
  assert.equal(porId[ids.maria].pagadoSuplentes, 0);
  assert.equal(porId[ids.ana].descontado, 0);            // IMSS: no se descuenta
  assert.equal(porId[ids.ana].pagadoSuplentes, 65);       // pero sí se paga al suplente
  assert.equal(porId[ids.ana].diferencia, -65);
  assert.equal(r.totales.faltas, 3);
  assert.equal(r.totales.diferencia, Math.round((r.totales.descontado - r.totales.pagadoSuplentes) * 100) / 100);
  assert.equal(db.prepare('SELECT COUNT(*) FROM faltas WHERE quincena_id IS NOT NULL').pluck().get(), 0);
});

test('resumen de quincena: coincide con la hoja detalle del Excel de Incidencias ya generado', async () => {
  const { db, q } = escenario();
  const { detalle } = await reporteService.generarIncidencias(db, q);
  const r = resumenQuincena(db, { quincenaId: q });
  assert.equal(r.totales.pendientes, 0);
  assert.deepEqual(r.docentes.map((d) => [d.nominaNacional, d.descontado]).sort(),
    detalle.map((d) => [d.nominaNacional, d.descontado]).sort());
});

test('resumen de quincena: validaciones', () => {
  const { db } = escenario();
  assert.throws(() => resumenQuincena(db, {}), (e) => e.status === 400);
  assert.throws(() => resumenQuincena(db, { quincenaId: 999 }), (e) => e.status === 404);
});
