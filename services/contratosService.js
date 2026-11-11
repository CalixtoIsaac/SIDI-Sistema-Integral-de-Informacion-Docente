/**
 * Contratos por CRN (HU-27; 07 §7.3; 06 §Contratos por CRN).
 *
 *   plantilla(db, periodoId)        → { nombre, buffer } CONTRATOS_<PERIODO>.xlsx prellenado
 *   preview(db, archivo, periodoId) → nuevos / cambian / sin contrato / avisos; NO guarda
 *   confirm(db, body)               → actualiza asignaturas.num_contrato en una transacción
 *
 * Avisos: CRN_NO_EXISTE (en el periodo), NOMINA_NO_CORRESPONDE (no es el docente del CRN),
 * CONTRATO_INVALIDO (no son solo dígitos), CRN_REPETIDO (dos filas del mismo CRN).
 * Los contratos que ya tenían otro valor se listan en `cambian`; los CRN de
 * conservarManual mantienen su valor actual.
 */
const lector = require('../lib/excel/lectores/contratos');
const plantillaXlsx = require('../lib/excel/generadores/plantillaContratos');
const { crearAlmacen } = require('../lib/previews');
const { HttpError } = require('../lib/errores');
const periodosService = require('./periodosService');

const previews = crearAlmacen('contratos');

function periodoDe(db, periodoId) {
  const p = periodoId
    ? db.prepare('SELECT * FROM periodos WHERE id = ?').get(Number(periodoId))
    : periodosService.actualOUltimo(db);
  if (!p) throw new HttpError(404, periodoId ? 'Ese periodo no existe.' : 'No hay periodos: importa primero el Excel de grupos.', 'PERIODO_NO_EXISTE');
  return p;
}

function asignaturasDelPeriodo(db, periodoId) {
  return db.prepare(`SELECT a.id, a.crn, a.nombre_actividad, a.materia, a.numero_grupo, a.num_contrato,
                            d.nomina, d.nombres || ' ' || d.apellido_paterno || COALESCE(' ' || d.apellido_materno, '') AS docente
                     FROM asignaturas a JOIN docentes d ON d.id = a.docente_id
                     WHERE a.periodo_id = ?
                     ORDER BY a.crn IS NULL, CAST(a.crn AS INTEGER), a.id`).all(periodoId);
}

/** Plantilla prellenada: los CRN del periodo y, al final, las actividades sin CRN. */
function plantilla(db, periodoId) {
  const periodo = periodoDe(db, periodoId);
  const filas = asignaturasDelPeriodo(db, periodo.id).map((a) => ({
    crn: a.crn,
    materia: a.crn ? a.materia : a.nombre_actividad ?? a.materia,
    numeroGrupo: a.numero_grupo,
    nomina: a.nomina,
    docente: a.docente,
    numContrato: a.num_contrato,
  }));
  return { nombre: `CONTRATOS_${periodo.clave.replace(/\s+/g, '_')}.xlsx`, buffer: plantillaXlsx.generar(filas), filas: filas.length };
}

