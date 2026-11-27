/**
 * Faltas por día y CRN (HU-09; 06 §Faltas y descuentos; 07 §3.1).
 *
 *   preview(db, body)          POST /faltas/preview → calcula sin guardar (filas, montos, avisos)
 *   crear(db, body)            POST /faltas         → una falta por CRN, día y sesión, en una transacción
 *   listar(db, query)          GET  /faltas         → quincenaId, docenteId, periodoId, pendientes=true
 *   actualizar(db, id, body)   PUT  /faltas/:id     → recalcula monto y textos
 *   eliminar(db, id)           DELETE /faltas/:id
 *
 * Modo 'tarifa': { docenteId, fechas[], asignaturaIds[] (si se omite se proponen los CRN que el
 *   docente tiene ese día), motivo, horasTexto, cuentaCargo, justificacion, folioImss, observaciones,
 *   ticket, montos: { asignaturaId | 'asignaturaId|fecha' | 'asignaturaId|fecha|sesion': monto }
 *   (gana la clave más específica; la preview devuelve la clave de cada fila en `clave`), contratos: { asignaturaId: '5500001' },
 *   segundasSesiones: [{ asignaturaId, fecha }], confirmarSegundaSesion,
 *   suplencias: [{ asignaturaId, fecha, sesion?, docenteSuplenteId, numContrato? }] }   (HU-10)
 * Modo 'manual': { docenteId, modo: 'manual', asignaturaId?, fechaTexto, dias, horasTexto, monto, comentario?, motivo, … }
 *
 * La falta queda PENDIENTE de reportar (quincena_id NULL) hasta que se genera la quincena.
 */
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');
const { partesFecha, aIso } = require('../lib/quincena');
const { nombreCompleto } = require('../lib/nombres');
const d = require('./descuentoService');
const suplenciaService = require('./suplenciaService');

// ------------------------------------------------------------------ validación común

function catalogo(db, tipo) {
  return db.prepare('SELECT valor FROM catalogos WHERE tipo = ? AND activo = 1 ORDER BY orden').all(tipo).map((c) => c.valor);
}

function deCatalogo(db, v, campo, tipo, valor, { obligatorio = false, porDefecto = null } = {}) {
  const t = v.texto(campo, valor ?? porDefecto, { obligatorio, max: 200 });
  const lista = catalogo(db, tipo);
  if (t && lista.length && !lista.includes(t)) v.error(campo, 'NO_ESTA_EN_CATALOGO');
  return t;
}

function fechaIso(v, campo, valor) {
  const p = partesFecha(valor);
  return p ? aIso(p.anio, p.mes, p.dia) : v.error(campo, 'FECHA_INVALIDA');
}

function monto(v, campo, valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 && n < 1e6 ? d.redondear(n) : v.error(campo, 'VALOR_INVALIDO');
}

/**
 * Campos comunes a los dos modos (motivo, horas, cuenta, justificación, folio, notas).
 * En modo manual las horas son texto libre ('6 horas= 14 días'); en modo tarifa, del catálogo
 * (siempre 8 h = 1 día completo si no se manda).
 * Motivo: si no se manda, sale de la justificación (No justificada / Justificada). El folio solo
 * se pide con incapacidad o cita del IMSS (el viaje escolar no lleva folio).
 */
function comunes(db, v, body, { manual = false } = {}) {
  const justificacion = v.opcion('justificacion', body.justificacion ?? 'ninguna', d.JUSTIFICACIONES);
  const folio = v.texto('folioImss', body.folioImss, { max: 30 });
  if (d.esImss(justificacion) && !folio) v.error('folioImss', 'OBLIGATORIO');
  const motivo = body.motivo === undefined || body.motivo === null || String(body.motivo).trim() === ''
    ? (justificacion ? d.motivoDe(justificacion) : null)
    : deCatalogo(db, v, 'motivo', 'motivo_falta', body.motivo, { obligatorio: true });
  const cuenta = v.texto('cuentaCargo', body.cuentaCargo, { max: 10 });
  if (cuenta && !/^\d{10}$/.test(cuenta)) v.error('cuentaCargo', 'DIEZ_DIGITOS');
  return {
    motivo,
    horasTexto: manual
      ? v.texto('horasTexto', body.horasTexto, { obligatorio: true, max: 60 })
      : deCatalogo(db, v, 'horasTexto', 'horas_falta', body.horasTexto, { porDefecto: d.HORAS_DIA_COMPLETO }),
    cuentaCargo: cuenta,
    justificacion,
    folioImss: d.esImss(justificacion) ? folio : null,
    observaciones: v.texto('observaciones', body.observaciones, { max: 500 }),
    ticket: v.texto('ticket', body.ticket, { max: 50 }),
  };
}

