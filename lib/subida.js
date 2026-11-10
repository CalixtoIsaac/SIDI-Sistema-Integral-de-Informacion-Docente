/**
 * Subida de archivos con multer (en memoria: los Excel no se guardan en disco).
 * Límites de 06: 15 MB Excel, 30 MB OPINA, 10 MB por PDF.
 */
const path = require('path');
const multer = require('multer');
const { HttpError } = require('./errores');

const MB = 1024 * 1024;

/** Middleware para UN archivo en el campo `campo`, con extensiones permitidas. */
function unArchivo(campo, { maxMb, extensiones }) {
  const subir = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * MB, files: 1 },
    fileFilter(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!extensiones.includes(ext)) {
        return cb(new HttpError(422, `Tipo de archivo no permitido (${ext || 'sin extensión'}). Usa ${extensiones.join(' o ')}.`, 'TIPO_ARCHIVO'));
      }
      return cb(null, true);
    },
  }).single(campo);

  return (req, res, next) => subir(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(new HttpError(400, `Falta el archivo (campo "${campo}").`, 'SIN_ARCHIVO'));
    // multer entrega el nombre en latin1; se convierte para conservar acentos.
    req.file.nombre = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    return next();
  });
}

module.exports = { unArchivo };