/** Clasifica cada fila del archivo contra las asignaturas del periodo. */
function clasificar(filas, asignaturas) {
  const porCrn = new Map(asignaturas.filter((a) => a.crn).map((a) => [a.crn, a]));
  const r = { nuevos: [], cambian: [], iguales: 0, vacios: [], avisos: [], aplicar: new Map() };
  const vistos = new Set();
  for (const f of filas) {
    const a = f.crn ? porCrn.get(f.crn) : null;
    if (!f.crn) { r.avisos.push({ fila: f.fila, crn: f.crnTexto, tipo: 'CRN_NO_EXISTE' }); continue; }
    if (vistos.has(f.crn)) { r.avisos.push({ fila: f.fila, crn: f.crn, tipo: 'CRN_REPETIDO' }); continue; }
    vistos.add(f.crn);
    if (!a) { r.avisos.push({ fila: f.fila, crn: f.crn, tipo: 'CRN_NO_EXISTE' }); continue; }
    if (f.nomina && f.nomina !== a.nomina) {
      r.avisos.push({ fila: f.fila, crn: f.crn, tipo: 'NOMINA_NO_CORRESPONDE', archivo: f.nomina, docente: a.nomina });
      continue;
    }
    if (f.contratoInvalido) { r.avisos.push({ fila: f.fila, crn: f.crn, tipo: 'CONTRATO_INVALIDO', valor: f.contratoInvalido }); continue; }
    if (!f.contrato) { r.vacios.push(f.crn); continue; }
    if (a.num_contrato === f.contrato) { r.iguales += 1; continue; }
    if (a.num_contrato) r.cambian.push({ crn: f.crn, materia: a.materia, antes: a.num_contrato, despues: f.contrato });
    else r.nuevos.push({ crn: f.crn, materia: a.materia, contrato: f.contrato });
    r.aplicar.set(f.crn, { asignaturaId: a.id, contrato: f.contrato });
  }
  return r;
}

/** Vista previa. archivo = { buffer, nombre }. */
function preview(db, archivo, periodoId) {
  const periodo = periodoDe(db, periodoId);
  const leido = lector.leer(archivo.buffer);
  const asignaturas = asignaturasDelPeriodo(db, periodo.id);
  const r = clasificar(leido.filas, asignaturas);
  const conContratoDespues = new Set([...asignaturas.filter((a) => a.crn && a.num_contrato).map((a) => a.crn), ...r.aplicar.keys()]);
  const sinContrato = asignaturas.filter((a) => a.crn && !conContratoDespues.has(a.crn)).map((a) => a.crn);
  const previewId = previews.guardar({ aplicar: r.aplicar, archivo: archivo.nombre, periodoId: periodo.id, filas: leido.filas.length, conAviso: r.avisos.length });
  return {
    previewId,
    archivo: archivo.nombre,
    periodo: periodo.clave,
    filas: leido.filas.length,
    crn: asignaturas.filter((a) => a.crn).length,
    validaNomina: leido.conNomina,
    nuevos: r.nuevos,
    cambian: r.cambian,
    iguales: r.iguales,
    sinContrato,
    avisos: r.avisos,
  };
}

/** body = { previewId, conservarManual: [crn…] } → actualiza los contratos en una transacción. */
function confirm(db, body = {}) {
  const p = previews.obtener(body.previewId);
  const conservar = new Set((Array.isArray(body.conservarManual) ? body.conservarManual : []).map(String));
  const actualizar = db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE id = ?');
  const resultado = db.transaction(() => {
    let actualizados = 0;
    for (const [crn, { asignaturaId, contrato }] of p.aplicar) {
      if (conservar.has(crn)) continue;
      actualizar.run(contrato, asignaturaId);
      actualizados += 1;
    }
    const imp = db.prepare(`INSERT INTO contratos_importaciones (periodo_id, archivo, filas, actualizados, con_aviso)
                            VALUES (?, ?, ?, ?, ?)`).run(p.periodoId, p.archivo, p.filas, actualizados, p.conAviso);
    return { importacion: { id: Number(imp.lastInsertRowid), archivo: p.archivo }, actualizados, conservados: [...p.aplicar.keys()].filter((c) => conservar.has(c)).length, conAviso: p.conAviso };
  })();
  previews.borrar(body.previewId);
  return resultado;
}

function importaciones(db) {
  return db.prepare(`SELECT c.id, p.clave AS periodo, c.archivo, c.filas, c.actualizados, c.con_aviso AS conAviso, c.importado_en AS importadoEn
                     FROM contratos_importaciones c JOIN periodos p ON p.id = c.periodo_id ORDER BY c.id DESC`).all();
}

module.exports = { plantilla, preview, confirm, importaciones, previews };
