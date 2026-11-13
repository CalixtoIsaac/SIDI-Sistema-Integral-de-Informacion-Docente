/**
 * Pruebas de la base de datos: migraciones, semillas, restricciones y vistas
 * del esquema de context/04_Modelo_Datos.md §4 (001_inicial.sql).
 * Se ejecutan con:  node --test      (busca solo los *.test.js de tests/)
 *
 * Todo corre sobre bases EN MEMORIA: nunca toca data/app.db.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// lib/db.js abre la base al hacer require: se le da un archivo temporal para no tocar data/app.db.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sidi-test-'));
process.env.DB_PATH = path.join(TMP, 'app.db');

const Database = require('better-sqlite3');
const conexionReal = require('../lib/db'); // lib/db.js exporta la conexión (a TMP/app.db)
const { migrar, MIGRACIONES_DIR } = conexionReal;
const { sembrar, quincenasDelAnio } = require('../lib/semillas');

test.after(() => {
  // En Windows no se puede borrar un archivo abierto (EPERM): primero se cierra la conexión.
  try { conexionReal.close(); } catch { /* ya estaba cerrada */ }
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch { /* limpieza opcional: es una carpeta temporal */ }
});

/** Base nueva en memoria con migraciones + semillas. */
function baseNueva({ semillas = true } = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrar(db);
  if (semillas) sembrar(db);
  return db;
}

/** Ejecuta fn y devuelve el mensaje del error (o null si no falló). */
function falla(fn) {
  try { fn(); return null; } catch (e) { return e.message; }
}

// ---------------------------------------------------------------- migraciones
test('las migraciones se aplican en orden y solo una vez', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const todas = ['001_inicial.sql'];
  assert.deepEqual(migrar(db), todas);
  assert.deepEqual(migrar(db), [], 'la segunda corrida no debe aplicar nada');
  const registradas = db.prepare('SELECT nombre FROM schema_migrations ORDER BY nombre').pluck().all();
  assert.deepEqual(registradas, todas);
});

test('una migración que falla se revierte completa y no se registra', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'mig-'));
  fs.writeFileSync(path.join(dir, '001_mala.sql'),
    'CREATE TABLE ok (id INTEGER); CREATE TABLE ok (id INTEGER);'); // 2ª sentencia falla
  const db = new Database(':memory:');
  assert.throws(() => migrar(db, dir), /001_mala\.sql falló/);
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").all();
  assert.equal(tablas.length, 0, 'la tabla creada antes del error no debe quedar');
  assert.equal(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 0);
});

test('el esquema es el de 04 §4: 21 tablas, 26 llaves foráneas y 5 vistas', () => {
  const db = baseNueva({ semillas: false });
  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name"
  ).pluck().all();
  assert.deepEqual(tablas, [
    'asignaturas', 'catalogos', 'configuracion', 'contratos_importaciones', 'cv_archivos',
    'departamentos', 'docente_bajas', 'docentes', 'envios_correo', 'faltas', 'grupos_importaciones',
    'horarios', 'incidencias', 'opina_campus_semestre', 'opina_importaciones', 'opina_respuestas',
    'periodos', 'quincenas', 'suplencias', 'tipos_clase', 'titulos_docente'
  ]);
  const fks = tablas.reduce((n, t) => n + db.pragma(`foreign_key_list(${t})`).length, 0);
  assert.equal(fks, 26);
  const vistas = db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").pluck().all();
  assert.deepEqual(vistas, ['v_docente_estudios', 'v_docente_primer_periodo', 'v_opina_campus', 'v_opina_crn', 'v_opina_docente']);
});

test('001_inicial.sql tiene el mismo SQL que context/04_Modelo_Datos.md §4', () => {
  // Se comparan sin comentarios ni espacios: la migración puede tener comentarios más cortos.
  const soloSql = (txt) => txt.replace(/\r\n/g, '\n').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
  const doc = fs.readFileSync(path.join(__dirname, '..', 'context', '04_Modelo_Datos.md'), 'utf8').replace(/\r\n/g, '\n');
  const ddlDoc = doc.slice(doc.indexOf('## 4. DDL')).match(/```sql\n([\s\S]*?)```/)[1];
  const migracion = fs.readFileSync(path.join(MIGRACIONES_DIR, '001_inicial.sql'), 'utf8');
  assert.equal(soloSql(migracion), soloSql(ddlDoc), 'si cambia el modelo, el cambio va en una migración nueva (002…)');
});

