/**
 * Envío de los reportes de Nacional por correo (HU-25; 06 §Reportes · POST /reportes/enviar, GET /reportes/envios;
 * 07 §10).
 *
 *   preparar(db, body) → { modo, quincena, para, cc, cco, asunto, cuerpo, archivos, eml? (Buffer), mailto? }
 *     body = { quincenaId, modo?: 'borrador'|'mailto', para?, cc?, cco?, asunto?, cuerpo?, excluir?, excluirIncidencias? }
 *     - lo que no venga se toma de Configuración → Correo (correo.*)
 *     - valida los 2 reportes: con avisos rojos responde 400 AVISOS_ROJOS y no genera nada
 *     - genera los 2 Excel (asigna los pendientes a la quincena, igual que al descargarlos)
 *     - borrador → .eml con X-Unsent: 1 y los 2 adjuntos · mailto → enlace mailto: + URLs de los 2 archivos
 *     - registra el envío en la bitácora (envios_correo)
 *   vistaPrevia(db, query) → { para, cc, cco, asunto, cuerpo, modo, archivos, rojos } SIN generar ni asignar nada:
 *     lo que llevaría el correo con las variables ya sustituidas (para mostrarlo antes de enviar)
 *   envios(db, { quincenaId? }) → { envios: [...] } (más recientes primero)
 *
 * Variables del asunto y del cuerpo: {quincena} {periodo} {fecha_pago} {total_descontado} {num_faltas} {num_pagos}.
 */
const { HttpError } = require('../lib/errores');
const eml = require('../lib/correo/eml');
const configuracion = require('./configuracionService');
const reportes = require('./reporteService');

const XLSX_TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Avisos que impiden enviar (rojos). Los demás (IMSS solo en detalle, monto editado) son informativos. */
const ROJOS = new Set([
  'SIN_CONTRATO', 'SIN_TARIFA', 'MONTO_CERO',
  'SUPLENTE_SIN_CONTRATO', 'CECO_INVALIDO', 'PEP_MAYOR_A_24', 'ORDEN_INTERNA_MAYOR_A_12', 'IMPORTE_CERO',
]);

const ids = (v) => new Set(String(v ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0));
const dinero = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ddmmaaaa = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function textoPeriodo(q) {
  const [ai, mi, di] = q.fechaInicio.split('-').map(Number);
  const [af, mf, df] = q.fechaFin.split('-').map(Number);
  if (ai === af && mi === mf) return `${di}–${df} ${MESES[mi - 1]} ${ai}`;
  return `${di} ${MESES[mi - 1]}${ai === af ? '' : ` ${ai}`} – ${df} ${MESES[mf - 1]} ${af}`;
}

function sustituir(plantilla, variables) {
  return String(plantilla ?? '').replace(/\{(\w+)\}/g, (todo, k) => (k in variables ? String(variables[k]) : todo));
}

/** Destinatarios, asunto y cuerpo: lo que manda la pantalla o lo de Configuración. Valida con las mismas reglas. */
function datosDelCorreo(db, body) {
  const cfg = configuracion.listar(db);
  const details = [];
  const tomar = (campo, clave, validar) => {
    const valor = body[campo] !== undefined ? body[campo] : cfg[clave];
    const r = validar(valor);
    if (['OBLIGATORIO', 'FORMATO', 'MUY_LARGO', 'VALOR_INVALIDO'].includes(r)) details.push({ campo, problema: r });
    return r;
  };
  const modo = tomar('modo', 'correo.modo', (v) => (['borrador', 'mailto'].includes(v) ? v : 'VALOR_INVALIDO'));
  const para = tomar('para', 'correo.para', (v) => configuracion.listaCorreos(v, { obligatorio: true }));
  const cc = tomar('cc', 'correo.cc', (v) => configuracion.listaCorreos(v));
  const cco = tomar('cco', 'correo.cco', (v) => configuracion.listaCorreos(v));
  const asunto = tomar('asunto', 'correo.asunto', (v) => {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return 'OBLIGATORIO';
    return t.length > 200 ? 'MUY_LARGO' : t;
  });
  const cuerpo = tomar('cuerpo', 'correo.cuerpo', (v) => (String(v ?? '').length > 5000 ? 'MUY_LARGO' : String(v ?? '')));
  if (details.length) throw new HttpError(400, 'Revisa los datos del correo.', 'VALIDACION', details);
  return { modo, para, cc, cco, asunto, cuerpo };
}

