/**
 * Ranking completo de OPINA (HU-16; 06 §OPINA · GET /opina/ranking y /opina/ranking/excel; 07 §5.2).
 *
 *   ranking(db, { periodoId?, filtro?, n?, min?, max?, compararCon?, incluirMuestraInsuficiente? })
 *     → { periodo, compararCon, filtro, promedioMaestros, calificacionCampus, muestraMinima, docentes,
 *         muestraInsuficiente, ranking: [{ posicion, docenteId, nomina, nombre, activo, porcentaje, respuestas,
 *                                          positivas, porcentajeAnterior, variacion, grupos: [...] }] }
 *   excel(db, query) → { nombre, buffer }  (mismo filtro; hojas Ranking, Por grupo y Muestra insuficiente)
 *
 * Calificación global = Σ Sí ÷ Σ respuestas de todos sus grupos (ponderada, 07 §5.2).
 * Posición: sobre TODO el ranking del semestre (con muestra suficiente), empates con la misma posición
 * (1, 1, 3); el filtro solo elige qué filas se muestran, así "Peores 5" conserva su lugar real.
 * filtro: todos | mejores (n) | peores (n, el peor primero) | rango (min ≤ % ≤ max).
 * Muestra insuficiente (< opina.muestra_minima respuestas): fuera del ranking; con
 * incluirMuestraInsuficiente=true se agregan al final sin posición.
 */
const XLSX = require('xlsx');
const { HttpError } = require('../lib/errores');
const { nombreCompleto } = require('../lib/nombres');
const config = require('../lib/configuracion');
const campus = require('./opinaCampusService');

const FILTROS = ['todos', 'mejores', 'peores', 'rango'];
const un = (n) => Math.round(n * 10) / 10;
const vacio = (v) => v === undefined || v === null || v === '';
const verdadero = (v) => v === true || v === 'true' || v === '1';

function periodoPorId(db, id, campo) {
  const p = db.prepare('SELECT id, clave FROM periodos WHERE id = ?').get(Number(id));
  if (!p) throw new HttpError(404, 'Ese semestre no existe.', 'PERIODO_NO_EXISTE', [{ campo, problema: 'NO_EXISTE' }]);
  return p;
}

function ultimoConOpina(db) {
  return db.prepare(`SELECT p.id, p.clave FROM periodos p
                     WHERE EXISTS (SELECT 1 FROM opina_respuestas r WHERE r.periodo_id = p.id)
                     ORDER BY p.fecha_inicio DESC LIMIT 1`).get() ?? null;
}

function validar(db, q) {
  const errores = [];
  const filtro = vacio(q.filtro) ? 'todos' : String(q.filtro);
  if (!FILTROS.includes(filtro)) errores.push({ campo: 'filtro', problema: 'VALOR_INVALIDO' });
  const porDefecto = Number(config.obtener(db, 'opina.top_n')) || 10;
  const n = vacio(q.n) ? porDefecto : Number(q.n);
  if (!Number.isInteger(n) || n < 1 || n > 500) errores.push({ campo: 'n', problema: 'VALOR_INVALIDO' });
  const num = (campo, v, def) => {
    if (vacio(v)) return def;
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0 || x > 100) errores.push({ campo, problema: 'VALOR_INVALIDO' });
    return x;
  };
  const min = num('min', q.min, 0);
  const max = num('max', q.max, 100);
  if (filtro === 'rango' && min > max) errores.push({ campo: 'min', problema: 'MAYOR_QUE_MAX' });
  if (errores.length) throw new HttpError(400, 'Revisa los datos marcados.', 'VALIDACION', errores);
  const periodo = vacio(q.periodoId) ? ultimoConOpina(db) : periodoPorId(db, q.periodoId, 'periodoId');
  const compararCon = vacio(q.compararCon) ? null : periodoPorId(db, q.compararCon, 'compararCon');
  return { filtro, n, min, max, periodo, compararCon, incluirInsuficiente: verdadero(q.incluirMuestraInsuficiente) };
}

