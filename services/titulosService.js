/**
 * Títulos del docente (HU-01; 06: POST /docentes/:id/titulos, PUT/DELETE /titulos/:id).
 * Alimentan "nivel de estudios" (grado más alto Titulado) y "¿está estudiando?" (Estudios en curso).
 */
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');

const ESTATUS = ['Titulado', 'Pasante', 'Título en trámite', 'Estudios en curso', 'Estudios sin concluir'];

const CAMPOS = {
  grado: 'grado',
  nombreTitulo: 'nombre_titulo',
  institucion: 'institucion',
  periodoTexto: 'periodo_texto',
  estatus: 'estatus',
  cedula: 'cedula',
  anioObtencion: 'anio_obtencion',
};

function grados(db) {
  return db.prepare("SELECT valor FROM catalogos WHERE tipo = 'nivel_estudios' AND activo = 1").all().map((c) => c.valor);
}

/** Valida y convierte a columnas. `prefijo` sirve para errores anidados (titulos[0].grado). */
function columnas(db, body, { parcial, prefijo = '' }) {
  const v = new Validador();
  const c = {};
  const usar = (campo) => !parcial || trae(body, campo);
  if (usar('grado')) {
    const lista = grados(db);
    c.grado = v.texto(`${prefijo}grado`, body.grado, { obligatorio: true, max: 50 });
    if (c.grado && lista.length && !lista.includes(c.grado)) v.error(`${prefijo}grado`, 'NO_ESTA_EN_CATALOGO');
  }
  if (usar('nombreTitulo')) c.nombre_titulo = v.texto(`${prefijo}nombreTitulo`, body.nombreTitulo, { max: 200 });
  if (usar('institucion')) c.institucion = v.texto(`${prefijo}institucion`, body.institucion, { max: 200 });
  if (usar('periodoTexto')) c.periodo_texto = v.texto(`${prefijo}periodoTexto`, body.periodoTexto, { max: 50 });
  if (usar('estatus')) c.estatus = v.opcion(`${prefijo}estatus`, body.estatus ?? (parcial ? undefined : 'Titulado'), ESTATUS, { obligatorio: true });
  if (usar('cedula')) c.cedula = v.texto(`${prefijo}cedula`, body.cedula, { max: 30 });
  if (usar('anioObtencion')) c.anio_obtencion = v.entero(`${prefijo}anioObtencion`, body.anioObtencion, { min: 1950, max: 2100 });
  v.terminar();
  return c;
}

function aRespuesta(t) {
  return Object.fromEntries([['id', t.id], ['docenteId', t.docente_id], ...Object.entries(CAMPOS).map(([k, col]) => [k, t[col]]), ['origen', t.origen]]);
}

function obtener(db, id) {
  const t = db.prepare('SELECT * FROM titulos_docente WHERE id = ?').get(id);
  if (!t) throw new HttpError(404, 'Ese título no existe.', 'TITULO_NO_EXISTE');
  return t;
}

function crear(db, docenteId, body = {}, prefijo = '') {
  if (!db.prepare('SELECT 1 FROM docentes WHERE id = ?').get(docenteId)) {
    throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  }
  const c = columnas(db, body, { parcial: false, prefijo });
  const cols = Object.keys(c);
  const r = db.prepare(`INSERT INTO titulos_docente (docente_id, ${cols.join(', ')}, origen)
                        VALUES (@docente_id, ${cols.map((k) => `@${k}`).join(', ')}, @origen)`)
    .run({ ...c, docente_id: docenteId, origen: body.origen === 'cv' ? 'cv' : 'manual' });
  return aRespuesta(obtener(db, Number(r.lastInsertRowid)));
}

function actualizar(db, id, body = {}) {
  obtener(db, id);
  const c = columnas(db, body, { parcial: true });
  const cols = Object.keys(c);
  if (cols.length) db.prepare(`UPDATE titulos_docente SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...c, id });
  return aRespuesta(obtener(db, id));
}

function eliminar(db, id) {
  obtener(db, id);
  db.prepare('DELETE FROM titulos_docente WHERE id = ?').run(id);
}

module.exports = { crear, actualizar, eliminar, ESTATUS };
