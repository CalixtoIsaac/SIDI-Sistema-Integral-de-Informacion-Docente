/**
 * BD SQLite en memoria para las pruebas de servicios.
 * Usa lib/migraciones/001_inicial.sql si ya existe; si no, el DDL de context/04_Modelo_Datos.md §4.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const RAIZ = path.join(__dirname, '..', '..');

function ddl() {
  const migracion = path.join(RAIZ, 'lib', 'migraciones', '001_inicial.sql');
  if (fs.existsSync(migracion)) return fs.readFileSync(migracion, 'utf8');
  const doc = fs.readFileSync(path.join(RAIZ, 'context', '04_Modelo_Datos.md'), 'utf8');
  const seccion = doc.slice(doc.indexOf('## 4. DDL'));
  const m = seccion.match(/```sql\r?\n([\s\S]*?)```/);
  if (!m) throw new Error('No se encontró el DDL en 04_Modelo_Datos.md');
  return m[1];
}

const TARIFAS = [
  ['Clase de 5 hrs en español', 5, 'ES', 11760, 90], ['Clase de 5 hrs en inglés', 5, 'EN', 14112, 106],
  ['Clase de 4 hrs en español', 4, 'ES', 9408, 70], ['Clase de 4 hrs en inglés', 4, 'EN', 11290, 85],
  ['Clase de 3 hrs en español', 3, 'ES', 7056, 54], ['Clase de 3 hrs en inglés', 3, 'EN', 8467, 65],
  ['Clase de 1.5 hrs en español', 1.5, 'ES', 3528, 26], ['Clase de 1.5 hrs en inglés', 1.5, 'EN', 4234, 32],
];

const CATALOGOS = [
  ['nivel_estudios', 'Licenciatura', null, 1], ['nivel_estudios', 'Especialidad', null, 2],
  ['nivel_estudios', 'Maestría', null, 3], ['nivel_estudios', 'Doctorado', null, 4],
  ['motivo_baja', 'Sin disponibilidad de horario', '1', 1], ['motivo_baja', 'Renuncia', '1', 2],
  ['motivo_baja', 'No cumplió expectativas', '0', 3], ['motivo_baja', 'Problemas de conducta o disciplina', '0', 4],
  ['motivo_baja', 'Otro', null, 5],
  ['campo_formacion', 'Ingeniería y Tecnología', null, 1], ['campo_formacion', 'Educación', null, 2],
];

function crearBd() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(ddl());
  if (db.prepare('SELECT COUNT(*) n FROM tipos_clase').get().n === 0) {
    const t = db.prepare('INSERT INTO tipos_clase (nombre, horas_semana, idioma, pago_semestre, pago_por_dia) VALUES (?, ?, ?, ?, ?)');
    for (const fila of TARIFAS) t.run(...fila);
  }
  const c = db.prepare('INSERT OR IGNORE INTO catalogos (tipo, valor, descripcion, orden) VALUES (?, ?, ?, ?)');
  for (const fila of CATALOGOS) c.run(...fila);
  return db;
}

module.exports = { crearBd };
