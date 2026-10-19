/**
 * Conexión a SQLite.
 *
 * SQLite guarda toda la base de datos en un solo archivo (data/app.db).
 * Se abre UNA conexión al arrancar el servidor y se reutiliza en todas las
 * peticiones (better-sqlite3 es síncrono y muy rápido para un solo usuario).
 *
 * Para agregar tablas nuevas, añade su CREATE TABLE IF NOT EXISTS en SCHEMA.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db'));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL: lecturas y escrituras simultáneas sin bloquearse.
db.pragma('journal_mode = WAL');
// En SQLite las llaves foráneas están DESACTIVADAS por defecto: hay que activarlas.
db.pragma('foreign_keys = ON');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS usuarios (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT    NOT NULL,
    usuario        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash  TEXT    NOT NULL,
    creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- Tabla de ejemplo. Úsala como modelo para las tablas de tu proyecto.
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
`;

db.exec(SCHEMA);

module.exports = db;
module.exports.DB_PATH = DB_PATH;
