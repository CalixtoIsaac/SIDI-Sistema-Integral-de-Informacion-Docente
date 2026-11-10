/**
 * Importación de OPINA (HU-08). El ranking y el comparativo son del Sprint 2 (HU-16, HU-24).
 *
 *  POST   /api/opina/preview             multipart (archivo .xlsx/.xlsb, hasta 30 MB) → NO guarda
 *  POST   /api/opina/confirm             { previewId, reemplazar } → 201 | 409 si ya existe y no se reemplaza
 *  GET    /api/opina/importaciones       → historial
 *  DELETE /api/opina/importaciones/:id   → 204
 */
const express = require('express');
const db = require('../lib/db');
const opinaService = require('../services/opinaService');
const { unArchivo } = require('../lib/subida');
const { HttpError, manejarErrores } = require('../lib/errores');

const router = express.Router();

router.post('/preview', unArchivo('archivo', { maxMb: 30, extensiones: ['.xlsx', '.xlsb', '.xls'] }), (req, res) => {
  res.json(opinaService.preview(db, { buffer: req.file.buffer, nombre: req.file.nombre }));
});

router.post('/confirm', (req, res) => {
  const resultado = opinaService.confirm(db, {
    previewId: req.body?.previewId,
    reemplazar: req.body?.reemplazar === true,
  });
  res.status(201).json(resultado);
});

router.get('/importaciones', (req, res) => {
  res.json({ importaciones: opinaService.importaciones(db) });
});

router.delete('/importaciones/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Id inválido.', 'ID_INVALIDO');
  opinaService.eliminarImportacion(db, id);
  res.status(204).end();
});

router.use(manejarErrores);

module.exports = router;