function calificaciones(db, periodoId) {
  return db.prepare(`SELECT v.docente_id, v.respuestas, v.positivas, d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno, d.activo
                     FROM v_opina_docente v JOIN docentes d ON d.id = v.docente_id WHERE v.periodo_id = ?`).all(periodoId);
}

function gruposDe(db, periodoId) {
  const porDocente = new Map();
  for (const g of db.prepare(`SELECT c.docente_id, c.crn, c.respuestas, c.positivas,
                                     (SELECT a.materia FROM asignaturas a WHERE a.crn = c.crn AND a.periodo_id = c.periodo_id LIMIT 1) AS materia
                              FROM v_opina_crn c WHERE c.periodo_id = ? ORDER BY c.crn`).all(periodoId)) {
    if (!porDocente.has(g.docente_id)) porDocente.set(g.docente_id, []);
    porDocente.get(g.docente_id).push({
      crn: g.crn, materia: g.materia, porcentaje: un(100 * g.positivas / g.respuestas), respuestas: g.respuestas, positivas: g.positivas,
    });
  }
  return porDocente;
}

/** GET /opina/ranking */
function ranking(db, query = {}) {
  const v = validar(db, query);
  const minimo = campus.muestraMinima(db);
  const base = {
    periodo: v.periodo, compararCon: v.compararCon, filtro: { tipo: v.filtro, n: v.n, min: v.min, max: v.max },
    muestraMinima: minimo,
  };
  if (!v.periodo) return { ...base, promedioMaestros: null, calificacionCampus: null, docentes: 0, muestraInsuficiente: 0, ranking: [] };

  const anteriores = v.compararCon
    ? new Map(calificaciones(db, v.compararCon.id).map((r) => [r.docente_id, un(100 * r.positivas / r.respuestas)]))
    : new Map();
  const grupos = gruposDe(db, v.periodo.id);
  const filas = calificaciones(db, v.periodo.id).map((r) => {
    const porcentaje = un(100 * r.positivas / r.respuestas);
    const anterior = anteriores.get(r.docente_id) ?? null;
    return {
      posicion: null,
      docenteId: r.docente_id,
      nomina: r.nomina,
      nombre: nombreCompleto({ nombres: r.nombres, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno }),
      activo: r.activo === 1,
      porcentaje,
      respuestas: r.respuestas,
      positivas: r.positivas,
      muestraInsuficiente: r.respuestas < minimo,
      porcentajeAnterior: anterior,
      variacion: anterior === null ? null : un(porcentaje - anterior),
      grupos: grupos.get(r.docente_id) ?? [],
    };
  });
  const orden = (a, b) => b.porcentaje - a.porcentaje || b.respuestas - a.respuestas || a.nombre.localeCompare(b.nombre, 'es');
  const conMuestra = filas.filter((f) => !f.muestraInsuficiente).sort(orden);
  conMuestra.forEach((f, i) => { f.posicion = i > 0 && f.porcentaje === conMuestra[i - 1].porcentaje ? conMuestra[i - 1].posicion : i + 1; });
  const insuficientes = filas.filter((f) => f.muestraInsuficiente).sort(orden);

  let visibles;
  if (v.filtro === 'mejores') visibles = conMuestra.slice(0, v.n);
  else if (v.filtro === 'peores') visibles = conMuestra.slice(-v.n).reverse();
  else if (v.filtro === 'rango') visibles = conMuestra.filter((f) => f.porcentaje >= v.min && f.porcentaje <= v.max);
  else visibles = conMuestra;
  const c = db.prepare('SELECT calificacion_campus FROM v_opina_campus WHERE periodo_id = ?').get(v.periodo.id);
  return {
    ...base,
    promedioMaestros: campus.promedioMaestros(db, v.periodo.id).promedio,
    calificacionCampus: c?.calificacion_campus ?? null,
    docentes: conMuestra.length,
    muestraInsuficiente: insuficientes.length,
    ranking: v.incluirInsuficiente ? [...visibles, ...insuficientes] : visibles,
  };
}