function obtenerDocente(db, id) {
  const doc = db.prepare('SELECT id, nomina, nombres, apellido_paterno, apellido_materno, activo FROM docentes WHERE id = ?').get(Number(id));
  if (!doc) throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  return doc;
}

/** Periodo al que pertenece una fecha: el último que empezó antes o ese día. */
function periodoDeFecha(db, fecha) {
  return db.prepare('SELECT * FROM periodos WHERE fecha_inicio <= ? ORDER BY fecha_inicio DESC LIMIT 1').get(fecha) ?? null;
}

// ------------------------------------------------------------------ modo tarifa

/** Asignaturas del docente con clase ese día de la semana, en el periodo de la fecha. */
function proponerAsignaturas(db, docenteId, fecha) {
  const periodo = periodoDeFecha(db, fecha);
  if (!periodo) return [];
  return db.prepare('SELECT id FROM asignaturas WHERE docente_id = ? AND periodo_id = ? ORDER BY crn IS NULL, crn').all(docenteId, periodo.id)
    .map((x) => d.asignaturaParaFalta(db, x.id))
    .filter((a) => d.sesionesEseDia(a, fecha).length > 0);
}

function validarTarifa(db, body) {
  const v = new Validador();
  const docente = obtenerDocente(db, body.docenteId);
  const fechas = Array.isArray(body.fechas) && body.fechas.length
    ? [...new Set(body.fechas.map((f, i) => fechaIso(v, `fechas[${i}]`, f)))]
    : v.error('fechas', 'OBLIGATORIO') ?? [];
  const c = comunes(db, v, body);
  const montos = body.montos && typeof body.montos === 'object' ? body.montos : {};
  const contratos = body.contratos && typeof body.contratos === 'object' ? body.contratos : {};
  for (const [id, m] of Object.entries(montos)) monto(v, `montos.${id}`, m);
  for (const [id, n] of Object.entries(contratos)) if (!/^\d+$/.test(String(n ?? '').trim())) v.error(`contratos.${id}`, 'SOLO_DIGITOS');
  const ids = Array.isArray(body.asignaturaIds) ? body.asignaturaIds.map(Number) : null;
  const asignaturas = new Map();
  for (const id of ids ?? []) {
    const a = d.asignaturaParaFalta(db, id);
    if (!a || a.docente_id !== docente.id) v.error(`asignaturaIds.${id}`, 'NO_ES_DEL_DOCENTE');
    else asignaturas.set(id, a);
  }
  v.terminar();
  return { docente, fechas, c, montos, contratos, ids, asignaturas };
}

/**
 * Monto editado de una fila: el de la clave más específica que venga en `montos`
 * ('12|2026-08-17|2' → '12|2026-08-17' → '12'), o null si no se editó.
 */
function montoEditadoDe(montos, asignaturaId, fecha, sesion) {
  for (const clave of [`${asignaturaId}|${fecha}|${sesion}`, `${asignaturaId}|${fecha}`, String(asignaturaId)]) {
    if (trae(montos, clave)) return d.redondear(montos[clave]);
  }
  return null;
}

