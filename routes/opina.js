/**
 * Importación de OPINA (HU-08). El ranking y el comparativo son del Sprint 2 (HU-16, HU-24).
 *
 *  POST   /api/opina/preview             multipart (archivo .xlsx/.xlsb, hasta 30 MB) → NO guarda
 *  POST   /api/opina/confirm             { previewId, reemplazar } → 201 | 409 si ya existe y no se reemplaza
 *  GET    /api/opina/ranking?periodoId=&filtro=todos|mejores|peores|rango&n=&min=&max=&compararCon=&incluirMuestraInsuficiente=
 *                                        → ranking completo con promedios (HU-16)
 *  GET    /api/opina/ranking/excel?…     → descarga OPINA_RANKING_<PERIODO>.xlsx (mismo filtro)
 *  GET    /api/opina/comparativo?periodos=1,2,3 → tabla docente × semestre con promedios por semestre
 *  GET    /api/opina/importaciones       → historial
 *  DELETE /api/opina/importaciones/:id   → 204
 *  GET    /api/opina/campus               → % OPP oficial del campus por semestre con variación (HU-24)
 *  PUT    /api/opina/campus/:periodoId    { alumnos, positivas, regionOpp?, fuente? } → { semestre }
 *  DELETE /api/opina/campus/:periodoId    → 204
 */
const express = require('express');
const db = require('../lib/db');
const opinaService = require('../services/opinaService');
const rankingService = require('../services/rankingService');
const { unArchivo } = require('../lib/subida');
const opinaCampusService = require('../services/opinaCampusService');
const opinaConsulta = require('../services/opinaConsultaService');
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

router.get('/ranking', (req, res) => res.json(rankingService.ranking(db, req.query)));
router.get('/ranking/excel', (req, res) => {
  const { nombre, buffer } = rankingService.excel(db, req.query);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(buffer);
});

router.get('/comparativo', (req, res) => res.json(opinaConsulta.comparativo(db, req.query)));

router.get('/importaciones', (req, res) => {
  res.json({ importaciones: opinaService.importaciones(db) });
});

router.delete('/importaciones/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Id inválido.', 'ID_INVALIDO');
  opinaService.eliminarImportacion(db, id);
  res.status(204).end();
});

router.get('/campus', (req, res) => res.json(opinaCampusService.listar(db)));
router.put('/campus/:periodoId', (req, res) => res.json(opinaCampusService.guardar(db, req.params.periodoId, req.body ?? {})));
router.delete('/campus/:periodoId', (req, res) => {
  opinaCampusService.eliminar(db, req.params.periodoId);
  res.status(204).end();
});

router.use(manejarErrores);

module.exports = router;
