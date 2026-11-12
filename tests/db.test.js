/**
 * Pruebas de la base de datos (Sprint 1, esquema en 3FN): migraciones, semillas, restricciones y vistas.
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
  const todas = ['001_inicial.sql', '002_retro_cliente.sql', '003_opina.sql'];
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

test('el esquema 3FN tiene 19 tablas, 17 llaves foráneas y 9 vistas', () => {
  const db = baseNueva({ semillas: false });
  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name"
  ).pluck().all();
  assert.deepEqual(tablas, [
    'asignatura_campos_editados', 'asignaturas', 'catalogos', 'configuracion', 'contratos_importaciones',
    'cv_archivos', 'departamentos', 'docente_bajas', 'docentes', 'grupos_importaciones', 'horarios',
    'materias', 'opina_importaciones', 'opina_respuesta_items', 'opina_respuestas', 'periodos',
    'quincenas', 'tipos_clase', 'titulos_docente'
  ]);
  const fks = tablas.reduce((n, t) => n + db.pragma(`foreign_key_list(${t})`).length, 0);
  assert.equal(fks, 17);
  const vistas = db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").pluck().all();
  assert.deepEqual(vistas, [
    'v_asignatura_tarifa', 'v_docente_antiguedad', 'v_docente_curp', 'v_docente_estudios', 'v_docente_grupos',
    'v_docente_primer_periodo', 'v_docente_recontratable', 'v_opina_crn', 'v_opina_docente'
  ]);
});

test('3FN: ya no existen las columnas derivadas o repetidas', () => {
  const db = baseNueva({ semillas: false });
  const columnas = (t) => db.pragma(`table_info(${t})`).map((c) => c.name);
  const quitadas = {
    docentes: ['fecha_nacimiento', 'genero', 'recontratable'],
    asignaturas: ['clave_materia', 'materia', 'clave_grupo', 'tipo_clase_id', 'editado_a_mano'],
    opina_respuestas: ['periodo_id', 'docente_id', 'crn', 'items']
  };
  for (const [tabla, cols] of Object.entries(quitadas)) {
    for (const c of cols) assert.ok(!columnas(tabla).includes(c), `${tabla}.${c} no debe existir`);
  }
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
  const d = { nombres: 'Ana', apellido_paterno: 'Pérez', curp: null, ...extra };
  return Number(db.prepare('INSERT INTO docentes (nomina, nombres, apellido_paterno, curp) VALUES (?, ?, ?, ?)')
    .run(nomina, d.nombres, d.apellido_paterno, d.curp).lastInsertRowid);
}

/** Materia (por clave) para las asignaturas de las pruebas. */
function materia(db, clave = 'BSMA2003', nombre = 'Math III') {
  const id = db.prepare('SELECT id FROM materias WHERE clave = ?').pluck().get(clave);
  return id ?? Number(db.prepare('INSERT INTO materias (clave, nombre) VALUES (?, ?)').run(clave, nombre).lastInsertRowid);
}

/** Asignatura con CRN (y materia) en el periodo dado. */
function grupo(db, periodoId, docenteId, crn, extra = {}) {
  const a = { materia_id: materia(db), horas_semana: null, idioma: null, ...extra };
  return Number(db.prepare(`INSERT INTO asignaturas (periodo_id, docente_id, crn, materia_id, horas_semana, idioma)
                            VALUES (?, ?, ?, ?, ?, ?)`)
    .run(periodoId, docenteId, crn, a.materia_id, a.horas_semana, a.idioma).lastInsertRowid);
}

const periodo = (db, clave) => db.prepare('SELECT id FROM periodos WHERE clave = ?').pluck().get(clave);

