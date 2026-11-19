/**
 * Consultas de OPINA por docente (06 §Docentes y §OPINA; 07 §5.2).
 *
 *   detalleDocente(db, docenteId, { periodoId? })   GET /docentes/:id/opina?periodoId=
 *     → { docente, periodo, periodos, muestraMinima, global: { respuestas, positivas, porcentaje, muestraSuficiente },
 *         porCrn: [{ crn, materia, grupo, respuestas, positivas, porcentaje }],
 *         reactivos: [{ clave, etiqueta, si, no, noSeguro, respuestas, porcentajeSi }] | null,
 *         razones: { porQueSi: [{ razon, alumnos }], porQueNo: [...] },
 *         comentarios: [{ crn, recomienda, texto }] }
 *     Sin periodoId: el semestre más reciente con OPINA del docente. `periodos` lista los semestres que tiene.
 *     Los comentarios de alumnos son sensibles: solo salen aquí (ficha del docente), nunca en panel ni resumen.
 *
 *   comparativo(db, { periodos? })                   GET /opina/comparativo?periodos=1,2,3
 *     → { periodos: [{ id, clave, promedioMaestros, calificacionCampus, docentes }],
 *         docentes: [{ docenteId, nomina, nombre, activo, celdas: [{ porcentaje, respuestas, muestraSuficiente } | null],
 *                      variacion, tendencia }] }
 *     Tabla docente × semestre (celdas en el mismo orden que `periodos`, cronológico). Sin lista: todos los
 *     semestres con OPINA. `variacion` = último − primero con muestra suficiente (null si hay menos de dos).
 */
const { HttpError } = require('../lib/errores');
const { nombreCompleto } = require('../lib/nombres');
const { REACTIVOS } = require('../lib/excel/lectores/opina');
const campus = require('./opinaCampusService');

const un = (n) => Math.round(n * 10) / 10;
const vacio = (v) => v === undefined || v === null || v === '';
const nombreDe = (r) => nombreCompleto({ nombres: r.nombres, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno });

const ETIQUETAS_REACTIVOS = {
  conocimiento: 'Demuestra conocimiento de la materia',
  retos: 'Plantea retos',
  colaboracion: 'Fomenta la colaboración',
  confianza: 'Genera un ambiente de confianza',
  inspiracion: 'Inspira',
};

function periodoPorId(db, id, campo = 'periodoId') {
  const p = db.prepare('SELECT id, clave, fecha_inicio FROM periodos WHERE id = ?').get(Number(id));
  if (!p) throw new HttpError(404, 'Ese semestre no existe.', 'PERIODO_NO_EXISTE', [{ campo, problema: 'NO_EXISTE' }]);
  return p;
}

// ------------------------------------------------------------------ detalle del docente

function docente(db, id) {
  const d = db.prepare('SELECT id, nomina, nombres, apellido_paterno, apellido_materno, activo FROM docentes WHERE id = ?').get(id);
  if (!d) throw new HttpError(404, 'Docente no encontrado.', 'DOCENTE_NO_EXISTE');
  return { id: d.id, nomina: d.nomina, nombre: nombreDe(d), activo: d.activo === 1 };
}

/** Semestres con OPINA del docente, del más reciente al más antiguo. */
function periodosDelDocente(db, docenteId) {
  return db.prepare(`SELECT p.id, p.clave, v.respuestas, v.porcentaje FROM v_opina_docente v JOIN periodos p ON p.id = v.periodo_id
                     WHERE v.docente_id = ? ORDER BY p.fecha_inicio DESC, p.id DESC`).all(docenteId);
}

/** Respuestas de los reactivos v2 → % de "Sí" por reactivo (null si el semestre es v1). */
function resumirReactivos(filas) {
  const conteo = new Map();
  for (const f of filas) {
    if (!f.items) continue;
    let items;
    try { items = JSON.parse(f.items); } catch { continue; }
    for (const [clave, valor] of Object.entries(items ?? {})) {
      if (valor === null || valor === undefined) continue;
      if (!conteo.has(clave)) conteo.set(clave, { si: 0, no: 0, noSeguro: 0 });
      const c = conteo.get(clave);
      if (valor === 'Sí') c.si += 1;
      else if (valor === 'No') c.no += 1;
      else c.noSeguro += 1;
    }
  }
  if (conteo.size === 0) return null;
  const orden = [...Object.keys(REACTIVOS), ...[...conteo.keys()].filter((k) => !(k in REACTIVOS))];
  return orden.filter((k) => conteo.has(k)).map((clave) => {
    const c = conteo.get(clave);
    const respuestas = c.si + c.no + c.noSeguro;
    return { clave, etiqueta: ETIQUETAS_REACTIVOS[clave] ?? clave, ...c, respuestas, porcentajeSi: un((100 * c.si) / respuestas) };
  });
}

/** Razones v1 (¿Por qué sí? / ¿Por qué no?) agrupadas y ordenadas por frecuencia. */
function razones(filas, campo) {
  const m = new Map();
  for (const f of filas) {
    const t = (f[campo] ?? '').trim();
    if (t) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m].map(([razon, alumnos]) => ({ razon, alumnos })).sort((a, b) => b.alumnos - a.alumnos || a.razon.localeCompare(b.razon, 'es'));
}

