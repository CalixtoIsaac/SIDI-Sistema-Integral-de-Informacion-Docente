/**
 * Quincenas de pago (07 §0.1, 04 §5).
 *
 * Qnn = número de la quincena de PAGO del año:
 *   Q1 = 1–15 ene, Q2 = 16–31 ene … Q16 = 16–31 ago … Q24 = 16–31 dic.
 *   Q = (mes − 1) × 2 + (día ≤ 15 ? 1 : 2)
 * Se aplica a la FECHA DE PAGO, no a la fecha de la falta.
 *
 * Todas las fechas son texto ISO 'YYYY-MM-DD' (convención 03 §4). No se usa
 * new Date('YYYY-MM-DD') para evitar corrimientos por zona horaria.
 */

const TOTAL_QUINCENAS = 24;

const pad2 = (n) => String(n).padStart(2, '0');

/** Último día del mes (mes 1–12). */
function ultimoDiaDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Convierte a { anio, mes, dia }. Acepta 'YYYY-MM-DD', 'DD/MM/YYYY' o un Date
 * (se toman sus componentes locales). Devuelve null si no es una fecha real.
 */
function partesFecha(fecha) {
  let anio;
  let mes;
  let dia;
  if (fecha instanceof Date) {
    if (Number.isNaN(fecha.getTime())) return null;
    [anio, mes, dia] = [fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate()];
  } else if (typeof fecha === 'string') {
    const iso = fecha.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const mx = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) [anio, mes, dia] = [+iso[1], +iso[2], +iso[3]];
    else if (mx) [anio, mes, dia] = [+mx[3], +mx[2], +mx[1]];
    else return null;
  } else {
    return null;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDiaDelMes(anio, mes)) return null;
  return { anio, mes, dia };
}

/** Fecha ISO 'YYYY-MM-DD'. */
function aIso(anio, mes, dia) {
  return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}

/** Número de quincena (1–24) de una fecha. null si la fecha no es válida. */
function numeroQuincena(fecha) {
  const p = partesFecha(fecha);
  if (!p) return null;
  return (p.mes - 1) * 2 + (p.dia <= 15 ? 1 : 2);
}

function validarNumero(numero) {
  if (!Number.isInteger(numero) || numero < 1 || numero > TOTAL_QUINCENAS) {
    throw new RangeError(`Quincena fuera de rango (1–${TOTAL_QUINCENAS}): ${numero}`);
  }
}

/** Rango de días de la quincena: { inicio, fin } en ISO. */
function rangoQuincena(anio, numero) {
  validarNumero(numero);
  const mes = Math.ceil(numero / 2);
  const primera = numero % 2 === 1;
  return {
    inicio: aIso(anio, mes, primera ? 1 : 16),
    fin: aIso(anio, mes, primera ? 15 : ultimoDiaDelMes(anio, mes)),
  };
}

/**
 * Fecha de pago POR DEFECTO: día 15 o último día del mes.
 * Es editable en la BD (en Q16 2026 se pagó el 30/08 en lugar del 31/08).
 */
function fechaPagoPorDefecto(anio, numero) {
  return rangoQuincena(anio, numero).fin;
}

/** Etiqueta corta: 16 → 'Q16'. */
function etiqueta(numero) {
  validarNumero(numero);
  return `Q${numero}`;
}

/**
 * Las 24 quincenas del año para las semillas:
 * [{ anio, numero, etiqueta, fechaInicio, fechaFin, fechaPago }]
 */
function quincenasDelAnio(anio) {
  return Array.from({ length: TOTAL_QUINCENAS }, (_, i) => {
    const numero = i + 1;
    const { inicio, fin } = rangoQuincena(anio, numero);
    return { anio, numero, etiqueta: etiqueta(numero), fechaInicio: inicio, fechaFin: fin, fechaPago: fin };
  });
}

/** Quincena que contiene una fecha: { anio, numero, inicio, fin }. null si inválida. */
function quincenaDeFecha(fecha) {
  const p = partesFecha(fecha);
  if (!p) return null;
  const numero = numeroQuincena(fecha);
  return { anio: p.anio, numero, ...rangoQuincena(p.anio, numero) };
}

module.exports = {
  TOTAL_QUINCENAS,
  partesFecha,
  aIso,
  ultimoDiaDelMes,
  numeroQuincena,
  rangoQuincena,
  fechaPagoPorDefecto,
  etiqueta,
  quincenasDelAnio,
  quincenaDeFecha,
};
