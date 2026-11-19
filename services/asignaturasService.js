/**
 * Asignaturas (grupos con CRN) y actividades sin CRN del docente (HU-01; 06:
 * POST /docentes/:id/asignaturas, PUT/DELETE /asignaturas/:id).
 *
 * - Si no se manda tipoClaseId se calcula de (horas/semana, idioma) → tipos_clase.
 * - Si no se manda idioma se sugiere (07 §7.0.1); horas/semana sale de los horarios.
 * - Los campos editados aquí quedan en editado_a_mano para que reimportar el Excel
 *   de grupos no los pise. num_contrato nunca lo toca la importación.
 */
const horario = require('../lib/horario');
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');
const periodosService = require('./periodosService');
const docentesService = require('./docentesService');

function validarHorarios(v, prefijo, lista) {
  if (lista === undefined || lista === null) return [];
  if (!Array.isArray(lista)) return v.error(`${prefijo}horarios`, 'DEBE_SER_LISTA') ?? [];
  return lista.map((h, i) => {
    const dia = v.entero(`${prefijo}horarios[${i}].dia`, h?.dia, { min: 1, max: 7, obligatorio: true });
    const inicio = horario.normalizarHora(h?.inicio);
    const fin = horario.normalizarHora(h?.fin);
    if (!inicio || !fin || horario.duracionSesion(inicio, fin) === null) v.error(`${prefijo}horarios[${i}]`, 'HORAS_INVALIDAS');
    return { dia, inicio, fin };
  });
}

function validarContrato(v, campo, valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const t = String(valor).trim();
  return /^\d+$/.test(t) ? t : v.error(campo, 'SOLO_DIGITOS');
}

function validarTipoClase(db, v, campo, valor) {
  const id = v.entero(campo, valor, { min: 1 });
  if (id && !db.prepare('SELECT 1 FROM tipos_clase WHERE id = ?').get(id)) v.error(campo, 'NO_EXISTE');
  return id;
}

function tarifaPara(db, horas, idioma) {
  if (horas === null || horas === undefined || !idioma) return null;
  return db.prepare('SELECT id FROM tipos_clase WHERE horas_semana = ? AND idioma = ? AND activo = 1').get(horas, idioma)?.id ?? null;
}

function guardarHorarios(db, asignaturaId, horarios) {
  db.prepare('DELETE FROM horarios WHERE asignatura_id = ?').run(asignaturaId);
  const ins = db.prepare('INSERT INTO horarios (asignatura_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');
  for (const h of horarios) ins.run(asignaturaId, h.dia, h.inicio, h.fin);
}

function revisarCrnLibre(db, crn, periodoId, idActual = null) {
  if (!crn) return;
  const otro = db.prepare('SELECT id, docente_id FROM asignaturas WHERE crn = ? AND periodo_id = ? AND id IS NOT ?').get(crn, periodoId, idActual);
  if (otro) throw new HttpError(409, `El CRN ${crn} ya está registrado en ese periodo.`, 'CRN_DUPLICADO', [{ asignaturaId: otro.id, docenteId: otro.docente_id }]);
}

