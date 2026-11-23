/**
 * Respaldo de la base de datos (06 §Sistema; 01 §Respaldo: botón "Descargar respaldo" en Configuración).
 *
 *  GET /api/respaldo → descarga SIDI-respaldo-AAAA-MM-DD.db (copia consistente con db.backup(), aunque
 *                      haya escrituras en curso; incluye lo que aún está en el WAL)
 *
 * La copia se arma en la carpeta temporal del sistema y se borra al terminar la descarga.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const db = require('../lib/db');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

/** Fecha local AAAA-MM-DD para el nombre del archivo. */
function hoyIso(fecha = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${z(fecha.getMonth() + 1)}-${z(fecha.getDate())}`;
}

router.get('/', (req, res, next) => {
  const temporal = path.join(os.tmpdir(), `sidi-respaldo-${process.pid}-${Date.now()}.db`);
  const borrar = () => fs.rm(temporal, { force: true }, () => {});
  db.backup(temporal)
    .then(() => {
      res.download(temporal, `SIDI-respaldo-${hoyIso()}.db`, (err) => {
        borrar();
        if (err && !res.headersSent) next(err);
      });
    })
    .catch((err) => {
      borrar();
      next(err);
    });
});

router.use(manejarErrores);

module.exports = router;
module.exports.hoyIso = hoyIso;
