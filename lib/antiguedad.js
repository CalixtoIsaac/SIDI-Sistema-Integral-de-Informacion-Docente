/**
 * Antigüedad del docente (07 §7.2 #10, §8 #17): desde el PRIMER SEMESTRE que dio clases.
 * Se muestra en años y semestres, p. ej. "4 años · 9 semestres".
 *
 *   semestres = semestres ENE-MAY / AGO-DIC desde el primero hasta el de hoy (incluidos)
 *   anios     = años cumplidos entre el inicio del primer semestre y hoy
 *
 * Un día de junio–julio (verano) cuenta dentro de ENE-MAY de ese año.
 */
const { partesFecha } = require('./quincena');
const periodos = require('./periodos');

/** Índice consecutivo de semestre: ENE-MAY 2026 → 4052, AGO-DIC 2026 → 4053. */
function indiceSemestre(fecha) {
  const p = partesFecha(fecha);
  if (!p) return null;
  return p.anio * 2 + (p.mes >= 8 ? 1 : 0);
}

/** Fecha de inicio ISO del semestre: '2022-08-01'. Acepta fecha ISO o texto 'AGO-DIC 2022'. */
function inicioDe(valor) {
  if (!valor) return null;
  if (partesFecha(valor)) return valor;
  return periodos.interpretar(valor)?.fechaInicio ?? null;
}

/**
 * Elige el inicio más antiguo entre lo calculado (asignaturas/OPINA) y lo capturado a mano.
 * Devuelve null si ninguno sirve.
 */
function primerInicio(...candidatos) {
  const fechas = candidatos.map(inicioDe).filter(Boolean).sort();
  return fechas[0] ?? null;
}

/**
 * { anios, semestres, desde, texto } o null si no hay fecha de inicio.
 * `desde` = clave del primer semestre ('AGO-DIC 2022').
 */
function calcular(inicio, hoy = new Date()) {
  const fechaInicio = inicioDe(inicio);
  const i = indiceSemestre(fechaInicio);
  const h = indiceSemestre(hoy);
  if (i === null || h === null || i > h) return null;
  const pi = partesFecha(fechaInicio);
  const ph = partesFecha(hoy);
  let anios = ph.anio - pi.anio;
  if (ph.mes < pi.mes || (ph.mes === pi.mes && ph.dia < pi.dia)) anios -= 1;
  const semestres = h - i + 1;
  const desde = `${pi.mes >= 8 ? 'AGO-DIC' : 'ENE-MAY'} ${pi.anio}`;
  return {
    anios,
    semestres,
    desde,
    texto: `${anios} ${anios === 1 ? 'año' : 'años'} · ${semestres} ${semestres === 1 ? 'semestre' : 'semestres'}`,
  };
}

module.exports = { indiceSemestre, inicioDe, primerInicio, calcular };
