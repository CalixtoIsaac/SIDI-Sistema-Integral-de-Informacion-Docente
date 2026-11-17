/**
 * Datos de demostración ANONIMIZADOS (cierre del Sprint 2, D10).
 *
 * Crea una base APARTE (data/demo.db) con docentes, grupos, horarios, contratos, OPINA,
 * bajas, faltas, suplencias e incidencias inventados, para probar de punta a punta: consulta y
 * filtros, faltas, docentes disponibles, suplencias y los reportes de Nacional. Nunca toca data/app.db.
 *
 *   node scripts/demo.js               crea data/demo.db y los Excel ficticios en data/demo/
 *   node scripts/demo.js --reiniciar   borra data/demo.db y la vuelve a crear
 *
 * Abrir la app con la demo (PowerShell):  $env:DB_PATH="data/demo.db"; npm start
 * Volver a la base normal:                Remove-Item Env:DB_PATH
 *
 * Los Excel se cargan con los importadores reales (grupos, OPINA y contratos), así que los
 * datos quedan igual que si la coordinadora los hubiera importado. Todo es ficticio:
 * nóminas L099xxxxx, nombres y CURP inventados (con dígito verificador válido).
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const RAIZ = path.join(__dirname, '..');
const DEMO_DB = path.join(RAIZ, 'data', 'demo.db');
const DEMO_DIR = path.join(RAIZ, 'data', 'demo');

// --------------------------------------------------------------- catálogo ficticio

/** [clave, nombre, horas por semana, modalidad] — 5 h = 1 h diaria; 3 h = 2 × 1.5 h; 1.5 h = 1 sesión. */
const MATERIAS = {
  MAT1: ['BSMA2001', 'Matemáticas I', 3, 'Teórica'],
  MAT3: ['BSMA2003', 'Math III', 5, 'Teórica'],
  LEC: ['BSES1001', 'Lectura y Redacción', 3, 'Teórica'],
  HIS: ['BSHU1001', 'Historia de México', 3, 'Teórica'],
  QUI: ['BSCN1006', 'Química I', 3, 'Bachillerato Intercultural'],
  BIO: ['BSCN1004', 'Biología', 3, 'Teórica'],
  ING: ['BSIN1002', 'English II', 5, 'Bachillerato Intercultural'],
  FIS: ['BSFI2001', 'Física I', 3, 'Teórica'],
  INF: ['BSTI2001', 'Informática', 3, 'Teórica'],
  ECO: ['BSEC2001', 'Economía', 3, 'Teórica'],
  PSI: ['BSPS1001', 'Psicología', 1.5, 'Teórica'],
  FUT: ['VSPP1001', 'Fútbol', 1.5, 'Teórica'],
  DAN: ['VSPP1003', 'Danza', 1.5, 'Teórica'],
};

/**
 * Docentes ficticios. sexo H/M (como en la CURP). est: 'activo' | 'baja_recontratable' |
 * 'baja_no_recontratable' | 'reactivado'. ago / ene: materias en AGO-DIC 2026 / ENE-MAY 2026.
 */
