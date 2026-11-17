const test = require('node:test');
const assert = require('node:assert/strict');
const incidencias = require('../services/incidenciasService');
const { crearEscenario } = require('./helpers/escenario');

function escenario() {
  const e = crearEscenario();
  const cat = e.db.prepare('INSERT OR IGNORE INTO catalogos (tipo, valor, orden) VALUES (?, ?, ?)');
  [['cc_nomina', 'Sueldo Carga Académica'], ['cc_nomina', 'Imp.Clase Artis.Cult.yDep'], ['cc_nomina', 'Flex Act. Acad de Apoyo'],
    ['motivo_incidencia', 'BB_Tutoreo (Preparatoria).'], ['motivo_incidencia', 'B2_Cap.Profr(CADI Asore, Compet.)'],
    ['motivo_incidencia', 'D1_Activ. Artísticas, Cult Y Dep.'], ['motivo_incidencia', 'LB_Impart CursoTallGral']]
    .forEach(([t, v], i) => cat.run(t, v, i));
  const q = e.db.prepare('INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago, cerrada) VALUES (2026, ?, ?, ?, ?, ?)');
  return {
    ...e,
    q16: Number(q.run(16, '2026-08-16', '2026-08-31', '2026-08-30', 0).lastInsertRowid),
    q17: Number(q.run(17, '2026-09-01', '2026-09-15', '2026-09-15', 0).lastInsertRowid),
    q15: Number(q.run(15, '2026-08-01', '2026-08-15', '2026-08-15', 1).lastInsertRowid),
  };
}

const TUTOREO = {
  numContrato: '3077466', ccNomina: 'Sueldo Carga Académica', motivo: 'BB_Tutoreo (Preparatoria).',
  detalle: 'Tutoreo de 48 alumnos de 1er semestre', ceco: '5420103000', importeTotal: 10960, numPeriodos: 9,
};

test('alta: catálogos, importe por periodo calculado y fecha de inicio = fecha de pago de la quincena', () => {
  const { db, ids, q16 } = escenario();
  const i = incidencias.crear(db, { ...TUTOREO, docenteId: ids.maria, quincenaId: q16 });
  assert.deepEqual([i.importeTotal, i.numPeriodos, i.importePorPeriodo, i.aPartirDe, i.tipoContrato, i.origen, i.editable],
    [10960, 9, 1217.78, '2026-08-30', 'determinado', 'manual', true]);
  assert.equal(i.quincena.etiqueta, 'Q16');
  const sinQuincena = incidencias.crear(db, { ...TUTOREO, docenteId: ids.ana, numPeriodos: 1, aPartirDe: '15/09/2026' });
  assert.deepEqual([sinQuincena.pendiente, sinQuincena.aPartirDe, sinQuincena.importePorPeriodo], [true, '2026-09-15', 10960]);
});

test('alta: validaciones por campo', () => {
  const { db, ids, q15 } = escenario();
  assert.throws(() => incidencias.crear(db, { docenteId: 999, motivo: 'Inventado', ccNomina: 'X', ceco: '123', importeTotal: -1, numPeriodos: 0, elementoPep: 'x'.repeat(25) }),
    (e) => e.status === 400 && ['docenteId', 'motivo', 'ccNomina', 'ceco', 'importeTotal', 'numPeriodos', 'elementoPep', 'detalle']
      .every((c) => e.details.some((d) => d.campo === c)));
  assert.throws(() => incidencias.crear(db, { ...TUTOREO, docenteId: ids.maria, quincenaId: q15 }), { status: 423 });
});

