/**
 * Consultas agregadas para el Panel (HU-15), /analitica/perfil-docentes y las 8 gráficas del
 * resumen ejecutivo (HU-26; 05 §1.1). Solo datos: titulares y conclusiones los arma la ruta.
 *
 *   docentesPorGenero(db)          → [{ genero: 'M'|'F'|'ninguno', docentes }]
 *   docentesPorNivelEstudios(db)   → [{ nivelEstudios: 'Licenciatura'…|'ninguno', orden, docentes }]
 *
 *   G1  oppCampus(db)                              → [{ periodoId, periodo, opp, regionOpp, variacion }]
 *   G2  distribucionOpina(db, { periodoIds })      → [{ periodoId, periodo, rangos: [{ rango, docentes }], docentes, sinMuestra }]
 *   G3  topBottomOpina(db, { periodoId, n })       → { periodoId, periodo, top: [...], bottom: [...] }
 *   G4  cambioOpina(db, { periodoId, compararCon }) → { antes, despues, docentes: [{ docenteId, nombre, antes, despues, cambio }] }
 *   G9  faltasPorTipo(db, { periodoId })           → { periodoId, periodo, tipos: [{ tipo, faltas, docentes }] }
 *   G10 descontadoVsPagado(db, { periodoId })      → { periodoId, periodo, quincenas: [...], totales }
 *   G15 plantillaPorSemestre(db, { periodoIds })   → [{ periodoId, periodo, activos, nuevos, bajas, ... }]
 *   G16 perfilDocentes(db)                         → { genero, nivelEstudios, estudiando }
 *
 * - Por defecto cuentan solo docentes ACTIVOS ({ activo: true }); { activo: false } cuenta
 *   los inactivos y { activo: null } a todos.
 * - Género y nivel devuelven todas las categorías, también las de 0 ('ninguno' = sin dato,
 *   igual que el filtro /docentes?genero=ninguno). Nivel = el más alto TITULADO.
 * - Sin periodoId se usa el periodo actual (G3 y G4: el último con OPINA importado). Sin datos → listas vacías o ceros; la diapositiva
 *   muestra "Sin datos registrados" (nunca datos de ejemplo).
 * - OPINA por maestro (G2–G4): solo docentes con muestra suficiente (config opina.muestra_minima).
 * - Semestre de una falta (G9): el de su CRN; si no tiene, el de su fecha, la fecha de pago de su
 *   quincena o el día en que se registró (misma regla que /faltas/resumen-semestral, HU-14).
 * - Sin nombres de alumnos, comentarios ni observaciones de baja: solo conteos.
 */
/** Condición SQL y parámetros según { activo }. */
function filtroActivo(activo) {
  if (activo === null) return { where: '', params: [] };
  return { where: 'WHERE d.activo = ?', params: [activo === false ? 0 : 1] };
}

function docentesPorGenero(db, { activo = true } = {}) {
  const { where, params } = filtroActivo(activo);
  const conteos = new Map(
    db.prepare(`
      SELECT COALESCE(d.genero, 'ninguno') AS genero, COUNT(*) AS docentes
      FROM docentes d
      ${where}
      GROUP BY COALESCE(d.genero, 'ninguno')
    `).all(...params).map((f) => [f.genero, f.docentes])
  );
  const filas = ['M', 'F'].map((genero) => ({ genero, docentes: conteos.get(genero) ?? 0 }));
  if (conteos.get('ninguno')) filas.push({ genero: 'ninguno', docentes: conteos.get('ninguno') });
  return filas;
}

