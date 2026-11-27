/**
 * Consultas agregadas del Panel (HU-15) y de las 8 gráficas del resumen ejecutivo (HU-26).
 * BD en memoria con el esquema de 04 §4 y las semillas reales (periodos, quincenas, catálogos, % OPP).
 * Todos los datos de prueba son inventados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBd } = require('./helpers/bd');
const { sembrar } = require('../lib/semillas');
const a = require('../lib/analitica');

const { docentesPorGenero, docentesPorNivelEstudios } = a;

function baseConSemillas() {
  const db = crearBd();
  sembrar(db);
  return db;
}

let consecutivo = 0;
/** Docente de prueba (datos inventados). */
function docente(db, { genero = null, activo = 1 } = {}) {
  consecutivo += 1;
  const nomina = 'L' + String(consecutivo).padStart(8, '0');
  return Number(db.prepare(`INSERT INTO docentes (nomina, nombres, apellido_paterno, genero, activo)
                            VALUES (?, 'Docente', 'Demo', ?, ?)`).run(nomina, genero, activo).lastInsertRowid);
}

function titulo(db, docenteId, grado, estatus = 'Titulado') {
  db.prepare('INSERT INTO titulos_docente (docente_id, grado, estatus) VALUES (?, ?, ?)').run(docenteId, grado, estatus);
}

test('por género: solo activos, M y F siempre presentes y "ninguno" si falta el dato', () => {
  const db = baseConSemillas();
  docente(db, { genero: 'F' });
  docente(db, { genero: 'F' });
  docente(db, { genero: 'M' });
  docente(db);                              // sin género
  docente(db, { genero: 'M', activo: 0 }); // inactivo: no cuenta por defecto

  assert.deepEqual(docentesPorGenero(db), [
    { genero: 'M', docentes: 1 },
    { genero: 'F', docentes: 2 },
    { genero: 'ninguno', docentes: 1 }
  ]);
  assert.deepEqual(docentesPorGenero(db, { activo: false }), [
    { genero: 'M', docentes: 1 },
    { genero: 'F', docentes: 0 }
  ]);
  const todos = docentesPorGenero(db, { activo: null });
  assert.equal(todos.reduce((n, f) => n + f.docentes, 0), 5);
});

test('por género: sin docentes da ceros (la gráfica no se queda vacía)', () => {
  const db = baseConSemillas();
  assert.deepEqual(docentesPorGenero(db), [{ genero: 'M', docentes: 0 }, { genero: 'F', docentes: 0 }]);
});

test('por nivel de estudios: el más alto titulado, en el orden del catálogo y con ceros', () => {
  const db = baseConSemillas();
  const a = docente(db, { genero: 'F' });
  titulo(db, a, 'Licenciatura');
  titulo(db, a, 'Maestría');                       // cuenta como Maestría
  const b = docente(db, { genero: 'M' });
  titulo(db, b, 'Licenciatura');
  titulo(db, b, 'Doctorado', 'Estudios en curso'); // en curso no sube el nivel
  const c = docente(db, { genero: 'M' });
  titulo(db, c, 'Licenciatura');
  docente(db, { genero: 'F' });                    // sin títulos -> ninguno
  const inactivo = docente(db, { genero: 'F', activo: 0 });
  titulo(db, inactivo, 'Doctorado');

  assert.deepEqual(docentesPorNivelEstudios(db), [
    { nivelEstudios: 'Licenciatura', orden: 1, docentes: 2 },
    { nivelEstudios: 'Especialidad', orden: 2, docentes: 0 },
    { nivelEstudios: 'Maestría', orden: 3, docentes: 1 },
    { nivelEstudios: 'Doctorado', orden: 4, docentes: 0 },
    { nivelEstudios: 'ninguno', orden: null, docentes: 1 }
  ]);
  const doctorado = docentesPorNivelEstudios(db, { activo: null }).find((f) => f.nivelEstudios === 'Doctorado');
  assert.equal(doctorado.docentes, 1, 'con activo: null también cuenta al inactivo');
});

