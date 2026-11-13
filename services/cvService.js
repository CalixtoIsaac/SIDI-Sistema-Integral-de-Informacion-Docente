/**
 * Importación de CV en PDF (HU-20; 07 §7.1; 06 §Carga de CV).
 *
 *   preview(db, archivos)  → lee cada PDF (hasta 60), propone docente y datos; NO guarda
 *   confirm(db, body)      → guarda campos, títulos y el PDF en data/cv/ (fuera de git)
 *
 * Liga del CV con el docente: por CURP; si no, por nombre normalizado (sin acentos, sin
 * importar el orden ni los espacios). Si no hay coincidencia, la coordinadora elige el
 * docente, captura la nómina (se crea con origen 'cv') u omite el archivo.
 *
 * Al confirmar: lo que la coordinadora editó en la vista previa (`datos`) se escribe siempre;
 * lo propuesto por el CV solo llena campos vacíos (no pisa lo capturado a mano sin avisar).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lector = require('../lib/cv/lector');
const curpLib = require('../lib/curp');
const nominaLib = require('../lib/nomina');
const { claveComparacion, separarFormatoOpina } = require('../lib/nombres');
const { crearAlmacen } = require('../lib/previews');
const { HttpError } = require('../lib/errores');
const titulosService = require('./titulosService');
const edicionService = require('./docentesEdicionService');

const previews = crearAlmacen('CV');
const RAIZ = path.join(__dirname, '..');
const CARPETA_CV = path.join(RAIZ, 'data', 'cv');
const MAX_PDF_MB = 10;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function nombreCompletoBd(d) {
  return [d.nombres, d.apellido_paterno, d.apellido_materno].filter(Boolean).join(' ');
}

/** Busca el docente del CV: CURP primero, luego nombre normalizado. */
function coincidencia(propuesta, docentes) {
  if (propuesta.curp) {
    const d = docentes.find((x) => x.curp === propuesta.curp);
    if (d) return { docenteId: d.id, nomina: d.nomina, nombre: nombreCompletoBd(d), por: 'curp' };
  }
  const clave = claveComparacion(propuesta.nombre ?? '');
  if (!clave) return null;
  const porNombre = docentes.filter((x) => claveComparacion(nombreCompletoBd(x)) === clave);
  if (porNombre.length === 1) {
    const d = porNombre[0];
    return { docenteId: d.id, nomina: d.nomina, nombre: nombreCompletoBd(d), por: 'nombre' };
  }
  return null;
}

/** Diferencias entre lo que ya tiene el docente y lo que propone el CV (para avisar). */
function diferenciasConBd(propuesta, d) {
  if (!d) return [];
  const pares = [
    ['curp', d.curp, propuesta.curp],
    ['fechaNacimiento', d.fecha_nacimiento, propuesta.fechaNacimiento],
    ['genero', d.genero, propuesta.genero],
    ['trabajoExterno', d.trabajo_externo, propuesta.trabajoExterno],
  ];
  return pares.filter(([, actual, nuevo]) => actual && nuevo && actual !== nuevo)
    .map(([campo, actual, nuevo]) => ({ campo, actual, cv: nuevo }));
}

async function leerUno(archivo, docentes, yaImportados) {
  const ext = path.extname(archivo.nombre).toLowerCase();
  if (ext !== '.pdf') return { noLeido: { archivo: archivo.nombre, motivo: ext === '.docx' ? 'Los .docx no se leen; sube el PDF' : 'No es PDF' } };
  if (archivo.buffer.length > MAX_PDF_MB * 1024 * 1024) return { noLeido: { archivo: archivo.nombre, motivo: `Pesa más de ${MAX_PDF_MB} MB` } };
  const hash = sha256(archivo.buffer);
  try {
    const propuesta = await lector.leerPdf(archivo.buffer, { archivo: archivo.nombre });
    const c = coincidencia(propuesta, docentes);
    const d = c ? docentes.find((x) => x.id === c.docenteId) : null;
    const { paginas, ...resto } = propuesta;
    return {
      item: {
        archivo: archivo.nombre,
        paginas,
        coincidencia: c,
        yaImportado: yaImportados.has(hash),
        propuesta: resto,
        conflictos: [...propuesta.conflictos, ...diferenciasConBd(propuesta, d)],
      },
      guardar: { archivo: archivo.nombre, buffer: archivo.buffer, sha256: hash, paginas, propuesta },
    };
  } catch (err) {
    if (err.name === 'CvNoLegible') return { noLeido: { archivo: archivo.nombre, motivo: err.message } };
    throw err;
  }
}