function docentesPorNivelEstudios(db, { activo = true } = {}) {
  const { where, params } = filtroActivo(activo);
  const conteos = new Map(
    db.prepare(`
      SELECT COALESCE(e.nivel_estudios, 'ninguno') AS nivel, COUNT(*) AS docentes
      FROM docentes d
      JOIN v_docente_estudios e ON e.docente_id = d.id
      ${where}
      GROUP BY COALESCE(e.nivel_estudios, 'ninguno')
    `).all(...params).map((f) => [f.nivel, f.docentes])
  );
  const catalogo = db.prepare(`
    SELECT valor, orden FROM catalogos
    WHERE tipo = 'nivel_estudios' AND activo = 1
    ORDER BY orden, valor
  `).all();

  const filas = catalogo.map((c) => ({ nivelEstudios: c.valor, orden: c.orden, docentes: conteos.get(c.valor) ?? 0 }));
  // Un nivel que ya no está activo en el catálogo pero alguien lo tiene titulado: se muestra igual
  for (const [nivel, docentes] of conteos) {
    if (nivel !== 'ninguno' && !catalogo.some((c) => c.valor === nivel)) {
      filas.push({ nivelEstudios: nivel, orden: null, docentes });
    }
  }
  if (conteos.get('ninguno')) filas.push({ nivelEstudios: 'ninguno', orden: null, docentes: conteos.get('ninguno') });
  return filas;
}

// ---------------------------------------------------------------------------
// Resumen ejecutivo (HU-26)
// ---------------------------------------------------------------------------
const config = require('./configuracion');
const { nombreCompleto } = require('./nombres');
const { etiqueta: etiquetaQuincena } = require('./quincena');
const { primerInicio, indiceSemestre } = require('./antiguedad');

const RANGOS_OPINA = ['< 70', '70–79', '80–89', '90–100'];
const TIPOS_FALTA = ['Asunto personal', 'Incapacidad médica'];
const un = (n) => Math.round(n * 10) / 10;
const pesos = (n) => Math.round(n * 100) / 100;

/** Periodo pedido o el actual: { id, clave, fecha_inicio } (null si no hay). */
function periodo(db, periodoId) {
  if (periodoId === undefined || periodoId === null || periodoId === '') {
    return db.prepare('SELECT id, clave, fecha_inicio FROM periodos WHERE actual = 1').get() ?? null;
  }
  return db.prepare('SELECT id, clave, fecha_inicio FROM periodos WHERE id = ?').get(Number(periodoId)) ?? null;
}

/** Periodo pedido o, sin él, el último con OPINA importado (el actual suele no tenerlo aún). */
function periodoOpina(db, periodoId) {
  if (periodoId !== undefined && periodoId !== null && periodoId !== '') return periodo(db, periodoId);
  return db.prepare(`SELECT p.id, p.clave, p.fecha_inicio FROM periodos p
                     WHERE EXISTS (SELECT 1 FROM opina_respuestas o WHERE o.periodo_id = p.id)
                     ORDER BY p.fecha_inicio DESC, p.id DESC LIMIT 1`).get() ?? null;
}

/** Periodos pedidos (o todos) en orden cronológico. */
function periodos(db, periodoIds) {
  const todos = db.prepare('SELECT id, clave, fecha_inicio FROM periodos ORDER BY fecha_inicio, id').all();
  if (!periodoIds || periodoIds.length === 0) return todos;
  const ids = new Set(periodoIds.map(Number));
  return todos.filter((p) => ids.has(p.id));
}

/** SQL: id del periodo al que pertenece una fecha (el último que empezó antes o ese día). */
const periodoDeFecha = (expr) =>
  `(SELECT p.id FROM periodos p WHERE p.fecha_inicio IS NOT NULL AND p.fecha_inicio <= ${expr} ORDER BY p.fecha_inicio DESC LIMIT 1)`;