// ------------------------------------------------------------------- semillas
test('semillas: 8 tarifas, $54 para 3 h en español y tarifa mensual = semestre / 4', () => {
  const db = baseNueva();
  const filas = db.prepare('SELECT horas_semana, idioma, pago_por_dia, pago_mensual FROM tipos_clase').all();
  assert.equal(filas.length, 8);
  const t = (h, i) => filas.find((f) => f.horas_semana === h && f.idioma === i);
  assert.equal(t(3, 'ES').pago_por_dia, 54);
  const mensual = filas.map((f) => f.pago_mensual).sort((a, b) => a - b);
  assert.deepEqual(mensual, [882, 1058.5, 1764, 2116.75, 2352, 2822.5, 2940, 3528]);
});

test('semillas: catálogos, periodos, configuración y quincenas', () => {
  const db = baseNueva();
  const niveles = db.prepare("SELECT valor FROM catalogos WHERE tipo='nivel_estudios' ORDER BY orden").pluck().all();
  assert.deepEqual(niveles, ['Licenciatura', 'Especialidad', 'Maestría', 'Doctorado']);
  assert.equal(db.prepare("SELECT COUNT(*) FROM catalogos WHERE tipo='campo_formacion'").pluck().get(), 10);
  assert.equal(db.prepare("SELECT COUNT(*) FROM catalogos WHERE tipo='motivo_baja'").pluck().get(), 5);

  const periodos = db.prepare('SELECT clave, fecha_inicio, actual FROM periodos ORDER BY fecha_inicio').all();
  assert.equal(periodos.length, 5);
  assert.deepEqual(periodos.filter((p) => p.actual).map((p) => p.clave), ['AGO-DIC 2026']);
  assert.ok(periodos.every((p) => p.fecha_inicio), 'todos con fecha de inicio');

  assert.equal(db.prepare("SELECT valor FROM configuracion WHERE clave='grupos.omitir_grupos'").pluck().get(), 'F61,F62');

  const q = db.prepare('SELECT * FROM quincenas WHERE anio = 2026 ORDER BY numero').all();
  assert.equal(q.length, 24);
  const q16 = q[15];
  assert.deepEqual([q16.numero, q16.fecha_inicio, q16.fecha_fin, q16.fecha_pago],
    [16, '2026-08-16', '2026-08-31', '2026-08-30']); // Q16 se paga el 30/08
  assert.deepEqual([q[1].fecha_inicio, q[1].fecha_fin], ['2026-01-16', '2026-01-31']);
  assert.equal(q[23].fecha_fin, '2026-12-31');
  assert.equal(quincenasDelAnio(2028)[3][3], '2028-02-29', 'respeta años bisiestos');
});

test('semillas: son idempotentes y no pisan lo que la coordinadora editó', () => {
  const db = baseNueva();
  db.prepare("UPDATE tipos_clase SET pago_por_dia = 55 WHERE horas_semana = 3 AND idioma = 'ES'").run();
  db.prepare("UPDATE configuracion SET valor = '#BE185D' WHERE clave = 'tema.color'").run();
  const antes = db.prepare('SELECT (SELECT COUNT(*) FROM catalogos) c, (SELECT COUNT(*) FROM quincenas) q').get();
  sembrar(db);
  const despues = db.prepare('SELECT (SELECT COUNT(*) FROM catalogos) c, (SELECT COUNT(*) FROM quincenas) q').get();
  assert.deepEqual(despues, antes);
  assert.equal(db.prepare("SELECT pago_por_dia FROM tipos_clase WHERE horas_semana=3 AND idioma='ES'").pluck().get(), 55);
  assert.equal(db.prepare("SELECT valor FROM configuracion WHERE clave='tema.color'").pluck().get(), '#BE185D');
});

