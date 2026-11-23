const test = require('node:test');
const assert = require('node:assert/strict');
const campus = require('../services/opinaCampusService');
const { sembrar } = require('../lib/semillas');
const { crearEscenario } = require('./helpers/escenario');

/** Escenario con OPINA por alumno de ENE-MAY 2026 + las semillas oficiales de 07 §5.4. */
function escenario() {
  const e = crearEscenario();
  sembrar(e.db);
  const id = (clave) => e.db.prepare('SELECT id FROM periodos WHERE clave = ?').get(clave).id;
  return { ...e, id };
}

test('semillas: 88.3 → 85.9 (▼ 2.4) → 87.6 (▲ 1.7), promedio 87.3 y semestres sin captura', () => {
  const { db } = escenario();
  const r = campus.listar(db);
  assert.deepEqual(r.semestres.map((s) => [s.periodo, s.alumnos, s.positivas, s.opp, s.variacion, s.tendencia]), [
    ['ENE-MAY 2025', 3837, 3387, 88.3, null, null],
    ['AGO-DIC 2025', 3590, 3085, 85.9, -2.4, 'baja'],
    ['ENE-MAY 2026', 3804, 3333, 87.6, 1.7, 'sube'],
  ]);
  assert.equal(r.promedio, 87.3);
  assert.equal(r.ultimo.periodo, 'ENE-MAY 2026');
  assert.deepEqual(r.sinCaptura.map((p) => p.periodo), ['AGO-DIC 2024', 'AGO-DIC 2026']);
  assert.equal(r.semestres[0].fuente, 'EM25.xlsb');
});

test('junto a la cifra oficial va lo calculado del OPINA por alumno (si se importó ese semestre)', () => {
  const { db } = escenario();
  const [ene25, , ene26] = campus.listar(db).semestres;
  assert.equal(ene25.opinaAlumnos, null);
  // María 11/12 y Guillermo 2/3 → campus 13/15 = 86.7 %; promedio de maestros solo con muestra ≥ 10 (María, 91.7 %)
  assert.deepEqual(ene26.opinaAlumnos, { respuestas: 15, positivas: 13, calificacionCampus: 86.7, docentes: 2, grupos: 2, promedioMaestros: 91.7, docentesConMuestra: 1 });
});

test('capturar un semestre nuevo y editar uno existente (conserva fuente y región si no se mandan)', () => {
  const { db, id } = escenario();
  const { semestre } = campus.guardar(db, id('AGO-DIC 2026'), { alumnos: '3700', positivas: 3300, regionOpp: 86.1, fuente: 'AD26.xlsx' });
  assert.deepEqual([semestre.opp, semestre.variacion, semestre.tendencia, semestre.regionOpp], [89.2, 1.6, 'sube', 86.1]);
  db.prepare('UPDATE opina_campus_semestre SET region_opp = 85.7 WHERE periodo_id = ?').run(id('ENE-MAY 2026'));
  const editado = campus.guardar(db, id('ENE-MAY 2026'), { alumnos: 3804, positivas: 3300 }).semestre;
  assert.deepEqual([editado.opp, editado.fuente, editado.regionOpp], [86.8, 'EM26.xlsx', 85.7]); // conserva fuente y región
  assert.equal(campus.guardar(db, id('ENE-MAY 2026'), { alumnos: 3804, positivas: 3300, regionOpp: null }).semestre.regionOpp, null);
  assert.deepEqual(campus.listar(db).sinCaptura.map((p) => p.periodo), ['AGO-DIC 2024']);
});

test('validación: positivas ≤ alumnos, enteros, región 0–100; 404 si el semestre no existe; borrar', () => {
  const { db, id } = escenario();
  const campo = (e, c) => e.status === 400 && e.details.some((x) => x.campo === c);
  assert.throws(() => campus.guardar(db, id('AGO-DIC 2026'), { alumnos: 10, positivas: 11 }), (e) => campo(e, 'positivas'));
  assert.throws(() => campus.guardar(db, id('AGO-DIC 2026'), { alumnos: 0, positivas: 0 }), (e) => campo(e, 'alumnos'));
  assert.throws(() => campus.guardar(db, id('AGO-DIC 2026'), { alumnos: 10.5, positivas: 1 }), (e) => campo(e, 'alumnos'));
  assert.throws(() => campus.guardar(db, id('AGO-DIC 2026'), { alumnos: 10, positivas: 1, regionOpp: 120 }), (e) => campo(e, 'regionOpp'));
  assert.throws(() => campus.guardar(db, 999, { alumnos: 10, positivas: 1 }), (e) => e.status === 404);
  campus.eliminar(db, id('AGO-DIC 2025'));
  assert.deepEqual(campus.listar(db).semestres.map((s) => [s.periodo, s.variacion]), [['ENE-MAY 2025', null], ['ENE-MAY 2026', -0.7]]);
  assert.throws(() => campus.eliminar(db, id('AGO-DIC 2025')), (e) => e.status === 404);
});
