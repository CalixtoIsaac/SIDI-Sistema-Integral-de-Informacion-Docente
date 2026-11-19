/**
 * Departamentos (catálogo para la ficha del docente).
 *
 *  GET    /api/departamentos      → { departamentos: [{ id, nombre, docentes }] }
 *  POST   /api/departamentos      { nombre } → 201 { departamento }
 *  PUT    /api/departamentos/:id  { nombre } → { departamento }
 *  DELETE /api/departamentos/:id  → 204 · 409 si tiene docentes
 */
const express = require('express');
const db = require('../lib/db');
const departamentosService = require('../services/departamentosService');
const { HttpError, manejarErrores } = require('../lib/errores');

const router = express.Router();

router.param('id', (req, res, next, valor) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Id de departamento inválido.', 'ID_INVALIDO'));
  req.departamentoId = id;
  return next();
});

router.get('/', (req, res) => res.json({ departamentos: departamentosService.listar(db) }));
router.post('/', (req, res) => res.status(201).json({ departamento: departamentosService.crear(db, req.body ?? {}) }));
router.put('/:id', (req, res) => res.json({ departamento: departamentosService.renombrar(db, req.departamentoId, req.body ?? {}) }));
router.delete('/:id', (req, res) => {
  departamentosService.eliminar(db, req.departamentoId);
  res.status(204).end();
});

router.use(manejarErrores);

module.exports = router;
