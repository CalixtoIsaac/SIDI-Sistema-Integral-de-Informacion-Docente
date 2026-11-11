/**
 * Tarifas por tipo de clase y catálogos editables (HU-18; 06 §Catálogos).
 *
 *   tiposClase / actualizarTipoClase  → GET/PUT /tipos-clase (pagoMensual es calculado, solo lectura)
 *   listar / crear / actualizar / desactivar → /catalogos (baja lógica: activo = 0)
 *
 * Cambiar una tarifa NO cambia faltas ya registradas: cada falta guarda su tarifa_aplicada y su monto.
 */
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');

const TIPOS = ['cc_nomina', 'motivo_incidencia', 'cuenta_cargo', 'motivo_falta', 'horas_falta', 'situacion',
  'estatus_falta', 'tipo_contrato', 'nivel_estudios', 'campo_formacion', 'motivo_baja'];

// ------------------------------------------------------------------ tipos de clase

function aTipoClase(t) {
  return {
    id: t.id, nombre: t.nombre, horasSemana: t.horas_semana, idioma: t.idioma,
    pagoSemestre: t.pago_semestre, pagoPorDia: t.pago_por_dia, pagoMensual: t.pago_mensual, activo: t.activo === 1,
    asignaturas: t.asignaturas ?? 0,
  };
}

function tiposClase(db) {
  return db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM asignaturas a WHERE a.tipo_clase_id = t.id) AS asignaturas
                     FROM tipos_clase t ORDER BY t.horas_semana DESC, t.idioma DESC`).all().map(aTipoClase);
}

function dinero(v, campo, valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 1e7) return v.error(campo, 'VALOR_INVALIDO');
  return Math.round(n * 100) / 100;
}

/** PUT /tipos-clase/:id → { pagoSemestre, pagoPorDia, nombre, activo } (parcial). */
function actualizarTipoClase(db, id, body = {}) {
  if (!db.prepare('SELECT 1 FROM tipos_clase WHERE id = ?').get(id)) throw new HttpError(404, 'Ese tipo de clase no existe.', 'NO_EXISTE');
  if (trae(body, 'pagoMensual')) throw new HttpError(400, 'La tarifa mensual se calcula sola (semestre ÷ 4).', 'SOLO_LECTURA');
  const v = new Validador();
  const c = {};
  if (trae(body, 'pagoSemestre')) c.pago_semestre = dinero(v, 'pagoSemestre', body.pagoSemestre);
  if (trae(body, 'pagoPorDia')) c.pago_por_dia = dinero(v, 'pagoPorDia', body.pagoPorDia);
  if (trae(body, 'nombre')) c.nombre = v.texto('nombre', body.nombre, { obligatorio: true, max: 100 });
  if (trae(body, 'activo')) c.activo = typeof body.activo === 'boolean' ? Number(body.activo) : v.error('activo', 'VALOR_INVALIDO');
  v.terminar();
  const cols = Object.keys(c);
  if (cols.length) {
    try {
      db.prepare(`UPDATE tipos_clase SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...c, id });
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'Ya existe un tipo de clase con ese nombre.', 'DUPLICADO');
      throw err;
    }
  }
  return aTipoClase(db.prepare('SELECT * FROM tipos_clase WHERE id = ?').get(id));
}

// ------------------------------------------------------------------ catálogos

function aCatalogo(c) {
  return { id: c.id, tipo: c.tipo, valor: c.valor, descripcion: c.descripcion, orden: c.orden, activo: c.activo === 1 };
}

/** GET /catalogos?tipo=…&incluirInactivos=true */
function listar(db, query = {}) {
  if (query.tipo && !TIPOS.includes(query.tipo)) throw new HttpError(400, 'Tipo de catálogo desconocido.', 'TIPO_INVALIDO', [{ tipos: TIPOS }]);
  const inactivos = query.incluirInactivos === 'true';
  return db.prepare(`SELECT * FROM catalogos WHERE (? IS NULL OR tipo = ?) AND (? OR activo = 1) ORDER BY tipo, orden, valor`)
    .all(query.tipo ?? null, query.tipo ?? null, inactivos ? 1 : 0).map(aCatalogo);
}

function obtener(db, id) {
  const c = db.prepare('SELECT * FROM catalogos WHERE id = ?').get(id);
  if (!c) throw new HttpError(404, 'Ese valor de catálogo no existe.', 'NO_EXISTE');
  return c;
}

function guardar(db, sql, params) {
  try {
    return db.prepare(sql).run(params);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'Ese valor ya existe en el catálogo.', 'DUPLICADO');
    throw err;
  }
}

function crear(db, body = {}) {
  const v = new Validador();
  const tipo = v.opcion('tipo', body.tipo, TIPOS, { obligatorio: true });
  const valor = v.texto('valor', body.valor, { obligatorio: true, max: 200 });
  const descripcion = v.texto('descripcion', body.descripcion, { max: 300 });
  const orden = v.entero('orden', body.orden ?? 0, { min: 0, max: 9999 });
  v.terminar();
  const r = guardar(db, 'INSERT INTO catalogos (tipo, valor, descripcion, orden) VALUES (?, ?, ?, ?)', [tipo, valor, descripcion, orden]);
  return aCatalogo(obtener(db, Number(r.lastInsertRowid)));
}

/** PUT /catalogos/:id → { valor, descripcion, orden, activo } (parcial; el tipo no cambia). */
function actualizar(db, id, body = {}) {
  obtener(db, id);
  const v = new Validador();
  const c = {};
  if (trae(body, 'valor')) c.valor = v.texto('valor', body.valor, { obligatorio: true, max: 200 });
  if (trae(body, 'descripcion')) c.descripcion = v.texto('descripcion', body.descripcion, { max: 300 });
  if (trae(body, 'orden')) c.orden = v.entero('orden', body.orden, { min: 0, max: 9999, obligatorio: true });
  if (trae(body, 'activo')) c.activo = typeof body.activo === 'boolean' ? Number(body.activo) : v.error('activo', 'VALOR_INVALIDO');
  if (trae(body, 'tipo')) v.error('tipo', 'NO_SE_PUEDE_CAMBIAR');
  v.terminar();
  const cols = Object.keys(c);
  if (cols.length) guardar(db, `UPDATE catalogos SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`, { ...c, id });
  return aCatalogo(obtener(db, id));
}

/** DELETE /catalogos/:id → baja lógica (los registros que ya usan el valor no cambian). */
function desactivar(db, id) {
  obtener(db, id);
  db.prepare('UPDATE catalogos SET activo = 0 WHERE id = ?').run(id);
}

module.exports = { tiposClase, actualizarTipoClase, listar, crear, actualizar, desactivar, TIPOS };
