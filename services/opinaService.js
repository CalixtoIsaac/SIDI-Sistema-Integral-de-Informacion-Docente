/**
 * Importación de OPINA (HU-08, 07 §5.3, 06 §OPINA).
 *
 *   preview(db, archivo)       → detecta versión y periodo, filtra presencial + Veracruz; NO escribe
 *   confirm(db, body)          → inserta respuestas; crea docentes y asignaturas faltantes
 *   importaciones(db)          → historial
 *   eliminarImportacion(db,id) → borra una carga y sus respuestas
 *
 * Reimportar el mismo periodo REEMPLAZA sus respuestas (requiere { reemplazar: true }).
 */
const lector = require('../lib/excel/lectores/opina');
const config = require('../lib/configuracion');
const periodosService = require('./periodosService');
const { crearAlmacen } = require('../lib/previews');
const { HttpError } = require('../lib/errores');

const previews = crearAlmacen('OPINA');

function opcionesLector(db) {
  return {
    campus: config.obtener(db, 'opina.campus'),
    soloPresencial: config.obtener(db, 'opina.solo_presencial') !== '0',
  };
}

function nombreDe(p) {
  return [p.nombres, p.apellidoPaterno, p.apellidoMaterno].filter(Boolean).join(' ');
}

/** Vista previa con la forma de 06 (+ descartadas, formatos y avisos). */
function preview(db, archivo) {
  const opciones = opcionesLector(db);
  const leido = lector.leer(archivo.buffer, opciones);
  const periodoBd = periodosService.buscar(db, leido.periodo);
  const enBd = new Set(db.prepare('SELECT nomina FROM docentes').all().map((d) => d.nomina));
  const yaImportado = periodoBd
    ? Boolean(db.prepare('SELECT 1 FROM opina_importaciones WHERE periodo_id = ?').get(periodoBd.id))
    : false;
  const previewId = previews.guardar({ leido, archivo: archivo.nombre, opciones });
  return {
    previewId,
    archivo: archivo.nombre,
    version: leido.version,
    periodo: leido.periodo.clave,
    periodoExiste: Boolean(periodoBd),
    filas: leido.filas,
    filasFiltradas: leido.filasFiltradas,
    descartadas: leido.descartadas,
    formatos: leido.formatos,
    profesores: leido.profesores.length,
    grupos: leido.grupos,
    profesoresNuevos: leido.profesores.filter((p) => !enBd.has(p.nomina))
      .map((p) => ({ nomina: p.nomina, nombre: nombreDe(p) })),
    yaImportado,
    avisos: leido.avisos,
  };
}

/** Crea los docentes que no existen (origen 'opina'); devuelve nómina → id y cuántos se crearon. */
function asegurarDocentes(db, profesores) {
  const buscar = db.prepare('SELECT id FROM docentes WHERE nomina = ?');
  const insertar = db.prepare(`INSERT INTO docentes (nomina, nombres, apellido_paterno, apellido_materno, origen)
                               VALUES (?, ?, ?, ?, 'opina')`);
  const ids = new Map();
  let nuevos = 0;
  for (const p of profesores) {
    const existente = buscar.get(p.nomina);
    if (existente) {
      ids.set(p.nomina, existente.id);
    } else {
      const r = insertar.run(p.nomina, p.nombres || p.nombreOriginal, p.apellidoPaterno || p.nombreOriginal, p.apellidoMaterno);
      ids.set(p.nomina, Number(r.lastInsertRowid));
      nuevos += 1;
    }
  }
  return { ids, nuevos };
}

/** Crea asignaturas faltantes (CRN del periodo) y completa clave_grupo si faltaba. */
function asegurarAsignaturas(db, periodoId, respuestas, idsDocentes) {
  const buscar = db.prepare('SELECT id, clave_grupo FROM asignaturas WHERE crn = ? AND periodo_id = ?');
  const insertar = db.prepare(`INSERT INTO asignaturas (periodo_id, docente_id, crn, clave_materia, materia, numero_grupo,
                                 clave_grupo, plan, origen)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'opina')`);
  const completar = db.prepare('UPDATE asignaturas SET clave_grupo = ? WHERE id = ?');
  const vistos = new Set();
  let nuevas = 0;
  for (const r of respuestas) {
    if (vistos.has(r.crn)) continue;
    vistos.add(r.crn);
    const existente = buscar.get(r.crn, periodoId);
    if (existente) {
      if (!existente.clave_grupo && r.claveGrupo) completar.run(r.claveGrupo, existente.id);
      continue;
    }
    const grupo = r.claveGrupo?.split('_')[2] ?? null;
    insertar.run(periodoId, idsDocentes.get(r.nomina), r.crn, r.claveMateria, r.materia || '(sin nombre)', grupo, r.claveGrupo, r.plan);
    nuevas += 1;
  }
  return nuevas;
}

