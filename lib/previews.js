/**
 * Vistas previas en memoria (06: "Las vistas previas se guardan en memoria 30 minutos").
 * La vista previa NO escribe en la BD; el confirm usa lo guardado aquí.
 */
const crypto = require('crypto');
const { HttpError } = require('./errores');

const DURACION_MS = 30 * 60 * 1000;

function crearAlmacen(tipo, duracionMs = DURACION_MS) {
  const datos = new Map();

  function limpiarVencidas(ahora = Date.now()) {
    for (const [id, v] of datos) if (v.vence <= ahora) datos.delete(id);
  }

  return {
    guardar(valor) {
      limpiarVencidas();
      const id = crypto.randomUUID();
      datos.set(id, { valor, vence: Date.now() + duracionMs });
      return id;
    },
    /** Devuelve lo guardado o lanza 404 si no existe o ya venció. */
    obtener(id) {
      limpiarVencidas();
      const v = datos.get(String(id ?? ''));
      if (!v) {
        throw new HttpError(404, `La vista previa de ${tipo} ya no existe o venció (30 min). Vuelve a subir el archivo.`, 'PREVIEW_NO_EXISTE');
      }
      return v.valor;
    },
    borrar(id) {
      datos.delete(id);
    },
    get tamano() {
      return datos.size;
    },
  };
}

module.exports = { crearAlmacen, DURACION_MS };
