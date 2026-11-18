/**
 * Panel con gráficas (HU-15; 06 §Analítica; 05 §Panel).
 *
 *   kpis(db, { periodoId?, quincenaId? })     GET /analitica/kpis
 *   opina(db, { periodoId? })                 GET /analitica/opina
 *   distribucionNivel(db, { periodoId? })     GET /analitica/distribucion-nivel
 *   perfilDocentes(db, { activo? })           GET /analitica/perfil-docentes
 *   faltasPorMotivo(db, { periodoId? })       GET /analitica/faltas-por-motivo
 *   cumpleanosMes(db, { mes? })               GET /analitica/cumpleanos-mes
 *
 * Sin periodoId se usa el semestre actual; para OPINA, el último semestre que tenga OPINA importado
 * (el semestre en curso normalmente aún no lo tiene). Sin quincenaId, la quincena de hoy.
 * Nunca se devuelven comentarios de alumnos ni observaciones de baja.
 */
const { HttpError } = require('../lib/errores');
const { nombreCompleto } = require('../lib/nombres');
const { partesFecha } = require('../lib/quincena');
const antiguedad = require('../lib/antiguedad');
const analitica = require('../lib/analitica');
const quincenas = require('./quincenasService');
const reportes = require('./reporteService');
const inasistencias = require('./inasistenciasService');
const campus = require('./opinaCampusService');

const redondear = (n) => Math.round(n * 100) / 100;
const nombre = (r) => nombreCompleto({ nombres: r.nombres, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno });

function periodoPorId(db, periodoId) {
  const p = db.prepare('SELECT id, clave FROM periodos WHERE id = ?').get(Number(periodoId));
  if (!p) throw new HttpError(404, 'Ese semestre no existe.', 'PERIODO_NO_EXISTE');
  return p;
}

function periodoActual(db, periodoId) {
  if (periodoId !== undefined && periodoId !== null && periodoId !== '') return periodoPorId(db, periodoId);
  return db.prepare('SELECT id, clave FROM periodos WHERE actual = 1').get() ?? null;
}

/** Semestre para OPINA: el pedido, o el más reciente con respuestas importadas. */
function periodoOpina(db, periodoId) {
  if (periodoId !== undefined && periodoId !== null && periodoId !== '') return periodoPorId(db, periodoId);
  return db.prepare(`SELECT p.id, p.clave FROM periodos p
                     WHERE EXISTS (SELECT 1 FROM opina_respuestas r WHERE r.periodo_id = p.id)
                     ORDER BY p.fecha_inicio DESC LIMIT 1`).get() ?? null;
}

function quincenaDe(db, quincenaId, hoy) {
  if (quincenaId !== undefined && quincenaId !== null && quincenaId !== '') return quincenas.obtener(db, quincenaId);
  try {
    return quincenas.actual(db, hoy);
  } catch {
    return null; // no hay quincenas cargadas para hoy
  }
}

// ------------------------------------------------------------------ KPIs

/** GET /analitica/kpis?periodoId=&quincenaId= */
function kpis(db, query = {}, hoy = new Date()) {
  const periodo = periodoActual(db, query.periodoId);
  const q = quincenaDe(db, query.quincenaId, hoy);
  const d = db.prepare(`SELECT SUM(activo = 1) AS activos, SUM(activo = 0) AS inactivos, COUNT(*) AS total,
                               SUM(activo = 1 AND EXISTS (SELECT 1 FROM asignaturas a WHERE a.docente_id = docentes.id AND a.periodo_id = ?)) AS conClase
                        FROM docentes`).get(periodo?.id ?? -1);

  let quincena = null;
  if (q) {
    const faltasQ = reportes.faltasDeQuincena(db, q);
    const pagado = faltasQ.length
      ? db.prepare(`SELECT COALESCE(SUM(monto), 0) AS s FROM suplencias WHERE falta_id IN (${faltasQ.map(() => '?').join(',')})`).get(...faltasQ.map((f) => f.id)).s
      : 0;
    const descontado = faltasQ.filter((f) => f.justificacion === 'ninguna').reduce((s, f) => s + f.monto_descuento, 0);
    quincena = {
      id: q.id, anio: q.anio, numero: q.numero, fechaPago: q.fechaPago, cerrada: q.cerrada,
      faltas: faltasQ.length, descontado: redondear(descontado), pagadoSuplentes: redondear(pagado),
    };
  }

  const pOpina = periodoOpina(db, null);
  const prom = pOpina ? campus.promedioMaestros(db, pOpina.id) : null;
  const sem = periodo ? inasistencias.resumenSemestral(db, { periodoId: periodo.id }).indicadores : null;
  return {
    periodo,
    docentes: { activos: d.activos ?? 0, inactivos: d.inactivos ?? 0, total: d.total, conClaseEnSemestre: d.conClase ?? 0 },
    quincena,
    faltasSemestre: sem ? { faltas: sem.faltas, profesores: sem.profesores, descontado: sem.montoDescontado, pagadoSuplentes: sem.pagadoSuplentes } : null,
    opina: pOpina ? { periodo: pOpina, promedioMaestros: prom.promedio, docentes: prom.docentes } : null,
  };
}

