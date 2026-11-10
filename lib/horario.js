/**
 * Horarios y carga del CRN (07 §7.0.1, 04 §5).
 *
 *   duracion(sesion) = redondear_a_0.5h((hora_fin + 1 min) − hora_inicio)
 *                      '11:00–12:29' = 1.5 h; '16:00–17:35' = 1.5 h
 *   horas_semana     = Σ duración de sus sesiones (cada día marcado 'SI' es una sesión)
 *   idioma_sugerido  = 'EN' si la materia es versión en inglés o modalidad 'Bachillerato Intercultural'
 *   plan             = 'Bachillerato Intercultural' → 'Bachillerato General Bilingüe'
 *   omitir CRN       = numero_grupo ∈ grupos.omitir_grupos (F61, F62: en línea)
 *
 * Días de la semana: 1 = lunes … 7 = domingo (las columnas K–O del Excel son lunes–viernes).
 */

/** Claves de materias que son la versión en inglés (07 §7.0.1). */
const MATERIAS_EN = new Set(['BSMA2003', 'BSCN2004', 'BSHU2004', 'BSCN3002']);
const MODALIDAD_BILINGUE = 'bachillerato intercultural';
const GRUPOS_OMITIDOS_POR_DEFECTO = ['F61', 'F62'];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Quita acentos, espacios sobrantes y pasa a minúsculas. */
function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Convierte una hora a minutos desde la medianoche.
 * Acepta '7:30', '07:30', '07:30:00' o la fracción de día que usa Excel (0.3125).
 * Devuelve null si no se reconoce.
 */
function aMinutos(hora) {
  if (typeof hora === 'number' && Number.isFinite(hora)) {
    if (hora < 0 || hora >= 1) return null;
    return Math.round(hora * 24 * 60);
  }
  const m = String(hora ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutos → 'HH:MM'. */
function aHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** Normaliza una hora a 'HH:MM' (formato de la BD). null si no se reconoce. */
function normalizarHora(hora) {
  const min = aMinutos(hora);
  return min === null ? null : aHora(min);
}

/** Redondea al medio punto más cercano: 1.6 → 1.5, 1.75 → 2. */
function redondearMedia(horas) {
  return Math.round(horas * 2) / 2;
}

/**
 * Duración en horas de una sesión. Las horas de fin terminan en :29/:59,
 * por eso se suma 1 minuto antes de restar. null si las horas son inválidas
 * o el fin no es posterior al inicio.
 */
function duracionSesion(inicio, fin) {
  const i = aMinutos(inicio);
  const f = aMinutos(fin);
  if (i === null || f === null || f <= i) return null;
  return redondearMedia((f + 1 - i) / 60);
}

/**
 * Horas por semana de un CRN. `sesiones` = [{ dia, inicio, fin }].
 * Una sesión inválida hace que el resultado sea null (se marca para revisar).
 */
function horasSemana(sesiones) {
  if (!Array.isArray(sesiones) || sesiones.length === 0) return 0;
  let total = 0;
  for (const s of sesiones) {
    const d = duracionSesion(s.inicio, s.fin);
    if (d === null) return null;
    total += d;
  }
  return total;
}

/**
 * Convierte una fila del Excel de grupos (columnas Lunes…Viernes con 'SI'/vacío)
 * en sesiones. `dias` = { Lunes: 'SI', Martes: '', … } o arreglo de 5 valores.
 */
function sesionesDeFila(dias, inicio, fin) {
  const valores = Array.isArray(dias) ? dias : DIAS.slice(0, 5).map((d) => dias?.[d]);
  const horaInicio = normalizarHora(inicio);
  const horaFin = normalizarHora(fin);
  const sesiones = [];
  valores.forEach((v, idx) => {
    if (normalizarTexto(v) === 'si') sesiones.push({ dia: idx + 1, inicio: horaInicio, fin: horaFin });
  });
  return sesiones;
}

/** 'EN' o 'ES' según la clave de la materia y la modalidad del grupo. */
function idiomaSugerido(claveMateria, modalidad) {
  const clave = String(claveMateria ?? '').trim().toUpperCase();
  if (MATERIAS_EN.has(clave)) return 'EN';
  if (normalizarTexto(modalidad) === MODALIDAD_BILINGUE) return 'EN';
  return 'ES';
}

/** Plan del grupo según su modalidad. */
function plan(modalidad) {
  return normalizarTexto(modalidad) === MODALIDAD_BILINGUE ? 'Bachillerato General Bilingüe' : 'Bachillerato General';
}

/**
 * Lista de grupos a omitir. Acepta el valor de configuración 'F61,F62'
 * o un arreglo. Sin valor → F61 y F62.
 */
function gruposOmitidos(config) {
  if (config === undefined || config === null) return [...GRUPOS_OMITIDOS_POR_DEFECTO];
  const lista = Array.isArray(config) ? config : String(config).split(',');
  return lista.map((g) => String(g).trim().toUpperCase()).filter(Boolean);
}

/** true si el número de grupo es en línea y no se importa. */
function debeOmitirse(numeroGrupo, config) {
  const grupo = String(numeroGrupo ?? '').trim().toUpperCase();
  return grupo !== '' && gruposOmitidos(config).includes(grupo);
}

/**
 * true si dos sesiones se empalman (mismo día y los intervalos se cruzan):
 *   inicio < fin' AND inicio' < fin
 * Se usa el fin real (+1 min) para que '07:30–08:59' y '09:00–10:29' NO se empalmen.
 */
function seEmpalman(a, b) {
  if (Number(a.dia) !== Number(b.dia)) return false;
  const ai = aMinutos(a.inicio);
  const af = aMinutos(a.fin);
  const bi = aMinutos(b.inicio);
  const bf = aMinutos(b.fin);
  if ([ai, af, bi, bf].includes(null)) return false;
  return ai < bf + 1 && bi < af + 1;
}

/** Día 1–7 de una fecha ISO (1 = lunes). */
function diaSemana(fechaIso) {
  const m = String(fechaIso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Nombre del día: 1 → 'Lunes'. */
function nombreDia(dia) {
  return DIAS[Number(dia) - 1] ?? null;
}

module.exports = {
  MATERIAS_EN,
  GRUPOS_OMITIDOS_POR_DEFECTO,
  DIAS,
  normalizarTexto,
  aMinutos,
  normalizarHora,
  duracionSesion,
  horasSemana,
  sesionesDeFila,
  idiomaSugerido,
  plan,
  gruposOmitidos,
  debeOmitirse,
  seEmpalman,
  diaSemana,
  nombreDia,
};
