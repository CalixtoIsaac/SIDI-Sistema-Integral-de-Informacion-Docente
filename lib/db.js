/**
 * Conexión a SQLite (una sola, reutilizada en todas las peticiones).
 *
 * Esquema: lib/migraciones/001_inicial.sql si ya existe (HU-00, Uziel); mientras tanto
 * se usa el DDL de context/04_Modelo_Datos.md §4, igual que tests/helpers/bd.js.
 * Todo el DDL usa IF NOT EXISTS, así que aplicarlo en cada arranque es seguro.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { sembrar } = require('./semillas');

const RAIZ = path.join(__dirname, '..');
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(RAIZ, 'data', 'app.db'));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function ddl() {
  const migracion = path.join(__dirname, 'migraciones', '001_inicial.sql');
  if (fs.existsSync(migracion)) return fs.readFileSync(migracion, 'utf8');
  const doc = fs.readFileSync(path.join(RAIZ, 'context', '04_Modelo_Datos.md'), 'utf8');
  const seccion = doc.slice(doc.indexOf('## 4. DDL'));
  const m = seccion.match(/```sql\r?\n([\s\S]*?)```/);
  if (!m) throw new Error('No se encontró el DDL en context/04_Modelo_Datos.md §4');
  return m[1];
}

const db = new Database(DB_PATH);

// WAL: lecturas y escrituras simultáneas sin bloquearse.
db.pragma('journal_mode = WAL');
// En SQLite las llaves foráneas están DESACTIVADAS por defecto: hay que activarlas.
db.pragma('foreign_keys = ON');

db.exec(ddl());
sembrar(db);

module.exports = db;
module.exports.DB_PATH = DB_PATH;