/** Arma las filas (asignatura × fecha × sesión) con su monto y sus avisos. */
function planificarTarifa(db, body) {
  const s = validarTarifa(db, body);
  const filas = [];
  const pares = s.fechas.flatMap((fecha) => (s.ids ? [...s.asignaturas.values()] : proponerAsignaturas(db, s.docente.id, fecha))
    .map((a) => ({ a, fecha, sesion: 1 })));
  for (const x of Array.isArray(body.segundasSesiones) ? body.segundasSesiones : []) {
    const a = s.asignaturas.get(Number(x.asignaturaId)) ?? d.asignaturaParaFalta(db, Number(x.asignaturaId));
    const fecha = partesFecha(x.fecha) ? aIso(...Object.values(partesFecha(x.fecha))) : null;
    if (a && a.docente_id === s.docente.id && fecha) pares.push({ a, fecha, sesion: 2 });
  }
  const existe = db.prepare('SELECT id FROM faltas WHERE docente_id = ? AND asignatura_id = ? AND fecha = ? AND sesion = ?');
  for (const { a, fecha, sesion } of pares) {
    const editado = montoEditadoDe(s.montos, a.id, fecha, sesion);
    const contrato = String(s.contratos[a.id] ?? '').trim() || a.num_contrato;
    const avisos = [];
    const sesiones = d.sesionesEseDia(a, fecha).length;
    if (sesiones === 0) avisos.push('SIN_CLASE_ESE_DIA');
    if (sesion === 2 && sesiones < 2) avisos.push('SEGUNDA_SESION_SIN_HORARIO');
    if (a.crn && !contrato) avisos.push('SIN_CONTRATO');
    if (a.pago_por_dia === null && editado === null) avisos.push('SIN_TARIFA');
    if (existe.get(s.docente.id, a.id, fecha, sesion)) avisos.push('FALTA_REPETIDA');
    filas.push({
      asignatura: a, fecha, sesion, sesionesEseDia: sesiones, contrato, contratoNuevo: contrato !== a.num_contrato,
      ...d.calcularFila(db, a, { justificacion: s.c.justificacion, montoEditado: editado }),
      cuentaCargo: s.c.cuentaCargo ?? d.cuentaPorDefecto(a),
      avisos,
    });
  }
  return { docente: s.docente, modo: 'tarifa', comunes: s.c, filas, propuestas: !s.ids };
}

// ------------------------------------------------------------------ modo manual

function planificarManual(db, body) {
  const v = new Validador();
  const docente = obtenerDocente(db, body.docenteId);
  const c = comunes(db, v, body, { manual: true });
  const fechaTexto = v.texto('fechaTexto', body.fechaTexto, { obligatorio: true, max: 60 });
  const dias = v.entero('dias', body.dias, { min: 1, max: 366, obligatorio: true });
  const m = body.monto === undefined || body.monto === null ? v.error('monto', 'OBLIGATORIO') : monto(v, 'monto', body.monto);
  let a = null;
  if (body.asignaturaId !== undefined && body.asignaturaId !== null) {
    a = d.asignaturaParaFalta(db, Number(body.asignaturaId));
    if (!a || a.docente_id !== docente.id) v.error('asignaturaId', 'NO_ES_DEL_DOCENTE');
  }
  const coment = v.texto('comentario', body.comentario, { max: 300 });
  v.terminar();
  const descuento = c.justificacion === 'ninguna' ? m : 0;
  return {
    docente,
    modo: 'manual',
    comunes: c,
    filas: [{
      asignatura: a, fecha: null, fechaTexto, dias, sesion: 1, contrato: a?.num_contrato ?? null, contratoNuevo: false,
      tarifaAplicada: null, montoDescuento: descuento, montoEditado: true,
      comentario: coment ?? `${c.horasTexto}, a descontar ${d.dinero(m)} = ${d.dinero(m)}`,
      ...d.textosDetalle(db, c.justificacion),
      cuentaCargo: c.cuentaCargo ?? (a ? d.cuentaPorDefecto(a) : d.CUENTA_ACADEMICA),
      avisos: [],
    }],
    propuestas: false,
  };
}

function planificar(db, body = {}) {
  if (body.modo !== undefined && !['tarifa', 'manual'].includes(body.modo)) {
    throw new HttpError(400, 'El modo debe ser "tarifa" o "manual".', 'VALIDACION', [{ campo: 'modo', problema: 'VALOR_INVALIDO' }]);
  }
  return body.modo === 'manual' ? planificarManual(db, body) : planificarTarifa(db, body);
}

// ------------------------------------------------------------------ respuesta

function filaPreview(f) {
  const a = f.asignatura;
  return {
    clave: a && f.fecha ? `${a.id}|${f.fecha}|${f.sesion}` : null, // para editar el monto solo de esta fila
    asignaturaId: a?.id ?? null,
    crn: a?.crn ?? null,
    materia: a ? (a.crn ? a.materia : a.nombre_actividad ?? a.materia) : null,
    numeroGrupo: a?.numero_grupo ?? null,
    horasSemana: a?.horas_semana ?? null,
    fecha: f.fecha,
    fechaTexto: f.fechaTexto ?? null,
    dias: f.dias ?? 1,
    sesion: f.sesion,
    sesionesEseDia: f.sesionesEseDia ?? null,
    contrato: f.contrato ?? null,
    tarifaAplicada: f.tarifaAplicada,
    montoDescuento: f.montoDescuento,
    montoEditado: f.montoEditado,
    comentario: f.comentario,
    cuentaCargo: f.cuentaCargo,
    situacion: f.situacion,
    estatus: f.estatus,
    avisos: f.avisos,
  };
}

