/**
 * Generador de DESCUENTO-PREPA Qnn.xlsx (HU-12; 07 §3) sobre templates/DESCUENTO-PREPA.xlsx.
 *
 * Hoja 'Descuentos': encabezado en la fila 1 (se conserva tal cual), una fila por falta desde la 2
 * con los estilos de la plantilla, y SIEMPRE una fila final con =SUM(K2:Kn) solo en K (07 §3.2).
 *   A nómina sin L0 (número) · B contrato del CRN · C nombre · D días · E fecha (o texto del rango)
 *   F motivo · G horas · H cuenta de cargo · I comentario · J ticket · K monto · L vacío
 */
const x = require('./plantillaXlsx');

const PLANTILLA = 'DESCUENTO-PREPA.xlsx';
const HOJA = 'xl/worksheets/sheet1.xml';
// Estilos de las filas de datos de la plantilla (fila 2): A..K
const S = { A: 3, B: 7, C: 3, D: 3, E: 4, F: 3, G: 3, H: 5, I: 3, J: 1, K: 6 };

/**
 * filas = [{ nominaNacional, contrato, nombre, dias, fecha (ISO) | fechaTexto, motivo, horasTexto,
 *            cuentaCargo, comentario, ticket, monto }]
 * @returns {Promise<Buffer>}
 */
async function generar(filas) {
  const zip = await x.abrir(PLANTILLA);
  const hoja = await zip.file(HOJA).async('string');
  const encabezado = hoja.match(/<row r="1"[\s\S]*?<\/row>/)[0];
  const datos = filas.map((f, i) => x.fila(i + 2, [
    x.numeroOTexto(f.nominaNacional, S.A),
    x.numeroOTexto(f.contrato, S.B),
    { t: 's', v: f.nombre, s: S.C },
    { t: 'n', v: f.dias ?? 1, s: S.D },
    f.fecha ? { t: 'd', v: x.serial(f.fecha), s: S.E } : { t: 's', v: f.fechaTexto ?? '', s: S.E },
    { t: 's', v: f.motivo, s: S.F },
    { t: 's', v: f.horasTexto, s: S.G },
    x.numeroOTexto(f.cuentaCargo, S.H),
    { t: 's', v: f.comentario, s: S.I },
    f.ticket ? { t: 's', v: f.ticket, s: S.J } : { t: 'vacia', s: S.J },
    { t: 'n', v: f.monto, s: S.K },
  ], ' spans="1:12" ht="14.25" x14ac:dyDescent="0.2"'));
  const filaTotal = filas.length + 2;
  const total = x.fila(filaTotal, [null, null, null, null, null, null, null, null, null, null,
    { t: 'f', v: filas.length ? `SUM(K2:K${filaTotal - 1})` : '0', s: S.K, cache: Math.round(filas.reduce((t, f) => t + Number(f.monto || 0), 0) * 100) / 100 }], ' spans="1:12" ht="14.25" x14ac:dyDescent="0.2"');
  const nueva = hoja
    .replace(/<sheetData>[\s\S]*<\/sheetData>/, `<sheetData>${encabezado}${datos.join('')}${total}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:L${filaTotal}"/>`)
    .replace(/<selection [^>]*\/>/, '<selection activeCell="A2" sqref="A2"/>');
  zip.file(HOJA, nueva);
  await x.recalcularAlAbrir(zip);
  return x.guardar(zip);
}

module.exports = { generar, PLANTILLA };
