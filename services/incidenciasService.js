/**
 * Pagos adicionales de la quincena (HU-11; 06 §Incidencias; 07 §4.1).
 * Tutoreo, PAD, coach, talleres… van a la hoja Incidencia del Excel de Nacional.
 *
 *   listar(db, query)         GET    /incidencias?quincenaId=&origen=&pendientes=true  (en el orden del Excel)
 *   crear(db, body)           POST   /incidencias
 *   actualizar(db, id, body)  PUT    /incidencias/:id
 *   eliminar(db, id)          DELETE /incidencias/:id
 *   copiar(db, body)          POST   /incidencias/copiar  { desdeQuincenaId, haciaQuincenaId }
 *   reordenar(db, body)       PATCH  /incidencias/orden   { ids: [..] }
 *
 * importe por periodo = importe total ÷ número de periodos (en el Excel queda como fórmula).
 * Las incidencias de origen 'suplencia' las genera la falta (HU-10): aquí no se editan ni se borran.
 * Una quincena cerrada no permite cambios (423).
 */
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');
const { partesFecha, aIso } = require('../lib/quincena');
const { nombreCompleto } = require('../lib/nombres');

const redondear = (n) => Math.round(Number(n) * 100) / 100;

function catalogo(db, tipo) {
  return db.prepare('SELECT valor FROM catalogos WHERE tipo = ? AND activo = 1').all(tipo).map((c) => c.valor);
}

function deCatalogo(db, v, campo, tipo, valor, obligatorio) {
  const t = v.texto(campo, valor, { obligatorio, max: 200 });
  const lista = catalogo(db, tipo);
  if (t && lista.length && !lista.includes(t)) v.error(campo, 'NO_ESTA_EN_CATALOGO');
  return t;
}

function quincena(db, id) {
  const q = db.prepare('SELECT * FROM quincenas WHERE id = ?').get(Number(id));
  if (!q) throw new HttpError(404, 'Esa quincena no existe.', 'QUINCENA_NO_EXISTE');
  return q;
}

function noCerrada(q) {
  if (q?.cerrada === 1) throw new HttpError(423, `La quincena Q${q.numero} está cerrada; reábrela para cambiarla.`, 'QUINCENA_CERRADA');
}

// ------------------------------------------------------------------ validación

/** Campos editables (parcial = solo los que vienen en el cuerpo). */
function columnas(db, body, parcial) {
  const v = new Validador();
  const c = {};
  const usar = (k) => !parcial || trae(body, k);
  if (usar('docenteId')) {
    const id = v.entero('docenteId', body.docenteId, { min: 1, obligatorio: true });
    if (id && !db.prepare('SELECT 1 FROM docentes WHERE id = ?').get(id)) v.error('docenteId', 'NO_EXISTE');
    c.docente_id = id;
  }
  if (usar('numContrato')) {
    c.num_contrato = v.texto('numContrato', body.numContrato, { max: 15 });
    if (c.num_contrato && !/^\d+$/.test(c.num_contrato)) v.error('numContrato', 'SOLO_DIGITOS');
  }
  if (usar('tipoContrato')) c.tipo_contrato = v.texto('tipoContrato', body.tipoContrato, { max: 30 }) ?? 'determinado';
  if (usar('ccNomina')) c.cc_nomina = deCatalogo(db, v, 'ccNomina', 'cc_nomina', body.ccNomina, true);
  if (usar('motivo')) c.motivo = deCatalogo(db, v, 'motivo', 'motivo_incidencia', body.motivo, true);
  if (usar('detalle')) c.detalle = v.texto('detalle', body.detalle, { obligatorio: true, max: 500 });
  if (usar('ceco')) {
    c.ceco = v.texto('ceco', body.ceco, { obligatorio: true, max: 10 });
    if (c.ceco && !/^\d{10}$/.test(c.ceco)) v.error('ceco', 'DIEZ_CARACTERES');
  }
  if (usar('elementoPep')) c.elemento_pep = v.texto('elementoPep', body.elementoPep, { max: 24 });
  if (usar('ordenInterna')) c.orden_interna = v.texto('ordenInterna', body.ordenInterna, { max: 12 });
  if (usar('importeTotal')) {
    const n = Number(body.importeTotal);
    c.importe_total = Number.isFinite(n) && n > 0 && n < 1e7 ? redondear(n) : v.error('importeTotal', 'VALOR_INVALIDO');
  }
  if (usar('numPeriodos')) c.num_periodos = v.entero('numPeriodos', body.numPeriodos ?? 1, { min: 1, max: 24 });
  if (usar('aPartirDe') && body.aPartirDe) {
    const p = partesFecha(body.aPartirDe);
    c.a_partir_de = p ? aIso(p.anio, p.mes, p.dia) : v.error('aPartirDe', 'FECHA_INVALIDA');
  }
  if (usar('quincenaId') && body.quincenaId !== undefined) {
    c.quincena_id = body.quincenaId === null ? null : v.entero('quincenaId', body.quincenaId, { min: 1 });
  }
  v.terminar();
  return c;
}

