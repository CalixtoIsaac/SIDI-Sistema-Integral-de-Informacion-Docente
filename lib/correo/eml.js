/**
 * Borrador de correo en formato .eml (RFC 5322 + MIME) para abrirlo en Outlook (HU-25; 07 §10.2 modo A).
 *
 *   construir({ para, cc?, cco?, asunto, cuerpo, adjuntos: [{ nombre, contenido: Buffer, tipo? }], fecha? }) → Buffer
 *   mailto({ para, cc?, cco?, asunto, cuerpo }) → 'mailto:…'   (respaldo: mailto no admite adjuntos)
 *
 * - `X-Unsent: 1` hace que Outlook de escritorio lo abra como borrador listo para *Enviar* desde la cuenta
 *   de quien lo abre (por eso no lleva From ni contraseñas).
 * - Asunto y nombres de archivo con acentos van codificados (RFC 2047 / RFC 2231); cuerpo y adjuntos en base64.
 * - Líneas con CRLF y de máximo 76 caracteres.
 */
const crypto = require('crypto');

const CRLF = '\r\n';
const ascii = (s) => /^[\x20-\x7e]*$/.test(s);

/** Encabezado con texto no ASCII: =?UTF-8?B?…?= (en trozos para no pasar de 76 caracteres). */
function encabezadoTexto(texto) {
  if (ascii(texto)) return texto;
  const trozos = [];
  let actual = '';
  for (const ch of texto) {
    if (Buffer.byteLength(actual + ch, 'utf8') > 45) { trozos.push(actual); actual = ''; }
    actual += ch;
  }
  if (actual) trozos.push(actual);
  return trozos.map((t) => `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`).join(`${CRLF} `);
}

/** Parámetro de nombre de archivo: ASCII entre comillas o filename*=UTF-8''… */
function parametroNombre(clave, nombre) {
  if (ascii(nombre) && !/["\\]/.test(nombre)) return `${clave}="${nombre}"`;
  return `${clave}*=UTF-8''${encodeURIComponent(nombre)}`;
}

function base64EnLineas(buffer) {
  return buffer.toString('base64').replace(/.{1,76}/g, (l) => `${l}${CRLF}`);
}

const lista = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[;,]/)).map((x) => String(x).trim()).filter(Boolean);

function fechaRfc(fecha) {
  return fecha.toUTCString().replace('GMT', '+0000');
}

function construir({ para, cc, cco, asunto, cuerpo, adjuntos = [], fecha = new Date() }) {
  const limite = `----=_SIDI_${crypto.randomBytes(12).toString('hex')}`;
  const encabezados = [
    'X-Unsent: 1',
    `To: ${lista(para).join(', ')}`,
    ...(lista(cc).length ? [`Cc: ${lista(cc).join(', ')}`] : []),
    ...(lista(cco).length ? [`Bcc: ${lista(cco).join(', ')}`] : []),
    `Subject: ${encabezadoTexto(asunto)}`,
    `Date: ${fechaRfc(fecha)}`,
    'MIME-Version: 1.0',
    'X-Mailer: SIDI',
    `Content-Type: multipart/mixed; boundary="${limite}"`,
  ];
  const partes = [
    [
      `--${limite}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64EnLineas(Buffer.from(String(cuerpo ?? '').replace(/\r?\n/g, CRLF), 'utf8')),
    ].join(CRLF),
    ...adjuntos.map((a) => [
      `--${limite}`,
      `Content-Type: ${a.tipo ?? 'application/octet-stream'}; ${parametroNombre('name', a.nombre)}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${parametroNombre('filename', a.nombre)}`,
      '',
      base64EnLineas(a.contenido),
    ].join(CRLF)),
  ];
  return Buffer.from(`${encabezados.join(CRLF)}${CRLF}${CRLF}${partes.join('')}--${limite}--${CRLF}`, 'utf8');
}

/** mailto:para?cc=&bcc=&subject=&body= (los saltos de línea como %0D%0A). */
function mailto({ para, cc, cco, asunto, cuerpo }) {
  const q = [];
  if (lista(cc).length) q.push(`cc=${encodeURIComponent(lista(cc).join(','))}`);
  if (lista(cco).length) q.push(`bcc=${encodeURIComponent(lista(cco).join(','))}`);
  q.push(`subject=${encodeURIComponent(asunto ?? '')}`);
  q.push(`body=${encodeURIComponent(String(cuerpo ?? '').replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${lista(para).join(',')}?${q.join('&')}`;
}

module.exports = { construir, mailto, encabezadoTexto, lista };
