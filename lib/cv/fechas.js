/**
 * Fechas escritas a mano en los CV (07 §7.1): 'dd/mm/aaaa', 'dd/mm/aa', 'dd-mm-aaaa',
 * '12 de marzo de 1990', 'Marzo 12, 1990', '12 MZO 1990', '1990-03-12'.
 * Devuelve ISO 'YYYY-MM-DD' o null.
 */
const { normalizarTexto } = require('../horario');
const { partesFecha, aIso } = require('../quincena');

const MESES = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, mzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, set: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
  jan: 1, january: 1, february: 2, march: 3, apr: 4, april: 4, june: 6, july: 7, aug: 8, august: 8,
  september: 9, october: 10, november: 11, dec: 12, december: 12,
};

/** Año de 2 dígitos: ≤ (año actual − 2000) → 2000s, si no 1900s. */
function anioCompleto(a, hoy = new Date()) {
  const n = Number(a);
  if (String(a).length === 4) return n;
  return n <= hoy.getFullYear() - 2000 ? 2000 + n : 1900 + n;
}

function valida(anio, mes, dia) {
  const p = partesFecha(aIso(anio, mes, dia));
  return p ? aIso(p.anio, p.mes, p.dia) : null;
}

function mesDeTexto(palabra) {
  const t = normalizarTexto(palabra).replace(/\./g, '');
  return MESES[t] ?? null;
}

function interpretar(texto, hoy = new Date()) {
  if (!texto) return null;
  const t = normalizarTexto(texto).replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) return valida(anioCompleto(m[3], hoy), +m[2], +m[1]);
  m = t.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+\.?)\s+(?:de\s+|del\s+)?(\d{4})\b/);
  if (m && mesDeTexto(m[2])) return valida(+m[3], mesDeTexto(m[2]), +m[1]);
  m = t.match(/\b([a-z]+\.?)\s+(\d{1,2})\s+(?:de\s+)?(\d{4})\b/);
  if (m && mesDeTexto(m[1])) return valida(+m[3], mesDeTexto(m[1]), +m[2]);
  return null;
}

/** 'Agosto 2017' / 'ago-2017' → { anio, mes } (para sugerir el primer semestre). */
function mesAnio(texto) {
  const t = normalizarTexto(texto);
  const m = t.match(/\b([a-z]+)\.?\s*(?:de\s+|del\s+|-|\/)?\s*(\d{4})\b/);
  if (m && mesDeTexto(m[1])) return { anio: +m[2], mes: mesDeTexto(m[1]) };
  const n = t.match(/\b(\d{1,2})[/-](\d{4})\b/);
  if (n && +n[1] >= 1 && +n[1] <= 12) return { anio: +n[2], mes: +n[1] };
  return null;
}

module.exports = { interpretar, mesAnio, mesDeTexto };
