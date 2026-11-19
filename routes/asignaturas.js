/**
 * Asignaturas y actividades (HU-01). El alta va en POST /api/docentes/:id/asignaturas.
 *
 *  PUT    /api/asignaturas/:id  → { asignatura }  (contrato, idioma, tipo de clase, horario…;
 *                                 quedan marcados como editados a mano)
 *  DELETE /api/asignaturas/:id  → 204 · 409 si tiene faltas
 */
const express = require('express');
const db = require('../lib/db');
const asignaturasService = require('../services/asignaturasService');
const { HttpError, manejarErrores } = require('../lib/errores');

const router = express.Router();

router.param('id', (req, res, next, valor) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Id de asignatura inválido.', 'ID_INVALIDO'));
  req.asignaturaId = id;
  return next();
});

router.put('/:id', (req, res) => {
  res.json({ asignatura: asignaturasService.actualizar(db, req.asignaturaId, req.body ?? {}) });
});

router.delete('/:id', (req, res) => {
  asignaturasService.eliminar(db, req.asignaturaId);
  res.status(204).end();
});

router.use(manejarErrores);

module.exports = router;
