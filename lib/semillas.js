/**
 * Semillas de SIDI (context/04_Modelo_Datos.md §6).
 *
 * Se ejecutan en cada arranque y son IDEMPOTENTES: usan INSERT OR IGNORE sobre
 * las claves únicas, así que NO pisan lo que la coordinadora ya editó desde la
 * pantalla de Configuración (tarifas, catálogos, fechas de pago, etc.).
 *
 * No hay datos reales del cliente aquí: solo catálogos, tarifas y calendario.
 */

// ---------- Tarifas (07 §6). Tarifa 3 h español = $54 (respuesta final) ----------
// [nombre, horas_semana, idioma, pago_semestre, pago_por_dia]
const TIPOS_CLASE = [
  ['Clase de 5 hrs en español',   5,   'ES', 11760.00, 90.00],
  ['Clase de 5 hrs en inglés',    5,   'EN', 14112.00, 106.00],
  ['Clase de 4 hrs en español',   4,   'ES',  9408.00, 70.00],
  ['Clase de 4 hrs en inglés',    4,   'EN', 11290.00, 85.00],
  ['Clase de 3 hrs en español',   3,   'ES',  7056.00, 54.00],
  ['Clase de 3 hrs en inglés',    3,   'EN',  8467.00, 65.00],
  ['Clase de 1.5 hrs en español', 1.5, 'ES',  3528.00, 26.00],
  ['Clase de 1.5 hrs en inglés',  1.5, 'EN',  4234.00, 32.00]
];

// ---------- Catálogos: [tipo, valor, descripcion, orden] ----------
const CATALOGOS = [
  ['cc_nomina', 'Sueldo Carga Académica', null, 1],
  ['cc_nomina', 'Imp.Clase Artis.Cult.yDep', null, 2],
  ['cc_nomina', 'Flex Act. Acad de Apoyo', null, 3],

  ['motivo_incidencia', 'BB_Tutoreo (Preparatoria).', null, 1],
  ['motivo_incidencia', 'B2_Cap.Profr(CADI Asore, Compet.)', null, 2],
  ['motivo_incidencia', 'D1_Activ. Artísticas, Cult Y Dep.', null, 3],
  ['motivo_incidencia', 'LB_Impart CursoTallGral', null, 4],

  ['cuenta_cargo', '5420103000', 'académico', 1],
  ['cuenta_cargo', '5422101001', 'artístico/cultural/deportivo, materias VSPP', 2],

  ['motivo_falta', 'Falta por asunto personal', null, 1],
  ['motivo_falta', 'Falta injustificadas', null, 2],
  ['motivo_falta', 'Suspensión', null, 3],

  ['horas_falta', '8 horas= 1 día completo', null, 1],
  ['horas_falta', '4 horas= 1/2 día', null, 2],

  // descripcion = valor de faltas.justificacion al que corresponde el texto
  ['situacion', 'Se hace descuento correspondiente por permiso personal sin justificación.', 'ninguna', 1],
  ['situacion', 'No se hace descuento correspondiente por incapacidad del IMSS', 'incapacidad_imss', 2],
  ['situacion', 'No se hace descuento correspondiente por cita médica IMSS', 'cita_imss', 3],

  ['estatus_falta', 'Se descuenta y se toma la falta correspondiente.', 'ninguna', 1],
  ['estatus_falta', 'No se descuenta y no se toma la falta correspondiente.', 'incapacidad_imss', 2],
  ['estatus_falta', 'No se descuenta y no se toma la falta/permiso con goce correspondiente.', 'cita_imss', 3],

  ['tipo_contrato', 'determinado', null, 1],

  // orden define la jerarquía: el nivel de estudios es el de mayor orden con estatus Titulado
  ['nivel_estudios', 'Licenciatura', null, 1],
  ['nivel_estudios', 'Especialidad', null, 2],
  ['nivel_estudios', 'Maestría', null, 3],
  ['nivel_estudios', 'Doctorado', null, 4],

  // propuesta del equipo, editable
  ['campo_formacion', 'Ingeniería y Tecnología', null, 1],
  ['campo_formacion', 'Ciencias Exactas', null, 2],
  ['campo_formacion', 'Ciencias Naturales y de la Salud', null, 3],
  ['campo_formacion', 'Ciencias Sociales', null, 4],
  ['campo_formacion', 'Económico-Administrativas', null, 5],
  ['campo_formacion', 'Educación', null, 6],
  ['campo_formacion', 'Humanidades', null, 7],
  ['campo_formacion', 'Idiomas', null, 8],
  ['campo_formacion', 'Artes', null, 9],
  ['campo_formacion', 'Deporte', null, 10],

  // descripcion = recontratable sugerido ('1' sí / '0' no); 'Otro' sin sugerencia
  ['motivo_baja', 'Sin disponibilidad de horario', '1', 1],
  ['motivo_baja', 'Renuncia', '1', 2],
  ['motivo_baja', 'No cumplió expectativas', '0', 3],
  ['motivo_baja', 'Problemas de conducta o disciplina', '0', 4],
  ['motivo_baja', 'Otro', null, 5]
];

