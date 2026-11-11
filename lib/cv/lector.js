/**
 * Lector de CV en PDF, formato institucional "A1 CURRICULUM VITAE DOCENTES" (07 §7.1).
 *
 * - Lee el texto de las primeras 3 páginas con pdf-parse (lo demás son comprobantes escaneados).
 * - Ubica las secciones por su número (1.1, 1.2.n, 1.3.n, 1.4, 2.) y los campos "Etiqueta: valor".
 * - Devuelve una PROPUESTA con el nivel de confianza de cada dato. Nunca escribe en la BD.
 *
 *   leerPdf(buffer, { archivo })  → Promise<propuesta>
 *   leerTexto(texto, { archivo }) → propuesta   (lo usan leerPdf y las pruebas)
 */
const curpLib = require('../curp');
const fechas = require('./fechas');
const { normalizarTexto } = require('../horario');
const { separarFormatoOpina, limpiar } = require('../nombres');

const PAGINAS = 3;
const ESTATUS = [
  [/titulo en tramite|tramite de titulo/, 'Título en trámite'],
  [/sin concluir|trunc|inconclus/, 'Estudios sin concluir'],
  [/en curso|cursando|actualmente estudi/, 'Estudios en curso'],
  [/pasante/, 'Pasante'],
  [/titulad/, 'Titulado'],
];
const GRADOS = [
  [/doctorado/, 'Doctorado'],
  [/maestria/, 'Maestría'],
  [/especialidad/, 'Especialidad'],
  [/licenciatura|ingenieria/, 'Licenciatura'],
];
const CURP_REGEX = /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d\b/;

/** Etiquetas conocidas: sirven para saber dónde termina un valor. */
const ETIQUETAS = [
  'nombre', 'nombre completo', 'fecha de nacimiento', 'nacionalidad', 'estado civil', 'curp', 'rfc', 'domicilio',
  'telefono', 'celular', 'lugar laboral actual', 'correo personal', 'correo institucional', 'correo electronico',
  'institucion', 'ciudad', 'periodo', 'estatus', 'cedula', 'cedula profesional', 'fecha de expedicion', 'carrera',
  'nombre de la carrera', 'titulo', 'programa', 'idioma', 'grado de dominio', 'nivel', 'horas', 'fecha', 'asignatura',
  'nombre del curso', 'curso',
];

function lineasDe(texto) {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^-- \d+ of \d+ --$/.test(l));
}

/** Si la línea empieza con una etiqueta conocida devuelve { etiqueta, resto }. */
function etiquetaDe(linea) {
  const n = normalizarTexto(linea);
  let mejor = null;
  for (const e of ETIQUETAS) {
    if (n === e || n.startsWith(`${e}:`) || n.startsWith(`${e} :`)) {
      if (!mejor || e.length > mejor.length) mejor = e;
    }
  }
  if (!mejor) return null;
  const idx = linea.indexOf(':');
  return { etiqueta: mejor, resto: idx >= 0 ? linea.slice(idx + 1).trim() : '' };
}

/** Valor de la primera etiqueta (de `aliases`) dentro de lineas[desde, hasta). */
function valor(lineas, aliases, desde = 0, hasta = lineas.length) {
  for (let i = desde; i < hasta; i++) {
    const e = etiquetaDe(lineas[i]);
    if (!e || !aliases.includes(e.etiqueta)) continue;
    if (e.resto) return e.resto;
    const siguiente = lineas[i + 1];
    if (siguiente && i + 1 < hasta && !etiquetaDe(siguiente) && !esEncabezado(siguiente)) return siguiente;
    return null;
  }
  return null;
}

function esEncabezado(linea) {
  return /^\d+(\.\d+)*\.?\s/.test(linea) || /^\d+(\.\d+)+$/.test(linea);
}