test('por nivel de estudios: un nivel desactivado en el catálogo se sigue mostrando si alguien lo tiene', () => {
  const db = baseConSemillas();
  db.prepare("UPDATE catalogos SET activo = 0 WHERE tipo = 'nivel_estudios' AND valor = 'Especialidad'").run();
  const a = docente(db);
  titulo(db, a, 'Especialidad');
  const filas = docentesPorNivelEstudios(db);
  assert.deepEqual(filas.map((f) => f.nivelEstudios), ['Licenciatura', 'Maestría', 'Doctorado', 'Especialidad']);
  assert.equal(filas.at(-1).docentes, 1);
});

test('las sumas cuadran con el total de docentes activos', () => {
  const db = baseConSemillas();
  for (let i = 0; i < 12; i++) {
    const id = docente(db, { genero: i % 3 === 0 ? null : i % 2 ? 'M' : 'F', activo: i === 11 ? 0 : 1 });
    if (i % 4) titulo(db, id, ['Licenciatura', 'Maestría', 'Doctorado'][i % 3]);
  }
  const activos = db.prepare('SELECT COUNT(*) FROM docentes WHERE activo = 1').pluck().get();
  const suma = (filas) => filas.reduce((n, f) => n + f.docentes, 0);
  assert.equal(suma(docentesPorGenero(db)), activos);
  assert.equal(suma(docentesPorNivelEstudios(db)), activos);
});

// ---------------------------------------------------------------------------
// HU-26: consultas de las gráficas G1, G2, G3, G4, G9, G10, G15 y G16
// ---------------------------------------------------------------------------
const idPeriodo = (db, clave) => db.prepare('SELECT id FROM periodos WHERE clave = ?').pluck().get(clave);
const idQuincena = (db, anio, numero) => db.prepare('SELECT id FROM quincenas WHERE anio = ? AND numero = ?').pluck().get(anio, numero);

/** Respuestas OPINA inventadas: `si` de `total` alumnos recomiendan al docente en el periodo. */
function opina(db, periodoId, docenteId, si, total) {
  const imp = Number(db.prepare(`INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas)
                                 VALUES (?, 'prueba.xlsx', 'v2', ?)`).run(periodoId, total).lastInsertRowid);
  const ins = db.prepare(`INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda)
                          VALUES (?, ?, ?, '90001', ?)`);
  for (let i = 0; i < total; i++) ins.run(imp, periodoId, docenteId, i < si ? 1 : 0);
}

function asignatura(db, periodoId, docenteId, crn = null) {
  return Number(db.prepare(`INSERT INTO asignaturas (periodo_id, docente_id, crn, nombre_actividad, materia)
                            VALUES (?, ?, ?, ?, 'Materia de prueba')`).run(periodoId, docenteId, crn, crn ? null : 'Tutoreo').lastInsertRowid);
}

function falta(db, { docenteId, asignaturaId = null, fecha = null, justificacion = 'ninguna', monto = 0, quincenaId = null }) {
  return Number(db.prepare(`INSERT INTO faltas (docente_id, asignatura_id, fecha, motivo, justificacion, monto_descuento, quincena_id)
                            VALUES (?, ?, ?, 'Falta de prueba', ?, ?, ?)`).run(docenteId, asignaturaId, fecha, justificacion, monto, quincenaId).lastInsertRowid);
}

test('G1: % OPP del campus por semestre con la variación contra el anterior', () => {
  const db = baseConSemillas();
  const filas = a.oppCampus(db);
  assert.deepEqual(filas.map((f) => [f.periodo, f.opp, f.variacion]), [
    ['ENE-MAY 2025', 88.3, null], ['AGO-DIC 2025', 85.9, -2.4], ['ENE-MAY 2026', 87.6, 1.7],
  ]);
  db.prepare('DELETE FROM opina_campus_semestre').run();
  assert.deepEqual(a.oppCampus(db), [], 'sin captura → lista vacía ("Sin datos registrados")');
});