/** Al asignar quincena, la fecha de inicio (col. N) es su fecha de pago, salvo que se capture otra. */
function conQuincena(db, c, body) {
  if (c.quincena_id) {
    const q = quincena(db, c.quincena_id);
    noCerrada(q);
    if (!body.aPartirDe) c.a_partir_de = q.fecha_pago;
  }
  return c;
}

// ------------------------------------------------------------------ respuesta

const SELECT = `
  SELECT i.*, d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno, q.numero AS q_numero, q.cerrada AS q_cerrada
  FROM incidencias i JOIN docentes d ON d.id = i.docente_id LEFT JOIN quincenas q ON q.id = i.quincena_id`;

function aRespuesta(r) {
  return {
    id: r.id,
    docente: { id: r.docente_id, nomina: r.nomina, nombre: nombreCompleto({ nombres: r.nombres, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno }) },
    numContrato: r.num_contrato,
    tipoContrato: r.tipo_contrato,
    ccNomina: r.cc_nomina,
    motivo: r.motivo,
    detalle: r.detalle,
    ceco: r.ceco,
    elementoPep: r.elemento_pep,
    ordenInterna: r.orden_interna,
    importeTotal: r.importe_total,
    numPeriodos: r.num_periodos,
    importePorPeriodo: redondear(r.importe_total / r.num_periodos),
    aPartirDe: r.a_partir_de,
    quincena: r.quincena_id ? { id: r.quincena_id, etiqueta: `Q${r.q_numero}`, cerrada: r.q_cerrada === 1 } : null,
    pendiente: r.quincena_id === null,
    origen: r.origen,
    editable: r.origen === 'manual' && r.q_cerrada !== 1,
    orden: r.orden,
  };
}

function obtener(db, id) {
  const r = db.prepare(`${SELECT} WHERE i.id = ?`).get(Number(id));
  if (!r) throw new HttpError(404, 'Esa incidencia no existe.', 'INCIDENCIA_NO_EXISTE');
  return aRespuesta(r);
}

function listar(db, query = {}) {
  const v = new Validador();
  const quincenaId = v.entero('quincenaId', query.quincenaId, { min: 1 });
  const origen = v.opcion('origen', query.origen, ['manual', 'suplencia']);
  v.terminar();
  const pendientes = query.pendientes === 'true' ? 1 : 0;
  const filas = db.prepare(`${SELECT}
    WHERE (@q IS NULL OR i.quincena_id = @q) AND (@origen IS NULL OR i.origen = @origen) AND (@pend = 0 OR i.quincena_id IS NULL)
    ORDER BY i.orden, i.id`).all({ q: quincenaId, origen, pend: pendientes }).map(aRespuesta);
  return { incidencias: filas, totales: { filas: filas.length, importe: redondear(filas.reduce((s, f) => s + f.importeTotal, 0)) } };
}

// ------------------------------------------------------------------ escribir

function siguienteOrden(db) {
  return db.prepare('SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM incidencias').get().n;
}

function crear(db, body = {}) {
  const c = conQuincena(db, columnas(db, body, false), body);
  if (!body.tipoContrato) c.tipo_contrato = db.prepare('SELECT tipo_contrato FROM docentes WHERE id = ?').get(c.docente_id)?.tipo_contrato ?? 'determinado';
  const datos = { ...c, origen: 'manual', orden: siguienteOrden(db) };
  const cols = Object.keys(datos);
  const id = db.prepare(`INSERT INTO incidencias (${cols.join(', ')}) VALUES (${cols.map((k) => `@${k}`).join(', ')})`).run(datos).lastInsertRowid;
  return obtener(db, id);
}

