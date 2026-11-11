/**
 * Nombres de docentes (07 §2).
 *
 * OPINA y el Excel de grupos traen 'Apellidos␣␣Nombres' (dos espacios separan
 * los apellidos de los nombres): 'Carbajal Sardá  Pablo de Jesús'.
 * En la BD se guardan nombres, apellido_paterno y apellido_materno.
 * Los reportes de Nacional usan 'Nombres Apellidos'.
 */

const { normalizarTexto } = require('./horario');

/** Partículas que forman parte del apellido siguiente: 'De la Cruz', 'Von Putlitz'. */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'van', 'von', 'da', 'di', 'mac', 'mc', 'san', 'santa']);

/** Quita espacios al inicio/fin y deja un solo espacio entre palabras. */
function limpiar(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

/** Junta las partículas con la palabra que sigue: ['De','la','Cruz','López'] → ['De la Cruz','López']. */
function agruparApellidos(palabras) {
  const grupos = [];
  let pendiente = [];
  for (const p of palabras) {
    pendiente.push(p);
    if (!PARTICULAS.has(p.toLowerCase())) {
      grupos.push(pendiente.join(' '));
      pendiente = [];
    }
  }
  if (pendiente.length) grupos.push(pendiente.join(' '));
  return grupos;
}

/** 'Sosa Von Putlitz' → { apellidoPaterno: 'Sosa', apellidoMaterno: 'Von Putlitz' } */
function separarApellidos(texto) {
  const grupos = agruparApellidos(limpiar(texto).split(' ').filter(Boolean));
  return {
    apellidoPaterno: grupos[0] ?? '',
    apellidoMaterno: grupos.length > 1 ? grupos.slice(1).join(' ') : null,
  };
}

/**
 * Separa un nombre en formato OPINA/Excel de grupos.
 *   'Sosa Von Putlitz  Guillermo' → { nombres: 'Guillermo', apellidoPaterno: 'Sosa', apellidoMaterno: 'Von Putlitz', seguro: true }
 * Si no vienen los dos espacios se supone 'Paterno Materno Nombres…' y se marca seguro = false.
 */
function separarFormatoOpina(texto) {
  const original = String(texto ?? '').trim();
  const partes = original.split(/\s{2,}/).map(limpiar).filter(Boolean);
  if (partes.length >= 2) {
    const nombres = partes.slice(1).join(' ');
    return { nombres, ...separarApellidos(partes[0]), seguro: true };
  }
  const palabras = limpiar(original).split(' ').filter(Boolean);
  if (palabras.length <= 1) {
    return { nombres: palabras[0] ?? '', apellidoPaterno: '', apellidoMaterno: null, seguro: false };
  }
  const apellidos = agruparApellidos(palabras);
  if (apellidos.length <= 2) {
    return { nombres: apellidos.slice(1).join(' '), apellidoPaterno: apellidos[0], apellidoMaterno: null, seguro: false };
  }
  return {
    nombres: apellidos.slice(2).join(' '),
    apellidoPaterno: apellidos[0],
    apellidoMaterno: apellidos[1],
    seguro: false,
  };
}

/** 'Nombres Paterno Materno' (formato de Nacional y de la pantalla). */
function nombreCompleto({ nombres, apellidoPaterno, apellidoMaterno }) {
  return limpiar([nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(' '));
}

/**
 * Clave para comparar nombres: sin acentos, minúsculas y palabras ordenadas
 * (04 §5: liga del CV con el docente por nombre).
 */
function claveComparacion(texto) {
  return normalizarTexto(texto).replace(/[^a-z ñ]/g, ' ').split(' ').filter(Boolean).sort().join(' ');
}

module.exports = { limpiar, separarApellidos, separarFormatoOpina, nombreCompleto, claveComparacion };
