/**
 * CRUD de ejemplo: notas del usuario con sesión iniciada.
 * Copia este archivo como base para cada módulo nuevo de tu proyecto.
 *
 *  GET    /api/notas      → { notas, resumen }
 *  POST   /api/notas      → { nota }
 *  PUT    /api/notas/:id  → { nota }
 *  DELETE /api/notas/:id  → { status, id }
 *
 * Todas las consultas usan parámetros (? o @nombre): nunca concatenes
 * valores del usuario dentro del SQL.
 */
const express = require('express');
const db = require('../lib/db');

const router = express.Router();

const ESTADOS = ['pendiente', 'en_progreso', 'terminada'];
const COLUMNAS = 'id, titulo, contenido, estado, creado_en, actualizado_en';

const sql = {
  list:   db.prepare(`SELECT ${COLUMNAS} FROM notas WHERE usuario_id = ? ORDER BY actualizado_en DESC, id DESC`),
  get:    db.prepare(`SELECT ${COLUMNAS} FROM notas WHERE id = ? AND usuario_id = ?`),
  insert: db.prepare(`INSERT INTO notas (usuario_id, titulo, contenido, estado)
                      VALUES (@usuarioId, @titulo, @contenido, @estado)`),
  update: db.prepare(`UPDATE notas
                      SET titulo = @titulo, contenido = @contenido, estado = @estado,
                          actualizado_en = datetime('now', 'localtime')
                      WHERE id = @id AND usuario_id = @usuarioId`),
  remove: db.prepare('DELETE FROM notas WHERE id = ? AND usuario_id = ?')
};

/** Valida y normaliza el cuerpo de la petición. */
function validar(body) {
  const titulo = String(body?.titulo ?? '').trim();
  const contenido = String(body?.contenido ?? '').trim();
  const estado = String(body?.estado ?? 'pendiente');

  if (!titulo) return { error: 'El título es obligatorio.' };
  if (titulo.length > 120) return { error: 'El título no puede tener más de 120 caracteres.' };
  if (contenido.length > 2000) return { error: 'El contenido no puede tener más de 2000 caracteres.' };
  if (!ESTADOS.includes(estado)) return { error: 'Estado no válido.' };
  return { value: { titulo, contenido, estado } };
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Identificador no válido.' });
    return null;
  }
  return id;
}

router.get('/', (req, res) => {
  const notas = sql.list.all(req.user.id);
  const resumen = { total: notas.length, pendiente: 0, en_progreso: 0, terminada: 0 };
  for (const nota of notas) resumen[nota.estado] += 1;
  res.json({ notas, resumen });
});

router.post('/', (req, res) => {
  const { error, value } = validar(req.body);
  if (error) return res.status(400).json({ error });

  const info = sql.insert.run({ ...value, usuarioId: req.user.id });
  res.status(201).json({ nota: sql.get.get(info.lastInsertRowid, req.user.id) });
});

router.put('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { error, value } = validar(req.body);
  if (error) return res.status(400).json({ error });

  const info = sql.update.run({ ...value, id, usuarioId: req.user.id });
  if (info.changes === 0) return res.status(404).json({ error: 'La nota no existe.' });
  res.json({ nota: sql.get.get(id, req.user.id) });
});

router.delete('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const info = sql.remove.run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'La nota no existe.' });
  res.json({ status: 'ok', id });
});

module.exports = router;