const DOCENTES = [
  { n: 1, ap: 'Arriaga', am: 'Benítez', nom: 'Carolina', sexo: 'M', nac: '1988-03-14', campo: 'Ciencias Exactas', tit: [['Licenciatura'], ['Maestría']], desde: 'AGO-DIC 2017', ago: ['MAT1', 'MAT1', 'FIS'], ene: ['MAT1', 'FIS'] },
  { n: 2, ap: 'Bautista', am: 'Cano', nom: 'Rodrigo', sexo: 'H', nac: '1979-11-02', campo: 'Ingeniería y Tecnología', tit: [['Licenciatura'], ['Doctorado']], ext: 'Consultoría independiente', ago: ['FIS', 'INF', 'MAT1'], ene: ['FIS', 'INF'] },
  { n: 3, ap: 'Castañeda', am: 'Duarte', nom: 'Elena', sexo: 'M', nac: '1992-06-21', campo: 'Idiomas', tit: [['Licenciatura'], ['Maestría', 'Estudios en curso']], idiomas: ['Inglés C1', 'Francés B1'], ago: ['ING', 'MAT3'], ene: ['ING'] },
  { n: 4, ap: 'Domínguez', am: 'Esparza', nom: 'Héctor', sexo: 'H', nac: '1985-01-30', campo: 'Humanidades', tit: [['Licenciatura']], ago: ['HIS', 'HIS', 'LEC'], ene: ['HIS', 'LEC'] },
  { n: 5, ap: 'Escobar', am: 'Fuentes', nom: 'Mariana', sexo: 'M', nac: '1990-09-09', campo: 'Ciencias Naturales y de la Salud', tit: [['Licenciatura'], ['Especialidad']], ago: ['QUI', 'BIO'], ene: ['QUI', 'BIO'] },
  { n: 6, ap: 'Figueroa', am: 'Galindo', nom: 'Tomás', sexo: 'H', nac: '1995-04-17', campo: 'Deporte', tit: [['Licenciatura']], ago: ['FUT', 'FUT', 'DAN'], ene: ['FUT'] },
  { n: 7, ap: 'Guerrero', am: 'Herrera', nom: 'Daniela', sexo: 'M', nac: '1983-12-05', campo: 'Económico-Administrativas', tit: [['Licenciatura'], ['Maestría']], ext: 'Despacho contable propio', ago: ['ECO', 'MAT1'], ene: ['ECO'] },
  { n: 8, ap: 'Hinojosa', am: 'Ibarra', nom: 'Sergio', sexo: 'H', nac: '1976-08-23', campo: 'Ciencias Sociales', tit: [['Licenciatura'], ['Maestría'], ['Doctorado', 'Estudios en curso']], desde: 'ENE-MAY 2019', ago: ['PSI', 'LEC', 'HIS'], ene: ['PSI', 'HIS'] },
  { n: 9, ap: 'Izquierdo', am: 'Juárez', nom: 'Paola', sexo: 'M', nac: '1998-02-11', campo: 'Educación', tit: [['Licenciatura', 'Título en trámite']], ago: ['LEC', 'BIO'] },
  { n: 10, ap: 'Jiménez', am: 'Lara', nom: 'Alberto', sexo: 'H', nac: '1987-10-28', campo: 'Ingeniería y Tecnología', tit: [['Licenciatura']], ago: ['INF', 'INF', 'MAT1'], ene: ['INF'] },
  { n: 11, ap: 'Lozano', am: 'Medina', nom: 'Fernanda', sexo: 'M', nac: '1993-05-02', campo: 'Idiomas', tit: [['Licenciatura'], ['Especialidad']], idiomas: ['Inglés C2'], ago: ['ING', 'ING'], ene: ['ING', 'MAT3'] },
  { n: 12, ap: 'Medrano', am: 'Navarro', nom: 'Iván', sexo: 'H', nac: '1981-07-19', campo: 'Ciencias Exactas', tit: [['Licenciatura'], ['Maestría']], desde: 'AGO-DIC 2015', ago: ['MAT3', 'FIS'], ene: ['MAT3', 'MAT1'] },
  { n: 13, ap: 'Núñez', am: 'Ochoa', nom: 'Gabriela', sexo: 'M', nac: '1989-03-03', campo: 'Artes', tit: [['Licenciatura']], ago: ['DAN', 'DAN'], ene: ['DAN'] },
  { n: 14, ap: 'Olvera', am: 'Pacheco', nom: 'Ricardo', sexo: 'H', nac: '1991-12-12', campo: 'Ciencias Naturales y de la Salud', tit: [['Licenciatura'], ['Maestría']], ago: ['BIO', 'QUI', 'BIO'], ene: ['BIO'] },
  { n: 15, ap: 'Peralta', am: 'Quiroz', nom: 'Lucía', sexo: 'M', nac: '1996-09-30', campo: null, tit: [], sinCurp: true, ago: ['PSI', 'ECO'] },
  { n: 16, ap: 'Quintero', am: 'Rosales', nom: 'Martín', sexo: 'H', nac: '1984-04-08', campo: 'Humanidades', tit: [['Licenciatura']], est: 'reactivado', ago: ['HIS', 'LEC'], ene: ['HIS'] },
  { n: 17, ap: 'Rangel', am: 'Salinas', nom: 'Verónica', sexo: 'M', nac: '1986-01-25', campo: 'Ciencias Exactas', tit: [['Licenciatura']], est: 'baja_recontratable', ene: ['MAT1', 'FIS'] },
  { n: 18, ap: 'Solís', am: 'Tapia', nom: 'Jorge', sexo: 'H', nac: '1980-06-14', campo: 'Económico-Administrativas', tit: [['Licenciatura']], est: 'baja_no_recontratable', ene: ['ECO', 'PSI'] },
  { n: 19, ap: 'Trejo', am: 'Uribe', nom: 'Andrea', sexo: 'M', nac: '2001-08-08', campo: 'Educación', tit: [['Licenciatura', 'Pasante']], ago: ['LEC'] },
  { n: 20, ap: 'Valdez', am: 'Zamora', nom: 'Emilio', sexo: 'H', nac: '1994-11-11', campo: 'Deporte', tit: [['Licenciatura']], ago: ['FUT'], ene: ['FUT'] },
];

