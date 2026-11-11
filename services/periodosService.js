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

module.exports = { buscar, asegurar, actual };