test('G2: docentes por rango de calificación y los de muestra insuficiente aparte', () => {
  const db = baseConSemillas();
  const p = idPeriodo(db, 'ENE-MAY 2026');
  opina(db, p, docente(db), 6, 10);    // 60 %  → < 70
  opina(db, p, docente(db), 7, 10);    // 70 %  → 70–79 (límite inferior)
  opina(db, p, docente(db), 79, 100);  // 79 %  → 70–79
  opina(db, p, docente(db), 8, 10);    // 80 %  → 80–89
  opina(db, p, docente(db), 9, 10);    // 90 %  → 90–100
  opina(db, p, docente(db), 10, 10);   // 100 % → 90–100
  opina(db, p, docente(db), 1, 5);     // muestra insuficiente: no entra en los rangos
  const [g2] = a.distribucionOpina(db);
  assert.equal(g2.periodo, 'ENE-MAY 2026');
  assert.deepEqual(g2.rangos, [
    { rango: '< 70', docentes: 1 }, { rango: '70–79', docentes: 2 },
    { rango: '80–89', docentes: 1 }, { rango: '90–100', docentes: 2 },
  ]);
  assert.equal(g2.docentes, 6);
  assert.equal(g2.sinMuestra, 1);
  assert.deepEqual(a.distribucionOpina(db, { periodoIds: [idPeriodo(db, 'AGO-DIC 2025')] }), [], 'semestre sin OPINA no aparece');
});

test('G3: top 5 y bottom 5 sin repetir docentes; sin periodo usa el último con OPINA', () => {
  const db = baseConSemillas();
  const p = idPeriodo(db, 'ENE-MAY 2026');
  const ids = [];
  for (let i = 0; i < 12; i++) {
    const id = docente(db);
    ids.push(id);
    opina(db, p, id, 10 + i, 22);  // calificaciones distintas, de menor a mayor
  }
  const g3 = a.topBottomOpina(db);  // el actual (AGO-DIC 2026) aún no tiene OPINA
  assert.equal(g3.periodo, 'ENE-MAY 2026');
  assert.deepEqual(g3.top.map((d) => d.docenteId), ids.slice(-5).reverse());
  assert.deepEqual(g3.bottom.map((d) => d.docenteId), ids.slice(0, 5), 'el más bajo primero');
  assert.match(g3.top[0].nombre, /Docente Demo/);

  const pocos = a.topBottomOpina(db, { periodoId: p, n: 8 });
  assert.equal(pocos.top.length + pocos.bottom.length, 12, 'con pocos docentes no se repiten entre listas');
  assert.deepEqual(a.topBottomOpina(db, { periodoId: idPeriodo(db, 'AGO-DIC 2025') }).top, []);
});

test('G4: cambio por docente entre dos semestres, solo quienes tienen muestra en ambos', () => {
  const db = baseConSemillas();
  const antes = idPeriodo(db, 'AGO-DIC 2025');
  const despues = idPeriodo(db, 'ENE-MAY 2026');
  const sube = docente(db);
  const baja = docente(db);
  const nuevo = docente(db);
  opina(db, antes, sube, 7, 10);
  opina(db, despues, sube, 9, 10);
  opina(db, antes, baja, 9, 10);
  opina(db, despues, baja, 6, 10);
  opina(db, despues, nuevo, 10, 10);  // solo en un semestre: no se compara

  const g4 = a.cambioOpina(db);       // sin parámetros: último con OPINA contra el anterior con OPINA
  assert.deepEqual([g4.antes.periodo, g4.despues.periodo], ['AGO-DIC 2025', 'ENE-MAY 2026']);
  assert.deepEqual(g4.docentes.map((d) => [d.docenteId, d.antes, d.despues, d.cambio]), [
    [sube, 70, 90, 20], [baja, 90, 60, -30],
  ]);
  const explicito = a.cambioOpina(db, { periodoId: despues, compararCon: antes });
  assert.deepEqual(explicito.docentes, g4.docentes);
  assert.deepEqual(a.cambioOpina(db, { periodoId: antes }).docentes, [], 'sin semestre anterior con OPINA');
});

