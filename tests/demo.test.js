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
  for (const semestre of [a.gruposEne, a.gruposAgo]) {
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
  assert.equal(n('SELECT COUNT(*) FROM grupos_importaciones'), 2, 'ENE-MAY y AGO-DIC 2026');
  assert.equal(n('SELECT filas_descartadas FROM opina_importaciones'), 2, 'en línea y otro campus');
  assert.equal(n("SELECT COUNT(*) FROM asignaturas WHERE numero_grupo = 'F61'"), 0, 'los grupos en línea se omiten');
  assert.equal(n("SELECT COUNT(*) FROM asignaturas a JOIN periodos p ON p.id = a.periodo_id WHERE p.clave = 'AGO-DIC 2026' AND a.crn IS NOT NULL AND a.num_contrato IS NULL"), 2);
  assert.equal(n('SELECT COUNT(*) FROM asignaturas WHERE crn IS NOT NULL AND tipo_clase_id IS NULL'), 0, 'todos con tarifa');
  assert.ok(n('SELECT COUNT(*) FROM v_opina_docente WHERE respuestas < 10') >= 1, 'hay muestra insuficiente');
});

test('bajas: una recontratable, una no recontratable y una reactivada, con historial', () => {
  const { db } = baseDemo();
  const filas = db.prepare(`SELECT d.activo, d.recontratable, b.recontratable AS baja_rec, b.fecha_reactivacion IS NOT NULL AS reactivado
                            FROM docente_bajas b JOIN docentes d ON d.id = b.docente_id ORDER BY d.activo, d.recontratable`).all();
  assert.deepEqual(filas, [
    { activo: 0, recontratable: 0, baja_rec: 0, reactivado: 0 },
    { activo: 0, recontratable: 1, baja_rec: 1, reactivado: 0 },
    { activo: 1, recontratable: 1, baja_rec: 1, reactivado: 1 },
  ]);
});

test('faltas pendientes: tarifa de 3 h y de 5 h en inglés, IMSS en $0 y nada reportado aún', () => {
  const { db } = baseDemo();
  const faltas = db.prepare('SELECT justificacion, monto_descuento AS monto, quincena_id FROM faltas').all();
  assert.ok(faltas.length >= 6);
  assert.ok(faltas.every((f) => f.quincena_id === null), 'todas pendientes de reportar');
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
  assert.equal(resumen.suplencias, 3);
  const inc = db.prepare(`SELECT i.id, i.importe_total, i.ceco, COUNT(s.id) AS dias
                          FROM incidencias i JOIN suplencias s ON s.incidencia_id = i.id
                          WHERE i.origen = 'suplencia' GROUP BY i.id ORDER BY dias DESC`).all();
  assert.equal(inc.length, 2, 'la de 2 días se agrupa en una sola incidencia');
  assert.equal(inc[0].dias, 2);
  assert.ok(inc.every((i) => /^\d{10}$/.test(i.ceco)));
  const imss = db.prepare(`SELECT f.monto_descuento, s.monto FROM suplencias s JOIN faltas f ON f.id = s.falta_id
                           WHERE f.justificacion <> 'ninguna'`).get();
  assert.equal(imss.monto_descuento, 0);
  assert.ok(imss.monto > 0, 'el suplente cobra aunque al titular no se le descuente');
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