/** Vista previa. `archivos` = [{ nombre, buffer }]. */
async function preview(db, archivos) {
  const docentes = db.prepare('SELECT id, nomina, nombres, apellido_paterno, apellido_materno, curp, fecha_nacimiento, genero, trabajo_externo FROM docentes').all();
  const yaImportados = new Set(db.prepare('SELECT sha256 FROM cv_archivos').all().map((c) => c.sha256));
  const items = [];
  const noLeidos = [];
  const guardados = new Map();
  for (const archivo of archivos) {
    const r = await leerUno(archivo, docentes, yaImportados);
    if (r.noLeido) noLeidos.push(r.noLeido);
    else {
      items.push(r.item);
      guardados.set(r.guardar.archivo, r.guardar);
    }
  }
  const previewId = previews.guardar({ archivos: guardados });
  return { previewId, total: archivos.length, leidos: items.length, noLeidos, items };
}

// ------------------------------------------------------------------ confirmar

/** Resuelve a qué docente va el CV: docenteId, nómina (existente o nueva) u omitir. */
function resolverDocente(db, item, guardado) {
  if (item.docenteId) {
    const d = db.prepare('SELECT id FROM docentes WHERE id = ?').get(Number(item.docenteId));
    if (!d) throw new HttpError(400, `El docente elegido para "${item.archivo}" no existe.`, 'DOCENTE_NO_EXISTE');
    return d.id;
  }
  const n = nominaLib.normalizar(item.nomina);
  if (!n) throw new HttpError(400, `Elige el docente, captura la nómina u omite "${item.archivo}".`, 'CV_SIN_DOCENTE');
  const existente = db.prepare('SELECT id FROM docentes WHERE nomina = ?').get(n);
  if (existente) return existente.id;
  const nombre = separarFormatoOpina(String(guardado.archivo).replace(/\.pdf$/i, ''));
  const delCv = edicionService.separarNombreRapido({ nombre: guardado.propuesta.nombre ?? '' });
  const elegido = item.datos?.nombres ? item.datos : (delCv.apellidoPaterno ? delCv : nombre);
  const id = edicionService.altaRapida(db, {
    nomina: n, nombres: elegido.nombres, apellidoPaterno: elegido.apellidoPaterno, apellidoMaterno: elegido.apellidoMaterno,
  });
  db.prepare("UPDATE docentes SET origen = 'cv' WHERE id = ?").run(id);
  return id;
}

/** Arma el cuerpo para docentesEdicionService.actualizar: editado > propuesta (solo si está vacío). */
function cambiosDocente(actual, propuesta, datos = {}) {
  const cambios = {};
  const llenar = (campo, columna, valor) => {
    if (Object.prototype.hasOwnProperty.call(datos, campo)) cambios[campo] = datos[campo];
    else if (!actual[columna] && valor) cambios[campo] = valor;
  };
  llenar('curp', 'curp', propuesta.curp);
  llenar('fechaNacimiento', 'fecha_nacimiento', propuesta.fechaNacimiento);
  llenar('genero', 'genero', propuesta.genero);
  llenar('trabajoExterno', 'trabajo_externo', propuesta.trabajoExterno);
  llenar('correoInstitucional', 'correo_institucional', propuesta.correoInstitucional);
  if (!actual.primer_semestre_texto && !actual.primer_periodo_id) llenar('primerSemestre', 'primer_semestre_texto', propuesta.primerSemestre);
  else if (Object.prototype.hasOwnProperty.call(datos, 'primerSemestre')) cambios.primerSemestre = datos.primerSemestre;
  if (propuesta.curp && curpLib.validar(propuesta.curp).errores.join() === 'DIGITO_VERIFICADOR') cambios.aceptarCurpConAviso = true;
  return cambios;
}

