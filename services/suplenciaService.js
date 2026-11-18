/**
 * Suplencias y pago del suplente (HU-10; 04 §5; 07 §4.1; 06 PUT/DELETE /faltas/:id/suplencia).
 *
 *   suplencias.monto  = lo descontado al titular (siempre igual); en faltas IMSS (descuento 0) se
 *                       paga igual la tarifa del día
 *   contrato          = uno de los contratos del SUPLENTE (se propone el primero del periodo; 422 si no es
 *                       suyo; vacío con aviso si no tiene)
 *   incidencia        = 'Flex Act. Acad de Apoyo' · 'B2_Cap.Profr(CADI Asore, Compet.)' · CeCo de la falta ·
 *                       1 periodo · detalle 'Sustituyó al docente …'
 *   agrupación        = mismo suplente + contrato + titular + CRN + mes + quincena + monto por día → 1 incidencia
 *                       (configuracion reportes.agrupar_suplencias = '1'; con '0', una incidencia por día)
 */
const { HttpError } = require('../lib/errores');
const config = require('../lib/configuracion');
const texto = require('../lib/textoSuplencia');
const { nombreCompleto } = require('../lib/nombres');
const d = require('./descuentoService');

const CC_NOMINA = 'Flex Act. Acad de Apoyo';
const MOTIVO = 'B2_Cap.Profr(CADI Asore, Compet.)';

const nombre = (x) => nombreCompleto({ nombres: x.nombres, apellidoPaterno: x.apellido_paterno, apellidoMaterno: x.apellido_materno });

function falta(db, faltaId) {
  const f = db.prepare(`SELECT f.*, a.periodo_id, a.crn, a.nombre_actividad, a.materia, a.horas_semana,
                               dc.nomina, dc.nombres, dc.apellido_paterno, dc.apellido_materno
                        FROM faltas f JOIN docentes dc ON dc.id = f.docente_id
                        LEFT JOIN asignaturas a ON a.id = f.asignatura_id WHERE f.id = ?`).get(faltaId);
  if (!f) throw new HttpError(404, 'Esa falta no existe.', 'FALTA_NO_EXISTE');
  return f;
}

/** Lo que se le paga al suplente por esa falta: lo descontado; si no hubo descuento (IMSS), la tarifa. */
function montoDe(f) {
  return d.redondear(f.monto_descuento > 0 ? f.monto_descuento : f.tarifa_aplicada ?? f.monto_descuento ?? 0);
}

/** Contratos del docente (de sus asignaturas): primero los del periodo indicado. */
function contratosDe(db, docenteId, periodoId = null) {
  return db.prepare(`SELECT a.num_contrato AS contrato, MAX(a.periodo_id IS @periodo) AS delPeriodo, MIN(a.crn) AS crn
                     FROM asignaturas a WHERE a.docente_id = @docente AND a.num_contrato IS NOT NULL
                     GROUP BY a.num_contrato ORDER BY delPeriodo DESC, crn`)
    .all({ docente: docenteId, periodo: periodoId }).map((c) => ({ contrato: c.contrato, delPeriodo: c.delPeriodo === 1, crn: c.crn }));
}

/** Valida el suplente y el contrato; devuelve { suplente, contrato, avisos }. */
function validarSuplente(db, f, docenteSuplenteId, numContrato) {
  const suplente = db.prepare('SELECT * FROM docentes WHERE id = ?').get(Number(docenteSuplenteId));
  if (!suplente) throw new HttpError(400, 'El suplente no existe.', 'SUPLENTE_NO_EXISTE');
  if (suplente.id === f.docente_id) throw new HttpError(400, 'El suplente no puede ser el mismo docente que faltó.', 'SUPLENTE_ES_TITULAR');
  const avisos = [];
  if (suplente.activo === 0) avisos.push('SUPLENTE_INACTIVO');
  const recontratable = db.prepare('SELECT recontratable FROM docente_bajas WHERE docente_id = ? ORDER BY fecha DESC, id DESC LIMIT 1').get(suplente.id);
  if (recontratable?.recontratable === 0) avisos.push('SUPLENTE_NO_RECONTRATABLE');
  const suyos = contratosDe(db, suplente.id, f.periodo_id);
  let contrato = numContrato === undefined || numContrato === null || String(numContrato).trim() === '' ? null : String(numContrato).trim();
  if (contrato && !suyos.some((c) => c.contrato === contrato)) {
    throw new HttpError(422, `El contrato ${contrato} no es del suplente.`, 'CONTRATO_NO_ES_DEL_SUPLENTE', suyos);
  }
  if (!contrato) contrato = suyos[0]?.contrato ?? null;
  if (!contrato) avisos.push('SUPLENTE_SIN_CONTRATO');
  return { suplente, contrato, avisos };
}

