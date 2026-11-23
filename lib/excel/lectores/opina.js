/**
 * Lector de OPINA (07 §5). Una fila = la evaluación de un alumno a un grupo (CRN).
 *
 * - Acepta .xlsx y .xlsb (SheetJS lee ambos).
 * - Detecta la versión: v1 (2024–2025) o v2 (2026, con 5 reactivos).
 * - Mapea columnas por alias (los nombres cambian entre versiones).
 * - Filtro confirmado (07 §8 #12): solo grupos PRESENCIALES del campus Veracruz.
 *
 * No toca la BD: devuelve las respuestas limpias y conteos para la vista previa.
 */
const nomina = require('../../nomina');
const periodos = require('../../periodos');
const { normalizarTexto } = require('../../horario');
const { separarFormatoOpina } = require('../../nombres');
const {
  ArchivoNoReconocido, abrirLibro, filasDeHoja, mapearColumnas, texto, textoCrudo, crn,
} = require('./comun');

const COLUMNAS = {
  periodo: ['DWH_Periodo', 'Periodo'],
  plan: ['Plan'],
  crn: ['CRN'],
  claveGrupo: ['Clave de grupo'],
  claveMateria: ['Clave de Materia'],
  materia: ['Nombre de la materia', 'Materia'],
  profesor: ['Profesor'],
  nomina: ['Nómina', 'Nomina'],
  campusGrupo: ['Campus Grupo'],
  formato: ['Formato'],
  recomienda: [/^recomendarias a un companero/],
  porQueSi: ['Por qué sí', 'Por que si'],
  porQueNo: ['Por qué no', 'Por que no'],
  comentario: [/comentario adicional/, 'Comentario'],
  responseId: ['ResponseId', 'Response Id'],
};

/** Reactivos de la v2 (07 §5.1). Se ubican por palabra clave del encabezado. */
const REACTIVOS = {
  conocimiento: [/conocimiento|domina/],
  retos: [/\breto/],
  colaboracion: [/colabora/],
  confianza: [/confianza/],
  inspiracion: [/inspira/],
};

const OBLIGATORIAS = ['periodo', 'crn', 'nomina', 'profesor', 'recomienda'];
const FORMATO_NO_PRESENCIAL = /linea|online|virtual|remot|distancia/;

/** Busca la hoja que tiene los encabezados de OPINA (normalmente la primera). */
function ubicarTabla(libro) {
  for (const nombre of libro.SheetNames) {
    const filas = filasDeHoja(libro.Sheets[nombre]);
    // Algunos archivos traen títulos arriba: se buscan los encabezados en las primeras 10 filas.
    for (let i = 0; i < Math.min(filas.length, 10); i++) {
      const idx = mapearColumnas(filas[i] ?? [], COLUMNAS);
      if (OBLIGATORIAS.every((c) => idx[c] !== undefined)) {
        return { encabezados: filas[i], datos: filas.slice(i + 1), filaEncabezado: i + 1, idx };
      }
    }
  }
  return null;
}

/** 'Sí'/'Si' → 1, 'No' → 0, otro → null. */
function siNo(valor) {
  const t = normalizarTexto(valor);
  if (t === 'si') return 1;
  if (t === 'no') return 0;
  return null;
}

/** Normaliza la respuesta de un reactivo: 'Sí' | 'No' | 'No estoy seguro' | null. */
function respuestaReactivo(valor) {
  const t = normalizarTexto(valor);
  if (!t) return null;
  if (t === 'si') return 'Sí';
  if (t === 'no') return 'No';
  if (t.startsWith('no estoy seguro')) return 'No estoy seguro';
  return texto(valor);
}

/** 'Veracruz_BSCN1006_611' → 'BSCN1006' */
function claveMateriaDeGrupo(claveGrupo) {
  const partes = String(claveGrupo ?? '').split('_');
  return partes.length >= 3 ? partes[1].toUpperCase() : null;
}

function esDelCampus(campusGrupo, campus) {
  const c = normalizarTexto(campusGrupo);
  return c.includes(normalizarTexto(campus)) && !c.includes('online');
}

