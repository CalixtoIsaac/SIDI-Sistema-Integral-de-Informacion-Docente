/**
 * Importación del Excel de grupos docentes (HU-02, 07 §7.0.3, 06 §Carga del Excel de grupos).
 *
 *   preview(db, archivo)  → lee, compara con la BD y guarda la vista previa en memoria (NO escribe)
 *   confirm(db, body)     → aplica la vista previa en UNA transacción
 *   importaciones(db)     → historial
 *
 * Reimportar el mismo periodo actualiza grupos y horarios SIN pisar lo editado a mano
 * (asignaturas.editado_a_mano) y nunca toca num_contrato.
 */
const lector = require('../lib/excel/lectores/grupos');
const config = require('../lib/configuracion');
const periodosService = require('./periodosService');
const { crearAlmacen } = require('../lib/previews');
const bajaService = require('./bajaService');
const { HttpError } = require('../lib/errores');

const previews = crearAlmacen('grupos');

/** Mapa (horas|idioma) → tipo de clase activo. */
function mapaTarifas(db) {
  const filas = db.prepare('SELECT id, horas_semana, idioma FROM tipos_clase WHERE activo = 1').all();
  return new Map(filas.map((t) => [`${t.horas_semana}|${t.idioma}`, t.id]));
}

function nombreDe(d) {
  return [d.nombres, d.apellidoPaterno ?? d.apellido_paterno, d.apellidoMaterno ?? d.apellido_materno]
    .filter(Boolean).join(' ');
}

/** Compara lo leído con la BD: qué es nuevo, qué cambia y qué ya no viene. */
function compararConBd(db, leido, periodoBd) {
  const docentesBd = new Map(db.prepare('SELECT id, nomina, nombres, apellido_paterno, apellido_materno, activo, recontratable FROM docentes').all()
    .map((d) => [d.nomina, d]));
  const asigBd = periodoBd
    ? db.prepare(`SELECT a.id, a.crn, a.num_contrato, d.nomina FROM asignaturas a JOIN docentes d ON d.id = a.docente_id
                  WHERE a.periodo_id = ? AND a.crn IS NOT NULL`).all(periodoBd.id)
    : [];
  const asigPorCrn = new Map(asigBd.map((a) => [a.crn, a]));
  const crnArchivo = new Set(leido.asignaturas.map((a) => a.crn));
  const tarifas = mapaTarifas(db);

  return {
    docentes: {
      nuevos: leido.docentes.filter((d) => !docentesBd.has(d.nomina))
        .map((d) => ({ nomina: d.nomina, nombre: nombreDe(d), grupos: d.grupos })),
      existentes: leido.docentes.filter((d) => docentesBd.has(d.nomina)).length,
    },
    grupos: {
      nuevos: leido.asignaturas.filter((a) => !asigPorCrn.has(a.crn)).length,
      cambianDocente: leido.asignaturas
        .filter((a) => asigPorCrn.has(a.crn) && asigPorCrn.get(a.crn).nomina !== a.nomina)
        .map((a) => ({ crn: a.crn, materia: a.materia, antes: asigPorCrn.get(a.crn).nomina, despues: a.nomina })),
      yaNoVienen: asigBd.filter((a) => !crnArchivo.has(a.crn)).map((a) => ({ crn: a.crn, nomina: a.nomina })),
    },
    sinTarifa: leido.asignaturas.filter((a) => !tarifas.has(`${a.horasSemana}|${a.idioma}`))
      .map((a) => ({ crn: a.crn, horasSemana: a.horasSemana, idioma: a.idioma })),
    idiomaSugeridoEN: leido.asignaturas.filter((a) => a.idioma === 'EN').length,
    sinContrato: leido.asignaturas.filter((a) => !asigPorCrn.get(a.crn)?.num_contrato).length,
    noRecontratables: leido.docentes.filter((d) => docentesBd.get(d.nomina)?.recontratable === 0)
      .map((d) => ({ nomina: d.nomina, nombre: nombreDe(d) })),
    // Docentes dados de baja que vuelven a venir en el archivo (no se reactivan solos)
    reaparecenInactivos: leido.docentes.filter((d) => docentesBd.get(d.nomina)?.activo === 0)
      .map((d) => {
        const bd = docentesBd.get(d.nomina);
        return { id: bd.id, nomina: d.nomina, nombre: nombreDe(d), recontratable: bd.recontratable === null ? null : bd.recontratable === 1 };
      }),
  };
}