/** Notas que acompañan el texto: observaciones de la falta o el folio del IMSS. */
function notas(faltas) {
  const partes = faltas.map((f) => {
    if (f.observaciones) return f.observaciones;
    if (f.justificacion === 'incapacidad_imss') return `Incapacidad IMSS${f.folio_imss ? ` folio ${f.folio_imss}` : ''}`;
    if (f.justificacion === 'cita_imss') return `Cita médica IMSS${f.folio_imss ? ` folio ${f.folio_imss}` : ''}`;
    return null;
  }).filter(Boolean);
  return [...new Set(partes)].join('. ') || null;
}

/** Recalcula importe y texto de una incidencia de suplencia; la borra si ya no tiene suplencias. */
function recalcularIncidencia(db, incidenciaId) {
  const filas = db.prepare(`SELECT s.monto, f.id AS falta_id FROM suplencias s JOIN faltas f ON f.id = s.falta_id
                            WHERE s.incidencia_id = ? ORDER BY f.fecha, f.sesion`).all(incidenciaId);
  if (filas.length === 0) {
    db.prepare("DELETE FROM incidencias WHERE id = ? AND origen = 'suplencia'").run(incidenciaId);
    return;
  }
  const faltas = filas.map((x) => falta(db, x.falta_id));
  const primera = faltas[0];
  const importe = d.redondear(filas.reduce((s, x) => s + x.monto, 0));
  const dias = faltas.reduce((s, f) => s + (f.dias ?? 1), 0);
  // Pago por día = importe ÷ días: en una falta manual (14 días por $3,183.74) el monto es del periodo,
  // no de un día; con tarifa normal da lo mismo que el monto de cada suplencia.
  const tarifa = d.redondear(importe / dias);
  const detalle = texto.generar({
    titular: nombre(primera),
    nomina: primera.nomina,
    crn: primera.crn,
    actividad: primera.nombre_actividad ?? primera.materia,
    horasSemana: primera.horas_semana,
    fechas: faltas.map((f) => f.fecha).filter(Boolean),
    fechaTexto: primera.fecha_texto,
    tarifa,
    dias,
    total: importe,
    notas: notas(faltas),
  });
  db.prepare('UPDATE incidencias SET detalle = ?, importe_total = ?, ceco = ? WHERE id = ?').run(detalle, importe, primera.cuenta_cargo, incidenciaId);
}

/** Incidencia pendiente con la que se puede agrupar esta suplencia (o null). */
function grupoExistente(db, f, suplente, contrato, monto) {
  if (config.obtener(db, 'reportes.agrupar_suplencias') === '0' || !f.fecha) return null;
  return db.prepare(`SELECT i.id FROM incidencias i
                     JOIN suplencias s ON s.incidencia_id = i.id
                     JOIN faltas f ON f.id = s.falta_id
                     WHERE i.origen = 'suplencia' AND i.docente_id = @suplente AND i.num_contrato IS @contrato
                       AND i.quincena_id IS @quincena AND f.docente_id = @titular AND f.asignatura_id IS @asignatura
                       AND substr(f.fecha, 1, 7) = @mes AND s.monto = @monto
                     LIMIT 1`).get({
    suplente: suplente.id, contrato, quincena: f.quincena_id, titular: f.docente_id,
    asignatura: f.asignatura_id, mes: f.fecha.slice(0, 7), monto,
  })?.id ?? null;
}

function nuevaIncidencia(db, f, suplente, contrato, monto, ordenPrevio = null) {
  // Conserva el lugar de la fila en el Excel si la suplencia ya tenía incidencia (al reagrupar)
  const orden = ordenPrevio ?? db.prepare('SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM incidencias').get().n;
  // Si la falta ya está en una quincena, el pago empieza en la fecha de pago de esa quincena (col. N)
  const aPartirDe = f.quincena_id ? db.prepare('SELECT fecha_pago FROM quincenas WHERE id = ?').get(f.quincena_id)?.fecha_pago ?? null : null;
  return Number(db.prepare(`INSERT INTO incidencias (quincena_id, docente_id, num_contrato, tipo_contrato, cc_nomina, motivo, detalle,
                              ceco, importe_total, num_periodos, a_partir_de, origen, orden)
                            VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, 1, ?, 'suplencia', ?)`)
    .run(f.quincena_id, suplente.id, contrato, suplente.tipo_contrato ?? 'determinado', CC_NOMINA, MOTIVO, f.cuenta_cargo, monto, aPartirDe, orden)
    .lastInsertRowid);
}

