/**
 * Contratos por CRN (HU-27).
 *
 *  GET  /api/contratos/plantilla?periodoId=  → descarga CONTRATOS_<PERIODO>.xlsx prellenado
 *  POST /api/contratos/preview               → multipart (archivo, periodoId opcional) → vista previa, NO guarda
 *  POST /api/contratos/confirm               → { previewId, conservarManual: [crn…] } → 201
 *  GET  /api/contratos/importaciones         → historial
 */
const express = require('express');
const db = require('../lib/db');
const contratosService = require('../services/contratosService');
const { unArchivo } = require('../lib/subida');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

router.get('/plantilla', (req, res) => {
  const { nombre, buffer } = contratosService.plantilla(db, req.query.periodoId);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(buffer);
});

router.post('/preview', unArchivo('archivo', { maxMb: 15, extensiones: ['.xlsx', '.xls', '.csv'] }), (req, res) => {
  res.json(contratosService.preview(db, { buffer: req.file.buffer, nombre: req.file.nombre }, req.body?.periodoId));
});

router.post('/confirm', (req, res) => {
  res.status(201).json(contratosService.confirm(db, req.body ?? {}));
});

router.get('/importaciones', (req, res) => {
  res.json({ importaciones: contratosService.importaciones(db) });
});

router.use(manejarErrores);

module.exports = router;
