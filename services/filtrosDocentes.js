/**
 * Búsqueda, filtros y orden de la tabla de docentes (06: GET /docentes).
 * Se aplican sobre las filas ya calculadas por docentesService (≈50 docentes: en memoria es inmediato).
 *
 *   search          nombre (sin acentos, cualquier orden de palabras), CURP, nómina con o sin L0, CRN   (HU-07)
 *   activo, recontratable                                                                              (HU-05, HU-21)
 *   semestreActual, genero, nivelEstudios, campo, estudiando, antiguedadMin/Max (semestres),
 *   gruposMin/Max, nivelImparte; ordenar = nombre|edad|antiguedad|grupos|nivelEstudios|opina,
 *   orden = asc|desc                                                                                   (HU-06)
 * Los filtros de lista aceptan varios valores separados por coma (chips): genero=M,F.
 * 'ninguno' en nivelEstudios / campo filtra a quien no tiene el dato.
 */
const nominaLib = require('../lib/nomina');
const { normalizarTexto } = require('../lib/horario');
const { filtrarBasico, booleano, COMPARAR_NOMBRE } = require('./docentesService');
const { HttpError } = require('../lib/errores');

const ORDENES = ['nombre', 'edad', 'antiguedad', 'grupos', 'nivelEstudios', 'opina'];
const NIVELES = ['Licenciatura', 'Especialidad', 'Maestría', 'Doctorado'];

/** true si la fila coincide con el texto buscado. */
function coincide(fila, busqueda) {
  const q = normalizarTexto(busqueda);
  if (!q) return true;
  const palabras = q.split(' ');
  const nombre = normalizarTexto(fila.nombre);
  if (palabras.every((p) => nombre.includes(p))) return true;
  const compacto = q.replace(/\s/g, '').toUpperCase();
  if (fila.curp && fila.curp.includes(compacto)) return true;
  if (/^L?\d+$/.test(compacto)) {
    const digitos = compacto.replace(/^L/, '');
    if (fila.nomina.slice(1).replace(/^0+/, '').startsWith(digitos.replace(/^0+/, '')) && digitos.replace(/^0+/, '')) return true;
    if (nominaLib.normalizar(compacto) === fila.nomina) return true;
    if (fila.grupos.some((g) => g.crn && g.crn.startsWith(digitos))) return true;
  }
  return false;
}

/** 'M,F' → ['M','F']; vacío → null (sin filtro). */
function lista(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const l = (Array.isArray(valor) ? valor : String(valor).split(',')).map((x) => String(x).trim()).filter(Boolean);
  return l.length ? l : null;
}

function numero(query, campo, details) {
  const v = query[campo];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    details.push({ campo, problema: 'VALOR_INVALIDO' });
    return null;
  }
  return n;
}

/** Valida la query y arma la lista de condiciones. */
function condiciones(query) {
  const details = [];
  const c = [];
  if (booleano(query.semestreActual) === true) c.push((f) => f.numGrupos > 0);
  const generos = lista(query.genero);
  if (generos) {
    if (generos.some((g) => !['M', 'F', 'ninguno'].includes(g))) details.push({ campo: 'genero', problema: 'VALOR_INVALIDO' });
    c.push((f) => generos.includes(f.genero ?? 'ninguno'));
  }
  const niveles = lista(query.nivelEstudios);
  if (niveles) c.push((f) => niveles.includes(f.nivelEstudios ?? 'ninguno'));
  const campos = lista(query.campo);
  if (campos) c.push((f) => campos.includes(f.campoFormacion ?? 'ninguno'));
  const imparte = lista(query.nivelImparte);
  if (imparte) c.push((f) => imparte.includes(f.nivelImparte ?? 'ninguno'));
  const estudiando = booleano(query.estudiando);
  if (estudiando !== undefined) c.push((f) => f.estudiando.si === estudiando);
  const rangos = [['antiguedadMin', 'antiguedadMax', (f) => f.antiguedad?.semestres], ['gruposMin', 'gruposMax', (f) => f.numGrupos]];
  for (const [min, max, valor] of rangos) {
    const a = numero(query, min, details);
    const b = numero(query, max, details);
    if (a !== null) c.push((f) => valor(f) !== undefined && valor(f) !== null && valor(f) >= a);
    if (b !== null) c.push((f) => valor(f) !== undefined && valor(f) !== null && valor(f) <= b);
  }
  if (query.ordenar && !ORDENES.includes(query.ordenar)) details.push({ campo: 'ordenar', problema: 'VALOR_INVALIDO' });
  if (query.orden && !['asc', 'desc'].includes(query.orden)) details.push({ campo: 'orden', problema: 'VALOR_INVALIDO' });
  if (details.length) throw new HttpError(400, 'Hay filtros con valores inválidos.', 'FILTRO_INVALIDO', details);
  return c;
}

/** Filtro completo para docentesService.listar. */
function filtrar(filas, query = {}) {
  const conds = condiciones(query);
  const busqueda = String(query.search ?? '').trim();
  return filtrarBasico(filas, query).filter((f) => (!busqueda || coincide(f, busqueda)) && conds.every((cond) => cond(f)));
}

const VALOR_ORDEN = {
  edad: (f) => f.edad,
  antiguedad: (f) => f.antiguedad?.semestres ?? null,
  grupos: (f) => f.numGrupos,
  nivelEstudios: (f) => (f.nivelEstudios ? NIVELES.indexOf(f.nivelEstudios) + 1 || null : null),
  opina: (f) => f.opina?.porcentaje ?? null,
};

/** Comparador para listar: los vacíos van al final en cualquier dirección; empate → alfabético. */
function comparador(query = {}) {
  const campo = query.ordenar ?? 'nombre';
  const signo = query.orden === 'desc' ? -1 : 1;
  if (campo === 'nombre') return (a, b) => signo * COMPARAR_NOMBRE(a, b);
  const valor = VALOR_ORDEN[campo];
  return (a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va === null && vb === null) return COMPARAR_NOMBRE(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return signo * (va - vb) || COMPARAR_NOMBRE(a, b);
  };
}

module.exports = { filtrar, coincide, comparador, ORDENES };