function editable(db, id) {
  const r = db.prepare('SELECT i.*, q.cerrada, q.numero FROM incidencias i LEFT JOIN quincenas q ON q.id = i.quincena_id WHERE i.id = ?').get(Number(id));
  if (!r) throw new HttpError(404, 'Esa incidencia no existe.', 'INCIDENCIA_NO_EXISTE');
  if (r.origen === 'suplencia') throw new HttpError(409, 'Esta incidencia es de una suplencia: se cambia desde la falta.', 'INCIDENCIA_DE_SUPLENCIA');
  noCerrada(r.cerrada === 1 ? r : null);
  return r;
}

function actualizar(db, id, body = {}) {
  editable(db, id);
  const c = conQuincena(db, columnas(db, body, true), body);
  const cols = Object.keys(c);
  if (cols.length) db.prepare(`UPDATE incidencias SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...c, id: Number(id) });
  return obtener(db, id);
}

function eliminar(db, id) {
  editable(db, id);
  db.prepare('DELETE FROM incidencias WHERE id = ?').run(Number(id));
}

/**
 * Copia los pagos MANUALES de una quincena a otra (las suplencias no se copian).
 * No duplica: se salta los que ya existen en la quincena destino con el mismo docente, motivo, detalle e importe.
 */
function copiar(db, body = {}) {
  const v = new Validador();
  const desde = v.entero('desdeQuincenaId', body.desdeQuincenaId, { min: 1, obligatorio: true });
  const hacia = v.entero('haciaQuincenaId', body.haciaQuincenaId, { min: 1, obligatorio: true });
  if (desde && desde === hacia) v.error('haciaQuincenaId', 'IGUAL_A_ORIGEN');
  v.terminar();
  quincena(db, desde);
  const destino = quincena(db, hacia);
  noCerrada(destino);
  const origen = db.prepare("SELECT * FROM incidencias WHERE quincena_id = ? AND origen = 'manual' ORDER BY orden, id").all(desde);
  const existe = db.prepare(`SELECT 1 FROM incidencias WHERE quincena_id = ? AND docente_id = ? AND motivo = ? AND detalle = ? AND importe_total = ?`);
  const insertar = db.prepare(`INSERT INTO incidencias (quincena_id, docente_id, num_contrato, tipo_contrato, cc_nomina, motivo, detalle, ceco,
                                 elemento_pep, orden_interna, importe_total, num_periodos, a_partir_de, origen, orden)
                               VALUES (@q, @docente_id, @num_contrato, @tipo_contrato, @cc_nomina, @motivo, @detalle, @ceco,
                                 @elemento_pep, @orden_interna, @importe_total, @num_periodos, @a_partir_de, 'manual', @orden)`);
  const ids = db.transaction(() => origen
    .filter((i) => !existe.get(hacia, i.docente_id, i.motivo, i.detalle, i.importe_total))
    .map((i) => Number(insertar.run({ ...i, q: hacia, a_partir_de: destino.fecha_pago, orden: siguienteOrden(db) }).lastInsertRowid)))();
  return { copiadas: ids.length, omitidas: origen.length - ids.length, incidencias: ids.map((id) => obtener(db, id)) };
}

/** PATCH /incidencias/orden { ids: [..] } → el orden de las filas en el Excel. */
function reordenar(db, body = {}) {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
  if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'Manda "ids" con los ids de las incidencias en el orden deseado.', 'VALIDACION', [{ campo: 'ids', problema: 'VALOR_INVALIDO' }]);
  }
  const faltan = ids.filter((id) => !db.prepare('SELECT 1 FROM incidencias WHERE id = ?').get(id));
  if (faltan.length) throw new HttpError(404, 'Hay incidencias que no existen.', 'INCIDENCIA_NO_EXISTE', faltan.map((id) => ({ id })));
  const actualizar = db.prepare('UPDATE incidencias SET orden = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => actualizar.run(i + 1, id)))();
  return { orden: ids };
}

module.exports = { listar, obtener, crear, actualizar, eliminar, copiar, reordenar };
