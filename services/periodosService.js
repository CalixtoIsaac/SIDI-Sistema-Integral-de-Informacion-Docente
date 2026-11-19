/**
 * Periodos en la BD. Los importadores crean el periodo si aún no existe.
 *
 *   listar(db)                    GET /periodos
 *   actualizar(db, id, body)      PUT /periodos/:id  { actual: true, fechaInicio?, fechaFin? }
 *                                 (marcar uno como actual desmarca a los demás, en una transacción)
 */
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');

/** Busca el periodo por clave o etiqueta OPINA. null si no existe. */
function buscar(db, periodo) {
  return db.prepare('SELECT * FROM periodos WHERE clave = ? OR etiqueta_opina = ?')
    .get(periodo.clave, periodo.etiquetaOpina) ?? null;
}

/** Devuelve el id del periodo; lo crea si no existe (no lo marca como actual). */
function asegurar(db, periodo) {
  const existente = buscar(db, periodo);
  if (existente) {
    if (!existente.etiqueta_opina) {
      db.prepare('UPDATE periodos SET etiqueta_opina = ? WHERE id = ?').run(periodo.etiquetaOpina, existente.id);
    }
    return existente.id;
  }
  const r = db.prepare(`INSERT INTO periodos (clave, etiqueta_opina, fecha_inicio, fecha_fin)
                        VALUES (?, ?, ?, ?)`)
    .run(periodo.clave, periodo.etiquetaOpina, periodo.fechaInicio, periodo.fechaFin);
  return Number(r.lastInsertRowid);
}

/** Periodo marcado como actual (o null). */
function actual(db) {
  return db.prepare('SELECT * FROM periodos WHERE actual = 1').get() ?? null;
}

/** Periodo actual; si ninguno está marcado, el más reciente por fecha de inicio. */
function actualOUltimo(db) {
  return actual(db)
    ?? db.prepare('SELECT * FROM periodos ORDER BY fecha_inicio DESC, id DESC LIMIT 1').get()
    ?? null;
}

/** GET /periodos: del más reciente al más antiguo, con lo que tiene cargado cada uno. */
function listar(db) {
  return db.prepare(`
    SELECT p.*,
      EXISTS (SELECT 1 FROM opina_respuestas r WHERE r.periodo_id = p.id) AS tiene_opina,
      EXISTS (SELECT 1 FROM asignaturas a WHERE a.periodo_id = p.id)      AS tiene_grupos
    FROM periodos p
    ORDER BY p.fecha_inicio DESC, p.id DESC`).all().map((p) => ({
    id: p.id, clave: p.clave, etiquetaOpina: p.etiqueta_opina, fechaInicio: p.fecha_inicio, fechaFin: p.fecha_fin,
    actual: p.actual === 1, tieneOpina: p.tiene_opina === 1, tieneGrupos: p.tiene_grupos === 1,
  }));
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function fecha(v, campo, valor) {
  if (valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !FECHA_ISO.test(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) {
    return v.error(campo, 'FECHA_INVALIDA');
  }
  return valor;
}

/** PUT /periodos/:id → { periodo }. `actual: true` lo marca como semestre actual (solo uno a la vez). */
function actualizar(db, id, body = {}) {
  const existente = db.prepare('SELECT * FROM periodos WHERE id = ?').get(Number(id));
  if (!existente) throw new HttpError(404, 'Ese semestre no existe.', 'PERIODO_NO_EXISTE');
  const v = new Validador();
  const c = {};
  if (trae(body, 'actual')) {
    if (body.actual !== true) v.error('actual', 'SOLO_TRUE'); // para cambiar de semestre se marca otro
    else c.actual = 1;
  }
  if (trae(body, 'fechaInicio')) c.fecha_inicio = fecha(v, 'fechaInicio', body.fechaInicio);
  if (trae(body, 'fechaFin')) c.fecha_fin = fecha(v, 'fechaFin', body.fechaFin);
  const inicio = c.fecha_inicio !== undefined ? c.fecha_inicio : existente.fecha_inicio;
  const fin = c.fecha_fin !== undefined ? c.fecha_fin : existente.fecha_fin;
  if (inicio && fin && fin < inicio) v.error('fechaFin', 'ANTES_DE_INICIO');
  if (!Object.keys(c).length && !v.details.length) v.error('actual', 'SIN_CAMBIOS');
  v.terminar();

  db.transaction(() => {
    if (c.actual) db.prepare('UPDATE periodos SET actual = 0 WHERE actual = 1 AND id <> ?').run(existente.id);
    const cols = Object.keys(c);
    db.prepare(`UPDATE periodos SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...c, id: existente.id });
  })();
  return listar(db).find((p) => p.id === existente.id);
}

module.exports = { buscar, asegurar, actual, actualOUltimo, listar, actualizar };
