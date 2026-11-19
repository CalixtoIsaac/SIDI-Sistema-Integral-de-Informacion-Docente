/**
 * Pagos adicionales de la quincena (HU-11; 06 §Incidencias).
 *
 *  GET    /api/incidencias?quincenaId=&origen=manual|suplencia&pendientes=true → { incidencias, totales }
 *  POST   /api/incidencias          → 201 { incidencia }
 *  POST   /api/incidencias/copiar   → 201 { copiadas, omitidas, incidencias }  { desdeQuincenaId, haciaQuincenaId }
 *  PATCH  /api/incidencias/orden    → { orden }  { ids: [..] }
 *  GET    /api/incidencias/:id      → { incidencia }
 *  PUT    /api/incidencias/:id      → { incidencia }  · 409 si es de una suplencia · 423 si la quincena está cerrada
 *  DELETE /api/incidencias/:id      → 204 (mismas reglas)
 */
const express = require('express');
const db = require('../lib/db');
const incidenciasService = require('../services/incidenciasService');
const { HttpError, manejarErrores } = require('../lib/errores');

const router = express.Router();

router.param('id', (req, res, next, valor) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Id de incidencia inválido.', 'ID_INVALIDO'));
  req.incidenciaId = id;
  return next();
});

router.get('/', (req, res) => res.json(incidenciasService.listar(db, req.query)));
router.post('/', (req, res) => res.status(201).json({ incidencia: incidenciasService.crear(db, req.body ?? {}) }));
router.post('/copiar', (req, res) => res.status(201).json(incidenciasService.copiar(db, req.body ?? {})));
router.patch('/orden', (req, res) => res.json(incidenciasService.reordenar(db, req.body ?? {})));
router.get('/:id', (req, res) => res.json({ incidencia: incidenciasService.obtener(db, req.incidenciaId) }));
router.put('/:id', (req, res) => res.json({ incidencia: incidenciasService.actualizar(db, req.incidenciaId, req.body ?? {}) }));
router.delete('/:id', (req, res) => {
  incidenciasService.eliminar(db, req.incidenciaId);
  res.status(204).end();
});

router.use(manejarErrores);

module.exports = router;