/** GET /docentes/:id/opina?periodoId= */
function detalleDocente(db, docenteId, query = {}) {
  const d = docente(db, docenteId);
  const periodos = periodosDelDocente(db, docenteId);
  const minimo = campus.muestraMinima(db);
  const lista = periodos.map((p) => ({ id: p.id, clave: p.clave, porcentaje: p.porcentaje, respuestas: p.respuestas }));
  const periodo = vacio(query.periodoId) ? periodos[0] ?? null : periodoPorId(db, query.periodoId);
  const vacioRes = { docente: d, periodo: periodo && { id: periodo.id, clave: periodo.clave }, periodos: lista, muestraMinima: minimo,
    global: null, porCrn: [], reactivos: null, razones: { porQueSi: [], porQueNo: [] }, comentarios: [] };
  if (!periodo) return vacioRes;

  const filas = db.prepare(`SELECT crn, recomienda, por_que_si, por_que_no, items, comentario FROM opina_respuestas
                            WHERE docente_id = ? AND periodo_id = ? ORDER BY crn, id`).all(docenteId, periodo.id);
  if (!filas.length) return vacioRes;

  const positivas = filas.reduce((s, f) => s + f.recomienda, 0);
  const porCrn = db.prepare(`
    SELECT v.crn, v.respuestas, v.positivas, v.porcentaje,
           (SELECT a.materia FROM asignaturas a WHERE a.crn = v.crn AND a.periodo_id = v.periodo_id LIMIT 1) AS materia,
           (SELECT a.numero_grupo FROM asignaturas a WHERE a.crn = v.crn AND a.periodo_id = v.periodo_id LIMIT 1) AS grupo
    FROM v_opina_crn v WHERE v.docente_id = ? AND v.periodo_id = ? ORDER BY v.crn`).all(docenteId, periodo.id)
    .map((g) => ({ crn: g.crn, materia: g.materia, grupo: g.grupo, respuestas: g.respuestas, positivas: g.positivas, porcentaje: g.porcentaje }));

  return {
    ...vacioRes,
    global: { respuestas: filas.length, positivas, porcentaje: un((100 * positivas) / filas.length), muestraSuficiente: filas.length >= minimo },
    porCrn,
    reactivos: resumirReactivos(filas),
    razones: { porQueSi: razones(filas, 'por_que_si'), porQueNo: razones(filas, 'por_que_no') },
    comentarios: filas.filter((f) => (f.comentario ?? '').trim())
      .map((f) => ({ crn: f.crn, recomienda: f.recomienda === 1, texto: f.comentario.trim() })),
  };
}

// ------------------------------------------------------------------ comparativo docente × semestre

function listaPeriodos(db, valor) {
  if (vacio(valor)) {
    return db.prepare(`SELECT p.id, p.clave, p.fecha_inicio FROM periodos p
                       WHERE EXISTS (SELECT 1 FROM opina_respuestas r WHERE r.periodo_id = p.id)
                       ORDER BY p.fecha_inicio, p.id`).all();
  }
  const ids = (Array.isArray(valor) ? valor : String(valor).split(',')).map((x) => String(x).trim()).filter(Boolean).map(Number);
  if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new HttpError(400, 'La lista de semestres no es válida.', 'VALIDACION', [{ campo: 'periodos', problema: 'VALOR_INVALIDO' }]);
  }
  const unicos = [...new Set(ids)].map((id) => periodoPorId(db, id, 'periodos'));
  return unicos.sort((a, b) => String(a.fecha_inicio ?? '').localeCompare(String(b.fecha_inicio ?? '')) || a.id - b.id);
}

/** GET /opina/comparativo?periodos=1,2,3 */
function comparativo(db, query = {}) {
  const periodos = listaPeriodos(db, query.periodos);
  const minimo = campus.muestraMinima(db);
  const indice = new Map(periodos.map((p, i) => [p.id, i]));
  const docentes = new Map();
  if (periodos.length) {
    const filas = db.prepare(`
      SELECT v.periodo_id, v.docente_id, v.respuestas, v.positivas, d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno, d.activo
      FROM v_opina_docente v JOIN docentes d ON d.id = v.docente_id
      WHERE v.periodo_id IN (${periodos.map(() => '?').join(',')})`).all(...periodos.map((p) => p.id));
    for (const f of filas) {
      if (!docentes.has(f.docente_id)) {
        docentes.set(f.docente_id, { docenteId: f.docente_id, nomina: f.nomina, nombre: nombreDe(f), activo: f.activo === 1,
          celdas: periodos.map(() => null) });
      }
      docentes.get(f.docente_id).celdas[indice.get(f.periodo_id)] = {
        porcentaje: un((100 * f.positivas) / f.respuestas), respuestas: f.respuestas, muestraSuficiente: f.respuestas >= minimo,
      };
    }
  }
  const tabla = [...docentes.values()].map((d) => {
    const validas = d.celdas.filter((c) => c && c.muestraSuficiente);
    const variacion = validas.length >= 2 ? un(validas.at(-1).porcentaje - validas[0].porcentaje) : null;
    return { ...d, variacion, tendencia: variacion === null ? null : variacion > 0 ? 'sube' : variacion < 0 ? 'baja' : 'igual' };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    muestraMinima: minimo,
    periodos: periodos.map((p) => {
      const c = db.prepare('SELECT calificacion_campus, docentes FROM v_opina_campus WHERE periodo_id = ?').get(p.id);
      return { id: p.id, clave: p.clave, promedioMaestros: campus.promedioMaestros(db, p.id).promedio,
        calificacionCampus: c?.calificacion_campus ?? null, docentes: c?.docentes ?? 0 };
    }),
    docentes: tabla,
  };
}

module.exports = { detalleDocente, comparativo, ETIQUETAS_REACTIVOS };
