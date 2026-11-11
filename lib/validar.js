/**
 * Ayudas para validar cuerpos JSON y juntar los errores por campo (400 con details).
 */
const { HttpError } = require('./errores');

class Validador {
  constructor() {
    this.details = [];
  }

  error(campo, problema) {
    this.details.push({ campo, problema });
    return undefined;
  }

  /** Texto recortado. null si viene vacío. `max` en caracteres. */
  texto(campo, valor, { obligatorio = false, max = 200 } = {}) {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
      return obligatorio ? this.error(campo, 'OBLIGATORIO') : null;
    }
    const t = String(valor).replace(/\s+/g, ' ').trim();
    if (t.length > max) return this.error(campo, 'MUY_LARGO');
    return t;
  }

  /** Valor de una lista cerrada. */
  opcion(campo, valor, opciones, { obligatorio = false } = {}) {
    if (valor === undefined || valor === null || valor === '') return obligatorio ? this.error(campo, 'OBLIGATORIO') : null;
    return opciones.includes(valor) ? valor : this.error(campo, 'VALOR_INVALIDO');
  }

  entero(campo, valor, { min = -Infinity, max = Infinity, obligatorio = false } = {}) {
    if (valor === undefined || valor === null || valor === '') return obligatorio ? this.error(campo, 'OBLIGATORIO') : null;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) return this.error(campo, 'VALOR_INVALIDO');
    return n;
  }

  /** Lanza 400 si hubo errores. */
  terminar(mensaje = 'Revisa los datos marcados.') {
    if (this.details.length) throw new HttpError(400, mensaje, 'VALIDACION', this.details);
  }
}

/** true si el cuerpo trae la propiedad (aunque sea null): para actualizaciones parciales. */
function trae(body, campo) {
  return body !== null && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, campo);
}

module.exports = { Validador, trae };
