/**
 * Generador de INCIDENCIAS PREPA Qnn.xlsx (HU-13; 07 §4) sobre templates/INCIDENCIAS-PREPA.xlsx.
 *
 * Hoja 'Incidencia' (sheet1): A1 y encabezados (fila 2) intactos, fila 3 vacía, datos desde la 4.
 *   `Tabla17` se redimensiona a A2:N{última} y M lleva la fórmula estructurada del importe por periodo.
 * Hoja 'detalle' (sheet2): una fila por docente que faltó en la quincena, CON VALORES (07 §4.3):
 *   C descontado (0 en IMSS) · D =Incidencia!K… de sus suplencias · E =C−D · F situación · G estatus,
 *   y la fila 'Total' con SUM de C y D y =C−D.
 * La plantilla ya no tiene vínculos externos; se marca fullCalcOnLoad.
 */
const x = require('./plantillaXlsx');

const PLANTILLA = 'INCIDENCIAS-PREPA.xlsx';
const HOJA_INC = 'xl/worksheets/sheet1.xml';
const HOJA_DET = 'xl/worksheets/sheet2.xml';
const TABLA = 'xl/tables/table1.xml';
const PRIMERA = 4; // primera fila de datos
// Estilos de las filas de datos de la plantilla
const S = { A: 29, B: 30, C: 29, D: 40, E: 47, F: 48, G: 31, H: 32, I: 49, J: 49, K: 50, L: 51, M: 52, N: 37 };
const SD = { A: 4, B: 5, C: 55, D: 9, E: 10, F: 11, G: 12 };
const FORMULA_M = 'Tabla17[[#This Row],[Importe Total]]/Tabla17[[#This Row],[No. de periodos a repartir el pago]]';
const ATRS = ' spans="1:14" s="15" customFormat="1" x14ac:dyDescent="0.25"';

const redondear = (n) => Math.round(Number(n) * 100) / 100;

/** Fila 3: vacía con los estilos de la plantilla (sin la fórmula, para no mostrar #¡DIV/0!). */
function filaVacia() {
  return x.fila(3, Object.values(S).map((s) => ({ t: 'vacia', s })), ATRS);
}

function filaIncidencia(i, numero) {
  return x.fila(numero, [
    x.numeroOTexto(i.nominaNacional, S.A),
    x.numeroOTexto(i.numContrato, S.B),
    { t: 's', v: i.nombre, s: S.C },
    { t: 's', v: i.tipoContrato ?? 'determinado', s: S.D },
    { t: 's', v: i.ccNomina, s: S.E },
    { t: 's', v: i.motivo, s: S.F },
    { t: 's', v: i.detalle, s: S.G },
    x.numeroOTexto(i.ceco, S.H),
    i.elementoPep ? { t: 's', v: i.elementoPep, s: S.I } : { t: 'vacia', s: S.I },
    i.ordenInterna ? { t: 's', v: i.ordenInterna, s: S.J } : { t: 'vacia', s: S.J },
    { t: 'n', v: i.importeTotal, s: S.K },
    { t: 'n', v: i.numPeriodos, s: S.L },
    { t: 'f', v: FORMULA_M, s: S.M, cache: redondear(i.importeTotal / i.numPeriodos) },
    i.aPartirDe ? { t: 'd', v: x.serial(i.aPartirDe), s: S.N } : { t: 'vacia', s: S.N },
  ], ATRS);
}

async function hojaIncidencia(zip, incidencias) {
  const hoja = await zip.file(HOJA_INC).async('string');
  const fijas = hoja.match(/<row r="1"[\s\S]*?<\/row><row r="2"[\s\S]*?<\/row>/)[0];
  const ultima = incidencias.length ? PRIMERA + incidencias.length - 1 : 3;
  const filas = incidencias.map((i, n) => filaIncidencia(i, PRIMERA + n)).join('');
  zip.file(HOJA_INC, hoja
    .replace(/<sheetData>[\s\S]*<\/sheetData>/, `<sheetData>${fijas}${filaVacia()}${filas}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:N${ultima}"/>`)
    .replace(/<selection [^>]*\/>/, '<selection activeCell="A4" sqref="A4"/>')
    .replace(/<conditionalFormatting sqref="D4:D\d+">/, `<conditionalFormatting sqref="D4:D${Math.max(ultima, 4)}">`));
  const tabla = await zip.file(TABLA).async('string');
  zip.file(TABLA, tabla.replace(/ ref="A2:N\d+"/, ` ref="A2:N${ultima}"`));
  return ultima;
}