/** Avisos rojos de lo que entraría en los 2 reportes (sin contar lo excluido). */
function avisosRojos(db, quincenaId, body) {
  const fueraFaltas = ids(body.excluir);
  const fueraIncidencias = ids(body.excluirIncidencias);
  const desc = reportes.validarDescuentos(db, quincenaId);
  const inc = reportes.validarIncidencias(db, quincenaId);
  return [
    ...desc.avisos.filter((a) => ROJOS.has(a.tipo) && !fueraFaltas.has(a.faltaId)).map((a) => ({ reporte: 'descuentos', ...a })),
    ...inc.avisos.filter((a) => ROJOS.has(a.tipo) && !fueraIncidencias.has(a.incidenciaId)).map((a) => ({ reporte: 'incidencias', ...a })),
  ];
}

function registrar(db, q, correo, archivos, resultado, error = null) {
  return Number(db.prepare(`INSERT INTO envios_correo (quincena_id, reportes, modo, para, cc, cco, asunto, resultado, detalle_error)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(q.id, JSON.stringify(archivos), correo.modo, correo.para, correo.cc || null, correo.cco || null, correo.asunto, resultado, error)
    .lastInsertRowid);
}

/** Variables del asunto y del cuerpo a partir de lo que entraría (respeta lo excluido). */
function variablesDe(q, filasDescuento, incidencias) {
  return {
    quincena: `Q${q.numero}`,
    periodo: textoPeriodo(q),
    fecha_pago: ddmmaaaa(q.fechaPago),
    total_descontado: dinero(filasDescuento.reduce((s, f) => s + f.monto, 0)),
    num_faltas: filasDescuento.length,
    num_pagos: incidencias.length,
  };
}

/** GET /reportes/enviar/vista-previa?quincenaId=&excluir=&excluirIncidencias=&para=&cc=&cco=&asunto=&cuerpo= */
function vistaPrevia(db, query = {}) {
  if (!query.quincenaId) throw new HttpError(400, 'Indica la quincena (quincenaId).', 'VALIDACION', [{ campo: 'quincenaId', problema: 'OBLIGATORIO' }]);
  const desc = reportes.validarDescuentos(db, query.quincenaId);
  const inc = reportes.validarIncidencias(db, query.quincenaId);
  const q = desc.quincena;
  const fueraFaltas = ids(query.excluir);
  const fueraInc = ids(query.excluirIncidencias);
  const filas = desc.filas.filter((f) => f.vaEnDescuentos && !fueraFaltas.has(f.faltaId));
  const pagos = inc.incidencias.filter((i) => !fueraInc.has(i.id));
  const cfg = configuracion.listar(db);
  const campo = (k) => (query[k] !== undefined ? query[k] : cfg[`correo.${k}`]);
  const variables = variablesDe(q, filas, pagos);
  return {
    quincena: q,
    modo: cfg['correo.modo'],
    para: eml.lista(campo('para')),
    cc: eml.lista(campo('cc')),
    cco: eml.lista(campo('cco')),
    plantilla: { asunto: campo('asunto'), cuerpo: campo('cuerpo') },
    asunto: sustituir(campo('asunto'), variables),
    cuerpo: sustituir(campo('cuerpo'), variables),
    variables,
    archivos: [`DESCUENTO-PREPA Q${q.numero}.xlsx`, `INCIDENCIAS PREPA Q${q.numero}.xlsx`],
    rojos: avisosRojos(db, query.quincenaId, query),
  };
}

/** POST /reportes/enviar */
async function preparar(db, body = {}) {
  if (!body.quincenaId) throw new HttpError(400, 'Indica la quincena (quincenaId).', 'VALIDACION', [{ campo: 'quincenaId', problema: 'OBLIGATORIO' }]);
  const correo = datosDelCorreo(db, body);
  const rojos = avisosRojos(db, body.quincenaId, body);
  if (rojos.length) {
    throw new HttpError(400, 'Hay avisos que corregir antes de enviar los reportes.', 'AVISOS_ROJOS', rojos);
  }

  const desc = await reportes.generarDescuentos(db, body.quincenaId, body.excluir);
  const inc = await reportes.generarIncidencias(db, body.quincenaId, body.excluir, body.excluirIncidencias);
  const q = reportes.validarDescuentos(db, body.quincenaId).quincena;
  const variables = variablesDe(q, desc.filas, inc.incidencias);
  const asunto = sustituir(correo.asunto, variables);
  const cuerpo = sustituir(correo.cuerpo, variables);
  const archivos = [desc.nombre, inc.nombre];
  const datos = { ...correo, asunto, cuerpo };

  if (correo.modo === 'borrador') {
    const contenido = eml.construir({
      para: correo.para, cc: correo.cc, cco: correo.cco, asunto, cuerpo,
      adjuntos: [desc, inc].map((r) => ({ nombre: r.nombre, contenido: r.buffer, tipo: XLSX_TIPO })),
    });
    const envioId = registrar(db, q, datos, archivos, 'borrador_generado');
    return { modo: 'borrador', envioId, quincena: q, nombre: `Reportes PREPA Q${q.numero}.eml`, eml: contenido, archivos, asunto, cuerpo };
  }
  const envioId = registrar(db, q, datos, archivos, 'mailto_abierto');
  return {
    modo: 'mailto',
    envioId,
    quincena: q,
    mailto: eml.mailto({ para: correo.para, cc: correo.cc, cco: correo.cco, asunto, cuerpo }),
    archivos: [
      { nombre: desc.nombre, url: `/api/reportes/descuentos?quincenaId=${q.id}` },
      { nombre: inc.nombre, url: `/api/reportes/incidencias?quincenaId=${q.id}` },
    ],
    asunto,
    cuerpo,
  };
}

/** Si algo falla al generar, queda en la bitácora como error (y el error sigue su camino). */
async function enviar(db, body = {}) {
  try {
    return await preparar(db, body);
  } catch (e) {
    if (e instanceof HttpError && e.status < 500) throw e;
    try {
      const q = reportes.validarDescuentos(db, body.quincenaId).quincena;
      const correo = datosDelCorreo(db, body);
      registrar(db, q, correo, [], 'error', String(e.message ?? e).slice(0, 500));
    } catch { /* sin quincena o datos válidos no hay qué registrar */ }
    throw e;
  }
}

/** GET /reportes/envios?quincenaId= */
function envios(db, query = {}) {
  const qId = query.quincenaId ? Number(query.quincenaId) : null;
  const filas = db.prepare(`SELECT e.*, q.anio, q.numero FROM envios_correo e JOIN quincenas q ON q.id = e.quincena_id
                            WHERE (@q IS NULL OR e.quincena_id = @q) ORDER BY e.enviado_en DESC, e.id DESC`).all({ q: qId });
  return {
    envios: filas.map((e) => ({
      id: e.id,
      quincenaId: e.quincena_id,
      quincena: `Q${e.numero} ${e.anio}`,
      reportes: JSON.parse(e.reportes),
      modo: e.modo,
      para: eml.lista(e.para),
      cc: eml.lista(e.cc),
      cco: eml.lista(e.cco),
      asunto: e.asunto,
      resultado: e.resultado,
      detalleError: e.detalle_error,
      enviadoEn: e.enviado_en,
    })),
  };
}

module.exports = { enviar, envios, vistaPrevia, avisosRojos, textoPeriodo, sustituir, ROJOS };