// ------------------------------------------------------------- restricciones
function docente(db, nomina = 'L03560330', extra = {}) {
  const d = { nombres: 'Ana', apellido_paterno: 'Pérez', ...extra };
  return db.prepare('INSERT INTO docentes (nomina, nombres, apellido_paterno, genero) VALUES (?, ?, ?, ?)')
    .run(nomina, d.nombres, d.apellido_paterno, d.genero ?? null).lastInsertRowid;
}

test('docentes: nómina canónica, únicos, género y recontratable', () => {
  const db = baseNueva();
  docente(db);
  for (const mala of ['3560330', 'L0356033', 'l03560330', 'L0356033A']) {
    assert.match(falla(() => docente(db, mala)), /CHECK/, `nómina ${mala} debe rechazarse`);
  }
  assert.match(falla(() => docente(db, 'L03560330')), /UNIQUE/);
  assert.match(falla(() => docente(db, 'L00000001', { genero: 'X' })), /CHECK/);
  const id = docente(db, 'L00000002');
  assert.match(falla(() => db.prepare('UPDATE docentes SET recontratable = 2 WHERE id = ?').run(id)), /CHECK/);
  db.prepare('UPDATE docentes SET recontratable = NULL WHERE id = ?').run(id); // NULL = nunca dado de baja
});

test('docentes: dos docentes pueden compartir fecha de nacimiento', () => {
  const db = baseNueva();
  const ins = db.prepare('INSERT INTO docentes (nomina, nombres, apellido_paterno, fecha_nacimiento) VALUES (?,?,?,?)');
  ins.run('L00000001', 'Ana', 'A', '1990-05-01');
  ins.run('L00000002', 'Beto', 'B', '1990-05-01');
});

test('las llaves foráneas se hacen cumplir', () => {
  const db = baseNueva();
  assert.match(falla(() => db.prepare(
    "INSERT INTO docentes (nomina, nombres, apellido_paterno, departamento_id) VALUES ('L00000001','A','B',999)").run()),
  /FOREIGN KEY/);
});

test('asignaturas: CRN único por periodo, actividades sin CRN y horarios válidos', () => {
  const db = baseNueva();
  const d = docente(db);
  const p1 = db.prepare("SELECT id FROM periodos WHERE clave='AGO-DIC 2026'").pluck().get();
  const p2 = db.prepare("SELECT id FROM periodos WHERE clave='ENE-MAY 2026'").pluck().get();
  const asig = db.prepare('INSERT INTO asignaturas (periodo_id, docente_id, crn, nombre_actividad, materia) VALUES (?,?,?,?,?)');

  asig.run(p1, d, '16022', null, 'Math III');
  assert.match(falla(() => asig.run(p1, d, '16022', null, 'Otra')), /UNIQUE/, 'mismo CRN y periodo');
  asig.run(p2, d, '16022', null, 'Math III'); // mismo CRN en otro periodo: permitido
  assert.match(falla(() => asig.run(p1, d, null, null, 'Sin CRN ni actividad')), /CHECK/);
  const act = asig.run(p1, d, null, 'Ruta exploratoria', 'Taller').lastInsertRowid; // actividad: sin CRN
  asig.run(p1, d, null, 'Otra actividad', 'Taller 2'); // varias actividades sin CRN no chocan (NULL ≠ NULL)

  const hor = db.prepare('INSERT INTO horarios (asignatura_id, dia_semana, hora_inicio, hora_fin) VALUES (?,?,?,?)');
  hor.run(act, 3, '11:00', '12:29');
  hor.run(act, 3, '16:00', '17:35'); // dos sesiones el mismo día: permitido
  assert.match(falla(() => hor.run(act, 8, '11:00', '12:29')), /CHECK/);
  assert.match(falla(() => hor.run(act, 0, '11:00', '12:29')), /CHECK/);
});

