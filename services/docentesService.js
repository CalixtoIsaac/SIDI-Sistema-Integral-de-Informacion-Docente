/**
 * Consulta de docentes (HU-03, HU-04; 06 §Docentes; 07 §7.2).
 *
 *   listar(db, query)      → { docentes, total, page, limit, periodo, periodoOpina }  (12 campos + OPINA y faltas)
 *   detalle(db, id)        → ficha extendida con pestañas (tarifa diaria y mensual por CRN, total mensual)
 *   resumen(db, id)        → hover: nómina, contratos y CRN del semestre
 *   archivoCv(db, id)      → { ruta, nombre } del último CV, o 404
 *
 * Con ~50 docentes, los campos calculados se arman en JS a partir de pocas consultas.
 */
const fs = require('fs');
const path = require('path');
const curp = require('../lib/curp');
const antiguedad = require('../lib/antiguedad');
const config = require('../lib/configuracion');
const { formatoHorario } = require('../lib/horario');
const { nombreCompleto } = require('../lib/nombres');
const { HttpError } = require('../lib/errores');
const periodosService = require('./periodosService');

const RAIZ = path.join(__dirname, '..');
const LIMITE_MAXIMO = 500;

// ------------------------------------------------------------------ consultas base

function docentesBase(db) {
  return db.prepare(`
    SELECT d.*, e.nivel_estudios, e.estudia_actualmente, e.nivel_estudiando, pp.primer_inicio
    FROM docentes d
    LEFT JOIN v_docente_estudios e ON e.docente_id = d.id
    LEFT JOIN v_docente_primer_periodo pp ON pp.docente_id = d.id`).all();
}

/** Asignaturas del periodo con sus horarios y tarifa, agrupadas por docente. */
function asignaturasPorDocente(db, periodoId, docenteId = null) {
  if (!periodoId) return new Map();
  const filas = db.prepare(`
    SELECT a.*, t.nombre AS tipo_clase, t.pago_por_dia, t.pago_mensual, t.pago_semestre
    FROM asignaturas a LEFT JOIN tipos_clase t ON t.id = a.tipo_clase_id
    WHERE a.periodo_id = ? AND (? IS NULL OR a.docente_id = ?)
    ORDER BY a.crn IS NULL, a.crn, a.id`).all(periodoId, docenteId, docenteId);
  const horarios = db.prepare(`
    SELECT h.asignatura_id, h.dia_semana AS dia, h.hora_inicio AS inicio, h.hora_fin AS fin
    FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id
    WHERE a.periodo_id = ? AND (? IS NULL OR a.docente_id = ?)
    ORDER BY h.dia_semana, h.hora_inicio`).all(periodoId, docenteId, docenteId);
  const porAsignatura = new Map();
  for (const h of horarios) {
    if (!porAsignatura.has(h.asignatura_id)) porAsignatura.set(h.asignatura_id, []);
    porAsignatura.get(h.asignatura_id).push({ dia: h.dia, inicio: h.inicio, fin: h.fin });
  }
  const mapa = new Map();
  for (const a of filas) {
    a.horarios = porAsignatura.get(a.id) ?? [];
    if (!mapa.has(a.docente_id)) mapa.set(a.docente_id, []);
    mapa.get(a.docente_id).push(a);
  }
  return mapa;
}

/** Periodo más reciente con respuestas OPINA (la columna OPINA de la tabla usa ese). */
function periodoOpinaReciente(db) {
  return db.prepare(`
    SELECT p.* FROM periodos p
    WHERE EXISTS (SELECT 1 FROM opina_respuestas r WHERE r.periodo_id = p.id)
    ORDER BY p.fecha_inicio DESC, p.id DESC LIMIT 1`).get() ?? null;
}

function opinaPorDocente(db, periodoId) {
  if (!periodoId) return new Map();
  const filas = db.prepare('SELECT docente_id, respuestas, positivas, porcentaje FROM v_opina_docente WHERE periodo_id = ?').all(periodoId);
  return new Map(filas.map((f) => [f.docente_id, f]));
}

