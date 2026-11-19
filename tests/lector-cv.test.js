const test = require('node:test');
const assert = require('node:assert/strict');
const lector = require('../lib/cv/lector');
const fechas = require('../lib/cv/fechas');
const { TEXTO_CV, TEXTO_CV_REAL, pdfCv } = require('./helpers/cv');

test('fechas libres del CV', () => {
  const hoy = new Date(2026, 10, 11);
  assert.equal(fechas.interpretar('08/02/1995', hoy), '1995-02-08');
  assert.equal(fechas.interpretar('8/2/95', hoy), '1995-02-08');
  assert.equal(fechas.interpretar('12 de marzo de 1990', hoy), '1990-03-12');
  assert.equal(fechas.interpretar('Marzo 12, 1990', hoy), '1990-03-12');
  assert.equal(fechas.interpretar('12 MZO 1990', hoy), '1990-03-12');
  assert.equal(fechas.interpretar('1990-03-12', hoy), '1990-03-12');
  assert.equal(fechas.interpretar('31/02/1990', hoy), null);
  assert.equal(fechas.interpretar('sin fecha', hoy), null);
  assert.deepEqual(fechas.mesAnio('Agosto 2017 a la fecha'), { anio: 2017, mes: 8 });
});

test('leerTexto: datos personales, CURP y conflicto de fecha', () => {
  const p = lector.leerTexto(TEXTO_CV.replace('8 de febrero de 1995', '09/02/1995'), { archivo: 'López Ruiz  María.pdf' });
  assert.deepEqual(
    [p.nombre, p.curp, p.fechaNacimiento, p.fechaNacimientoCv, p.genero, p.trabajoExterno, p.correoInstitucional],
    ['María López Ruiz', 'LORM950208MVZPZR00', '1995-02-08', '1995-02-09', 'F', 'Despacho Contable Ejemplo', 'maria.lopez@example.edu.mx'],
  );
  assert.deepEqual(p.conflictos, [{ campo: 'fechaNacimiento', cv: '1995-02-09', curp: '1995-02-08' }]);
  assert.equal(p.confianza.curp, 'alta');
});

test('leerTexto: títulos (salta los vacíos), cursos, idiomas y primer semestre', () => {
  const p = lector.leerTexto(TEXTO_CV);
  assert.deepEqual(p.titulos, [
    { grado: 'Licenciatura', nombreTitulo: null, institucion: 'Universidad Ficticia de Veracruz', periodoTexto: '2013-2017', estatus: 'Titulado', cedula: '12345678' },
    { grado: 'Maestría', nombreTitulo: null, institucion: 'Instituto Ejemplo', periodoTexto: '2025 a la fecha', estatus: 'Estudios en curso', cedula: null },
  ]);
  assert.deepEqual(p.confianza.titulos, ['alta', 'alta']);
  assert.deepEqual(p.cursos, ['Diseño instruccional (Plataforma Ejemplo, 40)']);
  assert.deepEqual(p.idiomas, ['Inglés (Avanzado)', 'Francés (Básico)']);
  assert.equal(p.primerSemestre, 'AGO-DIC 2022');
  assert.deepEqual(p.conflictos, []);
});

test('leerTexto: lugar laboral en Tecmilenio no es trabajo externo; nombre desde el archivo', () => {
  const sinNombre = TEXTO_CV.replace('Nombre: María López Ruiz\n', '').replace('Despacho Contable Ejemplo', 'Universidad Tecmilenio');
  const p = lector.leerTexto(sinNombre, { archivo: 'López Ruiz  María.pdf' });
  assert.equal(p.trabajoExterno, null);
  assert.equal(p.nombre, 'María López Ruiz');
  assert.equal(p.confianza.nombre, 'baja');
});

test('leerTexto: CURP con dígito verificador incorrecto se propone con confianza baja', () => {
  const p = lector.leerTexto(TEXTO_CV.replace('LORM950208MVZPZR00', 'LORM950208MVZPZR09'));
  assert.deepEqual([p.curp, p.confianza.curp], ['LORM950208MVZPZR09', 'baja']);
});

test('leerPdf: lee las páginas con texto de un PDF real', async () => {
  const p = await lector.leerPdf(await pdfCv(), { archivo: 'cv.pdf' });
  assert.equal(p.curp, 'LORM950208MVZPZR00');
  assert.equal(p.titulos.length, 2);
  assert.equal(p.paginas, 4);
  assert.deepEqual(p.idiomas, ['Inglés (Avanzado)', 'Francés (Básico)']);
});

test('leerPdf: PDF sin el formato del CV o sin texto → CvNoLegible', async () => {
  await assert.rejects(lector.leerPdf(await pdfCv('Factura\nTotal: 100\nGracias por su compra, vuelva pronto, atentamente la tienda')), { name: 'CvNoLegible' });
  await assert.rejects(lector.leerPdf(await pdfCv(' ')), { name: 'CvNoLegible' });
  await assert.rejects(lector.leerPdf(Buffer.from('no es pdf')), { name: 'CvNoLegible' });
});

test('formato real: etiquetas partidas en renglones, grado del encabezado y "Titulo" = Titulado', () => {
  const p = lector.leerTexto(TEXTO_CV_REAL);
  assert.equal(p.nombre, 'Pedro Ejemplo Ficticio');
  assert.equal(p.correoInstitucional, 'pedro.ejemplo@example.edu.mx');
  assert.deepEqual(p.titulos, [
    { grado: 'Licenciatura', nombreTitulo: null, institucion: 'Instituto Ficticio de Veracruz', periodoTexto: '2008-2013', estatus: 'Titulado', cedula: '1234567' },
    { grado: 'Especialidad', nombreTitulo: null, institucion: 'Universidad Ejemplo', periodoTexto: '2015 a la fecha', estatus: 'Estudios en curso', cedula: null },
  ]);
});

test('formato real: cursos con y sin "Nombre del Curso", nombres en dos renglones e idioma vacío', () => {
  const p = lector.leerTexto(TEXTO_CV_REAL);
  assert.deepEqual(p.cursos, [
    'Manejo de la didáctica en un aula invertida (Plataforma Ejemplo, 27/2/2015, 8)',
    'Evaluación por competencias (Universidad Tecmilenio, 5 agosto 2019, 100)',
  ]);
  assert.deepEqual(p.idiomas, ['Inglés (80 %)']);
});

test('formato real: "Universidad Tec Milenio" no es trabajo externo; experiencia con "a la fecha" = vigente', () => {
  const p = lector.leerTexto(TEXTO_CV_REAL);
  assert.equal(p.trabajoExterno, null);
  assert.deepEqual(p.experiencia, [
    { institucion: 'Universidad Tec Milenio', cargo: null, asignaturas: ['Química I', 'Lectura y redacción'], periodo: null, vigente: false },
    { institucion: 'Despacho Ejemplo', cargo: 'Instructor capacitador', asignaturas: [], periodo: 'De agosto 2017 a la fecha vigente', vigente: true },
    { institucion: 'Comercial Ejemplo', cargo: 'Jefe de almacén', asignaturas: [], periodo: 'Enero- Diciembre 2018', vigente: false },
  ]);
});
