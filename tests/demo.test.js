/**
 * Datos de demostración (scripts/demo.js): ficticios, coherentes y cargados con los importadores reales.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// lib/db.js abre la base al hacer require: se le da un archivo temporal para no tocar data/app.db.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sidi-demo-'));
process.env.DB_PATH = path.join(TMP, 'app.db');

const Database = require('better-sqlite3');
const conexionReal = require('../lib/db');
const { sembrar } = require('../lib/semillas');
const curp = require('../lib/curp');
const { seEmpalman } = require('../lib/horario');
const demo = require('../scripts/demo');
const analitica = require('../lib/analitica');

test.after(() => {
  conexionReal.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows: el archivo puede seguir abierto */ }
});

function baseDemo() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  conexionReal.migrar(db);
  sembrar(db);
  const resumen = db.transaction(() => demo.poblar(db))();
  return { db, resumen };
}

test('los datos son ficticios: nóminas L099…, CURP inventadas pero con formato y dígito válidos', () => {
  for (const d of demo.DOCENTES) {
    assert.match(demo.nomina(d.n), /^L099\d{5}$/);
    if (d.sinCurp) continue;
    const r = curp.validar(demo.curpFicticia(d));
    assert.ok(r.valida, `${d.nom}: ${r.errores}`);
    assert.equal(curp.fechaNacimiento(r.curp), d.nac);
  }
});

test('ningún docente tiene clases que se empalmen (requisito para probar disponibles)', () => {
  const dias = { L: 1, M: 2, X: 3, J: 4, V: 5 };
  const a = demo.generarArchivos();
  for (const semestre of [a.gruposAnt, a.gruposEne, a.gruposAgo]) {
    const sesiones = semestre.grupos.flatMap((g) => [...g.dias].map((l) => ({ ...g, dia: dias[l] })));
    for (const x of sesiones) {
      for (const y of sesiones) {
        if (x !== y && x.docente === y.docente && x.crn !== y.crn) {
          assert.equal(seEmpalman(x, y), false, `${x.crn} y ${y.crn} del docente ${x.docente}`);
        }
      }
    }
  }
});

test('la demo se carga con los importadores reales y queda completa', () => {
  const { db, resumen } = baseDemo();
  assert.equal(resumen.docentes, 20);
  assert.ok(resumen.gruposActual >= 40, 'grupos del semestre actual');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const n = (sql, ...p) => db.prepare(sql).pluck().get(...p);
  assert.equal(n('SELECT COUNT(*) FROM grupos_importaciones'), 3, 'AGO-DIC 2025, ENE-MAY y AGO-DIC 2026');
  assert.equal(n('SELECT COUNT(*) FROM opina_importaciones'), 2, 'OPINA de AGO-DIC 2025 y ENE-MAY 2026');
  assert.equal(n('SELECT SUM(filas_descartadas) FROM opina_importaciones'), 2, 'en línea y otro campus');
  assert.equal(n("SELECT COUNT(*) FROM asignaturas WHERE numero_grupo = 'F61'"), 0, 'los grupos en línea se omiten');
  assert.equal(n("SELECT COUNT(*) FROM asignaturas a JOIN periodos p ON p.id = a.periodo_id WHERE p.clave = 'AGO-DIC 2026' AND a.crn IS NOT NULL AND a.num_contrato IS NULL"), 2);
  assert.equal(n('SELECT COUNT(*) FROM asignaturas WHERE crn IS NOT NULL AND tipo_clase_id IS NULL'), 0, 'todos con tarifa');
  assert.ok(n('SELECT COUNT(*) FROM v_opina_docente WHERE respuestas < 10') >= 1, 'hay muestra insuficiente');
});

