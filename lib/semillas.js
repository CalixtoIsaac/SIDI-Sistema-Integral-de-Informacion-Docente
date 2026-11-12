/**
 * Semillas mínimas para que SIDI arranque con datos de trabajo (04 §6).
 * Todo con INSERT OR IGNORE: se puede correr en cada arranque sin duplicar ni pisar lo editado.
 *
 * ⚠ Puente de HU-00: cuando exista lib/migraciones/001_inicial.sql con sus semillas,
 *   este archivo se reemplaza por la versión definitiva de Uziel.
 */
const periodos = require('./periodos');

const TARIFAS = [
  ['Clase de 5 hrs en español', 5, 'ES', 11760, 90], ['Clase de 5 hrs en inglés', 5, 'EN', 14112, 106],
  ['Clase de 4 hrs en español', 4, 'ES', 9408, 70], ['Clase de 4 hrs en inglés', 4, 'EN', 11290, 85],
  ['Clase de 3 hrs en español', 3, 'ES', 7056, 54], ['Clase de 3 hrs en inglés', 3, 'EN', 8467, 65],
  ['Clase de 1.5 hrs en español', 1.5, 'ES', 3528, 26], ['Clase de 1.5 hrs en inglés', 1.5, 'EN', 4234, 32],
];

const CATALOGOS = {
  cc_nomina: ['Sueldo Carga Académica', 'Imp.Clase Artis.Cult.yDep', 'Flex Act. Acad de Apoyo'],
  motivo_incidencia: ['BB_Tutoreo (Preparatoria).', 'B2_Cap.Profr(CADI Asore, Compet.)',
    'D1_Activ. Artísticas, Cult Y Dep.', 'LB_Impart CursoTallGral'],
  cuenta_cargo: ['5420103000', '5422101001'],
  motivo_falta: ['Falta por asunto personal', 'Falta injustificadas', 'Suspensión'],
  horas_falta: ['8 horas= 1 día completo', '4 horas= 1/2 día'],
  tipo_contrato: ['determinado'],
  nivel_estudios: ['Licenciatura', 'Especialidad', 'Maestría', 'Doctorado'],
  campo_formacion: ['Ingeniería y Tecnología', 'Ciencias Exactas', 'Ciencias Naturales y de la Salud',
    'Ciencias Sociales', 'Económico-Administrativas', 'Educación', 'Humanidades', 'Idiomas', 'Artes', 'Deporte'],
};

// descripcion = recontratable sugerido ('1' sí, '0' no, null sin sugerencia)
const MOTIVOS_BAJA = [
  ['Sin disponibilidad de horario', '1'], ['Renuncia', '1'], ['No cumplió expectativas', '0'],
  ['Problemas de conducta o disciplina', '0'], ['Otro', null],
];

const CONFIGURACION = {
  'tema.modo': 'automatico',
  'tema.color': '#DB2777',
  'perfil.nombre': 'Coordinación de Docentes',
  'opina.muestra_minima': '10',
  'opina.campus': 'Veracruz',
  'opina.solo_presencial': '1',
  'opina.top_n': '10',
  'reportes.agrupar_suplencias': '1',
  'grupos.omitir_grupos': 'F61,F62',
};

const PERIODOS = ['AGO-DIC 2024', 'ENE-MAY 2025', 'AGO-DIC 2025', 'ENE-MAY 2026', 'AGO-DIC 2026'];
const PERIODO_ACTUAL = 'AGO-DIC 2026';

function sembrar(db) {
  db.transaction(() => {
    const t = db.prepare(`INSERT OR IGNORE INTO tipos_clase (nombre, horas_semana, idioma, pago_semestre, pago_por_dia)
                          VALUES (?, ?, ?, ?, ?)`);
    for (const fila of TARIFAS) t.run(...fila);

    const c = db.prepare('INSERT OR IGNORE INTO catalogos (tipo, valor, descripcion, orden) VALUES (?, ?, ?, ?)');
    for (const [tipo, valores] of Object.entries(CATALOGOS)) valores.forEach((v, i) => c.run(tipo, v, null, i + 1));
    MOTIVOS_BAJA.forEach(([v, d], i) => c.run('motivo_baja', v, d, i + 1));

    const k = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
    for (const [clave, valor] of Object.entries(CONFIGURACION)) k.run(clave, valor);

    const p = db.prepare(`INSERT OR IGNORE INTO periodos (clave, etiqueta_opina, fecha_inicio, fecha_fin)
                          VALUES (?, ?, ?, ?)`);
    for (const clave of PERIODOS) {
      const info = periodos.interpretar(clave);
      p.run(info.clave, info.etiquetaOpina, info.fechaInicio, info.fechaFin);
    }
    if (!db.prepare('SELECT 1 FROM periodos WHERE actual = 1').get()) {
      db.prepare('UPDATE periodos SET actual = 1 WHERE clave = ?').run(PERIODO_ACTUAL);
    }
  })();
}

module.exports = { sembrar, CONFIGURACION };