/** Docentes del periodo en la BD que no vienen en el archivo (se sugieren para "Inactivo"). */
function ausentes(db, leido, periodoBd) {
  if (!periodoBd) return [];
  const enArchivo = new Set(leido.docentes.map((d) => d.nomina));
  return db.prepare(`SELECT DISTINCT d.id, d.nomina, d.nombres, d.apellido_paterno, d.apellido_materno
                     FROM docentes d JOIN asignaturas a ON a.docente_id = d.id
                     WHERE a.periodo_id = ? AND d.activo = 1`).all(periodoBd.id)
    .filter((d) => !enArchivo.has(d.nomina))
    .map((d) => ({ id: d.id, nomina: d.nomina, nombre: nombreDe(d) }));
}

/**
 * Vista previa. `archivo` = { buffer, nombre }.
 * Respuesta con la forma de 06 (+ omitidos, noRecontratables, ausentes y avisos).
 */
function preview(db, archivo) {
  const leido = lector.leer(archivo.buffer, { omitirGrupos: config.obtener(db, 'grupos.omitir_grupos') });
  const periodoBd = periodosService.buscar(db, leido.periodo);
  const comparacion = compararConBd(db, leido, periodoBd);
  const sugeridosInactivo = ausentes(db, leido, periodoBd);
  const previewId = previews.guardar({ leido, archivo: archivo.nombre });
  return {
    previewId,
    archivo: archivo.nombre,
    periodo: leido.periodo.clave,
    periodoExiste: Boolean(periodoBd),
    filas: leido.filas,
    crn: leido.asignaturas.length,
    ...comparacion,
    omitidos: leido.omitidos,
    sugeridosInactivo,
    avisos: leido.avisos,
  };
}

// ---------------------------------------------------------------- confirmar

/** Campos editados a mano de una asignatura (JSON en editado_a_mano). */
function editados(asig) {
  try {
    const lista = JSON.parse(asig.editado_a_mano || '[]');
    return new Set(Array.isArray(lista) ? lista : []);
  } catch {
    return new Set();
  }
}

/** Inserta los docentes nuevos y devuelve el mapa nómina → id de todos los del archivo. */
function guardarDocentes(db, docentes) {
  const buscar = db.prepare('SELECT id FROM docentes WHERE nomina = ?');
  const insertar = db.prepare(`INSERT INTO docentes (nomina, nombres, apellido_paterno, apellido_materno, nivel_imparte, origen)
                               VALUES (@nomina, @nombres, @apellidoPaterno, @apellidoMaterno, @nivelImparte, 'excel_grupos')`);
  const ids = new Map();
  let nuevos = 0;
  for (const d of docentes) {
    const existente = buscar.get(d.nomina);
    if (existente) {
      ids.set(d.nomina, existente.id);
      continue;
    }
    const r = insertar.run({ ...d, apellidoPaterno: d.apellidoPaterno || d.nombreOriginal, nivelImparte: d.nivelImparte ?? null });
    ids.set(d.nomina, Number(r.lastInsertRowid));
    nuevos += 1;
  }
  return { ids, nuevos };
}

/** Nivel que imparte sugerido: bilingüe si TODOS sus grupos son Bachillerato Intercultural. */
function nivelImparte(asignaturas, nomina) {
  const planes = new Set(asignaturas.filter((a) => a.nomina === nomina).map((a) => a.plan));
  return planes.size === 1 ? [...planes][0] : 'Bachillerato General';
}

/** Valores a escribir en la asignatura respetando lo editado a mano. */
function valoresAsignatura(a, existente, tarifas) {
  const fijos = existente ? editados(existente) : new Set();
  const conservar = (campo, nuevo) => (fijos.has(campo) ? existente[campo] : nuevo);
  const idioma = conservar('idioma', a.idioma);
  const horas = conservar('horas_semana', a.horasSemana);
  return {
    clave_materia: conservar('clave_materia', a.claveMateria),
    materia: conservar('materia', a.materia),
    numero_grupo: conservar('numero_grupo', a.numeroGrupo),
    modalidad: conservar('modalidad', a.modalidad),
    plan: conservar('plan', a.plan),
    horas_semana: horas,
    idioma,
    tipo_clase_id: conservar('tipo_clase_id', tarifas.get(`${horas}|${idioma}`) ?? null),
  };
}

