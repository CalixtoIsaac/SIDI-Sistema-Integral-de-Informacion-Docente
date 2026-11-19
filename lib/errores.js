/**
 * Errores con código HTTP y formato de respuesta de la API (06 §Formato de respuesta):
 *   { "error": "Mensaje para la usuaria", "code": "NOMINA_DUPLICADA", "details": [] }
 */

class HttpError extends Error {
  constructor(status, mensaje, code, details) {
    super(mensaje);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Middleware de errores para los routers de la API. */
// eslint-disable-next-line no-unused-vars
function manejarErrores(err, req, res, next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo es demasiado grande.', code: 'ARCHIVO_GRANDE' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: `Campo de archivo inesperado: "${err.field}".`, code: 'CAMPO_ARCHIVO' });
  }
  if (err.status && err.status < 500) {
    const cuerpo = { error: err.message };
    if (err.code) cuerpo.code = err.code;
    if (err.details?.length) cuerpo.details = err.details;
    return res.status(err.status).json(cuerpo);
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

module.exports = { HttpError, manejarErrores };