/** Valida los campos comunes de alta. */
function validarAlta(db, body, prefijo) {
  const v = new Validador();
  const periodoId = body.periodoId ? v.entero(`${prefijo}periodoId`, body.periodoId, { min: 1 }) : periodosService.actualOUltimo(db)?.id;
  if (!periodoId || !db.prepare('SELECT 1 FROM periodos WHERE id = ?').get(periodoId)) v.error(`${prefijo}periodoId`, 'NO_EXISTE');
  const crn = v.texto(`${prefijo}crn`, body.crn, { max: 10 });
  if (crn && !/^\d+$/.test(crn)) v.error(`${prefijo}crn`, 'SOLO_DIGITOS');
  const nombreActividad = v.texto(`${prefijo}nombreActividad`, body.nombreActividad, { max: 150 });
  if (!crn && !nombreActividad) v.error(`${prefijo}crn`, 'CRN_O_ACTIVIDAD');
  const a = {
    periodo_id: periodoId,
    crn,
    nombre_actividad: crn ? null : nombreActividad,
    materia: v.texto(`${prefijo}materia`, body.materia ?? (crn ? undefined : nombreActividad), { obligatorio: true, max: 200 }),
    clave_materia: v.texto(`${prefijo}claveMateria`, body.claveMateria, { max: 20 })?.toUpperCase() ?? null,
    numero_grupo: v.texto(`${prefijo}numeroGrupo`, body.numeroGrupo, { max: 10 })?.toUpperCase() ?? null,
    modalidad: v.texto(`${prefijo}modalidad`, body.modalidad, { max: 60 }),
    num_contrato: validarContrato(v, `${prefijo}numContrato`, body.numContrato),
  };
  const horarios = validarHorarios(v, prefijo, body.horarios);
  const horasEnviadas = trae(body, 'horasSemana') && body.horasSemana !== null;
  const horas = horasEnviadas ? Number(body.horasSemana) : null;
  if (horasEnviadas && (!Number.isFinite(horas) || horas <= 0 || horas > 40)) v.error(`${prefijo}horasSemana`, 'VALOR_INVALIDO');
  const idioma = v.opcion(`${prefijo}idioma`, body.idioma, ['ES', 'EN']);
  const tipo = trae(body, 'tipoClaseId') ? validarTipoClase(db, v, `${prefijo}tipoClaseId`, body.tipoClaseId) : null;
  v.terminar();
  return { a, horarios, horas: horasEnviadas ? horas : null, idioma, tipo };
}

/** Alta de un grupo o actividad del docente. Devuelve la asignatura en formato de ficha. */
function crear(db, docenteId, body = {}, prefijo = '') {
  if (!db.prepare('SELECT 1 FROM docentes WHERE id = ?').get(docenteId)) throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  const { a, horarios, horas, idioma, tipo } = validarAlta(db, body, prefijo);
  revisarCrnLibre(db, a.crn, a.periodo_id);
  const calculadas = horarios.length ? horario.horasSemana(horarios) : null;
  const fila = {
    ...a,
    docente_id: docenteId,
    plan: horario.plan(a.modalidad),
    horas_semana: horas ?? calculadas,
    idioma: idioma ?? horario.idiomaSugerido(a.clave_materia, a.modalidad),
  };
  fila.tipo_clase_id = tipo ?? tarifaPara(db, fila.horas_semana, fila.idioma);
  const editados = [idioma && 'idioma', horas !== null && 'horas_semana', tipo && 'tipo_clase_id'].filter(Boolean);
  const id = db.transaction(() => {
    const r = db.prepare(`INSERT INTO asignaturas (periodo_id, docente_id, crn, nombre_actividad, clave_materia, materia, numero_grupo,
                            modalidad, plan, horas_semana, idioma, tipo_clase_id, num_contrato, origen, editado_a_mano)
                          VALUES (@periodo_id, @docente_id, @crn, @nombre_actividad, @clave_materia, @materia, @numero_grupo,
                            @modalidad, @plan, @horas_semana, @idioma, @tipo_clase_id, @num_contrato, 'manual', @editado)`)
      .run({ ...fila, editado: JSON.stringify(editados) });
    const nuevoId = Number(r.lastInsertRowid);
    guardarHorarios(db, nuevoId, horarios);
    return nuevoId;
  })();
  return docentesService.asignaturaPorId(db, id);
}

const EDITABLES = {
  materia: 'materia', claveMateria: 'clave_materia', numeroGrupo: 'numero_grupo', modalidad: 'modalidad',
  idioma: 'idioma', horasSemana: 'horas_semana', tipoClaseId: 'tipo_clase_id', numContrato: 'num_contrato',
  nombreActividad: 'nombre_actividad',
};

function leerEditados(texto) {
  try {
    const l = JSON.parse(texto || '[]');
    return new Set(Array.isArray(l) ? l : []);
  } catch {
    return new Set();
  }
}