// ------------------------------------------------------------------ Excel

const TEXTO_FILTRO = {
  todos: () => 'Todos', mejores: (f) => `Mejores ${f.n}`, peores: (f) => `Peores ${f.n}`, rango: (f) => `De ${f.min} % a ${f.max} %`,
};

function hojaDe(datos, cols, textos = []) {
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  hoja['!cols'] = cols.map((wch) => ({ wch }));
  for (const ref of Object.keys(hoja)) {
    if (ref.startsWith('!')) continue;
    const { c, r } = XLSX.utils.decode_cell(ref);
    if (textos.includes(c) && r > 0 && hoja[ref].v !== '') Object.assign(hoja[ref], { t: 's', v: String(hoja[ref].v), z: '@' });
  }
  return hoja;
}

/** GET /opina/ranking/excel → OPINA_RANKING_<PERIODO>.xlsx */
function excel(db, query = {}) {
  const r = ranking(db, { ...query, incluirMuestraInsuficiente: 'false' });
  if (!r.periodo) throw new HttpError(404, 'No hay OPINA importado para generar el ranking.', 'SIN_OPINA');
  const compara = Boolean(r.compararCon);
  const encabezado = [
    [`Ranking OPINA · ${r.periodo.clave}`],
    [`Filtro: ${TEXTO_FILTRO[r.filtro.tipo](r.filtro)}`, '', `Promedio de maestros: ${r.promedioMaestros ?? '—'} %`, '', `Calificación del campus: ${r.calificacionCampus ?? '—'} %`],
    [`Muestra mínima: ${r.muestraMinima} respuestas`, '', compara ? `Variación contra ${r.compararCon.clave}` : ''],
    [],
  ];
  const cols = ['Posición', 'Nómina', 'Docente', '% recomendación', 'Respuestas', 'Sí', ...(compara ? [`% ${r.compararCon.clave}`, 'Variación (pts)'] : [])];
  const fila = (f) => [f.posicion ?? '', f.nomina, f.nombre, f.porcentaje, f.respuestas, f.positivas, ...(compara ? [f.porcentajeAnterior ?? '', f.variacion ?? ''] : [])];
  const hojaRanking = hojaDe([...encabezado, cols, ...r.ranking.map(fila)], [9, 12, 36, 16, 11, 7, 16, 15], [1]);
  hojaRanking['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: encabezado.length, c: 0 }, e: { r: encabezado.length + r.ranking.length, c: cols.length - 1 } }) };

  const porGrupo = hojaDe([
    ['Posición', 'Nómina', 'Docente', 'CRN', 'Materia', '% recomendación', 'Respuestas', 'Sí'],
    ...r.ranking.flatMap((f) => f.grupos.map((g) => [f.posicion ?? '', f.nomina, f.nombre, g.crn, g.materia ?? '', g.porcentaje, g.respuestas, g.positivas])),
  ], [9, 12, 36, 8, 34, 16, 11, 7], [1, 3]);

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaRanking, 'Ranking');
  XLSX.utils.book_append_sheet(libro, porGrupo, 'Por grupo');
  const fuera = ranking(db, { ...query, filtro: 'todos', incluirMuestraInsuficiente: 'true' }).ranking.filter((f) => f.muestraInsuficiente);
  if (fuera.length) {
    XLSX.utils.book_append_sheet(libro, hojaDe([
      ['Nómina', 'Docente', '% recomendación', 'Respuestas', 'Sí'],
      ...fuera.map((f) => [f.nomina, f.nombre, f.porcentaje, f.respuestas, f.positivas]),
    ], [12, 36, 16, 11, 7], [0]), 'Muestra insuficiente');
  }
  return {
    nombre: `OPINA_RANKING_${r.periodo.clave.replace(/\s+/g, '_')}.xlsx`,
    buffer: XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }),
  };
}

module.exports = { ranking, excel, FILTROS };
