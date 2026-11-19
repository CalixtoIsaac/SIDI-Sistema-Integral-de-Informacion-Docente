/**
 * Lector de CV en PDF, formato institucional "A1 CURRICULUM VITAE DOCENTES" (07 §7.1).
 *
 * - Lee con pdf-parse las páginas con texto hasta la primera sin texto (lo demás son comprobantes escaneados).
 * - Ubica las secciones por su número (1.1, 1.2.n, 1.3.n, 1.4, 2.) y los campos "Etiqueta: valor".
 *   Las etiquetas del PDF real pueden venir partidas en varios renglones o sin dos puntos (etiquetaEn).
 * - Devuelve una PROPUESTA con el nivel de confianza de cada dato. Nunca escribe en la BD.
 *
 *   leerPdf(buffer, { archivo })  → Promise<propuesta>
 *   leerTexto(texto, { archivo }) → propuesta   (lo usan leerPdf y las pruebas)
 */
const curpLib = require('../curp');
const fechas = require('./fechas');
const { normalizarTexto } = require('../horario');
const { separarFormatoOpina, limpiar } = require('../nombres');

/** Máximo de páginas con texto que se leen; se corta en la primera página sin texto (comprobantes escaneados). */
const PAGINAS = 12;
const ESTATUS = [
  [/titulo en tramite|tramite de titulo/, 'Título en trámite'],
  [/sin concluir|trunc|inconclus/, 'Estudios sin concluir'],
  [/en curso|cursando|actualmente estudi/, 'Estudios en curso'],
  [/pasante/, 'Pasante'],
  [/titulad|^titulo$|^titulo obtenido|^con titulo/, 'Titulado'],
];
const GRADOS = [
  [/doctorado/, 'Doctorado'],
  [/maestria/, 'Maestría'],
  [/especialidad/, 'Especialidad'],
  [/licenciatura|ingenieria/, 'Licenciatura'],
];
const CURP_REGEX = /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d\b/;
const VIGENTE = /a la fecha|actualmente|actual\b|presente|vigente|hoy\b/;

/**
 * Etiquetas del formato. En el PDF real muchas vienen partidas en 2–3 renglones
 * ("Periodo de inicio y" / "término:"; "Titulado, pasante," / "estudios sin concluir o" / "título en trámite:")
 * y algunas sin dos puntos ("Nombre del Curso Design Thinking", "Institución Skilling Center").
 * Clave = campo; valor = variantes (sin acentos, en minúsculas). Gana la variante más larga.
 */
const ETIQUETAS = {
  nombre: ['nombre completo', 'nombre'],
  fechaNacimiento: ['fecha de nacimiento'],
  nacionalidad: ['nacionalidad'],
  estadoCivil: ['estado civil'],
  curp: ['curp'],
  rfc: ['rfc'],
  domicilio: ['domicilio particular', 'domicilio'],
  telefono: ['telefono particular', 'telefono de oficina', 'telefono', 'celular'],
  lugarLaboral: ['lugar laboral actual'],
  correoPersonal: ['correo electronico personal', 'correo personal'],
  correoInstitucional: ['correo electronico institucional', 'correo institucional'],
  correo: ['correo electronico'],
  institucion: ['nombre de la institucion educativa', 'nombre de la institucion', 'institucion educativa', 'institucion que lo impartio', 'institucion organizadora', 'institucion'],
  ciudad: ['ciudad y pais', 'ciudad'],
  periodo: ['periodo de inicio y termino', 'periodo'],
  estatus: ['titulado pasante estudios sin concluir o titulo en tramite', 'estatus'],
  cedula: ['numero de cedula', 'cedula profesional', 'cedula'],
  expedicion: ['fecha de expedicion'],
  carrera: ['nombre de la carrera', 'carrera', 'programa'],
  curso: ['nombre del curso', 'curso'],
  lugar: ['lugar'],
  fecha: ['fecha'],
  horas: ['numero de horas academicas', 'horas'],
  creditos: ['numero de creditos'],
  idioma: ['idioma'],
  dominio: ['grado de dominio', 'nivel'],
  cargo: ['nombramiento o cargo desempenado', 'cargo'],
  asignatura: ['nombre de la asignatura impartida', 'asignatura'],
  evento: ['nombre del evento'],
  tema: ['tema impartido'],
};
/** Etiquetas de una palabra que pueden venir sin dos puntos. */
const SIN_DOS_PUNTOS = new Set(['institucion']);
const VARIANTES = Object.entries(ETIQUETAS)
  .flatMap(([campo, vs]) => vs.map((v) => ({ campo, palabras: v.split(' ') })))
  .sort((a, b) => b.palabras.length - a.palabras.length);

