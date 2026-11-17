/**
 * Utilidades para llenar las plantillas de Nacional editando su XML con JSZip (03 §1, 07 §4.3):
 * se conservan fuentes, anchos, estilos, tablas y fórmulas; solo se escriben celdas.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEMPLATES = path.join(__dirname, '..', '..', '..', 'templates');

/** Abre una plantilla de templates/ y devuelve el zip. */
async function abrir(nombre) {
  return JSZip.loadAsync(fs.readFileSync(path.join(TEMPLATES, nombre)));
}

/** Escapa texto para XML. */
function xml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Letra de columna → 'A'..'Z' (las plantillas no pasan de N). */
const COL = (i) => String.fromCharCode(65 + i);

/** Celdas: { t: 's'|'n'|'f'|'d'|'vacia', v, s, cache } — en fórmulas, `cache` es el valor ya calculado. */
function celda(ref, c) {
  const estilo = c.s !== undefined ? ` s="${c.s}"` : '';
  if (c.t === 'vacia' || c.v === null || c.v === undefined || c.v === '') {
    if (c.t === 'f' && c.v) return `<c r="${ref}"${estilo}><f>${xml(c.v)}</f></c>`;
    return `<c r="${ref}"${estilo}/>`;
  }
  if (c.t === 'n' || c.t === 'd') return `<c r="${ref}"${estilo}><v>${Number(c.v)}</v></c>`;
  if (c.t === 'f') {
    const valor = c.cache === undefined || c.cache === null ? '' : `<v>${Number(c.cache)}</v>`;
    return `<c r="${ref}"${estilo}><f>${xml(c.v)}</f>${valor}</c>`;
  }
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
}

/** Una fila <row> con las celdas dadas en orden desde la columna A. */
function fila(numero, celdas, atributos = '') {
  const cs = celdas.map((c, i) => (c ? celda(`${COL(i)}${numero}`, c) : '')).join('');
  return `<row r="${numero}"${atributos}>${cs}</row>`;
}

/** Fecha ISO → número de serie de Excel (días desde 1899-12-30). */
function serial(fechaIso) {
  const [a, m, d] = fechaIso.split('-').map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** Número si son solo dígitos (para nómina, contrato, cuenta); si no, texto. */
function numeroOTexto(valor, s) {
  if (valor === null || valor === undefined || valor === '') return { t: 'vacia', s };
  const t = String(valor);
  return /^\d{1,15}$/.test(t) ? { t: 'n', v: Number(t), s } : { t: 's', v: t, s };
}

/** Marca el libro para recalcular al abrir y quita calcChain (si existe). */
async function recalcularAlAbrir(zip) {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const nuevo = /<calcPr[^>]*fullCalcOnLoad/.test(wb) ? wb : wb.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>');
  zip.file('xl/workbook.xml', nuevo);
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const ct = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
  }
}

async function guardar(zip) {
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { abrir, xml, celda, fila, serial, numeroOTexto, recalcularAlAbrir, guardar, COL, TEMPLATES };
