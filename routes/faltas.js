/**
 * Faltas y descuentos (HU-09; 06 §Faltas y descuentos).
 *
 *  GET    /api/faltas?quincenaId=&docenteId=&periodoId=&pendientes=true → { faltas, totales }
 *  POST   /api/faltas/preview   → calcula sin guardar: { filas, totales, sinContrato, sinTarifa, repetidas, segundaSesion }
 *  POST   /api/faltas           → 201 { faltas, totales }  (una por CRN, día y sesión; transacción)
 *  POST   /api/faltas/disponibles → { gruposASuplir, avisos }  grupos a suplir y docentes disponibles (HU-22)
 *  GET    /api/faltas/:id       → { falta }
 *  PUT    /api/faltas/:id       → { falta }  recalcula monto y textos · 423 si la quincena está cerrada
 *  DELETE /api/faltas/:id       → 204 · 423 si la quincena está cerrada
 *  PUT    /api/faltas/:id/suplencia → { suplencia, avisos } { docenteSuplenteId, numContrato?, monto? } (HU-10)
 *                                     422 si el contrato no es del suplente
 *  DELETE /api/faltas/:id/suplencia → 204 (HU-10)
 */
const express = require('express');
const db = require('../lib/db');
const faltasService = require('../services/faltasService');
const disponiblesService = require('../services/disponiblesService');
const { HttpError, manejarErrores } = require('../lib/errores');

const router = express.Router();

router.param('id', (req, res, next, valor) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Id de falta inválido.', 'ID_INVALIDO'));
  req.faltaId = id;
  return next();
});

router.get('/', (req, res) => res.json(faltasService.listar(db, req.query)));
router.post('/disponibles', (req, res) => res.json(disponiblesService.disponibles(db, req.body ?? {})));
router.post('/preview', (req, res) => res.json(faltasService.preview(db, req.body ?? {})));
router.post('/', (req, res) => res.status(201).json(faltasService.crear(db, req.body ?? {})));
router.get('/:id', (req, res) => res.json({ falta: faltasService.obtener(db, req.faltaId) }));
router.put('/:id', (req, res) => res.json({ falta: faltasService.actualizar(db, req.faltaId, req.body ?? {}) }));
router.delete('/:id', (req, res) => {
  faltasService.eliminar(db, req.faltaId);
  res.status(204).end();
});

router.put('/:id/suplencia', (req, res) => res.json(faltasService.asignarSuplencia(db, req.faltaId, req.body ?? {})));
router.delete('/:id/suplencia', (req, res) => {
  faltasService.quitarSuplencia(db, req.faltaId);
  res.status(204).end();
});

router.use(manejarErrores);

module.exports = router;
