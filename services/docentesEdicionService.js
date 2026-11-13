/**
 * Alta y edición de docentes (HU-01; 06 §Docentes; 05 §3).
 *
 *   crear(db, body)          POST /docentes          → alta manual (con títulos y asignaturas opcionales)
 *   actualizar(db, id, body) PUT  /docentes/:id      → actualización PARCIAL (solo los campos enviados)
 *   altaRapida(db, body)     POST /docentes/alta-rapida → { nomina, nombre } para suplentes
 *
 * Reglas: la nómina se normaliza ('3560330' → 'L03560330') y es única (409); la CURP se valida
 * y, si no se mandan, llena fecha de nacimiento y género; si la fecha enviada no coincide con la
 * CURP se marca revisar = 'Fecha de nacimiento ≠ CURP'.
 */
const nomina = require('../lib/nomina');
const curp = require('../lib/curp');
const periodos = require('../lib/periodos');
const { partesFecha } = require('../lib/quincena');
const { separarFormatoOpina } = require('../lib/nombres');
const { HttpError } = require('../lib/errores');
const { Validador, trae } = require('../lib/validar');
const titulosService = require('./titulosService');
const asignaturasService = require('./asignaturasService');

const NIVELES_IMPARTE = ['Bachillerato General', 'Bachillerato General Bilingüe', 'Profesional'];
const REVISAR_FECHA = 'Fecha de nacimiento ≠ CURP';

function valoresCatalogo(db, tipo) {
  return db.prepare('SELECT valor FROM catalogos WHERE tipo = ? AND activo = 1').all(tipo).map((c) => c.valor);
}

/** Valida la nómina y revisa que no la tenga otro docente. */
function validarNomina(db, v, valor, idActual = null) {
  if (valor === undefined || valor === null || valor === '') return v.error('nomina', 'OBLIGATORIO');
  const n = nomina.normalizar(valor);
  if (!n) return v.error('nomina', 'FORMATO');
  const otro = db.prepare('SELECT id FROM docentes WHERE nomina = ? AND id IS NOT ?').get(n, idActual);
  if (otro) throw new HttpError(409, `La nómina ${n} ya es de otro docente.`, 'NOMINA_DUPLICADA', [{ docenteId: otro.id }]);
  return n;
}

/**
 * Valida la CURP. Un dígito verificador incorrecto se acepta solo con aceptarCurpConAviso: true
 * (casi siempre es error de captura, pero la coordinadora puede tener la CURP correcta del documento).
 */
function validarCurp(db, v, valor, body, idActual = null) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const r = curp.validar(valor);
  const soloDigito = r.errores.length === 1 && r.errores[0] === 'DIGITO_VERIFICADOR';
  if (!r.valida && !(soloDigito && body.aceptarCurpConAviso === true)) {
    return v.error('curp', soloDigito ? 'DIGITO_VERIFICADOR' : r.errores[0]);
  }
  const otro = db.prepare('SELECT id FROM docentes WHERE curp = ? AND id IS NOT ?').get(r.curp, idActual);
  if (otro) throw new HttpError(409, `La CURP ${r.curp} ya es de otro docente.`, 'CURP_DUPLICADA', [{ docenteId: otro.id }]);
  return r.curp;
}

function validarFecha(v, campo, valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const p = partesFecha(valor);
  return p ? `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}` : v.error(campo, 'FECHA_INVALIDA');
}

/** 'AGO-DIC 2022' → { primer_periodo_id, primer_semestre_texto } */
function primerSemestre(db, v, valor) {
  if (valor === undefined || valor === null || valor === '') return { primer_periodo_id: null, primer_semestre_texto: null };
  const p = periodos.interpretar(valor);
  if (!p) return v.error('primerSemestre', 'FORMATO') ?? {};
  const existente = db.prepare('SELECT id FROM periodos WHERE clave = ?').get(p.clave);
  return { primer_periodo_id: existente?.id ?? null, primer_semestre_texto: p.clave };
}

function deCatalogo(db, v, campo, tipo, valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const lista = valoresCatalogo(db, tipo);
  const t = String(valor).trim();
  return lista.length === 0 || lista.includes(t) ? t : v.error(campo, 'NO_ESTA_EN_CATALOGO');
}

/**
 * Convierte el cuerpo (camelCase) en columnas. En actualización solo devuelve las columnas
 * de los campos que vienen en el cuerpo.
 */
function columnasDesde(db, body, { parcial, id = null }) {
  const v = new Validador();
  const c = {};
  const usar = (campo) => !parcial || trae(body, campo);
  if (usar('nomina')) c.nomina = validarNomina(db, v, body.nomina, id);
  if (usar('nombres')) c.nombres = v.texto('nombres', body.nombres, { obligatorio: true, max: 100 });
  if (usar('apellidoPaterno')) c.apellido_paterno = v.texto('apellidoPaterno', body.apellidoPaterno, { obligatorio: true, max: 100 });
  if (usar('apellidoMaterno')) c.apellido_materno = v.texto('apellidoMaterno', body.apellidoMaterno, { max: 100 });
  if (usar('curp')) c.curp = validarCurp(db, v, body.curp, body, id);
  if (usar('fechaNacimiento')) c.fecha_nacimiento = validarFecha(v, 'fechaNacimiento', body.fechaNacimiento);
  if (usar('genero')) c.genero = v.opcion('genero', body.genero, ['M', 'F']);
  if (usar('nivelImparte')) c.nivel_imparte = v.opcion('nivelImparte', body.nivelImparte, NIVELES_IMPARTE);
  if (usar('campoFormacion')) c.campo_formacion = deCatalogo(db, v, 'campoFormacion', 'campo_formacion', body.campoFormacion);
  if (usar('trabajoExterno')) c.trabajo_externo = v.texto('trabajoExterno', body.trabajoExterno, { max: 300 });
  if (usar('correoInstitucional')) c.correo_institucional = v.texto('correoInstitucional', body.correoInstitucional, { max: 150 });
  if (usar('tipoContrato')) c.tipo_contrato = v.texto('tipoContrato', body.tipoContrato, { max: 50 }) ?? 'determinado';
  if (usar('departamentoId')) c.departamento_id = v.entero('departamentoId', body.departamentoId, { min: 1 });
  if (usar('primerSemestre')) Object.assign(c, primerSemestre(db, v, body.primerSemestre));
  if (c.correo_institucional && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.correo_institucional)) v.error('correoInstitucional', 'FORMATO');
  v.terminar();
  return c;
}

