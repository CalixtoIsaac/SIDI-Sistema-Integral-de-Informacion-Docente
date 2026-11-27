/**
 * Cálculo del descuento por falta (HU-09; 07 §3.1; 04 §5). Funciones sin escritura en la BD.
 *
 *   tarifa_aplicada = tipos_clase.pago_por_dia del CRN (o de la actividad)
 *   monto_descuento = justificacion = 'ninguna' ? tarifa (o el monto editado) : 0   (justificada no se descuenta)
 *   motivo          = No justificada → 'Falta por asunto personal' (texto de la col. F de Descuentos);
 *                     Justificada (IMSS o viaje escolar) → 'Falta justificada'. Horas: siempre 8 h = 1 día
 *   comentario      = 'CRN {crn} de {horas} horas a la semana, a descontar {m} = {m}'
 *                     actividad: '{nombre_actividad} de {horas} horas a la semana, …'
 *   cuenta_cargo    = 5422101001 para materias VSPP (deportivas/culturales); si no 5420103000
 *   situacion / estatus = catálogos según la justificación (hoja Detalle)
 */
const { diaSemana } = require('../lib/horario');

const JUSTIFICACIONES = ['ninguna', 'incapacidad_imss', 'cita_imss', 'viaje_escolar'];
/** Solo las del IMSS piden folio. */
const JUSTIFICACIONES_IMSS = ['incapacidad_imss', 'cita_imss'];
const esImss = (justificacion) => JUSTIFICACIONES_IMSS.includes(justificacion);
// Retro de la cliente (26/11/2026): el motivo solo es Justificada o No justificada.
const MOTIVO_NO_JUSTIFICADA = 'Falta por asunto personal';
const MOTIVO_JUSTIFICADA = 'Falta justificada';
const motivoDe = (justificacion) => (justificacion === 'ninguna' ? MOTIVO_NO_JUSTIFICADA : MOTIVO_JUSTIFICADA);
const CUENTA_ACADEMICA = '5420103000';
const CUENTA_VSPP = '5422101001';
const HORAS_DIA_COMPLETO = '8 horas= 1 día completo';

const redondear = (n) => Math.round(Number(n) * 100) / 100;
const dinero = (n) => redondear(n).toFixed(2);
const horasTexto = (h) => (Number.isInteger(Number(h)) ? String(Number(h)) : String(Number(h)));

/** Asignatura con su tarifa y horarios (lo que hace falta para calcular). */
function asignaturaParaFalta(db, asignaturaId) {
  const a = db.prepare(`SELECT a.id, a.docente_id, a.periodo_id, a.crn, a.nombre_actividad, a.clave_materia, a.materia,
                               a.numero_grupo, a.horas_semana, a.idioma, a.num_contrato, a.tipo_clase_id,
                               t.pago_por_dia, t.nombre AS tipo_clase
                        FROM asignaturas a LEFT JOIN tipos_clase t ON t.id = a.tipo_clase_id
                        WHERE a.id = ?`).get(asignaturaId);
  if (!a) return null;
  a.horarios = db.prepare('SELECT dia_semana AS dia, hora_inicio AS inicio, hora_fin AS fin FROM horarios WHERE asignatura_id = ? ORDER BY hora_inicio')
    .all(asignaturaId);
  return a;
}

/** Sesiones de la asignatura en el día de la semana de `fecha` (0, 1 o 2). */
function sesionesEseDia(asignatura, fecha) {
  const dia = diaSemana(fecha);
  return asignatura.horarios.filter((h) => h.dia === dia);
}

function etiquetaAsignatura(a) {
  return a.crn ? `CRN ${a.crn}` : a.nombre_actividad ?? a.materia;
}

function comentario(a, monto) {
  return `${etiquetaAsignatura(a)} de ${horasTexto(a.horas_semana ?? 0)} horas a la semana, a descontar ${dinero(monto)} = ${dinero(monto)}`;
}

function cuentaPorDefecto(a) {
  return String(a.clave_materia ?? '').toUpperCase().startsWith('VSPP') ? CUENTA_VSPP : CUENTA_ACADEMICA;
}

/** Textos de la hoja Detalle según la justificación (catálogos situacion y estatus_falta). */
function textosDetalle(db, justificacion) {
  const texto = (tipo) => db.prepare('SELECT valor FROM catalogos WHERE tipo = ? AND descripcion = ? AND activo = 1 ORDER BY orden LIMIT 1')
    .get(tipo, justificacion)?.valor ?? null;
  return { situacion: texto('situacion'), estatus: texto('estatus_falta') };
}

/**
 * Calcula una fila de falta en modo tarifa.
 * `montoEditado` (opcional) reemplaza la tarifa y queda marcado.
 */
function calcularFila(db, a, { justificacion = 'ninguna', montoEditado = null } = {}) {
  const tarifa = a.pago_por_dia ?? null;
  const base = montoEditado ?? tarifa;
  const monto = justificacion === 'ninguna' ? redondear(base ?? 0) : 0;
  return {
    tarifaAplicada: tarifa,
    montoDescuento: monto,
    montoEditado: montoEditado !== null && montoEditado !== tarifa,
    comentario: comentario(a, justificacion === 'ninguna' ? monto : base ?? 0),
    ...textosDetalle(db, justificacion),
  };
}

module.exports = {
  JUSTIFICACIONES, JUSTIFICACIONES_IMSS, esImss, MOTIVO_NO_JUSTIFICADA, MOTIVO_JUSTIFICADA, motivoDe,
  CUENTA_ACADEMICA, CUENTA_VSPP, HORAS_DIA_COMPLETO,
  asignaturaParaFalta, sesionesEseDia, etiquetaAsignatura, comentario, cuentaPorDefecto, textosDetalle, calcularFila,
  redondear, dinero,
};