const palabrasDe = (t) => normalizarTexto(t).match(/[a-z0-9ñ]+/g) ?? [];

function lineasDe(texto) {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^-- \d+ of \d+ --$/.test(l));
}

/** Texto de la línea después de sus primeras `n` palabras (sin ':' ni puntos al inicio). */
function despuesDePalabras(linea, n) {
  if (n <= 0) return linea.replace(/^[\s.:;,\-–]+/, '').trim();
  const re = /[\p{L}\p{N}]+/gu;
  let m;
  let fin = 0;
  for (let i = 0; i < n && (m = re.exec(linea)); i++) fin = m.index + m[0].length;
  return linea.slice(fin).replace(/^[\s.:;,\-–]+/, '').trim();
}

/** ¿La palabra 1 de la línea va seguida de ':' (permite 'Nombre :' y 'Nacionalidad.:')? */
const conDosPuntos = (linea) => /^\s*[\p{L}\p{N}]+\s*\.?\s*:/u.test(linea);

function esEncabezado(linea) {
  return /^\d+(\.\d+)*\.?\s+[A-ZÁÉÍÓÚÑ]/.test(linea) || /^\d(\.\d){1,2}\.?$/.test(linea);
}

/**
 * Si en lineas[i] empieza una etiqueta (aunque siga en los 2 renglones siguientes) devuelve
 * { etiqueta, campo, fin, resto }: `fin` = último renglón de la etiqueta, `resto` = lo que sigue en ese renglón.
 */
function etiquetaEn(lineas, i) {
  const linea = lineas[i];
  if (!linea || esEncabezado(linea)) return null;
  const porLinea = [];
  for (let k = 0; k < 3 && i + k < lineas.length; k++) {
    if (k > 0 && esEncabezado(lineas[i + k])) break;
    porLinea.push(palabrasDe(lineas[i + k]));
  }
  const todas = porLinea.flat();
  for (const v of VARIANTES) {
    if (v.palabras.length > todas.length || !v.palabras.every((p, j) => todas[j] === p)) continue;
    if (v.palabras.length === 1 && !conDosPuntos(linea) && !SIN_DOS_PUNTOS.has(v.palabras[0])) continue;
    // Renglón donde termina la etiqueta y cuántas palabras de ese renglón consume
    let restantes = v.palabras.length;
    let k = 0;
    while (restantes > porLinea[k].length) { restantes -= porLinea[k].length; k++; }
    return { etiqueta: v.palabras.join(' '), campo: v.campo, fin: i + k, resto: despuesDePalabras(lineas[i + k], restantes) };
  }
  return null;
}

/** Compatibilidad: etiqueta de una sola línea. */
function etiquetaDe(linea) {
  const e = etiquetaEn([linea], 0);
  return e ? { etiqueta: e.etiqueta, resto: e.resto } : null;
}

/** Valor de una etiqueta encontrada: lo que sigue en su renglón o, si está vacío, el renglón siguiente. */
function valorDe(lineas, e, hasta = lineas.length) {
  if (e.resto) return e.resto;
  const j = e.fin + 1;
  if (j < hasta && lineas[j] && !esEncabezado(lineas[j]) && !etiquetaEn(lineas, j)) return lineas[j];
  return null;
}

/** Recorre las etiquetas de lineas[desde, hasta): [{ campo, valor, i, fin }]. */
function campos(lineas, desde = 0, hasta = lineas.length) {
  const r = [];
  for (let i = desde; i < hasta; i++) {
    const e = etiquetaEn(lineas, i);
    if (!e || e.fin >= hasta) continue;
    const v = valorDe(lineas, e, hasta);
    // Renglones sin etiqueta que siguen al valor (nombre de curso largo, varias asignaturas…)
    const extra = [];
    let j = e.resto || !v ? e.fin + 1 : e.fin + 2;
    while (j < hasta && !esEncabezado(lineas[j]) && !etiquetaEn(lineas, j)) extra.push(lineas[j++]);
    r.push({ campo: e.campo, valor: v, extra, i, fin: e.fin });
    i = e.fin;
  }
  return r;
}

