const test = require('node:test');
const assert = require('node:assert/strict');
const bajaService = require('../services/bajaService');
const docentesService = require('../services/docentesService');
const { crearEscenario } = require('./helpers/escenario');

const BAJA = { activo: false, motivo: 'Sin disponibilidad de horario', observaciones: 'Sin turno matutino en ENE-MAY 2027', recontratable: true };

test('motivos de baja con recontratable sugerido (07 §8 #30)', () => {
  const { db } = crearEscenario();
  assert.deepEqual(bajaService.motivosBaja(db).map((m) => [m.motivo, m.recontratableSugerido]), [
    ['Sin disponibilidad de horario', true], ['Renuncia', true], ['No cumplió expectativas', false],
    ['Problemas de conducta o disciplina', false], ['Otro', null],
  ]);
});

test('dar de baja: motivo, observaciones y recontratable son obligatorios → 400', () => {
  const { db, ids } = crearEscenario();
  assert.throws(() => bajaService.cambiarEstatus(db, ids.maria, {}), { status: 400, code: 'ACTIVO_OBLIGATORIO' });
  assert.throws(
    () => bajaService.cambiarEstatus(db, ids.maria, { activo: false }),
    (e) => e.status === 400 && e.details.map((d) => d.campo).join() === 'motivo,observaciones,recontratable',
  );
  assert.throws(() => bajaService.cambiarEstatus(db, ids.maria, { ...BAJA, observaciones: '   ' }), { status: 400 });
  assert.throws(() => bajaService.cambiarEstatus(db, ids.maria, { ...BAJA, recontratable: 'si' }), { status: 400 });
  assert.throws(() => bajaService.cambiarEstatus(db, ids.maria, { ...BAJA, motivo: 'Inventado' }), { status: 400 });
  assert.throws(() => bajaService.cambiarEstatus(db, 9999, BAJA), { status: 404 });
});

test('dar de baja: punto gris, recontratable y registro en el historial', () => {
  const { db, ids } = crearEscenario();
  const r = bajaService.cambiarEstatus(db, ids.maria, BAJA);
  assert.deepEqual(r.docente, { id: ids.maria, activo: false, recontratable: true });
  assert.equal(r.baja.periodo, 'AGO-DIC 2026');
  assert.equal(r.baja.observaciones, 'Sin turno matutino en ENE-MAY 2027');
  assert.throws(() => bajaService.cambiarEstatus(db, ids.maria, BAJA), { status: 409, code: 'YA_INACTIVO' });

  const fila = docentesService.listar(db, {}, { hoy: '2026-11-11' }).docentes.find((d) => d.id === ids.maria);
  assert.deepEqual([fila.activo, fila.recontratable], [false, true]);
  assert.equal(docentesService.detalle(db, ids.maria).bajas.length, 1);
});

test('reactivar: no recontratable pide confirmación (409) con las observaciones', () => {
  const { db, ids } = crearEscenario();
  bajaService.cambiarEstatus(db, ids.ana, { ...BAJA, motivo: 'No cumplió expectativas', observaciones: 'Quejas de alumnos', recontratable: false });
  assert.throws(
    () => bajaService.cambiarEstatus(db, ids.ana, { activo: true }),
    (e) => e.status === 409 && e.code === 'CONFIRMAR_NO_RECONTRATABLE' && e.details[0].observaciones === 'Quejas de alumnos',
  );
  const r = bajaService.cambiarEstatus(db, ids.ana, { activo: true, confirmarNoRecontratable: true });
  assert.deepEqual(r.docente, { id: ids.ana, activo: true, recontratable: false });
  const [baja] = bajaService.historial(db, ids.ana);
  assert.ok(baja.fechaReactivacion);
  assert.equal(baja.recontratable, false);
  assert.throws(() => bajaService.cambiarEstatus(db, ids.ana, { activo: true }), { status: 409, code: 'YA_ACTIVO' });
});

test('reactivar recontratable no pide confirmación; historial más reciente primero', () => {
  const { db, ids } = crearEscenario();
  bajaService.cambiarEstatus(db, ids.maria, BAJA);
  bajaService.cambiarEstatus(db, ids.maria, { activo: true });
  bajaService.cambiarEstatus(db, ids.maria, { ...BAJA, motivo: 'Renuncia', observaciones: 'Se mudó' });
  const h = bajaService.historial(db, ids.maria);
  assert.deepEqual(h.map((b) => b.motivo), ['Renuncia', 'Sin disponibilidad de horario']);
  assert.equal(h[0].fechaReactivacion, null);
});

test('filtros de la tabla: activo y recontratable', () => {
  const { db, ids } = crearEscenario();
  bajaService.cambiarEstatus(db, ids.ana, { ...BAJA, recontratable: false, motivo: 'No cumplió expectativas' });
  const listar = (q) => docentesService.listar(db, q, { filtrar: docentesService.filtrarBasico }).docentes.map((d) => d.nomina);
  assert.deepEqual(listar({ activo: 'false' }), ['L03500003']);
  assert.equal(listar({ activo: 'true' }).length, 3);
  assert.deepEqual(listar({ recontratable: 'false' }), ['L03500003']);
  assert.equal(listar({}).length, 4);
});

test('baja manual desde la ficha: sin periodo explícito queda en el periodo actual', () => {
  const { db, ids } = crearEscenario();
  db.prepare("INSERT INTO periodos (clave, etiqueta_opina, fecha_inicio, fecha_fin) VALUES ('ENE-MAY 2027', '2027 Ene - May', '2027-01-01', '2027-05-31')").run();
  const r = bajaService.cambiarEstatus(db, ids.maria, BAJA);
  assert.equal(r.baja.periodo, 'AGO-DIC 2026');
  const otroPeriodo = db.prepare("SELECT id FROM periodos WHERE clave = 'ENE-MAY 2027'").get().id;
  bajaService.registrarBaja(db, ids.ana, { motivo: 'Renuncia', observaciones: 'x', recontratable: true }, otroPeriodo);
  assert.equal(bajaService.historial(db, ids.ana)[0].periodo, 'ENE-MAY 2027');
});
