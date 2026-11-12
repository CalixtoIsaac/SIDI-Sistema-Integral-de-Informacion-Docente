/**
 * BD SQLite en memoria para las pruebas de servicios.
 * Usa TODAS las migraciones de lib/migraciones/ (001, 002, 003…) en orden, igual que lib/db.js;
 * si no hay ninguna, el DDL de context/04_Modelo_Datos.md §4.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const RAIZ = path.join(__dirname, '..', '..');

function ddl() {
  const dirMigraciones = path.join(RAIZ, 'lib', 'migraciones');
  const migraciones = fs.existsSync(dirMigraciones)
    ? fs.readdirSync(dirMigraciones).filter((f) => /^\d+.*\.sql$/.test(f)).sort()
    : [];
  if (migraciones.length) {
    return migraciones.map((f) => fs.readFileSync(path.join(dirMigraciones, f), 'utf8')).join('\n');
  }
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

function crearBd() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(ddl());
  const t = db.prepare('INSERT INTO tipos_clase (nombre, horas_semana, idioma, pago_semestre, pago_por_dia) VALUES (?, ?, ?, ?, ?)');
  for (const fila of TARIFAS) t.run(...fila);
  return db;
}

module.exports = { crearBd };