/** Respuestas OPINA ENE-MAY 2026 por docente: [respuestas, % de "Sí"]. Menos de 10 = muestra insuficiente. */
const OPINA = {
  1: [24, 96], 2: [18, 89], 3: [22, 91], 4: [16, 75], 5: [20, 95], 6: [12, 100], 7: [15, 80],
  8: [21, 86], 10: [17, 82], 11: [25, 92], 12: [19, 68], 13: [6, 100], 14: [14, 79], 16: [13, 85],
  17: [11, 73], 18: [10, 50], 20: [9, 89],
};

// --------------------------------------------------------------- utilidades

const nomina = (n) => `L099${String(n).padStart(5, '0')}`;
const nombreExcel = (d) => `${d.ap} ${d.am}  ${d.nom}`; // formato del Excel de grupos: apellidos, 2 espacios, nombres

/** CURP ficticia con estructura y dígito verificador válidos (estado VZ = Veracruz). */
function curpFicticia(d) {
  const { digitoVerificador } = require('../lib/curp');
  const sinAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/Ñ/g, 'X');
  const ap = sinAcento(d.ap); const am = sinAcento(d.am); const nom = sinAcento(d.nom);
  const vocal = ap.slice(1).match(/[AEIOU]/)?.[0] ?? 'X';
  const consonante = (t) => t.slice(1).match(/[B-DF-HJ-NP-TV-Z]/)?.[0] ?? 'X';
  const [y, m, dia] = d.nac.split('-');
  const siglo = Number(y) >= 2000 ? 'A' : String(d.n % 10);
  const curp17 = `${ap[0]}${vocal}${am[0]}${nom[0]}${y.slice(2)}${m}${dia}${d.sexo}VZ${consonante(ap)}${consonante(am)}${consonante(nom)}${siglo}`;
  return curp17 + digitoVerificador(curp17);
}

// Bloques de horario. 1.5 h: dos sesiones por semana (3 h) o una (1.5 h). 1 h: diario (5 h).
const BLOQUES_15 = [['07:00', '08:29'], ['08:30', '09:59'], ['10:30', '11:59'], ['12:00', '13:29'], ['13:30', '14:59']];
const BLOQUES_1 = [['15:00', '15:59'], ['16:00', '16:59']];
const PARES = ['LJ', 'MV', 'LX', 'MJ', 'XV'];
const DIAS = 'LMXJV';

/**
 * Reparte las materias de cada docente en el horario sin empalmes. Devuelve filas del
 * Excel de grupos (una por sesión-patrón) y la lista de grupos con su CRN.
 */
