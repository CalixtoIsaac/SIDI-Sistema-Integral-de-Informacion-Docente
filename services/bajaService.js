/**
 * Suspender (dar de baja) y reactivar docentes (HU-05, HU-21; 04 §5; 06 PATCH /docentes/:id/estatus).
 *
 *   suspender = activo 0 + INSERT docente_bajas(motivo, observaciones, recontratable, periodo actual)
 *   recontratable sugerido = catalogos(motivo_baja).descripcion ('1' / '0' / vacío = sin sugerencia)
 *   docentes.recontratable = recontratable de la última baja
 *   reactivar = activo 1 + fecha_reactivacion = hoy (si la última baja es no recontratable, pide confirmación → 409)
 *
 * Las observaciones solo se muestran en la ficha (nunca en panel ni resumen ejecutivo).
 */
const { HttpError } = require('../lib/errores');
const periodosService = require('./periodosService');

const MAX_OBSERVACIONES = 1000;

function motivosBaja(db) {
  return db.prepare(`SELECT valor AS motivo, descripcion FROM catalogos
                     WHERE tipo = 'motivo_baja' AND activo = 1 ORDER BY orden, valor`).all()
    .map((m) => ({ motivo: m.motivo, recontratableSugerido: m.descripcion === '1' ? true : m.descripcion === '0' ? false : null }));
}

/** Valida { motivo, observaciones, recontratable }. Lanza 400 con details por campo. */
function validarBaja(db, datos = {}) {
  const motivo = String(datos.motivo ?? '').trim();
  const observaciones = String(datos.observaciones ?? '').trim();
  const details = [];
  if (!motivo) details.push({ campo: 'motivo', problema: 'OBLIGATORIO' });
  if (!observaciones) details.push({ campo: 'observaciones', problema: 'OBLIGATORIO' });
  if (observaciones.length > MAX_OBSERVACIONES) details.push({ campo: 'observaciones', problema: 'MUY_LARGO' });
  if (typeof datos.recontratable !== 'boolean') details.push({ campo: 'recontratable', problema: 'OBLIGATORIO' });
  const motivos = motivosBaja(db);
  if (motivo && motivos.length && !motivos.some((m) => m.motivo === motivo)) {
    details.push({ campo: 'motivo', problema: 'NO_ESTA_EN_CATALOGO' });
  }
  if (details.length) {
    throw new HttpError(400, 'Para dar de baja indica motivo, observaciones y si es recontratable.', 'BAJA_INCOMPLETA', details);
  }
  return { motivo, observaciones, recontratable: datos.recontratable };
}

function obtener(db, id) {
  const d = db.prepare('SELECT id, nomina, activo, recontratable FROM docentes WHERE id = ?').get(id);
  if (!d) throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  return d;
}

function ultimaBaja(db, id) {
  return db.prepare('SELECT * FROM docente_bajas WHERE docente_id = ? ORDER BY fecha DESC, id DESC LIMIT 1').get(id) ?? null;
}

/** Registra la baja sin validar (lo usan suspender y la importación de grupos). */
function registrarBaja(db, id, baja) {
  const periodo = periodosService.actualOUltimo(db);
  const r = db.prepare(`INSERT INTO docente_bajas (docente_id, periodo_id, motivo, observaciones, recontratable)
                        VALUES (?, ?, ?, ?, ?)`)
    .run(id, periodo?.id ?? null, baja.motivo, baja.observaciones, baja.recontratable ? 1 : 0);
  db.prepare(`UPDATE docentes SET activo = 0, recontratable = ?, actualizado_en = datetime('now','localtime')
              WHERE id = ?`).run(baja.recontratable ? 1 : 0, id);
  return Number(r.lastInsertRowid);
}

function suspender(db, id, datos) {
  const d = obtener(db, id);
  if (d.activo === 0) throw new HttpError(409, 'El docente ya está dado de baja.', 'YA_INACTIVO');
  const baja = validarBaja(db, datos);
  const bajaId = db.transaction(() => registrarBaja(db, id, baja))();
  return { docente: { id, activo: false, recontratable: baja.recontratable }, baja: historial(db, id).find((b) => b.id === bajaId) };
}

function reactivar(db, id, datos = {}) {
  const d = obtener(db, id);
  if (d.activo === 1) throw new HttpError(409, 'El docente ya está activo.', 'YA_ACTIVO');
  const ultima = ultimaBaja(db, id);
  if (ultima && ultima.recontratable === 0 && datos.confirmarNoRecontratable !== true) {
    throw new HttpError(409, 'Este docente se dio de baja como NO recontratable. Confirma para reactivarlo.', 'CONFIRMAR_NO_RECONTRATABLE', [
      { fecha: ultima.fecha, motivo: ultima.motivo, observaciones: ultima.observaciones },
    ]);
  }
  db.transaction(() => {
    db.prepare("UPDATE docentes SET activo = 1, actualizado_en = datetime('now','localtime') WHERE id = ?").run(id);
    if (ultima && !ultima.fecha_reactivacion) {
      db.prepare("UPDATE docente_bajas SET fecha_reactivacion = date('now','localtime') WHERE id = ?").run(ultima.id);
    }
  })();
  return { docente: { id, activo: true, recontratable: d.recontratable === null ? null : d.recontratable === 1 } };
}

/** PATCH /docentes/:id/estatus → { activo: false, motivo, observaciones, recontratable } | { activo: true, confirmarNoRecontratable } */
function cambiarEstatus(db, id, body = {}) {
  if (typeof body.activo !== 'boolean') {
    throw new HttpError(400, 'Indica "activo": true (reactivar) o false (dar de baja).', 'ACTIVO_OBLIGATORIO');
  }
  return body.activo ? reactivar(db, id, body) : suspender(db, id, body);
}

/** Historial de bajas (más reciente primero). */
function historial(db, id) {
  obtener(db, id);
  return db.prepare(`SELECT b.id, b.fecha, p.clave AS periodo, b.motivo, b.observaciones,
                            b.recontratable, b.fecha_reactivacion AS fechaReactivacion
                     FROM docente_bajas b LEFT JOIN periodos p ON p.id = b.periodo_id
                     WHERE b.docente_id = ? ORDER BY b.fecha DESC, b.id DESC`).all(id)
    .map((b) => ({ ...b, recontratable: b.recontratable === 1 }));
}

module.exports = { cambiarEstatus, suspender, reactivar, historial, motivosBaja, validarBaja, registrarBaja };