/** Valida una edición parcial y devuelve las columnas a cambiar. */
function validarEdicion(db, body, actual) {
  const v = new Validador();
  const c = {};
  if (trae(body, 'materia')) c.materia = v.texto('materia', body.materia, { obligatorio: true, max: 200 });
  if (trae(body, 'claveMateria')) c.clave_materia = v.texto('claveMateria', body.claveMateria, { max: 20 })?.toUpperCase() ?? null;
  if (trae(body, 'numeroGrupo')) c.numero_grupo = v.texto('numeroGrupo', body.numeroGrupo, { max: 10 })?.toUpperCase() ?? null;
  if (trae(body, 'modalidad')) c.modalidad = v.texto('modalidad', body.modalidad, { max: 60 });
  if (trae(body, 'nombreActividad') && !actual.crn) c.nombre_actividad = v.texto('nombreActividad', body.nombreActividad, { obligatorio: true, max: 150 });
  if (trae(body, 'idioma')) c.idioma = v.opcion('idioma', body.idioma, ['ES', 'EN'], { obligatorio: true });
  if (trae(body, 'horasSemana')) {
    const h = Number(body.horasSemana);
    c.horas_semana = Number.isFinite(h) && h > 0 && h <= 40 ? h : v.error('horasSemana', 'VALOR_INVALIDO');
  }
  if (trae(body, 'tipoClaseId')) c.tipo_clase_id = body.tipoClaseId === null ? null : validarTipoClase(db, v, 'tipoClaseId', body.tipoClaseId);
  if (trae(body, 'numContrato')) c.num_contrato = validarContrato(v, 'numContrato', body.numContrato);
  const horarios = trae(body, 'horarios') ? validarHorarios(v, '', body.horarios) : null;
  v.terminar();
  return { c, horarios };
}

/** PUT /asignaturas/:id — edición parcial; marca los campos como editados a mano. */
function actualizar(db, id, body = {}) {
  const actual = db.prepare('SELECT * FROM asignaturas WHERE id = ?').get(id);
  if (!actual) throw new HttpError(404, 'Esa asignatura no existe.', 'ASIGNATURA_NO_EXISTE');
  const { c, horarios } = validarEdicion(db, body, actual);
  const editados = leerEditados(actual.editado_a_mano);
  for (const [campo, col] of Object.entries(EDITABLES)) if (trae(body, campo) && col !== 'num_contrato') editados.add(col);
  if (horarios) {
    editados.add('horarios');
    if (!trae(body, 'horasSemana')) c.horas_semana = horarios.length ? horario.horasSemana(horarios) : null;
  }
  if (c.modalidad !== undefined) c.plan = horario.plan(c.modalidad);
  if (!trae(body, 'tipoClaseId') && !editados.has('tipo_clase_id') && (c.idioma !== undefined || c.horas_semana !== undefined)) {
    c.tipo_clase_id = tarifaPara(db, c.horas_semana ?? actual.horas_semana, c.idioma ?? actual.idioma);
  }
  db.transaction(() => {
    const cols = Object.keys(c);
    db.prepare(`UPDATE asignaturas SET ${[...cols.map((k) => `${k} = @${k}`), 'editado_a_mano = @editado'].join(', ')} WHERE id = @id`)
      .run({ ...c, editado: JSON.stringify([...editados]), id });
    if (horarios) guardarHorarios(db, id, horarios);
  })();
  return docentesService.asignaturaPorId(db, id);
}

/** DELETE /asignaturas/:id — no se puede si tiene faltas registradas. */
function eliminar(db, id) {
  if (!db.prepare('SELECT 1 FROM asignaturas WHERE id = ?').get(id)) throw new HttpError(404, 'Esa asignatura no existe.', 'ASIGNATURA_NO_EXISTE');
  const faltas = db.prepare('SELECT COUNT(*) AS n FROM faltas WHERE asignatura_id = ?').get(id).n;
  if (faltas > 0) throw new HttpError(409, `No se puede eliminar: tiene ${faltas} falta(s) registradas.`, 'TIENE_FALTAS');
  db.prepare('DELETE FROM asignaturas WHERE id = ?').run(id);
}

module.exports = { crear, actualizar, eliminar };