test('bajas: recontratable, no recontratable y reactivada, en ENE-MAY y en el semestre actual', () => {
  const { db } = baseDemo();
  const filas = db.prepare(`SELECT p.clave AS periodo, d.activo, d.recontratable, b.recontratable AS baja_rec,
                                   b.fecha_reactivacion IS NOT NULL AS reactivado
                            FROM docente_bajas b JOIN docentes d ON d.id = b.docente_id JOIN periodos p ON p.id = b.periodo_id
                            ORDER BY p.fecha_inicio, d.activo, d.recontratable`).all();
  assert.deepEqual(filas, [
    { periodo: 'ENE-MAY 2026', activo: 0, recontratable: 0, baja_rec: 0, reactivado: 0 },
    { periodo: 'ENE-MAY 2026', activo: 0, recontratable: 1, baja_rec: 1, reactivado: 0 },
    { periodo: 'ENE-MAY 2026', activo: 1, recontratable: 1, baja_rec: 1, reactivado: 1 },
    { periodo: 'AGO-DIC 2026', activo: 0, recontratable: 0, baja_rec: 0, reactivado: 0 },
    { periodo: 'AGO-DIC 2026', activo: 0, recontratable: 1, baja_rec: 1, reactivado: 0 },
  ]);
});

test('faltas pendientes de noviembre: tarifa de 3 h y de 5 h en inglés e IMSS en $0', () => {
  const { db } = baseDemo();
  const faltas = db.prepare("SELECT justificacion, monto_descuento AS monto FROM faltas WHERE quincena_id IS NULL").all();
  assert.ok(faltas.length >= 6);
  assert.ok(db.prepare("SELECT COUNT(*) FROM faltas WHERE quincena_id IS NULL AND fecha < '2026-11-01'").pluck().get() === 0,
    'lo de octubre ya quedó reportado');
  assert.ok(faltas.some((f) => f.monto === 54) && faltas.some((f) => f.monto === 106));
  assert.ok(faltas.filter((f) => f.justificacion !== 'ninguna').every((f) => f.monto === 0));
  assert.equal(db.prepare("SELECT COUNT(*) FROM incidencias WHERE quincena_id IS NULL AND origen = 'manual'").pluck().get(), 1);
});

test('perfil variado para filtros y Panel: género, niveles, estudiando, sin CURP y antigüedad', () => {
  const { db } = baseDemo();
  const n = (sql) => db.prepare(sql).pluck().get();
  assert.ok(n("SELECT COUNT(*) FROM docentes WHERE genero = 'M'") > 0 && n("SELECT COUNT(*) FROM docentes WHERE genero = 'F'") > 0);
  assert.equal(n('SELECT COUNT(DISTINCT nivel_estudios) FROM v_docente_estudios WHERE nivel_estudios IS NOT NULL'), 4);
  assert.ok(n('SELECT COUNT(*) FROM v_docente_estudios WHERE estudia_actualmente = 1') >= 2);
  assert.equal(n('SELECT COUNT(*) FROM docentes WHERE curp IS NULL'), 1, 'un docente incompleto');
  assert.ok(n('SELECT COUNT(*) FROM docentes WHERE primer_semestre_texto IS NOT NULL') >= 2, 'antigüedad capturada a mano');
});

test('suplencias: agrupada (mismo suplente y CRN, 2 días), IMSS pagada al suplente e incidencias generadas', () => {
  const { db, resumen } = baseDemo();
  assert.equal(resumen.suplencias, 7, '3 de noviembre y 4 de octubre');
  const inc = db.prepare(`SELECT i.id, i.importe_total, i.ceco, COUNT(s.id) AS dias
                          FROM incidencias i JOIN suplencias s ON s.incidencia_id = i.id
                          WHERE i.origen = 'suplencia' GROUP BY i.id ORDER BY dias DESC`).all();
  assert.equal(inc.length, 6, 'la de 2 días se agrupa en una sola incidencia');
  assert.deepEqual(inc.map((i) => i.dias), [2, 1, 1, 1, 1, 1]);
  assert.ok(inc.every((i) => /^\d{10}$/.test(i.ceco)));
  const imss = db.prepare(`SELECT f.monto_descuento, s.monto FROM suplencias s JOIN faltas f ON f.id = s.falta_id
                           WHERE f.justificacion <> 'ninguna'`).all();
  assert.equal(imss.length, 3);
  assert.ok(imss.every((x) => x.monto_descuento === 0 && x.monto > 0), 'el suplente cobra aunque al titular no se le descuente');
  // Ningún suplente tenía clase a esa hora (se eligieron de "disponibles")
  const sinEmpalme = db.prepare(`SELECT COUNT(*) FROM suplencias s WHERE s.docente_suplente_id IN (
                                  SELECT docente_id FROM faltas WHERE id = s.falta_id)`).pluck().get();
  assert.equal(sinEmpalme, 0, 'el suplente no es el titular');
});