function armarGrupos(periodoEtiqueta, campo, crnInicial, grupoInicial) {
  let crn = crnInicial;
  let grupo = grupoInicial;
  const filas = [];
  const grupos = [];
  for (const d of DOCENTES) {
    const ocupado = new Set(); // 'L-07:00'
    const libre = (dias, b) => [...dias].every((x) => !ocupado.has(`${x}-${b[0]}`));
    const ocupar = (dias, b) => [...dias].forEach((x) => ocupado.add(`${x}-${b[0]}`));
    const materias = d[campo] ?? [];
    materias.forEach((m, i) => {
      const [clave, nombre, horas, modalidad] = MATERIAS[m];
      let dias; let b;
      if (horas === 5) {
        dias = DIAS;
        b = BLOQUES_1.find((x) => libre(dias, x));
      } else {
        const opciones = horas === 3 ? PARES : [...DIAS];
        // cada docente arranca en un bloque distinto para que no todos den clase a la misma hora
        const orden = BLOQUES_15.map((_, k) => BLOQUES_15[(k + d.n + i) % BLOQUES_15.length]);
        for (const bloque of orden) {
          dias = opciones.find((o) => libre(o, bloque));
          if (dias) { b = bloque; break; }
        }
      }
      if (!b) throw new Error(`Sin horario libre para ${m} de ${d.nom}`);
      ocupar(dias, b);
      crn += 1; grupo += 1;
      const g = { docente: d.n, crn: String(crn), clave, nombre, grupo: String(grupo), modalidad, dias, inicio: b[0], fin: b[1] };
      grupos.push(g);
      filas.push(filaGrupo(periodoEtiqueta, g));
    });
  }
  return { filas, grupos };
}

const ENC_GRUPOS = [
  'Campus', 'Descripción periodo', 'Descripción nivel académico materia', 'Clave materia', 'Nombre largo materia', 'CRN',
  'Número grupo', 'Modalidad grupo', 'Nómina profesor', 'Nombre completo profesor', 'Lunes', 'Martes', 'Miércoles', 'Jueves',
  'Viernes', 'Hora inicio clase', 'Hora fin clase',
];

function filaGrupo(periodoEtiqueta, g) {
  const d = DOCENTES.find((x) => x.n === g.docente);
  const marca = (letra) => (g.dias.includes(letra) ? 'SI' : null);
  return ['Veracruz', periodoEtiqueta, 'Preparatoria', g.clave, g.nombre, g.crn, g.grupo, g.modalidad, nomina(d.n), nombreExcel(d),
    marca('L'), marca('M'), marca('X'), marca('J'), marca('V'), g.inicio, g.fin];
}

const ENC_OPINA_V2 = [
  'DWH_Periodo', 'Plan', 'CRN', 'Clave de grupo', 'Nombre de la materia', 'Profesor', 'Nómina', 'Campus grupo', 'Formato',
  '¿Recomendarías a un compañero tomar clase con este profesor?',
  'Mi profesor demuestra conocimiento de la materia', 'Mi profesor me plantea retos', 'Mi profesor fomenta la colaboración',
  'Mi profesor genera un ambiente de confianza', 'Mi profesor me inspira',
  '¿Deseas compartir algún comentario adicional sobre tu profesor?',
];