/** Faltas del periodo por docente (por fecha dentro del periodo, o asignatura del periodo). */
function faltasPorDocente(db, periodo) {
  if (!periodo) return new Map();
  const filas = db.prepare(`
    SELECT f.docente_id, COUNT(*) AS n FROM faltas f LEFT JOIN asignaturas a ON a.id = f.asignatura_id
    WHERE a.periodo_id = ? OR (f.fecha BETWEEN ? AND ?)
    GROUP BY f.docente_id`).all(periodo.id, periodo.fecha_inicio ?? '', periodo.fecha_fin ?? '');
  return new Map(filas.map((f) => [f.docente_id, f.n]));
}

// ------------------------------------------------------------------ armado de campos

function nombreDe(d) {
  return nombreCompleto({ nombres: d.nombres, apellidoPaterno: d.apellido_paterno, apellidoMaterno: d.apellido_materno });
}

function cumpleanos(fechaNacimiento) {
  return fechaNacimiento ? fechaNacimiento.slice(5, 10) : null;
}

function opinaDe(fila, muestraMinima) {
  if (!fila) return null;
  return {
    porcentaje: fila.porcentaje,
    respuestas: fila.respuestas,
    muestraInsuficiente: fila.respuestas < muestraMinima,
  };
}

function grupoCorto(a) {
  return {
    asignaturaId: a.id,
    crn: a.crn,
    materia: a.crn ? a.materia : a.nombre_actividad ?? a.materia,
    numeroGrupo: a.numero_grupo,
    horario: formatoHorario(a.horarios),
  };
}

/** Lista de datos que faltan ("Datos incompletos"). */
function incompletos(d, antig, asignaturas) {
  const faltan = [];
  if (!d.curp) faltan.push('curp');
  if (!d.campo_formacion) faltan.push('campoFormacion');
  if (!antig) faltan.push('primerSemestre');
  if (asignaturas.some((a) => a.crn && !a.num_contrato)) faltan.push('contrato');
  return faltan;
}

/** Fila de la tabla: 12 campos de 07 §7.2 + OPINA, faltas y datos de apoyo. */
function armarFila(d, ctx) {
  const asignaturas = ctx.asignaturas.get(d.id) ?? [];
  const antig = antiguedad.calcular(antiguedad.primerInicio(d.primer_inicio, d.primer_semestre_texto), ctx.hoy);
  return {
    id: d.id,
    activo: d.activo === 1,
    recontratable: d.recontratable === null ? null : d.recontratable === 1,
    nombre: nombreDe(d),
    nombres: d.nombres,
    apellidoPaterno: d.apellido_paterno,
    apellidoMaterno: d.apellido_materno,
    nomina: d.nomina,
    edad: curp.edad(d.fecha_nacimiento, ctx.hoy),
    genero: d.genero,
    curp: d.curp,
    numGrupos: asignaturas.length,
    grupos: asignaturas.map(grupoCorto),
    nivelEstudios: d.nivel_estudios ?? null,
    campoFormacion: d.campo_formacion,
    antiguedad: antig,
    estudiando: { si: d.estudia_actualmente === 1, nivel: d.nivel_estudiando ?? null },
    trabajoExterno: d.trabajo_externo,
    cumpleanos: cumpleanos(d.fecha_nacimiento),
    nivelImparte: d.nivel_imparte,
    opina: opinaDe(ctx.opina.get(d.id), ctx.muestraMinima),
    faltas: ctx.faltas.get(d.id) ?? 0,
    incompleto: incompletos(d, antig, asignaturas),
    origen: d.origen,
  };
}