function totales(filas) {
  return { filas: filas.length, descuento: d.redondear(filas.reduce((s, f) => s + f.montoDescuento, 0)) };
}

/** POST /faltas/preview: nunca falla por avisos; los regresa para que la pantalla los resuelva. */
function preview(db, body) {
  const plan = planificar(db, body);
  const filas = plan.filas.map(filaPreview);
  const con = (aviso) => filas.filter((f) => f.avisos.includes(aviso)).map((f) => ({ asignaturaId: f.asignaturaId, crn: f.crn, fecha: f.fecha, sesion: f.sesion }));
  return {
    docente: { id: plan.docente.id, nomina: plan.docente.nomina, nombre: nombreDe(plan.docente) },
    modo: plan.modo,
    propuestas: plan.propuestas,
    filas,
    totales: totales(filas),
    sinContrato: con('SIN_CONTRATO'),
    sinTarifa: con('SIN_TARIFA'),
    repetidas: con('FALTA_REPETIDA'),
    segundaSesion: filas.filter((f) => f.sesion === 2).map((f) => ({ asignaturaId: f.asignaturaId, crn: f.crn, fecha: f.fecha })),
  };
}

function nombreDe(doc) {
  return nombreCompleto({ nombres: doc.nombres, apellidoPaterno: doc.apellido_paterno, apellidoMaterno: doc.apellido_materno });
}

// ------------------------------------------------------------------ crear

/** Revisa los avisos que impiden guardar (POST): 400/409 con details por fila. */
function exigirListo(plan, body) {
  if (plan.filas.length === 0) {
    throw new HttpError(400, 'Ese día el docente no tiene clases: elige los CRN de la falta.', 'SIN_GRUPOS_ESE_DIA');
  }
  const detalle = (aviso) => plan.filas.filter((f) => f.avisos.includes(aviso))
    .map((f) => ({ asignaturaId: f.asignatura?.id ?? null, crn: f.asignatura?.crn ?? null, fecha: f.fecha, sesion: f.sesion }));
  const repetidas = detalle('FALTA_REPETIDA');
  if (repetidas.length) throw new HttpError(409, 'Ya hay una falta registrada para ese CRN, día y sesión.', 'FALTA_REPETIDA', repetidas);
  if (plan.filas.some((f) => f.sesion === 2) && body.confirmarSegundaSesion !== true) {
    throw new HttpError(409, 'Registrar la 2ª sesión del mismo CRN y día es un caso especial: confirma para continuar.', 'CONFIRMAR_SEGUNDA_SESION', detalle('SEGUNDA_SESION_SIN_HORARIO'));
  }
  const sinTarifa = detalle('SIN_TARIFA');
  if (sinTarifa.length) throw new HttpError(400, 'Hay CRN sin tarifa: captura el monto en "montos".', 'SIN_TARIFA', sinTarifa);
  const sinContrato = detalle('SIN_CONTRATO');
  if (sinContrato.length) throw new HttpError(400, 'Captura el contrato de estos CRN en "contratos".', 'SIN_CONTRATO', sinContrato);
}

function insertarFila(db, plan, f) {
  const c = plan.comunes;
  return Number(db.prepare(`INSERT INTO faltas (docente_id, asignatura_id, fecha, sesion, fecha_texto, dias, motivo, horas_texto,
                              cuenta_cargo, justificacion, folio_imss, modo_calculo, tarifa_aplicada, monto_descuento, monto_editado,
                              comentario, ticket, situacion, estatus, observaciones)
                            VALUES (@docente, @asignatura, @fecha, @sesion, @fechaTexto, @dias, @motivo, @horasTexto, @cuentaCargo,
                              @justificacion, @folioImss, @modo, @tarifa, @monto, @editado, @comentario, @ticket, @situacion, @estatus, @observaciones)`)
    .run({
      docente: plan.docente.id, asignatura: f.asignatura?.id ?? null, fecha: f.fecha, sesion: f.sesion, fechaTexto: f.fechaTexto ?? null,
      dias: f.dias ?? 1, motivo: c.motivo, horasTexto: c.horasTexto, cuentaCargo: f.cuentaCargo, justificacion: c.justificacion,
      folioImss: c.folioImss, modo: plan.modo, tarifa: f.tarifaAplicada, monto: f.montoDescuento, editado: f.montoEditado ? 1 : 0,
      comentario: f.comentario, ticket: c.ticket, situacion: f.situacion, estatus: f.estatus, observaciones: c.observaciones,
    }).lastInsertRowid);
}