test('docentes: nómina canónica, nómina y CURP únicas', () => {
  const db = baseNueva();
  docente(db, 'L03560330', { curp: 'GADU900515HVZRRZ09' });
  for (const mala of ['3560330', 'L0356033', 'l03560330', 'L0356033A']) {
    assert.match(falla(() => docente(db, mala)), /CHECK/, `nómina ${mala} debe rechazarse`);
  }
  assert.match(falla(() => docente(db, 'L03560330')), /UNIQUE/);
  assert.match(falla(() => docente(db, 'L00000001', { curp: 'GADU900515HVZRRZ09' })), /UNIQUE/);
  docente(db, 'L00000002'); // sin CURP: permitido (varios NULL no chocan)
  docente(db, 'L00000003');
});

test('v_docente_curp: fecha de nacimiento, edad y género salen de la CURP', () => {
  const db = baseNueva();
  const hombre = docente(db, 'L00000001', { curp: 'GADU900515HVZRRZ09' }); // 1990-05-15, H
  const mujer = docente(db, 'L00000002', { curp: 'PELA050229MVZRPNA1' });  // 2005-02-29 no existe → sin fecha
  const mujer2 = docente(db, 'L00000003', { curp: 'PELA040229MVZRPNA1' }); // 2004-02-29, siglo 2000 (letra A)
  const sin = docente(db, 'L00000004');
  const v = (id) => db.prepare('SELECT fecha_nacimiento, edad, genero FROM v_docente_curp WHERE docente_id = ?').get(id);

  const hoy = new Date();
  const edad = (y, m, d) => hoy.getFullYear() - y - ((hoy.getMonth() + 1) * 100 + hoy.getDate() < m * 100 + d ? 1 : 0);
  assert.deepEqual(v(hombre), { fecha_nacimiento: '1990-05-15', edad: edad(1990, 5, 15), genero: 'M' });
  assert.deepEqual(v(mujer), { fecha_nacimiento: null, edad: null, genero: 'F' });
  assert.deepEqual(v(mujer2), { fecha_nacimiento: '2004-02-29', edad: edad(2004, 2, 29), genero: 'F' });
  assert.deepEqual(v(sin), { fecha_nacimiento: null, edad: null, genero: null });

  // Dos docentes pueden haber nacido el mismo día (no hay UNIQUE en la fecha)
  docente(db, 'L00000005', { curp: 'ROLU900515HVZRRZ02' });
  assert.equal(db.prepare("SELECT COUNT(*) FROM v_docente_curp WHERE fecha_nacimiento = '1990-05-15'").pluck().get(), 2);
});

test('las llaves foráneas se hacen cumplir', () => {
  const db = baseNueva();
  assert.match(falla(() => db.prepare(
    "INSERT INTO docentes (nomina, nombres, apellido_paterno, departamento_id) VALUES ('L00000001','A','B',999)").run()),
  /FOREIGN KEY/);
});

test('asignaturas: CRN único por periodo, CRN con materia, actividades sin CRN y horarios válidos', () => {
  const db = baseNueva();
  const d = docente(db);
  const p1 = periodo(db, 'AGO-DIC 2026');
  const p2 = periodo(db, 'ENE-MAY 2026');
  const m = materia(db);
  const asig = db.prepare('INSERT INTO asignaturas (periodo_id, docente_id, crn, nombre_actividad, materia_id) VALUES (?,?,?,?,?)');

  asig.run(p1, d, '16022', null, m);
  assert.match(falla(() => asig.run(p1, d, '16022', null, m)), /UNIQUE/, 'mismo CRN y periodo');
  asig.run(p2, d, '16022', null, m); // mismo CRN en otro periodo: permitido
  assert.match(falla(() => asig.run(p1, d, null, null, m)), /CHECK/, 'ni CRN ni actividad');
  assert.match(falla(() => asig.run(p1, d, '16023', null, null)), /CHECK/, 'un CRN necesita materia');
  assert.match(falla(() => asig.run(p1, d, '16024', null, 999)), /FOREIGN KEY/, 'materia inexistente');
  const act = asig.run(p1, d, null, 'Ruta exploratoria', null).lastInsertRowid; // actividad: sin CRN ni materia
  asig.run(p1, d, null, 'Otra actividad', null); // varias actividades sin CRN no chocan (NULL ≠ NULL)

  const hor = db.prepare('INSERT INTO horarios (asignatura_id, dia_semana, hora_inicio, hora_fin) VALUES (?,?,?,?)');
  hor.run(act, 3, '11:00', '12:29');
  hor.run(act, 3, '16:00', '17:35'); // dos sesiones el mismo día: permitido
  assert.match(falla(() => hor.run(act, 8, '11:00', '12:29')), /CHECK/);
  assert.match(falla(() => hor.run(act, 0, '11:00', '12:29')), /CHECK/);
});

