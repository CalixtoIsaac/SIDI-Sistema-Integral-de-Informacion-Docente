/**
 * Lector del Excel de grupos docentes: GRUPOS_DOCENTES_<PERIODO>.xlsx (07 §7).
 *
 * Hoja 'Salida', encabezados en la fila 1. Una fila = un bloque de horario
 * (mismos días y horas); un CRN con sesiones a horas distintas trae varias filas.
 * Los grupos en línea (F61, F62, configurable) se OMITEN y se listan aparte.
 *
 * No toca la BD: devuelve lo leído para que gruposService arme la vista previa.
 */
const nomina = require('../../nomina');
const horario = require('../../horario');
const periodos = require('../../periodos');
const { separarFormatoOpina } = require('../../nombres');
const {
  ArchivoNoReconocido, abrirLibro, buscarHoja, filasDeHoja, mapearColumnas, texto, textoCrudo, crn,
} = require('./comun');

const HOJA = 'Salida';
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

const COLUMNAS = {
  campus: ['Campus'],
  periodo: ['Descripción periodo', 'Descripcion periodo', 'Periodo'],
  nivel: ['Descripción nivel académico materia', 'Nivel académico'],
  claveMateria: ['Clave materia', 'Clave de materia'],
  materia: ['Nombre largo materia', 'Nombre materia', 'Materia'],
  crn: ['CRN'],
  numeroGrupo: ['Número grupo', 'Numero grupo', 'Grupo'],
  modalidad: ['Modalidad grupo', 'Modalidad'],
  nomina: ['Nómina profesor', 'Nomina profesor', 'Nómina'],
  profesor: ['Nombre completo profesor', 'Profesor'],
  lunes: ['Lunes'],
  martes: ['Martes'],
  miercoles: ['Miércoles', 'Miercoles'],
  jueves: ['Jueves'],
  viernes: ['Viernes'],
  inicio: ['Hora inicio clase', 'Hora inicio'],
  fin: ['Hora fin clase', 'Hora fin'],
};
const OBLIGATORIAS = ['periodo', 'materia', 'crn', 'numeroGrupo', 'nomina', 'profesor', ...DIAS, 'inicio', 'fin'];

function validarColumnas(indices) {
  const faltan = OBLIGATORIAS.filter((c) => indices[c] === undefined);
  if (faltan.length) {
    throw new ArchivoNoReconocido(
      `No es el Excel de grupos docentes: faltan columnas (${faltan.join(', ')}).`,
      faltan.map((campo) => ({ campo, problema: 'COLUMNA_FALTANTE' })),
    );
  }
}

/** Lee una fila y la convierte en objeto; devuelve { fila } o { aviso }. */
function leerFila(valores, idx, numeroFila) {
  const get = (campo) => (idx[campo] === undefined ? null : valores[idx[campo]]);
  const crnFila = crn(get('crn'));
  const nominaFila = nomina.normalizar(get('nomina'));
  if (!crnFila) return { aviso: { fila: numeroFila, tipo: 'CRN_INVALIDO', detalle: String(get('crn') ?? '') } };
  if (!nominaFila) return { aviso: { fila: numeroFila, tipo: 'NOMINA_INVALIDA', crn: crnFila, detalle: String(get('nomina') ?? '') } };

  const sesiones = horario.sesionesDeFila(DIAS.map(get), get('inicio'), get('fin'));
  return {
    fila: {
      numeroFila,
      campus: texto(get('campus')),
      periodo: texto(get('periodo')),
      nivel: texto(get('nivel')),
      claveMateria: texto(get('claveMateria'))?.toUpperCase() ?? null,
      materia: texto(get('materia')),
      crn: crnFila,
      numeroGrupo: texto(get('numeroGrupo'))?.toUpperCase() ?? null,
      modalidad: texto(get('modalidad')),
      nomina: nominaFila,
      profesor: textoCrudo(get('profesor')),
      sesiones,
    },
  };
}

/** Une las filas de un mismo CRN en una asignatura con todas sus sesiones. */
function agruparPorCrn(filas, avisos) {
  const porCrn = new Map();
  for (const f of filas) {
    const actual = porCrn.get(f.crn);
    if (!actual) {
      porCrn.set(f.crn, { ...f, filas: [f.numeroFila], horarios: [...f.sesiones] });
      continue;
    }
    if (actual.nomina !== f.nomina) {
      avisos.push({ fila: f.numeroFila, tipo: 'CRN_VARIOS_DOCENTES', crn: f.crn, detalle: `${actual.nomina} y ${f.nomina}; se usa ${actual.nomina}` });
    }
    actual.filas.push(f.numeroFila);
    actual.horarios.push(...f.sesiones);
  }
  return [...porCrn.values()];
}