/** POST /faltas → { faltas, totales } */
function crear(db, body = {}) {
  const plan = planificar(db, body);
  exigirListo(plan, body);
  const avisos = [];
  const ids = db.transaction(() => {
    const guardarContrato = db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE id = ?');
    for (const f of plan.filas) if (f.contratoNuevo && f.contrato) guardarContrato.run(f.contrato, f.asignatura.id);
    const creadas = plan.filas.map((f) => ({ f, id: insertarFila(db, plan, f) }));
    for (const [i, s] of (Array.isArray(body.suplencias) ? body.suplencias : []).entries()) {
      const destino = creadas.find((c) => c.f.asignatura?.id === Number(s.asignaturaId)
        && (plan.modo === 'manual' || c.f.fecha === s.fecha) && c.f.sesion === Number(s.sesion ?? 1));
      if (!destino) throw new HttpError(400, 'Una suplencia no corresponde a ninguna de las faltas.', 'SUPLENCIA_SIN_FALTA', [{ indice: i, asignaturaId: s.asignaturaId, fecha: s.fecha }]);
      avisos.push(...suplenciaService.asignar(db, destino.id, s).avisos.map((a) => ({ faltaId: destino.id, aviso: a })));
    }
    return creadas.map((c) => c.id);
  })();
  const faltas = ids.map((id) => obtener(db, id));
  return { faltas, totales: totales(faltas), avisos };
}

// ------------------------------------------------------------------ consultar

const SELECT_FALTA = `
  SELECT f.*, dc.nomina, dc.nombres, dc.apellido_paterno, dc.apellido_materno,
         a.crn, a.nombre_actividad, a.materia, a.numero_grupo, a.num_contrato, a.periodo_id,
         q.anio AS q_anio, q.numero AS q_numero, q.cerrada AS q_cerrada,
         s.id AS suplencia_id, s.docente_suplente_id, s.monto AS suplencia_monto, s.incidencia_id, inc.num_contrato AS suplencia_contrato,
         ds.nombres AS s_nombres, ds.apellido_paterno AS s_paterno, ds.apellido_materno AS s_materno
  FROM faltas f
  JOIN docentes dc ON dc.id = f.docente_id
  LEFT JOIN asignaturas a ON a.id = f.asignatura_id
  LEFT JOIN quincenas q ON q.id = f.quincena_id
  LEFT JOIN suplencias s ON s.falta_id = f.id
  LEFT JOIN docentes ds ON ds.id = s.docente_suplente_id
  LEFT JOIN incidencias inc ON inc.id = s.incidencia_id`;

function aRespuesta(r) {
  return {
    id: r.id,
    docente: { id: r.docente_id, nomina: r.nomina, nombre: nombreCompleto({ nombres: r.nombres, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno }) },
    asignatura: r.asignatura_id ? { id: r.asignatura_id, crn: r.crn, materia: r.crn ? r.materia : r.nombre_actividad ?? r.materia, numeroGrupo: r.numero_grupo, contrato: r.num_contrato } : null,
    fecha: r.fecha,
    fechaTexto: r.fecha_texto,
    sesion: r.sesion,
    dias: r.dias,
    motivo: r.motivo,
    horasTexto: r.horas_texto,
    cuentaCargo: r.cuenta_cargo,
    justificacion: r.justificacion,
    folioImss: r.folio_imss,
    modo: r.modo_calculo,
    tarifaAplicada: r.tarifa_aplicada,
    montoDescuento: r.monto_descuento,
    montoEditado: r.monto_editado === 1,
    comentario: r.comentario,
    ticket: r.ticket,
    situacion: r.situacion,
    estatus: r.estatus,
    observaciones: r.observaciones,
    quincena: r.quincena_id ? { id: r.quincena_id, anio: r.q_anio, numero: r.q_numero, etiqueta: `Q${r.q_numero}`, cerrada: r.q_cerrada === 1 } : null,
    pendiente: r.quincena_id === null,
    suplencia: r.suplencia_id
      ? { id: r.suplencia_id, docenteSuplenteId: r.docente_suplente_id, monto: r.suplencia_monto, incidenciaId: r.incidencia_id, numContrato: r.suplencia_contrato,
        suplente: nombreCompleto({ nombres: r.s_nombres, apellidoPaterno: r.s_paterno, apellidoMaterno: r.s_materno }) }
      : null,
    creadoEn: r.creado_en,
  };
}

