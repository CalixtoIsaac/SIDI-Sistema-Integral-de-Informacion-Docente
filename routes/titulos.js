/**
 * Títulos del docente (HU-01). El alta va en POST /api/docentes/:id/titulos.
 *
 *  PUT    /api/titulos/:id  → { titulo }  edición parcial
 *  DELETE /api/titulos/:id  → 204
 */
const express = require('express');
const db = require('../lib/db');
const titulosService = require('../services/titulosService');
const { HttpError, manejarErrores } = require('../lib/errores');

const router = express.Router();

router.param('id', (req, res, next, valor) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Id de título inválido.', 'ID_INVALIDO'));
  req.tituloId = id;
  return next();
});

router.put('/:id', (req, res) => {
  res.json({ titulo: titulosService.actualizar(db, req.tituloId, req.body ?? {}) });
});

router.delete('/:id', (req, res) => {
  titulosService.eliminar(db, req.tituloId);
  res.status(204).end();
});

router.use(manejarErrores);

module.exports = router;
