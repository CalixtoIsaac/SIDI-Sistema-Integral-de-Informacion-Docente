/**
 * Consultas del Panel (HU-15): docentes por género y por nivel de estudios.
 *
 * - Por defecto solo activos; { activo: false } = inactivos, { activo: null } = todos.
 * - Devuelven todas las categorías aunque sean 0 (M, F y los niveles del catálogo).
 * - 'ninguno' = sin dato (igual que el filtro de /docentes).
 * - Nivel de estudios = el más alto titulado (v_docente_estudios).
 */

/** Condición SQL y parámetros según { activo }. */
function filtroActivo(activo) {
  if (activo === null) return { where: '', params: [] };
  return { where: 'WHERE d.activo = ?', params: [activo === false ? 0 : 1] };
}

function docentesPorGenero(db, { activo = true } = {}) {
  const { where, params } = filtroActivo(activo);
  const conteos = new Map(
    db.prepare(`
      SELECT COALESCE(d.genero, 'ninguno') AS genero, COUNT(*) AS docentes
      FROM docentes d
      ${where}
      GROUP BY COALESCE(d.genero, 'ninguno')
    `).all(...params).map((f) => [f.genero, f.docentes])
  );
  const filas = ['M', 'F'].map((genero) => ({ genero, docentes: conteos.get(genero) ?? 0 }));
  if (conteos.get('ninguno')) filas.push({ genero: 'ninguno', docentes: conteos.get('ninguno') });
  return filas;
}

function docentesPorNivelEstudios(db, { activo = true } = {}) {
  const { where, params } = filtroActivo(activo);
  const conteos = new Map(
    db.prepare(`
      SELECT COALESCE(e.nivel_estudios, 'ninguno') AS nivel, COUNT(*) AS docentes
      FROM docentes d
      JOIN v_docente_estudios e ON e.docente_id = d.id
      ${where}
      GROUP BY COALESCE(e.nivel_estudios, 'ninguno')
    `).all(...params).map((f) => [f.nivel, f.docentes])
  );
  const catalogo = db.prepare(`
    SELECT valor, orden FROM catalogos
    WHERE tipo = 'nivel_estudios' AND activo = 1
    ORDER BY orden, valor
  `).all();

  const filas = catalogo.map((c) => ({ nivelEstudios: c.valor, orden: c.orden, docentes: conteos.get(c.valor) ?? 0 }));
  // Un nivel que ya no está activo en el catálogo pero alguien lo tiene titulado: se muestra igual
  for (const [nivel, docentes] of conteos) {
    if (nivel !== 'ninguno' && !catalogo.some((c) => c.valor === nivel)) {
      filas.push({ nivelEstudios: nivel, orden: null, docentes });
    }
  }
  if (conteos.get('ninguno')) filas.push({ nivelEstudios: 'ninguno', orden: null, docentes: conteos.get('ninguno') });
  return filas;
}

module.exports = { docentesPorGenero, docentesPorNivelEstudios };