/** Respuestas OPINA (v2) repartidas entre los grupos del docente; el % de "Sí" sale de OPINA. */
function filasOpina(gruposEne) {
  const filas = [];
  for (const [n, [total, pct]] of Object.entries(OPINA)) {
    const d = DOCENTES.find((x) => x.n === Number(n));
    const suyos = gruposEne.filter((g) => g.docente === d.n);
    if (!suyos.length) continue;
    const si = Math.round((total * pct) / 100);
    for (let i = 0; i < total; i++) {
      const g = suyos[i % suyos.length];
      const rec = i < si ? 'Sí' : 'No';
      const plan = g.modalidad === 'Bachillerato Intercultural' ? 'Bachillerato General Bilingüe' : 'Bachillerato General';
      filas.push(['2026 Ene - May', plan, g.crn, `Veracruz_${g.clave}_${g.grupo}`, g.nombre, nombreExcel(d), nomina(d.n),
        'Veracruz', 'Presencial', rec, 'Sí', i % 3 ? 'Sí' : 'No estoy seguro', 'Sí', rec === 'Sí' ? 'Sí' : 'No', rec,
        rec === 'No' && i % 2 ? 'Comentario de ejemplo' : null]);
    }
  }
  // Filas que el importador descarta (en línea y otro campus) para mostrar los descartes
  const g = gruposEne[0];
  filas.push(['2026 Ene - May', 'Bachillerato General', g.crn, 'x', g.nombre, 'Demo  Otro campus', 'L09999998', 'Monterrey', 'Presencial', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', null]);
  filas.push(['2026 Ene - May', 'Bachillerato General', g.crn, 'x', g.nombre, 'Demo  En línea', 'L09999999', 'Veracruz', 'En línea', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', null]);
  return filas;
}

function libro(hojas) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Los Excel ficticios de entrada (también se guardan en data/demo/ para importarlos en vivo). */
function generarArchivos() {
  const ene = armarGrupos('2026 Ene - May', 'ene', 15000, 600);
  const ago = armarGrupos('2026 Ago - Dic', 'ago', 16000, 610);
  // Un CRN con DOS sesiones el mismo día (miércoles 13:30 y 15:00), para el caso de la 2ª sesión
  const d4 = DOCENTES.find((x) => x.n === 4);
  const extra = { docente: 4, crn: '16999', clave: 'BSHU1002', nombre: 'Historia Universal', grupo: '699', modalidad: 'Teórica', dias: 'X' };
  ago.filas.push(filaGrupo('2026 Ago - Dic', { ...extra, inicio: '17:00', fin: '18:29' }));
  ago.filas.push(filaGrupo('2026 Ago - Dic', { ...extra, inicio: '18:30', fin: '19:59' }));
  ago.grupos.push({ ...extra, inicio: '17:00', fin: '18:29' });
  // Grupos en línea (F61/F62): el importador los omite
  ago.filas.push(['Veracruz', '2026 Ago - Dic', 'Preparatoria', 'BSXX9001', 'Curso en línea', '22023', 'F61', 'Teórica', nomina(d4.n), nombreExcel(d4), 'SI', null, null, null, null, '19:00', '20:29']);

  // Contratos: todos menos un CRN de las docentes 15 y 19 (sin faltas), para mostrar el aviso "sin contrato"
  const sinContrato = new Set([15, 19].map((n) => ago.grupos.find((g) => g.docente === n).crn));
  const contratos = ago.grupos.filter((g) => !sinContrato.has(g.crn))
    .map((g, i) => [g.crn, String(5600000 + i * 7), nomina(g.docente)]);

  return {
    gruposEne: { nombre: 'grupos_ENE-MAY_2026.xlsx', buffer: libro({ Salida: [ENC_GRUPOS, ...ene.filas] }), grupos: ene.grupos },
    gruposAgo: { nombre: 'grupos_AGO-DIC_2026.xlsx', buffer: libro({ Salida: [ENC_GRUPOS, ...ago.filas] }), grupos: ago.grupos },
    opina: { nombre: 'opina_ENE-MAY_2026.xlsx', buffer: libro({ H: [ENC_OPINA_V2, ...filasOpina(ene.grupos)] }) },
    contratos: { nombre: 'contratos_AGO-DIC_2026.xlsx', buffer: libro({ Contratos: [['CRN', 'Contrato', 'Nómina'], ...contratos] }), sinContrato: [...sinContrato] },
  };
}

// --------------------------------------------------------------- carga

function idDe(db, n) {
  return db.prepare('SELECT id FROM docentes WHERE nomina = ?').pluck().get(nomina(n));
}

/** Llena una BD ya migrada y sembrada. Devuelve un resumen de lo que se cargó. */
function poblar(db, archivos = generarArchivos()) {
  const gruposService = require('../services/gruposService');
  const opinaService = require('../services/opinaService');
  const contratosService = require('../services/contratosService');
  const bajaService = require('../services/bajaService');
  const faltasService = require('../services/faltasService');
  const disponiblesService = require('../services/disponiblesService');
  const suplenciaService = require('../services/suplenciaService');

  const importar = (servicio, archivo, extra = {}) =>
    servicio.confirm(db, { previewId: servicio.preview(db, { buffer: archivo.buffer, nombre: archivo.nombre }).previewId, ...extra });

  // 1) Semestre anterior y OPINA, después el semestre actual y sus contratos
  importar(gruposService, archivos.gruposEne);
  importar(opinaService, archivos.opina);
  importar(gruposService, archivos.gruposAgo);
  const actual = db.prepare("SELECT id FROM periodos WHERE clave = 'AGO-DIC 2026'").pluck().get();
  const c = contratosService.preview(db, { buffer: archivos.contratos.buffer, nombre: archivos.contratos.nombre }, actual);
  contratosService.confirm(db, { previewId: c.previewId });

  // 2) Lo que la coordinadora captura a mano: CURP, perfil, títulos e idiomas
  const curp = require('../lib/curp');
  const titulo = db.prepare("INSERT INTO titulos_docente (docente_id, grado, institucion, estatus, origen) VALUES (?, ?, 'Universidad Ficticia del Golfo', ?, 'manual')");
  for (const d of DOCENTES) {
    const id = idDe(db, d.n);
    const c18 = d.sinCurp ? null : curpFicticia(d);
    const der = c18 ? curp.derivar(c18) : null;
    db.prepare(`UPDATE docentes SET curp = ?, fecha_nacimiento = ?, genero = ?, campo_formacion = ?, trabajo_externo = ?,
                primer_semestre_texto = ?, correo_institucional = ?, datos_adicionales = ? WHERE id = ?`)
      .run(c18, der?.fechaNacimiento ?? null, der?.genero ?? null, d.campo, d.ext ?? null, d.desde ?? null,
        `docente${String(d.n).padStart(2, '0')}@demo.sidi.local`, JSON.stringify(d.idiomas ? { idiomas: d.idiomas } : {}), id);
    for (const [grado, estatus = 'Titulado'] of d.tit) titulo.run(id, grado, estatus);
  }

  // 3) Bajas: con historial, una recontratable, una no recontratable y una reactivada
  const ene = db.prepare("SELECT id FROM periodos WHERE clave = 'ENE-MAY 2026'").pluck().get();
  const bajas = {
    baja_recontratable: { motivo: 'Sin disponibilidad de horario', observaciones: 'Cambio de turno en su otro empleo (demo).', recontratable: true },
    baja_no_recontratable: { motivo: 'No cumplió expectativas', observaciones: 'Faltas frecuentes sin aviso (demo).', recontratable: false },
    reactivado: { motivo: 'Renuncia', observaciones: 'Se fue un semestre y regresó (demo).', recontratable: true },
  };
  for (const d of DOCENTES.filter((x) => bajas[x.est])) {
    bajaService.registrarBaja(db, idDe(db, d.n), bajas[d.est], ene);
    if (d.est === 'reactivado') bajaService.reactivar(db, idDe(db, d.n), {});
  }

  // 4) Faltas pendientes (Q22: 1–15 de noviembre de 2026), con el servicio real de faltas
  const faltas = [];
  const conClaseEl = (n, letra) => archivos.gruposAgo.grupos.some((g) => g.docente === n && g.dias.includes(letra));
  const dia = { L: '2026-11-09', M: '2026-11-10', X: '2026-11-11', J: '2026-11-12', V: '2026-11-13' };
  const registrar = (n, letra, extra) => {
    if (!conClaseEl(n, letra)) return;
    faltas.push(...faltasService.crear(db, { docenteId: idDe(db, n), fechas: [dia[letra]], motivo: 'Falta por asunto personal', ...extra }).faltas);
  };
  registrar(1, 'L', { observaciones: 'Trámite personal (demo).' });
  registrar(1, 'J', { observaciones: 'Trámite personal (demo).' }); // mismo CRN dos días → suplencia agrupada
  registrar(11, 'L', {}); // English II: 5 h en inglés → otra tarifa ($106)
  registrar(5, 'J', { justificacion: 'incapacidad_imss', folioImss: 'DEMO0001' });
  registrar(12, 'V', { justificacion: 'cita_imss', folioImss: 'DEMO0002' });
  registrar(4, 'X', {});

  // 5) Suplencias con los servicios reales (HU-22 disponibles + HU-10 suplencias): generan sus incidencias
  const faltasDe = (n) => db.prepare('SELECT id, asignatura_id, fecha FROM faltas WHERE docente_id = ? ORDER BY fecha, id').all(idDe(db, n));
  const libresPara = (n, f) => disponiblesService
    .disponibles(db, { docenteId: idDe(db, n), fechas: [f.fecha], asignaturaIds: [f.asignatura_id] })
    .gruposASuplir.flatMap((g) => g.disponibles.filter((x) => !x.empalme && x.recontratable !== 0).map((x) => x.docenteId));
  const suplir = (f, docenteSuplenteId) => suplenciaService.asignar(db, f.id, { docenteSuplenteId });
  // a) El mismo suplente cubre el mismo CRN lunes y jueves → una sola incidencia de 2 días (agrupación)
  const delTitular = faltasDe(1);
  const crnDosDias = delTitular.find((f) => delTitular.filter((x) => x.asignatura_id === f.asignatura_id).length === 2);
  if (crnDosDias) {
    const dias = delTitular.filter((x) => x.asignatura_id === crnDosDias.asignatura_id);
    const comunes = libresPara(1, dias[0]).filter((id) => libresPara(1, dias[1]).includes(id));
    if (comunes.length) dias.forEach((f) => suplir(f, comunes[0]));
  }
  // b) Falta IMSS: al titular no se le descuenta, pero el suplente sí cobra la tarifa del día
  const imss = faltasDe(5)[0];
  if (imss) {
    const libres = libresPara(5, imss);
    if (libres.length) suplir(imss, libres[0]);
  }

  // 6) Un pago adicional manual pendiente (hoja Incidencia); CeCo de la cuenta académica del catálogo
  db.prepare(`INSERT INTO incidencias (docente_id, num_contrato, cc_nomina, motivo, detalle, ceco, importe_total, origen)
              VALUES (?, '5600091', 'Sueldo Carga Académica', 'BB_Tutoreo (Preparatoria).',
                      'Tutoreo de grupo 611, noviembre 2026 (demo).', '5420103000', 1500, 'manual')`).run(idDe(db, 8));

  return {
    docentes: DOCENTES.length,
    gruposActual: db.prepare('SELECT COUNT(*) FROM asignaturas WHERE periodo_id = ?').pluck().get(actual),
    respuestasOpina: db.prepare('SELECT COUNT(*) FROM opina_respuestas').pluck().get(),
    bajas: db.prepare('SELECT COUNT(*) FROM docente_bajas').pluck().get(),
    faltas: faltas.length,
    suplencias: db.prepare('SELECT COUNT(*) FROM suplencias').pluck().get(),
    sinContrato: archivos.contratos.sinContrato,
  };
}

// --------------------------------------------------------------- línea de comandos

function main() {
  const reiniciar = process.argv.includes('--reiniciar');
  const destino = path.resolve(DEMO_DB);
  if (path.basename(destino) === 'app.db') throw new Error('La demo nunca se escribe en data/app.db.');
  if (fs.existsSync(destino)) {
    if (!reiniciar) {
      console.log(`Ya existe ${path.relative(RAIZ, destino)}. Usa --reiniciar para borrarla y crearla de nuevo.`);
      return;
    }
    for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(destino + sufijo, { force: true });
  }
  process.env.DB_PATH = destino; // antes de cargar lib/db: así abre la demo y no data/app.db
  const db = require('../lib/db');
  const archivos = generarArchivos();
  let r;
  try {
    r = db.transaction(() => poblar(db, archivos))();
  } catch (e) {
    db.close(); // si algo falla no queda una demo a medias
    for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(destino + sufijo, { force: true });
    throw e;
  }

  fs.mkdirSync(DEMO_DIR, { recursive: true });
  for (const a of [archivos.gruposEne, archivos.gruposAgo, archivos.opina, archivos.contratos]) {
    fs.writeFileSync(path.join(DEMO_DIR, a.nombre), a.buffer);
  }
  db.close();
  console.log(`Demo lista en ${path.relative(RAIZ, destino)}:`);
  console.log(`  ${r.docentes} docentes, ${r.gruposActual} grupos en AGO-DIC 2026, ${r.respuestasOpina} respuestas OPINA, ${r.bajas} bajas, ${r.faltas} faltas pendientes, ${r.suplencias} suplencias.`);
  console.log(`  CRN sin contrato (para el aviso): ${r.sinContrato.join(', ')}`);
  console.log(`  Excel ficticios para importar en vivo: ${path.relative(RAIZ, DEMO_DIR)}/`);
  console.log('Abrir la app con la demo (PowerShell):  $env:DB_PATH="data/demo.db"; npm start');
}

if (require.main === module) main();

module.exports = { DOCENTES, MATERIAS, generarArchivos, poblar, curpFicticia, nomina };