test('catálogos y quincenas: UNIQUE compuestos y CHECK', () => {
  const db = baseNueva();
  assert.match(falla(() => db.prepare("INSERT INTO catalogos (tipo, valor) VALUES ('nivel_estudios','Doctorado')").run()), /UNIQUE/);
  db.prepare("INSERT INTO catalogos (tipo, valor) VALUES ('motivo_baja','Jubilación')").run(); // mismo tipo, otro valor
  assert.match(falla(() => db.prepare("INSERT INTO catalogos (tipo, valor) VALUES ('inventado','x')").run()), /CHECK/);
  const q = db.prepare("INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (?,?,'2027-01-01','2027-01-15','2027-01-15')");
  q.run(2027, 1);
  q.run(2028, 1); // mismo número en otro año: permitido
  assert.match(falla(() => q.run(2027, 1)), /UNIQUE/);
  assert.match(falla(() => q.run(2027, 25)), /CHECK/);
  assert.match(falla(() => q.run(2027, 0)), /CHECK/);
});

test('tipos_clase: (horas, idioma) único y pago_mensual no se puede escribir', () => {
  const db = baseNueva();
  assert.match(falla(() => db.prepare(
    "INSERT INTO tipos_clase (nombre, horas_semana, idioma, pago_semestre, pago_por_dia) VALUES ('Dup',3,'ES',1,1)").run()),
  /UNIQUE/);
  assert.match(falla(() => db.prepare("UPDATE tipos_clase SET pago_mensual = 1 WHERE id = 1").run()), /generated/i);
  db.prepare('UPDATE tipos_clase SET pago_semestre = 4000 WHERE id = 1').run();
  assert.equal(db.prepare('SELECT pago_mensual FROM tipos_clase WHERE id = 1').pluck().get(), 1000, 'se recalcula sola');
});

test('borrar un docente borra en cascada títulos, CV, asignaturas, horarios y bajas', () => {
  const db = baseNueva();
  const d = docente(db);
  const p = db.prepare("SELECT id FROM periodos WHERE actual = 1").pluck().get();
  db.prepare("INSERT INTO titulos_docente (docente_id, grado) VALUES (?, 'Maestría')").run(d);
  db.prepare("INSERT INTO cv_archivos (docente_id, nombre_original, ruta, sha256) VALUES (?, 'a.pdf', 'data/cv/a.pdf', 'x')").run(d);
  db.prepare("INSERT INTO docente_bajas (docente_id, periodo_id, motivo, observaciones, recontratable) VALUES (?,?,'Renuncia','Se mudó',1)").run(d, p);
  const a = db.prepare("INSERT INTO asignaturas (periodo_id, docente_id, crn, materia) VALUES (?,?,'1','M')").run(p, d).lastInsertRowid;
  db.prepare("INSERT INTO horarios (asignatura_id, dia_semana, hora_inicio, hora_fin) VALUES (?,1,'08:00','09:29')").run(a);

  db.prepare('DELETE FROM docentes WHERE id = ?').run(d);
  for (const t of ['titulos_docente', 'cv_archivos', 'docente_bajas', 'asignaturas', 'horarios']) {
    assert.equal(db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get(), 0, `${t} debe quedar vacía`);
  }
});

test('un periodo con asignaturas no se puede borrar (sin cascada)', () => {
  const db = baseNueva();
  const d = docente(db);
  const p = db.prepare("SELECT id FROM periodos WHERE actual = 1").pluck().get();
  db.prepare("INSERT INTO asignaturas (periodo_id, docente_id, crn, materia) VALUES (?,?,'1','M')").run(p, d);
  assert.match(falla(() => db.prepare('DELETE FROM periodos WHERE id = ?').run(p)), /FOREIGN KEY/);
});

