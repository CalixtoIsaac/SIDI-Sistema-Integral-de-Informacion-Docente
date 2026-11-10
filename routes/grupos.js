/**
 * Carga del Excel de grupos docentes (HU-02).
 *
 *  POST /api/grupos/excel/preview   multipart (archivo) → vista previa, NO guarda
 *  POST /api/grupos/excel/confirm   { previewId, inactivarAusentes } → aplica en una transacción
 *  GET  /api/grupos/importaciones   → historial
 */
const express = require('express');
const db = require('../lib/db');
const gruposService = require('../services/gruposService');
const { unArchivo } = require('../lib/subida');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

router.post('/excel/preview', unArchivo('archivo', { maxMb: 15, extensiones: ['.xlsx', '.xlsm', '.xls'] }), (req, res) => {
  res.json(gruposService.preview(db, { buffer: req.file.buffer, nombre: req.file.nombre }));
});

router.post('/excel/confirm', (req, res) => {
  const resultado = gruposService.confirm(db, {
    previewId: req.body?.previewId,
    inactivarAusentes: req.body?.inactivarAusentes === true,
  });
  res.status(201).json(resultado);
});

router.get('/importaciones', (req, res) => {
  res.json({ importaciones: gruposService.importaciones(db) });
});

router.use(manejarErrores);

module.exports = router;