/** Convierte una fila en respuesta o devuelve el motivo de descarte. */
function leerFila(valores, idx, reactivos, opciones) {
  const get = (campo) => (idx[campo] === undefined ? null : valores[idx[campo]]);
  if (opciones.campus && idx.campusGrupo !== undefined && !esDelCampus(get('campusGrupo'), opciones.campus)) {
    return { descarte: 'campus' };
  }
  const formato = texto(get('formato'));
  if (opciones.soloPresencial && formato && FORMATO_NO_PRESENCIAL.test(normalizarTexto(formato))) {
    return { descarte: 'modalidad', formato };
  }
  const crnFila = crn(get('crn'));
  const nominaFila = nomina.normalizar(get('nomina'));
  const recomienda = siNo(get('recomienda'));
  if (!crnFila || !nominaFila) return { descarte: 'sinDatos' };
  if (recomienda === null) return { descarte: 'sinRespuesta' };

  const items = {};
  for (const [clave, i] of Object.entries(reactivos)) items[clave] = respuestaReactivo(valores[i]);
  const claveGrupo = texto(get('claveGrupo'));
  return {
    respuesta: {
      periodo: texto(get('periodo')),
      crn: crnFila,
      nomina: nominaFila,
      profesor: textoCrudo(get('profesor')),
      plan: texto(get('plan')),
      claveGrupo,
      claveMateria: texto(get('claveMateria'))?.toUpperCase() ?? claveMateriaDeGrupo(claveGrupo),
      materia: texto(get('materia')),
      campusGrupo: texto(get('campusGrupo')),
      formato,
      recomienda,
      porQueSi: texto(get('porQueSi')),
      porQueNo: texto(get('porQueNo')),
      items: Object.keys(items).length ? items : null,
      comentario: texto(get('comentario')),
      responseId: texto(get('responseId')),
    },
  };
}

/** Resumen por profesor: respuestas, positivas y % global (Σ Sí ÷ Σ respuestas). */
function resumirProfesores(respuestas) {
  const mapa = new Map();
  for (const r of respuestas) {
    let p = mapa.get(r.nomina);
    if (!p) {
      const nombre = separarFormatoOpina(r.profesor);
      p = {
        nomina: r.nomina,
        nombres: nombre.nombres,
        apellidoPaterno: nombre.apellidoPaterno,
        apellidoMaterno: nombre.apellidoMaterno,
        nombreOriginal: r.profesor,
        respuestas: 0,
        positivas: 0,
        crns: new Set(),
      };
      mapa.set(r.nomina, p);
    }
    p.respuestas += 1;
    p.positivas += r.recomienda;
    p.crns.add(r.crn);
  }
  return [...mapa.values()].map(({ crns, ...p }) => ({
    ...p,
    grupos: crns.size,
    porcentaje: Math.round((1000 * p.positivas) / p.respuestas) / 10,
  }));
}

/**
 * Lee el archivo.
 * @param {Buffer} buffer
 * @param {{ campus?: string, soloPresencial?: boolean }} opciones  (por defecto Veracruz y solo presencial)
 */
function leer(buffer, opciones = {}) {
  const opts = { campus: 'Veracruz', soloPresencial: true, ...opciones };
  const libro = abrirLibro(buffer);
  const tabla = ubicarTabla(libro);
  if (!tabla) {
    throw new ArchivoNoReconocido(
      `No es un archivo OPINA: no se encontraron las columnas ${OBLIGATORIAS.join(', ')}.`,
    );
  }
  const reactivos = mapearColumnas(tabla.encabezados, REACTIVOS);
  const version = Object.keys(reactivos).length > 0 || idxTieneComentarioV2(tabla) ? 'v2' : 'v1';

  const respuestas = [];
  const descartadas = { campus: 0, modalidad: 0, sinDatos: 0, sinRespuesta: 0 };
  const formatos = {};
  const avisos = [];
  if (tabla.idx.campusGrupo === undefined) avisos.push({ tipo: 'SIN_COLUMNA_CAMPUS', detalle: 'No se pudo filtrar por campus.' });
  if (tabla.idx.formato === undefined) avisos.push({ tipo: 'SIN_COLUMNA_FORMATO', detalle: 'No se pudo filtrar por modalidad presencial.' });

  for (const valores of tabla.datos) {
    const fmt = texto(tabla.idx.formato === undefined ? null : valores[tabla.idx.formato]) ?? '(vacío)';
    formatos[fmt] = (formatos[fmt] ?? 0) + 1;
    const r = leerFila(valores, tabla.idx, version === 'v2' ? reactivos : {}, opts);
    if (r.descarte) descartadas[r.descarte] += 1;
    else respuestas.push(r.respuesta);
  }

  const etiquetas = [...new Set(respuestas.map((r) => r.periodo).filter(Boolean))];
  if (etiquetas.length > 1) avisos.push({ tipo: 'VARIOS_PERIODOS', detalle: etiquetas.join(', ') });
  const periodo = periodos.interpretar(etiquetas[0]);
  if (!periodo) throw new ArchivoNoReconocido('No se pudo detectar el periodo (columna "DWH_Periodo" o "Periodo").');

  return {
    version,
    periodo,
    filas: tabla.datos.length,
    filasFiltradas: respuestas.length,
    descartadas,
    formatos,
    respuestas,
    profesores: resumirProfesores(respuestas),
    grupos: new Set(respuestas.map((r) => r.crn)).size,
    avisos,
  };
}

function idxTieneComentarioV2(tabla) {
  const i = tabla.idx.comentario;
  return i !== undefined && /comentario adicional/.test(normalizarTexto(tabla.encabezados[i]));
}

module.exports = { leer, COLUMNAS, REACTIVOS, claveMateriaDeGrupo };