/** Quita la suplencia de una falta (y ajusta o borra su incidencia). No falla si no tenía. */
function quitar(db, faltaId) {
  const s = db.prepare('SELECT * FROM suplencias WHERE falta_id = ?').get(faltaId);
  if (!s) return false;
  db.prepare('DELETE FROM suplencias WHERE id = ?').run(s.id);
  if (s.incidencia_id) recalcularIncidencia(db, s.incidencia_id);
  return true;
}

/**
 * Asigna (o cambia) quién cubrió la falta. `datos` = { docenteSuplenteId, numContrato?, monto? }.
 * Debe correr dentro de una transacción (la abre si no hay una).
 */
function asignar(db, faltaId, datos = {}) {
  return db.transaction(() => {
    const f = falta(db, faltaId);
    if (!datos.docenteSuplenteId) throw new HttpError(400, 'Indica el docente suplente.', 'VALIDACION', [{ campo: 'docenteSuplenteId', problema: 'OBLIGATORIO' }]);
    const { suplente, contrato, avisos } = validarSuplente(db, f, datos.docenteSuplenteId, datos.numContrato);
    const monto = datos.monto === undefined || datos.monto === null ? montoDe(f) : Number(datos.monto);
    if (!Number.isFinite(monto) || monto < 0) throw new HttpError(400, 'Monto inválido.', 'VALIDACION', [{ campo: 'monto', problema: 'VALOR_INVALIDO' }]);
    const previa = db.prepare('SELECT i.orden FROM suplencias s JOIN incidencias i ON i.id = s.incidencia_id WHERE s.falta_id = ?').get(faltaId);
    quitar(db, faltaId);
    const incidenciaId = grupoExistente(db, f, suplente, contrato, d.redondear(monto))
      ?? nuevaIncidencia(db, f, suplente, contrato, monto, previa?.orden ?? null);
    db.prepare('INSERT INTO suplencias (falta_id, docente_suplente_id, incidencia_id, monto) VALUES (?, ?, ?, ?)')
      .run(faltaId, suplente.id, incidenciaId, d.redondear(monto));
    recalcularIncidencia(db, incidenciaId);
    return { suplencia: obtener(db, faltaId), avisos };
  })();
}

/** Tras editar la falta: el suplente cobra lo nuevo y se rehace el texto de su incidencia. */
function sincronizarFalta(db, faltaId) {
  const s = db.prepare('SELECT * FROM suplencias WHERE falta_id = ?').get(faltaId);
  if (!s) return;
  const contrato = s.incidencia_id ? db.prepare('SELECT num_contrato FROM incidencias WHERE id = ?').get(s.incidencia_id)?.num_contrato : null;
  asignar(db, faltaId, { docenteSuplenteId: s.docente_suplente_id, numContrato: contrato });
}

function obtener(db, faltaId) {
  const s = db.prepare(`SELECT s.*, i.num_contrato, i.detalle, i.importe_total, ds.nomina, ds.nombres, ds.apellido_paterno, ds.apellido_materno
                        FROM suplencias s LEFT JOIN incidencias i ON i.id = s.incidencia_id
                        JOIN docentes ds ON ds.id = s.docente_suplente_id WHERE s.falta_id = ?`).get(faltaId);
  if (!s) return null;
  return {
    id: s.id,
    faltaId: s.falta_id,
    docenteSuplenteId: s.docente_suplente_id,
    suplente: nombre(s),
    nomina: s.nomina,
    numContrato: s.num_contrato,
    monto: s.monto,
    incidencia: s.incidencia_id ? { id: s.incidencia_id, detalle: s.detalle, importeTotal: s.importe_total } : null,
  };
}

/** GET /docentes/:id/contratos?periodoId= → contratos para elegir el del suplente. */
function contratos(db, docenteId, periodoId) {
  if (!db.prepare('SELECT 1 FROM docentes WHERE id = ?').get(docenteId)) throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  return contratosDe(db, docenteId, periodoId ? Number(periodoId) : null);
}

module.exports = { asignar, quitar, sincronizarFalta, obtener, contratos, montoDe, recalcularIncidencia, CC_NOMINA, MOTIVO };
