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
 *  POST /api/docentes             → 201 { docente } alta manual (HU-01)
 *  POST /api/docentes/alta-rapida → 201 { docente } { nomina, nombre } para suplentes (HU-01)
 *  PUT  /api/docentes/:id         → { docente } edición parcial (HU-01)
 *  POST /api/docentes/:id/titulos     → 201 { titulo } (HU-01)
 *  POST /api/docentes/:id/asignaturas → 201 { asignatura } grupo o actividad (HU-01)
 *  POST /api/docentes/cv/preview  → multipart (archivos[], hasta 60 PDF de 10 MB) → vista previa (HU-20)
 *  POST /api/docentes/cv/confirm  → { previewId, items: [{ archivo, docenteId | nomina | omitir, datos }] } (HU-20)
 */
const express = require('express');
const db = require('../lib/db');
const docentesService = require('../services/docentesService');
const bajaService = require('../services/bajaService');
const edicionService = require('../services/docentesEdicionService');
const titulosService = require('../services/titulosService');
const asignaturasService = require('../services/asignaturasService');
const cvService = require('../services/cvService');
const { variosArchivos } = require('../lib/subida');
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

router.post('/cv/preview', variosArchivos('archivos', { maxMb: 10, maxArchivos: 60 }), (req, res, next) => {
  cvService.preview(db, req.archivos).then((r) => res.json(r)).catch(next);
});

router.post('/cv/confirm', (req, res) => {
  res.status(201).json(cvService.confirm(db, req.body ?? {}));
});

router.post('/', (req, res) => {
  const id = edicionService.crear(db, req.body ?? {});
  res.status(201).json({ docente: docentesService.detalle(db, id) });
});

router.post('/alta-rapida', (req, res) => {
  const id = edicionService.altaRapida(db, req.body ?? {});
  res.status(201).json({ docente: docentesService.detalle(db, id) });
});

router.put('/:id', (req, res) => {
  edicionService.actualizar(db, req.docenteId, req.body ?? {});
  res.json({ docente: docentesService.detalle(db, req.docenteId) });
});

router.post('/:id/titulos', (req, res) => {
  res.status(201).json({ titulo: titulosService.crear(db, req.docenteId, req.body ?? {}) });
});

router.post('/:id/asignaturas', (req, res) => {
  res.status(201).json({ asignatura: asignaturasService.crear(db, req.docenteId, req.body ?? {}) });
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