/** Valor del primer campo de `nombres` dentro de lineas[desde, hasta). */
function valor(lineas, nombres, desde = 0, hasta = lineas.length) {
  const lista = Array.isArray(nombres) ? nombres : [nombres];
  return campos(lineas, desde, hasta).find((c) => lista.includes(c.campo) && c.valor)?.valor ?? null;
}

/** Índices de inicio de cada sección: { s11, s12[], s13[], s14, s2, s3 }. */
function secciones(lineas) {
  const r = { s11: -1, s12: [], s13: [], s14: -1, s2: -1, s3: -1 };
  lineas.forEach((l, i) => {
    const n = normalizarTexto(l);
    if (/^1\.1\b(?!\.)/.test(n) && r.s11 < 0) r.s11 = i;
    else if (/^1\.2(\.\d+)?\b/.test(n) || (/\((licenciatura|especialidad|maestria|doctorado)/.test(n) && /formacion/.test(n))) r.s12.push(i);
    else if (/^1\.3(\.\d+)?\b/.test(n)) r.s13.push(i);
    else if (/^1\.4\b/.test(n) && r.s14 < 0) r.s14 = i;
    else if (/^2(\.\d+)?\.?\s+experiencia/.test(n) && r.s2 < 0) r.s2 = i;
    else if (/^[3-6](\.\d+)?\.?\s+[a-z]/.test(n) && r.s2 >= 0 && r.s3 < 0 && i > r.s2) r.s3 = i;
  });
  return r;
}

/** Fin de un bloque: el siguiente inicio conocido después de `i`. */
function finDeBloque(inicios, i, total) {
  const siguientes = inicios.filter((x) => x > i);
  return siguientes.length ? Math.min(...siguientes) : total;
}

function buscar(listaRegex, texto) {
  const n = normalizarTexto(texto).replace(/[.,;:]+$/g, '').trim();
  return listaRegex.filter(([re]) => re.test(n)).map(([, v]) => v);
}

const esTecmilenio = (texto) => normalizarTexto(texto).replace(/[\s-]/g, '').includes('tecmilenio');
const limpiarNumero = (t) => (t ? String(t).replace(/^(\d+)\.0+\b/, '$1') : t);

/** Lee un bloque 1.2.n de formación académica. null si está vacío (plantilla sin llenar). */
function leerTitulo(lineas, desde, hasta) {
  const encabezado = lineas[desde];
  const cs = campos(lineas, desde + 1, hasta);
  const de = (campo) => cs.find((c) => c.campo === campo && c.valor)?.valor ?? null;
  const grado = buscar(GRADOS, encabezado)[0] ?? buscar(GRADOS, lineas.slice(desde, hasta).join('\n'))[0] ?? null;
  const institucion = de('institucion');
  const periodo = de('periodo');
  const estatusTexto = de('estatus');
  const candidatos = estatusTexto ? buscar(ESTATUS, estatusTexto) : [];
  if (!grado || (!institucion && !periodo && !estatusTexto)) return null;
  const cedula = de('cedula');
  return {
    grado,
    nombreTitulo: de('carrera'),
    institucion,
    periodoTexto: periodo,
    estatus: candidatos[0] ?? (periodo && VIGENTE.test(normalizarTexto(periodo)) ? 'Estudios en curso' : 'Titulado'),
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

/** Región completa de cursos: del primer 1.3.n al siguiente apartado (1.4, 2., …). */
function regionCursos(lineas, s) {
  if (!s.s13.length) return null;
  const desde = s.s13[0];
  const hasta = finDeBloque([s.s14, s.s2, s.s3].filter((x) => x >= 0), desde, lineas.length);
  return { desde, hasta };
}

/**
 * Cursos: cada "Nombre del Curso …" abre uno (el nombre puede seguir en el renglón siguiente). En el PDF
 * real a veces el nombre sale sin etiqueta, justo antes de "Institución que lo impartió"; también se toma.
 */
function leerCursos(lineas, s) {
  const reg = regionCursos(lineas, s);
  if (!reg) return [];
  const cursos = [];
  let actual = null;
  const cerrar = () => { if (actual?.nombre) cursos.push(actual); actual = null; };
  for (let i = reg.desde; i < reg.hasta; i++) {
    const linea = lineas[i];
    if (esEncabezado(linea)) continue;
    const e = etiquetaEn(lineas, i);
    if (!e) {
      // Renglón sin etiqueta: continúa el nombre del curso o es un nombre sin etiqueta
      const sig = etiquetaEn(lineas, i + 1);
      if (actual && actual.abierto) actual.nombre = `${actual.nombre} ${linea}`.trim();
      else if (sig?.campo === 'institucion' && (!actual || actual.institucion)) { cerrar(); actual = { nombre: linea, abierto: false }; }
      continue;
    }
    const v = valorDe(lineas, e, reg.hasta);
    if (e.campo === 'curso') {
      cerrar();
      actual = { nombre: v ?? '', abierto: true };
      i = e.resto ? e.fin : e.fin + (v ? 1 : 0);
      continue;
    }
    if (actual) {
      actual.abierto = false;
      if (['institucion', 'fecha', 'horas'].includes(e.campo) && v && !actual[e.campo]) actual[e.campo] = v;
    }
    i = e.resto || !v ? e.fin : e.fin + 1;
  }
  cerrar();
  const vistos = new Set();
  return cursos.map((c) => {
    const nombre = c.nombre.replace(/^curso\s*:\s*/i, '').trim();
    const extra = [c.institucion, c.fecha, limpiarNumero(c.horas)].filter(Boolean);
    return extra.length ? `${nombre} (${extra.join(', ')})` : nombre;
  }).filter((c) => c && !vistos.has(c) && vistos.add(c));
}

function leerIdiomas(lineas, s) {
  if (s.s14 < 0) return [];
  const fin = finDeBloque([s.s2, s.s3].filter((x) => x >= 0), s.s14, lineas.length);
  const cs = campos(lineas, s.s14 + 1, fin);
  const idiomas = [];
  cs.forEach((c, k) => {
    if (c.campo !== 'idioma' || !c.valor) return;
    const sig = cs.slice(k + 1).find((x) => x.campo === 'idioma' || x.campo === 'dominio');
    const dominio = sig?.campo === 'dominio' ? sig.valor : null;
    idiomas.push(dominio ? `${c.valor} (${dominio})` : c.valor);
  });
  return idiomas;
}

/**
 * Experiencia (apartado 2): cada "Institución" abre una entrada; el cargo, las asignaturas y el periodo
 * se le agregan. `vigente` = el periodo dice "a la fecha" / "actual" (sigue trabajando ahí).
 */
function leerExperiencia(lineas, s) {
  const entradas = [];
  for (const { desde, hasta } of regionesExperiencia(lineas, s)) {
    let actual = null;
    let cargoPendiente = null;
    for (const c of campos(lineas, desde + 1, hasta)) {
      if (c.campo === 'institucion') {
        actual = { institucion: c.valor, cargo: cargoPendiente, asignaturas: [], periodo: null };
        cargoPendiente = null;
        entradas.push(actual);
      } else if (c.campo === 'cargo') {
        if (actual && !actual.cargo && !actual.asignaturas.length && !actual.periodo) actual.cargo = c.valor;
        else cargoPendiente = c.valor;
      } else if (c.campo === 'asignatura' && actual && c.valor) {
        // Un renglón que sigue a una coma o empieza en minúscula continúa la asignatura anterior
        for (const a of [c.valor, ...c.extra]) {
          const prev = actual.asignaturas.length ? actual.asignaturas[actual.asignaturas.length - 1] : null;
          if (prev && (/,$/.test(prev) || /^[a-záéíóúñ]/.test(a))) actual.asignaturas[actual.asignaturas.length - 1] = `${prev} ${a}`;
          else actual.asignaturas.push(a);
        }
      } else if (c.campo === 'periodo' && c.valor) {
        if (!actual || actual.periodo || cargoPendiente) {
          actual = { institucion: null, cargo: cargoPendiente, asignaturas: [], periodo: null };
          cargoPendiente = null;
          entradas.push(actual);
        }
        actual.periodo = c.valor;
      }
    }
  }
  return entradas
    .filter((e) => e.institucion || e.cargo || e.periodo)
    .map((e) => ({ ...e, vigente: Boolean(e.periodo && VIGENTE.test(normalizarTexto(e.periodo))) }));
}

/**
 * Apartados de experiencia (docente, profesional…): su número cambia de un CV a otro ("2. Experiencia
 * profesional" o "3. Experiencia profesional"), así que se buscan por el título. Cada uno termina en el
 * siguiente encabezado numerado.
 */
function regionesExperiencia(lineas, s) {
  if (s.s2 < 0) return [];
  const encabezados = [];
  lineas.forEach((l, i) => { if (i >= s.s2 && /^\d+(\.\d+)?\.?\s+[a-z]/.test(normalizarTexto(l))) encabezados.push(i); });
  return encabezados
    .filter((i) => /experiencia/.test(normalizarTexto(lineas[i])))
    .map((i) => ({ desde: i, hasta: finDeBloque(encabezados, i, lineas.length) }));
}

/** Sugerencia del primer semestre: periodo en Tecmilenio de la experiencia docente. */
function primerSemestreSugerido(lineas, s) {
  if (s.s2 < 0) return null;
  const fin = s.s3 >= 0 ? s.s3 : lineas.length;
  let mejor = null;
  for (let i = s.s2; i < fin; i++) {
    if (!esTecmilenio(lineas[i])) continue;
    for (const l of lineas.slice(i, Math.min(i + 3, fin))) {
      const f = fechas.mesAnio(l);
      if (f && (!mejor || f.anio * 12 + f.mes < mejor.anio * 12 + mejor.mes)) mejor = f;
    }
  }
  if (!mejor) return null;
  return `${mejor.mes >= 1 && mejor.mes <= 5 ? 'ENE-MAY' : 'AGO-DIC'} ${mejor.anio}`;
}

function leerCurp(lineas, texto) {
  const etiquetada = (valor(lineas, 'curp') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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
  const delCv = valor(lineas, 'nombre', Math.max(s.s11, 0), hasta);
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
  const hastaPersonales = s.s12.length ? s.s12[0] : (s.s13[0] ?? lineas.length);
  const { curp, confianza: confCurp } = leerCurp(lineas, texto);
  const { nombre, confianza: confNombre } = leerNombre(lineas, s, archivo);
  const fechaCvTexto = valor(lineas, 'fechaNacimiento', 0, hastaPersonales);
  const fechaCv = fechas.interpretar(fechaCvTexto, hoy);
  const fechaCurp = curp ? curpLib.fechaNacimiento(curp) : null;
  const lugarLaboral = valor(lineas, 'lugarLaboral', 0, hastaPersonales);
  const externo = lugarLaboral && !esTecmilenio(lugarLaboral) ? lugarLaboral : null;
  const correo = valor(lineas, 'correoInstitucional', 0, hastaPersonales);
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
    experiencia: leerExperiencia(lineas, s),
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

/**
 * Extrae el texto del CV y lo interpreta. Los CV largos pasan de 3 páginas (idiomas y experiencia quedan en
 * la 4–5), así que se leen las páginas seguidas que tienen texto, hasta la primera sin texto (los anexos
 * son escaneos) o hasta PAGINAS.
 */
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
  const paginas = resultado.pages ?? [];
  const conTexto = [];
  for (const p of paginas) {
    if (String(p.text ?? '').replace(/\s/g, '').length < 20) { if (conTexto.length) break; continue; }
    conTexto.push(p.text);
  }
  const texto = conTexto.join('\n') || resultado.text || '';
  if (texto.replace(/\s/g, '').length < 40) throw new CvNoLegible('El PDF no tiene texto seleccionable (¿es un escaneo?).');
  const propuesta = leerTexto(texto, opciones);
  if (!propuesta.seccionesEncontradas && !propuesta.curp) {
    throw new CvNoLegible('No parece el formato "A1 CURRICULUM VITAE DOCENTES".');
  }
  return { ...propuesta, paginas: resultado.total ?? null, paginasLeidas: conTexto.length };
}

module.exports = { leerPdf, leerTexto, CvNoLegible, lineasDe, secciones, etiquetaDe, etiquetaEn };