function contexto(db, hoy = new Date()) {
  const periodo = periodosService.actualOUltimo(db);
  const periodoOpina = periodoOpinaReciente(db);
  return {
    hoy,
    periodo,
    periodoOpina,
    asignaturas: asignaturasPorDocente(db, periodo?.id),
    opina: opinaPorDocente(db, periodoOpina?.id),
    faltas: faltasPorDocente(db, periodo),
    muestraMinima: Number(config.obtener(db, 'opina.muestra_minima')) || 10,
  };
}

// ------------------------------------------------------------------ listar

function entero(valor, porDefecto, min, max) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(Math.max(n, min), max);
}

/** 'true'/'false' (texto de la query) → booleano; otro valor → undefined (sin filtro). */
function booleano(valor) {
  if (valor === true || valor === 'true' || valor === '1') return true;
  if (valor === false || valor === 'false' || valor === '0') return false;
  return undefined;
}

/** Filtros de estatus (HU-05) y recontratable (HU-21). Búsqueda y demás filtros: HU-06/07. */
function filtrarBasico(filas, query = {}) {
  const activo = booleano(query.activo);
  const recontratable = booleano(query.recontratable);
  return filas.filter((f) => (activo === undefined || f.activo === activo)
    && (recontratable === undefined || f.recontratable === recontratable));
}

const COMPARAR_NOMBRE = (a, b) => (`${a.apellidoPaterno} ${a.apellidoMaterno ?? ''} ${a.nombres}`)
  .localeCompare(`${b.apellidoPaterno} ${b.apellidoMaterno ?? ''} ${b.nombres}`, 'es', { sensitivity: 'base' });

/**
 * Tabla de docentes. Query: page, limit (por defecto todos). Los filtros y la búsqueda
 * (HU-06, HU-07) se aplican con `filtrar`, que por ahora deja pasar todo.
 */
