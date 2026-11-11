/**
 * Lector del reporte de contratos por CRN (07 §7.3).
 * Acepta la plantilla de SIDI (hoja 'Contratos') o un archivo propio con columnas CRN y
 * Contrato en cualquier orden (alias: 'No. de contrato', '# Contrato'…); la nómina es opcional.
 * No toca la BD.
 */
const nominaLib = require('../../nomina');
const { ArchivoNoReconocido, abrirLibro, buscarHoja, filasDeHoja, mapearColumnas, texto, crn } = require('./comun');

const COLUMNAS = {
  crn: ['CRN'],
  contrato: ['Contrato', 'No. de contrato', 'No de contrato', '# Contrato', 'Número de contrato', 'Numero de contrato', 'Num contrato', 'Núm. contrato'],
  nomina: ['Nómina', 'Nomina', 'Nómina profesor'],
  materia: ['Materia', 'Nombre largo materia'],
};

/** Busca la tabla: hoja 'Contratos' primero; si no, la primera hoja con CRN y Contrato (encabezados en las 10 primeras filas). */
function ubicarTabla(libro) {
  const preferida = buscarHoja(libro, 'Contratos');
  const hojas = preferida ? [preferida, ...libro.SheetNames.map((n) => libro.Sheets[n])] : libro.SheetNames.map((n) => libro.Sheets[n]);
  for (const hoja of hojas) {
    const filas = filasDeHoja(hoja);
    for (let i = 0; i < Math.min(filas.length, 10); i++) {
      const idx = mapearColumnas(filas[i] ?? [], COLUMNAS);
      if (idx.crn !== undefined && idx.contrato !== undefined) return { idx, datos: filas.slice(i + 1), filaEncabezado: i + 1 };
    }
  }
  return null;
}

/** Contrato como texto de dígitos. Números de Excel (5568351) se convierten sin decimales. */
function contrato(valor) {
  if (valor === null || valor === undefined) return { valor: null };
  if (typeof valor === 'number') return Number.isInteger(valor) ? { valor: String(valor) } : { valor: null, invalido: String(valor) };
  const t = String(valor).trim();
  if (t === '') return { valor: null };
  return /^\d+$/.test(t) ? { valor: t } : { valor: null, invalido: t };
}

/** { filas: [{ fila, crn, contrato, contratoInvalido, nomina, materia }], conNomina, total } */
function leer(buffer) {
  const tabla = ubicarTabla(abrirLibro(buffer));
  if (!tabla) throw new ArchivoNoReconocido('No se encontraron las columnas "CRN" y "Contrato".');
  const filas = [];
  tabla.datos.forEach((v, i) => {
    const valorCrn = crn(v[tabla.idx.crn]);
    const c = contrato(v[tabla.idx.contrato]);
    const nominaTexto = tabla.idx.nomina === undefined ? null : texto(v[tabla.idx.nomina]);
    if (!valorCrn && !c.valor && !c.invalido) return; // fila vacía o de actividad sin CRN
    filas.push({
      fila: tabla.filaEncabezado + i + 1,
      crn: valorCrn,
      crnTexto: texto(v[tabla.idx.crn]),
      contrato: c.valor,
      contratoInvalido: c.invalido ?? null,
      nomina: nominaTexto ? nominaLib.normalizar(nominaTexto) : null,
      materia: tabla.idx.materia === undefined ? null : texto(v[tabla.idx.materia]),
    });
  });
  return { filas, conNomina: tabla.idx.nomina !== undefined, total: tabla.datos.length };
}

module.exports = { leer, COLUMNAS };