test('G9: faltas en 3 tipos (asunto personal, incapacidad médica, viaje escolar), del semestre por CRN o por fecha', () => {
  const db = baseConSemillas();
  const actual = idPeriodo(db, 'AGO-DIC 2026');
  const d1 = docente(db);
  const d2 = docente(db);
  const crn = asignatura(db, actual, d1, '41001');
  falta(db, { docenteId: d1, asignaturaId: crn, fecha: '2026-09-07', monto: 54 });
  falta(db, { docenteId: d1, asignaturaId: crn, fecha: '2026-09-08', monto: 54 });
  falta(db, { docenteId: d2, fecha: '2026-10-01', justificacion: 'incapacidad_imss' });  // sin CRN: por fecha
  falta(db, { docenteId: d2, fecha: '2026-10-02', justificacion: 'cita_imss' });
  falta(db, { docenteId: d1, fecha: '2026-10-05', justificacion: 'viaje_escolar' });
  falta(db, { docenteId: d2, fecha: '2026-03-02' });                                      // otro semestre

  const g9 = a.faltasPorTipo(db);
  assert.equal(g9.periodo, 'AGO-DIC 2026');
  assert.deepEqual(g9.tipos, [
    { tipo: 'Asunto personal', faltas: 2, docentes: 1 },
    { tipo: 'Incapacidad médica', faltas: 2, docentes: 1 },
    { tipo: 'Viaje escolar', faltas: 1, docentes: 1 },
  ]);
  const otro = a.faltasPorTipo(db, { periodoId: idPeriodo(db, 'ENE-MAY 2026') });
  assert.equal(otro.tipos[0].faltas, 1);
  assert.deepEqual(a.faltasPorTipo(db, { periodoId: idPeriodo(db, 'AGO-DIC 2025') }).tipos.map((t) => t.faltas), [0, 0, 0]);
});

test('G10: descontado vs. pagado a suplentes por quincena de reporte; lo pendiente no entra', () => {
  const db = baseConSemillas();
  const titular = docente(db);
  const suplente = docente(db);
  const q20 = idQuincena(db, 2026, 20);
  const q21 = idQuincena(db, 2026, 21);
  const conSuplente = falta(db, { docenteId: titular, fecha: '2026-10-20', monto: 54, quincenaId: q20 });
  falta(db, { docenteId: titular, fecha: '2026-10-21', monto: 54, quincenaId: q20 });
  const imss = falta(db, { docenteId: titular, fecha: '2026-11-03', justificacion: 'incapacidad_imss', monto: 0, quincenaId: q21 });
  falta(db, { docenteId: titular, fecha: '2026-11-10', monto: 54 });  // pendiente de reportar
  db.prepare('INSERT INTO suplencias (falta_id, docente_suplente_id, monto) VALUES (?, ?, 54)').run(conSuplente, suplente);
  // Suplencia IMSS: al titular no se le descuenta, pero el suplente sí cobra (en la quincena de su incidencia)
  const inc = Number(db.prepare(`INSERT INTO incidencias (quincena_id, docente_id, cc_nomina, motivo, detalle, ceco, importe_total, origen)
                                 VALUES (?, ?, 'CC', 'Suplencia', 'Detalle', '5420103000', 65, 'suplencia')`).run(q21, suplente).lastInsertRowid);
  db.prepare('INSERT INTO suplencias (falta_id, docente_suplente_id, incidencia_id, monto) VALUES (?, ?, ?, 65)').run(imss, suplente, inc);

  const g10 = a.descontadoVsPagado(db);
  assert.equal(g10.periodo, 'AGO-DIC 2026');
  assert.deepEqual(g10.quincenas.map((q) => [q.quincena, q.descontado, q.pagado, q.diferencia]), [
    ['Q20', 108, 54, 54], ['Q21', 0, 65, -65],
  ]);
  assert.deepEqual(g10.totales, { descontado: 108, pagado: 119, diferencia: -11 });
  assert.deepEqual(a.descontadoVsPagado(db, { periodoId: idPeriodo(db, 'ENE-MAY 2026') }).quincenas, []);
});