function insertarRespuestas(db, importacionId, periodoId, respuestas, idsDocentes) {
  const insertar = db.prepare(`INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, response_id,
                                 campus_grupo, recomienda, por_que_si, por_que_no, items, comentario)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of respuestas) {
    insertar.run(importacionId, periodoId, idsDocentes.get(r.nomina), r.crn, r.responseId, r.campusGrupo, r.recomienda,
      r.porQueSi, r.porQueNo, r.items ? JSON.stringify(r.items) : null, r.comentario);
  }
}

/** Borra las cargas previas del periodo (y sus respuestas). */
function borrarCargasDelPeriodo(db, periodoId) {
  db.prepare('DELETE FROM opina_respuestas WHERE periodo_id = ?').run(periodoId);
  return db.prepare('DELETE FROM opina_importaciones WHERE periodo_id = ?').run(periodoId).changes;
}

/**
 * Aplica la vista previa. body = { previewId, reemplazar }.
 * Si el periodo ya tiene una carga y no se manda reemplazar: true → 409.
 */
function confirm(db, body = {}) {
  const { leido, archivo, opciones } = previews.obtener(body.previewId);
  const ejecutar = db.transaction(() => {
    const periodoId = periodosService.asegurar(db, leido.periodo);
    const previa = db.prepare('SELECT COUNT(*) AS n FROM opina_importaciones WHERE periodo_id = ?').get(periodoId).n;
    if (previa > 0 && body.reemplazar !== true) {
      throw new HttpError(409, `El OPINA de ${leido.periodo.clave} ya está importado. Confirma que quieres reemplazarlo.`, 'OPINA_YA_IMPORTADO');
    }
    const reemplazadas = previa > 0 ? borrarCargasDelPeriodo(db, periodoId) : 0;
    const { ids, nuevos } = asegurarDocentes(db, leido.profesores);
    const asignaturasNuevas = asegurarAsignaturas(db, periodoId, leido.respuestas, ids);
    const descartadas = Object.values(leido.descartadas).reduce((s, n) => s + n, 0);
    const imp = db.prepare(`INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filtro_campus,
                              solo_presencial, filas, filas_descartadas) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(periodoId, archivo, leido.version, opciones.campus, opciones.soloPresencial ? 1 : 0, leido.filas, descartadas);
    const importacionId = Number(imp.lastInsertRowid);
    insertarRespuestas(db, importacionId, periodoId, leido.respuestas, ids);
    return {
      importacion: { id: importacionId, archivo, version: leido.version },
      periodo: leido.periodo.clave,
      respuestas: leido.respuestas.length,
      docentesNuevos: nuevos,
      asignaturasNuevas,
      reemplazadas,
    };
  });
  const resultado = ejecutar();
  previews.borrar(body.previewId);
  return resultado;
}

function importaciones(db) {
  return db.prepare(`SELECT o.id, p.clave AS periodo, o.archivo, o.version_formato AS version, o.filtro_campus AS filtroCampus,
                            o.solo_presencial AS soloPresencial, o.filas, o.filas_descartadas AS filasDescartadas,
                            (SELECT COUNT(*) FROM opina_respuestas r WHERE r.importacion_id = o.id) AS respuestas,
                            o.importado_en AS importadoEn
                     FROM opina_importaciones o JOIN periodos p ON p.id = o.periodo_id
                     ORDER BY o.id DESC`).all();
}

function eliminarImportacion(db, id) {
  const ejecutar = db.transaction(() => {
    db.prepare('DELETE FROM opina_respuestas WHERE importacion_id = ?').run(id);
    return db.prepare('DELETE FROM opina_importaciones WHERE id = ?').run(id).changes;
  });
  if (ejecutar() === 0) throw new HttpError(404, 'Esa importación de OPINA no existe.', 'NO_EXISTE');
}

module.exports = { preview, confirm, importaciones, eliminarImportacion, previews };
