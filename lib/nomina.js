/**
 * Nómina del docente (07 §1, 04 §5).
 *
 * La misma persona aparece con la nómina escrita de 3 formas:
 *   OPINA / Excel de grupos  → 'L03560330'  (L + 8 dígitos)
 *   Descuentos               → 3560330      (sin "L0")
 *   Incidencias              → 19011        (sin L ni ceros a la izquierda)
 *
 * En la BD siempre se guarda la forma CANÓNICA: 'L' + dígitos rellenados a 8.
 */

const LONGITUD = 8;

/** Deja solo los dígitos de un valor (número o texto). '' si no hay. */
function soloDigitos(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\D/g, '');
}

/**
 * Normaliza cualquier forma de nómina a la canónica.
 *   normalizar(19011)        → 'L00019011'
 *   normalizar('3560330')    → 'L03560330'
 *   normalizar(' l03560330') → 'L03560330'
 * Devuelve null si no hay dígitos, si son más de 8 o si todos son cero.
 */
function normalizar(valor) {
  if (typeof valor === 'number' && !Number.isInteger(valor)) return null;
  const digitos = soloDigitos(valor);
  if (!digitos || digitos.length > LONGITUD) return null;
  if (/^0+$/.test(digitos)) return null;
  return 'L' + digitos.padStart(LONGITUD, '0');
}

/** true si el valor ya está en forma canónica ('L' + 8 dígitos). */
function esCanonica(valor) {
  return typeof valor === 'string' && /^L\d{8}$/.test(valor) && !/^L0{8}$/.test(valor);
}

/**
 * Forma que piden los reportes de Nacional (Descuentos e Incidencias):
 * número entero sin 'L' y sin ceros a la izquierda.
 *   aNacional('L00019011') → 19011
 * Devuelve null si la nómina no es válida.
 */
function aNacional(valor) {
  const canonica = normalizar(valor);
  return canonica ? parseInt(canonica.slice(1), 10) : null;
}

/** true si dos valores representan la misma nómina (en cualquier forma). */
function sonIguales(a, b) {
  const na = normalizar(a);
  return na !== null && na === normalizar(b);
}

module.exports = { LONGITUD, normalizar, esCanonica, aNacional, sonIguales };