/** filas de detalle: [{ nominaNacional, nombre, descontado, filasSuplencias: [nº de fila en Incidencia], pagado, situacion, estatus }] */
async function hojaDetalle(zip, detalle) {
  const hoja = await zip.file(HOJA_DET).async('string');
  const encabezado = hoja.match(/<row r="1"[\s\S]*?<\/row>/)[0];
  const atrs = ' spans="1:7" ht="40.5" x14ac:dyDescent="0.25"';
  const filas = detalle.map((d, n) => {
    const r = n + 2;
    const pagado = d.filasSuplencias.length
      ? { t: 'f', v: d.filasSuplencias.map((f) => `Incidencia!K${f}`).join('+'), s: SD.D, cache: d.pagado }
      : { t: 'n', v: 0, s: SD.D };
    return x.fila(r, [
      x.numeroOTexto(d.nominaNacional, SD.A),
      { t: 's', v: d.nombre, s: SD.B },
      { t: 'n', v: d.descontado, s: SD.C },
      pagado,
      { t: 'f', v: `C${r}-D${r}`, s: SD.E, cache: redondear(d.descontado - d.pagado) },
      { t: 's', v: d.situacion ?? '', s: SD.F },
      { t: 's', v: d.estatus ?? '', s: SD.G },
    ], atrs);
  });
  const t = detalle.length + 2;
  const sumC = redondear(detalle.reduce((s, d) => s + d.descontado, 0));
  const sumD = redondear(detalle.reduce((s, d) => s + d.pagado, 0));
  const total = x.fila(t, [
    { t: 'vacia', s: SD.A },
    { t: 's', v: 'Total', s: SD.B },
    { t: 'f', v: detalle.length ? `SUM(C2:C${t - 1})` : '0', s: SD.C, cache: sumC },
    { t: 'f', v: detalle.length ? `SUM(D2:D${t - 1})` : '0', s: SD.D, cache: sumD },
    { t: 'f', v: `C${t}-D${t}`, s: SD.E, cache: redondear(sumC - sumD) },
  ], atrs);
  zip.file(HOJA_DET, hoja
    .replace(/<sheetData>[\s\S]*<\/sheetData>/, `<sheetData>${encabezado}${filas.join('')}${total}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:G${t}"/>`));
}

/**
 * @param {object[]} incidencias  en orden: { nominaNacional, numContrato, nombre, tipoContrato, ccNomina, motivo, detalle,
 *                                ceco, elementoPep, ordenInterna, importeTotal, numPeriodos, aPartirDe, id }
 * @param {object[]} detalle      por docente: { nominaNacional, nombre, descontado, incidenciaIds: [], situacion, estatus }
 * @returns {Promise<Buffer>}
 */
async function generar(incidencias, detalle) {
  const zip = await x.abrir(PLANTILLA);
  await hojaIncidencia(zip, incidencias);
  const filaDe = new Map(incidencias.map((i, n) => [i.id, PRIMERA + n]));
  const importeDe = new Map(incidencias.map((i) => [i.id, i.importeTotal]));
  await hojaDetalle(zip, detalle.map((d) => {
    const ids = d.incidenciaIds.filter((id) => filaDe.has(id));
    return { ...d, filasSuplencias: ids.map((id) => filaDe.get(id)), pagado: redondear(ids.reduce((s, id) => s + importeDe.get(id), 0)) };
  }));
  await x.recalcularAlAbrir(zip);
  return x.guardar(zip);
}

module.exports = { generar, PLANTILLA, PRIMERA };
