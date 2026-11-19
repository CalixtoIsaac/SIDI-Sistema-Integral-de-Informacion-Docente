/**
 * Catálogo de departamentos (ficha del docente → Laborales; tabla `departamentos` de 001_inicial.sql).
 *
 *   listar(db)               GET    /departamentos        → [{ id, nombre, docentes }]
 *   crear(db, body)          POST   /departamentos        { nombre } → 201
 *   renombrar(db, id, body)  PUT    /departamentos/:id    { nombre }
 *   eliminar(db, id)         DELETE /departamentos/:id    → 204 · 409 si tiene docentes asignados
 */
const { HttpError } = require('../lib/errores');
const { Validador } = require('../lib/validar');

function listar(db) {
  return db.prepare(`SELECT d.id, d.nombre, (SELECT COUNT(*) FROM docentes x WHERE x.departamento_id = d.id) AS docentes
                     FROM departamentos d ORDER BY d.nombre COLLATE NOCASE`).all();
}

function obtener(db, id) {
  const d = db.prepare(`SELECT d.id, d.nombre, (SELECT COUNT(*) FROM docentes x WHERE x.departamento_id = d.id) AS docentes
                        FROM departamentos d WHERE d.id = ?`).get(Number(id));
  if (!d) throw new HttpError(404, 'Ese departamento no existe.', 'DEPARTAMENTO_NO_EXISTE');
  return d;
}

function nombreValido(body) {
  const v = new Validador();
  const nombre = v.texto('nombre', body.nombre, { obligatorio: true, max: 80 });
  v.terminar();
  return nombre;
}

function guardar(db, sql, params) {
  try {
    return db.prepare(sql).run(params);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'Ya existe un departamento con ese nombre.', 'DUPLICADO');
    throw err;
  }
}

function crear(db, body = {}) {
  const r = guardar(db, 'INSERT INTO departamentos (nombre) VALUES (?)', [nombreValido(body)]);
  return obtener(db, r.lastInsertRowid);
}

function renombrar(db, id, body = {}) {
  obtener(db, id);
  guardar(db, 'UPDATE departamentos SET nombre = ? WHERE id = ?', [nombreValido(body), Number(id)]);
  return obtener(db, id);
}

function eliminar(db, id) {
  const d = obtener(db, id);
  if (d.docentes > 0) throw new HttpError(409, `"${d.nombre}" tiene ${d.docentes} docente(s) asignado(s); cámbialos antes de borrarlo.`, 'EN_USO');
  db.prepare('DELETE FROM departamentos WHERE id = ?').run(d.id);
}

/** ¿Existe? (para validar departamentoId al guardar un docente) */
function existe(db, id) {
  return Boolean(db.prepare('SELECT 1 FROM departamentos WHERE id = ?').get(Number(id)));
}

module.exports = { listar, obtener, crear, renombrar, eliminar, existe };