function muestraMinima(db) {
  const n = Number(config.obtener(db, 'opina.muestra_minima'));
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/** OPINA por docente de un periodo, solo con muestra suficiente. */
function opinaDocentes(db, periodoId) {
  return db.prepare(`
    SELECT o.docente_id, o.respuestas, o.porcentaje, d.nombres, d.apellido_paterno, d.apellido_materno
    FROM v_opina_docente o JOIN docentes d ON d.id = o.docente_id
    WHERE o.periodo_id = ? AND o.respuestas >= ?
  `).all(periodoId, muestraMinima(db)).map((r) => ({
    docenteId: r.docente_id,
    nombre: nombreCompleto({ nombres: r.nombres, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno }),
    porcentaje: r.porcentaje,
    respuestas: r.respuestas,
  }));
}

function rangoOpina(porcentaje) {
  if (porcentaje < 70) return RANGOS_OPINA[0];
  if (porcentaje < 80) return RANGOS_OPINA[1];
  if (porcentaje < 90) return RANGOS_OPINA[2];
  return RANGOS_OPINA[3];
}

/** G1: % OPP oficial de Preparatoria Veracruz por semestre capturado. */
function oppCampus(db) {
  let anterior = null;
  return db.prepare(`
    SELECT o.periodo_id, p.clave, o.opp, o.region_opp
    FROM opina_campus_semestre o JOIN periodos p ON p.id = o.periodo_id
    ORDER BY p.fecha_inicio, p.id
  `).all().map((r) => {
    const fila = { periodoId: r.periodo_id, periodo: r.clave, opp: r.opp, regionOpp: r.region_opp,
      variacion: anterior === null ? null : un(r.opp - anterior) };
    anterior = r.opp;
    return fila;
  });
}

/** G2: docentes por rango de calificación OPINA, por semestre (solo semestres con OPINA). */
function distribucionOpina(db, { periodoIds } = {}) {
  const minimo = muestraMinima(db);
  const conOpina = db.prepare(`SELECT periodo_id, COUNT(*) AS total, SUM(respuestas < ?) AS sin_muestra
                               FROM v_opina_docente GROUP BY periodo_id`).all(minimo);
  const resumen = new Map(conOpina.map((r) => [r.periodo_id, r]));
  return periodos(db, periodoIds).filter((p) => resumen.has(p.id)).map((p) => {
    const docentes = opinaDocentes(db, p.id);
    return {
      periodoId: p.id,
      periodo: p.clave,
      rangos: RANGOS_OPINA.map((rango) => ({ rango, docentes: docentes.filter((d) => rangoOpina(d.porcentaje) === rango).length })),
      docentes: docentes.length,
      sinMuestra: resumen.get(p.id).sin_muestra,
    };
  });
}

/** G3: los n mejores y los n más bajos del semestre (sin repetir docentes entre las dos listas). */
function topBottomOpina(db, { periodoId, n = 5 } = {}) {
  const p = periodoOpina(db, periodoId);
  if (!p) return { periodoId: null, periodo: null, top: [], bottom: [] };
  const docentes = opinaDocentes(db, p.id)
    .sort((a, b) => b.porcentaje - a.porcentaje || b.respuestas - a.respuestas || a.nombre.localeCompare(b.nombre, 'es'));
  const top = docentes.slice(0, n);
  const bottom = docentes.slice(Math.max(n, docentes.length - n)).reverse();
  return { periodoId: p.id, periodo: p.clave, top, bottom };
}

/**
 * G4: cambio por docente entre dos semestres (ambos con muestra suficiente).
 * Sin compararCon se usa el semestre con OPINA inmediatamente anterior.
 */
function cambioOpina(db, { periodoId, compararCon } = {}) {
  const despues = periodoOpina(db, periodoId);
  let antes = compararCon ? periodo(db, compararCon) : null;
  if (despues && !compararCon) {
    antes = db.prepare(`SELECT p.id, p.clave, p.fecha_inicio FROM periodos p
                        WHERE p.fecha_inicio < ? AND EXISTS (SELECT 1 FROM opina_respuestas o WHERE o.periodo_id = p.id)
                        ORDER BY p.fecha_inicio DESC LIMIT 1`).get(despues.fecha_inicio) ?? null;
  }
  const sinDatos = { antes: antes && { periodoId: antes.id, periodo: antes.clave },
    despues: despues && { periodoId: despues.id, periodo: despues.clave }, docentes: [] };
  if (!antes || !despues) return sinDatos;
  const previo = new Map(opinaDocentes(db, antes.id).map((d) => [d.docenteId, d]));
  sinDatos.docentes = opinaDocentes(db, despues.id)
    .filter((d) => previo.has(d.docenteId))
    .map((d) => ({ docenteId: d.docenteId, nombre: d.nombre, antes: previo.get(d.docenteId).porcentaje,
      despues: d.porcentaje, cambio: un(d.porcentaje - previo.get(d.docenteId).porcentaje) }))
    .sort((a, b) => b.cambio - a.cambio || a.nombre.localeCompare(b.nombre, 'es'));
  return sinDatos;
}

/** G9: faltas del semestre en 2 tipos (04 §5 tipo_resumen). */
function faltasPorTipo(db, { periodoId } = {}) {
  const p = periodo(db, periodoId);
  const tipos = TIPOS_FALTA.map((tipo) => ({ tipo, faltas: 0, docentes: 0 }));
  if (!p) return { periodoId: null, periodo: null, tipos };
  const filas = db.prepare(`
    SELECT CASE WHEN f.justificacion IN ('incapacidad_imss', 'cita_imss') THEN 'Incapacidad médica' ELSE 'Asunto personal' END AS tipo,
           COUNT(*) AS faltas, COUNT(DISTINCT f.docente_id) AS docentes
    FROM faltas f
    LEFT JOIN asignaturas a ON a.id = f.asignatura_id
    LEFT JOIN quincenas q ON q.id = f.quincena_id
    WHERE COALESCE(a.periodo_id, ${periodoDeFecha("COALESCE(f.fecha, q.fecha_pago, substr(f.creado_en, 1, 10))")}) = ?
    GROUP BY tipo
  `).all(p.id);
  for (const r of filas) Object.assign(tipos.find((t) => t.tipo === r.tipo), { faltas: r.faltas, docentes: r.docentes });
  return { periodoId: p.id, periodo: p.clave, tipos };
}

/**
 * G10: por quincena de reporte del semestre, lo descontado a titulares y lo pagado a suplentes.
 * Lo pagado se toma de la quincena de la incidencia del suplente (o la de la falta si aún no tiene).
 * Las faltas y pagos pendientes de reportar no entran (no tienen quincena).
 */
function descontadoVsPagado(db, { periodoId } = {}) {
  const p = periodo(db, periodoId);
  const totales = { descontado: 0, pagado: 0, diferencia: 0 };
  if (!p) return { periodoId: null, periodo: null, quincenas: [], totales };
  const quincenas = db.prepare(`
    WITH movimientos AS (
      SELECT f.quincena_id AS quincena_id, f.monto_descuento AS descontado, 0 AS pagado
      FROM faltas f WHERE f.quincena_id IS NOT NULL
      UNION ALL
      SELECT COALESCE(i.quincena_id, f.quincena_id), 0, s.monto
      FROM suplencias s JOIN faltas f ON f.id = s.falta_id LEFT JOIN incidencias i ON i.id = s.incidencia_id
      WHERE COALESCE(i.quincena_id, f.quincena_id) IS NOT NULL
    )
    SELECT q.id, q.anio, q.numero, q.fecha_pago, SUM(m.descontado) AS descontado, SUM(m.pagado) AS pagado
    FROM movimientos m JOIN quincenas q ON q.id = m.quincena_id
    WHERE ${periodoDeFecha('q.fecha_inicio')} = ?
    GROUP BY q.id ORDER BY q.anio, q.numero
  `).all(p.id).map((r) => ({
    quincenaId: r.id, anio: r.anio, quincena: etiquetaQuincena(r.numero), fechaPago: r.fecha_pago,
    descontado: pesos(r.descontado), pagado: pesos(r.pagado), diferencia: pesos(r.descontado - r.pagado),
  }));
  for (const q of quincenas) {
    totales.descontado += q.descontado;
    totales.pagado += q.pagado;
  }
  totales.descontado = pesos(totales.descontado);
  totales.pagado = pesos(totales.pagado);
  totales.diferencia = pesos(totales.descontado - totales.pagado);
  return { periodoId: p.id, periodo: p.clave, quincenas, totales };
}

/**
 * G15: plantilla por semestre.
 *   activos  = docentes con asignaturas en el semestre
 *   nuevos   = activos cuyo primer semestre (calculado o capturado a mano) es este
 *   bajas    = registradas en el semestre, separadas en recontratables / no recontratables
 * `sinHistorial` marca el primer semestre importado: ahí todos parecen nuevos salvo que se haya
 * capturado su primer semestre a mano.
 */
function plantillaPorSemestre(db, { periodoIds } = {}) {
  const lista = periodos(db, periodoIds);
  const primerConGrupos = db.prepare(`SELECT p.id FROM periodos p WHERE EXISTS (SELECT 1 FROM asignaturas a WHERE a.periodo_id = p.id)
                                      ORDER BY p.fecha_inicio, p.id LIMIT 1`).pluck().get();
  const primeros = new Map(db.prepare(`
    SELECT d.id, v.primer_inicio, d.primer_semestre_texto
    FROM docentes d LEFT JOIN v_docente_primer_periodo v ON v.docente_id = d.id
  `).all().map((r) => [r.id, indiceSemestre(primerInicio(r.primer_inicio, r.primer_semestre_texto))]));
  const activosDe = db.prepare('SELECT DISTINCT docente_id FROM asignaturas WHERE periodo_id = ? AND docente_id IS NOT NULL').pluck();
  const bajasDe = db.prepare(`
    SELECT COUNT(*) AS bajas, COALESCE(SUM(b.recontratable = 1), 0) AS recontratables
    FROM docente_bajas b
    WHERE COALESCE(b.periodo_id, ${periodoDeFecha('b.fecha')}) = ?`);

  return lista.map((p) => {
    const activos = activosDe.all(p.id);
    const indice = indiceSemestre(p.fecha_inicio);
    const b = bajasDe.get(p.id);
    return {
      periodoId: p.id,
      periodo: p.clave,
      activos: activos.length,
      nuevos: activos.filter((id) => primeros.get(id) === indice).length,
      bajas: b.bajas,
      bajasRecontratables: b.recontratables,
      bajasNoRecontratables: b.bajas - b.recontratables,
      sinHistorial: p.id === primerConGrupos,
    };
  });
}

/** G16: perfil de la plantilla (activos): género, nivel de estudios y si están estudiando. */
function perfilDocentes(db, { activo = true } = {}) {
  const { where, params } = filtroActivo(activo);
  const estudian = db.prepare(`
    SELECT e.nivel_estudiando AS nivel, COUNT(*) AS docentes
    FROM docentes d JOIN v_docente_estudios e ON e.docente_id = d.id
    ${where ? where + ' AND' : 'WHERE'} e.estudia_actualmente = 1
    GROUP BY e.nivel_estudiando ORDER BY docentes DESC, nivel
  `).all(...params);
  const total = db.prepare(`SELECT COUNT(*) FROM docentes d ${where}`).pluck().get(...params);
  const si = estudian.reduce((n, r) => n + r.docentes, 0);
  return {
    genero: docentesPorGenero(db, { activo }),
    nivelEstudios: docentesPorNivelEstudios(db, { activo }),
    estudiando: { si, no: total - si, porNivel: estudian.map((r) => ({ nivel: r.nivel, docentes: r.docentes })) },
  };
}

module.exports = {
  docentesPorGenero, docentesPorNivelEstudios,
  oppCampus, distribucionOpina, topBottomOpina, cambioOpina,
  faltasPorTipo, descontadoVsPagado, plantillaPorSemestre, perfilDocentes,
  RANGOS_OPINA, TIPOS_FALTA,
};
