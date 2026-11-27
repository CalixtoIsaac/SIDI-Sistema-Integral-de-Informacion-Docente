/**
 * Inasistencias por semestre (HU-14; 06 §Faltas · GET /faltas/resumen-semestral; 04 §5 tipo_resumen).
 *
 *   resumenSemestral(db, { periodoId? })   (sin periodoId → el periodo actual)
 *     → { periodo, indicadores: { faltas, diasFaltados, profesores, montoDescontado, pagadoSuplentes, cubiertas },
 *         porMotivo, porJustificacion, porTipo, porDocente }
 *
 * - faltas         = registros CRN × día × sesión (como salen en el Excel de Descuentos)
 * - diasFaltados   = días distintos por docente (una falta manual cuenta sus `dias`)
 * - profesores     = docentes distintos que faltaron
 * Semestre de una falta: el periodo de su CRN; si no tiene CRN, el periodo de su fecha, de la fecha de
 * pago de su quincena o del día en que se registró (en ese orden).
 * Tipo de resumen: incapacidad/cita IMSS → 'Incapacidad médica'; viaje escolar → 'Viaje escolar';
 * lo demás → 'Asunto personal'.
 */
const { HttpError } = require('../lib/errores');
const { nombreCompleto } = require('../lib/nombres');

const TIPOS = ['Asunto personal', 'Incapacidad médica', 'Viaje escolar'];
const JUSTIFICACIONES = [
  ['ninguna', 'Sin justificación (se descuenta)'],
  ['incapacidad_imss', 'Incapacidad IMSS'],
  ['cita_imss', 'Cita médica IMSS'],
  ['viaje_escolar', 'Viaje escolar'],
];

const redondear = (n) => Math.round(n * 100) / 100;
const tipoResumen = (justificacion) => {
  if (['incapacidad_imss', 'cita_imss'].includes(justificacion)) return TIPOS[1];
  return justificacion === 'viaje_escolar' ? TIPOS[2] : TIPOS[0];
};

function elegirPeriodo(db, periodoId) {
  if (periodoId === undefined || periodoId === null || periodoId === '') {
    const actual = db.prepare('SELECT id, clave FROM periodos WHERE actual = 1').get();
    if (!actual) throw new HttpError(404, 'No hay un semestre marcado como actual.', 'SIN_PERIODO_ACTUAL');
    return actual;
  }
  const p = db.prepare('SELECT id, clave FROM periodos WHERE id = ?').get(Number(periodoId));
  if (!p) throw new HttpError(404, 'Ese semestre no existe.', 'PERIODO_NO_EXISTE');
  return p;
}

/** Faltas del semestre, con su suplencia (si la hay). */
function faltasDelPeriodo(db, periodoId) {
  const periodos = db.prepare('SELECT id, fecha_inicio FROM periodos WHERE fecha_inicio IS NOT NULL ORDER BY fecha_inicio DESC').all();
  const periodoDeFecha = (fecha) => (fecha ? periodos.find((p) => p.fecha_inicio <= fecha)?.id ?? null : null);
  return db.prepare(`
      SELECT f.id, f.docente_id, f.fecha, f.dias, f.motivo, f.justificacion, f.monto_descuento, f.creado_en,
             a.periodo_id, q.fecha_pago, s.monto AS pagado,
             d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno
      FROM faltas f
      JOIN docentes d ON d.id = f.docente_id
      LEFT JOIN asignaturas a ON a.id = f.asignatura_id
      LEFT JOIN quincenas q ON q.id = f.quincena_id
      LEFT JOIN suplencias s ON s.falta_id = f.id`).all()
    .filter((f) => (f.periodo_id ?? periodoDeFecha(f.fecha ?? f.fecha_pago ?? String(f.creado_en).slice(0, 10))) === periodoId);
}

/** Agrupa y cuenta: faltas, profesores distintos y monto descontado. */
function agrupar(faltas, clave) {
  const grupos = new Map();
  for (const f of faltas) {
    const k = clave(f);
    if (!grupos.has(k)) grupos.set(k, { faltas: 0, docentes: new Set(), monto: 0 });
    const g = grupos.get(k);
    g.faltas += 1;
    g.docentes.add(f.docente_id);
    g.monto += f.monto_descuento;
  }
  return grupos;
}

const fila = (g) => ({ faltas: g?.faltas ?? 0, profesores: g?.docentes.size ?? 0, montoDescontado: redondear(g?.monto ?? 0) });

function diasFaltados(faltas) {
  const vistos = new Set();
  let manuales = 0;
  for (const f of faltas) {
    if (f.fecha) vistos.add(`${f.docente_id}|${f.fecha}`);
    else manuales += f.dias;
  }
  return vistos.size + manuales;
}

/** GET /faltas/resumen-semestral?periodoId= */
function resumenSemestral(db, query = {}) {
  const periodo = elegirPeriodo(db, query.periodoId);
  const faltas = faltasDelPeriodo(db, periodo.id);

  const porMotivo = [...agrupar(faltas, (f) => f.motivo)]
    .map(([motivo, g]) => ({ motivo, ...fila(g) }))
    .sort((a, b) => b.faltas - a.faltas || a.motivo.localeCompare(b.motivo, 'es'));
  const just = agrupar(faltas, (f) => f.justificacion);
  const tipos = agrupar(faltas, (f) => tipoResumen(f.justificacion));

  const porDocente = [...agrupar(faltas, (f) => f.docente_id)].map(([docenteId, g]) => {
    const f = faltas.find((x) => x.docente_id === docenteId);
    const suyas = faltas.filter((x) => x.docente_id === docenteId);
    return {
      docenteId,
      nomina: f.nomina,
      nombre: nombreCompleto({ nombres: f.nombres, apellidoPaterno: f.apellido_paterno, apellidoMaterno: f.apellido_materno }),
      faltas: g.faltas,
      diasFaltados: diasFaltados(suyas),
      montoDescontado: redondear(g.monto),
      motivos: [...new Set(suyas.map((x) => x.motivo))],
    };
  }).sort((a, b) => b.faltas - a.faltas || a.nombre.localeCompare(b.nombre, 'es'));

  const cubiertas = faltas.filter((f) => f.pagado !== null);
  return {
    periodo,
    indicadores: {
      faltas: faltas.length,
      diasFaltados: diasFaltados(faltas),
      profesores: new Set(faltas.map((f) => f.docente_id)).size,
      montoDescontado: redondear(faltas.reduce((s, f) => s + f.monto_descuento, 0)),
      pagadoSuplentes: redondear(cubiertas.reduce((s, f) => s + f.pagado, 0)),
      cubiertas: cubiertas.length,
    },
    porMotivo,
    porJustificacion: JUSTIFICACIONES.map(([justificacion, etiqueta]) => ({ justificacion, etiqueta, ...fila(just.get(justificacion)) })),
    porTipo: TIPOS.map((tipo) => ({ tipo, ...fila(tipos.get(tipo)) })),
    porDocente,
  };
}

module.exports = { resumenSemestral, tipoResumen, TIPOS };