test('materias: la clave es única y el nombre se guarda una sola vez', () => {
  const db = baseNueva();
  const d = docente(db);
  const p = periodo(db, 'AGO-DIC 2026');
  const m = materia(db, 'BSMA2003', 'Math III');
  assert.match(falla(() => db.prepare("INSERT INTO materias (clave, nombre) VALUES ('BSMA2003', 'Otra')").run()), /UNIQUE/);
  db.prepare("INSERT INTO materias (clave, nombre) VALUES (NULL, 'Sin clave 1'), (NULL, 'Sin clave 2')").run();
  grupo(db, p, d, '1');
  grupo(db, p, d, '2');
  db.prepare("UPDATE materias SET nombre = 'Math III: regularity and repetition' WHERE id = ?").run(m);
  const nombres = db.prepare(`SELECT DISTINCT m.nombre FROM asignaturas a JOIN materias m ON m.id = a.materia_id`).pluck().all();
  assert.deepEqual(nombres, ['Math III: regularity and repetition'], 'un solo UPDATE cambia todos sus grupos');
  assert.match(falla(() => db.prepare('DELETE FROM materias WHERE id = ?').run(m)), /FOREIGN KEY/, 'materia con grupos');
});

test('asignatura_campos_editados: un campo por fila, sin repetir', () => {
  const db = baseNueva();
  const a = grupo(db, periodo(db, 'AGO-DIC 2026'), docente(db), '1');
  const ins = db.prepare('INSERT INTO asignatura_campos_editados (asignatura_id, campo) VALUES (?, ?)');
  ins.run(a, 'idioma');
  ins.run(a, 'horarios');
  assert.match(falla(() => ins.run(a, 'idioma')), /UNIQUE|PRIMARY KEY/);
  assert.match(falla(() => ins.run(999, 'plan')), /FOREIGN KEY/);
  const campos = db.prepare('SELECT campo FROM asignatura_campos_editados WHERE asignatura_id = ? ORDER BY campo').pluck().all(a);
  assert.deepEqual(campos, ['horarios', 'idioma']);
});