/** Inserta o actualiza las asignaturas y sus horarios. */
function guardarAsignaturas(db, periodoId, asignaturas, idsDocentes) {
  const tarifas = mapaTarifas(db);
  const buscar = db.prepare('SELECT * FROM asignaturas WHERE crn = ? AND periodo_id = ?');
  const insertar = db.prepare(`INSERT INTO asignaturas (periodo_id, docente_id, crn, clave_materia, materia, numero_grupo,
                                 modalidad, plan, horas_semana, idioma, tipo_clase_id, origen)
                               VALUES (@periodo_id, @docente_id, @crn, @clave_materia, @materia, @numero_grupo,
                                 @modalidad, @plan, @horas_semana, @idioma, @tipo_clase_id, 'excel_grupos')`);
  const actualizar = db.prepare(`UPDATE asignaturas SET docente_id = @docente_id, clave_materia = @clave_materia,
                                   materia = @materia, numero_grupo = @numero_grupo, modalidad = @modalidad, plan = @plan,
                                   horas_semana = @horas_semana, idioma = @idioma, tipo_clase_id = @tipo_clase_id
                                 WHERE id = @id`);
  const borrarHorarios = db.prepare('DELETE FROM horarios WHERE asignatura_id = ?');
  const insertarHorario = db.prepare('INSERT INTO horarios (asignatura_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');
  const cuenta = { nuevas: 0, actualizadas: 0 };

  for (const a of asignaturas) {
    const existente = buscar.get(a.crn, periodoId);
    const valores = { ...valoresAsignatura(a, existente, tarifas), docente_id: idsDocentes.get(a.nomina) };
    let id;
    if (existente) {
      id = existente.id;
      actualizar.run({ ...valores, id });
      cuenta.actualizadas += 1;
    } else {
      id = Number(insertar.run({ ...valores, periodo_id: periodoId, crn: a.crn }).lastInsertRowid);
      cuenta.nuevas += 1;
    }
    if (existente && editados(existente).has('horarios')) continue;
    borrarHorarios.run(id);
    for (const h of a.horarios) insertarHorario.run(id, h.dia, h.inicio, h.fin);
  }
  return cuenta;
}

/**
 * Da de baja a los docentes ausentes con el motivo y "recontratable" que eligió la coordinadora
 * (HU-21: motivo, observaciones y recontratable son obligatorios). Si no manda observaciones
 * se usa "No aparece en el Excel de grupos de <periodo>.".
 */
function inactivar(db, docentes, baja) {
  for (const d of docentes) bajaService.registrarBaja(db, d.id, baja);
  return docentes.length;
}

/** Valida los datos de baja para los ausentes (solo si se pidió inactivarlos). */
function bajaParaAusentes(db, body, periodoClave) {
  if (!body.inactivarAusentes) return null;
  if (!body.baja) {
    throw new HttpError(400, 'Para dar de baja a los ausentes indica motivo y si son recontratables.', 'BAJA_INCOMPLETA', [
      { campo: 'baja.motivo', problema: 'OBLIGATORIO' }, { campo: 'baja.recontratable', problema: 'OBLIGATORIO' },
    ]);
  }
  return bajaService.validarBaja(db, {
    ...body.baja,
    observaciones: String(body.baja.observaciones ?? '').trim() || `No aparece en el Excel de grupos de ${periodoClave}.`,
  });
}

/**
 * Aplica la vista previa.
 * body = { previewId, inactivarAusentes = false, baja: { motivo, observaciones?, recontratable } }.
 * Devuelve { importacion, periodo, docentesNuevos, gruposNuevos, gruposActualizados, inactivados, omitidos }.
 */
function confirm(db, body = {}) {
  const { leido, archivo } = previews.obtener(body.previewId);
  const baja = bajaParaAusentes(db, body, leido.periodo.clave);
  const ejecutar = db.transaction(() => {
    const periodoId = periodosService.asegurar(db, leido.periodo);
    const periodo = { id: periodoId, clave: leido.periodo.clave };
    const sugeridosInactivo = body.inactivarAusentes ? ausentes(db, leido, periodo) : [];
    const docentes = leido.docentes.map((d) => ({ ...d, nivelImparte: nivelImparte(leido.asignaturas, d.nomina) }));
    const { ids, nuevos } = guardarDocentes(db, docentes);
    const cuenta = guardarAsignaturas(db, periodoId, leido.asignaturas, ids);
    const inactivados = baja ? inactivar(db, sugeridosInactivo, baja) : 0;
    const imp = db.prepare(`INSERT INTO grupos_importaciones (periodo_id, archivo, filas, crn, docentes)
                            VALUES (?, ?, ?, ?, ?)`)
      .run(periodoId, archivo, leido.filas, leido.asignaturas.length, leido.docentes.length);
    return {
      importacion: { id: Number(imp.lastInsertRowid), archivo },
      periodo: leido.periodo.clave,
      docentesNuevos: nuevos,
      gruposNuevos: cuenta.nuevas,
      gruposActualizados: cuenta.actualizadas,
      inactivados,
      omitidos: leido.omitidos,
    };
  });
  const resultado = ejecutar();
  previews.borrar(body.previewId);
  return resultado;
}

/** Historial de importaciones (más reciente primero). */
function importaciones(db) {
  return db.prepare(`SELECT g.id, p.clave AS periodo, g.archivo, g.filas, g.crn, g.docentes, g.importado_en AS importadoEn
                     FROM grupos_importaciones g JOIN periodos p ON p.id = g.periodo_id
                     ORDER BY g.id DESC`).all();
}

module.exports = { preview, confirm, importaciones, previews };
