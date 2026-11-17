/**
 * Grupos a suplir y docentes disponibles (HU-22; 06 §Faltas · POST /faltas/disponibles; 04 §5).
 *
 *   disponibles(db, { docenteId, fechas, asignaturaIds?, verTodos? })
 *     → { gruposASuplir: [{ asignaturaId, crn, materia, grupo, fecha, dia, sesion, inicio, fin,
 *                           disponibles: [...], totalDisponibles, conEmpalme }], avisos }
 *
 * Un docente está disponible para una sesión si:
 *   - está activo y no es el titular,
 *   - no tiene falta registrada ese día,
 *   - no tiene clase que se empalme (mismo día de la semana, en el periodo de la fecha) y
 *   - no está ya cubriendo otro grupo a esa hora ese día.
 * Orden: no recontratables al final (⚠) → misma materia ★ → da clases ese día → menos suplencias en el
 * periodo → alfabético. Con verTodos también salen los que tienen empalme, al final y marcados (la
 * pantalla pide confirmación al elegirlos).
 * Si no se mandan asignaturaIds se usan las del titular que tienen clase ese día.
 */
const { HttpError } = require('../lib/errores');
const { Validador } = require('../lib/validar');
const { diaSemana, nombreDia, seEmpalman } = require('../lib/horario');
const { nombreCompleto } = require('../lib/nombres');
const d = require('./descuentoService');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function periodoDeFecha(db, fecha) {
  return db.prepare('SELECT * FROM periodos WHERE fecha_inicio <= ? ORDER BY fecha_inicio DESC LIMIT 1').get(fecha)
    ?? db.prepare('SELECT * FROM periodos WHERE actual = 1').get() ?? null;
}

function nombre(r) {
  return nombreCompleto({ nombres: r.nombres, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno });
}

function validar(db, body) {
  const v = new Validador();
  const titular = db.prepare('SELECT id FROM docentes WHERE id = ?').get(Number(body.docenteId));
  if (body.docenteId === undefined || body.docenteId === null || body.docenteId === '') v.error('docenteId', 'OBLIGATORIO');
  else if (!titular) throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  let fechas = [];
  if (!Array.isArray(body.fechas) || !body.fechas.length) v.error('fechas', 'OBLIGATORIO');
  else {
    body.fechas.forEach((f, i) => { if (!FECHA.test(String(f)) || !diaSemana(f)) v.error(`fechas[${i}]`, 'FECHA_INVALIDA'); });
    fechas = [...new Set(body.fechas.map(String))].sort();
  }
  let asignaturas = null;
  if (body.asignaturaIds !== undefined && body.asignaturaIds !== null) {
    if (!Array.isArray(body.asignaturaIds)) v.error('asignaturaIds', 'DEBE_SER_LISTA');
    else {
      asignaturas = [];
      for (const id of [...new Set(body.asignaturaIds.map(Number))]) {
        const a = d.asignaturaParaFalta(db, id);
        if (!a || a.docente_id !== titular?.id) v.error(`asignaturaIds.${id}`, 'NO_ES_DEL_DOCENTE');
        else asignaturas.push(a);
      }
    }
  }
  v.terminar();
  return { titularId: titular.id, fechas, asignaturas, verTodos: body.verTodos === true || body.verTodos === 'true' };
}

/** Asignaturas del titular con clase ese día (si no se eligieron). */
function asignaturasDelDia(db, titularId, periodo, fecha) {
  if (!periodo) return [];
  return db.prepare('SELECT id FROM asignaturas WHERE docente_id = ? AND periodo_id = ? ORDER BY crn IS NULL, crn')
    .all(titularId, periodo.id)
    .map((x) => d.asignaturaParaFalta(db, x.id))
    .filter((a) => d.sesionesEseDia(a, fecha).length > 0);
}

/**
 * Todo lo que hace falta para una fecha (se consulta una vez y se reusa en cada sesión):
 * candidatos activos, sus clases de ese día, sus suplencias de ese día, su carga del periodo.
 */
