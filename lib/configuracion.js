/**
 * Lectura de la tabla `configuracion` (clave/valor) con valores por defecto.
 */

const POR_DEFECTO = {
  'grupos.omitir_grupos': 'F61,F62',
  'opina.campus': 'Veracruz',
  'opina.solo_presencial': '1',
  'opina.muestra_minima': '10',
};

function obtener(db, clave) {
  const fila = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return fila ? fila.valor : POR_DEFECTO[clave] ?? null;
}

module.exports = { obtener, POR_DEFECTO };
