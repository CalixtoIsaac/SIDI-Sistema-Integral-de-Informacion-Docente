/**
 * Carpetas de datos de SIDI.
 *
 * En desarrollo todo vive en <proyecto>/data (app.db y cv/). En la app instalada
 * (Electron) la carpeta del programa no se puede escribir, así que electron/main.js
 * define SIDI_DATA_DIR = %APPDATA%\SIDI\data antes de arrancar el servidor.
 *
 * En la tabla cv_archivos la ruta se guarda como "data/cv/<archivo>.pdf" (relativa a
 * la carpeta de datos) para que las bases viejas sigan funcionando.
 */
const path = require('path');

const DATA_DIR = path.resolve(process.env.SIDI_DATA_DIR || path.join(__dirname, '..', 'data'));
const CARPETA_CV = path.join(DATA_DIR, 'cv');

/** Ruta absoluta de un archivo guardado como "data/…" en la BD. */
function resolverRutaDatos(rutaGuardada) {
  return path.resolve(DATA_DIR, String(rutaGuardada).replace(/^data[\\/]/, ''));
}

module.exports = { DATA_DIR, CARPETA_CV, resolverRutaDatos };
