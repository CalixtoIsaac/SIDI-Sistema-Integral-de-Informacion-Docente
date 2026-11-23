/**
 * Comparativo del % OPP de Preparatoria Veracruz por semestre (HU-24; 06 §OPINA; 07 §5.4).
 *
 *   listar(db)                      GET    /opina/campus
 *     → { semestres: [{ periodoId, periodo, alumnos, positivas, opp, variacion, tendencia, regionOpp, fuente,
 *                       capturadoEn, opinaAlumnos }], promedio, ultimo, sinCaptura: [{ periodoId, periodo }] }
 *   guardar(db, periodoId, body)    PUT    /opina/campus/:periodoId  { alumnos, positivas, regionOpp?, fuente? }
 *                                   (sin regionOpp se conserva el de antes; regionOpp: null lo borra)
 *   eliminar(db, periodoId)         DELETE /opina/campus/:periodoId
 *
 * El % OPP oficial se captura a mano (2 números de la fila Preparatoria → Veracruz del reporte institucional);
 * la tabla lo calcula. `variacion` = puntos contra el semestre capturado anterior (▲/▼, G1 del resumen).
 * `opinaAlumnos` es lo que SIDI calcula del OPINA por alumno de ese semestre (si se importó): calificación del
 * campus (Σ Sí ÷ Σ respuestas, solo presencial Veracruz) y promedio de maestros con muestra suficiente. Puede
 * diferir un poco de la cifra oficial (07 §5.4).
 */
const { HttpError } = require('../lib/errores');
const { Validador } = require('../lib/validar');
const config = require('../lib/configuracion');

const un = (n) => Math.round(n * 10) / 10;

function muestraMinima(db) {
  const n = Number(config.obtener(db, 'opina.muestra_minima'));
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/**
 * Promedio simple de la calificación global de los maestros del semestre (solo con muestra suficiente).
 * Lo usan también el ranking (HU-16) y el panel.
 */
function promedioMaestros(db, periodoId) {
  const r = db.prepare(`SELECT AVG(100.0 * positivas / respuestas) AS promedio, COUNT(*) AS docentes
                        FROM v_opina_docente WHERE periodo_id = ? AND respuestas >= ?`).get(periodoId, muestraMinima(db));
  return r.docentes ? { promedio: un(r.promedio), docentes: r.docentes } : { promedio: null, docentes: 0 };
}

/** Lo calculado del OPINA por alumno para un semestre (null si no se importó). */
function opinaAlumnos(db, periodoId) {
  const c = db.prepare('SELECT respuestas, positivas, calificacion_campus, docentes, grupos FROM v_opina_campus WHERE periodo_id = ?').get(periodoId);
  if (!c) return null;
  const m = promedioMaestros(db, periodoId);
  return {
    respuestas: c.respuestas, positivas: c.positivas, calificacionCampus: c.calificacion_campus,
    docentes: c.docentes, grupos: c.grupos, promedioMaestros: m.promedio, docentesConMuestra: m.docentes,
  };
}

function aSemestre(r) {
  return {
    periodoId: r.periodo_id,
    periodo: r.clave,
    alumnos: r.alumnos,
    positivas: r.positivas,
    opp: r.opp,
    regionOpp: r.region_opp,
    fuente: r.fuente,
    capturadoEn: r.capturado_en,
  };
}

/** GET /opina/campus */
function listar(db) {
  const filas = db.prepare(`SELECT o.*, p.clave FROM opina_campus_semestre o JOIN periodos p ON p.id = o.periodo_id
                            ORDER BY p.fecha_inicio, p.id`).all();
  let anterior = null;
  const semestres = filas.map((r) => {
    const s = aSemestre(r);
    s.variacion = anterior === null ? null : un(s.opp - anterior);
    s.tendencia = s.variacion === null ? null : s.variacion > 0 ? 'sube' : s.variacion < 0 ? 'baja' : 'igual';
    s.opinaAlumnos = opinaAlumnos(db, s.periodoId);
    anterior = s.opp;
    return s;
  });
  const sinCaptura = db.prepare(`SELECT p.id AS periodoId, p.clave AS periodo FROM periodos p
                                 WHERE NOT EXISTS (SELECT 1 FROM opina_campus_semestre o WHERE o.periodo_id = p.id)
                                 ORDER BY p.fecha_inicio, p.id`).all();
  return {
    semestres,
    promedio: semestres.length ? un(semestres.reduce((s, x) => s + x.opp, 0) / semestres.length) : null,
    ultimo: semestres.at(-1) ?? null,
    sinCaptura,
  };
}

function periodo(db, periodoId) {
  const p = db.prepare('SELECT id, clave FROM periodos WHERE id = ?').get(Number(periodoId));
  if (!p) throw new HttpError(404, 'Ese semestre no existe.', 'PERIODO_NO_EXISTE');
  return p;
}

/** PUT /opina/campus/:periodoId → { semestre } (crea o reemplaza la captura del semestre) */
function guardar(db, periodoId, body = {}) {
  const p = periodo(db, periodoId);
  const v = new Validador();
  const alumnos = v.entero('alumnos', body.alumnos, { min: 1, max: 1000000, obligatorio: true });
  const positivas = v.entero('positivas', body.positivas, { min: 0, max: 1000000, obligatorio: true });
  if (alumnos !== null && positivas !== null && positivas > alumnos) v.error('positivas', 'MAYOR_QUE_ALUMNOS');
  // regionOpp: si no viene en el cuerpo se conserva lo que había (p. ej. la semilla); null o '' lo borra
  const cambiaRegion = Object.prototype.hasOwnProperty.call(body, 'regionOpp');
  let regionOpp = null;
  if (cambiaRegion && body.regionOpp !== null && body.regionOpp !== '') {
    regionOpp = Number(body.regionOpp);
    if (!Number.isFinite(regionOpp) || regionOpp < 0 || regionOpp > 100) v.error('regionOpp', 'VALOR_INVALIDO');
  }
  const fuente = v.texto('fuente', body.fuente, { max: 120 });
  v.terminar();
  db.prepare(`INSERT INTO opina_campus_semestre (periodo_id, alumnos, positivas, region_opp, fuente)
              VALUES (@periodo, @alumnos, @positivas, @regionOpp, @fuente)
              ON CONFLICT (periodo_id) DO UPDATE SET alumnos = excluded.alumnos, positivas = excluded.positivas,
                region_opp = CASE WHEN @cambiaRegion = 1 THEN excluded.region_opp ELSE opina_campus_semestre.region_opp END, fuente = COALESCE(excluded.fuente, opina_campus_semestre.fuente),
                capturado_en = datetime('now','localtime')`)
    .run({ periodo: p.id, alumnos, positivas, regionOpp, fuente, cambiaRegion: cambiaRegion ? 1 : 0 });
  return { semestre: listar(db).semestres.find((s) => s.periodoId === p.id) };
}

/** DELETE /opina/campus/:periodoId */
function eliminar(db, periodoId) {
  const p = periodo(db, periodoId);
  const r = db.prepare('DELETE FROM opina_campus_semestre WHERE periodo_id = ?').run(p.id);
  if (r.changes === 0) throw new HttpError(404, 'Ese semestre no tiene % OPP capturado.', 'SIN_CAPTURA');
}

module.exports = { listar, guardar, eliminar, promedioMaestros, opinaAlumnos, muestraMinima };