function contextoDelDia(db, titularId, fecha, periodo) {
  const dia = diaSemana(fecha);
  const periodoId = periodo?.id ?? -1;
  const candidatos = db.prepare(`
    SELECT d.id, d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno, d.recontratable
    FROM docentes d
    WHERE d.activo = 1 AND d.id <> ?
      AND NOT EXISTS (SELECT 1 FROM faltas f WHERE f.docente_id = d.id AND f.fecha = ?)`).all(titularId, fecha);

  // Clases de todos ese día de la semana (usa idx_horarios_dia_hora)
  const clases = new Map();
  for (const c of db.prepare(`
      SELECT a.docente_id, a.crn, a.nombre_actividad, a.materia, h.hora_inicio AS inicio, h.hora_fin AS fin
      FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id
      WHERE h.dia_semana = ? AND a.periodo_id = ?`).all(dia, periodoId)) {
    if (!clases.has(c.docente_id)) clases.set(c.docente_id, []);
    clases.get(c.docente_id).push({ dia, inicio: c.inicio, fin: c.fin, crn: c.crn ?? c.nombre_actividad, materia: c.materia, motivo: 'clase' });
  }

  // Grupos que ya cubren ese día (suplencias de otras faltas con la misma fecha)
  for (const s of db.prepare(`
      SELECT s.docente_suplente_id AS docente_id, a.id AS asignatura_id, a.crn, a.nombre_actividad, a.materia, f.sesion
      FROM suplencias s JOIN faltas f ON f.id = s.falta_id JOIN asignaturas a ON a.id = f.asignatura_id
      WHERE f.fecha = ?`).all(fecha)) {
    const sesiones = d.sesionesEseDia(d.asignaturaParaFalta(db, s.asignatura_id), fecha);
    const h = sesiones[s.sesion - 1] ?? sesiones[0];
    if (!h) continue;
    if (!clases.has(s.docente_id)) clases.set(s.docente_id, []);
    clases.get(s.docente_id).push({ dia, inicio: h.inicio, fin: h.fin, crn: s.crn ?? s.nombre_actividad, materia: s.materia, motivo: 'suplencia' });
  }

  const materias = new Map();
  for (const m of db.prepare('SELECT docente_id, clave_materia, materia FROM asignaturas WHERE periodo_id = ?').all(periodoId)) {
    if (!materias.has(m.docente_id)) materias.set(m.docente_id, new Set());
    if (m.clave_materia) materias.get(m.docente_id).add(`c:${m.clave_materia}`);
    materias.get(m.docente_id).add(`m:${String(m.materia).trim().toLowerCase()}`);
  }

  const suplencias = new Map(db.prepare(`
      SELECT s.docente_suplente_id AS id, COUNT(*) AS n
      FROM suplencias s JOIN faltas f ON f.id = s.falta_id JOIN asignaturas a ON a.id = f.asignatura_id
      WHERE a.periodo_id = ? GROUP BY s.docente_suplente_id`).all(periodoId).map((r) => [r.id, r.n]));

  return { dia, candidatos, clases, materias, suplencias };
}

function mismaMateria(ctx, docenteId, a) {
  const m = ctx.materias.get(docenteId);
  if (!m) return false;
  return (a.clave_materia && m.has(`c:${a.clave_materia}`)) || m.has(`m:${String(a.materia).trim().toLowerCase()}`);
}

const comparar = (x, y) => (x.empalme - y.empalme)
  || ((x.recontratable === 0) - (y.recontratable === 0))
  || (y.mismaMateria - x.mismaMateria)
  || (y.daClaseEseDia - x.daClaseEseDia)
  || (x.suplenciasPeriodo - y.suplenciasPeriodo)
  || x.nombre.localeCompare(y.nombre, 'es');

function candidatosDeSesion(ctx, a, sesion) {
  const lista = [];
  for (const c of ctx.candidatos) {
    const suyas = ctx.clases.get(c.id) ?? [];
    const empalmes = suyas.filter((h) => seEmpalman(h, sesion));
    const fila = {
      docenteId: c.id,
      nomina: c.nomina,
      nombre: nombre(c),
      mismaMateria: mismaMateria(ctx, c.id, a),
      daClaseEseDia: suyas.some((h) => h.motivo === 'clase'),
      suplenciasPeriodo: ctx.suplencias.get(c.id) ?? 0,
      recontratable: c.recontratable,
      empalme: empalmes.length > 0,
      avisos: c.recontratable === 0 ? ['NO_RECONTRATABLE'] : [],
    };
    if (empalmes.length) fila.empalmes = empalmes.map(({ crn, materia, inicio, fin, motivo }) => ({ crn, materia, inicio, fin, motivo }));
    lista.push(fila);
  }
  return lista.sort(comparar);
}

/** POST /faltas/disponibles */
function disponibles(db, body = {}) {
  const { titularId, fechas, asignaturas, verTodos } = validar(db, body);
  const gruposASuplir = [];
  const avisos = [];
  for (const fecha of fechas) {
    const periodo = periodoDeFecha(db, fecha);
    const ctx = contextoDelDia(db, titularId, fecha, periodo);
    const delDia = asignaturas ?? asignaturasDelDia(db, titularId, periodo, fecha);
    for (const a of delDia) {
      const sesiones = d.sesionesEseDia(a, fecha);
      if (!sesiones.length) {
        avisos.push({ asignaturaId: a.id, fecha, tipo: 'SIN_CLASE_ESE_DIA' });
        continue;
      }
      sesiones.forEach((h, i) => {
        const sesion = { dia: ctx.dia, inicio: h.inicio, fin: h.fin };
        const lista = candidatosDeSesion(ctx, a, sesion);
        const libres = lista.filter((x) => !x.empalme);
        gruposASuplir.push({
          asignaturaId: a.id,
          crn: a.crn,
          materia: a.nombre_actividad ?? a.materia,
          grupo: a.numero_grupo,
          fecha,
          dia: nombreDia(ctx.dia),
          sesion: i + 1,
          inicio: h.inicio,
          fin: h.fin,
          disponibles: verTodos ? lista : libres,
          totalDisponibles: libres.length,
          conEmpalme: lista.length - libres.length,
        });
      });
    }
  }
  return { gruposASuplir, avisos };
}

module.exports = { disponibles };
