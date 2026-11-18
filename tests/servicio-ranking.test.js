const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { ranking, excel } = require('../services/rankingService');
const { sembrar } = require('../lib/semillas');
const { crearEscenario } = require('./helpers/escenario');

/**
 * ENE-MAY 2026 (además de María 11/12 y Guillermo 2/3 del escenario):
 *   Ana 27/30 (90.0 %, en 2 grupos) · Pedro 9/10 (90.0 %) · Laura 8/12 (66.7 %)
 * AGO-DIC 2025 (para comparar): María 10/12 (83.3 %) · Ana 20/20 (100 %)
 */
function escenario() {
  const e = crearEscenario();
  const { db, ids } = e;
  sembrar(db);
  const periodo = (clave) => db.prepare('SELECT id FROM periodos WHERE clave = ?').get(clave).id;
  const pedro = db.prepare("SELECT id FROM docentes WHERE nomina = 'L03500005'").get().id;
  const laura = Number(db.prepare("INSERT INTO docentes (nomina, nombres, apellido_paterno, apellido_materno) VALUES ('L03500021', 'Laura', 'Méndez', 'Ríos')").run().lastInsertRowid);
  const importacion = (p) => Number(db.prepare("INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'x.xlsx', 'v2', 0)").run(p).lastInsertRowid);
  const resp = db.prepare('INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda) VALUES (?, ?, ?, ?, ?)');
  const respuestas = (p, docente, crn, si, total) => {
    const imp = importacion(p);
    for (let i = 0; i < total; i++) resp.run(imp, p, docente, crn, i < si ? 1 : 0);
  };
  const ene26 = periodo('ENE-MAY 2026');
  const ago25 = periodo('AGO-DIC 2025');
  respuestas(ene26, ids.ana, '16434', 18, 20);
  respuestas(ene26, ids.ana, '16435', 9, 10);
  respuestas(ene26, pedro, '16500', 9, 10);
  respuestas(ene26, laura, '16711', 8, 12);
  respuestas(ago25, ids.maria, '15901', 10, 12);
  respuestas(ago25, ids.ana, '15902', 20, 20);
  return { ...e, ids: { ...ids, pedro, laura }, ene26, ago25 };
}

const filas = (r) => r.ranking.map((f) => [f.posicion, f.docenteId, f.porcentaje, f.respuestas]);

test('ranking completo del último semestre con OPINA: calificación global, empates y cuadro de promedios', () => {
  const { db, ids } = escenario();
  const r = ranking(db);
  assert.equal(r.periodo.clave, 'ENE-MAY 2026');
  assert.deepEqual(filas(r), [[1, ids.maria, 91.7, 12], [2, ids.ana, 90, 30], [2, ids.pedro, 90, 10], [4, ids.laura, 66.7, 12]]);
  assert.deepEqual([r.promedioMaestros, r.calificacionCampus, r.docentes, r.muestraInsuficiente, r.muestraMinima], [84.6, 85.1, 4, 1, 10]);
});

test('desglose por CRN y número de respuestas de cada grupo', () => {
  const { db, ids } = escenario();
  const ana = ranking(db).ranking.find((f) => f.docenteId === ids.ana);
  assert.deepEqual(ana.grupos.map((g) => [g.crn, g.porcentaje, g.respuestas, g.positivas]), [['16434', 90, 20, 18], ['16435', 90, 10, 9]]);
});

test('filtros: mejores N, peores N (el peor primero, con su posición real) y rango de %', () => {
  const { db, ids } = escenario();
  assert.deepEqual(filas(ranking(db, { filtro: 'mejores', n: '2' })).map((f) => f[1]), [ids.maria, ids.ana]);
  assert.deepEqual(filas(ranking(db, { filtro: 'peores', n: 2 })), [[4, ids.laura, 66.7, 12], [2, ids.pedro, 90, 10]]);
  assert.deepEqual(filas(ranking(db, { filtro: 'rango', min: 85, max: 91 })).map((f) => f[1]), [ids.ana, ids.pedro]);
  assert.equal(ranking(db, { filtro: 'mejores' }).ranking.length, 4); // n por defecto = opina.top_n (10)
});

