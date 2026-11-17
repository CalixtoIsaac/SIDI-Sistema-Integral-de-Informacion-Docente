/**
 * Reportes de Nacional (HU-12 Descuentos; 06 §Reportes de Nacional; 07 §0.1 y §3).
 *
 *   validarDescuentos(db, quincenaId)          → lo que se incluirá y avisos (no cambia nada)
 *   generarDescuentos(db, quincenaId, excluir) → asigna los pendientes a la quincena y arma el Excel
 *   validarIncidencias / generarIncidencias    → hoja Incidencia (pagos manuales + suplencias) y hoja detalle (HU-13)
 *
 * Quincena de reporte (07 §0.1): al generar Qnn se le asignan las faltas PENDIENTES (quincena_id NULL)
 * con fecha ≤ fin de la quincena (y las manuales sin fecha), salvo las que se excluyan para la siguiente.
 * Las suplencias de esas faltas pasan a la misma quincena (su incidencia se reagrupa).
 * Solo las faltas sin justificación van a Descuentos; las de IMSS quedan en la quincena para Detalle.
 */
const { HttpError } = require('../lib/errores');
const nominaLib = require('../lib/nomina');
const { nombreCompleto } = require('../lib/nombres');
const generadorDescuentos = require('../lib/excel/generadores/descuentos');
const generadorIncidencias = require('../lib/excel/generadores/incidencias');
const suplenciaService = require('./suplenciaService');
const quincenasService = require('./quincenasService');

function quincena(db, quincenaId) {
  if (!quincenaId) throw new HttpError(400, 'Indica la quincena (quincenaId).', 'VALIDACION', [{ campo: 'quincenaId', problema: 'OBLIGATORIO' }]);
  return quincenasService.obtener(db, quincenaId);
}

