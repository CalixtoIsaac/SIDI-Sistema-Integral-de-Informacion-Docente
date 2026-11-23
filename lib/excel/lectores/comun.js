/**
 * Utilidades compartidas por los lectores de Excel (SheetJS).
 * Los lectores NO tocan la BD: reciben un Buffer y devuelven datos limpios.
 */
const XLSX = require('xlsx');
const { normalizarTexto } = require('../../horario');

/** Error de archivo no reconocido → la ruta responde 422. */
class ArchivoNoReconocido extends Error {
  constructor(mensaje, details = []) {
    super(mensaje);
    this.name = 'ArchivoNoReconocido';
    this.status = 422;
    this.code = 'ARCHIVO_NO_RECONOCIDO';
    this.details = details;
  }
}

/** Abre un .xlsx/.xlsb/.xls desde un Buffer. */
function abrirLibro(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ArchivoNoReconocido('El archivo está vacío.');
  }
  try {
    return XLSX.read(buffer, { type: 'buffer', cellDates: false, dense: true });
  } catch {
    throw new ArchivoNoReconocido('No se pudo abrir el archivo. ¿Es un Excel (.xlsx o .xlsb)?');
  }
}

/** Busca una hoja por nombre sin importar mayúsculas ni espacios. */
function buscarHoja(libro, nombre) {
  const objetivo = normalizarTexto(nombre);
  const encontrado = libro.SheetNames.find((n) => normalizarTexto(n) === objetivo);
  return encontrado ? libro.Sheets[encontrado] : null;
}

/** Filas como arreglos (fila 0 = encabezados). Celdas vacías = null. */
function filasDeHoja(hoja) {
  return XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, raw: true, blankrows: false });
}

/** Normaliza un encabezado para compararlo con los alias. */
function claveEncabezado(texto) {
  return normalizarTexto(texto).replace(/[¿?¡!:.,]/g, '').trim();
}

/**
 * Ubica las columnas por alias. `mapa` = { campo: ['alias 1', 'alias 2'] }.
 * Cada alias puede ser texto exacto (tras normalizar) o una RegExp sobre el encabezado normalizado.
 * Devuelve { campo: índice } solo para los campos encontrados.
 */
function mapearColumnas(encabezados, mapa) {
  const claves = encabezados.map(claveEncabezado);
  const indices = {};
  for (const [campo, aliases] of Object.entries(mapa)) {
    for (const alias of aliases) {
      const idx = alias instanceof RegExp
        ? claves.findIndex((c) => alias.test(c))
        : claves.indexOf(claveEncabezado(alias));
      if (idx >= 0) {
        indices[campo] = idx;
        break;
      }
    }
  }
  return indices;
}

/** Valor de texto limpio de una celda (null si está vacía). */
function texto(valor) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

/** Valor de texto sin colapsar espacios internos (para nombres 'Apellidos␣␣Nombres'). */
function textoCrudo(valor) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t === '' ? null : t;
}

/** CRN como texto, sin decimales de Excel (16022 → '16022'). */
function crn(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isInteger(valor) ? String(valor) : null;
  const t = String(valor).trim();
  return /^\d+$/.test(t) ? t : null;
}

module.exports = {
  XLSX,
  ArchivoNoReconocido,
  abrirLibro,
  buscarHoja,
  filasDeHoja,
  claveEncabezado,
  mapearColumnas,
  texto,
  textoCrudo,
  crn,
};