function obtener(db, id) {
  const r = db.prepare(`${SELECT_FALTA} WHERE f.id = ?`).get(Number(id));
  if (!r) throw new HttpError(404, 'Esa falta no existe.', 'FALTA_NO_EXISTE');
  return aRespuesta(r);
}

/** GET /faltas?quincenaId=&docenteId=&periodoId=&pendientes=true */
function listar(db, query = {}) {
  const v = new Validador();
  const quincenaId = v.entero('quincenaId', query.quincenaId, { min: 1 });
  const docenteId = v.entero('docenteId', query.docenteId, { min: 1 });
  const periodoId = v.entero('periodoId', query.periodoId, { min: 1 });
  v.terminar();
  const pendientes = query.pendientes === 'true' || query.pendientes === true;
  const periodo = periodoId ? db.prepare('SELECT * FROM periodos WHERE id = ?').get(periodoId) : null;
  const filas = db.prepare(`${SELECT_FALTA}
    WHERE (@quincena IS NULL OR f.quincena_id = @quincena)
      AND (@docente IS NULL OR f.docente_id = @docente)
      AND (@pendientes = 0 OR f.quincena_id IS NULL)
      AND (@periodo IS NULL OR a.periodo_id = @periodo OR (f.fecha >= @inicio AND (@fin IS NULL OR f.fecha <= @fin)))
    ORDER BY f.fecha IS NULL, f.fecha DESC, dc.apellido_paterno, a.crn, f.sesion, f.id`)
    .all({
      quincena: quincenaId, docente: docenteId, pendientes: pendientes ? 1 : 0,
      periodo: periodoId, inicio: periodo?.fecha_inicio ?? '', fin: periodo?.fecha_fin ?? null,
    }).map(aRespuesta);
  return { faltas: filas, totales: totales(filas) };
}

// ------------------------------------------------------------------ editar y borrar

function filaBd(db, id) {
  const f = db.prepare(`SELECT f.*, q.cerrada FROM faltas f LEFT JOIN quincenas q ON q.id = f.quincena_id WHERE f.id = ?`).get(Number(id));
  if (!f) throw new HttpError(404, 'Esa falta no existe.', 'FALTA_NO_EXISTE');
  if (f.cerrada === 1) throw new HttpError(423, 'Esa falta ya se reportó en una quincena cerrada; reabre la quincena para cambiarla.', 'QUINCENA_CERRADA');
  return f;
}