function listaIds(valor) {
  if (valor === undefined || valor === null || valor === '') return [];
  return (Array.isArray(valor) ? valor : String(valor).split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

const SELECT_FALTAS = `
  SELECT f.*, dc.nomina, dc.nombres, dc.apellido_paterno, dc.apellido_materno, a.crn, a.num_contrato, a.periodo_id,
         (SELECT a2.num_contrato FROM asignaturas a2 WHERE a2.docente_id = f.docente_id AND a2.num_contrato IS NOT NULL
          ORDER BY a2.periodo_id = a.periodo_id DESC, a2.crn LIMIT 1) AS contrato_docente
  FROM faltas f JOIN docentes dc ON dc.id = f.docente_id LEFT JOIN asignaturas a ON a.id = f.asignatura_id`;

/** Faltas que entrarían en la quincena: ya asignadas + pendientes con fecha ≤ fin (o sin fecha). */
function faltasDeQuincena(db, q) {
  return db.prepare(`${SELECT_FALTAS}
    WHERE f.quincena_id = @id OR (@abierta = 1 AND f.quincena_id IS NULL AND (f.fecha IS NULL OR f.fecha <= @fin))
    ORDER BY f.fecha IS NULL, f.fecha, dc.apellido_paterno, dc.nombres, a.crn, f.sesion, f.id`)
    .all({ id: q.id, abierta: q.cerrada ? 0 : 1, fin: q.fechaFin });
}

function avisosDe(f) {
  const avisos = [];
  if (f.justificacion !== 'ninguna') avisos.push('IMSS_SOLO_DETALLE');
  if (!(f.num_contrato ?? f.contrato_docente)) avisos.push('SIN_CONTRATO');
  if (f.modo_calculo === 'tarifa' && f.tarifa_aplicada === null) avisos.push('SIN_TARIFA');
  if (f.monto_editado === 1 && f.modo_calculo === 'tarifa') avisos.push('MONTO_EDITADO');
  if (f.justificacion === 'ninguna' && !(f.monto_descuento > 0)) avisos.push('MONTO_CERO');
  return avisos;
}

function nombre(f) {
  return nombreCompleto({ nombres: f.nombres, apellidoPaterno: f.apellido_paterno, apellidoMaterno: f.apellido_materno });
}

/** Fila del Excel de Descuentos. */
function filaDescuento(f) {
  return {
    faltaId: f.id,
    nominaNacional: nominaLib.aNacional(f.nomina),
    contrato: f.num_contrato ?? f.contrato_docente ?? null,
    nombre: nombre(f),
    dias: f.dias,
    fecha: f.fecha,
    fechaTexto: f.fecha_texto,
    motivo: f.motivo,
    horasTexto: f.horas_texto,
    cuentaCargo: f.cuenta_cargo,
    comentario: f.comentario,
    ticket: f.ticket,
    monto: f.monto_descuento,
  };
}

/** GET /reportes/descuentos/validar?quincenaId= */
function validarDescuentos(db, quincenaId) {
  const q = quincena(db, quincenaId);
  const faltas = faltasDeQuincena(db, q);
  const filas = faltas.map((f) => ({
    ...filaDescuento(f), crn: f.crn, justificacion: f.justificacion, pendiente: f.quincena_id === null,
    vaEnDescuentos: f.justificacion === 'ninguna', avisos: avisosDe(f),
  }));
  const enExcel = filas.filter((f) => f.vaEnDescuentos);
  return {
    quincena: q,
    filas,
    totales: { faltas: filas.length, enDescuentos: enExcel.length, descuento: Math.round(enExcel.reduce((s, f) => s + f.monto, 0) * 100) / 100 },
    avisos: filas.flatMap((f) => f.avisos.filter((a) => a !== 'IMSS_SOLO_DETALLE').map((tipo) => ({ faltaId: f.faltaId, crn: f.crn, tipo }))),
  };
}

/** Asigna las faltas pendientes (menos las excluidas) a la quincena y mueve sus suplencias. */
function asignarPendientes(db, q, excluir = []) {
  if (q.cerrada) return 0;
  const fuera = new Set(excluir);
  const pendientes = faltasDeQuincena(db, q).filter((f) => f.quincena_id === null && !fuera.has(f.id));
  const asignar = db.prepare('UPDATE faltas SET quincena_id = ? WHERE id = ?');
  for (const f of pendientes) {
    asignar.run(q.id, f.id);
    suplenciaService.sincronizarFalta(db, f.id); // la incidencia del suplente pasa a la misma quincena
  }
  return pendientes.length;
}

/** GET /reportes/descuentos?quincenaId=&excluir=1,2 → { nombre, buffer, filas } */
async function generarDescuentos(db, quincenaId, excluir) {
  const q = quincena(db, quincenaId);
  const asignadas = db.transaction(() => asignarPendientes(db, q, listaIds(excluir)))();
  const filas = db.prepare(`${SELECT_FALTAS} WHERE f.quincena_id = ? AND f.justificacion = 'ninguna'
                            ORDER BY f.fecha IS NULL, f.fecha, dc.apellido_paterno, dc.nombres, a.crn, f.sesion, f.id`)
    .all(q.id).map(filaDescuento);
  const buffer = await generadorDescuentos.generar(filas);
  return { nombre: `DESCUENTO-PREPA Q${q.numero}.xlsx`, buffer, filas, asignadas };
}

// ------------------------------------------------------------------ Incidencias (HU-13)

const SELECT_INCIDENCIAS = `
  SELECT i.*, d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno
  FROM incidencias i JOIN docentes d ON d.id = i.docente_id`;

/**
 * Incidencias que entrarían: las de la quincena + (si está abierta) las manuales pendientes y las de
 * suplencias de faltas pendientes con fecha ≤ fin de la quincena.
 */
function incidenciasDeQuincena(db, q, excluir = []) {
  const fuera = new Set(excluir);
  return db.prepare(`${SELECT_INCIDENCIAS}
    WHERE i.quincena_id = @id
       OR (@abierta = 1 AND i.quincena_id IS NULL AND i.origen = 'manual')
       OR (@abierta = 1 AND i.quincena_id IS NULL AND i.origen = 'suplencia' AND EXISTS (
            SELECT 1 FROM suplencias s JOIN faltas f ON f.id = s.falta_id
            WHERE s.incidencia_id = i.id AND f.quincena_id IS NULL AND (f.fecha IS NULL OR f.fecha <= @fin)))
    ORDER BY i.orden, i.id`).all({ id: q.id, abierta: q.cerrada ? 0 : 1, fin: q.fechaFin })
    .filter((i) => i.quincena_id === q.id || i.origen === 'suplencia' || !fuera.has(i.id));
}

function filaIncidencia(i) {
  return {
    id: i.id,
    nominaNacional: nominaLib.aNacional(i.nomina),
    numContrato: i.num_contrato,
    nombre: nombre(i),
    tipoContrato: i.tipo_contrato,
    ccNomina: i.cc_nomina,
    motivo: i.motivo,
    detalle: i.detalle,
    ceco: i.ceco,
    elementoPep: i.elemento_pep,
    ordenInterna: i.orden_interna,
    importeTotal: i.importe_total,
    numPeriodos: i.num_periodos,
    aPartirDe: i.a_partir_de,
    origen: i.origen,
  };
}

function avisosIncidencia(i) {
  const avisos = [];
  if (!i.num_contrato) avisos.push(i.origen === 'suplencia' ? 'SUPLENTE_SIN_CONTRATO' : 'SIN_CONTRATO');
  if (i.elemento_pep && i.elemento_pep.length > 24) avisos.push('PEP_MAYOR_A_24');
  if (i.orden_interna && i.orden_interna.length > 12) avisos.push('ORDEN_INTERNA_MAYOR_A_12');
  if (!/^\d{10}$/.test(String(i.ceco ?? ''))) avisos.push('CECO_INVALIDO');
  if (!(i.importe_total > 0)) avisos.push('IMPORTE_CERO');
  return avisos;
}

/** Hoja detalle: una fila por docente que faltó en la quincena (aunque no se le haya descontado). */
function detalleDeQuincena(db, qId) {
  const faltas = db.prepare(`SELECT f.docente_id, f.monto_descuento, f.justificacion, f.situacion, f.estatus, s.incidencia_id,
                                    d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno
                             FROM faltas f JOIN docentes d ON d.id = f.docente_id
                             LEFT JOIN suplencias s ON s.falta_id = f.id
                             WHERE f.quincena_id = ? ORDER BY d.apellido_paterno, d.apellido_materno, d.nombres, f.id`).all(qId);
  const porDocente = new Map();
  for (const f of faltas) {
    if (!porDocente.has(f.docente_id)) {
      porDocente.set(f.docente_id, { nominaNacional: nominaLib.aNacional(f.nomina), nombre: nombre(f), descontado: 0, incidenciaIds: new Set(), textos: null });
    }
    const d = porDocente.get(f.docente_id);
    if (f.justificacion === 'ninguna') d.descontado += f.monto_descuento;
    if (f.incidencia_id) d.incidenciaIds.add(f.incidencia_id);
    // Situación y estatus: los de una falta descontada si la hay; si no, los de la justificación (IMSS)
    if (!d.textos || (f.justificacion === 'ninguna' && d.textos.justificacion !== 'ninguna')) {
      d.textos = { justificacion: f.justificacion, situacion: f.situacion, estatus: f.estatus };
    }
  }
  return [...porDocente.values()].map((d) => ({
    nominaNacional: d.nominaNacional, nombre: d.nombre, descontado: Math.round(d.descontado * 100) / 100,
    incidenciaIds: [...d.incidenciaIds], situacion: d.textos.situacion, estatus: d.textos.estatus,
  }));
}

/** GET /reportes/incidencias/validar?quincenaId= */
function validarIncidencias(db, quincenaId) {
  const q = quincena(db, quincenaId);
  const incidencias = incidenciasDeQuincena(db, q).map((i) => ({ ...filaIncidencia(i), pendiente: i.quincena_id === null, avisos: avisosIncidencia(i) }));
  return {
    quincena: q,
    incidencias,
    totales: { filas: incidencias.length, importe: Math.round(incidencias.reduce((s, i) => s + i.importeTotal, 0) * 100) / 100 },
    avisos: incidencias.flatMap((i) => i.avisos.map((tipo) => ({ incidenciaId: i.id, tipo }))),
  };
}

/** GET /reportes/incidencias?quincenaId=&excluir=&excluirIncidencias= → { nombre, buffer, incidencias, detalle } */
async function generarIncidencias(db, quincenaId, excluir, excluirIncidencias) {
  const q = quincena(db, quincenaId);
  db.transaction(() => {
    asignarPendientes(db, q, listaIds(excluir)); // faltas pendientes y sus suplencias
    if (q.cerrada) return;
    const asignar = db.prepare('UPDATE incidencias SET quincena_id = ?, a_partir_de = COALESCE(a_partir_de, ?) WHERE id = ?');
    for (const i of incidenciasDeQuincena(db, q, listaIds(excluirIncidencias))) if (i.quincena_id === null) asignar.run(q.id, q.fechaPago, i.id);
  })();
  const incidencias = db.prepare(`${SELECT_INCIDENCIAS} WHERE i.quincena_id = ? ORDER BY i.orden, i.id`).all(q.id).map(filaIncidencia);
  const detalle = detalleDeQuincena(db, q.id);
  const buffer = await generadorIncidencias.generar(incidencias, detalle);
  return { nombre: `INCIDENCIAS PREPA Q${q.numero}.xlsx`, buffer, incidencias, detalle };
}

module.exports = {
  validarDescuentos, generarDescuentos, validarIncidencias, generarIncidencias,
  asignarPendientes, faltasDeQuincena, detalleDeQuincena, listaIds,
};