// --------------------------------------------------------------------- vistas
test('v_docente_estudios: nivel más alto titulado y estudios en curso', () => {
  const db = baseNueva();
  const d = docente(db);
  const t = db.prepare('INSERT INTO titulos_docente (docente_id, grado, estatus) VALUES (?,?,?)');
  t.run(d, 'Licenciatura', 'Titulado');
  t.run(d, 'Maestría', 'Titulado');
  t.run(d, 'Doctorado', 'Estudios en curso');
  t.run(d, 'Especialidad', 'Pasante'); // no cuenta: no está titulado
  const v = db.prepare('SELECT * FROM v_docente_estudios WHERE docente_id = ?').get(d);
  assert.deepEqual(v, { docente_id: d, nivel_estudios: 'Maestría', estudia_actualmente: 1, nivel_estudiando: 'Doctorado' });

  const sin = docente(db, 'L00000009');
  const v2 = db.prepare('SELECT * FROM v_docente_estudios WHERE docente_id = ?').get(sin);
  assert.deepEqual(v2, { docente_id: sin, nivel_estudios: null, estudia_actualmente: 0, nivel_estudiando: null });
});

test('OPINA: las vistas ponderan por alumno y borrar una importación borra sus respuestas', () => {
  const db = baseNueva();
  const d = docente(db);
  const p = db.prepare('SELECT id FROM periodos WHERE actual = 1').pluck().get();
  const imp = db.prepare(
    "INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'opina.xlsx', 'v1', 5)"
  ).run(p).lastInsertRowid;
  assert.match(falla(() => db.prepare(
    "INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'x.xlsx', 'v3', 1)").run(p)), /CHECK/);

  const r = db.prepare('INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda) VALUES (?,?,?,?,?)');
  // CRN 1: 3 de 4 positivas · CRN 2: 1 de 1 positiva  → global 4 de 5 = 80 %, no el promedio (75 + 100) / 2
  for (const v of [1, 1, 1, 0]) r.run(imp, p, d, '1', v);
  r.run(imp, p, d, '2', 1);

  const porCrn = db.prepare('SELECT crn, respuestas, positivas, porcentaje FROM v_opina_crn ORDER BY crn').all();
  assert.deepEqual(porCrn, [
    { crn: '1', respuestas: 4, positivas: 3, porcentaje: 75 },
    { crn: '2', respuestas: 1, positivas: 1, porcentaje: 100 }
  ]);
  const global = db.prepare('SELECT respuestas, positivas, porcentaje FROM v_opina_docente WHERE docente_id = ?').get(d);
  assert.deepEqual(global, { respuestas: 5, positivas: 4, porcentaje: 80 });

  db.prepare('DELETE FROM opina_importaciones WHERE id = ?').run(imp);
  assert.equal(db.prepare('SELECT COUNT(*) FROM opina_respuestas').pluck().get(), 0, 'cascada a las respuestas');
});

test('v_docente_primer_periodo: también considera las respuestas de OPINA', () => {
  const db = baseNueva();
  const d = docente(db);
  const id = (clave) => db.prepare('SELECT id FROM periodos WHERE clave = ?').pluck().get(clave);
  const imp = db.prepare(
    "INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'o.xlsx', 'v1', 1)"
  ).run(id('AGO-DIC 2025')).lastInsertRowid;
  db.prepare('INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda) VALUES (?,?,?,?,1)')
    .run(imp, id('AGO-DIC 2025'), d, '9');
  db.prepare("INSERT INTO asignaturas (periodo_id, docente_id, crn, materia) VALUES (?,?,'1','M')").run(id('AGO-DIC 2026'), d);
  const v = db.prepare('SELECT primer_inicio FROM v_docente_primer_periodo WHERE docente_id = ?').get(d);
  assert.equal(v.primer_inicio, '2025-08-01', 'gana OPINA (2025) sobre la asignatura (2026)');
});

test('v_docente_primer_periodo: el menor entre lo capturado y sus asignaturas', () => {
  const db = baseNueva();
  const id = (clave) => db.prepare('SELECT id FROM periodos WHERE clave = ?').pluck().get(clave);
  const a = docente(db, 'L00000001');
  const b = docente(db, 'L00000002');
  docente(db, 'L00000003'); // sin periodos: no aparece
  const asig = db.prepare("INSERT INTO asignaturas (periodo_id, docente_id, crn, materia) VALUES (?,?,?,'M')");

  asig.run(id('ENE-MAY 2026'), a, '1');
  asig.run(id('AGO-DIC 2026'), a, '2');
  db.prepare('UPDATE docentes SET primer_periodo_id = ? WHERE id = ?').run(id('AGO-DIC 2024'), b); // capturado a mano
  asig.run(id('AGO-DIC 2026'), b, '3');

  const filas = db.prepare('SELECT * FROM v_docente_primer_periodo ORDER BY docente_id').all();
  assert.deepEqual(filas, [
    { docente_id: a, primer_inicio: '2026-01-01' },
    { docente_id: b, primer_inicio: '2024-08-01' }
  ]);
});

