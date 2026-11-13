/**
 * Conexión a SQLite + migraciones.
 *
 * SQLite guarda toda la base de datos en un solo archivo (data/app.db).
 * Se abre UNA conexión al arrancar el servidor y se reutiliza en todas las
 * peticiones (better-sqlite3 es síncrono y muy rápido para un solo usuario).
 *
 * El esquema vive en lib/migraciones/NNN_nombre.sql. Al arrancar se aplican, en
 * orden, las que falten (se anotan en la tabla schema_migrations) y después se
 * cargan las semillas (lib/semillas.js, idempotentes).
 *
 * Para cambiar el esquema: crea una migración NUEVA (003_…, 004_…). Nunca
 * edites una que ya se aplicó: las bases locales no la volverían a correr.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { sembrar } = require('./semillas');

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db'));
const MIGRACIONES_DIR = path.join(__dirname, 'migraciones');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL: lecturas y escrituras simultáneas sin bloquearse.
db.pragma('journal_mode = WAL');
// En SQLite las llaves foráneas están DESACTIVADAS por defecto: hay que activarlas.
db.pragma('foreign_keys = ON');

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción
 * (si una falla, no queda a medias y no se anota como aplicada).
 * @returns {string[]} nombres de las migraciones aplicadas en esta llamada
 */
function migrar(conexion = db, dir = MIGRACIONES_DIR) {
  conexion.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre TEXT PRIMARY KEY,
    aplicada_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`);

  const aplicadas = new Set(conexion.prepare('SELECT nombre FROM schema_migrations').pluck().all());
  const registrar = conexion.prepare('INSERT INTO schema_migrations (nombre) VALUES (?)');
  const archivos = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const nuevas = [];

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
    try {
      conexion.transaction(() => {
        conexion.exec(sql);
        registrar.run(archivo);
      })();
    } catch (err) {
      err.message = `Migración ${archivo} falló: ${err.message}`;
      throw err;
    }
    nuevas.push(archivo);
  }
  return nuevas;
}

migrar();
sembrar(db);

// TEMPORAL (hasta limpiar la plantilla, HU-00): lib/auth.js y routes/notas.js de la
// plantilla todavía usan estas tablas al arrancar. No son parte del modelo de SIDI
// (04 §4); al quitar el login y Notas se borra este bloque.
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT    NOT NULL,
    usuario        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash  TEXT    NOT NULL,
    creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS notas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo          TEXT    NOT NULL,
    contenido       TEXT    NOT NULL DEFAULT '',
    estado          TEXT    NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_progreso', 'terminada')),
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_notas_usuario ON notas (usuario_id);
`);

module.exports = db;
module.exports.DB_PATH = DB_PATH;
module.exports.migrar = migrar;
module.exports.MIGRACIONES_DIR = MIGRACIONES_DIR;
