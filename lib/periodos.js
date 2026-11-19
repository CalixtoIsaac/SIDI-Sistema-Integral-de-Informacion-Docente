/**
 * Periodos (semestres) como los nombra la institución (04 §2).
 *   clave:          'AGO-DIC 2026' | 'ENE-MAY 2026'
 *   etiqueta_opina: '2026 Ago - Dic' (igual en OPINA y en el Excel de grupos)
 */

const { normalizarTexto } = require('./horario');

const SEMESTRES = {
  'ago-dic': { clave: 'AGO-DIC', etiqueta: 'Ago - Dic', mesInicio: 8, mesFin: 12, diaFin: 31 },
  'ene-may': { clave: 'ENE-MAY', etiqueta: 'Ene - May', mesInicio: 1, mesFin: 5, diaFin: 31 },
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Interpreta '2026 Ago - Dic', 'AGO-DIC 2026' o 'Ago-Dic 2026'. null si no se reconoce. */
function interpretar(texto) {
  const t = normalizarTexto(texto).replace(/\s*-\s*/g, '-');
  const anio = t.match(/\b(20\d{2})\b/);
  const sem = t.match(/\b(ago-dic|ene-may)\b/);
  if (!anio || !sem) return null;
  const info = SEMESTRES[sem[1]];
  const a = Number(anio[1]);
  return {
    clave: `${info.clave} ${a}`,
    etiquetaOpina: `${a} ${info.etiqueta}`,
    fechaInicio: `${a}-${pad2(info.mesInicio)}-01`,
    fechaFin: `${a}-${pad2(info.mesFin)}-${info.diaFin}`,
  };
}

/** '2026 Ago - Dic' → 'AGO-DIC 2026' */
function clave(texto) {
  return interpretar(texto)?.clave ?? null;
}

module.exports = { interpretar, clave };
