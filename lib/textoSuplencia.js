/**
 * Texto de la columna G (Detalle del pago) para las incidencias de suplencia (07 §4.1).
 *
 *   Sustituyó al docente {titular}, nómina: {L0nnnnnnn} CRN {crn} de {h} horas a la semana,
 *   del día {d} de {mes}, a pagar 1 día. 1 día* {tarifa} = {monto} {observaciones}
 *
 * Agrupación (mismo suplente, titular, CRN y mes): días consecutivos → 'del 1 al 4 de septiembre';
 * sueltos → 'del día 24, 25, 27 y 28 de agosto'.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dinero = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
const horas = (h) => String(Number(h ?? 0));

/** 'a, b y c' */
function enumerar(lista) {
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}`;
}

/** Días de un mismo mes (ISO) → 'del día 17 de agosto' | 'del 1 al 4 de septiembre' | 'del día 24, 25 y 27 de agosto'. */
function textoFechas(fechasIso) {
  const ordenadas = [...new Set(fechasIso)].sort();
  const dias = ordenadas.map((f) => Number(f.slice(8, 10)));
  const mes = MESES[Number(ordenadas[0].slice(5, 7)) - 1];
  if (dias.length === 1) return `del día ${dias[0]} de ${mes}`;
  const consecutivos = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  if (consecutivos) return `del ${dias[0]} al ${dias.at(-1)} de ${mes}`;
  return `del día ${enumerar(dias.map(String))} de ${mes}`;
}

/**
 * @param {object} p
 * @param {string} p.titular       nombre completo del docente que faltó
 * @param {string} p.nomina        nómina canónica del titular (con L0)
 * @param {string|null} p.crn
 * @param {string|null} p.actividad nombre de la actividad (si no hay CRN)
 * @param {number} p.horasSemana
 * @param {string[]} p.fechas      fechas ISO de los días cubiertos (mismo mes)
 * @param {string|null} p.fechaTexto  rango en texto (faltas manuales sin fecha)
 * @param {number} p.tarifa        pago por día
 * @param {number} p.dias          número de días a pagar
 * @param {number} [p.total]       importe real; si se omite, tarifa × días
 * @param {string|null} p.notas    observaciones / folio IMSS
 */
function generar(p) {
  const asignatura = p.crn ? `CRN ${p.crn}` : p.actividad ?? 'actividad';
  const cuando = p.fechas.length ? textoFechas(p.fechas) : `del ${p.fechaTexto}`;
  const dia = p.dias === 1 ? 'día' : 'días';
  const total = p.total ?? p.tarifa * p.dias;
  const texto = `Sustituyó al docente ${p.titular}, nómina: ${p.nomina} ${asignatura} de ${horas(p.horasSemana)} horas a la semana, `
    + `${cuando}, a pagar ${p.dias} ${dia}. ${p.dias} ${dia}* ${dinero(p.tarifa)} = ${dinero(total)}`;
  return p.notas ? `${texto} ${p.notas}` : texto;
}

module.exports = { generar, textoFechas, enumerar, MESES };
