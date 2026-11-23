/**
 * CURP del docente (04 §5).
 *
 *   fecha_nacimiento = CURP[5..10] como AAMMDD; siglo: CURP[17] dígito → 19xx, letra → 20xx
 *   genero           = CURP[11]: 'H' → 'M', 'M' → 'F'   ('X' = no binario → null)
 *   edad             = años completos entre fecha_nacimiento y hoy
 *
 * Estructura (18 caracteres):
 *   AAAA  4 letras (apellidos y nombre)
 *   AAMMDD fecha de nacimiento
 *   S     sexo H / M / X
 *   EE    entidad federativa (o NE = nacido en el extranjero)
 *   CCC   consonantes internas
 *   D     diferenciador de siglo (0–9 → 1900s, A–Z → 2000s)
 *   V     dígito verificador
 */

const { aIso, partesFecha } = require('./quincena');

const ENTIDADES = new Set([
  'AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG', 'GT', 'GR', 'HG', 'JC', 'MC', 'MN',
  'MS', 'NT', 'NL', 'OC', 'PL', 'QT', 'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS', 'NE',
]);

const PATRON = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;
const DICCIONARIO = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

/** Mayúsculas, sin espacios. Acepta null. */
function limpiar(curp) {
  return curp === null || curp === undefined ? '' : String(curp).toUpperCase().replace(/\s+/g, '');
}

/** Dígito verificador esperado para los primeros 17 caracteres. */
function digitoVerificador(curp17) {
  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const valor = DICCIONARIO.indexOf(curp17[i]);
    if (valor < 0) return null;
    suma += valor * (18 - i);
  }
  return (10 - (suma % 10)) % 10;
}

/**
 * Fecha de nacimiento ISO a partir de la CURP. null si no es una fecha real.
 * El siglo lo da el carácter 17: dígito → 1900s, letra → 2000s.
 */
function fechaNacimiento(curp) {
  const c = limpiar(curp);
  if (c.length < 17) return null;
  const aa = c.slice(4, 6);
  const mm = c.slice(6, 8);
  const dd = c.slice(8, 10);
  if (!/^\d{6}$/.test(aa + mm + dd)) return null;
  const siglo = /\d/.test(c[16]) ? 1900 : 2000;
  const anio = siglo + Number(aa);
  const p = partesFecha(`${anio}-${mm}-${dd}`);
  return p ? aIso(p.anio, p.mes, p.dia) : null;
}

/** Género en la BD: 'M' (hombre), 'F' (mujer) o null. */
function genero(curp) {
  const s = limpiar(curp)[10];
  if (s === 'H') return 'M';
  if (s === 'M') return 'F';
  return null;
}

/**
 * Valida la CURP. Devuelve { valida, curp, errores[] }.
 * Un dígito verificador incorrecto se reporta como error ('DIGITO_VERIFICADOR')
 * porque casi siempre es un error de captura; la pantalla decide si lo permite.
 */
function validar(curp) {
  const c = limpiar(curp);
  const errores = [];
  if (c.length !== 18) {
    errores.push('LONGITUD');
  } else if (!PATRON.test(c)) {
    errores.push('FORMATO');
  } else {
    if (!ENTIDADES.has(c.slice(11, 13))) errores.push('ENTIDAD');
    if (!fechaNacimiento(c)) errores.push('FECHA');
    if (digitoVerificador(c.slice(0, 17)) !== Number(c[17])) errores.push('DIGITO_VERIFICADOR');
  }
  return { valida: errores.length === 0, curp: c, errores };
}

/**
 * Años cumplidos entre una fecha de nacimiento ISO y `hoy` (ISO o Date; por
 * defecto, la fecha actual). null si alguna fecha es inválida.
 */
function edad(fechaNac, hoy = new Date()) {
  const n = partesFecha(fechaNac);
  const h = partesFecha(hoy);
  if (!n || !h) return null;
  let anios = h.anio - n.anio;
  if (h.mes < n.mes || (h.mes === n.mes && h.dia < n.dia)) anios -= 1;
  return anios < 0 ? null : anios;
}

/**
 * Todo lo que se deriva de la CURP en una llamada:
 * { valida, curp, errores, fechaNacimiento, genero, edad }
 */
function derivar(curp, hoy = new Date()) {
  const resultado = validar(curp);
  const fecha = fechaNacimiento(resultado.curp);
  return { ...resultado, fechaNacimiento: fecha, genero: genero(resultado.curp), edad: fecha ? edad(fecha, hoy) : null };
}

module.exports = { limpiar, validar, digitoVerificador, fechaNacimiento, genero, edad, derivar };
