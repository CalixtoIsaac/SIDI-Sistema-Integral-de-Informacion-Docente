/**
 * Quincenas de pago (06 §Catálogos: GET /quincenas, GET /quincenas/actual, PATCH /quincenas/:id).
 * Una quincena cerrada bloquea editar sus faltas e incidencias (ya se envió a Nacional).
 */
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');
const { partesFecha, aIso, numeroQuincena } = require('../lib/quincena');

function aRespuesta(q) {
  return {
    id: q.id, anio: q.anio, numero: q.numero, etiqueta: `Q${q.numero}`,
    fechaInicio: q.fecha_inicio, fechaFin: q.fecha_fin, fechaPago: q.fecha_pago, cerrada: q.cerrada === 1,
    faltas: q.faltas ?? 0, descontado: q.descontado ?? 0, incidencias: q.incidencias ?? 0, pagado: q.pagado ?? 0,
  };
}

const SELECT = `
  SELECT q.*,
    (SELECT COUNT(*) FROM faltas f WHERE f.quincena_id = q.id) AS faltas,
    (SELECT COALESCE(ROUND(SUM(f.monto_descuento), 2), 0) FROM faltas f WHERE f.quincena_id = q.id AND f.justificacion = 'ninguna') AS descontado,
    (SELECT COUNT(*) FROM incidencias i WHERE i.quincena_id = q.id) AS incidencias,
    (SELECT COALESCE(ROUND(SUM(i.importe_total), 2), 0) FROM incidencias i WHERE i.quincena_id = q.id) AS pagado
  FROM quincenas q`;

function obtener(db, id) {
  const q = db.prepare(`${SELECT} WHERE q.id = ?`).get(Number(id));
  if (!q) throw new HttpError(404, 'Esa quincena no existe.', 'QUINCENA_NO_EXISTE');
  return aRespuesta(q);
}

function listar(db, query = {}) {
  const anio = query.anio ? Number(query.anio) : null;
  return db.prepare(`${SELECT} WHERE (? IS NULL OR q.anio = ?) ORDER BY q.anio, q.numero`).all(anio, anio).map(aRespuesta);
}

/** Quincena que contiene la fecha (por defecto hoy). */
function actual(db, hoy = new Date()) {
  const p = partesFecha(hoy);
  const q = db.prepare(`${SELECT} WHERE q.anio = ? AND q.numero = ?`).get(p.anio, numeroQuincena(aIso(p.anio, p.mes, p.dia)));
  if (!q) throw new HttpError(404, 'No hay quincenas cargadas para hoy.', 'QUINCENA_NO_EXISTE');
  return aRespuesta(q);
}

/** PATCH /quincenas/:id → { fechaPago } | { cerrada: true|false } */
function actualizar(db, id, body = {}) {
  obtener(db, id);
  const v = new Validador();
  const c = {};
  if (trae(body, 'fechaPago')) {
    const p = partesFecha(body.fechaPago);
    c.fecha_pago = p ? aIso(p.anio, p.mes, p.dia) : v.error('fechaPago', 'FECHA_INVALIDA');
  }
  if (trae(body, 'cerrada')) c.cerrada = typeof body.cerrada === 'boolean' ? Number(body.cerrada) : v.error('cerrada', 'VALOR_INVALIDO');
  v.terminar();
  const cols = Object.keys(c);
  if (cols.length) {
    db.transaction(() => {
      db.prepare(`UPDATE quincenas SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...c, id: Number(id) });
      if (c.fecha_pago) db.prepare('UPDATE incidencias SET a_partir_de = ? WHERE quincena_id = ?').run(c.fecha_pago, Number(id));
    })();
  }
  return obtener(db, id);
}

module.exports = { listar, obtener, actual, actualizar };