// ---------- Periodos: [clave, etiqueta_opina, fecha_inicio, actual] ----------
// fecha_fin queda NULL: el documento solo define el inicio (1 ago / 1 ene).
const PERIODOS = [
  ['AGO-DIC 2024', '2024 Ago - Dic', '2024-08-01', 0],
  ['ENE-MAY 2025', '2025 Ene - May', '2025-01-01', 0],
  ['AGO-DIC 2025', '2025 Ago - Dic', '2025-08-01', 0],
  ['ENE-MAY 2026', '2026 Ene - May', '2026-01-01', 0],
  ['AGO-DIC 2026', '2026 Ago - Dic', '2026-08-01', 1]
];

// ---------- Configuración por defecto del perfil y de OPINA ----------
// Las claves correo.* (borrador de Outlook) se siembran en la migración de
// correo (Sprint 3), junto con envios_correo.
const CONFIGURACION = [
  ['tema.modo', 'automatico'],
  ['tema.color', '#DB2777'],
  ['perfil.nombre', 'Coordinación de Docentes'],
  ['opina.muestra_minima', '10'],
  ['opina.campus', 'Veracruz'],
  ['opina.solo_presencial', '1'],
  ['opina.top_n', '10'],
  ['reportes.agrupar_suplencias', '1'],
  ['grupos.omitir_grupos', 'F61,F62']   // grupos en línea: no se importan (07 §8 #31)
];

// ---------- Quincenas ----------
const ANIOS_QUINCENAS = [2026];

// Excepciones a "día 15 / último día del mes" (editable en la app).
// Q16 de 2026 se paga el 30/08 (04 §6).
const FECHA_PAGO_ESPECIAL = { '2026-16': '2026-08-30' };

const f2 = (n) => String(n).padStart(2, '0');
const fecha = (anio, mes, dia) => `${anio}-${f2(mes)}-${f2(dia)}`;

/**
 * 24 quincenas del año, numeradas por FECHA DE PAGO:
 *   n = (mes − 1) × 2 + (día ≤ 15 ? 1 : 2)
 *   impar → del 1 al 15, pago el 15 · par → del 16 al último día, pago el último día
 */
function quincenasDelAnio(anio) {
  const filas = [];
  for (let n = 1; n <= 24; n += 1) {
    const mes = Math.ceil(n / 2);
    const primera = n % 2 === 1;
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const inicio = fecha(anio, mes, primera ? 1 : 16);
    const fin = fecha(anio, mes, primera ? 15 : ultimoDia);
    const pago = FECHA_PAGO_ESPECIAL[`${anio}-${n}`] || fin;
    filas.push([anio, n, inicio, fin, pago]);
  }
  return filas;
}

/** Inserta las semillas sin pisar lo existente. */
function sembrar(db) {
  const insConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
  const insTipo = db.prepare(`INSERT OR IGNORE INTO tipos_clase
    (nombre, horas_semana, idioma, pago_semestre, pago_por_dia) VALUES (?, ?, ?, ?, ?)`);
  const insCatalogo = db.prepare(
    'INSERT OR IGNORE INTO catalogos (tipo, valor, descripcion, orden) VALUES (?, ?, ?, ?)');
  const insPeriodo = db.prepare(`INSERT OR IGNORE INTO periodos
    (clave, etiqueta_opina, fecha_inicio, actual) VALUES (?, ?, ?, ?)`);
  const insQuincena = db.prepare(`INSERT OR IGNORE INTO quincenas
    (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (?, ?, ?, ?, ?)`);

  db.transaction(() => {
    CONFIGURACION.forEach((r) => insConfig.run(...r));
    TIPOS_CLASE.forEach((r) => insTipo.run(...r));
    CATALOGOS.forEach((r) => insCatalogo.run(...r));
    PERIODOS.forEach((r) => insPeriodo.run(...r));
    ANIOS_QUINCENAS.forEach((anio) => quincenasDelAnio(anio).forEach((r) => insQuincena.run(...r)));
  })();
}

module.exports = { sembrar, quincenasDelAnio };
