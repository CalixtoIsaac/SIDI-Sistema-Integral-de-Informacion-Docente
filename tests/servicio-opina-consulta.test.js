/**
 * Detalle OPINA del docente (GET /docentes/:id/opina) y comparativo docente × semestre
 * (GET /opina/comparativo). Datos inventados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { detalleDocente, comparativo } = require('../services/opinaConsultaService');
const { crearEscenario } = require('./helpers/escenario');

test('detalle OPINA: global ponderado, por CRN, reactivos v2 y comentarios del semestre más reciente', () => {
  const { db, ids } = crearEscenario();
  const r = detalleDocente(db, ids.maria);
  assert.deepEqual(r.periodo, { id: 2, clave: 'ENE-MAY 2026' });
  assert.deepEqual(r.periodos.map((p) => p.clave), ['ENE-MAY 2026']);
  assert.deepEqual(r.global, { respuestas: 12, positivas: 11, porcentaje: 91.7, muestraSuficiente: true });
  assert.deepEqual(r.porCrn.map((g) => [g.crn, g.respuestas, g.porcentaje]), [['16001', 12, 91.7]]);
  // fixture: conocimiento Sí, retos "No estoy seguro", colaboración Sí, confianza No, inspiración Sí
  const reactivos = Object.fromEntries(r.reactivos.map((x) => [x.clave, x]));
  assert.deepEqual(r.reactivos.map((x) => x.clave), ['conocimiento', 'retos', 'colaboracion', 'confianza', 'inspiracion']);
  assert.equal(reactivos.conocimiento.porcentajeSi, 100);
  assert.deepEqual([reactivos.retos.noSeguro, reactivos.retos.porcentajeSi], [12, 0]);
  assert.equal(reactivos.confianza.no, 12);
  assert.deepEqual(r.comentarios, [{ crn: '16001', recomienda: false, texto: 'Llega tarde' }]);
});

test('detalle OPINA: muestra insuficiente marcada y docente sin OPINA vacío', () => {
  const { db, ids } = crearEscenario();
  const g = detalleDocente(db, ids.guillermo);
  assert.deepEqual(g.global, { respuestas: 3, positivas: 2, porcentaje: 66.7, muestraSuficiente: false });
  const a = detalleDocente(db, ids.ana);
  assert.equal(a.periodo, null);
  assert.equal(a.global, null);
  assert.deepEqual(a.comentarios, []);
  assert.throws(() => detalleDocente(db, 9999), (e) => e.status === 404);
  assert.throws(() => detalleDocente(db, ids.maria, { periodoId: 999 }), (e) => e.status === 404);
});

test('detalle OPINA: semestre pedido sin respuestas del docente → global null', () => {
  const { db, ids } = crearEscenario();
  const r = detalleDocente(db, ids.maria, { periodoId: 1 });
  assert.deepEqual(r.periodo, { id: 1, clave: 'AGO-DIC 2026' });
  assert.equal(r.global, null);
});

test('comparativo: tabla docente × semestre alineada, cronológica y con variación', () => {
  const { db, ids } = crearEscenario();
  // Copia de las respuestas de María en AGO-DIC 2026 con una "No" extra → 11/13
  const imp = Number(db.prepare("INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (1, 'x.xlsx', 'v2', 13)").run().lastInsertRowid);
  const ins = db.prepare('INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda) VALUES (?, 1, ?, ?, ?)');
  for (let i = 0; i < 11; i += 1) ins.run(imp, ids.maria, '16001', 1);
  ins.run(imp, ids.maria, '16001', 0);
  ins.run(imp, ids.maria, '16001', 0);

  const r = comparativo(db, {});
  assert.deepEqual(r.periodos.map((p) => p.clave), ['ENE-MAY 2026', 'AGO-DIC 2026']);
  const maria = r.docentes.find((d) => d.docenteId === ids.maria);
  assert.deepEqual(maria.celdas.map((c) => c?.porcentaje ?? null), [91.7, 84.6]);
  assert.equal(maria.variacion, -7.1);
  assert.equal(maria.tendencia, 'baja');
  const guillermo = r.docentes.find((d) => d.docenteId === ids.guillermo);
  assert.deepEqual(guillermo.celdas.map((c) => c && c.muestraSuficiente), [false, null]);
  assert.equal(guillermo.variacion, null);
  // Filtro por lista (en cualquier orden la respuesta sale cronológica)
  assert.deepEqual(comparativo(db, { periodos: '1,2' }).periodos.map((p) => p.id), [2, 1]);
  assert.deepEqual(comparativo(db, { periodos: '1' }).docentes.map((d) => d.docenteId), [ids.maria]);
});

test('comparativo: validaciones y BD sin OPINA', () => {
  const { db } = crearEscenario();
  assert.throws(() => comparativo(db, { periodos: 'x' }), (e) => e.status === 400);
  assert.throws(() => comparativo(db, { periodos: '77' }), (e) => e.status === 404);
  db.prepare('DELETE FROM opina_respuestas').run();
  assert.deepEqual(comparativo(db, {}).docentes, []);
});
