/**
 * Docentes (06 §Docentes).
 *
 *  GET /api/docentes              → { docentes, total, page, limit, periodo, periodoOpina }   (HU-03)
 *  GET /api/docentes/:id          → { docente }  ficha extendida (HU-04)
 *  GET /api/docentes/:id/resumen  → { resumen }  hover (HU-04)
 *  GET /api/docentes/:id/cv       → PDF del CV · 404 si no tiene (HU-04)
 *  GET /api/docentes/motivos-baja → { motivos: [{ motivo, recontratableSugerido }] } (HU-21)
 *  PATCH /api/docentes/:id/estatus → dar de baja { activo:false, motivo, observaciones, recontratable }
 *                                   o reactivar { activo:true, confirmarNoRecontratable } (HU-05, HU-21)
 *  GET /api/docentes/:id/bajas    → { bajas } historial (HU-21)
 */
const express = require('express');
const db = require('../lib/db');
const docentesService = require('../services/docentesService');
const bajaService = require('../services/bajaService');
const { HttpError, manejarErrores } = require('../lib/errores');

const router = express.Router();

/** Valida :id como entero positivo. */
router.param('id', (req, res, next, valor) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Id de docente inválido.', 'ID_INVALIDO'));
  req.docenteId = id;
  return next();
});

router.get('/', (req, res) => {
  res.json(docentesService.listar(db, req.query, { filtrar: docentesService.filtrarBasico }));
});

router.get('/motivos-baja', (req, res) => {
  res.json({ motivos: bajaService.motivosBaja(db) });
});

router.get('/:id', (req, res) => {
  res.json({ docente: docentesService.detalle(db, req.docenteId, { periodoId: req.query.periodoId }) });
});

router.get('/:id/resumen', (req, res) => {
  res.json({ resumen: docentesService.resumen(db, req.docenteId) });
});

router.get('/:id/cv', (req, res, next) => {
  const { ruta, nombre } = docentesService.archivoCv(db, req.docenteId);
  res.type('application/pdf');
  res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  res.sendFile(ruta, (err) => err && next(err));
});

router.patch('/:id/estatus', (req, res) => {
  res.json(bajaService.cambiarEstatus(db, req.docenteId, req.body));
});

router.get('/:id/bajas', (req, res) => {
  res.json({ bajas: bajaService.historial(db, req.docenteId) });
});

router.use(manejarErrores);

module.exports = router;