// ------------------------------------------------------------ Sprint 2 (faltas y pagos)
/** Docente + CRN de 3 h en español en el periodo actual. */
function crnDe(db, nomina) {
  const d = docente(db, nomina);
  const p = db.prepare('SELECT id FROM periodos WHERE actual = 1').pluck().get();
  const t = db.prepare("SELECT id FROM tipos_clase WHERE horas_semana = 3 AND idioma = 'ES'").pluck().get();
  const a = db.prepare("INSERT INTO asignaturas (periodo_id, docente_id, crn, materia, tipo_clase_id) VALUES (?,?,?,?,?)")
    .run(p, d, nomina.slice(-5), 'Math III', t).lastInsertRowid;
  return { d, a };
}

test('faltas: una por docente, CRN, día y sesión; CHECK de sesión, días y justificación', () => {
  const db = baseNueva();
  const { d, a } = crnDe(db, 'L00000001');
  const f = db.prepare(`INSERT INTO faltas (docente_id, asignatura_id, fecha, sesion, motivo, justificacion, dias)
                        VALUES (?, ?, ?, ?, 'Falta por asunto personal', ?, ?)`);
  f.run(d, a, '2026-09-01', 1, 'ninguna', 1);
  f.run(d, a, '2026-09-01', 2, 'ninguna', 1); // 2ª sesión del mismo CRN ese día
  assert.match(falla(() => f.run(d, a, '2026-09-01', 1, 'ninguna', 1)), /UNIQUE/);
  assert.match(falla(() => f.run(d, a, '2026-09-02', 3, 'ninguna', 1)), /CHECK/);
  assert.match(falla(() => f.run(d, a, '2026-09-03', 1, 'vacaciones', 1)), /CHECK/);
  assert.match(falla(() => f.run(d, a, '2026-09-04', 1, 'ninguna', 0)), /CHECK/);
  const pendiente = db.prepare('SELECT quincena_id, cuenta_cargo, monto_descuento FROM faltas LIMIT 1').get();
  assert.deepEqual(pendiente, { quincena_id: null, cuenta_cargo: '5420103000', monto_descuento: 0 });
});

test('suplencias: una por falta, en cascada con la falta; la incidencia puede agrupar varias', () => {
  const db = baseNueva();
  const titular = crnDe(db, 'L00000001');
  const suplente = docente(db, 'L00000002');
  const falta = db.prepare(`INSERT INTO faltas (docente_id, asignatura_id, fecha, motivo)
                            VALUES (?, ?, ?, 'Falta por asunto personal')`);
  const f1 = falta.run(titular.d, titular.a, '2026-09-01').lastInsertRowid;
  const f2 = falta.run(titular.d, titular.a, '2026-09-02').lastInsertRowid;
  const inc = db.prepare(`INSERT INTO incidencias (docente_id, cc_nomina, motivo, detalle, ceco, importe_total, origen)
                          VALUES (?, 'Flex Act. Acad de Apoyo', 'B2_Cap.Profr(CADI Asore, Compet.)', 'Sustituyó…', '1234567890', 108, 'suplencia')`)
    .run(suplente).lastInsertRowid;
  const sup = db.prepare('INSERT INTO suplencias (falta_id, docente_suplente_id, incidencia_id, monto) VALUES (?, ?, ?, 54)');
  sup.run(f1, suplente, inc);
  sup.run(f2, suplente, inc); // misma incidencia: agrupación
  assert.match(falla(() => sup.run(f1, suplente, inc)), /UNIQUE/, 'una falta solo tiene un suplente');

  db.prepare('DELETE FROM incidencias WHERE id = ?').run(inc);
  assert.equal(db.prepare('SELECT COUNT(*) FROM suplencias WHERE incidencia_id IS NULL').pluck().get(), 2, 'SET NULL');
  db.prepare('DELETE FROM faltas WHERE id = ?').run(f1);
  assert.equal(db.prepare('SELECT COUNT(*) FROM suplencias').pluck().get(), 1, 'cascada desde la falta');
});

