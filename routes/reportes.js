/**
 * Reportes de Nacional (06 §Reportes de Nacional).
 *
 *  GET /api/reportes/descuentos/validar?quincenaId=      → lo que se incluirá y avisos (HU-12)
 *  GET /api/reportes/descuentos?quincenaId=&excluir=1,2  → asigna los pendientes y descarga
 *                                                          DESCUENTO-PREPA Qnn.xlsx (con fila de total) (HU-12)
 */
const express = require('express');
const db = require('../lib/db');
const reporteService = require('../services/reporteService');
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

router.use(manejarErrores);

module.exports = router;
