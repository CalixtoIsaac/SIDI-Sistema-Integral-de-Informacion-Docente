/**
 * CV FICTICIOS en el formato "A1 CURRICULUM VITAE DOCENTES" (07 §7.1) para las pruebas.
 * Ningún dato es de una persona real.
 */
const { PDFDocument, StandardFonts } = require('pdf-lib');

const TEXTO_CV = [
  'A1 CURRICULUM VITAE DOCENTES',
  '1. DATOS GENERALES',
  '1.1 Datos personales',
  'Nombre: María López Ruiz',
  'Fecha de nacimiento: 8 de febrero de 1995',
  'Nacionalidad: Mexicana',
  'Estado civil: Soltera',
  'CURP: LORM950208MVZPZR00',
  'RFC: LORM950208XX1',
  'Domicilio: Calle Ficticia 123, Veracruz',
  'Teléfono: 2290000000',
  'Lugar laboral actual: Despacho Contable Ejemplo',
  'Correo personal: maria@example.com',
  'Correo institucional: maria.lopez@example.edu.mx',
  '1.2 Formación académica',
  '1.2.1 Formación académica (Licenciatura)',
  'Institución: Universidad Ficticia de Veracruz',
  'Ciudad: Veracruz',
  'Periodo: 2013-2017',
  'Estatus: Titulado',
  'Cédula: 12345678',
  '1.2.2 Formación académica (Especialidad con Diploma –Posgrado)',
  'Institución:',
  'Periodo:',
  'Estatus:',
  '1.2.3 Formación académica (Maestría)',
  'Institución:',
  'Instituto Ejemplo',
  'Periodo: 2025 a la fecha',
  'Estatus: Estudios en curso',
  '1.2.4 Formación académica (Doctorado)',
  'Institución:',
  '1.3 Cursos',
  '1.3.1 Curso',
  'Nombre del curso: Diseño instruccional',
  'Institución: Plataforma Ejemplo',
  'Horas: 40',
  '1.4 Idiomas',
  'Idioma: Inglés',
  'Grado de dominio: Avanzado',
  'Idioma: Francés',
  'Grado de dominio: Básico',
  '2. Experiencia docente',
  'Institución: Universidad Tecmilenio',
  'Asignatura: Matemáticas',
  'Periodo: Agosto 2022 a la fecha',
  'Institución: Colegio Ejemplo',
  'Periodo: Enero 2019',
  '3. Experiencia académico-administrativa',
  'Cargo: Coordinadora',
].join('\n');

/** PDF de 4 páginas: el CV en las 3 primeras (cortado en partes) y un "comprobante" al final. */
async function pdfCv(texto = TEXTO_CV) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const lineas = texto.split('\n');
  const porPagina = Math.ceil(lineas.length / 3);
  for (let p = 0; p < 3; p++) {
    const pagina = doc.addPage([612, 1200]);
    lineas.slice(p * porPagina, (p + 1) * porPagina).forEach((l, i) => {
      pagina.drawText(l, { x: 40, y: 1160 - i * 18, size: 11, font: fuente });
    });
  }
  doc.addPage().drawText('COMPROBANTE ESCANEADO', { x: 40, y: 700, size: 11, font: fuente });
  return Buffer.from(await doc.save());
}


/**
 * Mismo formato, pero como lo entrega pdf-parse con el PDF institucional real: etiquetas partidas en
 * varios renglones, etiquetas sin dos puntos, cursos sin "Nombre del Curso" y experiencia en el apartado 3.
 * Datos ficticios.
 */
const TEXTO_CV_REAL = [
  'A1 CURRICULUM VITAE DOCENTES',
  '1.1 Datos personales.',
  'Nombre : Pedro Ejemplo Ficticio',
  'Fecha de nacimiento: 12 de marzo de 1990',
  'Nacionalidad.: Mexicana',
  'CURP: LORM950208MVZPZR00',
  'Lugar laboral actual: Universidad Tec Milenio',
  'Correo electrónico',
  'institucional:',
  'pedro.ejemplo@example.edu.mx',
  '1.2.1 Formación académica. (Licenciatura)',
  'Nombre de la institución: Instituto Ficticio de Veracruz',
  'Ciudad y país: Veracruz, México',
  'Periodo de inicio y',
  'término:',
  '2008-2013',
  'Titulado, pasante,',
  'estudios sin concluir o',
  'título en trámite:',
  'Titulo',
  'Número de cédula: 1234567',
  '1.2.2 Formación académica. (Especialidad con Diploma –Posgrado)',
  'Nombre de la institución: Universidad Ejemplo',
  'Periodo de inicio y',
  'término:',
  '2015 a la fecha',
  'Titulado, pasante,',
  'estudios sin concluir o',
  'título en trámite:',
  'Cursando',
  '1.3.1 Cursos de especialización, capacitación o actualización con valor curricular.',
  'Nombre del Curso Manejo de la didáctica en un aula',
  'invertida',
  'Institución que lo',
  'impartió',
  'Plataforma Ejemplo',
  'Lugar : Online',
  'Fecha: 27/2/2015',
  'Número de horas',
  'académicas',
  '8.00',
  'Evaluación por competencias',
  'Institución que lo impartió Universidad Tecmilenio',
  'Fecha: 5 agosto 2019',
  'Número de horas',
  'académicas 100',
  '1.4 Idiomas',
  'Idioma: Inglés',
  'Grado de dominio: 80 %',
  'Idioma:',
  '2. Experiencia docente. Indicar las cátedras impartidas en este ciclo:',
  'Institución: Universidad Tec Milenio',
  'Nombre de la Asignatura',
  'impartida:',
  'Química I',
  'Lectura y redacción',
  '3. Experiencia profesional.',
  'Nombramiento o cargo',
  'desempeñado: Instructor capacitador',
  'Institución Despacho Ejemplo',
  'Periodo: De agosto 2017 a la fecha vigente',
  'Nombramiento o cargo',
  'desempeñado: Jefe de almacén',
  'Institución: Comercial Ejemplo',
  'Periodo: Enero- Diciembre 2018',
  '4. Investigación:',
].join('\n');

module.exports = { TEXTO_CV, TEXTO_CV_REAL, pdfCv };
