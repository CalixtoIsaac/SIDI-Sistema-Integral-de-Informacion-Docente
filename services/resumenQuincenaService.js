/**
 * Resumen de la quincena por docente (06 §Faltas · GET /faltas/resumen-quincena?quincenaId=).
 * Equivale a la hoja "detalle" del Excel de Incidencias (07 §3): por titular, lo descontado, lo pagado a
 * quien lo cubrió y la diferencia.
 *
 *   resumenQuincena(db, { quincenaId })
 *     → { quincena, docentes: [{ docenteId, nomina, nominaNacional, nombre, faltas, pendientes, descontado,
 *                                pagadoSuplentes, diferencia, situacion, estatus }],
 *         totales: { docentes, faltas, pendientes, descontado, pagadoSuplentes, diferencia } }
 *
 * Mismas faltas que se incluirían al generar los reportes: las ya asignadas a la quincena y, si sigue
 * abierta, las pendientes con fecha ≤ fin de la quincena (o sin fecha) — `pendientes` las cuenta.
 * Descontado = solo faltas sin justificación (las de IMSS no se descuentan, pero aparecen en detalle).
 * No cambia nada en la BD.
 */
const { HttpError } = require('../lib/errores');
const nominaLib = require('../lib/nomina');
const { nombreCompleto } = require('../lib/nombres');
const quincenasService = require('./quincenasService');
const reporteService = require('./reporteService');

const redondear = (n) => Math.round(n * 100) / 100;

function resumenQuincena(db, query = {}) {
  if (query.quincenaId === undefined || query.quincenaId === null || query.quincenaId === '') {
    throw new HttpError(400, 'Indica la quincena (quincenaId).', 'VALIDACION', [{ campo: 'quincenaId', problema: 'OBLIGATORIO' }]);
  }
  const q = quincenasService.obtener(db, query.quincenaId);
  const faltas = reporteService.faltasDeQuincena(db, q);
  const pagos = new Map();
  if (faltas.length) {
    const filas = db.prepare(`SELECT falta_id, monto FROM suplencias WHERE falta_id IN (${faltas.map(() => '?').join(',')})`)
      .all(...faltas.map((f) => f.id));
    for (const s of filas) pagos.set(s.falta_id, s.monto);
  }

  const porDocente = new Map();
  for (const f of faltas) {
    if (!porDocente.has(f.docente_id)) {
      porDocente.set(f.docente_id, {
        docenteId: f.docente_id,
        nomina: f.nomina,
        nominaNacional: nominaLib.aNacional(f.nomina),
        nombre: nombreCompleto({ nombres: f.nombres, apellidoPaterno: f.apellido_paterno, apellidoMaterno: f.apellido_materno }),
        faltas: 0, pendientes: 0, descontado: 0, pagadoSuplentes: 0, textos: null,
      });
    }
    const d = porDocente.get(f.docente_id);
    d.faltas += 1;
    if (f.quincena_id === null) d.pendientes += 1;
    if (f.justificacion === 'ninguna') d.descontado += f.monto_descuento;
    d.pagadoSuplentes += pagos.get(f.id) ?? 0;
    // Igual que la hoja detalle: situación/estatus de una falta descontada si la hay; si no, los de IMSS
    if (!d.textos || (f.justificacion === 'ninguna' && d.textos.justificacion !== 'ninguna')) {
      d.textos = { justificacion: f.justificacion, situacion: f.situacion, estatus: f.estatus };
    }
  }

  const docentes = [...porDocente.values()].map(({ textos, ...d }) => ({
    ...d,
    descontado: redondear(d.descontado),
    pagadoSuplentes: redondear(d.pagadoSuplentes),
    diferencia: redondear(d.descontado - d.pagadoSuplentes),
    situacion: textos.situacion,
    estatus: textos.estatus,
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const suma = (campo) => redondear(docentes.reduce((s, d) => s + d[campo], 0));
  return {
    quincena: q,
    docentes,
    totales: {
      docentes: docentes.length,
      faltas: faltas.length,
      pendientes: docentes.reduce((s, d) => s + d.pendientes, 0),
      descontado: suma('descontado'),
      pagadoSuplentes: suma('pagadoSuplentes'),
      diferencia: suma('diferencia'),
    },
  };
}

module.exports = { resumenQuincena };
