/**
 * Configuración del perfil y de la app (06 §Sistema: GET/PUT /configuracion).
 * Tabla clave/valor; las claves que aún no están en la BD toman su valor por defecto.
 *
 *   listar(db)            → { 'tema.modo': 'automatico', 'tema.color': '#DB2777', … }
 *   actualizar(db, body)  → guarda solo las claves conocidas, validadas, en una transacción
 */
const { HttpError } = require('../lib/errores');
const color = require('../lib/color');
const { POR_DEFECTO } = require('../lib/configuracion');

/** Valores por defecto propios del perfil (no dependen de lib/semillas.js, que es de BD). */
const DEFECTOS = {
  ...POR_DEFECTO,
  'tema.modo': 'automatico',
  'tema.color': '#DB2777',
  'perfil.nombre': 'Coordinación de Docentes',
  'opina.top_n': '10',
  'reportes.agrupar_suplencias': '1',
};

const MODOS = ['claro', 'oscuro', 'automatico'];

/** Validador por clave: devuelve el valor normalizado (texto) o lanza el problema. */
const VALIDAR = {
  'tema.modo': (v) => (MODOS.includes(v) ? v : 'VALOR_INVALIDO'),
  'tema.color': (v) => {
    if (!color.hexValido(v)) return 'FORMATO';
    return color.analizar(v).valido ? String(v).toUpperCase() : 'CONTRASTE_INSUFICIENTE';
  },
  'perfil.nombre': (v) => {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return 'OBLIGATORIO';
    return t.length > 60 ? 'MUY_LARGO' : t;
  },
  'opina.muestra_minima': (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 500 ? String(Number(v)) : 'VALOR_INVALIDO'),
  'opina.top_n': (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100 ? String(Number(v)) : 'VALOR_INVALIDO'),
  'opina.campus': (v) => (String(v ?? '').trim() ? String(v).trim() : 'OBLIGATORIO'),
  'opina.solo_presencial': (v) => (['0', '1', 0, 1, true, false].includes(v) ? (v === true || String(v) === '1' ? '1' : '0') : 'VALOR_INVALIDO'),
  'reportes.agrupar_suplencias': (v) => (['0', '1', 0, 1, true, false].includes(v) ? (v === true || String(v) === '1' ? '1' : '0') : 'VALOR_INVALIDO'),
  'grupos.omitir_grupos': (v) => String(v ?? '').split(',').map((g) => g.trim().toUpperCase()).filter(Boolean).join(','),
};

function listar(db) {
  const guardadas = Object.fromEntries(db.prepare('SELECT clave, valor FROM configuracion').all().map((f) => [f.clave, f.valor]));
  return { ...DEFECTOS, ...guardadas };
}

function actualizar(db, body = {}) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Envía un objeto con las claves a cambiar.', 'CUERPO_INVALIDO');
  }
  const details = [];
  const cambios = [];
  for (const [clave, valor] of Object.entries(body)) {
    const validar = VALIDAR[clave];
    if (!validar) {
      details.push({ campo: clave, problema: 'CLAVE_DESCONOCIDA' });
      continue;
    }
    const r = validar(valor);
    if (['VALOR_INVALIDO', 'FORMATO', 'OBLIGATORIO', 'MUY_LARGO', 'CONTRASTE_INSUFICIENTE'].includes(r)) details.push({ campo: clave, problema: r });
    else cambios.push([clave, r]);
  }
  if (details.length) {
    const contraste = details.some((d) => d.problema === 'CONTRASTE_INSUFICIENTE');
    throw new HttpError(400, contraste ? 'Este color no tiene suficiente contraste; elige uno más oscuro.' : 'Revisa los datos marcados.', 'VALIDACION', details);
  }
  const guardar = db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  db.transaction(() => { for (const [clave, valor] of cambios) guardar.run(clave, valor); })();
  return listar(db);
}

module.exports = { listar, actualizar, MODOS };