/** Valida los cambios de PUT /faltas/:id (parcial). */
function cambios(db, body, actual) {
  const v = new Validador();
  const c = {};
  if (trae(body, 'motivo')) c.motivo = deCatalogo(db, v, 'motivo', 'motivo_falta', body.motivo, { obligatorio: true });
  if (trae(body, 'horasTexto')) {
    c.horas_texto = actual.modo_calculo === 'manual'
      ? v.texto('horasTexto', body.horasTexto, { obligatorio: true, max: 60 })
      : deCatalogo(db, v, 'horasTexto', 'horas_falta', body.horasTexto, { obligatorio: true });
  }
  if (trae(body, 'cuentaCargo')) {
    c.cuenta_cargo = v.texto('cuentaCargo', body.cuentaCargo, { obligatorio: true, max: 10 });
    if (c.cuenta_cargo && !/^\d{10}$/.test(c.cuenta_cargo)) v.error('cuentaCargo', 'DIEZ_DIGITOS');
  }
  if (trae(body, 'justificacion')) c.justificacion = v.opcion('justificacion', body.justificacion, d.JUSTIFICACIONES, { obligatorio: true });
  if (trae(body, 'folioImss')) c.folio_imss = v.texto('folioImss', body.folioImss, { max: 30 });
  if (trae(body, 'observaciones')) c.observaciones = v.texto('observaciones', body.observaciones, { max: 500 });
  if (trae(body, 'ticket')) c.ticket = v.texto('ticket', body.ticket, { max: 50 });
  if (trae(body, 'monto')) c.monto = monto(v, 'monto', body.monto);
  if (actual.modo_calculo === 'manual') {
    if (trae(body, 'fechaTexto')) c.fecha_texto = v.texto('fechaTexto', body.fechaTexto, { obligatorio: true, max: 60 });
    if (trae(body, 'dias')) c.dias = v.entero('dias', body.dias, { min: 1, max: 366, obligatorio: true });
    if (trae(body, 'comentario')) c.comentario = v.texto('comentario', body.comentario, { max: 300 });
  }
  const justificacion = c.justificacion ?? actual.justificacion;
  const folio = trae(body, 'folioImss') ? c.folio_imss : actual.folio_imss;
  if (d.esImss(justificacion) && !folio) v.error('folioImss', 'OBLIGATORIO');
  if (!d.esImss(justificacion)) c.folio_imss = null;
  // Si cambió de No justificada a Justificada (o al revés) y no se mandó motivo, se ajusta solo
  if (!trae(body, 'motivo') && c.justificacion && (c.justificacion === 'ninguna') !== (actual.justificacion === 'ninguna')) {
    c.motivo = d.motivoDe(c.justificacion);
  }
  v.terminar();
  return c;
}

/** Recalcula monto, comentario y textos de Detalle con los cambios. */
function recalcular(db, actual, c, body) {
  const justificacion = c.justificacion ?? actual.justificacion;
  const r = { ...d.textosDetalle(db, justificacion) };
  if (actual.modo_calculo === 'manual') {
    const base = c.monto ?? (actual.justificacion === 'ninguna' ? actual.monto_descuento : actual.tarifa_aplicada ?? actual.monto_descuento);
    r.monto_descuento = justificacion === 'ninguna' ? base : 0;
    r.monto_editado = 1;
    return r;
  }
  const a = d.asignaturaParaFalta(db, actual.asignatura_id);
  const fila = { ...a, pago_por_dia: actual.tarifa_aplicada }; // la tarifa del momento de la falta, no la de hoy
  const editado = body.restaurarMonto === true ? null : c.monto ?? (actual.monto_editado ? actual.monto_descuento : null);
  const calc = d.calcularFila(db, fila, { justificacion, montoEditado: editado });
  return { ...r, monto_descuento: calc.montoDescuento, monto_editado: calc.montoEditado ? 1 : 0, comentario: calc.comentario };
}

/** PUT /faltas/:id → { falta } */
function actualizar(db, id, body = {}) {
  const actual = filaBd(db, id);
  const c = cambios(db, body, actual);
  const r = recalcular(db, actual, c, body);
  const { monto: _m, ...columnas } = c;
  const todo = { ...columnas, ...r };
  db.transaction(() => {
    db.prepare(`UPDATE faltas SET ${Object.keys(todo).map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...todo, id: actual.id });
    suplenciaService.sincronizarFalta(db, actual.id); // el suplente cobra lo nuevo (HU-10)
  })();
  return obtener(db, actual.id);
}

/** DELETE /faltas/:id: borra la falta, su suplencia y ajusta o borra la incidencia del suplente. */
function eliminar(db, id) {
  const actual = filaBd(db, id);
  db.transaction(() => {
    suplenciaService.quitar(db, actual.id);
    db.prepare('DELETE FROM faltas WHERE id = ?').run(actual.id);
  })();
}

/** PUT /faltas/:id/suplencia → { suplencia, avisos } (423 si la quincena está cerrada). */
function asignarSuplencia(db, id, body = {}) {
  const actual = filaBd(db, id);
  return suplenciaService.asignar(db, actual.id, body);
}

/** DELETE /faltas/:id/suplencia */
function quitarSuplencia(db, id) {
  const actual = filaBd(db, id);
  if (!db.transaction(() => suplenciaService.quitar(db, actual.id))()) {
    throw new HttpError(404, 'Esa falta no tiene suplencia.', 'SIN_SUPLENCIA');
  }
}

module.exports = { preview, crear, listar, obtener, actualizar, eliminar, asignarSuplencia, quitarSuplencia, periodoDeFecha };