test('incidencias: importe no negativo, al menos 1 periodo y origen válido', () => {
  const db = baseNueva();
  const d = docente(db);
  const ins = db.prepare(`INSERT INTO incidencias (docente_id, cc_nomina, motivo, detalle, ceco, importe_total, num_periodos, origen)
                          VALUES (?, 'Sueldo Carga Académica', 'BB_Tutoreo (Preparatoria).', 'x', '1234567890', ?, ?, ?)`);
  ins.run(d, 1000, 2, 'manual');
  assert.match(falla(() => ins.run(d, -1, 1, 'manual')), /CHECK/);
  assert.match(falla(() => ins.run(d, 1, 0, 'manual')), /CHECK/);
  assert.match(falla(() => ins.run(d, 1, 1, 'otro')), /CHECK/);
});

test('envios_correo: modo y resultado válidos', () => {
  const db = baseNueva();
  const q = db.prepare('SELECT id FROM quincenas LIMIT 1').pluck().get();
  const ins = db.prepare(`INSERT INTO envios_correo (quincena_id, reportes, modo, para, asunto, resultado)
                          VALUES (?, 'descuentos,incidencias', ?, 'nacional@x.mx', 'Q16', ?)`);
  ins.run(q, 'borrador', 'borrador_generado');
  assert.match(falla(() => ins.run(q, 'smtp', 'borrador_generado')), /CHECK/);
  assert.match(falla(() => ins.run(q, 'mailto', 'enviado')), /CHECK/);
});

test('opina_campus_semestre: % OPP calculado, un registro por periodo y positivas ≤ alumnos', () => {
  const db = baseNueva();
  const p = (clave) => db.prepare('SELECT id FROM periodos WHERE clave = ?').pluck().get(clave);
  const ins = db.prepare('INSERT INTO opina_campus_semestre (periodo_id, alumnos, positivas) VALUES (?, ?, ?)');
  ins.run(p('ENE-MAY 2026'), 3804, 3333);
  assert.equal(db.prepare('SELECT opp FROM opina_campus_semestre').pluck().get(), 87.6);
  assert.match(falla(() => ins.run(p('ENE-MAY 2026'), 10, 5)), /UNIQUE/);
  assert.match(falla(() => ins.run(p('AGO-DIC 2025'), 10, 11)), /CHECK/);
  assert.match(falla(() => ins.run(p('AGO-DIC 2025'), 0, 0)), /CHECK/);
});

test('v_opina_campus: calificación del campus ponderada por alumno', () => {
  const db = baseNueva();
  const a = docente(db, 'L00000001');
  const b = docente(db, 'L00000002');
  const p = db.prepare('SELECT id FROM periodos WHERE actual = 1').pluck().get();
  const imp = db.prepare(
    "INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'o.xlsx', 'v2', 4)"
  ).run(p).lastInsertRowid;
  const r = db.prepare('INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda) VALUES (?,?,?,?,?)');
  r.run(imp, p, a, '1', 1); r.run(imp, p, a, '1', 1); r.run(imp, p, a, '2', 0); r.run(imp, p, b, '3', 1);
  const v = db.prepare('SELECT respuestas, positivas, calificacion_campus, docentes, grupos FROM v_opina_campus WHERE periodo_id = ?').get(p);
  assert.deepEqual(v, { respuestas: 4, positivas: 3, calificacion_campus: 75, docentes: 2, grupos: 3 });
});

test('el archivo de migraciones existe donde lo espera db.js', () => {
  assert.ok(fs.existsSync(path.join(MIGRACIONES_DIR, '001_inicial.sql')));
});
