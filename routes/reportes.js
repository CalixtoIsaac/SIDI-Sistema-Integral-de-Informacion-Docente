/**
 * Reportes de Nacional (06 §Reportes de Nacional).
 *
 *  GET /api/reportes/descuentos/validar?quincenaId=      → lo que se incluirá y avisos (HU-12)
 *  GET /api/reportes/descuentos?quincenaId=&excluir=1,2  → asigna los pendientes y descarga
 *                                                          DESCUENTO-PREPA Qnn.xlsx (con fila de total) (HU-12)
 *  GET /api/reportes/incidencias/validar?quincenaId=     → incidencias que se incluirán y avisos (HU-13)
 *  GET /api/reportes/incidencias?quincenaId=&excluir=&excluirIncidencias=
 *                                                        → descarga INCIDENCIAS PREPA Qnn.xlsx (Incidencia + detalle) (HU-13)
 *  POST /api/reportes/enviar   { quincenaId, modo?, para?, cc?, cco?, asunto?, cuerpo?, excluir?, excluirIncidencias? } (HU-25)
 *                              → borrador: descarga Reportes PREPA Qnn.eml (X-Unsent, los 2 Excel adjuntos)
 *                              → mailto: { mailto, archivos: [{ nombre, url }], envioId, asunto } · 400 AVISOS_ROJOS
 *  GET  /api/reportes/envios?quincenaId= → bitácora de envíos (HU-25)
 */
const express = require('express');
const db = require('../lib/db');
const reporteService = require('../services/reporteService');
const envioService = require('../services/envioService');
const { manejarErrores } = require('../lib/errores');

const XLSX_TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const router = express.Router();

function descargar(res, { nombre, buffer }) {
  res.type(XLSX_TIPO);
  res.set('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(buffer);
}

router.get('/descuentos/validar', (req, res) => res.json(reporteService.validarDescuentos(db, req.query.quincenaId)));
router.get('/descuentos', (req, res, next) => {
  reporteService.generarDescuentos(db, req.query.quincenaId, req.query.excluir).then((r) => descargar(res, r)).catch(next);
});

router.get('/incidencias/validar', (req, res) => res.json(reporteService.validarIncidencias(db, req.query.quincenaId)));
router.get('/incidencias', (req, res, next) => {
  reporteService.generarIncidencias(db, req.query.quincenaId, req.query.excluir, req.query.excluirIncidencias)
    .then((r) => descargar(res, r)).catch(next);
});

router.post('/enviar', (req, res, next) => {
  envioService.enviar(db, req.body ?? {}).then((r) => {
    if (r.modo === 'mailto') return res.json({ mailto: r.mailto, archivos: r.archivos, envioId: r.envioId, asunto: r.asunto });
    res.type('message/rfc822');
    res.set('Content-Disposition', `attachment; filename="${r.nombre}"`);
    res.set('X-Envio-Id', String(r.envioId));
    return res.send(r.eml);
  }).catch(next);
});
router.get('/envios', (req, res) => res.json(envioService.envios(db, req.query)));

router.use(manejarErrores);

module.exports = router;
