/**
 * Arma libros de Excel FICTICIOS en memoria para las pruebas
 * (regla del equipo: nunca subir archivos reales del cliente).
 */
const XLSX = require('xlsx');

/** hojas = { NombreHoja: [[encabezados], [fila], …] } → Buffer .xlsx (o .xlsb con bookType). */
function libro(hojas, bookType = 'xlsx') {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSX.write(wb, { type: 'buffer', bookType });
}

const ENCABEZADOS_GRUPOS = [
  'Campus', 'Descripción periodo', 'Descripción nivel académico materia', 'Clave materia',
  'Nombre largo materia', 'CRN', 'Número grupo', 'Modalidad grupo', 'Nómina profesor',
  'Nombre completo profesor', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes',
  'Hora inicio clase', 'Hora fin clase',
];

/** Fila del Excel de grupos. dias = 'LMXJV' con las letras de los días que aplica. */
function filaGrupo({ clave, materia, crn, grupo, modalidad = 'Teórica', nomina, profesor, dias, inicio, fin, campus = 'Veracruz' }) {
  const marca = (letra) => (dias.includes(letra) ? 'SI' : null);
  return [
    campus, '2026 Ago - Dic', 'Preparatoria', clave, materia, crn, grupo, modalidad, nomina, profesor,
    marca('L'), marca('M'), marca('X'), marca('J'), marca('V'), inicio, fin,
  ];
}

/** Excel de grupos ficticio con los casos de 07 §7. */
function excelGrupos() {
  const filas = [
    // 3 h ES (lunes y jueves 1.5 h)
    filaGrupo({ clave: 'BSMA2001', materia: 'Matemáticas I', crn: '16001', grupo: '611', nomina: 'L03500001', profesor: 'López Ruiz  María', dias: 'LJ', inicio: '07:30', fin: '08:59' }),
    // Mismo docente, materia en inglés (EN), 5 h
    filaGrupo({ clave: 'BSMA2003', materia: 'Math III', crn: '16002', grupo: '612', nomina: 'L03500001', profesor: 'López Ruiz  María', dias: 'LMXJV', inicio: '10:00', fin: '10:59' }),
    // CRN con DOS sesiones el miércoles (dos filas) → 3 h
    filaGrupo({ clave: 'BSHU1001', materia: 'Historia', crn: '16452', grupo: '601', nomina: 3500002, profesor: 'Sosa Von Putlitz  Guillermo', dias: 'X', inicio: '11:00', fin: '12:29' }),
    filaGrupo({ clave: 'BSHU1001', materia: 'Historia', crn: '16452', grupo: '601', nomina: 3500002, profesor: 'Sosa Von Putlitz  Guillermo', dias: 'X', inicio: '13:30', fin: '15:00' }),
    // Bachillerato Intercultural → EN y plan bilingüe; CRN como número
    filaGrupo({ clave: 'BSCN1006', materia: 'Química I', crn: 16434, grupo: '801', modalidad: 'Bachillerato Intercultural', nomina: 'L03500003', profesor: 'De la Cruz Pérez  Ana Laura', dias: 'MJ', inicio: '16:00', fin: '17:35' }),
    // En línea: se omiten
    filaGrupo({ clave: 'BSXX9001', materia: 'En línea A', crn: '22023', grupo: 'F61', nomina: 'L03500004', profesor: 'Gómez  Luis', dias: 'LMX', inicio: '18:00', fin: '19:29' }),
    filaGrupo({ clave: 'BSXX9002', materia: 'En línea B', crn: '22030', grupo: 'F62', nomina: 'L03500004', profesor: 'Gómez  Luis', dias: 'LMX', inicio: '18:00', fin: '19:29' }),
    // Hora en formato de Excel (fracción de día)
    filaGrupo({ clave: 'VSPP1001', materia: 'Fútbol', crn: '16500', grupo: '602', nomina: 'L03500005', profesor: 'Ramírez Soto  Pedro', dias: 'V', inicio: 0.5, fin: 0.5624 }),
    // Fila con nómina inválida
    filaGrupo({ clave: 'BSMA2001', materia: 'Matemáticas I', crn: '16600', grupo: '613', nomina: 'sin nómina', profesor: 'X  Y', dias: 'L', inicio: '07:30', fin: '08:59' }),
  ];
  return libro({ Salida: [ENCABEZADOS_GRUPOS, ...filas] });
}

const ENC_OPINA_V1 = [
  'Periodo', 'DWH_Periodo', 'Plan', 'CRN', ' Clave de grupo', 'Clave de Materia', 'Materia', 'Profesor', 'Nómina',
  'Campus Grupo', 'Formato', '¿Recomendarías a un compañero tomar clase con este profesor?', '¿Por qué sí?',
  '¿Por qué no?', 'Comentario', 'ResponseId', 'Flex',
];

function filaOpinaV1({ crn = '16001', nomina = 'L03500001', profesor = 'López Ruiz  María', campus = 'Veracruz', formato = 'Presencial', rec = 'Sí', id = 'R1' }) {
  return ['2024 Ago - Dic', '2024 Ago - Dic', 'Bachillerato General', crn, `Veracruz_BSMA2001_611`, 'BSMA2001', 'Matemáticas I',
    profesor, nomina, campus, formato, rec, rec === 'Sí' ? 'Explica bien' : null, rec === 'No' ? 'No explica' : null, null, id, 'x'];
}

const ENC_OPINA_V2 = [
  'DWH_Periodo', 'Plan', 'CRN', 'Clave de grupo', 'Nombre de la materia', 'Profesor', 'Nómina', 'Campus grupo', 'Formato',
  '¿Recomendarías a un compañero tomar clase con este profesor?',
  'Mi profesor demuestra conocimiento de la materia', 'Mi profesor me plantea retos', 'Mi profesor fomenta la colaboración',
  'Mi profesor genera un ambiente de confianza', 'Mi profesor me inspira',
  '¿Deseas compartir algún comentario adicional sobre tu profesor?',
];

function filaOpinaV2({ crn = '16001', nomina = 'L03500001', profesor = 'López Ruiz  María', campus = 'Veracruz', formato = 'Presencial', rec = 'Sí' }) {
  return ['2026 Ene - May', 'Bachillerato General', crn, 'Veracruz_BSCN1006_611', 'Química I', profesor, nomina, campus, formato, rec,
    'Sí', 'No estoy seguro', 'Sí', 'No', 'Sí', rec === 'No' ? 'Llega tarde' : null];
}

module.exports = { libro, excelGrupos, filaGrupo, ENCABEZADOS_GRUPOS, ENC_OPINA_V1, filaOpinaV1, ENC_OPINA_V2, filaOpinaV2 };