// ------------------------------------------------------------------ OPINA por maestro

/** GET /analitica/opina?periodoId= → barras de % por maestro (más alto primero) */
function opina(db, query = {}) {
  const periodo = periodoOpina(db, query.periodoId);
  if (!periodo) return { periodo: null, promedioMaestros: null, calificacionCampus: null, muestraMinima: campus.muestraMinima(db), docentes: [] };
  const minimo = campus.muestraMinima(db);
  const docentes = db.prepare(`SELECT v.docente_id, v.respuestas, v.positivas, d.nombres, d.apellido_paterno, d.apellido_materno, d.activo
                               FROM v_opina_docente v JOIN docentes d ON d.id = v.docente_id WHERE v.periodo_id = ?`).all(periodo.id)
    .map((r) => ({
      docenteId: r.docente_id,
      nombre: nombre(r),
      activo: r.activo === 1,
      porcentaje: Math.round(1000 * r.positivas / r.respuestas) / 10,
      respuestas: r.respuestas,
      positivas: r.positivas,
      muestraSuficiente: r.respuestas >= minimo,
    }))
    .sort((a, b) => b.muestraSuficiente - a.muestraSuficiente || b.porcentaje - a.porcentaje || b.respuestas - a.respuestas || a.nombre.localeCompare(b.nombre, 'es'));
  const c = db.prepare('SELECT calificacion_campus FROM v_opina_campus WHERE periodo_id = ?').get(periodo.id);
  return {
    periodo,
    promedioMaestros: campus.promedioMaestros(db, periodo.id).promedio,
    calificacionCampus: c?.calificacion_campus ?? null,
    muestraMinima: minimo,
    docentes,
  };
}

// ------------------------------------------------------------------ Docentes por nivel que imparten

/** GET /analitica/distribucion-nivel?periodoId= → docentes activos por plan (General / Bilingüe) */
function distribucionNivel(db, query = {}) {
  const periodo = periodoActual(db, query.periodoId);
  const filas = db.prepare(`SELECT a.docente_id, a.plan FROM asignaturas a JOIN docentes d ON d.id = a.docente_id
                            WHERE a.periodo_id = ? AND d.activo = 1 AND a.plan IS NOT NULL`).all(periodo?.id ?? -1);
  const porPlan = new Map();
  const planesPorDocente = new Map();
  for (const f of filas) {
    if (!porPlan.has(f.plan)) porPlan.set(f.plan, { docentes: new Set(), grupos: 0 });
    porPlan.get(f.plan).docentes.add(f.docente_id);
    porPlan.get(f.plan).grupos += 1;
    if (!planesPorDocente.has(f.docente_id)) planesPorDocente.set(f.docente_id, new Set());
    planesPorDocente.get(f.docente_id).add(f.plan);
  }
  const orden = ['Bachillerato General', 'Bachillerato General Bilingüe'];
  const niveles = [...new Set([...orden, ...porPlan.keys()])]
    .map((nivel) => ({ nivel, docentes: porPlan.get(nivel)?.docentes.size ?? 0, grupos: porPlan.get(nivel)?.grupos ?? 0 }));
  return {
    periodo,
    niveles,
    ambos: [...planesPorDocente.values()].filter((s) => s.size > 1).length,
    totalDocentes: planesPorDocente.size,
  };
}

// ------------------------------------------------------------------ Perfil de la plantilla

const RANGOS_ANTIGUEDAD = [
  ['Menos de 1 año', 0, 0], ['1 a 2 años', 1, 2], ['3 a 5 años', 3, 5], ['6 a 10 años', 6, 10], ['Más de 10 años', 11, Infinity],
];

