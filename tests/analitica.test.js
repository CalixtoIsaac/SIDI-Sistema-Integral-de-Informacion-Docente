/**
 * Consultas agregadas del Panel (HU-15): docentes por género y por nivel de estudios.
 * BD en memoria con el esquema de 04 §4 y las semillas reales (catálogo de niveles).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBd } = require('./helpers/bd');
const { sembrar } = require('../lib/semillas');
const { docentesPorGenero, docentesPorNivelEstudios } = require('../lib/analitica');

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