/** Índices de inicio de cada sección: { s11, s12[], s13[], s14, s2, fin2 }. */
function secciones(lineas) {
  const r = { s11: -1, s12: [], s13: [], s14: -1, s2: -1, s3: -1 };
  lineas.forEach((l, i) => {
    const n = normalizarTexto(l);
    if (/^1\.1\b(?!\.)/.test(n) && r.s11 < 0) r.s11 = i;
    else if (/^1\.2(\.\d+)?\b/.test(n) || (/\((licenciatura|especialidad|maestria|doctorado)/.test(n) && /formacion/.test(n))) r.s12.push(i);
    else if (/^1\.3(\.\d+)?\b/.test(n)) r.s13.push(i);
    else if (/^1\.4\b/.test(n) && r.s14 < 0) r.s14 = i;
    else if (/^2\.?\s+experiencia/.test(n) && r.s2 < 0) r.s2 = i;
    else if (/^[3-6]\.?\s+[a-z]/.test(n) && r.s2 >= 0 && r.s3 < 0 && i > r.s2) r.s3 = i;
  });
  return r;
}

/** Fin de un bloque: el siguiente inicio conocido después de `i`. */
function finDeBloque(inicios, i, total) {
  const siguientes = inicios.filter((x) => x > i);
  return siguientes.length ? Math.min(...siguientes) : total;
}

function buscar(listaRegex, texto) {
  const n = normalizarTexto(texto);
  return listaRegex.filter(([re]) => re.test(n)).map(([, v]) => v);
}

/** Lee un bloque 1.2.n de formación académica. null si está vacío (plantilla sin llenar). */
function leerTitulo(lineas, desde, hasta) {
  const encabezado = lineas[desde];
  const bloque = lineas.slice(desde, hasta).join('\n');
  const grado = buscar(GRADOS, encabezado)[0] ?? buscar(GRADOS, bloque)[0] ?? null;
  const institucion = valor(lineas, ['institucion'], desde, hasta);
  const periodo = valor(lineas, ['periodo'], desde, hasta);
  const estatusTexto = valor(lineas, ['estatus'], desde, hasta);
  const candidatos = buscar(ESTATUS, estatusTexto ?? lineas.slice(desde + 1, hasta).join(' '));
  if (!grado || (!institucion && !periodo && !estatusTexto)) return null;
  const cedula = valor(lineas, ['cedula', 'cedula profesional'], desde, hasta);
  return {
    grado,
    nombreTitulo: valor(lineas, ['carrera', 'nombre de la carrera', 'titulo', 'programa'], desde, hasta),
    institucion,
    periodoTexto: periodo,
    estatus: candidatos[0] ?? 'Titulado',
    cedula: cedula && /\d/.test(cedula) ? cedula.replace(/[^\dA-Za-z]/g, '') : null,
    confianza: estatusTexto && candidatos.length === 1 ? 'alta' : candidatos.length === 1 ? 'media' : 'baja',
  };
}

function leerTitulos(lineas, s) {
  const inicios = [...s.s12, ...s.s13, s.s14, s.s2, s.s3].filter((x) => x >= 0);
  return s.s12
    .map((i) => leerTitulo(lineas, i, finDeBloque(inicios, i, lineas.length)))
    .filter(Boolean);
}

function leerCursos(lineas, s) {
  const inicios = [...s.s13, s.s14, s.s2, s.s3].filter((x) => x >= 0);
  return s.s13.map((i) => {
    const fin = finDeBloque(inicios, i, lineas.length);
    const nombre = valor(lineas, ['nombre del curso', 'curso', 'nombre'], i, fin);
    if (!nombre) return null;
    const extra = [valor(lineas, ['institucion'], i, fin), valor(lineas, ['fecha'], i, fin), valor(lineas, ['horas'], i, fin)].filter(Boolean);
    return extra.length ? `${nombre} (${extra.join(', ')})` : nombre;
  }).filter(Boolean);
}

function leerIdiomas(lineas, s) {
  if (s.s14 < 0) return [];
  const fin = finDeBloque([s.s2, s.s3].filter((x) => x >= 0), s.s14, lineas.length);
  const idiomas = [];
  for (let i = s.s14; i < fin; i++) {
    const e = etiquetaDe(lineas[i]);
    if (e?.etiqueta !== 'idioma') continue;
    const nombre = e.resto || (lineas[i + 1] && !etiquetaDe(lineas[i + 1]) ? lineas[i + 1] : null);
    if (!nombre) continue;
    const dominio = valor(lineas, ['grado de dominio', 'nivel'], i + 1, Math.min(fin, i + 4));
    idiomas.push(dominio ? `${nombre} (${dominio})` : nombre);
  }
  return idiomas;
}

/** Sugerencia del primer semestre: periodo en Tecmilenio de la experiencia docente. */
function primerSemestreSugerido(lineas, s) {
  if (s.s2 < 0) return null;
  const fin = s.s3 >= 0 ? s.s3 : lineas.length;
  let mejor = null;
  for (let i = s.s2; i < fin; i++) {
    if (!normalizarTexto(lineas[i]).includes('tecmilenio')) continue;
    for (const l of lineas.slice(i, Math.min(i + 3, fin))) {
      const f = fechas.mesAnio(l);
      if (f && (!mejor || f.anio * 12 + f.mes < mejor.anio * 12 + mejor.mes)) mejor = f;
    }
  }
  if (!mejor) return null;
  return `${mejor.mes >= 1 && mejor.mes <= 5 ? 'ENE-MAY' : 'AGO-DIC'} ${mejor.anio}`;
}

function leerCurp(lineas, texto) {
  const etiquetada = (valor(lineas, ['curp']) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const enTexto = String(texto).toUpperCase().match(CURP_REGEX)?.[0] ?? null;
  const candidatos = [etiquetada, enTexto].filter(Boolean).map((c) => curpLib.validar(c));
  const valida = candidatos.find((v) => v.valida);
  if (valida) return { curp: valida.curp, confianza: 'alta' };
  const soloDigito = candidatos.find((v) => v.errores.length === 1 && v.errores[0] === 'DIGITO_VERIFICADOR');
  return soloDigito ? { curp: soloDigito.curp, confianza: 'baja' } : { curp: null, confianza: null };
}

/** Nombre del CV o, si no viene, del nombre del archivo ('Apellidos  Nombres.pdf'). */
function leerNombre(lineas, s, archivo) {
  const hasta = s.s12.length ? s.s12[0] : lineas.length;
  const delCv = valor(lineas, ['nombre', 'nombre completo'], Math.max(s.s11, 0), hasta);
  if (delCv) return { nombre: limpiar(delCv), confianza: 'media' };
  const base = String(archivo ?? '').replace(/\.pdf$/i, '');
  if (!base) return { nombre: null, confianza: null };
  const n = separarFormatoOpina(base);
  return { nombre: limpiar([n.nombres, n.apellidoPaterno, n.apellidoMaterno].filter(Boolean).join(' ')), confianza: 'baja' };
}

/** Interpreta el texto ya extraído del PDF. */
function leerTexto(texto, { archivo = null, hoy = new Date() } = {}) {
  const lineas = lineasDe(texto);
  const s = secciones(lineas);
  const { curp, confianza: confCurp } = leerCurp(lineas, texto);
  const { nombre, confianza: confNombre } = leerNombre(lineas, s, archivo);
  const fechaCvTexto = valor(lineas, ['fecha de nacimiento']);
  const fechaCv = fechas.interpretar(fechaCvTexto, hoy);
  const fechaCurp = curp ? curpLib.fechaNacimiento(curp) : null;
  const lugarLaboral = valor(lineas, ['lugar laboral actual']);
  const externo = lugarLaboral && !normalizarTexto(lugarLaboral).includes('tecmilenio') ? lugarLaboral : null;
  const correo = valor(lineas, ['correo institucional']);
  const titulos = leerTitulos(lineas, s);
  const primerSemestre = primerSemestreSugerido(lineas, s);

  const conflictos = [];
  if (fechaCv && fechaCurp && fechaCv !== fechaCurp) conflictos.push({ campo: 'fechaNacimiento', cv: fechaCv, curp: fechaCurp });
  return {
    archivo,
    nombre,
    curp,
    fechaNacimiento: fechaCurp ?? fechaCv,
    fechaNacimientoCv: fechaCv,
    genero: curp ? curpLib.genero(curp) : null,
    lugarLaboral,
    trabajoExterno: externo,
    correoInstitucional: correo && /@/.test(correo) ? correo.replace(/\s/g, '') : null,
    titulos: titulos.map(({ confianza, ...t }) => t),
    cursos: leerCursos(lineas, s),
    idiomas: leerIdiomas(lineas, s),
    primerSemestre,
    confianza: {
      nombre: confNombre,
      curp: confCurp,
      fechaNacimiento: fechaCurp ? 'alta' : fechaCv ? 'media' : null,
      titulos: titulos.length ? titulos.map((t) => t.confianza) : null,
      trabajoExterno: externo ? 'media' : null,
      primerSemestre: primerSemestre ? 'baja' : null,
    },
    conflictos,
    seccionesEncontradas: Boolean(s.s11 >= 0 || s.s12.length),
  };
}

/** Error de CV no legible → la vista previa lo lista en noLeidos. */
class CvNoLegible extends Error {
  constructor(motivo) {
    super(motivo);
    this.name = 'CvNoLegible';
  }
}

/** Extrae el texto de las primeras 3 páginas y lo interpreta. */
async function leerPdf(buffer, opciones = {}) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let resultado;
  try {
    resultado = await parser.getText({ first: PAGINAS });
  } catch (err) {
    throw new CvNoLegible(`No se pudo leer el PDF (${err.message}).`);
  } finally {
    await parser.destroy().catch(() => {});
  }
  const texto = (resultado.pages ?? []).map((p) => p.text).join('\n') || resultado.text || '';
  if (texto.replace(/\s/g, '').length < 40) throw new CvNoLegible('El PDF no tiene texto seleccionable (¿es un escaneo?).');
  const propuesta = leerTexto(texto, opciones);
  if (!propuesta.seccionesEncontradas && !propuesta.curp) {
    throw new CvNoLegible('No parece el formato "A1 CURRICULUM VITAE DOCENTES".');
  }
  return { ...propuesta, paginas: resultado.total ?? null };
}

module.exports = { leerPdf, leerTexto, CvNoLegible, lineasDe, secciones };