function filtroActivo(valor) {
  if (valor === undefined || valor === null || valor === '' || valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  if (valor === 'todos') return null;
  throw new HttpError(400, 'activo debe ser true, false o todos.', 'VALIDACION', [{ campo: 'activo', problema: 'VALOR_INVALIDO' }]);
}

/** GET /analitica/perfil-docentes?activo=true|false|todos */
function perfilDocentes(db, query = {}, hoy = new Date()) {
  const activo = filtroActivo(query.activo);
  const where = activo === null ? '' : `WHERE d.activo = ${activo ? 1 : 0}`;
  const docentes = db.prepare(`SELECT d.id, d.campo_formacion, d.primer_semestre_texto, pp.primer_inicio
                               FROM docentes d LEFT JOIN v_docente_primer_periodo pp ON pp.docente_id = d.id ${where}`).all();

  const campos = new Map();
  for (const d of docentes) campos.set(d.campo_formacion ?? 'ninguno', (campos.get(d.campo_formacion ?? 'ninguno') ?? 0) + 1);
  const catalogo = db.prepare("SELECT valor FROM catalogos WHERE tipo = 'campo_formacion' AND activo = 1 ORDER BY orden, valor").all().map((c) => c.valor);
  const campoFormacion = [...new Set([...catalogo, ...[...campos.keys()].filter((k) => k !== 'ninguno')])]
    .map((campo) => ({ campo, docentes: campos.get(campo) ?? 0 }));
  if (campos.get('ninguno')) campoFormacion.push({ campo: 'ninguno', docentes: campos.get('ninguno') });

  const conteo = RANGOS_ANTIGUEDAD.map(([rango, min, max]) => ({ rango, min, max: max === Infinity ? null : max, docentes: 0 }));
  let sinDato = 0;
  for (const d of docentes) {
    const a = antiguedad.calcular(antiguedad.primerInicio(d.primer_inicio, d.primer_semestre_texto), hoy);
    if (!a) { sinDato += 1; continue; }
    conteo.find((r) => a.anios >= r.min && (r.max === null || a.anios <= r.max)).docentes += 1;
  }
  if (sinDato) conteo.push({ rango: 'ninguno', min: null, max: null, docentes: sinDato });

  return {
    activo,
    total: docentes.length,
    genero: analitica.docentesPorGenero(db, { activo }),
    nivelEstudios: analitica.docentesPorNivelEstudios(db, { activo }),
    campoFormacion,
    antiguedad: conteo,
  };
}

// ------------------------------------------------------------------ Faltas por motivo

/** GET /analitica/faltas-por-motivo?periodoId= → por motivo y por los 2 tipos (G9) */
function faltasPorMotivo(db, query = {}) {
  const r = inasistencias.resumenSemestral(db, { periodoId: query.periodoId });
  return { periodo: r.periodo, total: r.indicadores.faltas, porMotivo: r.porMotivo, porTipo: r.porTipo };
}

// ------------------------------------------------------------------ Cumpleaños

/** GET /analitica/cumpleanos-mes?mes=1..12 (por defecto el mes de hoy) → docentes activos, por día */
function cumpleanosMes(db, query = {}, hoy = new Date()) {
  const h = partesFecha(hoy);
  let mes = h.mes;
  if (query.mes !== undefined && query.mes !== null && query.mes !== '') {
    mes = Number(query.mes);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new HttpError(400, 'El mes debe ser de 1 a 12.', 'VALIDACION', [{ campo: 'mes', problema: 'VALOR_INVALIDO' }]);
    }
  }
  const docentes = db.prepare(`SELECT id, nombres, apellido_paterno, apellido_materno, fecha_nacimiento FROM docentes
                               WHERE activo = 1 AND fecha_nacimiento IS NOT NULL AND CAST(substr(fecha_nacimiento, 6, 2) AS INTEGER) = ?`).all(mes)
    .map((r) => {
      const anio = Number(r.fecha_nacimiento.slice(0, 4));
      const dia = Number(r.fecha_nacimiento.slice(8, 10));
      return {
        docenteId: r.id,
        nombre: nombre(r),
        dia,
        cumple: h.anio - anio,
        esHoy: mes === h.mes && dia === h.dia,
        yaPaso: mes < h.mes || (mes === h.mes && dia < h.dia),
      };
    })
    .sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre, 'es'));
  return { mes, docentes };
}

module.exports = { kpis, opina, distribucionNivel, perfilDocentes, faltasPorMotivo, cumpleanosMes, RANGOS_ANTIGUEDAD };