function aAsignatura(g, avisos) {
  const horas = horario.horasSemana(g.horarios);
  if (g.horarios.length === 0) avisos.push({ fila: g.filas[0], tipo: 'SIN_HORARIO', crn: g.crn });
  else if (horas === null) avisos.push({ fila: g.filas[0], tipo: 'HORARIO_INVALIDO', crn: g.crn });
  return {
    crn: g.crn,
    claveMateria: g.claveMateria,
    materia: g.materia,
    numeroGrupo: g.numeroGrupo,
    modalidad: g.modalidad,
    plan: horario.plan(g.modalidad),
    idioma: horario.idiomaSugerido(g.claveMateria, g.modalidad),
    horasSemana: horas,
    nomina: g.nomina,
    horarios: g.horarios,
    filas: g.filas,
  };
}

function resumirDocentes(filas, asignaturas, avisos) {
  const docentes = new Map();
  for (const f of filas) {
    if (docentes.has(f.nomina)) continue;
    const nombre = separarFormatoOpina(f.profesor);
    if (!nombre.seguro) avisos.push({ fila: f.numeroFila, tipo: 'NOMBRE_SIN_SEPARADOR', detalle: f.profesor });
    docentes.set(f.nomina, {
      nomina: f.nomina,
      nombres: nombre.nombres,
      apellidoPaterno: nombre.apellidoPaterno,
      apellidoMaterno: nombre.apellidoMaterno,
      nombreOriginal: f.profesor,
      grupos: 0,
    });
  }
  for (const a of asignaturas) docentes.get(a.nomina).grupos += 1;
  return [...docentes.values()].filter((d) => d.grupos > 0);
}

/**
 * Lee el archivo.
 * @param {Buffer} buffer
 * @param {{ omitirGrupos?: string|string[], campus?: string }} opciones
 * @returns {{ periodo, campus, nivel, filas, asignaturas, docentes, omitidos, descartadas, avisos }}
 */
function leer(buffer, opciones = {}) {
  const libro = abrirLibro(buffer);
  const hoja = buscarHoja(libro, HOJA);
  if (!hoja) throw new ArchivoNoReconocido(`No es el Excel de grupos docentes: no tiene la hoja "${HOJA}".`);

  const [encabezados = [], ...datos] = filasDeHoja(hoja);
  const idx = mapearColumnas(encabezados, COLUMNAS);
  validarColumnas(idx);

  const campusEsperado = opciones.campus ? horario.normalizarTexto(opciones.campus) : null;
  const avisos = [];
  const filas = [];
  const omitidosPorCrn = new Map();
  let descartadas = 0;

  datos.forEach((valores, i) => {
    const r = leerFila(valores, idx, i + 2);
    if (r.aviso) {
      avisos.push(r.aviso);
      return;
    }
    const f = r.fila;
    if (campusEsperado && f.campus && horario.normalizarTexto(f.campus) !== campusEsperado) {
      descartadas += 1;
      return;
    }
    if (horario.debeOmitirse(f.numeroGrupo, opciones.omitirGrupos)) {
      if (!omitidosPorCrn.has(f.crn)) omitidosPorCrn.set(f.crn, { crn: f.crn, grupo: f.numeroGrupo, materia: f.materia, motivo: 'En línea' });
      return;
    }
    filas.push(f);
  });

  const etiquetas = [...new Set(filas.map((f) => f.periodo).filter(Boolean))];
  if (etiquetas.length > 1) avisos.push({ tipo: 'VARIOS_PERIODOS', detalle: etiquetas.join(', ') });
  const periodo = periodos.interpretar(etiquetas[0] ?? datos.map((v) => v[idx.periodo]).find(Boolean));
  if (!periodo) throw new ArchivoNoReconocido('No se pudo detectar el periodo (columna "Descripción periodo").');

  const asignaturas = agruparPorCrn(filas, avisos).map((g) => aAsignatura(g, avisos));
  return {
    periodo,
    campus: filas[0]?.campus ?? null,
    nivel: filas[0]?.nivel ?? null,
    filas: datos.length,
    asignaturas,
    docentes: resumirDocentes(filas, asignaturas, avisos),
    omitidos: [...omitidosPorCrn.values()],
    descartadas,
    avisos,
  };
}

module.exports = { leer, HOJA, COLUMNAS };
