/**
 * Periodos en la BD. Los importadores crean el periodo si aún no existe.
 */

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

module.exports = { buscar, asegurar, actual, actualOUltimo, listar };