test('v_asignatura_tarifa: la tarifa sale de (horas, idioma) y sin coincidencia es "Sin tarifa"', () => {
  const db = baseNueva();
  const d = docente(db);
  const p = periodo(db, 'AGO-DIC 2026');
  const a3 = grupo(db, p, d, '1', { horas_semana: 3, idioma: 'ES' });
  const a5 = grupo(db, p, d, '2', { horas_semana: 5, idioma: 'EN' });
  const a2 = grupo(db, p, d, '3', { horas_semana: 2, idioma: 'ES' }); // no hay tarifa de 2 h
  const t = (id) => db.prepare('SELECT tipo_clase, pago_por_dia, pago_mensual FROM v_asignatura_tarifa WHERE asignatura_id = ?').get(id);
  assert.deepEqual(t(a3), { tipo_clase: 'Clase de 3 hrs en español', pago_por_dia: 54, pago_mensual: 1764 });
  assert.deepEqual(t(a5), { tipo_clase: 'Clase de 5 hrs en inglés', pago_por_dia: 106, pago_mensual: 3528 });
  assert.deepEqual(t(a2), { tipo_clase: null, pago_por_dia: null, pago_mensual: null });

  // Si la coordinadora corrige el idioma, la tarifa cambia sola (no hay copia que actualizar)
  db.prepare("UPDATE asignaturas SET idioma = 'EN' WHERE id = ?").run(a3);
  assert.equal(t(a3).tipo_clase, 'Clase de 3 hrs en inglés');
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

test('borrar un docente borra en cascada títulos, CV, asignaturas, horarios, campos editados, bajas y OPINA', () => {
  const db = baseNueva();
  const d = docente(db);
  const p = db.prepare('SELECT id FROM periodos WHERE actual = 1').pluck().get();
  db.prepare("INSERT INTO titulos_docente (docente_id, grado) VALUES (?, 'Maestría')").run(d);
  db.prepare("INSERT INTO cv_archivos (docente_id, nombre_original, ruta, sha256) VALUES (?, 'a.pdf', 'data/cv/a.pdf', 'x')").run(d);
  db.prepare("INSERT INTO docente_bajas (docente_id, periodo_id, motivo, observaciones, recontratable) VALUES (?,?,'Renuncia','Se mudó',1)").run(d, p);
  const a = grupo(db, p, d, '1');
  db.prepare("INSERT INTO horarios (asignatura_id, dia_semana, hora_inicio, hora_fin) VALUES (?,1,'08:00','09:29')").run(a);
  db.prepare("INSERT INTO asignatura_campos_editados (asignatura_id, campo) VALUES (?, 'idioma')").run(a);
  const imp = db.prepare("INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'o.xlsx', 'v2', 1)").run(p).lastInsertRowid;
  const r = db.prepare('INSERT INTO opina_respuestas (importacion_id, asignatura_id, recomienda) VALUES (?, ?, 1)').run(imp, a).lastInsertRowid;
  db.prepare("INSERT INTO opina_respuesta_items (respuesta_id, reactivo, valor) VALUES (?, 'retos', 'Sí')").run(r);

  db.prepare('DELETE FROM docentes WHERE id = ?').run(d);
  for (const t of ['titulos_docente', 'cv_archivos', 'docente_bajas', 'asignaturas', 'horarios',
    'asignatura_campos_editados', 'opina_respuestas', 'opina_respuesta_items']) {
    assert.equal(db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get(), 0, `${t} debe quedar vacía`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) FROM materias').pluck().get(), 1, 'la materia es del plan, no del docente');
});

test('un periodo con asignaturas no se puede borrar (sin cascada)', () => {
  const db = baseNueva();
  const p = db.prepare('SELECT id FROM periodos WHERE actual = 1').pluck().get();
  grupo(db, p, docente(db), '1');
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

test('v_docente_recontratable: vale lo de la ÚLTIMA baja y sin bajas no aparece', () => {
  const db = baseNueva();
  const a = docente(db, 'L00000001');
  const b = docente(db, 'L00000002');
  const baja = db.prepare(`INSERT INTO docente_bajas (docente_id, fecha, motivo, observaciones, recontratable)
                           VALUES (?, ?, 'Otro', 'x', ?)`);
  baja.run(a, '2025-01-10', 0);
  baja.run(a, '2026-06-01', 1); // la más reciente manda
  baja.run(b, '2026-06-01', 1);
  baja.run(b, '2026-06-01', 0); // mismo día: gana la de mayor id
  assert.match(falla(() => baja.run(a, '2026-07-01', 2)), /CHECK/);

  const filas = db.prepare('SELECT docente_id, recontratable FROM v_docente_recontratable ORDER BY docente_id').all();
  assert.deepEqual(filas, [{ docente_id: a, recontratable: 1 }, { docente_id: b, recontratable: 0 }]);
  const nunca = docente(db, 'L00000003');
  assert.equal(db.prepare('SELECT COUNT(*) FROM v_docente_recontratable WHERE docente_id = ?').pluck().get(nunca), 0);
});

test('v_docente_grupos: CRN + actividades del periodo actual; sin grupos = 0', () => {
  const db = baseNueva();
  const a = docente(db, 'L00000001');
  const b = docente(db, 'L00000002');
  const actual = periodo(db, 'AGO-DIC 2026');
  grupo(db, actual, a, '1');
  grupo(db, actual, a, '2');
  db.prepare("INSERT INTO asignaturas (periodo_id, docente_id, nombre_actividad) VALUES (?, ?, 'Ruta exploratoria')").run(actual, a);
  grupo(db, periodo(db, 'ENE-MAY 2026'), a, '9'); // otro periodo: no cuenta
  grupo(db, periodo(db, 'ENE-MAY 2026'), b, '8');
  const n = (id) => db.prepare('SELECT num_grupos FROM v_docente_grupos WHERE docente_id = ?').pluck().get(id);
  assert.equal(n(a), 3);
  assert.equal(n(b), 0);
});

test('v_docente_antiguedad: desde el primer semestre con clases, en años y semestres', () => {
  const db = baseNueva();
  const hoy = new Date();
  const anioHoy = hoy.getFullYear();
  const semHoy = anioHoy * 2 + (hoy.getMonth() + 1 >= 8 ? 1 : 0);
  const esperado = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const anios = anioHoy - y - ((hoy.getMonth() + 1) * 100 + hoy.getDate() < m * 100 + d ? 1 : 0);
    return { primer_inicio: iso, anios, semestres: semHoy - (y * 2 + (m >= 8 ? 1 : 0)) + 1 };
  };
  const v = (id) => db.prepare('SELECT primer_inicio, anios, semestres FROM v_docente_antiguedad WHERE docente_id = ?').get(id);

  const conGrupos = docente(db, 'L00000001');
  grupo(db, periodo(db, 'AGO-DIC 2024'), conGrupos, '1');
  grupo(db, periodo(db, 'AGO-DIC 2026'), conGrupos, '2');
  assert.deepEqual(v(conGrupos), esperado('2024-08-01'));

  const capturado = docente(db, 'L00000002');
  db.prepare("UPDATE docentes SET primer_semestre_texto = 'AGO-DIC 2017' WHERE id = ?").run(capturado);
  grupo(db, periodo(db, 'AGO-DIC 2026'), capturado, '3');
  assert.deepEqual(v(capturado), esperado('2017-08-01'), 'el texto capturado es anterior: se usa');

  const posterior = docente(db, 'L00000003');
  db.prepare("UPDATE docentes SET primer_semestre_texto = 'ENE-MAY 2026' WHERE id = ?").run(posterior);
  grupo(db, periodo(db, 'AGO-DIC 2024'), posterior, '4');
  assert.deepEqual(v(posterior), esperado('2024-08-01'), 'el texto es posterior a sus grupos: gana el grupo');

  const sinDatos = docente(db, 'L00000004');
  assert.deepEqual(v(sinDatos), { primer_inicio: null, anios: null, semestres: null });
});

test('OPINA: la respuesta apunta a la asignatura; vistas ponderadas por alumno; cascadas', () => {
  const db = baseNueva();
  const d = docente(db);
  const p = db.prepare('SELECT id FROM periodos WHERE actual = 1').pluck().get();
  const g1 = grupo(db, p, d, '1');
  const g2 = grupo(db, p, d, '2');
  const imp = db.prepare(
    "INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'opina.xlsx', 'v2', 5)"
  ).run(p).lastInsertRowid;
  assert.match(falla(() => db.prepare(
    "INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'x.xlsx', 'v3', 1)").run(p)), /CHECK/);

  const r = db.prepare('INSERT INTO opina_respuestas (importacion_id, asignatura_id, recomienda) VALUES (?,?,?)');
  assert.match(falla(() => r.run(imp, g1, 2)), /CHECK/);
  assert.match(falla(() => r.run(imp, 999, 1)), /FOREIGN KEY/);
  // CRN 1: 3 de 4 positivas · CRN 2: 1 de 1 positiva  → global 4 de 5 = 80 %, no el promedio (75 + 100) / 2
  const ids = [1, 1, 1, 0].map((v) => r.run(imp, g1, v).lastInsertRowid);
  r.run(imp, g2, 1);

  const item = db.prepare('INSERT INTO opina_respuesta_items (respuesta_id, reactivo, valor) VALUES (?, ?, ?)');
  item.run(ids[0], 'conocimiento', 'Sí');
  item.run(ids[0], 'retos', 'No estoy seguro');
  assert.match(falla(() => item.run(ids[0], 'retos', 'Sí')), /UNIQUE|PRIMARY KEY/, 'un reactivo por respuesta');

  const porCrn = db.prepare('SELECT periodo_id, docente_id, crn, respuestas, positivas, porcentaje FROM v_opina_crn ORDER BY crn').all();
  assert.deepEqual(porCrn, [
    { periodo_id: p, docente_id: d, crn: '1', respuestas: 4, positivas: 3, porcentaje: 75 },
    { periodo_id: p, docente_id: d, crn: '2', respuestas: 1, positivas: 1, porcentaje: 100 }
  ]);
  const global = db.prepare('SELECT respuestas, positivas, porcentaje FROM v_opina_docente WHERE docente_id = ?').get(d);
  assert.deepEqual(global, { respuestas: 5, positivas: 4, porcentaje: 80 });

  db.prepare('DELETE FROM opina_importaciones WHERE id = ?').run(imp);
  assert.equal(db.prepare('SELECT COUNT(*) FROM opina_respuestas').pluck().get(), 0, 'cascada a las respuestas');
  assert.equal(db.prepare('SELECT COUNT(*) FROM opina_respuesta_items').pluck().get(), 0, 'y a sus reactivos');
  assert.equal(db.prepare('SELECT COUNT(*) FROM asignaturas').pluck().get(), 2, 'los grupos se quedan');
});

test('v_docente_primer_periodo: también considera las respuestas de OPINA', () => {
  const db = baseNueva();
  const d = docente(db);
  const g2025 = grupo(db, periodo(db, 'AGO-DIC 2025'), d, '9');
  const imp = db.prepare(
    "INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'o.xlsx', 'v1', 1)"
  ).run(periodo(db, 'AGO-DIC 2025')).lastInsertRowid;
  db.prepare('INSERT INTO opina_respuestas (importacion_id, asignatura_id, recomienda) VALUES (?,?,1)').run(imp, g2025);
  grupo(db, periodo(db, 'AGO-DIC 2026'), d, '1');
  const v = db.prepare('SELECT primer_inicio FROM v_docente_primer_periodo WHERE docente_id = ?').get(d);
  assert.equal(v.primer_inicio, '2025-08-01');
});

test('v_docente_primer_periodo: el menor entre lo capturado y sus asignaturas', () => {
  const db = baseNueva();
  const a = docente(db, 'L00000001');
  const b = docente(db, 'L00000002');
  docente(db, 'L00000003'); // sin periodos: no aparece

  grupo(db, periodo(db, 'ENE-MAY 2026'), a, '1');
  grupo(db, periodo(db, 'AGO-DIC 2026'), a, '2');
  db.prepare('UPDATE docentes SET primer_periodo_id = ? WHERE id = ?').run(periodo(db, 'AGO-DIC 2024'), b); // capturado a mano
  grupo(db, periodo(db, 'AGO-DIC 2026'), b, '3');

  const filas = db.prepare('SELECT * FROM v_docente_primer_periodo ORDER BY docente_id').all();
  assert.deepEqual(filas, [
    { docente_id: a, primer_inicio: '2026-01-01' },
    { docente_id: b, primer_inicio: '2024-08-01' }
  ]);
});

test('el archivo de migraciones existe donde lo espera db.js', () => {
  assert.ok(fs.existsSync(path.join(MIGRACIONES_DIR, '001_inicial.sql')));
});