test('G15: activos, nuevos y bajas (recontratables / no) por semestre', () => {
  const db = baseConSemillas();
  const ene = idPeriodo(db, 'ENE-MAY 2026');
  const ago = idPeriodo(db, 'AGO-DIC 2026');
  const antiguo = docente(db);
  const conHistorial = docente(db);
  const nuevo = docente(db);
  const seVa = docente(db);
  const seVaNoVuelve = docente(db);
  db.prepare("UPDATE docentes SET primer_semestre_texto = 'AGO-DIC 2019' WHERE id = ?").run(conHistorial);
  for (const id of [antiguo, conHistorial, seVa, seVaNoVuelve]) asignatura(db, ene, id, `5${id}`);
  for (const id of [antiguo, conHistorial, nuevo]) asignatura(db, ago, id, `6${id}`);
  const baja = db.prepare(`INSERT INTO docente_bajas (docente_id, periodo_id, motivo, observaciones, recontratable)
                           VALUES (?, ?, 'Renuncia', 'Texto que no sale en el resumen', ?)`);
  baja.run(seVa, ago, 1);
  baja.run(seVaNoVuelve, ago, 0);

  const g15 = a.plantillaPorSemestre(db, { periodoIds: [ene, ago] });
  assert.deepEqual(g15.map((p) => [p.periodo, p.activos, p.nuevos, p.bajas, p.bajasRecontratables, p.bajasNoRecontratables, p.sinHistorial]), [
    ['ENE-MAY 2026', 4, 3, 0, 0, 0, true],   // primer semestre importado: solo el de primer semestre capturado no es nuevo
    ['AGO-DIC 2026', 3, 1, 2, 1, 1, false],
  ]);
  assert.ok(!JSON.stringify(g15).includes('Texto que no sale'), 'sin observaciones de baja');
  assert.equal(a.plantillaPorSemestre(db).length, db.prepare('SELECT COUNT(*) FROM periodos').pluck().get(), 'sin filtro: todos');
});

test('G16: perfil con género, nivel de estudios y docentes estudiando (solo activos)', () => {
  const db = baseConSemillas();
  const x = docente(db, { genero: 'F' });
  titulo(db, x, 'Licenciatura');
  titulo(db, x, 'Maestría', 'Estudios en curso');
  const y = docente(db, { genero: 'M' });
  titulo(db, y, 'Maestría');
  titulo(db, y, 'Doctorado', 'Estudios en curso');
  docente(db, { genero: 'M' });
  const inactivo = docente(db, { genero: 'F', activo: 0 });
  titulo(db, inactivo, 'Doctorado', 'Estudios en curso');

  const g16 = a.perfilDocentes(db);
  assert.deepEqual(g16.genero, docentesPorGenero(db));
  assert.deepEqual(g16.nivelEstudios, docentesPorNivelEstudios(db));
  assert.deepEqual(g16.estudiando, {
    si: 2, no: 1,
    porNivel: [{ nivel: 'Doctorado', docentes: 1 }, { nivel: 'Maestría', docentes: 1 }],
  });
});

test('sin datos: cada gráfica devuelve vacío o ceros, nunca datos de ejemplo', () => {
  const db = baseConSemillas();
  db.prepare('DELETE FROM opina_campus_semestre').run();
  assert.deepEqual(a.oppCampus(db), []);
  assert.deepEqual(a.distribucionOpina(db), []);
  assert.deepEqual(a.topBottomOpina(db), { periodoId: null, periodo: null, top: [], bottom: [] });
  assert.deepEqual(a.cambioOpina(db).docentes, []);
  assert.deepEqual(a.faltasPorTipo(db).tipos.map((t) => t.faltas), [0, 0, 0]);
  assert.deepEqual(a.descontadoVsPagado(db).totales, { descontado: 0, pagado: 0, diferencia: 0 });
  assert.ok(a.plantillaPorSemestre(db).every((p) => p.activos === 0 && p.bajas === 0));
  assert.deepEqual(a.perfilDocentes(db).estudiando, { si: 0, no: 0, porNivel: [] });
});