function listar(db, query = {}, opciones = {}) {
  const ctx = contexto(db, opciones.hoy);
  let filas = docentesBase(db).map((d) => armarFila(d, ctx));
  filas = (opciones.filtrar ?? ((f) => f))(filas, query, ctx);
  filas.sort(opciones.comparar ?? COMPARAR_NOMBRE);
  const total = filas.length;
  const limit = entero(query.limit, LIMITE_MAXIMO, 1, LIMITE_MAXIMO);
  const page = entero(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
  return {
    docentes: filas.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    periodo: ctx.periodo?.clave ?? null,
    periodoOpina: ctx.periodoOpina?.clave ?? null,
  };
}

// ------------------------------------------------------------------ detalle

function obtenerDocente(db, id) {
  const d = db.prepare('SELECT * FROM docentes WHERE id = ?').get(id);
  if (!d) throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  return d;
}

function asignaturaDetalle(a) {
  const avisos = [];
  if (a.crn && !a.num_contrato) avisos.push('SIN_CONTRATO');
  if (!a.tipo_clase_id) avisos.push('SIN_TARIFA');
  return {
    id: a.id,
    crn: a.crn,
    nombreActividad: a.nombre_actividad,
    claveMateria: a.clave_materia,
    materia: a.materia,
    numeroGrupo: a.numero_grupo,
    modalidad: a.modalidad,
    plan: a.plan,
    horarios: a.horarios,
    horario: formatoHorario(a.horarios),
    horasSemana: a.horas_semana,
    idioma: a.idioma,
    tipoClaseId: a.tipo_clase_id,
    tipoClase: a.tipo_clase ?? null,
    tarifaDiaria: a.pago_por_dia ?? null,
    tarifaMensual: a.pago_mensual ?? null,
    numContrato: a.num_contrato,
    origen: a.origen,
    avisos,
  };
}

function leerJson(texto, porDefecto) {
  try {
    return JSON.parse(texto);
  } catch {
    return porDefecto;
  }
}

function titulosDe(db, id) {
  return db.prepare(`SELECT id, grado, nombre_titulo AS nombreTitulo, institucion, periodo_texto AS periodoTexto,
                            estatus, cedula, anio_obtencion AS anioObtencion, origen
                     FROM titulos_docente WHERE docente_id = ? ORDER BY id`).all(id);
}

function opinaPorPeriodo(db, id) {
  const global = db.prepare(`SELECT p.clave AS periodo, v.periodo_id AS periodoId, v.respuestas, v.positivas, v.porcentaje
                             FROM v_opina_docente v JOIN periodos p ON p.id = v.periodo_id
                             WHERE v.docente_id = ? ORDER BY p.fecha_inicio DESC`).all(id);
  const porCrn = db.prepare(`SELECT v.crn, v.respuestas, v.positivas, v.porcentaje,
                                    (SELECT a.materia FROM asignaturas a WHERE a.crn = v.crn AND a.periodo_id = v.periodo_id) AS materia
                             FROM v_opina_crn v WHERE v.docente_id = ? AND v.periodo_id = ? ORDER BY v.crn`);
  return global.map((g) => ({ ...g, porCrn: porCrn.all(id, g.periodoId) }));
}

function faltasDe(db, id) {
  return db.prepare(`SELECT f.id, f.fecha, f.fecha_texto AS fechaTexto, f.motivo, f.justificacion, f.monto_descuento AS montoDescuento,
                            a.crn, q.numero AS quincena, ds.id AS suplenteId,
                            ds.nombres || ' ' || ds.apellido_paterno AS suplente
                     FROM faltas f
                     LEFT JOIN asignaturas a ON a.id = f.asignatura_id
                     LEFT JOIN quincenas q ON q.id = f.quincena_id
                     LEFT JOIN suplencias s ON s.falta_id = f.id
                     LEFT JOIN docentes ds ON ds.id = s.docente_suplente_id
                     WHERE f.docente_id = ? ORDER BY f.fecha DESC, f.id DESC`).all(id);
}

function suplenciasCubiertasDe(db, id) {
  return db.prepare(`SELECT s.id, f.fecha, a.crn, s.monto, dt.id AS titularId,
                            dt.nombres || ' ' || dt.apellido_paterno AS titular
                     FROM suplencias s JOIN faltas f ON f.id = s.falta_id
                     LEFT JOIN asignaturas a ON a.id = f.asignatura_id
                     JOIN docentes dt ON dt.id = f.docente_id
                     WHERE s.docente_suplente_id = ? ORDER BY f.fecha DESC`).all(id);
}

function bajasDe(db, id) {
  return db.prepare(`SELECT b.id, b.fecha, p.clave AS periodo, b.motivo, b.observaciones,
                            b.recontratable, b.fecha_reactivacion AS fechaReactivacion
                     FROM docente_bajas b LEFT JOIN periodos p ON p.id = b.periodo_id
                     WHERE b.docente_id = ? ORDER BY b.fecha DESC, b.id DESC`).all(id)
    .map((b) => ({ ...b, recontratable: b.recontratable === 1 }));
}

function cvDe(db, id) {
  const cv = db.prepare(`SELECT nombre_original AS nombreOriginal, paginas, importado_en AS importadoEn
                         FROM cv_archivos WHERE docente_id = ? ORDER BY id DESC LIMIT 1`).get(id);
  return cv ? { disponible: true, ...cv } : { disponible: false };
}

/** Ficha extendida (pestañas de 05 §2). `periodoId` opcional (por defecto el actual). */
function detalle(db, id, opciones = {}) {
  const ctx = contexto(db, opciones.hoy);
  const base = docentesBase(db).find((d) => d.id === Number(id));
  if (!base) obtenerDocente(db, id);
  const fila = armarFila(base, ctx);
  const periodoId = opciones.periodoId ? Number(opciones.periodoId) : ctx.periodo?.id;
  const asignaturas = (asignaturasPorDocente(db, periodoId, base.id).get(base.id) ?? []).map(asignaturaDetalle);
  const extra = leerJson(base.datos_adicionales, {});
  const departamento = base.departamento_id
    ? db.prepare('SELECT nombre FROM departamentos WHERE id = ?').get(base.departamento_id)?.nombre ?? null
    : null;
  return {
    ...fila,
    fechaNacimiento: base.fecha_nacimiento,
    correoInstitucional: base.correo_institucional,
    tipoContrato: base.tipo_contrato,
    departamento,
    primerSemestreTexto: base.primer_semestre_texto,
    revisar: base.revisar,
    cursos: extra.cursos ?? [],
    idiomas: extra.idiomas ?? [],
    titulos: titulosDe(db, base.id),
    cv: cvDe(db, base.id),
    asignaturas,
    totalMensual: Math.round(asignaturas.reduce((s, a) => s + (a.tarifaMensual ?? 0), 0) * 100) / 100,
    faltasDetalle: faltasDe(db, base.id),
    suplenciasCubiertas: suplenciasCubiertasDe(db, base.id),
    opinaPeriodos: opinaPorPeriodo(db, base.id),
    bajas: bajasDe(db, base.id),
    creadoEn: base.creado_en,
    actualizadoEn: base.actualizado_en,
  };
}

/** Una asignatura con horarios y tarifa, en el formato de la ficha. 404 si no existe. */
function asignaturaPorId(db, id) {
  const a = db.prepare(`SELECT a.*, t.nombre AS tipo_clase, t.pago_por_dia, t.pago_mensual
                        FROM asignaturas a LEFT JOIN tipos_clase t ON t.id = a.tipo_clase_id WHERE a.id = ?`).get(id);
  if (!a) throw new HttpError(404, 'Esa asignatura no existe.', 'ASIGNATURA_NO_EXISTE');
  a.horarios = db.prepare(`SELECT dia_semana AS dia, hora_inicio AS inicio, hora_fin AS fin FROM horarios
                           WHERE asignatura_id = ? ORDER BY dia_semana, hora_inicio`).all(id);
  return { ...asignaturaDetalle(a), docenteId: a.docente_id, periodoId: a.periodo_id, editadoAMano: leerJson(a.editado_a_mano, []) };
}

// ------------------------------------------------------------------ resumen y CV

/** Hover: nómina, contratos y CRN del semestre actual. */
function resumen(db, id) {
  const d = obtenerDocente(db, id);
  const periodo = periodosService.actualOUltimo(db);
  const asignaturas = asignaturasPorDocente(db, periodo?.id, d.id).get(d.id) ?? [];
  return {
    id: d.id,
    nombre: nombreDe(d),
    nomina: d.nomina,
    activo: d.activo === 1,
    periodo: periodo?.clave ?? null,
    contratos: [...new Set(asignaturas.map((a) => a.num_contrato).filter(Boolean))],
    crn: asignaturas.map((a) => ({ crn: a.crn, materia: a.crn ? a.materia : a.nombre_actividad ?? a.materia, numeroGrupo: a.numero_grupo, numContrato: a.num_contrato })),
  };
}

/** Ruta absoluta del último CV del docente. 404 si no tiene o si el archivo ya no está. */
function archivoCv(db, id) {
  obtenerDocente(db, id);
  const cv = db.prepare('SELECT ruta, nombre_original FROM cv_archivos WHERE docente_id = ? ORDER BY id DESC LIMIT 1').get(id);
  if (!cv) throw new HttpError(404, 'Este docente no tiene CV cargado.', 'SIN_CV');
  const carpeta = path.join(RAIZ, 'data', 'cv');
  const ruta = path.resolve(RAIZ, cv.ruta);
  if (!ruta.startsWith(carpeta + path.sep) || !fs.existsSync(ruta)) {
    throw new HttpError(404, 'No se encontró el archivo del CV en data/cv/.', 'CV_NO_ENCONTRADO');
  }
  return { ruta, nombre: cv.nombre_original };
}

module.exports = { listar, filtrarBasico, booleano, detalle, asignaturaPorId, resumen, archivoCv, obtenerDocente, armarFila, contexto, COMPARAR_NOMBRE };