test('el pago manual de tutoreo usa un CeCo del catálogo (cuenta académica)', () => {
  const { db } = baseDemo();
  const ceco = db.prepare("SELECT ceco FROM incidencias WHERE origen = 'manual'").pluck().get();
  assert.equal(ceco, '5420103000');
  assert.equal(db.prepare("SELECT COUNT(*) FROM catalogos WHERE tipo = 'cuenta_cargo' AND valor = ?").pluck().get(ceco), 1);
});

test('octubre reportado: Q19 y Q20 cerradas con faltas y sus suplencias en la misma quincena', () => {
  const { db, resumen } = baseDemo();
  assert.deepEqual(resumen.quincenasCerradas, ['Q19', 'Q20']);
  const q = db.prepare(`SELECT q.numero, q.cerrada, COUNT(f.id) AS faltas, SUM(f.justificacion <> 'ninguna') AS imss
                        FROM quincenas q JOIN faltas f ON f.quincena_id = q.id GROUP BY q.id ORDER BY q.numero`).all();
  assert.deepEqual(q.map((x) => [x.numero, x.cerrada]), [[19, 1], [20, 1]]);
  assert.ok(q.every((x) => x.faltas > 0 && x.imss > 0), 'cada quincena con faltas descontadas e IMSS');
  const fuera = db.prepare(`SELECT COUNT(*) FROM suplencias s JOIN faltas f ON f.id = s.falta_id JOIN incidencias i ON i.id = s.incidencia_id
                            WHERE f.quincena_id IS NOT NULL AND i.quincena_id IS NOT f.quincena_id`).pluck().get();
  assert.equal(fuera, 0, 'la incidencia del suplente va en la quincena de la falta');
});

test('resumen ejecutivo: las 8 gráficas tienen datos con la demo (ninguna queda en "Sin datos registrados")', () => {
  const { db } = baseDemo();
  assert.equal(analitica.oppCampus(db).length, 3, 'G1');
  const g2 = analitica.distribucionOpina(db);
  assert.deepEqual(g2.map((p) => p.periodo), ['AGO-DIC 2025', 'ENE-MAY 2026'], 'G2: 2 semestres');
  const g3 = analitica.topBottomOpina(db);
  assert.equal(g3.top.length + g3.bottom.length, 10, 'G3');
  const g4 = analitica.cambioOpina(db);
  assert.ok(g4.docentes.length >= 10, 'G4: docentes en ambos semestres');
  assert.ok(g4.docentes.some((d) => d.cambio > 0) && g4.docentes.some((d) => d.cambio < 0), 'G4: unos suben y otros bajan');
  assert.ok(analitica.faltasPorTipo(db).tipos.every((t) => t.faltas > 0), 'G9: los 2 tipos');
  const g10 = analitica.descontadoVsPagado(db);
  assert.deepEqual(g10.quincenas.map((q) => q.quincena), ['Q19', 'Q20'], 'G10: solo lo reportado');
  assert.ok(g10.quincenas.every((q) => q.descontado > 0 && q.pagado > 0));
  const g15 = Object.fromEntries(analitica.plantillaPorSemestre(db).map((p) => [p.periodo, p]));
  assert.equal(g15['ENE-MAY 2026'].nuevos, 3, 'G15: entraron 3 en ENE-MAY');
  assert.equal(g15['AGO-DIC 2026'].nuevos, 3, 'G15: entraron 3 en AGO-DIC');
  assert.deepEqual([g15['AGO-DIC 2026'].bajasRecontratables, g15['AGO-DIC 2026'].bajasNoRecontratables], [1, 1], 'G15: bajas del semestre');
  const g16 = analitica.perfilDocentes(db);
  assert.ok(g16.estudiando.si > 0 && g16.genero.every((g) => g.docentes > 0), 'G16');
});
