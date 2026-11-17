/**
 * Reportes de Nacional (HU-12 Descuentos; 06 §Reportes de Nacional; 07 §0.1 y §3).
 *
 *   validarDescuentos(db, quincenaId)          → lo que se incluirá y avisos (no cambia nada)
 *   generarDescuentos(db, quincenaId, excluir) → asigna los pendientes a la quincena y arma el Excel
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

module.exports = { validarDescuentos, generarDescuentos, asignarPendientes, faltasDeQuincena, listaIds };