/** Llena fecha y género desde la CURP cuando no se mandan, y marca "revisar" si no coinciden. */
function completarDesdeCurp(c, actual = {}) {
  const curpFinal = c.curp !== undefined ? c.curp : actual.curp;
  if (!curpFinal) return c;
  const derivada = curp.fechaNacimiento(curpFinal);
  const fechaEnviada = c.fecha_nacimiento !== undefined ? c.fecha_nacimiento : actual.fecha_nacimiento;
  if (!fechaEnviada && derivada) c.fecha_nacimiento = derivada;
  const generoFinal = c.genero !== undefined ? c.genero : actual.genero;
  if (!generoFinal && curp.genero(curpFinal)) c.genero = curp.genero(curpFinal);
  const fechaFinal = c.fecha_nacimiento !== undefined ? c.fecha_nacimiento : actual.fecha_nacimiento;
  if (derivada && fechaFinal && fechaFinal !== derivada) c.revisar = REVISAR_FECHA;
  else if ((actual.revisar ?? null) === REVISAR_FECHA) c.revisar = null;
  return c;
}

function insertar(db, c, origen) {
  const cols = Object.keys(c);
  const r = db.prepare(`INSERT INTO docentes (${cols.join(', ')}, origen) VALUES (${cols.map((k) => `@${k}`).join(', ')}, @origen)`)
    .run({ ...c, origen });
  return Number(r.lastInsertRowid);
}

/** POST /docentes. body puede traer titulos[] y asignaturas[]. Devuelve el id. */
function crear(db, body = {}) {
  const c = completarDesdeCurp(columnasDesde(db, body, { parcial: false }));
  const titulos = Array.isArray(body.titulos) ? body.titulos : [];
  const asignaturas = Array.isArray(body.asignaturas) ? body.asignaturas : [];
  return db.transaction(() => {
    const id = insertar(db, c, 'manual');
    titulos.forEach((t, i) => titulosService.crear(db, id, t, `titulos[${i}].`));
    asignaturas.forEach((a, i) => asignaturasService.crear(db, id, a, `asignaturas[${i}].`));
    return id;
  })();
}

/** PUT /docentes/:id (parcial). */
function actualizar(db, id, body = {}) {
  const actual = db.prepare('SELECT * FROM docentes WHERE id = ?').get(id);
  if (!actual) throw new HttpError(404, 'Ese docente no existe.', 'DOCENTE_NO_EXISTE');
  const c = completarDesdeCurp(columnasDesde(db, body, { parcial: true, id }), actual);
  const cols = Object.keys(c);
  if (cols.length === 0) return id;
  db.prepare(`UPDATE docentes SET ${cols.map((k) => `${k} = @${k}`).join(', ')}, actualizado_en = datetime('now','localtime')
              WHERE id = @id`).run({ ...c, id });
  return id;
}

/**
 * Separa el nombre del alta rápida. Acepta { nombres, apellidoPaterno, apellidoMaterno }
 * o "nombre": 'Dora Vega Aquino' (Nombres Paterno Materno) o 'Vega Aquino  Dora' (formato OPINA).
 */
function separarNombreRapido(body) {
  if (body.nombres || body.apellidoPaterno) {
    return { nombres: body.nombres, apellidoPaterno: body.apellidoPaterno, apellidoMaterno: body.apellidoMaterno ?? null };
  }
  const texto = String(body.nombre ?? '').trim();
  if (/\s{2,}/.test(texto)) return separarFormatoOpina(texto);
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length <= 1) return { nombres: palabras[0] ?? '', apellidoPaterno: '', apellidoMaterno: null };
  if (palabras.length === 2) return { nombres: palabras[0], apellidoPaterno: palabras[1], apellidoMaterno: null };
  return { nombres: palabras.slice(0, -2).join(' '), apellidoPaterno: palabras.at(-2), apellidoMaterno: palabras.at(-1) };
}

/** POST /docentes/alta-rapida → docente mínimo (origen 'alta_rapida'). */
function altaRapida(db, body = {}) {
  const v = new Validador();
  const n = validarNomina(db, v, body.nomina);
  const nombre = separarNombreRapido(body);
  if (!nombre.nombres || !nombre.apellidoPaterno) v.error('nombre', 'NOMBRE_Y_APELLIDO');
  v.terminar();
  return insertar(db, {
    nomina: n,
    nombres: nombre.nombres.trim(),
    apellido_paterno: nombre.apellidoPaterno.trim(),
    apellido_materno: nombre.apellidoMaterno?.trim() || null,
  }, 'alta_rapida');
}

module.exports = { crear, actualizar, altaRapida, separarNombreRapido, REVISAR_FECHA };