/** Reemplaza los títulos que vinieron de un CV anterior; los capturados a mano se conservan. */
function guardarTitulos(db, docenteId, titulos) {
  db.prepare("DELETE FROM titulos_docente WHERE docente_id = ? AND origen = 'cv'").run(docenteId);
  titulos.forEach((t, i) => titulosService.crear(db, docenteId, { ...t, origen: 'cv' }, `titulos[${i}].`));
}

function guardarExtras(db, docenteId, propuesta, datos) {
  const actual = db.prepare('SELECT datos_adicionales FROM docentes WHERE id = ?').get(docenteId);
  let extra = {};
  try {
    extra = JSON.parse(actual.datos_adicionales || '{}');
  } catch { /* se reemplaza */ }
  extra.cursos = datos.cursos ?? propuesta.cursos ?? [];
  extra.idiomas = datos.idiomas ?? propuesta.idiomas ?? [];
  db.prepare('UPDATE docentes SET datos_adicionales = ? WHERE id = ?').run(JSON.stringify(extra), docenteId);
}

/** Copia el PDF a data/cv/<nómina>-<hash>.pdf y registra cv_archivos. `escritos` junta las rutas (para deshacer). */
function guardarPdf(db, docenteId, guardado, escritos) {
  const d = db.prepare('SELECT nomina FROM docentes WHERE id = ?').get(docenteId);
  fs.mkdirSync(CARPETA_CV, { recursive: true });
  const nombre = `${d.nomina}-${guardado.sha256.slice(0, 8)}.pdf`;
  const destino = path.join(CARPETA_CV, nombre);
  if (!fs.existsSync(destino)) {
    fs.writeFileSync(destino, guardado.buffer);
    escritos.push(destino);
  }
  db.prepare(`INSERT INTO cv_archivos (docente_id, nombre_original, ruta, sha256, paginas, datos_extraidos)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(docenteId, guardado.archivo, `data/cv/${nombre}`, guardado.sha256, guardado.paginas, JSON.stringify(guardado.propuesta));
  return nombre;
}

function aplicarItem(db, item, guardado, escritos) {
  const docenteId = resolverDocente(db, item, guardado);
  const datos = item.datos ?? {};
  const actual = db.prepare('SELECT * FROM docentes WHERE id = ?').get(docenteId);
  edicionService.actualizar(db, docenteId, cambiosDocente(actual, guardado.propuesta, datos));
  if (guardado.propuesta.conflictos.some((c) => c.campo === 'fechaNacimiento') && !datos.fechaNacimiento) {
    db.prepare('UPDATE docentes SET revisar = ? WHERE id = ?').run(edicionService.REVISAR_FECHA, docenteId);
  }
  guardarTitulos(db, docenteId, datos.titulos ?? guardado.propuesta.titulos);
  guardarExtras(db, docenteId, guardado.propuesta, datos);
  guardarPdf(db, docenteId, guardado, escritos);
  return docenteId;
}

/**
 * body = { previewId, items: [{ archivo, docenteId | nomina | omitir: true, datos: { …editados } }] }
 * Los archivos de la vista previa que no vengan en items se omiten.
 */
function confirm(db, body = {}) {
  const { archivos } = previews.obtener(body.previewId);
  const items = Array.isArray(body.items) ? body.items : [];
  const desconocidos = items.filter((i) => !archivos.has(i.archivo)).map((i) => ({ archivo: i.archivo, problema: 'NO_ESTA_EN_LA_VISTA_PREVIA' }));
  if (desconocidos.length) throw new HttpError(400, 'Hay archivos que no están en la vista previa.', 'ARCHIVO_DESCONOCIDO', desconocidos);
  const escritos = [];
  let resultado;
  try {
    resultado = db.transaction(() => items.filter((i) => !i.omitir).map((i) => {
      try {
        return { archivo: i.archivo, docenteId: aplicarItem(db, i, archivos.get(i.archivo), escritos) };
      } catch (err) {
        if (err.status && err.details) err.details = err.details.map((d) => ({ archivo: i.archivo, ...d }));
        throw err;
      }
    }))();
  } catch (err) {
    for (const f of escritos) fs.rmSync(f, { force: true }); // la BD se deshizo: tampoco quedan PDF sueltos
    throw err;
  }
  previews.borrar(body.previewId);
  return { guardados: resultado.length, omitidos: archivos.size - resultado.length, items: resultado };
}

module.exports = { preview, confirm, previews, coincidencia, CARPETA_CV };