test('editar y borrar; las de suplencia y las de quincena cerrada no se tocan', () => {
  const { db, ids, q16 } = escenario();
  const i = incidencias.crear(db, { ...TUTOREO, docenteId: ids.maria, quincenaId: q16 });
  const e = incidencias.actualizar(db, i.id, { numPeriodos: 7, detalle: 'Tutoreo de 50 alumnos' });
  assert.deepEqual([e.numPeriodos, e.importePorPeriodo, e.detalle], [7, 1565.71, 'Tutoreo de 50 alumnos']);

  const sup = Number(db.prepare(`INSERT INTO incidencias (docente_id, cc_nomina, motivo, detalle, ceco, importe_total, origen)
                                 VALUES (?, 'Flex Act. Acad de Apoyo', 'B2_Cap.Profr(CADI Asore, Compet.)', 'Sustituyó…', '5420103000', 54, 'suplencia')`)
    .run(ids.guillermo).lastInsertRowid);
  assert.throws(() => incidencias.actualizar(db, sup, { importeTotal: 1 }), { status: 409, code: 'INCIDENCIA_DE_SUPLENCIA' });
  assert.throws(() => incidencias.eliminar(db, sup), { status: 409 });

  db.prepare('UPDATE quincenas SET cerrada = 1 WHERE id = ?').run(q16);
  assert.throws(() => incidencias.actualizar(db, i.id, { importeTotal: 1 }), { status: 423 });
  db.prepare('UPDATE quincenas SET cerrada = 0 WHERE id = ?').run(q16);
  incidencias.eliminar(db, i.id);
  assert.throws(() => incidencias.obtener(db, i.id), { status: 404 });
});

test('copiar los pagos manuales de la quincena anterior sin duplicar ni copiar suplencias', () => {
  const { db, ids, q16, q17 } = escenario();
  incidencias.crear(db, { ...TUTOREO, docenteId: ids.maria, quincenaId: q16 });
  incidencias.crear(db, { ...TUTOREO, docenteId: ids.ana, quincenaId: q16, detalle: 'PAD de 12 profesores', motivo: 'B2_Cap.Profr(CADI Asore, Compet.)', importeTotal: 16463 });
  db.prepare(`INSERT INTO incidencias (quincena_id, docente_id, cc_nomina, motivo, detalle, ceco, importe_total, origen)
              VALUES (?, ?, 'Flex Act. Acad de Apoyo', 'B2_Cap.Profr(CADI Asore, Compet.)', 'Sustituyó…', '5420103000', 54, 'suplencia')`).run(q16, ids.guillermo);

  const r = incidencias.copiar(db, { desdeQuincenaId: q16, haciaQuincenaId: q17 });
  assert.deepEqual([r.copiadas, r.omitidas], [2, 0]);
  assert.deepEqual(r.incidencias.map((i) => [i.quincena.etiqueta, i.aPartirDe]), [['Q17', '2026-09-15'], ['Q17', '2026-09-15']]);
  assert.deepEqual(incidencias.copiar(db, { desdeQuincenaId: q16, haciaQuincenaId: q17 }).copiadas, 0); // ya estaban
  assert.throws(() => incidencias.copiar(db, { desdeQuincenaId: q16, haciaQuincenaId: q16 }), { status: 400 });
});

test('listar en el orden del Excel, filtros y reordenar', () => {
  const { db, ids, q16 } = escenario();
  const a = incidencias.crear(db, { ...TUTOREO, docenteId: ids.maria, quincenaId: q16 });
  const b = incidencias.crear(db, { ...TUTOREO, docenteId: ids.ana, quincenaId: q16 });
  const c = incidencias.crear(db, { ...TUTOREO, docenteId: ids.guillermo });
  assert.deepEqual(incidencias.listar(db, { quincenaId: String(q16) }).incidencias.map((i) => i.id), [a.id, b.id]);
  assert.deepEqual(incidencias.listar(db, { pendientes: 'true' }).incidencias.map((i) => i.id), [c.id]);
  assert.equal(incidencias.listar(db, { quincenaId: String(q16) }).totales.importe, 21920);
  incidencias.reordenar(db, { ids: [b.id, a.id] });
  assert.deepEqual(incidencias.listar(db, { quincenaId: String(q16) }).incidencias.map((i) => i.id), [b.id, a.id]);
  assert.throws(() => incidencias.reordenar(db, { ids: [a.id, a.id] }), { status: 400 });
  assert.throws(() => incidencias.reordenar(db, { ids: [9999] }), { status: 404 });
  assert.throws(() => incidencias.listar(db, { origen: 'otro' }), { status: 400 });
});