test('muestra insuficiente fuera del ranking; con incluirMuestraInsuficiente va al final sin posición', () => {
  const { db, ids } = escenario();
  assert.equal(ranking(db).ranking.some((f) => f.docenteId === ids.guillermo), false);
  const ultimo = ranking(db, { incluirMuestraInsuficiente: 'true' }).ranking.at(-1);
  assert.deepEqual([ultimo.docenteId, ultimo.posicion, ultimo.muestraInsuficiente, ultimo.respuestas], [ids.guillermo, null, true, 3]);
});

test('variación contra otro semestre (en puntos); null si no tuvo OPINA ese semestre', () => {
  const { db, ids, ago25 } = escenario();
  const r = ranking(db, { compararCon: String(ago25) });
  assert.equal(r.compararCon.clave, 'AGO-DIC 2025');
  assert.deepEqual(r.ranking.map((f) => [f.docenteId, f.porcentajeAnterior, f.variacion]),
    [[ids.maria, 83.3, 8.4], [ids.ana, 100, -10], [ids.pedro, null, null], [ids.laura, null, null]]);
});

test('validación: filtro, n, rango invertido y semestres inexistentes', () => {
  const { db } = escenario();
  const campo = (c) => (e) => e.status === 400 && e.details.some((x) => x.campo === c);
  assert.throws(() => ranking(db, { filtro: 'regulares' }), campo('filtro'));
  assert.throws(() => ranking(db, { filtro: 'mejores', n: 0 }), campo('n'));
  assert.throws(() => ranking(db, { filtro: 'rango', min: 90, max: 80 }), campo('min'));
  assert.throws(() => ranking(db, { periodoId: 999 }), (e) => e.status === 404);
  assert.throws(() => ranking(db, { compararCon: 999 }), (e) => e.status === 404);
  const sinOpina = crearEscenario();
  sinOpina.db.prepare('DELETE FROM opina_respuestas').run();
  assert.deepEqual(ranking(sinOpina.db).ranking, []);
});

test('Excel: hojas Ranking (con encabezado de promedios y filtro), Por grupo y Muestra insuficiente', () => {
  const { db, ago25 } = escenario();
  const { nombre, buffer } = excel(db, { filtro: 'mejores', n: 3, compararCon: ago25 });
  assert.equal(nombre, 'OPINA_RANKING_ENE-MAY_2026.xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['Ranking', 'Por grupo', 'Muestra insuficiente']);
  const filasRanking = XLSX.utils.sheet_to_json(wb.Sheets.Ranking, { header: 1, defval: '' });
  assert.equal(filasRanking[0][0], 'Ranking OPINA · ENE-MAY 2026');
  assert.deepEqual([filasRanking[1][0], filasRanking[1][2], filasRanking[1][4]], ['Filtro: Mejores 3', 'Promedio de maestros: 84.6 %', 'Calificación del campus: 85.1 %']);
  assert.deepEqual(filasRanking[4], ['Posición', 'Nómina', 'Docente', '% recomendación', 'Respuestas', 'Sí', '% AGO-DIC 2025', 'Variación (pts)']);
  assert.deepEqual(filasRanking.slice(5).map((f) => [f[0], f[1], f[3], f[7]]), [[1, 'L03500001', 91.7, 8.4], [2, 'L03500003', 90, -10], [2, 'L03500005', 90, '']]);
  assert.equal(wb.Sheets.Ranking.B6.t, 's'); // nómina como texto
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Por grupo']).length, 4); // 1 + 2 + 1 grupos
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets['Muestra insuficiente']).map((f) => f['Nómina']), ['L03500002']);
});
