/**
 * Búsqueda, filtros y orden de la tabla de docentes (06: GET /docentes).
 * Se aplican sobre las filas ya calculadas por docentesService (≈50 docentes: en memoria es inmediato).
 *
 *   search          nombre (sin acentos, cualquier orden de palabras), CURP, nómina con o sin L0, CRN   (HU-07)
 *   activo, recontratable                                                                              (HU-05, HU-21)
 */
const nominaLib = require('../lib/nomina');
const { normalizarTexto } = require('../lib/horario');
const { filtrarBasico } = require('./docentesService');

/** true si la fila coincide con el texto buscado. */
function coincide(fila, busqueda) {
  const q = normalizarTexto(busqueda);
  if (!q) return true;
  const palabras = q.split(' ');
  const nombre = normalizarTexto(fila.nombre);
  if (palabras.every((p) => nombre.includes(p))) return true;
  const compacto = q.replace(/\s/g, '').toUpperCase();
  if (fila.curp && fila.curp.includes(compacto)) return true;
  if (/^L?\d+$/.test(compacto)) {
    const digitos = compacto.replace(/^L/, '');
    if (fila.nomina.slice(1).replace(/^0+/, '').startsWith(digitos.replace(/^0+/, '')) && digitos.replace(/^0+/, '')) return true;
    if (nominaLib.normalizar(compacto) === fila.nomina) return true;
    if (fila.grupos.some((g) => g.crn && g.crn.startsWith(digitos))) return true;
  }
  return false;
}

/** Filtro completo para docentesService.listar. */
function filtrar(filas, query = {}) {
  const base = filtrarBasico(filas, query);
  const busqueda = String(query.search ?? '').trim();
  return busqueda ? base.filter((f) => coincide(f, busqueda)) : base;
}

module.exports = { filtrar, coincide };
